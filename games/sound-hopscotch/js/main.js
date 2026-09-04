import config from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as content from '../../../shared/js/content.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createFreeformBoard } from '../../../shared/js/freeform-board.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clone = (value) => JSON.parse(JSON.stringify(value));
const game = $('#game');
const A = config.assets;
const modeMap = new Map(config.modes.map((mode) => [mode.id, mode]));
const timers = createTimers();
const state = {
  screen: 'splash',
  mode: null,
  round: 0,
  roundsTotal: 0,
  awaitingInput: false,
  hopping: false,
  targetLetter: null,
  theme: 0,
  customCount: 0,
  pathPlaying: false,
  correct: 0,
  attempts: 0,
  seed: 42,
  muted: false,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
};

let rng = Math.random;
let runToken = 0;
let makerBoard = null;
let makerSerial = 0;
const narrator = createNarrator({ say: (key, text) => voiceClips.say(key, text) });

const els = {
  field: $('[data-hop-field]'),
  progress: $('[data-progress]'),
  bunny: $('[data-player-bunny]'),
  feedback: $('[data-feedback]'),
  roundKicker: $('[data-round-kicker]'),
  sparkLayer: $('[data-spark-layer]'),
  makerBoard: $('[data-maker-board]'),
  makerTray: $('[data-maker-tray]'),
  makerBunny: $('[data-maker-bunny]'),
  makerFeedback: $('[data-maker-feedback]'),
  makerSparks: $('[data-maker-sparks]'),
  rewardSparks: $('[data-reward-sparks]'),
  rewardFlowers: $('[data-reward-flowers]'),
  rewardTitle: $('[data-reward-title]'),
};

function flattenAssets(value) {
  if (Array.isArray(value)) return value.flatMap(flattenAssets);
  if (value && typeof value === 'object') return Object.values(value).flatMap(flattenAssets);
  return typeof value === 'string' ? [value] : [];
}

function setImage(node, src) {
  if (!node) return;
  node.src = src || '';
  node.onerror = () => node.removeAttribute('src');
}

function fillHopGuide(node, withEnds = false) {
  if (!node) return;
  const bits = Array.from({ length: 5 }, (_, index) => {
    const marker = document.createElement('img');
    marker.className = 'sh-hop-cue';
    marker.src = A.ui.landing;
    marker.alt = '';
    marker.dataset.step = String(index + 1);
    return marker;
  });
  if (withEnds) {
    const start = document.createElement('span');
    start.className = 'sh-guide-word is-start';
    start.textContent = 'START';
    const finish = document.createElement('span');
    finish.className = 'sh-guide-word is-finish';
    finish.textContent = 'FINISH';
    bits.push(start, finish);
  }
  node.replaceChildren(...bits);
}

function wireStaticArt() {
  $$('[data-asset="background"]').forEach((node) => setImage(node, A.background));
  $$('[data-asset="title"]').forEach((node) => setImage(node, A.title));
  $$('[data-asset="soundPlaque"]').forEach((node) => setImage(node, A.ui.soundPlaque));
  $$('[data-asset="play"]').forEach((node) => setImage(node, A.ui.play));
  $$('[data-asset="star"]').forEach((node) => setImage(node, A.effects.star));
  $$('[data-bunny]').forEach((node) => setImage(node, A.bunny[node.dataset.bunny]));
  $$('[data-action-art="clear"]').forEach((node) => setImage(node, A.pads.yellow));
  $$('[data-action-art="retry"]').forEach((node) => setImage(node, A.pads.lime));
  $$('[data-action-art="choose"]').forEach((node) => setImage(node, A.pads.blue));
  fillHopGuide($('[data-play-guide]'));
  fillHopGuide($('[data-maker-guide]'), true);
  els.rewardFlowers.replaceChildren(...Array.from({ length: 4 }, () => {
    const flower = document.createElement('img');
    flower.src = A.effects.flower;
    flower.alt = '';
    return flower;
  }));
}

function currentTheme() {
  return config.themes[state.theme % config.themes.length];
}

function padAsset(index) {
  const colors = currentTheme().pads;
  return A.pads[colors[index % colors.length]];
}

