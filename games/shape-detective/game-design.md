# Shape Detective — production game design

- **Game id:** `shape-detective`
- **Status:** `beta` until a real iPad child playtest
- **Audience:** ages 5–6
- **Category:** Math & Number Sense
- **Canonical art direction:** **Toy**
- **Per-game treatment:** rough color-chalk classroom slate
- **Runtime style id:** `toy-table` (taxonomy compatibility only)
- **Engine:** custom, data-driven, game-local
**Concept authority:** the user brief, supported by the closest screen references in
`../01-game-concepts/chalkboard-big-strokes/output/ui-mockups/` and
`../01-game-concepts/shape-to-picture/output/ui-mockups/`

## Product promise

Shape Detective turns early geometry into three playful chalkboard cases. A child
listens to a property clue, searches a chalk-drawn scene with a real draggable
magnifier, and places evidence using spatial words such as **above**, **below**,
**inside**, **beside**, and **between**. Every correct answer changes the board:
chalk wakes up in color, an evidence stamp lands, and the solved case joins the
child's detective collection.

The game should feel like opening a beloved classroom slate after hours, not like
answering a geometry worksheet. The interaction is readable in roughly five
seconds, all required directions are spoken, and every loop is untimed.

The three modes deliberately teach one skill each:

1. **Shape Clues** — identify a 2D shape from its sides, corners, and curves.
2. **Secret Spots** — understand spatial language while searching a scene.
3. **Chalk Map** — act on spatial language by placing one shape relative to another.

Each mode is five short rounds, about 45–90 seconds. Completing all three during a
page session unlocks a Master Detective finale. Progress is in-memory only.

## Design authorities and intentional departures

The request names a new “rough color chalk sketch on blackboard” world. The
platform currently permits six canonical labels. This design records the requested
look as a **Toy** variant because the board, oak frame, felt eraser, chalk sticks,
evidence cards, and magnifier are tactile classroom objects; the existing
Chalkboard Big Strokes brief makes the same classification. This is not a seventh
taxonomy label and does not change the shared style registry.

Intentional departures from the closest mockups:

- Chalkboard Big Strokes supplies slate texture, oak framing, dusty pastel color,
  and bold one-focus composition; its tracing mechanic is not reused.
- Shape-to-Picture supplies large manipulatives and clear drag destinations; its
  bright Papercraft world and picture-building goal are not reused.
- Functional prompts, progress, and button labels stay live HTML and spoken audio.
  The decorative title is the only generated lettering and must be spell-checked.
- Mode cards start a case directly. There is no select-then-Start step.
- The game uses no CSS, SVG, emoji, or Canvas drawings for primary visible art.
  Authored raster plates and sprites provide the board, cards, shapes, magnifier,
  markers, rewards, and effects; DOM/CSS supplies layout and input only.
- No one-off child detective is introduced. The personality comes from the warm
  narrator, the physical magnifier, and animated chalk evidence.
- A magnifier search is used only in Secret Spots. Repeating it in every mode would
  weaken the one-skill-per-mode rule and add unnecessary motor load.

## Screen map

```text
catalog
  ↓
CASEBOARD / splash ──Home──→ catalog
  ├─ Shape Clues ──→ 5 rounds ──→ CASE CLOSED ──→ CASEBOARD
  ├─ Secret Spots ─→ 5 rounds ──→ CASE CLOSED ──→ CASEBOARD
  └─ Chalk Map ────→ 5 rounds ──→ CASE CLOSED ──→ CASEBOARD
                                      │
                     third unique case completed
                                      ↓
                              MASTER DETECTIVE
                                      ↓
                                  CASEBOARD

Back from play, Case Closed, or Master Detective returns to CASEBOARD.
Home appears only on CASEBOARD. Replay voice appears on every play screen.
```

### Boot and first gesture

- The caseboard paints immediately from committed local assets.
- No narration or music plays on page load.
- The first real pointer/keyboard gesture unlocks voice clips, Web Speech fallback,
  SFX, and BGM through the platform unlock fan-out.
- A mode-card gesture starts that case immediately, speaks its intro, and begins
  quiet `quirky-forest-adventure.mp3`. Returning to the caseboard stops music.
- All round input is enabled while narration plays. A newer spoken line cancels the
  older one rather than queueing over it.

### CASEBOARD / splash

- Full-bleed oak-framed blackboard plate with a calm charcoal center, chalk dust,
  three clipped case cards, a felt eraser, and a row of pastel chalk sticks.
- Generated transparent `SHAPE DETECTIVE` title lockup, checked character by
  character. The image has an accessible name.
