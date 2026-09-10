from __future__ import annotations

import inspect
import unittest
from unittest import mock

from analysis import evaluation


def _rect(x0: float, y0: float, x1: float, y1: float, cls: str) -> dict:
    return {
        "type": "Feature",
        "properties": {"classification": {"name": cls}},
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]
            ]],
        },
    }


def _collection(*features: dict) -> dict:
    return {"type": "FeatureCollection", "features": list(features)}


class VisualReviewV4EfficiencyContractTests(unittest.TestCase):
    def test_v4_maps_candidate_and_reference_once_each(self) -> None:
        candidate = _collection(
            _rect(0, 0, 10, 10, "A"),
            _rect(10, 0, 20, 10, "B"),
        )
        reference = _collection(
            _rect(0, 0, 8, 10, "A"),
            _rect(8, 0, 20, 10, "C"),
        )

        original = evaluation._mapped_geometries
        with mock.patch.object(
            evaluation,
            "_mapped_geometries",
            wraps=original,
        ) as wrapped:
            result = evaluation.visual_evaluation_feature_collections_v4(
                candidate,
                reference,
                target_class="A",
                image_width=20,
                image_height=10,
                max_regions=20,
            )

        self.assertEqual(wrapped.call_count, 2)
        self.assertEqual(result["reviewSchemaVersion"], 4)
        self.assertEqual(result["targetClass"], "A")

    def test_v4_reuses_exact_pair_intersections(self) -> None:
        candidate = _collection(
            _rect(0, 0, 10, 10, "A"),
            _rect(5, 0, 15, 10, "B"),
        )
        reference = _collection(
            _rect(0, 0, 8, 10, "A"),
            _rect(8, 0, 15, 10, "C"),
        )

        perf = {}
        token = evaluation._EVAL_VISUAL_PERF.set(perf)
        try:
            result = evaluation.visual_evaluation_feature_collections_v4(
                candidate,
                reference,
                target_class="A",
                image_width=15,
                image_height=10,
                max_regions=20,
            )
        finally:
            evaluation._EVAL_VISUAL_PERF.reset(token)

        self.assertGreaterEqual(perf.get("pairIntersectionCacheHits", 0), 1)
        self.assertEqual(perf.get("pairIntersectionCacheMisses", 0), 0)
        self.assertEqual(perf.get("sharedPrepareCalls"), 1)
        self.assertEqual(perf.get("preparedContextReuse"), 1)
        self.assertIn("perspectives", result)
        self.assertIn("mismatchLayers", result)

    def test_regions_are_materialized_only_after_top_k_selection(self) -> None:
        candidate_features = []
        for index in range(12):
            x0 = float(index * 3)
            candidate_features.append(_rect(x0, 0, x0 + 2, 2, "A"))

        candidate = _collection(*candidate_features)
        reference = _collection(_rect(100, 100, 110, 110, "A"))

        perf = {}
        token = evaluation._EVAL_VISUAL_PERF.set(perf)
        try:
            result = evaluation.visual_evaluation_feature_collections_v4(
                candidate,
                reference,
                target_class="A",
                image_width=120,
                image_height=120,
                max_regions=3,
            )
        finally:
            evaluation._EVAL_VISUAL_PERF.reset(token)

        self.assertGreater(result["regionCount"], 3)
        self.assertEqual(len(result["regions"]), 3)
        self.assertEqual(perf.get("regionSerialized"), 3)
        self.assertGreater(perf.get("regionRowsDeferred", 0), 3)
        for region in result["regions"]:
            self.assertIn("bbox", region)
            self.assertIn("geometry", region)
            self.assertNotIn("_geometryObject", region)

    def test_scientific_evaluate_remains_separate(self) -> None:
        scientific_source = inspect.getsource(evaluation.evaluate_feature_collections)
        self.assertNotIn("_eval_visual_prepare_context", scientific_source)
        self.assertNotIn("_prepared_context", scientific_source)


if __name__ == "__main__":
    unittest.main()
