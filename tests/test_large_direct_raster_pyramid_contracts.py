from __future__ import annotations

import inspect
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from PIL import Image

from app.imaging import service


class _FakeRaster:
    def __init__(self, size: tuple[int, int], mode: str = "RGB") -> None:
        self.size = size
        self.mode = mode

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class LargeDirectRasterPreparationContracts(unittest.TestCase):
    def test_small_jpeg_remains_direct(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "small.jpg"
            Image.new("RGB", (1024, 768), "white").save(
                path,
                format="JPEG",
                quality=90,
            )
            self.assertFalse(
                service.preparation_required(path)
            )

    def test_large_dimension_jpeg_requires_pyramid(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "wide.jpg"
            Image.new("RGB", (9000, 32), "white").save(
                path,
                format="JPEG",
                quality=90,
            )
            self.assertTrue(
                service.preparation_required(path)
            )

    def test_large_decoded_memory_requires_pyramid(self) -> None:
        fake = _FakeRaster((7000, 6000))

        with mock.patch.object(
            service.Image,
            "open",
            return_value=fake,
        ):
            path = Path("large.jpg")
            self.assertTrue(
                service.preparation_required(path)
            )

    def test_decompression_bomb_routes_to_preparation(self) -> None:
        with mock.patch.object(
            service.Image,
            "open",
            side_effect=Image.DecompressionBombError(
                "too many pixels"
            ),
        ):
            path = Path("huge.jpg")
            self.assertTrue(
                service.preparation_required(path)
            )

    def test_prepared_large_raster_is_not_reported_as_direct(self) -> None:
        source = inspect.getsource(
            service.image_info
        )
        self.assertIn(
            "not preparation_required(path)",
            source,
        )

    def test_jpeg_pyramid_uses_compact_internal_compression(self) -> None:
        source = inspect.getsource(
            service.convert_to_pyramidal_tiff
        )
        self.assertIn(
            '"jpeg"',
            source,
        )
        self.assertIn(
            '"compression": compression',
            source,
        )
        self.assertIn(
            "if jpeg_source",
            source,
        )
        self.assertIn(
            "PYRAMID_JPEG_QUALITY",
            source,
        )

    def test_visual_pyramid_does_not_replace_original_source(self) -> None:
        worker = inspect.getsource(
            service.prepare_image_worker
        )
        self.assertIn(
            '"signature": source_signature(source, relative)',
            worker,
        )
        self.assertIn(
            '"renderFile": render_path.name',
            worker,
        )


if __name__ == "__main__":
    unittest.main()
