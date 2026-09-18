# Question Ball — production game design

Status: production implementation, beta until a real iPad child playtest

## Product promise

Question Ball turns talking together into a tiny felt-puppet game. A child picks a familiar topic, physically tosses a soft rainbow ball, hears one open-ended **Who / What / Why / How** question, and answers aloud. There is no wrong answer and no speech scoring. The game celebrates the act of sharing.

Audience: ages 3–6, with a parent/sibling co-player welcome. The child should know what to do within five seconds from motion, pictures, and spoken guidance.

Canonical art direction: **Puppet / Cozy felt fabric**. The whole play field uses wool felt, fleece, blanket stitching, embroidered details, soft stuffing, and warm puppet-theater light. The platform cast is Maya and Leo, restyled as sewn felt hand puppets while preserving their canonical designs.

## Learning modes

The four topic packs are the game modes. Each practices expressive language, vocabulary, explanation, and conversational turn-taking through one emotional context.

| Mode | Skill | Prompt mix |
| --- | --- | --- |
| `routines` | describe familiar sequences and people | Who / What / Why / How |
| `animals` | describe, explain, and imagine with animal vocabulary | Who / What / Why / How |
| `imagine` | flexible thinking and invented explanations | Who / What / Why / How |
| `feelings` | name feelings and describe supportive actions | Who / What / Why / How |

Every pack has six prompts. Seeded selection avoids immediate repeats and makes QA deterministic.

## Screen map and loop

```text
splash → topic quilt → toss → question/share → sharing star
   ↑         ↑         │          │              │
   └── back ─┴── back ─┴── back ──┴── next ──────┘
```

1. **Splash.** Maya and Leo peek into a cozy felt playroom around the rainbow Question Ball. The ball and a large stitched play plaque both start the game. Home is available only here. The first gesture unlocks voice, effects, and quiet recorded music.
2. **Topic quilt.** Four oversized padded cards show a sun/bedtime scene, puppy, rocket/cloud, and heart/rainbow. Tapping a card speaks its name and begins that pack. Text is supportive HTML, not required for play.
3. **Toss.** Maya and Leo face the child across the orange rug. The ball visibly pulses and a stitched hand cue demonstrates the gesture. The child can tap or drag/swipe. A release uses bounded velocity, a large readable arc, one squashy landing, and then reveal. Reduced-motion uses an immediate lift-and-reveal.
4. **Question/share.** The ball opens into a speech-bubble reveal; the question word is visually dominant and the full prompt is narrated. The child may hold the microphone patch to make a short local recording, tap the replay ear after recording, or tap the two-friends co-play button to say it to someone nearby. Microphone permission is requested only after the child presses and holds.
5. **Sharing Star.** Maya and Leo celebrate around a smiling felt star. One star is added to the local counter. “Next question” returns to toss in the same pack; the topic button returns to the quilt. A session feels complete after three stars but never locks the child out.

Target loop: 35–70 seconds per question. There is no failure state, timer pressure, or answer judgment.

## Interaction rules

- All primary targets are at least 96 px and use Pointer Events through one action path.
- Ball drag has one active pointer, pointer capture, pointer-to-object offset, velocity sampling, viewport clamping, `pointercancel` cleanup, and blur cancellation.
- A tap is a valid toss. A small/slow swipe is amplified so the action always reads at tablet size.
- The microphone is hold-to-talk. Release, pointer cancel, navigation, a 15-second ceiling, or visibility loss stops safely. Recordings live only in memory for the current question and are never uploaded or persisted.
- If recording is unsupported, denied, or times out, the UI warmly switches to co-play. Sharing can always complete without a microphone.
- Spoken prompts are recorded teacher clips first, Web Speech fallback second. Background music ducks under every spoken line.
- Idle nudges model the next action after six seconds and repeat gently; they never count down.
- Reduced motion removes ballistic travel, pulsing, confetti, and large character bounces while preserving all state changes.

## Complete prompt content

### Daily routines

1. What do you like to do when you wake up?
2. Who helps you get ready for the day?
3. Why do we wash our hands before eating?
4. How do you get cozy for bedtime?
5. What snack would you make for someone you love?
6. Who would you invite to help with a little cleanup?

### Animals

1. What animal would make a funny friend?
2. Who takes care of animals when they need help?
3. Why do you think birds build nests?
4. How would a penguin dance at a party?
5. What sound would a tiny lion make?
6. Who would you explore the jungle with?

### Imagine

1. What would you put in a magic backpack?
2. Who lives inside a rainbow castle?
3. Why would a cloud need a pair of shoes?
4. How would you travel all the way to the moon?
5. What would your friendly robot cook for dinner?
6. Who would you invite to a dragon picnic?

### Feelings

1. What makes you smile?
2. Who helps you feel safe?
3. Why might someone need a hug?
4. How can you help a friend who feels sad?
5. What can you do when you feel frustrated?
6. Who do you like to celebrate with?

## Fixed spoken script

The runtime keys and exact text live in `assets/audio/lines.json`. Required fixed lines are:

