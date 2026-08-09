#!/usr/bin/env python3
"""Kawaii restyle generator for Rhythm Copycat.

Recreates every runtime asset in the kawaii puffy-sticker aesthetic of the
ui-mockups (see output/ui-mockups/PROMPTS.md): thick white sticker borders,
matte-satin vinyl, glossy kawaii eyes, citrus/aqua palette, flat saturated
walls, cocoa-stroked bubble type.

Write     : python3 kawaii_gen.py            # krea/ideogram sources
            python3 kawaii_gen.py --poses    # qwen-image-edit pose redraws
            python3 kawaii_gen.py --layers   # qwen-image-layered cutouts
Idempotent: existing outputs are skipped.
"""
import argparse
import json
import os
import sys
import time
import urllib.request

API = "http://192.168.1.181:8100"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source")

# ------------------------------------------------------------------ style core

STYLE = (
    "Preschool kawaii toy-package 3D render: puffy inflated soft vinyl sticker look, "
    "matte-satin plasticine texture, thick rounded WHITE sticker border outlines around every object, "
    "soft ambient-occlusion shading with gentle white highlights on top edges, soft drop shadows, "
    "kawaii faces where noted (big glossy black eyes with small white catchlights, tiny pink blush circles, "
    "small happy smile), high-saturation citrus palette (turquoise #2DD2D3, coral red #FF6E5D, "
    "mustard yellow #FFD23F, cream #FFF7DD, sky blue, lime green #8ED152), flat saturated background, "
    "no words, letters, watermark or UI. "
)

DARK = "perfectly flat, solid, uniform dark charcoal background, no gradient, no texture, no shadows on the background"

def style(prompt, *, dark=False, bg=None):
    if dark:
        prompt += " The whole scene sits on a " + DARK + "."
    else:
        prompt += f" Background: {bg}."
    return STYLE + prompt

# ------------------------------------------------------------------ krea sources

