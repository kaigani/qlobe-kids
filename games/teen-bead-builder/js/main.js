import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { escapeHtml } from '../../../shared/js/dom.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { unlockAll, installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';

const app = document.getElementById('app');
const beadColors = ['gold', 'coral', 'teal', 'green', 'blue', 'cream'];
const choiceColors = [
  ['#efb82e', '#e07131'],
  ['#48beb9', '#238d9a'],
  ['#4fa8e6', '#3475c0'],
];
// Deliberate bead palette (matches the manipulative colours above) — not the
// platform QK_PALETTE, so it is passed through explicitly to burstConfetti.
const BEAD_CONFETTI_PALETTE = ['#f15f49', '#f6bd28', '#31aaa3', '#6fb33d', '#4a9fe0', '#fff3c5'];

const state = {
  screen: 'splash',
  mode: null,
  phase: null,
  target: null,
  roundIndex: 0,
  rounds: [],
  placed: 0,
  tutorialDone: false,
  awaitingInput: true,
  transition: false,
  muted: false,
  seed: 42,
};

let rng = mulberry32(state.seed);
let activeTargets = new Map();
let advanceTimer = 0;
let cancelConfetti = null;
let drag = null;

const timers = createTimers();
const nudger = createNudger({
  first: 9000,
  repeat: 9000,
  onNudge: () => {
    // The pre-migration scheduleIdle() carried this guard and it has to stay:
    // renderBuildRound() re-arms the nudger on every render, INCLUDING the ones
    // bundleTen()/completeRound() do mid-transition with awaitingInput already
    // false. Without it a nudge can talk over the transition it is waiting on.
    if (state.screen !== 'play' || !state.awaitingInput) return;
    repeatPrompt();
    const target = state.phase === 'match'
      ? app.querySelector('.number-choice')
      : app.querySelector('.place-tray.active');
    target?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.025)' }, { transform: 'scale(1)' }],
      { duration: 650 },
    );
  },
});

const ready = voice.init(
  './assets/audio/manifest.json',
  './assets/audio/lines.json',
  config.voice,
).then(() => true);

installUnlockOnGesture();
installKioskGuards();
window.addEventListener('pointermove', moveDrag, { passive: false });
window.addEventListener('pointerup', finishDrag, { passive: false });
window.addEventListener('pointercancel', cancelDrag);
window.addEventListener('blur', cancelDrag);

function unlockAudio() {
  unlockAll();
}

function stopTimers() {
  timers.clearAll();
  window.clearTimeout(advanceTimer);
  advanceTimer = 0;
  nudger.stop();
}

function playSfx(name) {
  if (!state.muted && typeof sfx[name] === 'function') sfx[name]();
}

function speak(key, fallback = config.voice[key]) {
  return voice.say(key, fallback);
}

function speakNumber(number) {
  return speak(`number-${number}`, config.numberWords[number]);
}

function speakSuccess(number) {
  const ones = number - 10;
  const more = ones === 1 ? 'one more' : `${config.numberWords[ones]} more`;
  return speak(`success-${number}`, `Ten and ${more} make ${config.numberWords[number]}!`);
}

function screenShell(name, inner) {
  activeTargets = new Map();
  cancelDrag();
  app.innerHTML = `<section class="screen ${name}">${inner}</section>`;
}

function registerTap(element, id, action, { sfxName = 'tick' } = {}) {
  if (!element) return;
  element.dataset.targetId = id;
  activeTargets.set(id, action);
  onTap(element, action, {
    feedback: () => {
      unlockAudio();
      if (sfxName) playSfx(sfxName);
    },
  });
}

function hud(kind, label) {
  return `<button class="hud hud-${kind}" type="button" aria-label="${escapeHtml(label)}"></button>`;
}

function miniTenBar(className = '') {
  return `<span class="ten-bar ${className}" aria-hidden="true">${Array.from({ length: 10 }, () => '<i class="bar-bead"></i>').join('')}</span>`;
}

