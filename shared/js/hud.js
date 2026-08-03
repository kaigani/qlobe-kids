// hud.js — the shared HUD controls, in code.
//
// Pairs with shared/css/hud.css, which owns every pixel of the look; this file
// owns the element shape, the labels, and the press path. Link the stylesheet:
//
//     <link rel="stylesheet" href="../../shared/css/hud.css" />
//
// Deliberately NOT imported here: audio-unlock. Unlocking audio is the job of
// the one global first-gesture listener (shared/js/audio-unlock.js), installed
// once per game. A HUD button that unlocked on its own would mean every other
// control in the game still needed the global listener anyway — and a button
// that unlocks is a button whose first press behaves differently from its
// second, which is exactly the class of bug the global listener exists to kill.

import { onTap } from './tap.js';
import * as sfx from './sfx.js';

/**
 * Accessible names for the iconographic buttons. Children never read these —
 * they exist for screen readers and for the QA driver's `getByRole` lookups.
 */
const KIND_LABEL = {
  home: 'Home',
  back: 'Back',
  sound: 'Hear it again',
};

/**
 * A round HUD button, wired through tap.js with an sfx tick on press.
 *
 * Placement is the caller's: add one of hud.css's corner classes
 * (`qk-hud-top-left` … `qk-hud-bottom-right`) or drop it into a `.qk-hud-bar`.
 * Navigation rule (docs/interaction-patterns.md §8): `home` appears ONLY on the
 * splash and goes to the catalog; play and end screens use `back`.
 *
 * @param {'home'|'back'|'sound'} kind
 * @param {(e: Event) => void} onPress  runs once per press, on pointerup
 * @param {{label?: string}} [opts]  overrides the accessible name
 * @returns {HTMLButtonElement} the button, with a non-enumerable `dispose()`
 *   that removes the tap listeners (call it if the control outlives its screen)
 */
export function hudButton(kind, onPress, { label } = {}) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `qk-hud-btn qk-hud-${kind}`;
  btn.dataset.hud = kind;
  btn.setAttribute('aria-label', label || KIND_LABEL[kind] || kind);

  const dispose = onTap(btn, (e) => {
    // A corner tap must not also register as a tap on the playfield beneath.
    e.stopPropagation();
    if (onPress) onPress(e);
  }, {
    feedback: (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { sfx.tick(); } catch { /* audio is never load-bearing */ }
    },
  });

  Object.defineProperty(btn, 'dispose', { value: dispose });
  return btn;
}

/**
 * The replay-button guard every game copies: swallow presses that land within
 * `ms` of the last accepted one, so a child drumming on the sound button gets
 * the prompt once instead of eight overlapping copies of it.
 *
 * Leading-edge: the first press always goes through immediately.
 *
 * @param {(...args: any[]) => any} fn
 * @param {number} [ms=600]
 * @returns {(...args: any[]) => any} the guarded fn, with `.reset()`
 */
export function soundDebounce(fn, ms = 600) {
  let last = 0;
  const guarded = (...args) => {
    const now = performance.now();
    if (now - last < ms) return undefined;
    last = now;
    return fn(...args);
  };
  guarded.reset = () => { last = 0; };
  return guarded;
}

/**
 * A row of round progress pips: `done` filled, the one at index `done` marked
 * as current, the rest empty. Decorative — `aria-hidden`, because "3 of 5" is
 * not information a pre-reader consumes, and the narrator says it out loud.
 *
 * @param {number} total
 * @param {number} done  how many rounds/steps are finished
 * @returns {HTMLDivElement} `.qk-dots` containing `.qk-dot` spans, each of
 *   which may carry `.is-done` or `.is-now`
 */
export function progressDots(total, done) {
  const wrap = document.createElement('div');
  wrap.className = 'qk-dots';
  wrap.setAttribute('aria-hidden', 'true');
  const count = Math.max(0, Math.floor(total) || 0);
  const filled = Math.max(0, Math.floor(done) || 0);
  for (let i = 0; i < count; i += 1) {
    const dot = document.createElement('span');
    dot.className = 'qk-dot';
    if (i < filled) dot.classList.add('is-done');
    else if (i === filled) dot.classList.add('is-now');
    wrap.append(dot);
  }
  return wrap;
}
