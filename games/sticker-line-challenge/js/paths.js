export function samplePath(points, step = 10) {
  if (!Array.isArray(points) || points.length < 2) {
    throw new Error('samplePath needs at least 2 control points');
  }
  const raw = [];
  const pts = points.map(([x, y]) => ({ x, y }));
  raw.push({ x: pts[0].x, y: pts[0].y });
  if (pts.length === 2) {
    addSegment(raw, pts[0], pts[0], pts[1]);
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const from = mid(pts[i - 1], pts[i]);
      const to = mid(pts[i], pts[i + 1]);
      if (i === 1) {
        addSegment(raw, pts[0], pts[0], to);
      } else {
        addSegment(raw, from, pts[i], to);
      }
    }
    const lastMid = mid(pts[pts.length - 2], pts[pts.length - 1]);
    addSegment(raw, lastMid, pts[pts.length - 1], pts[pts.length - 1]);
  }
  return resample(raw, step);
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function addSegment(out, from, control, to) {
  const steps = 16;
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    const u = 1 - t;
    out.push({
      x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
    });
  }
}

function resample(raw, step) {
  const cum = [0];
  for (let i = 1; i < raw.length; i++) {
    cum.push(cum[i - 1] + Math.hypot(raw[i].x - raw[i - 1].x, raw[i].y - raw[i - 1].y));
  }
  const total = cum[cum.length - 1];
  const n = Math.max(2, Math.round(total / step));
  const samples = [];
  const lengths = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const target = (total * k) / (n - 1);
    while (j < cum.length - 2 && cum[j + 1] < target) j++;
    const span = cum[j + 1] - cum[j] || 1;
    const f = (target - cum[j]) / span;
    samples.push({
      x: raw[j].x + (raw[j + 1].x - raw[j].x) * f,
      y: raw[j].y + (raw[j + 1].y - raw[j].y) * f,
    });
    lengths.push(target);
  }
  return { samples, lengths, total };
}

export function tangentAt(samples, i) {
  const a = samples[Math.max(0, i - 1)];
  const b = samples[Math.min(samples.length - 1, i + 1)];
  return Math.atan2(b.y - a.y, b.x - a.x);
}

export function nearestSample(samples, x, y, from, back = 5, ahead = 34) {
  let best = -1;
  let bestD = Infinity;
  const start = Math.max(0, (from ?? 0) - back);
  const end = Math.min(samples.length - 1, (from ?? 0) + ahead);
  for (let i = start; i <= end; i++) {
    const d = (samples[i].x - x) ** 2 + (samples[i].y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return { index: best, distance: Math.sqrt(bestD) };
}

export function stampLayout(samples, gap) {
  const stamps = [];
  let next = gap / 2;
  const total = samples.length;
  let acc = 0;
  for (let i = 1; i < total; i++) {
    acc += Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
    while (acc >= next) {
      const f = 1 - (acc - next) / (acc - (acc - Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y)) || 1);
      const x = samples[i - 1].x + (samples[i].x - samples[i - 1].x) * f;
      const y = samples[i - 1].y + (samples[i].y - samples[i - 1].y) * f;
      stamps.push({ x, y, angle: tangentAt(samples, i) });
      next += gap;
    }
  }
  return stamps;
}

export function projectControlPoints(points, samples) {
  return points.map(([cx, cy]) => {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < samples.length; i++) {
      const d = (samples[i].x - cx) ** 2 + (samples[i].y - cy) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return { index: best, x: samples[best].x, y: samples[best].y };
  });
}