function bead(className = 'gold', index = 0) {
  return `<span class="bead ${className}" style="--i:${index}" aria-hidden="true"></span>`;
}

function modeArt(modeId) {
  if (modeId === 'build') {
    return `<span class="mode-art" aria-hidden="true">
      ${miniTenBar('mini-bar')}
      <span class="mini-ones">${Array.from({ length: 3 }, () => '<i></i>').join('')}</span>
    </span>`;
  }
  return `<span class="mode-art" aria-hidden="true">
    ${miniTenBar('mini-bar')}
    <span class="mini-card">14</span>
  </span>`;
}

function renderSplash({ greet = false } = {}) {
  stopTimers();
  voice.stop();
  state.screen = 'splash';
  state.mode = null;
  state.phase = null;
  state.target = null;
  state.awaitingInput = true;
  state.transition = false;
  screenShell('splash', `
    ${hud('home', 'Home')}
    ${hud('sound', 'Hear the choices')}
    <img class="title-lockup" src="./assets/title.webp" alt="Teen Bead Builder" />
    <div class="mode-grid">
      ${config.modes.map((mode, index) => `
        <button class="mode-card" type="button" data-mode="${mode.id}" style="--i:${index}" aria-label="${escapeHtml(mode.title)}">
          ${modeArt(mode.id)}
          <span class="mode-label">${escapeHtml(mode.title)}</span>
        </button>
      `).join('')}
    </div>
  `);

  registerTap(app.querySelector('.hud-home'), 'home', () => { window.location.href = '../../'; });
  app.querySelectorAll('.mode-card').forEach((button) => {
    registerTap(button, `mode-${button.dataset.mode}`, () => startMode(button.dataset.mode), { sfxName: 'pop' });
  });
  registerTap(app.querySelector('.hud-sound'), 'sound', () => speak('welcome'));
  if (greet) speak('back');
}

async function startMode(modeId) {
  await ready;
  stopTimers();
  const mode = config.modes.find((item) => item.id === modeId) || config.modes[0];
  state.screen = 'play';
  state.mode = mode.id;
  state.rounds = shuffle(mode.rounds, rng);
  state.roundIndex = 0;
  state.placed = 0;
  state.transition = false;
  state.awaitingInput = true;

  if (mode.id === 'build') {
    state.phase = 'bundle';
    state.target = 10;
    state.tutorialDone = false;
    renderBuildRound();
    speak('buildIntro');
  } else {
    state.phase = 'match';
    state.target = state.rounds[0];
    renderMatchRound();
    speak('matchIntro');
  }
}

function progressDots() {
  const total = state.mode === 'build' ? state.rounds.length + 1 : state.rounds.length;
  const current = state.mode === 'build' ? (state.phase === 'bundle' ? 0 : state.roundIndex + 1) : state.roundIndex;
  return `<span class="progress-dots" aria-label="Round ${current + 1} of ${total}">
    ${Array.from({ length: total }, (_, index) => `<i class="${index < current ? 'done' : index === current ? 'current' : ''}"></i>`).join('')}
  </span>`;
}

function playShell(workspace, prompt, count = '') {
  screenShell('play', `
    ${hud('back', 'Back to game menu')}
    ${hud('sound prompt-sound', 'Hear the prompt again')}
    <header class="play-header">
      <div class="target-badge" aria-label="${config.numberWords[state.target]}">${state.target}</div>
      ${progressDots()}
    </header>
    <div class="workspace">${workspace}</div>
    <div class="prompt-ribbon">
      ${count !== '' ? `<span class="prompt-count" aria-hidden="true">${count}</span>` : ''}
      <span>${escapeHtml(prompt)}</span>
    </div>
  `);
  registerTap(app.querySelector('.hud-back'), 'back', () => renderSplash({ greet: true }), { sfxName: 'unpop' });
  registerTap(app.querySelector('.hud-sound'), 'sound', repeatPrompt);
}

