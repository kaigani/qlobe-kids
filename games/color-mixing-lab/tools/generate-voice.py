#!/usr/bin/env python3
"""Produce and transcript-check Color Mixing Lab's recorded teacher voice.

Generation goes through the documented localhost QLOBE Studio template API.
Studio owns the allow-listed teacher reference, LAN dispatch, AAC encode, and
Whisper pass; this script applies the stricter game-level seed ladder, preserves
every candidate and recipe, normalizes delivery loudness, and writes the clip
manifest consumed by ``shared/js/voice-clips.js``.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
import shutil
import subprocess
import time
from pathlib import Path


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
LINES = GAME / "assets/audio/lines.json"
OUT = GAME / "assets/audio"
SOURCE = GAME / "assets/source/voice"
CANDIDATES = SOURCE / "candidates"
MEDIA = ROOT / "shared/media"
SEEDS = (7, 8, 9)


def normalize(value: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", value.lower()))


def transcript_score(wanted: str, heard: str) -> tuple[bool, float, float]:
    expected = normalize(wanted)
    actual = normalize(heard)
    ratio = difflib.SequenceMatcher(None, expected, actual).ratio()
    expected_words = expected.split()
    actual_words = actual.split()
    coverage = sum(word in actual_words for word in expected_words) / max(1, len(expected_words))
    exact = expected.replace(" ", "") == actual.replace(" ", "")
    accepted = exact or (ratio >= 0.92 and coverage >= 0.95)
    return accepted, round(ratio, 3), round(coverage, 3)


def duration(path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "csv=p=0",
            str(path),
        ],
        check=False,
        capture_output=True,
        text=True,
    )
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0.0


def request_json(url: str, payload: dict | None = None, timeout: int = 30) -> dict:
    command = ["curl", "-sS", "--max-time", str(timeout), "-w", "\n%{http_code}"]
    if payload is not None:
        command += [
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "--data-binary",
            json.dumps(payload),
        ]
    command.append(url)
    completed = subprocess.run(command, check=False, capture_output=True, text=True)
    if completed.returncode:
        raise RuntimeError(f"QLOBE Studio request failed for {url}: {completed.stderr.strip()}")
    try:
        body, status_text = completed.stdout.rsplit("\n", 1)
        status = int(status_text)
    except (ValueError, TypeError) as error:
        raise RuntimeError(f"Studio returned an invalid HTTP response for {url}") from error
    if status >= 400:
        raise RuntimeError(f"Studio {status}: {body}")
    try:
        result = json.loads(body)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Studio returned invalid JSON for {url}") from error
    if not isinstance(result, dict):
        raise RuntimeError(f"Studio returned an invalid response for {url}")
    return result


def media_id(key: str) -> str:
    return f"color-lab-voice-{key}"


def candidate_paths(key: str) -> tuple[Path, Path, Path]:
    folder = MEDIA / media_id(key)
    return (
        folder / f"{media_id(key)}.m4a",
        folder / "recipe.json",
        folder / "qa-transcript.json",
    )


def reusable_candidate(key: str, text: str, seed: int) -> bool:
    clip, recipe_path, transcript_path = candidate_paths(key)
    if not (clip.is_file() and recipe_path.is_file() and transcript_path.is_file()):
        return False
    try:
        recipe = json.loads(recipe_path.read_text("utf-8"))
        step = recipe.get("steps", [{}])[0]
        return step.get("text") == text and int(step.get("seed", -1)) == seed
    except (OSError, ValueError, TypeError, json.JSONDecodeError):
        return False


def queue_candidate(studio: str, key: str, text: str, seed: int) -> str:
    response = request_json(
        f"{studio}/api/studio/generate",
        {
            "template": "character-voice-line",
            "fields": {"text": text},
            "params": {"id": media_id(key), "seed": seed, "overwrite": True},
        },
    )
    if not response.get("ok") or not response.get("jobId"):
        raise RuntimeError(f"Could not queue {key}: {response}")
    return str(response["jobId"])


def wait_for_jobs(studio: str, jobs: dict[str, str], timeout: int) -> None:
    if not jobs:
        return
    started = time.monotonic()
    pending = dict(jobs)
    last_report = -1
    while pending:
        if time.monotonic() - started > timeout:
            raise TimeoutError(f"Studio voice jobs timed out: {sorted(pending.values())}")
        body = request_json(f"{studio}/api/studio/jobs", timeout=30)
        by_id = {str(job.get("id")): job for job in body.get("jobs", []) if isinstance(job, dict)}
        for job_id, key in list(pending.items()):
            job = by_id.get(job_id)
            if not job:
                continue
            status = job.get("status")
            if status == "completed":
                pending.pop(job_id)
            elif status in {"failed", "cancelled", "canceled"}:
                raise RuntimeError(f"Studio voice job failed for {key}: {job.get('error') or job.get('message')}")
        finished = len(jobs) - len(pending)
        if finished != last_report:
            print(f"Studio voice batch: {finished}/{len(jobs)} complete", flush=True)
            last_report = finished
        if pending:
            time.sleep(3)


def preserve_candidate(key: str, seed: int) -> tuple[dict, dict, Path]:
    clip, recipe_path, transcript_path = candidate_paths(key)
    if not (clip.is_file() and recipe_path.is_file() and transcript_path.is_file()):
        raise FileNotFoundError(f"Studio candidate is incomplete for {key} seed {seed}")
    stem = f"{key}-s{seed}"
    saved_clip = CANDIDATES / f"{stem}.m4a"
    saved_recipe = CANDIDATES / f"{stem}.recipe.json"
    saved_transcript = CANDIDATES / f"{stem}.qa-transcript.json"
    shutil.copy2(clip, saved_clip)
    shutil.copy2(recipe_path, saved_recipe)
    shutil.copy2(transcript_path, saved_transcript)
    return (
        json.loads(recipe_path.read_text("utf-8")),
        json.loads(transcript_path.read_text("utf-8")),
        saved_clip,
    )


def encode_runtime(source: Path, destination: Path) -> None:
    subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-vn",
            "-af",
            "loudnorm=I=-18:TP=-2:LRA=9",
            "-c:a",
            "aac",
            "-b:a",
            "96k",
            "-ar",
            "24000",
            "-ac",
            "1",
            "-movflags",
            "+faststart",
            str(destination),
        ],
        check=True,
    )


def evaluate_candidates(
    lines: dict[str, str], records: dict[str, dict], seed: int
) -> dict[str, dict]:
    pending = {key: text for key, text in lines.items() if not (records.get(key) or {}).get("accepted")}
    for key, text in pending.items():
        recipe, transcript, candidate = preserve_candidate(key, seed)
        heard = str(transcript.get("heard") or "").strip()
        accepted, ratio, coverage = transcript_score(text, heard)
        attempt = {
            "seed": seed,
            "accepted": accepted,
            "score": ratio,
            "coverage": coverage,
            "intended": text,
            "heard": heard,
            "duration": duration(candidate),
            "studioMatch": transcript.get("match"),
            "source": str(candidate.relative_to(GAME)),
            "recipe": str((CANDIDATES / f"{key}-s{seed}.recipe.json").relative_to(GAME)),
        }
        prior_attempts = list((records.get(key) or {}).get("attempts", []))
        prior_attempts = [item for item in prior_attempts if item.get("seed") != seed]
        prior_attempts.append(attempt)
        records[key] = {
            "accepted": accepted,
            "acceptedSeed": seed if accepted else None,
            "intended": text,
            "heard": heard,
            "score": ratio,
            "coverage": coverage,
            "duration": duration(candidate),
            "attempts": prior_attempts,
            "studioRecipeStatus": (recipe.get("qa") or {}).get("status"),
        }
        if accepted:
            encode_runtime(candidate, OUT / f"{key}.m4a")
    return records


def hydrate_preserved_attempts(lines: dict[str, str], records: dict[str, dict]) -> None:
    """Rebuild each retry trail from the candidate archive on resumable runs."""
    for key, text in lines.items():
        record = records.get(key)
        if not isinstance(record, dict):
            continue
        attempts = []
        for seed in SEEDS:
            transcript_path = CANDIDATES / f"{key}-s{seed}.qa-transcript.json"
            clip_path = CANDIDATES / f"{key}-s{seed}.m4a"
            if not (transcript_path.is_file() and clip_path.is_file()):
                continue
            transcript = json.loads(transcript_path.read_text("utf-8"))
            heard = str(transcript.get("heard") or "").strip()
            accepted, ratio, coverage = transcript_score(text, heard)
            attempts.append(
                {
                    "seed": seed,
                    "accepted": accepted,
                    "score": ratio,
                    "coverage": coverage,
                    "intended": text,
                    "heard": heard,
                    "duration": duration(clip_path),
                    "studioMatch": transcript.get("match"),
                    "source": str(clip_path.relative_to(GAME)),
                    "recipe": str(
                        (CANDIDATES / f"{key}-s{seed}.recipe.json").relative_to(GAME)
                    ),
                }
            )
        if attempts:
            record["attempts"] = attempts
        selected_seed = record.get("acceptedSeed")
        selected_recipe = CANDIDATES / f"{key}-s{selected_seed}.recipe.json"
        if selected_seed in SEEDS and selected_recipe.is_file():
            selected = json.loads(selected_recipe.read_text("utf-8"))
            record["studioRecipeStatus"] = (selected.get("qa") or {}).get("status")


def write_outputs(lines: dict[str, str], records: dict[str, dict]) -> None:
    hydrate_preserved_attempts(lines, records)
    manifest: dict[str, object] = {"_v": 1}
    accepted = 0
    omitted: list[str] = []
    for key in lines:
        record = records.get(key) or {}
        clip = OUT / f"{key}.m4a"
        if record.get("accepted") and clip.is_file() and duration(clip) > 0:
            manifest[key] = {"file": clip.name, "dur": duration(clip)}
            accepted += 1
        else:
            omitted.append(key)
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", "utf-8")
    report = {
        "format": "qlobe-voice-qa",
        "formatVersion": 1,
        "workflow": "qwen3-tts-voiceclone",
        "transport": "QLOBE Studio character-voice-line template",
        "verifier": "whisper-stt + normalized transcript score",
        "seedLadder": list(SEEDS),
        "rejectPolicy": "reject -> next seed; omit after seed 9 and use speech fallback",
        "accepted": accepted,
        "omitted": omitted,
        "total": len(lines),
        "clips": records,
    }
    (OUT / "qa.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", "utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--studio-url", default="http://127.0.0.1:8000")
    parser.add_argument("--timeout", type=int, default=1800, help="seconds per seed batch")
    parser.add_argument("--force", action="store_true", help="regenerate even accepted runtime clips")
    parser.add_argument(
        "--offline-seed",
        type=int,
        choices=SEEDS,
        help="evaluate already-completed Studio media for this seed without HTTP",
    )
    args = parser.parse_args()
    studio = args.studio_url.rstrip("/")

    for command in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(command):
            raise SystemExit(f"missing {command}")
    lines = json.loads(LINES.read_text("utf-8"))
    OUT.mkdir(parents=True, exist_ok=True)
    CANDIDATES.mkdir(parents=True, exist_ok=True)

    previous_path = OUT / "qa.json"
    previous = json.loads(previous_path.read_text("utf-8")) if previous_path.exists() else {}
    records = previous.get("clips", {}) if isinstance(previous.get("clips"), dict) else {}
    if not args.force:
        for key, text in lines.items():
            record = records.get(key) or {}
            missing_accepted_clip = record.get("accepted") and not (OUT / f"{key}.m4a").is_file()
            if record.get("intended") != text or missing_accepted_clip:
                records.pop(key, None)

    if args.offline_seed is not None:
        records = evaluate_candidates(lines, records, args.offline_seed)
        write_outputs(lines, records)
        accepted_count = sum(bool((records.get(key) or {}).get("accepted")) for key in lines)
        print(f"VOICE REVIEW {accepted_count}/{len(lines)} after seed {args.offline_seed}", flush=True)
        return

    for seed in SEEDS:
        pending = {key: text for key, text in lines.items() if not (records.get(key) or {}).get("accepted")}
        if not pending:
            break
        jobs: dict[str, str] = {}
        reused = 0
        for key, text in pending.items():
            if reusable_candidate(key, text, seed):
                reused += 1
            else:
                jobs[queue_candidate(studio, key, text, seed)] = key
        print(f"Seed {seed}: queued {len(jobs)}, reused {reused}", flush=True)
        wait_for_jobs(studio, jobs, args.timeout)

        records = evaluate_candidates(lines, records, seed)
        write_outputs(lines, records)

    write_outputs(lines, records)
    accepted_count = sum(bool((records.get(key) or {}).get("accepted")) for key in lines)
    print(f"VOICE DONE {accepted_count}/{len(lines)}; omitted {len(lines) - accepted_count}", flush=True)


if __name__ == "__main__":
    main()
