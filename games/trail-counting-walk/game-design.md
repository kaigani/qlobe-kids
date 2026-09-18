# Trail Counting Walk — production design

## Product promise

Trail Counting Walk turns counting to 20 into a tiny papercraft hike. A child
chooses a five-, ten-, or twenty-step trail, hears the next number, and helps
Pip the paper fox hop across five large stones at a time. Every correct tap
makes the spoken count, numeral, fox movement, and trail progress agree.

The one learning goal is **stable one-to-one sequential counting**. The three
routes vary stamina, not rules:

- **Mossy Meadow — 1 to 5:** one five-stone scene and the introductory loop.
- **Blue Creek — 1 to 10:** two five-stone scenes.
- **Firefly Ridge — 1 to 20:** four five-stone scenes.

The child should understand “tap the glowing next stone” within five seconds.
No child-facing path depends on reading; numerals reinforce the spoken count.

## Screen map and navigation

```text
catalog
  -> splash / trail selection
      -> Mossy Meadow (5)   -> play, 1 segment -> finish
      -> Blue Creek (10)    -> play, 2 segments -> finish
      -> Firefly Ridge (20) -> play, 4 segments -> finish

play Back -> splash
finish Back / Choose Trail -> splash
finish Walk Again -> same route
splash Home -> catalog
```

### Splash / trail selection

The generated title lockup sits above three tall generated route cards. Each
card is a wordless miniature of its world with a large semantic HTML numeral
(`5`, `10`, or `20`) on a paper pocket. Tapping a card is the start gesture:
it unlocks all audio, starts the quiet shared music track, and enters play.
There is no second Start button. The spoken line invites the child to choose;
Pip first appears at the trailhead after a route is selected.

### Play

The authored 4:3 background plate fills the play field. Five raster stepping
stones sit across its open trail. The separately composited fox begins beside
the first stone. A raster paper pennant at top center carries the current
semantic HTML number, and a five-star progress rail shows progress within the
current scene.

Only the next stone is active. It receives an obvious leaf mat, pulse/scale,
focus ring, and spoken number. Pressing it follows one production handler:

1. lock input briefly;
2. speak the accepted number and play a restrained step sound;
3. swap Pip to the hop pose and move him in a large readable arc;
4. fill the matching star and update the pennant;
5. land in the idle pose and activate the next stone.

After stone five, a short paper-leaf celebration bridges to the next segment.
The visible stones relabel to the next group (`6–10`, `11–15`, or `16–20`),
Pip returns to the beginning, and the background treatment remains stable.
The bridge is short enough that the whole route remains a 30–90 second loop.

Pressing any future stone is safe: it gives a soft wobble/silly sound, keeps
the correct stone active, and says “Next comes [number].” There is no loss,
score reduction, timer, or game-over state.

### Finish

Pip changes to the celebration pose beside the raster checkered flag. Each
completed five-step scene becomes one clearly separated, range-labeled cluster
of five large paper stars: one cluster for Meadow, two for Creek, and a readable
two-by-two set of four clusters for Ridge. This preserves one earned star per counted step
without turning twenty into an undifferentiated strip. The spoken line names
the reached number. The child can walk the same route again or choose another.
Progress is session state only; replay never depends on storage.

## Interaction and accessibility rules

- Every route card, stepping stone, and action is at least 96 CSS pixels on the
  canonical tablet layout and remains forgiving in portrait/short landscape.
- Pointer, keyboard, assistive click, and `QLOBE_DEBUG.tap()` all call the same
  semantic stone handler.
- One accepted press cannot double-advance. Screen transitions and replay are
  latched through the shared screen controller.
- Safe-area insets protect every HUD control. Home exists only on splash; play
  and finish use Back to return to splash.
- Motion is intentionally visible at tablet size. Reduced-motion preserves the
  pose swap, spoken count, progress, and state change but collapses the arc and
  decorative particles.
- An idle-nudge ladder first repeats the goal, then highlights the true next
  stone. Any child action resets the ladder.
- Orientation or viewport changes do not alter the semantic state.

## Visual system

**Canonical art direction: Papercraft** (legacy pipeline style id:
`paper-garden`). The world uses layered construction paper/cardstock, visible
fibers, hand-cut edges, folded depth, and soft physical shadows. Saturated
spruce, moss, turquoise, denim, plum, orange, cream, and gold build the palette.

The concept mockups are the visual north star for hierarchy and emotional
tone: a bright forest stage, three tall route cards, five readable stones,
central count pennant, orange fox, and star-filled finish. Runtime layout is
responsive and uses real semantic text, so it does not reproduce baked mockup
copy.

Visible art and interaction substrate stay separate. All primary child-facing
objects are authored raster art. DOM/CSS provides positioning, semantic text,
hit areas, focus, transforms, and responsive mapping only; it does not draw
cards, stones, foxes, flags, stars, or buttons.

### Art inventory

