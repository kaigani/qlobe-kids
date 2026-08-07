// Weather Scientist — one persistent, authored watercolor world per scene.
import config from '../config.js';
import { createWeatherWorld } from './weather-world.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { createTimers } from '../../../shared/js/timers.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';
import { onTap } from '../../../shared/js/tap.js';

const mount = document.getElementById('game');
const timers = createTimers();
const narrator = createNarrator();
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const state = {
  screen: 'splash', // splash | guided | celebration | free
  sceneId: null,
  step: 0,
  completed: [],
  weather: { sun: false, rain: false, wind: 0, cloud: false },
  growthStage: 'seedling',
  muted: false,
  rainbowSeen: false,
  visitedScenes: new Set(),
  accepting: false,
  seed: 42,
};

let world = null;
let nudge = null;
let confettiOff = null;
let disposeUnlock = null;
let disposeKiosk = null;
let windPointer = null;
let windCleanup = null;
let rng = Math.random;

// Universal "field kit" chrome (tray, prompt banner, wind slider, controls,
// badges, action carriers, title) — the same across every scene. Only the
// world content (background, landmark, growth stages, weather layers,
// particles) is per-scene, resolved through scene()/sceneWords()/sceneAssets().
const shared = config.assets;

function scene() { return state.sceneId ? config.scenes[state.sceneId] : null; }
function sceneWords() { return scene()?.voice || {}; }
function sceneAssets() { return scene()?.assets || null; }
function scenes() { return config.sceneOrder.map((id) => config.scenes[id]).filter(Boolean); }

function image(src, className, alt = '') {
  return `<img class="${className}" src="${src}" alt="${alt}" draggable="false">`;
}

function weatherDom() {
  const a = sceneAssets();
  if (!a) return '';
  return `
    <div class="weather-stage" id="weather-stage">
      ${image(a.background, 'world-art', '')}
      <div id="weather-world" aria-hidden="true">
        ${image(a.world.sun, 'world-layer world-sun', '')}
        ${image(a.world.cloud, 'world-layer world-cloud', '')}
        ${image(a.world.rainCloud, 'world-layer world-rain-cloud', '')}
        ${image(a.world.rainbow, 'world-layer world-rainbow', '')}
        ${image(a.world.puddle, 'world-layer world-puddle', '')}
        ${image(a.world.shade, 'world-layer world-shade', '')}
        ${image(a.landmark, 'landmark-layer', '')}
        ${image(a.growth.seedling, 'growth-layer growth-seedling', '')}
        ${image(a.growth.bud, 'growth-layer growth-bud', '')}
        ${image(a.growth.bloom, 'growth-layer growth-bloom', '')}
        <canvas class="world-particles" id="weather-particles"></canvas>
      </div>
      <div id="weather-overlay"></div>
    </div>`;
}

function buildWorld() {
  const root = document.getElementById('weather-world');
  const a = sceneAssets();
  const layers = {
    sun: root.querySelector('.world-sun'),
    cloud: root.querySelector('.world-cloud'),
    rainCloud: root.querySelector('.world-rain-cloud'),
    rainbow: root.querySelector('.world-rainbow'),
    shade: root.querySelector('.world-shade'),
    tree: root.querySelector('.landmark-layer'),
  };
  // The shared feature owns every state transition and sprite particle. Its
  // inputs are only this scene's authored elements and local paths.
  world = createWeatherWorld({
    canvas: root.querySelector('#weather-particles'),
    layers,
    sprites: {
      raindrop: a.particles.precip,
      leaves: [a.particles.debris1, a.particles.debris2, a.particles.debris3],
    },
    random: () => rng(),
    reducedMotion: () => reducedMotion(),
  });
  world.setMuted(state.muted);
  syncWorld();
}

function teardownWorld() {
  window.removeEventListener('resize', resizeWorld);
  window.removeEventListener('orientationchange', resizeWorld);
  world?.destroy?.();
  world = null;
}

function resizeWorld() {
  cancelWindDrag();
  world?.resize();
}

