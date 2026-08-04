// blob-field.js — wires the STORED CLAY FIELD (shared/js/clay/field.js +
// field-three.js) into the blob body only. Nothing here ever runs for the other
// five creatures: main.js only calls createBlobStage() when the child picked
// Blob, and that is the sole place three.js gets imported.
//
// It replaces blob-lobes.js, which stays on disk this round as the reference
// for the choreography being preserved. The gestures, the tray, the fall with
// weight, the squash landing, the four-ball unlock, the bin, the settle and the
// shelf all behave as they did. What changed is what the clay IS.
//
//
// THE ONE THING THAT CHANGED
//
// The old engine kept a LIST of lobes. Every ball a child welded into the body
// stayed in that list — addressable, draggable, and (as the product owner found
// in a playtest) levered back out again. The identity was not visible in the
// render; it was visible in the behaviour.
//
//   "The intention is that the green clay should now be a part of the whole and
//    behave accordingly, not have an atomic identity."
//
// So the lump is now ONE stored signed-distance-and-colour field. There is no
// list. There is no accessor anywhere in field.js by which this file could ask
// for the green ball back, because the field does not store balls — it stores
// clay. Everything that follows from that:
//
//   * WELDING IS STAMPING. A ball that lands on the creature, or is pushed into
//     it, writes itself into the field and ceases to exist as an object. That
//     is the same taught moment it always was ("the second blob places ON the
//     first blob"), implemented as the thing it always meant.
//   * PULLING IS ADVECTION. A drag moves the MATERIAL under the finger — the
//     distance and the colour together, with no special case for either — so
//     the clay flows instead of a primitive being re-parameterised. This is the
//     operation the July research said an analytic SDF could not do, and the
//     whole reason a stored field is a different animal.
//   * STIRRING MARBLES, AND CANNOT BE UNDONE. Colour is a property of the
//     material at a place, not a label on an object, so dragging across a
//     colour boundary drags the boundary. Running the exact drag backwards
//     makes it MORE mixed, not less (measured: 0.109 -> 0.258). The owner was
//     shown this and chose it. It is the feature.
//   * THERE ARE NO LOBES AND THEREFORE NO LOBE CAP. The renderer's cost does
//     not know how much clay is in front of it, so MAX_LOBES — which existed
//     because the old cost curve made it necessary — simply stopped existing.
//
//
// LOOSE CLAY IS STILL AN OBJECT, AND DELIBERATELY SO
//
// A ball being dragged out of the tray, falling, or resting on the table
// unwelded is NOT in the field. It is a parametric sphere, rendered as one
// analytic term unioned into the same raymarch, and it keeps every affordance
// it had: it moves under a finger and it goes in the bin. That is not a
// compromise with the representation, it is the product line the representation
// draws. Clay you have not joined to anything yet is a thing you are holding;
// clay you have joined is the creature. The moment it welds it stamps, and from
// then on it is material.
//
// The falling ball wears the EXACT noise phases it will inherit when it stamps
// (field.js's stampPhase), so it does not change shape at the instant it welds
// — the one frame in the whole toy a child is watching most closely.
//
//
// TWO COORDINATE SPACES
//
// BOARD (nx, ny in 0..1 of the stage box, y down; nr as a fraction of stage
// WIDTH) is what the tray, the decorations, the saves and every debug verb
// speak. WORLD is what the field and the renderer speak: isotropic, +y up,
// origin at the stage centre.
//
// The map between them carries ONE decision worth reading (see viewScaleFor):
// the renderer's view scale is 1/aspect on a landscape stage, so the whole
// visible stage lands inside the field's own 2.0-unit cube. Without it a ball
// dropped near the edge of a wide table would be placed at a world x the grid
// does not cover, and would come out quietly half-missing. The happy
// consequence is that world space is then ORIENTATION-INDEPENDENT and isotropic
// — one world unit is the same number of CSS pixels across and down, at any
// aspect — which is why this file has no equivalent of blob-lobes.js's
// reaspectLobe() and why a save carries raw world coordinates. A creature
// rotated from landscape to portrait keeps its shape exactly; only how much
// table you can see around it changes.

import {
  createClayField, createFieldFromDocument, parseColor, stampPhase,
  PULL_STEP_CAP, DOC_FORMAT, DOC_VERSION,
} from '../../../shared/js/clay/field.js';
import { createFieldRenderer, MAX_LOOSE } from '../../../shared/js/clay/field-three.js';
import { legacyToOps, isLegacyBlobDoc } from './blob-legacy.js';
import * as sfx from '../../../shared/js/sfx.js';

/**
 * World units per NDC unit. On a stage wider than it is tall this shrinks the
 * world so the whole stage fits the field's cube; on a portrait stage the
 * height already is the binding dimension and it is 1.
 */
export const viewScaleFor = (aspect) => 1 / Math.max(1, aspect || 1);

export const toWorld = (nx, ny, nr, aspect) => {
  const vs = viewScaleFor(aspect);
  return {
    x: (nx - 0.5) * 2 * aspect * vs,
    y: (0.5 - ny) * 2 * vs,
    radius: nr * 2 * aspect * vs,
  };
};

