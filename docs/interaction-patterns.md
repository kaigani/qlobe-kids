# QLOBE Kids — Interaction Patterns

How our games feel to touch. These are the reusable building blocks behind every
QLOBE Kids game — the audio toolkit in `shared/js/`, the tap mechanics, and the
iPad tuning that makes it all feel immediate to a five-year-old. Read this
alongside `philosophy.md` before building.

Every pattern below is drawn from the reference game, `games/sound-sprouts/`.
Import paths assume a game at `games/<id>/`, reaching the library with
`../../shared/…`. **Reuse these; do not reinvent them.**

---

## 1. Audio unlock on the first gesture

**When to use:** always. iOS Safari (and most mobile browsers) refuse to play any
sound until the user makes a gesture inside the page. Unlock all three audio
channels — recorded voice, Web Speech, and WebAudio SFX — on the very first
`pointerdown`, once, then never again.

**Import:** `shared/js/audio.js`, `shared/js/speech.js`, `shared/js/sfx.js`.
Each exports an `unlock()`. `audio.unlock()` also unlocks speech internally, but
calling all three explicitly is harmless and clear.

```js
import * as audio from '../../../shared/js/audio.js';
import * as speech from '../../../shared/js/speech.js';
import * as sfx from '../../../shared/js/sfx.js';

let audioUnlocked = false;
function unlockAudio() {
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();      // resume the WebAudio context
  speech.unlock();   // speak a silent utterance in-gesture
  audio.unlock();    // warm + pause a real clip so play() is allowed later
}
window.addEventListener('pointerdown', unlockAudio);
```

`audio.unlock()` plays-then-pauses a real manifest clip (or a tiny silent
data-URI WAV if none exists yet) so subsequent programmatic `play()` calls are
permitted.

---

## 2. Manifest-driven recorded voice clips

**When to use:** any time a consistent human "teacher voice" should speak — sound
fragments, whole words, prompts, praise. This is the **primary** voice channel;
it sounds far warmer than synthesized speech. Always pass a `fallbackText` so the
game still talks when a clip (or the whole manifest) is missing.

**Import:** `shared/js/audio.js`. The clip library lives at
`shared/assets/audio/` with a `manifest.json` shaped as
`{ "<category>": { "<key>": { "file": "<category>/<key>.m4a", "dur": <sec> } } }`.
Categories in use: `fragments`, `words`, `prompts`, `celebrate`, `misc`.

**API:** `await audio.ready` (resolves once, never rejects); `audio.play(category,
key, opts)` → Promise that resolves when the clip ends; `audio.playSeq(items,
{gap})` to chain clips; `audio.stop()`. A `play` key maps directly to a manifest
entry: `play('fragments', 'c')` looks up `manifest.fragments.c`.

```js
await audio.ready;                                   // non-blocking; safe to await
// one clip, with a spoken fallback if it's not recorded yet
audio.play('words', 'cat', { fallbackText: 'cat', rate: 0.7, pitch: 1.05 });

// a sequence: intro, two sound fragments, outro, with 300ms gaps
audio.playSeq([
  { cat: 'misc', key: 'mystery-intro', fallbackText: 'Mystery word! Listen.' },
  { cat: 'fragments', key: 'c', fallbackText: 'kuh' },
  { cat: 'fragments', key: 'at', fallbackText: 'at' },
], { gap: 300 });
```

`play()` stops any current clip and cancels Web Speech first, so prompts and words
never overlap. Recorded clips have a fixed voice, so `rate`/`pitch` only affect
the fallback.

---

## 3. Web Speech fallback

**When to use:** two cases — (a) as the automatic fallback for a missing recorded
clip (handled for you when you pass `fallbackText` to `audio.play`), and (b) to
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
  audio.play('fragments', tile.userData.text, { fallbackText: tile.userData.spoken });
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

**Import:** `sfx.js` + `audio.js` + `speech.js`. The reference game branches into
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
  audio.play('misc', 'silly-' + (1 + (Math.random()*3|0)), { fallbackText: '...' });
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

**Import:** your game's confetti helper (see `sound-sprouts/js/confetti.js`,
three.js particles) + `sfx.js` + `audio.js` + the shared HUD "play/again" button
art in `shared/assets/ui/btn-play.png`.