function worldState() {
  return {
    sun: state.weather.sun,
    rain: state.weather.rain,
    wind: state.weather.wind,
    cloud: state.weather.cloud,
    allowRainbow: state.screen === 'free',
  };
}

function syncWorld() {
  world?.set(worldState());
  const growth = state.growthStage;
  document.querySelectorAll('.growth-layer').forEach((plate) => {
    plate.classList.toggle('is-hidden', !plate.classList.contains(`growth-${growth}`));
  });
  document.querySelector('.world-puddle')?.classList.toggle('is-on', state.weather.rain);
}

function say(key) {
  const words = sceneWords();
  return narrator.say(`${state.sceneId}-${key}`, words[key] || '');
}

function feedback(event, sound = 'tick') {
  event?.preventDefault?.();
  unlockAll([() => world?.unlock()]);
  if (!state.muted && typeof sfx[sound] === 'function') sfx[sound]();
}

function resetDay({ speak = false } = {}) {
  timers.clearAll();
  state.step = 0;
  state.completed = [];
  state.accepting = false;
  state.rainbowSeen = false;
  state.weather = { sun: false, rain: false, wind: 0, cloud: false };
  state.growthStage = 'seedling';
  world?.reset();
  syncWorld();
  if (speak) say('reset');
}

function currentTarget() { return config.guidedOrder[state.step] || null; }
function isGuided() { return state.screen === 'guided'; }

function render() {
  const overlay = document.getElementById('weather-overlay');
  if (!overlay) return;
  const stageEl = document.getElementById('weather-stage');
  if (stageEl) {
    stageEl.dataset.screen = state.screen;
    stageEl.dataset.scene = state.sceneId || '';
  }
  confettiOff?.();
  confettiOff = null;
  stopNudge();
  if (state.screen === 'guided' || state.screen === 'free') overlay.innerHTML = labMarkup();
  if (state.screen === 'celebration') overlay.innerHTML = celebrationMarkup();
  wireOverlay();
  if (isGuided()) armNudge();
  if (state.screen === 'celebration') confettiOff = burstConfetti({ host: document.getElementById('weather-stage'), count: 34, rng });
  requestAnimationFrame(() => world?.resize());
}

function splashScreen() {
  const host = document.getElementById('game');
  host.querySelector('.splash-screen')?.remove();
  const section = document.createElement('section');
  section.className = 'weather-screen splash-screen';
  section.setAttribute('aria-label', 'Weather Scientist — choose a place to explore');
  section.innerHTML = `
    ${image(shared.splashBackground, 'splash-art', '')}
    <div class="splash-veil" aria-hidden="true"></div>
    <div class="screen-hud"><a class="qk-hud-btn qk-hud-home qk-hud-top-left" href="../../" data-target="home" aria-label="Back to all QLOBE Kids games"></a>
      <button class="qk-hud-btn qk-hud-sound qk-hud-top-right sound-button ${state.muted ? 'is-muted' : ''}" type="button" data-action="sound" data-target="sound" aria-label="Toggle sound"></button></div>
    <div class="splash-ui">
      ${image(shared.title, 'splash-title', 'Weather Scientist')}
      <p class="splash-copy">Choose a place, then bring sun, rain, wind, and clouds to life.</p>
      <div class="scene-picker" role="list" aria-label="Choose a weather scene">${sceneCards()}</div>
    </div>`;
  host.appendChild(section);
  section.querySelectorAll('[data-action]').forEach((element) => {
    if (element.dataset.action === 'chooseScene') {
      onTap(element, () => chooseScene(element.dataset.sceneId), { feedback: (event) => feedback(event, 'pop') });
      return;
    }
    onTap(element, () => route(element.dataset.action), { feedback });
  });
  return section;
}

function sceneCards() {
  return scenes().map((entry) => `
    <button class="scene-card" type="button" data-action="chooseScene" data-scene-id="${entry.id}" data-target="scene-${entry.id}" aria-label="Explore the ${entry.label} weather scene">
      ${image(entry.thumb, 'scene-card-thumb', '')}
      <span>${entry.label}</span>
    </button>`).join('');
}

function badgeImages(done = []) {
  return config.guidedOrder.map((kind) => image(shared.badges[kind], done.includes(kind) ? 'is-done' : '', '')).join('');
}

