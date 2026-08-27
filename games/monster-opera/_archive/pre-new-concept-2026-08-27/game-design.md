# Monster Opera — production game design

Canonical art-direction label: **Kawaii**. Ages 3–5, intentionally younger
than the platform default because the play loop is direct cause-and-effect,
requires no reading, and uses only large single-finger targets.

## Product promise

Eight fuzzy monsters each own a funny, musical voice. A child can meet one
singer, build a consonant chorus, or send the group onto a flower, cloud, or
moon stage for a tiny opera that is always worth replaying.

One learning promise joins all three modes: **hear how pitch, timbre, rhythm,
and layers combine into music**.

## Why this replaces Song Story Remix

`song-story-remix` is a generic choose-one prototype: the child listens to a
long verbal prompt and finds one correct emoji. It mentions songs but never
lets the child make music. Monster Opera replaces that registered prototype
with direct, pre-reader-friendly music play. It keeps the category slot's
singing/composition intent while removing quiz structure and familiar-song
dependency.

The new game uses its own honest id, `monster-opera`; the old
`song-story-remix` registry entry and prototype folder leave the production
catalog in the same change.

## Modes

| id | title | one skill | 30–90 second loop |
| --- | --- | --- | --- |
| `solo` | Sing with Me | compare low, middle, and high pitch in one timbre | choose a monster, choose a pitch, tap it to sing, then try another pitch or singer |
| `chorus` | Make a Chorus | hear how distinct musical roles layer | tap 2–5 singers on, preview each voice, then press Play All to hear the parts enter together |
| `stage-show` | Pick a Stage | arrange a short call-and-response performance | choose cloud, garden, or moon; begin a 15-second show; tap singers live and replay the captured sequence |

There is no wrong answer, score, countdown pressure, locked content, or
completion threshold. Every combination uses a C-major pentatonic note map so
simultaneous taps remain friendly.

## Screen map and navigation

1. **Splash / overview** — decorative `Monster Opera` title lockup, eight
   monster portraits, central play button. Home in the top-left is the only
   catalog exit; sound in the opposite corner toggles all channels.
   - Central Play starts `chorus` with the five primary singers selected.
   - Any monster portrait starts `solo` on that singer.
   - First real gesture unlocks every audio channel and speaks the short intro.
2. **Make a Chorus** — 4×2 large portrait grid and Play All.
   - Tap a portrait: a compact gold check badge toggles, the portrait squishes, and that
     singer performs one signature phrase immediately.
   - Up to five are active at once. Selecting a sixth gently releases the
     oldest selection; nothing flashes red or says “wrong.”
   - Play All starts `show` using the current stage. With no singer selected,
     Play All and Stage are disabled until the child chooses one.
   - Stage button opens the stage picker; Back returns to splash.
3. **Sing with Me** — one oversized active monster, portrait rail, three
   picture-only pitch buttons (high arrow, middle dot, low wave).
   - Tap a portrait to swap the active timbre.
   - Swipe the oversized singer left/right to move exactly one place through
     the cast and hear the newly chosen voice; a short movement remains a tap.
   - Tap a pitch to preview that register and update the glowing ripple color.
   - Tap the monster / sing button for a 2–4 note phrase. Each repeated tap
     rotates through curated pentatonic phrases, so drumming stays musical.
   - Back returns to splash.
4. **Pick a Stage** — cloud, garden, and moon scene cards plus the active cast.
   - Tap a scene to select it and hear a matching two-note sting.
   - Start Show enters performance. Back returns to chorus without losing cast.
5. **Full Choir / show** — chosen bitmap stage, 1–5 active monster sprites,
   minimal Back/Pause/Done/Replay controls, and a 15-second recording pill.
   - Parts enter one at a time over the opening four beats, then loop as a
     gentle call-and-response arrangement.
   - Tapping any visible singer adds its signature phrase and records a
     semantic event `{monster, pitch, phrase, at}` in memory.
   - Pause freezes both scheduling and the recording clock. Resume continues.
   - At 15 seconds the show settles automatically; Replay performs the exact
     captured event sequence locally. Nothing is uploaded and no microphone is
     used.
   - Done returns to chorus with the cast intact; Back returns to splash.

