import config from '../config.js';
import { createPaperGlobe } from './paper-globe.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const game = $('#game');
const timers = createTimers();
const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
const destinationById = new Map(config.destinations.map((item) => [item.id, item]));
let rng = mulberry32(42);
let globe = null;
let storyDisposers = [];
let resetTimer = null;
let audioSequence = 0;
let storyOpening = false;
let celebrationTimer = 0;
let celebrationHideTimer = 0;

const linesResponse = await fetch('./data/lines.json');
if (!linesResponse.ok) throw new Error(`Globe Spin Stories lines failed: ${linesResponse.status}`);
const lines = await linesResponse.json();
await voice.init('./assets/audio/manifest.json?v=20260803-recorded', './data/lines.json', lines);

// Begin decoding every lightweight story plate while the child is still on the
// splash/globe. Production CDN latency can otherwise expose the bare frame for
// a beat when a later destination opens for the first time.
const storyPlateReady = new Map(config.destinations.map((destination) => [
  destination.id,
  preloadImages([destination.scene]),
]));

const state = {
  screen: 'splash',
  itinerary: config.destinations.map((item) => item.id),
  index: 0,
  destinationId: config.destinations[0].id,
  aligned: false,
  discoveries: new Set(),
  tourVisited: new Set(),
  visited: loadVisited(),
  passportOpen: false,
  lastLine: 'welcome',
  muted: false,
  reducedMotion: reducedQuery.matches,
  seed: 42,
};

const els = {
  screens: {
    splash: $('#screen-splash'),
    globe: $('#screen-globe'),
    story: $('#screen-story'),
    end: $('#screen-end'),
  },
  homeSlot: $('#splash-home-slot'),
  play: $('#play-button'),
  globeMount: $('#globe-mount'),
  destinationName: $('#destination-name'),
  destinationCaption: $('#destination-caption'),
  tourPips: $('#tour-pips'),
  spin: $('#spin-button'),
  landHint: $('#land-hint'),
  passport: $('#passport-button'),
  passportCount: $('#passport-count'),
  storyPassport: $('#story-passport-button'),
  storyPassportCount: $('#story-passport-count'),
  storyFrame: $('#story-frame'),
  storyScene: $('#story-scene'),
  storyRegion: $('#story-region'),
  storyTitle: $('#story-title'),
  storyFact: $('#story-fact'),
  discoveries: $('#discovery-layer'),
  discoveryPips: $('#discovery-pips'),
  stamp: $('#stamp-button'),
  again: $('#again-button'),
  endPassport: $('#end-passport-button'),
  endStamps: $('#end-stamps'),
  celebration: $('#celebration-art'),
  overlay: $('#passport-overlay'),
  passportStamps: $('#passport-stamps'),
  passportClose: $('#passport-close'),
  resetPassport: $('#reset-passport'),
  live: $('#live-status'),
};

const disposeUnlock = installUnlockOnGesture();
const disposeKiosk = installKioskGuards();

globe = await createPaperGlobe({
  mount: els.globeMount,
  textureUrl: config.globe.texture,
  pinImageUrl: config.globe.pin,
  landmarks: config.destinations,
  initial: config.globe.initial,
  tuning: config.globe,
  reducedMotion: state.reducedMotion,
  onChange: () => {},
  onAligned: (id) => { void onGlobeAligned(id); },
  onLandmark: (id) => { void landAt(id); },
});
globe.setVisited(state.visited);

const staticDisposers = [
  onTap(els.play, () => { void startTour(); }, { feedback: touchFeedback }),
  onTap(els.spin, () => { void assistedSpin(); }, { feedback: touchFeedback }),
  onTap(els.passport, openPassport, { feedback: touchFeedback }),
  onTap(els.storyPassport, openPassport, { feedback: touchFeedback }),
  onTap(els.endPassport, openPassport, { feedback: touchFeedback }),
  onTap(els.passportClose, closePassport, { feedback: touchFeedback }),
  onTap(els.resetPassport, resetPassport, { feedback: touchFeedback }),
  onTap(els.stamp, () => { void stampPage(); }, { feedback: touchFeedback }),
  onTap(els.again, () => { void startTour({ shuffleOrder: true }); }, { feedback: touchFeedback }),
];

