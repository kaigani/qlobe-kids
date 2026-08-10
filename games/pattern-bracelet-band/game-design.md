# Pattern Bracelet Studio — production game design

**Replaces:** `games/pattern-bracelet-band/` (beta placeholder using `pattern-continue` engine + swatch art)
**Concept:** `01-game-concepts/pattern-bracelet-band/` (brief + 4 ui-mockups: overview, builder, play, concert)
**Category:** art-music · **Age:** 5–6 · **Status target:** live
**Art direction:** Claymation — stop-motion polymer clay, handmade fingerprints, soft studio wood
**Platform capability it makes robust:** The `pattern-continue` idea (linear color prediction) + `music-sync`/`sfx` + free drag + circular sequencer playback. Turns a one-tap color-prediction engine into a tactile bracelet step-sequencer with tempo, glow, and free composition — reusable for future music/pattern games.

## Product promise

A child strings a clay bead bracelet on a warm wood table. Every bead color is a musical note. Finish the pattern, then press PLAY and watch the bracelet light up — each bead chimes as the playhead travels around the loop. Make the pattern, hear the pattern, then invent your own and throw a bracelet concert.

This is the most tactile, musical game on the platform: clay beads you can almost feel, a loop that *sounds* like what it looks like, and a free-jam mode that turns pattern recognition into composition.

## Why this concept

- `pattern-train` and `pattern-bracelet-band` both existed as beta `pattern-continue` games with emoji/swatch art and a single linear mode. The platform had pattern *prediction* but no pattern *as music*, no circular sequencing, no tempo, no free composition.
- The brief's core fantasy — color = tone, spacing = rhythm, bracelet = sequencer — is more ambitious than the beta delivered. Building it as a custom polished game (not an engine mode) lets us add: circular 8-slot layout, strand-proof drag-to-slot, per-bead sfx mapping, tempo control, sequencer playback with glow, jewelry-box saves, and a real clay material identity.
- Making the shared pattern system concrete as a reusable sequencer module benefits at least one future game (Pattern Train, Rhythm Copycat, future beat-machine).

## Screen map

```
catalog → splash (3 bracelet cards) → play (bracelet + tray + PLAY) → concert celebration (bracelet + confetti + keepsake)
                                        ↑                              |
                                        └────── make another ──────────┘
splash home → catalog
play / celebration back → splash
sound → replays current spoken prompt
```

- **Splash:** full-bleed clay workshop, clay title lockup, three large bracelet cards (AB, ABC, Free Jam) each showing its bead pattern on a tiny cord. One-tap card start (pre-reader friendly). No second confirm step.
- **Play:** back (→ splash) top-left, sound (→ replay) top-right, top-center step pills showing progress, center wooden workboard with cord loop and 8 slots, bottom bead tray (6 clay beads), big PLAY CONCERT button. Prompt pill (icon + short text) taps to replay.
- **Celebration:** hero bracelet in center, Maya-style? No cast needed — beads are the characters. Ribbon banner "BRACELET CONCERT!" drops, 3 gold clay stars pop, confetti, full sequence auto-plays once more, recap dots, buttons: [Play Again] [Choose Bracelet].

All targets ≥96px. Portrait and landscape both centered with safe-area insets.

## Modes and one skill per mode

### Mode 1 — Pop Pattern (AB)
- **Skill:** Recognize and extend AB repeating patterns.
- **Core loop 45s:** Hear "Let's copy the bracelet! What color comes next?" → see cord with 6 beads revealing ABABAB plus 2 empty glowing slots → tap bead color in tray (or drag bead into slot) → correct snaps with pop + its note, wrong wiggles + warm nudge "Look again — red, yellow, red, yellow…" → when both filled, cord closes with sparkle, bracelet rotates → PLAY → sequencer lights each bead in order with its chime (red=drum, yellow=chime, blue=marimba, purple=bell) → praise.
- **Patterns:** red-yellow, blue-purple, yellow-blue, coral-teal variations across rounds, ramps from 1 missing to 2 missing.

### Mode 2 — Star Pattern (ABC / ABB)
- **Skill:** Extend ABC and ABB patterns (3-color and double-repeat).
- **Core loop 60s:** Same interaction, longer patterns: red-yellow-blue, purple-red-yellow, blue-purple-purple etc. 2 missing beads, child must pick two in correct order.
- **Variation:** Slots show shape hints subtly (tiny clay dimple) but never required reading.

