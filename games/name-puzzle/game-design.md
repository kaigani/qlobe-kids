# Name Puzzle — production game design

**Category:** writing-fine-motor · **Ages:** 3–6 · **Status:** beta
**Art world:** Puppet / Cozy felt fabric
**Runtime:** custom, game-local DOM game using the shared QLOBE input, audio,
screen, celebration, drag, timer, and debug modules
**Concept:** `../01-game-concepts/name-puzzle/`
**Replaces:** the existing generic `sequence-order` prototype at the same route

This document is the production contract for the Name Puzzle replacement. The
mockups are the visual north star; the canonical platform docs remain the
interaction and navigation contract.

## 1. Product promise and one skill

Pick a familiar name, place its bright felt letters into matching stitched
spaces, and reveal the friendly character who belongs to that name.

The one learning skill is **recognizing and ordering the letters in a familiar
4–5-letter name from left to right**. Matching letter clues make the first play
achievable for a three-year-old; the spoken letter sound and final character
payoff make every placement meaningful.

The production game intentionally has one deep, repeatable activity rather than
preserving the prototype's unrelated word mode. Variation comes from 20 names,
20 characters, shuffled letter order, color rotation, and the reveal line.

## 2. Name roster and reveal cast

The roster is balanced at ten girl and ten boy names. Nineteen names are 4–5
letters and appear near the top of the U.S. Social Security Administration's
early-2020s national table; BELLE is the requested exception. The 2023 SSA list
also directly confirms LIAM, NOAH, JAMES, MATEO, HENRY, LUCAS, EMMA, and LUNA
among that year's national top ten. LUCY is retained from the concept mockups.

Sources:

- https://www.ssa.gov/news/en/press/releases/2024-05-10.html
- https://www.ssa.gov/news/en/press/releases/2023-05-12.html
- https://www.ssa.gov/oact/babynames/decades/names2020s.html

| id | Display name | Early-2020s SSA rank | Reveal character | Spoken reveal |
|---|---|---:|---|---|
| belle | BELLE | requested exception | Belle, the Rainbow Princess | Meet Belle the Rainbow Princess! |
| emma | EMMA | 2 | Emma the Elephant | Meet Emma the Elephant! |
| luna | LUNA | 11 | Luna the Lamb | Meet Luna the Lamb! |
| sofia | SOFIA | 13 | Sofia the Swan | Meet Sofia the Swan! |
| aria | ARIA | 23 | Aria the Alpaca | Meet Aria the Alpaca! |
| hazel | HAZEL | 26 | Hazel the Hedgehog | Meet Hazel the Hedgehog! |
| nora | NORA | 28 | Nora the Narwhal | Meet Nora the Narwhal! |
| lily | LILY | 29 | Lily the Ladybug | Meet Lily the Ladybug! |
| ellie | ELLIE | 30 | Ellie the Explorer | Meet Ellie the Explorer! |
| lucy | LUCY | 39 | Lucy the Llama | Meet Lucy the Llama! |
| liam | LIAM | 1 | Liam the Lion | Meet Liam the Lion! |
| noah | NOAH | 2 | Noah the Newt | Meet Noah the Newt! |
| james | JAMES | 4 | James the Jaguar | Meet James the Jaguar! |
| henry | HENRY | 7 | Henry the Horse | Meet Henry the Horse! |
| lucas | LUCAS | 8 | Lucas the Lynx | Meet Lucas the Lynx! |
| mateo | MATEO | 11 | Mateo the Macaw | Meet Mateo the Macaw! |
| levi | LEVI | 12 | Levi the Lemur | Meet Levi the Lemur! |
| jack | JACK | 14 | Jack the Jackrabbit | Meet Jack the Jackrabbit! |
| owen | OWEN | 20 | Owen the Otter | Meet Owen the Otter! |
| ezra | EZRA | 23 | Ezra the Eagle | Meet Ezra the Eagle! |

