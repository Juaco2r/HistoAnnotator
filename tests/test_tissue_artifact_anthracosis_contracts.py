from __future__ import annotations

import unittest
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException
from PIL import Image
from shapely.geometry import box, mapping, shape

import main as sut


def rectangle(x1: float, y1: float, x2: float, y2: float) -> dict:
    return mapping(box(x1, y1, x2, y2))


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
            "classification": {"name": class_name, "colorRGB": -65536},
            "histoannotator": histo,
        },
    }


def collection(*features: dict) -> dict:
    return {"type": "FeatureCollection", "features": list(features)}


class TissueRoiContractTests(unittest.TestCase):
    """Freeze the existing Tissue ROI detector/vectorization behavior."""

    def test_detect_tissue_synthetic_rectangle_freezes_detector_contract(self) -> None:
        rgb = np.full((64, 64, 3), 255, dtype=np.uint8)
        rgb[16:48, 16:48] = [120, 70, 70]
        thumbnail = Image.fromarray(rgb, "RGB")

        with patch.object(
            sut,
            "_tissue_thumbnail",
            return_value=(thumbnail, 640, 640),
        ):
            result = sut.detect_tissue(
                "synthetic",
                {
                    "sensitivity": 50,
                    "smoothing": 0,
                    "minIslandPct": 0,
                    "fillHoles": True,
                    "maxSize": 2048,
                },
            )

        geometry = shape(result["geometry"])
        self.assertEqual(result["sourceWidth"], 640)
        self.assertEqual(result["sourceHeight"], 640)
        self.assertEqual(result["previewWidth"], 64)
        self.assertEqual(result["previewHeight"], 64)
        self.assertAlmostEqual(result["detectedFraction"], 0.2490234375)
        self.assertEqual(result["detector"]["name"], "thumbnail-color-v1")
        self.assertAlmostEqual(result["detector"]["otsuThreshold"], 0.0)
        self.assertAlmostEqual(result["detector"]["effectiveThreshold"], 8.0)
        self.assertEqual(geometry.geom_type, "Polygon")
        self.assertEqual(geometry.bounds, (160.0, 160.0, 470.0, 470.0))
        self.assertAlmostEqual(geometry.area, 95900.0)

    def test_tissue_mask_fill_holes_switch_is_observable(self) -> None:
        mask = np.zeros((20, 20), dtype=np.uint8)
        mask[2:18, 2:18] = 255
        mask[7:13, 7:13] = 0

        preserved = shape(
            sut._tissue_mask_to_geometry(
                mask,
                200,
                200,
                fill_holes=False,
                min_island_fraction=0.0,
                smoothing=0.0,
            )
        )
        filled = shape(
            sut._tissue_mask_to_geometry(
                mask,
                200,
                200,
                fill_holes=True,
                min_island_fraction=0.0,
                smoothing=0.0,
            )
        )

        self.assertEqual(len(preserved.interiors), 1)
        self.assertEqual(len(filled.interiors), 0)
        self.assertAlmostEqual(preserved.area, 17800.0)
        self.assertAlmostEqual(filled.area, 22500.0)

    def test_tissue_min_island_fraction_can_remove_all_components(self) -> None:
        mask = np.zeros((20, 20), dtype=np.uint8)
        mask[2:10, 2:10] = 255
        mask[15:17, 15:17] = 255

        kept = sut._tissue_mask_to_geometry(
            mask,
            200,
            200,
            fill_holes=True,
            min_island_fraction=0.02,
            smoothing=0.0,
        )
        removed = sut._tissue_mask_to_geometry(
            mask,
            200,
            200,
            fill_holes=True,
            min_island_fraction=0.20,
            smoothing=0.0,
        )

        self.assertIsNotNone(kept)
        self.assertAlmostEqual(shape(kept).area, 4900.0)
        self.assertIsNone(removed)


