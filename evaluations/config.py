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

# ============================================================================
# JUDGE CONFIGURATION
# ============================================================================

# Available judges configuration
# Format: {judge_id: {"model": model_name, "provider": "anthropic"|"litellm", "description": str}}
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
}

# Default judges to use (all 4)
DEFAULT_JUDGES = ["sonnet", "haiku", "mistral", "compassj"]

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

# ============================================================================
# OUTPUT CONFIGURATION
# ============================================================================

# Output directory relative to script location (not cwd)
OUTPUT_DIR = Path(__file__).parent / "judge_results"
OUTPUT_DIR.mkdir(exist_ok=True)

# Maximum reasoning content length in formatted conversations
MAX_REASONING_LENGTH = 4000