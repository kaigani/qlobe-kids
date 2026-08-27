#!/usr/bin/env python3
"""Resumable LAN media generation for Monster Opera.

The command is a dry run unless ``--execute`` is supplied. The machine-specific
LAN endpoint comes from ``tools/state/local.json`` and is never printed or
copied into a recipe.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import mimetypes
import os
import re
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path
from typing import Any


GAME_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = GAME_ROOT.parents[1]
STATE_PATH = REPO_ROOT / "tools" / "state" / "local.json"
CREATED = "2026-08-18"
ALLOWED_ROOTS = tuple(
    (GAME_ROOT / "assets" / name).resolve()
    for name in ("source", "audio", "video")
)


def load_state(require_endpoint: bool = False) -> dict[str, Any]:
    try:
        payload = json.loads(STATE_PATH.read_text("utf-8"))
    except Exception as exc:
        raise SystemExit(f"cannot read local state: {exc}") from exc
    if require_endpoint and not payload.get("qwenUrl"):
        raise SystemExit("local media endpoint is not configured")
    return payload


def safe_path(value: str | Path, kind: str, *, must_exist: bool = False) -> Path:
    path = Path(value)
    if not path.is_absolute():
        path = REPO_ROOT / path
    path = path.resolve()
    if not any(path == root or root in path.parents for root in ALLOWED_ROOTS):
        raise SystemExit(
            f"{kind} must be within this game's assets/source, assets/audio, or assets/video"
        )
    if must_exist and not path.is_file():
        raise SystemExit(f"{kind} does not exist: {path.relative_to(REPO_ROOT)}")
    return path


def relative(path: Path) -> str:
    return str(path.resolve().relative_to(REPO_ROOT))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def read_manifest(path: str | Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for number, line in enumerate(Path(path).read_text("utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise SystemExit(f"manifest line {number}: invalid JSON ({exc})") from exc
        if not isinstance(row, dict) or not row.get("id"):
            raise SystemExit(f"manifest line {number}: object requires a non-empty id")
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", str(row["id"])):
            raise SystemExit(f"manifest line {number}: unsafe id {row['id']!r}")
        rows.append(row)
    if not rows:
        raise SystemExit("manifest contains no jobs")
    return rows


def content_type(path: Path) -> str:
    return mimetypes.guess_type(path.name)[0] or "application/octet-stream"


def multipart(
    fields: dict[str, Any], files: dict[str, tuple[str, bytes, str]]
) -> tuple[bytes, str]:
    boundary = "----qlobe-" + uuid.uuid4().hex
    chunks: list[bytes] = []
    for key, value in fields.items():
        if isinstance(value, bool):
            value = "true" if value else "false"
        chunks.append(
            (
                f"--{boundary}\r\n"
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
                f"{value}\r\n"
            ).encode("utf-8")
        )
    for key, (name, data, mime) in files.items():
        chunks.extend(
            [
                (
                    f"--{boundary}\r\n"
                    f'Content-Disposition: form-data; name="{key}"; filename="{name}"\r\n'
                    f"Content-Type: {mime}\r\n\r\n"
                ).encode("utf-8"),
                data,
                b"\r\n",
            ]
        )
    chunks.append(f"--{boundary}--\r\n".encode("utf-8"))
    return b"".join(chunks), f"multipart/form-data; boundary={boundary}"


def json_request(url: str, *, timeout: int = 120) -> dict[str, Any]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as response:
            payload = json.loads(response.read())
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
        raise SystemExit(f"LAN request failed: {exc}") from exc
    if not isinstance(payload, dict):
        raise SystemExit("LAN response was not a JSON object")
    return payload


def submit(
    base: str,
    workflow: str,
    fields: dict[str, Any],
    files: dict[str, tuple[str, bytes, str]],
) -> str:
    body, mime = multipart(fields, files)
    request = urllib.request.Request(
        f"{base.rstrip('/')}/workflows/{workflow}",
        data=body,
        headers={"Content-Type": mime},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:
            payload = json.loads(response.read())
    except (OSError, urllib.error.URLError, json.JSONDecodeError) as exc:
        raise SystemExit(f"LAN workflow submission failed: {exc}") from exc
    job_id = payload.get("job_id") or payload.get("id")
    if not job_id:
        raise SystemExit("workflow response is missing job_id")
    return str(job_id)


def wait_for_job(base: str, job_id: str) -> dict[str, Any]:
    while True:
        status = json_request(f"{base.rstrip('/')}/jobs/{job_id}", timeout=60)
        state = status.get("status")
        if state == "completed":
            return status
        if state in ("failed", "cancelled", "error"):
            raise SystemExit(
                f"LAN job {job_id} {state}: {status.get('error') or 'unknown error'}"
            )
        if state not in ("pending", "running"):
            raise SystemExit(f"LAN job {job_id} returned unknown state {state!r}")
        time.sleep(2)


def download_result(
    base: str, job_id: str, destination: Path, *, output_name: str | None = None
) -> None:
    query = ""
    if output_name:
        query = "?" + urllib.parse.urlencode({"output": output_name})
    url = f"{base.rstrip('/')}/jobs/{job_id}/result{query}"
    try:
        with urllib.request.urlopen(url, timeout=300) as response:
            data = response.read()
    except (OSError, urllib.error.URLError) as exc:
        raise SystemExit(f"LAN result download failed: {exc}") from exc
    if not data:
        raise SystemExit(f"LAN result for {job_id} was empty")
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(data)
    os.replace(temporary, destination)


def atomic_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", "utf-8")
    os.replace(temporary, path)


def atomic_text(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(value, "utf-8")
    os.replace(temporary, path)


def execute_job(
    *,
    base: str,
    workflow: str,
    fields: dict[str, Any],
    files: dict[str, tuple[str, bytes, str]],
    destination: Path,
    output_name: str | None = None,
) -> dict[str, Any]:
    job_id = submit(base, workflow, fields, files)
    status = wait_for_job(base, job_id)
    download_result(base, job_id, destination, output_name=output_name)
    return {
        "jobId": job_id,
        "status": status.get("status"),
        "outputs": status.get("outputs", []),
        "saved": relative(destination),
        "bytes": destination.stat().st_size,
    }


def normalized(text: str) -> str:
    value = unicodedata.normalize("NFKD", text).lower()
    value = "".join(char for char in value if char.isalnum() or char.isspace())
    return " ".join(value.split())


def transcript_ratio(expected: str, heard: str) -> float:
    return difflib.SequenceMatcher(None, normalized(expected), normalized(heard)).ratio()


def transcript_text(payload: Any) -> str:
    if isinstance(payload, str):
        return payload.strip()
    if isinstance(payload, dict):
        for key in ("text", "transcript"):
            if isinstance(payload.get(key), str):
                return payload[key].strip()
        for key in ("result", "data", "output"):
            if key in payload:
                nested = transcript_text(payload[key])
                if nested:
                    return nested
        segments = payload.get("segments")
        if isinstance(segments, list):
            return " ".join(
                str(segment.get("text", "")).strip()
                for segment in segments
                if isinstance(segment, dict) and segment.get("text")
            ).strip()
    if isinstance(payload, list):
        return " ".join(filter(None, (transcript_text(item) for item in payload))).strip()
    return ""


def plan(
    workflow: str,
    fields: dict[str, Any],
    file_paths: dict[str, Path],
    destination: Path,
    output_name: str | None = None,
) -> dict[str, Any]:
    return {
        "workflow": workflow,
        "fields": fields,
        "files": {key: relative(path) for key, path in file_paths.items()},
        "output": relative(destination),
        "resultOutput": output_name,
    }


def file_payloads(file_paths: dict[str, Path]) -> dict[str, tuple[str, bytes, str]]:
    return {
        key: (path.name, path.read_bytes(), content_type(path))
        for key, path in file_paths.items()
    }


def maybe_skip(destination: Path, overwrite: bool) -> dict[str, Any] | None:
    if destination.exists() and destination.stat().st_size and not overwrite:
        return {"status": "skipped", "saved": relative(destination), "reason": "exists"}
    return None


def public_result(result: dict[str, Any]) -> dict[str, Any]:
    """Keep useful job provenance without persisting server paths or hosts."""
    allowed = ("jobId", "status", "saved", "bytes", "reason")
    return {key: result[key] for key in allowed if result.get(key) is not None}


def transcribe_one(
    *,
    base: str,
    source: Path,
    output: Path,
    execute: bool,
    overwrite: bool,
    expected: str = "",
) -> dict[str, Any]:
    fields = {"model_size": "base", "language": "en", "task": "transcribe"}
    file_paths = {"audio": source}
    raw_output = output.parent / f"{output.stem}.whisper.json"
    request_plan = plan("whisper-stt", fields, file_paths, output, "json")
    if not execute:
        return request_plan
    skipped = maybe_skip(output, overwrite)
    if skipped:
        heard = output.read_text("utf-8", errors="replace")
        skipped["heard"] = heard.strip()
        skipped["ratio"] = transcript_ratio(expected, heard) if expected else None
        skipped["accepted"] = (
            skipped["ratio"] >= 0.8 if expected else None
        )
        skipped["emptyTranscript"] = not bool(skipped["heard"])
        return skipped
    result = execute_job(
        base=base,
        workflow="whisper-stt",
        fields=fields,
        files=file_payloads(file_paths),
        destination=raw_output,
        output_name="json",
    )
    try:
        heard = transcript_text(json.loads(raw_output.read_text("utf-8")))
    except (OSError, json.JSONDecodeError) as exc:
        raise SystemExit(f"Whisper returned invalid JSON: {exc}") from exc
    # Sung vowels and closed-mouth hums can legitimately produce an empty STT
    # result. Keep that as review evidence instead of misreporting a completed
    # LAN job as a transport failure.
    atomic_text(output, heard + "\n")
    result["rawSaved"] = result.get("saved")
    result["saved"] = relative(output)
    result["heard"] = heard
    result["ratio"] = transcript_ratio(expected, heard) if expected else None
    result["accepted"] = result["ratio"] >= 0.8 if expected else None
    result["emptyTranscript"] = not bool(heard)
    return result


def voice_command(args: argparse.Namespace, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    output_dir = safe_path(args.output_dir, "output directory")
    qa_dir = safe_path(args.qa_dir, "QA directory")
    base = str(cfg.get("qwenUrl", ""))
    results: list[dict[str, Any]] = []
    for row in read_manifest(args.manifest):
        key = str(row["id"])
        text = str(row.get("text", "")).strip()
        if not text:
            raise SystemExit(f"voice row {key!r} has no text")
        output = output_dir / f"{key}.flac"
        transcript = qa_dir / f"{key}.transcript.txt"
        fields = {
            "instruct": row.get(
                "instruct",
                "A warm, calm preschool teacher with a gentle smile in her voice, "
                "clear American English, unhurried pace, natural and encouraging, never sing-song.",
            ),
            "text": text,
            "seed": int(row.get("seed", 7)),
        }
        file_paths: dict[str, Path] = {}
        request_plan = plan(
            "qwen3-tts-voicedesign", fields, file_paths, output, "output0"
        )
        if not args.execute:
            results.append({"id": key, "voice": request_plan, "whisperExpected": text})
            continue
        voice_result = maybe_skip(output, args.overwrite)
        if not voice_result:
            voice_result = execute_job(
                base=base,
                workflow="qwen3-tts-voicedesign",
                fields=fields,
                files=file_payloads(file_paths),
                destination=output,
                output_name="output0",
            )
        whisper_result = transcribe_one(
            base=base,
            source=output,
            output=transcript,
            execute=True,
            overwrite=args.overwrite,
            expected=text,
        )
        recipe = {
            "format": "qlobe-recipe",
            "formatVersion": 1,
            "id": f"monster-opera-{key}",
            "kind": "voice",
            "asset": output.name,
            "steps": [
                {
                    "workflow": "qwen3-tts-voicedesign",
                    "text": text,
                    "seed": int(row.get("seed", 7)),
                    "output": relative(output),
                    "result": public_result(voice_result),
                }
            ],
            "refs": {},
            "derivedFrom": None,
            "qa": {
                "status": "accepted" if whisper_result.get("accepted") else "review",
                "whisper": {
                    "expected": text,
                    "heard": whisper_result.get("heard", ""),
                    "ratio": whisper_result.get("ratio"),
                },
            },
            "created": CREATED,
        }
        atomic_json(qa_dir / f"{key}.recipe.json", recipe)
        results.append(recipe)
    return results


def video_command(args: argparse.Namespace, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    output_dir = safe_path(args.output_dir, "output directory")
    qa_dir = safe_path(args.qa_dir, "QA directory")
    base = str(cfg.get("qwenUrl", ""))
    results: list[dict[str, Any]] = []
    for row in read_manifest(args.manifest):
        key = str(row["id"])
        image = safe_path(row["reference_image"], "reference image", must_exist=True)
        file_paths = {"reference_image_1": image}
        if row.get("reference_audio"):
            file_paths["reference_audio_1"] = safe_path(
                row["reference_audio"], "reference audio", must_exist=True
            )
        fields = {
            "prompt": str(row.get("prompt", "")),
            "width": int(row.get("width", 832)),
            "height": int(row.get("height", 480)),
            "duration": float(row.get("duration", 5)),
            "steps": int(row.get("steps", 20)),
            "seed": int(row.get("seed", 42)),
        }
        output = output_dir / f"{key}-raw.mp4"
        recipe_path = qa_dir / f"{key}.video.recipe.json"
        request_plan = plan("minimax-h3-r2v", fields, file_paths, output, "output0")
        if not args.execute:
            results.append({"id": key, "video": request_plan})
            continue
        video_result = maybe_skip(output, args.overwrite)
        if video_result:
            if not recipe_path.is_file():
                raise SystemExit(
                    f"raw video exists without provenance: {relative(output)}; "
                    "use --overwrite to regenerate it"
                )
            try:
                existing_recipe = json.loads(recipe_path.read_text("utf-8"))
                result = existing_recipe["steps"][0]["result"]
            except (OSError, json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
                raise SystemExit(
                    f"existing video recipe has no valid generation result: "
                    f"{relative(recipe_path)} ({exc})"
                ) from exc
            local_sha256 = sha256(output)
            if result.get("sha256") and result["sha256"] != local_sha256:
                raise SystemExit(
                    f"raw video does not match its recipe provenance: {relative(output)}"
                )
            if not result.get("jobId") or result.get("status") != "completed":
                raise SystemExit(
                    f"existing video recipe lacks completed-job provenance: "
                    f"{relative(recipe_path)}"
                )
            result.setdefault("bytes", output.stat().st_size)
            result.setdefault("sha256", local_sha256)
            atomic_json(recipe_path, existing_recipe)
            results.append(existing_recipe)
            continue
        if not video_result:
            video_result = execute_job(
                base=base,
                workflow="minimax-h3-r2v",
                fields=fields,
                files=file_payloads(file_paths),
                destination=output,
                output_name="output0",
            )
        persisted_result = public_result(video_result)
        persisted_result["sha256"] = sha256(output)
        recipe = {
            "format": "qlobe-recipe",
            "formatVersion": 1,
            "id": f"monster-opera-{key}",
            "kind": "voice",
            "asset": output.name,
            "steps": [
                {
                    "workflow": "minimax-h3-r2v",
                    "prompt": fields["prompt"],
                    "seed": fields["seed"],
                    "width": fields["width"],
                    "height": fields["height"],
                    "duration": fields["duration"],
                    "references": {
                        name: relative(value) for name, value in file_paths.items()
                    },
                    "output": relative(output),
                    "result": persisted_result,
                }
            ],
            "refs": {
                name: relative(value) for name, value in file_paths.items()
            },
            "derivedFrom": None,
            "qa": {
                "status": "review",
                "audioExtraction": "pending",
                "whisper": "pending",
                "manualIsolationReview": "pending",
            },
            "created": CREATED,
        }
        atomic_json(recipe_path, recipe)
        results.append(recipe)
    return results


def layered_command(args: argparse.Namespace, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    source = safe_path(args.image, "image", must_exist=True)
    output = safe_path(args.output, "output")
    qa_dir = safe_path(args.qa_dir, "QA directory")
    fields = {
        "prompt": args.prompt,
        "layers": 2,
        "seed": int(args.seed),
        "steps": 20,
        "cfg": 2.5,
    }
    file_paths = {"image": source}
    request_plan = plan("qwen-image-layered", fields, file_paths, output, "layer_2")
    if not args.execute:
        return [request_plan]
    result = maybe_skip(output, args.overwrite)
    if not result:
        result = execute_job(
            base=str(cfg.get("qwenUrl", "")),
            workflow="qwen-image-layered",
            fields=fields,
            files=file_payloads(file_paths),
            destination=output,
            output_name="layer_2",
        )
    recipe = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": f"monster-opera-{output.stem}",
        "kind": "image",
        "asset": output.name,
        "steps": [
            {
                "workflow": "qwen-image-layered",
                "prompt": args.prompt,
                "seed": int(args.seed),
                "source": relative(source),
                "output": relative(output),
                "result": public_result(result),
            }
        ],
        "refs": {"source": relative(source)},
        "derivedFrom": None,
        "qa": {"status": "review"},
        "created": CREATED,
    }
    atomic_json(qa_dir / f"{output.stem}.layered.recipe.json", recipe)
    return [recipe]


def transcribe_command(args: argparse.Namespace, cfg: dict[str, Any]) -> list[dict[str, Any]]:
    source = safe_path(args.audio, "audio", must_exist=True)
    output = safe_path(
        args.output or f"games/monster-opera/assets/source/qa/{source.stem}.transcript.txt",
        "transcript output",
    )
    qa_path = output.with_suffix(".qa.json")
    if args.execute and not args.overwrite and output.is_file():
        if not qa_path.is_file():
            raise SystemExit(
                f"transcript exists without provenance: {relative(output)}; "
                "use --overwrite to regenerate it"
            )
        try:
            existing_qa = json.loads(qa_path.read_text("utf-8"))
            existing_result = existing_qa["result"]
        except (OSError, json.JSONDecodeError, KeyError, TypeError) as exc:
            raise SystemExit(
                f"existing transcript QA is invalid: {relative(qa_path)} ({exc})"
            ) from exc
        if existing_qa.get("source") != relative(source):
            raise SystemExit("existing transcript QA belongs to a different source")
        if str(existing_qa.get("expected", "")) != args.expected:
            raise SystemExit("existing transcript QA used a different expected phrase")
        return [existing_result]
    result = transcribe_one(
        base=str(cfg.get("qwenUrl", "")),
        source=source,
        output=output,
        execute=args.execute,
        overwrite=args.overwrite,
        expected=args.expected,
    )
    if args.execute:
        atomic_json(
            qa_path,
            {
                "workflow": "whisper-stt",
                "source": relative(source),
                "expected": args.expected,
                "result": result,
            },
        )
    return [result]


def parser() -> argparse.ArgumentParser:
    root = argparse.ArgumentParser(description=__doc__)
    root.add_argument("--execute", action="store_true", help="call the configured LAN API")
    root.add_argument("--overwrite", action="store_true", help="replace existing generated outputs")
    commands = root.add_subparsers(dest="command", required=True)

    voice = commands.add_parser("voice", help="design a non-identifying voice and Whisper-QA each line")
    voice.add_argument("manifest", help="JSONL rows with id, text, and optional seed")
    voice.add_argument("--output-dir", default="games/monster-opera/assets/source/voice-raw")
    voice.add_argument("--qa-dir", default="games/monster-opera/assets/source/qa")

    video = commands.add_parser("video", help="generate MiniMax H3 reference videos")
    video.add_argument("manifest", help="JSONL rows describing each video")
    video.add_argument(
        "--output-dir", default="games/monster-opera/assets/source/video-raw"
    )
    video.add_argument("--qa-dir", default="games/monster-opera/assets/source/qa")

    layered = commands.add_parser("layered", help="separate an image with Qwen Image Layered")
    layered.add_argument("image")
    layered.add_argument("--prompt", required=True)
    layered.add_argument("--output", required=True)
    layered.add_argument("--seed", type=int, default=42)
    layered.add_argument("--qa-dir", default="games/monster-opera/assets/source/qa")

    transcribe = commands.add_parser("transcribe", help="Whisper-transcribe an audio or video file")
    transcribe.add_argument("audio")
    transcribe.add_argument("--output")
    transcribe.add_argument("--expected", default="")

    return root


def main() -> None:
    args = parser().parse_args()
    # Planning must remain portable and must not depend on a machine-local
    # endpoint file. Only an explicitly executed LAN job needs local state.
    cfg = load_state(require_endpoint=True) if args.execute else {}
    if args.command == "voice":
        results = voice_command(args, cfg)
    elif args.command == "video":
        results = video_command(args, cfg)
    elif args.command == "layered":
        results = layered_command(args, cfg)
    else:
        results = transcribe_command(args, cfg)
    print(
        json.dumps(
            {
                "command": args.command,
                "dryRun": not args.execute,
                "count": len(results),
                "results": results,
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
