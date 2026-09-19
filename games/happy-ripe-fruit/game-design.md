# Happy Ripe Fruit - production game design

**Route:** `games/happy-ripe-fruit/`
**Replaces in the catalog:** the unbuilt `melting-race` emoji prototype
**Category / age:** Sensorial & Science, ages 2-5
**Canonical art direction:** **Kawaii** - tactile gouache-and-soft-clay orchard
**Status at launch:** beta

## Product promise

Pick the fruit that is *just right*. A child compares three visibly different
stages of the same fruit, then taps or drags the ripe one into a big woven
basket. Every correct pick changes the garden, fills the basket, and earns a
fruit badge. Six short orchard visits build toward a joyful rainbow harvest.

The single learning skill is visual discrimination of ripeness from color,
shape, sheen, and texture. Faces reinforce the natural cues, but never replace
them. No reading, score, timer, or failure state is required.

## Why this replaces Melting Race

`melting-race` is an in-design Coach Timer stub with only emoji placeholders
and no production art or recorded audio. Happy Ripe Fruit occupies its catalog
slot in the same Sensorial & Science shelf, while using a new route and id that
match the selected concept. The dormant Melting Race source remains in Git
history and on disk but is removed from the public registry.

## Source interpretation

The concept brief and 15-second video establish the core fantasy: choose a
fruit, inspect its visible stage, pull the ripe fruit from its plant, and land
it in a basket. The production game keeps that promise and the oversized,
happy fruit language.

Deliberate departures:

- The mockup's flat vector look becomes authored raster Kawaii art with
  gouache texture, soft clay volume, cocoa outlines, and cream edge lights.
- The video shows one obviously ripe fruit at a time. Production presents
  underripe, ripe, and overripe together so the child actually compares.
- Rotate and camera-like inspection are omitted. Large stage art and a touch
  sparkle provide the intended close looking without a confusing 3D gesture.
- Fruit stations unlock in the brief's order. Each station is still a complete
  30-60 second experience, so a child can stop after one success.
- Runtime words are optional adult labels only. Voice, image, and motion carry
  the complete child instruction.

## Screen map and navigation

```text
boot -> splash
splash --basket Play--> orchard selector
orchard selector --unlocked fruit--> harvest station
harvest station --3 ripe picks--> station celebration -> orchard selector
orchard selector --all 6 complete--> rainbow harvest party
party --play again--> orchard selector
play / selector / party Back -> splash
splash Home -> ../../index.html
```

The splash owns the only catalog Home button. All other screens use Back to
return to the splash. The replay-sound button remains in the lower-left safe
area on every screen.

## Screen designs

### 1. Splash - the garden gate

- Full-bleed sunny orchard plate with a clear central lawn.
- Authored `HAPPY RIPE FRUIT` title lockup above a large woven basket Play
  button. Six ripe fruit friends gather directly above it. Both the basket and
  the authored Start plaque activate the same action.
- Gentle leaf sway and two drifting pollen motes; reduced motion makes these
  static.
- First genuine gesture unlocks voice, SFX, and background music. Play speaks
  the selector instruction while the next screen arrives.

### 2. Orchard selector - choose a patch

- Six large authored fruit badge buttons in a garden arc: strawberry, banana,
  apple, lemon, cherry, pear.
- Strawberry begins open. Completing a station opens the next one. Completed
  stations wear a star wreath; locked stations remain visible as softly
  sleeping fruit behind a leaf ribbon, not as punitive padlocks.
- A persistent six-segment basket garland shows progress. State is stored in
  local storage; storage failure quietly falls back to the current session.
- The next open fruit softly bobs once and receives spoken focus.

### 3. Harvest station - compare and pick

- A coherent authored plant sprite sits on the orchard plate. Exactly three
  large fruit choices sit at stable stem anchors: one underripe, one ripe, one
  overripe. Reading-order placement is shuffled from a seeded RNG each round.
- A large authored basket rests in the lower thumb zone. It has empty, one,
  two, and three-fruit visual states.
- Three authored picture tokens remain visible beside the choices from the
  first decision: `not yet -> just right -> past ripe`. Words are not required;
  after a miss, the ripe fruit also receives a stronger cream halo.
- The fruit-specific prompt begins immediately, and input is available as soon
  as the station settles.
- Tap path: tapping any fruit invokes the same answer handler as a drop.
- Drag path: a fruit lifts 6%, follows the pointer, and succeeds when its center
  enters the basket's forgiving expanded rect. Releasing elsewhere returns it
  to its stem. `pointercancel`, blur, and screen exit always restore the fruit.
- Correct: input locks for that fruit, the ripe fruit arcs into the basket,
  sparkles, the basket changes state, and warm praise plays. The next round
  starts after a short beat.
- Wrong: the chosen fruit makes one soft spring and returns. The first miss
  reveals a brief cream halo around the ripe fruit and speaks the stage-aware
  cue. Nothing is removed and progress never decreases.

### 4. Station celebration

