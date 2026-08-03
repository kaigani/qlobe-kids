import { ClayRenderer, HeightfieldClay } from './clay-grid.js';

const canvas = document.querySelector('#clay-canvas');
const cursor = document.querySelector('#tool-cursor');
const status = document.querySelector('#status');
const volumeStatus = document.querySelector('#volume-status');
const toolButtons = [...document.querySelectorAll('[data-tool]')];
const presetButtons = [...document.querySelectorAll('[data-preset]')];
const colorButtons = [...document.querySelectorAll('[data-color]')];

const clay = new HeightfieldClay(240, 160);
const renderer = new ClayRenderer(canvas, clay, { color: '#ef725e' });
const fieldScale = clay.width / 192;
let preset = 'slab';
let tool = 'press';
let pointerId = null;
let previous = null;
let baselineVolume = 0;
let lastDuration = 0;
let operationCount = 0;

function reset(nextPreset = preset) {
  preset = nextPreset;
  clay.reset(preset);
  baselineVolume = clay.totalVolume();
  operationCount = 0;
  renderer.draw(true);
  updateMetrics();
  presetButtons.forEach((button) => {
    const active = button.dataset.preset === preset;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function updateMetrics() {
  const current = clay.totalVolume();
  const drift = baselineVolume ? ((current - baselineVolume) / baselineVolume) * 100 : 0;
  status.textContent = `${lastDuration.toFixed(1)} ms edit · ${clay.width}×${clay.height} field`;
  volumeStatus.textContent = `Volume drift ${drift >= 0 ? '+' : ''}${drift.toFixed(3)}% · ${operationCount} edits`;
}

function localPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) / rect.width * clay.width,
    y: (event.clientY - rect.top) / rect.height * clay.height,
  };
}

function updateCursor(event, point) {
  const rect = canvas.getBoundingClientRect();
  cursor.hidden = false;
  cursor.dataset.tool = tool;
  cursor.style.left = `${event.clientX - rect.left}px`;
  cursor.style.top = `${event.clientY - rect.top}px`;
}

function editSegment(from, to, pressure = .5) {
  const started = performance.now();
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const steps = Math.max(1, Math.ceil(distance / 2.1));
  let changed = false;
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const point = {
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
    };
    const priorT = (step - 1) / steps;
    const prior = {
      x: from.x + (to.x - from.x) * priorT,
      y: from.y + (to.y - from.y) * priorT,
    };
    if (tool === 'pull') {
      changed = clay.smear(prior.x, prior.y, point.x, point.y, 12 * fieldScale, .38) || changed;
    } else if (tool === 'roller') {
      changed = clay.roll(point.x, point.y, 15 * fieldScale, .46) || changed;
    } else {
      changed = clay.press(point.x, point.y, 10.5 * fieldScale, .12 + pressure * .18) || changed;
    }
  }
  if (changed) {
    clay.relax(1, .024, .2);
    renderer.draw();
    operationCount += 1;
  }
  lastDuration = performance.now() - started;
  updateMetrics();
}

function stampLetterA() {
  const started = performance.now();
  const points = [
    [[.37, .70], [.49, .30]],
    [[.49, .30], [.63, .70]],
    [[.42, .54], [.57, .54]],
  ];
  for (const [start, end] of points) {
    const from = { x: start[0] * clay.width, y: start[1] * clay.height };
    const to = { x: end[0] * clay.width, y: end[1] * clay.height };
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.ceil(distance / 2.5);
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      clay.press(
        from.x + (to.x - from.x) * t,
        from.y + (to.y - from.y) * t,
        5.2 * fieldScale,
        .32,
      );
    }
  }
  clay.relax(2, .022, .2);
  operationCount += 1;
  lastDuration = performance.now() - started;
  renderer.draw();
  updateMetrics();
}

function setTool(nextTool) {
  if (nextTool === 'stamp') {
    stampLetterA();
    return;
  }
  tool = nextTool;
  toolButtons.forEach((button) => {
    const active = button.dataset.tool === tool;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

canvas.addEventListener('pointerdown', (event) => {
  if (pointerId !== null) return;
  pointerId = event.pointerId;
  canvas.setPointerCapture?.(pointerId);
  previous = localPoint(event);
  updateCursor(event, previous);
  editSegment(previous, previous, event.pressure || .5);
});

canvas.addEventListener('pointermove', (event) => {
  const point = localPoint(event);
  updateCursor(event, point);
  if (event.pointerId !== pointerId || !previous) return;
  event.preventDefault();
  const samples = event.getCoalescedEvents?.() || [event];
  for (const sample of samples) {
    const next = localPoint(sample);
    editSegment(previous, next, sample.pressure || .5);
    previous = next;
  }
});

function endPointer(event) {
  if (event.pointerId !== pointerId) return;
  pointerId = null;
  previous = null;
  clay.relax(2, .026, .2);
  renderer.draw();
  updateMetrics();
}

canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('pointerleave', () => {
  if (pointerId === null) cursor.hidden = true;
});

toolButtons.forEach((button) => button.addEventListener('click', () => setTool(button.dataset.tool)));
presetButtons.forEach((button) => button.addEventListener('click', () => reset(button.dataset.preset)));
colorButtons.forEach((button) => button.addEventListener('click', () => {
  renderer.setColor(button.dataset.color);
  renderer.draw(true);
  colorButtons.forEach((candidate) => {
    const active = candidate === button;
    candidate.classList.toggle('is-active', active);
    candidate.setAttribute('aria-pressed', String(active));
  });
}));
document.querySelector('#reset').addEventListener('click', () => reset());

const resizeObserver = new ResizeObserver(() => renderer.resize());
resizeObserver.observe(canvas);
setTool(tool);
reset(preset);
renderer.resize();

window.CLAY_LAB = {
  clay,
  reset,
  setTool,
  stampLetterA,
  metrics: () => ({
    resolution: [clay.width, clay.height],
    volume: clay.totalVolume(),
    baselineVolume,
    volumeDrift: (clay.totalVolume() - baselineVolume) / baselineVolume,
    lastEditMs: lastDuration,
    edits: operationCount,
  }),
};
