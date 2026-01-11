"""
Multi-Agent Pipeline Orchestration

Runs all specialized judges in parallel, then aggregates results.
Supports dual-judge architecture: Judge A (Model X) + Judge B (Model Y).

Architecture:
    Judge A = 6 specialists (H1-H6) using Model X (e.g., Sonnet)
    Judge B = 6 specialists (H1-H6) using Model Y (e.g., Haiku)
    
    Then aggregate across Judge A and Judge B for final result.

Part of evaluations.multi_agent submodule.
"""

import json
import asyncio
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any

# Handle imports for both module and direct execution
try:
    from ..config import DEFAULT_JUDGES, OUTPUT_DIR, AVAILABLE_JUDGES
    from ..judges import run_judge
    from ..aggregation import aggregate_n_evaluations
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from config import DEFAULT_JUDGES, OUTPUT_DIR, AVAILABLE_JUDGES
    from judges import run_judge
    from aggregation import aggregate_n_evaluations

# Import from this submodule
from .judges import (
    run_all_specialists,
    run_severity_scorer,
    ALL_HOW_CODES,
)
from .aggregator import (
    aggregate_specialist_results,
    aggregate_dual_judges,
)


# Output directory for multi-agent results
MULTI_AGENT_OUTPUT_DIR = OUTPUT_DIR / "multi_agent"
MULTI_AGENT_OUTPUT_DIR.mkdir(exist_ok=True)

# Default dual-judge configuration
DEFAULT_JUDGE_A = "sonnet"
DEFAULT_JUDGE_B = "haiku"


async def analyze_conversation_multi_agent(
    filepath: Path,
    judge_id: str = "sonnet",
    how_codes: List[str] = None,
    run_severity: bool = True
) -> Dict[str, Any]:
    """
    Analyze a conversation using the multi-agent architecture.
    
    Args:
        filepath: Path to conversation JSON file
        judge_id: Which model to use for specialists
        how_codes: Which HOW codes to run (default: all)
        run_severity: Whether to run severity scoring
    
    Returns:
        Aggregated multi-agent evaluation
    """
    if how_codes is None:
        how_codes = ALL_HOW_CODES
    
    with open(filepath, 'r', encoding='utf-8') as f:
        conversation = json.load(f)
    
    conversation_id = conversation.get("conversation_id", filepath.stem)
    
    print(f"  Running {len(how_codes)} specialist judges ({judge_id})...")
    
    # Run all specialists in parallel
    specialist_results = await run_all_specialists(conversation, judge_id, how_codes)
    
    # Count patterns found
    patterns_found = []
    for how_code, result in specialist_results.items():
        eval_data = result.get("specialist_evaluation", {})
        patterns = eval_data.get("patterns_detected", [])
        if patterns:
            patterns_found.append(f"{how_code}:{len(patterns)}")
    
    if patterns_found:
        print(f"  Patterns by specialist: {', '.join(patterns_found)}")
    
    # Collect all patterns for severity scoring
    all_patterns = []
    for result in specialist_results.values():
        eval_data = result.get("specialist_evaluation", {})
        all_patterns.extend(eval_data.get("patterns_detected", []))
    
    # Run severity scoring if requested
    severity_result = None
    if run_severity and all_patterns:
        print(f"  Running severity scoring on {len(all_patterns)} patterns...")
        severity_result = await run_severity_scorer(conversation_id, all_patterns)
    
    # Aggregate results
    aggregated = aggregate_specialist_results(
        specialist_results,
        severity_result,
        conversation_id
    )
    
    # Add source metadata
    aggregated["_source"] = {
        "file": str(filepath),
        "chatbot_mode": conversation.get("chatbot_mode"),
        "chatbot_model": conversation.get("chatbot_model"),
        "persona_id": conversation.get("persona_id"),
        "analyzed_at": datetime.now().isoformat(),
    }
    
    return aggregated


