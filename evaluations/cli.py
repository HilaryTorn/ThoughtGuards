"""
Command-line interface for ThoughtGuards LLM-Judge Pipeline.
"""

import json
import asyncio
import argparse
import sys
from pathlib import Path

# Handle both direct execution and module import
try:
    from .config import AVAILABLE_JUDGES, DEFAULT_JUDGES
    from .pipeline import analyze_conversation, run_pipeline
except ImportError:
    # Running as script directly, add parent directory to path
    sys.path.insert(0, str(Path(__file__).parent))
    from config import AVAILABLE_JUDGES, DEFAULT_JUDGES
    from pipeline import analyze_conversation, run_pipeline


def main():
    """Main CLI entry point."""

    # Build judge choices string
    judge_help = "Judges to use. Available: " + ", ".join(
        f"{k} ({v['description']})" for k, v in AVAILABLE_JUDGES.items()
    )

    parser = argparse.ArgumentParser(
        description="ThoughtGuards LLM-Judge Pipeline (Taxonomy-based)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""
Examples:
  # Use all 4 judges (default)
  python -m evaluations.cli -i "conversations/*.json"

  # Use only Anthropic judges
  python -m evaluations.cli -i "conversations/*.json" --judges sonnet haiku

  # Use only local LiteLLM judges
  python -m evaluations.cli -i "conversations/*.json" --judges mistral compassj

  # Single file with specific judges
  python -m evaluations.cli -s conversation.json --judges sonnet mistral

Available judges:
  sonnet    - Claude Sonnet 4 (Anthropic)
  haiku     - Claude Haiku 4.5 (Anthropic)
  mistral   - Mistral Nemo (LiteLLM)
  compassj  - CompassJ 7B (LiteLLM)
        """
    )
    parser.add_argument(
        "--input", "-i",
        default="../cot-generator/output/**/*.json",
        help="Glob pattern for input conversation files"
    )
    parser.add_argument(
        "--limit", "-n",
        type=int,
        default=None,
        help="Limit number of files to process (for testing)"
    )
    parser.add_argument(
        "--single", "-s",
        type=str,
        default=None,
        help="Process a single file"
    )
    parser.add_argument(
        "--judges", "-j",
        nargs="+",
        choices=list(AVAILABLE_JUDGES.keys()),
        default=None,
        help=f"Judges to use (default: all). Choices: {', '.join(AVAILABLE_JUDGES.keys())}"
    )
    parser.add_argument(
        "--list-judges",
        action="store_true",
        help="List available judges and exit"
    )

    args = parser.parse_args()

    if args.list_judges:
        print("Available judges:")
        for judge_id, config in AVAILABLE_JUDGES.items():
            print(f"  {judge_id:12} - {config['description']} (model: {config['model']}, provider: {config['provider']})")
        exit(0)

    judges = args.judges if args.judges else DEFAULT_JUDGES

    if args.single:
        async def run_single():
            output = await analyze_conversation(Path(args.single), judges)
            print(json.dumps(output, indent=2))
        asyncio.run(run_single())
    else:
        asyncio.run(run_pipeline(args.input, args.limit, judges))


if __name__ == "__main__":
    main()
