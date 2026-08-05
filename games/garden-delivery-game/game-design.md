# Garden Delivery — production game design

**Route:** `games/garden-delivery-game/`
**Category:** movement-outdoor · **Ages:** 5–6 · **Status:** beta until iPad child playtest
**Concept source:** `01-game-concepts/garden-delivery/`
**Art direction:** handmade stop-motion claymation
**Runtime:** custom vanilla ES modules with a reusable normalized tilt-input service

This production pass replaces the existing `coach-timer` prototype at the same
registered route. The prototype asked a child to carry real cups around a room;
the selected concept instead promises a complete tablet fantasy: help Sunny the
sunflower balance a bucket over stepping stones, pour it onto a thirsty flower,
and watch the garden bloom. The route, category, and gentle-care learning promise
stay intact while the original interaction and mockup quality become real.

## 1. Product promise and capability contribution

**Promise:** “Carry one bright bucket across a tiny clay garden and make a
flower come alive.” A child should understand the screen in five seconds: the
flower droops, Sunny has water, and a large clay balance rail visibly responds
to the tablet or finger.

The one repeated skill is **steady, intentional movement**. Three flower paths
keep the job constant while adding a small amount of counter-balancing:

| Mode | Stones | Balance behavior | Single skill |
| --- | ---: | --- | --- |
| `rose` | 3 | wide calm center | find and hold level |
| `tulip` | 4 | one slow breeze | counter a gentle drift |
| `daisy` | 5 | alternating soft breezes | recenter after direction changes |

This game makes a missing platform capability reusable:
`shared/js/tilt-input.js` owns permission, orientation mapping, calibration,
smoothing, teardown, and pointer fallback. It emits the same normalized
`x/y` sample regardless of source, so future balance, marble, pouring, and
steering games do not have to reimplement privileged sensor handling.

## 2. Complete child-facing loop

```text
SPLASH / GARDEN MAP
  choose one flower card
        ↓
permission is requested inside that tap when the browser requires it
        ↓
BALANCE PATH
  hold the clay marker in the green → Sunny crosses one stone
  drift outside → a playful splash, then continue with no lost progress
        ↓
POUR
  tip toward the flower and hold → authored water stream fills the soil
        ↓
BLOOM
  thirsty sprite swaps to its happy bloom, confetti and spoken thanks
        ↓
NEXT GARDEN → map with that flower visibly restored
        ↓
all three complete → GARDEN PARTY → map/replay
```

One delivery should take about 35–60 seconds at the child's pace. A complete
three-flower session should take 3–5 minutes. There is no countdown, life meter,
score, grade, or fail state.

### Splash / garden map

- Full-bleed clay garden plate, generated title lockup, raster home and sound
  buttons, Sunny holding the bucket, and three large authored flower cards.
- Cards show rose, tulip, and daisy visually. HTML names are present for
  accessibility and emerging readers, but the welcome line and plant state
  carry the choice for a pre-reader.
- A completed card swaps from thirsty art to bloom art and gains an authored
  clay water-drop badge. It remains replayable.
- The first real child tap unlocks all audio. A flower-card tap also calls the
  sensor permission request synchronously, satisfying iOS's gesture rule.

### Balance path

- The path plate has five baked clay stepping stones, quiet sky space for the
  rail, and clear foreground space for Sunny and the destination flower.
- A large authored clay rail shows a green center and coral outer zones. The
  authored bucket marker moves along it and tilts with the normalized input.
- Holding inside the safe band fills one invisible per-step accumulator. At
  the threshold Sunny hops to the next stone. Leaving the band gently drains
  the accumulator; completed stones never roll back.
- A breeze is a slow target offset, not random noise. Tulip introduces one
  direction and Daisy alternates. The rail's center glow moves with the breeze
  so the correction is visible, not a hidden rule.
- A drift creates a brief authored droplet burst and bucket wobble. The voice
  says “Little splash! Bring it back to the middle.” Nothing is lost and there
  is always enough water to bloom the flower.
- The current stone is visually lit. Petal progress at the top shows how many
  crossings remain without requiring a numeral.

### Pour

- At the last stone, the balance rail becomes a simple one-sided pour arc and
  the flower grows larger. Voice asks the child to tip toward it.
- Sensor input and finger input still use the same normalized handler. Holding
  in the highlighted pour band grows an authored water-stream sprite and fills
  the soil with a soft darkening mask. Releasing pauses; it never resets.
- The bucket tips only far enough to remain readable and safe. No simulated
  glass, realistic spill physics, or punishment is used.

