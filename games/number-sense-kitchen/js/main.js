import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';

const $ = (selector) => document.querySelector(selector);
const dom = {
  game: $('#game'), play: $('.play'), cards: $('[data-mode-cards]'), board: $('[data-board]'), tray: $('[data-tray]'),
  prompt: $('[data-prompt]'), pips: $('[data-pips]'), badges: $('[data-badges]'), earned: $('[data-earned]'), finale: $('[data-finale-badges]'),
  rewardPraise: $('[data-reward-praise]'), rewardDetail: $('[data-reward-detail]'), rewardTableau: $('[data-reward-tableau]'),
  celebrationStars: $('[data-celebration-stars]'), nextLabel: $('[data-next-label]'),
};
const ROUND_DATA = {
  cookie: [
    { id: 'cookie-r1', target: 1, choices: [1, 2, 3] }, { id: 'cookie-r2', target: 2, choices: [1, 2, 4] }, { id: 'cookie-r3', target: 4, choices: [2, 3, 4] },
  ],
  frame: [
    { id: 'frame-r1', target: 3, slots: 5, pieces: ['strawberry', 'strawberry', 'strawberry'] },
    { id: 'frame-r2', target: 5, slots: 5, pieces: ['apple', 'apple', 'strawberry', 'strawberry', 'strawberry'] },
    { id: 'frame-r3', target: 8, slots: 10, pieces: ['orange', 'orange', 'orange', 'orange', 'orange', 'apple', 'apple', 'apple'] },
  ],
  bowl: [
    { id: 'bowl-r1', target: 3, groups: [{ id: 'strawberry-1', asset: 'groupStrawberry1', fruit: 'strawberry', count: 1 }, { id: 'strawberry-2', asset: 'groupStrawberry2', fruit: 'strawberry', count: 2 }] },
    { id: 'bowl-r2', target: 5, groups: [{ id: 'apple-2', asset: 'groupApple2', fruit: 'apple', count: 2 }, { id: 'orange-3', asset: 'groupOrange3', fruit: 'orange', count: 3 }] },
    { id: 'bowl-r3', target: 8, groups: [{ id: 'strawberry-5', asset: 'groupStrawberry5', fruit: 'strawberry', count: 5 }, { id: 'apple-3', asset: 'groupApple3', fruit: 'apple', count: 3 }] },
  ],
};
const state = { screen: 'splash', mode: null, roundIndex: 0, roundId: null, awaitingInput: false, selectedId: null, placedIds: [], target: null, completedModes: new Set(), muted: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, locked: false };
const REWARD_COPY = {
  cookie: { praise: 'You spotted four!', detail: 'Quick-look cookie chef!' },
  frame: { praise: 'You built eight!', detail: 'Every fruit has a space.' },
  bowl: { praise: 'Five and three make eight!', detail: 'Fruit-mixing number chef!' },
};
const timers = createTimers();
let drag = null;
let rng = mulberry32(42);

const ready = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
bgm.preload(config.music);
const disposeKiosk = installKioskGuards();
const disposeUnlock = installUnlockOnGesture({ extra: [bgm.unlock] });
window.addEventListener('pagehide', () => { teardownRound(); bgm.stop({ fadeOutMs: 0 }); disposeKiosk(); disposeUnlock(); }, { once: true });

const screens = createScreens({
  root: dom.game,
  initial: 'splash',
  voice,
  onEnter(name) { state.screen = name; },
  onExit() { teardownRound(); },
});
const nudge = createNudger({
  first: 8000,
  repeat: 9000,
  onNudge(count) {
    if (!state.awaitingInput || state.screen !== 'play') return;
    speak(count ? retryKey() : promptKey());
    if (count > 0) {
      const target = document.querySelector('.fruit-piece, .group-piece, [data-role="correct"]');
      target?.classList.add('is-selected');
      timers.after(900, () => target?.classList.remove('is-selected'));
    }
  },
});

