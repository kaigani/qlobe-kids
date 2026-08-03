// engine-styles.js — the engines' one stylesheet loader.
//
// Every engine used to ship ~120 lines of identical CSS-in-JS chrome under its
// own class prefix. That chrome now lives in shared/css/engine-base.css and the
// screen router's `[hidden]` rule in shared/css/screens.css, so an engine's job
// at boot is to get those two files into `<head>` — once per document, no matter
// how many engines or how many `createGame()` calls — and then append its own
// residual `<style>` AFTER them.
//
// The ORDER is the whole compatibility story and it is why this lives in one
// place instead of thirteen:
//
//     1. the page's <link>s          (base.css, a game's own skin)
//     2. shared/css/screens.css      \  injected here, in this order,
//     3. shared/css/engine-base.css  /  before any engine <style>
//     4. <style id="qk-<engine>-style">  the engine's residual rules
//
// An engine therefore still outranks the shared sheets at equal specificity —
// exactly as it did when it owned all of the CSS — and the three games that skin
// engine internals (letter-road-driving, number-rod-race, blend-train) still
// outrank everything because they scope under `#game` and carry an ID.
//
// Urls resolve module-relative (`new URL(..., import.meta.url)`), never against
// the page: a game two directories deep and an engine `.test.html` sitting next
// to this file must both resolve the same shared/css/ files.

const SHEETS = [
  ['qk-screens-css', new URL('../../css/screens.css', import.meta.url).href],
  ['qk-engine-base-css', new URL('../../css/engine-base.css', import.meta.url).href],
];

let sheetsInstalled = false;

/**
 * Ensure the shared engine stylesheets are linked, then install one engine's
 * residual rules after them.
 *
 * Both halves are id-guarded and idempotent, so the 15th `createGame()` on a
 * page costs nothing. Passing no `css` just loads the shared sheets.
 *
 * @param {string} id   the `<style>` element id, e.g. `qk-choose-style`
 * @param {string} [css]  the engine's residual rules
 * @returns {boolean} true the first time this engine's style was installed
 */
export function installEngineStyles(id, css) {
  ensureSharedSheets();
  if (!css || document.getElementById(id)) return false;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = css;
  document.head.appendChild(style);
  return true;
}

/** Link screens.css + engine-base.css once. Exported for engines with no residual CSS. */
export function ensureSharedSheets() {
  if (sheetsInstalled) return;
  sheetsInstalled = true;
  for (const [id, href] of SHEETS) {
    if (document.getElementById(id)) continue;
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  }
}