Ranks are used only as selection evidence and are not shown to children.

## 3. Screen map and navigation

```text
boot -> PICK A NAME -> BUILD -> REVEAL
          ^              |         |  \
          |              +--back---+   +--Build Again--> BUILD (same name)
          +----------------Back / Pick a Name

PICK A NAME --home--> ../../ (catalog)
```

Home appears only on the name picker. Build and reveal use Back, which returns
to the picker without leaving the game. Audio stops on every screen change.

### 3.1 Pick a name

- Full-bleed felt classroom backdrop and generated felt `Name Puzzle` lockup.
- Four pages of five oversized blank felt name patches. The names are real HTML
  text on authored raster patches so spelling stays exact and accessible.
- A name-card tap immediately opens Build and speaks the recorded `Build [name]`
  spelling prompt.
- Large previous/next page buttons and four tactile progress beads make all 20
  names reachable without a small scroll target. BELLE appears on page one.
- A card tap starts its puzzle exactly once; a double tap cannot start it twice.
- First post-unlock line: "Welcome to Name Puzzle! Pick a name to build."

### 3.2 Build

- Header says `BUILD BELLE` in real HTML on a purple felt banner.
- A cream padded board holds four or five square stitched slot sprites. Each
  slot carries a low-contrast letter clue in real HTML.
- The tray holds the same letters on colored, padded felt tile sprites in a
  shuffled order. The shuffle must not begin already solved when a different
  ordering exists.
- Drag path: drag a tile to a slot. The shared DOM drag controller owns the
  window-level pointer stream, one-drag gate, pointer cancel, blur cancel, and
  cleanup.
- Equal tap path: tap a tile and it flies to the first open slot with that
  letter. This is the primary accessibility path for the youngest players.
- A correct placement snaps in, plays a tactile pop, and speaks the shared
  recorded letter sound.
- A wrong slot softly wiggles and returns the tile. It never shows a red X,
  subtracts progress, or says "wrong."
- Repeated letters are independent pieces. Either matching copy may fill either
  identical open clue; piece identity never makes a visually correct placement
  fail.
- The sound button repeats the recorded spelling prompt: "Build [name].
  [letter], [letter]…"
- At 11 seconds idle the prompt repeats; at 22 seconds the next matching tile
  and slot pulse together; later nudges repeat that model without solving.

### 3.3 Reveal

Completion choreography:

1. The placed name tiles close their gaps and lift slightly.
2. A felt star medal pops above the word; shared sparkle/tada audio plays.
3. The name's character rises from behind the padded board and settles with one
   gentle two-beat wave/bob.
4. A short confetti burst uses the platform palette.
5. The recorded reveal line plays in full.
6. Large Build Again resets the same name puzzle; Pick a Name returns to the
   picker. The sound button repeats the reveal line.

Reduced motion skips the tile slide, rise, bob, and confetti while preserving
the final character, tactile sound, and spoken reward.

## 4. Voice script and audio strategy

Recorded narration is primary; Web Speech is the recovery fallback for every
game-local line. `assets/audio/lines.json` is the exact script and currently
contains 45 authored clips:

- five generic keys: `intro`, `picker`, `nudge`, `drop-nudge`, and the
  missing-art `celebrate` line;
- one `build-<id>` clip for each of the 20 names, including the spoken name and
  its comma-paced letter sequence;
- one `reveal-<id>` clip for each name, exactly matching the table in §2.

The runtime manifest publishes the batch only when all 45 files pass media,
checksum, duration, volume, and transcript checks together. The release pack
was rendered fully on-device with the installed macOS Samantha voice, leveled
to -18 LUFS, and round-tripped through an installed CPU-only whisper.cpp small
model; `assets/audio/qa.json` records a 1.0 normalized transcript ratio for all
45 lines. The preferred Qwen teacher-voice/Whisper LAN path remains available
in `tools/generate-voice.py`, but its private-reference upload was not approved
by the managed environment for this production session and is not claimed as
the source of the shipped clips.

