#!/usr/bin/env python3
"""Generate and Whisper-QA every Garden Graphers teacher-voice line.

``assets/audio/lines.json`` is the source of truth. The LAN URL and approved
teacher-narrator reference come from flags, environment variables, git-ignored
local state, or the committed platform fallback. Endpoint and reference paths
are never written to generated metadata; only a reference checksum is retained.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import contextlib
import datetime
import fcntl
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
GDD = GAME / "game-design.md"
LINES = OUT / "lines.json"
STATE = ROOT / "tools/state/local.json"
PLATFORM_VOICE = ROOT / "shared/assets/refs/voice-teacher.wav"
SEEDS = (7, 8, 9)
NUMBER_WORDS = {
    "0": "zero", "1": "one", "2": "two", "3": "three", "4": "four",
    "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine",
}


def run(cmd: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout.decode(errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
        stderr = error.stderr.decode(errors="replace") if isinstance(error.stderr, bytes) else (error.stderr or "")
        return subprocess.CompletedProcess(cmd, 124, stdout, f"{stderr}\ncommand timed out after {timeout}s".strip())
    except OSError as error:
        return subprocess.CompletedProcess(cmd, 127, "", f"command could not start: {error}")


def norm(value: str) -> str:
    # Whisper freely alternates between "Day five" and "Day 5" for the same
    # audio. Canonicalize single spoken digits before the exact lexical check;
    # every other word still has to match exactly.
    value = re.sub(r"\b[0-9]\b", lambda match: NUMBER_WORDS[match.group(0)], value)
    return re.sub(r"[^a-z0-9]", "", value.lower())


def redact(value: str) -> str:
    return re.sub(
        r"(?:https?://)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?",
        "[configured LAN endpoint]",
        value,
    )


def score(key: str, expected: str, heard: str) -> tuple[bool, float]:
    intended = norm(expected)
    transcript = norm(heard)
    ratio = 1.0 if intended == transcript else 0.0
    name = key.split("-", 1)[1] if key.startswith(("build-", "reveal-")) else ""
    name_ok = not name or norm(name) in transcript
    return intended == transcript and name_ok, round(ratio, 3)


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def text_hash(text: str) -> str:
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def gdd_lines() -> dict[str, str]:
    """Read the authoritative key/verbatim table, preserving its exact text."""
    text = GDD.read_text(encoding="utf-8")
    match = re.search(r"##+ Exact voice script(?P<table>.*?)(?=\n##+ |\Z)", text, re.S)
    if not match:
        raise RuntimeError("exact voice script table missing from game-design.md")
    lines: dict[str, str] = {}
    for row in match.group("table").splitlines():
        found = re.match(r"\|\s*`([^`]+)`\s*\|\s*[“\"](.*?)[”\"]\s*\|\s*$", row)
        if found:
            lines[found.group(1)] = found.group(2)
    if not lines:
        raise RuntimeError("exact voice script table is empty")
    return lines


def write_json(path: Path, payload: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def studio_json(base: str, path: str, payload: object | None = None, method: str = "GET") -> dict:
    """Call only the localhost Studio surface; errors never expose LAN config."""
    data = None if payload is None and method == "GET" else json.dumps(payload or {}).encode()
    request = Request(
        f"{base.rstrip('/')}{path}", data=data, method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urlopen(request, timeout=30) as response:
            body = json.loads(response.read().decode())
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError) as error:
        raise RuntimeError(f"Studio request failed for {path}: {redact(str(error))}") from error
    if not body.get("ok"):
        raise RuntimeError(f"Studio rejected {path}: {body.get('error') or body}")
    return body


def duration(path: Path) -> float:
    result = run([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "csv=p=0", str(path),
    ], 30)
    if result.returncode:
        return 0.0
    try:
        return round(float(result.stdout.strip()), 3)
    except (AttributeError, ValueError):
        return 0.0


def mean_volume(path: Path) -> float | None:
    result = run([
        "ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
        "-af", "volumedetect", "-f", "null", "-",
    ], 60)
    match = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(match.group(1)), 1) if match else None


@contextlib.contextmanager
def generation_lock():
    """Serialize publication without leaving a repository lock artifact."""
    identity = hashlib.sha256(str(GAME).encode()).hexdigest()[:16]
    lock_path = Path(tempfile.gettempdir()) / f"qlobe-garden-graphers-voice-{identity}.lock"
    handle = lock_path.open("a+")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        handle.close()
        raise
    try:
        yield
    finally:
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def synth_candidate(
    api: str,
    ref: str,
    key: str,
    text: str,
    seed: int,
    stage: Path,
) -> tuple[str, Path | None, str]:
    """Run the TTS/encode phase so model families remain batched."""
    raw = stage / f"{key}-{seed}.flac"
    encoded = stage / f"{key}-{seed}.m4a"
    result = run([
        "curl", "-sS", "-X", "POST",
        f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
        "-F", f"voice=@{ref}", "-F", f"text={text}", "-F", f"seed={seed}",
        "--output", str(raw), "--max-time", "900",
    ], 930)
    if result.returncode or not raw.is_file() or raw.stat().st_size < 2_000:
        size = raw.stat().st_size if raw.is_file() else 0
        detail = redact(result.stderr.strip())[:240] or "no stderr"
        return key, None, f"seed {seed}: synthesis failed (curl rc={result.returncode}, bytes={size}, {detail})"
    encode = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
        "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-ac", "1", "-ar", "48000",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded),
    ], 60)
    if encode.returncode or not encoded.is_file() or encoded.stat().st_size < 2_000:
        return key, None, f"seed {seed}: encode failed"
    return key, encoded, ""


def transcribe_candidate(
    api: str,
    key: str,
    text: str,
    seed: int,
    encoded: Path,
) -> tuple[str, dict | None, str]:
    """Run Whisper only after the TTS batch for this seed has finished."""
    result = run([
        "curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
        "-F", f"audio=@{encoded}", "-F", "model_size=base", "-F", "language=en",
        "--max-time", "900",
    ], 930)
    try:
        heard = str(json.loads(result.stdout).get("text", "")).strip()
    except json.JSONDecodeError:
        heard = ""
    accepted, ratio = score(key, text, heard)
    clip_duration = duration(encoded)
    volume = mean_volume(encoded)
    audio_ok = (
        encoded.stat().st_size >= 2_000
        and 0.35 <= clip_duration <= 20
        and volume is not None
        and -36 <= volume <= -5
    )
    if result.returncode or not accepted or not audio_ok:
        detail = redact(result.stderr.strip())[:160]
        suffix = f"; {detail}" if detail else ""
        return key, None, (
            f"seed {seed}: transcript {heard!r} (ratio {ratio}); "
            f"duration={clip_duration}s mean={volume}dB{suffix}"
        )
    dest = OUT / f"{key}.m4a"
    temporary = dest.with_suffix(dest.suffix + ".tmp")
    temporary.write_bytes(encoded.read_bytes())
    temporary.replace(dest)
    return key, {
        "valid": True,
        "engine": "qwen3-tts-voiceclone",
        "voice": "platform-teacher-narrator",
        "seed": seed,
        "intended": text,
        "heard": heard,
        "ratio": ratio,
        "duration": duration(dest),
        "meanVolumeDb": volume,
        "bytes": dest.stat().st_size,
        "sha256": sha(dest),
        "textHash": text_hash(text),
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }, ""


def generate_batch(args: argparse.Namespace, lines: dict[str, str], api: str, ref: str) -> int:
    """Generate one all-or-nothing runtime batch while holding the lock."""
    reference_hash = sha(Path(ref))
    qa: dict[str, dict] = {}
    pending: dict[str, str] = {}
    failures: dict[str, str] = {}
    try:
        previous_qa = json.loads((OUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        previous_qa = {}

    for key, text in lines.items():
        path = OUT / f"{key}.m4a"
        prior = previous_qa.get(key, {}) if isinstance(previous_qa, dict) else {}
        reusable = (
            not args.force
            and path.is_file()
            and path.stat().st_size > 2_000
            and prior.get("valid") is True
            and prior.get("engine") == "qwen3-tts-voiceclone"
            and prior.get("voice") == "platform-teacher-narrator"
            and prior.get("referenceSha256") == reference_hash
            and prior.get("intended") == text
            and prior.get("ratio") == 1.0
            and prior.get("sha256") == sha(path)
            and duration(path) >= 0.35
        )
        if reusable:
            qa[key] = {
                **prior,
                "duration": duration(path),
                "bytes": path.stat().st_size,
                "sha256": sha(path),
            }
            print(f"{key}: reused", flush=True)
        else:
            pending[key] = text

    workers = max(1, min(3, args.workers))
    with tempfile.TemporaryDirectory(prefix="garden-graphers-voice-") as folder:
        stage = Path(folder)
        for seed in SEEDS:
            if not pending:
                break
            batch = list(pending.items())
            print(f"seed {seed}: TTS batch {len(batch)}", flush=True)
            candidates: dict[str, Path] = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                jobs = ((api, ref, key, text, seed, stage) for key, text in batch)
                for key, encoded, error in executor.map(lambda params: synth_candidate(*params), jobs):
                    if encoded is not None:
                        candidates[key] = encoded
                    else:
                        failures[key] = error
            print(f"seed {seed}: Whisper batch {len(candidates)}", flush=True)
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
                jobs = ((api, key, pending[key], seed, encoded) for key, encoded in candidates.items())
                for key, receipt, error in executor.map(lambda params: transcribe_candidate(*params), jobs):
                    if receipt is not None:
                        receipt["referenceSha256"] = reference_hash
                        qa[key] = receipt
                        pending.pop(key, None)
                        failures.pop(key, None)
                        print(f"{key}: ok (seed {seed})", flush=True)
                    else:
                        failures[key] = error

    for key, text in pending.items():
        qa[key] = {
            "valid": False,
            "intended": text,
            "heard": "",
            "textHash": text_hash(text),
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "error": failures.get(key, "no attempt"),
        }

    manifest = {
        key: {
            "file": f"{key}.m4a",
            "dur": receipt["duration"],
            "sha256": receipt["sha256"],
            "textHash": text_hash(lines[key]),
        }
        for key, receipt in qa.items()
        if receipt.get("valid")
    }
    bad = [key for key in lines if key not in manifest]
    write_json(OUT / "qa.json", qa)
    write_json(OUT / "manifest.json", manifest if not bad else {})
    print(f"complete: {len(manifest)}/{len(lines)}; failures={bad}")
    return 1 if bad else 0


def generate_batch_studio(args: argparse.Namespace, lines: dict[str, str], studio: str, ref: str) -> int:
    """Queue voice jobs through localhost Studio, then require exact unprompted QA."""
    studio_json(studio, "/api/studio/status")
    reference_hash = sha(Path(ref))
    # Studio assignment allows one game-local subdirectory directly below
    # assets/. Keep accepted authoring masters there; runtime clips stay in
    # assets/audio/ under their stable manifest keys.
    source_dir = GAME / "assets/voice-source"
    source_rel = source_dir.relative_to(ROOT).as_posix()
    source_dir.mkdir(parents=True, exist_ok=True)
    qa: dict[str, dict] = {}
    pending: dict[str, str] = {}
    failures: dict[str, str] = {}
    try:
        previous_qa = json.loads((OUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        previous_qa = {}

    for key, text in lines.items():
        path = OUT / f"{key}.m4a"
        prior = previous_qa.get(key, {}) if isinstance(previous_qa, dict) else {}
        reusable = (
            not args.force and path.is_file() and path.stat().st_size > 2_000
            and prior.get("valid") is True
            and prior.get("engine") == "qwen3-tts-voiceclone"
            and prior.get("voice") == "platform-teacher-narrator"
            and prior.get("transcriptMode") == "unconditioned"
            and prior.get("referenceSha256") == reference_hash
            and prior.get("intended") == text and prior.get("ratio") == 1.0
            and prior.get("sha256") == sha(path) and duration(path) >= 0.35
        )
        if reusable:
            qa[key] = {**prior, "duration": duration(path), "bytes": path.stat().st_size, "sha256": sha(path)}
            print(f"{key}: reused", flush=True)
        else:
            pending[key] = text

    def publish_media(key: str, intended: str, media_id: str, seed: int) -> dict:
        """Publish one exact Studio result and return its immutable QA receipt."""
        folder = ROOT / "shared" / "media" / media_id
        recipe_path = folder / "recipe.json"
        recipe = json.loads(recipe_path.read_text())
        transcript = ((recipe.get("qa") or {}).get("transcript") or {})
        heard = str(transcript.get("heard") or "").strip()
        exact = norm(intended) == norm(heard) and bool(norm(heard))
        asset_name = str(recipe.get("asset") or "")
        asset = folder / asset_name
        clip_duration = duration(asset)
        volume = mean_volume(asset)
        audio_ok = (
            asset.is_file() and asset.stat().st_size >= 2_000
            and 0.35 <= clip_duration <= 20 and volume is not None and -36 <= volume <= -5
        )
        if not exact or not audio_ok:
            if (recipe.get("qa") or {}).get("status") != "accepted":
                studio_json(studio, f"/api/studio/media/{media_id}/reject", {}, "POST")
            raise RuntimeError(
                f"seed {seed}: unconditioned transcript {heard!r} (exact={exact}); "
                f"duration={clip_duration}s mean={volume}dB"
            )

        studio_json(studio, f"/api/studio/media/{media_id}/accept", {}, "POST")
        assigned_asset = source_dir / asset_name
        assigned_recipe = source_dir / f"{asset_name}.recipe.json"
        if not (assigned_asset.is_file() and assigned_recipe.is_file()):
            assigned = studio_json(studio, f"/api/studio/media/{media_id}/assign", {
                "dest": source_rel,
            }, "POST")
            assigned_asset = ROOT / assigned["dest"]
            assigned_recipe = ROOT / assigned["recipe"]

        destination = OUT / f"{key}.m4a"
        temporary = destination.with_suffix(destination.suffix + ".tmp")
        temporary.write_bytes(assigned_asset.read_bytes())
        temporary.replace(destination)
        return {
            "valid": True,
            "engine": "qwen3-tts-voiceclone",
            "voice": "platform-teacher-narrator",
            "transcriptMode": "unconditioned",
            "seed": seed,
            "intended": intended,
            "heard": heard,
            "ratio": 1.0,
            "duration": duration(destination),
            "meanVolumeDb": volume,
            "bytes": destination.stat().st_size,
            "sha256": sha(destination),
            "textHash": text_hash(intended),
            "referenceSha256": reference_hash,
            "studioMediaId": media_id,
            "sourceRecipe": str(assigned_recipe.relative_to(ROOT)),
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }

    def recover_existing(seed: int) -> None:
        """Publish reviewed media left behind by an interrupted prior run."""
        for key, text in list(pending.items()):
            media_id = f"garden-graphers-{key}-seed{seed}"
            if not (ROOT / "shared" / "media" / media_id / "recipe.json").is_file():
                continue
            try:
                qa[key] = publish_media(key, text, media_id, seed)
                pending.pop(key, None)
                failures.pop(key, None)
                print(f"{key}: exact existing Studio media (seed {seed})", flush=True)
            except Exception as error:
                failures[key] = redact(str(error))

    # Search the whole retry ladder before enqueuing anything. A later-seed
    # candidate may already exist from a run interrupted during publication.
    for seed in SEEDS:
        recover_existing(seed)

    for seed in SEEDS:
        if not pending:
            break
        # Recover a candidate that may have settled while this process was
        # handling an earlier seed, then enqueue only what remains.
        recover_existing(seed)
        if not pending:
            break
        jobs: dict[str, tuple[str, str]] = {}
        print(f"seed {seed}: Studio queue {len(pending)}", flush=True)
        for key, text in list(pending.items()):
            media_id = f"garden-graphers-{key}-seed{seed}"
            try:
                queued = studio_json(studio, "/api/studio/generate", {
                    "kind": "generate-voice", "overwrite": True,
                    "params": {"id": media_id, "text": text, "seed": seed},
                }, "POST")
                jobs[queued["jobId"]] = (key, media_id)
            except Exception as error:
                failures[key] = str(error)

        deadline = time.monotonic() + 60 * 45
        while jobs and time.monotonic() < deadline:
            progressed = False
            for job_id, (key, media_id) in list(jobs.items()):
                job = studio_json(studio, f"/api/studio/jobs/{job_id}").get("job", {})
                status = job.get("status")
                if status not in ("completed", "failed", "cancelled"):
                    continue
                progressed = True
                jobs.pop(job_id, None)
                if status != "completed":
                    failures[key] = f"seed {seed}: Studio voice job {status} ({redact(str(job.get('error') or job.get('message') or 'unknown'))})"
                    continue
                try:
                    intended = pending[key]
                    receipt = publish_media(key, intended, media_id, seed)
                    qa[key] = receipt
                    pending.pop(key, None)
                    failures.pop(key, None)
                    print(f"{key}: exact (seed {seed})", flush=True)
                except Exception as error:
                    failures[key] = f"seed {seed}: Studio publication failed ({redact(str(error))})"
            if jobs:
                time.sleep(1 if progressed else 2)
        for _, (key, _) in jobs.items():
            failures[key] = f"seed {seed}: Studio job timed out"

    for key, text in pending.items():
        qa[key] = {
            "valid": False, "intended": text, "heard": "", "textHash": text_hash(text),
            "transcriptMode": "unconditioned",
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "error": failures.get(key, "no attempt"),
        }
    manifest = {
        key: {"file": f"{key}.m4a", "dur": receipt["duration"], "sha256": receipt["sha256"], "textHash": text_hash(lines[key])}
        for key, receipt in qa.items() if receipt.get("valid")
    }
    bad = [key for key in lines if key not in manifest]
    write_json(OUT / "qa.json", qa)
    write_json(OUT / "manifest.json", manifest if not bad else {})
    print(f"complete: {len(manifest)}/{len(lines)}; failures={bad}")
    return 1 if bad else 0


def check_batch(lines: dict[str, str]) -> int:
    try:
        manifest = json.loads((OUT / "manifest.json").read_text())
        qa = json.loads((OUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError) as error:
        print(f"voice check failed: {error}", file=sys.stderr)
        return 1
    failures = []
    if not isinstance(manifest, dict) or set(manifest) != set(lines):
        failures.append("manifest-key-set")
    if not isinstance(qa, dict) or set(qa) != set(lines):
        failures.append("qa-key-set")
    for key, text in lines.items():
        entry = manifest.get(key, {})
        receipt = qa.get(key, {})
        path = OUT / str(entry.get("file", ""))
        valid = (
            receipt.get("valid") is True
            and receipt.get("engine") == "qwen3-tts-voiceclone"
            and receipt.get("voice") == "platform-teacher-narrator"
            and re.fullmatch(r"[0-9a-f]{64}", str(receipt.get("referenceSha256", ""))) is not None
            and receipt.get("intended") == text
            and receipt.get("ratio") == 1.0
            and entry.get("textHash") == text_hash(text)
            and path.is_file()
            and path.stat().st_size > 2_000
            and entry.get("sha256") == sha(path)
            and 0.35 <= duration(path) <= 20
        )
        if not valid:
            failures.append(key)
    print(f"voice check: {len(lines) - len(failures)}/{len(lines)}; failures={failures}")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--voice-ref")
    parser.add_argument("--studio-url", default=os.getenv("QLOBE_STUDIO_URL", "http://127.0.0.1:8000"))
    parser.add_argument("--direct", action="store_true", help="Call the configured model URL instead of localhost Studio")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    lines = gdd_lines()
    write_json(LINES, lines)
    if args.check:
        return check_batch(lines)
    try:
        with generation_lock():
            publication_started = False
            try:
                state = json.loads(STATE.read_text()) if STATE.exists() else {}
                api = (args.qwen_url or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
                ref = (
                    args.voice_ref
                    or os.getenv("QLOBE_TEACHER_VOICE")
                    or state.get("teacherVoicePath")
                    or (str(PLATFORM_VOICE) if PLATFORM_VOICE.is_file() else "")
                )
                if not ref or not Path(ref).is_file():
                    raise RuntimeError("a readable platform teacher-narrator reference is required")
                write_json(OUT / "manifest.json", {})
                publication_started = True
                if not args.direct:
                    return generate_batch_studio(args, lines, args.studio_url, ref)
                if not api:
                    raise RuntimeError("a configured LAN model endpoint is required for --direct")
                return generate_batch(args, lines, api, ref)
            except Exception as error:
                if publication_started:
                    write_json(OUT / "manifest.json", {})
                print(f"generation failed closed: {redact(str(error))}", file=sys.stderr)
                return 1
    except BlockingIOError:
        print("another Bean Sprout Watch voice batch is already running", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
