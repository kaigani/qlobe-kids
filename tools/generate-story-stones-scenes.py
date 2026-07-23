#!/usr/bin/env python3
"""Generate resumable Krea 2 backdrops for every Story Stones v2 recipe."""

from __future__ import annotations

import argparse
import concurrent.futures
import json
import mimetypes
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
PACK_PATH = ROOT / "games" / "story-stones" / "story-pack.json"
DEFAULT_API = "http://192.168.1.181:8100"
MAX_IMAGE = 32 * 1024 * 1024


def multipart_fields(url: str, fields: dict[str, object], timeout=120) -> dict:
    boundary = f"----qlobe-{uuid.uuid4().hex}"
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend([
            f"--{boundary}\r\n".encode(),
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
            str(value).encode(), b"\r\n",
        ])
    chunks.append(f"--{boundary}--\r\n".encode())
    body = b"".join(chunks)
    request = Request(url, data=body, method="POST", headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Content-Length": str(len(body)),
    })
    with urlopen(request, timeout=timeout) as response:
        return json.load(response)


def get_json(url: str, timeout=30) -> dict:
    with urlopen(url, timeout=timeout) as response:
        return json.load(response)


def generate(item: tuple[str, dict], api: str, force: bool) -> tuple[str, str, int]:
    story_id, story = item
    setting = story["setting"]
    destination = ROOT / "games" / "story-stones" / setting["backdrop"]
    if destination.is_file() and destination.stat().st_size > 1000 and not force:
        return story_id, "skip", destination.stat().st_size
    submitted = multipart_fields(f"{api}/workflows/{setting['workflow']}", {
        "prompt": setting["prompt"], "seed": setting["seed"],
        "width": setting["width"], "height": setting["height"],
        "steps": setting["steps"], "cfg": setting["cfg"],
    })
    remote_id = submitted.get("job_id") or submitted.get("id")
    if not remote_id:
        raise RuntimeError(f"{story_id}: workflow did not return a job id")
    deadline = time.time() + 30 * 60
    while time.time() < deadline:
        remote = get_json(f"{api}/jobs/{remote_id}")
        status = str(remote.get("status", "")).lower()
        if status in ("completed", "complete", "success", "succeeded"):
            break
        if status in ("failed", "error", "cancelled", "canceled"):
            raise RuntimeError(f"{story_id}: {remote.get('error') or status}")
        time.sleep(2)
    else:
        raise TimeoutError(f"{story_id}: generation exceeded 30 minutes")
    with urlopen(f"{api}/jobs/{remote_id}/result", timeout=180) as response:
        source_data = response.read(MAX_IMAGE + 1)
    if len(source_data) > MAX_IMAGE or not source_data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError(f"{story_id}: result was not a valid PNG under 32 MB")
    with tempfile.TemporaryDirectory(prefix="story-stones-scene-") as temp:
        temp_path = Path(temp)
        source = temp_path / "source.png"
        encoded = temp_path / "scene.webp"
        source.write_bytes(source_data)
        ffmpeg = shutil.which("ffmpeg") or "/usr/local/bin/ffmpeg"
        run = subprocess.run([
            ffmpeg, "-y", "-loglevel", "error", "-i", str(source),
            "-vf", f"scale={setting['width']}:{setting['height']}:flags=lanczos",
            "-c:v", "libwebp", "-quality", "86", str(encoded),
        ], capture_output=True, text=True, timeout=180)
        if run.returncode or not encoded.is_file():
            raise RuntimeError(run.stderr.strip() or f"{story_id}: WebP encoding failed")
        destination.parent.mkdir(parents=True, exist_ok=True)
        temporary = destination.with_name(f".{destination.name}.{uuid.uuid4().hex}.tmp")
        temporary.write_bytes(encoded.read_bytes())
        temporary.replace(destination)
    return story_id, "ok", destination.stat().st_size


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default=DEFAULT_API)
    parser.add_argument("--story")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    pack = json.loads(PACK_PATH.read_text())
    items = list(pack["stories"].items())
    if args.story:
        items = [item for item in items if item[0] == args.story]
        if not items:
            raise SystemExit(f"unknown story: {args.story}")
    if args.limit:
        items = items[:args.limit]
    failures: list[str] = []
    complete = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        futures = {pool.submit(generate, item, args.api.rstrip('/'), args.force): item[0] for item in items}
        for future in concurrent.futures.as_completed(futures):
            story_id = futures[future]
            try:
                key, status, size = future.result()
                complete += 1
                print(f"[{complete}/{len(items)}] {key}: {status} {size/1024:.0f} KiB", flush=True)
            except Exception as exc:
                failures.append(story_id)
                print(f"[{complete}/{len(items)}] {story_id}: FAIL {exc}", flush=True)
    print(f"complete: {len(items)-len(failures)}/{len(items)}; failures={len(failures)}")
    if failures:
        print("failed: " + ", ".join(failures))
        raise SystemExit(1)


if __name__ == "__main__":
    main()