function asset(name) { return config.assets[name]; }
function img(src, className = '', alt = '') { const node = document.createElement('img'); node.src = src; node.className = className; node.alt = alt; node.draggable = false; return node; }
function currentRound() { return state.mode ? ROUND_DATA[state.mode][state.roundIndex] : null; }
function promptKey() { return `${state.roundId}-prompt`; }
function successKey() { return `${state.roundId}-success`; }
function retryKey() { return state.mode === 'cookie' ? `${state.roundId}-retry` : 'wrong'; }
function speak(key) { if (state.muted) return Promise.resolve(); return bgm.duckDuring(voice.say(key, config.voice[key])); }
function bind(node, action) { return onTap(node, (event) => { event.preventDefault(); nudge.poke(); action(event); }, { feedback: () => sfx.tick() }); }
function badge(mode, earned = state.completedModes.has(mode)) { const node = document.createElement('span'); node.className = `badge${earned ? ' is-earned' : ''}`; node.append(img(asset(`badge${mode[0].toUpperCase()}${mode.slice(1)}`), '', `${mode} recipe badge`)); return node; }

function rewardTotal(number) {
  const total = document.createElement('div');
  total.className = 'reward-total'; total.textContent = number; total.setAttribute('aria-label', `Total ${number}`);
  return total;
}
function rewardTableau(mode) {
  const tableau = document.createElement('div');
  tableau.className = `reward-scene reward-scene--${mode}`;
  if (mode === 'cookie') {
    tableau.setAttribute('aria-label', 'Four cookies collected in the jar');
    tableau.append(img(asset('cookie4'), 'reward-cookie-cluster', 'Four cookies'));
    tableau.append(img(asset('jar'), 'reward-cookie-jar', 'Cookie jar'));
    tableau.append(rewardTotal(4));
    return tableau;
  }
  if (mode === 'frame') {
    tableau.setAttribute('aria-label', 'Eight fruit filling a ten-frame');
    const board = document.createElement('div'); board.className = 'frame-board frame-board--10 reward-frame';
    board.append(img(asset('frame10'), 'frame-art', 'Ten-frame with eight filled spaces'));
    const pieces = ['orange', 'orange', 'orange', 'orange', 'orange', 'apple', 'apple', 'apple'];
    for (let index = 0; index < 10; index += 1) {
      const cell = document.createElement('span'); cell.className = 'frame-cell'; Object.assign(cell.style, slotPosition(index, 10));
      if (pieces[index]) cell.append(img(asset(pieces[index]), 'food', pieces[index]));
      board.append(cell);
    }
    tableau.append(board, rewardTotal(8));
    return tableau;
  }
  tableau.setAttribute('aria-label', 'Five strawberries and three apples together make eight');
  tableau.append(img(asset('bowl'), 'reward-bowl', 'Fruit bowl'));
  const fruits = ['strawberry', 'strawberry', 'strawberry', 'strawberry', 'strawberry', 'apple', 'apple', 'apple'];
  for (const [index, kind] of fruits.entries()) {
    const fruit = img(asset(kind), 'reward-bowl-fruit', kind);
    fruit.style.left = `${24 + (index % 4) * 13}%`; fruit.style.top = `${38 + Math.floor(index / 4) * 17}%`;
    tableau.append(fruit);
  }
  tableau.append(rewardTotal(8));
  return tableau;
}
function renderCompletion(mode) {
  const copy = REWARD_COPY[mode];
  dom.rewardPraise.textContent = copy.praise; dom.rewardDetail.textContent = copy.detail;
  dom.rewardTableau.replaceChildren(rewardTableau(mode));
  dom.earned.replaceChildren(badge(mode, true));
  dom.celebrationStars.replaceChildren(...Array.from({ length: 7 }, () => img(asset('star'), 'celebration-star', '')));
  dom.nextLabel.textContent = state.completedModes.size === config.modes.length ? 'Final Feast' : 'Next Recipe';
}
function renderFinaleRecipes() {
  dom.finale.replaceChildren(...config.modes.map((mode) => {
    const card = document.createElement('div'); card.className = 'finale-recipe'; card.setAttribute('aria-label', `${mode.name} complete`);
    card.append(img(mode.asset, 'finale-recipe-card', ''));
    card.append(badge(mode.id, true));
    return card;
  }));
}

