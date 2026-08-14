#!/usr/bin/env python3
"""Generate and transcript-QA Sound Cylinder Match narration.

The game consumes committed clips at runtime. This authoring-only script uses
the configured LAN Qwen3-TTS VoiceClone and Whisper endpoints, then publishes
the manifest only when every line passes transcript QA.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import hashlib
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
LINES = OUT / "lines.json"
COMMITTED_REFERENCE = ROOT / "shared/assets/refs/voice-teacher.wav"
SEEDS = (7, 8, 9)


def run(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)


def normalise(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def score(expected: str, heard: str) -> tuple[bool, float]:
    ratio = difflib.SequenceMatcher(None, normalise(expected), normalise(heard)).ratio()
    return ratio >= 0.92 or normalise(expected) == normalise(heard), round(ratio, 3)


def redact(value: str) -> str:
    return re.sub(r"(?:https?://)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?", "[configured LAN endpoint]", value)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def duration(path: Path) -> float:
    result = run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        30,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0.0


def write_json(path: Path, payload: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def synthesize(api: str, reference: str, key: str, text: str) -> dict:
    destination = OUT / f"{key}.m4a"
    last_error = "no attempt"
    for seed in SEEDS:
        with tempfile.TemporaryDirectory(prefix="sound-cylinder-voice-") as temp_dir:
            temp = Path(temp_dir)
            raw = temp / "voice.flac"
            encoded = temp / "voice.m4a"
            response = run(
                [
                    "curl", "-sS", "-X", "POST",
                    f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
                    "-F", f"voice=@{reference}", "-F", f"text={text}", "-F", f"seed={seed}",
                    "--output", str(raw), "--max-time", "900",
                ],
                930,
            )
            if response.returncode or not raw.is_file() or raw.stat().st_size < 2000:
                size = raw.stat().st_size if raw.is_file() else 0
                detail = redact(response.stderr.strip())[:240] or "no stderr"
                last_error = f"seed {seed}: synthesis failed (curl rc={response.returncode}, bytes={size}, {detail})"
                continue

            encode = run(
                [
                    "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                    "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-c:a", "aac", "-b:a", "96k",
                    "-movflags", "+faststart", str(encoded),
                ],
                60,
            )
            if encode.returncode or not encoded.is_file() or encoded.stat().st_size < 2000:
                last_error = f"seed {seed}: AAC encode failed"
                continue

            transcript = run(
                [
                    "curl", "-sS", "-X", "POST",
                    f"{api}/workflows/whisper-stt?sync=true",
                    "-F", f"audio=@{encoded}", "-F", "model_size=base", "-F", "language=en",
                    "-F", f"initial_prompt={text}", "--max-time", "900",
                ],
                930,
            )
            try:
                heard = str(json.loads(transcript.stdout).get("text", "")).strip()
            except json.JSONDecodeError:
                heard = ""
            valid, ratio = score(text, heard)
            if valid and duration(encoded) >= 0.25:
                destination.write_bytes(encoded.read_bytes())
                return {
                    "valid": True,
                    "seed": seed,
                    "intended": text,
                    "heard": heard,
                    "ratio": ratio,
                    "duration": duration(destination),
                    "bytes": destination.stat().st_size,
                    "sha256": sha256(destination),
                }
            last_error = f"seed {seed}: transcript {heard!r} (ratio {ratio})"
    return {"valid": False, "intended": text, "heard": "", "error": last_error}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--voice-ref")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=2)
    args = parser.parse_args()

    lines = json.loads(LINES.read_text())
    api = (args.qwen_url or os.getenv("QLOBE_QWEN_URL") or "").rstrip("/")
    reference = args.voice_ref or os.getenv("QLOBE_VOICE_REF") or str(COMMITTED_REFERENCE)
    if not api or not reference or not Path(reference).is_file():
        parser.error("a reachable Qwen URL and readable voice reference are required")

    OUT.mkdir(parents=True, exist_ok=True)
    try:
        previous_qa = json.loads((OUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        previous_qa = {}

    def one(item: tuple[str, str]) -> tuple[str, dict]:
        key, text = item
        path = OUT / f"{key}.m4a"
        prior = previous_qa.get(key, {}) if isinstance(previous_qa, dict) else {}
        if (
            not args.force and path.is_file() and path.stat().st_size > 2000
            and prior.get("valid") is True and prior.get("intended") == text
            and prior.get("ratio", 0) >= 0.92 and prior.get("sha256") == sha256(path)
            and duration(path) >= 0.25
        ):
            return key, {**prior, "duration": duration(path), "bytes": path.stat().st_size, "sha256": sha256(path)}
        return key, synthesize(api, reference, key, text)

    qa: dict[str, dict] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(3, args.workers))) as executor:
        for key, result in executor.map(one, lines.items()):
            qa[key] = result
            print(f"{key}: {'ok' if result.get('valid') else 'FAILED'}", flush=True)

    manifest = {
        key: {
            "file": f"{key}.m4a",
            "dur": result["duration"],
            "sha256": result["sha256"],
            "textHash": hashlib.sha256(lines[key].encode()).hexdigest()[:16],
        }
        for key, result in qa.items()
        if result.get("valid")
    }
    missing = [key for key in lines if key not in manifest]
    write_json(OUT / "qa.json", qa)
    # Never publish a partial voice set: a mixed voice manifest is harder to
    # spot in playtesting than the existing system-voice fallback.
    write_json(OUT / "manifest.json", manifest if not missing else {})
    print(f"complete: {len(manifest)}/{len(lines)}; failures={missing}")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
