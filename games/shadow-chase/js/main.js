import loadConfig from '../config.js';
import * as bgm from '../../../shared/js/bgm.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { escapeHtml } from '../../../shared/js/dom.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { createBag, createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';

const app = document.getElementById('game');
const timers = createTimers();
const roundBag = createBag();
const activeTargets = new Map();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const SHOW_STOPS = [
  { id: 'morning', t: 0.08, voiceKey: 'show-morning', label: 'Morning' },
  { id: 'noon', t: 0.5, voiceKey: 'show-noon', label: 'Noon' },
  { id: 'evening', t: 0.92, voiceKey: 'show-evening', label: 'Evening' },
];
const SHARED_BUTTONS = {
  back: '../../shared/assets/ui/btn-back.png',
  play: '../../shared/assets/ui/btn-play.png',
};

const state = {
  screen: 'loading',
  mode: null,
  phase: 'loading',
  round: 0,
  roundsTotal: 4,
  toyId: null,
  choiceIds: [],
  targetToyId: null,
  targetSunId: null,
  targetSunT: null,
  sunT: 0.5,
  lightMoment: 'noon',
  sunPlayback: false,
  showVisited: { morning: false, noon: false, evening: false },
  wrongAttempts: 0,
  rewards: [],
  accepting: false,
  complete: false,
  muted: false,
  seed: 42,
  assetErrors: [],
  currentVoiceKey: null,
};

let config = null;
let screens = null;
let rng = mulberry32(state.seed);
let roundPlan = [];
let showToyChoices = [];
let targetHoldTimer = null;
let playbackToken = 0;
let animationFrame = null;
let animationResolve = null;
let playbackDelayId = null;
let playbackDelayResolve = null;
let musicStarted = false;
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });

const nudger = createNudger({
  first: 10000,
  repeat: 18000,
  onNudge: (count) => {
    if (state.screen !== 'play' || !state.accepting) return;
    const target = app.querySelector(
      state.phase === 'match' ? '.shadow-choice:not(.is-wrong)'
        : state.phase === 'show-choose' ? '.show-toy-choice'
          : '.sun-handle',
    );
    target?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }],
      { duration: reducedMotion.matches ? 1 : 720, easing: 'ease-out' },
    );
    speak(count === 0 && state.currentVoiceKey ? state.currentVoiceKey : 'idle');
  },
});

installDebug({
  gameId: 'shadow-chase',
  engine: 'custom-shadow-theatre',
  ready,
  listModes: () => (config?.modes || []).map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: (id) => startMode(id),
  getState: () => snapshot(),
  tap: (id) => debugTap(id),
  winRound: () => winRound(),
  home: () => showSplash(),
  timers,
  voice,
  sfx,
  onSeed: (nextRng, seed) => {
    rng = nextRng;
    state.seed = seed;
  },
  modes: () => (config?.modes || []).map(({ id, title, skill }) => ({ id, title, skill })),
  state: () => snapshot(),
  snapshot: () => snapshot(),
  answer: (id) => handleShadowChoice(id),
  dragSun: (t) => setSun(t, { source: 'debug' }),
  setSun: (t) => setSun(t, { source: 'debug' }),
  previewSun: (t) => setSun(t, { source: 'debug-preview', check: false }),
  stepSun: (direction) => stepSun(direction),
  togglePlayback: () => togglePlayback(),
  getAudioLog: () => voice.getAudioLog(),
});

boot().catch((error) => {
  console.error('[shadow-chase] boot failed', error);
  state.phase = 'error';
  state.assetErrors.push(String(error?.message || error));
  app.innerHTML = '<p class="fatal-message">Shadow Chase could not open. Please ask a grown-up to try again.</p>';
  readyResolve({ ok: false, error: String(error?.message || error) });
});

async function boot() {
  config = await loadConfig();
  state.roundsTotal = config.rounds;
  bgm.preload(config.assets.bgm);
  bgm.setVolume(0.16);
  await voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
  buildShell();
  wireStaticControls();
  screens = createScreens({ root: app, initial: 'splash', voice });
  showSplash();

  installUnlockOnGesture({
    extra: [bgm.unlock],
    onFirst: () => startMusic(),
  });
  installKioskGuards();

  state.assetErrors = await preloadRequired(requiredImageUrls());
  if (state.assetErrors.length) {
    console.error('[shadow-chase] required art failed', state.assetErrors);
  }
  readyResolve({ ok: state.assetErrors.length === 0, assetErrors: [...state.assetErrors] });

  window.addEventListener('pagehide', () => {
    clearInteraction();
    voice.stop();
    bgm.stop({ fadeOutMs: 0 });
  }, { once: true });
}

