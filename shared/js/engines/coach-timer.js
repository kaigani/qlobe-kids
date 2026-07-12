// coach-timer.js — Stage v2 archetype for real-world coached activities.
// DOM owns the accessible checklist and chrome; Pixi owns the calm visual coach.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { createStage } from '../stage/stage.js';
import { popIn } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;
const WAIT_FOR_INPUT = 80;
const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const WIN_RETRY_MS = 120;
const WIN_BAIL_MS = 15000;
const DIAL_TRACK_STROKE = { width: 22, color: 0xffffff, alpha: 0.68 };
const DIAL_ARC_STROKE = { width: 22, color: 0x58a945, cap: 'round' };

let styleReady = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('coach-timer requires a mount element');
  injectStyle();
  return new CoachTimerGame(config || {}, mountEl);
}

class CoachTimerGame {
  constructor(config, mountEl) {
    this.config = config;
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;
    this.mode = null;
    this.screen = 'splash';
    this.stepIndex = 0;
    this.cycleIndex = 0;
    this.signalStateIndex = 0;
    this.paused = false;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.destroyed = false;
    this.seeded = false;
    this.rng = Math.random;
    this.reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.lastReplay = 0;
    this.idlePrompted = false;
    this.timerIds = new Set();
    this.stage = null;
    this.scene = null;
    this.artView = null;
    this.dial = null;
    this.removeResize = null;
    this.stageGeneration = 0;
    this.viewGeneration = 0;
    this.clockTicker = null;
    this.clockDeadline = 0;
    this.clockTotalMs = 0;
    this.clockDone = false;
    this.signalTimer = 0;
    this.activeTimerFx = Promise.resolve();
    this.currentPop = null;
    this.targetMap = new Map();

    this.pointerUnlock = () => this.unlockAudio();
    this.preventGesture = (e) => e.preventDefault();
    this.onVisibility = () => this.syncClock();
    window.addEventListener('pointerdown', this.pointerUnlock, { passive: true });
    window.addEventListener('gesturestart', this.preventGesture);
    window.addEventListener('contextmenu', this.preventGesture);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebug();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimers();
    this.disposeStage();
    speech.stop();
    window.removeEventListener('pointerdown', this.pointerUnlock);
    window.removeEventListener('gesturestart', this.preventGesture);
    window.removeEventListener('contextmenu', this.preventGesture);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.mountEl.classList.remove('qk-coach-root');
    this.mountEl.replaceChildren();
    this.targetMap.clear();
    if (window.QLOBE_DEBUG === this.debug) {
      if (this.previousDebug) window.QLOBE_DEBUG = this.previousDebug;
      else delete window.QLOBE_DEBUG;
    }
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
      tap: (targetId) => this.tapTarget(targetId),
      winRound: () => this.winRound(),
      mute: () => this.mute(),
      seed: (n) => this.seed(n),
    };
    window.QLOBE_DEBUG = this.debug;
  }

  listModes() {
    return (this.config.modes || []).map((mode) => ({ id: mode.id, title: mode.title }));
  }

  renderSplash() {
    this.clearTimers();
    this.disposeStage();
    speech.stop();
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    this.mountEl.classList.add('qk-coach-root');
    const buttons = (this.config.modes || []).map((mode) => `
      <button class="qk-coach-mode-button" type="button" data-mode="${escapeAttr(mode.id)}">
        ${escapeHtml(mode.title || mode.id)}
      </button>`).join('');
    this.mountEl.innerHTML = `
      <section class="qk-coach qk-coach-splash" aria-label="${escapeAttr(this.config.title || '')}">
        <a class="qk-coach-home qk-coach-img-btn" href="../../" aria-label="Home"></a>
        <div class="qk-coach-splash-center">
          <div class="qk-coach-splash-art" aria-hidden="true">${escapeHtml(emojiFromRef(this.config.splashEmoji || 'emoji:⭐'))}</div>
          <h1>${escapeHtml(this.config.title || '')}</h1>
          <div class="qk-coach-mode-grid">${buttons}</div>
        </div>
      </section>`;
    this.mountEl.querySelectorAll('.qk-coach-mode-button').forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(button.dataset.mode));
    });
  }

  async startMode(id) {
    await this.ready;
    const mode = (this.config.modes || []).find((item) => item.id === id);
    if (!mode || this.destroyed) return;
    this.clearTimers();
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
    this.stepIndex = 0;
    this.cycleIndex = 0;
    this.signalStateIndex = 0;
    this.paused = false;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    if (mode.type === 'steps') {
      await this.renderStepsShell();
      await this.showStep();
      // Keep the original invocation order: the first step is queued, then intro.
      this.speak(this.config.voice && this.config.voice.intro);
    } else if (mode.type === 'signal') {
      await this.renderSignalShell();
      this.speak(this.config.voice && this.config.voice.intro);
      await this.startSignalState(0);
    }
    await wait(WAIT_FOR_INPUT);
  }

  async renderStepsShell() {
    const rows = (this.mode.steps || []).map((step, index) => `
      <li class="qk-coach-row" data-step="${index}">
        <span class="qk-coach-check" aria-hidden="true"></span>
        <span class="qk-coach-row-text">${escapeHtml(step.say || '')}</span>
      </li>`).join('');
    this.mountEl.innerHTML = `
      <section class="qk-coach qk-coach-play qk-coach-steps" aria-label="${escapeAttr(this.mode.title || '')}">
        <header class="qk-coach-hud">
          <a class="qk-coach-home qk-coach-img-btn" href="../../" aria-label="Home"></a>
          <div class="qk-coach-dots" aria-hidden="true"></div>
        </header>
        <main class="qk-coach-workspace">
          <div class="qk-coach-canvas" aria-label="Activity timer and step picture"></div>
          <ol class="qk-coach-checklist" aria-label="Activity steps">${rows}</ol>
        </main>
        <button class="qk-coach-sound qk-coach-img-btn" type="button" aria-label="Hear it again"></button>
      </section>`;
    this.applyThemeBackdrop();
    this.wireReplay();
    await this.createPlayStage();
  }

  async showStep() {
    if (!this.mode || this.mode.type !== 'steps' || this.destroyed) return;
    const steps = this.mode.steps || [];
    const step = steps[this.stepIndex];
    if (!step) { await this.endMode(); return; }
    this.clearTimers();
    this.clearClock();
    this.screen = 'play';
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.targetMap.clear();
    this.updateChecklist();
    const row = this.mountEl.querySelector(`[data-step="${this.stepIndex}"]`);
    if (row) {
      row.classList.add('is-now');
      row.dataset.targetId = 'done';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `${step.say || ''}. ${this.mode.doneLabel || 'Done'}`);
      const rowIndex = this.stepIndex;
      const action = () => rowIndex === this.stepIndex ? this.completeStep() : { accepted: false };
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        action();
      };
      row.addEventListener('pointerdown', down);
      row.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && this.awaitingInput) { e.preventDefault(); action(); }
      });
      this.targetMap.set('done', { id: 'done', role: 'correct', element: row, action });
      row.scrollIntoView({ block: 'nearest', behavior: this.reducedMotion() ? 'auto' : 'smooth' });
    }
    const generation = ++this.viewGeneration;
    await this.buildCoachView(step.art || this.config.splashEmoji || 'emoji:⭐', step.say || '', generation, Boolean(step.timerSec));
    if (!this.viewIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.speak(step.say);
    this.startStepTimer(step);
    this.scheduleIdlePrompt();
  }

  updateChecklist() {
    const count = (this.mode.steps || []).length;
    this.mountEl.querySelectorAll('.qk-coach-row').forEach((row, index) => {
      row.classList.toggle('is-done', index < this.stepIndex);
      row.classList.toggle('is-now', index === this.stepIndex);
      row.removeAttribute('data-target-id');
      row.removeAttribute('role');
      row.removeAttribute('tabindex');
    });
    const dots = Array.from({ length: count }, (_, index) =>
      `<span class="qk-coach-dot${index < this.stepIndex ? ' is-done' : index === this.stepIndex ? ' is-now' : ''}"></span>`).join('');
    const host = this.mountEl.querySelector('.qk-coach-dots');
    if (host) host.innerHTML = dots;
  }

  startStepTimer(step) {
    const seconds = Number(step.timerSec || 0);
    if (!(seconds > 0)) { this.setDialProgress(1, false); return; }
    const duration = this.seeded ? 0.2 : seconds;
    this.clockTotalMs = duration * 1000;
    this.clockDeadline = Date.now() + this.clockTotalMs;
    this.clockDone = false;
    this.lastTickSecond = 4;
    this.clockKind = 'step';
    this.clockStep = step;
    this.startClockTicker();
    this.scheduleClockWake(this.clockTotalMs);
    this.syncClock();
  }

  async completeStep() {
    if (!this.mode || this.mode.type !== 'steps' || !this.awaitingInput || this.inputLocked || this.destroyed) {
      return { accepted: false };
    }
    this.awaitingInput = false;
    this.inputLocked = true;
    this.clearTimers();
    this.clearClock();
    this.playSfx('sparkle');
    this.speak(this.mode.praise || (this.config.voice && this.config.voice.praise));
    const row = this.mountEl.querySelector(`[data-step="${this.stepIndex}"]`);
    const finalStep = this.stepIndex + 1 >= (this.mode.steps || []).length;
    const fx = this.flyCheckToStage(row, finalStep);
    this.stepIndex += 1;
    await Promise.all([fx, this.activeTimerFx, wait(this.reducedMotion() ? 80 : 450)]);
    this.activeTimerFx = Promise.resolve();
    if (this.destroyed || this.screen !== 'play') return { accepted: true };
    if (finalStep) await this.endMode();
    else await this.showStep();
    return { accepted: true };
  }

  async renderSignalShell() {
    this.mountEl.innerHTML = `
      <section class="qk-coach qk-coach-play qk-coach-signal" data-target-id="signal-area" aria-label="${escapeAttr(this.mode.title || '')}">
        <header class="qk-coach-hud">
          <a class="qk-coach-home qk-coach-img-btn" href="../../" aria-label="Home"></a>
          <div class="qk-coach-round-dots" aria-hidden="true"></div>
          <button class="qk-coach-pause" type="button" data-target-id="pause" aria-label="Pause">Ⅱ</button>
        </header>
        <main class="qk-coach-signal-field">
          <div class="qk-coach-canvas" aria-label="Current movement signal"></div>
          <div class="qk-coach-signal-cue" aria-live="polite"></div>
        </main>
        <button class="qk-coach-sound qk-coach-img-btn" type="button" aria-label="Hear it again"></button>
      </section>`;
    this.applyThemeBackdrop();
    this.wireReplay();
    const pause = this.mountEl.querySelector('.qk-coach-pause');
    const pauseAction = () => { this.togglePause(); return { accepted: true }; };
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      pauseAction();
    });
    this.targetMap.set('pause', { id: 'pause', role: 'neutral', element: pause, action: pauseAction });
    const area = this.mountEl.querySelector('.qk-coach-signal');
    const areaAction = () => ({ accepted: true });
    area.addEventListener('pointerdown', () => {
      this.unlockAudio();
      this.tapTarget('signal-area');
    });
    this.targetMap.set('signal-area', { id: 'signal-area', role: 'neutral', element: area, action: areaAction });
    await this.createPlayStage();
  }

  async startSignalState(index, startsAt = Date.now()) {
    if (!this.mode || this.mode.type !== 'signal' || this.destroyed || this.screen !== 'play') return;
    const states = this.mode.states || [];
    if (!states.length) { await this.endMode(); return; }
    this.clearTimers();
    this.clearClock();
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.signalStateIndex = index % states.length;
    const state = states[this.signalStateIndex];
    const section = this.mountEl.querySelector('.qk-coach-signal');
    if (section) section.style.setProperty('--qk-signal-color', state.color || '#58a945');
    const cue = this.mountEl.querySelector('.qk-coach-signal-cue');
    if (cue) cue.textContent = state.say || '';
    this.updateSignalDots();
    const generation = ++this.viewGeneration;
    await this.buildCoachView(state.art || 'emoji:⭐', state.say || '', generation, true);
    if (!this.viewIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.playSfx(state.sfx || 'pop');
    this.speak(state.say);
    this.scheduleIdlePrompt();
    if (this.paused) return;
    this.clockTotalMs = this.signalDurationMs(state);
    this.clockDeadline = startsAt + this.clockTotalMs;
    this.clockDone = false;
    this.clockKind = 'signal';
    this.startClockTicker();
    this.scheduleClockWake(Math.max(0, this.clockDeadline - Date.now()));
    this.syncClock();
  }

  updateSignalDots() {
    const count = Number(this.mode.rounds || 1);
    const html = Array.from({ length: count }, (_, index) =>
      `<span class="qk-coach-dot${index < this.cycleIndex ? ' is-done' : index === this.cycleIndex ? ' is-now' : ''}"></span>`).join('');
    const host = this.mountEl.querySelector('.qk-coach-round-dots');
    if (host) host.innerHTML = html;
  }

  async advanceSignalState(startsAt = Date.now()) {
    if (!this.mode || this.mode.type !== 'signal' || this.destroyed || this.paused || this.screen !== 'play') return;
    const states = this.mode.states || [];
    const next = this.signalStateIndex + 1;
    if (next >= states.length) {
      this.cycleIndex += 1;
      if (this.cycleIndex >= Number(this.mode.rounds || 1)) { await this.endMode(); return; }
      await this.startSignalState(0, startsAt);
    } else {
      await this.startSignalState(next, startsAt);
    }
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
    this.clearClock();
    this.playSfx('tick');
    const pause = this.mountEl.querySelector('.qk-coach-pause');
    const section = this.mountEl.querySelector('.qk-coach-signal');
    if (pause) { pause.textContent = this.paused ? '▶' : 'Ⅱ'; pause.setAttribute('aria-label', this.paused ? 'Play' : 'Pause'); }
    if (section) section.classList.toggle('is-paused', this.paused);
    // Original semantics restart the current signal (including voice and a newly
    // sampled duration) instead of preserving a partial interval.
    if (!this.paused) this.startSignalState(this.signalStateIndex);
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-coach-canvas');
    if (!host) return false;
    const generation = ++this.stageGeneration;
    const stage = await createStage(host);
    if (this.destroyed || this.screen !== 'play' || generation !== this.stageGeneration) {
      stage.destroy();
      return false;
    }
    this.stage = stage;
    this.scene = new stage.PIXI.Container();
    stage.setScene(this.scene);
    this.removeResize = stage.onResize(() => this.layoutField());
    return true;
  }

  disposeStage() {
    this.stageGeneration += 1;
    this.viewGeneration += 1;
    this.clearClock();
    if (this.currentPop && this.currentPop.cancel) this.currentPop.cancel();
    this.currentPop = null;
    if (this.removeResize) this.removeResize();
    this.removeResize = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
    this.artView = null;
    this.dial = null;
  }

  async buildCoachView(ref, alt, generation, showDial) {
    if (!this.stage) return;
    const { PIXI } = this.stage;
    if (this.currentPop && this.currentPop.cancel) this.currentPop.cancel();
    this.currentPop = null;
    const scene = new PIXI.Container();
    this.scene = scene;
    this.stage.setScene(scene);
    const dial = new PIXI.Container();
    const track = new PIXI.Graphics();
    const arc = new PIXI.Graphics();
    const center = new PIXI.Container();
    const backing = cardBacking(PIXI, 226, 226, { fill: 0xfff8e8, stroke: 0xffffff, strokeWidth: 6, radius: 113 });
    center.addChild(backing);
    dial.addChild(track, arc, center);
    scene.addChild(dial);
    const art = await artObj(PIXI, ref, 158, alt);
    if (!this.viewIsCurrent(generation)) { art.destroy({ children: true }); return; }
    center.addChild(art);
    center.scale.set(0.01);
    this.artView = center;
    this.dial = { wrap: dial, track, arc, radius: 132, show: showDial };
    const signalTarget = this.targetMap.get('signal-area');
    if (signalTarget) {
      signalTarget.view = dial;
      signalTarget.w = 286;
      signalTarget.h = 286;
    }
    this.layoutField();
    this.setDialProgress(showDial ? 1 : 0, false);
    this.currentPop = popIn(center, 360);
    this.currentPop.then(() => {
      if (this.artView === center) this.currentPop = null;
    });
  }

  layoutField() {
    if (!this.stage || !this.dial) return;
    const { w, h } = this.stage.size();
    const diameter = 290;
    const fit = Math.min(1.18, Math.max(0.64, (Math.min(w, h) - 24) / diameter));
    this.dial.wrap.position.set(w / 2, h / 2);
    this.dial.wrap.scale.set(fit);
    this.dial.layoutScale = fit;
  }

  setDialProgress(ratio, pulse) {
    if (!this.dial) return;
    const { track, arc, radius, wrap, show } = this.dial;
    track.clear();
    arc.clear();
    if (show) {
      track.circle(0, 0, radius).stroke(DIAL_TRACK_STROKE);
      const safe = Math.max(0.001, Math.min(1, ratio));
      arc.arc(0, 0, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * safe)
        .stroke(DIAL_ARC_STROKE);
    }
    wrap.scale.x = wrap.scale.y = (this.dial.layoutScale || 1) * (pulse || 1);
  }

  startClockTicker() {
    if (!this.stage || this.clockTicker) return;
    this.clockTicker = () => this.updateClockVisual();
    this.stage.app.ticker.add(this.clockTicker);
  }

  updateClockVisual() {
    if (!this.clockDeadline || !this.clockTotalMs || this.clockDone) return;
    const remaining = Math.max(0, this.clockDeadline - Date.now());
    const ratio = remaining / this.clockTotalMs;
    let pulse = 1;
    if (!this.reducedMotion() && remaining > 0) {
      // A tiny three-second breath keeps the coach alive. During the last five
      // seconds it becomes one soft pulse per second—warm, never urgent.
      const phase = remaining <= 5000 ? (remaining % 1000) / 1000 : (remaining % 3000) / 3000;
      pulse = 1 + Math.sin(phase * Math.PI) * (remaining <= 5000 ? 0.025 : 0.008);
    }
    this.setDialProgress(ratio, pulse);
    if (this.clockKind === 'step') {
      const secondsLeft = Math.ceil(remaining / 1000);
      if (!this.seeded && secondsLeft > 0 && secondsLeft <= 3 && secondsLeft < this.lastTickSecond) {
        this.lastTickSecond = secondsLeft;
        this.playSfx('tick');
      }
    }
  }

  syncClock() {
    if (this.destroyed || this.screen !== 'play' || !this.clockDeadline || this.clockDone) return;
    this.updateClockVisual();
    if (Date.now() < this.clockDeadline) return;
    const endedAt = this.clockDeadline;
    this.clockDone = true;
    if (this.clockKind === 'step') {
      this.clearClock(false);
      this.setDialProgress(0, 1);
      this.playSfx('sparkle');
      this.speak(this.clockStep && this.clockStep.after);
      if (this.stage && this.scene) {
        const { w, h } = this.stage.size();
        this.activeTimerFx = burst(this.stage.PIXI, this.scene, w / 2, h / 2, { count: 24, power: 5, life: 700 });
      }
    } else if (this.clockKind === 'signal') {
      this.clearClock(false);
      this.awaitingInput = false;
      this.inputLocked = true;
      this.advanceSignalState(endedAt);
    }
  }

  scheduleClockWake(ms) {
    this.signalTimer = this.schedule(() => {
      this.signalTimer = 0;
      this.syncClock();
    }, Math.max(0, ms) + 8);
  }

  clearClock(reset = true) {
    if (this.clockTicker && this.stage) this.stage.app.ticker.remove(this.clockTicker);
    this.clockTicker = null;
    if (this.signalTimer) {
      window.clearTimeout(this.signalTimer);
      this.timerIds.delete(this.signalTimer);
      this.signalTimer = 0;
    }
    if (reset) {
      this.clockDeadline = 0;
      this.clockTotalMs = 0;
      this.clockDone = false;
      this.clockKind = '';
      this.clockStep = null;
    }
  }

  async flyCheckToStage(row, celebrate) {
    if (!row || !this.stage || !this.scene) return;
    const dot = row.querySelector('.qk-coach-check');
    const dotRect = dot ? dot.getBoundingClientRect() : row.getBoundingClientRect();
    const canvasRect = this.stage.app.canvas.getBoundingClientRect();
    const { w, h } = this.stage.size();
    const endX = canvasRect.left + canvasRect.width / 2;
    const endY = canvasRect.top + canvasRect.height / 2;
    if (!this.reducedMotion()) {
      const flyer = document.createElement('span');
      flyer.className = 'qk-coach-flying-check';
      flyer.style.left = `${dotRect.left + dotRect.width / 2}px`;
      flyer.style.top = `${dotRect.top + dotRect.height / 2}px`;
      document.body.appendChild(flyer);
      requestAnimationFrame(() => {
        flyer.style.transform = `translate(${endX - dotRect.left - dotRect.width / 2}px, ${endY - dotRect.top - dotRect.height / 2}px) scale(.35)`;
        flyer.style.opacity = '0';
      });
      await wait(300);
      flyer.remove();
    }
    if (!this.stage || !this.scene) return;
    await Promise.all([
      sparkle(this.stage.PIXI, this.scene, w / 2, h / 2),
      celebrate ? burst(this.stage.PIXI, this.scene, w / 2, h / 2, { count: 34, power: 7, life: 720 }) : Promise.resolve(),
    ]);
  }

  wireReplay() {
    const sound = this.mountEl.querySelector('.qk-coach-sound');
    if (!sound) return;
    sound.addEventListener('pointerdown', (e) => e.stopPropagation());
    sound.addEventListener('click', () => this.replayPrompt());
  }

  replayPrompt() {
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_DEBOUNCE_MS) return;
    this.lastReplay = now;
    this.playSfx('tick');
    this.clearIdleTimer();
    this.speak(this.currentLine());
    this.scheduleIdlePrompt();
  }

  currentLine() {
    if (!this.mode) return '';
    if (this.mode.type === 'steps') return ((this.mode.steps || [])[this.stepIndex] || {}).say || '';
    return ((this.mode.states || [])[this.signalStateIndex] || {}).say || '';
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || !this.awaitingInput || this.screen !== 'play') return;
    this.idleTimer = this.schedule(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || !this.awaitingInput || this.screen !== 'play') return;
      this.idlePrompted = true;
      this.speak(this.currentLine());
    }, IDLE_MS);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.timerIds.delete(this.idleTimer);
    this.idleTimer = 0;
  }

  applyThemeBackdrop() {
    const theme = this.config.theme;
    const section = this.mountEl.querySelector('.qk-coach');
    if (!theme || !theme.background || !section) return;
    const ref = String(theme.background);
    const url = ref.startsWith('shared:') || ref.startsWith('char:') ? artUrlRef(ref) : ref;
    if (url) section.style.background = `#bee3f5 url("${url}") center / cover no-repeat`;
  }

  async endMode() {
    if (this.destroyed) return;
    this.clearTimers();
    this.clearClock();
    this.screen = 'end';
    this.awaitingInput = true;
    this.inputLocked = false;
    this.targetMap.clear();
    this.playSfx('tada');
    this.speak(this.mode && (this.mode.cheer || (this.config.voice && this.config.voice.cheer)));
    const mode = this.mode;
    this.disposeStage();
    this.mountEl.innerHTML = `
      <section class="qk-coach qk-coach-end" aria-label="${escapeAttr((mode && mode.endTitle) || this.config.title || '')}">
        <div class="qk-coach-end-center">
          <div class="qk-coach-end-art" aria-hidden="true">${escapeHtml(emojiFromRef((mode && mode.endArt) || this.config.splashEmoji || 'emoji:⭐'))}</div>
          <h1>${escapeHtml((mode && (mode.endTitle || mode.title)) || this.config.title || '')}</h1>
          <button class="qk-coach-again" type="button"><span class="qk-coach-play-icon" aria-hidden="true"></span>${escapeHtml((mode && mode.againLabel) || 'PLAY AGAIN')}</button>
          <a class="qk-coach-home qk-coach-img-btn qk-coach-end-home" href="../../" aria-label="Home"></a>
        </div>
      </section>`;
    const again = this.mountEl.querySelector('.qk-coach-again');
    again.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); });
    again.addEventListener('click', () => mode && this.startMode(mode.id));
  }

  getState() {
    const roundsTotal = this.mode
      ? this.mode.type === 'steps' ? (this.mode.steps || []).length : Number(this.mode.rounds || 1)
      : 0;
    const round = this.mode && this.mode.type === 'signal' ? this.cycleIndex : this.stepIndex;
    return { screen: this.screen, mode: this.mode ? this.mode.id : null, round, roundsTotal, awaitingInput: this.awaitingInput, paused: this.paused };
  }

  getTargets() {
    if (this.screen !== 'play') return [];
    return ['done', 'signal-area', 'pause'].map((id) => this.targetMap.get(id)).filter(Boolean).map((target) => {
      // Pixi targets use toGlobal; coach-timer's stable public targets are DOM
      // chrome/checklist rows, whose browser rects are already screen coordinates.
      if (target.view && this.stage) return this.pixiTargetRect(target);
      const rect = target.element.getBoundingClientRect();
      return { id: target.id, role: target.role, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
    });
  }

  pixiTargetRect(target) {
    const canvasRect = this.stage.app.canvas.getBoundingClientRect();
    const stageSize = this.stage.size();
    const scaleX = stageSize.w ? canvasRect.width / stageSize.w : 1;
    const scaleY = stageSize.h ? canvasRect.height / stageSize.h : 1;
    const { PIXI } = this.stage;
    const halfW = target.w / 2;
    const halfH = target.h / 2;
    const corners = [
      target.view.toGlobal(new PIXI.Point(-halfW, -halfH)),
      target.view.toGlobal(new PIXI.Point(halfW, -halfH)),
      target.view.toGlobal(new PIXI.Point(halfW, halfH)),
      target.view.toGlobal(new PIXI.Point(-halfW, halfH)),
    ];
    let minX = corners[0].x;
    let maxX = corners[0].x;
    let minY = corners[0].y;
    let maxY = corners[0].y;
    for (let index = 1; index < corners.length; index++) {
      minX = Math.min(minX, corners[index].x);
      maxX = Math.max(maxX, corners[index].x);
      minY = Math.min(minY, corners[index].y);
      maxY = Math.max(maxY, corners[index].y);
    }
    return {
      id: target.id,
      role: target.role,
      rect: {
        x: canvasRect.left + minX * scaleX,
        y: canvasRect.top + minY * scaleY,
        w: (maxX - minX) * scaleX,
        h: (maxY - minY) * scaleY,
      },
    };
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed) return { accepted: false };
    const result = await target.action();
    return result && typeof result.accepted === 'boolean' ? result : { accepted: true };
  }

  async winRound() {
    const deadline = Date.now() + WIN_BAIL_MS;
    while (!this.destroyed && this.screen === 'play' && Date.now() < deadline) {
      if (this.awaitingInput && !this.inputLocked) {
        if (this.mode.type === 'steps') {
          const result = await this.tapTarget('done');
          if (result.accepted) return;
        } else if (this.mode.type === 'signal') {
          this.clearTimers();
          this.clearClock();
          this.cycleIndex += 1;
          if (this.cycleIndex >= Number(this.mode.rounds || 1)) await this.endMode();
          else await this.startSignalState(0);
          await wait(WAIT_FOR_INPUT);
          return;
        }
      }
      await wait(WIN_RETRY_MS);
    }
  }

  mute() { this.muted = true; speech.stop(); }

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
    if (!this.muted && name && typeof sfx[name] === 'function') sfx[name]();
  }

  reducedMotion() {
    return this.reduced;
  }

  viewIsCurrent(generation) {
    return !this.destroyed && this.screen === 'play' && this.stage && generation === this.viewGeneration;
  }

  schedule(fn, ms) {
    const id = window.setTimeout(() => { this.timerIds.delete(id); fn(); }, ms);
    this.timerIds.add(id);
    return id;
  }

  clearTimers() {
    for (const id of this.timerIds) window.clearTimeout(id);
    this.timerIds.clear();
    this.idleTimer = 0;
    this.signalTimer = 0;
  }
}

