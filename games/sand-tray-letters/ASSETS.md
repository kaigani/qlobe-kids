# Asset Log — Sand Tray Letters

## Generated material art

The three selection-card images were generated with the built-in GPT Image 2
workflow on 2026-07-13, then resized to 640 × 640 PNG for game delivery.

| Asset | Use | Prompt summary |
|---|---|---|
| `assets/materials/golden-sand.png` | Golden Sand card | Friendly centered mound of fine golden play sand on a sunny-yellow background; tactile polished children’s game art; no text or extra objects. |
| `assets/materials/white-salt.png` | White Salt card | Rounded glass jar of coarse salt crystals with a wooden lid on turquoise; tactile polished children’s game art; no text or branding. |
| `assets/materials/soft-flour.png` | Soft Flour card | Rounded wooden bowl of powdery white flour on violet; tactile polished children’s game art; no text or branding. |

Original built-in outputs remain in Codex’s generated-image store. The project
copies above are the production assets consumed by `index.html`.

## Prize ceremony assets (shared)

The letter-completion ceremony reveals a prize from a gift box. Both asset sets
are **shared** (reusable by any alphabet game) and referenced via
`shared/js/content.js`; emoji fallback covers anything not yet generated.

- `shared/assets/prizes/box-{red,blue,green,yellow,purple}.png` — 5 wrapped gift
  boxes (transparent PNGs, dark-bg generation → layered extraction).
- `shared/assets/objects/<word>.png` — 3 curated prize objects per letter
  (78 total, e.g. turtle/tiger/train), same pipeline; the set is defined in
  `shared/data/letter-objects.json`. Some reuse existing picture cards.

## Splash background

`assets/scene/welcome-bg.jpg` — a soft papercraft/felt rolling-hills scene (blue
sky, clay clouds, layered green hills, bushes) generated with `krea2-turbo-t2i`
to match the original welcome mockup, replacing the earlier CSS gradient + CSS
cloud/hill shapes. 1216×832, JPG ~119 KB. No characters, text, or UI baked in;
the welcome card and controls sit on top.

## Procedural game visuals

The live tray does not use a static texture. `js/game.js` generates material
gradients and thousands of deterministic grain marks on an offscreen canvas,
then renders dynamic grooves, displaced edge grains, guides, progress points,
and the turquoise underlayer in real time.

## Recorded voice

`assets/audio/` holds recorded teacher-voice clips (voice-clone of the platform
teacher reference, whisper-QA'd), played via `shared/js/voice-clips.js` with a
Web Speech fallback. Set:

- Chrome/prompts (welcome, choose-tray, trace-this, follow-arrows, next-letter,
  next-stroke, start-dot, stay-near, smooth-ready, shake-next, finish, three
  material names) — generated for this game.
- `praise-<A..Z>` (26) — the alliterative success line; for the 19 consonants it
  ends on "<X> says" and hands off to the phonic clip below.
- `tap-box` — "Tap the box to open your prize!", played after the praise when
  the gift box appears.
- **Prize reveal lines** — "You won a turtle. T is for turtle." style, one
  recorded sentence per prize object, stored **shared** at
  `shared/assets/audio/prizes/<word>.m4a` (78, whisper-QA'd) and played by word
  via `content.prizeAudio` / `voice.sayFile`. Web Speech speaks the identical
  line for any prize whose clip is not yet present.
- `sound-<X>` (19) — **referenced directly from the shared phonics library**,
  not copied: the manifest points these entries at
  `../../shared/assets/audio/fragments/<x>.m4a`, so there is one canonical copy.
  The seven letters without a fragment (A E I O Q U X) carry the phonic inside
  their praise clip instead.

`manifest.json` + `lines.json` drive playback and fallback text; the
`sound-<X>` entries resolve to the shared library (no local audio duplicates).

## Shared assets

| Asset | Source | License |
|---|---|---|
| Fredoka SemiBold | `shared/fonts/fredoka-latin-600-normal.woff2` | SIL OFL 1.1 |
| Home, back, and sound buttons | `shared/assets/ui/` | QLOBE Kids shared library, CC BY 4.0 |
| Sound effects | `shared/js/sfx.js` | Synthesized at runtime |
| Phonic letter sounds (referenced, not copied) | `shared/assets/audio/fragments/<x>.m4a` (Sound Sprouts) | QLOBE Kids shared library, CC BY 4.0 |
| Recorded-voice player + Web Speech fallback | `shared/js/voice-clips.js`, `shared/js/speech.js` | — |

## External concept reference

- `sand-tray-letters/brief.md`
- `sand-tray-letters/dreamina-2026-07-12-7073-Tablet game demo for ages 5-6. Fast adve....mp4`
- `sand-tray-letters/output/ui-mockups/01-welcome.png` through `05-success-shake-reset.png`

These references live in the QLOBE concepts project and are not runtime assets.