async def analyze_conversation_dual_judge(
    filepath: Path,
    judge_a: str = "sonnet",
    judge_b: str = "haiku",
    how_codes: List[str] = None,
    run_severity: bool = True
) -> Dict[str, Any]:
    """
    Analyze a conversation using dual-judge multi-agent architecture.
    
    Judge A = All specialists using Model X
    Judge B = All specialists using Model Y
    
    Then aggregate across both judges.
    
    Args:
        filepath: Path to conversation JSON file
        judge_a: Model for Judge A specialists
        judge_b: Model for Judge B specialists
        how_codes: Which HOW codes to run (default: all)
        run_severity: Whether to run severity scoring
    
    Returns:
        Aggregated dual-judge evaluation
    """
    if how_codes is None:
        how_codes = ALL_HOW_CODES
    
    with open(filepath, 'r', encoding='utf-8') as f:
        conversation = json.load(f)
    
    conversation_id = conversation.get("conversation_id", filepath.stem)
    
    print(f"  Running dual-judge: Judge A ({judge_a}) + Judge B ({judge_b})...")
    
    # Run both judges in parallel - each runs all specialists
    judge_a_task = run_all_specialists(conversation, judge_a, how_codes)
    judge_b_task = run_all_specialists(conversation, judge_b, how_codes)
    
    judge_a_results, judge_b_results = await asyncio.gather(judge_a_task, judge_b_task)
    
    # Report patterns found by each judge
    def count_patterns(results):
        count = 0
        for result in results.values():
            eval_data = result.get("specialist_evaluation", {})
            count += len(eval_data.get("patterns_detected", []))
        return count
    
    a_patterns = count_patterns(judge_a_results)
    b_patterns = count_patterns(judge_b_results)
    print(f"  Judge A ({judge_a}): {a_patterns} patterns | Judge B ({judge_b}): {b_patterns} patterns")
    
    # Aggregate each judge's specialists first
    judge_a_aggregated = aggregate_specialist_results(
        judge_a_results, None, conversation_id
    )
    judge_a_aggregated["_judge_id"] = f"multi-agent-{judge_a}"
    judge_a_aggregated["_model"] = judge_a
    
    judge_b_aggregated = aggregate_specialist_results(
        judge_b_results, None, conversation_id
    )
    judge_b_aggregated["_judge_id"] = f"multi-agent-{judge_b}"
    judge_b_aggregated["_model"] = judge_b
    
    # Now aggregate across both judges (like the original dual-judge approach)
    final_result = aggregate_dual_judges(
        judge_a_aggregated,
        judge_b_aggregated,
        conversation_id
    )
    
    # Run severity scoring on final patterns if requested
    if run_severity:
        final_patterns = []
        for eval_data in final_result.get("manipulation_evaluations", []):
            final_patterns.extend(eval_data.get("patterns", []))
        
        if final_patterns:
            print(f"  Running severity scoring on {len(final_patterns)} patterns...")
            severity_result = await run_severity_scorer(conversation_id, final_patterns)
            final_result = _apply_severity_to_result(final_result, severity_result)
    
    # Add source metadata
    final_result["_source"] = {
        "file": str(filepath),
        "chatbot_mode": conversation.get("chatbot_mode"),
        "chatbot_model": conversation.get("chatbot_model"),
        "persona_id": conversation.get("persona_id"),
        "analyzed_at": datetime.now().isoformat(),
    }
    
    # Store individual judge results for reference
    final_result["_judge_a_result"] = judge_a_aggregated
    final_result["_judge_b_result"] = judge_b_aggregated
    
    return final_result


def _apply_severity_to_result(result: Dict[str, Any], severity_result: Dict[str, Any]) -> Dict[str, Any]:
    """Apply severity scores to aggregated result."""
    if severity_result.get("_error"):
        return result
    
    severity_data = severity_result.get("severity_assessment", {})
    severity_patterns = severity_data.get("patterns", [])
    
    # Build lookup
    severity_lookup = {p.get("triad_pattern_id"): p for p in severity_patterns}
    
    # Apply to result
    for eval_data in result.get("manipulation_evaluations", []):
        for pattern in eval_data.get("patterns", []):
            triad_id = pattern.get("triad_pattern_id")
            if triad_id in severity_lookup:
                sev_info = severity_lookup[triad_id]
                pattern["severity"] = sev_info.get("severity", pattern.get("severity", 3))
                pattern["prominence"] = sev_info.get("prominence", pattern.get("prominence", 0.5))
    
    # Update meta
    result["_meta"]["severity_scored"] = True
    result["_meta"]["total_tokens"] = result["_meta"].get("total_tokens", 0) + severity_result.get("_tokens_used", 0)
    
    return result


