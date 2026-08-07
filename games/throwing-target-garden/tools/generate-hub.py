#!/usr/bin/env python3
"""Generate and optionally install the canonical Krea menu-game-tile.

The LAN host is read from ``--qwen-url``, ``QLOBE_QWEN_URL``, or the
git-ignored authoring state. The committed recipe contains no machine-local
configuration. Run without ``--install`` for critic review; install only an
accepted seed.
"""
from __future__ import annotations

import argparse
import contextlib
import datetime
import fcntl
import hashlib
import json
import math
import os
import urllib.request
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
STATE = ROOT / "tools/state/local.json"
SOURCE_DIR = GAME / "assets/source/local-api"
FINAL = ROOT / "assets/hub/tiles/throwing-target-garden.jpg"
TEMPLATE = ROOT / "shared/data/generate-templates.json"

SUBJECT = (
    "A handcrafted teal felt target-garden toy diorama that fills the frame: one "
    "oversized cream rope landing basket in the foreground, one upright rainbow "
    "felt bullseye garden sign behind it, and three clearly separated stitched "
    "red, yellow, and blue beanbags resting safely on the grass as colorful "
    "choices. Smiling felt flowers and leafy stitched bushes frame the sides. "
    "Tactile wool fibers, visible blanket stitching, cozy handmade preschool "
    "toss-and-match game identity. Objects only, no tablet, no screen, no hands, "
    "no child, no flying object, no projectile, no impact, no UI."
)


