from __future__ import annotations

import json
import math
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import HTTPException
from shapely.geometry import shape

import main as sut


def polygon(coords, *, props=None, feature_id="f1"):
    return {
        "type": "Feature",
        "id": feature_id,
        "geometry": {"type": "Polygon", "coordinates": [coords]},
        "properties": props or {},
    }


def collection(*features):
    return {"type": "FeatureCollection", "features": list(features)}


class GeoJsonSanitizationContractTests(unittest.TestCase):
    def test_non_feature_collection_is_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            sut.sanitize_qupath_feature_collection({"type": "Feature", "features": []})
        self.assertEqual(ctx.exception.status_code, 422)

    def test_invalid_and_unsupported_features_are_dropped(self):
        payload = collection(
            {"type": "NotFeature"},
            {"type": "Feature", "geometry": None, "properties": {}},
            {"type": "Feature", "geometry": {"type": "GeometryCollection", "geometries": []}, "properties": {}},
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [math.inf, 0]}, "properties": {}},
        )
        normalized, report = sut.sanitize_qupath_feature_collection(payload)
        self.assertEqual(normalized, {"type": "FeatureCollection", "features": []})
        self.assertEqual(report, {"repaired": 0, "dropped": 4, "features": 0})

    def test_self_intersecting_polygon_is_repaired_to_valid_polygonal_geometry(self):
        bowtie = polygon([[0, 0], [10, 10], [0, 10], [10, 0], [0, 0]])
        normalized, report = sut.sanitize_qupath_feature_collection(collection(bowtie))
        self.assertEqual(report, {"repaired": 1, "dropped": 0, "features": 1})
        geom = shape(normalized["features"][0]["geometry"])
        self.assertTrue(geom.is_valid)
        self.assertIn(geom.geom_type, {"Polygon", "MultiPolygon"})
        self.assertAlmostEqual(geom.area, 50.0)

    def test_point_and_line_geometries_are_preserved_when_finite(self):
        payload = collection(
            {"type": "Feature", "id": "p", "geometry": {"type": "Point", "coordinates": [1, 2]}, "properties": {}},
            {"type": "Feature", "id": "l", "geometry": {"type": "LineString", "coordinates": [[0, 0], [2, 3]]}, "properties": {}},
        )
        normalized, report = sut.sanitize_qupath_feature_collection(payload)
        self.assertEqual(report, {"repaired": 0, "dropped": 0, "features": 2})
        self.assertEqual([f["geometry"]["type"] for f in normalized["features"]], ["Point", "LineString"])

    def test_classification_color_precedence_and_artifact_role_are_frozen(self):
        props = {
            "object_type": "annotation",
            "isLocked": 1,
            "classification": {
                "name": " Artifact ",
                "color": [1.2, 260, 3.6],
                "colorRGB": -65536,
            },
            "histoannotator": {
                "role": "annotation",
                "color": "#112233",
            },
        }
        normalized, _ = sut.sanitize_qupath_feature_collection(collection(polygon([[0,0],[10,0],[10,10],[0,10],[0,0]], props=props)))
        out = normalized["features"][0]["properties"]
        self.assertEqual(out["objectType"], "annotation")
        self.assertTrue(out["isLocked"])
        self.assertEqual(out["classification"], {"name": "Artifact", "color": [1, 255, 4]})
        self.assertEqual(out["histoannotator"]["role"], "artifact")
        self.assertEqual(out["histoannotator"]["schemaVersion"], 1)

    def test_roi_role_takes_precedence_over_artifact_class(self):
        props = {
            "classification": {"name": "Artifact", "colorRGB": -65536},
            "histoannotator": {"role": "roi", "roi": {"kind": "tissue"}},
        }
        normalized, _ = sut.sanitize_qupath_feature_collection(collection(polygon([[0,0],[10,0],[10,10],[0,10],[0,0]], props=props)))
        histo = normalized["features"][0]["properties"]["histoannotator"]
        self.assertEqual(histo["role"], "roi")
        self.assertEqual(histo["roi"], {"kind": "tissue"})

    def test_legacy_review_metadata_migrates_to_workflow(self):
        props = {
            "classification": {"name": "Tumor", "colorRGB": 0x112233},
            "histoannotatorReview": {"status": "correct", "reviewedAt": "2026-08-01T12:00:00Z"},
        }
        normalized, _ = sut.sanitize_qupath_feature_collection(collection(polygon([[0,0],[10,0],[10,10],[0,10],[0,0]], props=props)))
        workflow = normalized["features"][0]["properties"]["histoannotator"]["workflow"]
        self.assertEqual(workflow, {
            "status": "Reviewed",
            "reviewDecision": "correct",
            "reviewer": None,
            "reviewedAt": "2026-08-01T12:00:00Z",
            "approvedAt": None,
        })

    def test_maybe_or_later_review_decision_forces_draft(self):
        for decision in ("maybe", "later"):
            props = {
                "histoannotator": {"workflow": {"status": "Approved", "reviewDecision": decision}},
            }
            normalized, _ = sut.sanitize_qupath_feature_collection(collection(polygon([[0,0],[10,0],[10,10],[0,10],[0,0]], props=props)))
            workflow = normalized["features"][0]["properties"]["histoannotator"]["workflow"]
            self.assertEqual(workflow["status"], "Draft")
            self.assertEqual(workflow["reviewDecision"], decision)

    def test_nonfinite_measurement_values_are_removed(self):
        props = {
            "measurements": [
                {"name": "Area", "value": 12.5, "bad": float("nan"), "inf": float("inf")},
                "legacy",
            ]
        }
        normalized, _ = sut.sanitize_qupath_feature_collection(collection(polygon([[0,0],[10,0],[10,10],[0,10],[0,0]], props=props)))
        measurements = normalized["features"][0]["properties"]["measurements"]
        self.assertEqual(measurements, [{"name": "Area", "value": 12.5}, "legacy"])

    def test_qupath_export_returns_sanitized_collection_and_report(self):
        payload = collection(
            polygon([[0,0],[10,10],[0,10],[10,0],[0,0]], feature_id="repair"),
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [float("nan"), 0]}, "properties": {}},
        )
        result = sut.qupath_export(payload)
        self.assertEqual(result["report"], {"repaired": 1, "dropped": 1, "features": 1})
        self.assertEqual(result["featureCollection"]["type"], "FeatureCollection")
        self.assertEqual(len(result["featureCollection"]["features"]), 1)


class AnnotationPersistenceContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.annotation_patch = patch.object(sut, "ANNOTATION_ROOT", self.root)
        self.annotation_patch.start()
        self.safe_patch = patch.object(sut, "safe_image_path", return_value=(Path("/fake/image.tif"), "nested/image.tif"))
        self.safe_patch.start()

    def tearDown(self):
        self.safe_patch.stop()
        self.annotation_patch.stop()
        self.tmp.cleanup()

    @staticmethod
    def stable_payload():
        return collection({
            "type": "Feature",
            "id": "stable-id",
            "geometry": {"type": "Point", "coordinates": [1, 2]},
            "properties": {
                "objectType": "annotation",
                "isLocked": False,
                "histoannotator": {
                    "schemaVersion": 1,
                    "role": "annotation",
                    "workflow": {
                        "status": "Draft",
                        "reviewDecision": None,
                        "reviewer": None,
                        "reviewedAt": None,
                        "approvedAt": None,
                    },
                    "provenance": {},
                },
            },
        })

    def test_default_and_named_annotation_paths_are_frozen(self):
        default = sut.annotation_path("nested/image.tif", "Default")
        named = sut.annotation_path("nested/image.tif", "Review 1")
        self.assertEqual(default, self.root / "nested/image.tif.geojson")
        self.assertEqual(named, self.root / "nested/image.tif.annotations" / "Review 1.geojson")

    def test_named_file_lifecycle_preserves_default_and_sorted_listing(self):
        created_b = sut.create_annotation_file("image", {"name": "zeta"})
        created_a = sut.create_annotation_file("image", {"name": "Alpha"})
        duplicate_default = sut.create_annotation_file("image", {"name": "default"})

        self.assertTrue(created_b["created"])
        self.assertTrue(created_a["created"])
        self.assertEqual(duplicate_default["created"], False)
        self.assertEqual(sut.get_annotation_files("image")["files"], ["Default", "Alpha", "zeta"])

        with self.assertRaises(HTTPException) as ctx:
            sut.delete_annotation_file("image", file="Default")
        self.assertEqual(ctx.exception.status_code, 409)

        deleted = sut.delete_annotation_file("image", file="Alpha")
        self.assertTrue(deleted["deleted"])
        self.assertEqual(deleted["files"], ["Default", "zeta"])

    def test_put_compact_ack_only_when_normalization_does_not_change_payload(self):
        stable = self.stable_payload()
        response = sut.put_annotations("image", stable, file="Default", compact=True)
        self.assertTrue(response["compactAck"])
        self.assertFalse(response["normalizedChanged"])
        self.assertNotIn("featureCollection", response)
        self.assertEqual(response["features"], 1)

        changed = collection({
            "type": "Feature",
            "id": "raw",
            "geometry": {"type": "Point", "coordinates": [1, 2]},
            "properties": {},
        })
        response2 = sut.put_annotations("image", changed, file="Default", compact=True)
        self.assertFalse(response2["compactAck"])
        self.assertTrue(response2["normalizedChanged"])
        self.assertIn("featureCollection", response2)

    def test_second_save_creates_backup_of_previous_document(self):
        first = self.stable_payload()
        sut.put_annotations("image", first, file="Default", compact=False)
        destination = sut.annotation_path("nested/image.tif", "Default")

        second = self.stable_payload()
        second["features"][0]["geometry"]["coordinates"] = [9, 9]
        sut.put_annotations("image", second, file="Default", compact=False)

        backup = destination.with_suffix(destination.suffix + ".bak")
        self.assertTrue(backup.exists())
        previous = json.loads(backup.read_text(encoding="utf-8"))
        current = json.loads(destination.read_text(encoding="utf-8"))
        self.assertEqual(previous["features"][0]["geometry"]["coordinates"], [1, 2])
        self.assertEqual(current["features"][0]["geometry"]["coordinates"], [9, 9])

    def test_download_uses_geojson_media_type_and_named_filename(self):
        stable = self.stable_payload()
        sut.put_annotations("image", stable, file="Review 1", compact=False)
        response = sut.download_annotations("image", file="Review 1")
        self.assertEqual(response.media_type, "application/geo+json")
        self.assertEqual(response.headers["content-disposition"], 'attachment; filename="image.tif.Review 1.geojson"')
        payload = json.loads(response.body)
        self.assertEqual(payload["type"], "FeatureCollection")
        self.assertEqual(len(payload["features"]), 1)

    def test_get_missing_annotation_file_returns_empty_feature_collection(self):
        response = sut.get_annotations("image", file="Missing")
        self.assertEqual(json.loads(response.body), {"type": "FeatureCollection", "features": []})


if __name__ == "__main__":
    unittest.main()
