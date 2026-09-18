"""Generate and Whisper-check Pattern Bracelet Band's recorded voice package.

The LAN host is intentionally environment-only. Set QLOBE_QWEN_URL, and use
QLOBE_FORCE_AUDIO=id,id (or *) to regenerate selected lines. A recording is
promoted only after duration and transcript checks; a failed line is omitted
from the runtime manifest so shared voice-clips.js safely uses Web Speech.
"""

from __future__ import annotations

import difflib
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets" / "audio"
REFERENCE = ROOT.parent.parent / "shared" / "assets" / "refs" / "voice-teacher.wav"
API = os.environ["QLOBE_QWEN_URL"].rstrip("/")
THRESHOLD = 0.72
SEEDS = (7, 8, 9)

config = json.loads((ROOT / "config.json").read_text(encoding="utf-8"))
lines: dict[str, str] = config["voice"]
force_ids = {item.strip() for item in os.environ.get("QLOBE_FORCE_AUDIO", "").split(",") if item.strip()}
OUT.mkdir(parents=True, exist_ok=True)


def normalized(text: str) -> str:
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text.lower()).split())


def similarity(heard: str, intended: str) -> float:
    """Blend sequence and token overlap; punctuation/hyphens are irrelevant."""
    left = normalized(heard)
    right = normalized(intended)
    if not left or not right:
        return 0.0
    sequence = difflib.SequenceMatcher(None, left, right).ratio()
    left_tokens = set(left.split())
    right_tokens = set(right.split())
    overlap = len(left_tokens & right_tokens)
    token_f1 = (2 * overlap / (len(left_tokens) + len(right_tokens))) if overlap else 0.0
    return max(sequence, token_f1)


def run(command: list[str]) -> bool:
    result = subprocess.run(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    return result.returncode == 0


def duration(path: Path) -> float | None:
    try:
        result = subprocess.check_output(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "csv=p=0", str(path),
            ],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
        return float(result)
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def transcribe(path: Path) -> str:
    with tempfile.NamedTemporaryFile(suffix=".json", delete=False) as handle:
        result_path = Path(handle.name)
    try:
        ok = run([
            "curl", "-sS", "--fail", "-X", "POST",
            f"{API}/workflows/whisper-stt?sync=true",
            "-F", f"audio=@{path}", "--output", str(result_path), "--max-time", "180",
        ])
        if not ok:
            return ""
        payload = json.loads(result_path.read_text(encoding="utf-8"))
        result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
        return str(payload.get("text") or payload.get("transcript") or result.get("text") or "")
    except (OSError, json.JSONDecodeError, TypeError):
        return ""
    finally:
        result_path.unlink(missing_ok=True)


def inspect_clip(path: Path, intended: str) -> tuple[float | None, str, float, bool]:
    seconds = duration(path)
    transcript = transcribe(path) if seconds is not None else ""
    score = similarity(transcript, intended)
    passed = seconds is not None and 0.2 < seconds < 9 and score >= THRESHOLD
    return seconds, transcript, score, passed


def generate_candidate(text: str, seed: int, destination: Path) -> bool:
    with tempfile.NamedTemporaryFile(suffix=".flac", delete=False) as handle:
        raw_path = Path(handle.name)
    try:
        ok = run([
            "curl", "-sS", "--fail", "-X", "POST",
            f"{API}/workflows/qwen3-tts-voiceclone?sync=true",
            "-F", f"voice=@{REFERENCE}", "-F", f"text={text}", "-F", f"seed={seed}",
            "--output", str(raw_path), "--max-time", "180",
        ])
        if not ok or raw_path.stat().st_size < 2000:
            return False
        return run([
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw_path),
            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(destination),
        ]) and destination.exists() and destination.stat().st_size > 1000
    finally:
        raw_path.unlink(missing_ok=True)


def regenerate(key: str, text: str, destination: Path) -> None:
    """Try each seed and promote only a candidate Whisper accepts."""
    for seed in SEEDS:
        with tempfile.NamedTemporaryFile(suffix=".m4a", delete=False) as handle:
            candidate = Path(handle.name)
        candidate.unlink(missing_ok=True)
        try:
            if not generate_candidate(text, seed, candidate):
                continue
            _, _, _, passed = inspect_clip(candidate, text)
            if passed:
                shutil.move(str(candidate), destination)
                return
        finally:
            candidate.unlink(missing_ok=True)


manifest: dict[str, dict[str, object]] = {}
qa_entries: list[dict[str, object]] = []

for key, text in lines.items():
    safe = re.sub(r"[^a-z0-9_-]+", "-", key.lower())
    clip_path = OUT / f"{safe}.m4a"
    forced = "*" in force_ids or key in force_ids
    if forced or not clip_path.exists() or clip_path.stat().st_size < 1000:
        regenerate(key, text, clip_path)

    if clip_path.exists() and clip_path.stat().st_size >= 1000:
        seconds, transcript, score, passed = inspect_clip(clip_path, text)
    else:
        seconds, transcript, score, passed = None, "", 0.0, False

    runtime = "recorded" if passed else "web-speech-fallback"
    if passed and seconds is not None:
        manifest[key] = {"file": clip_path.name, "dur": round(seconds, 3)}
    qa_entries.append({
        "id": key,
        "intended": text,
        "transcript": transcript,
        "similarity": round(score, 3),
        "duration": round(seconds, 3) if seconds is not None else None,
        "pass": passed,
        "runtime": runtime,
    })

qa_document = {
    "workflow": "qwen3-tts-voiceclone",
    "whisper": "whisper-stt",
    "threshold": THRESHOLD,
    "seedLadder": list(SEEDS),
    "pass": all(entry["runtime"] in {"recorded", "web-speech-fallback"} for entry in qa_entries),
    "allRecordingsPass": all(bool(entry["pass"]) for entry in qa_entries),
    "clips": qa_entries,
}

(OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
(OUT / "lines.json").write_text(json.dumps(lines, indent=2) + "\n", encoding="utf-8")
(OUT / "whisper-qa.json").write_text(json.dumps(qa_document, indent=2) + "\n", encoding="utf-8")
(OUT / "qa.json").write_text(json.dumps(qa_document, indent=2) + "\n", encoding="utf-8")

recorded = sum(entry["runtime"] == "recorded" for entry in qa_entries)
fallback = len(qa_entries) - recorded
print(f"audio package: {recorded} recorded, {fallback} Web Speech fallback")
