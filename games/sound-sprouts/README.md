# Sound Sprouts 🌱

> **Part of [QLOBE Kids](../../README.md).** This game now lives inside the QLOBE
> Kids platform monorepo and shares its art, voice, fonts, and code library from
> the repo-root `shared/` folder. The standalone `sound-sprouts` repo is the
> pre-platform version; this is the canonical one.

A gentle ThreeJS phonics word-builder for a 4-year-old. Tap big sound tiles,
hear each sound spoken, blend them into a word, hear the word, see a picture,
get confetti. No score, no failure, no reading required to play.

**133 illustrated CVC words** across all five short vowels (19 beginning sounds ×
37 ending chunks), every one with its own custom picture — nouns plus verbs and
adjectives drawn as little scenes (run, hug, wet, big, sad).

Designed and tuned for **iPad Safari** (huge touch targets, immediate audio +
visual feedback on every tap), and works on desktop browsers too.

## The three modes

- 🎯 **Make a Word** — a goal picture appears; build the word from four tiles.
  "Wrong" picks usually still land on a real word, so it always feels like a win.
- ❓ **Mystery Picture** — same building, but the goal is hidden behind a `?`.
  Finish a word and the picture is revealed. The suspense is the fun part.
- 🎨 **Word Mixer** — free play. Mix four beginning sounds and three endings;
  every real picture-word you find is added to a little garden row at the top.

Every mode uses the same friendly build mechanic: tap a tile to hear its sound,
it flies to the bench, fill both slots, and the game cheers, sparkles, or makes
a silly noise — never anything negative.

## Run it locally

No build step. Serve the **repo root** over HTTP (ES modules need a server, and
the game loads shared assets from `../../shared/`, so you must serve from the
root — not this folder):

```sh
cd qlobe-kids          # the repo root
python3 -m http.server 8000
```

Then open <http://localhost:8000/games/sound-sprouts/> (use a recent
Chrome/Safari/Edge).

> Open it on an iPad on the same network for the intended experience.

## Live demo

https://kaigani.github.io/qlobe-kids/games/sound-sprouts/

## How it works

- Plain ES modules, no framework, no bundler. Served straight from disk.
- ThreeJS (vendored locally) draws the glossy letter tiles and picture cards over
  an illustrated garden background with a podium stage.
- **A consistent warm "preschool teacher" voice** speaks every sound, word, and
  encouragement — 463 short clips in `assets/audio/`, played from a small
  `manifest.json`. The only thing not pre-recorded is the playful nonsense blend
  in Silly mode (arbitrary syllables), which uses the device Web Speech voice;
  Web Speech is also the automatic fallback if any clip is missing.
- Sound effects are synthesized at runtime with the Web Audio API — no audio
  files for those.
- No analytics, no external links, no network requests at runtime. Everything
  is local and safe by default.

## Phase 2 — generated assets

The artwork (tiles, picture cards, HUD buttons, background) and the voice were
generated locally for this project: **Qwen Image Edit** for the graphics and
**Qwen3 TTS** (voice design + cloning, QA'd with Whisper) for the voice. They are
original works with no third-party content. Pronunciation is still tuned in
`js/data.js` via deliberately spelled "spoken" strings (e.g. `buh`, `at`).

## Credits & license

Phase 2 graphics and voice are project-owned original works (see
[`ASSETS.md`](./ASSETS.md)). The retained **Twemoji** fallback graphics are
**CC-BY 4.0**; `ASSETS.md` has the full manifest, the Twemoji attribution line,
and the Fredoka font license.

Built with care for one small learner. 🌱
