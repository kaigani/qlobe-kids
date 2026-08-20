import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as music from '../../../shared/js/music.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { onTap } from '../../../shared/js/tap.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';

const mount = document.getElementById('game');
const timers = createTimers();
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const VALID_MODE_IDS = new Set(config.modes.map((mode) => mode.id));
const TARGET_HINT_OFFSETS = {
  europe: { x: 0, y: -0.035 },
  africa: { x: 0, y: 0.035 },
};

let rng = mulberry32(42);
let mapData = null;
let lineTable = {};
let maskPixels = null;
let maskWidth = 0;
let maskHeight = 0;
let maskColorToId = new Map();
let drag = null;
let flowToken = 0;
let hintTimer = null;
let hintHideTimer = null;
let interactionDisposers = [];
let welcomeSpoken = false;
let tapHelpSpoken = false;
let dragHelpSpoken = false;
let audioActivated = false;
let musicStarted = false;
let voiceDuckToken = 0;

const artFailures = [];
const completedModes = loadCompletedModes();
const state = {
  screen: 'boot',
  phase: 'boot',
  mode: null,
  deck: [],
  index: 0,
  placed: [],
  selected: false,
  busy: true,
  muted: false,
  reducedMotion: reducedQuery.matches,
  seed: 42,
  lastVoiceKey: 'welcome',
  hotContinent: null,
};

const musicReady = music.init(config.music.manifest);
const ready = boot();
const disposeKiosk = installKioskGuards();
const disposeUnlock = installUnlockOnGesture({
  extra: [music.unlock],
  onFirst: () => {
    audioActivated = true;
    startMusic();
  },
});

const onReducedMotion = (event) => {
  state.reducedMotion = event.matches;
};
reducedQuery.addEventListener?.('change', onReducedMotion);

const cancelDragForLayout = () => {
  drag?.cancel();
  clearHotTarget();
};
window.addEventListener('resize', cancelDragForLayout);
window.addEventListener('orientationchange', cancelDragForLayout);

async function boot() {
  const artUrls = collectArtUrls(config);
  const [dataResponse, linesResponse] = await Promise.all([
    fetch(config.assets.continentData),
    fetch(config.audio.lines),
  ]);
  if (!dataResponse.ok) throw new Error(`Puzzle Explorer map data failed: ${dataResponse.status}`);
  if (!linesResponse.ok) throw new Error(`Puzzle Explorer voice lines failed: ${linesResponse.status}`);
  [mapData, lineTable] = await Promise.all([dataResponse.json(), linesResponse.json()]);

  await Promise.all([
    voice.init(config.audio.manifest, config.audio.lines, lineTable),
    loadMask(config.assets.continentMask),
    preloadImages(artUrls),
    musicReady,
  ]);
  await auditArt(artUrls);
  renderSplash();
  return true;
}

function collectArtUrls(value, into = []) {
  if (typeof value === 'string' && /\.(?:webp|png|jpe?g)$/i.test(value)) into.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectArtUrls(item, into));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectArtUrls(item, into));
  return [...new Set(into)];
}

function auditArt(urls) {
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => {
      artFailures.push({ url, reason: 'failed-to-load' });
      console.warn(`Puzzle Explorer art failed: ${url}`);
      resolve();
    };
    image.src = url;
  })));
}

async function loadMask(url) {
  const image = new Image();
  image.decoding = 'async';
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(`Puzzle Explorer continent mask failed: ${url}`));
    image.src = url;
  });
  try { await image.decode?.(); } catch { /* onload is enough for canvas */ }
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  maskWidth = canvas.width;
  maskHeight = canvas.height;
  maskPixels = context.getImageData(0, 0, maskWidth, maskHeight).data;
  maskColorToId = new Map(Object.entries(mapData?.continents || {}).map(([id, continent]) => [
    hexColorKey(continent.maskColor), id,
  ]));
}

function hexColorKey(hex) {
  const value = String(hex || '').replace('#', '');
  const number = Number.parseInt(value, 16);
  return `${(number >> 16) & 255},${(number >> 8) & 255},${number & 255}`;
}

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  Promise.resolve(musicReady).then(() => {
    try {
      music.playSong(config.music.song, config.music.band);
      music.duck(0.22, 80);
      music.setMuted(state.muted);
    } catch { /* ambient music is optional if WebAudio is unavailable */ }
  });
}

