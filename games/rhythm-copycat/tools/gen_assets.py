#!/usr/bin/env python3
"""Rhythm Copycat — resumable local-GenAI asset production driver.

Stages (skip existing outputs unless --force):
  bg        krea2 backgrounds (splash, play) + djembe prop + hub tile + tray + dot sheet
  pads      krea2 pad master -> qwen-image-edit 4 embossed pads
  kiki      krea2 neutral -> qwen-image-edit 6 derived poses
  title     ideogram4 title lockup
  layered   qwen-image-layered extraction of every subject (async, layer_2)
  voice     qwen3-tts-voiceclone all lines (seed 8, retry 9)

Usage: python3 tools/gen_assets.py [--stage bg|pads|kiki|title|layered|voice] [--force]
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

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
SRC = os.path.join(ROOT, "assets", "source")
os.makedirs(SRC, exist_ok=True)

SEED_LADDER = [42, 1337, 9001, 7]

CLAY_SUFFIX = ("Handcrafted stop-motion claymation: a character molded from matte polymer "
               "modeling clay with visible fingerprint texture, soft pinched seams and pressed edges, "
               "slightly imperfect hand-shaped symmetry, rounded child-safe proportions, warm even studio "
               "lighting with a gentle contact shadow. Premium preschool learning app asset, no text, no letters, no words.")

DARK_GROUND = ("The background is a perfectly flat, solid, uniform dark charcoal background, "
               "no gradient, no texture, no shadows on the background.")

KIKI = ("Kiki, a cute baby ginger cat with soft ginger-orange clay fur, a cream muzzle and chest, "
        "big round amber eyes, a small pink nose, long thin whiskers, small triangular ears with cream "
        "inner ears, a short stubby black-tipped tail, and four chubby paws")

KIKI_DESCR = (KIKI + f". {CLAY_SUFFIX} {DARK_GROUND} No words, letters, logo, watermark, UI, border, collage, "
              "extra characters, or cropped body parts.")

POSES = {
    # pose -> action direction for qwen-image-edit
    "notice":   "head tilted up and to the side, one ear perked high, big attentive eyes, listening carefully",
    "clap":     "clapping both front paws together in front of its chest in the middle of a cheerful clap, wide happy smile, ears perked",
    "stomp":    "stomping one back paw down onto the ground with playful force, body leaning into the stomp, front paws slightly lifted, big grin",
    "tap":      "patting the ground in front of it with one front paw in a quick light tap, other paw held up, ears perked, focused happy face",
    "shake":    "shaking its whole body side to side in a wiggly dance, clay fur quivering, stubby tail swinging, wide gleeful smile",
    "celebrate": "jumping up joyfully with both front paws raised high in the air, body mid-bounce, mouth open in a huge happy smile, tail up",
}

PAD_MASTER_PROMPT = (
    "A round tabletop percussion pad made of glossy modeling clay: a coral-orange clay rim with pressed "
    f"fingerprint texture, a smooth cream clay drumhead, soft studio light, small contact shadow. {CLAY_SUFFIX} {DARK_GROUND} "
    "No words, letters, logo, watermark, UI, border, collage, or cropped parts."
)

PAD_ICONS = {
    "clap":  "two chubby little clay hands clapping together, pressed into the cream drumhead as a raised embossed relief",
    "stomp": "one chunky child-size sneaker, pressed into the cream drumhead as a raised embossed relief",
    "tap":   "one kitten paw with a single claw tip, pressing into the cream drumhead as a raised embossed relief",
    "shake": "a small maraca, pressed into the cream drumhead as a raised embossed relief",
}

TRAY_PROMPT = (
    "A long low rectangular clay beat-tray in warm cream, with four identical round recessed wells in a "
    "perfectly even horizontal row with equal spacing between them, smooth rounded rim, pressed fingerprint "
    f"texture, soft studio light, small contact shadow. {CLAY_SUFFIX} {DARK_GROUND} "
    "No words, letters, logo, watermark, UI, border, collage, or cropped parts."
)

DOT_SHEET_PROMPT = (
    "Four identical round clay balls in a perfectly even horizontal row with equal spacing, in four colors "
    "from left to right: coral orange, teal, mustard yellow, lilac purple. Each ball is smooth matte modeling "
    f"clay with subtle fingerprint texture and a tiny contact shadow. {CLAY_SUFFIX} {DARK_GROUND} "
    "No words, letters, logo, watermark, UI, border, collage, or cropped parts."
)

DJEMBE_PROMPT = (
    "A small djembe drum made of modeling clay: warm brown clay body with orange rope lacing and a cream "
    f"clay drumhead, little clay hands imprinted around the rim like a drum circle. {CLAY_SUFFIX} {DARK_GROUND} "
    "No words, letters, logo, watermark, UI, border, collage, or cropped parts."
)

SPLASH_BG_PROMPT = (
    "A cozy claymation playroom stage, full-bleed: a soft matte teal-blue wall with subtle pinched-clay "
    "texture and warm wood table top filling the lower third. On the table at the far left a small maraca, "
    "at the far right a little xylophone and a djembe drum, all made of modeling clay. The CENTER of the "
    "table is completely open and empty (a character will stand there). Warm even studio lighting, gentle "
    f"fingerprint texture everywhere. {CLAY_SUFFIX} The scene has no characters, no text, no letters, no UI, no watermark."
)

PLAY_BG_PROMPT = (
    "A cozy claymation playroom stage, full-bleed: a soft matte teal-blue wall with subtle pinched-clay "
    "texture and a warm wood table top filling the lower third. The wall is calm and empty — no shelves, "
    "no props — and the CENTER of the table is completely open and empty (a clay kitten and a beat tray "
    "will stand there). Warm even studio lighting, gentle fingerprint texture everywhere. "
    f"{CLAY_SUFFIX} The scene has no characters, no text, no letters, no UI, no watermark."
)

HUB_TILE_PROMPT = (
    "Two chubby ginger kitten paws clapping in mid-air above a round coral drum pad with a cream drumhead, "
    "a small maraca and a single sneaker beside it on a warm wood table, soft teal wall behind. "
    "Bright, soft 3D claymation toy style with rounded, simplified forms and cheerful proportions. Saturated "
    "colors, smooth matte clay shading, soft highlights, toy-like finish. Premium preschool learning app "
    "asset, no text, no letters, no words."
)

TITLE_PROMPT = (
    "The two words 'Rhythm Copycat' spelled in hand-molded modeling-clay letters: chunky rounded squishy "
    "letters in cream and coral-orange clay with pressed fingerprint texture and tiny clay stars and a clay "
    "musical note between the words. The letters sit in a single horizontal line, evenly spaced, fully "
    f"readable, centered. {DARK_GROUND} No other objects, no watermark, no shadow on the background."
)

LAYERED = {
    "backgrounds": [
        "Solid flat green background layer. Top layer: the exact same claymation playroom scene from the image — the teal wall, wood table, maraca, xylophone and djembe made of modeling clay. Keep it identical to the input image.",
    ],
}

VOICE_LINES = {
    "intro": "Rhythm Copycat!",
    "choose-mode": "Choose your mode!",
    "mode-clap-stomp": "Clap and stomp!",
    "mode-drum-circle": "Drum circle!",
    "pick-beat": "Pick a beat!",
    "start": "Let's go!",
    "listen": "Listen!",
    "your-turn": "Now you copy it!",
    "clap": "Clap!",
    "stomp": "Stomp!",
    "tap": "Tap!",
    "shake": "Shake!",
    "good-1": "Great!",
    "good-2": "Nice!",
    "good-3": "Awesome!",
    "oops": "Oops!",
    "nudge-clap": "Try the clap!",
    "nudge-stomp": "Try the stomp!",
    "nudge-tap": "Try the tap!",
    "nudge-shake": "Try the shake!",
    "together": "Let's do it together!",
    "song": "Listen to our song!",
    "round-end": "Yay! You did the beat!",
    "all-done": "You made a song!",
    "stars-1": "One star! Nice!",
    "stars-2": "Two stars! Great job!",
    "stars-3": "Three stars! Amazing!",
    "again": "Play again!",
}


def call(workflow, fields, out=None, timeout=900, retries=2):
    """Multipart POST; returns (ok, path|json)."""
    for attempt in range(retries + 1):
        parts = []
        for name, value in fields.items():
            if isinstance(value, bytes):
                parts.append((name, ("blob", value, "application/octet-stream")))
            elif isinstance(value, tuple):  # (filename, bytes)
                parts.append((name, (value[0], value[1], "application/octet-stream")))
            else:
                parts.append((name, (None, str(value))))
        boundary = "----qlobe" + os.urandom(8).hex()
        body = b""
        for name, payload in parts:
            body += f"--{boundary}\r\n".encode()
            if payload[0] is None:
                body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n{payload[1]}\r\n'.encode()
            else:
                body += (f'Content-Disposition: form-data; name="{name}"; filename="{payload[0]}"\r\n'
                         f"Content-Type: application/octet-stream\r\n\r\n").encode()
                body += payload[1] + b"\r\n"
        body += f"--{boundary}--\r\n".encode()
        req = urllib.request.Request(
            f"{API}/workflows/{workflow}?sync=true", data=body,
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            if out:
                with open(out, "wb") as f:
                    f.write(data)
                return True, out
            return True, json.loads(data)
        except Exception as exc:
            if attempt == retries:
                return False, str(exc)
            time.sleep(5 * (attempt + 1))
    return False, "unreachable"


def read_file(path):
    with open(path, "rb") as f:
        return f.read()


def load_json(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return {}


def save_json(path, obj):
    with open(path, "w") as f:
        json.dump(obj, f, indent=1)


def stage_bg(force):
    jobs = [
        ("splash-bg", "krea2-turbo-t2i", SPLASH_BG_PROMPT, 1344, 768),
        ("play-bg", "krea2-turbo-t2i", PLAY_BG_PROMPT, 1344, 768),
        ("tray", "krea2-turbo-t2i", TRAY_PROMPT, 1024, 768),
        ("dot-sheet", "krea2-turbo-t2i", DOT_SHEET_PROMPT, 1024, 1024),
        ("djembe", "krea2-turbo-t2i", DJEMBE_PROMPT, 1024, 1024),
        ("hub-tile", "krea2-turbo-t2i", HUB_TILE_PROMPT, 768, 640),
        ("star", "krea2-turbo-t2i",
         "A single chunky five-point star molded from glossy mustard-yellow modeling clay, pressed "
         f"fingerprint texture, soft studio light, small contact shadow. {CLAY_SUFFIX} {DARK_GROUND} "
         "No words, letters, logo, watermark, UI, border, collage, or cropped parts.", 1024, 1024),
        ("button", "krea2-turbo-t2i",
         "A big round pill-shaped game button molded from glossy coral-orange modeling clay with a "
         f"raised cream clay rim and pressed fingerprint texture. {CLAY_SUFFIX} {DARK_GROUND} "
         "No words, letters, logo, watermark, UI, border, collage, or cropped parts.", 1024, 640),
    ]
    results = _t2i_batch(jobs, force)
    # plaque = tray with the wells smoothed away (same family, one edit)
    tray_src = os.path.join(SRC, "tray.png")
    plaque = os.path.join(SRC, "plaque.png")
    if os.path.exists(tray_src) and (force or not os.path.exists(plaque)):
        prompt = ("Keep this exact long cream clay bar — same colour, same material, same fingerprint "
                  "texture, same lighting, same size in frame, same flat dark charcoal background — and "
                  "change ONLY the four recessed wells into a smooth flat top surface. No words, letters, "
                  "logo, watermark, UI, border, collage, or cropped parts.")
        ok, res = call("qwen-image-edit", {"prompt": prompt, "image": read_file(tray_src), "seed": 42}, out=plaque)
        results.append(("plaque", res if not ok else "ok"))
    else:
        results.append(("plaque", "exists" if os.path.exists(plaque) else "missing-tray"))
    return results


def stage_pads(force):
    master = os.path.join(SRC, "pad-master.png")
    if force or not os.path.exists(master):
        ok, res = call("krea2-turbo-t2i",
                       {"prompt": PAD_MASTER_PROMPT, "width": 1024, "height": 1024, "seed": 42}, out=master)
        if not ok:
            return [("pad-master", res)]
    results = [("pad-master", "ok" if os.path.exists(master) else "missing")]
    for icon, detail in PAD_ICONS.items():
        out = os.path.join(SRC, f"pad-{icon}.png")
        if force or not os.path.exists(out):
            prompt = (f"Keep this exact round clay percussion pad — same coral rim, same cream drumhead, same "
                      f"lighting, same size in frame, same flat dark charcoal background — and add ONE thing: {detail}. "
                      "Change nothing else. No words, letters, logo, watermark, UI, border, collage, or cropped parts.")
            ok, res = call("qwen-image-edit", {"prompt": prompt, "image": read_file(master), "seed": 42}, out=out)
            results.append((f"pad-{icon}", res if not ok else "ok"))
        else:
            results.append((f"pad-{icon}", "exists"))
    return results


def stage_kiki(force):
    neutral = os.path.join(SRC, "kiki-neutral.png")
    if force or not os.path.exists(neutral):
        prompt = (f"{KIKI_DESCR} Standing at rest: upright and still, facing the viewer, weight even on all four "
                  "paws, tail curled softly, calm friendly smile. The whole figure is in frame, centered, one "
                  "character only and unmistakably the subject.")
        ok, res = call("krea2-turbo-t2i",
                       {"prompt": prompt, "width": 1024, "height": 1024, "seed": 42}, out=neutral)
        if not ok:
            return [("kiki-neutral", res)]
    results = [("kiki-neutral", "ok")]
    for pose, action in POSES.items():
        out = os.path.join(SRC, f"kiki-{pose}.png")
        if force or not os.path.exists(out):
            prompt = (f"Redraw the character from the reference image in one new pose: {action}. "
                      f"Same character throughout ({KIKI}). Keep its colours, markings, proportions, face and "
                      "rendering style exactly as the reference has them, and keep it the same size in the frame. "
                      "The whole figure stays in frame, from the top of the head to the soles of the paws, centred, "
                      "one character only. Keep the background exactly as the reference has it: a perfectly flat, "
                      "solid, uniform dark charcoal background, no gradient, no texture, no shadows on the "
                      "background. No words, letters, logo, watermark, UI, border, collage, extra characters, or "
                      "cropped body parts.")
            ok, res = call("qwen-image-edit", {"prompt": prompt, "image": read_file(neutral), "seed": 42}, out=out)
            results.append((f"kiki-{pose}", res if not ok else "ok"))
        else:
            results.append((f"kiki-{pose}", "exists"))
    return results


def stage_title(force):
    out = os.path.join(SRC, "title.png")
    if force or not os.path.exists(out):
        # ideogram first for typography; fall back to krea2 on failure
        ok, res = call("ideogram4-t2i", {"prompt": TITLE_PROMPT, "width": 1440, "height": 480,
                                         "seed": 42, "quality": "high"}, out=out)
        if not ok:
            ok, res = call("krea2-turbo-t2i", {"prompt": TITLE_PROMPT, "width": 1440, "height": 480, "seed": 42}, out=out)
        return [("title", res if not ok else "ok")]
    return [("title", "exists")]


LAYER_JOBS = {
    "kiki-neutral": f"Solid flat green background layer. Top layer: the exact same cute baby ginger clay kitten ({KIKI}) from the image, standing at rest facing the viewer. Keep it identical to the input image.",
    "kiki-notice": f"Solid flat green background layer. Top layer: the exact same cute baby ginger clay kitten ({KIKI}) from the image, head tilted up listening. Keep it identical to the input image.",
    "kiki-clap": f"Solid flat green background layer. Top layer: the exact same cute baby ginger clay kitten ({KIKI}) from the image, clapping its front paws together. Keep it identical to the input image.",
    "kiki-stomp": f"Solid flat green background layer. Top layer: the exact same cute baby ginger clay kitten ({KIKI}) from the image, stomping one back paw. Keep it identical to the input image.",
    "kiki-tap": f"Solid flat green background layer. Top layer: the exact same cute baby ginger clay kitten ({KIKI}) from the image, patting the ground with one front paw. Keep it identical to the input image.",
    "kiki-shake": f"Solid flat green background layer. Top layer: the exact same cute baby ginger clay kitten ({KIKI}) from the image, shaking side to side. Keep it identical to the input image.",
    "kiki-celebrate": f"Solid flat green background layer. Top layer: the exact same cute baby ginger clay kitten ({KIKI}) from the image, jumping with both front paws raised. Keep it identical to the input image.",
    "pad-clap": "Solid flat green background layer. Top layer: the exact same round coral clay percussion pad with an embossed relief of two clapping hands on its cream drumhead. Keep it identical to the input image.",
    "pad-stomp": "Solid flat green background layer. Top layer: the exact same round coral clay percussion pad with an embossed relief of a sneaker on its cream drumhead. Keep it identical to the input image.",
    "pad-tap": "Solid flat green background layer. Top layer: the exact same round coral clay percussion pad with an embossed relief of a kitten paw on its cream drumhead. Keep it identical to the input image.",
    "pad-shake": "Solid flat green background layer. Top layer: the exact same round coral clay percussion pad with an embossed relief of a maraca on its cream drumhead. Keep it identical to the input image.",
    "tray": "Solid flat green background layer. Top layer: the exact same long low cream clay beat-tray with four round recessed wells in an even horizontal row. Keep it identical to the input image.",
    "dot-sheet": "Solid flat green background layer. Top layer: the exact same four round clay balls in a horizontal row — coral orange, teal, mustard yellow, lilac purple. Keep them identical to the input image.",
    "djembe": "Solid flat green background layer. Top layer: the exact same small brown clay djembe drum with orange lacing and a cream drumhead. Keep it identical to the input image.",
    "title": "Solid flat green background layer. Top layer: the exact same two clay words 'Rhythm Copycat' with the clay ornaments, the hand-molded cream and coral letters. Keep it identical to the input image.",
    "star": "Solid flat green background layer. Top layer: the exact same chunky five-point mustard-yellow clay star. Keep it identical to the input image.",
    "button": "Solid flat green background layer. Top layer: the exact same big round pill-shaped coral-orange clay button with a raised cream rim. Keep it identical to the input image.",
    "plaque": "Solid flat green background layer. Top layer: the exact same long smooth cream clay bar with a flat top surface. Keep it identical to the input image.",
    "card": "Solid flat green background layer. Top layer: the exact same large rounded-square warm cream clay game card with a raised pressed rim. Keep it identical to the input image.",
}


def _t2i_batch(jobs, force):
    results = []
    for name, workflow, prompt, w, h in jobs:
        out = os.path.join(SRC, f"{name}.png")
        if force or not os.path.exists(out):
            ok, res = call(workflow, {"prompt": prompt, "width": w, "height": h, "seed": 42}, out=out)
            results.append((name, res if not ok else "ok"))
        else:
            results.append((name, "exists"))
    return results


def stage_layered(force):
    results = []
    for name, prompt in LAYER_JOBS.items():
        src = os.path.join(SRC, f"{name}.png")
        out = os.path.join(SRC, f"{name}.layer2.png")
        if not os.path.exists(src):
            results.append((name, "source-missing"))
            continue
        if force or not os.path.exists(out):
            ok, res = _layered(src, prompt, out)
            results.append((name, res if not ok else "ok"))
        else:
            results.append((name, "exists"))
    return results


def _layered(src, prompt, out, max_poll=1800):
    boundary = "----qlobe" + os.urandom(8).hex()
    body = b""
    for name, payload in [("image", ("blob", read_file(src), "application/octet-stream")),
                          ("prompt", (None, str(prompt))),
                          ("layers", (None, "2")),
                          ("seed", (None, "42"))]:
        body += f"--{boundary}\r\n".encode()
        if payload[0] is None:
            body += f'Content-Disposition: form-data; name="{name}"\r\n\r\n{payload[1]}\r\n'.encode()
        else:
            body += (f'Content-Disposition: form-data; name="{name}"; filename="{payload[0]}"\r\n'
                     f"Content-Type: application/octet-stream\r\n\r\n").encode()
            body += payload[1] + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(f"{API}/workflows/qwen-image-layered", data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=300) as r:
            job = json.loads(r.read())
    except Exception as exc:
        return False, f"submit: {exc}"
    job_id = job.get("job_id") or job.get("id")
    if not job_id:
        return False, f"no job id: {job}"
    deadline = time.time() + max_poll
    while time.time() < deadline:
        time.sleep(8)
        try:
            with urllib.request.urlopen(f"{API}/jobs/{job_id}", timeout=30) as r:
                status = json.loads(r.read())
        except Exception:
            continue
        if status.get("status") in ("completed", "done", "success"):
            break
        if status.get("status") in ("failed", "error"):
            return False, f"job failed: {status}"
    else:
        return False, "timed out"
    try:
        with urllib.request.urlopen(f"{API}/jobs/{job_id}/result?output=layer_2", timeout=60) as r:
            data = r.read()
    except Exception as exc:
        return False, f"result: {exc}"
    with open(out, "wb") as f:
        f.write(data)
    return True, "ok"


def stage_voice(force):
    voice_ref = None
    for candidate in (os.path.join(ROOT, "..", "..", "tools", "state", "local.json"),
                      os.path.join(ROOT, "..", "tools", "state", "local.json"),
                      os.path.join(ROOT, "tools", "state", "local.json")):
        if os.path.exists(candidate):
            try:
                voice_ref = json.load(open(candidate)).get("teacherVoicePath")
                break
            except (OSError, json.JSONDecodeError):
                pass
    if not voice_ref or not os.path.exists(voice_ref):
        return [("voice", f"reference missing: {voice_ref}")]
    audio_dir = os.path.join(ROOT, "assets", "audio")
    os.makedirs(audio_dir, exist_ok=True)
    results = []
    ref_bytes = read_file(voice_ref)
    for key, text in VOICE_LINES.items():
        wav = os.path.join(SRC, f"voice-{key}.flac")
        if force or not os.path.exists(wav):
            ok, res = call("qwen3-tts-voiceclone",
                           {"voice": ref_bytes, "text": text, "seed": 8}, out=wav)
            if not ok:
                results.append((key, res))
                continue
        results.append((key, "ok"))
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["bg", "pads", "kiki", "title", "layered", "voice"], action="append")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    stages = args.stage if args.stage else ["bg", "pads", "kiki", "title", "layered", "voice"]
    for stage in stages:
        t0 = time.time()
        fn = {"bg": stage_bg, "pads": stage_pads, "kiki": stage_kiki,
              "title": stage_title, "layered": stage_layered, "voice": stage_voice}[stage]
        results = fn(args.force)
        print(f"== {stage} ({time.time() - t0:.0f}s)")
        for name, status in results:
            print(f"   {name}: {status}")


if __name__ == "__main__":
    main()