// Dependency-light tactile wheel controller.
export function createWheel({
  element,
  onRequestSpin,
  onTick,
  onStart,
  onSettle,
  reducedMotion = false,
  turns = 2,
  durationMs = 1800
} = {}) {
  if (!element) throw new Error('createWheel requires an element');
  let angle = 0, spinning = false, destroyed = false, raf = 0, activeResolve = null;
  let reduced = !!reducedMotion, drag = null, pointerId = null;
  const listeners = [];
  const on = (target, type, fn, opts) => { target.addEventListener(type, fn, opts); listeners.push(() => target.removeEventListener(type, fn, opts)); };
  const render = () => { element.style.transform = `rotate(${angle}deg)`; };
  function setAngle(deg) { if (!Number.isFinite(deg)) return; angle = deg; render(); }
  function getAngle() { return angle; }

  function spinTo(segmentIndex, opts = {}) {
    if (destroyed || spinning) return Promise.resolve(false);
    const index = ((Math.round(Number(segmentIndex) || 0) % 4) + 4) % 4;
    const extra = Math.max(0, Number.isFinite(opts.extraTurns) ? opts.extraTurns : 0);
    const base = -index * 90;
    // Always complete at least the requested number of full turns, settling at the canonical angle.
    const minimumTravel = 360 * Math.max(0, Number(turns) || 0);
    let target = base;
    while (target - angle < minimumTravel) target += 360;
    target += 360 * extra;
    if (reduced) { onStart?.(index); setAngle(base); onSettle?.(index); return Promise.resolve(true); }
    spinning = true; element.classList.add('is-spinning'); onStart?.(index);
    const start = angle, delta = target - start, duration = Math.max(0, Number(durationMs) || 0);
    let lastBoundary = Math.floor(start / 90);
    return new Promise(resolve => {
      activeResolve = resolve;
      const begin = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const frame = now => {
        if (destroyed || !spinning) { if (activeResolve) { activeResolve(false); activeResolve = null; } return; }
        const t = duration ? Math.min(1, (now - begin) / duration) : 1;
        const eased = 1 - Math.pow(1 - t, 3);
        setAngle(start + delta * eased);
        const boundary = Math.floor(angle / 90);
        while (boundary !== lastBoundary) { lastBoundary += boundary > lastBoundary ? 1 : -1; onTick?.(lastBoundary); }
        if (t < 1) raf = requestAnimationFrame(frame);
        else { spinning = false; element.classList.remove('is-spinning'); setAngle(base); onSettle?.(index); if (activeResolve) { activeResolve(true); activeResolve = null; } }
      };
      raf = requestAnimationFrame(frame);
    });
  }

  const request = () => {
    if (spinning || destroyed) return;
    let result; try { result = onRequestSpin?.(); } catch (_) { return; }
    Promise.resolve(result).then(i => { if (i != null) return spinTo(i); }).catch(() => {});
  };
  const center = () => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const pointerMove = e => { if (!drag || e.pointerId !== pointerId) return; const c = center(); const a = Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI; let d = a - drag.last; if (d > 180) d -= 360; if (d < -180) d += 360; const now = Date.now(); drag.velocity = d / Math.max(1, now - drag.time); setAngle(angle + d); drag.last = a; drag.time = now; };
  const pointerEnd = (e, genuineUp = false) => { if (!drag || (e.pointerId != null && e.pointerId !== pointerId)) return; if (genuineUp) setAngle(angle + Math.max(-180, Math.min(180, drag.velocity * 120))); drag = null; pointerId = null; try { element.releasePointerCapture?.(e.pointerId); } catch (_) {} if (genuineUp) request(); };
  on(element, 'pointerdown', e => { if (spinning || destroyed) return; const c = center(); drag = { last: Math.atan2(e.clientY - c.y, e.clientX - c.x) * 180 / Math.PI, time: Date.now(), velocity: 0 }; pointerId = e.pointerId; try { element.setPointerCapture?.(e.pointerId); } catch (_) {} });
  on(element, 'pointermove', pointerMove); on(element, 'pointerup', e => pointerEnd(e, true)); on(element, 'pointercancel', e => pointerEnd(e)); on(element, 'lostpointercapture', e => pointerEnd(e)); on(window, 'blur', () => { if (drag) pointerEnd({ pointerId }); });
  on(element, 'keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); setAngle(angle + (e.key === 'ArrowLeft' ? -15 : 15)); } else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); request(); } });
  render();
  return { spinTo, setAngle, getAngle, cancel() { spinning = false; if (raf) cancelAnimationFrame(raf); if (activeResolve) { activeResolve(false); activeResolve = null; } element.classList.remove('is-spinning'); }, destroy() { destroyed = true; this.cancel(); listeners.forEach(f => f()); }, setReducedMotion(on) { reduced = !!on; }, get spinning() { return spinning; } };
}
