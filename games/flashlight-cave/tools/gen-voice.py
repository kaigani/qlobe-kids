#!/usr/bin/env python3
"""Generate Flashlight Cave's one voice — Ari the armadillo — from config.json.

config.json's `voice` map is the single authoring source for every spoken
line. This script clones each line from Ari's reference, converts to AAC,
transcribes it back with Whisper, and writes the runtime manifest plus the
derived lines.json the Web Speech fallback reads. It also registers the 26
shared letter-phonic clips (reused, not recorded) with their real measured
durations, so the manifest is complete for every key `js/voice.js` can ask for.

Forked from games/counting-treasure-cups/tools/gen-voice.py. One speaker
instead of two, plus the fixes the plan doc anticipated AND several more that
only surfaced once real generation started (single-word letter-name clips are
the worst case for Whisper QA — see ASSETS.md's "Production notes" for the
full story with measured before/after numbers):

  1. One voice, Ari, cloned from assets/audio/ref/ari.flac.
  2. Whisper `initial_prompt` biased toward letter names AND the 78 object
     words, or a bare "ay"/"bee"/"see" clip gets mistranscribed and rejected.
  3. ALLOWED pre-seeded with the letter-name homophone map (ay/a/eh, ...),
     matched with word-boundary regex substitution — NOT naive substring
     replace, which would corrupt any canonical word that contains a
     single-letter variant as a substring (e.g. variant "a" inside "cave").
  4. bounds() floors the lower bound at 0.20s for ^letter- keys: the default
     formula's 0.22 + 0.10*words already asks for 0.32s on a one-word clip,
     which is longer than a cleanly-trimmed single letter name often runs.
  5. Output is FLAC despite the API's ".wav" naming convention. Encode with
     afconvert (Apple's AAC encoder), not ffmpeg's, after an ffmpeg trim/
     loudnorm pass — afconvert's AAC has shipped cleaner on iOS Safari than
     ffmpeg's native aac encoder in prior QLOBE Kids batches.
  6. whisper-stt is called with language="en" forced, not "auto" — a short
     held vowel sent language auto-ID haywire (one take transcribed as
     Japanese) and the decoder looped; see transcript_ok()'s oversized-
     transcript guard for the defense-in-depth half of this fix.
  7. synth_text() capitalizes the first letter of whatever is actually sent
     to the clone and ensures trailing punctuation — a bare lowercase
     unpunctuated one/two-letter string ("ee") synthesizes near-silently.
  8. synth_text() also spells out a leading bare capital letter ("C is for
     cat!" -> "See is for cat!") — cloning a bare single-letter word
     immediately followed by more words gets swallowed or misheard on every
     seed otherwise; this alone fixed 8 of the 78 isfor-* clips.
  9. SYNTH_OVERRIDE hand-lists 4 letter keys this specific clone
     mis-articulates identically on every seed (not noise) — an alternate
     spelling fixed 2 of the 4; the other 2 still ship unrecorded.

A clip that still fails after 5 seeds ships UNRECORDED: no manifest entry,
loudly flagged in qa.json, and voice.js speaks the identical lines.json text
through Web Speech instead. Degrades, never breaks.

    export QLOBE_QWEN_URL=http://<host>:<port>
    python3 games/flashlight-cave/tools/gen-voice.py                  # missing only
    python3 games/flashlight-cave/tools/gen-voice.py --only letter-a ari-welcome
    python3 games/flashlight-cave/tools/gen-voice.py --force --seed 1337
    python3 games/flashlight-cave/tools/gen-voice.py --max-seconds 480  # one chunk

Idempotent and resumable: a key whose .m4a already exists is skipped, and a
key that has already exhausted all 5 seeds is skipped too (flagged
"unrecorded": true in qa.json) unless --force or --only names it. So running
this repeatedly with --max-seconds to stay under a wall-clock budget is
exactly how the whole 131-clip batch gets chunked.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from collections import Counter
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]
REPO_ROOT = GAME.parent.parent
AUDIO = GAME / "assets" / "audio"
REF = AUDIO / "ref"

# One speaker. Every key in config.json's voice map clones from Ari.
ARI_REF = REF / "ari.flac"

# Seed ladder: first attempt, then up to 4 retries on QA failure (5 total).
SEED_LADDER = [42, 1337, 9001, 4242, 1010]

# The 78 object words from letter-objects.json / the isfor-* lines, plus the
# cave/guide vocabulary from the ari-* and stem lines. Whisper's initial_prompt
# steers it toward this vocabulary so a single spoken letter name or a short
# object word isn't mistranscribed as something else entirely.
WHISPER_PROMPT = (
    "A friendly guide named Ari naming letters of the alphabet in a cave: "
    "ay bee see dee ee eff gee aitch eye jay kay ell emm enn oh pee cue arr "
    "ess tee you vee double-you ex why zee. "
    "A cave, a flashlight, exploring, finding, listening. "
    "apple ant alligator bear butterfly banana cat car cake dog duck dinosaur "
    "elephant egg eagle frog fish flower goat guitar grapes horse hat house "
    "igloo iguana ice cream jellyfish jam jet kite kangaroo key lion leaf "
    "lemon monkey moon mushroom nest nut narwhal octopus owl orange pig "
    "penguin pumpkin queen quilt quail rabbit robot rainbow snake star "
    "strawberry turtle tiger train umbrella unicorn ukulele violin volcano "
    "van whale watermelon wagon xylophone x-ray fish treasure map yak yoyo "
    "yarn zebra zipper zeppelin."
)

# Whisper spells a spoken letter name or short word its own way — these are
# known-good renderings, not failures. canonical -> [variant, ...]. Matched
# with \bvariant\b (word-boundary regex), never a naive substring .replace():
# a naive replace of the 1-character variant "a" would corrupt "cave" (which
# contains the letter "a") into "cayve" wherever it appears in a longer line.
ALLOWED = {
    "ay": ["a", "eh"],
    "bee": ["b", "be"],
    "see": ["c", "sea"],
    "dee": ["d"],
    "ee": ["e", "eee"],
    "eff": ["f"],
    "gee": ["g", "jee"],
    "aitch": ["h"],
    "eye": ["i"],
    "jay": ["j"],
    "kay": ["k"],
    "ell": ["l"],
    "emm": ["m"],
    "enn": ["n"],
    # a held "oh" is exactly the vowel Whisper is likeliest to spell as a
    # drawn-out "ooh"/"oooh" rather than the letter "o" — a single token like
    # that is a fine transcription, unlike the repetition-loop hallucination
    # transcript_ok()'s oversized-transcript guard rejects separately.
    "oh": ["o", "owe", "ooh", "oooh", "ohh", "ooo"],
    "pee": ["p"],
    "cue": ["q", "queue"],
    "arr": ["r", "are"],
    "ess": ["s"],
    "tee": ["t", "tea"],
    "you": ["u", "ewe"],
    "vee": ["v"],
    "double you": ["w", "double u", "double-you"],
    "ex": ["x"],
    "why": ["y"],
    "zee": ["z", "zed"],
}

# letter -> its spoken name, exactly the letter-* voice map's own spellings.
# Used by synth_text() to fix a confirmed isfor-* synthesis failure: cloning a
# BARE capital letter immediately followed by more words ("C is for cat!")
# gets swallowed or misheard by the model on every seed of the ladder ("X is
# for cat." / "is for cat.", tested seeds 42/1337/9001/4242/1010, all wrong).
# Spelling the letter out ("See is for cat!") fixes it: the model needs an
# actual word to articulate, not a bare grapheme mid-sentence. Whisper then
# reliably reads the result back as the plain letter ("C is for cat."), which
# ALLOWED already reconciles against the stored, unmodified "C is for cat!".
LETTER_NAMES = {
    "a": "ay", "b": "bee", "c": "see", "d": "dee", "e": "ee", "f": "eff",
    "g": "gee", "h": "aitch", "i": "eye", "j": "jay", "k": "kay", "l": "ell",
    "m": "emm", "n": "enn", "o": "oh", "p": "pee", "q": "cue", "r": "arr",
    "s": "ess", "t": "tee", "u": "you", "v": "vee", "w": "double you",
    "x": "ex", "y": "why", "z": "zee",
}


def api(path: str) -> str:
    base = os.environ.get("QLOBE_QWEN_URL", "").rstrip("/")
    if not base:
        sys.exit("QLOBE_QWEN_URL is not set (see .claude/skills/local-genai)")
    return f"{base}{path}"


def post_multipart(url: str, fields: dict, files: dict) -> bytes:
    boundary = "----qlobe" + os.urandom(8).hex()
    body = bytearray()
    for name, value in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"\r\n\r\n{value}\r\n".encode()
    for name, path in files.items():
        body += (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; "
            f"filename=\"{Path(path).name}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        ).encode()
        body += Path(path).read_bytes() + b"\r\n"
    body += f"--{boundary}--\r\n".encode()
    req = urllib.request.Request(url, data=bytes(body),
                                 headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    with urllib.request.urlopen(req, timeout=900) as resp:
        return resp.read()


DIGITS = {"1": "one", "2": "two", "3": "three", "4": "four",
          "5": "five", "6": "six", "7": "seven", "8": "eight"}


def normalize(s: str) -> str:
    s = s.lower().replace("’", "'")
    # "H's for hat" is a transcription artifact of natural speech eliding
    # "H is" into a possessive-sounding contraction, not a pronunciation
    # error — confirmed on isfor-hat/isfor-horse, where the audio says "H is"
    # cleanly but Whisper spells it "h's". Convert BEFORE the apostrophe strip
    # below so "h's" becomes "h is" rather than collapsing into "hs" (which
    # would never match "h is" on either the exact or word-overlap check).
    # Scoped to a single letter + 's so it can't misfire on real contractions
    # ("let's", "it's") — those have 2+ letters before the apostrophe.
    s = re.sub(r"\b([a-z])'s\b", r"\1 is", s)
    s = s.replace("'", "")
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return " ".join(DIGITS.get(w, w) for w in s.split())


def canonicalize(s: str) -> str:
    """Fold known homophones/variants to their canonical spelling, matched as
    whole words (or word-boundary phrases) only — see ALLOWED's docstring."""
    for canonical, variants in ALLOWED.items():
        for v in variants:
            s = re.sub(r"\b" + re.escape(v) + r"\b", canonical, s)
    return " ".join(s.split())


