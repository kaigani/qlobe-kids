// dom.js — the two DOM chores every game and engine hand-rolls.
//
// `escapeHtml` exists in seven engines under three slightly different
// implementations (one of them prints the string "null" for a missing value,
// which is how a nudge line ends up reading "null" to a five-year-old). This
// copy is the strict one: null/undefined become an empty string.
//
// `el` is the small builder that replaces the innerHTML template-string blocks
// where the escaping has to be remembered by hand at every interpolation.
//
// Zero imports, by design.

const ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape a value for interpolation into HTML text or a quoted attribute.
 * @param {*} str  null/undefined become '' (never the word "null")
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, (ch) => ENTITIES[ch]);
}

/**
 * Same escaping. Named separately because call sites read better when they say
 * which position they are escaping for, and the engines already import both.
 */
export const escapeAttr = escapeHtml;

/**
 * Build an element.
 *
 * @param {string} tag
 * @param {object} [attrs]  recognised keys:
 *   - `class` / `className` — string
 *   - `dataset` — object, camelCase keys land as `data-kebab-case`
 *   - `style` — object (assigned property by property) or a cssText string
 *   - `text` — textContent (escaping is not a question if you never write HTML)
 *   - `on*` — a function, attached with addEventListener('pointerdown', fn) etc.
 *     NOTE: for buttons prefer `onTap` from tap.js — a raw `onclick` splits
 *     feedback from action on touch. `on*` here is for the cases tap.js is not
 *     about (change, animationend, …).
 *   - anything else — setAttribute. `false`/`null`/`undefined` skip the
 *     attribute entirely; `true` sets it to '' (the boolean-attribute form).
 * @param {Node|string|number|Array<Node|string|number|null>} [children]
 *   strings and numbers become text nodes; null/undefined/false are skipped.
 * @returns {Element}
 */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null) continue;
    if (key === 'class' || key === 'className') {
      node.className = String(value);
    } else if (key === 'dataset') {
      for (const [dataKey, dataValue] of Object.entries(value || {})) {
        if (dataValue == null) continue;
        node.dataset[dataKey] = String(dataValue);
      }
    } else if (key === 'style') {
      if (typeof value === 'string') node.style.cssText = value;
      else for (const [prop, val] of Object.entries(value || {})) {
        if (val == null) continue;
        // setProperty keeps custom properties (--x) working; plain props too
        if (prop.startsWith('--')) node.style.setProperty(prop, String(val));
        else node.style[prop] = val;
      }
    } else if (key === 'text') {
      node.textContent = String(value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === false) {
      // an explicitly false attribute is an absent attribute
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }

  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child == null || child === false) continue;
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

/** Constrain a number to [min, max]. @returns {number} */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** Round to `decimals` places (default 0), not just to an integer. @returns {number} */
export function round(value, decimals = 0) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

/**
 * Escape a value for interpolation into a CSS selector (an attribute-selector
 * value, an id used as a selector, …) — `CSS.escape` with a fallback for the
 * one thing missing it would ever hit (older embedded WebViews).
 * @param {*} value
 * @returns {string}
 */
export function cssEscape(value) {
  const str = String(value);
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(str) : str.replace(/["\\]/g, '\\$&');
}

/**
 * Is `x,y` (page/client coordinates) inside `rect` (a DOMRect or
 * `{left,top,right,bottom}`-shaped object, e.g. from getBoundingClientRect())?
 * @returns {boolean}
 */
export function pointInside(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * True when the platform/user has asked for reduced motion. Re-reads the media
 * query on every call — call it right before an animation decision, not once
 * at boot, since a caller can change this setting mid-session.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * The `<span class="X-emoji">{emoji}</span>` a game swaps in for an art asset
 * that failed to load (`img.addEventListener('error', () => img.replaceWith(emojiSpan('🎪')))`).
 * `className` defaults to `'emoji-fallback'`; pass the game's own class to match
 * its sizing rule (`.rgl-emoji`, `.feel-emoji`, …).
 * @param {string} emoji
 * @param {string} [className='emoji-fallback']
 * @returns {HTMLSpanElement}
 */
export function emojiSpan(emoji, className = 'emoji-fallback') {
  const span = document.createElement('span');
  span.className = className;
  span.textContent = emoji;
  return span;
}

/**
 * Inject a `<style id="id">` once per page — a no-op on a repeat call (same
 * id already in `document.head`) or outside a DOM (SSR/tests). The pattern
 * every standalone shared module (a hidden-object scene, a magnifier lens, a
 * confetti burst, a pose actor) hand-rolls for its own base CSS.
 * @param {string} id
 * @param {string} css
 */
export function injectStyleOnce(id, css) {
  if (typeof document === 'undefined') return;
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.append(style);
}
