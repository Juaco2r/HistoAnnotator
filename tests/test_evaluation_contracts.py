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

def test_visual_evaluation_feature_collections_contract():
    import app.analysis.evaluation as evaluation

    candidate = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "classification": {
                        "name": "Cancer",
                    }
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [0, 0],
                        [10, 0],
                        [10, 10],
                        [0, 10],
                        [0, 0],
                    ]],
                },
            }
        ],
    }

    reference = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "classification": {
                        "name": "Cancer",
                    }
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [0, 0],
                        [5, 0],
                        [5, 10],
                        [0, 10],
                        [0, 0],
                    ]],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "classification": {
                        "name": "Stroma",
                    }
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [5, 0],
                        [10, 0],
                        [10, 10],
                        [5, 10],
                        [5, 0],
                    ]],
                },
            },
        ],
    }

    result = evaluation.visual_evaluation_feature_collections(
        candidate,
        reference,
        target_class="Cancer",
        image_width=20,
        image_height=20,
    )

    layers = {
        item["id"]: item
        for item in result["layers"]
    }

    assert layers["agreement"]["areaPx2"] == 50.0
    assert layers["candidate_only"]["areaPx2"] == 50.0
    assert layers["reference_only"]["areaPx2"] == 0.0
    assert layers["wrong_class"]["areaPx2"] == 50.0

    assert result["mismatches"][0]["candidateClass"] == "Cancer"
    assert result["mismatches"][0]["referenceClass"] == "Stroma"

    assert any(
        region["kind"] == "wrong_class"
        and region["candidateClass"] == "Cancer"
        and region["referenceClass"] == "Stroma"
        for region in result["regions"]
    )


def test_visual_evaluation_does_not_mutate_input():
    import copy
    import app.analysis.evaluation as evaluation

    payload = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "classification": {
                        "name": "A",
                    }
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [0, 0],
                        [2, 0],
                        [2, 2],
                        [0, 2],
                        [0, 0],
                    ]],
                },
            }
        ],
    }

    original = copy.deepcopy(payload)

    evaluation.visual_evaluation_feature_collections(
        payload,
        payload,
        target_class="A",
        image_width=10,
        image_height=10,
    )

    assert payload == original

def _reference_roi_test_feature(
    class_name,
    coordinates,
    *,
    roi=False,
):
    properties = {
        "classification": {
            "name": class_name,
        }
    }

    if roi:
        properties["histoannotator"] = {
            "role": "roi",
            "roi": {
                "kind": "tissue",
            },
        }

    return {
        "type": "Feature",
        "properties": properties,
        "geometry": {
            "type": "Polygon",
            "coordinates": [coordinates],
        },
    }


def test_reference_roi_scopes_dice_to_ground_truth_roi():
    import app.analysis.evaluation as evaluation

    candidate = {
        "type": "FeatureCollection",
        "features": [
            _reference_roi_test_feature(
                "Cancer",
                [
                    [0, 0],
                    [10, 0],
                    [10, 10],
                    [0, 10],
                    [0, 0],
                ],
            ),
        ],
    }

    reference = {
        "type": "FeatureCollection",
        "features": [
            _reference_roi_test_feature(
                "Tissue ROI",
                [
                    [0, 0],
                    [5, 0],
                    [5, 10],
                    [0, 10],
                    [0, 0],
                ],
                roi=True,
            ),
            _reference_roi_test_feature(
                "Cancer",
                [
                    [0, 0],
                    [5, 0],
                    [5, 10],
                    [0, 10],
                    [0, 0],
                ],
            ),
        ],
    }

    result = evaluation.evaluate_feature_collections(
        candidate,
        reference,
        image_width=20,
        image_height=20,
    )

    row = next(
        item
        for item in result["rows"]
        if item["className"] == "Cancer"
    )

    assert result["evaluationRegion"] == "reference-roi"
    assert result["referenceRoi"]["present"] is True
    assert result["referenceRoi"]["areaPx2"] == 50.0
    assert row["candidateAreaPx2"] == 50.0
    assert row["referenceAreaPx2"] == 50.0
    assert row["intersectionAreaPx2"] == 50.0
    assert row["dice"] == 1.0


