// coach-timer.js — Stage v2 archetype for real-world coached activities.
// DOM owns the accessible checklist and chrome; Pixi owns the calm visual coach.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
// Static import is free of network cost: voice-clips fetches nothing until
// init(), which only ever runs for a config that declares `voice.clips`.
import * as clips from '../voice-clips.js';
import * as content from '../content.js';
import { onTap } from '../tap.js';
import { mulberry32 } from '../rng.js';
import { escapeHtml, escapeAttr } from '../dom.js';
import { installDebug } from '../debug-harness.js';
import { createScreens, wireEndScreen } from '../screens.js';
import { renderModeCards } from '../mode-select.js';
import { installEngineStyles } from './engine-styles.js';
import { createStage } from '../stage/stage.js';
import { popIn } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';
import { emojiFromRef } from '../art-ref.js';

const SHARED_ASSETS = new URL('../../assets/', import.meta.url); // -> shared/assets/
const AUDIO_LOG_MAX = 80;
const WAIT_FOR_INPUT = 80;
const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const WIN_RETRY_MS = 120;
const VIDEO_READY_TIMEOUT = 2600; // never-blocks video race (red-green-light's number)
const WIN_BAIL_MS = 15000;
const DIAL_TRACK_STROKE = { width: 22, color: 0xffffff, alpha: 0.68 };
const DIAL_ARC_STROKE = { width: 22, color: 0x58a945, cap: 'round' };

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('coach-timer requires a mount element');
  installStyle();
  return new CoachTimerGame(config || {}, mountEl);
}

class CoachTimerGame {
  constructor(config, mountEl) {
    this.config = config;
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.timeScale = 1;
    this.mode = null;
    // The router owns "which screen is live"; `screen` below is a getter over it.
    this.screens = null;
    this.stepIndex = 0;
    this.cycleIndex = 0;
    this.signalStateIndex = 0;
    this.paused = false;
    this.awaitingInput = false;
    this.inputLocked = false;
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
    // Recorded-voice channel (opt-in via config.voice.clips). The generation is
    // the narrator-style monotonic token: an interrupted line never wakes up
    // over a newer one.
    this.voiceGeneration = 0;
    this.clipsLoading = null;
    this.clipsReady = false;
    this.audioLog = [];
    // Persona + presenter slot (plan §2.3–2.4, ported from red-green-light).
    this.persona = null;
    this.videoEl = null;
    this.posterEl = null;

    this.pointerUnlock = () => this.unlockAudio();
    this.preventGesture = (e) => e.preventDefault();
    this.onVisibility = () => this.syncClock();
    window.addEventListener('pointerdown', this.pointerUnlock, { passive: true });
    window.addEventListener('gesturestart', this.preventGesture);
    window.addEventListener('contextmenu', this.preventGesture);
    document.addEventListener('visibilitychange', this.onVisibility);

    this.buildShell();
    if (this.personaRoster().length) this.renderPersonaSelect();
    else this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebug();
  }

  /** @returns {'splash'|'play'|'end'} straight from the router */
  get screen() {
    return this.screens ? this.screens.current : 'splash';
  }

  /**
   * Three persistent sections, toggled by `hidden`, instead of one mount whose
   * innerHTML is thrown away on every transition. The play section carries the
   * mode-flavour class (`qk-coach-steps` / `qk-coach-signal`) that used to be
   * baked into a freshly-built element.
   */
  buildShell() {
    const hasPersonas = this.personaRoster().length > 0;
    this.mountEl.classList.add('qk-coach-root', 'qk-eng-root');
    this.mountEl.innerHTML = `
      <section class="qk-coach qk-coach-persona qk-eng-surface qk-eng-page" aria-label="${escapeAttr(this.config.selectPrompt || 'Pick your coach')}"${hasPersonas ? '' : ' hidden'}></section>
      <section class="qk-coach qk-coach-splash qk-eng-surface qk-eng-page" aria-label="${escapeAttr(this.config.title || '')}"${hasPersonas ? ' hidden' : ''}></section>
      <section class="qk-coach qk-coach-play qk-eng-surface" hidden></section>
      <section class="qk-coach qk-coach-end qk-eng-surface qk-eng-page" hidden></section>
    `;
    this.screens = createScreens({
      root: this.mountEl,
      screens: {
        persona: this.mountEl.querySelector('.qk-coach-persona'),
        splash: this.mountEl.querySelector('.qk-coach-splash'),
        play: this.mountEl.querySelector('.qk-coach-play'),
        end: this.mountEl.querySelector('.qk-coach-end'),
      },
      initial: hasPersonas ? 'persona' : 'splash',
      voice: { stop: () => this.stopVoice() },
    });
  }

  /** Personas ready to show — `ready: false` keeps unbuilt ones out of the grid. */
  personaRoster() {
    return (this.config.personas || []).filter((p) => p && p.id && p.ready !== false);
  }

