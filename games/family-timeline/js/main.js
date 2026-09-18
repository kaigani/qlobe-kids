import config from '../config.js';
import { onTap } from '../../../shared/js/tap.js';
import { escapeHtml } from '../../../shared/js/dom.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { hudButton, progressDots } from '../../../shared/js/hud.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { createPaperGlobe } from './paper-globe.js';
import {
  imageFileToJpeg,
  putPhoto,
  getPhoto,
  deletePhoto,
  persistent as photoPersistent,
  createObjectUrl,
  revokeObjectUrl,
} from './family-media.js';

const app = document.querySelector('#app');
const photoInput = document.querySelector('#photo-input');
const narrator = createNarrator({ announcerParent: document.body });
const timers = createTimers();
const reducedMotionQuery = matchMedia('(prefers-reduced-motion: reduce)');
const PROGRESS_KEY = 'qlobe-family-timeline-progress-v1';

let rng = Math.random;
let activeGlobe = null;
let activeNudger = null;
let celebrationDispose = null;
let renderDisposers = [];
let renderObjectUrls = [];
let activeDrag = null;
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });

const state = {
  screen: 'loading',
  modeId: null,
  selectedMemory: null,
  cardOrder: [],
  placements: {},
  mistakes: 0,
  timelineComplete: false,
  destinationIds: [],
  destinationIndex: 0,
  discoveries: [],
  replayDiscoveries: [],
  replayingMap: false,
  aligned: false,
  choiceOpening: false,
  choicePending: false,
  mapComplete: false,
  globeFallback: false,
  muted: false,
  reducedMotion: reducedMotionQuery.matches,
  photoBlob: null,
  photoPersistent: false,
  confirmRemove: false,
  currentPrompt: { key: 'welcome', text: config.voice.welcome },
  seed: null,
};

const splashArtUrls = [
  config.art.background,
  config.art.title,
  ...Object.values(config.art.memories),
  config.art.ui.rainbowRoad,
  config.art.ui.startPlate,
  config.art.ui.globePlate,
  config.art.ui.bookIcon,
  '../../shared/assets/ui/btn-home.png',
  '../../shared/assets/ui/btn-back.png',
  '../../shared/assets/ui/btn-sound.png',
];
const timelineArtUrls = [
  ...Object.values(config.art.pockets),
  config.art.ui.candidateTray,
  config.art.ui.confetti,
];
const mapArtUrls = [
  config.art.mapTexture,
  config.art.ui.storyStar,
  config.art.ui.spinPlate,
  ...Object.values(config.art.storyCards),
  ...Object.values(config.art.stamps),
];
const bookArtUrls = [config.art.ui.cameraPlate, ...mapArtUrls, ...timelineArtUrls];

bgm.preload(config.music);
bgm.setVolume(.12);
installUnlockOnGesture({
  extra: [voice.unlock, bgm.unlock],
  onFirst: () => {
    bgm.play(config.music, { key: 'family-timeline', fadeInMs: 900, loopFadeOutMs: 2400 });
    if (state.screen === 'splash') void say('welcome');
  },
});
installKioskGuards();
window.addEventListener('pointerdown', () => voice.unlock(), { passive: true });

function memoryById(id) {
  return config.memoryCards.find((memory) => memory.id === id) || config.memoryCards[0];
}

function discoveryById(id) {
  return config.discoveryTypes.find((item) => item.id === id) || config.discoveryTypes[0];
}

function destinationById(id) {
  return config.destinations.find((item) => item.id === id) || config.destinations[0];
}

function currentDestination() {
  return destinationById(state.destinationIds[state.destinationIndex]);
}

function activeMapDiscoveries() {
  return state.replayingMap ? state.replayDiscoveries : state.discoveries;
}

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
    state.timelineComplete = Boolean(saved.timelineComplete);
    state.discoveries = Array.isArray(saved.discoveries)
      ? saved.discoveries.filter((item) => item
        && config.destinations.some((destination) => destination.id === item.starId)
        && config.discoveryTypes.some((discovery) => discovery.id === item.type)).slice(0, 3)
      : [];
    state.destinationIds = Array.isArray(saved.destinationIds)
      ? saved.destinationIds.filter((id) => config.destinations.some((item) => item.id === id)).slice(0, 3)
      : [];
    state.destinationIndex = Math.min(state.discoveries.length, 2);
    state.mapComplete = state.discoveries.length >= 3;
  } catch { /* private browsing may deny storage */ }
}

function persistProgress() {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({
      version: 1,
      timelineComplete: state.timelineComplete,
      discoveries: state.discoveries.map(({ starId, type }) => ({ starId, type })),
      destinationIds: state.destinationIds.slice(0, 3),
    }));
  } catch { /* current session remains playable */ }
}

function say(key, text = config.voice[key]) {
  if (!text) return Promise.resolve();
  state.currentPrompt = { key, text };
  return bgm.duckDuring(narrator.say(key, text), { down: .16, downMs: 100, upMs: 320 });
}