- Three ripe fruits nestle in the basket.
- The earned fruit badge stamps into the garland with a soft paper-pop.
- A short fruit-specific line celebrates the natural cue, then Continue
  returns to the selector and reveals the next station.

### 5. Rainbow harvest party

- A large picnic basket/tableau contains all six ripe fruit friends.
- Six earned badges form a wreath. Confetti and sun sparkles play once.
- Final line: "Your whole rainbow harvest is ripe and ready. What a careful
  fruit picker!"
- Replay resets the station selector view but preserves earned badges. A grown
  up can clear progress from browser storage; no child-facing reset is needed.

## Core loop and rules

Each station contains three rounds. The same three stage assets are reused,
but their anchor positions shuffle. This repetition lets the child learn the
natural cue rather than memorize a position.

1. Fruit-specific prompt names the ripe visual cue.
2. Child taps a fruit or drags one into the basket.
3. Wrong choices return gently and model the cue.
4. The ripe choice travels into the basket.
5. After three picks the station badge is earned and the next fruit opens.

Double input cannot award twice: a correct choice is marked `harvesting`
before animation or audio begins. Leaving the screen cancels timers, active
drags, audio, and celebration effects.

## Fruit stage canon

| Fruit | Underripe | Ripe target | Overripe |
| --- | --- | --- | --- |
| Strawberry | pale green-white, small, sleepy | deep red, yellow seeds, plump smile | dull red-brown spots, drooping leaves |
| Banana | lime green, straighter, alert | golden yellow, curved, warm sparkle | brown-speckled, very soft curve, sleepy |
| Apple | small pale yellow-green, firm | glossy bright red, rosy cheeks | dull crimson, wrinkled and lightly bruised |
| Lemon | small hard green, puckered | sunny smooth yellow, bright eyes | dull yellow-brown, squishy and dimpled |
| Cherry | light pink-red pair, tight green stem | deep ruby pair, glossy happy faces | maroon-purple, soft, wilted brown stem |
| Pear | narrow firm light green | rounded golden-green, smooth smile | sunken sides, brown patches near stem |

Every cue is visible without the face. Underripe and overripe never look
disgusting or frightening; they are simply not the basket's target today.

## Verbatim voice script

Recorded teacher voice is primary through `voice-clips.js`; the exact text
below is also the Web Speech and accessibility fallback.

| Key | Line |
| --- | --- |
| `welcome` | Welcome to Happy Ripe Fruit! Tap the basket and let's pick together. |
| `choose-patch` | Our fruit garden is ready. Choose the glowing fruit patch. |
| `strawberry-prompt` | Find the strawberry that is deep red and juicy. Put the ripe one in the basket! |
| `banana-prompt` | Find the banana that is golden yellow and gently curved. Put the ripe one in the basket! |
| `apple-prompt` | Find the apple that is shiny bright red and plump. Put the ripe one in the basket! |
| `lemon-prompt` | Find the lemon that is sunny yellow and smooth. Put the ripe one in the basket! |
| `cherry-prompt` | Find the cherries that are deep ruby red and glossy. Put the ripe pair in the basket! |
| `pear-prompt` | Find the pear that is golden green, smooth, and plump. Put the ripe one in the basket! |
| `retry-early` | That fruit needs a little more sunshine. Try the ripe one. |
| `retry-late` | That fruit waited a little too long. Try the ripe one. |
| `praise-one` | Pop! That fruit is just right. |
| `praise-two` | Ripe and ready. Lovely looking! |
| `praise-three` | You spotted the happy ripe fruit! |
| `strawberry-complete` | Three ruby strawberries! Your berry badge is blooming. |
| `banana-complete` | Three golden bananas! Your banana badge is shining. |
| `apple-complete` | Three bright apples! Your apple badge is sparkling. |
| `lemon-complete` | Three sunny lemons! Your lemon badge is glowing. |
| `cherry-complete` | Three ruby cherry pairs! Your cherry badge is twinkling. |
| `pear-complete` | Three golden pears! Your pear badge is gleaming. |
| `finale` | Your whole rainbow harvest is ripe and ready. What a careful fruit picker! |
| `idle` | Look closely at the colors and the skin. Which fruit is just right? |

Narration ducks the quiet shared recorded garden music. Muting affects voice,
music, and SFX together; the aria-live text remains available.

## Art production list

Primary visible art is authored raster. CSS/DOM supplies layout, focus,
hitboxes, masks, and motion only.

