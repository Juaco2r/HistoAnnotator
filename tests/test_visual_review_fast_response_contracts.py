from __future__ import annotations

import inspect
import json
import unittest

from fastapi.responses import Response
from analysis import evaluation


class VisualReviewFastResponseContractTests(unittest.TestCase):
    def test_direct_json_response_round_trip(self) -> None:
        payload = {
            "targetClass": "Stroma tumoral",
            "reviewScale": 0.0625,
            "unicode": "áéíóú",
            "performanceProfile": {"responseFastPath": True},
        }

        response = evaluation._eval_visual_direct_json_response(payload)

        self.assertIsInstance(response, Response)
        self.assertEqual(response.media_type, "application/json")
        self.assertEqual(json.loads(response.body.decode("utf-8")), payload)

    def test_fast_response_is_visual_only(self) -> None:
        visual_source = inspect.getsource(
            evaluation.visual_evaluation_annotation_files
        )
        scientific_source = inspect.getsource(
            evaluation.evaluate_annotation_files
        )

        self.assertIn("_eval_visual_direct_json_response", visual_source)
        self.assertIn('X-Histo-Visual-Fast-Path', visual_source)
        self.assertNotIn("_eval_visual_direct_json_response", scientific_source)
        self.assertNotIn('X-Histo-Visual-Fast-Path', scientific_source)


if __name__ == "__main__":
    unittest.main()