function applyTheme() {
  const theme = currentTheme();
  document.documentElement.style.setProperty('--theme-glow', theme.glow);
  $$('[data-theme-name]').forEach((node) => { node.textContent = theme.title; });
  $$('[data-theme-art]').forEach((node) => setImage(node, A.ui.palette));
  $$('[data-card-pad]').forEach((node) => setImage(node, padAsset(Number(node.dataset.cardPad))));
  $$('.sh-letter-pad').forEach((node, index) => setImage($('img', node), padAsset(index + state.round)));
  renderMakerTray();
  if (makerBoard) {
    const snapshot = makerBoard.snapshot();
    snapshot.items.forEach((item, index) => { item.src = padAsset(index); });
    makerBoard.load(snapshot);
    decorateMakerPieces();
  }
}

function cycleTheme() {
  state.theme = (state.theme + 1) % config.themes.length;
  applyTheme();
  sfx.pop();
  return currentTheme().id;
}

function sayLine(key) {
  return bgm.duckDuring(narrator.say(key, config.voice[key] || ''));
}

async function sayLetter(letter) {
  const info = content.letterSound(letter);
  const fallback = info?.phonic || String(letter);
  return bgm.duckDuring(voiceClips.sayFile(info?.url || content.letterSoundUrl(letter), fallback));
}

function setFeedback(node, text) {
  if (!node) return;
  node.textContent = text;
  node.classList.remove('is-pop');
  void node.offsetWidth;
  node.classList.add('is-pop');
}

function clearEffects() {
  [els.sparkLayer, els.makerSparks, els.rewardSparks].forEach((layer) => layer?.replaceChildren());
}

function sparkleAt(layer, target, count = 11) {
  if (!layer || state.reducedMotion) return;
  const hostRect = layer.getBoundingClientRect();
  const rect = target?.getBoundingClientRect?.() || hostRect;
  const centerX = ((rect.left + rect.width / 2 - hostRect.left) / Math.max(1, hostRect.width)) * 100;
  const centerY = ((rect.top + rect.height / 2 - hostRect.top) / Math.max(1, hostRect.height)) * 100;
  const bits = Array.from({ length: count }, (_, index) => {
    const bit = document.createElement('img');
    bit.className = 'sh-spark';
    bit.src = index % 3 ? A.effects.star : A.effects.flower;
    bit.alt = '';
    bit.style.setProperty('--x', `${centerX - 13 + (index * 31) % 27}%`);
    bit.style.setProperty('--y', `${centerY - 7 + (index * 17) % 15}%`);
    bit.style.setProperty('--size', `${34 + (index % 4) * 9}px`);
    bit.style.setProperty('--delay', `${(index % 5) * 35}ms`);
    bit.style.setProperty('--dur', `${700 + (index % 4) * 120}ms`);
    bit.style.setProperty('--drift', `${(index % 2 ? -1 : 1) * (28 + (index % 5) * 8)}px`);
    return bit;
  });
  layer.append(...bits);
  window.setTimeout(() => bits.forEach((bit) => bit.remove()), 1400);
}

const screens = createScreens({
  root: game,
  voice: narrator,
  onExit(name) {
    if (name === 'play' || name === 'maker') {
      runToken += 1;
      timers.clearAll();
      nudger.stop();
      state.awaitingInput = false;
      state.hopping = false;
      state.pathPlaying = false;
      clearEffects();
    }
  },
  onEnter(name) {
    state.screen = name;
    if (name === 'splash') {
      bgm.stop({ fadeOutMs: 350 });
      state.mode = null;
      state.targetLetter = null;
      state.roundsTotal = 0;
    }
  },
});

function modeInfo(id = state.mode) {
  return modeMap.get(id) || null;
}

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const layouts = {
  2: [[31, 68, -6], [68, 43, 5]],
  3: [[21, 70, -7], [50, 42, 2], [79, 67, 7]],
  4: [[13, 72, -7], [38, 43, 5], [63, 70, -3], [87, 40, 7]],
};

function renderProgress() {
  const mode = modeInfo();
  if (!mode || !mode.rounds.length) return els.progress.replaceChildren();
  els.progress.replaceChildren(...mode.rounds.map((_, index) => {
    const flower = document.createElement('img');
    flower.src = A.effects.flower;
    flower.alt = index < state.round ? 'Complete' : index === state.round ? 'Current round' : 'Not yet complete';
    flower.className = index < state.round ? 'is-done' : index === state.round ? 'is-now' : '';
    return flower;
  }));
  els.progress.setAttribute('aria-label', `Round ${state.round + 1} of ${mode.rounds.length}`);
}

