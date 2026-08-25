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
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';

const $ = (selector) => document.querySelector(selector);
const KINDS = ['bee', 'butterfly', 'ladybug'];
const KIND_NAMES = { bee: 'bee', butterfly: 'butterfly', ladybug: 'ladybug' };
const MODE_COPY = {
  sort: { kicker: 'MATCH THE VISITORS', title: 'Sort & Stamp', flower: 'daisies' },
  count: { kicker: 'TOUCH EVERY PICTURE', title: 'Tap & Count', flower: 'coneflowers' },
  compare: { kicker: 'READ THE GARDEN', title: 'Garden Compare', flower: 'sunflowers' },
};
const ROUND_DATA = {
  sort: [
    { id: 'sort-1', categories: ['bee', 'butterfly'], visitors: ['bee', 'butterfly', 'bee', 'butterfly'] },
    { id: 'sort-2', categories: KINDS, visitors: ['bee', 'butterfly', 'ladybug', 'bee', 'butterfly'] },
    { id: 'sort-3', categories: KINDS, visitors: ['bee', 'butterfly', 'ladybug', 'bee', 'ladybug', 'butterfly', 'ladybug'] },
  ],
  count: [
    { id: 'count-1', kind: 'bee', total: 3 },
    { id: 'count-2', kind: 'butterfly', total: 4 },
    { id: 'count-3', kind: 'ladybug', total: 6 },
  ],
  compare: [
    { id: 'compare-1', question: 'most', totals: { bee: 2, butterfly: 4, ladybug: 3 } },
    { id: 'compare-2', question: 'fewest', totals: { bee: 5, butterfly: 2, ladybug: 4 } },
    { id: 'compare-3', question: 'same', totals: { bee: 3, butterfly: 3, ladybug: 5 } },
  ],
};

const dom = {
  game: $('#game'),
  splashHome: $('[data-splash-home]'),
  cards: $('[data-mode-cards]'),
  play: $('.play'),
  board: $('[data-board]'),
  tray: $('[data-tray]'),
  prompt: $('[data-prompt]'),
  pips: $('[data-pips]'),
  reward: $('[data-reward-stage]'),
  finale: $('[data-finale-stage]'),
  nextLabel: $('[data-next-label]'),
};
const state = {
  screen: 'splash',
  mode: null,
  roundIndex: 0,
  roundId: null,
  awaitingInput: false,
  locked: false,
  selectedVisitor: null,
  placedIds: [],
  placedByKind: { bee: [], butterfly: [], ladybug: [] },
  countedIds: [],
  compareSelections: [],
  currentVisitors: [],
  completedModes: new Set(),
  lastMode: null,
  muted: false,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
};

const timers = createTimers();
let drag = null;
let rng = mulberry32(42);
const ready = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
bgm.preload(config.music);
const disposeKiosk = installKioskGuards();
const disposeUnlock = installUnlockOnGesture({ extra: [bgm.unlock] });

function asset(name) { return config.assets[name]; }
function currentRound() { return state.mode ? ROUND_DATA[state.mode][state.roundIndex] : null; }
function titleCase(text) { return `${text.charAt(0).toUpperCase()}${text.slice(1)}`; }
function img(src, className = '', alt = '') {
  const node = document.createElement('img');
  node.src = src;
  node.className = className;
  node.alt = alt;
  node.draggable = false;
  return node;
}
function bind(node, action, tick = true) {
  return onTap(node, (event) => {
    event.preventDefault();
    nudge.poke();
    action(event);
  }, { feedback: tick ? () => sfx.tick() : undefined });
}
function speak(key) {
  if (!key || state.muted) return Promise.resolve();
  return bgm.duckDuring(voice.say(key, config.voice[key]));
}
function badgeAsset(mode) { return asset(`badge${titleCase(mode)}`); }

function renderSplashHome() {
  if (dom.splashHome.querySelector('[data-target="home"]')) return;
  const home = document.createElement('a');
  home.className = 'qk-hud-btn qk-hud-home qk-hud-top-left';
  home.href = '../../index.html';
  home.dataset.target = 'home';
  home.dataset.role = 'neutral';
  home.setAttribute('aria-label', 'Home');
  dom.splashHome.append(home);
}
function removeSplashHome() { dom.splashHome.replaceChildren(); }