function buildShell() {
  app.innerHTML = `
    <section class="qk-screen game-screen splash-screen" data-qk-screen="splash">
      ${hudMarkup('home', 'Home', 'splash-home')}
      ${hudMarkup('sound', 'Hear the choices', 'sound')}
      <img class="title-lockup" src="${config.assets.title}" alt="Shadow Chase" />
      <p class="splash-kicker">Pick a shadow game</p>
      <div class="mode-shelf" aria-label="Shadow games"></div>
      <div class="splash-toy-shelf" aria-hidden="true"></div>
    </section>
    <section class="qk-screen game-screen play-screen" data-qk-screen="play" hidden>
      <div class="stage-lighting" aria-hidden="true">
        <img data-stage-light="morning" src="${config.assets.stageMorning}" alt="" />
        <img data-stage-light="noon" src="${config.assets.stageNoon}" alt="" />
        <img data-stage-light="evening" src="${config.assets.stageEvening}" alt="" />
      </div>
      ${hudMarkup('back', 'Back to game menu', 'back')}
      ${hudMarkup('sound', 'Hear the prompt again', 'sound')}
      <div class="play-progress" aria-hidden="true"></div>
      <p class="play-prompt" role="status"></p>
      <div class="play-host"></div>
    </section>
    <section class="qk-screen game-screen end-screen" data-qk-screen="end" hidden>
      ${hudMarkup('back', 'Back to game menu', 'back')}
      ${hudMarkup('sound', 'Hear the celebration again', 'sound')}
      <div class="end-host"></div>
    </section>
    <p class="visually-hidden" id="shadow-chase-live" aria-live="polite"></p>
  `;
}

function hudMarkup(kind, label, target) {
  return `<button class="qk-hud-btn qk-hud-${kind} ${kind === 'sound' ? 'qk-hud-top-right' : 'qk-hud-top-left'}"
    type="button" aria-label="${escapeHtml(label)}" data-target="${target}"></button>`;
}

function wireStaticControls() {
  const splash = app.querySelector('[data-qk-screen="splash"]');
  const play = app.querySelector('[data-qk-screen="play"]');
  const end = app.querySelector('[data-qk-screen="end"]');
  wireStatic(splash.querySelector('[data-target="splash-home"]'), () => { window.location.href = '../../'; });
  wireStatic(splash.querySelector('[data-target="sound"]'), () => speak('welcome'));
  wireStatic(play.querySelector('[data-target="back"]'), () => showSplash({ speakWelcome: true }), 'unpop');
  wireStatic(play.querySelector('[data-target="sound"]'), () => repeatPrompt());
  wireStatic(end.querySelector('[data-target="back"]'), () => showSplash({ speakWelcome: true }), 'unpop');
  wireStatic(end.querySelector('[data-target="sound"]'), () => speak('all-done'));
}

function wireStatic(element, action, sfxName = 'tick') {
  onTap(element, action, { feedback: () => feedback(sfxName) });
}

function feedback(sfxName = 'tick') {
  unlockAll([bgm.unlock]);
  startMusic();
  if (sfxName && typeof sfx[sfxName] === 'function') sfx[sfxName]();
  nudger.poke();
}

function startMusic() {
  if (musicStarted || !config) return;
  musicStarted = true;
  bgm.play(config.assets.bgm, { key: 'shadow-chase', fadeInMs: 900, loopFadeOutMs: 2300 });
}

function requiredImageUrls() {
  const urls = [
    config.assets.stage,
    config.assets.stageMorning,
    config.assets.stageNoon,
    config.assets.stageEvening,
    config.assets.title,
    config.assets.sun,
    config.assets.sunTrack,
    config.assets.star,
    config.assets.plaque,
    config.assets.button,
    config.assets.pedestal,
    config.assets.roundButton,
    config.assets.pause,
  ];
  for (const toy of config.toys) {
    urls.push(toySrc(toy.id), shadowSrc(toy.id));
  }
  return urls;
}

function preloadRequired(urls) {
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(null);
    image.onerror = () => resolve(url);
    image.src = url;
  }))).then((results) => results.filter(Boolean));
}

function toySrc(id) { return `./assets/toys/${id}.webp`; }
function shadowSrc(id) { return `./assets/shadows/${id}.webp`; }

function clearInteraction({ stopVoice = true } = {}) {
  playbackToken += 1;
  state.sunPlayback = false;
  settlePlaybackWork();
  if (targetHoldTimer != null) timers.clear(targetHoldTimer);
  targetHoldTimer = null;
  timers.clearAll();
  nudger.stop();
  roundBag.run();
  activeTargets.clear();
  if (stopVoice) voice.stop();
}

function activateHud(screenName) {
  activeTargets.clear();
  if (screenName === 'splash') {
    activeTargets.set('splash-home', () => { window.location.href = '../../'; });
    activeTargets.set('home', () => { window.location.href = '../../'; });
    activeTargets.set('sound', () => speak('welcome'));
  } else if (screenName === 'play') {
    activeTargets.set('back', () => showSplash({ speakWelcome: true }));
    activeTargets.set('sound', () => repeatPrompt());
  } else if (screenName === 'end') {
    activeTargets.set('back', () => showSplash({ speakWelcome: true }));
    activeTargets.set('sound', () => speak('all-done'));
  }
}

function registerTap(element, id, action, sfxName = 'pop') {
  if (!element) return;
  element.dataset.target = id;
  activeTargets.set(id, action);
  roundBag.add(onTap(element, action, { feedback: () => feedback(sfxName) }));
}

function setPrompt(text, voiceKey) {
  const prompt = app.querySelector('.play-prompt');
  if (prompt) prompt.textContent = text || '';
  state.currentVoiceKey = voiceKey || null;
  const live = app.querySelector('#shadow-chase-live');
  if (live) live.textContent = text || '';
}

function speak(key, fallback = config?.voice?.[key] || '') {
  if (!key || !config) return Promise.resolve();
  return bgm.duckDuring(voice.say(key, fallback), { down: 0.22, downMs: 100, upMs: 320 });
}

function repeatPrompt() {
  return speak(state.currentVoiceKey || (state.screen === 'end' ? 'all-done' : 'welcome'));
}

