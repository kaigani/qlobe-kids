// preload.js — warm the image cache so a round change does not pop.
//
// The pattern this replaces is a bare `new Image().src = url` loop with no
// promise, which means a game either does not know when its art is ready or
// waits on a hand-rolled counter. It also never rejects: a missing picture is
// a picture that draws late, not a reason to fail a boot.
//
// Zero imports, by design.

// URLs already SETTLED in this page load — loaded, or tried and failed. A game
// that preloads the same shared object cards on every mode start pays for them
// once, and a missing file is not re-requested on every round either.
const done = new Set();
// Images still in flight, held so nothing collects them mid-decode.
const inFlight = new Set();

/**
 * @param {string} url
 * @returns {Promise<void>} resolves on load OR error — never rejects
 */
function loadOne(url) {
  if (done.has(url)) return Promise.resolve();
  return new Promise((resolve) => {
    const img = new Image();
    inFlight.add(img);
    const finish = () => {
      inFlight.delete(img);
      done.add(url);
      resolve();
    };
    img.onload = finish;
    img.onerror = finish;
    img.decoding = 'async';
    img.src = url;
    // A cached image can be complete before the handlers are attached.
    if (img.complete) finish();
  });
}

/** requestIdleCallback where it exists, a short timeout where it does not. */
function whenIdle(fn) {
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(fn, { timeout: 1500 });
  else window.setTimeout(fn, 24);
}

/**
 * Preload images.
 *
 * @param {string[]|string} urls  falsy entries and duplicates are dropped
 * @param {{idle?: boolean}} [opts]
 *   `idle: true` fetches in small batches between frames, for art the child
 *   will not need for another few seconds — it keeps the preload off the
 *   critical path of the round that is already on screen. `idle: false` (the
 *   default) starts everything at once, for art the next screen needs now.
 * @returns {Promise<void>} resolves when every image has loaded or failed
 */
export function preloadImages(urls, { idle = false } = {}) {
  const list = [...new Set((Array.isArray(urls) ? urls : [urls]).filter(Boolean).map(String))];
  if (list.length === 0) return Promise.resolve();
  if (!idle) return Promise.all(list.map(loadOne)).then(() => undefined);

  return new Promise((resolve) => {
    let index = 0;
    const batch = () => {
      if (index >= list.length) {
        resolve();
        return;
      }
      const slice = list.slice(index, index + 4);
      index += slice.length;
      Promise.all(slice.map(loadOne)).then(() => whenIdle(batch));
    };
    whenIdle(batch);
  });
}

/**
 * Has this URL already been dealt with in this page load? True once the request
 * has SETTLED — which includes a 404, since a missing file is not retried.
 * @param {string} url
 * @returns {boolean}
 */
export function isPreloaded(url) {
  return done.has(String(url));
}
