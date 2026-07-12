# Feelings Charades — game design (polished remake)

**Category:** social-emotional · **World:** story-screen · **Status target:** live
**Tagline:** Learn emotions, playfully.
**Custom code** (no archetype engine) — first game through `docs/polish-process.md`.

## What this game is

The child learns eight feelings by *performing* them. A cast friend
demonstrates a feeling with their whole body (video vignette or posed art),
the teacher voice describes the body language, and then the child acts it out
in the room — no camera, no judging, just a coached, celebrated performance.
Feelings that can overwhelm (frustrated, worried, sad) pivot into a real
coping practice: guided breathing, tell-someone, ask-for-a-hug.

### Departures from the brief and the beta (and why)

- **The brief's camera mechanic is cut** (user decision): iPad Safari has no
  face-detection API, vendored ML conflicts with the no-build platform, and a
  camera raises privacy questions the platform doesn't need. The demonstrator
  cast + act-along keeps the brief's whole loop (select → act → reinforce →
  cope) without it.
- **The beta's listening quiz survives** as Mode 2 — its "body clues" audio
  items are good SEL content and give the game the platform-standard second
  mode.
- The brief's "Excited/Shy" cards join the beta's six feelings for the
  mockup's full 2×4 grid.

## Casting

| Feeling | Demonstrator | | Feeling | Demonstrator |
|---|---|---|---|---|
| Happy | Maya | | Sad | Nia |
| Proud | Maya | | Calm | Nia |
| Frustrated | Leo | | Worried | Sam |
| Excited | Leo | | Shy | Sam |

Ravi hosts: talking portrait on the splash (viseme mouth rig), cheers at the
end.

## Screens & loop

### Splash
Backdrop (story-screen sky/green/coral). Title. Talking Ravi portrait speaks
the intro. Two mode buttons: **Act It Out**, **Guess the Feeling**. Home
button → catalog (splash only, per navigation routing).

### Mode 1 — Act It Out

**1. Feeling grid** — 2×4 cards, each the demonstrator posed for that feeling
+ label text; tapping speaks the label and opens the feeling. Completed
feelings wear a gold star. Back button → splash. All 8 stars → grand cheer.

**2. Demo** — the demonstrator performs: video vignette (~6s, loops once) or
posed art with a slow gentle zoom, while the narration line plays. A big
"Your turn!" button advances (audio prompt after narration too).

**3. Act-along** — full-screen invitation with a soft pulsing ring (10s):
the invite line plays, then two timed encouragements (at ~3s and ~7s). The
ring completing = done (no input needed; a "Done!" tap also ends it early —
never a fail). Then the affirmation + learning line with a sun **Well done!**
badge pop and confetti.

**4. Coping pivot** (frustrated, worried, sad only) — after the affirmation:
- *Frustrated → Calm*: breathing screen. Code-drawn concentric rings expand
  (breathe in, 4s), hold (2s), contract (breathe out, 4s) ×3, voice-guided.
  Reduced-motion: rings become three static step icons that highlight in turn.
- *Worried*: "tell someone you trust" moment — voice models the ask-for-help
  sentence, child repeats it aloud.
- *Sad*: "a hug helps" — name your hug person, give a self-hug squeeze.

**5. Star lands on the card**, return to grid.

### Mode 2 — Guess the Feeling
The beta's six listening items, upgraded: posed cast art as the prompt
(replacing flat portraits), recorded voice, four feeling-face answer cards
(posed art thumbnails). Correct → short affirmation; wrong → warm nudge and
replay. 6 rounds, progress dots, confetti end screen.

### End screens
Mode-complete screens follow platform idiom (cheer + Play Again + back), per
`docs/interaction-patterns.md`; back → splash.

## Voice script (recording manifest — every line verbatim)

### Host / chrome
- `intro`: "Hi, I'm Ravi! Let's play Feelings Charades. You can act out big
  feelings, or guess them. Pick a game!"
- `mode-act`: "Act It Out! Pick a feeling card, watch a friend show it, then
  act it out with your whole body."
- `mode-guess`: "Guess the Feeling! Listen to the body clues, then tap the
  feeling face."
- `grid-prompt`: "Tap a feeling card."
- `your-turn`: "Now it's YOUR turn!"
- `done-early`: "Beautiful acting!"
- `all-stars`: "You acted out every feeling! You are a feelings expert.
  Big feelings, small feelings — you know what to do."
- `cheer-guess`: "Feelings charades finished! You know your feelings!"
- `nudge-guess`: "That face does not match yet. Listen to the body clues
  again."
- `try-another`: "Try another feeling!"

### Per feeling: label / demo narration / invite / encouragements / affirmation / learning

**Happy (Maya)**
- label: "Happy!"
- demo: "Maya feels happy! Her eyes are bright, she is smiling big, and she
  bounces on her toes."
- invite: "Show me YOUR happy! Smile big and bounce!"
- enc-1: "Yes! Look at that smile!" · enc-2: "Bounce, bounce, bounce!"
- affirm: "Well done! That looked happy!"
- learn: "When you feel happy, share your smile — it spreads!"

**Proud (Maya)**
- label: "Proud!"
- demo: "Maya feels proud! She worked hard and did it. She stands tall, hands
  on her hips, chin up, big smile."
