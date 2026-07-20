#!/usr/bin/env python3
"""Local authoring server for Puppet Studio.

The QLOBE Kids runtime remains a static site.  This optional localhost-only
server adds the write and long-running inference endpoints needed while building
a character.  It deliberately has no third-party Python dependencies.

Usage (from the qlobe-kids directory):

    python3 tools/puppet-studio-server.py \
      --qwen-url http://YOUR-MODEL-HOST:8100

Then open http://127.0.0.1:8000/shared/js/stage/puppet-studio.html?mode=build
"""

from __future__ import annotations

import argparse
import json
import math
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
import uuid
import wave
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, unquote, urlparse
from urllib.request import Request, urlopen


VISEMES = ("a", "o", "e", "wr", "ts", "ln", "uq", "mbp", "fv")
ALL_VISEMES = ("rest",) + VISEMES
BONES = (
    "head", "torso",
    "arm-upper.L", "arm-lower.L", "arm-upper.R", "arm-lower.R",
    "leg-upper.L", "leg-lower.L", "leg-upper.R", "leg-lower.R",
)
ID_RE = re.compile(r"^[a-z][a-z0-9-]{0,39}$")
MAX_UPLOAD = 32 * 1024 * 1024
RHU_TO_VISEME = {
    # Rhubarb's Preston-Blair meanings mapped to QLOBE's canonical heads.
    # Keep B (generic consonants) distinct from C (E) and F (U).
    "X": "rest", "A": "mbp", "B": "ts", "C": "e", "D": "a",
    "E": "o", "F": "uq", "G": "fv", "H": "ln",
}

ARPA_TO_VISEME = {
    "AA": "a", "AH": "a", "AW": "a", "AY": "a",
    "AO": "o", "OW": "o", "OY": "o",
    "AE": "e", "EH": "e", "EY": "e", "IH": "e", "IY": "e",
    "ER": "wr", "R": "wr", "W": "wr",
    "UW": "uq", "UH": "uq",
    "M": "mbp", "B": "mbp", "P": "mbp",
    "F": "fv", "V": "fv",
    "L": "ln", "N": "ln", "NG": "ln",
}
SILENCE_PHONES = {"", "SIL", "SP", "SPN", "<EPS>", "<SIL>", "#"}


class AuthoringState:
    def __init__(self, root: Path, qwen_url: str | None, whisper_url: str | None = None,
                 mfa_bin: str | None = None, mfa_dictionary: str = "english_us_arpa",
                 mfa_acoustic_model: str = "english_us_arpa", mfa_root: str | None = None):
        self.root = root.resolve()
        self.reference_root = self.root.parent / "00-reference" / "puppet parts"
        self.character_root = self.root / "shared" / "characters"
        self.qwen_url = qwen_url.rstrip("/") if qwen_url else None
        self.whisper_url = whisper_url
        requested_mfa = os.path.expanduser(mfa_bin) if mfa_bin else None
        bundled_mfa = Path.home() / ".qlobe-mfa" / "envs" / "aligner" / "bin" / "mfa"
        self.mfa_bin = requested_mfa or shutil.which("mfa") or (str(bundled_mfa) if bundled_mfa.is_file() else None)
        self.mfa_root = os.path.expanduser(mfa_root or os.environ.get("QLOBE_MFA_ROOT", "~/.qlobe-mfa/data"))
        self.mfa_dictionary = os.path.expanduser(mfa_dictionary)
        self.mfa_acoustic_model = os.path.expanduser(mfa_acoustic_model)
        self.rhubarb_bin = root.parent / "tools-local" / "Rhubarb-Lip-Sync-1.14.0-macOS" / "rhubarb"
        self.jobs: dict[str, dict] = {}
        self.lock = threading.Lock()

    @property
    def mfa_available(self) -> bool:
        if not self.mfa_bin:
            return False
        resolved = shutil.which(self.mfa_bin) or self.mfa_bin
        return Path(resolved).is_file() and os.access(resolved, os.X_OK)

    @property
    def rhubarb_available(self) -> bool:
        return self.rhubarb_bin.is_file() and os.access(self.rhubarb_bin, os.X_OK)

    def update_job(self, job_id: str, **values):
        with self.lock:
            self.jobs[job_id].update(values)

    def snapshot_job(self, job_id: str):
        with self.lock:
            job = self.jobs.get(job_id)
            return json.loads(json.dumps(job)) if job else None


def safe_id(value: str) -> str:
    if not ID_RE.fullmatch(value or ""):
        raise ValueError("character id must be lowercase kebab-case (max 40 characters)")
    return value