Navigation invariant: splash Home → catalog. Every deeper Back → in-game
splash. No hidden catalog link survives outside the splash screen.

## Audio production and musical system

### Original source policy

The three Dreamina concept videos were signal-audited. Each contains one lossy,
mixed AAC soundtrack and no isolated stem. At the user's request, eight short
individual-singer audition windows are shipped provisionally at low gain under
the tuned WebAudio layer; `ASSETS.md` records the exact windows and recipe.

The preferred clean-source upgrade is MiniMax H3 reference-to-video:

1. Crop a neutral portrait reference for each monster from the approved
   chorus mockup.
2. Generate a five-second static-camera solo performance with an explicit dry,
   isolated vocal prompt: one named syllable/register, no accompaniment,
   dialogue, crowd, or effects.
3. Extract mono 44.1 kHz audio from `output0`; retain the raw MP4 and recipe.
4. Use the local-only `tools/process-h3-audio.py` candidate pipeline to remove
   leading/trailing silence, retain at most 1.6 seconds (3.4 for coral's three
   pops), high/low-pass 90 Hz–8.5 kHz, normalize to −20 LUFS / −2 dBTP, add
   short 18/35 ms edge fades, and encode mono 44.1 kHz 96 kb/s MP3.
5. Run Whisper as an informational guard against accidental lexical speech,
   then require a human isolation listen. Elongated vowels, hums, and separated
   pops are not rejected by literal string similarity; spectral, peak,
   loudness, duration, and channel checks still reject an empty or malformed
   track.

Each runtime sample is a timbre source, not a fixed song. `js/monster-audio.js`
loads it into one AudioContext, schedules gain envelopes on a shared compressor,
and changes `playbackRate` onto the game's pentatonic pitch grid. Every source
uses the same clock, so layered entries stay synchronized. A generated source
failure falls back to a small warm oscillator/noise voice for that singer; core
play never becomes silent.

### Cast and roles

| id / color | character cue | musical role | source syllable | home register |
| --- | --- | --- | --- | --- |
| `mint` | striped horns, sprout tuft | warm harmony | `loo` | E4–A4 |
| `pink` | bow and candy horn | soprano melody | `la` | A4–E5 |
| `blue` | round ears, blue tuft | round vowel pulse | `doo` | G4–D5 |
| `purple` | spiral horns | mellow answer | `woh` | C4–G4 |
| `orange` | bear ears | bass rhythm | `bum` | C3–G3 |
| `yellow` | antennae | bell-bright accent | `li` | E5–A5 |
| `teal` | round ears | humming pad | `mmm` | C4–E4 |
| `coral` | little horns | comic rhythm pop | `bop` | G3–C4 |

The chorus scheduler uses short original phrases over C3, G3, C4, D4, E4,
G4, A4, C5, D5, E5. Bass/rhythm singers receive shorter envelopes; harmony
and pad singers receive longer overlaps; the soprano is mixed 2–3 dB lower so
it stays sweet rather than piercing.

### Spoken script (verbatim)

Teacher lines are short and optional; the monsters carry the experience. This
beta supplies the authored text to the shared narrator and uses Web Speech when
available. A recorded teacher-voice pack is deliberately deferred with the H3
clean-source pass and is not represented as shipping in this build:

- `intro`: “Monster Opera! Tap a monster and hear it sing.”
- `choose-singer`: “Pick a singer.”
- `choose-chorus`: “Tap some monsters to make a chorus.”
- `choose-stage`: “Where should the monsters sing?”
- `ready-show`: “Ready, monsters? Sing!”
- `high`: “High!”
- `middle`: “Middle!”
- `low`: “Low!”
- `full-cast`: “Five singers are ready. Tap one to swap.”
- `replay`: “Here comes your monster opera again!”
- `lovely`: “What a lovely monster song!”
- `again`: “Make another opera!”

## Visual direction and asset list

