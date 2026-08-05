import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';

const mount = document.getElementById('game');
const screens = createScreens({ root: mount, initial: 'splash', splash: 'splash' });
const timers = createTimers();
const narrator = createNarrator();
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const state = {
  screen: 'splash', mode: null, round: 0, phase: 'splash', selected: null,
  poured: [], prediction: null, target: null, result: null, busy: false,
  muted: false, reducedMotion: reduceQuery.matches, seed: 42,
};
let rng = mulberry32(state.seed);
let deck = [];
let drag = null;
let pendingWelcome = true;
let runId = 0;
const artFailures = [];

const artReady = preloadArt();
const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice)
    .catch(() => undefined),
  artReady,
]).then(() => renderSplash());

installKioskGuards();
installUnlockOnGesture({ onFirst: () => {
  if (pendingWelcome && state.screen === 'splash') {
    pendingWelcome = false;
    say('welcome');
  }
} });
window.addEventListener('pointerdown', () => voice.unlock(), { passive: true });
window.addEventListener('blur', () => drag?.cancel());
reduceQuery.addEventListener?.('change', (event) => { state.reducedMotion = event.matches; });

const nudger = createNudger({ first: 11000, repeat: 11000, onNudge: (count) => idleNudge(count) });

function preloadArt() {
  const urls = [
    ...Object.values(config.assets),
    ...Object.values(config.primary).flatMap(({ flask, stream }) => [flask, stream]),
    config.emptyFlask,
    ...Object.values(config.beakers),
    ...Object.values(config.mascots),
    ...Object.values(config.swirls),
    ...config.modes.map(({ art }) => art),
  ];
  return Promise.all([...new Set(urls)].map((url) => new Promise((resolve) => {
    const image = new Image();
    let settled = false;
    const finish = (reason = null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(deadline);
      if (reason) {
        artFailures.push({ url, reason });
        console.warn(`Color Mixing Lab art preload ${reason}: ${url}`);
      }
      resolve();
    };
    const deadline = window.setTimeout(() => finish('timed out'), 8000);
    image.onload = () => {
      const decoded = image.decode?.();
      if (decoded) decoded.then(() => finish(), () => finish('decode failed'));
      else finish();
    };
    image.onerror = () => finish('failed');
    image.src = url;
  })));
}

function say(key) { return narrator.say(key, config.voice[key]); }
function currentRound() { return deck[state.round] || null; }
function activeMode() { return config.modes.find((mode) => mode.id === state.mode); }
function pairResult(colors) {
  const sorted = [...colors].sort().join('-');
  return config.mixtures.find((mix) => [...mix.colors].sort().join('-') === sorted) || null;
}
function img(src, alt, className = '') { return `<img class="${className}" src="${src}" alt="${alt}" draggable="false">`; }
function clearFlow() {
  runId += 1;
  timers.clearAll();
  nudger.stop();
  drag?.detach();
  drag = null;
  document.querySelectorAll('[data-qk-drag-ghost], .color-confetti, .qk-confetti-layer').forEach((node) => node.remove());
  narrator.stop();
}
function homeHref() { return '../../'; }
function buttonArt(kind) { return config.assets[kind]; }

function makeHud(done) {
  const wrap = document.createElement('div');
  wrap.className = 'lab-hud';
  const back = hudButton('back', () => renderSplash(), { label: 'Back to experiments' });
  back.dataset.target = 'back'; back.classList.add('lab-back'); back.style.backgroundImage = `url('${buttonArt('back')}')`;
  const sound = hudButton('sound', soundDebounce(() => say(promptKey())), { label: 'Hear directions again' });
  sound.dataset.target = 'sound'; sound.classList.add('lab-sound'); sound.style.backgroundImage = `url('${buttonArt('sound')}')`;
  const pips = progressDots(config.rounds, done); pips.classList.add('lab-progress');
  wrap.append(back, pips, sound);
  return wrap;
}

