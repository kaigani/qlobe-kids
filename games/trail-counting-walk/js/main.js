import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { tada as celebrate } from '../../../shared/js/celebrate.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { createScreens, wireEndScreen } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createTrailBoard } from './trail-board.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  game: $('#game'),
  splash: $('#splash'),
  play: $('#play'),
  end: $('#end'),
  splashHud: $('#splash-hud'),
  playHud: $('#play-hud'),
  endHud: $('#end-hud'),
  splashBackground: $('#splash-background'),
  titleArt: $('#title-art'),
  pickerPrompt: $('#picker-prompt'),
  routeGrid: $('#route-grid'),
  playBackground: $('#play-background'),
  playHeading: $('#play-heading'),
  playStatus: $('#play-status'),
  trailStage: $('#trail-stage'),
  trailBoard: $('#trail-board'),
  endBackground: $('#end-background'),
  endFlag: $('#end-flag'),
  endFox: $('#end-fox'),
  endTitle: $('#end-title'),
  endMessage: $('#end-message'),
  earnedStars: $('#earned-stars'),
  again: $('#again'),
  choose: $('#choose'),
  againLabel: $('#again-label'),
  chooseLabel: $('#choose-label'),
};

const timers = createTimers();
const state = {
  screen: 'splash',
  mode: null,
  phase: 'splash',
  segmentIndex: -1,
  segmentsTotal: 0,
  counted: 0,
  goal: 0,
  earnedStars: 0,
  wrongAttempts: 0,
  lastAccepted: null,
  currentPrompt: ['select-intro'],
  muted: false,
  seed: 42,
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
};

let rng = mulberry32(state.seed);
let board = null;
let endBurst = null;
let modeCardDisposers = [];

function flattenStrings(value) {
  if (typeof value === 'string') return [value];
  if (!value || typeof value !== 'object') return [];
  return Object.values(value).flatMap(flattenStrings);
}

const allImages = [...flattenStrings(config.assets),
  '../../shared/assets/ui/btn-home.png',
  '../../shared/assets/ui/btn-back.png',
  '../../shared/assets/ui/btn-sound.png',
];

bgm.preload(config.music);
bgm.setVolume(.14);
const voiceReady = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
const ready = Promise.all([voiceReady, preloadImages(allImages)]).then(() => true);

const narrator = createNarrator({
  say: (key, text) => bgm.duckDuring(
    voice.say(key, text),
    { down: .12, downMs: 90, upMs: 320 },
  ),
  stop: voice.stop,
  announcerParent: els.game,
});

const screens = createScreens({
  screens: { splash: els.splash, play: els.play, end: els.end },
  initial: 'splash',
  voice: narrator,
  onExit(name) {
    if (name === 'play') stopPlay();
    if (name === 'end') stopCelebration();
  },
  onEnter(name) {
    state.screen = name;
  },
});

const nudger = createNudger({
  first: config.timing.nudgeFirstMs,
  repeat: config.timing.nudgeRepeatMs,
  onNudge() {
    if (!board || state.phase !== 'active') return;
    const expected = board.getState().expected;
    if (!expected || !board.nudge()) return;
    void speakSequence(['idle-nudge', `count-${expected}`]);
  },
});

function routeById(id) {
  return config.routes.find((route) => route.id === id) || null;
}

function currentRoute() {
  return routeById(state.mode);
}

function routeForBoard(route) {
  return {
    ...route,
    timing: config.timing,
    assets: {
      stone: config.assets.ui.stone,
      activeMat: config.assets.ui.activeMat,
      pennant: config.assets.ui.pennant,
      star: config.assets.ui.star,
      finishFlag: config.assets.ui['finish-flag'],
      foxIdle: config.assets.fox.idle,
      foxHop: config.assets.fox.hop,
    },
  };
}

function rememberPrompt(keys) {
  state.currentPrompt = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
}

