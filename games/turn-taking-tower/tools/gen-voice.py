#!/usr/bin/env python3
"""Generate teacher-voice lines through the approved LAN API and Whisper-QA them.

The private endpoint and optional personal reference path are read from flags,
environment, or git-ignored tools/state/local.json and are never recorded.
Candidates are batched by model for each seed; only transcript-approved AAC
clips enter the runtime manifest, so rejected lines retain exact device speech.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUTPUT = GAME / "assets" / "audio"
RAW = GAME / "assets" / "source" / "local-api" / "voice"
LINES_PATH = OUTPUT / "lines.json"
LOCAL_STATE = ROOT / "tools" / "state" / "local.json"


def normal(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=False,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0.0


def local_state() -> dict:
    try:
        value = json.loads(LOCAL_STATE.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def upload(endpoint: str, fields: list[str], destination: Path, timeout: int = 930) -> bool:
    destination.parent.mkdir(parents=True, exist_ok=True)
    command = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(destination), "--max-time", str(timeout - 30)])
    result = subprocess.run(command, capture_output=True, timeout=timeout, check=False)
    return result.returncode == 0 and destination.is_file() and destination.stat().st_size > 800


def encode(source: Path, destination: Path) -> bool:
    result = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-vn",
         "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
         "areverse,silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,"
         "areverse,loudnorm=I=-18:TP=-2:LRA=9", "-c:a", "aac", "-b:a", "96k",
         "-ar", "24000", "-ac", "1", "-movflags", "+faststart", str(destination)],
        capture_output=True, timeout=180, check=False,
    )
    return result.returncode == 0 and destination.is_file() and .25 <= duration(destination) <= 10


def heard_text(path: Path) -> str:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return str(payload.get("text") or payload.get("transcript") or "").strip()
    except (FileNotFoundError, json.JSONDecodeError):
        return ""


def compare(wanted: str, heard: str) -> tuple[bool, float, float]:
    want, got = normal(wanted), normal(heard)
    ratio = difflib.SequenceMatcher(None, want, got).ratio()
    words = want.split()
    got_words = set(got.split())
    coverage = sum(word in got_words for word in words) / max(1, len(words))
    critical = {"pip", "turn", "block", "builder", "tower", "roof", "glowing"}
    required = set(words) & critical
    exact = got == want
    accepted = (exact or (len(words) > 3 and ratio >= .90 and coverage >= .90)) and required <= got_words
    return accepted, round(ratio, 3), round(coverage, 3)


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--voice-ref")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--seeds", type=int, nargs="+", default=[7, 8, 9])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    state = local_state()
    base = (args.qwen_url or os.environ.get("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    voice_value = args.voice_ref or os.environ.get("QLOBE_VOICE_REF") or state.get("teacherVoicePath") or str(ROOT / "shared/assets/refs/voice-teacher.wav")
    reference = Path(voice_value).expanduser()
    if not base:
        parser.error("Qwen endpoint missing")
    if not reference.is_file():
        parser.error("approved teacher voice reference missing")
    for binary in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            parser.error(f"required binary missing: {binary}")

    lines = json.loads(LINES_PATH.read_text(encoding="utf-8"))
    config_lines = json.loads((GAME / "config.json").read_text(encoding="utf-8"))["voice"]
    if lines != config_lines:
        parser.error("audio lines must exactly match config voice")
    keys = args.only or list(lines)
    if unknown := [key for key in keys if key not in lines]:
        parser.error(f"unknown voice keys: {', '.join(unknown)}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    qa_path = OUTPUT / "qa.json"
    manifest_path = OUTPUT / "manifest.json"
    try:
        qa = json.loads(qa_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        qa = {}
    accepted: dict[str, dict] = {}
    if not args.force:
        for key in keys:
            final = OUTPUT / f"{key}.m4a"
            record = qa.get(key, {})
            if final.is_file() and record.get("accepted") and record.get("textHash") == text_hash(lines[key]):
                accepted[key] = {"file": final.name, "dur": duration(final), "seed": record.get("acceptedSeed"), "textHash": text_hash(lines[key])}

    attempts = {key: list(qa.get(key, {}).get("attempts", [])) for key in keys}
    for seed in args.seeds:
        pending = [key for key in keys if key not in accepted]
        if not pending:
            break
        print(f"seed {seed}: generating {len(pending)} TTS candidates", flush=True)
        for key in pending:
            raw = RAW / f"{key}-seed{seed}.flac"
            encoded = RAW / f"{key}-seed{seed}.m4a"
            if args.force or not encoded.is_file() or duration(encoded) < .25:
                if args.force or not raw.is_file() or raw.stat().st_size < 1200:
                    upload(f"{base}/workflows/qwen3-tts-voiceclone?sync=true",
                           [f"voice=@{reference}", f"text={lines[key]}", f"seed={seed}"], raw)
                if raw.is_file():
                    encode(raw, encoded)

        print(f"seed {seed}: Whisper QA", flush=True)
        for key in pending:
            encoded = RAW / f"{key}-seed{seed}.m4a"
            transcript_file = RAW / f"{key}-seed{seed}-transcript.json"
            if not encoded.is_file() or duration(encoded) < .25:
                attempts[key].append({"seed": seed, "accepted": False, "reason": "candidate missing"})
                continue
            upload(f"{base}/workflows/whisper-stt?sync=true",
                   [f"audio=@{encoded}", "model_size=base", "language=en",
                    "initial_prompt=Turn-Taking Tower. Pip. Builder. Glowing block. Roof."], transcript_file)
            heard = heard_text(transcript_file)
            ok, score, coverage = compare(lines[key], heard)
            result = {"seed": seed, "accepted": ok, "wanted": lines[key], "transcript": heard,
                      "score": score, "coverage": coverage, "duration": duration(encoded)}
            attempts[key] = [item for item in attempts[key] if item.get("seed") != seed] + [result]
            print(f"{key}: {'accepted' if ok else 'retry'} {score:.3f} -> {heard}", flush=True)
            if not ok:
                continue
            final = OUTPUT / f"{key}.m4a"
            shutil.copy2(encoded, final)
            accepted[key] = {"file": final.name, "dur": duration(final), "seed": seed, "textHash": text_hash(lines[key])}
            (OUTPUT / f"{key}.m4a.recipe.json").write_text(json.dumps({
                "recipeVersion": "qlobe-recipe-v1", "workflow": "qwen3-tts-voiceclone",
                "file": final.name, "text": lines[key], "textHash": text_hash(lines[key]), "seed": seed,
                "encoding": {"codec": "aac", "container": "m4a", "sampleRate": 24000, "channels": 1, "bitrate": 96000},
                "whisper": {"language": "en", "transcript": heard, "score": score, "coverage": coverage},
                "teacherReference": "shared/assets/refs/voice-teacher.wav"
            }, indent=2) + "\n", encoding="utf-8")

    for key in keys:
        seed = accepted.get(key, {}).get("seed")
        qa[key] = {"accepted": key in accepted, "acceptedSeed": seed,
                   "textHash": text_hash(lines[key]), "attempts": attempts[key]}
        if key not in accepted:
            (OUTPUT / f"{key}.m4a").unlink(missing_ok=True)
    manifest_path.write_text(json.dumps(accepted, indent=2) + "\n", encoding="utf-8")
    qa_path.write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    failures = [key for key in keys if key not in accepted]
    print(f"voice complete: {len(accepted)}/{len(keys)} accepted; failures={failures}")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
