"""
Multi-agent HOW pipeline for batch processing.
"""

import json
import asyncio
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict

# Handle both direct execution and module import
try:
    from .config import OUTPUT_DIR, ZERO_SHOT
    from .multi_agent_how import multi_agent_how_analysis
    from .summary import build_summary, print_summary
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    from config import OUTPUT_DIR, ZERO_SHOT
    from multi_agent_how import multi_agent_how_analysis
    from summary import build_summary, print_summary


async def run_multi_agent_pipeline(
    input_pattern: str = "output/**/*.json",
    limit: Optional[int] = None,
    judge_id: str = "sonnet",
    available_judges: Dict = None
):
    """
    Run the multi-agent HOW pipeline on all matching conversation files.

    Args:
        input_pattern: Glob pattern for input files
        limit: Optional limit on number of files
        judge_id: Base judge to use for multi-agent (default: sonnet)
        available_judges: AVAILABLE_JUDGES config dict
    """

    if available_judges is None:
        from config import AVAILABLE_JUDGES
        available_judges = AVAILABLE_JUDGES

    files = list(Path(".").glob(input_pattern))
    print(f"Found {len(files)} conversation files")
    print(f"Using multi-agent HOW assessment with base model: {judge_id}")
    print(f"  6 specialized HOW agents (H1-H6) will analyze each conversation")

    if limit:
        files = files[:limit]
        print(f"Processing first {limit} files")

    results = []

    for i, filepath in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] Processing: {filepath.name}")

        try:
            # Load conversation
            with open(filepath, 'r', encoding='utf-8') as f:
                conversation = json.load(f)

            # Run multi-agent HOW analysis
            output = await multi_agent_how_analysis(
                conversation,
                judge_id,
                available_judges
            )
            results.append(output)

            # Print summary
            patterns = output.get("manipulation_evaluations", [{}])[0].get("patterns", [])
            pattern_ids = [p.get("triad_pattern_id", "?") for p in patterns]
            agreement = output.get("_meta", {}).get("agreement_type", "?")

            if patterns:
                # Count HOW dimensions detected
                how_dims = set()
                for p in patterns:
                    labels = p.get("labels", {})
                    how_label = labels.get("HOW", "?")
                    how_dims.add(how_label)

                print(f"  Patterns: {pattern_ids}")
                print(f"  HOW dimensions detected: {', '.join(sorted(how_dims))}")
                print(f"  Agreement: {agreement}")
            else:
                print(f"  No manipulation detected | Agreement: {agreement}")

            # Save individual result with descriptive filename
            # Format: {conversation_id}_{judge}_multi_agent_{zero/few}_shot_judgment.json
            shot_type = "zero_shot" if ZERO_SHOT else "few_shot"
            result_file = OUTPUT_DIR / f"{filepath.stem}_{judge_id}_multi_agent_{shot_type}_judgment.json"
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2)

        except Exception as e:
            print(f"  ERROR: {e}")
            import traceback
            traceback.print_exc()

    # Build summary
    judge_list = [f"{judge_id}-H1", f"{judge_id}-H2", f"{judge_id}-H3",
                  f"{judge_id}-H4", f"{judge_id}-H5", f"{judge_id}-H6"]
    summary = build_summary(results, judge_list)

    # Add multi-agent metadata
    summary["_multi_agent"] = {
        "enabled": True,
        "base_model": judge_id,
        "num_specialized_agents": 6,
        "specializations": ["H1", "H2", "H3", "H4", "H5", "H6"]
    }

    # Build descriptive summary filename
    shot_type = "zero_shot" if ZERO_SHOT else "few_shot"
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    summary_file = OUTPUT_DIR / f"summary_multi_agent_{shot_type}_{judge_id}_{timestamp}.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)

    print("\n" + "="*80)
    print("MULTI-AGENT HOW ASSESSMENT SUMMARY")
    print("="*80)
    print_summary(summary)

    print(f"\nResults saved to: {OUTPUT_DIR}")
    print(f"Summary saved to: {summary_file}")

    return results
