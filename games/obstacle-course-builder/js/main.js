import config from '../config.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { soundDebounce } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { tada } from '../../../shared/js/celebrate.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { onTap } from '../../../shared/js/tap.js';
import * as sfx from '../../../shared/js/sfx.js';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'qlo.be/obstacle-course-builder/v1';
const STORAGE_VERSION = 1;
const MAX_NODES = 5;
const MIN_NODES = 3;
const COLORS = ['sunny', 'berry', 'ocean'];
const COLOR_HEX = { sunny: '#ffd353', berry: '#df668e', ocean: '#47b8cf' };
const ACTION_PROMPT = {
  crawl: 'crawl-prompt',
  climb: 'climb-prompt',
  hop: 'hop-prompt',
  carry: 'carry-prompt',
  slide: 'slide-prompt',
};
const PICK_PROMPT = {
  tunnel: 'tunnel-picked',
  wall: 'climb-picked',
  hop: 'hop-picked',
  carry: 'carry-picked',
  slide: 'slide-picked',
};
const ACTION_POSE = {
  crawl: 'crawl',
  climb: 'climb',
  hop: 'hop',
  carry: 'carry',
  slide: 'slide',
};

const worldById = new Map(config.worlds.map((world) => [world.id, world]));

const els = {
  game: $('game'),
  worldPicker: $('world-picker'),
  splashPlay: $('splash-play'),
  splashSound: $('splash-sound'),
  builder: $('builder'),
  builderBack: $('builder-back'),
  builderSound: $('builder-sound'),
  builderGuide: $('builder-guide'),
  buildMeter: $('build-meter'),
  workspace: document.querySelector('.builder-workspace'),
  moduleTray: $('module-tray'),
  courseWrap: $('course-wrap'),
  courseGrid: $('course-grid'),
  routeLayer: $('route-layer'),
  paletteButton: $('palette-button'),
  swatchPopover: $('swatch-popover'),
  undoButton: $('undo-button'),
  scrapButton: $('scrap-button'),
  playCourse: $('play-course'),
  play: $('play'),
  playBack: $('play-back'),
  playSound: $('play-sound'),
  playProgress: $('play-progress'),
  stationCard: $('station-card'),
  stationNumber: $('station-number'),
  stationObstacle: $('station-obstacle'),
  stationGuide: $('station-guide'),
  actionStage: $('action-stage'),
  paperPrompt: $('paper-prompt'),
  end: $('end'),
  endBack: $('end-back'),
  endSound: $('end-sound'),
  finishGuide: $('finish-guide'),
  finishCourse: $('finish-course'),
  replayCourse: $('replay-course'),
  buildAnother: $('build-another'),
};

function blankCourses() {
  return Object.fromEntries(config.worlds.map((world) => [world.id, []]));
}

function validateCourses(value) {
  const output = blankCourses();
  if (!value || typeof value !== 'object') return output;
  for (const world of config.worlds) {
    const source = Array.isArray(value[world.id]) ? value[world.id] : [];
    const seenCells = new Set();
    const seenIds = new Set();
    let repairedSerial = 0;
    for (const raw of source) {
      if (output[world.id].length >= MAX_NODES) break;
      const module = world.modules.find((item) => item.kind === raw?.kind);
      if (!module || !config.grid.cells.includes(raw?.cell) || seenCells.has(raw.cell)) continue;
      seenCells.add(raw.cell);
      let id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
      while (!id || seenIds.has(id)) {
        repairedSerial += 1;
        id = `${world.id}-saved-${repairedSerial}`;
      }
      seenIds.add(id);
      output[world.id].push({
        id,
        kind: module.kind,
        cell: raw.cell,
        color: COLORS.includes(raw.color) ? raw.color : 'sunny',
      });
    }
  }
  return output;
}

function validateSavedState(value) {
  const wrapped = value && typeof value === 'object' && value.courses && typeof value.courses === 'object';
  const selectedWorld = wrapped && worldById.has(value.selectedWorld) ? value.selectedWorld : null;
  return {
    version: STORAGE_VERSION,
    selectedWorld,
    courses: validateCourses(wrapped ? value.courses : value),
  };
}

function loadPersistedState() {
  try {
    return validateSavedState(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
  } catch {
    return validateSavedState(null);
  }
}

const persisted = loadPersistedState();

const state = {
  screen: 'splash',
  worldId: persisted.selectedWorld,
  courses: persisted.courses,
  history: [],
  selectedTrayKind: null,
  selectedNodeId: null,
  paletteOpen: false,
  traversal: [],
  stationIndex: 0,
  actionStep: 0,
  actionProgress: 0,
  carrySelected: false,
  carryPlaced: false,
  busy: false,
  seed: 70326,
};

let random = mulberry32(state.seed);
let nodeSerial = 0;
let actionCleanup = [];
let routeFrame = 0;
let celebrationCleanup = null;
let finishNarrationToken = 0;
let needsResumePrompt = false;
let wasBackgrounded = false;
let scrapHoldTimer = 0;
let scrapHoldPointer = null;
let scrapHoldTriggered = false;
let builderDrag = null;

function clearBuilderDragFeedback() {
  els.workspace.querySelectorAll('.module-card.is-pressed, .course-node.is-pressed')
    .forEach((element) => element.classList.remove('is-pressed'));
  els.scrapButton.classList.remove('is-drop-ready');
}

function cancelBuilderDrag() {
  clearBuilderDragFeedback();
  return builderDrag?.cancel();
}

function currentWorld() {
  return worldById.get(state.worldId) || null;
}

function currentCourse() {
  return state.worldId ? state.courses[state.worldId] : [];
}

function moduleFor(nodeOrKind) {
  const kind = typeof nodeOrKind === 'string' ? nodeOrKind : nodeOrKind?.kind;
  return currentWorld()?.modules.find((module) => module.kind === kind) || null;
}

function guideAsset(pose = 'idle') {
  const guide = currentWorld()?.guide;
  const poses = config.guides[guide] || {};
  return poses[pose] || poses.idle || '';
}

function pieceFilter(color = 'sunny') {
  return config.colors[color]?.[state.worldId] || 'none';
}

function moduleTrim() { return ''; }

function propTrim() { return ''; }

function applyTrim(image, trim) {
  if (trim) image.dataset.trim = trim;
  else delete image.dataset.trim;
  return image;
}

function applyGuideTrim(image, pose) {
  delete image.dataset.trim;
  return image;
}

function setWorldBackdrop(screen) {
  const world = currentWorld();
  if (world && screen) {
    screen.dataset.world = world.id;
    screen.style.setProperty('--world-image', `url("${world.plate}")`);
  }
}

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: STORAGE_VERSION,
      selectedWorld: state.worldId,
      courses: state.courses,
    }));
  } catch {
    // Persistence is a convenience; private browsing must not strand play.
  }
}

function cloneCourse() {
  return currentCourse().map((node) => ({ ...node }));
}

function remember() {
  state.history.push(cloneCourse());
  if (state.history.length > 30) state.history.shift();
}

function commitCourse(next) {
  state.courses[state.worldId] = next;
  saveState();
  renderBuilder();
}

function makeNodeId() {
  nodeSerial += 1;
  return `${state.worldId}-${Date.now().toString(36)}-${nodeSerial}`;
}

function speak(key) {
  return narrator.say(key, config.voice[key]);
}

function speakSequence(keys) {
  return narrator.saySequence(keys.map((key) => ({ key, text: config.voice[key] })));
}

function announceStatus(text) {
  if (narrator.announcer && text) narrator.announcer.textContent = text;
}

function cancelScrapHold({ preserveTriggered = false } = {}) {
  if (scrapHoldTimer) window.clearTimeout(scrapHoldTimer);
  scrapHoldTimer = 0;
  scrapHoldPointer = null;
  els.scrapButton.classList.remove('is-hold-armed');
  if (!preserveTriggered) scrapHoldTriggered = false;
}

const audioReady = voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
const narrator = createNarrator();
const timers = createTimers();