def transcript_ok(key: str, said: str, want: str) -> bool:
    a = canonicalize(normalize(said))
    # A hyphenated compound like "yo-yo" is exactly one word phonetically —
    # normalize() turns the hyphen into a space (needed so "double-you"
    # folds to the ALLOWED canonical "double you"), which makes the *wanted*
    # text two tokens ("yo yo") while Whisper reliably transcribes the
    # *spoken* clip as one joined word ("yoyo", no hyphen at all). Confirmed
    # on isfor-yoyo: "why is for yoyo?" is a semantically perfect reading of
    # "Y is for yo-yo!" that the old checker failed purely on tokenization.
    # Compare against both the spaced and the joined rendering of `want`
    # rather than guessing which one Whisper will produce.
    want_variants = [want]
    if "-" in want:
        want_variants.append(want.replace("-", ""))

    b_primary = canonicalize(normalize(want_variants[0]))
    wb_primary = b_primary.split()
    if not wb_primary:
        return False
    wa = a.split()
    # A short held vowel (letter-a/e/i/o/u, "ah"/"oh"/"ee"...) can send Whisper
    # into a repetition-loop hallucination — dozens of copies of one syllable
    # instead of a clean transcript. A single stray token in that garbage can
    # coincidentally match the wanted word and pass the ratio check below even
    # though the transcript is nonsense, so a wildly oversized transcript is
    # rejected outright rather than scored on overlap. (main()'s generation
    # loop also re-transcribes once with a different decode setting whenever
    # it sees this exact shape, so a genuinely good clip gets a second,
    # cleaner transcript before it ever reaches this guard.)
    if len(wa) > max(6, 3 * len(wb_primary)):
        return False

    for wv in want_variants:
        b = canonicalize(normalize(wv))
        if a == b:
            return True
        wb = b.split()
        if not wb:
            continue
        if key.startswith("letter-"):
            # A held single-letter sound is often transcribed as a run of
            # repeated characters ("ooooh" for "oh", "eee" for "ee") rather
            # than the letter name's own spelling. Collapsing runs of a
            # repeated character to one copy generalizes the ALLOWED
            # homophone leniency without hand-listing every possible repeat
            # count. Scoped to ^letter- only — collapsing repeats on every
            # clip risks silently merging unrelated short words elsewhere
            # (e.g. "book" / "bok").
            ca = re.sub(r"(.)\1+", r"\1", a)
            cb = re.sub(r"(.)\1+", r"\1", b)
            if ca == cb:
                return True
        hits = sum(1 for w in wb if w in wa)
        if hits / len(wb) >= 0.8:
            return True
    return False


