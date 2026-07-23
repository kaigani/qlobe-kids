#!/usr/bin/env python3
"""Render and Whisper-QA the Story Stones teacher narrator library."""

from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import hashlib
import json
import re
import subprocess
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
GAME = ROOT / "games" / "story-stones"
OUT = GAME / "assets" / "audio"
PACK_PATH = GAME / "story-pack.json"
VOICE = Path("/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game/smoke/voice_teacher.wav")
TTS = "http://192.168.1.181:8100/workflows/qwen3-tts-voiceclone?sync=true"
WHISPER = "http://192.168.1.181:8100/workflows/whisper-stt?sync=true"
SEEDS = (7, 8, 9)
PREVIOUS_LINES = json.loads((OUT / "lines.json").read_text()) if (OUT / "lines.json").exists() else {}
PREVIOUS_QA = json.loads((OUT / "qa.json").read_text()) if (OUT / "qa.json").exists() else {}


def lines():
    pack = json.loads(PACK_PATH.read_text())
    result = {
        "welcome": "Welcome to Story Stones!",
        "choose-three": pack["prompts"]["intro"],
        "stones-ready": pack["prompts"]["ready"],
        "another-story": pack["prompts"]["another"],
    }
    for story in pack.get("stories", {}).values():
        for beat in story.get("beats", []):
            result[beat["narrator"]] = beat["text"]
    return result


def normalize(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def duration(path):
    run = subprocess.run(["/usr/local/bin/ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=noprint_wrappers=1:nokey=1", str(path)], capture_output=True, text=True)
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return 0


def transcribe(path):
    run = subprocess.run(["curl", "-sS", "-X", "POST", WHISPER,
                          "-F", f"audio=@{path}", "-F", "model_size=base", "-F", "language=en",
                          "--max-time", "900"], capture_output=True, timeout=930)
    try:
        return str(json.loads(run.stdout).get("text", "")).strip()
    except Exception:
        return ""


def generate_one(item):
    key, text = item
    destination = OUT / f"{key}.m4a"
    if destination.exists() and duration(destination) > .25 and PREVIOUS_LINES.get(key) == text:
        transcript = PREVIOUS_QA.get(key, {}).get("transcript", "")
        return key, "skip", transcript
    with tempfile.TemporaryDirectory(prefix="story-stones-voice-") as temp:
        temp = Path(temp)
        for seed in SEEDS:
            raw = temp / f"{key}-{seed}.flac"
            run = subprocess.run(["curl", "-sS", "-X", "POST", TTS,
                                  "-F", f"voice=@{VOICE}", "-F", f"text={text}", "-F", f"seed={seed}",
                                  "--output", str(raw), "--max-time", "900"], capture_output=True, timeout=930)
            if run.returncode or not raw.exists() or raw.stat().st_size < 2000:
                continue
            encoded = temp / f"{key}.m4a"
            subprocess.run(["/usr/local/bin/ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                            "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded)],
                           check=True, timeout=180)
            transcript = transcribe(encoded)
            ratio = difflib.SequenceMatcher(None, normalize(text), normalize(transcript)).ratio()
            if ratio >= .72:
                destination.write_bytes(encoded.read_bytes())
                return key, f"ok seed {seed} qa {ratio:.2f}", transcript
        return key, "FAIL", ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--clean", action="store_true", help="remove obsolete narration clips after a complete successful run")
    parser.add_argument("--benchmark-story", help="render one complete three-beat story to measure batching throughput")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    if args.benchmark_story:
        pack = json.loads(PACK_PATH.read_text())
        story = pack.get("stories", {}).get(args.benchmark_story)
        if not story:
            raise SystemExit(f"unknown story: {args.benchmark_story}")
        text = " ".join(beat["text"] for beat in story["beats"])
        with tempfile.TemporaryDirectory(prefix="story-stones-benchmark-") as temp:
            temp = Path(temp)
            raw, encoded = temp / "story.flac", temp / "story.m4a"
            started = time.monotonic()
            run = subprocess.run(["curl", "-sS", "-X", "POST", TTS,
                                  "-F", f"voice=@{VOICE}", "-F", f"text={text}", "-F", "seed=7",
                                  "--output", str(raw), "--max-time", "900"], capture_output=True, timeout=930)
            if run.returncode or not raw.exists():
                raise SystemExit(run.stderr.decode(errors="replace") or "benchmark TTS failed")
            tts_elapsed = time.monotonic() - started
            subprocess.run(["/usr/local/bin/ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                            "-vn", "-c:a", "aac", "-b:a", "96k", str(encoded)], check=True, timeout=180)
            transcript = transcribe(encoded)
            ratio = difflib.SequenceMatcher(None, normalize(text), normalize(transcript)).ratio()
            print(json.dumps({"story": args.benchmark_story, "words": len(text.split()),
                              "duration": duration(encoded), "ttsElapsed": round(tts_elapsed, 2),
                              "qa": round(ratio, 3), "transcript": transcript}, indent=2))
        return
    script = list(lines().items())
    if args.limit:
        script = script[:args.limit]
    key_text = dict(script)
    qa = dict(PREVIOUS_QA)
    progress = dict(PREVIOUS_LINES)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for key, status, transcript in pool.map(generate_one, script):
            qa[key] = {"status": status, "transcript": transcript}
            (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
            # checkpoint lines.json per completed clip so an interrupted run resumes
            # (skip logic keys off PREVIOUS_LINES text match) instead of redoing everything
            if not status.startswith("FAIL"):
                progress[key] = key_text[key]
                (OUT / "lines.json").write_text(json.dumps(progress, indent=2, ensure_ascii=False) + "\n")
            print(f"{key}: {status}", flush=True)
    all_lines = lines()
    manifest = {}
    for key, text in all_lines.items():
        path = OUT / f"{key}.m4a"
        if path.exists():
            manifest[key] = {
                "file": path.name, "dur": duration(path),
                "textHash": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
            }
    (OUT / "lines.json").write_text(json.dumps(all_lines, indent=2, ensure_ascii=False) + "\n")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    failures = [key for key, value in qa.items() if value["status"] == "FAIL"]
    print(f"complete: {len(manifest)}/{len(all_lines)} clips; failures={len(failures)}", flush=True)
    if failures:
        print("failed: " + ", ".join(failures), flush=True)
        raise SystemExit(1)
    if args.clean and not args.limit:
        removed = []
        for clip in OUT.glob("*.m4a"):
            if clip.stem not in all_lines:
                clip.unlink()
                removed.append(clip.name)
        print(f"removed obsolete clips: {len(removed)}", flush=True)


if __name__ == "__main__":
    main()
