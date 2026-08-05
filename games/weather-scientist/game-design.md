# Weather Scientist — production design

## Product promise

Weather Scientist turns the existing emoji observation journal into the
interactive weather observatory promised by the source concept. A child picks
a place from the scene chooser, then taps or slides four tangible weather
controls and immediately watches that world react: sunlight wakes a growing
plant, rain feeds it, wind carries particles through the air, and cloud cover
changes the light. After the four short discoveries, the same scene becomes an
open weather toy where combinations create extra responses such as a rainbow.

Four scenes — **Meadow, Desert, Arctic, and Rainforest** — share one control
vocabulary and one four-step guided loop, but each is fully biome-specific:
its own background, hero growth character, weather-effect art (blowing sand in
the desert, snow in the arctic, leaves in the rainforest), and its own spoken
script describing how that climate's weather actually behaves. This is the
game's central idea: the same four instruments (sun, rain, wind, cloud)
produce a different, climate-true story in every place.

One mode, one skill: **cause and effect in a changing weather system, observed
across different climates**. Each guided loop lasts about 60–90 seconds, has
no wrong answers or time pressure, and flows directly into open-ended replay.

## Screen map and navigation

1. **Scene-chooser splash** — a dedicated twilight-observatory "home" backdrop
   (distinct from any destination scene, so the splash has its own identity
   rather than defaulting to the meadow), a soft gradient veil for text
   contrast, the authored `Weather Scientist` title lockup, a one-line prompt,
   and one card per scene (its own background art as the thumbnail, narrated
   label). Tapping a card commits to that scene, plays its welcome line on
   first visit, and starts the guided lab directly — no separate Play step.
   Home returns to the catalog. The first real gesture unlocks every audio
   channel.
