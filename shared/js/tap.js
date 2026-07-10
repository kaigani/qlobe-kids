// tap.js — one press path for tablet-first controls.
//
// Browsers can suppress or delay the synthetic `click` after a touch (small
// finger movement past the tap slop, double-tap heuristics, 300ms delays on
// some configurations). Controls that play feedback on `pointerdown` but act
// on `click` therefore split into "I heard the tick but nothing happened".
//
// onTap fires the action on `pointerup` over the element — the same press the
// feedback came from — and keeps `click` only for keyboard / assistive-tech
// activation. Sliding a finger off the control before lifting still cancels
// (the pointerup lands elsewhere), matching platform button behavior.

/**
 * @param {Element} el
 * @param {(e: Event) => void} action  runs once per press, on pointerup or
 *   keyboard click
 * @param {{feedback?: (e: PointerEvent) => void}} [opts]  feedback runs on
 *   pointerdown (unlock/SFX); it never blocks the action
 * @returns {() => void} disposer that removes all listeners
 */
export function onTap(el, action, opts = {}) {
  const { feedback } = opts;
  let downId = null;
  let suppressClickUntil = 0;

  const onDown = (e) => {
    if (e.isPrimary === false) return;
    downId = e.pointerId;
    if (feedback) {
      try { feedback(e); } catch { /* feedback must never block the action */ }
    }
  };
  const onUp = (e) => {
    if (e.pointerId !== downId) return;
    downId = null;
    // the browser may still emit a synthetic click for this press — eat it
    suppressClickUntil = performance.now() + 700;
    action(e);
  };
  const onCancel = (e) => {
    if (e.pointerId === downId) downId = null;
  };
  const onClick = (e) => {
    if (performance.now() < suppressClickUntil) return; // already ran on pointerup
    action(e); // keyboard / assistive tech
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('click', onClick);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('click', onClick);
  };
}
