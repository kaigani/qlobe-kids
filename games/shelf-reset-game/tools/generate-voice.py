#!/usr/bin/env python3
"""Clone and transcript-QA Shelf Reset's child-facing narration on the LAN API.

The private host is resolved from an argument, environment variable, or the
ignored Studio state file and is never written to repository artifacts. Calls
are grouped by model: TTS first, then Whisper, before advancing the seed ladder.
"""

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
OUT = GAME / "assets" / "audio"
LINES_PATH = OUT / "lines.json"
SEEDS = (7, 8, 9)
REQUIRED_WORDS = {
    "cubes-home": ("cube",),
    "praise-three": ("tidy",),
    "sparkling": ("neat", "sunny"),
}


def normalize(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def duration(path: Path, ffprobe: str) -> float:
    run = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, timeout=30,
    )
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return 0.0


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def local_url(cli_value: str | None) -> str:
    try:
        state = json.loads((ROOT / "tools" / "state" / "local.json").read_text("utf-8"))
    except Exception:
        state = {}
    return (cli_value or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")


def post_tts(curl: str, endpoint: str, voice: Path, text: str, seed: int, output: Path) -> bool:
    run = subprocess.run(
        [curl, "-sS", "-X", "POST", endpoint, "-F", f"voice=@{voice}",
         "-F", f"text={text}", "-F", f"seed={seed}", "--output", str(output),
         "--max-time", "900"],
        capture_output=True, timeout=930,
    )
    return run.returncode == 0 and output.is_file() and output.stat().st_size > 2_000


def post_whisper(curl: str, endpoint: str, audio: Path) -> str:
    run = subprocess.run(
        [curl, "-sS", "-X", "POST", endpoint, "-F", f"audio=@{audio}",
         "-F", "model_size=base", "-F", "language=en", "--max-time", "900"],
        capture_output=True, timeout=930,
    )
    try:
        return str(json.loads(run.stdout).get("text", "")).strip()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return ""


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--voice-ref", type=Path)
    parser.add_argument("--only", nargs="*", help="regenerate only these keys and merge existing QA/manifest")
    args = parser.parse_args()
    api = local_url(args.api_url)
    if not api:
        parser.error("pass --api-url, set QLOBE_QWEN_URL, or configure tools/state/local.json")
    voice = args.voice_ref or (ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav")
    if not voice.is_file():
        parser.error(f"voice reference not found: {voice}")
    curl = shutil.which("curl") or shutil.which("curl.exe")
    ffmpeg = shutil.which("ffmpeg")
    ffprobe = shutil.which("ffprobe")
    if not curl or not ffmpeg or not ffprobe:
        parser.error("curl, ffmpeg, and ffprobe are required")

    all_lines = json.loads(LINES_PATH.read_text("utf-8"))
    if args.only:
        unknown = sorted(set(args.only) - set(all_lines))
        if unknown:
            parser.error("unknown line key(s): " + ", ".join(unknown))
        lines = {key: all_lines[key] for key in args.only}
    else:
        lines = all_lines
    OUT.mkdir(parents=True, exist_ok=True)
    accepted: dict[str, dict] = {}
    qa: dict[str, dict] = {}
    if args.only:
        try:
            existing_manifest = json.loads((OUT / "manifest.json").read_text("utf-8"))
            accepted.update({key: value for key, value in existing_manifest.items() if key != "_v"})
        except Exception:
            pass
        try:
            qa.update(json.loads((OUT / "qa.json").read_text("utf-8")))
        except Exception:
            pass
    pending = list(lines)
    tts = f"{api}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{api}/workflows/whisper-stt?sync=true"

    with tempfile.TemporaryDirectory(prefix="shelf-reset-voice-") as temp_name:
        temp = Path(temp_name)
        for seed in SEEDS:
            if not pending:
                break
            candidates: dict[str, Path] = {}
            print(f"TTS seed {seed}: {len(pending)} line(s)", flush=True)
            for key in pending:
                raw = temp / f"{key}-{seed}.flac"
                encoded = temp / f"{key}-{seed}.m4a"
                if not post_tts(curl, tts, voice, lines[key], seed, raw):
                    qa[key] = {"intended": lines[key], "seed": seed, "heard": "", "ratio": 0,
                               "match": False, "status": "tts-failed"}
                    continue
                subprocess.run(
                    [ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(raw),
                     "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded)],
                    check=True, timeout=180,
                )
                candidates[key] = encoded

            print(f"Whisper seed {seed}: {len(candidates)} line(s)", flush=True)
            next_pending: list[str] = []
            for key in pending:
                encoded = candidates.get(key)
                if not encoded:
                    next_pending.append(key)
                    continue
                heard = post_whisper(curl, whisper, encoded)
                ratio = round(difflib.SequenceMatcher(None, normalize(lines[key]), normalize(heard)).ratio(), 3)
                heard_normalized = normalize(heard)
                required = REQUIRED_WORDS.get(key, ())
                words = heard_normalized.split()
                keywords_ok = all(word in words for word in required)
                if key == "pinecones-home":
                    keywords_ok = "pinecones" in words or ("pine" in words and "cones" in words)
                match = ratio >= 0.8 and keywords_ok
                qa[key] = {"intended": lines[key], "heard": heard, "ratio": ratio,
                           "match": match, "seed": seed, "requiredWords": list(required),
                           "keywordsOk": keywords_ok,
                           "status": "accepted" if match else "retry"}
                print(f"{key}: {ratio:.3f} {heard}", flush=True)
                if not match:
                    next_pending.append(key)
                    continue
                target = OUT / f"{key}.m4a"
                shutil.copyfile(encoded, target)
                accepted[key] = {"file": target.name, "dur": duration(target, ffprobe),
                                 "sha256": sha256(target),
                                 "textHash": hashlib.sha256(lines[key].encode("utf-8")).hexdigest()[:16]}
            pending = next_pending

    manifest = {"_v": "shelf-reset-voice-1", **accepted}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", "utf-8")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n", "utf-8")
    if pending:
        print("Rejected after retry ladder: " + ", ".join(pending), flush=True)
        return 1
    print(f"Accepted manifest {len(accepted)}/{len(all_lines)} lines", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
