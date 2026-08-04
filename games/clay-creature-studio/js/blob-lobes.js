// blob-lobes.js — wires the implicit-clay-lobes engine (shared/js/clay/lobes.js
// + lobes-three.js) into the blob body only. Nothing here ever runs for the
// other five creatures: main.js only calls createBlobStage() when the child
// picked Blob, and that is the sole place three.js gets imported.
//
// Two coordinate spaces, per docs/interaction-patterns.md and the integration
// spec: BOARD space (nx, ny in 0..1 of the stage box, y down, nr = radius as a
// fraction of stage width — what the decorations and saves already use) and
// WORLD space (isotropic, +y up, canvas height spans y in [-1,1], width spans
// x in [-aspect, aspect]) — what the lobe field and renderer use, so contact
// math is correct regardless of the stage box's own aspect ratio.

//
// THE LUMP RULE — RESHAPING
// Nothing here adds clay. There are exactly two things a pointer can do: move
// a ball that has NOT welded yet (still loose clay), or take hold of the mass
// under it and RESHAPE it — and every square millimetre of the creature, limbs
// included, answers that second gesture the same way. Press and drag and the
// mass under the finger elongates toward it: the ball becomes an egg, then a
// capsule, narrowing everywhere as it lengthens because its clay is its own
// and finite. Press the far end and drag: the stretch continues from there.
// Press a long limb's shaft and drag sideways: a second capsule comes out of
// it. There is no "adjust that arm" mode, no capture radius to discover, and
// no place where the same finger means two different things.
//
// AND IT NEVER SAYS NO. Reshaping allocates nothing, so a child can work the
// same creature for as long as they like. The old gentle wiggle for "the lobe
// cap is full" and "this clay is spent" is gone from the pull path entirely —
// there is nothing left for it to refuse. See game-design.md.
//
// TAKING ITS SET
// Every release runs the field's brief, finite, deterministic relaxation, and
// it is meant to be SEEN: welds press visibly together, the resting mass
// spreads into the table, the fresh elongation slumps a few percent with one
// soft overshoot, and same-colour masses that already read as one thing round
// into one thing. Every effect is a fixed point, so it happens once and does
// not compound — a five-year-old must never watch their own work undo itself.

import { createLobeField, MAX_LOBES, contactAmount, FUSE_THRESHOLD, DEFAULT_NOISE_SEED } from '../../../shared/js/clay/lobes.js';
import { createLobeRenderer } from '../../../shared/js/clay/lobes-three.js';
import * as sfx from '../../../shared/js/sfx.js';

export const toWorld = (nx, ny, nr, aspect) => ({
  x: (nx - 0.5) * 2 * aspect,
  y: (0.5 - ny) * 2,
  radius: nr * 2 * aspect,
});

export const toBoard = (x, y, radius, aspect) => ({
  nx: x / (2 * aspect) + 0.5,
  ny: 0.5 - y / 2,
  nr: radius / (2 * aspect),
});

const round4 = (n) => Math.round(n * 1e4) / 1e4;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const PICK_RADIUS_FACTOR = 1.15; // pointerdown grabs the nearest LOOSE ball within 1.15x its own radius
// Travel, in CSS pixels, before a press on the lump becomes a pull. Matches
// the platform drag slop (docs/interaction-patterns.md #11): under it, nothing
// whatsoever happens — no lobe is created, no clay is borrowed, no sound
// plays — so a child resting a finger on their creature never accidentally
// sprouts a stub they then have to work out how to remove.
const PULL_SLOP_PX = 10;
// THE MID-GESTURE ESCAPE. On release, a reshape that moved the mass less than
// this fraction of the grabbed surface's own radius is treated as never having
// happened: the field's opening snapshot is written back and the lump is
// bit-identical to before the finger landed. Small, because under reshaping
// semantics the escape is only for "I changed my mind before I really did
// anything" — a drag that visibly moved clay is work, and work is kept.
//
// This is the ONLY way a pull is undone by pulling, and it lives entirely
// inside the one press-drag-release that made it. Once the finger comes up
// somewhere real, the clay is clay: there is no gesture that reaches back to a
// limb from five minutes ago, because under additive semantics that gesture
// would have to be "adjust this limb", which is the whole thing this model
// exists to remove. What replaces it is the bin (below), the settle, and the
// fact that more clay can always be added anywhere.
const PULL_RELEASE_MIN_GRIPS = 0.20;
// How many balls the Decorate gate needs. Exported because main.js's
// completion rule has to read the SAME number this file reserves lobe slots
// for (see canSpawn) — two copies of it is exactly how the trap below gets
// reintroduced.
export const BLOB_BALLS_REQUIRED = 4;

// --- Weight-on-placement tuning --------------------------------------------
// A downward scan, not a physics engine (see place()/computeRest()): step this
// fraction of the piece's own rest radius, capped at this many steps.
const FALL_STEP_FRACTION = 0.06;
const FALL_MAX_STEPS = 90;
// Where the fall scan calls a ball "supported". It sits deliberately just PAST
// lobes.js's own fusion threshold, not below it: a ball that comes to rest on
// the body must also have welded to it by the time it stops. Set any lower
// (0.4 was the first attempt) and the ball settles visibly touching the body
// at contact ~0.45 while fusion needs 0.52 — two lumps of clay resting against
// each other without joining, which is exactly the "second blob places ON the
// first blob" moment the product brief is built around, silently broken.
const CONTACT_LANDING_THRESHOLD = FUSE_THRESHOLD + 0.03;
const FALL_DURATION_MIN_MS = 140;
const FALL_DURATION_MAX_MS = 340;
const FALL_DURATION_PER_UNIT_MS = 260; // extra ms per world-unit of fall distance
const SQUASH_PEAK = 0.55;
const SQUASH_DECAY = 6.0;
const SQUASH_FREQ = 3.4; // Hz — one hard squash, two decaying bounces
const SQUASH_STOP_AMOUNT = 0.01;
const SQUASH_STOP_SECONDS = 0.7;
// Fixed (never auto-generated) id for the throwaway probe lobe computeRest()
// uses to read the ground-clamped resting height back from the field. A FIXED
// id, rather than letting add() mint one, is deliberate: an auto id burns a
// slot out of the field's own autoCounter sequence, which would make real
// placements land on 'lobe-2', 'lobe-4', ... instead of 'lobe-1', 'lobe-2',
// ... — a gap a QA driver correlating placement order with lobe ids would
// have no way to predict.
const GROUND_PROBE_ID = '__ground-probe__';

// three.module.min.js is 680KB; a dino build must never pay for it. One shared
// pending import so a stage build and a shelf rasterize (if both happen to
// occur in the same session) don't double-fetch it.
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

