# Tweezer Rescue — production game design

Replaces the 2026-07 emoji stub in place. Concept source:
`../01-game-concepts/tweezer-rescue/` (brief + 4 claymation mockups).
Canonical art direction label: **Claymation** (record `claymation` in configs;
no generic Stage v2 slug exists yet).

## Product promise

A child picks up small clay friends with a big pair of clay-and-wood tweezers
and carries them home. The pincer squeeze, the dangling carry, and the soft
pop of a safe landing ARE the game. Fine-motor control is the skill; the
rescue fantasy is the reward.

One skill per mode:

| Mode id | Title | Skill |
| --- | --- | --- |
| `ladybugs` | Ladybug Garden | pincer carry + color-word listening (pink/white/purple flowers) |
| `bees` | Busy Bees | pincer precision (smaller targets) + counting to 6 |
| `fish` | Goldfish Pond | pincer carry + size vocabulary (big/medium/little pools) |
| `pompoms` | Pom-Pom Nests | pincer carry + color sorting (red/yellow/blue/green) |

## Screen map

1. **Splash — "Pick a rescue".** Full-bleed claymation garden backdrop,
   generated title lockup (graphic art, accessible name on element), four
   authored clay scenario cards (ladybug / bee / goldfish / pom-pom), each a
   complete generated card sprite — no CSS card chrome. Home button (→ catalog)
   and sound toggle only. Tapping a card starts that rescue immediately.
   *Departure from mockup:* no separate START button — one tap fewer for a
   pre-reader; the card art is the affordance. First gesture unlocks all audio
   and triggers the welcome line (never at page load).
2. **Play.** Scene backdrop for the mode; 6 critters (8 pom-poms) resting in
   "stuck" spots; destination targets (flowers / honeycomb / pools / nests);
   the tweezers follow the child's finger. HUD: clay back button (→ splash),
   clay sound button, and a clay counter chip (HTML numeral over authored clay
   pill) showing how many friends are still waiting.
3. **Celebration.** All rescued critters happy at their destinations, shared
   confetti burst, decorative clay "Hooray!" banner (spell-checked generated
   art), spoken "Rescue complete!", big clay NEXT button → next mode in
   sequence (wraps), back button → splash.

Navigation rule: Home only on splash; play/celebration use back → splash.

## Core loop (45–75 s per mode)

