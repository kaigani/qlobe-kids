#!/usr/bin/env python3
"""Re-voice phoneme-exact Kokoro rime references into the cloned teacher voice
WITHOUT losing the correct pronunciation: voice-convert (chatterbox v2v) the
phoneme-exact Kokoro clip (source = correct sound) into a teacher-voice
target built from the celebration/word/prompt clips of words that contain
that rime. Candidates land in an A/B review dir (not shipped assets).

Ported from tools/content-pipeline/gen_clone_candidates.py (predecessor repo,
hardcoded paths + a hardcoded LAN host). A documented QA recipe alongside
analyze_rimes.py -- see README.md.

Proven behaviors preserved:
  - build the clone target voice by concatenating existing celebrate/words/
    prompts clips for every word containing the target rime
  - chatterbox-v2v source=Kokoro phoneme-exact clip, target=that concatenation
  - up to 3 generation attempts per rime
  - silence-trim + loudness-normalize the result, then wav -> m4a via ffmpeg
  - whisper-stt transcript printed alongside each candidate for QA-by-eye

Stdlib only; ffmpeg/ffprobe are external binaries invoked via subprocess.

The API host is NEVER hardcoded: pass --api-url or set QLOBE_QWEN_URL (used
to build both the chatterbox-v2v and whisper-stt endpoints).
--dry-run lists planned work and makes zero network calls; it needs neither.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

DEFAULT_TARGETS = ["ag", "am", "ab", "ax", "ed", "em", "et", "eb", "ig", "in",
                    "ib", "id", "og", "ot", "ob", "om", "un", "up"]
TRIM = ("silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak,"
        "areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak,areverse")


def build_parser():
    p = argparse.ArgumentParser(
        description="Generate A/B clone candidates: voice-convert phoneme-exact Kokoro rime "
                    "references into the cloned teacher voice via chatterbox-v2v, with a "
                    "whisper-stt transcript for QA.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--root", default=os.getcwd(), help="repo/content root")
    p.add_argument("--api-url", default=os.environ.get("QLOBE_QWEN_URL"),
                   help="ComfyUI wrapper base URL (or QLOBE_QWEN_URL env); host is never committed. "
                        "Used to build both the chatterbox-v2v and whisper-stt endpoints.")
    p.add_argument("--dry-run", action="store_true", help="list planned work; make no network calls")
    p.add_argument("--words-json", default=None,
                   help="word/onset/rime manifest (default <root>/content/words.json); "
                        "expects {words:[{word,rime,...}]}")
    p.add_argument("--audio-dir", default=None,
                   help="teacher-voice clip tree (default <root>/assets/audio)")
    p.add_argument("--kokoro-dir", default=None,
                   help="phoneme-exact reference clips (default <audio-dir>/ref_kokoro)")
    p.add_argument("--out-dir", default=None,
                   help="candidate output dir (default <audio-dir>/cand_clone)")
    p.add_argument("--tmp-dir", default=None, help="scratch dir (default a tempfile subdir)")
    p.add_argument("--rimes", default=None,
                   help=f"comma-separated rime targets (default: {','.join(DEFAULT_TARGETS)})")
    p.add_argument("--ffmpeg", default=shutil.which("ffmpeg") or "ffmpeg", help="ffmpeg binary")
    p.add_argument("--ffprobe", default=shutil.which("ffprobe") or "ffprobe", help="ffprobe binary")
    p.add_argument("--max-time", type=int, default=300, help="per-request curl timeout (seconds)")
    return p


def resolve_paths(args):
    root = args.root
    args.words_json = args.words_json or os.path.join(root, "content", "words.json")
    args.audio_dir = args.audio_dir or os.path.join(root, "assets", "audio")
    args.kokoro_dir = args.kokoro_dir or os.path.join(args.audio_dir, "ref_kokoro")
    args.out_dir = args.out_dir or os.path.join(args.audio_dir, "cand_clone")
    args.tmp_dir = args.tmp_dir or os.path.join(tempfile.gettempdir(), "qlobe-clone-ref")
    args.rime_list = [r.strip() for r in args.rimes.split(",")] if args.rimes else list(DEFAULT_TARGETS)
    return args


def build_ref(ffmpeg, audio_dir, tmp_dir, by_rime, rime):
    """Concatenate celebrate+word+prompt clips of the rime's words -> teacher ref."""
    items = []
    for wd in by_rime.get(rime, []):
        for cat in ("celebrate", "words", "prompts"):
            p = os.path.join(audio_dir, cat, f"{wd}.m4a")
            if os.path.exists(p):
                items.append(p)
    if not items:
        return None
    lst = os.path.join(tmp_dir, f"list_{rime}.txt")
    with open(lst, "w") as f:
        for p in items:
            f.write(f"file '{p}'\n")
    ref = os.path.join(tmp_dir, f"ref_{rime}.wav")
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", lst, "-ar", "24000", "-ac", "1", ref], capture_output=True)
    return ref if os.path.exists(ref) else None


