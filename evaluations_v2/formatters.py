"""
Conversation formatting utilities for judge prompts.
"""

from typing import Dict, Any
from .config import MAX_REASONING_LENGTH


def format_conversation_for_judge(conversation: dict) -> str:
    """
    Format a conversation for the judge prompt.
    
    Structures the conversation with:
    - Clear metadata section
    - Numbered turns with role labels
    - Separated reasoning (CoT) and output
    - Tool call summaries
    
    Args:
        conversation: Conversation dictionary
        
    Returns:
        Formatted conversation string
    """
    parts = []

    # Metadata section
    parts.append("## Conversation Metadata")
    parts.append(f"- Conversation ID: {conversation.get('conversation_id', 'unknown')}")
    parts.append(f"- Chatbot Mode: {conversation.get('chatbot_mode', 'unknown')}")
    parts.append(f"- Persona: {conversation.get('persona_id', 'unknown')}")
    parts.append("")

    # Conversation turns
    parts.append("## Conversation Turns")
    
    for idx, turn in enumerate(conversation.get("turns", [])):
        turn_num = turn.get("turn", idx + 1)
        role = turn.get("role", "unknown")
        content = turn.get("content", "")
        reasoning = turn.get("reasoning_content", "")
        tool_calls = turn.get("tool_calls", [])

        parts.append(f"\n### Message {idx} - Turn {turn_num} ({role.upper()})")

        # Internal reasoning (CoT) - most important for detection
        if reasoning:
            parts.append("\n**Internal Reasoning (Chain-of-Thought):**")
            formatted_reasoning = _format_reasoning(reasoning)
            parts.append(formatted_reasoning)

        # Tool calls - important for detecting misrepresentation
        if tool_calls:
            parts.append("\n**Tool Calls:**")
            for tc in tool_calls:
                formatted_tool = _format_tool_call(tc)
                parts.append(formatted_tool)

        # User-facing response
        parts.append("\n**Response to Customer:**")
        parts.append(content)

    return "\n".join(parts)


def _format_reasoning(reasoning: str) -> str:
    """
    Format reasoning content with truncation if needed.
    
    Args:
        reasoning: Raw reasoning content
        
    Returns:
        Formatted reasoning string
    """
    if len(reasoning) > MAX_REASONING_LENGTH:
        return f"{reasoning[:MAX_REASONING_LENGTH]}... [truncated]"
    return reasoning


def _format_tool_call(tool_call: dict) -> str:
    """
    Format a single tool call for display.
    
    Args:
        tool_call: Tool call dictionary
        
    Returns:
        Formatted tool call string
    """
    tool_name = tool_call.get("tool", "unknown")
    result = tool_call.get("result", {})
    success = result.get("success", "unknown")
    error = result.get("error", "")
    
    formatted = f"- {tool_name}: success={success}"
    if error:
        formatted += f", error={error}"
    
    return formatted


def extract_metadata(conversation: dict) -> Dict[str, Any]:
    """
    Extract metadata from conversation for result tracking.
    
    Args:
        conversation: Conversation dictionary
        
    Returns:
        Metadata dictionary
    """
    return {
        "conversation_id": conversation.get("conversation_id", "unknown"),
        "chatbot_mode": conversation.get("chatbot_mode"),
        "chatbot_model": conversation.get("chatbot_model"),
        "persona_id": conversation.get("persona_id"),
    }


def count_turns(conversation: dict) -> int:
    """
    Count the number of turns in a conversation.
    
    Args:
        conversation: Conversation dictionary
        
    Returns:
        Number of turns
    """
    return len(conversation.get("turns", []))


def has_reasoning(conversation: dict) -> bool:
    """
    Check if conversation has any reasoning content.
    
    Args:
        conversation: Conversation dictionary
        
    Returns:
        True if any turn has reasoning content
    """
    for turn in conversation.get("turns", []):
        if turn.get("reasoning_content"):
            return True
    return False


def has_tool_calls(conversation: dict) -> bool:
    """
    Check if conversation has any tool calls.
    
    Args:
        conversation: Conversation dictionary
        
    Returns:
        True if any turn has tool calls
    """
    for turn in conversation.get("turns", []):
        if turn.get("tool_calls"):
            return True
    return False
