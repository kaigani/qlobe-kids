#!/usr/bin/env python3
"""Clone the eight Red Green Light callers for Clay Studio mouth dialogue."""

from __future__ import annotations

import argparse
import concurrent.futures
import difflib
import json
import re
import subprocess
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
GAME = Path(__file__).resolve().parents[1]
OUT = GAME / "assets" / "audio" / "mouths"
REFERENCES = REPO.parent / "00-reference" / "voices" / "split"
LOCAL = REPO / "tools" / "state" / "local.json"
VISEME_PY = REPO / "tools" / "lipsync" / "whisper-visemes.py"
VISEME_PYTHON = REPO / "tools" / "lipsync" / "venv" / "bin" / "python"
SEEDS = (7, 8, 9)

SCRIPT = {
    "goofy": ("growlie", [
        "Stompity stomp! I love my clay look!",
        "Look at me! I am wonderfully wobbly!",
        "Roar! This smile is ready for adventures!",
        "My clay toes are ready to dance!",
        "You made me amazing! Let's boogie!",
    ]),
    "sparkle": ("twinkle", [
        "Twinkle bright! I feel absolutely magical!",
        "My sparkly smile is shining for you!",
        "Let's flutter through a rainbow together!",
        "You made every little detail sparkle!",
        "Ta-da! Your clay friend is fabulous!",
    ]),
    "robot": ("bolt", [
        "Beep boop! Creativity circuits are online!",
        "Scanning my parts. Result: totally awesome!",
        "Clay power charged and ready to roll!",
        "New friend activated. Commencing happy dance!",
        "Bleep bloop! You built a masterpiece!",
    ]),
    "bubbly": ("gilly", [
        "Bubble bubble! I am ready to splash!",
        "Wiggle my fins! This look is fantastic!",
        "Glub glub! You made me sea-sational!",
        "Let's bounce through the bubbles together!",
        "My clay smile is making waves!",
    ]),
    "fangs": ("ember", [
        "Tiny roar! My dragon magic is awake!",
        "Flap and sparkle! Adventure is calling!",
        "My fierce little fangs look fantastic!",
        "You built a legendary clay dragon!",
        "Whoosh! Let's fly to a new adventure!",
    ]),
    "smirk": ("pip", [
        "Hee hee! I look delightfully silly!",
        "One wiggle coming right up!",
        "Candy clouds, here I come!",
        "You made the funniest friend ever!",
        "Boing! This clay body loves to bounce!",
    ]),
    "hero": ("zoom", [
        "Super clay friend, ready for action!",
        "You gave me an amazing hero look!",
        "Capes up! It's adventure time!",
        "My superpower is being wonderfully unique!",
        "Up, up, and away we go!",
    ]),
    "beak": ("luna", [
        "Hoot hooray! My clay magic is awake!",
        "What a wise and wonderful design!",
        "Stars above, you made me marvelous!",
        "Let's flutter into a brand-new story!",
        "A little owl wisdom: you are creative!",
    ]),
}


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def duration(path: Path) -> float:
    run = subprocess.run(["/usr/local/bin/ffprobe", "-v", "error", "-show_entries", "format=duration",
                          "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
                         capture_output=True, text=True)
    try:
        return round(float(run.stdout.strip()), 3)
    except ValueError:
        return 0


def transcribe(whisper_url: str, path: Path) -> str:
    run = subprocess.run(["curl", "-sS", "-X", "POST", whisper_url,
                          "-F", f"audio=@{path}", "-F", "model_size=base", "-F", "language=en",
                          "--max-time", "900"], capture_output=True, timeout=930)
    try:
        return str(json.loads(run.stdout).get("text", "")).strip()
    except Exception:
        return ""


def generate_one(api: str, job: tuple[str, int, str, str]) -> dict:
    mouth, index, caller, text = job
    folder = OUT / mouth
    destination = folder / f"{index}.m4a"
    folder.mkdir(parents=True, exist_ok=True)
    if destination.exists() and .2 < duration(destination) < 9:
        return {"mouth": mouth, "index": index, "status": "skip", "text": text, "transcript": ""}
    voice = REFERENCES / f"{caller}.wav"
    if not voice.is_file():
        return {"mouth": mouth, "index": index, "status": "FAIL missing reference", "text": text, "transcript": ""}
    tts = f"{api}/workflows/qwen3-tts-voiceclone?sync=true"
    whisper = f"{api}/workflows/whisper-stt?sync=true"
    with tempfile.TemporaryDirectory(prefix=f"clay-{mouth}-{index}-") as temp_name:
        temp = Path(temp_name)
        for seed in SEEDS:
            raw = temp / f"voice-{seed}.flac"
            run = subprocess.run(["curl", "-sS", "-X", "POST", tts,
                                  "-F", f"voice=@{voice}", "-F", f"text={text}", "-F", f"seed={seed}",
                                  "--output", str(raw), "--max-time", "900"], capture_output=True, timeout=930)
            if run.returncode or not raw.exists() or raw.stat().st_size < 2000:
                continue
            encoded = temp / "voice.m4a"
            subprocess.run(["/usr/local/bin/ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
                            "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded)],
                           check=True, timeout=180)
            transcript = transcribe(whisper, encoded)
            ratio = difflib.SequenceMatcher(None, normalize(text), normalize(transcript)).ratio()
            if ratio >= .72 and .2 < duration(encoded) < 9:
                destination.write_bytes(encoded.read_bytes())
                return {"mouth": mouth, "index": index, "status": f"ok seed {seed} qa {ratio:.2f}",
                        "text": text, "transcript": transcript}
    return {"mouth": mouth, "index": index, "status": "FAIL", "text": text, "transcript": ""}


def build_cues() -> None:
    clips = [OUT / mouth / f"{index}.m4a" for mouth in SCRIPT for index in range(1, 6)]
    if not all(path.exists() for path in clips):
        raise RuntimeError("cannot build visemes until every dialogue clip exists")
    with tempfile.TemporaryDirectory(prefix="clay-mouth-cues-") as temp_name:
        temp = Path(temp_name)
        wavs = []
        destinations = []
        for mouth in SCRIPT:
            for index in range(1, 6):
                wav = temp / f"{mouth}-{index}.wav"
                subprocess.run(["/usr/local/bin/ffmpeg", "-y", "-loglevel", "error", "-i",
                                str(OUT / mouth / f"{index}.m4a"), "-ac", "1", "-ar", "16000", str(wav)],
                               check=True, timeout=180)
                wavs.append(wav)
                destinations.append(OUT / mouth / f"{index}.cues.json")
        subprocess.run([str(VISEME_PYTHON), str(VISEME_PY), *map(str, wavs)], check=True, timeout=1800)
        for wav, destination in zip(wavs, destinations):
            destination.write_bytes(wav.with_suffix(".cues.json").read_bytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=3)
    args = parser.parse_args()
    api = str(json.loads(LOCAL.read_text()).get("qwenUrl", "")).rstrip("/")
    if not api:
        raise SystemExit("tools/state/local.json does not configure qwenUrl")
    jobs = [(mouth, index, caller, text) for mouth, (caller, lines) in SCRIPT.items()
            for index, text in enumerate(lines, 1)]
    qa = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        for result in pool.map(lambda job: generate_one(api, job), jobs):
            qa.append(result)
            print(f"{result['mouth']}-{result['index']}: {result['status']}", flush=True)
    failures = [item for item in qa if item["status"].startswith("FAIL")]
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2, ensure_ascii=False) + "\n")
    if failures:
        raise SystemExit(f"voice QA failed for {len(failures)} clips")
    build_cues()
    mouths = {}
    for mouth, (caller, lines) in SCRIPT.items():
        mouths[mouth] = {"voice": caller, "phrases": [
            {"text": text, "audio": f"./assets/audio/mouths/{mouth}/{index}.m4a",
             "cues": f"./assets/audio/mouths/{mouth}/{index}.cues.json",
             "duration": duration(OUT / mouth / f"{index}.m4a")}
            for index, text in enumerate(lines, 1)
        ]}
    (OUT / "manifest.json").write_text(json.dumps({"mouths": mouths}, indent=2, ensure_ascii=False) + "\n")
    print("complete: 40 cloned phrases + canonical viseme timelines", flush=True)


if __name__ == "__main__":
    main()
