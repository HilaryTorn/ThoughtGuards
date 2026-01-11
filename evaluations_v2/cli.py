"""
Command-line interface for ThoughtGuards LLM-Judge Pipeline.
"""

import asyncio
import argparse
from pathlib import Path

from .pipeline import run_pipeline, run_single_file


def main():
    """Main CLI entry point."""
    parser = argparse.ArgumentParser(
        description="ThoughtGuards LLM-Judge Pipeline (Taxonomy-based)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Process all conversations in default directory
  python -m evaluations_v2
  
  # Process specific pattern
  python -m evaluations_v2 --input "../cot-generator/output/**/*.json"
  
  # Process first 5 files for testing
  python -m evaluations_v2 --limit 5
  
  # Process a single file
  python -m evaluations_v2 --single path/to/conversation.json
        """
    )
    
    parser.add_argument(
        "--input", "-i",
        default="../cot-generator/output/**/*.json",
        help="Glob pattern for input conversation files (default: ../cot-generator/output/**/*.json)"
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
        help="Process a single file and print result to stdout"
    )

    args = parser.parse_args()

    if args.single:
        asyncio.run(run_single_file(args.single))
    else:
        asyncio.run(run_pipeline(args.input, args.limit))


if __name__ == "__main__":
    main()