renderSplashHome();
const screens = createScreens({
  root: dom.game,
  initial: 'splash',
  voice,
  onEnter(name) {
    state.screen = name;
    if (name === 'splash') renderSplashHome();
  },
  onExit(name) {
    if (name === 'splash') removeSplashHome();
    teardownRound();
  },
});

const nudge = createNudger({
  first: 8000,
  repeat: 9000,
  onNudge(count) {
    if (!state.awaitingInput || state.screen !== 'play') return;
    speak(nudgeKey());
    if (count > 0) paintHint();
  },
});

function promptKey() {
  const round = currentRound();
  if (!round) return null;
  if (state.mode === 'sort') return 'sort-prompt';
  if (state.mode === 'count') return `count-${round.kind}`;
  return `compare-${round.question}`;
}
function successKey() {
  const round = currentRound();
  if (!round) return null;
  if (state.mode === 'sort') return 'sort-success';
  if (state.mode === 'count') return 'count-success';
  return `compare-${round.question}-success`;
}
function nudgeKey() {
  const round = currentRound();
  if (state.mode === 'sort') return 'sort-nudge';
  if (state.mode === 'count') return 'count-nudge';
  return round?.question === 'same' ? 'compare-same-nudge' : 'compare-nudge';
}
function promptLabel() {
  const round = currentRound();
  if (!round) return '';
  if (state.mode === 'sort') return round.categories.length === 2 ? 'Match each garden visitor' : 'Sort every garden visitor';
  if (state.mode === 'count') return `Tap and count ${round.total === 1 ? 'the' : 'each'} ${KIND_NAMES[round.kind]}`;
  if (round.question === 'most') return 'Which column has the most?';
  if (round.question === 'fewest') return 'Which column has the fewest?';
  return 'Find two columns with the same number';
}

function renderPips() {
  dom.pips.replaceChildren(...[0, 1, 2].map((index) => {
    const pip = document.createElement('span');
    pip.className = `garden-pip${index < state.roundIndex ? ' is-done' : index === state.roundIndex ? ' is-current' : ''}`;
    pip.setAttribute('aria-hidden', 'true');
    return pip;
  }));
}

function graphToken(kind, index, { countable = false, counted = false } = {}) {
  const token = document.createElement(countable ? 'button' : 'span');
  token.className = `graph-token graph-token--${kind}${counted ? ' is-counted' : ''}`;
  token.style.gridRow = String(6 - index);
  token.dataset.graphIndex = String(index);
  if (countable) {
    token.dataset.target = `count-${index + 1}`;
    token.dataset.role = counted ? 'neutral' : 'correct';
    token.setAttribute('aria-label', `${titleCase(kind)} picture ${index + 1}`);
    token.disabled = counted;
    bind(token, () => countPicture(index));
  }
  token.append(img(asset(kind), '', countable ? '' : `${titleCase(kind)} picture`));
  return token;
}

function answerKinds(round) {
  const values = Object.entries(round.totals);
  if (round.question === 'most') {
    const max = Math.max(...values.map(([, total]) => total));
    return values.filter(([, total]) => total === max).map(([kind]) => kind);
  }
  if (round.question === 'fewest') {
    const min = Math.min(...values.map(([, total]) => total));
    return values.filter(([, total]) => total === min).map(([kind]) => kind);
  }
  const totals = new Map();
  for (const [kind, total] of values) totals.set(total, [...(totals.get(total) || []), kind]);
  return [...totals.values()].find((kinds) => kinds.length === 2) || [];
}

