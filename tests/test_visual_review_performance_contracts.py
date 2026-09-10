from __future__ import annotations

import copy
import unittest

from analysis import evaluation


class VisualReviewPerformanceContractTests(unittest.TestCase):
    @staticmethod
    def collection(size: float = 400.0) -> dict:
        return {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "properties": {
                        "classification": {"name": "Tumor"},
                    },
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": [[
                            [0.0, 0.0],
                            [size, 0.0],
                            [size, size],
                            [0.0, size],
                            [0.0, 0.0],
                        ]],
                    },
                }
            ],
        }

    def test_perf_profile_is_opt_in_and_visual_only(self):
        candidate = self.collection()
        reference = copy.deepcopy(candidate)

        normal = evaluation.visual_evaluation_feature_collections_scaled(
            candidate,
            reference,
            target_class="Tumor",
            image_width=400,
            image_height=400,
            review_scale=0.0625,
        )
        self.assertNotIn("performanceProfile", normal)

        profiled = evaluation.visual_evaluation_feature_collections_scaled(
            candidate,
            reference,
            target_class="Tumor",
            image_width=400,
            image_height=400,
            review_scale=0.0625,
            profile_performance=True,
        )

        perf = profiled["performanceProfile"]
        self.assertEqual(perf["reviewScale"], 0.0625)
        self.assertGreater(perf["candidateInputVertices"], 0)
        self.assertGreater(perf["candidateReviewVertices"], 0)
        self.assertIn("sanitizeMs", perf)
        self.assertIn("unionMs", perf)
        self.assertIn("intersectionMs", perf)
        self.assertIn("differenceMs", perf)
        self.assertIn("visualComputeTotalMs", perf)
        self.assertIn("responseGeometryVertices", perf)

        self.assertEqual(profiled["metricsResolution"], "level-0")
        self.assertEqual(profiled["coordinateSpace"], "level-0-image-pixels")

    def test_scientific_evaluate_has_no_visual_perf_metadata(self):
        candidate = self.collection()
        result = evaluation.evaluate_feature_collections(
            candidate,
            copy.deepcopy(candidate),
            image_width=400,
            image_height=400,
        )
        self.assertNotIn("performanceProfile", result)
        row = next(item for item in result["rows"] if item["className"] == "Tumor")
        self.assertEqual(row["dice"], 1.0)
        self.assertEqual(row["candidateAreaPx2"], 160000.0)


if __name__ == "__main__":
    unittest.main()
