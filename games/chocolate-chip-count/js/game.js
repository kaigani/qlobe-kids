import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import { onTap } from '../../../shared/js/tap.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { burstConfetti, tada } from '../../../shared/js/celebrate.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';

const BALLOON_ART = {
  red: './assets/balloon-red.webp',
  yellow: './assets/balloon-yellow.webp',
  blue: './assets/balloon-blue.webp',
};

const CHIP_LAYOUTS = {
  3: [[50, 24, -6], [32, 62, 5], [68, 62, -2]],
  6: [[31, 25, -8], [69, 25, 7], [50, 47, -2], [27, 70, 5], [50, 76, -5], [73, 70, 8]],
  10: [[25, 23, -8], [50, 18, 4], [75, 23, 8], [35, 42, 6], [65, 42, -5], [21, 62, -7], [50, 58, 4], [79, 62, 7], [36, 79, -4], [64, 79, 5]],
};

const CHIP_SIZE = { 3: 20, 6: 16.5, 10: 13.5 };
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function img(src, className, alt = '') {
  const node = new Image();
  node.src = src;
  node.alt = alt;
  if (className) node.className = className;
  return node;
}

function preload(urls) {
  return Promise.all([...new Set(urls)].map((url) => new Promise((resolve) => {
    const node = new Image();
    const done = () => resolve(url);
    node.addEventListener('load', done, { once: true });
    node.addEventListener('error', done, { once: true });
    node.src = url;
    if (node.complete) done();
  })));
}

function populateCookie(host, count, chipArt, cookieArt, newest = -1) {
  host.replaceChildren();
  host.dataset.count = String(count);
  host.append(img(cookieArt, 'cookie-base'));
  const layout = CHIP_LAYOUTS[count] || CHIP_LAYOUTS[10].slice(0, count);
  layout.forEach(([x, y, rotation], index) => {
    const chip = img(chipArt, `cookie-chip${index === newest ? ' is-new' : ''}`);
    chip.style.left = `${x}%`;
    chip.style.top = `${y}%`;
    chip.style.setProperty('--chip-size', `${CHIP_SIZE[count] || 13}%`);
    chip.style.setProperty('--chip-rotate', `${rotation}deg`);
    host.append(chip);
  });
}