| Asset | Runtime form | Visible renderer | Purpose |
| --- | --- | --- | --- |
| selection world | 1440×1080 WebP | GPT Image 2 Papercraft plate | splash field |
| meadow / creek / ridge worlds | 1440×1080 WebP each | GPT Image 2 Papercraft plates | route identity |
| title | transparent WebP | generated cream paper lockup | splash brand art |
| route cards 5 / 10 / 20 | transparent WebP | generated paper cards | route choices |
| stone | transparent WebP, five instances | generated paper rock | count targets |
| active mat | transparent WebP | generated layered leaves | next-step cue |
| pennant | transparent WebP | generated stitched paper | current number |
| Pip idle / hop / celebrate | transparent WebP | identity-consistent contact sheet | guide motion |
| star / finish flag / orange action plate | transparent WebP | generated paper props | progress/reward/actions |
| hub tile | 640×533 JPEG | dedicated Krea 2 toy-table still | catalog grammar |
| Open Graph preview | 1200×630 JPEG | runtime screenshot | sharing |

GPT Image 2 source masters and exact prompts remain under
`assets/source/gpt-image-2/`. The twelve-object sheet is located with the
required `tools/cut-asset-sheet.py` expected-count gate. Qwen Image Layered
attempts the documented `layer_2`; an opaque-core gate accepts the title, star,
and active mat, while the remaining near-transparent attempts fall back to the
established exact-source contiguous-ground matte. Deterministic build tooling
then trims, pads, downsizes, and writes magenta alpha-QA composites. The hub
tile is a separate Krea 2 composition and is not a splash crop.

## Audio direction and complete script

The teacher voice is warm, delighted, and unhurried. Recorded M4A is primary;
Web Speech uses these exact strings as fallback. The quiet shared recorded BGM
begins only after the first real gesture, ducks for narration, follows mute,
and stops on exit.

| Key | Verbatim line |
| --- | --- |
| `select-intro` | “Pick a counting trail. Five, ten, or twenty!” |
| `trail-5-intro` | “Let’s count five stepping stones. Tap number one!” |
| `trail-10-intro` | “Let’s cross the creek and count all the way to ten. Tap number one!” |
| `trail-20-intro` | “Let’s climb the big ridge and count all the way to twenty. Tap number one!” |
| `wrong-next` | “Almost. The next stepping stone is” (followed by the number clip) |
| `segment-clear` | “Five bright steps! The trail keeps going. Find” (followed by the number clip) |
| `route-clear` | “You counted every stepping stone, all the way to” (followed by the reached number) |
| `idle-nudge` | “Can you find the glowing next stone? Look for” (followed by the number clip) |
| `count-1` … `count-20` | the corresponding spoken number, one through twenty |

The runtime uses per-number keys rather than concatenated synthesis so every
accepted touch has a crisp one-to-one spoken response. Qwen voice-clone output
is converted to mono AAC and every final is transcribed by Whisper. A mismatch
falls back to device speech rather than shipping a wrong number.

## Replay variation and persistence

The core sequence is deliberately stable; variation comes from route length,
world, fox movement, progress color, and small nonessential celebration timing.
The child may replay any route immediately. No progress is persisted, so a
fresh visit always opens on the complete three-trail chooser.

No account, upload, microphone, camera, geolocation, model call, analytics
beyond the platform pageview, or child-entered data is used. All generation is
authoring-time and every shipped asset is committed.

## Departures from source material

- The older prose brief proposes real-world video and live-action object
  spotting, while its authoritative art label and all supplied mockups specify
  Papercraft. Production follows the canonical label and mockups. This removes
  passive footage, identity drift, and outdoor dependency while preserving the
  promised nature hike and counting fantasy.
- The old stub’s coach-timer “count things on a real walk” flow is replaced in
  place. It required an adult/outdoor context and did not implement any mockup
  screen.
- A literal twenty-stone screen would shrink targets below the platform floor.
  The longest route therefore uses four fast five-stone tableaux. The child
  still counts continuously to twenty; only the camera-sized scene resets.
- Functional instructions and numerals are live HTML/audio rather than baked
  generated text. Only the decorative title is generated and visually
  spell-checked.
- No generated video ships. A large pose swap and authored hop motion communicate
  the action more clearly, preserve Papercraft identity, and avoid a heavy
  passive-video beat in a direct-manipulation loop.

## Shared systems and debug contract

The game reuses shared screens, HUD, tap handling, audio unlock, recorded voice,
narration, BGM, SFX, celebration, idle nudge, timers, RNG, image preload, and
debug harness modules. No shared module change is required.

`window.QLOBE_DEBUG` format version 1 exposes `ready`, `listModes`,
`startMode`, `getState`, truthful visible `getTargets`, `tap`, `winRound`,
`home`, `mute`, `seed`, `fastTimers`, `getAudioLog`, and `getLayout`. Debug taps
take the real semantic path; win helpers repeatedly invoke that path rather
than mutating completion state.

## Release gate and known risks

Production readiness requires zero new validator errors, zero 404s/page errors,
all three routes completed by real Chrome automation, a wrong-order probe,
recorded-clip evidence, responsive and reduced-motion screenshots, full-size
alpha/material review, and a post-deploy rerun against `https://qlo.be`.

The game remains **beta** until a real iPad child playtest confirms that the
active stone reads instantly, the hop is visible, the five-stone segment bridge
does not feel like a reset, and a five-year-old willingly attempts the 20-step
route without adult explanation.
