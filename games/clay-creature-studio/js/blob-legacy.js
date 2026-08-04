// blob-legacy.js — turns an OLD blob-lobes.js save (v1-v4, `format:
// 'qlobe-clay-lobes'`) into an approximating op sequence the STORED FIELD
// (shared/js/clay/field.js) can replay. blob-field.js's `fieldFromAnyDoc` is
// the only caller: a v5 save replays directly, anything older comes through
// here first (see field-fromAnyDoc in blob-field.js and its header comment).
//
// NO IMPORTS. This file must be loadable in node through a bare data URL, the
// way every test suite in shared/js/clay/ loads its subject — see
// shared/js/clay/field.test.mjs and heightfield.test.mjs. That also means the
// two small numeric helpers below (`r6`, `clamp`) and the `PULL_STEP_CAP`
// constant are COPIES of the ones in field.js, not references to them. Keep
// them in step by hand if field.js's ever change; a silent drift here would
// make a converted creature's pulls violate the very cap field.js enforces on
// a live drag.
//
//
// WHAT THIS PRESERVES, AND WHAT IT DOES NOT
//
// A v1-v4 save is a LIST of lobes: balls, some plain, some stretched into a
// tapered capsule by a stored (sx, sy, sz) vector. The field has no such
// list and no such taper — it only has stamps (weld a ball) and pulls (drag
// material). So converting a lobe is: stamp its BASE ball, then, if it was
// stretched, replay the drag that a child's finger would have made to
// produce that stretch, as a short run of pulls walking outward along the
// stored vector.
//
// PRESERVED: each lobe's position, size and colour; the ground plane; the
// creature's noise seed (so the hand-worked surface looks the same); and,
// for a stretched lobe, the AXIS and rough proportion of the limb it grew —
// a long thin arm still reads as a long thin arm.
//
// NOT PRESERVED, on purpose:
//   * The exact taper law of the old cone. lobes.js's taper (see
//     blob-lobes.js's `law`/`ra`/`rb`/`elongation`) has no equivalent here —
//     a pull thins material by moving it, not by evaluating a shape formula
//     along a shaft — so the converted limb's silhouette is a close
//     approximation, not a re-derivation, of the original.
//   * Per-lobe identity. This is the INTENDED change the whole field engine
//     exists to make (see field.js's own header): "the green clay should now
//     be a part of the whole and behave accordingly, not have an atomic
//     identity." A reloaded legacy creature gets that behaviour immediately —
//     there is no lobe list to reconstruct even if we wanted to, and we do
//     not want to: a shelf card that came back leverable would be a
//     regression, not a compatibility feature.
//   * The exact tip radius. The old cone's taper conserved nothing in
//     particular at the tip; a pull conserves VOLUME over the region it
//     touches (see field.js's renormalizeRegion), which is a different
//     invariant and lands on a different, but visually close, tip.
//
// NEVER emits `k: 'ball'` on a converted stamp. That tag is what
// blob-field.js's Decorate gate counts (BALL_TAG, countStamps) — it exists
// to answer "how many balls has THIS CHILD, in THIS SESSION, dropped from
// the tray". A creature loaded from a save has already passed that gate once
// (or the game would never have let it be saved); tagging a converted stamp
// as a tray ball would let a reloaded shelf card claim fresh progress it did
// not earn, and would double the count if the child then also plays through
// the shape phase again on a duplicate.
//
// NOT HANDLED HERE: legacy SPRITE saves. The oldest compositions this game
// ever wrote are a `board.items` array with `meta.ball` flags and no `blob`
// key at all (see main.js) — flat 2-D sprite art, never 3-D geometry of any
// kind. They still render exactly as they always have, as their own sprite
// art, and converting them to clay ops would be inventing a body and a depth
// the child never made. `isLegacyBlobDoc` correctly returns false for one of
// these (no `format`/`lobes` at all), and callers must keep routing them
// through the sprite path rather than this one.

/** Copy of field.js's q6/r6: quantise to 1e-6 so the log tells the truth. */
const r6 = (n) => Math.round(n * 1e6) / 1e6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/**
 * Copy of field.js's PULL_STEP_CAP. A pull step may not displace material
 * further than this fraction of the brush radius (past that the backward-
 * advection map folds and tears — see field.js for the full explanation).
 * Hard-coded, not imported, because this module carries NO imports at all.
 *
 * A COPY THAT WENT STALE ONCE ALREADY, so it is now pinned by a test. When the
 * pull falloff gained its rigid palm (field.js's PULL_CORE) the real cap came
 * down with it, and this number did not — which meant every step this converter
 * measured out was nearly twice what field.pull() would actually carry, so the
 * engine silently shortened each one and old saves reconstructed visibly
 * stubbier than the creatures the children had made. blob-legacy.test.mjs now
 * asserts these two numbers are equal, because nothing about a legacy save
 * failing to look like itself would have shown up any other way.
 */
const PULL_STEP_CAP = 0.187;

