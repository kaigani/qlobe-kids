# Puppet Patience Theater — production design

**Status:** production build
**Canonical art direction:** **Puppet / Cozy felt fabric**
**Replacement:** supersedes the `waiting-muscle-game` emoji/coach-timer prototype in the public catalog while leaving that route archived for history.

## Product promise

Puppet Patience Theater turns a short wait into an active, repeatable social-emotional skill. A child watches a friend take a turn, helps Fox complete slow breaths, and then receives a joyful turn of their own. The whole loop is understandable from pictures, motion, and voice in about five seconds.

One skill is taught throughout: **I can wait for my turn by watching, breathing, and noticing when my turn arrives.** There is no failure state, score pressure, countdown alarm, or moral judgment.

## Core loop (30–55 seconds)

1. Pick one of three illustrated puppet stories.
2. **Watch:** Rabbit or Squirrel models the first turn for a brief beat.
3. **Breathe:** tap the large breathing flower with Fox three, four, or five times. Each paced tap earns one felt star beneath the flower.
4. **Your turn:** the central play prop wakes up. Tap it to give Fox the promised turn.
5. See a three-star curtain-call celebration, then replay or choose another story.

Tapping the play prop early never removes progress. Fox gives a warm reminder and the breathing flower gently pulses. Idle nudges replay the current instruction without shaming.

## Stories

| id | Story | Friend’s first turn | Child payoff | Breaths |
| --- | --- | --- | --- | ---: |
| `swing` | Swing Turns | Rabbit swings | tap the swing for Fox’s turn | 3 |
| `bakery` | Cookie Wait | Squirrel receives the first cookie while the next one finishes | tap the cookie tray for Fox’s cookie | 4 |
| `parade` | Parade Line | Rabbit leads one lap | tap the drum so Fox leads next | 5 |

The three rounds increase only the number of child-controlled breaths. There is no long passive timer.

## Screen map

### Splash / home

Generated felt title lockup above Fox host on the miniature stage. One giant raster-backed Play control is the dominant affordance. Shared Home remains on the entrance; deeper screens expose a real child-facing sound toggle in a safe upper corner. Spoken narration begins only after the first child gesture.

### Puppet Practice

Three large illustrated story cards fill the stage in landscape and stack comfortably in portrait. Each card uses an authored story medallion plus real HTML for the short label. Fox says, “Pick a puppet story.” Completed stories keep a small earned felt star for the session.

### Play

The same theatrical composition remains stable so state changes are easy to read:

- top: three authored phase badges, **Watch → Breathe → Your Turn**;
- center: Fox, friend, and the story prop on the generated stage;
- lower center: one large authored breathing-flower button during the waiting phase;
- bottom: a short real-text caption mirroring the narration.

Pose sprites change with the phase. The active phase badge enlarges while completed badges remain fully colored. Decorative sparkle particles are feedback only.

### Curtain call

Fox and friend celebrate beneath three authored stars. Replay keeps the selected story; Another Story returns to Puppet Practice. Back returns to splash.

## Spoken script (verbatim)

| key | line |
| --- | --- |
| `welcome` | “Welcome to Puppet Patience Theater! Let’s watch, breathe, and take turns together.” |
| `pick-story` | “Pick a puppet story.” |
| `swing-watch` | “Rabbit is swinging first. Watch her turn.” |
| `swing-breathe` | “Fox can wait. Tap the flower for three slow breaths.” |
| `swing-turn` | “You waited. Now it’s Fox’s turn! Tap the swing.” |
| `bakery-watch` | “Squirrel gets the first cookie. Fox’s cookie is almost ready.” |
| `bakery-breathe` | “Let’s help Fox wait with four slow breaths.” |
| `bakery-turn` | “The cookie is ready. Tap the tray for Fox’s turn.” |
| `parade-watch` | “Rabbit leads the parade first. Fox waits in line.” |
| `parade-breathe` | “Take five slow breaths while Fox waits.” |
| `parade-turn` | “Fox is next! Tap the drum to lead the parade.” |
| `breath` | “In… and out.” |
| `early` | “Almost your turn. One more calm breath.” |
| `success` | “You watched, waited, and took your turn. That is patient play!” |
| `another` | “Choose another puppet story.” |

Every authored clip has device speech as a runtime fallback. The cloned teacher voice is generated only at authoring time and every accepted clip is transcribed with Whisper.

## Art inventory and renderer contract

All child-facing primary art is authored raster. CSS supplies only layout, clipping, focus, safe hit areas, transforms, and state transitions.

| asset | visible renderer | interaction substrate |
| --- | --- | --- |
| miniature theater | opaque 4:3 WebP generated with GPT Image 2 | fixed responsive stage container |
| title lockup | transparent WebP generated with GPT Image 2 | noninteractive accessible image |
| Fox / Rabbit / Squirrel poses | transparent WebP cutouts from a GPT Image 2 contact sheet, separated by Qwen Layered | positioned images; buttons remain separate |
| swing, cookie tray, drum, breathing flower | transparent WebP cutouts from a GPT Image 2 contact sheet, separated by Qwen Layered | 96 px or larger transparent buttons |
| story cards and phase UI | transparent raster frames and badges cut with the repository asset-sheet cutter | semantic buttons and real text overlays |
| progress stars / reward | transparent authored felt sprites | decorative images / aria-hidden |
| hub tile | dedicated Krea 2 image, seed ladder beginning at 42, no baked text | catalog link |
| social card | deterministic production capture | metadata only |

Source generations, prompts, cutter boxes, layered recipes, and magenta alpha composites stay under `assets/source/`. No emoji, SVG, canvas-drawn characters, CSS-drawn props, or remote runtime media ship.

## Motion and interaction polish

- Fox and friends use tiny transform-only breathing/bobbing loops; the background never moves.
- The breathing flower compresses under touch, then opens and releases a felt star along a short curved path.
- The friend’s turn uses a brief prop wiggle and pose swap, not a blocking video.
- Your-turn activation combines a warm spotlight, one spoken line, prop bounce, and haptic-safe visual pulse.
- Reduced-motion removes travel/bounce while preserving immediate state changes and sound.
- All targets are at least 96 px, have forgiving hit padding, keyboard activation, visible focus, and touch-action isolation.

## Audio

- Narration: approved QLOBE teacher reference → local `qwen3-tts-voiceclone` → AAC/M4A → local Whisper transcript QA.
- Music: `shared/assets/music/cozy-starlight-lullaby.mp3` through `shared/js/bgm.js`, quietly mixed and ducked under narration.
- SFX: shared soft tap, sparkle, and success cues. No loud buzzer or ticking clock.
- First real gesture unlocks narration, BGM, and Web Audio together. Mute persists for the session and stops/ducks all channels consistently.

## Responsive and accessibility behavior

Landscape keeps the mockup’s 4:3 stage centered with a blurred raster bleed outside it. Portrait uses the full viewport, places characters above a vertically stacked control area, and keeps HUD buttons clear of notches and home indicators. Short landscape reduces labels before it reduces hit areas. The game is audio-first, but all guidance also appears as concise real text. Images have useful alt text; decorative duplicates are hidden.

## Persistence and privacy

Session-only story stars are stored in memory. No microphone, camera, network request, child name, recording, or durable child profile is used. All model calls are authoring-time only; the shipped game works offline.

## Shared modules

`audio-unlock`, `bgm`, `celebrate`, `debug-harness`, `hud`, `idle-nudge`, `narrator`, `preload`, `rng`, `screens`, `sfx`, `tap`, `timers`, and `voice-clips` are reused. No shared-module change is required.

## Debug and QA contract

`window.QLOBE_DEBUG` exposes readiness, current screen/story/phase/breath count, target ids, deterministic seed, fast mode, mute, story selection, target tap, phase advance, and completion. The game-local Playwright smoke covers every story, early taps, replay, back/home, mute, portrait, landscape, reduced motion, asset 404s, runtime errors, and production screenshots.

Release requires:

- exact-count cutter pass and visual review of every cutout on magenta;
- recorded narration present with Whisper QA or documented per-line fallback;
- validator and registry sync clean;
- local browser smoke and screenshot review at tablet landscape and portrait;
- production URL, game route, catalog tile, and critical interactions verified after deploy.

## Deliberate departures

- The mockup’s four unrelated app sections become one focused practice selector; dress-up, music, and a persistent star economy are omitted because they dilute the single patience skill.
- Passive waiting is replaced by slow breath taps. Preschool playtests need agency, and breath pacing makes the regulation strategy transferable.
- The game uses three complete stories instead of one swing tableau, giving replay variety without adding a reading burden.
- The former Waiting Muscle prototype’s treat test, gym metaphor, real-world setup, and one-minute timers are removed. The replacement teaches the same delayed-turn skill through safe screen-native social play.
