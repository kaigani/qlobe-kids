#!/usr/bin/env python3
"""Generate and transcript-QA Little Artist's local teacher-voice clips.

The voice map in config.json is the only spoken-script source. Every selected
Qwen voice-clone candidate is generated before Whisper is loaded, avoiding
model thrash on the LAN host. Only transcript-approved AAC clips enter the
runtime manifest; the exact lines.json text remains the device fallback.
"""

from __future__ import annotations

import argparse
from collections import Counter
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


GAME_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = GAME_ROOT.parents[1]
CONFIG_PATH = GAME_ROOT / "config.json"
OUTPUT_ROOT = GAME_ROOT / "assets/audio"
SOURCE_ROOT = GAME_ROOT / "assets/source/local-api/voice"
STATE_PATH = REPO_ROOT / "tools/state/local.json"
DEFAULT_REFERENCE = REPO_ROOT / "shared/assets/refs/voice-teacher.wav"
DEFAULT_SEEDS = [42, 1337, 9001]
PIPELINE_VERSION = 2
VERIFIER_VERSION = 2
MIN_AUDIO_BYTES = 1_500
TRIM_FILTER = (
    "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
    "areverse,silenceremove=start_periods=1:start_silence=0.10:"
    "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9"
)


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
            handle.write(data)
            temporary = Path(handle.name)
        temporary.replace(path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def atomic_json(path: Path, value: dict) -> None:
    atomic_write(
        path,
        (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode(),
    )


def load_json(path: Path, fallback: dict | None = None) -> dict:
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else (fallback or {})
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback or {}


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def normalized(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def transcript_score(expected: str, heard: str) -> tuple[float, float, bool]:
    wanted = normalized(expected)
    actual = normalized(heard)
    score = difflib.SequenceMatcher(None, wanted, actual).ratio()
    wanted_words = wanted.split()
    actual_words = actual.split()
    wanted_counts = Counter(wanted_words)
    actual_counts = Counter(actual_words)
    coverage = sum(
        min(count, actual_counts[word]) for word, count in wanted_counts.items()
    ) / max(1, len(wanted_words))
    accepted = actual == wanted
    return round(score, 3), round(coverage, 3), accepted


def run(command: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(
        command,
        capture_output=True,
        timeout=timeout,
        check=False,
    )


def duration(path: Path) -> float:
    result = run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        timeout=30,
    )
    try:
        return round(float(result.stdout.decode().strip()), 3)
    except (TypeError, ValueError):
        return 0


def plausible_duration(text: str, seconds: float) -> bool:
    word_count = max(1, len(normalized(text).split()))
    return 0.2 <= seconds <= 1.8 + word_count * 0.8


def curl_to_file(endpoint: str, fields: list[str], output: Path, timeout: int) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        dir=output.parent, prefix=f".{output.name}.", suffix=".part", delete=False
    ) as handle:
        temporary = Path(handle.name)
    command = ["curl", "-sS", "--fail-with-body", "-X", "POST", endpoint]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(temporary), "--max-time", str(timeout)])
    result = run(command, timeout=timeout + 30)
    if (
        result.returncode != 0
        or not temporary.exists()
        or temporary.stat().st_size < 1
    ):
        temporary.unlink(missing_ok=True)
        message = result.stderr.decode(errors="replace").strip()
        raise RuntimeError(message or f"request failed with code {result.returncode}")
    temporary.replace(output)


