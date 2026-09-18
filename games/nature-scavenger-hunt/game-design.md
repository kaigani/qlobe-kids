# Nature Scavenger Hunt — production game design

## Product promise

Nature Scavenger Hunt turns the tablet into a simple field guide, then sends the
child's attention back into the real world. A child hears one observable clue,
looks outdoors for any safe object that fits, and taps **Found it** when they are
ready. The game celebrates noticing and explanation, not a machine-judged
answer.

- Audience: ages 3–6, optimized for ages 5–6 and tablet play.
- Category: movement-outdoor.
- Release state: `beta` until a child completes every mode on a real iPad.
- Core session: one three-clue quest, normally 1–4 minutes including outdoor
  searching; each on-screen decision is immediate and the digital payoff is
  under 90 seconds.
- Privacy: no camera, microphone, location, upload, account, or remote runtime
  service. All model use is authoring-time only.

## Learning goals

1. Name and compare observable properties: color, shape, size, texture, and
   sound.
2. Transfer a visual/spoken descriptor from the screen to a real object.
3. Explain why more than one answer can fit the same category.
4. Slow down, look closely, touch gently, and listen carefully outdoors.

## Modes

Every run deterministically shuffles a six-clue deck and draws three. The same
seed reproduces the same quest for QA; ordinary replay advances the seed.

| Mode | One skill | Clue deck |
| --- | --- | --- |
| `nature-mix` — Nature Mix | Categorize a find by one observable quality | smooth, green, round, tiny, sound-making, long |
| `texture-trail` — Texture Trail | Compare tactile qualities safely | bumpy, soft, rough, smooth, bendy, tickly |
| `color-quest` — Color Quest | Notice colors in natural objects | green, red, orange, brown, blue, golden |

The example sprite is a model, not the answer. A smooth-stone illustration can
prompt a smooth leaf, seedpod, shell, or another safe find. The narrator's
wording explicitly leaves room for the child's own idea.

## Screen map and navigation

### 1. Splash / choose a trail

- Full-bleed clay forest plate.
- Generated `NATURE HUNT` clay title lockup.
- Three large raster clay quest cards, each with a different trio of example
  objects and real HTML mode name.
- Catalog Home is the only Home control in the game.
- The first real gesture unlocks recorded voice, speech fallback, and SFX.

Tap a quest card → briefing. Double taps are latched.

### 2. Briefing / three-clue clipboard

- One large clay clipboard dominates the screen.
- The chosen three example sprites sit in generous pockets.
- Narration introduces the mode and explains that any fitting object counts.
- The large raster green action plaque starts the hunt.
- Back returns to the splash. Sound repeats the briefing.

Start → hunt clue 1.

### 3. Hunt / one clue at a time

- A blank clay mission plaque carries a short HTML clue label.
- One large example sprite is centered in a calm earth clearing.
- A raster yellow halo briefly pulses behind the example on entry.
- The large raster green **Found it** plaque is the single primary action.
- Back returns to the splash, not the catalog. Sound repeats the exact clue.
- An idle nudge repeats the clue without countdown, failure, or pressure.

Found it → short squash/lift, pop, praise, and clay-leaf/confetti burst → next
clue. After clue 3 → completion.

### 4. Completion

- Large clay clipboard shows all three completed examples with raster check
  badges.
- The waving clay hedgehog is the payoff host and appears only here.
- A mode badge is persisted locally; storage failure never blocks play.
- One large raster action plaque starts a fresh quest in the same mode.
- Back returns to the splash. No Home control is present.

## Interaction rules

- Every action target is at least 96 CSS px, including portrait and 1180×520.
- Buttons use one pointer press path through `shared/js/tap.js`.
- Gameplay requires only tap. There is no drag, precision gesture, timer, or
  camera framing.
- Found status is the child's self-report. There is no wrong answer. Unknown QA
  target ids are rejected truthfully without visual punishment.
- Each completed clue uses sound, motion, and state change; color alone never
  carries meaning.
- Reduced-motion removes travel, pulsing, and confetti while preserving the
  spoken/SFX payoff and completed-state art.
- Safe suggestions are broad. Prompts that involve touch say “gently”; the
  bendy clue reminds the child to ask a grown-up before bending anything.