function speakKey(key, { remember = true } = {}) {
  if (!key) return Promise.resolve();
  if (remember) rememberPrompt(key);
  return narrator.say(key, config.voice[key]);
}

function speakSequence(keys, { remember = true } = {}) {
  const list = (Array.isArray(keys) ? keys : [keys]).filter(Boolean);
  if (!list.length) return Promise.resolve();
  if (remember) rememberPrompt(list);
  return narrator.saySequence(list.map((key, index) => ({
    key,
    text: config.voice[key],
    gap: index ? 90 : 0,
  })));
}

function replayPrompt() {
  return state.currentPrompt.length > 1
    ? speakSequence(state.currentPrompt, { remember: false })
    : speakKey(state.currentPrompt[0] || 'select-intro', { remember: false });
}

function fillTemplate(template, values) {
  return String(template || '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '');
}

function applyConfig() {
  els.splashBackground.src = config.assets.worlds.select;
  els.titleArt.src = config.assets.ui.title;
  els.pickerPrompt.textContent = config.copy.pickerPrompt;
  els.playHeading.textContent = config.copy.playHeading;
  els.endFlag.src = config.assets.ui['finish-flag'];
  els.endFox.src = config.assets.fox.celebrate;
  els.again.querySelector('img').src = config.assets.ui.button;
  els.choose.querySelector('img').src = config.assets.ui.button;
  els.againLabel.textContent = config.copy.again;
  els.chooseLabel.textContent = config.copy.choose;
}

function renderRouteCards() {
  modeCardDisposers.splice(0).forEach((dispose) => dispose());
  els.routeGrid.replaceChildren();

  for (const route of config.routes) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'route-card';
    button.dataset.target = `mode-${route.id}`;
    button.dataset.role = 'neutral';
    button.setAttribute('aria-label', `${route.title}, ${route.landmark}`);

    const art = document.createElement('img');
    art.className = 'route-card-art';
    art.src = config.assets.ui[route.cardAsset];
    art.alt = '';
    art.draggable = false;

    const badge = document.createElement('img');
    badge.className = 'route-card-badge';
    badge.src = config.assets.ui.pennant;
    badge.alt = '';
    badge.draggable = false;

    const copy = document.createElement('span');
    copy.className = 'route-card-copy';
    const prefix = document.createElement('small');
    prefix.textContent = 'Count to';
    const count = document.createElement('strong');
    count.textContent = String(route.count);
    const landmark = document.createElement('span');
    landmark.textContent = route.landmark;
    copy.append(prefix, count, landmark);
    button.append(art, badge, copy);
    els.routeGrid.append(button);

    modeCardDisposers.push(onTap(button, () => { void startMode(route.id); }, {
      feedback: (event) => {
        event.preventDefault();
        sfx.tick();
        button.classList.add('is-pressed');
        window.setTimeout(() => button.classList.remove('is-pressed'), 170);
      },
    }));
  }
}

function tagHud(button, id, role = 'neutral') {
  button.dataset.target = id;
  button.dataset.role = role;
  return button;
}

function attachHud() {
  const home = tagHud(hudButton('home', () => { window.location.href = '../../'; }), 'catalog-home', 'navigation');
  home.classList.add('qk-hud-top-left');
  const splashSound = tagHud(hudButton('sound', soundDebounce(replayPrompt)), 'splash-listen');
  splashSound.classList.add('qk-hud-top-right');
  els.splashHud.append(home, splashSound);

  const playBack = tagHud(hudButton('back', () => showSplash({ announce: true })), 'back', 'navigation');
  playBack.classList.add('qk-hud-top-left');
  const playSound = tagHud(hudButton('sound', soundDebounce(replayPrompt)), 'play-listen');
  playSound.classList.add('qk-hud-top-right');
  els.playHud.append(playBack, playSound);

  const endBack = tagHud(hudButton('back', () => showSplash({ announce: true })), 'end-back', 'navigation');
  endBack.classList.add('qk-hud-top-left');
  const endSound = tagHud(hudButton('sound', soundDebounce(replayPrompt)), 'end-listen');
  endSound.classList.add('qk-hud-top-right');
  els.endHud.append(endBack, endSound);
}

