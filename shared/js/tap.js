// tap.js — one press path for tablet-first controls.
//
// Browsers can suppress or delay the synthetic `click` after a touch (small
// finger movement past the tap slop, double-tap heuristics, 300ms delays on
// some configurations). Controls that play feedback on `pointerdown` but act
// on `click` therefore split into "I heard the tick but nothing happened".
//
// onTap fires the action on `pointerup` over the element — the same press the
// feedback came from — and keeps `click` only for keyboard / assistive-tech
// activation. Touch pointers are implicitly captured by controls on several
// browsers, so movement is tracked explicitly: sliding off still cancels even
// when pointerup is delivered back to the original element.

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
  let movedOutside = false;
  let suppressClickUntil = 0;

  const onDown = (e) => {
    if (e.isPrimary === false) return;
    if (el.matches?.(':disabled')) return;
    downId = e.pointerId;
    movedOutside = false;
    if (feedback) {
      try { feedback(e); } catch { /* feedback must never block the action */ }
    }
  };
  const onMove = (e) => {
    if (e.pointerId !== downId || movedOutside) return;
    const rect = el.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right
      || e.clientY < rect.top || e.clientY > rect.bottom) {
      movedOutside = true;
    }
  };
  const onUp = (e) => {
    if (e.pointerId !== downId) return;
    downId = null;
    // A browser can emit its compatibility click even when our own gesture
    // recognizer cancelled because the captured pointer slid outside. Suppress
    // that click for every completed pointer sequence, then decide whether the
    // action itself is valid.
    suppressClickUntil = performance.now() + 700;
    if (movedOutside || el.matches?.(':disabled')) return;
    action(e);
  };
  const onCancel = (e) => {
    if (e.pointerId === downId) {
      downId = null;
      movedOutside = false;
    }
  };
  const onClick = (e) => {
    // Pointer-originated click events have a non-zero detail. Keyboard and
    // assistive-tech activation use detail=0 and must remain available even
    // immediately after a pointer interaction.
    if (e.detail > 0 && performance.now() < suppressClickUntil) return;
    if (el.matches?.(':disabled')) return;
    action(e); // keyboard / assistive tech
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onCancel);
  el.addEventListener('click', onClick);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onCancel);
    el.removeEventListener('click', onClick);
  };
}