def safe_relative(value: str) -> Path:
    value = unquote(value).replace("\\", "/")
    path = Path(value)
    if path.is_absolute() or ".." in path.parts:
        raise ValueError("unsafe path")
    return path


def destination_for(state: AuthoringState, char_id: str, kind: str) -> Path:
    char_id = safe_id(char_id)
    ref = state.reference_root / char_id
    char = state.character_root / char_id
    fixed = {
        "raw-base": ref / "raw-base.png",
        "head-visemes": ref / "head-visemes.png",
        "sprites": ref / f"sprites-{char_id}.png",
        "rig": char / "rig.json",
        "character-sheet": char / "character-sheet.md",
    }
    if kind in fixed:
        return fixed[kind]
    for prefix, allowed, folder, stem in (
        ("viseme-tile-", VISEMES, ref / "viseme-tiles", "viseme-"),
        ("viseme-cutout-", VISEMES, ref / "viseme-cutouts", "head-"),
        ("anim-", ALL_VISEMES, char / "anim", "head-"),
        ("part-", BONES, char / "parts", ""),
    ):
        if kind.startswith(prefix):
            key = kind[len(prefix):]
            if key not in allowed:
                break
            return folder / f"{stem}{key}.png"
    raise ValueError(f"unsupported file kind: {kind}")


def atomic_write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temp.write_bytes(data)
    os.replace(temp, path)


def json_bytes(value) -> bytes:
    return json.dumps(value, indent=2).encode("utf-8")


def http_json(url: str, timeout=8):
    with urlopen(url, timeout=timeout) as response:
        return json.load(response)


def multipart_request(url: str, file_path: Path, fields: dict[str, str], timeout=60,
                      file_field="image"):
    boundary = f"----qlobe-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            str(value).encode(), b"\r\n",
        ])
    chunks.extend([
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'.encode(),
        f"Content-Type: {mimetypes.guess_type(file_path.name)[0] or 'application/octet-stream'}\r\n\r\n".encode(),
        file_path.read_bytes(), b"\r\n",
        f"--{boundary}--\r\n".encode(),
    ])
    body = b"".join(chunks)
    request = Request(url, data=body, method="POST", headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    })
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def extract_one(state: AuthoringState, source: Path, destination: Path,
                prompt: str, seed: int, on_remote_job=None):
    if not state.qwen_url:
        raise RuntimeError("Qwen URL is not configured; restart with --qwen-url")
    if not source.exists():
        raise FileNotFoundError(source)
    submitted = multipart_request(
        f"{state.qwen_url}/workflows/qwen-image-layered",
        source,
        {"prompt": prompt, "layers": "2", "seed": str(seed)},
    )
    remote_id = submitted.get("job_id") or submitted.get("id")
    if not remote_id:
        raise RuntimeError(f"Qwen did not return a job id: {submitted}")
    if on_remote_job:
        on_remote_job(str(remote_id))
    deadline = time.time() + 30 * 60
    while time.time() < deadline:
        remote = http_json(f"{state.qwen_url}/jobs/{remote_id}", timeout=15)
        status = str(remote.get("status", "")).lower()
        if status in ("completed", "complete", "succeeded", "success"):
            break
        if status in ("failed", "error", "cancelled", "canceled"):
            raise RuntimeError(remote.get("error") or f"Qwen job {status}")
        time.sleep(3)
    else:
        raise TimeoutError("Qwen extraction exceeded 30 minutes")
    result_url = f"{state.qwen_url}/jobs/{remote_id}/result?output=layer_2"
    with urlopen(result_url, timeout=120) as response:
        data = response.read(MAX_UPLOAD + 1)
    if len(data) > MAX_UPLOAD:
        raise RuntimeError("Qwen result exceeded 32 MB")
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Qwen layer_2 was not a PNG")
    atomic_write(destination, data)


def run_extract_job(state: AuthoringState, job_id: str, char_id: str,
                    target: str, prompt: str, seed: int):
    try:
        ref = state.reference_root / char_id
        if target == "base":
            items = [("base", ref / "raw-base.png", ref / f"sprites-{char_id}.png")]
        elif target == "visemes":
            items = [
                (key, ref / "viseme-tiles" / f"viseme-{key}.png",
                 ref / "viseme-cutouts" / f"head-{key}.png")
                for key in VISEMES
            ]
        else:
            raise ValueError("target must be base or visemes")
        state.update_job(job_id, status="running", total=len(items), completed=0)
        for index, (label, source, destination) in enumerate(items):
            state.update_job(job_id, current=label, remote_job=None,
                             message=f"Extracting {label} ({index + 1}/{len(items)})")
            extract_one(
                state, source, destination, prompt, seed,
                lambda rid: state.update_job(job_id, remote_job=rid),
            )
            state.update_job(job_id, completed=index + 1)
        state.update_job(job_id, status="completed", current=None,
                         message=f"Finished {len(items)} extraction(s)")
    except Exception as exc:  # surfaced to the authoring UI
        state.update_job(job_id, status="failed", error=str(exc),
                         message="Extraction failed")