### Bloom and garden party

- The thirsty plant swaps to its authored bloom counterpart at the exact same
  ground socket. Sunny changes to a cheering pose, `celebrate.js` adds the
  platform burst, and the recorded line names the flower.
- “Next garden” is a 96 px+ clay button with a real HTML label over an authored
  plaque. Back returns to the map; it does not leave the game.
- After the third unique bloom, all three flowers and Sunny appear together on
  the garden-party plate. The child can return to the map and replay any path.

## 3. Input architecture

`createTiltInput()` exposes:

```js
createTiltInput({ onSample, onStatus, reducedMotion })
  -> { request(), calibrate(), setPointer(x, y), releasePointer(), destroy() }
```

- `request()` is invoked only from a flower-card gesture. If
  `DeviceOrientationEvent.requestPermission` exists, it is called in that task.
- Status is one of `idle`, `requesting`, `active`, `denied`, `unavailable`, or
  `fallback`. Denial/unavailability is a normal route, not an error screen.
- Raw beta/gamma are rotated using the current screen orientation, calibrated
  to the device's starting neutral, clamped to `-1..1`, and lightly smoothed.
- Calibration occurs after the first stable sensor samples and again after an
  orientation change. An explicit sound-button long press is not required.
- The clay rail is always touchable. Pointer down temporarily owns the sample;
  window-level move/up/cancel and blur prevent a stranded drag. On release, a
  live sensor may resume.
- The rail is also a focusable ARIA slider. Left/Right move it in stable steps,
  Home recenters, and End moves to the visible pour side; keyboard/switch focus
  temporarily owns input so sensor samples cannot displace the selection.
- Reduced motion keeps all mechanics and input active but removes decorative
  hopping, wobble, parallax, and confetti.
- The game consumes only normalized samples. Sensor, pointer, and debug
  injection all enter the same `handleTiltSample()` path.

Pointer and keyboard fallbacks are not labeled as second best. On desktop they
are active immediately; on a sensor-capable tablet a child may use either at
any time.

## 4. Visual production system

The four supplied 4:3 mockups are the interaction storyboard and visual north
star. The production game preserves their tactile clay, warm morning light,
rolling green garden, round sunflower mascot, oversized readable rail, and
bloom payoff. It removes baked instructional copy, keeps runtime copy as HTML,
and makes every primary object responsive.

No child-facing primary object is drawn as emoji, SVG, canvas geometry, or a
CSS-gradient illustration. CSS supplies layout, hit areas, focus treatment,
safe-area positioning, transforms, masks, and subtle authored-image shadows.

| Child-facing object | Visible renderer | Interaction substrate |
| --- | --- | --- |
| Garden/map and path | opaque generated WebP plates | full-screen DOM section |
| Title | alpha-trimmed generated raster lockup | accessible `<img>` |
| Sunny | transparent clay pose sprites | positioned `<img>` transform socket |
| Flowers | paired thirsty/bloom transparent sprites | card buttons and scene sockets |
| Flower cards | authored clay card-frame sprite + flower sprite | 96 px+ `<button>` |
| Balance rail | authored clay rail sprite | invisible normalized coordinate region |
| Bucket marker | transparent authored bucket sprite | pointer-captured control |
| Water and droplets | transparent authored stream/drop sprites | scale/opacity state only |
| Petal progress | authored petal sprite instances | semantic progress container |
| Bloom button/badge | authored clay plaque/badge | HTML button/label |
| Home/back/sound | existing shared raster UI assets | shared HUD semantics |
| Confetti | shared platform effect | non-interactive overlay |

### Final runtime art list

