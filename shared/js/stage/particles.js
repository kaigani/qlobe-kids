// particles.js — celebration bursts for Stage v2 (Pixi Graphics quads/circles,
// no textures, no deps). Respects prefers-reduced-motion (single subtle ring).

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PALETTE = [0xe23d3d, 0xf4c53d, 0x58a945, 0x2d7dd2, 0x8a5bc4, 0xf08a24];

/**
 * Confetti burst at (x, y) inside `container`.
 * Self-cleans; returns a promise that resolves when finished.
 */
export function burst(PIXI, container, x, y, { count = 26, power = 7, gravity = 0.25, life = 1100 } = {}) {
  if (reduced) count = 8;
  const bits = [];
  for (let i = 0; i < count; i++) {
    const g = new PIXI.Graphics();
    const color = PALETTE[i % PALETTE.length];
    if (i % 3 === 0) g.circle(0, 0, 3 + Math.random() * 3).fill(color);
    else g.rect(-4, -3, 8, 6).fill(color);
    g.position.set(x, y);
    const a = Math.random() * Math.PI * 2;
    const v = (0.4 + Math.random() * 0.6) * power;
    bits.push({ g, vx: Math.cos(a) * v, vy: Math.sin(a) * v - power * 0.6, vr: (Math.random() - 0.5) * 0.3 });
    container.addChild(g);
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const t = (now - start) / life;
      if (t >= 1) { bits.forEach((b) => b.g.destroy()); resolve(); return; }
      for (const b of bits) {
        b.vy += gravity;
        b.g.x += b.vx; b.g.y += b.vy; b.g.rotation += b.vr;
        b.g.alpha = 1 - t * t;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** Soft sparkle ping at a point (correct-answer feedback). */
export function sparkle(PIXI, container, x, y, color = 0xffd75e) {
  const g = new PIXI.Graphics();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    g.moveTo(Math.cos(a) * 4, Math.sin(a) * 4)
     .lineTo(Math.cos(a) * 14, Math.sin(a) * 14)
     .stroke({ width: 3, color, cap: 'round' });
  }
  g.position.set(x, y);
  g.alpha = 0.95;
  container.addChild(g);
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = (now) => {
      const t = (now - start) / 420;
      if (t >= 1) { g.destroy(); resolve(); return; }
      g.scale.set(1 + t * 0.8);
      g.alpha = 0.95 * (1 - t);
      g.rotation = t * 0.6;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