/** A ball this small or smaller was never a deliberate placement; treat a
 * missing/garbage radius as this instead of refusing the whole lobe. */
const DEFAULT_BOARD_RADIUS = 0.08;

/** field.js's own parseColor() fallback, so an unreadable colour is at
 * least the same greige an unrecognised colour gets everywhere else. */
const DEFAULT_COLOR = '#cccccc';

/** A pull's brush is clamped to at least this many world units... */
const MIN_BRUSH = 0.05;
/** ...and at most this many, so a corrupt/huge stored radius cannot make a
 * single pull try to cover most of the field's own 2.0-unit domain. */
const MAX_BRUSH = 1.0;

/**
 * '#rrggbb' | '#rgb' (with or without the leading '#') -> a lower-case
 * '#rrggbb' string. Anything else (missing, a number, a bad string) becomes
 * DEFAULT_COLOR rather than throwing — a corrupt localStorage entry must
 * lose one shelf card's colour accuracy, never crash the shelf.
 */
function normalizeColor(input) {
  if (typeof input === 'string') {
    const s = input.trim();
    if (/^#?[0-9a-fA-F]{6}$/.test(s)) {
      const hex = s[0] === '#' ? s.slice(1) : s;
      return `#${hex.toLowerCase()}`;
    }
    if (/^#?[0-9a-fA-F]{3}$/.test(s)) {
      const hex = s[0] === '#' ? s.slice(1) : s;
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase();
    }
  }
  return DEFAULT_COLOR;
}

/** True only for a v1-v4 lobe document. False for anything else, including
 * null/undefined, a v5 field document, and a legacy sprite composition. */
export function isLegacyBlobDoc(doc) {
  return !!doc && doc.format === 'qlobe-clay-lobes' && Array.isArray(doc.lobes);
}

/**
 * Convert a legacy (board-space) blob-lobes.js document into an op sequence
 * the field can replay.
 *
 * @param {object} doc a v1-v4 `qlobe-clay-lobes` document
 * @param {object} [opts]
 * @param {number} [opts.aspect]    the stage aspect the doc's board space was
 *                                  written against (width/height)
 * @param {number} [opts.viewScale] the field's viewScaleFor(aspect) at load
 *                                  time — see blob-field.js
 * @returns {{seed:number, ground:number|null, ops:Array}|null} null if `doc`
 *   is not a legacy blob document at all; otherwise always a usable result
 *   (an empty `lobes` array converts to `{ ops: [] }`, never null).
 */
