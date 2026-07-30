#!/usr/bin/env python3
"""World Music Dance — LTX one-shot instrument-sample experiment.

Time-boxed, structurally optional (config.json's `bandFallback` covers every
culture, so a rejected or skipped sample never blocks shipping). For each
candidate this walks: LTX-2.3 single-strike video clip -> extract audio ->
`vocal-separator` (keep the instrumental, drop any room hiss the model sang)
-> trim to one onset-to-decay one-shot -> loudness-normalize -> (tonal only)
measure baseMidi by autocorrelation -> encode AAC m4a.

This script NEVER writes into shared/assets/instruments/ — its output is a
proposed `manifest-snippet.json` (measured baseMidi/role/family per
candidate) plus a `qa-report.json` (duration, peak, pitch confidence,
spectral notes) under assets/source/gen/instruments/, for a human or a later
agent session to accept into the shared instrument manifest.

Candidates (verbatim prompt language from assets/source/PROMPTS.md):
  tonal, one file each   — sitar, koto, taiko, fiddle, tin-whistle
  perc pairs             — tabla-a/tabla-b, djembe-a/djembe-b, agogo-a/agogo-b

Pipeline per candidate item, each step idempotent (skips an existing output
>5KB unless --force/--reroll names it):
  1. ltx2-3 (sync) single-strike clip -> assets/source/gen/instruments/<name>.mp4
  2. ffmpeg -vn                        -> <name>.raw.wav
  3. vocal-separator (async job)       -> <name>.instrumental.wav
  4. onset-detect + trim + fade + RMS loudness-normalize (numpy) -> <name>.clean.wav
     tonal max 1.5s / perc max 0.8s from onset-minus-10ms, 30ms fade-out.
  5. ffmpeg aac 96k                    -> assets/source/gen/instruments/final/<name>.m4a

Regenerating step 1 (via --reroll) forces every downstream step for that item
so the m4a never drifts from a stale mp4.

Usage:
    export QLOBE_QWEN_URL=http://<host>:<port>
    python3 games/world-music-dance/tools/gen-instruments.py
    python3 games/world-music-dance/tools/gen-instruments.py --only sitar tabla
    python3 games/world-music-dance/tools/gen-instruments.py --reroll tabla-a
    python3 games/world-music-dance/tools/gen-instruments.py --reroll tabla-a:1

Seed ladder for the LTX clip is 42 -> 1337 (indices 0-1); state persists in
assets/source/gen/instruments/seed-state.json.

Requires numpy on PATH for steps 4-5 pitch/loudness analysis (guarded import
— `--help` and steps 1-3 work without it; a clear error prints if a later
step needs it and it's missing). Requires ffmpeg on PATH.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import subprocess
import sys
import time
import urllib.request
import wave
from pathlib import Path

try:
    import numpy as np
    HAVE_NUMPY = True
except Exception:  # noqa: BLE001
    HAVE_NUMPY = False

GAME = Path(__file__).resolve().parents[1]
GEN = GAME / "assets" / "source" / "gen" / "instruments"
FINAL = GEN / "final"

SEED_LADDER = [42, 1337]
STATE_PATH = GEN / "seed-state.json"
QA_PATH = GEN / "qa-report.json"
MANIFEST_SNIPPET_PATH = GEN / "manifest-snippet.json"

MIN_BYTES = 5 * 1024
TARGET_RMS = 0.1259     # ~ -18 dBFS
PEAK_CEILING = 0.94     # ~ -0.5 dBFS, never clip
FADE_MS = 30
MAX_DUR_TONAL = 1.5
MAX_DUR_PERC = 0.8

# --------------------------------------------------------------------------
# Prompt (verbatim pattern, assets/source/PROMPTS.md)
# --------------------------------------------------------------------------

PROMPT_TMPL = (
    "Close-up of {instrument}. A single clean {strike}, then silence. No music, "
    "no melody, no voice, no singing, one single note only, quiet room."
)

# --------------------------------------------------------------------------
# Candidates (verbatim strike descriptions, assets/source/PROMPTS.md)
# --------------------------------------------------------------------------

TONAL = [
    {"name": "sitar", "instrument": "sitar", "strike": "single plucked note", "family": "strings"},
    {"name": "koto", "instrument": "koto", "strike": "single plucked note", "family": "strings"},
    {"name": "taiko", "instrument": "taiko", "strike": "one deep drum strike", "family": "perc"},
    {"name": "fiddle", "instrument": "fiddle", "strike": "one short bowed note", "family": "strings"},
    {"name": "tin-whistle", "instrument": "tin whistle", "strike": "one short clear note", "family": "wind"},
]

PERC_PAIRS = [
    {"group": "tabla", "instrument": "tabla", "family": "perc",
     "variants": {"a": 'one open "na" hit', "b": 'one bass "ge" hit'}},
    {"group": "djembe", "instrument": "djembe", "family": "perc",
     "variants": {"a": "one open slap", "b": "one bass hit"}},
    {"group": "agogo", "instrument": "agogo bell", "family": "perc",
     "variants": {"a": "one high hit", "b": "one low hit"}},
]


def build_items() -> list[dict]:
    items = []
    for c in TONAL:
        items.append({
            "name": c["name"], "group": c["name"], "kind": "tonal",
            "instrument": c["instrument"], "strike": c["strike"], "family": c["family"],
            "variant": None,
        })
    for p in PERC_PAIRS:
        for variant, strike in p["variants"].items():
            items.append({
                "name": f"{p['group']}-{variant}", "group": p["group"], "kind": "perc",
                "instrument": p["instrument"], "strike": strike, "family": p["family"],
                "variant": variant,
            })
    return items


ITEMS = build_items()

# --------------------------------------------------------------------------
# HTTP plumbing
# --------------------------------------------------------------------------


def api(path: str) -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        sys.exit("QLOBE_QWEN_URL is not set (see .claude/skills/local-genai)")
    return f"{base}{path}"


def post_multipart(url: str, fields: dict, files: dict | None = None) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n"
            f"{value}\r\n"
        ).encode()
    for name, path in (files or {}).items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
            f"filename=\"{Path(path).name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).encode()
        body += Path(path).read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        url, data=bytes(body),
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return resp.read()


def get(url: str) -> bytes:
    with urllib.request.urlopen(url, timeout=900) as resp:
        return resp.read()


def ltx_generate(prompt: str, seed: int) -> bytes:
    return post_multipart(
        api("/workflows/ltx2-3?sync=true"),
        {"prompt": prompt, "duration": "5", "width": "768", "height": "512",
         "static_camera": "1", "seed": str(seed)})


def vocal_separate(wav_path: Path) -> bytes:
    """Async job flow — fetch output=instrumental once the job completes."""
    job = json.loads(post_multipart(
        api("/workflows/vocal-separator?sync=false"), {}, {"audio": str(wav_path)}))
    job_id = job.get("job_id")
    if not job_id:
        raise RuntimeError(f"no job id: {job}")
    for _ in range(60):
        time.sleep(5)
        state = json.loads(get(api(f"/jobs/{job_id}")))
        status = state.get("status")
        if status == "completed":
            return get(api(f"/jobs/{job_id}/result?output=instrumental"))
        if status in ("failed", "error"):
            raise RuntimeError(f"job {status}: {state.get('error')}")
    raise RuntimeError("job timed out")


# --------------------------------------------------------------------------
# ffmpeg / audio analysis
# --------------------------------------------------------------------------


def ffmpeg_extract_wav(mp4_path: Path, wav_path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-v", "quiet", "-i", str(mp4_path), "-vn",
         "-ac", "1", "-ar", "44100", str(wav_path)], check=True)


def ffmpeg_encode_m4a(wav_path: Path, m4a_path: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-v", "quiet", "-i", str(wav_path),
         "-c:a", "aac", "-b:a", "96k", str(m4a_path)], check=True)


def ffprobe_duration(path: Path) -> float | None:
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(path)], capture_output=True, text=True)
    try:
        return round(float(r.stdout.strip()), 3)
    except ValueError:
        return None


def _require_numpy() -> None:
    if not HAVE_NUMPY:
        sys.exit("numpy is required for trim/normalize/pitch steps — pip install numpy")


def read_wav_mono(path: Path):
    with wave.open(str(path), "rb") as wf:
        sr = wf.getframerate()
        n = wf.getnframes()
        sampwidth = wf.getsampwidth()
        channels = wf.getnchannels()
        raw = wf.readframes(n)
    if sampwidth != 2:
        raise RuntimeError(f"{path}: expected 16-bit PCM, got {sampwidth * 8}-bit")
    data = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data, sr


def write_wav_mono(path: Path, samples, sr: int) -> None:
    clipped = np.clip(samples, -1.0, 1.0)
    ints = (clipped * 32767.0).astype("<i2")
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(ints.tobytes())


def find_onset(samples, sr: int, window_ms: float = 5.0) -> int:
    win = max(1, int(sr * window_ms / 1000))
    n = len(samples)
    if n <= win:
        return 0
    env = []
    idx = []
    for start in range(0, n - win, win):
        chunk = samples[start:start + win]
        env.append(float(np.sqrt(np.mean(chunk ** 2))))
        idx.append(start)
    env = np.array(env)
    if env.size == 0:
        return 0
    noise_floor = float(np.median(env[:max(1, len(env) // 10)]))
    peak = float(env.max())
    threshold = max(noise_floor * 3.0, peak * 0.08)
    above = np.where(env > threshold)[0]
    onset_idx = idx[int(above[0])] if above.size else 0
    return max(0, onset_idx - int(sr * 0.010))


def count_attack_clusters(samples, sr: int, window_ms: float = 5.0) -> int:
    """Rough heuristic: contiguous above-threshold runs in the energy envelope."""
    win = max(1, int(sr * window_ms / 1000))
    n = len(samples)
    if n <= win:
        return 1 if n else 0
    env = np.array([float(np.sqrt(np.mean(samples[s:s + win] ** 2)))
                     for s in range(0, n - win, win)])
    if env.size == 0:
        return 0
    threshold = max(float(np.median(env)) * 2.0, float(env.max()) * 0.2)
    above = env > threshold
    clusters = 0
    prev = False
    for v in above:
        if v and not prev:
            clusters += 1
        prev = v
    return clusters


def trim_and_fade(samples, sr: int, onset: int, max_dur_s: float, fade_ms: float = FADE_MS):
    end = min(len(samples), onset + int(sr * max_dur_s))
    clip = samples[onset:end].copy()
    fade_len = min(len(clip), int(sr * fade_ms / 1000))
    if fade_len > 0:
        clip[-fade_len:] *= np.linspace(1.0, 0.0, fade_len)
    return clip


def normalize_rms(samples, target_rms: float = TARGET_RMS, peak_ceiling: float = PEAK_CEILING):
    rms = float(np.sqrt(np.mean(samples ** 2))) if samples.size else 0.0
    if rms <= 1e-9:
        return samples, 0.0
    gain = target_rms / rms
    peak = float(np.max(np.abs(samples))) * gain
    if peak > peak_ceiling:
        gain *= peak_ceiling / peak
    return samples * gain, gain


def peak_dbfs(samples) -> float:
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    return round(20 * math.log10(peak), 2) if peak > 1e-9 else -120.0


def spectral_centroid_hz(samples, sr: int) -> float:
    if samples.size < 32:
        return 0.0
    windowed = samples * np.hanning(len(samples))
    spec = np.abs(np.fft.rfft(windowed))
    freqs = np.fft.rfftfreq(len(samples), 1.0 / sr)
    total = float(spec.sum())
    if total <= 1e-9:
        return 0.0
    return round(float(np.sum(freqs * spec) / total), 1)


def autocorrelation_pitch(samples, sr: int, fmin: float = 60.0, fmax: float = 1200.0):
    """baseMidi + confidence over the sustained portion (skip the transient)."""
    n = len(samples)
    if n < sr * 0.02:
        return None, 0.0
    lo, hi = int(n * 0.2), int(n * 0.85)
    seg = samples[lo:hi] if hi > lo else samples
    seg = seg - float(np.mean(seg))
    if float(np.max(np.abs(seg))) < 1e-6:
        return None, 0.0
    corr = np.correlate(seg, seg, mode="full")
    corr = corr[len(corr) // 2:]
    min_lag = max(1, int(sr / fmax))
    max_lag = min(int(sr / fmin), len(corr) - 1)
    if max_lag <= min_lag:
        return None, 0.0
    window = corr[min_lag:max_lag]
    if window.size == 0:
        return None, 0.0
    peak_i = int(np.argmax(window)) + min_lag
    peak_val = float(corr[peak_i])
    norm = float(corr[0]) if corr[0] > 0 else 1.0
    confidence = max(0.0, min(1.0, peak_val / norm))
    if peak_i <= 0:
        return None, confidence
    freq = sr / peak_i
    if freq <= 0:
        return None, confidence
    midi = 69 + 12 * math.log2(freq / 440.0)
    return round(midi, 2), round(confidence, 3)


# --------------------------------------------------------------------------
# Seed ladder / resumability
# --------------------------------------------------------------------------


def load_json(path: Path) -> dict:
    if path.exists():
        try:
            return json.loads(path.read_text())
        except Exception:  # noqa: BLE001
            return {}
    return {}


def save_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n")


def parse_reroll(items: list[str]) -> dict:
    out = {}
    for item in items:
        if ":" in item:
            name, idx = item.split(":", 1)
            try:
                out[name] = int(idx)
            except ValueError:
                out[name] = None
        else:
            out[item] = None
    return out


def seed_for(name: str, state: dict, reroll: dict) -> int:
    if name in reroll:
        idx = reroll[name]
        if idx is None:
            idx = min(state.get(name, 0) + 1, len(SEED_LADDER) - 1)
        idx = max(0, min(idx, len(SEED_LADDER) - 1))
        state[name] = idx
    else:
        idx = state.get(name, 0)
    return SEED_LADDER[idx]


def matches_only(name: str, group: str, only: list[str]) -> bool:
    if not only:
        return True
    return any(o.lower() in name.lower() or o.lower() in group.lower() for o in only)


# --------------------------------------------------------------------------
# Per-candidate pipeline
# --------------------------------------------------------------------------


def process_item(item: dict, args, reroll: dict, state: dict, qa: dict, manifest: dict) -> str:
    name = item["name"]
    mp4 = GEN / f"{name}.mp4"
    raw_wav = GEN / f"{name}.raw.wav"
    instrumental_wav = GEN / f"{name}.instrumental.wav"
    clean_wav = GEN / f"{name}.clean.wav"
    m4a = FINAL / f"{name}.m4a"

    force_downstream = name in reroll

    # 1) LTX one-shot clip
    if force_downstream or args.force or not (mp4.exists() and mp4.stat().st_size > MIN_BYTES):
        seed = seed_for(name, state, reroll)
        prompt = PROMPT_TMPL.format(instrument=item["instrument"], strike=item["strike"])
        print(f"  [1/5] ltx2-3 {name} (seed {seed})")
        try:
            data = ltx_generate(prompt, seed)
            mp4.write_bytes(data)
            qa.setdefault(name, {})["seed"] = seed
            force_downstream = True
        except Exception as exc:  # noqa: BLE001
            print(f"    !! FAIL {name} (ltx2-3): {exc}")
            return "fail"
    else:
        print(f"  [1/5] skip {name} (mp4 exists)")

    # 2) extract audio
    if force_downstream or args.force or not (raw_wav.exists() and raw_wav.stat().st_size > 1024):
        print(f"  [2/5] extract audio {name}")
        try:
            ffmpeg_extract_wav(mp4, raw_wav)
        except Exception as exc:  # noqa: BLE001
            print(f"    !! FAIL {name} (ffmpeg extract): {exc}")
            return "fail"
    else:
        print(f"  [2/5] skip {name} (raw wav exists)")

    # 3) vocal-separator -> instrumental
    if force_downstream or args.force or not (instrumental_wav.exists() and instrumental_wav.stat().st_size > 1024):
        print(f"  [3/5] vocal-separator {name}")
        try:
            instrumental_wav.write_bytes(vocal_separate(raw_wav))
        except Exception as exc:  # noqa: BLE001
            print(f"    !! FAIL {name} (vocal-separator): {exc}")
            return "fail"
    else:
        print(f"  [3/5] skip {name} (instrumental exists)")

    # 4) trim + fade + normalize + measure
    if force_downstream or args.force or not (clean_wav.exists() and clean_wav.stat().st_size > 512):
        _require_numpy()
        print(f"  [4/5] trim/normalize/measure {name}")
        try:
            samples, sr = read_wav_mono(instrumental_wav)
            onset = find_onset(samples, sr)
            max_dur = MAX_DUR_TONAL if item["kind"] == "tonal" else MAX_DUR_PERC
            clip = trim_and_fade(samples, sr, onset, max_dur)
            clip, gain = normalize_rms(clip)
            write_wav_mono(clean_wav, clip, sr)
            entry = qa.setdefault(name, {})
            entry.update({
                "kind": item["kind"],
                "family": item["family"],
                "durationS": round(len(clip) / sr, 3),
                "onsetS": round(onset / sr, 3),
                "peakDb": peak_dbfs(clip),
                "gainApplied": round(gain, 3),
                "spectralCentroidHz": spectral_centroid_hz(clip, sr),
                "attackClusters": count_attack_clusters(clip, sr),
            })
            notes = []
            if entry["peakDb"] > -0.5:
                notes.append("near-clipping peak")
            if entry["durationS"] < 0.05:
                notes.append("very short — possible silence/room-tone only")
            if entry["attackClusters"] > 1:
                notes.append(f"{entry['attackClusters']} attack clusters — check for extra notes")
            if item["kind"] == "tonal":
                base_midi, confidence = autocorrelation_pitch(clip, sr)
                entry["baseMidi"] = base_midi
                entry["pitchConfidence"] = confidence
                if base_midi is None:
                    notes.append("pitch not detected")
                elif confidence < 0.5:
                    notes.append("low pitch confidence — reroll or reject")
            entry["notes"] = notes
            qa[name] = entry
        except Exception as exc:  # noqa: BLE001
            print(f"    !! FAIL {name} (trim/normalize): {exc}")
            return "fail"
    else:
        print(f"  [4/5] skip {name} (clean wav exists)")

    # 5) encode m4a
    FINAL.mkdir(parents=True, exist_ok=True)
    if force_downstream or args.force or not (m4a.exists() and m4a.stat().st_size > 1024):
        print(f"  [5/5] encode m4a {name}")
        try:
            ffmpeg_encode_m4a(clean_wav, m4a)
        except Exception as exc:  # noqa: BLE001
            print(f"    !! FAIL {name} (ffmpeg encode): {exc}")
            return "fail"
    else:
        print(f"  [5/5] skip {name} (m4a exists)")

    dur = ffprobe_duration(m4a) or qa.get(name, {}).get("durationS")
    file_entry = {"file": f"final/{name}.m4a", "dur": dur}

    if item["kind"] == "tonal":
        manifest[name] = {
            "files": [{"file": f"{name}.m4a", "dur": dur}],
            "baseMidi": qa.get(name, {}).get("baseMidi"),
            "role": "tonal",
            "family": item["family"],
            "qa": {
                "pitchConfidence": qa.get(name, {}).get("pitchConfidence"),
                "peakDb": qa.get(name, {}).get("peakDb"),
                "notes": qa.get(name, {}).get("notes", []),
                "acceptedSeed": qa.get(name, {}).get("seed"),
            },
        }
    else:
        group = item["group"]
        entry = manifest.setdefault(group, {
            "files": [], "role": "perc", "family": item["family"], "qa": {"variants": {}}})
        variant_file = f"{name}.m4a"
        entry["files"] = [f for f in entry["files"] if f["file"] != variant_file]
        entry["files"].append({"file": variant_file, "dur": dur})
        entry["files"].sort(key=lambda f: f["file"])
        entry["qa"]["variants"][item["variant"]] = {
            "peakDb": qa.get(name, {}).get("peakDb"),
            "notes": qa.get(name, {}).get("notes", []),
            "acceptedSeed": qa.get(name, {}).get("seed"),
        }

    return "ok"


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def print_summary(results: list[tuple[str, str]]) -> None:
    print()
    print("=== summary ===")
    if not results:
        print("(nothing processed)")
        return
    name_w = max(len(n) for n, _ in results) + 1
    ok = sum(1 for _, s in results if s == "ok")
    fail = sum(1 for _, s in results if s == "fail")
    for name, status in results:
        mark = "OK" if status == "ok" else "!!"
        print(f"  [{mark}] {name:<{name_w}} {status}")
    print(f"  {ok} ok, {fail} failed, {len(results)} total")
    print(f"  manifest snippet -> {MANIFEST_SNIPPET_PATH}")
    print(f"  qa report        -> {QA_PATH}")
    print("  NOTE: nothing was written to shared/assets/instruments/ — review and")
    print("        merge the accepted candidates by hand.")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", nargs="*", default=[], help="substring filter on item/group name")
    ap.add_argument("--force", action="store_true", help="regenerate every step even if outputs exist")
    ap.add_argument("--reroll", nargs="*", default=[],
                     help="name or name:seedIndex to bump the LTX seed ladder and force regen")
    args = ap.parse_args()

    GEN.mkdir(parents=True, exist_ok=True)
    reroll = parse_reroll(args.reroll)
    state = load_json(STATE_PATH)
    qa = load_json(QA_PATH)
    manifest = load_json(MANIFEST_SNIPPET_PATH)

    results = []
    for item in ITEMS:
        if not matches_only(item["name"], item["group"], args.only):
            continue
        print(f"--- {item['name']} ({item['kind']}) ---")
        status = process_item(item, args, reroll, state, qa, manifest)
        results.append((item["name"], status))
        save_json(STATE_PATH, state)
        save_json(QA_PATH, qa)
        save_json(MANIFEST_SNIPPET_PATH, manifest)

    print_summary(results)


if __name__ == "__main__":
    main()