def is_degenerate_repeat(said: str, want: str) -> bool:
    """True if `said` looks like a Whisper decoder repetition-loop
    hallucination (the same single token repeated dozens of times) rather
    than a real transcript worth judging at all — confirmed on letter-n,
    where a 0.55s clip came back as "n n n n n n n..." x100+. This is a QA
    ARTIFACT, not evidence the audio is bad, so main() re-transcribes once
    with a different decode setting before ever handing the result to
    transcript_ok(), instead of letting the oversized-transcript guard there
    silently count the loop as a failure."""
    toks = normalize(said).split()
    want_toks = normalize(want).split() or [""]
    if len(toks) < 8 or len(toks) <= 4 * len(want_toks):
        return False
    token, count = Counter(toks).most_common(1)[0]
    return count / len(toks) > 0.8


# A few letter names hit a THIRD, letter-specific failure mode no general
# rule fixes: this clone consistently mis-articulates them the same way on
# every seed of the ladder (all 5 seeds of "Ell." -> Whisper heard "owl"; all
# 5 of "Arr." -> "or"), so retrying seeds cannot help — it is not noise. An
# alternate spelling of the same sound fixed each one (verified: Whisper reads
# the clone of "El."/"Ar."/"Ef." back as the bare letter "L"/"R"/"F", which
# ALLOWED already accepts as a homophone of "ell"/"arr"/"eff"). "N" needed the
# bare letter itself, "N." — confirmed across 2 seeds, not every seed, so it
# still rides the normal retry ladder rather than being assumed infallible.
# Keyed by exact voice-map key, not by pattern, because this is a small,
# specific list of known-hard clips, not a general rule like the two above.
SYNTH_OVERRIDE = {
    "letter-l": "Ell.",
    "letter-r": "Ar.",
    "letter-f": "Ef.",
    "letter-n": "Enne.",
    # "H is for horse!" slurs "aitch is" into "ages"/"h's" on this clone in
    # this specific sentence (worse than isfor-hat's milder elision) —
    # spelling the letter name out, as LETTER_NAMES/synth_text() already does
    # for bare leading capitals, gives the model an actual word to articulate.
    "isfor-horse": "Aitch is for horse!",
}


