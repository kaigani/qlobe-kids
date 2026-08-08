// Cooking Craze — complete DOM play loop. Art and layout deliberately stay in
// markup/classes: style.css supplies the responsive kitchen stage.
import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { tada, burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { preloadImages } from '../../../shared/js/preload.js';

const mount = document.querySelector('#game');
const screensEl = Object.fromEntries([...mount.querySelectorAll('[data-qk-screen]')]
  .map((el) => [el.dataset.qkScreen, el]));
const els = {
  modeShelf: mount.querySelector('[data-mode-shelf]'), board: mount.querySelector('[data-board]'),
  tray: mount.querySelector('[data-tray]'), prompt: mount.querySelector('[data-play-prompt]'),
  title: mount.querySelector('[data-play-title]'), clue: mount.querySelector('[data-play-clue]'),
  progress: mount.querySelector('[data-play-progress]'), reveal: mount.querySelector('[data-reveal]'),
  playHud: mount.querySelector('[data-play-hud]'), endHud: mount.querySelector('[data-end-hud]'),
};

const STEPS = ['press', 'sauce', 'toppings', 'bake'];
const POSITIONS = [[50, 19], [77, 34], [77, 66], [50, 81], [23, 66], [23, 34]];
const SAUCE_GRID = 5;
const SAUCE_CELLS = Array.from({ length: SAUCE_GRID ** 2 }, (_, index) => `${index % SAUCE_GRID}-${Math.floor(index / SAUCE_GRID)}`)
  .filter((cell) => !['0-0', '4-0', '0-4', '4-4'].includes(cell));
const SAUCE_CELL_SET = new Set(SAUCE_CELLS);
const SAUCE_CELL_COUNT = SAUCE_CELLS.length;
const state = {
  screen: 'splash', mode: null, phase: 'menu', step: 'press', presses: 0, sauceCells: new Set(),
  placed: [], slots: [], recipe: null, selectedKind: null, baking: false, completed: false,
};
const timers = createTimers();
const narrator = createNarrator();
let rng = mulberry32(42);
let dragCtl = null;
let stageDisposers = [];
let bakePointer = null;

function asset(name) { return config.assets[name]; }
function ingredientAsset(kind) { return config.assets.ingredients[kind]; }
function voiceKey(suffix) { return `${state.mode}-${suffix}`; }
function say(key) { return narrator.say(key, config.voice[key] || config.voice.nudge); }
function active() { return screens.is('play') && !state.completed; }
function modeSpec() { return config.modes.find((mode) => mode.id === state.mode); }
function toppingCount() { return state.mode === 'quick' ? 5 : config.slices; }
function needsToppings() { return state.mode !== 'swirl'; }
function disposeStage() {
  dragCtl?.cancel(); dragCtl?.detach(); dragCtl = null;
  stageDisposers.forEach((dispose) => { try { dispose(); } catch { /* teardown */ } });
  stageDisposers = []; bakePointer = null; timers.clearAll();
}
function resetState(mode) {
  const recipeIndex = Math.floor(rng() * config.recipes.length);
  state.mode = mode;
  state.phase = mode === 'quick' ? 'toppings' : 'press';
  state.step = state.phase;
  state.presses = 0; state.sauceCells = new Set(); state.placed = []; state.slots = [];
  state.recipe = config.recipes[recipeIndex] || config.recipes[0];
  state.selectedKind = null; state.baking = false; state.completed = false;
}
function setPhase(phase, promptKey) {
  if (!active() || state.completed || state.phase === phase) return false;
  state.phase = phase; state.step = phase; renderStage();
  if (promptKey) say(promptKey);
  return true;
}
function renderProgress() {
  const limit = state.mode === 'swirl' ? 2 : 4;
  const current = STEPS.indexOf(state.step);
  els.progress.innerHTML = STEPS.slice(0, limit).map((name, index) => (
    `<span class="dot ${index < current ? 'done' : index === current ? 'active' : ''}" data-step="${name}" aria-hidden="true"></span>`
  )).join('');
}
function img(src, className, alt = '') {
  const el = document.createElement('img'); el.src = src; el.className = className; el.alt = alt; el.draggable = false; return el;
}
function largeTarget(el) { el.style.minWidth = '96px'; el.style.minHeight = '96px'; return el; }
function renderSplash() {
  if (!els.modeShelf) return;
  els.modeShelf.replaceChildren(...config.modes.map((mode) => {
    const card = document.createElement('button'); card.type = 'button';
    card.className = `mode-card mode-card--${mode.id}`; card.dataset.mode = mode.id; card.dataset.target = `mode-${mode.id}`;
    card.setAttribute('aria-label', mode.title);
    card.append(img(asset('modeCard'), 'mode-card__plate', ''));
    if (mode.id === 'build') {
      card.append(img(asset('pizzaBase'), 'mode-card__food', ''));
      ['tomato', 'basil', 'cheese'].forEach((kind, index) => card.append(img(ingredientAsset(kind), `mode-card__cue mode-card__cue--${index + 1}`, '')));
    } else if (mode.id === 'swirl') {
      card.append(img(asset('doughBlob'), 'mode-card__food', ''), img(asset('sauceDab'), 'mode-card__sauce', ''));
    } else {
      card.append(img(asset('peel'), 'mode-card__peel', ''), img(asset('pizzaBase'), 'mode-card__quick-pizza', ''));
    }
    const label = document.createElement('span'); label.className = 'mode-card__label'; label.textContent = mode.title; card.append(label);
    stageDisposers.push(onTap(card, () => startMode(mode.id)));
    return card;
  }));
}
function currentPromptKey() {
  if (state.phase === 'press') return voiceKey('press');
  if (state.phase === 'sauce') return voiceKey('sauce');
  if (state.phase === 'toppings') return voiceKey('topping');
  return voiceKey('bake');
}
function updatePrompt() {
  const spec = modeSpec();
  els.title.textContent = spec?.title || 'Cooking Craze';
  els.clue.textContent = config.voice[currentPromptKey()] || config.voice['hint-oven'];
  els.prompt.dataset.phase = state.phase;
  renderProgress();
}
function boardShell() {
  const stage = document.createElement('div'); stage.className = `kitchen-stage kitchen-stage--${state.mode}`;
  stage.append(img(asset('kitchen'), 'kitchen-stage__backdrop', ''));
  return stage;
}
function makePizza(stage, { dough = false } = {}) {
  const pizza = document.createElement(dough ? 'button' : 'div');
  pizza.className = `pizza-object ${dough ? 'pizza-object--dough' : 'pizza-object--sauced'}`;
  pizza.dataset.target = dough ? 'dough' : 'pizza';
  if (dough) { pizza.type = 'button'; pizza.setAttribute('aria-label', 'Pat the dough'); }
  pizza.append(img(dough ? asset('doughBlob') : asset('pizzaBase'), 'pizza-object__art', dough ? 'Dough' : 'Pizza'));
  stage.append(pizza); return pizza;
}
function addFlourPuff(target) {
  const puff = document.createElement('span'); puff.className = 'flour-puff'; puff.setAttribute('aria-hidden', 'true');
  target.append(puff); timers.after(560, () => puff.remove());
}
function patDough(target = els.board.querySelector('.pizza-object--dough')) {
  if (!active() || state.phase !== 'press' || !target) return false;
  state.presses = Math.min(config.thresholds.pressTaps, state.presses + 1);
  target.dataset.presses = String(state.presses); target.classList.remove('is-patted'); void target.offsetWidth; target.classList.add('is-patted'); addFlourPuff(target);
  try { sfx.pop(); } catch { /* sound optional */ }
  if (state.presses >= config.thresholds.pressTaps) setPhase('sauce', voiceKey('sauce'));
  return true;
}
function sauceCellAt(event, surface) {
  const rect = surface.getBoundingClientRect(); const x = (event.clientX - rect.left) / rect.width; const y = (event.clientY - rect.top) / rect.height;
  if (x < 0 || x > 1 || y < 0 || y > 1 || Math.hypot(x - .5, y - .5) > .49) return null;
  const cell = `${Math.min(SAUCE_GRID - 1, Math.floor(x * SAUCE_GRID))}-${Math.min(SAUCE_GRID - 1, Math.floor(y * SAUCE_GRID))}`;
  return SAUCE_CELL_SET.has(cell) ? cell : null;
}
function addSauceProgress(cell, surface = els.board.querySelector('.sauce-surface')) {
  if (!active() || state.phase !== 'sauce' || !SAUCE_CELL_SET.has(cell) || state.sauceCells.has(cell)) return false;
  state.sauceCells.add(cell);
  renderSauceProgress(surface);
  try { sfx.sparkle(); } catch { /* sound optional */ }
  if (state.sauceCells.size / SAUCE_CELL_COUNT >= config.thresholds.sauceCoverage) {
    if (state.mode === 'swirl') finishSwirl(); else setPhase('toppings', voiceKey('topping'));
  }
  return true;
}
function addNextSauceCells(surface = els.board.querySelector('.sauce-surface'), count = 1) {
  let added = 0;
  for (const cell of SAUCE_CELLS) {
    if (!state.sauceCells.has(cell) && addSauceProgress(cell, surface)) added += 1;
    if (added >= count || state.phase !== 'sauce') break;
  }
  return added > 0;
}
function renderSauceProgress(surface) {
  if (!surface) return;
  let layer = surface.querySelector('.sauce-layer');
  if (!layer) { layer = document.createElement('span'); layer.className = 'sauce-layer'; layer.setAttribute('aria-hidden', 'true'); surface.append(layer); }
  const targetCells = Math.ceil(SAUCE_CELL_COUNT * config.thresholds.sauceCoverage);
  layer.style.setProperty('--sauce-progress', Math.min(1, state.sauceCells.size / targetCells));
}
function wireSauce(surface) {
  let pointerId = null;
  const down = (event) => { if (event.isPrimary === false || state.phase !== 'sauce') return; pointerId = event.pointerId; surface.setPointerCapture?.(pointerId); addSauceProgress(sauceCellAt(event, surface), surface); event.preventDefault(); };
  const move = (event) => { if (event.pointerId !== pointerId) return; addSauceProgress(sauceCellAt(event, surface), surface); };
  const end = (event) => { if (event.pointerId === pointerId) pointerId = null; };
  const blur = () => { pointerId = null; };
  const keydown = (event) => { if (!['Enter', ' ', 'Spacebar'].includes(event.key)) return; event.preventDefault(); addNextSauceCells(surface, 4); };
  surface.addEventListener('pointerdown', down); surface.addEventListener('keydown', keydown); window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end); window.addEventListener('blur', blur);
  stageDisposers.push(() => { surface.removeEventListener('pointerdown', down); surface.removeEventListener('keydown', keydown); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); window.removeEventListener('blur', blur); });
}
function finishSwirl() {
  if (!active() || state.phase !== 'sauce') return false;
  state.phase = 'bake'; state.step = 'bake'; renderStage();
  const sparkle = els.board.querySelector('.completion-sparkles'); sparkle?.classList.add('is-on');
  // Swirl has no oven step: the child completed the actual pat + coverage task.
  timers.after(850, () => completePizza());
  return true;
}
function makeSlots(pizza) {
  const count = toppingCount();
  for (let index = 0; index < count; index += 1) {
    const slot = largeTarget(document.createElement('button')); slot.type = 'button'; slot.className = 'pizza-slot'; slot.dataset.slot = String(index); slot.dataset.kind = state.recipe.kinds[index]; slot.dataset.target = `slice-${index}`; slot.setAttribute('aria-label', `Pizza slice ${index + 1}`);
    slot.style.left = `${POSITIONS[index][0]}%`; slot.style.top = `${POSITIONS[index][1]}%`;
    pizza.append(slot); state.slots.push({ index, kind: slot.dataset.kind });
    stageDisposers.push(onTap(slot, () => dropOn(index)));
  }
}
function pickTopping(kind) {
  if (!active() || state.phase !== 'toppings' || state.placed.some((item) => item.kind === kind)) return false;
  const piece = els.tray.querySelector(`[data-kind="${kind}"]:not(.is-placed)`); if (!piece) return false;
  state.selectedKind = kind; els.tray.querySelectorAll('.ingredient').forEach((el) => { const selected = el.dataset.kind === kind; el.classList.toggle('selected', selected); el.setAttribute('aria-pressed', String(selected)); }); try { sfx.tick(); } catch { /* optional */ }
  return true;
}
function nudgePiece(piece) { piece?.classList.remove('is-wiggling'); void piece?.offsetWidth; piece?.classList.add('is-wiggling'); say('bad-drop'); }
function placeTopping(kind, index) {
  if (!active() || state.phase !== 'toppings') return false;
  const slot = els.board.querySelector(`[data-slot="${index}"]`); const piece = els.tray.querySelector(`[data-kind="${kind}"]`);
  if (!slot || !piece || slot.dataset.filled || piece.classList.contains('is-placed') || slot.dataset.kind !== kind) { nudgePiece(piece); return false; }
  slot.dataset.filled = kind; slot.classList.add('is-filled'); slot.append(img(ingredientAsset(kind), 'pizza-slot__topping', kind)); piece.classList.add('is-placed'); piece.classList.remove('selected'); piece.setAttribute('aria-pressed', 'false'); piece.disabled = true; state.placed.push({ kind, slot: index }); state.selectedKind = null; try { sfx.sparkle(); } catch { /* optional */ }
  if (state.placed.length >= toppingCount()) setPhase('bake', voiceKey('bake'));
  return true;
}
function dropOn(index) { return state.selectedKind ? placeTopping(state.selectedKind, index) : (say('nudge'), false); }
function wireToppings() {
  dragCtl = createDragToSlotDom({ getPiece: (el) => el, root: () => els.board, slotSelector: '.pizza-slot:not(.is-filled)', slotPad: 28, ghostClass: 'ingredient-drag-ghost', preventDefaultOnPress: true,
    canStart: () => active() && state.phase === 'toppings', onLift: (piece) => { piece.classList.add('is-lifted'); pickTopping(piece.dataset.kind); },
    onTap: (piece) => pickTopping(piece.dataset.kind), onDrop: (piece, drag) => { piece.classList.remove('is-lifted'); const index = Number(drag.slot?.dataset.slot); if (Number.isInteger(index)) placeTopping(piece.dataset.kind, index); else nudgePiece(piece); }, onCancel: (piece) => piece.classList.remove('is-lifted'),
  });
  els.tray.querySelectorAll('.ingredient').forEach((piece) => {
    const click = (event) => { if (event.detail === 0) pickTopping(piece.dataset.kind); };
    piece.addEventListener('click', click); stageDisposers.push(() => piece.removeEventListener('click', click));
  });
  const down = (event) => { const piece = event.target.closest('.ingredient'); if (piece && els.tray.contains(piece) && !piece.classList.contains('is-placed')) dragCtl.begin(event, piece); };
  els.tray.addEventListener('pointerdown', down); stageDisposers.push(() => els.tray.removeEventListener('pointerdown', down));
}
function beginBake(event = null) {
  if (!active() || state.phase !== 'bake' || state.baking || (needsToppings() && state.placed.length < toppingCount())) return false;
  state.baking = true; els.board.classList.add('is-baking'); say(voiceKey('bake'));
  timers.after(950, completePizza); return true;
}
function wireBake(peel, oven) {
  const reset = () => { peel.style.transform = ''; bakePointer = null; };
  const down = (event) => { if (event.isPrimary === false || !active() || state.phase !== 'bake') return; bakePointer = { id: event.pointerId, startX: event.clientX, startY: event.clientY }; peel.setPointerCapture?.(event.pointerId); };
  const move = (event) => {
    if (!bakePointer || event.pointerId !== bakePointer.id) return;
    const dx = Math.max(-60, Math.min(60, event.clientX - bakePointer.startX));
    const dy = Math.max(0, Math.min(260, bakePointer.startY - event.clientY));
    peel.style.transform = `translate(${dx}px, ${-dy}px)`;
    if (event.cancelable) event.preventDefault();
  };
  const up = (event) => {
    if (!bakePointer || event.pointerId !== bakePointer.id) return;
    const travelled = bakePointer.startY - event.clientY; const ovenRect = oven.getBoundingClientRect();
    const nearOven = ovenRect.height > 0 && event.clientY <= ovenRect.bottom + Math.min(100, ovenRect.height / 2);
    reset(); if (travelled >= 56 || nearOven) beginBake(event);
  };
  peel.addEventListener('pointerdown', down); window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', reset); window.addEventListener('blur', reset);
  stageDisposers.push(onTap(peel, () => beginBake()), () => { peel.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', reset); window.removeEventListener('blur', reset); });
}
function completePizza() {
  if (!active() || state.completed) return false;
  state.completed = true; state.phase = 'complete'; state.step = 'complete'; state.baking = false; nudger.stop(); disposeStage(); renderEnd(); screens.show('end'); tada(); burstConfetti(); say(state.mode === 'swirl' ? 'swirl-cheer' : voiceKey('cheer')); return true;
}
function renderStage() {
  disposeStage(); updatePrompt(); els.board.replaceChildren(); els.tray.replaceChildren();
  const stage = boardShell(); els.board.append(stage);
  if (state.phase === 'press') {
    const dough = makePizza(stage, { dough: true }); stageDisposers.push(onTap(dough, () => patDough(dough)));
  } else {
    const pizza = makePizza(stage);
    if (state.phase === 'sauce') {
      const sauce = document.createElement('div'); sauce.className = 'sauce-surface'; sauce.dataset.target = 'sauce-surface'; sauce.tabIndex = 0; sauce.setAttribute('role', 'button'); sauce.setAttribute('aria-label', 'Spread sauce. Drag around the pizza or press Space.'); pizza.append(sauce);
      renderSauceProgress(sauce);
      wireSauce(sauce);
    }
    if (state.phase === 'toppings' || state.phase === 'bake') {
      state.slots = []; makeSlots(pizza); state.placed.forEach(({ kind, slot }) => { const target = pizza.querySelector(`[data-slot="${slot}"]`); if (target) { target.dataset.filled = kind; target.classList.add('is-filled'); target.append(img(ingredientAsset(kind), 'pizza-slot__topping', kind)); } });
      if (state.phase === 'bake' && state.mode !== 'swirl') pizza.classList.add('pizza-object--parked');
    }
    if (state.mode === 'swirl' && state.phase === 'bake') { const sparkles = document.createElement('div'); sparkles.className = 'completion-sparkles'; pizza.append(img(ingredientAsset('cheese'), 'completion-cheese', 'Cheese'), sparkles); }
  }
  if (state.phase === 'toppings') {
    const kinds = state.recipe.kinds.slice(0, toppingCount()); kinds.forEach((kind) => { const piece = largeTarget(document.createElement('button')); piece.type = 'button'; piece.className = 'ingredient'; piece.dataset.kind = kind; piece.dataset.target = `ingredient-${kind}`; piece.setAttribute('aria-label', kind); piece.setAttribute('aria-pressed', 'false'); piece.append(img(ingredientAsset(kind), 'ingredient__art', kind)); els.tray.append(piece); }); wireToppings();
  }
  if (state.phase === 'bake' && state.mode !== 'swirl') {
    const oven = document.createElement('div'); oven.className = 'oven-object'; oven.dataset.target = 'oven'; oven.setAttribute('aria-label', 'Warm oven');
    const peel = largeTarget(document.createElement('button')); peel.type = 'button'; peel.className = 'peel-control'; peel.dataset.target = 'peel'; peel.setAttribute('aria-label', 'Slide pizza into oven');
    const peelPizza = document.createElement('span'); peelPizza.className = 'peel-control__pizza-wrap'; peelPizza.append(img(asset('pizzaBase'), 'peel-control__pizza', 'Pizza ready to bake'));
    state.placed.forEach(({ kind, slot }) => { const topping = img(ingredientAsset(kind), 'peel-control__topping', ''); topping.style.left = `${POSITIONS[slot][0]}%`; topping.style.top = `${POSITIONS[slot][1]}%`; peelPizza.append(topping); });
    peel.append(img(asset('peel'), 'peel-control__art', 'Pizza peel'), peelPizza);
    stage.append(oven, peel); wireBake(peel, oven);
  }
}
function renderEnd() {
  els.reveal.replaceChildren(); const pizza = document.createElement('div'); pizza.className = 'final-pizza'; pizza.append(img(asset('pizzaBase'), 'final-pizza__base', 'Your pizza'));
  state.placed.forEach(({ kind, slot }) => { const topping = img(ingredientAsset(kind), 'final-pizza__topping', kind); topping.style.left = `${POSITIONS[slot][0]}%`; topping.style.top = `${POSITIONS[slot][1]}%`; pizza.append(topping); }); els.reveal.append(pizza);
  if (state.mode === 'swirl') { const cheese = img(ingredientAsset('cheese'), 'final-pizza__topping final-pizza__topping--cheese', 'Cheese'); cheese.style.left = '50%'; cheese.style.top = '50%'; pizza.append(cheese); }
}
async function startMode(mode) {
  if (!config.modes.some((item) => item.id === mode)) return false;
  return screens.start(() => {
    disposeStage(); resetState(mode); screens.show('play'); state.screen = 'play'; renderStage(); say(`${mode}-intro`); nudger.arm(); return true;
  }, { busy: false });
}
function goSplash() { disposeStage(); nudger.stop(); state.screen = 'splash'; state.phase = 'menu'; state.completed = false; screens.show('splash'); renderSplash(); say('again'); }

const screens = createScreens({ screens: screensEl, initial: 'splash', voice: narrator, onEnter: (name) => { state.screen = name; } });
const nudger = createNudger({ first: 6500, repeat: 9000, onNudge: () => { if (!active()) return; say(state.phase === 'press' ? 'hint-press' : state.phase === 'sauce' ? 'hint-swirl' : state.phase === 'toppings' ? 'nudge' : 'hint-oven'); } });

installKioskGuards();
installUnlockOnGesture({ extra: [() => sfx.unlock(), () => voiceClips.unlock()], onFirst: () => say('welcome') });
const audioReady = voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
preloadImages(Object.values(config.assets.ingredients).concat(Object.values(config.assets).filter((value) => typeof value === 'string')));

const playBack = hudButton('back', goSplash); playBack.dataset.target = 'back';
const playSound = hudButton('sound', soundDebounce(() => say(currentPromptKey()), 600)); playSound.dataset.target = 'sound';
const endBack = hudButton('back', goSplash); endBack.dataset.target = 'back';
const endSound = hudButton('sound', soundDebounce(() => say(state.mode === 'swirl' ? 'swirl-cheer' : voiceKey('cheer')), 600)); endSound.dataset.target = 'sound';
els.playHud.append(playBack, playSound);
els.endHud.append(endBack, endSound);
onTap(mount.querySelector('[data-action="again"]'), () => startMode(state.mode || 'build'));
onTap(mount.querySelector('[data-action="serve"]'), goSplash);
renderSplash();

installDebug({
  gameId: 'cooking-craze', modes: config.modes.map((mode) => mode.id), timers, narrator, sfx, voice: voiceClips,
  ready: audioReady, listModes: () => config.modes.map((mode) => mode.id), start: startMode, startMode, home: goSplash,
  targets: () => [...mount.querySelectorAll('[data-target]')].map((el) => ({ id: el.dataset.target, kind: el.dataset.kind || el.dataset.slot || el.dataset.target, el })),
  state: debugState, getState: debugState,
  getAudioLog: voiceClips.getAudioLog, clearAudioLog: voiceClips.clearAudioLog,
  tap: (id) => { const target = [...mount.querySelectorAll('[data-target]')].find((el) => el.dataset.target === String(id)); target?.click(); return !!target; },
  actions: { pat: () => patDough(), sauce: () => addNextSauceCells(), addSauceProgress: () => addNextSauceCells(), pickTopping, dropOn, bake: beginBake, slideBake: beginBake, complete: completePizza },
  onSeed: (next) => { rng = next; },
});

function debugState() {
  return { screen: state.screen, mode: state.mode, phase: state.phase, step: state.step, presses: state.presses, pressCount: state.presses, sauceCoverage: Math.min(1, state.sauceCells.size / SAUCE_CELL_COUNT), sauceCells: [...state.sauceCells], placedKinds: state.placed.map((item) => item.kind), placedSlots: state.placed.map((item) => item.slot), recipe: state.recipe?.id || null, baking: state.baking, completed: state.completed };
}
