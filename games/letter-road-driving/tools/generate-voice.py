#!/usr/bin/env python3
"""Generate and Whisper-QA Letter Road's cloned teacher-voice clips."""

from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games/letter-road-driving"
OUT = GAME / "assets/audio"
VOICE = ROOT / "shared/assets/refs/voice-teacher.wav"
SEEDS = (7, 8, 9)


def script_lines():
    config = json.loads((GAME / "config.json").read_text())
    voice = config["voice"]
    result = {
        voice["introKey"]: voice["intro"],
        voice["nudgeKey"]: voice["nudge"],
        voice["cheerKey"]: voice["cheer"],
    }
    result.update(zip(voice["yumKeys"], voice["yums"]))
    result.update(zip(voice["nextStrokeKeys"], voice["nextStroke"]))
    for mode in config["modes"]:
        result[mode["promptKey"]] = mode["prompt"]
        for path in mode["paths"]:
            result[path["promptKey"]] = path["prompt"]
            result[path["sayKey"]] = path["say"]
    return result


def normalize(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def duration(path):
    run = subprocess.run(
        ["/usr/local/bin/ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return 0


def generate_one(api_url, item):
    key, text = item
    destination = OUT / f"{key}.m4a"
    tts = f"{api_url}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{api_url}/workflows/whisper-stt?sync=true"
    with tempfile.TemporaryDirectory(prefix="letter-road-voice-") as temp_name:
        temp = Path(temp_name)
        for seed in SEEDS:
            raw = temp / f"{key}-{seed}.flac"
            run = subprocess.run(
                ["curl", "-sS", "-X", "POST", tts, "-F", f"voice=@{VOICE}",
                 "-F", f"text={text}", "-F", f"seed={seed}", "--output", str(raw),
                 "--max-time", "900"],
                capture_output=True, timeout=930,
            )
            if run.returncode or not raw.exists() or raw.stat().st_size < 2000:
                continue
            encoded = temp / f"{key}.m4a"
            subprocess.run(
                ["/usr/local/bin/ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                 "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded)],
                check=True, timeout=180,
            )
            check = subprocess.run(
                ["curl", "-sS", "-X", "POST", whisper, "-F", f"audio=@{encoded}",
                 "-F", "model_size=base", "-F", "language=en", "--max-time", "900"],
                capture_output=True, timeout=930,
            )
            try:
                transcript = str(json.loads(check.stdout).get("text", "")).strip()
            except Exception:
                transcript = ""
            ratio = difflib.SequenceMatcher(None, normalize(text), normalize(transcript)).ratio()
            if ratio >= 0.72:
                destination.write_bytes(encoded.read_bytes())
                return key, {"status": f"ok seed {seed}", "match": round(ratio, 3), "transcript": transcript}
    return key, {"status": "FAIL", "match": 0, "transcript": ""}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    api_url = args.api_url.rstrip("/")
    OUT.mkdir(parents=True, exist_ok=True)
    lines = script_lines()
    qa = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        jobs = ((api_url, item) for item in lines.items())
        for key, result in pool.map(lambda values: generate_one(*values), jobs):
            qa[key] = result
            print(f"{key}: {result['status']} match={result['match']}", flush=True)
    manifest = {}
    for key, text in lines.items():
        path = OUT / f"{key}.m4a"
        if path.exists():
            manifest[key] = {
                "file": path.name,
                "dur": duration(path),
                "textHash": hashlib.sha256(text.encode()).hexdigest()[:16],
            }
    (OUT / "lines.json").write_text(json.dumps(lines, indent=2, ensure_ascii=False) + "\n")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    failures = [key for key in lines if key not in manifest]
    print(f"complete: {len(manifest)}/{len(lines)}; failures={failures}", flush=True)
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