function makeJournal({ totals = {}, activeKinds = KINDS, interaction = 'none' } = {}) {
  const shell = document.createElement('div');
  shell.className = `journal-shell journal-shell--${interaction}`;
  shell.append(img(asset('journal'), 'journal-art', 'Open garden picture-graph journal'));
  const layer = document.createElement('div');
  layer.className = 'graph-layer';
  const round = currentRound();
  const correct = state.mode === 'compare' && round ? answerKinds(round) : [];

  for (const kind of KINDS) {
    const column = document.createElement('div');
    const active = activeKinds.includes(kind);
    column.className = `graph-column graph-column--${kind}${active ? '' : ' is-inactive'}${state.compareSelections.includes(kind) ? ' is-selected' : ''}`;
    column.dataset.kind = kind;
    const stack = document.createElement('div');
    stack.className = 'graph-stack';
    const total = Number(totals[kind] || 0);
    for (let index = 0; index < total; index += 1) {
      const countable = interaction === 'count' && kind === round?.kind;
      stack.append(graphToken(kind, index, { countable, counted: state.countedIds.includes(index) }));
    }
    const key = document.createElement('div');
    key.className = 'graph-key';
    key.append(img(asset(`key${titleCase(kind)}`), '', `${titleCase(kind)} category label`));
    column.append(stack, key);

    if (interaction === 'sort' && active) {
      const hit = document.createElement('button');
      hit.className = 'column-hit';
      hit.dataset.slot = kind;
      hit.dataset.target = `column-${kind}`;
      hit.dataset.role = 'neutral';
      hit.setAttribute('aria-label', `${titleCase(kind)} graph column`);
      bind(hit, () => placeVisitor(state.selectedVisitor, kind));
      column.append(hit);
    } else if (interaction === 'compare') {
      const hit = document.createElement('button');
      hit.className = 'column-hit';
      hit.dataset.target = `column-${kind}`;
      hit.dataset.role = correct.includes(kind) ? 'correct' : 'wrong';
      hit.setAttribute('aria-label', `${titleCase(kind)} column with ${total} pictures`);
      bind(hit, () => chooseColumn(kind));
      column.append(hit);
    }
    layer.append(column);
  }
  shell.append(layer);
  return shell;
}

function renderMenu() {
  dom.cards.replaceChildren();
  for (const mode of config.modes) {
    const button = document.createElement('button');
    button.className = 'mode-card';
    button.dataset.target = `mode-${mode.id}`;
    button.dataset.role = 'neutral';
    button.setAttribute('aria-label', `${mode.name}. ${config.voice[mode.voice]}`);
    button.append(img(asset('modeCard'), 'mode-card-art', ''));
    const content = document.createElement('span');
    content.className = 'mode-card-content';
    const kicker = document.createElement('span');
    kicker.className = 'mode-kicker';
    kicker.textContent = MODE_COPY[mode.id].kicker;
    const picture = img(badgeAsset(mode.id), 'mode-picture', '');
    const name = document.createElement('span');
    name.className = 'mode-name';
    name.textContent = mode.name;
    content.append(kicker, picture, name);
    button.append(content);
    if (state.completedModes.has(mode.id)) {
      const earned = img(badgeAsset(mode.id), 'earned-seal', `${mode.name} page complete`);
      button.append(earned);
    }
    bind(button, () => openMode(mode.id));
    dom.cards.append(button);
  }
}

async function startGame() {
  await ready;
  bgm.play(config.music, { key: 'garden-graphers', fadeInMs: 450, loopFadeOutMs: 2300 });
  screens.show('menu');
  renderMenu();
  await speak('welcome');
  if (state.screen === 'menu') speak('choose-mode');
  return true;
}

async function openMode(id) {
  if (!ROUND_DATA[id]) return false;
  return screens.start(async () => {
    await ready;
    state.mode = id;
    state.roundIndex = 0;
    screens.show('play');
    renderRound();
    return true;
  }, { busy: false });
}

function resetRoundState(round) {
  state.roundId = round.id;
  state.awaitingInput = true;
  state.locked = false;
  state.selectedVisitor = null;
  state.placedIds = [];
  state.placedByKind = { bee: [], butterfly: [], ladybug: [] };
  state.countedIds = [];
  state.compareSelections = [];
  state.currentVisitors = state.mode === 'sort'
    ? shuffle(round.visitors.map((kind, index) => ({ id: `${round.id}-${index}`, kind })), rng)
    : [];
}

function renderRound() {
  teardownRound();
  const round = currentRound();
  if (!round) { finishMode(); return; }
  resetRoundState(round);
  dom.play.dataset.mode = state.mode;
  dom.prompt.textContent = promptLabel();
  dom.board.replaceChildren();
  dom.tray.replaceChildren();
  renderPips();
  if (state.mode === 'sort') renderSort(round);
  else if (state.mode === 'count') renderCount(round);
  else renderCompare(round);
  speak(promptKey());
  nudge.arm();
}

