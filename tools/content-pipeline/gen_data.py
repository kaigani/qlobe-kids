#!/usr/bin/env python3
"""Generate sound-sprouts/js/data.js from content/words.json.
Deterministic, no API. Builds ONSETS, RIMES, WORDS, FREEPLAY_SETS, and a
SAFE dictionary-checked BONUS_WORDS list scoped to the free-play tile sets."""
import json, os, unicodedata

ROOT = "/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game"
d = json.load(open(f"{ROOT}/content/words.json"))
ONSETS, RIMES, WORDS = d["onsets"], d["rimes"], d["words"]
PIC = {w["word"]: w for w in WORDS}

ANIMAL_TYPES_CHARS = set("🐈🦇🐀🐹🐏🦫🐔🦊🐷🐘🐗🐕🐶🐐🐻🐃🐛")
def is_animal(w):
    return w["char"] in ANIMAL_TYPES_CHARS

# --- Curated free-play tile sets (each yields several picture words) ---
FREEPLAY_SETS = [
    {"onsets": ["c", "h", "b", "m"], "rimes": ["at", "ap", "ag"]},
    {"onsets": ["m", "v", "p", "f"], "rimes": ["an", "am", "ad"]},
    {"onsets": ["r", "c", "d", "s"], "rimes": ["at", "an", "ad"]},
    {"onsets": ["h", "p", "t", "n"], "rimes": ["en", "et", "ed"]},
    {"onsets": ["b", "j", "v", "w"], "rimes": ["et", "ed", "eg"]},
    {"onsets": ["p", "w", "d", "b"], "rimes": ["ig", "in", "ip"]},
    {"onsets": ["s", "f", "m", "k"], "rimes": ["it", "ix", "in"]},
    {"onsets": ["d", "l", "f", "h"], "rimes": ["og", "op", "ot"]},
    {"onsets": ["b", "f", "c", "p"], "rimes": ["ox", "ot", "op"]},
    {"onsets": ["s", "r", "b", "f"], "rimes": ["un", "ug", "up"]},
    {"onsets": ["m", "h", "j", "c"], "rimes": ["ug", "ub", "ut"]},
    {"onsets": ["m", "b", "g", "h"], "rimes": ["ud", "um", "ut"]},
]

# --- Safe bonus words: real words formable in a free-play set, not pictured ---
DICT = set(w.strip().lower() for w in open("/usr/share/dict/words"))
# Hard blocklist: never praise these as "real words" to a 4-year-old.
BLOCK = {
    "gun", "god", "sin", "gin", "rum", "bum", "cum", "pus", "fag", "tit",
    "nob", "dom", "pub", "sod", "nun", "gut", "fap", "wop", "jap", "wog",
    "yid", "nip", "ass", "pis", "wad", "zit", "rut", "bra", "hag", "gat",
    "kik", "jew", "gay", "pms", "dik", "dic", "fkn", "wog", "coon"[:3],
}

def find_bonus():
    bonus = set()
    for s in FREEPLAY_SETS:
        for o in s["onsets"]:
            for r in s["rimes"]:
                w = o + r
                if w in PIC or w in BLOCK:
                    continue
                if w in DICT:
                    bonus.add(w)
    return sorted(bonus)

BONUS_WORDS = find_bonus()

# --- emit data.js ---
def js_str(s): return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'"

def emit():
    L = []
    L.append("// AUTO-GENERATED from /content/words.json by content/gen_data.py — do not hand-edit.")
    L.append("// Pronunciation tuning lives in words.json `spoken`/rime strings.\n")
    # ONSETS
    L.append("export const ONSETS = {")
    for k, sp in ONSETS.items():
        L.append(f"  {k}: {{ spoken: {js_str(sp)} }},")
    L.append("};\n")
    # RIMES
    L.append("export const RIMES = {")
    for k, sp in RIMES.items():
        key = k if k.isalpha() else f"'{k}'"
        L.append(f"  {key}: {{ spoken: {js_str(sp)} }},")
    L.append("};\n")
    # WORDS
    L.append("export const WORDS = [")
    for w in WORDS:
        animal = "true" if is_animal(w) else "false"
        L.append("  { word: %s, onset: %s, rime: %s, char: %s, animal: %s }," % (
            js_str(w["word"]), js_str(w["onset"]), js_str(w["rime"]),
            js_str(w["char"]), animal))
    L.append("];\n")
    # BONUS
    L.append("// Real words a child can build from the tiles but that have no picture card.")
    L.append("// Dictionary-checked and safety-filtered. They get a warm 'real word!' response.")
    L.append("export const BONUS_WORDS = [")
    line = "  "
    for i, b in enumerate(BONUS_WORDS):
        line += js_str(b) + ", "
        if len(line) > 88:
            L.append(line.rstrip()); line = "  "
    if line.strip(): L.append(line.rstrip())
    L.append("];\n")
    # FREEPLAY
    L.append("export const FREEPLAY_SETS = [")
    for s in FREEPLAY_SETS:
        on = "[" + ", ".join(js_str(x) for x in s["onsets"]) + "]"
        ri = "[" + ", ".join(js_str(x) for x in s["rimes"]) + "]"
        L.append(f"  {{ onsets: {on}, rimes: {ri} }},")
    L.append("];\n")
    # PHRASES (fallback text for Web Speech; recorded clips are primary)
    L.append("""export const PHRASES = {
  celebrate: ['You made {word}!', 'Hooray! {word}!', 'Wow, you built {word}!', 'Yay! {word}!'],
  bonus: ['{word}! That is a real word too!', 'Ooh, {word} is a word! Can you find one with a picture?'],
  silly: ['{blend}! What a silly sound! Try another one.', 'Hee hee, {blend}? That is so silly! Try again.'],
  guidedPrompt: ['Can you make {word}?', 'Let\\u2019s build {word}!'],
  mysteryPrompt: ['Mystery word! Listen. {onset}. {rime}. What does it make?'],
};
""")
    return "\n".join(L)

out = f"{ROOT}/sound-sprouts/js/data.js"
open(out, "w").write(emit())

# report
yields = []
for s in FREEPLAY_SETS:
    n = sum(1 for o in s["onsets"] for r in s["rimes"] if o + r in PIC)
    yields.append(n)
print("WORDS:", len(WORDS))
print("BONUS_WORDS:", len(BONUS_WORDS))
print(" ", " ".join(BONUS_WORDS))
print("FREEPLAY_SETS:", len(FREEPLAY_SETS), "picture-word yields:", yields)
low = [i for i, n in enumerate(yields) if n < 4]
if low: print("WARN: low-yield sets:", low)
print("animals:", sum(1 for w in WORDS if is_animal(w)))
print("wrote", out)