function renderBuildRound() {
  stopTimers();
  state.screen = 'play';
  state.phase = state.phase === 'bundle' ? 'bundle' : 'build';
  state.awaitingInput = !state.transition;
  const isBundle = state.phase === 'bundle';
  const needed = isBundle ? 10 : state.target - 10;
  const label = isBundle ? 'TEN FRAME' : 'ONES';
  const slotCount = isBundle ? 10 : 9;
  const frameClass = isBundle ? 'ten-frame' : 'ones-frame';
  const sourceColor = beadColors[state.placed % beadColors.length];
  const showingBundleResult = isBundle && state.transition && state.tutorialDone;
  const filled = Array.from({ length: slotCount }, (_, index) => {
    const full = index < state.placed;
    return `<span class="bead-slot ${full ? 'filled' : ''}" data-slot="${index}">
      ${full ? bead(beadColors[index % beadColors.length], index) : ''}
      ${full && index === state.placed - 1 && !state.transition
        ? `<button type="button" aria-label="Take the last bead back" data-remove="${index}"></button>`
        : ''}
    </span>`;
  }).join('');

  const tensTray = !isBundle ? `
    <section class="place-tray" aria-label="One ten">
      <span class="tray-label">TEN</span>
      <div class="ten-home">${miniTenBar('bundle-result')}</div>
      <span class="equation-chip">10</span>
    </section>` : '';
  const activeTray = showingBundleResult ? `
    <section class="place-tray" aria-label="One bundled ten">
      <span class="tray-label">ONE TEN</span>
      <div class="ten-home">${miniTenBar('bundle-result')}</div>
      <span class="equation-chip">10 ones</span>
    </section>` : `
      <section class="place-tray active" data-drop-zone aria-label="${label}">
        <span class="tray-label">${label}</span>
        <div class="${frameClass} ${state.transition && isBundle ? 'bundling' : ''}">${filled}</div>
        <span class="equation-chip">${isBundle ? `${state.placed} / 10` : `10 + ${state.placed}`}</span>
      </section>`;
  const source = showingBundleResult ? '' : `
    <button class="bead-source" type="button" data-bead-source data-bead-color="${sourceColor}"
      aria-label="Add one ${sourceColor} bead">
      ${bead(sourceColor)}
    </button>`;
  const prompt = showingBundleResult
    ? 'Ten ones made one ten!'
    : isBundle
    ? (state.placed < 10 ? 'Fill the ten frame' : 'Watch ten ones bundle!')
    : `Add ${config.numberWords[needed]} more after ten`;

  playShell(`
    <div class="build-board ${isBundle ? 'bundle-board' : ''} ${showingBundleResult ? 'bundle-complete' : ''}">
      ${tensTray}
      ${activeTray}
      ${source}
    </div>
  `, prompt, state.placed);

  app.querySelectorAll('[data-remove]').forEach((button) => {
    registerTap(button, `remove-${button.dataset.remove}`, () => removeBead(Number(button.dataset.remove)), { sfxName: 'unpop' });
  });
  wireBeadSource(app.querySelector('[data-bead-source]'));
  nudger.arm();
}

// ---- Hand-rolled drag: kept exactly as-is (Wave 4 ships a shared DOM drag
// adapter; until then this stays as written — see the migration brief). -----

function wireBeadSource(source) {
  if (!source || state.transition) return;
  activeTargets.set('bead-source', addBead);
  source.dataset.targetId = 'bead-source';
  source.addEventListener('pointerdown', (event) => {
    if (!state.awaitingInput || drag) return;
    event.preventDefault();
    unlockAudio();
    playSfx('pop');
    const color = source.dataset.beadColor || beadColors[state.placed % beadColors.length];
    const ghost = document.createElement('span');
    ghost.className = `bead drag-ghost ${color}`;
    ghost.style.left = `${event.clientX}px`;
    ghost.style.top = `${event.clientY}px`;
    document.body.append(ghost);
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      moved: false,
      ghost,
      source,
    };
    try { source.setPointerCapture(event.pointerId); } catch { /* window listeners still cover it */ }
  });
}

function moveDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  drag.x = event.clientX;
  drag.y = event.clientY;
  drag.moved ||= Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 12;
  drag.ghost.style.left = `${event.clientX}px`;
  drag.ghost.style.top = `${event.clientY}px`;
  const zone = app.querySelector('[data-drop-zone]');
  if (zone) {
    const rect = zone.getBoundingClientRect();
    zone.classList.toggle('drag-over', pointInRect(event.clientX, event.clientY, rect, 45));
  }
}

function finishDrag(event) {
  if (!drag || event.pointerId !== drag.pointerId) return;
  event.preventDefault();
  const current = drag;
  const zone = app.querySelector('[data-drop-zone]');
  const upX = Number.isFinite(event.clientX) ? event.clientX : current.x;
  const upY = Number.isFinite(event.clientY) ? event.clientY : current.y;
  const zoneRect = zone?.getBoundingClientRect();
  const valid = !current.moved || (zoneRect && (
    pointInRect(upX, upY, zoneRect, 45)
      || pointInRect(current.x, current.y, zoneRect, 45)
  ));
  cancelDrag();
  if (valid) addBead();
  else {
    playSfx('boing');
    if (zone) {
      zone.animate(
        [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(0)' }],
        { duration: 380 },
      );
    }
    speak('bundleNudge');
  }
}

function cancelDrag(event) {
  if (!drag || (event?.pointerId != null && event.pointerId !== drag.pointerId)) return;
  drag.ghost?.remove();
  try { drag.source?.releasePointerCapture(drag.pointerId); } catch { /* ignore */ }
  app.querySelector('[data-drop-zone]')?.classList.remove('drag-over');
  drag = null;
}

function pointInRect(x, y, rect, pad = 0) {
  return x >= rect.left - pad && x <= rect.right + pad && y >= rect.top - pad && y <= rect.bottom + pad;
}

// ---- end hand-rolled drag ---------------------------------------------

function addBead() {
  if (!state.awaitingInput || state.transition || state.screen !== 'play' || !['bundle', 'build'].includes(state.phase)) return;
  const needed = state.phase === 'bundle' ? 10 : state.target - 10;
  if (state.placed >= needed) return;
  stopTimers();
  state.placed += 1;
  playSfx('pop');
  renderBuildRound();
  if (state.placed >= needed) {
    if (state.phase === 'bundle') bundleTen();
    else completeRound();
  }
}

function removeBead(index) {
  if (!state.awaitingInput || state.transition || index >= state.placed) return;
  stopTimers();
  state.placed = Math.max(0, state.placed - 1);
  renderBuildRound();
}

async function bundleTen() {
  state.transition = true;
  state.awaitingInput = false;
  renderBuildRound();
  playSfx('whoosh');
  await timers.wait(850);
  if (state.phase !== 'bundle') return;
  state.tutorialDone = true;
  renderBuildRound();
  playSfx('tada');
  await speak('tenMade');
  showCelebration(10, { tutorial: true });
}

function repeatPrompt() {
  if (state.screen === 'splash') return speak('welcome');
  if (state.screen === 'end') return speak('finish');
  if (state.phase === 'bundle') return speak('buildIntro');
  if (state.phase === 'build') {
    speak('countOn');
    return speakNumber(state.target);
  }
  return speak('chooseNumber');
}

function renderMatchRound() {
  stopTimers();
  state.screen = 'play';
  state.phase = 'match';
  state.awaitingInput = true;
  state.transition = false;
  const ones = state.target - 10;
  const choices = makeChoices(state.target);
  const modelOnes = Array.from({ length: ones }, (_, index) => bead(beadColors[index % beadColors.length], index)).join('');
  playShell(`
    <div class="match-board">
      <section class="model-card" aria-label="One ten and ${ones} ${ones === 1 ? 'one' : 'ones'}">
        ${miniTenBar()}
        <div class="model-ones">${modelOnes}</div>
      </section>
      <div class="choices">
        ${choices.map((number, index) => `
          <button class="number-choice" type="button" data-choice="${number}" style="--choice-a:${choiceColors[index][0]};--choice-b:${choiceColors[index][1]}" aria-label="${config.numberWords[number]}">
            ${number}
          </button>`).join('')}
      </div>
    </div>
  `, 'Which number do the beads show?', ones);

  app.querySelectorAll('[data-choice]').forEach((button) => {
    const number = Number(button.dataset.choice);
    registerTap(button, `choice-${number}`, () => chooseNumber(number), { sfxName: 'pop' });
  });
  nudger.arm();
}

function makeChoices(target) {
  const pool = [target];
  const near = [target - 1, target + 1, target - 2, target + 2]
    .filter((number) => number >= 11 && number <= 19);
  while (pool.length < 3 && near.length) {
    const index = Math.floor(rng() * near.length);
    const [number] = near.splice(index, 1);
    if (!pool.includes(number)) pool.push(number);
  }
  for (let number = 11; pool.length < 3 && number <= 19; number += 1) {
    if (!pool.includes(number)) pool.push(number);
  }
  return shuffle(pool, rng);
}

function chooseNumber(number) {
  if (!state.awaitingInput || state.transition || state.phase !== 'match') return;
  stopTimers();
  const button = app.querySelector(`[data-choice="${number}"]`);
  if (number !== state.target) {
    button?.classList.remove('wrong');
    void button?.offsetWidth;
    button?.classList.add('wrong');
    playSfx('boing');
    speak('tryAgain');
    nudger.arm();
    return;
  }
  state.awaitingInput = false;
  state.transition = true;
  button?.classList.add('correct');
  completeRound();
}

async function completeRound() {
  state.awaitingInput = false;
  state.transition = true;
  stopTimers();
  playSfx('sparkle');
  await timers.wait(280);
  await speakSuccess(state.target);
  if (state.screen === 'play') showCelebration(state.target);
}

function showCelebration(number, { tutorial = false } = {}) {
  stopTimers();
  state.screen = 'celebration';
  activeTargets = new Map();
  const ones = Math.max(0, number - 10);
  const overlay = document.createElement('div');
  overlay.className = 'celebration';
  overlay.innerHTML = `
    <div class="celebrate-card" role="dialog" aria-label="${tutorial ? 'One ten made' : `${config.numberWords[number]} made`}">
      <div class="celebrate-number">${number}</div>
      <div class="celebrate-equation">${tutorial ? '10 ones = 1 ten' : `10 + ${ones} = ${number}`}</div>
      <button class="next-button" type="button" aria-label="${tutorial ? 'Build teen numbers' : 'Next number'}"></button>
    </div>
  `;
  app.append(overlay);
  registerTap(overlay.querySelector('.next-button'), 'next', nextRound, { sfxName: 'sparkle' });
  playSfx('tada');
  cancelConfetti = burstConfetti({ host: overlay, count: 34, palette: BEAD_CONFETTI_PALETTE });
  // 450ms floor even under fastTimers(), same guarantee the old raw
  // setTimeout(…, Math.max(450, 3900 * timeScale)) gave the celebration card.
  advanceTimer = window.setTimeout(nextRound, Math.max(450, timers.ms(3900)));
}

function nextRound() {
  stopTimers();
  cancelConfetti?.();
  cancelConfetti = null;
  app.querySelector('.celebration')?.remove();
  state.screen = 'play';
  state.transition = false;
  state.awaitingInput = true;
  state.placed = 0;

  if (state.mode === 'build' && state.phase === 'bundle') {
    state.phase = 'build';
    state.roundIndex = 0;
    state.target = state.rounds[0];
    renderBuildRound();
    speak('countOn').then(() => speakNumber(state.target));
    return;
  }

  state.roundIndex += 1;
  if (state.roundIndex >= state.rounds.length) {
    renderEnd();
    return;
  }
  state.target = state.rounds[state.roundIndex];
  if (state.mode === 'build') {
    state.phase = 'build';
    renderBuildRound();
    speakNumber(state.target);
  } else {
    state.phase = 'match';
    renderMatchRound();
    speak('chooseNumber');
  }
}

function renderEnd() {
  stopTimers();
  state.screen = 'end';
  state.phase = 'end';
  state.awaitingInput = true;
  screenShell('end', `
    ${hud('back', 'Back to game menu')}
    ${hud('sound', 'Hear the celebration')}
    <div class="end-card">
      <div class="end-number-arch" aria-hidden="true">
        ${Array.from({ length: 9 }, (_, index) => {
          const colors = ['#e46d45', '#efb72c', '#39aca3', '#7cad37', '#4e9fdc'];
          const offsets = [18, 8, 0, -7, -10, -7, 0, 8, 18];
          return `<span style="--c:${colors[index % colors.length]};--y:${offsets[index]}px">${index + 11}</span>`;
        }).join('')}
      </div>
      <h2>Teen Number Builder!</h2>
      <div class="end-actions">
        <button class="end-action" type="button" data-replay>Play Again</button>
        <button class="end-action" type="button" data-menu>Pick a Mode</button>
      </div>
    </div>
  `);
  registerTap(app.querySelector('.hud-back'), 'back', () => renderSplash({ greet: true }), { sfxName: 'unpop' });
  registerTap(app.querySelector('.hud-sound'), 'sound', () => speak('finish'));
  registerTap(app.querySelector('[data-replay]'), 'replay', () => startMode(state.mode), { sfxName: 'pop' });
  registerTap(app.querySelector('[data-menu]'), 'menu', () => renderSplash(), { sfxName: 'tick' });
  playSfx('tada');
  speak('finish');
}

function debugState() {
  return {
    screen: state.screen,
    mode: state.mode,
    phase: state.phase,
    target: state.target,
    roundIndex: state.roundIndex,
    rounds: [...state.rounds],
    placed: state.placed,
    tutorialDone: state.tutorialDone,
    awaitingInput: state.awaitingInput,
    transition: state.transition,
    muted: state.muted,
    seed: state.seed,
  };
}

function debugTargets() {
  return [...activeTargets.keys()].map((id) => {
    const element = app.querySelector(`[data-target-id="${CSS.escape(id)}"]`);
    const rect = element?.getBoundingClientRect();
    const choice = id.startsWith('choice-') ? Number(id.slice(7)) : null;
    return {
      id,
      label: element?.getAttribute('aria-label') || id,
      role: choice == null ? undefined : choice === state.target ? 'correct' : 'wrong',
      rect: rect ? { x: rect.x, y: rect.y, w: rect.width, h: rect.height } : null,
    };
  });
}

function debugTap(id) {
  const action = activeTargets.get(id);
  if (!action) return false;
  action();
  return true;
}

function winRound() {
  if (state.phase === 'bundle' || state.phase === 'build') {
    const needed = state.phase === 'bundle' ? 10 : state.target - 10;
    state.placed = needed;
    renderBuildRound();
    if (state.phase === 'bundle') bundleTen();
    else completeRound();
    return true;
  }
  if (state.phase === 'match') {
    chooseNumber(state.target);
    return true;
  }
  if (state.screen === 'celebration') {
    nextRound();
    return true;
  }
  return false;
}

installDebug({
  gameId: config.id,
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: debugState,
  getTargets: debugTargets,
  tap: debugTap,
  winRound,
  home: renderSplash,
  timers,
  onSeed: (nextRng, value) => {
    rng = nextRng;
    state.seed = value;
  },
  mute(value = true) {
    state.muted = value !== false;
    voice.setMuted(state.muted);
    return state.muted;
  },
  getAudioLog: () => voice.getAudioLog(),
  clearAudioLog: () => voice.clearAudioLog(),
});

renderSplash();