def synth_text(key: str, text: str) -> str:
    """Text actually sent to the TTS clone — never the bare, lowercase,
    unpunctuated string a short one/two-letter line is authored as. Confirmed
    failure mode: cloning the literal text "ee" comes back near-silent
    (-91 dB mean, on 4 of 5 ladder seeds) while "Ee." synthesizes normally
    (-26 dB) — the audio equivalent of the "near-blank white PNG" failure
    documented for image generation. It is the leading-capital that matters,
    not the period alone: "ee." (lowercase, punctuated) still came back at
    -91 dB, but "Ee" (capitalized, no period) was already fine at -28 dB.
    Capitalizing gives the model's text frontend a token it reads as the
    start of a sentence rather than a bare trailing phoneme; both changes are
    applied together since a trailing period is harmless and helps prosody on
    the rest of the batch.

    Separately: a bare capital letter immediately followed by more words
    ("C is for cat!") is a second, distinct failure mode — see LETTER_NAMES'
    docstring — fixed by spelling the letter out ("See is for cat!") before
    the capitalize/punctuate step above.

    lines.json/manifest/qa always store and compare the ORIGINAL text exactly
    as authored — this function only changes what is spoken to produce the
    clip."""
    if key in SYNTH_OVERRIDE:
        return SYNTH_OVERRIDE[key]
    m = re.match(r"^([A-Za-z])\b(.*)$", text)
    if m and m.group(1).lower() in LETTER_NAMES:
        text = LETTER_NAMES[m.group(1).lower()].capitalize() + m.group(2)
    t = text[:1].upper() + text[1:] if text else text
    return t if t[-1:] in ".!?…" else t + "."


def transcribe(path: Path, *, model_size: str = "base") -> str:
    """One whisper-stt call. `model_size` is the "different decode setting"
    used for the repetition-loop retry below — the bigger model is
    materially less prone to the greedy-decode repeat loop that a short,
    acoustically flat held sound (letter-n's nasal hum) can trigger."""
    got = json.loads(post_multipart(
        api("/workflows/whisper-stt?sync=true"),
        {"model_size": model_size, "language": "en", "initial_prompt": WHISPER_PROMPT},
        {"audio": str(path)}))
    return got.get("text", "").strip()


def duration(path: Path) -> float:
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True)
    return round(float(out.stdout.strip()), 2)


