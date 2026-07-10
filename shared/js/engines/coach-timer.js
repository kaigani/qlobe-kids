// coach-timer.js — archetype engine for real-world coached activities.
// The tablet guides, times, and celebrates; the child does the activity in the room.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { artEl } from './art.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_HREF = '../../';
const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const WAIT_FOR_INPUT = 80;

let styleReady = false;

export function createGame(config, mountEl) {
  injectStyle();
  return new CoachTimerGame(config, mountEl);
}

class CoachTimerGame {
  constructor(config, mountEl) {
    this.config = config || {};
    this.mountEl = mountEl;
    this.mode = null;
    this.screen = 'splash';
    this.stepIndex = 0;
    this.cycleIndex = 0;
    this.signalStateIndex = 0;
    this.paused = false;
    this.awaitingInput = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.destroyed = false;
    this.seeded = false;
    this.rng = Math.random;
    this.timerIds = new Set();
    this.intervalIds = new Set();
    this.pointerUnlock = this.unlockAudio.bind(this);
    this.preventGesture = (e) => e.preventDefault();
    this.ready = Promise.resolve();

    window.addEventListener('pointerdown', this.pointerUnlock, { passive: true });
    window.addEventListener('gesturestart', this.preventGesture);
    window.addEventListener('contextmenu', this.preventGesture);
    this.renderSplash();
    this.installDebug();
  }

  destroy() {
    this.destroyed = true;
    this.clearTimers();
    speech.stop();
    window.removeEventListener('pointerdown', this.pointerUnlock);
    window.removeEventListener('gesturestart', this.preventGesture);
    window.removeEventListener('contextmenu', this.preventGesture);
    if (window.QLOBE_DEBUG === this.debug) delete window.QLOBE_DEBUG;
    this.mountEl.replaceChildren();
  }