function resetPlayBunny() {
  setImage(els.bunny, A.bunny.ready);
  els.bunny.classList.remove('is-hopping');
  els.bunny.style.left = '7%';
  els.bunny.style.top = '68%';
}

function renderRound() {
  const mode = modeInfo();
  const round = mode?.rounds[state.round];
  if (!round) return finishMode();
  state.targetLetter = round.letter;
  state.awaitingInput = true;
  state.hopping = false;
  els.field.replaceChildren();
  const guide = document.createElement('div');
  guide.className = 'sh-hop-guide sh-play-guide';
  guide.dataset.playGuide = '';
  guide.setAttribute('aria-hidden', 'true');
  fillHopGuide(guide);
  els.field.append(guide);
  const choices = shuffled(round.choices);
  const layout = layouts[choices.length] || layouts[4];
  choices.forEach((letter, index) => {
    const [x, y, tilt] = layout[index];
    const button = document.createElement('button');
    button.className = 'sh-letter-pad';
    button.dataset.target = letter;
    button.dataset.role = 'letter';
    button.dataset.letter = letter;
    button.dataset.colorIndex = String(index + state.round);
    button.setAttribute('aria-label', `Letter ${letter}`);
    button.style.left = `${x}%`;
    button.style.top = `${y}%`;
    button.style.setProperty('--tilt', `${tilt}deg`);
    const art = document.createElement('img');
    art.src = padAsset(index + state.round);
    art.alt = '';
    const label = document.createElement('span');
    label.className = 'sh-letter';
    label.textContent = letter;
    button.append(art, label);
    els.field.append(button);
  });
  renderProgress();
  els.roundKicker.textContent = `${mode.id === 'match' ? 'Quick ears' : 'Meadow hop'} · ${state.round + 1} of ${mode.rounds.length}`;
  setFeedback(els.feedback, 'Listen, then hop!');
  nudger.arm();
}

function positionBunnyOn(target) {
  const screenRect = screens.el('play').getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  els.bunny.style.left = `${rect.left - screenRect.left + rect.width / 2}px`;
  els.bunny.style.top = `${rect.top - screenRect.top + rect.height * .45}px`;
}

async function promptRound(withLead = false, token = runToken, round = state.round) {
  if (withLead) await sayLine('find');
  if (token !== runToken || state.screen !== 'play' || state.round !== round) return false;
  await sayLetter(state.targetLetter);
  return true;
}

function randomPraise() {
  return `praise${1 + Math.floor(rng() * 3)}`;
}

async function acceptLetter(letter) {
  if (state.screen !== 'play' || !state.awaitingInput || state.hopping) return false;
  const target = $(`.sh-letter-pad[data-letter="${String(letter).toUpperCase()}"]`, els.field);
  if (!target) return false;
  state.attempts += 1;
  nudger.poke();
  if (target.dataset.letter !== state.targetLetter) {
    target.classList.remove('is-wrong');
    void target.offsetWidth;
    target.classList.add('is-wrong');
    setFeedback(els.feedback, 'Good try — listen once more!');
    sfx.unpop();
    const token = runToken;
    const round = state.round;
    await sayLine('nudge');
    if (token === runToken && state.screen === 'play' && round === state.round) await sayLetter(state.targetLetter);
    return false;
  }

  const token = runToken;
  const round = state.round;
  state.awaitingInput = false;
  state.hopping = true;
  state.correct += 1;
  target.classList.add('is-correct');
  setFeedback(els.feedback, config.voice[randomPraise()]);
  setImage(els.bunny, A.bunny.hop);
  els.bunny.classList.add('is-hopping');
  positionBunnyOn(target);
  sfx.whoosh();
  sparkleAt(els.sparkLayer, target);
  await timers.wait(state.reducedMotion ? 0 : 430);
  if (token !== runToken || state.screen !== 'play' || state.round !== round) return false;
  setImage(els.bunny, A.bunny.land);
  els.bunny.classList.remove('is-hopping');
  state.hopping = false;
  sfx.sparkle();
  await sayLine(randomPraise());
  if (token !== runToken || state.screen !== 'play' || state.round !== round) return true;
  await timers.wait(state.reducedMotion ? 0 : 360);
  if (token !== runToken || state.screen !== 'play' || state.round !== round) return true;
  state.round += 1;
  if (state.round >= state.roundsTotal) finishMode();
  else {
    renderRound();
    promptRound(false, runToken, state.round);
  }
  return true;
}