KREA = {
    "kw-bg-splash": style(
        "A cozy preschool music-room corner: flat turquoise wall with very faint vertical panel grooves, "
        "warm light-wood floor, a big round mustard-yellow rug with darker concentric ring texture in the "
        "center foreground, a window on the left with a thick rounded mustard-yellow frame showing blue sky, "
        "one fluffy white cloud and leafy green plants, a terracotta pot with a succulent on the windowsill; "
        "on the right a light wooden shelf holding a small plant in a mustard pot and three books (pink, "
        "yellow, cyan); just below the shelf the top of a red djembe drum with cyan rims and yellow zig-zag "
        "rope. Wide open empty center for game UI.",
        bg="flat turquoise wall, warm wood floor, mustard rug"),
    "kw-bg-play": style(
        "A flat solid bright turquoise game backdrop with a subtle darker vignette at the edges; at the "
        "top-left corner a mini kawaii xylophone with five colored keys and a mallet, at the top-right corner "
        "a big kawaii maraca with a cute smiling face; MANY tiny floating musical notes, dots and 4-point "
        "sparkle stars scattered across the upper half; along the very bottom a wavy dark-teal water strip, "
        "at the bottom-left corner pink coral and green seaweed, at the bottom-right corner more pink coral "
        "and a yellow scallop shell; a few small colored dots and notes floating above the water strip. "
        "Wide open empty center for game UI.",
        bg="flat bright turquoise"),
    "kw-bg-end": style(
        "A light sky-blue wall with faint vertical plank grooves above a flat light-cyan floor; a large "
        "two-tier circular podium stage centered: top surface light cyan, side wall darker teal with a "
        "ruffled scalloped bottom edge; MANY small confetti pieces, tiny musical notes and 4-point sparkle "
        "stars scattered across the whole sky; a kawaii maraca leaning against the podium on the left and a "
        "kawaii tambourine with a cute face sitting on the podium edge on the right; a half orange slice at "
        "the bottom-left corner and a half lemon slice at the bottom-right corner; wide open space above the "
        "podium for a character.",
        bg="light sky-blue wall, light-cyan floor"),

    "kw-kiki-neutral": style(
        "ONE cute baby ginger kitten made of soft puffy clay, cream muzzle and chest, big glossy black "
        "kawaii eyes with white catchlights, tiny pink blush cheeks, small smile, small triangular ears, a "
        "short stubby black-tipped tail, chubby round paws, a thick WHITE sticker outline around the whole "
        "body, sitting upright facing the viewer, weight even, tail curled beside her, centered, one "
        "character only, unmistakably the subject. The whole figure is in frame.",
        dark=True),
    "kw-pad-clap": style(
        "ONE round squircle preschool action pad, cream fill with a thick dark cocoa-brown rounded border, "
        "puffy inflated sticker, slightly angled top-down view, centered ON the pad: two light skin-tone "
        "clay hands mid-clap with blue sleeves and three small white motion ticks above the hands. "
        "One pad only.",
        dark=True),
    "kw-pad-stomp": style(
        "ONE round squircle preschool action pad, cream fill with a thick dark cocoa-brown rounded border, "
        "puffy inflated sticker, slightly angled top-down view, centered ON the pad: a pair of chubby clay "
        "lower legs with yellow socks and green sneakers with white soles, heels raised, two small green "
        "motion dashes under the feet. One pad only.",
        dark=True),
    "kw-pad-tap": style(
        "ONE round squircle preschool action pad, cream fill with a thick golden-orange rounded border, "
        "puffy inflated sticker, slightly angled top-down view, centered ON the pad: a light skin-tone clay "
        "hand in an orange sleeve tapping a small mini hand drum with blue top and bottom rims, white drum "
        "head and a red-and-yellow triangle patterned body, three small yellow radiating lines beside the "
        "hand. One pad only.",
        dark=True),
    "kw-pad-shake": style(
        "ONE round squircle preschool action pad, cream fill with a thick reddish-terracotta rounded "
        "border, puffy inflated sticker, slightly angled top-down view, centered ON the pad: a kawaii "
        "maraca with a red top, yellow-and-orange striped body, white dots and a wooden handle, with small "
        "red curved shake arcs on each side. One pad only.",
        dark=True),

    "kw-tray": style(
        "ONE long horizontal cream stadium-pill track with a thick turquoise outer border and a slightly "
        "darker turquoise bottom edge for depth, soft inner bevel, and four equally spaced round recessed "
        "chip seats in a row along the middle of the track, puffy inflated sticker, long and wide.",
        dark=True),
    "kw-button": style(
        "ONE wide coral-red stadium pill button, puffy inflated, thick white rounded border all around, "
        "soft white highlight along the top edge, two small yellow three-line sparkle bursts near the left "
        "and right inner edges, empty center.",
        dark=True),
    "kw-star": style(
        "ONE puffy 5-point yellow star sticker with a thick white border, cute kawaii face (big glossy "
        "black eyes with white catchlights, tiny pink blush cheeks, happy open smile), centered, one star "
        "only.",
        dark=True),
    "kw-card-orange": style(
        "ONE rounded-square preschool activity card, FLAT 2D glossy sticker art style: crisp clean flat "
        "colors, very shallow soft shading, no chunky 3D bevels; thick white rounded die-cut border, inner "
        "panel solid bright orange, a lighter peach dashed stitch line inset near the edge running around "
        "the panel, a white capsule pill across the upper third containing four small empty circle seats "
        "side by side, a small yellow 5-point star sticker with white border at the bottom-left corner, "
        "wide open center below the pill.",
        dark=True),
    "kw-card-yellow": style(
        "ONE rounded-square preschool activity card: thick white rounded border, inner panel solid bright "
        "sunflower yellow, a lighter cream dashed stitch line inset near the edge running around the panel, "
        "a white capsule pill across the upper third containing four small empty circle seats side by side, "
        "a small cyan 5-point star sticker with white border at the bottom-left corner, wide open center "
        "below the pill.",
        dark=True),
    "kw-card-teal": style(
        "ONE rounded-square preschool activity card: thick white rounded border, inner panel solid bright "
        "turquoise, a lighter mint dashed stitch line inset near the edge running around the panel, a white "
        "capsule pill across the upper third containing four small empty circle seats side by side, a small "
        "lime 5-point star sticker with white border at the bottom-right corner, wide open center below the "
        "pill.",
        dark=True),
    "kw-djembe": style(
        "ONE kawaii djembe drum sticker: beige drumhead, tan wooden body, dark brown rope, orange base, "
        "teal foot, cute kawaii face on the body (big glossy black eyes with white catchlights, pink blush "
        "cheeks, small smile), thick white sticker border around the whole drum, centered.",
        dark=True),
    "kw-dot-blue": style(
        "ONE flat matte round sticker dot in bright sky blue with a slightly darker blue edge, subtle "
        "soft shadow, centered, tiny.",
        dark=True),
    "kw-dot-green": style(
        "ONE flat matte round sticker dot in bright lime green with a slightly darker green edge, subtle "
        "soft shadow, centered, tiny.",
        dark=True),
    "kw-dot-orange": style(
        "ONE flat matte round sticker dot in bright orange with a slightly darker orange edge, subtle soft "
        "shadow, centered, tiny.",
        dark=True),
    "kw-maraca": style(
        "ONE big kawaii maraca sticker lying on its side: red top, yellow-and-orange striped body with "
        "white dots, wooden handle, cute kawaii face on the body (big glossy black eyes with white "
        "catchlights, pink blush cheeks, small happy smile), thick white sticker border around the whole "
        "maraca, centered.",
        dark=True),
    "kw-tambourine": style(
        "ONE kawaii tambourine sticker: cream drumhead, bright red rim, small yellow jingles around the "
        "edge, cute kawaii face on the drumhead (big glossy black eyes with white catchlights, pink blush "
        "cheeks, small happy smile), thick white sticker border around the whole instrument, centered.",
        dark=True),
    "kw-woodblock": style(
        "ONE kawaii wooden woodblock instrument sticker: light wood grain block with a red-headed mallet "
        "resting on top, cute kawaii face on the block (big glossy black eyes with white catchlights, pink "
        "blush cheeks, small happy smile), thick white sticker border around the whole instrument, centered.",
        dark=True),
    "kw-plaque": style(
        "ONE wide puffy cloud-shaped banner plaque, off-white cream fill, thick WHITE rounded outer border "
        "with a thin dark-cocoa inner outline just inside it, three small raised sticker accents (a yellow "
        "5-point star, a teal musical note, a red musical note) near the corners, wide empty center, puffy "
        "inflated sticker, perfectly flat, solid, uniform dark charcoal background.",
        dark=True),
    "kw-hub-tile": style(
        "A kawaii toy product shot for a rhythm game: a cute smiling bass drum character with a coral rim "
        "and teal body holding two drumsticks up, sitting on a big mustard-yellow rug, a kawaii maraca on "
        "one side and a kawaii tambourine on the other, turquoise wall behind with a few floating musical "
        "notes and confetti, soft even studio light.",
        bg="flat turquoise wall, mustard rug, wood floor"),
    "kw-dot-red": style(
        "ONE flat matte round sticker dot in bright coral red with a slightly darker red edge, subtle soft "
        "shadow, centered, tiny.",
        dark=True),
}

