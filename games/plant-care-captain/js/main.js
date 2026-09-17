import config from '../config.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { soundDebounce } from '../../../shared/js/hud.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';

const mount = document.getElementById('game');
const timers = createTimers();
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
const plants = new Map(Object.entries(config.modes));

const state = {
  ready: false,
  screen: 'select',
  plantId: null,
  toolIndex: 0,
  progress: { water: 0, mist: 0, prune: 0 },
  completedTools: [],
  cutLeaves: [],
  completedPlants: [],
  feedbackKind: null,
  feedbackTick: 0,
  inputLocked: false,
  muted: false,
  seed: 42,
  flowToken: 0,
  lastDragAt: 0,
  contact: null,
  fallingLeaf: null,
  actionBusy: false,
  completionQueued: null,
};

let rng = mulberry32(state.seed);
let dragController = null;
let currentVoiceKey = 'welcome';
let soundHoldTimer = null;
let soundWasLongPress = false;
const repeatSound = soundDebounce(repeatPrompt, 650);

function plant() { return plants.get(state.plantId) || null; }
function toolId() { return config.toolOrder[state.toolIndex] || null; }
function tool() { return config.tools[toolId()] || null; }
function hasCompleted(id) { return state.completedTools.includes(id); }
function isPlantComplete(id) { return state.completedPlants.includes(id); }
function image(src, className = '', alt = '') {
  return `<img class="${className}" src="${src}" alt="${alt}" draggable="false">`;
}

function play(name) {
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* sound is never load-bearing */ }
}

function say(key) {
  currentVoiceKey = key;
  const text = config.voice[key] || '';
  mount.querySelector('[data-live]')?.replaceChildren(document.createTextNode(text));
  if (state.muted) return Promise.resolve();
  return voiceClips.say(key, text);
}

function repeatPrompt() { return say(currentVoiceKey); }

function toggleMute() {
  state.muted = !state.muted;
  voiceClips.setMuted(state.muted);
  sfx.setMuted?.(state.muted);
  if (!state.muted) repeatPrompt();
  return state.muted;
}

function liveMarkup() {
  return '<p class="visually-hidden" aria-live="polite" data-live></p>';
}

function soundMarkup() {
  return '<button class="qk-hud-btn qk-hud-sound qk-hud-bottom-left" type="button" data-action="sound" data-target="sound" aria-label="Hear that again. Hold to mute or unmute."></button>';
}

function backMarkup() {
  return '<button class="qk-hud-btn qk-hud-back qk-hud-top-left" type="button" data-action="back" data-target="back" aria-label="Back to plant choices"></button>';
}

function backgroundMarkup(thriving = false) {
  const source = thriving ? config.assets.backgroundThriving : config.assets.background;
  return image(source, 'greenhouse-backdrop', thriving ? 'A warm, sunny clay greenhouse' : 'A tiny clay greenhouse workbench');
}

function selectMarkup() {
  const cards = config.modeOrder.map((id) => {
    const item = plants.get(id);
    const done = isPlantComplete(id);
    return `<button class="plant-choice ${done ? 'is-complete' : ''}" type="button" data-action="choose" data-mode="${id}" data-target="plant-${id}" aria-label="Choose ${item.title} the ${item.kind}">
      ${image(config.assets.choiceCard, 'choice-card-art')}
      ${image(item.states[done ? 'bloom' : 'dry'], 'choice-plant')}
      <span class="choice-name">${item.title}</span>
      ${done ? image(config.assets.rosette, 'choice-rosette', `${item.title} is thriving`) : ''}
    </button>`;
  }).join('');

  return `<section class="plant-screen select-screen" aria-label="Choose a plant friend">
    ${liveMarkup()}
    ${backgroundMarkup()}
    ${image(config.assets.title, 'title-lockup', 'Plant Care Captain')}
    <p class="select-instruction">Choose a plant friend</p>
    <div class="plant-choices">${cards}</div>
    <a class="qk-hud-btn qk-hud-home qk-hud-top-left" data-target="home" href="../../" aria-label="Home"></a>
    ${soundMarkup()}
  </section>`;
}

