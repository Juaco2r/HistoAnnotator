from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from shapely.geometry import Polygon, mapping

from analysis.evaluation import evaluate_feature_collections
from storage.annotations import (
    annotation_metadata_path,
    normalize_annotation_file_metadata,
    read_annotation_metadata,
    save_annotation_metadata,
)


def feature(class_name: str, polygon: Polygon) -> dict:
    return {
        "type": "Feature",
        "geometry": mapping(polygon),
        "properties": {
            "classification": {"name": class_name},
            "histoannotator": {"role": "annotation"},
        },
    }


def collection(*features: dict) -> dict:
    return {
        "type": "FeatureCollection",
        "features": list(features),
    }


class AnnotationFileMetadataContractTests(unittest.TestCase):
    def test_ground_truth_can_also_be_pathologist_provenance(self) -> None:
        metadata = normalize_annotation_file_metadata(
            {
                "role": "ground_truth",
                "sourceType": "pathologist",
            }
        )
        self.assertEqual(metadata["role"], "ground_truth")
        self.assertEqual(metadata["sourceType"], "pathologist")

    def test_metadata_uses_sidecar_without_rewriting_geojson(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            relative = "case.ndpi"

            path = annotation_metadata_path(
                root,
                relative,
                "Default",
            )
            self.assertTrue(
                str(path).endswith(".geojson.meta.json")
            )

            save_annotation_metadata(
                root,
                relative,
                "Default",
                {
                    "role": "model_prediction",
                    "sourceType": "model",
                },
            )

            loaded = read_annotation_metadata(
                root,
                relative,
                "Default",
            )
            self.assertEqual(
                loaded["role"],
                "model_prediction",
            )
            self.assertEqual(
                loaded["sourceType"],
                "model",
            )


class ReferenceEvaluationContractTests(unittest.TestCase):
    def test_two_reference_classes_can_merge_into_one_target(self) -> None:
        candidate = collection(
            feature(
                "Stroma",
                Polygon(
                    [
                        (0, 0),
                        (10, 0),
                        (10, 10),
                        (0, 10),
                    ]
                ),
            )
        )
        reference = collection(
            feature(
                "Tumor stroma",
                Polygon(
                    [
                        (0, 0),
                        (5, 0),
                        (5, 10),
                        (0, 10),
                    ]
                ),
            ),
            feature(
                "Normal stroma",
                Polygon(
                    [
                        (5, 0),
                        (10, 0),
                        (10, 10),
                        (5, 10),
                    ]
                ),
            ),
        )

        result = evaluate_feature_collections(
            candidate,
            reference,
            candidate_mapping={"Stroma": "Stroma"},
            reference_mapping={
                "Tumor stroma": "Stroma",
                "Normal stroma": "Stroma",
            },
            image_width=20,
            image_height=20,
        )

        self.assertEqual(len(result["rows"]), 1)
        row = result["rows"][0]
        self.assertEqual(row["className"], "Stroma")
        self.assertAlmostEqual(row["candidateAreaPx2"], 100.0)
        self.assertAlmostEqual(row["referenceAreaPx2"], 100.0)
        self.assertAlmostEqual(row["dice"], 1.0)
        self.assertAlmostEqual(row["iou"], 1.0)

    def test_external_class_can_be_renamed_before_dice(self) -> None:
        geometry = Polygon(
            [
                (0, 0),
                (8, 0),
                (8, 8),
                (0, 8),
            ]
        )

        result = evaluate_feature_collections(
            collection(feature("Tumor", geometry)),
            collection(feature("Tumour", geometry)),
            candidate_mapping={"Tumor": "Tumor"},
            reference_mapping={"Tumour": "Tumor"},
            image_width=20,
            image_height=20,
        )

        self.assertEqual(
            result["rows"][0]["className"],
            "Tumor",
        )
        self.assertAlmostEqual(
            result["rows"][0]["dice"],
            1.0,
        )

    def test_same_mapped_class_uses_union_not_feature_sum(self) -> None:
        candidate = collection(
            feature(
                "A",
                Polygon(
                    [
                        (0, 0),
                        (10, 0),
                        (10, 10),
                        (0, 10),
                    ]
                ),
            ),
            feature(
                "B",
                Polygon(
                    [
                        (5, 0),
                        (15, 0),
                        (15, 10),
                        (5, 10),
                    ]
                ),
            ),
        )
        reference = collection(
            feature(
                "Merged",
                Polygon(
                    [
                        (0, 0),
                        (15, 0),
                        (15, 10),
                        (0, 10),
                    ]
                ),
            )
        )

        result = evaluate_feature_collections(
            candidate,
            reference,
            candidate_mapping={
                "A": "Merged",
                "B": "Merged",
            },
            reference_mapping={"Merged": "Merged"},
            image_width=20,
            image_height=20,
        )

        row = result["rows"][0]
        self.assertAlmostEqual(row["candidateAreaPx2"], 150.0)
        self.assertAlmostEqual(row["referenceAreaPx2"], 150.0)
        self.assertAlmostEqual(row["dice"], 1.0)

    def test_ignored_class_is_not_evaluated(self) -> None:
        result = evaluate_feature_collections(
            collection(
                feature(
                    "Tumor",
                    Polygon(
                        [
                            (0, 0),
                            (5, 0),
                            (5, 5),
                            (0, 5),
                        ]
                    ),
                ),
                feature(
                    "IgnoreMe",
                    Polygon(
                        [
                            (10, 10),
                            (15, 10),
                            (15, 15),
                            (10, 15),
                        ]
                    ),
                ),
            ),
            collection(
                feature(
                    "Tumor",
                    Polygon(
                        [
                            (0, 0),
                            (5, 0),
                            (5, 5),
                            (0, 5),
                        ]
                    ),
                ),
            ),
            candidate_mapping={
                "Tumor": "Tumor",
                "IgnoreMe": None,
            },
            reference_mapping={"Tumor": "Tumor"},
            image_width=20,
            image_height=20,
        )

        self.assertEqual(
            [row["className"] for row in result["rows"]],
            ["Tumor"],
        )


if __name__ == "__main__":
    unittest.main()