function renderSplash() {
  clearFlow();
  state.screen = 'splash'; state.mode = null; state.round = 0; state.phase = 'splash';
  state.selected = null; state.poured = []; state.prediction = null; state.target = null; state.result = null; state.busy = false;
  screens.show('splash');
  const screen = screens.el('splash');
  screen.style.backgroundImage = `url('${config.assets.splash}')`;
  screen.innerHTML = `
    <a class="lab-icon splash-home" href="${homeHref()}" aria-label="Back to all games" data-target="home" style="background-image:url('${buttonArt('home')}')"></a>
    <header class="lab-title">${img(config.assets.title, config.title, 'lab-title-art')}</header>
    <p class="lab-kicker">Pick an experiment</p>
    <div class="mode-grid" role="list" aria-label="Choose an experiment">
      ${config.modes.map((mode) => `<button class="mode-card" type="button" role="listitem" data-mode="${mode.id}" data-target="mode-${mode.id}" aria-label="${mode.title}: ${mode.description}">
        ${img(mode.art, '', 'mode-art')}<span>${mode.title}</span><small>${mode.description}</small></button>`).join('')}
    </div>`;
  screen.querySelectorAll('.mode-card').forEach((node) => node.addEventListener('click', () => startMode(node.dataset.mode)));
}

function startMode(id) {
  const mode = config.modes.find((item) => item.id === id);
  if (!mode || state.busy) return;
  clearFlow();
  state.mode = mode.id; state.round = 0; state.phase = mode.id === 'predict' ? 'predict' : 'play';
  state.selected = null; state.poured = []; state.prediction = null; state._choices = null; state._choiceRound = -1; state.busy = false;
  deck = shuffle(config.mixtures, rng);
  state.target = deck[0]; state.result = null;
  pendingWelcome = false;
  renderPlay();
  say(mode.voice);
  timers.after(420, () => say(promptKey()));
}

function promptKey() {
  const round = currentRound();
  if (!round) return 'welcome';
  if (state.mode === 'recipe') return `recipe-${round.result}`;
  return `${state.mode}-${round.id}`;
}

function promptMarkup(round) {
  if (state.phase === 'predict') {
    return `<section class="prompt-panel prediction-panel" aria-label="Choose a prediction">
      <div class="equation-pictures">${flaskPicture(round.colors[0])}<b>+</b>${flaskPicture(round.colors[1])}<b>=</b><span class="paint-question" aria-hidden="true">?</span></div>
      <p>Which color do you think they will make?</p>
      <div class="prediction-choices">${predictionChoices(round).map((color) => `<button type="button" class="prediction-card" data-color="${color}" data-target="predict-${color}" aria-label="Predict ${color}">
        ${img(config.mascots[color], `${color} color friend`, 'choice-mascot')}<span>${color}</span></button>`).join('')}</div>
    </section>`;
  }
  if (state.mode === 'recipe') return `<section class="prompt-panel recipe-panel" aria-label="Make ${round.result}">
    ${img(config.mascots[round.result], `${round.result} color friend`, 'prompt-mascot')}
    <p>Can you make <strong>${round.result}</strong>?</p></section>`;
  return `<section class="prompt-panel" aria-label="Pour ${round.colors.join(' and ')}">
    <div class="equation-pictures">${flaskPicture(round.colors[0])}<b>+</b>${flaskPicture(round.colors[1])}</div>
    <p>Pour <strong>${round.colors[0]}</strong> and <strong>${round.colors[1]}</strong> into the beaker.</p></section>`;
}
function flaskPicture(color) { return img(config.primary[color].flask, `${color} flask`, 'prompt-flask'); }
function predictionChoices(round) {
  if (!state._choices || state._choiceRound !== state.round) {
    state._choices = shuffle(config.mixtures.map((mix) => mix.result), rng); state._choiceRound = state.round;
  }
  return state._choices;
}

function flaskMarkup(color) {
  const isPoured = state.poured.includes(color);
  const isSelected = state.selected === color;
  return `<button type="button" class="flask flask-${color}${isPoured ? ' is-poured' : ''}${isSelected ? ' is-selected' : ''}" data-color="${color}" data-target="flask-${color}" aria-label="${isPoured ? 'Empty' : color} flask" ${state.busy || isPoured ? 'disabled' : ''}>
    ${img(isPoured ? config.emptyFlask : config.primary[color].flask, `${isPoured ? 'empty' : color} paint flask`, 'flask-art')}</button>`;
}

