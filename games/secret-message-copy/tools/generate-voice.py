#!/usr/bin/env python3
"""Generate and independently verify Secret Message Copy narration.

Qwen voice clone is the preferred authoring path. ``--allow-edge-fallback`` is
an explicit, auditable fallback: failed Qwen lines may use en-US-AnaNeural, but
only after the same mono-AAC pipeline and local faster-whisper/base verification.
Publication is fail-closed: one missing or rejected line leaves manifest.json
empty, so the game safely uses its Web Speech fallback instead of a partial set.
"""
from __future__ import annotations

import argparse
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
LOCAL_STATE = ROOT / "tools" / "state" / "local.json"
DEFAULT_REF = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9, 10)
EDGE_VOICE = "en-US-AnaNeural"
EDGE_RATE = "-8%"
EDGE_PITCH = "+2Hz"
NORMALIZATION = "loudnorm=I=-18:TP=-2:LRA=7"
WHISPER_MODEL = "base"
WHISPER_DEVICE = "cpu"
WHISPER_COMPUTE = "int8"
QWEN_FAILED_REASON = (
    "Qwen voice clone failed after the configured retry seeds; "
    "Edge TTS fallback was explicitly authorized."
)
SPELLING_SYNTHESIS = {
    "word-sun": {"text": "The letters are S, U, N. They spell sun, like sunshine.", "letters": ("s", "u", "n"), "word": ("sun", "son")},
    "word-cat": {"text": "C. A. T. The word is cat, like a kitty cat.", "letters": ("c", "a", "t"), "word": ("cat",)},
    "word-map": {"text": "The letters are M, A, P. They spell map, like treasure map.", "letters": ("m", "a", "p"), "word": ("map",)},
    "word-owl": {"text": "The letters are O, W, L. A night bird is an owl. Owl.", "letters": ("o", "w", "l"), "word": ("owl",)},
}
LETTER_TOKENS = {
    "a": {"a", "ay", "aye"},
    "c": {"c", "see", "sea"},
    "l": {"l", "ell"},
    "m": {"m", "em"},
    "n": {"n", "en"},
    "o": {"o", "oh"},
    "p": {"p", "pee", "pea"},
    "s": {"s", "ess"},
    "t": {"t", "tee", "tea"},
    "u": {"u", "you", "yew"},
    "w": {"w", "doubleyou"},
}


def utc_now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def run(command: list[str], timeout: int = 930) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout, check=False)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(command, 124, "", "timeout")
    except OSError:
        return subprocess.CompletedProcess(command, 127, "", "process unavailable")


def read_json(path: Path, fallback: object) -> object:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return fallback


def write_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def lines_from_config() -> dict[str, str]:
    config = read_json(CONFIG, {})
    if not isinstance(config, dict) or not isinstance(config.get("voice"), dict):
        raise RuntimeError("config.json has no voice table")
    return {str(key): str(text) for key, text in config["voice"].items()}


def normalized(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def spelling_semantics_ok(key: str, heard: str) -> bool:
    """Require three spoken letter names in order, then the completed word."""
    spec = SPELLING_SYNTHESIS[key]
    prepared = re.sub(r"\bdouble\s+(?:you|u)\b", "doubleyou", heard.lower())
    tokens = re.findall(r"[a-z]+", prepared)
    cursor = 0
    for letter in spec["letters"]:
        aliases = LETTER_TOKENS[letter]
        found = next((index for index in range(cursor, len(tokens)) if tokens[index] in aliases), None)
        if found is None:
            return False
        cursor = found + 1
    # The final whole word must occur after the spelling. SUN additionally
    # accepts the genuine homophone "son"; no other broad phonetic matching.
    return any(token in spec["word"] for token in tokens[cursor:])


def transcript_ok(key: str, expected: str, heard: str) -> tuple[bool, float, float]:
    want = normalized(expected)
    got = normalized(heard)
    ratio = round(difflib.SequenceMatcher(None, want, got).ratio(), 3)
    words = want.split()
    got_words = got.split()
    coverage = round(sum(word in got_words for word in words) / max(1, len(words)), 3)
    if key in SPELLING_SYNTHESIS:
        accepted = spelling_semantics_ok(key, heard)
    elif len(words) <= 2:
        accepted = all(word in got_words for word in words) and ratio >= 0.78
    else:
        accepted = ratio >= 0.86 and coverage >= 0.88
    return accepted, ratio, coverage


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def duration(path: Path) -> float:
    result = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], 30)
    try:
        return round(float(result.stdout.strip()), 3)
    except (TypeError, ValueError):
        return 0.0


