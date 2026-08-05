// weather-world.js — reusable raster weather effects for QLOBE nature scenes.
//
// This module deliberately owns only the weather presentation. Games own their
// controls, narration, flower progression, and the supplied authored art.

const RAIN_BUDGET = 34;
const LEAF_BUDGET = 15;
const REDUCED_RAIN_BUDGET = 6;
const REDUCED_LEAF_BUDGET = 3;
const MAX_DT = 0.05;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number(value) || 0));
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const noop = () => {};
const readReducedMotion = (value) => {
  try { return typeof value === 'function' ? !!value() : !!value; } catch { return false; }
};

/**
 * Normalize source weather and expose the visual state as small named flags.
 * `cloud` remains the child's selected ordinary-cloud control; `rainCloud`
 * is derived so callers never have to coordinate mutually-exclusive artwork.
 */
export function resolveWeatherState(input = {}) {
  const sun = !!input.sun;
  const cloud = !!input.cloud;
  const rain = !!input.rain;
  const wind = clamp(input.wind);
  const allowRainbow = !!input.allowRainbow;
  return {
    sun,
    cloud,
    rain,
    wind,
    allowRainbow,
    softCloud: cloud && !rain,
    rainCloud: rain,
    rainbow: sun && rain && allowRainbow,
    shade: cloud || rain,
  };
}

function randomOf(bounds) {
  const random = bounds && bounds.random;
  return typeof random === 'function' ? clamp(random()) : Math.random();
}

function particleBounds(bounds = {}) {
  return {
    width: Math.max(1, finite(bounds.width, 1)),
    height: Math.max(1, finite(bounds.height, 1)),
  };
}

function respawnRain(particle, bounds, wind = 0) {
  const r = () => randomOf(bounds);
  const size = Math.max(2, finite(particle.size, 10));
  const baseVx = finite(particle.baseVx, finite(particle.vx, 10));
  return {
    ...particle,
    x: r() * bounds.width,
    y: -size - r() * bounds.height * 0.22,
    baseVx,
    vx: baseVx + wind * 42,
    vy: Math.max(80, finite(particle.vy, 330)),
    size,
    alpha: 0.55 + r() * 0.4,
  };
}

function respawnLeaf(particle, bounds, wind) {
  const r = () => randomOf(bounds);
  const size = Math.max(5, finite(particle.size, 24));
  const baseVx = finite(particle.baseVx, finite(particle.vx, 24));
  return {
    ...particle,
    x: -size - r() * bounds.width * 0.12,
    y: r() * bounds.height * 0.82,
    baseVx,
    vx: Math.max(18, baseVx + wind * 105),
    vy: finite(particle.vy, 4),
    size,
    rotation: r() * Math.PI * 2,
    spin: finite(particle.spin, (r() - 0.5) * 2),
    alpha: 0.58 + r() * 0.36,
  };
}

/**
 * Advance one particle without mutating it. `dt` is seconds, and `bounds` is
 * CSS-pixel canvas geometry; supply `bounds.random` to make respawns repeatable.
 */
export function stepWeatherParticle(particle = {}, state = {}, dt = 0, bounds = {}) {
  const area = particleBounds(bounds);
  const seconds = clamp(dt, 0, MAX_DT);
  const weather = resolveWeatherState(state);
  const kind = particle.kind === 'leaf' ? 'leaf' : 'rain';

  if (kind === 'rain') {
    if (!weather.rain) return { ...particle, kind, alpha: 0 };
    const baseVx = finite(particle.baseVx, finite(particle.vx, 10));
    let next = {
      ...particle,
      kind,
      x: finite(particle.x),
      y: finite(particle.y),
      baseVx,
      vx: baseVx + weather.wind * 42,
      vy: Math.max(80, finite(particle.vy, 330)),
      size: Math.max(2, finite(particle.size, 10)),
      alpha: clamp(finite(particle.alpha, 0.85)),
    };
    next.x += next.vx * seconds;
    next.y += next.vy * seconds;
    if (next.y > area.height + next.size || next.x > area.width + next.size * 2 || next.x < -next.size * 2) {
      next = respawnRain(next, { ...bounds, ...area }, weather.wind);
    }
    return next;
  }

  if (weather.wind <= 0.015) return { ...particle, kind, alpha: 0 };
  const baseVx = finite(particle.baseVx, finite(particle.vx, 28));
  let next = {
    ...particle,
    kind,
    x: finite(particle.x),
    y: finite(particle.y),
    baseVx,
    vx: Math.max(12, baseVx + weather.wind * 105),
    vy: finite(particle.vy, 4),
    size: Math.max(5, finite(particle.size, 24)),
    rotation: finite(particle.rotation),
    spin: finite(particle.spin, 0.7),
    alpha: clamp(finite(particle.alpha, 0.82)),
  };
  next.x += next.vx * seconds;
  next.y += (next.vy + Math.sin((next.x + next.y) * 0.025) * weather.wind * 20) * seconds;
  next.rotation += next.spin * seconds * (1 + weather.wind * 2);
  if (next.x > area.width + next.size * 2 || next.y > area.height + next.size * 2 || next.y < -next.size * 2) {
    next = respawnLeaf(next, { ...bounds, ...area }, weather.wind);
  }
  return next;
}

