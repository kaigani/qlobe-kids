// Reusable direct-manipulation surface for open-ended creation games.
// Items use normalized center coordinates, so snapshots survive orientation changes.

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const clone = (value) => JSON.parse(JSON.stringify(value));
const normalizeAngle = (value) => {
  const angle = Number(value) || 0;
  return ((angle + 180) % 360 + 360) % 360 - 180;
};

export function createFreeformBoard(container, {
  interactive = true,
  reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches,
  holdRotate = null,
  onChange = () => {},
  onSelect = () => {},
  onGrab = () => {},
  onDrag = () => {},
  onDrop = () => {},
} = {}) {
  if (!(container instanceof HTMLElement)) throw new Error('freeform-board requires an HTMLElement');

  const items = new Map();
  const history = [];
  let selected = null;
  let active = null;
  let nextZ = 10;
  let destroyed = false;
  const hold = holdRotate ? {
    delay: Math.max(0, Number(holdRotate.delay) || 520),
    tolerance: Math.max(4, Number(holdRotate.tolerance) || 22),
    degreesPerSecond: Math.max(1, Number(holdRotate.degreesPerSecond) || 30),
  } : null;

  container.classList.add('qlobe-freeform-board');

  function serializable(item) {
    return {
      id: item.id,
      kind: item.kind,
      src: item.src,
      alt: item.alt,
      x: item.x,
      y: item.y,
      size: item.size,
      rotation: item.rotation,
      mirror: item.mirror,
      z: item.z,
      meta: clone(item.meta || {}),
    };
  }

  function snapshot() {
    return {
      format: 'qlobe-freeform-board',
      formatVersion: 1,
      items: [...items.values()].sort((a, b) => a.z - b.z).map(serializable),
    };
  }

  function emit(reason, item = null) {
    onChange(snapshot(), { reason, item: item ? serializable(item) : null });
  }

  function remember() {
    history.push(snapshot());
    if (history.length > 40) history.shift();
  }

  function applyTransform(item, dragging = false) {
    const lift = dragging && !reducedMotion ? 1.08 : 1;
    const tilt = dragging && !reducedMotion ? item.rotation - 3 : item.rotation;
    item.el.style.left = `${item.x * 100}%`;
    item.el.style.top = `${item.y * 100}%`;
    item.el.style.zIndex = String(item.z);
    item.el.style.setProperty('--piece-size', `${item.size * 100}%`);
    item.el.style.transform = `translate(-50%, -50%) rotate(${tilt}deg) scale(${item.mirror ? -lift : lift}, ${lift})`;
  }

  function applyAutoMirror(item) {
    if (!item.meta?.autoMirror) return;
    const sourceFacesLeft = item.meta.sourceFacing === 'left';
    item.mirror = sourceFacesLeft ? item.x > .5 : item.x < .5;
  }

  function select(id) {
    if (selected && items.has(selected)) {
      const previous = items.get(selected).el;
      previous.classList.remove('is-selected');
      previous.setAttribute('aria-pressed', 'false');
    }
    selected = items.has(id) ? id : null;
    if (selected) {
      const item = items.get(selected);
      item.z = ++nextZ;
      item.el.classList.add('is-selected');
      item.el.setAttribute('aria-pressed', 'true');
      applyTransform(item);
      onSelect(serializable(item));
    } else {
      onSelect(null);
    }
    return selected;
  }

  function clearHoldRotation(drag = active) {
    if (!drag) return;
    clearTimeout(drag.holdTimer);
    cancelAnimationFrame(drag.holdFrame || 0);
    drag.holdTimer = 0;
    drag.holdFrame = 0;
    drag.rotating = false;
  }

  function armHoldRotation(clientX, clientY) {
    if (!hold || !active) return;
    clearHoldRotation(active);
    active.holdAnchorX = clientX;
    active.holdAnchorY = clientY;
    active.holdTimer = window.setTimeout(() => {
      if (!active) return;
      active.rotating = true;
      active.lastRotateAt = performance.now();
      const rotateFrame = (now) => {
        if (!active?.rotating) return;
        const elapsed = Math.min(64, Math.max(0, now - active.lastRotateAt));
        active.lastRotateAt = now;
        active.item.rotation = normalizeAngle(
          active.item.rotation + hold.degreesPerSecond * elapsed / 1000,
        );
        active.rotated = true;
        active.moved = true;
        applyTransform(active.item, true);
        onDrag(serializable(active.item), {
          clientX: active.holdAnchorX,
          clientY: active.holdAnchorY,
          rotating: true,
        });
        active.holdFrame = requestAnimationFrame(rotateFrame);
      };
      active.holdFrame = requestAnimationFrame(rotateFrame);
    }, hold.delay);
  }

  function pointerDown(event) {
    if (!interactive || active || event.isPrimary === false) return;
    const el = event.currentTarget;
    const item = items.get(el.dataset.freeformId);
    if (!item) return;
    event.preventDefault();
    select(item.id);
    const rect = container.getBoundingClientRect();
    const itemRect = el.getBoundingClientRect();
    active = {
      pointerId: event.pointerId,
      item,
      before: snapshot(),
      moved: false,
      rotated: false,
      offsetX: event.clientX - (itemRect.left + itemRect.width / 2),
      offsetY: event.clientY - (itemRect.top + itemRect.height / 2),
      rect,
    };
    armHoldRotation(event.clientX, event.clientY);
    el.classList.add('is-dragging');
    el.setPointerCapture?.(event.pointerId);
    applyTransform(item, true);
    onGrab(serializable(item));
  }

  // Native buttons emit detail=0 clicks for keyboard and assistive-technology
  // activation. Pointer selection is already handled on pointerdown so a drag
  // can start immediately; limiting this path avoids selecting/lifting twice
  // after an ordinary tap or mouse click.
  function keyboardActivate(event) {
    if (!interactive || event.detail !== 0) return;
    const item = items.get(event.currentTarget.dataset.freeformId);
    if (item) select(item.id);
  }

  function pointerMove(event) {
    if (!active || event.pointerId !== active.pointerId) return;
    event.preventDefault();
    if (hold && Math.hypot(event.clientX - active.holdAnchorX, event.clientY - active.holdAnchorY) > hold.tolerance) {
      armHoldRotation(event.clientX, event.clientY);
    }
    const { item, rect, offsetX, offsetY } = active;
    const x = (event.clientX - rect.left - offsetX) / Math.max(1, rect.width);
    const y = (event.clientY - rect.top - offsetY) / Math.max(1, rect.height);
    active.moved ||= Math.hypot(x - item.x, y - item.y) > .008;
    // Let the piece center reach every edge of the creative surface. A small
    // overscan also makes top-of-head details and trash-drop travel feel free.
    item.x = clamp(x, -.08, 1.08);
    item.y = clamp(y, -.08, 1.08);
    applyAutoMirror(item);
    applyTransform(item, true);
    onDrag(serializable(item), { clientX: event.clientX, clientY: event.clientY });
  }

  function finishPointer(event, cancelled = false) {
    if (!active || (event && event.pointerId !== active.pointerId)) return;
    event?.preventDefault?.();
    const drag = active;
    clearHoldRotation(drag);
    active = null;
    drag.item.el.classList.remove('is-dragging');
    if (cancelled) {
      restore(drag.before, { record: false, emitChange: false });
      return;
    }
    applyTransform(drag.item);
    if (drag.moved) {
      history.push(drag.before);
      if (history.length > 40) history.shift();
      emit(drag.rotated ? 'transform' : 'move', drag.item);
    }
    onDrop(serializable(drag.item), {
      moved: drag.moved,
      clientX: event?.clientX,
      clientY: event?.clientY,
    });
  }

  function createElement(item) {
    const el = document.createElement(interactive ? 'button' : 'div');
    if (interactive) el.type = 'button';
    el.className = 'qlobe-freeform-piece';
    el.dataset.freeformId = item.id;
    el.setAttribute('aria-label', item.alt || item.kind || 'clay decoration');
    if (interactive) el.setAttribute('aria-pressed', 'false');
    const image = document.createElement('img');
    image.src = item.src;
    image.alt = '';
    image.draggable = false;
    el.append(image);
    if (interactive) {
      el.addEventListener('pointerdown', pointerDown, { passive: false });
      el.addEventListener('click', keyboardActivate);
    }
    return el;
  }

  function add(spec, { record = true, emitChange = true } = {}) {
    const id = spec.id || `piece-${Date.now().toString(36)}-${items.size}`;
    if (items.has(id)) return null;
    if (record) remember();
    const item = {
      id,
      kind: spec.kind || id,
      src: spec.src,
      alt: spec.alt || spec.kind || 'clay decoration',
      x: clamp(Number.isFinite(Number(spec.x)) ? Number(spec.x) : .5, -.08, 1.08),
      y: clamp(Number.isFinite(Number(spec.y)) ? Number(spec.y) : .5, -.08, 1.08),
      size: clamp(Number(spec.size) || .22, .08, .55),
      rotation: normalizeAngle(spec.rotation),
      mirror: !!spec.mirror,
      z: Number(spec.z) || ++nextZ,
      meta: clone(spec.meta || {}),
      el: null,
    };
    item.el = createElement(item);
    applyAutoMirror(item);
    items.set(id, item);
    container.append(item.el);
    applyTransform(item);
    if (interactive) select(id);
    if (emitChange) emit('add', item);
    return serializable(item);
  }

  function remove(id = selected, { record = true, emitChange = true } = {}) {
    const item = items.get(id);
    if (!item) return false;
    if (record) remember();
    item.el.remove();
    items.delete(id);
    if (selected === id) selected = null;
    if (emitChange) emit('remove', item);
    return true;
  }

  function clear({ record = true, emitChange = true } = {}) {
    if (!items.size) return false;
    if (record) remember();
    for (const item of items.values()) item.el.remove();
    items.clear();
    selected = null;
    if (emitChange) emit('clear');
    return true;
  }

  function restore(board, { record = false, emitChange = true } = {}) {
    if (record) remember();
    clear({ record: false, emitChange: false });
    nextZ = 10;
    for (const item of board?.items || []) add(item, { record: false, emitChange: false });
    selected = null;
    if (emitChange) emit('load');
    return snapshot();
  }

  function undo() {
    const previous = history.pop();
    if (!previous) return false;
    restore(previous, { record: false, emitChange: false });
    emit('undo');
    return true;
  }

  function move(id, x, y, { record = true } = {}) {
    const item = items.get(id);
    if (!item) return false;
    if (record) remember();
    item.x = clamp(Number(x), -.08, 1.08);
    item.y = clamp(Number(y), -.08, 1.08);
    applyAutoMirror(item);
    item.z = ++nextZ;
    applyTransform(item);
    emit('move', item);
    return true;
  }

  // Update the semantic transform without rebuilding the DOM item. Creator
  // games use this for explicit, child-sized rotate/mirror/resize controls;
  // keeping it here means undo, persistence, and viewport-safe normalized
  // coordinates all continue to share one source of truth.
  function transform(id, changes = {}, { record = true } = {}) {
    const item = items.get(id);
    if (!item) return false;
    if (record) remember();
    if (changes.x != null) item.x = clamp(Number(changes.x), -.08, 1.08);
    if (changes.y != null) item.y = clamp(Number(changes.y), -.08, 1.08);
    if (changes.size != null) item.size = clamp(Number(changes.size), .08, .55);
    if (changes.rotation != null) item.rotation = normalizeAngle(changes.rotation);
    if (changes.mirror != null) item.mirror = !!changes.mirror;
    applyAutoMirror(item);
    item.z = ++nextZ;
    applyTransform(item);
    emit('transform', item);
    return true;
  }

  function rotate(id = selected, delta = 45, options = {}) {
    const item = items.get(id);
    if (!item) return false;
    return transform(id, { rotation: item.rotation + (Number(delta) || 0) }, options);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    clearHoldRotation(active);
    window.removeEventListener('pointermove', pointerMove);
    window.removeEventListener('pointerup', finishPointer);
    window.removeEventListener('pointercancel', cancelPointer);
    window.removeEventListener('blur', cancelPointer);
    clear({ record: false, emitChange: false });
    container.classList.remove('qlobe-freeform-board');
  }

  const cancelPointer = (event) => finishPointer(event, true);
  window.addEventListener('pointermove', pointerMove, { passive: false });
  window.addEventListener('pointerup', finishPointer, { passive: false });
  window.addEventListener('pointercancel', cancelPointer, { passive: false });
  window.addEventListener('blur', cancelPointer);

  return {
    add, remove, clear, undo, load: restore, move, transform, rotate, select, snapshot,
    canUndo: () => history.length > 0,
    getSelected: () => selected,
    getItems: () => snapshot().items,
    destroy,
  };
}
