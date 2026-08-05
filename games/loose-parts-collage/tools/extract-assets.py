#!/usr/bin/env python3
"""Extract, validate, contact-sheet, and encode Little Artist runtime art."""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import os
import tempfile
import time
import urllib.request
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageOps


GAME_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = GAME_ROOT.parents[1]
SOURCE_ROOT = GAME_ROOT / "assets/source/local-api"
PLAN_PATH = SOURCE_ROOT / "plan.json"
LAYER_ROOT = SOURCE_ROOT / "layered"
QA_ROOT = SOURCE_ROOT / "qa"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SUCCESS_STATES = {"completed", "complete", "success", "succeeded"}
FAILURE_STATES = {"failed", "error", "cancelled", "canceled"}
MAX_RUNTIME_BYTES = 300 * 1024
ALPHA_FLOOR = 8


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


def atomic_json(path: Path, value: dict) -> None:
    atomic_write(path, (json.dumps(value, indent=2) + "\n").encode())


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


def multipart(fields: dict[str, object], image_path: Path) -> tuple[bytes, str]:
    boundary = "----qlobe-little-artist-layered"
    body = bytearray()
    for name, value in fields.items():
        body.extend(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"'
            f"\r\n\r\n{value}\r\n".encode()
        )
    body.extend(
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; '
        f'filename="{image_path.name}"\r\nContent-Type: image/png\r\n\r\n'.encode()
    )
    body.extend(image_path.read_bytes())
    body.extend(f"\r\n--{boundary}--\r\n".encode())
    return bytes(body), boundary


def request_json(request: urllib.request.Request | str, timeout: int) -> dict:
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.load(response)


def request_bytes(url: str, timeout: int) -> bytes:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return response.read()


def extraction_prompt(job: dict) -> str:
    configured = job.get("extractPrompt")
    if configured:
        return str(configured)
    identities = job.get("layout", {}).get("ids", []) or [job["id"]]
    subjects = ", ".join(str(name).replace("-", " ") for name in identities)
    return (
        "Layer 1: only the flat dark background. "
        "Layer 2: all complete original foreground objects together on true "
        f"transparency. The foreground objects are: {subjects}. Preserve their "
        "exact source shapes, colors, textures, holes, count, positions, and scale. "
        "Do not redraw, rearrange, crop, merge, add, or remove anything."
    )


