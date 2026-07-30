#!/usr/bin/env python3
"""World Music Dance — teacher-voice production.

Clone of games/sink-or-float/tools/gen-voice.py's pattern EXACTLY:
qwen3-tts-voiceclone (seed ladder 7/8/9) -> whisper QA (small, en) ->
ffmpeg AAC m4a +faststart -> manifest.json with durations. Resumable per
clip. Host from QLOBE_QWEN_URL, reference voice from QLOBE_VOICE_REF.

The one addition over the sink-or-float pattern: several lines carry a
loanword or foreign phrase (Namaste, Olá, Konnichiwa, Akwaaba, Kpanlogo,
folklórico, Bon Odori) that whisper-small routinely mishears or
mis-transliterates even on a good take. ALTERNATES lists, per line, the
alternate spellings a passing transcript may use IN PLACE OF the original
word — a take passes if the normalized transcript matches the normalized
intended line OR matches the intended line with any one alternate
substituted for its word. This also fixes the accented-character case (the
plain regex normalizer strips diacritics entirely, so "Olá" degrades to
"ol" unless the ASCII alternate "Ola" is offered as a substitution).

LINES are copied VERBATIM from game-design.md's "Spoken script" section
(frozen 2026-07-29) — do not paraphrase them here.
"""
import itertools
import json
import os
import re
import subprocess
import sys

API = os.environ.get("QLOBE_QWEN_URL") or sys.exit("set QLOBE_QWEN_URL")
REF = os.environ.get("QLOBE_VOICE_REF") or sys.exit("set QLOBE_VOICE_REF")
DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRCV = os.path.join(DIR, "assets", "source", "voice")
OUT = os.path.join(DIR, "assets", "audio")
DATA = os.path.join(DIR, "data")
os.makedirs(SRCV, exist_ok=True)
os.makedirs(OUT, exist_ok=True)
os.makedirs(DATA, exist_ok=True)