for (const button of $$('[data-action="back"]')) {
  staticDisposers.push(onTap(button, goSplash, { feedback: touchFeedback }));
}
for (const button of $$('[data-action="sound"]')) {
  staticDisposers.push(onTap(button, repeatLine, { feedback: touchFeedback }));
}
for (const backdrop of $$('[data-action="close-passport"]')) {
  staticDisposers.push(onTap(backdrop, closePassport));
}

const onReduced = (event) => {
  state.reducedMotion = event.matches;
  globe?.setReducedMotion(event.matches);
};
reducedQuery.addEventListener?.('change', onReduced);

renderHomeLink();
renderProgress();
renderPassport();

const ready = Promise.resolve(true);
const disposeDebug = installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  timers,
  voice,
  sfx,
  root: game,
  listModes: () => config.modes.map((mode) => ({ ...mode })),
  startMode: (id) => id === 'world-tour' ? startTour() : false,
  getState,
  getTargets: () => collectTargets(game),
  tap: async (id) => {
    const target = $$('[data-target]', game).find((node) => node.dataset.target === id && !node.hidden && !node.disabled);
    if (!target) return false;
    target.click();
    await timers.wait(30);
    return true;
  },
  home: () => { goSplash(); return true; },
  onSeed: (next, value) => { rng = next; state.seed = value; },
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  setGlobe: (lat, lon) => globe.setView(lat, lon),
  alignDestination: (id = state.destinationId) => alignDestination(id),
  land: () => debugLand(),
  discover: (kind) => debugDiscover(kind),
  stamp: () => stampPage(),
  openPassport: () => { openPassport(); return true; },
  completeTour: () => completeTour(),
});

function touchFeedback() {
  voice.unlock();
  sfx.unlock();
  sfx.tick();
}

function renderHomeLink() {
  els.homeSlot.replaceChildren();
  const link = document.createElement('a');
  link.href = '../../';
  link.className = 'qk-hud-btn qk-hud-home qk-hud-top-left';
  link.dataset.target = 'home-catalog';
  link.dataset.role = 'navigation';
  link.setAttribute('aria-label', 'Back to all QLOBE Kids games');
  els.homeSlot.append(link);
}

function removeHomeLink() {
  els.homeSlot.replaceChildren();
}

function showScreen(name, { preserveVoice = false } = {}) {
  timers.clearAll();
  if (!preserveVoice) voice.stop();
  closePassport({ silent: true });
  state.screen = name;
  for (const [id, screen] of Object.entries(els.screens)) screen.hidden = id !== name;
  if (name === 'splash') renderHomeLink(); else removeHomeLink();
  if (name === 'globe') requestAnimationFrame(() => globe.resize());
}

async function startTour({ shuffleOrder = false } = {}) {
  state.tourVisited = new Set();
  state.index = 0;
  state.aligned = false;
  state.itinerary = shuffleOrder ? shuffle(config.destinations.map((item) => item.id), rng) : config.destinations.map((item) => item.id);
  state.destinationId = state.itinerary[0];
  // Begin speech while the Play/Again activation is still a trusted gesture.
  // Starting it after the screen transition made Web Speech unreliable in
  // browsers that require narration to begin inside the gesture callback.
  const greeting = speak('welcome');
  showScreen('globe', { preserveVoice: true });
  setDestination(state.destinationId);
  await greeting;
  if (state.screen === 'globe') void speak(currentDestination().prompt);
}

function setDestination(id) {
  const destination = destinationById.get(id);
  if (!destination) return false;
  state.destinationId = id;
  state.aligned = false;
  els.landHint.hidden = true;
  els.destinationName.textContent = destination.name;
  els.destinationName.style.color = destination.color;
  els.destinationCaption.textContent = lines[destination.prompt];
  globe.setTarget(id);
  globe.setVisited(state.visited);
  renderProgress();
  scheduleIdleHelp();
  return true;
}

async function assistedSpin() {
  if (state.screen !== 'globe') return false;
  state.aligned = false;
  els.landHint.hidden = true;
  sfx.whoosh();
  await globe.assistedSpin();
  return true;
}

