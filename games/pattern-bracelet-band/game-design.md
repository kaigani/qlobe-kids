# Pattern Bracelet Band — production game design

**Concept source:** `01-game-concepts/pattern-bracelet-band/brief.md` and its four UI mockups
**Replaces:** the stubbed `pattern-continue` prototype at this same route
**Category / age:** Art & Music · 5–6
**Release status:** Beta until an iPad child playtest
**Canonical art world:** Toy

## Product promise

String a chunky wooden bracelet, discover that every bead is an instrument, and hear the visible pattern become a tiny song. Guided play turns AB, ABC, and ABB continuation into a musical cause-and-effect loop. Free Jam turns the same eight-step bracelet into an open-ended first sequencer, including meaningful gaps as rests and four local keepsakes.

The game should be understandable without reading: the unfinished cord glows, the six visually distinct beads sit in a physical tray, the Play token wakes up when the bracelet is ready, and every meaningful action has recorded spoken guidance.

## Screen map

```text
catalog → splash → Pop Pattern ┐
                   Star Pattern ├→ workshop → concert → choose another
                   Free Jam ────┘       ↑          │
                                        └── replay ┘
```

- Splash: generated title plaque, three wooden mode plaques, miniature playable-looking bracelets, Home only here.
- Workshop: Back, prompt/listen plaque, circular eight-slot board, six-well bead tray, raster controls, and mode-specific progress or jewelry box.
- Concert: a distinct generated toy-stage scene, completed bracelet, smiling star, ambient confetti, Replay, and Make Another.
- Back from workshop or concert returns to the in-game splash. It does not navigate the child out of the game.

## Modes

### Pop Pattern

- Skill: extend AB repeating patterns.
- Three shuffled rounds from four pattern families.
- Six positions are shown and positions seven/eight are missing.
- Tap the correct tray bead for a frictionless placement, or drag it onto the glowing slot.
- A wrong bead returns gently, wiggles the target, and gets a warm recorded nudge. Two misses model the full audio pattern.
- Completing both slots does not auto-advance. The child deliberately presses Play, hears all eight steps, then advances.

### Star Pattern

- Skill: extend ABC and ABB patterns.
- Same interaction contract as Pop Pattern, with four three-part pattern families.
- Bead silhouette and engraved cue accompany hue: dots, flower, wave, moon, leaf, and heart/star.

### Free Jam

- Skill: compose, revise, and hear an eight-step pattern.
- Tap a bead then a slot, or drag directly. Tapping a filled slot with no selected bead removes it.
- Empty slots are rests; they are not errors.
- Tempo is adjustable from 72–168 BPM in 18 BPM steps.
- Clear starts a fresh bracelet.
- Save opens a four-slot jewelry box. Tapping a slot while saving writes it; tapping an occupied slot normally loads it.
- Saves and the working draft persist locally at `qlo.be/pattern-bracelet-band/jewelry-v1`.
- Play performs the song once and moves to the concert. The saved bracelet remains available afterward.

## Musical mapping

Each authored raster bead has its own small WebAudio instrument voice:

| Bead | Engraved cue | Sound character |
|---|---|---|
| Red rounded square | three dots | low toy drum |
| Yellow flower | petals | bright chime |
| Blue rounded square | wave | wooden marimba |
| Purple hexagon | moon | lingering bell |
| Teal scallop | leaf | high pluck |
| Coral heart | tiny star | woodblock |

The shared recorded workshop music plays softly underneath and ducks for spoken lines. It is ambience, not timing logic. The bracelet sequencer owns timing so highlighted bead, audible tone, tempo, and rest always agree.

## Interaction and failure policy

- Primary objects are generated raster art. CSS supplies only layout, hit zones, focus, and feedback effects.
- Effective touch targets are at least 96 px; smaller painted tokens have transparent forgiving hit areas.
- Pointer input is single-drag, window-tracked, and cancelled on blur, page hide, or pointer cancellation. A cancelled drag never becomes a placement.
- Guided beads cannot be removed. Free Jam beads can be replaced or removed freely.
- There are no lives, scores, timers, penalties, or locked content.
- Idle help resets on any pointer action. It first repeats the prompt, then models the pattern.
- Reduced-motion mode removes arrival/wiggle/confetti motion while retaining sound, state, and visible completion.
- Color is redundant with silhouette, engraved mark, spatial position, spoken color, and tone.

## Voice and accessibility

- Qwen voice-clone clips use the approved teacher reference and AAC `+faststart` encoding.
- Each generated line is checked through local Whisper; a bad or omitted recording falls back to the platform speech channel rather than playing a confidently wrong clip.
- The prompt plaque and Sound button repeat the current instruction.
- Accessible labels name bead color, engraved cue, sound, slot number, and controls.
- Functional text remains real HTML; the decorative title lettering is authored raster.

## Art direction

The world follows the concept brief's **Toy** art direction: top-down honey-maple workshop, woven cream mat, premium wooden instruments, chunky satin-painted beads, routed boards, braided cream cord, and warm photographed-toy depth. It deliberately does not use the previous Claymation drift.

The workshop and concert are separate GPT Image 2 scenes. Beads, workshop parts, controls, and the exact-spelling title were produced as coherent GPT Image 2 sheets or lockups, then cut deterministically. Local Qwen layered extraction was accepted for the bead sheet only; two parts-layer attempts dropped objects and were rejected. The hub tile was supplemented with local Krea 2, seed 42. Full provenance and rejection notes live in `ASSETS.md`.

## Runtime architecture

- Static HTML/CSS/ES modules; no build step or runtime model call.
- `shared/js/screens.js` owns splash/play/concert transitions.
- `shared/js/stage/drag-to-slot-dom.js` owns strand-proof pointer interaction.
- `shared/js/voice-clips.js`, `bgm.js`, `sfx.js`, and `audio-unlock.js` own audio policy.
- `shared/js/timers.js` makes playback cancellable and QA-scalable.
- `shared/js/idle-nudge.js`, `hud.js`, `celebrate.js`, and `debug-harness.js` provide platform behavior.
- `window.QLOBE_DEBUG` exposes all three modes, semantic targets, seeded shuffling, correct placement, round completion, raw playback, tempo, save/load/clear, layout, and audio logs.

## Production gates

- Real Chrome smoke test: all modes, a wrong/correct guided turn, physical drag, tempo, rests, clear, save/load/reload, three-round concert, replay, recorded voice, console/request audit.
- Responsive visual captures: landscape, portrait, short landscape, and concert.
- Asset gate: expected cut counts (6 beads, 5 workshop parts, 6 controls), alpha/magenta inspection, no halos or dropped pieces.
- Runtime gate: no SVG/canvas primary art and no model/API dependency.
- Registration remains Beta until a real child can identify the next action on iPad within five seconds and complete one guided bracelet without adult correction.
