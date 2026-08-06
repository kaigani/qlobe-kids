# Freeze Focus Dance — production design

## Product promise

Pip, a joyful blue clay dancer, turns one safe patch of floor into a tiny
stop-motion dance stage. Music means move. A giant snowflake means freeze.
After the body settles, the child either listens for the next beat, searches
for one forest friend, or copies a playful statue.

The optional front camera is a **local motion instrument**, not a judge. Big
movement wakes colored motion sparkles; quieter frames let clay snowflakes
settle. The game never records, identifies, scores, or uploads a child, and
camera feedback never gates progress. Every mode remains complete and equally
celebratory without camera permission.

## Capability contribution

This game introduces `shared/js/camera-motion.js`, a reusable, authoring-free
runtime service for coarse on-device scene motion. It is intentionally smaller
than pose recognition:

- explicit-gesture camera request with `facingMode: user` preference;
- low-resolution luminance frame differencing in a private 2D canvas;
- rolling activity/stillness summaries and a short calibration baseline;
- no recognition, MediaRecorder, Blob, persistence, image export, or network;
- idempotent teardown on screen exit, hidden/pagehide, errors, and late grants;
- deterministic pure functions for tests.

Animal Motion Cards and other future movement concepts are concrete second
consumers, so this capability belongs in `shared/` rather than a one-off game
copy.

## Learning design

| Mode | One skill | Rounds | Normal loop |
| --- | --- | ---: | --- |
| Beat Stop | inhibit movement after an audio cue | 5 | dance 4–6s → freeze 3s → warm mini-payoff |
| Owl Lookout | sustain visual attention after settling | 4 | dance 4–6s → freeze 2s → find one hidden animal → reveal |
| Star Statues | deliberately shape and hold the body | 4 | dance 4–6s → copy one modeled statue → hold 4s → payoff |

Each mode lasts roughly 45–90 seconds. A complete three-mode visit fits in
3–6 minutes. No number, grade, streak, or missed-freeze penalty appears.

## Screen map and navigation

1. **Clay forest splash / mode shelf**
   - Generated title lockup, Pip dancing, snowflake and music-note props.
   - Three large physical clay mode cards.
   - Home is the only catalog link and appears only here.
2. **Motion-sparkle choice**
   - Pip points to a clay-framed magic mirror.
   - Camera button: “Motion sparkles”; star button: “Play without camera.”
   - The narrator makes both choices sound equally good.
   - Permission is requested only from the camera-button gesture.
3. **Magic-mirror warm-up** (camera path only)
   - Muted, mirrored, inline camera preview inside authored clay frame.
   - “Wave hello” samples a brief activity baseline.
   - Timeout, denial, play rejection, or stream loss continues immediately in
     the same mode with camera off.
4. **Play stage**
   - One persistent clay forest plate. Phase-specific authored raster props,
     poses, word lockups, and overlays change on top of it.
   - Back returns in-page to the splash and releases the camera immediately.
   - Sound replays the current prompt.
5. **Focus Star celebration**
   - Night-lit version of the same stage geometry, cheering Pip, large physical
     Focus Star, the mode-specific friend/pose, and one dominant Dance Again
     action.
   - Back and “choose another” both return to the splash.

## Interaction loops

### Beat Stop

1. Dance music begins; Pip bounces through one of three dance poses.
2. If camera is on, frame motion controls the density/brightness of authored
   clay sparkle sprites and colored stage-light overlays.
3. Music cuts cleanly. A giant authored `FREEZE!` lockup and snowflake land.
4. Over three forgiving seconds, camera motion controls how quickly authored
   snowflake sprites visually settle. The round always completes at timeout.
5. Pip celebrates the stop cue; the next beat begins automatically.

### Owl Lookout

1. Dance and freeze use the same strong audiovisual grammar as Beat Stop.
2. Once the two-second freeze beat ends, exactly one forest friend becomes
   discoverable: owl, fox, raccoon, or bunny.
3. The child taps the friend. All scenery taps are neutral.
4. After eight idle seconds the friend glints; after another eight seconds Pip
   points and the hit area gently grows. No red X, buzzer, or forced answer.
5. The animal pops forward for a short shared celebration.

### Star Statues

1. Dance music plays for one short phrase.
2. Pip models one safe silhouette: star, tall, tiny, or wide.
3. The narrator invites the child to copy Pip **or make another statue**.
4. Pip holds with the child for four seconds. Camera stillness changes only
   the authored sparkle/snow ambience; it never evaluates pose correctness.
