#!/usr/bin/env python3
"""Build the runtime teacher-voice manifest from Whisper-reviewed clips."""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
AUDIO = GAME / "assets" / "audio"
SOURCE = GAME / "assets" / "source" / "local-api" / "voice"

# Seed-7 asynchronous receipts from the approved local authoring batch. The
# one rejected take remains listed even though water-intro ships its seed-8
# synchronous retry.
TTS_JOBS = {
    "welcome": "3f44c951ebe542889a9e08e8ead98537",
    "chosen": "021da441ea1e437881302ec904615ce5",
    "water-intro": "93e268004fe94db9bfd071147429266b",
    "water-nudge": "c1f0bdb45e74429f9aa5aedf46872b38",
    "water-done": "e9678dcb09724b67bd89d48cd811aa76",
    "mist-intro": "3c6d94792a194bfcb8bcb14a8745f0e5",
    "mist-nudge": "5ccb13e7fef44503bb028e5d5db9cda4",
    "mist-done": "a4656c2d529346188141d7a893508928",
    "prune-intro": "dba3776fc0244360b9e8608747ad7958",
    "prune-nudge": "6d762205515146a4b5dec53cfe530202",
    "prune-done": "740d40d295aa4dba8e7e1cd4bd10a1a6",
    "thriving": "a63d23c4e87a48558bc87faa15c93656",
    "replay": "c19cb8d867de401cbea856cba2a12440",
    "enough": "59e606ff247b4ea7b9cd859b3dd6ae9c",
}


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def digest_bytes(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def digest_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return round(float(result.stdout.strip()), 3)


def transcript_for(key: str) -> tuple[str, dict]:
    receipt_path = SOURCE / key / "whisper-response.json"
    receipt = json.loads(receipt_path.read_text(encoding="utf-8"))
    return str(receipt.get("transcript") or receipt.get("result", {}).get("text") or "").strip(), receipt


def main() -> None:
    lines = json.loads((AUDIO / "lines.json").read_text(encoding="utf-8"))

    # Promote the accepted seed-8 transcript into the canonical receipt while
    # keeping seed 7 alongside it as rejected evidence.
    retry = SOURCE / "water-intro" / "whisper-seed8.json"
    if retry.exists():
        result = json.loads(retry.read_text(encoding="utf-8"))
        text = str(result.get("text") or "").strip()
        canonical = {
            "key": "water-intro",
            "workflow": "whisper-stt",
            "model_size": "small",
            "language": "en",
            "ttsSeed": 8,
            "result": result,
            "expected": lines["water-intro"],
            "transcript": text,
            "pass": normalize(text) == normalize(lines["water-intro"]),
            "rejectedAttempt": {
                "seed": 7,
                "ttsJob": TTS_JOBS["water-intro"],
                "receipt": "whisper-seed7-rejected.json",
                "reason": "Whisper heard an extra leading word",
            },
        }
        (SOURCE / "water-intro" / "whisper-response.json").write_text(
            json.dumps(canonical, indent=2) + "\n", encoding="utf-8"
        )

    manifest: dict[str, dict] = {}
    qa: dict[str, dict] = {}
    failures: list[str] = []
    for key, line in lines.items():
        clip = AUDIO / f"{key}.m4a"
        if not clip.exists():
            failures.append(f"{key}: clip missing")
            continue
        transcript, receipt = transcript_for(key)
        passed = normalize(transcript) == normalize(line)
        seed = 8 if key == "water-intro" else 7
        if not passed:
            failures.append(f"{key}: transcript mismatch: {transcript!r}")
        manifest[key] = {
            "file": clip.name,
            "dur": duration(clip),
            "textHash": digest_text(line),
            "sha256": digest_bytes(clip),
            "seed": seed,
            "ttsJob": None if seed == 8 else TTS_JOBS[key],
        }
        qa[key] = {
            "expected": line,
            "transcript": transcript,
            "pass": passed,
            "tts": {
                "workflow": "qwen3-tts-voiceclone",
                "seed": seed,
                "job": None if seed == 8 else TTS_JOBS[key],
                "mode": "synchronous retry" if seed == 8 else "asynchronous batch",
                "teacherReference": "shared/assets/refs/voice-teacher.wav",
            },
            "whisper": {
                "workflow": "whisper-stt",
                "modelSize": receipt.get("model_size", "small"),
                "language": receipt.get("language", "en"),
                "receipt": f"../source/local-api/voice/{key}/whisper-response.json",
            },
        }

    (AUDIO / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    (AUDIO / "qa.json").write_text(json.dumps(qa, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"accepted": len(manifest) - len(failures), "total": len(lines), "failures": failures}, indent=2))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