- `welcome`: “Ready to play and share? Tap the Question Ball!”
- `choose-topic`: “Pick a picture. What should we talk about?”
- `topic-routines`: “Daily routines!”
- `topic-animals`: “Amazing animals!”
- `topic-imagine`: “Let’s imagine!”
- `topic-feelings`: “Feelings and friends!”
- `toss`: “Toss the Question Ball!”
- `toss-nudge`: “Give the soft ball a tap or a swipe.”
- `share`: “Your turn to share. Hold the microphone while you talk, or tell someone beside you.”
- `recording`: “I’m listening.”
- `recorded`: “I heard your idea! Tap the ear to hear it, or share it now.”
- `mic-fallback`: “That’s okay. Tell someone beside you, then tap the two friends.”
- `great-sharing-1`: “Great sharing!”
- `great-sharing-2`: “What a wonderful idea!”
- `great-sharing-3`: “You made that question sparkle!”
- `next-question`: “Ready for another question?”
- `session-cheer`: “Three sharing stars! You are a wonderful conversation friend.”

Each of the 24 prompts has a `prompt-<pack>-<number>` voice key and identical fallback text.

## Art inventory

Visible art is raster; CSS/DOM supplies layout, hit areas, text, focus, and motion only.

| Asset | Runtime use | Intended source / processing |
| --- | --- | --- |
| `playroom.webp` | full-bleed 4:3 world plate | GPT image master, 1600×1200 shipping WebP |
| `title.webp` | decorative splash lockup, exact “QUESTION BALL” | GPT image master → layer extraction |
| `ball-idle.webp`, `ball-open.webp` | toss/reveal states | GPT image contact sheet → cutter → Qwen Layered → finalize |
| `star.webp`, `microphone.webp`, `gesture-toss.webp`, `question-bubble.webp` | reward and interaction props | same coordinated prop sheet |
| four `topic-*.webp` icons | topic quilt | same coordinated prop sheet |
| `maya-listen.webp`, `maya-celebrate.webp`, `leo-catch.webp`, `leo-celebrate.webp` | conversational cast | GPT image edit from canonical portraits → cutter → Qwen Layered |
| `plaque-navy.webp`, `button-green.webp`, `prompt-panel.webp`, four `card-*.webp` | felt UI furniture | GPT image sheet → cutter → Qwen Layered |
| hub tile | catalog surface | Krea 2 menu-game-tile grammar, no title/UI baked in |

All sources, prompts, cuts, alpha QA, and model recipes remain under `assets/source/`. The shared cutter must be run with an exact expected count. Every alpha is inspected over saturated magenta and every final is downscaled/optimized.

## Audio and privacy

- Narration uses the approved local teacher voice reference with Qwen voice clone, seed ladder 7 → 8 → 9.
- Every final clip is AAC/M4A with `+faststart` and a Whisper transcript receipt. Incorrect lines are retried or omitted so Web Speech supplies the correct text.
- The optional answer recording uses browser `MediaRecorder`, is memory-only, and is destroyed when the question changes, the child navigates, the tab hides, or the page unloads.
- No child audio, text, or analytics is sent to a model or server.

## Persistence

Only `{ stars, completedByPack, lastPack }` is stored in `localStorage` under `qlobe-question-ball-v1`, sanitized on read with an in-memory fallback. No recordings are stored.

## Debug and QA contract

`window.QLOBE_DEBUG` format version 1 exposes the platform floor plus:

- `listModes`, `startMode`, `getState`, `getTargets`, `tap`, `winRound`, `mute`, `seed`, `fastTimers`, `home`
- `toss(vx, vy)`, `reveal()`, `startShare()`, `finishShare({ recorded })`, `nextQuestion()`
- `getAudioLog`, `clearAudioLog`, `clearSaved`, and `getLayout`

QA must cover every pack, tap and swipe tosses, microphone success and denial, recording cleanup, co-play completion, prompt non-repetition, persistence/reload, splash/play/reward navigation, real recorded narration, music ducking, zero errors/404s, 1024×768 landscape, 768×1024 portrait, narrow landscape, and reduced motion. Screenshots are required for splash, topic quilt, mid-toss, question/share, recording, reward, and both orientations.

## Deliberate departures

- The stub’s picture-answer quiz is removed. The concept’s learning promise is expressive conversation, not finding one correct picture.
- The brief’s “listener” is implemented as optional local recording/replay, not speech recognition or scoring. This preserves privacy, offline play, and the truth that open-ended answers have no single correct transcript.
- The mockup’s one-off green/purple puppets become canonical Maya and Leo in the same felt-puppet world.
- Topic tabs become four large picture cards before play; small top tabs would be hard for ages 3–6 and would compete with the toss gesture.
- Ball motion is a bounded, authored DOM interaction rather than a heavyweight physics engine. It retains the promised tactile toss while remaining reliable across orientation changes and reduced motion.

## Release gate

Keep status `beta` after automated and production QA. Promote to `live` only after the target child completes a full three-star session on the real iPad without adult explanation and microphone denial is observed to remain joyful.