function showSplash({ speakWelcome = false } = {}) {
  if (!config || !screens) return false;
  clearInteraction();
  screens.show('splash');
  state.screen = 'splash';
  state.mode = null;
  state.phase = 'choose-mode';
  state.round = 0;
  state.toyId = null;
  state.targetToyId = null;
  state.targetSunId = null;
  state.targetSunT = null;
  state.choiceIds = [];
  state.rewards = [];
  state.accepting = true;
  state.complete = false;
  state.currentVoiceKey = 'welcome';
  resetStageLighting();
  activateHud('splash');
  renderModeShelf();
  if (speakWelcome) speak('welcome');
  return true;
}

function renderModeShelf() {
  const host = app.querySelector('.mode-shelf');
  host.innerHTML = config.modes.map((mode) => `
    <button class="mode-card" type="button" data-mode="${mode.id}" aria-label="${escapeHtml(mode.title)}">
      <img class="physical-base" src="${config.assets.plaque}" alt="" />
      <span class="mode-art mode-art-${mode.id}" aria-hidden="true">${modeArt(mode.id)}</span>
      <span class="mode-title">${escapeHtml(mode.title)}</span>
    </button>
  `).join('');
  host.querySelectorAll('.mode-card').forEach((button) => {
    const id = button.dataset.mode;
    registerTap(button, `mode-${id}`, () => startMode(id));
  });
  const shelf = app.querySelector('.splash-toy-shelf');
  shelf.innerHTML = ['rabbit', 'squirrel', 'turtle'].map((id) => (
    `<img class="splash-toy splash-toy-${id}" src="${toySrc(id)}" alt="" />`
  )).join('');
}

function modeArt(modeId) {
  if (modeId === 'match') {
    return `<img class="mini-toy" src="${toySrc('rabbit')}" alt="" />
      <img class="mini-shadow" src="${shadowSrc('rabbit')}" alt="" />`;
  }
  if (modeId === 'sun') {
    return `<img class="mini-track" src="${config.assets.sunTrack}" alt="" />
      <img class="mini-sun" src="${config.assets.sun}" alt="" />
      <img class="mini-shadow mini-shadow-long" src="${shadowSrc('squirrel')}" alt="" />`;
  }
  return `<img class="mini-show-toy" src="${toySrc('turtle')}" alt="" />
    <img class="mini-sun mini-sun-left" src="${config.assets.sun}" alt="" />
    <img class="mini-sun mini-sun-middle" src="${config.assets.sun}" alt="" />
    <img class="mini-sun mini-sun-right" src="${config.assets.sun}" alt="" />`;
}

async function startMode(modeId) {
  await ready;
  if (!config || !screens) return false;
  const mode = config.modes.find((item) => item.id === modeId);
  if (!mode) return false;
  return screens.start(async () => {
    clearInteraction();
    screens.show('play');
    state.screen = 'play';
    state.mode = modeId;
    state.phase = 'starting';
    state.round = 0;
    state.roundsTotal = mode.rounds;
    state.rewards = [];
    state.wrongAttempts = 0;
    state.complete = false;
    state.accepting = false;
    resetStageLighting();
    activateHud('play');

    if (modeId === 'match') {
      roundPlan = makeMatchPlan();
      renderMatchRound();
    } else if (modeId === 'sun') {
      roundPlan = makeSunPlan();
      renderSunRound();
    } else {
      showToyChoices = shuffle(config.toys, rng).slice(0, 3);
      state.showVisited = { morning: false, noon: false, evening: false };
      renderShowChooser();
    }
    return true;
  }, { busy: false });
}

function makeMatchPlan() {
  const selected = shuffle(config.toys, rng).slice(0, config.rounds);
  return selected.map((toy) => {
    const distractors = shuffle(config.toys.filter((item) => item.id !== toy.id), rng).slice(0, 2);
    return { toy, choices: shuffle([toy, ...distractors], rng) };
  });
}

function makeSunPlan() {
  const targets = shuffle(config.sunTargets, rng).slice(0, config.rounds);
  const toys = shuffle(config.toys, rng).slice(0, config.rounds);
  return targets.map((target, index) => ({ target, toy: toys[index] }));
}

function resetPlayHost() {
  clearInteraction();
  state.screen = 'play';
  activateHud('play');
  const host = app.querySelector('.play-host');
  host.className = 'play-host';
  host.innerHTML = '';
  return host;
}

function progressMarkup(done = state.round, total = state.roundsTotal) {
  return Array.from({ length: total }, (_, index) => (
    `<img class="progress-star ${index < done ? 'is-earned' : index === done ? 'is-current' : ''}"
      src="${config.assets.star}" alt="" />`
  )).join('');
}

function updateProgress(done = state.round, total = state.roundsTotal) {
  app.querySelector('.play-progress').innerHTML = progressMarkup(done, total);
}

