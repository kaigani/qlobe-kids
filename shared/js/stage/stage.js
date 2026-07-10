// stage.js — Pixi bootstrap for Stage v2 engines.
// Thin by design: engines own their gameplay; this owns the canvas lifecycle.
//
// PixiJS is vendored at shared/vendor/pixi.min.js (UMD → window.PIXI); load it
// once per page via a classic script tag injected here, so game pages don't
// need an importmap entry.

const PIXI_URL = new URL('../../vendor/pixi.min.js', import.meta.url).href;

let pixiReady = null;
export function loadPixi() {
  if (window.PIXI) return Promise.resolve(window.PIXI);
  if (!pixiReady) {
    pixiReady = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PIXI_URL;
      s.onload = () => resolve(window.PIXI);
      s.onerror = () => reject(new Error('pixi failed to load'));
      document.head.appendChild(s);
    });
  }
  return pixiReady;
}

/**
 * Create a stage filling mountEl. Resolves to:
 *   { PIXI, app, root, size(), onResize(cb), setScene(container), destroy() }
 * - root is a container engines draw into; setScene swaps top-level containers
 *   (old scene is destroyed).
 * - The render loop pauses when the tab is hidden (battery).
 */
export async function createStage(mountEl) {
  const PIXI = await loadPixi();
  const app = new PIXI.Application();
  await app.init({
    resizeTo: mountEl,
    backgroundAlpha: 0,
    antialias: true,
    resolution: Math.min(2, window.devicePixelRatio || 1),
    autoDensity: true,
  });
  mountEl.appendChild(app.canvas);
  app.canvas.style.touchAction = 'none';

  const root = new PIXI.Container();
  app.stage.addChild(root);

  const resizeCbs = new Set();
  const notify = () => resizeCbs.forEach((cb) => cb(app.screen.width, app.screen.height));
  app.renderer.on('resize', notify);

  const onVis = () => { document.hidden ? app.ticker.stop() : app.ticker.start(); };
  document.addEventListener('visibilitychange', onVis);

  let scene = null;
  return {
    PIXI, app, root,
    size: () => ({ w: app.screen.width, h: app.screen.height }),
    onResize(cb) { resizeCbs.add(cb); cb(app.screen.width, app.screen.height); return () => resizeCbs.delete(cb); },
    setScene(container) {
      if (scene) { root.removeChild(scene); scene.destroy({ children: true }); }
      scene = container;
      if (container) root.addChild(container);
    },
    destroy() {
      document.removeEventListener('visibilitychange', onVis);
      resizeCbs.clear();
      app.destroy(true, { children: true, texture: false });
    },
  };
}
