# Bug Hotel Observer — game design

**Category:** sensorial-science · **Ages:** 5–6 · **Status:** beta (stays beta until a real-iPad child playtest)
**Art world:** Paper Garden (`docs/art-direction.md`) — layered cut-paper collage, second flagship after Sound Painting
**Cast:** no platform characters. The cast is twelve bugs; none is promoted to `shared/characters/` in v1.
**Engine:** custom, game-local (`js/game.js`) on `shared/js/hotspot-scene.js` + two NEW shared modules, `shared/js/magnifier-lens.js` and `shared/js/journal.js`
**Concept:** `01-game-concepts/bug-hotel-observer/` (brief.md, concept video, 4 UI mockups + PROMPTS.md)
**Replaces:** the emoji `observe-journal` stub shipped at this id today. Same id, same route, same folder.

This is the P1 (Phase-0) deliverable of the approved production plan. **Everything else in the
build cites this document.** It is written to answer every "what happens when…" a parallel
implementation agent would ask, and §3 doubles as the voice recording manifest (its machine
readable twin is `tools/lines.json`).

**Reading order for an implementation agent:** §5 (the module contracts) and §6 (the frozen
config schema) are contracts — nothing in them changes without a new Phase 0. §2, §8 and §9
are the visual spec. §7 and §13 are the QA surface. §11 lists everything that deliberately
does not match the mockups.

---

## 0. File tree and who owns what

```
shared/js/magnifier-lens.js            NEW shared module            P2   (§5.2)
shared/js/magnifier-lens.test.html     harness                      P2   (§5.2.9)
shared/js/journal.js                   NEW shared module            P2   (§5.3)
shared/js/hotspot-scene.js             REUSED BYTE-IDENTICAL        —    (§5.1)
games.json                             via sync tool ONLY           P7
shared/data/usage-index.json           REGEN via build-usage-index  P7

games/bug-hotel-observer/
  index.html                           shell, meta, font preload    P3   (§2, §8)
  config.js                            fetch shim                   P1   (§6)
  config.json                          rooms · bugs · lens · tuning P1   (§4, §6)
  tools/lines.json                     spoken text, machine-readable P1  (§3)
  css/style.css                        HUD, screens, choreography   P3   (§9)
  js/main.js                           screens, HUD, QLOBE_DEBUG    P3   (§2, §7)
  js/game.js                           room machine, placement, lens↔hotspot choreography P3 (§4, §9)
  js/voice.js                          voice-clips wrapper          P3   (§3)
  js/journal-ui.js                     spread render, sticker fly-in P3  (§2.7, §9.6)
  js/ambience.js                       zero-file WebAudio garden bed P3  (§9.9)
  game.json                            registry manifest            P1   (§12.1)
  game-design.md                       THIS FILE                    P1
  ASSETS.md                            production spec + provenance P1/P4/P5 (§8)
  tools/gen-art.py · finalize-art.py   art recipes                  P4
  tools/gen-voice.py                   voice recipe                 P5
  tools/qa.mjs                         the gate                     P7   (§13.2)
  assets/…                             art + audio                  P4/P5 (ASSETS.md)
```

**Hands-off for every work package:** `shared/js/hotspot-scene.js`, `games/sound-sprouts/`,
`games/clay-creature-studio/`, root `games.json` (tool-written only), `assets/hub/tiles/`,
`docs/`, and every other game.

---

## 1. The product promise

> **You are the person with the magnifying glass.** A handmade paper bug hotel is standing in a
> paper garden. Four rooms. Twelve tiny guests, and every one of them is really hiding — you
> cannot see them until you look closely, and looking closely is a thing you do with your hands.
> Find one, say hello to it, and it tells you one true thing about itself, which you keep
> forever in your own bug book.

Three things make that promise real, and they are the three things the build must not
compromise:

1. **The bug is genuinely not visible until you look.** A bug lives only in the lens world until
   the child holds the glass over it. It is not faded, not small, not tinted — it is not drawn in
   the base scene at all. Discovery is real, not decorative.
2. **Nothing hurries and nothing scores.** No timer, no lives, no streak, no "wrong", no
   countdown, no leaderboard, no red anything. The mockup's "1 of 4" is a *where am I* marker,
   not a score (§11).
3. **What the child collects persists.** Twelve stickers in one journal, kept in `localStorage`,
   surviving reloads and re-visits. My Bug Book is where a five-year-old shows a grown-up what
   they did.

### 1.1 One skill per mode

| # | id | Title | The single skill | What the child hears | What is on screen |
|---|---|---|---|---|---|
| 1 | `bug-hunt` | Bug Hunt | **visual search for a named target** — hold a name in mind and scan a busy natural scene for its referent | "Can you find the ladybug?" | the target's plaque sits in the HUD as a picture reminder |
| 2 | `bug-detective` | Bug Detective | **matching a spoken description to a creature** — listen to attributes and infer the referent | "I am small and round and red, with little black spots on my back. Who am I?" | **no** plaque; nothing on screen names or pictures the target |
| 3 | `my-bug-book` | My Bug Book | **recall and revisit** — recognise a bug from its sticker and re-hear its name and fact | "Tap a sticker to hear about that bug again." | the journal spread; every collected sticker is a button |

Same hotel, same rooms, same bugs, same lens, same reward. Mode 2 removes the name and the
picture; that removal *is* the mode. Mode 3 has no search at all — it is the resting place.

**Why three modes and not two.** Mode 3 is not padding: it is the payoff surface that makes the
collection mean something, and it is the only screen a child can hand to a grown-up and narrate.
It also gives a tired child something to do that is not a search.

### 1.2 No-fail, by construction

`docs/philosophy.md` principle 6.

- **A tap on a non-target bug is not a mistake — it is a look.** The bug says its own name
  warmly, does its happy wiggle, and **stays there, still tappable, forever**. Nothing is
  consumed, nothing is greyed out, no counter moves.
- **The lens can never be "wrong".** It reveals whatever it dwells on. Revealing a non-target bug
  is a success — it earns `found-tap` and a name, exactly like the target does.
- **A room ends exactly one way:** the target has been found and tapped. There is no other exit
  except the back button.
- Wrong taps are unlimited and untracked. `getState().wrongTaps` exists only to escalate
  *helpfulness* (§3.6) and is never shown to the child.
- No sound in this game is a buzzer. `nudge-wrong` is a warm invitation, and it is preceded by
  the bug's own delighted name clip so the child hears *praise first, redirect second*.

### 1.3 Session shape (`philosophy.md` principle 5)

| beat | budget |
|---|---|
| room intro (plate crossfade + room line + prompt) | 4–6 s |
| the search — drag, dwell, discover | 12–55 s, entirely the child's pace, no timer |
| tap the target (happy swap + wiggle + name) | 1.4 s |
| reward (journal rises, fact spoken, sticker flies) | 8–12 s, auto-advances at 14 s |
| **one room, end to end** | **≈ 30–75 s** — inside the 30–90 s band |
| one round (4 rooms + celebration + end) | ≈ 3–4 minutes |
| the full collection (3 rounds, all 12 bugs) | ≈ 10–12 minutes, across as many sittings as the child likes |

The only clocks in the game are the reward auto-advance and the idle timers, and both exist so
that a child who wanders off is not stranded.

### 1.4 Understandable in five seconds

The five-second read is: **there is a paper house, it has little rooms, and there is a magnifying
glass you can move.**

Four supports, in order, none of them written text:

1. On the hotel-select screen the four room plaques run **one pulse sweep** on arrival — the
   affordance is *these four things are touchable*.
2. On the room screen the lens **glints once** at 900 ms (a single sheen sweep across the glass)
   and sits large and central at art (800, 620). It is the only object in the frame with a
   handle, and handles mean hands.
3. The prompt is spoken, always, and the sound button re-speaks it forever.
4. At 12 s with no interaction, `idle-1` plays and the lens glints again; at 27 s `idle-2`
   names the gesture explicitly.

---

## 2. Screen map

### 2.1 The six screens and every transition

```
   boot ─▶ SPLASH ──(Play)──▶ mode row expands ──(bug-hunt / bug-detective)──▶ HOTEL SELECT
             ▲  ▲                              └──(my-bug-book)────────────┐        │
             │  │                                                         │        │ (tap a room
             │  │                                                         │        │  plaque)
             │  │                                                         ▼        ▼
             │  ├──(back)───────────────────────────────────────────  JOURNAL ◀── ROOM
             │  │                                                         ▲        │ (tap the
             │  │                                                (journal │        │  target bug)
             │  │                                                  tab)   │        ▼
             │  ├──────────────────────────────────────────────────────  REWARD
             │  │                                                          │  (Next Room)
             │  │                        rooms 1–3 ────────────────────────┘
             │  │                        room 4                            │
             │  │                                                          ▼
             │  ├──────────────────────────────────────────────── CELEBRATION
             │  │                                                          │ (Keep Exploring
             │  │                                                          ▼  / 16 s)
             │  └──────────────────────────────────────────────────────── END
             └──(Play Again, or back)──────────────────────────────────────┘

   SPLASH ──(home, top-left)──▶ ../../     (the catalog — the only navigation in the game)
```

`getState().screen` is exactly one of
`'splash' | 'hotel' | 'room' | 'reward' | 'journal' | 'celebration' | 'end'`.

**Transition table — this is normative.**

| from | trigger | to | what happens |
|---|---|---|---|
| boot | — | `splash` | splash paints; **no audio at all** (§3.1) |
| `splash` | tap **Play** | `splash` | mode row slides up (240 ms); `welcome` plays if it has not yet this session |
| `splash` | tap `bug-hunt` / `bug-detective` tile | `hotel` | `sfx.tick()`; mode intro clip starts; hotel plate decodes behind it |
| `splash` | tap `my-bug-book` tile | `journal` | mode intro clip; journal spread mounts full-screen (not as an overlay) |
| `hotel` | tap a room plaque | `room` | plaque pops; room plate crossfades 420 ms; room intro line; §9.2 |
| `hotel` | tap the **journal tab** | `journal` | spread slides up as an overlay; the hotel stays mounted underneath |
| `hotel` | tap **back** | `splash` | full teardown (§2.9) |
| `room` | dwell reveals a bug | `room` | reveal choreography (§9.3); no screen change |
| `room` | tap the **target** bug | `reward` | happy swap + name, then the journal rises (§9.4–9.6) |
| `room` | tap a **non-target** bug | `room` | name + wiggle + `nudge-wrong`; in `bug-detective` the clue is then repeated |
| `room` | tap the journal tab | `journal` | overlay; the room is paused underneath, lens disabled |
| `room` | tap **back** | `hotel` | teardown of the room only; the hotel remembers which rooms are done |
| `reward` | tap **Next Room**, or 14 s | `room` (rooms 1–3) / `celebration` (room 4) | spread slides down 380 ms; §9.7 |
| `reward` | tap **back** | `hotel` | full teardown; the sticker is already persisted |
| `journal` | tap a filled sticker | `journal` | `bug-<id>-name` → 240 ms → `bug-<id>-fact`; the sticker pulses |
| `journal` | tap **back** / the tab again | the screen it opened from | overlay slides down; if it was opened as a mode, back goes to `splash` |
| `celebration` | tap **Keep Exploring**, or 16 s | `end` | §9.8 |
| `end` | tap **Play Again** | `splash` | returns to the mode menu, **not** into the mode just played |
| any | tap **back** | one screen out, per the rows above | never a page navigation |
| any | `QLOBE_DEBUG.home()` | `splash` | the identical teardown the back button runs |

**Navigation follows `docs/interaction-patterns.md` §8:** home only on the splash (→ `../../`),
back on every deeper screen. A child is never more than two taps from the catalog.

### 2.2 Coordinate system — one art space, one transform

```
ART = 1600 × 1200
scale   = max(viewW / 1600, viewH / 1200)          // cover-fit
offsetX = (viewW - 1600 * scale) / 2
offsetY = (viewH - 1200 * scale) / 2
screen  = art * scale + offset
art     = (screen - offset) / scale
```

- **Everything in the play field** — the hotel plate, the four exterior hotspots, the room plates,
  the four nook zones, the bug sprites, the lens centre — is authored in **art px** and mapped by
  this one transform.