function renderMatchRound() {
  const host = resetPlayHost();
  const plan = roundPlan[state.round];
  state.phase = 'match';
  state.toyId = plan.toy.id;
  state.targetToyId = plan.toy.id;
  state.targetSunId = null;
  state.targetSunT = null;
  state.choiceIds = plan.choices.map((toy) => toy.id);
  state.wrongAttempts = 0;
  state.accepting = true;
  state.currentVoiceKey = plan.toy.promptKey;
  host.classList.add('match-host');
  host.innerHTML = `
    <div class="match-toy-zone">
      <img class="toy-pedestal" src="${config.assets.pedestal}" alt="" />
      <img class="active-toy" src="${toySrc(plan.toy.id)}" alt="${escapeHtml(plan.toy.label)} toy" />
    </div>
    <div class="shadow-choice-row" aria-label="Choose the matching shadow">
      ${plan.choices.map((toy) => `
        <button class="shadow-choice" type="button" data-choice="${toy.id}"
          data-role="${toy.id === plan.toy.id ? 'correct' : 'wrong'}"
          aria-label="${escapeHtml(toy.label)} shadow">
          <img class="physical-base" src="${config.assets.plaque}" alt="" />
          <img class="choice-shadow" src="${shadowSrc(toy.id)}" alt="" />
        </button>
      `).join('')}
    </div>
  `;
  updateProgress();
  setPrompt(`Which shadow belongs to the ${plan.toy.label}?`, plan.toy.promptKey);
  host.querySelectorAll('.shadow-choice').forEach((button) => {
    registerTap(button, `choice-${button.dataset.choice}`, () => handleShadowChoice(button.dataset.choice));
  });
  nudger.arm();
  speak(plan.toy.promptKey);
}

function handleShadowChoice(toyId) {
  if (state.screen !== 'play' || state.mode !== 'match' || state.phase !== 'match' || !state.accepting) return false;
  const button = app.querySelector(`.shadow-choice[data-choice="${toyId}"]`);
  if (!button) return false;
  nudger.poke();
  if (toyId === state.targetToyId) {
    state.accepting = false;
    state.rewards.push({ toyId });
    sfx.sparkle();
    button.classList.add('is-correct');
    timers.after(260, () => renderRoundReveal('SHADOW FOUND!', 'found'));
    return true;
  }
  state.wrongAttempts += 1;
  button.classList.remove('is-wrong');
  void button.offsetWidth;
  button.classList.add('is-wrong');
  timers.after(620, () => button.classList.remove('is-wrong'));
  sfx.unpop();
  if (state.wrongAttempts >= 2) {
    app.querySelector(`.shadow-choice[data-choice="${state.targetToyId}"]`)?.classList.add('is-hint');
    setPrompt(config.toys.find((toy) => toy.id === state.targetToyId)?.hint || config.voice['look-closer'], 'look-closer');
    speak('look-closer');
  } else {
    speak('try-again');
  }
  return false;
}

function renderSunRound() {
  const host = resetPlayHost();
  const plan = roundPlan[state.round];
  state.phase = 'sun';
  state.toyId = plan.toy.id;
  state.targetToyId = null;
  state.targetSunId = plan.target.id;
  state.targetSunT = plan.target.sunT;
  state.sunT = plan.target.sunT < 0.5 ? 0.86 : 0.14;
  if (plan.target.sunT === 0.5) state.sunT = 0.1;
  state.choiceIds = [];
  state.wrongAttempts = 0;
  state.accepting = true;
  state.currentVoiceKey = state.round === 0 ? 'sun-intro' : 'sun-nudge';
  host.classList.add('sun-host');
  host.innerHTML = `
    <div class="target-plaque" aria-label="Target: ${escapeHtml(plan.target.label)}">
      <img class="physical-base" src="${config.assets.plaque}" alt="" />
      <span class="target-caption">MAKE THIS</span>
      <img class="target-shadow" src="${shadowSrc(plan.toy.id)}" alt="${escapeHtml(plan.target.label)}" />
    </div>
    ${sunSceneMarkup(plan.toy.id, true)}
  `;
  updateProgress();
  setPrompt('Move the sun until the big shadow matches the little one.', state.currentVoiceKey);
  applyShadowVars(host.querySelector('.target-shadow'), plan.target.sunT, true);
  setupSunInteraction(host, { withStops: true });
  setSun(state.sunT, { check: false });
  nudger.arm();
  speak(state.currentVoiceKey);
}

function sunSceneMarkup(toyId, includeFriend = false) {
  const friendId = toyId === 'turtle' ? 'squirrel' : 'turtle';
  return `
    <div class="sun-scene">
      <div class="sun-stage">
        <div class="cast-group active-cast">
          <img class="cast-shadow" data-shadow-live src="${shadowSrc(toyId)}" alt="" />
          <img class="sun-toy" src="${toySrc(toyId)}" alt="${escapeHtml(toyId)} toy" />
        </div>
        ${includeFriend ? `<div class="cast-group friend-cast" aria-hidden="true">
          <img class="cast-shadow" data-shadow-live src="${shadowSrc(friendId)}" alt="" />
          <img class="sun-toy" src="${toySrc(friendId)}" alt="" />
        </div>` : ''}
      </div>
      <div class="sun-track-wrap">
        <img class="sun-track" src="${config.assets.sunTrack}" alt="" />
        <button class="sun-handle" type="button" role="slider" aria-label="Move the sun"
          aria-valuemin="0" aria-valuemax="100" aria-valuenow="50" data-target="sun-handle">
          <img src="${config.assets.sun}" alt="" />
        </button>
        <div class="rail-hit-zones"></div>
      </div>
    </div>
  `;
}

