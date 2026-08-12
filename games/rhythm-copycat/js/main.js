import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32, pick } from '../../../shared/js/rng.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { loadPoseActorDom } from '../../../shared/js/stage/pose-sprite-dom.js';
import * as perc from './percussion.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const screens = Object.fromEntries($$('[data-screen]').map((el) => [el.dataset.screen, el]));
const timers = createTimers();

const MODES = config.modes;
const BEAT_MS = Math.round(60000 / config.bpm);
const PRAISE = ['good-1', 'good-2', 'good-3'];

const state = {
  screen: 'splash',
  mode: null,
  selected: null,
  round: -1,
  roundsTotal: 4,
  phase: 'between', // 'demo' | 'copy' | 'between'
  pattern: [],
  stepIndex: 0,
  demoStep: -1,
  missCount: 0,
  awaitingInput: false,
  busy: false,
  muted: false,
  seed: 42,
  praiseIndex: 0,
  progress: Object.fromEntries(MODES.map((mode) => [mode.id, 0])),
  lastPattern: [],
  flow: 0,
};

let rng = mulberry32(state.seed);
let kiki = null;
let confettiStop = null;
const percLog = [];

function modeById(id) { return MODES.find((mode) => mode.id === id); }
function speak(key) { return voice.say(key, config.lines[key]); }
function hit(action) {
  if (state.muted) return;
  perc.play(action);
  percLog.push({ action, at: Math.round(performance.now()) });
  if (percLog.length > 80) percLog.splice(0, percLog.length - 80);
}

function setPrompt(text) { $('[data-prompt]').textContent = text; }

/* ---------- Kiki, one actor moved between screens ---------- */

function mountKiki(host) {
  if (kiki && host && kiki.el.parentElement !== host) host.append(kiki.el);
}

function kikiPose(name, opts) { return kiki ? kiki.setPose(name, opts) : Promise.resolve(false); }

/* ---------- screen plumbing ---------- */

function showScreen(name) {
  timers.clearAll();
  voice.stop();
  stopConfetti();
  state.flow += 1;
  for (const [id, el] of Object.entries(screens)) el.hidden = id !== name;
  state.screen = name;
}

function stopConfetti() {
  if (confettiStop) { try { confettiStop(); } catch { /* no-op */ } confettiStop = null; }
}

/* ---------- splash ---------- */

function renderCardDots() {
  for (const mode of MODES) {
    const host = $(`[data-dots="${mode.id}"]`);
    if (!host) continue;
    host.replaceChildren();
    const progress = state.progress[mode.id];
    const rest = REST_PATTERNS[mode.id] || [];
    for (let i = 0; i < state.roundsTotal; i += 1) {
      const dot = document.createElement('span');
      let cls = 'rc-dot';
      if (i < progress) cls += ' is-filled';
      else if (progress === 0 && rest[i]) cls += ' is-rest';
      dot.className = cls;
      host.append(dot);
    }
  }
}

function renderSplash() {
  showScreen('splash');
  state.mode = null;
  state.round = -1;
  state.phase = 'between';
  state.pattern = [];
  state.awaitingInput = false;
  state.busy = false;
  mountKiki($('[data-kiki-splash]'));
  kikiPose('neutral', { instant: true });
  renderCardDots();
  armSplashIdle();
}

function highlightCard(id) {
  $('.rc-cards').classList.toggle('has-selection', Boolean(id));
  for (const card of $$('.rc-card')) card.classList.toggle('is-selected', card.dataset.mode === id);
}

// Decorative resting patterns echo the mockup's per-card colored pills until
// the child earns real progress fills.
const REST_PATTERNS = { 'drum-beat': [1, 1, 0, 1], 'jingle-beat': [1, 1, 1, 0], 'parade-beat': [1, 1, 0, 0] };