  unlockAudio() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    sfx.unlock();
    speech.unlock();
  }

  installDebug() {
    this.debug = {
      version: 1,
      gameId: this.config.id || 'coach-timer',
      engine: 'coach-timer',
      ready: this.ready,
      listModes: () => this.listModes(),
      startMode: (id) => this.startMode(id),
      getState: () => this.getState(),
      getTargets: () => this.getTargets(),
      tap: (targetId) => this.debugTap(targetId),
      winRound: () => this.winRound(),
      mute: () => this.mute(),
      seed: (n) => this.seed(n),
    };
    window.QLOBE_DEBUG = this.debug;
  }

  listModes() {
    return (this.config.modes || []).map((mode) => ({
      id: mode.id,
      title: mode.title,
    }));
  }

  renderSplash() {
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.clearTimers();
    this.mountEl.classList.add('qk-coach-root');
    this.mountEl.replaceChildren();

    const splash = el('section', 'qk-coach-splash');
    const title = el('h1', 'qk-coach-title', this.config.title || '');
    const artCard = el('div', 'qk-coach-splash-art');
    artCard.appendChild(artEl(this.config.splashEmoji || 'emoji:⭐', this.config.title || ''));
    const modeGrid = el('div', 'qk-coach-mode-grid');

    for (const mode of this.config.modes || []) {
      const button = el('button', 'qk-coach-mode-button', mode.title || mode.id);
      button.type = 'button';
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(mode.id));
      modeGrid.appendChild(button);
    }

    const home = el('a', 'qk-coach-home-link', '⌂');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', 'Home');
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    splash.append(title, artCard, modeGrid, home);
    this.mountEl.appendChild(splash);
  }

  async startMode(id) {
    const mode = (this.config.modes || []).find((item) => item.id === id);
    if (!mode || this.destroyed) return;
    this.clearTimers();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
    this.stepIndex = 0;
    this.cycleIndex = 0;
    this.signalStateIndex = 0;
    this.paused = false;
    this.awaitingInput = false;

    if (mode.type === 'steps') {
      this.renderStep();
      this.speak(this.config.voice && this.config.voice.intro);
    } else if (mode.type === 'signal') {
      this.renderSignal();
      this.speak(this.config.voice && this.config.voice.intro);
      this.startSignalState(0);
    }
    await wait(WAIT_FOR_INPUT);
  }

  renderStep() {
    if (!this.mode || this.destroyed) return;
    const steps = this.mode.steps || [];
    const step = steps[this.stepIndex];
    if (!step) {
      this.endMode();
      return;
    }

    this.screen = 'play';
    this.awaitingInput = true;
    this.clearTimers();
    this.mountEl.replaceChildren();

    const play = el('section', 'qk-coach-play qk-coach-steps');
    const progress = el('div', 'qk-coach-dots');
    for (let i = 0; i < steps.length; i++) {
      const dot = el('span', 'qk-coach-dot' + (i < this.stepIndex ? ' is-done' : i === this.stepIndex ? ' is-now' : ''));
      progress.appendChild(dot);
    }

    const artCard = el('div', 'qk-coach-step-art');
    artCard.appendChild(artEl(step.art || this.config.splashEmoji || 'emoji:⭐', step.say || ''));

    const prompt = el('div', 'qk-coach-prompt', step.say || '');
    const timer = el('div', 'qk-coach-timer');
    timer.setAttribute('aria-hidden', 'true');
    const timerFill = el('div', 'qk-coach-timer-fill');
    timer.appendChild(timerFill);

    const done = el('button', 'qk-coach-done', this.mode.doneLabel || 'DONE');
    done.type = 'button';
    done.dataset.targetId = 'done';
    done.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      this.completeStep();
    });

    play.append(progress, artCard, prompt, timer, done);
    this.mountEl.appendChild(play);
    if (!step.timerSec) timer.hidden = true;
    this.speak(step.say);
    this.startStepTimer(step, timerFill);
  }

  startStepTimer(step, fill) {
    const seconds = Number(step.timerSec || 0);
    if (!seconds || seconds <= 0) return;
    const duration = this.seeded ? 0.2 : seconds;
    const started = performance.now();
    const totalMs = duration * 1000;
    let lastTickAt = 4;

    if (REDUCED) {
      fill.style.transform = 'scaleX(1)';
    }

    const update = () => {
      if (this.destroyed || this.screen !== 'play' || !this.mode || this.mode.type !== 'steps') return;
      const elapsed = performance.now() - started;
      const remaining = Math.max(0, totalMs - elapsed);
      const ratio = totalMs > 0 ? remaining / totalMs : 0;
      if (!REDUCED) fill.style.transform = `scaleX(${ratio})`;

      const secondsLeft = Math.ceil(remaining / 1000);
      if (!this.seeded && secondsLeft > 0 && secondsLeft <= 3 && secondsLeft < lastTickAt) {
        lastTickAt = secondsLeft;
        this.playSfx('tick');
      }
      if (remaining <= 0) {
        this.clearIntervals();
        this.playSfx('sparkle');
        this.speak(step.after);
      }
    };

    update();
    const id = window.setInterval(update, 80);
    this.intervalIds.add(id);
  }

  async completeStep() {
    if (!this.mode || this.mode.type !== 'steps' || !this.awaitingInput || this.destroyed) {
      return { accepted: false };
    }
    this.awaitingInput = false;
    this.clearTimers();
    this.playSfx('sparkle');
    this.speak(this.mode.praise || (this.config.voice && this.config.voice.praise));
    this.stepIndex += 1;
    if (this.stepIndex >= (this.mode.steps || []).length) {
      this.schedule(() => this.endMode(), REDUCED ? 80 : 450);
    } else {
      this.schedule(() => this.renderStep(), REDUCED ? 80 : 450);
    }
    await wait(REDUCED ? 90 : 470);
    return { accepted: true };
  }

  renderSignal() {
    if (!this.mode || this.destroyed) return;
    this.mountEl.replaceChildren();
    const stage = el('section', 'qk-coach-play qk-coach-signal');
    stage.dataset.targetId = 'signal-area';
    stage.addEventListener('pointerdown', () => this.unlockAudio());

    const pause = el('button', 'qk-coach-pause', 'Ⅱ');
    pause.type = 'button';
    pause.dataset.targetId = 'pause';
    pause.setAttribute('aria-label', 'Pause');
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      this.togglePause();
    });

    const progress = el('div', 'qk-coach-round-dots');
    for (let i = 0; i < Number(this.mode.rounds || 1); i++) {
      progress.appendChild(el('span', 'qk-coach-dot' + (i < this.cycleIndex ? ' is-done' : '')));
    }

    const artCard = el('div', 'qk-coach-signal-art');
    const cue = el('div', 'qk-coach-signal-cue');
    stage.append(pause, progress, artCard, cue);
    this.mountEl.appendChild(stage);
    this.signalEls = { stage, artCard, cue, pause, progress };
  }

  startSignalState(index) {
    if (!this.mode || this.mode.type !== 'signal' || this.destroyed || this.screen !== 'play') return;
    const states = this.mode.states || [];
    if (!states.length) {
      this.endMode();
      return;
    }
    this.awaitingInput = true;
    this.signalStateIndex = index % states.length;
    const state = states[this.signalStateIndex];
    if (!this.signalEls || !this.signalEls.stage.isConnected) this.renderSignal();

    this.signalEls.stage.style.setProperty('--qk-signal-color', state.color || '#58a945');
    this.signalEls.artCard.replaceChildren(artEl(state.art || 'emoji:⭐', state.say || ''));
    this.signalEls.cue.textContent = state.say || '';
    this.playSfx(state.sfx || 'pop');
    this.speak(state.say);

    if (this.paused) return;
    const ms = this.signalDurationMs(state);
    this.schedule(() => this.advanceSignalState(), ms);
  }

  advanceSignalState() {
    if (!this.mode || this.mode.type !== 'signal' || this.destroyed || this.paused) return;
    const states = this.mode.states || [];
    const next = this.signalStateIndex + 1;
    if (next >= states.length) {
      this.cycleIndex += 1;
      if (this.cycleIndex >= Number(this.mode.rounds || 1)) {
        this.endMode();
        return;
      }
      this.renderSignal();
      this.startSignalState(0);
      return;
    }
    this.startSignalState(next);
  }

  signalDurationMs(state) {
    const dur = Array.isArray(state.durSec) ? state.durSec : [state.durSec || 2, state.durSec || 2];
    const min = Number(dur[0] || 1);
    const max = Number(dur[1] || min);
    const seconds = this.seeded ? min : min + this.rng() * Math.max(0, max - min);
    return Math.max(0.05, seconds) * 1000;
  }

  togglePause() {
    if (!this.mode || this.mode.type !== 'signal') return;
    this.paused = !this.paused;
    this.clearTimers();
    this.playSfx('tick');
    if (this.signalEls && this.signalEls.pause) {
      this.signalEls.pause.textContent = this.paused ? '▶' : 'Ⅱ';
      this.signalEls.stage.classList.toggle('is-paused', this.paused);
    }
    if (!this.paused) this.startSignalState(this.signalStateIndex);
  }

  async winRound() {
    if (!this.mode || this.destroyed) return;
    if (this.mode.type === 'steps') {
      await this.completeStep();
      return;
    }
    if (this.mode.type === 'signal') {
      this.clearTimers();
      this.cycleIndex += 1;
      if (this.cycleIndex >= Number(this.mode.rounds || 1)) {
        this.endMode();
      } else {
        this.renderSignal();
        this.startSignalState(0);
      }
      await wait(WAIT_FOR_INPUT);
    }
  }

  endMode() {
    if (this.destroyed) return;
    this.clearTimers();
    this.screen = 'end';
    this.awaitingInput = true;
    this.playSfx('tada');
    this.speak(this.mode && (this.mode.cheer || (this.config.voice && this.config.voice.cheer)));

    this.mountEl.replaceChildren();
    const end = el('section', 'qk-coach-end');
    const burst = el('div', 'qk-coach-burst');
    for (let i = 0; i < 14; i++) burst.appendChild(el('span', 'qk-coach-spark'));
    const artCard = el('div', 'qk-coach-end-art');
    artCard.appendChild(artEl((this.mode && this.mode.endArt) || this.config.splashEmoji || 'emoji:⭐', ''));
    const title = el('h2', 'qk-coach-end-title', (this.mode && (this.mode.endTitle || this.mode.title)) || this.config.title || '');
    const again = el('button', 'qk-coach-again', this.mode && (this.mode.againLabel || 'PLAY AGAIN'));
    again.type = 'button';
    again.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      if (this.mode) this.startMode(this.mode.id);
    });
    const home = el('a', 'qk-coach-big-home', '⌂');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', 'Home');
    home.addEventListener('pointerdown', (e) => e.stopPropagation());
    end.append(burst, artCard, title, again, home);
    this.mountEl.appendChild(end);
  }

  getState() {
    const roundsTotal = this.mode
      ? this.mode.type === 'steps'
        ? (this.mode.steps || []).length
        : Number(this.mode.rounds || 1)
      : 0;
    const round = this.mode && this.mode.type === 'signal' ? this.cycleIndex : this.stepIndex;
    return {
      screen: this.screen,
      mode: this.mode ? this.mode.id : null,
      round,
      roundsTotal,
      awaitingInput: this.awaitingInput,
      paused: this.paused,
    };
  }

  getTargets() {
    if (this.screen !== 'play' || !this.mode) return [];
    if (this.mode.type === 'steps') {
      const done = this.mountEl.querySelector('[data-target-id="done"]');
      return done ? [targetFromEl('done', 'correct', done)] : [];
    }
    const area = this.mountEl.querySelector('[data-target-id="signal-area"]');
    const pause = this.mountEl.querySelector('[data-target-id="pause"]');
    return [area && targetFromEl('signal-area', 'neutral', area), pause && targetFromEl('pause', 'neutral', pause)].filter(Boolean);
  }

  async debugTap(targetId) {
    if (targetId === 'done') return this.completeStep();
    if (targetId === 'pause') {
      this.togglePause();
      return { accepted: true };
    }
    if (targetId === 'signal-area') return { accepted: true };
    return { accepted: false };
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    this.seeded = true;
    let value = Number(n) || 1;
    this.rng = () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  }

  speak(text) {
    if (this.muted || !text) return Promise.resolve();
    return speech.speak(text);
  }

  playSfx(name) {
    if (this.muted || !name || typeof sfx[name] !== 'function') return;
    sfx[name]();
  }

  schedule(fn, ms) {
    const id = window.setTimeout(() => {
      this.timerIds.delete(id);
      fn();
    }, ms);
    this.timerIds.add(id);
    return id;
  }

  clearTimers() {
    for (const id of this.timerIds) window.clearTimeout(id);
    this.timerIds.clear();
    this.clearIntervals();
  }

  clearIntervals() {
    for (const id of this.intervalIds) window.clearInterval(id);
    this.intervalIds.clear();
  }
}