const imageUrls = [
  './assets/ui/title.webp', './assets/ui/course-board.webp', './assets/ui/cell-pad.webp',
  './assets/ui/route-ribbon.webp', './assets/ui/number-tab.webp', './assets/ui/selection-ring.webp',
  './assets/ui/start-flag.webp', './assets/ui/finish-flag.webp', './assets/ui/check.webp',
  './assets/ui/star.webp', './assets/ui/undo.webp', './assets/ui/scrap-basket.webp',
  './assets/ui/swatches.webp', './assets/ui/slide-arrows.webp', './assets/ui/snowflake-gate.webp',
  './assets/ui/landing-badge.webp', './assets/ui/course-complete.webp',
  ...config.worlds.flatMap((world) => [world.plate, ...world.modules.flatMap((module) => [module.asset, module.item, module.goal])]),
  ...Object.values(config.guides).flatMap((poses) => Object.values(poses)),
].filter(Boolean);
const ready = Promise.all([audioReady, preloadImages(imageUrls)]).then(() => true);

function tactileFeedback(event) {
  event?.preventDefault?.();
  unlockAll();
  if (needsResumePrompt && document.visibilityState !== 'hidden') {
    needsResumePrompt = false;
    replayPrompt();
  }
  try { sfx.tick(); } catch { /* audio never controls the game */ }
}

function wireTap(element, action, { feedback = tactileFeedback } = {}) {
  return onTap(element, action, { feedback });
}

function cleanupAction() {
  for (const dispose of actionCleanup) {
    try { dispose(); } catch { /* teardown continues */ }
  }
  actionCleanup = [];
  carryDrag.cancel();
}

function modelCurrentAction() {
  const group = state.traversal[state.stationIndex];
  if (!group) return;
  let target = null;
  if (group.action === 'crawl') target = els.actionStage.querySelector(state.actionStep ? '[data-target="crawl-exit"]' : '[data-target="crawl-entrance"]');
  else if (group.action === 'climb' || group.action === 'hop') target = els.actionStage.querySelector('.action-target.is-active');
  else if (group.action === 'carry') target = els.actionStage.querySelector(state.carrySelected ? '.carry-goal' : '.carry-item');
  else if (group.action === 'slide') target = els.actionStage.querySelector('.slide-arrow.is-active, .slide-landing.is-active');
  target?.classList.add('is-modeling');
  els.actionStage.classList.add('is-hinting');
  timers.after(1300, () => {
    target?.classList.remove('is-modeling');
    els.actionStage.classList.remove('is-hinting');
  });
}

function createCourseNudger() {
  let timer = 0;
  let armed = false;
  let phase = 0;

  const clear = () => {
    if (timer) timers.clear(timer);
    timer = 0;
  };
  const firstDelay = () => state.screen === 'play' ? 10000 : 12000;
  const nextDelay = () => {
    if (state.screen === 'builder') return phase < 2 ? 12000 : 18000;
    if (state.screen === 'play') return phase < 2 ? 10000 : 20000;
    return phase < 2 ? 8000 : 16000;
  };
  const schedule = (delay) => {
    clear();
    if (!armed) return;
    timer = timers.after(delay, fire);
  };
  const fire = () => {
    timer = 0;
    if (!armed || document.hidden || state.busy) {
      schedule(nextDelay());
      return;
    }
    if (state.screen === 'splash') {
      if (phase === 0) speak('choose-world');
      else {
        els.worldPicker.classList.add('is-idle-bob');
        timers.after(1300, () => els.worldPicker.classList.remove('is-idle-bob'));
      }
    } else if (state.screen === 'builder') {
      if (phase === 0) speak(currentCourse().length < MIN_NODES ? 'need-three' : 'builder-ready');
      else {
        flashBuilderTargets();
        speak('gentle-hint');
      }
    } else if (state.screen === 'play') {
      if (phase === 0) speak(promptKeyFor(state.traversal[state.stationIndex]));
      else {
        modelCurrentAction();
        speak('gentle-hint');
      }
    }
    phase += 1;
    schedule(nextDelay());
  };
  const onPointerDown = () => poke();
  const arm = () => {
    if (!armed) {
      armed = true;
      window.addEventListener('pointerdown', onPointerDown, { passive: true });
    }
    phase = 0;
    schedule(firstDelay());
  };
  const poke = () => {
    if (!armed) return;
    phase = 0;
    schedule(firstDelay());
  };
  const stop = () => {
    clear();
    if (!armed) return;
    armed = false;
    phase = 0;
    window.removeEventListener('pointerdown', onPointerDown);
  };
  return { arm, poke, stop };
}

const nudger = createCourseNudger();

const screens = createScreens({
  root: els.game,
  initial: 'splash',
  voice: narrator,
  onExit(name) {
    if (name === 'play') cleanupAction();
    if (name === 'end' && celebrationCleanup) {
      celebrationCleanup();
      celebrationCleanup = null;
    }
    timers.clearAll();
    nudger.stop();
    cancelBuilderDrag();
    cancelScrapHold();
    els.builder.classList.remove('is-clearing');
    els.courseWrap.classList.remove('is-peeling');
  },
  onEnter(name) {
    state.screen = name;
    if (name === 'splash' || name === 'builder' || name === 'play') nudger.arm();
  },
});

function renderWorldPicker() {
  els.worldPicker.replaceChildren();
  for (const world of config.worlds) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `world-card${state.worldId === world.id ? ' is-selected' : ''}`;
    button.dataset.target = `world-${world.id}`;
    button.setAttribute('aria-label', `${world.title} with ${world.guide}`);
    button.setAttribute('aria-pressed', String(state.worldId === world.id));

    const background = document.createElement('img');
    background.className = 'world-card-bg';
    background.src = world.plate;
    background.alt = '';
    background.draggable = false;

    const guide = document.createElement('img');
    guide.className = 'world-card-guide';
    guide.src = config.guides[world.guide].idle;
    guide.alt = '';
    guide.draggable = false;

    const label = document.createElement('span');
    label.className = 'world-card-label';
    label.textContent = world.title;
    label.setAttribute('aria-hidden', 'true');

    button.append(background, guide, label);
    wireTap(button, () => chooseWorld(world.id), {
      feedback: (event) => {
        tactileFeedback(event);
        button.classList.add('is-pressed');
        timers.after(150, () => button.classList.remove('is-pressed'));
      },
    });
    els.worldPicker.append(button);
  }
}

function renderSplashPlay() {
  const world = currentWorld();
  els.splashPlay.hidden = !world;
  els.splashPlay.classList.toggle('is-ready', Boolean(world));
  els.splashPlay.setAttribute('aria-label', world ? `Play in ${world.title}` : 'Choose a world to play');
}

async function chooseWorld(worldId) {
  const world = worldById.get(worldId);
  if (!world) return false;
  if (state.worldId === worldId) return selectWorld(worldId, { speakWorld: false });

  state.worldId = worldId;
  state.history = [];
  state.selectedTrayKind = null;
  state.selectedNodeId = null;
  state.paletteOpen = false;
  state.busy = false;
  saveState();
  renderWorldPicker();
  renderSplashPlay();
  await ready;
  await speak(`world-${worldId}`);
  return true;
}

async function selectWorld(worldId, { speakIntro = true, speakWorld = true } = {}) {
  const world = worldById.get(worldId);
  if (!world) return false;
  return screens.start(async () => {
    await ready;
    state.worldId = worldId;
    state.history = [];
    state.selectedTrayKind = null;
    state.selectedNodeId = null;
    state.paletteOpen = false;
    state.busy = false;
    saveState();
    setWorldBackdrop(els.builder);
    setWorldBackdrop(els.play);
    setWorldBackdrop(els.end);
    renderBuilder();
    screens.show('builder');
    if (speakIntro) {
      await speakSequence([...(speakWorld ? [`world-${worldId}`] : []), 'builder-intro']);
    }
    return true;
  }, { busy: false });
}

function goSplash({ announce = true } = {}) {
  state.selectedTrayKind = null;
  state.selectedNodeId = null;
  state.paletteOpen = false;
  state.busy = false;
  renderWorldPicker();
  renderSplashPlay();
  screens.show('splash');
  if (announce) speak('choose-world');
}

function goBuilder({ announce = false } = {}) {
  if (!currentWorld()) return goSplash({ announce });
  state.busy = false;
  state.selectedTrayKind = null;
  state.selectedNodeId = null;
  state.paletteOpen = false;
  renderBuilder();
  screens.show('builder');
  if (announce) speak('builder-intro');
  return true;
}

function makeImage(src, className = '', alt = '') {
  const image = document.createElement('img');
  image.src = src;
  image.className = className;
  image.alt = alt;
  image.draggable = false;
  return image;
}