5. A clay star stamps the completed statue, then the next pose begins.

## Spoken script (verbatim)

### Shared

- `welcome`: “Welcome to Freeze Focus Dance! Pick a dance game.”
- `camera-offer`: “Want motion sparkles? Tap the camera. Or tap the star to play without it.”
- `camera-wave`: “The magic mirror is ready. Wave hello!”
- `camera-skip`: “Great! We can play without the camera. Let’s dance!”
- `camera-lost`: “The magic mirror is resting. Keep dancing!”
- `safe-space`: “Find a safe space where your whole body can wiggle. Ready?”
- `dance-one`: “Dance, dance! Wiggle, bounce, and groove!”
- `dance-two`: “Move it high! Move it low!”
- `dance-three`: “Shake out every silly wiggle!”
- `freeze-one`: “FREEZE! Still like ice!”
- `freeze-two`: “FREEZE! Make your body quiet!”
- `freeze-three`: “FREEZE! Hold your statue!”
- `again`: “Ready for another dance?”

### Beat Stop

- `beat-intro`: “Listen for the music. Dance when it plays. Freeze when it stops.”
- `beat-round`: “What a super stop!”
- `beat-end`: “You heard every stop signal. Freeze champion!”

### Owl Lookout

- `lookout-intro`: “Dance, then freeze and find one forest friend.”
- `find-owl`: “FREEZE! Find the little owl.”
- `hint-owl`: “Look inside the tree.”
- `found-owl`: “You found the owl!”
- `find-fox`: “FREEZE! Find the shy fox.”
- `hint-fox`: “Look beside the orange flowers.”
- `found-fox`: “You found the fox!”
- `find-raccoon`: “FREEZE! Find the raccoon.”
- `hint-raccoon`: “Look near the round rocks.”
- `found-raccoon`: “You found the raccoon!”
- `find-bunny`: “FREEZE! Find the little bunny.”
- `hint-bunny`: “Look between the purple flowers.”
- `found-bunny`: “You found the bunny!”
- `lookout-end`: “Your noticing eyes found every forest friend. Focus star!”

### Star Statues

- `statue-intro`: “Copy Pip’s statue, or invent your own. Then hold it with me!”
- `statue-star`: “Make a big star shape!”
- `statue-tall`: “Reach up for a tall statue!”
- `statue-tiny`: “Curl into a tiny statue!”
- `statue-wide`: “Stretch into a wide statue!”
- `statue-hold`: “Hold it with me!”
- `statue-round`: “Beautiful statue!”
- `statue-end`: “Your body made amazing statues. Statue star!”

`assets/audio/lines.json` is the runtime source of truth. Every final line is
cloned from the approved synthetic platform teacher voice with
`qwen3-tts-voiceclone`, encoded to AAC/M4A, and checked against the intended
transcript with `whisper-stt`. Web Speech remains the missing-clip fallback.

## Art direction and complete inventory

World: **Claymation**. The reference mockups’ hand-sculpted forest, blue Pip,
cream-rimmed word art, blue/amber/magenta spotlights, snowflake cue, hidden owl,
and physical Focus Star are the north star. The child-facing field contains no
emoji, SVG, canvas-drawn illustration, CSS shape, CSS gradient, or generic
rounded-card art. CSS/DOM supplies layout, hit regions, focus outlines, masks,
opacity, and motion only. Functional words remain HTML on authored clay
carriers; the title and `FREEZE!` are reviewed graphic lockups.

