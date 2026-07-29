// art.js — the production Field Journal plates, for both halves of the game:
// Pixi textures for the things that go in the water, and URLs/markup for the DOM.
//
// One rule, and it is the reason this file is separate from placeholder.js:
// when `config.placeholderArt` is true NOTHING here touches the network. The
// code-drawn dev fallback stays alive and 404-free so the game can still be
// worked on before (or without) the art plates. Flip the flag and the same call
// sites read the real gouache instead.
//
// Paths in config.json are written relative to the GAME ROOT (`./assets/…`),
// but this module lives one level down in js/, so every ref is resolved against
// `../` — never against document.baseURI, never absolute, always lowercase.

import { emojiCard, badgeSvg } from './placeholder.js';

const GAME = new URL('../', import.meta.url);

let live = false;

/** Turn real plates on/off (mirrors `!config.placeholderArt`). */
export function useRealArt(on) { live = !!on; }
export function isLive() { return live; }

/** Resolve a config art ref (`./assets/x.webp`) to a URL. '' when there is none. */
export function artUrl(ref) {
  return ref ? new URL(ref, GAME).href : '';
}

// ------------------------------------------------------------------ textures

const texByUrl = new Map();     // url -> PIXI.Texture | null (null = load failed)
const placeholderTex = new Map(); // obj.id -> PIXI.Texture

/**
 * Warm the texture cache. Awaited during boot so `objectTexture()` can stay
 * synchronous — an object must appear the instant the child lets go of it, and
 * a texture that arrives a frame later would drop it into the water invisible.
 * A failed load is remembered as `null` and quietly falls back to the
 * code-drawn chip, so one bad file can never blank out the jar.
 */
export async function preload(PIXI, refs) {
  if (!live) return;
  const urls = [...new Set(refs.map(artUrl).filter(Boolean))];
  await Promise.all(urls.map(async (url) => {
    if (texByUrl.has(url)) return;
    try {
      texByUrl.set(url, await PIXI.Assets.load(url));
    } catch {
      texByUrl.set(url, null);
    }
  }));
}

/** A preloaded texture for a config art ref, or null. */
export function texture(ref) {
  const url = artUrl(ref);
  return url ? (texByUrl.get(url) || null) : null;
}

/** The texture for one object: real cutout when we have it, chip when we don't. */
export function objectTexture(PIXI, obj, theme = {}) {
  const real = live ? texture(obj.art) : null;
  if (real) return real;
  const hit = placeholderTex.get(obj.id);
  if (hit && !hit.destroyed) return hit;
  const tex = PIXI.Texture.from(emojiCard(obj.emoji, {
    paper: theme.panel || '#fdf8ec',
    ink: 'rgba(61, 90, 68, 0.34)',
  }));
  placeholderTex.set(obj.id, tex);
  return tex;
}

/** True when this sprite is showing real (trimmed, non-square) cutout art. */
export function isRealTexture(ref) {
  return !!(live && texture(ref));
}

// ---------------------------------------------------------------------- DOM

const esc = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The face of an object inside a chip / focus slot / drag ghost / journal
 * stamp: the painted cutout in production, its emoji in placeholder mode.
 */
export function objFace(obj, cls = 'obj-art') {
  const url = live ? artUrl(obj.art) : '';
  if (!url) return `<span class="obj-glyph">${obj.emoji}</span>`;
  return `<img class="${cls}" src="${esc(url)}" alt="" draggable="false" decoding="async">`;
}

/** A painted guess emblem (cork on the water line / pebble on the floor). */
export function badgeFace(kind, badges = {}) {
  const url = live ? artUrl(badges[kind] && badges[kind].art) : '';
  if (!url) return badgeSvg(kind);
  return `<img class="badge-art" src="${esc(url)}" alt="" draggable="false" decoding="async">`;
}

/** A framed-painting mode tile, or the mode's emoji while art is pending. */
export function modeFace(mode) {
  const url = live ? artUrl(mode.icon) : '';
  if (!url) return mode.emoji;
  return `<img class="mode-tile" src="${esc(url)}" alt="" draggable="false" decoding="async">`;
}
