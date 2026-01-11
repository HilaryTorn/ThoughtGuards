"""
Summary generation for pipeline results.
"""

import sys
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any

# Handle both direct execution and module import
try:
    from .config import AVAILABLE_JUDGES, DEFAULT_JUDGES, AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD, OUTPUT_DIR
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    from config import AVAILABLE_JUDGES, DEFAULT_JUDGES, AXIS_WEIGHTS, PARTIAL_MATCH_THRESHOLD, OUTPUT_DIR


def build_summary(results: List[dict], judges: List[str] = None) -> dict:
    """Build summary statistics from results."""

    if judges is None:
        judges = DEFAULT_JUDGES

    pattern_counts = {"TARGET": {}, "HOW": {}, "WHY": {}}
    triad_counts = {}
    agreement_counts = {"full": 0, "strong": 0, "partial": 0, "weak": 0, "none": 0, "both_clean": 0}
    severity_counts = {}  # Numeric severity (1-5)
    severity_level_counts = {}  # String labels
    total_tokens = 0

    agreement_rates = []
    avg_judges_per_pattern_list = []

    for result in results:
        meta = result.get("_meta", {})
        agreement_type = meta.get("agreement_type", "unknown")
        if agreement_type in agreement_counts:
            agreement_counts[agreement_type] += 1

        if "agreement_rate" in meta:
            agreement_rates.append(meta["agreement_rate"])
        if "avg_judges_per_pattern" in meta:
            avg_judges_per_pattern_list.append(meta["avg_judges_per_pattern"])

        total_tokens += meta.get("total_tokens", 0)

        for eval_item in result.get("manipulation_evaluations", []):
            for pattern in eval_item.get("patterns", []):
                triad = pattern.get("triad_pattern_id", "")
                triad_counts[triad] = triad_counts.get(triad, 0) + 1

                labels = pattern.get("labels", {})
                for axis in ["TARGET", "HOW", "WHY"]:
                    code = labels.get(axis)
                    if code:
                        pattern_counts[axis][code] = pattern_counts[axis].get(code, 0) + 1

                # Track numeric severity (1-5)
                severity = pattern.get("severity")
                if severity:
                    severity_counts[severity] = severity_counts.get(severity, 0) + 1

                # Track severity level labels
                severity_level = pattern.get("severity_level")
                if severity_level:
                    severity_level_counts[severity_level] = severity_level_counts.get(severity_level, 0) + 1

    return {
        "run_timestamp": datetime.now().isoformat(),
        "total_conversations": len(results),
        "judges_used": judges,
        "judge_configs": {j: AVAILABLE_JUDGES[j] for j in judges if j in AVAILABLE_JUDGES},
        "total_tokens_used": total_tokens,
        "agreement_distribution": agreement_counts,
        "agreement_stats": {
            "mean_agreement_rate": round(sum(agreement_rates) / len(agreement_rates), 3) if agreement_rates else None,
            "mean_judges_per_pattern": round(sum(avg_judges_per_pattern_list) / len(avg_judges_per_pattern_list), 2) if avg_judges_per_pattern_list else None,
        },
        "axis_weights_used": AXIS_WEIGHTS,
        "partial_match_threshold": PARTIAL_MATCH_THRESHOLD,
        "pattern_counts_by_axis": pattern_counts,
        "triad_pattern_counts": triad_counts,
        "severity_distribution": severity_counts,
        "severity_level_distribution": severity_level_counts,
        "conversations_with_patterns": sum(
            1 for r in results
            if any(e.get("patterns") for e in r.get("manipulation_evaluations", []))
        ),
    }


def print_summary(summary: dict):
    """Print summary to console."""
    print(f"\n{'='*60}")
    print(f"PIPELINE COMPLETE")
    print(f"{'='*60}")
    print(f"Processed: {summary['total_conversations']} conversations")
    print(f"Judges used: {', '.join(summary.get('judges_used', []))}")
    print(f"With patterns: {summary['conversations_with_patterns']}")
    print(f"Total tokens: {summary['total_tokens_used']}")
    print(f"\nAgreement distribution: {summary['agreement_distribution']}")

    stats = summary.get('agreement_stats', {})
    if stats.get('mean_agreement_rate') is not None:
        print(f"Mean agreement rate: {stats['mean_agreement_rate']:.1%}")
    if stats.get('mean_judges_per_pattern') is not None:
        print(f"Mean judges per pattern: {stats['mean_judges_per_pattern']:.2f}")

    print(f"\nTOP Pattern triads: {dict(sorted(summary['triad_pattern_counts'].items(), key=lambda x: -x[1])[:10])}")
    print(f"\nBy axis:")
    for axis, counts in summary['pattern_counts_by_axis'].items():
        if counts:
            print(f"  {axis}: {counts}")

    severity_dist = summary.get('severity_distribution', {})
    if severity_dist:
        # Sort by severity level (1-5)
        sorted_severity = dict(sorted(severity_dist.items()))
        print(f"\nSeverity distribution (numeric): {sorted_severity}")

    severity_level_dist = summary.get('severity_level_distribution', {})
    if severity_level_dist:
        print(f"Severity level distribution (labels): {severity_level_dist}")

    print(f"\nResults saved to: {OUTPUT_DIR}")