export const toBoard = (x, y, radius, aspect) => {
  const vs = viewScaleFor(aspect);
  return {
    nx: x / (2 * aspect * vs) + 0.5,
    ny: 0.5 - y / (2 * vs),
    nr: radius / (2 * aspect * vs),
  };
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round4 = (n) => Math.round(n * 1e4) / 1e4;

/** How many balls the Decorate gate needs. Read by main.js's completion rule. */
export const BLOB_BALLS_REQUIRED = 4;
/** The tag every tray ball's stamp carries. The gate counts these and only these. */
export const BALL_TAG = 'ball';

// Travel, in CSS pixels, before a press on the lump becomes a pull. The platform
// drag slop (docs/interaction-patterns.md #11): under it nothing whatsoever
// happens — no material moves, no gesture is opened, no sound plays — so a child
// resting a finger on their creature never smears it.
const PULL_SLOP_PX = 10;

// THE BRUSH, and why it is a world constant rather than a pixel one.
//
// A child's fingertip is about 96 CSS px across, and the platform floor for
// anything touchable is 96 px. Sizing the brush in PIXELS would honour that on
// every stage — and would also mean the gesture bites a smaller and smaller
// fraction of the creature as the display gets bigger, because a bigger display
// draws a bigger creature. The clay would feel stiffer on an iPad Pro than on a
// phone, which is the wrong direction for the whole toy.
//
// So the brush is a fraction of the CREATURE, which on the smallest stage this
// game supports still measures well over 96 px and grows from there.
//
// HOW BIG A FRACTION IS THE OWNER'S CALL, AND THEY MADE IT ON THE LAB PAGE.
// experiments/clay-physics-lab/field/ has a brush slider labelled in the units
// that matter to a hand — fingertip, medium, palm, whole hand — and the owner
// played it and reported: "I rounded it out towards the hand in the prototype
// and that was the ideal setting." That sentence is a measurement. The lab's
// slider spans 0.10 to 0.38 world units of radius, and the shipped 0.17 was
// the slider at 25% — a fingertip in all but name, and the reason a pull here
// came away as a spike where the same engine on the lab page came away round.
// (The pull kernel is the same code in both, character for character; only this
// number differed. See the note on PULL_CORE in shared/js/clay/field.js.)
//
// 0.26 is that setting brought over, adjusted for the palm the field now has.
// Measured on the lab's own two-ball fixture and its own gesture: the leading
// surface comes away 2.75 voxels thick a voxel behind its tip, against 2.37 for
// the lab at "whole hand" (0.338) which is the look the owner approved — so it
// is if anything slightly rounder — and it reaches further, 0.52 world against
// 0.46, because material that is carried rather than stretched follows the hand
// instead of necking off it. It costs 2.0 ms median per advection against 0.99
// at 0.17, which is well inside the house's 8 ms p95 for a pointermove even at
// the substep ceiling below.
const PULL_BRUSH = 0.26;
// A fast flick arrives as one big pointermove. field.pull() caps a single
// advection at PULL_STEP_CAP of the brush (past that the warp folds and the
// material tears), so a long move becomes several advections — but never more
// than three, or a flung finger could spend the whole frame budget in here.
const PULL_SUBSTEPS_MAX = 3;

// pointerdown grabs a LOOSE ball within this multiple of its own radius. Tight
// on purpose: a loose ball is a discrete object the child put down, and
// everything else on the stage is a surface to sculpt.
const PICK_RADIUS_FACTOR = 1.15;

// --- Weight-on-placement ----------------------------------------------------
// A downward scan, not a physics engine. Step this fraction of the ball's own
// radius, capped at this many steps.
const FALL_STEP_FRACTION = 0.06;
const FALL_MAX_STEPS = 90;
// How deep a falling ball's surface has to be into other clay before the scan
// calls it landed. A fraction of its own radius, so a small ball needs a small
// bite and a big one a big one. This is the moment that welds, so it also has
// to be a bite a child can SEE happen.
const CONTACT_FRACTION = 0.10;
// How far a resting ball's underside sinks into the table. The field's ground
// cut slices that overlap off, which is what makes the silhouette go
// flat-bottomed and a little wider where it meets the wood — the difference
// between a body that sits on the table and one that hovers over its own shadow.
const GROUND_SINK = 0.12;
const FALL_DURATION_MIN_MS = 140;
const FALL_DURATION_MAX_MS = 340;
const FALL_DURATION_PER_UNIT_MS = 260;
const SQUASH_PEAK = 0.55;
const SQUASH_DECAY = 6.0;
const SQUASH_FREQ = 3.4; // Hz — one hard squash, two decaying bounces
const SQUASH_STOP_AMOUNT = 0.01;
const SQUASH_STOP_SECONDS = 0.7;

// --- Gravity rest -----------------------------------------------------------
// The settle is NOT run on every release, and that is a decision rather than an
// optimisation. Baking one costs a trilinear resample of the grid (62–78 ms,
// the one visible hitch in the system) and every resample blurs the surface a
// little; running one after every gesture would both stutter the toy and,
// over a long session, slowly round the child's work away. So it runs when
// gravity actually has something to say: the body is off level by more than
// this, or it is off the table by more than a voxel and a half.
//
// Below these thresholds the creature is already at rest and the correct
// amount of settling to do is none. That also makes settling a FIXED POINT —
// settle twice and the second one does nothing — which is the promise that
// stops a child watching their own creature sag.
const SETTLE_ANGLE_MIN = 0.06; // radians, ~3.4 degrees
const SETTLE_DROP_VOXELS = 1.5;
const SETTLE_MS = 420;
const SETTLE_LOG_MAX = 60;

// How close to the edge of the field's cube material is allowed to get. The
// grid is the world here: clay pushed past it is not clipped by a camera, it
// stops existing. A ball is kept a whole radius plus its lump reach inside;
// a pulled point is kept a brush inside.
const DOMAIN_MARGIN = 0.04;

// How far BELOW the top of the visible canvas the clay is allowed to build.
//
// THE CLIP THE OWNER PHOTOGRAPHED WAS THIS EDGE, not the grid. Measured on the
// shipping stage (780x528, aspect 1.477): the field's cube top is at world
// y = +1.0, but the camera only shows up to y = +viewScale = +0.677, so the
// canvas scissors a tall creature 0.323 world units — 12.9 voxels — before the
// grid boundary is anywhere near it. A spire pulled straight up ended in a hard
// flat horizontal cut across the top of the frame, which is exactly what the
// screenshot shows.
//
// So the limit that matters is the CAMERA's, and it is re-measured on every
// resize alongside the ground because both move with the layout. The field's own
// cube-face margin still sits behind this as an independent guarantee (see
// FACE_MARGIN_VOXELS in field.js) — that one is what stops the grid shearing on
// a portrait stage, where viewScale is 1 and the canvas top and the cube top are
// the same line.
//
// 0.06 world units is about 23 CSS pixels at the shipping stage's 390 px per
// world unit: enough air above the tallest build to read as headroom rather than
// as a creature jammed against the ceiling. It costs 5% of the buildable height
// (1.264 world units above the table becomes 1.204, still 4.6 tray-ball
// diameters of tower).
const CEILING_INSET = 0.06;

// three.module.min.js is 680 KB; a dino build must never pay for it. One shared
// pending import so a stage build and a shelf rasterize in the same session do
// not double-fetch it.
let threePromise = null;
function loadThree() {
  if (!threePromise) threePromise = import('three');
  return threePromise;
}

function computeAspect(el) {
  const w = Math.max(1, el.clientWidth || 1);
  const h = Math.max(1, el.clientHeight || 1);
  return w / h;
}

const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The axis a settle rotation turns about, as a unit vector, or +z for a
 * rotation of nothing.
 *
 * Reported rather than merely trusted. The owner's rule — "the rotation forward
 * and back is unnecessary, we only need lateral rotation, on the x-y plane of
 * the laptop, no z-direction forward or back" — is about a thing that is very
 * hard to SEE gone wrong: a rotation about x pitches the creature toward the
 * camera, and through an orthographic lens that mostly reads as the shape
 * quietly changing rather than as a topple. So it is a number a reviewer can
 * read instead of a judgement they have to make from a screenshot.
 */
export function settleAxis(q) {
  const w = clamp(q?.[3] ?? 1, -1, 1);
  const s = Math.sqrt(Math.max(1 - w * w, 0));
  return s < 1e-8 ? [0, 0, 1] : [q[0] / s, q[1] / s, q[2] / s];
}

/** Fraction `t` of rotation `q`, measured from identity. Mirrors field.js. */
function slerpIdentity(q, t) {
  if (t >= 1) return q.slice();
  const w = clamp(q[3], -1, 1);
  const angle = 2 * Math.acos(w);
  if (angle < 1e-6) return [0, 0, 0, 1];
  const s = Math.sqrt(Math.max(1 - w * w, 1e-12));
  const half = (angle * t) / 2;
  const sh = Math.sin(half);
  return [(q[0] / s) * sh, (q[1] / s) * sh, (q[2] / s) * sh, Math.cos(half)];
}

/**
 * The interactive blob body for the `shape` phase (and, locked, through
 * `decorate`).
 *
 * Field creation is synchronous CPU work — placing a ball never has to wait on
 * three.js. The renderer arrives asynchronously; place() still works before it
 * does, and the first render after it is ready catches up to whatever was
 * already placed.
 */
export function createBlobStage({ canvas, shadow, stage, seed, hooks = {} } = {}) {
  const noiseSeed = Number.isFinite(Number(seed)) ? Number(seed) | 0 : 1337;
  const field = createClayField({ seed: noiseSeed, ground: null });

  let aspect = computeAspect(stage);
  let renderer = null;
  let destroyed = false;
  let locked = false;
  let resizeObserver = null;
  let groundWorldY = null; // null until measureGround() runs
  let placeSerial = 0;
  let looseSerial = 0;
  let activeDrag = null;
  let settleAnim = null;
  let settlePending = false;
  // How many settles the CURRENT fall has already taken. A topple is a roll
  // (see field.js settlePlan): each settle corrects a damped bite and the next
  // re-measures, so one release can owe several. Capped so that a creature the
  // solve cannot balance stops moving instead of rocking forever, and reset by
  // owedSettle() whenever the child does something new.
  let settleChain = 0;

  // THE UNWELDED CLAY. Newest last. Everything in here is still an object the
  // child can pick up; everything not in here is the creature.
  const loose = [];

  // Every settle this stage has started, newest last, capped. The owner once
  // reported watching a release and seeing nothing happen; the answer turned
  // out to be that the relaxation was firing correctly and moving two to four
  // CSS pixels. That question must never again cost a browser session, so the
  // activation is a fact a reviewer can read: when it fired, how far the clay
  // travelled in world units AND in CSS pixels, and how far gravity turned it.
  const settleLog = [];

  // -------------------------------------------------------------------------
  // Geometry helpers
  // -------------------------------------------------------------------------

  const worldPerCssPixel = () => {
    const rect = canvas.getBoundingClientRect();
    return rect.height > 0 ? (2 * viewScaleFor(aspect)) / rect.height : 0;
  };

  const cssPixelsPerWorld = () => {
    const w = worldPerCssPixel();
    return w > 0 ? 1 / w : 0;
  };

  /**
   * The stage furniture that sits ON TOP of the clay canvas and eats pointer
   * events meant for it. Read live rather than hard-coded, because both of
   * these buttons appear and disappear with the phase.
   */
  function obstructions() {
    const host = stage.parentElement;
    if (!host) return [];
    const canvasRect = canvas.getBoundingClientRect();
    const out = [];
    for (const el of host.querySelectorAll('.shape-button, .wake-button')) {
      if (el.hidden || el.getClientRects().length === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.right < canvasRect.left || r.left > canvasRect.right) continue;
      if (r.bottom < canvasRect.top || r.top > canvasRect.bottom) continue;
      out.push(r);
    }
    return out;
  }

  /**
   * Keep a ball wholly inside the grid, inside the visible stage, AND out from
   * under the stage's own buttons.
   *
   * THE THIRD CLAUSE IS A TRAP GUARD, and it is the same class of trap the
   * previous engine documented and fixed for the canvas edge. Clamping a ball
   * to the canvas box is not enough: "Decorate My Blob" and "Wake Up" are
   * absolutely positioned over the bottom-right of that very box, so a ball
   * shoved to the far right of the table came to rest UNDER one of them. The
   * ball is on the canvas, is perfectly visible, and is completely unreachable
   * — every press over it lands on the button instead. It cannot be moved and
   * it cannot be carried to the bin, on a toy whose entire promise is that
   * everything is reversible.
   *
   * Measured before this guard existed: a ball flung at the right edge came to
   * rest at board (0.874, 0.868), where `document.elementFromPoint` returns the
   * Decorate button.
   *
   * The escape is horizontal and toward the middle of the stage, because both
   * buttons are anchored to a corner: there is always free table that way.
   */
  function clampBallToStage(x, y, radius) {
    const vs = viewScaleFor(aspect);
    const reach = radius * 1.25 + DOMAIN_MARGIN;
    const limit = field.size / 2 - reach;
    let cx = clamp(x, Math.max(-aspect * vs + radius, -limit), Math.min(aspect * vs - radius, limit));
    const cy = clamp(y, Math.max(-vs + radius, -limit), Math.min(vs - radius, limit));
    if (!renderer) return { x: cx, y: cy };

    for (const rect of obstructions()) {
      const p = renderer.worldToClient(cx, cy);
      const pad = radius * cssPixelsPerWorld() * 0.75;
      if (p.x < rect.left - pad || p.x > rect.right + pad) continue;
      if (p.y < rect.top - pad || p.y > rect.bottom + pad) continue;
      // Slide out on whichever side is nearer, then re-clamp to the stage. If
      // the button is jammed against the stage edge (it always is), the inward
      // side is the only one that survives that re-clamp, which is the answer
      // we want anyway.
      const escapeLeft = renderer.clientToWorld(rect.left - pad, p.y).x;
      const escapeRight = renderer.clientToWorld(rect.right + pad, p.y).x;
      const next = Math.abs(escapeLeft - cx) <= Math.abs(escapeRight - cx) ? escapeLeft : escapeRight;
      cx = clamp(next, Math.max(-aspect * vs + radius, -limit), Math.min(aspect * vs - radius, limit));
    }
    return { x: cx, y: cy };
  }

  /** Keep a pull's grab point inside the grid, so advection never runs off it. */
  function clampGrabToDomain(x, y, z) {
    const limit = field.size / 2 - PULL_BRUSH - DOMAIN_MARGIN;
    return { x: clamp(x, -limit, limit), y: clamp(y, -limit, limit), z: clamp(z, -limit, limit) };
  }

  // Measures where a resting body's underside should sit and tells the field.
  // Called once the renderer exists and again on every resize — the turntable
  // (and therefore the ground line) moves with the layout.
  function measureGround() {
    if (!renderer || destroyed) return;
    const canvasRect = canvas.getBoundingClientRect();
    // `.turntable` is a SIBLING of `stage` (both live in `.work-area`), never a
    // child of it — query from the shared parent, and fall back to a fraction of
    // the stage's own box if some future markup drops the turntable entirely.
    const workArea = stage.parentElement;
    const turntableEl = workArea ? workArea.querySelector('.turntable') : null;
    let groundClientY;
    if (turntableEl) {
      const turntableRect = turntableEl.getBoundingClientRect();
      // The turntable is a fake-perspective ellipse (a squashed circle drawn in
      // CSS): the near contact line a resting body's underside should sit on is
      // forward of the ellipse's own vertical centre, not its top edge. 0.62 was
      // picked by eye against the .turntable geometry in style.css.
      groundClientY = turntableRect.top + turntableRect.height * 0.62;
    } else {
      groundClientY = canvasRect.top + canvasRect.height * 0.82;
    }
    groundClientY = Math.min(groundClientY, canvasRect.bottom);
    const worldY = renderer.clientToWorld(0, groundClientY).y;
    const vs = viewScaleFor(aspect);
    groundWorldY = Math.max(worldY, -vs);
    field.setGround(groundWorldY);
    // AND THE LID, measured off the same camera. See CEILING_INSET.
    field.setCeiling(vs - CEILING_INSET);
  }

  // -------------------------------------------------------------------------
  // Loose balls
  // -------------------------------------------------------------------------

  /**
   * Re-derive every loose ball's displayed noise phases.
   *
   * A loose ball has to look like the clay it is ABOUT to become, so it borrows
   * the phase the field will hand its stamp. Which phase that is depends on how
   * many stamps come first, so the queue's own order decides it, and the whole
   * queue is refreshed whenever it changes. A ball that welds out of order
   * re-rolls its neighbours' lumps by one index; at 0.11 of a radius on a ball
   * nobody is looking at, that is invisible, and the alternative — remembering a
   * phase and then stamping with a different one — is a ball that changes shape
   * as it joins, which is not.
   */
  function refreshLoosePhases() {
    const base = field.stats().stamps;
    for (let i = 0; i < loose.length; i++) loose[i].phase = stampPhase(noiseSeed, base + i);
  }

  function syncLoose() {
    if (!renderer) return;
    refreshLoosePhases();
    renderer.setLoose(loose.map((b) => ({
      x: b.x, y: b.y, z: b.z, radius: b.radius,
      color: b.rgb, phase: b.phase,
      squash: b.squash,
    })));
  }

  /**
   * Turn a loose ball into clay. THIS IS THE WELD, and after it there is
   * nothing left that knows a ball was ever here.
   */
  function stampLoose(ball, { silent = false } = {}) {
    const index = loose.indexOf(ball);
    if (index < 0) return false;
    loose.splice(index, 1);
    // compress: THE CLAY TAKES THE WEIGHT. field.js decides whether this ball
    // actually landed on clay (rather than on the table) and by how much the
    // column under it should squash; a ball set down on bare table changes
    // nothing. See field.js compressionFor().
    field.stampBall({ x: ball.x, y: ball.y, z: ball.z }, ball.radius, ball.color, { tag: BALL_TAG, compress: true });
    syncLoose();
    if (!silent && !hooks.isMuted?.()) sfx.sparkle();
    renderer?.requestRender();
    renderer?.settle(1);
    hooks.onChange?.();
    return true;
  }

  function removeLoose(ball) {
    const index = loose.indexOf(ball);
    if (index < 0) return false;
    loose.splice(index, 1);
    syncLoose();
    renderer?.requestRender();
    renderer?.settle(1);
    hooks.onChange?.();
    return true;
  }

  const looseById = (id) => loose.find((b) => b.id === id) || null;

  // -------------------------------------------------------------------------
  // Contact — the landing scan
  // -------------------------------------------------------------------------

  // Directions sampled on a ball's surface when asking whether it has pressed
  // into the creature. Down first, because that is where a falling ball meets
  // things, and the scan can then stop on its first sample in the common case.
  const CONTACT_DIRS = [
    [0, -1, 0], [0, 1, 0], [-1, 0, 0], [1, 0, 0], [0, 0, -1], [0, 0, 1],
    [-0.577, -0.577, 0], [0.577, -0.577, 0], [0, -0.577, -0.577], [0, -0.577, 0.577],
  ];

  /**
   * Is a ball of `radius` centred here pressed into the creature hard enough to
   * weld?
   *
   * THE OBVIOUS VERSION OF THIS IS WRONG, and it shipped for exactly one smoke
   * run before it was caught. Asking `sampleDistance(centre) <= radius` looks
   * like the right question, but the field's distance SATURATES at its CPU band
   * — six voxels, 0.15 world units — so empty space reports "clay is 0.15 away"
   * rather than "there is no clay". A tray ball's radius is 0.24–0.32, larger
   * than that band, so the test read TRUE against a completely empty field and
   * the very first ball a child dropped welded to nothing at all.
   *
   * So the question is asked where the answer is meaningful: at points ON the
   * ball's own surface, sunk in by CONTACT_FRACTION of its radius. `d <= 0`
   * there means real material, because the sign of the distance is trustworthy
   * everywhere while its magnitude is only trustworthy inside the band. Ten
   * samples, and it exits on the first hit.
   */
  function fieldContact(x, y, z, radius) {
    const reach = radius * (1 - CONTACT_FRACTION);
    for (const [dx, dy, dz] of CONTACT_DIRS) {
      if (field.sampleDistance(x + dx * reach, y + dy * reach, z + dz * reach) <= 0) return true;
    }
    return false;
  }

  /** ...and the same question against the other unwelded balls. */
  function looseContact(x, y, z, radius, skip) {
    for (const other of loose) {
      if (other === skip) continue;
      const gap = Math.hypot(x - other.x, y - other.y, z - other.z) - (radius + other.radius);
      if (gap <= -Math.min(radius, other.radius) * CONTACT_FRACTION) return other;
    }
    return null;
  }

  /**
   * Surface normal of the creature at a point — the direction a landing bounce
   * rings along. Central differences on the field, which is exactly what the
   * shader does to shade it.
   */
  function fieldNormal(x, y, z) {
    const e = field.h;
    const nx = field.sampleDistance(x + e, y, z) - field.sampleDistance(x - e, y, z);
    const ny = field.sampleDistance(x, y + e, z) - field.sampleDistance(x, y - e, z);
    const nz = field.sampleDistance(x, y, z + e) - field.sampleDistance(x, y, z - e);
    const len = Math.hypot(nx, ny, nz);
    return len > 1e-9 ? { x: nx / len, y: ny / len, z: nz / len } : { x: 0, y: 1, z: 0 };
  }

  /**
   * Fall straight down from `dropY` until something catches it: clay it has
   * pressed into hard enough to weld to, another loose ball, or the turntable —
   * whichever comes first. A simple downward scan, not a physics engine: if the
   * very first check already clears the threshold, this returns immediately with
   * no fall at all, which is "the drop point was already supported".
   */
  function computeRest(x, z, radius, dropY, skip) {
    const groundRestY = groundWorldY === null ? null : groundWorldY + radius * (1 - GROUND_SINK);
    const step = radius * FALL_STEP_FRACTION;
    let y = dropY;
    for (let i = 0; i <= FALL_MAX_STEPS; i++) {
      const other = looseContact(x, y, z, radius, skip);
      if (other) return { y, kind: 'loose', other, normal: normalBetween(x, y, z, other) };
      if (fieldContact(x, y, z, radius)) return { y, kind: 'clay', normal: fieldNormal(x, y, z) };
      if (groundRestY !== null && y <= groundRestY) return { y: groundRestY, kind: 'ground', normal: { x: 0, y: 1, z: 0 } };
      if (i === FALL_MAX_STEPS) {
        return { y: groundRestY !== null ? groundRestY : y, kind: 'ground', normal: { x: 0, y: 1, z: 0 } };
      }
      y -= step;
    }
    return { y: groundRestY !== null ? groundRestY : y, kind: 'ground', normal: { x: 0, y: 1, z: 0 } };
  }

  function normalBetween(x, y, z, other) {
    const dx = x - other.x; const dy = y - other.y; const dz = z - other.z;
    const len = Math.hypot(dx, dy, dz);
    return len > 1e-9 ? { x: dx / len, y: dy / len, z: dz / len } : { x: 0, y: 1, z: 0 };
  }

  // -------------------------------------------------------------------------
  // Placing a ball from the tray
  // -------------------------------------------------------------------------

  /**
   * @param {{id:string, size:number, color:string, place:number[]}} part
   * @param {{x?:number, y?:number}} [at] board-space drop point
   */
  function place(part, { x, y } = {}) {
    if (destroyed || locked) return null;
    const boardX = x ?? part.place[0];
    const boardY = y ?? part.place[1];
    const world = toWorld(boardX, boardY, part.size / 2, aspect);
    const serial = placeSerial++;
    // A little depth scatter so a stack of balls is not a flat coin. Derived
    // from the serial rather than rolled, so a seeded QA run is reproducible.
    const z = (((serial * 0.37) % 1) - 0.5) * world.radius * 0.5;
    const spot = clampBallToStage(world.x, world.y, world.radius);

    const ball = {
      id: `ball-${++looseSerial}`,
      partId: part.id,
      color: part.color || '#cccccc',
      rgb: parseColor(part.color || '#cccccc'),
      radius: world.radius,
      x: spot.x, y: spot.y, z,
      phase: [0, 0, 0],
      squash: null,
      anim: null,
    };

    // OVERFLOW. The renderer draws at most MAX_LOOSE unwelded balls, and the
    // honest thing to do with a fifth is not to refuse it — nothing in this toy
    // refuses anything — but to let the OLDEST one finish being clay. A ball
    // left on the table long enough settles into it. In practice this is
    // unreachable: anything a ball lands on welds, so loose balls only pile up
    // if a child deliberately scatters five of them apart.
    while (loose.length >= MAX_LOOSE) stampLoose(loose[0], { silent: true });

    // The renderer (and therefore the measured ground plane) may not exist yet
    // this early after load — field creation is synchronous, three.js is not.
    // Fall back to placing without weight rather than dropping a ball with no
    // table measured to catch it.
    if (!renderer || groundWorldY === null) {
      loose.push(ball);
      syncLoose();
      hooks.onChange?.();
      return ball;
    }

    const reduced = prefersReducedMotion();
    const rest = computeRest(ball.x, ball.z, ball.radius, ball.y, ball);
    const fallDistance = Math.max(0, ball.y - rest.y);

    loose.push(ball);
    if (reduced) {
      // No fall and no bounce: born at rest, and welded immediately if that is
      // where it landed. Byte-for-byte the end state of the animated path.
      ball.y = rest.y;
      syncLoose();
      finishLanding(ball, rest);
    } else {
      ball.anim = {
        phase: fallDistance > 1e-6 ? 'fall' : 'squash',
        dropY: ball.y,
        restY: rest.y,
        rest,
        elapsedMs: 0,
        fallDurationMs: clamp(
          FALL_DURATION_MIN_MS + fallDistance * FALL_DURATION_PER_UNIT_MS,
          FALL_DURATION_MIN_MS, FALL_DURATION_MAX_MS,
        ),
      };
      if (ball.anim.phase === 'squash') ball.y = rest.y;
      syncLoose();
    }

    renderer.requestRender();
    renderer.settle(2);
    hooks.onChange?.();
    return ball;
  }

  /**
   * The bounce has finished. If the ball came to rest ON something, it welds —
   * and so does whatever it landed on, because two lumps of clay pressed
   * together are one lump of clay. If it came to rest on the table it is still
   * loose: a ball on the table is a ball you have not used yet.
   */
  function finishLanding(ball, rest) {
    ball.squash = null;
    ball.anim = null;
    if (rest.kind === 'loose' && rest.other) stampLoose(rest.other, { silent: true });
    if (rest.kind === 'clay' || rest.kind === 'loose') {
      stampLoose(ball, { silent: true });
      if (!hooks.isMuted?.()) sfx.sparkle();
      owedSettle();
    } else {
      syncLoose();
    }
    hooks.onChange?.();
  }

  // -------------------------------------------------------------------------
  // The settle
  // -------------------------------------------------------------------------

  /** The child did something; the clay owes gravity a fresh look. */
  function owedSettle() {
    settlePending = true;
    settleChain = 0;
  }

  function settleNeeded() {
    const plan = field.settlePlan();
    if (!plan) return null;
    const needsRotation = plan.angle > SETTLE_ANGLE_MIN;
    const needsDrop = Math.abs(plan.drop) > field.h * SETTLE_DROP_VOXELS;
    return needsRotation || needsDrop ? plan : null;
  }

  function logSettle(plan, baked) {
    settleLog.push({
      at: Math.round(performance.now()),
      angle: plan ? plan.angle : 0,
      // Lateral only, always. See settleAxis().
      axis: plan ? settleAxis(plan.quat) : [0, 0, 1],
      drop: plan ? plan.drop : 0,
      dropPx: plan ? Math.abs(plan.drop) * cssPixelsPerWorld() : 0,
      resting: !!plan,
      baked,
      ops: field.opCount(),
      volume: field.volume(),
      reducedMotion: prefersReducedMotion(),
    });
    if (settleLog.length > SETTLE_LOG_MAX) settleLog.shift();
  }

  /**
   * Start the creature taking its set.
   *
   * THE ANIMATION NEVER RESAMPLES. The rotation the child watches is a POSE on
   * the renderer — the ray is carried into field space, so sixty frames of
   * settle cost sixty uniform writes and not one voxel. The field is baked
   * exactly once, at the end. That is the difference between a settle that
   * reads as clay and a settle that turns the surface to pudding: measured, an
   * accumulated-base sequence loses 0.5% of surface sharpness where a per-frame
   * one loses five times as much.
   */
  function startSettle() {
    if (destroyed || settleAnim) return false;
    const plan = settleNeeded();
    if (!plan) { logSettle(null, false); return false; }
    if (prefersReducedMotion()) {
      field.settleRest({ rate: 1 });
      logSettle(plan, true);
      renderer?.requestRender();
      renderer?.settle(1);
      hooks.onChange?.();
      return true;
    }
    settleAnim = { plan, elapsedMs: 0, durationMs: SETTLE_MS };
    renderer?.requestRender();
    return true;
  }

  function advanceSettle(dtMs) {
    if (!settleAnim) return false;
    settleAnim.elapsedMs += dtMs;
    const t = Math.min(1, settleAnim.elapsedMs / settleAnim.durationMs);
    const eased = t * t * (3 - 2 * t);
    const { plan } = settleAnim;
    renderer?.setPose(slerpIdentity(plan.quat, eased), plan.pivot, [0, plan.drop * eased, 0]);
    if (t < 1) return true;
    // Drop the display pose in the SAME task that bakes it, so the child never
    // sees a frame where the clay has snapped back to its unsettled attitude.
    renderer?.setPose(null, null, null);
    field.settleRest({ rate: 1 });
    settleAnim = null;
    logSettle(plan, true);
    // A FALL IS NOT ONE STEP. The plan just baked corrected part of the
    // imbalance; the footprint has moved because different clay is on the table
    // now, so ask again. If the creature is still going over, owe another
    // settle and let the child watch it keep rolling. It stops on its own the
    // moment the centre of mass is back inside the foot — that is the fixed
    // point — and the chain cap is only there so an unbalanceable body gives up
    // rather than rocking for the rest of the session.
    if (settleChain < 12 && settleNeeded()) { settleChain += 1; settlePending = true; } else { settleChain = 0; }
    hooks.onChange?.();
    return true; // one more frame to draw the baked result
  }

  /** Force the settle to its end state. Review hook, and the save path. */
  function settleNow() {
    if (settleAnim) {
      const { plan } = settleAnim;
      renderer?.setPose(null, null, null);
      field.settleRest({ rate: 1 });
      settleAnim = null;
      logSettle(plan, true);
    }
    settlePending = false;
    // 12, not 8. A topple is now a ROLL — each settle takes a damped bite out of
    // the imbalance and re-measures the footprint, so a badly overhung creature
    // needs several to come to rest where the old single-shot lay-down needed
    // one. Measured worst case in field.test.mjs section 16: four.
    // EVERY step is logged, not just the first. The settle log is the review
    // hook's record of what gravity did, and since a topple is now a roll
    // across several settles, logging only the one the animation baked would
    // hide the actual fall — the owner's "I watched a release and saw nothing
    // happen" question would cost another browser session to answer. Measured:
    // a loaf stamped in mid-air logs a drop at 0 degrees, then the turns, then
    // a final 0 that is how it reports coming to rest.
    let guard = 0;
    while (guard++ < 12) {
      const step = settleNeeded();
      if (!step) break;
      field.settleRest({ rate: 1 });
      logSettle(step, true);
    }
    // And the entry that says it is done. A null plan logs as angle 0 with
    // `resting: false`, which is how this hook has always spelled "gravity was
    // asked and had nothing to say"; a non-null one here means the guard ran
    // out with the creature still moving, and that should be visible too.
    logSettle(settleNeeded(), false);
    renderer?.requestRender();
    renderer?.settle(1);
    return settleState();
  }

  function settleState() {
    const plan = field.settlePlan();
    return {
      active: settleAnim !== null || settlePending,
      pending: settlePending,
      angle: plan ? plan.angle : 0,
      // The axis gravity would turn this creature about. It is the whole of the
      // owner's second rule made readable: this must be [0, 0, +/-1] and never
      // carry an x or a y. See settleAxis().
      axis: plan ? settleAxis(plan.quat) : [0, 0, 1],
      drop: plan ? plan.drop : 0,
      atRest: settleNeeded() === null,
      // WHY it is or is not about to move, in the vocabulary the physics
      // actually uses. `overhang` is the centre of mass measured against the
      // footprint the creature stands on: 0 is dead centre, +/-1 is directly
      // above an edge, and past that it is falling. A reviewer reading a
      // screenshot of a creature that "looks like it is leaning" can now check
      // the only number that decides whether it should move.
      balance: plan && plan.balance ? { ...plan.balance } : null,
    };
  }

  // -------------------------------------------------------------------------
  // The one rAF
  // -------------------------------------------------------------------------

  /**
   * Runs at the top of every renderer frame. Advances the landing animations
   * and the settle pose, and reports whether another frame is owed. Idle is the
   * overwhelmingly common case and must cost nothing — this returns false
   * before touching the field at all.
   */
  function onAnimationFrame(dtMs) {
    if (destroyed) return false;
    const dt = Math.max(0, Number(dtMs) || 0);
    let more = false;
    let looseChanged = false;

    for (const ball of loose.slice()) {
      const anim = ball.anim;
      if (!anim) continue;
      anim.elapsedMs += dt;
      if (anim.phase === 'fall') {
        const t = Math.min(1, anim.elapsedMs / anim.fallDurationMs);
        const eased = t * t; // ease-IN: gravity accelerating, not a linear slide
        ball.y = anim.dropY + (anim.restY - anim.dropY) * eased;
        looseChanged = true;
        more = true;
        if (t >= 1) { anim.phase = 'squash'; anim.elapsedMs = 0; ball.y = anim.restY; }
      } else {
        const tSec = anim.elapsedMs / 1000;
        const amount = SQUASH_PEAK * Math.exp(-SQUASH_DECAY * tSec) * Math.cos(2 * Math.PI * SQUASH_FREQ * tSec);
        if (Math.abs(amount) < SQUASH_STOP_AMOUNT || tSec > SQUASH_STOP_SECONDS) {
          finishLanding(ball, anim.rest);
          looseChanged = true;
        } else {
          const n = anim.rest.normal;
          ball.squash = { x: n.x, y: n.y, z: n.z, amount };
          looseChanged = true;
          more = true;
        }
      }
    }
    if (looseChanged) syncLoose();

    if (settleAnim) {
      more = advanceSettle(dt) || more;
    } else if (settlePending && !activeDrag) {
      // The clay has finally stopped moving, so the settle it has been owed
      // since the ball was dropped can start. Never mid-gesture: the clay must
      // not creep under the finger that is working it.
      settlePending = false;
      more = startSettle() || more;
    }
    return more;
  }

  // -------------------------------------------------------------------------
  // Boot
  // -------------------------------------------------------------------------

  async function init() {
    let THREE;
    try {
      THREE = await loadThree();
    } catch (error) {
      console.warn('[blob-field] three.js failed to load:', error.message);
      return;
    }
    if (destroyed) return;
    const rect = stage.getBoundingClientRect();
    aspect = rect.width / Math.max(rect.height, 1);
    renderer = createFieldRenderer({
      THREE,
      canvas,
      field,
      shadowEl: shadow,
      pixelRatio: 1.5,
      dragPixelRatio: 1.0,
      viewScale: viewScaleFor(aspect),
      onAnimationFrame,
    });
    renderer.setViewport(rect.width, rect.height);
    measureGround();
    syncLoose();
    renderer.requestRender();
    renderer.settle(2);

    resizeObserver = new ResizeObserver(() => {
      if (destroyed || !renderer) return;
      const box = stage.getBoundingClientRect();
      aspect = box.width / Math.max(box.height, 1);
      // NOTHING IS RE-ASPECTED. World space is isotropic and orientation-
      // independent by construction (see viewScaleFor at the top of this file),
      // so the creature simply stays where it is in the world and the stage
      // shows more or less of the table around it. blob-lobes.js had to
      // re-express every lobe through board space on a resize and carry its
      // stretch vector along by hand; that whole class of bug is gone.
      renderer.setViewScale(viewScaleFor(aspect));
      renderer.setViewport(box.width, box.height);
      measureGround();
      syncLoose();
    });
    resizeObserver.observe(stage);
  }

  const ready = init();

  // -------------------------------------------------------------------------
  // Picking
  // -------------------------------------------------------------------------

  /** The nearest LOOSE ball under a world point, or null. */
  function pickLoose(worldX, worldY) {
    let best = null;
    let bestScore = Infinity;
    for (const ball of loose) {
      const score = Math.hypot(worldX - ball.x, worldY - ball.y) / Math.max(ball.radius, 1e-6);
      if (score < bestScore) { bestScore = score; best = ball; }
    }
    return bestScore < PICK_RADIUS_FACTOR ? best : null;
  }

  /**
   * Where the finger landed on the creature, or null for the table. The camera
   * is orthographic down -z, so the pick is a march straight back through the
   * field from in front of the domain.
   */
  function pickClay(worldX, worldY) {
    const hit = field.raycast({ x: worldX, y: worldY, z: field.size }, { x: 0, y: 0, z: -1 });
    return hit.hit ? { x: hit.x, y: hit.y, z: hit.z } : null;
  }

  // -------------------------------------------------------------------------
  // Gestures
  // -------------------------------------------------------------------------

  /**
   * Advance an in-flight pull toward a world point.
   *
   * The field caps one advection at PULL_STEP_CAP of the brush, so a long move
   * becomes several — the material tears if a single warp folds. Returns how
   * many milliseconds the whole move cost, which the debug hook reports so the
   * drag-time CPU budget can be measured rather than assumed.
   */
  function pullToward(drag, worldX, worldY) {
    const target = clampGrabToDomain(worldX, worldY, drag.grab.z);
    let dx = target.x - drag.grab.x;
    let dy = target.y - drag.grab.y;
    const distance = Math.hypot(dx, dy);
    if (distance < field.h * 0.25) return 0;
    const cap = PULL_BRUSH * PULL_STEP_CAP;
    const steps = Math.min(PULL_SUBSTEPS_MAX, Math.max(1, Math.ceil(distance / cap)));
    // THE STEP IS CLAMPED HERE AS WELL AS IN THE FIELD, and the second clamp is
    // the one that matters. Past PULL_SUBSTEPS_MAX the substeps stop dividing
    // the move and start being too big for the cap, so field.pull() quietly
    // shortens each one — and if the grab point had already been advanced by
    // the length that was ASKED for, it would now be sitting further along than
    // any clay actually went. A few frames of that and the brush centre is out
    // in front of the material entirely, holding on by nothing but the outer
    // skirt of its own falloff, which is exactly how a flick used to draw a
    // thread out of a creature. Clamping first keeps the hand on the clay: a
    // hard flick simply moves less material than the finger travelled — the
    // finger slips, which is what fingers do on clay — and the next
    // pointermove measures the shortfall and takes it up.
    const per = Math.min(distance / steps, cap);
    const sx = (dx / distance) * per;
    const sy = (dy / distance) * per;
    let total = 0;
    for (let i = 0; i < steps; i++) {
      const ms = field.pull(drag.grab, { x: sx, y: sy, z: 0 }, PULL_BRUSH);
      // BOTH numbers, because they answer different questions. `opMs` is the
      // cost of ONE advection, which is what the research budget (0.7–2.6 ms
      // median, 8 ms ceiling on the largest brush) is quoted in and what a
      // tablet's per-op cost has to be extrapolated from. `moveMs` is the cost
      // of one pointermove, which is what actually has to fit in a frame — and
      // a fast flick makes that up to PULL_SUBSTEPS_MAX times the other.
      drag.opMs.push(ms);
      total += ms;
      drag.grab = clampGrabToDomain(drag.grab.x + sx, drag.grab.y + sy, drag.grab.z);
    }
    drag.moved = true;
    drag.moveMs.push(total);
    return total;
  }

  /**
   * THE ESCAPE. A gesture taken away mid-flight — pointercancel, a lost window
   * focus, an iPad app switch — never happened: the field writes back the
   * bricks it captured when the gesture opened and the creature is bit-identical
   * to before the finger landed.
   *
   * That is the ONLY undo in this toy, and it lives entirely inside the one
   * press-drag-release that made it. Once the finger comes up somewhere real
   * the clay is clay: there is no gesture that reaches back to a shape from
   * five minutes ago, because there is no shape from five minutes ago — there
   * is only clay, and the way to change it is to work it again. Stirred colour
   * in particular does not come back, and the owner chose that: it is what
   * makes this material rather than a picture of material.
   */
  function cancelDrag() {
    if (!activeDrag) return;
    const drag = activeDrag;
    activeDrag = null;
    if (drag.mode === 'pull') {
      field.revertGesture();
      renderer?.requestRender();
      renderer?.settle(1);
    } else if (drag.mode === 'move' && drag.ball) {
      drag.ball.x = drag.startX;
      drag.ball.y = drag.startY;
      syncLoose();
    }
    renderer?.setQuality('full');
    hooks.updateTrashHover?.();
    hooks.onChange?.();
  }

  function onPointerDown(event) {
    if (destroyed || locked || !renderer || activeDrag || event.isPrimary === false) return;
    const world = renderer.clientToWorld(event.clientX, event.clientY);

    // Two answers, not three.
    //   1. on a ball that has not welded yet  -> move it (it is loose clay)
    //   2. anywhere else on the creature      -> pull the material from there
    //   3. empty table -> not our gesture at all; do not even preventDefault
    let drag = null;
    const ball = pickLoose(world.x, world.y);
    if (ball) {
      drag = {
        pointerId: event.pointerId, mode: 'move', ball, moved: false,
        offsetX: world.x - ball.x, offsetY: world.y - ball.y,
        startX: ball.x, startY: ball.y,
        opMs: [], moveMs: [],
      };
      // A ball mid-bounce fighting the child's own grab would read as the clay
      // twitching under their finger. Ending its animation the instant it is
      // picked up hands full, uncontested control to the gesture.
      ball.anim = null;
      ball.squash = null;
      syncLoose();
    } else if (pickClay(world.x, world.y)) {
      // PENDING: the surface is under the finger, but no gesture is opened and
      // no material moves until the press travels past the slop.
      drag = {
        pointerId: event.pointerId, mode: 'pending', moved: false,
        downClientX: event.clientX, downClientY: event.clientY,
        downWorldX: world.x, downWorldY: world.y,
        opMs: [], moveMs: [],
      };
    }
    if (!drag) return;
    event.preventDefault();
    activeDrag = drag;
    renderer.setQuality('drag');
    if (!hooks.isMuted?.()) sfx.pop();
    hooks.dismissPrompt?.();
  }

  function onPointerMove(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId || !renderer) return;
    event.preventDefault();
    const world = renderer.clientToWorld(event.clientX, event.clientY);

    if (activeDrag.mode === 'pending') {
      const travel = Math.hypot(event.clientX - activeDrag.downClientX, event.clientY - activeDrag.downClientY);
      if (travel < PULL_SLOP_PX) return; // still nothing has happened
      // Taken at the point the finger went DOWN, not wherever it has got to —
      // the clay has to flow from the spot the child actually touched.
      const grab = pickClay(activeDrag.downWorldX, activeDrag.downWorldY);
      if (!grab) {
        // The finger is on the table after all. Not a refusal — there is
        // nothing left to refuse — the gesture simply is not ours, and not one
        // byte of state has changed.
        activeDrag = null;
        renderer.setQuality('full');
        hooks.updateTrashHover?.();
        return;
      }
      activeDrag.mode = 'pull';
      activeDrag.grab = clampGrabToDomain(grab.x, grab.y, grab.z);
      // Everything from here until commit or revert is undoable bit-exactly.
      field.beginGesture();
    }

    if (activeDrag.mode === 'pull') {
      pullToward(activeDrag, world.x, world.y);
      renderer.requestRender();
    } else if (activeDrag.mode === 'move' && activeDrag.ball) {
      const ball = activeDrag.ball;
      const spot = clampBallToStage(world.x - activeDrag.offsetX, world.y - activeDrag.offsetY, ball.radius);
      if (spot.x !== ball.x || spot.y !== ball.y) activeDrag.moved = true;
      ball.x = spot.x;
      ball.y = spot.y;
      syncLoose();
      renderer.requestRender();
      // PUSH-INTO WELDING. Shoving loose clay into the creature joins it, right
      // now, under the finger — the same contact rule a landing uses. The drag
      // ends because there is nothing left to drag.
      const other = looseContact(ball.x, ball.y, ball.z, ball.radius, ball);
      if (other || fieldContact(ball.x, ball.y, ball.z, ball.radius)) {
        if (other) stampLoose(other, { silent: true });
        stampLoose(ball, { silent: true });
        if (!hooks.isMuted?.()) sfx.sparkle();
        activeDrag = null;
        owedSettle();
        renderer.setQuality('full');
        renderer.settle(2);
        hooks.updateTrashHover?.();
        return;
      }
    }
    // Raw pointer, not the clamped clay position: while something is dragged
    // toward the trash its visual position may be pinned by the stage clamp, so
    // trash hover and the drop decision deliberately follow the finger.
    hooks.updateTrashHover?.(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId || !renderer) return;
    event.preventDefault();
    const drag = activeDrag;
    activeDrag = null;
    const overTrash = hooks.updateTrashHover?.(event.clientX, event.clientY) || false;

    if (drag.mode === 'pull') {
      if (overTrash) {
        // DISCARDED. The child worked this clay and carried it to the bin
        // without ever letting go, so the gesture is reverted exactly — a pull
        // makes no new material, it only moves material, so there is nothing to
        // throw away and "bin it" means the same thing as "never mind".
        field.revertGesture();
        if (!hooks.isMuted?.()) { sfx.unpop(); setTimeout(() => sfx.whoosh(), 70); }
      } else {
        field.commitGesture();
        if (drag.moved && !hooks.isMuted?.()) sfx.sparkle();
        if (drag.moved) owedSettle();
      }
    } else if (drag.mode === 'move' && drag.ball) {
      if (overTrash) {
        removeLoose(drag.ball);
        if (!hooks.isMuted?.()) { sfx.unpop(); setTimeout(() => sfx.whoosh(), 70); }
      } else if (drag.moved) {
        // Put down in mid-air: it falls, exactly as it would from the tray.
        const rest = computeRest(drag.ball.x, drag.ball.z, drag.ball.radius, drag.ball.y, drag.ball);
        if (prefersReducedMotion()) {
          drag.ball.y = rest.y;
          syncLoose();
          finishLanding(drag.ball, rest);
        } else if (rest.y < drag.ball.y - 1e-6 || rest.kind !== 'ground') {
          const fallDistance = Math.max(0, drag.ball.y - rest.y);
          drag.ball.anim = {
            phase: fallDistance > 1e-6 ? 'fall' : 'squash',
            dropY: drag.ball.y, restY: rest.y, rest, elapsedMs: 0,
            fallDurationMs: clamp(
              FALL_DURATION_MIN_MS + fallDistance * FALL_DURATION_PER_UNIT_MS,
              FALL_DURATION_MIN_MS, FALL_DURATION_MAX_MS,
            ),
          };
        }
        if (!hooks.isMuted?.()) sfx.sparkle();
      }
    }
    // mode 'pending' that never passed the slop: nothing happened, nothing to
    // say, and nothing to settle — a finger resting on the creature must not
    // make it move at all.

    renderer.setQuality('full');
    renderer.requestRender();
    renderer.settle(2);
    hooks.updateTrashHover?.();
    hooks.onChange?.();
  }

  function onPointerCancel(event) {
    if (!activeDrag || (event && event.pointerId !== activeDrag.pointerId)) return;
    cancelDrag();
  }

  function onBlur() { cancelDrag(); }

  canvas.addEventListener('pointerdown', onPointerDown, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', onPointerUp, { passive: false });
  window.addEventListener('pointercancel', onPointerCancel, { passive: false });
  window.addEventListener('blur', onBlur);

  // -------------------------------------------------------------------------
  // Programmatic verbs (QLOBE_DEBUG only)
  // -------------------------------------------------------------------------

  const boardDeltaToWorld = (dx, dy) => {
    const vs = viewScaleFor(aspect);
    return { wdx: Number(dx) * 2 * aspect * vs, wdy: -Number(dy) * 2 * vs };
  };

  /**
   * Take hold of the clay at BOARD point (nx, ny) and pull it by a board-space
   * (dx, dy), in `steps` sub-moves so the field sees the same progression a
   * finger produces. It goes through exactly the gesture the pointer path goes
   * through — beginGesture, pull, commitGesture — so a driver is never testing
   * a shortcut the child cannot take.
   *
   * `{ ok: false, reason: 'no-surface' }` is the only failure there is, and it
   * means the board point is on the table. There is no refusal.
   */
  function pullAt(nx, ny, dx, dy, steps = 8) {
    if (!renderer) return { ok: false, reason: 'no-renderer' };
    const world = toWorld(nx, ny, 0, aspect);
    const grab = pickClay(world.x, world.y);
    if (!grab) return { ok: false, reason: 'no-surface' };
    const volumeBefore = field.volume();
    const opsBefore = field.opCount();
    field.beginGesture();
    const drag = { grab: clampGrabToDomain(grab.x, grab.y, grab.z), moved: false, opMs: [], moveMs: [] };
    const { wdx, wdy } = boardDeltaToWorld(dx, dy);
    const n = Math.max(1, Math.round(Number(steps) || 8));
    for (let i = 1; i <= n; i++) {
      pullToward(drag, world.x + (wdx * i) / n, world.y + (wdy * i) / n);
    }
    field.commitGesture();
    renderer.requestRender();
    renderer.settle(1);
    owedSettle();
    const board = toBoard(drag.grab.x, drag.grab.y, 0, aspect);
    const stat = (list) => {
      if (!list.length) return { median: 0, p95: 0, max: 0 };
      const s = list.slice().sort((a, b) => a - b);
      return { median: s[s.length >> 1], p95: s[Math.min(s.length - 1, Math.floor(s.length * 0.95))], max: s[s.length - 1] };
    };
    const ops = stat(drag.opMs);
    const moves = stat(drag.moveMs);
    return {
      ok: true,
      moved: drag.moved,
      ops: field.opCount() - opsBefore,
      tipX: board.nx, tipY: board.ny,
      brush: PULL_BRUSH,
      volumeBefore, volume: field.volume(),
      // Per ADVECTION — the unit the research budget is quoted in.
      opMedianMs: ops.median, opP95Ms: ops.p95, opMaxMs: ops.max,
      // Per POINTERMOVE — the unit that has to fit in a frame.
      moveMedianMs: moves.median, moveP95Ms: moves.p95, moveMaxMs: moves.max,
      substeps: drag.opMs.length / Math.max(1, drag.moveMs.length),
    };
  }

  /**
   * Stamp clay directly at a BOARD point — the programmatic form of "a ball
   * landed here and welded". Used by drivers that want a known creature without
   * waiting out four fall animations.
   *
   * `nr` is a board radius (a fraction of the stage WIDTH), the same unit the
   * tray's `size` is in, so a caller never has to know about view scale.
   *
   * `options.depth` places the ball in front of or behind the mid-plane, in
   * world units. It exists for exactly one reason: a driver has to be able to
   * build a creature that is off balance IN DEPTH AND NOWHERE ELSE, to prove
   * that gravity leaves it alone. Nothing a child can do reaches this — the
   * tray's own depth scatter is derived from the placement serial — and it is
   * the only way to state the owner's "no forward and back" rule as a check on
   * the real game rather than only in the field's unit tests.
   */
  function stampAt(nx, ny, nr = 0.13, color = '#3fbf6f', options = {}) {
    if (destroyed) return { ok: false, reason: 'destroyed' };
    const { tag = BALL_TAG, depth = 0 } = typeof options === 'string' ? { tag: options } : (options || {});
    const world = toWorld(nx, ny, Number(nr) || 0.13, aspect);
    const radius = world.radius;
    const spot = clampBallToStage(world.x, world.y, radius);
    const limit = field.size / 2 - radius - DOMAIN_MARGIN;
    const z = clamp(Number(depth) || 0, -limit, limit);
    const ms = field.stampBall({ x: spot.x, y: spot.y, z }, radius, color, { tag: tag || undefined, compress: true });
    syncLoose();
    renderer?.requestRender();
    renderer?.settle(1);
    owedSettle();
    hooks.onChange?.();
    return { ok: true, ms, ops: field.opCount(), balls: ballCount() };
  }

  /** Move a loose ball to a board point. Welded clay is not a handle. */
  function movePiece(id, nx, ny) {
    const ball = looseById(id);
    if (!ball) return false;
    const world = toWorld(nx, ny, 0, aspect);
    const spot = clampBallToStage(world.x, world.y, ball.radius);
    ball.x = spot.x;
    ball.y = spot.y;
    syncLoose();
    renderer?.requestRender();
    renderer?.settle(1);
    hooks.onChange?.();
    return true;
  }

  function binLoose(id) {
    const ball = looseById(id);
    return ball ? removeLoose(ball) : false;
  }

  // -------------------------------------------------------------------------
  // Counts, persistence, teardown
  // -------------------------------------------------------------------------

  /**
   * How many balls the child has actually brought to the lump.
   *
   * Read straight off the op log, counting the stamps that carry the tray tag.
   * A pull is not a stamp and never will be, so no amount of sculpting can fake
   * progress toward the Decorate gate — which is what the four beads have
   * always meant. There is no second copy of this number anywhere.
   */
  const ballCount = () => field.countStamps(BALL_TAG);

  function lock() {
    cancelDrag();
    locked = true;
    canvas.classList.add('is-locked');
  }

  /**
   * The save. Version 5 is an OP LOG: the sequence of stamps and pulls that
   * made this creature, ~200 bytes for a dozen of them against 34 KB for a
   * gzipped grid, and byte-exact on replay because every op quantises its own
   * parameters before it runs (field.js, q6).
   *
   * Any loose ball still sitting on the table is stamped first. A creature is
   * what has been made, not what is lying next to it, and a save that carried
   * "and also there is an unattached ball over there" would have to carry an
   * object identity the whole representation exists to delete.
   */
  function toSaveDoc() {
    for (const ball of loose.slice()) stampLoose(ball, { silent: true });
    settleNow();
    return field.toDocument({
      balls: ballCount(),
      // Board-space ground, so a thumbnail rasterised at a different box size
      // still puts the flat bottom where the live stage had it.
      groundBoardY: groundWorldY === null ? null : round4(toBoard(0, groundWorldY, 0, aspect).ny),
    });
  }

  function getDebugTargets() {
    if (!renderer) return [];
    const targets = [];
    const bounds = field.bounds();
    if (bounds) {
      const a = renderer.worldToClient(bounds.minX, bounds.maxY);
      const b = renderer.worldToClient(bounds.maxX, bounds.minY);
      targets.push({
        id: 'clay-lump', role: 'neutral', kind: 'clay',
        rect: { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) },
      });
    }
    const pxPerWorld = cssPixelsPerWorld();
    for (const ball of loose) {
      const c = renderer.worldToClient(ball.x, ball.y);
      const r = ball.radius * pxPerWorld;
      targets.push({
        id: ball.id, role: 'neutral', kind: 'loose',
        rect: { x: c.x - r, y: c.y - r, w: r * 2, h: r * 2 },
      });
    }
    return targets;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelDrag();
    settleAnim = null;
    settlePending = false;
    loose.length = 0;
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('blur', onBlur);
    resizeObserver?.disconnect();
    resizeObserver = null;
    renderer?.destroy();
    renderer = null;
  }

  return {
    ready,
    place,
    lock,
    destroy,
    // counts
    ballCount,
    opCount: () => field.opCount(),
    clayVolume: () => field.volume(),
    looseCount: () => loose.length,
    noiseSeed: () => noiseSeed,
    // gestures, programmatic
    pullAt,
    stampAt,
    movePiece,
    binLoose,
    settleNow,
    settleState,
    settleLog: () => settleLog.map((entry) => ({ ...entry })),
    // introspection
    ops: () => field.ops(),
    /**
     * How mixed the clay is against a set of query colours. This is the metric
     * the atomic-identity question is now asked in: stir two colours together
     * and `mixedFraction` rises, and no gesture brings it back down. §12.7
     * measured 0.012–0.039 for an untouched seam, 0.109 after a real stir, and
     * 0.258 after applying the exact inverse drag in reverse order.
     */
    census: (colors) => field.colorCensus(Array.isArray(colors) && colors.length ? colors : ['#3fbf6f', '#ff7314']),
    looseBalls: () => loose.map((ball) => {
      const board = toBoard(ball.x, ball.y, ball.radius, aspect);
      return {
        id: ball.id, partId: ball.partId, color: ball.color,
        nx: round4(board.nx), ny: round4(board.ny), nr: round4(board.nr),
        falling: !!ball.anim,
      };
    }),
    bounds: () => field.bounds(),
    getDebugTargets,
    toSaveDoc,
    stats: () => {
      const base = renderer?.stats() ?? null;
      if (!base) return null;
      const groundBoardY = groundWorldY === null ? null : toBoard(0, groundWorldY, 0, aspect).ny;
      return {
        ...base,
        groundWorldY, groundBoardY, aspect,
        viewScale: viewScaleFor(aspect),
        // The lid, and the two numbers a reviewer needs to see it is doing its
        // job: where the clay may build to, and where the canvas actually ends.
        // ceilingWorldY must stay BELOW visibleTopY or the top of a tall build
        // gets scissored by the canvas edge — the owner's second report.
        ceilingWorldY: field.effectiveCeiling(),
        visibleTopY: viewScaleFor(aspect),
        cubeTopY: field.size / 2,
        ops: field.opCount(),
        balls: ballCount(),
        loose: loose.length,
        volume: field.volume(),
        memory: field.memory(),
        fieldStats: field.stats(),
      };
    },
    /**
     * The raymarch cost probe. A frame interval measured off rAF is pinned to
     * vsync and reads 16.7 ms whether the march had headroom to spare or none
     * at all, so it cannot answer the fill-rate question. probe() blocks on a
     * one-pixel readPixels, which does. Review-only: it stalls the pipeline.
     */
    probe: (frames = 12) => renderer?.probe(frames) ?? null,
  };
}

