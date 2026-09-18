# Plant Care Captain — production game design

## Promise

A plant is a tiny pet that responds visibly to gentle care. The child chooses
one clay plant friend, completes three short care rituals, and watches that same
friend become taller, shinier, and finally bloom. Nothing can be lost and there
is no fail state.

Audience: ages 5–6 on the platform, with the broad targets, spoken directions,
and one-action-at-a-time pacing also suitable for younger co-play.

## Core loop

```text
choose Sunny / Pip / Basil
  → water intro → 3 water actions → taller state
  → mist intro  → 3 mist actions  → shiny state
  → prune intro → 3 gentle snips  → bloom state
  → thriving destination → choose another plant
```

The three plant identities remain stable through all four states:

- Sunny: orange smiling pot, drooping sunflower → open sunflower;
- Pip: smaller sleepy pot, curling pea shoot → pink sweet-pea flowers;
- Basil: worried orange pot, broad herb leaves → white herb blossoms.

Completed plants receive a rosette on the chooser for the rest of the session.

## Interaction contract

Every motor action has two equivalent paths:

- Water and mist: tap the chunky tool, or drag it to the broad plant target.
- Prune: tap any brown leaf, tap the shears to select the next leaf, or drag the
  shears to a specific brown leaf.

The DOM drag lifecycle comes from `shared/js/stage/drag-to-slot-dom.js`: one
pointer at a time, a movement slop gate, window-level release/cancel handling,
blur and visibility cancellation, padded targets, and guaranteed ghost cleanup.
A missed drop simply returns the tool home. Progress is never removed.

Each tool needs three actions. The authored three-well clay tray carries
progress; the watering step also uses the tall moisture gauge. On every valid
action, progress appears immediately and an authored raster clone travels from
the dock to a 680 ms contact pose: the can tips over soil, the mister puffs into
foliage, or the shears compress at the selected leaf stem. The resting tool is
hidden during this beat. A pruned leaf stays attached through the snip, then the
same raster falls for 520 ms. The third action queues completion until contact
settles; only then does the plant swap to its next authored state and receive
spoken praise.

## Screen design

1. **Plant chooser.** Empty sunny greenhouse, large authored title, three tall
   clay choice cards, dry-state plants, names, standard Home and sound controls.
2. **Tool introduction.** The current plant stays in the greenhouse while a
   dimming mask focuses a large cloud plaque, oversized tool, one spoken
   instruction, and an authored green “I’m ready” button.
3. **Care stage.** Plant left/center, instruction plaque above, authored
   progress carrier and optional moisture gauge, large tool on the right. The
   1180×520 layout preserves a complete pot silhouette. Portrait gives the
   plant the central 34–94% of the screen, keeps the progress band above it,
   and docks the tool at lower right within thumb reach.
4. **Thriving destination.** A distinct sunrise greenhouse with an empty clay
   presentation stage, the chosen bloom, seven raster glints, a clay rosette,
   a spoken recap, and an authored “Another plant” button.

The world is stop-motion clay: warm terracotta, leaf green, cream, sky blue,
and small yellow reward accents. Visible art is raster-authored; CSS owns only
composition, focus rings, transforms, opacity, and reduced-motion behavior.

## Audio

Fourteen recorded teacher-voice clips cover welcome, choice, each tool’s intro,
idle nudge and completion, thriving, replay, and an over-care reassurance.
`shared/js/voice-clips.js` uses the game manifest and one reusable iOS-unlocked
channel; Web Speech is the fallback if a file cannot load. The shared sound
module supplies small pop, sparkle, snip, whoosh, and tada cues. Holding the
sound button toggles mute; a normal press repeats the current spoken prompt.

The idle nudger waits 10.5 seconds, then repeats at 14.5 seconds. It never
counts down or implies failure and resets after any child action.

## State model

Canonical runtime state:

- `screen`: `select | intro | care | thriving`;
- `plantId`: `sunflower | pea | basil | null`;
- `toolIndex` and derived `tool`: `water | mist | prune`;
- `progress`: independent 0–3 counts;
- `completedTools`, `cutLeaves`, and session `completedPlants`;
- `inputLocked` while a tool’s praise resolves;
- transient `contact`, `fallingLeaf`, `actionBusy`, and `completionQueued`
  fields that stage tactile cause-and-effect without changing progress;
- `muted`, deterministic QA `seed`, reduced-motion flag.

Screen transitions invalidate an internal flow token so late narration cannot
advance a screen after Back. Timer groups, nudges, and drag controllers are
cleared on every transition.

## Accessibility and resilience

- Every actionable object is a native button or link with an accessible name.
- Instructions are spoken and also visible; changes are mirrored to an
  `aria-live` region.
- Every primary hit target is at least 96×96 CSS pixels. Leaves use a 108 px
  minimum button around inset raster art; compact HUD art retains a 96 px
  pseudo-element hit pad.
- Pointer cancellation, app switching, and page hiding cannot strand a drag.
- Portrait, short landscape, safe-area insets, keyboard activation, and
  `prefers-reduced-motion` are supported.
- Audio and image preloads never gate the first playable frame.
- No required interaction depends on animation, color alone, or reading.

## Debug and acceptance contract

`window.QLOBE_DEBUG.version === 1` exposes the platform fields plus:

- `selectPlant(id)`, `startTool()`;
- `addWater()`, `mist()`, `snipLeaf(index)`;
- `completeTool()`, `win()`;
- `getAudioLog()`, `getLayout()`.

`getState()` returns serializable screen, plant, plant-state, tool, progress,
completion, contact/input, audio, motion, and seed fields. The production QA
script at `tools/qa.py` drives real valid and missed drags, every tap path, all
transitions, contact and falling-leaf timing, session badge persistence,
recorded-clip selection, 1180×520 landscape, 768×1024 portrait, 390×844 phone,
reduced-motion care, hub-shelf rendering, image decoding, overflow, console
errors, and the full thriving state. Its bounds report enforces the 96 px floor.