function setupSunInteraction(host, { withStops = false } = {}) {
  const wrap = host.querySelector('.sun-track-wrap');
  const handle = host.querySelector('.sun-handle');
  if (!wrap || !handle) return;
  activeTargets.set('sun-handle', () => true);
  if (withStops) {
    const zones = host.querySelector('.rail-hit-zones');
    zones.innerHTML = config.sunTargets.map((target) => {
      const point = sunPoint(target.sunT);
      return `<button class="rail-hit" type="button" style="left:${point.x}%;top:${point.y}%"
        aria-label="Move sun to ${escapeHtml(target.label)}" data-stop="${target.id}"></button>`;
    }).join('');
    zones.querySelectorAll('.rail-hit').forEach((button) => {
      const target = config.sunTargets.find((item) => item.id === button.dataset.stop);
      registerTap(button, `sun-stop-${target.id}`, () => setSun(target.sunT, { source: 'stop' }), null);
    });
  }

  let pointerId = null;
  let offset = 0;
  const clientToT = (clientX) => {
    const rect = wrap.getBoundingClientRect();
    const left = rect.left + rect.width * 0.07;
    const width = rect.width * 0.86;
    return clamp((clientX - left) / width + offset, 0, 1);
  };
  const onDown = (event) => {
    if (event.isPrimary === false || pointerId != null || !state.accepting) return;
    event.preventDefault();
    feedback(null);
    if (state.mode === 'show') stopPlayback();
    pointerId = event.pointerId;
    const rect = wrap.getBoundingClientRect();
    const raw = (event.clientX - (rect.left + rect.width * 0.07)) / (rect.width * 0.86);
    offset = state.sunT - raw;
    try { handle.setPointerCapture(pointerId); } catch { /* window listeners still guard release */ }
    setSun(clientToT(event.clientX), { source: 'drag' });
  };
  const onMove = (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    setSun(clientToT(event.clientX), { source: 'drag' });
  };
  const finish = (event, snap = true) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    offset = 0;
    if (snap && state.mode === 'show') snapShowToNearest();
  };
  const onUp = (event) => finish(event, true);
  const onCancel = (event) => finish(event, false);
  const onBlur = () => { pointerId = null; offset = 0; };
  const onKey = (event) => {
    if (!state.accepting) return;
    let next = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = state.sunT - 0.04;
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = state.sunT + 0.04;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 1;
    if (next == null) return;
    event.preventDefault();
    feedback('tick');
    setSun(next, { source: 'keyboard' });
  };
  handle.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: false });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onCancel);
  window.addEventListener('blur', onBlur);
  handle.addEventListener('keydown', onKey);
  roundBag.add(() => handle.removeEventListener('pointerdown', onDown));
  roundBag.add(() => window.removeEventListener('pointermove', onMove, { passive: false }));
  roundBag.add(() => window.removeEventListener('pointerup', onUp));
  roundBag.add(() => window.removeEventListener('pointercancel', onCancel));
  roundBag.add(() => window.removeEventListener('blur', onBlur));
  roundBag.add(() => handle.removeEventListener('keydown', onKey));
}

function setSun(value, { source = 'api', check = true } = {}) {
  if (state.screen !== 'play' || !['sun', 'show'].includes(state.mode)) return false;
  const next = clamp(Number(value), 0, 1);
  if (!Number.isFinite(next)) return false;
  state.sunT = next;
  const point = sunPoint(next);
  const handle = app.querySelector('.sun-handle');
  if (handle) {
    handle.style.left = `${point.x}%`;
    handle.style.top = `${point.y}%`;
    handle.setAttribute('aria-valuenow', String(Math.round(next * 100)));
  }
  app.querySelectorAll('[data-shadow-live]').forEach((shadow) => applyShadowVars(shadow, next));
  updateStageLighting(next);
  if (state.mode === 'sun' && state.phase === 'sun' && state.accepting && check) evaluateSunTarget();
  if (source !== 'playback') nudger.poke();
  return true;
}

function updateStageLighting(t) {
  const next = clamp(Number(t), 0, 1);
  if (!Number.isFinite(next)) return;
  state.lightMoment = next < 0.34 ? 'morning' : next > 0.66 ? 'evening' : 'noon';
  const morning = app.querySelector('[data-stage-light="morning"]');
  const noon = app.querySelector('[data-stage-light="noon"]');
  const evening = app.querySelector('[data-stage-light="evening"]');
  if (morning) morning.style.opacity = next <= 0.5 ? '1' : '0';
  if (noon) noon.style.opacity = next <= 0.5 ? String(next * 2) : '1';
  if (evening) evening.style.opacity = next <= 0.5 ? '0' : String((next - 0.5) * 2);
}

function resetStageLighting() {
  state.lightMoment = 'neutral';
  app.querySelectorAll('[data-stage-light]').forEach((image) => { image.style.opacity = '0'; });
}

function applyShadowVars(element, t, preview = false) {
  if (!element) return;
  const edge = Math.abs(t - 0.5) * 2;
  const angle = (0.5 - t) * 132;
  const length = 0.26 + edge * (preview ? 0.72 : 0.92);
  const width = 0.82 - edge * 0.12;
  const opacity = 0.52 + edge * 0.14;
  element.style.setProperty('--shadow-angle', `${angle.toFixed(2)}deg`);
  element.style.setProperty('--shadow-length', length.toFixed(3));
  element.style.setProperty('--shadow-width', width.toFixed(3));
  element.style.setProperty('--shadow-opacity', opacity.toFixed(3));
}

function sunPoint(t) {
  return { x: 7 + t * 86, y: 67 - 31 * (4 * t * (1 - t)) };
}