Correct tile landings use the shared recorded A–Z letter clips through
`content.js`. No runtime model or network call is permitted.

Audio unlock is installed once at module scope. No line speaks before a real
gesture. Visibility/page-show recovery reopens every channel on the next touch.

## 5. Art direction and production list

Everything child-facing belongs to **Puppet / Cozy felt fabric**: wool felt,
fleece, visible blanket stitching, embroidered details, gentle stuffing,
painted wood, and warm theatrical light. Palette: cranberry, cream, peach,
mustard, coral, teal, lavender, dark plum, plus Belle's rainbow accents.

No SVG or CSS-drawn illustration is shippable. CSS supplies layout, responsive
positioning, hit areas, focus state, and animation only. Functional text stays
HTML on top of authored raster objects.

| Asset | Final intent | Visible renderer | Interaction substrate |
|---|---|---|---|
| `assets/art/classroom.webp` | 1600×1200 full-bleed room | opaque raster | screen background |
| `assets/ui/title.webp` | alpha-trimmed felt title lockup | transparent raster | accessible image |
| `assets/ui/panel-{coral,mustard,green,lavender,plum,teal}.webp` | six blank felt patches | transparent rasters | name cards, headings, and action buttons |
| `assets/ui/name-board.webp` | large blank cream padded board | transparent raster | responsive puzzle region |
| `assets/ui/letter-slot.webp` | one blank stitched inset slot | transparent raster repeated 4–5× | drop target |
| `assets/ui/letter-{red,orange,yellow,green,teal,sky,lavender}.webp` | seven blank colored letter tiles | transparent rasters | drag/tap buttons |
| `assets/ui/star-medal.webp` | completion medal and neutral art fallback | transparent raster | decorative reward |
| `assets/ui/hud-{home,back,sound}.webp`, `pager-{prev,next}.webp` | five sewn felt navigation controls | transparent rasters | semantic shared HUD and pager buttons |
| `assets/characters/<id>.webp` | 20 consistent 640×720 reveal cutouts | transparent rasters | reveal image |
| `../../assets/hub/tiles/name-puzzle.jpg` | Belle beside an exact BELLE name board in the classroom | opaque raster | root hub tile |

GPT Image 2 creates the cohesive masters. The supplied rainbow-princess image
is a **subject/reference image** for BELLE only: keep her warm brown skin,
large brown eyes, black curly updo and ringlets, rainbow jeweled crown, rainbow
gown, and crystal-tipped scepter while translating every material into sewn
felt/fleece. Do not copy the bathroom background. Other characters share the
same handmade scale, frontal three-quarter presentation, lighting, padding,
and stitched facial language. The prepared Qwen Image Layered route was not
authorized to receive the private reference-derived masters in this production
session, so the shipped cutouts use the deterministic local charcoal-matte
finalizer. All alpha edges are reviewed on saturated magenta before final WebP.

The hub tile is a purpose-composed 6:5 scene rather than a cropped gameplay
screenshot: Belle waves beside a stitched board whose five tiles spell exactly
BELLE. It contains no title or UI controls.

## 6. Technical architecture

The generic `sequence-order` engine is replaced because it cannot express a
20-name picker, per-name character reveal, repeated-letter semantics, or a
raster/material-led play field. The custom game remains data-driven:

```text
games/name-puzzle/
  index.html
  config.js              thin fetch shim
  config.json            roster, reveal copy, asset refs, colors
  css/style.css
  js/main.js              screens, audio, state, debug integration
  assets/art/
  assets/ui/
  assets/characters/
  assets/audio/
  assets/source/          prompts, source masters, and alpha QA evidence
  tools/qa.mjs
```

