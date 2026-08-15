# Game Design Document — Tiny Reader Theater

## Game title
Tiny Reader Theater 🎭

## Category
`reading-phonics`

## Age target
5–6 (platform default).

## Concept video
`../../01-game-concepts/tiny-reader-theater/dreamina-2026-07-30-7619-Tablet game demo for preschool age. Fast....mp4` — gameplay/fantasy reference only. The shipped mechanic follows this GDD and the four approved mockups in `../../01-game-concepts/tiny-reader-theater/output/ui-mockups/`, not the earlier "tap the puppet to act" prototype the video and the very first mockup pass showed.

## Explicit departure from the prior concept/prototype
This replaces a never-implemented `in-design` stub that lived at this same path (`games/tiny-reader-theater/`, choose-one engine, "Fill the Story" / "Act It Out", no `js/`/`css/`, no real assets beyond a stock OG image). That stub is superseded in full — same id, same title, new design — rather than kept alongside it, to avoid a duplicate registry entry. Nothing from it is reused.

The concept itself is a deliberate pivot from the *first* Tiny Reader Theater brief (tap-the-puppet-to-act, single fixed one-page stories). The child now taps **each word of the line itself** to hear it read, and the story **branches** through a small Beginning → Middle → Ending tree instead of a fixed linear sequence. See `../../01-game-concepts/tiny-reader-theater/brief.md` for the full brief history.

## Learning goals
1. Track print word-by-word left to right and hear each word spoken on tap (concept of word, 1:1 print-to-speech correspondence).
2. Build sight-word recognition through repetition of a small, deliberately controlled vocabulary across many story lines.
3. Practice oral-language comprehension and cause/effect through simple story choices ("what happens next?").
4. Experience a complete narrative arc (beginning, middle, end) and understand that a story's shape can change with different choices.

## Capability contribution
No engine in `shared/js/engines/` supports word-by-word tap-to-read; `story-stones.js` supports only a pick-3-up-front combinatorial story, not a live reveal-a-choice/branch/reveal-again tree. This game contributes two new reusable pieces if they prove generically useful after ship: a word-tap read-along interaction, and a small JSON-driven Beginning→Middle→Ending branching-story resolver, both built as game-local `js/` modules first (per the platform norm — promote to `shared/js/` only once a second consumer wants them). It also reuses and extends the existing rigged puppet cast and `theater.js`/`puppet.js` stack for the act-out beats, turning it from a directed-narration tool (Puppet Tales) and a free-improv toy (puppet-retell) into a scripted-line performance target.

## Scope decision — ship Forest complete, Castle/Outer Space as "coming soon"
Full production (word clips + line clips + choice-card art) for all three settings up front is not the right first slice: research into the recorded-voice pipeline shows a naively-authored 3-setting story tree (3 × 13 segments) could require many hundreds of unique word clips. Per the platform norm ("ship one mode end-to-end and playtest before starting the next" / the Puppet Tales lesson that "expansion should strengthen data, not duplicate screens"), **v1 ships only the Forest story tree fully produced and playable.** Castle and Outer Space appear in the setup screen (matching the approved mockup) but are visually marked "Coming soon", gently declined with a spoken line if tapped, and are not selectable. The data schema supports N settings from day one so Castle/Outer Space become pure `config.json` + asset additions later — no engine change.

**Update (2026-08, second setting):** the Castle story tree — already authored in `config.json` — is now fully produced and unlocked: 12 choice cards, 10 stage props, and 125 recorded audio clips (see `ASSETS.md`), `PROP_KIT`/`BEATS` entries for all 39 beats in `js/theater-scene.js`, and its own `qk:tiny-reader-theater:castle:endings` progress tracker. Setup now shows Forest and Castle unlocked with Outer Space the one remaining "Coming soon" world, confirming the N-settings schema needed no engine change to add a second story. `tools/qa.mjs` covers a full Castle playthrough alongside the existing Forest coverage (148/148 checks passing).

**Update (2026-08, third and final setting):** the Outer Space story tree — already authored in `config.json` — is now fully produced and unlocked: 12 choice cards, 9 stage props, and 122 recorded audio clips (see `ASSETS.md`), `PROP_KIT`/`BEATS` entries for all 39 beats, and its own `qk:tiny-reader-theater:outer-space:endings` progress tracker. All three settings are now live with no locked worlds remaining — Setup's "Coming soon" badge is gone. Producing this third setting also surfaced and fixed a latent cross-setting audio-key collision (see `ASSETS.md`'s "Cross-setting audio-key collision fix" note): Forest/Castle/Outer Space all reuse the same node ids, so their `line:`/`summary:` clips were silently overwriting each other at an unscoped manifest key before this fix scoped them by settingId. `tools/qa.mjs` now covers all three settings' playthroughs plus a check that all three worlds are genuinely pickable with zero "Coming soon" badges remaining (178/178 checks passing).