- **`shared/js/hotspot-scene.js` owns the transform and nothing else may recompute it.** The game
  and `magnifier-lens.js` both read it back through `scene.toScreen()` / `scene.toArt()` /
  `scene.visibleArt()` and re-sync on `scene.onReflow()`. **The lens module never measures the
  viewport itself.** This is the single rule that keeps the magnified world and the base world
  registered to each other at every aspect ratio.
- **The HUD is not in art space.** Back, home, sound, the prompt banner, the target plaque, the
  four room pips and the journal tab are HTML positioned in **CSS px** against the viewport with
  safe-area insets. They are reconciled with the scene by `scene.setReserve()`.
- `QLOBE_DEBUG` speaks **art space** for placement (`getState().placements`, `setLens`) and
  **screen px** for clickable rects (`getTargets().rect`); both are labelled on the object.

### 2.3 SPLASH

```
┌──────────────────────────────────────────────────────────────┐
│ (home)                                              (sound)  │
│                                                              │
│        ╔══════════════════════════════════════════╗          │
│        ║      [ assets/title.webp lockup ]        ║          │  ← authored papercraft
│        ║          Bug Hotel Observer              ║          │    cut-letter art
│        ╚══════════════════════════════════════════╝          │
│                                                              │
│                    ┌──────────────┐                          │
│                    │  ( Play )    │                          │  ← shared btn-play.png
│                    └──────────────┘                          │
│                                                              │
│   ┌──────────┐        ┌──────────┐        ┌──────────┐       │
│   │ (glass)  │        │ (glass + │        │ (paper   │       │  ← 3 mode tiles, revealed
│   │ Bug Hunt │        │ silhou.) │        │  book)   │       │    by the Play button
│   │          │        │Bug Detec.│        │My Bug Bk │       │
│   └──────────┘        └──────────┘        └──────────┘       │
└──────────────────────────────────────────────────────────────┘
   background: assets/bg-hotel.jpg, blurred 6 px and lifted 8 % in brightness
```

**Composition (mockup 01).** The splash reuses the *hotel exterior plate itself* as its
background — softly blurred and brightened so it reads as depth of field rather than as a second
picture — with the title lockup floating over the garden. Mockup 01 puts the title card in the
upper-left over the tree; we centre it, because the shipped plate has no cleared left third at
every aspect ratio and a centred lockup survives portrait.

`assets/title.webp` is alpha-trimmed authored art (`docs/art-direction.md`: splash titles are
generated graphic lockups in the game's art world, **never HTML type**), centred,
`width: min(74vw, 940px)`, top edge at `max(88px, 11vh)`.

**Play** is `shared/assets/ui/btn-play.png` at 168 CSS px with an HTML "Play" label beneath it in
Fredoka 600 / 44 px `#3f5c22` — the only text-labelled control in the game, aimed at the adult
handing over the tablet.

**The three mode tiles are hidden until Play is tapped**, then slide up together (240 ms,
`cubic-bezier(.22,1.1,.36,1)`) and `welcome` plays if it has not yet. Each tile is ≥ 300 × 300
CSS px: a cream cut-paper card (CSS: radius 34, `#fbf3e2`, 5 px `#c9b590` border, layered
shadow) carrying **one authored papercraft cutout** as its face plus an HTML Fredoka label.

| tile | face (authored art) | label |
|---|---|---|
| `bug-hunt` | `assets/props/mode-hunt.webp` — paper magnifier over a green paper leaf | "Bug Hunt" |
| `bug-detective` | `assets/props/mode-detective.webp` — paper magnifier over a torn card holding a dark paper bug **silhouette** | "Bug Detective" |
| `my-bug-book` | `assets/props/mode-book.webp` — a little spiral kraft book with one ladybug sticker on the cover | "My Bug Book" |

**Controls:** home top-left (`btn-home.png`, 112 CSS px) → `../../`; sound top-right
(`btn-sound.png`, 112 CSS px) → re-speaks `welcome`, debounced 600 ms. No back button here.

**If the child does nothing:** at 14 s `idle-1`; at 32 s `idle-2`. No attract loop, no auto-start.

### 2.4 HOTEL SELECT

```
┌──────────────────────────────────────────────────────────────┐
│ (back)                                              (sound)  │
│                                                              │
│                                ╱╲   ← red paper roof         │
│                          ╱────╱  ╲────╲                      │
│   paper garden:         │ [leaf] │[bark]│                    │  ← 4 arched rooms painted
│   moss, leaves,         │  (・)  │ (・) │                    │    into the plate
│   flowers, stones       ├────────┼──────┤                    │
│                         │[bamboo]│ [log]│                    │
│                         │  (・)  │ (・) │                    │
│                         └────────┴──────┘                    │
│                                                              │
│   ( journal tab )                    ● ○ ○ ○                 │  ← 4 room pips
└──────────────────────────────────────────────────────────────┘
   background: assets/bg-hotel.jpg (full-bleed, cover-fit, no bugs, no text)
```

**This screen is `shared/js/hotspot-scene.js`'s second production consumer** and it is driven
**through the public API only** — `setBackground`, `addHotspot`, `setSprite`, `setEnabled`,
`pulse`, `setReserve`, `onReflow`, `clear`. Nothing reaches inside the module.

Four hotspots, one per room, at `rooms[].exteriorHotspot` (art px, centre + size). Each hotspot's
sprite is that room's **icon-only plaque** (`assets/props/plaque-<room>.webp`): a small torn-kraft
card carrying a papercraft picture of that room's material (a leaf, a bark chip, a bamboo tube
end, a log slice) — **no words** (§11). The plaque is what pulses, what scales on press, and what
the child aims at; the arch behind it is painted into the plate.

- Hit boxes are inflated to ≥ 96 CSS px by the scene's `minHit`.
- A room already completed **this round** shows its plaque with the room's target bug's happy
  sprite tucked into the corner at 46 % scale, and its pip is filled. It stays tappable — a child
  may revisit; revisiting replays the room with the same target and re-shows the reward without
  re-adding the sticker (`journal.add` is idempotent).
- On arrival all four plaques run one **pulse sweep**, left to right, 120 ms apart.

**HUD:** back top-left → splash. Sound top-right → re-speaks `pick-room`. Journal tab
bottom-left (`assets/props/mode-book.webp`, 128 CSS px — see §11 row 14) → the journal overlay. Four room pips
bottom-centre (28 px, gap 18; filled `#5f8f3a`, empty `#fbf3e2` with a 3 px `#c9b590` ring).

### 2.5 ROOM — the mockup-02 composition

```
┌──────────────────────────────────────────────────────────────┐
│ (back)   ╔═══════════════════════════════╗       [plaque]    │ ← prompt banner (adults) +
│          ║      Can you find the         ║       ( ・ )      │   target plaque (bug-hunt only)
│          ║          ladybug?             ║                   │
│          ╚═══════════════════════════════╝                   │
│    ╭──────────╮        ╭──────────╮                          │
│    │  nook 1  │        │  nook 3  │      ╭──────────╮        │ ← arched hollows painted
│    ╰──────────╯        ╰──────────╯      │  nook 4  │        │   into the plate
│                    ___                   ╰──────────╯        │
│                  /  ●  \  ← the lens: the ONLY place a       │
│    ╭──────────╮ |  bug  |    hidden bug is visible           │
│    │  nook 2  │  \_____/                                     │
│    ╰──────────╯       \__                                    │
│                          \__  ← paper handle                 │
│ (sound)   ( journal tab )              ● ○ ○ ○               │
└──────────────────────────────────────────────────────────────┘
   background: assets/bg-room-<id>.jpg (arched hollows, 4 clear nooks, NO bugs baked in)
```

**Layer stack:**

```
z0   room plate              assets/bg-room-<id>.jpg, cover-fit, evenly lit, no baked bugs
z1   base hotspots           <button> per FOUND bug (empty + disabled until found)
z2   lens world              circular clipped div: duplicate plate img @ scale*zoom
                             + duplicate <img> per UNFOUND bug           pointer-events:none
z3   lens frame              assets/props/magnifier.webp (ring + handle)  pointer-events:none
z4   lens drag surface       ring circle + handle bar + the legacy grip <button>,
                             touch-action:none. Covers the glass; a press that
                             does not travel 12 px is forwarded to what is under
                             it (§11 row 23)
--- HTML HUD overlay, CSS px ---
h1   prompt banner (top-centre) · back (top-left) · target plaque (top-right)
h2   sound (bottom-left) · journal tab (bottom-left, inboard) · 4 room pips (bottom-centre)
h3   reward spread (mounted only on `reward`) · journal overlay
```

**HUD geometry, CSS px, both orientations:**

| element | anchor | size | notes |
|---|---|---|---|
| prompt banner | top-centre, `top: max(18px, safe-area + 8px)` | `min(84vw, 900px)` × ≥ 88 | torn-cream CSS pill `#fbf3e2`, radius 40, 5 px `#c9b590`. Fredoka 600 **38 px** `#3f2b18`. **`pointer-events: none` — it is a caption for grown-ups, not a control.** The child's prompt is the voice. |
| back | top-left, `max(16px, safe-area)` | 112 × 112 | `btn-back.png` → hotel |
| target plaque | top-right, `max(16px, safe-area)` | 128 × 128 | the target bug's `plaque`-styled thumb — **`bug-hunt` only**; absent in `bug-detective` |
| sound | bottom-left, `max(16px, safe-area)` | 112 × 112 | `btn-sound.png`; re-speaks the full prompt; debounced 600 ms |
| journal tab | bottom-left, inboard of sound by 20 px | 128 × 128 | `assets/props/mode-book.webp` (§11 row 14) |
| room pips | bottom-centre, `bottom: max(16px, safe-area)` | 4 × 28, gap 18 | **rooms visited this round, not bugs.** This is the mockup's "1 of 4", de-numeralised (§11) |

**HUD reserve.** The game passes the live `getBoundingClientRect()` of the banner, the plaque,
the pips, back, sound and the journal tab to `scene.setReserve()` on every reflow, and passes the
same rects to `lens.setReserve()` so the lens cannot be parked under the HUD. This is the single
mechanism that keeps art and HUD from colliding at any aspect ratio.

**What the child can touch:** the lens — anywhere on the ring, the glass or the handle —
(drag), any **found** bug (tap, *including through the glass*), back, sound, the
journal tab. Bare plate does nothing at all — no sound, no wiggle, no scold.

### 2.5a THE STAGE BOX — full-bleed on a tablet, a framed diorama on a wide window

The play field cover-fits its box and the art is 4:3. On a tablet that is nearly free
(1194×834 crops 6.9 % off the top and bottom and the composition survives). On a **2000×960
desktop window (2.08:1)** the same cover-fit ate 36 % of the picture: the hotel's red roof was
gone, the HUD reserve shoved the plaques off their own rooms, and the child had to drag the
glass into the far corners of a very wide screen. So past a certain width the stage stops being
the window and becomes a **card**: a centred diorama on a blurred, slightly dimmed duplicate of
its own plate — the treatment the splash already gives the hotel (§2.3).

| | |
|---|---|
| **when the frame appears** | viewport ≥ **1400 px wide**, or ≥ 1000 px wide **and 3:2 or flatter**. iPad landscape (1194 px, 1.43:1) sits under both on purpose: the shipped tablet composition does not move by a pixel. Portrait and phone never frame. |
| **card size** | the biggest box inside `viewport − clamp(24px, 3vmin, 48px)` on every side whose aspect stays between **1.25:1 and 1.4:1** |
| **the surround** | `#stage-surround` — the CURRENT plate again, `blur(16px) brightness(.84) saturate(.94)`, `display:none` until the frame exists (a full-screen filter is what costs an old iPad frames). `--stage-plate` is set by `js/main.js` from the field's `on.plate` callback, i.e. from the same RESOLVED url the scene painted, so the two can never disagree. |
| **the border** | `border-radius` + a 7 px cream / 12 px kraft `box-shadow` ring + a soft cast shadow. Spread shadow, not `border`, so the scene's box — and every art coordinate — is untouched. Same paper-on-kraft as the banner and the fact card. |
| **what moves with the card** | banner, target plaque, room pips, journal tab. They are written against `--stage-x/-y/-w/-h`, which are `0 / 0 / 100 % / 100 %` everywhere else, so the tablet CSS is arithmetically identical. |
| **what stays at the window corners** | back and sound. They are the way *out*, not part of the picture. |

