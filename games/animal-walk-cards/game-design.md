# Animal Motion Cards — game design

## Product promise

Animal Motion Cards turns a tablet into a warm movement coach, then gets out of
the way. A child picks a tactile animal card, sees the action in three clear
picture poses, follows three short spoken movement beats, and earns a paw stamp.
After three cards, those remembered movements become a three-animal parade.

The game replaces the former `coach-timer`/emoji prototype at the existing
`games/animal-walk-cards/` route. It adapts the `animal-motion-cards` concept
brief and mockups while building the promised card collection and reward loop.

- **Audience:** ages 5–6, also approachable from 3–7 with an adult nearby
- **Category:** movement-outdoor
- **Art world:** Toy
- **Session:** one card is about 35–60 seconds; a three-card parade is about
  90 seconds
- **Primary skill:** gross-motor imitation and coordination
- **Secondary skill:** remember and sequence three distinct body movements
- **Status:** beta until a real-child iPad playtest passes

## Design principles

1. **Understandable in five seconds.** Six large animal faces are the opening
   choice. Voice says “Choose an animal card.”
2. **Hear it, see it, do it.** Every motion has recorded coaching, three pose
   cards, and a large self-confirm action.
3. **The body sets the pace.** Automatic beats are encouraging, not a score or
   deadline. “I Moved!” may advance immediately, and pause is always available.
4. **No camera and no judgment.** The game never records, scores, or claims to
   detect the child. Completion is self-reported.
5. **Rewards remember effort.** Paw stamps persist locally, but all six cards
   remain playable. No child is locked out of an animal.
6. **Reading is supplementary.** Visible labels support adults and emerging
   readers; artwork and voice carry the child path.

## Modes

### Motion Cards (`cards`)

The deck contains six choices:

| Animal | Movement | Three modeled beats | Motor focus |
| --- | --- | --- | --- |
| Frog | Frog Hop | squat → ready → hop | lower-body power |
| Bear | Bear Crawl | ready → left lead → right lead | core and cross-body coordination |
| Crab | Crab Walk | low → lift → side-step | upper-body strength and balance |
| Bunny | Bunny Bounce | crouch → ready → soft bounce | controlled jumping |
| Penguin | Penguin Waddle | ready → left → right | lateral weight shift |
| Flamingo | Flamingo Balance | tall → lift → hold | single-leg balance |

Flow:

```text
deck → instruction reveal → three active beats → paw-stamp reward → deck/next
```

The active screen advances on a gentle timer or a large “I Moved!” button.
Nothing bad happens if the child pauses, moves slowly, or taps early.

### Animal Parade (`parade`)

The parade affordance becomes active after three distinct paw stamps. It picks
three completed animals with the seeded RNG; if automation starts the mode
before progression exists, it uses a safe frog/bear/crab default. Each animal
gets one coached movement beat, followed by the next parade friend and a giant
paw-medal finale. Replay reshuffles deterministically after `QLOBE_DEBUG.seed`.

## Screens and state

```text
deck
├─ instruction(animal)
│  └─ active(animal, rep 1..3)
│     └─ reward(animal)
└─ parade(lineup)
   └─ active(lineup[index], parade)
      └─ finale
```

Runtime state is intentionally small and serializable:

```js
{
  screen, mode, animal, phase, rep,
  completed: string[], paradeAvailable,
  paradeQueue: string[], paradeIndex,
  awaitingInput, paused, muted, seed
}
```

Only the completed animal ids persist in `localStorage`. Read/write is wrapped
in `try/catch`; blocked or full storage changes no in-session behavior.

## Interaction and safety

- Every gameplay target is at least 96 px, with `onTap` providing one pointer,
  keyboard, and assistive path.
- Home appears only on the deck and returns to the catalog. Back from every
  other screen returns to the deck and cancels current timers/voice.
- The instruction voice includes a safe-space reminder before movement begins.
- Jumps happen away from the tablet. There is no countdown pressure, camera
  prompt, microphone request, or requirement to hold the device while moving.
- Pause freezes the active beat; resume restarts the current visual/voice cue.
- Reduced-motion keeps all state changes and sound while removing decorative
  bounce, pulse, and confetti motion.

## Audio

`assets/audio/lines.json` is the verbatim script. Qwen3 teacher-voice clips are
the primary channel; `voice-clips.js` supplies Web Speech fallback for every
line. The first real gesture unlocks recorded voice and WebAudio SFX together.
Navigation stops stale speech, and mute silences clips, speech, and SFX.

The cue stack is deliberately sparse:

- warm line on deck entry;
- one animal-specific modeled instruction;
- “Find a safe space. Ready?” before the first beat;
- short “Move one/two/three” cues during action;
- one paw-stamp reward line;
- two transition lines plus a finale for parade mode.

## Visual system

The concept’s bright 4:3 card hierarchy is preserved, but every child-facing
visual is authored raster art:

- responsive landscape and portrait felt-meadow backgrounds;
- a spell-checked plush-vinyl title lockup;
- six coordinated rounded animal cards;
- eighteen animal instruction pose panels and eighteen full-body child
  demonstrator poses; the active beat favors the child silhouette so Bear
  Crawl and Crab Walk are readable in under five seconds;
- tactile blank button plaque with live HTML labels;
- paw medal and parade banner;
- a separate Krea 2 toy-diorama hub tile.

CSS only performs layout, clipping, shadows, safe-area placement, and motion of
those raster assets. It does not draw animals, icons, cards, or decorative art.

## Accessibility

- Semantic buttons and useful `aria-label` values mirror every visual target.
- Decorative images have empty alt text; the title, active pose, reward, and
  progress states have descriptive alternatives.
- Live regions announce the current movement and reward without duplicating
  the recorded line.
- Color is never the sole indicator of completion: stamped cards include the
  paw graphic and an accessible completed label.
- Layout supports tablet landscape, tablet portrait, and short/wide windows.

## Debug and QA contract

`window.QLOBE_DEBUG` format version 1 exposes:

- `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`,
  `winRound`, `mute`, `seed`, `fastTimers`, and `home`;
- `resetProgress` for deterministic persistence tests;
- `getAudioLog` to prove recorded clips played rather than only fallback speech.

The local browser suite covers deck, instruction, active, reward, unlocked
parade, finale, persistence reload, portrait, reduced motion, target sizes,
audio evidence, missing requests, and console/page errors. Production receives
the same suite after GitHub Pages deploys.

## Deliberate non-features

- No camera-based movement scoring or device-motion scoring.
- No points economy, avatar shop, streak, countdown loss, or locked animal.
- No generated network call at runtime.
- No video dependency: the three-pose animation remains fast, legible, offline,
  reduced-motion-safe, and smaller than a single generated clip.
