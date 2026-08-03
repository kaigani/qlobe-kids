// drag-to-slot-dom.js — the DOM twin of drag-to-slot.js.
//
// WHY THIS EXISTS
// ---------------
// drag-to-slot.js owns the drag lifecycle for the Pixi engines, and it is the
// right module — but it speaks PIXI.Container, so every DOM-rendered game that
// wanted the same feel re-derived the plumbing by hand instead. story-stones
// (~32 LOC) and teen-bead-builder (~80 LOC) are the two cleanest copies, and
// between them they already disagree about the slop distance (10 vs 12), about
// whether the ghost appears on press or on lift, and about how a drop resolves
// (elementFromPoint vs a padded rect). Each copy also carries a *different*
// subset of the hardening: story-stones has the "pointercancel is not a drop"
// fix, teen-bead-builder has the setPointerCapture try/catch and the window
// listener trio, and NEITHER of them cancels on a mid-drag blur. This module is
// the union, once.
//
// WHAT THIS MODULE OWNS (same list as the Pixi original, plus hit testing)
//   - the pointerdown -> pointermove -> pointerup/pointercancel lifecycle
//   - "one drag at a time" and the isPrimary === false (second finger) reject
//   - the slop gate and the lift (build the ghost, hand it to the drag layer)
//   - the ghost: creation, positioning under the finger, and removal on EVERY
//     exit path — including the ones the games forget
//   - blur / visibilitychange / pagehide cancel (see below)
//   - never leaving a piece stranded: idempotent detach, stray-ghost sweep,
//     try/catch/finally around every game callback
//   - slot hit testing, which the Pixi module deliberately does NOT own
//
// WHY HIT TESTING LIVES HERE AND NOT IN THE PIXI ORIGINAL
// -------------------------------------------------------
// The Pixi module refuses to know about slots because in a Pixi scene there is
// no shared answer: sequence-order wants nearest-centre-within-radius and
// sort-into-bins wants rect containment, and a "target" concept would have to
// satisfy both. In the DOM there IS a shared answer — the browser's own
// `elementFromPoint`, which respects z-order, transforms, and overflow clipping
// for free, and which both DOM pilots already reach for. So the module offers
// it, reports the result as `drag.slot` on every move and on the drop, and
// still lets a game ignore `drag.slot` entirely and do its own thing from
// `drag.x` / `drag.y`.
//
// `slotPad` layers the second dialect on top: teen-bead-builder wants 45px of
// forgiveness around its ten-frame, which no elementFromPoint can give. When
// `slotPad > 0`, an elementFromPoint miss falls back to a padded-rect scan
// picking the nearest slot centre. With the default `slotPad: 0` the fallback
// never runs, so story-stones gets byte-equivalent behaviour to its hand-rolled
// `document.elementFromPoint(x, y)?.closest?.('[data-slot]')`.
//
// WHY THE LISTENERS LIVE ON `window`
// ----------------------------------
// Same reason as the Pixi original (interaction pattern #11 rule 1): the source
// element can be re-rendered out from under the drag — and every one of these
// games re-renders its whole screen with `innerHTML` — which silently kills a
// pointerup bound to that element and leaves a ghost stone stuck to a
// five-year-old's finger with no way to put it down. story-stones' hand-rolled
// copy binds move/up/cancel to the BUTTON, which is exactly that bug waiting to
// happen; teen-bead-builder already binds to window. Window wins. We filter by
// pointerId instead.
//
// `setPointerCapture` is still called on the source element, in a try/catch,
// because it is what stops the browser from re-targeting the pointer stream
// mid-gesture on some Android builds. It is belt-and-braces on top of the
// window listeners, never the mechanism — hence the empty catch.
//
// WHY BLUR CANCELS
// ----------------
// The Pixi module leaves the blur listener to the engine on purpose (it stays
// out of the engine's teardown ordering). A DOM game has no engine to delegate
// to, and the failure is real: an iPad notification, an app switch, or the
// control centre eats the pointerup, and without a blur listener the drag stays
// "in flight" forever — `begin()` then rejects every future press because of
// the one-drag-at-a-time guard, and the game is dead until reload. So here the
// module owns it, and a game that wants the Pixi division of labour passes
// `cancelOnBlur: false`.
//
// A CANCEL IS NOT A DROP
// ----------------------
// iPadOS palm rejection fires `pointercancel`, and the coordinates it carries
// are wherever the palm was — often over a slot. Committing that as a drop
// places a stone the child never chose. `pointercancel` therefore routes to
// `cancel()`, which removes the ghost and fires `onCancel` (the piece is back
// home, nothing is placed), never `onDrop`.
//
// A TAP IS NOT A DROP EITHER
// --------------------------
// `onDrop` fires only for a drag that passed the slop gate, exactly as in the
// Pixi original. A press that never moved is a tap, and both pilots already
// handle taps on their own `click` path (that is also what keeps keyboard and
// AT activation working). Firing `onDrop` for it would double-fire the attempt.

