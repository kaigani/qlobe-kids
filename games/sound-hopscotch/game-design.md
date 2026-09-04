# Sound Hopscotch

## Product brief

Sound Hopscotch is a Kawaii 3D meadow game for ages 5–6. A fluffy white bunny invites the child to listen, choose a letter stone, and hop along a rainbow path. It is beta software pending child playtesting. The game uses raster artwork for the world, bunny, stones, title, and rewards; live HTML letters remain crisp, readable, and accessible.

## Modes and content

- **Meadow Hop (`meadow`)**: six progressive rounds. The path grows from two to four choices using A, M, S, T, P, and B. Each round plays the exact shared phonics recording for its target letter.
- **Sound Match (`match`)**: five rounds with gentle contrasts including B/D, D/G/T, M/N, and F/V. There is no timer, speed requirement, game over, or punishment for exploring.
- **Make a Path (`maker`)**: tap up to five A/M/S/T/P stones, drag them around the meadow using `freeform-board.js`, then press the bunny play control. The bunny visits the normalized left-to-right path and plays each letter sound. The path is saved locally and can be cleared.

## State and flow

The splash screen presents the three modes and a theme button. Starting a mode unlocks audio on the first gesture, loads the meadow, and begins its introduction. Play state tracks `screen`, `mode`, `round`, `roundsTotal`, `awaitingInput`, `hopping`, `targetLetter`, `theme`, and `customCount`. A correct tap animates the bunny through ready → hop → land, plays a sparkle, and advances after praise. An incorrect tap wiggles the stone, replays the clue, and offers a spoken nudge. Completion shows the bunny celebrating with a star/flower reward and Again/Choose actions. Home is only the splash; deeper screens expose Back and sound controls.

## Interaction and accessibility

Letter stones are large touch targets (minimum 96 CSS pixels), with generous spacing and no precision timing. Every live letter has a spoken sound equivalent and a visible high-contrast label. Color themes (Sunny, Berry, Ocean) never carry meaning alone. The sound/replay control is always available inside each activity. Focus-visible states, keyboard activation, reduced-motion fallbacks, `aria-label`s, and portrait/landscape responsive layouts are supported. Motion is celebratory but optional; reduced motion removes travel and sparkle delays while preserving the spoken cue/praise pacing.

## Audio

Shared recorded phonics clips are loaded through `content.letterSoundUrl`; these are preferred over browser speech for the target sound. All 16 teacher-narration lines ship as approved Qwen3 voice-clone clips after exact-transcript Whisper acceptance, with a safe local fallback if a file cannot play. The shared `upbeat-playground-pop.mp3` is low-volume background music. Audio unlocks after a user gesture, narration ducks music, and mute state is retained for the session. Audio events are logged for debug and QA.

## Persistence and debug

The maker path is stored as normalized coordinates under `qk-sound-hopscotch-path-v1`, allowing it to survive a refresh without storing audio or personal data. `window.QLOBE_DEBUG` exposes `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`, `winRound`, `mute`, `seed`, `fastTimers`, `home`, `getAudioLog`, and `clearAudioLog`. The same action map drives real taps and automation, so smoke tests exercise production behavior.

## Visual direction and asset pipeline

The art world is a bright turquoise-sky and lime-meadow playground with peripheral trees, flowers, clouds, fence, and a curved rainbow trail. Materials are soft vinyl/playdough with puffy warm-cream sticker edging, coral, sunshine, lime, sky-blue, and violet accents, and a friendly cocoa outline. Raster bunny-paw landing markers turn the meadow into a readable route; Maker adds a START/FINISH runway and numbered flower badges, while a dedicated paint-palette sprite distinguishes theme changes from answer stones. Generated source sheets are retained under `assets/source/gpt-image-2/`; the asset cutter creates named crops and debug masks, followed by deterministic alpha cleanup and WebP finalization. Qwen Image Layered was evaluated as a foreground-separation aid; final selection remains with the cleanest cutter/alpha result after edge review, since generated layer separation can drift from the approved sprite silhouette. No vector or CSS artwork is used.

## QA plan

Run syntax checks for all game scripts, JSON parsing, the repository validator, and `tools/qa.mjs` against a local static server. Exercise every debug mode, correct and incorrect answers, replay/mute, maker add/drag/clear/save/play, reduced motion, and both orientations. Capture splash, play, feedback, and maker screens at production viewport sizes for visual QC: check alpha halos, legibility, target size, contrast, layering, crop boundaries, and responsive composition. Complete an adversarial art-direction pass before shipping, then repeat the smoke suite against the deployed production URL.

## Credits and licensing

Code is MIT; original game assets are CC-BY-4.0. Credits include GPT Image 2, approved local QLOBE API generation/editing resources, QLOBE asset-sheet processing tools, shared QLOBE Kids phonics recordings, and the QLOBE Kids platform team.
