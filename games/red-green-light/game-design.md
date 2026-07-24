### Mini-GDD: Red Light, Green Light (games/red-green-light/)

**Category:** social-emotional · **Engine:** game-local `js/game.js` (caller-cues)
· **splashEmoji:** 🚦

**Premise:** the child picks a **video-puppet caller** — a muppet-style monster,
fairy, robot, dragon, and friends, each in their own world — and that caller runs
the game. The caller bops and calls "Green light! Go, go, go!" (kids run around the
room), calls the switch, and freezes solid on "Red light! Freeze!" Impulse control
as a giggling full-body game. Prop the tablet up and play across the room; the bold
red/green frame color reads from anywhere in the room.

**Learning:** impulse control, stop/go self-regulation, listening while moving.

**Why callers:** the fun is a *character* you love telling you to run and freeze.
Eight callers, each with a distinct look, setting, and voice, give repeat play and
"pick mine!" ownership. All caller art, voices, and talking video are original,
generated locally (see ASSETS.md).

**Flow:** caller-select (grid of poster tiles; each idles-alive on tap-in) →
mode-select (chosen caller idle-loops while you choose) → play (video caller loop)
→ end (caller idles + cheers, play again / back).

**Motion model (per cue clip):** the caller says the line, then —
- **green / yellow** → a short **seamless loop** (bop / wiggle) that invites
  movement for the whole window;
- **red** → settles and **holds the frozen last frame** (models freezing).
Every clip's first and last frame are the same resting pose, so loops don't jump
and clips hand off cleanly to the **idle loop** (a silent breathing/sway clip used
on the mode and end screens).

**Modes:**
1. `classic` (rounds 5): states go (green, '#58a945', pop, "Green light! Go, go,
   go!", 3–8s) and stop (red, '#c9503a', boing, "Red light! Freeze!", 2–5s).
2. `silly` (rounds 5): inserts wiggle (yellow, '#f4c53d', silly sfx, "Yellow light!
   Wiggle, wiggle!", 2–4s) between go and stop — harder switching, more giggles.

**Voice tone:** energetic and playful, per-caller character (goofy monster rumble,
chimey fairy, etc.), big contrast between GO excitement and FREEZE drama. Recorded
per caller; `speech.js` is the fallback if a clip can't load.

**Assets:** per caller — poster + green/red/yellow/idle talking videos +
greet/cheer voice lines. Reuses shared `sfx.js`, `speech.js`, UI buttons, font.
Only the selected caller's clips load per session (lazy). See ASSETS.md.
