// build-assemble.js — Stage v2 archetype for building pictures from parts.
//
// DOM owns the splash, HUD, and end screen. Pixi owns every gameplay object:
// the 1000×1000 guide, placed assembly, draggable parts, and parts tray.

// The drag stream deliberately lives on window. A Pixi object can move between
// containers (or a round can change) without losing pointerup/pointercancel.

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
const WAIT_FOR_INPUT_MS = 80;
const MIN_TOUCH = 96;
const SNAP_RADIUS_MULTIPLIER = 0.65;
const BUILD_SPACE = 1000;
const TRAY_CARD = 124;
const ART_SIZE = 92;
const DRAG_SLOP = 8;

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('build-assemble requires a mount element');
  installStyle();
  return new BuildAssembleGame(config, mountEl);
}

class BuildAssembleGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;
    this.destroyed = false;

    this.screen = 'splash';
    this.mode = null;
    this.roundBuilds = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.parts = [];
    this.slots = [];
    this.selectedId = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.rng = Math.random;
    this.fxRng = Math.random;
    this.motionReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.stage = null;
    this.scene = null;
    this.boardLayer = null;
    this.guideLayer = null;
    this.assemblyLayer = null;
    this.trayLayer = null;
    this.dragLayer = null;
    this.boardPanel = null;
    this.boardScale = 1;
    this.boardLeft = 0;
    this.boardTop = 0;
    this.trayCardSize = MIN_TOUCH;
    this.removeResize = null;
    this.removeDragTick = null;
    this.stageGeneration = 0;
    this.roundGeneration = 0;
    this.pendingDelays = new Set();
    this.activeTweens = new Set();
    this.targetMap = new Map();
    this.activeDrag = null;

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (e) => e.preventDefault();
    this.onGestureStart = (e) => e.preventDefault();
    this.onWindowMove = (e) => this.handleWindowMove(e);
    this.onWindowUp = (e) => this.handleWindowUp(e);
    this.onWindowCancel = (e) => this.handleWindowCancel(e);
    this.onWindowBlur = () => this.cancelActiveDrag();

    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);
    window.addEventListener('blur', this.onWindowBlur);

    // delegated back-button handling: play/end screens rebuild innerHTML,
    // so the listener lives on the mount and survives every screen swap
    this.mountEl.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('.qk-build-back')) {
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
    this.removeDragListeners();
    this.activeDrag = null;
    this.disposeStage();
    speech.stop();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gesturestart', this.onGestureStart);
    window.removeEventListener('blur', this.onWindowBlur);
    this.mountEl.replaceChildren();
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
      engine: 'build-assemble',
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
    this.removeDragListeners();
    this.activeDrag = null;
    this.disposeStage();
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.selectedId = null;
    this.targetMap.clear();
    speech.stop();

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-build-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        ${escapeHtml(mode.title || mode.id)}
      </button>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-build qk-build-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-build-img-btn qk-build-home" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-build-splash-center">
          <div class="qk-build-splash-art" aria-hidden="true">${escapeHtml(splashGlyph(this.config.splashArt))}</div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-build-mode-list">${buttons}</div>
        </div>
      </section>
    `;

    this.applyThemeBackdrop();

    this.mountEl.querySelectorAll('.qk-build-mode').forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(button.dataset.mode));
    });
  }

  /** Art-world backdrop (docs/art-direction.md): theme.background paints the
   *  whole section via CSS cover — the Pixi canvas is transparent above it. */
  applyThemeBackdrop() {
    const theme = this.config.theme;
    const section = this.mountEl.querySelector('.qk-build');
    if (!theme || !theme.background || !section) return;
    const ref = String(theme.background);
    const url = ref.startsWith('shared:') || ref.startsWith('char:') ? artUrlRef(ref) : ref;
    if (!url) return;
    section.style.background = `#bfe3f5 url("${url}") center / cover no-repeat`;
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;
    const mode = this.config.modes.find((item) => item.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearIdleTimer();
    this.removeDragListeners();
    this.activeDrag = null;
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
    this.roundIndex = 0;
    const maxRounds = Math.min(mode.rounds || mode.builds.length, mode.builds.length);
    this.roundBuilds = shuffle(mode.builds.slice(), this.rng).slice(0, maxRounds);
    this.roundsTotal = this.roundBuilds.length;

    this.renderPlayShell();
    if (!this.roundsTotal) {
      await this.finishGame();
      return;
    }
    const stageReady = await this.createPlayStage();
    if (!stageReady) return;
    await this.showRound(0);
  }

  renderPlayShell() {
    const dots = Array.from({ length: this.roundsTotal }, () => (
      '<span class="qk-build-dot" aria-hidden="true"></span>'
    )).join('');
    this.mountEl.innerHTML = `
      <section class="qk-build qk-build-play" aria-label="${escapeAttr(this.mode.title || this.config.title)}">
        <header class="qk-build-hud">
          <button class="qk-build-back qk-build-img-btn" type="button" aria-label="Back to the game menu"></button>
          <div class="qk-build-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-build-stage">
          <div class="qk-build-canvas" aria-label="${escapeAttr(this.mode.title || this.config.title)}"></div>
        </main>
        <button class="qk-build-img-btn qk-build-sound" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;
    this.applyThemeBackdrop();
    const home = this.mountEl.querySelector('.qk-build-back');
    home.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.playSfx('tick'); });
    home.addEventListener('click', () => { speech.stop(); this.renderSplash(); });
    const sound = this.mountEl.querySelector('.qk-build-sound');
    sound.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.unlockAudio(); });
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-build-canvas');
    if (!host) return false;
    const generation = ++this.stageGeneration;
    const stage = await createStage(host);
    if (this.destroyed || this.screen !== 'play' || generation !== this.stageGeneration) {
      stage.destroy();
      return false;
    }
    this.stage = stage;
    this.removeResize = stage.onResize(() => this.layoutField());
    this.dragTicker = () => this.tickDrag();
    stage.app.ticker.add(this.dragTicker);
    this.removeDragTick = () => stage.app.ticker.remove(this.dragTicker);
    return true;
  }

  disposeStage() {
    this.stageGeneration += 1;
    this.roundGeneration += 1;
    this.removeDragListeners();
    this.activeDrag = null;
    this.cancelTweens();
    this.clearDelays();
    if (this.removeResize) this.removeResize();
    if (this.removeDragTick) this.removeDragTick();
    this.removeResize = null;
    this.removeDragTick = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
    this.boardLayer = null;
    this.guideLayer = null;
    this.assemblyLayer = null;
    this.trayLayer = null;
    this.dragLayer = null;
    this.boardPanel = null;
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play' || !this.stage) return;
    this.clearIdleTimer();
    this.removeDragListeners();
    this.activeDrag = null;
    this.cancelTweens();
    this.roundIndex = index;
    this.selectedId = null;
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.targetMap.clear();
    const generation = ++this.roundGeneration;

    const build = this.roundBuilds[index];
    this.slots = build.parts.map((part, slotIndex) => ({
      ...part,
      slotIndex,
      targetId: `slot:${slotIndex}`,
      occupantId: null,
      matchKey: part.matchKey || matchKey(part),
      view: null,
      ghost: null,
      hitSize: MIN_TOUCH,
      hitLocalSize: ART_SIZE,
    }));
    this.parts = shuffle(build.parts.map((part, partIndex) => ({
      ...part,
      partIndex,
      id: `part:${partIndex}`,
      location: 'tray',
      matchKey: part.matchKey || matchKey(part),
      view: null,
      motion: null,
      backing: null,
      shadow: null,
      homeX: 0,
      homeY: 0,
      homeScale: 1,
      motionTween: null,
    })), this.rng);

    this.updateDots();
    this.createRoundScene();
    await this.buildRoundViews(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutField();
    await this.popRoundIn(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.speakLine(this.mode.prompt || this.config.voice.intro);
    this.scheduleIdlePrompt();
    await this.delay(WAIT_FOR_INPUT_MS);
  }

  createRoundScene() {
    const { PIXI } = this.stage;
    const scene = new PIXI.Container();
    const boardLayer = new PIXI.Container();
    const guideLayer = new PIXI.Container();
    const assemblyLayer = new PIXI.Container();
    const trayLayer = new PIXI.Container();
    const dragLayer = new PIXI.Container();
    const panel = new PIXI.Graphics();
    panel.roundRect(0, 0, BUILD_SPACE, BUILD_SPACE, 42)
      .fill({ color: 0xfffbef, alpha: 0.9 })
      .stroke({ width: 9, color: 0xffffff, alpha: 0.98 });
    const glow = new PIXI.Graphics();
    glow.circle(BUILD_SPACE / 2, BUILD_SPACE / 2, 360).fill({ color: 0x2d7dd2, alpha: 0.055 });
    boardLayer.addChild(panel, glow, guideLayer, assemblyLayer);
    scene.addChild(boardLayer, trayLayer, dragLayer);
    this.scene = scene;
    this.boardLayer = boardLayer;
    this.guideLayer = guideLayer;
    this.assemblyLayer = assemblyLayer;
    this.trayLayer = trayLayer;
    this.dragLayer = dragLayer;
    this.boardPanel = panel;
    this.stage.setScene(scene);
  }

  async buildRoundViews(generation) {
    await Promise.all([
      ...this.slots.map((slot) => this.buildSlotView(slot, generation)),
      ...this.parts.map((part) => this.buildPartView(part, generation)),
    ]);
  }

  async buildSlotView(slot, generation) {
    const { PIXI } = this.stage;
    const art = await artObj(PIXI, slot.art, ART_SIZE, '');
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
    const view = new PIXI.Container();
    const halo = new PIXI.Graphics();
    halo.circle(0, 0, ART_SIZE * 0.54).fill({ color: 0x2d7dd2, alpha: 0.07 });
    art.alpha = 0.2;
    view.addChild(halo, art);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = slot.alt;
    view.on('pointerdown', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.tapTarget(slot.targetId);
    });
    slot.view = view;
    slot.ghost = art;
    this.guideLayer.addChild(view);
    this.targetMap.set(slot.targetId, {
      id: slot.targetId,
      type: 'slot',
      slot,
      view,
      action: () => this.attemptSelectedSlot(slot.slotIndex),
    });
  }

  async buildPartView(part, generation) {
    const { PIXI } = this.stage;
    const art = await artObj(PIXI, part.art, ART_SIZE, part.alt);
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
    const view = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-TRAY_CARD / 2, -TRAY_CARD / 2 + 7, TRAY_CARD, TRAY_CARD, 24)
      .fill({ color: 0x17517e, alpha: 0.16 });
    const backing = cardBacking(PIXI, TRAY_CARD, TRAY_CARD, {
      fill: 0xfff8e8,
      stroke: 0xffffff,
      strokeWidth: 5,
      radius: 24,
    });
    motion.addChild(shadow, backing, art);
    view.addChild(motion);
    view.hitArea = new PIXI.Rectangle(-TRAY_CARD / 2, -TRAY_CARD / 2, TRAY_CARD, TRAY_CARD);
    view.eventMode = 'static';
    view.cursor = 'grab';
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = part.alt;
    view.on('pointerdown', (event) => this.handlePartPointerDown(event, part.id));
    part.view = view;
    part.motion = motion;
    part.backing = backing;
    part.shadow = shadow;
    motion.scale.set(0.01);
    this.trayLayer.addChild(view);
    this.targetMap.set(part.id, {
      id: part.id,
      type: 'part',
      part,
      view,
      action: () => this.selectPart(part.id),
    });
  }

  async popRoundIn(generation) {
    if (this.guideLayer) {
      this.guideLayer.alpha = 0;
      await this.runTween(to(this.guideLayer, { alpha: 1 }, { ms: 280, easing: ease.outCubic }));
    }
    await Promise.all(this.parts.map(async (part, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 55);
      if (!this.roundIsCurrent(generation) || !part.motion) return;
      await this.runTween(popIn(part.motion, 340));
    }));
  }

  layoutField() {
    if (!this.stage || !this.scene || !this.boardLayer) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;
    const portrait = h >= w;
    const pad = Math.max(8, Math.min(20, Math.min(w, h) * 0.025));
    let boardSize;
    let trayLeft;
    let trayTop;
    let trayW;
    let trayH;

    if (portrait) {
      trayH = Math.max(112, Math.min(h * 0.29, 255));
      boardSize = Math.max(180, Math.min(w - pad * 2, h - trayH - pad * 3));
      this.boardLeft = (w - boardSize) / 2;
      this.boardTop = pad;
      trayLeft = pad;
      trayTop = this.boardTop + boardSize + pad;
      trayW = w - pad * 2;
      trayH = Math.max(96, h - trayTop - pad);
    } else {
      trayW = Math.max(126, Math.min(w * 0.28, 330));
      boardSize = Math.max(180, Math.min(h - pad * 2, w - trayW - pad * 3));
      this.boardLeft = pad + Math.max(0, (w - trayW - pad * 3 - boardSize) / 2);
      this.boardTop = (h - boardSize) / 2;
      trayLeft = w - trayW - pad;
      trayTop = pad;
      trayH = h - pad * 2;
    }

    this.boardScale = boardSize / BUILD_SPACE;
    this.boardLayer.position.set(this.boardLeft, this.boardTop);
    this.boardLayer.scale.set(this.boardScale);
    this.layoutSlots();
    this.layoutTray(trayLeft, trayTop, trayW, trayH, portrait);
    this.layoutPlacedParts();
    this.refreshSelection();

    if (this.activeDrag) {
      this.clientToStage(this.activeDrag.lastX, this.activeDrag.lastY, this.activeDrag);
      if (!this.activeDrag.moved && this.activeDrag.part) {
        this.activeDrag.part.view.position.set(this.activeDrag.part.homeX, this.activeDrag.part.homeY);
      }
    }
  }

  layoutSlots() {
    for (const slot of this.slots) {
      if (!slot.view) continue;
      slot.view.position.set(slot.x, slot.y);
      const artScale = Math.max(40, slot.size) / ART_SIZE;
      slot.view.scale.set(artScale);
      const hitScreen = Math.max(MIN_TOUCH, Math.max(40, slot.size) * this.boardScale);
      slot.hitSize = hitScreen;
      const hitLocal = hitScreen / this.boardScale / artScale;
      slot.hitLocalSize = hitLocal;
      slot.view.hitArea = new this.stage.PIXI.Rectangle(-hitLocal / 2, -hitLocal / 2, hitLocal, hitLocal);
      // Keep an occupied slot in the hit graph (as the DOM engine did), while
      // making its guide effectively invisible behind the placed piece.
      slot.view.visible = true;
      slot.view.alpha = slot.occupantId ? 0.001 : 1;
    }
  }

  layoutTray(left, top, width, height, portrait) {
    const trayParts = this.parts.filter((part) => part.location === 'tray');
    if (!trayParts.length) return;
    let columns;
    let rows;
    if (portrait) {
      columns = Math.min(trayParts.length, Math.max(1, Math.floor(width / (MIN_TOUCH + 10))));
      rows = Math.ceil(trayParts.length / columns);
    } else {
      rows = Math.min(trayParts.length, Math.max(1, Math.floor(height / (MIN_TOUCH + 10))));
      columns = Math.ceil(trayParts.length / rows);
    }
    const gap = Math.max(8, Math.min(16, Math.min(width, height) * 0.04));
    const fitW = (width - gap * (columns - 1)) / columns;
    const fitH = (height - gap * (rows - 1)) / rows;
    this.trayCardSize = Math.max(MIN_TOUCH, Math.min(132, fitW, fitH));
    const totalW = columns * this.trayCardSize + (columns - 1) * gap;
    const totalH = rows * this.trayCardSize + (rows - 1) * gap;
    const firstX = left + (width - totalW) / 2 + this.trayCardSize / 2;
    const firstY = top + (height - totalH) / 2 + this.trayCardSize / 2;
    const scale = this.trayCardSize / TRAY_CARD;

    trayParts.forEach((part, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      part.homeX = firstX + col * (this.trayCardSize + gap);
      part.homeY = firstY + row * (this.trayCardSize + gap);
      part.homeScale = scale;
      if (!part.view || (this.activeDrag && this.activeDrag.partId === part.id && this.activeDrag.moved)) return;
      part.view.position.set(part.homeX, part.homeY);
      part.view.scale.set(scale);
    });
  }

  layoutPlacedParts() {
    for (const part of this.parts) {
      if (part.location !== 'slot' || !part.view) continue;
      const slot = this.slots.find((candidate) => candidate.occupantId === part.id);
      if (!slot) continue;
      part.view.position.set(slot.x, slot.y);
      part.view.scale.set(Math.max(40, slot.size) / ART_SIZE);
    }
  }

  handlePartPointerDown(event, partId) {
    const original = event && event.originalEvent ? event.originalEvent : event;
    if (this.destroyed || !this.awaitingInput || this.inputLocked || this.activeDrag) return;
    if (original && original.isPrimary === false) return;
    const part = this.findPart(partId);
    if (!part || part.location !== 'tray') return;
    if (original && original.preventDefault) original.preventDefault();
    if (original && original.stopPropagation) original.stopPropagation();
    this.unlockAudio();
    const selected = this.selectPart(partId);
    if (!selected.accepted) return;
    const clientX = original && Number.isFinite(original.clientX) ? original.clientX : 0;
    const clientY = original && Number.isFinite(original.clientY) ? original.clientY : 0;
    this.activeDrag = {
      pointerId: original ? original.pointerId : null,
      partId,
      part,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      desiredX: part.view.x,
      desiredY: part.view.y,
      moved: false,
      settling: false,
    };
    window.addEventListener('pointermove', this.onWindowMove, { passive: false });
    window.addEventListener('pointerup', this.onWindowUp, { passive: false });
    window.addEventListener('pointercancel', this.onWindowCancel, { passive: false });
  }

  handleWindowMove(e) {
    const drag = this.activeDrag;
    if (!drag || drag.settling || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_SLOP) {
      drag.moved = true;
      this.dragLayer.addChild(drag.part.view);
      drag.part.view.cursor = 'grabbing';
      drag.part.shadow.alpha = 0.28;
      drag.part.view.scale.set(drag.part.homeScale * 1.12);
    }
    if (drag.moved) this.clientToStage(e.clientX, e.clientY, drag);
  }

  tickDrag() {
    const drag = this.activeDrag;
    if (!drag || !drag.moved || drag.settling || !drag.part || !drag.part.view) return;
    const view = drag.part.view;
    if (this.reducedMotion()) {
      view.position.set(drag.desiredX, drag.desiredY);
      view.rotation = 0;
      return;
    }
    const dx = drag.desiredX - view.x;
    const dy = drag.desiredY - view.y;
    view.x += dx * 0.34;
    view.y += dy * 0.34;
    view.rotation += (clamp(dx * 0.0025, -0.12, 0.12) - view.rotation) * 0.22;
  }

  clientToStage(clientX, clientY, target) {
    if (!this.stage) return;
    const rect = this.stage.app.canvas.getBoundingClientRect();
    const size = this.stage.size();
    target.desiredX = rect.width ? (clientX - rect.left) * size.w / rect.width : clientX;
    target.desiredY = rect.height ? (clientY - rect.top) * size.h / rect.height : clientY;
  }

  async handleWindowUp(e) {
    const drag = this.activeDrag;
    if (!drag || drag.settling || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    this.removeDragListeners();
    if (!drag.moved) {
      drag.part.view.cursor = 'grab';
      this.activeDrag = null;
      return;
    }
    drag.settling = true;
    this.clientToStage(e.clientX, e.clientY, drag);
    drag.part.view.position.set(drag.desiredX, drag.desiredY);
    const slotIndex = this.slotIndexNearPoint(e.clientX, e.clientY);
    try {
      if (slotIndex == null) await this.handleWrongPlacement(drag.partId, null);
      else await this.attemptPlacement(drag.partId, slotIndex);
    } catch {
      await this.glidePartHome(drag.part);
      this.playSfx('unpop');
      this.inputLocked = false;
    } finally {
      if (drag.part && drag.part.view) drag.part.view.cursor = 'grab';
      if (this.activeDrag === drag) this.activeDrag = null;
    }
  }

  handleWindowCancel(e) {
    const drag = this.activeDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    this.cancelActiveDrag();
  }

  async cancelActiveDrag() {
    const drag = this.activeDrag;
    if (!drag || drag.settling) return;
    drag.settling = true;
    this.removeDragListeners();
    if (drag.moved) await this.glidePartHome(drag.part);
    this.playSfx('unpop');
    if (drag.part && drag.part.view) drag.part.view.cursor = 'grab';
    if (this.activeDrag === drag) this.activeDrag = null;
  }

  removeDragListeners() {
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowCancel);
  }

  slotIndexNearPoint(clientX, clientY) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const slot of this.slots) {
      if (slot.occupantId || !slot.view || !slot.view.visible) continue;
      const center = this.screenPointFor(slot.view, 0, 0);
      if (!center) continue;
      const distance = Math.hypot(clientX - center.x, clientY - center.y);
      const radius = Math.max(MIN_TOUCH / 2, slot.hitSize * SNAP_RADIUS_MULTIPLIER);
      if (distance <= radius && distance < nearestDistance) {
        nearest = slot.slotIndex;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  selectPart(partId) {
    const part = this.findPart(partId);
    if (!part || part.location !== 'tray' || !this.canUsePart(part)) {
      this.gentleNudge(partId);
      return { accepted: false };
    }
    this.selectedId = partId;
    this.playSfx('pop');
    this.refreshSelection();
    return { accepted: true };
  }

  refreshSelection() {
    for (const part of this.parts) {
      if (!part.motion || part.location !== 'tray') continue;
      part.motion.alpha = this.canUsePart(part) ? 1 : 0.4;
      const selected = part.id === this.selectedId;
      part.backing.tint = selected ? 0xffefae : 0xffffff;
      part.motion.y = selected ? -4 : 0;
    }
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed) return { accepted: false };
    return target.action();
  }

  async attemptSelectedSlot(slotIndex) {
    if (!this.selectedId || this.inputLocked) return { accepted: false };
    return this.attemptPlacement(this.selectedId, slotIndex);
  }

  async attemptPlacement(partId, slotIndex) {
    const part = this.findPart(partId);
    const slot = this.slots[slotIndex];
    if (!part || !slot || !this.awaitingInput || this.inputLocked || part.location !== 'tray') {
      return { accepted: false };
    }
    this.clearIdleTimer();
    this.inputLocked = true;
    if (this.canUsePart(part) && !slot.occupantId && slot.matchKey === part.matchKey) {
      await this.handleCorrectPlacement(part, slot);
      return { accepted: true };
    }
    await this.handleWrongPlacement(part.id, slot);
    return { accepted: true };
  }

  async handleCorrectPlacement(part, slot) {
    this.playSfx('pop');
    this.playSfx('sparkle');
    slot.occupantId = part.id;
    part.location = 'slot';
    this.selectedId = null;
    this.targetMap.delete(part.id);
    slot.view.alpha = 0.001;
    part.backing.visible = false;
    part.shadow.visible = false;
    part.motion.y = 0;
    part.motion.rotation = 0;
    part.motion.scale.set(1);
    const startX = part.view.x;
    const startY = part.view.y;
    const startScale = part.view.scale.x;
    this.assemblyLayer.addChild(part.view);
    part.view.position.set(
      (startX - this.boardLeft) / this.boardScale,
      (startY - this.boardTop) / this.boardScale,
    );
    part.view.scale.set(startScale / this.boardScale);
    const x = slot.x;
    const y = slot.y;
    const scale = Math.max(40, slot.size) / ART_SIZE;
    part.view.rotation = 0;
    await Promise.all([
      this.runTween(to(part.view, { x, y, rotation: 0, scale: { x: scale, y: scale } }, { ms: 300, easing: ease.outBack })),
      sparkle(
        this.stage.PIXI,
        this.scene,
        this.boardLeft + slot.x * this.boardScale,
        this.boardTop + slot.y * this.boardScale,
      ),
      this.acknowledgeTray(part.id),
    ]);
    await this.speakLine(part.say || part.alt, true);
    if (this.isRoundComplete()) await this.completeRound();
    else {
      this.inputLocked = false;
      this.layoutField();
      this.scheduleIdlePrompt();
    }
  }

  async handleWrongPlacement(partId, slot) {
    const part = this.findPart(partId);
    if (!part || !part.view) return;
    this.playSfx('boing');
    const motions = [wiggle(part.motion, 0.075, 75)];
    if (slot && slot.view) motions.push(wiggle(slot.view, 0.055, 72));
    await Promise.all(motions);
    await this.glidePartHome(part);
    this.selectedId = null;
    await this.speakLine(this.config.voice.nudge, true);
    if (this.destroyed || this.screen !== 'play' || !this.awaitingInput) return;
    this.inputLocked = false;
    this.layoutField();
    this.scheduleIdlePrompt();
  }

  async glidePartHome(part) {
    if (!part || !part.view) return;
    this.dragLayer.addChild(part.view);
    part.view.rotation = part.view.rotation || 0;
    await this.runTween(to(part.view, {
      x: part.homeX,
      y: part.homeY,
      rotation: 0,
      scale: { x: part.homeScale, y: part.homeScale },
    }, { ms: 280, easing: ease.outCubic }));
    if (part.location === 'tray' && this.trayLayer) this.trayLayer.addChild(part.view);
    part.shadow.alpha = 0.16;
    part.motion.rotation = 0;
    part.motion.scale.set(1);
  }

  async acknowledgeTray(excludeId) {
    const remaining = this.parts.filter((part) => part.location === 'tray' && part.id !== excludeId && part.motion);
    await Promise.all(remaining.map(async (part, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 22);
      await this.runTween(to(part.motion, { scale: { x: 1.045, y: 1.045 } }, { ms: 90, easing: ease.outBack }));
      await this.runTween(to(part.motion, { scale: { x: 1, y: 1 } }, { ms: 110, easing: ease.outQuad }));
    }));
  }

  gentleNudge(partId) {
    const part = partId ? this.findPart(partId) : null;
    if (part && part.motion) wiggle(part.motion, 0.07, 75);
    this.playSfx('boing');
    this.speakLine(this.config.voice.wait || this.config.voice.nudge, true);
  }

  async completeRound() {
    this.awaitingInput = false;
    this.inputLocked = true;
    this.selectedId = null;
    this.removeDragListeners();
    this.activeDrag = null;
    this.playSfx('tada');
    const centerX = this.boardLeft + BUILD_SPACE * this.boardScale / 2;
    const centerY = this.boardTop + BUILD_SPACE * this.boardScale / 2;
    const originalScale = this.boardScale;
    await Promise.all([
      (async () => {
        await this.runTween(to(this.boardLayer.scale, { x: originalScale * 1.045, y: originalScale * 1.045 }, { ms: 180, easing: ease.outBack }));
        await this.runTween(to(this.boardLayer.scale, { x: originalScale, y: originalScale }, { ms: 220, easing: ease.outElastic }));
      })(),
      burst(this.stage.PIXI, this.scene, centerX, centerY, { count: 36, power: 7, life: 760 }),
    ]);
    const build = this.roundBuilds[this.roundIndex];
    await this.speakLine(build && build.say, true);
    await this.delay(this.reducedMotion() ? 120 : 420);
    if (this.destroyed || this.screen !== 'play') return;
    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) await this.finishGame();
    else await this.showRound(next);
  }

  async finishGame() {
    this.clearIdleTimer();
    this.removeDragListeners();
    this.activeDrag = null;
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.selectedId = null;
    this.targetMap.clear();
    this.playSfx('tada');
    this.disposeStage();
    this.mountEl.innerHTML = `
      <section class="qk-build qk-build-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <button class="qk-build-back qk-build-img-btn" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-build-end-center">
          <div class="qk-build-end-art" aria-hidden="true">${escapeHtml(splashGlyph(this.config.endArt || this.config.splashArt))}</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <button class="qk-build-again" type="button">
            <span class="qk-build-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>
    `;
    const again = this.mountEl.querySelector('.qk-build-again');
    again.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); });
    again.addEventListener('click', () => this.mode ? this.startMode(this.mode.id) : this.renderSplash());
    this.createDomBurst(this.mountEl.querySelector('.qk-build-end-art'), 32);
    await this.speakLine(this.config.voice.cheer, true);
  }

  replayPromptFromHud() {
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_DEBOUNCE_MS) return;
    this.lastReplay = now;
    this.playSfx('tick');
    this.replayPrompt();
  }

  async replayPrompt() {
    if (this.screen !== 'play' || !this.mode) return;
    this.clearIdleTimer();
    await this.speakLine(this.mode.prompt || this.config.voice.intro, true);
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.speakLine(this.mode && (this.mode.prompt || this.config.voice.intro), true);
    }, IDLE_MS);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-build-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createDomBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-build') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burstEl = document.createElement('div');
    burstEl.className = 'qk-build-burst';
    burstEl.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burstEl.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;
    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      const angle = Math.PI * 2 * i / count;
      const distance = 64 + this.fxRng() * 94;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      piece.style.setProperty('--hue', String(18 + Math.floor(this.fxRng() * 285)));
      piece.style.setProperty('--delay', `${this.fxRng() * 80}ms`);
      burstEl.appendChild(piece);
    }
    host.appendChild(burstEl);
    this.delay(900).then(() => burstEl.remove());
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
    const selected = this.selectedId ? this.findPart(this.selectedId) : null;
    const targets = [];
    for (const slot of this.slots) {
      if (!slot.view) continue;
      const role = selected
        ? (this.canUsePart(selected) && !slot.occupantId && slot.matchKey === selected.matchKey ? 'correct' : 'wrong')
        : 'neutral';
      const target = this.targetRect(slot.targetId, role, slot.view, slot.hitLocalSize);
      if (target) targets.push(target);
    }
    for (const part of this.parts) {
      if (part.location !== 'tray' || !part.view) continue;
      const target = this.targetRect(part.id, 'neutral', part.view, TRAY_CARD);
      if (target) targets.push(target);
    }
    return targets;
  }

  targetRect(id, role, view, localSize) {
    const half = localSize / 2;
    const points = [
      this.screenPointFor(view, -half, -half),
      this.screenPointFor(view, half, -half),
      this.screenPointFor(view, half, half),
      this.screenPointFor(view, -half, half),
    ];
    if (points.some((point) => !point)) return null;
    let minX = points[0].x;
    let maxX = points[0].x;
    let minY = points[0].y;
    let maxY = points[0].y;
    for (let i = 1; i < points.length; i++) {
      minX = Math.min(minX, points[i].x);
      maxX = Math.max(maxX, points[i].x);
      minY = Math.min(minY, points[i].y);
      maxY = Math.max(maxY, points[i].y);
    }
    return { id, role, rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY } };
  }

  screenPointFor(view, x, y) {
    if (!this.stage || !view) return null;
    const global = view.toGlobal(new this.stage.PIXI.Point(x, y));
    const canvasRect = this.stage.app.canvas.getBoundingClientRect();
    const stageSize = this.stage.size();
    return {
      x: canvasRect.left + global.x * (stageSize.w ? canvasRect.width / stageSize.w : 1),
      y: canvasRect.top + global.y * (stageSize.h ? canvasRect.height / stageSize.h : 1),
    };
  }

  async winRound() {
    if (this.screen !== 'play' || this.destroyed) return;
    this.clearIdleTimer();
    this.removeDragListeners();
    this.activeDrag = null;
    this.inputLocked = true;
    this.selectedId = null;
    for (const slot of this.slots) {
      if (slot.occupantId) continue;
      const part = this.parts.find((candidate) => candidate.location === 'tray' && candidate.matchKey === slot.matchKey);
      if (!part) continue;
      part.location = 'slot';
      slot.occupantId = part.id;
      this.targetMap.delete(part.id);
      if (part.backing) part.backing.visible = false;
      if (part.shadow) part.shadow.visible = false;
      if (slot.view) slot.view.alpha = 0.001;
      if (part.view) this.assemblyLayer.addChild(part.view);
    }
    this.layoutPlacedParts();
    await this.completeRound();
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    const value = Number(n) || 0;
    this.rng = mulberry32(value);
    this.fxRng = mulberry32(value + 101);
  }

  canUsePart(part) {
    if (!part || part.location !== 'tray') return false;
    const build = this.roundBuilds[this.roundIndex];
    if (!build || !build.ordered) return true;
    const nextSlot = this.slots.find((slot) => !slot.occupantId);
    return !!nextSlot && nextSlot.slotIndex === part.partIndex;
  }

  async speakLine(line, cancel = false) {
    if (this.muted || !line) return;
    await speech.speak(line, { rate: 0.8, pitch: 1.05, cancel });
  }

  playSfx(name) {
    if (this.muted || !name || typeof sfx[name] !== 'function') return;
    sfx[name]();
  }

  reducedMotion() {
    return this.motionReduced;
  }

  findPart(partId) {
    return this.parts.find((part) => part.id === partId);
  }

  isRoundComplete() {
    return this.slots.length > 0 && this.slots.every((slot) => slot.occupantId);
  }

  roundIsCurrent(generation) {
    return !this.destroyed && this.screen === 'play' && this.stage && generation === this.roundGeneration;
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

function normalizeConfig(config = {}) {
  const copy = { home: 'Home', replay: 'Hear it again', playAgain: 'Play Again', ...(config.copy || {}) };
  const voice = {
    intro: config.prompt || '',
    nudge: 'Try another spot.',
    wait: 'That piece comes later.',
    cheer: 'You built them all!',
    ...(config.voice || {}),
  };
  const modes = Array.isArray(config.modes) && config.modes.length
    ? config.modes
    : [{
      id: config.id || 'build',
      title: config.title || 'Build',
      rounds: config.rounds,
      prompt: config.prompt,
      builds: config.builds || [],
    }];
  return {
    ...config,
    id: config.id || 'build-assemble',
    title: config.title || 'Build It',
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || firstBuildArt(modes) || 'emoji:🧩'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    copy,
    voice,
    modes: modes.map(normalizeMode).filter((mode) => mode.builds.length),
  };
}

function normalizeMode(mode = {}) {
  const builds = (mode.builds || []).map(normalizeBuild).filter((build) => build.parts.length >= 2);
  return {
    ...mode,
    id: mode.id || 'build',
    title: mode.title || 'Build',
    rounds: Math.min(mode.rounds || builds.length, builds.length),
    prompt: mode.prompt || '',
    builds,
  };
}

function normalizeBuild(build = {}) {
  const parts = (build.parts || []).filter((part) => part && part.art).map((part, index) => ({
    ...part,
    art: normalizeArtRef(part.art),
    alt: part.alt || `part ${index + 1}`,
    x: clampNumber(part.x, 500, 0, 1000),
    y: clampNumber(part.y, 500, 0, 1000),
    size: clampNumber(part.size, 160, 60, 900),
  }));
  return { ...build, name: build.name || 'build', say: build.say || '', ordered: !!build.ordered, parts };
}

function firstBuildArt(modes) {
  for (const mode of modes) {
    for (const build of mode.builds || []) {
      if (build.parts && build.parts[0] && build.parts[0].art) return build.parts[0].art;
    }
  }
  return null;
}

function normalizeArtRef(ref) {
  if (!ref) return 'emoji:🧩';
  if (ref.includes(':')) return ref;
  return `emoji:${ref}`;
}

function splashGlyph(ref) {
  if (!ref) return '🧩';
  if (ref.startsWith('emoji:')) return ref.slice(6);
  if (ref.startsWith('text:')) return ref.slice(5);
  if (ref.startsWith('swatch:')) return '🎨';
  return '🧩';
}

function matchKey(part) {
  return `${part.art}|${part.alt || ''}`;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function installStyle() {
  if (styleInstalled || document.getElementById('qk-build-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-build-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-build, .qk-build * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-build {
      --sky: #bee3f5; --navy: #17517e; --blue: #2d7dd2; --green: #58a945;
      --yellow: #ffd166; --coral: #f25f5c; --white: #ffffff;
      --shadow: 0 6px 0 rgba(23,81,126,.18), 0 14px 30px rgba(23,81,126,.18);
      position: relative; width: 100%; height: 100dvh; min-height: 100%; overflow: hidden;
      color: var(--navy); font-family: 'Fredoka','Arial Rounded MT Bold','Trebuchet MS',sans-serif;
      font-weight: 600; background-color: var(--sky);
      background-image: radial-gradient(circle at 18% 18%,rgba(255,255,255,.42) 0 8px,transparent 9px),
        radial-gradient(circle at 78% 26%,rgba(255,255,255,.34) 0 12px,transparent 13px),
        radial-gradient(circle at 48% 88%,rgba(255,255,255,.28) 0 9px,transparent 10px);
      background-size: 160px 160px,230px 230px,200px 200px;
      touch-action: manipulation; -webkit-user-select: none; user-select: none;
      -webkit-touch-callout: none; overscroll-behavior: none;
    }
    .qk-build button,.qk-build a { font: inherit; color: inherit; touch-action: manipulation; }
    .qk-build button { border: 0; cursor: pointer; }
    .qk-build button:focus-visible,.qk-build a:focus-visible { outline: 5px solid rgba(45,125,210,.7); outline-offset: 4px; }
    .qk-build-img-btn { display: grid; place-items: center; width: 96px; height: 96px; border-radius: 50%;
      background: transparent center/84px 84px no-repeat; text-decoration: none; box-shadow: none; }
    .qk-build-img-btn:active { transform: scale(.93); }
    .qk-build-home { background-image: url('${HOME_IMG}'); }
    .qk-build-back { background-image: url('${BACK_IMG}'); }
    .qk-build-sound { background-image: url('${SOUND_IMG}'); }
    .qk-build-splash,.qk-build-end { display: grid; place-items: center;
      padding: max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right))
        max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left)); }
    .qk-build-home,     .qk-build-back { position: absolute; top: max(12px,env(safe-area-inset-top)); left: max(12px,env(safe-area-inset-left)); z-index: 5; }
    .qk-build-splash-center,.qk-build-end-center { width: min(900px,100%); display: grid; justify-items: center;
      gap: clamp(14px,2.5vmin,24px); text-align: center; padding-top: 54px; }
    .qk-build-splash-art,.qk-build-end-art { display: grid; place-items: center; width: clamp(150px,26vmin,230px);
      aspect-ratio: 1; border-radius: 28px; background: linear-gradient(180deg,#fff,#fff3d0);
      border: 5px solid var(--white); box-shadow: var(--shadow); font-size: clamp(70px,15vmin,126px); line-height: 1; }
    .qk-build h1 { margin: 0; max-width: 13ch; color: var(--navy); font-size: clamp(38px,7vmin,78px);
      line-height: .98; text-shadow: 0 4px 0 rgba(255,255,255,.72); }
    .qk-build-mode-list { display: grid; grid-template-columns: repeat(auto-fit,minmax(210px,1fr)); gap: 18px;
      width: min(760px,100%); margin-top: 6px; }
    .qk-build-mode,.qk-build-again { min-height: 104px; border-radius: 26px; border: 5px solid var(--white);
      padding: 18px 24px; color: var(--white); background: linear-gradient(180deg,rgba(255,255,255,.34),transparent 50%),var(--blue);
      box-shadow: var(--shadow); font-size: clamp(23px,4vmin,36px); line-height: 1.05; }
    .qk-build-mode:nth-child(2n) { background-color: var(--green); }
    .qk-build-mode:nth-child(3n) { background-color: var(--coral); }
    .qk-build-mode:active,.qk-build-again:active { transform: scale(.96); }
    .qk-build-play { display: grid; grid-template-rows: auto 1fr; min-height: 100dvh;
      padding: max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right))
        max(112px,calc(100px + env(safe-area-inset-bottom))) max(12px,env(safe-area-inset-left)); }
    .qk-build-hud { position: relative; z-index: 4; display: grid; grid-template-columns: 96px 1fr 96px;
      align-items: center; min-height: 100px; }
    .qk-build-hud .qk-build-home,     .qk-build-hud .qk-build-back { position: static; }
    .qk-build-progress { justify-self: center; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;
      max-width: min(560px,58vw); padding: 8px 15px; border-radius: 999px; background: rgba(255,255,255,.42); }
    .qk-build-dot { width: 18px; height: 18px; border-radius: 50%; background: rgba(255,255,255,.88);
      box-shadow: inset 0 -2px 0 rgba(23,81,126,.12); }
    .qk-build-dot.is-filled { background: var(--green); }
    .qk-build-dot.is-current { background: var(--yellow); box-shadow: 0 0 0 4px rgba(255,255,255,.72); }
    .qk-build-stage { min-height: 0; position: relative; width: min(1200px,100%); justify-self: center; }
    .qk-build-canvas { position: absolute; inset: 0; overflow: hidden; border-radius: 28px; touch-action: none; }
    .qk-build-canvas canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .qk-build-sound { position: absolute; left: max(12px,env(safe-area-inset-left)); bottom: max(12px,env(safe-area-inset-bottom)); z-index: 5; }
    .qk-build-again { display: inline-flex; align-items: center; justify-content: center; min-width: min(380px,92vw); background-color: var(--green); }
    .qk-build-play-icon { display: inline-block; width: 64px; height: 64px; margin-right: 10px;
      background: url('${PLAY_IMG}') center/contain no-repeat; }
    .qk-build-burst { position: absolute; z-index: 9; pointer-events: none; }
    .qk-build-burst span { position: absolute; width: 16px; height: 16px; border-radius: 5px;
      background: hsl(var(--hue),80%,58%); animation: qk-build-burst .82s ease-out forwards; animation-delay: var(--delay); }
    @keyframes qk-build-burst { from { opacity: 1; transform: translate(-50%,-50%) scale(.8); }
      to { opacity: 0; transform: translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(.2) rotate(220deg); } }
    @media (max-width: 620px) {
      .qk-build-play { padding-left: max(8px,env(safe-area-inset-left)); padding-right: max(8px,env(safe-area-inset-right)); }
      .qk-build-hud { grid-template-columns: 96px 1fr 16px; }
      .qk-build-progress { max-width: 50vw; }
    }
    @media (prefers-reduced-motion: reduce) {
      .qk-build * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