// The selected card's pill dots fill one-by-one in its accent color — a tiny
// preview of "you'll play four rounds" — then settle back to real progress.
function previewDots(id) {
  const dots = $$(`[data-dots="${id}"] .rc-dot`);
  dots.forEach((dot, index) => {
    timers.after(160 + index * 190, () => dot.classList.add('is-preview'));
  });
  timers.after(160 + dots.length * 190 + 900, () => {
    for (const dot of dots) dot.classList.remove('is-preview');
  });
}

async function selectMode(id) {
  if (state.screen !== 'splash' || state.busy) return false;
  if (state.selected === id) return startMode(id);
  state.selected = id;
  highlightCard(id);
  previewDots(id);
  $('.rc-start').classList.add('is-pulsing');
  kikiPose('notice');
  hit(modeById(id).actions[0]);
  await speak(modeById(id).line);
  timers.after(2400, () => kikiPose('neutral'));
  return true;
}

function armSplashIdle() {
  timers.after(8000, () => {
    if (state.screen !== 'splash') return;
    speak('pick-beat');
    const first = $('.rc-card');
    if (first) {
      first.classList.add('is-nudged');
      timers.after(1400, () => first.classList.remove('is-nudged'));
    }
    armSplashIdle();
  });
}

/* ---------- play: demo phase ---------- */

function pickPattern(mode, roundIndex) {
  const pool = mode.rounds[roundIndex].pool;
  let pattern = pick(pool, rng);
  if (state.lastPattern.length && pool.length > 1) {
    let guard = 8;
    while (guard-- > 0 && pattern.join() === state.lastPattern.join()) pattern = pick(pool, rng);
  }
  state.lastPattern = pattern;
  return pattern;
}

function renderChips(pattern) {
  const host = $('[data-chips]');
  const tray = $('.rc-tray');
  for (const n of [2, 3, 4]) tray.classList.toggle(`rc-tray-len${n}`, pattern.length === n);
  host.replaceChildren();
  pattern.forEach((action, index) => {
    const chip = document.createElement('span');
    chip.className = 'rc-chip is-socket';
    chip.dataset.index = String(index);
    chip.style.setProperty('--chip-color', config.actions[action].color);
    const img = document.createElement('img');
    img.src = `./${config.actions[action].chip}`;
    img.alt = '';
    img.draggable = false;
    chip.append(img);
    host.append(chip);
  });
}

function chipEl(index) { return $(`[data-chips] .rc-chip[data-index="${index}"]`); }
function padEl(action) { return $(`.rc-pad[data-pad="${action}"]`); }

// A little authored star pops off the pad on every correct hit.
function burstOnPad(action) {
  const pad = padEl(action);
  if (!pad) return;
  const star = document.createElement('img');
  star.src = './assets/ui/star.webp';
  star.alt = '';
  star.className = 'rc-burst';
  star.draggable = false;
  pad.append(star);
  timers.after(620, () => star.remove());
}

function animateOnce(element, className, ms = 650) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
  timers.after(ms, () => element.classList.remove(className));
}

async function runDemo({ replay = false } = {}) {
  const flow = state.flow;
  state.phase = 'demo';
  state.busy = true;
  state.awaitingInput = false;
  state.stepIndex = 0;
  state.missCount = 0;
  screens.play.classList.add('is-demo');
  setPrompt('Listen!');
  for (const chip of $$('[data-chips] .rc-chip')) chip.className = 'rc-chip is-socket';
  await speak(replay ? 'listen' : 'watch-kiki');
  if (flow !== state.flow) return;
  await timers.wait(BEAT_MS * 0.6);
  if (flow !== state.flow) return;
  for (let i = 0; i < state.pattern.length; i += 1) {
    const action = state.pattern[i];
    state.demoStep = i;
    chipEl(i)?.classList.remove('is-socket');
    chipEl(i)?.classList.add('is-shown');
    animateOnce(chipEl(i), 'is-beat', 420);
    animateOnce(padEl(action), 'is-demo-hit', 480);
    kikiPose(action);
    hit(action);
    speak(action);
    await timers.wait(BEAT_MS);
    if (flow !== state.flow) return;
  }
  state.demoStep = -1;
  kikiPose('neutral');
  await timers.wait(BEAT_MS * 0.4);
  if (flow !== state.flow) return;
  state.phase = 'copy';
  state.busy = false;
  state.awaitingInput = true;
  screens.play.classList.remove('is-demo');
  for (const chip of $$('[data-chips] .rc-chip')) {
    if (!chip.classList.contains('is-socket')) chip.classList.add('is-ghost');
  }
  setPrompt('Your turn!');
  await speak('your-turn');
  armPlayIdle();
}

