// actor.js — DOM renderer for `qlobe-pose-actor` packs.
//
// The shared renderer (shared/js/stage/pose-sprite.js) draws into a PixiJS
// scene. Ari has to render on the Pixi-free splash (game-design.md §3.0 — the
// splash must not force loadPixi()) and in HUD space above the play-field's
// spotlight/veil compositing, so this game uses the same DOM `<img>` renderer
// counting-treasure-cups built: the next pose fades up at 0.92 scale,
// overshoots to 1.04, settles at 1. Pack format, pose names and anchor
// semantics are identical, so the packs stay studio- and library-compatible.
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
   * @param {HTMLElement} host the actor layer
   * @param {{pack:string, side:'left'|'right'}} def
   */
  constructor(host, def) {
    this.def = def;
    this.manifest = null;
    this.pose = null;
    this.visible = false;
    /** pose name → the detached Image that owns its one network request */
    this._warm = new Map();

    this.el = document.createElement('div');
    this.el.className = `fc-actor fc-actor-${def.side}`;
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
   * IDLE time, one pose at a time. The full pack is ~500 KB; fetching it all up
   * front would compete with the splash and the first play plate for
   * bandwidth on a tablet, to spare a flicker the child may never see.
   * `neutral` and `interact` go first because they carry most lines.
   */
  preload() {
    if (!this.manifest) return;
    const names = Object.keys(this.manifest.poses).sort((a, b) => order(a) - order(b));
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    const next = (i) => {
      if (i >= names.length) return;
      idle(() => {
        const img = this.warm(names[i]);           // already in flight? no-op
        if (!img || img.complete) { next(i + 1); return; }
        img.addEventListener('load', () => next(i + 1), { once: true });
        img.addEventListener('error', () => next(i + 1), { once: true });
      });
    };
    next(0);
  }

  /**
   * Warm a pose in a cached detached Image, never in the visible one.
   *
   * Assigning a new `src` to the live `<img>` while its previous request is
   * still in flight ABORTS that request — a real `net::ERR_ABORTED` in the
   * network log and a console error, which is exactly what happens the first
   * time a nudge, a prompt and a cheer arrive inside one second. Every pose is
   * therefore fetched exactly once, through an Image this map keeps alive, and
   * the live element only ever gets a URL the browser already has.
   */
  warm(name) {
    const url = this.poseUrl(name);
    if (!url) return null;
    let img = this._warm.get(name);
    if (!img) {
      img = new Image();
      img.decoding = 'async';
      this._warm.set(name, img);
      img.src = url;
    }
    return img;
  }

  setPose(name) {
    const url = this.poseUrl(name);
    if (!url || this.pose === name) return;
    this.pose = name;
    const show = () => {
      if (this.pose !== name) return;      // a newer pose already won the swap
      this.img.src = url;
      if (reducedMotion()) return;
      this.img.classList.remove('pop');
      // reflow so the animation restarts even on a rapid second swap
      void this.img.offsetWidth;
      this.img.classList.add('pop');
      clearTimeout(this._popTimer);
      this._popTimer = setTimeout(() => this.img.classList.remove('pop'), POP_MS + 60);
    };
    const w = this.warm(name);
    if (!w || w.complete) show();
    else { w.addEventListener('load', show, { once: true }); w.addEventListener('error', show, { once: true }); }
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
    this._warm.clear();
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
