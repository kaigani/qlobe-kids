// heightfield.js — a dependency-free 2.5D mass-conserving clay field.
//
// The field stores material HEIGHT per cell, not colour. Nothing here paints
// pixels; every editing verb TRANSPORTS material from one place to another
// (or, for a couple of clearly-marked verbs, adds it from nowhere). That
// distinction is the whole point of the model: a press leaves a dent that is
// still there after ten unrelated edits, because the material that used to
// sit there was pushed out to a rim rather than erased. Total volume is
// therefore approximately conserved by `press`, `smear`, `roll` and `relax`
// (each asserts this to a relative drift under 1e-6 in the test) — it is
// only `addBall`, `addSlab` and `depositPath` that are material SOURCES:
// they stamp new dough onto the field from outside the simulation and do
// NOT conserve volume. Every source method is documented as such below.
//
// This is a 2.5D model — one height value per (x, y) cell — so it can
// represent top-down dough or a front-facing blob, but never an overhang or
// a tunnel. That is a deliberate simplification, not a bug.
//
// `revision` is a monotonic counter, bumped once per call that actually
// changed a cell. A renderer — `./heightfield-canvas.js` is the house one —
// compares it against the value it last drew and skips work when nothing
// moved: render-on-demand, not render-every-frame.
//
// This module is intentionally dependency-free: no imports, no DOM, no
// browser API. It runs equally under a `<script type="module">` game and
// under plain node (see heightfield.test.mjs), which is what lets the exact
// same numerics be exercised by a fast, deterministic test.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Resamples a polyline of {x, y} field-space points so consecutive samples
// are `spacing` cells apart, walking each segment and carrying leftover
// distance into the next one. This is what turns a handful of pointermove
// samples from a fast drag into a continuous trail of press/deposit points
// instead of a string of separate beads with gaps between them. The first
// input point is always included; a single-point polyline resamples to
// just that one point (a tap).
function resamplePolyline(points, spacing) {
  if (!points || points.length === 0) return [];
  const result = [{ x: points[0].x, y: points[0].y }];
  if (points.length === 1) return result;

  let distanceSincePrev = 0;
  let prev = points[0];
  for (let i = 1; i < points.length; i += 1) {
    let segStart = prev;
    const segEnd = points[i];
    let segLen = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
    while (segLen > 0 && distanceSincePrev + segLen >= spacing) {
      const remaining = spacing - distanceSincePrev;
      const t = remaining / segLen;
      const point = {
        x: segStart.x + (segEnd.x - segStart.x) * t,
        y: segStart.y + (segEnd.y - segStart.y) * t,
      };
      result.push(point);
      segStart = point;
      segLen = Math.hypot(segEnd.x - segStart.x, segEnd.y - segStart.y);
      distanceSincePrev = 0;
    }
    distanceSincePrev += segLen;
    prev = segEnd;
  }

  const last = result[result.length - 1];
  const finalPoint = points[points.length - 1];
  if (Math.hypot(finalPoint.x - last.x, finalPoint.y - last.y) > 1e-6) {
    result.push({ x: finalPoint.x, y: finalPoint.y });
  }
  return result;
}

export class HeightfieldClay {
  /**
   * @param {number} [width] field width in cells.
   * @param {number} [height] field height in cells.
   */
  constructor(width = 192, height = 128) {
    this.width = width;
    this.height = height;
    this.cells = new Float32Array(width * height);
    this.delta = new Float32Array(width * height);
    this.revision = 0;
  }

  /**
   * @param {number} x cell column.
   * @param {number} y cell row.
   * @returns {number} the flat index into `cells`/`delta` for (x, y).
   */
  index(x, y) {
    return y * this.width + x;
  }

  /**
   * @param {number} x field-space x, rounded and clamped to the field.
   * @param {number} y field-space y, rounded and clamped to the field.
   * @returns {number} material height at the nearest cell.
   */
  heightAt(x, y) {
    const ix = clamp(Math.round(x), 0, this.width - 1);
    const iy = clamp(Math.round(y), 0, this.height - 1);
    return this.cells[this.index(ix, iy)];
  }

  /**
   * @returns {number} the sum of every cell's height — the field's volume,
   * in cell-height units. Used to assert conservation.
   */
  totalVolume() {
    let total = 0;
    for (let index = 0; index < this.cells.length; index += 1) total += this.cells[index];
    return total;
  }

