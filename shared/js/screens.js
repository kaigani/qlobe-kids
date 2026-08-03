// screens.js — the splash → play → end state machine, once.
//
// Every engine and every bespoke game re-derives this: a set of named screens,
// exactly one of them visible, a "start a mode" entry point that must not run
// twice when a five-year-old double-taps a card, and a pile of per-screen
// teardown (tap disposers, idle nudgers, gesture controllers, timers) that has
// to run on the way out or the next screen inherits live listeners.
//
// The three failure modes this module exists to kill, all seen in the audit:
//
//   1. `showScreen(name)` written as a hard-coded list of toggles
//      (`a.classList.toggle('hidden', name !== 'a'); b.classList.toggle(...)`).
//      Adding a fourth screen means editing a line that has nothing to do with
//      it, and forgetting one leaves two screens stacked.
//   2. No `starting` latch. Two taps 80ms apart run the whole mode-start twice:
//      two teardowns, two renders, two voice lines over each other.
//   3. Teardown attached to the *caller* rather than the screen, so the one
//      exit path someone forgot leaks a gesture controller onto the next screen.
//
// Zero Pixi, zero network, zero game knowledge. Imports are limited to
// shared/js siblings (tap.js, sfx.js) so both bespoke DOM games and the Pixi
// engines can consume it.
//
// Pairs with shared/css/screens.css, which owns `[data-qk-screen][hidden]` and
// the optional `.qk-screen` / `.qk-end-*` vocabulary.

import { onTap } from './tap.js';
import * as sfx from './sfx.js';

/** Anything that reads as a "home" control, for the navigation-rule audit. */
const HOME_SELECTOR = '.qk-hud-home, [data-hud="home"], .hud-home';

/**
 * A disposer bag: collect teardown functions, run them all once, forget them.
 *
 * Exported on its own because per-*step* teardown (snack-chef's `clearStep`)
 * is the same shape as per-screen teardown and deserves the same primitive.
 *
 * `run()` never lets one throwing disposer strand the rest — a half-torn-down
 * screen is how a stuck piece ends up on a child's display.
 *
 * @returns {{ add: (...fns: Array<Function|null|undefined>) => Function|undefined,
 *             run: () => void, size: () => number }}
 */
export function createBag() {
  let fns = [];
  return {
    /** Register disposers. Returns the first one, so `bag.add(onTap(...))` chains. */
    add(...disposers) {
      for (const fn of disposers) {
        if (typeof fn === 'function') fns.push(fn);
      }
      return typeof disposers[0] === 'function' ? disposers[0] : undefined;
    },
    /** Run every registered disposer and empty the bag. Safe to call twice. */
    run() {
      const pending = fns;
      fns = [];
      for (const fn of pending) {
        try { fn(); } catch (err) { console.warn('[screens] disposer threw', err); }
      }
    },
    size() { return fns.length; },
  };
}

function resolve(target, root) {
  if (!target) return null;
  if (typeof target === 'string') {
    return (root || document).querySelector(target);
  }
  return target.nodeType === 1 ? target : null;
}

/**
 * Build the screen router.
 *
 * @param {object} spec
 * @param {Record<string, Element|string>} [spec.screens]
 *   name -> element (or a selector resolved inside `root`). If omitted, every
 *   `[data-qk-screen]` inside `root` is adopted, keyed by its attribute value.
 * @param {Element|string} [spec.root=document]  where selectors resolve
 * @param {string} [spec.initial]
 *   screen to show immediately. If omitted, the first screen that is not
 *   already `hidden` is adopted as current (and the rest are hidden), so a page
 *   that ships with its splash visible does not flash.
 * @param {{stop: () => void}} [spec.voice]
 *   stopped on every transition — the "don't let the last screen's line talk
 *   over the new one" rule. Skip it for a single transition with
 *   `show(name, { silent: true })`.
 * @param {(name: string, prev: string|null) => void} [spec.onEnter]
 *   after the new screen becomes visible. Register its teardown with `hold()`.
 * @param {(name: string, next: string) => void} [spec.onExit]
 *   before the old screen is hidden, and before its bag is run.
 * @param {string} [spec.splash='splash']  which screen may carry a home button
 * @param {boolean} [spec.navRule=true]
 *   audit docs/interaction-patterns.md §8 the first time each screen is shown:
 *   a home control anywhere but the splash is a `console.warn`, never a throw.
 * @returns {object} the controller (see the methods below)
 */