# ------------------------------------------------------------------ ideogram

KW_TITLE = (
    "Preschool kawaii game title lockup, the words \"Rhythm Copycat\" in chunky inflated bubble letters "
    "with thick dark-cocoa-brown outlines and soft white highlights on the top edges of each letter, "
    "letters slightly overlapping and bouncing, \"Rhythm\" in warm coral orange, \"Copycat\" in bright "
    "turquoise, a small yellow musical note with a cute kawaii face between the two words, small white "
    "4-point sparkle stars around the words, on a perfectly flat, solid, uniform dark charcoal background, "
    "no watermark."
)

# ------------------------------------------------------------------ posed redraws

POSES = {
    "clap": "clapping her two front paws together joyfully in front of her chest, motion ticks beside the paws",
    "stomp": "bouncing on the spot doing a happy stomp dance, one front paw and one back paw lifted mid-hop, ears up",
    "tap": "standing upright, one front paw raised out in front and pressed down toward the ground in a quick light tap, the arm clearly attached to the shoulder, no objects near the paw",
    "shake": "holding a small red-and-yellow striped maraca in one front paw and shaking it with curved shake arcs beside it, ears perked",
    "notice": "tilting her head with one ear up, surprised listening expression, one paw near her cheek",
    "celebrate": "leaping joyfully with all four paws off the ground, both front paws raised high, mouth open in a happy cheer, tail up",
}

# ------------------------------------------------------------------ layered