def test_candidate_roi_does_not_define_evaluation_scope():
    import app.analysis.evaluation as evaluation

    candidate = {
        "type": "FeatureCollection",
        "features": [
            _reference_roi_test_feature(
                "Candidate ROI",
                [
                    [0, 0],
                    [2, 0],
                    [2, 2],
                    [0, 2],
                    [0, 0],
                ],
                roi=True,
            ),
            _reference_roi_test_feature(
                "Cancer",
                [
                    [0, 0],
                    [10, 0],
                    [10, 10],
                    [0, 10],
                    [0, 0],
                ],
            ),
        ],
    }

    reference = {
        "type": "FeatureCollection",
        "features": [
            _reference_roi_test_feature(
                "Cancer",
                [
                    [0, 0],
                    [10, 0],
                    [10, 10],
                    [0, 10],
                    [0, 0],
                ],
            ),
        ],
    }

    result = evaluation.evaluate_feature_collections(
        candidate,
        reference,
        image_width=20,
        image_height=20,
    )

    assert result["evaluationRegion"] == "full-image-bounds"


def test_reference_roi_scopes_visual_review():
    import app.analysis.evaluation as evaluation

    candidate = {
        "type": "FeatureCollection",
        "features": [
            _reference_roi_test_feature(
                "Cancer",
                [
                    [0, 0],
                    [10, 0],
                    [10, 10],
                    [0, 10],
                    [0, 0],
                ],
            ),
        ],
    }

    reference = {
        "type": "FeatureCollection",
        "features": [
            _reference_roi_test_feature(
                "Tissue ROI",
                [
                    [0, 0],
                    [5, 0],
                    [5, 10],
                    [0, 10],
                    [0, 0],
                ],
                roi=True,
            ),
            _reference_roi_test_feature(
                "Cancer",
                [
                    [0, 0],
                    [5, 0],
                    [5, 10],
                    [0, 10],
                    [0, 0],
                ],
            ),
        ],
    }

    result = evaluation.visual_evaluation_feature_collections(
        candidate,
        reference,
        target_class="Cancer",
        image_width=20,
        image_height=20,
    )

    layers = {
        layer["id"]: layer
        for layer in result["layers"]
    }

    assert result["evaluationRegion"] == "reference-roi"
    assert result["referenceRoi"]["present"] is True
    assert layers["agreement"]["areaPx2"] == 50.0
    assert layers["candidate_only"]["areaPx2"] == 0.0
    assert layers["reference_only"]["areaPx2"] == 0.0

def test_reference_valid_region_uses_external_border_exclusion():
    import app.analysis.evaluation as evaluation

    roi = {
        "type": "Feature",
        "properties": {
            "classification": {
                "name": "Tissue",
            },
            "histoannotator": {
                "role": "roi",
                "roi": {
                    "kind": "tissue",
                    "externalBorderExclusion": {
                        "enabled": True,
                        "percent": 10.0,
                    },
                },
            },
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
                [0, 0],
            ]],
        },
    }

    candidate_class = {
        "type": "Feature",
        "properties": {
            "classification": {
                "name": "Cancer",
            }
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
                [0, 0],
            ]],
        },
    }

    reference_class = {
        "type": "Feature",
        "properties": {
            "classification": {
                "name": "Cancer",
            }
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
                [0, 0],
            ]],
        },
    }

    result = evaluation.evaluate_feature_collections(
        {
            "type": "FeatureCollection",
            "features": [
                candidate_class,
            ],
        },
        {
            "type": "FeatureCollection",
            "features": [
                roi,
                reference_class,
            ],
        },
        image_width=100,
        image_height=100,
    )

    row = next(
        item
        for item in result["rows"]
        if item["className"] == "Cancer"
    )

    assert result["evaluationRegion"] == "reference-roi-inner"
    assert abs(row["candidateAreaPx2"] - 9000.0) < 1e-4
    assert abs(row["referenceAreaPx2"] - 9000.0) < 1e-4
    assert abs(row["intersectionAreaPx2"] - 9000.0) < 1e-4
    assert row["dice"] == 1.0


