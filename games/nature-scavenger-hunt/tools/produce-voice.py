#!/usr/bin/env python3
"""Create teacher narration with local Qwen voice clone and Whisper QA.

The checked-in assets/audio/lines.json is the verbatim script. Qwen generation
runs as one batch, followed by one Whisper batch so the LAN host does not swap
large models between every line. Only transcript-approved clips enter the
runtime manifest; shared voice-clips.js supplies device speech for any reject.
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
from datetime import datetime, timezone
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUTPUT = GAME / "assets" / "audio"
RAW = GAME / "assets" / "source" / "local-api" / "voice"
REFERENCE = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
LINES_PATH = OUTPUT / "lines.json"
LINES: dict[str, str] = json.loads(LINES_PATH.read_text("utf-8"))


def normalized(text: str) -> str:
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
        return 0


def plausible(text: str, seconds: float) -> bool:
    words = max(1, len(text.split()))
    return .25 <= seconds <= 1.9 + words * .72


def call(endpoint: str, fields: list[str], output: Path, min_size: int = 1) -> bool:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(output), "--max-time", "900"])
    result = subprocess.run(command, capture_output=True, timeout=930, check=False)
    return result.returncode == 0 and output.exists() and output.stat().st_size >= min_size


def encode(raw: Path, final: Path) -> bool:
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-vn",
            "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
            "areverse,silenceremove=start_periods=1:start_silence=0.10:"
            "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
            "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1",
            "-movflags", "+faststart", str(final),
        ],
        capture_output=True, timeout=180, check=False,
    )
    return result.returncode == 0 and final.exists() and final.stat().st_size > 1500


def read_json(path: Path, fallback: dict) -> dict:
    try:
        return json.loads(path.read_text("utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    state = read_json(ROOT / "tools" / "state" / "local.json", {})
    base = (os.environ.get("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    if not base:
        raise SystemExit("Qwen endpoint missing: set QLOBE_QWEN_URL or tools/state/local.json qwenUrl")
    if not REFERENCE.exists():
        raise SystemExit(f"approved teacher voice reference missing: {REFERENCE}")

    keys = args.only or list(LINES)
    unknown = [key for key in keys if key not in LINES]
    if unknown:
        raise SystemExit(f"unknown voice key(s): {', '.join(unknown)}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    tts = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{base}/workflows/whisper-stt?sync=true"

    generation: dict[str, dict] = {}
    for key in keys:
        text = LINES[key]
        final = OUTPUT / f"{key}.m4a"
        raw = RAW / f"{key}-seed{args.seed}.flac"
        if not args.force and final.exists() and plausible(text, duration(final)):
            generation[key] = {"seed": args.seed, "status": "kept", "duration": duration(final)}
            print(f"{key}: keep existing AAC", flush=True)
            continue
        print(f"{key}: Qwen TTS seed {args.seed}", flush=True)
        if args.force or not raw.exists() or raw.stat().st_size < 1500:
            if not call(tts, [f"voice=@{REFERENCE}", f"text={text}", f"seed={args.seed}"], raw, 1500):
                generation[key] = {"seed": args.seed, "status": "tts-failed"}
                print(f"{key}: TTS request failed", flush=True)
                continue
        if not encode(raw, final):
            generation[key] = {"seed": args.seed, "status": "encode-failed"}
            print(f"{key}: response was not usable audio", flush=True)
            continue
        generation[key] = {"seed": args.seed, "status": "encoded", "duration": duration(final)}

    qa_path = OUTPUT / "qa.json"
    manifest_path = OUTPUT / "manifest.json"
    qa = read_json(qa_path, {})
    existing = read_json(manifest_path, {})
    manifest = {key: value for key, value in existing.items() if key in LINES and isinstance(value, dict)}

    for key in keys:
        text = LINES[key]
        final = OUTPUT / f"{key}.m4a"
        seconds = duration(final) if final.exists() else 0
        if not final.exists() or not plausible(text, seconds):
            qa[key] = {
                "accepted": False,
                "reason": "missing or implausible duration",
                "want": text,
                "duration": seconds,
                "seed": args.seed,
            }
            manifest.pop(key, None)
            continue

        transcript_file = RAW / f"{key}-seed{args.seed}-transcript.json"
        print(f"{key}: Whisper QA", flush=True)
        ok = call(
            whisper,
            [
                f"audio=@{final}",
                "model_size=base",
                "language=en",
                "initial_prompt=Nature Hunt. Choose a trail, nature explorer. Find three clues outdoors. "
                "Texture Trail. Color Quest. Wonderful noticing!",
            ],
            transcript_file,
        )
        payload = read_json(transcript_file, {}) if ok else {}
        heard_raw = str(payload.get("text") or payload.get("transcript") or "").strip()
        wanted = normalized(text)
        heard = normalized(heard_raw)
        score = difflib.SequenceMatcher(None, wanted, heard).ratio()
        wanted_words = wanted.split()
        heard_words = heard.split()
        coverage = sum(1 for word in wanted_words if word in heard_words) / max(1, len(wanted_words))
        accepted = heard == wanted if len(wanted_words) <= 3 else score >= .86 and coverage >= .9
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
                "textHash": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
                "seed": args.seed,
            }
        else:
            manifest.pop(key, None)
        print(f"{key}: {'accepted' if accepted else 'fallback'} {score:.2f} / {coverage:.2f} -> {heard_raw}", flush=True)

    cache_hash = hashlib.sha256(json.dumps(manifest, sort_keys=True).encode("utf-8")).hexdigest()[:12]
    manifest = {"_v": cache_hash, **dict(sorted(manifest.items()))}
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", "utf-8")
    qa_path.write_text(json.dumps(dict(sorted(qa.items())), indent=2, ensure_ascii=False) + "\n", "utf-8")
    # A targeted retry must not make the receipt look as though the rest of the
    # accepted production set was never generated. Backfill unchanged entries
    # from the verified runtime manifest without re-contacting the LAN service.
    for key in LINES:
        if key not in generation and key in manifest:
            entry = manifest[key]
            generation[key] = {
                "seed": entry.get("seed"),
                "status": "accepted-existing",
                "duration": entry.get("dur"),
            }
    receipt = {
        "format": "qlobe-voice-production-receipt",
        "formatVersion": 1,
        "game": GAME.name,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "workflow": "qwen3-tts-voiceclone -> AAC/M4A -> whisper-stt transcript QA",
        "endpoint": "authorized local workflow API (address intentionally omitted)",
        "reference": str(REFERENCE.relative_to(ROOT)).replace("\\", "/"),
        "generation": dict(sorted(generation.items())),
        "accepted": [key for key in LINES if key in manifest],
        "fallback": [key for key in LINES if key not in manifest],
    }
    (RAW / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", "utf-8")
    accepted_count = sum(1 for key in LINES if key in manifest)
    print(f"voice complete: {accepted_count}/{len(LINES)} accepted", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
