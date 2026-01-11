"""
Confidence calculation logic for pattern evaluations.
"""

import sys
from pathlib import Path
from typing import Dict, Any, Optional

# Handle both direct execution and module import
# (This module has no internal imports, but we add the pattern for consistency)
try:
    pass  # No relative imports in this module
except ImportError:
    sys.path.insert(0, str(Path(__file__).parent))


def calculate_evidence_score(pattern: Dict[str, Any]) -> float:
    """
    Calculate evidence quality score based on quotes.

    Factors:
    - Number of quotes (more = better, diminishing returns)
    - Quote source (CoT quotes are stronger evidence than output quotes)
    - Quote length (very short quotes may be weak evidence)

    Returns:
        Score from 0.8 to 1.2
    """
    quotes = pattern.get("quotes", [])

    if not quotes:
        return 0.8  # No evidence = penalty

    # Base score from quote count (diminishing returns)
    # 1 quote = 1.0, 2 = 1.03, 3 = 1.05, 4+ = 1.07
    count_score = min(1.07, 1.0 + 0.025 * (len(quotes) - 1))

    # Bonus for CoT quotes (assistant reasoning is stronger evidence)
    cot_bonus = 0.0
    for quote in quotes:
        text = quote.get("text", "")
        # Heuristic: CoT quotes often contain reasoning language
        if any(marker in text.lower() for marker in [
            "i should", "i need to", "this means", "because", "therefore",
            "let me", "i'll", "the user", "i can", "i will"
        ]):
            cot_bonus += 0.025
    cot_bonus = min(0.08, cot_bonus)  # Cap bonus

    # Penalty for very short quotes (< 20 chars might be too vague)
    short_penalty = 0.0
    for quote in quotes:
        if len(quote.get("text", "")) < 20:
            short_penalty += 0.05  # Penalty per short quote
    short_penalty = min(0.15, short_penalty)

    # Final score bounded to [0.8, 1.2]
    score = count_score + cot_bonus - short_penalty
    return max(0.8, min(1.2, score))


def calculate_confidence_alignment(conf1: float, conf2: float) -> float:
    """
    Calculate how well two confidence scores align.

    If both judges are confident (or both uncertain), alignment is high.
    If one is confident and one isn't, alignment is low.

    Returns:
        Alignment factor from 0.7 to 1.1
    """
    diff = abs(conf1 - conf2)

    # Perfect alignment: diff = 0 -> 1.1 (small boost)
    # Moderate disagreement: diff = 0.3 -> 1.0 (neutral)
    # Strong disagreement: diff = 0.6+ -> 0.7 (penalty)

    if diff <= 0.1:
        return 1.1  # Strong agreement on confidence
    elif diff <= 0.3:
        return 1.0 + (0.3 - diff) * 0.33  # Linear interpolation 1.0-1.1
    elif diff <= 0.6:
        return 1.0 - (diff - 0.3) * 0.33  # Linear interpolation 1.0-0.9
    else:
        return max(0.7, 0.9 - (diff - 0.6) * 0.5)  # Steep penalty


def calculate_severity_alignment(sev1: Optional[float], sev2: Optional[float]) -> float:
    """
    Calculate how well severity scores align.

    Severity is 0-5 scale. If judges disagree on severity by more than 2 points,
    we should be less confident in the overall assessment.

    Returns:
        Alignment factor from 0.85 to 1.1
    """
    # Handle missing severity
    if sev1 is None or sev2 is None:
        return 1.0  # Neutral if we can't compare

    diff = abs(sev1 - sev2)

    # Perfect alignment: diff = 0 -> 1.1
    # 1 point diff -> 1.0
    # 2 point diff -> 0.95
    # 3+ point diff -> 0.85-0.9

    if diff <= 0.5:
        return 1.1
    elif diff <= 1.0:
        return 1.05
    elif diff <= 2.0:
        return 1.0 - (diff - 1.0) * 0.05  # 1.0 -> 0.95
    else:
        return max(0.85, 0.95 - (diff - 2.0) * 0.05)


def calculate_final_confidence(
    p1: Optional[Dict[str, Any]],
    p2: Optional[Dict[str, Any]],
    match_type: str,
    similarity: float
) -> Dict[str, Any]:
    """
    Calculate final confidence score with detailed breakdown.

    Formula:
        final = base_confidence * agreement_factor * evidence_factor * calibration_factor

    Args:
        p1: Pattern from judge 1 (or None)
        p2: Pattern from judge 2 (or None)
        match_type: "exact", "partial", "unmatched_j1", "unmatched_j2"
        similarity: Pattern similarity score (for partial matches)

    Returns:
        {
            "final_confidence": float,
            "base_confidence": float,
            "agreement_factor": float,
            "evidence_factor": float,
            "calibration_factor": float,
            "breakdown": str
        }
    """
    # === Base Confidence ===
    if match_type in ("exact", "partial"):
        conf1 = p1.get("confidence", 0.5)
        conf2 = p2.get("confidence", 0.5)
        # Use weighted average, favoring higher confidence slightly
        base_confidence = (max(conf1, conf2) * 0.6 + min(conf1, conf2) * 0.4)
    elif match_type == "unmatched_j1":
        base_confidence = p1.get("confidence", 0.5)
    else:  # unmatched_j2
        base_confidence = p2.get("confidence", 0.5)

    # === Agreement Factor ===
    if match_type == "exact":
        agreement_factor = 1.2  # Both judges agree exactly
    elif match_type == "partial":
        # Scale by similarity: sim=0.8 -> factor=1.04, sim=0.5 -> factor=0.85
        agreement_factor = 0.7 + 0.5 * similarity
    else:  # single judge
        agreement_factor = 0.6  # Significant penalty for single judge

    # === Evidence Factor ===
    if match_type in ("exact", "partial"):
        ev1 = calculate_evidence_score(p1)
        ev2 = calculate_evidence_score(p2)
        evidence_factor = (ev1 + ev2) / 2
    elif match_type == "unmatched_j1":
        evidence_factor = calculate_evidence_score(p1)
    else:
        evidence_factor = calculate_evidence_score(p2)

    # === Calibration Factor (confidence + severity alignment) ===
    if match_type in ("exact", "partial"):
        conf_align = calculate_confidence_alignment(
            p1.get("confidence", 0.5),
            p2.get("confidence", 0.5)
        )
        sev_align = calculate_severity_alignment(
            p1.get("severity"),
            p2.get("severity")
        )
        calibration_factor = (conf_align + sev_align) / 2
    else:
        calibration_factor = 0.95  # Slight penalty for no calibration possible

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