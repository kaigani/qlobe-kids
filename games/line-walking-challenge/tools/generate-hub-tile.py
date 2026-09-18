#!/usr/bin/env python3
"""Generate a review-only Krea hub source; never write the production tile."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import ipaddress
import json
import os
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
OUT = GAME / "assets/source/local-api"
RAW = OUT / "hub-tile-master.png"
RECIPE = OUT / "hub-tile-recipe.json"
PROMPT = (
    "cheerful orange fox following one glowing winding trail through a miniature "
    "flower meadow, five blooms, tiny blank finish pennant, handcrafted "
    "watercolor storybook toy scene, warm gentle colors, no text/UI"
)
WORKFLOW = "krea2-turbo-t2i"
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


def configured_endpoint(explicit: str | None) -> str:
    if explicit:
        return explicit.rstrip("/")
    if os.environ.get("QLOBE_QWEN_URL"):
        return os.environ["QLOBE_QWEN_URL"].rstrip("/")
    try:
        state = json.loads((REPO / "tools/state/local.json").read_text(encoding="utf-8"))
        return str(state.get("qwenUrl", "")).rstrip("/")
    except (OSError, ValueError, TypeError):
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


def multipart(fields: dict[str, object], boundary: str) -> bytes:
    chunks: list[bytes] = []
    for key, value in fields.items():
        part = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n'
            f"{value}\r\n"
        )
        chunks.append(part.encode())
    chunks.append(f"--{boundary}--\r\n".encode())
    return b"".join(chunks)


def read_json(url: str, *, request: Request | None = None, timeout: int = 60) -> dict[str, Any]:
    with urlopen(request or url, timeout=timeout) as response:
        value = json.load(response)
    if not isinstance(value, dict):
        raise RuntimeError("local API returned a non-object response")
    return value


def generate(base: str, seed: int) -> bytes:
    boundary = "----QLOBE-LineWalking"
    fields = {
        "prompt": PROMPT,
        "seed": seed,
        "width": 768,
        "height": 640,
        "steps": 8,
        "cfg": 1,
    }
    request = Request(
        base + f"/workflows/{WORKFLOW}",
        data=multipart(fields, boundary),
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    submitted = read_json("", request=request)
    job = submitted.get("job_id") or submitted.get("id")
    if not job:
        raise RuntimeError("local API response omitted a job id")

    deadline = time.monotonic() + int(os.environ.get("QLOBE_QWEN_TIMEOUT", "900"))
    while time.monotonic() < deadline:
        status = read_json(f"{base}/jobs/{job}")
        state = str(status.get("status", "")).lower()
        if state in {"done", "complete", "completed", "success", "succeeded"}:
            with urlopen(f"{base}/jobs/{job}/result", timeout=300) as response:
                return response.read()
        if state in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError("Krea job failed")
        time.sleep(1)
    raise TimeoutError("Krea polling timed out")


def image_payload_is_supported(data: bytes) -> bool:
    return len(data) >= 5000 and data.startswith((b"\x89PNG", b"RIFF", b"\xff\xd8"))


def atomic_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def safe_error(error: Exception) -> str:
    if isinstance(error, HTTPError):
        return f"HTTP {error.code}"
    if isinstance(error, URLError):
        return "connection error"
    if isinstance(error, TimeoutError):
        return "timeout"
    if isinstance(error, RuntimeError):
        return str(error)
    return error.__class__.__name__


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--api-url")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    try:
        base = private_endpoint(configured_endpoint(args.api_url))
        endpoint_ready = True
    except ValueError:
        base = ""
        endpoint_ready = False

    if args.check:
        print(json.dumps({
            "raw": str(RAW),
            "sourceExists": RAW.is_file(),
            "apiReady": endpoint_ready,
            "productionOverwrite": False,
            "workflow": WORKFLOW,
            "seed": args.seed,
            "size": [768, 640],
            "steps": 8,
            "cfg": 1,
        }, indent=2))
        return 0

    if not endpoint_ready:
        raise SystemExit("Krea hub generation requires a localhost or private-network API endpoint")
    if RAW.is_file() and RECIPE.is_file() and not args.force:
        return 0

    OUT.mkdir(parents=True, exist_ok=True)
    try:
        data = generate(base, args.seed)
    except Exception as error:
        raise SystemExit(f"Krea hub generation failed: {safe_error(error)}") from None
    if not image_payload_is_supported(data):
        raise SystemExit("Krea returned an empty or unsupported image payload")

    temporary = RAW.with_suffix(".png.tmp")
    temporary.write_bytes(data)
    temporary.replace(RAW)
    atomic_json(RECIPE, {
        "format": "qlobe-recipe",
        "prompt": PROMPT,
        "seed": args.seed,
        "workflow": WORKFLOW,
        "sourceSha256": hashlib.sha256(data).hexdigest(),
        "productionOverwrite": False,
        "createdAt": dt.datetime.now(dt.timezone.utc).isoformat(),
    })
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