export function legacyToOps(doc, { aspect = 1, viewScale = 1 } = {}) {
  if (!isLegacyBlobDoc(doc)) return null;
  const asp = Number.isFinite(Number(aspect)) && Number(aspect) > 0 ? Number(aspect) : 1;
  const vs = Number.isFinite(Number(viewScale)) && Number(viewScale) > 0 ? Number(viewScale) : 1;

  // `seed` only exists from v3 onward (DEFAULT_NOISE_SEED in the old engine
  // was 1337 — see blob-lobes.js) — an older save simply never recorded one,
  // so a missing/garbage seed defaults to the same constant the old engine
  // itself defaulted to, not to some new value that would re-roll the
  // creature's hand-worked surface on every load.
  const seed = Number.isFinite(Number(doc.seed)) ? (Number(doc.seed) | 0) : 1337;

  // `ground` only exists from v2 onward, and rides the save ENVELOPE rather
  // than the op log in both formats — see field.js's toDocument()/setGround
  // comments: the ground is a property of the stage the creature is being
  // shown on, not of the creature itself, so it is applied once before a
  // replay rather than baked into an op.
  let ground = null;
  if (Number.isFinite(Number(doc.ground))) {
    // Inverse of blob-lobes.js's toBoardJSON(): `ground = 0.5 -
    // groundWorldY/2` in the OLD (no viewScale) world, then scaled into the
    // new one exactly like every other coordinate below.
    ground = r6((0.5 - Number(doc.ground)) * 2 * vs);
  }

  const ops = [];
  const lobes = Array.isArray(doc.lobes) ? doc.lobes : [];

  for (const lobe of lobes) {
    // A genuinely broken array entry (null, a string, whatever a corrupt
    // localStorage write left behind) costs this ONE lobe, never the rest of
    // the creature and never a thrown error up to the shelf.
    if (!lobe || typeof lobe !== 'object') continue;

    const nx = Number.isFinite(Number(lobe.x)) ? Number(lobe.x) : 0.5;
    const ny = Number.isFinite(Number(lobe.y)) ? Number(lobe.y) : 0.5;
    const boardZ = Number.isFinite(Number(lobe.z)) ? Number(lobe.z) : 0;
    const nr = Number.isFinite(Number(lobe.radius)) && Number(lobe.radius) > 0
      ? Number(lobe.radius)
      : DEFAULT_BOARD_RADIUS;
    // `fused`, `root` and `law` (see blob-lobes.js's toBoardJSON) carry chain
    // topology and shape-law metadata that only ever meant something to the
    // old lobe list. The field has no concept of either — everything is
    // fused now, by design — so they are read never, not even for a comment
    // in the emitted op.
    const color = normalizeColor(lobe.color);

    // BOARD -> OLD WORLD -> NEW WORLD in one step: the anisotropic board
    // mapping toBoardJSON() used (x normalized by stage WIDTH, hence the
    // aspect factor; y by stage HEIGHT, and flipped, since board is down-
    // positive and world is up-positive), then the ONE extra factor that
    // separates the old world from the new one — viewScale (see
    // viewScaleFor() in blob-field.js). Every coordinate below is scaled by
    // the SAME viewScale, which is exactly what keeps the whole converted
    // creature sitting at the same relative place and size on the new,
    // isotropic stage as it did on the old, anisotropic one.
    const wx = r6((nx - 0.5) * 2 * asp * vs);
    const wy = r6((0.5 - ny) * 2 * vs);
    const wz = r6(boardZ * 2 * asp * vs);
    const wr = r6(nr * 2 * asp * vs);

    ops.push({ t: 's', x: wx, y: wy, z: wz, r: wr, c: color });

    // A stretch vector is present ONLY on a lobe that was ever pulled (see
    // toBoardJSON(): `sx/sy/sz` are omitted entirely for a resting ball).
    // Missing means "never stretched", not "stretched by zero" — treat any
    // absent/non-finite component as 0, matching the old engine's own
    // `lobe.sx || 0` reads.
    const boardSx = Number.isFinite(Number(lobe.sx)) ? Number(lobe.sx) : 0;
    const boardSy = Number.isFinite(Number(lobe.sy)) ? Number(lobe.sy) : 0;
    const boardSz = Number.isFinite(Number(lobe.sz)) ? Number(lobe.sz) : 0;

    if (boardSx !== 0 || boardSy !== 0 || boardSz !== 0) {
      // Same anisotropic-then-viewScale round trip as position, but inverse
      // of toBoardJSON()'s own stretch mapping (`sbx = sx/(2*aspect), sby =
      // -sy/2, sbz = sz/(2*aspect)`): sx/sz carry the aspect factor (board x
      // and z are normalized by stage WIDTH); sy does not (board y is
      // normalized by stage HEIGHT, which every aspect already shares, and
      // is sign-flipped for the same up/down reason position is).
      const worldSx = boardSx * 2 * asp * vs;
      const worldSy = -boardSy * 2 * vs;
      const worldSz = boardSz * 2 * asp * vs;
      const length = Math.hypot(worldSx, worldSy, worldSz);

      if (length > 1e-9) {
        // THE DRAG A CHILD WOULD HAVE MADE. field.js has no "set the taper"
        // verb — the only way material moves is a pull — so a stretched
        // lobe is reproduced as the run of pulls that would have dragged its
        // base ball out into (approximately) that same stretch. The brush
        // is sized off the BASE ball, same as blob-field.js's own drag brush
        // is sized off the creature rather than the pointer (see PULL_BRUSH
        // there): a bigger ball got a bigger, more confident drag.
        const brush = r6(clamp(wr * 0.9, MIN_BRUSH, MAX_BRUSH));
        // field.js's pull() caps a single advection's displacement at
        // PULL_STEP_CAP of the brush or the material folds and tears (see
        // field.js). A pointer drag never has to think about this — it
        // naturally arrives as many small pointermove steps — so a
        // synthetic conversion has to do on purpose what a finger does for
        // free: chop the total stretch into steps no longer than that cap.
        const capStep = brush * PULL_STEP_CAP;
        const steps = Math.max(1, Math.ceil(length / capStep));

        // ONE per-step delta, computed once and reused for every step — the
        // same delta a steady real drag would produce, not a delta that
        // drifts step to step. Rounded once, to the log's own 6-decimal
        // precision, rather than left at full float precision and rounded
        // later: field.js's own quantise-then-execute (q6) would round it
        // identically on replay anyway, so this is the exact number that
        // will run.
        const stepDx = r6(worldSx / steps);
        const stepDy = r6(worldSy / steps);
        const stepDz = r6(worldSz / steps);

        // The `from` point WALKS WITH THE MATERIAL, exactly as a real drag's
        // grab point does (see blob-field.js's pullToward, which advances
        // `drag.grab` by the same step it just pulled) — starting at the
        // lobe's own base centre, not at some fixed anchor the pulls all
        // repeat from.
        let fx = wx;
        let fy = wy;
        let fz = wz;
        for (let i = 0; i < steps; i++) {
          ops.push({ t: 'p', x: r6(fx), y: r6(fy), z: r6(fz), dx: stepDx, dy: stepDy, dz: stepDz, b: brush });
          fx += stepDx;
          fy += stepDy;
          fz += stepDz;
        }
      }
    }
  }

  return { seed, ground, ops };
}