function buildMeter() {
  els.buildMeter.replaceChildren();
  const count = currentCourse().length;
  for (let index = 0; index < MAX_NODES; index += 1) {
    const image = makeImage('./assets/ui/check.webp', `meter-step${index < count ? ' is-filled' : ''}`);
    els.buildMeter.append(image);
  }
  els.buildMeter.setAttribute('aria-label', `${count} of ${MAX_NODES} obstacles`);
}

function renderTray() {
  const world = currentWorld();
  els.moduleTray.replaceChildren();
  els.moduleTray.style.setProperty('--tray-count', world.modules.length);
  for (const module of world.modules) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `module-card${state.selectedTrayKind === module.kind ? ' is-selected' : ''}`;
    button.dataset.target = `tray-${module.kind}`;
    button.dataset.kind = module.kind;
    button.setAttribute('aria-label', module.title);
    button.setAttribute('aria-pressed', String(state.selectedTrayKind === module.kind));
    button.style.setProperty('--piece-filter', pieceFilter('sunny'));
    button.append(applyTrim(makeImage(module.asset, '', ''), moduleTrim(module.kind)));
    const piece = { el: button, source: 'tray', kind: module.kind };
    button.addEventListener('pointerdown', (event) => builderDrag.begin(event, piece));
    button.addEventListener('click', (event) => {
      if (event.detail === 0) selectPiece(piece);
    });
    els.moduleTray.append(button);
  }
}

function renderGrid() {
  const course = currentCourse();
  els.courseGrid.replaceChildren();
  for (const cellId of config.grid.cells) {
    const cell = document.createElement('div');
    cell.className = 'course-cell';
    cell.tabIndex = 0;
    cell.setAttribute('role', 'button');
    cell.dataset.cell = cellId;
    cell.dataset.slot = cellId;
    cell.dataset.target = `cell-${cellId}`;
    const node = course.find((item) => item.cell === cellId);
    cell.setAttribute('aria-label', node ? `${moduleFor(node).title}, position ${course.indexOf(node) + 1}` : 'Empty course spot');
    if (!node && (state.selectedTrayKind || state.selectedNodeId)) cell.classList.add('is-empty-glow');

    if (node) {
      const module = moduleFor(node);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `course-node${state.selectedNodeId === node.id ? ' is-selected' : ''}`;
      button.dataset.target = `node-${node.id}`;
      button.dataset.nodeId = node.id;
      button.setAttribute('aria-label', `${course.indexOf(node) + 1}. ${module.title}`);
      button.setAttribute('aria-pressed', String(state.selectedNodeId === node.id));
      button.style.setProperty('--piece-filter', pieceFilter(node.color));
      const nodeArt = applyTrim(makeImage(module.asset, 'node-art'), moduleTrim(node.kind));
      button.append(makeImage('./assets/ui/selection-ring.webp', 'selection-art'), nodeArt);
      const number = document.createElement('span');
      number.className = 'number-tab';
      number.textContent = String(course.indexOf(node) + 1);
      number.setAttribute('aria-hidden', 'true');
      button.append(number);
      const piece = { el: button, source: 'node', nodeId: node.id, kind: node.kind };
      button.addEventListener('pointerdown', (event) => builderDrag.begin(event, piece));
      button.addEventListener('click', (event) => {
        if (event.detail === 0) selectPiece(piece);
      });
      cell.append(button);
    }

    wireTap(cell, (event) => {
      if (event.target.closest('.course-node')) return;
      tapCell(cellId);
    });
    cell.addEventListener('keydown', (event) => {
      if ((event.key === 'Enter' || event.key === ' ') && !event.target.closest('.course-node')) {
        event.preventDefault();
        tapCell(cellId);
      }
    });
    els.courseGrid.append(cell);
  }
  scheduleRouteRender();
}

function renderTools() {
  const selected = currentCourse().find((node) => node.id === state.selectedNodeId);
  els.paletteButton.disabled = !selected;
  els.scrapButton.disabled = currentCourse().length === 0;
  els.scrapButton.setAttribute('aria-label', selected
    ? 'Remove selected obstacle. Hold to clear the whole course.'
    : 'Hold to clear the whole course.');
  els.undoButton.disabled = state.history.length === 0;
  els.swatchPopover.hidden = !selected || !state.paletteOpen;
  els.swatchPopover.replaceChildren();
  if (!selected) return;
  for (const color of COLORS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `color-swatch${selected.color === color ? ' is-current' : ''}`;
    button.style.setProperty('--swatch', COLOR_HEX[color]);
    button.dataset.target = `color-${color}`;
    button.setAttribute('aria-label', `${color} color`);
    wireTap(button, () => recolorSelected(color));
    els.swatchPopover.append(button);
  }
}

function renderBuilder() {
  if (!currentWorld()) return;
  cancelBuilderDrag();
  setWorldBackdrop(els.builder);
  els.builderGuide.src = guideAsset('idle');
  els.builderGuide.alt = `${currentWorld().guide} helper`;
  renderTray();
  renderGrid();
  renderTools();
  buildMeter();
  const readyToPlay = currentCourse().length >= MIN_NODES;
  els.playCourse.classList.toggle('is-dormant', !readyToPlay);
  els.playCourse.setAttribute('aria-label', readyToPlay ? `Play the ${currentCourse().length}-obstacle course` : 'Add at least three obstacles to play');
}

function scheduleRouteRender() {
  cancelAnimationFrame(routeFrame);
  routeFrame = requestAnimationFrame(renderRoute);
}

function renderRoute() {
  els.routeLayer.replaceChildren();
  const gridRect = els.courseGrid.getBoundingClientRect();
  if (!gridRect.width || !gridRect.height) return;
  const nodes = currentCourse().map((node) => els.courseGrid.querySelector(`[data-node-id="${CSS.escape(node.id)}"]`)).filter(Boolean);
  const centers = nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { x: rect.left + rect.width / 2 - gridRect.left, y: rect.top + rect.height / 2 - gridRect.top };
  });
  if (centers.length) {
    for (const [position, selector] of [['unshift', '.board-start'], ['push', '.board-finish']]) {
      const rect = els.courseWrap.querySelector(selector)?.getBoundingClientRect();
      if (rect) centers[position]({ x: rect.left + rect.width / 2 - gridRect.left, y: rect.top + rect.height / 2 - gridRect.top });
    }
  }
  for (let index = 0; index < centers.length - 1; index += 1) {
    const from = centers[index];
    const to = centers[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const image = makeImage('./assets/ui/route-ribbon.webp', 'route-segment');
    image.style.setProperty('--route-length', `${length}px`);
    image.style.setProperty('--route-x', `${from.x}px`);
    image.style.setProperty('--route-y', `${from.y}px`);
    image.style.setProperty('--route-angle', `${Math.atan2(dy, dx)}rad`);
    els.routeLayer.append(image);
  }
}

function flashBuilderTargets() {
  const empty = new Map([...els.courseGrid.querySelectorAll('.course-cell:not(:has(.course-node))')]
    .map((cell) => [cell.dataset.cell, cell]));
  const preferred = config.suggestedRoutes.flatMap((route) => route.cells || []);
  const ordered = [...new Set([...preferred, ...config.grid.cells])];
  const targets = ordered.map((cell) => empty.get(cell)).filter(Boolean).slice(0, MIN_NODES);
  targets.forEach((cell) => cell.classList.add('is-empty-glow'));
  timers.after(1400, () => targets.forEach((cell) => cell.classList.remove('is-empty-glow')));
}

function selectPiece(piece) {
  if (state.screen !== 'builder' || state.busy) return false;
  nudger.poke();
  if (piece.source === 'tray') {
    state.selectedTrayKind = piece.kind;
    state.selectedNodeId = null;
    state.paletteOpen = false;
    renderBuilder();
    announceStatus(`${moduleFor(piece.kind)?.title || 'Obstacle'} selected. Choose a course spot.`);
    speak(PICK_PROMPT[piece.kind]);
    return true;
  }
  const node = currentCourse().find((item) => item.id === piece.nodeId);
  if (!node) return false;
  if (state.selectedTrayKind) return placeTrayAt(state.selectedTrayKind, node.cell);
  if (state.selectedNodeId === node.id) {
    state.selectedNodeId = null;
    state.paletteOpen = false;
    renderBuilder();
    announceStatus('Obstacle selection cleared.');
    return true;
  }
  if (state.selectedNodeId) return moveNodeTo(state.selectedNodeId, node.cell);
  state.selectedTrayKind = null;
  state.selectedNodeId = node.id;
  state.paletteOpen = false;
  renderBuilder();
  announceStatus(`${moduleFor(node)?.title || 'Obstacle'} selected. Choose a spot, color, or scrap basket.`);
  return true;
}

