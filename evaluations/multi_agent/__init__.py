"""
Multi-Agent ThoughtGuards Evaluation System

Dual-judge architecture with specialized HOW-code detectors:
    Judge A = 6 specialists (H1-H6) using Model X
    Judge B = 6 specialists (H1-H6) using Model Y

Usage:
    # From evaluations directory
    python -m multi_agent -i "conversations/*.json"
    
    # Programmatic
    from evaluations.multi_agent import run_dual_judge_pipeline
    results = await run_dual_judge_pipeline("conversations/*.json")
"""

import sys
from pathlib import Path

# Ensure parent is in path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from .prompts import (
    SPECIALIST_PROMPTS,
    SPECIALIST_NAMES,
    get_specialist_prompt,
    build_specialist_analysis_prompt,
    SEVERITY_SCORER_PROMPT,
)
from .judges import (
    run_specialist_judge,
    run_all_specialists,
    run_severity_scorer,
    ALL_HOW_CODES,
)
from .aggregator import (
    aggregate_specialist_results,
    aggregate_dual_judges,
)
from .pipeline import (
    analyze_conversation_multi_agent,
    analyze_conversation_dual_judge,
    run_multi_agent_pipeline,
    run_dual_judge_pipeline,
    MULTI_AGENT_OUTPUT_DIR,
)

__all__ = [
    # Prompts
    "SPECIALIST_PROMPTS",
    "SPECIALIST_NAMES",
    "get_specialist_prompt",
    "build_specialist_analysis_prompt",
    "SEVERITY_SCORER_PROMPT",
    # Judges
    "run_specialist_judge",
    "run_all_specialists",
    "run_severity_scorer",
    "ALL_HOW_CODES",
    # Aggregation
    "aggregate_specialist_results",
    "aggregate_dual_judges",
    # Pipeline
    "analyze_conversation_multi_agent",
    "analyze_conversation_dual_judge",
    "run_multi_agent_pipeline",
    "run_dual_judge_pipeline",
    "MULTI_AGENT_OUTPUT_DIR",
]
