#!/usr/bin/env python3
"""Batch Pouring Station teacher voice and run Whisper transcript QA."""
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


def normalized(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def duration(path: Path) -> float:
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)], capture_output=True, text=True, check=False)
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0.0


def call(endpoint: str, fields: list[str], output: Path, minimum: int = 1) -> bool:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(output), "--max-time", "900"])
    result = subprocess.run(command, capture_output=True, timeout=930, check=False)
    return result.returncode == 0 and output.exists() and output.stat().st_size >= minimum


def plausible(text: str, seconds: float) -> bool:
    return 0.2 <= seconds <= 1.8 + max(1, len(text.split())) * 0.72


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate and QA Pouring Station voice clips")
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
    for key in keys:
        text, final = LINES[key], OUTPUT / f"{key}.m4a"
        raw = RAW / f"{key}-seed{args.seed}.flac"
        if not args.force and final.exists() and plausible(text, duration(final)):
            continue
        if args.force or not raw.exists() or raw.stat().st_size < 1500:
            if not call(tts, [f"voice=@{REFERENCE}", f"text={text}", f"seed={args.seed}"], raw, 1500):
                print(f"{key}: TTS failed", flush=True)
                continue
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-vn", "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9", "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1", "-movflags", "+faststart", str(final)], check=True, timeout=180)
    try:
        qa = json.loads((OUTPUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        qa = {}
    try:
        manifest = json.loads((OUTPUT / "manifest.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        manifest = {}
    prompt = "Pouring Station. Maya helps with water, beans, and rice. Lift the pitcher, pour to the glowing line, then stop. Slow and steady. Beautiful stop."
    for key in keys:
        text, final = LINES[key], OUTPUT / f"{key}.m4a"
        seconds = duration(final) if final.exists() else 0
        transcript_file = RAW / f"{key}-seed{args.seed}-transcript.json"
        heard_raw = ""
        if final.exists() and plausible(text, seconds):
            ok = call(whisper, [f"audio=@{final}", "model_size=base", "language=en", f"initial_prompt={prompt}"], transcript_file)
            try:
                heard_raw = str(json.loads(transcript_file.read_text()).get("text", "")).strip() if ok else ""
            except (FileNotFoundError, json.JSONDecodeError):
                pass
        wanted, heard = normalized(text), normalized(heard_raw)
        score = difflib.SequenceMatcher(None, wanted, heard).ratio()
        coverage = sum(word in heard.split() for word in wanted.split()) / max(1, len(wanted.split()))
        accepted = heard == wanted if len(wanted.split()) <= 3 else score >= .83 and coverage >= .88
        qa[key] = {"accepted": accepted, "score": round(score, 3), "coverage": round(coverage, 3), "want": text, "transcript": heard_raw, "seed": args.seed, "duration": seconds}
        if accepted:
            manifest[key] = {"file": final.name, "dur": seconds, "textHash": hashlib.sha256(text.encode()).hexdigest()[:16], "seed": args.seed}
        else:
            manifest.pop(key, None)
    (OUTPUT / "manifest.json").write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n")
    (OUTPUT / "qa.json").write_text(json.dumps(dict(sorted(qa.items())), indent=2, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
