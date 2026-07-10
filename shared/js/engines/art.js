// art.js — placeholder-art resolver for archetype engines.
// Config art refs are strings; engines call artEl(ref) and get a DOM node.
// Swapping placeholder emoji for real art later is a config edit only.
//
//   emoji:🐸                    big emoji on a soft rounded card
//   shared:objects/cat.png      shared/assets/objects/cat.png
//   shared:foods/apple.png      shared/assets/foods/apple.png
//   shared:letter-tiles/b.png   shared/assets/letter-tiles/b.png
//   char:maya                   shared/characters/maya/portrait.png

const SHARED = new URL('../../', import.meta.url); // -> shared/

/** Resolve an art ref to a URL string, or null for emoji refs. */
export function artUrl(ref) {
  if (ref.startsWith('shared:')) return new URL('assets/' + ref.slice(7), SHARED).href;
  if (ref.startsWith('char:')) return new URL('characters/' + ref.slice(5) + '/portrait.png', SHARED).href;
  return null;
}

/**
 * Build a DOM element for an art ref. Emoji render as text scaled to the
 * container; images render contained. The caller sizes the returned element.
 * @param {string} ref
 * @param {string} [alt] accessible name (empty = decorative)
 * @returns {HTMLElement}
 */
export function artEl(ref, alt = '') {
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
  const img = document.createElement('img');
  img.className = 'qk-art qk-art-img';
  img.src = artUrl(ref);
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
  `;
  document.head.appendChild(style);
}
