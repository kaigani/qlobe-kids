# Pattern Train — production game design

## Product promise

Pattern Train turns repeating patterns into a physical toy-railway fantasy: notice what repeats, choose the missing wooden cargo, and watch that choice power a cheerful train. It is a short, audio-led pattern-recognition game for ages 2–6, with simple AB starts for younger children and AAB/ABC variation for repeat play.

**Canonical art direction:** **Toy** — hand-painted wooden railway, rounded safe edges, visible grain, soft studio lighting, saturated red/blue/yellow/green cargo, and an airy miniature countryside. Every primary child-facing object is authored raster art; DOM/CSS supplies layout, hit areas, focus, and motion only.

## Modes and learning goals

1. **Shape Cargo** — extend visual AB, AAB, ABB, and ABC patterns using color-plus-shape cargo. One missing final item, three generous choices.
2. **Move & Sound** — extend body-action patterns (clap, stomp, tap, shake), then hear and act out the completed rhythm. One missing final action, three choices.
3. **My Train** — free play: tap cargo into five wagons, replace any wagon, then replay the authored pattern left-to-right. This is expressive practice, not a scored mode.

Each directed mode is three rounds (roughly 45–80 seconds). Each round teaches exactly one next-item inference. Difficulty rises only after a complete success.

## Screen map

```text
splash (home → catalog)
  → depot / mode choice
      → shape play ─┬→ round celebration → next round
      │              └→ arrival reward → depot / again
      → action play ┬→ round celebration → next round
      │              └→ arrival reward → depot / again
      → builder → replay pattern → keep editing / depot
```

- Home appears only on the splash.
- Back from depot returns to splash; Back from play, builder, or reward returns to depot.
- Sound repeats the current spoken prompt/pattern.
- No lock screen, score, loss state, timer, or reading requirement.

## Core directed loop

1. The train shows four or five wagons. The established sequence fills every wagon except the final glowing destination.
2. Narration says, “Look, listen. What comes next?” The established sequence plays left-to-right with a traveling highlight and each item’s spoken name or action sound.
3. Three large wooden choices appear in a raster tray. The child can tap or drag a choice. Drag keeps pointer offset, captures the pointer, and cancels safely.
4. A wrong choice gives a soft wooden wobble, stays available, and says, “Almost! Watch the pattern glow, then try again.” After two misses, playback models the pattern again.
5. A correct choice lifts and seats into the wagon with a clack, the wagon bounces, and the full pattern plays left-to-right.
6. The train visibly chugs across the track. Reduced motion replaces travel with an immediate settled tableau, sparkle, and the same audio.
7. After rounds one and two, the next round appears automatically after a held celebration. After round three, the arrival reward holds until the child chooses Again or Choose.

## Free-play loop

- Five wagons are always visible. Tapping one of eight tray tokens fills the next open wagon; after five, tapping a token replaces the selected wagon.
- Tapping a wagon selects it for replacement. Clear empties the train. The whistle/play button is enabled after two pieces.
- Playback highlights each wagon in order and speaks/plays its item. The train makes a short celebratory roll but remains editable.
- The last free-play train is stored locally as semantic token IDs only. Invalid/unknown saved values are discarded.

## Interaction and feedback rules

- All targets are at least 96×96 CSS px with forgiving hit areas.
- Tap and drag route to the same `chooseToken` handler; pointer cancel returns the ghost safely.
- The empty wagon has the strongest focus: warm glow and breathing scale, disabled under reduced motion.
- Correct feedback is tactile: lift → snap → clack → wagon settle → left-to-right replay → readable train movement.
- Wrong feedback is gentle: wobble and replay, never red/error imagery.
- Progress is three authored star tokens; numerals are supplementary HTML.
- Responsive landscape keeps one horizontal train; portrait uses a smaller but still ≥96 px two-row composition with the tray below. No horizontal page scroll.

## Spoken script (verbatim)

