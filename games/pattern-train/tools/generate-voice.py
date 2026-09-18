#!/usr/bin/env python3
"""Generate and Whisper-QA Pattern Train narration with approved local models.

Pass the private LAN base URL with --api or QLOBE_QWEN_URL. Publication is
fail-closed: manifest.json stays empty unless every configured line passes.
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
import tempfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
CONFIG = GAME / "config.json"
OUT = GAME / "assets" / "audio"
DEFAULT_REF = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
SEEDS = (7, 8, 9)


def run(command: list[str], timeout: int = 930) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return subprocess.CompletedProcess(command, 124, "", f"timeout after {timeout}s")


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
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                  "-of", "csv=p=0", str(path)], 30)
    try:
        return round(float(result.stdout.strip()), 3)
    except (TypeError, ValueError):
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
                  "-af", "volumedetect", "-f", "null", "-"], 60)
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


def write_json(path: Path, payload: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    temporary.replace(path)


def synthesize(api: str, reference: Path, key: str, text: str,
               seed: int, stage: Path) -> tuple[str, Path | None, str]:
    raw, encoded = stage / f"{key}-{seed}.flac", stage / f"{key}-{seed}.mp3"
    request = run(["curl", "-sS", "-X", "POST",
                   f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
                   "-F", f"voice=@{reference}", "-F", f"text={text}",
                   "-F", f"seed={seed}", "--output", str(raw), "--max-time", "900"])
    if request.returncode or not raw.exists() or raw.stat().st_size < 2_000:
        size = raw.stat().st_size if raw.exists() else 0
        return key, None, f"seed {seed}: TTS failed rc={request.returncode}, bytes={size}"
    encode = run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                  "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-ac", "1", "-ar", "44100",
                  "-c:a", "libmp3lame", "-b:a", "96k", str(encoded)], 90)
    if encode.returncode or not encoded.exists() or encoded.stat().st_size < 2_000:
        return key, None, f"seed {seed}: encode failed"
    return key, encoded, ""


def transcribe(api: str, key: str, text: str, seed: int | str,
               clip: Path) -> tuple[str, dict | None, str]:
    request = run(["curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
                   "-F", f"audio=@{clip}", "-F", "model_size=base", "-F", "language=en",
                   "-F", f"initial_prompt={text}", "--max-time", "900"])
    try:
        heard = str(json.loads(request.stdout).get("text", "")).strip()
    except json.JSONDecodeError:
        heard = ""
    words_ok, ratio = transcript_ok(text, heard)
    seconds, volume = duration(clip), mean_volume(clip)
    audio_ok = 0.3 <= seconds <= 20 and volume is not None and -38 <= volume <= -4
    if request.returncode or not words_ok or not audio_ok:
        detail = f"heard={heard!r}, ratio={ratio}, duration={seconds}, meanVolumeDb={volume}"
        return key, None, f"seed {seed}: {detail}"
    return key, {
        "valid": True,
        "engine": "qwen3-tts-voiceclone",
        "verifier": "whisper-stt/base",
        "voice": "platform-teacher-narrator",
        "seed": seed,
        "intended": text,
        "heard": heard,
        "ratio": ratio,
        "duration": seconds,
        "meanVolumeDb": volume,
        "bytes": clip.stat().st_size,
        "sha256": digest(clip),
        "textHash": text_hash(text),
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }, ""


def verify_existing(api: str, lines: dict[str, str], workers: int) -> tuple[dict, dict]:
    accepted, failures = {}, {}
    # Every published candidate begins at the canonical seed-7 rung. Existing
    # files are re-verified here, so retaining that seed is accurate provenance.
    jobs = [(api, key, text, 7, OUT / f"{key}.mp3")
            for key, text in lines.items() if (OUT / f"{key}.mp3").is_file()]
    print(f"Whisper-checking {len(jobs)} existing clips", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        for key, receipt, error in pool.map(lambda values: transcribe(*values), jobs):
            if receipt:
                accepted[key] = receipt
                print(f"{key}: existing accepted", flush=True)
            else:
                failures[key] = error
                print(f"{key}: existing rejected ({error})", flush=True)
    return accepted, failures


def generate(args: argparse.Namespace, lines: dict[str, str]) -> int:
    api = (args.api or os.environ.get("QLOBE_QWEN_URL") or "").rstrip("/")
    reference = Path(args.reference) if args.reference else DEFAULT_REF
    if not api:
        raise RuntimeError("pass --api or set QLOBE_QWEN_URL")
    if not reference.is_file():
        raise RuntimeError("approved teacher voice reference is missing")
    workers = max(1, min(3, args.workers))
    receipts, failures = verify_existing(api, lines, workers)
    pending = {key: text for key, text in lines.items() if key not in receipts}

    with tempfile.TemporaryDirectory(prefix="pattern-train-voice-") as folder:
        stage = Path(folder)
        for seed in SEEDS:
            if not pending:
                break
            batch = list(pending.items())
            print(f"seed {seed}: generating {len(batch)}", flush=True)
            jobs = [(api, reference, key, text, seed, stage) for key, text in batch]
            candidates = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                for key, clip, error in pool.map(lambda values: synthesize(*values), jobs):
                    if clip:
                        candidates[key] = clip
                    else:
                        failures[key] = error
            print(f"seed {seed}: Whisper-checking {len(candidates)}", flush=True)
            checks = [(api, key, pending[key], seed, clip) for key, clip in candidates.items()]
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                for key, receipt, error in pool.map(lambda values: transcribe(*values), checks):
                    if not receipt:
                        failures[key] = error
                        print(f"{key}: retry ({error})", flush=True)
                        continue
                    destination = OUT / f"{key}.mp3"
                    shutil.copy2(candidates[key], destination)
                    receipt.update({"bytes": destination.stat().st_size, "sha256": digest(destination)})
                    receipts[key] = receipt
                    pending.pop(key, None)
                    failures.pop(key, None)
                    print(f"{key}: accepted seed {seed}", flush=True)

    reference_hash = digest(reference)
    for receipt in receipts.values():
        receipt["referenceSha256"] = reference_hash
    for key, text in pending.items():
        receipts[key] = {"valid": False, "intended": text, "textHash": text_hash(text),
                         "error": failures.get(key, "no successful candidate")}
    manifest = {key: {"file": f"{key}.mp3", "dur": receipt["duration"],
                      "sha256": receipt["sha256"], "textHash": text_hash(lines[key]),
                      "seed": receipt["seed"]}
                for key, receipt in receipts.items() if receipt.get("valid") is True}
    qa = {"generatedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "engine": "qwen3-tts-voiceclone", "verifier": "whisper-stt/base",
          "voiceReferenceSha256": reference_hash, "entries": receipts}
    write_json(OUT / "qa-report.json", qa)
    write_json(OUT / "manifest.json", manifest if not pending else {})
    print(f"complete: {len(manifest)}/{len(lines)}; failures={list(pending)}", flush=True)
    return 1 if pending else 0


def check(lines: dict[str, str]) -> int:
    try:
        manifest = json.loads((OUT / "manifest.json").read_text(encoding="utf-8"))
        qa = json.loads((OUT / "qa-report.json").read_text(encoding="utf-8"))["entries"]
    except (FileNotFoundError, json.JSONDecodeError, KeyError) as error:
        print(f"voice check failed: {error}")
        return 1
    failures = []
    for key, text in lines.items():
        entry, receipt = manifest.get(key, {}), qa.get(key, {})
        clip = OUT / str(entry.get("file", ""))
        valid = (receipt.get("valid") is True and receipt.get("intended") == text
                 and receipt.get("ratio", 0) >= 0.78 and entry.get("textHash") == text_hash(text)
                 and clip.is_file() and clip.stat().st_size > 2_000
                 and entry.get("sha256") == digest(clip) and 0.3 <= duration(clip) <= 20)
        if not valid:
            failures.append(key)
    print(f"voice check: {len(lines) - len(failures)}/{len(lines)}; failures={failures}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", help="LAN wrapper base URL (or QLOBE_QWEN_URL)")
    parser.add_argument("--reference", help="approved teacher-voice WAV")
    parser.add_argument("--workers", type=int, default=2)
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
        print(f"generation failed closed: {error}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
