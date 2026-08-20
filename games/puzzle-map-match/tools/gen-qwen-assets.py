#!/usr/bin/env python3
"""Derive Puzzle Explorer plates and transparent sheets with local Qwen."""
from __future__ import annotations

import argparse, io, ipaddress, json, os, pathlib, re, sys, time, urllib.parse, urllib.request

from PIL import Image, ImageOps

HERE = pathlib.Path(__file__).resolve().parent
GAME = HERE.parent
SOURCE = GAME / "assets" / "source"
REPORT = GAME / "assets" / "qwen-assets-report.json"
SEED = 42
EDIT_PROMPT = (
    "Change only the removable gameplay contents in this approved papercraft UI plate. "
    "Remove all three animal cards, the white hand cursor, every continent shape, and "
    "the stitched Australia halo. Fill those areas with the matching empty blue felt "
    "map-board and tray textures. Preserve the exact 4:3 composition, blank cream prompt "
    "ribbon, cream map frame, blue board, round HUD icons, empty blue tray, foreground "
    "foliage, palette, fibers, stitching, shadows, and lighting. Do not add or move "
    "anything. No text, pseudo-text, cards, hand, continents, labels, or new ornaments."
)
SHEETS = (
    (
        "animals", "animals-sheet-gpt-image-2.png",
        "Background layer: the exact flat solid magenta background from the input.\n"
        "Top layer: the exact same six finished papercraft animal cards on transparent "
        "background. Preserve every card, animal, border, cell position, color, and pixel "
        "detail from the input; remove only the magenta outside the cards.",
    ),
    (
        "foods", "foods-sheet-gpt-image-2.png",
        "Background layer: the exact flat solid magenta background from the input.\n"
        "Top layer: the exact same six finished papercraft food cards on transparent "
        "background. Preserve every card, food, border, cell position, color, and pixel "
        "detail from the input; remove only the magenta outside the cards.",
    ),
    (
        "landmarks", "landmarks-sheet-gpt-image-2.png",
        "Background layer: the exact flat solid magenta background from the input.\n"
        "Top layer: the exact same six finished papercraft landmark cards on transparent "
        "background. Preserve every card, landmark, border, cell position, color, and pixel "
        "detail from the input; remove only the magenta outside the cards.",
    ),
)


def host(allow_lan: bool) -> str:
    if not allow_lan:
        raise RuntimeError("Refusing network generation: pass --allow-lan explicitly")
    value = os.environ.get("QLOBE_QWEN_URL", "").strip().rstrip("/")
    if not value:
        state = pathlib.Path(__file__).resolve().parents[3] / "tools" / "state" / "local.json"
        try:
            value = json.loads(state.read_text()).get("qwenUrl", "").strip().rstrip("/")
        except (OSError, ValueError, AttributeError):
            value = ""
    if not value:
        raise RuntimeError("Qwen host unavailable: set QLOBE_QWEN_URL or tools/state/local.json")
    parsed = urllib.parse.urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise RuntimeError(f"Qwen host is not an approved private HTTP(S) origin: {value}")
    if parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise RuntimeError(f"Qwen URL must be an origin without a path, query, or fragment: {value}")
    name = parsed.hostname.lower()
    approved = name == "localhost"
    if not approved:
        try:
            address = ipaddress.ip_address(name)
            approved = address.is_loopback or any(address in network for network in (
                ipaddress.ip_network("10.0.0.0/8"),
                ipaddress.ip_network("172.16.0.0/12"),
                ipaddress.ip_network("192.168.0.0/16"),
            ))
        except ValueError:
            approved = False
    if not approved:
        raise RuntimeError(f"Qwen host is not a loopback or RFC1918 address: {value}")
    return urllib.parse.urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


