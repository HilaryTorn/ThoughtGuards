"""
ThoughtGuards LLM-Judge Pipeline v2

Refactored, modular evaluation system for detecting manipulation patterns
in AI conversations using the ThoughtGuards taxonomy.

Architecture:
- config.py: Configuration and constants
- taxonomy.py: Taxonomy definitions and helpers
- prompts.py: Optimized LLM prompts
- models.py: Data structures and types
- formatters.py: Conversation formatting
- judges.py: Judge implementations
- confidence.py: Confidence calculation
- agreement.py: Pattern matching and agreement
- aggregation.py: Result aggregation
- summary.py: Statistics and reporting
- pipeline.py: Main orchestration
- cli.py: Command-line interface

Usage:
    # As a module
    python -m evaluations_v2 --input "path/**/*.json"
    
    # Single file
    python -m evaluations_v2 --single "path/to/file.json"
    
    # Programmatic
    from evaluations_v2.pipeline import run_pipeline
    results = await run_pipeline("output/**/*.json")
"""

__version__ = "2.0.0"

from .pipeline import run_pipeline, run_single_file, analyze_conversation
from .config import JUDGE_MODEL_1, JUDGE_MODEL_2
from .taxonomy import TAXONOMY

__all__ = [
    "run_pipeline",
    "run_single_file", 
    "analyze_conversation",
    "JUDGE_MODEL_1",
    "JUDGE_MODEL_2",
    "TAXONOMY",
]
