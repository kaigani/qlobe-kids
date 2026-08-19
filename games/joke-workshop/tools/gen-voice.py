#!/usr/bin/env python3
"""Batch Joke Workshop fixed-line voice, then batch Whisper transcript QA.

`assets/audio/lines.json` is the spoken-script source of truth. All TTS jobs complete before
Whisper loads, keeping the local model host efficient. Rejected clips stay out
of manifest.json so voice-clips.js uses the exact Web Speech fallback instead.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import ipaddress
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUTPUT = GAME / "assets" / "audio"
RAW = GAME / "assets" / "source" / "local-api" / "voice"
REFERENCE = ROOT.parent / "01-game-concepts" / "joke-workshop" / "voice-comedian.wav"
REFERENCE_SHA256 = "1b73795b25c95179e5c4040cfcfdbb5ed9d263527a567e7f247c1f4d823db13b"
LINES = json.loads((GAME / "assets" / "audio" / "lines.json").read_text())
def normalized(text: str) -> str:
    value = " ".join(re.findall(r"[a-z0-9]+", text.lower()))
    # Whisper commonly separates this spoken compound; the words are otherwise exact.
    return value.replace("word play", "wordplay")


def duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def is_local_service_url(value: str) -> bool:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        return False
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        return False
    host = parsed.hostname.rstrip(".").lower()
    if host == "localhost" or host.endswith(".local"):
        return True
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return address.is_private or address.is_loopback or address.is_link_local


def call(endpoint: str, fields: list[str], output: Path, min_size: int = 1) -> bool:
    args = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        args.extend(["-F", field])
    args.extend(["--output", str(output), "--max-time", "900"])
    result = subprocess.run(args, capture_output=True, timeout=930)
    return result.returncode == 0 and output.exists() and output.stat().st_size >= min_size


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--seed", type=int, default=19)
    parser.add_argument("--only", nargs="*", default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    reference = REFERENCE.resolve()
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        raise SystemExit("QLOBE_QWEN_URL is not set")
    if not is_local_service_url(base):
        raise SystemExit("QLOBE_QWEN_URL must name a loopback, private-network, or .local service")
    if not reference.is_file():
        raise SystemExit(f"voice reference missing: {reference}")
    reference_hash = file_sha256(reference)
    if reference_hash != REFERENCE_SHA256:
        raise SystemExit(f"authorized comedian reference hash mismatch: {reference}")
    reference_cache_tag = reference_hash[:16]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    (OUTPUT / "lines.json").write_text(json.dumps(LINES, indent=2, ensure_ascii=False) + "\n")
    tts = f"{base}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{base}/workflows/whisper-stt?sync=true"
    keys = args.only or list(LINES)
    unknown = [key for key in keys if key not in LINES]
    if unknown:
        raise SystemExit(f"unknown voice key(s): {', '.join(unknown)}")

    qa_path = OUTPUT / "qa.json"
    manifest_path = OUTPUT / "manifest.json"
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    used_seeds: dict[str, int] = {}
    generation_failures: set[str] = set()

    # Phase 1: keep the TTS model loaded for the complete batch.
    for key in keys:
        text = LINES[key]
        text_sha = hashlib.sha256(text.encode()).hexdigest()
        final = OUTPUT / f"{key}.m4a"
        entry = manifest.get(key) if isinstance(manifest.get(key), dict) else {}
        qa_entry = qa.get(key) if isinstance(qa.get(key), dict) else {}
        existing_seed = entry.get("seed")
        final_sha = file_sha256(final) if final.is_file() else ""
        cache_is_current = (
            not args.force
            and isinstance(existing_seed, int)
            and duration(final) > .25
            and entry.get("file") == final.name
            and entry.get("voiceRefSha256") == reference_hash
            and entry.get("textSha256") == text_sha
            and entry.get("audioSha256") == final_sha
            and qa_entry.get("accepted") is True
            and qa_entry.get("seed") == existing_seed
            and qa_entry.get("voiceRefSha256") == reference_hash
            and qa_entry.get("textSha256") == text_sha
            and qa_entry.get("audioSha256") == final_sha
        )
        if cache_is_current:
            used_seeds[key] = existing_seed
            print(f"{key}: skip TTS", flush=True)
            continue
        raw = RAW / f"{key}-ref{reference_cache_tag}-text{text_sha[:16]}-seed{args.seed}.flac"
        print(f"{key}: TTS", flush=True)
        if not (raw.exists() and raw.stat().st_size > 1500):
            if not call(tts, [f"voice=@{reference}", f"text={text}", f"seed={args.seed}"], raw, 1500):
                print(f"{key}: TTS failed", flush=True)
                generation_failures.add(key)
                continue
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
             "-vn", "-af",
             "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
             "areverse,silenceremove=start_periods=1:start_silence=0.10:"
             "start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9",
             "-c:a", "aac", "-b:a", "80k", "-ar", "24000", "-ac", "1",
             "-movflags", "+faststart", str(final)],
            check=True, timeout=180,
        )
        used_seeds[key] = args.seed

    # Phase 2: keep Whisper loaded for the complete QA batch.
    for key in keys:
        text = LINES[key]
        text_sha = hashlib.sha256(text.encode()).hexdigest()
        final = OUTPUT / f"{key}.m4a"
        if key in generation_failures or not final.exists() or key not in used_seeds:
            qa[key] = {
                "accepted": False,
                "reason": "generation failed" if key in generation_failures else "missing clip",
                "want": text,
                "seed": args.seed,
                "voiceRefSha256": reference_hash,
                "textSha256": text_sha,
            }
            manifest.pop(key, None)
            continue
        used_seed = used_seeds[key]
        audio_sha = file_sha256(final)
        transcript_file = RAW / f"{key}-transcript.json"
        print(f"{key}: Whisper QA", flush=True)
        ok = call(
            whisper,
            [f"audio=@{final}", "model_size=base", "language=en",
             "initial_prompt=Joke Workshop. Joke Book. Comedian Star. Punchline. "
             "Bear joke. Banana joke. Ghost joke. Gummy bear. Banana split. "
             "Boo-berries. Ha ha ha! Hooray!"],
            transcript_file,
        )
        try:
            transcript = str(json.loads(transcript_file.read_text()).get("text", "")).strip() if ok else ""
        except Exception:
            transcript = ""
        wanted = normalized(text)
        heard = normalized(transcript)
        score = difflib.SequenceMatcher(None, wanted, heard).ratio()
        wanted_words = wanted.split()
        coverage = sum(1 for word in wanted_words if word in heard.split()) / max(1, len(wanted_words))
        # A single substituted action word changes a short child instruction
        # even when character-level similarity is very high ("swish"/"switch").
        accepted = ((heard == wanted) or (coverage == 1 and score >= .72)) if len(wanted_words) <= 10 \
            else (score >= .72 or (score >= .62 and coverage >= .82))
        qa[key] = {
            "accepted": accepted,
            "score": round(score, 3),
            "coverage": round(coverage, 3),
            "want": text,
            "transcript": transcript,
            "seed": used_seed,
            "duration": duration(final),
            "voiceRefSha256": reference_hash,
            "textSha256": text_sha,
            "audioSha256": audio_sha,
        }
        if accepted:
            manifest[key] = {
                "file": final.name,
                "dur": duration(final),
                "textHash": text_sha[:16],
                "textSha256": text_sha,
                "audioSha256": audio_sha,
                "voiceRefSha256": reference_hash,
                "seed": used_seed,
            }
        else:
            manifest.pop(key, None)
        print(f"{key}: {'accepted' if accepted else 'fallback'} {score:.2f} → {transcript}", flush=True)

    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    qa_path.write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    print(f"voice complete: {len(manifest)}/{len(LINES)} accepted", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
