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

## The worlds

### 1. Toy Table (default — the current look)
Clean toy-style objects on airy sky-blue fields with soft dots. The
"Montessori tray" feel: the object IS the lesson, nothing competes with it.
The existing `shared/assets/objects/` library (134 pieces) is this world's
canon.
- **Palette:** sky `#bfe3f5`, card white, navy line `#17517e`, accents from
  the category color.
- **Home categories:** reading-phonics, math-number-sense, matching/memory
  games of any category.

### 2. Storybook Rooms
Polished 2D game-illustration interiors: real places rendered with rounded
geometry, crisp navy outlines, and subtle glossy depth (the Laundry Sorter
concept look). The room itself is a full-bleed background; gameplay objects
are cut-out sprites that visibly belong to the room.
- **Palette:** bright cyan/aqua/violet/coral/yellow; navy outlines everywhere.
- **Home categories:** practical-life (kitchen, laundry, garden shed,
  workbench), plus any game whose skill lives in a real domestic place.

### 3. Paper Garden
Cut-paper collage: construction-paper shapes with visible texture, slightly
imperfect edges, layered like a classroom wall display. Handmade warmth.
- **Palette:** saturated kraft-paper brights on a warm cream field.
- **Home categories:** art-music, crafting/building games, pattern play.

### 4. Field Journal
Soft gouache/watercolor nature illustration on warm paper — the look of a
naturalist's notebook. Quieter and more textured than the other worlds.
- **Palette:** leaf greens, sky blues, earth browns on cream `#f7f1e3`.
- **Home categories:** sensorial-science, culture-geography,
  movement-outdoor, observation games.

### 5. Story Screen (video)
Short animated vignettes — preschool-TV warmth, soft rounded characters,
static camera — that set up a social moment or story beat before the child
responds. Used as intros and round set-ups, never as passive viewing: watch a
6-second moment, then DO something about it.
- **Format:** h264 mp4, ≤960px wide, ≤8s, target ≤1.5MB per clip, max ~2
  clips per game. Poster image required; playback starts from a tap (the
  splash tap satisfies autoplay rules).
- **Home categories:** social-emotional, oral-storytelling.

## Lighting variants are not new worlds

A game can be moody, dark, or lit-by-flashlight without inventing a sixth
world — that's a **lighting variant**, a legal per-game modifier of an
existing art world, not a new one. It qualifies only when both hold: (a) the
effect is applied at **runtime by a shared module** (e.g.
`shared/js/stage/spotlight.js` masking the play-field to a beam/pool of
light), not baked into per-game art; and (b) the **art plate itself stays in
the world's palette** — same outline weight, same hue family, same rendering
style, just seen through less light. Flashlight Cave is Storybook Rooms (an
interior, cut-out sprites belonging to a full-bleed background) plus a
runtime night/spotlight pass — explicitly **not** a sixth world. If a new
game's mood tempts you to propose "Nighttime" or "Shadow World" as its own
entry in this doc, reach for a lighting variant on its home world's plate
style first; only propose a new world when the geometry and rendering style
genuinely differ, not just the lighting.

## Assignment rules

- Each game declares its world once; the category default applies unless the
  game's design doc argues otherwise. Never mix worlds inside one game.
- The HUD, splash idioms, end screens, and interaction patterns are
  world-independent — worlds restyle the play-field only.
- Cast characters (Maya, Leo, Nia, Sam, Ravi) appear in every world in their
  canonical designs; worlds restyle environments and props, not people.

## Implementation (Stage v2)

Engines accept an optional `theme` block in the game config (absence = Toy
Table, so all existing games are unaffected):

```js
theme: {
  world: 'storybook-rooms',
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