export function createScreens(spec = {}) {
  const root = resolve(spec.root, document) || document;
  const splashName = spec.splash || 'splash';
  const navRule = spec.navRule !== false;

  /** @type {Map<string, Element>} */
  const els = new Map();
  /** @type {Map<string, ReturnType<createBag>>} */
  const bags = new Map();
  const audited = new Set();

  const entries = spec.screens
    ? Object.entries(spec.screens)
    : [...(root === document ? document : root).querySelectorAll('[data-qk-screen]')]
      .map((node) => [node.dataset.qkScreen, node]);

  for (const [name, target] of entries) {
    const node = resolve(target, root);
    if (!node) {
      console.warn(`[screens] no element for screen "${name}"`);
      continue;
    }
    node.dataset.qkScreen = name;
    // A half-migrated page can carry BOTH mechanisms; the attribute is the one
    // this module owns, so drop the class rather than let them disagree.
    node.classList.remove('hidden');
    els.set(name, node);
    bags.set(name, createBag());
  }

  let current = null;
  let starting = false;
  let destroyed = false;

  function auditNav(name) {
    if (!navRule || audited.has(name) || name === splashName) return;
    audited.add(name);
    const node = els.get(name);
    if (node && node.querySelector(HOME_SELECTOR)) {
      console.warn(
        `[screens] screen "${name}" carries a home button. `
        + 'docs/interaction-patterns.md §8: home lives only on the splash; '
        + 'deeper screens use back, which returns to the splash in-page.',
      );
    }
  }

  // ---- initial state -------------------------------------------------------
  const initial = spec.initial
    || [...els.keys()].find((name) => !els.get(name).hasAttribute('hidden'))
    || [...els.keys()][0]
    || null;

  for (const [name, node] of els) {
    if (name === initial) node.removeAttribute('hidden');
    else node.setAttribute('hidden', '');
  }
  if (initial) {
    current = initial;
    auditNav(initial);
    if (spec.onEnter) spec.onEnter(initial, null);
  }

  const api = {
    /** @returns {string|null} the visible screen's name */
    get current() { return current; },
    /** @returns {boolean} true while a `start()` runner is in flight */
    get starting() { return starting; },
    /** @returns {string[]} every managed screen name, in declaration order */
    get names() { return [...els.keys()]; },

    /** @param {string} name @returns {Element|null} */
    el(name) { return els.get(name) || null; },

    /** @param {string} name @returns {boolean} */
    is(name) { return current === name; },

    /**
     * Make `name` the one visible screen.
     *
     * IDEMPOTENT: `show(current)` is a no-op — it does not re-run onExit, does
     * not run the disposer bag, does not stop the voice. That is deliberate
     * (a stray re-show must not tear down live gesture handlers), and it is the
     * one trap for adopters: **restarting the same mode from the same screen
     * must tear its own state down explicitly**, because `show('play')` while
     * already on `play` will not do it for you.
     *
     * @param {string} name
     * @param {{silent?: boolean, force?: boolean}} [opts]
     *   `silent` skips `voice.stop()` for this transition (use it when the
     *   outgoing line is meant to keep playing into the new screen);
     *   `force` re-runs exit + enter even when `name` is already current.
     * @returns {Element|null} the now-visible screen element
     */
    show(name, opts = {}) {
      if (destroyed) return null;
      const node = els.get(name);
      if (!node) {
        console.warn(`[screens] unknown screen "${name}"`);
        return null;
      }
      if (current === name && !opts.force) return node;

      const prev = current;
      if (prev && prev !== name) {
        if (spec.onExit) spec.onExit(prev, name);
        bags.get(prev).run();
      } else if (prev === name) {
        // force: re-enter the same screen, so its teardown must run first
        if (spec.onExit) spec.onExit(prev, name);
        bags.get(prev).run();
      }

      if (!opts.silent && spec.voice && typeof spec.voice.stop === 'function') {
        try { spec.voice.stop(); } catch { /* audio is never load-bearing */ }
      }

      for (const [otherName, otherNode] of els) {
        if (otherName === name) otherNode.removeAttribute('hidden');
        else otherNode.setAttribute('hidden', '');
      }
      current = name;
      auditNav(name);
      if (spec.onEnter) spec.onEnter(name, prev);
      return node;
    },

    /**
     * Register teardown that runs when the current screen is left.
     * @param {...(Function|null|undefined)} disposers
     * @returns {Function|undefined} the first disposer, for chaining
     */
    hold(...disposers) {
      const bag = bags.get(current);
      if (!bag) return typeof disposers[0] === 'function' ? disposers[0] : undefined;
      return bag.add(...disposers);
    },

    /**
     * Run a screen's disposer bag NOW without leaving the screen — the escape
     * hatch for "restart this mode in place".
     * @param {string} [name=current]
     */
    release(name = current) {
      bags.get(name)?.run();
    },

    /** @param {string} [name=current] @returns {number} pending disposers */
    pending(name = current) { return bags.get(name)?.size() ?? 0; },

    /**
     * The re-entrancy latch. Wrap whatever "start a mode" means for this game:
     * a second call while the first is still awaiting resolves to `busy`
     * immediately instead of running the whole start again.
     *
     * The latch is released in a `finally`, so a runner that throws cannot lock
     * the child out of every mode for the rest of the session (the exact bug
     * counting-treasure-cups documents in its own copy of this).
     *
     * @template T
     * @param {() => T|Promise<T>} runner
     * @param {{busy?: any}} [opts]  what a swallowed call resolves to (default undefined)
     * @returns {Promise<T|any>}
     */
    async start(runner, opts = {}) {
      if (starting) return opts.busy;
      starting = true;
      try {
        return await runner();
      } finally {
        starting = false;
      }
    },

    /** Run every bag and stop managing the screens. Idempotent. */
    destroy() {
      if (destroyed) return;
      destroyed = true;
      for (const bag of bags.values()) bag.run();
      current = null;
    },
  };

  return api;
}

