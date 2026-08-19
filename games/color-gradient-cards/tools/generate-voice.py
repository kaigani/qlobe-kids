#!/usr/bin/env python3
"""Color Gradient Cards narration: clone every configured line from the platform
teacher-voice reference on the LAN GenAI API, Whisper-QA each clip, and write
the manifest/lines/QA files ``shared/js/voice-clips.js`` reads at runtime.

``config.json`` is the source of truth for spoken text (one ``voice`` block
per scene). This script derives ``assets/audio/lines.json`` from it — do not
hand-edit lines.json.

The endpoint and personal reference path come from flags, environment
variables, or the git-ignored ``tools/state/local.json`` (see
``.claude/skills/local-genai``). They are never written to provenance.
"""
from __future__ import annotations

import argparse
import hashlib
import difflib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
CANDIDATES = GAME / "assets/source/local-api/voice"
CONFIG = GAME / "config.json"
LOCAL_STATE = ROOT / "tools/state/local.json"
SEEDS = [7, 8, 9]


def local_state() -> dict:
    try:
        value = json.loads(LOCAL_STATE.read_text())
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def load_lines() -> dict[str, str]:
    config = json.loads(CONFIG.read_text())
    voice = config.get("voice")
    if not isinstance(voice, dict):
        raise ValueError("config.json voice must be an object")
    return {str(key): str(text) for key, text in voice.items() if str(text).strip()}


def run(command: list[str], *, timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)


def clone(api_base: str, voice_ref: str, text: str, seed: int, dest_flac: Path) -> None:
    result = run(
        [
            "curl", "-sS", "-X", "POST", f"{api_base}/workflows/qwen3-tts-voiceclone?sync=true",
            "-F", f"voice=@{voice_ref}", "-F", f"text={text}", "-F", f"seed={seed}",
            "--output", str(dest_flac), "--max-time", "900",
        ],
        timeout=930,
    )
    if result.returncode != 0 or not dest_flac.is_file() or dest_flac.stat().st_size < 2_000:
        # Curl errors may echo the private LAN host. Keep committed QA useful
        # without leaking endpoint or reference details into provenance.
        reason = f"curl exit {result.returncode}" if result.returncode else "empty audio output"
        raise RuntimeError(f"voiceclone request failed ({reason})")


def encode(src_flac: Path, dest_m4a: Path) -> None:
    result = run(
        [
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(src_flac),
            "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
            "areverse,silenceremove=start_periods=1:start_silence=0.10:"
            "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
            "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1", "-movflags", "+faststart",
            str(dest_m4a),
        ],
        timeout=60,
    )
    if result.returncode != 0 or not dest_m4a.is_file() or dest_m4a.stat().st_size < 2_000:
        raise RuntimeError(f"ffmpeg encode failed (exit {result.returncode})")


def duration(path: Path) -> float:
    result = run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        timeout=30,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except (TypeError, ValueError):
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
         "-af", "volumedetect", "-f", "null", "-"],
        timeout=60,
    )
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def transcript_ok(expected: str, heard: str) -> tuple[bool, float, float]:
    want, got = normalize(expected), normalize(heard)
    ratio = difflib.SequenceMatcher(None, want, got).ratio()
    ww, gw = want.split(), got.split()
    coverage = sum(word in gw for word in ww) / max(1, len(ww))
    # One-word family labels need exact recognition; longer lines allow only
    # a very small Whisper variation while requiring every expected word.
    accepted = want == got or (len(ww) > 1 and ratio >= 0.92 and coverage >= 0.95)
    return accepted, round(ratio, 3), round(coverage, 3)


def transcribe(api_base: str, path: Path, expected: str) -> str:
    # Bias with the expected line itself — an uncommon word ("meadow") can
    # come back garbled from a bare model without this, even when the
    # underlying audio is fine (verified against model_size=small on the
    # same clip before adding this).
    result = run(
        [
            "curl", "-sS", "-X", "POST", f"{api_base}/workflows/whisper-stt?sync=true",
            "-F", f"audio=@{path}", "-F", "model_size=base", "-F", "language=en",
            "-F", f"initial_prompt={expected}",
            "--max-time", "900",
        ],
        timeout=930,
    )
    if result.returncode != 0:
        return ""
    try:
        payload = json.loads(result.stdout)
        return str(payload.get("text") or payload.get("transcript") or "").strip()
    except json.JSONDecodeError:
        return ""


