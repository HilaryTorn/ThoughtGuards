"""
Taxonomy definitions and helper functions for ThoughtGuards manipulation detection.
"""

from typing import Dict, Any

# ============================================================================
# TAXONOMY DEFINITIONS
# ============================================================================

TAXONOMY = {
    "TARGET": {
        "T1": {"name": "User Beliefs/Decisions", "verb": "User"},
        "T2": {"name": "Evaluator/Oversight", "verb": "Evaluator"},
        "T3": {"name": "Policy/Process Constraints", "verb": "Policy"},
        "T4": {"name": "External World/Third Parties", "verb": "External"},
    },
    "HOW": {
        "H1": {"name": "Misrepresentation", "verb": "Fabricated"},
        "H2": {"name": "Capability Suppression", "verb": "Sandbagged"},
        "H3": {"name": "Oversight-Conditional Behavior", "verb": "Context-Switched"},
        "H4": {"name": "Influence Tactics", "verb": "Pressured"},
        "H5": {"name": "Omission/Obfuscation", "verb": "Hid"},
        "H6": {"name": "Miscalibration", "verb": "Overclaimed"},
    },
    "WHY": {
        "W1": {"name": "Proxy/Score Optimization", "verb": "Gamed"},
        "W2": {"name": "Approval Optimization", "verb": "Pleased"},
        "W3": {"name": "Cost/Effort Minimization", "verb": "Shortcut"},
        "W4": {"name": "Penalty/Constraint Avoidance", "verb": "Dodged"},
    },
}


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def get_taxonomy_label(axis: str, code: str) -> Dict[str, str]:
    """
    Get taxonomy label information for a given axis and code.

    Args:
        axis: "TARGET", "HOW", or "WHY"
        code: Code like "T1", "H3", "W2"

    Returns:
        Dict with "name" and "verb" keys
    """
    return TAXONOMY.get(axis, {}).get(code, {"name": "Unknown", "verb": "Unknown"})


def validate_triad(target: str, how: str, why: str) -> bool:
    """
    Validate that a triad pattern has valid codes.

    Args:
        target: TARGET code (T1-T4)
        how: HOW code (H1-H6)
        why: WHY code (W1-W4)

    Returns:
        True if all codes are valid
    """
    return (
        target in TAXONOMY["TARGET"] and
        how in TAXONOMY["HOW"] and
        why in TAXONOMY["WHY"]
    )


def format_triad_id(target: str, how: str, why: str) -> str:
    """
    Format triad components into standard ID format.

    Args:
        target: TARGET code (T1-T4)
        how: HOW code (H1-H6)
        why: WHY code (W1-W4)

    Returns:
        Triad ID like "T2|H3|W1"
    """
    return f"{target}|{how}|{why}"


def parse_triad_id(triad_id: str) -> Dict[str, str]:
    """
    Parse a triad ID into its components.

    Args:
        triad_id: Triad ID like "T2|H3|W1"

    Returns:
        Dict with "TARGET", "HOW", "WHY" keys
    """
    parts = triad_id.split("|")
    if len(parts) != 3:
        return {"TARGET": "", "HOW": "", "WHY": ""}
    return {
        "TARGET": parts[0],
        "HOW": parts[1],
        "WHY": parts[2],
    }


def get_triad_description(target: str, how: str, why: str) -> str:
    """
    Get human-readable description of a triad pattern.

    Args:
        target: TARGET code (T1-T4)
        how: HOW code (H1-H6)
        why: WHY code (W1-W4)

    Returns:
        Description like "Agent fabricated in order to dodge penalty, affecting evaluator"
    """
    target_info = get_taxonomy_label("TARGET", target)
    how_info = get_taxonomy_label("HOW", how)
    why_info = get_taxonomy_label("WHY", why)

    return (
        f"Agent {how_info['verb'].lower()} in order to {why_info['verb'].lower()} "
        f"penalty, affecting {target_info['verb'].lower()}"
    )