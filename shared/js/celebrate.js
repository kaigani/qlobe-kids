// celebrate.js — the platform celebration burst, and its ambient loop.
//
// Nine games hand-rolled this: a handful of DOM spans, a CSS custom property
// per piece, one falling keyframe, a timer that sweeps up after itself. This is
// that, once, with the palette pinned to shared/js/stage/particles.js so a
// Pixi-backed game and a DOM-backed game celebrate in the same colours.
//
// The Pixi backend stays where it is — reach for stage/particles.js when you
// already have a stage; reach for this when you have a DOM screen.
//
// Motion is the whole effect, so under `prefers-reduced-motion: reduce` this
// is a no-op rather than a slower version of itself. `tada()` still plays the
// sound: a child who can't take the animation can still have the payoff.
//
// TWO SHAPES OF CELEBRATION
// -------------------------
// A burst is a BEAT: something just happened, the pieces fall once, the module
// sweeps up. That is what `burstConfetti()` has always been, and it is the
// right thing for a round win.
//
// `{ loop: true }` is the other shape: AMBIENCE on a destination screen, where
// the child has arrived somewhere good and stays as long as they like. Three
// games kept a local confetti layer for exactly this reason and said so in
// their comments — clay-creature-studio's Alive screen, playdough-letter-
// factory's, snack-chef's. An ambient layer is not a longer burst; it never
// ends, and the caller owns its lifetime through the returned dispose().
//
// The ambient knobs (`piece`, `easing`, `drift`, `rng`) exist because ambience
// is art direction in a way a win beat is not — a studio full of clay wants
// blob-shaped flecks drifting straight down in its own palette, and that is the
// whole reason those games did not adopt this module in the first place. Every
// one of them defaults to exactly what the burst has always rendered, so no
// existing caller sees any change at all.

import * as sfx from './sfx.js';

/**
 * The one platform celebration palette. Hex twins of the `0x…` values in
 * shared/js/stage/particles.js — keep the two in step.
 * @type {readonly string[]}
 */
export const QK_PALETTE = Object.freeze([
  '#e23d3d', // red
  '#f4c53d', // yellow
  '#58a945', // green
  '#2d7dd2', // blue
  '#8a5bc4', // purple
  '#f08a24', // orange
]);

const STYLE_ID = 'qk-celebrate-style';

const CSS = `
.qk-confetti-layer {
  position: absolute;
  z-index: 90;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
/* Every var() default below is the literal the rule used to carry, so a piece
   that sets none of them renders byte-identically to the pre-ambient burst. */
.qk-confetti {
  position: absolute;
  top: -28px;
  left: var(--x, 50%);
  width: var(--w, 13px);
  height: var(--h, 17px);
  border-radius: var(--radius, 4px);
  background: var(--tint, #f4c53d);
  opacity: .92;
  animation: qk-confetti-fall var(--dur, 2s) var(--ease, linear) var(--delay, 0s) forwards;
  animation-iteration-count: var(--iter, 1);
  will-change: transform, opacity;
}
.qk-confetti.is-round { border-radius: 50%; width: 14px; height: 14px; }
@keyframes qk-confetti-fall {
  to {
    transform: translate(var(--drift, 0px), var(--qk-fall, 100vh)) rotate(var(--spin, 540deg));
    opacity: var(--fade, .12);
  }
}
@media (prefers-reduced-motion: reduce) {
  .qk-confetti-layer { display: none; }
  .qk-confetti { animation: none; }
}
`;

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.append(style);
}

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

const NOOP = () => {};

/**
 * Rain confetti over `host` and clean up after itself.
 *
 * The pieces go into one throwaway layer so cancelling, or the burst simply
 * finishing, is a single `remove()` — no per-piece bookkeeping, and the host's
 * child count is exactly what it was before.
 *
 * @param {object} [opts]
 * @param {Element} [opts.host=document.body]
 * @param {number} [opts.count=30]
 * @param {readonly string[]} [opts.palette=QK_PALETTE]
 * @param {number} [opts.duration=2500] the whole life of a BURST in ms, cleanup
 *   included. Under `loop` it means something different — the nominal time ONE
 *   piece takes to fall, jittered ±15% — because ambience has no lifetime.
 * @param {boolean} [opts.loop=false] ambient mode: the pieces fall forever and
 *   nothing sweeps up until you call the returned dispose(). See the header.
 * @param {() => number} [opts.rng=Math.random] source of the per-piece jitter.
 *   Pass a seeded generator (shared/js/rng.js `mulberry32`) when the layout has
 *   to be reproducible for QA — an ambient layer is on screen long enough for a
 *   screenshot diff to care.
 * @param {number} [opts.drift=90] max horizontal wander, ± px. 0 falls straight.
 * @param {string} [opts.easing='linear'] CSS timing function for the fall.
 * @param {?{width?: string|number, height?: string|number, radius?: string}} [opts.piece=null]
 *   shape override. Given, every piece takes it and the mixed rectangle/circle
 *   alternation is off; omitted, you get the platform confetti exactly as before.
 * @returns {() => void} cancel / dispose — safe to call late, twice, or never
 */