function currentVisualState() {
  if (hasCompleted('prune')) return 'bloom';
  if (hasCompleted('mist')) return 'misted';
  if (hasCompleted('water')) return 'watered';
  return 'dry';
}

function introMarkup() {
  const selected = plant();
  const current = tool();
  const currentId = toolId();
  if (!selected || !current) return selectMarkup();
  return `<section class="plant-screen intro-screen" aria-label="${current.title}">
    ${liveMarkup()}
    ${backgroundMarkup()}
    <div class="intro-plant-stage">
      ${image(selected.states[currentVisualState()], `intro-plant state-${currentVisualState()}`, `${selected.title} the ${selected.kind}`)}
    </div>
    <div class="intro-scrim" aria-hidden="true"></div>
    <div class="intro-card">
      ${image(config.assets.introCloud, 'intro-cloud-art')}
      ${image(config.assets[current.asset], `intro-tool tool-${currentId}`)}
      <div class="intro-copy">
        <h1>${current.title}</h1>
        <p>${current.instruction}</p>
      </div>
      <button class="clay-action intro-action" type="button" data-action="start-tool" data-target="start-${currentId}">
        ${image(config.assets.actionButton, 'action-button-art')}
        <span>I'm ready!</span>
      </button>
    </div>
    ${backMarkup()}
    ${soundMarkup()}
  </section>`;
}

function progressIcon(currentId, index) {
  if (currentId === 'water') return config.assets.waterDrops[index % config.assets.waterDrops.length];
  if (currentId === 'prune') return config.assets.dryLeaf;
  return config.assets.glint;
}

function progressMarkup(currentId, count) {
  const current = config.tools[currentId];
  const pips = Array.from({ length: current.threshold }, (_, index) => (
    index < count ? image(progressIcon(currentId, index), `progress-mark mark-${currentId}`) : '<span class="progress-empty" aria-hidden="true"></span>'
  )).join('');
  return `<div class="care-progress" aria-label="${count} of ${current.threshold} gentle ${current.short.toLowerCase()} actions complete">
    ${image(config.assets.progressTray, 'progress-tray-art')}
    <div class="progress-marks">${pips}</div>
  </div>`;
}

function gaugeMarkup(count) {
  const drops = Array.from({ length: 3 }, (_, index) => (
    index < count ? image(config.assets.waterDrops[index], 'gauge-drop') : '<span></span>'
  )).join('');
  return `<div class="moisture-gauge" aria-hidden="true">
    ${image(config.assets.moistureGauge, 'moisture-gauge-art')}
    <div class="gauge-drops">${drops}</div>
  </div>`;
}

function pruneLeavesMarkup() {
  return [0, 1, 2].map((index) => {
    if (state.cutLeaves.includes(index)) return '';
    const snipping = state.contact?.kind === 'prune' && state.contact.leaf === index;
    return `<button class="dry-leaf leaf-${index} ${snipping ? 'is-snipping' : ''}" type="button" data-action="leaf" data-leaf="${index}" data-slot="leaf-${index}" data-target="dry-leaf-${index}" aria-label="Snip brown leaf ${index + 1}">
      ${image(config.assets.dryLeaf)}
    </button>`;
  }).join('');
}

function feedbackMarkup() {
  if (!state.feedbackKind) return '';
  const kind = state.feedbackKind;
  let sources = config.assets.waterDrops;
  if (kind === 'mist') sources = [config.assets.mistCloud, config.assets.glint, config.assets.glint];
  if (kind === 'prune') sources = [config.assets.glint, config.assets.glint];
  return `<div class="care-feedback feedback-${kind}" data-feedback="${state.feedbackTick}" aria-hidden="true">
    ${sources.map((src, index) => image(src, `feedback-piece feedback-piece-${index}`)).join('')}
  </div>`;
}

