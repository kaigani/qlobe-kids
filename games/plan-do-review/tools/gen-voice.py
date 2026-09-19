#!/usr/bin/env python3
"""Produce Barnaby narration with the approved local voice-clone pipeline.

Qwen3 voice clone -> Whisper-small equality QA -> AAC/M4A at 64 kbps. A failed
or mismatched take is never shipped; voice-clips.js then uses Web Speech for
that exact line. The script is resumable and does not commit a LAN hostname.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
RAW = GAME / "assets" / "source" / "voice"
OUT = GAME / "assets" / "audio"
DATA = GAME / "data"
LOCAL_STATE = ROOT / "tools" / "state" / "local.json"
DEFAULT_REF = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9)

LINES = {
    "intro": "Hi, friend! Let's make an awesome plan.",
    "plan-prompt": "First, make a plan. What would you like to do?",
    "plan-tower": "You planned to build a tower. Let's do it!",
    "plan-garden": "You planned to grow a garden. Let's do it!",
    "plan-picnic": "You planned to pack a picnic. Let's do it!",
    "do-prompt": "Now do your plan. Put each cozy piece where it belongs.",
    "do-nudge": "Almost! Look for the matching cozy outline.",
    "do-complete": "You did it! You followed your plan.",
    "feeling-prompt": "You did your plan. How did it feel?",
    "feeling-happy": "Happy! Your work brought a smile.",
    "feeling-proud": "Proud! You kept going and finished.",
    "feeling-challenged": "Challenged! Tricky work helps your brain grow.",
    "feeling-calm": "Calm! You found your steady feeling.",
    "skill-prompt": "What helped you do it?",
    "skill-patience": "Patience helped you take your time.",
    "skill-problem-solving": "Problem solving helped you find a way.",
    "skill-creativity": "Creativity helped you make it your way.",
    "reward": "Plan, do, review! You made your day awesome.",
    "again": "Let's make another awesome plan!",
}


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"))
    parser.add_argument("--voice-ref", type=Path, default=Path(os.environ.get("QLOBE_VOICE_REF", DEFAULT_REF)))
    parser.add_argument("--max-time", type=int, default=900)
    return parser.parse_args()


def local_api_url() -> str | None:
    try:
        state = json.loads(LOCAL_STATE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return state.get("qwenUrl") or state.get("qwen_url") or state.get("QLOBE_QWEN_URL")


def normalized(text: str) -> str:
    return re.sub(r"[^a-z0-9]", "", text.lower())


def clone(api: str, reference: Path, text: str, seed: int, destination: Path, timeout: int) -> tuple[bool, str]:
    destination.unlink(missing_ok=True)
    run = subprocess.run(
        [
            "curl", "-fsS", "-X", "POST",
            f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
            "-F", f"voice=@{reference}",
            "-F", f"text={text}",
            "-F", f"seed={seed}",
            "--max-time", str(timeout),
            "--output", str(destination),
        ],
        capture_output=True,
        text=True,
    )
    valid = run.returncode == 0 and destination.is_file() and destination.stat().st_size > 5000
    if not valid:
        destination.unlink(missing_ok=True)
    return valid, (run.stderr or "workflow returned no usable audio").strip()


def transcribe(api: str, audio: Path, timeout: int) -> tuple[str, str]:
    run = subprocess.run(
        [
            "curl", "-fsS", "-X", "POST",
            f"{api}/workflows/whisper-stt?sync=true",
            "-F", f"audio=@{audio}",
            "-F", "model_size=small",
            "-F", "language=en",
            "-F", "temperature=0",
            "--max-time", str(min(timeout, 300)),
        ],
        capture_output=True,
        text=True,
    )
    if run.returncode:
        return "", (run.stderr or "Whisper request failed").strip()
    try:
        payload = json.loads(run.stdout)
        return str(payload.get("text") or payload.get("transcript") or "").strip(), ""
    except json.JSONDecodeError:
        return run.stdout.strip(), ""


def duration(file: Path) -> float | None:
    run = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", str(file)],
        capture_output=True,
        text=True,
    )
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return None


def write_json(file: Path, value: object) -> None:
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def main() -> int:
    args = arguments()
    api = (args.api_url or local_api_url() or "").rstrip("/")
    if not api:
        raise SystemExit("Set QLOBE_QWEN_URL, pass --api-url, or configure tools/state/local.json")
    if not args.voice_ref.is_file():
        raise SystemExit(f"Voice reference not found: {args.voice_ref}")

    RAW.mkdir(parents=True, exist_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    DATA.mkdir(parents=True, exist_ok=True)
    qa_file = RAW / "qa-transcripts.json"
    receipt_file = RAW / "generation-attempt.json"
    try:
        qa = json.loads(qa_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        qa = {}

    failures: dict[str, str] = {}
    for key, text in LINES.items():
        m4a = OUT / f"{key}.m4a"
        if m4a.is_file() and qa.get(key, {}).get("pass"):
            print(f"skip {key}", flush=True)
            continue
        accepted = False
        for seed in SEEDS:
            flac = RAW / f"{key}-s{seed}.flac"
            if not (flac.is_file() and flac.stat().st_size > 5000):
                ok, error = clone(api, args.voice_ref, text, seed, flac, args.max_time)
                if not ok:
                    failures[key] = error
                    continue
            heard, error = transcribe(api, flac, args.max_time)
            passed = bool(heard) and normalized(heard) == normalized(text)
            qa[key] = {"seed": seed, "intended": text, "heard": heard, "pass": passed}
            write_json(qa_file, qa)
            if error:
                failures[key] = error
            if not passed:
                print(f"mismatch {key} seed {seed}: {heard!r}", flush=True)
                continue
            subprocess.run(
                ["ffmpeg", "-y", "-v", "quiet", "-i", str(flac), "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(m4a)],
                check=True,
            )
            accepted = True
            failures.pop(key, None)
            print(f"done {key} seed {seed} ({duration(m4a)}s)", flush=True)
            break
        if not accepted:
            print(f"fallback {key}: no Whisper-verified take", flush=True)

    manifest = {
        key: {"file": f"{key}.m4a", "dur": duration(OUT / f"{key}.m4a")}
        for key in LINES
        if (OUT / f"{key}.m4a").is_file() and qa.get(key, {}).get("pass")
    }
    write_json(OUT / "manifest.json", manifest)
    write_json(DATA / "lines.json", {key: {"text": text} for key, text in LINES.items()})
    write_json(
        receipt_file,
        {
            "workflows": ["qwen3-tts-voiceclone", "whisper-stt"],
            "reference": str(args.voice_ref.relative_to(ROOT)).replace("\\", "/"),
            "seeds": list(SEEDS),
            "requested": len(LINES),
            "accepted": len(manifest),
            "failedKeys": sorted(failures),
            "errorSummary": "Local wrapper callback failed before inference" if failures and not manifest else None,
        },
    )
    print(f"VOICE DONE — {len(manifest)}/{len(LINES)} verified clips shipped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
