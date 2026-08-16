#!/usr/bin/env python3
"""Generate and Whisper-QA every Name Puzzle teacher-voice line.

``assets/audio/lines.json`` is the source of truth. The LAN URL comes from a
flag, environment variable, or git-ignored local state. The voice reference is
an explicit flag or the committed synthetic platform teacher voice. Endpoint
and reference paths are never written to generated metadata.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import contextlib
import datetime
import difflib
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
LINES = OUT / "lines.json"
STATE = ROOT / "tools/state/local.json"
PLATFORM_VOICE = ROOT / "shared/assets/refs/voice-teacher.wav"
SEEDS = (7, 8, 9)
DEFAULT_WHISPER_CLI = Path.home() / "Downloads/whisper.cpp/build/bin/whisper-cli"
DEFAULT_WHISPER_MODEL = (
    Path.home() / "Library/Application Support/MacWhisper/models/ggml-model-whisper-small.bin"
)


def run(cmd: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout.decode(errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
        stderr = error.stderr.decode(errors="replace") if isinstance(error.stderr, bytes) else (error.stderr or "")
        return subprocess.CompletedProcess(cmd, 124, stdout, f"{stderr}\ncommand timed out after {timeout}s".strip())
    except OSError as error:
        return subprocess.CompletedProcess(cmd, 127, "", f"command could not start: {error}")


def norm(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def redact(value: str) -> str:
    return re.sub(
        r"(?:https?://)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?",
        "[configured LAN endpoint]",
        value,
    )


def score(key: str, expected: str, heard: str) -> tuple[bool, float]:
    intended = norm(expected)
    transcript = norm(heard)
    ratio = difflib.SequenceMatcher(None, intended, transcript).ratio()
    name = key.split("-", 1)[1] if key.startswith(("build-", "reveal-")) else ""
    name_ok = not name or norm(name) in transcript
    return (ratio >= 0.92 or intended == transcript) and name_ok, round(ratio, 3)


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
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
    if result.returncode:
        return 0.0
    try:
        return round(float(result.stdout.strip()), 3)
    except (AttributeError, ValueError):
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "volumedetect", "-f", "null", "-",
    ], 60)
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


@contextlib.contextmanager
def generation_lock():
    """Serialize publication without leaving a repository lock artifact."""
    identity = hashlib.sha256(str(GAME).encode()).hexdigest()[:16]
    lock_path = Path(tempfile.gettempdir()) / f"qlobe-name-puzzle-voice-{identity}.lock"
    handle = lock_path.open("a+")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise
    try:
        yield
    finally:
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def synth_candidate(
    api: str,
    ref: str,
    key: str,
    text: str,
    seed: int,
    stage: Path,
) -> tuple[str, Path | None, str]:
    """Run the TTS/encode phase so model families remain batched."""
    raw = stage / f"{key}-{seed}.flac"
    encoded = stage / f"{key}-{seed}.m4a"
    result = run([
        "curl", "-sS", "-X", "POST",
        f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
        "-F", f"voice=@{ref}", "-F", f"text={text}", "-F", f"seed={seed}",
        "--output", str(raw), "--max-time", "900",
    ], 930)
    if result.returncode or not raw.is_file() or raw.stat().st_size < 2_000:
        size = raw.stat().st_size if raw.is_file() else 0
        detail = redact(result.stderr.strip())[:240] or "no stderr"
        return key, None, f"seed {seed}: synthesis failed (curl rc={result.returncode}, bytes={size}, {detail})"
    encode = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
        "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-ac", "1", "-ar", "48000",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded),
    ], 60)
    if encode.returncode or not encoded.is_file() or encoded.stat().st_size < 2_000:
        return key, None, f"seed {seed}: encode failed"
    return key, encoded, ""


def transcribe_candidate(
    api: str,
    key: str,
    text: str,
    seed: int,
    encoded: Path,
) -> tuple[str, dict | None, str]:
    """Run Whisper only after the TTS batch for this seed has finished."""
    result = run([
        "curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
        "-F", f"audio=@{encoded}", "-F", "model_size=base", "-F", "language=en",
        "-F", f"initial_prompt={text}", "--max-time", "900",
    ], 930)
    try:
        heard = str(json.loads(result.stdout).get("text", "")).strip()
    except json.JSONDecodeError:
        heard = ""
    accepted, ratio = score(key, text, heard)
    clip_duration = duration(encoded)
    volume = mean_volume(encoded)
    audio_ok = (
        encoded.stat().st_size >= 2_000
        and 0.35 <= clip_duration <= 20
        and volume is not None
        and -36 <= volume <= -5
    )
    if result.returncode or not accepted or not audio_ok:
        detail = redact(result.stderr.strip())[:160]
        suffix = f"; {detail}" if detail else ""
        return key, None, (
            f"seed {seed}: transcript {heard!r} (ratio {ratio}); "
            f"duration={clip_duration}s mean={volume}dB{suffix}"
        )
    dest = OUT / f"{key}.m4a"
    temporary = dest.with_suffix(dest.suffix + ".tmp")
    temporary.write_bytes(encoded.read_bytes())
    temporary.replace(dest)
    return key, {
        "valid": True,
        "engine": "qwen3-tts-voiceclone",
        "voice": "synthetic-platform-teacher",
        "seed": seed,
        "intended": text,
        "heard": heard,
        "ratio": ratio,
        "duration": duration(dest),
        "meanVolumeDb": volume,
        "bytes": dest.stat().st_size,
        "sha256": sha(dest),
        "textHash": text_hash(text),
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }, ""


def render_offline_candidate(key: str, text: str, stage: Path) -> tuple[str, Path | None, str]:
    """Render one local system-voice take without any network or model call."""
    raw = stage / f"{key}.aiff"
    encoded = stage / f"{key}.m4a"
    speech = run(["say", "-v", "Samantha", "-r", "160", "-o", str(raw), text], 120)
    if speech.returncode or not raw.is_file() or raw.stat().st_size < 1_024:
        return key, None, f"local speech render failed (exit={speech.returncode})"
    encode = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
        "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-ac", "1", "-ar", "48000",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded),
    ], 60)
    clip_duration = duration(encoded)
    volume = mean_volume(encoded)
    if (
        encode.returncode
        or not encoded.is_file()
        or encoded.stat().st_size < 2_000
        or not 0.35 <= clip_duration <= 20
        or volume is None
        or not -36 <= volume <= -5
    ):
        return key, None, (
            f"local encode validation failed (duration={clip_duration}s, "
            f"mean={volume}dB, exit={encode.returncode})"
        )
    return key, encoded, ""


def transcribe_offline_candidate(
    whisper_cli: Path,
    whisper_model: Path,
    key: str,
    text: str,
    encoded: Path,
    stage: Path,
) -> tuple[str, str, float, str]:
    """Round-trip one clip through the installed, CPU-only whisper.cpp model."""
    wav = stage / f"{key}.wav"
    convert = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(encoded),
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(wav),
    ], 60)
    if convert.returncode or not wav.is_file():
        return key, "", 0.0, "Whisper WAV conversion failed"
    prompt = text.split(".", 1)[0] + "." if key.startswith("build-") else text
    base_command = [
        str(whisper_cli), "-ng", "-t", "4", "-m", str(whisper_model),
        "-f", str(wav), "-l", "en", "-nt", "-np",
    ]
    result = run([*base_command, "--prompt", prompt], 300)
    heard = result.stdout.strip()
    accepted, ratio = score(key, text, heard)
    if result.returncode == 0 and not accepted and key.startswith("build-"):
        retry = run(base_command, 300)
        retry_heard = retry.stdout.strip()
        retry_accepted, retry_ratio = score(key, text, retry_heard)
        if retry_accepted or retry_ratio > ratio:
            result, heard, accepted, ratio = retry, retry_heard, retry_accepted, retry_ratio
    if result.returncode or not accepted:
        return key, heard, ratio, (
            f"offline transcript rejected (exit={result.returncode}, ratio={ratio}, heard={heard!r})"
        )
    return key, heard, ratio, ""


def generate_offline_batch(args: argparse.Namespace, lines: dict[str, str]) -> int:
    """Generate a fully on-device fallback batch and local transcript receipts."""
    whisper_cli = Path(args.whisper_cli).expanduser()
    whisper_model = Path(args.whisper_model).expanduser()
    if not whisper_cli.is_file() or not os.access(whisper_cli, os.X_OK):
        raise RuntimeError(f"offline whisper executable is unavailable: {whisper_cli}")
    if not whisper_model.is_file():
        raise RuntimeError(f"offline whisper model is unavailable: {whisper_model}")

    qa: dict[str, dict] = {}
    failures: dict[str, str] = {}
    try:
        previous_qa = json.loads((OUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        previous_qa = {}
    workers = max(1, min(3, args.workers))
    with tempfile.TemporaryDirectory(prefix="name-puzzle-offline-voice-") as folder:
        stage = Path(folder)
        candidates: dict[str, Path] = {}
        for key, text in lines.items():
            prior = previous_qa.get(key, {}) if isinstance(previous_qa, dict) else {}
            path = OUT / f"{key}.m4a"
            reusable = (
                not args.force
                and prior.get("valid") is True
                and prior.get("engine") == "macos-say-offline"
                and prior.get("intended") == text
                and prior.get("ratio", 0) >= 0.92
                and path.is_file()
                and path.stat().st_size > 2_000
                and prior.get("sha256") == sha(path)
                and 0.35 <= duration(path) <= 20
            )
            if reusable:
                qa[key] = {
                    **prior,
                    "duration": duration(path),
                    "bytes": path.stat().st_size,
                    "sha256": sha(path),
                }
                print(f"{key}: reused", flush=True)
                continue
            key, encoded, error = render_offline_candidate(key, text, stage)
            if encoded is None:
                failures[key] = error
                print(f"{key}: FAILED — {error}", flush=True)
            else:
                candidates[key] = encoded
                print(f"{key}: rendered", flush=True)

        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
            jobs = (
                (whisper_cli, whisper_model, key, lines[key], encoded, stage)
                for key, encoded in candidates.items()
            )
            for key, heard, ratio, error in executor.map(
                lambda params: transcribe_offline_candidate(*params), jobs
            ):
                if error:
                    failures[key] = error
                    print(f"{key}: FAILED — {error}", flush=True)
                    continue
                source = candidates[key]
                dest = OUT / f"{key}.m4a"
                temporary = dest.with_suffix(dest.suffix + ".tmp")
                temporary.write_bytes(source.read_bytes())
                temporary.replace(dest)
                qa[key] = {
                    "valid": True,
                    "engine": "macos-say-offline",
                    "voice": "Samantha",
                    "transcriber": "whisper.cpp-small-cpu",
                    "intended": lines[key],
                    "heard": heard,
                    "ratio": ratio,
                    "duration": duration(dest),
                    "meanVolumeDb": mean_volume(dest),
                    "bytes": dest.stat().st_size,
                    "sha256": sha(dest),
                    "textHash": text_hash(lines[key]),
                    "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                }
                print(f"{key}: transcript ok (ratio {ratio})", flush=True)

    for key, text in lines.items():
        if key in qa:
            continue
        qa[key] = {
            "valid": False,
            "engine": "macos-say-offline",
            "intended": text,
            "heard": "",
            "textHash": text_hash(text),
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "error": failures.get(key, "no attempt"),
        }
    manifest = {
        key: {
            "file": f"{key}.m4a",
            "dur": receipt["duration"],
            "sha256": receipt["sha256"],
            "textHash": text_hash(lines[key]),
        }
        for key, receipt in qa.items()
        if receipt.get("valid")
    }
    bad = [key for key in lines if key not in manifest]
    write_json(OUT / "qa.json", qa)
    write_json(OUT / "manifest.json", manifest if not bad else {})
    print(f"offline complete: {len(manifest)}/{len(lines)}; failures={bad}")
    return 1 if bad else 0


def generate_batch(args: argparse.Namespace, lines: dict[str, str], api: str, ref: str) -> int:
    """Generate one all-or-nothing runtime batch while holding the lock."""
    qa: dict[str, dict] = {}
    pending: dict[str, str] = {}
    failures: dict[str, str] = {}
    try:
        previous_qa = json.loads((OUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        previous_qa = {}

    for key, text in lines.items():
        path = OUT / f"{key}.m4a"
        prior = previous_qa.get(key, {}) if isinstance(previous_qa, dict) else {}
        reusable = (
            not args.force
            and path.is_file()
            and path.stat().st_size > 2_000
            and prior.get("valid") is True
            and prior.get("engine") == "qwen3-tts-voiceclone"
            and prior.get("intended") == text
            and prior.get("ratio", 0) >= 0.92
            and prior.get("sha256") == sha(path)
            and duration(path) >= 0.35
        )
        if reusable:
            qa[key] = {
                **prior,
                "duration": duration(path),
                "bytes": path.stat().st_size,
                "sha256": sha(path),
            }
            print(f"{key}: reused", flush=True)
        else:
            pending[key] = text

    workers = max(1, min(3, args.workers))
    with tempfile.TemporaryDirectory(prefix="name-puzzle-voice-") as folder:
        stage = Path(folder)
        for seed in SEEDS:
            if not pending:
                break
            batch = list(pending.items())
            print(f"seed {seed}: TTS batch {len(batch)}", flush=True)
            candidates: dict[str, Path] = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                jobs = ((api, ref, key, text, seed, stage) for key, text in batch)
                for key, encoded, error in executor.map(lambda params: synth_candidate(*params), jobs):
                    if encoded is not None:
                        candidates[key] = encoded
                    else:
                        failures[key] = error
            print(f"seed {seed}: Whisper batch {len(candidates)}", flush=True)
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                jobs = ((api, key, pending[key], seed, encoded) for key, encoded in candidates.items())
                for key, receipt, error in executor.map(lambda params: transcribe_candidate(*params), jobs):
                    if receipt is not None:
                        qa[key] = receipt
                        pending.pop(key, None)
                        failures.pop(key, None)
                        print(f"{key}: ok (seed {seed})", flush=True)
                    else:
                        failures[key] = error

    for key, text in pending.items():
        qa[key] = {
            "valid": False,
            "intended": text,
            "heard": "",
            "textHash": text_hash(text),
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "error": failures.get(key, "no attempt"),
        }

    manifest = {
        key: {
            "file": f"{key}.m4a",
            "dur": receipt["duration"],
            "sha256": receipt["sha256"],
            "textHash": text_hash(lines[key]),
        }
        for key, receipt in qa.items()
        if receipt.get("valid")
    }
    bad = [key for key in lines if key not in manifest]
    write_json(OUT / "qa.json", qa)
    write_json(OUT / "manifest.json", manifest if not bad else {})
    print(f"complete: {len(manifest)}/{len(lines)}; failures={bad}")
    return 1 if bad else 0


def check_batch(lines: dict[str, str]) -> int:
    try:
        manifest = json.loads((OUT / "manifest.json").read_text())
        qa = json.loads((OUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError) as error:
        print(f"voice check failed: {error}", file=sys.stderr)
        return 1
    failures = []
    for key, text in lines.items():
        entry = manifest.get(key, {})
        receipt = qa.get(key, {})
        path = OUT / str(entry.get("file", ""))
        valid = (
            receipt.get("valid") is True
            and receipt.get("engine") in {"qwen3-tts-voiceclone", "macos-say-offline"}
            and receipt.get("intended") == text
            and receipt.get("ratio", 0) >= 0.92
            and entry.get("textHash") == text_hash(text)
            and path.is_file()
            and path.stat().st_size > 2_000
            and entry.get("sha256") == sha(path)
            and 0.35 <= duration(path) <= 20
        )
        if not valid:
            failures.append(key)
    print(f"voice check: {len(lines) - len(failures)}/{len(lines)}; failures={failures}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--voice-ref")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--offline-samantha", action="store_true")
    parser.add_argument("--whisper-cli", default=str(DEFAULT_WHISPER_CLI))
    parser.add_argument("--whisper-model", default=str(DEFAULT_WHISPER_MODEL))
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    lines = json.loads(LINES.read_text())
    if args.check:
        return check_batch(lines)
    try:
        with generation_lock():
            publication_started = False
            try:
                if args.offline_samantha:
                    whisper_cli = Path(args.whisper_cli).expanduser()
                    whisper_model = Path(args.whisper_model).expanduser()
                    if not whisper_cli.is_file() or not os.access(whisper_cli, os.X_OK):
                        raise RuntimeError(f"offline whisper executable is unavailable: {whisper_cli}")
                    if not whisper_model.is_file():
                        raise RuntimeError(f"offline whisper model is unavailable: {whisper_model}")
                    write_json(OUT / "manifest.json", {})
                    publication_started = True
                    return generate_offline_batch(args, lines)
                state = json.loads(STATE.read_text()) if STATE.exists() else {}
                api = (args.qwen_url or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
                ref = args.voice_ref or (str(PLATFORM_VOICE) if PLATFORM_VOICE.is_file() else "")
                if not api or not ref or not Path(ref).is_file():
                    raise RuntimeError("LAN endpoint and a readable synthetic platform voice reference are required")
                write_json(OUT / "manifest.json", {})
                publication_started = True
                return generate_batch(args, lines, api, ref)
            except Exception as error:
                if publication_started:
                    write_json(OUT / "manifest.json", {})
                print(f"generation failed closed: {redact(str(error))}", file=sys.stderr)
                return 1
    except BlockingIOError:
        print("another Name Puzzle voice batch is already running", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