function teardownRound() {
  nudge?.stop?.();
  timers.clearAll();
  drag?.detach();
  drag = null;
  state.awaitingInput = false;
  state.selectedVisitor = null;
}

function renderSort(round) {
  dom.board.append(makeJournal({ totals: {}, activeKinds: round.categories, interaction: 'sort' }));
  for (const visitor of state.currentVisitors) {
    const piece = document.createElement('button');
    piece.className = `visitor-piece visitor-piece--${visitor.kind}`;
    piece.dataset.piece = visitor.id;
    piece.dataset.kind = visitor.kind;
    piece.dataset.target = `visitor-${visitor.id}`;
    piece.dataset.role = 'neutral';
    piece.setAttribute('aria-label', `${titleCase(visitor.kind)} garden visitor`);
    piece.append(img(asset(visitor.kind), '', titleCase(visitor.kind)));
    bind(piece, () => selectVisitor(visitor.id));
    piece.addEventListener('pointerdown', (event) => drag?.begin(event, visitor.id));
    dom.tray.append(piece);
  }
  drag = createDragToSlotDom({
    root: dom.game,
    slotPad: 38,
    hoverClass: 'is-drop-hot',
    grabOffset: 0.35,
    ghostClass: 'visitor-ghost',
    getPiece: (id) => dom.tray.querySelector(`[data-piece="${id}"]`),
    canStart: () => state.awaitingInput && !state.locked,
    onGrab: (piece) => selectVisitor(piece.dataset.piece),
    onDrop: (piece, record) => placeVisitor(piece.dataset.piece, record.slot?.dataset.slot),
    onCancel: () => clearVisitorSelection(),
  });
  if (state.roundIndex === 0) cueFirstSortMove();
}

function cueFirstSortMove() {
  const visitor = dom.tray.querySelector('.visitor-piece');
  if (!visitor) return;
  const key = dom.board.querySelector(`.graph-column--${visitor.dataset.kind} .graph-key`);
  const canCue = () => state.screen === 'play' && state.mode === 'sort'
    && state.awaitingInput && !state.selectedVisitor && state.placedIds.length === 0;
  timers.after(600, () => { if (canCue()) visitor.classList.add('is-tutorial-cue'); });
  timers.after(1250, () => {
    visitor.classList.remove('is-tutorial-cue');
    if (canCue()) key?.classList.add('is-tutorial-cue');
  });
  timers.after(1900, () => key?.classList.remove('is-tutorial-cue'));
}

function selectVisitor(id) {
  if (!state.awaitingInput || state.locked) return false;
  const piece = dom.tray.querySelector(`[data-piece="${id}"]`);
  if (!piece) return false;
  state.selectedVisitor = id;
  dom.game.querySelectorAll('.is-tutorial-cue').forEach((node) => node.classList.remove('is-tutorial-cue'));
  dom.tray.querySelectorAll('.visitor-piece').forEach((node) => node.classList.toggle('is-selected', node === piece));
  dom.board.querySelectorAll('.graph-column').forEach((node) => node.classList.remove('is-hint'));
  return true;
}
function clearVisitorSelection() {
  state.selectedVisitor = null;
  dom.tray.querySelectorAll('.visitor-piece').forEach((node) => node.classList.remove('is-selected'));
}

