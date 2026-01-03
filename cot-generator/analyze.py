#!/usr/bin/env python3
"""
Utility script for analyzing generated conversations.
Quick stats and extraction of CoT traces for detector testing.
"""

import json
import sys
from pathlib import Path
from collections import Counter
from typing import List, Dict, Any


def load_conversations(filepath: str) -> List[Dict[str, Any]]:
    """Load conversations from JSONL file."""
    conversations = []
    with open(filepath) as f:
        for line in f:
            if line.strip():
                conversations.append(json.loads(line))
    return conversations


def print_stats(conversations: List[Dict[str, Any]]):
    """Print summary statistics."""
    print("\n" + "="*60)
    print("CONVERSATION STATISTICS")
    print("="*60)
    
    print(f"\nTotal conversations: {len(conversations)}")
    
    # Mode distribution
    modes = Counter(c["chatbot_mode"] for c in conversations)
    print(f"\nBy chatbot mode:")
    for mode, count in modes.most_common():
        print(f"  {mode}: {count} ({100*count/len(conversations):.1f}%)")
    
    # Persona distribution
    personas = Counter(c["persona_id"] for c in conversations)
    print(f"\nBy persona:")
    for persona, count in personas.most_common():
        print(f"  {persona}: {count}")
    
    # Turn statistics
    turn_counts = [c["metadata"]["total_turns"] for c in conversations]
    print(f"\nTurn statistics:")
    print(f"  Average turns: {sum(turn_counts)/len(turn_counts):.1f}")
    print(f"  Min turns: {min(turn_counts)}")
    print(f"  Max turns: {max(turn_counts)}")
    
    # Tool usage
    tool_counts = [c["metadata"]["total_tool_calls"] for c in conversations]
    print(f"\nTool usage:")
    print(f"  Average tool calls per conversation: {sum(tool_counts)/len(tool_counts):.1f}")
    print(f"  Conversations with tool calls: {sum(1 for t in tool_counts if t > 0)}")
    
    # Count CoT traces
    cot_count = 0
    for c in conversations:
        for turn in c["turns"]:
            if turn.get("reasoning_content"):
                cot_count += 1
    print(f"\nCoT traces captured: {cot_count}")


def extract_cot_traces(conversations: List[Dict[str, Any]], output_file: str):
    """Extract all CoT traces to a separate file for analysis."""
    traces = []
    
    for conv in conversations:
        for turn in conv["turns"]:
            if turn.get("reasoning_content"):
                traces.append({
                    "conversation_id": conv["conversation_id"],
                    "chatbot_mode": conv["chatbot_mode"],
                    "persona_id": conv["persona_id"],
                    "turn": turn["turn"],
                    "reasoning_content": turn["reasoning_content"],
                    "response": turn["content"],
                    "tool_calls": turn.get("tool_calls", [])
                })
    
    with open(output_file, "w") as f:
        for trace in traces:
            f.write(json.dumps(trace) + "\n")
    
    print(f"\nExtracted {len(traces)} CoT traces to {output_file}")


def sample_conversation(conversations: List[Dict[str, Any]], mode: str = None):
    """Print a sample conversation."""
    if mode:
        filtered = [c for c in conversations if c["chatbot_mode"] == mode]
        if not filtered:
            print(f"No conversations found with mode: {mode}")
            return
        conv = filtered[0]
    else:
        conv = conversations[0]
    
    print("\n" + "="*60)
    print(f"SAMPLE CONVERSATION: {conv['conversation_id']}")
    print("="*60)
    print(f"Persona: {conv['persona_name']} ({conv['persona_id']})")
    print(f"Mode: {conv['chatbot_mode']}")
    print("-"*60)
    
    for turn in conv["turns"]:
        role = "CUSTOMER" if turn["role"] == "customer" else "AGENT"
        print(f"\n[{role}]")
        print(turn["content"][:500] + "..." if len(turn["content"]) > 500 else turn["content"])
        
        if turn.get("reasoning_content"):
            print(f"\n  📊 [CoT TRACE]")
            cot = turn["reasoning_content"]
            print(f"  {cot[:800]}..." if len(cot) > 800 else f"  {cot}")


def main():
    if len(sys.argv) < 2:
        print("Usage: python analyze.py <conversations.jsonl> [--extract-cot output.jsonl] [--sample [mode]]")
        sys.exit(1)
    
    filepath = sys.argv[1]
    conversations = load_conversations(filepath)
    
    if "--extract-cot" in sys.argv:
        idx = sys.argv.index("--extract-cot")
        output = sys.argv[idx + 1] if idx + 1 < len(sys.argv) else "cot_traces.jsonl"
        extract_cot_traces(conversations, output)
    
    if "--sample" in sys.argv:
        idx = sys.argv.index("--sample")
        mode = sys.argv[idx + 1] if idx + 1 < len(sys.argv) and not sys.argv[idx + 1].startswith("--") else None
        sample_conversation(conversations, mode)
    else:
        print_stats(conversations)
        sample_conversation(conversations)


if __name__ == "__main__":
    main()
