#!/usr/bin/env python3
"""Produce Land Explorer teacher-voice clips with transcript QA.

This authoring-time tool uploads the configured teacher reference and game text
to qwen3-tts-voiceclone, batches every requested TTS candidate before switching
to Whisper, verifies the final AAC candidates, and omits rejected lines from the
runtime manifest so exact device speech remains the fallback.

The endpoint and personal reference path come from flags, environment variables,
or the git-ignored tools/state/local.json. They are never written to provenance.
Run only after explicit approval for those uploads.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUTPUT = GAME / "assets" / "audio"
RAW = GAME / "assets" / "source" / "local-api" / "voice"
LINES_PATH = OUTPUT / "lines.json"
LOCAL_STATE = ROOT / "tools" / "state" / "local.json"
DEFAULT_SEEDS = (7, 8, 9)


def normalized(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


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


def local_state() -> dict:
    try:
        value = json.loads(LOCAL_STATE.read_text())
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def upload(endpoint: str, fields: list[str], output: Path, *, timeout: int = 930, min_size: int = 1) -> bool:
    output.parent.mkdir(parents=True, exist_ok=True)
    command = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(output), "--max-time", str(timeout - 30)])
    result = subprocess.run(command, capture_output=True, timeout=timeout, check=False)
    return result.returncode == 0 and output.exists() and output.stat().st_size >= min_size


def encode(source: Path, destination: Path) -> bool:
    result = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(source), "-vn",
         "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
         "areverse,silenceremove=start_periods=1:start_silence=0.10:"
         "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
         "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
         "-movflags", "+faststart", str(destination)],
        capture_output=True, timeout=180, check=False,
    )
    return result.returncode == 0 and destination.exists() and duration(destination) >= .25


def transcript(path: Path) -> str:
    try:
        payload = json.loads(path.read_text())
        return str(payload.get("text") or payload.get("transcript") or "").strip()
    except (FileNotFoundError, json.JSONDecodeError):
        return ""


def transcript_score(wanted: str, heard: str) -> tuple[bool, float, float]:
    want = normalized(wanted)
    got = normalized(heard)
    ratio = difflib.SequenceMatcher(None, want, got).ratio()
    want_words = want.split()
    got_words = got.split()
    coverage = sum(1 for word in want_words if word in got_words) / max(1, len(want_words))
    # Color/shape labels must be exact. Longer child instructions may differ
    # only in harmless punctuation or repeated filler, never in action words.
    same_letters = got.replace(" ", "") == want.replace(" ", "")
    critical = {"island", "lake", "peninsula", "bay", "archipelago", "pour", "scoop", "shoreline"}
    required = {word for word in want_words if word in critical}
    accepted = (got == want if len(want_words) <= 3 else (same_letters or ratio >= .92 and coverage >= .95)) and required.issubset(set(got_words))
    return accepted, round(ratio, 3), round(coverage, 3)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--voice-ref")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--seeds", type=int, nargs="+", default=list(DEFAULT_SEEDS))
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    state = local_state()
    base = (args.qwen_url or os.environ.get("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    reference_value = args.voice_ref or os.environ.get("QLOBE_VOICE_REF") or state.get("teacherVoicePath") or str(ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav")
    reference = Path(reference_value).expanduser() if reference_value else None
    if not base:
        raise SystemExit("Qwen endpoint missing: use --qwen-url, QLOBE_QWEN_URL, or tools/state/local.json")
    if not reference or not reference.is_file():
        raise SystemExit("approved teacher voice reference is missing")
    for binary in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(binary):
            raise SystemExit(f"required binary is missing: {binary}")

    lines = json.loads(LINES_PATH.read_text())
    config_lines = json.loads((GAME / "config.json").read_text()).get("voice", {})
    if lines != config_lines:
        raise SystemExit("assets/audio/lines.json must exactly match config.json voice before generation")
    keys = args.only or list(lines)
    unknown = [key for key in keys if key not in lines]
    if unknown:
        raise SystemExit(f"unknown voice key(s): {', '.join(unknown)}")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    manifest_path = OUTPUT / "manifest.json"
    qa_path = OUTPUT / "qa.json"
    try:
        previous_manifest = json.loads(manifest_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        previous_manifest = {}
    try:
        qa = json.loads(qa_path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        qa = {}

    retained = set()
    if not args.force:
        for key in keys:
            clip = OUTPUT / f"{key}.m4a"
            qa_matches = (
                qa.get(key, {}).get("accepted") is True
                and any(
                    attempt.get("accepted") is True and attempt.get("wanted") == lines[key]
                    for attempt in qa.get(key, {}).get("attempts", [])
                )
            )
            if (clip.exists() and duration(clip) >= .25
                    and qa_matches
                    and (
                        previous_manifest.get(key, {}).get("textHash") == text_hash(lines[key])
                        or key not in previous_manifest
                    )):
                retained.add(key)
    pending = [key for key in keys if key not in retained]
    if retained:
        print(f"retained {len(retained)} transcript-approved clip(s)", flush=True)

    tts_endpoint = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper_endpoint = f"{base}/workflows/whisper-stt?sync=true"

    # Phase 1: every TTS candidate first. This avoids model thrashing on the
    # local host even though most lines usually pass at seed 7.
    for seed in args.seeds:
        for key in pending:
            raw = RAW / f"{key}-seed{seed}.flac"
            candidate = RAW / f"{key}-seed{seed}.m4a"
            if not args.force and candidate.exists() and duration(candidate) >= .25:
                continue
            print(f"{key}: TTS seed {seed}", flush=True)
            if args.force or not raw.exists() or raw.stat().st_size < 1500:
                if not upload(
                    tts_endpoint,
                    [f"voice=@{reference}", f"text={lines[key]}", f"seed={seed}"],
                    raw,
                    min_size=1500,
                ):
                    print(f"{key}: TTS failed at seed {seed}", flush=True)
                    continue
            if not encode(raw, candidate):
                print(f"{key}: AAC encode failed at seed {seed}", flush=True)

    # Phase 2: Whisper-check final encoded candidates in seed order.
    accepted_manifest = {
        key: value for key, value in previous_manifest.items()
        if (
            key in lines
            and key not in keys
            and value.get("textHash") == text_hash(lines[key])
            and qa.get(key, {}).get("accepted") is True
            and (OUTPUT / value.get("file", "")).is_file()
        )
    }
    for key in retained:
        clip = OUTPUT / f"{key}.m4a"
        accepted_manifest[key] = {
            "file": clip.name,
            "dur": duration(clip),
            "textHash": text_hash(lines[key]),
            "seed": qa[key].get("acceptedSeed"),
        }
    for key in pending:
        # Keep earlier rejected-seed evidence when a targeted retry adds new
        # candidates. Re-running the same seed replaces that seed's evidence
        # instead of duplicating it.
        attempts = [
            attempt for attempt in qa.get(key, {}).get("attempts", [])
            if attempt.get("seed") not in args.seeds
        ]
        accepted_seed = None
        for seed in args.seeds:
            candidate = RAW / f"{key}-seed{seed}.m4a"
            if not candidate.exists() or duration(candidate) < .25:
                attempts.append({"seed": seed, "accepted": False, "reason": "candidate missing"})
                continue
            transcript_file = RAW / f"{key}-seed{seed}-transcript.json"
            print(f"{key}: Whisper QA seed {seed}", flush=True)
            ok = upload(
                whisper_endpoint,
                [f"audio=@{candidate}", "model_size=base", "language=en",
                 "initial_prompt=Land Explorer. Island, lake, peninsula, bay, archipelago. Pour, scoop, shoreline."],
                transcript_file,
            )
            heard = transcript(transcript_file) if ok else ""
            accepted, score, coverage = transcript_score(lines[key], heard)
            attempts.append({
                "seed": seed,
                "accepted": accepted,
                "score": score,
                "coverage": coverage,
                "wanted": lines[key],
                "transcript": heard,
                "duration": duration(candidate),
            })
            print(f"{key}: {'accepted' if accepted else 'retry'} {score:.3f} → {heard}", flush=True)
            if accepted:
                final = OUTPUT / f"{key}.m4a"
                shutil.copy2(candidate, final)
                accepted_seed = seed
                accepted_manifest[key] = {
                    "file": final.name,
                    "dur": duration(final),
                    "textHash": text_hash(lines[key]),
                    "seed": seed,
                }
                (OUTPUT / f"{key}.m4a.recipe.json").write_text(json.dumps({
                    "recipeVersion": "qlobe-recipe-v1", "file": final.name,
                    "workflow": "qwen3-tts-voiceclone", "text": lines[key], "textHash": text_hash(lines[key]),
                    "seed": seed, "encoding": {"codec": "aac", "container": "m4a", "sampleRate": 24000, "channels": 1, "bitrate": 96000},
                    "whisper": {"language": "en", "score": score, "coverage": coverage, "transcript": heard},
                    "teacherReference": "shared/assets/refs/voice-teacher.wav"
                }, indent=2) + "\n")
                break
        qa[key] = {
            "accepted": accepted_seed is not None,
            "acceptedSeed": accepted_seed,
            "attempts": attempts,
        }
        if accepted_seed is None:
            accepted_manifest.pop(key, None)
            rejected = OUTPUT / f"{key}.m4a"
            if rejected.exists():
                rejected.unlink()
            print(f"{key}: rejected; exact device-speech fallback remains active", flush=True)

    manifest_path.write_text(json.dumps(accepted_manifest, indent=2, ensure_ascii=False) + "\n")
    qa_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    failures = [key for key in keys if key not in accepted_manifest]
    print(f"voice complete: {len(accepted_manifest)}/{len(lines)} accepted; failures={failures}", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
