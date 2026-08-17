#!/usr/bin/env python3
"""Extract every transparent Name Puzzle master with LAN Qwen Image Layered.

Despite the historical filename, this is the authoritative extraction driver
for all twenty characters and the transparent UI masters. The letter-sheet
cells are cropped and background-normalized by Qwen Image Edit before their
individual Layered jobs; the panel and navigation sheets are cropped only after
Qwen returns their authoritative alpha. The returned ``layer_2`` RGBA PNG is
the sole matte authority: this tool never
flood-fills, chroma-keys, grows, repairs, or reconstructs a silhouette.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import io
import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

GAME = Path(__file__).resolve().parents[1]
ROOT = GAME.parents[1]
SOURCE = GAME / "assets" / "source"
MASTERS = SOURCE / "gpt-image-2"
LAYERED = SOURCE / "layered"
NORMALIZED = SOURCE / "normalized"
QA = SOURCE / "qa-layered"
STATE = ROOT / "tools" / "state" / "local.json"
JOBS_FILE = SOURCE / "qwen-jobs.json"
PENDING_FILE = SOURCE / "qwen-pending-jobs.json"
REPORT_FILE = SOURCE / "qwen-layer-report.json"
REJECTIONS_FILE = SOURCE / "qwen-layer-rejections.json"
SEED = 42
LETTER_SEEDS = (1337, 42, 9001)
GENERAL_SEEDS = (42, 1337, 9001)
NORMALIZE_SEED = 42

CHARACTERS = [
    "belle", "emma", "luna", "sofia", "aria", "hazel", "nora", "lily", "ellie", "lucy",
    "liam", "noah", "james", "henry", "lucas", "mateo", "levi", "jack", "owen", "ezra",
]

UI_SPECS = {
    "title": (
        "title-master.png",
        "the exact complete Name Puzzle felt title lockup, including every letter and its outline",
    ),
    "name-board": (
        "name-board-master.png",
        "the one complete cream-and-lavender stitched felt name board",
    ),
    "star-medal": (
        "star-medal-master.png",
        "the one complete felt star medal, including its pleated ribbon and every ribbon tail",
    ),
    "panel-kit": (
        "panel-kit-master.png",
        "the exact complete set of all six separate blank stitched felt panels, with every panel fully present",
    ),
    "navigation-kit": (
        "navigation-kit-master.png",
        "the exact complete set of all five separate felt navigation controls, including every icon and control edge",
    ),
}

LETTER_KEYS = "letter-red letter-orange letter-yellow letter-green letter-teal letter-sky letter-lavender letter-slot".split()
LETTER_SUBJECTS = {
    key: f"the complete {key.removeprefix('letter-')} stitched felt square letter tile"
    for key in LETTER_KEYS
}

SPECS = {
    **{
        name: (
            f"{name}-master.png",
            f"the exact complete illustrated {name} character, including every limb, accessory, "
            "hair or fur tip, and costume edge",
        )
        for name in CHARACTERS
    },
    **UI_SPECS,
    **{key: ("letter-kit-master.png", LETTER_SUBJECTS[key]) for key in LETTER_KEYS},
}


def letter_cell(key: str) -> Image.Image:
    master = MASTERS / "letter-kit-master.png"
    index = LETTER_KEYS.index(key)
    column, row = index % 4, index // 4
    with Image.open(master) as image:
        return image.crop((
            column * image.width // 4,
            row * image.height // 2,
            (column + 1) * image.width // 4,
            (row + 1) * image.height // 2,
        ))


def source_for(key: str, *, create: bool = True) -> Path:
    filename, _ = SPECS[key]
    master = MASTERS / filename
    if key not in LETTER_KEYS:
        return master
    slices = SOURCE / "slices"
    path = slices / f"{key}.png"
    if not path.is_file():
        if not create:
            raise RuntimeError(f"{key}: committed deterministic source slice is missing")
        slices.mkdir(parents=True, exist_ok=True)
        letter_cell(key).save(path)
    return path


def api_base(explicit: str | None) -> str:
    state = {}
    try:
        state = json.loads(STATE.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return (explicit or os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")


def seed_candidates(key: str, override: int | None) -> tuple[int, ...]:
    if override is not None:
        return (override,)
    return LETTER_SEEDS if key in LETTER_KEYS else GENERAL_SEEDS


def next_seed(key: str, current: int, override: int | None) -> int | None:
    candidates = seed_candidates(key, override)
    try:
        index = candidates.index(current)
    except ValueError:
        return candidates[0]
    return candidates[index + 1] if index + 1 < len(candidates) else None


def extraction_prompt(key: str, subject: str) -> str:
    if key in LETTER_KEYS:
        return (
            "Layer 1 is every grey background pixel and the grey cast shadow. "
            f"Layer 2 is only {subject}, with true transparent alpha everywhere outside the felt tile."
        )
    return (
        "Layer 1 is only the complete dark-charcoal background, including every background pixel and cast shadow. "
        f"Layer 2 must be {subject} alone on true transparency. "
        "Preserve the exact input pixels, identity, silhouette, colors, facial features, text, layout, "
        "felt texture, stitching, scale, and lighting. Keep all foreground parts fully present. "
        "Do not redraw, redesign, crop, rearrange, add, remove, repair, extend, or invent anything. "
        "Everything outside the named foreground objects must be fully transparent; retain no charcoal bands, halos, "
        "rectangles, floor, cast shadow, or background residue."
    )


def normalize_background(key: str, api: str, force: bool = False) -> tuple[str, Path]:
    """Use Qwen Image Edit to present a plain ground to Layered.

    Simple blank tiles are otherwise sometimes returned as an opaque composite.
    Image Edit prepares the presentation, while Image Layered remains the sole
    authority for every output alpha value.
    """
    source = source_for(key)
    NORMALIZED.mkdir(parents=True, exist_ok=True)
    destination = NORMALIZED / f"{key}.png"
    if destination.is_file() and not force:
        return key, destination
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    prompt = (
        "Change only the background outside the single foreground felt tile to a perfectly flat, "
        "uniform medium grey (#777777), edge to edge. Preserve the foreground tile exactly: identical "
        "pixels, color, texture, stitching, shape, scale, placement, and lighting. Do not redraw, resize, "
        "crop, repair, add, remove, or alter the tile. No gradient, texture, floor, horizon, halo, cast "
        "shadow, reflection, border, or extra object."
    )
    proc = subprocess.run(
        [
            "curl", "-sS", "--fail-with-body", "-X", "POST",
            f"{api}/workflows/qwen-image-edit?sync=true",
            "-F", f"image=@{source}",
            "-F", f"prompt={prompt}",
            "-F", f"seed={NORMALIZE_SEED}",
            "--output", str(temporary),
            "--max-time", "900",
        ],
        capture_output=True,
        text=True,
        timeout=930,
        check=False,
    )
    if proc.returncode or not temporary.is_file() or temporary.stat().st_size < 20_000:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"{key}: Qwen Image Edit background normalization failed")
    try:
        with Image.open(temporary) as opened:
            opened.verify()
    except Exception as error:
        temporary.unlink(missing_ok=True)
        raise RuntimeError(f"{key}: Qwen Image Edit returned a non-image") from error
    temporary.replace(destination)
    print(f"{key}: background normalized by Qwen Image Edit", flush=True)
    return key, destination


def layer_input_for(key: str) -> Path:
    return NORMALIZED / f"{key}.png" if key in LETTER_KEYS else source_for(key)


def submit(key: str, api: str, seed: int) -> tuple[str, str]:
    filename, subject = SPECS[key]
    source = layer_input_for(key)
    if not source.is_file():
        raise RuntimeError(f"{key}: missing Layered input")
    proc = subprocess.run(
        [
            "curl", "-sS", "--fail-with-body", "-X", "POST",
            f"{api}/workflows/qwen-image-layered",
            "-F", f"image=@{source}",
            "-F", f"prompt={extraction_prompt(key, subject)}",
            "-F", "layers=2",
            "-F", f"seed={seed}",
            "--max-time", "300",
        ],
        capture_output=True,
        text=True,
        timeout=330,
        check=False,
    )
    if proc.returncode:
        raise RuntimeError(f"{key}: submission failed (curl exit {proc.returncode})")
    try:
        payload = json.loads(proc.stdout or "{}")
    except json.JSONDecodeError as error:
        raise RuntimeError(f"{key}: invalid submission response") from error
    job = payload.get("job_id") or payload.get("id")
    if not job:
        raise RuntimeError(f"{key}: Qwen returned no job id")
    return key, str(job)


def read_json(url: str, timeout: int = 60) -> dict:
    with urllib.request.urlopen(url, timeout=timeout) as response:
        return json.load(response)


def download(api: str, job: str) -> bytes:
    with urllib.request.urlopen(f"{api}/jobs/{job}/result?output=layer_2", timeout=300) as response:
        return response.read()


def validate_layer(
    key: str,
    data: bytes,
    *,
    write_preview: bool = True,
    seed: int = SEED,
    accepted_job_id: str | None = None,
    create_source: bool = True,
) -> dict:
    filename, _ = SPECS[key]
    try:
        with Image.open(io.BytesIO(data)) as opened:
            image_format = opened.format
            source_bands = opened.getbands()
            image = opened.convert("RGBA")
    except Exception as error:
        raise RuntimeError(f"{key}: layer_2 is not a readable image") from error
    if image_format != "PNG" or "A" not in source_bands:
        raise RuntimeError(f"{key}: layer_2 must be an RGBA PNG")

    source = source_for(key, create=create_source)
    if key in LETTER_KEYS:
        with Image.open(source) as committed_slice:
            slice_image = committed_slice.convert("RGB")
        expected_slice = letter_cell(key).convert("RGB")
        if slice_image.size != expected_slice.size or ImageChops.difference(slice_image, expected_slice).getbbox():
            raise RuntimeError(f"{key}: committed source slice differs from its deterministic master crop")
    master = Image.open(source).convert("RGB")
    master_size = master.size
    source_ratio = master.width / master.height
    layer_ratio = image.width / image.height
    ratio_drift = abs(source_ratio - layer_ratio) / source_ratio
    if ratio_drift > 0.02:
        raise RuntimeError(
            f"{key}: layer aspect ratio drift {ratio_drift:.3%} exceeds 2%"
        )
    if image.size != master.size:
        master = master.resize(image.size, Image.Resampling.LANCZOS)

    alpha = image.getchannel("A")
    values = alpha.tobytes()
    total = len(values)
    corners = [
        alpha.getpixel((0, 0)),
        alpha.getpixel((image.width - 1, 0)),
        alpha.getpixel((0, image.height - 1)),
        alpha.getpixel((image.width - 1, image.height - 1)),
    ]
    transparent = sum(value < 16 for value in values) / total
    opaque = sum(value >= 224 for value in values) / total
    bbox = alpha.point(lambda value: 255 if value >= 24 else 0).getbbox()
    if max(corners) > 16 or transparent < 0.03 or opaque < 0.005 or not bbox:
        raise RuntimeError(
            f"{key}: alpha QA failed (corners={corners}, transparent={transparent:.3f}, opaque={opaque:.3f})"
        )
    coverage = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]) / total
    if not 0.02 <= coverage <= 0.99:
        raise RuntimeError(f"{key}: implausible alpha bbox coverage {coverage:.3f}")

    core = alpha.point(lambda value: 255 if value >= 224 else 0)
    difference = ImageChops.difference(image.convert("RGB"), master)
    channel_means = ImageStat.Stat(difference, core).mean
    core_mae = sum(channel_means) / len(channel_means)
    if core_mae > 36:
        raise RuntimeError(f"{key}: foreground drift is too high (core RGB MAE {core_mae:.2f})")

    if write_preview:
        QA.mkdir(parents=True, exist_ok=True)
        preview = Image.new("RGBA", image.size, (255, 0, 200, 255))
        preview.alpha_composite(image)
        preview.convert("RGB").save(QA / f"{key}-magenta.png")
    return {
        "workflow": "qwen-image-layered",
        "selectedOutput": "layer_2",
        "seed": seed,
        "source": str(source.relative_to(SOURCE)),
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "rawLayer": f"layered/{key}.layer2.png",
        "rawLayerSha256": hashlib.sha256(data).hexdigest(),
        "layerInput": str(layer_input_for(key).relative_to(SOURCE)),
        "sourceSize": list(master_size),
        "size": list(image.size),
        "cornerAlpha": corners,
        "transparentPct": round(transparent * 100, 3),
        "opaqueCorePct": round(opaque * 100, 3),
        "bbox": list(bbox),
        "bboxCoverage": round(coverage, 4),
        "aspectRatioDriftPct": round(ratio_drift * 100, 3),
        "coreRgbMaeVsMaster": round(core_mae, 3),
        "matteAuthority": "Qwen layer_2; no flood fill, chroma key, or silhouette repair",
        **({
            "preparationWorkflow": "qwen-image-edit",
            "preparationSeed": NORMALIZE_SEED,
        } if key in LETTER_KEYS else {}),
        **({"acceptedJobId": accepted_job_id} if accepted_job_id else {}),
    }


def write_layer(key: str, data: bytes, seed: int, job_id: str) -> dict:
    report = validate_layer(key, data, seed=seed, accepted_job_id=job_id)
    LAYERED.mkdir(parents=True, exist_ok=True)
    destination = LAYERED / f"{key}.layer2.png"
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    temporary.write_bytes(data)
    temporary.replace(destination)
    return report


def load_jobs(path: Path) -> dict:
    try:
        value = json.loads(path.read_text())
        return value if isinstance(value, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def write_json(path: Path, value: object) -> None:
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--qwen-url")
    parser.add_argument("--only", nargs="*", choices=sorted(SPECS))
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--no-finalize", action="store_true")
    args = parser.parse_args()
    selected = args.only or list(SPECS)
    print("\n".join(selected))
    if args.dry_run:
        return
    if args.check:
        failures = []
        try:
            receipts = json.loads(REPORT_FILE.read_text())
            job_receipts = json.loads(JOBS_FILE.read_text())
        except (FileNotFoundError, json.JSONDecodeError) as error:
            raise RuntimeError(f"missing or invalid Qwen receipts: {error}") from error
        pending_receipts = load_jobs(PENDING_FILE)
        if not args.only and set(receipts) != set(SPECS):
            failures.append("layer report key set does not match the 33 required sources")
        if not args.only and set(job_receipts) != set(SPECS):
            failures.append("job receipt key set does not match the 33 required sources")
        if pending_receipts:
            failures.append(f"unfinished Qwen jobs remain: {sorted(pending_receipts)}")
        for key in selected:
            path = LAYERED / f"{key}.layer2.png"
            try:
                receipt = receipts.get(key, {})
                job_receipt = job_receipts.get(key, {})
                current = validate_layer(
                    key,
                    path.read_bytes(),
                    write_preview=False,
                    seed=int(receipt.get("seed", SEED)),
                    accepted_job_id=receipt.get("acceptedJobId"),
                    create_source=False,
                )
                if receipt.get("rawLayerSha256") != current["rawLayerSha256"]:
                    raise RuntimeError("stored raw-layer checksum does not match")
                if receipt.get("sourceSha256") != current["sourceSha256"]:
                    raise RuntimeError("stored source checksum does not match")
                if receipt.get("workflow") != "qwen-image-layered" or receipt.get("selectedOutput") != "layer_2":
                    raise RuntimeError("stored workflow provenance is invalid")
                accepted_job_id = receipt.get("acceptedJobId")
                if (
                    not isinstance(job_receipt, dict)
                    or not isinstance(accepted_job_id, str)
                    or len(accepted_job_id) != 32
                    or any(character not in "0123456789abcdef" for character in accepted_job_id)
                    or accepted_job_id != job_receipt.get("jobId")
                    or receipt.get("seed") != job_receipt.get("seed")
                ):
                    raise RuntimeError("stored job receipt is invalid")
            except Exception as error:
                failures.append(f"{key}: {error}")
        print(f"Qwen layer check: {len(selected) - len(failures)}/{len(selected)}")
        if failures:
            raise RuntimeError("; ".join(failures))
        return

    api = api_base(args.qwen_url)
    if not api:
        raise RuntimeError("a LAN Qwen endpoint is required via --qwen-url, QLOBE_QWEN_URL, or tools/state/local.json")
    workers = max(1, min(4, args.workers))
    reports = {}
    try:
        previous_reports = json.loads(REPORT_FILE.read_text())
        if isinstance(previous_reports, dict):
            reports.update({key: value for key, value in previous_reports.items() if key in SPECS})
    except (FileNotFoundError, json.JSONDecodeError):
        pass

    jobs = {}
    for key, value in load_jobs(JOBS_FILE).items():
        if key not in SPECS:
            continue
        if isinstance(value, dict) and value.get("jobId"):
            jobs[key] = {
                "jobId": str(value["jobId"]),
                "seed": int(value.get("seed", seed_candidates(key, args.seed)[0])),
            }
        elif isinstance(value, str):
            jobs[key] = {
                "jobId": value,
                "seed": int(reports.get(key, {}).get("seed", seed_candidates(key, args.seed)[0])),
            }
    pending_records = {}
    for key, value in load_jobs(PENDING_FILE).items():
        if key in SPECS and isinstance(value, dict) and value.get("jobId"):
            pending_records[key] = {
                "jobId": str(value["jobId"]),
                "seed": int(value.get("seed", seed_candidates(key, args.seed)[0])),
            }
    try:
        loaded_rejections = json.loads(REJECTIONS_FILE.read_text())
        rejections = loaded_rejections if isinstance(loaded_rejections, dict) else {}
    except (FileNotFoundError, json.JSONDecodeError):
        rejections = {}

    pending: dict[str, dict] = {}
    fresh = []
    for key in selected:
        existing = LAYERED / f"{key}.layer2.png"
        if existing.is_file() and not args.force:
            prior_seed = int(reports.get(key, {}).get("seed", SEED))
            accepted_job_id = reports.get(key, {}).get("acceptedJobId") or jobs.get(key, {}).get("jobId")
            reports[key] = validate_layer(
                key,
                existing.read_bytes(),
                seed=prior_seed,
                accepted_job_id=accepted_job_id,
            )
            print(f"{key}: reused validated layer", flush=True)
        elif key in pending_records and not args.force:
            pending[key] = pending_records[key]
        elif key in jobs and not args.force:
            pending[key] = jobs[key]
        else:
            fresh.append(key)

    letter_fresh = [key for key in fresh if key in LETTER_KEYS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        list(executor.map(lambda item: normalize_background(item, api, args.force), letter_fresh))

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        initial = ((item, seed_candidates(item, args.seed)[0]) for item in fresh)
        for key, job in executor.map(lambda item: submit(item[0], api, item[1]), initial):
            record = {"jobId": job, "seed": seed_candidates(key, args.seed)[0]}
            pending[key] = record
            pending_records[key] = record
            print(f"{key}: submitted (seed {record['seed']})", flush=True)
    write_json(PENDING_FILE, pending_records)

    deadline = time.time() + 7200
    terminal_failures = {}
    while pending and time.time() < deadline:
        for key, record in list(pending.items()):
            job = record["jobId"]
            seed = int(record["seed"])
            state = read_json(f"{api}/jobs/{job}", timeout=60)
            status = state.get("status")
            problem = None
            if status == "completed":
                try:
                    reports[key] = write_layer(key, download(api, job), seed, job)
                except Exception as error:
                    problem = str(error)
                else:
                    del pending[key]
                    pending_records.pop(key, None)
                    jobs[key] = record
                    write_json(REPORT_FILE, reports)
                    write_json(JOBS_FILE, jobs)
                    write_json(PENDING_FILE, pending_records)
                    print(f"{key}: layer_2 accepted (seed {seed})", flush=True)
            elif status in {"failed", "error", "cancelled", "canceled"}:
                problem = f"Qwen job ended with status {status}"

            if problem is not None:
                rejections.setdefault(key, []).append({
                    "jobId": job,
                    "seed": seed,
                    "reason": problem,
                })
                write_json(REJECTIONS_FILE, rejections)
                retry_seed = next_seed(key, seed, args.seed)
                if retry_seed is None:
                    terminal_failures[key] = problem
                    del pending[key]
                    pending_records.pop(key, None)
                    write_json(PENDING_FILE, pending_records)
                    print(f"{key}: rejected seed {seed}; no candidates remain", flush=True)
                else:
                    _, retry_job = submit(key, api, retry_seed)
                    retry_record = {"jobId": retry_job, "seed": retry_seed}
                    pending[key] = retry_record
                    pending_records[key] = retry_record
                    write_json(PENDING_FILE, pending_records)
                    print(f"{key}: rejected seed {seed}; submitted seed {retry_seed}", flush=True)
        if pending:
            time.sleep(8)
    if pending:
        raise TimeoutError(f"Qwen extraction timed out for {sorted(pending)}")
    if terminal_failures:
        write_json(REPORT_FILE, reports)
        raise RuntimeError(f"Qwen extraction exhausted candidates: {terminal_failures}")
    write_json(REPORT_FILE, reports)

    if not args.no_finalize:
        missing = [key for key in SPECS if not (LAYERED / f"{key}.layer2.png").is_file()]
        if missing:
            raise RuntimeError(f"cannot finalize until every layered source exists; missing {missing}")
        subprocess.run([sys.executable, str(GAME / "tools" / "finalize-assets.py")], check=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"ERROR: {error}", file=sys.stderr)
        raise SystemExit(1)