function tapCell(cellId) {
  if (state.screen !== 'builder' || state.busy) return false;
  nudger.poke();
  if (state.selectedTrayKind) return placeTrayAt(state.selectedTrayKind, cellId);
  if (state.selectedNodeId) return moveNodeTo(state.selectedNodeId, cellId);
  return false;
}

function placeTrayAt(kind, cellId) {
  const course = cloneCourse();
  const occupied = course.find((node) => node.cell === cellId);
  const previousLength = course.length;
  if (!occupied && course.length >= MAX_NODES) {
    sfx.unpop();
    return false;
  }
  remember();
  if (occupied) {
    occupied.kind = kind;
    occupied.color = 'sunny';
    state.selectedNodeId = occupied.id;
  } else {
    const node = { id: makeNodeId(), kind, cell: cellId, color: 'sunny' };
    course.push(node);
    state.selectedNodeId = node.id;
  }
  state.selectedTrayKind = null;
  state.paletteOpen = false;
  commitCourse(course);
  sfx.pop();
  const title = moduleFor(kind)?.title || 'Obstacle';
  announceStatus(occupied
    ? `${title} replaced this challenge. ${course.length} obstacles in the course.`
    : `${title} placed. ${course.length} obstacles in the course.`);
  if (previousLength < MIN_NODES && course.length >= MIN_NODES) speak('builder-ready');
  return true;
}

function moveNodeTo(nodeId, cellId) {
  const course = cloneCourse();
  const moving = course.find((node) => node.id === nodeId);
  if (!moving) return false;
  const occupied = course.find((node) => node.cell === cellId && node.id !== nodeId);
  const movingTitle = moduleFor(moving)?.title || 'Obstacle';
  const occupiedTitle = moduleFor(occupied)?.title || 'obstacle';
  if (moving.cell === cellId) return true;
  remember();
  if (occupied) {
    const movingKind = moving.kind;
    const movingColor = moving.color;
    moving.kind = occupied.kind;
    moving.color = occupied.color;
    occupied.kind = movingKind;
    occupied.color = movingColor;
  } else {
    moving.cell = cellId;
  }
  state.selectedNodeId = moving.id;
  state.selectedTrayKind = null;
  commitCourse(course);
  sfx.pop();
  announceStatus(occupied
    ? `${movingTitle} and ${occupiedTitle} swapped challenges.`
    : `${movingTitle} moved. The course route is updated.`);
  return true;
}

function recolorSelected(color) {
  const course = cloneCourse();
  const node = course.find((item) => item.id === state.selectedNodeId);
  if (!node || node.color === color) return false;
  remember();
  node.color = color;
  state.paletteOpen = false;
  commitCourse(course);
  sfx.sparkle();
  announceStatus(`${moduleFor(node)?.title || 'Obstacle'} stamped ${color}.`);
  return true;
}

function undo() {
  if (!state.history.length || !state.worldId) return false;
  state.courses[state.worldId] = state.history.pop();
  state.selectedTrayKind = null;
  state.selectedNodeId = null;
  state.paletteOpen = false;
  saveState();
  renderBuilder();
  sfx.unpop();
  announceStatus(`Last change undone. ${currentCourse().length} obstacles in the course.`);
  return true;
}

function scrapSelected() {
  const course = cloneCourse();
  const index = course.findIndex((node) => node.id === state.selectedNodeId);
  if (index < 0) return false;
  const title = moduleFor(course[index])?.title || 'Obstacle';
  remember();
  course.splice(index, 1);
  state.selectedNodeId = null;
  state.paletteOpen = false;
  commitCourse(course);
  sfx.unpop();
  announceStatus(`${title} removed. ${course.length} obstacles remain.`);
  return true;
}

function clearCourseWithPeel() {
  if (state.screen !== 'builder' || state.busy || currentCourse().length === 0) return false;
  state.busy = true;
  state.selectedTrayKind = null;
  state.selectedNodeId = null;
  state.paletteOpen = false;
  els.builder.classList.add('is-clearing');
  els.courseWrap.classList.add('is-peeling');
  announceStatus('Clearing the whole course.');
  sfx.unpop();
  timers.after(420, () => {
    if (state.screen !== 'builder') return;
    remember();
    state.courses[state.worldId] = [];
    state.busy = false;
    scrapHoldTriggered = false;
    els.builder.classList.remove('is-clearing');
    els.courseWrap.classList.remove('is-peeling');
    saveState();
    renderBuilder();
    announceStatus('Course cleared. 0 obstacles. Undo is available.');
  });
  return true;
}

builderDrag = createDragToSlotDom({
  getPiece: (piece) => piece,
  root: () => els.workspace,
  slotSelector: '[data-cell], [data-scrap-slot]',
  slotPad: 24,
  hoverClass: 'is-drop-hover',
  ghostClass: 'qk-drag-ghost piece-drag-ghost',
  preventDefaultOnPress: true,
  canStart: () => state.screen === 'builder' && !state.busy,
  makeGhost: (piece) => {
    const ghost = document.createElement('div');
    ghost.className = 'module-card';
    const module = moduleFor(piece.kind);
    ghost.append(applyTrim(makeImage(module.asset), moduleTrim(piece.kind)));
    return ghost;
  },
  onGrab: (piece) => {
    unlockAll();
    nudger.poke();
    piece.el.classList.add('is-pressed');
    const canScrap = piece.source === 'node';
    els.scrapButton.classList.toggle('is-drop-ready', canScrap);
    if (canScrap) els.scrapButton.disabled = false;
  },
  onDrop: (piece, record) => {
    clearBuilderDragFeedback();
    if (record.slot?.hasAttribute('data-scrap-slot')) {
      if (piece.source !== 'node') {
        renderTools();
        sfx.unpop();
        return false;
      }
      state.selectedNodeId = piece.nodeId;
      return scrapSelected();
    }
    const cellId = record.slot?.dataset.cell;
    if (!cellId) {
      renderTools();
      sfx.unpop();
      return false;
    }
    if (piece.source === 'tray') return placeTrayAt(piece.kind, cellId);
    return moveNodeTo(piece.nodeId, cellId);
  },
  onCancel: (piece) => {
    clearBuilderDragFeedback();
    renderTools();
  },
  onTap: (piece) => {
    clearBuilderDragFeedback();
    selectPiece(piece);
  },
});

function makeTraversal(course) {
  const groups = [];
  for (const node of course) {
    const module = moduleFor(node);
    if (module.action === 'slide' && groups.at(-1)?.action === 'slide') {
      groups.at(-1).nodes.push(node);
    } else {
      groups.push({ action: module.action, nodes: [node] });
    }
  }
  return groups;
}

function completedNodeCount() {
  return state.traversal.slice(0, state.stationIndex).reduce((sum, group) => sum + group.nodes.length, 0);
}

function renderPlayProgress() {
  els.playProgress.replaceChildren();
  const done = completedNodeCount();
  const currentSize = state.traversal[state.stationIndex]?.nodes.length || 0;
  currentCourse().forEach((node, index) => {
    const module = moduleFor(node);
    const image = makeImage(module.asset, 'progress-piece');
    image.style.setProperty('--piece-filter', pieceFilter(node.color));
    applyTrim(image, moduleTrim(node.kind));
    if (index < done) image.classList.add('is-done');
    else if (index < done + currentSize) image.classList.add('is-now');
    els.playProgress.append(image);
  });
  els.playProgress.setAttribute('aria-label', `${done} of ${currentCourse().length} obstacles complete`);
}

function promptKeyFor(group) {
  if (group.action === 'slide' && group.nodes.length > 1) return 'super-slide-prompt';
  return ACTION_PROMPT[group.action];
}

