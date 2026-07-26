// stage.js — the layered play-field: a looping video backdrop, the stage plate
// split into back and front halves, and a treasure layer sandwiched between them
// so treasure is visibly INSIDE the cup or chest.
//
// Layer order (bottom to top):
//   poster <img>  →  <video>  →  back plate  →  treasure layer  →  front plate
//
// Every layer is the same box with `object-fit: cover`, so the video and the
// plates stay registered no matter the viewport. Treasure is positioned in
// PLATE PIXEL coordinates (the 1024-wide art space) and mapped through the same
// cover transform by toScreen() — recomputed on every resize.
//
// Video handling follows games/red-green-light/js/game.js: one reused element
// blessed inside the first gesture, poster always beneath, a canplay/error race
// with a readyState timeout, reduced-motion → poster only, explicit teardown.

const VIDEO_READY_TIMEOUT = 2600;

const reducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Prime a media element inside a user gesture so later programmatic play() is
 * allowed by the autoplay policy.
 *
 * Blessing ENDS IN pause() — that is the whole trick. So never bless an element
 * that is already playing: the backdrop loop is muted and autoplays on its own,
 * and calling this on every gesture used to pause the video on every tap.
 */
export function blessMedia(el) {
  if (!el || (!el.paused && !el.ended)) return;
  const wasMuted = el.muted;
  try {
    el.muted = true;
    const p = el.play();
    if (p && p.then) {
      p.then(() => { el.pause(); el.muted = wasMuted; }).catch(() => { el.muted = wasMuted; });
    } else {
      el.pause();
      el.muted = wasMuted;
    }
  } catch {
    el.muted = wasMuted;
  }
}