### Mode 3 — Free Jam Studio
- **Skill:** Invent and hear your own pattern-as-music.
- **Core loop 90s open-ended:** Empty 8-slot bracelet, tray of 6 bead colors. Place any beads (any order, leave gaps for rests). Buttons: PLAY (loops the bracelet at current tempo), TEMPO −/+ (slow ↔ fast), CLEAR (sweeps beads off with whoosh), SAVE (jewelry-box heart — local keepsake, 4 slots). Every change updates the look and sound instantly. Encourages "make it again but change one bead" experimentation.

## Shared assets reused
- `shared/js/voice-clips.js` + `shared/js/speech.js` (fallback)
- `shared/js/sfx.js` (pop, sparkle, whoosh, tada) plus beeps per color via WebAudio tones (no extra files)
- `shared/js/tap.js` (one press path)
- `shared/js/audio-unlock.js` (first-gesture unlock)
- `shared/js/hud.js` / `shared/js/screens.js` / `shared/js/mode-select.js` not used — custom shell owns its router but honors same contracts
- `shared/js/debug-harness.js` / `shared/js/timers.js` / `shared/js/rng.js`
- `shared/assets/ui/btn-home.png`, `btn-back.png`, `btn-sound.png`, `btn-play.png` (shared HUD — not regenerated)
- `shared/fonts/fredoka-latin-600-normal.woff2` via `shared/css/base.css`
- No shared object library — beads are bespoke clay art.

New assets needed — all claymation, local, CC BY 4.0

## Interaction model

- **Tap or drag:** Tray bead → slot. Tray beads tappable: tap selects bead (scales up), then tap empty slot to place. Or drag bead with pointer capture → slot hit test → snap. Strand-proof: window-level move/up/cancel, single drag, blur cancels, offset preserved so bead doesn't snap to finger center.
- **Placement:** Correct color → bead flies into slot (pop), slot glow, color's note plays (red=C4 drum 140Hz, yellow=G4 chime 392Hz, blue=E4 marimba 330Hz + decay, purple=A4 bell 440Hz, teal=C5 524Hz, coral=F4 349Hz — synthesized, zero files). Wrong color → bead wiggles, returns to tray, spoken nudge "Hmm, look at the pattern — try the next color!"
- **Incomplete prevention:** Prompt shows only pending slot pulsing. Placed beads cannot be removed in guided modes; Free Jam allows tap-to-remove.
- **Playback:** PLAY triggers sequencer: 8 steps × (60 / bpm) where bpm 90 (slow) → 150 (fast). Each step: bead scales 1.2× + glow + its tone for 180ms. Gaps are rests. Play loops twice then stops. Tempo buttons step ±18 bpm, with spoken "Faster! / Slower!".
- **Celebration:** String closes with draw animation, three stars pop one-two-three (pop, pop, tada), confetti burst in bead colors, spoken cheer, then auto-play once more as keepsake reveal.

## Feedback model
- **Success:** bead pop + color note, slot sparkle, progress pill fills.
- **Retry:** gentle wiggle + specific nudge naming the AB pattern, never punitive.
- **Hint:** idle 10s → idle nudge speaks pattern aloud: "Red, yellow, red, yellow… what's next?"
- **Celebration:** ribbon + stars + confetti + full bracelet concert + cheer.
- **Reduced motion:** no parallax, no rotation wobble, still glows and sound.

## Difficulty & replay

- Guided modes shuffle pattern families per round and randomize which 2 colors are distractors, seeded via mulberry32 for debug reproducibility.
- Free Jam has 4 jewelry-box slots persisted in localStorage (`qlo.be/pattern-bracelet-band/jams`).

## Voice script — verbatim source for TTS

All lines are warm preschool teacher voice, unhurried, 5–6 vocabulary.

Shared:
- welcome: "Welcome to the Bracelet Studio! Pick a bracelet and let's string it!"
- intro-ab: "Let's make a pop pattern! Red, yellow, red, yellow… what comes next?"
- intro-abc: "Let's make a star pattern! Watch closely — red, yellow, blue…"
- intro-jam: "This bracelet is yours! Pick any beads, then press play to hear your song!"
- prompt-choose: "Which color comes next? Look at the pattern!"
- nudge: "Hmm, look again. Which color follows the pattern?"
- nudge-specific-ab: "Red, yellow, red, yellow… what's next?"
- cheer-ab: "You strung it! What a groovy pop pattern!"
- cheer-abc: "Stunning! You finished the star pattern!"
- cheer-jam: "What a hit! Your bracelet song is amazing!"
- play: "Press play to hear your bracelet!"
- faster: "Faster!"
- slower: "Slower!"
- jam-save: "Saved to your jewelry box!"
- jam-clear: "Cleared! Start a brand-new bracelet!"
- again: "Make another bracelet?"
- well-done: "Bravo, designer!"
- tempo: "Make it faster or slower!"
- empty-slot: "Tap a glowing dot to add a bead."
- colors: "red", "yellow", "blue", "purple", "teal", "coral"