function labMarkup() {
  const free = state.screen === 'free';
  const target = currentTarget();
  const words = sceneWords();
  const prompt = free ? 'Make your own weather!' : words[`${target}-prompt`];
  return `<section class="weather-screen lab" aria-label="${free ? 'Open weather observatory' : 'Guided weather laboratory'}">
    <div class="screen-hud">
      <button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-action="back" data-target="back" aria-label="Back to Weather Scientist home"></button>
      <button class="qk-hud-btn qk-hud-sound qk-hud-top-right sound-button ${state.muted ? 'is-muted' : ''}" type="button" data-action="sound" data-target="sound" aria-label="Toggle sound"></button>
    </div>
    <div class="lab-ui">
      ${free ? '<p class="free-tag">Open Observatory</p>' : `<div class="progress" aria-label="Discovery progress">${progressMarkup(target)}</div>`}
      <div class="prompt-wrap">${image(shared.ui.prompt, '', '')}<p class="prompt-text">${prompt}</p></div>
      <div class="control-tray">${image(shared.ui.tray, '', '')}<div class="weather-controls">${controlMarkup('sun', target, free)}${controlMarkup('rain', target, free)}${windMarkup(target, free)}${controlMarkup('cloud', target, free)}</div></div>
      ${free ? `<button class="art-action lab-reset" type="button" data-action="reset" data-target="reset" aria-label="Start a fresh weather day">${image(shared.ui.reset, '', '')}<span>Reset</span></button>` : ''}
    </div>
  </section>`;
}

function progressMarkup(target) {
  return config.guidedOrder.map((kind) => image(shared.badges[kind], `${state.completed.includes(kind) ? 'is-done' : ''} ${target === kind ? 'is-now' : ''}`, '')).join('');
}

function controlMarkup(kind, target, free) {
  const on = state.weather[kind];
  const role = !free && kind === target ? 'correct' : 'neutral';
  return `<button class="weather-control ${!free && kind === target ? 'is-target' : ''} ${on ? 'is-active' : ''}" type="button" data-action="weather" data-kind="${kind}" data-target="weather-${kind}" data-role="${role}" aria-label="${kind[0].toUpperCase() + kind.slice(1)} weather">${image(shared.controls[kind], '', '')}</button>`;
}

function windMarkup(target, free) {
  const value = Math.round(state.weather.wind * 100);
  const targetRole = !free && target === 'wind' ? 'correct' : 'neutral';
  return `<div class="wind-control ${!free && target === 'wind' ? 'is-target' : ''}" data-target="weather-wind" data-role="${targetRole}" role="group" aria-label="Wind dial">
    ${image(shared.controls.wind, '', '')}
    <div class="wind-slider" tabindex="0" role="slider" aria-label="Wind strength" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
      ${image(shared.ui.windTrack, 'wind-track', '')}<img class="wind-knob" style="left:${value}%" src="${shared.ui.windKnob}" alt="" draggable="false">
    </div>
  </div>`;
}

function celebrationMarkup() {
  return `<section class="weather-screen celebration" aria-label="Weather Scientist celebration">
    <div class="screen-hud"><button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-action="back" data-target="back" aria-label="Back to Weather Scientist home"></button>
      <button class="qk-hud-btn qk-hud-sound qk-hud-top-right sound-button ${state.muted ? 'is-muted' : ''}" type="button" data-action="sound" data-target="sound" aria-label="Toggle sound"></button></div>
    <div class="celebration-ui"><div class="celebrate-card"><h1>You’re a Weather Scientist!</h1><p>Sun, rain, wind, and clouds all changed this world.</p><div class="celebrate-badges" aria-hidden="true">${badgeImages(config.guidedOrder)}</div>
      <button class="art-action explore-button" type="button" data-action="explore" data-target="explore" aria-label="Explore the weather observatory">${image(shared.ui.explore, '', '')}<span>Explore</span></button>
    </div></div>
  </section>`;
}

