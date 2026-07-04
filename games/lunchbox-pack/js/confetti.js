// confetti.js — a small canvas confetti burst. No libraries, no three.js.
// initConfetti(canvas) once, then burst(x, y) for a short celebratory shower.
// Respects prefers-reduced-motion (bursts become a no-op).

let canvas = null;
let ctx = null;
let parts = [];
let raf = 0;

const COLORS = ['#e0402a', '#f2a03d', '#f5c518', '#3faf4e', '#2d7dd2', '#8e5bc0', '#ff7ab6'];

function resize() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}

/** Bind the fullscreen canvas used for bursts. Call once at boot. */
export function initConfetti(el) {
  canvas = el;
  ctx = canvas.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function reducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fire a confetti burst centered on CSS-pixel point (x, y).
 * @param {number} x
 * @param {number} y
 * @param {number} [count]
 */
export function burst(x, y, count = 90) {
  if (!ctx || reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    parts.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 4,
      w: 6 + Math.random() * 7,
      h: 4 + Math.random() * 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      life: 70 + Math.random() * 40,
    });
  }
  if (!raf) raf = requestAnimationFrame(tick);
}

function tick() {
  raf = 0;
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const next = [];
  for (const p of parts) {
    p.life -= 1;
    if (p.life <= 0) continue;
    p.vy += 0.18; // gravity
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    ctx.restore();
    next.push(p);
  }
  parts = next;
  if (parts.length) {
    raf = requestAnimationFrame(tick);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

/** Clear all particles immediately (used on screen changes). */
export function clearConfetti() {
  parts = [];
  if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
}
