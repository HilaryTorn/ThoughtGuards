"""
Data models and type definitions for ThoughtGuards evaluation.
"""

from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime


# ============================================================================
# PATTERN MODELS
# ============================================================================

@dataclass
class Quote:
    """A quote from the conversation as evidence."""
    speaker: str
    message_index: int
    text: str


@dataclass
class Pattern:
    """A detected manipulation pattern."""
    triad_pattern_id: str
    labels: Dict[str, str]  # {"TARGET": "T2", "HOW": "H3", "WHY": "W1"}
    short_desc: str
    prominence: float  # 0.0-1.0
    confidence: float  # 0.0-1.0
    severity: int  # 0-5
    quotes: List[Quote]
    evidence_notes: str
    counterevidence_notes: Optional[str] = None
    
    # Metadata added during aggregation
    match_type: Optional[str] = None  # "exact", "partial", "single_judge"
    matched_with: Optional[str] = None
    similarity: Optional[float] = None
    detected_by: Optional[str] = None
    axis_disagreement: Optional[Dict[str, Dict[str, str]]] = None
    confidence_breakdown: Optional[Dict[str, Any]] = None


@dataclass
class Evaluation:
    """An evaluation from a single judge."""
    evaluator_id: str
    evaluator_type: str
    model_name: str
    created_at: str
    patterns: List[Pattern]
    notes: str


# ============================================================================
# CONVERSATION MODELS
# ============================================================================

@dataclass
class ToolCall:
    """A tool call made during conversation."""
    tool: str
    result: Dict[str, Any]


@dataclass
class Turn:
    """A single turn in the conversation."""
    turn: int
    role: str
    content: str
    reasoning_content: Optional[str] = None
    tool_calls: List[ToolCall] = field(default_factory=list)


@dataclass
class Conversation:
    """A complete conversation."""
    conversation_id: str
    chatbot_mode: str
    chatbot_model: Optional[str] = None
    persona_id: Optional[str] = None
    turns: List[Turn] = field(default_factory=list)


# ============================================================================
# RESULT MODELS
# ============================================================================

@dataclass
class ConfidenceBreakdown:
    """Detailed confidence calculation breakdown."""
    final_confidence: float
    base_confidence: float
    agreement_factor: float
    evidence_factor: float
    calibration_factor: float
    breakdown: str


@dataclass
class PatternMatch:
    """A match between patterns from two judges."""
    pattern_1: Optional[Pattern]
    pattern_2: Optional[Pattern]
    similarity: float
    match_type: str  # "exact", "partial", "unmatched_j1", "unmatched_j2"


@dataclass
class AgreementMetrics:
    """Agreement metrics between two judges."""
    agreement_type: str  # "both_clean", "full", "strong", "partial", "weak", "none"
    agreement_rate: float
    exact_matches: int
    partial_matches: int
    unmatched_j1: int
    unmatched_j2: int
    mean_similarity: float


@dataclass
class JudgeResult:
    """Result from a single judge."""
    conversation_id: str
    manipulation_evaluations: List[Evaluation]
    model: str
    tokens_used: Optional[int] = None
    error: Optional[str] = None


@dataclass
class AggregatedResult:
    """Aggregated result from multiple judges."""
    conversation_id: str
    manipulation_evaluations: List[Evaluation]
    meta: Dict[str, Any]
    source: Dict[str, Any]
    judge_1_result: Optional[JudgeResult] = None
    judge_2_result: Optional[JudgeResult] = None


# ============================================================================
# SUMMARY MODELS
# ============================================================================

@dataclass
class SummaryStats:
    """Summary statistics from a pipeline run."""
    run_timestamp: str
    total_conversations: int
    judge_1_model: str
    judge_2_model: str
    total_tokens_used: int
    agreement_distribution: Dict[str, int]
    agreement_stats: Dict[str, Any]
    axis_weights_used: Dict[str, float]
    partial_match_threshold: float
    pattern_counts_by_axis: Dict[str, Dict[str, int]]
    triad_pattern_counts: Dict[str, int]
    avg_severity: float
    conversations_with_patterns: int


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def dict_to_pattern(data: dict) -> Pattern:
    """Convert dictionary to Pattern object."""
    quotes = [Quote(**q) for q in data.get("quotes", [])]
    return Pattern(
        triad_pattern_id=data.get("triad_pattern_id", ""),
        labels=data.get("labels", {}),
        short_desc=data.get("short_desc", ""),
        prominence=data.get("prominence", 0.0),
        confidence=data.get("confidence", 0.0),
        severity=data.get("severity", 0),
        quotes=quotes,
        evidence_notes=data.get("evidence_notes", ""),
        counterevidence_notes=data.get("counterevidence_notes"),
    )


def pattern_to_dict(pattern: Pattern) -> dict:
    """Convert Pattern object to dictionary."""
    result = {
        "triad_pattern_id": pattern.triad_pattern_id,
        "labels": pattern.labels,
        "short_desc": pattern.short_desc,
        "prominence": pattern.prominence,
        "confidence": pattern.confidence,
        "severity": pattern.severity,
        "quotes": [
            {
                "speaker": q.speaker,
                "message_index": q.message_index,
                "text": q.text
            }
            for q in pattern.quotes
        ],
        "evidence_notes": pattern.evidence_notes,
        "counterevidence_notes": pattern.counterevidence_notes,
    }
    
    # Add optional metadata if present
    if pattern.match_type:
        result["_match_type"] = pattern.match_type
    if pattern.matched_with:
        result["_matched_with"] = pattern.matched_with
    if pattern.similarity is not None:
        result["_similarity"] = pattern.similarity
    if pattern.detected_by:
        result["_detected_by"] = pattern.detected_by
    if pattern.axis_disagreement:
        result["_axis_disagreement"] = pattern.axis_disagreement
    if pattern.confidence_breakdown:
        result["_confidence_breakdown"] = pattern.confidence_breakdown
    
    return result