function contactMarkup() {
  if (!state.contact) return '';
  const leafClass = Number.isInteger(state.contact.leaf) ? ` contact-leaf-${state.contact.leaf}` : '';
  return image(config.assets[tool().asset], `contact-tool contact-${state.contact.kind}${leafClass}`);
}

function careMarkup() {
  const selected = plant();
  const currentId = toolId();
  const current = tool();
  if (!selected || !current) return selectMarkup();
  const count = state.progress[currentId];
  const visualState = currentVisualState();
  const targetLabel = currentId === 'water' ? 'the soil' : 'the leaves';
  const targetAttrs = currentId === 'prune' ? '' : `data-slot="plant-care-target" data-target="${currentId}-target" aria-label="Bring ${current.short.toLowerCase()} tool to ${targetLabel}"`;
  const contactClass = state.contact ? `is-contacting is-contact-${state.contact.kind}` : '';
  return `<section class="plant-screen care-screen care-${currentId} ${state.inputLocked ? 'is-completing' : ''} ${contactClass}" aria-label="${current.title}">
    ${liveMarkup()}
    ${backgroundMarkup()}
    <div class="care-heading">
      ${image(config.assets.instructionPlaque, 'instruction-plaque-art')}
      <div><strong>${current.title}</strong><span>${current.instruction}</span></div>
    </div>
    ${progressMarkup(currentId, count)}
    ${currentId === 'water' ? gaugeMarkup(count) : ''}
    <div class="plant-zone state-${visualState} ${state.inputLocked ? 'is-rewarding' : ''}">
      <div class="plant-target" ${targetAttrs}>
        ${image(selected.states[visualState], 'care-plant', `${selected.title} the ${selected.kind}`)}
      </div>
      ${currentId === 'prune' ? pruneLeavesMarkup() : ''}
      ${contactMarkup()}
      ${state.fallingLeaf ? image(config.assets.dryLeaf, `falling-leaf leaf-${state.fallingLeaf.leaf}`, 'Falling dry leaf') : ''}
      ${feedbackMarkup()}
    </div>
    <button class="care-tool tool-${currentId}" type="button" data-action="tool" data-piece="${currentId}" data-target="tool-${currentId}" aria-label="${current.short}: tap, or drag to ${targetLabel}">
      ${image(config.assets[current.asset])}
      <span>${current.short}</span>
    </button>
    <p class="tap-hint">Tap or drag</p>
    ${backMarkup()}
    ${soundMarkup()}
  </section>`;
}

function thrivingGlints() {
  return Array.from({ length: 7 }, (_, index) => image(config.assets.glint, `thriving-glint glint-${index}`)).join('');
}

function thrivingMarkup() {
  const selected = plant();
  if (!selected) return selectMarkup();
  return `<section class="plant-screen thriving-screen" aria-label="${selected.title} is thriving">
    ${liveMarkup()}
    ${backgroundMarkup(true)}
    <div class="sun-rays" aria-hidden="true"></div>
    <div class="thriving-plant-stage">
      ${image(selected.states.bloom, 'thriving-plant', `${selected.title} is blooming`)}
      ${thrivingGlints()}
    </div>
    <div class="thriving-message">
      ${image(config.assets.introCloud, 'thriving-cloud-art')}
      <div><strong>${selected.title} is thriving!</strong><span>Watered, misted, and gently pruned.</span></div>
    </div>
    ${image(config.assets.rosette, 'thriving-rosette', 'Plant Care Captain rosette')}
    <button class="clay-action next-plant-action" type="button" data-action="next" data-target="next-plant">
      ${image(config.assets.actionButton, 'action-button-art')}
      <span>Another plant</span>
    </button>
    ${backMarkup()}
    ${soundMarkup()}
  </section>`;
}