function renderPlay() {
  const round = currentRound();
  if (!round) return renderEnd();
  state.screen = 'play'; state.target = round;
  screens.show('play');
  const screen = screens.el('play');
  screen.style.backgroundImage = `url('${config.assets.play}')`;
  screen.innerHTML = '';
  screen.append(makeHud(state.round));
  const content = document.createElement('div'); content.className = `lab-workbench phase-${state.phase}`;
  content.innerHTML = `${promptMarkup(round)}
    <div class="beaker-stage"><button class="beaker-slot" type="button" data-slot data-target="beaker" aria-label="Pour into the beaker" ${state.phase === 'predict' || state.busy ? 'disabled' : ''}>
      ${img(config.beakers.empty, 'empty beaker', 'beaker-art')}<img class="swirl-art" alt="" hidden></button>
      <div class="stream-layer" aria-hidden="true"></div><div class="mascot-reveal" aria-live="polite"></div></div>
    <div class="flask-dock" aria-label="Paint flasks">${Object.keys(config.primary).map(flaskMarkup).join('')}</div>
    <div class="result-equation" aria-live="polite"></div>`;
  screen.append(content);
  if (state.phase === 'predict') {
    content.querySelectorAll('.prediction-card').forEach((node) => node.addEventListener('click', () => choosePrediction(node.dataset.color)));
  } else wireWorkbench(screen);
  nudger.arm();
}

function wireWorkbench(screen) {
  const beaker = screen.querySelector('.beaker-slot');
  beaker.addEventListener('click', () => { if (state.selected) pour(state.selected); });
  screen.querySelectorAll('.flask:not([disabled])').forEach((node) => {
    node.addEventListener('pointerdown', (event) => drag?.begin(event, node.dataset.color));
    node.addEventListener('click', () => selectFlask(node.dataset.color));
  });
  drag = createDragToSlotDom({
    root: screen, slotSelector: '[data-slot=""]', slotPad: 90, hoverClass: 'is-ready',
    getPiece: (color) => ({ el: screen.querySelector(`.flask-${color}`), color }),
    ghostHost: () => screen, preventDefaultOnPress: false,
    canStart: () => !state.busy && state.phase === 'play',
    makeGhost: (piece) => { const ghost = piece.el.cloneNode(true); ghost.classList.add('flask-ghost'); return ghost; },
    onLift: (piece) => piece.el.classList.add('is-lifted'),
    onDrop: async (piece, record) => { piece.el.classList.remove('is-lifted'); if (record.slot) await pour(piece.color); },
    onCancel: (piece) => piece.el.classList.remove('is-lifted'),
  });
}

function selectFlask(color) {
  if (state.busy || state.phase !== 'play' || state.poured.includes(color)) return;
  state.selected = color;
  if (!state.muted) sfx.tick();
  document.querySelectorAll('.flask').forEach((node) => node.classList.toggle('is-selected', node.dataset.color === color));
}
function choosePrediction(color) {
  if (state.busy || state.phase !== 'predict') return;
  state.prediction = color; state.phase = 'play'; state.selected = null;
  if (!state.muted) sfx.pop(); renderPlay(); say(`pour-${currentRound().colors[0]}`);
}

async function pour(color) {
  const round = currentRound();
  if (!round || state.busy || state.phase !== 'play' || state.poured.includes(color)) return false;
  nudger.poke();
  if (state.mode !== 'recipe' && !round.colors.includes(color)) return gentleNudge(color, round);
  if (state.mode === 'recipe' && state.poured.length && state.poured[0] === color) {
    sfx.silly(); say(`same-${color}`); return false;
  }
  state.busy = true; state.selected = null;
  await animatePour(color);
  state.poured.push(color); state.busy = false;
  say(`pour-${color}`);
  renderPlay();
  if (state.poured.length < 2) return true;
  const made = pairResult(state.poured);
  if (!made) return false;
  state.result = made;
  if (state.mode === 'recipe' && made.result !== round.result) return recipeRetry(made);
  await reveal(made);
  return true;
}

