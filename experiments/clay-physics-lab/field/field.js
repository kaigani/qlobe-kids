// field.js — the lab page wiring for the stored clay field.
//
// Interaction contract, per docs/interaction-patterns.md #9/#11: Pointer Events
// only, one primary pointer tracked by pointerId, listeners on window so a drag
// that leaves the canvas still tracks, pointercancel and window blur both end
// the gesture, touch-action: none on the canvas.
//
// Everything measurable this page reports is also on window.CLAY_FIELD_LAB, so
// a headless driver can read the same numbers a human reads off the panel.

import * as THREE from 'three';
import { createClayField, PULL_STEP_CAP } from './field-core.js';
import { createFieldRenderer } from './field-three.js';

const canvas = document.querySelector('#field-canvas');
const sceneHost = document.querySelector('#field-scene');
const shadow = document.querySelector('#field-shadow');
const fpsEl = document.querySelector('#field-fps');
const probeEl = document.querySelector('#field-probe');
const volumeEl = document.querySelector('#field-volume');
const costOpEl = document.querySelector('#cost-op');
const costUploadEl = document.querySelector('#cost-upload');
const costMarchEl = document.querySelector('#cost-march');
const costMemoryEl = document.querySelector('#cost-memory');
const brushInput = document.querySelector('#field-brush');
const brushOut = document.querySelector('#field-brush-out');
const trayButtons = [...document.querySelectorAll('.tray-ball')];

const STAMP_RADIUS = 0.26;
const BRUSH_MIN = 0.10;
const BRUSH_MAX = 0.38;

// `?res=64` / `?res=96` rebuilds the whole study at another grid resolution —
// the reproducible form of the memory/quality/bandwidth table in the
// recommendation's §12.5. Anything not a multiple of the 8-voxel brick is
// rejected rather than quietly rounded, because a partial brick would make the
// upload region arithmetic subtly wrong in a way no screenshot would show.
const requestedRes = Number(new URLSearchParams(location.search).get('res'));
const res = Number.isFinite(requestedRes) && requestedRes >= 32 && requestedRes % 8 === 0
  ? requestedRes
  : undefined;

const field = createClayField({ seed: 20260803, res });
const renderer = createFieldRenderer({
  THREE,
  canvas,
  field,
  shadowEl: shadow,
  pixelRatio: 1.5,
  dragPixelRatio: 1.0,
});

let trayColor = '#3fbf6f';
let brush = 0.22;
let activePointer = null;
let grab = null;           // world point currently held, in FIELD space
let dragOpMs = [];
let lastOpLabel = '—';
let settleRaf = null;

// ---------------------------------------------------------------------------
// Readout
// ---------------------------------------------------------------------------

const fmt = (n, d = 2) => Number(n).toFixed(d);

function refreshReadout() {
  const s = field.stats();
  const r = renderer.stats();
  volumeEl.textContent = `volume ${fmt(field.volume(), 4)}`;
  costOpEl.textContent = lastOpLabel;
  costUploadEl.textContent = r.lastUploadBricks
    ? `${r.lastUploadBricks} brick${r.lastUploadBricks === 1 ? '' : 's'} · ${(r.lastUploadBytes / 1024).toFixed(1)} KB · ${fmt(r.lastUploadMs)} ms`
    : '—';
  costMemoryEl.textContent = `${(field.memory().total / 1e6).toFixed(2)} MB cpu · ${(r.textureBytes / 1e6).toFixed(2)} MB gpu`;
  fpsEl.textContent = `${r.bufferWidth}×${r.bufferHeight} buffer · ${s.ops} ops`;
}

/** The GPU cost probe, debounced so it never runs during a drag. */
let probeTimer = null;
function scheduleProbe(delay = 260) {
  if (probeTimer) clearTimeout(probeTimer);
  probeTimer = setTimeout(() => {
    probeTimer = null;
    const p = renderer.probe(9);
    probeEl.textContent = `probe ${fmt(p.medianMs)} ms @ DPR ${p.pixelRatio}`;
    costMarchEl.textContent = `${fmt(p.medianMs)} ms · ${p.steps} steps · ${p.bufferWidth}×${p.bufferHeight}`;
  }, delay);
}

