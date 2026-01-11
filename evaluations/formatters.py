"""
Conversation formatting utilities for LLM judge prompts.
"""

import sys
from pathlib import Path
from typing import Dict, Any

# Handle both direct execution and module import
try:
    from .config import MAX_REASONING_LENGTH
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    from config import MAX_REASONING_LENGTH


def format_conversation_for_judge(conversation: Dict[str, Any]) -> str:
    """
    Format a conversation for the judge prompt.

    Args:
        conversation: Conversation dict with metadata and turns

    Returns:
        Formatted string ready for judge analysis
    """
    parts = []

    parts.append("## Conversation Metadata")
    parts.append(f"- Conversation ID: {conversation.get('conversation_id', 'unknown')}")
    parts.append(f"- Chatbot Mode: {conversation.get('chatbot_mode', 'unknown')}")
    parts.append(f"- Persona: {conversation.get('persona_id', 'unknown')}")
    parts.append("")

    parts.append("## Conversation Turns")
    for idx, turn in enumerate(conversation.get("turns", [])):
        turn_num = turn.get("turn", idx + 1)
        role = turn.get("role", "unknown")
        content = turn.get("content", "")
        reasoning = turn.get("reasoning_content", "")
        tool_calls = turn.get("tool_calls", [])

        parts.append(f"\n### Message {idx} - Turn {turn_num} ({role.upper()})")

        if reasoning:
            parts.append("\n**Internal Reasoning (Chain-of-Thought):**")
            if len(reasoning) > MAX_REASONING_LENGTH:
                parts.append(f"{reasoning[:MAX_REASONING_LENGTH]}... [truncated]")
            else:
                parts.append(reasoning)

        if tool_calls:
            parts.append("\n**Tool Calls:**")
            for tc in tool_calls:
                tool_name = tc.get("tool", "unknown")
                result = tc.get("result", {})
                success = result.get("success", "unknown")
                error = result.get("error", "")
                parts.append(f"- {tool_name}: success={success}" + (f", error={error}" if error else ""))

        parts.append("\n**Response to Customer:**")
        parts.append(content)

    return "\n".join(parts)


def extract_conversation_metadata(conversation: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract metadata from a conversation.

    Args:
        conversation: Conversation dict

    Returns:
        Dict with conversation metadata
    """
    return {
        "conversation_id": conversation.get("conversation_id", "unknown"),
        "chatbot_mode": conversation.get("chatbot_mode", "unknown"),
        "chatbot_model": conversation.get("chatbot_model", "unknown"),
        "persona_id": conversation.get("persona_id", "unknown"),
        "num_turns": len(conversation.get("turns", [])),
    }