function replayCurrentPrompt() {
  return say(state.currentPrompt.key, state.currentPrompt.text);
}

function setMuted(on) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  return state.muted;
}

function disposeDrag() {
  if (!activeDrag) return;
  try { activeDrag.element.releasePointerCapture?.(activeDrag.pointerId); } catch { /* no capture */ }
  activeDrag.element.classList.remove('is-drag-source');
  activeDrag.ghost?.remove();
  activeDrag = null;
  document.body.classList.remove('is-dragging-memory');
}

function disposeScreen() {
  disposeDrag();
  narrator.stop();
  timers.clearAll();
  activeNudger?.stop();
  activeNudger = null;
  activeGlobe?.destroy();
  activeGlobe = null;
  celebrationDispose?.();
  celebrationDispose = null;
  for (const dispose of renderDisposers.splice(0)) {
    try { dispose(); } catch { /* teardown should be best effort */ }
  }
  for (const url of renderObjectUrls.splice(0)) revokeObjectUrl(url);
}

function bindActions(root = app) {
  root.querySelectorAll('[data-action]:not([data-drag-card])').forEach((element) => {
    renderDisposers.push(onTap(element, () => handleAction(element.dataset.action, element.dataset.value), {
      feedback: () => { if (!state.muted) sfx.tick(); },
    }));
  });
}

function mountHud({ home = false, back = true } = {}) {
  const host = document.createElement('div');
  host.className = 'game-hud';
  if (home) {
    const button = hudButton('home', () => { window.location.href = '../../'; });
    button.dataset.target = 'platform-home';
    host.append(button);
    renderDisposers.push(() => button.dispose?.());
  } else if (back) {
    const button = hudButton('back', () => { void renderSplash({ announce: false }); });
    button.dataset.target = 'back';
    host.append(button);
    renderDisposers.push(() => button.dispose?.());
  }
  const sound = hudButton('sound', () => { void replayCurrentPrompt(); });
  sound.dataset.target = 'sound';
  host.append(sound);
  renderDisposers.push(() => sound.dispose?.());
  app.querySelector('.album-screen')?.append(host);
}

function armNudger(kind) {
  const voiceKey = kind === 'timeline' ? 'timeline-nudge' : kind === 'map' ? 'map-nudge' : 'choose';
  activeNudger = createNudger({
    first: 9000,
    repeat: 12500,
    onNudge: () => {
      app.querySelector('[data-role="primary"]')?.classList.add('is-nudged');
      timers.after(900, () => app.querySelector('.is-nudged')?.classList.remove('is-nudged'));
      void say(voiceKey);
    },
  });
  activeNudger.arm();
}

function chapterButton({ action, target, plate, label, value = '', className = '' }) {
  return `<button class="chapter-button ${className}" data-action="${escapeHtml(action)}" data-value="${escapeHtml(value)}" data-target="${escapeHtml(target)}" data-role="primary" aria-label="${escapeHtml(label)}">
    <img src="${escapeHtml(plate)}" alt="" />
    <span>${escapeHtml(label)}</span>
  </button>`;
}

function progressHtml(total, done) {
  const dots = progressDots(total, done);
  return dots.outerHTML;
}

async function renderSplash({ announce = false } = {}) {
  disposeScreen();
  state.screen = 'splash';
  state.modeId = null;
  state.selectedMemory = null;
  state.confirmRemove = false;
  state.currentPrompt = { key: 'welcome', text: config.voice.welcome };
  app.innerHTML = `<section class="album-screen splash-screen" data-qk-screen="splash">
    <div class="splash-content">
      <img class="title-lockup" src="${escapeHtml(config.art.title)}" alt="Family Timeline" />
      <div class="splash-story-path" aria-hidden="true">
        <img class="splash-rainbow" src="${escapeHtml(config.art.ui.rainbowRoad)}" alt="" />
        ${config.memoryCards.map((memory) => `<div class="splash-memory ${memory.id}"><img src="${escapeHtml(config.art.memories[memory.id])}" alt="" /><span>${escapeHtml(memory.label)}</span></div>`).join('')}
      </div>
      <div class="splash-actions">
        ${chapterButton({ action: 'start-timeline', target: 'start-timeline', plate: config.art.ui.startPlate, label: 'Start my story', className: 'start-story' })}
        ${chapterButton({ action: 'start-map', target: 'start-map', plate: config.art.ui.globePlate, label: 'Family map', className: 'map-chapter' })}
        <button class="book-button" data-action="book" data-target="open-book" data-role="primary" aria-label="Open my family storybook">
          <img src="${escapeHtml(config.art.ui.bookIcon)}" alt="" />
          <span class="book-progress">${Number(state.timelineComplete) + state.discoveries.length} / 4</span>
        </button>
      </div>
    </div>
  </section>`;
  bindActions();
  mountHud({ home: true, back: false });
  armNudger('choose');
  if (announce) await say('welcome');
}

