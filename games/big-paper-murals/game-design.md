# Big Paper Murals — production game design

## Product promise

Two children can put fingers on one iPad at the same time and make one joyful,
musical papercraft mural together. Every mark is welcome. The child can paint,
roll broad color, stamp a living paper character, tap the finished mural like
an instrument, and save a local PNG keepsake.

This production build replaces the former `coach-timer` emoji prototype. It
implements the digital game promised by the concept rather than coaching a
separate real-world paper activity.

## Capability contribution

The game is the second consumer of `shared/js/musical-canvas.js` and makes that
service reusable for collaborative creative play:

- simultaneous multi-pointer strokes instead of a one-primary-pointer lock;
- a world-supplied paper/background renderer;
- a broad roller brush alongside ribbon, bounce, and sparkle brushes;
- semantic strokes that still resize, serialize, undo, reload, and replay;
- independent color tracks that become a small orchestra on replay.

Game-local orchestration adds themed starter papers, living stamp placement,
stamp instrument playback, local autosave, and high-resolution composited PNG
export. No media or model service is called at runtime.

## One skill per mode

| Mode | Skill | Starter promise |
| --- | --- | --- |
| Jungle Jam | collaborative mark-making | grow a leafy paper jungle and wake animal stamps |
| Space Parade | spatial composition | paint trails through a calm night-sky paper collage |
| City Party | shared storytelling | build roads, rhythms, and a playful paper neighborhood |
| Fresh Paper | open-ended expression | begin from warm handmade paper with no prescribed result |

## Screen map and navigation

```text
catalog → splash/theme shelf → mural studio → living mural → splash
                          ↘ back ↗             ↘ edit mural
```

- Splash Home returns to the QLOBE catalog.
- Tapping any theme card starts immediately and speaks one short invitation.
- Studio Back returns to this game's splash, never the catalog.
- Finish opens the living-mural performance screen.
- Edit returns to the same saved mural state.
- New mural returns to the theme shelf after saving the current mural locally.

## Core loop (30–90 seconds, open-ended)

1. Pick Jungle, Space, City, or Fresh Paper.
2. Choose a large paint color and Brush, Roller, or Stamp.
3. One or two children draw simultaneously. Each stroke plays a gentle pitched
   instrument determined by color and vertical position.
4. In Stamp mode, tap the paper to place a themed character or prop. Each new
   stamp gives a short sound and bounce.
5. Tap the large music button to replay the semantic strokes as overlapping
   color tracks.
6. Tap the large finish button. The mural fills the screen; stamps dance and
   can be played as a soundboard.
7. Save a PNG locally, edit, or begin another mural.

There is no score, timer, wrong input, locked content, or game-over state.

## Spoken script (verbatim)

| Key | Line |
| --- | --- |
| `welcome` | "Pick a paper, then paint together!" |
| `jungle` | "Grow a wild jungle. Big leaves, tiny bugs, anything you imagine!" |
| `space` | "Paint a space parade. Whooshing trails and twinkly stars!" |
| `city` | "Build a busy city. Roads, rooftops, and silly surprises!" |
| `blank` | "Fresh paper! Make any kind of mural you like." |
| `paintNudge` | "Try a big swoop. Two artists can paint at the same time!" |
| `stampNudge` | "Tap the paper to wake a little collage friend." |
| `music` | "Listen! Every color has its own voice." |
| `finishNudge` | "Add a mark or a stamp, then your mural can come alive." |
| `alive` | "Your mural is alive! Tap the art to make music." |
| `saved` | "Your mural picture is saved!" |
| `fresh` | "Fresh paper is ready." |

Recorded voice is desirable but not required for this release: the exact
Web Speech lines above are the offline fallback and the source for a later
rights-cleared teacher-voice batch.

## Art direction and complete art list

Chosen world: **Papercraft / Paper Garden**. The concept mockups are the visual
north star: saturated construction paper, felt and cardstock, visible fibers,
scissor-cut edges, thick gouache ridges, warm butcher paper, and tactile layered
shadows. Functional words remain HTML; the splash title is generated title art.

| Asset | Runtime size / format | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| splash background | 1344×768 WebP | authored papercraft studio backdrop | full-screen CSS layer |
| title lockup | alpha WebP, ≤150 KB target | painted torn-paper lettering | accessible image |
| Jungle theme card | 4:3 WebP | layered leaf/tiger/toucan starter mural | 96px+ HTML button |
| Space theme card | 4:3 WebP | layered rocket/planet starter mural | 96px+ HTML button |
| City theme card | 4:3 WebP | layered buildings/car starter mural | 96px+ HTML button |
| tool contact sheet source | retained PNG | coordinated brush/roller/stamp/music objects | deterministic crops |
| brush / roller / stamp / music icons | alpha WebP | authored paper-and-gouache tools | HTML buttons |
| living stamp contact sheet source | retained PNG | eight paper characters/props | deterministic crops |
| eight living stamps | alpha WebP | authored opaque sprites | positioned HTML buttons + export compositor |
| hub tile | 640×533 JPEG | curated toy-table game moment | catalog card |