function render() {
  dragController?.detach();
  dragController = null;
  if (state.screen === 'select') mount.innerHTML = selectMarkup();
  if (state.screen === 'intro') mount.innerHTML = introMarkup();
  if (state.screen === 'care') mount.innerHTML = careMarkup();
  if (state.screen === 'thriving') mount.innerHTML = thrivingMarkup();
  if (state.screen === 'care') {
    bindCareDrag();
    nudger.arm();
  } else {
    nudger.stop();
  }
}

function setScreen(next) {
  state.flowToken += 1;
  timers.clearAll();
  nudger.stop();
  dragController?.detach();
  dragController = null;
  state.screen = next;
  state.feedbackKind = null;
  state.contact = null;
  state.fallingLeaf = null;
  state.actionBusy = false;
  state.completionQueued = null;
  render();
  return state.flowToken;
}

function resetPlantRun(id) {
  state.plantId = id;
  state.toolIndex = 0;
  state.progress = { water: 0, mist: 0, prune: 0 };
  state.completedTools = [];
  state.cutLeaves = [];
  state.feedbackKind = null;
  state.inputLocked = false;
  state.contact = null;
  state.fallingLeaf = null;
  state.actionBusy = false;
  state.completionQueued = null;
}

function selectPlant(id) {
  if (!plants.has(id)) return false;
  resetPlantRun(id);
  const token = setScreen('intro');
  void (async () => {
    await say('chosen');
    if (token === state.flowToken && state.screen === 'intro') await say(tool().voice);
  })();
  return true;
}

function startTool() {
  if (state.screen !== 'intro' || !tool()) return false;
  setScreen('care');
  say(tool().voice);
  return true;
}

function addFeedback(kind) {
  state.feedbackKind = kind;
  state.feedbackTick += 1;
  if (kind === 'water') play('pop');
  if (kind === 'mist') play('sparkle');
  if (kind === 'prune') play('snip');
}

function firstAvailableLeaf() {
  return [0, 1, 2].find((index) => !state.cutLeaves.includes(index));
}

function careAction(kind, requestedLeaf) {
  const currentId = toolId();
  const current = tool();
  if (state.screen !== 'care' || state.inputLocked || state.actionBusy || !current || kind !== currentId) return false;
  if (state.progress[currentId] >= current.threshold) {
    say('enough');
    return false;
  }

  if (currentId === 'prune') {
    const leaf = Number.isInteger(requestedLeaf) ? requestedLeaf : firstAvailableLeaf();
    if (!Number.isInteger(leaf) || state.cutLeaves.includes(leaf)) return false;
    state.contact = { kind, tick: state.feedbackTick + 1, leaf };
  } else {
    state.contact = { kind, tick: state.feedbackTick + 1 };
  }

  state.progress[currentId] += 1;
  state.actionBusy = true;
  if (state.progress[currentId] >= current.threshold) {
    state.inputLocked = true;
    state.completionQueued = currentId;
  }
  addFeedback(currentId);
  render();
  const token = state.flowToken;
  const tick = state.contact.tick;
  timers.after(680, () => {
    if (token !== state.flowToken || state.screen !== 'care' || state.contact?.tick !== tick) return;
    const contact = state.contact;
    if (currentId === 'prune' && contact?.leaf != null) {
      if (!state.cutLeaves.includes(contact.leaf)) state.cutLeaves.push(contact.leaf);
      state.fallingLeaf = { leaf: contact.leaf, tick: contact.tick };
      timers.after(520, () => {
        if (token === state.flowToken && state.fallingLeaf?.tick === tick) {
          state.fallingLeaf = null;
          render();
        }
      });
    }
    state.feedbackKind = null;
    state.contact = null;
    state.actionBusy = false;
    render();
    if (state.completionQueued === currentId) void finishTool(currentId);
  });
  return true;
}

