# Community Helper Cards — production design

**Replaces:** the registered `match-pairs` emoji prototype at the same id and route
**Category:** culture-geography · **Age:** 3–6 · **Status:** beta pending child iPad playtest
**Canonical art world:** **Puppet / Cozy felt fabric**
**One learning promise:** associate a familiar helper with real tools and say one concrete way that person helps the community.

## Product promise

The child enters a warm hand-sewn neighborhood theater, chooses one of four friendly grown-up helpers, and completes two short tool-finding beats. The correct felt tool snaps to the helper, who then appears in a purpose-made success pose. A narrated Hero Spotlight explains the job in plain language and awards a persistent embroidered badge.

The core fantasy is not “complete a worksheet.” It is “help the theater cast get ready, meet the hero, and fill my Community Hero album.” A pre-reader should understand the current action from the central character, the three objects, motion, and narration within five seconds.

## Screen map

```text
splash
  ├─ Play → helper select → match tool 1 → match tool 2 → Hero Spotlight/reward
  │                                      └──────────────────────────────→ select
  │                                                                      └─ all four → finale
  ├─ Badge album → splash
  └─ Home → catalog

play / select / reward / album / finale Back → splash
```

### 1. Splash

- Full-bleed felt neighborhood theater, spell-checked raster title, four helper silhouettes peeking from raster cards.
- One dominant `Meet the Helpers` action and a secondary album action.
- Catalog Home appears only here. The first child gesture unlocks narration, SFX, and the recorded music track.

### 2. Helper select

- Four large portrait cards: Firefighter, Doctor, Teacher, and Mail Carrier.
- Earned helpers carry a real raster badge marker; cards remain replayable.
- Portrait is 2×2. Landscape may use four across only while every card remains at least 180 CSS pixels wide.
- Tapping a card speaks the helper introduction and enters play. Reading the role name is never required.

### 3. Match

- One helper occupies the stage center, with a warm spotlight built into the background composition.
- A real HTML prompt sits on the raster prompt plaque; narration is primary.
- Exactly three large raster tools appear on the raster tray. One is correct.
- Drag is the expressive path. A tap on a tool invokes the identical attempt handler for younger children and motor-accessibility parity.
- A large forgiving target surrounds the helper. The drag controller listens at window level, treats cancellation as cancellation, and removes every ghost on teardown.
- Wrong tools return with one soft wiggle and the line “That tool helps someone else. Try another.” Nothing is removed or scored negatively.
- Correct tools make a fabric-pop/sparkle response, narrate one fact, and move to the second round. Two successes open the Hero Spotlight.

### 4. Hero Spotlight / reward

- The neutral puppet is replaced by a separately authored helper-with-tool tableau—not a floating overlay.
- The earned shield, one restrained star burst, helper name, and one spoken bio make a single visual sentence.
- The badge is written through `shared/js/journal.js`; storage failure never blocks the reward.
- `Next Helper` returns to selection. When all four badges are owned, the finale is offered.

### 5. Album and finale

- Album shows four sewn slots, filled with portrait + badge for earned helpers and calm silhouettes for the rest.
- The finale celebrates the complete neighborhood, then supports immediate replay without erasing the album.

## Content

| Helper | Round 1 | Round 2 | Hero Spotlight idea |
|---|---|---|---|
| Firefighter | Hose | Helmet | Firefighters train, work as a team, and help in emergencies. |
| Doctor | Stethoscope | First-aid kit | Doctors listen, ask questions, and care for people who are sick or hurt. |
| Teacher | Book | Pencils | Teachers help us practice, explore, and grow. |
| Mail Carrier | Mailbag | Letters | Mail carriers sort and deliver letters and packages in every kind of weather. |

Each round has the correct tool and two unmistakable distractors from other roles. The order is deterministic under debug seeding and varied during ordinary replay.

## Interaction and feedback rules

- All targets are at least 96×96 CSS pixels, with extra invisible forgiveness around the helper drop zone.
- Pointer Events, a single active drag, real pointer-to-object motion, window-level release, blur/pagehide cancellation, and stray-ghost cleanup come from `shared/js/stage/drag-to-slot-dom.js`.
- Taps and drops converge on the same `attempt(toolId)` function. Debug input also uses that function.
- Correct: tool lift → soft snap → small star arc → fact narration → next beat.
- Retry: elastic return → one gentle wiggle → short nudge. No siren, red flash, time pressure, lives, or Game Over.
- Reduced motion removes travel, bobbing, and confetti while retaining the pose swap, badge, sound, and spoken outcome.
- Navigation follows the platform rule: splash Home reaches the catalog; every deeper Back reaches the game splash.