## Spoken script

The exact strings below are the source of truth for recorded clips and Web
Speech fallback. Delivery is warm, unhurried, and quietly excited—like a trusted
grown-up kneeling beside the child outdoors.

| Key | Verbatim line |
| --- | --- |
| `welcome` | Choose a trail, nature explorer! |
| `brief-nature-mix` | Let's find three nature treasures. Look closely, listen carefully, and take your time. |
| `brief-texture-trail` | Let's find three textures. Touch gently, and ask a grown-up before you pick anything up. |
| `brief-color-quest` | Let's find three colors in nature. Even a tiny spot of color counts. |
| `brief-ready` | Here are your three clues. Tap the big green button when you're ready. |
| `clue-smooth` | Find something smooth. Gently feel its surface. |
| `clue-green` | Find something green. Look closely. The tiniest bit of green counts. |
| `clue-round` | Find something round. It can be a berry, a pebble, or your own idea. |
| `clue-tiny` | Find something tiny. Use your sharp explorer eyes. |
| `clue-sound` | Find something that makes a gentle sound when you move it. Listen carefully. |
| `clue-long` | Find something long. Compare it with your hand. |
| `clue-bumpy` | Find something bumpy. Feel each little bump. |
| `clue-soft` | Find something soft. Touch it very gently. |
| `clue-rough` | Find something rough. Rub one finger across it. |
| `clue-bendy` | Find something bendy. Ask a grown-up before you bend it. |
| `clue-tickly` | Find something tickly. Brush it softly on your hand. |
| `clue-red` | Find something red. A little spot of red counts. |
| `clue-orange` | Find something orange. Look near flowers, leaves, or your own idea. |
| `clue-brown` | Find something brown. Look near the ground and on tree bark. |
| `clue-blue` | Find something blue. Look up, look down, and look for a tiny patch. |
| `clue-golden` | Find something golden yellow. A seed, a flower, or your own idea can count. |
| `praise-1` | What a clever find! |
| `praise-2` | Wonderful noticing! |
| `praise-3` | You found a real nature clue! |
| `complete-nature-mix` | Nature Mix complete! You used your eyes, ears, and hands. |
| `complete-texture-trail` | Texture Trail complete! Your fingertips notice so much! |
| `complete-color-quest` | Color Quest complete! You found a rainbow outside. |
| `again` | Ready for three new clues? |

## Art direction

Canonical label: **Claymation**.

The world is a sun-warmed polymer-clay forest diorama: visible fingerprints,
sculpted seams, rounded imperfect edges, matte-to-satin clay, warm upper-left
studio light, cyan sky, parchment cream, terracotta earth, and layered forest
greens. The mockups in
`../01-game-concepts/nature-scavenger-hunt/output/ui-mockups/` are the visual
north star.

The entire child-facing play field follows the material, not only the backdrop:
clipboard, cards, mission plaque, action button, check badge, halo, treasure
examples, title, and hedgehog are authored raster assets. HTML supplies exact
functional copy and accessibility labels over blank raster surfaces. CSS may
position, mask, focus, and animate those assets; it does not draw primary art.
No emoji, SVG, icon font, CSS gradient illustration, or generic web card ships.

### Runtime asset list

| Asset | Master/final | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| Forest plate | 1440×1080 source → 1600×1200 WebP target | Opaque raster background | Full-screen DOM layer |
| `NATURE HUNT` title | transparent wide WebP, ≤150 KB target | Generated clay lockup | Accessible image |
| Clipboard | transparent WebP, 700–900 px tall | Blank clay clipboard | Positioned DOM panel |
| Mission plaque | transparent WebP, ~900×360 | Blank clay plaque | HTML heading overlay |
| Action plaque | transparent WebP, ~760×320 | Blank green clay button | Native button + HTML label |
| Quest card | transparent WebP, ~640×440 | Blank clay card | Native mode button |
| Check badge | transparent WebP, ~256 square | Clay check token | Completed-state decoration |
| Found halo | transparent WebP, ~512 square | Clay ring/rays | Noninteractive animation layer |
| 12 treasure examples | transparent WebP, 320–512 square masters | Clay sprites | Noninteractive clue image |
| Hedgehog | transparent WebP, ~820×1000 master | Clay celebration pose | Completion decoration |
| Hub tile | 768×640 Toy source → 640×533 JPEG | Curated catalog tile | Hub card |
| OG image | 1200×630 JPEG | Capture of finished splash | Metadata only |