- Three large authored raster cards, each with an image-only clue:
  magnifier + three shapes, magnifier over a tiny scene, and a shape following a
  dotted chalk arrow. Live accessible names identify the modes.
- Completed cards receive an authored chalk rosette during this page session.
- Home is top-left; sound is top-right. No other element leaves the game.
- After 14 seconds without a touch, the first card gets a soft chalk halo and the
  narrator says, “Pick any case to begin.” A later nudge rotates to another card.

### PLAY shell

- Back is top-left, replay voice is top-right, and five chalk progress marks sit
  outside both HUD keep-out zones.
- A wide authored blank clue plaque carries one short live prompt. The child path
  never depends on reading it; the same line is always spoken.
- The active learning object owns the visual center. Decorative props stay at the
  edge and never compete with the answer.
- A correct action lands the evidence stamp, recasts the learning fact aloud, and
  advances after a short readable hold only once that spoken completion line has
  finished. Debug mode can skip the hold.
- A wrong action never changes progress. It gives one small chalk puff/wobble and a
  precise modeling line, then leaves the same evidence available.

### CASE CLOSED

- An authored `CASE CLOSED` chalk stamp and the mode's filled evidence badge
  replace the play field with a clear completion tableau.
- A large authored action slab with live text returns to the caseboard.
- If this is the third unique case, the action advances to Master Detective first.

### MASTER DETECTIVE

- All three case cards fan across the board with their rosettes.
- Authored badge imagery bursts briefly around the stamp; under reduced motion it
  settles without travel.
- The narrator names both learned ideas: shape properties and spatial words.
- “Play again” returns to the caseboard and clears the completed-case set for a
  fresh three-case run.

## Gameplay specification

All round order and choice order are seedable. The shipped first-play ramp is fixed
for teaching clarity; replay shuffles decoy order and rotates token orientations without
changing a shape's defining geometry.

### Mode 1 — Shape Clues

**Skill:** identify a shape from the properties of its boundary.

Each round presents three or four large authored chalk evidence tokens. Tokens use
varied orientation and neighboring colors so the child must use shape properties, not a memorized
pose or palette. A tap, Enter, or Space chooses a token through one semantic handler.

| Round | Correct evidence | Decoys | Spoken clue |
| --- | --- | --- | --- |
| 1 | circle | triangle, square | “Find the shape that is round all the way, with no corners.” |
| 2 | triangle | circle, rectangle | “Find the shape with three straight sides and three corners.” |
| 3 | rectangle | square, triangle, oval | “Find the shape with four sides. Two are long and two are short.” |
| 4 | rotated square | rectangle, triangle, pentagon | “Find the shape with four equal sides, even when it turns.” |
| 5 | hexagon | pentagon, triangle, square | “Find the shape with six straight sides and six corners.” |

Correct behavior:

1. The chosen raster token lifts with a warm chalk highlight.
2. A brief burst of authored badge imagery celebrates the choice.
3. The narrator recasts the exact property.
4. The next clue begins after roughly 1.5 seconds.

Wrong behavior:

- The token gives one small side-to-side chalk scuff.
- The narrator asks the child to look again at sides and corners without naming or
  eliminating the correct answer.
- On the second miss, the correct token receives a slow authored halo pulse.

### Mode 2 — Secret Spots

**Skill:** understand **inside, above, between, below,** and **beside**.

The authored 1600×1200 detective-town plate contains a house with a window, a
rainbow, two flowers, and a telescope. Three or four small chalk shapes are hidden
in the scene and exist first only inside the shared magnifier's duplicate world.
The child drags an authored true-alpha magnifier. Holding it over a shape reveals
that shape in the base scene; a tap through the glass confirms the answer.

| Round | Target placement | Spoken clue |
| --- | --- | --- |
| 1 | turquoise circle inside the house window | “Find the turquoise circle inside the window.” |
| 2 | yellow triangle above the house | “Find the yellow triangle above the house.” |
| 3 | coral square between two flowers | “Find the coral square between the flowers.” |
| 4 | sky-blue rectangle below the rainbow | “Find the sky-blue rectangle below the rainbow.” |
| 5 | green hexagon beside the telescope | “Find the green hexagon beside the telescope.” |

Search behavior:

- The magnifier starts in verified clear space, outside every clue's dwell radius,
  so the child always discovers the first shape.
- Window-level pointer handling and pointer capture prevent stranded drags.
- Dwell is about 420 ms; reduced motion uses the same semantic timing but no glint.
- The lens always has a minimum 140 CSS-pixel grab surface and never hides behind
  the HUD. A tap caught by the lens forwards once to the revealed control.
- A discovered wrong shape stays discoverable and the narrator warmly asks the
  child to listen to the place word and look again.
