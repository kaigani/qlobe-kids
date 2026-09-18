# Pouring Station — production game design

## Product promise

Pouring Station turns one calm practical-life action into a tactile tablet toy:
choose water, beans, or rice; lift Maya's translucent pitcher; hear and see the
material move; and stop at a glowing line. A child succeeds through observation
and hand control, not reading or reaction speed.

- **Audience:** ages 4–6. The interaction is forgiving enough for the concept's
  younger 2–4 audience, but the manifest remains aligned with the platform.
- **Category:** Practical Life.
- **Canonical art world:** **Toy** (`toy-table` is the authoring alias).
- **Guide:** Maya, an existing QLOBE cast member.
- **Session promise:** one material is a 45–75 second, three-cup practice loop;
  all three materials make a satisfying 3–5 minute session.
- **No-fail rule:** the target line gently catches the final amount. There is no
  spill penalty, score, countdown, or Game Over.

## Skills by mode

| Mode | One skill | Distinct feedback |
| --- | --- | --- |
| Water | Sustain a smooth tilt, then stop at a line | Continuous swishing stream and blue ripples |
| Beans | Control a slower dry pour while listening | Irregular low clinks and discrete coral pieces |
| Rice | Make fine stop-and-start adjustments | Quick soft ticks and a narrow golden stream |

All three modes use the same motor grammar, so replay builds fluency while the
material movement and sound change.

## Screen map

```text
catalog
   ↓
splash / material chooser ──home──> catalog
   ↓ water | beans | rice
play: cup 1 → cup 2 → cup 3 ──back──> splash
   ↓
celebration / tidy reveal ──back or pour again──> splash
```

### Splash

- The authored kitchen and wooden Montessori tray establish the whole world.
- A raster wooden title plaque anchors the top.
- Three large authored tokens—water, beans, rice—are the only primary choices.
- Maya appears at tray level as a familiar helper.
- The sound button says the welcome line; choosing a token speaks the relevant
  modeling line and starts the music after that real gesture.
- Home is present only here and returns to the catalog.

### Play

- One empty authored cup sits left-of-center; its cobalt band and the animated
  glow mark the target without requiring text.
- One authored translucent pitcher sits at the right. Its invisible button is
  larger than the art and never below 96 px.
- A raster hand models the move-left-and-tip gesture until the child touches the
  pitcher. Maya and a small token/plaque repeat the active material visually.
- Three raster star indicators show the short session progress.
- Back returns to the chooser in-page. Sound repeats the current spoken cue.

### Reveal

- Maya cheers beside an authored star reward.
- The three material tokens form the large “pour again” control.
- A folded cloth appears as a soft cleanup epilogue; cleanup is normalized, not
  used as a consequence for failure.
- Back and “pour again” both return to the chooser.

## Core loop and state

Serializable round state:

```js
{
  screen: 'splash' | 'play' | 'reveal',
  mode: null | 'water' | 'beans' | 'rice',
  round: 1 | 2 | 3,
  roundsTotal: 3,
  completed: 0 | 1 | 2 | 3,
  fill: 0..1,
  target: 0.58,
  source: 0.12..0.88,
  phase: 'splash' | 'active' | 'settling' | 'reveal',
  dragging, pouring, tilt, awaitingInput, muted
}
```

1. A mode loads with an empty cup, full-enough pitcher, visible target, and
   spoken material cue.
2. Pointer-down on the pitcher begins one active pointer. Moving toward the cup
   supplies 72% of the tilt value; lifting supplies 28%. This accepts a child's
   natural diagonal gesture instead of demanding precision rotation.
3. Above `tilt = 0.5`, the authored material stream appears, its responsive
   sound begins, pitcher fill falls, and cup fill rises continuously.
4. Releasing early pauses without losing progress. A delayed gentle prompt says
   “Almost there. A little more.”
5. Inside the final nine percent, flow rate eases toward 20% speed. At the line,
   fill clamps exactly to the target, the cup line turns mint, a star pops, and
   the pitcher returns to rest. This implements the brief's dynamic scaffolding
   without pretending to simulate uncontrolled fluid physics.
6. Three short cups repeat the same visible line so the child can consolidate
   one motor plan. The third opens the reveal.

`pointercancel`, release outside the viewport, and window blur stop the stream,
preserve earned fill, and unwind every listener. They never complete a round.

## Complete spoken script

| Key | Verbatim line |
| --- | --- |
| `welcome` | Welcome to Pouring Station! Pick what you would like to pour. |
| `water-intro` | Water swishes smoothly. Lift the pitcher and pour to the glowing line. |
| `beans-intro` | Beans go clink, clink! Tilt slowly and listen. |
| `rice-intro` | Rice whispers softly. Pour a little at a time. |
| `first-pour` | Hold the pitcher. Move it toward the cup, then tip it. |
| `little-more` | Almost there. A little more. |
| `steady` | Slow and steady. Your hands are in charge. |
| `line-one` | You found the line! |
| `line-two` | Beautiful stop. Ready for one more cup? |
| `water-cheer` | Wonderful water pouring! Your hands were calm and steady. |
| `beans-cheer` | Lovely bean pouring! You listened and stopped with care. |
| `rice-cheer` | Wonderful rice pouring! Tiny grains, careful hands. |
| `tidy` | A tiny drip! Maya has the cloth. All tidy. |
| `again` | What shall we pour next? |

