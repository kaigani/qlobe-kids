// Continuous finger gestures for Snack Chef.
// Every controller owns one active pointer, listens on window so a removed
// source cannot strand input, and treats pointercancel/blur as a clean cancel.

function pointInside(el, x, y, pad = 0) {
  const r = el.getBoundingClientRect();
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
}

export function pathGestures(root, {
  selector = '[data-gesture]',
  threshold = 80,
  requireCurrent = true,
  onProgress = () => {},
  onComplete = () => {},
  onWrongStart = () => {},
} = {}) {
  let active = null;

  const move = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const dx = e.clientX - active.x;
    const dy = e.clientY - active.y;
    active.x = e.clientX;
    active.y = e.clientY;
    if (!pointInside(active.el, e.clientX, e.clientY, 44)) return;
    const delta = active.axis === 'y' ? Math.max(0, dy) : Math.max(0, dx);
    active.travel += delta;
    onProgress(active.el, Math.min(1, active.travel / threshold));
    if (active.travel < threshold) return;
    const done = active;
    cleanup();
    onComplete(done.el);
  };

  const cleanup = () => {
    if (!active) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    active = null;
  };

  const up = (e) => {
    if (!active || e.pointerId !== active.id) return;
    cleanup();
  };

  const cancel = () => cleanup();

  const down = (e) => {
    const el = e.target.closest(selector);
    if (!el || !root.contains(el) || el.classList.contains('done')) return;
    if (active || e.isPrimary === false) return;
    const start = el.querySelector('.gesture-start');
    if ((requireCurrent && !el.classList.contains('is-current'))
      || (start && !pointInside(start, e.clientX, e.clientY, 34))) {
      onWrongStart(el);
      return;
    }
    e.preventDefault();
    active = {
      id: e.pointerId,
      el,
      axis: el.dataset.axis === 'y' ? 'y' : 'x',
      x: e.clientX,
      y: e.clientY,
      travel: 0,
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  root.addEventListener('pointerdown', down);
  window.addEventListener('blur', cancel);
  return () => {
    cleanup();
    root.removeEventListener('pointerdown', down);
    window.removeEventListener('blur', cancel);
  };
}

export function coverageGesture(surface, {
  cell = 58,
  needed = 18,
  startEl = null,
  onDab = () => {},
  onProgress = () => {},
  onComplete = () => {},
  onWrongStart = () => {},
} = {}) {
  let active = null;
  const touched = new Set();
  let complete = false;

  const dab = (clientX, clientY) => {
    if (complete || !pointInside(surface, clientX, clientY, -12)) return;
    const r = surface.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
    if (touched.has(key)) return;
    touched.add(key);
    onDab(x, y);
    const progress = Math.min(1, touched.size / needed);
    onProgress(progress, touched.size);
    if (progress < 1) return;
    complete = true;
    cleanup();
    onComplete();
  };

  const move = (e) => {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    dab(e.clientX, e.clientY);
  };

  const cleanup = () => {
    if (!active) return;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    active = null;
  };

  const up = (e) => {
    if (!active || e.pointerId !== active.id) return;
    cleanup();
  };

  const cancel = () => cleanup();

  const down = (e) => {
    if (active || complete || e.isPrimary === false) return;
    if (!touched.size && startEl && !pointInside(startEl, e.clientX, e.clientY, 38)) {
      onWrongStart();
      return;
    }
    e.preventDefault();
    active = { id: e.pointerId };
    dab(e.clientX, e.clientY);
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  surface.addEventListener('pointerdown', down);
  window.addEventListener('blur', cancel);

  return {
    addProgress(count = 1) {
      for (let i = 0; i < count && !complete; i += 1) {
        const key = `debug:${touched.size}`;
        touched.add(key);
      }
      const progress = Math.min(1, touched.size / needed);
      onProgress(progress, touched.size);
      if (progress >= 1 && !complete) {
        complete = true;
        onComplete();
      }
    },
    destroy() {
      cleanup();
      surface.removeEventListener('pointerdown', down);
      window.removeEventListener('blur', cancel);
    },
  };
}

export function holdPour(surface, {
  cupEl = null,
  needed = 12,
  tickMs = 220,
  onHoldStart = () => {},
  onHoldEnd = () => {},
  onTick = () => {},
  onProgress = () => {},
  onComplete = () => {},
  onWrongStart = () => {},
} = {}) {
  let active = null;
  let raf = 0;
  let held = 0;
  let ticks = 0;
  let complete = false;

  const emit = () => {
    onProgress(Math.min(1, ticks / needed), ticks);
    if (ticks >= needed && !complete) {
      complete = true;
      stopHold();
      onComplete();
    }
  };

  const frame = (now) => {
    if (!active || complete) return;
    if (now - held >= tickMs) {
      held = now;
      ticks += 1;
      onTick(ticks);
      emit();
    }
    if (active) raf = requestAnimationFrame(frame);
  };

  const stopHold = () => {
    if (!active) return;
    cancelAnimationFrame(raf);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    active = null;
    onHoldEnd();
  };

  // Release, leave, or cancel all pause the pour — fill persists, never fails.
  const up = (e) => {
    if (!active || (e?.pointerId != null && e.pointerId !== active.id)) return;
    stopHold();
  };

  const down = (e) => {
    if (active || complete || e.isPrimary === false) return;
    const target = cupEl || surface;
    if (!pointInside(target, e.clientX, e.clientY, 26)) {
      onWrongStart();
      return;
    }
    e.preventDefault();
    active = { id: e.pointerId };
    held = performance.now();
    onHoldStart();
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    raf = requestAnimationFrame(frame);
  };

  const blur = () => stopHold();
  surface.addEventListener('pointerdown', down);
  window.addEventListener('blur', blur);

  return {
    addProgress(count = 1) {
      ticks = Math.min(needed, ticks + count);
      emit();
    },
    destroy() {
      stopHold();
      surface.removeEventListener('pointerdown', down);
      window.removeEventListener('blur', blur);
    },
  };
}

export function ingredientDrag(tray, {
  getSlot = () => null,
  onSelect = () => {},
  onDrop = () => {},
  onCancel = () => {},
} = {}) {
  let active = null;

  function sweep() {
    document.querySelectorAll('.drag-clone').forEach((el) => el.remove());
  }

  const move = (e) => {
    if (!active || e.pointerId !== active.id) return;
    const dx = e.clientX - active.startX;
    const dy = e.clientY - active.startY;
    if (!active.moved && Math.hypot(dx, dy) > 8) {
      active.moved = true;
      active.clone = active.el.cloneNode(true);
      active.clone.classList.add('drag-clone');
      active.clone.removeAttribute('id');
      document.body.appendChild(active.clone);
      active.el.style.opacity = '.25';
    }
    if (!active.clone) return;
    active.clone.style.left = `${e.clientX}px`;
    active.clone.style.top = `${e.clientY}px`;
  };

  const finish = (e, cancelled = false) => {
    if (!active || (e?.pointerId != null && e.pointerId !== active.id)) return;
    const record = active;
    active = null;
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    record.el.style.opacity = '';
    record.clone?.remove();
    if (cancelled) {
      onCancel(record.el);
      return;
    }
    if (!record.moved) {
      onSelect(record.el);
      return;
    }
    const slot = getSlot(e.clientX, e.clientY, record.el.dataset.kind);
    if (slot) onDrop(record.el, slot);
    else onCancel(record.el);
  };

  const up = (e) => finish(e, false);
  const cancel = (e) => finish(e, true);

  const down = (e) => {
    const el = e.target.closest('.ingredient');
    if (!el || !tray.contains(el) || el.classList.contains('placed')) return;
    if (active || e.isPrimary === false) return;
    e.preventDefault();
    sweep();
    active = {
      id: e.pointerId,
      el,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      clone: null,
    };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
  };

  tray.addEventListener('pointerdown', down);
  window.addEventListener('blur', cancel);

  return () => {
    if (active) finish(null, true);
    sweep();
    tray.removeEventListener('pointerdown', down);
    window.removeEventListener('blur', cancel);
  };
}