## Narrative style guide (the 2026-08 story rescue)

The first authored Forest tree read as flat "controlled-vocabulary prose" —
grammatically fine, emotionally dead. The rescue rewrote every node in the
spirit of a gentle preschool TV episode (the Peppa Pig register), and any
future setting (Castle, Outer Space) must be authored to the same bar:

- **One small mishap or joke per node.** The map is picked up upside down; the
  friends follow it *the wrong way*; a cheeky squirrel steals the nut. The
  mishap is always harmless and always resolved warmly.
- **Onomatopoeia is load-bearing.** "Splash! Splash!", "Knock, knock!", "Peep!
  Peep!", "La, la, la!" — fun to tap, fun to hear, decodable, and they give the
  narrator something to perform. At least one soundy line per branch.
- **Sensory pleasures of the setting.** Mud on everyone, glow bugs like tiny
  stars, a sleepy fox cub to tiptoe past. Endings land on warmth (sharing,
  singing a lost bird home, waving to the forest), never on a mere fact.
- **Still puppet-agnostic** ("the two friends", "everyone") so any pair works.
- **Lines stay 4–7 tappable words**; a deliberately short exclamation line
  ("Muddy paws! Muddy noses!") is good rhythm, not a gap.
- **Every line names its beat** (`beats[i]`) and every node dresses its stage
  (`staging`): if a line mentions a log, a door, a puddle, the child sees it.

## Controlled vocabulary (why, and how)
To keep word-clip production tractable and to make repetition (the actual reading-pedagogy mechanism) real, the Forest story tree's prose is written from a small **controlled word list**, not free-authored sentences:
- Reuse `shared/data/words.json` / `shared/js/content.js` `wordAudio()` CVC word bank (~130 words, already recorded) wherever a word fits.
- Add a Forest-specific extension list recorded once as part of this game's own word-clip batch. After the 2026-08 story rescue this includes the onomatopoeia set (*splish, splash, peep, tweet, la, knock, creak, shh, wow, blink*) — story quality justified growing the list past the original 90-word target.
- Actual total for the rescued Forest tree: **129 unique words**, each recorded exactly once and reused across every line/segment it appears in (the manifest keys by *word*, not by word-instance or by line).
- Every line is written **puppet-agnostic** ("the two friends", never a puppet's own name) so the same 13 segments read correctly regardless of which 2 puppets the child picked. Per-puppet name-insertion into narration is an explicit **non-goal for v1** (open question noted in the brief; the fixed recorded-clip word-audio model doesn't support runtime name splicing without a name-shaped audio slot system that does not exist yet).

## Screen map & navigation loop

```
Setup  →  Read (per line, repeats)  →  Choice (after Beginning & each Middle)  →  Read...  →  Complete
  ↑                                                                                                │
  └──────────────────────────────── Home / Choose a new path ───────────────────────────────────┘
```