LINES = {
    # --- global -------------------------------------------------------
    "intro": "Welcome to the world music festival! Pick a lantern on the map, and let's dance around the world!",
    "choose-prompt": "Where shall we dance? Tap a glowing lantern on the map!",
    "your-turn": "Now it's your turn! Watch the dancer, and find the matching move!",
    "copy-intro": "Can you copy the dance? Watch closely!",
    "map-prompt": "You earned the dance card! Drag it home to its place on the map!",
    "placed-cheer": "You did it! The card is home!",
    "collection-complete": "Hooray! You danced all around the whole wide world! What a festival!",
    "again-prompt": "Tap another lantern to keep dancing!",
    "nudge-copy": "Good try! Watch the dancer one more time, then tap the move that matches.",
    "nudge-map": "Almost! Look for the glowing lantern, and drop the card right there.",
    "nudge-idle": "Tap a card to keep the party going!",
    "praise-1": "Yes! That's the move!",
    "praise-2": "You found it! Beautiful dancing!",
    "praise-3": "Wonderful! You've got the rhythm!",
    "praise-4": "That's it! What a dancer you are!",
    # --- india ----------------------------------------------------------
    "greet-india": "Namaste! We're in India! This dance is called Kathak. Hear the sitar sing — watch the dancer twirl!",
    "fact-india": "In India, Kathak dancers wear tiny bells on their ankles that jingle with every step!",
    "move-india-1": "Twirl like a spinning wheel! Find the twirling move!",
    "move-india-2": "Stamp, stamp, jingle the bells! Find the stamping move!",
    "move-india-3": "Wave your arms like a swaying lotus! Find the waving move!",
    # --- brazil -----------------------------------------------------------
    "greet-brazil": "Olá! Welcome to Brazil! It's carnival time — this dance is the samba!",
    "fact-brazil": "In Brazil, samba dancers parade through the streets at carnival, with feathers as bright as parrots!",
    "move-brazil-1": "Bounce with quick, happy feet! Find the bouncing move!",
    "move-brazil-2": "Open your arms wide and sway! Find the swaying move!",
    "move-brazil-3": "Spin and let the feathers fly! Find the spinning move!",
    # --- japan --------------------------------------------------------
    "greet-japan": "Konnichiwa! We're in Japan! At the summer festival, everyone dances the Bon Odori!",
    "fact-japan": "In Japan, people dance Bon Odori in a big circle around a tower of drums, under paper lanterns!",
    "move-japan-1": "Reach up high, like catching the moon! Find the reaching move!",
    "move-japan-2": "Clap, then take a little step! Find the clapping move!",
    "move-japan-3": "Sweep your fan through the air! Find the fan move!",
    # --- ghana --------------------------------------------------------
    "greet-ghana": "Akwaaba! Welcome to Ghana! Hear the drums? This dance is called Kpanlogo!",
    "fact-ghana": "In Ghana, drummers and dancers talk to each other — the drum asks, and the dancer answers!",
    "move-ghana-1": "Stomp and clap with the big drum! Find the stomping move!",
    "move-ghana-2": "Bend your knees and row like a boat! Find the rowing move!",
    "move-ghana-3": "Make great big circles with your arms! Find the circling move!",
    # --- mexico -------------------------------------------------------
    "greet-mexico": "¡Hola! We're in Mexico! The trumpets are playing — it's time for folklórico!",
    "fact-mexico": "In Mexico, folklórico dancers swish giant rainbow skirts that swirl like butterfly wings!",
    "move-mexico-1": "Swish your skirt from side to side! Find the swishing move!",
    "move-mexico-2": "Tap your heels, quick quick quick! Find the heel-tapping move!",
    "move-mexico-3": "Twirl till your skirt opens like a flower! Find the twirling move!",
    # --- ireland ------------------------------------------------------
    "greet-ireland": "Hello from Ireland! The tin whistle is playing a jig — quick, dancing feet!",
    "fact-ireland": "In Irish dancing, your feet hop and skip as fast as raindrops, but your arms stay very still!",
    "move-ireland-1": "Hop and kick, light as a feather! Find the hopping move!",
    "move-ireland-2": "Point your toe, tip tap tip! Find the toe-pointing move!",
    "move-ireland-3": "Quick feet, then a little spin! Find the quick-feet move!",
}

# Per-line loanword substitution table. Each entry is a list of
# {"word": <as it appears in LINES[key]>, "variants": [<alt spellings>]}
# pairs; a key may carry more than one substitutable word.
ALTERNATES = {
    "greet-india": [
        {"word": "Namaste", "variants": ["Namastay"]},
    ],
    "greet-brazil": [
        {"word": "Olá", "variants": ["Ola"]},
    ],
    "greet-japan": [
        {"word": "Konnichiwa", "variants": ["Konichiwa"]},
        {"word": "Bon Odori", "variants": ["Bonodori", "Bon-Odori"]},
    ],
    "fact-japan": [
        {"word": "Bon Odori", "variants": ["Bonodori", "Bon-Odori"]},
    ],
    "greet-ghana": [
        {"word": "Akwaaba", "variants": ["Akwaba", "Aquaba"]},
        {"word": "Kpanlogo", "variants": ["Panlogo", "Kpanlongo"]},
    ],
    "greet-mexico": [
        {"word": "folklórico", "variants": ["folklorico", "folclorico"]},
    ],
    "fact-mexico": [
        {"word": "folklórico", "variants": ["folklorico", "folclorico"]},
    ],
}

SEEDS = [7, 8, 9]


def norm(s):
    # Space-insensitive: whisper legitimately splits compounds ("paper clip").
    # Also strips diacritics along with everything else non-alphanumeric —
    # ALTERNATES exists precisely to offer an ASCII spelling for lines that
    # would otherwise normalize into a mangled, unmatchable stump.
    return re.sub(r"[^a-z0-9]", "", s.lower())


