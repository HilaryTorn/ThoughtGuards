"""
Multi-Agent Judge Implementations

Each HOW code has a specialized judge that runs independently.
Results are then aggregated by the multi_agent.aggregator.

Part of evaluations.multi_agent submodule.
"""

import json
import re
import asyncio
import sys
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, List, Optional
import anthropic
from openai import OpenAI

# Handle imports for both module and direct execution
try:
    from ..config import (
        ANTHROPIC_API_KEY,
        LITELLM_BASE_URL,
        LITELLM_API_KEY,
        AVAILABLE_JUDGES,
    )
    from ..formatters import format_conversation_for_judge
except ImportError:
    # Running directly or from evaluations directory
    sys.path.insert(0, str(Path(__file__).parent.parent))
    from config import (
        ANTHROPIC_API_KEY,
        LITELLM_BASE_URL,
        LITELLM_API_KEY,
        AVAILABLE_JUDGES,
    )
    from formatters import format_conversation_for_judge

from .prompts import (
    get_specialist_prompt,
    build_specialist_analysis_prompt,
    SEVERITY_SCORER_PROMPT,
    build_severity_prompt,
    SPECIALIST_NAMES,
)

# Initialize clients
anthropic_client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
litellm_client = OpenAI(base_url=LITELLM_BASE_URL, api_key=LITELLM_API_KEY) if LITELLM_API_KEY else None

# All HOW codes to evaluate
ALL_HOW_CODES = ["H1", "H2", "H3", "H4", "H5", "H6"]


# ============================================================================
# SPECIALIZED JUDGE EXECUTION
# ============================================================================

async def run_specialist_judge_anthropic(
    conversation: Dict[str, Any],
    how_code: str,
    model: str = "claude-sonnet-4-20250514"
) -> Dict[str, Any]:
    """
    Run a specialized HOW-code judge using Anthropic API.
    
    Args:
        conversation: The conversation to analyze
        how_code: Which HOW code this judge specializes in (H1-H6)
        model: Which Anthropic model to use
    
    Returns:
        Specialist evaluation result
    """
    formatted = format_conversation_for_judge(conversation)
    conversation_id = conversation.get("conversation_id", "unknown")
    
    if not anthropic_client:
        return _make_specialist_error(conversation_id, how_code, model, "Anthropic API key not configured")
    
    system_prompt = get_specialist_prompt(how_code)
    user_prompt = build_specialist_analysis_prompt(formatted, how_code)
    
    try:
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=2048,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0
        )
        
        response_text = response.content[0].text
        result_data = _parse_specialist_response(response_text, conversation_id, how_code)
        
        tokens = response.usage.input_tokens + response.usage.output_tokens
        result_data["_tokens_used"] = tokens
        result_data["_model"] = model
        result_data["_provider"] = "anthropic"
        result_data["_how_code"] = how_code
        result_data["_specialist_name"] = SPECIALIST_NAMES.get(how_code, how_code)
        
        return result_data
        
    except Exception as e:
        print(f"  {how_code} specialist error: {e}")
        return _make_specialist_error(conversation_id, how_code, model, str(e))


async def run_specialist_judge_litellm(
    conversation: Dict[str, Any],
    how_code: str,
    model: str = "mistral-nemo"
) -> Dict[str, Any]:
    """
    Run a specialized HOW-code judge using LiteLLM API.
    """
    formatted = format_conversation_for_judge(conversation)
    conversation_id = conversation.get("conversation_id", "unknown")
    
    if not litellm_client:
        return _make_specialist_error(conversation_id, how_code, model, "LiteLLM API key not configured")
    
    system_prompt = get_specialist_prompt(how_code)
    user_prompt = build_specialist_analysis_prompt(formatted, how_code)
    
    try:
        response = litellm_client.chat.completions.create(
            model=model,
            max_tokens=2048,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0,
        )
        
        response_text = response.choices[0].message.content
        result_data = _parse_specialist_response(response_text, conversation_id, how_code)
        
        tokens = 0
        if response.usage:
            tokens = (response.usage.prompt_tokens or 0) + (response.usage.completion_tokens or 0)
        result_data["_tokens_used"] = tokens
        result_data["_model"] = model
        result_data["_provider"] = "litellm"
        result_data["_how_code"] = how_code
        result_data["_specialist_name"] = SPECIALIST_NAMES.get(how_code, how_code)
        
        return result_data
        
    except Exception as e:
        print(f"  {how_code} specialist error: {e}")
        return _make_specialist_error(conversation_id, how_code, model, str(e))