function wireOverlay() {
  document.querySelectorAll('[data-action]').forEach((element) => {
    if (element.dataset.action === 'weather') {
      onTap(element, () => chooseWeather(element.dataset.kind), { feedback: (event) => feedback(event, 'pop') });
      return;
    }
    onTap(element, () => route(element.dataset.action), { feedback });
  });
  const slider = document.querySelector('.wind-slider');
  slider?.addEventListener('pointerdown', beginWindDrag);
  slider?.addEventListener('keydown', windKeydown);
}

function route(action) {
  if (action === 'back') return showSplash();
  if (action === 'explore') return startFree();
  if (action === 'reset') return resetFree();
  if (action === 'sound') return toggleMute();
}

function chooseScene(sceneId) {
  if (!config.scenes[sceneId]) return false;
  narrator.stop();
  cancelWindDrag();
  teardownWorld();
  state.sceneId = sceneId;
  resetDay();
  state.screen = 'guided';
  document.getElementById('game').querySelector('.splash-screen')?.remove();
  document.getElementById('weather-stage')?.remove();
  mount.insertAdjacentHTML('afterbegin', weatherDom());
  buildWorld();
  window.addEventListener('resize', resizeWorld, { passive: true });
  window.addEventListener('orientationchange', resizeWorld, { passive: true });
  render();
  const firstVisit = !state.visitedScenes.has(sceneId);
  state.visitedScenes.add(sceneId);
  const words = sceneWords();
  if (firstVisit) {
    narrator.saySequence([
      { key: `${sceneId}-welcome`, text: words.welcome },
      { key: `${sceneId}-sun-prompt`, text: words['sun-prompt'] },
    ]);
  } else {
    say('sun-prompt');
  }
  return true;
}

function startFree() {
  narrator.stop();
  state.screen = 'free';
  state.accepting = false;
  render();
  say('free-lab');
  syncWorld();
}

function showSplash() {
  cancelWindDrag();
  narrator.stop();
  resetDay();
  teardownWorld();
  document.getElementById('weather-stage')?.remove();
  state.screen = 'splash';
  state.sceneId = null;
  splashScreen();
}

function resetFree() {
  state.screen = 'free';
  resetDay({ speak: true });
  render();
}

function chooseWeather(kind) {
  if (!['sun', 'rain', 'cloud'].includes(kind) || state.accepting) return false;
  nudge?.poke();
  if (state.screen === 'free') {
    state.weather[kind] = !state.weather[kind];
    if (state.weather[kind]) advanceGrowth(kind);
    syncWorld();
    revealRainbow();
    render();
    return true;
  }
  if (kind !== currentTarget()) {
    // A non-target card gets a short, truthful preview, then returns to its
    // prior off state so the later guided discovery can still read clearly.
    state.weather[kind] = true;
    syncWorld();
    say('gentle-nudge');
    timers.after(650, () => {
      if (isGuided() && !state.completed.includes(kind)) state.weather[kind] = false;
      syncWorld();
      render();
    });
    return false;
  }
  state.weather[kind] = true;
  syncWorld();
  acceptDiscovery(kind);
  return true;
}

function acceptDiscovery(kind) {
  if (state.accepting || state.completed.includes(kind)) return;
  state.accepting = true;
  state.completed.push(kind);
  advanceGrowth(kind);
  syncWorld();
  const resultKey = `${kind}-result`;
  say(resultKey);
  // Let the causal explanation finish before a newer prompt supersedes it.
  // Recorded duration is canonical; the fallback keeps the same calm pacing.
  const resultBeatMs = Math.max(1200, Math.ceil((voice.duration(`${state.sceneId}-${resultKey}`) ?? 2.8) * 1000 + 180));
  timers.after(resultBeatMs, () => {
    // A guided shower is deliberately brief. Growth stays, while the next
    // cloud discovery can visibly become a soft cloud and cool shade.
    if (kind === 'rain') {
      state.weather.rain = false;
      syncWorld();
    }
    state.step += 1;
    state.accepting = false;
    if (state.step >= config.guidedOrder.length) finishGuided();
    else { render(); say(`${currentTarget()}-prompt`); }
  });
  render();
}

