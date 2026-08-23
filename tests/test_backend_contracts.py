from __future__ import annotations

import unittest

from fastapi import HTTPException

import main as sut


class BackendContractTests(unittest.TestCase):
    """Freeze small but important backend contracts from baseline 8441993."""

    def test_image_id_roundtrip_preserves_relative_path(self) -> None:
        relative = "cases/área 01/sample image.tif"
        encoded = sut.encode_image_id(relative)
        self.assertNotIn("=", encoded)
        self.assertEqual(sut.decode_image_id(encoded), relative)

    def test_invalid_image_id_is_http_400(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            sut.decode_image_id("%%%not-base64%%%")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertEqual(ctx.exception.detail, "Invalid image identifier")

    def test_annotation_file_default_normalization(self) -> None:
        self.assertEqual(sut.normalize_annotation_file(None), "Default")
        self.assertEqual(sut.normalize_annotation_file(""), "Default")
        self.assertEqual(sut.normalize_annotation_file("   "), "Default")
        self.assertEqual(sut.normalize_annotation_file(" Review 1 "), "Review 1")

    def test_annotation_file_rejects_path_like_names(self) -> None:
        for bad_name in ("../escape", "folder/name", ".", ".."):
            with self.subTest(bad_name=bad_name):
                with self.assertRaises(HTTPException) as ctx:
                    sut.normalize_annotation_file(bad_name)
                self.assertEqual(ctx.exception.status_code, 422)

    def test_artifact_class_is_always_canonical(self) -> None:
        result = sut.validate_classes({
            "classes": [
                {"name": "Tumor", "color": "#FF0000"},
                {"name": "artifact", "color": "#000000"},
            ]
        })
        self.assertEqual(result, [
            {"name": "Tumor", "color": "#ff0000"},
            {"name": "Artifact", "color": "#69db7c"},
        ])

    def test_artifact_is_appended_if_missing(self) -> None:
        result = sut.validate_classes([
            {"name": "Tumor", "color": "#112233"},
        ])
        self.assertEqual(result[-1], {"name": "Artifact", "color": "#69db7c"})

    def test_duplicate_class_names_are_case_insensitive(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            sut.validate_classes([
                {"name": "Tumor", "color": "#112233"},
                {"name": "tumor", "color": "#445566"},
            ])
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("Duplicate class name", str(ctx.exception.detail))

    def test_empty_feature_collection_contract(self) -> None:
        self.assertEqual(
            sut.empty_feature_collection("case/sample.tif"),
            {"type": "FeatureCollection", "features": []},
        )


if __name__ == "__main__":
    unittest.main()
