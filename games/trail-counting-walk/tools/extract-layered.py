#!/usr/bin/env python3
"""Extract verified cutter crops with Qwen Image Layered.

The full contact-sheet extraction is deliberately not used: a retained QA
candidate proved that Layered may select one object from a multi-object sheet.
Each cutter crop is therefore submitted independently and finalized later by
``build-assets.py``. The script is resumable and never embeds the LAN host.
"""

from __future__ import annotations

import argparse
import ipaddress
import json
import os
import time
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
CROPS = GAME / "assets" / "source" / "crops"
SOURCE = GAME / "assets" / "source" / "gpt-image-2"
OUTPUT = GAME / "assets" / "source" / "layer2"
SEEDS = (42, 1337, 9001, 7)

SUBJECTS = {
    "route-5": "moss-green papercraft route card",
    "route-10": "denim-blue papercraft route card",
    "route-20": "plum-purple papercraft route card",
    "stone": "broad light-gray papercraft stepping stone",
    "fox-idle": "complete orange papercraft fox standing calmly",
    "fox-hop": "complete orange papercraft fox hopping to the right",
    "fox-celebrate": "complete orange papercraft fox celebrating",
    "pennant": "blank moss-green stitched paper pennant",
    "star": "chunky golden five-point paper star",
    "finish-flag": "orange-and-cream checkered paper finish flag and pole",
    "button-orange": "blank orange cut-paper button plate with cream backing",
    "active-mat": "layered moss-green leaf-shaped paper mat",
}

PRIVATE_NETWORKS = tuple(
    ipaddress.ip_network(block)
    for block in (
        "10.0.0.0/8",
        "127.0.0.0/8",
        "169.254.0.0/16",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "::1/128",
        "fc00::/7",
        "fe80::/10",
    )
)


def configured_endpoint(explicit: str | None) -> str:
    if explicit:
        return explicit.rstrip("/")
    if os.environ.get("QLOBE_QWEN_URL"):
        return os.environ["QLOBE_QWEN_URL"].rstrip("/")
    try:
        local = json.loads((REPO / "tools/state/local.json").read_text("utf-8"))
        return str(local.get("qwenUrl", "")).rstrip("/")
    except (OSError, ValueError, TypeError):
        return ""


def private_endpoint(value: str) -> str:
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("API endpoint must be an HTTP(S) URL")
    if parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("API endpoint must not contain credentials or a query")
    host = parsed.hostname.lower()
    if host != "localhost":
        try:
            address = ipaddress.ip_address(host)
        except ValueError as error:
            raise ValueError("API host must be localhost or a literal private IP") from error
        if not any(address in network for network in PRIVATE_NETWORKS):
            raise ValueError("API host must be on a private network")
    return value.rstrip("/")


def request(url: str, data: bytes | None = None, headers: dict[str, str] | None = None) -> bytes:
    call = Request(url, data=data, headers=headers or {})
    with urlopen(call, timeout=90) as response:
        return response.read()