def audio_stream(path: Path) -> dict[str, Any]:
    result = run([
        "ffprobe", "-v", "error", "-select_streams", "a:0",
        "-show_entries", "stream=codec_name,channels,sample_rate", "-of", "json", str(path),
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


def encode_m4a(source: Path, destination: Path) -> str:
    result = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(source),
        "-af", NORMALIZATION, "-ac", "1", "-ar", "44100",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(destination),
    ], 90)
    if result.returncode or not destination.exists() or destination.stat().st_size < 2_000:
        return "AAC encode failed"
    stream = audio_stream(destination)
    if stream.get("codec_name") != "aac" or int(stream.get("channels", 0)) != 1:
        return "encoded stream is not mono AAC"
    return ""


def load_whisper():
    try:
        from faster_whisper import WhisperModel
    except ImportError as error:
        raise RuntimeError("faster-whisper is required for fail-closed voice QA") from error
    print(f"loading faster-whisper/{WHISPER_MODEL} ({WHISPER_DEVICE} {WHISPER_COMPUTE})", flush=True)
    return WhisperModel(WHISPER_MODEL, device=WHISPER_DEVICE, compute_type=WHISPER_COMPUTE)


def verify_clip(
    model,
    key: str,
    expected: str,
    clip: Path,
    source: dict[str, Any],
) -> tuple[dict[str, Any] | None, str]:
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
    except Exception as error:
        return None, f"faster-whisper failed: {type(error).__name__}"

    words_ok, ratio, coverage = transcript_ok(key, expected, heard)
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
        return None, (
            f"heard={heard!r}, ratio={ratio}, coverage={coverage}, duration={seconds}, "
            f"meanVolumeDb={volume}, codec={stream.get('codec_name')}"
        )

    receipt: dict[str, Any] = {
        "valid": True,
        **source,
        "verifier": "faster-whisper/base",
        "verifierRuntime": {"device": WHISPER_DEVICE, "computeType": WHISPER_COMPUTE},
        "key": key,
        "intended": expected,
        "heard": heard,
        "ratio": ratio,
        "coverage": coverage,
        "language": "en",
        "languageProbability": language_probability,
        "duration": seconds,
        "meanVolumeDb": volume,
        "codec": stream.get("codec_name"),
        "channels": int(stream.get("channels", 0)),
        "sampleRate": int(stream.get("sample_rate", 0)),
        "normalization": NORMALIZATION,
        "bytes": clip.stat().st_size,
        "sha256": file_hash(clip),
        "textHash": text_hash(expected),
        "checkedAt": utc_now(),
    }
    return receipt, ""


def synthesize_qwen(api: str, reference: Path, key: str, text: str, seed: int, stage: Path) -> Path | None:
    raw = stage / f"{key}-qwen-{seed}.flac"
    encoded = stage / f"{key}-qwen-{seed}.m4a"
    result = run([
        "curl", "-sS", "-X", "POST", f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
        "-F", f"voice=@{reference}", "-F", f"text={text}", "-F", f"seed={seed}",
        "--output", str(raw), "--max-time", "900",
    ])
    if result.returncode or not raw.exists() or raw.stat().st_size < 2_000:
        return None
    return None if encode_m4a(raw, encoded) else encoded


def synthesize_edge(key: str, text: str, stage: Path, voice: str, rate: str, pitch: str) -> Path | None:
    raw = stage / f"{key}-edge.mp3"
    encoded = stage / f"{key}-edge.m4a"
    result = run([
        sys.executable, "-m", "edge_tts", "--voice", voice,
        f"--rate={rate}", f"--pitch={pitch}", "--text", text,
        "--write-media", str(raw),
    ], 180)
    if result.returncode or not raw.exists() or raw.stat().st_size < 2_000:
        return None
    return None if encode_m4a(raw, encoded) else encoded


def qwen_setup_reason(api: str, reference: Path) -> str:
    if not api:
        return "Qwen voice clone was not configured for this explicit fallback run."
    if not reference.is_file():
        return "Qwen voice clone could not run because the approved voice reference was unavailable."
    return ""


