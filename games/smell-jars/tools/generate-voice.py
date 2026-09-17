#!/usr/bin/env python3
"""Generate the Smell Jars teacher voice and transcript-QA every line."""

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
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUTPUT = GAME / "assets/audio"
RAW = GAME / "assets/source/local-api/voice"
REFERENCE = ROOT / "shared/assets/refs/voice-teacher.wav"


def normalize(text: str) -> str:
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


def call(endpoint: str, fields: list[str], output: Path | None = None) -> subprocess.CompletedProcess:
    command = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    if output:
        output.parent.mkdir(parents=True, exist_ok=True)
        command.extend(["--output", str(output)])
    command.extend(["--max-time", "900"])
    return subprocess.run(command, capture_output=True, text=output is None, timeout=930, check=False)


def plausible(text: str, seconds: float) -> bool:
    return 0.3 <= seconds <= 2.2 + len(text.split()) * 0.72


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"))
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--only", nargs="*")
    args = parser.parse_args()
    if not args.api_url:
        raise SystemExit("Pass --api-url or set QLOBE_QWEN_URL")
    if not REFERENCE.is_file():
        raise SystemExit(f"approved synthetic teacher reference missing: {REFERENCE}")

    lines = json.loads((GAME / "config.json").read_text(encoding="utf-8"))["voice"]
    keys = args.only or list(lines)
    unknown = sorted(set(keys) - set(lines))
    if unknown:
        raise SystemExit(f"unknown voice keys: {', '.join(unknown)}")
    OUTPUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "lines.json").write_text(json.dumps(lines, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    tts = f"{args.api_url.rstrip('/')}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{args.api_url.rstrip('/')}/workflows/whisper-stt?sync=true"

    # Keep the voice model loaded for the full synthesis batch.
    for key in keys:
        text = lines[key]
        raw = RAW / f"{key}-seed{args.seed}.flac"
        final = OUTPUT / f"{key}.m4a"
        if not args.force and final.is_file() and plausible(text, duration(final)):
            print(f"{key}: retained", flush=True)
            continue
        print(f"{key}: TTS seed {args.seed}", flush=True)
        if args.force or not raw.is_file() or raw.stat().st_size < 1500:
            result = call(tts, [f"voice=@{REFERENCE}", f"text={text}", f"seed={args.seed}"], raw)
            if result.returncode or not raw.is_file() or raw.stat().st_size < 1500:
                print(f"{key}: synthesis failed", flush=True)
                continue
        encoded = subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-vn",
             "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
             "areverse,silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,"
             "areverse,loudnorm=I=-18:TP=-2:LRA=9",
             "-c:a", "aac", "-b:a", "88k", "-ar", "24000", "-ac", "1",
             "-movflags", "+faststart", str(final)],
            capture_output=True, timeout=180, check=False,
        )
        if encoded.returncode:
            print(f"{key}: AAC encode failed", flush=True)

    qa: dict[str, dict] = {}
    manifest: dict[str, dict] = {}
    # Keep Whisper loaded for the full QA batch.
    for key in keys:
        text = lines[key]
        final = OUTPUT / f"{key}.m4a"
        seconds = duration(final) if final.is_file() else 0.0
        if not final.is_file() or not plausible(text, seconds):
            qa[key] = {"accepted": False, "reason": "missing or implausible duration", "intended": text, "duration": seconds}
            continue
        print(f"{key}: Whisper QA", flush=True)
        result = call(whisper, [f"audio=@{final}", "model_size=base", "language=en", f"initial_prompt={text}"])
        try:
            heard = str(json.loads(result.stdout).get("text", "")).strip() if result.returncode == 0 else ""
        except (TypeError, json.JSONDecodeError):
            heard = ""
        wanted_norm, heard_norm = normalize(text), normalize(heard)
        score = difflib.SequenceMatcher(None, wanted_norm, heard_norm).ratio()
        wanted_words, heard_words = wanted_norm.split(), heard_norm.split()
        coverage = sum(1 for word in wanted_words if word in heard_words) / max(1, len(wanted_words))
        accepted = heard_norm == wanted_norm or (score >= 0.86 and coverage >= 0.88)
        digest = hashlib.sha256(final.read_bytes()).hexdigest()
        qa[key] = {
            "accepted": accepted,
            "engine": "qwen3-tts-voiceclone",
            "whisperEngine": "whisper-stt/base/en",
            "voice": "synthetic-platform-teacher",
            "seed": args.seed,
            "intended": text,
            "transcript": heard,
            "score": round(score, 3),
            "coverage": round(coverage, 3),
            "duration": seconds,
            "sha256": digest,
            "referenceSha256": hashlib.sha256(REFERENCE.read_bytes()).hexdigest(),
            "checkedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        }
        if accepted:
            manifest[key] = {"file": final.name, "dur": seconds, "sha256": digest,
                             "textHash": hashlib.sha256(text.encode()).hexdigest()[:16]}
        print(f"{key}: {'accepted' if accepted else 'rejected'} {score:.2f} -> {heard}", flush=True)

    # Preserve previously accepted entries during an --only retry.
    if args.only:
        try:
            old_qa = json.loads((OUTPUT / "qa.json").read_text(encoding="utf-8"))
            old_manifest = json.loads((OUTPUT / "manifest.json").read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            old_qa, old_manifest = {}, {}
        for key in lines:
            if key not in keys and key in old_qa:
                qa[key] = old_qa[key]
            if key not in keys and key in old_manifest:
                manifest[key] = old_manifest[key]

    (OUTPUT / "qa.json").write_text(json.dumps(dict(sorted(qa.items())), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUTPUT / "manifest.json").write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + "\n", encoding="utf-8")
    rejected = sorted(set(lines) - set(manifest))
    print(f"voice complete: {len(manifest)}/{len(lines)} accepted; rejected={rejected}")
    return 1 if rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