LAYERED = {
    "kw-maraca": "the exact same big kawaii maraca sticker with the happy face",
    "kw-title": "the exact same puffy bubble-letter lockup with the dark cocoa outlines, on a perfectly transparent layer",
    "kw-tambourine": "the exact same kawaii tambourine sticker with the happy face",
    "kw-woodblock": "the exact same kawaii woodblock sticker with the mallet and happy face",
    "kw-plaque": "the exact same wide cream cloud-shaped banner plaque with the white border and brown inner outline",
    "kw-hub-tile": None,

    "kw-pad-clap": "the exact same round squircle cream preschool pad with the two clay hands clapping in blue sleeves on its face",
    "kw-pad-stomp": "the exact same round squircle cream preschool pad with the clay legs and green sneakers on its face",
    "kw-pad-tap": "the exact same round squircle cream preschool pad with the clay hand tapping the mini drum on its face",
    "kw-pad-shake": "the exact same round squircle cream preschool pad with the kawaii maraca on its face",
    "kw-tray": "the exact same long cream stadium-pill track with the four recessed chip seats",
    "kw-button": "the exact same wide coral-red stadium pill button with the white border and sparkles",
    "kw-star": "the exact same puffy yellow 5-point star sticker with the kawaii face",
    "kw-card-orange": "the exact same rounded-square orange preschool activity card with the stitch line, white pill and star sticker",
    "kw-card-yellow": "the exact same rounded-square yellow preschool activity card with the stitch line, white pill and star sticker",
    "kw-card-teal": "the exact same rounded-square turquoise preschool activity card with the stitch line, white pill and star sticker",
    "kw-djembe": "the exact same kawaii djembe drum sticker with the face",
    "kw-dot-blue": "the exact same flat matte sky-blue round sticker dot",
    "kw-dot-green": "the exact same flat matte lime-green round sticker dot",
    "kw-dot-orange": "the exact same flat matte orange round sticker dot",
    "kw-dot-red": "the exact same flat matte coral-red round sticker dot",
    "kw-kiki-neutral": "the exact same cute baby ginger kitten with the white sticker outline",
    "kw-kiki-clap": "the exact same cute baby ginger kitten clapping her paws",
    "kw-kiki-stomp": "the exact same cute baby ginger kitten doing the stomp dance",
    "kw-kiki-tap": "the exact same cute baby ginger kitten tapping the ground with one paw",
    "kw-kiki-shake": "the exact same cute baby ginger kitten shaking a maraca",
    "kw-kiki-notice": "the exact same cute baby ginger kitten in the listening pose",
    "kw-kiki-celebrate": "the exact same cute baby ginger kitten leaping in celebration",
}

KIKI_DESCR = (
    "a cute baby ginger kitten with soft ginger-orange fur, a cream muzzle and chest, big glossy black "
    "kawaii eyes with white catchlights, tiny pink blush cheeks, a small pink nose, long thin whiskers, "
    "small triangular ears with cream inner ears, a short stubby black-tipped tail, four chubby paws, a "
    "thick WHITE sticker outline around the whole body"
)


def post(fields, url, timeout=600):
    boundary = "----qlobe" + os.urandom(8).hex()
    body = b""
    for fname, payload in fields:
        body += f"--{boundary}\r\n".encode()
        if payload[0] is None:
            body += f'Content-Disposition: form-data; name="{fname}"\r\n\r\n{payload[1]}\r\n'.encode()
        else:
            body += (f'Content-Disposition: form-data; name="{fname}"; filename="{payload[0]}"\r\n'
                     f"Content-Type: application/octet-stream\r\n\r\n").encode()
            body += payload[1] + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=body,
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def call_workflow(name, fields):
    return post(fields, f"{API}/workflows/{name}?sync=true")


def stage_krea(force):
    os.makedirs(SRC, exist_ok=True)
    results = []
    for key, prompt in KREA.items():
        out = os.path.join(SRC, f"{key}.png")
        if os.path.exists(out) and not force:
            results.append((key, "exists"))
            continue
        size = "1344" if key.startswith("kw-bg-") else "1024"
        for seed in (42, 7, 9):
            try:
                raw = call_workflow("krea2-turbo-t2i",
                                    [("prompt", (None, prompt)), ("width", (None, size)),
                                     ("height", (None, size)), ("seed", (None, str(seed)))])
                open(out, "wb").write(raw)
                print(f"{key}: ok ({len(raw)}B, seed {seed})", flush=True)
                results.append((key, "ok"))
                break
            except Exception as exc:  # noqa: BLE001
                print(f"{key}: seed {seed} failed: {exc}", flush=True)
        else:
            results.append((key, "FAILED"))
    return results


def stage_title(force):
    out = os.path.join(SRC, "kw-title.png")
    if os.path.exists(out) and not force:
        return [("kw-title", "exists")]
    try:
        raw = call_workflow("ideogram4-t2i",
                            [("prompt", (None, KW_TITLE)), ("width", (None, "1440")),
                             ("height", (None, "360")), ("seed", (None, "42"))])
        open(out, "wb").write(raw)
        print("kw-title: ok", len(raw), flush=True)
        return [("kw-title", "ok")]
    except Exception as exc:  # noqa: BLE001
        return [("kw-title", f"FAILED {exc}")]