function evaluateSunTarget() {
  const close = Math.abs(state.sunT - state.targetSunT) <= 0.055;
  app.querySelector('.target-plaque')?.classList.toggle('is-near', close);
  if (!close) {
    if (targetHoldTimer != null) timers.clear(targetHoldTimer);
    targetHoldTimer = null;
    return;
  }
  if (targetHoldTimer != null) return;
  targetHoldTimer = timers.after(450, () => {
    targetHoldTimer = null;
    if (state.mode === 'sun' && state.phase === 'sun' && state.accepting
      && Math.abs(state.sunT - state.targetSunT) <= 0.055) completeSunRound();
  });
}

function completeSunRound() {
  if (state.mode !== 'sun' || state.phase !== 'sun' || !state.accepting) return false;
  const plan = roundPlan[state.round];
  state.accepting = false;
  state.sunT = plan.target.sunT;
  setSun(state.sunT, { check: false });
  state.rewards.push({ toyId: plan.toy.id, sunTarget: plan.target.id });
  sfx.sparkle();
  timers.after(260, () => renderRoundReveal('SHADOW MATCHED!', plan.target.voiceKey));
  return true;
}

function renderRoundReveal(heading, voiceKey) {
  const host = resetPlayHost();
  state.phase = 'reveal';
  state.accepting = true;
  state.currentVoiceKey = voiceKey;
  host.classList.add('reveal-host');
  host.innerHTML = `
    <h1 class="reveal-heading">${escapeHtml(heading)}</h1>
    <div class="reveal-tableau">
      <img class="reveal-star" src="${config.assets.star}" alt="" />
      <img class="reveal-shadow" src="${shadowSrc(state.toyId)}" alt="" />
      <img class="reveal-toy" src="${toySrc(state.toyId)}" alt="${escapeHtml(state.toyId)} toy" />
    </div>
    ${actionButtonMarkup('next-round', state.round + 1 >= state.roundsTotal ? 'See my stars' : 'Next shadow')}
    <div class="raster-burst" aria-hidden="true"></div>
  `;
  updateProgress(state.round + 1);
  setPrompt('', voiceKey);
  registerTap(host.querySelector('[data-action="next-round"]'), 'next', advanceRound, 'sparkle');
  rasterBurst(host.querySelector('.raster-burst'));
  speak(voiceKey);
}

function advanceRound() {
  if (state.phase !== 'reveal') return false;
  if (state.round + 1 >= state.roundsTotal) {
    renderEnd();
    return true;
  }
  state.round += 1;
  if (state.mode === 'match') renderMatchRound();
  else renderSunRound();
  return true;
}

function renderShowChooser() {
  const host = resetPlayHost();
  state.phase = 'show-choose';
  state.accepting = true;
  state.currentVoiceKey = 'show-intro';
  host.classList.add('show-chooser-host');
  host.innerHTML = `
    <div class="show-toy-row">
      ${showToyChoices.map((toy) => `
        <button class="show-toy-choice" type="button" data-toy="${toy.id}" aria-label="Choose ${escapeHtml(toy.label)}">
          <img class="toy-pedestal" src="${config.assets.pedestal}" alt="" />
          <img class="show-choice-toy" src="${toySrc(toy.id)}" alt="${escapeHtml(toy.label)} toy" />
        </button>
      `).join('')}
    </div>
  `;
  updateProgress(0, 3);
  setPrompt('Choose a toy for your shadow show.', 'show-intro');
  host.querySelectorAll('.show-toy-choice').forEach((button) => {
    registerTap(button, `toy-${button.dataset.toy}`, () => chooseShowToy(button.dataset.toy));
  });
  nudger.arm();
  speak('show-intro');
}

function chooseShowToy(toyId) {
  if (state.mode !== 'show' || state.phase !== 'show-choose') return false;
  const toy = config.toys.find((item) => item.id === toyId);
  if (!toy) return false;
  state.toyId = toyId;
  state.showVisited = { morning: false, noon: false, evening: false };
  state.rewards = [];
  state.sunT = SHOW_STOPS[0].t;
  renderShowStage();
  visitShowStop(0, { speakLine: true });
  return true;
}

function renderShowStage() {
  const host = resetPlayHost();
  state.phase = 'show';
  state.accepting = true;
  state.currentVoiceKey = 'show-morning';
  host.classList.add('show-host');
  host.innerHTML = `
    ${sunSceneMarkup(state.toyId, false)}
    <div class="show-stop-row" aria-label="Times of day">
      ${SHOW_STOPS.map((stop, index) => timeStopMarkup(stop, index)).join('')}
    </div>
    <div class="playback-controls" aria-label="Shadow show controls">
      ${roundControlMarkup('previous', 'Previous time', SHARED_BUTTONS.back)}
      ${roundControlMarkup('playback', 'Play the whole day', SHARED_BUTTONS.play)}
      ${roundControlMarkup('next', 'Next time', SHARED_BUTTONS.back, true)}
    </div>
    <div class="show-done-slot"></div>
    <div class="raster-burst" aria-hidden="true"></div>
  `;
  setupSunInteraction(host, { withStops: false });
  host.querySelectorAll('.time-stop').forEach((button) => {
    registerTap(button, `time-${button.dataset.stop}`, () => {
      const index = SHOW_STOPS.findIndex((stop) => stop.id === button.dataset.stop);
      stopPlayback();
      return visitShowStop(index, { speakLine: true });
    });
  });
  registerTap(host.querySelector('[data-control="previous"]'), 'previous', () => stepSun(-1), 'tick');
  registerTap(host.querySelector('[data-control="playback"]'), 'playback', () => togglePlayback(), 'tick');
  registerTap(host.querySelector('[data-control="next"]'), 'next', () => stepSun(1), 'tick');
  host.querySelectorAll('.time-shadow').forEach((shadow, index) => {
    applyShadowVars(shadow, SHOW_STOPS[index].t, true);
  });
  updateShowVisuals();
  nudger.arm();
}