function injectStyle() {
  if (styleReady || document.getElementById('qk-coach-style')) {
    styleReady = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-coach-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-coach-root, .qk-coach-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-coach-root {
      min-height: 100dvh;
      overflow: hidden;
      font-family: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif;
      font-weight: 600;
      color: #17517e;
      background: #bee3f5;
      user-select: none;
      -webkit-user-select: none;
      -webkit-touch-callout: none;
      touch-action: manipulation;
    }

    .qk-coach-splash, .qk-coach-play, .qk-coach-end {
      position: relative;
      min-height: 100dvh;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: clamp(14px, 2.5vmin, 26px);
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right)) max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
      background-color: #bee3f5;
      background-image: radial-gradient(circle at 20% 20%, rgba(255,255,255,.28) 0 10px, transparent 11px),
        radial-gradient(circle at 78% 28%, rgba(255,255,255,.22) 0 14px, transparent 15px);
      background-size: 120px 120px, 170px 170px;
    }

    .qk-coach-title {
      margin: 0;
      max-width: min(920px, 92vw);
      color: #17517e;
      text-align: center;
      font-size: clamp(38px, 8vmin, 86px);
      line-height: .96;
      letter-spacing: 0;
      text-shadow: 0 4px 0 rgba(255,255,255,.65);
    }

    .qk-coach-splash-art, .qk-coach-step-art, .qk-coach-signal-art, .qk-coach-end-art {
      display: grid;
      place-items: center;
      width: min(44vmin, 360px);
      aspect-ratio: 1;
      border: 6px solid #fff;
      border-radius: 28px;
      background: linear-gradient(180deg, #fffef8, #f7ecd5);
      box-shadow: 0 7px 0 rgba(23,81,126,.16), 0 16px 32px rgba(23,81,126,.16);
      --qk-art-size: min(27vmin, 210px);
    }

    .qk-coach-mode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(260px, 86vw), 1fr));
      width: min(760px, 92vw);
      gap: 16px;
    }

    .qk-coach-mode-button, .qk-coach-done, .qk-coach-again, .qk-coach-big-home, .qk-coach-home-link, .qk-coach-pause {
      border: 6px solid #fff;
      color: #17517e;
      background-color: #ffd166;
      background-image: linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0) 52%);
      box-shadow: 0 7px 0 rgba(23,81,126,.18), 0 16px 28px rgba(23,81,126,.18);
      font: inherit;
      text-decoration: none;
      touch-action: manipulation;
      cursor: pointer;
    }

    .qk-coach-mode-button {
      min-height: 112px;
      border-radius: 24px;
      padding: 14px 22px;
      font-size: clamp(24px, 4vmin, 40px);
      line-height: 1.05;
    }

    .qk-coach-home-link, .qk-coach-pause {
      position: absolute;
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      font-size: 50px;
      line-height: 1;
    }
    .qk-coach-home-link { left: max(18px, env(safe-area-inset-left)); top: max(18px, env(safe-area-inset-top)); background-color: #7c4fc4; color: #fff; }
    .qk-coach-pause { right: max(18px, env(safe-area-inset-right)); top: max(18px, env(safe-area-inset-top)); z-index: 3; background-color: #fffef8; }

    .qk-coach-mode-button:active, .qk-coach-done:active, .qk-coach-again:active, .qk-coach-big-home:active, .qk-coach-home-link:active, .qk-coach-pause:active {
      transform: scale(.95);
    }

    .qk-coach-steps {
      grid-template-rows: auto minmax(170px, 1fr) auto auto 160px;
      align-content: stretch;
      padding-bottom: max(18px, env(safe-area-inset-bottom));
    }

    .qk-coach-dots, .qk-coach-round-dots {
      display: flex;
      justify-content: center;
      gap: 12px;
      min-height: 34px;
      padding: 6px 112px;
    }
    .qk-coach-dot {
      width: 24px;
      height: 24px;
      border: 4px solid #fff;
      border-radius: 50%;
      background: rgba(255,255,255,.55);
      box-shadow: 0 3px 0 rgba(23,81,126,.14);
    }
    .qk-coach-dot.is-done { background: #58a945; }
    .qk-coach-dot.is-now { background: #ffd166; }

    .qk-coach-step-art { align-self: center; width: min(50vmin, 410px); --qk-art-size: min(32vmin, 250px); }
    .qk-coach-prompt, .qk-coach-signal-cue {
      max-width: min(900px, 92vw);
      padding: 10px 18px;
      text-align: center;
      color: #17517e;
      font-size: clamp(26px, 4.4vmin, 48px);
      line-height: 1.05;
      letter-spacing: 0;
      text-shadow: 0 3px 0 rgba(255,255,255,.65);
    }

    .qk-coach-timer {
      width: min(520px, 82vw);
      height: 34px;
      overflow: hidden;
      border: 5px solid #fff;
      border-radius: 999px;
      background: rgba(255,255,255,.55);
      box-shadow: inset 0 4px 0 rgba(23,81,126,.08), 0 4px 0 rgba(23,81,126,.12);
    }
    .qk-coach-timer-fill {
      width: 100%;
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, #58a945, #ffd166);
      transform-origin: left center;
    }

    .qk-coach-done {
      align-self: end;
      min-width: min(460px, 84vw);
      min-height: 140px;
      border-radius: 34px;
      font-size: clamp(38px, 7vmin, 72px);
      line-height: 1;
    }

    .qk-coach-signal {
      overflow: hidden;
      align-content: center;
      background-color: var(--qk-signal-color, #58a945);
      transition: background-color .24s ease;
    }
    .qk-coach-signal::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(180deg, rgba(255,255,255,.18), rgba(255,255,255,0) 42%);
      pointer-events: none;
    }
    .qk-coach-signal.is-paused { filter: saturate(.75); }
    .qk-coach-signal-art {
      z-index: 1;
      width: min(52vmin, 430px);
      border-radius: 36px;
      --qk-art-size: min(34vmin, 280px);
    }
    .qk-coach-signal-cue, .qk-coach-round-dots { z-index: 1; }

    .qk-coach-end {
      overflow: hidden;
    }
    .qk-coach-end-art { --qk-art-size: min(28vmin, 220px); }
    .qk-coach-end-title {
      margin: 0;
      max-width: 90vw;
      text-align: center;
      font-size: clamp(34px, 6vmin, 68px);
      line-height: 1;
      letter-spacing: 0;
    }
    .qk-coach-again {
      min-width: min(430px, 84vw);
      min-height: 112px;
      border-radius: 30px;
      font-size: clamp(28px, 5vmin, 52px);
    }
    .qk-coach-big-home {
      display: grid;
      place-items: center;
      width: 112px;
      height: 112px;
      border-radius: 50%;
      font-size: 62px;
      background-color: #7c4fc4;
      color: #fff;
    }

    .qk-coach-burst {
      position: absolute;
      inset: 50% auto auto 50%;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }
    .qk-coach-spark {
      position: absolute;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: #ffd166;
      animation: qk-coach-burst .8s ease-out both;
    }
    .qk-coach-spark:nth-child(3n) { background: #58a945; }
    .qk-coach-spark:nth-child(3n + 1) { background: #f25f5c; }
    .qk-coach-spark:nth-child(1) { --x: -240px; --y: -140px; }
    .qk-coach-spark:nth-child(2) { --x: 230px; --y: -130px; }
    .qk-coach-spark:nth-child(3) { --x: -180px; --y: 120px; }
    .qk-coach-spark:nth-child(4) { --x: 190px; --y: 130px; }
    .qk-coach-spark:nth-child(5) { --x: -80px; --y: -210px; }
    .qk-coach-spark:nth-child(6) { --x: 70px; --y: -220px; }
    .qk-coach-spark:nth-child(7) { --x: -270px; --y: 20px; }
    .qk-coach-spark:nth-child(8) { --x: 270px; --y: 10px; }
    .qk-coach-spark:nth-child(9) { --x: -130px; --y: -70px; }
    .qk-coach-spark:nth-child(10) { --x: 120px; --y: -80px; }
    .qk-coach-spark:nth-child(11) { --x: -40px; --y: 190px; }
    .qk-coach-spark:nth-child(12) { --x: 60px; --y: 180px; }
    .qk-coach-spark:nth-child(13) { --x: -220px; --y: 80px; }
    .qk-coach-spark:nth-child(14) { --x: 220px; --y: 80px; }

    @keyframes qk-coach-burst {
      from { opacity: 1; transform: translate(-50%, -50%) scale(.4); }
      to { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1.2); }
    }

    @media (orientation: landscape) and (max-height: 560px) {
      .qk-coach-steps { grid-template-columns: 1fr 1fr; grid-template-rows: auto 1fr auto 150px; column-gap: 18px; }
      .qk-coach-dots { grid-column: 1 / -1; }
      .qk-coach-step-art { width: min(52vh, 330px); }
      .qk-coach-prompt, .qk-coach-timer { align-self: end; }
      .qk-coach-done { grid-column: 1 / -1; min-height: 128px; }
    }

    @media (max-width: 520px) {
      .qk-coach-home-link, .qk-coach-pause { width: 96px; height: 96px; }
      .qk-coach-dots, .qk-coach-round-dots { padding-left: 104px; padding-right: 104px; }
      .qk-coach-dot { width: 20px; height: 20px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-coach-root *, .qk-coach-root *::before, .qk-coach-root *::after {
        animation-duration: .001ms !important;
        transition-duration: .001ms !important;
        scroll-behavior: auto !important;
      }
      .qk-coach-spark { display: none; }
    }
  `;
  document.head.appendChild(style);
  styleReady = true;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function targetFromEl(id, role, node) {
  const rect = node.getBoundingClientRect();
  return {
    id,
    role,
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
  };
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
