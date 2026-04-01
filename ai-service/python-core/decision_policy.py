"""
Decision policy for packaging authenticity classification.

This policy is intentionally strict for regulated supply-chain workflows.
"""


def decide_packaging_authenticity(
    counterfeit_score: float,
    authentic_score: float,
    counterfeit_min_score: float,
    authentic_min_score: float,
) -> tuple[bool, str, str]:
    """
    Decide final authenticity outcome from aggregated label scores.

    Args:
        counterfeit_score: Maximum confidence mapped to counterfeit labels.
        authentic_score: Maximum confidence mapped to authentic labels.
        counterfeit_min_score: Counterfeit score threshold that triggers rejection.
        authentic_min_score: Minimum authentic score required for acceptance.

    Returns:
        Tuple of (accepted, verdict, reason).
    """
    has_counterfeit_signal = counterfeit_score >= counterfeit_min_score
    has_authentic_evidence = authentic_score >= authentic_min_score

    accepted = (not has_counterfeit_signal) and has_authentic_evidence
    verdict = "AUTHENTIC" if accepted else "SUSPICIOUS"

    if has_counterfeit_signal:
        reason = "counterfeit_signal_detected"
    elif not has_authentic_evidence:
        reason = "insufficient_authentic_evidence"
    else:
        reason = "authentic_signal_confirmed"

    return accepted, verdict, reason