function afterEdit(label) {
  lastOpLabel = label;
  renderer.requestRender();
  renderer.settle(1);
  refreshReadout();
  scheduleProbe();
}

// ---------------------------------------------------------------------------
// Picking
// ---------------------------------------------------------------------------

/**
 * Where the finger landed on the clay, or null for the table. The camera is
 * orthographic down -z, so the pick is a march straight back through the field
 * from in front of the domain.
 */
function pickAt(clientX, clientY) {
  const w = renderer.clientToWorld(clientX, clientY);
  const hit = field.raycast({ x: w.x, y: w.y, z: field.size }, { x: 0, y: 0, z: -1 });
  return hit.hit ? { x: hit.x, y: hit.y, z: hit.z } : null;
}

// ---------------------------------------------------------------------------
// Gestures
// ---------------------------------------------------------------------------

canvas.addEventListener('pointerdown', (event) => {
  if (activePointer !== null || event.isPrimary === false) return;
  activePointer = event.pointerId;
  canvas.setPointerCapture?.(activePointer);
  dragOpMs = [];

  const hit = pickAt(event.clientX, event.clientY);
  if (hit) {
    grab = hit;
    canvas.classList.add('is-dragging');
    renderer.setQuality('drag');
  } else {
    // Empty table: drop a ball. A tap on the clay is never a stamp — that would
    // make it impossible to start a pull without accidentally adding material.
    grab = null;
    const w = renderer.clientToWorld(event.clientX, event.clientY);
    const ms = field.stampBall({ x: w.x, y: w.y, z: 0 }, STAMP_RADIUS, trayColor);
    afterEdit(`stamp ${fmt(ms)} ms · ${field.stats().lastOpBricks} bricks`);
  }
});

window.addEventListener('pointermove', (event) => {
  if (event.pointerId !== activePointer || !grab) return;
  event.preventDefault();
  const w = renderer.clientToWorld(event.clientX, event.clientY);
  let dx = w.x - grab.x;
  let dy = w.y - grab.y;
  const distance = Math.hypot(dx, dy);
  if (distance < field.h * 0.25) return;

  // The field caps a single advection at a fraction of the brush radius (the
  // warp stops being invertible past that). A fast flick therefore becomes
  // several steps rather than one bad one — but never more than three per
  // pointermove, or a flung finger could spend the whole frame budget here.
  const cap = brush * PULL_STEP_CAP;
  const steps = Math.min(3, Math.max(1, Math.ceil(distance / cap)));
  const sx = dx / steps;
  const sy = dy / steps;
  let total = 0;
  for (let i = 0; i < steps; i++) {
    total += field.pull(grab, { x: sx, y: sy, z: 0 }, brush);
    grab = { x: grab.x + sx, y: grab.y + sy, z: grab.z };
  }
  dragOpMs.push(total);
  lastOpLabel = `pull ${fmt(total)} ms · ${field.stats().lastOpBricks} bricks`;
  renderer.requestRender();
  refreshReadout();
});

function endPointer(event) {
  if (event && event.type !== 'blur' && event.pointerId !== activePointer) return;
  if (activePointer === null) return;
  activePointer = null;
  grab = null;
  canvas.classList.remove('is-dragging');
  renderer.setQuality('full');
  if (dragOpMs.length) {
    const sorted = dragOpMs.slice().sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    lastOpLabel = `pull ×${dragOpMs.length} · med ${fmt(sorted[sorted.length >> 1])} ms · p95 ${fmt(p95)} ms`;
  }
  afterEdit(lastOpLabel);
}

window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);
window.addEventListener('blur', endPointer);

// ---------------------------------------------------------------------------
// Verbs
// ---------------------------------------------------------------------------

/**
 * Settle, animated.
 *
 * The rotation the child sees is a POSE on the renderer — sixty frames of
 * uniform writes and not one voxel resampled. field-core bakes the finished
 * transform exactly once at the end, so the whole animation costs a single
 * trilinear resample of the grid no matter how long it runs. That is the
 * difference between a settle that reads as clay and a settle that turns the
 * surface to pudding.
 */
