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
```

Path resolvers (the single home for these conventions):
`objectImage(word)`, `wordAudio(word)`, `wordCelebrate(word)`, `wordPrompt(word)`,
`letterSoundUrl(letter)`.

## Data — the sources of truth

- **`shared/data/letters.json`** — canonical A–Z. Each letter: `phonic` (the
  sound it makes), `soundClip` (the shared recording of that phonic),
  `nameClip` (letter-name recording — **not produced yet**, a tracked gap),
  `vowel`, `objectCount`, and the `objects` starting with it.
- **`shared/data/words.json`** — 133 words as `onset + rime`, each with `img`
  (illustration subject), `char` (emoji fallback), `type`. `onsets`/`rimes`
  map each part to its spoken form. This drives image + audio generation.

## Assets on disk

| What | Location | Naming | Count |
|---|---|---|---|
| Picture-word cards | `shared/assets/objects/` | `<word>.png` | 134 |
| Letter/onset tiles | `shared/assets/letter-tiles/` | onset/rime tiles | 56 |
| **Letter phonic sounds** | `shared/assets/audio/fragments/` | `<letter>.m4a` (a–z) + rimes | **26/26 letters** |
| Spoken words | `shared/assets/audio/words/` | `<word>.m4a` | 133 |
| Word — celebratory | `shared/assets/audio/celebrate/` | `<word>.m4a` | 133 |
| Word — prompt | `shared/assets/audio/prompts/` | `<word>.m4a` | 133 |
| Misc chrome | `shared/assets/audio/misc/` | named clips | 8 |
| Teacher voice | warm preschool-teacher clone; ref lives in the private production notes | — | — |

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
- **Letter *names*** (saying "bee", "see"): not recorded yet. `nameClip` is
  `null` across the board — the next thing to produce if a game needs spoken
  letter names rather than sounds.

## Reuse rule

New games should pull letters/words/sounds through `content.js`, not copy files
in. `voice-clips.js` supports this directly: a manifest entry whose `file` path
escapes the game's audio dir (starts with `../`) or is a full URL is used as-is,
so a game can register a shared clip in its manifest — e.g.
`"sound-B": { "file": "../../shared/assets/audio/fragments/b.m4a" }`.
`games/sand-tray-letters/` does exactly this for its 19 consonant phonics
(reconciled 2026-07-14 — no local duplicates remain).
