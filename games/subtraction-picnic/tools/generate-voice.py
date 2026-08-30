#!/usr/bin/env python3
"""Generate and Whisper-QA Subtraction Picnic's cloned teacher voice pack.

The approved LAN host and rights-cleared teacher reference are read from the
git-ignored tools/state/local.json. Their private values are never written to
the manifest. TTS is batched before Whisper so the local host does not thrash
between models.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
GAME = HERE.parent
ROOT = GAME.parents[1]
OUT = GAME / "assets" / "audio"
RAW = GAME / "assets" / "source" / "audio" / "raw"
LOCAL_CONFIG = ROOT / "tools" / "state" / "local.json"
SEEDS = (7, 8, 9)

LINES = {
    "intro": "Welcome to our subtraction picnic. Pick a picnic game.",
    "forest-intro": "Our forest friends are hungry. Give them a snack, then count what is left.",
    "practice-intro": "Let’s take away apples. Give some to Squirrel, then count what is left.",
    "party-intro": "Picnic party! Give away as many snacks as you like. Watch the numbers change.",
    "how-many-left": "How many are left on the blanket?",
    "count-hint": "Let’s count what is still on the blanket.",
    "drag-hint": "Tap a snack, or slide it over to our friend.",
    "mode-complete": "What a lovely picnic! You showed how taking away changes the number left.",
    "all-gone": "All shared! Zero snacks are left.",
    "forest-5-2": "Five apples are on the picnic blanket. Squirrel would like two. Give Squirrel two apples.",
    "forest-4-1": "Four strawberries are ready to share. Fox would like one. Give Fox one strawberry.",
    "forest-5-3": "Five crunchy crackers are on the blanket. Bear would like three. Give Bear three crackers.",
    "forest-6-2": "Six grape bunches are at the picnic. Fox would like two. Give Fox two grape bunches.",
    "forest-6-4": "Six little sandwiches are ready. Bear would like four. Give Bear four sandwiches.",
    "practice-3-1": "Three apples. Take away one.",
    "practice-4-2": "Four apples. Take away two.",
    "practice-5-1": "Five apples. Take away one.",
    "practice-5-4": "Five apples. Take away four.",
    "practice-6-3": "Six apples. Take away three.",
    "equation-3-1-2": "Three take away one equals two. Two are left.",
    "equation-4-1-3": "Four take away one equals three. Three are left.",
    "equation-4-2-2": "Four take away two equals two. Two are left.",
    "equation-5-1-4": "Five take away one equals four. Four are left.",
    "equation-5-2-3": "Five take away two equals three. Three are left.",
    "equation-5-3-2": "Five take away three equals two. Two are left.",
    "equation-5-4-1": "Five take away four equals one. One is left.",
    "equation-6-2-4": "Six take away two equals four. Four are left.",
    "equation-6-3-3": "Six take away three equals three. Three are left.",
    "equation-6-4-2": "Six take away four equals two. Two are left.",
}


def normalized(text: str) -> str:
    number_tokens = {
        "zero": "0",
        "one": "1",
        "two": "2",
        "three": "3",
        "four": "4",
        "five": "5",
        "six": "6",
    }
    return " ".join(number_tokens.get(token, token) for token in re.findall(r"[a-z0-9]+", text.lower()))


def duration(path: Path) -> float:
    ffprobe = shutil.which("ffprobe") or "/usr/local/bin/ffprobe"
    run = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True,
        text=True,
    )
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return 0.0


def curl_audio(
    endpoint: str,
    fields: list[str],
    destination: Path,
    timeout: int = 900,
    min_bytes: int = 1000,
) -> bool:
    command = ["curl", "-fSs", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(destination), "--max-time", str(timeout)])
    run = subprocess.run(command, capture_output=True, timeout=timeout + 30)
    return run.returncode == 0 and destination.exists() and destination.stat().st_size >= min_bytes


def synthesize(base: str, voice: Path, key: str, text: str, seed: int) -> tuple[str, int, bool]:
    raw = RAW / f"{key}.flac"
    endpoint = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    ok = curl_audio(endpoint, [f"voice=@{voice}", f"text={text}", f"seed={seed}"], raw)
    if not ok:
        return key, seed, False
    encoded = OUT / f"{key}.m4a"
    ffmpeg = shutil.which("ffmpeg") or "/usr/local/bin/ffmpeg"
    run = subprocess.run(
        [
            ffmpeg,
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(raw),
            "-vn",
            "-af",
            "loudnorm=I=-16:TP=-1.5:LRA=11",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            str(encoded),
        ],
        capture_output=True,
        timeout=180,
    )
    valid = run.returncode == 0 and encoded.exists() and 0.25 < duration(encoded) < 24
    return key, seed, valid


def transcribe(base: str, key: str) -> tuple[str, str]:
    clip = OUT / f"{key}.m4a"
    result = RAW / f"{key}.whisper.json"
    endpoint = f"{base}/workflows/whisper-stt?sync=true"
    ok = curl_audio(
        endpoint,
        [f"audio=@{clip}", "model_size=base", "language=en"],
        result,
        min_bytes=2,
    )
    if not ok:
        return key, ""
    try:
        transcript = str(json.loads(result.read_text()).get("text") or "").strip()
    except (OSError, ValueError):
        transcript = ""
    result.unlink(missing_ok=True)
    return key, transcript


def transcript_ratio(key: str, transcript: str) -> float:
    return round(difflib.SequenceMatcher(None, normalized(LINES[key]), normalized(transcript)).ratio(), 3)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    config = json.loads(LOCAL_CONFIG.read_text())
    base = str(config.get("qwenUrl") or "").rstrip("/")
    voice = Path(str(config.get("teacherVoicePath") or ""))
    if not base:
        raise SystemExit("tools/state/local.json has no qwenUrl")
    if not voice.is_file():
        raise SystemExit("tools/state/local.json has no readable approved teacherVoicePath")
    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)

    previous_lines = {}
    if (OUT / "lines.json").exists():
        previous_lines = json.loads((OUT / "lines.json").read_text())
    todo = []
    for key, text in LINES.items():
        clip = OUT / f"{key}.m4a"
        reusable = clip.exists() and 0.25 < duration(clip) < 24
        if args.force or not reusable or (previous_lines and previous_lines.get(key) != text):
            todo.append((key, text))
    synth_results: dict[str, int] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(synthesize, base, voice, key, text, SEEDS[0]) for key, text in todo]
        for future in concurrent.futures.as_completed(futures):
            key, seed, ok = future.result()
            if ok:
                synth_results[key] = seed
            print(f"tts {key}: {'ok' if ok else 'failed'}", flush=True)

    # TTS batch is complete. Run the separate Whisper batch over every valid clip.
    transcripts: dict[str, str] = {}
    valid_keys = [key for key in LINES if (OUT / f"{key}.m4a").exists()]
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(transcribe, base, key) for key in valid_keys]
        for future in concurrent.futures.as_completed(futures):
            key, heard = future.result()
            transcripts[key] = heard
            print(f"whisper {key}: {transcript_ratio(key, heard):.3f}", flush=True)

    # Retry only materially mismatched clips with the established seed ladder.
    for key in valid_keys:
        ratio = transcript_ratio(key, transcripts.get(key, ""))
        if ratio >= 0.72:
            continue
        for seed in SEEDS[1:]:
            _, _, ok = synthesize(base, voice, key, LINES[key], seed)
            if not ok:
                continue
            _, heard = transcribe(base, key)
            transcripts[key] = heard
            synth_results[key] = seed
            ratio = transcript_ratio(key, heard)
            print(f"retry {key} seed {seed}: {ratio:.3f}", flush=True)
            if ratio >= 0.72:
                break

    manifest: dict[str, dict] = {}
    qa: dict[str, dict] = {}
    failures: list[str] = []
    for key, text in LINES.items():
        clip = OUT / f"{key}.m4a"
        heard = transcripts.get(key, "")
        ratio = transcript_ratio(key, heard)
        passed = clip.exists() and 0.25 < duration(clip) < 24 and ratio >= 0.72
        qa[key] = {
            "intended": text,
            "transcript": heard,
            "similarity": ratio,
            "pass": passed,
            "ttsWorkflow": "qwen3-tts-voiceclone",
            "qaWorkflow": "whisper-stt",
            "seed": synth_results.get(key, SEEDS[0]),
            "voiceReference": "approved-local-teacher-reference",
        }
        if passed:
            manifest[key] = {
                "file": clip.name,
                "dur": duration(clip),
                "textHash": hashlib.sha256(text.encode()).hexdigest()[:16],
            }
        else:
            failures.append(key)
            clip.unlink(missing_ok=True)

    (OUT / "lines.json").write_text(json.dumps(LINES, indent=2, ensure_ascii=False) + "\n")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    print(f"complete: {len(manifest)}/{len(LINES)} Whisper-approved clips", flush=True)
    if failures:
        print("omitted for device-speech fallback: " + ", ".join(failures), flush=True)
        raise SystemExit(1)


if __name__ == "__main__":
    main()
