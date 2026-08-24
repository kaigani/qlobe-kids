// critters.js — the play field: cover-fit scene layout, critter and target
// sprites authored in scene-percent coordinates, grab/drop hit testing, and
// the landing / float-back animations.
//
// The scene is a 1600x1200 plate cover-fitted to the viewport. Everything in
// it is positioned with percent left/top and percent width, so a resize only
// has to re-size the scene box — the sprites ride along for free. Interactive
// anchors are authored inside the central safe region (game-design.md) so
// both landscape and portrait crops keep them visible.
//
// A carried critter is re-parented into #fly-layer (client coordinates) so
// tweezers.js can position it per-frame; landing / returning re-parents it
// back into the scene at its new percent anchor.

const GRAB_RADIUS = 96;      // css px — generous pincer forgiveness (≥96)
const LAND_MS = 460;
const RETURN_MS = 560;

// Celebration tableau discipline (production visual QC, 2026-08-23): every
// homed critter settles a little smaller than its carry size — a calmer,
// "tucked in" resting scale that also buys clearance under the banner and
// above the badge/NEXT. Shared-target occupants (capacity > 1: two ladybugs
// per flower, two fish per pool, two pom-poms per nest) additionally fan out
// to opposed left/right slots with a few degrees of opposed tilt, nestled
// like they landed on different petals — never stacked on the same spot.
const HOMED_SCALE = 0.78;
const MULTI_SPREAD_UNIT = 0.68;  // fraction of target width per centered slot unit
const MULTI_TILT_DEG = 16;       // degrees per centered slot unit

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function ease(p) { return p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2; }
function easeOut(p) { return 1 - (1 - p) ** 3; }

/**
 * @param {object} opts
 * @param {Element} opts.sceneEl
 * @param {HTMLImageElement} opts.backdropEl
 * @param {Element} opts.propsEl
 * @param {Element} opts.targetsEl
 * @param {Element} opts.crittersEl
 * @param {Element} opts.flyLayer
 * @param {Element} opts.fxLayer
 * @param {number} opts.sceneW
 * @param {number} opts.sceneH
 * @param {() => boolean} opts.reducedMotion
 */
