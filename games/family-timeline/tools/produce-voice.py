#!/usr/bin/env python3
"""Generate and Whisper-check Family Timeline voice lines on the approved LAN API."""
from __future__ import annotations

import argparse, difflib, hashlib, json, os, re, shutil, subprocess, sys, tempfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
AUDIO = GAME / "assets" / "audio"
VOICE = AUDIO / "voice"
QA_PATH = VOICE / "qa-report.json"
LINES_PATH = AUDIO / "lines.json"
MANIFEST_PATH = AUDIO / "manifest.json"
SEEDS = (7, 8, 9)

def run(cmd: list[str], timeout: int = 900) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""): h.update(chunk)
    return h.hexdigest()

def norm(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))

def score(expected: str, heard: str) -> tuple[bool, float, float]:
    want, got = norm(expected), norm(heard)
    ratio = difflib.SequenceMatcher(None, want, got).ratio()
    words = want.split(); heard_words = got.split()
    coverage = sum(w in heard_words for w in words) / max(1, len(words))
    return want == got or (ratio >= .92 and coverage >= .95), round(ratio, 3), round(coverage, 3)

def duration(path: Path) -> float:
    r = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", str(path)], 30)
    try: return round(float(r.stdout.strip()), 3)
    except ValueError: return 0.0

def volume(path: Path) -> float | None:
    r = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"], 60)
    m = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", r.stderr)
    return round(float(m.group(1)), 1) if m else None

def load_settings() -> tuple[str, Path]:
    local = Path(__file__).resolve().parents[3] / "tools" / "state" / "local.json"
    settings = json.loads(local.read_text(encoding="utf-8")) if local.is_file() else {}
    api = (os.environ.get("QLOBE_QWEN_URL") or settings.get("qwenUrl") or "").rstrip("/")
    ref = os.environ.get("QLOBE_TEACHER_VOICE") or os.environ.get("QLOBE_VOICE_REF") or settings.get("teacherVoicePath") or ""
    path = Path(ref).expanduser()
    packaged_reference = GAME.parent / "family-story-interview" / "assets" / "audio" / "welcome.m4a"
    if not path.is_file() and packaged_reference.is_file():
        path = packaged_reference
    if not api or not path.is_file():
        raise SystemExit("Local voice API or approved teacher reference is unavailable")
    return api, path

def lines() -> dict[str, str]:
    config = json.loads((GAME / "config.json").read_text(encoding="utf-8"))
    values = config.get("voice", {})
    if not isinstance(values, dict) or not values: raise SystemExit("config.json has no voice lines")
    AUDIO.mkdir(parents=True, exist_ok=True)
    LINES_PATH.write_text(json.dumps(values, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return values

def write_manifest(line_map: dict[str, str], report: dict) -> dict:
    manifest = {}
    for key, text in line_map.items():
        audio = VOICE / f"{key}.mp3"
        entry = report.get(key, {})
        if entry.get("valid") and audio.is_file():
            manifest[key] = {
                "file": f"voice/{key}.mp3",
                "dur": duration(audio),
                "textHash": hashlib.sha256(text.encode("utf-8")).hexdigest()[:16],
            }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest

def tts(api: str, ref: Path, text: str, seed: int, out: Path) -> bool:
    with tempfile.TemporaryDirectory(prefix="family-timeline-voice-") as td:
        raw = Path(td) / "take.flac"
        r = run(["curl", "-sS", "-X", "POST", f"{api}/workflows/qwen3-tts-voiceclone?sync=true", "-F", f"voice=@{ref}", "-F", f"text={text}", "-F", f"seed={seed}", "--output", str(raw), "--max-time", "900"], 930)
        if r.returncode or not raw.is_file() or raw.stat().st_size < 2000: return False
        encoded = run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9", "-c:a", "libmp3lame", "-b:a", "96k", "-ar", "24000", "-ac", "1", str(out)], 90)
    return encoded.returncode == 0 and out.is_file() and duration(out) >= .25

def whisper(api: str, audio: Path, expected: str) -> str:
    r = run(["curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true", "-F", f"audio=@{audio}", "-F", "model_size=base", "-F", "language=en", "-F", f"initial_prompt={expected}", "--max-time", "900"], 930)
    try: return str(json.loads(r.stdout).get("text") or json.loads(r.stdout).get("transcript") or "").strip()
    except (json.JSONDecodeError, AttributeError): return ""

def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Family Timeline MP3 narration and Whisper QA.")
    parser.add_argument("--force", action="store_true", help="regenerate and reverify all lines")
    parser.add_argument("--check", action="store_true", help="report existing QA without network generation")
    args = parser.parse_args()
    line_map = lines(); VOICE.mkdir(parents=True, exist_ok=True)
    report = json.loads(QA_PATH.read_text(encoding="utf-8")) if QA_PATH.is_file() else {}
    if args.check:
        missing = [k for k in line_map if not (VOICE / f"{k}.mp3").is_file() or not report.get(k, {}).get("valid")]
        manifest = write_manifest(line_map, report)
        print(json.dumps({"accepted": len(manifest), "missing": missing}, indent=2)); return 1 if missing else 0
    api, ref = load_settings()
    for binary in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(binary): raise SystemExit(f"required binary missing: {binary}")
    pending = list(line_map)
    for seed in SEEDS:
        retry = []
        for key in pending:
            text = line_map[key]; out = VOICE / f"{key}.mp3"
            if not args.force and report.get(key, {}).get("valid") and out.is_file(): continue
            ok = tts(api, ref, text, seed, out)
            heard = whisper(api, out, text) if ok else ""
            match, ratio, coverage = score(text, heard)
            dur, vol = duration(out), volume(out)
            valid = bool(ok and match and .35 <= dur <= 24 and vol is not None and -36 <= vol <= -5)
            report[key] = {"sourceText": text, "textHash": hashlib.sha256(text.encode()).hexdigest()[:16], "engine": "qwen3-tts-voiceclone", "verifier": "whisper-stt", "seed": seed, "transcript": heard, "score": ratio, "coverage": coverage, "duration": dur, "meanVolumeDb": vol, "valid": valid}
            if not valid: retry.append(key)
            print(f"{key}: {'accepted' if valid else 'retry'}", flush=True)
        QA_PATH.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        write_manifest(line_map, report)
        pending = retry
        if not pending: break
    manifest = write_manifest(line_map, report)
    print(f"complete: accepted={len(manifest)} rejected={len(pending)}")
    return 1 if pending else 0

if __name__ == "__main__": raise SystemExit(main())
