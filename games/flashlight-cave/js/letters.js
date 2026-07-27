// letters.js — the neon letters in the alcoves, and the letter → object morph
// that pays off finding one.
//
// No letter art files exist and none should (game-design.md §4.4): 26 letters ×
// states as PNGs would be heavier and worse than PIXI.Text. Each letter is
// Fredoka 600 in a neon-outline TextStyle (cream fill, gold stroke), a second
// copy at scale 1.08 and low alpha as a cheap bloom, and a soft radial glow
// behind it. No BlurFilter — a filter is exactly what the veil's compositing
// decision (five tinted quads, no masks, no shaders) exists to avoid.
//
// Everything visual is driven from spotlight.onChange via setLitness(), never
// from a ticker. At L = 0 a letter sits at 6 % alpha under a 90 %-opaque veil:
// genuinely invisible, which IS the game.
//
// TRAP: Pixi bakes a Text to a texture at construction, so cave.js must have
// awaited ensureFont() before anything here runs, or the letters are permanently
// Arial.

import { to, ease, popIn } from '../../../shared/js/stage/tween.js';

const CREAM = 0xfff3d0;
const GOLD = 0xffc04a;
const GLOW = 0xffb347;
const OBJECT_TINT = 0xfff0d0;   // §3.3 step 6 — sit INSIDE the warm light

const reducedMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

// ---------------------------------------------------------------------------
// TEARDOWN HYGIENE: cancel a display object's tweens before destroying it.
//
// The platform is safe either way — shared/js/stage/tween.js now drops a tween
// whose target has been destroyed (and one that throws for any other reason)
// without stopping the shared rAF pump, so a stray tween can no longer take
// every animation on the page down with it.
//
// This game still cancels first, because it is cheaper and tidier: every tween
// the game starts on something it might destroy is registered on that object,
// and `destroyDisplay()` cancels before it destroys, so the pump never spends a
// frame stepping animations nobody can see. `to().cancel()` takes effect on the
// next pump step, which resolves the promise without touching the target — so
// cancel-then-destroy in the same tick is safe.
// ---------------------------------------------------------------------------

/** Remember a cancellable tween promise on the object it animates. */
export function trackTween(obj, p) {
  if (!obj || !p || typeof p.cancel !== 'function') return p;
  const set = obj.__fcTweens || (obj.__fcTweens = new Set());
  set.add(p);
  Promise.resolve(p).catch(() => {}).then(() => { set.delete(p); });
  return p;
}

/** Stop every tween registered on `obj`. Safe on anything. */
export function cancelTweens(obj) {
  const set = obj && obj.__fcTweens;
  if (!set) return;
  for (const p of set) { try { p.cancel(); } catch { /* already settled */ } }
  set.clear();
}