async def run_specialist_judge(
    conversation: Dict[str, Any],
    how_code: str,
    judge_id: str = "sonnet"
) -> Dict[str, Any]:
    """
    Run a specialized judge by ID.
    
    Args:
        conversation: Conversation to analyze
        how_code: HOW code (H1-H6)
        judge_id: Judge ID from AVAILABLE_JUDGES
    
    Returns:
        Specialist evaluation result
    """
    if judge_id not in AVAILABLE_JUDGES:
        raise ValueError(f"Unknown judge: {judge_id}")
    
    judge_config = AVAILABLE_JUDGES[judge_id]
    model = judge_config["model"]
    provider = judge_config["provider"]
    
    if provider == "anthropic":
        return await run_specialist_judge_anthropic(conversation, how_code, model)
    elif provider == "litellm":
        return await run_specialist_judge_litellm(conversation, how_code, model)
    else:
        raise ValueError(f"Unknown provider: {provider}")


# ============================================================================
# SEVERITY SCORER
# ============================================================================

async def run_severity_scorer(
    conversation_id: str,
    patterns: List[Dict[str, Any]],
    model: str = "claude-sonnet-4-20250514"
) -> Dict[str, Any]:
    """
    Run severity scoring on detected patterns.
    
    Args:
        conversation_id: ID of the conversation
        patterns: List of patterns detected by specialist judges
        model: Model to use for severity scoring
    
    Returns:
        Severity assessment
    """
    if not patterns:
        return {
            "conversation_id": conversation_id,
            "severity_assessment": {
                "patterns": [],
                "overall_risk_level": "none",
                "overall_notes": "No patterns detected by specialist judges"
            },
            "_tokens_used": 0,
            "_model": model
        }
    
    if not anthropic_client:
        return _make_severity_error(conversation_id, model, "Anthropic API key not configured")
    
    patterns_json = json.dumps(patterns, indent=2)
    user_prompt = build_severity_prompt(patterns_json)
    
    try:
        response = anthropic_client.messages.create(
            model=model,
            max_tokens=2048,
            system=SEVERITY_SCORER_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
            temperature=0
        )
        
        response_text = response.content[0].text
        result_data = _parse_severity_response(response_text, conversation_id)
        
        tokens = response.usage.input_tokens + response.usage.output_tokens
        result_data["_tokens_used"] = tokens
        result_data["_model"] = model
        
        return result_data
        
    except Exception as e:
        print(f"  Severity scorer error: {e}")
        return _make_severity_error(conversation_id, model, str(e))


# ============================================================================
# ALL SPECIALISTS RUNNER
# ============================================================================

async def run_all_specialists(
    conversation: Dict[str, Any],
    judge_id: str = "sonnet",
    how_codes: List[str] = None
) -> Dict[str, Dict[str, Any]]:
    """
    Run all specialized judges in parallel.
    
    Args:
        conversation: Conversation to analyze
        judge_id: Which judge model to use
        how_codes: Which HOW codes to run (default: all)
    
    Returns:
        Dict mapping HOW code to result
    """
    if how_codes is None:
        how_codes = ALL_HOW_CODES
    
    # Run all specialists in parallel
    tasks = [
        run_specialist_judge(conversation, how_code, judge_id)
        for how_code in how_codes
    ]
    
    results = await asyncio.gather(*tasks)
    
    # Map results by HOW code
    return {
        how_code: result
        for how_code, result in zip(how_codes, results)
    }


# ============================================================================
# PARSING HELPERS
# ============================================================================