def candidate_texts(key, text):
    """All acceptable renderings of `text`: itself, plus every combination
    of one alternate spelling per substitutable word."""
    subs = ALTERNATES.get(key, [])
    if not subs:
        return [text]
    variant_lists = [[s["word"]] + list(s["variants"]) for s in subs]
    out = []
    for combo in itertools.product(*variant_lists):
        t = text
        for s, chosen in zip(subs, combo):
            t = t.replace(s["word"], chosen)
        out.append(t)
    return out


def matches(key, text, heard):
    heard_n = norm(heard)
    return any(norm(cand) == heard_n for cand in candidate_texts(key, text))


def tts(text, seed, flac):
    subprocess.run(
        ["curl", "-s", "-X", "POST", f"{API}/workflows/qwen3-tts-voiceclone?sync=true",
         "-F", f"voice=@{REF}", "-F", f"text={text}", "-F", f"seed={seed}",
         "--output", flac, "--max-time", "900"], check=True)
    return os.path.exists(flac) and os.path.getsize(flac) > 5000


def whisper(flac, size="small"):
    r = subprocess.run(
        ["curl", "-s", "-X", "POST", f"{API}/workflows/whisper-stt?sync=true",
         "-F", f"audio=@{flac}", "-F", f"model_size={size}", "-F", "language=en",
         "--max-time", "300"], capture_output=True, text=True)
    try:
        j = json.loads(r.stdout)
        return j.get("text") or j.get("transcript") or r.stdout
    except Exception:  # noqa: BLE001
        return r.stdout


def dur(path):
    r = subprocess.run(["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
                        "-of", "csv=p=0", path], capture_output=True, text=True)
    try:
        return round(float(r.stdout.strip()), 3)
    except ValueError:
        return None


def main():
    qa_path = os.path.join(SRCV, "qa-transcripts.json")
    qa = json.load(open(qa_path)) if os.path.exists(qa_path) else {}
    for key, text in LINES.items():
        m4a = os.path.join(OUT, f"{key}.m4a")
        if os.path.exists(m4a) and qa.get(key, {}).get("pass"):
            print(f"skip {key}", flush=True)
            continue
        ok = False
        for seed in SEEDS:
            flac = os.path.join(SRCV, f"{key}-s{seed}.flac")
            if not (os.path.exists(flac) and os.path.getsize(flac) > 5000):
                if not tts(text, seed, flac):
                    print(f"TTS-FAIL {key} seed {seed}", flush=True)
                    continue
            heard = whisper(flac).strip()
            match = matches(key, text, heard)
            qa[key] = {"seed": seed, "intended": text, "heard": heard, "pass": match}
            json.dump(qa, open(qa_path, "w"), indent=1)
            if match:
                subprocess.run(
                    ["ffmpeg", "-y", "-v", "quiet", "-i", flac, "-c:a", "aac",
                     "-b:a", "64k", "-movflags", "+faststart", m4a], check=True)
                print(f"done {key} seed {seed} ({dur(m4a)}s)", flush=True)
                ok = True
                break
            print(f"MISMATCH {key} seed {seed}: heard {heard!r}", flush=True)
        if not ok:
            print(f"REJECTED {key} — no passing take; runtime falls back to Web Speech",
                  flush=True)
    manifest = {}
    for key in LINES:
        m4a = os.path.join(OUT, f"{key}.m4a")
        if os.path.exists(m4a) and qa.get(key, {}).get("pass"):
            manifest[key] = {"file": f"{key}.m4a", "dur": dur(m4a)}
    json.dump(manifest, open(os.path.join(OUT, "manifest.json"), "w"), indent=1)
    lines_meta = {k: {"text": v} for k, v in LINES.items()}
    json.dump(lines_meta, open(os.path.join(DATA, "lines.json"), "w"), indent=1)
    print(f"VOICE DONE — {len(manifest)}/{len(LINES)} clips shipped", flush=True)


if __name__ == "__main__":
    main()