function timeStopMarkup(stop, index) {
  const sunClass = index === 0 ? 'time-sun-left' : index === 2 ? 'time-sun-right' : 'time-sun-noon';
  return `<button class="time-stop" type="button" data-stop="${stop.id}" aria-label="${stop.label}">
    <img class="physical-base" src="${config.assets.roundButton}" alt="" />
    <img class="time-sun ${sunClass}" src="${config.assets.sun}" alt="" />
    <img class="time-shadow" data-mini-stop="${stop.id}" src="${shadowSrc(state.toyId)}" alt="" />
    <img class="time-star" src="${config.assets.star}" alt="" />
    <span>${stop.label}</span>
  </button>`;
}

function roundControlMarkup(id, label, icon, flip = false) {
  return `<button class="round-control ${flip ? 'is-flipped' : ''}" type="button" data-control="${id}" aria-label="${label}">
    <img class="physical-base" src="${config.assets.roundButton}" alt="" />
    <img class="control-icon" src="${icon}" alt="" />
    <img class="pause-icon" src="${config.assets.pause}" alt="" />
  </button>`;
}

function visitShowStop(index, { speakLine = false } = {}) {
  const stop = SHOW_STOPS[clamp(Math.round(index), 0, SHOW_STOPS.length - 1)];
  if (!stop || state.mode !== 'show' || state.phase !== 'show') return false;
  setSun(stop.t, { source: 'stop', check: false });
  const first = !state.showVisited[stop.id];
  state.showVisited[stop.id] = true;
  if (first) state.rewards.push({ toyId: state.toyId, time: stop.id });
  state.currentVoiceKey = stop.voiceKey;
  setPrompt(config.voice[stop.voiceKey], stop.voiceKey);
  updateShowVisuals();
  if (speakLine) speak(stop.voiceKey);
  if (Object.values(state.showVisited).every(Boolean) && !state.complete) {
    state.complete = true;
    timers.after(350, () => {
      sfx.tada();
      rasterBurst(app.querySelector('.show-host .raster-burst'));
      speak('show-complete');
    });
  }
  return true;
}

function updateShowVisuals() {
  const complete = Object.values(state.showVisited).every(Boolean);
  for (const stop of SHOW_STOPS) {
    app.querySelector(`.time-stop[data-stop="${stop.id}"]`)?.classList.toggle('is-visited', state.showVisited[stop.id]);
  }
  app.querySelector('.show-host')?.classList.toggle('is-complete', complete);
  updateProgress(Object.values(state.showVisited).filter(Boolean).length, 3);
  const playButton = app.querySelector('[data-control="playback"]');
  if (playButton) {
    playButton.classList.toggle('is-playing', state.sunPlayback);
    playButton.setAttribute('aria-label', state.sunPlayback ? 'Pause the shadow show' : 'Play the whole day');
  }
  const slot = app.querySelector('.show-done-slot');
  if (slot && complete && !slot.children.length) {
    slot.innerHTML = actionButtonMarkup('show-done', 'See my stars');
    registerTap(slot.querySelector('[data-action="show-done"]'), 'done', () => renderEnd(), 'sparkle');
  }
}

function nearestShowIndex() {
  let best = 0;
  for (let i = 1; i < SHOW_STOPS.length; i += 1) {
    if (Math.abs(state.sunT - SHOW_STOPS[i].t) < Math.abs(state.sunT - SHOW_STOPS[best].t)) best = i;
  }
  return best;
}

function snapShowToNearest() {
  const index = nearestShowIndex();
  if (Math.abs(state.sunT - SHOW_STOPS[index].t) <= 0.12) visitShowStop(index, { speakLine: true });
}

function stepSun(direction) {
  if (state.mode !== 'show' || state.phase !== 'show') return false;
  stopPlayback();
  const current = nearestShowIndex();
  const next = clamp(current + (Number(direction) < 0 ? -1 : 1), 0, SHOW_STOPS.length - 1);
  return visitShowStop(next, { speakLine: true });
}

function togglePlayback() {
  if (state.mode !== 'show' || state.phase !== 'show') return false;
  if (state.sunPlayback) {
    stopPlayback();
    return false;
  }
  playWholeDay();
  return true;
}

function stopPlayback() {
  playbackToken += 1;
  state.sunPlayback = false;
  settlePlaybackWork();
  updateShowVisuals();
}

async function playWholeDay() {
  const token = ++playbackToken;
  state.sunPlayback = true;
  updateShowVisuals();
  for (let index = 0; index < SHOW_STOPS.length; index += 1) {
    if (token !== playbackToken) return;
    await animateSunTo(SHOW_STOPS[index].t, reducedMotion.matches ? 1 : 1450, token);
    if (token !== playbackToken) return;
    visitShowStop(index, { speakLine: true });
    await waitForPlayback(
      voice.duration(SHOW_STOPS[index].voiceKey)
        ? voice.duration(SHOW_STOPS[index].voiceKey) * 1000 + 300
        : 2100,
      token,
    );
  }
  if (token !== playbackToken) return;
  state.sunPlayback = false;
  updateShowVisuals();
}

