#!/usr/bin/env python3
"""World Music Dance — accept instrument one-shots into the shared library.

This is the acceptance half of the pipeline whose generation half is
gen-instruments.py (which deliberately never touches shared/). It ingests two
kinds of material:

  * approved LTX candidates already trimmed/normalized by gen-instruments.py
    (clean wavs in assets/source/gen/instruments/final/), and
  * human-sourced clean single-note recordings dropped in a folder outside the
    repo (default: the 00-reference instruments/world drop).

For every item it: converts to 16-bit 44.1 kHz mono -> finds the onset ->
trims (tonal max 1.5 s, perc max 0.8 s) with a 30 ms fade -> RMS-normalizes to
~-18 dBFS (peak ceiling -0.5 dBFS) -> measures baseMidi by autocorrelation
(tonal only) -> encodes AAC m4a into shared/assets/instruments/ -> merges the
entry into shared/assets/instruments/manifest.json (existing entries are never
touched). A QA table prints at the end; review it before committing.

Sourced items already shorter than the trim ceiling just get the fade +
normalize. Approved gen items skip re-trimming entirely (they are final).

Usage:
    python3.11 games/world-music-dance/tools/ingest-sourced-instruments.py \
        [--source /path/to/wav-drop] [--dry-run] [--only sitar bodhran]

Requires numpy and ffmpeg/ffprobe on PATH.
"""

from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

try:
    import numpy as np
except Exception:  # noqa: BLE001
    sys.exit("numpy is required — run with a python that has it (e.g. python3.11)")

GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
GEN_FINAL = GAME / "assets" / "source" / "gen" / "instruments" / "final"
SHARED = REPO / "shared" / "assets" / "instruments"
MANIFEST = SHARED / "manifest.json"

DEFAULT_SOURCE = REPO.parent / "00-reference" / "instruments" / "world"

TARGET_RMS = 0.1259     # ~ -18 dBFS (matches gen-instruments.py)
PEAK_CEILING = 0.94     # ~ -0.5 dBFS
FADE_MS = 30
MAX_DUR_TONAL = 1.5
MAX_DUR_PERC = 0.8

# Approved gen-instruments.py candidates (session 2026-07-30): the manifest id
# is the group name; the file keeps its variant suffix for provenance. All four
# are role perc — taiko was measured as pitched by gen-instruments.py but the
# bands use it as a drum (it plays the songs' perc pattern, never the melody).
APPROVED_GEN = [
    {"id": "agogo",  "wav": "agogo-b.wav",  "file": "agogo-b.m4a"},
    {"id": "djembe", "wav": "djembe-b.wav", "file": "djembe-b.m4a"},
    {"id": "tabla",  "wav": "tabla-a.wav",  "file": "tabla-a.m4a"},
    {"id": "taiko",  "wav": "taiko.wav",    "file": "taiko.m4a"},
]

# Human-sourced clean notes. Registers are the plausible baseMidi window for
# the QA sanity flag only — nothing is auto-rejected.
SOURCED = [
    {"id": "berimbau",      "src": "berimbau.wav",           "role": "perc",  "family": "perc"},
    {"id": "bodhran",       "src": "Bodhrán.wav",            "role": "perc",  "family": "perc"},
    {"id": "fiddle",        "src": "Fiddle.wav",             "role": "tonal", "family": "strings", "register": (55, 93)},
    {"id": "fontomfrom",    "src": "Fontomfrom.wav",         "role": "perc",  "family": "perc"},
    {"id": "guitarron",     "src": "Guitarrón-Mexicano.wav", "role": "tonal", "family": "strings", "register": (26, 50)},
    {"id": "koto",          "src": "Koto.wav",               "role": "tonal", "family": "strings", "register": (50, 80)},
    {"id": "sarangi",       "src": "Sarangi.wav",            "role": "tonal", "family": "strings", "register": (48, 76)},
    {"id": "shamisen",      "src": "Shamisen.wav",           "role": "tonal", "family": "strings", "register": (48, 76)},
    {"id": "sitar",         "src": "Sitar.wav",              "role": "tonal", "family": "strings", "register": (48, 76)},
    {"id": "tin-whistle",   "src": "tin-whistle.wav",        "role": "tonal", "family": "wind",    "register": (70, 98)},
    {"id": "uilleann-pipes", "src": "Uilleann-Pipes.wav",    "role": "tonal", "family": "wind",    "register": (57, 86)},
    {"id": "vihuela",       "src": "Vihuela-Mexicana.wav",   "role": "tonal", "family": "strings", "register": (50, 78)},
]