def mapped_rhubarb_cues(raw: dict) -> dict:
    """Convert Rhubarb A-H/X shapes without erasing source boundaries."""
    cues = []
    for cue in raw.get("mouthCues", []):
        source_value = str(cue.get("value", "X")).upper()
        cues.append({
            "start": round(float(cue.get("start", 0)), 3),
            "end": round(float(cue.get("end", 0)), 3),
            "value": RHU_TO_VISEME.get(source_value, "rest"),
            "sourceValue": source_value,
        })
    duration = float(raw.get("metadata", {}).get("duration", cues[-1]["end"] if cues else 0))
    return {
        "metadata": {"duration": round(duration, 3), "source": "rhubarb-1.14"},
        "mouthCues": cues,
    }


def normalized_phone(label: str) -> str:
    return re.sub(r"\d", "", str(label).strip().upper())


def viseme_for_phone(label: str) -> str:
    phone = normalized_phone(label)
    if phone in SILENCE_PHONES:
        return "rest"
    return ARPA_TO_VISEME.get(phone, "ts")


def wav_duration(path: Path) -> float:
    with wave.open(str(path), "rb") as handle:
        return handle.getnframes() / handle.getframerate()


def detect_silences(ffmpeg: str, pcm: Path) -> list[tuple[float, float]]:
    """Find meaningful quiet spans; these override falsely active aligner cues."""
    result = subprocess.run([
        ffmpeg, "-hide_banner", "-nostats", "-i", str(pcm),
        "-af", "silencedetect=noise=-40dB:d=0.10", "-f", "null", "-",
    ], check=False, capture_output=True, text=True, timeout=180)
    starts: list[float] = []
    spans: list[tuple[float, float]] = []
    for line in result.stderr.splitlines():
        start_match = re.search(r"silence_start:\s*([0-9.]+)", line)
        if start_match:
            starts.append(float(start_match.group(1)))
        end_match = re.search(r"silence_end:\s*([0-9.]+)", line)
        if end_match and starts:
            spans.append((starts.pop(0), float(end_match.group(1))))
    duration = wav_duration(pcm)
    spans.extend((start, duration) for start in starts)
    return [(max(0.0, start), min(duration, end)) for start, end in spans if end - start >= 0.095]


def apply_silence_rest(cues: list[dict], duration: float,
                       silences: list[tuple[float, float]]) -> list[dict]:
    """Split at acoustic silence boundaries while preserving phone/source cues."""
    boundaries = {0.0, duration}
    for cue in cues:
        boundaries.update((max(0.0, float(cue["start"])), min(duration, float(cue["end"]))))
    for start, end in silences:
        boundaries.update((start, end))
    points = sorted(x for x in boundaries if 0 <= x <= duration)
    output = []
    for start, end in zip(points, points[1:]):
        if end - start < 0.004:
            continue
        mid = (start + end) / 2
        quiet = any(s <= mid < e for s, e in silences)
        source = next((cue for cue in cues if float(cue["start"]) <= mid < float(cue["end"])), None)
        item = {
            "start": round(start, 3), "end": round(end, 3),
            "value": "rest" if quiet or source is None else source["value"],
        }
        if quiet:
            item["sourceValue"] = "silence"
        elif source:
            for key in ("phone", "sourceValue"):
                if source.get(key) is not None:
                    item[key] = source[key]
        output.append(item)
    return output