async function animatePour(color) {
  const screen = screens.el('play'); const flask = screen.querySelector(`.flask-${color}`);
  const stream = screen.querySelector('.stream-layer');
  if (!flask || !stream) return;
  const beaker = screen.querySelector('.beaker-slot');
  const from = flask.getBoundingClientRect(); const to = beaker?.getBoundingClientRect();
  if (to) {
    const dx = to.left + to.width * .52 - (from.left + from.width / 2);
    const dy = to.top + to.height * .23 - (from.top + from.height / 2);
    flask.style.transform = `translate(${Math.round(dx)}px, ${Math.round(dy)}px) rotate(-72deg)`;
  }
  flask.classList.add('is-pouring');
  stream.innerHTML = img(config.primary[color].stream, '', `pour-stream stream-${color}`);
  glug(); if (!state.muted) sfx.whoosh();
  await timers.wait(state.reducedMotion ? 180 : 760);
  flask.classList.remove('is-pouring'); flask.style.transform = ''; stream.replaceChildren();
}

function gentleNudge(color, round) {
  const flask = document.querySelector(`.flask-${color}`);
  flask?.classList.add('is-wrong'); timers.after(420, () => flask?.classList.remove('is-wrong'));
  if (!state.muted) sfx.silly(); say(`nudge-${round.id}`); return false;
}

async function recipeRetry(made) {
  state.busy = true; state.phase = 'retry';
  const screen = screens.el('play'); const beaker = screen.querySelector('.beaker-slot'); const mascot = screen.querySelector('.mascot-reveal');
  beaker.querySelector('.beaker-art').src = config.beakers[made.result];
  mascot.innerHTML = img(config.mascots[made.result], `${made.result} color friend`, 'retry-mascot');
  say(`result-${made.result}`); await timers.wait(state.reducedMotion ? 180 : 1100); say(`nudge-${currentRound().id}`); await timers.wait(state.reducedMotion ? 180 : 1050);
  say('rinse'); state.poured = []; state.selected = null; state.result = null; state.phase = 'play'; state.busy = false; renderPlay();
}

async function reveal(made) {
  state.busy = true; state.phase = 'reveal'; nudger.stop();
  const screen = screens.el('play'); const beaker = screen.querySelector('.beaker-slot'); const swirl = beaker.querySelector('.swirl-art');
  screen.querySelector('.flask-dock')?.classList.add('is-revealed');
  swirl.src = config.swirls[made.result]; swirl.hidden = false;
  await timers.wait(state.reducedMotion ? 180 : 620);
  beaker.querySelector('.beaker-art').src = config.beakers[made.result]; swirl.hidden = true;
  const mascot = screen.querySelector('.mascot-reveal'); mascot.innerHTML = img(config.mascots[made.result], `${made.result} color friend`, 'result-mascot');
  const equation = screen.querySelector('.result-equation');
  equation.innerHTML = `${flaskPicture(made.colors[0])}<b>+</b>${flaskPicture(made.colors[1])}<b>=</b>${img(config.mascots[made.result], `${made.result} friend`, 'equation-mascot')}<span>${made.result}</span>`;
  const voiceKey = state.mode === 'predict' && state.prediction === made.result ? `predict-right-${made.result}`
    : state.mode === 'predict' ? `predict-surprise-${made.result}` : `result-${made.result}`;
  say(voiceKey);
  if (!state.reducedMotion) burstConfetti({ host: screen, count: 18, drift: 130, rng });
  const next = document.createElement('button'); next.type = 'button'; next.className = 'next-button'; next.dataset.target = 'next'; next.setAttribute('aria-label', 'Next experiment');
  next.style.backgroundImage = `url('${buttonArt('playButton')}')`; next.addEventListener('click', () => nextRound()); screen.querySelector('.lab-workbench').append(next);
  state.busy = false;
  timers.after(6000, () => nextRound());
}