function timelineSlotsHtml() {
  return config.memoryCards.map((memory) => {
    const placed = state.placements[memory.id];
    return `<button class="timeline-slot ${placed ? 'is-filled' : ''}" data-action="slot" data-value="${memory.id}" data-target="slot-${memory.id}" data-role="primary" aria-label="${memory.label} memory pocket">
      <img class="pocket-art" src="${escapeHtml(config.art.pockets[memory.id])}" alt="" />
      <span class="slot-label">${escapeHtml(memory.label)}</span>
      ${placed ? `<img class="placed-memory" src="${escapeHtml(config.art.memories[placed])}" alt="${escapeHtml(memoryById(placed).label)} memory" />` : ''}
    </button>`;
  }).join('');
}

function candidateCardsHtml() {
  return state.cardOrder.filter((id) => !Object.values(state.placements).includes(id)).map((id) => {
    const memory = memoryById(id);
    return `<button class="memory-card ${state.selectedMemory === id ? 'is-selected' : ''}" data-action="select-memory" data-drag-card="${id}" data-value="${id}" data-target="memory-${id}" data-role="primary" aria-label="Pick up ${escapeHtml(memory.label)} memory" aria-pressed="${state.selectedMemory === id}">
      <img src="${escapeHtml(config.art.memories[id])}" alt="${escapeHtml(memory.label)}" draggable="false" />
      <span>${escapeHtml(memory.label)}</span>
    </button>`;
  }).join('');
}

async function renderTimeline({ reset = false, announce = false } = {}) {
  await preloadImages(timelineArtUrls);
  disposeScreen();
  state.screen = 'timeline';
  state.modeId = 'growing';
  if (reset || !state.cardOrder.length) {
    state.cardOrder = shuffle(config.memoryCards.map((memory) => memory.id), rng);
    state.placements = {};
    state.selectedMemory = null;
    state.mistakes = 0;
  }
  state.currentPrompt = { key: 'timeline-intro', text: config.voice['timeline-intro'] };
  const done = Object.keys(state.placements).length;
  app.innerHTML = `<section class="album-screen timeline-screen" data-qk-screen="timeline">
    <header class="screen-heading">
      <h1>Put the memories in order</h1>
      <p>Baby <span aria-hidden="true">→</span> Toddler <span aria-hidden="true">→</span> Now</p>
      <div class="paper-progress" aria-label="${done} of 3 memories placed">${done} of 3</div>
    </header>
    <div class="timeline-workspace">
      <div class="timeline-slots">${timelineSlotsHtml()}</div>
      <div class="candidate-tray">
        <img class="tray-art" src="${escapeHtml(config.art.ui.candidateTray)}" alt="" />
        <div class="candidate-cards">${candidateCardsHtml()}</div>
      </div>
    </div>
  </section>`;
  bindActions();
  wireMemoryCards();
  mountHud();
  armNudger('timeline');
  if (announce) await say('timeline-intro');
}

