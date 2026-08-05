#!/usr/bin/env python3
"""Deterministic unit coverage for extract-assets helpers."""

import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

from PIL import Image


MODULE_PATH = Path(__file__).with_name("extract-assets.py")
SPEC = importlib.util.spec_from_file_location("extract_assets", MODULE_PATH)
extract_assets = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(extract_assets)


class ExtractAssetsTests(unittest.TestCase):
    def test_cell_boxes_cover_every_pixel_for_non_divisible_dimensions(self):
        size = (7, 5)
        boxes = extract_assets.cell_boxes(size, 3, 2)
        self.assertEqual(len(boxes), 6)
        covered = set()
        for left, top, right, bottom in boxes:
            covered.update((x, y) for y in range(top, bottom) for x in range(left, right))
        self.assertEqual(covered, {(x, y) for y in range(size[1]) for x in range(size[0])})
        image = Image.new("RGB", size)
        cells = extract_assets.split_cells(image, {"layout": {"columns": 3, "rows": 2}})
        self.assertEqual(sum(cell.width * cell.height for cell in cells), size[0] * size[1])

    def test_mean_visible_saturation_distinguishes_gray_and_color(self):
        gray = Image.new("RGBA", (4, 4), (128, 128, 128, 255))
        color = Image.new("RGBA", (4, 4), (255, 0, 0, 255))
        self.assertEqual(extract_assets.mean_visible_saturation(gray), 0.0)
        self.assertGreater(extract_assets.mean_visible_saturation(color), 95.0)

    def test_qwen_layer_difference_mattes_foreground_and_transparent_corners(self):
        background = Image.new("RGBA", (20, 20), (30, 30, 30, 255))
        composite = background.copy()
        for y in range(7, 14):
            for x in range(6, 15):
                composite.putpixel((x, y), (220, 40, 20, 255))
        def png(image):
            stream = io.BytesIO()
            image.save(stream, format="PNG")
            return stream.getvalue()
        result = Image.open(io.BytesIO(extract_assets.qwen_layer_difference(png(composite), png(background)))).convert("RGBA")
        self.assertEqual(result.getpixel((0, 0))[3], 0)
        self.assertGreater(result.getpixel((10, 10))[3], 200)

    def test_outputs_valid_rejects_corrupt_and_wrong_sized_runtime_with_matching_metrics(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            qa_root = root / "qa"
            qa_root.mkdir()
            old_qa_root = extract_assets.QA_ROOT
            extract_assets.QA_ROOT = qa_root
            try:
                source = root / "source.png"
                source.write_bytes(b"source")
                job = {"id": "piece", "runtimeSize": [4, 4]}
                (qa_root / "piece-metrics.json").write_text(json.dumps({
                    "sourceSha256": extract_assets.sha256_bytes(source.read_bytes()),
                    "jobSha256": extract_assets.job_fingerprint(job),
                }))
                wrong = root / "wrong.webp"
                Image.new("RGB", (3, 4), "red").save(wrong, format="WEBP")
                self.assertFalse(extract_assets.outputs_valid(job, source, [wrong]))
                corrupt = root / "corrupt.webp"
                corrupt.write_bytes(b"not an image")
                self.assertFalse(extract_assets.outputs_valid(job, source, [corrupt]))
            finally:
                extract_assets.QA_ROOT = old_qa_root


if __name__ == "__main__":
    unittest.main()
