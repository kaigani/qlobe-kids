# The polish process — remaking a beta into a live game

Beta games prove a concept: engine + config + emoji art + synthetic voice.
A **live** game is the best version of that concept we can make. Getting from
one to the other is this process. The goal is the game, not code reuse — a
polished game may abandon its engine entirely and ship custom code.

Six stages. Each has an exit gate; don't start the next until it passes.

## 1. Intake

Gather the concept material: the design brief, UI mockups, and concept video
(the video-first process means these usually exist before the beta did).
Play the current beta. Then write a **full** `game-design.md` — not the
mini-GDD stubs ship with:

- every screen and the loop between them
- the complete voice script, every line verbatim (this becomes the recording
  manifest — write it as spoken language, for ages 5–6, warm and unhurried)
- the full art list with per-asset descriptions
- the art world assignment (`docs/art-direction.md`) and character casting
- **explicit departures from the beta and from the brief, with reasons**
  (e.g. "the brief's camera mechanic is replaced by X because Y")

*Gate: the GDD answers every "what happens when…" a builder would ask.*

## 2. Design review

Check the GDD against the canon: `docs/philosophy.md`,
`docs/interaction-patterns.md` (navigation routing, one press path, ≥96px
targets, reduced-motion, strand-proof drag where applicable), and
`docs/art-direction.md`. Confirm the platform cast is used where characters
appear — recognizable friends across games beat one-off characters.

*Gate: no pattern violations; casting and world decided.*

## 3. Asset production

All generation is local. Standard pipelines:

- **Backdrops / sprites**: text-to-image (dark background for cutouts) →
  layered extraction → trim/downscale → PNG-8 or JPEG per budget.
- **Voice**: teacher-voice clone per script line → transcription QA of every
  clip (reject and retry mismatches) → AAC m4a → `manifest.json` +
  `lines.json`. Web Speech stays as the runtime fallback, so a missing clip
  degrades gracefully.
- **Video**: reference-conditioned generation from **neutral-pose reference
  sheets** (cheerful/raised-arm references bleed into every clip — keep refs
  calm, arms down). Seed ladder 42 → 1337 → 9001. Every clip passes a
  quality gate — right character, readable action, no artifacts, no text —
  or its slot falls back to posed art. Crop, compress (h264, ≤~300KB/clip),
  keep a per-game video budget (~2.5MB).
- Record provenance in `ASSETS.md` as you go, including rejected-retry
  lessons the next game should know.

*Gate: every GDD asset exists, QA'd, at budget.*

## 4. Build

Custom game code is the default for polished games (model:
`games/lunchbox-pack/` — `index.html` + `js/main.js` router + `js/game.js` +
game CSS). Use an archetype engine only if it genuinely is the best shape
for the game. Always reuse the shared kit:

- `shared/js/sfx.js`, `shared/js/tap.js` (one press path),
  `shared/js/voice-clips.js` (recorded-voice player with `onClip` hook)
- `shared/js/stage/` (Pixi stage, tween, particles) for play-field scenes
  and celebrations; `shared/js/stage/mouth.js` for talking cast portraits
- follow navigation routing: splash home → catalog; play/end back → splash

**Required:** implement the `window.QLOBE_DEBUG` v1 contract
(`shared/js/engines/README.md`) — including a way to compress long timed
beats (fast-timer flag) — so automated QA can drive every path.

*Gate: all modes playable locally, zero console errors/404s.*

## 5. QA gates

Playwright in real Chrome (`channel: 'chrome'` — headless-shell can't decode
AAC), against the local server:

- drive every mode end-to-end through QLOBE_DEBUG, including every branch
  (e.g. each coping pivot), with wrong-input probes
- the navigation loop: splash → play → back → splash → end → back → splash;
  splash home is the only catalog link
- recorded clips actually play (not the Web Speech fallback) after a gesture
- portrait AND landscape screenshots reviewed; reduced-motion run
- then: **user plays it on the iPad** and signs off

*Gate: all green + iPad sign-off.*

## 6. Ship

Flip `games.json` status `beta → live`, complete `ASSETS.md`, commit with
the verification evidence summarized, push, verify on Pages. Promote any
genuinely reusable module the build produced into `shared/` so the next
polish is cheaper.

*Gate: live on the site; hub live-count incremented.*