function updateSelectedMemory(id) {
  if (Object.values(state.placements).includes(id)) return false;
  state.selectedMemory = state.selectedMemory === id ? null : id;
  app.querySelectorAll('.memory-card').forEach((card) => {
    const selected = card.dataset.dragCard === state.selectedMemory;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  app.querySelectorAll('.timeline-slot').forEach((slot) => slot.classList.toggle('is-ready', Boolean(state.selectedMemory)));
  if (state.selectedMemory) void say('timeline-help');
  return true;
}

function makeDragGhost(element, rect) {
  const ghost = element.cloneNode(true);
  ghost.className = 'memory-card drag-ghost';
  ghost.removeAttribute('data-action');
  ghost.removeAttribute('data-drag-card');
  ghost.style.width = `${rect.width}px`;
  ghost.style.height = `${rect.height}px`;
  document.body.append(ghost);
  return ghost;
}

function moveDragGhost(drag, x, y) {
  if (!drag.ghost) return;
  drag.ghost.style.left = `${x - drag.offsetX}px`;
  drag.ghost.style.top = `${y - drag.offsetY}px`;
}

function wireMemoryCards() {
  app.querySelectorAll('[data-drag-card]').forEach((element) => {
    const pointerDown = (event) => {
      if (event.isPrimary === false || event.button !== 0 || activeDrag) return;
      const rect = element.getBoundingClientRect();
      activeDrag = {
        element,
        id: element.dataset.dragCard,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        offsetX: event.clientX - rect.left,
        offsetY: event.clientY - rect.top,
        rect,
        moved: false,
        ghost: null,
      };
      element.setPointerCapture?.(event.pointerId);
      activeNudger?.poke();
      event.preventDefault();
    };
    const pointerMove = (event) => {
      const drag = activeDrag;
      if (!drag || drag.element !== element || drag.pointerId !== event.pointerId) return;
      if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) >= 8) {
        drag.moved = true;
        drag.ghost = makeDragGhost(element, drag.rect);
        element.classList.add('is-drag-source');
        document.body.classList.add('is-dragging-memory');
        if (!state.muted) sfx.whoosh();
      }
      moveDragGhost(drag, event.clientX, event.clientY);
      event.preventDefault();
    };
    const pointerEnd = (event) => {
      const drag = activeDrag;
      if (!drag || drag.element !== element || (event.pointerId != null && drag.pointerId !== event.pointerId)) return;
      const moved = drag.moved;
      const id = drag.id;
      const x = event.clientX ?? drag.startX;
      const y = event.clientY ?? drag.startY;
      let slotId = null;
      if (moved) {
        for (const slot of app.querySelectorAll('.timeline-slot')) {
          const rect = slot.getBoundingClientRect();
          if (x >= rect.left - 24 && x <= rect.right + 24 && y >= rect.top - 24 && y <= rect.bottom + 24) {
            slotId = slot.dataset.value;
            break;
          }
        }
      }
      disposeDrag();
      if (moved && slotId) void attemptPlacement(id, slotId);
      else if (moved) {
        element.classList.add('is-returning');
        timers.after(450, () => element.classList.remove('is-returning'));
        if (!state.muted) sfx.unpop();
      } else updateSelectedMemory(id);
      event.preventDefault();
    };
    const keyboardClick = (event) => { if (event.detail === 0) updateSelectedMemory(element.dataset.dragCard); };
    const cancel = (event) => pointerEnd({ pointerId: event.pointerId, clientX: activeDrag?.startX, clientY: activeDrag?.startY, preventDefault() {} });
    element.addEventListener('pointerdown', pointerDown, { passive: false });
    element.addEventListener('pointermove', pointerMove, { passive: false });
    element.addEventListener('pointerup', pointerEnd, { passive: false });
    element.addEventListener('pointercancel', cancel);
    element.addEventListener('lostpointercapture', cancel);
    element.addEventListener('click', keyboardClick);
    renderDisposers.push(() => {
      element.removeEventListener('pointerdown', pointerDown);
      element.removeEventListener('pointermove', pointerMove);
      element.removeEventListener('pointerup', pointerEnd);
      element.removeEventListener('pointercancel', cancel);
      element.removeEventListener('lostpointercapture', cancel);
      element.removeEventListener('click', keyboardClick);
    });
  });
}

async function attemptPlacement(cardId, slotId) {
  if (state.screen !== 'timeline' || !memoryById(cardId) || !memoryById(slotId)) return false;
  if (Object.values(state.placements).includes(cardId) || state.placements[slotId]) return false;
  activeNudger?.poke();
  if (cardId !== slotId) {
    state.mistakes += 1;
    const card = app.querySelector(`[data-target="memory-${CSS.escape(cardId)}"]`);
    const slot = app.querySelector(`[data-target="slot-${CSS.escape(slotId)}"]`);
    card?.classList.add('is-wrong');
    slot?.classList.add('is-wrong');
    timers.after(620, () => { card?.classList.remove('is-wrong'); slot?.classList.remove('is-wrong'); });
    if (!state.muted) sfx.unpop();
    await say('try-again');
    return false;
  }
  state.placements[slotId] = cardId;
  state.selectedMemory = null;
  if (!state.muted) sfx.pop();
  await renderTimeline({ announce: false });
  await say(memoryById(cardId).voiceKey);
  if (Object.keys(state.placements).length === config.memoryCards.length) {
    state.timelineComplete = true;
    persistProgress();
    await renderTimelineWin({ announce: true });
  }
  return true;
}

async function renderTimelineWin({ announce = false } = {}) {
  await preloadImages(timelineArtUrls);
  disposeScreen();
  state.screen = 'timeline-win';
  state.modeId = 'growing';
  state.currentPrompt = { key: 'timeline-complete', text: config.voice['timeline-complete'] };
  app.innerHTML = `<section class="album-screen timeline-win-screen" data-qk-screen="timeline-win">
    <header class="screen-heading reward-heading">
      <h1>Look how you've grown!</h1>
      <div class="paper-progress">3 of 3</div>
    </header>
    <div class="completed-story">
      <img class="reward-rainbow" src="${escapeHtml(config.art.ui.rainbowRoad)}" alt="" />
      <div class="completed-memories">
        ${config.memoryCards.map((memory) => `<figure><img src="${escapeHtml(config.art.memories[memory.id])}" alt="${escapeHtml(memory.label)}" /><figcaption>${escapeHtml(memory.label)}</figcaption></figure>`).join('')}
      </div>
      <img class="paper-burst" src="${escapeHtml(config.art.ui.confetti)}" alt="" />
    </div>
    <div class="reward-actions">
      ${chapterButton({ action: 'start-map', target: 'explore-globe', plate: config.art.ui.startPlate, label: 'Explore family map', className: 'map-chapter reward-map-chapter' })}
      ${chapterButton({ action: 'book', target: 'timeline-book', plate: config.art.ui.startPlate, label: 'Open my book', className: 'book-chapter' })}
    </div>
  </section>`;
  bindActions();
  mountHud();
  const screen = app.querySelector('.timeline-win-screen');
  celebrationDispose = burstConfetti({ host: screen, count: 24, duration: 2200, rng });
  if (announce) await say('timeline-complete');
}