function armPlayIdle() {
  timers.after(9000, async () => {
    if (state.screen !== 'play' || !state.awaitingInput || state.busy) return;
    await speak('together');
    if (state.screen !== 'play' || !state.awaitingInput) return;
    replayDemo();
  });
}

async function replayDemo() {
  if (state.screen !== 'play' || state.busy) return false;
  state.flow += 1; // a replay restarts the copy phase from the top
  await runDemo({ replay: true });
  return true;
}

/* ---------- play: copy phase ---------- */

async function padTap(action) {
  if (state.screen !== 'play') return { accepted: false };
  if (state.busy || !state.awaitingInput) {
    // During the demo the pads are inert; a tap still gives silent visual feedback.
    return { accepted: false };
  }
  timers.clearAll();
  const expected = state.pattern[state.stepIndex];
  if (action === expected) {
    state.missCount = 0;
    const index = state.stepIndex;
    state.stepIndex += 1;
    hit(action);
    animateOnce(padEl(action), 'is-hit', 460);
    burstOnPad(action);
    padEl(action)?.classList.remove('is-hint');
    const chip = chipEl(index);
    chip?.classList.remove('is-ghost', 'is-socket');
    chip?.classList.add('is-shown');
    animateOnce(chip, 'is-beat', 460);
    kikiPose(action);
    timers.after(500, () => { if (state.phase === 'copy') kikiPose('neutral'); });
    if (state.stepIndex >= state.pattern.length) return roundComplete().then(() => ({ accepted: true }));
    armPlayIdle();
    return { accepted: true };
  }
  state.missCount += 1;
  animateOnce(padEl(action), 'is-wrong', 520);
  if (!state.muted) sfx.unpop();
  kikiPose('notice');
  timers.after(900, () => { if (state.phase === 'copy') kikiPose('neutral'); });
  await speak('oops');
  if (state.screen !== 'play' || !state.awaitingInput) return { accepted: false };
  await speak(`nudge-${expected}`);
  if (state.missCount >= 2) padEl(expected)?.classList.add('is-hint');
  armPlayIdle();
  return { accepted: false };
}

async function roundComplete() {
  const flow = state.flow;
  state.awaitingInput = false;
  state.busy = true;
  state.phase = 'between';
  if (!state.muted) sfx.sparkle();
  kikiPose('celebrate');
  burstConfetti({ host: screens.play, count: 16, rng });
  const mode = modeById(state.mode);
  state.progress[mode.id] = Math.max(state.progress[mode.id], state.round + 1);
  renderProgress();
  const praise = PRAISE[state.praiseIndex % PRAISE.length];
  state.praiseIndex += 1;
  await speak(praise);
  if (flow !== state.flow) return;
  await timers.wait(650);
  if (flow !== state.flow) return;
  if (state.round + 1 >= state.roundsTotal) return finishSet();
  return showRound(state.round + 1);
}

function renderProgress() {
  const host = $('[data-progress]');
  host.replaceChildren();
  for (let i = 0; i < state.roundsTotal; i += 1) {
    const done = i < state.round || (i === state.round && state.phase === 'between');
    const dot = document.createElement('span');
    dot.className = 'rc-round-dot' + (done ? ' is-done' : i === state.round ? ' is-now' : '');
    host.append(dot);
  }
  host.setAttribute('aria-label', `Round ${Math.min(state.round + 1, state.roundsTotal)} of ${state.roundsTotal}`);
}