Shared modules: `audio-unlock.js`, `screens.js`, `hud.js`, `tap.js`,
`stage/drag-to-slot-dom.js`, `voice-clips.js`, `content.js`, `sfx.js`,
`celebrate.js`, `idle-nudge.js`, `timers.js`, `rng.js`, and
`debug-harness.js`.

State is semantic and session-local: screen, selected name, picker page, ordered
slot letters, tray piece ids, placed slot ids, lock state, mute state, and the
temporary missing-art flag. No child data is collected, uploaded, or persisted.

## 7. `QLOBE_DEBUG` v1

Required floor plus game-specific extensions:

- `ready`, `listModes()`, `startMode('<name-id>')`, `getState()`, `getTargets()`,
  `tap(id)`, `winRound()`, `mute()`, `seed(n)`, `fastTimers(scale)`, `home()`.
- `listNames()` returns the 20 ids/display names/reveal labels.
- `selectName(id)` follows the same selection function as a real card tap.
- `place(pieceId, slotIndex)` follows the exact shared attempt path used by
  tap and drag.
- `getAudioLog()` exposes recorded/speech/shared-letter playback truthfully.
- `getPlaybackLog()` records the real media element's `playing`, `ended`, and
  `error` events so browser QA can distinguish a selected clip from one that
  actually decoded and finished; `clearPlaybackLog()` resets that evidence.

`getTargets()` reports only visible non-zero targets and truthful roles for the
current puzzle. Debug completion may accelerate animation but may not bypass
placement evaluation or screen routing.

## 8. Responsive, accessibility, and failure behavior

- Tablet landscape, tablet portrait, and wide-short 1180×520 are release
  shapes. The board uses contained sizing; no name, tile, or reveal character
  may sit under the HUD or outside the visible safe area.
- Every actionable control has an effective hit target at least 96×96 CSS px.
- Visible focus, semantic buttons, useful alt text, and a live announcer mirror
  spoken prompts.
- Pointer cancel, blur, leaving the window, and screen changes always restore
  a dragged tile. A resize during drag cancels safely and reflows.
- Missing character art hides the normal character medal, changes the promise
  to “You built [name]!”, shows one smaller neutral felt star reward, and speaks
  the generic recorded celebration. Missing audio falls back to correct Web
  Speech; neither path can block completion.
- Image decode is awaited before a reveal starts so the character cannot pop in
  as an empty box.

## 9. Explicit departures

- **Prototype:** remove `sequence-order`, the five cast names, and the simple
  word mode. They do not implement the requested 20-name character fantasy.
- **Original brief custom-name entry:** defer keyboard entry. The requested
  release is a curated 20-name selector; an adult text field would add reading,
  validation, privacy, and arbitrary-speech concerns without improving the
  child loop.
- **Mockup:** preserve the name picker → build → reveal rhythm, tactile letters,
  hierarchy, and color relationships. Replace baked labels with real HTML,
  shared platform HUD routing, four paged name groups, and responsive layouts.
- **Shared cast:** the bespoke alliterative reveal roster is intentional. The
  platform cast does not supply the 20 named animal/child identities promised
  by this game.

## 10. Release gate

The game remains `beta` until a real iPad child playtest. Before handoff:

1. all 20 names are selectable, 4–5 letters, and map to distinct reveal art;
2. BELLE matches the supplied subject reference in cozy felt form;
3. every name completes through tap and drag, including repeated letters;
4. wrong slot, pointer cancel, blur, resize, back, replay, mute, missing-audio,
   portrait, landscape, wide-short, and reduced-motion paths pass;
5. recorded reveal clips are Whisper-checked and real Chrome proves clip—not
   synth—playback after a gesture;
6. zero unexpected console errors, failed requests, or case-sensitive 404s;
7. screenshots of picker pages, 4-letter build, 5-letter/repeated-letter build,
   Belle reveal, another animal reveal, portrait, landscape, and reduced motion
   receive full-size visual review;
8. `git diff --check`, syntax checks, registry sync check, usage index check,
   and the repository validator add no new errors.