function beginMap({ reset = false } = {}) {
  if (state.mapComplete) {
    // A replay is a fresh three-star journey, but the completed book remains
    // earned until the child finishes the new journey. Leaving midway never
    // destroys their keepsake stamps.
    state.destinationIds = shuffle(config.destinations.map((item) => item.id), rng).slice(0, 3);
    state.destinationIndex = 0;
    state.replayDiscoveries = [];
    state.replayingMap = true;
  } else if (reset || state.destinationIds.length !== 3) {
    state.destinationIds = shuffle(config.destinations.map((item) => item.id), rng).slice(0, 3);
    state.destinationIndex = 0;
    state.discoveries = [];
    state.replayDiscoveries = [];
    state.replayingMap = false;
    persistProgress();
  } else {
    state.destinationIndex = Math.min(state.discoveries.length, 2);
    state.replayDiscoveries = [];
    state.replayingMap = false;
  }
  state.aligned = false;
  state.choiceOpening = false;
  state.choicePending = false;
  return renderMap({ announce: true });
}

async function renderMap({ announce = false } = {}) {
  await preloadImages(mapArtUrls);
  disposeScreen();
  state.screen = 'map';
  state.modeId = 'family-map';
  state.aligned = false;
  state.choiceOpening = false;
  const target = currentDestination();
  state.currentPrompt = { key: 'map-intro', text: config.voice['map-intro'] };
  app.innerHTML = `<section class="album-screen map-screen" data-qk-screen="map">
    <header class="screen-heading map-heading">
      <h1>Find the glowing family star</h1>
      <p>Swipe the globe or use the spin button</p>
      ${progressHtml(3, activeMapDiscoveries().length)}
    </header>
    <div class="map-workspace">
      <div id="globe-mount" class="globe-mount" aria-label="Paper globe"></div>
      <div class="map-side">
        <div class="target-star-card" aria-hidden="true"><img src="${escapeHtml(config.art.ui.storyStar)}" alt="" /><span>Find me!</span></div>
        ${chapterButton({ action: 'assist-spin', target: 'assist-spin', plate: config.art.ui.spinPlate, label: 'Spin to the star', className: 'spin-button' })}
      </div>
    </div>
  </section>`;
  bindActions();
  mountHud();
  armNudger('map');
  const mount = document.querySelector('#globe-mount');
  try {
    activeGlobe = await createPaperGlobe({
      mount,
      textureUrl: config.art.mapTexture,
      pinImageUrl: config.art.ui.storyStar,
      landmarks: config.destinations,
      reducedMotion: state.reducedMotion,
      initial: { lat: 0, lon: state.destinationIndex ? destinationById(state.destinationIds[state.destinationIndex - 1]).lon : 0 },
      onAligned: (id) => { if (id === currentDestination().id) void arriveAtStar(id); },
      onLandmark: (id) => { if (id === currentDestination().id) void arriveAtStar(id); },
    });
    activeGlobe.setVisited(activeMapDiscoveries().map((item) => item.starId));
    activeGlobe.setTarget(target.id);
  } catch (error) {
    console.warn('Family Timeline globe used its 2D fallback', error);
    state.globeFallback = true;
    mount.innerHTML = `<button class="flat-globe" data-action="fallback-land" data-target="flat-globe-star" data-role="primary" aria-label="Open the family story star">
      <img class="flat-map" src="${escapeHtml(config.art.mapTexture)}" alt="World map" />
      <img class="flat-star" src="${escapeHtml(config.art.ui.storyStar)}" alt="" />
    </button>`;
    bindActions(mount);
  }
  if (announce) await say(state.destinationIndex === 0 ? 'map-intro' : 'map-nudge');
}

async function assistSpin() {
  if (state.screen !== 'map' || state.choiceOpening) return false;
  activeNudger?.poke();
  if (!activeGlobe) return arriveAtStar(currentDestination().id);
  if (!state.muted) sfx.whoosh();
  await activeGlobe.assistedSpin();
  return true;
}

async function arriveAtStar(id) {
  if (state.screen !== 'map' || state.choiceOpening || id !== currentDestination().id) return false;
  state.aligned = true;
  state.choiceOpening = true;
  if (!state.muted) sfx.sparkle();
  await say('landed');
  if (state.screen === 'map') await renderStoryChoice(id, { announce: true });
  return true;
}

