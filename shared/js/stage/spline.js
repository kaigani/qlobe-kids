// spline.js — spline math for the puppet rig (Stage v2).
//
// Pure functions, no Pixi/DOM dependency. Generalizes the quadratic-Bézier
// sampler in engines/trace-path.js to cubic Bézier and Catmull-Rom, and adds a
// keyframe-track sampler used to drive bone poses along smooth curves.
//
// Two coordinate helpers here work on {x,y} points; sampleTrack works on scalars
// (a single bone property like rotation). Angles/positions are plain numbers.

/** Linear interpolate two scalars. */
export function lerp(a, b, t) { return a + (b - a) * t; }

/** Point on a quadratic Bézier (matches trace-path's B(t)=u²a+2ut·c+t²b). */
export function quadPoint(a, c, b, t) {
  const u = 1 - t;
  return {
    x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
    y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
  };
}

/** Point on a cubic Bézier through control points p0..p3. */
export function cubicPoint(p0, p1, p2, p3, t) {
  const u = 1 - t;
  const uu = u * u, tt = t * t;
  const w0 = uu * u, w1 = 3 * uu * t, w2 = 3 * u * tt, w3 = tt * t;
  return {
    x: w0 * p0.x + w1 * p1.x + w2 * p2.x + w3 * p3.x,
    y: w0 * p0.y + w1 * p1.y + w2 * p2.y + w3 * p3.y,
  };
}

/**
 * Point on a Catmull-Rom spline through an ordered list of {x,y} points, t in
 * 0..1 spanning the whole run. The curve passes through every point, which is
 * what we want for the bendy "spine" and for smoothing 3+ keyframe values.
 * Endpoints are duplicated so the ends are honoured (uniform, tension 0.5).
 */
export function catmullRom(points, t) {
  const n = points.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return { x: points[0].x, y: points[0].y };
  const clamped = Math.max(0, Math.min(1, t));
  const span = clamped * (n - 1);      // position in segment units
  const i = Math.min(n - 2, Math.floor(span));
  const localT = span - i;
  const p0 = points[i - 1] || points[i];
  const p1 = points[i];
  const p2 = points[i + 1];
  const p3 = points[i + 2] || p2;
  const t2 = localT * localT, t3 = t2 * localT;
  const axis = (a0, a1, a2, a3) => 0.5 * (
    (2 * a1) +
    (-a0 + a2) * localT +
    (2 * a0 - 5 * a1 + 4 * a2 - a3) * t2 +
    (-a0 + 3 * a1 - 3 * a2 + a3) * t3
  );
  return {
    x: axis(p0.x, p1.x, p2.x, p3.x),
    y: axis(p0.y, p1.y, p2.y, p3.y),
  };
}

/** Catmull-Rom over a list of scalars (1-D). Same math on a single axis. */
export function catmullRom1D(values, t) {
  const pts = values.map((v) => ({ x: v, y: 0 }));
  return catmullRom(pts, t).x;
}

/**
 * Sample a keyframe track at time t (0..1 across the clip).
 *   keys: [{ t, v, ease? }]  (t ascending in 0..1, v scalar, ease: (n)=>n)
 * - Outside the key range: clamps to the first/last value.
 * - Exactly 2 keys, or an eased segment: eased linear interpolation.
 * - 3+ keys with no per-segment ease: Catmull-Rom through the values so motion
 *   flows through the middle keys instead of kinking at each one. This is the
 *   "spline" in spline-eased poses.
 */
export function sampleTrack(keys, t, defaultEase = (n) => n) {
  if (!keys || keys.length === 0) return 0;
  if (keys.length === 1) return keys[0].v;
  if (t <= keys[0].t) return keys[0].v;
  if (t >= keys[keys.length - 1].t) return keys[keys.length - 1].v;

  // locate the segment [k0, k1] containing t
  let i = 0;
  while (i < keys.length - 1 && t > keys[i + 1].t) i++;
  const k0 = keys[i], k1 = keys[i + 1];
  const span = k1.t - k0.t || 1;
  const local = (t - k0.t) / span;

  // A per-key ease forces a plain eased lerp for that segment (author control).
  if (k0.ease || keys.length === 2) {
    const e = (k0.ease || defaultEase)(local);
    return lerp(k0.v, k1.v, e);
  }
  // Otherwise smooth through neighbours with Catmull-Rom on the value sequence.
  const v = [k0.v, k1.v];
  v.unshift(keys[i - 1] ? keys[i - 1].v : k0.v);
  v.push(keys[i + 2] ? keys[i + 2].v : k1.v);
  return catmullRom1D(v, (local + 1) / 3); // middle segment of the 4-value run
}
