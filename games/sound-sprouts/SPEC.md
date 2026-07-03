# Sound Sprouts — Build Spec (v1)

A ThreeJS phonics word-builder toy for a 4-year-old. Child taps big sound tiles,
hears each fragment spoken, combines them into a word, hears the word, sees a
picture, gets confetti. No score, no failure, no text-heavy UI.

This spec is authoritative. Content data lives in `js/data.js` (already written —
use it verbatim, do not edit). Assets land in `vendor/` and `assets/` (fetched by
a separate task — code against the paths below; files may arrive after you start).

## Tech constraints

- **No build step.** Plain ES modules served statically (GitHub Pages). Entry is
  `index.html` at repo root with an import map:
  ```html
  <script type="importmap">
    { "imports": { "three": "../../shared/vendor/three.module.min.js" } }
  </script>
  <script type="module" src="./js/main.js"></script>
  ```
- Vendored libs: `vendor/three.module.min.js` (three r0.166.1) and
  `vendor/RoundedBoxGeometry.js` (imports from `'three'`, resolved by import map).
- No external network requests at runtime. Everything local.
- Target device: iPad Safari webview + desktop browsers. Pointer Events only
  (`pointerdown`), `touch-action: none` on the canvas, viewport meta
  `width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no`,
  suppress long-press callout/context menu. Clamp `devicePixelRatio` to 2.
- Font: Fredoka SemiBold at `assets/fonts/fredoka-latin-600-normal.woff2`
  (`@font-face`, family `Fredoka`). Use it for DOM UI **and** canvas-texture text
  (wait for `document.fonts.ready` before drawing letter textures).

## Files

```
index.html
css/style.css
js/main.js        boot, audio unlock, screen routing (menu <-> game)
js/scene.js       three.js renderer/scene/camera, resize, render loop, tween util
js/tiles.js       tile meshes, canvas letter textures, slot meshes, animations
js/game.js        round logic for all three modes
js/speech.js      Web Speech API wrapper
js/sfx.js         WebAudio-synthesized sound effects (no audio files)
js/confetti.js    particle burst
js/data.js        (exists — do not modify)
vendor/           (arrives separately)
assets/twemoji/   <codepoint>.svg picture cards (arrives separately)
assets/fonts/     fredoka woff2 (arrives separately)
.nojekyll
README.md         what it is, how to run locally (python3 -m http.server), Pages note, asset credits pointer to ASSETS.md
```

## Visual direction (garden / "sprouts" theme)

- Background: full-canvas vertical gradient sky — warm cream `#FFF7E8` up top to
  soft sky blue `#BDE8FF`; rolling green hill meshes (2 overlapping flattened
  spheres or shader-free colored geometry, `#9ED98B` / `#7FC96E`) across the
  bottom quarter. 2–3 soft white cloud blobs (merged spheres or sprite circles)
  drifting very slowly. Soft ambient + one directional light; no shadows needed
  (or very soft if cheap).
- Camera: perspective ~40° fov, looking at origin; scene composed to fit both
  portrait and landscape (on resize, scale tile layout to viewport via
  visible-plane math at z=0).
- **Tiles**: `RoundedBoxGeometry` (~1.6 × 1.6 × 0.35, radius 0.18), matte
  `MeshStandardMaterial`. Color-code sound types: onset tiles coral `#FF8A66`,
  rime tiles leaf green `#7ECB66`. Letter text rendered to a canvas texture
  (Fredoka, lowercase, dark brown `#4A2F1F`, centered, large) applied to the
  front face (use a slightly lighter rounded-rect plate or just texture the
  whole box with letter on +Z face). Idle: gentle bob + tiny rotation sway,
  phase-offset per tile. Tap: squash-and-stretch bounce.
- **Word bench**: a horizontal rounded plank (wood tone `#D9A05B`) low-center
  with two slot outlines (rounded-rect rims, dashed or lighter inset) — left
  slot for the beginning sound, right slot for the ending sound. Completed word
  appears as both tiles sitting in the slots.
- **Picture card**: rounded white card plane (~3.2 wide) that pops in above the
  bench with spring-scale (overshoot) + slight spin; shows the Twemoji SVG
  rasterized to a 512px canvas texture, with the word in big Fredoka letters
  beneath the image on the card (this is the "see the written word" moment —
  uppercase, e.g. `CAT`, colored per-letter onset/rime: coral + green).
- **Confetti**: `THREE.Points` burst (~120 particles, mixed warm palette
  `#FF8A66 #FFD166 #7ECB66 #66B8FF #FF66A3`), gravity + fade, ~1.5s.
- DOM HUD (big, ≥64px touch targets, emoji glyphs as labels, no reading
  required): Home 🏠 top-left (in game), speaker 🔊 bottom-left replays the
  current prompt, shuffle 🔀 (free play only) deals a new tile set. Rounded
  pill buttons, cream background, soft drop shadow.

## Screens & flow

### Menu (DOM overlay over the live three.js garden background)

Title "Sound Sprouts 🌱" in Fredoka. Three giant buttons (stacked portrait /
row landscape), each icon + short label:

1. 🎯 **Make a Word** → guided mode
2. ❓ **Mystery Picture** → mystery mode
3. 🎨 **Word Mixer** → free play

First `pointerdown` anywhere also unlocks audio (resume AudioContext + a silent
`speechSynthesis` utterance).

### Shared build mechanic (all modes)