async function showRound(index) {
  if (state.screen !== 'play') return;
  state.flow += 1;
  state.round = index;
  const mode = modeById(state.mode);
  state.pattern = pickPattern(mode, index);
  state.stepIndex = 0;
  state.missCount = 0;
  renderChips(state.pattern);
  renderProgress();
  for (const pad of $$('.rc-pad')) {
    pad.classList.remove('is-hint', 'is-wrong', 'is-hit');
    pad.classList.toggle('is-resting', !mode.actions.includes(pad.dataset.pad));
  }
  await runDemo();
}

async function startMode(id) {
  const mode = modeById(id) || MODES[0];
  await ready;
  state.selected = mode.id;
  highlightCard(mode.id);
  showScreen('play');
  state.mode = mode.id;
  state.round = -1;
  state.praiseIndex = 0;
  state.lastPattern = [];
  mountKiki($('[data-kiki-play]'));
  kikiPose('neutral', { instant: true });
  await speak('start');
  if (state.screen === 'play') await showRound(0);
  return true;
}

/* ---------- end ---------- */

async function finishSet() {
  showScreen('end');
  const flow = state.flow; // captured AFTER showScreen's increment so the star loop survives
  state.phase = 'between';
  state.busy = false;
  state.awaitingInput = false;
  mountKiki($('[data-kiki-end]'));
  kikiPose('celebrate', { instant: true });
  const stars = $$('[data-stars] img');
  for (const star of stars) star.classList.remove('is-in');
  if (!state.muted) sfx.tada();
  await speak('round-end');
  if (flow !== state.flow) return true;
  for (let i = 0; i < stars.length; i += 1) {
    stars[i].classList.add('is-in');
    if (!state.muted) sfx.pop();
    await timers.wait(420);
    if (flow !== state.flow) return true;
  }
  confettiStop = burstConfetti({ host: screens.end, loop: true, rng });
  await speak('stars-3');
  if (flow !== state.flow) return true;
  await speak('song');
  if (flow !== state.flow) return true;
  // The child's last pattern becomes the song: percussion + a warm bass walk.
  const song = state.lastPattern.length ? state.lastPattern : ['clap', 'tap'];
  for (let bar = 0; bar < 2; bar += 1) {
    for (let i = 0; i < song.length; i += 1) {
      hit(song[i]);
      if (!state.muted) perc.play('bass', bar * song.length + i);
      await timers.wait(BEAT_MS * 0.75);
      if (flow !== state.flow) return true;
    }
  }
  if (!state.muted) perc.play('strum');
  await speak('all-done');
  timers.after(8000, () => { if (state.screen === 'end') renderSplash(); });
  return true;
}

/* ---------- input wiring ---------- */

function prepareAudio() { perc.unlock(); }

function setMuted(on = !state.muted) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  if (state.muted) voice.stop();
  for (const button of $$('[data-action="mute"]')) {
    button.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Mute sound');
    button.classList.toggle('is-muted', state.muted);
  }
  return state.muted;
}

function wireControls() {
  for (const card of $$('.rc-card')) {
    onTap(card, () => selectMode(card.dataset.mode), { feedback: () => { if (!state.muted) sfx.tick(); } });
  }
  onTap($('.rc-start'), () => startMode(state.selected || MODES[0].id), { feedback: () => { if (!state.muted) sfx.tick(); } });
  onTap($('.rc-listen'), () => replayDemo(), { feedback: () => { if (!state.muted) sfx.tick(); } });
  onTap($('.rc-again'), () => startMode(state.mode || MODES[0].id), { feedback: () => { if (!state.muted) sfx.tick(); } });
  for (const pad of $$('.rc-pad')) {
    onTap(pad, () => padTap(pad.dataset.pad), { feedback: () => { /* percussion IS the feedback */ } });
  }
  for (const button of $$('[data-action="back"]')) {
    onTap(button, () => renderSplash(), { feedback: () => { if (!state.muted) sfx.tick(); } });
  }
  for (const button of $$('[data-action="mute"]')) {
    onTap(button, () => setMuted(), { feedback: () => {} });
  }
}