function injectStyle() {
  if (styleReady || document.getElementById('qk-coach-style')) { styleReady = true; return; }
  const style = document.createElement('style');
  style.id = 'qk-coach-style';
  style.textContent = `
    @font-face { font-family:'Fredoka'; src:url('${FONT_URL}') format('woff2'); font-weight:600; font-style:normal; font-display:swap; }
    .qk-coach-root, .qk-coach-root * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    .qk-coach { --navy:#17517e; --sky:#bee3f5; position:relative; width:100%; height:100dvh; min-height:100%; overflow:hidden; color:var(--navy); font-family:'Fredoka','Arial Rounded MT Bold',sans-serif; font-weight:600; background-color:var(--sky); background-image:radial-gradient(circle at 20% 20%,rgba(255,255,255,.3) 0 10px,transparent 11px),radial-gradient(circle at 78% 28%,rgba(255,255,255,.23) 0 14px,transparent 15px); background-size:120px 120px,170px 170px; touch-action:manipulation; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
    .qk-coach-img-btn { display:block; width:96px; height:96px; border:0; background:transparent center/contain no-repeat; touch-action:manipulation; cursor:pointer; }
    .qk-coach-home { background-image:url('${HOME_IMG}'); }
    .qk-coach-sound { position:absolute; z-index:8; left:max(16px,env(safe-area-inset-left)); bottom:max(16px,env(safe-area-inset-bottom)); background-image:url('${SOUND_IMG}'); }
    .qk-coach-hud { position:absolute; z-index:7; inset:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) auto max(14px,env(safe-area-inset-left)); min-height:96px; display:flex; align-items:center; justify-content:space-between; pointer-events:none; }
    .qk-coach-hud > * { pointer-events:auto; }
    .qk-coach-splash,.qk-coach-end { display:grid; place-items:center; padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left)); }
    .qk-coach-splash > .qk-coach-home { position:absolute; left:max(16px,env(safe-area-inset-left)); top:max(16px,env(safe-area-inset-top)); }
    .qk-coach-splash-center,.qk-coach-end-center { display:grid; justify-items:center; gap:clamp(14px,2.4vmin,26px); width:min(900px,94vw); text-align:center; }
    .qk-coach-splash-art,.qk-coach-end-art { display:grid; place-items:center; width:min(34vmin,280px); aspect-ratio:1; border:6px solid #fff; border-radius:32px; background:linear-gradient(#fffef8,#f7ecd5); box-shadow:0 8px 0 rgba(23,81,126,.16),0 18px 34px rgba(23,81,126,.14); font-size:min(20vmin,160px); }
    .qk-coach h1 { margin:0; max-width:90vw; font-size:clamp(36px,7vmin,78px); line-height:1; text-shadow:0 4px 0 rgba(255,255,255,.65); }
    .qk-coach-mode-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(260px,86vw),1fr)); width:min(760px,92vw); gap:16px; }
    .qk-coach-mode-button,.qk-coach-again,.qk-coach-pause { min-height:96px; border:6px solid #fff; border-radius:28px; color:var(--navy); background:linear-gradient(rgba(255,255,255,.58),rgba(255,255,255,0) 52%),#ffd166; box-shadow:0 7px 0 rgba(23,81,126,.18),0 16px 28px rgba(23,81,126,.16); font:inherit; font-size:clamp(25px,4vmin,42px); cursor:pointer; touch-action:manipulation; }
    .qk-coach-mode-button { min-height:112px; padding:12px 22px; }
    .qk-coach-workspace { position:absolute; inset:118px 18px 18px; display:grid; grid-template-columns:minmax(280px,1.05fr) minmax(320px,.95fr); gap:clamp(16px,3vw,42px); align-items:center; padding-bottom:82px; }
    .qk-coach-canvas { width:100%; height:100%; min-height:220px; position:relative; }
    .qk-coach-canvas canvas { display:block; }
    .qk-coach-checklist { align-self:center; display:grid; gap:10px; max-height:calc(100dvh - 150px); overflow:auto; margin:0; padding:6px; list-style:none; }
    .qk-coach-row { display:grid; grid-template-columns:56px 1fr; align-items:center; gap:12px; min-height:96px; padding:10px 16px; border:4px solid rgba(255,255,255,.75); border-radius:24px; background:rgba(255,255,255,.55); color:rgba(23,81,126,.63); font-size:clamp(19px,2.6vmin,31px); line-height:1.08; }
    .qk-coach-row.is-now { border-width:6px; border-color:#fff; background:#fff8e8; color:var(--navy); box-shadow:0 7px 0 rgba(23,81,126,.15),0 15px 28px rgba(23,81,126,.13); cursor:pointer; }
    .qk-coach-row.is-done { color:rgba(23,81,126,.45); background:rgba(255,255,255,.35); }
    .qk-coach-check { width:48px; height:48px; border:5px solid #fff; border-radius:50%; background:rgba(23,81,126,.1); box-shadow:inset 0 2px 0 rgba(23,81,126,.08); }
    .qk-coach-row.is-now .qk-coach-check { background:#ffd166; }
    .qk-coach-row.is-done .qk-coach-check { background:#58a945; }
    .qk-coach-row.is-done .qk-coach-check::after { content:'✓'; display:grid; place-items:center; height:100%; color:#fff; font-size:32px; }
    .qk-coach-dots,.qk-coach-round-dots { display:flex; justify-content:center; gap:10px; flex:1; padding:0 12px; }
    .qk-coach-dot { width:22px; height:22px; flex:0 0 auto; border:4px solid #fff; border-radius:50%; background:rgba(255,255,255,.55); box-shadow:0 3px 0 rgba(23,81,126,.13); }
    .qk-coach-dot.is-done { background:#58a945; } .qk-coach-dot.is-now { background:#ffd166; }
    .qk-coach-signal { --qk-signal-color:#58a945; background-color:var(--qk-signal-color); transition:background-color .24s ease; }
    .qk-coach-signal::after { content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(rgba(255,255,255,.19),transparent 42%); }
    .qk-coach-signal.is-paused { filter:saturate(.76); }
    .qk-coach-pause { width:96px; min-height:96px; border-radius:50%; background-color:#fffef8; font-size:48px; line-height:1; }
    .qk-coach-signal-field { position:absolute; z-index:1; inset:112px 18px 30px; display:grid; grid-template-rows:1fr auto; justify-items:center; min-height:0; }
    .qk-coach-signal-cue { max-width:min(900px,90vw); padding:10px 18px 20px; text-align:center; font-size:clamp(28px,4.5vmin,52px); line-height:1; text-shadow:0 3px 0 rgba(255,255,255,.56); }
    .qk-coach-flying-check { position:fixed; z-index:9999; width:48px; height:48px; margin:-24px 0 0 -24px; border:5px solid #fff; border-radius:50%; background:#58a945; box-shadow:0 5px 12px rgba(23,81,126,.24); pointer-events:none; transition:transform 280ms cubic-bezier(.2,.8,.3,1),opacity 280ms ease; }
    .qk-coach-end-art { font-size:min(18vmin,145px); }
    .qk-coach-again { display:flex; align-items:center; justify-content:center; gap:12px; min-width:min(440px,84vw); padding:8px 24px; }
    .qk-coach-play-icon { width:62px; height:62px; background:transparent url('${PLAY_IMG}') center/contain no-repeat; }
    .qk-coach-end-home { position:static; }
    .qk-coach-mode-button:active,.qk-coach-again:active,.qk-coach-img-btn:active,.qk-coach-pause:active,.qk-coach-row.is-now:active { transform:scale(.95); }
    @media (orientation:portrait) { .qk-coach-workspace { grid-template-columns:1fr; grid-template-rows:minmax(230px,42vh) 1fr; inset-top:112px; padding-bottom:88px; } .qk-coach-checklist { width:min(720px,96vw); max-height:38vh; justify-self:center; } }
    @media (orientation:landscape) and (max-height:600px) { .qk-coach-workspace { inset-top:104px; padding-bottom:4px; } .qk-coach-checklist { max-height:calc(100dvh - 120px); } .qk-coach-row { min-height:96px; font-size:20px; } .qk-coach-signal-field { inset-top:96px; } }
    @media (prefers-reduced-motion:reduce) { .qk-coach-root *, .qk-coach-root *::before, .qk-coach-root *::after { animation-duration:.001ms!important; transition-duration:.001ms!important; scroll-behavior:auto!important; } }
  `;
  document.head.appendChild(style);
  styleReady = true;
}

function emojiFromRef(ref) {
  const value = String(ref || '⭐');
  return value.startsWith('emoji:') ? value.slice(6) : value.includes(':') ? '⭐' : value;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function escapeAttr(value) { return escapeHtml(value); }
function wait(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