def run_mfa_alignment(state: AuthoringState, pcm: Path, transcript: str,
                      temp_dir: Path) -> dict:
    if not state.mfa_available:
        raise RuntimeError("MFA executable is unavailable; set QLOBE_MFA_BIN or launch with --mfa-bin")
    if not transcript.strip():
        raise RuntimeError("MFA requires a reviewed transcript")
    dialog = temp_dir / "dialog.txt"
    alignment = temp_dir / "alignment.json"
    dialog.write_text(transcript.strip() + "\n", "utf-8")
    executable = shutil.which(state.mfa_bin or "") or str(state.mfa_bin)
    command = [
        executable, "align_one", str(pcm), str(dialog),
        state.mfa_dictionary, state.mfa_acoustic_model, str(alignment),
        "--output_format", "json",
    ]
    mfa_path = str(Path(executable).resolve().parent)
    try:
        subprocess.run(
            command, check=True, capture_output=True, text=True, timeout=15 * 60,
            env={
                **os.environ, "MFA_ROOT_DIR": state.mfa_root,
                "PATH": f"{mfa_path}{os.pathsep}{os.environ.get('PATH', '')}",
            },
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise RuntimeError(f"MFA alignment failed: {detail}") from exc
    if not alignment.exists():
        matches = sorted(temp_dir.glob("*.json"), key=lambda path: path.stat().st_mtime, reverse=True)
        if not matches:
            raise RuntimeError("MFA completed without producing alignment JSON")
        alignment = matches[0]
    raw = json.loads(alignment.read_text("utf-8"))
    tiers = raw.get("tiers", {})
    phone_tier = next((tier for name, tier in tiers.items() if name.lower().endswith("phones")), None)
    if not phone_tier:
        raise RuntimeError(f"MFA alignment contains no phone tier: {', '.join(tiers)}")
    cues = []
    for entry in phone_tier.get("entries", []):
        if len(entry) < 3:
            continue
        start, end, label = float(entry[0]), float(entry[1]), str(entry[2])
        if end <= start:
            continue
        cues.append({
            "start": round(start, 3), "end": round(end, 3),
            "value": viseme_for_phone(label), "phone": label,
        })
    if not cues:
        raise RuntimeError("MFA phone tier is empty")
    duration = float(raw.get("end", cues[-1]["end"]))
    return {
        "metadata": {
            "duration": round(duration, 3), "source": "montreal-forced-aligner",
            "dictionary": state.mfa_dictionary, "acousticModel": state.mfa_acoustic_model,
        },
        "mouthCues": cues,
    }


def run_rhubarb_alignment(state: AuthoringState, pcm: Path, transcript: str,
                          temp_dir: Path) -> dict:
    if not state.rhubarb_available:
        raise RuntimeError(f"Rhubarb executable not found: {state.rhubarb_bin}")
    raw_cues = temp_dir / "rhubarb.json"
    command = [str(state.rhubarb_bin), "-f", "json", "--extendedShapes", "GHX", "-o", str(raw_cues)]
    if transcript:
        dialog = temp_dir / "rhubarb-dialog.txt"
        dialog.write_text(transcript, "utf-8")
        command.extend(["-d", str(dialog)])
    command.append(str(pcm))
    subprocess.run(command, check=True, capture_output=True, text=True, timeout=600)
    return mapped_rhubarb_cues(json.loads(raw_cues.read_text("utf-8")))


def update_voice_manifest(state: AuthoringState, char_id: str, entry: dict):
    path = state.character_root / char_id / "voice" / "manifest.json"
    with state.lock:
        manifest = {"schemaVersion": 1, "lines": []}
        if path.exists():
            manifest = json.loads(path.read_text("utf-8"))
        lines = [line for line in manifest.get("lines", []) if line.get("id") != entry["id"]]
        lines.append(entry)
        lines.sort(key=lambda line: str(line.get("label", line.get("id", ""))).lower())
        manifest["schemaVersion"] = 1
        manifest["lines"] = lines
        atomic_write(path, json_bytes(manifest) + b"\n")


def voice_entries(state: AuthoringState, char_id: str) -> list[dict]:
    voice_dir = state.character_root / char_id / "voice"
    manifest_path = voice_dir / "manifest.json"
    if manifest_path.exists():
        return json.loads(manifest_path.read_text("utf-8")).get("lines", [])
    entries = []
    if voice_dir.exists():
        for cues in sorted(voice_dir.glob("*.cues.json")):
            key = cues.name.removesuffix(".cues.json")
            audio = next((voice_dir / f"{key}{ext}" for ext in (".m4a", ".mp3", ".wav")
                          if (voice_dir / f"{key}{ext}").exists()), None)
            if audio:
                entries.append({
                    "id": key, "label": key.replace("-", " ").title(),
                    "audio": audio.name, "cues": cues.name, "cueMap": "identity",
                })
    return entries


def run_voice_job(state: AuthoringState, job_id: str, char_id: str, key: str,
                  label: str, transcript: str, requested_aligner: str, lead_ms: int,
                  temp_dir: Path, source: Path):
    try:
        ffmpeg = shutil.which("ffmpeg")
        if not ffmpeg:
            raise RuntimeError("ffmpeg is required but was not found on PATH")

        pcm = temp_dir / "analysis.wav"
        encoded = temp_dir / f"{key}.m4a"
        state.update_job(job_id, status="running", message="Converting voice sample", progress=1)
        subprocess.run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", str(pcm),
        ], check=True, capture_output=True, text=True, timeout=180)

        state.update_job(job_id, message=f"Aligning speech with {requested_aligner.upper()}", progress=2)
        fallback_reason = None
        actual_aligner = requested_aligner
        if requested_aligner == "mfa":
            try:
                cues = run_mfa_alignment(state, pcm, transcript, temp_dir)
            except Exception as exc:
                fallback_reason = str(exc)
                actual_aligner = "rhubarb"
                state.update_job(job_id, message="MFA unavailable or failed; using Rhubarb fallback", fallback=fallback_reason)
                cues = run_rhubarb_alignment(state, pcm, transcript, temp_dir)
        else:
            cues = run_rhubarb_alignment(state, pcm, transcript, temp_dir)

        duration = wav_duration(pcm)
        silences = detect_silences(ffmpeg, pcm)
        # MFA explicitly aligns quiet phones (F/S/K etc.) and silence; amplitude
        # gating would incorrectly erase those. Rhubarb benefits from the extra
        # silence override because its broad B shape can otherwise span pauses.
        applied_silences = silences if actual_aligner == "rhubarb" else []
        cues["mouthCues"] = apply_silence_rest(cues["mouthCues"], duration, applied_silences)
        cues["metadata"].update({
            "duration": round(duration, 3), "transcriptProvided": bool(transcript),
            "silenceDetection": {
                "thresholdDb": -40, "minimumMs": 100, "spans": len(silences),
                "applied": actual_aligner == "rhubarb",
            },
            "suggestedOffsetMs": lead_ms,
            **({"fallbackFrom": "mfa", "fallbackReason": fallback_reason} if fallback_reason else {}),
        })

        state.update_job(job_id, message="Encoding browser audio", progress=3)
        subprocess.run([
            ffmpeg, "-hide_banner", "-loglevel", "error", "-y", "-i", str(source),
            "-vn", "-c:a", "aac", "-b:a", "96000", "-movflags", "+faststart", str(encoded),
        ], check=True, capture_output=True, text=True, timeout=180)

        voice_dir = state.character_root / char_id / "voice"
        audio_out = voice_dir / f"{key}.m4a"
        cues_out = voice_dir / f"{key}.cues.json"
        atomic_write(audio_out, encoded.read_bytes())
        atomic_write(cues_out, json_bytes(cues) + b"\n")
        update_voice_manifest(state, char_id, {
            "id": key, "label": label, "audio": f"{key}.m4a",
            "cues": f"{key}.cues.json", "cueMap": "identity",
            "aligner": actual_aligner, "offsetMs": lead_ms,
            **({"text": transcript} if transcript else {}),
        })
        state.update_job(
            job_id, status="completed", progress=4,
            message=f"Saved {key}.m4a + {key}.cues.json",
            result={
                "audio": str(audio_out), "cues": str(cues_out),
                "cueCount": len(cues["mouthCues"]), "aligner": actual_aligner,
                "requestedAligner": requested_aligner, "fallback": fallback_reason,
            },
        )
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        state.update_job(job_id, status="failed", error=detail, message="Voice cue generation failed")
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Voice cue generation failed")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def run_transcription_job(state: AuthoringState, job_id: str, temp_dir: Path, source: Path):
    try:
        if not state.whisper_url:
            raise RuntimeError("Whisper URL is not configured; restart with --whisper-url or --qwen-url")
        state.update_job(job_id, status="running", message="Transcribing...", progress=0)
        result = multipart_request(
            state.whisper_url, source,
            {"model_size": "base", "language": "en"},
            timeout=15 * 60, file_field="audio",
        )
        transcript = str(result.get("text", "")).strip()
        if not transcript:
            raise RuntimeError(f"Whisper returned no transcript: {result}")
        state.update_job(
            job_id, status="completed", message="Transcript ready", progress=1,
            result={"transcript": transcript},
        )
    except Exception as exc:
        state.update_job(job_id, status="failed", error=str(exc), message="Transcription failed")
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)