export class Stage {
  /**
   * @param {HTMLElement} root the `.ctc-stage` element
   * @param {object} stages config.stages
   */
  constructor(root, stages) {
    this.root = root;
    this.stages = stages;
    this.def = null;
    this.box = { scale: 1, x: 0, y: 0, w: 0, h: 0 };

    root.innerHTML = `
      <img class="ctc-poster" alt="" draggable="false" />
      <video class="ctc-video" muted loop playsinline preload="auto" aria-hidden="true"></video>
      <img class="ctc-plate ctc-plate-back" alt="" draggable="false" />
      <div class="ctc-treasure" aria-hidden="true"></div>
      <img class="ctc-plate ctc-plate-front" alt="" draggable="false" />
    `;
    this.posterEl = root.querySelector('.ctc-poster');
    this.videoEl = root.querySelector('.ctc-video');
    this.backEl = root.querySelector('.ctc-plate-back');
    this.treasureEl = root.querySelector('.ctc-treasure');
    this.frontEl = root.querySelector('.ctc-plate-front');

    this.onResize = () => this.measure();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  /** Prime the video element from inside a gesture (see blessMedia). */
  unlock() { blessMedia(this.videoEl); }

  /**
   * Swap to a named stage. Resolves once the plates are decoded so the first
   * frame is never a flash of empty scene.
   */
  async show(name) {
    const def = this.stages[name];
    if (!def || this.name === name) { this.measure(); return; }
    this.name = name;
    this.def = def;

    this.posterEl.src = def.poster;
    this.backEl.src = def.back;
    this.frontEl.src = def.front;
    this.clear();
    this.measure();

    await Promise.all([decoded(this.backEl), decoded(this.frontEl)]);
    this.measure();
    this.startVideo(def.video);
  }

  startVideo(src) {
    const video = this.videoEl;
    if (!video) return;
    this.teardownVideo();
    if (reducedMotion() || !src) return;      // poster carries the scene
    let settled = false;
    const on = () => {
      if (settled) return;
      settled = true;
      video.classList.add('is-on');
      const p = video.play();
      if (p && p.catch) p.catch(() => video.classList.remove('is-on'));
    };
    const off = () => { settled = true; video.classList.remove('is-on'); };
    video.addEventListener('canplay', on, { once: true });
    video.addEventListener('error', off, { once: true });
    setTimeout(() => { if (!settled && video.readyState >= 3) on(); }, VIDEO_READY_TIMEOUT);
    video.src = src;
    video.load();
  }

  teardownVideo() {
    const video = this.videoEl;
    if (!video) return;
    video.classList.remove('is-on');
    try {
      video.pause();
      video.removeAttribute('src');
      video.load();
    } catch { /* ignore */ }
  }

  /**
   * Recompute the plate → screen transform, and lay the plate images out to
   * match. `object-fit` can't do this: the two stages want different fits, and
   * the treasure layer has to land on the same transform to the pixel.
   *
   *   fit: 'width'   the plate spans the full width and crops vertically. For
   *                  the ship, whose deck must reach both screen edges — the
   *                  planking that falls off the bottom carries no detail.
   *   fit: 'height'  the whole plate fits the play area, narrower than the
   *                  screen, with the video backdrop showing at the sides. For
   *                  the beach, where the sand is an island and the chest lid
   *                  must never be cropped.
   *
   * `anchorY` (plate space) is held at `anchorAt` of the play area, so the
   * container mouth keeps the same screen position on any viewport. The play
   * area excludes the tile tray, so treasure is never hidden behind it.
   */
  measure() {
    if (!this.def) return;
    const def = this.def;
    const [pw, ph] = def.plate;
    const w = this.root.clientWidth;
    const h = this.root.clientHeight;
    const top = this.topReserve();
    const availH = Math.max(160, h - top - this.bottomReserve());

    // fit 'width' means "at least the full width" — it must also cover the play
    // area vertically, or on a portrait tablet the plate's bottom edge shows and
    // the deck appears to float above open water.
    const scale = def.fit === 'height'
      ? (availH * (def.fitScale || 1)) / ph
      : Math.max(w / pw, availH / ph);

    const y = top + (def.anchorAt != null
      ? def.anchorAt * availH - def.anchorY * scale
      : availH - ph * scale);

    this.box = { scale, x: (w - pw * scale) / 2, y, w, h };

    for (const el of [this.backEl, this.frontEl]) {
      el.style.width = `${pw * scale}px`;
      el.style.height = `${ph * scale}px`;
      el.style.left = `${this.box.x}px`;
      el.style.top = `${y}px`;
    }
    this.applyAperture();
    this.publishFootLine();
    if (this.onMeasure) this.onMeasure();
  }

  /**
   * Publish where a character's feet belong, as a distance up from the bottom of
   * the screen, for the actor layer to read.
   *
   * The cast has to stand on the ground plane of the scene — the ship's deck
   * planking, the beach sand. Pinning them a fixed distance off the viewport
   * bottom (the first attempt) left them floating at the height of the railing,
   * because that distance has nothing to do with where the deck actually landed
   * after the fit. `footY` is in plate space, so it tracks the stage.
   */
  publishFootLine() {
    const host = this.root.parentElement;
    if (!host) return;
    if (this.def.footY == null) { host.style.removeProperty('--actor-foot'); return; }
    const y = this.toScreen(0, this.def.footY).y;
    // Never below the tile tray's top edge. On a portrait tablet the beach ground
    // plane maps almost to the bottom of the screen, which stood the cast on top
    // of the tiles. Clamp to the row's MEASURED height, not to bottomReserve() —
    // that carries a 170px layout fallback which would also lift the ship's
    // correctly-placed feet up off the deck.
    const floor = this.rowHeight();
    host.style.setProperty('--actor-foot', `${Math.round(Math.max(floor, this.box.h - y))}px`);
  }

  /**
   * Clip the treasure layer to the container's mouth, so a heap can rise but can
   * never spill sideways over the rim or out past the walls.
   *
   * The clip is the mouth aperture extended straight upward — treasure piles out
   * of the opening as it fills (which is what the concept art shows) while the
   * silhouette stays inside the container's own width. The front plate already
   * occludes everything below the near lip; this handles the other three sides.
   */
  applyAperture() {
    const ap = this.def.aperture;
    if (!ap) { this.treasureEl.style.clipPath = ''; return; }
    const pt = (px, py) => {
      const p = this.toScreen(px, py);
      return `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`;
    };
    let points;
    if (ap.kind === 'above') {
      // Only the near rim constrains the heap — the sides are deliberately open,
      // so a coin may hang over a side rail the way real treasure would. Clipping
      // the sides too put a hard straight cut through the outermost coins.
      const tl = this.toPlate(0, 0);
      const right = this.toPlate(this.box.w, 0).x + 400;
      const left = tl.x - 400;
      const top = tl.y - 60;
      points = [pt(left, ap.y), pt(right, ap.y), pt(right, top), pt(left, top)];
    } else if (ap.kind === 'ellipse') {
      // Lower arc of the mouth ellipse, left to right, then straight up. Sampled
      // rather than expressed as an SVG arc so there is no sweep-flag ambiguity.
      const steps = 24;
      const arc = [];
      for (let i = 0; i <= steps; i++) {
        const t = Math.PI - (Math.PI * i) / steps;     // pi..0 → left to right
        arc.push(pt(ap.cx - ap.rx * Math.cos(t), ap.cy + ap.ry * Math.sin(t)));
      }
      const top = this.toPlate(0, 0).y - 40;           // above the visible field
      points = [...arc, pt(ap.cx + ap.rx, top), pt(ap.cx - ap.rx, top)];
    } else {
      points = ap.points.map(([px, py]) => pt(px, py));
    }
    this.treasureEl.style.clipPath = `polygon(${points.join(', ')})`;
  }

  /** Height at the top owned by the prompt banner, so it never covers treasure. */
  topReserve() {
    const banner = this.root.parentElement?.querySelector('.ctc-banner');
    return (banner ? banner.offsetHeight : 0) + 20;
  }

  /** Measured height of the visible tile tray / choice-card row, or 0. */
  rowHeight() {
    const row = this.root.parentElement
      ?.querySelector('.ctc-tray:not(.hidden), .ctc-choices:not(.hidden)');
    return row ? row.offsetHeight : 0;
  }

  /** Height at the bottom of the screen owned by the tray / choice cards. */
  bottomReserve() {
    return Math.max(this.rowHeight(), Math.min(this.root.clientHeight * 0.22, 170));
  }

  /** Plate-space point → screen (CSS px, relative to the stage box). */
  toScreen(px, py) {
    const { scale, x, y } = this.box;
    return { x: x + px * scale, y: y + py * scale };
  }

  /** Length in plate space → screen CSS px. */
  toScreenLen(len) { return len * this.box.scale; }

  /** Screen point (relative to the stage box) → plate space. */
  toPlate(sx, sy) {
    const { scale, x, y } = this.box;
    return { x: (sx - x) / scale, y: (sy - y) / scale };
  }

  /** Remove every treasure sprite from the layer. */
  clear() { this.treasureEl.replaceChildren(); }

  /**
   * Place one treasure sprite at slot `index` of the current stage.
   * `jitter` keeps a heap from looking like a grid.
   */
  placeTreasure(src, index, { jitter = true, className = '' } = {}) {
    const def = this.def;
    const slots = def.slots;
    const slot = slots[Math.min(index, slots.length - 1)];
    // Past the authored slots, keep heaping upward rather than overlapping exactly.
    const overflow = Math.max(0, index - slots.length + 1);
    const jx = jitter ? (hash(index) - 0.5) * 22 : 0;
    const jy = jitter ? (hash(index + 97) - 0.5) * 12 : 0;

    const img = document.createElement('img');
    img.className = `ctc-treasure-item ${className}`.trim();
    img.src = src;
    img.alt = '';
    img.draggable = false;
    img.dataset.slot = String(index);
    // Slots fill front-to-back, so later pieces sit higher up the heap and must
    // paint BEHIND the ones already there — otherwise the pile reads inside-out
    // and the child cannot tell the pieces apart to count them.
    img.style.zIndex = String(100 - index);
    this.treasureEl.appendChild(img);
    this.positionTreasure(img, slot[0] + jx, slot[1] + jy - overflow * 26);
    return img;
  }

  positionTreasure(img, plateX, plateY) {
    img.dataset.px = String(plateX);
    img.dataset.py = String(plateY);
    this.layoutTreasure(img);
  }

  layoutTreasure(img) {
    const size = this.toScreenLen(this.def.itemScale * this.def.plate[0]);
    const p = this.toScreen(Number(img.dataset.px), Number(img.dataset.py));
    img.style.width = `${size}px`;
    img.style.left = `${p.x - size / 2}px`;
    img.style.top = `${p.y - size / 2}px`;
  }

  /** Re-lay every placed treasure (call after measure()). */
  relayout() {
    if (!this.def) return;
    for (const img of this.treasureEl.children) this.layoutTreasure(img);
  }

  /** Screen point of the container's mouth, for flight targets. */
  dropPoint() {
    const [dx, dy] = this.def.dropPoint;
    const r = this.root.getBoundingClientRect();
    const p = this.toScreen(dx, dy);
    return { x: r.left + p.x, y: r.top + p.y };
  }

  /** Displayed treasure size in screen px. */
  itemSize() { return this.toScreenLen(this.def.itemScale * this.def.plate[0]); }

  destroy() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.teardownVideo();
    this.root.replaceChildren();
  }
}

/** Deterministic 0..1 from an integer — stable jitter across re-layouts. */
function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Resolve when an <img> has pixels, or immediately on error — never hangs. */
function decoded(img) {
  if (img.complete && img.naturalWidth) return Promise.resolve();
  return new Promise((resolve) => {
    img.addEventListener('load', resolve, { once: true });
    img.addEventListener('error', resolve, { once: true });
    setTimeout(resolve, 3000);
  });
}