function animateSunTo(target, duration, token) {
  const start = state.sunT;
  const ms = timers.ms(duration);
  if (ms <= 1) {
    setSun(target, { source: 'playback', check: false });
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    animationResolve = resolve;
    const began = performance.now();
    const tick = (now) => {
      if (token !== playbackToken) {
        animationFrame = null;
        animationResolve = null;
        resolve();
        return;
      }
      const p = clamp((now - began) / ms, 0, 1);
      const eased = p * p * (3 - 2 * p);
      setSun(start + (target - start) * eased, { source: 'playback', check: false });
      if (p >= 1) {
        animationFrame = null;
        animationResolve = null;
        resolve();
        return;
      }
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
  });
}

function waitForPlayback(duration, token) {
  if (token !== playbackToken) return Promise.resolve();
  return new Promise((resolve) => {
    playbackDelayResolve = resolve;
    playbackDelayId = timers.after(duration, () => {
      playbackDelayId = null;
      playbackDelayResolve = null;
      resolve();
    });
  });
}

function settlePlaybackWork() {
  if (animationFrame != null) cancelAnimationFrame(animationFrame);
  animationFrame = null;
  if (animationResolve) {
    const resolve = animationResolve;
    animationResolve = null;
    resolve();
  }
  if (playbackDelayId != null) timers.clear(playbackDelayId);
  playbackDelayId = null;
  if (playbackDelayResolve) {
    const resolve = playbackDelayResolve;
    playbackDelayResolve = null;
    resolve();
  }
}

function actionButtonMarkup(action, label) {
  return `<button class="action-button" type="button" data-action="${action}" aria-label="${escapeHtml(label)}">
    <img class="physical-base" src="${config.assets.button}" alt="" />
    <span>${escapeHtml(label)}</span>
  </button>`;
}

function renderEnd() {
  clearInteraction();
  resetStageLighting();
  screens.show('end');
  state.screen = 'end';
  state.phase = 'end';
  state.accepting = true;
  state.complete = true;
  state.currentVoiceKey = 'all-done';
  activateHud('end');
  const host = app.querySelector('.end-host');
  const toyId = state.toyId || 'rabbit';
  host.innerHTML = `
    <h1 class="end-heading">SHADOW STAR!</h1>
    <div class="end-tableau">
      <img class="end-star" src="${config.assets.star}" alt="" />
      <img class="end-toy" src="${toySrc(toyId)}" alt="${escapeHtml(toyId)} toy" />
    </div>
    <div class="stamp-shelf" aria-label="Shadow stars earned">
      ${Array.from({ length: state.mode === 'show' ? 3 : state.roundsTotal }, () => `<img src="${config.assets.star}" alt="" />`).join('')}
    </div>
    <div class="end-actions">
      ${actionButtonMarkup('again', 'Play again')}
      ${actionButtonMarkup('choose', 'Choose a game')}
    </div>
    <div class="raster-burst" aria-hidden="true"></div>
  `;
  registerTap(host.querySelector('[data-action="again"]'), 'again', () => startMode(state.mode), 'sparkle');
  registerTap(host.querySelector('[data-action="choose"]'), 'choose', () => showSplash({ speakWelcome: true }), 'unpop');
  rasterBurst(host.querySelector('.raster-burst'));
  sfx.tada();
  speak('all-done');
}

function rasterBurst(host) {
  if (!host) return;
  const positions = [
    [-42, -20], [-32, 23], [-19, -38], [-8, 36], [7, -44], [17, 28],
    [30, -31], [40, 17], [-38, 4], [-25, 39], [25, 42], [43, -3],
  ];
  host.innerHTML = positions.map(([x, y], index) => `
    <img class="burst-star" src="${config.assets.star}" alt=""
      style="--burst-x:${x}vmin;--burst-y:${y}vmin;--burst-delay:${index * 42}ms" />
  `).join('');
}

function debugTap(id) {
  const action = activeTargets.get(String(id));
  if (!action) return false;
  return action();
}

function winRound() {
  if (state.mode === 'match' && state.phase === 'match') return handleShadowChoice(state.targetToyId);
  if (state.mode === 'sun' && state.phase === 'sun') {
    setSun(state.targetSunT, { source: 'debug', check: false });
    return completeSunRound();
  }
  if (state.mode === 'show') {
    if (state.phase === 'show-choose') chooseShowToy(showToyChoices[0]?.id);
    SHOW_STOPS.forEach((_, index) => visitShowStop(index, { speakLine: false }));
    return true;
  }
  return false;
}

function snapshot() {
  return {
    ...state,
    choiceIds: [...state.choiceIds],
    rewards: state.rewards.map((reward) => ({ ...reward })),
    showVisited: { ...state.showVisited },
    targets: [...activeTargets.keys()],
    audioLog: voice.getAudioLog(),
    bgm: bgm.stats(),
    timers: timers.size(),
  };
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  for (const media of document.querySelectorAll('audio, video')) media.muted = state.muted;
  if (state.muted) {
    try { window.speechSynthesis?.cancel(); } catch { /* debug mute must never throw */ }
  }
  return state.muted;
}

// The shared debug harness default does not know about BGM, so widen its mute
// fan-out without changing the platform module.
const debugHook = window.QLOBE_DEBUG;
if (debugHook) debugHook.mute = setMuted;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}
