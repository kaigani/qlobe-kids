#!/usr/bin/env python3
"""Sink or Float Lab — layered extraction batch (qwen-image-layered, async job flow).

Resumable: skips existing outputs. Host from QLOBE_QWEN_URL.
layer_2 = subject with true alpha (layer_1 is background, sync composite is layer_0).
"""
import json
import os
import sys
import time
import urllib.request

API = os.environ.get("QLOBE_QWEN_URL")
if not API:
    sys.exit("set QLOBE_QWEN_URL")
DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(DIR, "assets", "source")
OUT = os.path.join(SRC, "cutouts")
os.makedirs(OUT, exist_ok=True)

# (output-name, input-path-relative-to-source, subject description)
JOBS = [
    ("duck", "anchors/duck.png", "cheerful yellow rubber duck"),
    ("rock", "raw-edit/rock.png", "smooth grey rock"),
    ("wooden-block", "raw-edit/wooden-block.png", "light brown wooden toy block cube"),
    ("sponge", "raw-edit/sponge.png", "yellow rectangular kitchen sponge"),
    ("cork", "raw-edit/cork.png", "light brown cylindrical bottle cork"),
    ("apple", "raw-edit/apple.png", "shiny red apple with a small leaf"),
    ("leaf", "raw-edit/leaf.png", "single fresh green leaf"),
    ("key", "raw-edit/key.png", "old brass metal key"),
    ("coin", "raw-edit/coin.png", "shiny golden coin"),
    ("marble", "raw-edit/marble.png", "shiny blue glass marble"),
    ("spoon", "raw-edit/spoon.png", "silver metal spoon"),
    ("shell", "raw-edit/shell.png", "pink and cream spiral seashell"),
    ("watermelon", "raw-edit/watermelon.png", "whole green striped watermelon"),
    ("pebble", "raw-edit/pebble.png", "tiny smooth grey pebble"),
    ("log", "raw-edit/log.png", "small brown tree log with rough bark"),
    ("paperclip", "raw-edit/paperclip.png", "silver metal paperclip"),
    ("orange", "raw-edit/orange.png", "whole orange fruit"),
    ("egg", "raw-edit/egg.png", "plain white chicken egg"),
    ("jar", "anchors/jar.png", "simple empty clear glass jar with a wide open mouth"),
    ("journal", "anchors/journal.png", "open field journal notebook with an underwater watercolor scene painted across its pages and a pencil beside it"),
    ("badge-sink", "anchors/badge-sink.png", "round emblem painting of a grey rock resting underwater at the bottom of blue water"),
    ("badge-float", "anchors/badge-float.png", "round emblem painting of a light brown cork bobbing on top of a blue water line"),
    ("icon-predict", "anchors/icon-predict.png", "clear glass jar of blue water with a small red apple hovering above it"),
    ("icon-tricky", "anchors/icon-tricky.png", "whole green striped watermelon bobbing half out of blue water"),
    ("icon-pond", "anchors/icon-pond.png", "side view of blue water with a green leaf floating on top and pebbles resting at the bottom"),
]


def post_job(path, prompt):
    import subprocess
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", f"{API}/workflows/qwen-image-layered",
         "-F", f"image=@{path}", "-F", f"prompt={prompt}",
         "-F", "layers=2", "-F", "seed=42", "--max-time", "120"],
        capture_output=True, text=True)
    return json.loads(r.stdout)


def main():
    for name, rel, desc in JOBS:
        out = os.path.join(OUT, f"{name}.png")
        if os.path.exists(out) and os.path.getsize(out) > 10000:
            print(f"skip {name}", flush=True)
            continue
        src = os.path.join(SRC, rel)
        if not os.path.exists(src):
            print(f"MISSING-INPUT {name} {rel}", flush=True)
            continue
        prompt = (f"Solid flat green background layer. Top layer: the exact same "
                  f"{desc} from the image. Keep it identical to the input image.")
        try:
            job = post_job(src, prompt)
            jid = job.get("job_id") or job.get("id")
        except Exception as e:  # noqa: BLE001
            print(f"POST-FAIL {name}: {e}", flush=True)
            continue
        if not jid:
            print(f"POST-FAIL {name}: {job}", flush=True)
            continue
        deadline = time.time() + 600
        status = None
        while time.time() < deadline:
            time.sleep(8)
            try:
                with urllib.request.urlopen(f"{API}/jobs/{jid}", timeout=30) as r:
                    status = json.load(r)
            except Exception:  # noqa: BLE001
                continue
            st = status.get("status")
            if st in ("completed", "failed", "error"):
                break
        if not status or status.get("status") != "completed":
            print(f"JOB-FAIL {name}: {status and status.get('status')}", flush=True)
            continue
        try:
            with urllib.request.urlopen(f"{API}/jobs/{jid}/result?output=layer_2", timeout=120) as r:
                data = r.read()
            with open(out, "wb") as f:
                f.write(data)
            print(f"done {name} {len(data)}", flush=True)
        except Exception as e:  # noqa: BLE001
            print(f"FETCH-FAIL {name}: {e}", flush=True)
    print("EXTRACT BATCH DONE", flush=True)


if __name__ == "__main__":
    main()
