from __future__ import annotations

import unittest
from pathlib import Path
from types import SimpleNamespace
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
            "classification": {
                "name": class_name,
                "colorRGB": -65536,
            },
            "histoannotator": histo,
        },
    }


def collection(*features: dict) -> dict:
    return {
        "type": "FeatureCollection",
        "features": list(features),
    }


class HDABMathContractTests(unittest.TestCase):
    """Freeze the quantitative H-DAB math and advanced parameter semantics."""

    def test_stain_vectors_and_hdab_matrix_are_frozen(self) -> None:
        np.testing.assert_allclose(
            sut.STAIN_HEMATOXYLIN,
            np.array([0.65, 0.70, 0.29], dtype=np.float32),
            rtol=0.0,
            atol=1e-7,
        )
        np.testing.assert_allclose(
            sut.STAIN_DAB,
            np.array([0.27, 0.57, 0.78], dtype=np.float32),
            rtol=0.0,
            atol=1e-7,
        )

        matrix, names = sut._stain_matrix("hdab")

        self.assertEqual(names, {"hematoxylin": 0, "dab": 1})
        np.testing.assert_allclose(
            matrix,
            np.array(
                [
                    [0.65110785, 0.70119303, 0.29049426],
                    [0.26916690, 0.56824120, 0.77759320],
                    [0.63304347, -0.71285990, 0.30180565],
                ],
                dtype=np.float32,
            ),
            rtol=1e-6,
            atol=1e-6,
        )

    def test_known_rgb_values_freeze_dab_optical_density(self) -> None:
        matrix, names = sut._stain_matrix("hdab")
        inverse = np.linalg.inv(matrix)
        rgb = np.array(
            [[
                [255, 255, 255],
                [0, 0, 0],
                [120, 80, 40],
                [50, 50, 150],
                [120, 80, 20],
            ]],
            dtype=np.float32,
        )

        dab = sut._f22_dab_concentration(
            rgb,
            inverse=inverse,
            dab_index=names["dab"],
            maximum_od=6.0,
            sigma_px=0.0,
        )

        np.testing.assert_allclose(
            dab,
            np.array(
                [[0.0, 4.6346993, 2.2711005, 0.0, 3.2827122]],
                dtype=np.float32,
            ),
            rtol=1e-6,
            atol=1e-6,
        )

    def test_gaussian_smoothing_preserves_constant_dab_field(self) -> None:
        matrix, names = sut._stain_matrix("hdab")
        inverse = np.linalg.inv(matrix)
        rgb = np.full((9, 9, 3), [120, 80, 40], dtype=np.float32)

        unsmoothed = sut._f22_dab_concentration(
            rgb,
            inverse=inverse,
            dab_index=names["dab"],
            maximum_od=6.0,
            sigma_px=0.0,
        )
        smoothed = sut._f22_dab_concentration(
            rgb,
            inverse=inverse,
            dab_index=names["dab"],
            maximum_od=6.0,
            sigma_px=2.0,
        )

        np.testing.assert_allclose(smoothed, unsmoothed, rtol=1e-6, atol=1e-6)

    def test_otsu_histogram_threshold_is_frozen(self) -> None:
        histogram = np.array([10, 0, 0, 10], dtype=np.int64)

        threshold = sut._f20_otsu_threshold_from_histogram(
            histogram,
            maximum_od=6.0,
        )

        self.assertAlmostEqual(threshold, 0.75)

    def test_wov_delta_zero_matches_current_otsu_choice(self) -> None:
        histogram = np.array([1, 2, 3, 4], dtype=np.int64)

        otsu = sut._f20_otsu_threshold_from_histogram(
            histogram,
            maximum_od=6.0,
        )
        wov = sut._f22_weighted_object_variance_threshold(
            histogram,
            maximum_od=6.0,
            delta=0.0,
        )

        self.assertAlmostEqual(otsu, 2.25)
        self.assertAlmostEqual(wov, otsu)

    def test_advanced_parameters_alias_clamp_and_convert_units(self) -> None:
        params = sut._f22_parameters(
            {
                "thresholdMode": "fixed",
                "thresholdOd": 9.0,
                "wovDelta": 2.0,
                "smoothingEnabled": True,
                "smoothingSigma": 2.0,
                "smallObjectFilterEnabled": True,
                "minimumObjectArea": 100.0,
                "mpp": 0.5,
                "tileSize": 100,
            }
        )

        self.assertEqual(params["thresholdMode"], "manual")
        self.assertAlmostEqual(params["thresholdOd"], 6.0)
        self.assertAlmostEqual(params["wovDelta"], 1.0)
        self.assertAlmostEqual(params["smoothingSigmaPx"], 4.0)
        self.assertEqual(params["smoothingUnit"], "um")
        self.assertAlmostEqual(params["minimumObjectAreaPx2"], 400.0)
        self.assertEqual(params["minimumObjectAreaUnit"], "um2")
        self.assertEqual(params["tileSize"], 512)
        self.assertEqual(params["histogramBins"], 4096)
        self.assertAlmostEqual(params["maximumOd"], 6.0)

    def test_invalid_advanced_threshold_mode_is_http_422(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            sut._f22_parameters({"thresholdMode": "not-a-mode"})

        self.assertEqual(ctx.exception.status_code, 422)

    def test_threshold_router_preserves_algorithm_names(self) -> None:
        histogram = np.array([10, 0, 0, 10], dtype=np.int64)

        manual, manual_method = sut._f22_threshold_from_histogram(
            histogram,
            {
                "thresholdMode": "manual",
                "thresholdOd": 0.42,
                "maximumOd": 6.0,
                "wovDelta": 0.25,
            },
        )
        otsu, otsu_method = sut._f22_threshold_from_histogram(
            histogram,
            {
                "thresholdMode": "auto_otsu",
                "thresholdOd": 0.42,
                "maximumOd": 6.0,
                "wovDelta": 0.25,
            },
        )
        wov, wov_method = sut._f22_threshold_from_histogram(
            histogram,
            {
                "thresholdMode": "auto_wov",
                "thresholdOd": 0.42,
                "maximumOd": 6.0,
                "wovDelta": 0.25,
            },
        )

        self.assertAlmostEqual(manual, 0.42)
        self.assertEqual(manual_method, "manual-dab-optical-density-v1")
        self.assertAlmostEqual(otsu, 0.75)
        self.assertEqual(otsu_method, "otsu-dab-optical-density-v1")
        self.assertAlmostEqual(wov, 0.75)
        self.assertEqual(
            wov_method,
            "weighted-object-variance-dab-optical-density-v1",
        )


class HDABValidRegionContractTests(unittest.TestCase):
    """Freeze Tissue -> Border -> Artifact -> Anthracosis precedence."""

    def test_hdab_analysis_requires_tissue_roi(self) -> None:
        with self.assertRaises(HTTPException) as ctx:
            sut._f20_hdab_valid_geometry(
                collection(),
                full_width=100,
                full_height=100,
            )

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("requires a Tissue ROI", str(ctx.exception.detail))

    def test_valid_region_applies_border_artifact_then_anthracosis(self) -> None:
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
            feature(
                "artifact",
                "Artifact",
                rectangle(0, 0, 10, 10),
                role="artifact",
            ),
            feature(
                "anthracosis",
                "Anthracosis",
                rectangle(20, 20, 30, 30),
            ),
        )

        valid, report = sut._f20_hdab_valid_geometry(
            fc,
            full_width=100,
            full_height=100,
        )

        self.assertAlmostEqual(report["baseAreaPx2"], 10000.0)
        self.assertAlmostEqual(report["postBorderAreaPx2"], 9000.0, places=5)
        self.assertAlmostEqual(report["externalBorderRequestedPct"], 10.0)
        self.assertAlmostEqual(report["externalBorderActualPct"], 10.0, places=7)
        self.assertAlmostEqual(report["externalBorderWidthPx"], 2.5658350976300426, places=7)
        self.assertEqual(report["artifactCount"], 1)
        self.assertAlmostEqual(report["artifactAreaPx2"], 55.26680779562932, places=6)
        self.assertEqual(report["anthracosisCount"], 1)
        self.assertAlmostEqual(report["anthracosisAreaPx2"], 100.0)
        self.assertAlmostEqual(report["validGeometryAreaPx2"], 8844.733192145275, places=6)
        self.assertAlmostEqual(valid.area, report["validGeometryAreaPx2"], places=7)


