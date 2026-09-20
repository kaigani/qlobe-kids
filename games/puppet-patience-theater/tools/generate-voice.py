#!/usr/bin/env python3
"""Generate cloned teacher narration and verify every line with LAN Whisper."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
RAW = GAME / "assets/source/local-api/voice"
REF = ROOT / "shared/assets/refs/voice-teacher.wav"
LINES = OUT / "lines.json"


def read(path, default):
    try:
        return json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError):
        return default


def norm(value):
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def duration(path):
    result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                             "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                            capture_output=True, text=True)
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0


def plausible(text, seconds):
    return 0.25 <= seconds <= 1.9 + max(1, len(text.split())) * 0.72


def post(url, fields, output, min_size=1):
    command = ["curl", "-sS", "-X", "POST", url]
    for field in fields:
        command += ["-F", field]
    command += ["--output", str(output), "--max-time", "900"]
    result = subprocess.run(command, capture_output=True, timeout=930)
    return result.returncode == 0 and output.exists() and output.stat().st_size >= min_size


def encode(raw, final):
    result = subprocess.run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-vn", "-af",
        "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,areverse,"
        "silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,areverse,"
        "loudnorm=I=-18:TP=-2:LRA=9", "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1",
        "-movflags", "+faststart", str(final),
    ], capture_output=True, timeout=180)
    return result.returncode == 0 and final.exists() and final.stat().st_size > 1500


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=7)
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    lines = read(LINES, {})
    state = read(ROOT / "tools/state/local.json", {})
    base = (os.environ.get("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    if not lines or not base or not REF.exists():
        raise SystemExit("missing lines, local API endpoint, or approved voice reference")
    keys = args.only or list(lines)
    unknown = [key for key in keys if key not in lines]
    if unknown:
        raise SystemExit("unknown keys: " + ", ".join(unknown))
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    tts = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{base}/workflows/whisper-stt?sync=true"
    generated = {}
    qa = read(OUT / "qa.json", {})
    previous = read(OUT / "manifest.json", {})
    manifest = {key: value for key, value in previous.items() if key in lines and isinstance(value, dict)}
    for key in keys:
        text = lines[key]
        final = OUT / f"{key}.m4a"
        raw = RAW / f"{key}-seed{args.seed}.flac"
        if not args.force and final.exists() and plausible(text, duration(final)):
            generated[key] = {"seed": args.seed, "status": "kept", "duration": duration(final)}
            continue
        print(f"{key}: TTS seed {args.seed}", flush=True)
        if args.force or not raw.exists() or raw.stat().st_size <= 1500:
            if not post(tts, [f"voice=@{REF}", f"text={text}", f"seed={args.seed}"], raw, 1500):
                generated[key] = {"seed": args.seed, "status": "tts-failed"}
                continue
        if not encode(raw, final):
            generated[key] = {"seed": args.seed, "status": "encode-failed"}
            continue
        generated[key] = {"seed": args.seed, "status": "encoded", "duration": duration(final)}
    for key in keys:
        text = lines[key]
        final = OUT / f"{key}.m4a"
        seconds = duration(final) if final.exists() else 0
        if not final.exists() or not plausible(text, seconds):
            qa[key] = {"accepted": False, "reason": "missing or implausible duration", "want": text,
                       "duration": seconds, "seed": args.seed}
            manifest.pop(key, None)
            continue
        transcript = RAW / f"{key}-seed{args.seed}-transcript.json"
        ok = post(whisper, [f"audio=@{final}", "model_size=base", "language=en",
                            "initial_prompt=Puppet Patience Theater. Fox, Rabbit, and Squirrel. Watch, breathe, and take turns."], transcript)
        payload = read(transcript, {}) if ok else {}
        heard_raw = str(payload.get("text") or payload.get("transcript") or "").strip()
        want = norm(text)
        heard = norm(heard_raw)
        score = difflib.SequenceMatcher(None, want, heard).ratio()
        wanted_words = want.split()
        heard_words = heard.split()
        coverage = sum(word in heard_words for word in wanted_words) / max(1, len(wanted_words))
        accepted = heard == want if len(wanted_words) <= 3 else score >= 0.86 and coverage >= 0.90
        qa[key] = {"accepted": accepted, "score": round(score, 3), "coverage": round(coverage, 3),
                   "want": text, "transcript": heard_raw, "seed": args.seed, "duration": seconds}
        if accepted:
            manifest[key] = {"file": final.name, "dur": seconds,
                             "textHash": hashlib.sha256(text.encode()).hexdigest()[:16], "seed": args.seed}
        else:
            manifest.pop(key, None)
        print(f"{key}: {'accepted' if accepted else 'fallback'} {score:.2f}/{coverage:.2f} -> {heard_raw}", flush=True)
    body = dict(sorted(manifest.items()))
    final_manifest = {"_v": hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:12], **body}
    (OUT / "manifest.json").write_text(json.dumps(final_manifest, indent=2) + "\n", "utf-8")
    (OUT / "qa.json").write_text(json.dumps(dict(sorted(qa.items())), indent=2, ensure_ascii=False) + "\n", "utf-8")
    receipt = {
        "format": "qlobe-voice-production-receipt", "formatVersion": 1, "game": GAME.name,
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "workflow": "qwen3-tts-voiceclone -> AAC/M4A -> whisper-stt transcript QA",
        "endpoint": "authorized local workflow API (address intentionally omitted)",
        "reference": str(REF.relative_to(ROOT)).replace("\\", "/"),
        "generation": dict(sorted(generated.items())),
        "accepted": [key for key in lines if key in body], "fallback": [key for key in lines if key not in body],
    }
    (RAW / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n", "utf-8")
    print(f"voice complete: {len(receipt['accepted'])}/{len(lines)} accepted")


if __name__ == "__main__":
    main()
