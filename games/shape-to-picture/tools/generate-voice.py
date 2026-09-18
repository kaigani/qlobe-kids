#!/usr/bin/env python3
"""Build Shape Surprise Studio's recorded guide, with reproducible QA receipts.

The exact ``LINES`` table below is deliberately the source of truth.  The LAN
endpoint and teacher reference are read only from a flag, environment variable,
or ignored ``tools/state/local.json``.  Neither machine-specific value is ever
written to the repository.  The command is safe to re-run: accepted clips whose
bytes/text/reference match their receipt are reused.

Usage (from repository root):
  python games/shape-to-picture/tools/generate-voice.py
  python games/shape-to-picture/tools/generate-voice.py --check
"""
from __future__ import annotations

import argparse
import datetime as dt
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from collections import OrderedDict
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
AUDIO = GAME / "assets" / "audio"
SOURCE = GAME / "assets" / "source" / "local-api" / "voice"
STATE = ROOT / "tools" / "state" / "local.json"
PLATFORM_VOICE = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9)

# Keep this table exact: it is copied verbatim to assets/audio/lines.json.
LINES = OrderedDict([
    ("intro", "Welcome to Shape Surprise Studio! Pick a paper game."),
    ("tap-intro", "Tap the shape. Watch it turn into a surprise!"),
    ("tap-circle", "Tap the circle."),
    ("tap-triangle", "Tap the triangle."),
    ("tap-square", "Tap the square."),
    ("stretch-intro", "Make the shape grow. Use two fingers, or slide the magic tab up!"),
    ("stretch-circle", "Make the circle grow."),
    ("stretch-oval", "Make the oval grow."),
    ("stretch-rectangle", "Make the rectangle grow."),
    ("build-intro", "Fit the paper shapes into their ghost spots."),
    ("shape-circle", "Circle."),
    ("shape-triangle", "Triangle."),
    ("shape-square", "Square."),
    ("shape-rectangle", "Rectangle."),
    ("gentle-retry", "Almost! That shape has another cozy spot."),
    ("nudge-tap", "Give the shape a little tap."),
    ("nudge-stretch", "Spread two fingers, or slide the magic tab up."),
    ("nudge-build", "Choose a paper shape, then find its matching ghost."),
    ("reveal-kitten", "A circle became a fluffy kitten!"),
    ("reveal-house", "A square became a cozy little house!"),
    ("reveal-rocket", "A rectangle became a rocket!"),
    ("reveal-sun", "The circle grew into a sunny smile!"),
    ("reveal-balloon", "The oval grew into a bright balloon!"),
    ("reveal-tree", "The rectangle grew into a leafy tree!"),
    ("reveal-boat", "Your shapes became a sailboat!"),
    ("reveal-icecream", "Your shapes became a colorful ice cream!"),
    ("reveal-home", "Your shapes became a happy little home!"),
    ("reveal-robot", "Your shapes became a silly robot friend!"),
    ("cheer", "Paper magic! You made every surprise."),
    ("again", "Make another surprise!"),
])


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def run(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        return subprocess.CompletedProcess(command, 124, error.stdout or "", error.stderr or "timed out")
    except OSError as error:
        return subprocess.CompletedProcess(command, 127, "", str(error))


def redact(value: str) -> str:
    """Keep configured LAN values and local paths out of terminal/receipt output."""
    value = re.sub(r"https?://[^\s/]+(?::\d+)?", "[configured LAN endpoint]", value)
    return re.sub(r"[A-Za-z]:\\[^\r\n]+", "[configured local path]", value)


def normalized(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def transcript_score(expected: str, heard: str) -> tuple[bool, float]:
    """Reject lexical substitutions; punctuation/case never matter."""
    wanted, actual = normalized(expected), normalized(heard)
    ratio = round(difflib.SequenceMatcher(None, wanted, actual).ratio(), 3)
    wanted_words, actual_words = set(wanted.split()), set(actual.split())
    # Exact normalization is normal.  A tiny Whisper spacing/contraction drift
    # is acceptable only when no meaningful expected word disappeared.
    accepted = bool(actual) and (wanted == actual or (ratio >= 0.975 and wanted_words <= actual_words))
    return accepted, ratio


def duration(path: Path) -> float:
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], 30)
    try:
        return round(float(result.stdout.strip()), 3)
    except (TypeError, ValueError):
        return 0.0


