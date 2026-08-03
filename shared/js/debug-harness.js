// debug-harness.js — window.QLOBE_DEBUG v1, once, instead of 21 copies.
//
// Every game installs the same review hook (see shared/js/engines/README.md).
// Written by hand 21 times it drifts: one game's `mute()` forgets the stray
// <audio> elements, another's `seed()` reseeds a shuffle that has already been
// drawn, a third returns targets for controls that are display:none. The parts
// that are the same everywhere live here; the parts that are the game live in
// the spec the game passes in.
//
// Only two imports, both leaf modules: rng.js (the seed swap-in) and timers.js
// (what fastTimers scales).

import { mulberry32 } from './rng.js';
import { createTimers } from './timers.js';

/**
 * Read the tappable targets out of the DOM.
 *
 * Zero-size rects are dropped: a hidden control is not a target, and a reviewer
 * that tries to tap one gets a mystery instead of a failure. The result is
 * plain JSON — it crosses a Playwright/CDP boundary, so no elements, no
 * DOMRects, no getters.
 *
 * @param {Document|Element} [root]  defaults to `document`
 * @param {string} [selector]  defaults to `[data-target]`
 * @returns {Array<{id: string, role: string, rect: {x: number, y: number, w: number, h: number}}>}
 */
export function collectTargets(root = document, selector = '[data-target]') {
  const scope = root && typeof root.querySelectorAll === 'function' ? root : document;
  const targets = [];
  for (const node of scope.querySelectorAll(selector)) {
    const rect = node.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) continue;
    targets.push({
      id: String(node.dataset.target || node.id || ''),
      role: String(node.dataset.role || 'neutral'),
      rect: { x: round(rect.x), y: round(rect.y), w: round(rect.width), h: round(rect.height) },
    });
  }
  return targets;
}

/**
 * Install `window.QLOBE_DEBUG`.
 *
 * Caller-supplied keys always win over the defaults, and any key the contract
 * does not name is spread through untouched — that is how a game adds
 * `getLayout()`, `getAudioLog()`, `nextCase()` and friends without bumping
 * `version`.
 *
 * @param {object} spec
 *
 * The v1 contract keys (passed through as given; the four marked "default"
 * are filled in when omitted):
 * @param {string} spec.gameId
 * @param {string} [spec.engine]
 * @param {number} [spec.version]      defaults to 1 — do not bump it, add keys
 * @param {Promise<*>} spec.ready
 * @param {() => Array} spec.listModes
 * @param {(id: string) => Promise<*>} spec.startMode
 * @param {() => object} spec.getState
 * @param {() => Array} [spec.getTargets]   default: collectTargets(root, targetSelector)
 * @param {(id: string) => Promise<*>} [spec.tap]
 * @param {() => Promise<*>} [spec.winRound]
 * @param {(on?: boolean) => *} [spec.mute]  default: fan out + silence strays
 * @param {(n: number) => *} [spec.seed]     default: mulberry32 swap-in
 * @param {(scale?: number) => *} [spec.fastTimers]  default: timers.setScale
 * @param {() => *} [spec.home]
 *
 * RESERVED DEPENDENCY KEYS — consumed to build the defaults above, and NOT
 * published on the hook. Do not use these names for game-specific extras:
 * @param {object|object[]} [spec.timers]  createTimers() group(s) fastTimers scales
 * @param {object} [spec.narrator]  anything with setMuted/mute and/or stop
 * @param {object} [spec.sfx]       ditto
 * @param {object} [spec.voice]     ditto (voice-clips module or a game's channel)
 * @param {(rng: () => number, seed: number) => void} [spec.onSeed]  where the
 *   seeded generator goes; without it the default `seed()` has nothing to swap
 * @param {Document|Element} [spec.root]  scope for the default getTargets
 * @param {string} [spec.targetSelector]  selector for the default getTargets
 *
 * @returns {() => void} dispose — restores whatever hook was there before
 */