async function onGlobeAligned(id) {
  if (state.screen !== 'globe' || id !== state.destinationId || state.aligned) return;
  state.aligned = true;
  timers.clearAll();
  els.landHint.hidden = false;
  els.destinationCaption.textContent = lines.landed;
  sfx.sparkle();
  await speak('landed');
}

async function landAt(id) {
  if (storyOpening || state.screen !== 'globe' || id !== state.destinationId || globe.getState().alignedId !== id) return false;
  storyOpening = true;
  sfx.pop();
  try {
    return await openStory(destinationById.get(id));
  } finally {
    storyOpening = false;
  }
}

async function openStory(destination) {
  if (!destination) return false;
  els.storyScene.src = destination.scene;
  els.storyScene.alt = destination.sceneAlt;
  els.destinationCaption.textContent = 'Opening the storybook…';
  await Promise.race([
    storyPlateReady.get(destination.id) || Promise.resolve(),
    timers.wait(8000),
  ]);
  // Decode the actual in-DOM image too: the preload may have populated the
  // network cache without completing this element's paint lifecycle yet.
  await els.storyScene.decode().catch(() => {});
  if (state.screen !== 'globe' || state.destinationId !== destination.id) return false;
  showScreen('story');
  state.discoveries = new Set();
  state.destinationId = destination.id;
  els.storyRegion.textContent = destination.name.toUpperCase();
  els.storyRegion.style.color = destination.color;
  els.storyTitle.textContent = `Meet the ${destination.discoveries[0].label.toLowerCase()}`;
  els.storyFact.textContent = lines[destination.landing];
  els.stamp.disabled = true;
  els.stamp.classList.remove('is-stamped');
  renderDiscoveries(destination);
  renderPassportCounts();
  void speak(destination.landing);
  return true;
}

function renderDiscoveries(destination) {
  for (const dispose of storyDisposers.splice(0)) dispose();
  els.discoveries.replaceChildren();
  els.discoveryPips.replaceChildren();
  destination.discoveries.forEach((discovery) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'discovery-seal';
    button.style.left = `${discovery.x}%`;
    button.style.top = `${discovery.y}%`;
    button.dataset.target = `discover-${discovery.id}`;
    button.dataset.role = 'primary';
    button.setAttribute('aria-label', `Discover ${discovery.label}`);
    const art = document.createElement('img');
    art.src = discoveryArt(discovery.icon);
    art.alt = '';
    art.setAttribute('aria-hidden', 'true');
    button.append(art);
    els.discoveries.append(button);
    storyDisposers.push(onTap(button, () => { void discover(discovery, button); }, { feedback: touchFeedback }));

    const pip = document.createElement('i');
    pip.className = 'discovery-pip';
    pip.dataset.discoveryPip = discovery.id;
    els.discoveryPips.append(pip);
  });
}

async function discover(discovery, button) {
  if (state.screen !== 'story') return false;
  const destination = currentDestination();
  if (!destination || !destination.discoveries.some((item) => item.id === discovery.id)) return false;
  const firstTime = !state.discoveries.has(discovery.id);
  state.discoveries.add(discovery.id);
  button.classList.add('is-done');
  $(`[data-discovery-pip="${CSS.escape(discovery.id)}"]`, els.discoveryPips)?.classList.add('is-done');
  els.storyTitle.textContent = discovery.label;
  els.storyFact.textContent = lines[discovery.line];
  if (firstTime) {
    if (discovery.id === 'animal') sfx.boing(); else sfx.sparkle();
  }
  const token = ++audioSequence;
  await speak(discovery.line, { token });
  if (state.screen === 'story' && state.discoveries.size === destination.discoveries.length) {
    els.stamp.disabled = false;
    if (firstTime && token === audioSequence) {
      els.storyTitle.textContent = 'Page discovered!';
      els.storyFact.textContent = lines['page-complete'];
      void speak('page-complete');
    }
  }
  return true;
}