| Asset family | Count | Source / final | Purpose |
| --- | ---: | --- | --- |
| Orchard environment | 1 | GPT Image 2 source -> 1440x1080 WebP | all screens, responsive cover |
| Title lockup | 1 | GPT Image 2 isolated source -> cut WebP | exact splash title |
| Fruit stages | 18 | GPT Image 2 native-alpha contact sheet -> cutter | three stages x six fruits |
| Plants | 6 | GPT Image 2 native-alpha contact sheet -> cutter | coherent station foregrounds |
| Basket states | 4 | GPT Image 2 native-alpha prop -> cutter + runtime fruit composition | empty through three picks |
| Fruit badges | 6 | derived from accepted ripe art in framed Kawaii medallions | selector/progress/reward |
| Stage ribbon tokens | 3 | authored contact-sheet cutouts | not-yet / ripe / past visual key |
| Party tableau | 1 | composed from accepted assets | final screen, no new identity drift |
| Hub tile | 1 | Krea 2 exploration plus reviewed final crop/edit | 640x533 JPEG |
| OG image | 1 | reviewed GPT Image 2 hub composition crop | 1200x630 JPEG |

All cutout sheets pass `tools/cut-asset-sheet.py --expected-count`, alpha
histogram checks, and saturated-magenta composite review. Runtime sources and
receipts live under `assets/source/`; compact WebP and M4A finals live under
`assets/`.

## Interaction, accessibility, and responsive rules

- Every fruit button and badge is at least 96 CSS px; the basket drop zone is
  expanded by 72 px without changing its visible bounds.
- Keyboard Enter/Space activates focused fruit and controls. Focus rings use a
  thick cream/cocoa outline that remains visible over the orchard.
- Portrait puts the plant in the upper half and the basket along the bottom.
  Landscape centers the plant left/middle and the basket lower-right.
- Safe-area variables protect the HUD and bottom basket on notched devices.
- `prefers-reduced-motion` removes bobs, swoops, leaf drift, pulses, and
  confetti travel; state changes happen immediately with opacity/crossfade.
- Alt text states the natural cue, not only a color word. Spoken prompts and
  aria-live announcements mirror the current action.
- No network or model call exists at runtime.

## Shared modules

- `voice-clips.js` and `narrator.js`: recorded-first voice and aria-live.
- `audio-unlock.js`: one first-gesture unlock and iPad resume recovery.
- `sfx.js`: pop, boing, sparkle, and tada.
- `bgm.js`: quiet shared recorded underscore, mute and narration ducking.
- `tap.js`: one press path for controls and fruit tap selection.
- `screens.js`: splash/play/end routing and teardown.
- `hud.js`: Home, Back, and sound controls.
- `celebrate.js`: reduced-motion-aware confetti.
- `idle-nudge.js`: a gentle looking reminder.
- `rng.js`, `timers.js`, and `debug-harness.js`: deterministic rounds and QA.

## State and persistence

Runtime state contains `screen`, `fruitId`, `round`, `stageOrder`,
`basketCount`, `wrongAttempts`, `hintShown`, `transitioning`, `completed`,
`muted`, and `seed`. Only the contiguous completion prefix persists under a
versioned local-storage key. Corrupt, out-of-order, or unavailable storage is
normalized or ignored.

## QLOBE_DEBUG v1

The debug surface reports readiness, screen, fruit, round, truthfully labeled
targets, stage order, basket count, progression, dragging, hint, mute,
reduced-motion, seed, layout rectangles, and clip readiness/logs.

Required actions: `listModes`, `startMode`, `startFruit`, `setRound`, `tap`,
`winRound`, `completeFruit`, `mute`, `seed`, `fastTimers`, `home`,
`getAudioLog`, and `clearAudioLog`. QA-only fruit entry may bypass locks but
must be labeled as an override in state.

## Release gate

- All six stations and both answer paths work from the public route.
- All 18 fruit stages are distinct and correctly mapped.
- No emoji, SVG, canvas drawing, or CSS illustration serves as primary art.
- Wrong early and late choices do not advance; correct choices advance once.
- Progress survives reload when storage is available; storage denial is safe.
- Recorded M4A voice is observed after a genuine gesture, with exact Whisper
  transcript QA and Web Speech fallback.
- Splash, selector, each fruit, hint, station reward, and finale are visually
  reviewed in landscape and portrait, plus reduced motion and narrow landscape.
- Zero console errors, failed requests, case mistakes, or runtime remote media.
- Registry sync, full validator, syntax checks, asset checks, local Chrome QA,
  and production Chrome QA pass.
- Independent adversarial ART DIRECTOR has no unresolved blocker or major
  finding; engineering review has no unresolved correctness finding.

## Final acceptance evidence

- Repository asset cutter: exact 18 fruit, 6 plant, 8 UI, and 1 title
  component gates passed in dry-run and production modes.
- Voice: 21/21 cloned-teacher M4A clips passed duration/decode checks and exact
  local Whisper transcript QA.
- Local production-Chrome suite: 65/65 checks passed, including physical drag,
  release-outside cancellation, 18 normal picks, sequential unlocks, reload
  persistence, portrait targets, reduced motion, slow-audio boot, and recorded
  clip/replay observation.
- Independent ART DIRECTOR final verdict: **PASS**.
- Independent engineering reviewer final verdict: **READY**.
- Full repository validator: 0 errors; non-blocking warnings include the
  deliberately unregistered replaced Melting Race source folder plus existing
  character-ledger notices.
