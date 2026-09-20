# Then & Now — History Detective

## Product promise

Then & Now is a picture-first introduction to historical change for ages 4–7. A child opens a watercolor time-travel book, handles familiar object cards, and discovers a simple idea: tools can look different across time while doing the same job.

The source brief's historical-object learning goal takes precedence over the early personal-growth mockup concept. The mockups remain the reference for the open-book composition, watercolor material language, big pictorial actions, and earned gallery. This keeps Then & Now distinct from the shipped Family Timeline game.

## Learning goals

1. Use “then” and “now” as concrete time concepts.
2. Classify familiar objects as older or modern tools.
3. Connect two tools by a shared purpose rather than surface appearance.
4. Hear and use early history vocabulary in short spoken sentences.

## Adventure map

```text
splash / History Detective book
  ├─ Long Ago or Today
  │    object → Then/Now pocket → paired reveal ×3 → gallery
  └─ Same Job, New Tool
       old tool → choose modern match → paired reveal ×3 → gallery
```

The Time Traveler Gallery is an earned reward screen, not a third learning mode. Home appears only on the splash and returns to the catalog. Back on every deeper screen returns to the in-game splash.

## Mode 1 — Long Ago or Today

- Three shuffled historical pairs create six object turns.
- Each pair stays adjacent, while its older/newer order is shuffled.
- The child may drag the focal card into a pocket or tap the card and then the pocket.
- A correct placement settles into the pocket and speaks “That belongs in Then” or “That belongs in Now.”
- After both halves of a pair are placed, the book opens a side-by-side reveal and narrates the job they share.
- A wrong pocket gives one warm retry prompt per short mistake cluster, a small return animation, and leaves all progress intact.

## Mode 2 — Same Job, New Tool

- Three older tools are selected for the session.
- Each turn shows one old-tool anchor and three large modern picture candidates.
- The correct tool opens a side-by-side storybook reveal and speaks the shared-function sentence.
- A wrong candidate gently wiggles, speaks a concise clue, and remains available for recovery.

## Object stories

| Then | Now | Narrated relationship |
|---|---|---|
| Candle | Lightbulb | A candle and a lightbulb both make light. A lightbulb does not need a flame. |
| Quill | Keyboard | A quill and a keyboard both help people write. Keyboards can make letters very quickly. |
| Horse-drawn carriage | Car | A carriage and a car both help people travel. Carriages were pulled by horses. |
| Letter | Smartphone | A letter and a phone both send messages. A phone can send one in a moment. |
| Phonograph | Headphones | A phonograph and headphones both play music. Both bring songs close to our ears. |
| Washboard | Washing machine | A washboard and a washing machine both wash clothes. The machine swishes them for us. |

## Art and interaction direction

- Canonical art world: **Watercolor / Storybook**.
- Authored raster art supplies every visible book, pocket, medallion, badge, card, object, and button plate. CSS only arranges and animates those materials.
- The landscape book uses facing pages; portrait uses two stacked scrapbook panels. Short landscape compresses furniture without shrinking any required touch target below 96 px.
- The splash behaves like a bright history reading nook. Gameplay is cream paper with blue “Then” and lavender “Now” grammar. The gallery changes to deep time-travel blue and a gold star path for a stronger payoff.
- Motion is brief, physical, and optional: card lift/return, pocket pop, badge arrival, and gallery confetti. Reduced-motion preference collapses all animation timing.

## Audio direction

- A rights-cleared teacher reference is cloned with the local Qwen3 voice workflow.
- Every clip is transcribed with Whisper and compared with its intended line before acceptance.
- Recorded clips are primary; the same text in `assets/audio/lines.json` is the Web Speech fallback.
- Gentle Country Morning is the low-volume underscore. Narration ducks music. Object taps add short semantic WebAudio sounds; success and retry remain soft.
- iPad audio is unlocked on the first gesture and re-unlocked after foreground restoration.

## Replay and progression

- Seeded shuffle chooses three of six pairs and candidate order, so QA is reproducible while normal play varies.
- Completed pair IDs persist locally only; no child data or media is stored.
- The splash badge reports found clues and reopens the latest three discoveries.
- Replay starts a newly shuffled session in the same mode.

## Accessibility and safety

- Every action has a visible picture, spoken cue, accessible label, and keyboard activation path.
- Target collection excludes hidden controls and QA asserts the 96 px platform floor.
- No countdowns, penalties, ads, accounts, external content, or irreversible child actions.
- Narration also updates an aria-live region; muting game audio never mutes assistive technology.

## Debug and QA contract

`window.QLOBE_DEBUG` version 1 exposes `ready`, `listModes`, deterministic `seed`, `startMode`, `getState`, `getTargets`, `tap`, `winRound`, `home`, `mute`, and `fastTimers`, plus:

- `place(itemId, era)` for the sort mode;
- `choose(pairId, candidateId)` for the match mode;
- `repeatPrompt()`, `getAudioLog()`, `clearAudioLog()`, and `clearProgress()`.

Serialized state includes screen, mode, seed, round, active pair/item, queue/candidates, placements/matches, gallery discoveries, mute/reduced-motion state, and the audio log. QA must complete both modes through real pointer handlers, exercise one wrong answer in each mode, inspect every reveal and gallery, verify recorded voice use, and capture 1180×820, 1024×768, 768×1024, and short-landscape layouts locally and in production.