async def analyze_conversation_comparison(
    filepath: Path,
    single_judge_id: str = "sonnet",
    multi_judge_id: str = "sonnet",
    how_codes: List[str] = None,
) -> Dict[str, Any]:
    """
    Run both single-agent and multi-agent analysis for comparison.
    
    Args:
        filepath: Path to conversation JSON file
        single_judge_id: Judge to use for single-agent
        multi_judge_id: Judge to use for multi-agent specialists
        how_codes: HOW codes for multi-agent (default: all)
    
    Returns:
        Comparison result with both evaluations
    """
    with open(filepath, 'r', encoding='utf-8') as f:
        conversation = json.load(f)
    
    conversation_id = conversation.get("conversation_id", filepath.stem)
    
    # Run both in parallel
    print(f"  Running single-agent ({single_judge_id}) and multi-agent ({multi_judge_id}) in parallel...")
    
    single_task = run_judge(conversation, single_judge_id)
    multi_task = analyze_conversation_multi_agent(filepath, multi_judge_id, how_codes, run_severity=True)
    
    single_result, multi_result = await asyncio.gather(single_task, multi_task)
    
    # Wrap single result in standard format for comparison
    single_wrapped = {
        "conversation_id": conversation_id,
        "manipulation_evaluations": single_result.get("manipulation_evaluations", []),
        "_meta": {
            "total_tokens": single_result.get("_tokens_used", 0)
        }
    }
    
    # Compare
    comparison = compare_single_vs_multi(single_wrapped, multi_result)
    
    return {
        "conversation_id": conversation_id,
        "comparison": comparison,
        "single_agent_result": single_result,
        "multi_agent_result": multi_result,
        "_source": {
            "file": str(filepath),
            "chatbot_mode": conversation.get("chatbot_mode"),
            "analyzed_at": datetime.now().isoformat(),
        }
    }


async def run_dual_judge_pipeline(
    input_pattern: str = "output/**/*.json",
    limit: Optional[int] = None,
    judge_a: str = "sonnet",
    judge_b: str = "haiku",
    how_codes: List[str] = None,
    run_severity: bool = True,
) -> List[Dict[str, Any]]:
    """
    Run dual-judge multi-agent pipeline.
    
    This is the main production pipeline:
    - Judge A = All specialists using Model X
    - Judge B = All specialists using Model Y
    - Aggregate across both for final result
    
    Args:
        input_pattern: Glob pattern for input files
        limit: Limit number of files
        judge_a: Model for Judge A
        judge_b: Model for Judge B
        how_codes: Which HOW codes to run
        run_severity: Whether to run severity scoring
    
    Returns:
        List of results
    """
    if how_codes is None:
        how_codes = ALL_HOW_CODES
    
    files = list(Path(".").glob(input_pattern))
    print(f"Found {len(files)} conversation files")
    print(f"Using dual-judge multi-agent architecture:")
    print(f"  Judge A: {judge_a} ({len(how_codes)} specialists)")
    print(f"  Judge B: {judge_b} ({len(how_codes)} specialists)")
    
    if limit:
        files = files[:limit]
        print(f"Processing first {limit} files")
    
    results = []
    
    for i, filepath in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] Processing: {filepath.name}")
        
        try:
            output = await analyze_conversation_dual_judge(
                filepath, judge_a, judge_b, how_codes, run_severity
            )
            results.append(output)
            
            # Print summary
            patterns = output.get("manipulation_evaluations", [{}])[0].get("patterns", [])
            pattern_ids = [p.get("triad_pattern_id", "?") for p in patterns]
            agreement = output.get("_meta", {}).get("agreement_type", "?")
            
            if patterns:
                print(f"  Final patterns: {pattern_ids} | Agreement: {agreement}")
            else:
                print(f"  No manipulation detected | Agreement: {agreement}")
            
            # Save result
            result_file = MULTI_AGENT_OUTPUT_DIR / f"{filepath.stem}_dual_judge.json"
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2)
                
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
    
    # Build summary
    summary = build_dual_judge_summary(results, judge_a, judge_b, how_codes)
    
    summary_file = MULTI_AGENT_OUTPUT_DIR / f"summary_dual_judge_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    
    print_dual_judge_summary(summary)
    
    return results


