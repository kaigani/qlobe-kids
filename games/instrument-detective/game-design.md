# Instrument Detective — game design

## Product intent

Instrument Detective is a six-case listening mystery for ages 2–6. A friendly owl presents a sound, the child taps the matching instrument, and every solved case joins a tiny concert band. Spoken instructions, large targets, immediate retry feedback, and no required reading keep the game preschool-friendly.

## Screen map

1. **Splash:** title, owl, instrument peeks, PLAY, and (after completion) MY BAND. Home exists only here.
2. **Listen case:** progress plaque, spoken clue, raster LISTEN button, three instrument cards, and a casebook row. HUD provides mute and back.
3. **Case reveal:** the correct card celebrates with an instrument-specific motion and spoken praise, then advances.
4. **Concert:** all six instruments are unlocked. Tapping a card plays its sample; PLAY WHOLE BAND performs the set. HUD returns to splash.

## Core loop

Six shuffled rounds cover maracas, drum, bell, piano, guitar, and flute. Each round plays one real sample and asks the child to find its matching instrument among three choices. Wrong taps wiggle gently, preserve progress, and invite another try. Correct taps add the instrument to the casebook, play sparkle feedback, speak a short fact, and advance. Completing all six stores local progress and unlocks the concert.

The bell case uses `agogo-b.m4a`, the closest available preschool hand-bell proxy, while retaining bell art and language. This compromise is recorded in `ASSETS.md`.

## Interaction and accessibility

- Every primary control is a real labelled button with a touch target of at least 96 CSS pixels.
- Spoken instructions and clues mean reading is optional.
- Shape, illustration, and name reinforce color differences.
- Mute is session-persistent; the game remains playable if audio is blocked.
- Reduced motion receives static reveal states.
- Progress is local-only and optional; replay does not remove unlocks.
- `window.QLOBE_DEBUG` supports deterministic seeds, target inspection, fast timers, mute, and state snapshots.

## Audio direction

Listening rounds omit background music so the instrument timbre is clear. Shared platform samples provide the six sounds; shared SFX provide tap, retry, sparkle, and finale feedback. Lines live in `data/lines.json` and use shared voice-clips fallback or approved voice-clone clips. TTS acceptance is transcript matching (normalized similarity ≥ 0.92 per line), not merely successful file generation.

## Art direction and status

The world is a cozy after-dark children’s theater: plum curtains, teal and golden light, painted-paper texture, cream sticker outlines, jewel-tone toy instruments, and an expressive owl detective. All game-specific art is raster; prompts, paths, and processing decisions are in `assets/source/PROMPTS.md` and `ASSETS.md`.

The shipped modes are `listen` and `concert`. The earlier prototype’s separate “Loud or Soft?” mode was folded into the stronger six-case loop so the child learns instrument identity before free play. The game remains beta until a real child/iPad playtest checks sample volume, card spacing, and voice pacing.
