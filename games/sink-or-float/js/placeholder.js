// placeholder.js — code-drawn stand-ins while the Field Journal art plates are
// being generated on the local API.
//
// The contract with the art pass is deliberate: NOTHING here fetches a file.
// While `config.placeholderArt` is true every object, badge, journal stamp and
// backdrop is drawn from shapes + the object's own emoji, so the game has zero
// 404s against art that does not exist yet.
//
// The plates have landed and the flag is off, but this module stays: art.js
// falls back to it whenever the flag is flipped again (or a single plate fails
// to load), so the game is always playable and always 404-free. Verified: with
// `placeholderArt: true` the page makes ZERO requests under assets/.

const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

/**
 * A soft "specimen card": rounded gouache-paper chip with the emoji centred.
 * Returns a canvas so the caller can make either a Pixi texture or a CSS
 * background out of it without a second code path.
 */
export function emojiCard(emoji, {
  size = 180,
  dpr = 2,
  paper = '#fbf6ea',
  ink = 'rgba(61, 90, 68, 0.34)',
  card = true,
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  if (card) {
    const pad = size * 0.06;
    const r = size * 0.26;
    roundRect(ctx, pad, pad, size - pad * 2, size - pad * 2, r);
    ctx.fillStyle = paper;
    ctx.fill();
    ctx.lineWidth = Math.max(2, size * 0.017);
    ctx.strokeStyle = ink;
    ctx.stroke();
  }

  ctx.font = `${Math.round(size * (card ? 0.56 : 0.78))}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // A couple of emoji fonts sit high in the em box; nudge down so the glyph
  // reads as centred inside the card rather than floating.
  ctx.fillText(emoji, size / 2, size / 2 + size * 0.03);
  return canvas;
}

function roundRect(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/**
 * Pictorial guess badge, drawn as inline SVG so a pre-reader gets a picture and
 * the page still makes no network request. FLOAT = a cork riding the painted
 * water line; SINK = a pebble resting on the jar floor beneath it.
 */
export function badgeSvg(kind) {
  const wave = 'M6 __Y__ q13 -9 26 0 t26 0 t26 0 t26 0';
  if (kind === 'float') {
    return `<svg viewBox="0 0 116 116" aria-hidden="true" focusable="false">
      <rect x="3" y="3" width="110" height="110" rx="26" fill="#eaf6fb" stroke="#2d7dd2" stroke-width="4"/>
      <path d="M6 74 q13 -9 26 0 t26 0 t26 0 t26 0 L110 110 L6 110 Z" fill="#59a9d8" opacity="0.72"/>
      <path d="${wave.replace('__Y__', '74')}" fill="none" stroke="#c6e8f8" stroke-width="5" stroke-linecap="round"/>
      <rect x="42" y="46" width="32" height="26" rx="9" fill="#c58a4e" stroke="#8a5a2c" stroke-width="3.5"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 116 116" aria-hidden="true" focusable="false">
    <rect x="3" y="3" width="110" height="110" rx="26" fill="#eaf6fb" stroke="#2d7dd2" stroke-width="4"/>
    <path d="M6 40 q13 -9 26 0 t26 0 t26 0 t26 0 L110 110 L6 110 Z" fill="#59a9d8" opacity="0.72"/>
    <path d="${wave.replace('__Y__', '40')}" fill="none" stroke="#c6e8f8" stroke-width="5" stroke-linecap="round"/>
    <ellipse cx="58" cy="90" rx="24" ry="17" fill="#7d8b93" stroke="#4f5d66" stroke-width="3.5"/>
  </svg>`;
}

/** The little jar-with-a-question mark used on the splash while art is pending. */
export function jarSvg() {
  return `<svg viewBox="0 0 120 150" aria-hidden="true" focusable="false">
    <rect x="14" y="16" width="92" height="126" rx="24" fill="#eaf6fb" stroke="#8fbcd6" stroke-width="4"/>
    <path d="M20 66 q14 -9 28 0 t28 0 t28 0 L104 130 a14 14 0 0 1 -14 12 L34 142 a14 14 0 0 1 -14 -12 Z"
          fill="#59a9d8" opacity="0.66"/>
    <path d="M20 66 q14 -9 28 0 t28 0 t28 0" fill="none" stroke="#c6e8f8" stroke-width="5" stroke-linecap="round"/>
    <rect x="8" y="8" width="104" height="18" rx="9" fill="#ffffff" opacity="0.8" stroke="#8fbcd6" stroke-width="3"/>
    <rect x="30" y="34" width="9" height="60" rx="5" fill="#ffffff" opacity="0.55"/>
  </svg>`;
}
