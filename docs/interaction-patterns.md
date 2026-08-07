# QLOBE Kids — Interaction Patterns

How our games feel to touch. These are the reusable building blocks behind every
QLOBE Kids game — the audio toolkit in `shared/js/`, the tap mechanics, and the
iPad tuning that makes it all feel immediate to a five-year-old. Read this
alongside `philosophy.md` before building.

Many of these patterns started in the reference game, `games/sound-sprouts/`. The
ones that turned out to be identical in every game have since been lifted into
`shared/`. Where a section below names a module, **import it — do not copy the
snippet into your game.** A copied pattern is a pattern that stops being fixed:
roughly twenty games hand-rolled the audio unlock, about half of them carried the
same iPadOS bug, and each copy had to be found and fixed on its own.

Import paths assume a game at `games/<id>/`, reaching the library with
`../../shared/…` from `index.html` and `../../../shared/…` from a module one
level deeper (`js/main.js`) — ES-module imports resolve relative to the
importing file, not the page.

| Pattern | Import instead of copying |
|---|---|
| §1 audio unlock | `shared/js/audio-unlock.js` |
| §2 recorded voice | `shared/js/voice-clips.js` |
| §7 celebration | `shared/js/celebrate.js` |
| §8 HUD | `shared/js/hud.js` + `shared/css/hud.css` |
| §9 iPad tuning | `shared/css/base.css` + `installKioskGuards()` |
| §11 drag to a target | `shared/js/stage/drag-to-slot.js` (Pixi) · `stage/drag-to-slot-dom.js` (DOM) |
| §14 freeform placement | `shared/js/freeform-board.js` |
| §15 screens & mode cards | `shared/js/screens.js`, `mode-select.js`, `shared/css/screens.css` |
| §16 the review hook | `shared/js/debug-harness.js` |
| §17 idle nudges | `shared/js/idle-nudge.js` |
| §18 the game's one voice | `shared/js/narrator.js` |

The same rule covers the small dependency-free helpers that don't get a section
of their own: `rng.js` (`mulberry32`, `hashString`, `shuffle`, `pick` — one
seeded source, so `seed(42)` reproduces), `dom.js` (`escapeHtml`, `el`),
`timers.js` (`createTimers()` — a cancellable, time-scalable group; see §16),
and `preload.js` (`preloadImages(urls, { idle })`, which never rejects).

---

## 1. Audio unlock on the first gesture

**When to use:** always. iOS Safari (and most mobile browsers) refuse to play any
sound until the user makes a gesture inside the page. Every audio channel —
recorded voice (`voice-clips.js`), Web Speech, WebAudio SFX — has
to be unlocked from inside that gesture's own task.

**Import:** `shared/js/audio-unlock.js`. Install it once, at module scope, and
never write the latch yourself.

```js
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';

installUnlockOnGesture({
  extra: [() => music.unlock()],       // any channel outside the four defaults
  onFirst: () => greet(),              // fires once ever, after the fan-out
});
installKioskGuards();                  // contextmenu + gesturestart (see §9)
```

`unlockAll(extra)` is the same fan-out without a listener, for a game that
already owns its first-gesture handler. Both call `sfx.unlock()`,
`speech.unlock()` and `voiceClips.unlock()`, each individually try/caught — one
dead channel (no `AudioContext`, no `speechSynthesis`) must never stop the
others or break the gesture the game also starts play from.

**What the hand-rolled copies got wrong.** About half of them latched with a
plain `let audioUnlocked = false` that never reopened. On iPadOS that guard goes stale
the moment the child switches apps, takes a call, or lets the screen lock: the
WebAudio context parks on `suspended`/`interrupted`, the speech queue wedges, the
clip element loses its play permission — and the boolean still says "unlocked",
so every later touch unlocks nothing and the game is silent for the rest of the
session. The module keeps **two latches with different lifetimes**: the unlock
latch resets on `visibilitychange` and `pageshow` (bfcache restores can skip
`visibilitychange` entirely), so the next touch genuinely re-unlocks; the
`onFirst` latch never resets, so a child returning from another app does not get
the intro line again. Coming back to the foreground also calls
`speechSynthesis.resume()`, which some engines leave paused forever.

**Never speak before the first gesture.** A greeting fired at page load either
silently fails or slips out as the system synth voice instead of the recorded
teacher. `onFirst` is where that line belongs.

`voiceClips.unlock()` plays-then-pauses the one reusable clip element (or a tiny
silent data-URI WAV if no clip has loaded yet) so subsequent programmatic
`play()` calls are permitted.

---

## 2. Manifest-driven recorded voice clips

**When to use:** any time a consistent human "teacher voice" should speak — sound
fragments, whole words, prompts, praise. This is the **primary** voice channel;
it sounds far warmer than synthesized speech. Always pass a `fallbackText` so the
game still talks when a clip (or the whole manifest) is missing.

**Import:** `shared/js/voice-clips.js`. A game keeps its own clip library at
`./assets/audio/` with a flat-key `manifest.json` shaped as
`{ "<key>": { "file": "<key>.m4a", "dur": <sec> } }`, plus a `lines.json` of
`{ "<key>": "spoken text" }` so the recorded and spoken-fallback voice always
say the same thing.

**API:** call `voiceClips.init(manifestUrl, linesUrl, defaultLines)` once at
boot (never rejects — a missing manifest just runs in speech-fallback mode);
then `voiceClips.say(key, fallbackText)` → Promise that resolves when the clip
ends; `voiceClips.unlock()`; `voiceClips.stop()`.

```js
import * as voiceClips from '../../../shared/js/voice-clips.js';

voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json');

// one clip, with a spoken fallback if it's not recorded yet
voiceClips.say('cat', 'cat');
```

`say()` stops any current clip and cancels Web Speech first, so prompts and words
never overlap.

**A game that needs to reach a clip in the SHARED library** (not its own
manifest) — e.g. a picture-word's recorded pronunciation, or a letter's phonic
sound — doesn't fork the module either. Resolve the URL with `content.js`
(§ shared-assets) and play it directly, bypassing the local manifest:

```js
import * as content from '../../../shared/js/content.js';
voiceClips.sayFile(content.wordAudio('cat'), 'cat');
voiceClips.sayFile(content.letterSoundUrl('c'), 'kuh');
```

Beyond `init` / `say` / `sayFile` / `unlock` / `stop`, `voice-clips.js` carries
the things games used to fork it for: `duration(key)` and `clipInfo(key)` (plan
a visual beat against the recording's real length instead of guessing),
`setMuted(on)` / `isMuted()`, and `getAudioLog()` / `clearAudioLog()` — a capped
ring buffer of `{ key, text, kind: 'clip' | 'speech', at }`. That `kind` is the
field a QA driver asserts on to prove the recorded teacher voice actually played
rather than the synth quietly standing in for it.

---

## 3. Web Speech fallback

**When to use:** two cases — (a) as the automatic fallback for a missing recorded
clip (handled for you when you pass `fallbackText` to `voiceClips.say`), and (b) to
voice **arbitrary, un-recordable text**: nonsense blends, a child's name, a
generated number. Recorded voice can't cover open-ended text; speech can.

**Import:** `shared/js/speech.js`. `speak(text, {rate, pitch})` → Promise;
`speakSeq(parts, {gap})`; `unlock()`; `stop()`. It auto-picks a friendly local
English voice (Samantha/Karen/Google US) and guards against the iOS mid-speech
GC bug.

```js
import * as speech from '../../../shared/js/speech.js';

// voice an arbitrary nonsense blend the manifest can't contain
await speech.speak('zub', { rate: 0.7, pitch: 1.0 });
```

Default rate is a slow, kid-friendly `0.8` with pitch `1.05`. It resolves even
when no synth is present, so it never hangs your loop.

---

## 4. Synthesized sound effects (zero files)

**When to use:** every tactile moment — taps, slots, whooshes, little
celebrations. These are generated live with WebAudio, so they cost no bytes,
never 404, and layer freely on top of the voice channel.

**Import:** `shared/js/sfx.js`. Named effects: `pop` (tap), `unpop` (undo),
`whoosh` (fly), `sparkle` / `tada` (wins), `silly` (goofy), `boing`, `tick` (UI
click), plus `unlock()`. Just call them.

```js
import * as sfx from '../../../shared/js/sfx.js';

sfx.tick();    // menu button press
sfx.pop();     // tile tapped
sfx.whoosh();  // tile flying to a slot
sfx.tada();    // word completed
```

SFX are a separate layer from voice — they keep firing alongside recorded clips,
so a "pop" and the spoken sound play together.

---

## 5. Tap-to-place build mechanic

**When to use:** the core touch loop for most games — tap a floating object, it
reacts, it flies to a target, the game evaluates. One tap = one hear-it-see-it-do-it
beat. No dragging (hard for small hands); tapping is forgiving and precise.

**Import:** three.js raycasting via `shared/vendor/`, plus your game's scene
helpers. The pattern (from `sound-sprouts/js/game.js`): a global `busy` lock
during animations so rapid taps can't corrupt state; a raycast pick; a bounce +
voice + whoosh + fly; then evaluate when the target is full.

```js
onPointer(clientX, clientY) {
  if (this.busy || this.awaitingAgain) return;     // ignore taps mid-animation
  const hit = pick(clientX, clientY, this.tiles);  // raycast against tappable set
  if (!hit) return;
  hit.userData.slotted ? this.unslot(hit) : this.slot(hit);
}

async slot(tile) {
  this.busy = true;
  sfx.pop();
  await bounceTile(tile);                                   // squash-and-stretch
  voiceClips.sayFile(content.letterSoundUrl(tile.userData.text), tile.userData.spoken);
  sfx.whoosh();
  await flyTo(tile, slot.world.x, slot.world.y);            // gentle arc
  this.busy = false;
  if (bothSlotsFull) this.evaluate();
}
```

Note the ordering: **hear it** (sound plays on tap) → **see it** (bounce + fly) →
**do it** (it lands). A slotted object taps back out — every action is reversible.

---

## 6. Gentle retry & modeling — never harsh failure

**When to use:** every evaluation. A "wrong" answer is never a loss. Model the
correct thing, respond warmly, and return the pieces so the child simply tries
again. Design distractors so wrong picks often still make *something* real.

**Import:** `sfx.js` + `voice-clips.js` + `speech.js`. The reference game branches into
three warm outcomes — a real picture-word (celebrate), a real word with no picture
(a bonus sparkle), or nonsense (a silly, giggly response) — and in the last two
just floats the tiles back home. No red X, no buzzer, no "try again" scold.

```js
async evaluate() {
  const blend = left.userData.text + right.userData.text;
  if (WORD_BY_KEY.has(blend))      await this.celebrate(WORD_BY_KEY.get(blend));
  else if (BONUS_SET.has(blend))   await this.bonus(blend);   // sparkle + "real word!"
  else                             await this.silly(blend);   // jiggle + goofy noise
}

async silly(blend, left, right) {
  sfx.silly();
  await Promise.all([jiggleTile(left), jiggleTile(right)]);   // playful, not punitive
  await speech.speak(blend, { rate: 0.7 });                   // model what it says
  voiceClips.say('silly-' + (1 + (Math.random()*3|0)), '...');
  await this.returnTiles(left, right);                        // reset for another try
}
```

The "hint" is modeling: the game always *speaks the result* so the child hears
what their combination makes, then quietly resets.

---

## 7. Celebration loop

**When to use:** on every success — the payoff that closes a 30–90s loop. Keep it
short, layered, and repeatable, with an obvious "Again" affordance so the child
stays in flow. Guided/mystery rounds also auto-advance after ~6s so a distracted
kid isn't stranded.

**Import:** `shared/js/celebrate.js` for a DOM screen, `shared/js/stage/particles.js`
when you already have a Pixi stage — plus `sfx.js` / `voice-clips.js` and the shared
"play/again" button art in `shared/assets/ui/btn-play.png`.

```js
import { tada, burstConfetti, QK_PALETTE } from '../../../shared/js/celebrate.js';

tada();                                  // sfx.tada() + the platform burst
const cancel = burstConfetti({ host: card, count: 30 });   // just the confetti
```

`tada({ confetti: false })` is the sound alone; everything else you pass goes
straight through to `burstConfetti`. Both return a cancel function, safe to call
late, twice, or never.

**What the nine hand-rolled copies got wrong.** Three things. First,
**`prefers-reduced-motion`**: the module is a total no-op under it (motion *is*
the effect, so a slower version is not an accommodation) while `tada()` still
plays the sound — a child who can't take the animation still gets the payoff.
Second, **the palette**: `QK_PALETTE` is pinned to the `0x…` values in
`stage/particles.js`, so a DOM game and a Pixi game celebrate in the same six
colours. Third, **cleanup**: every piece goes into one throwaway layer, so
cancelling is a single `remove()` and the host's child count is exactly what it
was before; a `static` host is promoted to `relative` and put back, so the layer
can't escape to the page corner.

**Two shapes of celebration, and they are not the same thing.** A burst is a
*beat* — something happened, the pieces fall once, the module sweeps up.
`{ loop: true }` is *ambience* on a destination screen where the child has
arrived somewhere good and stays: the pieces fall forever, nothing sweeps up, and
**the caller owns the lifetime** through the returned dispose. Under `loop`,
`duration` changes meaning — it becomes the nominal time one piece takes to fall
(jittered ±15%), not a lifetime. The ambient knobs exist because ambience is art
direction in a way a win beat is not, and every one of them defaults to exactly
what the burst has always rendered:

```js
// clay-creature-studio's Alive screen — blob flecks drifting straight down
disposers.push(burstConfetti({
  host, loop: true, count: 34, palette: CLAY_CONFETTI, duration: 2600,
  drift: 0, easing: 'ease-in', piece: CLAY_FLECK, rng: mulberry32(state.seed),
}));
```

Pass a seeded `rng` (§16) when the layer is on screen long enough for a
screenshot diff to care.

**The choreography is still yours.** The module owns the confetti; the *order of
the beats* is the craft, and it is what makes a win feel like a win. From the
reference game (its `burst()` is the three.js particle backend):

```js
async celebrate(wordObj, left, right) {
  await voiceClips.sayFile(content.wordAudio(wordObj.word), wordObj.word);
  sfx.tada();
  burst({ x: 0, y: cardY, z: 1 }, { count: 130 });           // confetti particles
  await popCard(this.card, 0, cardY);                        // spring-scale reveal
  voiceClips.sayFile(content.wordCelebrate(wordObj.word), 'You made ' + wordObj.word + '!');
  this.awaitingAgain = true;
  this.showAgain();                                          // big round Again button
  this.advanceTimer = setTimeout(() => this.again(), 6000); // gentle auto-advance
}
```

Layer the beats: word spoken → SFX → confetti → picture pops in → praise clip.
Never block input forever — always offer Again *and* auto-advance.

---

## 8. HUD conventions

**When to use:** every game's on-screen furniture. Keep it minimal and iconographic
(no text labels a pre-reader can't use), with big round buttons in the corners.

**Import:** `shared/js/hud.js` for the elements, `shared/css/hud.css` for every
pixel of the look. One vocabulary, distilled from the ~20 bespoke copies
(`.hud`, `.round-button`, `.qk-coach-img-btn`, …) that all described the same
control.

```html
<link rel="stylesheet" href="../../shared/css/hud.css" />
```

```js
import { hudButton, soundDebounce, progressDots } from '../../../shared/js/hud.js';

const back = hudButton('back', () => screens.show('splash'));
back.classList.add('qk-hud-top-left');       // placement is the caller's
mount.append(back);

const replay = hudButton('sound', soundDebounce(() => narrator.say('prompt')));
replay.classList.add('qk-hud-bottom-left');

bar.append(progressDots(rounds.length, done));   // .qk-dots / .qk-dot / .is-done / .is-now
```

`hudButton(kind, onPress, { label })` takes `'home' | 'back' | 'sound'`, sets the
accessible name (children never read it; screen readers and QA drivers do), and
wires the press through `tap.js` with an `sfx.tick()` on `pointerdown`. It
returns the `<button>` with a non-enumerable `dispose()` for controls that
outlive their screen. The class vocabulary: `.qk-hud-btn` plus a variant
(`.qk-hud-home` / `.qk-hud-back` / `.qk-hud-sound`, whose background images
resolve relative to the *stylesheet*), plus a corner (`.qk-hud-top-left` …
`.qk-hud-bottom-right`) or a `.qk-hud-bar` strip.

**Placement conventions** (unchanged, and still the game's job):

- **Home** — top-left, splash only. Returns to the catalog; stops all audio.
- **Back** — top-left on every deeper screen. Returns to the splash in-page.
- **Sound / "hear it again"** — bottom-left. Replays the current prompt.
- **Shuffle / "new tiles"** — bottom-right. New set of pieces (freeplay modes).
- **Again / Play** — big, centered near the bottom, shown only after a win.

**What the hand-rolled copies got wrong.** Three things the stylesheet now
guarantees. (1) **The 96px press-target floor.** The artwork steps down on small
screens — 96 → 84 → 76px, matching the range games already used by hand — but a
`::before` pseudo-element sized `max(96px, 100%)` is what the finger actually
hits, so the target never drops under the platform floor no matter how small the
icon gets. Copies that shrank the button shrank the target with it. (2) **Safe
areas.** Corner offsets are `max(gap, safe-inset)`, so buttons clear an iPad's
rounded corners and camera housing without wasting space on a device that has
neither. (3) **The tap can't leak.** `hudButton` calls `stopPropagation()` on
both the feedback and the action, so a corner tap never also fires a tap on the
playfield underneath. `.qk-hud-bar` additionally sets `pointer-events: none` on
itself (children re-enable it) so its dead middle can't swallow a playfield tap.

The PNG *is* the button — round, glossy, cream. There is no pill background, no
border, no fill; drop them if your game had them.

`soundDebounce(fn, ms = 600)` is the replay guard every game copies, leading-edge
(the first press always goes through immediately) with a `.reset()`. A child
drumming on the sound button gets the prompt once instead of eight overlapping
copies of it.

`progressDots(total, done)` is decorative and `aria-hidden` on purpose: "3 of 5"
is not information a pre-reader consumes, and the narrator says it out loud.

**hud.js deliberately does not unlock audio.** Unlocking is the one global
first-gesture listener's job (§1). A button that unlocks is a button whose first
press behaves differently from its second — exactly the class of bug the global
listener exists to kill.

**Navigation routing.** Two levels, always: the game **splash** (mode menu) has
the round **home** button (`btn-home.png`) linking to the catalog (`../../`).
Every deeper screen — play and end — has the round **back** button
(`btn-back.png`) instead, returning to the game splash in-page (no navigation).
A child is never more than two taps from the catalog and never loses a game's
menu by tapping home mid-round. Engines implement this already; custom games
must follow it.

This rule is now **checked, not just documented**: `screens.js` warns the first
time a non-splash screen is shown carrying a home control, and `wireEndScreen`
warns when an end screen's "back" is an `<a href>` — a home button wearing a back
button's icon (§15). Both are `console.warn`, never a throw.

**One press path.** Never play feedback on `pointerdown` but act on `click` — a
touch can tick and then drop the action (movement past the tap slop suppresses
the synthetic click), which reads as "I tapped it and nothing happened". Wire
buttons through `shared/js/tap.js`:

```js
import { onTap } from '../../../shared/js/tap.js';

onTap(btn, () => startMode(btn.dataset.mode), {
  feedback: (e) => { e.preventDefault(); unlockAudio(); sfx.tick(); },
});
```

The action fires on `pointerup` over the element (the same press the feedback
came from); `click` is kept for keyboard/assistive-tech only. Sliding a finger
off before lifting still cancels. `onTap` returns a disposer — call it in
`destroy()` if the control outlives the screen.

---

## 9. iPad tuning

**When to use:** always — the platform is tablet-first. These settings kill the
double-tap zoom, long-press callout, rubber-band scroll, and text selection that
otherwise wreck a touch game.

**The viewport meta** (in `<head>`) — and the rest of the `<head>` run, which is
generated: fill `game.json` in, then run
`node tools/pipeline/gen-head-meta.mjs --write --only <game-id>`.

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
<meta name="apple-mobile-web-app-capable" content="yes" />
```

**The CSS: link it, don't copy it.** All 103 games used to hand-copy the same
`@font-face` + reset block. That block is now `shared/css/base.css`, and a game
keeps exactly two local rules — the two things base.css deliberately refuses to
decide for you, the page colour and the display font:

```html
<link rel="stylesheet" href="../../shared/css/base.css" />
<style>
  :root { --qk-bg: #bee3f5; }
  body { font-family: 'Fredoka', 'Arial Rounded MT Bold', sans-serif; }
</style>
```

That is the whole local style block in most of the library — see
`games/pattern-train/index.html`. base.css ships the `@font-face` (resolved
relative to the stylesheet, so it is correct at any folder depth), `box-sizing`,
transparent tap-highlight, `touch-action: manipulation` and `user-select: none`
on `body`, `margin: 0; height: 100%`, `#game { height: 100dvh }` (`dvh`, not
`vh`, so a collapsing iPad toolbar can't push the bottom HUD off screen), the
`.hidden` / `.visually-hidden` utilities, and the safe-area custom properties
`--qk-safe-top/right/bottom/left` (with `0px` fallbacks — an unresolvable `env()`
poisons the whole declaration). A font-family is *not* imposed, because a
stylesheet that did would silently restyle every engine that links it.

What base.css does **not** decide, and a full-bleed game still adds locally:

```css
html, body { overflow: hidden; overscroll-behavior: none; }
#scene { touch-action: none; }   /* also set touch-action="none" on the <canvas> */
```

**The JS** — `installKioskGuards()` from `shared/js/audio-unlock.js` (§1)
suppresses the long-press callout and pinch-zoom and returns a disposer. Use
Pointer Events only (`pointerdown`, never `click`/`mousedown` for gameplay), and
clamp `devicePixelRatio` to 2 so retina iPads don't render 3× the pixels:

```js
installKioskGuards();   // contextmenu + gesturestart preventDefault
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); /* … */ },
  { passive: false });
```

Position corner HUD furniture against `var(--qk-safe-*)` — or just use the
`.qk-hud-*` corner classes (§8), which already do — so nothing hides under the
notch or home indicator.

---

## 10. The module-URL rule (for shared code)

**When to use:** any time code **inside `shared/js/`** references a shared asset by
path (e.g. `content.js` resolving a word's clip URL). A plain document-relative
path like `./assets/audio/manifest.json` resolves against *the consuming page*,
which differs between the hub (`/`) and each game (`/games/<id>/`) — so it
breaks. Resolve against the **module's own URL** instead, and it works from
anywhere.

**Import:** none — it's a language feature. Use `new URL(relativePath,
import.meta.url).href`:

```js
// inside shared/js/content.js — resolves relative to THIS file, not the page
const SHARED = new URL('../', import.meta.url); // → shared/
const url = (rel) => new URL(rel, SHARED).href;
```

**The exception — three.js `TextureLoader` and `<img>`:** these resolve relative to
the **document**, not the module. From a game page at `/games/<id>/`, a
document-relative `../../shared/assets/letter-tiles/foo.png` correctly reaches
`/shared/assets/letter-tiles/foo.png`. So in *game* code (not shared code) that
loads textures/images, use the `../../shared/…` document-relative form:

```js
// inside a game's tiles.js — TextureLoader resolves against the document
const tex = texLoader.load(`../../shared/assets/letter-tiles/${key}.png`);
const img = new Image();
img.src = `../../shared/assets/objects/${name}.png`;
```

Rule of thumb: **shared modules → `new URL(…, import.meta.url)`; game-level
texture/image loads → `../../shared/…` document-relative.** Never hard-code the
domain in either case.

**Stylesheets get this for free.** A `url()` in `shared/css/*.css` resolves
against the stylesheet, not the page — which is why `base.css` can name
`../fonts/…` and `hud.css` can name `../assets/ui/btn-home.png` and both stay
correct from any game folder. The one place the rule inverts is a caller naming
its *own* file: `voiceClips.init('./assets/audio/manifest.json', …)` resolves
against the document, because that path is the game's, not the library's.

## 11. Drag & drop that can never strand a piece

**When to use:** any game where a child drags an item (food, tile, card) to a
target. **Import the controller for your renderer:**

- **Pixi / Stage v2** → `shared/js/stage/drag-to-slot.js`. It owns the lifecycle
  and the client→stage projection and reports only the dragged card's centre back
  in stage coordinates; hit testing (which slot, which bin) stays engine-side,
  because in a Pixi scene there is no shared answer — `sequence-order` wants
  nearest-centre-within-radius and `sort-into-bins` wants rect containment. It
  defaults to `grabOffset: 0.35` (the card stays under the finger's *grip point*);
  pass `grabOffset: 0` to reproduce centre-on-finger feel bit-for-bit, which is
  how a new adopter should land before opting into the offset feel as a separate,
  separately-verifiable change.
- **DOM** → `shared/js/stage/drag-to-slot-dom.js`. Same lifecycle, plus hit
  testing — because in the DOM there *is* a shared answer, the browser's own
  `elementFromPoint`, which respects z-order, transforms and overflow clipping for
  free. The resolved slot is reported as `drag.slot` on every move and on the
  drop; a game is free to ignore it and work from `drag.x` / `drag.y`.

```js
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';

const stoneDrag = createDragToSlotDom({
  getPiece: (id) => mount.querySelector(`[data-stone="${CSS.escape(String(id))}"]`),
  canStart: () => screen === 'select',
  onGrab: (piece, drag) => !selection.includes(drag.id),  // false = never even listen
  onDrop: (piece, drag) => { if (drag.slot) addStone(drag.id); },
});

button.onpointerdown = (event) => { stoneDrag.begin(event, id); };
```

Beyond `begin(event, id)` the controller returns `cancel()`, `detach()`,
`hitTest(x, y)`, `sweepStrayGhosts()` and an `active` getter (the live drag, or
`null` — story-stones reads it so a `click` fired at the end of a drag doesn't
also count as a tap). The knobs that matter
per game: `slotSelector` (default `[data-slot]`), `slotPad` (px of forgiveness —
`0` means `elementFromPoint` only; above `0`, a miss falls back to a padded-rect
scan taking the **nearest centre**), `ghostOn: 'lift' | 'press'`, `slop`
(default `DRAG_SLOP`, 10), `hoverClass`, `makeGhost`, `cancelOnBlur`,
`preventDefaultOnPress`.

Kids drag with both hands, mid-animation, and while the OS is doing something
else. The naive version — listeners on the dragged element + pointer capture —
strands the floating piece the moment that element leaves the DOM or the
`pointerup` never arrives. **Rules 1–5 below are what the module owns**, and the
two hand-rolled copies it replaced each had a *different subset* of them — which
is the whole argument for importing it:

1. **Listeners on `window`, filtered by `pointerId`** — never on the dragged
   element. Every one of these games re-renders its whole screen with
   `innerHTML`, which silently kills a `pointerup` bound to that element and
   welds a ghost to a five-year-old's finger with no way to put it down.
   (`setPointerCapture` is still called on the source, in a try/catch, as
   belt-and-braces against mid-gesture re-targeting on some Android builds.)
2. **One drag at a time**: a "drag in progress" gate, plus ignoring
   `e.isPrimary === false` (the second finger).
3. **`pointercancel` and blur are cancels, not drops.** This is the one worth
   stating twice. iPadOS palm rejection fires `pointercancel` carrying whatever
   coordinates the palm was at — often over a slot — and committing that places a
   stone the child never chose. Cancel therefore removes the ghost and fires
   `onCancel`, **never `onDrop`**. Blur cancels too (opt out with
   `cancelOnBlur: false`): without it, a notification or app switch eats the
   `pointerup`, the drag stays "in flight" forever, the one-drag gate rejects
   every future press, and the game is dead until reload.
   A **tap is not a drop either** — a press that never passed the slop gate fires
   `onTap`, so your `click` path (which is also what keeps keyboard and AT
   activation working) doesn't double-fire the attempt.
4. **try/catch/finally around every game callback** — an exception between "piece
   is floating" and "piece is placed" must still end with cleanup.
5. **Sweep stray ghosts** on every drag start and on destroy (the legacy
   `.drag-clone` class is swept alongside the module's own). Should be dead code;
   kept anyway — a stuck piece on a child's screen is never acceptable.

Still yours, because they live in your CSS and your game design:

6. `touch-action: none` on draggable elements (or the browser turns the drag into
   a scroll), `manipulation` everywhere else.
7. Offer **tap-tap as an equal path** (tap piece, tap target): easier for
   some kids, and it exercises the same single "attempt" code path.

The pre-extraction reference, `games/lunchbox-pack/js/game.js` (`onCardDown`),
still shows the shape for a game that has not adopted either module.

## 12. An on-demand render pump must be driven, not poked

**When to use:** any game that calls `app.ticker.stop()` and renders only when
something asks — the battery-friendly default for a mostly-still play field.
Reference implementation: `games/flashlight-cave/js/cave.js` (`requestRender`,
`track`) and its `showLedge` caller in `js/game.js`.

Stopping the ticker means you get **no free repaints**, and that turns an
invisible detail of texture loading into a visible bug. A single
`requestRender()` after adding a sprite is not enough: the frame that first
draws a newly created texture is the frame that performs its **GPU upload**,
and it draws before the pixels are resident. Unless another frame follows, the
sprite is invisible — and in a still scene "another frame" may never come, so
the art appears only when the child happens to touch something.

This shipped in Flashlight Cave: the picture-mode prompt object was invisible
until the child first moved the light.

1. **Register every animation with `track()`** — including a one-shot `popIn`.
   A tween registered only with the game's own tracker (for teardown safety)
   cancels correctly but drives nothing.
2. **`await img.decode()` before building a texture from an `<img>`.** An image
   that has fired `onload` may still be undecoded, and it cannot be uploaded
   until it is. Sprites that go through a canvas (a white-key pass, say) are
   immune, because `drawImage` forces the decode — so this bites exactly the
   assets that looked fine.
3. **Schedule a couple of settle renders** after creating any texture, as the
   safety net for callers that draw into an otherwise-still scene.
4. Remember the shared pumps are separate: `stage/tween.js` and
   `stage/particles.js` each run their own `requestAnimationFrame` loop and
   never call `app.render()` for you. `stage.js:createStage()` also installs a
   `visibilitychange` handler that restarts the ticker — install your own after
   it, or a tab switch silently undoes the stop.

**The QA consequence, which is the real lesson:** state assertions cannot see
this. The sprite exists, its texture reports valid dimensions, its alpha is 1,
its bounds are exactly right — and nothing is drawn. Only pixels can catch it.
Screenshot the element's screen rect before and after and compare
(`page.screenshot({ clip })` composites the canvas correctly; `drawImage` /
`getImageData` on a WebGL canvas returns all zeroes, because
`preserveDrawingBuffer` is false).

## 13. Safe-area clamping for anything outside the playable band

**When to use:** prompts, banners, ledges and mascots authored "above" or
"below" the play area. Reference implementation:
`games/flashlight-cave/js/cave.js` (`safeBand`, `ledgeSpot`).

Cover-fit crops art space differently in every aspect ratio. Targets usually
get a `safeBand()`-style clamp because they must stay tappable — but the
decorative furniture authored just outside that band is exactly what quietly
walks off a wide, short window, and it is the part nobody thinks to clamp.

- Clamp against **what the viewport actually shows**, not the authored band,
  and keep the HUD reserve in **screen** px rather than art px — the HUD is
  screen furniture, so an art-space reserve only works on one aspect ratio.
- **Re-clamp on resize**, not only at creation: an orientation change moves
  where the element may legally sit.
- Test at **1180×520**. A 4:3-ish viewport and portrait both fail to reproduce
  the crop, so a gate that only checks those two will pass while the element
  sits off screen.
- Assert the element's **painted bounds**, not just its computed slot. A slot
  derived from the clamp stays healthy even when the sprite it positions was
  never moved.

## 14. Freeform composition that survives rotation and reload

**When to use:** open-ended creation games where a child places decorations,
props, collage pieces, or course objects without a single correct slot.
Canonical implementation: `shared/js/freeform-board.js`; production references:
`games/clay-creature-studio/` (free placement and auto-mirroring) and
`games/tangram-tales/` (explicit 45-degree rotation and undoable transforms).

Free placement is not ordinary drag-to-slot. The final position is the product,
so the controller must preserve it across viewport changes and local saves:

1. Store the **piece center as normalized coordinates** in the board, plus its
   kind, size, rotation, mirror state, z-order, and semantic metadata.
2. Keep the pointer-to-object offset. A grabbed eye must not jump its center
   under a child's finger.
3. Let the piece center reach the **full creative surface**, with a small
   overscan. Do not inset the legal center by half the rendered piece: that
   makes horns, hats, antennae, and edge collage pieces mysteriously stop short.
   Use one active pointer with window-level move/up/cancel listeners.
4. Treat pointer cancel or blur as a cancelled edit: restore the before-drag
   snapshot so a notification cannot leave an object half moved.
5. Raise the selected piece's z-order, provide a visible selection halo, and
   serialize only data—never DOM or pixels.
6. For a direct-manipulation tray, require **drag from source to surface**. A
   press-and-release on the tray must not create an object. Render a lightweight
   drag ghost, preserve its pointer stream at `window`, and call `board.add()`
   only after a valid surface drop.
7. Make deletion spatial too: expose a large, legible trash drop zone and call
   `board.remove()` only when a placed piece is released over it. Highlight the
   zone during hover; do not hide discard behind an edit toolbar.
8. Mark asymmetric pieces with semantic direction metadata. Recompute their
   mirror state on every `pointermove` as the center crosses the figure median—
   never only on drop—so wings, arms, feet, and tails visibly turn outward while
   the child is still dragging, without separate left/right sprites.
9. Save semantic snapshots to a bounded local gallery. A storage failure must
   degrade to session play; persistence is never required to finish a loop.

The module exposes `add`, `remove`, `clear`, `undo`, `load`, `move`, `transform`,
`rotate`, `select`, `snapshot`, `getItems`, and `destroy`. `transform` updates
normalized position, size, rotation, and mirror state as one undoable semantic
edit; `rotate` is its child-sized step-rotation convenience. A snapshot has format
`qlobe-freeform-board` version 1 and can be rendered by the real game at any
size, which makes saved miniatures and production QA use the same composition.

## 15. Screens, and the row of mode cards

**When to use:** every game with a splash → play → end shape, which is every
game. Canonical implementation: `shared/js/screens.js` (the router),
`shared/js/mode-select.js` (the cards), `shared/css/screens.css` (the look).
Zero Pixi, zero network — both bespoke DOM games and the Pixi engines consume it.

```html
<link rel="stylesheet" href="../../shared/css/base.css" />
<link rel="stylesheet" href="../../shared/css/screens.css" />
<link rel="stylesheet" href="./css/style.css" />
```

Link order is the whole compatibility story: every rule in screens.css is
single-class specificity, so **a game keeps its skin by being last**.

```js
import { createScreens, wireEndScreen } from '../../../shared/js/screens.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';

const screens = createScreens({
  screens: { splash: els.splash, play: els.play, reveal: els.reveal },
  initial: 'splash',
  voice,                      // anything with stop(); stopped on every transition
});

renderModeCards({
  host: els.modeList,
  modes: config.modes,
  onPick: (id) => screens.start(() => startMode(id), { busy: false }),
});

async function startMode(id) {
  screens.release();          // tear the previous run of this mode down
  screens.show('play');
  screens.hold(nudger.stop, drag.detach);   // runs when this screen is left
}
```

**Screens are hidden with the `hidden` ATTRIBUTE, not a class.** The router
stamps `data-qk-screen` on adoption and strips any stale `.hidden` class so the
two mechanisms cannot disagree. screens.css makes `[data-qk-screen][hidden]`
`display: none !important` — because a screen's own `display: grid` is otherwise
same-specificity and later in the cascade, which is exactly how a "hidden" screen
ends up painted on top of the live one.

The controller: `current` / `starting` / `names` getters, `el(name)`,
`is(name)`, `show(name, { silent, force })`, `hold(...disposers)`,
`release(name)`, `pending(name)`, `start(runner, { busy })`, `destroy()`.
`createBag()` is exported separately because per-*step* teardown is the same
shape as per-screen teardown.

**What the copies got wrong**, all three seen in the audit:

1. `showScreen(name)` written as a hard-coded list of `classList.toggle` calls.
   Adding a fourth screen means editing a line that has nothing to do with it,
   and forgetting one leaves two screens stacked.
2. **No `starting` latch.** Two taps 80ms apart run the whole mode start twice:
   two teardowns, two renders, two voice lines over each other. `screens.start()`
   swallows the second and releases the latch in a `finally`, so a runner that
   throws cannot lock the child out of every mode for the rest of the session.
3. **Teardown attached to the caller rather than the screen**, so the one exit
   path someone forgot leaks a gesture controller onto the next screen.
   `screens.hold()` puts it on the screen; a throwing disposer can never strand
   the rest.

**Two traps for adopters:**

- `show()` is **idempotent**. `show('play')` while already on `play` runs neither
  the disposer bag nor `voice.stop()` — deliberate, so a stray re-show can't tear
  down live gesture handlers. Restarting a mode in place must call
  `screens.release()` first, or `show(name, { force: true })`. Engines that
  rebuild `innerHTML` on every `startMode` are the ones most likely to hit this.
- `wireEndScreen` defaults to `hold: true`, which disposes its listeners when the
  end screen is left. Right for engines (they re-render the end screen each time,
  so they rewire each time); wrong for a game whose end screen is static markup —
  those pass `hold: false`.

`wireEndScreen({ screens, back, choose, again, onAgain, onSplash, feedback })`
enforces §8 rather than restating it: back and "choose another" **share one
destination**, the splash, and a `back` that is an `<a href>` gets a
`console.warn`. Pass `feedback: null` for no pointerdown feedback — the key's
*presence* is what opts out.

`renderModeCards` splits structure from paint, and that split is what lets a game
with its own card art adopt it. `.qk-mode-card` is applied always and carries
only the contract — the ≥96px touch floor and `touch-action: manipulation`. Every
painted rule is scoped under `.qk-mode-list`, which is added to the host only when
`skin` is on, so **`skin: false` keeps every pixel a bespoke splash had**
(snack-chef passes `{ skin: false, cardClass: 'recipe-card', showTitle: false }`).
Other knobs: `art`, `label`, `vars`, `decorate` (badges), `cardClass`, `replace`,
`targetPrefix` (the `data-target` QA hook, `mode-<id>` by default). `modeCard()`
is exported on its own for a game laying out its own splash. Like hud.js, it does
**not** unlock audio — pass your own `feedback` if a card press must.

## 16. The review hook — `window.QLOBE_DEBUG`

**When to use:** every game, from its first mode. It is what lets an agent, a QA
driver, or the studio play the game without eyes: list the modes, start one, read
the state, tap a target, win a round, mute, seed, run the clock fast. The v1
contract itself is documented in
[`shared/js/engines/README.md`](../shared/js/engines/README.md); this section is
about installing it.

**Import:** `shared/js/debug-harness.js` — `installDebug(spec)`, which returns a
`dispose()` that restores whatever hook was there before, and `collectTargets()`.

```js
import { installDebug } from '../../../shared/js/debug-harness.js';

installDebug({
  gameId: config.id,
  ready,                                   // a Promise
  listModes: () => modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({ screen: screens.current, mode, round, awaitingInput }),
  tap, winRound, home,

  // reserved dependency keys — consumed to build the defaults, never published
  timers,                                  // the createTimers() group(s) to scale
  onSeed: (rng) => { state.rng = rng; },   // where the seeded generator goes
  narrator, voice, sfx,                    // what mute() fans out to
});
```

Anything you pass that the contract doesn't name is spread onto the hook
untouched — that is how a game adds `getLayout()`, `getAudioLog()`, `nextCase()`
without bumping `version`. `tap`, `winRound` and `home` get **no default on
purpose**: a stub that always answers "not accepted" reads exactly like a real
rejection, and their absence is how a reviewer feature-detects what this game
supports.

**Two wiring requirements, and both fail silently if you skip them:**

- **`onSeed` is how `seed(n)` reaches your game.** The default builds a
  `mulberry32(n)` and hands it to `onSeed(rng, seed)`; without that callback it
  has nowhere to put it, and `seed(42)` returns 42 while changing nothing. Take
  the generator into the variable your shuffles actually read
  (`onSeed: (rng) => { state.rng = rng; }`), and reseed *before* the deck is
  drawn — reseeding a shuffle that already happened proves nothing.
- **`timers` is how `fastTimers()` reaches your delays.** Hand in the
  `createTimers()` group (or an array of groups) the game schedules on. A game
  with no group still gets one created for it so the key is wired rather than
  stubbed, but nothing is scheduled on it, so nothing speeds up. Scaling only
  reaches what a group scheduled, and only timers scheduled *after* the call —
  already-pending ones keep the delay they were given. `fastTimers()` accepts
  either dialect (`0.05`, the duration multiplier, or `20`, the speed factor) and
  returns the clamped multiplier.

The defaults that are worth having: `getTargets()` → `collectTargets(root,
selector)`, which reads `[data-target]` and **drops zero-size rects**, because a
`display: none` control is not a target and a reviewer that taps one gets a
mystery instead of a failure; and `mute()`, which silences *everything audible* —
the narrator, voice and sfx channels you handed in, `speechSynthesis.cancel()`,
and every `<audio>` / `<video>` element on the page. A trailing line from the
gesture before is exactly what spoils a QA recording, and the hand-rolled copies
each forgot a different one of those.

The drivers that consume the hook live in `games/<id>/tools/qa.mjs` and share
`tools/qa/lib/driver.mjs` — see [`tools/qa/README.md`](../tools/qa/README.md).
One thing from there that belongs here: Playwright's bundled Chromium has **no
AAC decoder**, so every `.m4a` silently fails to decode and every recorded-clip
assertion passes against the synth voice instead. Audio checks need
`channel: 'chrome'`.

## 17. The idle nudge — "still there?" without nagging

**When to use:** any screen that waits for the child to act. A five-year-old who
stops touching the screen has usually not quit; they are looking at the picture,
or talking to whoever is next to them. The answer is a gentle nudge on a timer
that **any** player action pushes back — never a countdown, never a failure,
never a sound that says they were too slow.

**Import:** `shared/js/idle-nudge.js`.

```js
import { createNudger } from '../../../shared/js/idle-nudge.js';

const nudger = createNudger({
  first: 11000,
  repeat: 11000,
  onNudge: (n) => {
    if (!state.awaitingInput) return;      // your guard, not the module's
    if (n === 0) repeatPrompt();           // build a ladder from the index
    else if (n === 1) highlightTarget();
    else modelTheAnswer();
  },
});

nudger.arm();     // start / restart the countdown; the ladder resets to 0
nudger.poke();    // the child did something
nudger.stop();    // leaving the screen — register this with screens.hold()
```

`onNudge` receives the nudge index (0, 1, 2, …), so the *timing policy is yours*
and only the bookkeeping is shared. What the module gets right that the copies
didn't: it **auto-pokes on any `pointerdown`** while armed (installed only while
armed, so a stopped nudger holds no listener and costs nothing); it **skips a
nudge while `document.hidden`** and retries later, because nudging into a tab
nobody is looking at just burns the ladder; a throwing `onNudge` is swallowed;
and `poke()` before `arm()` or `stop()` twice are both no-ops, so game code can
poke unconditionally from its input path.

## 18. The game's one voice

**When to use:** any game that speaks more than a single line. Canonical
implementation: `shared/js/narrator.js`.

**Import:** `shared/js/narrator.js`. It defaults to `voice-clips.js`, so a game
whose lines already live there needs no arguments.

```js
import { createNarrator } from '../../../shared/js/narrator.js';

const voice = createNarrator();                 // or ({ say, saySeq, stop })
await voice.say('prompt-find', 'Find the cat!');
voice.saySequence(['intro', ['cheer', 'You did it!']]);
voice.stop();
voice.setMuted(true);                           // isMuted(), dispose()
```

`saySequence` accepts `'key'`, `['key', 'spoken text']`, `{ key, text }` or
`{ key, fallbackText }`.

**What the hand-rolled copies got wrong.** Every polished game grew the same ~25
lines, and the part that is hard to get right is the **monotonic token**: when the
child interrupts — taps a new card, hits replay, goes home — the in-flight
sequence has to *stop*, not wake up two beats later and talk over the newer line.
The narrator bumps a token on every `say`, `saySequence` and `stop`, and the
sequence re-checks it **after every await**, including after the line it just
spoke was cut off mid-word. Hand it to `createScreens({ voice })` and every screen
transition stops the outgoing line for free.

The other thing it owns is the **`aria-live` announcer**: a `.visually-hidden`
node (the class ships in `base.css`) that mirrors every spoken line. Note the
deliberate asymmetry — **muting silences audio only, and the announcer keeps
updating**, because a screen-reader user has muted nothing; the game's sound
toggle is not their assistive tech's volume. `dispose()` stops, removes the
announcer node, and makes every later call a no-op.

## 19. Expressive voice input without recording

**When to use:** a child should make a voice louder, softer, steadier, or more
playful and the screen should react live. Use `shared/js/voice-meter.js`; use
`performance-recorder.js` instead only when the product actually needs a saved
or replayable performance.

```js
import { createVoiceMeter, voiceSparks } from '../../../shared/js/voice-meter.js';

const meter = createVoiceMeter();
if (await meter.request()) {
  const summary = await meter.listen({
    durationMs: 2300,
    onFrame: ({ level }) => updateLights(level),
  });
  if (summary.heard) celebrate(voiceSparks('happy', summary));
}
meter.close();
```

The service holds a live `MediaStream` only while the game needs it, reads
time-domain samples into memory, and returns summary features: active duration,
energy, peak, pitch mean/range, and energy variation. It does **not** use
`MediaRecorder`, create a Blob, persist samples, or make a network call. Close it
on screen exit and `pagehide` so the browser’s microphone indicator turns off.

Do not call the result “emotion recognition.” Microphone distance, room noise,
device gain, accent, age, and physiology make that claim unfair and technically
false. A child’s clearly heard attempt should always succeed; profile-relative
scores may vary an ambient reward such as one to three sparks, never gate
progress. Permission denial and unsupported browsers need an image-led
tap-and-perform fallback that preserves the same play fantasy.