export function installDebug(spec = {}) {
  const {
    version = 1,
    getTargets,
    mute,
    seed,
    fastTimers,
    // reserved deps — consumed here, never spread onto the hook
    timers,
    narrator,
    sfx,
    voice,
    onSeed,
    root = document,
    targetSelector = '[data-target]',
    ...rest
  } = spec || {};

  // A game that has not adopted timers.js yet still gets a real group to scale,
  // so fastTimers() is wired rather than stubbed. Hand in your own group as
  // soon as you have one — scaling only reaches what is scheduled on it.
  const supplied = [].concat(timers || []).filter((group) => group && typeof group.setScale === 'function');
  const ownTimers = supplied.length ? null : createTimers();
  const groups = supplied.length ? supplied : [ownTimers];

  const defaults = {
    getTargets: () => collectTargets(root, targetSelector),

    // Silence EVERYTHING audible, not just the game's own channel: a trailing
    // line from the gesture before is exactly what spoils a QA recording.
    mute: (on = true) => {
      const muted = Boolean(on);
      for (const channel of [narrator, voice, sfx]) {
        callAny(channel, ['setMuted', 'mute'], muted);
        if (muted) callAny(channel, ['stop']);
      }
      if (muted) {
        try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { /* not everywhere */ }
      }
      for (const node of document.querySelectorAll('audio, video')) node.muted = muted;
      return muted;
    },

    // The seeded generator is only useful if the game takes it, which is what
    // onSeed is for. Returns the seed actually applied.
    seed: (n) => {
      const value = Number.isFinite(Number(n)) ? Number(n) >>> 0 : 42;
      if (typeof onSeed === 'function') onSeed(mulberry32(value), value);
      return value;
    },

    // Accepts either dialect: 0.05 (the README's duration multiplier) or 20
    // (timers.js's speed factor). Both mean the same thing and both return the
    // clamped multiplier, so `fastTimers()` === `fastTimers(20)` === 0.05.
    fastTimers: (scale = 0.05) => {
      const n = Number(scale);
      const raw = Number.isFinite(n) && n > 0 ? (n > 1 ? 1 / n : n) : 0.05;
      const multiplier = Math.min(1, Math.max(0.01, raw));
      for (const group of groups) group.setScale(1 / multiplier);
      return multiplier;
    },
  };

  // Everything the game passed that is not a reserved dep — gameId, engine,
  // ready, listModes, startMode, getState, tap, winRound, home, and any
  // game-specific extras — goes on the hook as written. `tap`/`winRound`/`home`
  // get no default on purpose: a stub that always answers "not accepted" reads
  // exactly like a real rejection, and their absence is how a reviewer
  // feature-detects what this game actually supports.
  const hook = { version };
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) hook[key] = value;
  }
  hook.getTargets = getTargets || defaults.getTargets;
  hook.mute = mute || defaults.mute;
  hook.seed = seed || defaults.seed;
  hook.fastTimers = fastTimers || defaults.fastTimers;

  const previous = window.QLOBE_DEBUG;
  window.QLOBE_DEBUG = hook;

  return function dispose() {
    if (ownTimers) ownTimers.clearAll();
    // Another game may have installed over us (studio preview swapping games in
    // one page load) — in that case the hook we would restore is stale.
    if (window.QLOBE_DEBUG !== hook) return;
    if (previous) window.QLOBE_DEBUG = previous;
    else delete window.QLOBE_DEBUG;
  };
}

// ---- helpers ----------------------------------------------------------

/** Call the first method a channel actually has. Channels are duck-typed. */
function callAny(target, names, ...args) {
  if (!target) return;
  for (const name of names) {
    if (typeof target[name] === 'function') {
      try { target[name](...args); } catch { /* a mute must never throw */ }
      return;
    }
  }
}

/** Two decimals: enough to assert a layout, short enough to read in a log. */
function round(value) {
  return Math.round(value * 100) / 100;
}
