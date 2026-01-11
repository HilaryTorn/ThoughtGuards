"""
Pattern matching and agreement calculation between judges.
"""

import sys
from pathlib import Path
from typing import Dict, List, Any

# Handle both direct execution and module import
try:
    from .config import AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    from config import AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD


def calculate_pattern_similarity(
    labels1: Dict[str, str],
    labels2: Dict[str, str],
    weights: Dict[str, float] = None
) -> float:
    """
    Calculate weighted similarity between two pattern label dicts.

    Args:
        labels1: First pattern's labels {"TARGET": "T2", "HOW": "H3", "WHY": "W1"}
        labels2: Second pattern's labels
        weights: Axis weights (defaults to AXIS_WEIGHTS)

    Returns:
        Similarity score 0.0-1.0
    """
    if weights is None:
        weights = AXIS_WEIGHTS

    score = 0.0
    for axis, weight in weights.items():
        if labels1.get(axis) == labels2.get(axis):
            score += weight
    return score


def find_best_pattern_matches(
    patterns1: List[dict],
    patterns2: List[dict],
    threshold: float = None
) -> List[Dict[str, Any]]:
    """
    Match patterns across judges using weighted similarity scoring.
    Uses greedy matching: for each pattern in patterns1, finds best match in patterns2.

    Args:
        patterns1: Patterns from judge 1
        patterns2: Patterns from judge 2
        threshold: Minimum similarity to count as match (defaults to PARTIAL_MATCH_THRESHOLD)

    Returns:
        List of match records with structure:
        {
            "pattern_1": pattern or None,
            "pattern_2": pattern or None,
            "similarity": float,
            "match_type": "exact" | "partial" | "unmatched_j1" | "unmatched_j2"
        }
    """
    if threshold is None:
        threshold = PARTIAL_MATCH_THRESHOLD

    matches = []
    used_p2_indices = set()

    # For each pattern in judge 1, find best match in judge 2
    for p1 in patterns1:
        labels1 = p1.get("labels", {})
        best_match = None
        best_sim = 0.0
        best_idx = None

        for i, p2 in enumerate(patterns2):
            if i in used_p2_indices:
                continue

            labels2 = p2.get("labels", {})
            sim = calculate_pattern_similarity(labels1, labels2)

            if sim > best_sim:
                best_sim = sim
                best_match = p2
                best_idx = i

        if best_match and best_sim >= threshold:
            used_p2_indices.add(best_idx)
            match_type = "exact" if best_sim == 1.0 else "partial"
            matches.append({
                "pattern_1": p1,
                "pattern_2": best_match,
                "similarity": best_sim,
                "match_type": match_type,
            })
        else:
            # No match found above threshold
            matches.append({
                "pattern_1": p1,
                "pattern_2": None,
                "similarity": 0.0,
                "match_type": "unmatched_j1",
            })

    # Add unmatched patterns from judge 2
    for i, p2 in enumerate(patterns2):
        if i not in used_p2_indices:
            matches.append({
                "pattern_1": None,
                "pattern_2": p2,
                "similarity": 0.0,
                "match_type": "unmatched_j2",
            })

    return matches


def calculate_agreement_metrics(matches: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate agreement metrics from pattern matches.

    Returns:
        {
            "agreement_type": "both_clean" | "full" | "strong" | "partial" | "weak" | "none",
            "agreement_rate": float (0-1),
            "exact_matches": int,
            "partial_matches": int,
            "unmatched_j1": int,
            "unmatched_j2": int,
            "mean_similarity": float,
        }
    """
    if not matches:
        return {
            "agreement_type": "both_clean",
            "agreement_rate": 1.0,
            "exact_matches": 0,
            "partial_matches": 0,
            "unmatched_j1": 0,
            "unmatched_j2": 0,
            "mean_similarity": 1.0,
        }

    exact = sum(1 for m in matches if m["match_type"] == "exact")
    partial = sum(1 for m in matches if m["match_type"] == "partial")
    unmatched_j1 = sum(1 for m in matches if m["match_type"] == "unmatched_j1")
    unmatched_j2 = sum(1 for m in matches if m["match_type"] == "unmatched_j2")

    # Mean similarity across all matches (unmatched = 0)
    mean_sim = sum(m["similarity"] for m in matches) / len(matches)

    # Agreement rate: weighted average considering match quality
    # Exact matches count as 1.0, partial as their similarity, unmatched as 0
    total_patterns = len(matches)
    matched_score = exact + sum(m["similarity"] for m in matches if m["match_type"] == "partial")
    agreement_rate = matched_score / total_patterns if total_patterns > 0 else 1.0

    # Classify agreement type
    if exact == len(matches):
        agreement_type = "full"
    elif exact + partial == len(matches) and agreement_rate >= 0.8:
        agreement_type = "strong"
    elif exact + partial > 0 and agreement_rate >= 0.5:
        agreement_type = "partial"
    elif exact + partial > 0:
        agreement_type = "weak"
    else:
        agreement_type = "none"

    return {
        "agreement_type": agreement_type,
        "agreement_rate": round(agreement_rate, 3),
        "exact_matches": exact,
        "partial_matches": partial,
        "unmatched_j1": unmatched_j1,
        "unmatched_j2": unmatched_j2,
        "mean_similarity": round(mean_sim, 3),
    }