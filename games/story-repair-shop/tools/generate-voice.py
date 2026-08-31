#!/usr/bin/env python3
"""Resumable, model-batched Qwen narration production with Whisper QA."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
LINES = GAME / "data/lines.json"
OUT = GAME / "assets/audio"
EVIDENCE = GAME / "assets/source/local-api/voice"
STATE = ROOT / "tools/state/local.json"
QA_PATH = EVIDENCE / "qa.json"
SEEDS = (7, 8, 9)
THRESHOLD = 0.94


def readable(path):
    try:
        with Path(path).open("rb") as handle:
            handle.read(1)
        return True
    except OSError:
        return False


def config():
    api = os.getenv("QLOBE_QWEN_URL", "")
    reference = os.getenv("QLOBE_TEACHER_VOICE", "")
    try:
        state = json.loads(STATE.read_text())
    except (OSError, json.JSONDecodeError):
        state = {}
    api = api or state.get("qwenUrl", "")
    reference = reference or state.get("teacherVoicePath", "")
    fallback = ROOT / "shared/assets/refs/voice-teacher.wav"
    if not readable(reference) and readable(fallback):
        reference = str(fallback)
    return str(api).rstrip("/"), str(reference)


def run(command, timeout=900):
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as error:
        return subprocess.CompletedProcess(command, 1, "", str(error))


def normalize(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def duration(path):
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(path),
        ],
        30,
    )
    try:
        value = float(result.stdout.strip())
        return round(value, 3) if result.returncode == 0 and value > 0 else None
    except ValueError:
        return None


def valid_clip(path):
    path = Path(path)
    value = duration(path) if path.is_file() and path.stat().st_size >= 2000 else None
    return value is not None and 0.2 <= value <= 16


def text_hash(text):
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def audio_hash(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def make_candidate(api, reference, key, text, seed, temp_dir):
    raw = temp_dir / f"{key}-{seed}.flac"
    result = run(
        [
            "curl",
            "-sS",
            "-X",
            "POST",
            f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
            "-F",
            f"voice=@{reference}",
            "-F",
            f"text={text}",
            "-F",
            f"seed={seed}",
            "--output",
            str(raw),
            "--max-time",
            "900",
        ]
    )
    if result.returncode or not raw.is_file() or raw.stat().st_size < 2000:
        return None
    encoded = temp_dir / f"{key}-{seed}.m4a"
    result = run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(raw),
            "-af",
            "loudnorm=I=-18:TP=-2:LRA=9",
            "-ac",
            "1",
            "-ar",
            "48000",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-movflags",
            "+faststart",
            str(encoded),
        ],
        90,
    )
    if result.returncode or not valid_clip(encoded):
        return None
    return encoded


def verify_candidate(api, clip, intended):
    """Return transcript and similarity; retry one transport failure in-place."""
    for attempt in range(2):
        result = run(
            [
                "curl",
                "-sS",
                "-X",
                "POST",
                f"{api}/workflows/whisper-stt?sync=true",
                "-F",
                f"audio=@{clip}",
                "-F",
                "model_size=base",
                "-F",
                "language=en",
                "-F",
                f"initial_prompt={intended}",
                "--max-time",
                "900",
            ]
        )
        try:
            heard = str(json.loads(result.stdout).get("text", ""))
        except (json.JSONDecodeError, AttributeError):
            heard = ""
        if result.returncode == 0 and heard:
            ratio = difflib.SequenceMatcher(
                None, normalize(intended), normalize(heard)
            ).ratio()
            return heard, round(ratio, 3), True
        if attempt == 0:
            print("  Whisper transport retry", flush=True)
    return "", 0.0, False


def load_qa():
    try:
        loaded = json.loads(QA_PATH.read_text())
        return loaded if isinstance(loaded, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_qa(qa):
    QA_PATH.write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")


def relative(path):
    return str(Path(path).relative_to(ROOT))


def matching_evidence_seed(key, destination):
    if not destination.is_file():
        return "existing"
    destination_hash = audio_hash(destination)
    for seed in SEEDS:
        candidate = EVIDENCE / f"{key}-seed{seed}.m4a"
        if candidate.is_file() and audio_hash(candidate) == destination_hash:
            return seed
    return "existing"


def accepted_receipt(qa, key, intended, destination):
    """Return QA evidence bound to the exact final bytes, never just a filename."""
    if not valid_clip(destination):
        return None
    expected = text_hash(intended)
    final_hash = audio_hash(destination)
    for entry in reversed(qa.get(key, [])):
        if entry.get("status") != "accepted" or entry.get("textHash") != expected:
            continue
        if entry.get("audioHash") == final_hash:
            return entry
    return None


def upgrade_legacy_receipts(qa, lines):
    """Bind interrupted-run accepted evidence to audio bytes without redoing QA."""
    changed = False
    for key, intended in lines.items():
        destination = OUT / f"{key}.m4a"
        if not valid_clip(destination):
            continue
        final_hash = audio_hash(destination)
        for entry in qa.get(key, []):
            if (
                entry.get("status") != "accepted"
                or entry.get("textHash") != text_hash(intended)
                or entry.get("audioHash")
            ):
                continue
            try:
                candidate = ROOT / entry["candidate"]
            except (KeyError, TypeError):
                continue
            if valid_clip(candidate) and audio_hash(candidate) == final_hash:
                entry["audioHash"] = final_hash
                changed = True
    return changed


def append_qa(qa, key, entry):
    qa.setdefault(key, []).append(entry)
    save_qa(qa)


def build_manifest(lines, qa):
    entries = {}
    for key, text in lines.items():
        path = OUT / f"{key}.m4a"
        receipt = accepted_receipt(qa, key, text, path)
        clip_duration = duration(path) if receipt else None
        if clip_duration is not None:
            entries[key] = {
                "file": path.name,
                "textHash": text_hash(text),
                "audioHash": receipt["audioHash"][:16],
                "dur": clip_duration,
            }
    version_source = "\n".join(
        f"{key}:{entry['textHash']}:{hashlib.sha256((OUT / entry['file']).read_bytes()).hexdigest()}"
        for key, entry in sorted(entries.items())
    )
    manifest = {
        "_v": hashlib.sha256(version_source.encode()).hexdigest()[:12],
        **entries,
    }
    (OUT / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
    )
    return manifest


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("command", nargs="?", choices=("plan", "execute"), default="plan")
    parser.add_argument("--only", nargs="*")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    try:
        lines = json.loads(LINES.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise SystemExit(f"cannot read lines.json: {error}")
    chosen = {key: value for key, value in lines.items() if not args.only or key in args.only}
    if not chosen:
        raise SystemExit("no matching line IDs")

    api, reference = config()
    if args.command == "plan":
        print(
            "mode: plan\n"
            f"lines: {len(chosen)}\n"
            f"output: assets/audio/{len(chosen)} clips\n"
            "order: batch TTS by seed, then batch Whisper QA\n"
            "evidence: assets/source/local-api/voice\n"
            + (
                "execute: ready"
                if api and readable(reference)
                else "execute: unavailable until local Qwen URL and teacher voice are configured"
            )
        )
        return 0
    if not api or not readable(reference):
        raise SystemExit("Qwen API or teacher voice configuration unavailable")

    OUT.mkdir(parents=True, exist_ok=True)
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    (OUT / "lines.json").write_text(json.dumps(lines, indent=2, ensure_ascii=False) + "\n")
    qa = {} if args.force else load_qa()
    if args.force:
        save_qa(qa)
    elif upgrade_legacy_receipts(qa, lines):
        save_qa(qa)

    pending = {
        key
        for key, intended in chosen.items()
        if args.force or not accepted_receipt(qa, key, intended, OUT / f"{key}.m4a")
    }
    print(
        f"voice batch: {len(chosen) - len(pending)} verified, {len(pending)} pending",
        flush=True,
    )

    with tempfile.TemporaryDirectory(prefix="story-repair-voice-") as temp:
        temp_dir = Path(temp)
        safe_reference = temp_dir / "teacher-reference.wav"
        shutil.copy2(reference, safe_reference)

        # Accepted runtime clips from an interrupted legacy run may predate the
        # incremental QA file. Re-verify them without regenerating their audio.
        existing = {
            key: (matching_evidence_seed(key, OUT / f"{key}.m4a"), OUT / f"{key}.m4a")
            for key in pending
            if not args.force and valid_clip(OUT / f"{key}.m4a")
        }

        for seed in SEEDS:
            if not pending:
                break
            candidates = {key: value for key, value in existing.items() if key in pending}
            existing.clear()

            # One model family at a time: create every needed candidate before
            # asking the LAN host to switch to Whisper.
            need_tts = [key for key in chosen if key in pending and key not in candidates]
            if need_tts:
                print(f"TTS seed {seed}: {len(need_tts)} candidate(s)", flush=True)
            for index, key in enumerate(need_tts, 1):
                intended = chosen[key]
                evidence = EVIDENCE / f"{key}-seed{seed}.m4a"
                if not args.force and valid_clip(evidence):
                    candidates[key] = (seed, evidence)
                    print(f"  {index}/{len(need_tts)} {key}: reuse evidence", flush=True)
                    continue
                generated = make_candidate(
                    api, str(safe_reference), key, intended, seed, temp_dir
                )
                if not generated:
                    append_qa(
                        qa,
                        key,
                        {
                            "seed": seed,
                            "textHash": text_hash(intended),
                            "status": "tts-or-encode-failed",
                        },
                    )
                    print(f"  {index}/{len(need_tts)} {key}: generation failed", flush=True)
                    continue
                shutil.copy2(generated, evidence)
                candidates[key] = (seed, evidence)
                print(f"  {index}/{len(need_tts)} {key}: generated", flush=True)

            if candidates:
                print(f"Whisper QA: {len(candidates)} candidate(s)", flush=True)
            ordered_candidates = [key for key in chosen if key in candidates]
            for index, key in enumerate(ordered_candidates, 1):
                intended = chosen[key]
                candidate_seed, candidate = candidates[key]
                clip_duration = duration(candidate)
                heard, ratio, transport_ok = verify_candidate(api, candidate, intended)
                accepted = (
                    transport_ok
                    and ratio >= THRESHOLD
                    and clip_duration is not None
                    and 0.2 <= clip_duration <= 16
                )
                entry = {
                    "seed": candidate_seed,
                    "textHash": text_hash(intended),
                    "intended": intended,
                    "transcript": heard,
                    "ratio": ratio,
                    "duration": clip_duration,
                    "status": "accepted" if accepted else (
                        "whisper-transport-failed" if not transport_ok else "rejected"
                    ),
                    "candidate": relative(candidate),
                }
                if accepted:
                    entry["audioHash"] = audio_hash(candidate)
                append_qa(qa, key, entry)
                if accepted:
                    destination = OUT / f"{key}.m4a"
                    if candidate.resolve() != destination.resolve():
                        shutil.copy2(candidate, destination)
                    pending.discard(key)
                print(
                    f"  {index}/{len(ordered_candidates)} {key}: {entry['status']} ({ratio:.3f})",
                    flush=True,
                )

    if pending:
        raise SystemExit(
            f"Whisper QA failed for {', '.join(sorted(pending))} (threshold {THRESHOLD})"
        )
    manifest = build_manifest(lines, qa)
    missing = [key for key in chosen if key not in manifest]
    if missing:
        raise SystemExit("missing accepted lines: " + ", ".join(missing))
    if not args.only:
        unverified = [key for key in lines if key not in manifest]
        if unverified:
            raise SystemExit("release manifest is incomplete: " + ", ".join(unverified))
    print(f"accepted: {len(chosen)} clips", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
