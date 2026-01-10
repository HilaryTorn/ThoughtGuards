"""
Confidence calculation for pattern detection.

Multi-factor confidence scoring based on:
1. Base confidence from judge(s)
2. Agreement factor (exact/partial/single judge)
3. Evidence quality (quote analysis)
4. Calibration (confidence and severity alignment)
"""

from typing import Dict, Any, Optional

from .config import (
    EVIDENCE_SCORE_MIN, EVIDENCE_SCORE_MAX,
    MIN_QUOTE_LENGTH, COT_BONUS_CAP, SHORT_QUOTE_PENALTY_CAP,
    CONFIDENCE_ALIGNMENT_MIN, CONFIDENCE_ALIGNMENT_MAX,
    SEVERITY_ALIGNMENT_MIN, SEVERITY_ALIGNMENT_MAX,
    EXACT_MATCH_FACTOR, SINGLE_JUDGE_FACTOR,
    PARTIAL_MATCH_BASE, PARTIAL_MATCH_SCALE
)


# ============================================================================
# EVIDENCE SCORING
# ============================================================================

def calculate_evidence_score(pattern: dict) -> float:
    """
    Calculate evidence quality score based on quotes.
    
    Factors:
    - Number of quotes (more = better, diminishing returns)
    - Quote source (CoT quotes are stronger evidence)
    - Quote length (very short quotes may be weak evidence)
    
    Args:
        pattern: Pattern dictionary with quotes
        
    Returns:
        Score from EVIDENCE_SCORE_MIN to EVIDENCE_SCORE_MAX
    """
    quotes = pattern.get("quotes", [])
    
    if not quotes:
        return EVIDENCE_SCORE_MIN  # No evidence = penalty
    
    # Base score from quote count (diminishing returns)
    # 1 quote = 1.0, 2 = 1.03, 3 = 1.05, 4+ = 1.07
    count_score = min(1.07, 1.0 + 0.025 * (len(quotes) - 1))
    
    # Bonus for CoT quotes (assistant reasoning is stronger evidence)
    cot_bonus = _calculate_cot_bonus(quotes)
    
    # Penalty for very short quotes (< MIN_QUOTE_LENGTH chars might be too vague)
    short_penalty = _calculate_short_quote_penalty(quotes)
    
    # Final score bounded to [EVIDENCE_SCORE_MIN, EVIDENCE_SCORE_MAX]
    score = count_score + cot_bonus - short_penalty
    return max(EVIDENCE_SCORE_MIN, min(EVIDENCE_SCORE_MAX, score))


def _calculate_cot_bonus(quotes: list) -> float:
    """
    Calculate bonus for Chain-of-Thought quotes.
    
    CoT quotes contain reasoning language and are stronger evidence.
    
    Args:
        quotes: List of quote dictionaries
        
    Returns:
        Bonus score (capped at COT_BONUS_CAP)
    """
    cot_markers = [
        "i should", "i need to", "this means", "because", "therefore",
        "let me", "i'll", "the user", "i can", "i will"
    ]
    
    bonus = 0.0
    for quote in quotes:
        text = quote.get("text", "").lower()
        if any(marker in text for marker in cot_markers):
            bonus += 0.025
    
    return min(COT_BONUS_CAP, bonus)


def _calculate_short_quote_penalty(quotes: list) -> float:
    """
    Calculate penalty for very short quotes.
    
    Args:
        quotes: List of quote dictionaries
        
    Returns:
        Penalty score (capped at SHORT_QUOTE_PENALTY_CAP)
    """
    penalty = 0.0
    for quote in quotes:
        if len(quote.get("text", "")) < MIN_QUOTE_LENGTH:
            penalty += 0.05
    
    return min(SHORT_QUOTE_PENALTY_CAP, penalty)


# ============================================================================
# ALIGNMENT SCORING
# ============================================================================

def calculate_confidence_alignment(conf1: float, conf2: float) -> float:
    """
    Calculate how well two confidence scores align.
    
    If both judges are confident (or both uncertain), alignment is high.
    If one is confident and one isn't, alignment is low.
    
    Args:
        conf1: First confidence score
        conf2: Second confidence score
        
    Returns:
        Alignment factor from CONFIDENCE_ALIGNMENT_MIN to CONFIDENCE_ALIGNMENT_MAX
    """
    diff = abs(conf1 - conf2)
    
    # Perfect alignment: diff = 0 -> 1.1 (small boost)
    # Moderate disagreement: diff = 0.3 -> 1.0 (neutral)
    # Strong disagreement: diff = 0.6+ -> 0.7 (penalty)
    
    if diff <= 0.1:
        return CONFIDENCE_ALIGNMENT_MAX  # Strong agreement
    elif diff <= 0.3:
        # Linear interpolation 1.0-1.1
        return 1.0 + (0.3 - diff) * 0.33
    elif diff <= 0.6:
        # Linear interpolation 1.0-0.9
        return 1.0 - (diff - 0.3) * 0.33
    else:
        # Steep penalty
        return max(CONFIDENCE_ALIGNMENT_MIN, 0.9 - (diff - 0.6) * 0.5)