def reference_and_api(args: argparse.Namespace) -> tuple[str, Path]:
    state = json.loads(STATE.read_text(encoding="utf-8")) if STATE.is_file() else {}
    api = (args.qwen_url or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    configured = args.voice_ref or os.getenv("QLOBE_TEACHER_VOICE") or state.get("teacherVoicePath") or ""
    # A stale workstation-only reference must not block an approved committed
    # platform teacher reference. Explicit --voice-ref remains strict.
    reference = Path(configured) if configured and Path(configured).is_file() else PLATFORM_VOICE
    if not api:
        raise RuntimeError("Qwen endpoint missing (configure ignored tools/state/local.json or --qwen-url)")
    if not reference.is_file():
        raise RuntimeError("approved teacher reference missing (configure ignored tools/state/local.json or --voice-ref)")
    return api, reference


def decode_ok(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 2_000 and 0.2 < duration(path) < 20


def receipt_paths(key: str) -> tuple[Path, Path]:
    folder = SOURCE / key
    return folder / "recipe.json", folder / "qa-transcript.json"


def reusable(key: str, text: str, reference_hash: str) -> dict | None:
    clip = AUDIO / f"{key}.m4a"
    recipe_path, qa_path = receipt_paths(key)
    try:
        recipe, qa = json.loads(recipe_path.read_text()), json.loads(qa_path.read_text())
    except (OSError, json.JSONDecodeError):
        return None
    if not (decode_ok(clip) and recipe.get("referenceSha256") == reference_hash
            and recipe.get("intended") == text and recipe.get("sha256") == sha(clip)
            and qa.get("accepted") is True and qa.get("intended") == text
            and recipe.get("seed") in SEEDS):
        return None
    accepted, _ = transcript_score(text, str(qa.get("heard", "")))
    return recipe if accepted else None


def generate_one(api: str, reference: Path, reference_hash: str, key: str, text: str) -> tuple[dict, dict]:
    last_qa: dict = {"accepted": False, "intended": text, "heard": "", "ratio": 0.0}
    with tempfile.TemporaryDirectory(prefix="shape-to-picture-voice-") as folder:
        stage = Path(folder)
        for seed in SEEDS:
            raw, encoded = stage / f"{key}-{seed}.flac", stage / f"{key}-{seed}.m4a"
            synth = run([
                "curl", "-sS", "-X", "POST", f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
                "-F", f"voice=@{reference}", "-F", f"text={text}", "-F", f"seed={seed}",
                "--output", str(raw), "--max-time", "900",
            ], 930)
            if synth.returncode or not raw.is_file() or raw.stat().st_size < 2_000:
                last_qa = {"accepted": False, "intended": text, "heard": "", "ratio": 0.0,
                           "seed": seed, "error": "synthesis failed"}
                continue
            encode = run([
                "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-ac", "1", "-ar", "48000",
                "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(encoded),
            ], 90)
            if encode.returncode or not decode_ok(encoded):
                last_qa = {"accepted": False, "intended": text, "heard": "", "ratio": 0.0,
                           "seed": seed, "error": "AAC encode/decode failed"}
                continue
            whisper = run([
                "curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
                "-F", f"audio=@{encoded}", "-F", "model_size=base", "-F", "language=en",
                "-F", f"initial_prompt={text}", "--max-time", "900",
            ], 930)
            try:
                heard = str(json.loads(whisper.stdout).get("text", "")).strip()
            except json.JSONDecodeError:
                heard = ""
            accepted, ratio = transcript_score(text, heard)
            qa = {
                "format": "qlobe-voice-transcript-qa", "formatVersion": 1,
                "workflow": "whisper-stt", "language": "en", "modelSize": "base",
                "intended": text, "heard": heard, "ratio": ratio, "accepted": accepted,
                "seed": seed, "checkedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
            if whisper.returncode or not accepted:
                qa["error"] = "transcript rejected" if not whisper.returncode else "Whisper request failed"
                last_qa = qa
                continue
            destination = AUDIO / f"{key}.m4a"
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix(".m4a.tmp")
            temporary.write_bytes(encoded.read_bytes())
            temporary.replace(destination)
            recipe = {
                "format": "qlobe-voice-recipe", "formatVersion": 1, "id": f"shape-to-picture-{key}",
                "asset": f"{key}.m4a", "workflow": "qwen3-tts-voiceclone", "voice": "approved-teacher",
                "seed": seed, "intended": text, "textHash": text_hash(text),
                "referenceSha256": reference_hash, "duration": duration(destination),
                "bytes": destination.stat().st_size, "sha256": sha(destination),
                "created": dt.datetime.now(dt.timezone.utc).isoformat(),
            }
            return recipe, qa
    return {"valid": False, "id": f"shape-to-picture-{key}", "intended": text}, last_qa


def check() -> int:
    bad: list[str] = []
    try:
        manifest = json.loads((AUDIO / "manifest.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        manifest = {}
    for key, text in LINES.items():
        clip = AUDIO / f"{key}.m4a"
        recipe_path, qa_path = receipt_paths(key)
        try:
            recipe, qa = json.loads(recipe_path.read_text()), json.loads(qa_path.read_text())
        except (OSError, json.JSONDecodeError):
            bad.append(key); continue
        accepted, _ = transcript_score(text, str(qa.get("heard", "")))
        valid = (decode_ok(clip) and recipe.get("intended") == text and recipe.get("sha256") == sha(clip)
                 and qa.get("accepted") is True and accepted and manifest.get(key, {}).get("dur") == duration(clip))
        if not valid:
            bad.append(key)
    print(f"voice check: {len(LINES) - len(bad)}/{len(LINES)}; failures={bad}")
    return 1 if bad else 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qwen-url")
    parser.add_argument("--voice-ref")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    write_json(AUDIO / "lines.json", LINES)
    if args.check:
        return check()
    try:
        api, reference = reference_and_api(args)
    except Exception as error:
        print(redact(str(error)), file=sys.stderr)
        return 2
    reference_hash = sha(reference)
    manifest: dict[str, dict] = {}
    bad: list[str] = []
    for key, text in LINES.items():
        prior = None if args.force else reusable(key, text, reference_hash)
        if prior:
            recipe_path, qa_path = receipt_paths(key)
            qa = json.loads(qa_path.read_text(encoding="utf-8"))
            recipe = prior
            print(f"{key}: reused", flush=True)
        else:
            recipe, qa = generate_one(api, reference, reference_hash, key, text)
            recipe_path, qa_path = receipt_paths(key)
            write_json(recipe_path, recipe)
            write_json(qa_path, qa)
            print(f"{key}: {'accepted' if qa.get('accepted') else 'FAILED'}", flush=True)
        clip = AUDIO / f"{key}.m4a"
        if qa.get("accepted") and decode_ok(clip) and recipe.get("sha256") == sha(clip):
            manifest[key] = {"file": clip.name, "dur": duration(clip), "sha256": sha(clip), "textHash": text_hash(text)}
        else:
            bad.append(key)
    # Never expose a partial voice pack to runtime.
    write_json(AUDIO / "manifest.json", manifest if not bad else {})
    print(f"complete: {len(manifest)}/{len(LINES)}; failures={bad}")
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
