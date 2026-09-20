#!/usr/bin/env python3
"""Build Then & Now narration with the approved LAN voice-clone API.

The script is resumable: accepted clips whose source hash is unchanged are
kept unless --force is supplied.  Whisper transcripts and per-clip recipes
are written alongside the generated MP3s for review and reproducibility.
"""
from __future__ import annotations

import argparse, difflib, hashlib, json, os, re, shutil, subprocess, tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
AUDIO = GAME / "assets" / "audio"
VOICE = AUDIO / "voice"
QA = VOICE / "qa-report.json"
LINES = AUDIO / "lines.json"
MANIFEST = AUDIO / "manifest.json"
SEEDS = (7, 8, 9)


def run(cmd: list[str], timeout: int = 930) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def sha(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:16]


def normalize(text: str) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", text.lower()))


def match(expected: str, heard: str) -> tuple[float, float, bool]:
    want, got = normalize(expected), normalize(heard)
    ratio = difflib.SequenceMatcher(None, want, got).ratio()
    wanted = want.split(); heard_words = got.split()
    coverage = sum(word in heard_words for word in wanted) / max(1, len(wanted))
    return round(ratio, 3), round(coverage, 3), bool(ratio >= .72 and coverage >= .85)


def duration(path: Path) -> float:
    result = run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                  "-of", "default=noprint_wrappers=1:nokey=1", str(path)], 30)
    try:
        return round(float(result.stdout.strip()), 3)
    except ValueError:
        return 0.0


def volume(path: Path) -> float | None:
    result = run(["ffmpeg", "-hide_banner", "-nostats", "-i", str(path),
                  "-af", "volumedetect", "-f", "null", "-"], 60)
    found = re.search(r"mean_volume:\s*(-?[0-9.]+) dB", result.stderr)
    return round(float(found.group(1)), 1) if found else None


def settings() -> tuple[str, Path]:
    local = ROOT / "tools" / "state" / "local.json"
    values = json.loads(local.read_text(encoding="utf-8")) if local.is_file() else {}
    api = (os.environ.get("QLOBE_QWEN_URL") or values.get("qwenUrl") or "").rstrip("/")
    reference = os.environ.get("QLOBE_TEACHER_VOICE") or os.environ.get("QLOBE_VOICE_REF")
    reference = reference or str(ROOT / "shared" / "assets" / "refs" / "voice-teacher.wav")
    ref = Path(reference).expanduser()
    if not api or not ref.is_file():
        raise SystemExit("Local Qwen URL or shared voice-teacher.wav is unavailable")
    return api, ref


def load_lines() -> dict[str, str]:
    config = json.loads((GAME / "config.json").read_text(encoding="utf-8"))
    lines = dict(config.get("voice") or {})
    for pair in config.get("pairs") or []:
        if pair.get("id") and pair.get("relation"):
            lines[f"pair-{pair['id']}"] = pair["relation"]
        for era in ("then", "now"):
            item = pair.get(era) or {}
            if item.get("id") and item.get("label"):
                lines[f"object-{item['id']}"] = item["label"]
    if not lines:
        raise SystemExit("config.json has no voice or relation lines")
    AUDIO.mkdir(parents=True, exist_ok=True)
    LINES.write_text(json.dumps(lines, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return lines


def clone(api: str, reference: Path, text: str, seed: int, output: Path) -> None:
    result = run(["curl", "-sS", "-X", "POST",
                  f"{api}/workflows/qwen3-tts-voiceclone?sync=true",
                  "-F", f"voice=@{reference}", "-F", f"text={text}",
                  "-F", f"seed={seed}", "--output", str(output), "--max-time", "900"], 930)
    if result.returncode or not output.is_file() or output.stat().st_size < 2000:
        raise RuntimeError(result.stderr or "empty voice-clone response")


def transcode(source: Path, output: Path) -> None:
    result = run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(source),
                  "-af", "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
                  "areverse,silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,"
                  "areverse,loudnorm=I=-18:TP=-2:LRA=9", "-c:a", "libmp3lame", "-b:a", "96k",
                  "-ar", "24000", "-ac", "1", str(output)], 180)
    if result.returncode or not output.is_file() or output.stat().st_size < 2000:
        raise RuntimeError(result.stderr or "ffmpeg encoding failed")