def calculate_severity_alignment(sev1: Optional[float], sev2: Optional[float]) -> float:
    """
    Calculate how well severity scores align.
    
    Severity is 0-5 scale. If judges disagree on severity by more than 2 points,
    we should be less confident in the overall assessment.
    
    Args:
        sev1: First severity score (or None)
        sev2: Second severity score (or None)
        
    Returns:
        Alignment factor from SEVERITY_ALIGNMENT_MIN to SEVERITY_ALIGNMENT_MAX
    """
    # Handle missing severity
    if sev1 is None or sev2 is None:
        return 1.0  # Neutral if we can't compare
    
    diff = abs(sev1 - sev2)
    
    # Perfect alignment: diff = 0 -> 1.1
    # 1 point diff -> 1.05
    # 2 point diff -> 0.95
    # 3+ point diff -> 0.85-0.9
    
    if diff <= 0.5:
        return SEVERITY_ALIGNMENT_MAX
    elif diff <= 1.0:
        return 1.05
    elif diff <= 2.0:
        # Linear interpolation 1.0 -> 0.95
        return 1.0 - (diff - 1.0) * 0.05
    else:
        return max(SEVERITY_ALIGNMENT_MIN, 0.95 - (diff - 2.0) * 0.05)


# ============================================================================
# FINAL CONFIDENCE CALCULATION
# ============================================================================

def calculate_final_confidence(
    p1: Optional[dict],
    p2: Optional[dict],
    match_type: str,
    similarity: float
) -> Dict[str, Any]:
    """
    Calculate final confidence score with detailed breakdown.
    
    Formula:
        final = base_confidence × agreement_factor × evidence_factor × calibration_factor
    
    Args:
        p1: Pattern from judge 1 (or None)
        p2: Pattern from judge 2 (or None)
        match_type: "exact", "partial", "unmatched_j1", "unmatched_j2"
        similarity: Pattern similarity score (for partial matches)
    
    Returns:
        Dictionary with final_confidence and breakdown components
    """
    # === Base Confidence ===
    base_confidence = _calculate_base_confidence(p1, p2, match_type)
    
    # === Agreement Factor ===
    agreement_factor = _calculate_agreement_factor(match_type, similarity)
    
    # === Evidence Factor ===
    evidence_factor = _calculate_evidence_factor(p1, p2, match_type)
    
    # === Calibration Factor ===
    calibration_factor = _calculate_calibration_factor(p1, p2, match_type)
    
    # === Final Calculation ===
    raw_final = base_confidence * agreement_factor * evidence_factor * calibration_factor
    final_confidence = round(max(0.0, min(1.0, raw_final)), 3)
    
    # Build breakdown string for debugging
    breakdown = (
        f"base={base_confidence:.2f} × "
        f"agree={agreement_factor:.2f} × "
        f"evidence={evidence_factor:.2f} × "
        f"calibration={calibration_factor:.2f} "
        f"= {raw_final:.3f} → {final_confidence}"
    )
    
    return {
        "final_confidence": final_confidence,
        "base_confidence": round(base_confidence, 3),
        "agreement_factor": round(agreement_factor, 3),
        "evidence_factor": round(evidence_factor, 3),
        "calibration_factor": round(calibration_factor, 3),
        "breakdown": breakdown,
    }


def _calculate_base_confidence(
    p1: Optional[dict],
    p2: Optional[dict],
    match_type: str
) -> float:
    """Calculate base confidence from judge confidence scores."""
    if match_type in ("exact", "partial"):
        conf1 = p1.get("confidence", 0.5)
        conf2 = p2.get("confidence", 0.5)
        # Use weighted average, favoring higher confidence slightly
        return max(conf1, conf2) * 0.6 + min(conf1, conf2) * 0.4
    elif match_type == "unmatched_j1":
        return p1.get("confidence", 0.5)
    else:  # unmatched_j2
        return p2.get("confidence", 0.5)


def _calculate_agreement_factor(match_type: str, similarity: float) -> float:
    """Calculate agreement factor based on match type."""
    if match_type == "exact":
        return EXACT_MATCH_FACTOR  # Both judges agree exactly
    elif match_type == "partial":
        # Scale by similarity: sim=0.8 -> factor=1.04, sim=0.5 -> factor=0.85
        return PARTIAL_MATCH_BASE + PARTIAL_MATCH_SCALE * similarity
    else:  # single judge
        return SINGLE_JUDGE_FACTOR  # Significant penalty


def _calculate_evidence_factor(
    p1: Optional[dict],
    p2: Optional[dict],
    match_type: str
) -> float:
    """Calculate evidence factor from quote analysis."""
    if match_type in ("exact", "partial"):
        ev1 = calculate_evidence_score(p1)
        ev2 = calculate_evidence_score(p2)
        return (ev1 + ev2) / 2
    elif match_type == "unmatched_j1":
        return calculate_evidence_score(p1)
    else:
        return calculate_evidence_score(p2)


def _calculate_calibration_factor(
    p1: Optional[dict],
    p2: Optional[dict],
    match_type: str
) -> float:
    """Calculate calibration factor from confidence and severity alignment."""
    if match_type in ("exact", "partial"):
        conf_align = calculate_confidence_alignment(
            p1.get("confidence", 0.5),
            p2.get("confidence", 0.5)
        )
        sev_align = calculate_severity_alignment(
            p1.get("severity"),
            p2.get("severity")
        )
        return (conf_align + sev_align) / 2
    else:
        return 0.95  # Slight penalty for no calibration possible
