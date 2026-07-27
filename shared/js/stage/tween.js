// tween.js — tiny dependency-free tween/spring engine for Stage v2.
// Drives numeric properties on any object (Pixi display objects included).
// Runs on requestAnimationFrame; respects prefers-reduced-motion by resolving
// tweens instantly (positions land, no motion).

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export const ease = {
  linear: (t) => t,
  outQuad: (t) => t * (2 - t),
  outCubic: (t) => 1 + Math.pow(t - 1, 3),
  outBack: (t) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  outElastic: (t) => t === 0 || t === 1 ? t
    : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
};

// Same guard idiom as particles.js: a destroyed Pixi display object reports
// `.destroyed === true` and nulls its sub-objects (`scale`, `position`), so
// anything still animating it must quietly bow out instead of writing to null.
// Plain (non-Pixi) targets have no `.destroyed`, so they are never "gone".
const gone = (o) => !o || o.destroyed === true;

const live = new Set();
let raf = 0;
function pump(now) {
  // ONE pump drives every tween on the page, so a single throwing tween must
  // never stop it: drop that tween, settle its promise, keep the rest running.
  for (const tw of live) {
    try {
      tw._step(now);
    } catch (err) {
      live.delete(tw);
      try { tw._fail(err); } catch { /* nothing left to settle */ }
    }
  }
  raf = live.size ? requestAnimationFrame(pump) : 0;
}
function add(tw) { live.add(tw); if (!raf) raf = requestAnimationFrame(pump); }

/**
 * Tween `target`'s numeric props to `to` over `ms`.
 * Returns a promise; `.cancel()` on the returned promise stops it in place.
 * Nested paths supported one level (e.g. { scale: { x: 1.2, y: 1.2 } }).
 */
export function to(target, props, { ms = 300, easing = ease.outCubic, delay = 0 } = {}) {
  let cancelled = false;
  const p = new Promise((resolve) => {
    if (reduced) { apply(target, props, 1, snapshot(target, props)); resolve(); return; }
    const from = snapshot(target, props);
    const start = performance.now() + delay;
    const tw = {
      _step(now) {
        // A target destroyed mid-flight quietly finishes — the promise still
        // resolves, so whoever awaited this tween is never left hanging.
        if (cancelled || gone(target)) { live.delete(tw); resolve(); return; }
        if (now < start) return;
        const t = Math.min(1, (now - start) / ms);
        apply(target, props, easing(t), from);
        if (t >= 1) { live.delete(tw); resolve(); }
      },
      _fail(err) {
        console.warn('[tween] dropped a tween that threw mid-step', err);
        resolve();
      },
    };
    add(tw);
  });
  p.cancel = () => { cancelled = true; };
  return p;
}

function snapshot(target, props) {
  const from = {};
  if (gone(target)) return from;
  for (const k in props) {
    from[k] = typeof props[k] === 'object' ? snapshot(target[k], props[k]) : target[k];
  }
  return from;
}
function apply(target, props, t, from) {
  if (gone(target) || !from) return;
  for (const k in props) {
    if (typeof props[k] === 'object') apply(target[k], props[k], t, from[k]);
    else target[k] = from[k] + (props[k] - from[k]) * t;
  }
}

/** A pop-in: scale from 0 to 1 with a friendly overshoot. */
export function popIn(obj, ms = 320) {
  if (gone(obj)) return Promise.resolve();
  obj.scale.set(0.01);
  return to(obj, { scale: { x: 1, y: 1 } }, { ms, easing: ease.outBack });
}

/** Gentle wiggle (wrong-answer feedback) — returns when done. */
export async function wiggle(obj, amount = 0.08, ms = 90) {
  if (gone(obj)) return;
  const x0 = obj.rotation || 0;
  for (const r of [amount, -amount, amount * 0.6, -amount * 0.6, 0]) {
    if (gone(obj)) return;
    await to(obj, { rotation: x0 + r }, { ms, easing: ease.inOutSine });
  }
}

/** Endless idle sway; returns stop(). */
export function sway(obj, { amount = 0.02, ms = 2100 } = {}) {
  if (reduced) return () => {};
  let stopped = false;
  (async () => {
    // `gone` also breaks the loop: on a destroyed target every tween resolves
    // immediately, and without this the while would spin the event loop.
    while (!stopped && !gone(obj)) {
      await to(obj, { rotation: amount }, { ms, easing: ease.inOutSine });
      await to(obj, { rotation: -amount }, { ms, easing: ease.inOutSine });
    }
  })();
  return () => { stopped = true; if (!gone(obj)) obj.rotation = 0; };
}