```js
async celebrate(wordObj, left, right) {
  await audio.play('words', wordObj.word, { fallbackText: wordObj.word, rate: 0.7 });
  sfx.tada();
  burst({ x: 0, y: cardY, z: 1 }, { count: 130 });           // confetti particles
  await popCard(this.card, 0, cardY);                        // spring-scale reveal
  audio.play('celebrate', wordObj.word, { fallbackText: 'You made ' + wordObj.word + '!' });
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

**Import:** the shared button art in `shared/assets/ui/`:
`btn-home.png`, `btn-sound.png`, `btn-shuffle.png`, `btn-play.png`. Convention:

- **Home** — top-left. Returns to the menu; stops all audio.
- **Sound / "hear it again"** — bottom-left. Replays the current prompt. Debounce
  (~600ms) so rapid taps don't stack.
- **Shuffle / "new tiles"** — bottom-right. New set of pieces (freeplay-style modes).
- **Again / Play** — big, centered near the bottom, shown only after a win.

Buttons are ≥ 84px artwork on ≥ 96px targets, `touch-action: manipulation`, with a
press-down transform. In CSS the PNG *is* the button (round glossy cream), so drop
the pill background:

```css
.hud-img { background: transparent center/contain no-repeat; box-shadow: none; }
.hud-home  { background-image: url('../../../shared/assets/ui/btn-home.png'); }
.hud-sound { background-image: url('../../../shared/assets/ui/btn-sound.png'); }
```

Always prevent HUD `pointerdown` from reaching the game canvas
(`e.stopPropagation()`), or a corner tap will also fire a game tap.

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

**The viewport meta** (in `<head>`):

```html
<meta name="viewport"
      content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" />
<meta name="apple-mobile-web-app-capable" content="yes" />
```

**The CSS** (on `html, body` and the canvas):

```css
html, body {
  overflow: hidden;
  -webkit-user-select: none; user-select: none;
  -webkit-touch-callout: none;
  overscroll-behavior: none;
  touch-action: none;
}
#scene { touch-action: none; }   /* also set touch-action="none" on the <canvas> */
```

**The JS** — suppress the long-press menu and pinch-zoom, use Pointer Events only
(`pointerdown`, never `click`/`mousedown` for gameplay), and clamp
`devicePixelRatio` to 2 so retina iPads don't render 3× the pixels:

```js
window.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('gesturestart', (e) => e.preventDefault());
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); /* … */ },
  { passive: false });
```

Respect the safe area with `env(safe-area-inset-*)` when positioning corner HUD
buttons, so nothing hides under the notch or home indicator.

---

## 10. The module-URL rule (for shared code)

**When to use:** any time code **inside `shared/js/`** references a shared asset by
path (e.g. `audio.js` fetching its manifest). A plain document-relative path like
`./assets/audio/manifest.json` resolves against *the consuming page*, which differs
between the hub (`/`) and each game (`/games/<id>/`) — so it breaks. Resolve
against the **module's own URL** instead, and it works from anywhere.

**Import:** none — it's a language feature. Use `new URL(relativePath,
import.meta.url).href`:

```js
// inside shared/js/audio.js — resolves relative to THIS file, not the page
const MANIFEST_URL = new URL('../assets/audio/manifest.json', import.meta.url).href;
const AUDIO_BASE   = new URL('../assets/audio/', import.meta.url).href;
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

## 11. Drag & drop that can never strand a piece

**When to use:** any game where a child drags an item (food, tile, card) to a
target. Reference implementation: `games/lunchbox-pack/js/game.js`
(`onCardDown`).

Kids drag with both hands, mid-animation, and while the OS is doing something
else. The naive version — listeners on the dragged element + pointer capture —
strands the floating piece the moment that element leaves the DOM or the
`pointerup` never arrives. Rules learned the hard way:

1. **Listeners on `window`, filtered by `pointerId`** — never on the dragged
   element. If the source element is removed mid-drag, the stream survives.
2. **One drag at a time**: keep a "drag in progress" flag and ignore new
   `pointerdown`s while set; also ignore `e.isPrimary === false` (second
   finger).
3. **Handle `pointercancel` AND `window` `blur`** as "glide the piece home" —
   iOS fires cancel on gesture takeover, and app switches/notifications can
   eat the `pointerup` entirely.
4. **Wrap the drop action in try/catch** — an exception between "piece is
   floating" and "piece is placed" must still end with cleanup.
5. **Sweep stray clones** (`document.querySelectorAll('.drag-clone')`) on
   every new drag start and on game destroy. Should be dead code; keep it
   anyway — a stuck piece on a five-year-old's screen is never acceptable.
6. `touch-action: none` on draggable elements (or the browser will turn the
   drag into a scroll), `manipulation` everywhere else.
7. Offer **tap-tap as an equal path** (tap piece, tap target): easier for
   some kids, and it exercises the same single "attempt" code path.
