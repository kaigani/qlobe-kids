#!/usr/bin/env python3
"""Bug Hotel Observer — teacher-voice production pipeline.

Three strictly separate phases, run in order, so the local model host never
thrashes between models mid-batch (see comfyui-model-thrash):

    python3 tools/gen-voice.py tts      # qwen3-tts-voiceclone for every line
    python3 tools/gen-voice.py qa       # whisper-stt QA for every take
    python3 tools/gen-voice.py encode   # FLAC -> AAC/M4A + manifest.json

(`all` runs the three in that order for convenience — it still completes each
phase for every requested line before starting the next, so it never
interleaves models either.)

`tools/lines.json` — `{ "<voice-id>": "<exact spoken text>" }` — is the single
source of truth (74 entries: 22 global + 4 room intros + 12 bugs x 4). It is
also read at runtime by the Web Speech fallback, so a clip and its fallback
text can never drift.

Voice reference: shared/assets/refs/voice-teacher.wav (same clone used by
every other game's teacher voice).

Host resolution (env wins, then the local dev config — same order P4's art
scripts use):
    export QLOBE_QWEN_URL=http://<host>:<port>
  or tools/state/local.json: { "qwenUrl": "http://<host>:<port>" }

Every phase is resumable (re-run picks up where it left off), supports
--only <id> <id> ... to restrict the batch, and --dry-run to print the job
table without calling anything. Rejected lines are simply omitted from
assets/audio/manifest.json; games/bug-hotel-observer/js/voice.js then falls
back to speech.js reading the exact tools/lines.json text, so a rejected
clip degrades — it never breaks the game.

Seed ladder: qwen3-tts-voiceclone tries seed 7 by default. A line that failed
QA can be re-recorded at the next seed with `tts --only <id> --seed-step`
(7 -> 8 -> 9), keeping the "never interleave models" rule intact — the ladder
advances across separate tts/qa runs, never inside one.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]

LINES_PATH = GAME / "tools" / "lines.json"
SOURCE_DIR = GAME / "assets" / "source" / "voice"
AUDIO_DIR = GAME / "assets" / "audio"
QA_PATH = GAME / "tools" / "voice-qa.json"
MANIFEST_PATH = AUDIO_DIR / "manifest.json"
REFERENCE = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"

SEED_LADDER = [7, 8, 9]
DEFAULT_WHISPER_SIZE = "base"

# Loanword-ish vocabulary this game's script leans on. Whisper's default LM
# guesses common English first ("lady bug", "rolly poly", "8 legs"); biasing
# the re-check pass toward the actual words the script uses recovers a
# correct clip instead of burning a fresh TTS seed on a transcription miss.
BIASED_PROMPT = (
    "Bug Hotel Observer. Ladybug. Caterpillar. Roly-poly. Grasshopper. "
    "Cricket. Beetle. Bee. Butterfly. Nectar. Pollen. Antennae. Wing covers."
)

# Small-number word/digit fold so "8" and "eight" (bug-spider's "eight legs")
# always compare equal regardless of which way Whisper renders a number.
_NUM_WORDS = {
    str(n): w
    for n, w in enumerate(
        ["zero", "one", "two", "three", "four", "five", "six", "seven",
         "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen",
         "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"]
    )
}


# --------------------------------------------------------------------------
# Host + reference resolution
# --------------------------------------------------------------------------

def resolve_host() -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        local = ROOT / "tools" / "state" / "local.json"
        if local.exists():
            try:
                base = str(json.loads(local.read_text()).get("qwenUrl", "")).rstrip("/")
            except Exception:
                base = ""
    if not base:
        raise SystemExit(
            "QLOBE_QWEN_URL is not set, and tools/state/local.json has no "
            "qwenUrl (see .claude/skills/local-genai)"
        )
    return base


def require_reference() -> None:
    if not REFERENCE.exists():
        raise SystemExit(f"voice reference missing: {REFERENCE}")


# --------------------------------------------------------------------------
# lines.json / voice-qa.json / manifest.json
# --------------------------------------------------------------------------

def load_lines() -> dict[str, str]:
    if not LINES_PATH.exists():
        raise SystemExit(f"lines file missing: {LINES_PATH}")
    return json.loads(LINES_PATH.read_text())


def resolve_keys(only: list[str] | None, lines: dict[str, str]) -> list[str]:
    if not only:
        return list(lines)
    unknown = [key for key in only if key not in lines]
    if unknown:
        raise SystemExit(f"unknown voice id(s): {', '.join(unknown)}")
    return list(only)


def load_qa() -> dict:
    return json.loads(QA_PATH.read_text()) if QA_PATH.exists() else {}


def save_qa(qa: dict) -> None:
    QA_PATH.parent.mkdir(parents=True, exist_ok=True)
    QA_PATH.write_text(json.dumps(qa, indent=2, ensure_ascii=False, sort_keys=True) + "\n")


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text()) if MANIFEST_PATH.exists() else {}


def save_manifest(manifest: dict) -> None:
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False, sort_keys=True) + "\n"
    )


# --------------------------------------------------------------------------
# transcript normalization — case/punctuation-insensitive, digit/word folded,
# compound-splitting-insensitive ("lady bug" == "ladybug")
# --------------------------------------------------------------------------

def tokens_of(text: str) -> list[str]:
    raw = re.findall(r"[a-z0-9]+", (text or "").lower())
    return [_NUM_WORDS.get(tok, tok) for tok in raw]


def normalized(text: str) -> str:
    return " ".join(tokens_of(text))


def concat(text: str) -> str:
    return "".join(tokens_of(text))


def score_transcript(wanted_text: str, transcript: str) -> dict:
    wanted_words = tokens_of(wanted_text)
    heard_words = tokens_of(transcript)
    score = difflib.SequenceMatcher(None, normalized(wanted_text), normalized(transcript)).ratio()
    coverage = sum(1 for w in wanted_words if w in heard_words) / max(1, len(wanted_words))
    exact = concat(wanted_text) == concat(transcript)
    if len(wanted_words) <= 10:
        accepted = exact or (coverage == 1 and score >= .72)
    else:
        accepted = score >= .72 or (score >= .62 and coverage >= .82)
    return {"accepted": accepted, "score": round(score, 3), "coverage": round(coverage, 3)}


# --------------------------------------------------------------------------
# subprocess helpers
# --------------------------------------------------------------------------

def call_curl(endpoint: str, fields: list[str], output: Path, min_size: int = 1) -> bool:
    args = ["curl", "-sS", "-X", "POST", endpoint]
    for field in fields:
        args.extend(["-F", field])
    args.extend(["--output", str(output), "--max-time", "900"])
    try:
        result = subprocess.run(args, capture_output=True, timeout=930)
    except subprocess.TimeoutExpired:
        return False
    return result.returncode == 0 and output.exists() and output.stat().st_size >= min_size


def ffprobe_duration(path: Path) -> float:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0.0


def content_rev(path: Path) -> str:
    """Short content hash — bump whenever a clip is re-recorded/re-encoded,
    stable otherwise. Cache-busting token for a caller that appends it as a
    query string; shared voice-clips.js itself does not, by design (it treats
    manifest.file as a plain relative path)."""
    return hashlib.sha256(path.read_bytes()).hexdigest()[:10]


def encode_clip(flac: Path, m4a: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(flac),
         "-vn", "-af", "loudnorm=I=-18:TP=-2:LRA=9",
         "-c:a", "aac", "-b:a", "96k", "-ar", "44100", "-ac", "1",
         "-movflags", "+faststart", str(m4a)],
        check=True, timeout=180,
    )


# --------------------------------------------------------------------------
# job table
# --------------------------------------------------------------------------

def print_table(title: str, jobs: list[dict]) -> None:
    print(f"\n{title} job table ({len(jobs)} lines)", flush=True)
    width = max((len(job["id"]) for job in jobs), default=2)
    for job in jobs:
        extra = " ".join(
            f"{k}={v}" for k, v in job.items() if k not in ("id", "action") and v is not None
        )
        print(f"  {job['id']:<{width}}  {job['action']:<8}  {extra}", flush=True)
    print("", flush=True)


# --------------------------------------------------------------------------
# tts phase — batch ALL lines through qwen3-tts-voiceclone
# --------------------------------------------------------------------------

def pick_seed(key: str, explicit_seed: int | None, seed_step: bool, qa: dict) -> int:
    if explicit_seed is not None:
        return explicit_seed
    verdict = qa.get(key)
    if seed_step and verdict and not verdict.get("accepted"):
        prev = verdict.get("seed", SEED_LADDER[0])
        idx = SEED_LADDER.index(prev) if prev in SEED_LADDER else 0
        return SEED_LADDER[min(idx + 1, len(SEED_LADDER) - 1)]
    if verdict and "seed" in verdict:
        return verdict["seed"]
    return SEED_LADDER[0]


def cmd_tts(args: argparse.Namespace) -> int:
    lines = load_lines()
    keys = resolve_keys(args.only, lines)
    qa = load_qa()

    jobs = []
    for key in keys:
        seed = pick_seed(key, args.seed, args.seed_step, qa)
        flac = SOURCE_DIR / f"{key}-seed{seed}.flac"
        skip = flac.exists() and flac.stat().st_size > 1500 and not args.force
        jobs.append({"id": key, "action": "skip" if skip else "tts", "seed": seed})
    print_table("TTS", jobs)
    if args.dry_run:
        return 0

    require_reference()
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    endpoint = f"{resolve_host()}/workflows/qwen3-tts-voiceclone?sync=true"

    ok = 0
    for job in jobs:
        key, seed = job["id"], job["seed"]
        flac = SOURCE_DIR / f"{key}-seed{seed}.flac"
        if job["action"] == "skip":
            print(f"{key}: skip TTS (seed{seed} flac exists)", flush=True)
            ok += 1
            continue
        print(f"{key}: TTS seed={seed}", flush=True)
        if call_curl(
            endpoint,
            [f"voice=@{REFERENCE}", f"text={lines[key]}", f"seed={seed}"],
            flac, min_size=1500,
        ):
            ok += 1
            print(f"{key}: ok ({flac.stat().st_size}B)", flush=True)
        else:
            print(f"{key}: TTS FAILED (seed={seed})", flush=True)
    print(f"tts complete: {ok}/{len(jobs)}", flush=True)
    return 0


# --------------------------------------------------------------------------
# qa phase — batch ALL takes through whisper-stt, after tts fully completes
# --------------------------------------------------------------------------

def latest_take(key: str) -> int | None:
    """Highest-seed FLAC on disk for this line — the freshest tts run."""
    for seed in reversed(SEED_LADDER):
        if (SOURCE_DIR / f"{key}-seed{seed}.flac").exists():
            return seed
    return None


def run_whisper(endpoint: str, key: str, seed: int, size: str, biased: bool) -> str:
    flac = SOURCE_DIR / f"{key}-seed{seed}.flac"
    suffix = "-biased" if biased else ""
    transcript_file = SOURCE_DIR / f"{key}-seed{seed}-transcript{suffix}.json"
    fields = [f"audio=@{flac}", f"model_size={size}", "language=en"]
    if biased:
        fields.append(f"initial_prompt={BIASED_PROMPT}")
    ok = call_curl(endpoint, fields, transcript_file, min_size=1)
    if not ok:
        return ""
    try:
        return str(json.loads(transcript_file.read_text()).get("text", "")).strip()
    except Exception:
        return ""


def cmd_qa(args: argparse.Namespace) -> int:
    lines = load_lines()
    keys = resolve_keys(args.only, lines)
    qa = load_qa()

    jobs = []
    for key in keys:
        seed = latest_take(key)
        prev = qa.get(key)
        if seed is None:
            action = "missing"
        elif prev and prev.get("accepted") and prev.get("seed") == seed and not args.force:
            action = "skip"
        else:
            action = "qa"
        jobs.append({"id": key, "action": action, "seed": seed})
    print_table("QA", jobs)
    if args.dry_run:
        return 0

    endpoint = f"{resolve_host()}/workflows/whisper-stt?sync=true"
    for job in jobs:
        key = job["id"]
        text = lines[key]
        if job["action"] == "skip":
            print(f"{key}: skip QA (already accepted)", flush=True)
            continue
        if job["action"] == "missing":
            qa[key] = {"accepted": False, "reason": "missing clip", "want": text}
            print(f"{key}: missing clip — run tts first", flush=True)
            continue

        seed = job["seed"]
        transcript = run_whisper(endpoint, key, seed, args.whisper_size, biased=False)
        result = score_transcript(text, transcript)
        verdict = {
            **result,
            "want": text,
            "transcript": transcript,
            "seed": seed,
            "prompt": "default",
            "duration": ffprobe_duration(SOURCE_DIR / f"{key}-seed{seed}.flac"),
        }

        if not verdict["accepted"] and args.biased_recheck and verdict["score"] >= 0.45:
            print(f"{key}: near-miss (score={verdict['score']}) — biased re-check", flush=True)
            recheck_transcript = run_whisper(endpoint, key, seed, args.whisper_size, biased=True)
            recheck = score_transcript(text, recheck_transcript)
            if recheck["accepted"]:
                verdict = {
                    **recheck,
                    "want": text,
                    "transcript": recheck_transcript,
                    "seed": seed,
                    "prompt": "biased",
                    "duration": verdict["duration"],
                }

        qa[key] = verdict
        state = "ACCEPTED" if verdict["accepted"] else "rejected"
        print(f"{key}: {state} score={verdict['score']} cov={verdict['coverage']} -> "
              f"{verdict['transcript']!r}", flush=True)

    save_qa(qa)
    accepted_n = sum(1 for v in qa.values() if v.get("accepted"))
    print(f"qa complete: {accepted_n}/{len(lines)} accepted", flush=True)
    return 0


# --------------------------------------------------------------------------
# encode phase — accepted FLAC -> AAC/M4A + manifest.json; rejects omitted
# --------------------------------------------------------------------------

def cmd_encode(args: argparse.Namespace) -> int:
    lines = load_lines()
    keys = resolve_keys(args.only, lines)
    qa = load_qa()
    manifest = load_manifest()

    jobs = []
    for key in keys:
        verdict = qa.get(key)
        accepted = bool(verdict and verdict.get("accepted"))
        seed = verdict.get("seed") if verdict else None
        m4a = AUDIO_DIR / f"{key}.m4a"
        if not accepted:
            action = "omit"
        elif m4a.exists() and not args.force:
            action = "skip"
        else:
            action = "encode"
        jobs.append({"id": key, "action": action, "seed": seed})
    print_table("ENCODE", jobs)
    if args.dry_run:
        return 0

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    for job in jobs:
        key = job["id"]
        m4a = AUDIO_DIR / f"{key}.m4a"
        if job["action"] == "omit":
            manifest.pop(key, None)
            if m4a.exists():
                print(f"{key}: rejected — leaving stale m4a on disk, out of manifest", flush=True)
            else:
                print(f"{key}: omitted (no accepted take) — falls back to speech.js", flush=True)
            continue

        if job["action"] == "encode":
            flac = SOURCE_DIR / f"{key}-seed{job['seed']}.flac"
            encode_clip(flac, m4a)
            print(f"{key}: encoded", flush=True)
        else:
            print(f"{key}: skip encode (m4a exists)", flush=True)

        dur = ffprobe_duration(m4a)
        rev = content_rev(m4a)
        # `dur` matches shared/js/voice-clips.js's manifest contract ({file, dur});
        # `duration` + `rev` satisfy this game's own cache-busting manifest spec.
        # Both point at the same number — no drift, just two readers' field names.
        manifest[key] = {"file": m4a.name, "dur": dur, "duration": dur, "rev": rev}

    save_manifest(manifest)
    print(f"encode complete: {len(manifest)}/{len(lines)} shipped", flush=True)
    return 0


# --------------------------------------------------------------------------
# all — convenience wrapper; still completes each phase before the next
# --------------------------------------------------------------------------

def cmd_all(args: argparse.Namespace) -> int:
    rc = cmd_tts(args)
    if rc:
        return rc
    rc = cmd_qa(args)
    if rc:
        return rc
    return cmd_encode(args)


# --------------------------------------------------------------------------
# argparse
# --------------------------------------------------------------------------

def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    common_only = argparse.ArgumentParser(add_help=False)
    common_only.add_argument("--only", nargs="*", default=None, help="restrict to these voice ids")
    common_only.add_argument("--force", action="store_true", help="redo even if output already exists")
    common_only.add_argument("--dry-run", action="store_true", help="print the job table, do nothing")

    tts_p = sub.add_parser("tts", parents=[common_only], help="record every line (qwen3-tts-voiceclone)")
    tts_p.add_argument("--seed", type=int, default=None, help="force this seed for every line in the batch")
    tts_p.add_argument("--seed-step", action="store_true",
                        help="advance a previously-rejected line to the next seed in 7->8->9")
    tts_p.set_defaults(func=cmd_tts)

    qa_p = sub.add_parser("qa", parents=[common_only], help="transcript QA every take (whisper-stt)")
    qa_p.add_argument("--whisper-size", default=DEFAULT_WHISPER_SIZE)
    qa_p.add_argument("--biased-recheck", dest="biased_recheck", action="store_true", default=True,
                       help="re-check near-miss rejections with a loanword-biased initial_prompt (default on)")
    qa_p.add_argument("--no-biased-recheck", dest="biased_recheck", action="store_false")
    qa_p.set_defaults(func=cmd_qa)

    encode_p = sub.add_parser("encode", parents=[common_only], help="FLAC -> AAC/M4A + manifest.json")
    encode_p.set_defaults(func=cmd_encode)

    all_p = sub.add_parser("all", parents=[common_only], help="tts, then qa, then encode")
    all_p.add_argument("--seed", type=int, default=None)
    all_p.add_argument("--seed-step", action="store_true")
    all_p.add_argument("--whisper-size", default=DEFAULT_WHISPER_SIZE)
    all_p.add_argument("--biased-recheck", dest="biased_recheck", action="store_true", default=True)
    all_p.add_argument("--no-biased-recheck", dest="biased_recheck", action="store_false")
    all_p.set_defaults(func=cmd_all)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
