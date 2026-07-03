#!/usr/bin/env python3
"""Acoustic vowel check: extract the onset-vowel F1/F2 of each rime for our
clips and the Kokoro phoneme-exact references, classify each rime's vowel within
its OWN speaker's normalized vowel space (avoids cross-voice bias), and flag
rimes whose vowel doesn't match the expected one. Outputs analysis.json for the
A/B page. This is an APPROXIMATE prioritization aid — the ear is the decider."""
import os, json, subprocess
import numpy as np
import parselmouth

ROOT = "/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game"
OURS = f"{ROOT}/sound-sprouts/assets/audio/fragments"
KOK = f"{ROOT}/sound-sprouts/assets/audio/ref_kokoro"
TMP = "/tmp/rime_wav"
os.makedirs(TMP, exist_ok=True)

RIMES = ["at","an","ap","ag","am","ad","ab","ax","ak","ed","eg","em","en","et","eb",
         "ig","in","ip","it","ix","ib","id","og","op","ot","ox","ob","od","om",
         "un","up","ug","ub","ud","um","ut","us"]
VOWEL = {**{r:'a' for r in ["at","an","ap","ag","am","ad","ab","ax","ak"]},
         **{r:'e' for r in ["ed","eg","em","en","et","eb"]},
         **{r:'i' for r in ["ig","in","ip","it","ix","ib","id"]},
         **{r:'o' for r in ["og","op","ot","ox","ob","od","om"]},
         **{r:'u' for r in ["un","up","ug","ub","ud","um","ut","us"]}}

def to_wav(src, dst):
    subprocess.run(["/usr/local/bin/ffmpeg","-y","-loglevel","error","-i",src,
                    "-ac","1","-ar","16000",dst], capture_output=True)

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
            f1 = form.get_value_at_time(1, t); f2 = form.get_value_at_time(2, t)
            if f1 == f1 and f2 == f2 and 250 < f1 < 1300 and 700 < f2 < 2700 and f2 > f1 + 150:
                rows.append((t, f1, f2))
    if len(rows) < 3:
        return None
    rows = np.array(rows)
    # split into runs (gap > 20ms), take the FIRST run that is >= 60ms
    runs, s = [], 0
    for i in range(1, len(rows)):
        if rows[i, 0] - rows[i-1, 0] > 0.02:
            runs.append((s, i)); s = i
    runs.append((s, len(rows)))
    pick = next((r for r in runs if (rows[r[1]-1, 0]-rows[r[0], 0]) >= 0.06), max(runs, key=lambda r: r[1]-r[0]))
    seg = rows[pick[0]:pick[1]]
    k = len(seg)
    seg = seg[int(k*0.2):max(int(k*0.2)+1, int(k*0.8))]  # central 60%
    return float(np.median(seg[:, 1])), float(np.median(seg[:, 2]))

def measure(folder):
    out = {}
    for r in RIMES:
        src = f"{folder}/{r}.m4a"
        if not os.path.exists(src):
            out[r] = None; continue
        w = f"{TMP}/{os.path.basename(folder)}_{r}.wav"
        to_wav(src, w)
        out[r] = onset_vowel(w)
    return out

def classify_space(meas):
    """Per-speaker: z-normalize F1/F2, build per-vowel centroids (median over
    confidently-measured rimes), classify each rime to nearest centroid."""
    pts = {r: v for r, v in meas.items() if v}
    if len(pts) < 5:
        return {}, {}
    F1 = np.array([v[0] for v in pts.values()]); F2 = np.array([v[1] for v in pts.values()])
    m1, s1, m2, s2 = F1.mean(), F1.std()+1e-6, F2.mean(), F2.std()+1e-6
    norm = {r: ((v[0]-m1)/s1, (v[1]-m2)/s2) for r, v in pts.items()}
    cents = {}
    for vw in "aeiou":
        grp = [norm[r] for r in pts if VOWEL[r] == vw]
        if grp:
            cents[vw] = (float(np.median([g[0] for g in grp])), float(np.median([g[1] for g in grp])))
    cls = {}
    for r, p in norm.items():
        best = min(cents, key=lambda vw: (p[0]-cents[vw][0])**2 + (p[1]-cents[vw][1])**2)
        # margin: dist to expected centroid minus dist to nearest centroid (>=0 good)
        de = ((p[0]-cents[VOWEL[r]][0])**2 + (p[1]-cents[VOWEL[r]][1])**2)**0.5
        others = [vw for vw in cents if vw != VOWEL[r]]
        dn = min(((p[0]-cents[vw][0])**2 + (p[1]-cents[vw][1])**2)**0.5 for vw in others) if others else de
        cls[r] = {"class": best, "margin": round(dn - de, 2)}
    return cls, cents

our = measure(OURS); kok = measure(KOK)

def zspace(meas):
    """Per-speaker z-normalized (F1,F2) so vowel positions are comparable across
    voices without absolute-formant bias. Returns {rime:(zf1,zf2)}."""
    pts = {r: v for r, v in meas.items() if v}
    if len(pts) < 5: return {}
    F1 = np.array([v[0] for v in pts.values()]); F2 = np.array([v[1] for v in pts.values()])
    m1, s1, m2, s2 = F1.mean(), F1.std()+1e-6, F2.mean(), F2.std()+1e-6
    return {r: ((v[0]-m1)/s1, (v[1]-m2)/s2) for r, v in pts.items()}

ourz, kokz = zspace(our), zspace(kok)

report = {}
for r in RIMES:
    o, k = our.get(r), kok.get(r)
    # per-rime acoustic deviation: distance between our vowel and the phoneme-exact
    # reference's vowel, in each speaker's own normalized space (robust, no clustering)
    delta = None
    if r in ourz and r in kokz:
        oz, kz = ourz[r], kokz[r]
        delta = round(((oz[0]-kz[0])**2 + (oz[1]-kz[1])**2) ** 0.5, 2)
    report[r] = {
        "expected_vowel": VOWEL[r],
        "ipa": None,  # filled below
        "our_f1": round(o[0]) if o else None, "our_f2": round(o[1]) if o else None,
        "kok_f1": round(k[0]) if k else None, "kok_f2": round(k[1]) if k else None,
        "delta": delta,                       # higher = our vowel sits further from the reference
        "measured": delta is not None,
    }

# Mark the most-deviant measured rimes as "check first" (soft hint, top quartile),
# and unmeasured ones as "review by ear".
deltas = sorted([report[r]["delta"] for r in RIMES if report[r]["delta"] is not None])
thr = deltas[int(len(deltas)*0.75)] if deltas else 0
for r in RIMES:
    d = report[r]
    d["hint"] = ("review" if d["delta"] is None else ("check" if d["delta"] >= thr else "ok"))

json.dump(report, open(f"{KOK}/analysis.json", "w"), indent=2)
ranked = sorted([r for r in RIMES if report[r]["delta"] is not None], key=lambda r: -report[r]["delta"])
na = [r for r in RIMES if report[r]["delta"] is None]
print("rimes analyzed:", len(RIMES), "| deviation threshold (check-first):", round(thr, 2))
print("most-deviant (check first):", [(r, report[r]["delta"]) for r in ranked[:8]])
print("least-deviant (likely fine):", [(r, report[r]["delta"]) for r in ranked[-6:]])
print("could not measure (ear only):", na or "none")
print("wrote", f"{KOK}/analysis.json")