function advanceGrowth(kind) {
  if (kind === 'rain') state.growthStage = 'bloom';
  else if (kind === 'sun' && state.growthStage === 'seedling') state.growthStage = 'bud';
}

function finishGuided() {
  state.screen = 'celebration';
  state.accepting = false;
  syncWorld();
  render();
  if (!state.muted) sfx.tada();
  say('complete');
}

function setWind(value, { gesture = false } = {}) {
  const next = Math.max(0, Math.min(1, Number(value) || 0));
  state.weather.wind = next;
  syncWorld();
  updateWindUi();
  if (gesture) nudge?.poke();
  if (state.screen === 'free') return next;
  if (state.screen !== 'guided' || currentTarget() !== 'wind' || state.accepting || next < config.windThreshold) return next;
  acceptDiscovery('wind');
  return next;
}

function updateWindUi() {
  const slider = document.querySelector('.wind-slider');
  const knob = document.querySelector('.wind-knob');
  const percent = `${Math.round(state.weather.wind * 100)}%`;
  if (slider) slider.setAttribute('aria-valuenow', `${Math.round(state.weather.wind * 100)}`);
  if (knob) knob.style.left = percent;
}

function beginWindDrag(event) {
  if (event.isPrimary === false || windPointer !== null) return;
  feedback(event, 'whoosh');
  const slider = event.currentTarget;
  windPointer = event.pointerId;
  const pointerId = windPointer;
  try { slider.setPointerCapture(windPointer); } catch { /* window listeners cover it */ }
  if (state.screen === 'guided' && currentTarget() !== 'wind') say('gentle-nudge');
  setWindFromPointer(slider, event.clientX);
  const move = (next) => { if (next.pointerId === windPointer) setWindFromPointer(slider, next.clientX); };
  const end = (next) => { if (next.pointerId === windPointer) cancelWindDrag(); };
  windCleanup = () => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', end);
    window.removeEventListener('pointercancel', end);
    window.removeEventListener('blur', cancelWindDrag);
    window.removeEventListener('orientationchange', cancelWindDrag);
    try { slider.releasePointerCapture(pointerId); } catch { /* already released */ }
  };
  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerup', end, { passive: true });
  window.addEventListener('pointercancel', end, { passive: true });
  window.addEventListener('blur', cancelWindDrag);
  window.addEventListener('orientationchange', cancelWindDrag);
}

function setWindFromPointer(slider, clientX) {
  const rect = slider.getBoundingClientRect();
  setWind((clientX - rect.left) / Math.max(1, rect.width), { gesture: true });
}

function cancelWindDrag() {
  if (windPointer === null) return;
  const id = windPointer;
  windPointer = null;
  windCleanup?.();
  windCleanup = null;
  return id;
}

function windKeydown(event) {
  const step = event.shiftKey ? .2 : .08;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); feedback(event, 'tick'); setWind(state.weather.wind + step, { gesture: true }); }
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); feedback(event, 'tick'); setWind(state.weather.wind - step, { gesture: true }); }
  if (event.key === 'Home') { event.preventDefault(); setWind(0, { gesture: true }); }
  if (event.key === 'End') { event.preventDefault(); setWind(1, { gesture: true }); }
}

function revealRainbow() {
  if (state.screen !== 'free' || state.rainbowSeen || !state.weather.sun || !state.weather.rain) return;
  state.rainbowSeen = true;
  syncWorld();
  say('rainbow');
  if (!state.muted) sfx.sparkle();
}

function armNudge() {
  nudge ??= createNudger({ first: 11000, repeat: 10500, onNudge: () => {
    if (!isGuided() || state.accepting) return;
    say(currentTarget() === 'wind' ? 'wind-nudge' : 'gentle-nudge');
    document.querySelector('.is-target')?.animate?.([{ transform: 'scale(1.08)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1.08)' }], { duration: 520 });
  }});
  nudge.arm();
}
function stopNudge() { nudge?.stop(); }

function toggleMute(value) {
  state.muted = value == null ? !state.muted : !!value;
  narrator.setMuted(state.muted);
  voice.setMuted(state.muted);
  world?.setMuted(state.muted);
  document.querySelectorAll('.sound-button').forEach((button) => button.classList.toggle('is-muted', state.muted));
  return state.muted;
}