- After two misses, the lens glides toward the relevant region as a visual hint.
  Idle support replays the clue or nudges the magnifier; nothing auto-solves the
  case.

### Mode 3 — Chalk Map

**Skill:** act on **above, below, beside, between,** and **inside** by placing one
shape relative to a visible anchor.

One large draggable raster evidence token waits on the chalk tray. The board shows
one or two stationary raster anchors. The child may drag the evidence directly or
tap it and then tap the board. Both paths call the same placement action. Acceptance
zones are generous, invisible DOM regions derived from art-space coordinates.

| Round | Prompt |
| --- | --- |
| 1 | “Put the yellow triangle above the coral square.” |
| 2 | “Put the turquoise circle below the yellow triangle.” |
| 3 | “Put the sky-blue rectangle beside the turquoise circle.” |
| 4 | “Put the coral square between the two pink stars.” |
| 5 | “Put the turquoise circle inside the green hexagon.” |

Placement behavior:

- Pointer-to-object offset is preserved; one drag can be active at a time.
- Pointer up outside a correct zone returns the token to the tray with one gentle
  chalk skid. `pointercancel`, blur, visibility loss, and screen exit always cancel.
- Each authored acceptance region is deliberately generous for preschool motor
  control and snaps a valid drop to the exact target center.
- Keyboard flow selects the evidence with Enter/Space and confirms the focused
  semantic placement target through the same handler.
- After one miss, a warm retry line repeats the place-word focus. After two misses, an authored dusty ghost
  outline fades into the correct region; it is a hint, not an automatic placement.
- Success lands the raster token, adds a brief authored badge burst, and recasts
  the relation: “The triangle is above the square.”

## Voice script — source of truth

The following keys and text are verbatim. Qwen voice-clone outputs are accepted only
after Whisper transcript QA; a rejected or missing clip falls back to device speech
using this same text.

### Shell and completion lines

| Key | Exact spoken text |
| --- | --- |
| `welcome` | “Detective, we have shape mysteries to solve. Choose a case.” |
| `pick-case` | “Pick any case to begin.” |
| `intro-properties` | “Shape Clues! Listen for sides, corners, and curves.” |
| `intro-search` | “Secret Spots! Move the magnifying glass and listen for where to look.” |
| `intro-place` | “Chalk Map! Put each shape exactly where the clue says.” |
| `retry-property` | “Look at the sides and corners. Try another shape.” |
| `retry-search` | “Good searching. Listen to the place word and look again.” |
| `retry-place` | “Almost. Listen for the place word and try again.” |
| `idle-property` | “Use your detective eyes. Count the sides and corners.” |
| `idle-search` | “Slide the magnifying glass across the chalk scene.” |
| `idle-place` | “Move the loose shape where the clue says.” |
| `complete-properties` | “Case closed! You solved every shape clue.” |
| `complete-search` | “Case closed! You found every secret spot.” |
| `complete-place` | “Case closed! You made a perfect chalk map.” |
| `finale` | “Master Shape Detective! You used shape clues and spatial words to solve every case.” |

### Shape Clues round lines

| Key | Exact spoken text |
| --- | --- |
| `property-1-prompt` | “Find the shape that is round all the way, with no corners.” |
| `property-1-success` | “A circle! It is round all the way and has no corners.” |
| `property-2-prompt` | “Find the shape with three straight sides and three corners.” |
| `property-2-success` | “A triangle! Three sides and three corners.” |
| `property-3-prompt` | “Find the shape with four sides. Two are long and two are short.” |
| `property-3-success` | “A rectangle! Two long sides and two short sides.” |
| `property-4-prompt` | “Find the shape with four equal sides, even when it turns.” |
| `property-4-success` | “A square! Four equal sides, even when it turns.” |
| `property-5-prompt` | “Find the shape with six straight sides and six corners.” |
| `property-5-success` | “A hexagon! Six sides and six corners.” |

### Secret Spots round lines

| Key | Exact spoken text |
| --- | --- |
| `search-1-prompt` | “Find the turquoise circle inside the window.” |
| `search-1-success` | “Inside! The turquoise circle is inside the window.” |
| `search-2-prompt` | “Find the yellow triangle above the house.” |
| `search-2-success` | “Above! The yellow triangle is above the house.” |
| `search-3-prompt` | “Find the coral square between the flowers.” |
| `search-3-success` | “Between! The coral square is between the flowers.” |
| `search-4-prompt` | “Find the sky-blue rectangle below the rainbow.” |
| `search-4-success` | “Below! The sky-blue rectangle is below the rainbow.” |
| `search-5-prompt` | “Find the green hexagon beside the telescope.” |
| `search-5-success` | “Beside! The green hexagon is beside the telescope.” |