async function renderStoryChoice(starId = currentDestination().id, { announce = false } = {}) {
  await preloadImages(mapArtUrls);
  disposeScreen();
  state.screen = 'story-choice';
  state.modeId = 'family-map';
  state.choiceOpening = false;
  state.choicePending = false;
  state.currentPrompt = { key: 'choose-stamp', text: config.voice['choose-stamp'] };
  app.innerHTML = `<section class="album-screen story-choice-screen" data-qk-screen="story-choice" data-star="${escapeHtml(starId)}">
    <header class="screen-heading choice-heading">
      <img class="choice-star" src="${escapeHtml(config.art.ui.storyStar)}" alt="" />
      <div><h1>What story lives here?</h1><p>Choose one for your family book</p></div>
      ${progressHtml(3, activeMapDiscoveries().length)}
    </header>
    <div class="story-card-row">
      ${config.discoveryTypes.map((item) => `<button class="story-card" data-action="choose-story" data-value="${escapeHtml(item.id)}" data-target="story-${escapeHtml(item.id)}" data-role="primary" aria-label="${escapeHtml(item.label)}">
        <img src="${escapeHtml(config.art.storyCards[item.id])}" alt="" />
        <span>${escapeHtml(item.label)}</span>
      </button>`).join('')}
    </div>
  </section>`;
  bindActions();
  mountHud();
  if (announce) await say('choose-stamp');
}

async function chooseStory(type) {
  if (state.screen !== 'story-choice' || state.choicePending || !config.discoveryTypes.some((item) => item.id === type)) return false;
  state.choicePending = true;
  app.querySelectorAll('.story-card').forEach((card) => {
    card.disabled = true;
    card.classList.toggle('is-chosen', card.dataset.value === type);
  });
  const starId = currentDestination().id;
  const runDiscoveries = activeMapDiscoveries();
  runDiscoveries.push({ starId, type });
  const chosen = app.querySelector(`[data-target="story-${CSS.escape(type)}"]`);
  const stamp = document.createElement('img');
  stamp.className = 'flying-stamp';
  stamp.src = config.art.stamps[type];
  stamp.alt = '';
  chosen?.append(stamp);
  if (!state.muted) sfx.sparkle();
  if (!state.replayingMap) persistProgress();
  await say(discoveryById(type).voiceKey);
  await timers.wait(300);
  await say('stamp-earned');
  await timers.wait(420);
  if (runDiscoveries.length >= 3) {
    if (state.replayingMap) {
      state.discoveries = runDiscoveries.map((item) => ({ ...item }));
      state.replayDiscoveries = [];
      state.replayingMap = false;
    }
    state.mapComplete = true;
    persistProgress();
    await renderBook({ announce: true, celebrate: true });
  } else {
    state.destinationIndex = runDiscoveries.length;
    state.choicePending = false;
    await renderMap({ announce: true });
  }
  return true;
}

function bookMemoryHtml(memory) {
  const usePhoto = memory.id === 'now' && state.photoBlob;
  let art = config.art.memories[memory.id];
  if (usePhoto) {
    art = createObjectUrl(state.photoBlob);
    renderObjectUrls.push(art);
  }
  return `<figure class="book-memory ${!state.timelineComplete ? 'is-unearned' : ''} ${usePhoto ? 'has-photo' : ''}">
    <img src="${escapeHtml(art)}" alt="${usePhoto ? 'Local family photo' : `${escapeHtml(memory.label)} memory`}" />
    <figcaption>${escapeHtml(memory.label)}</figcaption>
  </figure>`;
}

function bookStampsHtml() {
  const earned = state.discoveries.map((item, index) => {
    const discovery = discoveryById(item.type);
    return `<figure class="book-stamp" style="--tilt:${index % 2 ? '5deg' : '-5deg'}"><img src="${escapeHtml(config.art.stamps[item.type])}" alt="" /><figcaption>${escapeHtml(discovery.label)}</figcaption></figure>`;
  }).join('');
  const empty = Array.from({ length: Math.max(0, 3 - state.discoveries.length) }, () => `<div class="empty-stamp"><img src="${escapeHtml(config.art.ui.storyStar)}" alt="" /></div>`).join('');
  return earned + empty;
}

