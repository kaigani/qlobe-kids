#!/usr/bin/env python3
"""Regenerate games/blend-train/config.json from the shared content library.

The word list is DERIVED, not hand-written: every three-letter object card in
shared/assets/objects/ that is a strict consonant-vowel-consonant word AND has the
complete recorded audio the game needs — a fragment clip for each of its three sounds,
and a celebration clip for the whole word. That is 133 words. Deriving it means the list
grows by itself when the shared library does, and can never drift into naming a word whose
sound is missing.

Run from the repo root:  python3 games/blend-train/tools/build-config.py

Colour carries the phonics role, and a letter that plays two roles needs two cars — `t` is
a blue onset in "tap" and a red coda in "cat" — hence the role-prefixed car art names.

  blue   onset consonant        car-onset-<x>.webp
  green  vowel                  car-vowel-<x>.webp
  red    coda consonant         car-coda-<x>.webp
  orange rime, FRONT vowel a/e/i  car-rime-<xy>.webp
  purple rime, BACK vowel o/u     car-rime-<xy>.webp

Why two chunk colours: in Couple mode the child never sees a separate vowel car, so the
vowel is hidden inside the chunk. Colouring the chunk by where that vowel is made in the
mouth puts a cue back on a sound that would otherwise be invisible. Two colours cannot
encode five vowels, but front/back is a split the mouth genuinely makes.
"""
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
GAME = os.path.join(ROOT, 'games', 'blend-train')
OBJ = os.path.join(ROOT, 'shared', 'assets', 'objects')
AUD = os.path.join(ROOT, 'shared', 'assets', 'audio')

VOWELS = set('aeiou')
FRONT = set('aei')          # orange chunks
BACK = set('ou')            # purple chunks

# Spoken fallbacks, only ever reached if a recording is missing. They spell the SOUND:
# "m" would be read as the letter name ("em"), which is the wrong thing in a blending game.
PHONIC = {
    'a': 'aaa', 'b': 'buh', 'c': 'kuh', 'd': 'duh', 'e': 'eh', 'f': 'ff', 'g': 'guh',
    'h': 'huh', 'i': 'ih', 'j': 'juh', 'k': 'kuh', 'l': 'll', 'm': 'mmm', 'n': 'nnn',
    'o': 'oh', 'p': 'puh', 'r': 'rr', 's': 'sss', 't': 't', 'u': 'uh', 'v': 'vv',
    'w': 'wuh', 'x': 'ks', 'y': 'yuh', 'z': 'zz',
}

# How many words one sitting plays. The engine shuffles the full list and takes this many,
# so a child meets a different set each time instead of grinding the same five.
ROUNDS_SOUNDS = 8
ROUNDS_COUPLE = 6

# Wheels on the rail. Derived, not guessed: the sprite is contain-fit by its wider axis,
# and its solid core bottoms out at 0.9128 of sprite height, so
#   y = RAIL - drawnHeight * (0.9128 - 0.5),  RAIL = 645.
# Recompute these two numbers whenever the car sprites are re-cut — the aspect moves with
# the family's median core, and a stale value floats the whole train off the track.
CAR_Y = {380: 493, 420: 477}
X_SOUNDS = (620, 980, 1340)
X_COUPLE = (700, 1140)


def has(*parts):
    return os.path.exists(os.path.join(*parts))


def eligible():
    """Every 3-letter CVC object word whose sounds are all recorded."""
    words = sorted(os.path.splitext(f)[0] for f in os.listdir(OBJ) if f.endswith('.webp'))
    out = []
    for w in words:
        if len(w) != 3 or not w.isalpha():
            continue
        o, v, c = w
        if o in VOWELS or v not in VOWELS or c in VOWELS:
            continue
        if not has(AUD, 'celebrate', f'{w}.m4a'):
            continue
        if not all(has(AUD, 'fragments', f'{x}.m4a') for x in (o, v, c)):
            continue
        out.append(w)
    return out


def car(role, letter, x, size):
    return {
        'art': f'game:assets/art/car-{role}-{letter}.webp',
        'alt': f'{letter} sound car',
        'say': {'clip': f'letter:{letter}', 'text': PHONIC.get(letter, letter)},
        'x': x, 'y': CAR_Y[size], 'size': size,
    }