def generation(args: argparse.Namespace, lines: dict[str, str]) -> int:
    local = read_json(LOCAL_STATE, {})
    if not isinstance(local, dict):
        local = {}
    api = str(args.api or os.getenv("QLOBE_QWEN_URL") or local.get("qwenUrl", "")).rstrip("/")
    reference_value = args.reference or os.getenv("QLOBE_VOICE_REF") or local.get("teacherVoicePath")
    reference = Path(reference_value).expanduser() if reference_value else DEFAULT_REF
    setup_reason = qwen_setup_reason(api, reference)
    allow_edge = bool(args.allow_edge_fallback)
    selected = set(args.only or lines)
    unknown = selected.difference(lines)
    if unknown:
        raise RuntimeError("--only did not match configured keys: " + ", ".join(sorted(unknown)))
    if setup_reason and not allow_edge:
        raise RuntimeError(setup_reason)

    # Empty first so an interruption can never leave a stale publishable set.
    write_json(OUT / "manifest.json", {})
    model = load_whisper()
    receipts: dict[str, dict[str, Any]] = {}
    candidates: dict[str, Path] = {}
    prior_report = read_json(OUT / "qa-report.json", {})
    prior_entries = prior_report.get("entries", {}) if isinstance(prior_report, dict) else {}
    if not isinstance(prior_entries, dict):
        prior_entries = {}
    qwen_attempted = False
    qwen_failed = False

    with tempfile.TemporaryDirectory(prefix="secret-message-voice-") as temp_dir:
        stage = Path(temp_dir)
        for key, text in lines.items():
            destination = OUT / f"{key}.m4a"
            # Resume from an already-published clip unless this key was forced.
            if destination.is_file() and key not in selected and not args.force:
                prior = prior_entries.get(key, {}) if isinstance(prior_entries.get(key), dict) else {}
                source = {
                    field: prior[field]
                    for field in ("engine", "voice", "seed", "rate", "pitch", "synthesisText", "fallbackFrom", "fallbackReason", "referenceSha256")
                    if prior.get(field) is not None
                }
                if not source:
                    source = {"engine": "existing-verified", "voice": "unknown"}
                receipt, _ = verify_clip(model, key, text, destination, source)
                if receipt:
                    receipts[key] = receipt
                    candidates[key] = destination
                    continue

            accepted: Path | None = None
            receipt: dict[str, Any] | None = None
            if not setup_reason:
                qwen_attempted = True
                for seed in SEEDS:
                    generated = synthesize_qwen(api, reference, key, text, seed, stage)
                    if not generated:
                        continue
                    receipt, error = verify_clip(model, key, text, generated, {
                        "engine": "qwen3-tts-voiceclone",
                        "voice": "platform-teacher-narrator",
                        "seed": seed,
                        "referenceSha256": file_hash(reference),
                    })
                    if receipt:
                        accepted = generated
                        print(f"{key}: Qwen accepted seed {seed}", flush=True)
                        break
                    print(f"{key}: Qwen candidate rejected ({error})", flush=True)

            if not accepted:
                qwen_failed = True
                fallback_reason = setup_reason or QWEN_FAILED_REASON
                if allow_edge:
                    synthesis_text = SPELLING_SYNTHESIS.get(key, {}).get("text", text)
                    generated = synthesize_edge(key, synthesis_text, stage, args.edge_voice, args.edge_rate, args.edge_pitch)
                    if generated:
                        receipt, error = verify_clip(model, key, text, generated, {
                            "engine": "edge-tts",
                            "voice": args.edge_voice,
                            "rate": args.edge_rate,
                            "pitch": args.edge_pitch,
                            "synthesisText": synthesis_text,
                            "fallbackFrom": "qwen3-tts-voiceclone",
                            "fallbackReason": fallback_reason,
                        })
                        if receipt:
                            accepted = generated
                            print(f"{key}: Edge fallback accepted", flush=True)
                        else:
                            print(f"{key}: Edge fallback rejected ({error})", flush=True)
                if not receipt:
                    receipt = {
                        "valid": False,
                        "key": key,
                        "intended": text,
                        "synthesisText": SPELLING_SYNTHESIS.get(key, {}).get("text", text),
                        "textHash": text_hash(text),
                        "fallbackFrom": "qwen3-tts-voiceclone" if allow_edge else None,
                        "fallbackReason": fallback_reason,
                        "error": "No candidate passed local faster-whisper and audio QA.",
                    }

            receipts[key] = receipt or {"valid": False, "key": key, "intended": text}
            if accepted:
                candidates[key] = accepted

        complete = set(candidates) == set(lines) and all(receipts.get(key, {}).get("valid") is True for key in lines)
        qwen_reason = setup_reason or (QWEN_FAILED_REASON if qwen_failed else None)
        report = {
            "format": "qlobe-voice-qa",
            "formatVersion": 1,
            "generatedAt": utc_now(),
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
                "attempted": qwen_attempted,
                "status": "fallback-used" if any(value.get("engine") == "edge-tts" for value in receipts.values()) else ("accepted-all" if complete else "incomplete"),
                "reason": qwen_reason,
            },
            "edgeFallback": {
                "enabled": allow_edge,
                "used": any(value.get("engine") == "edge-tts" for value in receipts.values()),
                "voice": args.edge_voice,
                "rate": args.edge_rate,
                "pitch": args.edge_pitch,
            },
            "entries": receipts,
        }

        if complete:
            for key in lines:
                destination = OUT / f"{key}.m4a"
                candidate = candidates[key]
                if candidate.resolve() != destination.resolve():
                    shutil.copy2(candidate, destination)
                receipts[key]["bytes"] = destination.stat().st_size
                receipts[key]["sha256"] = file_hash(destination)
            manifest = {
                key: {
                    "file": f"{key}.m4a",
                    "dur": receipts[key]["duration"],
                    "sha256": receipts[key]["sha256"],
                    "textHash": text_hash(text),
                    "engine": receipts[key]["engine"],
                    "voice": receipts[key]["voice"],
                }
                for key, text in lines.items()
            }
            write_json(OUT / "qa-report.json", report)
            write_json(OUT / "qa.json", receipts)
            write_json(OUT / "manifest.json", manifest)
            print(f"complete: {len(manifest)}/{len(lines)} verified; fail-closed publication passed", flush=True)
            return 0

        # Keep verified candidates as resumable staging artifacts while the
        # empty manifest keeps runtime publication fail-closed.
        for key, candidate in candidates.items():
            destination = OUT / f"{key}.m4a"
            if candidate.resolve() != destination.resolve():
                shutil.copy2(candidate, destination)
            receipts[key]["bytes"] = destination.stat().st_size
            receipts[key]["sha256"] = file_hash(destination)
        write_json(OUT / "qa-report.json", report)
        write_json(OUT / "qa.json", receipts)
        write_json(OUT / "manifest.json", {})
        failures = [key for key in lines if not receipts.get(key, {}).get("valid")]
        print(f"complete: {len(lines) - len(failures)}/{len(lines)}; failures={failures}", flush=True)
        return 1


