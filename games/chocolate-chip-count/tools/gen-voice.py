#!/usr/bin/env python3
"""Batch Chocolate Chip Count teacher voice, then Whisper transcript QA.

The exact `config.json` voice map is the source of truth. All Qwen voice-clone
jobs run before Whisper jobs so the local host does not thrash between models.
Rejected clips remain out of `manifest.json`; shared voice-clips.js then speaks
the exact line through the device fallback.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUTPUT = GAME / "assets" / "audio"
RAW = GAME / "assets" / "source" / "local-api" / "voice"
REFERENCE = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
LINES = json.loads((GAME / "config.json").read_text())["voice"]
NUMBER_WORDS = {str(i): word for i, word in enumerate(
    ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"]
)}


def normalized(text: str) -> str:
    words = re.findall(r"[a-z0-9]+", text.lower())
    return " ".join(NUMBER_WORDS.get(word, word) for word in words)


def duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, check=False,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0


def call(endpoint: str, fields: list[str], output: Path, min_size: int = 1) -> bool:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(output), "--max-time", "900"])
    result = subprocess.run(command, capture_output=True, timeout=930, check=False)
    return result.returncode == 0 and output.exists() and output.stat().st_size >= min_size


def plausible(text: str, seconds: float) -> bool:
    words = max(1, len(text.split()))
    return .2 <= seconds <= 1.8 + words * .72


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    state_path = ROOT / "tools" / "state" / "local.json"
    try:
        state = json.loads(state_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        state = {}
    base = (os.environ.get("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    if not base:
        raise SystemExit("Qwen endpoint missing: set QLOBE_QWEN_URL or tools/state/local.json qwenUrl")
    if not REFERENCE.exists():
        raise SystemExit(f"approved teacher voice reference missing: {REFERENCE}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "lines.json").write_text(json.dumps(LINES, indent=2, ensure_ascii=False) + "\n")
    keys = args.only or list(LINES)
    unknown = [key for key in keys if key not in LINES]
    if unknown:
        raise SystemExit(f"unknown voice key(s): {', '.join(unknown)}")

    tts = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{base}/workflows/whisper-stt?sync=true"

    # Phase 1: keep Qwen TTS loaded for the whole batch.
    for key in keys:
        text = LINES[key]
        final = OUTPUT / f"{key}.m4a"
        raw = RAW / f"{key}-seed{args.seed}.flac"
        if not args.force and final.exists() and plausible(text, duration(final)):
            print(f"{key}: keep existing AAC", flush=True)
            continue
        print(f"{key}: TTS seed {args.seed}", flush=True)
        if args.force or not raw.exists() or raw.stat().st_size < 1500:
            if not call(tts, [f"voice=@{REFERENCE}", f"text={text}", f"seed={args.seed}"], raw, 1500):
                print(f"{key}: TTS failed", flush=True)
                continue
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-vn",
             "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
             "areverse,silenceremove=start_periods=1:start_silence=0.10:"
             "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
             "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1",
             "-movflags", "+faststart", str(final)],
            check=True, timeout=180,
        )

    # Phase 2: keep Whisper loaded for the whole QA batch.
    qa_path = OUTPUT / "qa.json"
    manifest_path = OUTPUT / "manifest.json"
    try:
        qa = json.loads(qa_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        qa = {}
    try:
        manifest = json.loads(manifest_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        manifest = {}

    for key in keys:
        text = LINES[key]
        final = OUTPUT / f"{key}.m4a"
        seconds = duration(final) if final.exists() else 0
        if not final.exists() or not plausible(text, seconds):
            qa[key] = {"accepted": False, "reason": "missing or implausible duration", "want": text, "duration": seconds}
            manifest.pop(key, None)
            continue
        transcript_file = RAW / f"{key}-seed{args.seed}-transcript.json"
        print(f"{key}: Whisper QA", flush=True)
        ok = call(
            whisper,
            [f"audio=@{final}", "model_size=base", "language=en",
             "initial_prompt=Chocolate Chip Count. Ravi is a mini chef. Pop the balloon and catch chocolate chips. "
             "One, two, three, four, five, six, seven, eight, nine, ten. Great counting!"],
            transcript_file,
        )
        try:
            heard_raw = str(json.loads(transcript_file.read_text()).get("text", "")).strip() if ok else ""
        except (FileNotFoundError, json.JSONDecodeError):
            heard_raw = ""
        wanted = normalized(text)
        heard = normalized(heard_raw)
        score = difflib.SequenceMatcher(None, wanted, heard).ratio()
        wanted_words = wanted.split()
        heard_words = heard.split()
        coverage = sum(1 for word in wanted_words if word in heard_words) / max(1, len(wanted_words))
        accepted = heard == wanted if len(wanted_words) <= 3 else score >= .83 and coverage >= .88
        qa[key] = {
            "accepted": accepted,
            "score": round(score, 3),
            "coverage": round(coverage, 3),
            "want": text,
            "transcript": heard_raw,
            "seed": args.seed,
            "duration": seconds,
        }
        if accepted:
            manifest[key] = {
                "file": final.name,
                "dur": seconds,
                "textHash": hashlib.sha256(text.encode()).hexdigest()[:16],
                "seed": args.seed,
            }
        else:
            manifest.pop(key, None)
        print(f"{key}: {'accepted' if accepted else 'fallback'} {score:.2f} → {heard_raw}", flush=True)

    manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
    qa_path.write_text(json.dumps(dict(sorted(qa.items())), indent=2, ensure_ascii=False) + "\n")
    rejected = [key for key in keys if key not in manifest]
    print(f"voice complete: {len(manifest)}/{len(LINES)} accepted; rejected={rejected}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