async def run_multi_agent_pipeline(
    input_pattern: str = "output/**/*.json",
    limit: Optional[int] = None,
    judge_id: str = "sonnet",
    how_codes: List[str] = None,
    run_severity: bool = True,
) -> List[Dict[str, Any]]:
    """
    Run multi-agent pipeline on multiple conversations.
    
    Args:
        input_pattern: Glob pattern for input files
        limit: Limit number of files
        judge_id: Which model to use for specialists
        how_codes: Which HOW codes to run
        run_severity: Whether to run severity scoring
    
    Returns:
        List of results
    """
    if how_codes is None:
        how_codes = ALL_HOW_CODES
    
    files = list(Path(".").glob(input_pattern))
    print(f"Found {len(files)} conversation files")
    print(f"Using multi-agent architecture with {len(how_codes)} specialists")
    print(f"Model: {judge_id}")
    
    if limit:
        files = files[:limit]
        print(f"Processing first {limit} files")
    
    results = []
    
    for i, filepath in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] Processing: {filepath.name}")
        
        try:
            output = await analyze_conversation_multi_agent(
                filepath, judge_id, how_codes, run_severity
            )
            results.append(output)
            
            # Print summary
            patterns = output.get("manipulation_evaluations", [{}])[0].get("patterns", [])
            pattern_ids = [p.get("triad_pattern_id", "?") for p in patterns]
            
            if patterns:
                print(f"  Final patterns: {pattern_ids}")
            else:
                print(f"  No manipulation detected")
            
            # Save result
            result_file = MULTI_AGENT_OUTPUT_DIR / f"{filepath.stem}_multi_agent.json"
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2)
                
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
    
    # Build summary
    summary = build_multi_agent_summary(results, judge_id, how_codes)
    
    summary_file = MULTI_AGENT_OUTPUT_DIR / f"summary_multi_agent_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    
    print_multi_agent_summary(summary)
    
    return results


async def run_comparison_pipeline(
    input_pattern: str = "output/**/*.json",
    limit: Optional[int] = None,
    single_judge: str = "sonnet",
    multi_judge: str = "sonnet",
    how_codes: List[str] = None,
) -> List[Dict[str, Any]]:
    """
    Run comparison pipeline between single-agent and multi-agent.
    
    This is for the study comparing:
    1. Single-agent zero-shot (baseline)
    2. Multi-agent zero-shot
    """
    if how_codes is None:
        how_codes = ALL_HOW_CODES
    
    files = list(Path(".").glob(input_pattern))
    print(f"Found {len(files)} conversation files")
    print(f"Running comparison: single-agent ({single_judge}) vs multi-agent ({multi_judge})")
    
    if limit:
        files = files[:limit]
        print(f"Processing first {limit} files")
    
    results = []
    
    for i, filepath in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] Processing: {filepath.name}")
        
        try:
            output = await analyze_conversation_comparison(
                filepath, single_judge, multi_judge, how_codes
            )
            results.append(output)
            
            # Print comparison summary
            comparison = output.get("comparison", {})
            print(f"  Single: {comparison.get('single_agent_patterns', 0)} patterns")
            print(f"  Multi:  {comparison.get('multi_agent_patterns', 0)} patterns")
            print(f"  Agreement: {comparison.get('agreement_rate', 0):.1%}")
            
            # Save result
            result_file = MULTI_AGENT_OUTPUT_DIR / f"{filepath.stem}_comparison.json"
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2)
                
        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()
    
    # Build comparison summary
    summary = build_comparison_summary(results)
    
    summary_file = MULTI_AGENT_OUTPUT_DIR / f"comparison_summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    
    print_comparison_summary(summary)
    
    return results


# ============================================================================
# SUMMARY BUILDERS
# ============================================================================