function updatePlayStatus(number, expected) {
  els.playStatus.textContent = expected
    ? `${number} counted. Find ${expected}.`
    : `${number} counted. This group of five is complete.`;
}

function onStoneAdvance({ number, expected, segmentIndex, segmentDone, totalAccepted }) {
  state.segmentIndex = segmentIndex;
  state.counted = totalAccepted;
  state.earnedStars = totalAccepted;
  state.lastAccepted = number;
  updatePlayStatus(number, expected);
  nudger.poke();
  sfx.pop();
  const spoken = speakKey(`count-${number}`);
  // Keep ordinary steps snappy; only the fifth stone gates a scene change so
  // its spoken number cannot be clipped by the next tableau.
  return segmentDone ? spoken : undefined;
}

function onWrongStone({ number, expected }) {
  state.wrongAttempts += 1;
  els.playStatus.textContent = `That was stone ${Number.isFinite(number) ? number : ''}. Find ${expected} next.`;
  nudger.poke();
  sfx.unpop();
  return speakSequence(['wrong-next', `count-${expected}`]);
}

async function onSegmentComplete({ segmentIndex, routeDone }) {
  const route = currentRoute();
  if (!route || !board) return false;
  nudger.stop();
  state.phase = routeDone ? 'route-clear' : 'segment-clear';
  sfx.sparkle();

  if (routeDone) {
    await timers.wait(config.timing.finishPauseMs);
    if (state.mode !== route.id || !screens.is('play')) return false;
    showEnd();
    return true;
  }

  await timers.wait(config.timing.segmentPauseMs);
  if (state.mode !== route.id || !screens.is('play') || !board) return false;
  const nextIndex = segmentIndex + 1;
  const activeBoard = board;
  const transition = activeBoard.startSegment(nextIndex, { locked: true });
  if (!transition.accepted) return false;
  state.segmentIndex = nextIndex;
  const expected = activeBoard.getState().expected;
  els.playStatus.textContent = `The next trail section begins at ${expected}.`;
  try {
    await speakSequence(['segment-clear', `count-${expected}`]);
  } finally {
    // Keep the fresh tableau visible during its spoken hand-off, but do not
    // accept a child's tap until the line is done. The generation token stops
    // a late completion from unlocking a restarted/different route.
    if (board === activeBoard && state.mode === route.id && screens.is('play')) {
      const unlocked = activeBoard.unlockSegment(transition.generation);
      if (unlocked.accepted) {
        state.phase = 'active';
        nudger.arm();
      }
    }
  }
  return board === activeBoard && state.phase === 'active';
}

function stopPlay() {
  nudger.stop();
  timers.clearAll();
  board?.destroy();
  board = null;
  els.trailBoard.replaceChildren();
}

async function startMode(id) {
  const route = routeById(id);
  if (!route) return { accepted: false, reason: 'unknown-mode' };

  return screens.start(async () => {
    await ready;
    stopPlay();
    narrator.stop();
    state.mode = route.id;
    state.phase = 'active';
    state.segmentIndex = 0;
    state.segmentsTotal = route.segments.length;
    state.counted = 0;
    state.goal = route.count;
    state.earnedStars = 0;
    state.wrongAttempts = 0;
    state.lastAccepted = null;
    state.reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    rememberPrompt(route.introKey);

    els.playBackground.src = config.assets.worlds[route.world];
    screens.show('play', { force: screens.is('play') });
    board = createTrailBoard({
      host: els.trailBoard,
      route: routeForBoard(route),
      timers,
      reducedMotion: state.reducedMotion,
      onAdvance: onStoneAdvance,
      onWrong: onWrongStone,
      onComplete: onSegmentComplete,
    });
    board.startSegment(0);
    bgm.play(config.music, { key: 'trail-counting-walk', fadeInMs: 800, loopFadeOutMs: 2300 });
    nudger.arm();
    void speakKey(route.introKey);
    return getState();
  }, { busy: { accepted: false, reason: 'busy' } });
}

