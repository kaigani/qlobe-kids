# Local Nature Guide — Game Design

## Product promise

Local Nature Guide is a tablet-first woodland discovery game for ages 4–7. Suri, a warm squirrel field guide, leads three short play trails that exercise a different sense or motor skill. Every success becomes a tangible specimen sticker in a persistent Nature Journal.

The game adapts the concept brief in `01-game-concepts/local-nature-guide` into an entirely on-screen experience. A family can optionally carry the vocabulary outdoors afterward, but outdoor access, reading, a camera, location data, and network services are never required.

## Experience pillars

1. **A field journal come alive.** Watercolor scenes, torn paper carriers, tactile specimens, and Suri all belong to one sunlit storybook world.
2. **Three genuinely different actions.** Children look, listen, and trace rather than replaying one quiz with new pictures.
3. **Observation without punishment.** Wrong choices receive a soft wiggle and another invitation. There are no lives, scores, timers, or dead ends.
4. **A visible collection payoff.** Each discovered raster specimen blooms, flies into the journal, and remains available for fact replay in later sessions.
5. **Audio supports but never carries the task.** Every prompt has an on-screen referent and HTML text. Recorded teacher narration and bird calls enrich the interaction without being required for navigation.

## Core loop

1. Choose one of three illustrated route cards on the trail map.
2. Complete three discoveries in that route.
3. See each discovery transfer into the journal.
4. Arrive at the journal after the third round and replay any unlocked fact.
5. Return to the trail map and choose another route.
6. Collect all nine discoveries to earn the Local Nature Guide badge.

Progress is stored under `qlobe:local-nature-guide:journal:v1`. Corrupt or unavailable storage falls back to an empty in-memory journal without blocking play.

## Modes

### Forest Finds — visual discrimination

Three rounds ask for a pinecone, maple leaf, and smooth river stone. Each round displays six large watercolor cutouts distributed across a calm forest clearing. The target is spoken and shown in the paper prompt; the child taps the matching object. Acorn, fern, and feather provide visually distinct decoys.

Skills:

- attend to shape, edge, texture, and color;
- distinguish related natural objects;
- connect a spoken noun to a visual referent.

### Bird Listening — auditory discrimination

Three rounds present chickadee, robin, and woodpecker. A persistent WebAudio channel synthesizes a distinctive high–low chickadee phrase, melodic robin whistles, or rapid low woodpecker drum. The three authored bird sprites are visible before the call begins. A raster-carried “Listen again” button repeats the call, and the child taps the matching bird.

Skills:

- compare pitch, rhythm, and timbre;
- associate an auditory pattern with a pictured bird;
- intentionally replay a sound for confirmation.

The bird patterns are educational cues, not field-recording claims. They make no runtime network request and obey global mute/unlock behavior.

### Track Finder — tracing and clue matching

Each round begins with a tall authored mud ribbon showing rabbit, deer, or raccoon prints. Animal answers remain disabled until the child starts at the illuminated bottom print and crosses forgiving checkpoints toward the top. Canvas renders only the child’s temporary green stroke; the trail, footprints, start glow, animals, and all visible game art are raster assets. After tracing, the three animal choices become active.

Skills:

- controlled bottom-to-top finger movement;
- following a curved visual path;
- recognizing track shapes and matching them to an animal.

## Journal and facts

The journal is a full-screen authored book plate, not a modal. It displays nine raster sticker carriers. Locked positions are disabled and labelled as undiscovered; found positions show the specimen name and can replay one short fact. After a route, the journal opens with that route’s completion line. At nine finds, Suri presents the guide badge and the all-complete narration plays.

Facts are intentionally concrete and age-appropriate:

- pinecones protect pine seeds;
- maple leaves have pointed lobes;
- moving water smooths river stones;
- chickadees can vocalize a name-like phrase;
- robins use bright whistles;
- woodpeckers drum on wood;
- rabbit hind prints often land ahead of front prints;
- deer leave two-part hoof marks;
- raccoon tracks show five long toes.

## Feedback language

- Correct: watercolor discovery glow, authored specimen lift, sparkle sound, teacher praise, and a large sticker-to-journal flight.
- Incorrect: gentle horizontal wiggle, soft boing, and “Good looking. Try another one.” The choice remains available.
- Trace incomplete: the start glow or path receives a brief nudge and tracing can resume/restart.
- Route complete: the journal becomes the reward surface; no score summary interrupts it.
- All complete: guide badge, celebratory Suri pose, tada, and final teacher line.

## Visual system

- Art world: **Watercolor / Storybook**.
- Palette: warm paper, fern green, moss, sunlit leaf, creek blue, bark brown, and restrained berry/robin accents.
- Lighting: bright late-morning dappled sun from upper left.
- Suri: one orange-red squirrel identity with cream belly and green scarf across six poses.
- Screen rhythm: leafy frame, quiet central discovery field, Suri anchored low to one side, physical paper/journal controls, one dominant child action.
- Child-facing objects and carriers are raster assets. CSS provides layout, responsive geometry, focus states, and motion only; canvas is limited to the child’s trace stroke.
- Hub tile deliberately uses the platform’s separate Toy-table 3D grammar rather than cropping the watercolor splash.

## Responsive behavior

The composition targets 1180×820 landscape, 820×1180 portrait, and 1180×520 wide-short. Portrait preserves the title, prompt, target, Suri, journal access, and ≥96 px primary targets without shrinking the full landscape stage. Wide-short reduces header height and uses the horizontal field. Safe-area insets protect corner HUD controls and bottom actions.

`prefers-reduced-motion: reduce` collapses all decorative animation and collection travel to near-instant state changes while preserving every reward and final state.

## Audio and accessibility

- Qwen3 teacher-voice recordings are initialized through `shared/js/voice-clips.js`; Web Speech uses the same `lines.json` text if a clip is unavailable.
- The first pointer gesture unlocks shared SFX, voice, speech, and the bird-call AudioContext.
- Home/back and replay use shared QLOBE HUD controls.
- Every interactive image has an accessible name, locked journal slots are disabled, focus rings are high contrast, and controls remain operable through keyboard activation.
- All gameplay remains understandable while muted.

## Technical integration

- Runtime: `js/main.js`, custom DOM plus trace canvas.
- Canonical authored data: `config.js`; `config.json` is the compact Studio summary checked by QA.
- Shared modules: audio unlock, debug harness, HUD, preload, RNG, SFX, tap, timers, and voice clips.
- QA hook: `window.QLOBE_DEBUG` v1 with mode start, state, target collection, deterministic seed, fast timers, mute, debug round completion, journal open, and progress clear.
- Runtime is static and makes no model, analytics-specific, location, camera, microphone, or LAN API request.

## Release acceptance

- All three modes complete through real controls and through the debug contract.
- Track animal answers cannot be chosen before tracing.
- Nine discoveries persist across reload and every unlocked fact can replay.
- No child-facing emoji, SVG illustration, CSS illustration, or missing raster asset remains.
- All cutouts pass alpha QA and are inspected on a contrasting composite.
- Splash, all modes, journal, portrait, wide-short, and reduced-motion states receive full-resolution visual review.
- The hub route opens the game, production serves all assets successfully, and the production QA driver reports no game page errors, failed local requests, or unexpected remote runtime calls.
