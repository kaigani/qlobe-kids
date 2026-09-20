# Song Story Remix — Game Design

## Promise

A child changes one picture in a tiny song story, chooses who leads the band, then watches or stars in a joyful Kawaii concert. Every choice produces a valid, singable result. There are no wrong answers, scores, ads, accounts, or upload steps.

## Audience and session

- Ages 3–7, designed for independent tablet play and shared parent-child singing.
- One complete remix takes about 45–90 seconds.
- Reading is supported by pictures, recorded teacher prompts, repeated four-line structure, and one highlighted story word.

## Core loop

1. Choose **Rainy Day**, **Space Trip**, or **Jungle Walk** from three illustrated songbooks.
2. Swap among three picture-led story subjects and hear an immediate musical accent.
3. Choose Leo, Bird, Frog, or Tiger as bandleader.
4. Rehearse the four-line remix against synchronized lyric and picture cues.
5. Make either a **Camera show** or an equally complete **Stage-only show**.
6. Replay the concert, make another, or open **My remixes**.

## State model

```text
song shelf → remix book → rehearsal ───────────┐
                       └→ recording choice     │
                          ├→ camera + mic       │
                          └→ stage only         │
                                  ↓             │
                              final concert ←───┘
                                  ↓
                           local remix shelf
```

Leaving a performance stops synthesis, animation frames, media tracks, timers, and replay object URLs. Visibility loss also ends the active performance safely.

## Content

Each song has a distinct 16-second Web Audio arrangement and three four-line lyric variants:

- **Rainy Day:** Raindrop, Duck, Umbrella
- **Space Trip:** Star, Frog, Bird
- **Jungle Walk:** Tiger, Monkey, Parrot

The selected picture is the semantic source of truth for lyric text, highlighted word, live cue art, saved-show metadata, and library replay. The singer choice changes the visual lead without making any option “better.”

## Interaction and feedback

- All primary controls are raster-art props with live accessible labels and at least a 96×96 px interaction box.
- A story swap pops the book, highlights the chosen token, updates all four lines, and plays a two-note accent.
- The concert advances one lyric cue every quarter of the song, animates alternating band members, and shows a continuous progress rail.
- Completion saves automatically, then uses brief confetti, a warm teacher line, and an animated curtain-stage tableau.
- An idle remix prompt gently points back to an unselected picture without penalizing inactivity.

## Recording and privacy

Recording is an optional creative toy, not a gate:

- The permission sheet explains that camera and microphone are optional and remain on the device.
- Permission is requested only after the child chooses **Camera show**.
- The recorder requests front camera plus mono speech-optimized audio, displays a mirrored preview and voice meter, and stops after the bounded show duration.
- Denial, timeout, missing APIs, and recorder failure all fall back to the complete Stage-only show.
- Media and semantic remix data are stored locally in IndexedDB, capped at eight shows. A session-memory fallback preserves play if storage is unavailable.
- The game has no export, network upload, transcription, or account path.

## Visual direction

The world follows the concept brief's plush Kawaii theater: deep plum velvet, warm cream paper, golden bulbs, coral accents, teal stage light, rounded toy-like forms, and visibly hand-painted raster edges. Full-bleed authored plates carry the world; CSS is reserved for layout, type, focus, progress, and functional overlays rather than artwork. The experience adapts to landscape, portrait, and short-landscape screens without changing the core scene hierarchy.

## Audio direction

- Fourteen concise, cloned-teacher prompts provide a consistent warm voice and were verified by Whisper.
- Each song uses a different timbral profile (rain, space, jungle) while keeping the same predictable four-line duration.
- Mute applies to narration, synthesized melody, feedback, and recorded replay while preserving visual and screen-reader cues.

## Accessibility

- Semantic buttons and meaningful `aria-label` text for every action.
- Visible keyboard focus, minimum touch targets, live lyric/status announcements, and text labels alongside pictorial controls.
- Reduced motion collapses decorative animation durations while preserving state changes.
- Camera and microphone are never required.

## Debug and acceptance contract

`window.QLOBE_DEBUG` exposes the three song modes, semantic state, tap targets, choice/singer selection, deterministic fake/denied media modes, local shelf inspection/clear, recorded-voice log, and safe show completion.

Release acceptance requires:

- all three songs and all nine swaps update the correct lyrics;
- all four singers can lead every song;
- rehearsal, Stage-only, fake-camera, and denied-camera paths terminate and save safely;
- replay/library/delete survive navigation and local persistence;
- no missing assets, page errors, failed same-origin requests, or runtime model calls;
- clean layouts at 1280×800, 768×1024, and 844×390, including reduced motion;
- current hub entry, share metadata, 1200×630 OG art, and production URL smoke test.