At 2000×960 the card measures **1263 × 902** (1.4:1), the art crops 4.8 % vertically (28.7 art px
a side — the roof apex is at y≈32 and survives), all four plaques sit on their own rooms, and no
HUD rect touches one.

### 2.6 REWARD — the mockup-03 composition

Not a new page: the journal spread slides **up over** the room, which stays mounted underneath
(the room is still faintly visible at the edges, which is what makes it feel like a book opened
on top of the world).

```
┌──────────────────────────────────────────────────────────────┐
│                                                              │
│    ╔════════════════════════════════════════════════════╗    │
│    ║        [ assets/lockups/fact-found.webp ]          ║    │ ← authored lockup, drops in
│    ║                                                    ║    │
│    ║    ┌──────────┐      ┌───────────────────────┐     ║    │
│    ║    │  (bug    │      │  A ladybug's red wing │     ║    │ ← HTML Fredoka fact text
│    ║    │   happy  │      │  covers are like tiny │     ║    │   (grown-ups only —
│    ║    │   frame) │      │  doors…               │     ║    │    the child hears it)
│    ║    └──────────┘      └───────────────────────┘     ║    │
│    ║                                                    ║    │
│    ║   [ sticker grid, 4 × 3 ]      ( Next Room )       ║    │
│    ╚════════════════════════════════════════════════════╝    │
│         background: assets/bg-journal.jpg (spiral kraft)     │
└──────────────────────────────────────────────────────────────┘
```

Beat order and voice: §9.5–9.6. **Controls:** Next Room (`btn-play.png`, 132 CSS px, right of the
sticker grid, `aria-label="Next room"`) and back (top-left). Auto-advances at 14 s.

### 2.7 JOURNAL / MY BUG BOOK

The same spread as §2.6 with the fact card replaced by a 4 × 3 sticker grid across the full
spread. It is reachable two ways and behaves identically in both:

- as an **overlay** from the journal tab on `hotel` or `room` (back / the tab closes it and
  returns to the screen underneath, which was never unmounted);
- as a **mode** from the splash (back returns to `splash`).

A filled slot is a `<button class="sticker">` whose face is that bug's **happy** sprite on
`assets/props/sticker-backing.webp`. Tapping it: sticker pulses 220 ms →
`bug-<id>-name` → 240 ms gap → `bug-<id>-fact`. An empty slot is the backing at 26 % opacity with
a dashed cut-paper outline, `disabled`, `aria-label="not found yet"`, and taps do nothing at all.
On entry: `journal-open` if any sticker exists, `journal-empty` if none, then `journal-tap` after
a 600 ms gap when at least one sticker exists.

### 2.8 CELEBRATION and END

**CELEBRATION** (after room 4 of a round): the journal spread stays up, all four pips fill, paper
confetti (CSS, `shared/js/sfx.js` chime) drifts across, the four bugs collected this round rise
out of the grid to 150 CSS px in a row, and `round-done` plays. Control: **Keep Exploring**
(`btn-play.png`) → `end`. Auto-advances at 16 s.

**END**: hotel plate dimmed to 55 % behind a warm cream veil; the full 4 × 3 sticker grid centred
so the child can see how much of the book is filled; `cheer-end`. **Play Again**
(`btn-play.png`) → `splash`. Back → `splash`. The end screen holds indefinitely — a resting
place, not a timeout.

### 2.9 Rules that hold on every screen

**Back, from anywhere.** One handler: `voice.stop()`, `speech.stop()`, `ambience.stop()`, clear
every idle / auto-advance / dwell / choreography timer, `lens.destroy()`, `scene.clear()`,
unmount the HUD, mount the destination. Safe mid-drag, mid-reveal, mid-fact. It **never
navigates** except from the splash's home button. Session state (which greeting lines have
played, the seed, the round index) survives; room state does not.

**Resize and orientation change.** Every authored number is in art space, so a resize recomputes
the cover-fit transform, re-measures the HUD reserve and re-clamps everything. `scene.onReflow`
fires; the game re-places hotspots and calls `lens.resync()`. **A resize never re-rolls
placements** — a bug must not move under a child's finger. **A resize never cancels an in-flight
drag**; the lens is re-registered at its current art position.

> **The one exception — §4.3a.** A rotation changes *which slice* of the 4:3 plate the window
> shows, and a narrow crop can leave the round's **target** outside it, which makes the room
> unwinnable. So on reflow, and only then, the target — **only the target, and only while it is
> still hidden** — is moved back inside the reachable band, by the same deterministic ladder
> `enterRoom` ran. Nothing is re-rolled: the PRNG is not touched, the authored zones do not move,
> the two bonus bugs do not move, and **a bug the child has already found never moves.**

**Backgrounding the tab.** On `visibilitychange → hidden`: stop voice, stop ambience, pause all
timers, and **settle any in-flight lens drag in place** (§5.2.6). On `visible`: resume ambience,
re-arm idle timers from zero. Nothing auto-advances while hidden.

**Total page weight.** Splash ≈ 300 KB (hotel plate) + 150 KB (title) + ~90 KB (3 mode faces).
Entering a room adds one plate (≤ 300 KB) + 6 sprites (≤ 60 KB each) — note the lens duplicates
the *same* `<img>` URLs, so magnification costs no extra bytes. A full round ≈ 2.4 MB, inside
`docs/art-direction.md`'s ~4 MB page target. Voice clips are never preloaded.

---

## 3. Verbatim voice script — this IS the recording manifest

One voice: the platform teacher voice, cloned from `shared/assets/refs/voice-teacher.wav` — a
warm grown-up crouching next to the child at the bug hotel, delighted and unhurried. **Never
disappointed, never urgent, never loud.** Facts are told the way you tell a five-year-old a
secret.

Every clip plays through `shared/js/voice-clips.js` (game-local `js/voice.js` wrapper) with its
line text as `fallbackText`. **`tools/lines.json` is `{ "<voice-id>": "<exact spoken text>" }`
and is the single source both for `tools/gen-voice.py` and for the Web Speech fallback**, so a
clip and its fallback can never drift. A clip that fails Whisper QA on three seeds ships
unrecorded and is spoken by `speech.js` instead. It degrades; it never breaks.

**75 clips: 23 global + 4 room intros + 12 bugs × 4.** No clip is composed from fragments — at
this age a whole warm sentence beats a stitched one, and 75 is a tractable recording bill.
(74 shipped with P8; `pick-room` was added in the wide-viewport fix pass — see §11.)

### 3.1 The audio-unlock rule — nothing speaks before the first gesture

`index.html` mounts the splash and **plays nothing**. `welcome` is armed, not played.

```js
function unlockAudio() {           // idempotent, but CALLED ON EVERY GESTURE, not once
  sfx.unlock(); speech.unlock(); voice.unlock(); ambience.unlock();
}
window.addEventListener('pointerdown', unlockAudio, { capture: true });
```

Calling unlock on **every** `pointerdown` — not just the first — is the platform's iPad
hardening; a single unlock can be lost to a tab switch or an interrupted gesture. **Speaking a
recorded line before the unlock is what silently degrades it to the system speech voice**, which
is the exact failure this rule exists to prevent.

**Interruption is always allowed.** `say()` stops the current clip and cancels Web Speech before
starting the next. **Nothing in this game ever waits for audio before accepting input** — not the
welcome, not the room prompt, not the fact.

### 3.2 The 22 global lines

**Chrome · 4**

| id | line |
|---|---|
| `welcome` | Hello, little explorer! Welcome to the bug hotel. |
| `mode-bug-hunt` | Bug Hunt! I will name a bug, and you find it with your magnifying glass. |
| `mode-bug-detective` | Bug Detective. I will tell you a secret about a bug. Can you work out who it is? |
| `mode-my-bug-book` | My Bug Book. Here are all the bugs you have found. Tap one to hear about it again. |

**Prompts · 4**

| id | line |
|---|---|
| `pick-room` | Which room shall we peek into? Tap one! |
| `prompt-look` | Somebody tiny is hiding in this room. Let's have a look. |
| `prompt-lens` | Drag the magnifying glass over the little rooms to look closely. |
| `prompt-again` | Here it is one more time. |

**Discovery · 2** — bright, delighted, a real discovery.

| id | line |
|---|---|
| `getting-closer` | Ooh, you are getting close. Keep looking. |
| `found-tap` | You found one! Tap the bug to say hello. |

**Idle · 2** — quiet, patient, spoken as if leaning in. Never nagging.

| id | line |
|---|---|
| `idle-1` | Take your time. Little bugs like to hide. |
| `idle-2` | Try moving the magnifying glass into a dark little corner. |

**Redirect · 1** — curious, never corrective. It does not contain the words "no" or "wrong".

| id | line |
|---|---|
| `nudge-wrong` | Hello, little one! But that is not the bug we are looking for. Let's listen again. |

**Yes · 3** — rotated from a seeded deck (§3.6).

| id | line |
|---|---|
| `yes-1` | Yes! You found it. |
| `yes-2` | That's the one! Great looking. |
| `yes-3` | You spotted it. What sharp eyes. |

**Collect and move on · 4**

| id | line |
|---|---|
| `sticker` | A new sticker for your bug book! |
| `next-room` | Let's visit the next room. |
| `round-done` | You visited every room in the bug hotel. |
| `cheer-end` | What a wonderful bug watcher you are. Thank you for looking so gently. |

**Journal · 3**

| id | line |
|---|---|
| `journal-open` | This is your bug book. Every bug you find comes to live in here. |
| `journal-empty` | Your bug book is waiting. Go and find your first bug! |
| `journal-tap` | Tap a sticker to hear about that bug again. |

That is **22**.

### 3.3 The 4 room intros

| id | line |
|---|---|
| `room-leaf` | The Leaf Room. It is green and cool in here, with soft leaves to hide under. |
| `room-bark` | The Bark Room. Little pieces of bark make dark, dry hiding places. |
| `room-bamboo` | The Bamboo Room. These hollow tubes are like tiny round doorways. |
| `room-log` | The Log Room. Under the old damp wood, it is dark and quiet. |

### 3.4 The 48 bug lines — 12 bugs × { find, name, fact, clue }

**Recording direction.** `find` is a real question, with a rising, inviting end. `name` is one
delighted word — it is the sound of meeting somebody. `fact` is confiding and slow; it is the
only place in the game where the voice slows down. `clue` is a riddle spoken *in the bug's own
first person*, playful, with a real pause before "Who am I?".

**Leaf Room**

| id | line |
|---|---|
| `bug-ladybug-find` | Can you find the ladybug? |
| `bug-ladybug-name` | Ladybug! |
| `bug-ladybug-fact` | A ladybug's red wing covers are like tiny doors. Underneath, it keeps its flying wings folded up. |
| `bug-ladybug-clue` | I am small and round and red, with little black spots on my back. Who am I? |
| `bug-caterpillar-find` | Can you find the caterpillar? |
| `bug-caterpillar-name` | Caterpillar! |
| `bug-caterpillar-fact` | A caterpillar eats leaves all day so it can grow big. One day it will turn into a butterfly or a moth. |
| `bug-caterpillar-clue` | I am long and squishy, and I have lots and lots of little legs. Who am I? |
| `bug-snail-find` | Can you find the snail? |
| `bug-snail-name` | Snail! |
| `bug-snail-fact` | A snail carries its house on its back. When it wants to feel safe, it curls up inside its shell. |
| `bug-snail-clue` | I move very, very slowly, and I carry a curly shell on my back. Who am I? |

**Bark Room**

| id | line |
|---|---|
| `bug-ant-find` | Can you find the ant? |
| `bug-ant-name` | Ant! |
| `bug-ant-fact` | Ants are very strong. One little ant can carry a crumb much bigger than itself. |
| `bug-ant-clue` | I am tiny and busy, and I walk in a long line with all my friends. Who am I? |
| `bug-roly-poly-find` | Can you find the roly-poly? |
| `bug-roly-poly-name` | Roly-poly! |
| `bug-roly-poly-fact` | When a roly-poly feels shy, it rolls up into a little grey ball, just like a pea. |
| `bug-roly-poly-clue` | I have a bumpy grey back, and when I am shy I roll up into a tiny ball. Who am I? |
| `bug-worm-find` | Can you find the worm? |
| `bug-worm-name` | Worm! |
| `bug-worm-fact` | Worms dig tunnels in the soil. The tunnels let in air and water, and that helps plants grow. |
| `bug-worm-clue` | I am long and pink and wiggly, and I love to dig down into the cool soil. Who am I? |

