# Asset Log — Shared style references

These five files are **style anchors**, not runtime assets. No game loads them.
They exist so that generation templates
(`shared/data/generate-templates.json`) can point a workflow at the picture or
the voice that defines a house style, instead of describing it in words alone
and hoping the model agrees.

They are referenced symbolically — a template writes `shared:refs/bus.png`, and
the authoring server resolves that against `shared/assets/` at enqueue time. A
reference is never stored as a machine path, so these files may be moved only by
editing the registry with them.

## The references

| File | Role | Size |
|---|---|---|
| `bus.png` | Toy Table object-card anchor — the canonical "bright soft 3D cartoon, toy-like glossy finish" look every picture card in `shared/assets/objects/` is matched against. | 1024 × 1024 PNG |
| `asset-b.png` | Blue **onset** letter tile — the chunky rounded tile face used across `shared/assets/letter-tiles/`. | 1024 × 1024 PNG |
| `asset-us.png` | Orange **rime** letter tile — the warm counterpart to the blue onset, so onset/rime stay visually distinct. | 1024 × 1024 PNG |
| `concept-screen.png` | Whole-screen anchor — a full game screen in house style. The scene/background and splash templates use it to keep composition, depth and palette on model. | 1672 × 941 PNG |
| `voice-teacher.wav` | The platform **teacher voice** reference. Every recorded line in `shared/assets/audio/` is a clone of this speaker; voice templates pass it as the clone reference so new lines match the existing library. | mono, 24 kHz, 11.98 s |

### `voice-teacher.wav` is FLAC, not RIFF

The file carries a `.wav` extension but its bitstream is **FLAC** (`fLaC` magic).
That is how it was produced and how it has been fed to the voice-clone workflow
throughout, so the extension is preserved deliberately rather than corrected —
renaming it would break the reference without changing a byte of audio. Anything
that opens it must sniff the container rather than trust the suffix; a strict
RIFF-only reader (Python's `wave` module, for one) will refuse it.

## Provenance

All five are **self-generated** with the local GenAI stack during Sound Sprouts
production, June 2026 — no third-party source, no scraped material, no
network service baked into the runtime.

- The four images were produced with the `qwen-image-edit` / `krea2-turbo-t2i`
  workflows, then kept as-is (no retouching) so they remain a faithful record of
  what the pipeline actually emits.
- `voice-teacher.wav` is a **synthetic** voice: designed with
  `qwen3-tts-voicedesign` at seed 7 from a written description of a warm
  preschool teacher. It is not a recording of a person, and no consent or
  likeness question attaches to it. Seed 7 is the reproducible identity of that
  speaker — the platform voice is that seed, and it must not be re-rolled.

License: **CC BY 4.0**, matching the rest of the QLOBE Kids original asset
library (`LICENSE-ASSETS`).

## Adding a reference

Only add a file here if a template needs it. Keep names lowercase and hyphenated,
add a row above and a provenance note, and reference it from the registry as
`shared:refs/<name>` — never as a path from outside the repo.