| Runtime asset | Master target | Visible use / interaction substrate |
| --- | --- | --- |
| `assets/scenes/forest-day.webp` | 1600×1200 opaque | persistent 4:3 forest stage / cover-fit screen plate |
| `assets/scenes/forest-night.webp` | 1600×1200 opaque | same geometry, colored reward lighting / end plate |
| `assets/ui/title.webp` | ≤1200×460 alpha | exact splash lockup / noninteractive image |
| `assets/ui/freeze.webp` | ≤1050×340 alpha | exact freeze cue / noninteractive image |
| `assets/characters/pip-*.webp` | normalized 720×820 alpha | dance, freeze, cheer, star, tall, tiny, wide poses / image transforms only |
| `assets/animals/*-hidden.webp` | ≤360×360 alpha | four embedded peek states / ≥120px invisible buttons |
| `assets/animals/*-reveal.webp` | ≤560×640 alpha | round/reward reveals / image transforms only |
| `assets/ui/mode-*.webp` | 520×420 alpha | three illustrated clay cards / button hit boxes |
| `assets/ui/camera.webp`, `skip-star.webp` | 300×300 alpha | camera choice actions / buttons |
| `assets/ui/mirror-frame.webp` | 560×420 alpha, open center | camera preview carrier / live `<video>` behind it |
| `assets/ui/prompt-plaque.webp` | 900×210 alpha | functional spoken prompt carrier / HTML text overlay |
| `assets/ui/action-button.webp` | 900×280 alpha | Play/Again carrier / HTML text overlay |
| `assets/ui/focus-star.webp` | 650×650 alpha | end reward and progress / images |
| `assets/ui/snowflake.webp`, `music-note.webp` | ≤480×480 alpha | phase cues / images |
| `assets/ui/sparkle-*.webp`, `confetti-*.webp` | ≤160×160 alpha | repeated authored particles / DOM images moved by CSS |

All nondeterministic masters stay under `assets/source/`; transparent masters
are inspected on saturated magenta before deterministic trim, shared-scale
normalization, resize, and WebP encoding. Full prompts, seeds, model path,
processing, license, and rejection history live in `ASSETS.md`.

## Audio and motion

- Recorded synthetic platform teacher voice is the primary instruction channel.
- Dance music uses the existing shared instrument samples through
  `shared/js/music.js`; it stops exactly on the freeze cue and ducks under
  narration.
- Shared `sfx.js` adds only tactile pops, sparkles, and the final tada.
- Authored raster sprites carry every visible particle/effect. Motion is large
  enough to read at tablet distance and becomes static under reduced motion.

## Camera, privacy, permission, and fallback

- No camera request occurs on load, splash, or automatic mode entry.
- The child or grown-up explicitly taps the camera asset before request.
- Video is muted, inline, front-facing when available, and processed only in a
  small transient 2D canvas. No frame is serialized or exposed by debug hooks.
- Permission denial, missing APIs, play failure, late permission resolution,
  backgrounding, or stream loss stops every track and enters the full no-camera
  route.
- Leaving play or visiting the splash closes the stream immediately. Returning
  never silently reacquires it.
- The game never claims to see a body, pose, identity, face, emotion, correct
  freeze, or full-body movement.
- A privacy line remains visible on the choice/warm-up screen for grown-ups:
  “Camera stays on this tablet. Nothing is recorded or saved.”

## Explicit departures

### From the brief

- Camera frame difference replaces full-body pose recognition and trajectory
  claims. Browser-only pixels cannot fairly identify bodies or grade a freeze.
- Motion feedback is expressive but never a success gate. False movement from
  light or a bumped stand therefore cannot punish a child.
- The session is 3–6 minutes rather than 10–15 minutes, matching platform loop
  guidance and leaving the child wanting another dance.

### From the mockups

- Functional changing instructions use exact HTML on physical raster clay
  plaques rather than generated baked text.
- The settings gear is omitted; camera choice and sound replay are direct,
  visible actions with no adult menu between the child and play.
- Three mode cards precede the reference’s single Play button so the game is a
  replayable family, not a one-off.

### From the beta

- The `coach-timer` emoji/card prototype is fully replaced by a custom game.
- Claymation replaces the mismatched Paper Garden background.
- Automatic timed prompts become a real dance/freeze/search/statue runtime with
  optional camera response, recorded voice, music, authored art, and a complete
  QA surface.

## `QLOBE_DEBUG` and release gates

`window.QLOBE_DEBUG` v1 exposes readiness, mode listing/start, deterministic
seed, current screen/phase/round, target truth, current prompt, camera
permission/mode, coarse motion summary (never frames), audio log, real-handler
tap, round completion, timer scaling, mute, and home.

Release requires:

1. every mode and every screen complete with camera off;
2. fake-camera live, denied, unavailable, lost-stream, and late-grant paths;
3. all camera tracks stopped after back, home, hidden, and pagehide;
4. portrait, 4:3 landscape, wide/short, and reduced-motion captures;
5. recorded clips proven as clips in real Chrome, with zero remote requests;
6. ≥96px meaningful targets and neutral scenery taps;
7. exact registry/manifest agreement and zero new validator errors;
8. blind side-by-side visual review against all three reference screens;
9. rejection of any screen containing placeholder/emoji/CSS/vector art;
10. real iPad child playtest before status moves from `beta` to `live`.
