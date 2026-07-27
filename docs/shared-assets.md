# Shared learning assets — catalog & reuse

Letters, their sounds, and the picture-word objects are **shared** content: one
canonical copy under `shared/`, referenced by every game. Don't regenerate or
re-copy them per game — reach for `shared/js/content.js`, which resolves every
path for you.

## The one accessor: `shared/js/content.js`

```js
import * as content from '../../../shared/js/content.js';
await content.ready();                     // loads the data once

content.objectsStartingWith('b');
//   → [{ word:'bat', char:'🦇', img:'a cute friendly purple bat…',
//        type:'noun', onset:'b', rime:'at',
//        image:'…/objects/bat.png',
//        audio:'…/audio/words/bat.m4a',
//        celebrate:'…/audio/celebrate/bat.m4a',
//        prompt:'…/audio/prompts/bat.m4a',
//        onsetSound:'…/audio/fragments/b.m4a' }, … ]

content.letterSound('b');   // → { phonic:'buh', url:'…/fragments/b.m4a' }
content.letterInfo('b');    // → full letter record + resolved soundUrl
content.allLetters();       // → 26 letter records
content.word('cat');        // → one enriched word, or null
content.allWords();         // → all 133 enriched words
content.isforAudio('apple'); // → '…/audio/isfor/apple.m4a' ("A is for apple.")
```

Path resolvers (the single home for these conventions):
`objectImage(word)`, `wordAudio(word)`, `wordCelebrate(word)`, `wordPrompt(word)`,
`letterSoundUrl(letter)`, `isforAudio(word)`.

## Data — the sources of truth

- **`shared/data/letters.json`** — canonical A–Z. Each letter: `phonic` (the
  sound it makes), `soundClip` (the shared recording of that phonic),
  `nameClip` (the shared recording of the letter's NAME — "ay", "bee", …;
  **25/26 recorded**, promoted from `games/flashlight-cave`; `letter-l`'s
  stays `null`, a tracked gap — 20 takes across 4 spellings were all
  mistranscribed, so L falls back to Web Speech for its name), `vowel`,
  `objectCount`, and the `objects` starting with it.
- **`shared/data/words.json`** — 133 words as `onset + rime`, each with `img`
  (illustration subject), `char` (emoji fallback), `type`. `onsets`/`rimes`
  map each part to its spoken form. This drives image + audio generation.

## Assets on disk

| What | Location | Naming | Count |
|---|---|---|---|
| Picture-word cards | `shared/assets/objects/` | `<word>.png` | 134 |
| Letter/onset tiles | `shared/assets/letter-tiles/` | onset/rime tiles | 56 |
| **Letter phonic sounds** | `shared/assets/audio/fragments/` | `<letter>.m4a` (a–z) + rimes | **26/26 letters** |
| **Letter NAME sounds** | `shared/assets/audio/letters/` | `<letter>.m4a` (a–z) | **26/26 letters** |
| **"[Letter] is for [word]" pairings** | `shared/assets/audio/isfor/` | `<word>.m4a` | 78 |
| Spoken words | `shared/assets/audio/words/` | `<word>.m4a` | 133 |
| Word — celebratory | `shared/assets/audio/celebrate/` | `<word>.m4a` | 133 |
| Word — prompt | `shared/assets/audio/prompts/` | `<word>.m4a` | 133 |
| Prize-reveal ("You won a …") | `shared/assets/audio/prizes/` | `<word>.m4a` | 78 |
| Misc chrome | `shared/assets/audio/misc/` | named clips | 8 |
| Teacher voice | warm preschool-teacher clone; ref committed at `shared/assets/refs/voice-teacher.wav` | — | — |

`shared/assets/audio/manifest.json` indexes every clip (`{file, dur}`), keyed by
category; `_v` bumps on each audio release.

## Coverage & gaps (tracked in letters.json)

- **Phonic letter sounds: all 26 A–Z.** The 19 consonants come from the Sound
  Sprouts onset library; the 7 with no CVC onset (A E I O U Q X) were added as
  short phonic recordings.
- **Objects by letter:** the 19 consonants have 2–13 illustrated words each
  (image + 3 audio variants, 100% covered). The 7 non-onset letters have no
  objects (no vowel-/Q-/X-initial words in the CVC set) — an intentional gap,
  visible as `objectCount: 0`.
- **Letter *names*** (saying "bee", "see"): **all 26 recorded**, promoted from
  `games/flashlight-cave` — `nameClip` in `letters.json` holds a path for
  every letter. `L` took a different route worth remembering: 20 takes across
  4 spellings all failed QA out of the voice clone, because the clone's
  grapheme-to-phoneme step kept turning "ell" into something whisper heard as
  "owl". The fix was to bypass g2p entirely — `geeky-kokoro-tts` in **phoneme
  mode** (`use_phonemes=true`, text `ˈɛl`) to get the articulation exactly
  right, then `chatterbox-v2v` to convert that take into the platform teacher
  voice using the same reference clip the clone uses. Reach for that pair
  whenever a short, phonetically awkward utterance resists the clone.
  Note also that `whisper-base` returns a degenerate repeat loop on very
  short isolated clips where `whisper-small` reads them correctly — QA a
  sub-second clip at `small` before believing it failed.
- **"[Letter] is for [word]" pairings** (`isforAudio(word)`, e.g. "A is for
  apple."): 78 clips, one per curated `letterObjects()` entry, promoted from
  `games/flashlight-cave`. These are a **different line** from the existing
  `shared/assets/audio/prizes/` clips (`prizeAudio(word)`), which open with
  "You won a [word]." — prize-ceremony wording specific to a reward reveal.
  Use `isforAudio` for plain letter/word pairing in any context, `prizeAudio`
  only when the game actually stages a win.

## Reuse rule

New games should pull letters/words/sounds through `content.js`, not copy files
in. `voice-clips.js` supports this directly: a manifest entry whose `file` path
escapes the game's audio dir (starts with `../`) or is a full URL is used as-is,
so a game can register a shared clip in its manifest — e.g.
`"sound-B": { "file": "../../shared/assets/audio/fragments/b.m4a" }`.
`games/sand-tray-letters/` does exactly this for its 19 consonant phonics
(reconciled 2026-07-14 — no local duplicates remain).