def whisper(api: str, audio: Path, expected: str) -> str:
    result = run(["curl", "-sS", "-X", "POST", f"{api}/workflows/whisper-stt?sync=true",
                  "-F", f"audio=@{audio}", "-F", "model_size=base", "-F", "language=en",
                  "-F", f"initial_prompt={expected}", "--max-time", "900"], 930)
    try:
        body = json.loads(result.stdout)
        return str(body.get("text") or body.get("transcript") or "").strip()
    except (json.JSONDecodeError, TypeError):
        return ""


def generate(api: str, reference: Path, key: str, text: str, skip_whisper: bool = False) -> tuple[str, dict]:
    last = ""
    for seed in SEEDS:
        with tempfile.TemporaryDirectory(prefix="then-now-voice-") as folder:
            raw, encoded = Path(folder) / "take.flac", Path(folder) / f"{key}.mp3"
            try:
                clone(api, reference, text, seed, raw)
                transcode(raw, encoded)
                transcript = "" if skip_whisper else whisper(api, encoded, text)
                ratio, coverage, text_ok = (1.0, 1.0, True) if skip_whisper else match(text, transcript)
                seconds, mean_db = duration(encoded), volume(encoded)
                valid = bool(text_ok and .35 <= seconds <= 24 and mean_db is not None and -36 <= mean_db <= -5)
                last = f"seed {seed}: ratio={ratio}, coverage={coverage}, transcript={transcript!r}"
                if valid:
                    output = VOICE / f"{key}.mp3"
                    shutil.copyfile(encoded, output)
                    recipe = {"engine": "qwen3-tts-voiceclone", "verifier": "skipped" if skip_whisper else "whisper-stt",
                              "voiceReference": "shared:assets/refs/voice-teacher.wav", "seed": seed, "sourceText": text,
                              "textHash": sha(text), "output": str(output.relative_to(GAME)),
                              "transcript": transcript, "ratio": ratio, "coverage": coverage}
                    output.with_suffix(".mp3.recipe.json").write_text(json.dumps(recipe, indent=2) + "\n", encoding="utf-8")
                    return key, {**recipe, "duration": seconds, "meanVolumeDb": mean_db,
                                 "bytes": output.stat().st_size, "valid": True}
            except Exception as error:
                last = f"seed {seed}: {error}"
    return key, {"sourceText": text, "textHash": sha(text), "valid": False, "error": last}


def write_outputs(lines: dict[str, str], report: dict[str, dict]) -> dict:
    manifest = {key: {"file": f"voice/{key}.mp3", "dur": item["duration"],
                      "textHash": item["textHash"]} for key, item in report.items()
                if item.get("valid") and (VOICE / f"{key}.mp3").is_file()}
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    QA.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate Then & Now voice-clone narration and Whisper QA.")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-whisper", action="store_true", help="skip STT verification (not recommended)")
    parser.add_argument("--check", action="store_true", help="report existing accepted clips without generation")
    args = parser.parse_args()
    lines, report = load_lines(), {}
    VOICE.mkdir(parents=True, exist_ok=True)
    if QA.is_file():
        try: report = json.loads(QA.read_text(encoding="utf-8"))
        except json.JSONDecodeError: report = {}
    if args.check:
        manifest = write_outputs(lines, report)
        missing = [key for key in lines if key not in manifest]
        print(json.dumps({"accepted": len(manifest), "missing": missing}, indent=2))
        return int(bool(missing))
    api, reference = settings()
    for binary in ("curl", "ffmpeg", "ffprobe"):
        if not shutil.which(binary): raise SystemExit(f"required binary missing: {binary}")
    pending = []
    for key, text in lines.items():
        old = report.get(key, {}); output = VOICE / f"{key}.mp3"
        if not args.force and old.get("valid") and old.get("textHash") == sha(text) and output.is_file():
            continue
        pending.append((key, text))
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = [pool.submit(generate, api, reference, key, text, args.skip_whisper) for key, text in pending]
        for future in as_completed(futures):
            key, result = future.result(); report[key] = result
            print(f"{key}: {'accepted' if result.get('valid') else 'FAILED'}", flush=True)
            write_outputs(lines, report)
    manifest = write_outputs(lines, report)
    failed = [key for key in lines if key not in manifest]
    print(f"complete: accepted={len(manifest)}/{len(lines)}")
    return int(bool(failed))


if __name__ == "__main__":
    raise SystemExit(main())
