// actor.js — DOM renderer for `qlobe-pose-actor` packs.
//
// The shared renderer (shared/js/stage/pose-sprite.js) draws into a PixiJS
// scene. This game's play-field is DOM (it has to be — the backdrop is a real
// <video> element), so this is the same contract rendered as an <img> with the
// same "paper-pop" swap: the next pose fades up at 0.92 scale, overshoots to
// 1.04, settles at 1. Pack format, pose names and anchor semantics are
// identical, so the packs stay studio- and library-compatible.
//
// Everything degrades: a missing pack, a missing pose, or a broken image leaves
// the actor invisible and the game entirely playable.

const POP_MS = 220;

// Warm-up order: the poses that carry the most lines first.
const PRELOAD_ORDER = ['neutral', 'interact', 'notice', 'celebrate', 'react', 'enter'];
const order = (name) => {
  const i = PRELOAD_ORDER.indexOf(name);
  return i === -1 ? PRELOAD_ORDER.length : i;
};

const reducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Actor {
  /**
   * @param {HTMLElement} host the `.ctc-actors` layer
   * @param {{pack:string, side:'left'|'right'}} def
   */
  constructor(host, def) {
    this.def = def;
    this.manifest = null;
    this.pose = null;
    this.visible = false;

    this.el = document.createElement('div');
    this.el.className = `ctc-actor ctc-actor-${def.side}`;
    this.el.setAttribute('aria-hidden', 'true');
    // Per-actor size multiplier from config — the cast is not one scale. The CSS
    // owns the responsive base width; this only says how big THIS character is
    // relative to it.
    if (def.scale) this.el.style.setProperty('--actor-scale', String(def.scale));
    this.img = document.createElement('img');
    this.img.alt = '';
    this.img.draggable = false;
    this.img.addEventListener('error', () => { this.el.classList.add('is-broken'); });
    this.el.appendChild(this.img);
    host.appendChild(this.el);
  }

  /** Load the pack. Never rejects — a 404 just means this actor stays hidden. */
  async load() {
    try {
      const url = new URL(this.def.pack, document.baseURI);
      const res = await fetch(url);
      if (!res.ok) return false;
      const doc = await res.json();
      if (doc.format !== 'qlobe-pose-actor' || !doc.poses || !doc.poses.neutral) return false;
      this.manifest = doc;
      this.base = new URL('./', url);
      this.ready = true;
      // Hold the neutral pose from the moment the pack loads, so the element is
      // never a src-less <img> of zero height. Without this an actor made visible
      // by anything other than show() renders as nothing at all.
      this.setPose('neutral');
      return true;
    } catch {
      return false;
    }
  }

  poseUrl(name) {
    if (!this.manifest) return null;
    const def = this.manifest.poses[name] || this.manifest.poses.neutral;
    return def ? new URL(def.art, this.base).href : null;
  }

  /**
   * Warm the pose images so a swap mid-beat never shows a gap — but do it in
   * IDLE time, one pose at a time. The full cast is ~900 KB; fetching it all up
   * front would compete with the splash and the first backdrop clip for
   * bandwidth on a tablet, to spare a flicker the child may never see.
   * `neutral` and `interact` go first because they carry most lines.
   */
  preload() {
    if (!this.manifest) return;
    const names = Object.keys(this.manifest.poses)
      .sort((a, b) => order(a) - order(b));
    const idle = window.requestIdleCallback
      || ((fn) => setTimeout(fn, 400));
    const next = (i) => {
      if (i >= names.length) return;
      idle(() => {
        const img = new Image();
        img.onload = img.onerror = () => next(i + 1);
        img.src = this.poseUrl(names[i]);
      });
    };
    next(0);
  }

  setPose(name) {
    const url = this.poseUrl(name);
    if (!url || this.pose === name) return;
    this.pose = name;
    this.img.src = url;
    if (reducedMotion()) return;
    this.img.classList.remove('pop');
    // reflow so the animation restarts even on a rapid second swap
    void this.img.offsetWidth;
    this.img.classList.add('pop');
    clearTimeout(this._popTimer);
    this._popTimer = setTimeout(() => this.img.classList.remove('pop'), POP_MS + 60);
  }

  /** Slide in from the actor's own edge and hold the given pose. */
  show(pose = 'neutral') {
    if (!this.ready) return;
    this.setPose(pose);
    this.visible = true;
    this.el.classList.add('is-in');
  }

  /** Slide back off the edge. */
  hide() {
    this.visible = false;
    this.el.classList.remove('is-in');
  }

  destroy() {
    clearTimeout(this._popTimer);
    this.el.remove();
  }
}

/**
 * Build the configured actors. Returns a map of role → Actor for the roles whose
 * pack actually loaded; roles with no pack are simply absent, and callers use
 * optional chaining so the game never depends on one existing.
 */
export async function loadActors(host, defs) {
  const entries = await Promise.all(
    Object.entries(defs || {}).map(async ([role, def]) => {
      const actor = new Actor(host, def);
      const ok = await actor.load();
      if (!ok) { actor.destroy(); return null; }
      actor.preload();
      return [role, actor];
    })
  );
  return Object.fromEntries(entries.filter(Boolean));
}