function renderPaperPrompt(group) {
  els.paperPrompt.replaceChildren();
  const pose = ACTION_POSE[group.action] || 'idle';
  els.paperPrompt.append(applyGuideTrim(makeImage(guideAsset(pose)), pose));
  const arrow = document.createElement('span');
  arrow.className = 'prompt-arrow';
  arrow.textContent = group.action === 'climb' ? '↑' : group.action === 'slide' ? '↔' : '→';
  els.paperPrompt.append(arrow);
  if (group.action === 'carry') {
    const module = moduleFor(group.nodes[0]);
    els.paperPrompt.append(makeImage(module.goal));
  } else if (group.action === 'slide') {
    els.paperPrompt.append(makeImage('./assets/ui/snowflake-gate.webp'));
  } else {
    els.paperPrompt.append(makeImage('./assets/ui/check.webp'));
  }
}

function addActionTap(button, action) {
  actionCleanup.push(wireTap(button, () => {
    nudger.poke();
    action();
  }));
}

function renderCrawlAction(group) {
  const module = moduleFor(group.nodes[0]);
  const track = document.createElement('div');
  track.className = 'action-track';
  const start = document.createElement('button');
  start.type = 'button';
  start.className = 'trail-start';
  start.dataset.target = 'crawl-entrance';
  start.setAttribute('aria-label', 'Start at the tunnel entrance');
  const goal = document.createElement('button');
  goal.type = 'button';
  goal.className = `trail-goal${state.actionStep > 0 ? ' is-active' : ''}`;
  goal.dataset.target = 'crawl-exit';
  goal.setAttribute('aria-label', 'Crawl out of the tunnel');
  goal.append(makeImage('./assets/ui/check.webp'));
  track.append(start, goal);
  els.actionStage.append(track);

  let pointerId = null;
  let originX = 0;
  let baseProgress = state.actionProgress;
  const moveGuide = () => {
    const width = els.stationCard.clientWidth * .53;
    els.stationGuide.style.setProperty('--guide-x', `${state.actionProgress * width}px`);
    els.stationGuide.style.setProperty('--guide-rotate', `${Math.sin(state.actionProgress * Math.PI * 2) * 3}deg`);
  };
  moveGuide();
  const down = (event) => {
    if (event.isPrimary === false || state.busy) return;
    pointerId = event.pointerId;
    originX = event.clientX;
    baseProgress = state.actionProgress;
    try { els.actionStage.setPointerCapture(pointerId); } catch { /* window listeners still cover it */ }
    tactileFeedback(event);
  };
  const move = (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    const width = Math.max(1, els.actionStage.clientWidth * .72);
    state.actionProgress = Math.max(0, Math.min(1, baseProgress + (event.clientX - originX) / width));
    moveGuide();
    nudger.poke();
  };
  const finish = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    if (state.actionProgress >= .88) completeStation();
  };
  const cancel = (event) => {
    if (event.pointerId === pointerId) pointerId = null;
  };
  els.actionStage.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', cancel);
  actionCleanup.push(() => {
    els.actionStage.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
  });
  addActionTap(start, () => {
    state.actionStep = 1;
    renderStationAction({ preserve: true });
  });
  addActionTap(goal, () => {
    if (state.actionStep < 1) {
      sfx.unpop();
      return;
    }
    state.actionProgress = 1;
    moveGuide();
    completeStation();
  });
  els.stationObstacle.alt = module.title;
}

function renderOrderedAction(action) {
  const total = action === 'climb' ? 4 : 3;
  const wrap = document.createElement('div');
  wrap.className = `ordered-targets is-${action}`;
  for (let index = 0; index < total; index += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `action-target${index < state.actionStep ? ' is-done' : ''}${index === state.actionStep ? ' is-active' : ''}`;
    button.dataset.target = `${action}-${index + 1}`;
    button.setAttribute('aria-label', `${action === 'climb' ? 'Handhold' : 'Stepping stone'} ${index + 1}`);
    addActionTap(button, () => orderedAttempt(action, index, total));
    wrap.append(button);
  }
  els.actionStage.append(wrap);
  positionOrderedGuide(action);
}

function positionOrderedGuide(action) {
  if (action === 'climb') {
    const height = Math.max(300, els.stationCard.clientHeight);
    els.stationGuide.style.setProperty('--guide-x', `${(state.actionStep % 2) * height * .035}px`);
    els.stationGuide.style.setProperty('--guide-y', `${-state.actionStep * height * .085}px`);
  } else {
    const width = Math.max(500, els.stationCard.clientWidth);
    els.stationGuide.style.setProperty('--guide-x', `${state.actionStep * width * .145}px`);
    els.stationGuide.style.setProperty('--guide-y', `${state.actionStep % 2 ? -width * .035 : 0}px`);
  }
}

function orderedAttempt(action, index, total) {
  if (state.busy) return false;
  if (index !== state.actionStep) {
    sfx.unpop();
    const active = els.actionStage.querySelector('.action-target.is-active');
    active?.classList.add('is-correcting');
    els.stationGuide.classList.add('is-gentle-wiggle');
    announceStatus(`Try the glowing ${action === 'climb' ? 'handhold' : 'stepping stone'} next.`);
    timers.after(650, () => {
      active?.classList.remove('is-correcting');
      els.stationGuide.classList.remove('is-gentle-wiggle');
    });
    return false;
  }
  els.stationGuide.classList.remove('is-gentle-wiggle');
  state.actionStep += 1;
  sfx.pop();
  if (state.actionStep >= total) {
    if (action === 'hop') {
      const heldStation = state.stationIndex;
      state.busy = true;
      els.stationCard.classList.add('is-balancing');
      announceStatus('Balanced on the final stepping stone.');
      timers.after(500, () => {
        const group = state.traversal[state.stationIndex];
        if (state.screen !== 'play' || state.stationIndex !== heldStation || group?.action !== 'hop') return;
        els.stationCard.classList.remove('is-balancing');
        state.busy = false;
        completeStation();
      });
    } else {
      completeStation();
    }
  } else {
    renderStationAction({ preserve: true });
  }
  return true;
}

function renderCarryAction(group) {
  const module = moduleFor(group.nodes[0]);
  const zone = document.createElement('div');
  zone.className = `carry-zone${state.carrySelected ? ' is-selected' : ''}`;
  zone.style.setProperty('--carry-goal-image', `url("${module.goal}")`);
  const item = document.createElement('button');
  item.type = 'button';
  item.className = `carry-item${state.carrySelected ? ' is-selected' : ''}`;
  item.dataset.target = 'carry-item';
  item.setAttribute('aria-label', 'Treasure to carry');
  item.append(applyTrim(makeImage(module.item), propTrim()));
  const goal = document.createElement('button');
  goal.type = 'button';
  goal.className = `carry-goal${state.carrySelected ? ' is-active' : ''}`;
  goal.dataset.target = 'carry-goal';
  goal.dataset.carryGoal = '';
  goal.dataset.slot = 'carry-goal';
  goal.setAttribute('aria-label', 'Treasure basket');
  goal.append(makeImage(module.goal));
  zone.append(item, goal);
  els.actionStage.append(zone);
  if (state.carryPlaced) placeCarryVisual(item, goal, zone);

  const piece = { el: item, source: 'carry', module };
  item.addEventListener('pointerdown', (event) => carryDrag.begin(event, piece));
  item.addEventListener('click', (event) => {
    if (event.detail === 0) selectCarryItem();
  });
  addActionTap(goal, () => {
    if (!state.carrySelected) {
      sfx.unpop();
      return;
    }
    completeCarry(item, goal, zone);
  });
}

function placeCarryVisual(item, goal, zone) {
  const itemRect = item.getBoundingClientRect();
  const goalRect = goal.getBoundingClientRect();
  item.style.setProperty('--carry-x', `${goalRect.left + goalRect.width / 2 - itemRect.left - itemRect.width / 2}px`);
  item.style.setProperty('--carry-y', `${goalRect.top + goalRect.height * .34 - itemRect.top - itemRect.height / 2}px`);
  item.classList.remove('is-dragging');
  item.classList.add('is-placed');
  zone.classList.add('is-placed');
}

async function completeCarry(item = els.actionStage.querySelector('.carry-item'), goal = els.actionStage.querySelector('.carry-goal'), zone = els.actionStage.querySelector('.carry-zone')) {
  if (state.busy || !item || !goal || !zone) return false;
  state.busy = true;
  nudger.stop();
  state.carryPlaced = true;
  placeCarryVisual(item, goal, zone);
  sfx.pop();
  await timers.wait(620);
  if (state.screen !== 'play') return false;
  state.busy = false;
  return completeStation();
}

