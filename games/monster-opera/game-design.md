# Monster Opera — production game design

## Product promise

Monster Opera lets a child conduct twelve unruly chalk creatures, hear each tap become part of a song, and then step inside the finished pattern to improvise over it. The core promise is immediate authorship: **I tapped that monster; I heard it; I can see exactly where it joined my song.**

The game is audio-first and fully playable without reading. There are no scores, wrong answers, timers, accounts, recording permissions, or destructive surprises.

## Art direction

- Canonical art world: **Toy**.
- Per-game treatment: **rough color-chalk classroom slate**.
- Material language: real charcoal-green blackboard texture; dusty, broken chalk edges; warm yellow, white, teal, coral, lavender, and pink marks; intentionally imperfect hand pressure.
- Primary visible art is raster or supplied H.264 video. CSS and DOM provide only layout, hit areas, focus, clipping, compositing, and motion.
- Every black-backed still and video renderer explicitly uses `mix-blend-mode: screen`. The splash, cast rail, and concert viewport also provide screen-composited media groups for browsers that promote video into opaque hardware planes, so the committed blackboard texture remains visible through every moving chalk layer.
- The decorative title is authored raster lettering. Functional labels stay accessible HTML/ARIA and are not required to play.

## Screen map

```text
Catalog ← Home — Splash
                   │ Start / Continue
                   ▼
                Composer ── Go ──▶ Concert
                   ▲  │               │
                   │  └ Back          ├ Back (keep song)
                   │                  │
                   └──── New Song ────┘ (clear and reset)
```

### Splash

- Full-bleed blackboard.
- Generated `MONSTER OPERA` chalk lockup.
- Three large, muted, screen-blended dancing performers.
- One oversized raster play control.
- Platform Home is available only here and returns to the catalog.

### Composer

- Three authored raster lane strokes occupy the top band: white, yellow, teal.
- One orange raster playhead sweeps the active lane. A full lane lasts 16 seconds; the listening lane advances white → yellow → teal and repeats.
- Twelve large monsters dance continuously on a horizontally swipeable stage. Four to six are visible in ordinary landscape; two are visible in portrait. Touch swipe, desktop drag, horizontal trackpad motion, and a conventional mouse wheel all move the same native rail.
- Tapping a monster previews the lane-specific four-second sound/video and records a continuous time in the active lane.
- A colored chalk token flies from performer to timeline and remains at that time.
- Global sound, independent beat toggle, Back, and Go use authored raster faces with ≥96px hit areas.
- Go brightens after the first event. An empty Go press gently pulses the lane and cast rather than leaving the screen.

### Concert

- Three large authored music tracks repeat across three adjacent 16-second panels.
- The panel strip scrolls past a fixed orange playhead and loops without a visible jump.
- Every recorded event keeps its exact authored time for audio scheduling. Visually,
  isolated events stay at that position, while nearby events are evenly distributed
  around their shared authored moment so performers never sit on top of one another.
  Circular grouping also treats the 16→0 seam as one continuous timeline.
- Crowded local groups reflow into compact one-, two-, or three-row arrangements.
  Their artwork scales down responsively, but every performer retains a separate
  96px-or-larger tap target and all three repeating panels use identical placement.
- Every idle concert monster uses its supplied `dance.mp4`. Listen decodes one
  shared source per unique monster (never more than twelve) and paints that
  frame into each Screen-blended timeline appearance, avoiding an iPad decoder
  explosion on dense songs. The canvas renderer is also hard-limited to 320
  paints per second and scales backing resolution only for unusually dense
  compositions; ordinary songs remain 480px at 20fps.
- All three lanes replay together every 16 seconds.
- Tapping a visible event immediately plays its own lane sound for four seconds as an independent solo. It never changes or delays scheduled playback.
- Performance MP4s load only near the viewport. A performance crossing the
  16→0 seam is mirrored onto the incoming panel copy while its audio remains a
  single scheduled or manual voice.
- New Song wipes the data, stops event voices, returns to Composer, and resets to white at zero.

## Timing and data contract

```js
SongEvent = {
  id, monsterId,
  laneId: 'white' | 'yellow' | 'teal',
  at: 0 <= seconds < 16,
  createdAt
}
```

- Lane and concert loop: 16 seconds.
- Performance block: exactly 4 seconds (the supplied clips are deterministically finalized to this duration).
- Event positions are continuous and rounded only to 0.01 seconds for stable serialization.
- A monster may overlap different monsters.
- A monster may occur at the same time on another lane.
- The same monster on the same lane is rejected when circular distance to an existing start is less than 4 seconds. Exactly 4 seconds is permitted. This rule also protects the 16→0 seam.
- Composition is session-only. Reloading starts empty; storage is not required for play.

