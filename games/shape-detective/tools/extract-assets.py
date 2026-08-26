#!/usr/bin/env python3
"""Resumably extract alpha layer_2 assets from the Shape Detective crop set."""
from __future__ import annotations

import argparse
import json
import os
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "source" / "crops"
DEST = ROOT / "assets" / "source" / "layer2"
FAMILIES = ("shapes", "cards", "ui")


def api_base() -> str:
    if os.environ.get("QLOBE_QWEN_URL"):
        return os.environ["QLOBE_QWEN_URL"].rstrip("/")
    state = ROOT.parent.parent / "tools" / "state" / "local.json"
    try:
        return str(json.loads(state.read_text()).get("qwenUrl", "")).rstrip("/")
    except (OSError, json.JSONDecodeError):
        return ""


def request(url: str, data: bytes | None = None, headers: dict[str, str] | None = None) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers or {}), timeout=60) as r:
        return r.read()


def submit(base: str, source: Path, prompt: str, seed: int) -> str:
    boundary = "----qlobe-shape-detective"
    fields = {"prompt": prompt, "layers": "2", "seed": str(seed)}
    body = bytearray()
    for key, value in fields.items():
        body += f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
    body += f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{source.name}"\r\nContent-Type: image/png\r\n\r\n'.encode()
    body += source.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    result = json.loads(request(f"{base}/workflows/qwen-image-layered", bytes(body), {"Content-Type": f"multipart/form-data; boundary={boundary}"}))
    job = result.get("job_id") or result.get("id")
    if not job:
        raise RuntimeError("submission returned no job id")
    return str(job)


def extract(
    base: str,
    source: Path,
    dest: Path,
    seed: int,
    timeout: float,
    prompt: str | None = None,
) -> None:
    prompt = prompt or (
        "Extract layer_2 as a transparent PNG. Preserve the complete object or shape, "
        "all interior holes, edges, texture, and proportions. Remove only the flat background; "
        "do not redraw, crop, merge, add, recolor, or remove the subject."
    )
    job = submit(base, source, prompt, seed)
    deadline = time.time() + timeout
    while time.time() < deadline:
        status = json.loads(request(f"{base}/jobs/{job}"))
        state = status.get("status")
        if state == "completed":
            data = request(f"{base}/jobs/{job}/result?output=layer_2")
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RuntimeError("layer_2 result was not PNG")
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
            return
        if state in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"job {state}")
        time.sleep(3)
    raise TimeoutError("job timed out")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--only", nargs="*", help="asset names or subgroup/name paths")
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--force", action="store_true")
    p.add_argument(
        "--title-fragments",
        action="store_true",
        help="extract the two title-word crops instead of the regular asset families",
    )
    p.add_argument("--timeout", type=float, default=1800, help="per-job timeout in seconds")
    args = p.parse_args()
    base = api_base()
    if not base:
        raise SystemExit("Qwen API configuration unavailable")
    if args.title_fragments:
        files = sorted((SOURCE / "title").glob("*.png"))
        if len(files) != 2:
            raise SystemExit(f"expected 2 title crops, found {len(files)}")
    else:
        files = [path for family in FAMILIES for path in sorted((SOURCE / family).glob("*.png"))]
        if len(files) != 17:
            raise SystemExit(f"expected 17 crop assets, found {len(files)}")
    wanted = set(args.only or [])
    for source in files:
        key = f"{source.parent.name}/{source.name}"
        if wanted and source.name not in wanted and key not in wanted:
            continue
        dest = DEST / source.parent.name / f"{source.stem}-seed{args.seed}.png"
        if dest.exists() and dest.read_bytes().startswith(b"\x89PNG\r\n\x1a\n") and not args.force:
            print(f"{key} skip", flush=True)
            continue
        print(f"{key} extracting", flush=True)
        try:
            title_prompt = None
            if args.title_fragments:
                word = source.stem.upper()
                title_prompt = (
                    "Separate this title fragment into exactly two layers. Layer 1 is only the pale "
                    "checker background. Layer 2 is the complete exact chalk word "
                    f"{word}, with every one of its {len(word)} letters and any attached chalk decoration. "
                    "Return layer_2 as a transparent PNG. Preserve the exact lettering, texture, edges, "
                    "spacing, proportions, and colors. Do not redraw, crop, merge, omit, add, recolor, "
                    "rearrange, or spell the word differently."
                )
            extract(base, source, dest, args.seed, args.timeout, title_prompt)
            print(f"{key} done", flush=True)
        except Exception as exc:
            print(f"{key} failed: {exc}", flush=True)


if __name__ == "__main__":
    main()
