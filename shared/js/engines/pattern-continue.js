// pattern-continue.js — Stage v2 archetype for extending repeating patterns.
// DOM owns the familiar splash/HUD/end chrome; Pixi owns the pattern and choices.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { createStage } from '../stage/stage.js';
import { to, ease, popIn, wiggle } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;

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
    this.previousDebug = window.QLOBE_DEBUG;

    this.screen = 'splash';
    this.mode = null;
    this.roundItems = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.currentRound = null;
    this.filledMissing = 0;
    this.currentCandidates = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
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

    this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebugHook();
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
    this.mountEl.innerHTML = '';
    this.targetMap.clear();
    if (window.QLOBE_DEBUG === this.debugHook) {
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

  installDebugHook() {
    this.debugHook = {
      version: 1,
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
    };
    window.QLOBE_DEBUG = this.debugHook;
  }

  renderSplash() {
    this.clearIdleTimer();
    this.disposeStage();
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    speech.stop();

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-pattern-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        <span>${escapeHtml(mode.title)}</span>
      </button>
    `).join('');
    this.mountEl.innerHTML = `
      <section class="qk-pattern qk-pattern-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-pattern-home qk-pattern-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-pattern-splash-center">
          <div class="qk-pattern-splash-art" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-pattern-mode-list">${buttons}</div>
        </div>
      </section>`;
    this.applyThemeBackdrop();

    this.mountEl.querySelectorAll('.qk-pattern-mode').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(button.dataset.mode));
    });
  }

  applyThemeBackdrop() {
    const section = this.mountEl.querySelector('.qk-pattern');
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

    this.clearIdleTimer();
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
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
      `<span class="qk-pattern-dot" data-dot="${index}" aria-hidden="true"></span>`).join('');
    this.mountEl.innerHTML = `
      <section class="qk-pattern qk-pattern-play" aria-label="${escapeAttr(this.mode.title)}">
        <header class="qk-pattern-hud">
          <a class="qk-pattern-home qk-pattern-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
          <div class="qk-pattern-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-pattern-stage">
          <div class="qk-pattern-canvas" aria-label="${escapeAttr(this.mode.title)}"></div>
        </main>
        <button class="qk-pattern-sound qk-pattern-img-btn" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>`;
    this.applyThemeBackdrop();

    const home = this.mountEl.querySelector('.qk-pattern-home');
    home.addEventListener('pointerdown', (event) => event.stopPropagation());
    home.addEventListener('click', () => speech.stop());
    const sound = this.mountEl.querySelector('.qk-pattern-sound');
    sound.addEventListener('pointerdown', (event) => event.stopPropagation());
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-pattern-canvas');
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
    }, IDLE_MS);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  async finishGame() {
    this.clearIdleTimer();
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    this.playSfx('tada');
    this.disposeStage();
    this.renderEnd();
    this.speakLine(this.config.voice.cheer, true);
  }

  renderEnd() {
    this.mountEl.innerHTML = `
      <section class="qk-pattern qk-pattern-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <a class="qk-pattern-home qk-pattern-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-pattern-end-center">
          <div class="qk-pattern-end-art" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <button class="qk-pattern-again" type="button">
            <span class="qk-pattern-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>`;
    this.applyThemeBackdrop();
    const again = this.mountEl.querySelector('.qk-pattern-again');
    again.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.unlockAudio();
      this.playSfx('tick');
    });
    again.addEventListener('click', () => this.mode ? this.startMode(this.mode.id) : this.renderSplash());
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-pattern-dot').forEach((dot, index) => {
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
      entry.timer = window.setTimeout(() => { this.pendingDelays.delete(entry); resolve(); }, ms);
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
    id: config.id || 'pattern-continue', title: config.title || 'Pattern Train',
    splashEmoji: config.splashEmoji || '🚂', ...config, copy, voice,
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
function shuffle(list, rng) {
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}
function unique(list) { return Array.from(new Set(list)); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function themeColor(config, group, key, fallback) {
  const value = config.theme && config.theme[group] && config.theme[group][key];
  return value == null ? fallback : value;
}
function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}
function escapeAttr(value) { return escapeHtml(value); }

