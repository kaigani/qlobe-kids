#!/usr/bin/env python3
"""Rhythm Copycat — voice post-production: FLAC->AAC encode, manifest build,
Whisper QA. Idempotent (skips existing m4a). Run AFTER gen_assets --stage voice.

Usage: python3 tools/post_voice.py [--force]
"""
import hashlib
import json
import os
import subprocess
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def _api_url():
    for candidate in (os.path.join(ROOT, "..", "..", "tools", "state", "local.json"),
                      os.path.join(ROOT, "..", "tools", "state", "local.json")):
        try:
            return json.load(open(candidate)).get("qwenUrl")
        except (OSError, json.JSONDecodeError):
            continue
    raise SystemExit("missing tools/state/local.json (qwenUrl)")


SRC = os.path.join(ROOT, "assets", "source")
AUDIO = os.path.join(ROOT, "assets", "audio")
def _api_url():
    """The LAN generation endpoint lives in git-ignored local state only —
    never hard-code the machine URL into this repo (repo convention)."""
    for candidate in (os.path.join(ROOT, "..", "..", "tools", "state", "local.json"),
                      os.path.join(ROOT, "..", "tools", "state", "local.json")):
        try:
            return json.load(open(candidate)).get("qwenUrl")
        except (OSError, json.JSONDecodeError):
            continue
    raise SystemExit("missing tools/state/local.json (qwenUrl) - see ASSETS.md")


API = _api_url()

from gen_assets import VOICE_LINES  # noqa: E402


def text_hash(text):
    return hashlib.md5(text.encode()).hexdigest()[:8]


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                          "format=duration", "-of", "csv=p=0", path],
                         capture_output=True, text=True)
    try:
        return round(float(out.stdout.strip()), 3)
    except ValueError:
        return None


def encode(flac, out, force=False):
    if os.path.exists(out) and not force:
        return True
    # FLAC -> AAC-LC 64k m4a with +faststart
    r = subprocess.run(["ffmpeg", "-y", "-i", flac, "-c:a", "aac", "-b:a", "64k",
                        "-movflags", "+faststart", "-ar", "44100", "-ac", "1", out],
                       capture_output=True)
    return r.returncode == 0 and os.path.exists(out)


def whisper_qa(flac, model="small"):
    """Transcribe; returns (text, ok)."""
    boundary = "----qlobe" + os.urandom(8).hex()
    with open(flac, "rb") as f:
        data = f.read()
    body = b""
    for name, payload in [("audio", ("blob", data, "application/octet-stream")),
                          ("model_size", (None, model)),
                          ("language", (None, "en"))]:
        body += f"--{boundary}\r\n".encode()
        if payload[0] is None:
            body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n{payload[1]}\r\n'.encode()
        else:
            body += (f'Content-Disposition: form-data; name="{name}"; filename="{payload[0]}"\r\n'
                     f"Content-Type: application/octet-stream\r\n\r\n").encode()
            body += payload[1] + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(f"{API}/workflows/whisper-stt?sync=true", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=600) as r:
            out = json.loads(r.read())
    except Exception as exc:
        return f"<error {exc}>", False
    text = out.get("text") or out.get("transcript") or json.dumps(out)[:200]
    return text, True


def normalize(t):
    return ("".join(ch for ch in (t or "").lower() if ch.isalnum() or ch.isspace())).split()


def matches(expected, heard):
    want = normalize(expected)
    got = normalize(heard)
    if not want or not got:
        return False
    # allow trailing/filler differences; core words must appear in order
    i = 0
    for word in got:
        if i < len(want) and word == want[i]:
            i += 1
    return i >= len(want)


def main():
    force = "--force" in sys.argv
    os.makedirs(AUDIO, exist_ok=True)
    manifest = {}
    qa = {}
    ok_all = True
    for key, text in VOICE_LINES.items():
        flac = os.path.join(SRC, f"voice-{key}.flac")
        if not os.path.exists(flac):
            print(f"MISSING {key} source")
            ok_all = False
            continue
        out = os.path.join(AUDIO, f"{key}.m4a")
        if not encode(flac, out, force):
            print(f"ENCODE FAIL {key}")
            ok_all = False
            continue
        dur = duration(out) or 0
        sha = hashlib.sha256(open(out, "rb").read()).hexdigest()
        manifest[key] = {"file": f"{key}.m4a", "dur": dur, "sha256": sha,
                         "textHash": text_hash(text)}
        heard, ok = whisper_qa(flac)
        good = ok and matches(text, heard)
        qa[key] = {"ok": good, "hear": heard[:120]}
        if not good:
            ok_all = False
            print(f"QA FAIL {key}: want={text!r} heard={heard!r}")

    with open(os.path.join(AUDIO, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
    with open(os.path.join(AUDIO, "lines.json"), "w") as f:
        json.dump(VOICE_LINES, f, indent=1, sort_keys=True)
    print(json.dumps(qa, indent=1))
    print("RESULT:", "PASS" if ok_all else "FAIL")


if __name__ == "__main__":
    main()