#!/usr/bin/env python3
"""Deterministic unit coverage for cut-asset-sheet.py."""

from __future__ import annotations

import importlib.util
import io
import json
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path

from PIL import Image, ImageDraw


MODULE_PATH = Path(__file__).with_name("cut-asset-sheet.py")
SPEC = importlib.util.spec_from_file_location("cut_asset_sheet", MODULE_PATH)
cut_asset_sheet = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(cut_asset_sheet)


class CutAssetSheetTests(unittest.TestCase):
    def test_background_components_produce_individual_padded_boxes(self):
        image = Image.new("RGB", (120, 80), (35, 32, 34))
        draw = ImageDraw.Draw(image)
        # Deliberately irregular placements; no equal grid can crop these tightly.
        draw.rectangle((7, 6, 37, 30), fill=(210, 115, 28))
        draw.rectangle((62, 3, 111, 25), fill=(225, 185, 42))
        draw.rectangle((22, 47, 53, 74), fill=(155, 70, 20))
        mask = cut_asset_sheet.foreground_mask(
            image,
            background=cut_asset_sheet.sample_background(image, band=2),
            distance_threshold=30,
            chroma_threshold=18,
            alpha_threshold=8,
            close_radius=0,
        )
        components = cut_asset_sheet.ordered_components(
            cut_asset_sheet.component_boxes(mask, min_area=20), "reading"
        )
        self.assertEqual(
            [box for _, box in components],
            [(7, 6, 38, 31), (62, 3, 112, 26), (22, 47, 54, 75)],
        )
        self.assertEqual(
            [cut_asset_sheet.padded_box(box, 3, image.size) for _, box in components],
            [(4, 3, 41, 34), (59, 0, 115, 29), (19, 44, 57, 78)],
        )

    def test_alpha_mask_ignores_hidden_rgb_background(self):
        image = Image.new("RGBA", (50, 30), (230, 20, 230, 0))
        ImageDraw.Draw(image).rectangle((11, 7, 34, 23), fill=(40, 80, 120, 255))
        self.assertTrue(cut_asset_sheet.alpha_has_transparency(image, 8))
        mask = cut_asset_sheet.foreground_mask(
            image,
            background=None,
            distance_threshold=30,
            chroma_threshold=18,
            alpha_threshold=8,
            close_radius=0,
        )
        self.assertEqual(cut_asset_sheet.component_boxes(mask, 10), [(408, (11, 7, 35, 24))])

    def test_tinted_dark_background_is_not_foreground(self):
        image = Image.new("RGB", (60, 40), (38, 13, 13))
        ImageDraw.Draw(image).rectangle((17, 9, 42, 30), fill=(190, 95, 25))
        background = cut_asset_sheet.sample_background(image, band=2)
        mask = cut_asset_sheet.foreground_mask(
            image,
            background=background,
            distance_threshold=30,
            chroma_threshold=18,
            alpha_threshold=8,
            close_radius=0,
        )
        self.assertEqual(
            cut_asset_sheet.component_boxes(mask, min_area=20),
            [(572, (17, 9, 43, 31))],
        )

    def test_close_radius_can_be_disabled_for_tightly_spaced_assets(self):
        image = Image.new("RGB", (40, 20), (30, 28, 29))
        draw = ImageDraw.Draw(image)
        draw.rectangle((4, 4, 12, 15), fill=(200, 80, 25))
        draw.rectangle((16, 4, 24, 15), fill=(200, 80, 25))
        kwargs = {
            "background": (30, 28, 29),
            "distance_threshold": 30,
            "chroma_threshold": 18,
            "alpha_threshold": 8,
        }
        open_mask = cut_asset_sheet.foreground_mask(
            image, close_radius=0, **kwargs
        )
        closed_mask = cut_asset_sheet.foreground_mask(
            image, close_radius=2, **kwargs
        )
        self.assertEqual(len(cut_asset_sheet.component_boxes(open_mask, 20)), 2)
        self.assertEqual(len(cut_asset_sheet.component_boxes(closed_mask, 20)), 1)

    def test_cli_writes_verbatim_crops_and_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "sheet.png"
            output = root / "crops"
            image = Image.new("RGB", (40, 24), (30, 28, 29))
            ImageDraw.Draw(image).rectangle((10, 5, 25, 17), fill=(200, 80, 25))
            image.save(source)
            with redirect_stdout(io.StringIO()):
                result = cut_asset_sheet.main(
                    [
                        str(source),
                        str(output),
                        "--names",
                        "toy",
                        "--expected-count",
                        "1",
                        "--min-area",
                        "10",
                        "--padding",
                        "2",
                        "--close-radius",
                        "0",
                    ]
                )
            self.assertEqual(result, 0)
            manifest = json.loads((output / "boxes.json").read_text())
            self.assertEqual(manifest["assets"][0]["foregroundBbox"], [10, 5, 26, 18])
            self.assertEqual(manifest["assets"][0]["cropBbox"], [8, 3, 28, 20])
            crop = Image.open(output / "toy.png").convert("RGB")
            self.assertEqual(crop.size, (20, 17))
            self.assertEqual(crop.getpixel((2, 2)), image.getpixel((10, 5)))

    def test_count_mismatch_keeps_debug_mask_but_writes_no_crops(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "sheet.png"
            output = root / "crops"
            debug_mask = root / "mask.png"
            image = Image.new("RGB", (30, 20), (30, 28, 29))
            ImageDraw.Draw(image).rectangle((8, 5, 20, 15), fill=(200, 80, 25))
            image.save(source)
            with redirect_stderr(io.StringIO()):
                result = cut_asset_sheet.main(
                    [
                        str(source),
                        str(output),
                        "--expected-count",
                        "2",
                        "--min-area",
                        "10",
                        "--close-radius",
                        "0",
                        "--debug-mask",
                        str(debug_mask),
                    ]
                )
            self.assertEqual(result, 1)
            self.assertTrue(debug_mask.is_file())
            self.assertFalse(output.exists())

    def test_planned_writes_cannot_collide_with_source_or_each_other(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "sheet.png"
            source.write_bytes(b"original")
            with self.assertRaisesRegex(ValueError, "overwrite input sheet"):
                cut_asset_sheet.validate_write_paths(
                    source, [("debug mask", source)]
                )
            destination = root / "same.png"
            with self.assertRaisesRegex(ValueError, "planned outputs collide"):
                cut_asset_sheet.validate_write_paths(
                    source,
                    [("crop", destination), ("manifest", destination)],
                )
            self.assertEqual(source.read_bytes(), b"original")


if __name__ == "__main__":
    unittest.main()
