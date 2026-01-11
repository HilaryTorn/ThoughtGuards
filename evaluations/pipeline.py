"""
Pipeline orchestration for running multi-judge analysis.
"""

import json
import asyncio
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional, List

# Handle both direct execution and module import
try:
    from .config import DEFAULT_JUDGES, OUTPUT_DIR
    from .judges import run_judge
    from .aggregation import aggregate_n_evaluations
    from .summary import build_summary, print_summary
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    from config import DEFAULT_JUDGES, OUTPUT_DIR
    from judges import run_judge
    from aggregation import aggregate_n_evaluations
    from summary import build_summary, print_summary


async def analyze_conversation(filepath: Path, judges: List[str] = None) -> dict:
    """Analyze a single conversation file with specified judges."""

    if judges is None:
        judges = DEFAULT_JUDGES

    with open(filepath, 'r', encoding='utf-8') as f:
        conversation = json.load(f)

    print(f"  Running {len(judges)} judges: {', '.join(judges)}...")

    # Run all judges in parallel
    tasks = [run_judge(conversation, judge_id) for judge_id in judges]
    results = await asyncio.gather(*tasks)

    # Aggregate results
    aggregated = aggregate_n_evaluations(results)

    # Add source metadata
    aggregated["_source"] = {
        "file": str(filepath),
        "chatbot_mode": conversation.get("chatbot_mode"),
        "chatbot_model": conversation.get("chatbot_model"),
        "persona_id": conversation.get("persona_id"),
        "analyzed_at": datetime.now().isoformat(),
    }

    return aggregated


async def run_pipeline(
    input_pattern: str = "output/**/*.json",
    limit: Optional[int] = None,
    judges: List[str] = None
):
    """Run the judge pipeline on all matching conversation files."""

    if judges is None:
        judges = DEFAULT_JUDGES

    files = list(Path(".").glob(input_pattern))
    print(f"Found {len(files)} conversation files")
    print(f"Using judges: {', '.join(judges)}")

    if limit:
        files = files[:limit]
        print(f"Processing first {limit} files")

    results = []

    for i, filepath in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] Processing: {filepath.name}")

        try:
            output = await analyze_conversation(filepath, judges)
            results.append(output)

            # Print summary
            patterns = output.get("manipulation_evaluations", [{}])[0].get("patterns", [])
            pattern_ids = [p.get("triad_pattern_id", "?") for p in patterns]
            agreement = output.get("_meta", {}).get("agreement_type", "?")

            if patterns:
                print(f"  Patterns: {pattern_ids} | Agreement: {agreement}")
            else:
                print(f"  No manipulation detected | Agreement: {agreement}")

            # Save individual result
            result_file = OUTPUT_DIR / f"{filepath.stem}_judgment.json"
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2)

        except Exception as e:
            print(f"  ERROR: {e}")

    # Build summary
    summary = build_summary(results, judges)

    summary_file = OUTPUT_DIR / f"summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)

    print_summary(summary)

    return results