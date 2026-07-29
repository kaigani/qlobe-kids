#!/usr/bin/env python3
"""Sink or Float Lab — teacher-voice production.

qwen3-tts-voiceclone (seed ladder 7/8/9) -> whisper QA (small, en) ->
ffmpeg AAC m4a +faststart -> manifest.json with durations.
Resumable per clip. Host from QLOBE_QWEN_URL, reference from QLOBE_VOICE_REF.
"""
import json
import os
import re
import subprocess
import sys

API = os.environ.get("QLOBE_QWEN_URL") or sys.exit("set QLOBE_QWEN_URL")
REF = os.environ.get("QLOBE_VOICE_REF") or sys.exit("set QLOBE_VOICE_REF")
DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRCV = os.path.join(DIR, "assets", "source", "voice")
OUT = os.path.join(DIR, "assets", "audio")
os.makedirs(SRCV, exist_ok=True)
os.makedirs(OUT, exist_ok=True)

LINES = {
    "intro": "Welcome to the Sink or Float Lab! Let's find out what the water does.",
    "mode-predict": "Predict and test! Make a guess, then drop it in.",
    "mode-tricky": "Tricky ones! Big and small can surprise you.",
    "mode-pond": "Water playground! Drop in anything you like.",
    "tricky-intro": "These ones are tricky! Big things can float, and tiny things can sink.",
    "pond-intro": "This is your water playground. Drop things in, and watch what happens!",
    "predict-prompt": "What do you think? Will it sink, or will it float?",
    "drop-cue": "Drop it in! Watch closely.",
    "result-float": "It floats! It stays on top of the water.",
    "result-sink": "It sinks! Down, down, to the bottom.",
    "praise-1": "You predicted it! Great scientist thinking.",
    "praise-2": "Yes! Just like you said.",
    "surprise-1": "Ooh, a surprise! Scientists love surprises.",
    "surprise-2": "Interesting! Now we know something new.",
    "journal-stamp": "Into your journal it goes.",
    "nudge-predict": "Pick a guess. Sink, or float?",
    "nudge-drop": "Drag it over the water and let go!",
    "end-cheer": "Your journal page is full! What wonderful watching.",
    "again-prompt": "Want to test more things?",
    "obj-duck": "A rubber duck!",
    "obj-rock": "A rock!",
    "obj-wooden-block": "A wooden block!",
    "obj-sponge": "A sponge!",
    "obj-cork": "A cork!",
    "obj-apple": "An apple!",
    "obj-leaf": "A leaf!",
    "obj-key": "A key!",
    "obj-coin": "A coin!",
    "obj-marble": "A marble!",
    "obj-spoon": "A spoon!",
    "obj-shell": "A seashell!",
    "obj-watermelon": "A watermelon!",
    "obj-pebble": "A pebble!",
    "obj-log": "A log!",
    "obj-paperclip": "A paperclip!",
    "obj-orange": "An orange!",
    "obj-egg": "An egg!",
}

SEEDS = [7, 8, 9]


def norm(s):
    # Space-insensitive: whisper legitimately splits compounds ("paper clip").
    return re.sub(r"[^a-z0-9]", "", s.lower())


def tts(text, seed, flac):
    subprocess.run(
        ["curl", "-s", "-X", "POST", f"{API}/workflows/qwen3-tts-voiceclone?sync=true",
         "-F", f"voice=@{REF}", "-F", f"text={text}", "-F", f"seed={seed}",
         "--output", flac, "--max-time", "900"], check=True)
    return os.path.exists(flac) and os.path.getsize(flac) > 5000


def whisper(flac, size="small"):
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", f"{API}/workflows/whisper-stt?sync=true",
         "-F", f"audio=@{flac}", "-F", f"model_size={size}", "-F", "language=en",
         "--max-time", "300"], capture_output=True, text=True)
    try:
        j = json.loads(r.stdout)
        return j.get("text") or j.get("transcript") or r.stdout
    except Exception:  # noqa: BLE001
        return r.stdout


def dur(path):
    r = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        return round(float(r.stdout.strip()), 3)
    except ValueError:
        return None


def main():
    qa_path = os.path.join(SRCV, "qa-transcripts.json")
    qa = json.load(open(qa_path)) if os.path.exists(qa_path) else {}
    for key, text in LINES.items():
        m4a = os.path.join(OUT, f"{key}.m4a")
        if os.path.exists(m4a) and qa.get(key, {}).get("pass"):
            print(f"skip {key}", flush=True)
            continue
        ok = False
        for seed in SEEDS:
            flac = os.path.join(SRCV, f"{key}-s{seed}.flac")
            if not (os.path.exists(flac) and os.path.getsize(flac) > 5000):
                if not tts(text, seed, flac):
                    print(f"TTS-FAIL {key} seed {seed}", flush=True)
                    continue
            heard = whisper(flac).strip()
            match = norm(heard) == norm(text)
            qa[key] = {"seed": seed, "intended": text, "heard": heard, "pass": match}
            json.dump(qa, open(qa_path, "w"), indent=1)
            if match:
                subprocess.run(
                    ["ffmpeg", "-y", "-v", "quiet", "-i", flac, "-c:a", "aac",
                     "-b:a", "64k", "-movflags", "+faststart", m4a], check=True)
                print(f"done {key} seed {seed} ({dur(m4a)}s)", flush=True)
                ok = True
                break
            print(f"MISMATCH {key} seed {seed}: heard {heard!r}", flush=True)
        if not ok:
            print(f"REJECTED {key} — no passing take; runtime falls back to Web Speech",
                  flush=True)
    manifest = {}
    for key in LINES:
        m4a = os.path.join(OUT, f"{key}.m4a")
        if os.path.exists(m4a) and qa.get(key, {}).get("pass"):
            manifest[key] = {"file": f"{key}.m4a", "dur": dur(m4a)}
    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    lines_meta = {k: {"text": v} for k, v in LINES.items()}
    json.dump(lines_meta, open(os.path.join(OUT, "lines.json"), "w"), indent=1)
    print(f"VOICE DONE — {len(manifest)}/{len(LINES)} clips shipped", flush=True)


if __name__ == "__main__":
    main()