def submit(base: str, source: Path, prompt: str, seed: int) -> str:
    boundary = "----qlobe-trail-layered"
    body = bytearray()
    for key, value in {"prompt": prompt, "layers": "2", "seed": str(seed)}.items():
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"'
            f"\r\n\r\n{value}\r\n"
        ).encode()
    body += (
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
        f'filename="{source.name}"\r\nContent-Type: image/png\r\n\r\n'
    ).encode()
    body += source.read_bytes() + f"\r\n--{boundary}--\r\n".encode()
    result = json.loads(
        request(
            f"{base}/workflows/qwen-image-layered",
            bytes(body),
            {"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )
    )
    job_id = result.get("job_id") or result.get("id")
    if not job_id:
        raise RuntimeError("Layered submission returned no job id")
    return str(job_id)


def extract(base: str, source: Path, destination: Path, prompt: str, seed: int, timeout: float) -> None:
    job_id = submit(base, source, prompt, seed)
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        status = json.loads(request(f"{base}/jobs/{job_id}"))
        state = str(status.get("status", "")).lower()
        if state in {"done", "complete", "completed", "success", "succeeded"}:
            data = request(f"{base}/jobs/{job_id}/result?output=layer_2")
            if not data.startswith(b"\x89PNG\r\n\x1a\n"):
                raise RuntimeError("Layered result was not a PNG")
            destination.parent.mkdir(parents=True, exist_ok=True)
            temporary = destination.with_suffix(destination.suffix + ".tmp")
            temporary.write_bytes(data)
            temporary.replace(destination)
            return
        if state in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"Layered job ended as {state}")
        time.sleep(3)
    raise TimeoutError("Layered job timed out")


def object_prompt(subject: str) -> str:
    return (
        "Separate this image into exactly two layers. Layer 1 is only the flat dark "
        "charcoal background. Layer 2 is the one entire " + subject + " alone on true "
        "transparency. Preserve every complete edge, paper fiber, color, proportion, "
        "facial feature, interior detail, and soft edge exactly. Do not redraw, crop, "
        "rearrange, add, remove, recolor, simplify, or add a new shadow. Everything "
        "outside the complete subject must be transparent."
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url")
    parser.add_argument("--seed", type=int, default=42, choices=SEEDS)
    parser.add_argument("--only", nargs="*", choices=(*SUBJECTS, "title"))
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--timeout", type=float, default=1800)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()

    try:
        base = private_endpoint(configured_endpoint(args.api_url))
    except ValueError as error:
        if args.check:
            print(json.dumps({"ready": False, "reason": str(error)}, indent=2))
            return 1
        raise SystemExit(str(error)) from None

    missing = [name for name in SUBJECTS if not (CROPS / f"{name}.png").is_file()]
    if args.check:
        print(json.dumps({
            "ready": not missing,
            "sourceCount": len(SUBJECTS) - len(missing),
            "expectedCount": len(SUBJECTS),
            "missing": missing,
            "titleSource": (SOURCE / "title-master.png").is_file(),
            "seed": args.seed,
        }, indent=2))
        return int(bool(missing))
    if missing:
        raise SystemExit("missing cutter crops: " + ", ".join(missing))

    wanted = set(args.only or (*SUBJECTS, "title"))
    failures = 0
    for name, subject in SUBJECTS.items():
        if name not in wanted:
            continue
        source = CROPS / f"{name}.png"
        destination = OUTPUT / f"{name}-seed{args.seed}.png"
        if destination.is_file() and not args.force:
            print(f"{name}: skip", flush=True)
            continue
        print(f"{name}: extracting", flush=True)
        try:
            extract(base, source, destination, object_prompt(subject), args.seed, args.timeout)
            print(f"{name}: done", flush=True)
        except Exception as error:  # retained sources make a later retry safe
            failures += 1
            print(f"{name}: FAILED ({error})", flush=True)

    if "title" in wanted:
        source = SOURCE / "title-master.png"
        destination = OUTPUT / f"title-seed{args.seed}.png"
        if destination.is_file() and not args.force:
            print("title: skip", flush=True)
        else:
            title_prompt = (
                "Separate this title lockup into exactly two layers. Layer 1 is only the "
                "dark charcoal background. Layer 2 is the complete exact paper banner "
                "reading TRAIL COUNTING WALK, including all 17 letters, attached paper "
                "sprigs, orange tags, and shadows, alone on true transparency. Preserve "
                "spelling, letter shapes, spacing, layout, colors, paper fibers, and every "
                "outer edge exactly. Do not redraw, crop, omit, add, rearrange, or respell."
            )
            try:
                extract(base, source, destination, title_prompt, args.seed, args.timeout)
                print("title: done", flush=True)
            except Exception as error:
                failures += 1
                print(f"title: FAILED ({error})", flush=True)

    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