async function renderBook({ announce = false, celebrate = false } = {}) {
  await preloadImages(bookArtUrls);
  disposeScreen();
  state.screen = 'book';
  state.modeId = null;
  state.currentPrompt = { key: 'book-intro', text: config.voice['book-intro'] };
  app.innerHTML = `<section class="album-screen book-screen" data-qk-screen="book">
    <header class="screen-heading book-heading">
      <h1>My Family Storybook</h1>
      <p>Every family story is special</p>
    </header>
    <div class="book-spread">
      <section class="book-page growing-page" aria-label="My growing story">
        <h2>My growing story</h2>
        <img class="book-rainbow" src="${escapeHtml(config.art.ui.rainbowRoad)}" alt="" />
        <div class="book-memories">${config.memoryCards.map(bookMemoryHtml).join('')}</div>
        ${state.timelineComplete ? '' : chapterButton({ action: 'start-timeline', target: 'book-start-timeline', plate: config.art.ui.startPlate, label: 'Make my story', className: 'book-empty-action' })}
      </section>
      <section class="book-page map-page" aria-label="My family map stories">
        <h2>Family story stars</h2>
        <div class="book-globe-medallion"><img src="${escapeHtml(config.art.mapTexture)}" alt="World map" /></div>
        <div class="book-stamps">${bookStampsHtml()}</div>
        ${state.mapComplete ? '' : chapterButton({ action: 'start-map', target: 'book-start-map', plate: config.art.ui.globePlate, label: 'Find family stars', className: 'book-empty-action' })}
      </section>
    </div>
    <div class="book-tools">
      ${chapterButton({ action: 'photo', target: 'add-photo', plate: config.art.ui.cameraPlate, label: state.photoBlob ? 'Change local photo' : 'Add local photo', className: 'photo-action' })}
      ${state.photoBlob ? `<button class="remove-photo" data-action="ask-remove-photo" data-target="remove-photo" aria-label="Remove local photo">Remove photo</button>` : ''}
      <button class="replay-book" data-action="replay-book" data-target="replay-book" data-role="primary" aria-label="Hear my family storybook">Hear my story</button>
    </div>
    <p class="privacy-note">${state.photoBlob && !state.photoPersistent
      ? 'This photo lasts only until this page closes.'
      : 'Photos stay on this device.'}</p>
    ${state.confirmRemove ? `<div class="paper-modal" role="dialog" aria-modal="true" aria-labelledby="remove-title">
      <div class="paper-modal-card"><h2 id="remove-title">Remove this photo?</h2><p>It will be deleted from this device.</p><div><button data-action="cancel-remove-photo" data-target="keep-photo">Keep it</button><button data-action="confirm-remove-photo" data-target="confirm-remove-photo">Remove</button></div></div>
    </div>` : ''}
  </section>`;
  bindActions();
  mountHud();
  if (celebrate) {
    const screen = app.querySelector('.book-screen');
    celebrationDispose = burstConfetti({ host: screen, count: 28, duration: 2400, rng });
    await say('map-complete');
  } else if (announce) await say('book-intro');
}

async function replayBook() {
  if (state.timelineComplete) {
    for (const memory of config.memoryCards) await say(memory.voiceKey);
  }
  for (const item of state.discoveries) await say(discoveryById(item.type).voiceKey);
  await say('book-intro');
}

async function handlePhotoFile(file) {
  if (!file) return false;
  try {
    const photo = await imageFileToJpeg(file);
    await putPhoto(photo);
    state.photoBlob = photo;
    state.photoPersistent = photoPersistent();
    await renderBook({ announce: false });
    await say('photo-added');
    return true;
  } catch {
    await say('photo-failed');
    return false;
  } finally {
    photoInput.value = '';
  }
}

async function removeLocalPhoto() {
  await deletePhoto();
  state.photoBlob = null;
  state.confirmRemove = false;
  await renderBook({ announce: false });
  await say('photo-removed');
}

async function handleAction(action, value) {
  activeNudger?.poke();
  switch (action) {
    case 'start-timeline': await renderTimeline({ reset: true, announce: true }); break;
    case 'start-map': await beginMap({ reset: state.mapComplete }); break;
    case 'book': await renderBook({ announce: true }); break;
    case 'slot': if (state.selectedMemory) await attemptPlacement(state.selectedMemory, value); else await say('timeline-help'); break;
    case 'assist-spin': await assistSpin(); break;
    case 'fallback-land': await arriveAtStar(currentDestination().id); break;
    case 'choose-story': await chooseStory(value); break;
    case 'photo': photoInput.click(); void say('photo-privacy'); break;
    case 'ask-remove-photo': state.confirmRemove = true; await renderBook({ announce: false }); await say('remove-photo'); break;
    case 'cancel-remove-photo': state.confirmRemove = false; await renderBook({ announce: false }); break;
    case 'confirm-remove-photo': await removeLocalPhoto(); break;
    case 'replay-book': await replayBook(); break;
    default: break;
  }
}

photoInput.addEventListener('change', () => { void handlePhotoFile(photoInput.files?.[0]); });

reducedMotionQuery.addEventListener?.('change', (event) => {
  state.reducedMotion = event.matches;
  activeGlobe?.setReducedMotion(state.reducedMotion);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  disposeDrag();
  narrator.stop();
});

window.addEventListener('pagehide', () => {
  disposeScreen();
  narrator.dispose();
  bgm.stop({ fadeOutMs: 0 });
});

