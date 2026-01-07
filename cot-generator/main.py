#!/usr/bin/env python3
"""
CoT Conversation Generator - Main Entry Point

Generate authentic chain-of-thought traces from simulated ecommerce 
customer support conversations.

Usage:
    python main.py --test          # Run single test conversation
    python main.py --count 100     # Generate 100 conversations
    python main.py --count 500 --modes helpful,conversion_optimized
"""

import argparse
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent))

from src.orchestrator import ConversationOrchestrator, run_single_test
from src.chatbot_modes import list_modes, get_mode_description
from src.personas import list_persona_ids, get_persona
import config


def main():
    parser = argparse.ArgumentParser(
        description="Generate CoT conversation traces for manipulation detection research"
    )
    
    parser.add_argument(
        "--test", 
        action="store_true",
        help="Run a single test conversation and print results"
    )
    
    parser.add_argument(
        "--count", 
        type=int, 
        default=10,
        help="Number of conversations to generate (default: 10)"
    )
    
    parser.add_argument(
        "--modes",
        type=str,
        default=None,
        help="Comma-separated list of modes to use (default: all)"
    )
    
    parser.add_argument(
        "--personas",
        type=str,
        default=None,
        help="Comma-separated list of persona IDs to use (default: all)"
    )
    
    parser.add_argument(
        "--list-modes",
        action="store_true",
        help="List available chatbot modes"
    )
    
    parser.add_argument(
        "--list-personas",
        action="store_true",
        help="List available customer personas"
    )

    parser.add_argument(
        "--balanced",
        type=int,
        metavar="N",
        help="Generate balanced batch: N clean + N manipulative examples (e.g., --balanced 50)"
    )

    parser.add_argument(
        "--adversarial",
        type=int,
        metavar="N",
        help="Generate adversarial batch: N conversations per mode-persona pairing (e.g., --adversarial 5)"
    )

    parser.add_argument(
        "--per-persona",
        type=int,
        metavar="N",
        help="Generate N conversations per persona (use with --modes and --personas)"
    )

    parser.add_argument(
        "--provider",
        type=str,
        choices=["deepseek-r1", "claude-3.7-sonnet", "claude-sonnet-4", "gpt-4o", "qwen-qwq", "mistral", "gemini-2.5-flash", "o4-mini"],
        default=None,
        help="Override chatbot provider (default: from config.py)"
    )

    args = parser.parse_args()

    # Override provider if specified
    if args.provider:
        config.CHATBOT_PROVIDER = args.provider
        config.CHATBOT_MODEL = config.CHATBOT_MODELS.get(args.provider)
        print(f"Using provider: {args.provider} (model: {config.CHATBOT_MODEL})")
    
    # List modes
    if args.list_modes:
        print("\nAvailable Chatbot Modes:")
        print("-" * 60)
        for mode_id in list_modes():
            print(f"  {get_mode_description(mode_id)}")
        print()
        return
    
    # List personas
    if args.list_personas:
        print("\nAvailable Customer Personas:")
        print("-" * 60)
        for persona_id in list_persona_ids():
            persona = get_persona(persona_id)
            tags = ", ".join(persona.get("tags", []))
            print(f"  {persona_id}: {persona['name']}")
            print(f"    Customer ID: {persona['customer_id']}")
            print(f"    Tags: {tags}")
            print()
        return
    
    # Check API key
    if not config.DEEPSEEK_API_KEY:
        print("ERROR: DEEPSEEK_API_KEY not set!")
        print("Set it with: export DEEPSEEK_API_KEY='your-key-here'")
        sys.exit(1)
    
    # Run test
    if args.test:
        print("Running test conversation...")
        run_single_test()
        return

    # Run balanced batch
    if args.balanced:
        orchestrator = ConversationOrchestrator()
        output_file = orchestrator.run_balanced_batch(
            count_per_category=args.balanced,
            personas=args.personas.split(",") if args.personas else None
        )
        print(f"\nBalanced batch complete!")
        print(f"Output file: {output_file}")
        return

    # Run adversarial batch
    if args.adversarial:
        orchestrator = ConversationOrchestrator()
        output_file = orchestrator.run_adversarial_batch(
            count_per_pairing=args.adversarial
        )
        print(f"\nAdversarial batch complete!")
        print(f"Output file: {output_file}")
        return

    # Run per-persona batch
    if args.per_persona:
        modes = args.modes.split(",") if args.modes else None
        personas = args.personas.split(",") if args.personas else None
        orchestrator = ConversationOrchestrator()
        output_file = orchestrator.run_per_persona_batch(
            count_per_persona=args.per_persona,
            modes=modes,
            personas=personas
        )
        print(f"\nPer-persona batch complete!")
        print(f"Output file: {output_file}")
        return

    # Parse modes and personas
    modes = args.modes.split(",") if args.modes else None
    personas = args.personas.split(",") if args.personas else None
    
    # Validate modes
    if modes:
        available = list_modes()
        for m in modes:
            if m not in available:
                print(f"ERROR: Unknown mode '{m}'. Available: {available}")
                sys.exit(1)
    
    # Validate personas
    if personas:
        available = list_persona_ids()
        for p in personas:
            if p not in available:
                print(f"ERROR: Unknown persona '{p}'. Available: {available}")
                sys.exit(1)
    
    # Run batch generation
    orchestrator = ConversationOrchestrator()
    output_file = orchestrator.run_batch(
        count=args.count,
        modes=modes,
        personas=personas
    )
    
    print(f"\nGeneration complete!")
    print(f"Output file: {output_file}")
    print(f"\nTo analyze the conversations:")
    print(f"  cat {output_file} | python -m json.tool")


if __name__ == "__main__":
    main()
