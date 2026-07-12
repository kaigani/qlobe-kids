// tap-count.js — Stage v2 archetype for "counting with your finger".
// DOM owns the familiar splash/HUD/end chrome; Pixi owns the counting field.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { createStage } from '../stage/stage.js';
import { to, ease, popIn, wiggle } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const BACK_IMG = new URL('../../assets/ui/btn-back.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;

const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const OBJECT_SIZE = 112;
const GOAL_SIZE = 154;
const PROMPT_SIZE = 126;
const WIN_ROUND_TIMEOUT_MS = 15000;
const WIN_ROUND_RETRY_MS = 120;

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('tap-count requires a mount element');
  installStyle();
  return new TapCountGame(config, mountEl);
}

class TapCountGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;

    this.destroyed = false;
    this.screen = 'splash';
    this.mode = null;
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.roundItems = [];
    this.currentRound = null;
    this.objects = [];
    this.goalTarget = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.counted = 0;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.rng = Math.random;
    this.fxRng = Math.random;

    this.stage = null;
    this.scene = null;
    this.promptView = null;
    this.targetMap = new Map();
    this.removeResize = null;
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

    // delegated back-button handling: play/end screens rebuild innerHTML,
    // so the listener lives on the mount and survives every screen swap
    this.mountEl.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('.qk-tap-back')) {
        speech.stop();
        this.renderSplash();
      }
    });
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
      engine: 'tap-count',
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
    this.currentRound = null;
    this.objects = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    speech.stop();

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-tap-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        <span>${escapeHtml(mode.title)}</span>
      </button>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-tap qk-tap-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-tap-home qk-tap-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-tap-splash-center">
          <div class="qk-tap-splash-art" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-tap-mode-list">${buttons}</div>
        </div>
      </section>
    `;
    this.applyThemeBackdrop();

    this.mountEl.querySelectorAll('.qk-tap-mode').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(button.dataset.mode));
    });
  }

  applyThemeBackdrop() {
    const section = this.mountEl.querySelector('.qk-tap');
    const background = this.config.theme && this.config.theme.background;
    if (!section || !background) return;
    const ref = String(background);
    const url = ref.startsWith('shared:') || ref.startsWith('char:') ? artUrlRef(ref) : ref;
    if (!url) return;
    section.style.background = `#bfe3f5 url("${url.replace(/"/g, '%22')}") center / cover no-repeat`;
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
    const maxRounds = Math.min(mode.rounds || mode.rounds_spec.length, mode.rounds_spec.length);
    const source = mode.difficultyRamp
      ? sortRounds(mode.rounds_spec, mode.type)
      : shuffle(mode.rounds_spec.slice(), this.rng);
    this.roundItems = source.slice(0, maxRounds);
    this.roundsTotal = this.roundItems.length;

    this.renderPlayShell();
    if (this.roundsTotal === 0) {
      await this.finishGame();
      return;
    }
    const stageReady = await this.createPlayStage();
    if (!stageReady) return;
    await this.showRound(0);
  }

  renderPlayShell() {
    const dots = Array.from({ length: this.roundsTotal }, (_, index) => `
      <span class="qk-tap-dot" data-dot="${index}" aria-hidden="true"></span>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-tap qk-tap-play" aria-label="${escapeAttr(this.mode.title)}">
        <header class="qk-tap-hud">
          <button class="qk-tap-back qk-tap-img-btn" type="button" aria-label="Back to the game menu"></button>
          <div class="qk-tap-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-tap-stage">
          <div class="qk-tap-canvas" aria-label="${escapeAttr(this.mode.title)}"></div>
        </main>
        <button class="qk-tap-sound qk-tap-img-btn" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;
    this.applyThemeBackdrop();

    const home = this.mountEl.querySelector('.qk-tap-back');
    home.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.playSfx('tick');
    });
    home.addEventListener('click', () => { speech.stop(); this.renderSplash(); });

    const sound = this.mountEl.querySelector('.qk-tap-sound');
    sound.addEventListener('pointerdown', (event) => event.stopPropagation());
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-tap-canvas');
    if (!host) return false;
    const generation = ++this.stageGeneration;
    const stage = await createStage(host);
    if (this.destroyed || this.screen !== 'play' || generation !== this.stageGeneration) {
      stage.destroy();
      return false;
    }
    this.stage = stage;
    const scene = new stage.PIXI.Container();
    this.scene = scene;
    stage.setScene(scene);
    this.removeResize = stage.onResize(() => this.layoutField());
    return true;
  }

  disposeStage() {
    this.stageGeneration += 1;
    this.roundGeneration += 1;
    this.cancelTweens();
    this.clearDelays();
    if (this.removeResize) this.removeResize();
    this.removeResize = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
    this.promptView = null;
    this.goalTarget = null;
    this.objects = [];
    this.targetMap.clear();
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play' || !this.stage) return;
    this.clearIdleTimer();
    this.cancelTweens();
    this.roundIndex = index;
    this.currentRound = this.roundItems[index];
    this.counted = 0;
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.targetMap.clear();
    const generation = ++this.roundGeneration;

    this.updateDots();
    const scene = new this.stage.PIXI.Container();
    this.scene = scene;
    this.stage.setScene(scene);
    await this.buildRoundViews(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutField();
    await this.popRoundIn(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.speakLine(this.currentRound.say || this.config.voice.intro);
    this.scheduleIdlePrompt();
  }

  makeObjects(round) {
    const quota = quotaFor(this.mode.type, round);
    const total = this.mode.type === 'takeaway'
      ? clamp(round.start, quota, 10)
      : clamp(Math.max(6, quota + 2), quota, 10);
    return Array.from({ length: total }, (_, index) => ({
      id: `obj:${index + 1}`,
      index,
      art: round.itemArt,
      alt: round.itemAlt || '',
      used: false,
      view: null,
      motion: null,
      size: OBJECT_SIZE,
      scatterX: (this.fxRng() - 0.5) * 34,
      scatterY: (this.fxRng() - 0.5) * 26,
      animating: false,
      nudgeAnimating: false,
    }));
  }

  async buildRoundViews(generation) {
    this.objects = this.makeObjects(this.currentRound);
    const tasks = [this.buildPromptView(generation), this.buildGoalView(generation)];
    this.objects.forEach((obj) => tasks.push(this.buildObjectView(obj, generation)));
    await Promise.all(tasks);
  }

  async buildPromptView(generation) {
    const { PIXI } = this.stage;
    const wrap = new PIXI.Container();
    const numberArt = await artObj(PIXI, `text:${quotaFor(this.mode.type, this.currentRound)}`, 86, '');
    const itemArt = await artObj(PIXI, this.currentRound.itemArt, 72, this.currentRound.itemAlt || '');
    if (!this.roundIsCurrent(generation)) {
      numberArt.destroy({ children: true });
      itemArt.destroy({ children: true });
      return;
    }
    const numberCard = cardBacking(PIXI, PROMPT_SIZE, PROMPT_SIZE, {
      fill: themeColor(this.config, 'panel', 'fill', 0xfff8e8), stroke: 0xffffff, strokeWidth: 5, radius: 24,
    });
    const itemCard = cardBacking(PIXI, 96, 96, {
      fill: 0xeaf8ff, stroke: 0xffffff, strokeWidth: 4, radius: 21,
    });
    numberCard.position.x = -60;
    numberArt.position.x = -60;
    itemCard.position.x = 66;
    itemArt.position.x = 66;
    wrap.addChild(numberCard, numberArt, itemCard, itemArt);
    wrap.scale.set(0.01);
    this.promptView = wrap;
    this.scene.addChild(wrap);
  }

  async buildGoalView(generation) {
    const { PIXI } = this.stage;
    const takeaway = this.mode.type === 'takeaway';
    const ref = takeaway
      ? this.currentRound.creatureArt
      : this.mode.basketArt || this.config.basketArt || 'emoji:🧺';
    const alt = takeaway ? this.config.copy.creature : this.config.copy.basket;
    const art = await artObj(PIXI, ref, 112, alt);
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }

    const view = this.makeCardView(GOAL_SIZE, takeaway ? 0xe5f7ff : 0xfff0c5, art, alt, true);
    const id = takeaway ? 'creature' : 'basket';
    view.on('pointerdown', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.tapTarget(id);
    });
    const target = {
      id, role: 'neutral', type: 'goal', view, motion: view.motion, size: GOAL_SIZE,
      action: () => this.handleGoalTap(),
    };
    this.goalTarget = target;
    this.targetMap.set(id, target);
    this.scene.addChild(view);
  }

  async buildObjectView(obj, generation) {
    const { PIXI } = this.stage;
    const art = await artObj(PIXI, obj.art, 78, obj.alt);
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
    const view = this.makeCardView(OBJECT_SIZE, 0xfffbef, art, obj.alt || 'counting item', true);
    view.on('pointerdown', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.tapTarget(obj.id);
    });
    obj.view = view;
    obj.motion = view.motion;
    obj.action = () => this.handleObjectTarget(obj);
    this.targetMap.set(obj.id, obj);
    this.scene.addChild(view);
  }

  makeCardView(size, fill, art, alt, interactive) {
    const { PIXI } = this.stage;
    const view = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-size / 2, -size / 2 + 7, size, size, 23).fill({ color: 0x17517e, alpha: 0.16 });
    const backing = cardBacking(PIXI, size, size, {
      fill, stroke: 0xffffff, strokeWidth: 5, radius: 23,
    });
    motion.addChild(shadow, backing, art);
    view.addChild(motion);
    view.motion = motion;
    view.hitArea = new PIXI.Rectangle(-size / 2, -size / 2, size, size);
    view.eventMode = interactive ? 'static' : 'none';
    view.cursor = interactive ? 'pointer' : 'default';
    view.accessible = interactive;
    view.accessibleType = interactive ? 'button' : null;
    view.accessibleTitle = alt;
    motion.scale.set(0.01);
    return view;
  }

  async popRoundIn(generation) {
    const jobs = [];
    if (this.promptView) jobs.push(this.runTween(popIn(this.promptView, 300)));
    if (this.goalTarget) jobs.push((async () => {
      await this.delay(this.reducedMotion() ? 0 : 60);
      if (this.roundIsCurrent(generation)) await this.runTween(popIn(this.goalTarget.motion, 330));
    })());
    this.objects.forEach((obj, index) => jobs.push((async () => {
      await this.delay(this.reducedMotion() ? 0 : 90 + index * 42);
      if (!this.roundIsCurrent(generation) || !obj.view) return;
      obj.view.x += obj.scatterX;
      obj.view.y += obj.scatterY;
      await Promise.all([
        this.runTween(popIn(obj.motion, 320)),
        this.runTween(to(obj.view, { x: obj.view.x - obj.scatterX, y: obj.view.y - obj.scatterY }, { ms: 340, easing: ease.outCubic })),
      ]);
    })()));
    await Promise.all(jobs);
  }

  layoutField() {
    if (!this.stage || !this.scene || !this.promptView || !this.goalTarget) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;
    const portrait = h >= w;
    const pad = Math.max(10, Math.min(22, Math.min(w, h) * 0.025));

    if (portrait) {
      this.promptView.position.set(w / 2, Math.max(70, h * 0.12));
      this.promptView.scale.set(Math.min(1, (w - pad * 2) / 250));
      this.goalTarget.view.position.set(w / 2, h - Math.max(82, h * 0.13));
      this.goalTarget.view.scale.set(Math.max(96 / GOAL_SIZE, Math.min(1, h / 760)));
    } else {
      this.promptView.position.set(Math.max(132, w * 0.13), h / 2);
      this.promptView.scale.set(Math.min(1, (w * 0.25 - pad * 2) / 250));
      this.goalTarget.view.position.set(w - Math.max(90, w * 0.1), h / 2);
      this.goalTarget.view.scale.set(Math.max(96 / GOAL_SIZE, Math.min(1, h / 620)));
    }

    const area = portrait
      ? { x: pad, y: Math.max(135, h * 0.21), w: w - pad * 2, h: Math.max(150, h * 0.58) }
      : { x: Math.max(235, w * 0.25), y: pad, w: Math.max(250, w * 0.63), h: h - pad * 2 };
    if (!portrait) area.w = Math.max(220, this.goalTarget.view.x - GOAL_SIZE / 2 - pad - area.x);
    else area.h = Math.max(150, this.goalTarget.view.y - GOAL_SIZE / 2 - pad - area.y);

    const positions = this.objectPositions(area);
    this.objects.forEach((obj, index) => {
      if (!obj.view || obj.animating) return;
      const pos = positions[index];
      obj.view.position.set(pos.x, pos.y);
      obj.view.scale.set(pos.scale);
    });
  }

  objectPositions(area) {
    const total = this.objects.length;
    const columns = Math.min(total, Math.max(2, Math.min(5, Math.floor(area.w / 104))));
    const rows = Math.ceil(total / columns);
    const gap = 8;
    const fitW = (area.w - gap * (columns - 1)) / columns;
    const fitH = (area.h - gap * (rows - 1)) / rows;
    const scale = Math.max(96 / OBJECT_SIZE, Math.min(1, fitW / OBJECT_SIZE, fitH / OBJECT_SIZE));
    const cell = OBJECT_SIZE * scale;
    const totalH = rows * cell + (rows - 1) * gap;
    const positions = [];
    for (let index = 0; index < total; index++) {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const rowCount = Math.min(columns, total - row * columns);
      const totalW = rowCount * cell + (rowCount - 1) * gap;
      positions.push({
        x: area.x + (area.w - totalW) / 2 + cell / 2 + col * (cell + gap),
        y: area.y + (area.h - totalH) / 2 + cell / 2 + row * (cell + gap),
        scale,
      });
    }

    // Used pieces gather visibly beside the goal. Their hit boxes remain at
    // least 96px even when the artwork inside settles smaller.
    const used = this.objects.filter((obj) => obj.used);
    const goal = this.goalTarget.view;
    const pileScale = 96 / OBJECT_SIZE;
    used.forEach((obj, usedIndex) => {
      const slot = usedIndex % 5;
      const tier = Math.floor(usedIndex / 5);
      const x = this.stage.size().h >= this.stage.size().w
        ? goal.x + (slot - Math.min(used.length - 1, 4) / 2) * 42
        : goal.x - GOAL_SIZE * goal.scale.x / 2 - 45 - tier * 40;
      const y = this.stage.size().h >= this.stage.size().w
        ? goal.y - GOAL_SIZE * goal.scale.y / 2 - 42 - tier * 42
        : goal.y + (slot - Math.min(used.length - 1, 4) / 2) * 42;
      positions[obj.index] = { x, y, scale: pileScale };
    });
    return positions;
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed || !target.action) return { accepted: false };
    const accepted = await target.action();
    return { accepted: accepted !== false };
  }

  async handleGoalTap() {
    if (this.screen !== 'play') return false;
    this.playSfx('tick');
    await this.replayPrompt();
    return true;
  }

  async handleObjectTarget(obj) {
    if (!this.awaitingInput || this.inputLocked || obj.used) {
      if (this.awaitingInput && !this.inputLocked && obj.used) this.handleOverTap(obj);
      return false;
    }
    await this.handleObjectTap(obj);
    return true;
  }

  async handleOverTap(obj) {
    if (obj.nudgeAnimating || !obj.view) return;
    obj.nudgeAnimating = true;
    this.playSfx('boing');
    await Promise.all([
      this.runTween(wiggle(obj.view, 0.045, 75)),
      this.speakLine(this.config.voice.nudge, true),
    ]);
    if (obj.view && !obj.view.destroyed) obj.view.rotation = 0;
    obj.nudgeAnimating = false;
  }

  async handleObjectTap(obj) {
    this.clearIdleTimer();
    this.inputLocked = true;
    obj.used = true;
    obj.animating = true;
    this.counted += 1;
    const generation = this.roundGeneration;

    this.playSfx('pop');
    this.playSfx(this.mode.type === 'takeaway' ? 'silly' : 'whoosh');
    const countFx = this.showCountNumeral(obj, this.counted, generation);
    const sparkleFx = sparkle(this.stage.PIXI, this.scene, obj.view.x, obj.view.y - 18);
    await Promise.all([this.hopAndCollect(obj), countFx, sparkleFx, this.speakCount(this.counted)]);
    if (!this.roundIsCurrent(generation)) return;
    obj.animating = false;
    this.layoutField();

    const quota = quotaFor(this.mode.type, this.currentRound);
    if (this.counted >= quota) {
      this.awaitingInput = false;
      await this.completeSet(generation);
      if (!this.roundIsCurrent(generation)) return;
      if (this.mode.type === 'takeaway') await this.completeTakeawayRound(generation);
      else await this.completeCollectRound(generation);
      return;
    }

    this.inputLocked = false;
    this.scheduleIdlePrompt();
  }

  async hopAndCollect(obj) {
    const positions = this.objectPositions(this.currentObjectArea());
    const destination = positions[obj.index];
    await Promise.all([
      (async () => {
        await this.animateMotion(obj, { y: -24, scale: { x: 1.12, y: 1.12 } }, { ms: 145, easing: ease.outCubic });
        await this.animateMotion(obj, { y: 0, scale: { x: 0.82, y: 0.82 } }, { ms: 260, easing: ease.outElastic });
      })(),
      this.runTween(to(obj.view, { x: destination.x, y: destination.y, scale: { x: destination.scale, y: destination.scale } }, { ms: 390, easing: ease.outCubic })),
    ]);
  }

  currentObjectArea() {
    const { w, h } = this.stage.size();
    const pad = Math.max(10, Math.min(22, Math.min(w, h) * 0.025));
    if (h >= w) {
      const y = Math.max(135, h * 0.21);
      return { x: pad, y, w: w - pad * 2, h: Math.max(150, this.goalTarget.view.y - GOAL_SIZE / 2 - pad - y) };
    }
    const x = Math.max(235, w * 0.25);
    return { x, y: pad, w: Math.max(220, this.goalTarget.view.x - GOAL_SIZE / 2 - pad - x), h: h - pad * 2 };
  }

  async showCountNumeral(obj, number, generation) {
    if (!this.roundIsCurrent(generation)) return;
    const { PIXI } = this.stage;
    const label = new PIXI.Text({
      text: String(number),
      style: {
        fontFamily: 'Fredoka, Arial Rounded MT Bold, sans-serif', fontWeight: '600',
        fontSize: 66, fill: 0x17517e, stroke: { color: 0xffffff, width: 8, join: 'round' },
      },
    });
    label.anchor.set(0.5);
    label.position.set(obj.view.x, obj.view.y - 74);
    this.scene.addChild(label);
    await this.runTween(popIn(label, 210));
    await this.runTween(to(label, { y: label.y - 28, alpha: 0 }, { ms: 380, easing: ease.outCubic }));
    if (!label.destroyed) label.destroy();
  }

  async completeSet(generation) {
    this.inputLocked = true;
    this.playSfx('sparkle');
    const wave = this.objects.map(async (obj, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 34);
      if (!this.roundIsCurrent(generation) || !obj.motion) return;
      await this.animateMotion(obj, { y: -13, rotation: index % 2 ? -0.035 : 0.035 }, { ms: 115, easing: ease.outCubic });
      await this.animateMotion(obj, { y: 0, rotation: 0 }, { ms: 190, easing: ease.outElastic });
    });
    const { w, h } = this.stage.size();
    await Promise.all([
      ...wave,
      burst(this.stage.PIXI, this.scene, w / 2, h / 2, { count: 38, power: 7, life: 760 }),
    ]);
  }

  async completeCollectRound(generation) {
    await this.speakLine(this.collectCelebration(), true);
    await this.delay(this.reducedMotion() ? 80 : 360);
    if (this.roundIsCurrent(generation)) await this.advanceRound();
  }

  async completeTakeawayRound(generation) {
    await this.speakLine(this.config.voice.leftQuestion, true);
    await this.countRemainder(generation);
    await this.delay(this.reducedMotion() ? 80 : 320);
    if (this.roundIsCurrent(generation)) await this.advanceRound();
  }

  async countRemainder(generation) {
    const remaining = this.objects.filter((obj) => !obj.used);
    if (remaining.length === 0) {
      await this.speakLine(this.config.voice.noneLeft, true);
      return;
    }
    for (let index = 0; index < remaining.length; index++) {
      if (!this.roundIsCurrent(generation)) return;
      const obj = remaining[index];
      await this.animateMotion(obj, { y: -14, scale: { x: 1.08, y: 1.08 } }, { ms: 120, easing: ease.outCubic });
      await Promise.all([
        this.animateMotion(obj, { y: 0, scale: { x: 1, y: 1 } }, { ms: 180, easing: ease.outElastic }),
        this.speakCount(index + 1, index === 0),
      ]);
      await this.delay(this.reducedMotion() ? 20 : 70);
    }
    const words = remaining.map((_, index) => cleanCountWord(this.config.voice.counts[index])).join(', ');
    await this.speakLine(`${words} left!`, true);
  }

  collectCelebration() {
    const word = cleanCountWord(this.config.voice.counts[this.counted - 1]) || String(this.counted);
    const item = pluralize(this.currentRound.itemAlt || this.config.copy.items, this.counted);
    return `${word} ${item}! You did it!`;
  }

  async advanceRound() {
    if (this.destroyed || this.screen !== 'play') return;
    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) await this.finishGame();
    else await this.showRound(next);
  }

  replayPromptFromHud() {
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_DEBOUNCE_MS) return;
    this.lastReplay = now;
    this.playSfx('tick');
    this.replayPrompt();
  }

  async replayPrompt() {
    if (!this.currentRound || this.screen !== 'play') return;
    this.clearIdleTimer();
    await this.speakLine(this.currentRound.say || this.config.voice.intro, true);
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.speakLine(this.currentRound.say || this.config.voice.intro, true);
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
      <section class="qk-tap qk-tap-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <button class="qk-tap-back qk-tap-img-btn" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-tap-end-center">
          <div class="qk-tap-end-art" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <button class="qk-tap-again" type="button">
            <span class="qk-tap-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>
    `;
    this.applyThemeBackdrop();
    const again = this.mountEl.querySelector('.qk-tap-again');
    again.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.unlockAudio();
      this.playSfx('tick');
    });
    again.addEventListener('click', () => {
      if (this.mode) this.startMode(this.mode.id);
      else this.renderSplash();
    });
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-tap-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  getState() {
    return {
      screen: this.screen,
      mode: this.mode ? this.mode.id : null,
      round: this.screen === 'play' ? this.roundIndex : this.roundsTotal,
      roundsTotal: this.roundsTotal,
      awaitingInput: this.awaitingInput,
      count: this.counted,
      quota: this.currentRound && this.mode ? quotaFor(this.mode.type, this.currentRound) : 0,
    };
  }

  getTargets() {
    if (this.screen !== 'play' || !this.stage) return [];
    const canvasRect = this.stage.app.canvas.getBoundingClientRect();
    const stageSize = this.stage.size();
    const scaleX = stageSize.w ? canvasRect.width / stageSize.w : 1;
    const scaleY = stageSize.h ? canvasRect.height / stageSize.h : 1;
    const { PIXI } = this.stage;
    const targets = [...this.objects, this.goalTarget].filter((target) => target && target.view);
    return targets.map((target) => {
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
        role: target.type === 'goal' || target.used || !this.awaitingInput ? 'neutral' : 'correct',
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
      const target = this.objects.find((obj) => !obj.used);
      if (!target) return;
      const result = await this.tapTarget(target.id);
      if (!result.accepted) await this.delay(WIN_ROUND_RETRY_MS);
    }
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    const value = Number(n) || 0;
    this.rng = mulberry32(value);
    this.fxRng = mulberry32(value + 973);
  }

  async speakCount(index, cancel = true) {
    const line = this.config.voice.counts[index - 1] || `${index}!`;
    await this.speakLine(line, cancel);
  }

  async speakLine(line, cancel = true) {
    if (this.muted || !line) return;
    await speech.speak(line, { rate: 0.8, pitch: 1.05, cancel });
  }

  playSfx(name) {
    if (this.muted || !sfx[name]) return;
    sfx[name]();
  }

  reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

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
      entry.timer = window.setTimeout(() => {
        this.pendingDelays.delete(entry);
        resolve();
      }, ms);
      this.pendingDelays.add(entry);
    });
  }

  clearDelays() {
    this.pendingDelays.forEach((entry) => {
      window.clearTimeout(entry.timer);
      entry.resolve();
    });
    this.pendingDelays.clear();
  }
}

