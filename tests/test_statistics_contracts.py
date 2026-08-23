from __future__ import annotations

import unittest

import main as sut


def rectangle(x1: float, y1: float, x2: float, y2: float) -> dict:
    return {
        "type": "Polygon",
        "coordinates": [[
            [x1, y1],
            [x2, y1],
            [x2, y2],
            [x1, y2],
            [x1, y1],
        ]],
    }


def feature(
    feature_id: str,
    class_name: str,
    geometry: dict,
    *,
    role: str = "annotation",
    roi_meta: dict | None = None,
) -> dict:
    histo = {"role": role}
    if roi_meta is not None:
        histo["roi"] = roi_meta

    return {
        "type": "Feature",
        "id": feature_id,
        "geometry": geometry,
        "properties": {
            "objectType": "annotation",
            "classification": {
                "name": class_name,
                "colorRGB": -65536,
            },
            "histoannotator": histo,
        },
    }


def collection(*features: dict) -> dict:
    return {"type": "FeatureCollection", "features": list(features)}


def row_by_class(result: dict, class_name: str) -> dict:
    return next(row for row in result["rows"] if row["className"] == class_name)


def positive_row_by_class(result: dict, class_name: str) -> dict:
    return next(
        row
        for row in result["positiveByClass"]["rows"]
        if row["className"] == class_name
    )


class StatisticsContractTests(unittest.TestCase):
    """Freeze scientific geometry precedence used by Statistics/Positive-by-Class."""

    def test_artifact_and_anthracosis_exclusions_drive_positive_by_class(self) -> None:
        fc = collection(
            feature(
                "roi",
                "Tissue",
                rectangle(0, 0, 100, 100),
                role="roi",
                roi_meta={"kind": "tissue"},
            ),
            feature(
                "artifact",
                "Artifact",
                rectangle(0, 0, 10, 10),
                role="artifact",
            ),
            feature("anth", "Anthracosis", rectangle(20, 20, 30, 30)),
            feature("tumor", "Tumor", rectangle(0, 0, 50, 50)),
            feature("positive", "Positive", rectangle(0, 0, 30, 30)),
            feature("stroma", "Stroma", rectangle(50, 0, 100, 50)),
        )

        result = sut.geojson_statistics({
            "featureCollection": fc,
            "imageWidth": 100,
            "imageHeight": 100,
        })

        analysis = result["analysis"]
        self.assertEqual(analysis["source"], "tissue-roi")
        self.assertTrue(analysis["roiPresent"])
        self.assertAlmostEqual(analysis["baseAreaPx2"], 10000.0)
        self.assertEqual(analysis["artifactCount"], 1)
        self.assertAlmostEqual(analysis["artifactAreaPx2"], 100.0)
        self.assertAlmostEqual(analysis["validAreaPx2"], 9900.0)

        anth = row_by_class(result, "Anthracosis")
        positive = row_by_class(result, "Positive")
        stroma = row_by_class(result, "Stroma")
        tumor = row_by_class(result, "Tumor")

        self.assertEqual(anth["count"], 1)
        self.assertAlmostEqual(anth["areaPx2"], 100.0)
        self.assertAlmostEqual(positive["areaPx2"], 700.0)
        self.assertAlmostEqual(stroma["areaPx2"], 2500.0)
        self.assertAlmostEqual(tumor["areaPx2"], 2300.0)

        self.assertEqual(result["totalAnnotations"], 4)
        self.assertAlmostEqual(result["totalUnionAreaPx2"], 4900.0)
        self.assertAlmostEqual(result["totalPercentValid"], 49.494949494949495)

        positive_by_class = result["positiveByClass"]
        self.assertTrue(positive_by_class["available"])
        self.assertAlmostEqual(positive_by_class["positiveEffectiveAreaPx2"], 700.0)
        self.assertEqual(
            positive_by_class["exclusions"],
            ["external-border", "artifact", "anthracosis"],
        )

        tumor_positive = positive_row_by_class(result, "Tumor")
        self.assertAlmostEqual(tumor_positive["classAreaPx2"], 2300.0)
        self.assertAlmostEqual(tumor_positive["positiveAreaPx2"], 700.0)
        self.assertAlmostEqual(
            tumor_positive["positivePercentOfClass"],
            30.434782608695652,
        )

        stroma_positive = positive_row_by_class(result, "Stroma")
        self.assertAlmostEqual(stroma_positive["positiveAreaPx2"], 0.0)
        self.assertAlmostEqual(stroma_positive["positivePercentOfClass"], 0.0)

    def test_overlapping_features_of_same_class_use_union_area_not_sum(self) -> None:
        fc = collection(
            feature("tumor-a", "Tumor", rectangle(0, 0, 60, 20)),
            feature("tumor-b", "Tumor", rectangle(40, 0, 100, 20)),
        )

        result = sut.geojson_statistics({
            "featureCollection": fc,
            "imageWidth": 100,
            "imageHeight": 100,
        })

        tumor = row_by_class(result, "Tumor")
        self.assertEqual(tumor["count"], 2)
        self.assertAlmostEqual(tumor["areaPx2"], 2000.0)
        self.assertAlmostEqual(tumor["percentValid"], 20.0)
        self.assertAlmostEqual(result["totalUnionAreaPx2"], 2000.0)

    def test_statistics_fall_back_to_full_image_when_tissue_roi_is_absent(self) -> None:
        fc = collection(
            feature("tumor", "Tumor", rectangle(0, 0, 20, 10)),
        )

        result = sut.geojson_statistics({
            "featureCollection": fc,
            "imageWidth": 100,
            "imageHeight": 50,
        })

        analysis = result["analysis"]
        self.assertEqual(analysis["source"], "full-image")
        self.assertFalse(analysis["roiPresent"])
        self.assertAlmostEqual(analysis["baseAreaPx2"], 5000.0)
        self.assertAlmostEqual(analysis["validAreaPx2"], 5000.0)
        self.assertAlmostEqual(row_by_class(result, "Tumor")["areaPx2"], 200.0)

    def test_external_border_is_defined_as_percentage_of_tissue_area(self) -> None:
        fc = collection(
            feature(
                "roi",
                "Tissue",
                rectangle(0, 0, 100, 100),
                role="roi",
                roi_meta={
                    "kind": "tissue",
                    "externalBorderExclusion": {
                        "enabled": True,
                        "percent": 10.0,
                    },
                },
            ),
        )

        result = sut.geojson_statistics({
            "featureCollection": fc,
            "imageWidth": 100,
            "imageHeight": 100,
        })

        analysis = result["analysis"]
        self.assertTrue(analysis["externalBorderEnabled"])
        self.assertAlmostEqual(analysis["externalBorderRequestedPct"], 10.0)
        self.assertAlmostEqual(analysis["externalBorderActualPct"], 10.0, places=7)
        self.assertAlmostEqual(analysis["postBorderAreaPx2"], 9000.0, places=5)
        self.assertAlmostEqual(analysis["validAreaPx2"], 9000.0, places=5)
        self.assertAlmostEqual(analysis["externalBorderWidthPx"], 2.5658350976300426, places=7)


if __name__ == "__main__":
    unittest.main()
