---
name: new-game
description: "Guide a contributor from game idea (or queue pick) to a registered, playable QLOBE Kids game family. Use when the user wants to build, design, or add a game."
---

# /new-game — build a QLOBE Kids game family

You are helping a contributor (often a parent, not a developer) go from an idea
to a registered, playable game. Be warm, concrete, and low-jargon. Do the
mechanics; let them bring the taste. Read [CLAUDE.md](../../../CLAUDE.md),
`docs/philosophy.md`, and `docs/interaction-patterns.md` before building.

**Guardrails to hold at every step** (from `docs/philosophy.md`):
- One skill per mode. Short 30–90s loops. Audio-first, no reading required.
- Touch targets ≥ 96px. **No harsh failure** — a wrong tap gets a gentle retry.
- Reuse `shared/` before creating anything. All paths relative + lowercase.
- No frameworks, no build step, no CDNs, no accounts/ads/tracking.

Work through these steps, checking in with the human between them.

## 1. Find the idea

Ask what they'd like to build. If they're unsure, learn one thing their kid
loves, then offer **3 picks from `docs/game-queue.md`** matched to that interest
(name each one plus the single skill it teaches). Let them choose or riff.

## 2. Confirm category and modes

Pin down:
- **One category** (one of the ten in `games.json`; it's metadata, not a folder).
- **The one skill** the game family teaches.
- **3–4 modes max**, each teaching a *single* skill (e.g. "tap to count",
  "which has more?"). Spell out the 30–90s core loop for each.

Then agree to **build ONE mode first**, playtest it, and only then add more.

## 3. Optional concept video

Offer (don't insist) an AI-generated proof-of-concept video to picture the feel.
If they make one, ≤ 15 MB goes in `games/<id>/concept/`; larger stays an external
link. Skip freely — a written `game-design.md` is enough.

## 4. Scaffold

Choose a short, lowercase, hyphenated id (e.g. `count-critters`). Copy the
template:

```bash
cp -R templates/game-family "games/<id>"
```

Rename/adjust files inside so nothing references the template name.

## 5. Design doc

Write `games/<id>/game-design.md` from `docs/game-design-template.md`: the one
skill, each mode's single skill + loop, the shared assets you'll reuse, and the
warm/no-fail feel. Keep it short and concrete.

## 6. Build mode 1 with `shared/`

Reuse the library via `../../shared/…`. Import the toolkit:

```js
import * as audio from '../../../shared/js/audio.js';
import * as speech from '../../../shared/js/speech.js';
import * as sfx    from '../../../shared/js/sfx.js';
```

Key patterns:
- **Unlock audio on the first tap** (iOS autoplay policy). In the first
  pointer/touch handler call `audio.unlock()`, `sfx.unlock()`, `speech.unlock()`.
- **Speak with fallback:** `await audio.ready;` then
  `audio.play('prompts', key, { fallbackText: 'Tap the cat' });` — recorded
  teacher voice when the clip exists, Web Speech otherwise. `speech.speak(text)`
  is the direct fallback path.
- **Sound effects are free:** `sfx.pop()`, `sfx.tada()`, `sfx.sparkle()`,
  `sfx.boing()`, `sfx.tick()` — synthesized, no files, never 404.
- **Reuse assets:** picture-cards in `shared/assets/objects/`, tiles in
  `shared/assets/letter-tiles/`, HUD buttons in `shared/assets/ui/`, the Fredoka
  font in `shared/fonts/`, word data in `shared/data/words.json`. If you need a
  new asset any other game could use, add it to `shared/` and log its provenance
  in the game's `ASSETS.md`.
- three.js is only for 3D; 2D games use plain DOM/Canvas and skip `shared/vendor/`.

Keep taps forgiving: wrong choice → gentle audio nudge + retry, never a fail
screen.

## 7. Test locally

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000/`, confirm **the hub lists the new game**, launch it,
and play the mode with touch (or a narrow window / device emulation). Watch the
console: **zero errors, zero 404s.** Fix before moving on. Then loop back to
step 6 for the next mode, or to step 8 to register.

## 8. Register

Fill `games/<id>/game.json` (the richer per-game manifest), then add **one entry**
to the root `games.json` `games` array. Schema:

```json
{
  "id": "count-critters",
  "title": "Count Critters",
  "category": "math-number-sense",
  "path": "games/count-critters/",
  "icon": "…",
  "age": { "min": 5, "max": 6 },
  "status": "in-design",
  "accent": "#5bb0d8",
  "uses": ["shared/js/audio.js", "shared/assets/objects/"],
  "modes": [ { "id": "tap-count", "title": "Tap & Count", "skill": "one-to-one counting" } ]
}
```

`status`: `live | in-design | proposed | archived` (use `in-design` until it's
playtested). Validate that `games.json` is still valid JSON — no trailing commas.

## 9. PR guidance

Run through the checklist in [CONTRIBUTING.md](../../../CONTRIBUTING.md): boots
from hub, all modes playable, no console errors/404s, touch targets ≥ 96px, works
without reading, no harsh failure, assets licensed + listed in `ASSETS.md`,
`games.json` valid, paths relative + lowercase, `sound-sprouts` untouched.
Encourage a real playtest with a kid before opening the PR, and keep the summary
warm and short.
