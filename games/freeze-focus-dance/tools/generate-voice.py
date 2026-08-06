#!/usr/bin/env python3
"""Generate and Whisper-QA every Freeze Focus Dance voice line.

``assets/audio/lines.json`` is the source of truth. The LAN URL comes from a
flag/environment or the local (git-ignored) state. The voice reference is an
explicit flag or the committed, synthetic platform voice; a machine-local
private reference is never selected implicitly. Neither path is written to
generated metadata.
"""
from __future__ import annotations

import argparse, concurrent.futures, difflib, hashlib, json, os, re, subprocess, sys, tempfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
LINES = OUT / "lines.json"
STATE = ROOT / "tools/state/local.json"
PLATFORM_VOICE = ROOT / "shared/assets/refs/voice-teacher.wav"
SEEDS = (7, 8, 9)

def run(cmd: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

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
    try: return round(float(r.stdout.strip()), 3)
    except ValueError: return 0.0

def synth(api: str, ref: str, key: str, text: str) -> dict:
    dest = OUT / f"{key}.m4a"; last = "no attempt"
    for seed in SEEDS:
        with tempfile.TemporaryDirectory(prefix="freeze-voice-") as td:
            raw = Path(td) / "voice.flac"; tmp = Path(td) / "voice.m4a"
            r = run(["curl", "-sS", "-X", "POST", f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
                     "-F", f"voice=@{ref}", "-F", f"text={text}", "-F", f"seed={seed}", "--output", str(raw), "--max-time", "900"], 930)
            if r.returncode or not raw.is_file() or raw.stat().st_size < 2000:
                size = raw.stat().st_size if raw.is_file() else 0
                detail = redact(r.stderr.strip())[:240] or "no stderr"
                last = f"seed {seed}: synthesis failed (curl rc={r.returncode}, bytes={size}, {detail})"; continue
            e = run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(tmp)], 60)
            if e.returncode or not tmp.is_file() or tmp.stat().st_size < 2000:
                last = f"seed {seed}: encode failed"; continue
            t = run(["curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true", "-F", f"audio=@{tmp}", "-F", "model_size=base", "-F", "language=en", "-F", f"initial_prompt={text}", "--max-time", "900"], 930)
            try: heard = str(json.loads(t.stdout).get("text", "")).strip()
            except json.JSONDecodeError: heard = ""
            ok, ratio = score(text, heard)
            if ok and duration(tmp) >= 0.25:
                dest.write_bytes(tmp.read_bytes())
                return {"valid": True, "seed": seed, "intended": text, "heard": heard, "ratio": ratio, "duration": duration(dest), "bytes": dest.stat().st_size, "sha256": sha(dest)}
            last = f"seed {seed}: transcript {heard!r} (ratio {ratio})"
    return {"valid": False, "intended": text, "heard": "", "error": last}

def main() -> int:
    p = argparse.ArgumentParser(); p.add_argument("--qwen-url"); p.add_argument("--voice-ref"); p.add_argument("--force", action="store_true"); p.add_argument("--workers", type=int, default=2)
    a = p.parse_args(); lines = json.loads(LINES.read_text()); state = json.loads(STATE.read_text()) if STATE.exists() else {}
    api = (a.qwen_url or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    ref = a.voice_ref or (str(PLATFORM_VOICE) if PLATFORM_VOICE.is_file() else "")
    if not api or not ref: p.error("LAN endpoint and synthetic platform voice reference are required")
    OUT.mkdir(parents=True, exist_ok=True); qa = {}
    try: previous_qa = json.loads((OUT / "qa.json").read_text())
    except (FileNotFoundError, json.JSONDecodeError): previous_qa = {}
    def one(item):
        key, text = item; path = OUT / f"{key}.m4a"
        prior = previous_qa.get(key, {}) if isinstance(previous_qa, dict) else {}
        if (not a.force and path.is_file() and path.stat().st_size > 2000
                and prior.get("valid") is True and prior.get("intended") == text
                and prior.get("ratio", 0) >= 0.92 and prior.get("sha256") == sha(path)
                and duration(path) >= 0.25):
            return key, {**prior, "duration": duration(path), "bytes": path.stat().st_size, "sha256": sha(path)}
        return key, synth(api, ref, key, text)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(3, a.workers))) as ex:
        for key, result in ex.map(one, lines.items()): qa[key] = result; print(f"{key}: {'ok' if result['valid'] else 'FAILED'}", flush=True)
    manifest = {k: {"file": f"{k}.m4a", "dur": v["duration"], "sha256": v["sha256"], "textHash": hashlib.sha256(lines[k].encode()).hexdigest()[:16]} for k, v in qa.items() if v.get("valid")}
    bad = [k for k in lines if k not in manifest]
    write_json(OUT / "qa.json", qa)
    # Runtime publication is batch-level fail-closed: a partial attempt may
    # leave useful authoring files, but it never exposes a mixed voice manifest.
    write_json(OUT / "manifest.json", manifest if not bad else {})
    print(f"complete: {len(manifest)}/{len(lines)}; failures={bad}"); return 1 if bad else 0
if __name__ == "__main__": raise SystemExit(main())
