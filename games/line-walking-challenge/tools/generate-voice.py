#!/usr/bin/env python3
"""Generate and validate teacher voice clips with the local API."""
import argparse
import ipaddress
import json
import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[3]
GAME = ROOT / "games/line-walking-challenge"
OUT = GAME / "assets/audio"
STATE = ROOT / "tools/state/local.json"
REFERENCE = ROOT / "shared/assets/refs/voice-teacher.wav"
SEEDS = (7, 8, 9)
PRIVATE_NETWORKS = tuple(ipaddress.ip_network(block) for block in (
    "10.0.0.0/8",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "172.16.0.0/12",
    "192.168.0.0/16",
    "::1/128",
    "fc00::/7",
    "fe80::/10",
))


def read_lines() -> dict[str, str]:
    value = json.loads((OUT / "lines.json").read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise ValueError("lines.json must contain an object")
    return {str(key): str(text) for key, text in value.items()}


def endpoint(cli: str | None) -> str:
    if cli:
        return cli.rstrip("/")
    if os.environ.get("QLOBE_QWEN_URL"):
        return os.environ["QLOBE_QWEN_URL"].rstrip("/")
    try:
        return str(json.loads(STATE.read_text()).get("qwenUrl", "")).rstrip("/")
    except (OSError, ValueError):
        return ""


def private_endpoint(value: str) -> str:
    """Accept only a loopback or literal private-network HTTP endpoint."""
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("API endpoint must be an HTTP(S) URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("API endpoint must not contain credentials, a query, or a fragment")
    host = parsed.hostname.lower()
    if host != "localhost":
        try:
            address = ipaddress.ip_address(host)
        except ValueError as error:
            raise ValueError("API endpoint host must be localhost or a literal private IP") from error
        if not any(address in network for network in PRIVATE_NETWORKS):
            raise ValueError("API endpoint host must be on a private network")
    return value.rstrip("/")


def probe(path: Path, ffprobe: str) -> tuple[float, bool]:
    command = [ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    try:
        data: dict[str, Any] = json.loads(result.stdout)
        streams = [s for s in data.get("streams", []) if s.get("codec_type") == "audio"]
        duration = float(data.get("format", {}).get("duration", 0))
        return duration, bool(streams)
    except (ValueError, TypeError, AttributeError):
        return 0.0, False


def coverage(expected: str, transcript: str) -> float:
    want = re.findall(r"[a-z0-9]+", expected.lower())
    got = set(re.findall(r"[a-z0-9]+", transcript.lower()))
    return sum(word in got for word in want) / max(1, len(want))


def whisper(base: str, audio: Path) -> str:
    result = subprocess.run(["curl", "-fsS", "-X", "POST", base + "/workflows/whisper-stt?sync=true", "-F", f"audio=@{audio}", "-F", "language=en"], capture_output=True, text=True, timeout=930, check=False)
    if result.returncode:
        return ""
    try:
        data = json.loads(result.stdout)
        for candidate in (data, data.get("result", {}), data.get("output", {})):
            if isinstance(candidate, dict) and candidate.get("text"):
                return str(candidate["text"])
    except (ValueError, TypeError):
        pass
    return ""


def atomic_json(path: Path, value: Any) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    lines = read_lines()
    raw_endpoint = endpoint(args.api_url)
    try:
        base = private_endpoint(raw_endpoint)
    except ValueError:
        base = ""
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    voice = REFERENCE.resolve()
    missing = [key for key in lines if args.force or not (OUT / f"{key}.m4a").is_file()]
    if args.check:
        missing_requirements = [name for name, ok in (("api", bool(base)), ("ffmpeg", bool(ffmpeg)), ("ffprobe", bool(ffprobe)), ("voice", voice.is_file())) if not ok]
        print(f"lines: {len(lines)}; missing: {len(missing)}; ready: {not missing_requirements}")
        if missing_requirements:
            print("missing requirements: " + ", ".join(missing_requirements))
        return int(bool(missing_requirements))
    if not base or not ffmpeg or not ffprobe or not voice.is_file():
        raise SystemExit("incomplete local configuration; run --check")
    OUT.mkdir(parents=True, exist_ok=True)
    manifest: dict[str, dict[str, Any]] = {}
    qa: dict[str, dict[str, Any]] = {}
    with tempfile.TemporaryDirectory(prefix="line-voice-") as folder:
        temporary_dir = Path(folder)
        for key, text in lines.items():
            target = OUT / f"{key}.m4a"
            if target.is_file() and not args.force:
                duration, audio = probe(target, ffprobe)
                if audio and 0.2 <= duration <= 12:
                    manifest[key] = {"file": target.name, "dur": round(duration, 3)}
                    qa[key] = {"status": "retained", "dur": round(duration, 3)}
                    continue
                qa[key] = {"status": "FAIL", "reason": "retained_clip_invalid"}
            result: dict[str, Any] = {"status": "FAIL", "reason": "all_attempts_failed"}
            for seed in SEEDS:
                raw = temporary_dir / f"{key}-{seed}.wav"
                output = temporary_dir / f"{key}-{seed}.m4a"
                call = subprocess.run(
                    ["curl", "-fsS", "-X", "POST", base + "/workflows/qwen3-tts-voiceclone?sync=true", "-F", f"voice=@{voice}", "-F", f"text={text}", "-F", f"seed={seed}", "--output", str(raw)],
                    capture_output=True,
                    timeout=930,
                    check=False,
                )
                if call.returncode:
                    result = {"status": "FAIL", "reason": "tts_http_error", "seed": seed}
                    continue
                subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", str(raw), "-ac", "1", "-af", "loudnorm", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(output)], check=False)
                duration, audio = probe(output, ffprobe)
                if not audio or not 0.2 <= duration <= 12:
                    result = {"status": "FAIL", "reason": "invalid_audio", "seed": seed}
                    continue
                transcript = whisper(base, output)
                match = coverage(text, transcript)
                if match < 0.8:
                    result = {"status": "FAIL", "reason": "transcript_coverage", "seed": seed, "coverage": round(match, 3)}
                    continue
                pending = target.with_suffix(".m4a.tmp")
                shutil.copyfile(output, pending)
                pending.replace(target)
                manifest[key] = {"file": target.name, "dur": round(duration, 3)}
                result = {"status": "ok", "seed": seed, "coverage": round(match, 3)}
                break
            qa[key] = result
    atomic_json(OUT / "manifest.json", manifest)
    atomic_json(OUT / "qa.json", qa)
    return int(len(manifest) != len(lines))


if __name__ == "__main__":
    raise SystemExit(main())