| Path | Target | Notes |
| --- | --- | --- |
| `assets/backgrounds/garden-map.webp` | 1440×1080, ≤300 KB | no UI, title, cards, or characters baked in |
| `assets/backgrounds/garden-path.webp` | 1440×1080, ≤300 KB | five stones, calm center/top, no characters |
| `assets/backgrounds/garden-party.webp` | 1440×1080, ≤300 KB | broad open sockets for four foreground subjects |
| `assets/title.webp` | ≤150 KB alpha | exact “Garden Delivery”, visually spell-checked |
| `assets/characters/sunny-carry.webp` | ≤100 KB alpha | full body, bucket held level |
| `assets/characters/sunny-cheer.webp` | ≤100 KB alpha | same identity, joyful open pose |
| `assets/flowers/{rose,tulip,daisy}-thirsty.webp` | ≤80 KB each alpha | droop is readable at card scale |
| `assets/flowers/{rose,tulip,daisy}-bloom.webp` | ≤80 KB each alpha | same ground socket as paired thirsty state |
| `assets/props/bucket.webp` | ≤80 KB alpha | separate controller marker |
| `assets/props/water-stream.webp` | ≤60 KB alpha | authored water shape, scalable along pour axis |
| `assets/props/water-drop.webp` | ≤30 KB alpha | repeated for splash feedback |
| `assets/ui/flower-card.webp` | ≤80 KB alpha | empty clay card frame; HTML name overlays |
| `assets/ui/balance-rail.webp` | ≤100 KB alpha | cream rim, green center, coral ends |
| `assets/ui/pour-rail.webp` | ≤100 KB alpha | highlighted tip-toward-flower arc |
| `assets/ui/clay-button.webp` | ≤80 KB alpha | empty plaque for real HTML labels |
| `assets/ui/garden-helper.webp` | ≤80 KB alpha | picture-first reward badge, no required text |
| `assets/ui/petal.webp` | ≤30 KB alpha | progress marker |
| `assets/hub source` | 768×640 source | Krea toy-table hub grammar, no title/UI |
| `../../assets/hub/tiles/garden-delivery-game.jpg` | 640×533 | curated hub tile |
| `assets/og-image.jpg` | 1200×630 | captured from final splash |

GPT Image 2 creates the cohesive clay visual system from the mockup reference.
Cutout masters use a flat removable background. The planned LAN layered-image
pass was not used because the authoring boundary did not permit uploading the
project masters; a precise GPT Image edit changed only the backdrop to the
skill's removable chroma key, and the installed chroma helper plus deterministic
finalizer preserved the subjects locally. Krea 2 supplies the separate
toy-table hub tile. Final runtime files are deterministically trimmed, padded,
resized, and optimized. Masters, prompts, recipes, processing, creator, and
license remain under `assets/source/` and in `ASSETS.md`.

## 5. Spoken script (verbatim)

The game initializes `voice-clips.js` with recorded Qwen voice-clone clips and
the exact text below. Every key has the same Web Speech fallback.

| Key | Spoken line |
| --- | --- |
| `welcome` | “Sunny's garden needs water. Choose a thirsty flower!” |
| `choose-again` | “Which flower should we help next?” |
| `controls` | “Hold the tablet with two hands and tilt gently, or slide the bucket with one finger.” |
| `rose-intro` | “The rose is thirsty. Keep the bucket in the green for three careful steps.” |
| `tulip-intro` | “The tulip is thirsty. A soft breeze is coming. Lean gently to keep the water level.” |
| `daisy-intro` | “The daisy is thirsty. Follow the changing breeze and bring the water safely.” |
| `steady` | “So steady!” |
| `splash` | “Little splash! Bring the bucket back to the middle.” |
| `halfway` | “Halfway there. Sunny's got this!” |
| `pour` | “You made it! Tip the bucket toward the flower.” |
| `pour-nudge` | “Move toward the glowing side and hold it there.” |
| `rose-bloom` | “The rose bloomed! Look at those velvety petals.” |
| `tulip-bloom` | “The tulip bloomed! What a bright garden bell.” |
| `daisy-bloom` | “The daisy bloomed! Sunshine in a flower.” |
| `all-bloomed` | “Every flower is dancing! You're a garden helper.” |
| `balance-nudge` | “The green middle is waiting for the bucket.” |
| `replay` | “The garden always loves another delivery.” |

Voice tone is a warm, delighted preschool teacher: unhurried, never urgent.
Generation uses the approved local reference voice. Each encoded M4A is
Whisper-transcribed and compared with the intended line; a rejected clip is
retried or omitted so the correct fallback speaks instead.

## 6. Feedback, accessibility, and resilience

- Hear it, see it, do it: each prompt names one visible action; rail motion and
  authored sprites respond immediately; a soft SFX marks every stone.
- All interactive targets are at least 96 CSS px in both orientations.
- Balance and pour expose a focusable slider with visible focus, value text,
  arrow/Home/End control, and the same no-fail progression as touch or tilt.
- No gameplay depends on reading, color alone, hearing alone, or hardware
  sensors. The safe band differs by position, brightness, and shape as well as
  green/coral color. Voice has an `aria-live` mirror.
- Home appears only on the splash and returns to `../../`. Back on play/bloom
  returns to the in-game map. Sound repeats the current line and toggles mute
  through the platform's normal debounced behavior.
