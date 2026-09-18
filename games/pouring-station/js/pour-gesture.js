/* A small, dependency-free pointer controller for the Pouring Station pitcher. */

const clamp = (value, low = 0, high = 1) => Math.min(high, Math.max(low, value));

export function createPourGesture(element, options = {}) {
  if (!element || typeof element.addEventListener !== 'function') {
    throw new TypeError('createPourGesture requires an event target element');
  }

  const direction = options.direction === 1 ? 1 : -1;
  const maxTravelX = Math.max(1, Number(options.maxTravelX) || 280);
  const maxTravelY = Math.max(1, Number(options.maxTravelY) || 180);
  const pourThreshold = clamp(Number(options.pourThreshold) || 0.56);
  const onStart = typeof options.onStart === 'function' ? options.onStart : () => {};
  const onChange = typeof options.onChange === 'function' ? options.onChange : () => {};
  const onEnd = typeof options.onEnd === 'function' ? options.onEnd : () => {};
  const view = element.ownerDocument?.defaultView || globalThis;

  let state = { x: 0, y: 0, tilt: 0, angle: 0, pouring: false, dragging: false, pointerId: null };
  let startX = 0;
  let startY = 0;
  let active = false;
  let destroyed = false;

  const emit = (next, extra = {}) => {
    state = { ...state, ...next };
    onChange({ ...state, ...extra });
    return state;
  };

  const movementState = (rawX, rawY, dragging = true) => {
    const x = clamp(rawX, -maxTravelX, maxTravelX);
    const y = clamp(rawY, -maxTravelY, maxTravelY);
    const towardTarget = direction * x / maxTravelX;
    const lift = clamp(-y / maxTravelY);
    // A little lift helps a child pour naturally, while travel remains the main cue.
    const tilt = clamp(clamp(towardTarget) * 0.72 + lift * 0.28);
    return { x, y, tilt, angle: direction * tilt * 68, pouring: tilt >= pourThreshold, dragging };
  };

  const removeWindowListeners = () => {
    view.removeEventListener?.('pointermove', handleMove);
    view.removeEventListener?.('pointerup', handleUp);
    view.removeEventListener?.('pointercancel', handleCancel);
    view.removeEventListener?.('keyup', handleKeyUp);
    view.removeEventListener?.('blur', handleCancel);
  };

  const finish = (cancelled = false) => {
    if (!active) return;
    active = false;
    removeWindowListeners();
    const wasPouring = state.pouring;
    emit({ dragging: false, pointerId: null }, { cancelled, successful: !cancelled && wasPouring });
    onEnd({ ...state, cancelled, successful: !cancelled && wasPouring });
  };

  const handleMove = (event) => {
    if (!active || event.pointerId !== state.pointerId) return;
    emit({ ...movementState(event.clientX - startX, event.clientY - startY), pointerId: event.pointerId });
  };
  const handleUp = (event) => {
    if (active && event.pointerId === state.pointerId) finish(false);
  };
  // iPadOS can cancel a touch during gesture handoff; always unwind it as cancelled.
  const handleCancel = () => finish(true);

  // Keep the visible button honest for keyboard and switch users: holding
  // Space/Enter performs the same full lift-and-tilt pose as a pointer drag.
  const handleKeyUp = (event) => {
    if (state.pointerId !== 'keyboard' || ![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    finish(false);
  };
  const handleKeyDown = (event) => {
    if (destroyed || active || ![' ', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    active = true;
    emit({ ...movementState(direction * maxTravelX, -maxTravelY), pointerId: 'keyboard' });
    onStart({ ...state });
    view.addEventListener?.('keyup', handleKeyUp);
    view.addEventListener?.('blur', handleCancel);
  };

  const handleDown = (event) => {
    if (destroyed || active || event.isPrimary === false) return;
    active = true;
    startX = event.clientX;
    startY = event.clientY;
    emit({ ...movementState(0, 0), dragging: true, pointerId: event.pointerId });
    onStart({ ...state });
    view.addEventListener?.('pointermove', handleMove, { passive: true });
    view.addEventListener?.('pointerup', handleUp, { passive: true });
    view.addEventListener?.('pointercancel', handleCancel, { passive: true });
    view.addEventListener?.('blur', handleCancel);
  };

  element.addEventListener('pointerdown', handleDown);
  element.addEventListener('keydown', handleKeyDown);

  return {
    getState: () => ({ ...state }),
    cancel: () => finish(true),
    debugSet(values = {}) {
      if (destroyed) return;
      const next = movementState(Number(values.x) || 0, Number(values.y) || 0, values.dragging ?? state.dragging);
      if (values.tilt != null) {
        next.tilt = clamp(Number(values.tilt));
        next.angle = direction * next.tilt * 68;
        next.pouring = next.tilt >= pourThreshold;
      }
      emit({ ...next, pointerId: values.pointerId ?? state.pointerId });
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      removeWindowListeners();
      element.removeEventListener('pointerdown', handleDown);
      element.removeEventListener('keydown', handleKeyDown);
      active = false;
    },
  };
}