function getDebugState() {
  return {
    screen: state.screen,
    modeId: state.modeId,
    selectedMemory: state.selectedMemory,
    cardOrder: [...state.cardOrder],
    placements: { ...state.placements },
    mistakes: state.mistakes,
    timelineComplete: state.timelineComplete,
    destinationIds: [...state.destinationIds],
    destinationIndex: state.destinationIndex,
    targetStarId: state.destinationIds[state.destinationIndex] || null,
    discoveries: state.discoveries.map((item) => ({ ...item })),
    replayDiscoveries: state.replayDiscoveries.map((item) => ({ ...item })),
    replayingMap: state.replayingMap,
    aligned: state.aligned,
    mapComplete: state.mapComplete,
    globeFallback: state.globeFallback,
    globe: activeGlobe?.getState?.() || null,
    hasPhoto: Boolean(state.photoBlob),
    photoPersistent: state.photoPersistent,
    reducedMotion: state.reducedMotion,
    muted: state.muted,
    seed: state.seed,
    audioLog: voice.getAudioLog(),
    bgm: bgm.stats(),
  };
}

async function createFakePhoto() {
  const canvas = document.createElement('canvas');
  canvas.width = 900;
  canvas.height = 700;
  const context = canvas.getContext('2d');
  context.fillStyle = '#8ed6ef';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#6f55ad';
  context.beginPath();
  context.arc(450, 300, 150, 0, Math.PI * 2);
  context.fill();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .85));
}

installDebug({
  gameId: config.id,
  engine: 'family-timeline-custom',
  ready,
  timers,
  narrator,
  voice,
  sfx,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: async (id) => {
    if (id === 'family-map') await beginMap({ reset: true });
    else await renderTimeline({ reset: true, announce: false });
    return getDebugState();
  },
  getState: getDebugState,
  getTargets: () => collectTargets(app),
  tap: async (id) => {
    const target = [...document.querySelectorAll('[data-target]')].find((node) => node.dataset.target === id);
    if (!target) return false;
    target.click();
    await Promise.resolve();
    return true;
  },
  winRound: async () => {
    if (state.screen === 'timeline') {
      state.placements = Object.fromEntries(config.memoryCards.map((memory) => [memory.id, memory.id]));
      state.timelineComplete = true;
      persistProgress();
      await renderTimelineWin({ announce: false });
    } else {
      if (state.destinationIds.length !== 3) state.destinationIds = config.destinations.slice(0, 3).map((item) => item.id);
      state.discoveries = state.destinationIds.map((starId, index) => ({ starId, type: config.discoveryTypes[index % 3].id }));
      state.replayDiscoveries = [];
      state.replayingMap = false;
      state.mapComplete = true;
      persistProgress();
      await renderBook({ announce: false });
    }
    return getDebugState();
  },
  home: () => renderSplash({ announce: false }),
  mute: (on = true) => setMuted(on),
  onSeed: (seeded, seed) => { rng = seeded; state.seed = seed; },
  placeMemory: (cardId, slotId) => attemptPlacement(cardId, slotId),
  alignGlobe: async () => {
    if (state.screen !== 'map') await beginMap({ reset: false });
    if (activeGlobe) {
      const target = currentDestination();
      await activeGlobe.setView(target.lat, target.lon);
    } else await arriveAtStar(currentDestination().id);
    return getDebugState();
  },
  chooseStory: (type = 'food') => chooseStory(type),
  openBook: () => renderBook({ announce: false }),
  addFakePhoto: async () => {
    const blob = await createFakePhoto();
    await putPhoto(blob);
    state.photoBlob = blob;
    state.photoPersistent = photoPersistent();
    if (state.screen === 'book') await renderBook({ announce: false });
    return true;
  },
  removePhoto: () => removeLocalPhoto(),
  clearProgress: async () => {
    try { localStorage.removeItem(PROGRESS_KEY); } catch { /* ignore */ }
    await deletePhoto();
    Object.assign(state, {
      timelineComplete: false,
      destinationIds: [],
      destinationIndex: 0,
      discoveries: [],
      replayDiscoveries: [],
      replayingMap: false,
      mapComplete: false,
      photoBlob: null,
    });
    await renderSplash({ announce: false });
    return true;
  },
  getAudioLog: voice.getAudioLog,
});

async function init() {
  loadProgress();
  await Promise.all([
    voice.init(config.audio.manifest, config.audio.lines, config.voice),
    preloadImages(splashArtUrls),
  ]);
  try {
    state.photoBlob = await getPhoto();
    state.photoPersistent = photoPersistent();
  } catch { state.photoPersistent = false; }
  await renderSplash({ announce: false });
  readyResolve(true);
}

init().catch((error) => {
  console.error('Family Timeline failed to start', error);
  app.innerHTML = `<section class="album-screen load-error"><div><h1>Let's open the book again.</h1><p>Reload this page to try once more.</p></div></section>`;
  readyResolve(false);
});
