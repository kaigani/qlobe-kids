# Texture Trail — production game design

## Product promise

Texture Trail turns four tactile words into a tiny clay-garden expedition. A child
first explores a large material sample and familiar objects, then follows a trail
made from that same material while Pip the snail travels beside their finger.
Every round can be understood from the picture, spoken prompt, and glowing start
stone without reading.

- **Audience:** ages 4–6, tablet first.
- **Category:** `sensorial-science`.
- **Canonical art direction:** **Claymation**.
- **Session shape:** one 30–60 second trail, or four trails in roughly 3–5 minutes.
- **Status:** `beta` until a real child completes every texture on the target iPad.

## Learning design

The family teaches one idea: surfaces can be described and grouped by how they
feel. Each mode isolates one texture word and one motor character:

| Mode | One skill | Motor character | Examples |
| --- | --- | --- | --- |
| Bumpy | recognize and say *bumpy* | distinct stepping contacts | raspberry, pinecone |
| Smooth | recognize and say *smooth* | one calm continuous sweep | egg, river pebble |
| Ridged | recognize and say *ridged* | back-and-forth zigzag | shell, ribbed cushion |
| Soft | recognize and say *soft* | slow rounded spiral/pats | cloud cushion, feather |

Color reinforces the four families but never carries the answer alone. Relief,
silhouette, pattern, examples, and narration keep the textures distinguishable.

## Screen map

```text
catalog
  → splash / texture garden
      → explore texture + tap examples
          → follow trail
              → trail complete
                  → again (same texture)
                  → next (next texture)
                  → choose (splash)
```

- **Splash:** full-bleed clay garden, generated title lockup, Pip waiting, four
  authored tactile cards. Home is the only catalog link. A first gesture unlocks
  every audio channel and starts the quiet shared music bed.
- **Explore:** one giant authored texture card, two authored familiar objects,
  Pip pointing, and a green physical start plaque. Tapping the card or either
  object speaks/models the word and gives a small material response. The child
  can stay and explore indefinitely.
- **Trail:** a fixed-aspect garden clearing with 11 authored stepping-stone
  sprites arranged on one of two seeded paths. Short landscape uses a dedicated
  seven-step version of each material path so the art stays separated without
  shrinking the 96 px hit targets. A raster green guide badge identifies the
  next stone; each passed stone earns a small clay star while Pip advances.
  Dragging through the path or tapping the next stone uses the same attempt
  handler.
- **Complete:** the entire path brightens, Pip celebrates, raster clay stars and
  pellets burst, the earned medallion arrives, and narration invites a real-room
  texture hunt. Again, next, and choose remain available; guided play advances
  only after the child chooses.

Navigation follows the platform contract: splash Home returns to the catalog;
all deeper screens use Back to return to this game's splash.

## Core interaction

1. Tap a tactile card.
2. Hear and explore the texture with two concrete examples.
3. Tap the large start plaque.
4. Begin at the glowing first stone.
5. Slide through the next stones or tap them one by one.
6. Each correct contact squashes the authored sprite, plays a soft tactile SFX,
   advances Pip, and uses a tiny vibration where the browser supports it.
7. Touching a later stone out of order is never a failure: the expected stone
   pulses and Pip gives a gentle hint.
8. Finish with coordinated motion, material change, voice, SFX, and raster clay
   celebration pieces.

The path controller owns one primary pointer, listens at `window`, preserves the
pointer id, and treats `pointercancel`, blur, and screen exit as cancellation.
Visible marker rasters scale inside 96-112 px semantic buttons, and continuous
tracing uses a forgiving center radius of at least 58 px (a 116 px diameter).

## Voice script (verbatim)

| Key | Spoken line |
| --- | --- |
| `welcome` | “Welcome to Texture Trail! Choose a texture to explore.” |
| `choose` | “Pick a texture. Bumpy, smooth, ridged, or soft.” |
| `bumpyExplore` | “Bumpy has little hills you can feel. The raspberry and pinecone are bumpy.” |
| `bumpyTrail` | “Start at the glowing purple bump. Follow every bumpy step.” |
| `bumpyNudge` | “Find the glowing bumpy step. Tap it, or slide your finger.” |
| `bumpySuccess` | “Bump, bump, hooray! You finished the bumpy trail. Can you find something bumpy nearby?” |
| `smoothExplore` | “Smooth feels even, with no bumps. The egg and river pebble are smooth.” |
| `smoothTrail` | “Start at the glowing green pebble. Glide along the smooth trail.” |
| `smoothNudge` | “Find the glowing smooth pebble. Tap it, or glide your finger.” |
| `smoothSuccess` | “Swoosh! You finished the smooth trail. Can you find something smooth nearby?” |
| `ridgedExplore` | “Ridged has raised lines. The shell and ribbed cushion have ridges.” |
| `ridgedTrail` | “Start at the glowing orange ridge. Zigzag along the ridged trail.” |
| `ridgedNudge` | “Find the glowing ridged step. Tap it, or slide your finger.” |
| `ridgedSuccess` | “Zip, zag, hooray! You finished the ridged trail. Can you find something ridged nearby?” |
| `softExplore` | “Soft feels gentle and squishy. The cloud cushion and feather are soft.” |
| `softTrail` | “Start at the glowing blue puff. Follow the soft, curvy trail.” |
| `softNudge` | “Find the glowing soft puff. Tap it, or slide your finger.” |
| `softSuccess` | “So soft! You finished the soft trail. Can you find something soft nearby?” |
| `completeChoice` | “Trace it again, or choose a new texture.” |

