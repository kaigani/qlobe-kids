#!/usr/bin/env python3
"""Offline regression tests for the game-local authoring pipelines."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest import mock

from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent


def load_module(name: str, filename: str):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    assert spec.loader
    spec.loader.exec_module(module)
    return module


VOICE = load_module("throwing_target_generate_voice", "generate-voice.py")
HUB = load_module("throwing_target_generate_hub", "generate-hub.py")
ART = load_module("throwing_target_process_art", "process-art.py")


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_approved_review(root: Path, source: Path, scores=(9.3, 9.2)) -> Path:
    review = source.with_suffix(".review.json")
    review.write_text(json.dumps({
        "format": "qlobe-visual-review",
        "formatVersion": 1,
        "candidate": str(source.relative_to(root)),
        "candidateSha256": digest(source),
        "status": "accepted",
        "gate": "unanimous",
        "scores": list(scores),
        "minimumScore": min(scores),
        "reviewContext": "documented toy-table hub grammar",
        "reviewed": "2026-08-06",
    }))
    return review


class VoicePipelineTests(unittest.TestCase):
    def test_committed_qa_records_match_every_current_line(self):
        audio = HERE.parent / "assets/audio"
        lines = json.loads((audio / "lines.json").read_text())
        qa = json.loads((audio / "qa.json").read_text())
        self.assertEqual(set(qa), set(lines))
        for key, text in lines.items():
            self.assertEqual(qa[key]["intended"], text, key)
            self.assertEqual(qa[key]["textHash"], hashlib.sha256(text.encode()).hexdigest()[:16], key)
            self.assertTrue(qa[key]["checkedAt"], key)

    def test_subprocess_timeout_and_start_errors_are_results(self):
        timeout = VOICE.run([sys.executable, "-c", "import time; time.sleep(.2)"], .01)
        missing = VOICE.run(["qlobe-command-that-does-not-exist"], 1)
        self.assertEqual(timeout.returncode, 124)
        self.assertIn("timed out", timeout.stderr)
        self.assertEqual(missing.returncode, 127)
        self.assertIn("could not start", missing.stderr)

    def test_generation_lock_rejects_a_second_writer(self):
        with VOICE.generation_lock():
            with self.assertRaises(BlockingIOError):
                with VOICE.generation_lock():
                    pass

    def test_worker_exception_replaces_prior_manifest_with_empty_object(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / "audio"
            out.mkdir()
            lines = root / "lines.json"
            lines.write_text('{"welcome":"A safe test line."}\n')
            reference = root / "teacher.wav"
            reference.write_bytes(b"synthetic-reference")
            manifest = out / "manifest.json"
            manifest.write_text('{"welcome":{"file":"stale.m4a"}}\n')
            missing_state = root / "missing-state.json"
            patches = [
                mock.patch.object(VOICE, "OUT", out),
                mock.patch.object(VOICE, "LINES", lines),
                mock.patch.object(VOICE, "STATE", missing_state),
                mock.patch.object(VOICE, "PLATFORM_VOICE", reference),
                mock.patch.object(sys, "argv", ["generate-voice.py", "--qwen-url", "http://configured.invalid"]),
                mock.patch.object(VOICE, "synth_candidate", side_effect=RuntimeError("injected worker failure")),
            ]
            with patches[0], patches[1], patches[2], patches[3], patches[4], patches[5]:
                self.assertEqual(VOICE.main(), 1)
            self.assertEqual(json.loads(manifest.read_text()), {})


class HubPipelineTests(unittest.TestCase):
    def test_install_refuses_missing_or_mismatched_review_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            game = root / "game"
            source_dir = game / "assets/source/local-api"
            source_dir.mkdir(parents=True)
            final = root / "assets/hub/tiles/game.jpg"
            final.parent.mkdir(parents=True)
            source = source_dir / "hub-tile-krea2-seed42.png"
            recipe = source_dir / "hub-tile-krea2-seed42.recipe.json"
            Image.new("RGB", (768, 640), (90, 180, 120)).save(source, "PNG")
            payload = {
                "candidate": str(source.relative_to(root)),
                "candidateSha256": digest(source),
                "steps": [{"workflow": "krea2-turbo-t2i", "seed": 42, "width": 768, "height": 640}],
            }
            patches = [
                mock.patch.object(HUB, "ROOT", root),
                mock.patch.object(HUB, "GAME", game),
                mock.patch.object(HUB, "SOURCE_DIR", source_dir),
                mock.patch.object(HUB, "FINAL", final),
            ]
            with patches[0], patches[1], patches[2], patches[3]:
                with self.assertRaisesRegex(RuntimeError, "accepted visual review receipt"):
                    HUB.install_candidate(source, recipe, payload)
                review = write_approved_review(root, source)
                review_payload = json.loads(review.read_text())
                review_payload["candidateSha256"] = "0" * 64
                review.write_text(json.dumps(review_payload))
                with self.assertRaisesRegex(RuntimeError, "not a unanimous"):
                    HUB.install_candidate(source, recipe, payload)
                for invalid_score in (float("nan"), float("inf"), float("-inf")):
                    review_payload["candidateSha256"] = digest(source)
                    review_payload["scores"] = [9.3, invalid_score]
                    review_payload["minimumScore"] = min(review_payload["scores"])
                    review.write_text(json.dumps(review_payload))
                    with self.subTest(invalid_score=invalid_score):
                        with self.assertRaisesRegex(RuntimeError, "not a unanimous"):
                            HUB.install_candidate(source, recipe, payload)
            self.assertFalse(final.exists())
            self.assertFalse(recipe.exists())

    def test_same_seed_changed_candidate_is_rejected_before_install(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            game = root / "game"
            source_dir = game / "assets/source/local-api"
            source_dir.mkdir(parents=True)
            final = root / "assets/hub/tiles/game.jpg"
            final.parent.mkdir(parents=True)
            source = source_dir / "hub-tile-krea2-seed42.png"
            recipe = source_dir / "hub-tile-krea2-seed42.recipe.json"

            Image.new("RGB", (768, 640), (210, 70, 60)).save(source, "PNG")
            payload = {
                "candidate": str(source.relative_to(root)),
                "candidateSha256": digest(source),
                "installed": None,
                "installedSha256": None,
                "status": "candidate",
                "steps": [{"workflow": "krea2-turbo-t2i", "seed": 42, "width": 768, "height": 640}],
                "qa": {"status": "candidate"},
            }

            # Simulate a second forced generation for the same seed replacing
            # the candidate after the first invocation captured its digest.
            Image.new("RGB", (768, 640), (60, 90, 220)).save(source, "PNG")
            patches = [
                mock.patch.object(HUB, "ROOT", root),
                mock.patch.object(HUB, "GAME", game),
                mock.patch.object(HUB, "SOURCE_DIR", source_dir),
                mock.patch.object(HUB, "FINAL", final),
            ]
            with patches[0], patches[1], patches[2], patches[3]:
                with self.assertRaisesRegex(RuntimeError, "candidate changed before install"):
                    HUB.install_candidate(source, recipe, payload)

            self.assertFalse(final.exists())
            self.assertFalse(recipe.exists())

    def test_candidate_recipe_is_truthful_and_install_is_validated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            game = root / "game"
            source_dir = game / "assets/source/local-api"
            source_dir.mkdir(parents=True)
            final = root / "assets/hub/tiles/game.jpg"
            final.parent.mkdir(parents=True)
            source = source_dir / "hub-tile-krea2-seed42.png"
            Image.new("RGB", (768, 640), (90, 180, 120)).save(source, "PNG")
            patches = [
                mock.patch.object(HUB, "ROOT", root),
                mock.patch.object(HUB, "GAME", game),
                mock.patch.object(HUB, "SOURCE_DIR", source_dir),
                mock.patch.object(HUB, "FINAL", final),
                mock.patch.object(HUB, "STATE", root / "missing-state.json"),
            ]
            with patches[0], patches[1], patches[2], patches[3], patches[4]:
                with mock.patch.object(sys, "argv", ["generate-hub.py", "--qwen-url", "http://configured.invalid"]):
                    self.assertEqual(HUB.main(), 0)
                recipe = json.loads((source_dir / "hub-tile-krea2-seed42.recipe.json").read_text())
                self.assertEqual(recipe["status"], "candidate")
                self.assertIsNone(recipe["installed"])
                self.assertEqual(len(recipe["steps"]), 1)
                self.assertNotIn(str(final.relative_to(root)), json.dumps(recipe["steps"]))

                review = write_approved_review(root, source)
                with mock.patch.object(sys, "argv", ["generate-hub.py", "--qwen-url", "http://configured.invalid", "--install"]):
                    self.assertEqual(HUB.main(), 0)
                recipe = json.loads((source_dir / "hub-tile-krea2-seed42.recipe.json").read_text())
                self.assertEqual(recipe["status"], "installed")
                self.assertEqual(recipe["installed"], str(final.relative_to(root)))
                self.assertEqual(recipe["installedSha256"], digest(final))
                self.assertEqual(recipe["review"], str(review.relative_to(root)))
                self.assertEqual(recipe["reviewSha256"], digest(review))
                self.assertEqual(recipe["qa"]["scores"], [9.3, 9.2])
                HUB.validate_installed(final)

    def test_interrupted_final_replace_recovers_its_matching_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            game = root / "game"
            source_dir = game / "assets/source/local-api"
            source_dir.mkdir(parents=True)
            final = root / "assets/hub/tiles/game.jpg"
            final.parent.mkdir(parents=True)
            source = source_dir / "hub-tile-krea2-seed42.png"
            recipe = source_dir / "hub-tile-krea2-seed42.recipe.json"
            Image.new("RGB", (768, 640), (90, 180, 120)).save(source, "PNG")
            payload = {
                "candidate": str(source.relative_to(root)),
                "candidateSha256": digest(source),
                "installed": None,
                "installedSha256": None,
                "status": "candidate",
                "steps": [{"workflow": "krea2-turbo-t2i", "seed": 42, "width": 768, "height": 640}],
                "qa": {"status": "candidate"},
            }
            review = write_approved_review(root, source)
            patches = [
                mock.patch.object(HUB, "ROOT", root),
                mock.patch.object(HUB, "GAME", game),
                mock.patch.object(HUB, "SOURCE_DIR", source_dir),
                mock.patch.object(HUB, "FINAL", final),
            ]
            original_write_json = HUB.write_json
            interrupted = False

            def interrupt_receipt_write(path, value):
                nonlocal interrupted
                if path == recipe and value.get("status") == "installed" and not interrupted:
                    interrupted = True
                    raise OSError("injected interruption after final replace")
                original_write_json(path, value)

            with patches[0], patches[1], patches[2], patches[3]:
                with mock.patch.object(HUB, "write_json", side_effect=interrupt_receipt_write):
                    with self.assertRaisesRegex(OSError, "injected interruption"):
                        HUB.install_candidate(source, recipe, payload, review)
                transaction = HUB.install_transaction_path()
                self.assertTrue(final.exists())
                self.assertTrue(transaction.exists())
                installed_sha = digest(final)
                self.assertEqual(HUB.publish_candidate_receipt(recipe, payload), "installed")
                recovered = json.loads(recipe.read_text())
                self.assertEqual(recovered["status"], "installed")
                self.assertEqual(recovered["installedSha256"], installed_sha)
                self.assertFalse(transaction.exists())

    def test_concurrent_installs_leave_one_truthful_canonical_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            game = root / "game"
            source_dir = game / "assets/source/local-api"
            source_dir.mkdir(parents=True)
            final = root / "assets/hub/tiles/game.jpg"
            final.parent.mkdir(parents=True)
            candidates = []
            for seed, color in ((42, (210, 70, 60)), (1337, (60, 90, 220))):
                source = source_dir / f"hub-tile-krea2-seed{seed}.png"
                Image.new("RGB", (768, 640), color).save(source, "PNG")
                recipe = source_dir / f"hub-tile-krea2-seed{seed}.recipe.json"
                payload = {
                    "candidate": str(source.relative_to(root)),
                    "candidateSha256": digest(source),
                    "installed": None,
                    "installedSha256": None,
                    "status": "candidate",
                    "steps": [{"workflow": "krea2-turbo-t2i", "seed": seed, "width": 768, "height": 640}],
                    "qa": {"status": "candidate"},
                }
                write_approved_review(root, source)
                candidates.append((source, recipe, payload))
            patches = [
                mock.patch.object(HUB, "ROOT", root),
                mock.patch.object(HUB, "GAME", game),
                mock.patch.object(HUB, "SOURCE_DIR", source_dir),
                mock.patch.object(HUB, "FINAL", final),
            ]
            with patches[0], patches[1], patches[2], patches[3]:
                with ThreadPoolExecutor(max_workers=2) as executor:
                    results = [executor.submit(HUB.install_candidate, *candidate) for candidate in candidates]
                    for result in results:
                        result.result()
            receipts = [json.loads(recipe.read_text()) for _, recipe, _ in candidates]
            installed = [receipt for receipt in receipts if receipt["status"] == "installed"]
            superseded = [receipt for receipt in receipts if receipt["status"] == "superseded"]
            self.assertEqual(len(installed), 1)
            self.assertEqual(len(superseded), 1)
            self.assertEqual(installed[0]["installedSha256"], digest(final))
            self.assertIsNone(superseded[0]["installed"])


class ArtPipelineTests(unittest.TestCase):
    def test_wide_panel_is_deterministic_and_preserves_its_source(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            first = root / "first.webp"
            second = root / "second.webp"
            image = Image.new("RGBA", (360, 120), (0, 0, 0, 0))
            draw = ImageDraw.Draw(image)
            draw.rounded_rectangle((4, 4, 356, 116), radius=38, fill=(35, 120, 70, 255))
            image.save(source, "PNG")
            before = digest(source)
            ART.widen_panel(source, first)
            ART.widen_panel(source, second)
            self.assertEqual(digest(first), digest(second))
            self.assertEqual(digest(source), before)


if __name__ == "__main__":
    unittest.main()