**Bamboo Room**

| id | line |
|---|---|
| `bug-bee-find` | Can you find the bee? |
| `bug-bee-name` | Bee! |
| `bug-bee-fact` | A bee visits flowers to drink sweet nectar. As it goes, it carries yellow pollen from flower to flower. |
| `bug-bee-clue` | I am yellow and black and fuzzy, and I buzz from flower to flower. Who am I? |
| `bug-butterfly-find` | Can you find the butterfly? |
| `bug-butterfly-name` | Butterfly! |
| `bug-butterfly-fact` | A butterfly tastes with its feet. It stands on a flower to find out if it is a nice one to drink from. |
| `bug-butterfly-clue` | I have big bright wings, and I flutter softly through the air. Who am I? |
| `bug-grasshopper-find` | Can you find the grasshopper? |
| `bug-grasshopper-name` | Grasshopper! |
| `bug-grasshopper-fact` | A grasshopper has strong back legs like springs. It can jump much further than its own body is long. |
| `bug-grasshopper-clue` | I am green with long bendy back legs, and I can jump very high. Who am I? |

**Log Room**

| id | line |
|---|---|
| `bug-beetle-find` | Can you find the beetle? |
| `bug-beetle-name` | Beetle! |
| `bug-beetle-fact` | A beetle wears a hard shiny shell on its back. It works like a tiny suit of armour. |
| `bug-beetle-clue` | I have a smooth shiny back, like a little shield, and I trundle along the wood. Who am I? |
| `bug-spider-find` | Can you find the spider? |
| `bug-spider-name` | Spider! |
| `bug-spider-fact` | A spider has eight legs, and it spins silky thread to make a web. The web catches its dinner. |
| `bug-spider-clue` | I have eight legs, and I make a soft silky web to sit in. Who am I? |
| `bug-cricket-find` | Can you find the cricket? |
| `bug-cricket-name` | Cricket! |
| `bug-cricket-fact` | A cricket sings by rubbing its wings together. You can often hear crickets chirping at night. |
| `bug-cricket-clue` | I am dark and small with long whiskers, and I chirp a little song at night. Who am I? |

23 + 4 + 48 = **75**. `tools/lines.json` contains exactly these 75 ids and these 75 strings,
character for character. QA asserts the two agree (§13.1).

### 3.5 Runtime sequencing

| moment | sequence | gaps (ms) |
|---|---|---|
| enter a mode | `mode-<id>` | — |
| enter a room, `bug-hunt` | `room-<id>` → `bug-<target>-find` | 260 |
| enter a room, `bug-detective` | `room-<id>` → `prompt-look` → `bug-<target>-clue` | 260 / 260 |
| first entry to any room in a session | …then `prompt-lens` | 400 |
| sound button, hotel select | `pick-room` | — |
| sound button, `bug-hunt` | `bug-<target>-find` | — |
| sound button, `bug-detective` | `prompt-again` → `bug-<target>-clue` | 140 |
| lens dwells near a bug (within `gettingCloserRadiusArt`, not yet revealing) | `getting-closer` | cooldown 6 s |
| a bug is revealed, **first of the room** | `found-tap` | — |
| a bug is revealed, subsequent | *(sfx only — no line; the room would get chatty)* | — |
| tap a **non-target** bug | `bug-<tapped>-name` → `nudge-wrong` | 140 |
| tap a non-target bug in `bug-detective` | …then `bug-<target>-clue` | 300 |
| tap the **target** bug | `bug-<target>-name` → `yes-N` → *(spread opens)* → `bug-<target>-fact` → `sticker` | 140 / 320 / 260 |
| Next Room pressed | `next-room` | — |
| room 4 reward closes | `round-done` | — |
| celebration → end | `cheer-end` | — |
| journal opens (has stickers) | `journal-open` → `journal-tap` | 600 |
| journal opens (empty) | `journal-empty` | — |
| tap a filled sticker | `bug-<id>-name` → `bug-<id>-fact` | 240 |

**Rule:** `sticker` is **suppressed** when the bug is already in the journal (a re-visit or a
4th-round repeat) — the sticker pulses in place instead of flying in, and the child hears the
fact, which is the part worth repeating.

### 3.6 Variant rotation and idle timing

`yes-1..3` and `idle-1..2` rotate from **seeded shuffled decks**, drawn without replacement and
reshuffled when exhausted, never repeating a variant twice in a row (on reshuffle, if the new
first card equals the last card played, swap it with the second). The deck seed comes from
`QLOBE_DEBUG.seed(n)`; the default is `Date.now() & 0xffff`. The same FNV-1a PRNG drives zone
selection (§4.3), so `seed(n)` pins the whole game for QA.

Idle timers are cleared by any `pointerdown` in the play field and restart from zero. All scale
with `QLOBE_DEBUG.fastTimers(scale)`.

| elapsed with no interaction | what happens |
|---|---|
| **12 s** (`tuning.idleMs`) | an idle line from the deck **and** one lens glint; on `hotel`, a plaque pulse sweep instead |
| every **15 s** after (`tuning.idleRepeatMs`) | alternate: the room prompt re-spoken in full, then an idle line + glint |

**There is no tier that points at the answer.** The lens is never auto-moved and no nook is ever
highlighted. Searching *is* the skill; a hint that showed the bug would delete it. `idle-2`
teaches the *gesture*, which is the only thing a stuck five-year-old actually lacks.

---

## 4. Rooms, bugs, rounds and placement

### 4.1 The four rooms and twelve bugs

| room | material | bugs (canonical order — this order IS the difficulty ladder) |
|---|---|---|
| `leaf` | layered paper leaves, moss, a green stem | **ladybug**, caterpillar, snail |
| `bark` | torn bark chips, dry crumbs, dark hollows | **ant**, roly-poly, worm |
| `bamboo` | cut bamboo tube ends, kraft rings | **bee**, butterfly, grasshopper |
| `log` | old damp log slice, soil, pale fungus shelves | **beetle**, spider, cricket |

Each bug is in the room it would really live in. That is the science content: the child learns
*where a bug lives* by learning *where a bug is*.

Rooms are visited in this fixed order within a round: `leaf → bark → bamboo → log`. Fixed order
is deliberate — a five-year-old builds a mental map of the hotel across sessions, and a shuffled
building is a different building each time.

### 4.2 Rounds and the target cycle — difficulty progression

**Round `r` targets `room.bugs[r mod 3]` in every room.**

