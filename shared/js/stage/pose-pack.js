// pose-pack.js — `qlobe-pose-actor` manifest loading, shared by the Pixi
// renderer (pose-sprite.js) and the DOM renderer (pose-sprite-dom.js). Both
// fetch + cache + validate the exact same manifest format; this is that
// logic, extracted once so the two renderers can't drift on it.

/** Fallback paper-pop duration (ms) when a manifest does not name one. */
export const POSE_POP_MS = 220;

const manifestCache = new Map();

/** Fetch a pose-actor manifest as JSON, cached by resolved URL. Never re-fetched. */
export async function fetchPoseManifest(url) {
  const href = new URL(url, document.baseURI).href;
  if (!manifestCache.has(href)) {
    manifestCache.set(href, fetch(href, { cache: 'no-store' }).then((response) => {
      if (!response.ok) throw new Error(`Could not load pose manifest ${new URL(href).pathname}`);
      return response.json();
    }));
  }
  return manifestCache.get(href);
}

/**
 * Fetch + validate a `qlobe-pose-actor` manifest (must have a `neutral` pose).
 * @param {string|URL} manifestUrl
 * @returns {Promise<{url: URL, manifest: object}>}
 * @throws when the manifest is missing, unreachable, or not a valid pack.
 */
export async function loadPoseManifest(manifestUrl) {
  const url = new URL(manifestUrl, document.baseURI);
  const manifest = await fetchPoseManifest(url);
  if (manifest.format !== 'qlobe-pose-actor' || !manifest.poses?.neutral) {
    throw new Error(`Invalid pose actor manifest: ${url.pathname}`);
  }
  return { url, manifest };
}

export const __test = { fetchPoseManifest, manifestCache };
