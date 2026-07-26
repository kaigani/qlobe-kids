#!/usr/bin/env python3
"""Generate this game's two character voices from config.json.

config.json's `voice` map is the single authoring source for every spoken line.
This script clones each line from the matching character reference, converts to
AAC, transcribes it back with Whisper, and writes the runtime manifest plus the
derived lines.json the Web Speech fallback reads.

    export QLOBE_QWEN_URL=http://<host>:<port>
    python3 games/counting-treasure-cups/tools/gen-voice.py            # missing only
    python3 games/counting-treasure-cups/tools/gen-voice.py --only par-3 cap-end
    python3 games/counting-treasure-cups/tools/gen-voice.py --force --seed 8

Idempotent: a key whose .m4a already exists is skipped unless --force or --only
names it. QA results land in assets/audio/qa.json; anything flagged there should
be regenerated with a different --seed before shipping.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
AUDIO = GAME / "assets" / "audio"
REF = AUDIO / "ref"

# key prefix -> reference voice clip
VOICES = {"cap-": REF / "captain-goldie.flac", "par-": REF / "skipper.flac"}

# Whisper spells the in-character lines its own way; these are known-good
# renderings, not failures. Anything else lands in qa.json for a human.
ALLOWED = {
    "ahoy": ["ah hoi", "a hoy", "ahoy"],
    "matey": ["mady", "maidy", "matey", "mate"],
    "squawk": ["squawk", "squak", "swak"],
    "awk": ["awk", "ok", "ok"],
    "em": ["em", "am", "them"],
}


def api(path: str) -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        sys.exit("QLOBE_QWEN_URL is not set (see .claude/skills/local-genai)")
    return f"{base}{path}"


def post_multipart(url: str, fields: dict, files: dict) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    for name, path in files.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
            f"filename=\"{Path(path).name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).encode()
        body += Path(path).read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=bytes(body),
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return resp.read()


DIGITS = {"1": "one", "2": "two", "3": "three", "4": "four",
          "5": "five", "6": "six", "7": "seven", "8": "eight"}


def normalize(s: str) -> str:
    # Apostrophes are dropped, not kept: Whisper expands "count 'em up" to
    # "count them up", and ALLOWED maps them together — but only if the
    # apostrophe isn't left behind to break the match.
    s = s.lower().replace("’", "'").replace("'", "")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    # Whisper writes count words as numerals ("Eight!" -> "8"); same clip.
    return " ".join(DIGITS.get(w, w) for w in s.split())


def transcript_ok(said: str, want: str) -> bool:
    a, b = normalize(said), normalize(want)
    if a == b:
        return True
    for canonical, variants in ALLOWED.items():
        for v in variants:
            a = a.replace(v, canonical)
            b = b.replace(v, canonical)
    a, b = " ".join(a.split()), " ".join(b.split())
    if a == b:
        return True
    wa, wb = a.split(), b.split()
    if not wb:
        return False
    hits = sum(1 for w in wb if w in wa)
    return hits / len(wb) >= 0.8


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True)
    return round(float(out.stdout.strip()), 2)


# The clone pads short utterances with long silence — a one-word count can come
# back as six seconds of mostly nothing, which would stall the counting rhythm.
# Trim both ends, then level the clip so the two characters sit at one volume.
TRIM = (
    "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
    "areverse,"
    "silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,"
    "areverse,"
    "loudnorm=I=-16:TP=-1.5:LRA=11"
)


def encode(src: Path, dst: Path) -> float:
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", TRIM,
                    "-c:a", "aac", "-b:a", "64k", "-ar", "24000", "-ac", "1", str(dst)], check=True)
    return duration(dst)


def bounds(text: str) -> tuple[float, float]:
    """Plausible spoken length for this line — catches both silent clips and the
    runaway-silence failure mode without hand-tuning every key."""
    words = max(1, len(text.split()))
    return 0.22 + 0.10 * words, 1.8 + 0.75 * words


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--skip-qa", action="store_true")
    args = ap.parse_args()

    lines = json.loads((GAME / "config.json").read_text())["voice"]
    AUDIO.mkdir(parents=True, exist_ok=True)

    # lines.json is DERIVED from config.json so the recorded clip and its Web
    # Speech fallback can never drift apart.
    (AUDIO / "lines.json").write_text(json.dumps(lines, indent=1, ensure_ascii=False) + "\n")

    manifest_path = AUDIO / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    qa_path = AUDIO / "qa.json"
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}

    keys = args.only if args.only else list(lines)
    todo = [k for k in keys if args.force or args.only or not (AUDIO / f"{k}.m4a").exists()]
    print(f"{len(todo)} clip(s) to generate of {len(lines)}")

    for i, key in enumerate(todo, 1):
        text = lines[key]
        ref = next((p for pre, p in VOICES.items() if key.startswith(pre)), None)
        if not ref or not ref.exists():
            print(f"  !! no reference voice for {key}")
            continue
        out = AUDIO / f"{key}.m4a"
        lo, hi = bounds(text)
        print(f"[{i}/{len(todo)}] {key}: {text}")
        accepted = None
        for seed in [args.seed, 8, 9, 42, 1337]:
            try:
                raw = post_multipart(api("/workflows/qwen3-tts-voiceclone?sync=true"),
                                     {"text": text, "seed": str(seed)}, {"voice": str(ref)})
            except urllib.error.URLError as exc:
                print(f"  !! request failed: {exc}")
                break
            with tempfile.NamedTemporaryFile(suffix=".flac", delete=False) as tmp:
                tmp.write(raw)
                tmp_path = Path(tmp.name)
            dur = encode(tmp_path, out)
            said, ok = "", True
            if not args.skip_qa:
                try:
                    # A single word in isolation is genuinely hard for Whisper;
                    # bias it toward the vocabulary this game actually uses so a
                    # good clip is not rejected for a transcription artefact.
                    got = json.loads(post_multipart(
                        api("/workflows/whisper-stt?sync=true"),
                        {"model_size": "base", "initial_prompt":
                         "A pirate captain and her parrot counting treasure: "
                         "one, two, three, four, five, six, seven, eight. "
                         "Ahoy matey, squawk, gems, gold coins, treasure cup, chest."},
                        {"audio": str(out)}))
                    said = got.get("text", "").strip()
                except Exception as exc:                              # noqa: BLE001
                    said = f"<transcribe failed: {exc}>"
                ok = transcript_ok(said, text)
            tmp_path.unlink(missing_ok=True)
            in_range = lo <= dur <= hi
            accepted = {"want": text, "said": said, "ok": bool(ok and in_range),
                        "dur": dur, "seed": seed, "inRange": in_range}
            mark = "ok " if accepted["ok"] else "RETRY"
            print(f"       {mark} seed={seed} {dur:.2f}s (want {lo:.2f}–{hi:.2f}) → {said}")
            if accepted["ok"]:
                break
        if accepted is None:
            continue
        manifest[key] = {"file": f"{key}.m4a", "dur": accepted["dur"]}
        qa[key] = accepted

        manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=1) + "\n")
        qa_path.write_text(json.dumps(dict(sorted(qa.items())), indent=1, ensure_ascii=False) + "\n")

    bad = [k for k, v in qa.items() if not v.get("ok")]
    print(f"\n{len(manifest)} clips in manifest; {len(bad)} flagged by QA")
    for k in bad:
        print(f"  {k}: want {qa[k]['want']!r} got {qa[k]['said']!r}")


if __name__ == "__main__":
    main()
