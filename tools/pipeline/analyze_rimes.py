#!/usr/bin/env python3
"""Acoustic vowel check for VC rime clips: extract the onset-vowel F1/F2 of
each rime for our clips and for phoneme-exact Kokoro references, classify
each rime's vowel within its OWN speaker's normalized vowel space (avoids
cross-voice bias), and flag rimes whose vowel doesn't match the expected one.
Writes analysis.json for an A/B review page.

This is an APPROXIMATE prioritization aid -- the ear is the decider.

Ported from tools/content-pipeline/analyze_rimes.py (predecessor repo,
hardcoded paths). Not a server dependency: this is a DOCUMENTED OPTIONAL
tool, meant to run from its own venv. It needs numpy + parselmouth
(praat-parselmouth), which are NOT stdlib and are NOT installed by default.

    python3 -m venv .venv-analyze
    source .venv-analyze/bin/activate
    pip install numpy praat-parselmouth
    .venv-analyze/bin/python3 tools/pipeline/analyze_rimes.py --root <content-root>

--help works even without those packages installed (imports are guarded and
argparse handles --help before any dependency is touched). Running the tool
for real without them prints the install recipe above and exits 2.

No network calls -- this only reads local audio files and shells out to
ffmpeg for resampling.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile

try:
    import numpy as np
    import parselmouth
    HAVE_DEPS = True
except ImportError:
    HAVE_DEPS = False

RIMES = ["at", "an", "ap", "ag", "am", "ad", "ab", "ax", "ak", "ed", "eg", "em", "en", "et", "eb",
         "ig", "in", "ip", "it", "ix", "ib", "id", "og", "op", "ot", "ox", "ob", "od", "om",
         "un", "up", "ug", "ub", "ud", "um", "ut", "us"]
VOWEL = {**{r: 'a' for r in ["at", "an", "ap", "ag", "am", "ad", "ab", "ax", "ak"]},
         **{r: 'e' for r in ["ed", "eg", "em", "en", "et", "eb"]},
         **{r: 'i' for r in ["ig", "in", "ip", "it", "ix", "ib", "id"]},
         **{r: 'o' for r in ["og", "op", "ot", "ox", "ob", "od", "om"]},
         **{r: 'u' for r in ["un", "up", "ug", "ub", "ud", "um", "ut", "us"]}}


def build_parser():
    p = argparse.ArgumentParser(
        description="Acoustic F1/F2 vowel QA: compare our rime clips against phoneme-exact "
                    "Kokoro references and flag likely mispronunciations.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    p.add_argument("--root", default=os.getcwd(), help="repo/content root")
    p.add_argument("--ours-dir", default=None,
                   help="dir of our clips, e.g. <rime>.m4a (default <root>/assets/audio/fragments)")
    p.add_argument("--kokoro-dir", default=None,
                   help="dir of phoneme-exact reference clips (default <root>/assets/audio/ref_kokoro)")
    p.add_argument("--tmp-dir", default=None,
                   help="scratch dir for resampled wavs (default a tempfile subdir)")
    p.add_argument("--ffmpeg", default=None, help="ffmpeg binary (default: search PATH)")
    return p


def to_wav(ffmpeg, src, dst):
    subprocess.run([ffmpeg, "-y", "-loglevel", "error", "-i", src,
                    "-ac", "1", "-ar", "16000", dst], capture_output=True)


def onset_vowel(path):
    """Median F1/F2 over the first sufficiently-long voiced+plausible run (the
    vowel leads a VC rime). Returns (f1,f2) or None if not confidently found."""
    snd = parselmouth.Sound(path)
    pitch = snd.to_pitch(time_step=0.005)
    form = snd.to_formant_burg(time_step=0.005, max_number_of_formants=5,
                               maximum_formant=5500, window_length=0.025, pre_emphasis_from=50)
    tg = np.arange(snd.xmin, snd.xmax, 0.005)
    rows = []
    for t in tg:
        if (pitch.get_value_at_time(t) or 0) > 0:
            f1 = form.get_value_at_time(1, t)
            f2 = form.get_value_at_time(2, t)
            if f1 == f1 and f2 == f2 and 250 < f1 < 1300 and 700 < f2 < 2700 and f2 > f1 + 150:
                rows.append((t, f1, f2))
    if len(rows) < 3:
        return None
    rows = np.array(rows)
    # split into runs (gap > 20ms), take the FIRST run that is >= 60ms
    runs, s = [], 0
    for i in range(1, len(rows)):
        if rows[i, 0] - rows[i - 1, 0] > 0.02:
            runs.append((s, i))
            s = i
    runs.append((s, len(rows)))
    pick = next((r for r in runs if (rows[r[1] - 1, 0] - rows[r[0], 0]) >= 0.06),
                max(runs, key=lambda r: r[1] - r[0]))
    seg = rows[pick[0]:pick[1]]
    k = len(seg)
    seg = seg[int(k * 0.2):max(int(k * 0.2) + 1, int(k * 0.8))]  # central 60%
    return float(np.median(seg[:, 1])), float(np.median(seg[:, 2]))


def measure(ffmpeg, folder, tmp_dir):
    out = {}
    for r in RIMES:
        src = os.path.join(folder, f"{r}.m4a")
        if not os.path.exists(src):
            out[r] = None
            continue
        w = os.path.join(tmp_dir, f"{os.path.basename(folder)}_{r}.wav")
        to_wav(ffmpeg, src, w)
        out[r] = onset_vowel(w)
    return out


def zspace(meas):
    """Per-speaker z-normalized (F1,F2) so vowel positions are comparable across
    voices without absolute-formant bias. Returns {rime:(zf1,zf2)}."""
    pts = {r: v for r, v in meas.items() if v}
    if len(pts) < 5:
        return {}
    F1 = np.array([v[0] for v in pts.values()])
    F2 = np.array([v[1] for v in pts.values()])
    m1, s1, m2, s2 = F1.mean(), F1.std() + 1e-6, F2.mean(), F2.std() + 1e-6
    return {r: ((v[0] - m1) / s1, (v[1] - m2) / s2) for r, v in pts.items()}


def run_analysis(args):
    tmp_dir = args.tmp_dir or os.path.join(tempfile.gettempdir(), "qlobe-rime-wav")
    os.makedirs(tmp_dir, exist_ok=True)
    ffmpeg = args.ffmpeg or "ffmpeg"

    our = measure(ffmpeg, args.ours_dir, tmp_dir)
    kok = measure(ffmpeg, args.kokoro_dir, tmp_dir)
    ourz, kokz = zspace(our), zspace(kok)

    report = {}
    for r in RIMES:
        o, k = our.get(r), kok.get(r)
        delta = None
        if r in ourz and r in kokz:
            oz, kz = ourz[r], kokz[r]
            delta = round(((oz[0] - kz[0]) ** 2 + (oz[1] - kz[1]) ** 2) ** 0.5, 2)
        report[r] = {
            "expected_vowel": VOWEL[r],
            "our_f1": round(o[0]) if o else None, "our_f2": round(o[1]) if o else None,
            "kok_f1": round(k[0]) if k else None, "kok_f2": round(k[1]) if k else None,
            "delta": delta,  # higher = our vowel sits further from the reference
            "measured": delta is not None,
        }

    deltas = sorted([report[r]["delta"] for r in RIMES if report[r]["delta"] is not None])
    thr = deltas[int(len(deltas) * 0.75)] if deltas else 0
    for r in RIMES:
        d = report[r]
        d["hint"] = ("review" if d["delta"] is None else ("check" if d["delta"] >= thr else "ok"))

    out_path = os.path.join(args.kokoro_dir, "analysis.json")
    with open(out_path, "w") as f:
        json.dump(report, f, indent=2)

    ranked = sorted([r for r in RIMES if report[r]["delta"] is not None], key=lambda r: -report[r]["delta"])
    na = [r for r in RIMES if report[r]["delta"] is None]
    print("rimes analyzed:", len(RIMES), "| deviation threshold (check-first):", round(thr, 2))
    print("most-deviant (check first):", [(r, report[r]["delta"]) for r in ranked[:8]])
    print("least-deviant (likely fine):", [(r, report[r]["delta"]) for r in ranked[-6:]])
    print("could not measure (ear only):", na or "none")
    print("wrote", out_path)
    return 0


def main():
    parser = build_parser()
    args = parser.parse_args()

    if not HAVE_DEPS:
        print("ERROR: analyze_rimes.py needs numpy + parselmouth (praat-parselmouth), "
              "which are not stdlib and are not installed.", file=sys.stderr)
        print("Install into an optional venv:", file=sys.stderr)
        print("  python3 -m venv .venv-analyze", file=sys.stderr)
        print("  source .venv-analyze/bin/activate", file=sys.stderr)
        print("  pip install numpy praat-parselmouth", file=sys.stderr)
        return 2

    args.ours_dir = args.ours_dir or os.path.join(args.root, "assets", "audio", "fragments")
    args.kokoro_dir = args.kokoro_dir or os.path.join(args.root, "assets", "audio", "ref_kokoro")

    if not os.path.isdir(args.ours_dir) or not os.path.isdir(args.kokoro_dir):
        print(f"clip dirs not found (ours: {args.ours_dir}, kokoro: {args.kokoro_dir})")
        print("Nothing to analyze -- pass --ours-dir / --kokoro-dir at real clip directories.")
        return 1

    return run_analysis(args)


if __name__ == "__main__":
    sys.exit(main())