function renderMenu() {
  dom.cards.replaceChildren();
  for (const mode of config.modes) {
    const card = document.createElement('button');
    card.className = 'mode-card'; card.dataset.target = `mode-${mode.id}`; card.dataset.role = 'neutral'; card.setAttribute('aria-label', mode.name);
    card.append(img(mode.asset, '', '')); const label = document.createElement('span'); label.className = 'card-label'; label.textContent = mode.name; card.append(label);
    if (state.completedModes.has(mode.id)) { const mark = img(asset(`badge${mode.id[0].toUpperCase()}${mode.id.slice(1)}`), 'card-badge', 'Earned'); card.append(mark); }
    bind(card, () => openMode(mode.id)); dom.cards.append(card);
  }
}
function renderHud() { dom.badges.replaceChildren(...config.modes.map((mode) => badge(mode.id))); }
function renderPips() { dom.pips.replaceChildren(...[0, 1, 2].map((index) => { const pip = document.createElement('span'); pip.className = `pip${index < state.roundIndex ? ' is-done' : index === state.roundIndex ? ' is-current' : ''}`; return pip; })); }

async function startKitchen() {
  await ready;
  screens.show('menu');
  renderMenu();
  bgm.play(config.music, { key: 'number-sense-kitchen', fadeInMs: 350 });
  await speak('welcome');
  if (state.screen === 'menu') speak('start');
}
async function openMode(id) { await ready; state.mode = id; state.roundIndex = 0; screens.show('play'); renderRound(); }
function renderRound() {
  teardownRound();
  const round = currentRound();
  if (!round) { finishMode(); return; }
  state.roundId = round.id; state.target = round.target; state.selectedId = null; state.placedIds = []; state.locked = false; state.awaitingInput = true;
  dom.play.dataset.mode = state.mode;
  dom.board.replaceChildren(); dom.tray.replaceChildren(); renderHud(); renderPips(); dom.prompt.textContent = config.voice[promptKey()];
  if (state.mode === 'cookie') renderCookie(round); else if (state.mode === 'frame') renderFrame(round); else renderBowl(round);
  speak(promptKey()); nudge.arm();
}
function teardownRound() { nudge.stop(); timers.clearAll(); drag?.detach(); drag = null; state.selectedId = null; state.awaitingInput = false; }
function gentleWrong(node) { if (!state.awaitingInput || state.locked) return false; sfx.boing(); node?.classList.add('is-wrong'); speak(retryKey()); timers.after(450, () => node?.classList.remove('is-wrong')); nudge.poke(); return false; }
function completeRound() {
  if (!state.awaitingInput || state.locked) return false;
  state.locked = true; state.awaitingInput = false; nudge.stop(); sfx.tada(); speak(successKey());
  timers.after(state.reducedMotion ? 30 : 1050, () => { state.roundIndex += 1; renderRound(); });
  return true;
}

function renderCookie(round) {
  const jar = img(asset('jar'), 'cookie-jar', 'Empty cookie jar'); const cluster = img(asset(`cookie${round.target}`), 'cookie-cluster', `${round.target} cookies`);
  dom.board.append(jar, cluster); const choices = document.createElement('div'); choices.className = 'number-choices';
  for (const number of round.choices) { const button = document.createElement('button'); button.className = 'number-choice'; button.dataset.target = `number-${number}`; button.dataset.role = number === round.target ? 'correct' : 'wrong'; button.setAttribute('aria-label', `Number ${number}`); button.append(img(asset('plaque'), '', '')); const label = document.createElement('span'); label.textContent = number; button.append(label); bind(button, () => choose(number)); choices.append(button); }
  dom.board.append(choices);
}
function choose(id) {
  const number = Number(id); const round = currentRound(); const button = document.querySelector(`[data-target="number-${number}"]`);
  if (!state.awaitingInput || state.locked) return false;
  if (number !== round.target) return gentleWrong(button);
  state.locked = true; state.awaitingInput = false; nudge.stop(); button.classList.add('is-right'); const cluster = dom.board.querySelector('.cookie-cluster'); cluster?.classList.add('into-jar');
  timers.after(state.reducedMotion ? 1 : 680, () => { const token = document.createElement('div'); token.className = 'target-token'; token.textContent = number; dom.board.append(token); state.locked = false; state.awaitingInput = true; completeRound(); });
  return true;
}