def synthesize(
    endpoint: str,
    voice_reference: Path,
    key: str,
    text: str,
    seed: int,
    reference_hash: str,
    force: bool,
) -> tuple[Path, dict]:
    raw_path = SOURCE_ROOT / f"{key}-seed{seed}.flac"
    candidate_path = SOURCE_ROOT / f"{key}-seed{seed}.m4a"
    recipe_path = SOURCE_ROOT / f"{key}-seed{seed}.recipe.json"
    cached_recipe = load_json(recipe_path)
    expected_provenance = {
        "pipelineVersion": PIPELINE_VERSION,
        "workflow": "qwen3-tts-voiceclone",
        "seed": seed,
        "textHash": text_hash(text),
        "referenceSha256": reference_hash,
    }
    cache_matches = all(
        cached_recipe.get(name) == value
        for name, value in expected_provenance.items()
    )
    raw_is_valid = (
        cache_matches
        and raw_path.exists()
        and raw_path.stat().st_size >= MIN_AUDIO_BYTES
    )
    regenerate = force or not raw_is_valid
    if regenerate:
        curl_to_file(
            endpoint,
            [
                f"voice=@{voice_reference}",
                f"text={text}",
                f"seed={seed}",
            ],
            raw_path,
            timeout=1_500,
        )
    if raw_path.stat().st_size < MIN_AUDIO_BYTES:
        raise RuntimeError("voice-clone result is implausibly small")

    if regenerate or not candidate_path.exists() or duration(candidate_path) <= 0.2:
        with tempfile.NamedTemporaryFile(
            dir=candidate_path.parent,
            prefix=f".{candidate_path.name}.",
            suffix=".part.m4a",
            delete=False,
        ) as handle:
            temporary = Path(handle.name)
        result = run(
            [
                "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw_path),
                "-vn", "-af", TRIM_FILTER,
                "-c:a", "aac", "-b:a", "96k", "-ar", "48000", "-ac", "1",
                "-movflags", "+faststart", str(temporary),
            ],
            timeout=180,
        )
        if (
            result.returncode != 0
            or not temporary.exists()
            or temporary.stat().st_size < MIN_AUDIO_BYTES
        ):
            temporary.unlink(missing_ok=True)
            raise RuntimeError(
                result.stderr.decode(errors="replace").strip() or "AAC encoding failed"
            )
        temporary.replace(candidate_path)

    seconds = duration(candidate_path)
    if not plausible_duration(text, seconds):
        raise RuntimeError(f"implausible encoded duration {seconds}s")
    recipe = {
        "format": "qlobe-local-voice-recipe",
        "formatVersion": 1,
        "pipelineVersion": PIPELINE_VERSION,
        "key": key,
        "source": "local-lan-api",
        "workflow": "qwen3-tts-voiceclone",
        "voiceReference": "platform-teacher",
        "referenceSha256": reference_hash,
        "seed": seed,
        "text": text,
        "textHash": text_hash(text),
        "raw": str(raw_path.relative_to(GAME_ROOT)),
        "candidate": str(candidate_path.relative_to(GAME_ROOT)),
        "duration": seconds,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    atomic_json(recipe_path, recipe)
    return candidate_path, recipe


def transcribe(
    endpoint: str, audio_path: Path, transcript_path: Path, model_size: str
) -> str:
    curl_to_file(
        endpoint,
        [
            f"audio=@{audio_path}",
            f"model_size={model_size}",
            "language=en",
        ],
        transcript_path,
        timeout=900,
    )
    document = load_json(transcript_path)
    return str(document.get("text", "")).strip()


def accepted_cache_entry(
    key: str, text: str, reference_hash: str, qa: dict
) -> dict | None:
    entry = qa.get(key)
    output = OUTPUT_ROOT / f"{key}.m4a"
    if not isinstance(entry, dict) or not entry.get("accepted"):
        return None
    if entry.get("textHash") != text_hash(text):
        return None
    if entry.get("referenceSha256") != reference_hash:
        return None
    if entry.get("pipelineVersion") != PIPELINE_VERSION:
        return None
    if entry.get("verifierVersion") != VERIFIER_VERSION:
        return None
    if not output.exists() or not plausible_duration(text, duration(output)):
        return None
    return entry


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="*", help="restrict to voice keys")
    parser.add_argument("--seed", type=int, help="pin one seed")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--api-url", help="override the configured local API URL")
    parser.add_argument("--voice-ref", help="override the teacher reference path")
    parser.add_argument("--whisper-model", default="base")
    parser.add_argument(
        "--recheck-final",
        action="store_true",
        help="Whisper-check existing runtime clips without regenerating TTS candidates",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    lines = load_json(CONFIG_PATH).get("voice", {})
    if not lines or not all(isinstance(value, str) for value in lines.values()):
        raise SystemExit("config.json has no valid voice map")
    keys = args.only or list(lines)
    unknown = sorted(set(keys) - set(lines))
    if unknown:
        raise SystemExit(f"unknown voice key(s): {', '.join(unknown)}")
    seeds = [args.seed] if args.seed is not None else DEFAULT_SEEDS

    state = load_json(STATE_PATH)
    base_url = (
        args.api_url
        or os.getenv("QLOBE_QWEN_URL")
        or state.get("qwenUrl")
        or ""
    ).rstrip("/")
    reference = Path(
        args.voice_ref
        or os.getenv("QLOBE_VOICE_REF")
        or os.getenv("QLOBE_TEACHER_VOICE")
        or (DEFAULT_REFERENCE if DEFAULT_REFERENCE.is_file() else "")
        or state.get("teacherVoicePath")
        or ""
    )

    if args.dry_run:
        print(f"dry-run keys={keys} seeds={seeds}")
        return 0
    if not base_url:
        raise SystemExit("Set --api-url, QLOBE_QWEN_URL, or tools/state/local.json")
    if not reference.is_file():
        raise SystemExit(f"teacher voice reference missing: {reference}")
    reference_hash = file_hash(reference)
    for command in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(command):
            raise SystemExit(f"required command is missing: {command}")

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    SOURCE_ROOT.mkdir(parents=True, exist_ok=True)
    atomic_json(OUTPUT_ROOT / "lines.json", lines)
    previous_qa = load_json(OUTPUT_ROOT / "qa.json")
    qa = dict(previous_qa)
    pending = [
        key for key in keys
        if args.force
        or not accepted_cache_entry(key, lines[key], reference_hash, previous_qa)
    ]
    generation: dict[str, dict[int, tuple[Path, dict] | str]] = {
        key: {} for key in pending
    }

    # Phase 1: generate every seed-ladder candidate before Whisper is loaded.
    # A verifier-policy upgrade can instead recheck the already selected final
    # clips without spending a single TTS request or changing their identity.
    if args.recheck_final:
        for key in pending:
            runtime_path = OUTPUT_ROOT / f"{key}.m4a"
            prior = previous_qa.get(key, {})
            seed = int(prior.get("seed", 0))
            if not runtime_path.exists() or duration(runtime_path) <= 0.2:
                generation[key][seed] = "runtime clip missing or invalid"
                continue
            generation[key][seed] = (
                runtime_path,
                {"duration": duration(runtime_path)},
            )
    else:
        tts_endpoint = f"{base_url}/workflows/qwen3-tts-voiceclone?sync=true"
        for seed in seeds:
            for key in pending:
                print(f"TTS {key} seed={seed}", flush=True)
                try:
                    generation[key][seed] = synthesize(
                        tts_endpoint,
                        reference,
                        key,
                        lines[key],
                        seed,
                        reference_hash,
                        args.force,
                    )
                except Exception as error:
                    generation[key][seed] = str(error)
                    print(f"reject TTS {key} seed={seed}: {error}", flush=True)

    # Phase 2: keep Whisper loaded while trying each prebuilt candidate ladder.
    whisper_endpoint = f"{base_url}/workflows/whisper-stt?sync=true"
    for key in pending:
        text = lines[key]
        attempts = []
        accepted_attempt = None
        for seed in generation[key]:
            candidate = generation[key].get(seed)
            if not isinstance(candidate, tuple):
                attempts.append(
                    {"seed": seed, "status": "tts-rejected", "reason": candidate}
                )
                continue
            candidate_path, recipe = candidate
            transcript_path = SOURCE_ROOT / f"{key}-seed{seed}-transcript.json"
            print(f"Whisper {key} seed={seed}", flush=True)
            try:
                heard = transcribe(
                    whisper_endpoint,
                    candidate_path,
                    transcript_path,
                    args.whisper_model,
                )
                score, coverage, accepted = transcript_score(text, heard)
                attempt = {
                    "seed": seed,
                    "status": "accepted" if accepted else "transcript-rejected",
                    "text": text,
                    "transcript": heard,
                    "score": score,
                    "coverage": coverage,
                    "duration": recipe["duration"],
                    "recipe": str(
                        (SOURCE_ROOT / f"{key}-seed{seed}.recipe.json").relative_to(
                            GAME_ROOT
                        )
                    ),
                }
            except Exception as error:
                attempt = {
                    "seed": seed, "status": "whisper-error", "reason": str(error)
                }
                accepted = False
            attempts.append(attempt)
            if accepted:
                accepted_attempt = attempt
                atomic_write(OUTPUT_ROOT / f"{key}.m4a", candidate_path.read_bytes())
                break

        qa[key] = {
            "accepted": accepted_attempt is not None,
            "text": text,
            "textHash": text_hash(text),
            "referenceSha256": reference_hash,
            "pipelineVersion": PIPELINE_VERSION,
            "verifierVersion": VERIFIER_VERSION,
            "engine": "qwen3-tts-voiceclone",
            "verifier": "whisper-stt",
            "whisperModel": args.whisper_model,
            "whisperConditioning": "none",
            "attempts": attempts,
        }
        if accepted_attempt:
            qa[key].update(
                {
                    "seed": accepted_attempt["seed"],
                    "transcript": accepted_attempt["transcript"],
                    "score": accepted_attempt["score"],
                    "coverage": accepted_attempt["coverage"],
                    "duration": duration(OUTPUT_ROOT / f"{key}.m4a"),
                }
            )
            print(f"accepted voice {key} seed={accepted_attempt['seed']}", flush=True)
        else:
            print(f"failed voice {key}", flush=True)

    manifest = {}
    for key, text in lines.items():
        entry = accepted_cache_entry(key, text, reference_hash, qa)
        if not entry:
            continue
        manifest[key] = {
            "file": f"{key}.m4a",
            "dur": duration(OUTPUT_ROOT / f"{key}.m4a"),
            "textHash": text_hash(text),
            "referenceSha256": reference_hash,
            "verifierVersion": VERIFIER_VERSION,
        }
    atomic_json(OUTPUT_ROOT / "manifest.json", manifest)
    atomic_json(OUTPUT_ROOT / "qa.json", qa)
    failures = [key for key in lines if key not in manifest]
    print(
        f"voice complete: {len(manifest)}/{len(lines)} accepted; failures={failures}",
        flush=True,
    )
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