function tapTarget(id) {
  if (id === 'start') return startMode(state.selected || MODES[0].id);
  if (id === 'listen') return replayDemo();
  if (id === 'again') return startMode(state.mode || MODES[0].id);
  if (id === 'back-play' || id === 'back-end') { renderSplash(); return true; }
  if (id.startsWith('sound-')) return setMuted();
  const card = id.match(/^card-(.+)$/);
  if (card) return selectMode(card[1]);
  const pad = id.match(/^pad-(.+)$/);
  if (pad) return padTap(pad[1]);
  return false;
}

async function winRound() {
  await ready;
  if (state.screen !== 'play') return false;
  let guard = 12;
  while (state.busy && guard-- > 0) await timers.wait(200);
  while (state.awaitingInput && state.stepIndex < state.pattern.length) {
    const result = await padTap(state.pattern[state.stepIndex]);
    if (!result?.accepted) return false;
  }
  return true;
}

/* ---------- boot ---------- */

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.lines),
  loadPoseActorDom('./assets/kiki/poses.json', {
    host: $('[data-kiki-splash]'),
    className: 'rc-kiki-actor',
    preloadOrder: ['neutral', 'clap', 'stomp', 'tap', 'shake', 'notice', 'celebrate'],
  }).then((actor) => { kiki = actor; actor.show('neutral'); }),
]).then(() => true).catch((error) => {
  console.error(error);
  const status = $('[data-status]');
  if (status) status.textContent = 'Art or sound files need an adult check.';
  throw error;
});

wireControls();
renderCardDots();
installUnlockOnGesture({
  extra: [() => perc.unlock()],
  onFirst: () => { timers.after(150, () => { if (state.screen === 'splash') { speak('intro'); timers.after(1600, () => { if (state.screen === 'splash') speak('pick-beat'); }); } }); },
});
installKioskGuards();

installDebug({
  gameId: config.id,
  ready,
  listModes: () => MODES.map((mode) => ({ id: mode.id, title: mode.title })),
  startMode: (id) => startMode(id),
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    round: state.round,
    roundsTotal: state.roundsTotal,
    phase: state.phase,
    pattern: state.pattern.slice(),
    stepIndex: state.stepIndex,
    demoStep: state.demoStep,
    missCount: state.missCount,
    awaitingInput: state.awaitingInput,
    busy: state.busy,
    muted: state.muted,
    seed: state.seed,
    progress: { ...state.progress },
  }),
  getTargets: () => {
    const targets = collectTargets(screens[state.screen]);
    if (state.screen === 'play') {
      const expected = state.pattern[state.stepIndex];
      for (const target of targets) {
        const pad = target.id?.match(/^pad-(.+)$/);
        if (pad) target.role = state.awaitingInput ? (pad[1] === expected ? 'correct' : 'wrong') : 'neutral';
      }
    }
    return targets;
  },
  tap: tapTarget,
  winRound,
  mute: setMuted,
  seed: (value) => {
    state.seed = Number.isFinite(Number(value)) ? Number(value) >>> 0 : 42;
    rng = mulberry32(state.seed);
    return state.seed;
  },
  timers,
  getAudioLog: () => ({ voice: voice.getAudioLog(), percussion: percLog.map((entry) => ({ ...entry })) }),
  home: renderSplash,
});

ready.then(() => {
  const status = $('[data-status]');
  if (status) status.textContent = '';
  renderSplash();
});