## Art direction and asset plan

Every child-facing surface belongs to **Puppet / Cozy felt fabric**: cranberry curtains, midnight-blue felt, oatmeal cards, blanket stitches, soft stuffing, embroidered faces, and walnut stage wood under warm footlights. Functional labels remain HTML over authored blank felt furniture.

Visible renderer versus interaction substrate:

| Object | Visible renderer | Interaction substrate |
|---|---|---|
| Theater | GPT Image 2 raster plate | responsive full-bleed `<img>`/background layer |
| Helper cards | raster felt card + transparent felt puppet | semantic button and HTML name |
| Helpers | transparent raster neutral/success poses | large DOM drop slot |
| Tools | transparent raster cutouts on raster tool cards/tray | buttons + shared DOM drag controller |
| Prompt/actions | raster plaques/buttons | HTML text and semantic controls |
| Badge/album/star | transparent raster cutouts | journal state and DOM layout |

GPT Image 2 supplied the coherent theater, title, helper, tool, UI, and reward masters. The required shared cutter extracted exact components and wrote bounding-box receipts. Local Krea 2 supplied the separate Toy-grammar hub tile. Runtime art is optimized WebP/JPEG and makes no model calls.

## Audio

- `assets/audio/lines.json` is the verbatim source of truth.
- Every fixed line is produced by the approved local `qwen3-tts-voiceclone` workflow with seed ladder 7 → 8 → 9 and checked with local Whisper before shipment.
- Runtime uses `shared/js/voice-clips.js`; device speech is the resilience fallback only.
- Quiet `whimsical-toy-workshop.mp3` plays after a real gesture and ducks for every spoken line.
- Synthesized SFX are soft pop, sparkle, boing, and tada; emergency sirens are intentionally absent.

## Persistence and privacy

Only earned helper ids are persisted through `createJournal('community-helper-cards', { version: 1 })`. The game records no child voice, image, name, or behavior. Authoring-time generation, voice cloning, and transcription never run in production. If storage is denied, the album remains complete for the current session.

## Deliberate departures

1. **Generic tap-pair prototype removed.** The concept and mockups promise one central helper, three tool choices, and drag. The old six-card engine grid could not deliver that fantasy.
2. **Four helpers, not the stub’s twelve unrelated roles.** Firefighter, Doctor, Teacher, and Mail Carrier match the approved screen set and create a learnable first release. Each receives two facts instead of one superficial pair.
3. **Hose replaces extinguisher.** Mockup, tool silhouette, narration, and success pose now agree on the more readable signature object.
4. **Hero Spotlight replaces generated live-action bios.** The concept’s empathy goal remains through a narrated, animated felt tableau. Shipping AI-presented “real workers” would create identity, consent, uncanny-motion, and art-world conflicts; the configured local API also exposes no approved MiniMax H3 production route. A coherent authored spotlight is stronger and safer than weak pseudo-documentary footage.
5. **Runtime text is HTML.** The generated title is decorative and spell-checked; instructions, role names, progress, and buttons remain accessible real text/audio.

## `QLOBE_DEBUG` v1

The debug surface exposes a ready promise, helper-mode listing, deterministic `startMode(helperId)`, serializable screen/helper/round/earned/locked state, truthful target rectangles and correct/wrong roles, real-handler taps, `winRound`, mute, seed, fast timers, and badge clearing for QA. It never supplies a fake success path unavailable to a child.

## Release gates

- Static syntax, registry parity, production validator, and zero new errors.
- Direct and hub boot with zero unexpected page errors, failed requests, or 404s.
- Wrong/tap/drag/cancel paths, two rounds, reward, all helpers, album persistence, storage denial, mute, recorded voice, and back navigation.
- Landscape, portrait, narrow landscape, and reduced-motion screenshots at meaningful states.
- Adversarial art review of source sheets, alpha QA contact sheet, splash, selection, play, reward, album, and finale.
- Production deploy watched to completion and the same smoke/visual suite rerun against `https://qlo.be`.
- Status remains `beta` until a real child succeeds on the iPad.
