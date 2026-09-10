from __future__ import annotations

import copy
import unittest

from analysis import evaluation


class VisualReviewQuarterScaleContractTests(
    unittest.TestCase
):
    @staticmethod
    def feature(
        class_name: str,
        coordinates,
    ) -> dict:
        return {
            "type": "Feature",
            "properties": {
                "classification": {
                    "name": class_name,
                },
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": [
                    coordinates
                ],
            },
        }

    def test_supported_review_scales(self):
        self.assertEqual(
            evaluation._eval_visual_normalize_review_scale(
                None
            ),
            0.0625,
        )
        self.assertEqual(
            evaluation._eval_visual_normalize_review_scale(
                0.5
            ),
            0.5,
        )
        self.assertEqual(
            evaluation._eval_visual_normalize_review_scale(
                1
            ),
            1.0,
        )

    def test_scaled_collection_does_not_mutate_source(self):
        source = {
            "type": "FeatureCollection",
            "features": [
                self.feature(
                    "Tumor",
                    [
                        [0, 0],
                        [400, 0],
                        [400, 400],
                        [0, 400],
                        [0, 0],
                    ],
                ),
            ],
        }

        original = copy.deepcopy(
            source
        )

        scaled = evaluation._eval_visual_scaled_collection(
            source,
            0.25,
        )

        self.assertEqual(
            source,
            original,
        )

        xs = [
            point[0]
            for point
            in scaled[
                "features"
            ][0][
                "geometry"
            ][
                "coordinates"
            ][0]
        ]

        self.assertAlmostEqual(
            max(xs),
            100.0,
            places=5,
        )

    def test_sixteenth_review_scale_is_supported(self):
        self.assertEqual(
            evaluation._eval_visual_normalize_review_scale(
                0.0625
            ),
            0.0625,
        )

    def test_eighth_review_scale_is_supported(self):
        self.assertEqual(
            evaluation._eval_visual_normalize_review_scale(
                0.125
            ),
            0.125,
        )

    def test_quarter_review_returns_level0_coordinates_and_area(self):
        candidate = {
            "type": "FeatureCollection",
            "features": [
                self.feature(
                    "Tumor",
                    [
                        [0, 0],
                        [400, 0],
                        [400, 400],
                        [0, 400],
                        [0, 0],
                    ],
                ),
            ],
        }

        reference = {
            "type": "FeatureCollection",
            "features": [
                self.feature(
                    "Tumor",
                    [
                        [0, 0],
                        [200, 0],
                        [200, 400],
                        [0, 400],
                        [0, 0],
                    ],
                ),
            ],
        }

        result = evaluation.visual_evaluation_feature_collections_scaled(
            candidate,
            reference,
            target_class="Tumor",
            image_width=400,
            image_height=400,
            review_scale=0.25,
            max_regions=25,
        )

        self.assertEqual(
            result["reviewScale"],
            0.25,
        )
        self.assertEqual(
            result["metricsResolution"],
            "level-0",
        )
        self.assertEqual(
            result["reviewResolution"],
            "quarter",
        )

        layers = {
            layer["id"]:
                layer
            for layer
            in result["layers"]
        }

        self.assertAlmostEqual(
            layers[
                "agreement"
            ][
                "areaPx2"
            ],
            80000.0,
            delta=100.0,
        )

        geometry = layers[
            "agreement"
        ][
            "geometry"
        ]

        xs = [
            point[0]
            for point
            in geometry[
                "coordinates"
            ][0]
        ]

        self.assertAlmostEqual(
            max(xs),
            200.0,
            delta=4.0,
        )

    def test_scientific_evaluate_stays_full_resolution(self):
        candidate = {
            "type": "FeatureCollection",
            "features": [
                self.feature(
                    "Tumor",
                    [
                        [0, 0],
                        [400, 0],
                        [400, 400],
                        [0, 400],
                        [0, 0],
                    ],
                ),
            ],
        }

        reference = copy.deepcopy(
            candidate
        )

        result = evaluation.evaluate_feature_collections(
            candidate,
            reference,
            image_width=400,
            image_height=400,
        )

        row = next(
            item
            for item
            in result["rows"]
            if item[
                "className"
            ] == "Tumor"
        )

        self.assertEqual(
            row[
                "candidateAreaPx2"
            ],
            160000.0,
        )
        self.assertEqual(
            row[
                "dice"
            ],
            1.0,
        )


if __name__ == "__main__":
    unittest.main()