export function burstConfetti({
  host = document.body,
  count = 30,
  palette = QK_PALETTE,
  duration = 2500,
  loop = false,
  rng = Math.random,
  drift = 90,
  easing = 'linear',
  piece = null,
} = {}) {
  if (!host || reducedMotion()) return NOOP;
  const colors = (palette && palette.length) ? palette : QK_PALETTE;
  const random = typeof rng === 'function' ? rng : Math.random;
  const driftPx = Number.isFinite(drift) ? Math.abs(drift) : 90;
  const size = (value) => (typeof value === 'number' ? `${value}px` : value);
  ensureStyle();

  // An absolutely-positioned layer needs a positioned ancestor. `body` is fine
  // as-is (its static children resolve against the viewport), but an arbitrary
  // static host would leak the layer to the page corner — so promote it, and
  // put it back exactly as we found it when the burst is done.
  let restore = null;
  if (host !== document.body && host !== document.documentElement) {
    const position = getComputedStyle(host).position;
    if (position === 'static') {
      const previous = host.style.position;
      host.style.position = 'relative';
      restore = () => { host.style.position = previous; };
    }
  }

  const layer = document.createElement('div');
  layer.className = 'qk-confetti-layer';
  host.append(layer);

  // How far a piece must travel to leave the layer. Measured, not guessed at
  // in vh: the host is often a card, not the viewport.
  const measure = () => {
    const fall = (layer.clientHeight || host.clientHeight || window.innerHeight || 800) + 80;
    layer.style.setProperty('--qk-fall', `${fall}px`);
  };
  measure();

  // A burst is over before a device can be rotated. An ambient layer is on
  // screen for minutes, and a stale fall distance after an orientation flip
  // either strands the pieces mid-screen or throws them past the bottom.
  let observer = null;
  if (loop && typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(measure);
    observer.observe(layer);
  }

  // A burst front-loads: every piece is launched inside the first quarter and
  // the population is deliberately spread over a wide range of speeds, so the
  // whole thing reads as one thrown handful. `duration` is the burst's LIFETIME,
  // and a piece has to be gone well inside it.
  //
  // Ambience has no lifetime, so `duration` means the nominal time one piece
  // takes to fall, and the population is staggered across a full fall so pieces
  // keep arriving forever. The jitter stays narrow (±15%) and centred: it is
  // there to stop 34 flecks descending in visible lockstep, not to make a third
  // of them race. Widening it here is what made the clay flecks fall a third
  // faster than the hand-rolled layer they replaced.
  const spread = loop ? duration : duration * 0.28;         // when the last piece starts
  const fastest = duration * (loop ? 0.85 : 0.55);          // shortest fall
  const range = duration * 0.30;                            // …plus up to this much more

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i += 1) {
    const bit = document.createElement('span');
    // A caller that named a shape gets that shape for every piece; the mixed
    // rectangle/circle alternation is the DEFAULT confetti, not a rule.
    bit.className = (!piece && i % 3 === 0) ? 'qk-confetti is-round' : 'qk-confetti';
    bit.style.setProperty('--x', `${4 + random() * 92}%`);
    bit.style.setProperty('--tint', colors[i % colors.length]);
    bit.style.setProperty('--delay', `${(random() * spread).toFixed(0)}ms`);
    bit.style.setProperty('--dur', `${(fastest + random() * range).toFixed(0)}ms`);
    bit.style.setProperty('--drift', `${Math.round(-driftPx + random() * driftPx * 2)}px`);
    bit.style.setProperty('--spin', `${Math.round(300 + random() * 520)}deg`);
    if (easing !== 'linear') bit.style.setProperty('--ease', easing);
    if (piece) {
      if (piece.width != null) bit.style.setProperty('--w', size(piece.width));
      if (piece.height != null) bit.style.setProperty('--h', size(piece.height));
      if (piece.radius != null) bit.style.setProperty('--radius', piece.radius);
    }
    if (loop) {
      bit.style.setProperty('--iter', 'infinite');
      // A burst can afford to leave its pieces at 12% — they are swept away a
      // frame later. A looping piece that fades to 12% and then snaps back to
      // the top at full opacity flickers on every single cycle, so it goes all
      // the way out.
      bit.style.setProperty('--fade', '0');
    }
    frag.append(bit);
  }
  layer.append(frag);

  // Ambience has no end of its own: the caller owns the lifetime, because only
  // the caller knows when the child has left the screen it belongs to.
  let timer = loop ? null : setTimeout(() => { timer = null; cancel(); }, duration + 240);

  function cancel() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (observer) { observer.disconnect(); observer = null; }
    layer.remove();
    if (restore) { restore(); restore = null; }
  }
  return cancel;
}

/**
 * The full payoff: the celebration sound plus a burst.
 *
 * @param {{confetti?: boolean} & Parameters<typeof burstConfetti>[0]} [opts]
 *   everything but `confetti` goes straight to burstConfetti().
 * @returns {() => void} cancel for the burst (a no-op when `confetti` is false)
 */
export function tada({ confetti = true, ...burstOpts } = {}) {
  try { sfx.tada(); } catch { /* audio is never load-bearing */ }
  return confetti ? burstConfetti(burstOpts) : NOOP;
}