- Tiles float in an arc above the bench. Tapping a tile: bounce + speak its
  `spoken` string + soft pop SFX, then the tile **flies to its slot by type**
  (onset → left slot, rime → right slot; this is how we avoid backwards
  non-combos entirely). Tapping a slotted tile pops it back out to the arc
  (with its sound, "un-pop" SFX) so the child can swap freely.
- When both slots are filled, evaluate `onset + rime`:
  - **Picture word** (in `WORDS`): the two tiles slide together to touch,
    speak the whole word slowly, then celebration: tada SFX, confetti, picture
    card pops in, speak a random `PHRASES.celebrate`. If the word's emoji is an
    animal, optionally a short synthesized "boing" — keep it subtle. Then a big
    ▶ **Again** DOM button appears (also auto-advance after ~6s in guided/
    mystery). Free play: card dismisses on tap and tiles return for more mixing.
  - **Bonus word** (in `BONUS_WORDS`): sparkle SFX + a gold star ⭐ puff (small
    confetti in golds), speak the word + random `PHRASES.bonus`. Tiles gently
    return to the arc. No picture card.
  - **Anything else**: silly mode — wobble SFX, tiles do a comedic jiggle,
    speak the blend string (e.g. "cag") then a random `PHRASES.silly`, tiles
    return to the arc. Warm, never negative.

### Mode 1 — Make a Word (guided)

Round: pick a random `WORDS` entry (no immediate repeats). Show its picture
card small + translucent above the bench as the goal (image + word visible).
Speak `PHRASES.guidedPrompt` then "{onset spoken}. {rime spoken}." Tiles: the
correct onset + correct rime + one distractor onset + one distractor rime
(prefer distractors that *also* form real words with the given pieces, so a
"wrong" pick often still lands on a real word). 4 tiles, shuffled. Any picture
word completes the round — if the child builds `hat` while the goal was `cat`,
celebrate `hat`. 🔊 replays the prompt.

### Mode 2 — Mystery Picture

Same as guided but the goal card shows a big ❓ (assets/twemoji/2753.svg) and
no word; prompt is `PHRASES.mysteryPrompt` with the target's spoken fragments.
Completing **any** picture word reveals that word's card (flip/scale reveal).
Anticipation is the point — slightly bigger celebration here.

### Mode 3 — Word Mixer (free play)

Deal a set from `FREEPLAY_SETS` (rotate, no repeat until all used): 4 onset
tiles in a top arc, 3 rime tiles in a lower arc, bench below. No target, no
prompt beyond a spoken "Mix the sounds! What can you make?" Child mixes
freely; found picture-words get a small icon added to a "garden row" strip of
mini-cards along the top edge (session-only collection — replayability). 🔀
deals the next set.

## Audio

### speech.js

- Wrapper over `speechSynthesis` with a tiny queue: `speak(text, {rate, pitch})`
  returns a Promise; `speakSeq([...])` for fragment sequences with ~250ms gaps.
- Voice pick (once, on `voiceschanged`): prefer local `en-*` voices in order:
  name contains "Samantha" → "Karen" → "Google US English" → any `en-US` local →
  any `en`. Rate 0.8 default (0.7 for the full-word reveal), pitch 1.05.
- iOS quirks: call `speechSynthesis.cancel()` before each new utterance batch;
  keep a reference to utterances (GC bug); unlock with an empty utterance on
  first user gesture; `resume()` on `visibilitychange`.
- All game text routed through here using `spoken` strings from data.js.

### sfx.js — synthesized, zero audio assets

Single shared `AudioContext`. Master gain ~0.5. Effects:
- `pop()` sine blip 600→900 Hz, 80 ms, fast decay (tile tap)
- `unpop()` reverse blip 700→400 Hz
- `whoosh()` band-passed noise sweep ~150 ms (tile flying)
- `sparkle()` triangle arpeggio C6–E6–G6, staggered 60 ms (bonus word)
- `tada()` C-major chord swell + quick octave arpeggio ~700 ms (picture word)
- `silly()` saw wobble 300→150 Hz with 8 Hz vibrato, ~500 ms, quiet & goofy
- `tick()` tiny click for UI buttons

## Implementation notes

- One small tween helper in scene.js (`tween(obj, props, ms, ease)` driven from
  the render loop; ease-out-back for pops, ease-in-out for flights). No tween lib.
- Raycast on `pointerdown` only (no hover states needed).
- Texture for Twemoji: load SVG via `Image`, draw to 512×512 canvas, make
  `CanvasTexture` (`SRGBColorSpace`). Cache per codepoint. Fallback: if the SVG
  fails to load, draw the `char` glyph onto the canvas at 360px font instead.
- Keep everything in one scene; menu/game are states, not separate scenes.
- Renderer: `antialias: true, alpha: false`, sRGB output, `setAnimationLoop`.
- No persistence, no analytics, no external links. Safe-by-default.
- Code style: small modules, JSDoc-light, no TypeScript, no framework.

## Acceptance checklist

- `python3 -m http.server` in repo root → game fully playable at localhost.
- Every tap produces immediate audio + visual feedback.
- All three modes complete full loops and return Home cleanly.
- Tiles/text legible and tappable in iPad portrait AND landscape.
- No console errors; no 404s (all asset paths resolve).
- Works without the vendor/assets of another mode being touched (defensive
  loading: missing SVG falls back to glyph rendering).