async function stampPage() {
  if (state.screen !== 'story' || els.stamp.disabled) return false;
  const destination = currentDestination();
  if (!destination) return false;
  els.stamp.disabled = true;
  els.stamp.classList.add('is-stamped');
  state.visited.add(destination.id);
  state.tourVisited.add(destination.id);
  saveVisited();
  globe.setVisited(state.visited);
  renderPassport();
  flashCelebration(1700);
  sfx.tada();
  await speak(destination.stamp);
  if (state.screen !== 'story') return true;
  await timers.wait(650);
  if (state.tourVisited.size >= config.destinations.length) {
    showEnd();
  } else {
    state.index = Math.min(state.index + 1, state.itinerary.length - 1);
    const next = state.itinerary[state.index];
    showScreen('globe');
    setDestination(next);
    void speak(destinationById.get(next).prompt);
  }
  return true;
}

function showEnd() {
  showScreen('end');
  renderEndStamps();
  flashCelebration(2800);
  sfx.tada();
  void speak('all-complete');
}

function renderProgress() {
  els.tourPips.replaceChildren();
  state.itinerary.forEach((id, index) => {
    const pip = document.createElement('i');
    pip.className = 'tour-pip';
    pip.style.backgroundImage = 'url(./assets/ui/stamp-star.webp)';
    pip.classList.toggle('is-done', state.tourVisited.has(id));
    pip.classList.toggle('is-now', index === state.index && state.screen !== 'end');
    els.tourPips.append(pip);
  });
  renderPassportCounts();
}

function renderPassportCounts() {
  const count = state.visited.size;
  els.passportCount.textContent = String(count);
  els.storyPassportCount.textContent = String(count);
}

function renderPassport() {
  renderPassportCounts();
  els.passportStamps.replaceChildren();
  config.destinations.forEach((destination, index) => {
    const stamp = document.createElement('div');
    stamp.className = 'passport-stamp';
    stamp.classList.toggle('is-collected', state.visited.has(destination.id));
    stamp.style.setProperty('--stamp-color', destination.color);
    stamp.style.setProperty('--tilt', `${[-3, 2, -1, 3, -2][index]}deg`);
    const art = document.createElement('img');
    art.src = './assets/ui/stamp-star.webp';
    art.alt = '';
    const label = document.createElement('strong');
    label.textContent = destination.name;
    stamp.append(art, label);
    els.passportStamps.append(stamp);
  });
}

function renderEndStamps() {
  els.endStamps.replaceChildren();
  config.destinations.forEach((destination, index) => {
    const stamp = document.createElement('div');
    stamp.className = 'end-stamp';
    stamp.style.setProperty('--stamp-color', destination.color);
    stamp.style.setProperty('--tilt', `${[-7, 5, -3, 6, -4][index]}deg`);
    const art = document.createElement('img');
    art.src = './assets/ui/stamp-star.webp';
    art.alt = '';
    const label = document.createElement('strong');
    label.textContent = destination.shortName;
    stamp.append(art, label);
    els.endStamps.append(stamp);
  });
}

function openPassport() {
  if (state.passportOpen) return;
  state.passportOpen = true;
  renderPassport();
  els.overlay.hidden = false;
  els.passportClose.focus({ preventScroll: true });
  void speak('passport-open');
}

function closePassport({ silent = false } = {}) {
  if (!state.passportOpen && els.overlay.hidden) return;
  state.passportOpen = false;
  els.overlay.hidden = true;
  resetResetButton();
  if (!silent) sfx.tick();
}

function resetPassport() {
  if (!els.resetPassport.classList.contains('is-confirm')) {
    els.resetPassport.classList.add('is-confirm');
    els.resetPassport.textContent = 'Tap again to clear all five stamps';
    if (resetTimer) timers.clear(resetTimer);
    resetTimer = timers.after(4500, resetResetButton);
    return;
  }
  state.visited.clear();
  try { localStorage.removeItem(config.storageKey); } catch { /* memory state still resets */ }
  globe.setVisited([]);
  renderPassport();
  resetResetButton();
  sfx.unpop();
}

function resetResetButton() {
  els.resetPassport.classList.remove('is-confirm');
  els.resetPassport.textContent = 'Grown-up: reset stamps';
  resetTimer = null;
}

function repeatLine() {
  void speak(state.lastLine || currentDestination()?.prompt || 'drag-help');
}