function placeVisitor(id = state.selectedVisitor, destination) {
  if (!state.awaitingInput || state.locked) return false;
  const piece = id && dom.tray.querySelector(`[data-piece="${id}"]`);
  if (!piece || !destination) return gentleWrong(piece || dom.board.querySelector('.column-hit'));
  const kind = piece.dataset.kind;
  if (kind !== destination) {
    const correct = dom.board.querySelector(`.graph-column--${kind}`);
    correct?.classList.add('is-hint');
    timers.after(800, () => correct?.classList.remove('is-hint'));
    return gentleWrong(piece);
  }
  const column = dom.board.querySelector(`.graph-column--${kind}`);
  const stack = column?.querySelector('.graph-stack');
  const index = state.placedByKind[kind].length;
  state.placedIds.push(id);
  state.placedByKind[kind].push(id);
  state.selectedVisitor = null;
  piece.classList.add('is-stamping');
  piece.disabled = true;
  timers.after(state.reducedMotion ? 1 : 160, () => piece.remove());
  const token = graphToken(kind, index);
  token.classList.add('is-arriving');
  stack?.append(token);
  column?.classList.add('is-right');
  timers.after(520, () => column?.classList.remove('is-right'));
  sfx.pop();
  if (state.placedIds.length === state.currentVisitors.length) {
    timers.after(state.reducedMotion ? 20 : 420, completeRound);
  }
  return true;
}

function renderCount(round) {
  const totals = { bee: 0, butterfly: 0, ladybug: 0, [round.kind]: round.total };
  dom.board.append(makeJournal({ totals, activeKinds: [round.kind], interaction: 'count' }));
  const helper = document.createElement('div');
  helper.className = 'count-helper';
  helper.append(img(asset(round.kind), '', ''));
  const words = document.createElement('span');
  words.textContent = `Touch each ${KIND_NAMES[round.kind]}`;
  helper.append(words);
  dom.tray.append(helper);
}

function countPicture(index) {
  const round = currentRound();
  if (!round || !state.awaitingInput || state.locked || state.countedIds.includes(index)) return false;
  state.countedIds.push(index);
  const token = dom.board.querySelector(`[data-graph-index="${index}"]`);
  token?.classList.add('is-counted');
  if (token) { token.disabled = true; token.dataset.role = 'neutral'; }
  sfx.pop();
  speak(`number-${state.countedIds.length}`);
  if (state.countedIds.length === round.total) {
    const reveal = document.createElement('div');
    reveal.className = 'number-reveal';
    reveal.setAttribute('aria-label', `Total ${round.total}`);
    reveal.append(img(asset('actionButton'), '', ''));
    const number = document.createElement('span');
    number.textContent = String(round.total);
    reveal.append(number);
    dom.board.querySelector('.journal-shell')?.append(reveal);
    timers.after(state.reducedMotion ? 20 : 700, completeRound);
  }
  return true;
}

function renderCompare(round) {
  dom.board.append(makeJournal({ totals: round.totals, activeKinds: KINDS, interaction: 'compare' }));
  const helper = document.createElement('div');
  helper.className = 'compare-helper';
  const promptBadge = round.question === 'same' ? 'badgeCount' : 'badgeCompare';
  helper.append(img(asset(promptBadge), '', ''));
  const words = document.createElement('span');
  words.textContent = round.question === 'same' ? 'Tap a matching pair' : `Find the ${round.question}`;
  helper.append(words);
  dom.tray.append(helper);
}

function chooseColumn(kind) {
  const round = currentRound();
  if (!round || !state.awaitingInput || state.locked) return false;
  const correct = answerKinds(round);
  const column = dom.board.querySelector(`.graph-column--${kind}`);
  if (round.question !== 'same') {
    if (!correct.includes(kind)) return gentleWrong(column);
    state.compareSelections = [kind];
    column?.classList.add('is-selected', 'is-blooming');
    completeRound();
    return true;
  }
  if (state.compareSelections.includes(kind)) return true;
  state.compareSelections.push(kind);
  column?.classList.add('is-selected');
  sfx.pop();
  if (state.compareSelections.length < 2) return true;
  const chosen = [...state.compareSelections].sort().join('|');
  const answer = [...correct].sort().join('|');
  if (chosen === answer) {
    correct.forEach((answerKind) => dom.board.querySelector(`.graph-column--${answerKind}`)?.classList.add('is-blooming'));
    completeRound();
    return true;
  }
  state.locked = true;
  sfx.boing();
  speak('compare-same-nudge');
  timers.after(state.reducedMotion ? 30 : 720, () => {
    dom.board.querySelectorAll('.graph-column').forEach((node) => node.classList.remove('is-selected'));
    state.compareSelections = [];
    state.locked = false;
    nudge.poke();
  });
  return false;
}