function finishMode() {
  const completedMode = state.mode;
  state.awaitingInput = false;
  state.hopping = false;
  nudger.stop();
  els.rewardTitle.textContent = completedMode === 'match' ? 'Your ears caught every sound!' : 'You hopped across the whole meadow!';
  screens.show('reward');
  setImage(els.bunny, A.bunny.ready);
  sparkleAt(els.rewardSparks, $('.sh-reward-bunny'), 20);
  sfx.tada();
  sayLine(completedMode === 'match' ? 'matchCheer' : 'meadowCheer');
}

function renderMakerTray() {
  if (!els.makerTray) return;
  els.makerTray.replaceChildren(...config.makerLetters.map((letter, index) => {
    const button = document.createElement('button');
    button.className = 'sh-tray-stone';
    button.dataset.target = `add-${letter}`;
    button.dataset.role = 'maker-letter';
    button.dataset.letter = letter;
    button.setAttribute('aria-label', `Add letter ${letter} stone`);
    const art = document.createElement('img');
    art.src = padAsset(index);
    art.alt = '';
    const label = document.createElement('span');
    label.className = 'sh-letter';
    label.textContent = letter;
    button.append(art, label);
    return button;
  }));
}

function saveMakerPath(snapshot) {
  try { localStorage.setItem(config.storageKey, JSON.stringify(snapshot)); } catch { /* storage is optional */ }
}

function loadMakerPath() {
  try {
    const parsed = JSON.parse(localStorage.getItem(config.storageKey) || 'null');
    if (parsed?.format === 'qlobe-freeform-board' && Array.isArray(parsed.items)) return parsed;
  } catch { /* corrupt child-made state starts fresh */ }
  return null;
}

function decorateMakerPieces() {
  if (!makerBoard) return;
  const items = new Map(makerBoard.getItems().map((item) => [item.id, item]));
  const order = new Map([...items.values()]
    .sort((a, b) => a.x - b.x || a.y - b.y)
    .map((item, index) => [item.id, index + 1]));
  $$('.qlobe-freeform-piece', els.makerBoard).forEach((node) => {
    const item = items.get(node.dataset.freeformId);
    if (!item) return;
    node.setAttribute('aria-label', `Letter ${item.meta.letter} stone. Drag to move.`);
    let label = $('.sh-letter', node);
    if (!label) {
      label = document.createElement('span');
      label.className = 'sh-letter';
      node.append(label);
    }
    label.textContent = item.meta.letter;
    let badge = $('.sh-order-badge', node);
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'sh-order-badge';
      const badgeArt = document.createElement('img');
      badgeArt.src = A.effects.flower;
      badgeArt.alt = '';
      const badgeNumber = document.createElement('b');
      badge.append(badgeArt, badgeNumber);
      node.append(badge);
    }
    $('b', badge).textContent = String(order.get(item.id));
  });
  state.customCount = items.size;
}

function setupMaker() {
  makerBoard?.destroy();
  makerBoard = createFreeformBoard(els.makerBoard, {
    reducedMotion: state.reducedMotion,
    onChange(snapshot) {
      state.customCount = snapshot.items.length;
      saveMakerPath(snapshot);
      decorateMakerPieces();
    },
    onGrab() { nudger.poke(); sfx.pop(); },
    onDrop(_, info) { if (info.moved) sfx.tick(); },
  });
  const saved = loadMakerPath();
  if (saved?.items?.length) {
    const safe = clone(saved);
    safe.items = safe.items.slice(0, 5)
      .filter((item) => config.makerLetters.includes(item?.meta?.letter))
      .map((item, index) => ({
        ...item,
        id: `restored-sound-stone-${index + 1}`,
        kind: 'sound-stone',
        src: padAsset(index),
        alt: `Letter ${item.meta.letter} stone`,
        meta: { letter: item.meta.letter },
      }));
    makerSerial = Math.max(makerSerial, safe.items.length);
    makerBoard.load(safe);
  }
  decorateMakerPieces();
  renderMakerTray();
  setImage(els.makerBunny, A.bunny.ready);
  els.makerBunny.classList.remove('is-touring');
  els.makerBunny.style.removeProperty('left');
  els.makerBunny.style.removeProperty('top');
  els.makerBunny.style.removeProperty('bottom');
  setFeedback(els.makerFeedback, state.customCount ? 'Your path is ready to remix!' : 'Choose your first sound stone!');
  nudger.arm();
}

