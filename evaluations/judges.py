"""
Judge implementations for running LLM evaluations.
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime
from typing import Dict, Any
import anthropic
from openai import OpenAI
import google.generativeai as genai

# Handle both direct execution and module import
try:
    from .config import (
        ANTHROPIC_API_KEY,
        LITELLM_BASE_URL,
        LITELLM_API_KEY,
        GOOGLE_API_KEY,
        AVAILABLE_JUDGES,
        JUDGE_TEMPERATURE,
    )
    from .prompts import JUDGE_SYSTEM_PROMPT, build_analysis_prompt
    from .formatters import format_conversation_for_judge
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))
    from config import (
        ANTHROPIC_API_KEY,
        LITELLM_BASE_URL,
        LITELLM_API_KEY,
        GOOGLE_API_KEY,
        AVAILABLE_JUDGES,
        JUDGE_TEMPERATURE,
    )
    from prompts import JUDGE_SYSTEM_PROMPT, build_analysis_prompt
    from formatters import format_conversation_for_judge

# Initialize clients
anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
litellm_client = OpenAI(base_url=LITELLM_BASE_URL, api_key=LITELLM_API_KEY) if LITELLM_API_KEY else None

# Initialize Google Gemini client
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    google_client = genai
else:
    google_client = None


async def judge_with_anthropic(conversation: Dict[str, Any], model: str, judge_id: str) -> Dict[str, Any]:
    """
    Run judgment using Anthropic API.

    Args:
        conversation: Conversation dict
        model: Model name
        judge_id: Judge identifier

    Returns:
        Judgment result dict
    """
    formatted = format_conversation_for_judge(conversation)
    conversation_id = conversation.get("conversation_id", "unknown")

    if not anthropic_client:
        return _make_error_result(conversation_id, model, judge_id, "Anthropic API key not configured")

    try:
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=4096,
            temperature=JUDGE_TEMPERATURE,
            system=JUDGE_SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": build_analysis_prompt(formatted)}
            ]
        )

        response_text = response.content[0].text
        result_data = _parse_json_response(response_text, conversation_id)

        tokens = response.usage.input_tokens + response.usage.output_tokens
        result_data["_tokens_used"] = tokens
        result_data["_model"] = model
        result_data["_judge_id"] = judge_id
        result_data["_provider"] = "anthropic"

        return result_data

    except Exception as e:
        print(f"  {judge_id} ({model}) judge error: {e}")
        return _make_error_result(conversation_id, model, judge_id, str(e))


async def judge_with_litellm(conversation: Dict[str, Any], model: str, judge_id: str) -> Dict[str, Any]:
    """
    Run judgment using LiteLLM/OpenAI-compatible API.

    Args:
        conversation: Conversation dict
        model: Model name
        judge_id: Judge identifier

    Returns:
        Judgment result dict
    """
    formatted = format_conversation_for_judge(conversation)
    conversation_id = conversation.get("conversation_id", "unknown")

    if not litellm_client:
        return _make_error_result(conversation_id, model, judge_id, "LiteLLM API key not configured")

    try:
        response = litellm_client.chat.completions.create(
            model=model,
            max_tokens=4096,
            messages=[
                {"role": "system", "content": JUDGE_SYSTEM_PROMPT},
                {"role": "user", "content": build_analysis_prompt(formatted)}
            ],
            temperature=JUDGE_TEMPERATURE,
        )

        response_text = response.choices[0].message.content
        result_data = _parse_json_response(response_text, conversation_id)

        tokens = 0
        if response.usage:
            tokens = (response.usage.prompt_tokens or 0) + (response.usage.completion_tokens or 0)
        result_data["_tokens_used"] = tokens
        result_data["_model"] = model
        result_data["_judge_id"] = judge_id
        result_data["_provider"] = "litellm"

        return result_data

    except Exception as e:
        print(f"  {judge_id} ({model}) judge error: {e}")
        return _make_error_result(conversation_id, model, judge_id, str(e))


async def judge_with_google(conversation: Dict[str, Any], model: str, judge_id: str) -> Dict[str, Any]:
    """
    Run judgment using Google Gemini API.

    Args:
        conversation: Conversation dict
        model: Model name
        judge_id: Judge identifier

    Returns:
        Judgment result dict
    """
    formatted = format_conversation_for_judge(conversation)
    conversation_id = conversation.get("conversation_id", "unknown")

    if not google_client:
        return _make_error_result(conversation_id, model, judge_id, "Google API key not configured")

    try:
        # Create the model instance
        gemini_model = google_client.GenerativeModel(
            model_name=model,
            generation_config={
                "temperature": JUDGE_TEMPERATURE,
                "max_output_tokens": 4096,
                "response_mime_type": "application/json",
            },
            system_instruction=JUDGE_SYSTEM_PROMPT,
        )

        # Generate response
        response = gemini_model.generate_content(
            build_analysis_prompt(formatted)
        )

        response_text = response.text
        result_data = _parse_json_response(response_text, conversation_id)

        # Extract token usage
        tokens = 0
        if hasattr(response, 'usage_metadata'):
            tokens = response.usage_metadata.total_token_count
        result_data["_tokens_used"] = tokens
        result_data["_model"] = model
        result_data["_judge_id"] = judge_id
        result_data["_provider"] = "google"

        return result_data

    except Exception as e:
        print(f"  {judge_id} ({model}) judge error: {e}")
        return _make_error_result(conversation_id, model, judge_id, str(e))


async def run_judge(conversation: Dict[str, Any], judge_id: str) -> Dict[str, Any]:
    """
    Run a single judge by ID.

    Args:
        conversation: Conversation dict
        judge_id: Judge identifier from AVAILABLE_JUDGES

    Returns:
        Judgment result dict
    """
    if judge_id not in AVAILABLE_JUDGES:
        raise ValueError(f"Unknown judge: {judge_id}. Available: {list(AVAILABLE_JUDGES.keys())}")

    judge_config = AVAILABLE_JUDGES[judge_id]
    model = judge_config["model"]
    provider = judge_config["provider"]

    if provider == "anthropic":
        return await judge_with_anthropic(conversation, model, judge_id)
    elif provider == "litellm":
        return await judge_with_litellm(conversation, model, judge_id)
    elif provider == "google":
        return await judge_with_google(conversation, model, judge_id)
    else:
        raise ValueError(f"Unknown provider: {provider}")


# ============================================================================
# JSON PARSING HELPERS
# ============================================================================

def _parse_json_response(response_text: str, conversation_id: str) -> Dict[str, Any]:
    """Extract JSON from model response with error recovery."""

    # Find JSON boundaries
    json_start = response_text.find("{")
    json_end = response_text.rfind("}") + 1

    if json_start < 0 or json_end <= json_start:
        raise ValueError("No JSON object found in response")

    json_str = response_text[json_start:json_end]

    # Try parsing as-is first
    try:
        result_data = json.loads(json_str)
    except json.JSONDecodeError as e:
        # Try to repair common JSON issues
        repaired = _attempt_json_repair(json_str)
        try:
            result_data = json.loads(repaired)
        except json.JSONDecodeError:
            # Last resort: try to extract just the essential structure
            result_data = _extract_minimal_structure(response_text, conversation_id)
            if result_data is None:
                raise e  # Re-raise original error

    if "conversation_id" not in result_data:
        result_data["conversation_id"] = conversation_id

    return result_data


def _attempt_json_repair(json_str: str) -> str:
    """Attempt to repair common JSON issues from LLM output."""

    repaired = json_str

    # Fix trailing commas before } or ]
    repaired = re.sub(r',\s*}', '}', repaired)
    repaired = re.sub(r',\s*]', ']', repaired)

    # Fix unescaped newlines in strings (common LLM issue)
    repaired = repaired.replace('\n', '\\n')
    repaired = repaired.replace('\r', '\\r')
    repaired = repaired.replace('\t', '\\t')

    return repaired


def _extract_minimal_structure(response_text: str, conversation_id: str) -> Dict[str, Any]:
    """Extract what we can from a malformed response."""

    # Try to find pattern triads mentioned in the text
    triad_pattern = r'[TH][1-6]\|[TH][1-6]\|[WH][1-4]'
    triads = re.findall(triad_pattern, response_text)

    # Try to find T/H/W labels
    target_match = re.search(r'"TARGET"\s*:\s*"(T[1-4])"', response_text)
    how_match = re.search(r'"HOW"\s*:\s*"(H[1-6])"', response_text)
    why_match = re.search(r'"WHY"\s*:\s*"(W[1-4])"', response_text)

    if triads or (target_match and how_match and why_match):
        # We found something useful
        patterns = []

        if triads:
            for triad in set(triads):
                parts = triad.split('|')
                if len(parts) == 3:
                    patterns.append({
                        "triad_pattern_id": triad,
                        "labels": {"TARGET": parts[0], "HOW": parts[1], "WHY": parts[2]},
                        "confidence": 0.5,  # Lower confidence for recovered data
                        "severity": 3,
                        "quotes": [],
                        "_recovered": True,
                    })
        elif target_match and how_match and why_match:
            t, h, w = target_match.group(1), how_match.group(1), why_match.group(1)
            patterns.append({
                "triad_pattern_id": f"{t}|{h}|{w}",
                "labels": {"TARGET": t, "HOW": h, "WHY": w},
                "confidence": 0.5,
                "severity": 3,
                "quotes": [],
                "_recovered": True,
            })

        return {
            "conversation_id": conversation_id,
            "manipulation_evaluations": [{
                "evaluator_id": "llm-judge",
                "evaluator_type": "model",
                "created_at": datetime.now().isoformat(),
                "patterns": patterns,
                "notes": "Partially recovered from malformed JSON response"
            }],
            "_recovered": True,
        }

    return None


def _make_error_result(conversation_id: str, model: str, judge_id: str, error: str) -> Dict[str, Any]:
    """Create error result structure."""
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
        "_model": model,
        "_judge_id": judge_id,
    }