Each color word also spoken isolated for ear training.

## Art list — complete dimensions and renderer

Visible renderer = authored raster sprite; substrate = DOM with CSS transforms. No CSS-drawn beads or cord.

| Runtime asset | Size | Source prompt direction | Renderer |
|---|---|---|---|
| `assets/workshop.webp` | 1600×1200 JPEG WebP q82 ≤260KB | Warm stop-motion claymation workshop: broad light oak worktable seen straight-down, cream linen runner centered, soft sunny window bokeh, blurred clay jars/tools on back edge, calm empty center for cord, tactile polymer clay + wood + fabric, landscape, warm golden light, no characters/text/UI | DOM `background-image` full-bleed |
| `assets/title.webp` | ~900×340 PNG WebP q90 ≤140KB trimmed | Handmade clay title plaque reading exactly "PATTERN BRACELET STUDIO" in 3 lines, rounded bubble clay letters coral/teal/yellow/blue, sky-blue irregular clay slab with bead border, stop-motion polymer clay, flat solid #00ff00 chroma | `<img>` alpha-trimmed |
| `assets/card-ab.webp` / `card-abc.webp` / `card-jam.webp` | 640×480 each WebP q86 | Each card is a tiny clay bracelet loop showing its pattern (AB = red-yellow repeated, ABC = red-yellow-blue, Jam = mixed with gap), on same wood, same cord, soft shadow, no text | card thumbnail |
| `assets/beads/bead-red.webp` etc (6) | 512×512 each PNG WebP q90 ≤70KB | Single polymer clay torus bead, chunky, fingerprint dimples, soft highlight, matte → satin, flat solid #2a2a2a charcoal, centered, no shadow/crop, isolated complete, colors: coral-red #e95a5a, sunny-yellow #f6d24a, sky-blue #5aa8e8, lavender-purple #9b7ed8, teal #58c4b8, coral-peach #f08a6a | sprite, CSS scale/var |
| `assets/cord.webp` | 1200×1200 PNG WebP q90 | Cream felt cord loop on transparent, thick braided textile, soft fuzz, stitched ends, no beads | DOM overlay, SVG path fallback for layout only |
| `assets/board-wood.webp` | 1100×1100 JPEG | Light oak circular workboard with routed groove for cord, subtle grain, routed edge, no text | board backing |
| `assets/ui/star-gold.webp` | 256×256 WebP | Chunky gold foil clay star with embossed center, same clay fingerprints | celebration |
| `assets/ui/banner-ribbon.webp` | 800×160 PNG WebP | Stitched felt ribbon banner with scalloped edge, cream with bead trim, blank (no baked text) | celebration |
| `assets/og-image.jpg` | 1200×630 JPEG q82 | Screenshot of splash with title + 3 cards, captured via pipeline | og |

All cutouts generated against flat dark charcoal, then Qwen layered `layer_2` extraction, connected-component cleanup, alpha trim/pad, resize.

Departures from brief & mockups:
- Brief's "spacing = rhythm + unlockable bead packs" is pared to 6 fixed colors + tempo: keeps scope to one polish pass and avoids progression-gating that punishes a child who just wants to jam. Justified by 5–6 attention span and offline-first.
- Mockup's two-step select-then-Cook is dropped for one-tap card start per platform pattern.
- Brief's rotating bracelet is realized as traveling glow/playhead, not physics rotation — cleaner on DOM, clearer pulse, respects reduced motion.
- No avatar wearables — jewelry box is local saves instead; avoids uncanny character dressing for a beading game.

Threats: bead color distinction for color-blind kids — solved by per-bead subtle shape cue (tiny dimple/dot count) and distinct tone; not just hue.

QLOBE_DEBUG surface: seed(N), startMode(id), winRound(), mute(), getState(), getTargets(), tap(targetId), fill missing auto, tempo set, autoplay off knob, fastTimers.

Gate: child understands what to do in 5 seconds (glowing empty slot + tray + PLAY), all speech has recorded clip fallback, hub tile will be hand-curated after.