// Closest point on the 2D segment (ax,ay)-(bx,by) to point (px,py), returned
// as a parameter t in 0..1. This is the pointer-picking analogue of the
// segment-vs-segment closest-point lobes.js keeps internal to contactAmount —
// picking only ever needs point-vs-segment (the pointer isn't a capsule), so
// it's simpler to write directly than to shoehorn a zero-length segment into
// that general routine. Degenerates cleanly to t=0 (point-vs-point) when base
// and tip coincide, i.e. an unstretched ball.
function closestSegmentParam(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 1e-12) return 0;
  const t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  return clamp(t, 0, 1);
}

// Re-expresses one lobe in the OLD aspect's board space, then back into the
// NEW aspect's world space — exactly what keeps a saved composition portable
// across an orientation change (see interaction-patterns #14 for the
// freeform-board precedent this mirrors).
function reaspectLobe(lobe, oldAspect, newAspect) {
  const board = toBoard(lobe.x, lobe.y, lobe.radius, oldAspect);
  const world = toWorld(board.nx, board.ny, board.nr, newAspect);
  const nz = lobe.z / (2 * oldAspect);
  const result = { ...lobe, x: world.x, y: world.y, z: nz * 2 * newAspect, radius: world.radius };
  // The stretch vector rides the SAME old-aspect -> board -> new-aspect round
  // trip as position (toBoardJSON()'s sbx = sx/(2*aspect), sby = -sy/2, both
  // reused here), rather than carrying the raw world-space vector across
  // untouched. sx/sz are aspect-scaled (board x is normalized by stage
  // WIDTH); sy is not (board y is normalized by stage HEIGHT, which every
  // aspect shares) — leaving sx/sz unconverted would visibly bend a stretched
  // limb's angle the moment the stage's own aspect changes.
  const sx = lobe.sx || 0, sy = lobe.sy || 0, sz = lobe.sz || 0;
  if (sx !== 0 || sy !== 0 || sz !== 0) {
    const boardSx = sx / (2 * oldAspect);
    const boardSy = -sy / 2;
    const boardSz = sz / (2 * oldAspect);
    result.sx = boardSx * 2 * newAspect;
    result.sy = -boardSy * 2;
    result.sz = boardSz * 2 * newAspect;
  }
  return result;
}

/**
 * The interactive blob body for the `shape` phase (and, locked, through
 * `decorate`). Field creation is synchronous CPU work — placing a ball never
 * has to wait on three.js. The renderer arrives asynchronously; place() still
 * works before it does, and the first requestRender() after it's ready
 * catches the field up to whatever was already placed.
 */
