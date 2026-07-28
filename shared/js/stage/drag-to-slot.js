// drag-to-slot.js — the one drag controller for Stage v2 Pixi engines.
//
// WHY THIS EXISTS
// ---------------
// The same ~90 lines of pointer plumbing were copy-pasted near-byte-identically
// into three engines (build-assemble.js, sequence-order.js, sort-into-bins.js):
// the window listener trio, the DRAG_SLOP gate, the 0.34 follow lerp, the 1.12
// lift, the dx-driven tilt, and the try/catch/finally around the drop. Three
// copies meant three places to fix a stranded-piece bug and three subtly
// different feels. This module owns that plumbing once.
//
// WHAT THIS MODULE OWNS
//   - the pointerdown -> pointermove -> pointerup/pointercancel lifecycle
//   - "one drag at a time" and the isPrimary === false (second finger) reject
//   - the slop gate, the lift (reparent to dragLayer + scale bump + cursor)
//   - client -> stage projection, and the follow/tilt easing in tick()
//   - keeping the card under the finger across a resize/orientation flip
//   - never leaving a piece stranded: idempotent detach, stray-clone sweep,
//     try/catch/finally around every engine callback
//
// WHAT THE ENGINE OWNS (deliberately NOT in here)
//   - ALL hit testing. The module knows nothing about slots, bins, rects, or
//     radii; it only reports where the card centre currently is, in stage
//     coords, as drag.stageX / drag.stageY. That is precisely what lets
//     sequence-order (nearest-centre within screenRadius) and sort-into-bins
//     (rect containment) both adopt it without the module growing a "target"
//     concept. Hover painting happens in onMove; placement happens in onDrop.
//   - selection, audio unlock, sfx, glide-home tweens, inputLocked, aria
//   - the shadow alpha on lift, unless you opt in via `shadowAlpha` (the three
//     engines disagree: build-assemble uses 0.28, the other two use 0.30)
//   - the window `blur` listener. The engine wires it and calls cancel(); the
//     module stays out of the engine's teardown ordering.
//
// WHY THE LISTENERS LIVE ON `window`
// ----------------------------------
// Interaction pattern #11 rule 1. Never on the dragged display object. A Pixi
// object can be reparented mid-drag (that is exactly what the lift does), the
// round can change underneath it, or the source can be destroyed — and any of
// those silently kills a pointerup bound to the object, leaving a floating
// card on a five-year-old's screen with no way to put it down. Window
// listeners survive all of it; we filter by pointerId instead. They are added
// on pointerdown with { passive: false } (we call preventDefault to stop the
// browser turning the drag into a scroll) and removed in detach().
//
// WHY THE GRAB OFFSET IS CAPPED
// -----------------------------
// Today every engine snaps the card *centre* to the finger. Children read that
// as the tile squirting out of their grip the instant they touch it. So we
// preserve the grab offset (view.x - pointer.x) instead. But an *uncapped*
// offset is its own bug: a child who grabs the far corner of a 124px card ends
// up dragging with a ~66px disagreement between where their finger is and
// where the card is, which then disagrees with the engine's hit test. So the
// offset is clamped to `grabOffset` (default 0.35) of the card half-size.
//
// grabOffset: 0 reproduces today's centre-on-finger behaviour BIT FOR BIT —
// cap = 0, so grabX/grabY are 0 and stageX/stageY are just the projected
// pointer, which is exactly what clientToStage() writes into desiredX/desiredY
// in all three engines today. That is the safe default for adoption:
// sequence-order.js and sort-into-bins.js are the next two intended adopters
// and should land with grabOffset: 0 first, then opt into the offset feel in a
// separate, separately-verifiable change.
//
// NOTE ON onDrop VS A TAP
// -----------------------
// onDrop fires only for a drag that passed DRAG_SLOP. A pointerup that never
// moved is a tap, and in all three engines a tap is already fully handled on
// the way down (select + the tap-to-place path); firing onDrop for it would
// double-fire the attempt. A tap therefore just restores the cursor.

/** Pixels the pointer must travel before a press becomes a drag. */
export const DRAG_SLOP = 8;

/** Fallback local (unscaled) card size — matches TRAY_CARD in build-assemble. */
const DEFAULT_HIT_LOCAL_SIZE = 124;

function clamp(value, min, max) {
  return value < min ? min : (value > max ? max : value);
}

