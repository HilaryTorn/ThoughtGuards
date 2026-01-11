"""
Aggregation logic for combining results from multiple judges.
"""

import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

# Handle both direct execution and module import
try:
    from .config import AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD
    from .agreement import calculate_pattern_similarity
    from .confidence import calculate_evidence_score, calculate_confidence_alignment
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    from config import AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD
    from agreement import calculate_pattern_similarity
    from confidence import calculate_evidence_score, calculate_confidence_alignment


def extract_patterns_from_result(result: dict) -> List[dict]:
    """Extract all patterns from a judge result."""
    patterns = []
    for eval_item in result.get("manipulation_evaluations", []):
        for p in eval_item.get("patterns", []):
            # Tag pattern with source judge
            p_copy = p.copy()
            p_copy["_source_judge"] = result.get("_judge_id", result.get("_model", "unknown"))
            patterns.append(p_copy)
    return patterns


def find_pattern_cluster(
    pattern: dict,
    all_patterns: List[dict],
    used_indices: set,
    threshold: float = None
) -> List[tuple]:
    """
    Find all patterns that match the given pattern above threshold.
    Returns list of (index, pattern, similarity) tuples.
    """
    if threshold is None:
        threshold = PARTIAL_MATCH_THRESHOLD

    matches = []
    labels1 = pattern.get("labels", {})

    for i, p in enumerate(all_patterns):
        if i in used_indices:
            continue
        labels2 = p.get("labels", {})
        sim = calculate_pattern_similarity(labels1, labels2)
        if sim >= threshold:
            matches.append((i, p, sim))

    return matches


def aggregate_pattern_cluster(patterns: List[dict], similarities: List[float]) -> dict:
    """
    Aggregate a cluster of matching patterns from multiple judges.

    Args:
        patterns: List of patterns that matched
        similarities: Similarity scores for each pattern to the cluster centroid

    Returns:
        Aggregated pattern with confidence based on agreement
    """
    # Count UNIQUE judges, not total patterns
    unique_judges = set(p.get("_source_judge", "unknown") for p in patterns)
    n_judges = len(unique_judges)

    # Pick the pattern with highest confidence as base
    best_pattern = max(patterns, key=lambda p: p.get("confidence", 0))
    result = best_pattern.copy()

    # Calculate base confidence (average)
    confidences = [p.get("confidence", 0.5) for p in patterns]
    avg_confidence = sum(confidences) / len(confidences)

    # Agreement factor based on number of judges agreeing
    # 1 judge = 0.6, 2 = 0.85, 3 = 1.0, 4 = 1.15
    agreement_factors = {1: 0.6, 2: 0.85, 3: 1.0, 4: 1.15}
    agreement_factor = agreement_factors.get(n_judges, 1.0 + 0.05 * (n_judges - 3))

    # Similarity factor (average similarity in cluster)
    avg_similarity = sum(similarities) / len(similarities) if similarities else 1.0
    similarity_factor = 0.8 + 0.2 * avg_similarity

    # Evidence factor (combined quotes quality)
    evidence_scores = [calculate_evidence_score(p) for p in patterns]
    evidence_factor = sum(evidence_scores) / len(evidence_scores)

    # Calibration factor (confidence alignment)
    if n_judges >= 2:
        conf_diffs = []
        for i in range(len(confidences)):
            for j in range(i + 1, len(confidences)):
                conf_diffs.append(abs(confidences[i] - confidences[j]))
        avg_conf_diff = sum(conf_diffs) / len(conf_diffs) if conf_diffs else 0
        calibration_factor = calculate_confidence_alignment(
            max(confidences), min(confidences)
        )
    else:
        calibration_factor = 0.95

    # Final confidence
    raw_final = avg_confidence * agreement_factor * similarity_factor * evidence_factor * calibration_factor
    final_confidence = round(max(0.0, min(1.0, raw_final)), 3)

    result["confidence"] = final_confidence
    result["_n_judges_agreed"] = n_judges
    result["_agreeing_judges"] = list(unique_judges)
    result["_avg_similarity"] = round(avg_similarity, 3)
    result["_confidence_breakdown"] = {
        "base_confidence": round(avg_confidence, 3),
        "agreement_factor": round(agreement_factor, 3),
        "similarity_factor": round(similarity_factor, 3),
        "evidence_factor": round(evidence_factor, 3),
        "calibration_factor": round(calibration_factor, 3),
        "final_confidence": final_confidence,
    }

    # Collect all quotes from all patterns
    all_quotes = []
    for p in patterns:
        all_quotes.extend(p.get("quotes", []))
    # Deduplicate quotes by text
    seen_texts = set()
    unique_quotes = []
    for q in all_quotes:
        if q.get("text") not in seen_texts:
            seen_texts.add(q.get("text"))
            unique_quotes.append(q)
    result["quotes"] = unique_quotes

    return result