def test_reference_valid_region_without_border_uses_roi_itself():
    import app.analysis.evaluation as evaluation

    roi = {
        "type": "Feature",
        "properties": {
            "classification": {
                "name": "Tissue",
            },
            "histoannotator": {
                "role": "roi",
                "roi": {
                    "kind": "tissue",
                },
            },
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [[
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
            ]],
        },
    }

    result = evaluation._evaluation_reference_valid_region_v3(
        {
            "type": "FeatureCollection",
            "features": [
                roi,
            ],
        },
        bounds=None,
    )

    geometry, mode = result

    assert mode == "reference-roi"
    assert geometry.area == 100.0

def test_visual_review_v4_reference_target_composition():
    import app.analysis.evaluation as evaluation

    candidate = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "classification": {
                        "name": "Necrosis",
                    }
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [0, 0],
                        [4, 0],
                        [4, 10],
                        [0, 10],
                        [0, 0],
                    ]],
                },
            },
            {
                "type": "Feature",
                "properties": {
                    "classification": {
                        "name": "Tumor",
                    }
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [4, 0],
                        [8, 0],
                        [8, 10],
                        [4, 10],
                        [4, 0],
                    ]],
                },
            },
        ],
    }

    reference = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "classification": {
                        "name": "Necrosis",
                    }
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [0, 0],
                        [10, 0],
                        [10, 10],
                        [0, 10],
                        [0, 0],
                    ]],
                },
            }
        ],
    }

    result = (
        evaluation.visual_evaluation_feature_collections_v4(
            candidate,
            reference,
            target_class="Necrosis",
            image_width=20,
            image_height=20,
        )
    )

    perspective = result[
        "perspectives"
    ][
        "referenceTarget"
    ]

    assert result["reviewSchemaVersion"] == 4
    assert perspective["correctPercent"] == 40.0
    assert perspective["wrongClassPercent"] == 40.0
    assert perspective["unmatchedPercent"] == 20.0

    tumor = next(
        item
        for item in perspective[
            "mismatchClasses"
        ]
        if item["className"] == "Tumor"
    )

    assert tumor["percentOfTarget"] == 40.0

    pair = result[
        "mismatchLayers"
    ][
        tumor["pairIndex"]
    ]

    assert pair["candidateClass"] == "Tumor"
    assert pair["referenceClass"] == "Necrosis"
    assert pair["geometry"] is not None


def test_visual_review_v4_region_percentage_is_relative_to_target():
    import app.analysis.evaluation as evaluation

    candidate = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "classification": {
                        "name": "Tumor",
                    }
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [0, 0],
                        [5, 0],
                        [5, 10],
                        [0, 10],
                        [0, 0],
                    ]],
                },
            }
        ],
    }

    reference = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "classification": {
                        "name": "Necrosis",
                    }
                },
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [0, 0],
                        [10, 0],
                        [10, 10],
                        [0, 10],
                        [0, 0],
                    ]],
                },
            }
        ],
    }

    result = (
        evaluation.visual_evaluation_feature_collections_v4(
            candidate,
            reference,
            target_class="Necrosis",
            image_width=20,
            image_height=20,
        )
    )

    wrong = next(
        region
        for region in result["regions"]
        if region["kind"] == "wrong_class"
    )

    assert wrong["candidateClass"] == "Tumor"
    assert wrong["referenceClass"] == "Necrosis"
    assert wrong["percentOfTarget"] == 50.0
    assert wrong["targetPerspective"] == "referenceTarget"