- Pointer cancel, blur, visibility changes, and orientation changes cannot
  strand an active drag. Returning from an app switch re-arms audio unlock.
- Reduced-motion removes decorative motion while preserving clear sprite-state
  swaps and progress.
- No camera, microphone, account, child name, remote call, or personal data is
  used. Completion is session-only and intentionally resets on reload.
- All model calls are authoring-time only. Game assets and logic are fully
  static and remain playable when the platform analytics endpoint is offline.

## 7. Data and module boundaries

`config.json` is canonical and Studio-editable. It contains mode order, flower
assets, stone count, safe threshold, deterministic breeze segments, pour side,
and voice keys. `config.js` is only the standard fetch shim.

Shared modules used:

- `shared/js/tilt-input.js` — new normalized sensor/pointer capability.
- `shared/js/audio-unlock.js` — first-gesture fan-out and kiosk guards.
- `shared/js/voice-clips.js` — recorded voice plus correct fallback/log.
- `shared/js/sfx.js` — tactile, splash, step, and bloom effects.
- `shared/js/celebrate.js` — platform reward burst and reduced-motion policy.
- `shared/js/idle-nudge.js` — balance/pour reminders.
- `shared/js/timers.js` and `rng.js` — cancelable timing and deterministic variants.
- `shared/js/debug-harness.js` — production QA contract.

Game-local `js/main.js` owns only Garden Delivery state, rendering, scene
transitions, normalized balance/pour rules, and mapping config to the DOM.

## 8. `QLOBE_DEBUG` format version 1

Required surface:

- `ready`, `listModes()`, and `startMode(id)` for rose/tulip/daisy.
- `getState()` including screen, mode, stone, stable progress, breeze, input
  sample/source/status, pour progress, completed flower ids, muted, and seed.
- `getTargets()` and `tap(id)` using the same action handlers as real buttons.
- `setTilt(x, y, source='debug')` through `handleTiltSample()`.
- `setTiltStatus(status)` for active/denied/unavailable branches.
- `calibrateTilt()`, `completeStep()`, `completePour()`, and `win()`.
- `seed(value)`, `fastTimers(on)`, `mute(on)`, and `getAudioLog()`.

Debug hooks do not manufacture privileged device events. They feed normalized
semantic input to the same game handler used by the reusable service.

## 9. Explicit departures

- **From the old prototype:** removes the real-water coach checklist, timers,
  cups, chair obstacle, teapot round, emoji art, and two old mode ids. Those
  were a different product and did not implement the chosen concept.
- **From the mockups:** generated instructional sentences and numerals are not
  baked into plates. Audio, petal progress, and real HTML labels are reliable
  and accessible. The map has no redundant “deliver” button; tapping a large
  flower card is the single obvious action.
- **From the brief:** stepping stones advance after sustained balance instead
  of requiring a second simultaneous tap. This keeps the task playable with
  the one-finger fallback and focuses the intended steady-hand skill. Spills
  pause rather than empty the bucket so a child is never failed by sensor drift.
- **From category default:** the movement/outdoor shelf normally suggests Field
  Journal watercolor. Claymation is chosen because the user explicitly allowed
  it and all reviewed concept mockups use it; mixing watercolor plates with
  clay foreground objects would lower fidelity.

## 10. Risks and release gate

Primary risks are iOS permission timing, device-axis changes after rotation,
sensor jitter, fallback equivalence, crop-safe 4:3 art in portrait, complex
petal alpha, recorded-voice decoding, and motion that looks clear at tablet
size without becoming nauseating.

Release requires:

1. no placeholder emoji/vector/CSS primary art and visually matched foregrounds;
2. exact title spelling and inspected alpha on saturated magenta;
3. every recorded line transcript-QA'd, plus proven speech fallback;
4. sensor granted, denied, unavailable, pointer, keyboard/switch, cancel,
   calibration, portrait, landscape, and reduced-motion browser coverage;
5. all three paths, retry feedback, pour, bloom, all-garden party, navigation,
   mute, and replay driven through real UI and `QLOBE_DEBUG`;
6. zero unexpected page errors, failed requests, game-owned off-origin runtime
   calls, or new validator errors (the shared platform analytics shim is known);
7. full-size visual review of splash, every flower choice, balance center and
   spill states, pour, each bloom, party, portrait, and wide landscape;
8. manifest/registry agreement and curated hub/OG art;
9. deployed GitHub Pages success followed by the same smoke suite and visual
   screenshots against `https://qlo.be`;
10. status remains `beta` until the target child succeeds on a real iPad.