The approved five 1448×1086 mockups are the composition authority. Runtime
production follows their puffy plush/clay Kawaii dialect: mint-lavender skies,
cream glossy cards, plum outlines, candy-coral controls, golden selection
stars, enormous eyes, rosy cheeks, and soft studio light. No emoji, SVG, canvas
illustration, or CSS-drawn primary art is permitted.

Generated exact words are limited to the three decorative heading lockups and
were validated at full size. Functional button/status names remain semantic
HTML over blank authored raster plates, with accessible labels and spoken
audio.

| family | runtime assets | renderer / behavior |
| --- | --- | --- |
| backdrops | `splash`, `chorus`, `solo`, `cloud`, `garden`, `moon` | opaque WebP/JPEG, cover-fit with safe focal band |
| cast | eight transparent neutral, open-mouth, closed-eye, gaze-left, and gaze-right poses | authored 512×512 `<img>` sprites; CSS only positions/transforms those rasters |
| cards | eight authored card plates and gold selected star | bitmap buttons with ≥96 px semantic hit area |
| UI | three headings, coral/teal/recording plates, pitch discs, stage labels, selected badge, cast tray, replay/pause/resume controls | authored raster inside semantic HTML controls |
| effects | backdrop ripples/sparkles and heading music-note flourishes | baked authored raster; CSS only transforms existing images for feedback |
| social | `assets/og-image.jpg`, curated `assets/hub-tile.jpg` | derived from approved splash composition |

Source mockups, H3 keys/job manifests, generation prompts, extraction masters,
and QA evidence remain under `assets/source/` and `tools/`. H3 raw video is
retained there only after an authorized job succeeds; none is claimed in this
build. Runtime art is WebP/PNG and runtime audio is MP3; no authoring API request
occurs in the shipped game.

## Responsive layout and interaction

- Landscape uses the mockup's 4:3 composition nearly 1:1.
- Portrait reflows cards to a three-column grid, uses a dedicated 9:16 splash,
  makes the solo monster fill the upper half, and places show controls below the
  stage. It does not letterbox a tiny landscape UI.
- Every child control has at least a 96×96 CSS-pixel hit region even when its
  bitmap art is visually smaller. Safe-area variables protect corners.
- Static controls use `onTap`. The solo star uses the shared constrained DOM
  gesture helper with 14 px slop and a 36 px horizontal release threshold, so
  one primary-pointer path truthfully distinguishes tap from left/right swipe.
  Rapid taps remain musical; state transitions use a busy latch.
- Authored singing poses flap on scheduled notes, one visible neutral singer
  blinks periodically, and pointer position adds a subtle whole-sprite lean.
  These effects swap/transform raster art; they do not draw replacement faces.
- `installUnlockOnGesture` fans out to monster audio, clips, speech, and SFX;
  `installKioskGuards` handles tablet gestures and foreground audio recovery.
- Reduced motion removes singer bounces and CTA heartbeat animation. Selection
  state, clock, and audio remain functional.
- Any child touch postpones an idle nudge. A first nudge replays the current
  instruction; a second models one singer. Nothing times out into failure.

## Privacy, persistence, and failure behavior

- No microphone, camera, account, analytics beyond the platform pageview,
  network model call, or upload is used at runtime.
- The most recent semantic performance is kept in memory only. Refreshing the
  page clears it.
- Missing image: retain accessible button and soft color backing.
- Missing sample/decode failure: use that monster's oscillator fallback.
- Audio permission or mute: visual mouth/ripple feedback still makes every tap
  legible.
- Storage is not required; offline play is complete after static files load.

## Shared systems and local modules

Shared: `voice-clips.js`, `audio-unlock.js`, `tap.js`, `screens.js`,
`narrator.js`, `sfx.js`, `timers.js`, `idle-nudge.js`, `preload.js`, `dom.js`,
`debug-harness.js`, `stage/constrained-gesture-dom.js`, `base.css`, `hud.css`,
and `screens.css`.

Local:

- `js/monster-audio.js` — buffer loading, pitch mapping, synchronized phrases,
  mute/stop/unlock, event log, deterministic fallback voices.
