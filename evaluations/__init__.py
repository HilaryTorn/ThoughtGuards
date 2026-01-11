"""
ThoughtGuards LLM-Judge Pipeline

Modular evaluation system for detecting manipulation patterns in AI conversations.
"""

from .config import (
    AVAILABLE_JUDGES,
    DEFAULT_JUDGES,
    AXIS_WEIGHTS,
    PARTIAL_MATCH_THRESHOLD,
    OUTPUT_DIR,
)
from .taxonomy import TAXONOMY
from .judges import run_judge
from .agreement import calculate_pattern_similarity
from .confidence import calculate_evidence_score, calculate_confidence_alignment
from .aggregation import aggregate_n_evaluations, aggregate_evaluations
from .summary import build_summary, print_summary
from .pipeline import analyze_conversation, run_pipeline

__all__ = [
    # Config
    "AVAILABLE_JUDGES",
    "DEFAULT_JUDGES",
    "AXIS_WEIGHTS",
    "PARTIAL_MATCH_THRESHOLD",
    "OUTPUT_DIR",
    # Taxonomy
    "TAXONOMY",
    # Judges
    "run_judge",
    # Agreement
    "calculate_pattern_similarity",
    # Confidence
    "calculate_evidence_score",
    "calculate_confidence_alignment",
    # Aggregation
    "aggregate_n_evaluations",
    "aggregate_evaluations",
    # Summary
    "build_summary",
    "print_summary",
    # Pipeline
    "analyze_conversation",
    "run_pipeline",
]