export function createScene({
  sceneEl, backdropEl, propsEl, targetsEl, crittersEl, flyLayer, fxLayer,
  sceneW = 1600, sceneH = 1200, reducedMotion = () => false,
}) {
  let mode = null;
  let critters = [];   // { cfg, el, status, kind, target: null|targetState, slot }
  let targets = [];    // { cfg, el|null, filled: [] }
  let tableauPropEls = []; // props with cfg.tableau:true — see tableauRect()
  let scale = 1;
  let anims = new Set();
  let disposed = false;

  // ---- layout --------------------------------------------------------------

  function layout() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    scale = Math.max(vw / sceneW, vh / sceneH);
    const w = sceneW * scale;
    const h = sceneH * scale;
    sceneEl.style.width = `${w}px`;
    sceneEl.style.height = `${h}px`;
    sceneEl.style.left = `${(vw - w) / 2}px`;
    sceneEl.style.top = `${(vh - h) / 2}px`;
  }

  /** scene-percent → client px */
  function toClient(xPct, yPct) {
    const rect = sceneEl.getBoundingClientRect();
    return {
      x: rect.left + (xPct / 100) * rect.width,
      y: rect.top + (yPct / 100) * rect.height,
    };
  }

  /** css px for a width authored in scene (art) px */
  function px(sceneUnits) { return sceneUnits * scale; }

  // ---- building ------------------------------------------------------------

  function placeSprite(el, cfg) {
    el.style.left = `${cfg.x}%`;
    el.style.top = `${cfg.y}%`;
    if (cfg.w) el.style.width = `${(cfg.w / sceneW) * 100}%`;
  }

  function makeImg(src, className, cfg) {
    const el = document.createElement('img');
    el.src = src;
    el.alt = '';
    el.draggable = false;
    el.className = className;
    placeSprite(el, cfg);
    return el;
  }

  function clear() {
    for (const anim of anims) anim.cancel();
    anims.clear();
    propsEl.textContent = '';
    targetsEl.textContent = '';
    crittersEl.textContent = '';
    flyLayer.textContent = '';
    fxLayer.textContent = '';
    critters = [];
    targets = [];
    tableauPropEls = [];
    mode = null;
  }

  function loadMode(modeCfg) {
    clear();
    mode = modeCfg;
    backdropEl.src = modeCfg.backdrop;

    tableauPropEls = [];
    for (const prop of modeCfg.props || []) {
      const el = makeImg(prop.sprite, 'tw-prop', prop);
      propsEl.append(el);
      // `tableau: true` (e.g. the bees' honeycomb) marks a prop as part of
      // the finished-scene tableau for positionBadge()'s clearance math —
      // scattered decoration (ladybugs' loose leaves) stays excluded so it
      // can't drag the badge band down into empty grass.
      if (prop.tableau) tableauPropEls.push(el);
    }

    targets = (modeCfg.targets || []).map((cfg) => {
      let el = null;
      if (cfg.sprite) {
        el = makeImg(cfg.sprite, 'tw-target', cfg);
        targetsEl.append(el);
      }
      return { cfg, el, filled: [] };
    });

    critters = (modeCfg.critters || []).map((cfg) => {
      const el = makeImg(cfg.sprite, 'tw-critter', cfg);
      crittersEl.append(el);
      return { cfg, el, status: 'rest', kind: cfg.kind };
    });
    return critters.length;
  }

  // ---- queries -------------------------------------------------------------

  function centerOf(el) {
    const rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }

  function remaining() {
    return critters.filter((c) => c.status !== 'homed').length;
  }

  /** nearest resting critter within the grab radius, else null */
  function pickAt(x, y) {
    let best = null;
    let bestD = GRAB_RADIUS;
    for (const critter of critters) {
      if (critter.status !== 'rest') continue;
      const c = centerOf(critter.el);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= bestD) { bestD = d; best = critter; }
    }
    if (!best) return null;
    const c = centerOf(best.el);
    return { id: best.cfg.id, el: best.el, cx: c.x, cy: c.y, critter: best };
  }

  function targetRadius(target) {
    if (target.cfg.pad) return px(target.cfg.pad);
    return Math.max(80, px(target.cfg.w || 200) * 0.55);
  }

  /** evaluate a release point: correct | wrong-target | miss */
  function dropAt(handle, x, y) {
    let best = null;
    let bestD = Infinity;
    for (const target of targets) {
      const c = toClient(target.cfg.x, target.cfg.y);
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= targetRadius(target) && d < bestD) { bestD = d; best = target; }
    }
    if (!best) return { result: 'miss', target: null };
    const kindOk = (best.cfg.accepts || []).includes(handle.critter.kind);
    const hasRoom = best.filled.length < (best.cfg.capacity || 1);
    if (kindOk && hasRoom) return { result: 'correct', target: best };
    return { result: 'wrong-target', target: best };
  }

  /** the correct open target for a critter (for the ghost demo + debug) */
  function homeFor(critter) {
    return targets.find((t) => (t.cfg.accepts || []).includes(critter.kind)
      && t.filled.length < (t.cfg.capacity || 1)) || null;
  }

  // ---- carry ---------------------------------------------------------------

  function beginCarry(handle) {
    const critter = handle.critter;
    const c = centerOf(critter.el);
    const width = critter.el.getBoundingClientRect().width;
    critter.status = 'carried';
    critter.el.style.width = `${width}px`;
    critter.el.style.left = '0';
    critter.el.style.top = '0';
    critter.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%)`;
    flyLayer.append(critter.el);
    critter.el.classList.add('is-carried');
    // squash on the squeeze
    critter.el.classList.add('is-squished');
    setTimeout(() => critter.el.classList.remove('is-squished'), 220);
  }

  /** put the element back in the scene at a percent anchor */
  function settleInScene(critter, xPct, yPct, homed, restScale = 1, tiltDeg = 0) {
    critter.el.classList.remove('is-carried');
    critter.el.style.transform = (restScale !== 1 || tiltDeg !== 0)
      ? `translate(-50%, -50%) rotate(${tiltDeg}deg) scale(${restScale})`
      : '';
    critter.el.style.width = `${((critter.cfg.w || 160) / sceneW) * 100}%`;
    critter.el.style.left = `${xPct}%`;
    critter.el.style.top = `${yPct}%`;
    critter.el.classList.toggle('is-homed', !!homed);
    crittersEl.append(critter.el);
  }

  function runAnim(step, onDone) {
    let rafId = null;
    const anim = {
      cancel() {
        if (rafId != null) cancelAnimationFrame(rafId);
        anims.delete(anim);
      },
    };
    anims.add(anim);
    const tick = (now) => {
      const alive = step(now);
      if (alive && !disposed) rafId = requestAnimationFrame(tick);
      else { anims.delete(anim); onDone && onDone(); }
    };
    rafId = requestAnimationFrame(tick);
    return anim;
  }

  /**
   * Drop onto the correct target: short arc, landing bounce. Resolves when the
   * critter has settled at its slot. Reduced motion: cross-fade instead.
   */
  function land(handle, target, from) {
    const critter = handle.critter;
    critter.status = 'landing';
    target.filled.push(critter.cfg.id);
    critter.target = target;

    // landing slot in scene percent — shared-target occupants (capacity > 1)
    // fan out to centered, opposed slots (left-petal / right-petal, …)
    // instead of stacking on the anchor, and every homed critter rests a
    // little smaller so the target it's sitting on still reads.
    const capacity = target.cfg.capacity || 1;
    const isMulti = capacity > 1;
    const slotIndex = target.filled.length - 1;
    const side = isMulti ? slotIndex - (capacity - 1) / 2 : 0;
    const spreadBase = target.cfg.w || target.cfg.pad || 200;
    const dxPct = side * MULTI_SPREAD_UNIT * (spreadBase / sceneW) * 100;
    const tiltDeg = side * MULTI_TILT_DEG;
    const xPct = target.cfg.x + dxPct;
    const yPct = target.cfg.y + (target.cfg.sprite ? 1.5 : 0) + (isMulti ? 0.8 : 0);
    critter.slot = { x: xPct, y: yPct };

    return new Promise((resolve) => {
      const to = toClient(xPct, yPct);
      if (reducedMotion()) {
        critter.el.classList.add('is-fading');
        setTimeout(() => {
          settleInScene(critter, xPct, yPct, true, HOMED_SCALE, tiltDeg);
          critter.status = 'homed';
          requestAnimationFrame(() => critter.el.classList.remove('is-fading'));
          resolve();
        }, 260);
        return;
      }
      const t0 = performance.now();
      runAnim((now) => {
        const p = clamp((now - t0) / LAND_MS, 0, 1);
        const e = ease(p);
        const x = from.x + (to.x - from.x) * e;
        const y = from.y + (to.y - from.y) * e - Math.sin(p * Math.PI) * px(90);
        // settle bounce in the last fifth, easing into the resting scale/tilt
        const squash = p > 0.86 ? 1 - 0.14 * Math.sin(((p - 0.86) / 0.14) * Math.PI) : 1;
        const rest = 1 + (HOMED_SCALE - 1) * e;
        const rot = tiltDeg * e;
        critter.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%) rotate(${rot}deg) scale(${(2 - squash) * rest}, ${squash * rest})`;
        return p < 1;
      }, () => {
        settleInScene(critter, xPct, yPct, true, HOMED_SCALE, tiltDeg);
        critter.status = 'homed';
        critter.el.classList.add('is-landed');
        setTimeout(() => critter.el.classList.remove('is-landed'), 420);
        resolve();
      });
    });
  }

  /** Wrong spot: float gently back to the resting anchor. */
  function floatBack(handle, from) {
    const critter = handle.critter;
    critter.status = 'returning';
    const xPct = critter.cfg.x;
    const yPct = critter.cfg.y;
    return new Promise((resolve) => {
      const to = toClient(xPct, yPct);
      if (reducedMotion() || !from) {
        critter.el.classList.add('is-fading');
        setTimeout(() => {
          settleInScene(critter, xPct, yPct, false);
          critter.status = 'rest';
          requestAnimationFrame(() => critter.el.classList.remove('is-fading'));
          resolve();
        }, 260);
        return;
      }
      const t0 = performance.now();
      runAnim((now) => {
        const p = clamp((now - t0) / RETURN_MS, 0, 1);
        const e = easeOut(p);
        const x = from.x + (to.x - from.x) * e;
        const y = from.y + (to.y - from.y) * e + Math.sin(p * Math.PI) * px(40);
        critter.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
        return p < 1;
      }, () => {
        settleInScene(critter, xPct, yPct, false);
        critter.status = 'rest';
        resolve();
      });
    });
  }

  // ---- sparkle -------------------------------------------------------------

  function sparkleAt(x, y) {
    if (reducedMotion()) return;
    const burst = document.createElement('div');
    burst.className = 'tw-burst';
    burst.style.transform = `translate(${x}px, ${y}px)`;
    for (let i = 0; i < 10; i += 1) {
      const s = document.createElement('span');
      s.className = 'tw-spark';
      const ang = (i / 10) * Math.PI * 2 + Math.random() * 0.5;
      const dist = 40 + Math.random() * 55;
      s.style.setProperty('--tw-dx', `${Math.cos(ang) * dist}px`);
      s.style.setProperty('--tw-dy', `${Math.sin(ang) * dist - 20}px`);
      burst.append(s);
    }
    fxLayer.append(burst);
    requestAnimationFrame(() => burst.classList.add('is-live'));
    setTimeout(() => burst.remove(), 800);
  }

  // ---- debug truth ---------------------------------------------------------

  function crittersClient() {
    return critters.map((critter) => {
      const c = centerOf(critter.el);
      return {
        id: critter.cfg.id,
        kind: critter.kind,
        status: critter.status,
        x: Math.round(c.x),
        y: Math.round(c.y),
        r: GRAB_RADIUS,
      };
    });
  }

  function targetsClient() {
    return targets.map((target) => {
      const c = toClient(target.cfg.x, target.cfg.y);
      return {
        id: target.cfg.id,
        accepts: target.cfg.accepts || [],
        filled: target.filled.length,
        capacity: target.cfg.capacity || 1,
        x: Math.round(c.x),
        y: Math.round(c.y),
        r: Math.round(targetRadius(target)),
      };
    });
  }

  /**
   * Bounding box (client px) of the current targets + critters, i.e. the
   * celebration tableau. Used by main.js to keep the banner/badge/NEXT chrome
   * clear of it — the tableau sits near the top of the scene in some modes
   * (ladybugs, bees, pom-poms) and near the bottom in others (fish pools), so
   * the chrome can't assume a fixed band and has to measure the real thing.
   * Returns null before a mode has loaded.
   */
  function tableauRect() {
    const rects = [];
    for (const t of targets) if (t.el) rects.push(t.el.getBoundingClientRect());
    for (const c of critters) rects.push(c.el.getBoundingClientRect());
    for (const el of tableauPropEls) rects.push(el.getBoundingClientRect());
    if (!rects.length) return null;
    let top = Infinity; let bottom = -Infinity; let left = Infinity; let right = -Infinity;
    for (const r of rects) {
      if (r.top < top) top = r.top;
      if (r.bottom > bottom) bottom = r.bottom;
      if (r.left < left) left = r.left;
      if (r.right > right) right = r.right;
    }
    return { top, bottom, left, right };
  }

  function state() {
    return {
      mode: mode ? mode.id : null,
      remaining: remaining(),
      critters: critters.map((c) => ({ id: c.cfg.id, kind: c.kind, status: c.status })),
    };
  }

  function dispose() {
    disposed = true;
    clear();
  }

  return {
    layout,
    toClient,
    px,
    loadMode,
    clear,
    pickAt,
    dropAt,
    homeFor,
    beginCarry,
    land,
    floatBack,
    sparkleAt,
    remaining,
    crittersClient,
    targetsClient,
    tableauRect,
    state,
    dispose,
    get scale() { return scale; },
    get critters() { return critters; },
    get targets() { return targets; },
    get grabRadius() { return GRAB_RADIUS; },
  };
}
