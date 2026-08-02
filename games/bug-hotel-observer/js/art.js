// art.js — one place that turns an authored path into a URL that actually loads.
//
//     resolveArt('assets/bg-room-leaf.jpg')
//        -> 'assets/bg-room-leaf.jpg'   when the plate is on disk
//        -> null                        when it is not
//
// P6 SHIPPED THE ART, SO THE DEV FALLBACK IS GONE. The shell was built against
// `assets/placeholder/` while P4 was still generating; that directory has been
// deleted and this module no longer knows a second URL for anything. Every path
// in config.json now resolves to a real file, and the bar is zero 404s.
//
// WHY A PROBE AND NOT AN `onerror` HANDLER. The room plate is handed to TWO
// consumers — `scene.setBackground()` paints the base world and
// `lens.setBackground()` paints the magnified duplicate — and both take a URL
// string, not an element. If each fell back on its own `onerror` there would be
// one frame where the glass magnifies a different picture from the one under
// it, which is the single most confusing thing this game could show a child.
// Resolving the URL ONCE, before either consumer sees it, makes that
// unrepresentable. It is also the reason the probe survived the placeholder
// tree: a plate that fails on a flaky connection must leave the PREVIOUS plate
// up in both worlds rather than blank one of them.
//
// `<img>` tags that only one consumer owns (the HUD, the stickers) use
// `imgEl()` / `applyFallback()`, which is the same decision applied to an
// element: a picture that will not load hides itself instead of showing a
// five-year-old the browser's broken-image glyph.
//
// game-design.md §10: a missing plate keeps the previous one; a missing bug
// sprite costs the child a picture, never a turn. Nothing here ever rejects.

/** url -> Promise<boolean> — every path is probed at most once per session. */
const probes = new Map();

function probe(url) {
  if (probes.has(url)) return probes.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
  probes.set(url, p);
  return p;
}

/**
 * The URL a consumer should actually use for an authored path.
 *
 * @param {?string} path
 * @returns {Promise<?string>} the path, or null when it does not load — callers
 *   must treat null as "draw nothing and carry on".
 */
export async function resolveArt(path) {
  if (!path) return null;
  return (await probe(path)) ? path : null;
}

/**
 * True when the authored asset is really on disk. QA / provenance only — no
 * runtime caller, and deliberately kept: it is the one-line way for a harness
 * or a future screen to ask "did this ship?" without duplicating the probe
 * cache and issuing a second request for something already fetched.
 */
export async function hasReal(path) {
  return path ? probe(path) : false;
}

/**
 * An `<img>` for an authored path. Used for HUD and journal art, where no
 * second consumer can disagree about the URL.
 *
 * @param {?string} path
 * @param {string} [className]
 * @param {string} [alt] '' (decorative) unless the image IS the control's label
 */
export function imgEl(path, className = '', alt = '') {
  const img = document.createElement('img');
  if (className) img.className = className;
  img.alt = alt;
  img.draggable = false;
  img.decoding = 'async';
  if (!path) { img.hidden = true; return img; }
  img.addEventListener('error', () => { img.hidden = true; }, { once: true });
  img.src = path;
  return img;
}

/**
 * Point an `<img>` that already exists in index.html at an authored path.
 * IDEMPOTENT: the HUD's target plaque and the reward's happy frame are
 * re-pointed on every room and every reward, and an `addEventListener` per call
 * would pile up a listener per bug per session.
 */
const handlers = new WeakMap();

export function applyFallback(img, path) {
  if (!img) return img;
  const prev = handlers.get(img);
  if (prev) img.removeEventListener('error', prev);
  if (!path) {
    handlers.delete(img);
    img.removeAttribute('src');
    img.hidden = true;
    return img;
  }
  const onError = () => { img.hidden = true; };
  handlers.set(img, onError);
  img.addEventListener('error', onError);
  img.hidden = false;
  img.src = path;
  return img;
}