function imageIsLoaded(image) {
  if (!image || typeof image !== 'object') return false;
  // HTMLImageElement.complete is false while its local asset is still loading.
  // Test doubles often only expose width/height, which is also enough to draw.
  if (image.complete === false) return false;
  const width = finite(image.naturalWidth, finite(image.width));
  const height = finite(image.naturalHeight, finite(image.height));
  return width > 0 && height > 0;
}

function flattenSprites(sprites = {}) {
  const rain = sprites.rain || sprites.raindrop || sprites.raindrops;
  const leaves = sprites.leaves || sprites.leaf || [sprites.leaf1, sprites.leaf2, sprites.leaf3];
  return {
    rain: Array.isArray(rain) ? rain : [rain],
    leaves: Array.isArray(leaves) ? leaves : [leaves],
  };
}

function makeImage(value, onSettled) {
  if (!value) return null;
  if (typeof value !== 'string') {
    try {
      value.addEventListener?.('load', onSettled, { once: true });
      value.addEventListener?.('error', onSettled, { once: true });
    } catch { /* an image-like test double may not be an EventTarget */ }
    return value;
  }
  const ImageCtor = globalThis.Image;
  if (typeof ImageCtor !== 'function') return null;
  try {
    const image = new ImageCtor();
    image.addEventListener?.('load', onSettled, { once: true });
    image.addEventListener?.('error', onSettled, { once: true });
    image.src = value;
    if (imageIsLoaded(image)) onSettled();
    return image;
  } catch {
    return null;
  }
}

function classToggle(layer, active) {
  try { layer?.classList?.toggle('is-active', !!active); } catch { /* minimal DOM fake */ }
}

function customProperty(layer, name, value) {
  try { layer?.style?.setProperty(name, String(value)); } catch { /* optional presentation */ }
}

function rafApi() {
  return {
    request: typeof globalThis.requestAnimationFrame === 'function'
      ? globalThis.requestAnimationFrame.bind(globalThis) : null,
    cancel: typeof globalThis.cancelAnimationFrame === 'function'
      ? globalThis.cancelAnimationFrame.bind(globalThis) : noop,
  };
}

function createParticle(kind, random, width, height, index) {
  if (kind === 'rain') {
    const baseVx = 4 + random() * 12;
    return {
      kind, x: random() * width, y: random() * height, baseVx, vx: baseVx,
      vy: 260 + random() * 180, size: 8 + random() * 10, alpha: 0.58 + random() * 0.35, sprite: index,
    };
  }
  const baseVx = 20 + random() * 35;
  return {
    kind, x: random() * width, y: random() * height, baseVx, vx: baseVx,
    vy: -8 + random() * 16, size: 18 + random() * 18, alpha: 0.55 + random() * 0.38,
    rotation: random() * Math.PI * 2, spin: (random() - 0.5) * 2.4, sprite: index,
  };
}

function makeAmbience(random = Math.random) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (typeof AC !== 'function') return null;
  try {
    const context = new AC();
    const master = context.createGain();
    const rainGain = context.createGain();
    const windGain = context.createGain();
    master.gain.value = 0.08;
    rainGain.gain.value = 0;
    windGain.gain.value = 0;
    rainGain.connect(master); windGain.connect(master); master.connect(context.destination);
    const sources = [];
    if (context.createBuffer && context.createBufferSource) {
      const buffer = context.createBuffer(1, Math.max(1, Math.floor(context.sampleRate || 44100)), context.sampleRate || 44100);
      const channel = buffer.getChannelData?.(0);
      if (channel) for (let i = 0; i < channel.length; i += 1) channel[i] = clamp(random()) * 2 - 1;
      const rain = context.createBufferSource();
      rain.buffer = buffer; rain.loop = true; rain.connect(rainGain); rain.start?.(); sources.push(rain);
    }
    if (context.createOscillator) {
      const wind = context.createOscillator();
      wind.type = 'sine'; wind.frequency.value = 105; wind.connect(windGain); wind.start?.(); sources.push(wind);
    }
    return { context, master, rainGain, windGain, sources };
  } catch {
    return null;
  }
}