1. **Setup** — pick a world (Forest unlocked; Castle/Outer Space "coming soon"), pick exactly 2 puppets from the 8-character cast, "Start the story".
2. **Read** (repeats once per line in the current story node, several lines per node) — the line's words render as separate tappable chips; tapping a word colors it and speaks it; once every word in the line is tapped, the chips sparkle and `theater.runBeats` plays the narrator reading the full line while the two chosen puppets act a matching beat on stage; then the next line in the node begins automatically.
3. **Choice** (only after the Beginning node and after each Middle node finish their lines) — narrator asks "What happens next?", three cards appear, tapping one advances to that child node and returns to **Read**.
4. **Complete** (after an Ending node's lines finish) — puppets take a bow, the ending's one-line summary shows, the "Forest endings — N of 9 found" tracker updates (persisted in `localStorage`), with Replay / Choose a new path / Home.

Splash/Home rule follows platform convention: Home only exists on the Setup screen; Read/Choice/Complete use Back → Setup.

## Data model (`config.json`)

```jsonc
{
  "cast": ["bear","doggy","fox","frog","rabbit","unicorn","princess-lily","princess-zoe"],
  "settings": [
    {
      "id": "forest",
      "title": "Forest",
      "stage": { "backdrop": "../../shared/assets/backdrops/forest-cottage.jpg", "floorY": 0.84 },
      "locked": false,
      "tree": {
        "beginning": {
          "lines": ["The two friends found a map.", "It showed a path in the trees."],
          "beat": "look-at-map",
          "choices": [
            { "id": "map",  "label": "Follow the map",   "art": "choice-map.png",  "next": "middle-1" },
            { "id": "bird", "label": "Help a lost bird",  "art": "choice-bird.png", "next": "middle-2" },
            { "id": "door", "label": "Find a secret door","art": "choice-door.png","next": "middle-3" }
          ]
        },
        "middle-1": { "lines": [ /* … */ ], "beat": "…", "choices": [ /* 3 → ending-1-1, ending-1-2, ending-1-3 */ ] },
        "middle-2": { "…": "…" },
        "middle-3": { "…": "…" },
        "ending-1-1": { "lines": [ /* … */ ], "beat": "…", "summary": "The two friends found their way home." },
        "ending-1-2": { "…": "…" }, "ending-1-3": { "…": "…" },
        "ending-2-1": { "…": "…" }, "ending-2-2": { "…": "…" }, "ending-2-3": { "…": "…" },
        "ending-3-1": { "…": "…" }, "ending-3-2": { "…": "…" }, "ending-3-3": { "…": "…" }
      }
    },
    { "id": "castle",      "title": "Castle",      "locked": true },
    { "id": "outer-space", "title": "Outer Space", "locked": true }
  ]
}
```

13 nodes for Forest (1 beginning + 3 middles + 9 endings), matching the approved mockup's "1 of 9 found" tracker.

Staging (added in the 2026-08 rescue): every node carries
`beats: [name, …]` — **one named beat per line**, so each sentence gets its own
bespoke two-actor performance — and `staging: { scenery: [{prop,x,y,scale}],
props: [id | {prop,x,y}] }`, the set dressing `js/theater-scene.js` builds when
the node begins (back-layer scenery like the log/tree/door/den/mud puddle,
plus story props like the map, bird, nut, gem that the beats fly, hand off and
spin). Node changes are real scene changes: the pair walks off into the wings,
the set swaps, and they stroll back on while the child starts tapping the next
line. Between performances an ambient fidget loop keeps the puppets alive, and
every tapped word gets a small acknowledging bob from one of them. The old
node-level `beat` remains as a fallback vocabulary (movement/props/pose only —
no baked dialogue, since the spoken line is driven by the word-tap/narrator
flow, not by `sayLine`).

`config.js` stays the thin fetch shim over `config.json` per the platform's data-driven-content convention, so the story tree is editable without touching code (and is Studio-editable later — see Studio integration below).

## Spoken script (fixed UI lines, verbatim — content authoring adds the per-node story lines to this list)

- Setup: "Pick a world, then pick two puppet stars!"
- Setup, locked world tap: "That world is still being built. Try Forest!"
- Read, first line of a node: "Tap each word to hear it!" (once per node, not repeated every line)
- Choice: "What happens next?"
- Complete: "\<node.summary>" then "Forest endings, \<n> of 9 found!" (both
  recorded since the 2026-08 rescue: `summary:<endingId>` ×9 and
  `ui:endingsFound:<n>` ×9 — no Web Speech on the celebration screen)
- Replay: "Let's tell it again!"
- Choose a new path: "Pick a new path!"

Per-node story lines (the `lines[]` arrays) and the 9 ending `summary` lines are written by content authoring against the controlled vocabulary above, puppet-agnostic, ~4–6 words per line, ~1–3 lines per node.

## Shared modules used
- `shared/js/stage/stage.js`, `puppet.js`, `theater.js` — the two-puppet act-out.
- `shared/js/voice-clips.js` — per-word clips, per-line narrator clips, fixed UI lines; Web Speech fallback.
- `shared/js/hud.js` + `hud.css`, `shared/js/screens.js`/`screens.css` (or a hand-rolled equivalent matching puppet-retell's pattern if `screens.js`'s card-based splash doesn't fit the setup screen's two-step picker — decide during implementation, record the choice here).
- `shared/js/tap.js`, `audio-unlock.js`, `celebrate.js`, `idle-nudge.js`, `debug-harness.js`, `timers.js`, `rng.js`, `dom.js`.
- `shared/js/content.js` (`wordAudio`) for the CVC-bank portion of the word-clip vocabulary.
- `shared/characters/<id>/` rig art for all 8 cast members (already produced).
- New: `shared/assets/backdrops/{forest-cottage,enchanted-castle,moon-adventure}.jpg` — promoted (copied, not moved) from `games/puppet-retell/assets/bg/` into `shared/` since a second game now uses them, per the shared-first rule. `games/puppet-retell/` is left untouched.

## New assets needed
- **Audio:** ~129 word clips + 39 narrator line clips + 9 summary clips + 9 endings-count clips + ~6 fixed UI-line clips, `qwen3-tts-voiceclone` batch + Whisper QA, this game's own `assets/audio/manifest.json`/`lines.json`.
- **Stage props (14, `assets/props/`):** map, bird, nut, nest, gem, moon, fox-cub, squirrel, bug + scenery log, tree, door, den, mud — extracted from the approved choice-card art (or generated in its felt world) and cut out via the layered pipeline; consumed by `theater-scene.js` staging.
- **Choice-card art (12):** 3 for Beginning (map / bird / door — extract directly from the approved `02`/`03` mockups via qwen-image-edit "isolate the X", they're already exactly on-model) + 9 for the three Middles' choices (new, generated in the same felt/puppet-theater world using the extracted 3 as style reference).
- **World-select tiles (3):** Forest usable now; Castle/Outer Space can be extracted from `01-story-library.png` for the "coming soon" state even though their story content isn't built yet.
- **Cast-picker portraits:** reuse `shared/characters/<id>/anim/head-ts.png` for all 8 (already exist, already used by the approved mockup as reference).
- **Title lockup:** generated graphic lockup per platform convention (not HTML text), felt/stitched "Tiny Reader Theater" in the puppet world — spell-checked at full size before acceptance.
- **Endings-tracker icon:** one small felt "tree" stamp glyph (outline + filled state), per the Complete mockup.
- Hub tile at `assets/hub/tiles/tiny-reader-theater.jpg` already exists and is **hands-off** — curated by the user, not regenerated by this build. Flag after ship whether it still matches (word-tap/branching, not the old fill-in-the-blank concept) for the user to consider.

## Interaction model
Word chips and choice/world/puppet cards are all ≥96px tap targets. One line is "in progress" at a time; tapped words are visually distinct (color fill, per mockup) and re-tappable to hear again (repetition is free and encouraged, never penalized). A line cannot be skipped by tapping ahead — the sparkle/narrator-performance step only fires once every word in that line has been tapped at least once.

## Feedback model
- **Word tap:** immediate word audio + color-fill state change, `sfx` tick/pop.
- **Line complete:** chip sparkle, then `theater.runBeats` plays the narrator's full-line read while the two puppets perform the mapped `beat`.
- **Choice tap:** card highlight + short whoosh transition into the next node's first Read line.
- **Ending complete:** `celebrate.tada()` + puppets' bow beat + endings-tracker increment (new discoveries only; replaying a known ending still celebrates, just doesn't re-increment).
- No wrong answers exist in this game — every word tap is correct by construction; there is no failure/retry state to design.

## Difficulty progression
None within Forest — all nodes are the same reading level. Progression is structural (repetition builds sight-word fluency across the 13 nodes) rather than difficulty-based. A future setting could raise line length/vocabulary once Forest data proves the pipeline.

## Replay variation
Different puppet pairs (28 combinations from 8 cast members) and different choice paths (9 distinct endings) are the built-in replay variation; the endings tracker gives an explicit "collect all 9" goal.

## `QLOBE_DEBUG` surface (v1)
- `ready` promise.
- `listModes()` → `['forest']` (castle/outer-space excluded while locked).
- `startMode('forest', { cast: ['bear','fox'] })` deterministic start.
- `state()` → `{ setting, cast, nodeId, lineIndex, tappedWords, endingsFound }`.
- `tapWord(index)` / `tapAllWords()` (drives the same handler real pointers use) for fast-forwarding a line.
- `chooseNext(choiceId)`.
- `seed(n)` (`rng.js`).
- `fastTimers()`.
- `mute(on)`.
- `endingsFound()` / `resetEndings()`.

## Privacy / permission / persistence
No microphone, no camera, no network calls at runtime. `localStorage` key `qk:tiny-reader-theater:forest:endings` stores the array of discovered ending ids (array of the 9 `ending-*` ids); no other persistence.

## Studio integration
Ship v1 as plain `config.json` (no Studio registry entry required to launch). If/when Castle and Outer Space are authored, register the story tree as a `scene-pack`-shaped object in `shared/js/studio/projects.json` (pattern from `docs/qlobe-studio-v2.md` §7.1/§9.2) so non-engineer content edits go through Studio instead of hand JSON edits — deferred, not blocking v1.

## Known risks / release gate
- **New interaction pattern** (word-by-word tap) has no prior art in this codebase — budget real iteration time on hit-target sizing/spacing for 4–7 word lines at tablet size before calling it done.
- **Vocabulary control is load-bearing**: if content authoring drifts into free prose, word-clip count balloons past what one TTS+QA batch should cover — enforce the controlled list at authoring time, not after.
- **Two puppets performing a scripted beat** (vs. puppet-retell's free improv) is a new `theater.js` usage pattern — confirm `runBeats` timing lines up with the narrator audio duration (`voiceClips.duration(key)`) so puppets don't finish acting before/after the line, not just that it doesn't error.
- Game stays `beta` until a real child playtest confirms the tap-each-word-then-perform loop reads clearly at tablet size and pacing feels right (this is exactly the kind of thing automated QA cannot judge).