def candidate_paths(key: str, seed: int) -> tuple[Path, Path]:
    stem = f"{key}-seed{seed}"
    return CANDIDATES / f"{stem}.m4a", CANDIDATES / f"{stem}.json"


def generate_candidate(
    api_base: str,
    voice_ref: str,
    key: str,
    text: str,
    seed: int,
    *,
    force: bool,
) -> dict:
    """Generate and preserve one candidate without loading Whisper yet."""
    candidate, sidecar = candidate_paths(key, seed)
    if not force and candidate.is_file() and sidecar.is_file():
        try:
            cached = json.loads(sidecar.read_text(encoding="utf-8"))
            if cached.get("textHash") == text_hash(text) and duration(candidate) >= 0.25:
                return cached
        except (OSError, json.JSONDecodeError):
            pass
    with tempfile.TemporaryDirectory(prefix="gradient-voice-") as folder:
        flac = Path(folder) / f"{key}.flac"
        try:
            clone(api_base, voice_ref, text, seed, flac)
            encode(flac, candidate)
        except RuntimeError as error:
            return {"generated": False, "seed": seed, "error": str(error)}
    record = {
        "engine": "qwen3-tts-voiceclone",
        "voice": "voice_teacher",
        "seed": seed,
        "sourceText": text,
        "textHash": text_hash(text),
        "duration": duration(candidate),
        "meanVolumeDb": mean_volume(candidate),
        "bytes": candidate.stat().st_size,
        "generated": True,
    }
    sidecar.write_text(json.dumps(record, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return record


def check_candidate(api_base: str, key: str, text: str, seed: int) -> dict:
    """Whisper-check an already generated candidate and update its sidecar."""
    candidate, sidecar = candidate_paths(key, seed)
    if not candidate.is_file():
        return {"seed": seed, "valid": False, "error": "candidate missing"}
    seconds = duration(candidate)
    mean_db = mean_volume(candidate)
    transcript = transcribe(api_base, candidate, text)
    match, score, coverage = transcript_ok(text, transcript)
    audio_ok = (
        candidate.stat().st_size >= 2_000
        and 0.35 <= seconds <= 20
        and mean_db is not None and -36 <= mean_db <= -5
    )
    valid = bool(audio_ok and match)
    reason = "accepted" if valid else (
        f"whisper mismatch — got {transcript!r}" if not match
        else f"audio QA failed (dur={seconds}s, db={mean_db})"
    )
    attempt = {
        "seed": seed,
        "valid": valid,
        "transcript": transcript,
        "score": score,
        "coverage": coverage,
        "duration": seconds,
        "meanVolumeDb": mean_db,
        "error": None if valid else reason,
    }
    try:
        provenance = json.loads(sidecar.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        provenance = {"seed": seed, "sourceText": text, "textHash": text_hash(text)}
    provenance.update(attempt)
    sidecar.write_text(json.dumps(provenance, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return attempt


def inspect_existing(key: str, text: str, qa: dict) -> dict | None:
    entry = qa.get(key)
    path = OUT / f"{key}.m4a"
    if not entry or not path.is_file():
        return None
    if entry.get("engine") != "qwen3-tts-voiceclone":
        return None  # migrate any pre-existing macOS-say placeholder clip
    if entry.get("textHash") != text_hash(text):
        return None
    if not entry.get("valid"):
        return None
    return entry


def main() -> int:
    lines = load_lines()
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", action="append", help="restrict to a scene id or a <scene>-<key> line")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--qwen-url", help="LAN GenAI API base URL (else QLOBE_QWEN_URL, else tools/state/local.json)")
    parser.add_argument("--voice-ref", help="path to the teacher-voice reference clip (else QLOBE_VOICE_REF, else tools/state/local.json)")
    args = parser.parse_args()

    state = local_state()
    api_base = (args.qwen_url or os.environ.get("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    voice_ref = args.voice_ref or os.environ.get("QLOBE_VOICE_REF") or state.get("teacherVoicePath") or ""
    if not args.check and (not api_base or not voice_ref):
        sys.exit(
            "LAN endpoint or teacher-voice reference missing: use --qwen-url/--voice-ref, "
            "QLOBE_QWEN_URL/QLOBE_VOICE_REF, or tools/state/local.json (see .claude/skills/local-genai); "
            "--check needs neither."
        )

    reference = Path(voice_ref).expanduser() if voice_ref else None
    if not args.check:
        if not reference or not reference.is_file():
            sys.exit("approved teacher-voice reference is missing")
        for binary in ("curl", "ffmpeg", "ffprobe"):
            if not shutil.which(binary):
                sys.exit(f"required binary is missing: {binary}")

    OUT.mkdir(parents=True, exist_ok=True)
    CANDIDATES.mkdir(parents=True, exist_ok=True)
    previous_qa = {}
    qa_path = OUT / "qa.json"
    if qa_path.exists():
        previous_qa = json.loads(qa_path.read_text())

    def selected(key: str) -> bool:
        if not args.only:
            return True
        return any(
            selector == key
            or key.startswith(f"{selector}-")
            or key.endswith(f"-{selector}")
            for selector in args.only
        )

    selected_keys = [key for key in lines if selected(key)]
    if not selected_keys:
        sys.exit("--only did not match any configured voice key")

    qa = {key: value for key, value in previous_qa.items() if key in lines}
    pending: list[str] = []
    for key in selected_keys:
        text = lines[key]
        existing = None if args.force else inspect_existing(key, text, previous_qa)
        if existing:
            qa[key] = existing
            print(f"{key}: cached", flush=True)
        else:
            pending.append(key)

    if args.check:
        for key in pending:
            qa[key] = {"valid": False, "error": "missing or stale transcript-approved clip"}
            print(f"{key}: FAILED", flush=True)
    else:
        (OUT / "lines.json").write_text(json.dumps(lines, indent=2, ensure_ascii=False) + "\n")

        # Each retry keeps Qwen loaded for the whole remaining batch, then
        # switches once to Whisper for that batch. Seed 8/9 only synthesize
        # lines that failed the previous transcript pass.
        for seed in SEEDS:
            if not pending:
                break
            generated: dict[str, dict] = {}
            print(f"TTS batch seed {seed}: {len(pending)} line(s)", flush=True)
            for key in pending:
                generated[key] = generate_candidate(
                    api_base,
                    str(reference),
                    key,
                    lines[key],
                    seed,
                    force=args.force,
                )
                if not generated[key].get("generated"):
                    print(f"{key}: TTS failed — {generated[key].get('error', 'unknown error')}", flush=True)

            print(f"Whisper batch seed {seed}: {len(pending)} line(s)", flush=True)
            retry: list[str] = []
            for key in pending:
                previous_attempts = [
                    attempt for attempt in qa.get(key, {}).get("attempts", [])
                    if attempt.get("seed") != seed
                ]
                if not generated[key].get("generated"):
                    attempt = {
                        "seed": seed,
                        "valid": False,
                        "error": generated[key].get("error", "candidate generation failed"),
                    }
                else:
                    attempt = check_candidate(api_base, key, lines[key], seed)
                attempts = previous_attempts + [attempt]
                if attempt.get("valid"):
                    candidate, _ = candidate_paths(key, seed)
                    destination = OUT / f"{key}.m4a"
                    shutil.copy2(candidate, destination)
                    qa[key] = {
                        "engine": "qwen3-tts-voiceclone",
                        "voice": "voice_teacher",
                        "seed": seed,
                        "sourceText": lines[key],
                        "textHash": text_hash(lines[key]),
                        "duration": duration(destination),
                        "meanVolumeDb": attempt.get("meanVolumeDb"),
                        "bytes": destination.stat().st_size,
                        "transcript": attempt.get("transcript", ""),
                        "valid": True,
                        "score": attempt.get("score"),
                        "coverage": attempt.get("coverage"),
                        "attempts": attempts,
                    }
                    print(f"{key}: accepted seed {seed} → {attempt.get('transcript', '')}", flush=True)
                else:
                    qa[key] = {
                        "valid": False,
                        "error": attempt.get("error", "candidate rejected"),
                        "sourceText": lines[key],
                        "textHash": text_hash(lines[key]),
                        "attempts": attempts,
                    }
                    retry.append(key)
                    print(f"{key}: retry after seed {seed} — {attempt.get('error', '')}", flush=True)
            pending = retry

    manifest = {
        key: {"file": f"{key}.m4a", "dur": qa[key]["duration"], "textHash": text_hash(text)}
        for key, text in lines.items()
        if (
            qa.get(key, {}).get("valid")
            and qa[key].get("textHash") == text_hash(text)
            and (OUT / f"{key}.m4a").is_file()
        )
    }
    failures = [key for key in lines if key not in manifest]
    selected_failures = [key for key in selected_keys if key not in manifest]

    if not args.check:
        (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")

    print(f"complete: {len(manifest)}/{len(lines)}; failures={failures}")
    return 1 if selected_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