function getTargets() {
  return collectTargets(mount);
}

function debugTap(id) {
  const name = String(id || '').replace(/^weather-/, '').replace(/^scene-/, '');
  if (state.screen === 'splash' && config.scenes[name]) return chooseScene(name);
  if (name === 'explore') { startFree(); return true; }
  if (name === 'reset') { resetFree(); return true; }
  if (name === 'wind') { setWind(1, { gesture: true }); return true; }
  if (['sun', 'rain', 'cloud'].includes(name)) return chooseWeather(name);
  return false;
}

function debugWeather(next = {}) {
  const values = next.weather || next;
  if (typeof values.sun === 'boolean') state.weather.sun = values.sun;
  if (typeof values.rain === 'boolean') state.weather.rain = values.rain;
  if (typeof values.cloud === 'boolean') state.weather.cloud = values.cloud;
  if (values.wind != null) state.weather.wind = Math.max(0, Math.min(1, Number(values.wind) || 0));
  if (['seedling', 'bud', 'bloom'].includes(next.growthStage)) state.growthStage = next.growthStage;
  if (next.screen && ['splash', 'guided', 'celebration', 'free'].includes(next.screen)) state.screen = next.screen;
  syncWorld(); render(); revealRainbow();
  return getState();
}

function getState() {
  return {
    screen: state.screen, mode: 'weather-lab', sceneId: state.sceneId, step: state.step,
    target: isGuided() ? currentTarget() : null,
    completed: state.completed.slice(), weather: { ...state.weather }, growthStage: state.growthStage,
    rainbowSeen: state.rainbowSeen, muted: state.muted, dragging: windPointer !== null,
    awaitingInput: state.screen === 'guided' ? !state.accepting : state.screen === 'free',
    world: world?.getState?.() || null,
  };
}

function debugWin() {
  timers.clearAll();
  state.completed = config.guidedOrder.slice();
  state.step = config.guidedOrder.length;
  state.accepting = false;
  state.weather = { sun: true, rain: false, wind: 1, cloud: true };
  state.growthStage = 'bloom';
  finishGuided();
  return true;
}

const ready = (async () => {
  await voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', {});
  splashScreen();
  return true;
})();

disposeKiosk = installKioskGuards();
disposeUnlock = installUnlockOnGesture({ extra: [() => world?.unlock()] });

installDebug({
  gameId: config.id, engine: 'weather-lab', ready, timers, narrator, voice, sfx, root: mount,
  start: () => chooseScene(config.sceneOrder[0]),
  startMode: (id = 'weather-lab') => id === 'weather-lab' ? (chooseScene(state.sceneId || config.sceneOrder[0]), true) : false,
  listModes: () => [{ id: 'weather-lab', title: 'Weather Lab' }],
  listScenes: () => config.sceneOrder.slice(),
  chooseScene,
  getState, getTargets, tap: debugTap,
  getAudioLog: () => voice.getAudioLog(),
  clearAudioLog: () => voice.clearAudioLog(),
  setWind: (value) => setWind(value, { gesture: true }),
  windDrag: (values = [0, 1]) => { (Array.isArray(values) ? values : [values]).forEach((value) => setWind(value, { gesture: true })); return state.weather.wind; },
  setWeather: debugWeather,
  reset: () => { if (state.screen !== 'free') state.screen = 'free'; resetFree(); return getState(); },
  win: debugWin,
  winRound: debugWin,
  mute: (value = true) => toggleMute(value),
  seed: (value = 42) => { state.seed = Number(value) >>> 0; let t = state.seed; rng = () => { t += 0x6D2B79F5; let n = Math.imul(t ^ t >>> 15, t | 1); n ^= n + Math.imul(n ^ n >>> 7, n | 61); return ((n ^ n >>> 14) >>> 0) / 4294967296; }; return state.seed; },
  home: () => { showSplash(); return true; },
});

window.addEventListener('pagehide', () => { cancelWindDrag(); narrator.stop(); });
window.addEventListener('pageshow', () => { world?.setMuted(state.muted); });