function gentleWrong(node) {
  if (!state.awaitingInput || state.locked) return false;
  sfx.boing();
  node?.classList.add('is-wrong');
  speak(nudgeKey());
  timers.after(520, () => node?.classList.remove('is-wrong'));
  nudge.poke();
  return false;
}

function paintHint() {
  let target = null;
  if (state.mode === 'sort') {
    const piece = state.selectedVisitor && dom.tray.querySelector(`[data-piece="${state.selectedVisitor}"]`);
    target = piece || dom.tray.querySelector('.visitor-piece');
    const kind = piece?.dataset.kind;
    if (kind) dom.board.querySelector(`.graph-column--${kind}`)?.classList.add('is-hint');
  } else if (state.mode === 'count') {
    target = dom.board.querySelector('.graph-token:not(.is-counted)');
  } else {
    target = dom.board.querySelector('[data-role="correct"]');
  }
  target?.classList.add('is-hint');
  timers.after(900, () => {
    target?.classList.remove('is-hint');
    dom.board.querySelectorAll('.graph-column').forEach((node) => node.classList.remove('is-hint'));
  });
}

function completeRound() {
  if (!state.awaitingInput || state.locked) return false;
  state.awaitingInput = false;
  state.locked = true;
  nudge.stop();
  dom.board.querySelector('.journal-shell')?.classList.add('is-round-complete');
  sfx.tada();
  speak(successKey());
  timers.after(state.reducedMotion ? 40 : 1350, () => {
    state.roundIndex += 1;
    renderRound();
  });
  return true;
}

function modeRewardTotals(mode) {
  if (mode === 'sort') return { bee: 2, butterfly: 2, ladybug: 3 };
  if (mode === 'count') return { bee: 3, butterfly: 4, ladybug: 6 };
  return { bee: 3, butterfly: 3, ladybug: 5 };
}

function rewardJournal(mode, finale = false) {
  const wrap = document.createElement('div');
  wrap.className = `reward-journal reward-journal--${mode}${finale ? ' is-finale' : ''}`;
  const journal = makeJournal({ totals: modeRewardTotals(mode), activeKinds: KINDS, interaction: 'none' });
  const flowerNames = finale ? ['daisies', 'coneflowers', 'sunflowers'] : [MODE_COPY[mode].flower];
  const blooms = document.createElement('div');
  blooms.className = 'reward-blooms';
  for (const name of flowerNames) blooms.append(img(asset(name), `reward-flower reward-flower--${name}`, ''));
  journal.append(blooms);
  wrap.append(journal);
  return wrap;
}

function renderCompletion(mode) {
  dom.reward.replaceChildren();
  const ari = img(asset('ariCelebrate'), 'ari-celebrate', 'Ari celebrates');
  const copy = document.createElement('div');
  copy.className = 'reward-copy';
  copy.append(img(asset('promptBanner'), '', ''));
  const heading = document.createElement('h1');
  heading.textContent = `${MODE_COPY[mode].title} bloomed!`;
  const detail = document.createElement('p');
  detail.textContent = mode === 'sort' ? 'Every visitor found its picture.' : mode === 'count' ? 'Every picture got one careful count.' : 'The garden graph told its story.';
  copy.append(heading, detail);
  const badge = img(badgeAsset(mode), 'reward-badge', `${MODE_COPY[mode].title} badge earned`);
  dom.reward.append(rewardJournal(mode), ari, copy, badge);
  dom.nextLabel.textContent = state.completedModes.size === config.modes.length ? 'Open the Guest Book' : 'Next Garden Page';
}

function finishMode() {
  const mode = state.mode;
  state.completedModes.add(mode);
  state.lastMode = mode;
  state.locked = true;
  renderCompletion(mode);
  screens.show('complete');
  speak(`mode-${mode}-complete`);
}

function renderFinale() {
  dom.finale.replaceChildren();
  const title = img(asset('title'), 'finale-title', 'Garden Graphers');
  const garden = rewardJournal('compare', true);
  const ari = img(asset('ariCelebrate'), 'ari-finale', 'Ari celebrates the Great Garden Guest Book');
  const badges = document.createElement('div');
  badges.className = 'finale-badges';
  for (const mode of config.modes) badges.append(img(badgeAsset(mode.id), '', `${mode.name} badge`));
  const praise = document.createElement('p');
  praise.className = 'finale-praise';
  praise.textContent = 'Ari’s Great Garden Guest Book';
  dom.finale.append(title, garden, ari, badges, praise);
}

