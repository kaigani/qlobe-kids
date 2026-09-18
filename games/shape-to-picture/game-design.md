# Shape Surprise Studio — production design

## Promise

Shape Surprise Studio is a pre-reader tablet discovery game: a child touches a
paper shape, makes it grow, or fits paper parts together, then sees a warm
surprise picture. It is a gentle part-to-whole art activity, never a worksheet
or timed quiz.

- Audience: ages 3–6, including children who do not read yet.
- Learning: name familiar 2D shapes, imagine a whole from a part, and practice
  direct touch/drag.
- Art direction: **Papercraft** (`paper-garden`). Every primary object is
  authored raster construction-paper art with fibers, scissor-cut edges,
  stacked layers, and down-right soft shadows. HTML is only copy/accessibility
  and the interaction substrate; it does not draw the shapes or rewards.
- Privacy/offline: no model, microphone, or network call is made by the
  shipped static game.

## Screen map and loop

1. **Splash:** paper title, three oversized pictorial choices, Home and Sound.
   Choosing a mode is the first real gesture and unlocks audio.
2. **Tap Magic:** tap the single large paper shape to pop it into a character.
3. **Stretch Magic:** spread two fingers on the shape, or move the large
   one-finger magic slider to the same threshold.
4. **Picture Builder:** drag a paper piece to a softly glowing ghost, or tap a
   piece then its ghost. Correct pieces snap; a miss stays safe and receives a
   brief gentle wiggle/retry.
5. **Reveal:** a short paper-spark celebration, spoken surprise, and clear
   replay/next/back choices. Back returns to this game’s Splash; Splash Home
   returns to the hub.

One success arrives in 10–25 seconds; a complete mode is 45–90 seconds.
Reduced motion changes bursts/scales to a short opacity/outline response.

| Mode | Gesture | Rounds |
|---|---|---|
| Tap Magic | tap | circle → kitten; square → house; rectangle → rocket |
| Stretch Magic | two-finger spread or slider | scallop → sun; oval → balloon; rectangle → tree |
| Picture Builder | drag or tap–tap | sailboat; ice cream; little home; robot friend |

`config.json` is canonical content: its asset paths, voice keys, pieces, and
normalized placement targets are data, not generated runtime geometry or
service configuration.

## Voice, feedback, and accessibility

`tools/generate-voice.py` holds the exact authoring script and writes
`assets/audio/lines.json`. Runtime uses `assets/audio/manifest.json` and a
recorded clip first; device speech is an error-only fallback. The clips are
unlocked by the first child gesture and narration ducks any supporting sound.

- Enter/mode setup: `intro`, `tap-intro`, `stretch-intro`, `build-intro`.
- Shape naming: `tap-circle`, `tap-square`, `shape-rectangle`,
  `stretch-circle`, `stretch-oval`, `stretch-rectangle`, and `shape-*`.
- Help: `gentle-retry`, `nudge-tap`, `nudge-stretch`, `nudge-build`.
- Completion: the matching `reveal-*`, then `cheer` / `again`.

Primary targets are at least 96 CSS px and ghosts use forgiving padded hit
areas. Pointer capture/cancel/blur end one active drag safely. Every activity
has a one-finger path. Meaningful artwork has concise alt text from the config;
no reading is required to play.

## Deterministic QA surface

`window.QLOBE_DEBUG` format version 1 exposes `ready`, `listModes()`,
`startMode(id)`, `getState()`, `getTargets()`, `tap(id)`, `winRound()`,
`home()`, `mute(boolean)`, `seed(42)`, and `setFastTimers(scale)`. These hooks
use the same handlers as child input, report round/target/progress/reveal state,
and wait for asset/audio readiness.

The smoke suite covers all modes, an incorrect builder action, slider fallback,
recorded-clip selection, all ten reveals, Splash/Home/Back, portrait,
landscape, reduced motion, and hub registration. It captures Splash, active
gesture, placement, reveal, celebration, and portrait images while requiring no
page error, 404, or off-origin runtime request.

## Release gate

There are no emoji, CSS/SVG illustration, or generic DOM geometry primary
objects. Every master/crop/final, hub tile, and voice clip is logged in
`ASSETS.md`; full-size magenta alpha review is required. Static validation,
local real-Chrome visual QA, and production smoke must pass. Status remains
`beta` until a real child tablet playtest is recorded.
