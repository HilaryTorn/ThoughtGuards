"""
Result aggregation from multiple judges.
"""

from datetime import datetime
from typing import Dict, Any

from .config import AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD
from .judges import extract_patterns_from_result
from .agreement import (
    find_best_pattern_matches,
    calculate_agreement_metrics,
    analyze_axis_disagreement,
    get_pattern_ids
)
from .confidence import calculate_final_confidence


def aggregate_evaluations(result1: dict, result2: dict) -> dict:
    """
    Aggregate results from two judges into a single evaluation.
    
    Combines patterns from both judges with:
    - Pattern matching and similarity scoring
    - Confidence recalculation based on agreement
    - Detailed metadata about judge agreement
    
    Args:
        result1: Result from judge 1
        result2: Result from judge 2
        
    Returns:
        Aggregated result dictionary
    """
    conv_id = result1.get("conversation_id", result2.get("conversation_id", "unknown"))

    # Extract patterns from both judges
    patterns1 = extract_patterns_from_result(result1)
    patterns2 = extract_patterns_from_result(result2)

    # Find matches using weighted similarity
    matches = find_best_pattern_matches(patterns1, patterns2)
    agreement_metrics = calculate_agreement_metrics(matches)
    
    # Build aggregated patterns
    aggregated_patterns = _build_aggregated_patterns(matches)
    
    # Get pattern IDs for legacy compatibility
    pattern_ids1 = get_pattern_ids(patterns1)
    pattern_ids2 = get_pattern_ids(patterns2)

    # Build final output
    return {
        "conversation_id": conv_id,
        "manipulation_evaluations": [
            {
                "evaluator_id": "llm-judge-aggregated",
                "evaluator_type": "model",
                "model_name": f"{result1.get('_model', 'unknown')}+{result2.get('_model', 'unknown')}",
                "created_at": datetime.now().isoformat(),
                "patterns": aggregated_patterns,
                "notes": _build_aggregation_notes(agreement_metrics)
            }
        ],
        "_meta": _build_metadata(
            result1, result2, agreement_metrics, pattern_ids1, pattern_ids2
        ),
        # Keep individual results for reference
        "_judge_1_result": result1,
        "_judge_2_result": result2,
    }


def _build_aggregated_patterns(matches: list) -> list:
    """
    Build aggregated patterns from matches.
    
    Args:
        matches: List of pattern match dictionaries
        
    Returns:
        List of aggregated pattern dictionaries
    """
    aggregated_patterns = []
    
    for match in matches:
        p1 = match["pattern_1"]
        p2 = match["pattern_2"]
        sim = match["similarity"]
        match_type = match["match_type"]
        
        # Calculate confidence using multi-factor approach
        conf_result = calculate_final_confidence(p1, p2, match_type, sim)
        
        if match_type == "exact":
            pattern = _handle_exact_match(p1, p2, conf_result)
        elif match_type == "partial":
            pattern = _handle_partial_match(p1, p2, sim, conf_result)
        elif match_type == "unmatched_j1":
            pattern = _handle_single_judge(p1, "judge_1", conf_result)
        else:  # unmatched_j2
            pattern = _handle_single_judge(p2, "judge_2", conf_result)
        
        aggregated_patterns.append(pattern)
    
    return aggregated_patterns


def _handle_exact_match(p1: dict, p2: dict, conf_result: dict) -> dict:
    """Handle exact match between judges."""
    # Choose pattern from judge with higher confidence
    chosen = p1.copy() if p1.get("confidence", 0) >= p2.get("confidence", 0) else p2.copy()
    
    chosen["confidence"] = conf_result["final_confidence"]
    chosen["_match_type"] = "exact"
    chosen["_matched_with"] = (
        p2.get("triad_pattern_id") if p1.get("confidence", 0) >= p2.get("confidence", 0)
        else p1.get("triad_pattern_id")
    )
    chosen["_confidence_breakdown"] = conf_result
    
    return chosen


def _handle_partial_match(p1: dict, p2: dict, similarity: float, conf_result: dict) -> dict:
    """Handle partial match between judges."""
    # Choose pattern from judge with higher confidence
    chosen = p1.copy() if p1.get("confidence", 0) >= p2.get("confidence", 0) else p2.copy()
    
    chosen["confidence"] = conf_result["final_confidence"]
    chosen["_match_type"] = "partial"
    chosen["_similarity"] = similarity
    chosen["_matched_with"] = (
        p2.get("triad_pattern_id") if p1.get("confidence", 0) >= p2.get("confidence", 0)
        else p1.get("triad_pattern_id")
    )
    chosen["_confidence_breakdown"] = conf_result
    
    # Include disagreement details
    chosen["_axis_disagreement"] = analyze_axis_disagreement(p1, p2)
    
    return chosen


def _handle_single_judge(pattern: dict, judge_id: str, conf_result: dict) -> dict:
    """Handle pattern detected by only one judge."""
    modified = pattern.copy()
    modified["confidence"] = conf_result["final_confidence"]
    modified["_match_type"] = "single_judge"
    modified["_detected_by"] = judge_id
    modified["_confidence_breakdown"] = conf_result
    
    return modified


def _build_aggregation_notes(agreement_metrics: dict) -> str:
    """Build notes string for aggregated evaluation."""
    agreement_type = agreement_metrics["agreement_type"]
    agreement_rate = agreement_metrics["agreement_rate"]
    
    return f"Aggregated from 2 judges. Agreement: {agreement_type} ({agreement_rate:.1%})"


def _build_metadata(
    result1: dict,
    result2: dict,
    agreement_metrics: dict,
    pattern_ids1: list,
    pattern_ids2: list
) -> Dict[str, Any]:
    """
    Build metadata dictionary for aggregated result.
    
    Args:
        result1: Result from judge 1
        result2: Result from judge 2
        agreement_metrics: Agreement metrics dictionary
        pattern_ids1: Pattern IDs from judge 1
        pattern_ids2: Pattern IDs from judge 2
        
    Returns:
        Metadata dictionary
    """
    return {
        "judge_1_model": result1.get("_model"),
        "judge_2_model": result2.get("_model"),
        "judge_1_tokens": result1.get("_tokens_used", 0),
        "judge_2_tokens": result2.get("_tokens_used", 0),
        # Agreement metrics
        "agreement_type": agreement_metrics["agreement_type"],
        "agreement_rate": agreement_metrics["agreement_rate"],
        "exact_matches": agreement_metrics["exact_matches"],
        "partial_matches": agreement_metrics["partial_matches"],
        "unmatched_j1": agreement_metrics["unmatched_j1"],
        "unmatched_j2": agreement_metrics["unmatched_j2"],
        "mean_similarity": agreement_metrics["mean_similarity"],
        # Pattern lists
        "patterns_judge_1": pattern_ids1,
        "patterns_judge_2": pattern_ids2,
        # Config used
        "axis_weights": AXIS_WEIGHTS,
        "partial_match_threshold": PARTIAL_MATCH_THRESHOLD,
    }