function selectCarryItem() {
  if (state.busy) return false;
  state.carrySelected = true;
  sfx.pop();
  renderStationAction({ preserve: true });
  return true;
}

const carryDrag = createDragToSlotDom({
  getPiece: (piece) => piece,
  root: () => els.actionStage,
  slotSelector: '[data-carry-goal]',
  slotPad: 52,
  hoverClass: 'is-active',
  ghostClass: 'qk-drag-ghost carry-drag-ghost',
  preventDefaultOnPress: true,
  canStart: () => state.screen === 'play' && state.traversal[state.stationIndex]?.action === 'carry' && !state.busy,
  makeGhost: (piece) => {
    const ghost = document.createElement('div');
    ghost.append(applyTrim(makeImage(piece.module.item), propTrim()));
    return ghost;
  },
  onGrab: () => {
    unlockAll();
    nudger.poke();
  },
  onLift: (piece) => piece.el.classList.add('is-dragging'),
  onDrop: (_piece, record) => {
    if (record.slot) return completeCarry();
    _piece.el.classList.remove('is-dragging');
    sfx.unpop();
    return false;
  },
  onCancel: (piece) => piece.el?.classList.remove('is-dragging'),
  onTap: () => selectCarryItem(),
});

function slideSequence(group) {
  const count = Math.max(2, group.nodes.length + 1);
  return Array.from({ length: count }, (_, index) => index % 2 === 0 ? 'left' : 'right');
}

const SLIDE_ROUTE = [
  [.39, .45],
  [.58, .51],
  [.72, .61],
  [.87, .70],
];

function slideRoutePoints(width, height) {
  return SLIDE_ROUTE.map(([x, y]) => ({ x: x * width, y: y * height }));
}

function pointAlongRoute(points, progress) {
  const legs = points.slice(0, -1).map((point, index) => {
    const next = points[index + 1];
    return { from: point, to: next, length: Math.hypot(next.x - point.x, next.y - point.y) };
  });
  const total = legs.reduce((sum, leg) => sum + leg.length, 0);
  let remaining = Math.max(0, Math.min(1, progress)) * total;
  for (const leg of legs) {
    if (remaining <= leg.length) {
      const amount = leg.length ? remaining / leg.length : 0;
      return {
        x: leg.from.x + (leg.to.x - leg.from.x) * amount,
        y: leg.from.y + (leg.to.y - leg.from.y) * amount,
      };
    }
    remaining -= leg.length;
  }
  return { ...points.at(-1) };
}

function layoutSlideRoute(controls) {
  const width = controls.clientWidth || els.stationCard.clientWidth;
  const height = controls.clientHeight || els.stationCard.clientHeight;
  if (!width || !height) return;
  const points = slideRoutePoints(width, height);
  const overlap = 9;
  controls.querySelectorAll('.slide-route-segment').forEach((segment, index) => {
    const from = points[index];
    const to = points[index + 1];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    const unitX = dx / length;
    const unitY = dy / length;
    segment.style.left = `${from.x - unitX * overlap}px`;
    segment.style.top = `${from.y - unitY * overlap - segment.offsetHeight / 2}px`;
    segment.style.width = `${length + overlap * 2}px`;
    segment.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
  });
  controls.querySelectorAll('.slide-gates img').forEach((gate) => {
    const point = pointAlongRoute(points, Number(gate.dataset.routeProgress));
    gate.style.setProperty('--gate-x', `${point.x}px`);
    gate.style.setProperty('--gate-y', `${point.y}px`);
  });
  const landing = controls.querySelector('.slide-landing');
  if (landing) {
    const endpoint = points.at(-1);
    landing.style.left = `${endpoint.x - landing.offsetWidth / 2}px`;
    landing.style.top = `${endpoint.y - landing.offsetHeight / 2}px`;
  }
  controls.dataset.routePoints = JSON.stringify(points.map((point) => ({
    x: Math.round(point.x * 10) / 10,
    y: Math.round(point.y * 10) / 10,
  })));
}

function renderSlideAction(group) {
  const sequence = slideSequence(group);
  const controls = document.createElement('div');
  controls.className = 'slide-controls';
  controls.style.setProperty('--gate-count', sequence.length);

  const path = document.createElement('div');
  path.className = 'slide-path';
  for (let index = 0; index < 3; index += 1) {
    path.append(makeImage('./assets/ui/route-ribbon.webp', `slide-route-segment segment-${index + 1}`));
  }
  controls.append(path);

  const gates = document.createElement('div');
  gates.className = 'slide-gates';
  sequence.forEach((_direction, index) => {
    const gate = makeImage('./assets/ui/snowflake-gate.webp');
    const progress = (index + 1) / (sequence.length + 1);
    gate.dataset.routeProgress = String(progress);
    if (index < state.actionStep) gate.classList.add('is-done');
    gates.append(gate);
  });
  controls.append(gates);

  if (state.actionStep >= sequence.length) {
    const landing = document.createElement('button');
    landing.type = 'button';
    landing.className = 'slide-landing is-active';
    landing.dataset.target = 'slide-landing';
    landing.setAttribute('aria-label', 'Land the penguin slide');
    landing.append(makeImage('./assets/ui/landing-badge.webp'));
    addActionTap(landing, () => completeStation());
    controls.append(landing);
    els.actionStage.append(controls);
    layoutSlideRoute(controls);
    positionSlideGuide(sequence.length, sequence.length);
    return;
  }

  for (const direction of ['left', 'right']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `slide-arrow${sequence[state.actionStep] === direction ? ' is-active' : ''}`;
    button.dataset.dir = direction;
    button.dataset.target = `slide-${direction}`;
    button.setAttribute('aria-label', `Steer ${direction}`);
    button.append(makeImage('./assets/ui/slide-arrows.webp', 'slide-arrow-piece'));
    addActionTap(button, () => slideAttempt(direction));
    controls.append(button);
  }
  els.actionStage.append(controls);
  layoutSlideRoute(controls);
  positionSlideGuide(state.actionStep, sequence.length);

  let pointerId = null;
  let startX = 0;
  const down = (event) => {
    if (event.isPrimary === false || event.target.closest('.slide-arrow')) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    try { els.actionStage.setPointerCapture(pointerId); } catch { /* window listeners still cover it */ }
    tactileFeedback(event);
    nudger.poke();
  };
  const up = (event) => {
    if (event.pointerId !== pointerId) return;
    const delta = event.clientX - startX;
    pointerId = null;
    if (Math.abs(delta) < 48) return;
    slideAttempt(delta < 0 ? 'left' : 'right');
  };
  const cancel = (event) => { if (event.pointerId === pointerId) pointerId = null; };
  els.actionStage.addEventListener('pointerdown', down);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  actionCleanup.push(() => {
    els.actionStage.removeEventListener('pointerdown', down);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
  });
}

function positionSlideGuide(step, total) {
  const progress = total ? Math.max(0, Math.min(1, step / total)) : 0;
  const width = Math.max(500, els.stationCard.clientWidth);
  const height = Math.max(340, els.stationCard.clientHeight);
  const points = slideRoutePoints(width, height);
  const start = points[0];
  const point = pointAlongRoute(points, progress);
  els.stationGuide.style.setProperty('--guide-x', `${point.x - start.x}px`);
  els.stationGuide.style.setProperty('--guide-y', `${point.y - start.y}px`);
  els.stationGuide.style.setProperty('--guide-rotate', `${(progress - .5) * 9}deg`);
}

function slideAttempt(direction) {
  const group = state.traversal[state.stationIndex];
  const sequence = slideSequence(group);
  if (direction !== sequence[state.actionStep]) {
    sfx.unpop();
    return false;
  }
  state.actionStep += 1;
  sfx.whoosh();
  renderStationAction({ preserve: true });
  return true;
}

function renderStationAction({ preserve = false } = {}) {
  cleanupAction();
  els.actionStage.replaceChildren();
  const group = state.traversal[state.stationIndex];
  if (!group) return;
  if (!preserve) {
    state.actionStep = 0;
    state.actionProgress = 0;
    state.carrySelected = false;
    state.carryPlaced = false;
  }
  if (group.action === 'crawl') renderCrawlAction(group);
  else if (group.action === 'climb' || group.action === 'hop') renderOrderedAction(group.action);
  else if (group.action === 'carry') renderCarryAction(group);
  else if (group.action === 'slide') renderSlideAction(group);
}