function renderEarnedStars(route) {
  els.earnedStars.replaceChildren();
  els.earnedStars.dataset.segments = String(route.segments.length);
  route.segments.forEach((segment, segmentIndex) => {
    const group = document.createElement('div');
    const rangeStart = segment.start;
    const rangeEnd = rangeStart + segment.stones.length - 1;
    const rangeText = `${rangeStart}\u2013${rangeEnd}`;
    group.className = 'star-segment';
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', `Stars ${rangeStart} through ${rangeEnd} for ${segment.label}`);

    const range = document.createElement('span');
    range.className = 'star-range';
    range.textContent = rangeText;
    range.setAttribute('aria-hidden', 'true');
    group.append(range);

    segment.stones.forEach((_, stoneIndex) => {
      const star = document.createElement('img');
      star.src = config.assets.ui.star;
      star.alt = '';
      star.draggable = false;
      star.style.setProperty('--star-delay', `${(segmentIndex * 5 + stoneIndex) * 55}ms`);
      group.append(star);
    });
    els.earnedStars.append(group);
  });
}

function stopCelebration() {
  if (endBurst) endBurst();
  endBurst = null;
}

function showEnd() {
  const route = currentRoute();
  if (!route) return false;
  els.endBackground.src = config.assets.worlds[route.world];
  els.endTitle.textContent = fillTemplate(config.copy.endTitle, { count: route.count });
  els.endMessage.textContent = config.copy.endMessage;
  els.end.setAttribute('aria-label', `${route.title} complete. ${route.count} stars earned.`);
  renderEarnedStars(route);
  screens.show('end');
  state.phase = 'end';
  state.segmentIndex = route.segments.length - 1;
  rememberPrompt(['route-clear', `count-${route.count}`]);
  stopCelebration();
  endBurst = celebrate({ host: els.end, count: 56, duration: 2600, rng });
  void speakSequence(['route-clear', `count-${route.count}`]);
  return true;
}

function showSplash({ announce = false } = {}) {
  stopPlay();
  narrator.stop();
  state.mode = null;
  state.phase = 'splash';
  state.segmentIndex = -1;
  state.segmentsTotal = 0;
  state.counted = 0;
  state.goal = 0;
  state.earnedStars = 0;
  state.lastAccepted = null;
  rememberPrompt('select-intro');
  screens.show('splash');
  bgm.stop({ fadeOutMs: 500 });
  if (announce) void speakKey('select-intro');
  return true;
}

function muteAll(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  return state.muted;
}

function getState() {
  const trail = board?.getState() || null;
  return {
    screen: screens.current,
    mode: state.mode,
    phase: state.phase,
    segmentIndex: state.segmentIndex,
    segmentsTotal: state.segmentsTotal,
    counted: state.counted,
    goal: state.goal,
    earnedStars: state.earnedStars,
    wrongAttempts: state.wrongAttempts,
    lastAccepted: state.lastAccepted,
    expected: trail?.expected ?? null,
    awaitingInput: screens.is('play') && state.phase === 'active' && trail?.phase === 'active' && !trail.busy,
    prompt: state.currentPrompt.slice(),
    muted: state.muted,
    seed: state.seed,
    timerScale: timers.getScale(),
    reducedMotion: state.reducedMotion,
    trail,
  };
}

function rect(node) {
  const value = node?.getBoundingClientRect();
  if (!value || !(value.width > 0) || !(value.height > 0)) return null;
  return {
    x: Math.round(value.x * 100) / 100,
    y: Math.round(value.y * 100) / 100,
    w: Math.round(value.width * 100) / 100,
    h: Math.round(value.height * 100) / 100,
  };
}