class NoRedirect(urllib.request.HTTPRedirectHandler):
    """Keep approved LAN requests on their validated origin."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


NO_REDIRECT_OPENER = urllib.request.build_opener(NoRedirect)


def open_no_redirect(url_or_request, *, timeout: int):
    return NO_REDIRECT_OPENER.open(url_or_request, timeout=timeout)


def atomic_png(path: pathlib.Path, data: bytes, *, layered: bool = False, expected=None) -> dict:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        if data[:8] != b"\x89PNG\r\n\x1a\n":
            raise ValueError("invalid PNG signature")
        with Image.open(io.BytesIO(data)) as generated:
            generated.load()
            if expected and generated.size != expected:
                mode = "RGBA" if layered or "A" in generated.getbands() else "RGB"
                normalized = ImageOps.fit(
                    generated.convert(mode), expected, method=Image.Resampling.LANCZOS,
                )
                normalized.save(temporary, "PNG", optimize=True)
                normalized.close()
            else:
                temporary.write_bytes(data)
        metric = valid_png(temporary, layered=layered, expected=expected)
        temporary.replace(path)
        return metric
    finally:
        temporary.unlink(missing_ok=True)


def atomic_text(path: pathlib.Path, text: str) -> None:
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    try:
        temporary.write_text(text, encoding="utf-8")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def post_multipart(url: str, fields: dict, name: str, data: bytes) -> bytes:
    boundary = "----qlobe-qwen-assets"
    body = io.BytesIO()
    for key, value in fields.items():
        body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode())
    body.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n".encode())
    body.write(data); body.write(f"\r\n--{boundary}--\r\n".encode())
    req = urllib.request.Request(url, body.getvalue(), {"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with open_no_redirect(req, timeout=900) as response:
        return response.read()


def valid_png(path: pathlib.Path, layered: bool = False, expected: tuple[int, int] | None = None) -> dict:
    raw = path.read_bytes()
    if raw[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("invalid PNG signature")
    with Image.open(io.BytesIO(raw)) as im:
        im.load(); metric = {"width": im.width, "height": im.height, "mode": im.mode}
        if expected and im.size != expected:
            raise ValueError(f"unexpected size {im.size}; expected {expected}")
        if layered:
            alpha = im.convert("RGBA").getchannel("A")
            lo, hi = alpha.getextrema()
            if lo == hi or hi == 0:
                raise ValueError("layered output has trivial alpha")
            histogram = alpha.histogram()
            total = im.width * im.height
            transparent = sum(histogram[:16]) / total
            opaque = sum(histogram[240:]) / total
            if transparent < 0.02 or opaque < 0.25:
                raise ValueError(
                    f"implausible alpha coverage transparent={transparent:.3f}, opaque={opaque:.3f}"
                )
            metric.update(
                alpha_min=lo,
                alpha_max=hi,
                transparent_fraction=round(transparent, 5),
                opaque_fraction=round(opaque, 5),
            )
    return metric


def valid_existing(path: pathlib.Path, *, layered: bool, expected: tuple[int, int]) -> bool:
    try:
        valid_png(path, layered=layered, expected=expected)
        return True
    except (OSError, ValueError):
        return False


def main() -> int:
    ap = argparse.ArgumentParser(); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--force", action="store_true"); ap.add_argument("--allow-lan", action="store_true"); ap.add_argument("--resume-layer", action="append", default=[], metavar="KEY=JOB_ID")
    args = ap.parse_args(); outputs = []
    resume_layers = {}
    sheet_keys = {entry[0] for entry in SHEETS}
    for value in args.resume_layer:
        key, separator, job_id = value.partition("=")
        if separator != "=" or key not in sheet_keys or not re.fullmatch(r"[A-Za-z0-9_-]+", job_id):
            raise RuntimeError(f"invalid --resume-layer value: {value}")
        resume_layers[key] = job_id
    edit_src = SOURCE / "play-screen-gpt-image-2.png"; edit_out = SOURCE / "play-plate-qwen-edit.png"
    if not edit_src.exists():
        raise RuntimeError(f"missing source {edit_src.relative_to(GAME)}")
    with Image.open(edit_src) as image:
        edit_size = image.size
    edit_needed = args.force or not valid_existing(edit_out, layered=False, expected=edit_size)
    if edit_needed:
        if args.dry_run:
            print(f"would edit {edit_src.name} -> {edit_out.name}")
        else:
            api = host(args.allow_lan)
            data = post_multipart(
                api + "/workflows/qwen-image-edit?sync=true",
                {"prompt": EDIT_PROMPT, "seed": SEED}, edit_src.name, edit_src.read_bytes(),
            )
            atomic_png(edit_out, data, expected=edit_size)
    for key, filename, extract_prompt in SHEETS:
        src, out = SOURCE / filename, SOURCE / f"{key}-layer2.png"
        if not src.exists():
            raise RuntimeError(f"missing source {src.relative_to(GAME)}")
        with Image.open(src) as image:
            source_size = image.size
        if not args.force and valid_existing(out, layered=True, expected=source_size):
            continue
        if args.dry_run:
            print(f"would layer {filename} -> {out.name}")
            continue
        api = host(args.allow_lan)
        job = resume_layers.get(key)
        if job:
            print(f"resuming {key} layer job {job}", flush=True)
        else:
            raw = post_multipart(
                api + "/workflows/qwen-image-layered",
                {"prompt": extract_prompt, "layers": 2, "seed": SEED}, filename, src.read_bytes(),
            )
            job = json.loads(raw).get("job_id")
            if not isinstance(job, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", job):
                raise RuntimeError(f"layered workflow returned an invalid job id for {filename}")
            print(f"queued {key} layer job {job}", flush=True)
        for _ in range(900):
            with open_no_redirect(api + f"/jobs/{job}", timeout=60) as r: status = json.loads(r.read()).get("status")
            if status == "completed":
                with open_no_redirect(api + f"/jobs/{job}/result?output=layer_2", timeout=300) as r:
                    atomic_png(out, r.read(), layered=True, expected=source_size)
                break
            if status in {"failed", "cancelled", "canceled"}: raise RuntimeError(f"layered workflow {status} for {filename}")
            time.sleep(2)
        else: raise RuntimeError(f"timed out waiting for {filename}")
    if args.dry_run:
        return 0

    outputs.append({
        "workflow": "qwen-image-edit",
        "prompt": EDIT_PROMPT,
        "seed": SEED,
        "source": str(edit_src.relative_to(GAME)),
        "output": str(edit_out.relative_to(GAME)),
        "validation": valid_png(edit_out, expected=edit_size),
    })
    for key, filename, extract_prompt in SHEETS:
        src = SOURCE / filename
        out = SOURCE / f"{key}-layer2.png"
        with Image.open(src) as image:
            source_size = image.size
        outputs.append({
            "workflow": "qwen-image-layered",
            "prompt": extract_prompt,
            "seed": SEED,
            "source": str(src.relative_to(GAME)),
            "output": str(out.relative_to(GAME)),
            "validation": valid_png(out, layered=True, expected=source_size),
        })
    report = {
        "format": "qlobe-production-report",
        "formatVersion": 1,
        "id": "puzzle-map-match-qwen-assets",
        "outputs": outputs,
    }
    atomic_text(REPORT, json.dumps(report, indent=2, sort_keys=True) + "\n")
    return 0

if __name__ == "__main__":
    try: raise SystemExit(main())
    except (RuntimeError, ValueError, OSError, json.JSONDecodeError) as exc: print(f"error: {exc}", file=sys.stderr); raise SystemExit(2)