Recorded Qwen teacher-voice clips are primary. `voice-clips.js` falls back to
these exact lines through Web Speech when a clip is absent or rejected.

## Art inventory and renderer contract

Every primary visible object is an authored raster. CSS/DOM supplies layout,
hit regions, state, clipping, focus, and transforms only.

| Asset | Visible renderer | Interaction substrate |
| --- | --- | --- |
| garden world | optimized GPT Image 2 WebP | cover-fit screen background |
| title | transparent GPT Image 2 raster lockup | responsive `<img>` |
| Pip poses (wait, point, cheer, hint) | cut transparent raster sprites | responsive `<img>` and transforms |
| four selection cards | cut tactile raster plaques | semantic buttons |
| four trail-marker families | cut tactile raster sprites, repeated | positioned buttons/hit circles |
| prompt and action plaques | cut blank raster carriers | HTML text and button semantics layered above |
| eight example objects | cut transparent raster miniatures | semantic explore buttons |
| medallions and celebration pieces | cut transparent raster sprites | completion layout and seeded animations |
| hub tile | curated 6:5 raster scene | root registry image |

All contact sheets are processed with `tools/cut-asset-sheet.py` using an exact
count, then inspected on saturated magenta. Runtime images are deterministic
WebP/PNG derivatives; GPT Image 2 masters and prompt record stay under
`assets/source/`.

## Audio and music

- `voice-clips.js` + `narrator.js`: recorded teacher narration with exact-text
  fallback and cancellation on navigation.
- `sfx.js`: small pop/tick/sparkle/tada cues; no harsh buzzer.
- `bgm.js`: quiet shared recorded garden/forest music, preloaded before play,
  unlocked by the first real gesture, ducked beneath every narrated line,
  and stopped on teardown.
- A short `navigator.vibrate` cue is progressive enhancement only; play never
  depends on it.

## Responsive and accessibility behavior

- The authored world cover-crops, but the active 4:3 trail board is contained
  inside safe insets so start, goal, Pip, prompts, and HUD remain visible.
- Portrait stacks the prompt/explore copy above a large square-ish play field.
  Short landscape reduces decorative framing before it reduces target size.
- All functional words are HTML with strong contrast and an `aria-live`
  narrator mirror. Artwork carries no required reading.
- Primary targets retain a 96 px effective hit area. Keyboard activation uses
  the same semantic attempt handler.
- Under `prefers-reduced-motion`, moving/Pip transitions and star bursts become
  immediate state changes; voice, SFX, pressed states, and color/material
  changes remain.

## Replay variation

Each texture has two reviewed 11-stone routes plus a seven-stone compact route.
A seeded generator selects the full-size route and example order, so repeat play
varies while `QLOBE_DEBUG.seed(42)` is fully reproducible. Completing a trail
records only session-local progress; there is no account, upload, or required
persistence.

## `QLOBE_DEBUG` v1

The shared debug harness exposes readiness, mode listing, deterministic mode
start, seed, mute, fast timers, state, and truthful visible targets. Extensions:

- `tracePoint({ x, y, phase })` uses the real pointer/attempt path in normalized
  playfield coordinates;
- `completeTrail()` advances through the real ordered-marker handler;
- `tapMarker(index)` exercises the same handler as a child tap;
- `getLayout()` returns marker and playfield bounds;
- `getAudioLog()` proves recorded clip playback;
- `winRound()` is an alias of deterministic real completion, not a state jump.

## Departures and reasons

- The emoji match-pairs beta is replaced completely. It taught imagined object
  pairing but did not deliver the concept's tactile trail fantasy or art world.
- The mockup's settings gear is omitted; platform Home/Back/Sound controls are
  enough and keep one dominant action.
- Percentage completion is replaced by eleven material stones. A pre-reader can
  see progress directly without interpreting a number.
- “Great Job” is not baked into generated art. Completion is communicated by
  Pip, the transformed trail, medal, narration, and an accessible HTML heading.
- Prickly is reserved for a future supervised expansion. This version focuses
  on four safe, easily modeled tactile families and never prompts a child to
  touch a hazardous object.

## Release gate and known risks

- Zero console errors, failed requests, or validator regressions.
- Recorded clips must report `kind: "clip"` in real Chrome after a gesture and
  every shipped transcript must pass review; rejected lines fall back safely.
- Exact-count cuts, alpha masks, full-size assets, and portrait/landscape/short
  landscape screenshots receive adversarial art-direction review.
- The game stays `beta` until a child playtest confirms that tracing tolerance,
  pacing, words, and the four texture distinctions work on the target iPad.
