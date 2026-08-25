# Tiny Sentence Workshop

## Intent and status

Tiny Sentence Workshop is an audio-first reading game for children beginning to connect short-vowel decoding with sentence meaning. The player handles each sentence as a physical clay object: read its stamps, rebuild its order, or use it to inspect a tiny scene. A session is three short rounds and is designed to last about one minute.

The game remains `beta` until it has passed a child playtest on the target iPad. Its runtime is static and private: it records, stores, and uploads nothing.

## Player promise

“I can make a tiny sentence work.” Every correct sentence wakes a miniature clay tableau and adds a completed strip to the workshop shelf. Progress is expressed through authored objects and spoken acknowledgement, never points, lives, timers, or failure screens.

## Screen map

```text
QLOBE hub
  → silent workshop splash
    → choose one of three large activity stations (first gesture unlocks audio)
      → three sentence rounds at the workbench
        → sentence read aloud + scene wake-up after each round
          → three-strip reward shelf
            → Make more / Workshop
```

Only the splash links back to the platform hub. Every deeper Back control returns to the in-game workshop so a child is not unexpectedly ejected.

## Learning modes

| Mode | One learning responsibility | Child action | Correct payoff |
| --- | --- | --- | --- |
| Tap & Read | Left-to-right print tracking and whole-word decoding | Tap the next clay word stamp in order; an earlier stamp may be replayed | The completed strip is read naturally and its scene wakes up |
| Build the Strip | Sentence word order | Tap or drag shuffled word stamps into the next socket | Each accepted stamp speaks and presses into its socket; the finished sentence wakes its scene |
| Scene Detective | Literal sentence comprehension | Read or replay the strip, then choose among three near-miss scenes | The matching tableau grows and receives a clay star while distractors retire; the sentence is read again |

All modes use the same three-round reward arc. A wrong action wobbles gently and preserves all progress. The second miss adds a short spoken cue; there is no red X or punitive reset. At roughly 10 seconds idle, the current instruction is repeated; later nudges animate the relevant authored clay object without solving the round.

## Controlled corpus

The 12 launch sentences are defined in `config.json`; no sentence is generated at runtime.

- Action pairs: `A cat can nap/hop.`, `A dog can nap/dig.`, `A pig can jog/sit.`, and `A hen can sit/run.`
- Spatial pairs: `A fox is in a box.`, `A fox is on a log.`, `A bug is on a rug.`, and `A bug is in a mug.`
- Heart words: `a`, `is`.
- Decodable function words: `in`, `on`.
- Remaining vocabulary uses controlled short vowels. `fox` and `box` use `x` for /k/ /s/ and are explicitly represented as four phonemes.

Each Scene Detective choice set changes a meaningful actor, action, or spatial relation. Color is never the only clue. Sentence text is live HTML over raster clay stamps so it remains crisp, selectable by assistive technology, and free from generated-lettering errors.

## Audio and interaction contract

- Nothing speaks on page load. A real mode-card gesture unlocks audio and starts the shared recorded toy-workshop music.
- `assets/audio/lines.json` is the exact source of truth for 46 teacher lines: activity instructions, gentle cues, all 12 complete sentences, and all 21 unique words.
- Runtime prefers locally shipped Qwen voice-clone clips and falls back to the same written line through platform speech only if a clip cannot decode.
- Tapping any word in Scene Detective replays that word. Tap & Read permits replay of already-read words without changing progress.
- Build the Strip supports pointer drag and tap placement through the same semantic attempt function. Cancellation always returns a stamp to the tray.
- Hear It replays the current complete sentence. Audio unlock, mute, page-hide cleanup, and BGM ducking use shared platform modules.
- Reduced motion removes stepped movement while retaining voice, state changes, and the final static reward composition.

## Visual system

Canonical art world: **Claymation**. The workshop, title, word stamps, sockets, sentence strip, scene frames, rewards, buttons, and all 12 semantic scenes are authored raster media. The accepted visual language uses hand-shaped polymer clay, visible fingerprints and seams, matte-to-satin surfaces, warm upper-left studio light, deep teal, cream, coral, mustard, grape, and aqua.

The production source is one coordinated GPT Image 2 visual-system family. Object-aware source boxes preserve complete silhouettes. Qwen Image Layered supplied clean transparent layers for the four manipulation tiles and socket; seven layout-critical pieces use deterministic contiguous-ground separation because it preserved their authored identity better than the returned Layered roles. Alpha validation, trimming, and WebP encoding then preserve geometry. The hub tile is a separately framed, human-approved Krea 2 clay composition. Qwen Image Edit was intentionally unnecessary because the accepted coordinated masters needed no identity repair after the corrected fox sheet. MiniMax video was omitted because a passive clip did not improve the reading action enough to justify its decode/runtime cost; short stop-motion beats instead animate the authored raster objects.

CSS supplies layout, hit areas, focus treatment, and motion only. It does not draw the primary artwork. No SVG, vector illustration, emoji, or CSS gradient is part of the visible game world.

## Runtime architecture

This is a custom static DOM game rather than a new shared engine. `config.js` fetches Studio-editable `config.json`; `js/main.js` owns the three small mode state machines and composes existing shared modules:

- `audio-unlock`, `voice-clips`, `sfx`, and `bgm`
- `screens`, `tap`, `timers`, `idle-nudge`, `rng`, and `preload`
- `stage/drag-to-slot-dom` for resilient drag/tap parity
- `debug-harness`

The runtime makes no network request for content or media. All visible targets are real DOM controls with an authored raster surface and a minimum 96×96 CSS-pixel hit box.

## Responsive and accessibility contract

- Dedicated 4:3 landscape, portrait tablet, and compact 667×375 landscape layouts.
- Safe-area-aware corner controls and no required target smaller than 96×96 CSS pixels.
- Live sentence words, descriptive button names, hidden status announcements, keyboard activation, and in-page navigation.
- Portrait Scene Detective uses a 2+1 picture composition; compact landscape uses three fixed 150px scene objects with a separate sentence row.
- `prefers-reduced-motion` and the debug reduced-motion override collapse nonessential animation.

## Debug and release gates

`QLOBE_DEBUG` implements the platform v1 contract: `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`, `winRound`, `mute`, and `seed`, plus `home`, fast timers, audio-log helpers, `getRoundPlan`, `getLayout`, and a reduced-motion toggle. Debug taps use the same semantic action paths as child input.

Release gates are: registry/schema and asset validation; exact corpus/token/choice integrity; complete recorded voice manifest with Whisper, duration, volume, and checksum receipts; saturated-magenta alpha review; no console, HTTP, or unexpected runtime-network errors; three complete rounds in every mode; target bounds/overlap checks at 1280×800, true 1024×768, portrait 768×1024, and compact 667×375; reduced-motion evidence; production-mode screenshots; independent adversarial art review; and finally a child iPad playtest before promotion from beta.