function runSettle() {
  if (settleRaf) return;
  const plan = field.settlePlan();
  if (!plan) return;
  const started = performance.now();
  const duration = 420;
  const step = () => {
    const t = Math.min(1, (performance.now() - started) / duration);
    const eased = t * t * (3 - 2 * t);
    const q = slerpIdentity(plan.quat, eased);
    renderer.setPose(q, plan.pivot, [0, plan.drop * eased, 0]);
    if (t < 1) { settleRaf = requestAnimationFrame(step); return; }
    settleRaf = null;
    // Drop the display pose in the same task that bakes it, so the child never
    // sees a frame where the clay has snapped back to its unsettled attitude.
    renderer.setPose(null, null, null);
    field.settleRest({ rate: 1 });
    afterEdit(`settle ${fmt(field.stats().lastOpMs)} ms · 1 resample`);
  };
  settleRaf = requestAnimationFrame(step);
}

function slerpIdentity(q, t) {
  if (t >= 1) return q.slice();
  const w = Math.max(-1, Math.min(1, q[3]));
  const angle = 2 * Math.acos(w);
  if (angle < 1e-6) return [0, 0, 0, 1];
  const s = Math.sqrt(Math.max(1 - w * w, 1e-12));
  const half = (angle * t) / 2;
  const sh = Math.sin(half);
  return [(q[0] / s) * sh, (q[1] / s) * sh, (q[2] / s) * sh, Math.cos(half)];
}

function buildLoaf() {
  field.reset();
  const angle = (40 * Math.PI) / 180;
  const colors = ['#3fbf6f', '#3fbf6f', '#ff7314', '#ff7314', '#ff7314'];
  for (let i = 0; i < 5; i++) {
    const t = (i - 2) * 0.17;
    field.stampBall({ x: Math.cos(angle) * t, y: -0.05 + Math.sin(angle) * t, z: 0 }, 0.20, colors[i]);
  }
  renderer.setPose(null, null, null);
  afterEdit('tilted loaf built');
}

function buildTwoBalls() {
  field.reset();
  // Centres chosen so each ball's underside meets the table exactly: the ground
  // cut then gives the flat contact patch that reads as WEIGHT. Floating the
  // clay a voxel above its own shadow is the single fastest way to break the
  // illusion that it is sitting on something.
  field.stampBall({ x: -0.24, y: field.ground() + 0.28, z: 0 }, 0.28, '#3fbf6f');
  field.stampBall({ x: 0.24, y: field.ground() + 0.26, z: 0.03 }, 0.26, '#ff7314');
  renderer.setPose(null, null, null);
  afterEdit('two balls stamped');
}

document.querySelector('#field-settle').addEventListener('click', runSettle);
document.querySelector('#field-simplify').addEventListener('click', () => {
  const ms = field.simplify(0.32);
  afterEdit(`smooth ${fmt(ms)} ms · whole field`);
});
document.querySelector('#field-loaf').addEventListener('click', buildLoaf);
document.querySelector('#field-reset').addEventListener('click', buildTwoBalls);

trayButtons.forEach((button) => button.addEventListener('click', () => {
  trayColor = button.dataset.color;
  trayButtons.forEach((candidate) => {
    const activeButton = candidate === button;
    candidate.classList.toggle('is-active', activeButton);
    candidate.setAttribute('aria-pressed', String(activeButton));
  });
}));

brushInput.addEventListener('input', () => {
  const value = Number(brushInput.value) / 100;
  brush = BRUSH_MIN + value * (BRUSH_MAX - BRUSH_MIN);
  brushOut.value = value < 0.25 ? 'fingertip' : value < 0.55 ? 'medium' : value < 0.8 ? 'palm' : 'whole hand';
});
brushInput.dispatchEvent(new Event('input'));

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

function resize() {
  const rect = sceneHost.getBoundingClientRect();
  renderer.setViewport(rect.width, rect.height);
  refreshReadout();
}
new ResizeObserver(resize).observe(sceneHost);