function speak(key, fallback = lineTable[key]) {
  if (!key) return Promise.resolve();
  state.lastVoiceKey = key;
  const mine = ++voiceDuckToken;
  if (audioActivated && !state.muted) music.duck(0.055, 90);
  const promise = voice.say(key, fallback || '');
  return Promise.resolve(promise).finally(() => {
    if (mine === voiceDuckToken && audioActivated && !state.muted) music.duck(0.22, 300);
  });
}

async function speakSequence(keys, token = flowToken) {
  for (const key of keys.filter(Boolean)) {
    if (token !== flowToken) return false;
    await speak(key);
  }
  return token === flowToken;
}

function loadCompletedModes() {
  try {
    const saved = JSON.parse(localStorage.getItem(config.storageKey));
    if (!saved || saved.version !== 1 || !Array.isArray(saved.completedModes)) return new Set();
    return new Set(saved.completedModes.filter((id) => VALID_MODE_IDS.has(id)));
  } catch {
    return new Set();
  }
}

function saveCompletedModes() {
  try {
    localStorage.setItem(config.storageKey, JSON.stringify({
      version: 1,
      completedModes: [...completedModes].filter((id) => VALID_MODE_IDS.has(id)),
    }));
  } catch { /* private browsing can deny storage */ }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function register(disposer) {
  if (typeof disposer === 'function') interactionDisposers.push(disposer);
  return disposer;
}

function wireTap(element, action, { quiet = false } = {}) {
  if (!element) return;
  register(onTap(element, action, {
    feedback: () => {
      voice.unlock();
      music.unlock();
      sfx.unlock();
      if (!quiet && !state.muted) sfx.tick();
    },
  }));
}

function resetInteractions({ stopVoice = true } = {}) {
  drag?.detach();
  drag = null;
  for (const dispose of interactionDisposers.splice(0)) {
    try { dispose(); } catch { /* stale elements are already gone */ }
  }
  timers.clearAll();
  hintTimer = null;
  hintHideTimer = null;
  clearHotTarget();
  if (stopVoice) voice.stop();
  document.querySelectorAll('[data-qk-drag-ghost], .drag-ghost').forEach((node) => node.remove());
}

function img(src, alt = '', className = '') {
  return `<img${className ? ` class="${className}"` : ''} src="${src}" alt="${escapeHtml(alt)}" draggable="false">`;
}

function currentItem() {
  return state.deck[state.index] || null;
}

function continentInfo(id) {
  return mapData?.continents?.[id] || null;
}

function targetHint(id, continent) {
  const offset = TARGET_HINT_OFFSETS[id] || { x: 0, y: 0 };
  return {
    x: Math.max(0, Math.min(1, continent.hint.x + offset.x)),
    y: Math.max(0, Math.min(1, continent.hint.y + offset.y)),
  };
}

function modeById(id) {
  return config.modes.find((mode) => mode.id === id) || null;
}

function announce(text) {
  const live = mount.querySelector('[data-live]');
  if (live) live.textContent = text;
}

function hudButton(kind, asset, label) {
  return `<button type="button" class="hud-control hud-${kind}" data-target="${kind}" data-role="navigation" aria-label="${escapeHtml(label)}">${img(asset, '')}</button>`;
}

function renderSplash({ announceChoice = false } = {}) {
  ++flowToken;
  resetInteractions();
  Object.assign(state, {
    screen: 'splash',
    phase: 'choose',
    mode: null,
    deck: [],
    index: 0,
    placed: [],
    selected: false,
    busy: false,
    hotContinent: null,
    lastVoiceKey: 'choose',
  });

  const modeCards = config.modes.map((mode) => {
    const complete = completedModes.has(mode.id);
    return `
      <button type="button" class="mode-card${complete ? ' is-complete' : ''}" data-mode="${mode.id}" data-target="mode-${mode.id}" data-role="choice" aria-label="${escapeHtml(mode.title)}${complete ? ', stamp collected' : ''}">
        ${img(mode.cover, '', 'mode-card-art')}
        <span class="mode-card-title">${escapeHtml(mode.title)}</span>
        ${complete ? '<span class="mode-stamp">✓ Stamp collected</span>' : ''}
      </button>`;
  }).join('');

  mount.innerHTML = `
    <section class="screen splash-screen" data-screen="splash" style="background-image:url('${config.assets.splash}')">
      <a class="splash-home" href="../../" data-target="home" data-role="navigation" aria-label="Back to all QLOBE Kids games">${img(config.assets.home, '')}</a>
      ${img(config.assets.title, config.title, 'splash-title')}
      <p class="splash-kicker">Choose a world adventure</p>
      <div class="mode-grid" role="list" aria-label="World adventures">${modeCards}</div>
      <div class="sr-live" data-live aria-live="polite"></div>
    </section>`;

  mount.querySelectorAll('[data-mode]').forEach((button) => {
    wireTap(button, () => { void startMode(button.dataset.mode); });
  });
  if (announceChoice) void speak('choose');
}

async function startMode(id) {
  await ready;
  const mode = modeById(id);
  if (!mode) return false;
  ++flowToken;
  resetInteractions();
  Object.assign(state, {
    screen: 'map',
    phase: 'playing',
    mode,
    deck: shuffle(mode.items, rng),
    index: 0,
    placed: [],
    selected: false,
    busy: false,
    hotContinent: null,
  });
  renderMap();
  const token = flowToken;
  const opening = [];
  if (!welcomeSpoken) {
    welcomeSpoken = true;
    opening.push('welcome');
  }
  opening.push(mode.voice, currentItem()?.promptVoice);
  void speakSequence(opening, token);
  return true;
}

function renderMap({ reward = null } = {}) {
  resetInteractions();
  const item = currentItem();
  const prompt = reward
    ? `<strong>${escapeHtml(reward.continent.displayName)}</strong><small>${escapeHtml(lineTable[reward.item.voice])}</small>`
    : escapeHtml(item?.prompt || '');

  const continentButtons = Object.entries(mapData.continents).map(([id, continent]) => {
    const hint = targetHint(id, continent);
    return `
      <button type="button" class="continent-target${reward?.continentId === id ? ' is-correct' : ''}"
        style="left:${hint.x * 100}%;top:${hint.y * 100}%"
        data-continent="${id}" data-slot="continent" data-target="continent-${id}" data-role="drop-target"
        aria-label="${escapeHtml(continent.displayName)}">
        <span>${escapeHtml(continent.displayName)}</span>
      </button>`;
  }).join('');

  const placedCards = state.placed.map((placed) => {
    const hint = continentInfo(placed.continent)?.hint;
    if (!hint) return '';
    return img(placed.asset, placed.name, 'placed-card').replace('<img',
      `<img style="left:${hint.x * 100}%;top:${hint.y * 100}%" data-placed="${placed.id}"`);
  }).join('');

  const successBurst = reward
    ? img(config.assets.successBurst, '', 'success-burst').replace('<img',
      `<img style="left:${reward.continent.hint.x * 100}%;top:${reward.continent.hint.y * 100}%"`)
    : '';

  const trayCard = !reward && item ? `
    <button type="button" class="current-card${state.selected ? ' is-selected' : ''}" data-card="${item.id}" data-target="card-${item.id}" data-role="draggable" aria-label="${escapeHtml(item.name)}. Tap to select, or drag to a continent.">
      ${img(item.asset, item.name)}
    </button>
    <p class="tray-instruction">Tap card, then continent — or drag</p>` : '';

  mount.innerHTML = `
    <section class="screen play-screen" data-screen="map" data-phase="${reward ? 'reward' : 'playing'}" style="background-image:url('${config.assets.playTexture}')">
      ${hudButton('back', config.assets.back, 'Choose another adventure')}
      ${hudButton('sound', config.assets.sound, 'Hear the directions again')}
      <div class="round-counter" aria-label="Picture ${Math.min(state.index + 1, state.deck.length)} of ${state.deck.length}">${Math.min(state.index + 1, state.deck.length)} / ${state.deck.length}</div>
      <header class="prompt-shell${reward ? ' is-reward' : ''}">
        ${img(config.assets.promptRibbon, '', 'prompt-ribbon-art')}
        <div class="prompt-copy">${prompt}</div>
      </header>
      <div class="play-stage">
        <div class="map-frame">
          ${img(config.assets.mapBoard, '', 'map-board-art')}
          <div class="map-surface" data-map-surface>
            ${img(config.assets.continents, 'Colorful papercraft map of six continents', 'continent-art')}
            ${continentButtons}
            ${successBurst}
            ${placedCards}
          </div>
        </div>
        <div class="tray-frame">
          ${img(config.assets.tray, '', 'tray-art')}
          ${trayCard}
        </div>
      </div>
      ${img(config.assets.handGuide, '', 'hand-guide')}
      <div class="sr-live" data-live aria-live="assertive"></div>
    </section>`;

  wireTap(mount.querySelector('[data-target="back"]'), () => renderSplash({ announceChoice: true }));
  wireTap(mount.querySelector('[data-target="sound"]'), repeatCurrentVoice);

  if (reward || !item) {
    announce(reward ? `${reward.continent.displayName}. ${lineTable[reward.item.voice]}` : '');
    return;
  }

  mount.querySelectorAll('[data-continent]').forEach((button) => {
    wireTap(button, () => { void onContinentTap(button.dataset.continent); });
  });

  const mapSurface = mount.querySelector('[data-map-surface]');
  wireTap(mapSurface, (event) => {
    // Pointer taps route through the raster map so overlapping 96px semantic
    // buttons on narrow phones can never steal one another's presses. Keyboard
    // and assistive-tech activation still use the individual buttons above.
    if (event.target?.closest?.('[data-continent]')) return;
    const continentId = continentAtMapTap(event.clientX, event.clientY);
    if (continentId) void onContinentTap(continentId);
  }, { quiet: true });

  const card = mount.querySelector('[data-card]');
  wireTap(card, selectCurrentCard);
  const onPointerDown = (event) => drag?.begin(event, item.id);
  card.addEventListener('pointerdown', onPointerDown);
  register(() => card.removeEventListener('pointerdown', onPointerDown));

  drag = createDragToSlotDom({
    getPiece: (id) => id === item.id ? { el: card, item } : null,
    ghostHost: document.body,
    root: () => mount.querySelector('[data-map-surface]'),
    slotSelector: '[data-continent]',
    slotPad: 12,
    ghostClass: 'drag-ghost',
    canStart: () => state.screen === 'map' && state.phase === 'playing' && !state.busy,
    onLift: () => {
      state.selected = true;
      card.classList.add('is-selected');
      stopHint();
      if (!state.muted) sfx.whoosh();
    },
    onMove: (_piece, record) => updateHotTarget(continentAtClient(record.lastX, record.lastY)),
    onDrop: async (_piece, record) => {
      clearHotTarget();
      const continentId = continentAtClient(record.lastX, record.lastY);
      await attemptPlacement(continentId, 'drag');
    },
    onCancel: () => {
      clearHotTarget();
      state.selected = false;
      card.classList.remove('is-selected');
      if (state.phase === 'playing') scheduleHint(config.timing.repeatHintMs);
    },
  });
  scheduleHint(config.timing.firstHintMs);
}

function selectCurrentCard() {
  if (state.busy || state.phase !== 'playing') return false;
  stopHint();
  state.selected = true;
  const card = mount.querySelector('[data-card]');
  card?.classList.add('is-selected');
  announce(`Selected ${currentItem()?.name}. Now choose a continent.`);
  if (!tapHelpSpoken) {
    tapHelpSpoken = true;
    void speak('tap-help');
  }
  return true;
}

async function onContinentTap(continentId) {
  if (state.busy || state.phase !== 'playing') return false;
  if (!state.selected) {
    selectCurrentCard();
    updateHotTarget(continentId, { persistent: true });
    return false;
  }
  return attemptPlacement(continentId, 'tap');
}

async function attemptPlacement(continentId, source = 'debug') {
  const item = currentItem();
  if (!item || state.screen !== 'map' || state.phase !== 'playing' || state.busy) return false;
  stopHint();
  clearHotTarget();

  if (continentId !== item.continent) {
    state.busy = true;
    const card = mount.querySelector('[data-card]');
    card?.classList.add('is-wrong');
    const wrongTarget = mount.querySelector(`[data-continent="${continentId}"]`);
    wrongTarget?.classList.add('is-selected');
    announce(`That is not the spot for ${item.name}. Try another continent.`);
    if (!state.muted) sfx.unpop();
    void speak('nudge');
    timers.after(720, () => {
      if (state.screen !== 'map' || currentItem()?.id !== item.id) return;
      state.busy = false;
      state.selected = source === 'tap';
      card?.classList.remove('is-wrong');
      wrongTarget?.classList.remove('is-selected');
      if (state.selected) card?.classList.add('is-selected');
      scheduleHint(2400);
    });
    return false;
  }

  const token = ++flowToken;
  state.busy = true;
  state.phase = 'reward';
  state.selected = false;
  state.placed.push(item);
  const continent = continentInfo(continentId);
  if (!state.muted) {
    sfx.pop();
    sfx.sparkle();
  }
  renderMap({ reward: { item, continent, continentId } });
  announce(`It’s puzzle-tastic! ${continent.displayName}. ${lineTable[item.voice]}`);

  const spoke = await speakSequence(['success', `continent-${continentId}`, item.voice], token);
  if (!spoke || token !== flowToken || state.screen !== 'map') return true;
  await timers.wait(config.timing.successHoldMs);
  if (token !== flowToken || state.screen !== 'map') return true;

  state.index += 1;
  state.busy = false;
  if (state.index >= state.deck.length) {
    renderEnd({ announceCompletion: true });
    return true;
  }

  state.phase = 'playing';
  renderMap();
  void speak(currentItem().promptVoice, currentItem().prompt);
  return true;
}

function repeatCurrentVoice() {
  const item = currentItem();
  const key = state.screen === 'map' && state.phase === 'playing'
    ? item?.promptVoice
    : state.lastVoiceKey;
  if (!key) return false;
  void speak(key, item?.prompt);
  return true;
}

function sampleMaskPixel(x, y) {
  if (!maskPixels || x < 0 || y < 0 || x >= maskWidth || y >= maskHeight) return null;
  const index = (Math.floor(y) * maskWidth + Math.floor(x)) * 4;
  if (maskPixels[index + 3] < 120) return null;
  return maskColorToId.get(`${maskPixels[index]},${maskPixels[index + 1]},${maskPixels[index + 2]}`) || null;
}

function continentAtClient(clientX, clientY) {
  const surface = mount.querySelector('[data-map-surface]');
  if (!surface || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;
  const rect = surface.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  const x = ((clientX - rect.left) / rect.width) * maskWidth;
  const y = ((clientY - rect.top) / rect.height) * maskHeight;
  const exact = sampleMaskPixel(x, y);
  if (exact) return exact;

  const radius = Math.max(5, (12 / Math.max(rect.width, 1)) * maskWidth);
  for (const scale of [0.55, 1, 1.55]) {
    for (let step = 0; step < 16; step += 1) {
      const angle = (Math.PI * 2 * step) / 16;
      const nearby = sampleMaskPixel(x + Math.cos(angle) * radius * scale, y + Math.sin(angle) * radius * scale);
      if (nearby) return nearby;
    }
  }
  return null;
}

function continentAtMapTap(clientX, clientY) {
  const exact = continentAtClient(clientX, clientY);
  if (exact) return exact;
  if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return null;

  let nearest = null;
  let nearestDistance = Infinity;
  for (const target of mount.querySelectorAll('[data-continent]')) {
    const rect = target.getBoundingClientRect();
    const distance = Math.hypot(clientX - (rect.left + rect.width / 2), clientY - (rect.top + rect.height / 2));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = target.dataset.continent;
    }
  }
  return nearestDistance <= 54 ? nearest : null;
}

function updateHotTarget(continentId, { persistent = false } = {}) {
  if (state.hotContinent === continentId) return;
  clearHotTarget();
  state.hotContinent = continentId || null;
  if (!continentId) return;
  const target = mount.querySelector(`[data-continent="${continentId}"]`);
  if (!target) return;
  const correct = continentId === currentItem()?.continent;
  target.classList.add(correct ? 'is-hot' : 'is-selected');
  if (persistent) target.dataset.persistent = 'true';
}

function clearHotTarget() {
  mount?.querySelectorAll?.('.continent-target.is-hot, .continent-target.is-selected').forEach((target) => {
    target.classList.remove('is-hot', 'is-selected');
    delete target.dataset.persistent;
  });
  state.hotContinent = null;
}

function scheduleHint(delay) {
  if (state.screen !== 'map' || state.phase !== 'playing' || state.busy) return;
  if (hintTimer) timers.clear(hintTimer);
  hintTimer = timers.after(delay, showHint);
}

function showHint() {
  hintTimer = null;
  const item = currentItem();
  const guide = mount.querySelector('.hand-guide');
  const card = mount.querySelector('[data-card]');
  const target = mount.querySelector(`[data-continent="${item?.continent}"]`);
  if (!guide || !card || !target || state.busy || state.phase !== 'playing') return;
  const cardRect = card.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const startX = cardRect.left + cardRect.width / 2;
  const startY = cardRect.top + cardRect.height / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;
  guide.style.left = `${startX}px`;
  guide.style.top = `${startY}px`;
  guide.style.setProperty('--guide-x', `${endX - startX}px`);
  guide.style.setProperty('--guide-y', `${endY - startY}px`);
  guide.classList.remove('is-visible');
  void guide.offsetWidth;
  guide.classList.add('is-visible');
  target.classList.add('is-hint');
  if (!dragHelpSpoken) {
    dragHelpSpoken = true;
    void speak('drag-help');
  }
  if (hintHideTimer) timers.clear(hintHideTimer);
  hintHideTimer = timers.after(4700, () => {
    guide.classList.remove('is-visible');
    target.classList.remove('is-hint');
    hintHideTimer = null;
    scheduleHint(config.timing.repeatHintMs);
  });
}

function stopHint() {
  if (hintTimer) timers.clear(hintTimer);
  if (hintHideTimer) timers.clear(hintHideTimer);
  hintTimer = null;
  hintHideTimer = null;
  mount.querySelector('.hand-guide')?.classList.remove('is-visible');
  mount.querySelectorAll('.continent-target.is-hint').forEach((target) => target.classList.remove('is-hint'));
}

function renderEnd({ announceCompletion = false } = {}) {
  ++flowToken;
  resetInteractions();
  const mode = state.mode;
  if (!mode) return renderSplash();
  completedModes.add(mode.id);
  saveCompletedModes();
  Object.assign(state, {
    screen: 'end',
    phase: 'complete',
    busy: false,
    selected: false,
    lastVoiceKey: mode.completeVoice,
  });
  const allComplete = config.modes.every((entry) => completedModes.has(entry.id));
  const cards = mode.items.map((item) => img(item.asset, item.name)).join('');

  mount.innerHTML = `
    <section class="screen end-screen" data-screen="end" style="background-image:url('${config.assets.splash}')">
      <a class="splash-home" href="../../" data-target="home" data-role="navigation" aria-label="Back to all QLOBE Kids games">${img(config.assets.home, '')}</a>
      ${hudButton('sound', config.assets.sound, 'Hear the celebration again')}
      ${img(config.assets.title, config.title, 'end-title')}
      <h1 class="end-heading">${escapeHtml(mode.title)} stamp collected!</h1>
      <p class="end-kicker">Six discoveries found their places</p>
      <div class="passport-cards" aria-label="Completed picture passport">${cards}</div>
      <div class="end-actions">
        <button type="button" class="action-button" data-target="replay" data-role="choice" aria-label="Play ${escapeHtml(mode.title)} again">${img(config.assets.play, '')}<span>Play again</span></button>
        <button type="button" class="action-button" data-target="choose" data-role="navigation" aria-label="Choose another adventure">${img(config.assets.back, '')}<span>Choose another</span></button>
      </div>
      ${allComplete ? '<p class="all-complete">All three passport stamps! You explored animals, foods, and wonders around our big world.</p>' : ''}
      ${img(config.assets.confetti, '', 'confetti-layer')}
      <div class="sr-live" data-live aria-live="assertive"></div>
    </section>`;

  wireTap(mount.querySelector('[data-target="sound"]'), repeatCurrentVoice);
  wireTap(mount.querySelector('[data-target="replay"]'), () => { void startMode(mode.id); });
  wireTap(mount.querySelector('[data-target="choose"]'), () => renderSplash({ announceChoice: true }));
  announce(`${mode.title} stamp collected.`);
  if (announceCompletion) {
    const token = flowToken;
    void speakSequence([mode.completeVoice, allComplete ? 'all-complete' : 'replay'], token);
  }
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  sfx.setMuted(state.muted);
  voice.setMuted(state.muted);
  music.setMuted(state.muted);
  return state.muted;
}

function tapTarget(id) {
  const target = [...mount.querySelectorAll('[data-target]')].find((node) => node.dataset.target === id && !node.hidden && !node.disabled);
  if (!target) return false;
  target.click();
  return true;
}

function debugState() {
  return {
    screen: state.screen,
    phase: state.phase,
    mode: state.mode?.id || null,
    round: state.index,
    totalRounds: state.deck.length,
    currentItem: currentItem()?.id || null,
    expectedContinent: currentItem()?.continent || null,
    placed: state.placed.map((item) => item.id),
    selected: state.selected,
    busy: state.busy,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    activeDrag: Boolean(drag?.active),
    completedModes: [...completedModes],
    mapReady: Boolean(maskPixels && mapData),
    artFailures: artFailures.map((entry) => ({ ...entry })),
    timers: timers.size(),
    music: music.stats(),
  };
}

async function debugPlace(itemId = currentItem()?.id, continentId = currentItem()?.continent) {
  await ready;
  if (state.screen !== 'map' || currentItem()?.id !== itemId) return false;
  state.selected = true;
  return attemptPlacement(continentId, 'debug');
}

async function debugDropAt(itemIdOrClientX, normalizedXOrClientY, normalizedY) {
  await ready;
  let clientX;
  let clientY;
  if (normalizedY === undefined) {
    clientX = Number(itemIdOrClientX);
    clientY = Number(normalizedXOrClientY);
  } else {
    if (currentItem()?.id !== itemIdOrClientX) return false;
    const surface = mount.querySelector('[data-map-surface]');
    if (!surface) return false;
    const rect = surface.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, Number(normalizedXOrClientY)));
    const y = Math.max(0, Math.min(1, Number(normalizedY)));
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    clientX = rect.left + rect.width * x;
    clientY = rect.top + rect.height * y;
  }
  return attemptPlacement(continentAtClient(clientX, clientY), 'debug-drop');
}

async function debugCompleteMode() {
  await ready;
  if (!state.mode || state.screen !== 'map') return false;
  state.placed = state.mode.items.slice();
  state.index = state.deck.length;
  renderEnd({ announceCompletion: false });
  return true;
}

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: debugState,
  getTargets: () => collectTargets(mount),
  tap: async (id) => { await ready; return tapTarget(id); },
  winRound: async () => { await ready; return attemptPlacement(currentItem()?.continent, 'debug'); },
  place: debugPlace,
  dropAt: debugDropAt,
  continentAt: (x, y) => continentAtClient(Number(x), Number(y)),
  completeMode: debugCompleteMode,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  mute: setMuted,
  timers,
  sfx,
  voice,
  onSeed: (nextRng, seed) => {
    rng = nextRng;
    state.seed = seed;
  },
  home: () => { window.location.href = '../../'; },
});

window.addEventListener('beforeunload', () => {
  ++flowToken;
  resetInteractions();
  disposeUnlock();
  disposeKiosk();
  reducedQuery.removeEventListener?.('change', onReducedMotion);
  window.removeEventListener('resize', cancelDragForLayout);
  window.removeEventListener('orientationchange', cancelDragForLayout);
  music.stopSong?.();
});
