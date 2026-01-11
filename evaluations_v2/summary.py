"""
Summary statistics and reporting utilities.
"""

from datetime import datetime
from typing import List, Dict, Any

from .config import AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD


def build_summary(results: List[dict], judge_1_model: str, judge_2_model: str) -> dict:
    """
    Build summary statistics from results.
    
    Args:
        results: List of aggregated result dictionaries
        judge_1_model: Name of judge 1 model
        judge_2_model: Name of judge 2 model
        
    Returns:
        Summary statistics dictionary
    """
    pattern_counts = {"TARGET": {}, "HOW": {}, "WHY": {}}
    triad_counts = {}
    agreement_counts = {
        "full": 0, "strong": 0, "partial": 0, "weak": 0, "none": 0, "both_clean": 0
    }
    severity_sum = 0
    severity_count = 0
    total_tokens = 0
    
    # Track agreement details
    agreement_rates = []
    exact_match_counts = []
    partial_match_counts = []

    for result in results:
        meta = result.get("_meta", {})
        
        # Agreement distribution
        agreement_type = meta.get("agreement_type", "unknown")
        if agreement_type in agreement_counts:
            agreement_counts[agreement_type] += 1
        
        # Collect agreement metrics
        if "agreement_rate" in meta:
            agreement_rates.append(meta["agreement_rate"])
        if "exact_matches" in meta:
            exact_match_counts.append(meta["exact_matches"])
        if "partial_matches" in meta:
            partial_match_counts.append(meta["partial_matches"])

        # Token usage
        total_tokens += meta.get("judge_1_tokens", 0) + meta.get("judge_2_tokens", 0)

        # Pattern analysis
        for eval_item in result.get("manipulation_evaluations", []):
            for pattern in eval_item.get("patterns", []):
                # Count triads
                triad = pattern.get("triad_pattern_id", "")
                triad_counts[triad] = triad_counts.get(triad, 0) + 1

                # Count by axis
                labels = pattern.get("labels", {})
                for axis in ["TARGET", "HOW", "WHY"]:
                    code = labels.get(axis)
                    if code:
                        pattern_counts[axis][code] = pattern_counts[axis].get(code, 0) + 1

                # Severity
                sev = pattern.get("severity", 0)
                if sev:
                    severity_sum += sev
                    severity_count += 1

    return {
        "run_timestamp": datetime.now().isoformat(),
        "total_conversations": len(results),
        "judge_1_model": judge_1_model,
        "judge_2_model": judge_2_model,
        "total_tokens_used": total_tokens,
        "agreement_distribution": agreement_counts,
        "agreement_stats": {
            "mean_agreement_rate": (
                round(sum(agreement_rates) / len(agreement_rates), 3)
                if agreement_rates else None
            ),
            "total_exact_matches": sum(exact_match_counts),
            "total_partial_matches": sum(partial_match_counts),
        },
        "axis_weights_used": AXIS_WEIGHTS,
        "partial_match_threshold": PARTIAL_MATCH_THRESHOLD,
        "pattern_counts_by_axis": pattern_counts,
        "triad_pattern_counts": triad_counts,
        "avg_severity": severity_sum / severity_count if severity_count else 0,
        "conversations_with_patterns": sum(
            1 for r in results
            if any(e.get("patterns") for e in r.get("manipulation_evaluations", []))
        ),
    }


def print_summary(summary: dict):
    """
    Print summary to console.
    
    Args:
        summary: Summary statistics dictionary
    """
    print(f"\n{'='*60}")
    print(f"PIPELINE COMPLETE")
    print(f"{'='*60}")
    print(f"Processed: {summary['total_conversations']} conversations")
    print(f"With patterns: {summary['conversations_with_patterns']}")
    print(f"Total tokens: {summary['total_tokens_used']}")
    print(f"\nAgreement distribution: {summary['agreement_distribution']}")
    
    # Agreement stats
    stats = summary.get('agreement_stats', {})
    if stats.get('mean_agreement_rate') is not None:
        print(f"Mean agreement rate: {stats['mean_agreement_rate']:.1%}")
        print(f"Total exact matches: {stats['total_exact_matches']}, "
              f"partial: {stats['total_partial_matches']}")
    
    print(f"\nAxis weights used: {summary.get('axis_weights_used', 'N/A')}")
    print(f"Partial match threshold: {summary.get('partial_match_threshold', 'N/A')}")
    
    # Top patterns
    triad_counts = summary['triad_pattern_counts']
    top_triads = dict(sorted(triad_counts.items(), key=lambda x: -x[1])[:10])
    print(f"\nTOP Pattern triads: {top_triads}")
    
    # By axis
    print(f"\nBy axis:")
    for axis, counts in summary['pattern_counts_by_axis'].items():
        if counts:
            print(f"  {axis}: {counts}")


def format_pattern_summary(pattern: dict) -> str:
    """
    Format a single pattern for display.
    
    Args:
        pattern: Pattern dictionary
        
    Returns:
        Formatted string
    """
    triad = pattern.get("triad_pattern_id", "?")
    confidence = pattern.get("confidence", 0)
    severity = pattern.get("severity", 0)
    match_type = pattern.get("_match_type", "unknown")
    
    summary = f"{triad} (conf={confidence:.2f}, sev={severity}, match={match_type})"
    
    if match_type == "partial":
        sim = pattern.get("_similarity", 0)
        summary += f" sim={sim:.2f}"
    
    return summary


def print_conversation_result(result: dict, index: int, total: int):
    """
    Print result for a single conversation.
    
    Args:
        result: Result dictionary
        index: Current index (1-based)
        total: Total number of conversations
    """
    conv_id = result.get("conversation_id", "unknown")
    patterns = result.get("manipulation_evaluations", [{}])[0].get("patterns", [])
    agreement = result.get("_meta", {}).get("agreement_type", "?")
    
    print(f"\n[{index}/{total}] {conv_id}")
    
    if patterns:
        pattern_summaries = [format_pattern_summary(p) for p in patterns]
        print(f"  Patterns: {', '.join(pattern_summaries)}")
        print(f"  Agreement: {agreement}")
    else:
        print(f"  No manipulation detected | Agreement: {agreement}")