def validated_cues(payload: dict) -> dict:
    metadata = payload.get("metadata") if isinstance(payload.get("metadata"), dict) else {}
    raw_cues = payload.get("mouthCues")
    if not isinstance(raw_cues, list) or len(raw_cues) > 5000:
        raise ValueError("mouthCues must be an array with at most 5000 entries")
    cues = []
    previous_end = 0.0
    for index, raw in enumerate(raw_cues):
        if not isinstance(raw, dict):
            raise ValueError(f"cue {index + 1} must be an object")
        start, end = float(raw.get("start", -1)), float(raw.get("end", -1))
        value = str(raw.get("value", ""))
        if not math.isfinite(start) or not math.isfinite(end) or start < 0 or end <= start:
            raise ValueError(f"cue {index + 1} has invalid times")
        if start + 0.001 < previous_end:
            raise ValueError(f"cue {index + 1} overlaps the preceding cue")
        if value not in ALL_VISEMES:
            raise ValueError(f"cue {index + 1} has unsupported viseme {value!r}")
        item = {"start": round(start, 3), "end": round(end, 3), "value": value}
        for key in ("phone", "sourceValue"):
            if raw.get(key) is not None:
                item[key] = str(raw[key])[:40]
        cues.append(item)
        previous_end = end
    duration = float(metadata.get("duration", previous_end))
    if not math.isfinite(duration) or duration < previous_end - 0.001:
        duration = previous_end
    return {
        "metadata": {
            **metadata, "duration": round(duration, 3),
            "editedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
        "mouthCues": cues,
    }


class PuppetStudioHandler(SimpleHTTPRequestHandler):
    server_version = "QLOBEPuppetStudio/1.0"

    @property
    def state(self) -> AuthoringState:
        return self.server.state  # type: ignore[attr-defined]

    def send_json(self, value, status=200):
        data = json_bytes(value)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def send_error_json(self, status: int, message: str):
        self.send_json({"ok": False, "error": message}, status)

    def read_body(self) -> bytes:
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            raise ValueError("invalid content length")
        if length < 1 or length > MAX_UPLOAD:
            raise ValueError("request body must be between 1 byte and 32 MB")
        return self.rfile.read(length)

    def read_json(self):
        return json.loads(self.read_body())

    def do_GET(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/puppet/status":
                qwen = {"configured": bool(self.state.qwen_url), "reachable": False}
                if self.state.qwen_url:
                    try:
                        health = http_json(f"{self.state.qwen_url}/health", timeout=2)
                        qwen.update(reachable=True, health=health)
                    except Exception as exc:
                        qwen["error"] = str(exc)
                return self.send_json({
                    "ok": True, "authoringServer": True, "qwen": qwen,
                    "whisper": {"configured": bool(self.state.whisper_url)},
                    "aligners": {
                        "mfa": {
                            "available": self.state.mfa_available,
                            "binary": self.state.mfa_bin,
                            "dictionary": self.state.mfa_dictionary,
                            "acousticModel": self.state.mfa_acoustic_model,
                            "root": self.state.mfa_root,
                        },
                        "rhubarb": {
                            "available": self.state.rhubarb_available,
                            "binary": str(self.state.rhubarb_bin),
                        },
                    },
                    "referenceRoot": str(self.state.reference_root),
                    "characterRoot": str(self.state.character_root),
                })
            if parsed.path == "/api/puppet/projects":
                projects = []
                ids = set()
                if self.state.reference_root.exists():
                    ids.update(p.name for p in self.state.reference_root.iterdir() if p.is_dir())
                if self.state.character_root.exists():
                    ids.update(p.name for p in self.state.character_root.iterdir() if p.is_dir())
                for char_id in sorted(x for x in ids if ID_RE.fullmatch(x)):
                    ref = self.state.reference_root / char_id
                    char = self.state.character_root / char_id
                    projects.append({
                        "id": char_id,
                        "rawBase": (ref / "raw-base.png").exists(),
                        "visemeSheet": (ref / "head-visemes.png").exists(),
                        "sprites": (ref / f"sprites-{char_id}.png").exists(),
                        "tiles": sum((ref / "viseme-tiles" / f"viseme-{v}.png").exists() for v in VISEMES),
                        "cutouts": sum((ref / "viseme-cutouts" / f"head-{v}.png").exists() for v in VISEMES),
                        "parts": sum((char / "parts" / f"{b}.png").exists() for b in BONES),
                        "anim": sum((char / "anim" / f"head-{v}.png").exists() for v in ALL_VISEMES),
                        "voices": len(voice_entries(self.state, char_id)),
                        "rig": (char / "rig.json").exists(),
                    })
                return self.send_json({"ok": True, "projects": projects})
            if parsed.path == "/api/puppet/voices":
                query = parse_qs(parsed.query)
                char_id = safe_id(query.get("id", [""])[0])
                return self.send_json({"ok": True, "voices": voice_entries(self.state, char_id)})
            if parsed.path.startswith("/api/puppet/jobs/"):
                job = self.state.snapshot_job(parsed.path.rsplit("/", 1)[-1])
                return self.send_json({"ok": True, "job": job}) if job else self.send_error_json(404, "job not found")
            if parsed.path.startswith("/__puppet_files__/"):
                return self.serve_authoring_file(parsed.path)
        except (ValueError, OSError) as exc:
            return self.send_error_json(400, str(exc))
        return super().do_GET()

    def serve_authoring_file(self, request_path: str):
        parts = safe_relative(request_path[len("/__puppet_files__/"):]).parts
        if len(parts) < 3 or parts[0] not in ("source", "character"):
            return self.send_error_json(404, "file not found")
        char_id = safe_id(parts[1])
        base = self.state.reference_root if parts[0] == "source" else self.state.character_root
        path = base / char_id / Path(*parts[2:])
        resolved = path.resolve()
        if not resolved.is_relative_to((base / char_id).resolve()) or not resolved.is_file():
            return self.send_error_json(404, "file not found")
        data = resolved.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mimetypes.guess_type(resolved.name)[0] or "application/octet-stream")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/puppet/file":
                query = parse_qs(parsed.query)
                char_id = safe_id(query.get("id", [""])[0])
                kind = query.get("kind", [""])[0]
                overwrite = query.get("overwrite", ["false"])[0].lower() == "true"
                destination = destination_for(self.state, char_id, kind)
                if destination.exists() and not overwrite:
                    return self.send_error_json(409, f"{destination.name} already exists; enable overwrite to replace it")
                body = self.read_body()
                if kind == "rig":
                    json.loads(body)
                elif kind not in ("character-sheet",) and not body.startswith(b"\x89PNG\r\n\x1a\n"):
                    raise ValueError("image upload is not a PNG")
                atomic_write(destination, body)
                return self.send_json({"ok": True, "path": str(destination)})
            if parsed.path == "/api/puppet/qwen/extract":
                payload = self.read_json()
                char_id = safe_id(str(payload.get("id", "")))
                target = str(payload.get("target", ""))
                if target not in ("base", "visemes"):
                    raise ValueError("target must be base or visemes")
                prompt = str(payload.get("prompt", "")).strip()
                if not prompt:
                    raise ValueError("an explicit extraction prompt is required")
                seed = int(payload.get("seed", 42))
                overwrite = bool(payload.get("overwrite", False))
                ref = self.state.reference_root / char_id
                outputs = ([ref / f"sprites-{char_id}.png"] if target == "base" else [
                    ref / "viseme-cutouts" / f"head-{key}.png" for key in VISEMES
                ])
                existing = [path.name for path in outputs if path.exists()]
                if existing and not overwrite:
                    return self.send_error_json(
                        409,
                        f"extraction output already exists ({', '.join(existing[:3])}); enable overwrite to replace it",
                    )
                job_id = uuid.uuid4().hex[:12]
                with self.state.lock:
                    self.state.jobs[job_id] = {
                        "id": job_id, "status": "queued", "target": target,
                        "character": char_id, "seed": seed, "message": "Queued",
                        "created": time.time(),
                    }
                thread = threading.Thread(
                    target=run_extract_job,
                    args=(self.state, job_id, char_id, target, prompt, seed),
                    daemon=True,
                )
                thread.start()
                return self.send_json({"ok": True, "jobId": job_id}, 202)
            if parsed.path == "/api/puppet/voice":
                query = parse_qs(parsed.query)
                char_id = safe_id(query.get("id", [""])[0])
                key = safe_id(query.get("key", [""])[0])
                label = query.get("label", [key.replace("-", " ").title()])[0].strip()[:100]
                transcript = query.get("transcript", [""])[0].strip()[:4000]
                aligner = query.get("aligner", ["mfa"])[0].lower()
                if aligner not in ("mfa", "rhubarb"):
                    raise ValueError("aligner must be mfa or rhubarb")
                lead_ms = max(-200, min(400, int(query.get("leadMs", ["-40"])[0])))
                audio_format = query.get("format", [""])[0].lower().lstrip(".")
                overwrite = query.get("overwrite", ["false"])[0].lower() == "true"
                if audio_format not in ("wav", "mp3"):
                    raise ValueError("voice sample must be a .wav or .mp3 file")
                voice_dir = self.state.character_root / char_id / "voice"
                outputs = [voice_dir / f"{key}.m4a", voice_dir / f"{key}.cues.json"]
                existing = [path.name for path in outputs if path.exists()]
                if existing and not overwrite:
                    return self.send_error_json(
                        409, f"voice output already exists ({', '.join(existing)}); enable overwrite to replace it",
                    )
                body = self.read_body()
                temp_dir = Path(tempfile.mkdtemp(prefix="qlobe-puppet-voice-"))
                source = temp_dir / f"upload.{audio_format}"
                source.write_bytes(body)
                job_id = uuid.uuid4().hex[:12]
                with self.state.lock:
                    self.state.jobs[job_id] = {
                        "id": job_id, "status": "queued", "target": "voice",
                        "character": char_id, "voice": key, "message": "Voice queued",
                        "created": time.time(), "progress": 0, "total": 4,
                    }
                thread = threading.Thread(
                    target=run_voice_job,
                    args=(self.state, job_id, char_id, key, label or key, transcript,
                          aligner, lead_ms, temp_dir, source),
                    daemon=True,
                )
                thread.start()
                return self.send_json({"ok": True, "jobId": job_id}, 202)
            if parsed.path == "/api/puppet/cues":
                query = parse_qs(parsed.query)
                char_id = safe_id(query.get("id", [""])[0])
                key = safe_id(query.get("key", [""])[0])
                path = self.state.character_root / char_id / "voice" / f"{key}.cues.json"
                if not path.exists():
                    return self.send_error_json(404, f"voice cues do not exist: {key}.cues.json")
                payload = validated_cues(self.read_json())
                atomic_write(path, json_bytes(payload) + b"\n")
                return self.send_json({"ok": True, "path": str(path), "cueCount": len(payload["mouthCues"])})
            if parsed.path == "/api/puppet/transcribe":
                query = parse_qs(parsed.query)
                audio_format = query.get("format", [""])[0].lower().lstrip(".")
                if audio_format not in ("wav", "mp3"):
                    raise ValueError("voice sample must be a .wav or .mp3 file")
                body = self.read_body()
                temp_dir = Path(tempfile.mkdtemp(prefix="qlobe-puppet-transcribe-"))
                source = temp_dir / f"upload.{audio_format}"
                source.write_bytes(body)
                job_id = uuid.uuid4().hex[:12]
                with self.state.lock:
                    self.state.jobs[job_id] = {
                        "id": job_id, "status": "queued", "target": "transcription",
                        "message": "Transcription queued", "created": time.time(),
                        "progress": 0, "total": 1,
                    }
                thread = threading.Thread(
                    target=run_transcription_job,
                    args=(self.state, job_id, temp_dir, source),
                    daemon=True,
                )
                thread.start()
                return self.send_json({"ok": True, "jobId": job_id}, 202)
        except json.JSONDecodeError:
            return self.send_error_json(400, "invalid JSON")
        except (ValueError, OSError, HTTPError, URLError) as exc:
            return self.send_error_json(400, str(exc))
        return self.send_error_json(404, "unknown authoring endpoint")

    def log_message(self, fmt, *args):
        print(f"[{self.log_date_time_string()}] {fmt % args}")


def main():
    parser = argparse.ArgumentParser(description="Serve QLOBE Kids with Puppet Studio authoring APIs")
    parser.add_argument("--host", default="127.0.0.1", help="bind host (localhost by default)")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--qwen-url", default=os.environ.get("QLOBE_QWEN_URL"),
                        help="local workflow API base URL (or QLOBE_QWEN_URL)")
    parser.add_argument("--whisper-url", default=os.environ.get("QLOBE_WHISPER_URL"),
                        help="Whisper workflow URL (defaults to <qwen-url>/workflows/whisper-stt?sync=true)")
    parser.add_argument("--mfa-bin", default=os.environ.get("QLOBE_MFA_BIN"),
                        help="MFA executable path (or QLOBE_MFA_BIN; otherwise searched on PATH)")
    parser.add_argument("--mfa-dictionary", default=os.environ.get("QLOBE_MFA_DICTIONARY", "english_us_arpa"),
                        help="MFA dictionary model name/path")
    parser.add_argument("--mfa-acoustic-model", default=os.environ.get("QLOBE_MFA_ACOUSTIC_MODEL", "english_us_arpa"),
                        help="MFA acoustic model name/path")
    parser.add_argument("--mfa-root", default=os.environ.get("QLOBE_MFA_ROOT"),
                        help="MFA model/cache directory (defaults to ~/.qlobe-mfa/data)")
    args = parser.parse_args()
    root = args.root.resolve()
    whisper_url = args.whisper_url or (
        f"{args.qwen_url.rstrip('/')}/workflows/whisper-stt?sync=true" if args.qwen_url else None
    )
    os.chdir(root)
    server = ThreadingHTTPServer((args.host, args.port), PuppetStudioHandler)
    server.state = AuthoringState(
        root, args.qwen_url, whisper_url,
        args.mfa_bin, args.mfa_dictionary, args.mfa_acoustic_model, args.mfa_root,
    )  # type: ignore[attr-defined]
    print(f"Puppet Studio authoring server: http://{args.host}:{args.port}/")
    print(f"Repo root: {root}")
    print(f"Qwen API: {args.qwen_url or '(not configured)'}")
    print(f"Whisper API: {whisper_url or '(not configured)'}")
    print(f"MFA: {server.state.mfa_bin or '(not found; Rhubarb fallback)'}")  # type: ignore[attr-defined]
    print(f"MFA models: {args.mfa_dictionary} / {args.mfa_acoustic_model}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping.")


if __name__ == "__main__":
    main()
