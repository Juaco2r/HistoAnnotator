from __future__ import annotations

import unittest

from analysis.statistics import geojson_review_tiles


def feature(
    feature_id: str,
    class_name: str,
    coords: list[list[float]],
    *,
    role: str = "annotation",
    roi_kind: str | None = None,
) -> dict:
    histo: dict = {
        "role": role,
    }

    if roi_kind:
        histo["roi"] = {
            "kind": roi_kind,
        }

    return {
        "type": "Feature",
        "id": feature_id,
        "properties": {
            "classification": {
                "name": class_name,
            },
            "histoannotator": histo,
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [
                coords
            ],
        },
    }


class ReviewTilesContractTests(unittest.TestCase):
    """Freeze Review-by-Tiles valid-region and membership behavior."""

    def test_review_tiles_follow_tissue_roi_and_assign_annotation_ids(
        self,
    ) -> None:
        payload = {
            "featureCollection": {
                "type": "FeatureCollection",
                "features": [
                    feature(
                        "roi-1",
                        "Tissue",
                        [
                            [0, 0],
                            [256, 0],
                            [256, 256],
                            [0, 256],
                            [0, 0],
                        ],
                        role="roi",
                        roi_kind="tissue",
                    ),
                    feature(
                        "a-1",
                        "Tumor",
                        [
                            [20, 20],
                            [80, 20],
                            [80, 80],
                            [20, 80],
                            [20, 20],
                        ],
                    ),
                    feature(
                        "a-2",
                        "Stroma",
                        [
                            [150, 150],
                            [230, 150],
                            [230, 230],
                            [150, 230],
                            [150, 150],
                        ],
                    ),
                ],
            },
            "imageWidth": 256,
            "imageHeight": 256,
            "tileSizePx": 128,
        }

        result = geojson_review_tiles(
            payload
        )

        self.assertEqual(
            result["analysis"]["source"],
            "tissue-roi",
        )

        self.assertEqual(
            result["tileCount"],
            4,
        )

        annotation_ids = {
            annotation_id
            for tile in result["tiles"]
            for annotation_id
            in tile["annotationIds"]
        }

        self.assertIn(
            "a-1",
            annotation_ids,
        )

        self.assertIn(
            "a-2",
            annotation_ids,
        )

    def test_review_tiles_subtract_artifact_from_valid_region(
        self,
    ) -> None:
        payload = {
            "featureCollection": {
                "type": "FeatureCollection",
                "features": [
                    feature(
                        "roi-1",
                        "Tissue",
                        [
                            [0, 0],
                            [256, 0],
                            [256, 256],
                            [0, 256],
                            [0, 0],
                        ],
                        role="roi",
                        roi_kind="tissue",
                    ),
                    feature(
                        "artifact-1",
                        "Artifact",
                        [
                            [0, 0],
                            [128, 0],
                            [128, 256],
                            [0, 256],
                            [0, 0],
                        ],
                        role="artifact",
                    ),
                ],
            },
            "imageWidth": 256,
            "imageHeight": 256,
            "tileSizePx": 128,
        }

        result = geojson_review_tiles(
            payload
        )

        self.assertEqual(
            result["tileCount"],
            2,
        )

        self.assertTrue(
            all(
                tile["x"] >= 128
                for tile in result["tiles"]
            )
        )


if __name__ == "__main__":
    unittest.main()
