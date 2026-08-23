#!/usr/bin/env python3
"""Generate and transcript-QA Shadow Chase's recorded teacher narration.

The LAN host swaps large models for TTS and Whisper. This driver therefore
batches every pending TTS candidate for a seed before switching once to
Whisper QA, then retries only rejected lines at the next seed. Host URLs and
machine-local voice paths are deliberately excluded from logs and receipts.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[4]
REPO = ROOT / "qlobe-kids"
GAME = REPO / "games" / "shadow-chase"
OUT = GAME / "assets" / "audio"
RAW = GAME / "assets" / "source" / "voice-raw"
STATE = REPO / "tools" / "state" / "local.json"
FALLBACK_VOICE = REPO / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9)
THRESHOLD = 0.82

SCRIPT = {
    "welcome": "Ready to chase some shadows? Pick a shadow game!",
    "choose-match": "Find a shadow! Look closely, then tap the matching shape.",
    "choose-sun": "Chase the sun! Slide the sun until your shadow matches the picture.",
    "choose-show": "Make a shadow show! Move the sun, or press play to watch a whole day.",
    "match-rabbit": "Which shadow belongs to the rabbit?",
    "match-squirrel": "Which shadow belongs to the squirrel?",
    "match-turtle": "Which shadow belongs to the turtle?",
    "match-fox": "Which shadow belongs to the fox?",
    "match-duck": "Which shadow belongs to the duck?",
    "match-bear": "Which shadow belongs to the bear?",
    "try-again": "Good looking. Try another shadow.",
    "look-closer": "Look at the outside shape. You can find it!",
    "found": "You found it! That shadow fits perfectly.",
    "sun-intro": "Move the sun. Watch the shadow stretch, shrink, and switch sides!",
    "sun-nudge": "Try sliding the big sun along its wooden track.",
    "sun-long": "The sun is low, so the shadow stretches long!",
    "sun-short": "The sun is high, so the shadow tucks in close!",
    "sun-opposite": "You did it! The shadow points away from the sun.",
    "show-intro": "Choose a toy for your shadow show.",
    "show-morning": "Morning sun is low. The shadow stretches away.",
    "show-noon": "At noon, the sun is high. The shadow tucks in close.",
    "show-evening": "Evening sun is low on the other side. The shadow stretches back.",
    "show-complete": "You made a whole day of shadows!",
    "all-done": "Shadow star! You chased every shadow.",
    "idle": "The shadows are waiting. Tap a toy or move the sun.",
}


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + ".tmp")
    temp.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")
    os.replace(temp, path)


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def similarity(intended: str, transcript: str) -> tuple[float, float]:
    wanted = normalize(intended)
    heard = normalize(transcript)
    characters = difflib.SequenceMatcher(None, wanted, heard).ratio()
    tokens = difflib.SequenceMatcher(None, wanted.split(), heard.split()).ratio()
    return characters, tokens


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def duration(path: Path) -> float:
    if not path.is_file():
        return 0.0
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True,
        text=True,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0.0


def readable(path: Path) -> bool:
    try:
        with path.open("rb") as stream:
            return bool(stream.read(1))
    except OSError:
        return False


def local_settings() -> tuple[str, Path]:
    try:
        state = json.loads(STATE.read_text())
    except (OSError, ValueError) as error:
        raise SystemExit(f"cannot read local voice state: {type(error).__name__}") from error
    base = str(state.get("qwenUrl", "")).rstrip("/")
    configured = Path(str(state.get("teacherVoicePath", "")))
    voice_ref = configured if readable(configured) else FALLBACK_VOICE
    if not base or not readable(voice_ref):
        raise SystemExit("local voice state needs a LAN URL and a readable approved voice reference")
    return base, voice_ref


def config_matches_script() -> bool:
    try:
        config_voice = json.loads((GAME / "config.json").read_text()).get("voice", {})
    except (OSError, ValueError):
        return False
    return config_voice == SCRIPT


def generate_tts(base: str, voice_ref: Path, text: str, seed: int, output: Path) -> tuple[bool, str]:
    temp = output.with_suffix(output.suffix + ".tmp")
    temp.unlink(missing_ok=True)
    result = subprocess.run(
        ["curl", "-sS", "-X", "POST", f"{base}/workflows/qwen3-tts-voiceclone?sync=true",
         "-F", f"voice=@{voice_ref}", "-F", f"text={text}", "-F", f"seed={seed}",
         "--output", str(temp), "--max-time", "900"],
        capture_output=True,
        timeout=930,
    )
    if result.returncode != 0:
        temp.unlink(missing_ok=True)
        return False, "tts-request-failed"
    if not temp.is_file() or temp.stat().st_size < 1500 or duration(temp) <= 0.2:
        temp.unlink(missing_ok=True)
        return False, "tts-audio-invalid"
    os.replace(temp, output)
    return True, "candidate-ready"


def encode(source: Path, output: Path) -> tuple[bool, str]:
    temp = output.with_suffix(output.suffix + ".tmp.m4a")
    temp.unlink(missing_ok=True)
    result = subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(source),
         "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-vn", "-c:a", "aac", "-b:a", "96k",
         "-movflags", "+faststart", str(temp)],
        capture_output=True,
        timeout=180,
    )
    if result.returncode or duration(temp) <= 0.2:
        temp.unlink(missing_ok=True)
        return False, "aac-encode-failed"
    os.replace(temp, output)
    return True, "encoded"


def transcribe(base: str, source: Path) -> tuple[str, str]:
    result = subprocess.run(
        ["curl", "-sS", "-X", "POST", f"{base}/workflows/whisper-stt?sync=true",
         "-F", f"audio=@{source}", "-F", "model_size=base", "-F", "language=en",
         "--max-time", "900"],
        capture_output=True,
        timeout=930,
    )
    if result.returncode:
        return "", "whisper-request-failed"
    try:
        payload = json.loads(result.stdout)
    except ValueError:
        return "", "whisper-response-invalid"
    transcript = str(payload.get("text") or payload.get("transcript") or "").strip()
    return transcript, "transcribed" if transcript else "whisper-empty"


def accepted_receipt(key: str, text: str, seed: int, transcript: str,
                     score: float, token_score: float, clip: Path) -> dict[str, object]:
    return {
        "status": "ok",
        "accepted": True,
        "text": text,
        "textHash": text_hash(text),
        "transcript": transcript,
        "similarity": round(score, 3),
        "tokenSimilarity": round(token_score, 3),
        "seed": seed,
        "duration": duration(clip),
        "model": "qwen3-tts-voiceclone",
        "whisper": "base/en",
        "threshold": THRESHOLD,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="+")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    unknown = set(args.only or ()) - set(SCRIPT)
    if unknown:
        parser.error("unknown line: " + ", ".join(sorted(unknown)))
    if not config_matches_script():
        raise SystemExit("config.json voice script does not exactly match the generation script")
    selected = list(args.only or SCRIPT)
    base, voice_ref = local_settings()
    if args.dry_run:
        print(json.dumps({"lines": len(selected), "keys": selected, "seeds": SEEDS,
                          "strategy": "batch TTS by seed, then Whisper QA",
                          "qa": f"whisper base/en >= {THRESHOLD}"}))
        return 0

    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    try:
        qa = json.loads((OUT / "qa.json").read_text())
    except (OSError, ValueError):
        qa = {}
    try:
        manifest = json.loads((OUT / "manifest.json").read_text())
    except (OSError, ValueError):
        manifest = {}

    pending: list[str] = []
    for key in selected:
        clip = OUT / f"{key}.m4a"
        receipt = qa.get(key, {})
        prior_character_score, prior_token_score = similarity(SCRIPT[key], str(receipt.get("transcript", "")))
        valid = (
            not args.force
            and clip.is_file()
            and duration(clip) > 0.2
            and receipt.get("accepted") is True
            and receipt.get("textHash") == text_hash(SCRIPT[key])
            and prior_character_score >= THRESHOLD
            and prior_token_score >= THRESHOLD
        )
        if valid:
            print(f"retain {key}: transcript-approved", flush=True)
            manifest[key] = {
                "file": clip.name,
                "dur": duration(clip),
                "textHash": text_hash(SCRIPT[key]),
                "seed": receipt.get("seed"),
            }
        else:
            pending.append(key)
            qa[key] = {"status": "pending", "accepted": False, "text": SCRIPT[key],
                       "textHash": text_hash(SCRIPT[key]), "attempts": []}
            manifest.pop(key, None)

    for seed in SEEDS:
        if not pending:
            break
        print(f"TTS batch seed {seed}: {len(pending)} line(s)", flush=True)
        generated: dict[str, tuple[bool, str]] = {}
        for key in pending:
            candidate_id = f"{key}-{text_hash(SCRIPT[key])}-seed{seed}"
            raw = RAW / f"{candidate_id}.flac"
            encoded = RAW / f"{candidate_id}.m4a"
            if not args.force and raw.is_file() and duration(raw) > 0.2:
                generated[key] = (True, "candidate-retained")
            else:
                generated[key] = generate_tts(base, voice_ref, SCRIPT[key], seed, raw)
            if generated[key][0] and (args.force or not encoded.is_file() or duration(encoded) <= 0.2):
                generated[key] = encode(raw, encoded)

        print(f"Whisper batch seed {seed}", flush=True)
        still_pending: list[str] = []
        for key in pending:
            candidate_id = f"{key}-{text_hash(SCRIPT[key])}-seed{seed}"
            raw = RAW / f"{candidate_id}.flac"
            encoded = RAW / f"{candidate_id}.m4a"
            ok, reason = generated[key]
            prior_attempts = qa.get(key, {}).get("attempts", [])
            attempt: dict[str, object] = {"seed": seed, "accepted": False, "reason": reason}
            if ok and encoded.is_file() and duration(encoded) > 0.2:
                transcript, whisper_reason = transcribe(base, encoded)
                score, token_score = similarity(SCRIPT[key], transcript)
                attempt.update({"transcript": transcript, "similarity": round(score, 3),
                                "tokenSimilarity": round(token_score, 3),
                                "reason": whisper_reason})
                if transcript and score >= THRESHOLD and token_score >= THRESHOLD:
                    destination = OUT / f"{key}.m4a"
                    temp = destination.with_suffix(".m4a.tmp")
                    temp.write_bytes(encoded.read_bytes())
                    os.replace(temp, destination)
                    qa[key] = accepted_receipt(
                        key, SCRIPT[key], seed, transcript, score, token_score, destination,
                    )
                    qa[key]["attempts"] = [*prior_attempts, {**attempt, "accepted": True}]
                    manifest[key] = {"file": destination.name, "dur": duration(destination),
                                     "textHash": text_hash(SCRIPT[key]), "seed": seed}
                    write_json(OUT / f"{key}.recipe.json", {
                        "format": "qlobe-voice-recipe-v1",
                        "key": key,
                        "text": SCRIPT[key],
                        "workflow": "qwen3-tts-voiceclone",
                        "seed": seed,
                        "encode": "AAC 96k, loudnorm -18 LUFS, +faststart",
                        "qa": {"workflow": "whisper-stt", "model": "base", "language": "en",
                               "transcript": transcript, "similarity": round(score, 3),
                               "tokenSimilarity": round(token_score, 3),
                               "threshold": THRESHOLD, "accepted": True},
                    })
                    print(
                        f"accept {key}: seed {seed}, similarity {score:.3f}/{token_score:.3f}",
                        flush=True,
                    )
                    continue
            qa[key] = {"status": "pending", "accepted": False, "text": SCRIPT[key],
                       "textHash": text_hash(SCRIPT[key]), "attempts": [*prior_attempts, attempt]}
            still_pending.append(key)
            print(f"retry {key}: {attempt['reason']}", flush=True)
        pending = still_pending
        write_json(OUT / "qa.json", qa)
        write_json(OUT / "manifest.json", manifest)

    for key in pending:
        qa[key]["status"] = "FAIL"
        qa[key]["failure"] = "seed-ladder-exhausted"
    write_json(OUT / "lines.json", SCRIPT)
    write_json(OUT / "qa.json", qa)
    write_json(OUT / "manifest.json", manifest)
    if pending:
        print("voice QA failed: " + ", ".join(pending), flush=True)
        return 1
    print(f"voice QA complete: {len(selected)} selected line(s)", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