export function createChocolateChipCount(config, root) {
  const timers = createTimers();
  const els = {
    splash: root.querySelector('#splash'),
    play: root.querySelector('#play'),
    reward: root.querySelector('#reward'),
    recipeGrid: root.querySelector('#recipe-grid'),
    playButton: root.querySelector('#play-button'),
    balloonRow: root.querySelector('#balloon-row'),
    catchField: root.querySelector('#catch-field'),
    chipLayer: root.querySelector('#chip-layer'),
    chef: root.querySelector('#chef-runner'),
    tray: root.querySelector('.tray-hitbox'),
    gesture: root.querySelector('#gesture-cue'),
    progress: root.querySelector('#progress-cookie'),
    playStatus: root.querySelector('#play-status'),
    rewardCookie: root.querySelector('#reward-cookie'),
    rewardStatus: root.querySelector('#reward-status'),
    again: root.querySelector('#again-button'),
    next: root.querySelector('#next-button'),
  };

  let rng = mulberry32(42);
  let seedValue = 42;
  let raf = 0;
  let lastFrame = 0;
  let roundToken = 0;
  let voiceToken = 0;
  let voiceQueue = Promise.resolve();
  let idleTimer = null;
  let confettiDispose = null;
  let drag = null;
  let gestureMoved = false;
  let returnVoiceUsed = false;
  let rewardReadyResolve = null;
  let targetHandlers = new Map();
  const permanentDisposers = [];

  const state = {
    screen: 'splash',
    phase: 'choose',
    modeId: config.initialMode,
    target: 3,
    caught: 0,
    balloonIndex: 0,
    activeChips: [],
    returnedChips: 0,
    trayX: 0.5,
    awaitingInput: true,
    advancing: false,
    muted: false,
    reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false,
    currentPrompt: 'pick',
  };

  const screens = createScreens({
    root,
    initial: 'splash',
    voice,
    onEnter(name) {
      state.screen = name;
      state.phase = name === 'splash' ? 'choose' : state.phase;
    },
  });

  function modeById(id) {
    return config.modes.find((item) => item.id === id) || config.modes[0];
  }

  function currentMode() {
    return modeById(state.modeId);
  }

  function playSfx(name) {
    if (state.muted || typeof sfx[name] !== 'function') return;
    try { sfx[name](); } catch { /* effects are never load-bearing */ }
  }

  function resetVoiceQueue() {
    voiceToken += 1;
    voiceQueue = Promise.resolve();
    voice.stop();
  }

  function say(key) {
    state.currentPrompt = key;
    const token = voiceToken;
    voiceQueue = voiceQueue.then(() => {
      if (token !== voiceToken) return undefined;
      return voice.say(key, config.voice[key]);
    });
    return voiceQueue;
  }

  function clearIdle() {
    if (idleTimer != null) timers.clear(idleTimer);
    idleTimer = null;
  }

  function resetIdle(kind = state.phase) {
    clearIdle();
    if (state.screen !== 'play') return;
    const token = roundToken;
    idleTimer = timers.after(kind === 'pop' ? 7200 : 8300, () => {
      if (token !== roundToken || state.screen !== 'play' || !state.awaitingInput) return;
      if (state.phase === 'pop') {
        els.balloonRow.querySelector('.balloon.is-active')?.classList.add('is-nudging');
        say('idle-pop');
      } else if (state.phase === 'catch') {
        els.gesture.classList.remove('is-dismissed');
        say('idle-catch');
      }
    });
  }

  function renderSelectedMode() {
    const mode = currentMode();
    state.target = mode.target;
    for (const card of els.recipeGrid.querySelectorAll('.recipe-card')) {
      const selected = card.dataset.mode === mode.id;
      card.classList.toggle('is-selected', selected);
      card.setAttribute('aria-pressed', String(selected));
    }
    els.playButton.setAttribute('aria-label', `Play ${mode.title}, catch ${mode.target} chocolate chips`);
  }

  function selectMode(id, { speak = true } = {}) {
    const mode = modeById(id);
    if (!mode) return { accepted: false };
    state.modeId = mode.id;
    state.target = mode.target;
    renderSelectedMode();
    playSfx('tick');
    if (speak) say(`mode-${mode.target}`);
    return { accepted: true };
  }

  function renderRecipeCards() {
    els.recipeGrid.replaceChildren();
    config.modes.forEach((mode, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'recipe-card';
      button.dataset.mode = mode.id;
      button.dataset.target = `mode-${mode.id}`;
      button.dataset.role = 'neutral';
      button.style.setProperty('--i', index);
      button.style.setProperty('--tilt', `${[-2, 1.5, -1][index]}deg`);
      button.setAttribute('aria-label', `${mode.title}: catch ${mode.target} chocolate chips`);
      const frame = img(mode.frame, 'frame');
      const cookie = document.createElement('span');
      cookie.className = 'cookie-composite';
      populateCookie(cookie, mode.target, config.assets.chip, config.assets.cookie);
      button.append(frame, cookie);
      const handler = () => selectMode(mode.id);
      targetHandlers.set(button.dataset.target, handler);
      permanentDisposers.push(onTap(button, handler, {
        feedback: (event) => { event.preventDefault(); unlockAll(); },
      }));
      els.recipeGrid.append(button);
    });
    renderSelectedMode();
  }

  function renderProgress(newest = -1) {
    populateCookie(els.progress, state.caught, config.assets.chip, config.assets.cookie, newest);
    els.progress.setAttribute('aria-label', `${state.caught} of ${state.target} chocolate chips caught`);
  }

  function updateBalloonStates() {
    for (const button of els.balloonRow.querySelectorAll('.balloon')) {
      const index = Number(button.dataset.index);
      button.classList.toggle('is-active', index === state.balloonIndex && state.phase === 'pop');
      button.classList.toggle('is-caught', index < state.balloonIndex);
      button.dataset.role = index === state.balloonIndex && state.phase === 'pop' ? 'correct' : 'neutral';
      button.disabled = index !== state.balloonIndex || state.phase !== 'pop';
    }
  }

  function renderBalloons(mode) {
    els.balloonRow.replaceChildren();
    mode.batches.forEach((count, index) => {
      const color = mode.balloons[index % mode.balloons.length];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'balloon';
      button.dataset.index = String(index);
      button.dataset.target = `balloon-${index}`;
      button.dataset.role = 'neutral';
      button.setAttribute('aria-label', `Pop ${color} balloon with ${count} chocolate ${count === 1 ? 'chip' : 'chips'}`);
      button.append(img(BALLOON_ART[color], '', ''));
      const handler = () => popBalloon(index);
      targetHandlers.set(button.dataset.target, handler);
      permanentDisposers.push(onTap(button, handler, {
        feedback: (event) => { event.preventDefault(); unlockAll(); },
      }));
      els.balloonRow.append(button);
    });
    updateBalloonStates();
  }

  function setRunnerWidth() {
    const mode = currentMode();
    const field = els.catchField.getBoundingClientRect();
    const desired = clamp(field.width * (mode.trayWidth / 0.78), 250, 540);
    els.chef.style.setProperty('--runner-width', `${desired}px`);
  }

  function updateChef() {
    els.chef.style.left = `${state.trayX * 100}%`;
  }

  function setTrayX(value) {
    state.trayX = clamp(Number(value) || 0, 0.13, 0.87);
    updateChef();
    return state.trayX;
  }

  function clearChips() {
    for (const chip of state.activeChips) chip.el?.remove();
    state.activeChips = [];
    els.chipLayer.replaceChildren();
  }

  function teardownRound({ keepMode = true } = {}) {
    roundToken += 1;
    clearIdle();
    timers.clearAll();
    clearChips();
    state.awaitingInput = false;
    state.advancing = false;
    drag = null;
    resetVoiceQueue();
    confettiDispose?.();
    confettiDispose = null;
    if (!keepMode) state.modeId = config.initialMode;
  }

  function beginPopPhase({ first = false } = {}) {
    state.phase = 'pop';
    state.awaitingInput = true;
    updateBalloonStates();
    say(first ? 'pop' : 'pop-next');
    resetIdle('pop');
  }

  function startMode(id = state.modeId) {
    if (!modeById(id)) return Promise.resolve({ accepted: false });
    teardownRound();
    state.modeId = id;
    const mode = currentMode();
    state.target = mode.target;
    state.caught = 0;
    state.balloonIndex = 0;
    state.returnedChips = 0;
    state.trayX = 0.5;
    state.phase = 'intro';
    state.awaitingInput = false;
    state.advancing = false;
    returnVoiceUsed = false;
    gestureMoved = false;
    els.gesture.classList.remove('is-dismissed');
    renderProgress();
    renderBalloons(mode);
    updateChef();
    screens.show('play', { force: true });
    state.screen = 'play';
    setRunnerWidth();
    const token = roundToken;
    const ready = say('move').then(() => {
      if (token !== roundToken || state.screen !== 'play') return { accepted: false };
      beginPopPhase({ first: true });
      return { accepted: true };
    });
    return ready;
  }

  function spawnCluster(count, balloonButton) {
    const field = els.catchField.getBoundingClientRect();
    const balloonRect = balloonButton.getBoundingClientRect();
    const mode = currentMode();
    const originX = clamp((balloonRect.left + balloonRect.width / 2 - field.left) / field.width, 0.2, 0.8);
    const spread = mode.spread;
    const offsets = count === 1 ? [0] : count === 2 ? [-0.42, 0.42] : [-0.58, 0, 0.58];
    state.activeChips = [];
    offsets.slice(0, count).forEach((offset, index) => {
      const el = img(config.assets.chip, 'falling-chip');
      el.style.setProperty('--spin', `${[-8, 7, -3][index % 3]}deg`);
      els.chipLayer.append(el);
      const jitter = (rng() - 0.5) * spread * 0.12;
      const chip = {
        id: `chip-${state.balloonIndex}-${index}`,
        el,
        x: clamp(originX + offset * spread + jitter, 0.08, 0.92),
        y: 0.14 - index * 0.055,
        prevY: 0.14 - index * 0.055,
        vx: (rng() - 0.5) * (0.025 + spread * 0.055),
        vy: mode.speed * (0.9 + rng() * 0.13),
        returnCount: 0,
        caught: false,
        returning: false,
      };
      state.activeChips.push(chip);
      placeChip(chip);
    });
    state.phase = 'catch';
    state.awaitingInput = true;
    resetIdle('catch');
  }

  function popBalloon(index) {
    const expected = state.balloonIndex;
    if (state.screen !== 'play' || state.phase !== 'pop' || index !== expected) return { accepted: false };
    clearIdle();
    state.awaitingInput = false;
    const button = els.balloonRow.querySelector(`[data-index="${index}"]`);
    if (!button) return { accepted: false };
    button.classList.remove('is-active');
    button.classList.add('is-popping');
    playSfx('pop');
    const count = currentMode().batches[index];
    timers.after(state.reducedMotion ? 20 : 210, () => {
      button.classList.remove('is-popping');
      button.classList.add('is-caught');
      spawnCluster(count, button);
    });
    return { accepted: true };
  }

  function placeChip(chip) {
    chip.el.style.left = `${chip.x * 100}%`;
    chip.el.style.top = `${chip.y * 100}%`;
  }

  function chipCaughtByTray(chip, fieldRect, trayRect) {
    const x = fieldRect.left + chip.x * fieldRect.width;
    const previousY = fieldRect.top + chip.prevY * fieldRect.height;
    const currentY = fieldRect.top + chip.y * fieldRect.height;
    const radius = Math.max(18, Math.min(fieldRect.width, fieldRect.height) * 0.028);
    const help = chip.returnCount > 0 ? radius * 1.18 : radius;
    const withinX = x >= trayRect.left - help && x <= trayRect.right + help;
    const crosses = previousY - radius <= trayRect.bottom && currentY + radius >= trayRect.top;
    return withinX && crosses && currentY <= trayRect.bottom + radius;
  }

  function catchChip(chip) {
    if (!chip || chip.caught || chip.returning || state.screen !== 'play') return false;
    chip.caught = true;
    state.caught += 1;
    state.awaitingInput = false;
    chip.el.classList.add('is-caught');
    playSfx('pop');
    renderProgress(state.caught - 1);
    els.playStatus.textContent = `${state.caught} of ${state.target} chocolate chips caught.`;
    say(`count-${state.caught}`);
    timers.after(360, () => chip.el.remove());

    if (state.activeChips.every((item) => item.caught)) {
      state.advancing = true;
      if (state.caught >= state.target) {
        voiceQueue.then(() => completeRound());
      } else {
        timers.after(620, () => {
          if (state.screen !== 'play') return;
          state.balloonIndex += 1;
          state.activeChips = [];
          state.advancing = false;
          beginPopPhase();
        });
      }
    } else {
      state.awaitingInput = true;
      resetIdle('catch');
    }
    return true;
  }

  function returnChip(chip) {
    if (!chip || chip.caught || chip.returning) return false;
    chip.returning = true;
    chip.returnCount += 1;
    state.returnedChips += 1;
    chip.el.classList.add('is-returning');
    playSfx('boing');
    if (!returnVoiceUsed) {
      returnVoiceUsed = true;
      say('boing');
    }
    timers.after(480, () => {
      if (state.screen !== 'play' || chip.caught) return;
      chip.returning = false;
      chip.y = 0.17;
      chip.prevY = chip.y;
      chip.vy *= 0.88;
      chip.vx *= 0.62;
      chip.el.classList.remove('is-returning');
      placeChip(chip);
      state.awaitingInput = true;
      resetIdle('catch');
    });
    return true;
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const elapsed = lastFrame ? Math.min(50, now - lastFrame) : 16;
    lastFrame = now;
    if (state.screen !== 'play' || state.phase !== 'catch') return;

    const fieldRect = els.catchField.getBoundingClientRect();
    const trayRect = els.tray.getBoundingClientRect();
    const seconds = elapsed / 1000;
    for (const chip of state.activeChips) {
      if (chip.caught || chip.returning) continue;
      chip.prevY = chip.y;
      chip.vy += seconds * 0.018;
      chip.x += chip.vx * seconds;
      chip.y += chip.vy * seconds;
      if (chip.x < 0.055 || chip.x > 0.945) {
        chip.x = clamp(chip.x, 0.055, 0.945);
        chip.vx *= -0.78;
      }
      placeChip(chip);
      if (chipCaughtByTray(chip, fieldRect, trayRect)) catchChip(chip);
      else if (chip.y > 0.91) returnChip(chip);
    }
  }

  async function completeRound() {
    if (state.screen !== 'play' || state.phase === 'complete') return;
    clearIdle();
    state.phase = 'complete';
    state.awaitingInput = false;
    state.advancing = true;
    playSfx('sparkle');
    await timers.wait(state.reducedMotion ? 20 : 380);
    if (state.screen !== 'play') return;
    screens.show('reward');
    state.screen = 'reward';
    state.phase = 'reward';
    state.awaitingInput = true;
    state.advancing = false;
    populateCookie(els.rewardCookie, state.target, config.assets.chip, config.assets.cookie, state.target - 1);
    els.rewardStatus.textContent = `You caught ${state.target} chocolate chips. Great counting!`;
    tada({ confetti: false });
    confettiDispose?.();
    confettiDispose = burstConfetti({
      host: els.reward,
      count: state.target === 10 ? 38 : 28,
      duration: 2400,
      rng,
      palette: ['#ef5b4c', '#f4c53d', '#79c995', '#78a9e4', '#9b6035'],
    });
    await say(`complete-${state.target}`);
    rewardReadyResolve?.();
    rewardReadyResolve = null;
  }

  function showSplash({ speak = false } = {}) {
    teardownRound();
    screens.show('splash');
    state.screen = 'splash';
    state.phase = 'choose';
    state.awaitingInput = true;
    renderSelectedMode();
    if (speak) say('pick');
    return { accepted: true };
  }

  function replayPrompt() {
    resetVoiceQueue();
    return say(state.currentPrompt || (state.screen === 'splash' ? 'pick' : 'move'));
  }

  function again() {
    const modeId = state.modeId;
    return say('again').then(() => startMode(modeId));
  }

  function next() {
    const index = config.modes.findIndex((mode) => mode.id === state.modeId);
    const mode = config.modes[(index + 1) % config.modes.length];
    return say('next').then(() => startMode(mode.id));
  }

  function wirePermanentControls() {
    const home = hudButton('home', () => { voice.stop(); window.location.href = '../../'; });
    home.classList.add('qk-hud-top-left');
    const splashSound = hudButton('sound', soundDebounce(() => replayPrompt()));
    splashSound.classList.add('qk-hud-top-right');
    els.splash.querySelector('.hud-mount').append(home, splashSound);

    const playBack = hudButton('back', () => showSplash({ speak: true }));
    playBack.classList.add('qk-hud-top-left');
    const playSound = hudButton('sound', soundDebounce(() => replayPrompt()));
    playSound.classList.add('qk-hud-top-right');
    els.play.querySelector('.hud-mount').append(playBack, playSound);

    const rewardBack = hudButton('back', () => showSplash({ speak: true }));
    rewardBack.classList.add('qk-hud-top-left');
    const rewardSound = hudButton('sound', soundDebounce(() => replayPrompt()));
    rewardSound.classList.add('qk-hud-top-right');
    els.reward.querySelector('.hud-mount').append(rewardBack, rewardSound);

    const playHandler = () => startMode(state.modeId);
    const againHandler = () => again();
    const nextHandler = () => next();
    targetHandlers.set('play', playHandler);
    targetHandlers.set('again', againHandler);
    targetHandlers.set('next', nextHandler);
    permanentDisposers.push(
      onTap(els.playButton, playHandler, { feedback: (event) => { event.preventDefault(); unlockAll(); playSfx('tick'); } }),
      onTap(els.again, againHandler, { feedback: (event) => { event.preventDefault(); unlockAll(); playSfx('tick'); } }),
      onTap(els.next, nextHandler, { feedback: (event) => { event.preventDefault(); unlockAll(); playSfx('tick'); } }),
      () => home.dispose(),
      () => splashSound.dispose(),
      () => playBack.dispose(),
      () => playSound.dispose(),
      () => rewardBack.dispose(),
      () => rewardSound.dispose(),
    );
  }

  function beginDrag(event) {
    if (state.screen !== 'play' || event.isPrimary === false || drag) return;
    event.preventDefault();
    unlockAll();
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startTray: state.trayX,
      moved: false,
    };
    try { els.catchField.setPointerCapture(event.pointerId); } catch { /* window listeners are the real safety net */ }
  }

  function moveDrag(event) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const rect = els.catchField.getBoundingClientRect();
    const dx = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(dx) < 8) return;
    drag.moved = true;
    gestureMoved = true;
    els.gesture.classList.add('is-dismissed');
    setTrayX(drag.startTray + dx / rect.width);
    resetIdle(state.phase);
  }

  function endDrag(event) {
    if (!drag || (event && event.pointerId !== drag.pointerId)) return;
    drag = null;
  }

  const pressedKeys = new Set();
  function onKeyDown(event) {
    if (state.screen !== 'play' || !['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D'].includes(event.key)) return;
    event.preventDefault();
    pressedKeys.add(event.key.toLowerCase());
    els.gesture.classList.add('is-dismissed');
  }
  function onKeyUp(event) { pressedKeys.delete(event.key.toLowerCase()); }

  function keyboardTick() {
    if (state.screen === 'play') {
      const left = pressedKeys.has('arrowleft') || pressedKeys.has('a');
      const right = pressedKeys.has('arrowright') || pressedKeys.has('d');
      if (left !== right) setTrayX(state.trayX + (right ? 0.012 : -0.012));
    }
    requestAnimationFrame(keyboardTick);
  }

  function installInput() {
    els.catchField.addEventListener('pointerdown', beginDrag, { passive: false });
    window.addEventListener('pointermove', moveDrag, { passive: false });
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    window.addEventListener('blur', endDrag);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('resize', setRunnerWidth);
    permanentDisposers.push(() => {
      els.catchField.removeEventListener('pointerdown', beginDrag);
      window.removeEventListener('pointermove', moveDrag);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
      window.removeEventListener('blur', endDrag);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('resize', setRunnerWidth);
    });
  }

  function debugTap(id) {
    const handler = targetHandlers.get(String(id));
    if (!handler) return Promise.resolve({ accepted: false });
    try { return Promise.resolve(handler()); } catch { return Promise.resolve({ accepted: false }); }
  }

  async function debugWinRound() {
    if (state.screen === 'splash') await startMode(state.modeId);
    if (state.screen === 'reward') return;
    const promise = new Promise((resolve) => { rewardReadyResolve = resolve; });
    let safety = 20;
    while (state.screen === 'play' && state.caught < state.target && safety-- > 0) {
      if (state.phase === 'intro') await voiceQueue;
      if (state.phase === 'pop') {
        popBalloon(state.balloonIndex);
        await timers.wait(260);
      }
      if (state.phase === 'catch') {
        for (const chip of [...state.activeChips]) catchChip(chip);
        await timers.wait(700);
      }
    }
    if (state.screen === 'reward') return;
    return promise;
  }

  function installReviewHook(ready) {
    return installDebug({
      gameId: 'chocolate-chip-count',
      engine: 'arcade-catch-custom',
      ready,
      timers,
      voice,
      onSeed(nextRng, seed) { rng = nextRng; seedValue = seed; },
      listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
      startMode,
      getState: () => ({
        screen: state.screen,
        mode: state.modeId,
        round: state.screen === 'splash' ? 0 : 1,
        roundsTotal: 1,
        awaitingInput: state.awaitingInput,
        phase: state.phase,
        target: state.target,
        caught: state.caught,
        balloonIndex: state.balloonIndex,
        activeChips: state.activeChips.filter((chip) => !chip.caught).length,
        returnedChips: state.returnedChips,
        trayX: Number(state.trayX.toFixed(3)),
        muted: state.muted,
        reducedMotion: state.reducedMotion,
        seed: seedValue,
      }),
      getTargets: () => collectTargets(root),
      tap: debugTap,
      winRound: debugWinRound,
      mute(on = true) {
        state.muted = Boolean(on);
        voice.setMuted(state.muted);
        if (state.muted) {
          try { window.speechSynthesis?.cancel(); } catch { /* ignore */ }
        }
        for (const media of document.querySelectorAll('audio, video')) media.muted = state.muted;
        return state.muted;
      },
      home: () => showSplash(),
      setTrayX,
      dropNext: () => popBalloon(state.balloonIndex),
      missActiveChip: () => returnChip(state.activeChips.find((chip) => !chip.caught && !chip.returning)),
      getAudioLog: () => voice.getAudioLog(),
      clearAudioLog: () => voice.clearAudioLog(),
      getLayout: () => {
        const field = els.catchField.getBoundingClientRect();
        const tray = els.tray.getBoundingClientRect();
        return {
          viewport: { width: innerWidth, height: innerHeight },
          field: { x: field.x, y: field.y, width: field.width, height: field.height },
          tray: { x: tray.x, y: tray.y, width: tray.width, height: tray.height },
          recipeTargets: config.modes.map((mode) => mode.target),
        };
      },
    });
  }

  const ready = (async () => {
    await voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
    await preload([
      ...Object.values(config.assets),
      ...Object.values(BALLOON_ART),
      ...config.modes.map((mode) => mode.frame),
    ]);
    renderRecipeCards();
    wirePermanentControls();
    installInput();
    permanentDisposers.push(installUnlockOnGesture(), installKioskGuards());
    renderProgress();
    setRunnerWidth();
    updateChef();
    raf = requestAnimationFrame(tick);
    keyboardTick();
    return true;
  })();

  permanentDisposers.push(installReviewHook(ready));

  return {
    ready,
    destroy() {
      teardownRound();
      cancelAnimationFrame(raf);
      for (const dispose of permanentDisposers.splice(0)) {
        try { dispose(); } catch { /* teardown continues */ }
      }
      screens.destroy?.();
    },
  };
}
