#!/usr/bin/env python3
"""Weather Scientist narration: clone every scene's lines from the platform
teacher-voice reference on the LAN GenAI API, Whisper-QA each clip, and write
the manifest/lines/QA files ``shared/js/voice-clips.js`` reads at runtime.

``config.json`` is the source of truth for spoken text (one ``voice`` block
per scene). This script derives ``assets/audio/lines.json`` from it — do not
hand-edit lines.json.

The endpoint and personal reference path come from flags, environment
variables, or the git-ignored ``tools/state/local.json`` (see
``.claude/skills/local-genai``). They are never written to provenance.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
CONFIG = GAME / "config.json"
LOCAL_STATE = ROOT / "tools/state/local.json"
SEEDS = [7, 42, 1337, 9001]


def local_state() -> dict:
    try:
        value = json.loads(LOCAL_STATE.read_text())
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def load_lines() -> dict[str, str]:
    config = json.loads(CONFIG.read_text())
    lines: dict[str, str] = {}
    for scene_id in config.get("sceneOrder", []):
        scene = config["scenes"].get(scene_id)
        if not scene:
            continue
        for key, text in scene["voice"].items():
            lines[f"{scene_id}-{key}"] = text
    return lines


def run(command: list[str], *, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)


def clone(api_base: str, voice_ref: str, text: str, seed: int, dest_flac: Path) -> None:
    result = run(
        [
            "curl", "-s", "-X", "POST", f"{api_base}/workflows/qwen3-tts-voiceclone?sync=true",
            "-F", f"voice=@{voice_ref}", "-F", f"text={text}", "-F", f"seed={seed}",
            "--output", str(dest_flac), "--max-time", "180",
        ],
        timeout=200,
    )
    if result.returncode != 0 or not dest_flac.is_file() or dest_flac.stat().st_size < 2_000:
        raise RuntimeError(f"voiceclone call failed: {result.stderr.strip() or 'empty output'}")


def encode(src_flac: Path, dest_m4a: Path) -> None:
    result = run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(src_flac),
            "-af", "loudnorm=I=-18:TP=-2:LRA=9",
            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
            str(dest_m4a),
        ],
        timeout=60,
    )
    if result.returncode != 0 or not dest_m4a.is_file() or dest_m4a.stat().st_size < 2_000:
        raise RuntimeError(f"ffmpeg encode failed: {result.stderr.strip()}")


def duration(path: Path) -> float:
    result = run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        timeout=30,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except (TypeError, ValueError):
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
         "-af", "volumedetect", "-f", "null", "-"],
        timeout=60,
    )
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def normalize(text: str) -> str:
    # Space/punctuation-insensitive: Whisper renders contractions and
    # compounds inconsistently ("paperclip" vs "paper clip") even on a
    # perfectly good take.
    return re.sub(r"[^a-z0-9]", "", text.lower())


def transcribe(api_base: str, path: Path, expected: str) -> str:
    # Bias with the expected line itself — an uncommon word ("meadow") can
    # come back garbled from a bare model without this, even when the
    # underlying audio is fine (verified against model_size=small on the
    # same clip before adding this).
    result = run(
        [
            "curl", "-s", "-X", "POST", f"{api_base}/workflows/whisper-stt?sync=true",
            "-F", f"audio=@{path}", "-F", "model_size=base", "-F", "language=en",
            "-F", f"initial_prompt={expected}",
            "--max-time", "60",
        ],
        timeout=70,
    )
    try:
        return json.loads(result.stdout).get("text", "")
    except json.JSONDecodeError:
        return ""


def synthesize(api_base: str, voice_ref: str, key: str, text: str) -> dict:
    dest = OUT / f"{key}.m4a"
    last_error = "no attempt made"
    for seed in SEEDS:
        with tempfile.TemporaryDirectory(prefix="weather-voice-") as folder:
            flac = Path(folder) / f"{key}.flac"
            m4a = Path(folder) / f"{key}.m4a"
            try:
                clone(api_base, voice_ref, text, seed, flac)
                encode(flac, m4a)
            except RuntimeError as error:
                last_error = f"seed {seed}: {error}"
                continue
            seconds = duration(m4a)
            mean_db = mean_volume(m4a)
            transcript = transcribe(api_base, m4a, text)
            match = normalize(transcript) == normalize(text)
            audio_ok = (
                m4a.stat().st_size >= 2_000
                and 0.35 <= seconds <= 20
                and mean_db is not None and -36 <= mean_db <= -5
            )
            if audio_ok and match:
                dest.write_bytes(m4a.read_bytes())
                return {
                    "engine": "qwen3-tts-voiceclone",
                    "voice": "voice_teacher",
                    "seed": seed,
                    "sourceText": text,
                    "textHash": text_hash(text),
                    "duration": duration(dest),
                    "meanVolumeDb": mean_db,
                    "bytes": dest.stat().st_size,
                    "transcript": transcript,
                    "valid": True,
                }
            last_error = (
                f"seed {seed}: whisper mismatch — got {transcript!r}"
                if not match
                else f"seed {seed}: audio QA failed (dur={seconds}s, db={mean_db})"
            )
    return {
        "valid": False,
        "error": last_error,
        "sourceText": text,
        "textHash": text_hash(text),
    }


def inspect_existing(key: str, text: str, qa: dict) -> dict | None:
    entry = qa.get(key)
    path = OUT / f"{key}.m4a"
    if not entry or not path.is_file():
        return None
    if entry.get("engine") != "qwen3-tts-voiceclone":
        return None  # migrate any pre-existing macOS-say placeholder clip
    if entry.get("textHash") != text_hash(text):
        return None
    if not entry.get("valid"):
        return None
    return entry


def main() -> int:
    lines = load_lines()
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", action="append", help="restrict to a scene id or a <scene>-<key> line")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--qwen-url", help="LAN GenAI API base URL (else QLOBE_QWEN_URL, else tools/state/local.json)")
    parser.add_argument("--voice-ref", help="path to the teacher-voice reference clip (else QLOBE_VOICE_REF, else tools/state/local.json)")
    args = parser.parse_args()

    state = local_state()
    api_base = (args.qwen_url or os.environ.get("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    voice_ref = args.voice_ref or os.environ.get("QLOBE_VOICE_REF") or state.get("teacherVoicePath") or ""
    if not args.check and (not api_base or not voice_ref):
        sys.exit(
            "LAN endpoint or teacher-voice reference missing: use --qwen-url/--voice-ref, "
            "QLOBE_QWEN_URL/QLOBE_VOICE_REF, or tools/state/local.json (see .claude/skills/local-genai); "
            "--check needs neither."
        )

    OUT.mkdir(parents=True, exist_ok=True)
    previous_qa = {}
    qa_path = OUT / "qa.json"
    if qa_path.exists():
        previous_qa = json.loads(qa_path.read_text())

    def selected(key: str) -> bool:
        if not args.only:
            return True
        scene_id = key.split("-", 1)[0]
        return any(sel == key or sel == scene_id for sel in args.only)

    qa = {}
    for key, text in lines.items():
        if not selected(key):
            qa[key] = previous_qa.get(key) or {"valid": False, "error": "not selected"}
            continue
        existing = None if args.force else inspect_existing(key, text, previous_qa)
        if existing:
            qa[key] = existing
            print(f"{key}: cached", flush=True)
            continue
        if args.check:
            qa[key] = previous_qa.get(key) or {"valid": False, "error": "missing clip"}
            print(f"{key}: {'ok' if qa[key].get('valid') else 'FAILED'}", flush=True)
            continue
        qa[key] = synthesize(api_base, voice_ref, key, text)
        print(f"{key}: {'ok' if qa[key].get('valid') else 'FAILED — ' + qa[key].get('error', '')}", flush=True)

    manifest = {
        key: {"file": f"{key}.m4a", "dur": qa[key]["duration"], "textHash": text_hash(text)}
        for key, text in lines.items()
        if qa.get(key, {}).get("valid")
    }
    failures = [key for key in lines if key not in manifest]

    if not args.check:
        (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (OUT / "lines.json").write_text(json.dumps(lines, indent=2, ensure_ascii=False) + "\n")
        (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")

    print(f"complete: {len(manifest)}/{len(lines)}; failures={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
