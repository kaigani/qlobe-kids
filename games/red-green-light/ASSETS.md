# Red Light, Green Light — Assets

This game ships **original video-puppet callers**: muppet-style characters who
say the movement cues in their own voice. Every asset below was generated
locally (no third-party or network assets at runtime) and is released under
**CC BY 4.0** (code is MIT). UI buttons, fonts, and SFX come from `shared/`.

## Caller roster

Each caller in `assets/callers/<id>/` has:

- `poster.jpg` — select-screen tile + video poster/fallback frame (640px wide, ~25KB).
- `green.mp4` `red.mp4` `yellow.mp4` — cue clips, the caller's voice baked in.
  Green/yellow loop (bop/wiggle to invite movement); red holds its last frame
  (freeze). h264, 832px wide, ~3s, ≤~600KB each.
- `greet.m4a` `cheer.m4a` — spoken lines for the select preview and end screen.

| id | character | setting | voice |
|------|-----------|---------|-------|
| growlie | fuzzy blue monster puppet | sunny jungle clearing | big goofy rumble |
| twinkle | sparkly pink flower-fairy puppet | glowing flower garden | bright chimey |
| bolt | googly-eyed robot | neon space station | bouncy beep-warm |
| gilly | green sea-monster puppet | underwater coral cave | bubbly |
| ember | little dragon | castle rampart | squeaky-brave |
| pip | one-eyed purple fuzzball | candy land | silly high |
| zoom | superhero bunny puppet | city park | peppy heroic |
| luna | owl wizard | starry treehouse | gentle whimsical |

## Production pipeline (local GenAI API, private `/local-genai` skill)

1. **Portrait** — `krea2-turbo-t2i`, 1280×720, seed 42: a camera-facing muppet
   bust in-setting, mouth open (talking source frame).
2. **Voice** — the eight caller voices are performed by the author in one take
   (`00-reference/voices/all-voices-vocal.flac`, each character introducing itself
   in roster order). That recording is split into eight single-voice reference
   samples; `qwen3-tts-voiceclone` (seed 7) then renders each caller's five lines
   from its sample. Every clip QA'd with `whisper-stt` against the intended text.
3. **Talking video** — `ltx2-3` image→video with the voice clip as baked `audio`
   (`first_frame`=portrait, `static_camera=1`, 832×480, ~3s, seed 42). Chosen
   over `wan-infinitetalk` after a head-to-head: LTX gives full-puppet body
   motion (bobbing, hand-waving) that invites whole-body play, richer setting,
   smaller files, and ~3× faster generation, with baked audio.
   Every cue/idle clip pins `first_frame == last_frame == portrait`, so the
   caller returns to its resting pose — green/yellow loop seamlessly, red holds
   the still, and clips hand off cleanly to the silent idle loop.
4. **Post-process** (`ffmpeg`) — h264 yuv420p, `+faststart`, ≤960px, with the
   LTX audio **copied untouched** (`-c:a copy`). (An earlier `loudnorm` pass was
   upsampling the 24kHz voice to 96kHz and distorting it — removed.) Posters via
   frame extraction; `afconvert` FLAC→AAC m4a for the spoken greet/cheer lines.

**QA:** every baked line is checked with `whisper-stt` against its script. When the
voices came from the author's recording, the split needed one tweak caught this way —
Zoom's reference sample carried a trailing "Who?" that echoed onto its lines, so the
sample was trimmed shorter and Zoom re-cloned clean. Budget: each caller's play session loads
~0.7–1.0 MB (only the chosen caller's clips), largest single clip ~0.3 MB, well
under the ≤1.5 MB/clip rule; the select screen loads ~0.2 MB of posters.

## Spoken lines

- greet: "Hi there! Come play with me!"
- cheer: "Hooray! You did it!"
- green: "Green light! Go, go, go!"
- red: "Red light! Freeze!"
- yellow: "Yellow light! Wiggle, wiggle!"

## Screen design assets (`assets/`)

- `title.webp` — the "Red Light, Green Light / Pick your caller" logo (traffic-light
  mascots + banner), full-resolution 1024×576 transparent WebP shown on the
  caller-select screen. ~178KB (from the untouched original PNG; WebP keeps it crisp
  when displayed large). The frame's transparent top/bottom padding is reclaimed with
  negative margins so the title can be prominent without pushing the 4×2 grid.
- `bg.jpg` — the playground/racetrack world (rocket-slide, finish line, city
  skyline) used as the caller-select background; 1500px, ~278KB (≤300KB budget).

Both are original concept art supplied by the author (from the QLOBE concepts set),
optimized for the web (JPEG for the photo-real background; the title quantized to
preserve alpha). CC BY 4.0. The select screen renders on `bg.jpg` with the title
logo; mode/end screens use a soft blue dotted sky with a sunburst; caller tiles and
the mode/end caller card carry an accent **name pill**, and headings use a chunky
white-outlined treatment to match the title art.

## Shared assets used (not part of this game's license grant)

- `shared/assets/ui/` — btn-home, btn-back, btn-sound, btn-play.
- `shared/fonts/fredoka-latin-600-normal.woff2`.
- `shared/js/sfx.js` (pop/boing/silly/tada/tick), `shared/js/speech.js` (fallback voice).

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Generated screenshot of this game's own splash screen (1200×630), captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |
