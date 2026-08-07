// art-ref.js — the art-ref resolution logic shared by the DOM engine renderer
// (engines/art.js) and the Pixi renderer (stage/art-pixi.js). Both accept the
// same config art-ref grammar and used to carry an identical copy of this URL
// resolver + layer-normaliser; this is that logic, extracted once.
//
//   emoji:🐸 | shared:objects/cat.webp | char:maya | text:CAT | swatch:#f4c53d
//   game:assets/engine.webp  game-local file, resolved against `base`
//
// See engines/art.js / stage/art-pixi.js for the full ref grammar (including
// array-of-layers composition) — this module only owns URL resolution and
// layer-entry normalisation, the two pieces that were byte-for-byte identical
// between the two renderers.

const SHARED = new URL('../', import.meta.url); // -> shared/

/**
 * Resolve an art ref to a URL string, or null when the ref is not file-backed.
 * @param {string} ref
 * @param {string} [base] base URL for `game:` refs (default: document.baseURI)
 * @returns {string|null}
 */
export function resolveArtUrl(ref, base) {
  if (typeof ref !== 'string') return null; // arrays/objects have no single URL
  if (ref.startsWith('shared:')) return new URL('assets/' + ref.slice(7), SHARED).href;
  if (ref.startsWith('char:')) return new URL('characters/' + ref.slice(5) + '/portrait.png', SHARED).href;
  if (ref.startsWith('game:')) return new URL(ref.slice(5), base || document.baseURI).href;
  return null;
}

/** Normalise a layer entry: a bare ref string, or { ref, scale, dx, dy, alpha, tint }. */
export function layerSpec(entry) {
  return (entry && typeof entry === 'object' && !Array.isArray(entry)) ? entry : { ref: entry };
}

/**
 * Extract a bare emoji/character from a ref, for engines that only ever
 * render a glyph (no image element). A file-backed ref (`shared:`/`char:`/
 * `game:`) has no plain-text form, so it degrades to `fallback` instead of
 * printing the ref string itself — the same graceful-degradation rule
 * `engines/art.js`'s `artEl` uses for an unrecognised prefix, just for glyph
 * ONLY call sites that can't fall back to an `<img>`.
 * @param {*} ref
 * @param {string} [fallback]
 * @returns {string}
 */
export function emojiFromRef(ref, fallback = '⭐') {
  const value = String(ref ?? '').trim();
  if (!value) return fallback;
  if (value.startsWith('emoji:')) return value.slice(6) || fallback;
  return value.includes(':') ? fallback : value;
}