async function speak(key, { token } = {}) {
  if (!key || !lines[key]) return;
  state.lastLine = key;
  els.live.textContent = lines[key];
  await voice.say(key, lines[key]);
  if (token != null && token !== audioSequence) return false;
  return true;
}

function scheduleIdleHelp() {
  timers.after(12000, () => {
    if (state.screen === 'globe' && !state.aligned) void speak('drag-help');
  });
  timers.after(26000, () => {
    if (state.screen === 'globe' && !state.aligned) void speak('closer');
  });
}

function goSplash() {
  state.aligned = false;
  for (const dispose of storyDisposers.splice(0)) dispose();
  showScreen('splash');
}

function currentDestination() {
  return destinationById.get(state.destinationId);
}

function loadVisited() {
  try {
    const data = JSON.parse(localStorage.getItem(config.storageKey) || 'null');
    if (!data || data.schemaVersion !== 1 || !Array.isArray(data.visited)) return new Set();
    return new Set(data.visited.filter((id) => destinationById.has(id)));
  } catch { return new Set(); }
}

function saveVisited() {
  try {
    localStorage.setItem(config.storageKey, JSON.stringify({ schemaVersion: 1, visited: [...state.visited] }));
  } catch { /* private mode may deny storage; current session remains intact */ }
}

function getState() {
  return {
    screen: state.screen,
    destinationId: state.destinationId,
    itinerary: [...state.itinerary],
    index: state.index,
    globe: globe?.getState() || null,
    aligned: state.aligned,
    discoveries: [...state.discoveries],
    tourVisited: [...state.tourVisited],
    visited: [...state.visited],
    passportOpen: state.passportOpen,
    lastLine: state.lastLine,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    seed: state.seed,
  };
}

async function alignDestination(id) {
  if (!destinationById.has(id)) return false;
  if (state.screen !== 'globe') showScreen('globe');
  if (id !== state.destinationId) setDestination(id);
  await globe.alignTo(id, { turns: 0, duration: state.reducedMotion ? 80 : 240 });
  return true;
}

async function debugLand() {
  await alignDestination(state.destinationId);
  return landAt(state.destinationId);
}

async function debugDiscover(kind) {
  if (state.screen !== 'story') return false;
  const button = $(`[data-target="discover-${CSS.escape(kind)}"]`, els.discoveries);
  if (!button) return false;
  button.click();
  await timers.wait(30);
  return true;
}

function completeTour() {
  state.visited = new Set(config.destinations.map((item) => item.id));
  state.tourVisited = new Set(state.visited);
  saveVisited();
  globe.setVisited(state.visited);
  renderPassport();
  showEnd();
  return true;
}

function discoveryArt(kind) {
  if (kind === 'leaf' || kind === 'grass' || kind === 'pine') return './assets/ui/seal-leaf.webp';
  if (kind === 'spark') return './assets/ui/seal-star.webp';
  return './assets/ui/seal-paw.webp';
}

function flashCelebration(duration) {
  window.clearTimeout(celebrationTimer);
  window.clearTimeout(celebrationHideTimer);
  els.celebration.hidden = false;
  els.celebration.classList.remove('is-showing');
  requestAnimationFrame(() => els.celebration.classList.add('is-showing'));
  // This cleanup deliberately does not use the screen timer group. A story →
  // globe transition clears that group, which used to strand this full-screen
  // raster overlay in its visible state forever.
  celebrationTimer = window.setTimeout(() => {
    els.celebration.classList.remove('is-showing');
    celebrationHideTimer = window.setTimeout(() => {
      els.celebration.hidden = true;
      celebrationHideTimer = 0;
    }, 250);
    celebrationTimer = 0;
  }, duration);
}

window.addEventListener('pagehide', () => {
  disposeDebug();
  disposeUnlock();
  disposeKiosk();
  for (const dispose of staticDisposers) dispose();
  for (const dispose of storyDisposers) dispose();
  reducedQuery.removeEventListener?.('change', onReduced);
  timers.clearAll();
  window.clearTimeout(celebrationTimer);
  window.clearTimeout(celebrationHideTimer);
  globe?.destroy();
}, { once: true });