function setGain(gain, value, context) {
  if (!gain?.gain) return;
  const now = finite(context?.currentTime);
  try {
    gain.gain.cancelScheduledValues?.(now);
    gain.gain.setTargetAtTime?.(value, now, 0.08);
    if (!gain.gain.setTargetAtTime) gain.gain.value = value;
  } catch { /* audio is optional */ }
}

/**
 * Create a self-contained weather presentation controller.
 * `sprites` accepts loaded Image elements or caller-provided local URL strings.
 */
export function createWeatherWorld({
  canvas = null,
  layers = {},
  sprites = {},
  random = Math.random,
  reducedMotion = false,
  onStateChange = null,
} = {}) {
  const rng = typeof random === 'function' ? random : Math.random;
  // Allow a game to pass either the current media-query boolean or a query
  // callback. Sample once so a seeded simulation keeps a stable particle count.
  const reduced = readReducedMotion(reducedMotion);
  const budget = { rain: reduced ? REDUCED_RAIN_BUDGET : RAIN_BUDGET, leaf: reduced ? REDUCED_LEAF_BUDGET : LEAF_BUDGET };
  let state = resolveWeatherState({});
  let muted = false;
  let unlocked = false;
  let destroyed = false;
  let ambience = null;
  let raf = 0;
  let lastTime = 0;
  let dimensions = { width: 1, height: 1, dpr: 1 };
  const api = rafApi();
  let particles = [];
  const spriteList = flattenSprites(sprites);
  const loaded = { rain: [], leaves: [] };

  let settleSprites = noop;
  const ready = new Promise((resolve) => { settleSprites = resolve; });
  let loadingSprites = true;
  const sourceSprites = { rain: [], leaves: [] };
  sourceSprites.rain = spriteList.rain.map((sprite) => makeImage(sprite, refreshSprites)).filter(Boolean);
  sourceSprites.leaves = spriteList.leaves.map((sprite) => makeImage(sprite, refreshSprites)).filter(Boolean);
  loadingSprites = false;
  let readySettled = false;

  function refreshSprites() {
    loaded.rain = sourceSprites.rain.filter(imageIsLoaded);
    loaded.leaves = sourceSprites.leaves.filter(imageIsLoaded);
    const allDone = [...sourceSprites.rain, ...sourceSprites.leaves].every((image) => image?.complete !== false);
    if (!loadingSprites && !readySettled && allDone) { readySettled = true; settleSprites(); }
  }

  // URL images with no event-capable Image implementation settle synchronously.
  refreshSprites();

  function rebuildParticles() {
    const rain = [];
    const leaves = [];
    for (let i = 0; i < budget.rain; i += 1) rain.push(createParticle('rain', rng, dimensions.width, dimensions.height, i));
    for (let i = 0; i < budget.leaf; i += 1) leaves.push(createParticle('leaf', rng, dimensions.width, dimensions.height, i));
    particles = [...rain, ...leaves];
  }

  function resize() {
    if (destroyed) return { ...dimensions };
    let width = finite(canvas?.clientWidth);
    let height = finite(canvas?.clientHeight);
    try {
      const rect = canvas?.getBoundingClientRect?.();
      width = finite(rect?.width, width);
      height = finite(rect?.height, height);
    } catch { /* optional canvas */ }
    width = Math.max(1, width || 1); height = Math.max(1, height || 1);
    const dpr = clamp(globalThis.devicePixelRatio || 1, 1, 3);
    dimensions = { width, height, dpr };
    try {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style?.setProperty('--weather-world-dpr', dpr);
    } catch { /* non-canvas test fake */ }
    rebuildParticles();
    return { ...dimensions };
  }

  function applyLayers() {
    classToggle(layers.sun, state.sun);
    classToggle(layers.cloud, state.softCloud);
    classToggle(layers.rainCloud, state.rainCloud);
    classToggle(layers.rainbow, state.rainbow);
    classToggle(layers.shade, state.shade);
    const windValue = state.wind.toFixed(3);
    for (const layer of [layers.sun, layers.cloud, layers.rainCloud, layers.rainbow, layers.shade, layers.tree, canvas]) {
      customProperty(layer, '--weather-wind', windValue);
      customProperty(layer, '--weather-wind-strength', windValue);
      customProperty(layer, '--weather-rain', state.rain ? 1 : 0);
      customProperty(layer, '--weather-sun', state.sun ? 1 : 0);
    }
    customProperty(layers.tree, '--weather-tree-sway', (state.wind * 2 - 1).toFixed(3));
  }

  function updateAmbience() {
    if (!ambience || muted || !unlocked || destroyed) return;
    setGain(ambience.rainGain, state.rain ? 0.18 : 0, ambience.context);
    setGain(ambience.windGain, state.wind * 0.12, ambience.context);
  }

  function drawParticle(context, particle) {
    if (particle.alpha <= 0) return;
    const images = particle.kind === 'rain' ? loaded.rain : loaded.leaves;
    if (!images.length) return;
    const image = images[particle.sprite % images.length];
    if (!imageIsLoaded(image)) return;
    try {
      context.save?.();
      context.globalAlpha = particle.alpha;
      context.translate?.(particle.x, particle.y);
      if (particle.kind === 'leaf') context.rotate?.(particle.rotation || 0);
      const ratio = finite(image.naturalHeight, image.height) / Math.max(1, finite(image.naturalWidth, image.width));
      context.drawImage(image, -particle.size / 2, -particle.size * ratio / 2, particle.size, particle.size * ratio);
      context.restore?.();
    } catch { try { context.restore?.(); } catch { /* no-op */ } }
  }

  function render(now = 0, scheduleNext = true) {
    if (destroyed) return;
    const context = canvas?.getContext?.('2d');
    const seconds = lastTime ? clamp((now - lastTime) / 1000, 0, MAX_DT) : 1 / 60;
    lastTime = now || lastTime;
    particles = particles.map((particle) => stepWeatherParticle(particle, state, seconds, { ...dimensions, random: rng }));
    if (context) {
      try {
        context.setTransform?.(dimensions.dpr, 0, 0, dimensions.dpr, 0, 0);
        context.clearRect?.(0, 0, dimensions.width, dimensions.height);
        for (const particle of particles) drawParticle(context, particle);
      } catch { /* rendering is always optional */ }
    }
    if (scheduleNext && api.request && !destroyed) raf = api.request(render);
  }

  function notify() {
    if (typeof onStateChange !== 'function') return;
    try { onStateChange(getState()); } catch { /* consumer errors do not break the meadow */ }
  }

  function set(next = {}, { immediate = false } = {}) {
    if (destroyed) return getState();
    state = resolveWeatherState({ ...state, ...next });
    applyLayers(); updateAmbience();
    if (immediate) render(typeof performance !== 'undefined' ? performance.now() : 0, false);
    notify();
    return getState();
  }

  function reset() {
    return set({ sun: false, cloud: false, rain: false, wind: 0, allowRainbow: false }, { immediate: true });
  }

  function suspendAmbience() {
    if (!ambience?.context) return;
    try { ambience.context.suspend?.(); } catch { /* optional */ }
  }

  function unlock() {
    if (destroyed) return false;
    unlocked = true;
    if (!ambience) ambience = makeAmbience(rng);
    if (!ambience || muted || globalThis.document?.hidden) return !!ambience;
    try {
      const resume = ambience.context.resume?.();
      if (resume?.catch) resume.catch(noop);
    } catch { /* unavailable audio stays silent */ }
    updateAmbience();
    return true;
  }

  function setMuted(nextMuted) {
    muted = !!nextMuted;
    if (muted) suspendAmbience();
    else if (unlocked) unlock();
    updateAmbience();
    return muted;
  }

  function getState() {
    return {
      ...state,
      reducedMotion: reduced,
      particleBudget: { ...budget },
      muted,
      unlocked,
    };
  }

  function onVisibility() {
    if (globalThis.document?.hidden) { suspendAmbience(); return; }
    if (unlocked && !muted) unlock();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    if (raf) api.cancel(raf);
    raf = 0;
    suspendAmbience();
    if (ambience) {
      for (const source of ambience.sources) try { source.stop?.(); } catch { /* already stopped */ }
      try { ambience.context.close?.(); } catch { /* optional */ }
    }
    globalThis.document?.removeEventListener?.('visibilitychange', onVisibility);
    globalThis.window?.removeEventListener?.('pagehide', suspendAmbience);
  }

  resize();
  applyLayers();
  globalThis.document?.addEventListener?.('visibilitychange', onVisibility);
  globalThis.window?.addEventListener?.('pagehide', suspendAmbience);
  if (api.request) raf = api.request(render);

  return { ready, unlock, set, reset, setMuted, getState, resize, destroy };
}
