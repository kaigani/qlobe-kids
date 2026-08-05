#!/usr/bin/env python3
"""Generate resumable Little Artist source plates with local LAN workflows."""

from __future__ import annotations

import argparse
import io
import json
import os
import tempfile
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageStat


GAME_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = GAME_ROOT.parents[1]
SOURCE_ROOT = GAME_ROOT / "assets/source/local-api"
PLAN_PATH = SOURCE_ROOT / "plan.json"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SUCCESS_STATES = {"completed", "complete", "success", "succeeded"}
FAILURE_STATES = {"failed", "error", "cancelled", "canceled"}
POLL_DEADLINE_SECONDS = 30 * 60


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as handle:
            handle.write(data)
            temporary = Path(handle.name)
        temporary.replace(path)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def configured_base_url(explicit_url: str | None) -> str:
    if explicit_url:
        return explicit_url.rstrip("/")
    if os.getenv("QLOBE_QWEN_URL"):
        return os.environ["QLOBE_QWEN_URL"].rstrip("/")

    state_path = REPO_ROOT / "tools/state/local.json"
    if state_path.exists():
        state = json.loads(state_path.read_text())
        return str(state.get("qwenUrl", "")).rstrip("/")
    return ""


def multipart(fields: dict[str, object]) -> tuple[bytes, str]:
    boundary = "----qlobe-little-artist"
    body = bytearray()
    for name, value in fields.items():
        body.extend(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
            f"\r\n\r\n{value}\r\n".encode()
        )
    body.extend(f"--{boundary}--\r\n".encode())
    return bytes(body), boundary


def request_json(request: urllib.request.Request | str, timeout: int) -> dict:
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def request_bytes(url: str, timeout: int) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read()


def ordered_seeds(job: dict, ladder: list[int], pinned: int | None) -> list[int]:
    if pinned is not None:
        return [pinned]
    candidates = [int(job.get("seed", ladder[0] if ladder else 42)), *ladder]
    return list(dict.fromkeys(candidates))


def validate_png(data: bytes, job: dict) -> dict:
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("workflow result is not a PNG")

    with Image.open(io.BytesIO(data)) as image:
        image.load()
        if image.size != (int(job["width"]), int(job["height"])):
            raise ValueError(
                f"unexpected dimensions {image.size}; expected "
                f"{job['width']}x{job['height']}"
            )
        saturation = round(ImageStat.Stat(image.convert("HSV")).mean[1], 2)

    minimum_saturation = float(
        job.get("qualityGates", {}).get("minimumMeanSaturation", 0)
    )
    if saturation < minimum_saturation:
        raise ValueError(
            f"mean saturation {saturation} is below {minimum_saturation}; "
            "likely a placeholder or blocked result"
        )
    return {"dimensions": [int(job["width"]), int(job["height"])],
            "meanSaturation": saturation}


def submit_job(base_url: str, job: dict, prompt: str, seed: int) -> tuple[str, bytes]:
    body, boundary = multipart(
        {
            "prompt": prompt,
            "seed": seed,
            "width": job["width"],
            "height": job["height"],
        }
    )
    request = urllib.request.Request(
        f"{base_url}/workflows/{job['workflow']}",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    submission = request_json(request, timeout=120)
    job_id = submission.get("job_id") or submission.get("id")
    if not job_id:
        raise RuntimeError(f"workflow returned no job id: {submission}")

    deadline = time.monotonic() + POLL_DEADLINE_SECONDS
    while time.monotonic() < deadline:
        state = request_json(f"{base_url}/jobs/{job_id}", timeout=30)
        status = str(state.get("status", "")).lower()
        if status in SUCCESS_STATES:
            return str(job_id), request_bytes(
                f"{base_url}/jobs/{job_id}/result", timeout=180
            )
        if status in FAILURE_STATES:
            raise RuntimeError(f"local workflow ended in {status}: {state}")
        time.sleep(2)
    raise TimeoutError(f"local workflow {job_id} exceeded 30 minutes")


def generate_job(base_url: str, plan: dict, job: dict, args: argparse.Namespace) -> None:
    output = SOURCE_ROOT / job["output"]
    recipe_path = output.with_suffix(output.suffix + ".recipe.json")
    if output.exists() and output.stat().st_size > 1_000 and not args.force:
        print(f"skip {job['id']} ({output.relative_to(GAME_ROOT)})", flush=True)
        return

    prompt = job["prompt"]
    if job.get("appendStyle") is not False:
        prompt = f"{plan['style']}\n\n{prompt}"
    seeds = ordered_seeds(job, [int(seed) for seed in plan["seedLadder"]], args.seed)

    if args.dry_run:
        print(
            f"dry-run {job['id']} workflow={job['workflow']} seeds={seeds} "
            f"size={job['width']}x{job['height']}",
            flush=True,
        )
        return

    failures: list[dict] = []
    for seed in seeds:
        print(
            f"generate {job['id']} workflow={job['workflow']} seed={seed}",
            flush=True,
        )
        try:
            remote_job_id, data = submit_job(base_url, job, prompt, seed)
            qa = validate_png(data, job)
            recipe = {
                "format": "qlobe-local-generation-recipe",
                "formatVersion": 1,
                "assetId": job["id"],
                "source": "local-lan-api",
                "workflow": job["workflow"],
                "jobId": remote_job_id,
                "seed": seed,
                "prompt": prompt,
                "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "quality": qa,
                "rejectedCandidates": failures,
            }
            atomic_write(output, data)
            atomic_write(
                recipe_path,
                (json.dumps(recipe, indent=2) + "\n").encode(),
            )
            print(f"accepted {job['id']} job={remote_job_id}", flush=True)
            return
        except Exception as error:  # candidate retry ladder is deliberate
            failure = {"seed": seed, "error": str(error)}
            failures.append(failure)
            print(f"reject {job['id']} seed={seed}: {error}", flush=True)

    raise RuntimeError(f"{job['id']} failed every candidate: {failures}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="generate one plan job id")
    parser.add_argument("--seed", type=int, help="pin one seed and disable retries")
    parser.add_argument("--force", action="store_true", help="replace existing source")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--api-url", help="override configured local API base URL")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    plan = json.loads(PLAN_PATH.read_text())
    jobs = [job for job in plan["jobs"] if not args.only or job["id"] == args.only]
    if args.only and not jobs:
        raise SystemExit(f"unknown job id: {args.only}")

    base_url = configured_base_url(args.api_url)
    if not args.dry_run and not base_url:
        raise SystemExit("Set QLOBE_QWEN_URL or configure tools/state/local.json")

    for job in jobs:
        generate_job(base_url, plan, job, args)


if __name__ == "__main__":
    main()
