# Art direction — one grammar, many worlds

Every QLOBE Kids game shares one interaction grammar: the same HUD buttons in
the same corners, the same Fredoka type, the same tap/drag patterns, the same
gentle-retry and celebration loops. A child who learned one game can play them
all. That never changes.

What SHOULD change is the world. Seventy-plus games in a single flat pastel
look reads as one long worksheet. So the play-field — the part inside the HUD
— wears one of a small set of named **art worlds**. Games in the same category
tend to share a world, which gives each shelf of the hub its own feel while
the platform stays cohesive.

## Canonical art-direction taxonomy

These are the six approved art-direction labels for concept briefs, UI
mockups, production design documents, and visual QA. Use the labels exactly as
written; an older runtime or template slug may be recorded alongside the label
but does not replace it.

### 1. Puppet / Cozy felt fabric
Handcrafted puppet-theater worlds built from wool felt, fleece, fabric, and
plush forms. Use visible blanket stitching, embroidered faces, fabric seams,
soft stuffing, painted wood, and warm theatrical lighting. This is the home for
puppet-led social-emotional scenes, oral storytelling, and tactile quiet-book
experiences.
- **Palette:** cranberry, warm cream, peach, mustard, coral, teal, lavender,
  and dark plum.
- **Material rule:** characters, props, rewards, and primary manipulatives
  should all feel sewn, padded, or puppet-made—not like generic glossy UI.

### 2. Toy
Clean, tactile toy objects on an airy field or an orderly Montessori tray. The
object IS the lesson: painted wood, molded toy forms, soft 3D cartoon geometry,
rounded safe edges, and restrained shadows keep attention on the task. The
existing `shared/assets/objects/` library is the canon for the Toy family.
- **Palette:** sky `#bfe3f5`, card white, navy line `#17517e`, plus the
  category accent.
- **Legacy names:** `Toy Table` and the runtime/template style id
  `toy-table` are the established Toy default.
- **Home categories:** reading-phonics, math-number-sense, matching/memory,
  practical-life, and object-based sensorial games.

### 3. Watercolor / Storybook
Illustrated story worlds on warm paper: hand-painted gouache or watercolor,
gentle ink or colored-pencil definition, visible paper grain, imperfect edges,
and soft washes. This category also contains the established illustrated-room
variant: rounded interiors with crisp navy outlines, one soft highlight, and
one contact shadow, with cut-out sprites that belong to the room.
- **Palette:** leaf greens, sky blues, earth browns, warm cream `#f7f1e3`,
  and gentle storybook accents.
- **Legacy names:** `Storybook`, `Storybook Rooms`, `Field Journal`, and the
  runtime/template ids `storybook`, `storybook-rooms`, and `field-journal`
  are variants or aliases of this canonical category—not additional worlds.
- **Home categories:** story, oral language, nature observation,
  culture-geography, and movement-outdoor games.

### 4. Claymation
Stop-motion-inspired worlds made from polymer clay or modeling clay: visible
fingerprints, sculpted seams, hand-shaped imperfections, matte-to-satin clay,
rounded forms, and warm studio light. Use this when material transformation or
squish/snap quality is part of the fantasy, not merely as a glossy 3D surface.

### 5. Papercraft
Layered construction-paper and cardstock collage with deckled or scissor-cut
edges, visible fibers, folded depth, occasional stitches, and soft physical
shadows. Paper, felt, and printed textures may mix when their layers remain
legible and handmade.
- **Palette:** saturated kraft-paper brights on warm cream, with jewel accents
  when the scene calls for them.
- **Legacy name:** `Paper Garden` and the runtime/template style id
  `paper-garden` are the established Papercraft variant.
- **Production anchor:** Sound Painting proves a nighttime Papercraft variant:
  ink-blue cardstock replaces the cream field while the cut edges, fibers,
  stacked layers, and saturated paper colors remain unchanged.

### 6. Kawaii
Original cute graphic worlds with highly expressive mascots, puffy or sticker
outlines, candy-color panels, scalloped cards, playful symbols, and oversized
touch targets. Glossy clay, vinyl, cardboard, or plush accents are allowed,
but the defining language is the friendly kawaii package—not a borrowed brand
or a generic glossy 3D app.
- **Palette:** bright primary and pastel colors, often with cream outlines,
  cocoa or dark-plum type, rainbow accents, and celebratory sparkles.