async function finishTool(completedId) {
  if (completedId !== toolId() || state.completionQueued !== completedId) return false;
  state.inputLocked = true;
  state.completionQueued = null;
  if (!state.completedTools.includes(completedId)) state.completedTools.push(completedId);
  const token = state.flowToken;
  render();
  play(completedId === 'prune' ? 'tada' : 'whoosh');
  await say(config.tools[completedId].done);
  if (token !== state.flowToken || state.screen !== 'care') return false;

  if (state.toolIndex < config.toolOrder.length - 1) {
    state.toolIndex += 1;
    state.inputLocked = false;
    setScreen('intro');
    say(tool().voice);
  } else {
    showThriving();
  }
  return true;
}

function showThriving() {
  if (!state.plantId) return false;
  if (!state.completedPlants.includes(state.plantId)) state.completedPlants.push(state.plantId);
  state.inputLocked = false;
  setScreen('thriving');
  play('tada');
  say('thriving');
  return true;
}

function backToSelect() {
  setScreen('select');
  state.plantId = null;
  currentVoiceKey = 'welcome';
}

function nextPlant() {
  backToSelect();
  say('replay');
}

function bindCareDrag() {
  dragController = createDragToSlotDom({
    root: mount,
    slotPad: 54,
    hoverClass: 'is-drag-over',
    ghostClass: 'qk-drag-ghost care-tool-ghost',
    canStart: () => state.screen === 'care' && !state.inputLocked && !state.actionBusy,
    getPiece(id) {
      const el = mount.querySelector(`[data-piece="${String(id).replace(/"/g, '')}"]`);
      return el ? { id, el } : null;
    },
    makeGhost(piece) {
      const ghost = document.createElement('div');
      ghost.className = `care-tool-ghost-inner tool-${piece.id}`;
      const source = piece.el.querySelector('img');
      if (source) ghost.append(source.cloneNode(true));
      return ghost;
    },
    onLift(piece) { piece.el.classList.add('is-lifted'); },
    onDrop(piece, drag) {
      state.lastDragAt = performance.now();
      try {
        if (!drag.slot) { play('unpop'); return; }
        if (piece.id === 'prune') {
          const leaf = Number(drag.slot.dataset.leaf);
          careAction('prune', Number.isInteger(leaf) ? leaf : undefined);
        } else {
          careAction(piece.id);
        }
      } finally {
        piece.el.classList.remove('is-lifted');
      }
    },
    onCancel(piece) { piece.el?.classList.remove('is-lifted'); },
  });
}

const nudger = createNudger({
  first: 10500,
  repeat: 14500,
  onNudge() {
    if (state.screen !== 'care' || state.inputLocked || !tool()) return;
    say(tool().nudge);
    mount.querySelector('.care-tool')?.classList.add('is-hinting');
    mount.querySelector('.plant-zone')?.classList.add('is-hinting');
    timers.after(1500, () => {
      mount.querySelector('.care-tool')?.classList.remove('is-hinting');
      mount.querySelector('.plant-zone')?.classList.remove('is-hinting');
    });
  },
});

mount.addEventListener('pointerdown', (event) => {
  const sound = event.target.closest('[data-action="sound"]');
  if (sound) {
    soundWasLongPress = false;
    soundHoldTimer = window.setTimeout(() => {
      soundHoldTimer = null;
      soundWasLongPress = true;
      toggleMute();
    }, 700);
    return;
  }
  const piece = event.target.closest('[data-piece]');
  if (piece && dragController) dragController.begin(event, piece.dataset.piece);
});

for (const eventName of ['pointerup', 'pointercancel']) {
  window.addEventListener(eventName, () => {
    if (soundHoldTimer) window.clearTimeout(soundHoldTimer);
    soundHoldTimer = null;
  });
}

mount.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const action = control.dataset.action;
  if (action === 'choose') selectPlant(control.dataset.mode);
  if (action === 'start-tool') startTool();
  // A browser may synthesize one click immediately after a completed drag.
  // The window stays deliberately tiny so a child's quick follow-up tap is
  // still accepted as the next care action.
  if (action === 'tool' && performance.now() - state.lastDragAt > 120) careAction(toolId());
  if (action === 'leaf') careAction('prune', Number(control.dataset.leaf));
  if (action === 'back') backToSelect();
  if (action === 'next') nextPlant();
  if (action === 'sound' && !soundWasLongPress) repeatSound();
});

