import sys
import unittest
from pathlib import Path

# Ensure local python-core modules are importable when running from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from decision_policy import decide_packaging_authenticity


class DecisionPolicyTests(unittest.TestCase):
    def test_accepts_when_authentic_is_high_and_counterfeit_is_low(self):
        accepted, verdict, reason = decide_packaging_authenticity(
            counterfeit_score=0.2,
            authentic_score=0.9,
            counterfeit_min_score=0.6,
            authentic_min_score=0.75,
        )

        self.assertTrue(accepted)
        self.assertEqual(verdict, "AUTHENTIC")
        self.assertEqual(reason, "authentic_signal_confirmed")

    def test_rejects_when_counterfeit_signal_crosses_threshold(self):
        accepted, verdict, reason = decide_packaging_authenticity(
            counterfeit_score=0.61,
            authentic_score=0.95,
            counterfeit_min_score=0.6,
            authentic_min_score=0.75,
        )

        self.assertFalse(accepted)
        self.assertEqual(verdict, "SUSPICIOUS")
        self.assertEqual(reason, "counterfeit_signal_detected")

    def test_rejects_when_authentic_evidence_is_insufficient(self):
        accepted, verdict, reason = decide_packaging_authenticity(
            counterfeit_score=0.3,
            authentic_score=0.5,
            counterfeit_min_score=0.6,
            authentic_min_score=0.75,
        )

        self.assertFalse(accepted)
        self.assertEqual(verdict, "SUSPICIOUS")
        self.assertEqual(reason, "insufficient_authentic_evidence")

    def test_threshold_boundary_is_inclusive(self):
        accepted, verdict, reason = decide_packaging_authenticity(
            counterfeit_score=0.6,
            authentic_score=0.75,
            counterfeit_min_score=0.6,
            authentic_min_score=0.75,
        )

        self.assertFalse(accepted)
        self.assertEqual(verdict, "SUSPICIOUS")
        self.assertEqual(reason, "counterfeit_signal_detected")


if __name__ == "__main__":
    unittest.main()