### Chalk Map round lines

| Key | Exact spoken text |
| --- | --- |
| `place-1-prompt` | “Put the yellow triangle above the coral square.” |
| `place-1-success` | “Above! The triangle is above the square.” |
| `place-2-prompt` | “Put the turquoise circle below the yellow triangle.” |
| `place-2-success` | “Below! The circle is below the triangle.” |
| `place-3-prompt` | “Put the sky-blue rectangle beside the turquoise circle.” |
| `place-3-success` | “Beside! The rectangle is beside the circle.” |
| `place-4-prompt` | “Put the coral square between the two pink stars.” |
| `place-4-success` | “Between! The square is between the stars.” |
| `place-5-prompt` | “Put the turquoise circle inside the green hexagon.” |
| `place-5-success` | “Inside! The circle is inside the hexagon.” |

## Interaction and feedback rules

- Every visible child target has a minimum 96×96 CSS-pixel hit region.
- Pointer Events are the primary input. Buttons use the platform's one press path.
- Drag interactions always have tap-tap and keyboard parity.
- Focus is visible and never communicated by color alone.
- Any new narration cancels old narration; screen exit cancels timers and input.
- Wrong input gets modeling and another try, never a buzzer, red X, score loss,
  timer, lockout, or “Game Over.”
- Progress shows solved cases, not points or stars that can be lost.
- Motion communicates lift, search, snap, stamp, and reveal. Decorative motion is
  brief. Reduced motion preserves state changes with opacity/scale settles only.
- The prompt can always be replayed. Idle support resets on every interaction.
- Exact color words are redundant with a shape property or spatial relation, so
  color-vision differences never make a clue impossible.

## Art direction and production inventory

The entire child-facing field belongs to one physical classroom-slate world:
charcoal-black stone, visible erased smudges, warm oak framing, wool felt, dusty
pastel sticks, rough doubled outlines, broken pigment flecks, and tiny hand-drawn
imperfections. Chalk colors are turquoise, sunflower, coral pink, sky blue, leaf
green, orange, lavender, and warm white. Lighting is warm upper-left, restrained,
and consistent across every physical prop.

No primary visible object may be an emoji, SVG, CSS shape/gradient illustration,
Canvas drawing, Unicode geometric symbol, or generic flat panel. CSS may position
raster art, provide focus outlines, enlarge hit regions, clip overflow, and animate
transforms/opacity. Live HTML text may sit on authored blank chalk furniture.

| Asset family | Runtime target | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| Caseboard plate | 1600×1200 WebP, ≤300 KB target | authored opaque raster board/frame/tray | cover-fit background |
| Search scene plate | 1600×1200 WebP, ≤300 KB target | authored chalk town with house/rainbow/flowers/telescope | shared hotspot scene background |
| Title lockup | about 1000×320 transparent WebP, ≤150 KB | generated chalk lettering `SHAPE DETECTIVE` | named image |
| Mode cards ×3 | about 520×420 transparent WebP | authored chalk case cards and icons | semantic buttons |
| Shape tokens ×7 | 360×360 transparent WebP common canvas | authored dusty circle/oval/triangle/square/rectangle/pentagon/hexagon | buttons / drag objects |
| Rotated-square variant | 360×360 transparent WebP | same square source, authored 45-degree pose | button image |
| Chalk stars ×3 colors | 220×220 transparent WebP | authored rough star marks | anchors / reward particles |
| Magnifier frame | about 720×720 transparent WebP with true-alpha glass hole | authored oak-and-brass chalk detective prop | shared magnifier surface |
| Clue plaque | about 1100×210 transparent WebP | blank dusty chalk ribbon/plaque | live prompt host |
| Evidence stamp | about 560×300 transparent WebP | authored `CASE CLOSED` decorative stamp, spell-checked | reward image |
| Case rosettes ×3 | about 260×260 transparent WebP | authored chalk badges | session decoration |
| Action slab | about 540×220 transparent WebP | blank chalk/wood control furniture | semantic button + live label |
| Ghost marker + dust flecks | 260–420px transparent WebP | authored chalk hint/effect sprites | inert images |
| Hub tile | 640×533 JPEG | separate Krea Toy-object scene, no text | hub image |
| OG image | 1200×630 JPEG | captured final splash | social metadata |

Production lifecycle:

```text
GPT Image 2 visual-direction master + cohesive plates/contact sheets
→ Qwen Image Edit only for a reference-conditioned repair or style variant
→ Qwen Image Layered `layer_2` extraction for every cutout
→ deterministic trim / pad / normalize / WebP encode
→ saturated-magenta full-size alpha inspection
→ runtime asset + retained source + prompt/seed/provenance
```