def blend(word, pieces):
    return {
        'seq': [f'letter:{p}' for p in pieces] + [f'cheer:{word}'],
        'gap': 240,
        'text': '... '.join(PHONIC.get(p, p) for p in pieces) + f'... {word}!',
    }


def build(word, parts, pieces, name):
    return {
        'name': name, 'ordered': False,
        'say': blend(word, pieces),
        'reveal': f'shared:objects/{word}.webp',
        'parts': parts,
    }


def art_exists(role, letter):
    return has(GAME, 'assets', 'art', f'car-{role}-{letter}.webp')


def main():
    words = eligible()
    rime_ok = [w for w in words if has(AUD, 'fragments', f'{w[1]}{w[2]}.m4a')]

    # Only emit a build whose cars actually exist. The word list is derived from the
    # content library, but the ART arrives in batches — so the config self-limits to what
    # is playable today and grows on its own as cars land, instead of shipping a round
    # that would render a missing-texture car.
    sounds, couple, skipped_s, skipped_c = [], [], [], []
    for w in words:
        o, v, c = w
        if art_exists('onset', o) and art_exists('vowel', v) and art_exists('coda', c):
            sounds.append(build(w, [car('onset', o, X_SOUNDS[0], 380),
                                    car('vowel', v, X_SOUNDS[1], 380),
                                    car('coda',  c, X_SOUNDS[2], 380)],
                                [o, v, c], f'{w}-sounds'))
        else:
            skipped_s.append(w)
    for w in rime_ok:
        o, rime = w[0], w[1:]
        if art_exists('onset', o) and art_exists('rime', rime):
            couple.append(build(w, [car('onset', o, X_COUPLE[0], 420),
                                    car('rime', rime, X_COUPLE[1], 420)],
                                [o, rime], f'{w}-couple'))
        else:
            skipped_c.append(w)

    print(f'{len(words)} CVC words with complete audio ({len(rime_ok)} also have a rime clip)')
    print(f'  sounds mode: {len(sounds)} playable, {len(skipped_s)} awaiting car art')
    print(f'  couple mode: {len(couple)} playable, {len(skipped_c)} awaiting car art')
    if not sounds:
        print('  refusing to write: no playable builds in sounds mode')
        return 1

    p = os.path.join(GAME, 'config.json')
    cfg = json.load(open(p))
    if couple:
        cfg['modes'][0]['builds'] = couple
        cfg['modes'][0]['rounds'] = min(ROUNDS_COUPLE, len(couple))
    cfg['modes'][1]['builds'] = sounds
    cfg['modes'][1]['rounds'] = min(ROUNDS_SOUNDS, len(sounds))
    # Never fall back to the PREVIOUS builds for a mode. That is what broke Couple mode
    # once: no rime art was derivable, so it kept the builds it already had — which
    # referenced car files that had just been deleted, and the mode hung on load instead
    # of failing visibly. A mode with no derivable builds keeps its old list ONLY if that
    # list still resolves, which the audit below enforces.
    json.dump(cfg, open(p, 'w'), indent=2)

    # Audit the written artefact, not the intention: walk every art ref in the file and
    # confirm it exists on disk.
    missing = []
    for mode in cfg['modes']:
        for b in mode['builds']:
            for ref in [b.get('reveal')] + [q['art'] for q in b['parts']]:
                if not isinstance(ref, str):
                    continue
                path = (os.path.join(GAME, ref[5:]) if ref.startswith('game:')
                        else os.path.join(ROOT, 'shared', 'assets', ref[7:])
                        if ref.startswith('shared:') else None)
                if not path:
                    continue
                if not os.path.exists(path):
                    missing.append(f'{b["name"]}: {ref} (absent)')
                elif os.path.getsize(path) == 0:
                    # A zero-byte or truncated image serves a cheerful 200 and then fails
                    # to DECODE, which surfaces as a mode that hangs on load rather than
                    # anything that looks like a missing file. Existence is not enough.
                    missing.append(f'{b["name"]}: {ref} (empty file)')
    if missing:
        print(f'  WROTE A BROKEN CONFIG — {len(missing)} unresolved ref(s):')
        for m in missing[:10]:
            print(f'    {m}')
        return 1
    print(f'  wrote config.json; every art ref resolves')
    return 0


if __name__ == '__main__':
    sys.exit(main())