// ---------------------------------------------------------------------------
// The shelf / alive-screen thumbnail path
// ---------------------------------------------------------------------------

// ONE detached canvas and ONE renderer for the whole session, created lazily.
// A WebGL context per shelf card is how a page runs out of contexts and starts
// silently dropping the earliest ones.
//
// The FIELD, though, cannot be shared: a creature's noise seed is baked in at
// construction, so every saved creature is its own field and the renderer is
// re-pointed at it (field-three's setField). The res is fixed, so the volume
// texture is allocated exactly once.
let rasterState = null;

async function ensureRasterizer(field) {
  if (!rasterState) {
    const THREE = await loadThree();
    const canvas = document.createElement('canvas');
    const renderer = createFieldRenderer({ THREE, canvas, field, pixelRatio: 1.5 });
    rasterState = { canvas, renderer, field };
    return rasterState;
  }
  if (rasterState.field !== field) {
    rasterState.renderer.setField(field);
    rasterState.field = field;
  }
  return rasterState;
}

/**
 * Rasterize a saved blob document at the given display box size, as a data URL.
 *
 * EVERY FORMAT THIS GAME HAS EVER WRITTEN LOADS HERE. A v5 document is replayed
 * directly. A legacy sprite composition, or a v1–v4 lobe document, is first
 * converted to an approximating op sequence (blob-legacy.js) and then replayed
 * through the same path — there is exactly one renderer and one representation,
 * and an old creature is not a special case of drawing, it is a special case of
 * loading. The fidelity of that conversion is approximate BY DESIGN and is
 * documented honestly in game-design.md.
 *
 * Never throws into a caller that forgets to catch. Callers rasterizing several
 * cards must still await one at a time — the renderer above is a singleton.
 */
export async function rasterizeSavedBlob(doc, displayWidth, displayHeight) {
  const field = fieldFromAnyDoc(doc, displayWidth / Math.max(displayHeight, 1));
  if (!field) throw new Error('invalid saved blob composition');
  const { renderer } = await ensureRasterizer(field);
  renderer.setViewScale(viewScaleFor(displayWidth / Math.max(displayHeight, 1)));
  renderer.setViewport(displayWidth, displayHeight);
  return renderer.toDataURL('image/png');
}

/**
 * A field carrying whatever `doc` describes, whichever era it is from.
 * Exported so the node suite can measure legacy fidelity without a browser.
 */
export function fieldFromAnyDoc(doc, aspect = 1) {
  if (!doc) return null;
  if (doc.format === DOC_FORMAT) return createFieldFromDocument(doc);
  if (!isLegacyBlobDoc(doc)) return null;
  const converted = legacyToOps(doc, { aspect, viewScale: viewScaleFor(aspect) });
  if (!converted) return null;
  return createFieldFromDocument({
    format: DOC_FORMAT,
    version: DOC_VERSION,
    seed: converted.seed,
    ground: converted.ground,
    ops: converted.ops,
  });
}