function installStyle() {
  if (styleInstalled || document.getElementById('qk-pattern-style')) { styleInstalled = true; return; }
  const style = document.createElement('style');
  style.id = 'qk-pattern-style';
  style.textContent = `
    @font-face { font-family:'Fredoka'; src:url('${FONT_URL}') format('woff2'); font-weight:600; font-display:swap; }
    .qk-pattern,.qk-pattern * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    .qk-pattern {
      --sky:#bee3f5; --navy:#17517e; --blue:#2d7dd2; --purple:#7c4fc4; --white:#fff;
      --mint:#81d6a3; --peach:#ffad7a; --shadow:0 6px 0 rgba(23,81,126,.18),0 14px 30px rgba(23,81,126,.18);
      position:relative; height:100dvh; min-height:100%; width:100%; overflow:hidden; color:var(--navy);
      font-family:'Fredoka','Arial Rounded MT Bold','Trebuchet MS',sans-serif; font-weight:600;
      background-color:var(--sky); background-image:linear-gradient(180deg,rgba(255,255,255,.36),transparent 42%),
        radial-gradient(circle at 18% 20%,rgba(255,248,232,.72) 0 9px,transparent 10px),
        radial-gradient(circle at 72% 18%,rgba(129,214,163,.42) 0 12px,transparent 13px),
        radial-gradient(circle at 45% 82%,rgba(255,173,122,.36) 0 10px,transparent 11px);
      background-size:auto,180px 180px,250px 250px,220px 220px; touch-action:manipulation;
      -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; overscroll-behavior:none;
    }
    .qk-pattern button,.qk-pattern a { font:inherit; color:inherit; touch-action:manipulation; }
    .qk-pattern button { border:0; cursor:pointer; }
    .qk-pattern button:focus-visible,.qk-pattern a:focus-visible { outline:5px solid rgba(45,125,210,.65); outline-offset:4px; }
    .qk-pattern-img-btn { display:grid; place-items:center; width:96px; height:96px; border-radius:50%;
      background:transparent center/84px 84px no-repeat; text-decoration:none; box-shadow:none; }
    .qk-pattern-img-btn:active { transform:scale(.93); }
    .qk-pattern-home { background-image:url('${HOME_IMG}'); position:absolute; top:max(12px,env(safe-area-inset-top));
      left:max(12px,env(safe-area-inset-left)); z-index:4; }
    .qk-pattern-sound { background-image:url('${SOUND_IMG}'); position:absolute; left:max(14px,env(safe-area-inset-left));
      bottom:max(12px,env(safe-area-inset-bottom)); z-index:4; }
    .qk-pattern-splash,.qk-pattern-end { display:grid; place-items:center; padding:max(18px,env(safe-area-inset-top))
      max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left)); }
    .qk-pattern-splash-center,.qk-pattern-end-center { width:min(900px,100%); display:grid; justify-items:center;
      gap:clamp(14px,2.5vmin,24px); text-align:center; padding-top:54px; }
    .qk-pattern-splash-art,.qk-pattern-end-art { display:grid; place-items:center; width:clamp(150px,26vmin,230px);
      aspect-ratio:1; border-radius:28px; background:linear-gradient(180deg,#fff,#fff3d0); border:5px solid #fff;
      box-shadow:var(--shadow); font-size:clamp(82px,16vmin,132px); line-height:1; }
    .qk-pattern h1 { margin:0; font-size:clamp(38px,7vmin,78px); line-height:.98; color:var(--navy);
      text-shadow:0 4px 0 rgba(255,255,255,.72); max-width:12ch; }
    .qk-pattern-mode-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:18px;
      width:min(760px,100%); margin-top:6px; }
    .qk-pattern-mode,.qk-pattern-again { min-height:104px; border-radius:26px; border:5px solid #fff; padding:18px 24px;
      color:#fff; background:linear-gradient(180deg,rgba(255,255,255,.34),transparent 50%),var(--purple);
      box-shadow:var(--shadow); font-size:clamp(23px,4vmin,36px); line-height:1.05; }
    .qk-pattern-mode:nth-child(2n) { background-color:var(--blue); }
    .qk-pattern-mode:nth-child(3n) { background-color:#2e9f76; }
    .qk-pattern-mode:active,.qk-pattern-again:active { transform:scale(.96); }
    .qk-pattern-play { display:grid; grid-template-rows:auto 1fr; padding:max(12px,env(safe-area-inset-top))
      max(14px,env(safe-area-inset-right)) max(112px,calc(100px + env(safe-area-inset-bottom)))
      max(14px,env(safe-area-inset-left)); }
    .qk-pattern-hud { position:relative; z-index:3; display:grid; grid-template-columns:96px 1fr 96px;
      align-items:center; min-height:100px; }
    .qk-pattern-hud .qk-pattern-home { position:static; grid-column:1; }
    .qk-pattern-progress { grid-column:2; justify-self:center; display:flex; align-items:center; justify-content:center;
      gap:11px; min-height:32px; padding:6px 16px; border-radius:999px; background:rgba(255,255,255,.38); }
    .qk-pattern-dot { width:18px; height:18px; border-radius:50%; background:rgba(255,255,255,.9); opacity:.8; }
    .qk-pattern-dot.is-filled { background:var(--mint); opacity:1; }
    .qk-pattern-dot.is-current { background:var(--peach); opacity:1; transform:scale(1.16); }
    .qk-pattern-stage { min-height:0; position:relative; width:min(1120px,100%); justify-self:center; }
    .qk-pattern-canvas { position:absolute; inset:0; overflow:hidden; border-radius:28px; touch-action:none; }
    .qk-pattern-canvas canvas { display:block; width:100%; height:100%; touch-action:none; }
    .qk-pattern-again { display:inline-grid; grid-template-columns:72px auto; align-items:center; gap:14px;
      min-width:min(420px,100%); background-color:var(--blue); }
    .qk-pattern-play-icon { display:block; width:72px; height:72px; background:transparent url('${PLAY_IMG}') center/contain no-repeat; }
    @media (max-width:560px) { .qk-pattern-hud { grid-template-columns:96px 1fr; } .qk-pattern-progress { justify-self:end; } }
    @media (prefers-reduced-motion:reduce) { .qk-pattern * { transition:none!important; animation:none!important; } }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