2. **Guided weather lab** — one continuous layered scene, a paper prompt
   banner, four large authored weather controls (shared across every scene —
   the child's "field kit"), four progress badges, and a real wind slider.
   Back returns to the scene-chooser splash. The highlighted control is the
   current discovery; other controls still produce a small response and a
   gentle spoken redirect rather than an error.
3. **Scientist celebration** — the finished growth character and all four
   authored badges surround the scene while confetti and a local narration
   clip celebrate the whole system. `Explore` returns to the same live scene
   in free-play state. Back returns to the scene-chooser splash.
4. **Open observatory** — all controls toggle freely, the wind slider remains
   adjustable, and combinations can be discovered repeatedly. Sun plus rain
   reveals the scene's authored rainbow. A reset control starts a fresh
   weather day in the same scene.

Only the splash Home control leaves the game. Celebration and open-lab Back
controls always return in-page to the scene-chooser splash, never to a
mid-scene state.

## Core loop

1. The child hears and sees one short weather mission.
2. The matching 96 px-or-larger watercolor control gently pulses.
3. The child taps Sun, Rain, or Cloud, or drags the golden Wind dial. Every
   gesture uses one pointer path and can safely end on `pointerup`,
   `pointercancel`, orientation change, or window blur.
4. The selected weather changes the same scene immediately, with local
   narration, a tactile sound, and a distinct ecological response true to
   that scene's climate.
5. The matching progress badge fills. After a short visual beat, the next
   mission begins without replacing the world.
6. Four discoveries trigger the scientist celebration, then the child can keep
   combining weather freely.

The guided order is Sun → Rain → Wind → Cloud in every scene. Sun opens the
growth character's seedling stage into a bud. Rain runs briefly and grows the
bud into bloom. Wind is completed when the child moves the dial past a
gentle-breeze threshold. Cloud cover visibly changes the light. Guided effects
are cumulative enough to feel like one living place, but the rainbow
combination is held for open play so it remains a bonus discovery in every
scene.

## Scenes

Four scenes share the config schema (`config.json` → `scenes.<id>`): a 15-key
`voice` script and an `assets` block (`background`, `landmark`, 3-stage
`growth`, 6 `world` weather-state layers, 4 `particles`). `sceneOrder` drives
both the splash card order and iteration; a scene absent from `scenes` is
skipped rather than erroring, so scenes can ship incrementally.

- **Meadow** — temperate baseline. Growth character: a flower (seedling → bud
  → bloom). Landmark: the meadow's own tree. Rain is the ordinary, expected
  drink; wind carries leaves; cloud makes shade.
- **Desert** — scorching sun, rain reframed as rare and precious ("the cactus
  drinks up every single drop"), wind carries swirling sand, cloud brings a
  small patch of relief rather than deep shade. Growth character: a paddle
  cactus. Landmark: a cluster of rock spires.
- **Arctic** — sun glints on ice and begins a melt, rain is cold enough to
  freeze into beads, wind drives a snow flurry, cloud brings extra cold rather
  than shade. Growth character: a frost flower. Landmark: a sculpted ice
  formation.
- **Rainforest** — warm sun breaks through the canopy, rain is the frequent
  expected norm (not a special event), wind rustles leaves and vines, cloud
  brings warm humidity and mist rather than shade. Growth character: an
  orchid. Landmark: a vine-draped jungle tree.

Every scene reuses the same universal "field kit" UI chrome (control tray,
prompt banner, wind slider, four weather controls, four badges, action
carriers) — only the world content changes per scene. This is deliberate: the
instruments the child holds stay constant across places, so the same four-step
loop transfers immediately to a new scene, while the *content* teaches that
weather behaves differently by climate.

## Spoken script (verbatim, per scene)

Each scene has its own script under the same 15 keys — `welcome`,
`sun-prompt`, `sun-result`, `rain-prompt`, `rain-result`, `wind-prompt`,
`wind-result`, `cloud-prompt`, `cloud-result`, `gentle-nudge`, `wind-nudge`,
`complete`, `free-lab`, `rainbow`, `reset`. The exact strings for all four
scenes live in `config.json` (canonical) and are mirrored into
`assets/audio/lines.json` by the voice generator — do not hand-edit
`lines.json`.

Every line across all 60 (4 scenes × 15 keys) is cloned from the platform's
one shared teacher-voice reference (`voice_teacher.wav`) with
`qwen3-tts-voiceclone` on the LAN GenAI API, loudness-normalized to 96 kbps
M4A, and Whisper-QA'd against its source text (space/punctuation-insensitive
compare, retried across seeds on mismatch) before shipping. Web Speech
(`shared/js/speech.js`) remains only as a missing-clip fallback; no runtime
network call is permitted, and in normal operation every line plays as a
recorded clip (`window.QLOBE_DEBUG.getAudioLog()` reports `kind: 'clip'`
throughout, never `'speech'`).

## Art direction

World: **Watercolor / Storybook**, expressed through the platform’s **Field
Journal** world. The source mockups’ blue watercolor sky, paper grain,
observatory tower, wooden control tray, navy ink, friendly weather faces, and
open center are the visual north star for every scene — each biome reinterprets
the same visual language (blue/turquoise washes, navy ink outlines, paper
grain) rather than switching styles.

Every primary visible object is authored raster art. HTML/CSS provides only
layout, hit areas, legible functional text, focus states, masks, transforms, and
responsive composition. The rain and wind effect canvas draws authored
particle sprites (rain/sand/snow/leaves depending on scene); it does not
substitute geometric vector art. Shared Home, Back, and Sound buttons retain
the platform’s raster HUD grammar.

## Art inventory

Universal UI chrome (one set, reused by every scene):

| Runtime asset | Target | Visible purpose | Interaction substrate |
| --- | --- | --- | --- |
| `assets/title.webp` | alpha WebP, ≤980×420 | exact two-line watercolor title lockup | inert `<img>` |
| `assets/backgrounds/splash.webp` | 1536×1024 opaque WebP (3:2), ≤300 KB | scene-chooser splash's own "home" backdrop (twilight observatory), distinct from any destination scene | fixed `<img>` cover layer, full-bleed, plus a gradient veil for title/tagline contrast |
| `assets/ui/control-{sun,wind,cloud,rain}.webp` | matched alpha WebP, ≤340×390 | four primary controls | 96 px-or-larger `<button>` hit areas |
| `assets/ui/{control-tray,prompt-banner,wind-track,wind-knob}.webp` | alpha WebP | authored carriers for controls, text, and slider | DOM layout / range-style pointer controller |
| `assets/ui/badge-{sun,wind,cloud,rain}.webp` | matched alpha WebP, ≤190 px | progress and celebration badges | inert status images |
| `assets/ui/{play,explore,reset}.webp` | alpha WebP, ≤620×220 | authored action carriers with HTML labels over blank centers | `<button>` hit areas |

Per scene (`<scene>` ∈ `meadow, desert, arctic, rainforest`):

| Runtime asset | Target | Visible purpose | Interaction substrate |
| --- | --- | --- | --- |
| `assets/backgrounds/{observatory-meadow,desert,arctic,rainforest}.webp` | 1536×1024 opaque WebP (3:2), ≤300 KB | full-bleed watercolor scene, no baked controls/text/weather | fixed `<img>` cover layer, fills the viewport edge-to-edge at any aspect ratio |
| `assets/ui/scene-<scene>.webp` | opaque WebP, 440×440 | scene-chooser card thumbnail (a center crop of that scene's own background) | inert `<img>` |
| `assets/world/<scene>/landmark.webp` | alpha WebP, ≤560×760 | scene-specific decorative feature whose silhouette sways with wind | transformed `<img>` |
| `assets/world/<scene>/growth-{seedling,bud,bloom}.webp` | matched 420×520 alpha canvases | center growth-character sequence, biome-specific | stacked `<img>` opacity swap |
| `assets/world/<scene>/{sun,cloud,rain-cloud,rainbow,puddle,shade}.webp` | alpha WebP, max 720 px | weather-state and combination layers, biome-specific | transformed/faded `<img>` |
| `assets/particles/<scene>/{raindrop,leaf-1,leaf-2,leaf-3}.webp` | alpha WebP, max 160 px | weather particles in the shared canvas system (sand/snow/leaves per scene) | Canvas `drawImage` sprites |

Generated masters and intermediate layer outputs are retained under
`assets/source/`. Backgrounds and world-sheet flats come from the LAN
`krea2-turbo-t2i` workflow (`assets/source/krea2/`); the approved LAN
`qwen-image-layered` workflow performs semantic foreground separation on each
scene's 4×4 world production sheet (`assets/source/qwen-layered/<scene>-world-kit.png`).
`tools/process-art.py` crops, normalizes, downscales, and WebP-encodes
deterministically per scene (`--scene <id>`, default all). No flood-fill
transparency is used. Each alpha final is reviewed over a high-saturation
magenta composite at full size (`assets/source/qa-magenta/`). The meadow's UI
kit and title/hub-tile art are the one original GPT Image 2 + Qwen Image
Layered production pass; new scenes reuse that UI kit unchanged and only
contribute their own background + world sheet.

## Visual behavior

- The stage is full-bleed at every aspect ratio (`.weather-stage { width:
  100vw; height: 100dvh }`), not a fixed-ratio letterboxed box. The background
  `<img>` uses `object-fit: cover` to fill edge-to-edge; backgrounds are
  authored at a wide 3:2 working ratio with generous sky/ground margin so
  `cover` crops gracefully at both narrow portrait and wide landscape extremes
  instead of losing key content. Portrait uses a two-by-two control dock and
  keeps the growth character, prompt, and all four targets visible without
  scrolling.
- Sun rises from below the horizon and adds a soft authored glow layer. Cloud
  and rain cloud occupy the *same* sky slot as the sun, at a higher z-index —
  a cloud drifting in visually covers/replaces the sun rather than sitting
  beside it in its own corner, matching how clouds actually block sunlight.
  Rain cloud replaces the soft cloud only while rain is active. The landmark
  uses a very small raster transform (sway) and
  particles use sprite art. Growth-character plates share one baseline so
  growth never jumps. Each scene's landmark/growth position is tuned per
  composition (`[data-scene="…"]` CSS overrides) rather than assumed from the
  meadow's defaults — a color or placement clash against that scene's own
  background is a real defect to fix, not cosmetic noise.
- Reduced motion replaces long travel, sway, and particle showers with short
  opacity changes and a few static sprites while preserving every cause/effect.
- Prompt and control labels are runtime Fredoka text for accuracy and
  accessibility, sitting on authored paper/wood carriers rather than CSS-drawn
  cards.

## Interaction and feedback rules

- All primary controls and the wind knob expose at least a 96×96 CSS-pixel hit
  region in every QA viewport.
- A highlighted mission target uses scale/brightness/outline effects only; its
  watercolor art remains unchanged.
- Non-target weather input is never called wrong. It produces a quiet preview,
  then the spoken gentle nudge returns focus to the highlighted card.
- The wind slider owns one active pointer, captures it, and cancels cleanly on
  all interruption paths. Keyboard arrows also adjust it for accessibility.
- A newer spoken line always stops the previous one. Ambient rain/wind sits
  below narration and stops on mute, Back, reset, visibility change, and
  `pagehide`.
- Celebration is brief, warm, and skippable. There is no score, red X, timer,
  loss state, or comparison between children.

## Reusable capability

`shared/js/weather-world.js` is the reusable feature introduced by this game.
It owns raster-sprite rain and leaf particles, deterministic wind movement,
sun/cloud/rain visual state, reduced-motion behavior, resize/DPR handling,
ambient weather audio, and teardown. It accepts the game’s authored layer
elements and sprite URLs rather than hard-coding Weather Scientist paths — this
is exactly what let the game grow from one scene to four without any change to
the shared module: each scene switch tears down and rebuilds the controller
against that scene's own DOM layers and sprite URLs. Pure state-resolution and
particle-step functions are exported for deterministic tests. Future garden,
outdoor, season, and nature games can use the same system.

## Data, privacy, and fallback

- No location, live weather, microphone, camera, account, analytics, tracking,
  persistence, or child-created data is used.
- All image, voice, and sound assets ship locally, pre-generated. Authoring-time
  model calls (art generation, voice cloning) never appear in runtime code —
  the LAN GenAI API is a production-tool dependency only, and only
  `tools/generate-voice.py`/`tools/process-art.py` (offline authoring scripts)
  ever call it.
- Missing committed narration falls back to local device speech
  (`shared/js/speech.js`), but in normal operation every one of the 60 lines
  ships as a real cloned clip — the fallback is a safety net, not the
  production voice. Missing optional particle sprites leaves the core layer
  transitions and controls playable.
- If WebAudio is unavailable, the visual simulation still runs silently.

## Departures from the brief, mockups, and old prototype

- The old `observe-journal` emoji flow is replaced completely because it asks
  the child to report real weather rather than delivering the brief’s central
  weather-control fantasy.
- The brief’s four separate control screens become one persistent scene per
  place, chosen from a scene-chooser splash. This makes cause and effect
  legible because the child sees the same place change, while comparing
  across scenes teaches that the same weather behaves differently by climate
  — a step beyond the original single-meadow brief.
- The mockup’s weather cards remain, but the wind card reveals a real slider so
  its stated fine-motor promise is not reduced to a tap.
- A guided four-discovery pass precedes open play in every scene. Ages 5–6 can
  understand the controls within five seconds, then experiment without
  instruction.
- Snow and clothing are removed from the stub. They do not support the chosen
  one-skill simulator loop and would dilute the four authored causal reactions
  (the arctic scene's snow lives in its weather-effect art, not as a costume
  mechanic).
- The central growth character is a friendly environmental character (flower,
  cactus, frost flower, or orchid depending on scene), but no one-off speaking
  mascot is added; narration remains a warm cloned teacher-style voice.
- An earlier build shipped its "recorded" narration synthesized offline with
  the macOS `say` system voice, explicitly avoiding the platform's shared
  teacher-voice reference to keep the generator network-free. That was
  reversed: every line is now cloned from `voice_teacher.wav` like every other
  shipped game, matching the platform standard.

## Debug and release gate

`window.QLOBE_DEBUG` v1 exposes `ready`, the `weather-lab` mode, `listScenes`,
`chooseScene`, start, complete serializable state (including `sceneId`),
target bounds, real-path tap (scene cards tap by id, e.g. `tap('desert')`),
real wind-drag, direct state-setting for visual review, reset, win, mute,
seeded particles, fast timers, and in-page home.

Production QA must cover, **per scene** (meadow, desert, arctic, rainforest):

- hub launch and direct route;
- scene-chooser splash → that scene's guided discoveries → celebration → open
  observatory;
- one non-target gentle-nudge branch;
- the wind pointer lifecycle, including cancel/blur cleanup;
- sun-plus-rain rainbow discovery in free play;
- reset, mute, celebration/lab Back routing to the scene chooser, and splash
  Home semantics;
- cloned-clip narration use after a real gesture — `getAudioLog()` must show
  `kind: 'clip'` for every line, never `'speech'`;
- 1366×1024 and 1024×768 landscape, 820×1180 portrait, a short landscape,
  and reduced motion;
- full-bleed background coverage specifically at a non-3:2 viewport (no
  letterbox bars);
- ≥96 px controls, stable state, no overlap/cropping, zero page errors, zero
  failed local requests, and zero remote runtime requests;
- landmark/growth placement doesn't collide or clash against that scene's own
  background (checked visually per scene, not assumed from meadow's defaults).

Rebuild commands: `python3 tools/process-art.py [--scene <id>] [--check]` and
`python3 tools/generate-voice.py [--only <scene-or-line>] [--check] [--force]`.

Status remains **beta** until automated production QA is green and a real iPad
child playtest confirms prompt pacing, slider comfort, and replay appeal
across all four scenes.