# ---------------------------------------------------------------- audio utils

def ffmpeg_to_mono16(src: Path, dst: Path) -> None:
    subprocess.run(
        ["ffmpeg", "-y", "-v", "quiet", "-i", str(src),
         "-ac", "1", "-ar", "44100", "-sample_fmt", "s16", str(dst)], check=True)


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


def read_wav_mono(path: Path):
    with wave.open(str(path), "rb") as wf:
        sr = wf.getframerate()
        raw = wf.readframes(wf.getnframes())
        sampwidth = wf.getsampwidth()
        channels = wf.getnchannels()
    if sampwidth != 2:
        raise RuntimeError(f"{path}: expected 16-bit PCM, got {sampwidth * 8}-bit")
    data = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if channels > 1:
        data = data.reshape(-1, channels).mean(axis=1)
    return data, sr


def write_wav_mono(path: Path, samples, sr: int) -> None:
    ints = (np.clip(samples, -1.0, 1.0) * 32767.0).astype("<i2")
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
    env, idx = [], []
    for start in range(0, n - win, win):
        chunk = samples[start:start + win]
        env.append(float(np.sqrt(np.mean(chunk ** 2))))
        idx.append(start)
    env = np.array(env)
    if env.size == 0:
        return 0
    noise_floor = float(np.median(env[:max(1, len(env) // 10)]))
    threshold = max(noise_floor * 3.0, float(env.max()) * 0.08)
    above = np.where(env > threshold)[0]
    onset_idx = idx[int(above[0])] if above.size else 0
    return max(0, onset_idx - int(sr * 0.010))


def count_attack_clusters(samples, sr: int, window_ms: float = 5.0) -> int:
    win = max(1, int(sr * window_ms / 1000))
    n = len(samples)
    if n <= win:
        return 1 if n else 0
    env = np.array([float(np.sqrt(np.mean(samples[s:s + win] ** 2)))
                    for s in range(0, n - win, win)])
    if env.size == 0:
        return 0
    threshold = max(float(np.median(env)) * 2.0, float(env.max()) * 0.2)
    clusters, prev = 0, False
    for v in env > threshold:
        if v and not prev:
            clusters += 1
        prev = v
    return clusters


def trim_and_fade(samples, sr: int, onset: int, max_dur_s: float):
    end = min(len(samples), onset + int(sr * max_dur_s))
    clip = samples[onset:end].copy()
    fade_len = min(len(clip), int(sr * FADE_MS / 1000))
    if fade_len > 0:
        clip[-fade_len:] *= np.linspace(1.0, 0.0, fade_len)
    return clip


def normalize_rms(samples):
    rms = float(np.sqrt(np.mean(samples ** 2))) if samples.size else 0.0
    if rms <= 1e-9:
        return samples, 0.0
    gain = TARGET_RMS / rms
    peak = float(np.max(np.abs(samples))) * gain
    if peak > PEAK_CEILING:
        gain *= PEAK_CEILING / peak
    return samples * gain, gain


def peak_dbfs(samples) -> float:
    peak = float(np.max(np.abs(samples))) if samples.size else 0.0
    return round(20 * math.log10(peak), 2) if peak > 1e-9 else -120.0


def autocorrelation_pitch(samples, sr: int, fmin: float = 40.0, fmax: float = 1400.0):
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
    confidence = max(0.0, min(1.0, float(corr[peak_i]) / (float(corr[0]) or 1.0)))
    freq = sr / peak_i
    midi = 69 + 12 * math.log2(freq / 440.0)
    return round(midi, 2), round(confidence, 3)


# ---------------------------------------------------------------- ingest core

def process(samples, sr, role: str, retrim: bool):
    """Trim/fade/normalize; returns (clip, qa_notes_list)."""
    notes = []
    if retrim:
        onset = find_onset(samples, sr)
        max_dur = MAX_DUR_TONAL if role == "tonal" else MAX_DUR_PERC
        clip = trim_and_fade(samples, sr, onset, max_dur)
    else:
        clip = samples.copy()
    clip, gain = normalize_rms(clip)
    if abs(gain - 1.0) > 0.5:
        notes.append(f"gain x{gain:.2f}")
    return clip, notes


def ingest_item(item, wav_src: Path, retrim: bool, dry_run: bool, report: list, manifest: dict):
    iid = item["id"]
    out_file = item.get("file", f"{iid}.m4a")
    role = item.get("role", "perc")
    family = item.get("family", "perc")

    with tempfile.TemporaryDirectory() as td:
        mono = Path(td) / "mono.wav"
        clean = Path(td) / "clean.wav"
        ffmpeg_to_mono16(wav_src, mono)
        samples, sr = read_wav_mono(mono)
        clip, notes = process(samples, sr, role, retrim)

        qa = {
            "id": iid, "file": out_file, "role": role, "family": family,
            "durS": round(len(clip) / sr, 3),
            "peakDb": peak_dbfs(clip),
            "attacks": count_attack_clusters(clip, sr),
            "baseMidi": None, "conf": None, "notes": notes,
        }
        if qa["attacks"] > 1:
            notes.append(f"{qa['attacks']} attack clusters")
        if role == "tonal":
            base_midi, conf = autocorrelation_pitch(clip, sr)
            qa["baseMidi"], qa["conf"] = base_midi, conf
            if base_midi is None:
                notes.append("PITCH NOT DETECTED")
            else:
                if conf < 0.5:
                    notes.append("low pitch confidence")
                reg = item.get("register")
                if reg and not (reg[0] <= base_midi <= reg[1]):
                    notes.append(f"pitch outside expected register {reg}")

        if not dry_run:
            write_wav_mono(clean, clip, sr)
            SHARED.mkdir(parents=True, exist_ok=True)
            ffmpeg_encode_m4a(clean, SHARED / out_file)
            dur = ffprobe_duration(SHARED / out_file) or qa["durS"]
            entry = {"files": [{"file": out_file, "dur": dur}]}
            if role == "tonal":
                bm = qa["baseMidi"]
                entry["baseMidi"] = int(round(bm)) if bm is not None and abs(bm - round(bm)) < 0.1 else bm
            entry["role"] = role
            entry["family"] = family
            manifest[iid] = entry
        report.append(qa)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, default=DEFAULT_SOURCE,
                    help="folder of sourced clean-note wavs")
    ap.add_argument("--only", nargs="*", default=[], help="substring filter on ids")
    ap.add_argument("--dry-run", action="store_true", help="analyze and report only; write nothing")
    args = ap.parse_args()

    def wanted(iid: str) -> bool:
        return not args.only or any(o.lower() in iid for o in args.only)

    manifest = json.loads(MANIFEST.read_text()) if MANIFEST.exists() else {}
    report: list[dict] = []

    for item in APPROVED_GEN:
        if not wanted(item["id"]):
            continue
        wav = GEN_FINAL / item["wav"]
        if not wav.exists():
            print(f"!! missing approved wav: {wav}")
            continue
        # already trimmed by gen-instruments.py — normalize + measure only
        ingest_item({**item, "role": "perc", "family": "perc"}, wav,
                    retrim=False, dry_run=args.dry_run, report=report, manifest=manifest)

    for item in SOURCED:
        if not wanted(item["id"]):
            continue
        wav = args.source / item["src"]
        if not wav.exists():
            print(f"!! missing sourced wav: {wav}")
            continue
        ingest_item(item, wav, retrim=True, dry_run=args.dry_run, report=report, manifest=manifest)

    if not args.dry_run and report:
        MANIFEST.write_text(json.dumps(manifest, indent=1) + "\n")

    print(f"\n{'id':<15}{'file':<20}{'role':<7}{'dur':>6}{'peakDb':>8}{'atk':>4}{'baseMidi':>9}{'conf':>6}  notes")
    for qa in report:
        print(f"{qa['id']:<15}{qa['file']:<20}{qa['role']:<7}{qa['durS']:>6}{qa['peakDb']:>8}"
              f"{qa['attacks']:>4}{str(qa['baseMidi']):>9}{str(qa['conf']):>6}  {'; '.join(qa['notes'])}")
    if args.dry_run:
        print("\n(dry run — nothing written)")
    else:
        print(f"\nwrote {len(report)} samples + manifest -> {MANIFEST}")


if __name__ == "__main__":
    main()