1. Mode intro line plays ("Oh no! The ladybugs slipped off their flowers…").
2. Child presses near a critter → tweezers close (120 ms), critter squashes
   slightly, squish SFX, prompt line for that critter ("This ladybug wants the
   pink flower.").
3. Child drags — critter dangles from the tips with a velocity-driven pendulum
   wobble. This must read clearly at tablet size (tune at peak motion, not at
   rest).
4. Release over the correct target → arms open, critter drops a short arc,
   lands with bounce + pop + sparkle, praise line every 2nd–3rd rescue,
   counter decrements.
5. Release anywhere else (or over a wrong color/size target) → critter floats
   gently back to a resting spot, soft "boing", gentle nudge line. Never a
   failure sound; retry is free.
6. All home → celebration screen.

## Tweezer interaction spec (the centerpiece)

- **Rendering:** two authored clay tweezer arm sprites (top + bottom) pivoting
  around the hinge point in JS transform — continuous open/close, not a
  two-frame swap. Tool angled ~-35° so the body extends up-right and the tips
  sit at/above the touch point (finger occlusion).
- **Primary input (one pointer):** pointerdown = squeeze closed; if tips are
  within the (generous, ≥96 px) grab radius of a critter, it attaches.
  pointerup = open + release. Window-level listeners; `pointercancel` is a
  cancel (critter returns), never a drop-success.
- **Enhancement (two pointers):** while a critter is near, finger distance maps
  to arm opening — closing past a threshold grabs, opening past it releases.
  True pincer practice; single-pointer path remains fully sufficient.
- One active drag at a time; no strand on release outside the viewport; blur
  cancels safely.
- **Idle nudge:** `idle-nudge.js` ladder — first nudge speaks, second animates
  a ghost demonstration (tweezers drift to a critter, squeeze, carry along the
  path, drop) then resets.

## Layout & orientation

Scene backdrops are 1600×1200 cover-fit. All interactive anchors (critter
rests, targets) are authored in scene-percent coordinates inside the central
safe region so both landscape and portrait crops keep them visible. HUD
respects `--qk-safe-*`. Reduced motion: no wobble/arc; critters fade-move.

## Art list

Style suffix for every generation (keep verbatim in prompts, log in ASSETS.md):

> Handcrafted claymation stop-motion style, soft modeling clay with visible
> fingerprints and sculpted seams, rounded hand-shaped forms, matte plasticine
> texture, warm studio light, cheerful preschool garden diorama. No text, no
> letters, no watermark.

Sprites are generated on flat dark charcoal, extracted with
`qwen-image-layered` (`output=layer_2`), alpha-QA'd on magenta, trimmed,
resized, and encoded deterministically. Sources under `assets/source/`.

| Asset | Renderer | Size (final) | Notes |
| --- | --- | --- | --- |
| Splash backdrop | JPG ≤300 KB | 1600×1200 | garden path, flowers, calm center |
| Ladybug garden backdrop | JPG | 1600×1200 | leafy bed; 3 clay flowers may be baked *blurred* only — playable flowers are sprites |
| Bee meadow backdrop | JPG | 1600×1200 | meadow + sky |
| Goldfish pond backdrop | JPG | 1600×1200 | pond edge, lily pads |
| Pom-pom corner backdrop | JPG | 1600×1200 | craft-table / garden table |
| Title lockup | PNG alpha ≤150 KB | ~1400×560 | "Tweezer Rescue" clay letters + tweezer motif; spell-check at full size |
| 4 mode cards | PNG alpha | ~640×800 each | complete clay-framed card art matching mockup 01, one critter scene each, no text |
| Tweezer top arm / bottom arm | 2 PNG alpha | ~1100×360 | blue clay + wood like mockup 02; must share hinge; generated as one open tweezer then split, or two aligned renders |
| Ladybug | PNG alpha | ~360×300 | mockup-faithful red/black, friendly eyes |
| Bee | PNG alpha | ~360×320 | |
| Goldfish | PNG alpha | ~400×300 | one sprite, scaled 1.0/0.75/0.55 for sizes; squash on carry |
| Flowers ×3 (pink/white/purple) | PNG alpha | ~420×420 | open face = landing pad, like mockup 03 |
| Leaf perch | PNG alpha | ~460×340 | ladybug resting spot |
| Honeycomb board | PNG alpha | ~900×520 | 6 open cells, clay wax |
| Pools ×3 (big/medium/little) | PNG alpha | 560/440/330 wide | clay water dishes |
| Pom-poms ×4 colors | PNG alpha | ~260×260 | fuzzy clay-wool balls |
| Nests ×4 (color-cued) | PNG alpha | ~460×340 | woven flower-basket like mockup 02 |
| Clay HUD buttons: back, home, sound-on, sound-off, next | PNG alpha | 256×256 (next ~640×280) | blue clay rounded style from mockup 02 |
| Counter chip | PNG alpha | ~360×200 | cream clay pill; numeral is HTML on top |
| "Hooray!" banner | PNG alpha ≤150 KB | ~1200×400 | clay ribbon lockup; spell-check |
| Celebration badge | PNG alpha | ~360×360 | clay medal/star |
| (Stretch) celebration video loop | MP4 ≤1.5 MB | ~960×720, 3–4 s | minimax-h3 i2v from a celebration still, first=last frame; ship only if ART DIRECTOR approves; game must be complete without it |

**Material-fidelity rule:** every child-facing object above is authored art.
CSS/DOM supplies only layout, hit areas, focus, transforms, and particles.
No gradients/border/box-shadow illustrations on primary objects. No emoji in
the final UI.

## Voice script (verbatim — source of truth for TTS)

Teacher voice clone (`qwen3-tts-voiceclone`, approved reference, seed ladder
7→8→9). Batch all lines, then batch Whisper QA (biased initial_prompt before
rejecting). Encode AAC/M4A `+faststart`. Omit any failed line rather than ship
a wrong one (fallback speech covers it).

| key | line |
| --- | --- |
| welcome | Welcome to Tweezer Rescue! Pinch, lift, and carry your little friends home. |
| pick | Pick a rescue! |
| how | Press and hold to squeeze. Carry them home, and let go! |
| intro-ladybugs | Oh no! The ladybugs slipped off their flowers. Let's carry them home with your tweezers! |
| prompt-pink | This ladybug wants the pink flower. |
| prompt-white | This one loves the white flower. |
| prompt-purple | Carry this ladybug to the purple flower. |
| intro-bees | The sleepy bees tumbled out of their honeycomb! Let's tuck them back in, one by one. |
| count-1 | One bee home! |
| count-2 | Two bees! |
| count-3 | Three bees! |
| count-4 | Four bees! |
| count-5 | Five bees! |
| count-6 | Six bees! The honeycomb is full! |
| intro-fish | Splash! The goldfish jumped out of the pond. Match each fish to its pool! |
| prompt-big | This is a big fish. Find the big pool! |
| prompt-medium | A medium fish, right in the middle. |
| prompt-little | A tiny little fish! Where's the little pool? |
| intro-pompoms | Pom-pom time! Sort the fuzzy pom-poms into their matching nests. |
| match-red | Red! Perfect match. |
| match-yellow | Yellow! Lovely. |
| match-blue | Blue! Well done. |
| match-green | Green! Great sorting. |
| praise-1 | You did it! |
| praise-2 | What a gentle rescue! |
| praise-3 | Great pinching! |
| praise-4 | Home safe! |
| praise-5 | Wonderful! |
| one-more | Just one more! |
| nudge-miss | Almost! Carry it a little further. |
| nudge-wrong | Oops! Gently now. Let's try another spot. |
| nudge-idle | Touch a little friend to pick them up. |
| celebrate | Rescue complete! You saved them all! |
| celebrate-2 | Hooray! Every friend is home. |
| next-prompt | Ready for the next rescue? |

## Audio

- Voice: `shared/js/voice-clips.js` with game-local
  `assets/audio/voice/manifest.json` + `lines.json`. Web Speech fallback.
  Nothing spoken before the first gesture.
- SFX: `shared/js/sfx.js` synth (pop, boing, sparkle, tada, silly for squish).
- BGM: `shared/assets/music/gentle-country-morning.mp3` via `shared/js/bgm.js`
  — preloaded, unlocked in the shared gesture fan-out, quiet, ducked under
  narration, stops on teardown. Declared in `game.json` usage + ASSETS.md.

## Implementation substrate

Custom polished DOM game (path 2, `templates/game-family/` shape). No Pixi.
Files: `index.html`, `config.js` (fetch shim), `config.json` (scenes, anchors,
prompts, asset paths), `css/style.css`, `js/main.js`, `js/tweezers.js`
(pointer + arm engine), `js/critters.js`, `game.json`, `ASSETS.md`,
`assets/`, `tools/` (production + smoke scripts).

Shared modules: voice-clips, sfx, audio-unlock (installUnlockOnGesture +
kiosk guards), narrator, hud (+hud.css where invisible), screens, celebrate,
idle-nudge, timers, rng, dom, preload, bgm, debug-harness, tap, analytics.
Shared CSS: base.css, screens.css. Local rules: `--qk-bg` + font-family only,
plus game styling.

## QLOBE_DEBUG (format 1, via debug-harness `installDebug`)

`ready` promise; `listModes()`; `start(modeId)`; `state()` (mode, remaining,
carried, per-critter status — serializable); `targets()` (truthful current
grab/drop anchors in client px); `grabAt(x,y)` / `dragTo(x,y)` / `dropAt(x,y)`
routed through the real pointer handlers; `winRound()`; `mute(on)`;
`seed(n)`; `fastTimers()`.

## Persistence / privacy

None. No accounts, no recording, no network at runtime beyond the shared GA4
pageview tag. `localStorage` not used in v1.

## Explicit departures

- Brief's "two-finger pinch or stylus tweezer accessory" → single-pointer
  press-and-hold is primary (age-reliable); two-finger pinch is a layered
  enhancement. No stylus-accessory assumptions.
- Mockup START button removed (tap a card starts). Mockup pause button
  removed (loops are <90 s; back button suffices).
- Mockup "2 left" baked-text chip → authored clay pill + HTML numeral +
  spoken count (pre-readers can't parse baked text).
- Brief's separate "Sound Mode" → auditory work is woven into every mode as
  spoken color/size/count prompts rather than a standalone sound-matching
  screen (keeps one skill per mode and preserves the rescue fantasy).
- Kid-superhero avatar in mockup 03 dropped — no player avatars on the
  platform; the rescued critters are the heroes.

## Risks & release gate

- Tweezer arm split (hinge alignment) is the riskiest asset step — validate
  the pivot visually before building carry polish on top.
- AI text in title/banner lockups → full-size spell check, reroll on defects.
- Ship gate: validator zero new errors; Chrome (`channel: 'chrome'`) smoke
  suite incl. portrait/landscape + reduced motion + audio log assertions;
  visual QC of full-size screenshots incl. peak-motion drag frames; ART
  DIRECTOR adversarial pass (material fidelity separate from layout); deploy;
  production re-run on qlo.be. Status stays `beta` until the real-iPad child
  playtest.
