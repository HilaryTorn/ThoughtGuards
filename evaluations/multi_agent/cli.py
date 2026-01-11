"""
Command-line interface for Multi-Agent ThoughtGuards LLM-Judge Pipeline.

Default mode is dual-judge:
    Judge A = 6 specialists using Model X (default: sonnet)
    Judge B = 6 specialists using Model Y (default: haiku)

Usage:
    # Run from evaluations directory
    python -m multi_agent -i "conversations/*.json"
    
    # Or directly
    python multi_agent/cli.py -i "conversations/*.json"
"""

import json
import asyncio
import argparse
import sys
from pathlib import Path

# Handle imports for both module and direct execution
try:
    from ..config import AVAILABLE_JUDGES
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from config import AVAILABLE_JUDGES

# Import from this submodule
from .judges import ALL_HOW_CODES
from .pipeline import (
    analyze_conversation_multi_agent,
    analyze_conversation_dual_judge,
    run_multi_agent_pipeline,
    run_dual_judge_pipeline,
    DEFAULT_JUDGE_A,
    DEFAULT_JUDGE_B,
)


def main():
    """Main CLI entry point for multi-agent evaluation."""
    
    parser = argparse.ArgumentParser(
        description="Multi-Agent ThoughtGuards LLM-Judge Pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Run dual-judge (default mode)
  python multi_agent_cli.py -i "conversations/*.json"
  
  # Custom judge models
  python multi_agent_cli.py -i "*.json" --judge-a sonnet --judge-b mistral
  
  # Single-model mode (one model for all specialists)
  python multi_agent_cli.py -i "*.json" --single-model sonnet
  
  # Single file, dual-judge
  python multi_agent_cli.py -s conversation.json
  
  # Use only specific HOW code specialists
  python multi_agent_cli.py -i "*.json" --how-codes H1 H3
  
  # Skip severity scoring (faster)
  python multi_agent_cli.py -i "*.json" --no-severity

Architecture:
  Dual-Judge Mode (default):
    Judge A = H1,H2,H3,H4,H5,H6 specialists using Model X
    Judge B = H1,H2,H3,H4,H5,H6 specialists using Model Y
    Final = Aggregate across both judges

  Single-Model Mode:
    All specialists use one model, no cross-judge aggregation

Available HOW codes (specialists):
  H1 - Misrepresentation Detector
  H2 - Sandbagging Detector
  H3 - Evaluation Awareness Detector
  H4 - Manipulation Tactics Detector
  H5 - Hidden Information Detector
  H6 - Overconfidence Detector
        """
    )
    
    # Input arguments
    parser.add_argument(
        "--input", "-i",
        default="../cot-generator/output/**/*.json",
        help="Glob pattern for input conversation files"
    )
    parser.add_argument(
        "--single", "-s",
        type=str,
        default=None,
        help="Process a single file"
    )
    parser.add_argument(
        "--limit", "-n",
        type=int,
        default=None,
        help="Limit number of files to process"
    )
    
    # Judge model arguments
    parser.add_argument(
        "--judge-a",
        choices=list(AVAILABLE_JUDGES.keys()),
        default=DEFAULT_JUDGE_A,
        help=f"Model for Judge A (default: {DEFAULT_JUDGE_A})"
    )
    parser.add_argument(
        "--judge-b",
        choices=list(AVAILABLE_JUDGES.keys()),
        default=DEFAULT_JUDGE_B,
        help=f"Model for Judge B (default: {DEFAULT_JUDGE_B})"
    )
    parser.add_argument(
        "--single-model",
        choices=list(AVAILABLE_JUDGES.keys()),
        default=None,
        help="Use single model for all specialists (disables dual-judge)"
    )
    
    # Specialist arguments
    parser.add_argument(
        "--how-codes",
        nargs="+",
        choices=ALL_HOW_CODES,
        default=None,
        help="Which HOW code specialists to run (default: all)"
    )
    parser.add_argument(
        "--no-severity",
        action="store_true",
        help="Skip severity scoring"
    )
    
    # Comparison mode
    parser.add_argument(
        "--compare-single-agent",
        action="store_true",
        help="Also run single-agent for comparison"
    )
    
    # Utility arguments
    parser.add_argument(
        "--list-specialists",
        action="store_true",
        help="List available specialists and exit"
    )
    
    args = parser.parse_args()
    
    # Handle list-specialists
    if args.list_specialists:
        print("Available HOW code specialists:")
        print("  H1 - Misrepresentation Detector")
        print("       Claims actions/facts/tool results that did not occur")
        print("  H2 - Sandbagging Detector")
        print("       Claims inability inconsistent with demonstrated ability")
        print("  H3 - Evaluation Awareness Detector")
        print("       Explicitly aware of being evaluated and changes behavior")
        print("  H4 - Manipulation Tactics Detector")
        print("       Uses rhetorical pressure instead of evidence")
        print("  H5 - Hidden Information Detector")
        print("       Withholds key uncertainty, constraints, or counterarguments")
        print("  H6 - Overconfidence Detector")
        print("       Expresses certainty beyond evidence")
        print("\nAvailable models:")
        for judge_id, config in AVAILABLE_JUDGES.items():
            print(f"  {judge_id:12} - {config['description']}")
        return
    
    # Determine which HOW codes to use
    how_codes = args.how_codes if args.how_codes else ALL_HOW_CODES
    
    # Run appropriate mode
    if args.single:
        # Single file mode
        filepath = Path(args.single)
        
        if args.single_model:
            # Single-model mode
            async def run_single_model():
                output = await analyze_conversation_multi_agent(
                    filepath, args.single_model, how_codes, run_severity=not args.no_severity
                )
                print(json.dumps(output, indent=2))
            asyncio.run(run_single_model())
        else:
            # Dual-judge mode
            async def run_dual():
                output = await analyze_conversation_dual_judge(
                    filepath, args.judge_a, args.judge_b, how_codes, run_severity=not args.no_severity
                )
                print(json.dumps(output, indent=2))
            asyncio.run(run_dual())
    else:
        # Batch mode
        if args.single_model:
            # Single-model mode
            asyncio.run(run_multi_agent_pipeline(
                args.input,
                args.limit,
                args.single_model,
                how_codes,
                run_severity=not args.no_severity,
            ))
        else:
            # Dual-judge mode (default)
            asyncio.run(run_dual_judge_pipeline(
                args.input,
                args.limit,
                args.judge_a,
                args.judge_b,
                how_codes,
                run_severity=not args.no_severity,
            ))


if __name__ == "__main__":
    main()
