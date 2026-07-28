#!/usr/bin/env python3
"""Batch Sound Painting teacher voice, then batch Whisper transcript QA.

`config.json` is the spoken-script source of truth. All TTS jobs complete before
Whisper loads, keeping the local model host efficient. Rejected clips stay out
of manifest.json so voice-clips.js uses the exact Web Speech fallback instead.
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
def normalized(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0


def call(endpoint: str, fields: list[str], output: Path, min_size: int = 1) -> bool:
    args = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        args.extend(["-F", field])
    args.extend(["--output", str(output), "--max-time", "900"])
    result = subprocess.run(args, capture_output=True, timeout=930)
    return result.returncode == 0 and output.exists() and output.stat().st_size >= min_size


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        raise SystemExit("QLOBE_QWEN_URL is not set")
    if not REFERENCE.exists():
        raise SystemExit(f"voice reference missing: {REFERENCE}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "lines.json").write_text(json.dumps(LINES, indent=2, ensure_ascii=False) + "\n")
    tts = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{base}/workflows/whisper-stt?sync=true"
    keys = args.only or list(LINES)
    unknown = [key for key in keys if key not in LINES]
    if unknown:
        raise SystemExit(f"unknown voice key(s): {', '.join(unknown)}")

    # Phase 1: keep the TTS model loaded for the complete batch.
    for key in keys:
        text = LINES[key]
        final = OUTPUT / f"{key}.m4a"
        raw = RAW / f"{key}-seed{args.seed}.flac"
        if not args.force and final.exists() and duration(final) > .25:
            print(f"{key}: skip TTS", flush=True)
            continue
        print(f"{key}: TTS", flush=True)
        if not (raw.exists() and raw.stat().st_size > 1500):
            if not call(tts, [f"voice=@{REFERENCE}", f"text={text}", f"seed={args.seed}"], raw, 1500):
                print(f"{key}: TTS failed", flush=True)
                continue
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
             "-vn", "-af",
             "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
             "areverse,silenceremove=start_periods=1:start_silence=0.10:"
             "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
             "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1",
             "-movflags", "+faststart", str(final)],
            check=True, timeout=180,
        )

    # Phase 2: keep Whisper loaded for the complete QA batch.
    qa_path = OUTPUT / "qa.json"
    manifest_path = OUTPUT / "manifest.json"
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for key in keys:
        text = LINES[key]
        final = OUTPUT / f"{key}.m4a"
        if not final.exists():
            qa[key] = {"accepted": False, "reason": "missing clip", "want": text}
            continue
        transcript_file = RAW / f"{key}-transcript.json"
        print(f"{key}: Whisper QA", flush=True)
        ok = call(
            whisper,
            [f"audio=@{final}", "model_size=base", "language=en",
             "initial_prompt=Sound Painting. Calm River. Bouncy Beat. Star Sparkles. "
             "Paint what you hear. Make music we can see."],
            transcript_file,
        )
        try:
            transcript = str(json.loads(transcript_file.read_text()).get("text", "")).strip() if ok else ""
        except Exception:
            transcript = ""
        wanted = normalized(text)
        heard = normalized(transcript)
        score = difflib.SequenceMatcher(None, wanted, heard).ratio()
        wanted_words = wanted.split()
        coverage = sum(1 for word in wanted_words if word in heard.split()) / max(1, len(wanted_words))
        # A single substituted action word changes a short child instruction
        # even when character-level similarity is very high ("swish"/"switch").
        accepted = ((heard == wanted) or (coverage == 1 and score >= .72)) if len(wanted_words) <= 10 \
            else (score >= .72 or (score >= .62 and coverage >= .82))
        qa[key] = {
            "accepted": accepted,
            "score": round(score, 3),
            "coverage": round(coverage, 3),
            "want": text,
            "transcript": transcript,
            "seed": args.seed,
            "duration": duration(final),
        }
        if accepted:
            manifest[key] = {
                "file": final.name,
                "dur": duration(final),
                "textHash": hashlib.sha256(text.encode()).hexdigest()[:16],
            }
        else:
            manifest.pop(key, None)
        print(f"{key}: {'accepted' if accepted else 'fallback'} {score:.2f} → {transcript}", flush=True)

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    qa_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    print(f"voice complete: {len(manifest)}/{len(LINES)} accepted", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