def whisper(api_url, max_time, p):
    endpoint = f"{api_url.rstrip('/')}/workflows/whisper-stt?sync=true"
    try:
        out = subprocess.run(["curl", "-s", "-X", "POST", endpoint, "-F", f"audio=@{p}",
                              "-F", "model_size=base", "-F", "language=en"],
                             capture_output=True, text=True, timeout=max_time + 20).stdout
        return json.loads(out).get("text", "").strip()
    except Exception:
        return "?"


def gen(api_url, ffmpeg, ffprobe, audio_dir, kokoro_dir, out_dir, tmp_dir, by_rime, rime, max_time):
    out = os.path.join(out_dir, f"{rime}.m4a")
    src = os.path.join(kokoro_dir, f"{rime}.m4a")
    ref = build_ref(ffmpeg, audio_dir, tmp_dir, by_rime, rime)
    if not ref or not os.path.exists(src):
        return "FAIL(no ref/src)"
    raw = os.path.join(tmp_dir, f"v2v_{rime}.wav")
    endpoint = f"{api_url.rstrip('/')}/workflows/chatterbox-v2v?sync=true"
    for _seed in range(3):
        subprocess.run(["curl", "-s", "-X", "POST", endpoint, "-F", f"source_audio=@{src}",
                        "-F", f"target_voice=@{ref}", "--output", raw, "--max-time", str(max_time)],
                       capture_output=True, timeout=max_time + 50)
        if os.path.exists(raw) and os.path.getsize(raw) > 3000:
            break
    if not (os.path.exists(raw) and os.path.getsize(raw) > 3000):
        return "FAIL(no audio)"
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", raw,
                    "-af", f"{TRIM},loudnorm=I=-18:TP=-1.5:LRA=11", "-ar", "24000",
                    "-c:a", "aac", "-b:a", "64k", out], capture_output=True)
    if not os.path.exists(out):
        return "FAIL(convert)"
    d = subprocess.run([ffprobe, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", out],
                       capture_output=True, text=True).stdout.strip()
    return f"ok dur={d}s nwords={len(by_rime.get(rime, []))} whisper='{whisper(api_url, max_time, out)}'"


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
    by_rime = {}
    for w in words_doc["words"]:
        by_rime.setdefault(w["rime"], []).append(w["word"])

    if args.dry_run:
        print(f"[dry-run] words manifest: {args.words_json}")
        print(f"[dry-run] would generate up to {len(args.rime_list)} clone candidate(s)")
        for r in args.rime_list:
            words = by_rime.get(r, [])
            src = os.path.join(args.kokoro_dir, f"{r}.m4a")
            out = os.path.join(args.out_dir, f"{r}.m4a")
            note = "no source ref" if not os.path.exists(src) else ("no target words" if not words else "ready")
            print(f"  {r:4s} words={words} -> {out}  [{note}]")
        print("[dry-run] zero network calls made")
        return 0

    os.makedirs(args.out_dir, exist_ok=True)
    os.makedirs(args.tmp_dir, exist_ok=True)
    results = []
    for r in args.rime_list:
        res = gen(args.api_url, args.ffmpeg, args.ffprobe, args.audio_dir, args.kokoro_dir,
                  args.out_dir, args.tmp_dir, by_rime, r, args.max_time)
        results.append((r, res))
        print(r, res, flush=True)
    print("=== CLONE CANDIDATES DONE ===")
    fails = [x for x in results if x[1].startswith("FAIL")]
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