def aggregate_n_evaluations(results: List[dict]) -> dict:
    """
    Aggregate results from N judges into a single evaluation.

    Uses clustering: patterns that match across judges are grouped,
    confidence is boosted based on how many judges agree.
    """
    if not results:
        raise ValueError("No results to aggregate")

    conv_id = results[0].get("conversation_id", "unknown")

    # Collect all patterns from all judges
    all_patterns = []
    for result in results:
        all_patterns.extend(extract_patterns_from_result(result))

    if not all_patterns:
        # No patterns found by any judge
        return _build_empty_aggregation(results, conv_id)

    # Cluster patterns by similarity
    aggregated_patterns = []
    used_indices = set()

    for i, pattern in enumerate(all_patterns):
        if i in used_indices:
            continue

        # Find all matching patterns
        cluster_matches = find_pattern_cluster(pattern, all_patterns, used_indices)

        # Include current pattern in cluster
        cluster_patterns = [pattern]
        cluster_similarities = [1.0]  # Self-similarity
        used_indices.add(i)

        for idx, matched_pattern, sim in cluster_matches:
            cluster_patterns.append(matched_pattern)
            cluster_similarities.append(sim)
            used_indices.add(idx)

        # Aggregate cluster
        aggregated = aggregate_pattern_cluster(cluster_patterns, cluster_similarities)
        aggregated_patterns.append(aggregated)

    # Calculate overall agreement metrics
    n_judges = len(results)
    judge_ids = [r.get("_judge_id", r.get("_model", f"judge_{i}")) for i, r in enumerate(results)]

    # Agreement rate: what fraction of patterns have multi-judge support?
    multi_judge_patterns = sum(1 for p in aggregated_patterns if p.get("_n_judges_agreed", 1) > 1)
    agreement_rate = multi_judge_patterns / len(aggregated_patterns) if aggregated_patterns else 1.0

    # Determine agreement type
    avg_judges_per_pattern = sum(p.get("_n_judges_agreed", 1) for p in aggregated_patterns) / len(aggregated_patterns) if aggregated_patterns else 0
    if avg_judges_per_pattern >= n_judges * 0.9:
        agreement_type = "full"
    elif avg_judges_per_pattern >= n_judges * 0.7:
        agreement_type = "strong"
    elif avg_judges_per_pattern >= n_judges * 0.5:
        agreement_type = "partial"
    elif multi_judge_patterns > 0:
        agreement_type = "weak"
    else:
        agreement_type = "none"

    # Build output
    model_names = "+".join(r.get("_model", "?") for r in results)
    total_tokens = sum(r.get("_tokens_used", 0) for r in results)

    return {
        "conversation_id": conv_id,
        "manipulation_evaluations": [
            {
                "evaluator_id": "llm-judge-aggregated",
                "evaluator_type": "model",
                "model_name": model_names,
                "created_at": datetime.now().isoformat(),
                "patterns": aggregated_patterns,
                "notes": f"Aggregated from {n_judges} judges. Agreement: {agreement_type} ({agreement_rate:.1%})"
            }
        ],
        "_meta": {
            "n_judges": n_judges,
            "judges_used": judge_ids,
            "total_tokens": total_tokens,
            "agreement_type": agreement_type,
            "agreement_rate": round(agreement_rate, 3),
            "avg_judges_per_pattern": round(avg_judges_per_pattern, 2),
            "total_patterns_found": len(all_patterns),
            "aggregated_patterns": len(aggregated_patterns),
            "axis_weights": AXIS_WEIGHTS,
            "partial_match_threshold": PARTIAL_MATCH_THRESHOLD,
        },
        "_individual_results": {r.get("_judge_id", f"judge_{i}"): r for i, r in enumerate(results)},
    }


def _build_empty_aggregation(results: List[dict], conv_id: str) -> dict:
    """Build aggregation result when no patterns found."""
    n_judges = len(results)
    judge_ids = [r.get("_judge_id", r.get("_model", f"judge_{i}")) for i, r in enumerate(results)]
    model_names = "+".join(r.get("_model", "?") for r in results)
    total_tokens = sum(r.get("_tokens_used", 0) for r in results)

    return {
        "conversation_id": conv_id,
        "manipulation_evaluations": [
            {
                "evaluator_id": "llm-judge-aggregated",
                "evaluator_type": "model",
                "model_name": model_names,
                "created_at": datetime.now().isoformat(),
                "patterns": [],
                "notes": f"No manipulation detected by any of {n_judges} judges"
            }
        ],
        "_meta": {
            "n_judges": n_judges,
            "judges_used": judge_ids,
            "total_tokens": total_tokens,
            "agreement_type": "both_clean",
            "agreement_rate": 1.0,
            "avg_judges_per_pattern": 0,
            "total_patterns_found": 0,
            "aggregated_patterns": 0,
        },
        "_individual_results": {r.get("_judge_id", f"judge_{i}"): r for i, r in enumerate(results)},
    }


# Keep old function for backward compatibility
def aggregate_evaluations(result1: dict, result2: dict) -> dict:
    """Aggregate results from two judges (backward compatible wrapper)."""
    return aggregate_n_evaluations([result1, result2])