function normalizeConfig(config) {
  const copy = {
    home: 'Home', replay: 'Hear it again', playAgain: 'Play Again',
    basket: 'basket', creature: 'hungry friend', items: 'things',
    ...(config.copy || {}),
  };
  const voice = {
    intro: 'Tap and count.',
    nudge: 'That one is counted. Tap another one.',
    cheer: 'Hooray, you counted them all!',
    leftQuestion: 'How many are left?',
    noneLeft: 'None left!',
    counts: ['One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!', 'Seven!', 'Eight!', 'Nine!', 'Ten!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.counts)) voice.counts = [];
  return {
    id: config.id || 'tap-count',
    title: config.title || 'Tap Count',
    splashEmoji: config.splashEmoji || '🔢',
    basketArt: config.basketArt || 'emoji:🧺',
    ...config,
    copy,
    voice,
    modes: (config.modes || []).map((mode) => {
      const type = mode.type === 'takeaway' ? 'takeaway' : 'collect';
      const rounds = (mode.rounds_spec || []).map((round) => normalizeRound(round, type)).filter(Boolean);
      return { ...mode, type, rounds: Math.min(mode.rounds || rounds.length, rounds.length), rounds_spec: rounds };
    }),
  };
}

function normalizeRound(round, type) {
  if (!round || !round.itemArt) return null;
  if (type === 'takeaway') {
    const start = clamp(round.start, 1, 10);
    const eat = clamp(round.eat, 1, start);
    if (!round.creatureArt) return null;
    return { ...round, start, eat, say: round.say || `Eat ${eat}.` };
  }
  const count = clamp(round.count, 1, 10);
  return { ...round, count, say: round.say || `Put ${count} in the basket.` };
}

function themeColor(config, group, key, fallback) {
  const value = config.theme && config.theme[group] && config.theme[group][key];
  return value == null ? fallback : value;
}

function quotaFor(type, round) {
  return type === 'takeaway' ? round.eat : round.count;
}

function sortRounds(rounds, type) {
  return rounds.slice().sort((a, b) => quotaFor(type, a) - quotaFor(type, b));
}

function shuffle(list, rng) {
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
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

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function cleanCountWord(word) {
  return String(word || '').replace(/[!?.]/g, '').trim();
}

function pluralize(word, count) {
  const clean = String(word || 'things').trim();
  if (count === 1 || clean.endsWith('s')) return clean;
  return `${clean}s`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function installStyle() {
  if (styleInstalled || document.getElementById('qk-tap-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-tap-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-tap, .qk-tap * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-tap {
      --sky: #bee3f5; --navy: #17517e; --blue: #2d7dd2; --green: #2e9f76;
      --purple: #7c4fc4; --gold: #f4c53d; --white: #ffffff;
      --shadow: 0 6px 0 rgba(23,81,126,.18), 0 14px 30px rgba(23,81,126,.18);
      position: relative; height: 100dvh; min-height: 100%; width: 100%; overflow: hidden;
      color: var(--navy); font-family: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif;
      font-weight: 600; background-color: var(--sky);
      background-image:
        radial-gradient(circle at 14% 18%, rgba(255,255,255,.45) 0 8px, transparent 9px),
        radial-gradient(circle at 78% 24%, rgba(255,255,255,.36) 0 11px, transparent 12px),
        linear-gradient(180deg, rgba(255,255,255,.32), rgba(255,255,255,0) 44%);
      background-size: 180px 180px, 250px 250px, 100% 100%;
      touch-action: manipulation; -webkit-user-select: none; user-select: none;
      -webkit-touch-callout: none; overscroll-behavior: none;
    }
    .qk-tap button, .qk-tap a { font: inherit; color: inherit; touch-action: manipulation; }
    .qk-tap button { border: 0; cursor: pointer; }
    .qk-tap button:focus-visible, .qk-tap a:focus-visible {
      outline: 5px solid rgba(45,125,210,.65); outline-offset: 4px;
    }
    .qk-tap-img-btn {
      display: grid; place-items: center; width: 96px; height: 96px; border-radius: 50%;
      background: transparent center / 84px 84px no-repeat; text-decoration: none; box-shadow: none;
    }
    .qk-tap-img-btn:active { transform: scale(.93); }
    .qk-tap-home { background-image: url('${HOME_IMG}'); }
    .qk-tap-back { background-image: url('${BACK_IMG}'); }
    .qk-tap-sound { background-image: url('${SOUND_IMG}'); }
    .qk-tap-splash, .qk-tap-end {
      display: grid; place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }
    .qk-tap-home,     .qk-tap-back {
      position: absolute; top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left)); z-index: 4;
    }
    .qk-tap-splash-center, .qk-tap-end-center {
      width: min(900px, 100%); display: grid; justify-items: center;
      gap: clamp(14px, 2.6vmin, 24px); text-align: center; padding-top: 54px;
    }
    .qk-tap-splash-art, .qk-tap-end-art {
      display: grid; place-items: center; width: clamp(150px, 26vmin, 230px); aspect-ratio: 1;
      border-radius: 28px; background: linear-gradient(180deg, #fff, #fff3d0);
      border: 5px solid var(--white); box-shadow: var(--shadow);
      font-size: clamp(82px, 16vmin, 132px); line-height: 1;
    }
    .qk-tap h1 {
      margin: 0; font-size: clamp(38px, 7vmin, 78px); line-height: 1; color: var(--navy);
      text-shadow: 0 4px 0 rgba(255,255,255,.72); max-width: 13ch;
    }
    .qk-tap-mode-list {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px; width: min(760px, 100%); margin-top: 6px;
    }
    .qk-tap-mode, .qk-tap-again {
      min-height: 104px; border-radius: 26px; border: 5px solid var(--white); padding: 18px 24px;
      color: var(--white); background: linear-gradient(180deg, rgba(255,255,255,.34), transparent 50%), var(--purple);
      box-shadow: var(--shadow); font-size: clamp(23px, 4vmin, 36px); line-height: 1.05;
    }
    .qk-tap-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-tap-mode:nth-child(3n) { background-color: var(--green); }
    .qk-tap-mode:active, .qk-tap-again:active { transform: scale(.96); }
    .qk-tap-play {
      display: grid; grid-template-rows: auto 1fr;
      padding: max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(108px, calc(98px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }
    .qk-tap-hud {
      position: relative; z-index: 3; display: grid; grid-template-columns: 96px 1fr 96px;
      align-items: center; min-height: 96px;
    }
    .qk-tap-hud .qk-tap-home,     .qk-tap-hud .qk-tap-back { position: static; grid-column: 1; }
    .qk-tap-progress {
      grid-column: 2; justify-self: center; display: flex; align-items: center; justify-content: center;
      gap: 11px; min-height: 32px; padding: 6px 16px; border-radius: 999px;
      background: rgba(255,255,255,.38);
    }
    .qk-tap-dot {
      width: 18px; height: 18px; border-radius: 50%; background: rgba(255,255,255,.9);
      box-shadow: inset 0 -2px 0 rgba(23,81,126,.12);
    }
    .qk-tap-dot.is-filled { background: var(--green); }
    .qk-tap-dot.is-current { background: var(--gold); transform: scale(1.18); }
    .qk-tap-stage { min-height: 0; position: relative; width: min(1160px, 100%); justify-self: center; }
    .qk-tap-canvas { position: absolute; inset: 0; overflow: hidden; border-radius: 28px; touch-action: none; }
    .qk-tap-canvas canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .qk-tap-sound {
      position: absolute; left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom)); z-index: 5;
    }
    .qk-tap-again {
      display: inline-grid; grid-template-columns: 72px auto; align-items: center; gap: 14px;
      min-width: min(420px, 100%); background-color: var(--blue);
    }
    .qk-tap-play-icon {
      display: block; width: 72px; height: 72px;
      background: transparent url('${PLAY_IMG}') center / contain no-repeat;
    }
    @media (max-width: 560px) {
      .qk-tap-hud { grid-template-columns: 96px 1fr; }
      .qk-tap-progress { justify-self: end; }
    }
    @media (prefers-reduced-motion: reduce) {
      .qk-tap * { animation: none !important; transition: none !important; }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