Recorded clips are primary. Web Speech reads the same `lines.json` text if a
clip is missing or rejected by transcript QA.

## Audio design

- `voice-clips.js` uses the approved cloned teacher voice. Every final clip is
  transcribed with Whisper before it may enter `manifest.json`.
- `mug-and-sunbeam.mp3` plays quietly through `bgm.js`, starts only after the
  first gesture, ducks beneath every line, follows mute, and stops on teardown.
- The game-local `pour-sound.js` creates responsive material Foley from one
  short-lived Web Audio channel: filtered flowing noise for water, low discrete
  clinks for beans, and quick soft ticks for rice. It is an interaction sound,
  not programmatic background music.
- Shared tick, sparkle, and tada sounds mark choices and success.

## Art direction and visible renderers

The mockups' pale sage kitchen, honey maple, woven aqua tray, blue translucent
resin, and restrained coral/gold accents define the world. Primary visuals are
raster assets. DOM and CSS provide placement, hit areas, masks, focus rings,
fill clipping, target glow, and motion only.

| Child-facing object | Visible renderer | Interaction substrate |
| --- | --- | --- |
| Kitchen + tray | GPT Image 2 raster scene | full-screen background crop |
| Title and prompt plaques | authored wood sprites; title lettering is baked and spell-checked | hidden semantic H1 plus live prompt text |
| Mode choices | authored wood/resin token sprites | transparent 96px+ buttons |
| Pitcher and cup | authored translucent-resin sprites | DOM transforms and clipped raster fills |
| Water/beans/rice | authored fill textures and stream sprites | height mask and repeat position |
| Maya | Qwen-edited shared-character sprite | decorative image; no hit testing |
| Reward, cloth, guide hand | authored alpha sprites | animation only |
| Confetti and target aura | platform effects | feedback layer; not primary art |

Expected runtime targets: scene 1448×1086 WebP; pitcher/cup 512–720 px alpha
WebP; tokens/reward/cloth/hand 320–512 px alpha WebP; fill textures 256 px;
stream sprites 160×512 px; OG image 1200×630 JPEG; hub tile 768×640 source,
curated to the shared tile slot.

## Responsive and accessibility rules

- Landscape is the authored 4:3 composition. Portrait keeps the tray centered,
  moves progress right, and stacks reveal content into two rows.
- Short landscape reduces the title and vessel scale but keeps 96 px hit areas.
- Safe-area variables keep all HUD controls clear of rounded tablet corners.
- Reduced motion removes looping bobs, flow scroll, and confetti; state changes
  remain immediate and fully voiced.
- Functional labels exist for screen readers, but a pre-reader can understand
  every state from pictures, animation, and speech.
- No remote runtime requests, camera, microphone, persistence, account, or
  personal data are used.

## Intentional departures

### From the old prototype

The old `coach-timer` implementation coached an adult-led off-screen checklist.
This production replacement is the on-screen simulated experience explicitly
shown by the selected concept. The stable ID and route remain unchanged.

### From the brief and mockups

- The brief's baby helper becomes shared cast member Maya for platform
  continuity and identity QA.
- The mockup's readable “STOP HERE” instruction becomes a glow, line, modeled
  hand, and voice. Text remains secondary.
- The side ruler is omitted: it duplicates the cup line and competes with the
  gesture for attention.
- The child makes three short pours per material instead of one. Variation in
  fill height builds control without adding a new rule.
- Overpour failure is replaced by magnetic easing at the line. The brief asks
  for confidence and dynamic assistance; precision punishment would oppose it.
- Every cup begins with deliberately generous material. Reaching the single
  practice line leaves visible material in the pitcher, so a source-empty or
  refill failure state cannot interrupt the child's motor practice.
- The concept labels ages 2–4. The manifest uses 4–6 because the platform is
  designed around ages 5–6, while retaining toddler-scale targets and modeling.

## Shared modules and local ownership

Shared: screens, raster HUD, one-path taps, audio unlock, voice clips, speech
fallback, BGM, SFX, timers, celebration, preloading, and debug harness.

Game-local: `pour-gesture.js` (one-pointer diagonal tilt), `pour-sound.js`
(material Foley), and `main.js` orchestration. The gesture stays local until a
second game proves the same contract is reusable.

## `QLOBE_DEBUG` v1

The hook exposes the platform floor plus:

- `getAudioLog()` / `clearAudioLog()`;
- `setPour(tilt)` to feed the production gesture emission path;
- `pourToLine()` to set the cup immediately below target and let the production
  frame loop cross the line;
- `showReveal()` for layout-only review.

`startMode`, `getState`, `getTargets`, `tap`, `winRound`, `mute`, `fastTimers`,
and `home` follow the shared contract. `ready` resolves after voice metadata and
all essential raster art have loaded.

## Release gate

- Every mode completes three rounds through real Chrome.
- Real pointer drag, early release/resume, back, again, sound, and debug routes
  use production handlers.
- Recorded clips—not fallback speech—are observed after a real gesture.
- Landscape, portrait, short landscape, and reduced-motion screenshots pass
  visual review with no clipped vessels or controls.
- No runtime 404, console error, failed request, or remote request.
- Validator passes `--assets --audio`; registry is synced.
- Status remains `beta` until a real iPad child playtest provides the sign-off
  required by `docs/polish-process.md` for `live`.