/**
 * Pixels the pointer must travel before a press becomes a drag.
 * 10 — story-stones' value. teen-bead-builder uses 12; the Pixi original uses 8
 * because a Pixi press is on a big card and a DOM press is often on a scrollable
 * grid, where a lower gate steals the child's scroll.
 */
export const DRAG_SLOP = 10;

const GHOST_ATTR = 'data-qk-drag-ghost';

/** Legacy hand-rolled ghost classes swept alongside our own. */
const STRAY_SELECTOR = `[${GHOST_ATTR}], .drag-clone`;

function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function pointInRect(x, y, rect, pad = 0) {
  return x >= rect.left - pad && x <= rect.right + pad
      && y >= rect.top - pad && y <= rect.bottom + pad;
}

/**
 * Create a DOM drag controller.
 *
 * @param {object} opts
 * @param {Function} opts.getPiece   (id) -> piece | null. A piece is either an
 *        Element, or `{ el, ... }` — anything else on the object is yours and is
 *        handed straight back to your callbacks.
 * @param {Element|Function} [opts.ghostHost=document.body] where the ghost is
 *        appended; a function is resolved per drag.
 * @param {Element|Document|Function} [opts.root=document] scope for the
 *        `slotPad` rect scan (elementFromPoint is always document-wide).
 * @param {string} [opts.slotSelector='[data-slot]'] what counts as a slot.
 * @param {number} [opts.slotPad=0] px of forgiveness around a slot's rect. 0
 *        means elementFromPoint only — see the header.
 * @param {?string} [opts.hoverClass=null] toggled on the slot under the finger.
 * @param {Function} [opts.makeGhost] (piece, drag) -> Element. Default is
 *        `el.cloneNode(true)`, which is what both pilots do.
 * @param {string} [opts.ghostClass='dragging'] added to the ghost.
 * @param {'lift'|'press'} [opts.ghostOn='lift'] when the ghost appears.
 *        'lift' = after the slop gate (story-stones); 'press' = immediately on
 *        pointerdown (teen-bead-builder).
 * @param {number} [opts.slop=DRAG_SLOP] the gate, in px.
 * @param {number} [opts.grabOffset=0] fraction of the piece half-size the grab
 *        offset may reach. 0 (the DOM default, and what both pilots do) snaps
 *        the ghost centre to the finger. See the Pixi module's header for why
 *        the cap exists at all.
 * @param {boolean} [opts.cancelOnBlur=true] blur/visibilitychange/pagehide
 *        cancel the drag.
 * @param {boolean} [opts.preventDefaultOnPress=false] call preventDefault on
 *        the pointerdown. Off by default so a `click`-based tap path (both
 *        pilots) and AT activation are untouched.
 * @param {Function} [opts.canStart] () -> boolean gate.
 * @param {Function} [opts.onGrab]   (piece, drag) -> false aborts BEFORE any
 *        listener is attached.
 * @param {Function} [opts.onLift]   (piece, drag) first move past the slop gate.
 * @param {Function} [opts.onMove]   (piece, drag) every move once airborne.
 * @param {Function} [opts.onDrop]   async (piece, drag) pointerup after a real
 *        drag. `drag.slot` is the resolved slot Element, or null.
 * @param {Function} [opts.onCancel] async (piece, drag) pointercancel / blur /
 *        cancel(). The piece is home and nothing was placed.
 * @param {Function} [opts.onTap]    (piece, drag) pointerup with no drag. Most
 *        games leave this alone and keep their own `click` handler.
 * @returns {{ begin: Function, cancel: Function, detach: Function,
 *            hitTest: Function, sweepStrayGhosts: Function, active: object|null }}
 */
