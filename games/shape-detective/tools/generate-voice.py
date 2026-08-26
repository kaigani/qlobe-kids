#!/usr/bin/env python3
"""Generate Shape Detective narration and accept clips only after Whisper QA."""
from __future__ import annotations
import argparse, difflib, hashlib, json, os, re, shutil, subprocess, tempfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets/audio"
LINES = OUT / "lines.json"
STATE = ROOT / "tools/state/local.json"
SEEDS = (7, 8, 9)
EVIDENCE = GAME / "assets/source/local-api/voice"

def readable_file(value: str | Path) -> bool:
    try:
        with Path(value).open("rb") as handle: handle.read(1)
        return True
    except OSError: return False

def run(command: list[str], timeout: int = 930) -> subprocess.CompletedProcess[str]:
    try: return subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as e: return subprocess.CompletedProcess(command, 1, "", str(e))

def configured() -> tuple[str, str]:
    api = os.getenv("QLOBE_QWEN_URL", "")
    ref = os.getenv("QLOBE_TEACHER_VOICE", "")
    if not api or not ref:
        try:
            state = json.loads(STATE.read_text())
            api, ref = api or state.get("qwenUrl", ""), ref or state.get("teacherVoicePath", "")
        except (OSError, json.JSONDecodeError): pass
    shared_reference = ROOT / "shared/assets/refs/voice-teacher.wav"
    if not readable_file(ref) and readable_file(shared_reference): ref = str(shared_reference)
    return api.rstrip("/"), ref

def normalized(s: str) -> str: return re.sub(r"[^a-z0-9]", "", s.lower())

def make_clip(api: str, ref: str, key: str, text: str, seed: int, folder: Path) -> Path | None:
    raw, encoded = folder / f"{key}-{seed}.flac", folder / f"{key}-{seed}.m4a"
    result = run(["curl", "-sS", "-X", "POST", f"{api}/workflows/qwen3-tts-voiceclone?sync=true", "-F", f"voice=@{ref}", "-F", f"text={text}", "-F", f"seed={seed}", "--output", str(raw), "--max-time", "900"])
    if result.returncode or not raw.is_file() or raw.stat().st_size < 2000: return None
    result = run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-af", "loudnorm=I=-18:TP=-2:LRA=9", "-ac", "1", "-ar", "48000", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(encoded)], 90)
    return encoded if result.returncode == 0 and encoded.is_file() and encoded.stat().st_size >= 2000 else None

def whisper_ok(api: str, clip: Path, expected: str) -> tuple[bool, str, float]:
    result = run(["curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true", "-F", f"audio=@{clip}", "-F", "model_size=base", "-F", "language=en", "-F", f"initial_prompt={expected}"])
    try: heard = str(json.loads(result.stdout).get("text", ""))
    except json.JSONDecodeError: return False, "", 0.0
    ratio = difflib.SequenceMatcher(None, normalized(expected), normalized(heard)).ratio()
    return result.returncode == 0 and ratio >= .92, heard, round(ratio, 3)

def clip_duration(path: Path) -> float | None:
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)], 30)
    try:
        value = round(float(result.stdout.strip()), 3)
        return value if result.returncode == 0 and value > 0 else None
    except ValueError: return None

def reconcile_manifest(
    lines: dict[str, str],
    prior: dict,
    selected: set[str],
    accepted: set[str],
) -> dict:
    entries = {}
    for key in lines:
        expected_hash = hashlib.sha256(lines[key].encode()).hexdigest()[:16]
        if key in selected:
            if key not in accepted:
                continue
        elif prior.get(key, {}).get("textHash") != expected_hash:
            continue
        clip = OUT / f"{key}.m4a"
        duration = clip_duration(clip) if clip.is_file() and clip.stat().st_size >= 2000 else None
        if duration is not None and .2 <= duration <= 9:
            entries[key] = {"file": clip.name, "textHash": expected_hash, "dur": duration}
    version_source = "\n".join(
        f"{key}:{entry['textHash']}:{hashlib.sha256((OUT / entry['file']).read_bytes()).hexdigest()}"
        for key, entry in sorted(entries.items())
    )
    manifest = {"_v": hashlib.sha256(version_source.encode()).hexdigest()[:12], **entries}
    target = OUT / "manifest.json"
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(target)
    return manifest

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", nargs="*", help="line keys to generate")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    api, ref = configured()
    if not api or not readable_file(ref): raise SystemExit("Qwen API or teacher voice configuration unavailable")
    try: lines = json.loads(LINES.read_text())
    except (OSError, json.JSONDecodeError) as e: raise SystemExit(f"cannot read lines.json: {e}")
    selected = {k: v for k, v in lines.items() if not args.only or k in args.only}
    OUT.mkdir(parents=True, exist_ok=True)
    qa_path = OUT / "qa.json"
    try: qa = json.loads(qa_path.read_text())
    except (OSError, json.JSONDecodeError): qa = {}
    accepted_keys: set[str] = set()
    try: prior_manifest = json.loads((OUT / "manifest.json").read_text())
    except (OSError, json.JSONDecodeError): prior_manifest = {}
    with tempfile.TemporaryDirectory(prefix="shape-detective-voice-") as tmp:
        folder = Path(tmp)
        safe_reference = folder / "teacher-reference.wav"
        shutil.copy2(ref, safe_reference)
        for key, text in selected.items():
            dest = OUT / f"{key}.m4a"
            prior_duration = clip_duration(dest) if dest.is_file() else None
            expected_hash = hashlib.sha256(text.encode()).hexdigest()[:16]
            if dest.is_file() and dest.stat().st_size >= 2000 and prior_duration is not None and .2 <= prior_duration <= 9 and prior_manifest.get(key, {}).get("textHash") == expected_hash and not args.force:
                accepted_keys.add(key)
                print(f"{key}: reused", flush=True); continue
            accepted = False
            for seed in SEEDS:
                print(f"{key}: seed {seed} generating", flush=True)
                clip = make_clip(api, str(safe_reference), key, text, seed, folder)
                if not clip:
                    qa.setdefault(key, []).append({"key":key,"intended":text,"textHash":expected_hash,"seed":seed,"transcript":"","ratio":0.0,"duration":None,"status":"tts-or-encode-failed"})
                    continue
                duration = clip_duration(clip)
                ok, heard, ratio = whisper_ok(api, clip, text)
                ok = ok and duration is not None and .2 <= duration <= 9
                EVIDENCE.mkdir(parents=True, exist_ok=True)
                evidence = EVIDENCE / f"{key}-seed{seed}.m4a"
                shutil.copy2(clip, evidence)
                qa.setdefault(key, []).append({
                    "key": key,
                    "intended": text,
                    "textHash": expected_hash,
                    "seed": seed,
                    "transcript": heard,
                    "ratio": ratio,
                    "duration": duration,
                    "status": "accepted" if ok else "rejected",
                    "candidate": str(evidence.relative_to(ROOT)),
                })
                if ok:
                    clip.replace(dest)
                    print(f"{key}: seed {seed} accepted", flush=True)
                    accepted = True
                    accepted_keys.add(key)
                    break
            if not accepted: print(f"{key}: failed Whisper QA", flush=True)
    (OUT / "qa.json").write_text(json.dumps(qa, indent=2) + "\n")
    if not selected: raise SystemExit("no matching line keys")
    manifest = reconcile_manifest(lines, prior_manifest, set(selected), accepted_keys)
    missing = [key for key in selected if key not in manifest]
    if missing: raise SystemExit(f"missing accepted lines: {', '.join(missing)}")

if __name__ == "__main__": main()