def qwen_layer_difference(composite_data: bytes, background_data: bytes) -> bytes:
    """Recover a cutout when Layered emits a transparent background as layer 2.

    Both aligned images are authored by Qwen Image Layered. The RGB difference
    between its composite layer and its transparent clean-background layer is a
    model-derived matte, not a source-image flood fill.
    """
    composite = Image.open(io.BytesIO(composite_data)).convert("RGBA")
    background = Image.open(io.BytesIO(background_data)).convert("RGBA")
    if composite.size != background.size:
        raise ValueError("Qwen composite and background layer sizes differ")
    composite_rgb = composite.convert("RGB")
    background_rgb = background.convert("RGB")
    composite_pixels = composite_rgb.tobytes()
    background_pixels = background_rgb.tobytes()
    distances = [
        max(
            abs(composite_pixels[offset + channel] - background_pixels[offset + channel])
            for channel in range(3)
        )
        for offset in range(0, len(composite_pixels), 3)
    ]
    corner_distances: list[int] = []
    patch_width = max(1, composite.width // 10)
    patch_height = max(1, composite.height // 10)
    for y in range(composite.height):
        if patch_height <= y < composite.height - patch_height:
            continue
        for x in range(composite.width):
            if patch_width <= x < composite.width - patch_width:
                continue
            corner_distances.append(distances[y * composite.width + x])
    corner_distances.sort()
    background_ceiling = corner_distances[
        min(len(corner_distances) - 1, round(len(corner_distances) * 0.95))
    ]
    low = max(24, background_ceiling + 3)
    high = low + 48
    matte = bytearray(composite.width * composite.height)
    for pixel, distance in enumerate(distances):
        matte[pixel] = max(0, min(255, round((distance - low) * 255 / (high - low))))
    cutout = composite.copy()
    cutout.putalpha(Image.frombytes("L", composite.size, bytes(matte)))
    buffer = io.BytesIO()
    cutout.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def submit_layered(
    base_url: str, job: dict, source: Path, seed: int
) -> tuple[str, bytes, str]:
    prompt = extraction_prompt(job)
    body, boundary = multipart(
        {"prompt": prompt, "layers": 2, "seed": seed}, source
    )
    request = urllib.request.Request(
        f"{base_url}/workflows/qwen-image-layered",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    submission = request_json(request, timeout=300)
    remote_job_id = submission.get("job_id") or submission.get("id")
    if not remote_job_id:
        raise RuntimeError(f"Layered workflow returned no job id: {submission}")

    deadline = time.monotonic() + 30 * 60
    while time.monotonic() < deadline:
        status_document = request_json(
            f"{base_url}/jobs/{remote_job_id}", timeout=30
        )
        status = str(status_document.get("status", "")).lower()
        if status in SUCCESS_STATES:
            data = request_bytes(
                f"{base_url}/jobs/{remote_job_id}/result?output=layer_2",
                timeout=300,
            )
            if not data.startswith(PNG_SIGNATURE):
                raise ValueError("Layered layer_2 result is not a PNG")
            composite = request_bytes(
                f"{base_url}/jobs/{remote_job_id}/result?output=layer_0",
                timeout=300,
            )
            if not composite.startswith(PNG_SIGNATURE):
                raise ValueError("Layered layer_0 result is not a PNG")
            derived = qwen_layer_difference(composite, data)
            source_image = Image.open(source).convert("RGBA")
            names = job.get("layout", {}).get("ids", [job["id"]])
            placeholder_destinations = [Path(name) for name in names]

            def accepted_cell_count(candidate: bytes) -> int:
                try:
                    inspected = inspect_layer_candidate(
                        candidate, source_image, job, placeholder_destinations
                    )
                except Exception:
                    return -1
                return sum(
                    result["error"] is None
                    for result in inspected["cells"].values()
                )

            layer_score = accepted_cell_count(data)
            derived_score = accepted_cell_count(derived)
            if derived_score > layer_score:
                return (
                    str(remote_job_id),
                    derived,
                    "layer_0-minus-layer_2",
                )
            return str(remote_job_id), data, "layer_2"
        if status in FAILURE_STATES:
            raise RuntimeError(f"Layered workflow ended in {status}: {status_document}")
        time.sleep(2)
    raise TimeoutError(f"Layered workflow {remote_job_id} exceeded 30 minutes")


def alpha_stats(image: Image.Image) -> dict:
    alpha = image.getchannel("A")
    histogram = alpha.histogram()
    total = image.width * image.height
    transparent = sum(histogram[: ALPHA_FLOOR + 1])
    opaque = sum(histogram[240:])
    partial = total - transparent - opaque
    bbox = alpha.point(lambda value: 255 if value > ALPHA_FLOOR else 0).getbbox()
    corners = [
        alpha.getpixel((0, 0)),
        alpha.getpixel((image.width - 1, 0)),
        alpha.getpixel((0, image.height - 1)),
        alpha.getpixel((image.width - 1, image.height - 1)),
    ]
    coverage = 0
    alpha_fill = 0
    if bbox:
        bbox_area = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        coverage = bbox_area / total
        alpha_fill = (total - transparent) / bbox_area
    percent = lambda count: round(count * 100 / total, 3) if total else 0
    return {
        "transparentPct": percent(transparent),
        "opaqueCorePct": percent(opaque),
        "partialPct": percent(partial),
        "bbox": list(bbox) if bbox else None,
        "bboxCoverage": round(coverage, 4),
        "alphaFill": round(alpha_fill, 4),
        "cornerAlpha": corners,
    }


def floor_alpha(image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    result.putalpha(
        result.getchannel("A").point(
            lambda value: 0 if value <= ALPHA_FLOOR else value
        )
    )
    return result


def clean_alpha_components(image: Image.Image) -> tuple[Image.Image, dict]:
    """Drop only tiny disconnected matte debris; Layered remains alpha authority."""
    result = image.convert("RGBA")
    alpha = result.getchannel("A")
    width, height = alpha.size
    values = alpha.tobytes()
    pixel_count = width * height
    core = bytearray(value >= 24 for value in values)
    seen = bytearray(pixel_count)
    keep = bytearray(pixel_count)
    minimum = max(24, int(pixel_count * 0.00008))
    component_count = 0
    kept_count = 0

    for start in range(pixel_count):
        if not core[start] or seen[start]:
            continue
        component_count += 1
        seen[start] = 1
        queue = deque([start])
        component = []
        while queue:
            index = queue.popleft()
            component.append(index)
            x = index % width
            for neighbor in (index - 1, index + 1, index - width, index + width):
                if neighbor < 0 or neighbor >= pixel_count:
                    continue
                if neighbor == index - 1 and x == 0:
                    continue
                if neighbor == index + 1 and x == width - 1:
                    continue
                if seen[neighbor] or not core[neighbor]:
                    continue
                seen[neighbor] = 1
                queue.append(neighbor)
        if len(component) >= minimum:
            kept_count += 1
            for index in component:
                keep[index] = 255

    # A three-pixel-radius expansion retains the accepted components' soft edge.
    expanded = Image.frombytes("L", (width, height), bytes(keep)).filter(
        ImageFilter.MaxFilter(7)
    )
    expanded_values = expanded.tobytes()
    cleaned = bytearray(values)
    removed_pixels = 0
    for index, value in enumerate(cleaned):
        if value and not expanded_values[index]:
            cleaned[index] = 0
            removed_pixels += 1
    result.putalpha(Image.frombytes("L", (width, height), bytes(cleaned)))
    return result, {
        "components": component_count,
        "keptComponents": kept_count,
        "minimumCorePixels": minimum,
        "removedAlphaPixels": removed_pixels,
    }


def validate_cutout(
    image: Image.Image,
    label: str,
    require_center_hole: bool = False,
    allow_horizontal_edge: bool = False,
) -> dict:
    metrics = alpha_stats(image)
    if not metrics["bbox"]:
        raise ValueError(f"{label}: empty alpha extraction")
    if metrics["transparentPct"] < 5:
        raise ValueError(
            f"{label}: background retained ({metrics['transparentPct']}% transparent)"
        )
    if metrics["opaqueCorePct"] < 0.5:
        raise ValueError(
            f"{label}: near-blank extraction ({metrics['opaqueCorePct']}% opaque)"
        )
    if max(metrics["cornerAlpha"]) > 16:
        raise ValueError(f"{label}: alpha touches a source corner")
    left, top, right, bottom = metrics["bbox"]
    touches_horizontal = left <= 0 or right >= image.width
    touches_vertical = top <= 0 or bottom >= image.height
    if touches_vertical or (touches_horizontal and not allow_horizontal_edge):
        raise ValueError(f"{label}: subject touches its cell boundary")
    if not 0.005 <= metrics["bboxCoverage"] <= 0.96:
        raise ValueError(
            f"{label}: implausible alpha bbox coverage {metrics['bboxCoverage']}"
        )
    if require_center_hole:
        center_alpha = image.getchannel("A").getpixel(
            (image.width // 2, image.height // 2)
        )
        metrics["centerAlpha"] = center_alpha
        if center_alpha > 16:
            raise ValueError(f"{label}: intended open center is not transparent")
    if metrics["partialPct"] > 2:
        metrics["flags"] = ["alpha-partial-band>2%"]
    else:
        metrics["flags"] = []
    return metrics


def trim_with_padding(image: Image.Image, padding_ratio: float = 0.045) -> Image.Image:
    alpha = image.getchannel("A")
    bbox = alpha.point(lambda value: 255 if value > ALPHA_FLOOR else 0).getbbox()
    if not bbox:
        raise ValueError("cannot trim an empty cutout")
    pad = max(4, round(max(bbox[2] - bbox[0], bbox[3] - bbox[1]) * padding_ratio))
    padded = (
        max(0, bbox[0] - pad),
        max(0, bbox[1] - pad),
        min(image.width, bbox[2] + pad),
        min(image.height, bbox[3] + pad),
    )
    return image.crop(padded)


def fit(image: Image.Image, size: tuple[int, int], cover: bool = False) -> Image.Image:
    target_width, target_height = size
    ratio = (
        max(target_width / image.width, target_height / image.height)
        if cover
        else min(target_width / image.width, target_height / image.height)
    )
    resized = image.resize(
        (
            max(1, round(image.width * ratio)),
            max(1, round(image.height * ratio)),
        ),
        Image.Resampling.LANCZOS,
    )
    if cover:
        left = (resized.width - target_width) // 2
        top = (resized.height - target_height) // 2
        return resized.crop((left, top, left + target_width, top + target_height))
    result = Image.new("RGBA", size, (0, 0, 0, 0))
    result.alpha_composite(
        resized,
        ((target_width - resized.width) // 2, (target_height - resized.height) // 2),
    )
    return result


def encode_runtime(image: Image.Image, path: Path, transparent: bool) -> dict:
    attempts: list[dict] = []
    if transparent:
        candidates: list[tuple[str, int | None]] = [
            ("lossless", None),
            *[("lossy", quality) for quality in (92, 88, 84, 80, 76, 72)],
        ]
        for mode, quality in candidates:
            buffer = io.BytesIO()
            options = {"format": "WEBP", "method": 6, "exact": True}
            if mode == "lossless":
                options["lossless"] = True
            else:
                options["quality"] = quality
            image.save(buffer, **options)
            data = buffer.getvalue()
            attempts.append({"mode": mode, "quality": quality, "bytes": len(data)})
            if len(data) <= MAX_RUNTIME_BYTES:
                atomic_write(path, data)
                return {
                    "bytes": len(data), "kilobytes": round(len(data) / 1024, 1),
                    "encoding": mode, "quality": quality,
                }
    else:
        output_format = "JPEG" if path.suffix.lower() == ".jpg" else "WEBP"
        for quality in (92, 88, 84, 80, 76, 72, 68, 64, 60):
            buffer = io.BytesIO()
            options = {"format": output_format, "quality": quality}
            if output_format == "WEBP":
                options["method"] = 6
            else:
                options["optimize"] = True
            image.convert("RGB").save(buffer, **options)
            data = buffer.getvalue()
            attempts.append({"quality": quality, "bytes": len(data)})
            if len(data) <= MAX_RUNTIME_BYTES:
                atomic_write(path, data)
                return {
                    "bytes": len(data), "kilobytes": round(len(data) / 1024, 1),
                    "encoding": output_format.lower(), "quality": quality,
                }
    raise ValueError(f"{path}: could not meet 300KB runtime budget: {attempts}")


def save_png(image: Image.Image, path: Path) -> None:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    atomic_write(path, buffer.getvalue())


def magenta_composite(image: Image.Image) -> Image.Image:
    background = Image.new("RGBA", image.size, (255, 0, 255, 255))
    background.alpha_composite(image)
    return background.convert("RGB")


def checker(size: tuple[int, int], step: int = 20) -> Image.Image:
    image = Image.new("RGBA", size, (255, 0, 255, 255))
    draw = ImageDraw.Draw(image)
    for y in range(0, size[1], step):
        for x in range(0, size[0], step):
            if (x // step + y // step) % 2:
                draw.rectangle(
                    (x, y, min(x + step, size[0]), min(y + step, size[1])),
                    fill=(255, 204, 238, 255),
                )
    return image


def save_contact_sheet(job_id: str, names: list[str], images: list[Image.Image], columns: int) -> None:
    columns = max(1, columns)
    rows = (len(images) + columns - 1) // columns
    cell_width, cell_height = 240, 260
    sheet = checker((columns * cell_width, rows * cell_height), step=16)
    draw = ImageDraw.Draw(sheet)
    for index, (name, image) in enumerate(zip(names, images)):
        x = index % columns * cell_width
        y = index // columns * cell_height
        preview = fit(image, (216, 216))
        sheet.alpha_composite(preview, (x + 12, y + 8))
        draw.rectangle((x, y + 226, x + cell_width, y + cell_height), fill=(56, 48, 48, 238))
        draw.text((x + 8, y + 236), name, fill=(255, 255, 255, 255))
    save_png(sheet.convert("RGB"), QA_ROOT / f"{job_id}-contact.png")


def runtime_destinations(job: dict) -> list[Path]:
    names = job.get("layout", {}).get("ids", [])
    if job.get("runtimeDir"):
        return [GAME_ROOT / job["runtimeDir"] / f"{name}.webp" for name in names]
    if job.get("runtime"):
        return [GAME_ROOT / job["runtime"]]
    return []


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def job_fingerprint(job: dict) -> str:
    encoded = json.dumps(job, sort_keys=True, separators=(",", ":")).encode()
    return sha256_bytes(encoded)


def metrics_match(job: dict, source: Path, require_approval: bool = False) -> bool:
    metrics_path = QA_ROOT / f"{job['id']}-metrics.json"
    try:
        metrics = json.loads(metrics_path.read_text())
    except (OSError, ValueError):
        return False
    if metrics.get("sourceSha256") != sha256_bytes(source.read_bytes()):
        return False
    if metrics.get("jobSha256") != job_fingerprint(job):
        return False
    if require_approval and metrics.get("visualQa", {}).get("status") != "human-approved":
        return False
    return True


def outputs_valid(job: dict, source: Path, destinations: list[Path]) -> bool:
    if not destinations:
        return True
    if not metrics_match(job, source, require_approval=bool(job.get("extract"))):
        return False
    expected_size = tuple(int(value) for value in job.get("runtimeSize", [512, 512]))
    for path in destinations:
        if not path.exists() or not 0 < path.stat().st_size <= MAX_RUNTIME_BYTES:
            return False
        try:
            with Image.open(path) as image:
                image.verify()
            with Image.open(path) as image:
                if image.size != expected_size:
                    return False
                if job.get("extract") and image.convert("RGBA").getchannel("A").getextrema()[0] == 255:
                    return False
        except (OSError, ValueError):
            return False
    return True


def cell_boxes(
    size: tuple[int, int], columns: int, rows: int
) -> list[tuple[int, int, int, int]]:
    width, height = size
    return [
        (
            round((index % columns) * width / columns),
            round((index // columns) * height / rows),
            round((index % columns + 1) * width / columns),
            round((index // columns + 1) * height / rows),
        )
        for index in range(columns * rows)
    ]


def split_cells(image: Image.Image, job: dict) -> list[Image.Image]:
    layout = job.get("layout", {})
    columns, rows = int(layout["columns"]), int(layout["rows"])
    return [image.crop(box) for box in cell_boxes(image.size, columns, rows)]


def layout_component_cells(image: Image.Image, job: dict) -> list[Image.Image]:
    """Assign complete alpha components to their nearest declared grid cell.

    Layered often preserves every object but shifts it slightly across an
    invisible source-cell boundary. Component assignment keeps the complete
    cutout while retaining the source sheet's reading-order contract.
    """
    rgba, _cleanup = clean_alpha_components(image)
    alpha = rgba.getchannel("A")
    width, height = rgba.size
    values = alpha.tobytes()
    core = bytearray(value >= 24 for value in values)
    seen = bytearray(width * height)
    layout = job["layout"]
    columns, rows = int(layout["columns"]), int(layout["rows"])
    groups: list[list[int]] = [[] for _ in range(columns * rows)]
    minimum = max(24, int(width * height * 0.00008))

    for start in range(width * height):
        if not core[start] or seen[start]:
            continue
        seen[start] = 1
        queue = deque([start])
        component: list[int] = []
        x_total = 0
        y_total = 0
        while queue:
            index = queue.popleft()
            component.append(index)
            x, y = index % width, index // width
            x_total += x
            y_total += y
            for neighbor in (index - 1, index + 1, index - width, index + width):
                if neighbor < 0 or neighbor >= width * height:
                    continue
                if neighbor == index - 1 and x == 0:
                    continue
                if neighbor == index + 1 and x == width - 1:
                    continue
                if seen[neighbor] or not core[neighbor]:
                    continue
                seen[neighbor] = 1
                queue.append(neighbor)
        if len(component) < minimum:
            continue
        center_x = x_total / len(component) / width
        center_y = y_total / len(component) / height
        target = min(
            range(columns * rows),
            key=lambda index: (
                center_x - ((index % columns) + 0.5) / columns
            ) ** 2
            + (
                center_y - ((index // columns) + 0.5) / rows
            ) ** 2,
        )
        groups[target].extend(component)

    cells: list[Image.Image] = []
    original_alpha = rgba.getchannel("A").tobytes()
    for component_pixels in groups:
        keep = bytearray(width * height)
        for index in component_pixels:
            keep[index] = 255
        expanded = Image.frombytes("L", (width, height), bytes(keep)).filter(
            ImageFilter.MaxFilter(7)
        )
        expanded_values = expanded.tobytes()
        cell_alpha = bytes(
            opacity if expanded_values[index] else 0
            for index, opacity in enumerate(original_alpha)
        )
        cell = rgba.copy()
        cell.putalpha(Image.frombytes("L", (width, height), cell_alpha))
        cells.append(cell)
    return cells


def mean_visible_saturation(image: Image.Image) -> float:
    rgba = image.convert("RGBA")
    hsv = rgba.convert("RGB").convert("HSV")
    alpha = rgba.getchannel("A").tobytes()
    saturation = hsv.getchannel("S").tobytes()
    visible = [value for value, opacity in zip(saturation, alpha) if opacity > ALPHA_FLOOR]
    if not visible:
        return 0.0
    return round(sum(visible) * 100 / (255 * len(visible)), 3)


def inspect_layer_candidate(
    data: bytes,
    source_image: Image.Image,
    job: dict,
    destinations: list[Path],
) -> dict:
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("Layered layer_2 result is not a PNG")
    layer = floor_alpha(Image.open(io.BytesIO(data)))
    source_ratio = source_image.width / source_image.height
    layer_ratio = layer.width / layer.height
    if abs(layer_ratio - source_ratio) / source_ratio > 0.02:
        raise ValueError(
            f"Layered aspect {layer_ratio:.4f} differs from source {source_ratio:.4f}"
        )

    gates = job.get("qualityGates", {})
    supported_gates = {
        "allowHorizontalEdge",
        "minimumMeanSaturation",
        "minimumAlphaFill",
        "minimumAlphaFillById",
        "requireTransparentCenter",
        "transparentCenterIds",
    }
    unknown_gates = set(gates) - supported_gates
    if unknown_gates:
        raise ValueError(f"unsupported quality gates: {sorted(unknown_gates)}")
    allow_horizontal_edge = bool(gates.get("allowHorizontalEdge"))
    minimum_saturation = gates.get("minimumMeanSaturation")
    minimum_fill_for_all = gates.get("minimumAlphaFill")
    minimum_fill_by_id = gates.get("minimumAlphaFillById", {})
    full_metrics = alpha_stats(layer)
    names = job.get("layout", {}).get("ids", [job["id"]])
    cells = (
        split_cells(layer, job)
        if job.get("layoutStrategy") == "grid"
        else layout_component_cells(layer, job)
        if job.get("layout")
        else [layer]
    )
    if len(names) != len(cells) or len(cells) != len(destinations):
        raise ValueError(
            f"{len(names)} names, {len(cells)} cells, and "
            f"{len(destinations)} destinations differ"
        )

    require_center = set(gates.get("transparentCenterIds", []))
    if gates.get("requireTransparentCenter"):
        require_center.add(job["id"])
    results = {}
    for name, cell in zip(names, cells):
        cleaned, cleanup = clean_alpha_components(cell)
        try:
            metrics = validate_cutout(
                cleaned,
                name,
                require_center_hole=name in require_center,
                allow_horizontal_edge=allow_horizontal_edge,
            )
            metrics["meanVisibleSaturation"] = mean_visible_saturation(cleaned)
            if (
                minimum_saturation is not None
                and metrics["meanVisibleSaturation"] < float(minimum_saturation)
            ):
                raise ValueError(
                    f"{name}: mean saturation {metrics['meanVisibleSaturation']} "
                    f"is below {minimum_saturation}"
                )
            minimum_fill = minimum_fill_by_id.get(name, minimum_fill_for_all)
            if minimum_fill is not None and metrics["alphaFill"] < float(minimum_fill):
                raise ValueError(
                    f"{name}: alpha fill {metrics['alphaFill']} is below {minimum_fill}"
                )
            metrics["componentCleanup"] = cleanup
            results[name] = {"image": cleaned, "metrics": metrics, "error": None}
        except Exception as error:
            results[name] = {
                "image": cleaned,
                "metrics": alpha_stats(cleaned),
                "error": str(error),
            }
    return {
        "layer": layer,
        "fullMetrics": full_metrics,
        "names": names,
        "cells": results,
    }


def extract_job(base_url: str, plan: dict, job: dict, args: argparse.Namespace) -> None:
    source = SOURCE_ROOT / job["output"]
    destinations = runtime_destinations(job)
    if not source.exists():
        raise FileNotFoundError(f"missing source for {job['id']}: {source}")
    if not destinations:
        return
    if outputs_valid(job, source, destinations) and not args.force:
        print(f"skip {job['id']} (valid runtime output)", flush=True)
        return

    print(f"extract {job['id']} -> {len(destinations)} runtime file(s)", flush=True)
    if args.dry_run:
        return

    source_image = Image.open(source).convert("RGBA")
    runtime_size = tuple(int(value) for value in job.get("runtimeSize", [512, 512]))
    record = {
        "format": "qlobe-local-extraction-recipe",
        "formatVersion": 1,
        "assetId": job["id"],
        "source": str(source.relative_to(GAME_ROOT)),
        "sourceSha256": sha256_bytes(source.read_bytes()),
        "jobSha256": job_fingerprint(job),
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "runtime": [],
    }

    if not job.get("extract"):
        output = fit(
            source_image,
            runtime_size,
            cover=job.get("runtimeFit") == "cover",
        )
        encoding = encode_runtime(output, destinations[0], transparent=False)
        record["runtime"].append(
            {"path": str(destinations[0].relative_to(GAME_ROOT)), **encoding}
        )
        atomic_json(QA_ROOT / f"{job['id']}-metrics.json", record)
        return

    if not base_url:
        raise SystemExit("Set QLOBE_QWEN_URL or configure tools/state/local.json")

    layer_path = LAYER_ROOT / f"{job['id']}.layer2.png"
    preferred_seed = int(
        job.get("extractionSeed", job.get("seed", plan["seedLadder"][0]))
    )
    seeds = (
        [args.seed]
        if args.seed is not None
        else list(
            dict.fromkeys(
                [preferred_seed, *job.get("extractionSeeds", plan["seedLadder"])]
            )
        )
    )
    names = job.get("layout", {}).get("ids", [job["id"]])
    selected_cells: dict[str, dict] = {}
    candidate_summaries = []
    sheet_size = None

    def consider(inspected: dict, provenance: dict) -> None:
        nonlocal sheet_size
        sheet_size = inspected["layer"].size
        summary = {**provenance, "fullAlpha": inspected["fullMetrics"], "cells": {}}
        for name in inspected["names"]:
            result = inspected["cells"][name]
            summary["cells"][name] = {
                "accepted": result["error"] is None,
                "error": result["error"],
                "alpha": result["metrics"],
            }
            if (
                result["error"] is None
                and name not in selected_cells
                and name not in job.get("cellSources", {})
                and name not in job.get("individualCells", [])
            ):
                selected_cells[name] = {
                    "image": result["image"],
                    "metrics": result["metrics"],
                    **provenance,
                }
        candidate_summaries.append(summary)

    if layer_path.exists() and not args.force and metrics_match(
        job, source, require_approval=True
    ):
        print(f"validate {layer_path.relative_to(GAME_ROOT)}", flush=True)
        try:
            consider(
                inspect_layer_candidate(
                    layer_path.read_bytes(), source_image, job, destinations
                ),
                {"source": str(layer_path.relative_to(GAME_ROOT)), "reused": True},
            )
        except Exception as error:
            candidate_summaries.append(
                {"source": str(layer_path.relative_to(GAME_ROOT)), "error": str(error)}
            )

    forced_individual = set(job.get("individualCells", [])) | set(
        job.get("cellSources", {})
    )
    broad_seeds = [] if set(names).issubset(forced_individual) else seeds
    for seed in broad_seeds:
        if len(selected_cells) == len(names):
            break
        print(f"layer {job['id']} seed={seed}", flush=True)
        candidate_path = LAYER_ROOT / f"{job['id']}-seed{seed}.layer2.png"
        try:
            if candidate_path.exists() and not args.force:
                layer_bytes = candidate_path.read_bytes()
                remote_job_id = None
                selected_method = "cached-layer_2"
                print(f"reuse {candidate_path.relative_to(GAME_ROOT)}", flush=True)
            else:
                remote_job_id, layer_bytes, selected_method = submit_layered(
                    base_url, job, source, seed
                )
                atomic_write(candidate_path, layer_bytes)
            raw_candidate = floor_alpha(Image.open(io.BytesIO(layer_bytes)))
            save_png(
                magenta_composite(raw_candidate),
                QA_ROOT / f"{job['id']}-seed{seed}-magenta.png",
            )
            consider(
                inspect_layer_candidate(layer_bytes, source_image, job, destinations),
                {
                    "seed": seed,
                    "jobId": remote_job_id,
                    "source": str(candidate_path.relative_to(GAME_ROOT)),
                    "reusedCandidate": remote_job_id is None,
                    "selectedMethod": selected_method,
                },
            )
        except Exception as error:
            candidate_summaries.append({"seed": seed, "error": str(error)})
            print(f"reject layer {job['id']} seed={seed}: {error}", flush=True)

    # A contact-sheet pass may omit one subject while cleanly extracting its
    # siblings. Keep those accepted cells, then ask Layered to isolate each
    # missing subject by name and source-grid position from the complete sheet.
    missing = [name for name in names if name not in selected_cells]
    if missing and job.get("layout"):
        source_cells = split_cells(source_image, job)
        source_by_name = dict(zip(names, source_cells))
        for name in missing:
            slice_path = SOURCE_ROOT / "slices" / job["id"] / f"{name}.png"
            source_cell = source_by_name[name]
            source_box = job.get("cellSourceBoxes", {}).get(name)
            if source_box:
                if len(source_box) != 4:
                    raise ValueError(
                        f"{job['id']}/{name} cellSourceBoxes entry must have 4 values"
                    )
                source_cell = source_image.crop(tuple(int(value) for value in source_box))
            source_padding = job.get("cellSourcePadding", {}).get(
                name, job.get("slicePadding")
            )
            if source_padding:
                if len(source_padding) != 4:
                    raise ValueError(
                        f"{job['id']}/{name} source padding must have 4 values"
                    )
                source_cell = ImageOps.expand(
                    source_cell,
                    border=tuple(int(value) for value in source_padding),
                    fill=source_cell.getpixel((0, 0)),
                )
            save_png(source_cell, slice_path)
            cell_job = dict(job)
            grid_fallback = job.get("layoutStrategy") == "grid"
            if grid_fallback:
                cell_job["id"] = name
                cell_job.pop("layout", None)
                cell_job.pop("layoutStrategy", None)
                cell_job.pop("runtimeDir", None)
                cell_job.pop("extractPrompt", None)
                cell_prompt = job.get("cellExtractPrompts", {}).get(name)
                if cell_prompt:
                    cell_job["extractPrompt"] = cell_prompt
                alternate_source = job.get("cellSources", {}).get(name)
                model_source = (
                    SOURCE_ROOT / alternate_source if alternate_source else slice_path
                )
                if not model_source.exists():
                    raise FileNotFoundError(
                        f"missing fallback source for {job['id']}/{name}: "
                        f"{model_source}"
                    )
                inspection_source = Image.open(model_source).convert("RGBA")
                inspection_destinations = [destinations[names.index(name)]]
                fallback_kind = (
                    "slice-"
                    + hashlib.sha256(
                        (cell_prompt or "").encode() + model_source.read_bytes()
                    ).hexdigest()[:10]
                    if cell_prompt or alternate_source
                    else "slice"
                )
            else:
                cell_prompt = job.get("cellExtractPrompts", {}).get(name)
                cell_job["extractPrompt"] = cell_prompt or (
                    "Layer 1: the complete original sheet and every object except "
                    f"the {name.replace('-', ' ')}. Layer 2: only the one complete "
                    f"original {name.replace('-', ' ')} from its declared grid "
                    "position, on true transparency. Preserve its exact source "
                    "shape, color, texture, holes, shadow, position, and scale. "
                    "Do not redraw, crop, merge, add, or include any other object."
                )
                model_source = source
                inspection_source = source_image
                inspection_destinations = destinations
                fallback_kind = "target-" + hashlib.sha256(
                    cell_job["extractPrompt"].encode() + source.read_bytes()
                ).hexdigest()[:10]
            for seed in seeds:
                print(f"layer {job['id']}/{name} seed={seed}", flush=True)
                candidate_path = (
                    LAYER_ROOT
                    / f"{job['id']}-{name}-{fallback_kind}-seed{seed}.layer2.png"
                )
                try:
                    if candidate_path.exists() and not args.force:
                        layer_bytes = candidate_path.read_bytes()
                        remote_job_id = None
                        selected_method = "cached-layer_2"
                    else:
                        remote_job_id, layer_bytes, selected_method = submit_layered(
                            base_url, cell_job, model_source, seed
                        )
                        atomic_write(candidate_path, layer_bytes)
                    raw_candidate = floor_alpha(Image.open(io.BytesIO(layer_bytes)))
                    save_png(
                        magenta_composite(raw_candidate),
                        QA_ROOT / f"{job['id']}-{name}-seed{seed}-magenta.png",
                    )
                    inspected = inspect_layer_candidate(
                        layer_bytes,
                        inspection_source,
                        cell_job,
                        inspection_destinations,
                    )
                    result = inspected["cells"][name]
                    provenance = {
                        "seed": seed,
                        "jobId": remote_job_id,
                        "source": str(candidate_path.relative_to(GAME_ROOT)),
                        "individualFallback": True,
                        "selectedMethod": selected_method,
                    }
                    candidate_summaries.append(
                        {
                            **provenance,
                            "cell": name,
                            "accepted": result["error"] is None,
                            "error": result["error"],
                            "alpha": result["metrics"],
                        }
                    )
                    if result["error"] is None:
                        selected_cells[name] = {
                            "image": result["image"],
                            "metrics": result["metrics"],
                            **provenance,
                        }
                        break
                except Exception as error:
                    candidate_summaries.append(
                        {"cell": name, "seed": seed, "error": str(error)}
                    )

    missing = [name for name in names if name not in selected_cells]
    if missing:
        raise RuntimeError(
            f"{job['id']} has no accepted Layered cell for {missing}: "
            f"{candidate_summaries}"
        )

    if job.get("layout"):
        columns = int(job["layout"]["columns"])
        rows = int(job["layout"]["rows"])
        if not sheet_size:
            ratio = source_image.width / source_image.height
            sheet_size = (
                (1024, max(1, round(1024 / ratio)))
                if ratio >= 1
                else (max(1, round(1024 * ratio)), 1024)
            )
        layer = Image.new("RGBA", sheet_size, (0, 0, 0, 0))
        boxes = cell_boxes(sheet_size, columns, rows)
        for name, (left, top, right, bottom) in zip(names, boxes):
            cell = fit(selected_cells[name]["image"], (right - left, bottom - top))
            layer.alpha_composite(cell, (left, top))
    else:
        layer = selected_cells[names[0]]["image"]

    allow_horizontal_edge = bool(
        job.get("qualityGates", {}).get("allowHorizontalEdge")
    )
    full_metrics = validate_cutout(
        layer, job["id"], allow_horizontal_edge=allow_horizontal_edge
    )
    save_png(layer, layer_path)
    save_png(magenta_composite(layer), QA_ROOT / f"{job['id']}-magenta.png")
    cell_metrics = {
        name: {
            **selected_cells[name]["metrics"],
            "selectedSeed": selected_cells[name].get("seed"),
            "selectedJobId": selected_cells[name].get("jobId"),
            "selectedSource": selected_cells[name].get("source"),
            "individualFallback": bool(selected_cells[name].get("individualFallback")),
            "selectedMethod": selected_cells[name].get("selectedMethod"),
        }
        for name in names
    }

    finalized: list[Image.Image] = []
    for name, destination in zip(names, destinations):
        cell = selected_cells[name]["image"]
        trimmed = trim_with_padding(cell)
        output = fit(trimmed, runtime_size)
        encoding = encode_runtime(output, destination, transparent=True)
        finalized.append(output)
        record["runtime"].append(
            {"id": name, "path": str(destination.relative_to(GAME_ROOT)), **encoding}
        )

    save_contact_sheet(
        job["id"], names, finalized, int(job.get("layout", {}).get("columns", 1))
    )
    record.update(
        {
            "workflow": "qwen-image-layered",
            "jobIds": sorted({
                cell.get("jobId") for cell in selected_cells.values() if cell.get("jobId")
            }),
            "seeds": sorted({
                cell.get("seed") for cell in selected_cells.values() if cell.get("seed") is not None
            }),
            "selectedOutput": "layer_2 or Qwen layer_0-minus-layer_2 matte",
            "prompt": extraction_prompt(job),
            "layer": str(layer_path.relative_to(GAME_ROOT)),
            "sourceSize": list(source_image.size),
            "layerSize": list(layer.size),
            "alphaFloor": ALPHA_FLOOR,
            "fullAlpha": full_metrics,
            "cells": cell_metrics,
            "candidates": candidate_summaries,
            "visualQa": {
                "magenta": str((QA_ROOT / f"{job['id']}-magenta.png").relative_to(GAME_ROOT)),
                "contact": str((QA_ROOT / f"{job['id']}-contact.png").relative_to(GAME_ROOT)),
                "status": "pending-human-review",
            },
        }
    )
    atomic_json(QA_ROOT / f"{job['id']}-metrics.json", record)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--only", help="extract one plan job id")
    parser.add_argument("--seed", type=int, help="pin one Layered seed")
    parser.add_argument("--force", action="store_true", help="replace runtime output")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument(
        "--curate-hub",
        action="store_true",
        help="explicitly permit replacing the shared home-hub tile",
    )
    parser.add_argument("--api-url", help="override configured local API base URL")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    plan = json.loads(PLAN_PATH.read_text())
    jobs = plan.get("jobs", [])
    known_ids = {job["id"] for job in jobs}
    if args.only and args.only not in known_ids:
        raise SystemExit(f"unknown job id: {args.only}")

    selected = [job for job in jobs if not args.only or job["id"] == args.only]
    for job in selected:
        layout = job.get("layout", {})
        names = layout.get("ids", [])
        if names and len(names) != int(layout["columns"]) * int(layout["rows"]):
            raise ValueError(f"{job['id']}: layout id count does not match grid")
        if job["id"] == "hub-tile" and not args.curate_hub:
            print("skip hub-tile (pass --curate-hub after visual approval)", flush=True)
            continue

    base_url = configured_base_url(args.api_url)
    for job in selected:
        if job["id"] == "hub-tile" and not args.curate_hub:
            continue
        extract_job(base_url, plan, job, args)


if __name__ == "__main__":
    main()