function renderStation({ speakPrompt = false } = {}) {
  cleanupAction();
  const group = state.traversal[state.stationIndex];
  if (!group) return finishCourse();
  state.busy = false;
  state.actionStep = 0;
  state.actionProgress = 0;
  state.carrySelected = false;
  state.carryPlaced = false;
  els.stationCard.dataset.action = group.action;
  els.stationCard.classList.remove('station-success', 'is-balancing');
  els.stationGuide.classList.remove('is-gentle-wiggle');
  els.stationGuide.style.removeProperty('--guide-x');
  els.stationGuide.style.removeProperty('--guide-y');
  els.stationGuide.style.removeProperty('--guide-rotate');
  const node = group.nodes[0];
  const module = moduleFor(node);
  els.stationNumber.textContent = group.nodes.length > 1
    ? `${completedNodeCount() + 1}–${completedNodeCount() + group.nodes.length}`
    : String(completedNodeCount() + 1);
  els.stationObstacle.src = module.asset;
  els.stationObstacle.alt = module.title;
  els.stationObstacle.style.setProperty('--piece-filter', pieceFilter(node.color));
  applyTrim(els.stationObstacle, moduleTrim(node.kind));
  const guidePose = group.action === 'carry' ? 'idle' : ACTION_POSE[group.action];
  els.stationGuide.src = guideAsset(guidePose);
  els.stationGuide.alt = `${currentWorld().guide} showing ${group.action}`;
  applyGuideTrim(els.stationGuide, guidePose);
  renderPlayProgress();
  renderPaperPrompt(group);
  renderStationAction();
  announceStatus(`Obstacle ${completedNodeCount() + 1}: ${config.voice[promptKeyFor(group)]}`);
  if (speakPrompt) speak(promptKeyFor(group));
}

async function startPlay({ intro = true } = {}) {
  if (!currentWorld()) return false;
  if (currentCourse().length < MIN_NODES) {
    nudger.poke();
    state.selectedTrayKind = null;
    state.selectedNodeId = null;
    state.paletteOpen = false;
    renderBuilder();
    flashBuilderTargets();
    speak('need-three');
    return false;
  }
  return screens.start(async () => {
    await ready;
    state.traversal = makeTraversal(currentCourse());
    state.stationIndex = 0;
    state.busy = false;
    setWorldBackdrop(els.play);
    screens.show('play');
    renderStation();
    if (intro) await speakSequence(['play-intro', promptKeyFor(state.traversal[0])]);
    else speak(promptKeyFor(state.traversal[0]));
    return true;
  }, { busy: false });
}

async function completeStation() {
  if (state.screen !== 'play' || state.busy) return false;
  state.busy = true;
  nudger.stop();
  cleanupAction();
  sfx.sparkle();
  els.stationCard.classList.add('station-success');
  els.stationGuide.src = guideAsset('cheer');
  const cheer = `station-cheer-${1 + Math.floor(random() * 3)}`;
  speak(cheer);
  await timers.wait(680);
  if (state.screen !== 'play') return false;
  state.stationIndex += 1;
  if (state.stationIndex >= state.traversal.length) {
    finishCourse();
  } else {
    nudger.arm();
    renderStation({ speakPrompt: true });
  }
  return true;
}

function renderFinish() {
  setWorldBackdrop(els.end);
  els.finishGuide.src = guideAsset('cheer');
  els.finishGuide.alt = `${currentWorld().guide} cheering`;
  applyGuideTrim(els.finishGuide, 'cheer');
  els.finishCourse.replaceChildren();
  currentCourse().forEach((node, index) => {
    const module = moduleFor(node);
    const image = makeImage(module.asset, 'finish-piece', module.title);
    image.style.setProperty('--piece-filter', pieceFilter(node.color));
    applyTrim(image, moduleTrim(node.kind));
    els.finishCourse.append(image);
    if (index < currentCourse().length - 1) {
      const arrow = document.createElement('span');
      arrow.className = 'finish-arrow';
      arrow.textContent = '›';
      arrow.setAttribute('aria-hidden', 'true');
      els.finishCourse.append(arrow);
    }
  });
}

async function narrateFinish() {
  const token = ++finishNarrationToken;
  await speak('course-complete');
  if (token !== finishNarrationToken || state.screen !== 'end') return false;
  await timers.wait(300);
  if (token !== finishNarrationToken || state.screen !== 'end') return false;
  await speak('real-world-invite');
  return true;
}

function finishCourse() {
  cleanupAction();
  renderFinish();
  screens.show('end');
  announceStatus('Course complete. Built it, played it, imagined it.');
  celebrationCleanup = tada({ host: els.end, count: 42, duration: 2800, rng: random });
  narrateFinish();
  return true;
}

function replayPrompt() {
  if (state.screen === 'splash') return speak('choose-world');
  if (state.screen === 'builder') return speak(currentCourse().length < MIN_NODES ? 'need-three' : 'builder-ready');
  if (state.screen === 'play') {
    const group = state.traversal[state.stationIndex];
    return group ? speak(promptKeyFor(group)) : undefined;
  }
  if (state.screen === 'end') return narrateFinish();
  return undefined;
}

const replayGuard = soundDebounce(replayPrompt, 700);
wireTap(els.splashSound, replayGuard);
wireTap(els.builderSound, replayGuard);
wireTap(els.playSound, replayGuard);
wireTap(els.endSound, replayGuard);
wireTap(els.splashPlay, () => state.worldId && selectWorld(state.worldId, { speakWorld: false }));
wireTap(els.builderBack, () => goSplash());
wireTap(els.playBack, () => goSplash());
wireTap(els.endBack, () => goSplash());
wireTap(els.playCourse, () => startPlay());
wireTap(els.undoButton, undo);

const beginScrapHold = (event) => {
  if (event.isPrimary === false || els.scrapButton.disabled || state.screen !== 'builder') return;
  cancelScrapHold();
  scrapHoldPointer = event.pointerId;
  els.scrapButton.classList.add('is-hold-armed');
  announceStatus('Keep holding the scrap basket to clear the whole course.');
  const pointerId = event.pointerId;
  scrapHoldTimer = window.setTimeout(() => {
    if (scrapHoldPointer !== pointerId || state.screen !== 'builder') return;
    scrapHoldTimer = 0;
    scrapHoldTriggered = true;
    els.scrapButton.classList.remove('is-hold-armed');
    clearCourseWithPeel();
  }, 700);
};
const moveScrapHold = (event) => {
  if (event.pointerId !== scrapHoldPointer || scrapHoldTriggered) return;
  const rect = els.scrapButton.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right
    || event.clientY < rect.top || event.clientY > rect.bottom) cancelScrapHold();
};
const endScrapHold = (event) => {
  if (event.pointerId !== scrapHoldPointer) return;
  cancelScrapHold({ preserveTriggered: scrapHoldTriggered });
};
els.scrapButton.addEventListener('pointerdown', beginScrapHold);
els.scrapButton.addEventListener('pointermove', moveScrapHold);
els.scrapButton.addEventListener('pointerup', endScrapHold);
els.scrapButton.addEventListener('pointercancel', () => cancelScrapHold());
wireTap(els.scrapButton, () => {
  if (scrapHoldTriggered) {
    scrapHoldTriggered = false;
    return true;
  }
  if (state.selectedNodeId) return scrapSelected();
  announceStatus('Select an obstacle to remove, or hold the scrap basket to clear the course.');
  return false;
});
wireTap(els.paletteButton, () => {
  if (!state.selectedNodeId) return;
  state.paletteOpen = !state.paletteOpen;
  renderTools();
  announceStatus(state.paletteOpen ? 'Color stamps opened.' : 'Color stamps closed.');
});
wireTap(els.replayCourse, () => startPlay());
wireTap(els.buildAnother, () => {
  goBuilder();
  speak('build-another');
});

installUnlockOnGesture({
  onFirst: (event) => {
    if (!event.target?.closest?.('[data-target]')) speak('choose-world');
  },
});
installKioskGuards();
renderWorldPicker();
renderSplashPlay();

window.addEventListener('pointerdown', (event) => {
  if (state.screen !== 'builder'
    || (!state.selectedTrayKind && !state.selectedNodeId && !state.paletteOpen)
    || event.target.closest('.course-wrap, .module-tray, .builder-tools, #play-course, [data-hud]')) return;
  state.selectedTrayKind = null;
  state.selectedNodeId = null;
  state.paletteOpen = false;
  renderBuilder();
  announceStatus('Obstacle selection closed.');
}, { passive: true });