function getLayout() {
  const stones = [...document.querySelectorAll('.trail-stone')]
    .filter((node) => node.getClientRects().length)
    .map((node) => ({ id: node.dataset.target, rect: rect(node) }));
  const minimum = stones.reduce((result, item) => ({
    w: Math.min(result.w, item.rect.w),
    h: Math.min(result.h, item.rect.h),
  }), { w: Infinity, h: Infinity });
  return {
    viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
    orientation: innerWidth >= innerHeight ? 'landscape' : 'portrait',
    screen: screens.current,
    stage: rect(els.trailStage),
    routeGrid: rect(els.routeGrid),
    activeStone: rect(document.querySelector('.trail-stone.is-active')),
    stones,
    minimumStone: stones.length ? minimum : null,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

async function debugTap(targetId) {
  if (String(targetId).startsWith('mode-')) return startMode(String(targetId).slice(5));
  if (String(targetId).startsWith('stone-')) {
    return board ? board.tapStone(targetId) : { accepted: false, reason: 'no-board' };
  }
  if (targetId === 'again') return state.mode ? startMode(state.mode) : { accepted: false, reason: 'no-mode' };
  if (targetId === 'choose' || targetId === 'back' || targetId === 'end-back') {
    showSplash();
    return { accepted: true, state: getState() };
  }
  if (String(targetId).endsWith('listen')) {
    await replayPrompt();
    return { accepted: true, state: getState() };
  }
  const target = [...document.querySelectorAll('[data-target]')]
    .find((node) => node.dataset.target === targetId && node.getClientRects().length);
  if (!target || target.disabled) return { accepted: false, reason: 'unknown-target' };
  target.click();
  await Promise.resolve();
  return { accepted: true, state: getState() };
}

async function debugWinRound() {
  const route = currentRoute();
  if (!route || !board || !screens.is('play')) return { accepted: false, reason: 'no-active-route' };
  let acceptedTaps = 0;
  const deadline = performance.now() + 60000;
  while (screens.is('play') && board && acceptedTaps <= route.count && performance.now() < deadline) {
    const trail = board.getState();
    if (trail.busy || trail.expected == null) {
      await new Promise((resolve) => window.setTimeout(resolve, Math.max(5, timers.ms(40))));
      continue;
    }
    const result = await board.tapStone(trail.expected);
    if (result.accepted) acceptedTaps += 1;
  }
  return getState();
}

applyConfig();
renderRouteCards();
attachHud();
wireEndScreen({
  screens,
  choose: els.choose,
  again: els.again,
  onSplash: () => showSplash({ announce: true }),
  onAgain: () => { if (state.mode) void startMode(state.mode); },
  onPress: () => sfx.tick(),
  feedback: (event) => event.preventDefault(),
  hold: false,
});

installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: (event) => {
    // Buttons already speak their own useful line on pointerup. Greeting from
    // pointerdown as well would double the first sound-button press and briefly
    // talk over a trail intro.
    if (event.target?.closest?.('[data-target], button, a')) return;
    // The synchronous pointerdown already unlocked every channel. Let the
    // manifest finish loading before choosing clip vs. speech fallback.
    void ready.then(() => {
      if (screens.is('splash')) void speakKey('select-intro');
    });
  },
});
installKioskGuards();

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  timers,
  narrator,
  voice,
  sfx,
  listModes: () => config.routes.map(({ id, title, count }) => ({ id, title, count })),
  startMode,
  getState,
  getTargets: () => collectTargets(document),
  tap: debugTap,
  winRound: debugWinRound,
  home: () => { showSplash(); return getState(); },
  mute: muteAll,
  onSeed(nextRng, seed) {
    rng = nextRng;
    state.seed = seed;
  },
  getLayout,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  getBgmStats: bgm.stats,
});

window.addEventListener('pagehide', () => {
  stopPlay();
  stopCelebration();
  bgm.stop({ fadeOutMs: 0 });
  narrator.dispose();
}, { once: true });