function addMakerLetter(letter) {
  if (state.screen !== 'maker' || state.pathPlaying || !makerBoard) return false;
  if (makerBoard.getItems().length >= 5) {
    setFeedback(els.makerFeedback, 'Five stones make a perfect path!');
    sayLine('makerFull');
    return false;
  }
  const index = makerBoard.getItems().length;
  makerSerial += 1;
  const placed = makerBoard.add({
    id: `sound-stone-${makerSerial}`,
    kind: 'sound-stone',
    src: padAsset(index),
    alt: `Letter ${letter} stone`,
    x: .15 + index * .19,
    y: index % 2 ? .43 : .67,
    size: .18,
    rotation: (index % 2 ? 1 : -1) * (3 + index),
    meta: { letter },
  });
  decorateMakerPieces();
  nudger.poke();
  sfx.pop();
  setFeedback(els.makerFeedback, `${letter} joined your path!`);
  return Boolean(placed);
}

function clearMaker() {
  if (!makerBoard || state.pathPlaying) return false;
  const changed = makerBoard.clear();
  try { localStorage.removeItem(config.storageKey); } catch { /* optional */ }
  state.customCount = 0;
  setImage(els.makerBunny, A.bunny.ready);
  els.makerBunny.classList.remove('is-touring');
  els.makerBunny.style.removeProperty('left');
  els.makerBunny.style.removeProperty('top');
  els.makerBunny.style.removeProperty('bottom');
  setFeedback(els.makerFeedback, 'A fresh meadow!');
  sfx.unpop();
  sayLine('makerClear');
  return changed;
}

function moveMakerBunnyTo(piece) {
  const screenRect = screens.el('maker').getBoundingClientRect();
  const rect = piece.getBoundingClientRect();
  els.makerBunny.classList.add('is-touring');
  els.makerBunny.style.left = `${rect.left - screenRect.left + rect.width / 2}px`;
  els.makerBunny.style.top = `${rect.top - screenRect.top + rect.height * .45}px`;
  els.makerBunny.style.bottom = 'auto';
}

async function playMakerPath() {
  if (state.screen !== 'maker' || state.pathPlaying || !makerBoard) return false;
  const items = makerBoard.getItems().sort((a, b) => a.x - b.x || a.y - b.y);
  if (items.length < 2) {
    setFeedback(els.makerFeedback, 'Add two stones so Bunny can hop!');
    sayLine('makerNudge');
    return false;
  }
  const token = runToken;
  state.pathPlaying = true;
  state.awaitingInput = false;
  nudger.stop();
  setFeedback(els.makerFeedback, 'Your sound path is singing!');
  for (const item of items) {
    if (token !== runToken || state.screen !== 'maker') return false;
    const piece = $$('.qlobe-freeform-piece', els.makerBoard)
      .find((node) => node.dataset.freeformId === item.id);
    if (!piece) continue;
    setImage(els.makerBunny, A.bunny.hop);
    moveMakerBunnyTo(piece);
    sfx.whoosh();
    await timers.wait(state.reducedMotion ? 0 : 430);
    if (token !== runToken || state.screen !== 'maker') return false;
    setImage(els.makerBunny, A.bunny.land);
    sparkleAt(els.makerSparks, piece, 8);
    sfx.sparkle();
    await sayLetter(item.meta.letter);
    await timers.wait(state.reducedMotion ? 0 : 180);
  }
  if (token !== runToken || state.screen !== 'maker') return false;
  setImage(els.makerBunny, A.bunny.cheer);
  sparkleAt(els.makerSparks, els.makerBunny, 18);
  setFeedback(els.makerFeedback, 'That path sounds amazing!');
  sfx.tada();
  await sayLine('makerCheer');
  state.pathPlaying = false;
  state.awaitingInput = true;
  nudger.arm();
  return true;
}

async function startMode(id) {
  const mode = modeInfo(id);
  if (!mode) return false;
  return screens.start(async () => {
    runToken += 1;
    const token = runToken;
    timers.clearAll();
    nudger.stop();
    state.mode = id;
    state.round = 0;
    state.roundsTotal = mode.rounds.length;
    state.targetLetter = null;
    state.awaitingInput = false;
    state.hopping = false;
    state.pathPlaying = false;
    state.correct = 0;
    state.attempts = 0;
    bgm.play(config.music, { key: 'sound-hopscotch', fadeInMs: 450 });
    if (id === 'maker') {
      screens.show('maker');
      setupMaker();
      state.awaitingInput = true;
      sayLine('makerIntro');
      return true;
    }
    screens.show('play');
    resetPlayBunny();
    renderRound();
    const intro = id === 'match' ? 'matchIntro' : 'meadowIntro';
    sayLine(intro).then(() => {
      if (token === runToken && state.screen === 'play' && state.round === 0) promptRound(false, token, 0);
    });
    return true;
  }, { busy: false });
}