function showFinale() {
  renderFinale();
  screens.show('finale');
  speak('finale');
  return true;
}

function showMenu({ narrate = false } = {}) {
  screens.show('menu');
  renderMenu();
  if (narrate) speak('choose-mode');
  return true;
}

function back() {
  if (state.screen === 'menu') {
    bgm.stop();
    screens.show('splash');
    return true;
  }
  if (state.screen === 'splash') return false;
  return showMenu();
}

function resetSession() {
  state.completedModes.clear();
  state.mode = null;
  state.roundIndex = 0;
  showMenu();
  speak('again');
  return true;
}

function replayCurrent() {
  if (state.screen === 'splash') return speak('welcome');
  if (state.screen === 'menu') return speak('choose-mode');
  if (state.screen === 'play') return speak(promptKey());
  if (state.screen === 'complete') return speak(`mode-${state.lastMode}-complete`);
  return speak('finale');
}

document.querySelectorAll('[data-action]').forEach((button) => bind(button, () => {
  const action = button.dataset.action;
  if (action === 'start') startGame();
  else if (action === 'back') back();
  else if (action === 'replay') replayCurrent();
  else if (action === 'menu') showMenu();
  else if (action === 'next') {
    const next = config.modes.find((mode) => !state.completedModes.has(mode.id));
    if (next) openMode(next.id);
    else showFinale();
  } else if (action === 'again') resetSession();
}));

function debugTap(id) {
  const target = document.querySelector(`[data-target="${id}"]`);
  if (!target) return false;
  target.click();
  return true;
}
function debugWinRound() {
  const round = currentRound();
  if (!round || state.screen !== 'play') return false;
  if (state.mode === 'sort') {
    for (const visitor of [...state.currentVisitors]) {
      if (!state.placedIds.includes(visitor.id)) placeVisitor(visitor.id, visitor.kind);
    }
    return true;
  }
  if (state.mode === 'count') {
    for (let index = 0; index < round.total; index += 1) countPicture(index);
    return true;
  }
  const answers = answerKinds(round);
  answers.forEach((kind) => chooseColumn(kind));
  return true;
}

preloadImages(Object.values(config.assets));
renderMenu();
installDebug({
  version: 1,
  gameId: config.id,
  engine: 'bespoke-picture-graph-dom',
  ready,
  timers,
  voice,
  narrator: voice,
  sfx,
  root: dom.game,
  listModes: () => config.modes.map(({ id, name }) => ({ id, title: name })),
  startMode: openMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    roundIndex: state.roundIndex,
    roundId: state.roundId,
    awaitingInput: state.awaitingInput,
    locked: state.locked,
    selectedVisitor: state.selectedVisitor,
    placedIds: [...state.placedIds],
    placedByKind: Object.fromEntries(KINDS.map((kind) => [kind, [...state.placedByKind[kind]]])),
    countedIds: [...state.countedIds],
    compareSelections: [...state.compareSelections],
    completedModes: [...state.completedModes],
    muted: state.muted,
    reducedMotion: state.reducedMotion,
  }),
  mute: (on = true) => {
    state.muted = Boolean(on);
    voice.setMuted(state.muted);
    bgm.setMuted(state.muted);
    sfx.setMuted(state.muted);
    return state.muted;
  },
  onSeed: (next) => { rng = next; },
  tap: debugTap,
  winRound: debugWinRound,
  home: back,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  getAudioState: () => ({ bgm: bgm.stats(), voiceMuted: voice.isMuted(), sfxMuted: sfx.isMuted() }),
  actions: {
    startGame,
    openMode,
    selectVisitor,
    placeVisitor,
    countPicture,
    chooseColumn,
    completeRound,
    showMenu,
    showFinale,
    back,
    resetSession,
  },
});

window.addEventListener('pagehide', () => {
  teardownRound();
  bgm.stop({ fadeOutMs: 0 });
  disposeKiosk();
  disposeUnlock();
}, { once: true });
