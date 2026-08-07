# QLOBE Kids — agent onboarding brief

QLOBE Kids is an open-source, tablet-first library of tiny educational games for
kids aged 5–6. It is a **pure static site**: a hub (`index.html` + `games.json`)
that lists games, plus one folder per game under `games/`, all sharing a common
library in `shared/`.

You are most likely here because a parent pointed their Claude Code session at
this repo and asked to build a game. Your job is to make that session succeed.
**The fastest path is the `/new-game` skill — type `/new-game` and it walks the
whole flow.** The rest of this file is the reference behind that skill.

For the full clean-context path from the external concept library through local
GenAI production, QLOBE Studio integration, visual QA, and GitHub Pages release,
read **[`docs/agent-quickstart.md`](docs/agent-quickstart.md)**.

---

## Hard constraints (do not violate — these keep the platform shippable)

- **No build step.** No framework, no bundler, no `package.json`, no npm, no
  TypeScript-to-compile. The site runs exactly as written via
  `python3 -m http.server` from the repo root and deploys to GitHub Pages as-is.
- **Vanilla ES modules only.** `<script type="module">` and `import` between
  local files. The vendored libraries are three.js r166 (for 3D games) and
  PixiJS (load-bearing for the shared stage/puppet stack), both in
  `shared/vendor/` — three.js via an import map — never from a CDN.
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
   **New engine games keep their content in `config.json`** and load it through a
   thin `config.js` shim (see `templates/stub-game/`); `index.html` still does
   `import config from './config.js'`. This lets the studio read and edit the
   game's data. Existing `config.js` games (data written directly in the JS
   module) keep working unchanged and are read-only in the studio.
4. **Design first.** Write `games/<id>/game-design.md` from
   `docs/game-design-template.md`: the one skill, the 3–4 modes (each teaching a
   single skill), the core 30–90s loop, the shared assets you'll reuse.
5. **Build modes one at a time.** Ship **one** mode end-to-end and playtest it
   before starting the next. Reuse `shared/` modules and assets (inventory below).
6. **Fill `game.json`.** The per-game manifest is canonical for title, status,
   category, age, accent, and modes (plus assets used, credits).
7. **Register.** Add one entry to the root `games.json` `games` array by hand —
   its own fields (`path`, `icon` tile, `uses`, `summary`; schema below). Then
   run `node tools/pipeline/sync-games-registry.mjs --write --only <id>` to
   pull title/status/category/age/accent/modes over from `game.json`.
   Registration itself stays deliberate and by hand — the tool never invents
   entries. This is what makes the hub show your game.
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
  and `RoundedBoxGeometry.js` for 3D games, plus `pixi.min.js` (PixiJS) which the
  shared stage/puppet stack builds on. Plain 2D DOM/Canvas games skip all of it.
- **`shared/fonts/`** — `fredoka-latin-600-normal.woff2`, the platform display
  font. Don't `@font-face` it yourself and don't add other fonts: link
  `shared/css/base.css` (below), which ships the `@font-face`.
- **`shared/css/`** — link these from `index.html` with `../../shared/css/…`:
  - **`base.css`** — the platform reset. `@font-face` Fredoka, `box-sizing`,
    tap-highlight, `touch-action: manipulation`, `user-select: none`,
    `#game { height: 100dvh }`, the `.hidden` / `.visually-hidden` utilities, and
    the `--qk-safe-*` safe-area props. **Never re-copy any of it.** A game keeps
    exactly two local rules — `:root { --qk-bg: … }` and its `font-family`.
  - **`hud.css`** — the `.qk-hud-btn` vocabulary (96px round button, corner
    helpers, `.qk-hud-bar`, `.qk-dots`). Pairs with `shared/js/hud.js`.
  - **`screens.css`** — `[data-qk-screen][hidden]`, the optional `.qk-screen` box
    and the `.qk-mode-list` card skin. Link it after `base.css` and **before** the
    game's own stylesheet.
