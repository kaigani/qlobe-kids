#!/usr/bin/env python3
"""Generate cloned teacher-voice clips via the qwen3-tts-voiceclone ComfyUI
workflow, from a words.json-shaped word list.

Ported from tools/content-pipeline/gen_audio.py (predecessor repo, hardcoded
paths + a hardcoded LAN host). See README.md for the canonical pipeline
lifecycle this fits into.

Proven behaviors preserved:
  - seed ladder [7, 8, 9], retried in order until one succeeds
  - skip-existing idempotency (a valid-duration output already on disk -> skip)
  - duration validation bounds: 0.2 < dur < 9 seconds
  - FLAC (raw model output) -> m4a (aac 64k) via ffmpeg

Adapted: duration is measured with `afinfo` when available (matches the
original macOS-only tool), falling back to `ffprobe` elsewhere so the script
also runs on Linux/CI. Stdlib only; ffmpeg/ffprobe are external binaries
invoked via subprocess, not imported.

The API host is NEVER hardcoded: pass --api-url or set QLOBE_QWEN_URL.
--dry-run lists planned work and makes zero network calls; it needs neither.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys

SEEDS = [7, 8, 9]


def build_parser():
    p = argparse.ArgumentParser(
        description="Generate cloned teacher-voice audio clips from a words.json word list "
                    "via the qwen3-tts-voiceclone ComfyUI workflow.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--root", default=os.getcwd(), help="repo/content root")
    p.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"),
                   help="ComfyUI wrapper base URL (or QLOBE_QWEN_URL env); host is never committed")
    p.add_argument("--dry-run", action="store_true", help="list planned work; make no network calls")
    p.add_argument("--words-json", default=None,
                   help="word/onset/rime manifest (default <root>/content/words.json); "
                        "expects {onsets:{key:spoken}, rimes:{key:spoken}, words:[{word,...}]}")
    p.add_argument("--voice-ref", default=None,
                   help="reference wav for voice cloning (default <root>/voice/voice_teacher.wav)")
    p.add_argument("--audio-out", default=None,
                   help="output m4a tree, one subdir per category (default <root>/assets/audio)")
    p.add_argument("--raw-dir", default=None,
                   help="raw FLAC staging dir (default <root>/generated/raw/audio)")
    p.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "ffmpeg", help="ffmpeg binary")
    p.add_argument("--max-time", type=int, default=900, help="per-request curl timeout (seconds)")
    return p


def resolve_paths(args):
    root = args.root
    args.words_json = args.words_json or os.path.join(root, "content", "words.json")
    args.voice_ref = args.voice_ref or os.path.join(root, "voice", "voice_teacher.wav")
    args.audio_out = args.audio_out or os.path.join(root, "assets", "audio")
    args.raw_dir = args.raw_dir or os.path.join(root, "generated", "raw", "audio")
    return args


def cap(w):
    return w[:1].upper() + w[1:]


def tts(api_url, voice_ref, text, seed, flac, max_time):
    endpoint = f"{api_url.rstrip('/')}/workflows/qwen3-tts-voiceclone?sync=true"
    try:
        subprocess.run(
            ["curl", "-s", "-X", "POST", endpoint,
             "-F", f"voice=@{voice_ref}", "-F", f"text={text}", "-F", f"seed={seed}",
             "--output", flac, "--max-time", str(max_time)],
            capture_output=True, timeout=max_time + 50)
    except subprocess.TimeoutExpired:
        return False
    return os.path.exists(flac) and os.path.getsize(flac) > 2000


def dur(path):
    """Clip duration in seconds. Tries afinfo (macOS) first, then ffprobe."""
    if shutil.which("afinfo"):
        try:
            out = subprocess.run(["afinfo", path], capture_output=True, text=True).stdout
            m = re.search(r"estimated duration:\s*([\d.]+)", out)
            if m:
                return float(m.group(1))
        except Exception:
            pass
    ffprobe = shutil.which("ffprobe")
    if ffprobe:
        try:
            out = subprocess.run(
                [ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path],
                capture_output=True, text=True).stdout.strip()
            return float(out) if out else 0.0
        except Exception:
            return 0.0
    return 0.0


def gen(api_url, voice_ref, audio_out, raw_dir, ffmpeg, cat, key, text, max_time):
    out = os.path.join(audio_out, cat, f"{key}.m4a")
    os.makedirs(os.path.join(audio_out, cat), exist_ok=True)
    if os.path.exists(out) and 0.2 < dur(out) < 9:
        return "skip"
    flac = os.path.join(raw_dir, f"{cat}-{key}.flac")
    for s in SEEDS:
        if tts(api_url, voice_ref, text, s, flac, max_time):
            subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", flac,
                            "-c:a", "aac", "-b:a", "64k", out], capture_output=True)
            if os.path.exists(out) and 0.2 < dur(out) < 9:
                return f"ok(seed {s})"
    return "FAIL"


def build_jobs(words_doc):
    onsets, rimes, words = words_doc["onsets"], words_doc["rimes"], words_doc["words"]
    jobs = []
    for k, sp in onsets.items():
        jobs.append(("fragments", k, sp + "."))
    for k, sp in rimes.items():
        jobs.append(("fragments", k, sp + "."))
    for w in words:
        wd = w["word"]
        jobs.append(("words", wd, cap(wd) + "!"))
        jobs.append(("celebrate", wd, f"You made {wd}!"))
        jobs.append(("prompts", wd, f"Can you make {wd}?"))
    jobs.append(("misc", "realword", "Ooh, that's a real word too!"))
    return jobs


def main():
    parser = build_parser()
    args = resolve_paths(parser.parse_args())

    if not args.dry_run and not args.api_url:
        parser.error("no --api-url / QLOBE_QWEN_URL set (generation needs a host; use --dry-run to preview with none)")

    if not os.path.exists(args.words_json):
        print(f"words manifest not found: {args.words_json}")
        print("Nothing to plan -- pass --words-json to point at a real word list.")
        return 0 if args.dry_run else 1

    with open(args.words_json) as f:
        words_doc = json.load(f)
    jobs = build_jobs(words_doc)

    if args.dry_run:
        print(f"[dry-run] words manifest: {args.words_json}")
        print(f"[dry-run] would generate up to {len(jobs)} clip(s) (existing valid-duration clips are skipped at run time)")
        for cat, key, text in jobs:
            out = os.path.join(args.audio_out, cat, f"{key}.m4a")
            mark = "exists" if os.path.exists(out) else "new"
            print(f"  {cat:10s} {key:16s} [{mark:6s}] \"{text}\" -> {out}")
        print("[dry-run] zero network calls made")
        return 0

    os.makedirs(args.raw_dir, exist_ok=True)
    log = []
    for cat, key, text in jobs:
        r = gen(args.api_url, args.voice_ref, args.audio_out, args.raw_dir, args.ffmpeg, cat, key, text, args.max_time)
        log.append((cat, key, r))
        print(cat, key, r, flush=True)

    fails = [x for x in log if x[2] == "FAIL"]
    print("\n=== AUDIO GEN DONE ===")
    print("total:", len(log), "fails:", len(fails))
    if fails:
        print("FAILED:", fails)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
