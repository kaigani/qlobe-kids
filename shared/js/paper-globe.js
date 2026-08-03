// paper-globe.js — tactile, accurate, reusable globe interaction for QLOBE Kids.
//
// The visible sphere is WebGL, with a pre-rendered raster texture authored
// from Natural Earth data. Raster DOM pins sit above the canvas so they remain
// accessible, inspectable, and at least 96px even when the sphere is small.

import * as THREE from '../vendor/three.module.min.js';

const DEG = Math.PI / 180;
const DEFAULTS = {
  dragDegreesPerPixel: 0.22,
  tiltDegreesPerPixel: 0.11,
  maxTilt: 38,
  friction: 0.94,
  snapTolerance: 34,
  alignedTolerance: 8,
  assistedTurns: 1.35,
};

export async function createPaperGlobe(options = {}) {
  const texture = await new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(options.textureUrl, resolve, undefined, reject);
  });
  return new PaperGlobe({ ...options, texture });
}

export class PaperGlobe {
  constructor(options) {
    this.mount = options.mount;
    this.landmarks = options.landmarks || [];
    this.pinImageUrl = options.pinImageUrl || '';
    this.tuning = { ...DEFAULTS, ...(options.tuning || {}) };
    this.onChange = options.onChange || (() => {});
    this.onAligned = options.onAligned || (() => {});
    this.onLandmark = options.onLandmark || (() => {});
    this.reducedMotion = Boolean(options.reducedMotion);
    this.lat = Number(options.initial?.lat) || 0;
    this.lon = Number(options.initial?.lon) || 0;
    this.velocity = { lat: 0, lon: 0 };
    this.drag = null;
    this.targetId = null;
    this.alignedId = null;
    this.animation = null;
    this.destroyed = false;
    this.frame = 0;
    this.lastFrameAt = performance.now();
    this.disposers = [];
    this.pinById = new Map();

    this.mount.classList.add('qk-paper-globe');
    this.mount.replaceChildren();
    this.pinLayer = document.createElement('div');
    this.pinLayer.className = 'qk-paper-globe-pins';
    this.pinLayer.setAttribute('aria-live', 'polite');

    this.initThree(options.texture);
    this.mount.append(this.renderer.domElement, this.pinLayer);
    this.buildPins();
    this.installInput();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.mount);
    this.disposers.push(() => this.resizeObserver.disconnect());
    this.resize();
    this.tick = this.tick.bind(this);
    this.frame = requestAnimationFrame(this.tick);
  }

  initThree(texture) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    // Keep the whole sphere inside the transparent canvas. Cropping a sphere
    // at the canvas edge exposes a rectangular boundary over raster scenery.
    this.camera.position.set(0, 0, 7.2);

    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.domElement.className = 'qk-paper-globe-canvas';
    this.renderer.domElement.setAttribute('role', 'application');
    this.renderer.domElement.setAttribute('aria-label', 'Spinning world globe. Swipe to turn it, or use the arrow keys.');
    this.renderer.domElement.tabIndex = 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.globeGroup = new THREE.Group();
    this.scene.add(this.globeGroup);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    this.texture = texture;

    const sphere = new THREE.SphereGeometry(1.58, 96, 72);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.92,
      metalness: 0,
      bumpMap: texture,
      bumpScale: 0.006,
    });
    this.sphere = new THREE.Mesh(sphere, material);
    this.globeGroup.add(this.sphere);

    const atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.615, 64, 48),
      new THREE.MeshBasicMaterial({ color: 0x9fe6ff, transparent: true, opacity: 0.12, side: THREE.BackSide }),
    );
    this.globeGroup.add(atmosphere);

    const key = new THREE.DirectionalLight(0xfff7df, 3.0);
    key.position.set(-3, 4, 5);
    const fill = new THREE.HemisphereLight(0xbcefff, 0x31513e, 2.1);
    const rim = new THREE.DirectionalLight(0x8bd8ff, 1.2);
    rim.position.set(4, 0, -2);
    this.scene.add(key, fill, rim);
    this.applyRotation();
  }

  buildPins() {
    for (const landmark of this.landmarks) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'qk-paper-globe-pin';
      button.dataset.landmark = landmark.id;
      button.dataset.target = `pin-${landmark.id}`;
      button.dataset.role = 'primary';
      button.style.setProperty('--pin-color', landmark.color || '#e15d43');
      button.setAttribute('aria-label', `Open ${landmark.name}`);
      const art = document.createElement('img');
      art.className = 'qk-paper-globe-pin-art';
      art.src = this.pinImageUrl;
      art.alt = '';
      art.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.className = 'qk-paper-globe-pin-label';
      label.textContent = landmark.shortName || landmark.name;
      button.append(art, label);
      const activate = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (button.dataset.front === 'true') this.onLandmark(landmark.id);
      };
      button.addEventListener('click', activate);
      this.disposers.push(() => button.removeEventListener('click', activate));
      this.pinLayer.appendChild(button);
      this.pinById.set(landmark.id, button);
    }
  }

  installInput() {
    const canvas = this.renderer.domElement;
    const down = (event) => {
      if (event.isPrimary === false || this.drag) return;
      this.cancelAnimation();
      this.velocity.lat = 0;
      this.velocity.lon = 0;
      this.drag = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        at: performance.now(),
        moved: false,
      };
      canvas.setPointerCapture?.(event.pointerId);
      canvas.classList.add('is-dragging');
      this.alignedId = null;
      event.preventDefault();
    };
    const move = (event) => {
      if (!this.drag || event.pointerId !== this.drag.id) return;
      const now = performance.now();
      const dt = Math.max(8, now - this.drag.at);
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      this.lon -= dx * this.tuning.dragDegreesPerPixel;
      this.lat = clamp(this.lat + dy * this.tuning.tiltDegreesPerPixel, -this.tuning.maxTilt, this.tuning.maxTilt);
      this.velocity.lon = (-dx * this.tuning.dragDegreesPerPixel) / dt * 16.67;
      this.velocity.lat = (dy * this.tuning.tiltDegreesPerPixel) / dt * 16.67;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.drag.at = now;
      this.drag.moved ||= Math.abs(dx) + Math.abs(dy) > 2;
      this.applyRotation();
      event.preventDefault();
    };
    const end = (event) => {
      if (!this.drag || (event.pointerId != null && event.pointerId !== this.drag.id)) return;
      try { canvas.releasePointerCapture?.(this.drag.id); } catch { /* capture may already be gone */ }
      this.drag = null;
      canvas.classList.remove('is-dragging');
      if (this.reducedMotion) this.velocity.lat = this.velocity.lon = 0;
      this.snapIfClose();
    };
    const keydown = (event) => {
      const amount = event.shiftKey ? 18 : 8;
      if (event.key === 'ArrowLeft') this.lon -= amount;
      else if (event.key === 'ArrowRight') this.lon += amount;
      else if (event.key === 'ArrowUp') this.lat = clamp(this.lat - amount * 0.55, -this.tuning.maxTilt, this.tuning.maxTilt);
      else if (event.key === 'ArrowDown') this.lat = clamp(this.lat + amount * 0.55, -this.tuning.maxTilt, this.tuning.maxTilt);
      else if (event.key === 'Enter' || event.key === ' ') {
        if (this.alignedId) this.onLandmark(this.alignedId);
        else this.assistedSpin();
        event.preventDefault();
        return;
      } else return;
      this.velocity.lat = this.velocity.lon = 0;
      this.applyRotation();
      this.snapIfClose();
      event.preventDefault();
    };
    const blur = () => end({ pointerId: this.drag?.id });
    canvas.addEventListener('pointerdown', down, { passive: false });
    canvas.addEventListener('pointermove', move, { passive: false });
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('lostpointercapture', end);
    canvas.addEventListener('keydown', keydown);
    window.addEventListener('blur', blur);
    this.disposers.push(() => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', end);
      canvas.removeEventListener('pointercancel', end);
      canvas.removeEventListener('lostpointercapture', end);
      canvas.removeEventListener('keydown', keydown);
      window.removeEventListener('blur', blur);
    });
  }

  setTarget(id) {
    this.targetId = id || null;
    this.alignedId = null;
    for (const [pinId, pin] of this.pinById) {
      pin.classList.toggle('is-target', pinId === this.targetId);
      pin.disabled = pinId !== this.targetId;
    }
    this.updatePins();
  }

  setVisited(ids = []) {
    const visited = new Set(ids);
    for (const [id, pin] of this.pinById) pin.classList.toggle('is-visited', visited.has(id));
  }

  assistedSpin() {
    if (!this.targetId) return Promise.resolve(false);
    return this.alignTo(this.targetId, { turns: this.reducedMotion ? 0 : this.tuning.assistedTurns });
  }

  alignTo(id, { turns = 0, duration } = {}) {
    const target = this.landmarks.find((item) => item.id === id);
    if (!target) return Promise.resolve(false);
    this.cancelAnimation();
    this.velocity.lat = this.velocity.lon = 0;
    const start = { lat: this.lat, lon: this.lon };
    const shortest = shortestDelta(this.lon, target.lon);
    const sign = shortest === 0 ? 1 : Math.sign(shortest);
    const end = {
      lat: clamp(target.lat, -this.tuning.maxTilt, this.tuning.maxTilt),
      lon: this.lon + shortest + sign * Math.abs(turns) * 360,
    };
    const ms = duration ?? (this.reducedMotion ? 180 : clamp(850 + Math.abs(turns) * 760, 700, 2600));
    return new Promise((resolve) => {
      this.animation = { start, end, began: performance.now(), duration: ms, id, resolve };
    });
  }

  setView(lat, lon, { immediate = true } = {}) {
    if (!immediate && this.targetId) return this.alignTo(this.targetId, { turns: 0 });
    this.cancelAnimation();
    this.velocity.lat = this.velocity.lon = 0;
    this.lat = clamp(Number(lat) || 0, -this.tuning.maxTilt, this.tuning.maxTilt);
    this.lon = Number(lon) || 0;
    this.applyRotation();
    this.checkAligned();
    return Promise.resolve(true);
  }

  setReducedMotion(on) {
    this.reducedMotion = Boolean(on);
    if (this.reducedMotion) this.velocity.lat = this.velocity.lon = 0;
  }

  getState() {
    return {
      lat: round(this.lat),
      lon: round(normalizeLon(this.lon)),
      velocity: { lat: round(this.velocity.lat), lon: round(this.velocity.lon) },
      dragging: Boolean(this.drag),
      animating: Boolean(this.animation),
      targetId: this.targetId,
      alignedId: this.alignedId,
    };
  }

  snapIfClose() {
    const error = this.targetError();
    if (error && error.angle <= this.tuning.snapTolerance) {
      void this.alignTo(error.target.id, { turns: 0, duration: this.reducedMotion ? 100 : 460 });
    }
  }

  targetError() {
    const target = this.landmarks.find((item) => item.id === this.targetId);
    if (!target) return null;
    const dLon = shortestDelta(this.lon, target.lon) * Math.cos(target.lat * DEG);
    const dLat = this.lat - target.lat;
    return { target, angle: Math.hypot(dLon, dLat) };
  }

  checkAligned() {
    const error = this.targetError();
    const aligned = error && error.angle <= this.tuning.alignedTolerance && !this.drag && !this.animation;
    const next = aligned ? error.target.id : null;
    if (next === this.alignedId) return;
    this.alignedId = next;
    this.mount.classList.toggle('is-aligned', Boolean(next));
    if (next) this.onAligned(next);
  }

  cancelAnimation() {
    if (!this.animation) return;
    const resolve = this.animation.resolve;
    this.animation = null;
    resolve?.(false);
  }

  applyRotation() {
    // XYZ is load-bearing: with our lat/lon vector convention, Y(-lon) is
    // applied first and X(+lat) second, putting the target at camera-centre.
    this.globeGroup.rotation.order = 'XYZ';
    this.globeGroup.rotation.y = -this.lon * DEG;
    this.globeGroup.rotation.x = this.lat * DEG;
    this.updatePins();
    this.onChange(this.getState());
  }

  tick(now) {
    if (this.destroyed) return;
    const dt = Math.min(2, Math.max(0.25, (now - this.lastFrameAt) / 16.67));
    this.lastFrameAt = now;
    if (this.animation) {
      const a = this.animation;
      const t = clamp((now - a.began) / a.duration, 0, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      this.lat = mix(a.start.lat, a.end.lat, eased);
      this.lon = mix(a.start.lon, a.end.lon, eased);
      this.applyRotation();
      if (t >= 1) {
        const resolve = a.resolve;
        this.animation = null;
        this.lon = normalizeLon(this.lon);
        this.applyRotation();
        this.checkAligned();
        resolve?.(true);
      }
    } else if (!this.drag && !this.reducedMotion && (Math.abs(this.velocity.lon) > 0.01 || Math.abs(this.velocity.lat) > 0.01)) {
      this.lon += this.velocity.lon * dt;
      this.lat = clamp(this.lat + this.velocity.lat * dt, -this.tuning.maxTilt, this.tuning.maxTilt);
      const friction = Math.pow(this.tuning.friction, dt);
      this.velocity.lon *= friction;
      this.velocity.lat *= friction;
      this.applyRotation();
      if (Math.abs(this.velocity.lon) < 0.04 && Math.abs(this.velocity.lat) < 0.04) this.snapIfClose();
    }
    this.updatePins();
    this.renderer.render(this.scene, this.camera);
    this.frame = requestAnimationFrame(this.tick);
  }

  updatePins() {
    if (!this.camera || !this.renderer) return;
    const width = this.mount.clientWidth || 1;
    const height = this.mount.clientHeight || 1;
    for (const landmark of this.landmarks) {
      const pin = this.pinById.get(landmark.id);
      if (!pin) continue;
      const vector = latLonToVector3(landmark.lat, landmark.lon, 1.61);
      vector.applyEuler(this.globeGroup.rotation);
      const front = vector.z > 0.28;
      const projected = vector.clone().project(this.camera);
      const x = (projected.x * 0.5 + 0.5) * width;
      const y = (-projected.y * 0.5 + 0.5) * height;
      const isTarget = landmark.id === this.targetId;
      pin.style.left = `${x}px`;
      pin.style.top = `${y}px`;
      pin.style.setProperty('--front-depth', String(clamp((vector.z - 0.28) / 1.3, 0, 1)));
      pin.dataset.front = String(front && isTarget);
      pin.hidden = !front || (!isTarget && !pin.classList.contains('is-visited'));
      pin.classList.toggle('is-aligned', landmark.id === this.alignedId);
    }
  }

  resize() {
    const width = Math.max(1, this.mount.clientWidth);
    const height = Math.max(1, this.mount.clientHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.updatePins();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.cancelAnimation();
    for (const dispose of this.disposers.splice(0)) dispose();
    this.texture?.dispose();
    this.sphere?.geometry.dispose();
    this.sphere?.material.dispose();
    this.renderer?.dispose();
    this.mount.replaceChildren();
    this.mount.classList.remove('qk-paper-globe', 'is-aligned');
  }
}

export function latLonToVector3(lat, lon, radius = 1) {
  const phi = Number(lat) * DEG;
  const theta = Number(lon) * DEG;
  return new THREE.Vector3(
    radius * Math.cos(phi) * Math.sin(theta),
    radius * Math.sin(phi),
    radius * Math.cos(phi) * Math.cos(theta),
  );
}

function shortestDelta(from, to) {
  return ((Number(to) - normalizeLon(Number(from)) + 540) % 360) - 180;
}

function normalizeLon(value) {
  return ((Number(value) + 540) % 360) - 180;
}

function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function mix(a, b, t) { return a + (b - a) * t; }
function round(value) { return Math.round(Number(value) * 100) / 100; }
