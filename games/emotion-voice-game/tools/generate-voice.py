#!/usr/bin/env python3
"""Generate, Whisper-QA, and viseme-align Teddy's Bear narration."""

from __future__ import annotations

import concurrent.futures
import difflib
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets" / "audio"
LINES_PATH = OUT / "lines.json"
LOCAL = ROOT / "tools" / "state" / "local.json"
# Teddy uses the already-shipped Benny Bear character voice, rather than the
# generic teacher. This committed clip is the project's established Bear voice.
VOICE = ROOT / "shared" / "characters" / "bear" / "voice" / "intro.m4a"
RHUBARB = ROOT.parent / "tools-local" / "Rhubarb-Lip-Sync-1.14.0-macOS" / "rhubarb"
RHU_TO_VISEME = {
    "X": "rest", "A": "mbp", "B": "ts", "C": "e", "D": "a",
    "E": "o", "F": "uq", "G": "fv", "H": "ln",
}
SEEDS = (7, 8, 9)


def settings():
    local = json.loads(LOCAL.read_text()) if LOCAL.exists() else {}
    base = str(local.get("qwenUrl", "")).rstrip("/")
    # Deliberately ignore machine-local teacherVoicePath here. Teddy clones the
    # committed Bear character line so narration stays in the established cast.
    voice = VOICE
    if not base:
        raise SystemExit("Set qwenUrl in tools/state/local.json before generating voice.")
    if not voice.is_file():
        raise SystemExit(f"Teacher voice reference is missing: {voice}")
    return base, voice


def normalize(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def duration(path):
    run = subprocess.run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], capture_output=True, text=True)
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return 0


def transcribe(path, endpoint):
    run = subprocess.run([
        "curl", "-sS", "-X", "POST", endpoint,
        "-F", f"audio=@{path}", "-F", "model_size=base", "-F", "language=en",
        "--max-time", "900",
    ], capture_output=True, timeout=930)
    try:
        return str(json.loads(run.stdout).get("text", "")).strip()
    except Exception:
        return ""


def align_visemes(path: Path, key: str, text: str):
    if not RHUBARB.is_file():
        raise RuntimeError(f"Rhubarb is missing: {RHUBARB}")
    with tempfile.TemporaryDirectory(prefix="emotion-viseme-") as temp_name:
        temp = Path(temp_name)
        pcm = temp / f"{key}.wav"
        dialog = temp / f"{key}.txt"
        raw = temp / f"{key}.json"
        subprocess.run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(path),
            "-ac", "1", "-ar", "44100", "-c:a", "pcm_s16le", str(pcm),
        ], check=True, timeout=180)
        dialog.write_text(text)
        subprocess.run([
            str(RHUBARB), "-f", "json", "--extendedShapes", "GHX",
            "-d", str(dialog), "-o", str(raw), str(pcm),
        ], check=True, capture_output=True, timeout=180)
        rhubarb = json.loads(raw.read_text())
        cues = {
            "metadata": {
            "duration": duration(path),
            "source": "rhubarb-1.14",
            "voice": "shared Bear / Benny",
            },
            "mouthCues": [{
                "start": round(float(cue.get("start", 0)), 3),
                "end": round(float(cue.get("end", 0)), 3),
                "value": RHU_TO_VISEME.get(str(cue.get("value", "X")).upper(), "rest"),
                "sourceValue": str(cue.get("value", "X")).upper(),
            } for cue in rhubarb.get("mouthCues", [])],
        }
        (OUT / f"{key}.cues.json").write_text(json.dumps(cues, indent=2) + "\n")


def generate(item, base, voice):
    key, text = item
    destination = OUT / f"{key}.m4a"
    tts = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{base}/workflows/whisper-stt?sync=true"
    with tempfile.TemporaryDirectory(prefix="emotion-voice-") as temp_name:
        temp = Path(temp_name)
        for seed in SEEDS:
            raw = temp / f"{key}-{seed}.flac"
            run = subprocess.run([
                "curl", "-sS", "-X", "POST", tts,
                "-F", f"voice=@{voice}", "-F", f"text={text}", "-F", f"seed={seed}",
                "--output", str(raw), "--max-time", "900",
            ], capture_output=True, timeout=930)
            if run.returncode or not raw.exists() or raw.stat().st_size < 2000:
                continue
            encoded = temp / f"{key}.m4a"
            subprocess.run([
                "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                "-vn", "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-c:a", "aac", "-b:a", "96k",
                "-movflags", "+faststart", str(encoded),
            ], check=True, timeout=180)
            heard = transcribe(encoded, whisper)
            ratio = difflib.SequenceMatcher(None, normalize(text), normalize(heard)).ratio()
            if ratio >= 0.72 and 0.25 < duration(encoded) < 10:
                destination.write_bytes(encoded.read_bytes())
                return key, {"status": f"ok seed {seed}", "transcript": heard, "ratio": round(ratio, 3)}
        return key, {"status": "FAIL", "transcript": "", "ratio": 0}


def main():
    base, voice = settings()
    lines = json.loads(LINES_PATH.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    qa = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = [pool.submit(generate, item, base, voice) for item in lines.items()]
        for future in concurrent.futures.as_completed(futures):
            key, result = future.result()
            qa[key] = result
            print(f"{key}: {result['status']} — {result['transcript']}", flush=True)
    manifest = {}
    for key, text in lines.items():
        path = OUT / f"{key}.m4a"
        if path.exists() and qa.get(key, {}).get("status", "").startswith("ok"):
            align_visemes(path, key, text)
            manifest[key] = {
                "file": path.name,
                "dur": duration(path),
                "cues": f"{key}.cues.json",
                "textHash": hashlib.sha256(text.encode()).hexdigest()[:16],
            }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    failed = [key for key in lines if key not in manifest]
    print(f"complete: {len(manifest)}/{len(lines)}; failures={failed}")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    main()
