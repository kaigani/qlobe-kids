// scene-pack.js — versioned theater scene documents and embedded-config adapters.

export function normalizeScenePack(document, gameId = 'game') {
  const input = document && typeof document === 'object' ? document : {};
  return {
    ...input,
    format: input.format || 'qlobe-scene-pack',
    formatVersion: input.formatVersion || 1,
    id: input.id || `${gameId}-scenes`,
    gameId: input.gameId || gameId,
    stage: { ...(input.stage || {}) },
    scenes: { ...(input.scenes || {}) },
  };
}

export async function loadScenePack(url, gameId) {
  if (!url) return normalizeScenePack({}, gameId);
  const response = await fetch(new URL(url, document.baseURI), { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load Scene Pack: ${response.status}`);
  return normalizeScenePack(await response.json(), gameId);
}

export function applyScenePack(config, pack) {
  if (!pack) return config;
  config.stage = { ...(config.stage || {}), ...(pack.stage || {}) };
  config.modes = (config.modes || []).map((mode) => ({
    ...mode,
    scenarios: (mode.scenarios || []).map((scene) => {
      const overlay = pack.scenes?.[scene.id];
      return overlay ? { ...scene, ...overlay, id: scene.id } : scene;
    }),
  }));
  return config;
}
