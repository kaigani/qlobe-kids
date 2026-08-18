#!/usr/bin/env python3
"""Generate and Whisper-QA every Mountain Seasons Wheel narration clip.

Text-only Qwen voice design is the safe default. Optional identity cloning is
explicitly gated because it uploads the selected reference WAV. Endpoint and
local reference paths are never written to repository metadata.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
AUDIO = GAME / "assets/audio"
LINES_PATH = GAME / "data/lines.json"
SEEDS = (7, 8, 9)
RELEASE_WHISPER_MODEL = "medium"
TRANSCRIPT_ALIAS_RULE = "juni-orthography-v1"
APPROVED_TRANSCRIPT_ALIASES = (("junie", "juni"),)
DEFAULT_INSTRUCTION = (
    "A warm, calm preschool teacher with a gentle smile in her voice, "
    "clear American English, unhurried pace, natural and encouraging, never sing-song."
)
APPROVED_INSTRUCTION_HASH = hashlib.sha256(DEFAULT_INSTRUCTION.encode()).hexdigest()[:16]


def run(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout.decode(errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
        stderr = error.stderr.decode(errors="replace") if isinstance(error.stderr, bytes) else (error.stderr or "")
        return subprocess.CompletedProcess(command, 124, stdout, f"{stderr}\ncommand timed out".strip())
    except OSError as error:
        return subprocess.CompletedProcess(command, 127, "", f"command could not start: {error}")


def normalize(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def canonicalize_transcript(value: str) -> str:
    for heard, source in APPROVED_TRANSCRIPT_ALIASES:
        value = re.sub(rf"\b{re.escape(heard)}\b", source, value, flags=re.IGNORECASE)
    return value


def normalize_transcript(value: str) -> str:
    return normalize(canonicalize_transcript(value))


def applied_transcript_aliases(value: str) -> list[str]:
    return [
        f"{heard}->{source}"
        for heard, source in APPROVED_TRANSCRIPT_ALIASES
        if re.search(rf"\b{re.escape(heard)}\b", value, flags=re.IGNORECASE)
    ]


def redact(value: str) -> str:
    value = re.sub(r"https?://[^\s'\"<>]+", "[configured service]", value)
    value = re.sub(r"(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?", "[configured service]", value)
    value = re.sub(r"\[[0-9a-fA-F:]+\](?::\d+)?", "[configured service]", value)
    return value


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def write_json(path: Path, payload: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def duration(path: Path) -> float:
    result = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", str(path),
    ], 30)
    try:
        return round(float(result.stdout.strip()), 3) if result.returncode == 0 else 0.0
    except ValueError:
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "volumedetect", "-f", "null", "-",
    ], 60)
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def request_json(command: list[str], timeout: int) -> tuple[dict | None, str]:
    result = run(command, timeout)
    if result.returncode:
        return None, f"request failed (curl rc={result.returncode})"
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None, "service returned invalid JSON"
    return payload if isinstance(payload, dict) else None, "service returned a non-object response"


def generate_design_raw(api: str, instruction: str, text: str, seed: int, raw: Path) -> str:
    payload, error = request_json([
        "curl", "--fail-with-body", "-sS", "-X", "POST",
        f"{api}/workflows/qwen3-tts-voicedesign",
        "-F", f"instruct={instruction}",
        "-F", f"text={text}",
        "-F", f"seed={seed}",
        "--max-time", "180",
    ], 190)
    if payload is None:
        return error
    job_id = payload.get("job_id") or payload.get("id")
    if not job_id:
        return "voice-design response did not include a job id"

    deadline = time.monotonic() + 900
    transient_failures = 0
    while time.monotonic() < deadline:
        status, status_error = request_json([
            "curl", "--fail-with-body", "-sS", f"{api}/jobs/{job_id}", "--max-time", "60",
        ], 70)
        if status is None:
            transient_failures += 1
            if transient_failures <= 3:
                time.sleep(2 * transient_failures)
                continue
            return status_error
        transient_failures = 0
        state = status.get("status")
        if state == "completed":
            break
        if state in {"failed", "cancelled", "error"}:
            return f"voice-design job {state}"
        if state not in {"pending", "running"}:
            return f"voice-design job returned unknown state {state!r}"
        time.sleep(2)
    else:
        return "voice-design job timed out"

    result = run([
        "curl", "--fail-with-body", "-sS",
        f"{api}/jobs/{job_id}/result?output=output0",
        "--output", str(raw), "--max-time", "300",
    ], 310)
    if result.returncode or not raw.is_file() or raw.stat().st_size < 2_000:
        return f"voice-design result download failed (curl rc={result.returncode})"
    return ""


def synthesize(
    api: str,
    engine: str,
    reference: str,
    instruction: str,
    key: str,
    text: str,
    seed: int,
    stage: Path,
) -> tuple[str, Path | None, str]:
    raw = stage / f"{key}-{seed}.flac"
    encoded = stage / f"{key}-{seed}.m4a"
    if engine == "design":
        error = generate_design_raw(api, instruction, text, seed, raw)
        if error:
            return key, None, f"seed {seed}: synthesis failed ({error})"
    else:
        result = run([
            "curl", "--fail-with-body", "-sS", "-X", "POST",
            f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
            "-F", f"voice=@{reference}",
            "-F", f"text={text}",
            "-F", f"seed={seed}",
            "--output", str(raw),
            "--max-time", "900",
        ], 930)
        if result.returncode or not raw.is_file() or raw.stat().st_size < 2_000:
            size = raw.stat().st_size if raw.is_file() else 0
            return key, None, f"seed {seed}: synthesis failed (curl rc={result.returncode}, bytes={size})"

    encode = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
        "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-ac", "1", "-ar", "48000",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded),
    ], 90)
    if encode.returncode or not encoded.is_file() or encoded.stat().st_size < 2_000:
        return key, None, f"seed {seed}: AAC encode failed"
    return key, encoded, ""


def transcribe(
    api: str,
    key: str,
    text: str,
    seed: int,
    encoded: Path,
    whisper_model: str,
) -> tuple[str, dict | None, str]:
    result = run([
        "curl", "--fail-with-body", "-sS", "-X", "POST",
        f"{api}/workflows/whisper-stt?sync=true",
        "-F", f"audio=@{encoded}",
        "-F", f"model_size={whisper_model}",
        "-F", "language=en",
        "--max-time", "900",
    ], 930)
    try:
        transcript = str(json.loads(result.stdout).get("text", "")).strip()
    except (json.JSONDecodeError, AttributeError):
        transcript = ""

    clip_duration = duration(encoded)
    volume = mean_volume(encoded)
    exact = normalize_transcript(transcript) == normalize(text)
    audio_ok = (
        encoded.stat().st_size >= 2_000
        and 0.35 <= clip_duration <= 20
        and volume is not None
        and -36 <= volume <= -5
    )
    if result.returncode or not exact or not audio_ok:
        return key, None, (
            f"seed {seed}: transcript {transcript!r}; duration={clip_duration}s "
            f"mean={volume}dB; whisper rc={result.returncode}"
        )

    return key, {
        "valid": True,
        "seed": seed,
        "sourceText": text,
        "textHash": text_hash(text),
        "transcript": transcript,
        "normalizedTranscript": normalize_transcript(transcript),
        "normalizedSource": normalize(text),
        "transcriptionPrompt": "none",
        "promptUsed": False,
        "whisperWorkflow": "whisper-stt",
        "whisperModel": whisper_model,
        "whisperLanguage": "en",
        "transcriptAliasRule": TRANSCRIPT_ALIAS_RULE,
        "appliedTranscriptAliases": applied_transcript_aliases(transcript),
        "duration": clip_duration,
        "meanVolumeDb": volume,
        "bytes": encoded.stat().st_size,
        "sha256": file_hash(encoded),
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }, ""


def local_check(lines: dict[str, str]) -> int:
    try:
        manifest = json.loads((AUDIO / "manifest.json").read_text())
        qa = json.loads((AUDIO / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError) as error:
        print(f"voice check failed: {error}", file=sys.stderr)
        return 1

    problems: list[str] = []
    alias_fixtures = (
        ("Dress Junie", "Dress Juni", True),
        ("Shade Junie's face", "Shade Juni's face", True),
        ("Dress Julie", "Dress Juni", False),
        ("Dress Johnny", "Dress Juni", False),
        ("Looping flowers", "Lupine flowers", False),
    )
    if any((normalize_transcript(heard) == normalize(source)) is not expected for heard, source, expected in alias_fixtures):
        problems.append("transcript alias policy fixtures failed")
    if set(manifest) != set(lines):
        problems.append(f"manifest covers {len(manifest)}/{len(lines)} lines")
    for key, text in lines.items():
        clip = AUDIO / f"{key}.m4a"
        entry = manifest.get(key, {})
        result = qa.get(key, {})
        if not clip.is_file() or clip.stat().st_size < 2_000:
            problems.append(f"{key}: missing clip")
            continue
        actual_duration = duration(clip)
        actual_hash = file_hash(clip)
        expected_text_hash = text_hash(text)
        if (
            entry.get("file") != clip.name
            or entry.get("textHash") != expected_text_hash
            or not (0.35 <= actual_duration <= 20)
            or abs(float(entry.get("dur", 0)) - actual_duration) > 0.02
        ):
            problems.append(f"{key}: invalid manifest")
        if (
            result.get("valid") is not True
            or result.get("engine") != "qwen3-tts-voicedesign"
            or result.get("voice") != "designed-preschool-teacher"
            or result.get("instructionHash") != APPROVED_INSTRUCTION_HASH
            or "error" in result
            or result.get("sourceText") != text
            or normalize_transcript(result.get("transcript", "")) != normalize(text)
            or result.get("normalizedTranscript") != normalize_transcript(result.get("transcript", ""))
            or result.get("normalizedSource") != normalize(text)
            or result.get("transcriptionPrompt") != "none"
            or result.get("promptUsed") is not False
            or result.get("whisperWorkflow") != "whisper-stt"
            or result.get("whisperModel") != RELEASE_WHISPER_MODEL
            or result.get("whisperLanguage") != "en"
            or result.get("transcriptAliasRule") != TRANSCRIPT_ALIAS_RULE
            or result.get("appliedTranscriptAliases") != applied_transcript_aliases(result.get("transcript", ""))
            or result.get("textHash") != expected_text_hash
            or result.get("bytes") != clip.stat().st_size
            or abs(float(result.get("duration", 0)) - actual_duration) > 0.02
            or result.get("sha256") != actual_hash
        ):
            problems.append(f"{key}: invalid QA evidence")
    if problems:
        print("\n".join(problems), file=sys.stderr)
        return 1
    print(f"voice check passed: {len(lines)}/{len(lines)} exact clips")
    return 0


def recheck_existing(args: argparse.Namespace, lines: dict[str, str]) -> int:
    """Blindly re-transcribe the existing pack without regenerating its voice."""
    api = (args.qwen_url or os.getenv("QLOBE_QWEN_URL", "")).rstrip("/")
    if not api:
        raise SystemExit("provide --qwen-url (or QLOBE_QWEN_URL)")
    try:
        previous = json.loads((AUDIO / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        previous = {}

    qa: dict[str, dict] = {}
    candidates: list[tuple[str, str, int, Path]] = []
    for key, text in lines.items():
        clip = AUDIO / f"{key}.m4a"
        prior = previous.get(key, {}) if isinstance(previous, dict) else {}
        if not clip.is_file() or clip.stat().st_size < 2_000:
            qa[key] = {"valid": False, "sourceText": text, "textHash": text_hash(text), "error": "missing clip"}
            continue
        candidates.append((key, text, int(prior.get("seed", 0)), clip))

    workers = max(1, min(3, args.workers))
    print(f"blind Whisper recheck: {len(candidates)} existing clip(s)", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        jobs = ((api, key, text, seed, clip, args.whisper_model) for key, text, seed, clip in candidates)
        for key, result, error in executor.map(lambda values: transcribe(*values), jobs):
            prior = previous.get(key, {}) if isinstance(previous, dict) else {}
            if result is None:
                qa[key] = {
                    **prior,
                    "valid": False,
                    "sourceText": lines[key],
                    "textHash": text_hash(lines[key]),
                    "transcriptionPrompt": "none",
                    "promptUsed": False,
                    "whisperWorkflow": "whisper-stt",
                    "whisperModel": args.whisper_model,
                    "whisperLanguage": "en",
                    "transcriptAliasRule": TRANSCRIPT_ALIAS_RULE,
                    "error": error,
                }
                print(f"{key}: FAILED {error}", flush=True)
                continue
            accepted = {**prior, **result, "sha256": file_hash(AUDIO / f"{key}.m4a")}
            accepted.pop("error", None)
            qa[key] = accepted
            print(f"{key}: exact", flush=True)

    manifest = {
        key: {"file": f"{key}.m4a", "dur": result["duration"], "textHash": text_hash(lines[key])}
        for key, result in qa.items()
        if result.get("valid") is True and (AUDIO / f"{key}.m4a").is_file()
    }
    write_json(AUDIO / "manifest.json", manifest)
    write_json(AUDIO / "lines.json", lines)
    write_json(AUDIO / "qa.json", qa)
    print(f"blind recheck complete: {len(manifest)}/{len(lines)}")
    return 0 if len(manifest) == len(lines) else 1


def generate(args: argparse.Namespace, lines: dict[str, str]) -> int:
    api = (args.qwen_url or os.getenv("QLOBE_QWEN_URL", "")).rstrip("/")
    if not api:
        raise SystemExit("provide --qwen-url (or QLOBE_QWEN_URL)")
    instruction = args.voice_instruct or DEFAULT_INSTRUCTION
    reference_path: Path | None = None
    if args.engine == "clone":
        if args.only:
            raise SystemExit("clone mode requires a full-pack run so one authorized voice stays consistent")
        reference = args.voice_ref or os.getenv("QLOBE_VOICE_REF", "")
        if not reference:
            raise SystemExit("clone mode requires --voice-ref (or QLOBE_VOICE_REF)")
        if not args.allow_voice_upload:
            raise SystemExit(
                "refusing to upload the voice reference without --allow-voice-upload; "
                "this sends the selected WAV to the configured Qwen service"
            )
        reference_path = Path(reference).expanduser().resolve()
        if not reference_path.is_file():
            raise SystemExit("the configured voice reference is not a readable file")

    AUDIO.mkdir(parents=True, exist_ok=True)
    engine_name = f"qwen3-tts-voice{args.engine}"
    identity_hash = text_hash(instruction) if args.engine == "design" else None
    try:
        previous = json.loads((AUDIO / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        previous = {}

    selected = set(args.only or lines)
    unknown = sorted(selected - set(lines))
    if unknown:
        raise SystemExit(f"unknown line key(s): {', '.join(unknown)}")

    qa: dict[str, dict] = {}
    pending: dict[str, str] = {}
    failures: dict[str, str] = {}
    for key, text in lines.items():
        clip = AUDIO / f"{key}.m4a"
        prior = previous.get(key, {}) if isinstance(previous, dict) else {}
        clip_duration = duration(clip) if clip.is_file() else 0.0
        cache_valid = (
            args.engine == "design"
            and clip.is_file()
            and clip.stat().st_size >= 2_000
            and prior.get("valid") is True
            and prior.get("engine") == engine_name
            and prior.get("instructionHash") == identity_hash
            and "error" not in prior
            and prior.get("sourceText") == text
            and prior.get("textHash") == text_hash(text)
            and prior.get("transcriptionPrompt") == "none"
            and prior.get("promptUsed") is False
            and prior.get("whisperWorkflow") == "whisper-stt"
            and prior.get("whisperModel") == args.whisper_model
            and prior.get("whisperLanguage") == "en"
            and prior.get("transcriptAliasRule") == TRANSCRIPT_ALIAS_RULE
            and prior.get("appliedTranscriptAliases") == applied_transcript_aliases(prior.get("transcript", ""))
            and prior.get("normalizedTranscript") == normalize_transcript(prior.get("transcript", ""))
            and prior.get("normalizedSource") == normalize(text)
            and normalize_transcript(prior.get("transcript", "")) == normalize(text)
            and prior.get("bytes") == clip.stat().st_size
            and prior.get("sha256") == file_hash(clip)
            and 0.35 <= clip_duration <= 20
            and abs(float(prior.get("duration", 0)) - clip_duration) <= 0.02
        )
        use_cache = cache_valid and (key not in selected or not args.force)
        if use_cache:
            qa[key] = {**prior, "duration": clip_duration, "bytes": clip.stat().st_size, "sha256": file_hash(clip)}
            print(f"{key}: cached", flush=True)
        elif key in selected:
            pending[key] = text
        else:
            qa[key] = {
                "valid": False,
                "sourceText": text,
                "textHash": text_hash(text),
                "error": "unselected clip failed cache integrity validation",
            }

    workers = max(1, min(3, args.workers))
    with tempfile.TemporaryDirectory(prefix="mountain-seasons-voice-") as folder:
        stage = Path(folder)
        for seed in SEEDS:
            if not pending:
                break
            batch = list(pending.items())
            print(f"seed {seed}: synthesizing {len(batch)} line(s)", flush=True)
            candidates: dict[str, Path] = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                jobs = (
                    (api, args.engine, str(reference_path or ""), instruction, key, text, seed, stage)
                    for key, text in batch
                )
                for key, encoded, error in executor.map(lambda values: synthesize(*values), jobs):
                    if encoded is not None:
                        candidates[key] = encoded
                    else:
                        failures[key] = error

            print(f"seed {seed}: transcribing {len(candidates)} candidate(s)", flush=True)
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                jobs = (
                    (api, key, pending[key], seed, encoded, args.whisper_model)
                    for key, encoded in candidates.items()
                )
                for key, result, error in executor.map(lambda values: transcribe(*values), jobs):
                    if result is None:
                        failures[key] = error
                        continue
                    source = candidates[key]
                    destination = AUDIO / f"{key}.m4a"
                    temporary = destination.with_suffix(destination.suffix + ".tmp")
                    temporary.write_bytes(source.read_bytes())
                    temporary.replace(destination)
                    accepted = {
                        **result,
                        "engine": engine_name,
                        "voice": "designed-preschool-teacher" if args.engine == "design" else "platform-teacher-narrator",
                        "sha256": file_hash(destination),
                    }
                    if args.engine == "design":
                        accepted["instructionHash"] = identity_hash
                    qa[key] = accepted
                    pending.pop(key, None)
                    failures.pop(key, None)
                    print(f"{key}: accepted seed {seed}", flush=True)

    for key, text in pending.items():
        qa[key] = {
            "valid": False,
            "sourceText": text,
            "textHash": text_hash(text),
            "error": failures.get(key, "no seed produced an exact, valid clip"),
        }
        print(f"{key}: FAILED {qa[key]['error']}", flush=True)

    manifest = {
        key: {"file": f"{key}.m4a", "dur": result["duration"], "textHash": text_hash(lines[key])}
        for key, result in qa.items()
        if result.get("valid") is True and (AUDIO / f"{key}.m4a").is_file()
    }
    write_json(AUDIO / "manifest.json", manifest)
    write_json(AUDIO / "lines.json", lines)
    write_json(AUDIO / "qa.json", qa)
    print(f"complete: {len(manifest)}/{len(lines)}; failures={len(lines) - len(manifest)}")
    return 0 if len(manifest) == len(lines) else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--engine", choices=("design", "clone"), default="design")
    parser.add_argument("--voice-instruct", default=DEFAULT_INSTRUCTION)
    parser.add_argument("--voice-ref")
    parser.add_argument("--allow-voice-upload", action="store_true")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument(
        "--whisper-model",
        choices=("base", "small", "medium"),
        default=RELEASE_WHISPER_MODEL,
        help=f"blind transcription model (release gate requires {RELEASE_WHISPER_MODEL})",
    )
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--recheck", action="store_true")
    parser.add_argument("--only", action="append")
    args = parser.parse_args()
    lines = json.loads(LINES_PATH.read_text())
    if args.check:
        return local_check(lines)
    if args.recheck:
        return recheck_existing(args, lines)
    return generate(args, lines)


if __name__ == "__main__":
    raise SystemExit(main())