- **`shared/js/`** — the audio/interaction toolkit (import via `../../../shared/js/…` from your game's `js/` folder — module imports resolve relative to the importing file, one level deeper than the game root):
  - **`voice-clips.js`** — **PRIMARY voice channel.** Recorded-clip voice
    player (`init(manifestUrl, linesUrl, defaultLines)`, `say(key,
    fallbackText)`, `unlock()`, `onClip(cb)`). Uses one iOS-unlocked audio
    element so a clip sequence never slips into the synth voice. Web Speech
    fallback built in. Also `duration(key)`, `clipInfo(key)`, `setMuted(on)`,
    and `getAudioLog()` — the `{ key, text, kind: 'clip' | 'speech', at }` ring
    buffer QA drivers assert on. This is the module the template imports and
    what nearly every game uses — reach for it first.
  - **`speech.js`** — Web Speech (`speechSynthesis`) fallback: `speak(text)`,
    `speakSeq(parts)`, `unlock()`, `stop()`. Picks a friendly local voice.
  - **`sfx.js`** — zero-file WebAudio sound effects: `pop`, `unpop`, `whoosh`,
    `sparkle`, `tada`, `silly`, `boing`, `tick`, plus `unlock()`. Synthesized
    live, so they cost no bytes and never 404.
  - **`tap.js`** — `onTap(el, action, { feedback })`: one press path for
    buttons (feedback on pointerdown, action on pointerup over the element,
    `click` reserved for keyboard/AT). Use it instead of splitting feedback
    across `pointerdown` + `click`. Returns a disposer.
  - **`audio-unlock.js`** — the platform's one first-gesture unlock.
    `installUnlockOnGesture({ extra, onFirst })` fans out to every audio channel
    and **reopens its latch on `visibilitychange`/`pageshow`**, so audio revives
    after an iPadOS app switch instead of going silent for the session. Also
    `unlockAll()` and `installKioskGuards()` (contextmenu + pinch-zoom).
  - **`narrator.js`** — `createNarrator()`: the game's one voice. Mute gate,
    `aria-live` announcer, and a monotonic token so a newer line cancels an
    in-flight sequence instead of it waking up and talking over the new one.
  - **`hud.js`** — `hudButton('home'|'back'|'sound', onPress)`,
    `soundDebounce(fn, 600)`, `progressDots(total, done)`. With `hud.css`.
  - **`screens.js`** — `createScreens({ screens, initial, voice })`: the
    splash → play → end router, with `show`/`hold`/`release`, a `start()`
    double-tap latch, and per-screen teardown bags. Plus `wireEndScreen`.
  - **`mode-select.js`** — `renderModeCards({ host, modes, onPick })` for the
    splash. `skin: false` keeps a bespoke game's own card art pixel-for-pixel.
  - **`celebrate.js`** — `tada()` / `burstConfetti()`: the platform confetti in
    `QK_PALETTE`, self-cleaning, a no-op under `prefers-reduced-motion`, and
    `{ loop: true }` for ambience on a destination screen.
  - **`idle-nudge.js`** — `createNudger({ first, repeat, onNudge })`. A gentle
    "still there?" ladder that any touch pushes back. Never a countdown.
  - **`debug-harness.js`** — `installDebug(spec)` installs `window.QLOBE_DEBUG`
    v1, the review hook every game needs. Pass `onSeed` (where the seeded RNG
    goes) and `timers` (the group `fastTimers()` scales) or those two keys do
    nothing. Also `collectTargets()`.
  - **`timers.js`** — `createTimers()`: a cancellable, time-scalable group
    (`wait`, `after`, `every`, `clearAll`, `setScale`, `ms`).
  - **`rng.js`** — `mulberry32`, `hashString`, `shuffle` (returns a new array),
    `pick`. One seeded source, so `QLOBE_DEBUG.seed(42)` reproduces.
  - **`dom.js`** — `escapeHtml` (null → `''`, never the word "null") and `el()`.
  - **`preload.js`** — `preloadImages(urls, { idle })`; never rejects.
  - **`content.js`** — the accessor for shared learning content: letters, their
    sounds, and picture-word objects. `await content.ready()`, then
    `content.objectsStartingWith('b')` / `content.letterSound('b')` — returns
    resolved image + audio URLs. Use this to reference letters/words/sounds;
    don't re-copy the files. See `docs/shared-assets.md`.
  - **`stage/`** — Stage v2 (PixiJS): scene, tweens, particles, puppets, water —
    plus DOM backends for the games that can't be Pixi:
    `stage/drag-to-slot-dom.js` (drag with slot hit testing; `pointercancel` is a
    cancel, never a drop) and `stage/pose-sprite-dom.js` (pose actors).
- **`shared/assets/`**:
  - **`letter-tiles/`** — 56 onset/rime tile PNGs (blue onsets, orange rimes).
  - **`objects/`** — 134 illustrated word picture-cards in one consistent toy style.
  - **`ui/`** — `btn-home.png`, `btn-back.png`, `btn-play.png`,
    `btn-shuffle.png`, `btn-sound.png`. Navigation rule: **home** (→ catalog)
    lives ONLY on a game's splash; play/end screens use **back** (→ splash).
  - **`audio/`** — recorded warm preschool-teacher voice library with
    `manifest.json` and `fragments/ words/ prompts/ celebrate/ misc/` clips.
  - **`twemoji/`** — CC-BY 4.0 emoji artwork (defensive fallback set).
- **`shared/data/words.json`** — master word / onset / rime manifest (each word
  has `onset`, `rime`, `type`, `char` emoji, `img` description).
- **`shared/data/letters.json`** — canonical A–Z index: each letter's `phonic`,
  its shared `soundClip`, `objectCount`, and the `objects` starting with it.
  Query via `content.js`; letter *sounds* now cover all 26 (see
  `docs/shared-assets.md`).
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
      "uses": ["shared/js/voice-clips.js", "shared/assets/objects/"],
      "modes": [ { "id": "tap-count", "title": "Tap & Count", "skill": "one-to-one counting" } ]
    }
  ]
}
```

`status` is one of `live | beta | in-design | proposed | archived`. Categories are
**metadata, not folders** — every game lives flat in `games/<id>/`. The ten
category ids, in order: `reading-phonics`, `writing-fine-motor`,
`math-number-sense`, `practical-life`, `sensorial-science`, `oral-storytelling`,
`culture-geography`, `art-music`, `movement-outdoor`, `social-emotional`.

`title`, `status`, `category`, `age`, `accent`, and `modes` (the `{id, title,
skill}` subset) are mirrored from `game.json`, which is canonical for them.
`games.json` alone owns `path`, `icon`, `uses[]`, `iconBg`, `iconFit`,
`summary`, entry ordering, `categories[]`, and `schemaVersion`. Never hand-edit
a mirrored field in `games.json` — regenerate it with
`node tools/pipeline/sync-games-registry.mjs --write` (or `--check` to report
drift, `--only <ids>` to scope). Note the `icon` naming collision: here it's
the curated hub tile path (`assets/hub/tiles/<id>.jpg`, hands-off — the user
curates those); in `game.json`, `icon` is an emoji glyph. Same key, different
field, never synced.

---

## What NOT to do

- No frameworks, bundlers, `package.json`, or npm. No CDN or remote asset loads,
  **except** the platform-wide GA4 pageview tag (`shared/js/analytics.js`,
  loaded via googletagmanager.com) — that's the one deliberate exception; don't
  add any other remote script, font, or font/asset CDN.
- No ads, no accounts/logins, no loot boxes or dark patterns. Analytics is
  limited to the one shared GA4 pageview tag every game links — don't add
  per-game tracking, third-party pixels, or anything beyond that.
- No gameplay that depends on a child reading text. Audio + pictures + touch.
- No harsh failure states — no "Game Over", no losing streaks, no scary sounds.
  A wrong tap gets a gentle nudge and another try. Repeat with variation.
- Touch targets stay **≥ 96px**. Loops stay short (30–90s).
- **Don't modify other games**, `shared/js/`, or `shared/assets/` contents unless
  your task explicitly says so. In particular, **do not break
  `games/sound-sprouts/`** — it is the reference game and may be under active
  refactor by another agent.
