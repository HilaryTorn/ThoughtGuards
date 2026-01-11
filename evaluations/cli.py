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
    parser.add_argument(
        "--multi-agent",
        action="store_true",
        help="Use multi-agent HOW assessment (6 specialized judges from same model)"
    )
    parser.add_argument(
        "--multi-agent-model",
        type=str,
        default="sonnet",
        choices=list(AVAILABLE_JUDGES.keys()),
        help="Model to use for multi-agent HOW assessment (default: sonnet)"
    )
    parser.add_argument(
        "--zero-shot",
        action="store_true",
        help="Use zero-shot prompts (no examples). Default is few-shot with examples."
    )
    parser.add_argument(
        "--few-shot",
        action="store_true",
        help="Use few-shot prompts (with examples). This is the default."
    )

    args = parser.parse_args()

    if args.list_judges:
        print("Available judges:")
        for judge_id, config in AVAILABLE_JUDGES.items():
            print(f"  {judge_id:12} - {config['description']} (model: {config['model']}, provider: {config['provider']})")
        exit(0)

    # Set ZERO_SHOT config based on arguments
    # If --zero-shot is specified, use zero-shot. If --few-shot is specified, use few-shot.
    # If neither, use the config default (currently True = zero-shot)
    if args.zero_shot and args.few_shot:
        print("ERROR: Cannot specify both --zero-shot and --few-shot")
        exit(1)

    import config
    if args.zero_shot:
        config.ZERO_SHOT = True
        print("Using ZERO-SHOT prompts (no examples)")
    elif args.few_shot:
        config.ZERO_SHOT = False
        print("Using FEW-SHOT prompts (with examples)")
    else:
        # Use config default
        print(f"Using {'ZERO-SHOT' if config.ZERO_SHOT else 'FEW-SHOT'} prompts (from config)")

    judges = args.judges if args.judges else DEFAULT_JUDGES

    if args.single:
        async def run_single():
            if args.multi_agent:
                # Multi-agent HOW assessment mode
                from multi_agent_how import multi_agent_how_analysis
                output = await multi_agent_how_analysis(
                    json.load(open(args.single, 'r', encoding='utf-8')),
                    args.multi_agent_model,
                    AVAILABLE_JUDGES
                )
            else:
                output = await analyze_conversation(Path(args.single), judges)
            print(json.dumps(output, indent=2))
        asyncio.run(run_single())
    else:
        if args.multi_agent:
            # Multi-agent mode for batch processing
            from pipeline_multi_agent import run_multi_agent_pipeline
            asyncio.run(run_multi_agent_pipeline(
                args.input,
                args.limit,
                args.multi_agent_model,
                AVAILABLE_JUDGES
            ))
        else:
            asyncio.run(run_pipeline(args.input, args.limit, judges))


if __name__ == "__main__":
    main()