The hub tile is generated separately with Krea 2 in the platform Toy-object menu
grammar and is never a crop of the splash. Generated functional instructional text
is prohibited. Source masters, prompt specs, processing records, and QA composites
remain under `assets/source/`; runtime files stay compact under `assets/`.

## Audio design

- Primary narration: game-local `voice-clips.js` pack created with an approved
  Qwen voice reference and transcript-checked with Whisper.
- Fallback narration: Web Speech using the exact source lines above.
- Shared SFX: soft `tick`, `pop`, `whoosh`, `sparkle`, and `tada` through `sfx.js`.
- Shared recorded BGM: `shared/assets/music/quirky-forest-adventure.mp3` through
  `bgm.js`, quiet and ducked during every narration.
- BGM is preloaded before the first gesture, starts only after a case is chosen,
  follows mute, stops on return to the caseboard, and stops on page teardown.
- No generated audio is shipped unless the intended text, transcript, duration,
  encoding, and browser playback all pass.

## Responsive layout

The authored coordinate system is 1600×1200 (4:3). One cover-fit transform maps
art and hit regions together.

- **Landscape/tablet:** title and clue plaque stay high; evidence occupies the calm
  center; mode cards form a three-card row; the chalk tray anchors the lower edge.
- **Portrait:** the board remains full-bleed; cards become a vertical stack; play
  places the prompt above a compact scene and the evidence tray below it. The
  magnifier is smaller in art space but never below its CSS-pixel hit floor.
- **Short landscape:** prompt height compresses before learning objects do. HUD,
  prompt, progress, and target zones never overlap.
- Safe-area variables protect all HUD controls. Search hotspots are translated away
  from live HUD bounds by the shared scene module.
- Orientation changes cancel active drags, reflow the scene/lens from the single art
  transform, and leave the round semantically unchanged.

## State, determinism, and `QLOBE_DEBUG`

Serializable state:

```js
{
  screen: 'splash' | 'play' | 'case-closed' | 'finale',
  mode: null | 'properties' | 'search' | 'place',
  round: 0,
  roundsTotal: 5,
  targetId: null,
  choices: [],
  relation: null,
  foundIds: [],
  wrongAttempts: 0,
  completedModes: [],
  selectedId: null,
  busy: false,
  muted: false,
  seed: 42,
  timerScale: 1
}
```

`window.QLOBE_DEBUG` format version 1 must expose a ready promise, mode listing,
deterministic `startMode`, serializable state, truthful targets, input through the
same semantic handlers used by real taps/drags, `completeRound`, `completeMode`,
mute, seed, and fast timers. Game extensions should include `moveLensTo(id)`,
`choose(id)`, and `placeAt(relation)` for deterministic QA.

## Privacy, persistence, and fallback

- No account, game-specific analytics events, microphone, camera, uploads, or
  child-authored data.
- Completed-case badges live only in memory and reset on reload.
- No runtime request reaches a model, LAN service, authoring server, or asset CDN.
- Missing recorded narration falls back to the same correct text through device
  speech. Missing decorative audio never blocks play.
- Asset preload never rejects the whole game; a missing required visual is a QA
  failure before release, not a runtime generation request.

## Verification and release gates

1. All JSON parses; all local ES modules pass syntax checks; registry mirror checks
   pass; full validator adds no errors; `git diff --check` is clean.
2. Real Chrome runs every mode and every round through the semantic debug surface,
   including one wrong answer, drag cancel, orientation change, Back mid-round,
   replay prompt, mute, and reduced motion.
3. The recorded-clip path is proven after a real gesture; audio logs show clips, not
   only Speech fallback. BGM starts, ducks, mutes, stops, and revives correctly.
4. Meaningful screenshots cover splash, each mode, wrong feedback, success, Case
   Closed, finale, landscape, portrait, short landscape, and reduced motion.
5. Every child-facing asset is inspected at full size. Alpha cutouts are checked on
   saturated magenta; title and stamp lettering are checked character by character;
   foreground material fidelity is judged separately from layout.
6. An independent adversarial ART DIRECTOR reviews production captures and every
   primary asset. All BLOCKER and MAJOR findings are fixed and re-reviewed.
7. The production URL loads through the hub with zero unexpected console errors,
   failed requests, or case-sensitive path failures, and production screenshots are
   visually compared with the accepted local captures.
8. Status remains `beta` until the target child succeeds on a real iPad. A live flip
   requires that playtest rather than an automated substitute.