function slotPosition(index, total) {
  const column = index % 5;
  if (total === 10) {
    return { left: `${10.3 + column * 16.25}%`, top: index < 5 ? '20.5%' : '52%', width: '14.8%', height: '28.5%' };
  }
  return { left: `${9.4 + column * 16.65}%`, top: '29%', width: '15.4%', height: '44%' };
}
function renderFrame(round) {
  const board = document.createElement('div');
  board.className = `frame-board frame-board--${round.slots}`;
  board.append(img(asset(round.slots === 10 ? 'frame10' : 'frame5'), 'frame-art', `${round.slots} space baking frame`));
  for (let index = 0; index < round.slots; index += 1) {
    const cell = document.createElement('span');
    cell.className = 'frame-cell';
    cell.dataset.cell = `slot-${index}`;
    cell.setAttribute('aria-hidden', 'true');
    Object.assign(cell.style, slotPosition(index, round.slots));
    board.append(cell);
  }
  const dropZone = document.createElement('button');
  dropZone.className = 'frame-drop-zone';
  dropZone.dataset.slot = 'frame';
  dropZone.dataset.target = 'frame';
  dropZone.dataset.role = 'neutral';
  dropZone.setAttribute('aria-label', 'Put the selected ingredient in the next empty space');
  bind(dropZone, () => placeDestination('frame'));
  board.append(dropZone);
  dom.board.append(board);
  renderNextFramePiece(round);
  installDrag((piece, record) => record.slot === dropZone ? placeFrame(piece.dataset.piece) : gentleWrong(piece));
}
function renderNextFramePiece(round) {
  dom.tray.replaceChildren();
  const index = state.placedIds.length;
  const kind = round.pieces[index];
  if (!kind) return;
  const id = `piece-${index}`;
  const piece = document.createElement('button');
  piece.className = 'fruit-piece';
  piece.dataset.piece = id;
  piece.dataset.target = id;
  piece.dataset.role = 'neutral';
  piece.dataset.kind = kind;
  piece.setAttribute('aria-label', `${kind} ingredient ${index + 1} of ${round.target}`);
  piece.append(img(asset(kind), '', kind));
  bind(piece, () => select(id));
  piece.addEventListener('pointerdown', (event) => drag?.begin(event, id));
  dom.tray.append(piece);
}
function installDrag(onDrop) { drag = createDragToSlotDom({ root: dom.game, slotPad: 36, hoverClass: 'hot', getPiece: (id) => dom.tray.querySelector(`[data-piece="${id}"]`), onDrop: (piece, record) => onDrop(piece, record), onCancel: () => { state.selectedId = null; paintSelection(); } }); }
function select(id) { if (!state.awaitingInput || !document.querySelector(`[data-piece="${id}"]`)) return false; state.selectedId = id; paintSelection(); return true; }
function paintSelection() { document.querySelectorAll('.fruit-piece,.group-piece').forEach((piece) => piece.classList.toggle('is-selected', piece.dataset.piece === state.selectedId)); }
function placeFrame(pieceId = state.selectedId) {
  const piece = pieceId && document.querySelector(`[data-piece="${pieceId}"]`);
  const cell = dom.board.querySelector('.frame-cell:not([data-filled="true"])');
  if (!state.awaitingInput || !piece || !cell) return gentleWrong(piece || dom.board.querySelector('.frame-drop-zone'));
  cell.dataset.filled = 'true';
  cell.append(img(asset(piece.dataset.kind), 'food', piece.dataset.kind));
  piece.remove();
  state.placedIds.push(pieceId);
  state.selectedId = null;
  sfx.pop();
  if (state.placedIds.length === state.target) completeRound();
  else renderNextFramePiece(currentRound());
  return true;
}

