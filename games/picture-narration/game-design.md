# TaleTeller mini-GDD

**Route:** `games/picture-narration/`

**Category:** Oral storytelling

**Audience:** Ages 3-7

**Status:** Beta until a child playtest confirms vocabulary clarity, pacing,
and microphone guidance.

## Promise

TaleTeller turns a watercolor picture book into a story the child authors.
The child discovers four named clues, makes two meaningful illustrated
choices, watches a spoken sentence grow, and retells the completed adventure
in their own voice. There is no wrong branch and no score pressure.

## Play loop

1. Choose Forest, Ocean, or Moon from the open-book library.
2. Explore the full illustrated world and tap four gently pulsing picture
   clues. Each tap reveals the picture word, pronunciation, contextual line,
   and a token in the sentence strip.
3. Pick one of two large picture cards at the first story fork.
4. Pick one of two cards at the second fork. Each choice changes the narrated
   story and the visual sentence strip.
5. Hear and see the finished sentence.
6. Press and hold the microphone to retell it, then replay the recording; if
   recording is unavailable or denied, use the guided speak-aloud ending.
7. Start another tale or return to the story library.

## Story worlds and branches

| World | Hero | Vocabulary clues | First fork | Second fork |
|---|---|---|---|---|
| Forest | Pip the fox | fox, butterfly, stream, flowers | bridge / leaf boat | duck / fireflies |
| Ocean | Willa the whale | whale, coral, turtle, bubbles | dolphins / sea turtle | glowing pearl / ocean song |
| Moon | Nova the moon bunny | bunny, crater, rover, star | moon hop / rover ride | crystal / star friend |

The two forks yield four endings per world and twelve complete story paths.
Every path uses the same learn-discover-choose-retell rhythm so a young child
can build independence across repeat plays.

## Screen model

- **Library:** title, inviting splash painting, home link, sound toggle, and
  three illustrated world doors.
- **Explore:** scene painting, hero, four art-led hotspots, discovery counter,
  contextual word card, and growing picture-word ribbon.
- **Choice:** two large, mutually exclusive illustrated cards above the live
  sentence ribbon; the next choice appears only after the selection response.
- **Finale:** open-book retell composition with the completed sentence,
  selected picture tokens, hold-to-talk control, replay, privacy copy, and
  story-again/library actions.

Back returns to the TaleTeller library and cleans up narration, timers,
microphone streams, and local replay. The platform Home link appears on the
library only.

## Learning design

- Picture, written word, syllable-friendly pronunciation, and spoken context
  reinforce the same vocabulary concept.
- Four discoveries reward close looking without testing speech recognition or
  penalizing pronunciation.
- Two visible choices make cause and effect concrete.
- The sentence ribbon models a beginning, two linked actions, and an ending.
- Retelling shifts from receptive language to expressive language and invites
  elaboration beyond the generated sentence.

## Art and interaction direction

The art world is handmade watercolor storybook: warm ivory paper, visible
pigment, soft ink edges, deep forest greens, luminous ocean blues, midnight
violets, and coral/gold accents. All illustration and controls are raster;
CSS is limited to layout, readable surfaces, focus treatment, and motion.

Targets are at least 48 CSS pixels and the primary picture choices are much
larger. Motion communicates discovery and state, never urgency. Reduced-motion
mode removes pulses, bobs, and sweeping transitions while preserving all
feedback. Layouts cover tablet landscape, tablet portrait, narrow portrait,
and 667x375 landscape without hidden actions or horizontal scrolling.

## Audio, recording, and privacy

Locally generated teacher narration is primary, with Web Speech as a resilient
fallback. Sound Off also stops active narration and a child's replay.
Recording starts only from an explicit press-and-hold gesture. Each recording
session owns its stream, recorder, and chunks so cancelled or delayed
permissions cannot affect a later session. Space/Enter provide an equivalent
keyboard hold interaction.

The recording remains an in-memory browser object URL, is never uploaded or
written to storage, and is revoked when the child leaves the ending or starts
another recording. Permission denial, missing APIs, and device errors all lead
to a warm guided speak-aloud finale with no dead end.

## Runtime and QA contract

This is a dedicated configuration-driven runtime rather than the former
observe-journal stub because branching, a live sentence model, and local
recording are core to the concept. `window.QLOBE_DEBUG` v1 exposes all three
modes, deterministic state, target discovery, audio logs, mute, seeded motion,
story-path helpers, and recording test hooks.

The game-specific smoke suite covers every world and branch family, real
hotspot/choice interaction, narration requests, finale/replay behavior,
denied-microphone fallback, strict fake-MediaRecorder behavior, cleanup,
broken raster detection, overflow, minimum target sizes, reduced motion, and
portrait/narrow-landscape layouts. The same suite runs against localhost and
the deployed production URL.