Sources, prompts, cutter boxes, alpha masks, and magenta composites remain under
`assets/source/`. Runtime files are optimized under `assets/backgrounds/`,
`assets/ui/`, `assets/items/`, and `assets/guide/`.

## Audio and feedback

- Primary narration: approved teacher reference → local
  `qwen3-tts-voiceclone` → AAC/M4A → local Whisper transcript QA.
- Any rejected/missing recording falls back to the exact script through Web
  Speech; an incorrect recording never ships merely because it exists.
- SFX: shared `pop`, `whoosh`, `sparkle`, `tick`, and `tada`.
- No background track: outdoor listening is part of the learning promise and
  narration should remain easy to hear outside.
- Mute silences voice, SFX, synth fallback, and any media element while keeping
  visual state and screen-reader announcements intact.

## Data, persistence, and variation

- Runtime content lives in `js/data.js`; `config.json` remains a Studio-readable
  summary of the same game.
- One seeded RNG controls deck draw and praise variation.
- Local storage holds only completed mode ids and a bounded completion count.
  Invalid or unavailable storage resets safely to an empty journal.
- Replay redraws three clues; a mode can repeat indefinitely without a score or
  escalating pressure.

## Shared modules

`audio-unlock.js`, `voice-clips.js`, `narrator.js`, `sfx.js`, `tap.js`,
`hud.js`, `screens.js`, `timers.js`, `rng.js`, `preload.js`, `celebrate.js`,
`idle-nudge.js`, and `debug-harness.js`.

No new shared runtime module is required. The contribution is a polished
reference for real-world self-report play using the existing screen, audio,
timer, persistence, and QA contracts.

## QLOBE_DEBUG v1

Required floor: `ready`, `listModes`, `startMode`, `getState`, `getTargets`,
truthful `tap`, `winRound`, `mute`, `seed`, `fastTimers`, and `home`.

Game extras:

- `clearProgress()` clears the local badge journal.
- `getAudioLog()` proves whether recorded clips or synth fallback played.
- State includes `screen`, `mode`, `round`, `roundsTotal`, `awaitingInput`,
  `found`, `clue`, `quest`, and completed badge ids.

All debug input calls the same handlers real pointers use. Seed changes reach
the RNG before the next deck draw; fast timers scale only cancellable timer
groups.

## Departures from concept and prototype

1. The brief's “customizable environments” becomes three focused descriptor
   trails. This keeps the first production release understandable in five
   seconds and avoids an adult setup screen.
2. The mockup's three-item quest is retained instead of the prototype's five
   steps. Three creates a satisfying short loop outdoors and makes the
   completion clipboard legible in portrait.
3. The prototype's countdown/dial is removed. Outdoor noticing should not be
   rushed, and the concept mockups promise a calm mission plaque rather than a
   timer.
4. There is no camera or automatic recognition. Manual confirmation protects
   privacy, works offline, accepts creative answers, and avoids pretending a
   model can judge the child's surroundings.
5. The prototype's Field Journal/emoji art is replaced completely by the
   brief's canonical Claymation world.
6. The hedgehog appears at completion rather than on every screen so the nature
   clue remains the focus.

## Verification and release gate

- Syntax and static validation: `git diff --check`, `node --check`, full
  platform validator with zero new errors, registry sync/check.
- Local real-Chrome drive: all three modes, unknown-target probe, navigation,
  replay, persistence, recorded voice after gesture, mute, portrait,
  landscape, 1180×520, and reduced motion; zero page errors, 404s, or unexpected
  failed requests.
- Visual captures: splash, briefing, every representative clue family,
  mid-quest completed state, completion, portrait, wide-short, and reduced
  motion. Inspect material fidelity, hierarchy, safe-area clipping, touch size,
  alpha edges, and title spelling at full useful detail.
- Production: push, watch Pages deployment, rerun the same smoke suite against
  `https://qlo.be`, and inspect production captures.
- Final status remains `beta` until the target child independently completes
  each mode on the real iPad.