def check_existing(lines: dict[str, str]) -> int:
    manifest = read_json(OUT / "manifest.json", {})
    report = read_json(OUT / "qa-report.json", {})
    if not isinstance(manifest, dict) or not isinstance(report, dict):
        print("voice check failed: manifest or QA report missing")
        return 1
    model = load_whisper()
    failures: list[str] = []
    receipts: dict[str, dict[str, Any]] = {}
    if set(manifest) != set(lines) or report.get("complete") is not True:
        failures.append("manifest/report key set")
    for key, text in lines.items():
        entry = manifest.get(key, {}) if isinstance(manifest.get(key), dict) else {}
        clip = OUT / str(entry.get("file", ""))
        source = {
            "engine": entry.get("engine"),
            "voice": entry.get("voice"),
        }
        prior = report.get("entries", {}).get(key, {}) if isinstance(report.get("entries"), dict) else {}
        if prior.get("fallbackFrom"):
            source.update({
                "fallbackFrom": prior.get("fallbackFrom"),
                "fallbackReason": prior.get("fallbackReason"),
                "rate": prior.get("rate"),
                "pitch": prior.get("pitch"),
            })
        receipt, error = verify_clip(model, key, text, clip, source) if clip.is_file() else (None, "missing clip")
        if not receipt or entry.get("textHash") != text_hash(text) or entry.get("sha256") != file_hash(clip):
            failures.append(key)
            receipts[key] = {"valid": False, "error": error}
        else:
            receipts[key] = receipt
    print(f"voice check: {len(lines) - sum(key in failures for key in lines)}/{len(lines)}; failures={failures}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url", "--base-url", "--api", dest="api")
    parser.add_argument("--voice-ref", "--teacher", "--reference", dest="reference")
    parser.add_argument("--only", action="append")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument(
        "--allow-edge-fallback", "--edge-fallback",
        dest="allow_edge_fallback", action="store_true",
        help="explicitly allow en-US-AnaNeural for Qwen lines that fail",
    )
    parser.add_argument("--edge-voice", default=EDGE_VOICE)
    parser.add_argument("--edge-rate", default=EDGE_RATE)
    parser.add_argument("--edge-pitch", default=EDGE_PITCH)
    args = parser.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    lines = lines_from_config()
    write_json(OUT / "lines.json", lines)
    if args.check:
        return check_existing(lines)
    try:
        return generation(args, lines)
    except Exception as error:
        write_json(OUT / "manifest.json", {})
        write_json(OUT / "qa-report.json", {
            "format": "qlobe-voice-qa",
            "formatVersion": 1,
            "generatedAt": utc_now(),
            "complete": False,
            "expectedCount": len(lines),
            "acceptedCount": 0,
            "fatalError": f"{type(error).__name__}: {error}",
            "entries": {},
        })
        print(f"generation failed closed: {type(error).__name__}: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
