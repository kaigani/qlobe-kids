// art.js — placeholder-art resolver for archetype engines.
// Config art refs are strings; engines call artEl(ref) and get a DOM node.
// Swapping placeholder emoji for real art later is a config edit only.
//
//   emoji:🐸                    big emoji on a soft rounded card
//   shared:objects/cat.webp      shared/assets/objects/cat.webp
//   shared:foods/apple.png      shared/assets/foods/apple.png
//   shared:letter-tiles/b.png   shared/assets/letter-tiles/b.png
//   char:maya                   shared/characters/maya/portrait.png
//   game:assets/engine.webp     game-local file, resolved against `base`
//                               (default document.baseURI — same convention as
//                                the raw './assets/bg.jpg' paths configs already use)
//
// A ref may also be an ARRAY of layers, painted bottom-to-top:
//
//   [ 'game:assets/car.webp',
//     { ref: 'text:A', scale: 0.42, dx: 0.06, dy: -0.08 } ]
//
// Layer offsets dx/dy are FRACTIONS OF THE BOX (rendered as % translate),
// never pixels, so a composed stack survives every rescale without drifting.

// URL resolution + layer normalisation are shared with stage/art-pixi.js —
// see ../art-ref.js. artUrl keeps its historic name here for this file's own
// call sites and any external `import { artUrl } from './art.js'`.
import { resolveArtUrl as artUrl, layerSpec } from '../art-ref.js';
export { artUrl };

/**
 * Build a DOM element for an art ref. Emoji render as text scaled to the
 * container; images render contained. The caller sizes the returned element.
 * @param {string|Array} ref string ref, or array of layers (index 0 = bottom)
 * @param {string} [alt] accessible name (empty = decorative)
 * @param {{base?: string}} [opts] base URL for `game:` refs
 * @returns {HTMLElement}
 */
export function artEl(ref, alt = '', opts = {}) {
  const base = opts && opts.base;

  // --- composed / layered ref ------------------------------------------
  if (Array.isArray(ref)) {
    const stack = document.createElement('span');
    stack.className = 'qk-art qk-art-stack';
    // One label for the whole stack: a screen reader hears one thing, not three.
    if (alt) { stack.setAttribute('role', 'img'); stack.setAttribute('aria-label', alt); }
    else stack.setAttribute('aria-hidden', 'true');
    for (const entry of ref) {
      const s = layerSpec(entry);
      const layer = document.createElement('span');
      layer.className = 'qk-art-layer';
      layer.setAttribute('aria-hidden', 'true');
      // dx/dy are fractions of the box → % translate, scale-invariant.
      layer.style.setProperty('--dx', ((s.dx ?? 0) * 100) + '%');
      layer.style.setProperty('--dy', ((s.dy ?? 0) * 100) + '%');
      layer.style.setProperty('--s', String(s.scale ?? 1));
      if (s.alpha != null) layer.style.opacity = String(s.alpha);
      const inner = artEl(s.ref, '', opts);
      inner.setAttribute('aria-hidden', 'true');
      layer.appendChild(inner);
      stack.appendChild(layer); // painter order = array order
    }
    return stack;
  }

  if (typeof ref !== 'string') { // nothing to draw — never a broken node
    const span = document.createElement('span');
    span.className = 'qk-art qk-art-emoji';
    span.setAttribute('aria-hidden', 'true');
    return span;
  }

  if (ref.startsWith('text:')) {
    // letters, words, numerals — rendered big in Fredoka on the card
    const span = document.createElement('span');
    span.className = 'qk-art qk-art-text';
    span.textContent = ref.slice(5);
    if (alt) span.setAttribute('aria-label', alt);
    return span;
  }
  if (ref.startsWith('swatch:')) {
    // a solid color chip, e.g. swatch:#f4c53d
    const span = document.createElement('span');
    span.className = 'qk-art qk-art-swatch';
    span.style.background = ref.slice(7);
    if (alt) { span.setAttribute('role', 'img'); span.setAttribute('aria-label', alt); }
    else span.setAttribute('aria-hidden', 'true');
    return span;
  }
  if (ref.startsWith('emoji:')) {
    const span = document.createElement('span');
    span.className = 'qk-art qk-art-emoji';
    span.textContent = ref.slice(6);
    if (alt) { span.setAttribute('role', 'img'); span.setAttribute('aria-label', alt); }
    else span.setAttribute('aria-hidden', 'true');
    return span;
  }
  const url = artUrl(ref, base);
  if (!url) {
    // Unknown/unprefixed ref (e.g. a raw emoji like '🌦️'): render it as emoji
    // text rather than a broken <img src="null"> — graceful for every engine.
    const span = document.createElement('span');
    span.className = 'qk-art qk-art-emoji';
    span.textContent = ref.includes(':') ? ref.slice(ref.indexOf(':') + 1) : ref;
    if (alt) { span.setAttribute('role', 'img'); span.setAttribute('aria-label', alt); }
    else span.setAttribute('aria-hidden', 'true');
    return span;
  }
  const img = document.createElement('img');
  img.className = 'qk-art qk-art-img';
  img.src = url;
  img.alt = alt;
  img.draggable = false;
  img.decoding = 'async';
  return img;
}

// Base styles for art elements — injected once, shared by all engines.
if (!document.getElementById('qk-art-style')) {
  const style = document.createElement('style');
  style.id = 'qk-art-style';
  style.textContent = `
    .qk-art { display: block; pointer-events: none; user-select: none; -webkit-user-select: none; }
    .qk-art-emoji { text-align: center; line-height: 1; font-size: var(--qk-art-size, 64px); }
    .qk-art-img { width: 100%; height: 100%; object-fit: contain; }
    .qk-art-text { text-align: center; line-height: 1.1; font-size: var(--qk-art-size, 64px);
      font-family: 'Fredoka', 'Arial Rounded MT Bold', sans-serif; font-weight: 600;
      color: #17517e; }
    .qk-art-swatch { width: 78%; height: 78%; margin: 11%; border-radius: 22%;
      border: 3px solid rgba(23, 81, 126, .15); }
    .qk-art-stack { position: relative; width: 100%; height: 100%; }
    .qk-art-layer { position: absolute; inset: 0; display: grid; place-items: center;
                    transform: translate(var(--dx), var(--dy)) scale(var(--s)); }
  `;
  document.head.appendChild(style);
}