  // "Pick your coach" (plan §2.4, generalized from red-green-light's caller
  // select). Only rendered when the config declares ready personas; a game
  // with none keeps the splash as its first screen, byte-identically.
  renderPersonaSelect() {
    this.clearTimers();
    this.disposeStage();
    this.stopVoice();
    this.mode = null;
    this.persona = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    const section = this.screens.el('persona');
    this.screens.release('persona');
    this.screens.show('persona');
    const tiles = this.personaRoster().map((p) => `
      <button class="qk-coach-persona-tile" type="button" data-persona="${escapeAttr(p.id)}" aria-label="${escapeAttr(p.name || p.id)}">
        <span class="qk-coach-persona-art qk-eng-card">${p.poster
          ? `<img src="${escapeAttr(p.poster)}" alt="" draggable="false" />`
          : escapeHtml(emojiFromRef(p.art || 'emoji:🎪'))}</span>
        <span class="qk-coach-persona-name">${escapeHtml(p.name || p.id)}</span>
      </button>`).join('');
    section.innerHTML = `
      <a class="qk-coach-home qk-coach-img-btn qk-eng-ico-home" href="../../" aria-label="Home"></a>
      <div class="qk-coach-splash-center qk-eng-center">
        <h1>${escapeHtml(this.config.selectPrompt || 'Pick your coach!')}</h1>
        <div class="qk-coach-persona-grid">${tiles}</div>
      </div>`;
    // §8: the catalog link exists only while the FIRST screen is live.
    const homeLink = section.querySelector('a.qk-coach-home');
    if (homeLink) this.screens.hold(() => homeLink.remove());
    section.querySelectorAll('.qk-coach-persona-tile').forEach((tile) => {
      const img = tile.querySelector('img');
      if (img) img.addEventListener('error', () => img.replaceWith(document.createTextNode('🎪')), { once: true });
      this.screens.hold(onTap(tile, () => this.selectPersona(tile.dataset.persona), {
        feedback: (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); },
      }));
    });
  }

  selectPersona(id) {
    const persona = this.personaRoster().find((p) => p.id === id);
    if (!persona || this.destroyed) return { accepted: false };
    this.persona = persona;
    this.playSfx('pop');
    this.renderSplash();
    if (persona.audio && persona.audio.greet) {
      this.logAudio('clip', persona.audio.greet, persona.greetText || '');
      clips.sayFile(persona.audio.greet, persona.greetText || 'Hi there! Come play with me!');
    }
    return { accepted: true };
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimers();
    this.disposeStage();
    this.stopVoice();
    if (this.videoEl) {
      try { this.videoEl.pause(); this.videoEl.removeAttribute('src'); this.videoEl.load(); } catch { /* ignore */ }
      this.videoEl = null;
    }
    window.removeEventListener('pointerdown', this.pointerUnlock);
    window.removeEventListener('gesturestart', this.preventGesture);
    window.removeEventListener('contextmenu', this.preventGesture);
    document.removeEventListener('visibilitychange', this.onVisibility);
    if (this.screens) { this.screens.destroy(); this.screens = null; }
    this.mountEl.classList.remove('qk-coach-root', 'qk-eng-root');
    this.mountEl.replaceChildren();
    this.targetMap.clear();
    if (this.disposeDebug) { this.disposeDebug(); this.disposeDebug = null; }
  }

  unlockAudio() {
    // unlock/resume run on every gesture, not just the first: iPadOS can
    // suspend the AudioContext later (app switch, notification, lock), and
    // these calls are cheap and idempotent
    sfx.unlock();
    speech.unlock();
    clips.unlock();
    if (this.videoEl) blessMedia(this.videoEl);
  }

  installDebug() {
    this.disposeDebug = installDebug({
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
      fastTimers: (scale) => this.fastTimers(scale),
      // Coach extra (additive, version stays 1): the ordered record of what the
      // game asked to say — kind 'clip' vs 'speech' is QA's proof the recorded
      // voice actually played.
      getAudioLog: () => this.audioLog.map((entry) => ({ ...entry })),
      listPersonas: () => this.personaRoster().map((p) => ({ id: p.id, name: p.name || p.id })),
      selectPersona: (id) => this.selectPersona(id),
    });
  }

  listModes() {
    return (this.config.modes || []).map((mode) => ({ id: mode.id, title: mode.title }));
  }

  renderSplash() {
    this.clearTimers();
    this.disposeStage();
    this.stopVoice();
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();

    const splash = this.screens.el('splash');
    // show() is idempotent, so re-entering the splash we are already on would
    // not run its bag — release it by hand before the markup underneath changes.
    this.screens.release('splash');
    this.screens.show('splash');
    // With a persona roster the splash is the SECOND screen: it gets a back
    // button to the persona grid instead of the catalog link (§8: home only on
    // the first screen).
    const hasPersonas = this.personaRoster().length > 0;
    splash.innerHTML = `
      ${hasPersonas
        ? '<button class="qk-coach-back qk-coach-img-btn qk-eng-ico-back" type="button" aria-label="Back to coaches"></button>'
        : '<a class="qk-coach-home qk-coach-img-btn qk-eng-ico-home" href="../../" aria-label="Home"></a>'}
      <div class="qk-coach-splash-center qk-eng-center">
        <div class="qk-coach-splash-art qk-eng-card" aria-hidden="true">${escapeHtml(emojiFromRef(this.config.splashEmoji || 'emoji:\u2b50'))}</div>
        <h1>${escapeHtml(this.config.title || '')}</h1>
        <div class="qk-coach-mode-grid qk-eng-mode-list"></div>
      </div>`;

    const picker = renderModeCards({
      host: splash.querySelector('.qk-coach-mode-grid'),
      modes: (this.config.modes || []),
      // The engine paints its own buttons, so screens.css's card skin stays off.
      skin: false,
      cardClass: 'qk-coach-mode-button',
      // getTargets() reads a fixed id list, never the DOM, so `data-target` on
      // the cards would be inert — but leaving it off keeps the splash's target
      // set provably unchanged.
      targetPrefix: null,
      label: (mode) => mode.title || mode.id,
      showTitle: false,
      decorate: (btn, mode) => { btn.textContent = mode.title || mode.id; },
      feedback: (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); },
      onPick: (id) => this.startMode(id),
    });

    // docs/interaction-patterns.md §8, as a DOM invariant rather than a comment:
    // the catalog link exists ONLY while the splash is the live screen. With
    // persistent screen sections the anchor would otherwise sit in the document
    // (hidden, but still findable) for the whole session — and "no catalog link
    // on the play screen" is a check the QA drivers actually make.
    const homeLink = splash.querySelector('a.qk-coach-home');
    if (homeLink) this.screens.hold(() => homeLink.remove());
    const backBtn = splash.querySelector('button.qk-coach-back');
    if (backBtn) this.screens.hold(onTap(backBtn, () => this.renderPersonaSelect()));
    this.screens.hold(picker.dispose);
  }

  async startMode(id) {
    await this.ready;
    const mode = (this.config.modes || []).find((item) => item.id === id);
    if (!mode || this.destroyed) return;
    // The double-tap latch: a second press while the first start is in flight
    // is swallowed rather than running the whole teardown + render twice.
    return this.screens.start(() => this.runMode(mode));
  }

  async runMode(mode) {
    this.clearTimers();
    this.disposeStage();
    this.stopVoice();
    this.mode = normalizeMode(mode);
    mode = this.mode;
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
        <span class="qk-coach-row-text">${escapeHtml(lineText(step.say))}</span>
      </li>`).join('');
    const play = this.openPlayScreen('qk-coach-steps');
    play.innerHTML = `
      <header class="qk-coach-hud">
        <button class="qk-coach-back qk-coach-img-btn qk-eng-ico-back" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-coach-dots" aria-hidden="true"></div>
      </header>
      <main class="qk-coach-workspace">
        <div class="qk-coach-canvas" aria-label="Activity timer and step picture"></div>
        <ol class="qk-coach-checklist" aria-label="Activity steps">${rows}</ol>
      </main>
      <button class="qk-coach-sound qk-coach-img-btn qk-eng-ico-sound" type="button" aria-label="Hear it again"></button>`;
    this.screens.show('play');
    this.applyThemeBackdrop(play);
    this.wireBack(play);
    this.wireReplay(play);
    await this.createPlayStage();
  }

  /**
   * Ready the one play section for a mode flavour. `show()` is idempotent, so
   * re-entering play from play would run neither the disposer bag nor
   * voice.stop() — release by hand before the markup underneath changes.
   */
  openPlayScreen(flavour) {
    const play = this.screens.el('play');
    this.screens.release('play');
    play.classList.toggle('qk-coach-steps', flavour === 'qk-coach-steps');
    play.classList.toggle('qk-coach-signal', flavour === 'qk-coach-signal');
    play.classList.remove('qk-coach-hold');
    play.setAttribute('aria-label', (this.mode && this.mode.title) || '');
    if (flavour === 'qk-coach-signal') play.dataset.targetId = 'signal-area';
    else delete play.dataset.targetId;
    return play;
  }

  async showStep() {
    if (!this.mode || this.mode.type !== 'steps' || this.destroyed) return;
    const steps = this.mode.steps || [];
    const step = steps[this.stepIndex];
    if (!step) { await this.endMode(); return; }
    this.clearTimers();
    this.clearClock();
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.targetMap.clear();
    this.updateChecklist();
    // A `hold` beat drives the room-readable state frame (border + glow in the
    // beat's color) and auto-advances on its clock; setup/do beats clear it.
    const kind = step.kind || 'do';
    const playEl = this.screens.el('play');
    playEl.classList.toggle('qk-coach-hold', kind === 'hold');
    if (kind === 'hold') playEl.style.setProperty('--qk-signal-color', step.color || '#58a945');
    const row = this.screens.el('play').querySelector(`[data-step="${this.stepIndex}"]`);
    if (row) {
      row.classList.add('is-now');
      row.dataset.targetId = 'done';
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `${lineText(step.say)}. ${this.mode.doneLabel || 'Done'}`);
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
    await this.buildCoachView(step.art || this.config.splashEmoji || 'emoji:⭐', lineText(step.say), generation, Boolean(step.timerSec) || kind === 'hold');
    if (!this.viewIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    if (kind === 'hold') this.playSfx(step.sfx || 'pop');
    this.speak(step.say);
    this.startStepTimer(step);
    this.scheduleIdlePrompt();
  }

  updateChecklist() {
    const count = (this.mode.steps || []).length;
    this.screens.el('play').querySelectorAll('.qk-coach-row').forEach((row, index) => {
      row.classList.toggle('is-done', index < this.stepIndex);
      row.classList.toggle('is-now', index === this.stepIndex);
      row.removeAttribute('data-target-id');
      row.removeAttribute('role');
      row.removeAttribute('tabindex');
    });
    const dots = Array.from({ length: count }, (_, index) =>
      `<span class="qk-coach-dot qk-eng-dot-ring${index < this.stepIndex ? ' is-done' : index === this.stepIndex ? ' is-now' : ''}"></span>`).join('');
    const host = this.screens.el('play').querySelector('.qk-coach-dots');
    if (host) host.innerHTML = dots;
  }

  startStepTimer(step) {
    // A `hold` beat always runs a clock: durSec [min,max] (seeded → min) with
    // timerSec as the fallback spelling. Do/setup beats keep today's exact path.
    if ((step.kind || 'do') === 'hold') {
      const durSec = step.durSec != null ? step.durSec : (step.timerSec || 4);
      this.clockTotalMs = this.signalDurationMs({ durSec }) * this.timeScale;
      this.clockDeadline = Date.now() + this.clockTotalMs;
      this.clockDone = false;
      this.lastTickSecond = 0; // no countdown ticks: a hold is a body beat, not a deadline
      this.clockKind = 'step';
      this.clockStep = step;
      this.startClockTicker();
      this.scheduleClockWake(this.clockTotalMs);
      this.syncClock();
      return;
    }
    const seconds = Number(step.timerSec || 0);
    if (!(seconds > 0)) { this.setDialProgress(1, false); return; }
    const duration = this.seeded ? 0.2 : seconds;
    this.clockTotalMs = duration * 1000 * this.timeScale;
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
    const row = this.screens.el('play').querySelector(`[data-step="${this.stepIndex}"]`);
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

  /** The mode's presenter slot (plan §2.3): 'dial' (default Pixi ring),
   *  'image' (full-bleed picture card) or 'video' (per-persona clip per beat,
   *  red-green-light's caller pattern). image/video run on the signal
   *  machinery; steps modes keep the checklist + dial layout. */
  modePresenter() {
    const presenter = this.mode && this.mode.presenter;
    return presenter === 'video' || presenter === 'image' ? presenter : 'dial';
  }

  async renderSignalShell() {
    const play = this.openPlayScreen('qk-coach-signal');
    const presenter = this.modePresenter();
    const surface = presenter === 'dial'
      ? '<div class="qk-coach-canvas" aria-label="Current movement signal"></div>'
      : `<div class="qk-coach-frame" aria-label="Current movement signal">
          <span class="qk-coach-frame-art hidden" aria-hidden="true"></span>
          <img class="qk-coach-poster hidden" alt="" draggable="false" />
          <video class="qk-coach-video hidden" playsinline preload="auto"></video>
        </div>
        <div class="qk-coach-timebar" aria-hidden="true"><span class="qk-coach-timebar-fill"></span></div>`;
    play.innerHTML = `
      <header class="qk-coach-hud">
        <button class="qk-coach-back qk-coach-img-btn qk-eng-ico-back" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-coach-round-dots" aria-hidden="true"></div>
        <button class="qk-coach-pause" type="button" data-target-id="pause" aria-label="Pause">Ⅱ</button>
      </header>
      <main class="qk-coach-signal-field">
        ${surface}
        <div class="qk-coach-signal-cue" aria-live="polite"></div>
      </main>
      <button class="qk-coach-sound qk-coach-img-btn qk-eng-ico-sound" type="button" aria-label="Hear it again"></button>`;
    this.screens.show('play');
    this.applyThemeBackdrop(play);
    this.wireBack(play);
    this.wireReplay(play);
    const pause = play.querySelector('.qk-coach-pause');
    const pauseAction = () => { this.togglePause(); return { accepted: true }; };
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      pauseAction();
    });
    this.targetMap.set('pause', { id: 'pause', role: 'neutral', element: pause, action: pauseAction });
    const area = play;
    const areaAction = () => ({ accepted: true });
    area.addEventListener('pointerdown', () => {
      this.unlockAudio();
      this.tapTarget('signal-area');
    });
    this.targetMap.set('signal-area', { id: 'signal-area', role: 'neutral', element: area, action: areaAction });
    this.videoEl = play.querySelector('.qk-coach-video');
    this.posterEl = play.querySelector('.qk-coach-poster');
    // The fresh <video> must be blessed inside a gesture before timers may
    // play() it unmuted on iOS — same rule as red-green-light.
    if (this.videoEl) blessMedia(this.videoEl);
    if (presenter === 'dial') await this.createPlayStage();
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
    const section = this.screens.el('play');
    if (section) section.style.setProperty('--qk-signal-color', state.color || '#58a945');
    const cue = section && section.querySelector('.qk-coach-signal-cue');
    if (cue) cue.textContent = lineText(state.say);
    this.updateSignalDots();
    const presenter = this.modePresenter();
    const generation = ++this.viewGeneration;
    let videoSpeaks = false;
    if (presenter === 'dial') {
      await this.buildCoachView(state.art || 'emoji:⭐', lineText(state.say), generation, true);
      if (!this.viewIsCurrent(generation)) return;
    } else {
      videoSpeaks = await this.showPresenterCue(state);
      if (this.destroyed || this.screen !== 'play' || generation !== this.viewGeneration) return;
    }
    this.awaitingInput = true;
    this.inputLocked = false;
    this.playSfx(state.sfx || 'pop');
    // A playing persona clip carries the spoken cue itself; TTS/recorded voice
    // only when the presenter has no voice of its own (poster/image fallback).
    if (!videoSpeaks) this.speak(state.say);
    this.scheduleIdlePrompt();
    if (this.paused) return;
    this.clockTotalMs = this.signalDurationMs(state) * this.timeScale;
    this.clockDeadline = startsAt + this.clockTotalMs;
    this.clockDone = false;
    this.clockKind = 'signal';
    if (presenter === 'dial') this.startClockTicker();
    else this.runTimeBar(this.clockTotalMs);
    this.scheduleClockWake(Math.max(0, this.clockDeadline - Date.now()));
    this.syncClock();
  }

  /**
   * Fill the presenter frame for a signal state. Returns true when a persona
   * cue clip is actually playing (it carries the voice); false means the
   * caller should speak the line. Never blocks the beat: the video ready race
   * is capped (red-green-light's never-blocks loader) and any failure leaves
   * the poster/art card showing.
   */
  async showPresenterCue(state) {
    const presenter = this.modePresenter();
    const artSpan = this.screens.el('play').querySelector('.qk-coach-frame-art');
    const showArt = (ref) => {
      const url = artImageUrl(ref, this.config.assetBase);
      if (url && this.posterEl) {
        this.posterEl.src = url;
        this.posterEl.classList.remove('hidden');
        if (artSpan) artSpan.classList.add('hidden');
      } else if (artSpan) {
        artSpan.textContent = emojiFromRef(ref || 'emoji:⭐');
        artSpan.classList.remove('hidden');
        if (this.posterEl) this.posterEl.classList.add('hidden');
      }
    };
    if (this.videoEl) this.videoEl.classList.add('hidden');
    const persona = this.persona;
    const src = presenter === 'video' && persona && persona.video && state.videoKey
      ? persona.video[state.videoKey] : null;
    if (!src || !this.videoEl || this.reducedMotion()) {
      showArt((persona && persona.posterRef) || state.art || (persona && persona.poster) || 'emoji:⭐');
      if (presenter === 'video' && persona && persona.poster && this.posterEl) {
        this.posterEl.src = persona.poster;
        this.posterEl.classList.remove('hidden');
        if (artSpan) artSpan.classList.add('hidden');
      }
      return false;
    }
    // Poster underneath while the clip races its ready deadline.
    if (persona.poster && this.posterEl) {
      this.posterEl.src = persona.poster;
      this.posterEl.classList.remove('hidden');
      if (artSpan) artSpan.classList.add('hidden');
    }
    const ok = await this.loadPresenterVideo(src);
    if (this.destroyed || this.screen !== 'play') return false;
    if (!ok) { this.videoEl.classList.add('hidden'); return false; }
    const video = this.videoEl;
    video.loop = state.motion === 'loop';
    video.muted = this.muted;
    try { video.currentTime = 0; } catch { /* not seekable yet */ }
    video.classList.remove('hidden');
    const played = video.play();
    if (played && played.catch) {
      let spoke = true;
      played.catch(() => { video.classList.add('hidden'); spoke = false; this.speak(state.say); });
      return spoke;
    }
    return true;
  }

  /** Never-blocks loader: resolves true only when the clip is ready to play,
   *  false after the capped race (poster + spoken line take over). */
  loadPresenterVideo(src) {
    const video = this.videoEl;
    return new Promise((resolve) => {
      const ok = () => { cleanup(); resolve(true); };
      const err = () => { cleanup(); resolve(false); };
      const cleanup = () => {
        video.removeEventListener('canplay', ok);
        video.removeEventListener('error', err);
      };
      video.addEventListener('canplay', ok, { once: true });
      video.addEventListener('error', err, { once: true });
      video.src = src;
      video.load();
      this.schedule(() => { cleanup(); resolve(video.readyState >= 3); }, VIDEO_READY_TIMEOUT);
    });
  }

  /** CSS time bar for image/video presenters (the Pixi dial's cheap sibling). */
  runTimeBar(ms) {
    const fill = this.screens.el('play').querySelector('.qk-coach-timebar-fill');
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.transform = 'scaleX(1)';
    if (this.reducedMotion()) return;
    requestAnimationFrame(() => {
      fill.style.transition = `transform ${Math.max(0, ms)}ms linear`;
      fill.style.transform = 'scaleX(0)';
    });
  }

  updateSignalDots() {
    const count = Number(this.mode.rounds || 1);
    const html = Array.from({ length: count }, (_, index) =>
      `<span class="qk-coach-dot qk-eng-dot-ring${index < this.cycleIndex ? ' is-done' : index === this.cycleIndex ? ' is-now' : ''}"></span>`).join('');
    const host = this.screens.el('play').querySelector('.qk-coach-round-dots');
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
    const section = this.screens.el('play');
    const pause = section.querySelector('.qk-coach-pause');
    if (pause) { pause.textContent = this.paused ? '▶' : 'Ⅱ'; pause.setAttribute('aria-label', this.paused ? 'Play' : 'Pause'); }
    if (section) section.classList.toggle('is-paused', this.paused);
    if (this.paused && this.videoEl) { try { this.videoEl.pause(); } catch { /* ignore */ } }
    // Original semantics restart the current signal (including voice and a newly
    // sampled duration) instead of preserving a partial interval.
    if (!this.paused) this.startSignalState(this.signalStateIndex);
  }

  async createPlayStage() {
    const host = this.screens.el('play').querySelector('.qk-coach-canvas');
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
    if (this.clockKind === 'step' && this.clockStep && this.clockStep.kind === 'hold') {
      // A hold beat's clock IS its completion: advance through the same warm
      // path a done-tap takes (sparkle + praise + flying check).
      this.clearClock(false);
      this.awaitingInput = true;
      this.inputLocked = false;
      this.completeStep();
    } else if (this.clockKind === 'step') {
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

  wireReplay(section) {
    const sound = section.querySelector('.qk-coach-sound');
    if (!sound) return;
    this.screens.hold(onTap(sound, () => this.replayPrompt(), {
      feedback: (e) => { e.stopPropagation(); this.unlockAudio(); },
    }));
  }

  // play/end screens rebuild their innerHTML, so the back button is rewired at
  // each render; the disposer rides that screen's own teardown bag.
  wireBack(section) {
    const back = section.querySelector('.qk-coach-back');
    if (!back) return;
    this.screens.hold(onTap(back, () => { this.stopVoice(); this.renderSplash(); }));
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

  /** The current beat's kind — 'do' for legacy steps, 'hold' for signal states. */
  currentBeatKind() {
    if (!this.mode) return null;
    if (this.mode.type === 'steps') {
      const step = (this.mode.steps || [])[this.stepIndex];
      return step ? (step.kind || 'do') : null;
    }
    return 'hold';
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || !this.awaitingInput || this.screen !== 'play') return;
    // Per-beat-kind nudge policy (plan §2.1.2): a checklist `hold` beat gets no
    // nudge at all (the child is SUPPOSED to be away moving); a `setup` beat is
    // adult-paced, so its nudge comes much later. `do` keeps today's timing,
    // and the legacy signal path is untouched.
    const kind = this.currentBeatKind();
    if (kind === 'hold' && this.mode.type === 'steps') return;
    const idleMs = kind === 'setup' ? IDLE_MS * 3 : IDLE_MS;
    this.idleTimer = this.schedule(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || !this.awaitingInput || this.screen !== 'play') return;
      this.idlePrompted = true;
      this.speak(this.currentLine());
    }, idleMs * this.timeScale);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.timerIds.delete(this.idleTimer);
    this.idleTimer = 0;
  }

  applyThemeBackdrop(section) {
    const theme = this.config.theme;
    if (!theme || !theme.background || !section) return;
    const ref = String(theme.background);
    const url = ref.startsWith('shared:') || ref.startsWith('char:') ? artUrlRef(ref) : ref;
    if (url) section.style.background = `#bee3f5 url("${url}") center / cover no-repeat`;
  }

  async endMode() {
    if (this.destroyed) return;
    this.clearTimers();
    this.clearClock();
    this.awaitingInput = true;
    this.inputLocked = false;
    this.targetMap.clear();
    this.playSfx('tada');
    const cheerLine = this.mode && (this.mode.cheer || (this.config.voice && this.config.voice.cheer));
    if (this.persona && this.persona.audio && this.persona.audio.cheer && !this.muted) {
      // The chosen coach celebrates in their own recorded voice (RGL pattern);
      // the authored cheer text remains the fallback if the file is missing.
      this.logAudio('clip', this.persona.audio.cheer, lineText(cheerLine));
      clips.sayFile(this.persona.audio.cheer, lineText(cheerLine));
    } else {
      this.speak(cheerLine);
    }
    const mode = this.mode;
    const end = this.screens.el('end');
    end.setAttribute('aria-label', (mode && mode.endTitle) || this.config.title || '');
    this.screens.release('end');
    // `silent`: endMode has already spoken the cheer line, and the router's
    // voice.stop() would cut it off — which never happened before.
    this.screens.show('end', { silent: true });
    this.disposeStage();
    end.innerHTML = `
      <div class="qk-coach-end-center qk-eng-center">
        <div class="qk-coach-end-art qk-eng-card" aria-hidden="true">${escapeHtml(emojiFromRef((mode && mode.endArt) || this.config.splashEmoji || 'emoji:⭐'))}</div>
        <h1>${escapeHtml((mode && (mode.endTitle || mode.title)) || this.config.title || '')}</h1>
        <button class="qk-coach-again" type="button"><span class="qk-coach-play-icon qk-eng-play-icon" aria-hidden="true"></span>${escapeHtml((mode && mode.againLabel) || 'PLAY AGAIN')}</button>
        <button class="qk-coach-back qk-coach-img-btn qk-eng-ico-back" type="button" aria-label="Back to the game menu"></button>
      </div>`;
    wireEndScreen({
      screens: this.screens,
      back: end.querySelector('.qk-coach-back'),
      again: end.querySelector('.qk-coach-again'),
      // Back has always been a silent return here; the default feedback would
      // add a preventDefault + tick this screen never made.
      feedback: null,
      onSplash: () => { this.stopVoice(); this.renderSplash(); },
      onAgain: () => { if (mode) this.startMode(mode.id); },
    });
    // "again" keeps its own richer press feedback (unlock + tick).
    const again = end.querySelector('.qk-coach-again');
    const press = (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); };
    again.addEventListener('pointerdown', press);
    this.screens.hold(() => again.removeEventListener('pointerdown', press));
  }

  getState() {
    const roundsTotal = this.mode
      ? this.mode.type === 'steps' ? (this.mode.steps || []).length : Number(this.mode.rounds || 1)
      : 0;
    const round = this.mode && this.mode.type === 'signal' ? this.cycleIndex : this.stepIndex;
    return {
      screen: this.screen,
      mode: this.mode ? this.mode.id : null,
      round,
      roundsTotal,
      awaitingInput: this.awaitingInput,
      paused: this.paused,
      beatKind: this.screen === 'play' ? this.currentBeatKind() : null,
      presenter: this.mode ? this.modePresenter() : null,
      persona: this.persona ? this.persona.id : null,
    };
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

  mute() {
    this.muted = true;
    this.stopVoice();
    clips.setMuted(true);
    // Silence stray media too: a persona cue clip carries its own audio track.
    this.mountEl.querySelectorAll('video').forEach((v) => { v.muted = true; });
  }

  seed(n) {
    this.seeded = true;
    this.rng = mulberry32(Number(n) || 1);
  }

  /**
   * QA speed-up. coach-timer's beats ARE real-world timers, so the thing worth
   * compressing is the clock: the scale is applied where a duration becomes a
   * deadline, and the wake that fires it is measured against that same
   * deadline, so the two never drift apart. timers.js is deliberately NOT the
   * mechanism here — scaling `schedule()` alone would fire the wake before
   * `clockDeadline`, `syncClock()` would return early, and the step would
   * never advance. Defaults to 1, so an untouched game is byte-identical.
   * @param {number} [scale] 0.05 (duration multiplier) or 20 (speed factor)
   * @returns {number} the clamped multiplier actually applied
   */
  fastTimers(scale = 0.05) {
    const n = Number(scale);
    const raw = Number.isFinite(n) && n > 0 ? (n > 1 ? 1 / n : n) : 0.05;
    this.timeScale = Math.min(1, Math.max(0.01, raw));
    return this.timeScale;
  }

  /**
   * Speak one authored line. A plain STRING in a config with no `voice.clips`
   * follows exactly the pre-recorded-voice path (speech.js, no logging beyond
   * the audio log entry, no network) — that keeps the 13 legacy configs
   * byte-identical in behaviour. A LINE OBJECT per the platform grammar
   * (`{ clip: 'clip:key' | 'letter:m' | …, text }` or `{ seq: [...], gap, text }`)
   * routes through the recorded-voice channel with `text` as the Web Speech
   * fallback, so a game is never silent while assets are pending.
   */
  speak(line) {
    if (this.muted || !line) return Promise.resolve();
    if (typeof line === 'string' && !this.usesClips()) {
      this.logAudio('speech', line, line);
      return speech.speak(line);
    }
    return this.speakRich(typeof line === 'string' ? { text: line } : line);
  }

  usesClips() {
    return Boolean(this.config.voice && this.config.voice.clips && this.config.voice.clips.manifest);
  }

  /** Cancel everything audible: recorded clip channel AND synthesized speech. */
  stopVoice() {
    this.voiceGeneration += 1;
    if (this.clipsReady) clips.stop(); // pauses the clip channel and stops speech
    speech.stop();
  }

  /** Load the game-local clip manifest, once, lazily. A config with no
   *  voice.clips block never fetches anything — the lazy-network contract. */
  ensureVoiceClips() {
    const spec = this.config.voice && this.config.voice.clips;
    if (!spec || !spec.manifest) return Promise.resolve();
    if (!this.clipsLoading) {
      const base = this.config.assetBase || document.baseURI;
      const manifestUrl = new URL(spec.manifest, base).href;
      // clips.init() defaults linesUrl to './data/lines.json'; hand it an inline
      // empty object instead of provoking a 404 when the game has no lines file.
      const linesUrl = spec.lines ? new URL(spec.lines, base).href : 'data:application/json,%7B%7D';
      this.clipsLoading = clips.init(manifestUrl, linesUrl, spec.defaults || {})
        .then(() => { this.clipsReady = true; })
        .catch(() => { this.clipsReady = true; });
    }
    return this.clipsLoading;
  }

  async speakRich(line) {
    const generation = ++this.voiceGeneration;
    await this.ensureVoiceClips();
    if (this.destroyed || this.muted || generation !== this.voiceGeneration) return;
    const text = typeof line.text === 'string' ? line.text : '';
    const seq = Array.isArray(line.seq) ? line.seq.filter(Boolean) : (line.clip ? [line.clip] : []);
    if (!seq.length) {
      if (!text) return;
      // Clips may be mid-line: a plain-text line in a clips game must still
      // interrupt the channel or it talks over the recording.
      if (this.clipsReady) clips.stop();
      this.logAudio('speech', text, text);
      await speech.speak(text);
      return;
    }
    const gap = Number.isFinite(line.gap) ? Math.max(0, line.gap) : 0;
    const single = seq.length === 1;
    let spoke = false;
    for (let index = 0; index < seq.length; index++) {
      if (this.destroyed || this.muted || generation !== this.voiceGeneration) return;
      const fallback = single ? (text || clipFallbackText(seq[index])) : clipFallbackText(seq[index]);
      if (await this.speakOne(seq[index], fallback)) spoke = true;
      if (this.destroyed || this.muted || generation !== this.voiceGeneration) return;
      if (gap && index < seq.length - 1) await wait(gap);
    }
    // Level-2 fallback: nothing in the sequence was resolvable or speakable.
    if (!spoke && text) {
      this.logAudio('speech', text, text);
      await speech.speak(text);
    }
  }

  /**
   * Play one clip ref. Returns true when something was actually voiced.
   * `clip:<key>` goes through the game-local manifest; every other scheme
   * resolves to a URL and goes through clips.sayFile() (the SHARED manifest is
   * nested by category, so clips.init() on it would silently no-op).
   */
  async speakOne(ref, fallbackText) {
    if (typeof ref !== 'string' || !ref) {
      if (!fallbackText) return false;
      this.logAudio('speech', String(ref || ''), fallbackText);
      await speech.speak(fallbackText);
      return true;
    }
    if (ref.startsWith('clip:')) {
      const key = ref.slice(5);
      this.logAudio('clip', ref, fallbackText);
      await clips.say(key, fallbackText);
      return true;
    }
    const url = clipUrlFor(ref, this.config.assetBase);
    if (!url) {
      if (!fallbackText) return false;
      this.logAudio('speech', ref, fallbackText);
      await speech.speak(fallbackText);
      return true;
    }
    this.logAudio('clip', ref, fallbackText);
    await clips.sayFile(url, fallbackText);
    return true;
  }

  logAudio(kind, key, text) {
    this.audioLog.push({
      key: key || '',
      text: text || '',
      kind: kind || 'speech',
      at: Math.round(typeof performance !== 'undefined' ? performance.now() : Date.now()),
    });
    if (this.audioLog.length > AUDIO_LOG_MAX) this.audioLog.splice(0, this.audioLog.length - AUDIO_LOG_MAX);
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

function installStyle() {
  if (styleInstalled) return;
  styleInstalled = true;
  installEngineStyles('qk-coach-style', `
    /* coach-timer's own skin. The @font-face, the reset, the surface, the
       splash/end page, the centre column, the art tile, the mode grid, the
       button artwork and the progress pips now come from
       shared/css/engine-base.css. What is left is either this engine's palette
       or a control only a coached activity has: the checklist, the signal
       field, the pause button and the flying check.

       The .qk-coach-* class names are unchanged and stay supported — see the
       compatibility window note in shared/js/engines/README.md. */

    .qk-coach {
      --navy: #17517e;
      --sky: #bee3f5;

      --qk-navy: var(--navy);
      --qk-sky: var(--sky);
      /* The art tile's shadow, which is softer than the platform default. */
      --qk-shadow: 0 8px 0 rgba(23,81,126,.16), 0 18px 34px rgba(23,81,126,.14);

      --qk-eng-bg-image:
        radial-gradient(circle at 20% 20%, rgba(255,255,255,.3) 0 10px, transparent 11px),
        radial-gradient(circle at 78% 28%, rgba(255,255,255,.23) 0 14px, transparent 15px);
      --qk-eng-bg-size: 120px 120px, 170px 170px;

      --qk-eng-center-w: min(900px, 94vw);
      --qk-eng-center-gap: clamp(14px, 2.4vmin, 26px);
      --qk-eng-center-pt: 0px;

      --qk-eng-card-w: min(34vmin, 280px);
      --qk-eng-card-border: 6px solid #fff;
      --qk-eng-card-radius: 32px;
      --qk-eng-card-bg: linear-gradient(#fffef8, #f7ecd5);

      --qk-eng-mode-min: min(260px, 86vw);
      --qk-eng-mode-gap: 16px;
      --qk-eng-mode-list-w: min(760px, 92vw);
      --qk-eng-mode-list-mt: 0px;

      /* The ▶ glyph sits in a flex row, so \`inline\` blockifies to exactly what
         it computed to before, when the rule declared no display at all. */
      --qk-eng-play-icon-display: inline;
      --qk-eng-play-icon-size: 62px;
    }

    /* The tile sizes its glyph rather than its art, so it takes .qk-eng-card
       (the box) without .qk-eng-card-glyph (font-size + line-height: 1). */
    .qk-coach-splash-art,.qk-coach-end-art { font-size: min(20vmin,160px); }
    .qk-coach-end-art { font-size: min(18vmin,145px); }

    /* This engine's button is a plain 96px block whose PNG fills it edge to
       edge — not engine-base's 84px-inside-a-96px-circle. Longhands, not the
       \`background\` shorthand: the shorthand would reset the background-image
       .qk-eng-ico-* supplies from the earlier stylesheet. */
    .qk-coach-img-btn { display:block; width:96px; height:96px; border:0; background-color:transparent; background-position:center; background-size:contain; background-repeat:no-repeat; touch-action:manipulation; cursor:pointer; }
    .qk-coach-sound { position:absolute; z-index:8; left:max(16px,env(safe-area-inset-left)); bottom:max(16px,env(safe-area-inset-bottom)); }
    .qk-coach-hud { position:absolute; z-index:7; inset:max(14px,env(safe-area-inset-top)) max(14px,env(safe-area-inset-right)) auto max(14px,env(safe-area-inset-left)); min-height:96px; display:flex; align-items:center; justify-content:space-between; pointer-events:none; }
    .qk-coach-hud > * { pointer-events:auto; }
    .qk-coach-splash > .qk-coach-home,     .qk-coach-splash > .qk-coach-back { position:absolute; left:max(16px,env(safe-area-inset-left)); top:max(16px,env(safe-area-inset-top)); }
    .qk-coach h1 { margin:0; max-width:90vw; font-size:clamp(36px,7vmin,78px); line-height:1; text-shadow:0 4px 0 rgba(255,255,255,.65); }
    /* SPECIFICITY: engine-base's \`.qk-eng-surface button { border: 0 }\` and
       \`{ font: inherit }\` are (0,1,1) and would otherwise beat a bare
       \`.qk-coach-mode-button\` (0,1,0) — coach-timer is the one engine that never
       had a \`button\` reset of its own, so its buttons are the ones that notice.
       Qualifying with the element is the same fix trace-path already carries. */
    .qk-coach button.qk-coach-mode-button,.qk-coach button.qk-coach-again,.qk-coach button.qk-coach-pause { min-height:96px; border:6px solid #fff; border-radius:28px; color:var(--navy); background:linear-gradient(rgba(255,255,255,.58),rgba(255,255,255,0) 52%),#ffd166; box-shadow:0 7px 0 rgba(23,81,126,.18),0 16px 28px rgba(23,81,126,.16); font:inherit; font-size:clamp(25px,4vmin,42px); cursor:pointer; touch-action:manipulation; }
    .qk-coach button.qk-coach-mode-button { min-height:112px; padding:12px 22px; }
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
    /* .qk-eng-dot-ring carries the 22px ringed pip; only the flex sizing and
       the two state colours are this engine's. */
    .qk-coach-dot { flex:0 0 auto; }
    .qk-coach-dot.is-done { background:#58a945; } .qk-coach-dot.is-now { background:#ffd166; }
    .qk-coach-signal { --qk-signal-color:#58a945; background-color:var(--qk-signal-color); transition:background-color .24s ease; }
    /* Room-readable state frame for a checklist \`hold\` beat: the beat color as
       a bold border + inward glow, legible from across the room (RGL pattern). */
    .qk-coach-play.qk-coach-hold::before { content:''; position:absolute; inset:0; z-index:6; pointer-events:none; border:12px solid var(--qk-signal-color,#58a945); box-shadow:inset 0 0 34px var(--qk-signal-color,#58a945); }
    /* Persona select ("pick your coach") */
    .qk-coach-persona-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(220px,42vw),1fr)); gap:18px; width:min(860px,94vw); }
    .qk-coach button.qk-coach-persona-tile { display:grid; gap:10px; justify-items:center; min-height:96px; padding:14px; border:6px solid #fff; border-radius:28px; color:var(--navy); background:linear-gradient(rgba(255,255,255,.58),rgba(255,255,255,0) 52%),#ffd166; box-shadow:0 7px 0 rgba(23,81,126,.18),0 16px 28px rgba(23,81,126,.16); font:inherit; font-size:clamp(22px,3.4vmin,34px); cursor:pointer; touch-action:manipulation; }
    .qk-coach-persona-tile:active { transform:scale(.95); }
    .qk-coach-persona-art { width:min(26vmin,180px); height:min(26vmin,180px); display:grid; place-items:center; overflow:hidden; font-size:min(16vmin,120px); }
    .qk-coach-persona-art img { width:100%; height:100%; object-fit:cover; display:block; }
    .qk-coach-persona-name { font-weight:600; }
    /* image/video presenter frame + CSS time bar (dial's cheap siblings) */
    .qk-coach-frame { position:relative; width:min(76vmin,620px); max-height:100%; aspect-ratio:1/1; border:6px solid #fff; border-radius:32px; overflow:hidden; background:linear-gradient(#fffef8,#f7ecd5); box-shadow:var(--qk-shadow); display:grid; place-items:center; }
    .qk-coach-frame img,.qk-coach-frame video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
    .qk-coach-frame-art { font-size:min(34vmin,260px); line-height:1; }
    .qk-coach-timebar { width:min(76vmin,620px); height:18px; margin-top:12px; border:4px solid #fff; border-radius:12px; background:rgba(255,255,255,.45); overflow:hidden; }
    .qk-coach-timebar-fill { display:block; height:100%; background:var(--qk-signal-color,#58a945); transform-origin:left center; transform:scaleX(1); }
    .qk-coach-signal::after { content:''; position:absolute; inset:0; pointer-events:none; background:linear-gradient(rgba(255,255,255,.19),transparent 42%); }
    .qk-coach-signal.is-paused { filter:saturate(.76); }
    .qk-coach button.qk-coach-pause { width:96px; min-height:96px; border-radius:50%; background-color:#fffef8; font-size:48px; line-height:1; }
    .qk-coach-signal-field { position:absolute; z-index:1; inset:112px 18px 30px; display:grid; grid-template-rows:1fr auto; justify-items:center; min-height:0; }
    .qk-coach-signal-cue { max-width:min(900px,90vw); padding:10px 18px 20px; text-align:center; font-size:clamp(28px,4.5vmin,52px); line-height:1; text-shadow:0 3px 0 rgba(255,255,255,.56); }
    .qk-coach-flying-check { position:fixed; z-index:9999; width:48px; height:48px; margin:-24px 0 0 -24px; border:5px solid #fff; border-radius:50%; background:#58a945; box-shadow:0 5px 12px rgba(23,81,126,.24); pointer-events:none; transition:transform 280ms cubic-bezier(.2,.8,.3,1),opacity 280ms ease; }
    .qk-coach button.qk-coach-again { display:flex; align-items:center; justify-content:center; gap:12px; min-width:min(440px,84vw); padding:8px 24px; }
    .qk-coach-end-home { position:static; }
    .qk-coach-mode-button:active,.qk-coach-again:active,.qk-coach-img-btn:active,.qk-coach-pause:active,.qk-coach-row.is-now:active { transform:scale(.95); }
    @media (orientation:portrait) { .qk-coach-workspace { grid-template-columns:1fr; grid-template-rows:minmax(230px,42vh) 1fr; inset-top:112px; padding-bottom:88px; } .qk-coach-checklist { width:min(720px,96vw); max-height:38vh; justify-self:center; } }
    @media (orientation:landscape) and (max-height:600px) { .qk-coach-workspace { inset-top:104px; padding-bottom:4px; } .qk-coach-checklist { max-height:calc(100dvh - 120px); } .qk-coach-row { min-height:96px; font-size:20px; } .qk-coach-signal-field { inset-top:96px; } }
    @media (prefers-reduced-motion:reduce) { .qk-coach-root *, .qk-coach-root *::before, .qk-coach-root *::after { animation-duration:.001ms!important; transition-duration:.001ms!important; scroll-behavior:auto!important; } }
  `);
}

/**
 * The beat model (docs/coach-mode-plan.md §2.2), as a load-time normalizer so
 * the two legacy mode types keep running byte-identically:
 *   - `beats: [...]` with per-beat `kind: 'setup' | 'do' | 'hold'` is the v2
 *     authoring surface. All-`hold` beats collapse onto the signal machinery
 *     (cyclic, `rounds`); any mix runs on the checklist machinery, where a
 *     `hold` beat auto-advances when its clock elapses (durSec [min,max],
 *     seeded → min) and suppresses the idle nudge, and a `setup` beat is the
 *     adult-addressed untimed variant with a much later nudge.
 *   - Legacy `type: 'steps'` / `type: 'signal'` configs pass through untouched
 *     (steps are `do` beats by omission — `kind` defaults at every use site).
 */
function normalizeMode(mode) {
  if (!mode || !Array.isArray(mode.beats) || !mode.beats.length) return mode;
  const beats = mode.beats.map((beat) => ({ ...beat, kind: beat.kind || 'do' }));
  if (beats.every((beat) => beat.kind === 'hold')) {
    return { ...mode, type: 'signal', states: beats, rounds: mode.rounds || 1 };
  }
  return { ...mode, type: 'steps', steps: beats };
}

/** Prime a media element inside a user gesture so later programmatic play()
 *  (from timers) is allowed and unmuted audio isn't throttled on iOS. */
function blessMedia(el) {
  const wasMuted = el.muted;
  try {
    el.muted = true;
    const p = el.play();
    if (p && p.then) p.then(() => { el.pause(); el.muted = wasMuted; }).catch(() => { el.muted = wasMuted; });
    else { el.pause(); el.muted = wasMuted; }
  } catch { el.muted = wasMuted; }
}

/** Image URL for an art ref, or null when it only renders as an emoji glyph. */
function artImageUrl(ref, base) {
  if (typeof ref !== 'string' || !ref || ref.startsWith('emoji:')) return null;
  if (ref.startsWith('shared:') || ref.startsWith('char:')) return artUrlRef(ref);
  if (ref.startsWith('game:')) return new URL(ref.slice(5), base || document.baseURI).href;
  if (/^(?:https?:|\.{0,2}\/)/.test(ref)) return ref;
  return null;
}

/** Display text for a `say` value that may be a string or a { text } line object. */
function lineText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.text === 'string') return value.text;
  return '';
}