- invite: "Show me YOUR proud! Stand tall and smile!"
- enc-1: "So tall! Chin up!" · enc-2: "Hands on hips — ta-da!"
- affirm: "Well done! That looked proud!"
- learn: "When you feel proud, stand tall and say: I did it!"

**Frustrated (Leo)**
- label: "Frustrated!"
- demo: "Leo feels frustrated! The puzzle piece will not fit. His arms are
  crossed, his eyebrows squeeze together, and he stomps one foot. Hmph!"
- invite: "Show me YOUR frustrated! Cross your arms and stomp — hmph!"
- enc-1: "Big stomp! Squeeze those eyebrows!" · enc-2: "One more hmph!"
- affirm: "Wonderful acting! That looked frustrated!"
- learn: "It's okay to feel frustrated. Let's learn a trick for it."
- cope-intro: "When frustration feels too big, we can breathe it smaller.
  Let's take three slow breaths together."
- breathe-in: "Breathe in… slowly…" · hold: "Hold it…" ·
  breathe-out: "And breathe out… all the way…"
- cope-done: "Feel that? Your body is calm again. You can always breathe a
  big feeling smaller."

**Excited (Leo)**
- label: "Excited!"
- demo: "Leo feels excited! Something amazing is about to happen. His hands
  wave fast, his feet dance, and his eyes are wide!"
- invite: "Show me YOUR excited! Wave your hands and dance!"
- enc-1: "Faster, faster!" · enc-2: "Wiggle those excited feet!"
- affirm: "Well done! That looked excited!"
- learn: "When you feel excited, you can jump, dance, and tell a friend why!"

**Sad (Nia)**
- label: "Sad!"
- demo: "Nia feels sad. She misses her toy. Her shoulders are low, her head
  hangs down, and her voice is tiny."
- invite: "Show me YOUR sad. Let your shoulders sink down low."
- enc-1: "Slow and droopy…" · enc-2: "A tiny quiet sigh…"
- affirm: "Beautiful acting. That looked sad."
- learn: "It's okay to feel sad. Sad needs a helper."
- cope-intro: "When you feel sad, a hug helps. Think of your hug person —
  who would you ask?"
- cope-action: "Now give yourself a big squeeze hug. Squeeze… and let go."
- cope-done: "Hugs help sad feelings get softer. You can always ask for one."

**Calm (Nia)**
- label: "Calm!"
- demo: "Nia feels calm. Her body is still like quiet water. She breathes in
  slowly… and out slowly."
- invite: "Show me YOUR calm. Be still, and breathe slow."
- enc-1: "So still… so quiet…" · enc-2: "One more slow breath…"
- affirm: "Beautiful. That looked calm."
- learn: "Calm is a superpower. You can find it with one slow breath."

**Worried (Sam)**
- label: "Worried!"
- demo: "Sam feels worried. What if he cannot find his shoe? His tummy feels
  jumpy, his eyebrows squeeze, and his hands twist together."
- invite: "Show me YOUR worried. Squeeze your eyebrows, twist your hands."
- enc-1: "Oh no, where is that shoe?" · enc-2: "Jumpy tummy face!"
- affirm: "Great acting! That looked worried!"
- learn: "It's okay to feel worried. Worries get smaller when we share them."
- cope-intro: "When you feel worried, talk to someone you trust. Let's
  practice. Say it with me:"
- cope-action: "I feel worried. Can you help me?"
- cope-done: "That's it! Grown-ups love to help with worries. You never have
  to hold one alone."

**Shy (Sam)**
- label: "Shy!"
- demo: "Sam feels shy. There are new friends at the park. He peeks out, his
  chin tucks down, and he gives a tiny little wave."
- invite: "Show me YOUR shy. Tuck your chin and do a tiny wave."
- enc-1: "A little peek…" · enc-2: "The tiniest wave in the world…"
- affirm: "Well done! That looked shy!"
- learn: "Shy is okay. A tiny wave is a brave hello."

### Guess mode (ported from the beta, spoken as-is)
The six existing `say` lines from the beta config (frustrated / happy / sad /
worried / calm / proud body-clue riddles) plus per-answer labels and the four
existing yums.

## Art list

- `assets/bg.jpg` — story-screen backdrop: soft sky-blue with green hills and
  coral/yellow accents per mockups, open center.
- `assets/cards/<feeling>.png` ×8 — demonstrator posed per the demo lines
  (dark-bg → layered extraction, ~512px, PNG-8). Card art AND video fallback.
- `assets/video/<feeling>.mp4` ×0–8 — vignettes that pass the gate.
- `assets/badge-sun.png` — "Well done!" sun badge per mockup.
- Cast neutral-pose reference sheets (production-side, not shipped) — also
  unblock future cast video.
- Reuse: cast portraits + mouth rigs (`shared/characters/`), UI buttons,
  Fredoka.

## Debug hook (QLOBE_DEBUG v1)

`listModes` → act/guess; `startMode`; `getState()` →
`{screen, mode, feeling, phase (grid|demo|act|cope|affirm), stars, round}`;
`getTargets()` → feeling cards / answer cards with screen rects; `tap(id)`
through real input; `winRound()` completes the current feeling (or guess
round) concurrency-safely; `seed(n)`; `mute()`; plus `fastTimers()` —
compresses act-along ring, breathing phases, and demo dwell to ~200ms for QA
drives.
