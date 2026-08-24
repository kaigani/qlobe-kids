import { samplePath, tangentAt, nearestSample, stampLayout, projectControlPoints } from './paths.js';

const BOARD_W = 1200;
const BOARD_H = 800;

export function createPlayfield({ canvas, images, tuning, rng, reducedMotion = false, callbacks = {} }) {
  const ctx = canvas.getContext('2d');
  const disposers = [];

  let round = null;
  let buddyImg = images.star;
  let dpr = 1;
  let view = null;
  let staticLayer = null;
  let staticDirty = true;

  let progressIndex = 0;
  let dragging = false;
  let dragId = null;
  let dragOffset = { x: 0, y: 0 };
  let buddyPos = null;
  let wandering = false;
  let completed = false;
  let nudgeTimer = null;
  let halfwayFired = false;
  let almostFired = false;
  const passed = new Set();
  const pops = [];
  let demo = null;

  function setRound(points) {
    const { samples, lengths, total } = samplePath(points, tuning.sampleStep);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const s of samples) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x);
      maxY = Math.max(maxY, s.y);
    }
    const pad = 80;
    const bbox = {
      x: minX - pad,
      y: minY - pad,
      w: maxX - minX + pad * 2,
      h: maxY - minY + pad * 2,
    };
    round = {
      points,
      samples,
      lengths,
      total,
      bbox,
      stamps: stampLayout(samples, tuning.stampGap),
      dashes: stampLayout(samples, tuning.dashGap),
      ribbon: stampLayout(samples, 9),
      checkpoints: pickCheckpoints(points, samples, lengths),
    };
    progressIndex = 0;
    passed.clear();
    pops.length = 0;
    demo = null;
    wandering = false;
    completed = false;
    halfwayFired = false;
    almostFired = false;
    clearNudge();
    buddyPos = { ...samples[0] };
    staticDirty = true;
    layout();
  }

  function pickCheckpoints(points, samples, lengths) {
    if (points.length <= 6) return projectControlPoints(points, samples);
    const count = 6;
    const out = [];
    for (let k = 1; k <= count; k++) {
      const target = (lengths[lengths.length - 1] * k) / (count + 1);
      let best = 0;
      for (let i = 0; i < lengths.length; i++) {
        if (lengths[i] <= target) best = i;
        else break;
      }
      out.push({ index: best, x: samples[best].x, y: samples[best].y });
    }
    return out;
  }

  function setBuddy(img) {
    buddyImg = img;
    staticDirty = true;
  }

  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    if (!cw || !ch) return;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    const page = images.page;
    const pad = Math.min(cw, ch) * 0.03;
    const availW = cw - pad * 2;
    const availH = ch - pad * 2;
    const pageScale = Math.min(availW / page.width, availH / page.height);
    const pw = page.width * pageScale;
    const ph = page.height * pageScale;
    const px = (cw - pw) / 2;
    const py = (ch - ph) / 2;
    const innerPadX = pw * 0.075;
    const innerPadY = ph * 0.11;
    const bx = px + innerPadX;
    const by = py + innerPadY;
    const bw = pw - innerPadX * 2;
    const bh = ph - innerPadY * 2;
    const box = round?.bbox ?? { x: 0, y: 0, w: BOARD_W, h: BOARD_H };
    const scale = Math.min(bw / box.w, bh / box.h);
    view = {
      cw,
      ch,
      pageRect: { x: px, y: py, w: pw, h: ph },
      scale,
      ox: bx + (bw - box.w * scale) / 2 - box.x * scale,
      oy: by + (bh - box.h * scale) / 2 - box.y * scale,
    };
    staticDirty = true;
  }

  const toCanvas = (p) => ({ x: view.ox + p.x * view.scale, y: view.oy + p.y * view.scale });
  const toBoard = (x, y) => ({ x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale });

  function drawSprite(img, x, y, sizeUnits, angle = 0, alpha = 1) {
    const s = sizeUnits * view.scale;
    ctx.save();
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, -s / 2, -s / 2, s, s * (img.height / img.width));
    ctx.restore();
  }

  function renderStatic() {
    staticLayer = staticLayer && staticLayer.width === canvas.width && staticLayer.height === canvas.height
      ? staticLayer
      : document.createElement('canvas');
    staticLayer.width = canvas.width;
    staticLayer.height = canvas.height;
    const sctx = staticLayer.getContext('2d');
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.clearRect(0, 0, view.cw, view.ch);
    const { pageRect } = view;
    sctx.drawImage(images.page, pageRect.x, pageRect.y, pageRect.w, pageRect.h);

    sctx.setTransform(dpr, 0, 0, dpr, view.ox, view.oy);
    sctx.scale(view.scale, view.scale);
    const dashAlpha = wandering ? 0.4 : 0.8;
    sctx.globalAlpha = 0.5;
    for (const st of round.ribbon) {
      sctx.save();
      sctx.translate(st.x, st.y);
      sctx.rotate(st.angle);
      sctx.drawImage(images.blob, -46, -46, 92, 92);
      sctx.restore();
    }
    sctx.globalAlpha = dashAlpha;
    for (const st of round.dashes) {
      sctx.save();
      sctx.translate(st.x, st.y);
      sctx.rotate(st.angle);
      sctx.drawImage(images.dash, -22, -9, 44, 18);
      sctx.restore();
    }
    sctx.globalAlpha = 1;
    const end = round.samples[round.samples.length - 1];
    sctx.save();
    sctx.globalAlpha = 0.35;
    const bi = buddyImg.height / buddyImg.width;
    sctx.drawImage(buddyImg, end.x - 65, end.y - 65 * bi, 130, 130 * bi);
    sctx.globalAlpha = 0.7;
    sctx.strokeStyle = '#8c6bc7';
    sctx.lineWidth = 4;
    sctx.setLineDash([12, 10]);
    sctx.beginPath();
    sctx.arc(end.x, end.y, 74, 0, Math.PI * 2);
    sctx.stroke();
    sctx.restore();
    for (let i = 0; i < round.checkpoints.length; i++) {
      const cp = round.checkpoints[i];
      const pop = pops.find((p) => p.kind === 'cp' && p.index === i);
      const s = pop && !reducedMotion ? 66 * (1 + 0.5 * pop.ease) : 66;
      sctx.save();
      sctx.translate(cp.x, cp.y);
      if (pop && !reducedMotion) sctx.rotate(0.2 * pop.ease);
      sctx.globalAlpha = 0.95;
      const bi2 = images.star.height / images.star.width;
      sctx.drawImage(images.star, -s / 2, (-s / 2) * bi2, s, s * bi2);
      sctx.restore();
    }
    staticDirty = false;
  }

  function render() {
    if (!view || !round) return;
    if (staticDirty) renderStatic();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(staticLayer, 0, 0);

    ctx.setTransform(dpr, 0, 0, dpr, view.ox, view.oy);
    ctx.scale(view.scale, view.scale);

    const progressArc = round.lengths[progressIndex];
    for (const st of round.stamps) {
      const along = arcAt(st, round.samples, round.lengths);
      if (along <= progressArc) {
        ctx.save();
        ctx.translate(st.x, st.y);
        ctx.rotate(st.angle + (st.seed ?? 0));
        ctx.globalAlpha = 0.95;
        const bi = buddyImg.height / buddyImg.width;
        ctx.drawImage(buddyImg, -20, -20 * bi, 40, 40 * bi);
        ctx.restore();
      }
    }

    if (demo) {
      const s = demo.sample();
      if (s) drawSpriteImg(buddyImg, s.x, s.y, 120, 0.55);
    }

    const bi = buddyImg.height / buddyImg.width;
    ctx.save();
    ctx.translate(buddyPos.x, buddyPos.y);
    ctx.rotate(wandering ? Math.sin(Date.now() / 120) * 0.06 : 0);
    ctx.globalAlpha = dragging ? 1 : 0.96;
    const grab = 130 * (dragging && !reducedMotion ? 1.08 : 1);
    ctx.drawImage(buddyImg, -grab / 2, (-grab / 2) * bi, grab, grab * bi);
    ctx.restore();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const p of pops) {
      if (p.kind !== 'burst') continue;
      const alpha = 1 - p.t;
      ctx.globalAlpha = alpha;
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI * 2 * k) / 6 + p.seed;
        const r = p.t * 60 * view.scale + 20 * view.scale;
        ctx.fillStyle = ['#f6c445', '#e873a4', '#8c6bc7', '#5bb8a8'][k % 4];
        ctx.beginPath();
        ctx.arc(p.x * view.scale + view.ox + Math.cos(a) * r, p.y * view.scale + view.oy + Math.sin(a) * r, 5 * view.scale * (1 - p.t * 0.5), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  function drawSpriteImg(img, x, y, size, alpha) {
    const bi = img.height / img.width;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, x - size / 2, y - (size / 2) * bi, size, size * bi);
    ctx.restore();
  }

  function arcAt(st, samples, lengths) {
    if (st._arc == null) {
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < samples.length; i++) {
        const d = (samples[i].x - st.x) ** 2 + (samples[i].y - st.y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      st._arc = lengths[best];
      st.seed = (rng ? rng() : Math.random()) * 0.5 - 0.25;
    }
    return st._arc;
  }

  function needsFrame() {
    return dragging || pops.length > 0 || demo || (wandering && !reducedMotion);
  }

  function pump() {
    if (staticDirty || needsFrame()) {
      stepPops();
      render();
    }
    requestAnimationFrame(pump);
  }
  requestAnimationFrame(pump);

  function stepPops() {
    const now = performance.now();
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i];
      p.t = (now - p.t0) / p.dur;
      p.ease = 1 - Math.abs(1 - 2 * Math.min(1, p.t));
      if (p.t >= 1) pops.splice(i, 1);
    }
  }

  function clearNudge() {
    if (nudgeTimer) {
      clearTimeout(nudgeTimer);
      nudgeTimer = null;
    }
  }

  function armNudge() {
    clearNudge();
    nudgeTimer = setTimeout(() => {
      if (wandering) callbacks.onNudge?.();
    }, tuning.nudgeDelayMs);
  }

  function onDown(e) {
    if (!round || !e.isPrimary || dragging || completed) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const b = toBoard(x, y);
    const startGrab = Math.hypot(b.x - round.samples[0].x, b.y - round.samples[0].y) * view.scale;
    const buddyGrab = Math.hypot(b.x - buddyPos.x, b.y - buddyPos.y) * view.scale;
    if (buddyGrab > tuning.grabRadius && startGrab > tuning.grabRadius) return;
    dragId = e.pointerId;
    dragging = true;
    demo = null;
    dragOffset = { x: b.x - buddyPos.x, y: b.y - buddyPos.y };
    follow(b.x - dragOffset.x, b.y - dragOffset.y);
    staticDirty = true;
  }

  function onMove(e) {
    if (!dragging || e.pointerId !== dragId || !round) return;
    const rect = canvas.getBoundingClientRect();
    const b = toBoard(e.clientX - rect.left, e.clientY - rect.top);
    follow(b.x - dragOffset.x, b.y - dragOffset.y);
  }

  function follow(x, y) {
    buddyPos = { x, y };
    const tolBoard = tuning.tolerance / view.scale;
    const { index, distance } = nearestSample(round.samples, x, y, progressIndex, 8, 40);
    if (distance <= tolBoard) {
      if (wandering) {
        wandering = false;
        clearNudge();
        staticDirty = true;
      }
      if (index > progressIndex) {
        progressIndex = index;
        for (let i = 0; i < round.checkpoints.length; i++) {
          const cp = round.checkpoints[i];
          if (!passed.has(i) && progressIndex >= cp.index) {
            passed.add(i);
            pops.push({ kind: 'cp', index: i, t: 0, ease: 0, t0: performance.now(), dur: 420 });
            pops.push({ kind: 'burst', x: cp.x, y: cp.y, t: 0, ease: 0, t0: performance.now(), dur: 620, seed: i });
            callbacks.onCheckpoint?.(i, passed.size, round.checkpoints.length);
          }
        }
        const frac = progressIndex / (round.samples.length - 1);
        if (!halfwayFired && frac >= 0.5) {
          halfwayFired = true;
          callbacks.onHalfway?.();
        }
        if (!almostFired && frac >= 0.85) {
          almostFired = true;
          callbacks.onAlmost?.();
        }
        if (!completed && progressIndex >= tuning.completeFraction * (round.samples.length - 1)) {
          completed = true;
          dragging = false;
          dragId = null;
          clearNudge();
          buddyPos = { ...round.samples[round.samples.length - 1] };
          for (let i = 0; i < round.checkpoints.length; i++) passed.add(i);
          callbacks.onComplete?.(passed.size, round.checkpoints.length);
        }
      }
    } else if (!wandering) {
      wandering = true;
      armNudge();
      staticDirty = true;
    }
  }

  function onUp(e) {
    if (e.pointerId !== dragId) return;
    dragging = false;
    dragId = null;
    staticDirty = true;
  }

  window.addEventListener('pointerdown', onDown, { passive: false });
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
  const onBlur = () => {
    dragging = false;
    dragId = null;
    staticDirty = true;
  };
  window.addEventListener('blur', onBlur);
  disposers.push(() => {
    window.removeEventListener('pointerdown', onDown);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    window.removeEventListener('blur', onBlur);
    clearNudge();
  });

  function startDemo() {
    if (!round || reducedMotion) return;
    const from = progressIndex;
    const t0 = performance.now();
    const speed = 420 / (tuning.sampleStep * view.scale || 1);
    demo = {
      sample() {
        const i = Math.min(round.samples.length - 1, from + Math.round(((performance.now() - t0) / 1000) * speed));
        if (i >= round.samples.length - 1) {
          demo = null;
          staticDirty = true;
          return null;
        }
        return round.samples[i];
      },
    };
  }

  function winRound() {
    if (!round || completed) return;
    completed = true;
    dragging = false;
    progressIndex = round.samples.length - 1;
    for (let i = 0; i < round.checkpoints.length; i++) passed.add(i);
    buddyPos = { ...round.samples[round.samples.length - 1] };
    staticDirty = true;
    callbacks.onComplete?.(passed.size, round.checkpoints.length);
  }

  function getState() {
    return {
      hasRound: Boolean(round),
      progressFraction: round ? progressIndex / (round.samples.length - 1) : 0,
      checkpointsPassed: passed.size,
      checkpointCount: round ? round.checkpoints.length : 0,
      dragging,
      wandering,
      completed,
    };
  }

  function tracePoints() {
    if (!round || !view) return [];
    return round.samples
      .filter((_, i) => i % 2 === 0 || i === round.samples.length - 1)
      .map((s) => {
        const c = toCanvas(s);
        return [c.x / view.cw, c.y / view.ch];
      });
  }

  function destroy() {
    for (const d of disposers) d();
  }

  return {
    setRound,
    setBuddy,
    resize: layout,
    startDemo,
    winRound,
    getState,
    tracePoints,
    destroy,
    get canvas() {
      return canvas;
    },
  };
}
