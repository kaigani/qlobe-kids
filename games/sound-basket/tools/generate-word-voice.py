#!/usr/bin/env python3
"""Generate every missing Sound Basket object name in the platform teacher voice.

Existing shared word clips remain shared. Curated words without one receive a
game-local Qwen voice-clone clip, Whisper transcript QA, a recipe sidecar, and
an entry in assets/audio/word-manifest.json. The run is resumable.
"""

from concurrent.futures import ThreadPoolExecutor, as_completed
from difflib import SequenceMatcher
from pathlib import Path
import argparse
import json
import re
import subprocess
import time


ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games" / "sound-basket"
OBJECTS = ROOT / "shared" / "data" / "letter-objects.json"
SHARED_MANIFEST = ROOT / "shared" / "assets" / "audio" / "manifest.json"
LOCAL_CONFIG = ROOT / "tools" / "state" / "local.json"
DEFAULT_VOICE = ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav"
OUT = GAME / "assets" / "audio" / "words"
RAW = GAME / "assets" / "source" / "word-voice"
MANIFEST = GAME / "assets" / "audio" / "word-manifest.json"
SEEDS = (7, 8, 9)
SEED_OVERRIDES = {"icecream": (42, 1337, 9001)}
PACKAGED_FALLBACKS = {
    "icecream": {
        "url": "../../../shared/assets/audio/isfor/icecream.m4a",
        "dur": 1.451,
        "name": "ice cream",
        "kind": "pairing",
    }
}


def normalize(value):
    return re.sub(r"[^a-z0-9]", "", str(value).lower())


def duration(path):
    result = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True,
        text=True,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0.0


def curl_file(url, fields, output, timeout):
    command = ["curl", "-sS", "-X", "POST", url]
    for field in fields:
        command.extend(["-F", field])
    command.extend(["--output", str(output), "--max-time", str(timeout)])
    result = subprocess.run(command, capture_output=True, text=True)
    return result.returncode == 0 and output.exists() and output.stat().st_size > 2000


def transcribe(api, source):
    result = subprocess.run(
        [
            "curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
            "-F", f"audio=@{source}", "-F", "model_size=small", "-F", "language=en",
            "--max-time", "300",
        ],
        capture_output=True,
        text=True,
    )
    try:
        payload = json.loads(result.stdout)
        return payload.get("text") or payload.get("transcript") or ""
    except json.JSONDecodeError:
        return result.stdout.strip()


def transcript_pass(intended, heard):
    expected = normalize(intended)
    actual = normalize(heard)
    ratio = SequenceMatcher(None, expected, actual).ratio() if actual else 0.0
    contained = expected in actual or (actual in expected and len(actual) >= max(3, len(expected) - 2))
    return contained or ratio >= 0.72, round(ratio, 3)


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def generate(job, api, voice):
    word, name = job
    output = OUT / f"{word}.m4a"
    recipe_path = output.with_suffix(output.suffix + ".recipe.json")
    if output.exists() and recipe_path.exists() and 0.2 < duration(output) < 5:
        recipe = json.loads(recipe_path.read_text())
        if recipe.get("qa", {}).get("status") == "accepted":
            return word, name, "skip", duration(output), recipe.get("qa", {}).get("transcript", {})

    intended = name
    best = None
    for seed in SEED_OVERRIDES.get(word, SEEDS):
        raw = RAW / f"{word}-s{seed}.flac"
        if not (raw.exists() and raw.stat().st_size > 2000):
            ok = curl_file(
                f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
                [f"voice=@{voice}", f"text={intended}.", f"seed={seed}"],
                raw,
                900,
            )
            if not ok:
                continue
        heard = transcribe(api, raw)
        passed, ratio = transcript_pass(intended, heard)
        candidate = {"seed": seed, "heard": heard, "ratio": ratio, "match": passed, "raw": raw}
        if best is None or ratio > best["ratio"]:
            best = candidate
        if passed:
            best = candidate
            break

    if not best or not best["match"]:
        return word, name, "FAIL", 0.0, best or {}

    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(best["raw"]), "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", str(output)],
        check=True,
    )
    clip_duration = duration(output)
    recipe = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": f"sound-basket-word-{word}",
        "kind": "voice",
        "asset": f"words/{word}.m4a",
        "steps": [{"workflow": "qwen3-tts-voiceclone", "text": f"{intended}.", "seed": best["seed"]}],
        "refs": {"voice": "teacher"},
        "template": {"id": "character-voice-line", "fields": {"text": f"{intended}."}},
        "derivedFrom": None,
        "qa": {
            "status": "accepted",
            "transcript": {
                "intended": intended,
                "heard": best["heard"],
                "ratio": best["ratio"],
                "match": True,
            },
        },
        "created": time.strftime("%Y-%m-%d"),
    }
    write_json(recipe_path, recipe)
    return word, name, f"ok(seed {best['seed']})", clip_duration, recipe["qa"]["transcript"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--only", nargs="*", default=[])
    args = parser.parse_args()

    local = json.loads(LOCAL_CONFIG.read_text())
    api = str(local.get("qwenUrl") or "").rstrip("/")
    voice = Path(local.get("teacherVoicePath") or DEFAULT_VOICE)
    if not api:
        raise SystemExit("tools/state/local.json has no qwenUrl")
    if not voice.exists():
        raise SystemExit(f"teacher voice not found: {voice}")

    curated = json.loads(OBJECTS.read_text())["objects"]
    shared = json.loads(SHARED_MANIFEST.read_text()).get("words", {})
    jobs = []
    for objects in curated.values():
        for item in objects:
            word = item["word"]
            if word in shared:
                continue
            if args.only and word not in args.only:
                continue
            jobs.append((word, item.get("name") or word.replace("-", " ")))

    OUT.mkdir(parents=True, exist_ok=True)
    RAW.mkdir(parents=True, exist_ok=True)
    print(f"Generating/checking {len(jobs)} missing shared word clip(s) with {args.workers} worker(s)", flush=True)
    results = []
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(generate, job, api, voice): job for job in jobs}
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            print(result[0], result[2], result[4].get("heard", ""), flush=True)

    manifest = {"version": 1, "words": {}}
    for output in sorted(OUT.glob("*.m4a")):
        recipe_path = output.with_suffix(output.suffix + ".recipe.json")
        if not recipe_path.exists():
            continue
        recipe = json.loads(recipe_path.read_text())
        if recipe.get("qa", {}).get("status") != "accepted":
            continue
        transcript = recipe["qa"]["transcript"]
        manifest["words"][output.stem] = {
            "file": f"words/{output.name}",
            "dur": duration(output),
            "name": transcript["intended"],
        }
    for word, fallback in PACKAGED_FALLBACKS.items():
        if word not in manifest["words"]:
            manifest["words"][word] = fallback
    write_json(MANIFEST, manifest)
    failures = [result for result in results if result[2] == "FAIL" and result[0] not in PACKAGED_FALLBACKS]
    print(f"complete: {len(results) - len(failures)}/{len(results)} passed; manifest has {len(manifest['words'])} packaged entries", flush=True)
    if failures:
        print("failed:", ", ".join(result[0] for result in failures), flush=True)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
