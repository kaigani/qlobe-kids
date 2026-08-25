#!/usr/bin/env python3
"""Generate and transcript-QA Post Office Letters narration.

The LAN endpoint and teacher reference are supplied at runtime (environment or
the local Studio state file); neither is written to repository artifacts.
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

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games/post-office-letters"
AUDIO = GAME / "assets/audio"
SEEDS = (7, 8, 9)
WORKSPACE_REFERENCE = ROOT / "games/kindness-delivery/assets/audio/bunny-invite.m4a"


def norm(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def duration(path: Path) -> float:
    probe = shutil.which("ffprobe") or "/usr/local/bin/ffprobe"
    out = subprocess.run([probe, "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                         check=True, capture_output=True, text=True).stdout.strip()
    return round(float(out), 3)


def post(endpoint: str, fields: list[str], output: Path, timeout: int) -> bool:
    run = subprocess.run(["curl", "-sS", "-X", "POST", endpoint, *sum((["-F", f] for f in fields), []),
                          "--output", str(output), "--max-time", str(timeout)],
                         capture_output=True, timeout=timeout + 30)
    return run.returncode == 0 and output.exists() and output.stat().st_size > 2000


def transcribe(endpoint: str, clip: Path, timeout: int) -> str:
    run = subprocess.run(["curl", "-sS", "-X", "POST", endpoint,
                          "-F", f"audio=@{clip}", "-F", "model_size=base", "-F", "language=en",
                          "--max-time", str(timeout)], capture_output=True, text=True,
                         timeout=timeout + 30)
    try:
        return str(json.loads(run.stdout).get("text", "")).strip()
    except (json.JSONDecodeError, TypeError):
        return ""


def load_settings(args: argparse.Namespace) -> tuple[str, Path]:
    state = ROOT / "tools/state/local.json"
    doc = json.loads(state.read_text()) if state.exists() else {}
    api = (args.api_url or os.environ.get("QLOBE_QWEN_URL") or doc.get("qwenUrl") or "").rstrip("/")
    voice = Path(args.voice_ref or os.environ.get("QLOBE_TEACHER_VOICE") or doc.get("teacherVoicePath", ""))
    if voice.is_file():
        try:
            with voice.open("rb") as handle:
                handle.read(1)
        except OSError:
            voice = WORKSPACE_REFERENCE
    if not api or not voice.is_file():
        raise SystemExit("configured LAN API and teacher reference are required")
    return api, voice


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--voice-ref")
    parser.add_argument("--timeout", type=int, default=300)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    lines = json.loads((AUDIO / "lines.json").read_text())
    if args.dry_run:
        print(f"planned {len(lines)} clips; existing accepted clips are resumable")
        return 0
    api, voice = load_settings(args)
    tts = f"{api}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{api}/workflows/whisper-stt?sync=true"
    AUDIO.mkdir(parents=True, exist_ok=True)
    manifest = {}
    previous_qa_path = AUDIO / "qa.json"
    qa = json.loads(previous_qa_path.read_text()) if previous_qa_path.exists() else {}
    with tempfile.TemporaryDirectory(prefix="post-office-voice-") as tmp:
        scratch = Path(tmp)
        for key, text in lines.items():
            dest = AUDIO / f"{key}.m4a"
            old = qa.get(key, {})
            if dest.exists() and 0.2 < duration(dest) < 12 and old.get("text") == text and float(old.get("ratio", 0)) >= .8:
                qa[key] = old | {"status": "skip"}
            else:
                result = None
                for seed in SEEDS:
                    raw = scratch / f"{key}-{seed}.flac"
                    encoded = scratch / f"{key}-{seed}.m4a"
                    if not post(tts, [f"voice=@{voice}", f"text={text}", f"seed={seed}"], raw, args.timeout):
                        continue
                    subprocess.run([shutil.which("ffmpeg") or "/usr/local/bin/ffmpeg", "-y", "-loglevel", "error",
                                    "-i", str(raw), "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded)], check=True)
                    heard = transcribe(whisper, encoded, args.timeout)
                    ratio = difflib.SequenceMatcher(None, norm(text), norm(heard)).ratio()
                    if ratio >= .8 and 0.2 < duration(encoded) < 12:
                        shutil.copy2(encoded, dest)
                        result = {"status": "pass", "seed": seed, "text": text, "heard": heard, "ratio": round(ratio, 3)}
                        break
                qa[key] = result or {"status": "rejected", "text": text, "heard": "", "ratio": 0}
            if dest.exists():
                manifest[key] = {"file": dest.name, "dur": duration(dest),
                                 "textHash": hashlib.sha256(text.encode()).hexdigest()[:16]}
            (AUDIO / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
            (AUDIO / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
            print(f"{key}: {qa[key]['status']}", flush=True)
    rejected = [k for k, v in qa.items() if v["status"] == "rejected"]
    print(f"complete: {len(manifest)}/{len(lines)} accepted; rejected={len(rejected)}")
    return 1 if rejected else 0


if __name__ == "__main__":
    raise SystemExit(main())