buildTwoBalls();
resize();

// ---------------------------------------------------------------------------
// Debug surface
// ---------------------------------------------------------------------------

window.CLAY_FIELD_LAB = {
  field,
  renderer,
  stamp: (x, y, radius = STAMP_RADIUS, color = trayColor) => field.stampBall({ x, y, z: 0 }, radius, color),
  /** Pull in world coordinates, mirroring what a drag does. */
  pull: (x, y, dx, dy, steps = 6, radius = brush) => {
    const hit = field.raycast({ x, y, z: field.size }, { x: 0, y: 0, z: -1 });
    if (!hit.hit) return null;
    const point = { x: hit.x, y: hit.y, z: hit.z };
    const times = [];
    for (let i = 0; i < steps; i++) {
      times.push(field.pull(point, { x: dx / steps, y: dy / steps, z: 0 }, radius));
      point.x += dx / steps;
      point.y += dy / steps;
    }
    afterEdit(`pull ×${steps}`);
    return times;
  },
  settle: () => { const r = field.settleRest({ rate: 1 }); afterEdit('settle'); return r; },
  simplify: (s = 0.32) => { const ms = field.simplify(s); afterEdit('smooth'); return ms; },
  loaf: buildLoaf,
  twoBalls: buildTwoBalls,
  reset: () => { field.reset(); renderer.setPose(null, null, null); afterEdit('reset'); },
  probe: (frames = 12) => renderer.probe(frames),
  census: (colors = ['#3fbf6f', '#ff7314']) => field.colorCensus(colors),

  /**
   * THE Q2 MEASUREMENT. Stamps balls one at a time and probes the raymarch
   * after each. The incumbent's equivalent number climbs with lobe count (a
   * 16-lobe worst case measures 17.7 ms there); if this representation is what
   * it claims to be, this list is flat.
   */
  costCurve: (count = 16, radius = 0.16) => {
    field.reset();
    renderer.setPose(null, null, null);
    const out = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 * 1.7;
      const r = 0.16 + (i / count) * 0.34;
      field.stampBall(
        { x: Math.cos(a) * r, y: -0.24 + Math.sin(a) * r * 0.6, z: Math.sin(a * 1.7) * 0.12 },
        radius,
        ['#3fbf6f', '#ff7314', '#24cfb9', '#e8497a'][i % 4],
      );
      renderer.renderNow();
      const p = renderer.probe(9);
      out.push({ balls: i + 1, marchMs: +p.medianMs.toFixed(3), volume: +field.volume().toFixed(4) });
    }
    refreshReadout();
    return out;
  },

  /** A scripted 50-op session, for the drift and frame-cost claims. */
  session: (pulls = 50) => {
    buildTwoBalls();
    const baseline = field.volume();
    let seed = 7;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const times = [];
    for (let i = 0; i < pulls; i++) {
      const a = rnd() * Math.PI * 2;
      const x = Math.cos(a) * 0.24;
      const y = -0.28 + Math.sin(a) * 0.18;
      const hit = field.raycast({ x, y, z: field.size }, { x: 0, y: 0, z: -1 });
      if (!hit.hit) continue;
      times.push(field.pull({ x: hit.x, y: hit.y, z: hit.z }, { x: (rnd() - 0.5) * 0.09, y: (rnd() - 0.5) * 0.09, z: 0 }, 0.14 + rnd() * 0.16));
    }
    times.sort((a, b) => a - b);
    const final = field.volume();
    afterEdit('session');
    return {
      ops: times.length,
      baselineVolume: +baseline.toFixed(5),
      finalVolume: +final.toFixed(5),
      driftPercent: +(((final - baseline) / baseline) * 100).toFixed(3),
      medianMs: +times[times.length >> 1].toFixed(3),
      p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(3),
      maxMs: +times[times.length - 1].toFixed(3),
    };
  },

  state: () => ({
    ops: field.stats(),
    render: renderer.stats(),
    memory: field.memory(),
    volume: field.volume(),
    bounds: field.bounds(),
    brush,
    trayColor,
  }),
};
