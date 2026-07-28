# Sound Painting — asset log

All model calls are authoring-time only. The shipped game is static and makes
no runtime request to a model, API, CDN, camera, or microphone.

## Runtime art

| Asset | Production source | Finalization | License |
| --- | --- | --- | --- |
| `assets/studio-bg.jpg` | GPT Image 2 papercraft style transfer, selected from the two retained candidates under `assets/source/gpt-image-2/` | 1448×1086 source resized to 1400×1050 progressive-compatible JPEG, 220 KB | CC BY 4.0 |
| `assets/hub/tiles/sound-painting.jpg` | QLOBE Studio `menu-game-tile`, `krea2-turbo-t2i`, seed 42; accepted in Studio | accepted 768×640 source resized/cropped to 640×533 JPEG, 40 KB | CC BY 4.0 |
| Musical ribbons, paper daubs, stars, palette, and controls | Original deterministic Canvas/CSS authored for this game | resolution-independent runtime rendering | CC BY 4.0 |
| Shared HUD buttons | QLOBE Kids shared UI library | reused unmodified | CC BY 4.0 |
| Fredoka SemiBold | Fontsource / Google Fonts | reused unmodified | SIL OFL 1.1 |

The user-supplied “Storybook World” image was used only as a visual style
reference for layered cardstock, felt, fiber, cut edges, stitching, and soft
physical shadows. It is not copied, embedded, redistributed, or loaded at
runtime.

### GPT Image 2 prompts

`assets/source/gpt-image-2/studio-background-painted.png` is the first accepted
composition exploration. Its production prompt:

```text
Use case: stylized-concept
Asset type: 4:3 full-bleed background plate for a preschool tablet game called Sound Painting
Primary request: a magical nighttime art studio where music becomes glowing painted ribbons, designed as an environment behind real HTML game controls
Scene/backdrop: deep navy creative studio with softly curved painted-paper walls, a low rounded easel silhouette at the far left edge, a small color-wheel toy and chunky paint pots around the outer edges, delicate floating music-note shapes and star specks, and broad glowing cyan, coral, golden, magenta, and violet paint trails flowing around the perimeter
Style/medium: premium children's picture-book illustration, hand-painted gouache and colored pencil texture on warm paper, soft layered cut-paper depth, rounded simplified forms, cohesive with an imaginative preschool art app
Composition/framing: exact 4:3 landscape; keep the central 60 percent calm, dark, uncluttered, and low contrast for overlaid mode cards and title; visual energy concentrated around the borders; no foreground frame
Lighting/mood: magical, warm, welcoming, creative, never spooky; luminous paint is the light source
Color palette: deep ink navy, indigo, cyan, coral orange, sunny gold, electric magenta, violet
Constraints: environment only; no people, no characters, no hands; no interface controls; no title; no words; no letters; no numerals; no logos; no watermark; no borders; no legible notation; do not render a physical tablet or screen; avoid photorealism and avoid harsh neon cyberpunk styling
```

`assets/source/gpt-image-2/studio-background-paper.png` is the selected runtime
source. GPT Image 2 used the prior background as the content/composition
reference and the user image as the material/style reference:

```text
Use case: style-transfer
Asset type: 4:3 full-bleed background plate for the preschool tablet game Sound Painting
Primary request: reinterpret the approved Sound Painting studio entirely as premium handmade papercraft while preserving its calm empty center and music-becoming-painted-ribbons fantasy
Scene/backdrop: deep navy layered paper studio; a low easel silhouette at the far left; chunky paper paint pots, paper brushes, and a segmented color-wheel toy near outer edges; flowing cyan, coral, gold, magenta, and violet musical paint ribbons around the perimeter; tiny hanging paper stars and abstract music-note shapes
Style/medium: layered construction paper, cardstock, felt, and cut-paper collage inspired by the reference image; visible paper fibers, softly rounded die-cut edges, tiny stitched/dashed seams on a few cream accents, slight handmade imperfections, stacked layers with soft tactile shadows, child-safe toy proportions; no glossy digital neon and no photorealism
Composition/framing: exact 4:3 landscape; keep the central 60 percent calm, dark navy, uncluttered, and low contrast for real HTML title and mode cards; put decorative craft detail around the borders; no foreground frame
Lighting/mood: warm tabletop studio light, magical, cozy, creative, welcoming, never spooky
Color palette: ink-blue cardstock base with cyan, coral orange, sunny yellow, magenta, violet, cream accents
Constraints: environment only; no people, animals, characters, or hands; no interface, title, words, letters, numerals, logo, watermark, border, physical tablet, or legible notation
```

### Local Krea hub recipe

The accepted source and Studio recipe are retained at
`assets/source/local-api/hub/`. Exact subject:

```text
Three chunky child-sized magic paintbrushes sweeping glowing cyan, sunny
yellow, and magenta ribbons across a dark navy tabletop, with a round
color-wheel toy and a few bright musical sparkle shapes arranged as tactile
objects.
```

The QLOBE `menu-game-tile` template appended its proven Toy Table suffix and
rendered 768×640 at seed 42. Studio QA status is `accepted`.

## Voice

`tools/gen-voice.py` derives `assets/audio/lines.json` from `config.json`,
batches all 13 lines through `qwen3-tts-voiceclone` with the approved shared
teacher reference at seed 7, encodes mono 24 kHz AAC/M4A, then batches every
final clip through `whisper-stt`.

Twelve lines passed transcript QA and appear in the runtime manifest. The
`sparkle-prompt` line was retried at seeds 8 and 9: both said the important
action word “swish” correctly but Whisper consistently heard singular “star”
instead of scripted plural “stars.” Both takes were rejected, the runtime M4A
was omitted, and `voice-clips.js` speaks the exact fallback instead.

- Nondeterministic FLAC sources and transcript JSON:
  `assets/source/local-api/voice/`
- Runtime manifest: `assets/audio/manifest.json`
- Transcript QA: `assets/audio/qa.json`
- Runtime fallback: `shared/js/voice-clips.js` speaks the exact config line
  when a clip is absent or rejected.

## Link preview

`assets/og-image.jpg` is a screenshot-derived preview. Regenerate it after the
final production capture rather than editing it by hand.
