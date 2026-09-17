#!/usr/bin/env python3
"""Question Ball teacher voice: Qwen clone -> Whisper receipt -> AAC M4A."""

import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
OUT = GAME / "assets/audio"
SRC = GAME / "assets/source/voice"
SEEDS = (7, 8, 9)


def normalize(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def similarity(expected, heard):
    return difflib.SequenceMatcher(None, normalize(expected), normalize(heard)).ratio()


def duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    return round(float(result.stdout.strip()), 3)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url", default=os.getenv("QLOBE_QWEN_URL"))
    parser.add_argument("--voice", default="shared/assets/refs/voice-teacher.wav")
    args = parser.parse_args()
    if not args.api_url:
        raise SystemExit("set QLOBE_QWEN_URL or --api-url")

    voice = Path(args.voice)
    if not voice.is_file():
        voice = Path(__file__).resolve().parents[3] / "shared/assets/refs/voice-teacher.wav"
    OUT.mkdir(parents=True, exist_ok=True)
    SRC.mkdir(parents=True, exist_ok=True)
    lines = json.loads((OUT / "lines.json").read_text(encoding="utf-8"))
    receipt = SRC / "qa-transcripts.json"
    prior_qa = json.loads(receipt.read_text(encoding="utf-8")) if receipt.is_file() else {}
    qa, manifest, retries = {}, {}, 0
    voice_sha = hashlib.sha256(voice.read_bytes()).hexdigest()

    for key, text in lines.items():
        print(f"voice {key}", flush=True)
        m4a = OUT / f"{key}.m4a"
        previous = prior_qa.get(key, {})
        if (m4a.is_file() and m4a.stat().st_size >= 1000
                and previous.get("pass") is True and previous.get("expected") == text):
            text_sha = hashlib.sha256(text.encode()).hexdigest()
            manifest[key] = {"file": m4a.name, "dur": duration(m4a), "textHash": text_sha[:16],
                             "textSha256": text_sha, "audioSha256": hashlib.sha256(m4a.read_bytes()).hexdigest(),
                             "voiceRefSha256": voice_sha, "seed": previous.get("seed")}
            qa[key] = previous
            print(f"  reuse seed={previous.get('seed')} ratio={previous.get('ratio')}", flush=True)
            continue

        passed = False
        for seed in SEEDS:
            raw = SRC / f"{key}-s{seed}.flac"
            if not raw.is_file() or raw.stat().st_size < 2000:
                subprocess.run(["curl", "-sS", "-X", "POST",
                                args.api_url.rstrip("/") + "/workflows/qwen3-tts-voiceclone?sync=true",
                                "-F", f"voice=@{voice}", "-F", f"text={text}", "-F", f"seed={seed}",
                                "--output", str(raw), "--max-time", "900"], check=False)
            if not raw.is_file() or raw.stat().st_size < 2000:
                retries += 1
                continue
            encoded = SRC / f"{key}-s{seed}.m4a"
            subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-vn",
                            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded)], check=False)
            if not encoded.is_file() or encoded.stat().st_size < 1000:
                retries += 1
                continue
            try:
                whisper = subprocess.run(["curl", "-sS", "-X", "POST",
                                          args.api_url.rstrip("/") + "/workflows/whisper-stt?sync=true",
                                          "-F", f"audio=@{encoded}", "-F", "model_size=base", "-F", "language=en",
                                          "--max-time", "900"], capture_output=True, text=True)
                try:
                    document = json.loads(whisper.stdout)
                    heard = str(document.get("text") or document.get("transcript")
                                or document.get("result", {}).get("text", "")).strip()
                except (TypeError, ValueError):
                    heard = ""
                score = similarity(text, heard)
                qa[key] = {"expected": text, "heard": heard, "ratio": round(score, 3), "seed": seed,
                           "pass": score >= 0.8, "engine": "qwen3-tts-voiceclone",
                           "whisper": "whisper-stt/base/en", "raw": raw.name}
                if score >= 0.8:
                    m4a.write_bytes(encoded.read_bytes())
                    text_sha = hashlib.sha256(text.encode()).hexdigest()
                    manifest[key] = {"file": m4a.name, "dur": duration(m4a), "textHash": text_sha[:16],
                                     "textSha256": text_sha, "audioSha256": hashlib.sha256(m4a.read_bytes()).hexdigest(),
                                     "voiceRefSha256": voice_sha, "seed": seed}
                    passed = True
                    print(f"  pass seed={seed} ratio={score:.3f}", flush=True)
                    break
                retries += 1
            finally:
                # FLAC is retained as source; this M4A only stages the Whisper attempt.
                encoded.unlink(missing_ok=True)
        if not passed:
            qa.setdefault(key, {"expected": text, "heard": "", "ratio": 0,
                                "seed": SEEDS[-1], "pass": False})["omitted"] = True
            print("  omitted after seeds 7,8,9", flush=True)

    receipt.write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"{len(lines)} lines; generated {len(manifest)}; retries {retries}; omitted {len(lines) - len(manifest)}")


if __name__ == "__main__":
    main()