function num(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Create a drag controller.
 *
 * @param {object}   opts
 * @param {object}   opts.stage         { PIXI, app, size() } from stage.js
 * @param {object|Function} opts.dragLayer  PIXI.Container, or () => PIXI.Container
 * @param {Function} opts.getPiece      (id) -> piece | null, where piece is
 *        { view, motion, shadow, homeX, homeY, homeScale, hitLocalSize }
 * @param {Function} [opts.canStart]    () -> boolean engine gate
 * @param {Function} [opts.onGrab]      (piece, drag) -> false aborts BEFORE listeners attach
 * @param {Function} [opts.onLift]      (piece, drag) first move past DRAG_SLOP
 * @param {Function} [opts.onMove]      (piece, drag) every move — paint hover here
 * @param {Function} [opts.onDrop]      async (piece, drag) pointerup after a real drag
 * @param {Function} [opts.onCancel]    async (piece, drag) pointercancel / blur / cancel()
 * @param {Function} [opts.reducedMotion] () -> boolean
 * @param {number}   [opts.grabOffset=0.35] fraction of the card half-size the
 *        grab offset may reach. 0 == today's centre-on-finger behaviour.
 * @param {number}   [opts.lift=1.12]   scale multiplier once the drag starts
 * @param {number}   [opts.follow=0.34] position lerp factor per tick
 * @param {object}   [opts.tilt]        { k: 0.0025, max: 0.12, ease: 0.22 }
 * @param {?number}  [opts.shadowAlpha=null] if a number, piece.shadow.alpha is
 *        set to it on lift; null (default) leaves the shadow alone so adopting
 *        engines keep their own value.
 * @returns {{ begin: Function, tick: Function, reproject: Function,
 *            cancel: Function, detach: Function, sweepStrayClones: Function,
 *            active: object|null }}
 */
export function createDragToSlot({
  stage,
  dragLayer,
  getPiece,
  canStart = () => true,
  onGrab = () => true,
  onLift = () => {},
  onMove = () => {},
  onDrop = async () => {},
  onCancel = async () => {},
  reducedMotion = () => false,
  grabOffset = 0.35,
  lift = 1.12,
  follow = 0.34,
  tilt = { k: 0.0025, max: 0.12, ease: 0.22 },
  shadowAlpha = null,
} = {}) {
  if (typeof getPiece !== 'function') throw new Error('drag-to-slot requires getPiece(id)');

  const tiltK = num(tilt && tilt.k, 0.0025);
  const tiltMax = num(tilt && tilt.max, 0.12);
  const tiltEase = num(tilt && tilt.ease, 0.22);
  const offsetFraction = Math.max(0, num(grabOffset, 0.35));
  const liftScale = num(lift, 1.12);
  const followK = num(follow, 0.34);

  let drag = null;
  let listening = false;

  // ---------------------------------------------------------------- helpers

  function resolveDragLayer() {
    try {
      return typeof dragLayer === 'function' ? dragLayer() : dragLayer;
    } catch {
      return null;
    }
  }

  /** Project client (CSS px) coords into stage coords. */
  function project(clientX, clientY) {
    const cx = num(clientX, 0);
    const cy = num(clientY, 0);
    if (!stage || !stage.app || !stage.app.canvas || typeof stage.size !== 'function') {
      return { x: cx, y: cy };
    }
    const rect = stage.app.canvas.getBoundingClientRect();
    const size = stage.size();
    return {
      x: rect.width ? (cx - rect.left) * size.w / rect.width : cx,
      y: rect.height ? (cy - rect.top) * size.h / rect.height : cy,
    };
  }

  function homeScaleOf(piece) {
    return num(piece && piece.homeScale, 1) || 1;
  }

  /** Recompute stageX/stageY from the stored pointer position + grab offset. */
  function applyOffset() {
    drag.stageX = drag.pointerStageX + drag.grabX;
    drag.stageY = drag.pointerStageY + drag.grabY;
  }

  function setPointer(clientX, clientY) {
    const point = project(clientX, clientY);
    drag.pointerStageX = point.x;
    drag.pointerStageY = point.y;
    applyOffset();
  }

  function setCursor(piece, cursor) {
    if (piece && piece.view) piece.view.cursor = cursor;
  }

  /**
   * Interaction pattern #11 rule 5. Should be dead code — keep it anyway.
   * build-assemble currently lacks this entirely; every adopter gains it.
   */
  function sweepStrayClones() {
    if (typeof document === 'undefined' || !document.querySelectorAll) return;
    document.querySelectorAll('.drag-clone').forEach((node) => node.remove());
  }

  /** True when the event belongs to the active drag's pointer. */
  function matchesPointer(e) {
    if (!drag) return false;
    // A null pointerId means the press did not carry one (synthetic event).
    // Being lenient there is strictly safer than stranding the drag forever.
    if (drag.pointerId == null) return true;
    return e && e.pointerId === drag.pointerId;
  }

  async function safeCall(fn, piece, record) {
    try {
      await fn(piece, record);
      return true;
    } catch (err) {
      console.warn('[drag-to-slot] handler threw', err);
      return false;
    }
  }

  // ------------------------------------------------------------- listeners

  function attach() {
    if (listening) return;
    window.addEventListener('pointermove', handleMove, { passive: false });
    window.addEventListener('pointerup', handleUp, { passive: false });
    window.addEventListener('pointercancel', handleCancel, { passive: false });
    listening = true;
  }

  /**
   * Idempotent: safe to call from up, cancel, destroy, and again after.
   * Also drops an airborne-but-not-yet-settling drag record, so a bare
   * detach() (engine teardown, round change) can never wedge begin() behind a
   * drag whose pointer stream we just stopped listening to. A *settling* drag
   * is left in place on purpose: it is the "one drag at a time" guard while an
   * onDrop await is still running, and its own finally clears it.
   */
  function detach() {
    if (listening) {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleCancel);
      listening = false;
    }
    if (drag && !drag.settling) drag = null;
    sweepStrayClones();
  }

  function handleMove(e) {
    if (!drag || drag.settling || !matchesPointer(e)) return;
    if (e.preventDefault) e.preventDefault();
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    const piece = drag.piece;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_SLOP) {
      drag.moved = true;
      const layer = resolveDragLayer();
      if (layer && piece && piece.view) layer.addChild(piece.view);
      setCursor(piece, 'grabbing');
      if (shadowAlpha != null && piece && piece.shadow) piece.shadow.alpha = shadowAlpha;
      if (piece && piece.view) piece.view.scale.set(homeScaleOf(piece) * liftScale);
      try { onLift(piece, drag); } catch (err) { console.warn('[drag-to-slot] onLift threw', err); }
    }

    if (!drag.moved) return;
    setPointer(e.clientX, e.clientY);
    try { onMove(piece, drag); } catch (err) { console.warn('[drag-to-slot] onMove threw', err); }
  }

  async function handleUp(e) {
    if (!drag || drag.settling || !matchesPointer(e)) return;
    if (e.preventDefault) e.preventDefault();
    const record = drag;
    const piece = record.piece;

    // A press that never moved is a tap: the engine already handled it on the
    // way down. Do not fire onDrop or we double-fire the attempt.
    if (!record.moved) {
      detach();
      setCursor(piece, 'grab');
      if (drag === record) drag = null;
      return;
    }

    // settling BEFORE detach: keeps the record alive as the one-drag-at-a-time
    // guard for the duration of the onDrop await.
    record.settling = true;
    detach();
    record.lastX = e.clientX;
    record.lastY = e.clientY;
    setPointer(e.clientX, e.clientY);
    if (piece && piece.view) piece.view.position.set(record.stageX, record.stageY);

    try {
      await onDrop(piece, record);
    } catch (err) {
      // The engine's drop handler blew up between "card is floating" and "card
      // is placed". Fall back to its own recovery path so the piece still goes
      // home and inputLocked still clears — a stuck card is never acceptable.
      console.warn('[drag-to-slot] onDrop threw; falling back to onCancel', err);
      await safeCall(onCancel, piece, record);
    } finally {
      setCursor(piece, 'grab');
      if (drag === record) drag = null;
      sweepStrayClones();
    }
  }

  function handleCancel(e) {
    if (!drag || !matchesPointer(e)) return;
    if (e && e.preventDefault) e.preventDefault();
    cancel();
  }

  // ------------------------------------------------------------------- API

  /**
   * Start a drag from a Pixi pointerdown event. Returns true if a drag began.
   * Rejects: an in-flight drag, a non-primary pointer (second finger), a
   * failing canStart() gate, an unknown piece, or onGrab() returning false —
   * and in every one of those cases no window listener is ever attached.
   */
  function begin(pixiEvent, id) {
    if (drag) return false;
    const original = pixiEvent && pixiEvent.originalEvent ? pixiEvent.originalEvent : pixiEvent;
    if (original && original.isPrimary === false) return false;
    if (!canStart()) return false;

    const piece = getPiece(id);
    if (!piece || !piece.view) return false;

    if (original && original.preventDefault) original.preventDefault();
    if (original && original.stopPropagation) original.stopPropagation();

    sweepStrayClones();

    const clientX = original && Number.isFinite(original.clientX) ? original.clientX : 0;
    const clientY = original && Number.isFinite(original.clientY) ? original.clientY : 0;
    const p0 = project(clientX, clientY);

    const homeScale = homeScaleOf(piece);
    const half = num(piece.hitLocalSize, DEFAULT_HIT_LOCAL_SIZE) * homeScale / 2;
    const cap = half * offsetFraction;

    const record = {
      pointerId: original ? original.pointerId : null,
      id,
      piece,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      stageX: p0.x,
      stageY: p0.y,
      pointerStageX: p0.x,
      pointerStageY: p0.y,
      grabX: clamp(num(piece.view.x, p0.x) - p0.x, -cap, cap),
      grabY: clamp(num(piece.view.y, p0.y) - p0.y, -cap, cap),
      grabScale: homeScale,
      moved: false,
      settling: false,
    };
    record.stageX = record.pointerStageX + record.grabX;
    record.stageY = record.pointerStageY + record.grabY;

    drag = record;
    let accepted = true;
    try {
      accepted = onGrab(piece, record) !== false;
    } catch (err) {
      console.warn('[drag-to-slot] onGrab threw', err);
      accepted = false;
    }
    if (!accepted) {
      if (drag === record) drag = null;
      return false;
    }
    // onGrab may itself have cancelled (e.g. a failed selection).
    if (drag !== record) return false;

    attach();
    return true;
  }

  /** Ticker step: follow lerp + tilt easing. No-op unless a drag is airborne. */
  function tick() {
    if (!drag || !drag.moved || drag.settling) return;
    const piece = drag.piece;
    if (!piece || !piece.view) return;
    const view = piece.view;

    if (reducedMotion()) {
      view.position.set(drag.stageX, drag.stageY);
      view.rotation = 0;
      return;
    }

    const dx = drag.stageX - view.x;
    const dy = drag.stageY - view.y;
    view.x += dx * followK;
    view.y += dy * followK;
    view.rotation += (clamp(dx * tiltK, -tiltMax, tiltMax) - view.rotation) * tiltEase;
  }

  /**
   * Call from the engine's layout pass (resize / orientation change). Two jobs:
   *  1. re-project the last known finger position into the NEW stage coords;
   *  2. rescale the grab offset by the homeScale change — an orientation flip
   *     can change homeScale substantially, and without the rescale the art
   *     ends up tens of pixels away from the finger for the rest of the drag.
   * If the drag has not passed slop yet there is nothing airborne, so the view
   * is snapped back to its (freshly laid out) home.
   */
  function reproject() {
    if (!drag) return;
    const piece = drag.piece;
    // A destroyed Pixi display object is still a truthy reference, but it nulls its
    // `position` and `scale`, so the writes below would throw. That matters far more
    // than it looks: reproject() is called from the engine's layout pass, the layout
    // pass runs when a round changes, and a round changes on the very placement whose
    // drag is still settling. The throw then propagates into the drop handler, gets
    // swallowed by the try/catch that exists to stop a drag stranding a piece, and the
    // new round never arms its input — a finished-looking board a child cannot play.
    if (!piece || !piece.view || piece.view.destroyed
        || !piece.view.position || !piece.view.scale) return;

    const point = project(drag.lastX, drag.lastY);
    drag.pointerStageX = point.x;
    drag.pointerStageY = point.y;

    const homeScale = homeScaleOf(piece);
    const k = homeScale / (num(drag.grabScale, 1) || 1);
    drag.stageX = drag.pointerStageX + drag.grabX * k;
    drag.stageY = drag.pointerStageY + drag.grabY * k;
    drag.grabX *= k;
    drag.grabY *= k;
    drag.grabScale = homeScale;

    if (!drag.moved) {
      if (Number.isFinite(piece.homeX) && Number.isFinite(piece.homeY)) {
        piece.view.position.set(piece.homeX, piece.homeY);
      }
      piece.view.scale.set(homeScale);
      return;
    }
    piece.view.scale.set(homeScale * liftScale);
  }

  /**
   * Abandon the drag: pointercancel (iOS gesture takeover), window blur (app
   * switch / notification eating the pointerup), or the engine tearing down a
   * round. Always safe to call — with no drag in flight it just sweeps.
   */
  async function cancel() {
    const record = drag;
    if (!record || record.settling) {
      detach();
      return;
    }
    record.settling = true;
    detach();
    const piece = record.piece;
    try {
      await onCancel(piece, record);
    } catch (err) {
      console.warn('[drag-to-slot] onCancel threw', err);
    } finally {
      setCursor(piece, 'grab');
      if (drag === record) drag = null;
      sweepStrayClones();
    }
  }

  return {
    begin,
    tick,
    reproject,
    cancel,
    detach,
    sweepStrayClones,
    get active() { return drag; },
  };
}
