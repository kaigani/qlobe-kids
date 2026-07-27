#!/usr/bin/env python3
"""Batch Qwen voice-clone narration, then batch Whisper QA.

The workflow types are intentionally not interleaved: all TTS work completes
before Whisper loads. Rejected clips remain documented in qa.json but are
excluded from manifest.json so the runtime uses the matching device-speech
line from data/lines.json.
"""

from __future__ import annotations

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
REFERENCE = ROOT / "games" / "flashlight-cave" / "assets" / "audio" / "ref" / "ari.flac"
LINES = json.loads((GAME / "data" / "lines.json").read_text())
KEYS = (
    "intro", "guided", "free", "shows", "pickStory", "pickCast", "pickStage",
    "ready", "micOkay", "micNo", "recording", "nextBeat", "saved",
    "shelfFull", "deleted", "cheer",
)


def normalized(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def duration(path: Path) -> float:
    result = subprocess.run(
        ["/usr/local/bin/ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0


def call(endpoint: str, fields: list[str], output: Path, min_size: int = 1) -> bool:
    result = subprocess.run(
        ["curl", "-sS", "-X", "POST", endpoint, *sum((["-F", field] for field in fields), []),
         "--output", str(output), "--max-time", "900"],
        capture_output=True,
        timeout=930,
    )
    return result.returncode == 0 and output.exists() and output.stat().st_size >= min_size


def main() -> int:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        raise SystemExit("QLOBE_QWEN_URL is not set")
    if not REFERENCE.exists():
        raise SystemExit(f"voice reference missing: {REFERENCE}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    tts = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{base}/workflows/whisper-stt?sync=true"

    # Phase 1: voice model stays loaded for the complete authored batch.
    for key in KEYS:
        final = OUTPUT / f"{key}.m4a"
        if final.exists() and duration(final) > .25:
            print(f"{key}: skip TTS", flush=True)
            continue
        raw = RAW / f"{key}-seed7.flac"
        print(f"{key}: TTS", flush=True)
        if not (raw.exists() and raw.stat().st_size > 1500) and not call(
            tts, [f"voice=@{REFERENCE}", f"text={LINES[key]}", "seed=7"], raw, min_size=1500
        ):
            print(f"{key}: TTS failed", flush=True)
            continue
        subprocess.run(
            ["/usr/local/bin/ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
             "-vn", "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-c:a", "aac",
             "-b:a", "96k", "-movflags", "+faststart", str(final)],
            check=True,
            timeout=180,
        )

    # Phase 2: Whisper stays loaded for the complete QA batch.
    qa = {}
    manifest = {}
    for key in KEYS:
        final = OUTPUT / f"{key}.m4a"
        if not final.exists():
            qa[key] = {"accepted": False, "reason": "missing clip"}
            continue
        transcript_file = RAW / f"{key}-transcript.json"
        print(f"{key}: Whisper QA", flush=True)
        ok = call(whisper, [f"audio=@{final}", "model_size=base", "language=en"], transcript_file)
        try:
            transcript = str(json.loads(transcript_file.read_text()).get("text", "")).strip() if ok else ""
        except Exception:
            transcript = ""
        score = difflib.SequenceMatcher(None, normalized(LINES[key]), normalized(transcript)).ratio()
        accepted = score >= .68
        qa[key] = {"accepted": accepted, "score": round(score, 3), "transcript": transcript}
        if accepted:
            manifest[key] = {
                "file": final.name,
                "dur": duration(final),
                "textHash": hashlib.sha256(LINES[key].encode()).hexdigest()[:16],
            }
        else:
            final.unlink(missing_ok=True)
        print(f"{key}: {'accepted' if accepted else 'fallback'} {score:.2f}", flush=True)

    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUTPUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    print(f"voice complete: {len(manifest)}/{len(KEYS)} accepted", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
