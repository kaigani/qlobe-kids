#!/usr/bin/env python3
"""Generate and independently QA Chalkboard Big Strokes narration.

The preferred authoring path remains Qwen voice clone on the private LAN. Pass
its base URL with ``--api`` or ``QLOBE_QWEN_URL`` and an approved teacher WAV
with ``--reference`` (or install the shared default reference).

``--edge-fallback`` is an explicit release fallback. It uses Edge TTS voice
en-US-AnaNeural at child-friendly pacing for any line Qwen could not produce,
then applies the same mono AAC/loudness pipeline and local faster-whisper QA as
the Qwen candidates. Publication is fail-closed: manifest.json remains empty
unless every configured line independently passes faster-whisper/base on CPU
int8, codec/channel/duration checks, hashes, and current-script text checks.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import datetime
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
CONFIG = GAME / "config.json"
OUT = GAME / "assets" / "audio"
DEFAULT_REF = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9)
EDGE_VOICE = "en-US-AnaNeural"
EDGE_RATE = "-8%"
EDGE_PITCH = "+2Hz"
NORMALIZATION = "loudnorm=I=-18:TP=-2:LRA=7"
WHISPER_MODEL = "base"
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE = "int8"


def now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def run(command: list[str], timeout: int = 930) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(command, 124, "", f"timeout after {timeout}s")
    except OSError as error:
        return subprocess.CompletedProcess(command, 127, "", str(error))


def normalized(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def transcript_ok(expected: str, heard: str) -> tuple[bool, float]:
    want, got = normalized(expected), normalized(heard)
    ratio = round(difflib.SequenceMatcher(None, want, got).ratio(), 3)
    words = want.split()
    if len(words) <= 2:
        return all(word in got.split() for word in words) and ratio >= 0.78, ratio
    return ratio >= 0.86, ratio


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def duration(path: Path) -> float:
    result = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", str(path),
    ], 30)
    try:
        return round(float(result.stdout.strip()), 3)
    except (TypeError, ValueError):
        return 0.0


def audio_stream(path: Path) -> dict[str, Any]:
    result = run([
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,channels,sample_rate",
        "-of", "json", str(path),
    ], 30)
    try:
        streams = json.loads(result.stdout).get("streams", [])
        return streams[0] if streams else {}
    except (json.JSONDecodeError, IndexError, TypeError):
        return {}


def mean_volume(path: Path) -> float | None:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "volumedetect", "-f", "null", "-",
    ], 60)
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def write_json(path: Path, payload: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temporary.replace(path)


def encode_m4a(source: Path, destination: Path) -> str:
    encode = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(source),
        "-af", NORMALIZATION, "-ac", "1", "-ar", "44100",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart",
        str(destination),
    ], 90)
    if encode.returncode or not destination.exists() or destination.stat().st_size < 2_000:
        return f"AAC encode failed rc={encode.returncode}: {encode.stderr.strip()[-300:]}"
    stream = audio_stream(destination)
    if stream.get("codec_name") != "aac" or int(stream.get("channels", 0)) != 1:
        return f"encoded stream is not mono AAC: {stream}"
    return ""


def synthesize_qwen(
    api: str,
    reference: Path,
    key: str,
    text: str,
    seed: int,
    stage: Path,
) -> tuple[str, Path | None, str]:
    raw = stage / f"{key}-qwen-{seed}.flac"
    encoded = stage / f"{key}-qwen-{seed}.m4a"
    request = run([
        "curl", "-sS", "-X", "POST",
        f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
        "-F", f"voice=@{reference}", "-F", f"text={text}",
        "-F", f"seed={seed}", "--output", str(raw), "--max-time", "900",
    ])
    if request.returncode or not raw.exists() or raw.stat().st_size < 2_000:
        size = raw.stat().st_size if raw.exists() else 0
        detail = request.stderr.strip()[-240:]
        return key, None, f"seed {seed}: Qwen TTS failed rc={request.returncode}, bytes={size}, detail={detail!r}"
    error = encode_m4a(raw, encoded)
    return (key, None, f"seed {seed}: {error}") if error else (key, encoded, "")


def synthesize_edge(
    key: str,
    text: str,
    stage: Path,
    voice_name: str,
    rate: str,
    pitch: str,
) -> tuple[str, Path | None, str]:
    raw = stage / f"{key}-edge.mp3"
    encoded = stage / f"{key}-edge.m4a"
    request = run([
        sys.executable, "-m", "edge_tts", "--voice", voice_name,
        f"--rate={rate}", f"--pitch={pitch}", "--text", text,
        "--write-media", str(raw),
    ], 180)
    if request.returncode or not raw.exists() or raw.stat().st_size < 2_000:
        size = raw.stat().st_size if raw.exists() else 0
        detail = request.stderr.strip()[-300:]
        return key, None, f"Edge TTS failed rc={request.returncode}, bytes={size}, detail={detail!r}"
    error = encode_m4a(raw, encoded)
    return (key, None, error) if error else (key, encoded, "")


def load_whisper():
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise RuntimeError("faster-whisper is required for fail-closed voice QA") from error
    print(
        f"loading faster-whisper/{WHISPER_MODEL} ({WHISPER_DEVICE} {WHISPER_COMPUTE})",
        flush=True,
    )
    return WhisperModel(
        WHISPER_MODEL,
        device=WHISPER_DEVICE,
        compute_type=WHISPER_COMPUTE,
    )


def transcribe_local(
    model,
    key: str,
    text: str,
    clip: Path,
    source: dict[str, Any],
) -> tuple[str, dict[str, Any] | None, str]:
    try:
        segments, info = model.transcribe(
            str(clip),
            language="en",
            beam_size=5,
            vad_filter=True,
            condition_on_previous_text=False,
        )
        heard = " ".join(segment.text.strip() for segment in segments).strip()
        language_probability = round(float(info.language_probability), 3)
    except Exception as error:  # verifier failure must reject, never publish
        return key, None, f"faster-whisper failed: {error}"

    words_ok, ratio = transcript_ok(text, heard)
    seconds = duration(clip)
    volume = mean_volume(clip)
    stream = audio_stream(clip)
    audio_ok = (
        0.3 <= seconds <= 20
        and volume is not None
        and -34 <= volume <= -6
        and stream.get("codec_name") == "aac"
        and int(stream.get("channels", 0)) == 1
        and int(stream.get("sample_rate", 0)) == 44100
    )
    if not words_ok or not audio_ok:
        detail = (
            f"heard={heard!r}, ratio={ratio}, duration={seconds}, "
            f"meanVolumeDb={volume}, stream={stream}"
        )
        return key, None, detail

    receipt: dict[str, Any] = {
        "valid": True,
        **source,
        "verifier": "faster-whisper/base",
        "verifierRuntime": {"device": WHISPER_DEVICE, "computeType": WHISPER_COMPUTE},
        "intended": text,
        "heard": heard,
        "ratio": ratio,
        "language": "en",
        "languageProbability": language_probability,
        "duration": seconds,
        "meanVolumeDb": volume,
        "codec": stream.get("codec_name"),
        "channels": int(stream.get("channels", 0)),
        "sampleRate": int(stream.get("sample_rate", 0)),
        "normalization": NORMALIZATION,
        "bytes": clip.stat().st_size,
        "sha256": digest(clip),
        "textHash": text_hash(text),
        "checkedAt": now(),
    }
    return key, receipt, ""


def qwen_unavailable_reason(api: str, reference: Path) -> str:
    if not api:
        return "Qwen LAN was not configured (--api/QLOBE_QWEN_URL absent) for this explicit fallback run."
    if not reference.is_file():
        return "Qwen LAN voice clone could not run because the approved teacher reference WAV was unavailable."
    return ""


def generate(args: argparse.Namespace, lines: dict[str, str]) -> int:
    api = (args.api or os.environ.get("QLOBE_QWEN_URL") or "").rstrip("/")
    reference = Path(args.reference) if args.reference else DEFAULT_REF
    workers = max(1, min(3, args.workers))
    edge_enabled = bool(args.edge_fallback)
    unavailable = qwen_unavailable_reason(api, reference)

    if unavailable and not edge_enabled:
        raise RuntimeError(unavailable)

    # Empty immediately: a crash, Ctrl-C, rejected transcript, or partial
    # fallback can never leave a stale publishable manifest behind.
    write_json(OUT / "manifest.json", {})
    receipts: dict[str, dict[str, Any]] = {}
    final_candidates: dict[str, Path] = {}
    qwen_failures: dict[str, list[str]] = {key: [] for key in lines}
    pending = dict(lines)
    model = load_whisper()

    with tempfile.TemporaryDirectory(prefix="chalkboard-voice-") as folder:
        stage = Path(folder)

        if not unavailable:
            for seed in SEEDS:
                if not pending:
                    break
                batch = list(pending.items())
                print(f"Qwen seed {seed}: generating {len(batch)}", flush=True)
                jobs = [
                    (api, reference, key, text, seed, stage)
                    for key, text in batch
                ]
                candidates: dict[str, Path] = {}
                with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                    for key, clip, error in pool.map(lambda values: synthesize_qwen(*values), jobs):
                        if clip:
                            candidates[key] = clip
                        else:
                            qwen_failures[key].append(error)

                print(f"Qwen seed {seed}: local Whisper QA for {len(candidates)}", flush=True)
                for key, clip in candidates.items():
                    _, receipt, error = transcribe_local(
                        model,
                        key,
                        pending[key],
                        clip,
                        {
                            "engine": "qwen3-tts-voiceclone",
                            "voice": "platform-teacher-narrator",
                            "seed": seed,
                        },
                    )
                    if not receipt:
                        qwen_failures[key].append(f"seed {seed}: local QA rejected: {error}")
                        print(f"{key}: Qwen retry ({error})", flush=True)
                        continue
                    final_candidates[key] = clip
                    receipts[key] = receipt
                    pending.pop(key, None)
                    print(f"{key}: Qwen accepted seed {seed}", flush=True)

        qwen_reason = unavailable
        if pending and not qwen_reason:
            failed_summary = "; ".join(
                f"{key}: {' | '.join(qwen_failures[key])[-700:]}"
                for key in pending
            )
            qwen_reason = f"Qwen LAN exhausted seeds 7/8/9 for fallback lines. {failed_summary}"

        if pending and edge_enabled:
            batch = list(pending.items())
            print(
                f"Edge fallback ({args.edge_voice}, rate {args.edge_rate}, pitch {args.edge_pitch}): "
                f"generating {len(batch)}",
                flush=True,
            )
            jobs = [
                (key, text, stage, args.edge_voice, args.edge_rate, args.edge_pitch)
                for key, text in batch
            ]
            edge_candidates: dict[str, Path] = {}
            edge_errors: dict[str, str] = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                for key, clip, error in pool.map(lambda values: synthesize_edge(*values), jobs):
                    if clip:
                        edge_candidates[key] = clip
                    else:
                        edge_errors[key] = error

            print(f"Edge fallback: local Whisper QA for {len(edge_candidates)}", flush=True)
            for key, text in batch:
                clip = edge_candidates.get(key)
                if not clip:
                    receipts[key] = {
                        "valid": False,
                        "engine": "edge-tts",
                        "voice": args.edge_voice,
                        "intended": text,
                        "textHash": text_hash(text),
                        "fallbackReason": qwen_reason,
                        "error": edge_errors.get(key, "Edge candidate missing"),
                    }
                    continue
                _, receipt, error = transcribe_local(
                    model,
                    key,
                    text,
                    clip,
                    {
                        "engine": "edge-tts",
                        "voice": args.edge_voice,
                        "rate": args.edge_rate,
                        "pitch": args.edge_pitch,
                        "fallbackFrom": "qwen3-tts-voiceclone",
                        "fallbackReason": qwen_reason,
                    },
                )
                if not receipt:
                    receipts[key] = {
                        "valid": False,
                        "engine": "edge-tts",
                        "voice": args.edge_voice,
                        "rate": args.edge_rate,
                        "pitch": args.edge_pitch,
                        "intended": text,
                        "textHash": text_hash(text),
                        "fallbackReason": qwen_reason,
                        "error": error,
                    }
                    print(f"{key}: Edge rejected ({error})", flush=True)
                    continue
                final_candidates[key] = clip
                receipts[key] = receipt
                pending.pop(key, None)
                print(f"{key}: Edge accepted", flush=True)

        for key, text in pending.items():
            receipts.setdefault(key, {
                "valid": False,
                "intended": text,
                "textHash": text_hash(text),
                "error": qwen_reason or "no successful candidate",
            })

        complete = (
            len(receipts) == len(lines)
            and set(receipts) == set(lines)
            and all(receipts[key].get("valid") is True for key in lines)
            and set(final_candidates) == set(lines)
        )

        reference_hash = digest(reference) if reference.is_file() else None
        if reference_hash:
            for receipt in receipts.values():
                if receipt.get("engine") == "qwen3-tts-voiceclone":
                    receipt["referenceSha256"] = reference_hash

        qa = {
            "format": "qlobe-voice-qa",
            "formatVersion": 1,
            "generatedAt": now(),
            "complete": complete,
            "expectedCount": len(lines),
            "acceptedCount": sum(1 for value in receipts.values() if value.get("valid") is True),
            "verifier": {
                "engine": "faster-whisper",
                "model": WHISPER_MODEL,
                "device": WHISPER_DEVICE,
                "computeType": WHISPER_COMPUTE,
            },
            "qwen": {
                "attempted": not bool(unavailable),
                "status": (
                    "accepted-all"
                    if complete and all(value.get("engine") == "qwen3-tts-voiceclone" for value in receipts.values())
                    else "fallback-used"
                    if any(value.get("engine") == "edge-tts" for value in receipts.values())
                    else "unavailable"
                    if unavailable
                    else "incomplete"
                ),
                "reason": qwen_reason or None,
                "referenceSha256": reference_hash,
            },
            "edgeFallback": {
                "enabled": edge_enabled,
                "used": any(value.get("engine") == "edge-tts" for value in receipts.values()),
                "voice": args.edge_voice,
                "rate": args.edge_rate,
                "pitch": args.edge_pitch,
            },
            "entries": receipts,
        }

        if complete:
            # Publish as one transaction only after all ten passed. Each copy
            # is followed by a hash refresh so manifest and QA describe the
            # committed artifact, not merely the temporary candidate.
            for key in lines:
                destination = OUT / f"{key}.m4a"
                shutil.copy2(final_candidates[key], destination)
                receipts[key]["bytes"] = destination.stat().st_size
                receipts[key]["sha256"] = digest(destination)
            manifest = {
                key: {
                    "file": f"{key}.m4a",
                    "dur": receipts[key]["duration"],
                    "sha256": receipts[key]["sha256"],
                    "textHash": text_hash(lines[key]),
                    "engine": receipts[key]["engine"],
                    "voice": receipts[key]["voice"],
                }
                for key in lines
            }
            write_json(OUT / "qa-report.json", qa)
            write_json(OUT / "manifest.json", manifest)
            print(f"complete: {len(manifest)}/{len(lines)}; fail-closed publication passed", flush=True)
            return 0

        write_json(OUT / "qa-report.json", qa)
        write_json(OUT / "manifest.json", {})
        failures = [key for key in lines if not receipts.get(key, {}).get("valid")]
        print(f"complete: {len(lines) - len(failures)}/{len(lines)}; failures={failures}", flush=True)
        return 1


def check(lines: dict[str, str]) -> int:
    try:
        manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
        report = json.loads((OUT / "qa-report.json").read_text(encoding="utf-8"))
        receipts = report["entries"]
    except (FileNotFoundError, json.JSONDecodeError, KeyError) as error:
        print(f"voice check failed: {error}")
        return 1

    failures = []
    exact_keys = set(manifest) == set(lines) == set(receipts)
    if not exact_keys or report.get("complete") is not True:
        failures.append("manifest/report key set")

    verifier = report.get("verifier", {})
    if verifier != {
        "engine": "faster-whisper",
        "model": WHISPER_MODEL,
        "device": WHISPER_DEVICE,
        "computeType": WHISPER_COMPUTE,
    }:
        failures.append("verifier provenance")

    edge_entries = [value for value in receipts.values() if value.get("engine") == "edge-tts"]
    if edge_entries:
        fallback = report.get("edgeFallback", {})
        qwen = report.get("qwen", {})
        fallback_reason = qwen.get("reason")
        if not (
            fallback.get("enabled") is True
            and fallback.get("used") is True
            and fallback.get("voice") == EDGE_VOICE
            and fallback.get("rate") == EDGE_RATE
            and fallback.get("pitch") == EDGE_PITCH
            and qwen.get("status") == "fallback-used"
            and isinstance(fallback_reason, str)
            and fallback_reason.strip()
            and all(value.get("fallbackReason") == fallback_reason for value in edge_entries)
        ):
            failures.append("fallback provenance")

    for key, text in lines.items():
        entry = manifest.get(key, {})
        receipt = receipts.get(key, {})
        clip = OUT / str(entry.get("file", ""))
        stream = audio_stream(clip) if clip.is_file() else {}
        valid = (
            receipt.get("valid") is True
            and receipt.get("intended") == text
            and receipt.get("verifier") == "faster-whisper/base"
            and receipt.get("verifierRuntime") == {"device": "cpu", "computeType": "int8"}
            and receipt.get("ratio", 0) >= 0.78
            and receipt.get("normalization") == NORMALIZATION
            and entry.get("textHash") == text_hash(text)
            and clip.is_file()
            and clip.stat().st_size > 2_000
            and entry.get("sha256") == digest(clip) == receipt.get("sha256")
            and 0.3 <= duration(clip) <= 20
            and stream.get("codec_name") == "aac"
            and int(stream.get("channels", 0)) == 1
            and int(stream.get("sample_rate", 0)) == 44100
        )
        if not valid:
            failures.append(key)

    passed = len(lines) - sum(1 for key in lines if key in failures)
    print(f"voice check: {passed}/{len(lines)}; failures={failures}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", help="LAN wrapper base URL (or QLOBE_QWEN_URL)")
    parser.add_argument("--reference", help="approved teacher-voice WAV")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument(
        "--edge-fallback",
        action="store_true",
        help="explicitly allow en-US-AnaNeural fallback for unavailable/rejected Qwen lines",
    )
    parser.add_argument("--edge-voice", default=EDGE_VOICE)
    parser.add_argument("--edge-rate", default=EDGE_RATE)
    parser.add_argument("--edge-pitch", default=EDGE_PITCH)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    lines = json.loads(CONFIG.read_text(encoding="utf-8"))["voice"]
    write_json(OUT / "lines.json", lines)
    if args.check:
        return check(lines)
    try:
        return generate(args, lines)
    except Exception as error:
        write_json(OUT / "manifest.json", {})
        failure = {
            "format": "qlobe-voice-qa",
            "formatVersion": 1,
            "generatedAt": now(),
            "complete": False,
            "expectedCount": len(lines),
            "acceptedCount": 0,
            "fatalError": str(error),
            "entries": {},
        }
        write_json(OUT / "qa-report.json", failure)
        print(f"generation failed closed: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
