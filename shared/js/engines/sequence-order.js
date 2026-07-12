// sequence-order.js — Stage v2 archetype for putting pictures in order.
//
// DOM owns the splash, HUD, and end screen. Pixi owns the ordered slot row,
// shuffled tray, drag layer, feedback, and celebration. The pointer stream is
// deliberately window-level: changing Pixi parents can never strand a piece.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { createStage } from '../stage/stage.js';
import { to, ease, popIn, wiggle } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, card as cardBacking } from '../stage/art-pixi.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;

const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const WAIT_FOR_INPUT_MS = 80;
const PRAISE_GAPS = [2, 3];
const MIN_TOUCH = 96;
const CARD_SIZE = 132;
const ART_SIZE = 92;
const DRAG_SLOP = 8;

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('sequence-order requires a mount element');
  installStyle();
  return new SequenceOrderGame(config, mountEl);
}

class SequenceOrderGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;
    this.destroyed = false;

    this.screen = 'splash';
    this.mode = null;
    this.roundSets = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.items = [];
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
    this.correctPlacements = 0;
    this.nextPraiseAt = PRAISE_GAPS[0];
    this.praiseGapIndex = 0;
    this.yumIndex = 0;
    this.motionReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.stage = null;
    this.scene = null;
    this.slotLayer = null;
    this.pieceLayer = null;
    this.dragLayer = null;
    this.fxLayer = null;
    this.slotCardSize = MIN_TOUCH;
    this.pieceCardSize = MIN_TOUCH;
    this.removeResize = null;
    this.removeDragTick = null;
    this.stageGeneration = 0;
    this.roundGeneration = 0;
    this.pendingDelays = new Set();
    this.activeTweens = new Set();
    this.targetMap = new Map();
    this.activeDrag = null;
    this.hoveredSlot = null;

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
    this.sweepStrayClones();
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
      engine: 'sequence-order',
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
    this.sweepStrayClones();
    this.disposeStage();
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.selectedId = null;
    this.targetMap.clear();
    speech.stop();

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-seq-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        ${escapeHtml(mode.title || mode.id)}
      </button>
    `).join('');
    this.mountEl.innerHTML = `
      <section class="qk-seq qk-seq-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-seq-img-btn qk-seq-home" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-seq-splash-center">
          <div class="qk-seq-splash-art" aria-hidden="true">${escapeHtml(splashGlyph(this.config.splashArt))}</div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-seq-mode-list">${buttons}</div>
        </div>
      </section>
    `;
    this.mountEl.querySelectorAll('.qk-seq-mode').forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(button.dataset.mode));
    });
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;
    const mode = this.config.modes.find((item) => item.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearIdleTimer();
    this.removeDragListeners();
    this.activeDrag = null;
    this.sweepStrayClones();
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
    this.roundIndex = 0;
    this.correctPlacements = 0;
    this.nextPraiseAt = PRAISE_GAPS[0];
    this.praiseGapIndex = 0;
    this.yumIndex = 0;

    const maxRounds = Math.min(mode.rounds || mode.sets.length, mode.sets.length);
    this.roundSets = mode.sets.slice(0, maxRounds);
    this.roundsTotal = this.roundSets.length;
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
      '<span class="qk-seq-dot" aria-hidden="true"></span>'
    )).join('');
    this.mountEl.innerHTML = `
      <section class="qk-seq qk-seq-play" aria-label="${escapeAttr(this.mode.title || this.config.title)}">
        <header class="qk-seq-hud">
          <a class="qk-seq-img-btn qk-seq-home" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
          <div class="qk-seq-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-seq-stage">
          <div class="qk-seq-canvas" aria-label="${escapeAttr(this.mode.title || this.config.title)}"></div>
        </main>
        <button class="qk-seq-img-btn qk-seq-sound" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;
    const home = this.mountEl.querySelector('.qk-seq-home');
    home.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.playSfx('tick'); });
    home.addEventListener('click', () => speech.stop());
    const sound = this.mountEl.querySelector('.qk-seq-sound');
    sound.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.unlockAudio(); });
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-seq-canvas');
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
    this.slotLayer = null;
    this.pieceLayer = null;
    this.dragLayer = null;
    this.fxLayer = null;
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
    this.hoveredSlot = null;
    this.targetMap.clear();
    const generation = ++this.roundGeneration;

    const set = this.roundSets[index];
    const sourceItems = this.mode.difficultyRamp && index === 0
      ? set.items.slice(0, Math.min(3, set.items.length))
      : set.items.slice();
    const ordered = sourceItems.map((item, order) => ({
      ...item,
      id: `item:${order}`,
      order,
      location: 'tray',
      view: null,
      motion: null,
      backing: null,
      shadow: null,
      homeX: 0,
      homeY: 0,
      homeScale: 1,
    }));
    this.items = shuffle(ordered, this.rng);
    if (this.items.length > 1 && isCorrectOrder(this.items)) this.items.push(this.items.shift());
    this.slots = ordered.map((item, indexInOrder) => ({
      index: indexInOrder,
      targetId: `slot:${indexInOrder}`,
      occupantId: null,
      view: null,
      backing: null,
      halo: null,
      homeX: 0,
      homeY: 0,
      homeScale: 1,
      screenX: 0,
      screenY: 0,
      screenRadius: MIN_TOUCH / 2,
      alt: this.slotAriaLabel(indexInOrder),
    }));

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
    const slotLayer = new PIXI.Container();
    const pieceLayer = new PIXI.Container();
    const dragLayer = new PIXI.Container();
    const fxLayer = new PIXI.Container();
    scene.addChild(slotLayer, pieceLayer, dragLayer, fxLayer);
    this.scene = scene;
    this.slotLayer = slotLayer;
    this.pieceLayer = pieceLayer;
    this.dragLayer = dragLayer;
    this.fxLayer = fxLayer;
    this.stage.setScene(scene);
  }

  async buildRoundViews(generation) {
    await Promise.all([
      ...this.slots.map((slot) => this.buildSlotView(slot, generation)),
      ...this.items.map((item) => this.buildItemView(item, generation)),
    ]);
  }

  async buildSlotView(slot, generation) {
    const { PIXI } = this.stage;
    const view = new PIXI.Container();
    const halo = new PIXI.Graphics();
    halo.roundRect(-CARD_SIZE / 2 - 7, -CARD_SIZE / 2 - 7, CARD_SIZE + 14, CARD_SIZE + 14, 30)
      .fill({ color: 0xffd166, alpha: 0.01 });
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-CARD_SIZE / 2, -CARD_SIZE / 2 + 7, CARD_SIZE, CARD_SIZE, 25)
      .fill({ color: 0x17517e, alpha: 0.11 });
    const backing = cardBacking(PIXI, CARD_SIZE, CARD_SIZE, {
      fill: 0xfff8e8,
      stroke: 0xffffff,
      strokeWidth: 5,
      radius: 25,
    });
    backing.alpha = 0.72;
    const hole = new PIXI.Graphics();
    hole.roundRect(-34, -34, 68, 68, 20).fill({ color: 0x17517e, alpha: 0.07 });
    const marker = new PIXI.Graphics();
    marker.circle(-18, CARD_SIZE / 2 + 12, 5).fill(0x58a945)
      .circle(0, CARD_SIZE / 2 + 12, 5).fill(0x2d7dd2)
      .circle(18, CARD_SIZE / 2 + 12, 5).fill(0xffd166);
    view.addChild(halo, shadow, backing, hole, marker);
    view.alpha = 0;
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.hitArea = new PIXI.Rectangle(-CARD_SIZE / 2, -CARD_SIZE / 2, CARD_SIZE, CARD_SIZE);
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = slot.alt;
    view.on('pointerdown', (event) => {
      const original = event && event.originalEvent ? event.originalEvent : event;
      if (original && original.preventDefault) original.preventDefault();
      if (original && original.stopPropagation) original.stopPropagation();
      this.unlockAudio();
      this.tapTarget(slot.targetId);
    });
    if (!this.roundIsCurrent(generation)) { view.destroy({ children: true }); return; }
    slot.view = view;
    slot.backing = backing;
    slot.halo = halo;
    this.slotLayer.addChild(view);
    this.targetMap.set(slot.targetId, {
      id: slot.targetId,
      type: 'slot',
      slot,
      view,
      action: () => this.attemptSelectedSlot(slot.index),
    });
  }

  async buildItemView(item, generation) {
    const { PIXI } = this.stage;
    const art = await artObj(PIXI, item.art, ART_SIZE, item.alt || '');
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
    const view = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-CARD_SIZE / 2, -CARD_SIZE / 2 + 7, CARD_SIZE, CARD_SIZE, 25)
      .fill({ color: 0x17517e, alpha: 0.16 });
    const backing = cardBacking(PIXI, CARD_SIZE, CARD_SIZE, {
      fill: 0xfff8e8,
      stroke: 0xffffff,
      strokeWidth: 5,
      radius: 25,
    });
    motion.addChild(shadow, backing, art);
    view.addChild(motion);
    view.hitArea = new PIXI.Rectangle(-CARD_SIZE / 2, -CARD_SIZE / 2, CARD_SIZE, CARD_SIZE);
    view.eventMode = 'static';
    view.cursor = 'grab';
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = item.alt || '';
    view.on('pointerdown', (event) => this.handleItemPointerDown(event, item.id));
    item.view = view;
    item.motion = motion;
    item.backing = backing;
    item.shadow = shadow;
    motion.scale.set(0.01);
    this.pieceLayer.addChild(view);
    this.targetMap.set(item.id, {
      id: item.id,
      type: 'item',
      item,
      view,
      action: () => this.selectItem(item.id),
    });
  }

  async popRoundIn(generation) {
    await Promise.all(this.slots.map(async (slot, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 38);
      if (!this.roundIsCurrent(generation) || !slot.view) return;
      await this.runTween(to(slot.view, { alpha: 1 }, { ms: 220, easing: ease.outCubic }));
    }));
    await Promise.all(this.items.map(async (item, index) => {
      await this.delay(this.reducedMotion() ? 0 : 80 + index * 58);
      if (!this.roundIsCurrent(generation) || !item.motion) return;
      await this.runTween(popIn(item.motion, 340));
    }));
  }

  layoutField() {
    if (!this.stage || !this.scene) return;
    const { w, h } = this.stage.size();
    if (!w || !h || !this.slots.length) return;
    const pad = Math.max(8, Math.min(22, Math.min(w, h) * 0.025));
    const slotAreaH = Math.max(118, Math.min(h * 0.42, 230));
    const trayTop = slotAreaH + pad;
    const trayH = Math.max(MIN_TOUCH, h - trayTop - pad);

    this.layoutRow(this.slots, pad, pad, w - pad * 2, slotAreaH - pad, true);
    const trayItems = this.items.filter((item) => item.location === 'tray');
    this.layoutTray(trayItems, pad, trayTop, w - pad * 2, trayH);
    this.layoutPlacedItems();
    this.cacheSlotScreenCenters();
    this.refreshSelection();

    if (this.activeDrag) {
      this.clientToStage(this.activeDrag.lastX, this.activeDrag.lastY, this.activeDrag);
      if (!this.activeDrag.moved && this.activeDrag.item) {
        this.activeDrag.item.view.position.set(this.activeDrag.item.homeX, this.activeDrag.item.homeY);
      }
    }
  }

  layoutRow(records, left, top, width, height, slots) {
    const count = records.length;
    const gap = Math.max(7, Math.min(16, width * 0.015));
    const fit = (width - gap * (count - 1)) / count;
    const size = Math.max(MIN_TOUCH, Math.min(CARD_SIZE, fit, height - 22));
    const totalW = size * count + gap * (count - 1);
    const firstX = left + (width - totalW) / 2 + size / 2;
    const y = top + Math.max(size / 2, (height - 16) / 2);
    const scale = size / CARD_SIZE;
    if (slots) this.slotCardSize = size;
    records.forEach((record, index) => {
      record.homeX = firstX + index * (size + gap);
      record.homeY = y;
      record.homeScale = scale;
      if (record.view) {
        record.view.position.set(record.homeX, record.homeY);
        record.view.scale.set(scale);
      }
    });
  }

  layoutTray(items, left, top, width, height) {
    if (!items.length) return;
    let columns = Math.min(items.length, Math.max(1, Math.floor(width / (MIN_TOUCH + 10))));
    let rows = Math.ceil(items.length / columns);
    while (rows * MIN_TOUCH + (rows - 1) * 10 > height && columns < items.length) {
      columns += 1;
      rows = Math.ceil(items.length / columns);
    }
    const gap = Math.max(8, Math.min(18, Math.min(width, height) * 0.035));
    const fitW = (width - gap * (columns - 1)) / columns;
    const fitH = (height - gap * (rows - 1)) / rows;
    const size = Math.max(MIN_TOUCH, Math.min(CARD_SIZE, fitW, fitH));
    const totalW = columns * size + (columns - 1) * gap;
    const totalH = rows * size + (rows - 1) * gap;
    const firstX = left + (width - totalW) / 2 + size / 2;
    const firstY = top + (height - totalH) / 2 + size / 2;
    const scale = size / CARD_SIZE;
    this.pieceCardSize = size;
    items.forEach((item, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      item.homeX = firstX + col * (size + gap);
      item.homeY = firstY + row * (size + gap);
      item.homeScale = scale;
      if (!item.view || (this.activeDrag && this.activeDrag.itemId === item.id && this.activeDrag.moved)) return;
      item.view.position.set(item.homeX, item.homeY);
      item.view.scale.set(scale);
    });
  }

  layoutPlacedItems() {
    for (const item of this.items) {
      if (item.location !== 'slot' || !item.view) continue;
      const slot = this.slots[item.order];
      item.view.position.set(slot.homeX, slot.homeY);
      item.view.scale.set(slot.homeScale);
    }
  }

  cacheSlotScreenCenters() {
    for (const slot of this.slots) {
      const point = this.screenPointFor(slot.view, 0, 0);
      if (!point) continue;
      slot.screenX = point.x;
      slot.screenY = point.y;
      slot.screenRadius = Math.max(MIN_TOUCH / 2, this.slotCardSize * 0.62);
    }
  }

  slotAriaLabel(index) {
    const label = this.mode.slotLabels && this.mode.slotLabels[index];
    return label ? `Slot ${index + 1}, ${label}` : `Slot ${index + 1}`;
  }

  handleItemPointerDown(event, itemId) {
    const original = event && event.originalEvent ? event.originalEvent : event;
    if (this.destroyed || !this.awaitingInput || this.inputLocked || this.activeDrag) return;
    if (original && original.isPrimary === false) return;
    const item = this.findItem(itemId);
    if (!item || item.location !== 'tray') return;
    if (original && original.preventDefault) original.preventDefault();
    if (original && original.stopPropagation) original.stopPropagation();
    this.unlockAudio();
    this.sweepStrayClones();
    const selected = this.selectItem(itemId);
    if (!selected.accepted) return;
    const clientX = original && Number.isFinite(original.clientX) ? original.clientX : 0;
    const clientY = original && Number.isFinite(original.clientY) ? original.clientY : 0;
    this.activeDrag = {
      pointerId: original ? original.pointerId : null,
      itemId,
      item,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      desiredX: item.view.x,
      desiredY: item.view.y,
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
      this.dragLayer.addChild(drag.item.view);
      drag.item.view.cursor = 'grabbing';
      drag.item.shadow.alpha = 0.3;
      drag.item.view.scale.set(drag.item.homeScale * 1.12);
    }
    if (drag.moved) {
      this.clientToStage(e.clientX, e.clientY, drag);
      this.updateHoveredSlot(e.clientX, e.clientY, drag.item);
    }
  }

  tickDrag() {
    const drag = this.activeDrag;
    if (!drag || !drag.moved || drag.settling || !drag.item || !drag.item.view) return;
    const view = drag.item.view;
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
      drag.item.view.cursor = 'grab';
      this.activeDrag = null;
      return;
    }
    drag.settling = true;
    this.clientToStage(e.clientX, e.clientY, drag);
    drag.item.view.position.set(drag.desiredX, drag.desiredY);
    const slotIndex = this.slotIndexNearPoint(e.clientX, e.clientY);
    this.updateHoveredSlot(null, null, null);
    try {
      if (slotIndex == null) {
        await this.glideItemHome(drag.item);
        this.playSfx('unpop');
      } else {
        await this.attemptPlacement(drag.itemId, slotIndex);
      }
    } catch {
      await this.glideItemHome(drag.item);
      this.playSfx('unpop');
      this.inputLocked = false;
    } finally {
      if (drag.item && drag.item.view) drag.item.view.cursor = 'grab';
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
    if (!drag || drag.settling) {
      this.sweepStrayClones();
      return;
    }
    drag.settling = true;
    this.removeDragListeners();
    this.updateHoveredSlot(null, null, null);
    if (drag.moved) await this.glideItemHome(drag.item);
    this.playSfx('unpop');
    if (drag.item && drag.item.view) drag.item.view.cursor = 'grab';
    if (this.activeDrag === drag) this.activeDrag = null;
    this.sweepStrayClones();
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
      const distance = Math.hypot(clientX - slot.screenX, clientY - slot.screenY);
      if (distance <= slot.screenRadius && distance < nearestDistance) {
        nearest = slot.index;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  updateHoveredSlot(clientX, clientY, item) {
    let next = null;
    if (item && Number.isFinite(clientX) && Number.isFinite(clientY)) {
      const slot = this.slots[item.order];
      const distance = Math.hypot(clientX - slot.screenX, clientY - slot.screenY);
      if (!slot.occupantId && distance <= slot.screenRadius * 1.45) next = slot;
    }
    if (this.hoveredSlot === next) return;
    if (this.hoveredSlot && this.hoveredSlot.halo) this.hoveredSlot.halo.alpha = 0.01;
    this.hoveredSlot = next;
    if (next && next.halo) next.halo.alpha = 0.34;
  }

  selectItem(itemId) {
    const item = this.findItem(itemId);
    if (!item || item.location !== 'tray' || !this.awaitingInput || this.inputLocked) {
      return { accepted: false };
    }
    this.selectedId = itemId;
    this.playSfx('pop');
    this.refreshSelection();
    return { accepted: true };
  }

  refreshSelection() {
    for (const item of this.items) {
      if (!item.motion || item.location !== 'tray') continue;
      const selected = item.id === this.selectedId;
      item.backing.tint = selected ? 0xffefae : 0xffffff;
      item.motion.y = selected ? -4 : 0;
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

  async attemptPlacement(itemId, slotIndex) {
    const item = this.findItem(itemId);
    const slot = this.slots[slotIndex];
    if (!item || !slot || !this.awaitingInput || this.inputLocked || item.location !== 'tray') {
      return { accepted: false };
    }
    this.clearIdleTimer();
    this.inputLocked = true;
    if (item.order === slotIndex && !slot.occupantId) {
      await this.handleCorrectPlacement(item, slot);
      return { accepted: true };
    }
    await this.handleWrongPlacement(item, slot);
    return { accepted: true };
  }

  async handleCorrectPlacement(item, slot) {
    this.playSfx('pop');
    this.playSfx('sparkle');
    slot.occupantId = item.id;
    item.location = 'slot';
    this.selectedId = null;
    this.correctPlacements += 1;
    this.targetMap.delete(item.id);
    slot.backing.alpha = 0.2;
    item.motion.y = 0;
    item.motion.rotation = 0;
    item.motion.scale.set(1);
    const startScale = item.view.scale.x;
    this.dragLayer.addChild(item.view);
    const neighborWave = this.acknowledgePlacedNeighbors(slot.index);
    await Promise.all([
      this.runTween(to(item.view, {
        x: slot.homeX,
        y: slot.homeY,
        rotation: 0,
        scale: { x: slot.homeScale, y: slot.homeScale },
      }, { ms: 300, easing: ease.outBack })),
      sparkle(this.stage.PIXI, this.fxLayer, slot.homeX, slot.homeY, 0xffd75e),
      neighborWave,
    ]);
    if (!this.roundIsCurrent(this.roundGeneration)) return;
    this.slotLayer.addChild(item.view);
    item.shadow.alpha = 0.11;
    item.view.scale.set(slot.homeScale || startScale);
    if (this.shouldPraise()) await this.speakNextYum();
    if (this.isRoundComplete()) await this.completeRound();
    else {
      this.inputLocked = false;
      this.layoutField();
      this.scheduleIdlePrompt();
    }
  }

  async handleWrongPlacement(item, slot) {
    if (!item || !item.view) return;
    this.playSfx('boing');
    const motions = [wiggle(item.motion, 0.075, 75)];
    if (slot && slot.view) motions.push(wiggle(slot.view, 0.055, 72));
    await Promise.all(motions);
    await this.glideItemHome(item);
    this.selectedId = null;
    await this.speakLine(this.config.voice.nudge, true);
    if (this.destroyed || this.screen !== 'play' || !this.awaitingInput) return;
    this.inputLocked = false;
    this.layoutField();
    this.scheduleIdlePrompt();
  }

  async glideItemHome(item) {
    if (!item || !item.view) return;
    this.dragLayer.addChild(item.view);
    await this.runTween(to(item.view, {
      x: item.homeX,
      y: item.homeY,
      rotation: 0,
      scale: { x: item.homeScale, y: item.homeScale },
    }, { ms: 280, easing: ease.outCubic }));
    if (item.location === 'tray' && this.pieceLayer) this.pieceLayer.addChild(item.view);
    item.shadow.alpha = 0.16;
    item.motion.rotation = 0;
    item.motion.scale.set(1);
  }

  async acknowledgePlacedNeighbors(centerIndex) {
    const neighbors = this.slots
      .filter((slot) => slot.occupantId && slot.index !== centerIndex)
      .map((slot) => this.findItem(slot.occupantId))
      .filter((item) => item && item.motion);
    await Promise.all(neighbors.map(async (item, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 24);
      await this.runTween(to(item.motion, { scale: { x: 1.035, y: 1.035 } }, { ms: 80, easing: ease.outBack }));
      await this.runTween(to(item.motion, { scale: { x: 1, y: 1 } }, { ms: 100, easing: ease.outQuad }));
    }));
  }

  shouldPraise() {
    if (this.correctPlacements < this.nextPraiseAt) return false;
    const gap = PRAISE_GAPS[this.praiseGapIndex % PRAISE_GAPS.length];
    this.praiseGapIndex += 1;
    this.nextPraiseAt += gap;
    return true;
  }

  async speakNextYum() {
    const yums = this.config.voice.yums;
    if (!yums.length) return;
    const line = yums[this.yumIndex % yums.length];
    this.yumIndex += 1;
    await this.speakLine(line, true);
  }

  async completeRound() {
    this.awaitingInput = false;
    this.inputLocked = true;
    this.selectedId = null;
    this.removeDragListeners();
    this.activeDrag = null;
    this.playSfx('tada');
    const rowItems = this.slots.map((slot) => this.findItem(slot.occupantId)).filter(Boolean);
    await Promise.all([
      ...rowItems.map(async (item, index) => {
        await this.delay(this.reducedMotion() ? 0 : index * 70);
        await this.runTween(to(item.motion, { y: -9, rotation: -0.025 }, { ms: 100, easing: ease.outQuad }));
        await this.runTween(to(item.motion, { y: 0, rotation: 0 }, { ms: 150, easing: ease.outBack }));
      }),
      burst(this.stage.PIXI, this.fxLayer, this.stage.size().w / 2, this.slots[0].homeY, {
        count: 38,
        power: 7,
        life: 780,
      }),
    ]);
    const set = this.roundSets[this.roundIndex];
    await this.speakLine(set && set.say, true);
    await this.delay(this.reducedMotion() ? 100 : 420);
    if (this.destroyed || this.screen !== 'play') return;
    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) await this.finishGame();
    else await this.showRound(next);
  }

  async finishGame() {
    this.clearIdleTimer();
    this.removeDragListeners();
    this.activeDrag = null;
    this.sweepStrayClones();
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.selectedId = null;
    this.targetMap.clear();
    this.playSfx('tada');
    this.disposeStage();
    this.mountEl.innerHTML = `
      <section class="qk-seq qk-seq-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <a class="qk-seq-img-btn qk-seq-home" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-seq-end-center">
          <div class="qk-seq-end-art" aria-hidden="true">${escapeHtml(splashGlyph(this.config.endArt || this.config.splashArt))}</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <button class="qk-seq-again" type="button">
            <span class="qk-seq-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>
    `;
    const again = this.mountEl.querySelector('.qk-seq-again');
    again.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); });
    again.addEventListener('click', () => this.mode ? this.startMode(this.mode.id) : this.renderSplash());
    this.createDomBurst(this.mountEl.querySelector('.qk-seq-end-art'), 32);
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
    this.mountEl.querySelectorAll('.qk-seq-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createDomBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-seq') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burstEl = document.createElement('div');
    burstEl.className = 'qk-seq-burst';
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
    const selected = this.selectedId ? this.findItem(this.selectedId) : null;
    const targets = [];
    for (const slot of this.slots) {
      if (!slot.view) continue;
      const role = selected
        ? (selected.order === slot.index && !slot.occupantId ? 'correct' : 'wrong')
        : 'neutral';
      const target = this.targetRect(slot.targetId, role, slot.view, CARD_SIZE);
      if (target) targets.push(target);
    }
    for (const item of this.items) {
      if (item.location !== 'tray' || !item.view) continue;
      const target = this.targetRect(item.id, 'neutral', item.view, CARD_SIZE);
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
    for (const item of this.items) {
      if (item.location !== 'tray') continue;
      const slot = this.slots[item.order];
      item.location = 'slot';
      slot.occupantId = item.id;
      this.targetMap.delete(item.id);
      if (slot.backing) slot.backing.alpha = 0.2;
      if (item.view) this.slotLayer.addChild(item.view);
    }
    this.layoutPlacedItems();
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

  findItem(itemId) {
    return this.items.find((item) => item.id === itemId);
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

  sweepStrayClones() {
    document.querySelectorAll('.drag-clone').forEach((node) => node.remove());
  }
}

function normalizeConfig(config = {}) {
  const copy = { home: 'Home', replay: 'Hear it again', playAgain: 'Play Again', ...(config.copy || {}) };
  const voice = {
    intro: '',
    nudge: 'Try another spot.',
    cheer: 'You did it!',
    yums: ['Nice!', 'You got it!', 'Yes!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice!')];
  return {
    ...config,
    id: config.id || 'sequence-order',
    title: config.title || 'Put Things in Order',
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || 'emoji:⭐'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    copy,
    voice,
    modes: (config.modes || []).map(normalizeMode).filter((mode) => mode.sets.length),
  };
}

function normalizeMode(mode = {}) {
  const sets = (mode.sets || [])
    .map((set) => ({ ...set, items: (set.items || []).filter((item) => item && item.art) }))
    .filter((set) => set.items.length >= 2);
  return {
    ...mode,
    id: mode.id || 'play',
    title: mode.title || 'Order',
    rounds: Math.min(mode.rounds || sets.length, sets.length),
    prompt: mode.prompt || '',
    slotLabels: Array.isArray(mode.slotLabels) ? mode.slotLabels : null,
    sets,
  };
}

function normalizeArtRef(ref) {
  if (!ref) return 'emoji:⭐';
  if (ref.includes(':')) return ref;
  return `emoji:${ref}`;
}

function splashGlyph(ref) {
  if (!ref) return '⭐';
  if (ref.startsWith('emoji:')) return ref.slice(6);
  if (!ref.includes(':')) return ref;
  if (ref.startsWith('text:')) return ref.slice(5);
  return '⭐';
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function isCorrectOrder(items) {
  return items.every((item, index) => item.order === index);
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function installStyle() {
  if (styleInstalled || document.getElementById('qk-seq-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-seq-style';
  style.textContent = `
    @font-face { font-family:'Fredoka'; src:url('${FONT_URL}') format('woff2'); font-weight:600; font-style:normal; font-display:swap; }
    .qk-seq,.qk-seq * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    .qk-seq {
      --sky:#bee3f5; --navy:#17517e; --blue:#2d7dd2; --green:#58a945; --yellow:#ffd166;
      --coral:#f25f5c; --white:#fff; --shadow:0 6px 0 rgba(23,81,126,.18),0 14px 30px rgba(23,81,126,.18);
      position:relative; width:100%; height:100dvh; min-height:100%; overflow:hidden; color:var(--navy);
      font-family:'Fredoka','Arial Rounded MT Bold','Trebuchet MS',sans-serif; font-weight:600; background-color:var(--sky);
      background-image:radial-gradient(circle at 16% 20%,rgba(255,255,255,.42) 0 8px,transparent 9px),
        radial-gradient(circle at 82% 24%,rgba(255,255,255,.34) 0 12px,transparent 13px),
        radial-gradient(circle at 46% 86%,rgba(255,255,255,.28) 0 9px,transparent 10px);
      background-size:160px 160px,230px 230px,200px 200px; touch-action:manipulation;
      -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; overscroll-behavior:none;
    }
    .qk-seq button,.qk-seq a { font:inherit; color:inherit; touch-action:manipulation; }
    .qk-seq button { border:0; cursor:pointer; }
    .qk-seq button:focus-visible,.qk-seq a:focus-visible { outline:5px solid rgba(45,125,210,.7); outline-offset:4px; }
    .qk-seq-img-btn { display:grid; place-items:center; width:96px; height:96px; border-radius:50%;
      background:transparent center/84px 84px no-repeat; text-decoration:none; box-shadow:none; }
    .qk-seq-img-btn:active { transform:scale(.93); }
    .qk-seq-home { background-image:url('${HOME_IMG}'); }
    .qk-seq-sound { background-image:url('${SOUND_IMG}'); }
    .qk-seq-splash,.qk-seq-end { display:grid; place-items:center; padding:max(18px,env(safe-area-inset-top))
      max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left)); }
    .qk-seq-home { position:absolute; top:max(12px,env(safe-area-inset-top)); left:max(12px,env(safe-area-inset-left)); z-index:5; }
    .qk-seq-splash-center,.qk-seq-end-center { width:min(900px,100%); display:grid; justify-items:center;
      gap:clamp(14px,2.5vmin,24px); text-align:center; padding-top:54px; }
    .qk-seq-splash-art,.qk-seq-end-art { display:grid; place-items:center; width:clamp(150px,26vmin,230px); aspect-ratio:1;
      border-radius:28px; background:linear-gradient(180deg,#fff,#fff3d0); border:5px solid var(--white);
      box-shadow:var(--shadow); font-size:clamp(70px,15vmin,126px); line-height:1; }
    .qk-seq h1 { margin:0; max-width:13ch; color:var(--navy); font-size:clamp(38px,7vmin,78px); line-height:.98;
      text-shadow:0 4px 0 rgba(255,255,255,.72); }
    .qk-seq-mode-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:18px; width:min(760px,100%); margin-top:6px; }
    .qk-seq-mode,.qk-seq-again { min-height:104px; border-radius:26px; border:5px solid var(--white); padding:18px 24px;
      color:var(--white); background:linear-gradient(180deg,rgba(255,255,255,.34),transparent 50%),var(--blue);
      box-shadow:var(--shadow); font-size:clamp(23px,4vmin,36px); line-height:1.05; }
    .qk-seq-mode:nth-child(2n) { background-color:var(--green); }
    .qk-seq-mode:nth-child(3n) { background-color:var(--coral); }
    .qk-seq-mode:active,.qk-seq-again:active { transform:scale(.96); }
    .qk-seq-play { display:grid; grid-template-rows:auto 1fr; min-height:100dvh; padding:max(10px,env(safe-area-inset-top))
      max(12px,env(safe-area-inset-right)) max(112px,calc(100px + env(safe-area-inset-bottom))) max(12px,env(safe-area-inset-left)); }
    .qk-seq-hud { position:relative; z-index:4; display:grid; grid-template-columns:96px 1fr 96px; align-items:center; min-height:100px; }
    .qk-seq-hud .qk-seq-home { position:static; }
    .qk-seq-progress { justify-self:center; display:flex; flex-wrap:wrap; justify-content:center; gap:10px; max-width:min(560px,58vw);
      padding:8px 15px; border-radius:999px; background:rgba(255,255,255,.42); }
    .qk-seq-dot { width:18px; height:18px; border-radius:50%; background:rgba(255,255,255,.88); box-shadow:inset 0 -2px 0 rgba(23,81,126,.12); }
    .qk-seq-dot.is-filled { background:var(--green); }
    .qk-seq-dot.is-current { background:var(--yellow); box-shadow:0 0 0 4px rgba(255,255,255,.72); }
    .qk-seq-stage { min-height:0; position:relative; width:min(1200px,100%); justify-self:center; }
    .qk-seq-canvas { position:absolute; inset:0; overflow:hidden; border-radius:28px; touch-action:none; }
    .qk-seq-canvas canvas { display:block; width:100%; height:100%; touch-action:none; }
    .qk-seq-sound { position:absolute; left:max(12px,env(safe-area-inset-left)); bottom:max(12px,env(safe-area-inset-bottom)); z-index:5; }
    .qk-seq-again { display:inline-flex; align-items:center; justify-content:center; min-width:min(380px,92vw); background-color:var(--green); }
    .qk-seq-play-icon { display:inline-block; width:64px; height:64px; margin-right:10px; background:url('${PLAY_IMG}') center/contain no-repeat; }
    .qk-seq-burst { position:absolute; z-index:9; pointer-events:none; }
    .qk-seq-burst span { position:absolute; width:16px; height:16px; border-radius:5px; background:hsl(var(--hue),80%,58%);
      animation:qk-seq-burst .82s ease-out forwards; animation-delay:var(--delay); }
    @keyframes qk-seq-burst { from { opacity:1; transform:translate(-50%,-50%) scale(.8); }
      to { opacity:0; transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(.2) rotate(220deg); } }
    @media (max-width:620px) {
      .qk-seq-play { padding-left:max(8px,env(safe-area-inset-left)); padding-right:max(8px,env(safe-area-inset-right)); }
      .qk-seq-hud { grid-template-columns:96px 1fr 16px; }
      .qk-seq-progress { max-width:50vw; }
    }
    @media (prefers-reduced-motion:reduce) { .qk-seq * { animation-duration:.01ms !important; transition-duration:.01ms !important; } }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
