#!/usr/bin/env python3
"""Rebuild assets/audio/manifest.json from all category dirs."""
import os, json, subprocess, re, time
ROOT = "/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game"
AUD = f"{ROOT}/sound-sprouts/assets/audio"

def dur(p):
    try:
        out = subprocess.run(["afinfo", p], capture_output=True, text=True).stdout
        m = re.search(r"estimated duration:\s*([\d.]+)", out)
        return round(float(m.group(1)), 2) if m else 0.0
    except Exception:
        return 0.0

manifest = {}
for cat in ["fragments", "words", "celebrate", "prompts", "bonus", "misc"]:
    d = os.path.join(AUD, cat)
    if not os.path.isdir(d): continue
    entries = {}
    for fn in sorted(os.listdir(d)):
        if fn.endswith(".m4a"):
            k = fn[:-4]
            entries[k] = {"file": f"{cat}/{fn}", "dur": dur(os.path.join(d, fn))}
    manifest[cat] = entries

# Cache-bust version: appended to every clip URL by audio.js / the debug pages.
# Rebuilding the manifest after any audio change bumps this, so browsers refetch.
manifest["_v"] = int(time.time())

json.dump(manifest, open(f"{AUD}/manifest.json", "w"), indent=2)
print("manifest:", {k: len(v) for k, v in manifest.items() if not k.startswith("_")}, "| _v =", manifest["_v"])