  /**
   * Zeroes the field and stamps a starting lump of dough onto it. A material
   * source (via addBall/addSlab), so volume before and after is not
   * meaningful to compare — this is a fresh start, not an edit.
   * @param {'slab'|'balls'} [preset] which starting shape to lay down.
   * @returns {void}
   */
  reset(preset = 'slab') {
    this.cells.fill(0);
    if (preset === 'balls') {
      this.addBall(this.width * .38, this.height * .48, 27, 7.1);
      this.addBall(this.width * .56, this.height * .43, 25, 6.6);
      this.addBall(this.width * .60, this.height * .62, 23, 6.2);
      this.addBall(this.width * .43, this.height * .66, 22, 5.9);
      this.relax(5, .055, .1);
    } else {
      this.addSlab(this.width * .5, this.height * .53, this.width * .35, this.height * .31, 5.6);
    }
    this.revision += 1;
  }

  /**
   * Stamps a hemispherical dome of material, max-blended with what is
   * already there. A material SOURCE — it does not conserve volume; it adds
   * dough from outside the simulation. Bumps `revision` only if a cell
   * actually rose.
   * @param {number} cx dome centre x, field-space.
   * @param {number} cy dome centre y, field-space.
   * @param {number} radius dome radius, in cells.
   * @param {number} peak dome height at its centre.
   * @returns {boolean} true if any cell changed.
   */
  addBall(cx, cy, radius, peak) {
    const minX = Math.max(1, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 2, Math.ceil(cx + radius));
    const minY = Math.max(1, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 2, Math.ceil(cy + radius));
    let changed = false;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = (x - cx) / radius;
        const dy = (y - cy) / radius;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= 1) continue;
        const dome = Math.sqrt(1 - distanceSquared) * peak;
        const index = this.index(x, y);
        const previous = this.cells[index];
        const next = Math.max(previous, dome);
        if (next !== previous) {
          this.cells[index] = next;
          changed = true;
        }
      }
    }
    if (changed) this.revision += 1;
    return changed;
  }

  /**
   * Stamps a rounded rectangular slab of material, max-blended with what is
   * already there. A material SOURCE — it does not conserve volume. Bumps
   * `revision` only if a cell actually rose.
   * @param {number} cx slab centre x, field-space.
   * @param {number} cy slab centre y, field-space.
   * @param {number} radiusX slab half-width, in cells.
   * @param {number} radiusY slab half-height, in cells.
   * @param {number} peak slab height at its centre.
   * @returns {boolean} true if any cell changed.
   */
  addSlab(cx, cy, radiusX, radiusY, peak) {
    const minX = Math.max(1, Math.floor(cx - radiusX));
    const maxX = Math.min(this.width - 2, Math.ceil(cx + radiusX));
    const minY = Math.max(1, Math.floor(cy - radiusY));
    const maxY = Math.min(this.height - 2, Math.ceil(cy + radiusY));
    let changed = false;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const dx = (x - cx) / radiusX;
        const dy = (y - cy) / radiusY;
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= 1) continue;
        const edge = smoothstep(0, .22, 1 - distanceSquared);
        const crown = .9 + .1 * (1 - distanceSquared);
        const index = this.index(x, y);
        const previous = this.cells[index];
        const next = Math.max(previous, peak * edge * crown);
        if (next !== previous) {
          this.cells[index] = next;
          changed = true;
        }
      }
    }
    if (changed) this.revision += 1;
    return changed;
  }

  /**
   * Pushes material straight down under a fingertip and redistributes the
   * displaced volume onto a rim around it, so the dent persists rather than
   * being repainted away by the next edit. Volume-conserving.
   * @param {number} cx press centre x, field-space.
   * @param {number} cy press centre y, field-space.
   * @param {number} [radius] press radius, in cells.
   * @param {number} [depth] maximum depth removed at the centre.
   * @returns {boolean} true if the field changed.
   */
  press(cx, cy, radius = 11, depth = .28) {
    const minX = Math.max(1, Math.floor(cx - radius * 1.65));
    const maxX = Math.min(this.width - 2, Math.ceil(cx + radius * 1.65));
    const minY = Math.max(1, Math.floor(cy - radius * 1.65));
    const maxY = Math.min(this.height - 2, Math.ceil(cy + radius * 1.65));
    let removed = 0;

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.08, 1, distance);
        const index = this.index(x, y);
        const amount = Math.min(this.cells[index], depth * weight);
        this.cells[index] -= amount;
        removed += amount;
      }
    }

    if (removed <= 0) return false;
    let weightTotal = 0;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance <= .88 || distance >= 1.58) continue;
        weightTotal += Math.sin(((distance - .88) / .7) * Math.PI);
      }
    }
    if (weightTotal <= 0) {
      this.cells[this.index(Math.round(cx), Math.round(cy))] += removed;
      return false;
    }
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance <= .88 || distance >= 1.58) continue;
        const weight = Math.sin(((distance - .88) / .7) * Math.PI);
        this.cells[this.index(x, y)] += removed * weight / weightTotal;
      }
    }
    this.revision += 1;
    return true;
  }

  /**
   * Drags a pocket of material from one point toward another, bilinearly
   * depositing what it picks up. Volume-conserving.
   * @param {number} fromX drag start x, field-space.
   * @param {number} fromY drag start y, field-space.
   * @param {number} toX drag end x, field-space.
   * @param {number} toY drag end y, field-space.
   * @param {number} [radius] pickup radius, in cells.
   * @param {number} [strength] fraction of each cell's height picked up.
   * @returns {boolean} true if the field changed.
   */
  smear(fromX, fromY, toX, toY, radius = 12, strength = .34) {
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.hypot(dx, dy) < .02) return false;
    this.delta.fill(0);
    const minX = Math.max(1, Math.floor(fromX - radius));
    const maxX = Math.min(this.width - 2, Math.ceil(fromX + radius));
    const minY = Math.max(1, Math.floor(fromY - radius));
    const maxY = Math.min(this.height - 2, Math.ceil(fromY + radius));
    let moved = 0;

    const deposit = (x, y, amount) => {
      const targetX = clamp(x, 1, this.width - 2.001);
      const targetY = clamp(y, 1, this.height - 2.001);
      const x0 = Math.floor(targetX);
      const y0 = Math.floor(targetY);
      const tx = targetX - x0;
      const ty = targetY - y0;
      this.delta[this.index(x0, y0)] += amount * (1 - tx) * (1 - ty);
      this.delta[this.index(x0 + 1, y0)] += amount * tx * (1 - ty);
      this.delta[this.index(x0, y0 + 1)] += amount * (1 - tx) * ty;
      this.delta[this.index(x0 + 1, y0 + 1)] += amount * tx * ty;
    };

    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - fromX, y - fromY) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.18, 1, distance);
        const index = this.index(x, y);
        const amount = this.cells[index] * strength * weight;
        if (amount <= 0) continue;
        this.delta[index] -= amount;
        deposit(x + dx * .92, y + dy * .92, amount);
        moved += amount;
      }
    }
    if (moved <= 0) return false;
    for (let index = 0; index < this.cells.length; index += 1) {
      this.cells[index] = Math.max(0, this.cells[index] + this.delta[index]);
    }
    this.revision += 1;
    return true;
  }

  /**
   * Pulls material in a neighbourhood toward its own weighted mean, i.e.
   * flattens a rolling pin over it, with a correction term that keeps the
   * neighbourhood's own volume fixed. Volume-conserving.
   * @param {number} cx roll centre x, field-space.
   * @param {number} cy roll centre y, field-space.
   * @param {number} [radius] roll radius, in cells.
   * @param {number} [strength] fraction of the way each cell moves toward the mean.
   * @returns {boolean} true if the field changed.
   */
  roll(cx, cy, radius = 14, strength = .42) {
    const minX = Math.max(1, Math.floor(cx - radius));
    const maxX = Math.min(this.width - 2, Math.ceil(cx + radius));
    const minY = Math.max(1, Math.floor(cy - radius));
    const maxY = Math.min(this.height - 2, Math.ceil(cy + radius));
    let weightedHeight = 0;
    let weightTotal = 0;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.45, 1, distance);
        weightedHeight += this.cells[this.index(x, y)] * weight;
        weightTotal += weight;
      }
    }
    if (weightTotal <= 0 || weightedHeight <= 0) return false;
    const mean = weightedHeight / weightTotal;
    let changeTotal = 0;
    this.delta.fill(0);
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.45, 1, distance);
        const index = this.index(x, y);
        const change = (mean - this.cells[index]) * strength * weight;
        this.delta[index] = change;
        changeTotal += change;
      }
    }
    const correction = -changeTotal / weightTotal;
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const distance = Math.hypot(x - cx, y - cy) / radius;
        if (distance >= 1) continue;
        const weight = 1 - smoothstep(.45, 1, distance);
        const index = this.index(x, y);
        this.cells[index] = Math.max(0, this.cells[index] + this.delta[index] + correction * weight);
      }
    }
    this.revision += 1;
    return true;
  }

  /**
   * Lets material creep downhill between neighbouring cells for one or more
   * iterations, like dough settling under its own weight. Volume-conserving.
   * @param {number} [iterations] number of relaxation passes.
   * @param {number} [rate] fraction of the excess above `yieldThreshold` that flows per pass.
   * @param {number} [yieldThreshold] height difference below which cells do not flow.
   * @returns {void}
   */
  relax(iterations = 1, rate = .035, yieldThreshold = .18) {
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      this.delta.fill(0);
      for (let y = 1; y < this.height - 1; y += 1) {
        for (let x = 1; x < this.width - 1; x += 1) {
          const index = this.index(x, y);
          const right = this.index(x + 1, y);
          const down = this.index(x, y + 1);
          this.flowPair(index, right, rate, yieldThreshold);
          this.flowPair(index, down, rate, yieldThreshold);
        }
      }
      for (let index = 0; index < this.cells.length; index += 1) {
        this.cells[index] = Math.max(0, this.cells[index] + this.delta[index]);
      }
    }
    if (iterations > 0) this.revision += 1;
  }

  /**
   * Moves a yield-limited amount of material from one cell to another into
   * `delta` (does not touch `cells` directly). Internal helper used by
   * `relax`'s neighbour sweep.
   * @param {number} first flat index of the first cell.
   * @param {number} second flat index of the second cell.
   * @param {number} rate fraction of the excess above `yieldThreshold` that flows.
   * @param {number} yieldThreshold height difference below which nothing flows.
   * @returns {void}
   */
  flowPair(first, second, rate, yieldThreshold) {
    const difference = this.cells[first] - this.cells[second];
    if (Math.abs(difference) <= yieldThreshold) return;
    const amount = Math.sign(difference) * (Math.abs(difference) - yieldThreshold) * rate;
    this.delta[first] -= amount;
    this.delta[second] += amount;
  }

  /**
   * Zeroes every cell. Bumps `revision` unconditionally (an empty field is a
   * real change from anything that had material on it).
   * @returns {void}
   */
  clear() {
    this.cells.fill(0);
    this.revision += 1;
  }

  /**
   * Presses along a polyline instead of a single point, resampling each
   * segment at `spacing` cells so a fast drag leaves one continuous groove
   * rather than separate dents with gaps between them. Delegates entirely to
   * `press`, so it is volume-conserving the same way `press` is; `revision`
   * is bumped by each underlying `press` call that changed the field, not
   * separately by this method.
   * @param {{x: number, y: number}[]} points field-space polyline points.
   * @param {{radius?: number, depth?: number, spacing?: number}} [options]
   * @returns {boolean} true if any press along the path changed the field.
   */
  pressPath(points, options = {}) {
    const { radius = 11, depth = .28, spacing = 2.2 } = options;
    const samples = resamplePolyline(points, spacing);
    let changed = false;
    for (const point of samples) {
      if (this.press(point.x, point.y, radius, depth)) changed = true;
    }
    return changed;
  }

  /**
   * Lays a rope of dough along a polyline by max-blending a dome (the same
   * profile as `addBall`) at each resampled point, so a slow finger leaves a
   * constant-thickness rope instead of piling a blob where it lingers. A
   * material SOURCE — it does not conserve volume. Bumps `revision` at most
   * once, regardless of how many points were stamped.
   * @param {{x: number, y: number}[]} points field-space polyline points.
   * @param {{radius?: number, peak?: number, spacing?: number}} [options]
   * @returns {boolean} true if the field changed.
   */
  depositPath(points, options = {}) {
    const { radius = 9, peak = 5, spacing = 1.6 } = options;
    const samples = resamplePolyline(points, spacing);
    let changed = false;
    for (const point of samples) {
      const cx = point.x;
      const cy = point.y;
      const minX = Math.max(1, Math.floor(cx - radius));
      const maxX = Math.min(this.width - 2, Math.ceil(cx + radius));
      const minY = Math.max(1, Math.floor(cy - radius));
      const maxY = Math.min(this.height - 2, Math.ceil(cy + radius));
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          const dx = (x - cx) / radius;
          const dy = (y - cy) / radius;
          const distanceSquared = dx * dx + dy * dy;
          if (distanceSquared >= 1) continue;
          const dome = Math.sqrt(1 - distanceSquared) * peak;
          const index = this.index(x, y);
          const previous = this.cells[index];
          const next = Math.max(previous, dome);
          if (next !== previous) {
            this.cells[index] = next;
            changed = true;
          }
        }
      }
    }
    if (changed) this.revision += 1;
    return changed;
  }

  /**
   * Finds the bounding box, in cells, of every cell whose height exceeds
   * `threshold`. Intended for truthful debug state ("how far has the dough
   * spread"), not for gameplay logic.
   * @param {number} [threshold] minimum height to count as material.
   * @returns {{minX: number, minY: number, maxX: number, maxY: number, width: number, height: number}|null}
   * inclusive cell bounds, or null when no cell exceeds the threshold.
   */
  bounds(threshold = .12) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        if (this.cells[this.index(x, y)] <= threshold) continue;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }

  /**
   * @returns {number} the tallest cell in the field, or 0 when empty.
   */
  peakHeight() {
    let peak = 0;
    for (let index = 0; index < this.cells.length; index += 1) {
      if (this.cells[index] > peak) peak = this.cells[index];
    }
    return peak;
  }
}
