// pattern-continue.js — Stage v2 archetype for extending repeating patterns.
// DOM owns the familiar splash/HUD/end chrome; Pixi owns the pattern and choices.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { createStage } from '../stage/stage.js';
import { to, ease, popIn, wiggle } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';
import { onTap } from '../tap.js';
import { mulberry32, shuffle } from '../rng.js';
import { escapeHtml, escapeAttr } from '../dom.js';
import { emojiFromRef } from '../art-ref.js';
import { createTimers } from '../timers.js';
import { installDebug } from '../debug-harness.js';
import { createScreens, wireEndScreen } from '../screens.js';
import { renderModeCards } from '../mode-select.js';
import { installEngineStyles } from './engine-styles.js';

const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const CELL_SIZE = 126;
const CHOICE_SIZE = 174;
const WIN_ROUND_TIMEOUT_MS = 15000;
const WIN_ROUND_RETRY_MS = 120;
const CHOICE_COLORS = [0xe9fff1, 0xfff0e6, 0xeef1ff];

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('pattern-continue requires a mount element');
  installStyle();
  return new PatternContinueGame(config, mountEl);
}

class PatternContinueGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.destroyed = false;
    // The engine keeps its own delay registry (clearDelays() RESOLVES pending
    // waits so an awaiting flow finishes instead of stalling -- timers.js
    // clearAll() deliberately does the opposite). The group is here purely as
    // the scale holder `fastTimers()` turns, read back through `timers.ms()`.
    this.timers = createTimers();

    // The router owns "which screen is live"; `screen` below is a getter over it.
    this.screens = null;
    this.mode = null;
    this.roundItems = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.currentRound = null;
    this.filledMissing = 0;
    this.currentCandidates = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    this.muted = false;
    this.yumIndex = 0;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.targetMap = new Map();
    this.seedValue = null;
    this.rng = Math.random;
    this.fxRng = Math.random;

    this.stage = null;
    this.scene = null;
    this.patternViews = [];
    this.candidateViews = [];
    this.removeResize = null;
    this.stopHolePulse = null;
    this.stageGeneration = 0;
    this.roundGeneration = 0;
    this.pendingDelays = new Set();
    this.activeTweens = new Set();

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (event) => event.preventDefault();
    this.onGestureStart = (event) => event.preventDefault();
    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);

    this.buildShell();
    this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebugHook();
  }

  /** @returns {'splash'|'play'|'end'} straight from the router */
  get screen() {
    return this.screens ? this.screens.current : 'splash';
  }

  /**
   * Three persistent sections, toggled by `hidden`, instead of one mount whose
   * innerHTML is thrown away on every transition. Each section keeps the exact
   * class list it rendered with before, plus the shared `qk-eng-*` vocabulary.
   */
  buildShell() {
    this.mountEl.innerHTML = `
      <section class="qk-pattern qk-pattern-splash qk-eng-root qk-eng-surface qk-eng-page" aria-label="${escapeAttr(this.config.title)}"></section>
      <section class="qk-pattern qk-pattern-play qk-eng-root qk-eng-surface qk-eng-play" hidden></section>
      <section class="qk-pattern qk-pattern-end qk-eng-root qk-eng-surface qk-eng-page" hidden></section>
    `;
    this.screens = createScreens({
      root: this.mountEl,
      screens: {
        splash: this.mountEl.querySelector('.qk-pattern-splash'),
        play: this.mountEl.querySelector('.qk-pattern-play'),
        end: this.mountEl.querySelector('.qk-pattern-end'),
      },
      initial: 'splash',
      voice: { stop: () => speech.stop() },
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearIdleTimer();
    this.disposeStage();
    speech.stop();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gesturestart', this.onGestureStart);
    if (this.screens) { this.screens.destroy(); this.screens = null; }
    this.mountEl.innerHTML = '';
    this.targetMap.clear();
    if (this.disposeDebug) { this.disposeDebug(); this.disposeDebug = null; }
  }

  unlockAudio() {
    // Called on every qualifying gesture, not gated behind a first-touch flag:
    // iPadOS can suspend the AudioContext later (app switch, lock), and these
    // resume calls are cheap and idempotent.
    sfx.unlock();
    speech.unlock();
  }

  installDebugHook() {
    this.disposeDebug = installDebug({
      gameId: this.config.id,
      engine: 'pattern-continue',
      ready: this.ready,
      listModes: () => this.config.modes.map((mode) => ({ id: mode.id, title: mode.title })),
      startMode: (id) => this.startMode(id),
      getState: () => this.getState(),
      getTargets: () => this.getTargets(),
      tap: (targetId) => this.tapTarget(targetId),
      winRound: () => this.winRound(),
      mute: () => this.mute(),
      seed: (n) => this.seed(n),
      timers: this.timers,
    });
  }

  renderSplash() {
    this.clearIdleTimer();
    this.disposeStage();
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    speech.stop();

    const splash = this.screens.el('splash');
    // show() is IDEMPOTENT: re-entering the splash we are already on would run
    // neither the disposer bag nor voice.stop(), so release it by hand first.
    this.screens.release('splash');
    this.screens.show('splash');
    splash.innerHTML = `
      <a class="qk-pattern-home qk-pattern-img-btn qk-eng-img-btn qk-eng-ico-home qk-eng-corner-tl" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
      <div class="qk-pattern-splash-center qk-eng-center">
        <div class="qk-pattern-splash-art qk-eng-card qk-eng-card-glyph" aria-hidden="true">${escapeHtml(emojiFromRef(this.config.splashEmoji))}</div>
        <h1 class="qk-eng-title">${escapeHtml(this.config.title)}</h1>
        <div class="qk-pattern-mode-list qk-eng-mode-list"></div>
      </div>`;
    this.applyThemeBackdrop(splash);

    const picker = renderModeCards({
      host: splash.querySelector('.qk-pattern-mode-list'),
      modes: this.config.modes,
      // The engine paints its own cards, so screens.css's card skin stays off.
      skin: false,
      cardClass: 'qk-pattern-mode qk-eng-mode',
      feedback: (event) => {
        if (event && event.preventDefault) event.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      },
      onPick: (id) => this.startMode(id),
    });

    // docs/interaction-patterns.md §8, as a DOM invariant rather than a comment:
    // the catalog link exists ONLY while the splash is the live screen. With
    // persistent screen sections the anchor would otherwise sit in the document
    // (hidden, but still findable) for the whole session — and "no catalog link
    // on the play screen" is a check the QA drivers actually make.
    const homeLink = splash.querySelector('a.qk-pattern-home');
    if (homeLink) this.screens.hold(() => homeLink.remove());
    this.screens.hold(picker.dispose);
  }

  applyThemeBackdrop(section) {
    const background = this.config.theme && this.config.theme.background;
    if (!section || !background) return;
    const ref = String(background);
    const url = ref.startsWith('shared:') || ref.startsWith('char:') ? artUrlRef(ref) : ref;
    if (url) section.style.background = `#bfe3f5 url("${url.replace(/"/g, '%22')}") center / cover no-repeat`;
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;
    const mode = this.config.modes.find((entry) => entry.id === modeId) || this.config.modes[0];
    if (!mode) return;

    // The double-tap latch: a second card press while the first start is still
    // in flight is swallowed rather than running teardown + render twice.
    return this.screens.start(() => this.runMode(mode));
  }

  async runMode(mode) {
    this.clearIdleTimer();
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.roundIndex = 0;
    this.yumIndex = 0;
    this.roundItems = pickRounds(mode, this.rng);
    this.roundsTotal = this.roundItems.length;
    this.renderPlayShell();
    if (!this.roundsTotal) {
      await this.finishGame();
      return;
    }
    if (!await this.createPlayStage()) return;
    await this.showRound(0);
  }

  renderPlayShell() {
    const dots = Array.from({ length: this.roundsTotal }, (_, index) =>
      `<span class="qk-pattern-dot qk-eng-dot" data-dot="${index}" aria-hidden="true"></span>`).join('');
    const play = this.screens.el('play');
    // Restarting a mode re-renders in place, and show() is idempotent — release
    // the live tap handlers before the DOM under them goes.
    this.screens.release('play');
    play.setAttribute('aria-label', this.mode.title);
    play.innerHTML = `
      <header class="qk-pattern-hud qk-eng-hud">
        <button class="qk-pattern-back qk-pattern-img-btn qk-eng-img-btn qk-eng-ico-back qk-eng-corner-tl" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-pattern-progress qk-eng-pill" aria-hidden="true">${dots}</div>
      </header>
      <main class="qk-pattern-stage qk-eng-stage">
        <div class="qk-pattern-canvas qk-eng-canvas" aria-label="${escapeAttr(this.mode.title)}"></div>
      </main>
      <button class="qk-pattern-sound qk-pattern-img-btn qk-eng-img-btn qk-eng-ico-sound qk-eng-corner-bl" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>`;
    this.screens.show('play');
    this.applyThemeBackdrop(play);

    const home = play.querySelector('.qk-pattern-back');
    this.screens.hold(onTap(home, () => { speech.stop(); this.renderSplash(); }));
    const sound = play.querySelector('.qk-pattern-sound');
    this.screens.hold(onTap(sound, () => this.replayPromptFromHud()));
  }

  async createPlayStage() {
    const host = this.screens.el('play').querySelector('.qk-pattern-canvas');
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
    this.roundGeneration += 1;
    this.stopPulse();
    this.cancelTweens();
    this.clearDelays();
    if (this.removeResize) this.removeResize();
    this.removeResize = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
    this.patternViews = [];
    this.candidateViews = [];
    this.targetMap.clear();
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play' || !this.stage) return;
    this.clearIdleTimer();
    this.stopPulse();
    this.cancelTweens();
    this.roundIndex = index;
    this.currentRound = this.roundItems[index];
    this.filledMissing = 0;
    this.currentCandidates = this.pickCandidatesForCurrentEmpty();
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.targetMap.clear();
    this.patternViews = [];
    this.candidateViews = [];
    const generation = ++this.roundGeneration;

    this.updateDots();
    this.scene = new this.stage.PIXI.Container();
    this.stage.setScene(this.scene);
    await this.buildPatternViews(generation);
    await this.buildCandidateViews(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutField();
    await this.speakLine(this.mode.prompt, true);
    await this.introducePattern(generation);
    await this.introduceCandidates(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.startPulse();
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
  }

  async buildPatternViews(generation) {
    const jobs = this.currentRound.pattern.map(async (unitId, index) => {
      const unit = this.currentRound.units[unitId] || fallbackUnit(unitId);
      const art = await artObj(this.stage.PIXI, unit.art, 82, unit.alt || unit.say || unitId);
      if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
      const target = this.makePatternView(index, unitId, unit, art);
      this.patternViews[index] = target;
      this.targetMap.set(target.id, target);
      this.scene.addChild(target.view);
    });
    await Promise.all(jobs);
  }

  makePatternView(index, unitId, unit, art) {
    const { PIXI } = this.stage;
    const view = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-CELL_SIZE / 2, -CELL_SIZE / 2 + 7, CELL_SIZE, CELL_SIZE, 23)
      .fill({ color: 0x17517e, alpha: 0.16 });
    const backing = cardBacking(PIXI, CELL_SIZE, CELL_SIZE, {
      fill: themeColor(this.config, 'panel', 'fill', 0xfff8e8),
      stroke: themeColor(this.config, 'panel', 'stroke', 0xffffff), strokeWidth: 5, radius: 23,
    });
    const hole = cardBacking(PIXI, CELL_SIZE - 14, CELL_SIZE - 14, {
      fill: 0xffffff, stroke: 0x17517e, strokeWidth: 4, radius: 19,
    });
    hole.alpha = 0.30;
    const question = new PIXI.Text({
      text: '?', style: { fontFamily: 'Fredoka, Arial Rounded MT Bold, sans-serif', fontSize: 68, fill: 0x17517e },
    });
    question.anchor.set(0.5);
    motion.addChild(shadow, backing, hole, question, art);
    view.addChild(motion);
    view.hitArea = new PIXI.Rectangle(-CELL_SIZE / 2, -CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = index < this.visibleCount() ? (unit.say || unitId) : this.config.copy.empty;
    const id = `cell:${index}`;
    view.on('pointerdown', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.tapTarget(id);
    });
    const visible = index < this.visibleCount();
    art.alpha = visible ? 1 : 0;
    hole.alpha = visible ? 0 : 0.30;
    question.alpha = visible ? 0 : 1;
    motion.scale.set(0.01);
    return {
      id, role: 'neutral', type: 'cell', index, unitId, unit, view, motion, art, hole, question,
      size: CELL_SIZE, action: () => this.replayPatternFromCell(),
    };
  }

  async buildCandidateViews(generation) {
    const jobs = this.currentCandidates.map(async (unitId, index) => {
      const unit = this.currentRound.units[unitId] || fallbackUnit(unitId);
      const art = await artObj(this.stage.PIXI, unit.art, 116, unit.alt || unit.say || unitId);
      if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
      const target = this.makeCandidateView(unitId, unit, index, art);
      this.candidateViews[index] = target;
      this.targetMap.set(target.id, target);
      this.scene.addChild(target.view);
    });
    await Promise.all(jobs);
  }

  makeCandidateView(unitId, unit, index, art) {
    const { PIXI } = this.stage;
    const view = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-CHOICE_SIZE / 2, -CHOICE_SIZE / 2 + 8, CHOICE_SIZE, CHOICE_SIZE, 27)
      .fill({ color: 0x17517e, alpha: 0.17 });
    const backing = cardBacking(PIXI, CHOICE_SIZE, CHOICE_SIZE, {
      fill: CHOICE_COLORS[index % CHOICE_COLORS.length], stroke: 0xffffff, strokeWidth: 6, radius: 27,
    });
    motion.addChild(shadow, backing, art);
    view.addChild(motion);
    view.hitArea = new PIXI.Rectangle(-CHOICE_SIZE / 2, -CHOICE_SIZE / 2, CHOICE_SIZE, CHOICE_SIZE);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = unit.say || unitId;
    const id = `cand:${unitId}`;
    view.on('pointerdown', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.tapTarget(id);
    });
    motion.scale.set(0.01);
    return {
      id, role: this.roleForUnit(unitId), type: 'candidate', unitId, unit, view, motion,
      size: CHOICE_SIZE, action: () => this.handleCandidate(id),
    };
  }

  async replaceCandidates(generation) {
    this.candidateViews.forEach((target) => {
      if (!target) return;
      this.targetMap.delete(target.id);
      if (target.view.parent) target.view.parent.removeChild(target.view);
      target.view.destroy({ children: true });
    });
    this.candidateViews = [];
    this.currentCandidates = this.pickCandidatesForCurrentEmpty();
    await this.buildCandidateViews(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutField();
    await this.introduceCandidates(generation);
  }

  layoutField() {
    if (!this.stage || !this.scene || !this.patternViews.length) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;
    const cells = this.patternViews.filter(Boolean);
    const choices = this.candidateViews.filter(Boolean);
    const portrait = h >= w;
    const pad = Math.max(8, Math.min(20, Math.min(w, h) * 0.024));
    const gap = Math.max(7, Math.min(15, w * 0.014));
    const patternArea = portrait ? Math.min(h * 0.48, 390) : Math.min(h * 0.47, 260);
    // Wrap before shrinking below the 96px interaction floor. This matters on
    // narrow portrait tablets and compact split-screen landscape layouts.
    const fittingColumns = Math.max(2, Math.floor((w - pad * 2 + gap) / (96 + gap)));
    const columns = Math.min(cells.length, portrait ? Math.min(4, fittingColumns) : fittingColumns);
    const rows = Math.ceil(cells.length / columns);
    const cellFitW = (w - pad * 2 - gap * (columns - 1)) / columns;
    const cellFitH = (patternArea - pad * 2 - gap * (rows - 1)) / rows;
    const cellScale = Math.max(96 / CELL_SIZE, Math.min(1, cellFitW / CELL_SIZE, cellFitH / CELL_SIZE));
    const cell = CELL_SIZE * cellScale;
    const totalPatternH = rows * cell + (rows - 1) * gap;
    cells.forEach((target, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const rowCount = Math.min(columns, cells.length - row * columns);
      const totalW = rowCount * cell + (rowCount - 1) * gap;
      target.view.position.set((w - totalW) / 2 + cell / 2 + col * (cell + gap),
        pad + (patternArea - totalPatternH) / 2 + cell / 2 + row * (cell + gap));
      target.view.scale.set(cellScale);
    });

    if (!choices.length) return;
    const choiceTop = patternArea;
    const choiceAreaH = h - choiceTop;
    const choiceColumns = portrait && choices.length === 3 && w < 620 ? 2 : choices.length;
    const choiceRows = Math.ceil(choices.length / choiceColumns);
    const choiceGap = Math.max(12, Math.min(26, Math.min(w, h) * 0.03));
    const fitW = (w - pad * 2 - choiceGap * (choiceColumns - 1)) / choiceColumns;
    const fitH = (choiceAreaH - pad * 2 - choiceGap * (choiceRows - 1)) / choiceRows;
    const choiceScale = Math.max(96 / CHOICE_SIZE, Math.min(1.12, fitW / CHOICE_SIZE, fitH / CHOICE_SIZE));
    const choice = CHOICE_SIZE * choiceScale;
    const totalChoiceH = choiceRows * choice + (choiceRows - 1) * choiceGap;
    choices.forEach((target, index) => {
      const row = Math.floor(index / choiceColumns);
      const col = index % choiceColumns;
      const rowCount = Math.min(choiceColumns, choices.length - row * choiceColumns);
      const totalW = rowCount * choice + (rowCount - 1) * choiceGap;
      target.view.position.set((w - totalW) / 2 + choice / 2 + col * (choice + choiceGap),
        choiceTop + (choiceAreaH - totalChoiceH) / 2 + choice / 2 + row * (choice + choiceGap));
      target.view.scale.set(choiceScale);
    });
  }

  async introducePattern(generation) {
    for (let index = 0; index < this.patternViews.length; index++) {
      if (!this.roundIsCurrent(generation)) return;
      const target = this.patternViews[index];
      await this.runTween(popIn(target.motion, 260));
      if (index < this.visibleCount()) {
        this.playSfx(target.unit.sfx || 'tick');
        await this.speakLine(target.unit.say || target.unitId, true);
      } else {
        this.playSfx('tick');
      }
      await this.delay(this.patternDelay(false));
    }
  }

  async introduceCandidates(generation) {
    await Promise.all(this.candidateViews.filter(Boolean).map(async (target, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 70);
      if (this.roundIsCurrent(generation)) await this.runTween(popIn(target.motion, 340));
    }));
  }

  pickCandidatesForCurrentEmpty() {
    const correct = this.currentCorrectUnit();
    const base = unique([correct, ...this.currentRound.candidates,
      ...this.currentRound.pattern.slice(this.visibleBaseCount())].filter(Boolean));
    const wrongs = base.filter((unitId) => unitId !== correct);
    const count = clamp(this.currentRound.candidateCount, 2, 3);
    return shuffle([correct, ...shuffle(wrongs, this.rng).slice(0, count - 1)], this.rng);
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed || !target.action) return { accepted: false };
    const accepted = await target.action();
    return { accepted: accepted !== false };
  }

  async handleCandidate(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || !this.awaitingInput || this.inputLocked) return false;
    this.clearIdleTimer();
    if (target.role === 'correct') await this.handleCorrect(target);
    else await this.handleWrong(target);
    return true;
  }

  async handleCorrect(target) {
    const generation = this.roundGeneration;
    this.inputLocked = true;
    this.awaitingInput = false;
    this.stopPulse();
    const emptyIndex = this.currentEmptyIndex();
    const cell = this.patternViews[emptyIndex];
    this.playSfx('pop');
    await this.bounceChoice(target);
    this.playSfx('whoosh');
    await this.flyChoice(target, cell);
    if (!this.roundIsCurrent(generation)) return;

    this.filledMissing += 1;
    cell.art.alpha = 1;
    cell.hole.alpha = 0;
    cell.question.alpha = 0;
    cell.view.accessibleTitle = cell.unit.say || cell.unitId;
    target.view.alpha = 0;
    await Promise.all([
      this.springSnap(cell),
      sparkle(this.stage.PIXI, this.scene, cell.view.x, cell.view.y),
    ]);
    await this.performPattern({ slow: false, generation });
    if (!this.roundIsCurrent(generation)) return;

    if (this.filledMissing >= this.currentRound.missing) {
      this.playSfx('sparkle');
      const { w, h } = this.stage.size();
      await Promise.all([
        burst(this.stage.PIXI, this.scene, w / 2, Math.min(h * 0.42, this.patternViews.at(-1).view.y),
          { count: 34, power: 7, life: 760 }),
        this.celebrationLine(),
      ]);
      await this.delay(this.shortDelay(380));
      if (!this.roundIsCurrent(generation)) return;
      const next = this.roundIndex + 1;
      if (next >= this.roundsTotal) await this.finishGame();
      else await this.showRound(next);
      return;
    }

    await this.replaceCandidates(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.startPulse();
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
  }

  async celebrationLine() {
    const yums = this.config.voice.yums;
    if (!yums.length) return;
    const line = yums[this.yumIndex % yums.length];
    this.yumIndex += 1;
    await this.speakLine(line, true);
  }

  async handleWrong(target) {
    this.inputLocked = true;
    this.playSfx('boing');
    await Promise.all([wiggle(target.motion), this.speakLine(this.config.voice.nudge, true)]);
    await this.performPattern({ slow: true, generation: this.roundGeneration });
    if (this.destroyed || this.screen !== 'play' || !this.awaitingInput) return;
    target.motion.rotation = 0;
    target.motion.scale.set(1);
    this.inputLocked = false;
    this.startPulse();
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
  }

  async bounceChoice(target) {
    await this.animateMotion(target, { y: -7, scale: { x: 1.12, y: 0.92 } }, { ms: 130, easing: ease.outBack });
    await this.animateMotion(target, { y: 0, scale: { x: 1, y: 1 } }, { ms: 150, easing: ease.outElastic });
  }

  async flyChoice(target, cell) {
    target.view.eventMode = 'none';
    this.scene.addChild(target.view);
    const destinationScale = cell.view.scale.x * CELL_SIZE / CHOICE_SIZE;
    const midX = (target.view.x + cell.view.x) / 2;
    const midY = Math.min(target.view.y, cell.view.y) - 46;
    await this.runTween(to(target.view, { x: midX, y: midY, scale: { x: destinationScale * 1.08, y: destinationScale * 1.08 } },
      { ms: this.shortDelay(250), easing: ease.outCubic }));
    await this.runTween(to(target.view, { x: cell.view.x, y: cell.view.y, scale: { x: destinationScale, y: destinationScale } },
      { ms: this.shortDelay(230), easing: ease.outBack }));
  }

  async springSnap(cell) {
    await this.animateMotion(cell, { scale: { x: 1.14, y: 0.90 } }, { ms: 125, easing: ease.outBack });
    await this.animateMotion(cell, { scale: { x: 1, y: 1 } }, { ms: 220, easing: ease.outElastic });
  }

  async performPattern({ slow, generation }) {
    const count = this.visibleCount();
    for (let index = 0; index < count; index++) {
      if (!this.roundIsCurrent(generation)) return;
      const target = this.patternViews[index];
      const unit = target.unit;
      await this.animateMotion(target, { y: -10, scale: { x: 1.08, y: 0.94 } },
        { ms: this.shortDelay(95), easing: ease.outCubic });
      this.playSfx(unit.sfx || 'tick');
      await Promise.all([
        this.speakLine(unit.say || target.unitId, true),
        this.animateMotion(target, { y: 0, scale: { x: 1, y: 1 } },
          { ms: this.shortDelay(150), easing: ease.outBack }),
      ]);
      await this.delay(this.patternDelay(slow));
    }
  }

  replayPromptFromHud() {
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_DEBOUNCE_MS) return;
    this.lastReplay = now;
    this.playSfx('tick');
    this.replayPrompt();
  }

  async replayPrompt() {
    if (this.screen !== 'play' || !this.currentRound || this.inputLocked) return false;
    const generation = this.roundGeneration;
    const wasAwaiting = this.awaitingInput;
    this.clearIdleTimer();
    this.stopPulse();
    this.inputLocked = true;
    this.awaitingInput = false;
    await this.speakLine(this.mode.prompt, true);
    await this.performPattern({ slow: true, generation });
    if (!this.roundIsCurrent(generation)) return false;
    this.awaitingInput = wasAwaiting;
    this.inputLocked = false;
    this.startPulse();
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
    return true;
  }

  async replayPatternFromCell() {
    if (this.screen !== 'play' || this.inputLocked) return false;
    const generation = this.roundGeneration;
    const wasAwaiting = this.awaitingInput;
    this.clearIdleTimer();
    this.stopPulse();
    this.inputLocked = true;
    this.awaitingInput = false;
    await this.performPattern({ slow: true, generation });
    if (!this.roundIsCurrent(generation)) return false;
    this.awaitingInput = wasAwaiting;
    this.inputLocked = false;
    this.startPulse();
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
    return true;
  }

  startPulse() {
    this.stopPulse();
    if (this.reducedMotion() || !this.awaitingInput) return;
    const target = this.patternViews[this.currentEmptyIndex()];
    if (!target) return;
    let stopped = false;
    let current = null;
    this.stopHolePulse = () => {
      stopped = true;
      if (current && current.cancel) current.cancel();
      target.motion.scale.set(1);
    };
    (async () => {
      while (!stopped && this.awaitingInput && this.screen === 'play') {
        current = to(target.motion, { scale: { x: 1.055, y: 1.055 } }, { ms: 1050, easing: ease.inOutSine });
        await this.runTween(current);
        if (stopped) break;
        current = to(target.motion, { scale: { x: 1, y: 1 } }, { ms: 1050, easing: ease.inOutSine });
        await this.runTween(current);
      }
    })();
  }

  stopPulse() {
    if (this.stopHolePulse) this.stopHolePulse();
    this.stopHolePulse = null;
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.replayPrompt();
    }, this.timers.ms(IDLE_MS));
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  async finishGame() {
    this.clearIdleTimer();
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    // Leave 'play' before the stage goes: everything that guards on
    // `screen === 'play'` used to see the flag flip right here.
    const end = this.screens.el('end');
    end.setAttribute('aria-label', this.config.voice.cheer);
    this.screens.release('end');
    // `silent`: the cheer line is spoken below, and the router's voice.stop()
    // would cut off whatever is still playing — which never happened before.
    this.screens.show('end', { silent: true });
    this.playSfx('tada');
    this.disposeStage();
    this.renderEnd(end);
    this.speakLine(this.config.voice.cheer, true);
  }

  renderEnd(end) {
    end.innerHTML = `
      <button class="qk-pattern-back qk-pattern-img-btn qk-eng-img-btn qk-eng-ico-back qk-eng-corner-tl" type="button" aria-label="Back to the game menu"></button>
      <div class="qk-pattern-end-center qk-eng-center">
        <div class="qk-pattern-end-art qk-eng-card qk-eng-card-glyph" aria-hidden="true">${escapeHtml(emojiFromRef(this.config.endArt || this.config.splashEmoji))}</div>
        <h1 class="qk-eng-title">${escapeHtml(this.config.voice.cheer)}</h1>
        <button class="qk-pattern-again qk-eng-mode" type="button">
          <span class="qk-pattern-play-icon qk-eng-play-icon" aria-hidden="true"></span>
          <span>${escapeHtml(this.config.copy.playAgain)}</span>
        </button>
      </div>`;
    this.applyThemeBackdrop(end);
    wireEndScreen({
      screens: this.screens,
      back: end.querySelector('.qk-pattern-back'),
      again: end.querySelector('.qk-pattern-again'),
      // Back has always been a silent return to the splash here; the default
      // preventDefault + sfx.tick would add a sound this screen never made.
      feedback: null,
      onSplash: () => { speech.stop(); this.renderSplash(); },
      onAgain: () => (this.mode ? this.startMode(this.mode.id) : this.renderSplash()),
    });
    // "again" keeps its own richer press feedback (unlock + tick).
    const again = end.querySelector('.qk-pattern-again');
    const press = (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.playSfx('tick');
    };
    again.addEventListener('pointerdown', press);
    this.screens.hold(() => again.removeEventListener('pointerdown', press));
  }

  updateDots() {
    this.screens.el('play').querySelectorAll('.qk-pattern-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  updateTargetRoles() {
    this.targetMap.forEach((target) => {
      target.role = target.type === 'candidate' ? this.roleForUnit(target.unitId) : 'neutral';
    });
  }

  getState() {
    return {
      screen: this.screen,
      mode: this.mode ? this.mode.id : null,
      round: this.screen === 'play' ? this.roundIndex : this.roundsTotal,
      roundsTotal: this.roundsTotal,
      awaitingInput: this.awaitingInput,
    };
  }

  getTargets() {
    if (this.screen !== 'play' || !this.stage) return [];
    const canvasRect = this.stage.app.canvas.getBoundingClientRect();
    const stageSize = this.stage.size();
    const scaleX = stageSize.w ? canvasRect.width / stageSize.w : 1;
    const scaleY = stageSize.h ? canvasRect.height / stageSize.h : 1;
    const { PIXI } = this.stage;
    return Array.from(this.targetMap.values()).filter((target) => target.view).map((target) => {
      const half = target.size / 2;
      const corners = [
        target.view.toGlobal(new PIXI.Point(-half, -half)),
        target.view.toGlobal(new PIXI.Point(half, -half)),
        target.view.toGlobal(new PIXI.Point(half, half)),
        target.view.toGlobal(new PIXI.Point(-half, half)),
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
    });
  }

  async winRound() {
    if (this.screen !== 'play') return;
    const startGeneration = this.roundGeneration;
    const deadline = performance.now() + WIN_ROUND_TIMEOUT_MS;
    while (!this.destroyed && this.screen === 'play' && this.roundGeneration === startGeneration) {
      if (performance.now() >= deadline) return;
      if (!this.awaitingInput || this.inputLocked) {
        await this.delay(WIN_ROUND_RETRY_MS);
        continue;
      }
      const target = this.targetMap.get(`cand:${this.currentCorrectUnit()}`);
      if (!target) {
        await this.delay(WIN_ROUND_RETRY_MS);
        continue;
      }
      const result = await this.tapTarget(target.id);
      if (!result.accepted) await this.delay(WIN_ROUND_RETRY_MS);
    }
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    this.seedValue = Number(n) || 0;
    this.rng = mulberry32(this.seedValue);
    this.fxRng = mulberry32(this.seedValue ^ 0x9E3779B9);
  }

  async speakLine(line, cancel = true) {
    if (this.muted || !line) return;
    await speech.speak(line, { rate: 0.82, pitch: 1.06, cancel });
  }

  playSfx(name) {
    if (this.muted || !sfx[name]) return;
    sfx[name]();
  }

  visibleBaseCount() { return this.currentRound.pattern.length - this.currentRound.missing; }
  visibleCount() { return this.visibleBaseCount() + this.filledMissing; }
  currentEmptyIndex() { return this.visibleCount(); }
  currentCorrectUnit() { return this.currentRound.pattern[this.currentEmptyIndex()]; }
  roleForUnit(unitId) { return unitId === this.currentCorrectUnit() ? 'correct' : 'wrong'; }
  patternDelay(slow) { return this.muted || this.reducedMotion() ? (slow ? 80 : 45) : (slow ? 180 : 90); }
  shortDelay(ms) { return this.muted || this.reducedMotion() ? Math.min(ms, 90) : ms; }
  reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  roundIsCurrent(generation) {
    return !this.destroyed && this.screen === 'play' && this.stage && generation === this.roundGeneration;
  }

  async animateMotion(target, props, options) {
    if (!target || !target.motion) return;
    if (target.motionTween) target.motionTween.cancel();
    const tween = to(target.motion, props, options);
    target.motionTween = tween;
    await this.runTween(tween);
    if (target.motionTween === tween) target.motionTween = null;
  }

  async runTween(tween) {
    this.activeTweens.add(tween);
    try { await tween; } finally { this.activeTweens.delete(tween); }
  }

  cancelTweens() {
    this.activeTweens.forEach((tween) => tween.cancel && tween.cancel());
    this.activeTweens.clear();
  }

  delay(ms) {
    return new Promise((resolve) => {
      const entry = { timer: 0, resolve };
      entry.timer = window.setTimeout(() => { this.pendingDelays.delete(entry); resolve(); }, this.timers.ms(ms));
      this.pendingDelays.add(entry);
    });
  }

  clearDelays() {
    this.pendingDelays.forEach((entry) => { window.clearTimeout(entry.timer); entry.resolve(); });
    this.pendingDelays.clear();
  }
}

function normalizeConfig(config) {
  const copy = {
    home: 'Home', replay: 'Hear the pattern again', playAgain: 'Play Again',
    pattern: 'Pattern', candidates: 'Choices', empty: 'Empty spot', ...(config.copy || {}),
  };
  const voice = {
    intro: '', nudge: 'Listen to the pattern. Try another one.',
    cheer: 'Hooray! You made the patterns!', yums: ['Yes! The pattern keeps going!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice!')];
  const rawModes = Array.isArray(config.modes) && config.modes.length ? config.modes : [config];
  return {
    ...config,
    id: config.id || 'pattern-continue', title: config.title || 'Pattern Train',
    splashEmoji: config.splashEmoji || config.splashArt || '🚂', copy, voice,
    modes: rawModes.map((mode, index) => normalizeMode(mode, index)),
  };
}

function normalizeMode(mode, index) {
  const rawRounds = mode.rounds_spec || mode.items || mode.patterns || [];
  const rounds = rawRounds.map(normalizeRound).filter(Boolean);
  return {
    id: mode.id || `mode-${index + 1}`, title: mode.title || 'Patterns',
    prompt: mode.prompt || 'What comes next? Watch the pattern!',
    difficultyRamp: Boolean(mode.difficultyRamp), ...mode,
    rounds: Math.min(Number(mode.rounds) || rounds.length, rounds.length), rounds_spec: rounds,
  };
}

function normalizeRound(round) {
  if (!round || !Array.isArray(round.pattern) || round.pattern.length < 3) return null;
  const pattern = round.pattern.map((unitId) => String(unitId));
  const units = {};
  const rawUnits = round.units || {};
  unique(pattern.concat(Object.keys(rawUnits))).forEach((unitId) => {
    const unit = rawUnits[unitId] || {};
    units[unitId] = {
      art: unit.art || `text:${unitId}`, alt: unit.alt || unit.say || unitId,
      say: unit.say || unit.alt || unitId, sfx: unit.sfx || 'tick',
    };
  });
  const missing = clamp(Number(round.missing) || 1, 1, Math.min(2, pattern.length - 1));
  const candidates = unique((round.candidates || Object.keys(units)).map((unitId) => String(unitId)));
  const hidden = pattern.slice(pattern.length - missing);
  return {
    ...round, pattern, missing, units, candidates: unique(candidates.concat(hidden)),
    candidateCount: clamp(Number(round.candidateCount)
      || Math.max(2, Math.min(3, candidates.length || Object.keys(units).length)), 2, 3),
    difficultyScore: difficultyScore(pattern, missing),
  };
}

function pickRounds(mode, rng) {
  let rounds = mode.rounds_spec.slice();
  if (mode.difficultyRamp) {
    rounds = rounds.map((round, index) => ({ round, index }))
      .sort((a, b) => a.round.difficultyScore - b.round.difficultyScore || a.index - b.index)
      .map((entry) => entry.round);
  } else rounds = shuffle(rounds, rng);
  return rounds.slice(0, mode.rounds);
}

function difficultyScore(pattern, missing) {
  const motif = repeatingMotif(pattern);
  return (missing - 1) * 100 + motif.length * 10 + unique(motif).length;
}

function repeatingMotif(pattern) {
  for (let size = 1; size <= Math.min(4, pattern.length); size++) {
    let ok = true;
    for (let index = 0; index < pattern.length; index++) {
      if (pattern[index] !== pattern[index % size]) { ok = false; break; }
    }
    if (ok) return pattern.slice(0, size);
  }
  return pattern.slice(0, Math.min(4, pattern.length));
}

function fallbackUnit(unitId) { return { art: `text:${unitId}`, alt: unitId, say: unitId, sfx: 'tick' }; }
function unique(list) { return Array.from(new Set(list)); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function themeColor(config, group, key, fallback) {
  const value = config.theme && config.theme[group] && config.theme[group][key];
  return value == null ? fallback : value;
}
function installStyle() {
  if (styleInstalled) return;
  styleInstalled = true;
  installEngineStyles('qk-pattern-style', `
    /* pattern-continue's own skin. The @font-face, the reset, the surface, the
       96px PNG buttons, the splash/end column, the mode buttons, the HUD grid,
       the stage and the canvas now come from shared/css/engine-base.css; what is
       left is this engine's palette.

       The .qk-pattern-* class names are unchanged and stay supported — see the
       compatibility window note in shared/js/engines/README.md. */

    .qk-pattern {
      --sky: #bee3f5;
      --navy: #17517e;
      --blue: #2d7dd2;
      --purple: #7c4fc4;
      --white: #fff;
      --mint: #81d6a3;
      --peach: #ffad7a;
      --shadow: 0 6px 0 rgba(23,81,126,.18), 0 14px 30px rgba(23,81,126,.18);

      /* Alias, don't hard-code: a game skin that redefines --navy or --shadow
         under #game must keep reaching every shared rule. */
      --qk-navy: var(--navy);
      --qk-sky: var(--sky);
      --qk-white: var(--white);
      --qk-primary: var(--purple);
      --qk-shadow: var(--shadow);

      --qk-eng-bg-image:
        linear-gradient(180deg, rgba(255,255,255,.36), transparent 42%),
        radial-gradient(circle at 18% 20%, rgba(255,248,232,.72) 0 9px, transparent 10px),
        radial-gradient(circle at 72% 18%, rgba(129,214,163,.42) 0 12px, transparent 13px),
        radial-gradient(circle at 45% 82%, rgba(255,173,122,.36) 0 10px, transparent 11px);
      --qk-eng-bg-size: auto, 180px 180px, 250px 250px, 220px 220px;

      --qk-eng-title-w: 12ch;
      --qk-eng-hud-z: 3;
      --qk-eng-stage-w: min(1120px, 100%);
      /* This engine's pips are flat — no inset highlight. */
      --qk-eng-dot-shadow: none;
    }

    .qk-pattern-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-pattern-mode:nth-child(3n) { background-color: #2e9f76; }

    .qk-pattern-dot { opacity: .8; }
    .qk-pattern-dot.is-filled { background: var(--mint); opacity: 1; }
    .qk-pattern-dot.is-current { background: var(--peach); opacity: 1; transform: scale(1.16); }

    .qk-pattern-again {
      display: inline-grid;
      grid-template-columns: 72px auto;
      align-items: center;
      gap: 14px;
      min-width: min(420px, 100%);
      background-color: var(--blue);
    }

    @media (max-width: 560px) {
      .qk-pattern-hud { grid-template-columns: 96px 1fr; }
      .qk-pattern-progress { justify-self: end; }
    }
    @media (prefers-reduced-motion: reduce) {
      .qk-pattern * { transition: none !important; animation: none !important; }
    }
  `);
}