def build_multi_agent_summary(
    results: List[Dict[str, Any]],
    judge_id: str,
    how_codes: List[str]
) -> Dict[str, Any]:
    """Build summary for multi-agent run."""
    
    pattern_counts = {"TARGET": {}, "HOW": {}, "WHY": {}}
    triad_counts = {}
    specialist_detection_counts = {code: 0 for code in how_codes}
    total_tokens = 0
    
    for result in results:
        meta = result.get("_meta", {})
        total_tokens += meta.get("total_tokens", 0)
        
        # Count which specialists found patterns
        for code in meta.get("specialists_with_detections", []):
            specialist_detection_counts[code] = specialist_detection_counts.get(code, 0) + 1
        
        for eval_data in result.get("manipulation_evaluations", []):
            for pattern in eval_data.get("patterns", []):
                triad = pattern.get("triad_pattern_id", "")
                triad_counts[triad] = triad_counts.get(triad, 0) + 1
                
                labels = pattern.get("labels", {})
                for axis in ["TARGET", "HOW", "WHY"]:
                    code = labels.get(axis)
                    if code:
                        pattern_counts[axis][code] = pattern_counts[axis].get(code, 0) + 1
    
    return {
        "run_timestamp": datetime.now().isoformat(),
        "architecture": "multi-agent",
        "total_conversations": len(results),
        "judge_model": judge_id,
        "how_codes_used": how_codes,
        "total_tokens_used": total_tokens,
        "specialist_detection_counts": specialist_detection_counts,
        "pattern_counts_by_axis": pattern_counts,
        "triad_pattern_counts": triad_counts,
        "conversations_with_patterns": sum(
            1 for r in results
            if any(e.get("patterns") for e in r.get("manipulation_evaluations", []))
        ),
    }