def stage_poses(force):
    neutral = os.path.join(SRC, "kw-kiki-neutral.png")
    if not os.path.exists(neutral):
        return [("poses", "neutral missing")]
    results = []
    for pose, action in POSES.items():
        out = os.path.join(SRC, f"kw-kiki-{pose}.png")
        if os.path.exists(out) and not force:
            results.append((f"kw-kiki-{pose}", "exists"))
            continue
        prompt = (f"Redraw the character from the reference image in one new pose: {KIKI_DESCR} {action}. "
                  "Same character throughout, keep colours, markings, proportions, face and the white sticker "
                  "outline exactly as the reference has them, same size in frame, the whole figure stays in "
                  "frame from head to the soles of the paws, centred, one character only. Keep the background "
                  "exactly as the reference has it: a perfectly flat, solid, uniform dark charcoal background.")
        try:
            raw = call_workflow("qwen-image-edit",
                                [("image", ("ref.png", read_file(neutral), "application/octet-stream")),
                                 ("prompt", (None, prompt)), ("seed", (None, "42"))])
            open(out, "wb").write(raw)
            results.append((f"kw-kiki-{pose}", "ok"))
        except Exception as exc:  # noqa: BLE001
            results.append((f"kw-kiki-{pose}", f"FAILED {exc}"))
    return results


def read_file(path):
    with open(path, "rb") as f:
        return f.read()


def stage_layers(force, only_keys=""):
    os.makedirs(SRC, exist_ok=True)
    results = []
    only = {k for k in only_keys.split(',') if k}
    for key, prompt in LAYERED.items():
        if only and key not in only:
            continue
        if prompt is None:
            continue
        # layering may need a few tries for the kawaii style; report failures only
        out = os.path.join(SRC, f"{key}.layer2.png")
        if os.path.exists(out) and not force:
            print(f"{key}: exists", flush=True)
            results.append((key, "exists"))
            continue
        src = os.path.join(SRC, f"{key}.png")
        if not os.path.exists(src):
            print(f"{key}: MISSING SOURCE", flush=True)
            results.append((key, "missing source"))
            continue
        boundary = "----qlobe" + os.urandom(8).hex()
        body = b""
        for fname, payload in [("image", (os.path.basename(src), read_file(src), "application/octet-stream")),
                               ("prompt", (None, "Solid flat green background layer. Top layer: " + prompt +
                                           ". Keep it identical to the input image.")),
                               ("layers", (None, "2")), ("seed", (None, "42"))]:
            body += f"--{boundary}\r\n".encode()
            if payload[0] is None:
                body += f'Content-Disposition: form-data; name="{fname}"\r\n\r\n{payload[1]}\r\n'.encode()
            else:
                body += (f'Content-Disposition: form-data; name="{fname}"; filename="{payload[0]}"\r\n'
                         f"Content-Type: application/octet-stream\r\n\r\n").encode()
                body += payload[1] + b"\r\n"
        body += f"--{boundary}--\r\n".encode()
        req = urllib.request.Request(f"{API}/workflows/qwen-image-layered", data=body,
                                     headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        try:
            with urllib.request.urlopen(req, timeout=300) as r:
                job = json.loads(r.read())
            jid = job.get("job_id") or job.get("id")
            start = time.time()
            while time.time() - start < 1500:
                time.sleep(15)
                try:
                    with urllib.request.urlopen(f"{API}/jobs/{jid}", timeout=30) as r:
                        st = json.loads(r.read())
                except Exception:  # noqa: BLE001
                    continue
                if st.get("status") in ("completed", "done", "success"):
                    with urllib.request.urlopen(f"{API}/jobs/{jid}/result?output=layer_2", timeout=120) as r:
                        raw = r.read()
                    open(out, "wb").write(raw)
                    print(f"{key}: ok ({len(raw)}B)", flush=True)
                    results.append((key, "ok"))
                    break
                if st.get("status") in ("failed", "error"):
                    print(f"{key}: job failed {st}", flush=True)
                    results.append((key, "FAILED"))
                    break
            else:
                print(f"{key}: TIMEOUT", flush=True)
                results.append((key, "timed out"))
        except Exception as exc:  # noqa: BLE001
            print(f"{key}: submit failed {exc}", flush=True)
            results.append((key, f"FAILED {exc}"))
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["sources", "title", "poses", "layers"], default="sources")
    ap.add_argument("--only", default="")
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args()
    if args.stage == "sources":
        results = stage_krea(args.force)
    elif args.stage == "title":
        results = stage_title(args.force)
    elif args.stage == "poses":
        results = stage_poses(args.force)
    else:
        results = stage_layers(args.force, args.only)
    bad = [r for r in results if r[1] not in ("ok", "exists")]
    print(json.dumps({"results": results, "bad": bad}, indent=1))
    if bad:
        sys.exit(1)


if __name__ == "__main__":
    main()