# The clone pads short utterances with silence — trim both ends, then level so
# every clip sits at one volume regardless of how loud that seed's take ran.
TRIM = (
    "silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,"
    "areverse,"
    "silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,"
    "areverse,"
    "loudnorm=I=-16:TP=-1.5:LRA=11"
)


def encode(src: Path, dst: Path) -> float:
    """Trim/level with ffmpeg to an intermediate WAV, then encode to AAC with
    afconvert (Apple's encoder) rather than ffmpeg's — the API's output is
    FLAC despite its .wav-shaped API name, and afconvert's AAC has shipped
    more reliably on iOS Safari than ffmpeg's native aac encoder."""
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        trimmed = Path(tmp.name)
    try:
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", TRIM,
                        "-c:a", "pcm_s16le", "-ar", "24000", "-ac", "1", str(trimmed)], check=True)
        if dst.exists():
            dst.unlink()
        subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "64000",
                        str(trimmed), str(dst)], check=True)
    finally:
        trimmed.unlink(missing_ok=True)
    return duration(dst)


def bounds(key: str, text: str) -> tuple[float, float]:
    """Plausible spoken length for this line — catches both silent clips and
    the runaway-silence failure mode without hand-tuning every key. One-word
    ^letter- clips get their lower bound floored at 0.20s: the default
    formula's 0.32s for one word is longer than a cleanly-trimmed single
    letter name often runs, and would reject a genuinely good clip as
    "too short"."""
    words = max(1, len(text.split()))
    lo, hi = 0.22 + 0.10 * words, 1.8 + 0.75 * words
    if re.match(r"^letter-", key):
        lo = min(lo, 0.20)
    return lo, hi


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=None, help="override the first seed tried (default: the ladder's first, 42)")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", nargs="*", default=None)
    ap.add_argument("--skip-qa", action="store_true")
    ap.add_argument("--max-seconds", type=float, default=None,
                     help="stop after roughly this long, saving progress — lets a 9-minute Bash call chunk the batch; re-run to continue")
    args = ap.parse_args()

    if not ARI_REF.exists():
        sys.exit(f"Ari's reference voice is missing: {ARI_REF}")

    lines = json.loads((GAME / "config.json").read_text())["voice"]
    AUDIO.mkdir(parents=True, exist_ok=True)

    # lines.json is DERIVED from config.json so the recorded clip and its Web
    # Speech fallback can never drift apart.
    (AUDIO / "lines.json").write_text(json.dumps(lines, indent=1, ensure_ascii=False) + "\n")

    manifest_path = AUDIO / "manifest.json"
    manifest = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    qa_path = AUDIO / "qa.json"
    qa = json.loads(qa_path.read_text()) if qa_path.exists() else {}

    def save():
        manifest_path.write_text(json.dumps(dict(sorted(manifest.items())), indent=1) + "\n")
        qa_path.write_text(json.dumps(dict(sorted(qa.items())), indent=1, ensure_ascii=False) + "\n")

    keys = args.only if args.only else list(lines)
    seeds = ([args.seed] + [s for s in SEED_LADDER if s != args.seed]) if args.seed else list(SEED_LADDER)

    def already_done(k: str) -> bool:
        if (AUDIO / f"{k}.m4a").exists():
            return True
        return bool(qa.get(k, {}).get("unrecorded"))

    todo = [k for k in keys if args.force or args.only or not already_done(k)]
    print(f"{len(todo)} clip(s) to generate of {len(lines)} (skip-existing: {len(lines) - len(todo)} already done)")

    start = time.monotonic()
    stopped_early = False
    n_done = 0
    for i, key in enumerate(todo, 1):
        if args.max_seconds is not None and time.monotonic() - start > args.max_seconds:
            print(f"-- --max-seconds {args.max_seconds:.0f}s reached, stopping after {n_done} clip(s); re-run to continue --")
            stopped_early = True
            break
        text = lines[key]
        out = AUDIO / f"{key}.m4a"
        lo, hi = bounds(key, text)
        print(f"[{i}/{len(todo)}] {key}: {text}")
        accepted = None
        for seed in seeds:
            try:
                raw = post_multipart(api("/workflows/qwen3-tts-voiceclone?sync=true"),
                                     {"text": synth_text(key, text), "seed": str(seed)}, {"voice": str(ARI_REF)})
            except urllib.error.URLError as exc:
                print(f"  !! request failed: {exc}")
                break
            with tempfile.NamedTemporaryFile(suffix=".flac", delete=False) as tmp:
                tmp.write(raw)
                tmp_path = Path(tmp.name)
            try:
                dur = encode(tmp_path, out)
            except (subprocess.CalledProcessError, ValueError) as exc:
                # A very short/quiet held-vowel take can get silence-trimmed to
                # nothing, leaving ffprobe unable to read a duration at all —
                # that is a failed take, not a crash. Try the next seed.
                print(f"  !! encode failed at seed={seed}: {exc}")
                out.unlink(missing_ok=True)
                continue
            finally:
                tmp_path.unlink(missing_ok=True)
            said, ok = "", True
            if not args.skip_qa:
                try:
                    # language="auto" is the actual root cause of the
                    # repetition-loop hallucinations seen on short held-
                    # vowel clips (letter-e, letter-o): on ~0.6s of a pure
                    # vowel, auto language-ID sometimes misfires entirely
                    # (one take came back transcribed as Japanese) and
                    # Whisper's decoder loops. Forcing English input
                    # removes that failure mode outright rather than
                    # papering over its output.
                    said = transcribe(out)
                    if is_degenerate_repeat(said, text):
                        # The transcript itself is a QA artifact (a decoder
                        # repetition loop), not evidence the clip is bad —
                        # confirmed on letter-n ("n n n n n..." x100+ off a
                        # clean 0.55s clip). Re-transcribe once with a bigger
                        # model before judging anything; never let the looped
                        # string alone be the reason a clip fails.
                        print(f"       .. degenerate repeat in transcript, re-transcribing with model_size=small")
                        retry = transcribe(out, model_size="small")
                        if retry and not is_degenerate_repeat(retry, text):
                            said = retry
                except Exception as exc:                              # noqa: BLE001
                    said = f"<transcribe failed: {exc}>"
                ok = transcript_ok(key, said, text)
            in_range = lo <= dur <= hi
            accepted = {"want": text, "said": said, "ok": bool(ok and in_range),
                        "dur": dur, "seed": seed, "inRange": in_range,
                        "bounds": [round(lo, 2), round(hi, 2)]}
            mark = "ok " if accepted["ok"] else "RETRY"
            print(f"       {mark} seed={seed} {dur:.2f}s (want {lo:.2f}-{hi:.2f}) -> {said!r}")
            if accepted["ok"]:
                break
        if accepted is None:
            continue
        n_done += 1
        if accepted["ok"]:
            manifest[key] = {"file": f"{key}.m4a", "dur": accepted["dur"]}
            accepted["unrecorded"] = False
            qa[key] = accepted
        else:
            # Every seed on the ladder failed QA. Ships unrecorded: no manifest
            # entry, so voice.js's shared player falls through to Web Speech on
            # the identical lines.json text. Loud, not silent, in qa.json.
            print(f"  !! ALL {len(seeds)} SEEDS FAILED QA for {key!r} -- shipping UNRECORDED (Web Speech fallback)")
            manifest.pop(key, None)
            out.unlink(missing_ok=True)
            accepted["unrecorded"] = True
            qa[key] = accepted
        save()

    # Register the 26 reused shared letter-phonic clips with REAL measured
    # durations, so js/voice.js's duration() lookup works for them too. One
    # canonical copy on disk: voice-clips.js:clipUrl() passes a ../-prefixed
    # path straight through as document-relative (verified in the module).
    fragments = REPO_ROOT / "shared" / "assets" / "audio" / "fragments"
    for letter in "abcdefghijklmnopqrstuvwxyz":
        frag = fragments / f"{letter}.m4a"
        key = f"phonic-{letter}"
        if not frag.exists():
            print(f"  !! shared phonic missing: {frag}")
            continue
        manifest[key] = {"file": f"../../shared/assets/audio/fragments/{letter}.m4a",
                          "dur": duration(frag)}
    save()

    bad = [k for k, v in qa.items() if not v.get("ok")]
    recorded = [k for k in manifest if not k.startswith("phonic-")]
    print(f"\n{len(recorded)}/131 new clips recorded + accepted; "
          f"{sum(1 for k in manifest if k.startswith('phonic-'))}/26 shared phonics registered; "
          f"{len(bad)} flagged unrecorded by QA")
    for k in bad:
        print(f"  UNRECORDED {k}: want {qa[k]['want']!r} last-said {qa[k]['said']!r} (tried {len(seeds)} seeds)")
    if stopped_early:
        print("\n(stopped early on --max-seconds; re-run the same command to continue)")


if __name__ == "__main__":
    main()