| Key | Line |
|---|---|
| `welcome` | “All aboard! Tap play to visit the pattern station.” |
| `depot` | “Pick a pattern ride.” |
| `shapeIntro` | “Shape cargo! Find what comes next.” |
| `actionIntro` | “Move and sound! Find what comes next.” |
| `builderIntro` | “Build your own pattern train. Tap blocks to fill the wagons, then blow the whistle!” |
| `prompt` | “Look, listen. What comes next?” |
| `nudge` | “Almost! Watch the pattern glow, then try again.” |
| `model` | “Let’s say the pattern together.” |
| `correct1` | “That fits! The pattern keeps rolling.” |
| `correct2` | “You found it! Chugga chugga!” |
| `correct3` | “Beautiful pattern thinking!” |
| `roundComplete` | “The pattern is rolling!” |
| `shapeComplete` | “You powered the shape train!” |
| `actionComplete` | “Your move-and-sound train is rolling!” |
| `builderNeeds` | “Add at least two blocks to make a pattern.” |
| `builderPlay` | “Here comes your pattern!” |
| `builderClear` | “Fresh train! Choose some new cargo.” |
| `again` | “Ready for another ride?” |
| `redTriangle` | “Red triangle.” |
| `blueSquare` | “Blue square.” |
| `yellowCircle` | “Yellow circle.” |
| `greenStar` | “Green star.” |
| `clap` | “Clap!” |
| `stomp` | “Stomp!” |
| `tap` | “Tap!” |
| `shake` | “Shake!” |

Recorded Qwen voice-clone clips are primary. Web Speech via `voice-clips.js` is the fallback. Narration ducks the shared recorded background music.

## Asset list and renderers

| Asset | Runtime purpose | Visible renderer | Interaction substrate |
|---|---|---|---|
| `railway-meadow.webp` | full-bleed station/meadow | raster background | fixed `<img>` |
| `title-lockup.webp` | splash title | raster painted-wood lettering | decorative `<img>` |
| `locomotive.webp` | train leader | alpha raster sprite | DOM image translated by CSS |
| `wagon.webp` | repeatable cargo carrier | alpha raster sprite | wagon button / drop target |
| `tray.webp`, `plaque.webp` | choice and prompt carriers | raster wooden surfaces | DOM containers |
| `button-yellow.webp`, `button-coral.webp` | play/next/action surfaces | raster button plates | semantic `<button>` |
| three `mode-*.webp` cards | depot choices | raster scene cards | semantic `<button>` |
| eight `tokens/*.webp` | shape/action cargo | alpha raster sprites | semantic choice buttons / drag ghost |
| `gold-star.webp`, `spark.webp` | progress/reward | alpha raster sprites | decorative images |
| recorded voice clips | instruction, names, praise | AAC/M4A | `voice-clips.js` |
| `whimsical-toy-workshop.mp3` | quiet BGM | shared recorded track | `bgm.js` |

All source masters, GPT Image 2 prompts, local API recipes, cutter `boxes.json`, and alpha QA composites stay under `assets/source/`. Runtime art is WebP/PNG and stays within the platform budget where practical.

## Departures and rationale

- The old beta’s generic `pattern-continue` engine, emoji tiles, and two-mode scope are replaced. The engine cannot deliver train-specific travel, action playback, drag placement, or editable free play without cross-cutting changes for unrelated consumers.
- The brief’s “Custom Engine” is interpreted as **My Train** free play, not a user-facing engine/editor term.
- Mockup instruction text is retained as optional HTML/audio, but visual guidance and progress work without reading.
- The mockup’s lock is removed; no child-facing mode is locked.
- One coherent guide is the expressive locomotive rather than unrelated one-off child avatars.

## Shared modules

`screens.js`, `hud.js`/shared HUD CSS, `tap.js`, `voice-clips.js`, `narrator.js`, `sfx.js`, `bgm.js`, `audio-unlock.js`, `timers.js`, `rng.js`, `idle-nudge.js`, `preload.js`, and `debug-harness.js`.

## Debug and QA contract

`window.QLOBE_DEBUG` format v1 provides `ready`, `listModes`, deterministic `startMode`, serializable `getState`, truthful `getTargets`, same-handler `tap`, `winRound`, `mute`, `seed`, `fastTimers`, and `home`, plus `getAudioLog`, `getLayout`, `playPattern`, and builder state helpers.

Release gate: every mode, wrong-answer path, tap and drag, navigation loop, recorded voice, portrait/landscape, reduced motion, and train-roll peak pass automated smoke testing and full-size visual review. Keep status `beta` until a real iPad child playtest succeeds.
