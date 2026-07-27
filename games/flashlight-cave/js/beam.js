// beam.js — the continuous drag (game-design.md §6).
//
// THE BEAM CENTRE IS THE FINGER. There is no puck, no dock, no draggable
// flashlight body to grab: a handle is a small precision target in a dark scene,
// and it puts the child's hand somewhere other than where they are looking
// (§6.1, §9.6). Because nothing is ever cloned or reparented, the entire
// stranded-clone failure class of docs/interaction-patterns.md §11 is
// structurally absent here rather than defended against — the thing being moved
// is a light, and a light in the wrong place is just a light in the wrong place.
//
// Every §11 rule that DOES apply is honoured literally:
//   1. window-level pointermove/up/cancel, filtered by pointerId
//   2. one drag at a time; e.isPrimary === false ignored
//   3. pointercancel AND window blur both end the drag, leaving the beam put
//   6. touch-action: none on the canvas, manipulation on the HUD (css/style.css)
//   7. tap-to-move is the equal easier path — a child who will not drag plays the
//      whole game one tap at a time, through the identical calls a drag makes
//
// The decision tree of §6.4 lives in exactly one place, `up()`:
//   moved past DRAG_SLOP → the drag ends, the beam stays where it is
//   under the slop       → it is a TAP, and the game decides (resolveTap):
//                          a lit letter under the point ⇒ an answer
//                          anything else, INCLUDING an unlit letter ⇒ a move
//
// This module never judges an answer. It hands the game an art-space point.

const DRAG_SLOP = 10;          // screen px before a press becomes a drag
const LERP_K = 0.45;           // critically-damped follow; raw finger jitter
                               // strobes the whole scene, and the lerp kills it
const TAP_MOVE_MS = 220;       // tap-to-move glide
const KEY_NUDGE = 0.4;         // × radius, per arrow press (§15)