class ArtifactAnalysisRegionContractTests(unittest.TestCase):
    """Freeze ROI clipping and Artifact subtraction used by Anthracosis."""

    def test_anthracosis_analysis_requires_roi(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            sut._f11_valid_analysis_geometry(
                collection(),
                full_width=100,
                full_height=100,
            )
        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("requires a Tissue ROI", str(ctx.exception.detail))

    def test_analysis_roi_is_clipped_to_image_bounds(self) -> None:
        fc = collection(
            feature(
                "roi",
                "Tissue",
                rectangle(-20, -10, 120, 110),
                role="roi",
                roi_meta={"kind": "tissue"},
            ),
        )
        valid, artifact_count = sut._f11_valid_analysis_geometry(
            fc,
            full_width=100,
            full_height=100,
        )
        self.assertEqual(artifact_count, 0)
        self.assertEqual(valid.bounds, (0.0, 0.0, 100.0, 100.0))
        self.assertAlmostEqual(valid.area, 10000.0)

    def test_artifact_role_is_subtracted_even_without_artifact_class_name(self) -> None:
        fc = collection(
            feature(
                "roi",
                "Tissue",
                rectangle(0, 0, 100, 100),
                role="roi",
                roi_meta={"kind": "tissue"},
            ),
            feature(
                "artifact-role",
                "Other",
                rectangle(0, 0, 10, 10),
                role="artifact",
            ),
        )
        valid, artifact_count = sut._f11_valid_analysis_geometry(
            fc,
            full_width=100,
            full_height=100,
        )
        self.assertEqual(artifact_count, 1)
        self.assertAlmostEqual(valid.area, 9900.0)

    def test_artifact_class_is_subtracted_even_with_annotation_role(self) -> None:
        fc = collection(
            feature(
                "roi",
                "Tissue",
                rectangle(0, 0, 100, 100),
                role="roi",
                roi_meta={"kind": "tissue"},
            ),
            feature(
                "artifact-class",
                "Artifact",
                rectangle(20, 0, 30, 10),
                role="annotation",
            ),
        )
        valid, artifact_count = sut._f11_valid_analysis_geometry(
            fc,
            full_width=100,
            full_height=100,
        )
        self.assertEqual(artifact_count, 1)
        self.assertAlmostEqual(valid.area, 9900.0)

    def test_role_and_class_artifacts_are_both_counted_and_subtracted(self) -> None:
        fc = collection(
            feature(
                "roi",
                "Tissue",
                rectangle(-10, -10, 110, 110),
                role="roi",
                roi_meta={"kind": "tissue"},
            ),
            feature("artifact-role", "Other", rectangle(0, 0, 10, 10), role="artifact"),
            feature("artifact-class", "Artifact", rectangle(20, 0, 30, 10)),
        )
        valid, artifact_count = sut._f11_valid_analysis_geometry(
            fc,
            full_width=100,
            full_height=100,
        )
        self.assertEqual(artifact_count, 2)
        self.assertAlmostEqual(valid.area, 9800.0)


class AnthracosisMaskContractTests(unittest.TestCase):
    """Freeze the F1.3/F1.5 black-seed and bounded-growth behavior."""

    @staticmethod
    def _run(
        rgb: np.ndarray,
        *,
        valid_mask: np.ndarray | None = None,
        sensitivity: float = 50.0,
        minimum: int = 1,
        growth: int = 0,
        dilation: int = 0,
    ) -> tuple[np.ndarray, dict]:
        if valid_mask is None:
            valid_mask = np.ones(rgb.shape[:2], dtype=bool)
        return sut._f13_black_seed_growth_mask(
            rgb,
            valid_mask=valid_mask,
            sensitivity=sensitivity,
            min_component_pixels=minimum,
            growth_radius=growth,
            final_mask_dilate_px=dilation,
        )

    def test_default_sensitivity_freezes_seed_and_growth_thresholds(self) -> None:
        rgb = np.full((3, 3, 3), 255, dtype=np.uint8)
        rgb[1, 1] = [10, 10, 10]
        mask, meta = self._run(rgb)

        self.assertEqual(int(mask.sum()), 1)
        self.assertEqual(
            meta,
            {
                "ultraDarkValueLimit": 31.0,
                "seedValueLimit": 40.0,
                "seedSaturationLimit": 50.0,
                "neutralSeedValueLimit": 47.0,
                "neutralSeedSaturationLimit": 21.0,
                "growValueLimit": 157.0,
                "growSaturationLimit": 127.0,
                "lightNeutralValueLimit": 175.0,
                "lightNeutralSaturationLimit": 76.0,
                "growthRadius": 0,
                "finalMaskDilatePx": 0,
                "minimumComponentPixels": 1,
            },
        )

    def test_dark_brown_without_true_black_seed_is_not_accepted(self) -> None:
        rgb = np.full((5, 5, 3), 255, dtype=np.uint8)
        rgb[2, 2] = [35, 25, 20]
        mask, _meta = self._run(rgb, growth=3)
        self.assertEqual(int(mask.sum()), 0)

    def test_growth_is_bounded_by_growth_radius(self) -> None:
        rgb = np.full((5, 9, 3), 255, dtype=np.uint8)
        rgb[2, 2] = [10, 10, 10]
        rgb[2, 3:7] = [120, 120, 120]

        no_growth, _ = self._run(rgb, growth=0)
        two_steps, _ = self._run(rgb, growth=2)

        self.assertEqual(int(no_growth.sum()), 1)
        self.assertEqual(int(two_steps.sum()), 3)
        self.assertTrue(two_steps[2, 2])
        self.assertTrue(two_steps[2, 3])
        self.assertTrue(two_steps[2, 4])
        self.assertFalse(two_steps[2, 5])

    def test_strong_blue_boundary_does_not_join_black_seed(self) -> None:
        rgb = np.full((5, 7, 3), 255, dtype=np.uint8)
        rgb[2, 2] = [10, 10, 10]
        rgb[2, 3] = [30, 30, 110]

        mask, _ = self._run(rgb, growth=2)
        self.assertEqual(int(mask.sum()), 1)
        self.assertTrue(mask[2, 2])
        self.assertFalse(mask[2, 3])

    def test_minimum_component_pixels_can_remove_a_single_black_seed(self) -> None:
        rgb = np.full((5, 5, 3), 255, dtype=np.uint8)
        rgb[2, 2] = [10, 10, 10]
        mask, _ = self._run(rgb, minimum=2)
        self.assertEqual(int(mask.sum()), 0)

    def test_final_dilation_is_clipped_by_valid_mask(self) -> None:
        rgb = np.full((7, 7, 3), 255, dtype=np.uint8)
        rgb[3, 3] = [10, 10, 10]
        valid = np.zeros((7, 7), dtype=bool)
        valid[:, :4] = True

        mask, _ = self._run(
            rgb,
            valid_mask=valid,
            dilation=2,
        )

        self.assertTrue(mask[3, 3])
        self.assertFalse(np.any(mask[:, 4:]))
        self.assertGreater(int(mask.sum()), 1)


if __name__ == "__main__":
    unittest.main()
