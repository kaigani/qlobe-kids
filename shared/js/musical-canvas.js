// musical-canvas.js — reusable, touch-first sound drawing.
//
// Captures normalized semantic strokes so a painting can survive resize,
// serialize compactly, replay with its original rhythm, and export locally.
// Audio is synthesized with WebAudio; no asset or network request is required.

const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
const MAX_POINTS = 1800;

export function createMusicalCanvas(canvas, {
  brush = 'ribbon',
  color = '#35d6e8',
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches,
  onChange = () => {},
  onStrokeStart = () => {},
  onStrokeEnd = () => {},
} = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new Error('musical-canvas requires a canvas');
  }

  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const state = {
    brush, color, reducedMotion, muted: false, activePointer: null,
    strokes: [], redo: null, current: null, particles: [], replay: null,
    sessionStart: performance.now(), width: 1, height: 1, dpr: 1,
  };

  let audioContext = null;
  let master = null;
  let resizeObserver = null;
  let frame = 0;
  let lastSoundAt = 0;

  function ensureAudio() {
    if (audioContext) return audioContext;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    audioContext = new AC();
    master = audioContext.createGain();
    master.gain.value = state.muted ? 0 : .72;
    master.connect(audioContext.destination);
    return audioContext;
  }

  function unlock() {
    const ac = ensureAudio();
    if (ac?.state === 'suspended') ac.resume().catch(() => {});
  }

  function setMuted(value) {
    state.muted = !!value;
    if (master) master.gain.setTargetAtTime(state.muted ? 0 : .72, audioContext.currentTime, .02);
  }

  function note(point, stroke, force = false) {
    const now = performance.now();
    const wait = stroke.brush === 'ribbon' ? 92 : stroke.brush === 'bounce' ? 68 : 48;
    if (!force && now - lastSoundAt < wait) return;
    lastSoundAt = now;
    const ac = ensureAudio();
    if (!ac || state.muted || ac.state !== 'running') return;

    const index = Math.max(0, Math.min(SCALE.length - 1, Math.floor((1 - point.y) * SCALE.length)));
    const midi = 55 + SCALE[index];
    const hz = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const filter = ac.createBiquadFilter();
    const duration = stroke.brush === 'ribbon' ? .38 : stroke.brush === 'bounce' ? .18 : .28;
    const amount = stroke.brush === 'ribbon' ? .055 : stroke.brush === 'bounce' ? .085 : .045;
    osc.type = stroke.brush === 'ribbon' ? 'sine' : stroke.brush === 'bounce' ? 'triangle' : 'sine';
    osc.frequency.value = hz;
    if (stroke.brush === 'sparkle') {
      osc.frequency.setValueAtTime(hz * 2, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(hz, ac.currentTime + duration);
    }
    filter.type = 'lowpass';
    filter.frequency.value = stroke.brush === 'ribbon' ? 1100 : 2600;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    gain.gain.setValueAtTime(.0001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(amount, ac.currentTime + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + duration);
    osc.start();
    osc.stop(ac.currentTime + duration + .03);
  }

  function normalized(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp((clientX - rect.left) / Math.max(1, rect.width)),
      y: clamp((clientY - rect.top) / Math.max(1, rect.height)),
    };
  }

  function beginStroke(point, pointerId = 'debug') {
    cancelReplay();
    state.redo = null;
    const stroke = {
      id: `${Date.now().toString(36)}-${state.strokes.length}`,
      brush: state.brush,
      color: state.color,
      width: state.brush === 'ribbon' ? .026 : state.brush === 'bounce' ? .022 : .014,
      start: Math.round(performance.now() - state.sessionStart),
      points: [{ x: round(point.x), y: round(point.y), t: 0, p: round(point.p || .5) }],
    };
    state.current = { stroke, pointerId, began: performance.now(), last: point };
    state.strokes.push(stroke);
    onStrokeStart(clone(stroke));
    spawn(state.particles, point, stroke, 5);
    note(point, stroke, true);
    render();
    return stroke;
  }

  function addPoint(point, { sound = true } = {}) {
    const current = state.current;
    if (!current || totalPointCount(state.strokes) >= MAX_POINTS) return false;
    const distance = Math.hypot(point.x - current.last.x, point.y - current.last.y);
    if (distance < .004 && performance.now() - current.began > 20) return false;
    const entry = {
      x: round(point.x), y: round(point.y),
      t: Math.round(performance.now() - current.began),
      p: round(point.p || .5),
    };
    current.stroke.points.push(entry);
    current.last = point;
    if (sound) note(point, current.stroke);
    spawn(state.particles, point, current.stroke, state.reducedMotion ? 0 : current.stroke.brush === 'sparkle' ? 5 : 2);
    render();
    return true;
  }

  function finishStroke() {
    if (!state.current) return;
    const stroke = state.current.stroke;
    state.current = null;
    onStrokeEnd(clone(stroke));
    onChange(snapshot());
    render();
  }

  function pointerDown(event) {
    if (state.activePointer !== null || event.isPrimary === false || state.replay) return;
    event.preventDefault();
    unlock();
    state.activePointer = event.pointerId;
    const point = normalized(event.clientX, event.clientY);
    point.p = event.pressure || .5;
    beginStroke(point, event.pointerId);
  }

  function pointerMove(event) {
    if (event.pointerId !== state.activePointer || !state.current) return;
    event.preventDefault();
    const point = normalized(event.clientX, event.clientY);
    point.p = event.pressure || .5;
    addPoint(point);
  }

  function pointerUp(event) {
    if (event.pointerId !== state.activePointer) return;
    event.preventDefault();
    state.activePointer = null;
    finishStroke();
  }

  function cancelPointer() {
    if (state.activePointer === null) return;
    state.activePointer = null;
    finishStroke();
  }

  canvas.addEventListener('pointerdown', pointerDown, { passive: false });
  window.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointerup', pointerUp, { passive: false });
  window.addEventListener('pointercancel', pointerUp, { passive: false });
  window.addEventListener('blur', cancelPointer);

  function setBrush(next) {
    if (['ribbon', 'bounce', 'sparkle'].includes(next)) state.brush = next;
  }

  function setColor(next) {
    if (/^#[0-9a-f]{6}$/i.test(next)) state.color = next;
  }

  function undo() {
    cancelReplay();
    if (!state.strokes.length) return false;
    state.redo = state.strokes.pop();
    onChange(snapshot());
    render();
    return true;
  }

  function clear() {
    cancelReplay();
    if (!state.strokes.length) return false;
    state.redo = { cleared: clone(state.strokes) };
    state.strokes = [];
    state.particles = [];
    onChange(snapshot());
    render();
    return true;
  }

  function restoreLastClear() {
    if (!state.redo?.cleared) return false;
    state.strokes = clone(state.redo.cleared);
    state.redo = null;
    onChange(snapshot());
    render();
    return true;
  }

  function snapshot() {
    return {
      format: 'qlobe-musical-painting',
      formatVersion: 1,
      strokes: clone(state.strokes),
    };
  }

  function load(painting) {
    cancelReplay();
    state.strokes = clone(painting?.strokes || []).filter(validStroke);
    state.sessionStart = performance.now();
    state.redo = null;
    onChange(snapshot());
    render();
  }

  function replay({ speed = 1, onStart, onEnd } = {}) {
    if (!state.strokes.length || state.replay) return Promise.resolve(false);
    unlock();
    const strokes = clone(state.strokes);
    const first = Math.min(...strokes.map((stroke) => stroke.start || 0));
    const normalizedStrokes = strokes.map((stroke, index) => ({
      ...stroke,
      start: Math.min(9000, Math.max(index * 90, (stroke.start || 0) - first)),
    }));
    const duration = Math.max(...normalizedStrokes.map((stroke) =>
      stroke.start + (stroke.points.at(-1)?.t || 0))) / Math.max(.1, speed) + 450;
    const replayState = {
      strokes: normalizedStrokes, began: performance.now(), speed,
      lastSound: new Map(), resolve: null, onEnd,
    };
    state.replay = replayState;
    if (typeof onStart === 'function') onStart();
    return new Promise((resolve) => {
      replayState.resolve = resolve;
      const tick = () => {
        if (state.replay !== replayState) return;
        const elapsed = (performance.now() - replayState.began) * speed;
        for (let s = 0; s < replayState.strokes.length; s++) {
          const stroke = replayState.strokes[s];
          const local = elapsed - stroke.start;
          if (local < 0) continue;
          const visible = visiblePointCount(stroke.points, local);
          const previous = replayState.lastSound.get(s) || 0;
          if (visible > previous && visible > 0) {
            const point = stroke.points[visible - 1];
            note(point, stroke, visible === 1);
            if (!state.reducedMotion) spawn(state.particles, point, stroke, stroke.brush === 'sparkle' ? 4 : 1);
            replayState.lastSound.set(s, visible);
          }
        }
        render();
        if (elapsed >= duration * speed) {
          finishReplay(replayState, true);
          return;
        }
        frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    });
  }

  function finishReplay(replayState, completed) {
    if (state.replay !== replayState) return;
    state.replay = null;
    cancelAnimationFrame(frame);
    render();
    if (completed && typeof replayState.onEnd === 'function') replayState.onEnd();
    replayState.resolve?.(completed);
  }

  function cancelReplay() {
    if (!state.replay) return;
    finishReplay(state.replay, false);
  }

  function debugStroke(points = null) {
    const line = points?.length ? points : [
      { x: .18, y: .62 }, { x: .3, y: .35 }, { x: .48, y: .58 },
      { x: .65, y: .28 }, { x: .82, y: .52 },
    ];
    beginStroke({ ...line[0], p: .5 });
    const began = performance.now();
    for (let i = 1; i < line.length; i++) {
      state.current.began = began - i * 90;
      addPoint({ ...line[i], p: .5 }, { sound: false });
    }
    finishStroke();
    return snapshot();
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    state.width = width;
    state.height = height;
    state.dpr = dpr;
    render();
  }

  function render() {
    const { width, height } = state;
    const bg = ctx.createRadialGradient(width * .5, height * .42, 0, width * .5, height * .5, width * .75);
    bg.addColorStop(0, '#10285a');
    bg.addColorStop(.6, '#071c43');
    bg.addColorStop(1, '#04112b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    paperGrain(ctx, width, height);

    const strokes = state.replay ? state.replay.strokes : state.strokes;
    const elapsed = state.replay ? (performance.now() - state.replay.began) * state.replay.speed : Infinity;
    for (const stroke of strokes) {
      const local = elapsed - (stroke.start || 0);
      if (local < 0) continue;
      const visible = local === Infinity ? stroke.points.length : visiblePointCount(stroke.points, local);
      drawStroke(ctx, stroke, visible, width, height);
    }
    drawParticles(ctx, state.particles, width, height);
  }

  function exportPng(filename = 'sound-painting.png') {
    render();
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    return link.href;
  }

  function destroy() {
    cancelReplay();
    cancelAnimationFrame(frame);
    canvas.removeEventListener('pointerdown', pointerDown);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', pointerUp);
    window.removeEventListener('pointercancel', pointerUp);
    window.removeEventListener('blur', cancelPointer);
    resizeObserver?.disconnect();
    audioContext?.close().catch(() => {});
  }

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  resize();

  return {
    unlock, setMuted, setBrush, setColor, undo, clear, restoreLastClear,
    snapshot, load, replay, cancelReplay, debugStroke, exportPng, resize,
    hasStrokes: () => state.strokes.length > 0,
    strokeCount: () => state.strokes.length,
    isReplaying: () => !!state.replay,
    destroy,
  };
}

function drawStroke(ctx, stroke, visible, width, height) {
  const points = stroke.points.slice(0, visible).map((point) => ({ x: point.x * width, y: point.y * height }));
  if (!points.length) return;
  const base = Math.max(10, stroke.width * Math.min(width, height));
  if (stroke.brush === 'bounce') return drawBounce(ctx, points, stroke.color, base);
  if (stroke.brush === 'sparkle') return drawSparkle(ctx, points, stroke.color, base);
  drawRibbon(ctx, points, stroke.color, base);
}

function pathThrough(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  if (points.length === 1) {
    ctx.lineTo(points[0].x + .01, points[0].y);
    return;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  const last = points.at(-1);
  ctx.lineTo(last.x, last.y);
}

function drawRibbon(ctx, points, color, base) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = base * .75;
  pathThrough(ctx, points);
  ctx.strokeStyle = shade(color, -.32);
  ctx.lineWidth = base * 1.75;
  ctx.stroke();
  ctx.shadowBlur = base * .35;
  pathThrough(ctx, points);
  ctx.strokeStyle = color;
  ctx.lineWidth = base * 1.15;
  ctx.stroke();
  pathThrough(ctx, points);
  ctx.strokeStyle = mix(color, '#ffffff', .5);
  ctx.globalAlpha = .62;
  ctx.lineWidth = base * .24;
  ctx.stroke();
  ctx.restore();
}

function drawBounce(ctx, points, color, base) {
  ctx.save();
  for (let i = 0; i < points.length; i += 2) {
    const point = points[i];
    const radius = base * (.62 + (i % 7) * .07);
    ctx.shadowColor = color;
    ctx.shadowBlur = base * .65;
    ctx.fillStyle = i % 4 ? color : mix(color, '#ffffff', .24);
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = mix(color, '#ffffff', .55);
    ctx.lineWidth = Math.max(2, base * .16);
    ctx.globalAlpha = .7;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawSparkle(ctx, points, color, base) {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = base;
  pathThrough(ctx, points);
  ctx.strokeStyle = color;
  ctx.lineWidth = base * .76;
  ctx.stroke();
  for (let i = 0; i < points.length; i += 4) {
    star(ctx, points[i].x, points[i].y, base * (i % 3 ? .72 : 1.05), i % 2 ? color : '#fff4a8');
  }
  ctx.restore();
}

function star(ctx, x, y, radius, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.quadraticCurveTo(radius * .16, -radius * .16, radius, 0);
  ctx.quadraticCurveTo(radius * .16, radius * .16, 0, radius);
  ctx.quadraticCurveTo(-radius * .16, radius * .16, -radius, 0);
  ctx.quadraticCurveTo(-radius * .16, -radius * .16, 0, -radius);
  ctx.fill();
  ctx.restore();
}

function spawn(particles, point, stroke, count) {
  // Bound work even during very fast scribbling.
  if (!count) return;
  for (let i = 0; i < count && particles.length < 100; i++) {
    particles.push({
      x: point.x, y: point.y, color: i % 3 ? stroke.color : '#fff4a8',
      size: .004 + Math.random() * .008, life: 1,
      vx: (Math.random() - .5) * .003, vy: -.001 - Math.random() * .003,
    });
  }
}

function drawParticles(ctx, particles, width, height) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const particle = particles[i];
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.life -= .032;
    if (particle.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.globalAlpha = particle.life;
    star(ctx, particle.x * width, particle.y * height, particle.size * Math.min(width, height), particle.color);
  }
  ctx.globalAlpha = 1;
}

function paperGrain(ctx, width, height) {
  ctx.save();
  ctx.globalAlpha = .028;
  ctx.fillStyle = '#ffffff';
  const step = Math.max(22, Math.round(Math.min(width, height) / 30));
  for (let y = step; y < height; y += step) {
    for (let x = (y / step % 2) * step * .5; x < width; x += step) {
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }
  ctx.restore();
}

function visiblePointCount(points, time) {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((points[mid]?.t || 0) <= time) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function validStroke(stroke) {
  return stroke && ['ribbon', 'bounce', 'sparkle'].includes(stroke.brush)
    && /^#[0-9a-f]{6}$/i.test(stroke.color)
    && Array.isArray(stroke.points) && stroke.points.length;
}

function totalPointCount(strokes) {
  return strokes.reduce((sum, stroke) => sum + stroke.points.length, 0);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value) {
  return Math.max(0, Math.min(1, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function hex(color) {
  return [1, 3, 5].map((index) => parseInt(color.slice(index, index + 2), 16));
}

function mix(a, b, amount) {
  const aa = hex(a);
  const bb = hex(b);
  return `#${aa.map((value, index) =>
    Math.round(value + (bb[index] - value) * amount).toString(16).padStart(2, '0')).join('')}`;
}

function shade(color, amount) {
  return mix(color, amount < 0 ? '#000000' : '#ffffff', Math.abs(amount));
}