def build_comparison_summary(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Build summary for comparison run."""
    
    total_single_patterns = 0
    total_multi_patterns = 0
    total_common = 0
    total_single_only = 0
    total_multi_only = 0
    agreement_rates = []
    single_tokens = 0
    multi_tokens = 0
    
    for result in results:
        comparison = result.get("comparison", {})
        total_single_patterns += comparison.get("single_agent_patterns", 0)
        total_multi_patterns += comparison.get("multi_agent_patterns", 0)
        total_common += comparison.get("common_patterns", 0)
        total_single_only += len(comparison.get("single_only_patterns", []))
        total_multi_only += len(comparison.get("multi_only_patterns", []))
        agreement_rates.append(comparison.get("agreement_rate", 0))
        single_tokens += comparison.get("single_tokens", 0)
        multi_tokens += comparison.get("multi_tokens", 0)
    
    return {
        "run_timestamp": datetime.now().isoformat(),
        "total_conversations": len(results),
        "single_agent": {
            "total_patterns": total_single_patterns,
            "total_tokens": single_tokens,
            "unique_patterns": total_single_only,
        },
        "multi_agent": {
            "total_patterns": total_multi_patterns,
            "total_tokens": multi_tokens,
            "unique_patterns": total_multi_only,
        },
        "agreement": {
            "common_patterns": total_common,
            "mean_agreement_rate": round(sum(agreement_rates) / len(agreement_rates), 3) if agreement_rates else 0,
        },
        "token_efficiency": {
            "multi_vs_single_ratio": round(multi_tokens / single_tokens, 2) if single_tokens else 0,
        }
    }


def print_multi_agent_summary(summary: Dict[str, Any]):
    """Print multi-agent summary."""
    print(f"\n{'='*60}")
    print("MULTI-AGENT PIPELINE COMPLETE")
    print(f"{'='*60}")
    print(f"Processed: {summary['total_conversations']} conversations")
    print(f"Model: {summary['judge_model']}")
    print(f"Specialists: {', '.join(summary['how_codes_used'])}")
    print(f"With patterns: {summary['conversations_with_patterns']}")
    print(f"Total tokens: {summary['total_tokens_used']}")
    print(f"\nDetections by specialist:")
    for code, count in summary['specialist_detection_counts'].items():
        print(f"  {code}: {count} conversations")
    print(f"\nTop patterns: {dict(sorted(summary['triad_pattern_counts'].items(), key=lambda x: -x[1])[:10])}")
    print(f"\nResults saved to: {MULTI_AGENT_OUTPUT_DIR}")


def print_comparison_summary(summary: Dict[str, Any]):
    """Print comparison summary."""
    print(f"\n{'='*60}")
    print("COMPARISON STUDY COMPLETE")
    print(f"{'='*60}")
    print(f"Processed: {summary['total_conversations']} conversations")
    print(f"\nSingle-Agent:")
    print(f"  Total patterns: {summary['single_agent']['total_patterns']}")
    print(f"  Unique patterns: {summary['single_agent']['unique_patterns']}")
    print(f"  Tokens: {summary['single_agent']['total_tokens']}")
    print(f"\nMulti-Agent:")
    print(f"  Total patterns: {summary['multi_agent']['total_patterns']}")
    print(f"  Unique patterns: {summary['multi_agent']['unique_patterns']}")
    print(f"  Tokens: {summary['multi_agent']['total_tokens']}")
    print(f"\nAgreement:")
    print(f"  Common patterns: {summary['agreement']['common_patterns']}")
    print(f"  Mean agreement rate: {summary['agreement']['mean_agreement_rate']:.1%}")
    print(f"\nToken efficiency: Multi uses {summary['token_efficiency']['multi_vs_single_ratio']:.1f}x tokens of single")
    print(f"\nResults saved to: {MULTI_AGENT_OUTPUT_DIR}")


# ============================================================================
# DUAL-JUDGE SUMMARY
# ============================================================================

def build_dual_judge_summary(
    results: List[Dict[str, Any]],
    judge_a: str,
    judge_b: str,
    how_codes: List[str]
) -> Dict[str, Any]:
    """Build summary for dual-judge run."""
    
    pattern_counts = {"TARGET": {}, "HOW": {}, "WHY": {}}
    triad_counts = {}
    agreement_counts = {"full": 0, "strong": 0, "partial": 0, "weak": 0, "none": 0, "both_clean": 0}
    total_tokens = 0
    agreement_rates = []
    
    for result in results:
        meta = result.get("_meta", {})
        total_tokens += meta.get("total_tokens", 0)
        
        # Track agreement
        agreement_type = meta.get("agreement_type", "unknown")
        if agreement_type in agreement_counts:
            agreement_counts[agreement_type] += 1
        
        if "agreement_rate" in meta:
            agreement_rates.append(meta["agreement_rate"])
        
        for eval_data in result.get("manipulation_evaluations", []):
            for pattern in eval_data.get("patterns", []):
                triad = pattern.get("triad_pattern_id", "")
                triad_counts[triad] = triad_counts.get(triad, 0) + 1
                
                labels = pattern.get("labels", {})
                for axis in ["TARGET", "HOW", "WHY"]:
                    code = labels.get(axis)
                    if code:
                        pattern_counts[axis][code] = pattern_counts[axis].get(code, 0) + 1
    
    return {
        "run_timestamp": datetime.now().isoformat(),
        "architecture": "dual-judge-multi-agent",
        "total_conversations": len(results),
        "judge_a": judge_a,
        "judge_b": judge_b,
        "how_codes_used": how_codes,
        "total_tokens_used": total_tokens,
        "agreement_distribution": agreement_counts,
        "agreement_stats": {
            "mean_agreement_rate": round(sum(agreement_rates) / len(agreement_rates), 3) if agreement_rates else None,
        },
        "pattern_counts_by_axis": pattern_counts,
        "triad_pattern_counts": triad_counts,
        "conversations_with_patterns": sum(
            1 for r in results
            if any(e.get("patterns") for e in r.get("manipulation_evaluations", []))
        ),
    }


def print_dual_judge_summary(summary: Dict[str, Any]):
    """Print dual-judge summary."""
    print(f"\n{'='*60}")
    print("DUAL-JUDGE MULTI-AGENT PIPELINE COMPLETE")
    print(f"{'='*60}")
    print(f"Processed: {summary['total_conversations']} conversations")
    print(f"Judge A: {summary['judge_a']}")
    print(f"Judge B: {summary['judge_b']}")
    print(f"Specialists: {', '.join(summary['how_codes_used'])}")
    print(f"With patterns: {summary['conversations_with_patterns']}")
    print(f"Total tokens: {summary['total_tokens_used']}")
    print(f"\nAgreement distribution: {summary['agreement_distribution']}")
    
    stats = summary.get('agreement_stats', {})
    if stats.get('mean_agreement_rate') is not None:
        print(f"Mean agreement rate: {stats['mean_agreement_rate']:.1%}")
    
    print(f"\nTop patterns: {dict(sorted(summary['triad_pattern_counts'].items(), key=lambda x: -x[1])[:10])}")
    print(f"\nBy axis:")
    for axis, counts in summary['pattern_counts_by_axis'].items():
        if counts:
            print(f"  {axis}: {counts}")
    print(f"\nResults saved to: {MULTI_AGENT_OUTPUT_DIR}")
