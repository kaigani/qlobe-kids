# Turn-Taking Tower — production game design

## Product promise

Turn-Taking Tower is a tiny cooperative ritual for ages 2–5. A child and Pip—or two children sharing one tablet—place one tactile wooden block at a time, visibly pass the turn token, wait without penalty, and celebrate a tower neither builder made alone.

- **Audience:** toddlers and preschoolers, tablet-first, playable without reading.
- **Primary skill:** notice, wait for, take, and hand off a turn.
- **Supporting skills:** color/shape recognition, drag control, shared attention, and cooperative pride.
- **Session shape:** one ten-block tower, about 45–90 seconds.
- **Canonical art direction:** **Toy**—warm wood grain, simple shapes, soft studio light, friendly faces, and a calm playroom.
- **Status:** `beta` until a target-age child completes both modes on a real tablet.

## Production decisions

1. **Replace the engine stub with the promised game.** The old `build-assemble` configuration simulated a partner through narration. The production route is a custom direct-manipulation game with an on-screen partner, explicit turn token, input lock, automatic buddy action, and shared final tower.
2. **Honor the concept mockups.** The mockups' playroom, wooden plaques, blue/yellow friends, colorful block set, centered tower, and two-sided celebration are the visual north star. The written brief's broader “park and city” phrase yields to the supplied screen designs and its canonical Toy art-world declaration.
3. **Offer a real social choice.** Buddy Build models waiting with Pip. Two Builders removes automation and becomes genuine pass-and-play with the same alternating sequence.
4. **Keep failure gentle.** A future block wiggles and the glowing target answers; nothing falls, resets, scores, or scolds. Early input during Pip's turn plays a patient waiting cue and cannot advance state.
5. **Use raster art for the world.** CSS supplies layout, hit areas, focus, tint variations, and movement only. Every child-facing character, block, plaque, card, button, room, token, and base is raster artwork.

## Screen and state map

```text
catalog
  → setup
      choose friend colors
      choose Buddy Build or Two Builders
      start → ten alternating placements
          child/human turn → tap or drag the glowing block
          Pip turn → input locked, token crosses, Pip places one block
          halfway → shared-progress encouragement
          roof → cooperative celebration
              play again → same mode, fresh deterministic rack order
              choose → setup
              back → setup
```

## Modes

### Buddy Build

- Player 1 owns placements 1, 3, 5, 7, and 9.
- Pip owns placements 2, 4, 6, 8, and the roof.
- During Pip's turn the rack hides, the green turn state appears, the token crosses, input locks, and Pip visibly flies the correct piece to the tower.
- Pip's post-placement line explicitly hands control back.

### Two Builders

- The same fixed alternating ownership keeps the learning rhythm legible.
- Every placement waits for a person; the game never auto-plays Player 2.
- The voice, stable PLAYER 1/PLAYER 2 labels, active glow, and star token prompt a physical pass of the tablet or block-selection role even when the children customize their toy colors.

## Core interaction loop

1. A mode press starts the quiet music bed and speaks one concise explanation.
2. The top plaque names the current builder, the corresponding friend glows/bobs, and the star token sits beside that builder.
3. Three large blocks appear in the rack. Only the needed piece glows, but every option remains a forgiving 96 px target.
4. The child can tap the correct block or drag it into a generous dashed slot. Both paths use the same placement handler.
5. A correct block settles with wood-pop feedback. A future block gives a soft wiggle and spoken clue without consuming the turn.
6. Ownership alternates exactly. Buddy Build performs Pip's turn; Two Builders waits for the second player.
7. The fifth placement names shared halfway progress. The last roof opens the celebration with both friends, confetti, a complete tower, replay, and mode choice.

## Interaction and safety rules

- Pointer Events drive drag; tap remains a first-class motor-accessible alternative.
- Drop slots are visibly at least 96 px and use an additional 72 px tolerance.
- `pointercancel`, window blur, navigation, screen changes, and page teardown cancel active drag safely.
- State locks before any asynchronous praise or AI animation, so double taps cannot place twice.
- A monotonic round epoch prevents an old intro, praise, or Pip animation from reviving state after Back, Choose, replay, or another mode starts.
- Timer groups are cancellable and QA-scalable; exiting play cancels pending buddy actions and idle help.
- The matching rack item, turn token, all mode/navigation buttons, and every live child control are at least 96 px.
- `prefers-reduced-motion` suppresses loops and travel flourishes while preserving state changes and usability.
- No ad, score, countdown, purchase, punishment, or runtime model request exists.

## Spoken design

Recorded voice carries every instruction that matters: choose a mode, whose turn, where to place, wait gently, try the glowing shape, halfway, roof, and shared success. On-screen text reinforces rather than gates play. The game includes eighteen Qwen3 teacher-voice clips, each Whisper-reviewed; device speech is the fallback only.

The high-frequency handoff is deliberately short:

- “Your turn! Place one block.”
- “Pip's turn. Watch Pip build.”
- “Wait gently. Your turn is coming.”
- “Pip added a block. Now it's your turn!”
- “We built it together! Great taking turns!”

## Art and renderer inventory

| Child-facing object | Visible renderer / role |
|---|---|
| Warm playroom | Full-bleed GPT Image 2 raster scene, softly continued behind the 4:3 safe stage on wide screens and cover-cropped in portrait. |
| Blue and yellow friends | Identity-matched transparent raster idle/cheer poses; selectable hue variants preserve silhouette. |
| Ten tower pieces | Transparent wooden raster blocks; fixed normalized positions create one authored tower. |
| Star token and base | Transparent raster turn marker and grounding platform. |
| Sign, player cards, mode/replay plates | Blank transparent raster UI with live accessible text layered above. |
| Selection/progress/drop cues | DOM hit areas and simple CSS highlight/focus treatments; not primary artwork. |
| Confetti | Shared lightweight celebration helper, decorative and reduced-motion safe. |
| Hub tile | Separate local Krea 2 menu composition, not a crop of gameplay. |

## Responsive behavior

- Landscape contains the authored 4:3 interaction stage while a softly blurred continuation of the same raster playroom fills wide rails; the world remains full-bleed without moving authored gameplay coordinates.
- Portrait expands the playroom to the full viewport and cover-crops scenery only. Foreground characters, target, rack, plaques, and controls remain coordinate-driven and fully visible.
- Short landscape contains the stage, preserves the 96 px controls, and keeps the rack above the bottom sound control.
- Safe platform HUD controls remain outside the authored interaction cluster.

## Debug and verification surface

`window.QLOBE_DEBUG` v1 exposes `ready`, both modes, deterministic seed/timers/mute, state, visible targets, real target taps, single-step `winRound`, full-tower setup, deliberate attempts, home, recorded-audio logs, and audio state. State snapshots include the screen, phase, owner, placement count, current piece, placed ownership, input lock, seed, color choices, and reduced-motion state.

The game-local real-Chrome suite verifies:

- direct and hub routes, complete image decode, and no non-analytics runtime requests;
- setup/play/end touch targets, the drop slot, real mouse drag, gentle wrong choice, and locked early input;
- one automatic Pip turn, strict ownership alternation, both human turns, halfway, and all ten final pieces;
- navigation during intro/settle cannot revive a stale round;
- recorded AAC playback rather than Web Speech;
- landscape, portrait, short landscape, and reduced-motion visual captures;
- clean console, request, and page-error state.

Run it with:

```sh
node games/turn-taking-tower/tools/qa.mjs --base http://127.0.0.1:8765
```