/**
 * Wire an end screen's controls, honouring the navigation rule.
 *
 * The end screen is where the rule gets broken, because "take me out of here"
 * feels like a home button. It is not: **back and "choose another" both return
 * to the splash in-page**, and home exists only on the splash. This helper is
 * thin on purpose — its job is that both exits share one destination, that the
 * listeners land on the leaving screen's disposer bag, and that a home control
 * smuggled in as a link gets caught.
 *
 * @param {object} opts
 * @param {ReturnType<createScreens>} opts.screens
 * @param {Element} [opts.back]    corner back → the splash
 * @param {Element} [opts.choose]  "pick another" → the splash
 * @param {Element} [opts.again]   "do that again" → `onAgain()`
 * @param {string} [opts.splash='splash']
 * @param {() => void} [opts.onSplash]
 *   replaces the default `screens.show(splash)` for BOTH back and choose — for
 *   a game whose splash entry does more (reset state, speak a line). It must
 *   still end up on the splash; nothing else is a legal destination.
 * @param {() => void} [opts.onAgain]
 * @param {(e: Event) => void} [opts.onPress]
 *   runs on every accepted press before its route (the `sfx.tick()` slot for a
 *   game that ticks on the action rather than on pointerdown)
 * @param {((e: PointerEvent) => void)|null} [opts.feedback]
 *   pointerdown feedback. Defaults to `preventDefault()` + `sfx.tick()`; pass
 *   an explicit `null` for none (the key's PRESENCE is what opts out).
 * @param {boolean} [opts.hold=true]
 *   register the disposer on the current screen's bag. Pass `false` when the
 *   end screen's controls are static markup wired once for the session rather
 *   than rebuilt on every visit.
 * @returns {() => void} disposer
 */
export function wireEndScreen(opts = {}) {
  const {
    screens, back, choose, again,
    splash = 'splash', onSplash, onAgain, onPress, hold = true,
  } = opts;
  if (!screens) throw new Error('wireEndScreen: `screens` is required');

  const feedback = Object.prototype.hasOwnProperty.call(opts, 'feedback')
    ? opts.feedback
    : (e) => {
      e.preventDefault?.();
      try { sfx.tick(); } catch { /* audio is never load-bearing */ }
    };

  const route = (fn) => (e) => {
    if (onPress) onPress(e);
    if (fn) fn();
  };
  const toSplash = route(onSplash || (() => screens.show(splash)));

  const disposers = [];
  if (back) disposers.push(onTap(back, toSplash, { feedback }));
  if (choose) disposers.push(onTap(choose, toSplash, { feedback }));
  if (again) disposers.push(onTap(again, route(onAgain), { feedback }));

  // The rule, checked rather than merely documented. A `back` that is an <a>
  // with an href is a home button wearing a back button's icon: it leaves the
  // page instead of returning to the splash, which is the one thing an end
  // screen may not do.
  for (const [role, node] of [['back', back], ['choose', choose]]) {
    if (!node) continue;
    if (node.tagName === 'A' && node.getAttribute('href')) {
      console.warn(
        `[screens] wireEndScreen "${role}" is a link to "${node.getAttribute('href')}". `
        + 'docs/interaction-patterns.md §8: from an end screen, back returns to '
        + 'the splash in-page — only the splash leaves for the catalog.',
      );
    }
    if (node.matches && node.matches(HOME_SELECTOR)) {
      console.warn(`[screens] wireEndScreen "${role}" is styled as a home button; end screens use back.`);
    }
  }

  const dispose = () => { for (const fn of disposers) fn(); disposers.length = 0; };
  if (hold) screens.hold(dispose);
  return dispose;
}