function allImageAssets() {
  const urls = [];
  for (const value of Object.values(config.assets)) {
    if (Array.isArray(value)) urls.push(...value);
    else urls.push(value);
  }
  for (const item of plants.values()) urls.push(...Object.values(item.states));
  return urls;
}

function debugCompleteTool() {
  if (!state.plantId) selectPlant(config.modeOrder[0]);
  const id = toolId();
  const current = tool();
  state.progress[id] = current.threshold;
  if (!state.completedTools.includes(id)) state.completedTools.push(id);
  if (id === 'prune') state.cutLeaves = [0, 1, 2];
  if (state.toolIndex < config.toolOrder.length - 1) {
    state.toolIndex += 1;
    state.inputLocked = false;
    setScreen('intro');
  } else {
    showThriving();
  }
  return getState();
}

function debugWin() {
  if (!state.plantId) resetPlantRun(config.modeOrder[0]);
  state.progress = { water: 3, mist: 3, prune: 3 };
  state.completedTools = [...config.toolOrder];
  state.cutLeaves = [0, 1, 2];
  showThriving();
  return getState();
}

function getState() {
  return {
    ready: state.ready,
    screen: state.screen,
    plantId: state.plantId,
    plantState: currentVisualState(),
    tool: toolId(),
    toolIndex: state.toolIndex,
    progress: { ...state.progress },
    completedTools: [...state.completedTools],
    cutLeaves: [...state.cutLeaves],
    completedPlants: [...state.completedPlants],
    inputLocked: state.inputLocked,
    actionBusy: state.actionBusy,
    contact: state.contact ? { ...state.contact } : null,
    fallingLeaf: state.fallingLeaf ? { ...state.fallingLeaf } : null,
    muted: state.muted,
    reducedMotion,
    seed: state.seed,
  };
}

installUnlockOnGesture({
  target: window,
  onFirst(event) {
    if (state.screen === 'select' && !event.target?.closest?.('[data-action="choose"]')) say('welcome');
  },
});
installKioskGuards();

render();
preloadImages(allImageAssets(), { idle: true });

let startupTimer = null;
const audioReady = voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
const audioDeadline = new Promise((resolve) => { startupTimer = window.setTimeout(resolve, 2500); });
const ready = Promise.race([audioReady, audioDeadline]).finally(() => {
  if (startupTimer) window.clearTimeout(startupTimer);
}).then(() => { state.ready = true; });

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  root: mount,
  timers,
  voice: voiceClips,
  sfx,
  listModes: () => config.modeOrder.map((id) => ({ id, title: plants.get(id).title })),
  startMode: async (id) => selectPlant(id),
  getState,
  tap: async (id) => {
    const safe = String(id).replace(/"/g, '');
    const target = mount.querySelector(`[data-target="${safe}"]`);
    target?.click();
    return Boolean(target);
  },
  winRound: async () => debugCompleteTool(),
  selectPlant,
  startTool,
  addWater: () => careAction('water'),
  mist: () => careAction('mist'),
  snipLeaf: (index) => careAction('prune', Number(index)),
  completeTool: debugCompleteTool,
  win: debugWin,
  getAudioLog: () => voiceClips.getAudioLog(),
  getLayout: () => ({
    width: window.innerWidth,
    height: window.innerHeight,
    orientation: window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait',
    reducedMotion,
  }),
  mute: (on = true) => {
    state.muted = Boolean(on);
    voiceClips.setMuted(state.muted);
    sfx.setMuted?.(state.muted);
    return state.muted;
  },
  onSeed: (nextRng, seed) => { rng = nextRng; state.seed = seed; return rng(); },
  home: () => { window.location.href = '../../'; },
});