The warm blank paper, torn deck edges, selection rings, hit areas, cursor rings,
focus states, and paint strokes are code-native interaction substrate. Their
paper grain and rough painted edges are deliberately procedural because they
must scale, recolor, and respond to simultaneous input; authored primary
objects remain raster art.

## Interaction and feedback rules

- Every visible child control is at least 96×96 CSS pixels.
- Pointer events use window-level move/up/cancel listeners. Multi-touch allows
  several active pointers, each with an independent semantic stroke.
- Brush and roller selections speak through sound previews, not required text.
- Stamps cycle through a theme-specific family; the child can repeatedly tap
  the same stamp and make any composition.
- Undo removes the latest stroke or stamp, whichever happened last. Clear uses
  a forgiving two-tap confirmation and can be undone once.
- Music replay disables conflicting editing until complete, but Back remains
  available and cancels replay safely.
- Idle guidance occurs once, then stops. Wrong actions never buzz or shame.
- Reduced motion removes stamp bounce, floating scraps, and flourish motion but
  preserves state changes and sound.

## Replay variation and persistence

- Themes vary the starter backdrop, stamp family, spoken invitation, and color
  palette. Fresh Paper uses the full palette and a blank sheet.
- Stamps receive deterministic small rotations and scale variations from the
  game seed; debug seed 42 reproduces QA scenes.
- The current mural autosaves to `localStorage` after each completed stroke or
  stamp. The last mural can be resumed after reload. A small bounded gallery of
  the three most recent semantic murals is retained; no image is uploaded.
- PNG export is generated fully on-device at 1600×1200 with the starter paper,
  semantic strokes, and stamp sprites composited in one file.

## Privacy, permission, and fallback behavior

No login, network call, microphone, camera, location, or file permission is
requested. Downloads happen only after the child taps Save Picture. If local
storage is unavailable or full, play and PNG export continue in memory.
WebAudio is unlocked on the first real gesture. Missing WebAudio becomes a
silent visual mural; missing speech synthesis leaves the visual modeling intact.

## Departures from concept mockups and old prototype

- The mockup's labels are retained as optional real HTML for adults, while
  icons, color, modeling, and speech keep the child path pre-reading friendly.
- "2 artists" becomes a live two-dot artist indicator driven by simultaneous
  pointers instead of a static label.
- Infinite horizontal paper scrolling is deferred: a bounded 4:3 mural keeps
  both artists visible, exports predictably, and works in portrait. The shared
  semantic format remains normalized so a future scrollable surface is possible.
- Theme starter art is intentionally calm and partial; it invites additions
  rather than presenting an already-finished mural.
- The former real-world timed steps and emoji artwork are removed completely.

## Shared modules

- `shared/js/musical-canvas.js` — strengthened for multi-touch, custom paper,
  roller marks, semantic replay, serialization, and export.
- `shared/js/audio-unlock.js` — first-gesture audio latch and kiosk guards.
- `shared/js/narrator.js`, `shared/js/speech.js`, `shared/js/sfx.js` — guidance
  and gentle feedback.
- `shared/js/debug-harness.js` — stable `QLOBE_DEBUG` format version 1.
- `shared/css/base.css`, `screens.css`, `hud.css` — platform type, screens,
  safe navigation, and shared icon buttons.

## `QLOBE_DEBUG` format version 1

The surface provides `ready`, `listModes`, `startMode`, `getState`, `getTargets`,
`tap`, `drawStroke`, `placeStamp`, `finish`, `completeRound`, `mute`, `seed`,
`fastTimers`, `loadMural`, `snapshot`, and `clearSaved`. Debug input calls the
same handlers used by real pointers. State is serializable and reports screen,
theme, selected tool/color, active artist count, stroke/stamp counts, replay,
muted state, save availability, and last export status.

## Known risks and release gate

- Multi-touch can expose cancelled-pointer and simultaneous-finish races; QA
  must exercise two pointer IDs, window-level release, cancel, and blur.
- iPad memory pressure can make high-DPI canvas export fail; runtime caps live
  backing resolution at 2× and exports from a fresh fixed-size canvas.
- Alpha fringes around generated stamps must be inspected on saturated magenta.
- AI title lettering must be spell-checked at full size.
- The game remains `beta` until the target child successfully chooses a theme,
  makes marks, places a stamp, enters the living mural, and asks to play again
  on the real production iPad.

Production release additionally requires zero new validator errors, all QA
assertions green in real Chrome, no failed runtime requests, screenshots for
all meaningful states in landscape and portrait, production deployment green,
and the same suite passing against `https://qlo.be`.