- `js/main.js` — screen/state orchestration and same-path semantic actions.
- `tools/generate-media.py` — dry-run/resumable MiniMax authoring and Whisper
  jobs; it does not extract H3 audio.
- `tools/process-h3-audio.py` — local-only H3 extraction, normalization,
  waveform/spectrogram evidence, and technical candidate recipes.
- `tools/build-h3-audio-handoff.mjs` — synchronizes completed H3/Whisper
  evidence into candidate recipes and builds the redacted report plus local
  human audition page.
- `tools/extract-concept-samples.sh` — exact provisional audio windows plus
  trim/filter/normalize/encode recipe.
- `tools/repair-alpha.py` — preserves the exterior feather while making
  enclosed facial and detail pixels fully opaque before cast export.
- `tools/finalize-{cast,cards,facial-poses}.sh` and
  `tools/prepare-reference-art.sh` — deterministic source
  split/crop/patch/resize/encode steps.
- `tools/build-{visual,audio}-handoff.mjs` — adjacent game-local recipes and
  aggregate machine-readable QA inventories.
- `tools/qa.mjs` — production Chrome, touch, responsive, audio, and state QA.

## `QLOBE_DEBUG` contract

`window.QLOBE_DEBUG` v1 exposes:

- standard `ready`, `listModes`, `startMode`, `getState`, `getTargets`, `tap`,
  `winRound`, `mute`, `seed`, `fastTimers`, and `home`;
- `getState()` adds `{screen, mode, stage, selected, activeMonster, activePose,
  pitch, showPhase, showElapsed, paused, pausedByVisibility, recordedEvents,
  audioReady}`;
- `getAudioLog()` returns scheduled monster events including actual sample vs
  fallback source, pitch, start time, and gain;
- `playMonster(id, pitch)`, `swipeSolo(direction)`, `blinkMonster()`,
  `selectStage(id)`, `finishShow()`, and `replayPerformance()` drive or expose
  the same behavior as child-facing controls.

QA must prove every mode, selection cap and empty-selection rejection,
pause/resume, visibility-loss pause/freeze until explicit resume, semantic
replay restart, keyboard-only audio unlock/scheduling, all three pitches and
stages, eight decoded samples, mute, navigation invariants, 96 px targets, the
32 authored singing/blink/gaze pose WebPs, a real pointer swipe, pose
transitions, landscape/tablet/phone/wide-short/reduced-motion pixels, zero
console errors, and zero failed local runtime requests. The current
installed-Google-Chrome suite passes 73/73.

## Departures and release gate

- The brief's record feature becomes **semantic local replay**, not microphone
  recording. It preserves the “play this for a parent” fantasy without child
  voice capture, permission friction, or a stored biometric recording.
- The concept's people/settings affordance is not a production requirement.
  The game follows the platform's Home/Sound HUD convention and has no account,
  saved child media, or settings surface that would justify a parental gate.
- The concept video look remains gameplay reference; the canonical Kawaii
  mockups control production art.
- The concept videos' mixed soundtracks are rejected as clean masters, but eight
  provisional audition cuts honor the user's request to try their monster
  sounds. After explicit user authorization, all eight prepared references were
  uploaded to the configured LAN H3 workflow, all eight clean-source candidates
  passed the automated extraction gate, and all eight completed informational
  LAN Whisper QA. They remain outside runtime until the required human
  dry-vocal/isolation listen accepts them.
- Stage selection is promoted from “future expansion” because it completes the
  mockup's fantasy and adds meaningful replay variation without teaching a
  second skill.

The game may enter `beta` with eight documented provisional concept timbres plus
the tuned original fallback layer after every runtime asset decodes, installed
Chrome QA passes all modes in landscape/portrait/wide-short/reduced motion, an
independent adversarial art review clears the screens, the 71-image and
eight-audio handoff inventories pass, and production smoke has zero local
errors/404s. `live` requires human approval of the generated H3 candidate set
(or an accepted replacement), a real-iPad child playtest, and the user's
sign-off.