def post_multipart(url: str, fields: dict[str, object]) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
            f"\r\n\r\n{value}\r\n"
        ).encode()
    body += f"--{boundary}--\r\n".encode()
    request = urllib.request.Request(
        url,
        data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(request, timeout=900) as response:
        return response.read(32 * 1024 * 1024 + 1)


def write_json(path: Path, payload: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")
    temporary.replace(path)


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


@contextlib.contextmanager
def publication_lock():
    """Serialize candidate/final publication and its provenance receipts."""
    identity = hashlib.sha256(str(GAME).encode()).hexdigest()[:16]
    lock_path = Path(os.getenv("TMPDIR", "/tmp")) / f"qlobe-throwing-target-hub-{identity}.lock"
    handle = lock_path.open("a+")
    try:
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX)
        yield
    finally:
        fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
        handle.close()


def validate_source(path: Path, expected: tuple[int, int]) -> None:
    if not path.is_file() or path.stat().st_size < 2_000:
        raise RuntimeError("Krea candidate is missing or implausibly small")
    with Image.open(path) as image:
        image.load()
        if image.format != "PNG" or image.size != expected:
            raise RuntimeError(
                f"Krea candidate was {image.format} {image.size}, expected PNG {expected}"
            )


def validate_installed(path: Path) -> None:
    if not path.is_file() or path.stat().st_size < 1_000:
        raise RuntimeError("installed hub JPEG is missing or implausibly small")
    with Image.open(path) as image:
        image.load()
        if image.format != "JPEG" or image.size != (640, 533) or image.mode != "RGB":
            raise RuntimeError(
                f"installed hub tile was {image.format} {image.mode} {image.size}, "
                "expected JPEG RGB (640, 533)"
            )


def validate_review_receipt(path: Path, payload: dict) -> tuple[dict, str]:
    """Require critic approval that is bound to the exact candidate bytes."""
    try:
        raw = path.read_bytes()
        review = json.loads(raw)
    except (OSError, json.JSONDecodeError) as error:
        raise RuntimeError("an accepted visual review receipt is required before install") from error
    scores = review.get("scores")
    if (
        review.get("format") != "qlobe-visual-review"
        or review.get("formatVersion") != 1
        or review.get("status") != "accepted"
        or review.get("gate") != "unanimous"
        or review.get("candidate") != payload.get("candidate")
        or review.get("candidateSha256") != payload.get("candidateSha256")
        or not isinstance(scores, list)
        or len(scores) < 2
        or any(
            not isinstance(value, (int, float))
            or isinstance(value, bool)
            or not math.isfinite(value)
            or value < 9
            for value in scores
        )
        or review.get("minimumScore") != min(scores)
        or not str(review.get("reviewContext", "")).strip()
        or not str(review.get("reviewed", "")).strip()
    ):
        raise RuntimeError("visual review receipt is not a unanimous >=9 approval for this candidate")
    return review, hashlib.sha256(raw).hexdigest()


def demote_superseded_receipts(current_recipe: Path) -> None:
    for other in SOURCE_DIR.glob("hub-tile-krea2-seed*.recipe.json"):
        if other == current_recipe:
            continue
        try:
            payload = json.loads(other.read_text())
        except (OSError, json.JSONDecodeError):
            continue
        if payload.get("status") != "installed":
            continue
        payload["previouslyInstalled"] = payload.get("installed")
        payload["previouslyInstalledSha256"] = payload.get("installedSha256")
        payload["installed"] = None
        payload["installedSha256"] = None
        payload["status"] = "superseded"
        if isinstance(payload.get("qa"), dict):
            payload["qa"]["status"] = "superseded"
        write_json(other, payload)


def install_transaction_path() -> Path:
    return SOURCE_DIR / ".hub-install-transaction.json"


def recover_install_transaction() -> str | None:
    """Finish a receipt commit if the process stopped after replacing the JPEG."""
    transaction = install_transaction_path()
    if not transaction.exists():
        return None
    try:
        marker = json.loads(transaction.read_text())
        recipe = ROOT / marker["recipe"]
        installed_payload = marker["installedPayload"]
        expected_sha = marker["installedSha256"]
        expected_final = str(FINAL.relative_to(ROOT))
    except (OSError, json.JSONDecodeError, KeyError, TypeError, ValueError) as error:
        raise RuntimeError("invalid interrupted hub install transaction") from error
    if (
        marker.get("format") != "qlobe-hub-install-transaction"
        or marker.get("formatVersion") != 1
        or marker.get("final") != expected_final
        or recipe.resolve().parent != SOURCE_DIR.resolve()
        or not isinstance(installed_payload, dict)
        or installed_payload.get("status") != "installed"
        or installed_payload.get("installed") != expected_final
        or installed_payload.get("installedSha256") != expected_sha
    ):
        raise RuntimeError("invalid interrupted hub install transaction")
    if not FINAL.is_file() or file_sha256(FINAL) != expected_sha:
        # The marker is written before the atomic image replace. A different
        # final hash means the replace never committed, so the transaction is
        # safe to abandon and the caller may start a fresh install.
        transaction.unlink(missing_ok=True)
        return "discarded"
    validate_installed(FINAL)
    write_json(recipe, installed_payload)
    demote_superseded_receipts(recipe)
    transaction.unlink(missing_ok=True)
    return "recovered"


def _publish_candidate_receipt_locked(recipe: Path, payload: dict) -> str:
    try:
        existing = json.loads(recipe.read_text())
    except (OSError, json.JSONDecodeError):
        existing = {}
    if existing.get("status") == "installed":
        if existing.get("candidateSha256") != payload.get("candidateSha256"):
            raise RuntimeError("this installed seed changed; choose a new seed or install the replacement atomically")
        if FINAL.is_file() and existing.get("installedSha256") == file_sha256(FINAL):
            return "installed"
    write_json(recipe, payload)
    return "candidate"


def publish_candidate_receipt(recipe: Path, payload: dict) -> str:
    """Do not downgrade a still-current installed receipt during a review run."""
    with publication_lock():
        recover_install_transaction()
        if file_sha256(ROOT / payload["candidate"]) != payload.get("candidateSha256"):
            raise RuntimeError("candidate changed before its receipt could be published")
        return _publish_candidate_receipt_locked(recipe, payload)


def _install_candidate_locked(source: Path, recipe: Path, payload: dict, review_path: Path) -> str:
    seed = payload["steps"][0]["seed"]
    root_candidate = payload["candidate"]
    root_final = str(FINAL.relative_to(ROOT))
    current_sha = file_sha256(source)
    if current_sha != payload.get("candidateSha256"):
        raise RuntimeError("candidate changed before install; refusing a false provenance receipt")
    validate_source(source, (payload["steps"][0]["width"], payload["steps"][0]["height"]))
    review, review_sha = validate_review_receipt(review_path, payload)
    temporary = FINAL.with_name(f".{FINAL.name}.{os.getpid()}.{seed}.tmp")
    try:
        with Image.open(source) as image:
            final = ImageOps.fit(image.convert("RGB"), (640, 533), method=Image.Resampling.LANCZOS)
            final.save(temporary, "JPEG", quality=90, optimize=True, progressive=True)
        validate_installed(temporary)
        installed_sha = file_sha256(temporary)
        installed_payload = {
            **payload,
            "installed": root_final,
            "installedSha256": installed_sha,
            "review": str(review_path.relative_to(ROOT)),
            "reviewSha256": review_sha,
            "status": "installed",
            "steps": [*payload["steps"], {
                "op": "finalize",
                "from": root_candidate,
                "output": root_final,
                "resize": "640x533-cover",
                "encode": "jpeg-q90-progressive",
            }],
            "qa": {
                "status": review["status"],
                "gate": review["gate"],
                "scores": review["scores"],
                "minimumScore": review["minimumScore"],
                "reviewContext": review["reviewContext"],
                "reviewed": review["reviewed"],
            },
        }
        write_json(install_transaction_path(), {
            "format": "qlobe-hub-install-transaction",
            "formatVersion": 1,
            "recipe": str(recipe.relative_to(ROOT)),
            "final": root_final,
            "installedSha256": installed_sha,
            "installedPayload": installed_payload,
        })
        temporary.replace(FINAL)
        validate_installed(FINAL)
        if file_sha256(FINAL) != installed_sha:
            raise RuntimeError("installed hub tile changed during atomic publication")
        write_json(recipe, installed_payload)
        demote_superseded_receipts(recipe)
        install_transaction_path().unlink(missing_ok=True)
    finally:
        temporary.unlink(missing_ok=True)
    return installed_sha


def install_candidate(source: Path, recipe: Path, payload: dict, review_path: Path | None = None) -> str:
    """Atomically install one accepted candidate and make its receipt canonical."""
    review_path = review_path or source.with_suffix(".review.json")
    with publication_lock():
        recover_install_transaction()
        return _install_candidate_locked(source, recipe, payload, review_path)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--qwen-url")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args()

    state = json.loads(STATE.read_text()) if STATE.exists() else {}
    api = (args.qwen_url or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    if not api:
        parser.error("LAN endpoint is required")

    templates = json.loads(TEMPLATE.read_text())
    template = next(item for item in templates["templates"] if item["id"] == "menu-game-tile")
    style = templates["styles"][template["defaultStyle"]]
    prompt = template["prompt"].replace("{subject}", SUBJECT).replace("{style.suffix}", style["suffix"])
    width, height = int(template["width"]), int(template["height"])
    seed = int(args.seed)
    source = SOURCE_DIR / f"hub-tile-krea2-seed{seed}.png"
    recipe = SOURCE_DIR / f"hub-tile-krea2-seed{seed}.recipe.json"
    review = SOURCE_DIR / f"hub-tile-krea2-seed{seed}.review.json"
    SOURCE_DIR.mkdir(parents=True, exist_ok=True)

    if args.force and not args.install and recipe.exists():
        try:
            prior = json.loads(recipe.read_text())
        except json.JSONDecodeError:
            prior = {}
        if prior.get("status") == "installed":
            raise RuntimeError("refusing to overwrite an installed seed during candidate-only generation")

    if not source.exists() or args.force:
        print(f"generating menu-game-tile seed {seed}", flush=True)
        image_bytes = post_multipart(
            f"{api}/workflows/{template['workflow']}?sync=true",
            {"prompt": prompt, "width": width, "height": height, "seed": seed},
        )
        if len(image_bytes) > 32 * 1024 * 1024 or not image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
            raise RuntimeError("Krea result was not a valid PNG under 32 MB")
        decoded = Image.open(BytesIO(image_bytes))
        decoded.load()
        if decoded.format != "PNG" or decoded.size != (width, height):
            raise RuntimeError(
                f"Krea result was {decoded.format} {decoded.size}, expected PNG {(width, height)}"
            )
        temporary = source.with_name(f".{source.name}.{os.getpid()}.tmp")
        try:
            temporary.write_bytes(image_bytes)
            validate_source(temporary, (width, height))
            with publication_lock():
                temporary.replace(source)
        finally:
            temporary.unlink(missing_ok=True)
    else:
        print(f"reusing {source.relative_to(ROOT)}", flush=True)

    validate_source(source, (width, height))

    root_candidate = str(source.relative_to(ROOT))
    steps = [{
        "workflow": template["workflow"],
        "prompt": prompt,
        "seed": seed,
        "width": width,
        "height": height,
        "output": root_candidate,
    }]
    payload = {
        "format": "qlobe-recipe",
        "formatVersion": 1,
        "id": f"throwing-target-garden-hub-seed{seed}",
        "kind": "image",
        "template": {"id": "menu-game-tile", "style": template["defaultStyle"]},
        "subject": SUBJECT,
        "candidate": root_candidate,
        "candidateSha256": file_sha256(source),
        "installed": None,
        "installedSha256": None,
        "status": "candidate",
        "steps": steps,
        "refs": {},
        "qa": {"status": "candidate"},
        "license": "CC-BY-4.0",
        "created": datetime.date.today().isoformat(),
    }
    if args.install:
        installed_sha = install_candidate(source, recipe, payload, review)
        print(f"installed {FINAL.relative_to(ROOT)} ({FINAL.stat().st_size} bytes, sha256 {installed_sha[:12]})")
    else:
        status = publish_candidate_receipt(recipe, payload)
        print(f"candidate ready: {source.relative_to(ROOT)} ({status})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
