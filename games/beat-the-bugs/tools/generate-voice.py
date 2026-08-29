#!/usr/bin/env python3
"""Generate and Whisper-QA Beat the Bugs cloned teacher-voice clips."""

from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games/beat-the-bugs"
OUT = GAME / "assets/audio"
STATE = ROOT / "tools/state/local.json"
FALLBACK_VOICE = ROOT / "shared/assets/refs/voice-teacher.wav"
SEEDS = (7, 8, 9)


def lines() -> dict[str, str]:
    value = json.loads((OUT / "lines.json").read_text(encoding="utf-8"))
    if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
        raise ValueError("lines.json must be an object of string key/text pairs")
    return value


def normalize(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def text_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def tool(name: str) -> str | None:
    return shutil.which(name) or ({"ffmpeg": "/usr/local/bin/ffmpeg", "ffprobe": "/usr/local/bin/ffprobe"}.get(name) if Path(f"/usr/local/bin/{name}").exists() else None)


def api_url(cli: str | None) -> str:
    if cli:
        return cli.rstrip("/")
    import os
    if os.environ.get("QLOBE_QWEN_URL"):
        return os.environ["QLOBE_QWEN_URL"].rstrip("/")
    try:
        value = json.loads(STATE.read_text(encoding="utf-8")).get("qwenUrl", "")
    except (FileNotFoundError, json.JSONDecodeError):
        value = ""
    return str(value).rstrip("/")


def voice_path() -> Path:
    try:
        value = json.loads(STATE.read_text(encoding="utf-8")).get("teacherVoicePath")
    except (FileNotFoundError, json.JSONDecodeError):
        value = None
    candidate = Path(value) if value else FALLBACK_VOICE
    return candidate if candidate.is_file() else FALLBACK_VOICE


def duration(path: Path, ffprobe: str) -> float:
    run = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(path)], capture_output=True, text=True, check=False)
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return 0.0


def generate_one(api: str, item: tuple[str, str], ffmpeg: str, ffprobe: str, voice: Path) -> tuple[str, dict]:
    key, expected = item
    tts = f"{api}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{api}/workflows/whisper-stt?sync=true"
    with tempfile.TemporaryDirectory(prefix="btb-voice-") as tmp:
        temp = Path(tmp)
        for seed in SEEDS:
            raw, encoded = temp / f"{seed}.flac", temp / f"{seed}.m4a"
            run = subprocess.run(["curl", "-sS", "-X", "POST", tts, "-F", f"voice=@{voice}", "-F", f"text={expected}", "-F", f"seed={seed}", "--output", str(raw), "--max-time", "900"], capture_output=True, timeout=930, check=False)
            if run.returncode or not raw.is_file() or raw.stat().st_size < 2000:
                continue
            encoded_run = subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(raw), "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded)], capture_output=True, timeout=180, check=False)
            if encoded_run.returncode or not encoded.is_file():
                continue
            dur = duration(encoded, ffprobe)
            if not 0.2 <= dur <= 9.0:
                continue
            check = subprocess.run(["curl", "-sS", "-X", "POST", whisper, "-F", f"audio=@{encoded}", "-F", "model_size=base", "-F", "language=en", "--max-time", "900"], capture_output=True, text=True, timeout=930, check=False)
            try:
                transcript = str(json.loads(check.stdout).get("text", "")).strip()
            except (json.JSONDecodeError, TypeError):
                transcript = ""
            ratio = difflib.SequenceMatcher(None, normalize(expected), normalize(transcript)).ratio()
            if ratio >= 0.80:
                destination = OUT / f"{key}.m4a"
                destination.write_bytes(encoded.read_bytes())
                return key, {"status": "ok", "seed": seed, "match": round(ratio, 3), "transcript": transcript, "expected": expected, "dur": dur, "engine": "qwen3-tts-voiceclone", "whisperEngine": "whisper-stt/base/en"}
        return key, {"status": "FAIL", "seed": None, "match": 0, "transcript": "", "expected": expected, "dur": 0, "engine": "qwen3-tts-voiceclone", "whisperEngine": "whisper-stt/base/en"}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--missing-only", action="store_true")
    parser.add_argument("--check", action="store_true", help="Validate configuration and tools without API calls or writes")
    args = parser.parse_args()
    if args.workers < 1:
        parser.error("--workers must be at least 1")
    try:
        script = lines()
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"check failed: {exc}")
        return 1
    ffmpeg, ffprobe, voice, api = tool("ffmpeg"), tool("ffprobe"), voice_path(), api_url(args.api_url)
    missing = [key for key in script if not (OUT / f"{key}.m4a").is_file()]
    if args.check:
        problems = []
        if not api: problems.append("API URL is not configured")
        if not ffmpeg: problems.append("ffmpeg unavailable")
        if not ffprobe: problems.append("ffprobe unavailable")
        if not voice.is_file(): problems.append("voice reference unavailable")
        print(f"lines: {len(script)}; existing: {len(script) - len(missing)}; missing: {len(missing)}")
        if problems:
            print("check failed: " + "; ".join(problems))
            return 1
        print("check: ready")
        return 0
    if not api or not ffmpeg or not ffprobe or not voice.is_file():
        print("generation failed: incomplete local configuration")
        return 1
    OUT.mkdir(parents=True, exist_ok=True)
    old_manifest = old_qa = {}
    if args.missing_only:
        try:
            old_manifest, old_qa = json.loads((OUT / "manifest.json").read_text()), json.loads((OUT / "qa.json").read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            pass
    retained = {k for k, text in script.items() if (OUT / f"{k}.m4a").is_file() and old_manifest.get(k, {}).get("textHash") == text_hash(text)}
    pending = [(k, text) for k, text in script.items() if k not in retained]
    qa = {k: old_qa.get(k, {"status": "retained", "seed": None, "match": 1, "transcript": text, "expected": text, "engine": "retained", "whisperEngine": "retained"}) for k, text in script.items() if k in retained}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for key, result in pool.map(lambda item: generate_one(api, item, ffmpeg, ffprobe, voice), pending):
            qa[key] = result
            print(f"{key}: {result['status']} match={result['match']}", flush=True)
    manifest = {k: {"file": f"{k}.m4a", "dur": duration(OUT / f"{k}.m4a", ffprobe), "textHash": text_hash(text)} for k, text in script.items() if (OUT / f"{k}.m4a").is_file()}
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    failures = [k for k in script if k not in manifest or qa.get(k, {}).get("status") == "FAIL"]
    print(f"complete: {len(manifest)}/{len(script)}; failures={failures}", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