## Audio architecture

- One game-local Web Audio graph owns the beat and all monster voices.
- The graph includes per-channel gains plus a compressor so overlapping child-authored sounds remain warm instead of clipping.
- The supplied beat uses a gapless looping `AudioBufferSourceNode`; beat gain remains independent from global mute.
- Monster audio is extracted from the audiovisual sources and scheduled through decoded buffers for precise timing.
- Videos are muted visual layers; this prevents doubled audio and media-element scheduling drift.
- Authoring taps are immediate previews. Composer does not automatically replay recorded dots.
- Concert uses a 60ms scheduler with 220ms lookahead. Manual voices and scheduled voices may coexist.
- Hiding the page pauses transport and stops event voices. Returning resumes from preserved phase and schedules only future events—never a catch-up burst.
- Every child gesture participates in the shared iPad audio re-unlock fan-out.

The recorded-background-music helper is intentionally not used: its fade-loop policy is appropriate for non-seamless underscore, while this supplied beat is a continuous musical-mechanic loop and must not fade through half of every bar.

## Interaction and feedback

- All controls and performer buttons expose at least a 96×96px hit area.
- Buttons use the shared one-press Pointer Events path, including keyboard/assistive click support.
- Accepted composition tap: finger press → performer animation and sound → raster dot flight → persistent token.
- Suppressed overlap: performer wiggle plus existing token wink; no second monster voice and no scolding sound.
- Idle nudge: after 8.5 seconds without touch, the active lane and first visible performers breathe once; repeated nudges remain gentle.
- Reduced motion: splash video stops, scrolling track becomes a stable center panel, continuous playhead paint is throttled, and scheduled performers still highlight. Audio/data behavior is unchanged.
- Focus rings and ARIA labels remain available for assistive play.

## Responsive layout

- Primary target: tablet landscape, including short 1180×520 browser bands.
- Portrait retains timeline above cast and a horizontal monster swipe rail.
- Concert collision spacing is derived from the current viewport and performer
  footprint, then recomputed on resize or orientation change without resetting the
  song transport. Artwork may shrink for dense groups while tap targets stay at
  least 96px.
- Top-lane performers move down briefly when their artwork reaches the fixed Back
  or sound controls, preserving both the endless-scroll illusion and control access.
- Safe-area variables protect every corner control.
- Page scroll and rubber-band interaction are disabled; the cast rail alone accepts horizontal pan.

## Spoken script

None. The interaction is intentionally modeled through motion, immediate monster sound, pictorial controls, and the cause-and-effect token flight. Narration would compete with the child's composition and is not required to understand the loop.

## Asset list

- 1 blackboard texture.
- 12 black-backed neutral monster stills in high-quality WebP delivery, composed through the same overlay treatment as video.
- 12 four-second looping dance videos for Composer and pooled Concert idles.
- 36 four-second lane-specific video performances plus 36 separated AAC sounds.
- 3 muted dance loops for the splash.
- 1 looping beat.
- 1 generated title lockup.
- 8 generated/sliced control faces.
- 3 generated/sliced composer lane strokes.
- 1 generated concert track plate.
- 1 generated orange playhead and 3 event dots.
- 1 generated hub tile and 1 production social preview.

Exact provenance and transformations are in `ASSETS.md`; generation prompts are retained under `assets/source/gpt-image-2/PROMPTS.md`.

## Mockup interpretation

- The first reference screen supplies the authoring hierarchy: top timeline, active orange playhead, theatrical monster lineup, and circled Go action.
- The second supplies the concert fantasy: three large musical rows, monsters at authored positions, fixed timing reference, and an endlessly moving song world.
- Controls are rearranged only to protect platform-safe corners and portrait/short-landscape layouts.
- The mockups' empty translucent bands are omitted so every occupied area has a gameplay purpose.

## Debug and release gate

`window.QLOBE_DEBUG` v1 exposes real navigation, targets, composition state, semantic time setters, new-song reset, audio log, transport state, global mute, and accelerated clocks. Release requires:

1. dependency-free transport unit tests;
2. syntax, registry, manifest, media, and full-catalog validation;
3. real-Chrome landscape, portrait, short-landscape, reduced-motion, and unmuted media checks;
4. visual screenshot review with no black video tiles, matte halos, overflow, tiny targets, or generic CSS artwork;
5. independent adversarial art-direction review;
6. parent/child iPad playtest before `beta` becomes `live`.