def _parse_specialist_response(response_text: str, conversation_id: str, how_code: str) -> Dict[str, Any]:
    """Parse specialist judge response."""
    
    # Find JSON boundaries
    json_start = response_text.find("{")
    json_end = response_text.rfind("}") + 1
    
    if json_start < 0 or json_end <= json_start:
        # No JSON found, create empty result
        return {
            "conversation_id": conversation_id,
            "specialist_evaluation": {
                "specialist_type": f"{how_code}_specialist",
                "patterns_detected": [],
                "clean_assessment": "Could not parse response",
                "notes": f"Raw response: {response_text[:500]}"
            },
            "_parse_error": True
        }
    
    json_str = response_text[json_start:json_end]
    
    try:
        result_data = json.loads(json_str)
    except json.JSONDecodeError:
        # Try to repair
        repaired = _attempt_json_repair(json_str)
        try:
            result_data = json.loads(repaired)
        except json.JSONDecodeError:
            # Try to extract patterns from text
            result_data = _extract_patterns_from_text(response_text, conversation_id, how_code)
    
    # Ensure required fields
    if "conversation_id" not in result_data:
        result_data["conversation_id"] = conversation_id
    
    if "specialist_evaluation" not in result_data:
        result_data["specialist_evaluation"] = {
            "specialist_type": f"{how_code}_specialist",
            "patterns_detected": [],
            "notes": "Structure recovered from malformed response"
        }
    
    return result_data


def _parse_severity_response(response_text: str, conversation_id: str) -> Dict[str, Any]:
    """Parse severity scorer response."""
    
    json_start = response_text.find("{")
    json_end = response_text.rfind("}") + 1
    
    if json_start < 0 or json_end <= json_start:
        return {
            "conversation_id": conversation_id,
            "severity_assessment": {
                "patterns": [],
                "overall_risk_level": "unknown",
                "overall_notes": "Could not parse severity response"
            },
            "_parse_error": True
        }
    
    json_str = response_text[json_start:json_end]
    
    try:
        result_data = json.loads(json_str)
    except json.JSONDecodeError:
        repaired = _attempt_json_repair(json_str)
        try:
            result_data = json.loads(repaired)
        except json.JSONDecodeError:
            return {
                "conversation_id": conversation_id,
                "severity_assessment": {
                    "patterns": [],
                    "overall_risk_level": "unknown",
                    "overall_notes": "JSON parse error in severity response"
                },
                "_parse_error": True
            }
    
    if "conversation_id" not in result_data:
        result_data["conversation_id"] = conversation_id
    
    return result_data


def _attempt_json_repair(json_str: str) -> str:
    """Attempt to repair common JSON issues."""
    repaired = json_str
    repaired = re.sub(r',\s*}', '}', repaired)
    repaired = re.sub(r',\s*]', ']', repaired)
    repaired = repaired.replace('\n', '\\n')
    repaired = repaired.replace('\r', '\\r')
    repaired = repaired.replace('\t', '\\t')
    return repaired


def _extract_patterns_from_text(response_text: str, conversation_id: str, how_code: str) -> Dict[str, Any]:
    """Extract patterns from malformed response text."""
    
    patterns = []
    
    # Look for triad patterns
    triad_pattern = r'T[1-4]\|H[1-6]\|W[1-4]'
    triads = re.findall(triad_pattern, response_text)
    
    for triad in set(triads):
        parts = triad.split('|')
        if len(parts) == 3 and parts[1] == how_code:
            patterns.append({
                "how_code": how_code,
                "target_code": parts[0],
                "why_code": parts[2],
                "triad_pattern_id": triad,
                "short_desc": f"Recovered {how_code} pattern",
                "confidence": 0.5,
                "quotes": [],
                "evidence_notes": "Extracted from malformed response",
                "_recovered": True
            })
    
    return {
        "conversation_id": conversation_id,
        "specialist_evaluation": {
            "specialist_type": f"{how_code}_specialist",
            "patterns_detected": patterns,
            "notes": "Patterns recovered from text extraction"
        },
        "_recovered": True
    }


def _make_specialist_error(conversation_id: str, how_code: str, model: str, error: str) -> Dict[str, Any]:
    """Create error result for specialist judge."""
    return {
        "conversation_id": conversation_id,
        "specialist_evaluation": {
            "specialist_type": f"{how_code}_specialist",
            "patterns_detected": [],
            "notes": f"Error: {error}"
        },
        "_error": error,
        "_model": model,
        "_how_code": how_code
    }


def _make_severity_error(conversation_id: str, model: str, error: str) -> Dict[str, Any]:
    """Create error result for severity scorer."""
    return {
        "conversation_id": conversation_id,
        "severity_assessment": {
            "patterns": [],
            "overall_risk_level": "error",
            "overall_notes": f"Error: {error}"
        },
        "_error": error,
        "_model": model
    }
