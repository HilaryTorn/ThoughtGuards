"""
Main pipeline orchestration for ThoughtGuards LLM-Judge evaluation.
"""

import json
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Optional, List

from .config import JUDGE_MODEL_1, JUDGE_MODEL_2, OUTPUT_DIR
from .judges import judge_with_model
from .aggregation import aggregate_evaluations
from .summary import build_summary, print_summary, print_conversation_result


async def analyze_conversation(filepath: Path) -> dict:
    """
    Analyze a single conversation file.
    
    Runs both judges in parallel and aggregates results.
    
    Args:
        filepath: Path to conversation JSON file
        
    Returns:
        Aggregated result dictionary
    """
    # Load conversation
    with open(filepath, 'r', encoding='utf-8') as f:
        conversation = json.load(f)

    print(f"  Running judges...")
    
    # Run both judges in parallel
    result1, result2 = await asyncio.gather(
        judge_with_model(conversation, JUDGE_MODEL_1),
        judge_with_model(conversation, JUDGE_MODEL_2)
    )

    # Aggregate results
    aggregated = aggregate_evaluations(result1, result2)

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
    limit: Optional[int] = None
) -> List[dict]:
    """
    Run the judge pipeline on all matching conversation files.
    
    Args:
        input_pattern: Glob pattern for input files
        limit: Optional limit on number of files to process
        
    Returns:
        List of aggregated results
    """
    # Find files
    files = list(Path(".").glob(input_pattern))
    print(f"Found {len(files)} conversation files")

    if limit:
        files = files[:limit]
        print(f"Processing first {limit} files")

    results = []

    # Process each file
    for i, filepath in enumerate(files, 1):
        print(f"\n[{i}/{len(files)}] Processing: {filepath.name}")

        try:
            output = await analyze_conversation(filepath)
            results.append(output)

            # Print summary for this conversation
            print_conversation_result(output, i, len(files))

            # Save individual result
            result_file = OUTPUT_DIR / f"{filepath.stem}_judgment.json"
            with open(result_file, 'w', encoding='utf-8') as f:
                json.dump(output, f, indent=2)

        except Exception as e:
            print(f"  ERROR: {e}")

    # Build and save summary
    summary = build_summary(results, JUDGE_MODEL_1, JUDGE_MODEL_2)

    summary_file = OUTPUT_DIR / f"summary_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(summary_file, 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)

    print_summary(summary)
    print(f"\nResults saved to: {OUTPUT_DIR}")

    return results


async def run_single_file(filepath: str):
    """
    Run analysis on a single file and print result.
    
    Args:
        filepath: Path to conversation file
    """
    output = await analyze_conversation(Path(filepath))
    print(json.dumps(output, indent=2))
