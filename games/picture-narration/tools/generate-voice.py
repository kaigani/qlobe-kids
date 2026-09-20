#!/usr/bin/env python3
"""Generate TaleTeller teacher narration and Whisper-QA every accepted clip."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
OUT = GAME / "assets" / "audio"
LINES_PATH = OUT / "lines.json"
SEEDS = (7, 8, 9)


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def run(command: list[str], timeout: int) -> subprocess.CompletedProcess:
    return subprocess.run(command, capture_output=True, text=True, timeout=timeout)


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}


def clone(api_url: str, voice_ref: Path, text: str, seed: int, output: Path) -> None:
    result = run([
        "curl", "-sS", "-X", "POST",
        f"{api_url}/workflows/qwen3-tts-voiceclone?sync=true",
        "-F", f"voice=@{voice_ref}",
        "-F", f"text={text}",
        "-F", f"seed={seed}",
        "--output", str(output),
        "--max-time", "900",
    ], 930)
    if result.returncode or not output.is_file() or output.stat().st_size < 2000:
        raise RuntimeError(result.stderr.strip() or "empty voice-clone response")


def encode(source: Path, destination: Path) -> None:
    result = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(source),
        "-vn", "-ac", "1", "-ar", "48000",
        "-af", "loudnorm=I=-18:TP=-2:LRA=9",
        "-c:a", "aac", "-b:a", "80k", "-movflags", "+faststart",
        str(destination),
    ], 180)
    if result.returncode or not destination.is_file() or destination.stat().st_size < 2000:
        raise RuntimeError(result.stderr.strip() or "ffmpeg failed")


def duration(path: Path) -> float:
    result = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path),
    ], 30)
    return round(float(result.stdout.strip()), 3)


def transcribe(api_url: str, audio: Path, intended: str) -> str:
    result = run([
        "curl", "-sS", "-X", "POST",
        f"{api_url}/workflows/whisper-stt?sync=true",
        "-F", f"audio=@{audio}",
        "-F", "model_size=base",
        "-F", "language=en",
        "-F", f"initial_prompt={intended}",
        "--max-time", "900",
    ], 930)
    if result.returncode:
        return ""
    try:
        return str(json.loads(result.stdout).get("text", "")).strip()
    except json.JSONDecodeError:
        return ""


def generate_one(api_url: str, voice_ref: Path, key: str, text: str) -> tuple[str, dict]:
    last_error = ""
    for seed in SEEDS:
        with tempfile.TemporaryDirectory(prefix="taleteller-voice-") as temp_name:
            temp = Path(temp_name)
            raw = temp / f"{key}-{seed}.flac"
            encoded = temp / f"{key}.m4a"
            try:
                clone(api_url, voice_ref, text, seed, raw)
                encode(raw, encoded)
                heard = transcribe(api_url, encoded, text)
                seconds = duration(encoded)
                similarity = SequenceMatcher(None, normalize(text), normalize(heard)).ratio()
            except Exception as error:
                last_error = f"seed {seed}: {error}"
                continue
            if 0.25 <= seconds <= 9 and similarity >= 0.76:
                destination = OUT / f"{key}.m4a"
                destination.write_bytes(encoded.read_bytes())
                return key, {
                    "engine": "qwen3-tts-voiceclone",
                    "voice": "voice-teacher",
                    "seed": seed,
                    "sourceText": text,
                    "textHash": text_hash(text),
                    "duration": seconds,
                    "transcript": heard,
                    "match": round(similarity, 3),
                    "valid": True,
                    "bytes": destination.stat().st_size,
                }
            last_error = f"seed {seed}: transcript match {similarity:.3f}, duration {seconds}, heard {heard!r}"
    return key, {"sourceText": text, "textHash": text_hash(text), "valid": False, "error": last_error}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", required=True)
    parser.add_argument("--voice-ref", required=True, type=Path)
    parser.add_argument("--missing-only", action="store_true")
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()

    lines = load_json(LINES_PATH)
    previous = load_json(OUT / "qa.json") if args.missing_only else {}
    qa: dict[str, dict] = {}
    pending: list[tuple[str, str]] = []
    for key, text in lines.items():
        prior = previous.get(key, {})
        if (
            args.missing_only
            and prior.get("valid")
            and prior.get("textHash") == text_hash(text)
            and (OUT / f"{key}.m4a").is_file()
        ):
            qa[key] = prior
        else:
            pending.append((key, text))

    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {
            pool.submit(generate_one, args.api_url.rstrip("/"), args.voice_ref, key, text): key
            for key, text in pending
        }
        for future in as_completed(futures):
            key, result = future.result()
            qa[key] = result
            print(f"{key}: {'accepted' if result.get('valid') else 'FAILED'}", flush=True)

    manifest = {
        key: {"file": f"{key}.m4a", "dur": qa[key]["duration"], "textHash": qa[key]["textHash"]}
        for key in lines
        if qa.get(key, {}).get("valid")
    }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (OUT / "qa.json").write_text(json.dumps(qa, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    failures = [key for key in lines if not qa.get(key, {}).get("valid")]
    print(f"accepted {len(lines) - len(failures)}/{len(lines)}")
    if failures:
        raise SystemExit("missing accepted clips: " + ", ".join(failures))


if __name__ == "__main__":
    main()