/**
 * Clip-ref grammar, mirroring build-assemble's implementation of the platform
 * grammar (shared/js/engines/README.md § Recorded-voice lines):
 *   letter:<x>   word:<w>   cheer:<w>   isfor:<w>   shared:audio/…   game:…
 * `clip:<key>` is deliberately NOT here — it goes through the game-local
 * manifest via clips.say(). Everything resolved here plays via clips.sayFile().
 */
function clipUrlFor(ref, base) {
  if (typeof ref !== 'string' || !ref) return null;
  if (ref.startsWith('letter:')) return content.letterSoundUrl(ref.slice(7));
  if (ref.startsWith('word:')) return content.wordAudio(ref.slice(5));
  if (ref.startsWith('cheer:')) return content.wordCelebrate(ref.slice(6));
  if (ref.startsWith('isfor:')) return content.isforAudio(ref.slice(6));
  if (ref.startsWith('shared:')) return new URL(ref.slice(7), SHARED_ASSETS).href;
  if (ref.startsWith('game:')) return new URL(ref.slice(5), base || document.baseURI).href;
  return null;
}

/** Spoken fallback for a clip ref when the recording is missing. */
function clipFallbackText(ref) {
  if (typeof ref !== 'string') return '';
  if (ref.startsWith('letter:')) return ref.slice(7);
  if (ref.startsWith('word:')) return ref.slice(5);
  if (ref.startsWith('cheer:')) return ref.slice(6);
  if (ref.startsWith('isfor:')) return ref.slice(6);
  return '';
}

function wait(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }
