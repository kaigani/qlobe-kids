#!/usr/bin/env python3
"""Generate and Whisper-QA every Throwing Target Garden voice line.

``assets/audio/lines.json`` is the source of truth. The LAN URL comes from a
flag/environment or the local (git-ignored) state. The voice reference is an
explicit flag or the committed, synthetic platform voice; a machine-local
private reference is never selected implicitly. Neither path is written to
generated metadata.
"""
from __future__ import annotations

import argparse, concurrent.futures, contextlib, datetime, difflib, fcntl, hashlib, json, os, re, subprocess, sys, tempfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
LINES = OUT / "lines.json"
STATE = ROOT / "tools/state/local.json"
PLATFORM_VOICE = ROOT / "shared/assets/refs/voice-teacher.wav"
SEEDS = (7, 8, 9)

def run(cmd: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as error:
        stdout = error.stdout.decode(errors="replace") if isinstance(error.stdout, bytes) else (error.stdout or "")
        stderr = error.stderr.decode(errors="replace") if isinstance(error.stderr, bytes) else (error.stderr or "")
        return subprocess.CompletedProcess(cmd, 124, stdout, f"{stderr}\ncommand timed out after {timeout}s".strip())
    except OSError as error:
        return subprocess.CompletedProcess(cmd, 127, "", f"command could not start: {error}")

def norm(s: str) -> str: return re.sub(r"[^a-z0-9]", "", s.lower())
def redact(s: str) -> str:
    return re.sub(r"(?:https?://)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?", "[configured LAN endpoint]", s)
def score(expected: str, heard: str) -> tuple[bool, float]:
    ratio = difflib.SequenceMatcher(None, norm(expected), norm(heard)).ratio()
    return ratio >= 0.92 or norm(expected) == norm(heard), round(ratio, 3)
def sha(path: Path) -> str:
    h = hashlib.sha256(); h.update(path.read_bytes()); return h.hexdigest()
def write_json(path: Path, payload: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)
def duration(path: Path) -> float:
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], 30)
    if r.returncode: return 0.0
    try: return round(float(r.stdout.strip()), 3)
    except (AttributeError, ValueError): return 0.0

@contextlib.contextmanager
def generation_lock():
    """Serialize publication without leaving a repository lock artifact."""
    identity = hashlib.sha256(str(GAME).encode()).hexdigest()[:16]
    lock_path = Path(tempfile.gettempdir()) / f"qlobe-throwing-target-voice-{identity}.lock"
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

def synth_candidate(api: str, ref: str, key: str, text: str, seed: int, stage: Path) -> tuple[str, Path | None, str]:
    """Run only the TTS/encode phase so model families remain batched."""
    raw = stage / f"{key}-{seed}.flac"
    encoded = stage / f"{key}-{seed}.m4a"
    result = run([
        "curl", "-sS", "-X", "POST", f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
        "-F", f"voice=@{ref}", "-F", f"text={text}", "-F", f"seed={seed}",
        "--output", str(raw), "--max-time", "900",
    ], 930)
    if result.returncode or not raw.is_file() or raw.stat().st_size < 2000:
        size = raw.stat().st_size if raw.is_file() else 0
        detail = redact(result.stderr.strip())[:240] or "no stderr"
        return key, None, f"seed {seed}: synthesis failed (curl rc={result.returncode}, bytes={size}, {detail})"
    encode = run([
        "ffmpeg", "-y", "-loglevel", "error", "-i", str(raw),
        "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-ac", "1", "-ar", "48000",
        "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded),
    ], 60)
    if encode.returncode or not encoded.is_file() or encoded.stat().st_size < 2000:
        return key, None, f"seed {seed}: encode failed"
    return key, encoded, ""

def transcribe_candidate(api: str, key: str, text: str, seed: int, encoded: Path) -> tuple[str, dict | None, str]:
    """Run only Whisper QA after the whole TTS batch for this seed finishes."""
    result = run([
        "curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
        "-F", f"audio=@{encoded}", "-F", "model_size=base", "-F", "language=en",
        "-F", f"initial_prompt={text}", "--max-time", "900",
    ], 930)
    try: heard = str(json.loads(result.stdout).get("text", "")).strip()
    except json.JSONDecodeError: heard = ""
    ok, ratio = score(text, heard)
    clip_duration = duration(encoded)
    if result.returncode or not ok or clip_duration < 0.25:
        detail = redact(result.stderr.strip())[:160]
        suffix = f"; {detail}" if detail else ""
        return key, None, f"seed {seed}: transcript {heard!r} (ratio {ratio}){suffix}"
    dest = OUT / f"{key}.m4a"
    temporary = dest.with_suffix(dest.suffix + ".tmp")
    temporary.write_bytes(encoded.read_bytes())
    temporary.replace(dest)
    return key, {
        "valid": True,
        "seed": seed,
        "intended": text,
        "heard": heard,
        "ratio": ratio,
        "duration": duration(dest),
        "bytes": dest.stat().st_size,
        "sha256": sha(dest),
        "textHash": hashlib.sha256(text.encode()).hexdigest()[:16],
        "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }, ""

def generate_batch(a: argparse.Namespace, lines: dict[str, str], api: str, ref: str) -> int:
    """Generate one all-or-nothing runtime batch while the caller owns the lock."""
    qa = {}; pending = {}; failures = {}
    try: previous_qa = json.loads((OUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError): previous_qa = {}
    def reusable(item):
        key, text = item; path = OUT / f"{key}.m4a"
        prior = previous_qa.get(key, {}) if isinstance(previous_qa, dict) else {}
        if (not a.force and path.is_file() and path.stat().st_size > 2000
                and prior.get("valid") is True and prior.get("intended") == text
                and prior.get("ratio", 0) >= 0.92 and prior.get("sha256") == sha(path)
                and duration(path) >= 0.25):
            qa[key] = {**prior, "duration": duration(path), "bytes": path.stat().st_size, "sha256": sha(path)}
            print(f"{key}: reused", flush=True)
        else:
            pending[key] = text

    for item in lines.items(): reusable(item)
    workers = max(1, min(3, a.workers))
    with tempfile.TemporaryDirectory(prefix="throwing-target-voice-") as td:
        stage = Path(td)
        for seed in SEEDS:
            if not pending: break
            batch = list(pending.items())
            print(f"seed {seed}: TTS batch {len(batch)}", flush=True)
            candidates = {}
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
                jobs = ((api, ref, key, text, seed, stage) for key, text in batch)
                for key, encoded, error in ex.map(lambda args: synth_candidate(*args), jobs):
                    if encoded is not None: candidates[key] = encoded
                    else: failures[key] = error
            print(f"seed {seed}: Whisper batch {len(candidates)}", flush=True)
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
                jobs = ((api, key, pending[key], seed, encoded) for key, encoded in candidates.items())
                for key, result, error in ex.map(lambda args: transcribe_candidate(*args), jobs):
                    if result is not None:
                        qa[key] = result
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
            "textHash": hashlib.sha256(text.encode()).hexdigest()[:16],
            "checkedAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "error": failures.get(key, "no attempt"),
        }
    manifest = {k: {"file": f"{k}.m4a", "dur": v["duration"], "sha256": v["sha256"], "textHash": hashlib.sha256(lines[k].encode()).hexdigest()[:16]} for k, v in qa.items() if v.get("valid")}
    bad = [k for k in lines if k not in manifest]
    write_json(OUT / "qa.json", qa)
    # Runtime publication is batch-level fail-closed: a partial attempt may
    # leave useful authoring files, but it never exposes a mixed voice manifest.
    write_json(OUT / "manifest.json", manifest if not bad else {})
    print(f"complete: {len(manifest)}/{len(lines)}; failures={bad}"); return 1 if bad else 0

def main() -> int:
    p = argparse.ArgumentParser(); p.add_argument("--qwen-url"); p.add_argument("--voice-ref"); p.add_argument("--force", action="store_true"); p.add_argument("--workers", type=int, default=2)
    a = p.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    try:
        with generation_lock():
            # A generation attempt is unavailable to the runtime until every
            # line, transcript, checksum, and media check succeeds together.
            write_json(OUT / "manifest.json", {})
            try:
                lines = json.loads(LINES.read_text())
                state = json.loads(STATE.read_text()) if STATE.exists() else {}
                api = (a.qwen_url or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
                ref = a.voice_ref or (str(PLATFORM_VOICE) if PLATFORM_VOICE.is_file() else "")
                if not api or not ref or not Path(ref).is_file():
                    raise RuntimeError("LAN endpoint and a readable synthetic platform voice reference are required")
                return generate_batch(a, lines, api, ref)
            except Exception as error:
                write_json(OUT / "manifest.json", {})
                print(f"generation failed closed: {redact(str(error))}", file=sys.stderr)
                return 1
    except BlockingIOError:
        print("another Throwing Target Garden voice batch is already running", file=sys.stderr)
        return 2
if __name__ == "__main__": raise SystemExit(main())