class _FakeSlide:
    def __init__(self) -> None:
        self.dimensions = (4, 4)
        row = np.array(
            [
                [255, 255, 255],
                [0, 0, 0],
                [120, 80, 40],
                [50, 50, 150],
            ],
            dtype=np.uint8,
        )
        self.rgb = np.stack([row, row, row, row], axis=0)

    def read_region(
        self,
        location: tuple[int, int],
        level: int,
        size: tuple[int, int],
    ) -> Image.Image:
        del level
        x, y = location
        width, height = size
        return Image.fromarray(
            self.rgb[y:y + height, x:x + width],
            "RGB",
        )


class HDABQuantitativeContractTests(unittest.TestCase):
    """Freeze F2.0 native-resolution Positive/Negative pixel quantification."""

    def _feature_collection(self) -> dict:
        return collection(
            feature(
                "roi",
                "Tissue",
                rectangle(0, 0, 4, 4),
                role="roi",
                roi_meta={"kind": "tissue"},
            )
        )

    def _patch_hdab_slide(self):
        handle = SimpleNamespace(slide=_FakeSlide())
        return (
            patch.object(
                sut,
                "safe_image_path",
                return_value=(Path("/tmp/fake.svs"), "fake.svs"),
            ),
            patch.object(
                sut,
                "_read_image_types",
                return_value={"fake.svs": "hdab"},
            ),
            patch.object(sut, "preparation_required", return_value=False),
            patch.object(
                sut,
                "resolve_render_path",
                return_value=Path("/tmp/fake.svs"),
            ),
            patch.object(sut, "get_slide", return_value=handle),
        )

    def test_quantification_rejects_non_hdab_image_type(self) -> None:
        with (
            patch.object(
                sut,
                "safe_image_path",
                return_value=(Path("/tmp/fake.svs"), "fake.svs"),
            ),
            patch.object(
                sut,
                "_read_image_types",
                return_value={"fake.svs": "he"},
            ),
        ):
            with self.assertRaises(HTTPException) as ctx:
                sut.analyze_hdab_quantitative(
                    "fake",
                    {
                        "featureCollection": self._feature_collection(),
                        "thresholdMode": "manual",
                        "thresholdOd": 3.0,
                    },
                )

        self.assertEqual(ctx.exception.status_code, 422)
        self.assertIn("only available", str(ctx.exception.detail))

    def test_manual_quantification_freezes_positive_negative_pixel_counts(self) -> None:
        patches = self._patch_hdab_slide()
        for active in patches:
            active.start()
        try:
            result = sut.analyze_hdab_quantitative(
                "fake",
                {
                    "featureCollection": self._feature_collection(),
                    "thresholdMode": "manual",
                    "thresholdOd": 3.0,
                    "tileSize": 512,
                },
            )
        finally:
            for active in reversed(patches):
                active.stop()

        self.assertEqual(result["method"], "quantitative-hdab-native-v1")
        self.assertEqual(result["threshold"]["method"], "manual-dab-optical-density-v1")
        self.assertAlmostEqual(result["threshold"]["dabOpticalDensity"], 3.0)
        self.assertEqual(
            result["analysis"]["analysisRegion"],
            "Tissue ROI - External border - Artifact - Anthracosis",
        )
        self.assertEqual(result["analysis"]["analysisResolution"], "native-level-0")
        self.assertEqual(result["results"]["validPixels"], 16)
        self.assertEqual(result["results"]["positivePixels"], 4)
        self.assertEqual(result["results"]["negativePixels"], 12)
        self.assertAlmostEqual(result["results"]["positivePercent"], 25.0)
        self.assertAlmostEqual(result["results"]["negativePercent"], 75.0)
        self.assertAlmostEqual(
            result["results"]["meanDabOpticalDensity"],
            1.726449966430664,
            places=6,
        )
        self.assertEqual(result["tiles"], {"planned": 1, "processed": 1, "skipped": 0})
        self.assertNotIn("featureCollection", result)
        self.assertNotIn("geometry", result)

    def test_auto_quantification_freezes_current_otsu_bin_semantics(self) -> None:
        patches = self._patch_hdab_slide()
        for active in patches:
            active.start()
        try:
            result = sut.analyze_hdab_quantitative(
                "fake",
                {
                    "featureCollection": self._feature_collection(),
                    "thresholdMode": "auto",
                    "tileSize": 512,
                },
            )
        finally:
            for active in reversed(patches):
                active.stop()

        self.assertEqual(result["threshold"]["method"], "otsu-dab-optical-density-v1")
        self.assertAlmostEqual(
            result["threshold"]["dabOpticalDensity"],
            0.000732421875,
        )
        self.assertEqual(result["results"]["positivePixels"], 16)
        self.assertEqual(result["results"]["negativePixels"], 0)
        self.assertAlmostEqual(result["results"]["positivePercent"], 100.0)


if __name__ == "__main__":
    unittest.main()