/** The only way this game destroys a Pixi display object. */
export function destroyDisplay(obj, opts) {
  if (!obj) return;
  cancelTweens(obj);
  try { obj.destroy(opts); } catch { /* already gone */ }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(a, b, t) {
  const x = clamp01((t - a) / (b - a));
  return x * x * (3 - 2 * x);
}

// --- the soft glow texture, baked once at module scope ----------------------
// Same technique as spotlight.js: a 2-D canvas radial gradient, identical on the
// WebGL and WebGPU renderers (unlike Graphics gradients), no asset to 404.
let glowTex = null;
function softGlow(PIXI) {
  if (glowTex) return glowTex;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const half = size / 2;
  const g = ctx.createRadialGradient(half, half, 0, half, half, half);
  for (let i = 0; i <= 24; i++) {
    const u = i / 24;
    g.addColorStop(u, `rgba(255,255,255,${Math.pow(1 - u, 2.4).toFixed(4)})`);
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glowTex = PIXI.Texture.from(c);
  return glowTex;
}

/**
 * One letter in the cave.
 *
 * @param {object} PIXI
 * @param {string} char an uppercase A–Z
 * @param {{capHeight?:number, fontFamily?:string}} [opts]
 * @returns {object} the letter handle; add `.view` to spotlight.scene
 */
export function createLetter(PIXI, char, { capHeight = 170, fontFamily = 'Fredoka' } = {}) {
  // Fredoka's cap height is ~0.72 em, so this lands the drawn capital on the
  // authored 170 art px of §4.3 rather than 170 px of em box.
  const fontSize = Math.round(capHeight / 0.72);
  const style = {
    fontFamily,
    fontWeight: '600',
    fontSize,
    fill: CREAM,
    stroke: { color: GOLD, width: 9, join: 'round' },
    align: 'center',
  };

  const view = new PIXI.Container();
  view.eventMode = 'none';         // hit-testing is the spotlight registry's job

  const glow = new PIXI.Sprite(softGlow(PIXI));
  glow.anchor.set(0.5);
  glow.width = glow.height = capHeight * 2.4;
  glow.tint = GLOW;
  glow.alpha = 0;
  glow.blendMode = 'add';

  const bloom = new PIXI.Text({ text: char, style });
  bloom.anchor.set(0.5);
  bloom.scale.set(1.08);
  bloom.alpha = 0;

  const text = new PIXI.Text({ text: char, style });
  text.anchor.set(0.5);
  text.alpha = 0.06;

  view.addChild(glow, bloom, text);

  let revealed = false;
  let dead = false;

  const api = {
    char,
    view,
    text,
    bloom,
    glow,
    x: 0,
    y: 0,

    setPosition(x, y) {
      api.x = x;
      api.y = y;
      view.position.set(x, y);
    },

    /**
     * The one place a letter's look is driven (§4.4). L is spotlight.litness().
     */
    setLitness(L) {
      if (revealed || dead) return;
      const lit = clamp01(L);
      text.alpha = 0.06 + 0.94 * smoothstep(0.05, 0.85, lit);
      bloom.alpha = 0.8 * lit * lit;
      glow.alpha = 0.55 * lit * lit;
      const s = 1 + 0.06 * lit;
      view.scale.set(s);
    },

    /** Reveal beat 3: the letter blooms to 1.25 and the glow goes white-gold. */
    bloomFull() {
      revealed = true;
      text.alpha = 1;
      bloom.alpha = 0.9;
      glow.tint = 0xfff6dc;
      if (reducedMotion()) {
        view.scale.set(1.25);
        glow.alpha = 1;
        return Promise.resolve();
      }
      return Promise.all([
        trackTween(view, to(view, { scale: { x: 1.25, y: 1.25 } }, { ms: 320, easing: ease.outBack })),
        trackTween(view, to(glow, { alpha: 1 }, { ms: 320 })),
      ]);
    },

    /** The gentle path (§6.6 step 2): ±6° twice over 320 ms, then settle. */
    async wobble() {
      if (reducedMotion()) return;
      const a = 0.1047;                              // 6°
      for (const r of [a, -a, a * 0.6, -a * 0.6, 0]) {
        if (dead) return;
        await trackTween(view, to(view, { rotation: r }, { ms: 64, easing: ease.inOutSine }));
      }
    },

    destroy() {
      dead = true;
      destroyDisplay(view, { children: true });
    },
  };

  api.setLitness(0);
  return api;
}

/**
 * The reveal object: the shared 78-object sprite, springing out from behind the
 * letter (§3.3 step 6). Drawn into `above`, so the veil never dims it.
 *
 * @param {object} PIXI
 * @param {object} container spotlight.above
 * @param {object} texture   already-loaded texture (or null — then nothing happens)
 * @param {{x:number,y:number,height:number}} at art-space placement
 * @returns {{sprite:object, done:Promise}}
 */
export function revealObject(PIXI, container, texture, { x, y, height }) {
  if (!texture) return { sprite: null, done: Promise.resolve() };
  const sprite = new PIXI.Sprite(texture);
  sprite.anchor.set(0.5);
  const k = height / (texture.height || height);
  sprite.tint = OBJECT_TINT;
  sprite.position.set(x, y);
  sprite.eventMode = 'none';
  container.addChild(sprite);

  if (reducedMotion()) {
    sprite.scale.set(k);
    return { sprite, done: Promise.resolve() };
  }
  // popIn() tweens scale to 1, so the sprite is pre-scaled by wrapping it in a
  // container whose own scale carries the size. Cheaper: tween to k directly.
  sprite.scale.set(0.01);
  const done = trackTween(sprite, to(sprite, { scale: { x: k, y: k } }, { ms: 340, easing: ease.outBack }));
  return { sprite, done };
}

/**
 * The picture-mode prompt sprite on its lit ledge (§3.2). Always visible: drawn
 * into `above` with its own warm glow, so it is the one thing in the cave the
 * veil never touches.
 */
export function ledgeSprite(PIXI, container, texture, { x, y, height }) {
  const group = new PIXI.Container();
  group.position.set(x, y);
  group.eventMode = 'none';

  const halo = new PIXI.Sprite(softGlow(PIXI));
  halo.anchor.set(0.5);
  halo.width = halo.height = height * 2;
  halo.tint = 0xffc46b;
  halo.alpha = 0.55;
  halo.blendMode = 'add';
  group.addChild(halo);

  if (texture) {
    const sprite = new PIXI.Sprite(texture);
    sprite.anchor.set(0.5);
    const k = height / (texture.height || height);
    sprite.scale.set(k);
    group.addChild(sprite);
  }
  container.addChild(group);

  const done = reducedMotion()
    ? Promise.resolve()
    : trackTween(group, popIn(group, 380));
  return { group, done };
}

export { OBJECT_TINT };