function renderBowl(round) {
  const bowl = document.createElement('button'); bowl.className = 'bowl-zone'; bowl.dataset.slot = 'bowl'; bowl.dataset.target = 'bowl'; bowl.dataset.role = 'neutral'; bowl.setAttribute('aria-label', 'Empty fruit bowl'); bowl.append(img(asset('bowl'), '', 'Empty fruit bowl')); bind(bowl, () => placeDestination('bowl'));
  dom.board.append(bowl);
  for (const group of round.groups) { const piece = document.createElement('button'); piece.className = 'group-piece'; piece.dataset.piece = group.id; piece.dataset.target = group.id; piece.dataset.role = 'neutral'; piece.dataset.group = JSON.stringify(group); piece.setAttribute('aria-label', `${group.count} ${group.fruit}`); piece.append(img(asset(group.asset), '', `${group.count} ${group.fruit}`)); bind(piece, () => select(group.id)); piece.addEventListener('pointerdown', (event) => drag?.begin(event, group.id)); dom.tray.append(piece); }
  installDrag((piece, record) => { if (record.slot === bowl) return placeDestination('bowl', piece.dataset.piece); return gentleWrong(piece); });
}
function placeGroup(piece) {
  const group = JSON.parse(piece.dataset.group); if (piece.disabled || state.placedIds.includes(group.id)) return false; const bowl = dom.board.querySelector('.bowl-zone'); piece.disabled = true; state.placedIds.push(group.id); state.selectedId = null;
  for (let index = 0; index < group.count; index += 1) { const fruit = img(asset(group.fruit), 'bowl-fruit', group.fruit); fruit.style.left = `${20 + ((index * 14 + state.placedIds.length * 17) % 55)}%`; fruit.style.top = `${37 + ((index * 9 + state.placedIds.length * 8) % 25)}%`; bowl.append(fruit); }
  sfx.pop(); if (state.placedIds.length === 2) { const total = document.createElement('div'); total.className = 'bowl-total'; total.textContent = state.target; bowl.append(total); timers.after(state.reducedMotion ? 1 : 500, completeRound); } return true;
}
function placeDestination(destination, pieceId = state.selectedId) {
  if (state.mode === 'frame' && (destination === 'frame' || String(destination).startsWith('slot-'))) return placeFrame(pieceId);
  if (state.mode === 'bowl') {
    const piece = pieceId && document.querySelector(`[data-piece="${pieceId}"]`);
    if (!piece || destination !== 'bowl' || !state.awaitingInput) return gentleWrong(piece);
    return placeGroup(piece);
  }
  return false;
}

function finishMode() {
  state.completedModes.add(state.mode); state.locked = true; renderHud(); renderCompletion(state.mode); screens.show('complete'); speak(`mode-${state.mode}-complete`);
  if (state.completedModes.size === 3) timers.after(state.reducedMotion ? 1 : 1650, showFinale);
}
function showFinale() { renderFinaleRecipes(); screens.show('finale'); speak('finale'); }
function back() { if (state.screen === 'menu') { bgm.stop(); screens.show('splash'); return true; } if (state.screen === 'splash') return false; screens.show('menu'); renderMenu(); return true; }
function resetSession() { state.completedModes.clear(); state.mode = null; state.roundIndex = 0; screens.show('menu'); renderMenu(); return true; }

document.querySelectorAll('[data-action]').forEach((button) => bind(button, () => {
  const action = button.dataset.action;
  if (action === 'start') startKitchen(); else if (action === 'back') back(); else if (action === 'replay') speak(state.screen === 'play' ? promptKey() : state.screen === 'menu' ? 'start' : 'welcome'); else if (action === 'menu') { screens.show('menu'); renderMenu(); } else if (action === 'next') { const next = config.modes.find((mode) => !state.completedModes.has(mode.id)); if (next) openMode(next.id); else showFinale(); } else if (action === 'again') resetSession();
}));

preloadImages([...Object.values(config.assets), ...config.modes.map((mode) => mode.asset)]);
renderMenu();
installDebug({
  version: 1, gameId: config.id, engine: 'bespoke-dom', ready, timers, voice, narrator: voice, sfx, root: dom.game,
  listModes: () => config.modes.map(({ id, name }) => ({ id, title: name })), startMode: openMode,
  getState: () => ({ screen: state.screen, mode: state.mode, roundIndex: state.roundIndex, roundId: state.roundId, awaitingInput: state.awaitingInput, locked: state.locked, selectedId: state.selectedId, placedIds: [...state.placedIds], target: state.target, completedModes: [...state.completedModes], muted: state.muted, reducedMotion: state.reducedMotion }),
  mute: (on = true) => { state.muted = Boolean(on); voice.setMuted(state.muted); bgm.setMuted(state.muted); sfx.setMuted?.(state.muted); return state.muted; }, onSeed: (next) => { rng = next; },
  actions: { startKitchen, openMode, choose, select, place: placeDestination, retryPrompt: () => speak(promptKey()), completeRound, back, resetSession },
  tap: (id) => document.querySelector(`[data-target="${id}"]`)?.click(), winRound: completeRound, home: back, getAudioLog: voice.getAudioLog, clearAudioLog: voice.clearAudioLog,
  getAudioState: () => ({ bgm: bgm.stats(), voiceMuted: voice.isMuted() }),
});