| round `r` | leaf | bark | bamboo | log |
|---|---|---|---|---|
| 0 | ladybug | ant | bee | beetle |
| 1 | caterpillar | roly-poly | butterfly | spider |
| 2 | snail | worm | grasshopper | cricket |
| 3 | *(cycles back to round 0's targets)* | | | |

*This table is **generated, not authored** — it is exactly `room.bugs[r % 3]` against the
canonical bug order in §4.1. Nothing in `config.json` restates it.*

Three consequences, all intentional:

1. **Three rounds collect all twelve bugs, each exactly once.** The journal fills in ≈ 10 minutes
   of play and the last sticker is a real event.
2. **All three of a room's bugs are on screen in every round** — only the *target* changes. So
   round 1 in the Leaf Room is the same picture as round 0 with a different question, which is
   the purest possible "repeat with variation" (`philosophy.md` principle 7) and it forces the
   child to actually *listen* rather than re-run a memorised gesture.
3. **The difficulty ladder is inside the bug order.** `bugs[0]` of each room is the most visually
   distinctive (ladybug, ant, bee, beetle — high-contrast, unmistakable); `bugs[1]` and `bugs[2]`
   are progressively easier to confuse with their roommates (caterpillar vs worm shape logic,
   snail vs roly-poly curl, butterfly vs bee wings, spider vs cricket legs). So round 0 is
   "find the obvious one", round 2 is "tell these three apart".

**The round index is derived, never separately stored:**

```
round = min over rooms of ( number of that room's bugs present in the journal )
```

It therefore survives a reload for free, resets when the journal is cleared, and cannot
disagree with the sticker grid. Once all twelve are collected `round` is 3, `3 % 3 === 0`, and
the cycle repeats from the top with the stickers already owned (§3.5's suppression rule).

### 4.3 Zone selection and placement — the seeded rule

Every room authors **four** nooks and every round places **three** bugs, so **one nook is always
empty** and *which* nook is empty changes between rounds. This is what stops a child memorising
four fixed dots.

```js
const rng   = fnv1a(`${seed}|${mode}|${room.id}|${round}`);
const nooks = pickN(room.zones, 3, rng);          // 3 of the 4 authored zones, seeded
const order = shuffle(room.bugs, rng);            // which bug gets which nook, seeded
// bug order[i] is centred on nooks[i], drawn at bugs[].artSize on its longest edge
```

- `pickN` and `shuffle` share one FNV-1a stream, so `(seed, mode, room, round)` fully determines
  the layout — `QLOBE_DEBUG.seed(42)` pins every room in every round for QA, and two real
  sessions differ.
- **`mode` is in the hash**, so Bug Hunt and Bug Detective place the same bugs differently in the
  same round. A child who learned where the ladybug was in Bug Hunt still has to search in Bug
  Detective.
- Placement is computed **once**, when the room mounts, and **never** recomputed on a resize.
- There is **no jitter**. Zone centres are authored against the real plates in P6 so each bug sits
  convincingly inside a painted hollow; a random offset would push a bug onto a paper edge.

**Zone invariants (QA-asserted, §13.1):** every zone centre lies inside `x ∈ [420, 1180]` and
`y ∈ [300, 1000]`; no two zones in a room are closer than 220 art px; every zone clears the HUD
reserve at all six reference viewports.

### 4.3a The target is always reachable — the narrow-crop guarantee

The rule above is authored for a tablet, where the whole 1600×1200 plate is on screen. The scene
**cover**-fits, so a narrow window sees only a vertical band of it: a **390×844 phone reaches art
`x ∈ [523, 1077]`** — 555 art px of a 1600 px picture. The leaf room's four nooks sit at
`x = 466 / 478 / 831 / 1150`, so three of the four are off that crop, and a seeded round that
landed the **target** in one of them could not be finished at all. The child dragged the glass to
the edge of the screen and the ladybug was simply not in the room.

**The zones do not move.** They are authored against the painted hollows of the real plates (P6)
and the tablet composition is not changed by one pixel. What moves, and only when it has to, is
the **target's placement**:

```
band = scene.visibleArt() inset by 120 art px  (capped at ⅓ of the visible span)
if the target's nook is inside the band            -> nothing happens (the tablet case, always)
1. else swap with a placed, still-hidden bug whose nook IS inside   (both stay in painted nooks)
2. else relocate to the nearest FREE authored nook inside the band  (usually §4.3's empty fourth)
3. else clamp artX/artY into the band              (no reachable nook exists at all; artY survives
                                                    untouched whenever the crop is horizontal)
```

- **Only the target is guaranteed.** The other two bugs are bonus finds (§4.2) and may stay off
  the crop — a phone player finds one bug per room and still completes every round and the book.
- **The 120 px inset** is not cosmetic: the glass is 360 art px across and the dwell radius is
  150, so a bug pinned to the last visible column would need the child to park the glass half off
  the plate.
- **Still deterministic.** The ladder reads placement order, authored zone order and the viewport
  — never the clock and never the PRNG. **Same seed + mode + round + viewport ⇒ same layout**, so
  `QLOBE_DEBUG.seed(42)` still pins QA; only the *viewport* is now part of "same layout".
- It runs once in `enterRoom`, and again on reflow under the §2.9 exception.

### 4.4 Keep-out derivation

| keep-out (art px) | what it is |
|---|---|
| `y < 300` | prompt banner + back + target plaque |
| `y > 1000` | sound, journal tab, room pips |
| `x < 420` and `x > 1180` | the portrait crop — at 834 × 1194 only art `x ∈ [381, 1219]` is visible |

The zone band in §4.3 is the **contract**; this table is its derivation. If a zone is ever
re-tuned, re-check it here.

**P6 added a second, tighter rule for the right-hand column.** Keeping the *centre* inside
`x ≤ 1180` is not enough: a bug is drawn `artSize` wide around that centre, so a nook centred in
its arch at x ≈ 1196 put a quarter of the sprite past the portrait crop's right edge (1219). The
right-hand nooks therefore sit at **x ≈ 1150** — slightly left of their arch, entirely on screen
in both orientations. The shipped table, measured off the plates:

| room | nook 1 | nook 2 | nook 3 | nook 4 |
|---|---|---|---|---|
| `leaf` | 478, 380 | 466, 790 | 831, 795 | 1150, 790 |
| `bark` | 478, 380 | 466, 790 | 831, 795 | 1150, 790 |
| `bamboo` | 555, 490 | 545, 900 | 890, 890 | 1060, 650 |
| `log` | 485, 378 | 472, 793 | 835, 795 | 1152, 786 |

Closest pair in any room: 290 art px (`bamboo` nooks 3–4). Every nook is ≥ 344 art px from the
lens's parked centre — glass radius plus half a bug — so nothing is half-visible before the
search starts.

### 4.5 Replay variation — what changes each play

| what | changes with | so 100 rounds are not identical |
|---|---|---|
| which bug is the target | `round` | 3-round cycle, then repeats with the journal already full |
| which nook is empty | `(seed, mode, room, round)` | 4 choose 3 = 4 arrangements × 3! orders = 24 layouts per room per mode |
| which bug is in which nook | same | — |
| the praise line | seeded `yes` deck | never twice running |
| the idle line | seeded `idle` deck | never twice running |
| ambience | `js/ambience.js` — sparse randomised cricket chirps, breeze swells, a bamboo-room bee hum | never loops audibly |

---

## 5. Shared modules — used, and strengthened

### 5.1 `shared/js/hotspot-scene.js` — used unmodified, second consumer

**The file stays byte-identical.** Rhyming Detective is its first consumer; this game is the
second, and *being a second consumer through the public API only* is the point — it is how the
module gets proven rather than special-cased. Everything this game needs already exists:

| what the game needs | API used |
|---|---|
| the one art↔screen transform | `scene.toScreen` / `scene.toArt` / `scene.visibleArt` / `scene.scale` |
| re-place on resize | `scene.onReflow(cb)` |
| room and hotel plates with a crossfade | `scene.setBackground(url, { ms })` |
| four exterior room hotspots (plaque sprites) | `scene.addHotspot({ id, x, y, w, h, sprite, alt, z })` |
| a bug that does not exist until it is found | `addHotspot({ sprite: null, enabled: false })` → later `h.setSprite(url)` + `h.setEnabled(true)` |
| the discovery pop | `h.pop()` |
| the happy wiggle on tap | `h.wiggle()` |
| the plaque attract sweep | `h.pulse()` |
| the sticker flying into the grid | `h.flyTo(rect)` |
| keeping hotspots out from under the HUD | `scene.setReserve(fn)` |
| teardown | `scene.clear()` / `scene.destroy()` |

**Two robustness expectations this consumer places on the module** (verified against
`hotspot-scene.js:757-773, 1193-1203` at design time, and asserted by `tools/qa.mjs`):
`setSprite(url)` on a hotspot constructed with `sprite: null` must mount an `<img>` and paint;
and `setEnabled(true)` after construction with `enabled: false` must restore full
`<button>` semantics including keyboard focus. If either turns out to be untrue, **the fix is a
new Phase 0 for `hotspot-scene.js`, not a workaround here and not an edit inside this build.**

### 5.2 `shared/js/magnifier-lens.js` — NEW shared module (P2)

The one genuinely new capability. It is a **companion** to `hotspot-scene.js`, not a fork: it
takes a scene and renders a second, magnified copy of that scene's world inside a circular clip.

```js
import { createLens } from '../../../shared/js/magnifier-lens.js';

const lens = createLens(scene, {
  zoom:        1.6,     // magnification of the world inside the glass
  glassD:      360,     // ART px diameter of the transparent glass hole   (P6: was 320)
  gripOffset:  205,     // ART px from glass centre to the grip's centre   (P6: was 44)
  gripDir:     { x: 0.768, y: 0.641 },  // MEASURED handle direction       (P6)
  gripSize:    0.62,    // drag button edge / glass diameter               (P6: module default 0.8)
  gripMinCssPx: 140,    // the invisible drag button never gets smaller than this
  frame: {              // MEASURED from the sprite — see §11.1            (P6)
    url:    'assets/props/magnifier.webp',   // authored ring + handle, true-alpha glass hole
    scale:  2.4194,                          // frame box edge / glassD
    anchor: { x: 0.4067, y: 0.44 },          // where the hole sits inside the frame box
  },
  reducedMotion: null,  // null = live-track the media query
});
```

**The three `frame` / `grip` numbers are measurements, not taste.** `tools/fix-cutouts.py
glass_aperture()` finds the largest circle inside the ring's opaque inner edge and prints them;
with the module's defaults instead, the magnified world sat visibly outside the paper ring.
`gripOffset` × `gripDir` puts the invisible button on the handle, and `gripSize` keeps it small
enough that **it never contains the glass centre**. That last property no longer carries the
weight it used to: since §11 row 23 the whole lens is draggable and a tap that lands on it is
forwarded to what is underneath, so a bug revealed under the glass stays tappable by
disambiguation rather than by the grip staying out of the way. The smoke suite asserts both
properties anyway — the grip is unchanged.

**5.2.1 What it draws.** A `div` with `border-radius: 50%; overflow: hidden; will-change:
transform`, containing (a) a duplicate `<img>` of the scene's current background at
`art · scale · zoom`, and (b) one duplicate `<img>` per registered sprite at the same factor.
Each rAF, the inner world is offset so **the art point under the glass centre magnifies in
place**. `translate3d` only — no per-frame layout, no filters, no `backdrop-filter` (which is the
thing that kills an old iPad).

**5.2.2 The frame.** `assets/props/magnifier.webp` sits on top at `pointer-events: none` with a
**true alpha hole** where the glass is. The paper ring and the wooden handle are authored art;
CSS contributes only the clip and the shadow.

**5.2.3 The drag surface** (was "the grip" — §11 row 23). Three invisible shapes under one
`div.ml-surface`, `touch-action: none`, all bubbling into a single `pointerdown` listener:

* `.ml-surface-ring` — a circle of `dragRing`·`glassD` (1.46 by default, measured off
  `magnifier.webp`: the paper ring is fully opaque out to 0.72·`glassD`) centred on the glass,
* `.ml-surface-handle` — a rounded bar `dragHandleW`·`glassD` wide running `dragHandleLen`·`glassD`
  out along `gripDir`,
* `.ml-grip` — the original invisible `<button>`, unchanged, still the lens's one focusable
  control (arrow keys nudge through the same `applyCentre`).

A press is a **tap** until it travels `dragSlopPx` (12 CSS px); past that it is a drag and the
window-level machinery of 5.2.6 takes over unchanged. A tap goes to whatever is under the glass
(§11 row 23). When the lens is disabled or hidden the surface is inert, so a large invisible
shape can never become a dead patch of screen.

**5.2.4 API.**

| call | meaning |
|---|---|
| `setBackground(url)` | mirror the scene's plate into the glass |
| `setSprites([{ id, url, x, y, w, h }])` | the hidden world |
| `showSprite(id)` / `hideSprite(id)` | a sprite exists in the lens world, or does not |
| `markFound(id[, on])` **(P6)** | the sprite STAYS in the glass but stops arming the dwell — the reveal hand-off this game actually uses (§11 row 13) |
| `setSpriteUrl(id, url)` **(P6)** | swap one sprite's picture in place, box untouched: the found bug's happy frame changes under the glass too |
| `moveTo(artX, artY, { animate })` | **the same code path the drag uses** — `QLOBE_DEBUG.setLens` calls this |
| `getCentre()` | `{ x, y }` in art px |
| `onMove(cb)` | fires per settled frame with the art centre |
| `onDwell(cb, { radiusArt, ms })` | fires once when the centre stays within `radiusArt` of a registered sprite for `ms` |
| `setEnabled(on)` | disable during the reward spread and the journal overlay |
| `setReserve(fn)` | HUD rects the lens may not park under |
| `glint()` | one sheen sweep across the glass; a no-op under reduced motion |
| `resync()` | recompute from `scene.scale` / offsets; called from `scene.onReflow` |
| `destroy()` | remove every node and every window listener |

**5.2.5 The dwell contract.** `onDwell` fires **once per sprite per reveal**, resets when the
centre leaves `radiusArt`, and does **not** re-arm for a sprite that has been hidden.
`tuning` ships `dwellMs: 600`, `dwellRadiusArt: 150`.

**5.2.6 Drag is strand-proof** (`docs/interaction-patterns.md` §11, the hard requirement):
window-level `pointermove` / `pointerup` / `pointercancel` **plus** `blur` and
`visibilitychange`; a single-drag lock keyed on `pointerId`; **every terminal path settles the
lens in place and leaves it draggable again**. No reliance on `setPointerCapture` — capture is
exactly what an iPad drops mid-drag. `pointercancel` is *not* treated as a completed gesture.

**5.2.7 Reveal contract (game-side, stated here so both P2 and P3 code to it).**
A hidden bug exists **only** in the lens world until it is found. On dwell:

```
lens.markFound(bugId)             // it stops arming the dwell…
hotspot.setSprite(idleUrl)        // …and appears in the base world TOO
hotspot.setEnabled(true)
hotspot.pop()                     // spring in
sfx.chime()
```

**P6 changed the first line** from `hideSprite` to `markFound` (§11 row 13). The glass paints its
own **opaque** copy of the world, so a bug taken out of the magnified world disappeared at the
exact moment the child found it and only came back once the glass moved on. It now lives in both
worlds at once — magnified under the glass, life-size beside it — which is what a magnifier does.
`hideSprite` is still exported for a consumer that wants the other reading.

From that instant the bug belongs to `hotspot-scene.js` and **all tap logic is ordinary hotspot
logic**. The lens never handles a tap. This clean hand-off is what keeps the two modules from
growing into each other.

**5.2.8 Reduced motion.** No glint, no sheen; reveals fade (220 ms) instead of popping; the drag
itself is unchanged (motion the child causes is never suppressed).

**5.2.9 `shared/js/magnifier-lens.test.html`** mirrors `hotspot-scene.test.html`: a standalone
harness with a checkerboard plate, four coloured squares as sprites, live readouts of centre /
dwell / enabled, buttons for `glint` / `resync` / `destroy`, and a scripted strand probe
(pointerdown → move → blur) that asserts the lens settled and is draggable again.

### 5.3 `shared/js/journal.js` — NEW shared module (P2)

Generalises the storage-safe pattern proven in `games/world-music-dance/js/collection.js`.

```js
const journal = createJournal('bug-hotel-observer', { version: 1 });
journal.has(id) · journal.add(id, meta) · journal.get(id) · journal.all() ·
journal.count() · journal.clear() · journal.onChange(cb)
```

- Key: `qlobe:journal:bug-hotel-observer:v1`.
- **`add` is idempotent** — re-adding an owned id updates nothing and returns `false`.
- **It never throws into the game loop.** A `setItem` that throws (Safari private mode, quota)
  flips the store to an in-memory map for the rest of the session; the game keeps working and
  simply forgets at reload. A malformed or wrong-version payload is discarded and replaced.
- `onChange` is what re-renders the sticker grid and re-derives `round` (§4.2).
- Ten `observe-journal` stubs in the catalogue can later ride this module. That reuse is the
  reason it lands in `shared/` rather than in `js/`.

### 5.4 Reused unmodified

`shared/js/voice-clips.js` (recorded voice + `onClip` hook), `shared/js/speech.js` (fallback),
`shared/js/sfx.js` (synthesised chime / tick / pop), `shared/js/tap.js` (**one press path —
`onTap` on every interactive element, no bare click handlers anywhere**),
`shared/assets/ui/btn-{home,back,sound,play}.png`, `shared/fonts/fredoka-latin-600-normal.woff2`.

---

## 6. `config.json` — FROZEN schema

`config.js` is a three-line fetch shim; **all data lives in `config.json`** so the studio and
`tools/qa.mjs` can read it without executing anything.

```
id                     string
art                    { w: 1600, h: 1200 }
modes[]                { id, title, intro, prompt: 'find'|'clue'|'none',
                         showsTargetPlaque, wrongTapRepeatsPrompt, default, review? }
lens                   { zoom, glassD, dwellMs, dwellRadiusArt, gripOffset,
                         gripDir:{x,y}, gripSize, gripMinCssPx, sprite,
                         frame:{ scale, anchor:{x,y} },        // MEASURED, see §11.1
                         startArt:{x,y}, glintMs }
rooms[]                { id, title, bg, plaque,
                         exteriorHotspot: { x, y, w, h },      // ART px, CENTRE + size
                         zones: [ { name, x, y } × 4 ],        // ART px centres
                         bugs: [ id × 3 ],                     // canonical order = target cycle
                         voice: { intro } }
bugs[]                 { id, room, artSize,                    // ART px, longest edge
                         sprites: { idle, happy },
                         voice: { find, name, fact, clue } }
journal                { storageKey, version, bg, stickerBacking, factCard,
                         factFoundLockup, tabSprite, slots, grid:{cols,rows} }
voice                  { manifest, lines, decks: { yes[], idle[] } }
splash                 { bg, title }
tuning                 { …see the file; every timing in this document is a key here }
```

**Invariants (QA-asserted):** 4 rooms × 3 bugs = 12 = `bugs.length`; every `rooms[].bugs[]` id
resolves in `bugs[]` and its `room` field agrees; every voice id in `config.json` exists in
`tools/lines.json`; every asset path is relative, lowercase, and exists on disk; every zone
centre is inside the §4.3 band; `tuning.placedPerRoom (3) < tuning.zonesPerRoom (4)`.

---

## 7. `window.QLOBE_DEBUG` — v1 contract plus this game's extras

`docs`/`shared/js/engines/README.md` v1, in full:

| call | returns / does |
|---|---|
| `ready` | `true` once the splash has mounted and config has resolved |
| `listModes()` | `['bug-hunt', 'bug-detective', 'my-bug-book']` |
| `startMode(id)` | enters the mode from any screen, exactly as tapping the tile does |
| `getState()` | `{ screen, mode, roomId, roomIndex, round, targetId, revealed[], found[], placements[], wrongTaps, muted, seed }` — `placements` is `[{ bugId, zone, artX, artY }]` in **art px** |
| `getTargets()` | `[{ id, role, rect, enabled }]` — `role` is **truthful**: `'target'` for the round's target, `'bug'` for a roommate, `'room'` on the hotel screen, `'sticker'` in the journal. `rect` is **screen px**. |
| `tap(id)` | routes through the identical handler a real tap runs |
| `winRound()` | reveals and taps the current target, i.e. completes the room |
| `mute(on)` | mutes voice, sfx and ambience together |
| `seed(n)` | pins the FNV-1a stream: zone picks, bug order, and both voice decks |
| `home()` | the back-to-splash teardown of §2.9 |

**Extras this game requires** (the plan's list; `tools/qa.mjs` depends on all of them):

| call | why |
|---|---|
| `setLens(artX, artY)` | moves the lens through **`lens.moveTo`, the same code path as a drag** — so a QA move exercises the real dwell machinery, not a shortcut |
| `getLens()` | `{ x, y, enabled, zoom, glassD }` in art px |
| `fastTimers(scale)` | divides every timed beat (dwell 600 → 60 ms at `scale: 10`, idle, auto-advance, choreography). Rhyming Detective's `T(ms)` pattern. |
| `getJournal()` | `[{ id, room, round, foundAt }]` straight from `shared/js/journal.js` |
| `resetJournal()` | clears the store and re-derives `round` to 0 |
| `getAudioLog()` | `[{ id, source: 'clip' | 'speech', at, file }]` — which line the game *chose* to play, and from where |
| `getClipMedia()` **(P6)** | `{ key, src, readyState, duration, currentTime, paused }` of the last recorded clip's media element. The log above proves the manifest had an entry; **this proves the m4a actually decoded.** `voice-clips.js` plays every line through one detached `<audio>` (an element in the document would be re-created per clip and lose its iOS unlock), so a harness cannot reach it from the DOM. `readyState >= 2` with a finite duration is the difference between "the clip played" and "this browser has no AAC decoder and the child silently got the system speech voice" — the exact failure that bundled Chromium produces and real Chrome does not. |

---

## 8. Art list — every primary child-facing object

**The platform rule, restated:** every primary child-facing object is **authored papercraft
art**. CSS does layout, state and effects (shadow, clip, transform, opacity) and never draws a
thing the child is meant to look at. HUD chrome (banner pill, pips, mode cards) is CSS because it
is furniture, not content.

**"Visible renderer"** = the asset a child actually sees. **"Interaction substrate"** = the DOM
node that receives the pointer. They are separate on purpose: art is never a hit target and a hit
target is never art.

### 8.1 Play-field objects

| # | object | visible renderer (authored art) | interaction substrate (DOM) |
|---|---|---|---|
| 1 | hotel exterior | `assets/bg-hotel.jpg` 1600×1200 | none — `hotspot-scene`'s `<div class="hs-bg">`, `pointer-events: none` |
| 2 | room doorway ×4 | the arch is painted into `bg-hotel.jpg`; the touchable face is the plaque (row 3) | `<button class="hs-hotspot">` from `scene.addHotspot`, hit inflated to ≥ 96 CSS px |
| 3 | room plaque ×4 | `assets/props/plaque-{leaf,bark,bamboo,log}.webp` — icon-only torn-kraft cards | the hotspot's own `<img>` child; the plaque **is** the hotspot sprite |
| 4 | room interior ×4 | `assets/bg-room-{leaf,bark,bamboo,log}.jpg` 1600×1200 | none |
| 5 | magnifier ring + handle | `assets/props/magnifier.webp` ~900×900, true-alpha glass hole | none — `<div class="lens-frame">`, `pointer-events: none` |
| 6 | the magnified world | duplicate `<img>` of the current plate + duplicate bug `<img>`s at `scale × 1.6` | none — `<div class="lens-glass">`, `pointer-events: none` |
| 7 | the lens grip | *(invisible by design — the visible handle is row 5)* | one `<button class="lens-grip">`, ≥ 140 CSS px, `touch-action: none`, window-level drag |
| 8 | bug, hidden ×12 | `assets/bugs/<id>-idle.webp` ~512 px, **rendered only inside the lens** | none while hidden |
| 9 | bug, found ×12 | the same `-idle.webp`, now in the base scene | `<button class="hs-hotspot">` — `setSprite` + `setEnabled(true)` on dwell |
| 10 | bug, greeted ×12 | `assets/bugs/<id>-happy.webp` — a second authored frame, swapped by `setSprite`; all motion is `scene.wiggle()` / `pop()` | the same `<button>` (state change only, never a re-mount) |

### 8.2 Reward, journal and splash objects

| # | object | visible renderer (authored art) | interaction substrate (DOM) |
|---|---|---|---|
| 11 | journal spread | `assets/bg-journal.jpg` 1600×1200 spiral kraft | `<div class="journal-spread">` — scrim-blocks the room beneath, itself inert |
| 12 | "Fact found!" lockup | `assets/lockups/fact-found.webp` ~900×280, spell-checked at full size | none — decorative `<img>`, `pointer-events: none` |
| 13 | fact card plate | `assets/props/fact-card.webp` ~1100×760 | `<div class="fact-card">` — inert |
| 14 | fact text | **HTML Fredoka 600, 40 px `#3f2b18`** — deliberately *not* baked art (§11) | `<p class="fact-text">`, `pointer-events: none`; the child hears it, the grown-up reads it |
| 15 | sticker slot ×12 | `assets/props/sticker-backing.webp` ~420×420 + that bug's `-happy.webp` on top | filled: `<button class="sticker">`; empty: `<div class="sticker slot-empty">` at 26 % opacity, no handler |
| 16 | journal tab | `assets/props/mode-book.webp` 420×420 (§11 row 14) | `<button class="journal-tab">`, 128 CSS px |
| 17 | title lockup | `assets/title.webp` ~1400×760, spell-checked at full size | none — decorative `<img>` |
| 18 | mode tile face ×3 | `assets/props/mode-{hunt,detective,book}.webp` ~420×420 | `<button class="mode-tile">` (the cream card behind the face is CSS) |
| 19 | Play / Next Room / Keep Exploring / Play Again | `shared/assets/ui/btn-play.png` | `<button>` — one shared face, four labels via `aria-label` |
| 20 | home / back / sound | `shared/assets/ui/btn-{home,back,sound}.png` | `<button>`, 112 CSS px |
| 21 | prompt banner | **no art** — CSS cut-paper pill + HTML text, *adult caption only* | `pointer-events: none` |
| 22 | room pips ×4 | **no art** — CSS discs | inert |
| 23 | confetti | **no art** — CSS paper-scrap shapes, transform-only | inert |
| 24 | link preview | `assets/og-image.jpg` 1200×630 via `tools/pipeline/capture_og_images.mjs` | n/a |

Rows 21–23 are the complete list of things a child sees that are **not** authored art, and each
is either adult-facing text, a progress marker, or a particle. **No bug, no plaque, no lens, no
sticker, no title and no lockup is ever drawn by CSS.**

Byte budgets, prompts, seeds, workflows and provenance for every row: `ASSETS.md`.

---

## 9. Interaction and feedback — the choreography

All durations are `tuning` keys and all scale with `fastTimers`.

**9.1 One press path.** Every interactive element is bound with `shared/js/tap.js`'s `onTap`. No
bare `click`, no `touchstart`, nowhere. Delegated `onTap` handlers guard on the **start** target,
so a press that begins on the lens grip and ends over a bug is a drag, not a tap.

**9.2 Entering a room.** Plate crossfades 420 ms → four (three occupied) empty disabled hotspots
are added → `lens` is created at `lens.startArt`, enabled → room intro voice (§3.5) → at 900 ms
`lens.glint()` once.

**9.3 Discovery.** The lens centre is polled per settled frame. Within
`gettingCloserRadiusArt` (320) of an unrevealed bug: `getting-closer` once, then a 6 s cooldown.
Within `dwellRadiusArt` (150) for `dwellMs` (600): the §5.2.7 hand-off runs — `hideSprite` →
`setSprite` → `setEnabled(true)` → `pop()` (340 ms spring) → `sfx.chime()`. First reveal of the
room also plays `found-tap`. The bug is now permanent: it is never re-hidden, not by a resize,
not by leaving and re-entering the room in the same round.

**9.4 Tapping a found bug.** `setSprite(happy)` → `wiggle()` 420 ms → `bug-<id>-name`.
Then it branches:

- **target** → `yes-N` → the reward spread opens (§9.5).
- **roommate** → after 140 ms `nudge-wrong`; in `bug-detective`, after a further 300 ms the clue
  repeats. The sprite returns to `idle` after `happyHoldMs` (900). It remains tappable forever
  and every subsequent tap replays the same warm greeting.

**9.5 The reward spread.** `lens.setEnabled(false)` → spread slides up from +100 % over
`factOpenMs` (520 ms, `cubic-bezier(.22,1,.36,1)`) → `fact-found.webp` drops in from −40 px at
+120 ms → the bug's **happy** sprite scales in at +200 ms → the fact card + HTML fact text fade
in at +280 ms → voice `bug-<id>-fact`.

**9.6 The sticker.** At fact-clip end (or +2.4 s under a speech fallback), the happy sprite
`flyTo()`s its slot in the 4 × 3 grid over `stickerFlyMs` (700 ms) with a small arc, lands on
`sticker-backing.webp` with a 140 ms squash, `sfx.pop()`, and `sticker` is spoken.
`journal.add(id, { room, round })` is called **at the start of the flight**, not at the end, so a
back-tap mid-animation still keeps the sticker. If the bug was already owned, the flight is
replaced by a 220 ms pulse of the existing sticker and `sticker` is suppressed (§3.5).

**9.7 Leaving the reward.** Next Room (or 14 s) → `next-room` → spread slides down 380 ms →
`scene.clear()` → the next room mounts (§9.2). After room 4 → celebration (§2.8).

**9.8 Celebration.** Four pips fill 90 ms apart → CSS paper confetti 2.6 s → the round's four
stickers rise out of the grid to 150 CSS px in a row, 120 ms apart → `round-done`. Keep Exploring
(or 16 s) → END, `cheer-end`.

**9.9 Ambience** (`js/ambience.js`, zero files, `shared/js/sfx.js`'s AudioContext). A filtered
noise-swell breeze on every screen (gain ≤ 0.04); sparse randomised cricket chirps in the log
room; a soft bee hum in the bamboo room; nothing at all on the splash. Fades in over 1.2 s on
room entry, out over 600 ms on exit. **Gated on the same mute flag as voice**, suspended on
`visibilitychange → hidden`, and never started before the first gesture.

**9.10 Reduced motion** (`prefers-reduced-motion: reduce`, live-tracked by the scene): no glint,
no confetti, no sticker arc (it cross-fades into the slot instead), no wiggle (the happy frame
simply swaps), pops become 180 ms fades. Every timing, every sound and every state change is
otherwise identical.

---

## 10. Persistence and fallback behaviour

| thing | where it lives | what happens if it fails |
|---|---|---|
| the twelve stickers | `localStorage['qlobe:journal:bug-hotel-observer:v1']` via `shared/js/journal.js` | `setItem` throws → the store silently becomes an in-memory map for the session. **The game plays identically and simply forgets at reload.** No error surfaces to the child, none to the console beyond one `console.info`. |
| a corrupt / wrong-version payload | same | discarded, replaced with an empty store, `round` re-derives to 0 |
| the round index | **derived** from the journal (§4.2) | cannot desync; resets with the journal |
| which rooms are done this round | in-memory only | a reload restarts the round at the leaf room, with the stickers kept |
| voice clips | `assets/audio/*.m4a` + `manifest.json` | a missing or failed clip → `speech.js` speaks the **exact same string** from `tools/lines.json`. `getAudioLog()` records `source: 'speech'` so QA can tell the difference. |
| a room plate that 404s | — | `scene.setBackground` resolves `false` and **keeps the previous plate** — never a white screen |
| a bug sprite that 404s | — | the hotspot still exists, is still tappable, and still speaks its name; the child loses a picture, not a turn |
| the whole `config.json` | — | `config.js` throws at import; `index.html` shows the platform's static fallback card. This is the only fatal path, and it is a build error, not a runtime one. |

---

## 11. Explicit departures from the brief, the mockups and the stub

| # | source | what it said | what we ship | why |
|---|---|---|---|---|
| 1 | mockups 01–03 | text baked into the art: "Find the ladybug", "1 of 4", "Drag the magnifier", "NEXT ROOM", "LADYBUG", the fact sentence | **only two baked-text assets survive: `title.webp` and `fact-found.webp`.** Everything else is HTML + audio | Baked text cannot be re-spoken, re-sized, localised or made accessible, and text-in-image is our least reliable generation. The child cannot read anyway — the prompt belongs in the voice. |
| 2 | mockup 02 | instruction pills ("Find the ladybug", "Drag the magnifier") | **spoken prompts** — `bug-<id>-find` / `prompt-lens`; the on-screen banner is an adult caption at `pointer-events: none` | Pre-readers. A pill a child cannot read is decoration; a voice they can replay forever is instruction. |
| 3 | mockup 01 | room plaques lettered LADYBUG / ANT / BEE / BEETLE | **icon-only plaques** — a leaf, a bark chip, a bamboo end, a log slice | Same reason. It also frees the plaque to name the *room*, which is stable, rather than a bug, which rotates every round. |
| 4 | mockup 02 | "1 of 4" | **four CSS pips** | A numeral reads as a score. Pips read as *where am I*. |
| 5 | mockup 01 | bee in a honeycomb room, beetle in the bamboo tubes | **bee in the bamboo room, beetle in the log room** | Bamboo tubes are what a real bug hotel offers solitary bees, and beetles live under logs. The science has to be true; the mockup's arrangement was compositional. |
| 6 | brief | "pinch-to-zoom magnifying glass" | **one-finger drag, fixed 1.6× zoom** | Pinch is a two-hand gesture on a propped tablet, it fights page zoom, and it hands a five-year-old a control they can get *wrong*. A draggable glass at a fixed, always-legible magnification is the same fantasy with none of the failure. |
| 7 | brief | ages 3–6 | **ages 5–6** | Sustained visual search plus a spoken-clue mode is a five-year-old's task. The catalogue already serves 3–4 elsewhere. |
| 8 | brief | "ants, bees, beetles… ladybugs" (4-ish bugs) | **12 bugs, 4 rooms, 3 rounds** | 4 bugs is one sitting. 12 gives a collection worth keeping and a 3-round difficulty ladder, at a tractable 24-sprite bill. |
| 9 | brief | "nature ambient soundscape (birdsong, crickets, bees)" | **synthesised at runtime, zero audio files** | Identical result, ~0 KB, and it can duck under the voice, which a looped file cannot. |
| 10 | the stub | `observe-journal` engine, emoji art, sticker-stamping | **custom `js/game.js` on hotspot-scene + a new lens module; all authored papercraft** | `docs/polish-process.md` §4 — a polished game abandons its engine when the engine is the wrong shape. Stamping a sticker is not observing; finding a hidden bug is. |
| 11 | the stub | modes `guests` / `doing` | **`bug-hunt` / `bug-detective` / `my-bug-book`** | One skill per mode. The stub's two modes were the same skill twice. |
| 12 | mockup 01 | title card upper-left over the tree | **title centred** | The shipped plate has no cleared left third at every aspect ratio; a centred lockup survives the portrait crop. |
| 13 | §5.2.7 (P2 contract) | on dwell the game calls `lens.hideSprite(id)` — the bug *leaves* the magnified world as it enters the base one | **`lens.markFound(id)`** — the bug stays in the glass and is only retired as a dwell candidate | The glass paints its own OPAQUE copy of the world, so a bug removed from it vanished at the exact instant the child found it and only reappeared once the glass moved on. Keeping it is also the honest behaviour: a magnifier shows the thing it is held over, larger. `hideSprite` remains exported for a game that wants the other reading. |
| 14 | §8.2 row 16 | the journal tab wears `assets/props/journal-tab.webp` | **it wears `assets/props/mode-book.webp`** (the spiral notebook with a ladybug) | At the tab's shipped 128 px the authored torn-page cutout read as a blank white rectangle — no notebook, no ladybug, no meaning. The mode-book face is legible at that size and says "your book" instantly. `journal-tab.webp` stays in the tree, unused, with its sidecar. |
| 15 | §2.6 | the reward's sticker grid is the same size as My Bug Book's | **the reward grid is capped at 9.4 vh per cell** | It is the block that decides whether row three lands on the drawn page or spills onto the book's kraft cover. 9.4 vh is the largest cell that keeps all twelve slots on the paper at 1194×834. |
| 16 | §2.8 | the END screen is a cream panel over a dimmed hotel | **the END screen prints the same authored journal spread**, over a hotel dimmed far less | Stacked, a .55 brightness filter, a 42 % cream veil and a 90 % cream panel erased the hotel entirely; the child could no longer see the place they had just been, and the panel itself was the only CSS-drawn "primary object" left in the game. |
| 17 | P4 | `assets/bg-journal.jpg` is a 1600×1200 cover-crop of the raw edit | **cropped once more, to the book itself** (1350×970, `tools/fix-cutouts.py journal_page`) | The 4:3 crop carried ~18 % of empty table above and below the notebook, and every screen that prints the plate fills its box with `cover` — so that dead margin came straight off the usable page. |
| 18 | P4 | `spider-idle` / `spider-happy` ship as `qwen-image-layered` returned them | **body silhouette UNION a gradient-tolerant flood key of the raw edit** (`tools/fix-cutouts.py spider_legs`) | The layered cutout kept the charcoal body and dropped all eight pale-grey paper legs against the charcoal backdrop — at 200 px the spider read as a ball with eyes. Deterministic, local, no regeneration. |
| 19 | §9.6 | the record is written before the flight, and every mounted grid repaints off that write | **the destination slot's FACE waits for the landing** (`journal-ui.js flyTo`) | Writing early is right and stays (a back tap mid-animation must not cost a child their ladybug) — but it meant the slot was already wearing the bug while a second copy of the same bug flew towards it. Hiding only the face keeps the guarantee and gives the flight its meaning back. |
| 20 | §9.10 | reduced motion flattens the celebration's sticker rise via `transform: none` | **`animation: none`** on `.sticker.rise` | The rise keyframes are `both`-filled, so their end state is an *animation* value and outranks any declaration the reduced-motion block can make. The stickers were still rising, 40 px, in the "no motion" pass. |
| 21 | §2.4 / §3.2 | the hotel-select screen banners and re-speaks `prompt-look` ("Somebody tiny is hiding in this room. Let's have a look.") | **a new line, `pick-room` — "Which room shall we peek into? Tap one!"** | There is no "this room" on the hotel screen; the child is choosing between four. Printed over the four plaques the old line read like a leftover from somewhere else. `prompt-look` keeps its real job — the `bug-detective` room intro (§3.5) — and the script grows from 74 lines to 75. |
| 22 | maintainer brief, wide-viewport fix | "cap the stage at **≈16:10**, max **≈20 %** vertical crop" | **1.25:1 – 1.4:1, 4.8 % crop at 2000×960** (§2.5a) | 16:10 measures out at 16.7 % vertical crop = 100 art px off the top, and the roof apex of `bg-hotel.jpg` sits at y≈32. A 16:10 card decapitates the hotel — the exact defect being fixed. 1.4:1 is still visibly wider than the plate, keeps the roof and the plaques, and is far inside the 20 % budget the brief allowed. |
| 23 | §5.2 (P2 contract) | "THE LENS NEVER HANDLES A TAP: its root is `pointer-events:none` and the single invisible grip button is the only pointer target it owns" | **the drag surface covers the ring, the glass and the handle; a press that does not travel 12 CSS px is a TAP and is forwarded to whatever is under the glass** | A drag handle the size of a bottle cap is not what a child reaches for — they grab the glass. The original contract existed only to protect the tap on a bug the child had just found underneath it, and disambiguation protects it better: past the slop the press is a drag (same window-level machinery, same `applyCentre`); inside it the lens goes `pointer-events:none` for one `document.elementFromPoint` and **`click()`s** the control underneath. `click()` and not a synthetic pointer pair, because `shared/js/tap.js` acts on `pointerup` and keeps `click` for keyboard/AT — a click on an element this press never touched with a pointer therefore fires the action **exactly once**, and the browser's own click for the press targets the surface, never the control. Cost: the underlying control's pointerdown feedback (hotspot-scene's press-down scale) does not run for a tap through the glass. A press ON the glass is also never `clampGrip`-corrected — correcting it would make the glass jump out from under the finger that just touched it; a press on the ring or the handle keeps the old lift exactly. |
| 24 | §2.9 / §4.3 | "placement is computed **once**, when the room mounts, and **never** recomputed on a resize" | **one exception: a still-hidden TARGET that a narrow crop has put out of reach is moved back into the reachable band, on mount AND on reflow** (§4.3a) | The scene cover-fits a 4:3 plate, so a 390 px phone reaches only art `x ∈ [523, 1077]` while the leaf room's nooks are authored at `466 / 478 / 831 / 1150`. Three of four are off that crop, and a round whose *target* landed in one of them was **unwinnable** — the child could drag the glass to the edge and the bug was not in the room. The rule the original text was protecting is "a bug must not move under a child's finger", and that rule is kept intact: only the target moves, only while it is still hidden, never a bug already found, and the two bonus bugs stay wherever the seed put them. The zones themselves do not move — the tablet composition is untouched — and the ladder is deterministic (placement order, authored zone order, viewport; no PRNG, no clock), so `seed(42)` still pins a layout for a given viewport. |
| 25 | §2.5 HUD geometry | the banner reserves `--safe-l + 140px` on each side and the journal tab sits at `--safe-l + 112px` along the bottom | **under 600 px both rules are replaced**: the caption takes the full width between the safe insets and drops **below** the top row of controls; the journal tab moves to the **bottom-right** corner and the pips shrink | On a 390 px phone the banner formula resolves to **78 px** — a one-word column of broken text — and no centred pill can clear a 96 px control on both sides *and* stay readable at that width, so the phone stops trying to fit between them and goes under them instead. The tab's authored offset put it directly on the bamboo and log plaques, which land in the bottom third of a phone crop; the bottom-right corner is the one corner this game leaves empty. Both keep every §9.1 touch size, the caption is still `pointer-events: none` (§8.2 row 21), and nothing at or above 600 px changes — 1194×834, 834×1194 and the 2000×960 framed card are byte-identical. |

### 11.1 P6 tuning record — what was measured, and against what

Every number below was authored against the **real 1600×1200 plates at full size**, with a
100 px coordinate grid laid over them, and verified in the browser through
`QLOBE_DEBUG.getState().placements` / `getLayout()` plus full-size screenshots
(`qa-shots/`).

**Lens frame (the pixel-tight one).** `assets/props/magnifier.webp` is 900×900; its glass
aperture is a circle of **radius 186 px centred on (366, 396)** — found geometrically by
`tools/fix-cutouts.py glass_aperture()`, which grows the largest circle that fits inside the
ring's opaque inner edge. From that one measurement:

    lens.frame.scale  = 900 / (2 × 186) = 2.4194     (frame box edge / glassD)
    lens.frame.anchor = (366/900, 396/900) = (0.4067, 0.44)

which makes the authored hole land on the clip circle to under a pixel — the ring's opaque
inner edge and the edge of the magnified world are the same pixel. **If that sprite is ever
regenerated, re-run `glass_aperture()` and re-author both numbers**; the previous build used
the module defaults (1.9 / 0.42 / 0.38) and the world sat visibly outside the ring.

The same pass punched the aperture to a **true hole**. P4's luminance key had left the glass at
alpha 60–95 — a ~30 % charcoal veil over everything the child magnifies.

**Grip.** `gripOffset 44 → 205` ART px along the measured handle direction `(0.768, 0.641)`,
with `gripSize 0.62` (a new `magnifier-lens.js` option; the module used to hard-code 0.8).
The invisible drag button now sits on the ring-and-handle junction: the child's finger rests
*beside* the glass instead of on top of it, and — the load-bearing property — **the button no
longer contains the glass centre**, so a bug revealed under the glass is still tappable. The
smoke suite asserts exactly that.

**Glass size.** `glassD 320 → 360` ART px (≈ 269 CSS px on a 1194×834 iPad, 22 % of the
screen; the mockup's glass is ≈ 31 %). Big enough to read a bug at 1.6×, small enough that
finding one is still a search.

**Park.** `startArt (800, 620) → (860, 330)` — the one point that is more than 295 ART px
(glass radius + half a bug) from **every zone of every room**, so no bug is ever half-visible
inside the glass before the search begins, and whose grip lands over nothing.

**Room hotspots.** All four re-authored as 236 px squares centred on the real compartments of
`bg-hotel.jpg`: leaf (660, 585), bark (948, 585), bamboo (660, 918), log (948, 918). The plaque
is the hotspot's sprite, so the box is square to match the plaque's own canvas; the compartment
texture stays visible above and below it. The previous values put all four plaques on the wall
and the roof — none of them was over its own room.

**Zones.** The measured table is §4.4. Leaf, bark and log share one shadowbox composition (one
arch top-left, three along the lower shelf), so they share one table; bamboo is a different build
and has its own tube mouths. Closest pair in any room: 290 ART px — comfortably past the 150 px
dwell radius, so the glass can never be inside two nooks at once. The right-hand nooks are
deliberately *off* their arch centres so the sprite survives the portrait crop (§4.4).

**Reachability — why `dwellRadiusArt` stays at 150.** The lens clamps its centre so the glass
never hangs off the painted plate, and the portrait crop plus the HUD keep-out shrink that box
further. Measured, every nook of every room, at three viewports:

| viewport | worst distance from the glass centre to the nook it is aimed at |
|---|---|
| 1194 × 834 (landscape iPad) | 0 px — the glass sits dead on every nook |
| 834 × 1194 (portrait iPad) | 113 px — the right-hand column, x-clamped |
| 1180 × 520 (a phone on its side) | 127 px — the top row, y-clamped |

All three are inside the 150 px dwell radius, so **every bug is findable at every viewport this
game supports.** There is no combination where a child is asked to find something the glass
cannot reach.

One QA subtlety that measurement exposed: `QLOBE_DEBUG.setLens()` settles by default, and
settling pushes the parked glass out from under the HUD — which on a short viewport moves it
~100 px away from the nook it was just aimed at. A **live drag does not settle until the finger
lifts**, so a real child reaches further than the debug shortcut does. A harness probing the
limits must pass `{ settle: false }` or drive the grip, exactly as a finger does.

**Ambience.** `CHIRP_GAIN 0.05 → 0.036`. The breeze and the hum are beds the ear stops hearing;
a 38 ms chirp is not, and it was the one thing in the synthesised garden loud enough to land on
top of a spoken word.

**Known, accepted, not fixed here.** The bark and log interiors run ~12 % hotter in mean HSV
saturation than leaf and bamboo (181 / 176 vs 160 / 164; the hotel exterior is 85). A
deterministic 0.88 saturation compression was built and reviewed side by side at full size and
was **imperceptible** — the honest fix is a re-generation, which this phase does not do. In
portrait the reward spread's third sticker row sits a few pixels below the drawn page's torn
edge, on the book's kraft cover; every other viewport keeps all three rows on the paper.

---

## 12. Registry and pre-reader guidance rules

### 12.1 `game.json`

Canonical: id `bug-hotel-observer`, category `sensorial-science`, ages 5–6, status **beta**,
accent `#5f8f3a` (warm leaf green), icon 🐞, three modes with one skill each. Root `games.json`
is written **only** by `node tools/pipeline/sync-games-registry.mjs --write --only
bug-hotel-observer` — never by hand, and never in the same commit as an asset push.

### 12.2 Pre-reader guidance — the complete rule set

1. **Everything is voiced.** Every prompt, every name, every fact, every transition. No
   information exists only as text.
2. **Every voiced thing is replayable forever.** The sound button re-speaks the live prompt on
   every screen, debounced 600 ms, with no limit and no penalty.
3. **On-screen text is for grown-ups only** and is always `pointer-events: none`: the prompt
   banner, the fact text, the mode-tile labels, the "Play" label. A child who ignores every word
   on screen loses nothing.
4. **No numerals as feedback.** Progress is four pips and a filling sticker grid.
5. **Icons, never words, on anything a child aims at.** Room plaques are pictures; buttons are
   the shared painted UI faces; stickers are the bugs themselves.
6. **Idle is help, not nagging** — 12 s, then every 15 s, alternating a gentle line with a lens
   glint, and never pointing at the answer.
7. **Nothing waits for audio.** Input is accepted during every clip; a tap interrupts.
8. **Two taps to the catalog** from anywhere, always in the same corners
   (`docs/interaction-patterns.md` §8).
9. **≥ 96 CSS px hit targets everywhere**, ≥ 140 px for the lens grip.
10. **No red, no X, no buzzer, no shake.** The strongest negative signal in the entire game is
    `nudge-wrong`, and it opens with the word "Hello".

---

## 13. Verification, risks and the release gate

### 13.1 Static gate (P7)

`node tools/validate/run.mjs` with **zero new errors**, plus `tools/qa.mjs --static`:
config invariants (§6) · zone band + separation (§4.3) · every voice id in `config.json` present
in `tools/lines.json` and vice versa · **exactly 75 lines** · every asset path relative,
lowercase and present · byte budgets from `ASSETS.md` · **no emoji anywhere in the runtime DOM**
· `assets/hub/tiles/` untouched · `shared/js/hotspot-scene.js` byte-identical to `main`.

### 13.2 Playwright gate (P7/P8) — real Chrome, `channel: 'chrome'`, under `caffeinate -dims`

Chromium's bundled build **cannot decode AAC** and will fail every recorded-clip assertion
silently, so the channel is not optional.

1. Zero console errors, zero 404s, on every screen.
2. All three modes end-to-end via `QLOBE_DEBUG` with `fastTimers(10)`.
3. **A real synthetic pointer drag of the lens** (`pointerdown` on the grip → a path of
   `pointermove`s → dwell → reveal) — not just `setLens`. Since §11 row 23, also: a drag started
   on the **glass centre**; the 12 px slop holding the glass still inside it; and a **tap through
   the glass** onto a revealed roommate firing `greet()` **exactly once** (`wrongTaps` +1 — the
   one counter written synchronously, so it is true even with the voice muted).
4. **Strand probes:** `pointercancel` mid-drag; `blur` mid-drag; `visibilitychange` mid-drag.
   Each must leave the lens settled in place, enabled, and draggable again.
5. Wrong-input probes: tap a roommate, tap an empty sticker slot, tap bare plate, double-tap the
   target, tap during every clip.
6. Journal persists across reload; `resetJournal()` clears it and `round` re-derives to 0;
   `round` advances 0 → 1 → 2 correctly.
7. **A recorded clip actually plays** — `getAudioLog()` shows `source: 'clip'`, not `'speech'`.
8. Full nav loop: splash → hotel → room → reward → hotel → journal → splash → end → splash;
   home appears only on the splash.
9. Portrait + landscape + reduced-motion screenshots at three viewports
   (1194×834, 834×1194, 1024×768).
10. **Wide-window geometry (§2.5a)** at 2000×960: the stage is a centred card with a real
    margin, its aspect is ≤ 1.4:1, the vertical crop is ≤ 20 %, the roof apex (art y≈32) is on
    screen, all four plaques are inside the card, and no HUD rect overlaps one. The same run at
    1194×834 / 834×1194 / 390×844 must report **no frame at all** — the stage still fills the
    window and `#stage-surround` stays `display:none`.
11. **A phone is playable (§4.3a, §11 rows 24–25)** at 390×844: the leaf-room target's centre is
    inside `visibleArt()` *by the 120 art px reach margin*, and still on one of the authored
    nooks; the round completes through the **real** path (`lens.moveTo` → dwell → tap), never
    `winRound()`; the banner is ≥ 200 css px wide and inside the window; the journal tab keeps its
    96 css px and intersects **no** room plaque. Plus the §2.9 exception itself: enter a room at
    1194×834, find one roommate, rotate to 390×844 — the hidden target is back inside the crop,
    the found roommate has **not** moved and is still `found` in both worlds, and the round still
    completes.

### 13.3 Visual QC (P6/P8)

Every plate reviewed **at full size**, with **material fidelity assessed separately from
layout** · magenta composites for all ~34 cutouts · the glass genuinely transparent over all four
interiors · every bug readable at ~200 CSS px · `title.webp` and `fact-found.webp` spell-checked
at full size · the four interiors palette-consistent with each other and with the exterior.

`qa-shots/` carries three sets, all reviewed at full size: `wide-*` (2000×960, the framed
diorama of §2.5a), `land-*` (1194×834) and `port-*` (834×1194). `wide-` and `land-` run the whole
game 01→12; `port-` stops at the book.

### 13.4 Risks

| risk | mitigation |
|---|---|
| **iPad lens drag drops mid-gesture** | pattern #11 window-level handlers, no `setPointerCapture` reliance, settle-in-place on every terminal path, mandatory strand probes (§13.2.4) |
| **zoom performance on old iPads** | transform-only rAF, no filters, no `backdrop-filter`. If interiors look soft at 1.6×, **raise the plates to 2000×1500 within the 300 KB budget before raising the zoom.** |
| **alpha fringes on 34 cutouts** | every cutout subject generated **on a flat dark charcoal background**, extracted with `qwen-image-layered` layer_2, magenta-composited in `assets/source/qa/` |
| **text-in-image failure** | only two text assets; seed-ladder rerolls; **a failed lockup ships later and the voice covers the beat — it is never replaced by HTML type** (`docs/art-direction.md`) |
| **a bug is invisible against its own room** | the four plates are authored with deliberately quiet nook interiors; P6 checks every bug against every one of its room's four nooks at full size |
| **`games.json` concurrency** | only the sync script writes mirrored fields; `git pull --rebase` before the registry commit; push the registry separately from the assets |
| **big asset push disconnects** | `git config http.postBuffer 157286400` before the art push |
| **Pages CDN lag (up to ~11 min)** | wait it out before the production re-test |

### 13.5 Release gate

**The game ships and stays `beta` until a real child plays it on a real iPad and the maintainer
signs off** (`docs/polish-process.md` §5). Everything in §13.1–13.3 green is necessary and not
sufficient. The specific things only a child on a tablet can settle: whether 600 ms of dwell
feels like discovery or like lag, whether 1.6× is enough magnification to make a bug feel *close*,
whether a five-year-old's palm on the plate breaks the drag, and whether "Who am I?" lands as a
riddle or as a test.
