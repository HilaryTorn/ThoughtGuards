"""
Judge implementations for evaluating conversations.
"""

import os
import json
from datetime import datetime
from typing import Dict, Any

import anthropic
from dotenv import load_dotenv

from .formatters import format_conversation_for_judge
from .prompts import build_judge_system_prompt, build_analysis_prompt

load_dotenv()

# Initialize Anthropic client
anthropic_client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

# Cache the system prompt (built once)
_SYSTEM_PROMPT = build_judge_system_prompt()


async def judge_with_model(conversation: dict, model: str) -> Dict[str, Any]:
    """
    Run judgment using specified Claude model.
    
    Args:
        conversation: Conversation dictionary
        model: Model name to use
        
    Returns:
        Judge result dictionary with patterns and metadata
    """
    formatted = format_conversation_for_judge(conversation)
    conversation_id = conversation.get("conversation_id", "unknown")
    
    user_prompt = build_analysis_prompt(formatted)

    try:
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=4096,
            system=_SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": user_prompt}
            ]
        )

        response_text = response.content[0].text
        
        # Extract JSON from response
        result_data = _extract_json_from_response(response_text)

        # Ensure required fields
        if "conversation_id" not in result_data:
            result_data["conversation_id"] = conversation_id

        # Add token usage metadata
        tokens = response.usage.input_tokens + response.usage.output_tokens
        result_data["_tokens_used"] = tokens
        result_data["_model"] = model

        return result_data

    except Exception as e:
        print(f"  {model} judge error: {e}")
        return _create_error_result(conversation_id, model, str(e))


def _extract_json_from_response(response_text: str) -> dict:
    """
    Extract JSON from LLM response.
    
    Handles cases where LLM includes text before/after JSON.
    
    Args:
        response_text: Raw response text
        
    Returns:
        Parsed JSON dictionary
        
    Raises:
        json.JSONDecodeError: If JSON cannot be parsed
    """
    # Try to find JSON boundaries
    json_start = response_text.find("{")
    json_end = response_text.rfind("}") + 1
    
    if json_start >= 0 and json_end > json_start:
        json_str = response_text[json_start:json_end]
        return json.loads(json_str)
    else:
        # Assume entire response is JSON
        return json.loads(response_text)


def _create_error_result(conversation_id: str, model: str, error: str) -> dict:
    """
    Create an error result structure.
    
    Args:
        conversation_id: Conversation ID
        model: Model name
        error: Error message
        
    Returns:
        Error result dictionary
    """
    return {
        "conversation_id": conversation_id,
        "manipulation_evaluations": [{
            "evaluator_id": "llm-judge",
            "evaluator_type": "model",
            "model_name": model,
            "created_at": datetime.now().isoformat(),
            "patterns": [],
            "notes": f"Error during analysis: {error}"
        }],
        "_error": error,
        "_model": model
    }


def validate_judge_result(result: dict) -> bool:
    """
    Validate that a judge result has the expected structure.
    
    Args:
        result: Judge result dictionary
        
    Returns:
        True if valid, False otherwise
    """
    required_fields = ["conversation_id", "manipulation_evaluations"]
    
    if not all(field in result for field in required_fields):
        return False
    
    evaluations = result.get("manipulation_evaluations", [])
    if not isinstance(evaluations, list):
        return False
    
    for eval_item in evaluations:
        if not isinstance(eval_item.get("patterns", []), list):
            return False
    
    return True


def extract_patterns_from_result(result: dict) -> list:
    """
    Extract all patterns from a judge result.
    
    Args:
        result: Judge result dictionary
        
    Returns:
        List of pattern dictionaries
    """
    patterns = []
    for eval_item in result.get("manipulation_evaluations", []):
        patterns.extend(eval_item.get("patterns", []))
    return patterns