export function createDragToSlotDom({
  getPiece,
  ghostHost = document.body,
  root = document,
  slotSelector = '[data-slot]',
  slotPad = 0,
  hoverClass = null,
  makeGhost = null,
  ghostClass = 'dragging',
  ghostOn = 'lift',
  slop = DRAG_SLOP,
  grabOffset = 0,
  cancelOnBlur = true,
  preventDefaultOnPress = false,
  canStart = () => true,
  onGrab = () => true,
  onLift = () => {},
  onMove = () => {},
  onDrop = async () => {},
  onCancel = async () => {},
  onTap = () => {},
} = {}) {
  if (typeof getPiece !== 'function') throw new Error('drag-to-slot-dom requires getPiece(id)');

  const slopPx = Math.max(0, num(slop, DRAG_SLOP));
  const padPx = Math.max(0, num(slotPad, 0));
  const offsetFraction = Math.max(0, num(grabOffset, 0));
  const ghostAtPress = ghostOn === 'press';

  let drag = null;
  let listening = false;

  // ---------------------------------------------------------------- helpers

  function resolve(value, fallback) {
    try {
      const out = typeof value === 'function' ? value() : value;
      return out || fallback;
    } catch {
      return fallback;
    }
  }

  /** A piece may be a bare Element or a `{ el }` record. */
  function elementOf(piece) {
    if (!piece) return null;
    if (piece.nodeType === 1) return piece;
    return piece.el && piece.el.nodeType === 1 ? piece.el : null;
  }

  function scopeRoot() {
    const node = resolve(root, document);
    return node && typeof node.querySelectorAll === 'function' ? node : document;
  }

  /**
   * Sweep ghosts that outlived their drag. Interaction pattern #11 rule 5 —
   * should be dead code, kept anyway, because the one time it is not dead code
   * a child is looking at a stone welded to the screen.
   */
  function sweepStrayGhosts() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    const live = drag && drag.ghost;
    document.querySelectorAll(STRAY_SELECTOR).forEach((node) => {
      if (node !== live) node.remove();
    });
  }

  function clearHover() {
    if (!hoverClass || !drag || !drag.slot) return;
    drag.slot.classList.remove(hoverClass);
  }

  function paintHover(next) {
    if (!hoverClass) return;
    if (drag.slot === next) return;
    if (drag.slot) drag.slot.classList.remove(hoverClass);
    if (next) next.classList.add(hoverClass);
  }

  /**
   * Which slot is under (x, y)?
   *
   * elementFromPoint first: it is the browser's own answer and it respects
   * z-order, transforms and overflow clipping that a rect scan gets wrong. The
   * ghost never intercepts it because we force `pointer-events: none` on it.
   * Only when that misses AND `slotPad > 0` do we scan rects, and then we take
   * the nearest centre rather than the first hit — with 45px of pad two
   * neighbouring slots genuinely can both contain the point.
   *
   * @returns {?Element}
   */
  function hitTest(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let hit = null;
    try {
      hit = document.elementFromPoint(x, y);
    } catch { hit = null; }
    const exact = hit && hit.closest ? hit.closest(slotSelector) : null;
    if (exact) return exact;
    if (!padPx) return null;

    let best = null;
    let bestDistance = Infinity;
    for (const slot of scopeRoot().querySelectorAll(slotSelector)) {
      const rect = slot.getBoundingClientRect();
      if (!rect.width && !rect.height) continue;
      if (!pointInRect(x, y, rect, padPx)) continue;
      const distance = Math.hypot(x - (rect.left + rect.width / 2), y - (rect.top + rect.height / 2));
      if (distance < bestDistance) { bestDistance = distance; best = slot; }
    }
    return best;
  }

  // ------------------------------------------------------------------ ghost

  function buildGhost(piece, record) {
    const source = elementOf(piece);
    let ghost = null;
    try {
      ghost = makeGhost ? makeGhost(piece, record) : (source ? source.cloneNode(true) : null);
    } catch (err) {
      console.warn('[drag-to-slot-dom] makeGhost threw', err);
      ghost = source ? source.cloneNode(true) : null;
    }
    if (!ghost || ghost.nodeType !== 1) return null;

    if (ghostClass) ghost.classList.add(...String(ghostClass).split(/\s+/).filter(Boolean));
    ghost.setAttribute(GHOST_ATTR, '');
    ghost.setAttribute('aria-hidden', 'true');
    // A clone carries the original's identity with it. Two live `id`s is
    // invalid, and — much worse here — two live `data-target`s would make the
    // QLOBE_DEBUG v1 `tap()` helper and collectTargets() see the ghost as a
    // second copy of the piece for as long as the drag lasts.
    ghost.removeAttribute('id');
    ghost.removeAttribute('data-target');
    ghost.querySelectorAll?.('[id], [data-target]').forEach((node) => {
      node.removeAttribute('id');
      node.removeAttribute('data-target');
    });
    // Non-negotiable, whatever the game's CSS says: a ghost that takes pointer
    // events eats its own elementFromPoint and no drop ever resolves.
    ghost.style.pointerEvents = 'none';

    const host = resolve(ghostHost, document.body) || document.body;
    host.append(ghost);
    // The game's ghost class normally positions it (`.stone.dragging` is
    // `position: fixed`). Promote it only if nothing did, so we never fight a
    // game that positions absolutely inside its own layer.
    try {
      if (getComputedStyle(ghost).position === 'static') ghost.style.position = 'fixed';
    } catch { ghost.style.position = 'fixed'; }
    return ghost;
  }

  function moveGhost(record) {
    if (!record.ghost) return;
    record.ghost.style.left = `${record.x}px`;
    record.ghost.style.top = `${record.y}px`;
  }

  function dropGhost(record) {
    if (!record.ghost) return;
    record.ghost.remove();
    record.ghost = null;
  }

  // ------------------------------------------------------------- listeners

  function attach() {
    if (listening) return;
    // passive:false — we preventDefault on a real drag to stop the browser
    // turning it into a scroll.
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp, { passive: false });
    window.addEventListener('pointercancel', handleCancel, { passive: false });
    if (cancelOnBlur) {
      window.addEventListener('blur', handleBlur);
      window.addEventListener('pagehide', handleBlur);
      document.addEventListener('visibilitychange', handleVisibility);
    }
    listening = true;
  }

  /**
   * Idempotent: safe from up, cancel, teardown, and again after. Also drops an
   * airborne-but-not-settling record so a bare detach() can never wedge begin()
   * behind a drag whose pointer stream we just stopped listening to. A
   * *settling* record is left alone on purpose — it is the one-drag-at-a-time
   * guard for the duration of the onDrop await, and its own finally clears it.
   */
  function detach() {
    if (listening) {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('pagehide', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      listening = false;
    }
    if (drag && !drag.settling) {
      clearHover();
      dropGhost(drag);
      releaseCapture(drag);
      drag = null;
    }
    sweepStrayGhosts();
  }

  function releaseCapture(record) {
    if (!record || record.pointerId == null || !record.captureEl) return;
    try { record.captureEl.releasePointerCapture(record.pointerId); } catch { /* already gone */ }
    record.captureEl = null;
  }

  /** True when the event belongs to the active drag's pointer. */
  function matchesPointer(e) {
    if (!drag) return false;
    // A null pointerId means the press carried none (synthetic event). Being
    // lenient there is strictly safer than stranding the drag forever.
    if (drag.pointerId == null) return true;
    return e && e.pointerId === drag.pointerId;
  }

  async function safeCall(fn, piece, record) {
    try {
      await fn(piece, record);
      return true;
    } catch (err) {
      console.warn('[drag-to-slot-dom] handler threw', err);
      return false;
    }
  }

  function lift(record) {
    record.moved = true;
    if (!record.ghost) record.ghost = buildGhost(record.piece, record);
    moveGhost(record);
    // Capture is belt-and-braces on top of the window listeners; some Android
    // builds re-target the stream mid-gesture without it. It throws whenever the
    // element left the DOM (which an innerHTML re-render does constantly), and
    // that must not abort the drag — hence the swallow.
    if (record.pointerId != null && record.captureEl) {
      try { record.captureEl.setPointerCapture(record.pointerId); } catch { /* window listeners still cover it */ }
    }
    try { onLift(record.piece, record); } catch (err) { console.warn('[drag-to-slot-dom] onLift threw', err); }
  }

  function handleMove(e) {
    if (!drag || drag.settling || !matchesPointer(e)) return;
    const record = drag;
    record.lastX = e.clientX;
    record.lastY = e.clientY;

    if (!record.moved) {
      if (Math.hypot(e.clientX - record.startX, e.clientY - record.startY) <= slopPx) return;
      // preventDefault only once this is a real drag. Doing it from the first
      // move would kill the child's ability to scroll a stone grid they were
      // only ever trying to scroll.
      if (e.cancelable && e.preventDefault) e.preventDefault();
      record.x = e.clientX + record.grabX;
      record.y = e.clientY + record.grabY;
      lift(record);
      if (drag !== record) return;   // onLift tore the round down
    } else if (e.cancelable && e.preventDefault) {
      e.preventDefault();
    }

    record.x = e.clientX + record.grabX;
    record.y = e.clientY + record.grabY;
    moveGhost(record);
    const slot = hitTest(e.clientX, e.clientY);
    paintHover(slot);              // reads the previous record.slot — order matters
    record.slot = slot;
    try { onMove(record.piece, record); } catch (err) { console.warn('[drag-to-slot-dom] onMove threw', err); }
  }

  async function handleUp(e) {
    if (!drag || drag.settling || !matchesPointer(e)) return;
    const record = drag;
    const piece = record.piece;

    // A press that never moved is a tap: the game already handles it on its own
    // click path. Do not fire onDrop or we double-fire the attempt.
    if (!record.moved) {
      detach();
      if (drag === record) drag = null;
      try { onTap(piece, record); } catch (err) { console.warn('[drag-to-slot-dom] onTap threw', err); }
      return;
    }

    if (e.cancelable && e.preventDefault) e.preventDefault();

    // settling BEFORE detach: keeps the record alive as the one-drag-at-a-time
    // guard for the duration of the onDrop await.
    record.settling = true;
    detach();
    releaseCapture(record);

    const upX = Number.isFinite(e.clientX) ? e.clientX : record.lastX;
    const upY = Number.isFinite(e.clientY) ? e.clientY : record.lastY;
    record.lastX = upX;
    record.lastY = upY;
    record.x = upX + record.grabX;
    record.y = upY + record.grabY;
    // Resolve the slot BEFORE the ghost leaves, so `drag.slot` is what was under
    // the finger, then take the ghost away so the game's own re-render starts
    // from a clean document.
    record.slot = hitTest(upX, upY);
    clearHover();
    dropGhost(record);

    try {
      await onDrop(piece, record);
    } catch (err) {
      // The drop handler blew up between "ghost is gone" and "piece is placed".
      // Fall back to the game's own recovery path so the piece still goes home
      // and any input lock still clears — a stuck board is never acceptable.
      console.warn('[drag-to-slot-dom] onDrop threw; falling back to onCancel', err);
      await safeCall(onCancel, piece, record);
    } finally {
      if (drag === record) drag = null;
      sweepStrayGhosts();
    }
  }

  function handleCancel(e) {
    if (!drag || !matchesPointer(e)) return;
    cancel();
  }

  function handleBlur() {
    if (!drag) return;
    cancel();
  }

  function handleVisibility() {
    if (document.visibilityState === 'hidden') handleBlur();
  }

  // ------------------------------------------------------------------- API

  /**
   * Start a drag from a `pointerdown` handler. Returns true if a drag began.
   *
   * Rejects: an in-flight drag, a non-primary pointer (the second finger), a
   * failing canStart() gate, an unknown piece, or onGrab() returning false — and
   * in every one of those cases no window listener is ever attached and no
   * ghost is ever created.
   *
   * @param {PointerEvent} event
   * @param {*} id passed straight to getPiece()
   */
  function begin(event, id) {
    if (drag) return false;
    if (event && event.isPrimary === false) return false;
    if (!canStart()) return false;

    const piece = getPiece(id);
    const source = elementOf(piece);
    if (!piece || !source) return false;

    if (preventDefaultOnPress && event && event.cancelable && event.preventDefault) event.preventDefault();

    sweepStrayGhosts();

    const clientX = event && Number.isFinite(event.clientX) ? event.clientX : 0;
    const clientY = event && Number.isFinite(event.clientY) ? event.clientY : 0;

    // The grab offset, capped exactly as the Pixi original documents. At the DOM
    // default (grabOffset: 0) the cap is 0, so grabX/grabY are 0 and the ghost
    // centre rides the finger — which is what both pilots do today.
    let grabX = 0;
    let grabY = 0;
    if (offsetFraction > 0) {
      const rect = source.getBoundingClientRect();
      const capX = (rect.width / 2) * offsetFraction;
      const capY = (rect.height / 2) * offsetFraction;
      grabX = clamp(rect.left + rect.width / 2 - clientX, -capX, capX);
      grabY = clamp(rect.top + rect.height / 2 - clientY, -capY, capY);
    }

    const record = {
      pointerId: event ? event.pointerId : null,
      id,
      piece,
      el: source,
      captureEl: source,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      x: clientX + grabX,
      y: clientY + grabY,
      grabX,
      grabY,
      moved: false,
      settling: false,
      ghost: null,
      slot: null,
    };

    drag = record;
    let accepted = true;
    try {
      accepted = onGrab(piece, record) !== false;
    } catch (err) {
      console.warn('[drag-to-slot-dom] onGrab threw', err);
      accepted = false;
    }
    if (!accepted) {
      if (drag === record) drag = null;
      return false;
    }
    // onGrab may itself have cancelled (a failed selection, a round change).
    if (drag !== record) return false;

    if (ghostAtPress) {
      record.ghost = buildGhost(piece, record);
      moveGhost(record);
    }

    attach();
    return true;
  }

  /**
   * Abandon the drag: pointercancel (iPadOS palm rejection, an OS gesture
   * takeover), a window blur (app switch / notification eating the pointerup),
   * or the game tearing down a round. Always safe to call — with no drag in
   * flight it just sweeps.
   *
   * This is emphatically NOT a drop: the ghost is removed, no slot is resolved,
   * and `onCancel` runs instead of `onDrop`.
   */
  async function cancel() {
    const record = drag;
    if (!record || record.settling) {
      detach();
      return;
    }
    record.settling = true;
    const wasAirborne = record.moved;
    detach();
    releaseCapture(record);
    clearHover();
    record.slot = null;
    dropGhost(record);
    try {
      // A press that never lifted has nothing to put back; firing onCancel for
      // it would make a plain tap look like an abandoned drag to the game.
      if (wasAirborne) await onCancel(record.piece, record);
    } catch (err) {
      console.warn('[drag-to-slot-dom] onCancel threw', err);
    } finally {
      if (drag === record) drag = null;
      sweepStrayGhosts();
    }
  }

  return {
    begin,
    cancel,
    detach,
    hitTest,
    sweepStrayGhosts,
    get active() { return drag; },
  };
}
