#!/usr/bin/env python3
"""Generate the new voice clips for the word expansion (cloned warm teacher voice).
Idempotent: skips clips that already exist. Converts FLAC->m4a with ffmpeg."""
import json, os, subprocess, re

ROOT = "/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game"
API = "http://192.168.1.181:8100/workflows/qwen3-tts-voiceclone?sync=true"
VOICE = f"{ROOT}/smoke/voice_teacher.wav"
AUD = f"{ROOT}/sound-sprouts/assets/audio"
RAW = f"{ROOT}/02 generated/raw/audio"
FFMPEG = "/usr/local/bin/ffmpeg"
SEEDS = [7, 8, 9]
os.makedirs(RAW, exist_ok=True)

def cap(w): return w[:1].upper() + w[1:]

def tts(text, seed, flac):
    try:
        subprocess.run(["curl", "-s", "-X", "POST", API,
                        "-F", f"voice=@{VOICE}", "-F", f"text={text}", "-F", f"seed={seed}",
                        "--output", flac, "--max-time", "900"],
                       capture_output=True, timeout=950)
    except subprocess.TimeoutExpired:
        return False
    return os.path.exists(flac) and os.path.getsize(flac) > 2000

def dur(path):
    try:
        out = subprocess.run(["afinfo", path], capture_output=True, text=True).stdout
        m = re.search(r"estimated duration:\s*([\d.]+)", out)
        return float(m.group(1)) if m else 0.0
    except Exception:
        return 0.0

def gen(cat, key, text):
    out = f"{AUD}/{cat}/{key}.m4a"
    os.makedirs(f"{AUD}/{cat}", exist_ok=True)
    if os.path.exists(out) and 0.2 < dur(out) < 9:
        return "skip"
    flac = f"{RAW}/{cat}-{key}.flac"
    for s in SEEDS:
        if tts(text, s, flac):
            subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-i", flac,
                            "-c:a", "aac", "-b:a", "64k", out], capture_output=True)
            if os.path.exists(out) and 0.2 < dur(out) < 9:
                return f"ok(seed {s})"
    return "FAIL"

def main():
    d = json.load(open(f"{ROOT}/content/words.json"))
    onsets, rimes, words = d["onsets"], d["rimes"], d["words"]
    log = []
    def run(cat, key, text):
        r = gen(cat, key, text); log.append((cat, key, r)); print(cat, key, r, flush=True)

    # fragments
    for k, sp in onsets.items(): run("fragments", k, sp + ".")
    for k, sp in rimes.items():  run("fragments", k, sp + ".")
    # per-word clips
    for w in words:
        wd = w["word"]
        run("words", wd, cap(wd) + "!")
        run("celebrate", wd, f"You made {wd}!")
        run("prompts", wd, f"Can you make {wd}?")
    # generic bonus / real-word clip
    run("misc", "realword", "Ooh, that's a real word too!")

    fails = [x for x in log if x[2] == "FAIL"]
    print("\n=== AUDIO GEN DONE ===")
    print("total:", len(log), "fails:", len(fails))
    if fails: print("FAILED:", fails)

if __name__ == "__main__":
    main()