function nextRound() {
  if (state.phase !== 'reveal') return;
  state.round += 1; state.phase = state.mode === 'predict' ? 'predict' : 'play'; state.poured = []; state.selected = null; state.prediction = null; state.result = null; state._choices = null;
  if (state.round >= config.rounds) renderEnd(); else { renderPlay(); say(promptKey()); }
}

function renderEnd() {
  clearFlow(); state.screen = 'end'; state.phase = 'end'; state.busy = false; screens.show('end');
  const screen = screens.el('end'); screen.style.backgroundImage = `url('${config.assets.play}')`;
  screen.innerHTML = ''; const hud = makeHud(config.rounds); hud.querySelector('[data-target="back"]').onclick = () => renderSplash(); screen.append(hud);
  const results = [...new Set(deck.map((mix) => mix.result))];
  const panel = document.createElement('section'); panel.className = 'end-panel'; panel.innerHTML = `<div class="end-friends">${results.map((result) => img(config.mascots[result], `${result} color friend`, 'end-mascot')).join('')}</div><h1>Your color lab is glowing!</h1><button type="button" class="play-again" data-target="again" aria-label="Choose another experiment" style="background-image:url('${buttonArt('playButton')}')"></button>`;
  panel.querySelector('.play-again').addEventListener('click', renderSplash); screen.append(panel); say('end');
}

function idleNudge(count) {
  if (state.screen !== 'play' || state.busy || state.phase !== 'play') return;
  const round = currentRound(); if (!round) return;
  if (count === 0) say(promptKey());
  else if (count === 1) document.querySelector(`.flask-${state.mode === 'recipe' ? Object.keys(config.primary).find((c) => !state.poured.includes(c)) : round.colors.find((c) => !state.poured.includes(c))}`)?.classList.add('is-idle-glow');
  else if (count === 2) {
    const color = state.mode === 'recipe' ? Object.keys(config.primary).find((c) => !state.poured.includes(c)) : round.colors.find((c) => !state.poured.includes(c));
    const flask = document.querySelector(`.flask-${color}`); flask?.classList.add('is-demo'); timers.after(900, () => flask?.classList.remove('is-demo'));
  }
}

function glug() {
  if (state.muted) return;
  try { const Ctx = window.AudioContext || window.webkitAudioContext; const ctx = new Ctx(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.setValueAtTime(170, ctx.currentTime); osc.frequency.exponentialRampToValueAtTime(92, ctx.currentTime + .16); gain.gain.setValueAtTime(.035, ctx.currentTime); gain.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + .18); osc.connect(gain).connect(ctx.destination); osc.start(); osc.stop(ctx.currentTime + .19); osc.onended = () => ctx.close(); } catch { /* sound is decorative */ }
}

async function tapTarget(id) {
  const target = document.querySelector(`[data-target="${CSS.escape(id)}"]`);
  if (target) { target.click(); await timers.wait(0); return true; }
  if (id.startsWith('flask-')) return pour(id.slice(6));
  if (id.startsWith('predict-')) return choosePrediction(id.slice(8));
  return false;
}
async function winRound() {
  if (state.phase === 'predict') await choosePrediction(currentRound().result);
  const colors = state.mode === 'recipe' ? currentRound().colors : currentRound().colors;
  for (const color of colors) { await pour(color); while (state.busy) await timers.wait(5); }
}

installDebug({
  gameId: config.id, engine: 'custom-dom', ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode: async (id) => startMode(id),
  getState: () => ({
    ...state,
    poured: [...state.poured],
    target: state.target?.id || null,
    result: state.result?.result || null,
    dragging: !!drag?.active,
    dragMoved: !!drag?.active?.moved,
    artFailures: artFailures.map((failure) => ({ ...failure })),
  }),
  getTargets: () => collectTargets(mount), tap: tapTarget, pour, predict: choosePrediction, winRound,
  home: renderSplash, getAudioLog: () => voice.getAudioLog(),
  mute: (on = true) => {
    state.muted = !!on;
    narrator.setMuted(state.muted); voice.setMuted(state.muted);
    return state.muted;
  },
  timers, narrator, voice, sfx, root: mount,
  onSeed: (nextRng, seed) => { rng = nextRng; state.seed = seed; },
});