function recoverInteraction({ rerender = true, resumePrompt = false } = {}) {
  cancelScrapHold();
  cancelBuilderDrag();
  carryDrag.cancel();
  if (state.screen === 'play' && !state.busy && state.traversal[state.stationIndex]) {
    cleanupAction();
    if (state.traversal[state.stationIndex].action === 'carry') state.carrySelected = false;
    if (rerender) renderStationAction({ preserve: true });
  }
  if (state.screen === 'builder') scheduleRouteRender();
  if (resumePrompt) needsResumePrompt = true;
}

window.addEventListener('resize', () => recoverInteraction(), { passive: true });
window.addEventListener('orientationchange', () => recoverInteraction(), { passive: true });
window.addEventListener('blur', () => {
  wasBackgrounded = true;
  recoverInteraction({ resumePrompt: true });
}, { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    wasBackgrounded = true;
    recoverInteraction({ rerender: false });
  } else {
    recoverInteraction({ resumePrompt: wasBackgrounded });
    wasBackgrounded = false;
  }
});
window.addEventListener('pagehide', () => {
  wasBackgrounded = true;
  recoverInteraction({ rerender: false });
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted || wasBackgrounded) recoverInteraction({ resumePrompt: true });
  wasBackgrounded = false;
});

function debugTap(targetId) {
  const target = [...document.querySelectorAll('[data-target]')]
    .find((node) => node.dataset.target === targetId && node.getClientRects().length);
  if (!target) return Promise.resolve({ accepted: false, reason: 'missing-target' });
  target.click();
  return Promise.resolve({ accepted: true, target: targetId });
}

function debugCourse(specs = null) {
  if (!currentWorld()) return false;
  const route = specs && Array.isArray(specs.cells) && Array.isArray(specs.kinds)
    ? specs
    : config.suggestedRoutes[2];
  const cells = Array.isArray(route.cells) ? route.cells : config.suggestedRoutes[0].cells;
  const kinds = Array.isArray(route.kinds) ? route.kinds : config.suggestedRoutes[0].kinds;
  const modules = currentWorld().modules;
  const next = cells.slice(0, MAX_NODES).map((cell, index) => {
    let kind = kinds[index % kinds.length];
    if (!modules.some((module) => module.kind === kind)) kind = modules[index % modules.length].kind;
    return { id: makeNodeId(), kind, cell, color: COLORS[index % COLORS.length] };
  });
  state.courses[state.worldId] = validateCourses({ [state.worldId]: next })[state.worldId];
  saveState();
  renderBuilder();
  return cloneCourse();
}

function debugGetCourse(worldId = state.worldId) {
  return (state.courses[worldId] || []).map((node) => ({ ...node }));
}

function debugCell(targetIndex) {
  if (typeof targetIndex === 'string' && config.grid.cells.includes(targetIndex)) return targetIndex;
  const index = Number(targetIndex);
  return Number.isInteger(index) ? config.grid.cells[index] || null : null;
}

function debugPlace(kind, targetIndex, sourceIndex) {
  const cell = debugCell(targetIndex);
  if (!currentWorld() || !cell) return false;
  if (sourceIndex !== undefined && sourceIndex !== null) {
    const node = currentCourse()[Number(sourceIndex)];
    if (!node || (kind && node.kind !== kind)) return false;
    return moveNodeTo(node.id, cell);
  }
  if (!currentWorld().modules.some((module) => module.kind === kind)) return false;
  return placeTrayAt(kind, cell);
}

function debugRemove(index) {
  const node = currentCourse()[Number(index)];
  if (!node) return false;
  state.selectedNodeId = node.id;
  return scrapSelected();
}

function debugSwap(firstIndex, secondIndex) {
  const first = currentCourse()[Number(firstIndex)];
  const second = currentCourse()[Number(secondIndex)];
  if (!first || !second || first.id === second.id) return false;
  return moveNodeTo(first.id, second.cell);
}

function debugSetColor(index, color) {
  const node = currentCourse()[Number(index)];
  if (!node || !COLORS.includes(color)) return false;
  state.selectedNodeId = node.id;
  return recolorSelected(color);
}

function debugGetActionState() {
  const group = state.traversal[state.stationIndex] || null;
  const sequence = group?.action === 'slide' ? slideSequence(group) : [];
  return {
    screen: state.screen,
    stationIndex: state.stationIndex,
    action: group?.action || null,
    runLength: group?.nodes.length || 0,
    hold: group && (group.action === 'climb' || group.action === 'hop') ? state.actionStep + 1 : null,
    completedSteps: state.actionStep,
    requiredSteps: sequence.length || (group?.action === 'climb' ? 4 : group?.action === 'hop' ? 3 : null),
    progress: Number(state.actionProgress.toFixed(3)),
    gates: group?.action === 'slide' ? { collected: state.actionStep, total: sequence.length } : null,
    carry: group?.action === 'carry' ? { selected: state.carrySelected, placed: state.carryPlaced } : null,
    busy: state.busy,
  };
}

function debugClearSavedState() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* in-memory reset still succeeds */ }
  state.courses = blankCourses();
  state.worldId = null;
  state.history = [];
  goSplash({ announce: false });
  return { version: STORAGE_VERSION, selectedWorld: null, courses: blankCourses() };
}

function debugLoadSavedState(snapshot) {
  const restored = validateSavedState(snapshot);
  state.courses = restored.courses;
  state.worldId = restored.selectedWorld;
  state.history = [];
  state.selectedTrayKind = null;
  state.selectedNodeId = null;
  saveState();
  goSplash({ announce: false });
  return { ...restored, courses: Object.fromEntries(Object.entries(restored.courses)
    .map(([world, course]) => [world, course.map((node) => ({ ...node }))])) };
}

installDebug({
  gameId: config.id,
  engine: 'custom-dom-builder',
  ready,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  listModes: () => config.worlds.map((world) => ({ id: world.id, title: world.title })),
  startMode: (id) => selectWorld(id, { speakIntro: false }),
  getState: () => ({
    screen: state.screen,
    worldId: state.worldId,
    course: cloneCourse(),
    historyDepth: state.history.length,
    selectedTrayKind: state.selectedTrayKind,
    selectedNodeId: state.selectedNodeId,
    stationIndex: state.stationIndex,
    stationCount: state.traversal.length,
    action: state.traversal[state.stationIndex]?.action || null,
    actionStep: state.actionStep,
    actionProgress: Number(state.actionProgress.toFixed(3)),
    busy: state.busy,
    timers: timers.size(),
  }),
  tap: debugTap,
  winRound: async () => {
    if (state.screen === 'splash') return selectWorld('backyard', { speakIntro: false });
    if (state.screen === 'builder') {
      if (currentCourse().length < MIN_NODES) debugCourse();
      return startPlay({ intro: false });
    }
    if (state.screen === 'play') return completeStation();
    if (state.screen === 'end') return startPlay({ intro: false });
    return false;
  },
  home: () => goSplash({ announce: false }),
  onSeed: (nextRandom, seed) => { random = nextRandom; state.seed = seed; },
  selectWorld: (id) => selectWorld(id, { speakIntro: false }),
  getCourse: debugGetCourse,
  place: debugPlace,
  remove: debugRemove,
  swap: debugSwap,
  setColor: debugSetColor,
  undo,
  startTraversal: () => startPlay({ intro: false }),
  completeAction: () => state.screen === 'play' ? completeStation() : false,
  nextStation: () => state.screen === 'play' ? completeStation() : false,
  getActionState: debugGetActionState,
  clearSavedState: debugClearSavedState,
  loadSavedState: debugLoadSavedState,
  setCourse: debugCourse,
  getAudioLog: () => voiceClips.getAudioLog(),
  clearAudioLog: () => voiceClips.clearAudioLog(),
  getLayout: () => ({
    viewport: { width: innerWidth, height: innerHeight },
    world: state.worldId,
    board: els.courseGrid.getBoundingClientRect().toJSON?.() || null,
    routeSegments: els.routeLayer.childElementCount,
    targetCount: document.querySelectorAll('[data-target]').length,
  }),
});

ready.then(() => document.documentElement.dataset.gameReady = 'true');
