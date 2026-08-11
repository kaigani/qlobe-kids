#!/usr/bin/env python3
"""Generate and Whisper-QA Letter Treasure Hunt teacher-voice clips."""

from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import hashlib
import json
import os
import re
import shutil
import subprocess
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games/letter-treasure-hunt"
OUT = GAME / "assets/audio"
VOICE = ROOT / "shared/assets/refs/voice-teacher.wav"
SEEDS = (7, 8, 9)
RETRY_DELAYS = (5, 10, 20)


def script_lines():
    return json.loads((OUT / "lines.json").read_text())


def normalize(text):
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def duration(path):
    ffprobe = shutil.which("ffprobe") or "/usr/local/bin/ffprobe"
    run = subprocess.run(
        [ffprobe, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return 0


def curl_with_retries(command, *, output_path=None, require_transcript=False):
    """Retry the local workflow host while it reloads between GPU jobs."""
    last = None
    for attempt in range(len(RETRY_DELAYS) + 1):
        if output_path:
            output_path.unlink(missing_ok=True)
        last = subprocess.run(command, capture_output=True, timeout=930)
        usable_output = not output_path or (output_path.exists() and output_path.stat().st_size >= 2000)
        if require_transcript:
            try:
                usable_output = usable_output and bool(json.loads(last.stdout).get("text", "").strip())
            except (json.JSONDecodeError, AttributeError):
                usable_output = False
        if last.returncode == 0 and usable_output:
            return last
        if attempt < len(RETRY_DELAYS):
            time.sleep(RETRY_DELAYS[attempt])
    return last


def generate_one(api_url, item):
    key, text = item
    destination = OUT / f"{key}.m4a"
    tts = f"{api_url}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{api_url}/workflows/whisper-stt?sync=true"
    ffmpeg = shutil.which("ffmpeg") or "/usr/local/bin/ffmpeg"
    diagnostics = []
    with tempfile.TemporaryDirectory(prefix="letter-treasure-voice-") as temp_name:
        temp = Path(temp_name)
        for seed in SEEDS:
            raw = temp / f"{key}-{seed}.flac"
            run = curl_with_retries(
                ["curl", "-sS", "--fail-with-body", "-X", "POST", tts, "-F", f"voice=@{VOICE}",
                 "-F", f"text={text}", "-F", f"seed={seed}", "--output", str(raw),
                 "--max-time", "900"],
                output_path=raw,
            )
            if run.returncode or not raw.exists() or raw.stat().st_size < 2000:
                diagnostics.append(f"tts seed {seed}: curl={run.returncode} bytes={raw.stat().st_size if raw.exists() else 0}")
                continue
            encoded = temp / f"{key}.m4a"
            try:
                subprocess.run(
                    [ffmpeg, "-y", "-loglevel", "error", "-i", str(raw),
                     "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded)],
                    check=True, timeout=180,
                )
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                diagnostics.append(f"encode seed {seed}: invalid audio")
                continue
            check = curl_with_retries(
                ["curl", "-sS", "--fail-with-body", "-X", "POST", whisper, "-F", f"audio=@{encoded}",
                 "-F", "model_size=base", "-F", "language=en", "--max-time", "900"],
                require_transcript=True,
            )
            try:
                transcript = str(json.loads(check.stdout).get("text", "")).strip()
            except Exception:
                transcript = ""
            ratio = difflib.SequenceMatcher(None, normalize(text), normalize(transcript)).ratio()
            diagnostics.append(f"stt seed {seed}: curl={check.returncode} match={ratio:.3f} transcript={transcript[:80]!r}")
            if ratio >= 0.72:
                destination.write_bytes(encoded.read_bytes())
                return key, {
                    "status": f"ok seed {seed}",
                    "match": round(ratio, 3),
                    "transcript": transcript,
                }
    return key, {"status": f"FAIL; {'; '.join(diagnostics[-3:])}", "match": 0, "transcript": ""}


def main():
    parser = argparse.ArgumentParser()
    local_state = ROOT / "tools/state/local.json"
    local_api = ""
    try:
        local_api = json.loads(local_state.read_text()).get("qwenUrl", "")
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    parser.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL") or local_api)
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--missing-only", action="store_true")
    parser.add_argument("--key", action="append", dest="keys",
                        help="Generate only this narration key (repeatable; useful for QA/resume)")
    args = parser.parse_args()
    if not args.api_url:
        parser.error("no --api-url, QLOBE_QWEN_URL, or tools/state/local.json qwenUrl configured")
    api_url = args.api_url.rstrip("/")
    OUT.mkdir(parents=True, exist_ok=True)
    lines = script_lines()
    requested = set(args.keys or lines)
    unknown = sorted(requested - set(lines))
    if unknown:
        parser.error(f"unknown narration keys: {unknown}")
    old_manifest = {}
    old_qa = {}
    if args.missing_only:
        try:
            old_manifest = json.loads((OUT / "manifest.json").read_text())
            old_qa = json.loads((OUT / "qa.json").read_text())
        except (FileNotFoundError, json.JSONDecodeError):
            pass
    retained = {
        key for key, text in lines.items()
        if (OUT / f"{key}.m4a").exists()
        and old_manifest.get(key, {}).get("textHash")
        == hashlib.sha256(text.encode()).hexdigest()[:16]
    }
    pending = [(key, text) for key, text in lines.items() if key in requested and key not in retained]
    qa = {
        key: old_qa.get(key, {"status": "retained", "match": 1, "transcript": text})
        for key, text in lines.items() if key in retained
    }
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        jobs = ((api_url, item) for item in pending)
        for key, result in pool.map(lambda values: generate_one(*values), jobs):
            qa[key] = result
            print(f"{key}: {result['status']} match={result['match']}", flush=True)
    manifest = {}
    for key, text in lines.items():
        path = OUT / f"{key}.m4a"
        if path.exists():
            manifest[key] = {
                "file": path.name,
                "dur": duration(path),
                "textHash": hashlib.sha256(text.encode()).hexdigest()[:16],
            }
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    failures = [key for key in requested if key not in manifest]
    print(f"complete: {len(manifest)}/{len(lines)}; failures={failures}", flush=True)
    raise SystemExit(1 if failures else 0)


if __name__ == "__main__":
    main()