const reducedMotion = () =>
  !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class BeamController {
  /**
   * @param {object} o
   * @param {HTMLElement} o.host        the `.fc-stage` element (the canvas host)
   * @param {object} o.spotlight        shared/js/stage/spotlight.js instance (art space)
   * @param {object} o.transform        cave.js's art↔screen transform
   * @param {() => {x0:number,x1:number,y0:number,y1:number}} o.clampRect
   * @param {(pt:{x:number,y:number}) => any} o.onTap        a tap, in ART space
   * @param {() => void} [o.onGesture]  any pointer/key event — clears idle timers
   * @param {() => void} [o.onUnlock]   audio unlock, on pointerdown only
   * @param {() => void} [o.onKeyAnswer] Enter/Space
   */
  constructor({ host, spotlight, transform, clampRect, onTap, onGesture, onUnlock, onKeyAnswer }) {
    this.host = host;
    this.spot = spotlight;
    this.tf = transform;
    this.clampRect = clampRect;
    this.hooks = { onTap, onGesture, onUnlock, onKeyAnswer };
    this.enabled = true;
    this.drag = null;
    this.raf = 0;

    this.onDown = (e) => this.down(e);
    this.onMove = (e) => this.move(e);
    this.onUp = (e) => this.up(e);
    this.onCancel = (e) => { if (this.drag && e.pointerId === this.drag.id) this.cancel(); };
    this.onBlur = () => this.cancel();
    this.onKey = (e) => this.key(e);

    host.addEventListener('pointerdown', this.onDown);
    host.addEventListener('keydown', this.onKey);
    window.addEventListener('blur', this.onBlur);
  }

  /** The reveal and end screens are inert: the beam does not move (§3.3). */
  setEnabled(on) {
    this.enabled = !!on;
    if (!this.enabled) this.cancel();
  }

  /** Clamp an art point into the reachable rect (§6.5). */
  clampArt(x, y) {
    const r = this.clampRect();
    return { x: clamp(x, r.x0, r.x1), y: clamp(y, r.y0, r.y1) };
  }

  /** Client coords → art coords. */
  artOf(e) {
    const r = this.host.getBoundingClientRect();
    return this.tf.toArt(e.clientX - r.left, e.clientY - r.top);
  }

  /** Move the beam. `ms` 0 snaps. Art space. */
  moveTo(x, y, { ms = 0 } = {}) {
    const p = this.clampArt(x, y);
    return this.spot.moveTo(p.x, p.y, { ms });
  }

  // ---- pointer -------------------------------------------------------------

  down(e) {
    if (!this.enabled) return;
    if (e.isPrimary === false) return;      // a second finger never fights the first
    if (this.drag) return;                  // one drag at a time — rule 2
    e.preventDefault();
    // A beam move is not a button: no tick, no sound (§6.4). The unlock still
    // has to happen here, because this is the first gesture of many sessions.
    this.hooks.onUnlock?.();
    this.hooks.onGesture?.();

    const art = this.artOf(e);
    this.drag = {
      id: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
      moved: false,
      target: this.clampArt(art.x, art.y),
    };
    // Listeners on window, filtered by pointerId — rule 1. Pointer capture is an
    // optimisation only, never the correctness mechanism.
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onCancel);
    try { this.host.setPointerCapture(e.pointerId); } catch { /* optional */ }
  }

  move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < DRAG_SLOP) return;
    d.moved = true;
    this.hooks.onGesture?.();
    const art = this.artOf(e);
    d.target = this.clampArt(art.x, art.y);
    if (reducedMotion()) {
      this.spot.moveTo(d.target.x, d.target.y);       // instant snap, no smoothing
      return;
    }
    this.startFollow();
  }

  /** The critically-damped follow. Its own rAF, stopped the moment it settles. */
  startFollow() {
    if (this.raf) return;
    const step = () => {
      this.raf = 0;
      const d = this.drag;
      if (!d) return;
      const dx = d.target.x - this.spot.x;
      const dy = d.target.y - this.spot.y;
      this.spot.moveTo(this.spot.x + dx * LERP_K, this.spot.y + dy * LERP_K);
      if (Math.hypot(dx, dy) > 0.5) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.release();
    if (d.moved) return;                       // the beam stays where it is (§6.2)
    // A press that never travelled is a TAP. The game owns the decision; this
    // module only says where.
    const art = this.artOf(e);
    try {
      this.hooks.onTap?.(this.clampArt(art.x, art.y));
    } catch { /* an exception here must never strand the drag state */ }
  }

  /** iOS fires cancel on gesture takeover; app switches eat pointerup entirely. */
  cancel() {
    if (!this.drag) return;
    this.release();
  }

  release() {
    const d = this.drag;
    this.drag = null;
    if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    if (d) { try { this.host.releasePointerCapture(d.id); } catch { /* fine */ } }
  }

  // ---- keyboard / AT (§15) --------------------------------------------------

  key(e) {
    if (!this.enabled) return;
    const R = this.spot.radius;
    const step = R * KEY_NUDGE;
    let dx = 0;
    let dy = 0;
    if (e.key === 'ArrowLeft') dx = -step;
    else if (e.key === 'ArrowRight') dx = step;
    else if (e.key === 'ArrowUp') dy = -step;
    else if (e.key === 'ArrowDown') dy = step;
    else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      this.hooks.onGesture?.();
      this.hooks.onKeyAnswer?.();
      return;
    } else return;
    e.preventDefault();
    this.hooks.onGesture?.();
    this.moveTo(this.spot.x + dx, this.spot.y + dy, { ms: reducedMotion() ? 0 : 120 });
  }

  // ---- tap-to-move ----------------------------------------------------------

  /** The equal easier path (§6.4). Instant under reduced motion. */
  glideTo(x, y) {
    return this.moveTo(x, y, { ms: reducedMotion() ? 0 : TAP_MOVE_MS });
  }

  destroy() {
    this.release();
    this.host.removeEventListener('pointerdown', this.onDown);
    this.host.removeEventListener('keydown', this.onKey);
    window.removeEventListener('blur', this.onBlur);
  }
}

export { DRAG_SLOP, TAP_MOVE_MS };