- **Material rule:** keep forms simple, readable, and non-photorealistic;
  exact runtime copy remains HTML/audio rather than baked into generated art.

## Story Screen (video layer, not a gameplay art world)

Short animated vignettes—preschool-TV warmth, soft rounded characters, static
camera—that set up a social moment or story beat before the child responds.
Use them as intros and round set-ups, never as passive viewing: watch a
6-second moment, then DO something about it. A Story Screen can accompany any
of the six canonical art directions, but it is not a seventh art world and
should not be used as a brief's art-direction label.
- **Format:** h264 mp4, ≤960px wide, ≤8s, target ≤1.5MB per clip, max ~2
  clips per game. Poster image required; playback starts from a tap (the
  splash tap satisfies autoplay rules).
- **Home categories:** social-emotional, oral-storytelling.

## Lighting variants are not new worlds

A game can be moody, dark, or lit-by-flashlight without inventing a seventh
world — that's a **lighting variant**, a legal per-game modifier of an
existing art world, not a new one. It qualifies only when both hold: (a) the
effect is applied at **runtime by a shared module** (e.g.
`shared/js/stage/spotlight.js` masking the play-field to a beam/pool of
light), not baked into per-game art; and (b) the **art plate itself stays in
the world's palette** — same outline weight, same hue family, same rendering
style, just seen through less light. Flashlight Cave is Watercolor /
Storybook (the legacy Storybook Rooms interior variant, with cut-out sprites
belonging to a full-bleed background) plus a
runtime night/spotlight pass — explicitly **not** a seventh world. If a new
game's mood tempts you to propose "Nighttime" or "Shadow World" as its own
entry in this doc, reach for a lighting variant on its home world's plate
style first; only propose a new world when the geometry and rendering style
genuinely differ, not just the lighting.

## Assignment rules

- Each game declares exactly one canonical art-direction label; the category
  default applies unless the game's design doc argues otherwise. Never mix
  worlds inside one game.
- The `brief.md` field `UI Mockup Art Direction` is the source of truth for
  concept screens. A concept video's visual treatment communicates gameplay
  only and does not override the selected art direction.
- The HUD, splash idioms, end screens, and interaction patterns are
  world-independent — worlds restyle the play-field only.
- Splash titles are **generated graphic lockups in the game's world style**,
  not HTML type — decorative painted lettering with world-appropriate
  ornaments (reference: Sink or Float Lab's watercolor title). Spell-check
  the art at full size; functional runtime text stays HTML.
- Cast characters (Maya, Leo, Nia, Sam, Ravi) appear in every world in their
  canonical designs; worlds restyle environments and props, not people.

## Implementation (Stage v2)

Engines accept an optional `theme` block in the game config (absence = Toy
Table, so all existing games are unaffected). During the taxonomy migration,
keep the existing runtime/template ids in code and record the canonical label
in the design docs. The current mapping is:

| Canonical label | Existing runtime/template ids or notes |
| --- | --- |
| Puppet / Cozy felt fabric | Use a game-specific stage/asset world until a generic id is added. `story-screen` and `story-screen-stage` are video/theater layer ids, not automatic Puppet aliases. |
| Toy | `toy-table` (Toy Table) |
| Watercolor / Storybook | `storybook`, `storybook-rooms`, `field-journal` |
| Claymation | No generic Stage v2 id yet; record `claymation` in the design docs. |
| Papercraft | `paper-garden` (Paper Garden) |
| Kawaii | No generic Stage v2 id yet; record `kawaii` in the design docs. |

When a new generic runtime world is implemented, add its slug and prompt
suffix to the shared template/style registry in the same change. Do not rename
legacy ids casually; they are already referenced by shipped configs.

```js
theme: {
  world: 'storybook-rooms', // legacy runtime id; canonical label: Watercolor / Storybook
  background: './assets/room.png',   // full-bleed play-field backdrop
  panel:  { fill: 0xfff8e8, stroke: 0xffffff },  // card/bin backing tokens
  accent: 0x8a5bc4,
}
```

The stage kit draws the backdrop layer; engines read the panel/accent tokens
where they currently hard-code fills. Sprite assets follow the standard
production pipeline (dark-background generation → layered extraction) in the
world's style language.

## Budgets

- Background: one per game, ≤300KB (1600×1200, optimized PNG or JPEG).
- Sprites: as today (~30–80KB each).
- Video: ≤1.5MB/clip after compression, ≤2 clips/game — a video game page
  should still land under ~4MB total.