function goHome() {
  runToken += 1;
  timers.clearAll();
  nudger.stop();
  narrator.stop();
  state.awaitingInput = false;
  state.pathPlaying = false;
  screens.show('splash');
  return true;
}

function retry() {
  const id = state.mode;
  return id ? startMode(id) : false;
}

function visibleTarget(id) {
  return $$(`[data-target="${id}"]`).find((node) => {
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
}

async function activate(id) {
  if (modeMap.has(id)) return startMode(id);
  if (config.makerLetters.includes(String(id).replace('add-', '')) && String(id).startsWith('add-')) return addMakerLetter(String(id).slice(4));
  if (/^[A-Z]$/i.test(String(id)) && state.screen === 'play') return acceptLetter(String(id).toUpperCase());
  if (id === 'back' || id === 'choose') return goHome();
  if (id === 'retry') return retry();
  if (id === 'theme') return cycleTheme();
  if (id === 'sound' || id === 'listen') return state.targetLetter ? promptRound(false) : false;
  if (id === 'maker-help') return sayLine('makerIntro');
  if (id === 'clear') return clearMaker();
  if (id === 'play-path') return playMakerPath();
  return false;
}

game.addEventListener('click', (event) => {
  const button = event.target.closest('[data-target]');
  if (!button || button.matches('a[href]')) return;
  activate(button.dataset.target);
});

const nudger = createNudger({
  first: 9000,
  repeat: 8000,
  onNudge(count) {
    if (state.screen === 'play' && state.targetLetter) {
      setFeedback(els.feedback, count ? 'The sound cloud can sing again!' : 'Listen once more!');
      promptRound(count === 0);
    } else if (state.screen === 'maker') {
      setFeedback(els.makerFeedback, state.customCount ? 'Drag a stone, or play your path!' : 'Tap a letter stone to begin!');
      sayLine(state.customCount ? 'makerIntro' : 'makerNudge');
    }
  },
});

function debugTargets() {
  const targets = collectTargets(game).map((target) => {
    const node = visibleTarget(target.id);
    const letter = node?.dataset?.role === 'letter' ? node.dataset.letter : null;
    return letter ? { ...target, letter, correct: letter === state.targetLetter } : target;
  });
  if (state.screen === 'play') targets.sort((a, b) => Number(Boolean(b.letter)) - Number(Boolean(a.letter)));
  return targets;
}

function setMuted(on = true) {
  const muted = Boolean(on);
  state.muted = muted;
  voiceClips.setMuted(muted);
  narrator.setMuted(muted);
  bgm.setMuted(muted);
  sfx.setMuted(muted);
  document.querySelectorAll('audio, video').forEach((node) => { node.muted = muted; });
  return muted;
}

wireStaticArt();
applyTheme();
bgm.setVolume(.16);
const ready = Promise.all([
  content.ready(),
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(flattenAssets(A)),
  bgm.preload(config.music),
]).catch(() => undefined);
installUnlockOnGesture({ extra: [bgm.unlock, sfx.unlock] });
installKioskGuards();

installDebug({
  gameId: config.id,
  engine: 'custom-sound-hopscotch',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => clone(state),
  getTargets: debugTargets,
  tap: activate,
  winRound: async () => state.screen === 'play' && state.targetLetter ? acceptLetter(state.targetLetter) : false,
  home: goHome,
  mute: setMuted,
  seed: (number) => {
    const seed = Number.isFinite(Number(number)) ? Number(number) >>> 0 : 42;
    state.seed = seed;
    let value = seed;
    rng = () => {
      value += 0x6D2B79F5;
      let t = value;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    return seed;
  },
  getAudioLog: () => voiceClips.getAudioLog(),
  clearAudioLog: () => voiceClips.clearAudioLog(),
  musicStats: () => bgm.stats(),
  getMakerPath: () => makerBoard?.snapshot() || null,
  playMakerPath,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
});