export function createBlobStage({ canvas, shadow, stage, seed, hooks = {} } = {}) {
  const field = createLobeField({ maxLobes: MAX_LOBES });
  // The creature's hand-worked-surface seed. Handed in by the caller rather
  // than rolled here, so it can be derived from the game's own seeded RNG and
  // a QA driver that pins that seed gets the same lumps every run. It is
  // persisted with the composition (see toBoardJSON), which is what makes a
  // shelf thumbnail match the creature the child actually made.
  field.setSeed(Number.isFinite(Number(seed)) ? Number(seed) : DEFAULT_NOISE_SEED);
  let aspect = computeAspect(stage);
  let renderer = null;
  let destroyed = false;
  let placeSerial = 0;
  let activeDrag = null;
  let resizeObserver = null;
  let groundWorldY = null; // world y of the measured ground plane; null until measureGround() runs
  // Set when a landing bounce is still playing but the lump already owes a
  // settle. The settle runs only once the clay has actually stopped moving —
  // relaxing a body that is still mid-bounce would measure the bounce.
  let settlePending = false;

  // Live per-lobe landing animations: id -> { phase: 'fall'|'squash', ... }.
  // The renderer's onAnimationFrame hook (below) is the ONLY thing that ever
  // advances or clears an entry — no timer, no second rAF loop, per
  // docs/interaction-patterns.md #12's render-on-demand contract.
  const animations = new Map();

  // Measures where a resting body's underside should sit and tells the field
  // about it. Called once the renderer exists and again on every resize —
  // the turntable (and therefore the ground line) moves with the layout.
  function measureGround() {
    if (!renderer || destroyed) return;
    const canvasRect = canvas.getBoundingClientRect();
    // `.turntable` is a SIBLING of `stage` (both live in `.work-area`), never
    // a child of it — query from the shared parent, and fall back to a
    // fraction of the stage's own box if some future markup ever drops the
    // turntable element entirely.
    const workArea = stage.parentElement;
    const turntableEl = workArea ? workArea.querySelector('.turntable') : null;
    let groundClientY;
    if (turntableEl) {
      const turntableRect = turntableEl.getBoundingClientRect();
      // The turntable is a fake-perspective ellipse (a squashed circle drawn
      // in CSS): the near contact line a resting body's underside should
      // sit on is forward of the ellipse's own vertical centre, not its top
      // edge. 0.62 was picked by eye against the .turntable geometry in
      // style.css (left:50%, bottom:-6%, height:31%) to land on that near
      // edge rather than the ellipse's midline or its far rim.
      groundClientY = turntableRect.top + turntableRect.height * 0.62;
    } else {
      groundClientY = canvasRect.top + canvasRect.height * 0.82;
    }
    groundClientY = Math.min(groundClientY, canvasRect.bottom);
    const worldY = renderer.clientToWorld(0, groundClientY).y;
    // Never let the plane sit off the bottom of the canvas, however the
    // layout above computes it.
    groundWorldY = Math.max(worldY, -1.0);
    field.setGround(groundWorldY);
  }

  // Reads back the ground-clamped resting height for a ball of `restRadius`
  // WITHOUT duplicating lobes.js's private SINK constant: add a probe ball
  // far below the plane and let the field's own add()-time ground clamp lift
  // it, then read the lifted y straight back off the returned record. A
  // FIXED id (not an auto one) so this never perturbs the autoCounter
  // sequence real placements draw their ids from (see GROUND_PROBE_ID).
  function groundRestHeight(restRadius) {
    if (groundWorldY === null) return null;
    if (field.has(GROUND_PROBE_ID)) return null; // should never happen (synchronous, always removed below); never clobber a real lobe
    const probe = field.add({
      id: GROUND_PROBE_ID, x: 0, y: groundWorldY - restRadius * 1000, z: 0,
      radius: restRadius, kind: '__ground-probe__',
    });
    if (!probe) return null; // field at the lobe cap: caller falls back to no-ground behaviour
    const restY = probe.y;
    field.remove(GROUND_PROBE_ID);
    return restY;
  }

  // The strongest contactAmount a candidate (not-yet-added) record has
  // against any CURRENT lobe — used both to detect "already supported, no
  // fall" and as the downward scan's stop condition. Works on a bare record
  // (see lobes.js's contactAmount docs) since the candidate isn't a real
  // field lobe yet.
  function strongestContact(x, y, z, radius, existing) {
    const candidate = { x, y, z, radius };
    let amount = 0, id = null;
    for (const other of existing) {
      const c = contactAmount(candidate, other);
      if (c > amount) { amount = c; id = other.id; }
    }
    return { amount, id };
  }

  // A newly placed lobe falls straight down from the drop point until EITHER
  // it is supported by an existing lobe (contact >= CONTACT_LANDING_THRESHOLD)
  // OR it reaches the ground rest height — whichever comes first. A simple
  // downward scan, not a physics engine: if the very first check (at the drop
  // y itself) already clears the support threshold, this returns immediately
  // with no fall at all, which is exactly "the drop point was already
  // supported" from the product brief.
  function computeRest(x, z, restRadius, dropY) {
    const groundRestY = groundRestHeight(restRadius);
    const existing = field.list();
    const step = restRadius * FALL_STEP_FRACTION;
    let y = dropY;
    for (let i = 0; i <= FALL_MAX_STEPS; i++) {
      const support = strongestContact(x, y, z, restRadius, existing);
      if (support.amount >= CONTACT_LANDING_THRESHOLD) return { y, supportId: support.id };
      if (groundRestY !== null && y <= groundRestY) return { y: groundRestY, supportId: null };
      if (i === FALL_MAX_STEPS) return { y: groundRestY !== null ? groundRestY : y, supportId: null };
      y -= step;
    }
    // Unreachable (the loop above always returns), kept only so a future edit
    // to the loop bounds can't fall through with no return value.
    return { y: groundRestY !== null ? groundRestY : y, supportId: null };
  }

  const prefersReducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  /**
   * Starts the lump taking its set. Under reduced motion it jumps straight to
   * the settled end state — which is byte-for-byte where the animation lands,
   * so the two paths cannot diverge — and under normal motion it hands the
   * relaxation to the rAF chain below.
   *
   * Called after EVERY release: a ball finishing its landing bounce, a pull
   * being let go, a loose ball being put down. Never mid-gesture, because the
   * clay must not creep under the finger that is working it.
   */
  // Every settle this stage has started, newest last, capped. The owner
  // reported watching a release and seeing nothing happen; the answer turned
  // out to be that the relaxation was firing correctly and moving two to four
  // CSS pixels. That question must never again cost a browser session to
  // answer, so the activation is now a fact a reviewer can read off the debug
  // hook: when it fired, how far the clay will travel (in world units AND in
  // CSS pixels), and whether a merge is riding along with it.
  const settleLog = [];
  const SETTLE_LOG_MAX = 60;

  function startSettle() {
    if (destroyed || field.count() === 0) return;
    const maxDelta = field.beginSettle();
    const rect = canvas.getBoundingClientRect();
    settleLog.push({
      at: Math.round(performance.now()),
      maxDelta,
      // World y spans [-1, 1] across the canvas height, so this is the honest
      // perceptual figure — the one a tuning decision has to be made against.
      maxDeltaPx: maxDelta * (rect.height || 0) / 2,
      lobes: field.count(),
      merging: field.settleState().merging,
      // Whether GRAVITY is riding along with this settle, and how far it is
      // turning the creature. The owner reported a creature that had not
      // settled as it would from gravity; this is the line of the log that
      // answers that question directly instead of by measuring a screenshot.
      resting: field.settleState().resting,
      restAngle: field.settleState().restAngle,
      reducedMotion: prefersReducedMotion(),
    });
    if (settleLog.length > SETTLE_LOG_MAX) settleLog.shift();
    if (prefersReducedMotion()) {
      field.finishSettle();
      afterSettle();
    }
    renderer?.requestRender();
    renderer?.settle(1);
  }

  // Slot reclamation runs when the clay has stopped moving, never during a
  // settle: a lobe absorbed mid-relaxation would be removed from under the
  // interpolation that is still writing to it. By the time this fires, every
  // lobe it can take is invisible by measurement (see lobes.js consolidate).
  // Only worth doing when slots are actually scarce, and deliberately gated on
  // that rather than run after every gesture: the absorb test samples each
  // candidate's own hull against the whole rest of the union, which is cheap
  // when it exits on the first visible sample (the common case) but is not
  // free, and there is no reason to spend it on a four-ball body with three
  // arms and nine slots going spare.
  const CONSOLIDATE_FROM = MAX_LOBES - 2;

  function afterSettle() {
    if (destroyed) return;
    if (field.count() < CONSOLIDATE_FROM) return;
    if (field.consolidate() > 0) {
      renderer?.requestRender();
      hooks.onChange?.();
    }
  }

  // Passed into the renderer as opts.onAnimationFrame: runs at the top of
  // every rAF-driven frame, advances every live landing animation and the
  // settle by dtMs, and reports whether the renderer should chain one more
  // frame. Idle (nothing landing, nothing settling) is the overwhelmingly
  // common case and must cost nothing — this returns false before touching the
  // field at all.
  function onAnimationFrame(dtMs) {
    if (animations.size === 0) {
      if (field.settleState().active) {
        if (field.advanceSettle(dtMs)) return true;
        afterSettle();
        return false;
      }
      if (settlePending) { settlePending = false; startSettle(); return field.settleState().active; }
      return false;
    }
    const dt = Math.max(0, Number(dtMs) || 0);
    let any = false;
    for (const [id, anim] of animations) {
      if (!field.has(id)) { animations.delete(id); continue; } // e.g. discarded to the trash mid-bounce
      anim.elapsedMs += dt;
      if (anim.phase === 'fall') {
        const t = Math.min(1, anim.elapsedMs / anim.fallDurationMs);
        const eased = t * t; // ease-IN: gravity accelerating, not a linear slide
        const y = anim.dropY + (anim.restY - anim.dropY) * eased;
        field.move(id, anim.x, y, anim.z);
        any = true;
        if (t >= 1) { anim.phase = 'squash'; anim.elapsedMs = 0; }
      } else {
        const tSec = anim.elapsedMs / 1000;
        const amount = SQUASH_PEAK * Math.exp(-SQUASH_DECAY * tSec) * Math.cos(2 * Math.PI * SQUASH_FREQ * tSec);
        if (Math.abs(amount) < SQUASH_STOP_AMOUNT || tSec > SQUASH_STOP_SECONDS) {
          field.setImpact(id, 0, 0, 0);
          animations.delete(id);
        } else {
          field.setImpact(id, anim.axisX, anim.axisY, amount);
          any = true;
        }
      }
    }
    // The last landing bounce has just finished: the clay is finally still, so
    // the settle it has been owed since it was dropped can start.
    if (animations.size === 0 && settlePending) {
      settlePending = false;
      startSettle();
      if (field.settleState().active) any = true;
    }
    return any;
  }

  async function init() {
    let THREE;
    try {
      THREE = await loadThree();
    } catch (error) {
      console.warn('[blob-lobes] three.js failed to load:', error.message);
      return;
    }
    if (destroyed) return;
    renderer = createLobeRenderer({ THREE, canvas, field, shadowEl: shadow, maxLobes: MAX_LOBES, onAnimationFrame });
    const rect = stage.getBoundingClientRect();
    aspect = rect.width / Math.max(rect.height, 1);
    renderer.setViewport(rect.width, rect.height);
    measureGround();
    renderer.requestRender();
    renderer.settle(2);

    resizeObserver = new ResizeObserver(() => {
      const box = stage.getBoundingClientRect();
      const newAspect = box.width / Math.max(box.height, 1);
      if (field.count() > 0 && Math.abs(newAspect - aspect) > 1e-6) {
        const doc = field.toJSON();
        field.fromJSON({ ...doc, lobes: doc.lobes.map((lobe) => reaspectLobe(lobe, aspect, newAspect)) });
      }
      aspect = newAspect;
      renderer.setViewport(box.width, box.height);
      measureGround();
    });
    resizeObserver.observe(stage);
  }

  const ready = init();

  // Keeps a stretched tip inside the canvas box. lobes.js clamps the tip to
  // the GROUND plane but knows nothing about the stage's side walls, and the
  // canvas rasterizes nothing outside its own box: without this a child who
  // pulls an arm toward the edge of the table watches it get sliced clean off
  // and end up somewhere they can no longer grab it back from. The margin is a
  // generous over-estimate of the tip radius at full stretch (~0.24 * rest
  // radius), so the rounded end of the limb stays fully on screen too.
  function clampTipToStage(tipX, tipY, restRadius) {
    const margin = restRadius * 0.3;
    return {
      x: clamp(tipX, -aspect + margin, aspect - margin),
      y: clamp(tipY, -1 + margin, 1 - margin),
    };
  }

  // Keeps a dragged BALL's centre on the canvas. The pulled-tip version of
  // this (clampTipToStage) has existed since limbs shipped; the move path
  // never got it, and that was a trap: the canvas element is only as wide as
  // the stage box, so a ball dragged past its edge ends up with its centre
  // outside the element that carries the pointerdown listener. From that
  // moment nothing can pick it up again — it cannot be moved, and it cannot be
  // carried to the bin. It just sits there, on a toy whose entire promise is
  // that everything is reversible. The margin is the ball's own radius, so the
  // whole ball stays on screen rather than merely its centre.
  function clampBallToStage(x, y, restRadius) {
    const margin = restRadius;
    return {
      x: clamp(x, -aspect + margin, aspect - margin),
      y: clamp(y, -1 + margin, 1 - margin),
    };
  }

  // Cone-aware: scores a candidate by (distance from the pointer to its
  // base->tip SEGMENT) / (the taper radius interpolated at the closest point
  // on that segment). Only LOOSE clay is a candidate — a ball that has welded
  // into the lump has dissolved into it and is not a handle any more, and a
  // protrusion is welded to whatever it grew out of from the frame it is born,
  // so it is never loose either. This is the ONE branch that can beat "pull
  // from here", and it is deliberately tight (1.15 of the ball's own radius):
  // a loose ball is a discrete object the child put down, and everything else
  // is a surface to pull from.
  function nearestLooseBall(worldX, worldY) {
    let bestId = null;
    let bestScore = Infinity;
    for (const lobe of field.list()) {
      if (field.isProtrusion(lobe.id)) continue;
      if (field.partners(lobe.id).length > 0) continue;
      const shape = field.shape(lobe.id);
      if (!shape) continue;
      const t = closestSegmentParam(worldX, worldY, shape.x, shape.y, shape.tipX, shape.tipY);
      const closestX = shape.x + (shape.tipX - shape.x) * t;
      const closestY = shape.y + (shape.tipY - shape.y) * t;
      const radiusAtT = shape.ra + (shape.rb - shape.ra) * t;
      const dist = Math.hypot(worldX - closestX, worldY - closestY);
      const score = dist / Math.max(radiusAtT, 1e-6);
      if (score < bestScore) { bestScore = score; bestId = lobe.id; }
    }
    return bestScore < PICK_RADIUS_FACTOR ? bestId : null;
  }

  // THE ONE TRAP THIS MODEL COULD CREATE, AND THE GUARD AGAINST IT.
  // Balls and spawned limbs share one 16-lobe budget, but only balls count
  // toward the four that unlock Decorate. Left alone, a child could spend the
  // budget on three balls and thirteen limbs and then be unable to drop the
  // fourth ball — stuck one step short of the rest of the game.
  //
  // Under reshaping this is a far smaller hole than it was, because the
  // ordinary gesture spends NO budget at all: only a clearly-sideways branch
  // off a long shaft ever mints a primitive, the settle merges masses back
  // together as the creature is worked, and the field itself merges a pair to
  // make room rather than refusing. What is left is this: the branch path
  // keeps its hands off however many slots are still needed to reach four
  // balls. Nothing else is reserved.
  //
  // It is NOT a gate on the gesture any more. A press that cannot spawn simply
  // reshapes instead, which is what the field does anyway when a spawn is
  // unaffordable — the child never learns there was a decision, and there is
  // no refusal anywhere on this path.
  function ballReserve() {
    return Math.max(0, BLOB_BALLS_REQUIRED - field.ballCount());
  }
  function canSpawn() {
    return field.count() + ballReserve() < MAX_LOBES;
  }

  // A targeted undo, NOT a whole-field snapshot restore. field.toJSON() carries
  // no donor ledger (that is a deliberate property of the save format), so
  // reloading a snapshot mid-gesture would silently rebase every borrowed
  // volume and a later squash-back would stop refunding. Each gesture instead
  // knows exactly how to put its own one thing back, and every one of those
  // paths is numerically exact.
  function cancelDrag() {
    if (!activeDrag || !renderer) return;
    const drag = activeDrag;
    activeDrag = null;
    if (drag.mode === 'draw') {
      // A cancelled gesture never happened: the field writes its opening
      // snapshot back and the lump is bit-identical to before the finger
      // landed. This is what pointercancel and a lost window focus resolve to.
      field.cancelPull(drag.id);
    } else if (drag.mode === 'move') {
      field.move(drag.id, drag.startX, drag.startY, drag.startZ, { constrain: false });
    }
    // 'pull' (pending) never touched the field at all, by construction.
    renderer.setQuality('full');
    renderer.requestRender();
    hooks.updateTrashHover?.();
    hooks.onChange?.();
  }

  // Hands the gesture the token the field returned. `id` is the id of the mass
  // that was ALREADY there — nothing has been created — and every later frame
  // of the drag passes that same token back to pullTo().
  function beginDraw(drag, started) {
    drag.mode = 'draw';
    drag.id = started.token;
    drag.grip = started.grip;
  }

  function onPointerDown(event) {
    if (destroyed || !renderer || activeDrag || event.isPrimary === false) return;
    const world = renderer.clientToWorld(event.clientX, event.clientY);

    // Two answers, not three. The protrusion-capture branch that used to sit
    // in front of these is gone: a press on an arm is a press on clay, and
    // clay answers a drag by giving up more clay from exactly that spot.
    //   1. on a ball that has not welded to anything -> move it (loose clay)
    //   2. anywhere else on the clay, arms included -> pull from that spot
    //   3. empty space -> not our gesture at all; don't even preventDefault
    let drag = null;
    const looseId = nearestLooseBall(world.x, world.y);
    if (looseId) {
      const lobe = field.get(looseId);
      drag = {
        pointerId: event.pointerId, id: looseId, mode: 'move', moved: false,
        offsetX: world.x - lobe.x, offsetY: world.y - lobe.y,
        startX: lobe.x, startY: lobe.y, startZ: lobe.z,
        restRadius: lobe.radius,
      };
    } else if (field.raycast(world.x, world.y)) {
      // PENDING: the surface is under the finger, but nothing is created and
      // no clay is borrowed until the press travels past the slop.
      drag = {
        pointerId: event.pointerId, id: null, mode: 'pull', moved: false,
        downClientX: event.clientX, downClientY: event.clientY,
        downWorldX: world.x, downWorldY: world.y,
      };
    }
    if (!drag) return;
    event.preventDefault();
    // A lobe mid-landing-bounce fighting the child's own grab would read as
    // the clay twitching under their finger — ending its animation and
    // settling the transient impact the instant it's picked up hands full,
    // uncontested control to the gesture.
    if (drag.id && animations.has(drag.id)) {
      animations.delete(drag.id);
      field.setImpact(drag.id, 0, 0, 0);
    }
    activeDrag = drag;
    renderer.setQuality('drag');
    if (!hooks.isMuted?.()) sfx.pop();
    hooks.dismissPrompt?.();
  }

  function onPointerMove(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId || !renderer) return;
    event.preventDefault();
    const world = renderer.clientToWorld(event.clientX, event.clientY);

    if (activeDrag.mode === 'pull') {
      const travel = Math.hypot(event.clientX - activeDrag.downClientX, event.clientY - activeDrag.downClientY);
      if (travel < PULL_SLOP_PX) return; // still nothing has happened
      // Taken at the point the finger went DOWN, not at wherever it has got to
      // — the clay has to reshape from the spot the child actually touched.
      const started = field.beginPull(activeDrag.downWorldX, activeDrag.downWorldY);
      if (!started) {
        // There is no clay under that point at all — the finger is on the
        // table. Not a refusal (there is nothing left to refuse): the gesture
        // simply is not ours, and not one byte of state has changed.
        activeDrag = null;
        renderer.setQuality('full');
        hooks.updateTrashHover?.();
        return;
      }
      beginDraw(activeDrag, started);
    }

    if (activeDrag.mode === 'draw') {
      // The finger IS the tip. z is omitted so pullTo() keeps the arm in the
      // plane of its own welded base rather than bending it away from the
      // camera on a purely sideways swipe.
      const tip = clampTipToStage(world.x, world.y, activeDrag.grip);
      const result = field.pullTo(activeDrag.id, tip.x, tip.y);
      if (result.pulled) activeDrag.moved = true;
      // A branch mints a primitive mid-gesture; the reserve guard has to be
      // able to say no to THAT without the gesture noticing, so it is checked
      // where the field can still fall back to reshaping.
      if (result.spawned && !canSpawn()) field.cancelPull(activeDrag.id);
    } else if (activeDrag.mode === 'move') {
      const spot = clampBallToStage(world.x - activeDrag.offsetX, world.y - activeDrag.offsetY, activeDrag.restRadius);
      const result = field.move(activeDrag.id, spot.x, spot.y, undefined, { constrain: true });
      if (result.moved) activeDrag.moved = true;
    }
    renderer.requestRender();
    // Raw pointer, not the clamped lobe position: while something is dragged
    // toward the trash its *visual* position is pinned by the length cap or the
    // stage clamp, so trash hover and the drop decision deliberately follow the
    // finger, not the clay.
    hooks.updateTrashHover?.(event.clientX, event.clientY);
  }

  function onPointerUp(event) {
    if (!activeDrag || event.pointerId !== activeDrag.pointerId || !renderer) return;
    event.preventDefault();
    const drag = activeDrag;
    activeDrag = null;
    const overTrash = hooks.updateTrashHover?.(event.clientX, event.clientY) || false;

    let changed = false;
    if (drag.mode === 'draw') {
      changed = true;
      const state = field.gestureState();
      if (overTrash) {
        // DISCARDED. The child worked this clay and carried it to the bin
        // without ever letting go. A branch is thrown away and its material
        // goes with it, so the parent keeps the size it gave up; a reshape has
        // nothing to throw away (no clay was made, only moved), so binning one
        // means the same thing as changing your mind about it. Reachable for
        // the whole length of the gesture, from the first millimetre onward.
        field.discardPull(drag.id);
        if (!hooks.isMuted?.()) { sfx.unpop(); setTimeout(() => sfx.whoosh(), 70); }
      } else if (state && state.travel <= state.grip * PULL_RELEASE_MIN_GRIPS && !state.spawned) {
        // Pushed back before letting go: the gesture never happened and the
        // lump comes back bit-exactly.
        field.cancelPull(drag.id);
        if (!hooks.isMuted?.()) sfx.unpop();
      } else {
        field.endPull(drag.id);
        if (drag.moved && !hooks.isMuted?.()) sfx.sparkle();
      }
    } else if (drag.mode === 'move') {
      // A ball that never welded is still loose clay and can still be binned.
      changed = drag.moved || overTrash;
      if (overTrash) {
        field.remove(drag.id);
        if (!hooks.isMuted?.()) { sfx.unpop(); setTimeout(() => sfx.whoosh(), 70); }
      } else if (drag.moved && !hooks.isMuted?.()) {
        sfx.sparkle();
      }
    }
    // mode 'pull' that never passed the slop: nothing happened, nothing to
    // say, and nothing to settle — a finger resting on the creature must not
    // make it move at all.

    renderer.setQuality('full');
    renderer.settle(1);
    // The lump takes its set on release, not during the drag: relaxing under
    // the finger would have the clay creeping away from where it was put.
    if (changed) startSettle();
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

  function place(part, { x, y } = {}) {
    const boardX = x ?? part.place[0];
    const boardY = y ?? part.place[1];
    const world = toWorld(boardX, boardY, part.size / 2, aspect);
    const serial = placeSerial++;
    const z = (((serial * 0.37) % 1) - 0.5) * world.radius * 0.5;

    // The renderer (and therefore the ground plane and the client<->world
    // conversions the fall/squash animation needs) may not exist yet this
    // early after load — field creation is synchronous, three.js is not.
    // Fall back to the pre-weight placement rather than let a ball fall with
    // no ground plane measured to catch it.
    if (!renderer) {
      return field.add({ kind: part.id, x: world.x, y: world.y, z, radius: world.radius, color: part.color });
    }

    const restRadius = world.radius;
    const dropY = world.y;
    const { y: restY, supportId } = computeRest(world.x, z, restRadius, dropY);
    const reducedMotion = prefersReducedMotion();
    // The lobe is born where the child let go, NOT at its resting height,
    // whenever it is going to fall. add() evaluates fusion at the position it
    // is given: born at restY it would weld to the body instantly, and the
    // very first frame of the fall would then be yanked back down by the neck
    // constraint that weld just switched on — the ball would twitch instead of
    // dropping. Born at dropY it is unfused (computeRest only stops where
    // contact is below the fuse threshold), falls freely, and welds on arrival
    // exactly the way a hand-placed ball does. Reduced motion has no fall, so
    // it is born at rest.
    const bornY = reducedMotion ? restY : dropY;
    const lobe = field.add({ kind: part.id, x: world.x, y: bornY, z, radius: restRadius, color: part.color });
    if (!lobe) return null;

    if (!reducedMotion) {
      const fallDistance = Math.max(0, dropY - restY);
      // Impact axis is the contact normal: straight up (0,1) for a ground
      // landing (or the no-fall/no-support fallback), or the normalized
      // direction from the supporting lobe's base to this lobe's base when
      // it landed against another piece of clay instead of the table.
      let axisX = 0, axisY = 1;
      if (supportId) {
        const supportLobe = field.get(supportId);
        if (supportLobe) {
          const dx = world.x - supportLobe.x;
          const dy = restY - supportLobe.y;
          const len = Math.hypot(dx, dy);
          if (len > 1e-6) { axisX = dx / len; axisY = dy / len; }
        }
      }
      animations.set(lobe.id, {
        // Skip the fall sub-animation entirely when the drop point was
        // already supported (fallDistance ~ 0) — go straight to the squash
        // bounce, which still plays on every landing regardless of how far
        // it fell.
        phase: fallDistance > 1e-6 ? 'fall' : 'squash',
        x: world.x, z, dropY, restY,
        fallDurationMs: clamp(FALL_DURATION_MIN_MS + fallDistance * FALL_DURATION_PER_UNIT_MS, FALL_DURATION_MIN_MS, FALL_DURATION_MAX_MS),
        elapsedMs: 0,
        axisX, axisY,
      });
      // The settle is owed but not yet due: it starts the frame the last
      // bounce dies, so it relaxes a body that has stopped moving rather than
      // one that is still ringing.
      settlePending = true;
    } else {
      // prefers-reduced-motion — the lobe already sits at restY with no impact
      // record (shading() reads a missing impacts entry as zero), and the
      // settle jumps straight to its end state, which together are byte-for-
      // byte the animated version's END state with the motion itself skipped.
      startSettle();
    }

    renderer.requestRender();
    renderer.settle(2);
    return lobe;
  }

  // Only LOOSE clay can be moved, exactly as under the finger — a welded ball
  // has dissolved into the lump and a protrusion is adjusted, not dragged. The
  // debug hook has to refuse the same things the gesture refuses or it stops
  // being a truthful description of the game.
  function movePiece(id, nx, ny) {
    if (!field.has(id) || field.isProtrusion(id) || field.partners(id).length > 0) return false;
    const world = toWorld(nx, ny, 0, aspect);
    const result = field.move(id, world.x, world.y, undefined, { constrain: true });
    renderer?.requestRender();
    renderer?.settle(1);
    return result.moved;
  }

  // Board-space (y down) -> world delta, the same mapping toBoard()/toWorld()
  // use: x is normalized by stage WIDTH (hence the aspect factor), y by stage
  // HEIGHT and flipped.
  const boardDeltaToWorld = (dx, dy) => ({ wdx: Number(dx) * 2 * aspect, wdy: -Number(dy) * 2 });

  // QLOBE_DEBUG-only. Takes hold of the clay at BOARD point (nx, ny) and
  // reshapes it by a board-space (dx, dy), in `steps` sub-moves so the field
  // sees the same progression a finger produces. It goes through exactly the
  // gesture the pointer path goes through — beginPull, pullTo, endPull — so a
  // driver is never testing a shortcut the child cannot take.
  //
  // THERE IS NO REFUSAL TO REPORT ANY MORE. The only `ok: false` left is
  // 'no-surface', which means the board point is on the table, not on clay.
  function pullAt(nx, ny, dx, dy, steps = 8) {
    if (!renderer) return { ok: false, reason: 'no-renderer' };
    const world = toWorld(nx, ny, 0, aspect);
    const started = field.beginPull(world.x, world.y);
    if (!started) return { ok: false, reason: field.pullRefusal(world.x, world.y) || 'no-surface' };
    const before = field.protrusion(started.lobeId);
    const beforeCount = field.count();
    const { wdx, wdy } = boardDeltaToWorld(dx, dy);
    const n = Math.max(1, Math.round(Number(steps) || 8));
    let result = null;
    for (let i = 1; i <= n; i++) {
      const tip = clampTipToStage(world.x + wdx * (i / n), world.y + wdy * (i / n), started.grip);
      result = field.pullTo(started.id, tip.x, tip.y);
    }
    const state = field.gestureState();
    field.endPull(started.id);
    renderer.requestRender();
    renderer.settle(1); // the programmatic path has no pointerup to settle it
    startSettle();
    const after = field.protrusion(state?.lobeId ?? started.lobeId);
    const board = toBoard(after.tipX, after.tipY, 0, aspect);
    return {
      ok: true,
      // WHICH OF THE TWO THINGS HAPPENED. 'reshape' means the mass under the
      // finger was elongated and NOTHING was created; 'branch' means a
      // clearly-sideways drag off a long shaft spawned one capsule out of the
      // parent's clay. A driver reasoning about the model needs to be able to
      // tell, and a screen-space guess about "near the arm" is exactly the
      // disambiguation this model deleted.
      mode: state?.mode ?? 'reshape',
      grabT: state?.grabT ?? null,
      id: after.id,
      grabbedId: started.lobeId,
      spawned: state?.spawned ?? null,
      created: field.count() - beforeCount,
      color: after ? field.get(after.id)?.color : started.color,
      grip: started.grip,
      // The reshaping semantics, as numbers: how long the mass is now against
      // how long it was, how wide its two ends are, and the tip/shoulder ratio
      // that IS the rounded-elongation read.
      length: after.length,
      lengthBefore: before ? before.length : 0,
      maxLength: after.maxLength,
      elongation: after.elongation,
      ra: after.ra, rb: after.rb, tipRatio: after.tipRatio,
      restRadius: after.restRadius,
      restRadiusBefore: before ? before.restRadius : 0,
      law: after.law,
      tipX: board.nx, tipY: board.ny,
      root: after.root,
    };
  }

  // QLOBE_DEBUG-only. The same gesture, but aimed at a point ALONG a known
  // lobe (t = 0 at its base, 1 at its tip) instead of at a board point. This
  // is how a driver keeps elongating one mass or branches off its shaft
  // without doing pixel maths: pullOnLobe(id, 1, outward) continues the
  // stretch, pullOnLobe(id, 0, outward) pulls the FAR end, pullOnLobe(id, 0.5,
  // sideways) branches. Only the aim is replaced.
  function pullOnLobe(id, t, dx, dy, steps = 8) {
    if (!renderer) return { ok: false, reason: 'no-renderer' };
    const shape = field.shape(id);
    if (!shape) return { ok: false, reason: 'no-lobe' };
    const along = clamp(Number(t) || 0, 0, 1);
    const board = toBoard(
      shape.x + (shape.tipX - shape.x) * along,
      shape.y + (shape.tipY - shape.y) * along,
      0, aspect,
    );
    return pullAt(board.nx, board.ny, dx, dy, steps);
  }

  // QLOBE_DEBUG-only: the bin escape applied to a released spawned mass. Same
  // call the release-over-the-trash path makes — the material is discarded and
  // the parent keeps the loss. There is deliberately no debug verb that
  // re-aims or refunds a released mass, because the child's only way to change
  // one is to reshape it again, which pullAt already is.
  function binPull(id) {
    const ok = field.pinchOff(id);
    if (ok) { renderer?.requestRender(); renderer?.settle(1); startSettle(); }
    return ok;
  }

  // QLOBE_DEBUG-only: force the settle to its end state, and read it back.
  // `finishSettle` is what a driver calls before asserting on geometry, so it
  // is never racing a relaxation that is still a frame from done.
  function finishSettleNow() {
    const done = field.finishSettle();
    if (done) { afterSettle(); renderer?.requestRender(); renderer?.settle(1); }
    return done;
  }

  function lock() {
    cancelDrag();
    canvas.classList.add('is-locked');
  }

  function toBoardJSON() {
    // A save is always taken from a settled creature — the relaxation finishes
    // in well under a second and the Wake Up button is nowhere near that fast
    // — but forcing it here makes that a guarantee rather than a race, so the
    // geometry in the file is the deterministic end state the shelf thumbnail
    // will re-derive.
    field.finishSettle();
    const doc = field.toJSON();
    const boardDoc = {
      format: 'qlobe-clay-lobes',
      version: 4,
      space: 'board',
      // The creature's hand-worked-surface seed. Without it a reloaded blob
      // would re-roll its lumps and the shelf card would not be the creature
      // the child made.
      seed: doc.seed,
      lobes: doc.lobes.map((lobe) => {
        const board = toBoard(lobe.x, lobe.y, lobe.radius, aspect);
        const entry = {
          id: lobe.id, kind: lobe.kind,
          x: round4(board.nx), y: round4(board.ny), z: round4(lobe.z / (2 * aspect)),
          radius: round4(board.nr), color: lobe.color,
        };
        // Same anisotropic mapping toBoard() uses for position (x normalized
        // by stage WIDTH, hence the aspect factor; y by stage HEIGHT, and
        // flipped, since board is down-positive and world is up-positive) —
        // that asymmetry is pre-existing, match it rather than "fix" it, or a
        // stretched lobe would round-trip crooked. Omitted entirely for a
        // resting ball, matching field.toJSON()'s own byte-identical-for-v1
        // behaviour.
        const sx = lobe.sx || 0, sy = lobe.sy || 0, sz = lobe.sz || 0;
        if (Math.hypot(sx, sy, sz) > 0) {
          entry.sx = round4(sx / (2 * aspect));
          entry.sy = round4(-sy / 2);
          entry.sz = round4(sz / (2 * aspect));
        }
        // The chain topology: which lobe this one was pulled out of. Space-
        // independent (it is an id, not a coordinate), so it rides the board
        // conversion untouched, and omitted entirely for a dropped ball.
        if (lobe.root) entry.root = lobe.root;
        // Which shape law derives this lobe's silhouette. Present only on
        // legacy geometry (a creature made before the reshaping model), which
        // is exactly what stops an old blob on the shelf from quietly
        // re-shaping itself into a new one.
        if (lobe.law) entry.law = lobe.law;
        return entry;
      }),
      fused: doc.fused,
    };
    // Carries the ground plane in board-y so a thumbnail rasterizes with the
    // same flat bottom the live stage showed. Omitted when the renderer never
    // measured one (ground plane off), which rasterizeSavedBlob() reads as
    // "render with no ground plane", same as a v1 save always has.
    if (groundWorldY !== null) boardDoc.ground = round4(0.5 - groundWorldY / 2);
    return boardDoc;
  }

  // Covers the tip sphere as well as the base sphere — a stretched limb can
  // reach well outside a base-only box, and a QA driver aiming at "the arm"
  // needs to be able to hit anywhere along it, not just its shoulder.
  function getDebugTargets() {
    if (!renderer) return [];
    const rect = canvas.getBoundingClientRect();
    const pxPerWorldUnit = rect.height / 2;
    return field.list().map((lobe) => {
      const shape = field.shape(lobe.id);
      const base = renderer.worldToClient(lobe.x, lobe.y);
      const baseR = (shape ? shape.ra : lobe.radius) * pxPerWorldUnit;
      const tip = shape ? renderer.worldToClient(shape.tipX, shape.tipY) : base;
      const tipR = (shape ? shape.rb : lobe.radius) * pxPerWorldUnit;
      const minX = Math.min(base.x - baseR, tip.x - tipR);
      const maxX = Math.max(base.x + baseR, tip.x + tipR);
      const minY = Math.min(base.y - baseR, tip.y - tipR);
      const maxY = Math.max(base.y + baseR, tip.y + tipR);
      // The field already names lobes `lobe-N`; prefixing again would report
      // `lobe-lobe-1` to a driver that then cannot look the lobe back up.
      // `kind` no longer changes what pressing here DOES — every rect that is
      // not a loose ball answers a drag with a new pull — but it still tells a
      // driver what the clay under that rect IS, which is what distinguishes a
      // chain (pressed on a 'pull' rect) from a body pull.
      return { id: lobe.id, role: 'neutral', kind: lobe.kind, root: lobe.root ?? null, rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
    });
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelDrag();
    animations.clear(); // a torn-down stage must never keep chaining rAF frames
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
    // Two different counts, and the difference matters. `count` is the lobe
    // budget (body + arms, capped at MAX_LOBES). `ballCount` is how many balls
    // the child has actually dropped from the tray, which is what the four-ball
    // Decorate gate has always meant — pulling arms out of a two-ball body must
    // not fake progress toward it.
    count: () => field.count(),
    ballCount: () => field.ballCount(),
    protrusionCount: () => field.count() - field.ballCount(),
    totalVolume: () => field.totalVolume(),
    hasLobe: (id) => field.has(id),
    movePiece,
    pullAt,
    pullOnLobe,
    binPull,
    finishSettleNow,
    settleState: () => field.settleState(),
    // GRAVITY REST, as a fact a reviewer can read rather than infer from
    // pixels: per welded component, where its clay is (com), the patch of table
    // it stands on (support), how far outside that patch its centre of mass
    // hangs (overhang, negative when it is inside), and whether gravity is
    // finished with it. `angle` is the topple the next settle would apply.
    restState: () => field.restState(),
    // ...and the pose that topple passes through, at parameter u in [0, 1], so
    // a driver can prove the rotation stays rigid without watching frames.
    restPose: (u) => field.restPose(u),
    // WELDS, with the contact each one is HELD to. `contact` below `floor` is
    // the defect this exists to make impossible: a mass levered out of the body
    // it was joined to.
    weldState: () => field.weldState(),
    // The settle's own history, and the two organic-simplification hooks.
    settleLog: () => settleLog.map((entry) => ({ ...entry })),
    mergeCandidate: () => field.mergeCandidate(),
    // Per-lobe shape, which is where the reshaping semantics are actually
    // visible to a reviewer: length against its own maximum, both end radii,
    // and the tip/shoulder ratio that decides the rounded-vs-spiky read.
    lobeShapes: () => field.list().map((lobe) => {
      const p = field.protrusion(lobe.id);
      return {
        id: p.id, kind: p.kind, spawned: p.spawned, law: p.law, color: lobe.color,
        length: p.length, maxLength: p.maxLength, elongation: p.elongation,
        ra: p.ra, rb: p.rb, tipRatio: p.tipRatio, restRadius: p.restRadius,
        settled: p.settled, slack: p.slack, root: p.root,
      };
    }),
    consolidate: () => {
      const reclaimed = field.consolidate();
      if (reclaimed > 0) { renderer?.requestRender(); renderer?.settle(1); }
      return reclaimed;
    },
    noiseSeed: () => field.seed(),
    lock,
    toBoardJSON,
    rawJSON: () => field.toJSON(),
    getDebugTargets,
    stats: () => {
      const base = renderer?.stats() ?? null;
      if (!base) return null;
      // QA needs the measured ground in BOTH spaces: world-y is what the
      // field/renderer actually use, board-y is what a driver reasoning about
      // drop points and saves works in.
      const groundBoardY = groundWorldY === null ? null : toBoard(0, groundWorldY, 0, aspect).ny;
      return { ...base, groundWorldY, groundBoardY };
    },
    // GPU cost probe. A frame interval measured off requestAnimationFrame is
    // pinned to vsync and reads 16.7ms whether the raymarch had headroom to
    // spare or none at all, so it cannot answer the fill-rate question this
    // renderer exists to worry about. renderNow({ sync }) blocks on
    // gl.finish(), which does. Review-only: it stalls the pipeline.
    probe: (frames = 30) => {
      if (!renderer) return null;
      renderer.renderNow({ sync: true }); // warm up, ignore compile/upload
      const started = performance.now();
      for (let i = 0; i < frames; i++) renderer.renderNow({ sync: true });
      const total = performance.now() - started;
      const stats = renderer.stats();
      return { frames, msPerFrame: total / frames, lobes: field.count(), buffer: [stats.bufferWidth, stats.bufferHeight], pixelRatio: stats.pixelRatio };
    },
    destroy,
  };
}

// The shelf/alive-screen thumbnail path. One detached canvas, one field, one
// renderer — created lazily on first use and kept for the rest of the
// session so every saved-blob card reuses the same two-context budget rather
// than opening and leaking a WebGL context per card.
let rasterState = null;

async function ensureRasterizer() {
  if (rasterState) return rasterState;
  const THREE = await loadThree();
  const canvas = document.createElement('canvas');
  const field = createLobeField({ maxLobes: MAX_LOBES });
  const renderer = createLobeRenderer({ THREE, canvas, field, maxLobes: MAX_LOBES });
  rasterState = { field, renderer };
  return rasterState;
}

/**
 * Rasterizes a saved board-space blob doc (see `toBoardJSON()`) at the given
 * display box size and returns a data URL. Never throws into a caller that
 * forgets to catch — callers rasterizing several shelf cards must still await
 * this one at a time (the field/renderer above are a shared singleton).
 *
 * v1 (no sx/sy/sz, no ground), v2 (stretch vectors, ground), v3 (seed, chain
 * roots) and v4 (shape law) board docs all load here. The DECLARED VERSION is
 * forwarded untouched, because it is what tells the field whether a stretched
 * lobe with no `law` of its own is legacy taper geometry or new reshaped clay
 * — hard-coding a version here would retro-morph every creature made before
 * the reshaping model into a differently-shaped one on its own shelf card. Every added field is read only when
 * present, and the two pieces of shared-singleton state are EXPLICITLY reset
 * rather than left at whatever a previous card's rasterize set on them: the
 * ground plane (a v1 save never had one and must keep rendering exactly as it
 * always has) and the noise seed (an older save gets the CONSTANT default, so
 * it renders with the same hand-worked surface every single time it is opened
 * instead of inheriting the seed of whichever creature was drawn before it).
 */
export async function rasterizeSavedBlob(boardDoc, displayWidth, displayHeight) {
  const { field, renderer } = await ensureRasterizer();
  const aspect = displayWidth / Math.max(displayHeight, 1);
  const ok = field.fromJSON({
    format: 'qlobe-clay-lobes',
    version: Number.isFinite(Number(boardDoc.version)) ? Number(boardDoc.version) : 1,
    seed: Number.isFinite(Number(boardDoc.seed)) ? Number(boardDoc.seed) : DEFAULT_NOISE_SEED,
    lobes: (boardDoc.lobes || []).map((lobe) => {
      const world = toWorld(lobe.x, lobe.y, lobe.radius, aspect);
      const entry = { id: lobe.id, kind: lobe.kind, x: world.x, y: world.y, z: lobe.z * 2 * aspect, radius: world.radius, color: lobe.color };
      if (typeof lobe.root === 'string' && lobe.root) entry.root = lobe.root;
      if (typeof lobe.law === 'string' && lobe.law) entry.law = lobe.law;
      // Inverse of toBoardJSON()'s sbx = sx/(2*aspect), sby = -sy/2 mapping.
      // Present only on a v2 save whose lobe was actually stretched.
      if (lobe.sx !== undefined || lobe.sy !== undefined || lobe.sz !== undefined) {
        const boardSx = lobe.sx || 0, boardSy = lobe.sy || 0, boardSz = lobe.sz || 0;
        entry.sx = boardSx * 2 * aspect;
        entry.sy = -boardSy * 2;
        entry.sz = boardSz * 2 * aspect;
      }
      return entry;
    }),
    fused: boardDoc.fused || [],
  });
  if (!ok) throw new Error('invalid saved blob composition');
  if (typeof boardDoc.ground === 'number' && Number.isFinite(boardDoc.ground)) {
    // Inverse of toBoardJSON()'s `0.5 - groundWorldY / 2`.
    field.setGround((0.5 - boardDoc.ground) * 2);
  } else {
    field.setGround(null);
  }
  renderer.setViewport(displayWidth, displayHeight);
  return renderer.toDataURL('image/png');
}
