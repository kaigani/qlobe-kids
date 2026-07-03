# QLOBE Kids — agent onboarding brief

QLOBE Kids is an open-source, tablet-first library of tiny educational games for
kids aged 5–6. It is a **pure static site**: a hub (`index.html` + `games.json`)
that lists games, plus one folder per game under `games/`, all sharing a common
library in `shared/`.

You are most likely here because a parent pointed their Claude Code session at
this repo and asked to build a game. Your job is to make that session succeed.
**The fastest path is the `/new-game` skill — type `/new-game` and it walks the
whole flow.** The rest of this file is the reference behind that skill.

---

## Hard constraints (do not violate — these keep the platform shippable)

- **No build step.** No framework, no bundler, no `package.json`, no npm, no
  TypeScript-to-compile. The site runs exactly as written via
  `python3 -m http.server` from the repo root and deploys to GitHub Pages as-is.
- **Vanilla ES modules only.** `<script type="module">` and `import` between
  local files. The only vendored library is three.js r166 (in `shared/vendor/`),
  loaded through an import map — never from a CDN.
- **All paths relative and lowercase.** GitHub Pages is case-sensitive; macOS is
  not, so `Assets/Cat.PNG` works on your machine and 404s in production. Games
  reach the library with `../../shared/…`. Never hard-code the domain.
- **Shared-first.** Reuse what's in `shared/` before creating anything. New tiles,
  cards, or sounds that any other game could use belong in `shared/`, not in one
  game's folder.
- **No reading required.** The audience is 5–6 and mostly pre-literate. Gameplay
  is driven by audio, pictures, and touch — never by text a child must read.

---

## Building a game

1. **Pick or propose.** Check `docs/game-queue.md` for curated, ready-to-build
   ideas, or take the human's own idea. One game family per session.
2. **Read the canon.** `docs/philosophy.md` (why we build this way) and
   `docs/interaction-patterns.md` (how our games feel to touch). Non-negotiable.
3. **Scaffold.** Copy `templates/game-family/` to `games/<kebab-id>/`
   (e.g. `games/count-critters/`). Keep the id short, lowercase, hyphenated.
4. **Design first.** Write `games/<id>/game-design.md` from
   `docs/game-design-template.md`: the one skill, the 3–4 modes (each teaching a
   single skill), the core 30–90s loop, the shared assets you'll reuse.
5. **Build modes one at a time.** Ship **one** mode end-to-end and playtest it
   before starting the next. Reuse `shared/` modules and assets (inventory below).
6. **Fill `game.json`.** The per-game manifest is the richer source of truth
   (title, modes, assets used, credits).
7. **Register.** Add one entry to the root `games.json` `games` array
   (schema below). This is what makes the hub show your game.
8. **Test locally.** From the repo root run `python3 -m http.server 8000`, open
   `http://localhost:8000/`, confirm the hub lists your game, launch it, play
   every mode. Watch the console: **zero errors, zero 404s.** Test with touch
   (or a narrow window / device emulation), not just a mouse.
9. **PR.** See `CONTRIBUTING.md` for the checklist.

---

## Reuse before you create — the `shared/` inventory

Everything here is already licensed, styled to match, and free to import. Reach
for it first.

- **`shared/vendor/`** — three.js r166 (`three.module.min.js`, via import map)
  and `RoundedBoxGeometry.js`. Only needed for 3D games; 2D games skip it.
- **`shared/fonts/`** — `fredoka-latin-600-normal.woff2`, the platform display
  font. `@font-face` it; don't add other fonts.
- **`shared/js/`** — the audio/interaction toolkit (import via `../../../shared/js/…` from your game's `js/` folder — module imports resolve relative to the importing file, one level deeper than the game root):
  - **`audio.js`** — recorded teacher-voice player. `import * as audio`, call
    `await audio.ready`, then `audio.play(category, key, { fallbackText })`.
    Falls back to `speech.js` when a clip is missing. `audio.unlock()` on the
    first tap satisfies the iOS autoplay policy. Also `playSeq`, `stop`.
  - **`speech.js`** — Web Speech (`speechSynthesis`) fallback: `speak(text)`,
    `speakSeq(parts)`, `unlock()`, `stop()`. Picks a friendly local voice.
  - **`sfx.js`** — zero-file WebAudio sound effects: `pop`, `unpop`, `whoosh`,
    `sparkle`, `tada`, `silly`, `boing`, `tick`, plus `unlock()`. Synthesized
    live, so they cost no bytes and never 404.
- **`shared/assets/`**:
  - **`letter-tiles/`** — 56 onset/rime tile PNGs (blue onsets, orange rimes).
  - **`objects/`** — 134 illustrated word picture-cards in one consistent toy style.
  - **`ui/`** — `btn-home.png`, `btn-play.png`, `btn-shuffle.png`, `btn-sound.png`.
  - **`audio/`** — recorded warm preschool-teacher voice library with
    `manifest.json` and `fragments/ words/ prompts/ celebrate/ misc/` clips.
  - **`twemoji/`** — CC-BY 4.0 emoji artwork (defensive fallback set).
- **`shared/data/words.json`** — master word / onset / rime manifest (each word
  has `onset`, `rime`, `type`, `char` emoji, `img` description).
- **`shared/characters/`** — shared character art (as populated).

**The rule:** if a new tile, card, or sound could plausibly serve another game,
add it to `shared/` — not to your game folder. Document the provenance of every
asset you add (yours or your game's) in the game's `ASSETS.md`: source, creator,
license, whether attribution is required, and any modifications. Original assets
are CC BY 4.0; keep the runtime free of any network call to a model or service.

---

## Registry schema (compact)

Root `games.json` — one fetch drives the hub:

```json
{
  "schemaVersion": 1,
  "categories": [ { "id": "reading-phonics", "title": "Reading & Phonics", "order": 1 } ],
  "games": [
    {
      "id": "count-critters",
      "title": "Count Critters",
      "category": "math-number-sense",
      "path": "games/count-critters/",
      "icon": "…",
      "age": { "min": 5, "max": 6 },
      "status": "in-design",
      "accent": "#5Bb0…",
      "uses": ["shared/js/audio.js", "shared/assets/objects/"],
      "modes": [ { "id": "tap-count", "title": "Tap & Count", "skill": "one-to-one counting" } ]
    }
  ]
}
```

`status` is one of `live | in-design | proposed | archived`. Categories are
**metadata, not folders** — every game lives flat in `games/<id>/`. The ten
category ids, in order: `reading-phonics`, `writing-fine-motor`,
`math-number-sense`, `practical-life`, `sensorial-science`, `oral-storytelling`,
`culture-geography`, `art-music`, `movement-outdoor`, `social-emotional`.

---

## What NOT to do

- No frameworks, bundlers, `package.json`, or npm. No CDN or remote asset loads.
- No ads, no accounts/logins, no analytics or tracking, no loot boxes or dark
  patterns.
- No gameplay that depends on a child reading text. Audio + pictures + touch.
- No harsh failure states — no "Game Over", no losing streaks, no scary sounds.
  A wrong tap gets a gentle nudge and another try. Repeat with variation.
- Touch targets stay **≥ 96px**. Loops stay short (30–90s).
- **Don't modify other games**, `shared/js/`, or `shared/assets/` contents unless
  your task explicitly says so. In particular, **do not break
  `games/sound-sprouts/`** — it is the reference game and may be under active
  refactor by another agent.
