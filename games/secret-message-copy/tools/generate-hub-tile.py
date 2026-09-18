#!/usr/bin/env python3
"""Generate and optionally install the Secret Message Copy Krea 2 hub tile.

The LAN host is resolved from ``--qwen-url``, ``QLOBE_QWEN_URL`` or a supplied
``--state`` JSON file and is never written to provenance or printed.
"""

from __future__ import annotations

import argparse
import datetime
import hashlib
import json
import os
import tempfile
import time
import urllib.error
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps


GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
OUT = GAME / "assets" / "source" / "local-api"
HUB = ROOT / "assets" / "hub" / "tiles" / "secret-message-copy.jpg"
WORKFLOW = "krea2-turbo-t2i"
WIDTH, HEIGHT = 768, 640
PROMPT = (
    "Use case: stylized-concept. Asset type: QLOBE Kids game menu tile. "
    "Primary request: one unmistakable secret-message play moment staged as "
    "tactile tabletop toys: a friendly small carved wooden owl postmaster in a "
    "navy cap and satchel presenting one cream parchment envelope with a large "
    "gold star wax seal; three separate chunky star, crescent-moon and heart "
    "stamp tokens rest nearby. Style/medium: premium Toy art world, painted wood, "
    "molded wax, soft rounded safe edges, subtle material grain and warm studio "
    "shadows, matching the QLOBE toy-table hub family. Composition: centered "
    "single scene on an airy pale sky-blue tabletop, generous padding, strong "
    "silhouette, all objects fully in frame and readable after a center crop. "
    "Lighting: joyful warm morning light. Constraints: no title, no words, no "
    "letters, no numbers, no UI, no device, no floating objects, no extra "
    "characters, no logo, no watermark, not watercolor, not vector, not CSS art."
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def atomic_bytes(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    os.close(fd)
    temporary = Path(name)
    try:
        temporary.write_bytes(data)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def endpoint(args: argparse.Namespace) -> str:
    state: dict = {}
    if args.state:
        try:
            state = json.loads(Path(args.state).read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            state = {}
    return str(
        args.qwen_url or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or ""
    ).rstrip("/")


def post(url: str, fields: dict[str, object]) -> bytes:
    boundary = "----qlobesecret" + os.urandom(8).hex()
    body = bytearray()
    for key, value in fields.items():
        body.extend(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
        )
    body.extend(f"--{boundary}--\r\n".encode())
    request = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    try:
        with urllib.request.urlopen(request, timeout=900) as response:
            return response.read(32 * 1024 * 1024)
    except urllib.error.HTTPError as error:
        detail = error.read(4096).decode("utf-8", "replace")
        raise RuntimeError(f"workflow HTTP {error.code}: {detail}") from error


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=300) as response:
        return response.read(32 * 1024 * 1024)


def generate(api: str, fields: dict[str, object]) -> bytes:
    """Prefer sync, then use the wrapper's asynchronous job contract."""
    try:
        data = post(f"{api}/workflows/{WORKFLOW}?sync=true", fields)
        if data.startswith(b"\x89PNG"):
            return data
    except RuntimeError as error:
        print(f"sync path unavailable ({str(error)[:180]}); retrying async", flush=True)
    submitted = json.loads(post(f"{api}/workflows/{WORKFLOW}", fields))
    job_id = submitted.get("job_id") or submitted.get("id")
    if not job_id:
        raise RuntimeError("Krea workflow returned no asynchronous job id")
    deadline = time.monotonic() + 1800
    while time.monotonic() < deadline:
        state = json.loads(get(f"{api}/jobs/{job_id}"))
        status = str(state.get("status", "")).lower()
        if status in {"completed", "complete", "success", "succeeded"}:
            return get(f"{api}/jobs/{job_id}/result")
        if status in {"failed", "error", "cancelled", "canceled"}:
            raise RuntimeError(f"Krea job ended with status {status}")
        time.sleep(3)
    raise TimeoutError("Krea hub generation exceeded 30 minutes")


def validate(data: bytes) -> None:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise RuntimeError("Krea response is not a PNG")
    with Image.open(BytesIO(data)) as image:
        image.load()
        if image.size != (WIDTH, HEIGHT):
            raise RuntimeError(f"expected {(WIDTH, HEIGHT)}, got {image.size}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qwen-url")
    parser.add_argument("--state")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()
    api = endpoint(args)
    if not api:
        parser.error("LAN endpoint is not configured")

    candidate = OUT / f"hub-tile-krea2-seed{args.seed}.png"
    recipe = OUT / f"hub-tile-krea2-seed{args.seed}.recipe.json"
    if args.force or not candidate.exists():
        print(f"generating Krea 2 hub candidate at seed {args.seed}", flush=True)
        data = generate(
            api,
            {
                "prompt": PROMPT,
                "seed": args.seed,
                "width": WIDTH,
                "height": HEIGHT,
                "steps": 8,
                "cfg": 1,
            },
        )
        validate(data)
        atomic_bytes(candidate, data)
    else:
        validate(candidate.read_bytes())
        print("reusing existing Krea 2 hub candidate", flush=True)

    payload = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": f"secret-message-copy-hub-seed{args.seed}",
        "kind": "image",
        "workflow": WORKFLOW,
        "prompt": PROMPT,
        "seed": args.seed,
        "width": WIDTH,
        "height": HEIGHT,
        "candidate": str(candidate.relative_to(ROOT)).replace("\\", "/"),
        "candidateSha256": sha256(candidate),
        "status": "accepted" if args.install else "candidate",
        "license": "CC-BY-4.0",
        "created": datetime.date.today().isoformat(),
    }
    atomic_bytes(recipe, (json.dumps(payload, indent=2) + "\n").encode())

    if args.install:
        with Image.open(candidate) as image:
            final = ImageOps.fit(
                image.convert("RGB"), (640, 533), method=Image.Resampling.LANCZOS
            )
        fd, name = tempfile.mkstemp(dir=HUB.parent, prefix=f".{HUB.name}.", suffix=".tmp")
        os.close(fd)
        temporary = Path(name)
        try:
            final.save(temporary, "JPEG", quality=88, optimize=True, progressive=True)
            temporary.replace(HUB)
        finally:
            temporary.unlink(missing_ok=True)
        print("installed reviewed hub tile", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
