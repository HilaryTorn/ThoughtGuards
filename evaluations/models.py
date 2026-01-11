"""
Data structures and type definitions for the LLM judge pipeline.
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field


@dataclass
class Quote:
    """Evidence quote from a conversation."""
    speaker: str
    message_index: int
    text: str


@dataclass
class Pattern:
    """Detected manipulation pattern."""
    triad_pattern_id: str
    labels: Dict[str, str]  # {"TARGET": "T2", "HOW": "H3", "WHY": "W1"}
    short_desc: str
    prominence: float
    confidence: float
    severity: int
    quotes: List[Dict[str, Any]]
    evidence_notes: str
    counterevidence_notes: Optional[str] = None

    # Metadata fields
    _source_judge: Optional[str] = None
    _n_judges_agreed: Optional[int] = None
    _agreeing_judges: Optional[List[str]] = None
    _avg_similarity: Optional[float] = None
    _confidence_breakdown: Optional[Dict[str, Any]] = None
    _recovered: Optional[bool] = None


@dataclass
class Evaluation:
    """Evaluation result from a single judge."""
    evaluator_id: str
    evaluator_type: str
    model_name: str
    created_at: str
    patterns: List[Pattern]
    notes: str


@dataclass
class JudgmentResult:
    """Complete judgment result for a conversation."""
    conversation_id: str
    manipulation_evaluations: List[Evaluation]

    # Metadata fields
    _source: Optional[Dict[str, Any]] = None
    _meta: Optional[Dict[str, Any]] = None
    _individual_results: Optional[Dict[str, Any]] = None
    _tokens_used: Optional[int] = None
    _model: Optional[str] = None
    _judge_id: Optional[str] = None
    _provider: Optional[str] = None
    _error: Optional[str] = None


@dataclass
class PatternMatch:
    """Match between patterns from two judges."""
    pattern_1: Optional[Pattern]
    pattern_2: Optional[Pattern]
    similarity: float
    match_type: str  # "exact", "partial", "unmatched_j1", "unmatched_j2"


@dataclass
class AgreementMetrics:
    """Agreement metrics between judges."""
    agreement_type: str  # "both_clean", "full", "strong", "partial", "weak", "none"
    agreement_rate: float
    exact_matches: int
    partial_matches: int
    unmatched_j1: int
    unmatched_j2: int
    mean_similarity: float


@dataclass
class ConfidenceBreakdown:
    """Detailed confidence calculation breakdown."""
    final_confidence: float
    base_confidence: float
    agreement_factor: float
    evidence_factor: float
    calibration_factor: float
    breakdown: str


def pattern_from_dict(data: Dict[str, Any]) -> Pattern:
    """Convert dictionary to Pattern object."""
    return Pattern(
        triad_pattern_id=data.get("triad_pattern_id", ""),
        labels=data.get("labels", {}),
        short_desc=data.get("short_desc", ""),
        prominence=data.get("prominence", 0.0),
        confidence=data.get("confidence", 0.0),
        severity=data.get("severity", 0),
        quotes=data.get("quotes", []),
        evidence_notes=data.get("evidence_notes", ""),
        counterevidence_notes=data.get("counterevidence_notes"),
        _source_judge=data.get("_source_judge"),
        _n_judges_agreed=data.get("_n_judges_agreed"),
        _agreeing_judges=data.get("_agreeing_judges"),
        _avg_similarity=data.get("_avg_similarity"),
        _confidence_breakdown=data.get("_confidence_breakdown"),
        _recovered=data.get("_recovered"),
    )


def pattern_to_dict(pattern: Pattern) -> Dict[str, Any]:
    """Convert Pattern object to dictionary."""
    result = {
        "triad_pattern_id": pattern.triad_pattern_id,
        "labels": pattern.labels,
        "short_desc": pattern.short_desc,
        "prominence": pattern.prominence,
        "confidence": pattern.confidence,
        "severity": pattern.severity,
        "quotes": pattern.quotes,
        "evidence_notes": pattern.evidence_notes,
    }

    # Add optional fields if present
    if pattern.counterevidence_notes is not None:
        result["counterevidence_notes"] = pattern.counterevidence_notes
    if pattern._source_judge is not None:
        result["_source_judge"] = pattern._source_judge
    if pattern._n_judges_agreed is not None:
        result["_n_judges_agreed"] = pattern._n_judges_agreed
    if pattern._agreeing_judges is not None:
        result["_agreeing_judges"] = pattern._agreeing_judges
    if pattern._avg_similarity is not None:
        result["_avg_similarity"] = pattern._avg_similarity
    if pattern._confidence_breakdown is not None:
        result["_confidence_breakdown"] = pattern._confidence_breakdown
    if pattern._recovered is not None:
        result["_recovered"] = pattern._recovered

    return result