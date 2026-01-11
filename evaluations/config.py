"""
Configuration and constants for ThoughtGuards LLM-Judge Pipeline.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# ============================================================================
# API CONFIGURATION
# ============================================================================

# Anthropic API
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# LiteLLM proxy endpoint (OpenAI-compatible)
LITELLM_BASE_URL = os.getenv("LITELLM_BASE_URL", "http://158.101.122.84:4204/v1")
LITELLM_API_KEY = os.getenv("LITELLM_API_KEY", "")

# Google API (for Gemini models)
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY", "")

# ============================================================================
# JUDGE CONFIGURATION
# ============================================================================

# Available judges configuration
# Format: {judge_id: {"model": model_name, "provider": "anthropic"|"litellm"|"google", "description": str}}
AVAILABLE_JUDGES = {
    "sonnet": {
        "model": "claude-sonnet-4-20250514",
        "provider": "anthropic",
        "description": "Claude Sonnet 4 (Anthropic)",
    },
    "haiku": {
        "model": "claude-haiku-4-5-20251001",
        "provider": "anthropic",
        "description": "Claude Haiku 4.5 (Anthropic)",
    },
    "mistral": {
        "model": "mistral-nemo",
        "provider": "litellm",
        "description": "Mistral Nemo (LiteLLM)",
    },
    "compassj": {
        "model": "compassj-7b",
        "provider": "litellm",
        "description": "CompassJ 7B (Judge model)",
    },
    "gemini-flash": {
        "model": "gemini-3-flash-preview",
        "provider": "google",
        "description": "Gemini 3 Flash Preview (Google)",
    },
}

# Default judges to use (all 5 now)
DEFAULT_JUDGES = ["sonnet", "haiku", "mistral", "compassj", "gemini-flash"]

# ============================================================================
# AGREEMENT & CONFIDENCE WEIGHTS
# ============================================================================

# Axis weights for partial agreement calculation
# HOW weighted highest: the observable action is most concrete/verifiable
# TARGET next: what's affected is fairly objective
# WHY lowest: intent is hardest to infer, most subjective
AXIS_WEIGHTS = {
    "HOW": 0.5,
    "TARGET": 0.3,
    "WHY": 0.2,
}

# Minimum similarity score to count as a partial match
PARTIAL_MATCH_THRESHOLD = 0.5

# Temperature for judge LLM calls (0 = deterministic, 1 = creative)
JUDGE_TEMPERATURE = 0

# Whether to use zero-shot prompts (True = zero-shot, False = few-shot with examples)
ZERO_SHOT = True

# ============================================================================
# OUTPUT CONFIGURATION
# ============================================================================

# Output directory relative to script location (not cwd)
OUTPUT_DIR = Path(__file__).parent / "judge_results"
OUTPUT_DIR.mkdir(exist_ok=True)

# Maximum reasoning content length in formatted conversations
MAX_REASONING_LENGTH = 4000