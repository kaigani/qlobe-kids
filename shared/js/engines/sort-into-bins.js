// sort-into-bins.js — Stage v2 archetype for "put each thing where it belongs".
//
// DOM owns the splash, HUD, and end screen. Pixi owns the play field: the
// current item, its queue dots, the bins, and every drag/feedback animation.
// The item stream deliberately lives on window so a cancel, blur, resize, or
// scene change can always glide the item home instead of stranding it.

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
const WAIT_FOR_INPUT_MS = 80;
const PRAISE_GAPS = [2, 3];
const MIN_TOUCH = 96;
const ITEM_CARD = 184;
const ITEM_ART = 132;
const BIN_WIDTH = 190;
const BIN_HEIGHT = 158;
const BIN_ART = 82;
const DRAG_SLOP = 8;

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('sort-into-bins requires a mount element');
  installStyle();
  return new SortIntoBinsGame(config, mountEl);
}

class SortIntoBinsGame {
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
    this.queue = [];
    this.currentItem = null;
    this.selected = false;
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
    this.praiseIndex = 0;
    this.motionReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.stage = null;
    this.scene = null;
    this.binLayer = null;
    this.itemLayer = null;
    this.dragLayer = null;
    this.fxLayer = null;
    this.itemView = null;
    this.queueView = null;
    this.binViews = [];
    this.itemHomeX = 0;
    this.itemHomeY = 0;
    this.itemHomeScale = 1;
    this.removeResize = null;
    this.removeStageTick = null;
    this.stageGeneration = 0;
    this.roundGeneration = 0;
    this.itemGeneration = 0;
    this.pendingDelays = new Set();
    this.activeTweens = new Set();
    this.targetMap = new Map();
    this.activeDrag = null;
    this.hoveredBinId = null;
    this.breathTime = 0;

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
      engine: 'sort-into-bins',
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
    this.selected = false;
    this.targetMap.clear();
    speech.stop();

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-sort-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        ${escapeHtml(mode.title || mode.id)}
      </button>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-sort qk-sort-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-sort-img-btn qk-sort-home" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-sort-splash-center">
          <div class="qk-sort-splash-art" aria-hidden="true">${escapeHtml(splashGlyph(this.config.splashArt))}</div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-sort-mode-list">${buttons}</div>
        </div>
      </section>
    `;

    this.applyThemeBackdrop();

    this.mountEl.querySelectorAll('.qk-sort-mode').forEach((button) => {
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
    const section = this.mountEl.querySelector('.qk-sort');
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
    this.roundsTotal = Math.max(1, mode.rounds);
    this.correctPlacements = 0;
    this.nextPraiseAt = PRAISE_GAPS[0];
    this.praiseGapIndex = 0;
    this.praiseIndex = 0;

    this.renderPlayShell();
    const stageReady = await this.createPlayStage();
    if (!stageReady) return;
    await this.showRound(0);
  }

  renderPlayShell() {
    const dots = Array.from({ length: this.roundsTotal }, () => (
      '<span class="qk-sort-dot" aria-hidden="true"></span>'
    )).join('');
    this.mountEl.innerHTML = `
      <section class="qk-sort qk-sort-play" aria-label="${escapeAttr(this.mode.title || this.config.title)}">
        <header class="qk-sort-hud">
          <a class="qk-sort-img-btn qk-sort-home" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
          <div class="qk-sort-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-sort-stage">
          <div class="qk-sort-canvas" aria-label="${escapeAttr(this.mode.prompt || this.mode.title)}"></div>
        </main>
        <button class="qk-sort-img-btn qk-sort-sound" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;
    this.applyThemeBackdrop();
    const home = this.mountEl.querySelector('.qk-sort-home');
    home.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.playSfx('tick'); });
    home.addEventListener('click', () => speech.stop());
    const sound = this.mountEl.querySelector('.qk-sort-sound');
    sound.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.unlockAudio(); });
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-sort-canvas');
    if (!host) return false;
    const generation = ++this.stageGeneration;
    const stage = await createStage(host);
    if (this.destroyed || this.screen !== 'play' || generation !== this.stageGeneration) {
      stage.destroy();
      return false;
    }
    this.stage = stage;
    this.removeResize = stage.onResize(() => this.layoutField());
    this.stageTicker = (ticker) => this.tickStage(ticker.deltaMS || 16.67);
    stage.app.ticker.add(this.stageTicker);
    this.removeStageTick = () => stage.app.ticker.remove(this.stageTicker);
    return true;
  }

  disposeStage() {
    this.stageGeneration += 1;
    this.roundGeneration += 1;
    this.itemGeneration += 1;
    this.removeDragListeners();
    this.activeDrag = null;
    this.cancelTweens();
    this.clearDelays();
    if (this.removeResize) this.removeResize();
    if (this.removeStageTick) this.removeStageTick();
    this.removeResize = null;
    this.removeStageTick = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
    this.binLayer = null;
    this.itemLayer = null;
    this.dragLayer = null;
    this.fxLayer = null;
    this.itemView = null;
    this.queueView = null;
    this.binViews = [];
    this.hoveredBinId = null;
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play' || !this.stage) return;
    this.clearIdleTimer();
    this.removeDragListeners();
    this.activeDrag = null;
    this.cancelTweens();
    this.roundIndex = index;
    this.selected = false;
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.targetMap.clear();
    this.mode.bins.forEach((bin) => { bin.count = 0; });
    this.queue = this.drawRoundItems();
    this.currentItem = this.queue.shift() || null;
    const generation = ++this.roundGeneration;

    this.updateDots();
    this.createRoundScene();
    await this.buildRoundViews(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutField();
    await this.popRoundIn(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    await this.speakRoundStart();
    this.scheduleIdlePrompt();
    await this.delay(WAIT_FOR_INPUT_MS);
  }

  drawRoundItems() {
    const pool = shuffle(this.mode.items.slice(), this.rng);
    const count = Math.min(this.mode.itemsPerRound, pool.length);
    return pool.slice(0, count).map((item, index) => ({
      ...item,
      id: `round-${this.roundIndex}-item-${index}`,
    }));
  }

  createRoundScene() {
    const { PIXI } = this.stage;
    const scene = new PIXI.Container();
    const binLayer = new PIXI.Container();
    const itemLayer = new PIXI.Container();
    const dragLayer = new PIXI.Container();
    const fxLayer = new PIXI.Container();
    scene.addChild(binLayer, itemLayer, dragLayer, fxLayer);
    this.scene = scene;
    this.binLayer = binLayer;
    this.itemLayer = itemLayer;
    this.dragLayer = dragLayer;
    this.fxLayer = fxLayer;
    this.binViews = [];
    this.stage.setScene(scene);
  }

  async buildRoundViews(generation) {
    await Promise.all(this.mode.bins.map((bin, index) => this.buildBinView(bin, index, generation)));
    if (!this.roundIsCurrent(generation)) return;
    await this.buildCurrentItemView(generation);
  }

  async buildBinView(bin, index, generation) {
    const { PIXI } = this.stage;
    // Art-world themes can drop the card chrome entirely (binPanel: 'none'):
    // the bin art (e.g. a real basket sprite) sits directly on the backdrop.
    const bare = this.config.theme && this.config.theme.binPanel === 'none';
    const artSize = bare ? Math.min(BIN_WIDTH, BIN_HEIGHT) * 1.08 : BIN_ART;
    const art = await artObj(PIXI, bin.art, artSize, bin.alt || bin.say || '');
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
    const view = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    const pile = new PIXI.Graphics();
    let backing = null;
    if (bare) {
      shadow.ellipse(0, BIN_HEIGHT / 2 - 8, BIN_WIDTH * 0.4, 15)
        .fill({ color: 0x17517e, alpha: 0.2 });
      motion.addChild(shadow, art, pile);
    } else {
      shadow.roundRect(-BIN_WIDTH / 2, -BIN_HEIGHT / 2 + 8, BIN_WIDTH, BIN_HEIGHT, 28)
        .fill({ color: 0x17517e, alpha: 0.17 });
      backing = cardBacking(PIXI, BIN_WIDTH, BIN_HEIGHT, {
        fill: index % 3 === 0 ? 0xfff8e8 : index % 3 === 1 ? 0xe5f5dc : 0xffe6e2,
        stroke: 0xffffff,
        strokeWidth: 6,
        radius: 28,
      });
      const artHalo = new PIXI.Graphics();
      artHalo.roundRect(-50, -58, 100, 92, 20).fill({ color: 0xffffff, alpha: 0.7 });
      const mouth = new PIXI.Graphics();
      mouth.roundRect(-62, 38, 124, 20, 10).fill({ color: 0x17517e, alpha: 0.22 });
      const lip = new PIXI.Graphics();
      lip.roundRect(-54, 39, 108, 5, 3).fill({ color: 0xffffff, alpha: 0.42 });
      art.y = -13;
      motion.addChild(shadow, backing, artHalo, art, mouth, lip, pile);
    }
    view.addChild(motion);
    view.hitArea = new PIXI.Rectangle(-BIN_WIDTH / 2, -BIN_HEIGHT / 2, BIN_WIDTH, BIN_HEIGHT);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = bin.alt || bin.say || bin.id;
    view.on('pointerdown', (event) => {
      const original = event && event.originalEvent ? event.originalEvent : event;
      if (original && original.preventDefault) original.preventDefault();
      if (original && original.stopPropagation) original.stopPropagation();
      this.unlockAudio();
      this.tapTarget(`bin:${bin.id}`);
    });
    const record = {
      bin,
      index,
      view,
      motion,
      shadow,
      backing,
      pile,
      scale: 1,
      screenLeft: 0,
      screenTop: 0,
      screenRight: 0,
      screenBottom: 0,
      feedbackLocked: true,
      phase: index * 1.8,
    };
    motion.scale.set(0.01);
    this.drawBinPile(record);
    this.binLayer.addChild(view);
    this.binViews[index] = record;
    this.targetMap.set(`bin:${bin.id}`, {
      id: `bin:${bin.id}`,
      type: 'bin',
      bin,
      view,
      action: () => this.handleBinTap(bin.id),
    });
  }

  async buildCurrentItemView(generation) {
    if (!this.currentItem || !this.roundIsCurrent(generation)) {
      this.itemView = null;
      this.drawQueue();
      return;
    }
    const item = this.currentItem;
    const itemGeneration = ++this.itemGeneration;
    const { PIXI } = this.stage;
    const itemArtSize = this.config.theme && this.config.theme.itemPanel === 'none'
      ? Math.round(ITEM_CARD * 0.88)
      : ITEM_ART;
    const art = await artObj(PIXI, item.art, itemArtSize, item.alt || item.say || '');
    if (!this.roundIsCurrent(generation) || itemGeneration !== this.itemGeneration || item !== this.currentItem) {
      art.destroy({ children: true });
      return;
    }
    const view = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    // itemPanel: 'none' — the item sprite floats free over the backdrop
    const bareItem = this.config.theme && this.config.theme.itemPanel === 'none';
    let backing;
    if (bareItem) {
      shadow.ellipse(0, ITEM_CARD / 2 - 16, ITEM_CARD * 0.34, 13)
        .fill({ color: 0x17517e, alpha: 0.2 });
      backing = art; // selection tint lands on the art itself
      motion.addChild(shadow, art);
    } else {
      shadow.roundRect(-ITEM_CARD / 2, -ITEM_CARD / 2 + 9, ITEM_CARD, ITEM_CARD, 32)
        .fill({ color: 0x17517e, alpha: 0.18 });
      backing = cardBacking(PIXI, ITEM_CARD, ITEM_CARD, {
        fill: 0xfff7d9,
        stroke: 0xffffff,
        strokeWidth: 6,
        radius: 32,
      });
      motion.addChild(shadow, backing, art);
    }
    view.addChild(motion);
    view.hitArea = new PIXI.Rectangle(-ITEM_CARD / 2, -ITEM_CARD / 2, ITEM_CARD, ITEM_CARD);
    view.eventMode = 'static';
    view.cursor = 'grab';
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = item.alt || item.say || '';
    view.on('pointerdown', (event) => this.handleItemPointerDown(event));
    view.motion = motion;
    view.shadow = shadow;
    view.backing = backing;
    motion.scale.set(0.01);
    this.itemLayer.addChild(view);
    this.itemView = view;
    this.targetMap.set('item:current', {
      id: 'item:current',
      type: 'item',
      item,
      view,
      action: () => this.selectCurrentItem(),
    });
    this.drawQueue();
  }

  drawQueue() {
    if (!this.stage || !this.itemLayer) return;
    if (this.queueView) {
      this.queueView.removeFromParent();
      this.queueView.destroy({ children: true });
    }
    const { PIXI } = this.stage;
    const view = new PIXI.Container();
    const total = (this.currentItem ? 1 : 0) + this.queue.length;
    const gap = 23;
    for (let i = 0; i < total; i++) {
      const dot = new PIXI.Graphics();
      dot.circle((i - (total - 1) / 2) * gap, 0, i === 0 ? 8 : 6)
        .fill({ color: i === 0 ? 0xffd166 : 0xffffff, alpha: i === 0 ? 1 : 0.82 })
        .stroke({ width: 2, color: 0x17517e, alpha: 0.12 });
      view.addChild(dot);
    }
    this.itemLayer.addChildAt(view, 0);
    this.queueView = view;
  }

  drawBinPile(record) {
    if (!record || !record.pile) return;
    record.pile.clear();
    const count = Math.min(6, record.bin.count || 0);
    for (let i = 0; i < count; i++) {
      const x = (i - (count - 1) / 2) * 15;
      record.pile.circle(x, 52, 7)
        .fill({ color: 0xffd166, alpha: 1 })
        .stroke({ width: 2, color: 0xffffff, alpha: 0.9 });
    }
  }

  async popRoundIn(generation) {
    for (let i = 0; i < this.binViews.length; i++) {
      const record = this.binViews[i];
      await this.delay(this.reducedMotion() ? 0 : i * 55);
      if (!this.roundIsCurrent(generation) || !record) return;
      await this.runTween(popIn(record.motion, 310));
      record.feedbackLocked = false;
    }
    await this.dropCurrentItemIn(generation);
  }

  async dropCurrentItemIn(generation) {
    const view = this.itemView;
    if (!view || !this.roundIsCurrent(generation)) return;
    view.position.set(this.itemHomeX, this.itemHomeY - (this.reducedMotion() ? 0 : 54));
    view.scale.set(this.itemHomeScale);
    await Promise.all([
      this.runTween(popIn(view.motion, 340)),
      this.runTween(to(view, { y: this.itemHomeY }, { ms: 390, easing: ease.outBack })),
    ]);
    if (view === this.itemView) this.refreshSelection();
  }

  layoutField() {
    if (!this.stage || !this.scene) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;
    const pad = Math.max(10, Math.min(22, Math.min(w, h) * 0.028));
    const count = Math.max(1, this.binViews.length);
    const columns = w < 430 && count > 2 ? 2 : count;
    const rows = Math.ceil(count / columns);
    const gap = Math.max(10, Math.min(24, w * 0.022));
    const availableW = w - pad * 2 - gap * (columns - 1);
    const maxBinW = availableW / columns;
    const maxBinH = Math.max(MIN_TOUCH, Math.min(h * 0.38, 190) / rows - gap * (rows - 1) / rows);
    const minBinScale = Math.max(MIN_TOUCH / BIN_WIDTH, MIN_TOUCH / BIN_HEIGHT);
    const binScale = Math.max(minBinScale, Math.min(1.08, maxBinW / BIN_WIDTH, maxBinH / BIN_HEIGHT));
    const binW = BIN_WIDTH * binScale;
    const binH = BIN_HEIGHT * binScale;
    const totalW = columns * binW + (columns - 1) * gap;
    const totalH = rows * binH + (rows - 1) * gap;
    const firstY = h - pad - totalH + binH / 2;

    this.binViews.forEach((record, index) => {
      if (!record || !record.view) return;
      const row = Math.floor(index / columns);
      const col = index % columns;
      const rowCount = Math.min(columns, count - row * columns);
      const rowWidth = rowCount * binW + (rowCount - 1) * gap;
      const rowFirstX = (w - rowWidth) / 2 + binW / 2;
      record.scale = binScale;
      record.view.position.set(rowFirstX + col * (binW + gap), firstY + row * (binH + gap));
      record.view.scale.set(binScale);
    });

    const itemAreaBottom = Math.max(pad + MIN_TOUCH, h - pad - totalH - pad);
    const availableItemH = Math.max(MIN_TOUCH, itemAreaBottom - pad - 34);
    const itemScale = Math.max(MIN_TOUCH / ITEM_CARD, Math.min(1.1, (w - pad * 2) / ITEM_CARD, availableItemH / ITEM_CARD));
    this.itemHomeX = w / 2;
    this.itemHomeY = pad + availableItemH / 2 + 22;
    this.itemHomeScale = itemScale;
    if (this.itemView && !(this.activeDrag && this.activeDrag.moved)) {
      this.itemView.position.set(this.itemHomeX, this.itemHomeY);
      this.itemView.scale.set(itemScale);
    }
    if (this.queueView) this.queueView.position.set(this.itemHomeX, Math.max(12, this.itemHomeY - ITEM_CARD * itemScale / 2 - 18));

    this.cacheBinScreenRects();
    if (this.activeDrag) {
      this.clientToStage(this.activeDrag.lastX, this.activeDrag.lastY, this.activeDrag);
      if (!this.activeDrag.moved && this.itemView) this.itemView.position.set(this.itemHomeX, this.itemHomeY);
      this.updateHoveredBin(this.binIdFromPoint(this.activeDrag.lastX, this.activeDrag.lastY));
    }
    this.refreshSelection();
  }

  cacheBinScreenRects() {
    for (const record of this.binViews) {
      if (!record || !record.view) continue;
      const target = this.targetRect('', 'neutral', record.view, BIN_WIDTH, BIN_HEIGHT);
      if (!target) continue;
      record.screenLeft = target.rect.x;
      record.screenTop = target.rect.y;
      record.screenRight = target.rect.x + target.rect.w;
      record.screenBottom = target.rect.y + target.rect.h;
    }
  }

  handleItemPointerDown(event) {
    const original = event && event.originalEvent ? event.originalEvent : event;
    if (this.destroyed || !this.awaitingInput || this.inputLocked || this.activeDrag) return;
    if (original && original.isPrimary === false) return;
    if (!this.currentItem || !this.itemView) return;
    if (original && original.preventDefault) original.preventDefault();
    if (original && original.stopPropagation) original.stopPropagation();
    this.unlockAudio();
    const selected = this.selectCurrentItem();
    if (!selected.accepted) return;
    const clientX = original && Number.isFinite(original.clientX) ? original.clientX : 0;
    const clientY = original && Number.isFinite(original.clientY) ? original.clientY : 0;
    this.activeDrag = {
      pointerId: original ? original.pointerId : null,
      item: this.currentItem,
      view: this.itemView,
      startX: clientX,
      startY: clientY,
      lastX: clientX,
      lastY: clientY,
      desiredX: this.itemView.x,
      desiredY: this.itemView.y,
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
      this.dragLayer.addChild(drag.view);
      drag.view.cursor = 'grabbing';
      drag.view.shadow.alpha = 0.3;
      drag.view.motion.y = 0;
      drag.view.scale.set(this.itemHomeScale * 1.12);
    }
    if (drag.moved) {
      this.clientToStage(e.clientX, e.clientY, drag);
      this.updateHoveredBin(this.binIdFromPoint(e.clientX, e.clientY));
    }
  }

  tickStage(deltaMS) {
    const drag = this.activeDrag;
    if (drag && drag.moved && !drag.settling && drag.view) {
      if (this.reducedMotion()) {
        drag.view.position.set(drag.desiredX, drag.desiredY);
        drag.view.rotation = 0;
      } else {
        const dx = drag.desiredX - drag.view.x;
        const dy = drag.desiredY - drag.view.y;
        drag.view.x += dx * 0.34;
        drag.view.y += dy * 0.34;
        drag.view.rotation += (clamp(dx * 0.0025, -0.12, 0.12) - drag.view.rotation) * 0.22;
      }
    }
    if (this.reducedMotion()) return;
    this.breathTime += deltaMS * 0.001;
    for (const record of this.binViews) {
      if (!record || !record.motion || record.feedbackLocked) continue;
      const target = record.bin.id === this.hoveredBinId
        ? 1.05
        : 1 + Math.sin(this.breathTime * 1.55 + record.phase) * 0.007;
      const current = record.motion.scale.x;
      const next = current + (target - current) * (record.bin.id === this.hoveredBinId ? 0.2 : 0.06);
      record.motion.scale.set(next);
    }
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
      drag.view.cursor = 'grab';
      this.activeDrag = null;
      return;
    }
    drag.settling = true;
    this.clientToStage(e.clientX, e.clientY, drag);
    drag.view.position.set(drag.desiredX, drag.desiredY);
    const binId = this.binIdFromPoint(e.clientX, e.clientY);
    this.updateHoveredBin(null);
    try {
      if (!binId) {
        await this.glideItemHome(drag.view);
        this.playSfx('unpop');
      }
      else await this.attemptSort(binId);
    } catch {
      await this.glideItemHome(drag.view);
      this.playSfx('unpop');
      this.inputLocked = false;
    } finally {
      if (drag.view) drag.view.cursor = 'grab';
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
    this.updateHoveredBin(null);
    if (drag.moved) await this.glideItemHome(drag.view);
    this.playSfx('unpop');
    if (drag.view) drag.view.cursor = 'grab';
    if (this.activeDrag === drag) this.activeDrag = null;
  }

  removeDragListeners() {
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowCancel);
  }

  binIdFromPoint(clientX, clientY) {
    let nearest = null;
    let nearestDistance = Infinity;
    for (const record of this.binViews) {
      if (!record) continue;
      if (clientX < record.screenLeft || clientX > record.screenRight
        || clientY < record.screenTop || clientY > record.screenBottom) continue;
      const centerX = (record.screenLeft + record.screenRight) / 2;
      const centerY = (record.screenTop + record.screenBottom) / 2;
      const distance = Math.abs(clientX - centerX) + Math.abs(clientY - centerY);
      if (distance < nearestDistance) {
        nearest = record.bin.id;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  updateHoveredBin(binId) {
    if (this.hoveredBinId === binId) return;
    this.hoveredBinId = binId;
  }

  selectCurrentItem() {
    if (!this.currentItem || !this.awaitingInput || this.inputLocked || !this.itemView) {
      return { accepted: false };
    }
    this.selected = true;
    this.playSfx('pop');
    this.refreshSelection();
    this.speakItem();
    return { accepted: true };
  }

  refreshSelection() {
    if (!this.itemView || !this.itemView.motion || (this.activeDrag && this.activeDrag.moved)) return;
    this.itemView.backing.tint = this.selected ? 0xffefae : 0xffffff;
    this.itemView.motion.y = this.selected ? -5 : 0;
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed) return { accepted: false };
    return target.action();
  }

  async handleBinTap(binId) {
    if (!this.awaitingInput || this.inputLocked) {
      await this.speakBin(binId);
      return { accepted: false };
    }
    if (!this.selected) {
      await this.speakBin(binId);
      return { accepted: false };
    }
    return this.attemptSort(binId);
  }

  async attemptSort(binId) {
    const bin = this.findBin(binId);
    const item = this.currentItem;
    if (!item || !bin || !this.awaitingInput || this.inputLocked || !this.itemView) {
      return { accepted: false };
    }
    this.clearIdleTimer();
    this.inputLocked = true;
    if (item.bin === bin.id) {
      await this.handleCorrectSort(item, bin);
      return { accepted: true };
    }
    await this.handleWrongSort(item, bin);
    return { accepted: true };
  }

  async handleCorrectSort(item, bin) {
    const view = this.itemView;
    const record = this.binRecord(bin.id);
    if (!view || !record) return;
    this.playSfx('pop');
    this.playSfx('sparkle');
    this.selected = false;
    bin.count += 1;
    this.correctPlacements += 1;
    this.targetMap.delete('item:current');
    record.feedbackLocked = true;
    this.dragLayer.addChild(view);
    const mouth = record.view.toGlobal(new this.stage.PIXI.Point(0, 48));
    const startScale = view.scale.x;
    view.motion.y = 0;
    view.rotation = 0;
    await Promise.all([
      this.runTween(to(view, {
        x: mouth.x,
        y: mouth.y,
        rotation: 0,
        scale: { x: Math.max(0.08, startScale * 0.14), y: Math.max(0.08, startScale * 0.14) },
      }, { ms: 300, easing: ease.outCubic })),
      this.happyBin(record),
      sparkle(this.stage.PIXI, this.fxLayer, mouth.x, mouth.y),
    ]);
    if (view === this.itemView) {
      view.removeFromParent();
      view.destroy({ children: true });
      this.itemView = null;
    }
    this.drawBinPile(record);
    record.feedbackLocked = false;
    record.motion.scale.set(1);
    this.currentItem = this.queue.shift() || null;
    this.drawQueue();

    if (this.currentItem) {
      const generation = this.roundGeneration;
      await this.buildCurrentItemView(generation);
      if (!this.roundIsCurrent(generation)) return;
      this.layoutField();
      await this.dropCurrentItemIn(generation);
      if (this.shouldPraise()) await this.speakNextPraise();
      if (!this.roundIsCurrent(generation)) return;
      this.inputLocked = false;
      await this.speakItem();
      this.scheduleIdlePrompt();
    } else {
      await this.completeRound();
    }
  }

  async happyBin(record) {
    if (!record || !record.motion) return;
    await this.runTween(to(record.motion, { scale: { x: 1.1, y: 0.91 } }, { ms: 120, easing: ease.outQuad }));
    await this.runTween(to(record.motion, { scale: { x: 0.96, y: 1.09 } }, { ms: 135, easing: ease.outBack }));
    await this.runTween(to(record.motion, { scale: { x: 1, y: 1 } }, { ms: 150, easing: ease.outElastic }));
  }

  async handleWrongSort(item, bin) {
    const view = this.itemView;
    const record = this.binRecord(bin.id);
    if (!view) return;
    this.playSfx('boing');
    if (record) record.feedbackLocked = true;
    const motions = [wiggle(view.motion, 0.07, 75)];
    if (record) motions.push(wiggle(record.motion, 0.065, 72));
    await Promise.all(motions);
    await this.glideItemHome(view);
    if (record) {
      record.feedbackLocked = false;
      record.motion.scale.set(1);
    }
    this.selected = false;
    this.refreshSelection();
    await this.speakLine(this.config.voice.nudge, true);
    await this.speakItem(true);
    if (this.destroyed || this.screen !== 'play' || !this.awaitingInput) return;
    this.inputLocked = false;
    this.scheduleIdlePrompt();
  }

  async glideItemHome(view) {
    if (!view || !this.dragLayer) return;
    this.dragLayer.addChild(view);
    view.motion.y = 0;
    await this.runTween(to(view, {
      x: this.itemHomeX,
      y: this.itemHomeY,
      rotation: 0,
      scale: { x: this.itemHomeScale, y: this.itemHomeScale },
    }, { ms: 280, easing: ease.outCubic }));
    if (view === this.itemView && this.itemLayer) this.itemLayer.addChild(view);
    view.shadow.alpha = 0.18;
    view.motion.rotation = 0;
    view.motion.scale.set(1);
    this.refreshSelection();
  }

  shouldPraise() {
    if (this.correctPlacements < this.nextPraiseAt) return false;
    const gap = PRAISE_GAPS[this.praiseGapIndex % PRAISE_GAPS.length];
    this.praiseGapIndex += 1;
    this.nextPraiseAt += gap;
    return true;
  }

  async speakNextPraise() {
    const praises = this.config.voice.yums;
    if (!praises.length) return;
    const line = praises[this.praiseIndex % praises.length];
    this.praiseIndex += 1;
    await this.speakLine(line, true);
  }

  async completeRound() {
    this.awaitingInput = false;
    this.inputLocked = true;
    this.selected = false;
    this.removeDragListeners();
    this.activeDrag = null;
    this.updateHoveredBin(null);
    this.playSfx('sparkle');
    const { w, h } = this.stage.size();
    const bounces = this.binViews.map(async (record, index) => {
      if (!record) return;
      record.feedbackLocked = true;
      await this.delay(this.reducedMotion() ? 0 : index * 45);
      await this.runTween(to(record.motion, { y: -10, scale: { x: 1.06, y: 0.96 } }, { ms: 140, easing: ease.outBack }));
      await this.runTween(to(record.motion, { y: 0, scale: { x: 1, y: 1 } }, { ms: 190, easing: ease.outElastic }));
      record.feedbackLocked = false;
    });
    await Promise.all([
      ...bounces,
      burst(this.stage.PIXI, this.fxLayer, w / 2, h * 0.54, { count: 38, power: 7, life: 780 }),
    ]);
    await this.speakLine(this.mode.roundCheer || this.config.voice.roundCheer, true);
    await this.delay(this.reducedMotion() ? 100 : 520);
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
    this.selected = false;
    this.targetMap.clear();
    this.playSfx('tada');
    this.disposeStage();
    this.mountEl.innerHTML = `
      <section class="qk-sort qk-sort-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <a class="qk-sort-img-btn qk-sort-home" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-sort-end-center">
          <div class="qk-sort-end-art" aria-hidden="true">${escapeHtml(splashGlyph(this.config.endArt || this.config.splashArt))}</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <button class="qk-sort-again" type="button">
            <span class="qk-sort-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>
    `;
    const again = this.mountEl.querySelector('.qk-sort-again');
    again.addEventListener('pointerdown', (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); });
    again.addEventListener('click', () => this.mode ? this.startMode(this.mode.id) : this.renderSplash());
    this.createDomBurst(this.mountEl.querySelector('.qk-sort-end-art'), 34);
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
    await this.speakItem(true);
    this.scheduleIdlePrompt();
  }

  async speakRoundStart() {
    await this.speakLine(this.mode.prompt || this.config.voice.intro, true);
    await this.speakItem(true);
  }

  async speakItem(cancel = false) {
    if (!this.currentItem) return;
    await this.speakLine(this.currentItem.say || this.currentItem.alt, cancel);
  }

  async speakBin(binId) {
    const bin = this.findBin(binId);
    if (!bin) return;
    this.playSfx('tick');
    await this.speakLine(bin.say || bin.alt || bin.id, true);
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

  updateDots() {
    this.mountEl.querySelectorAll('.qk-sort-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createDomBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-sort') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burstEl = document.createElement('div');
    burstEl.className = 'qk-sort-burst';
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
    const targets = [];
    if (this.itemView && this.currentItem) {
      const target = this.targetRect('item:current', 'neutral', this.itemView, ITEM_CARD, ITEM_CARD);
      if (target) targets.push(target);
    }
    for (const record of this.binViews) {
      if (!record || !record.view) continue;
      const role = this.currentItem && this.currentItem.bin === record.bin.id ? 'correct' : 'wrong';
      const target = this.targetRect(`bin:${record.bin.id}`, role, record.view, BIN_WIDTH, BIN_HEIGHT);
      if (target) targets.push(target);
    }
    return targets;
  }

  targetRect(id, role, view, localWidth, localHeight) {
    const halfW = localWidth / 2;
    const halfH = localHeight / 2;
    const points = [
      this.screenPointFor(view, -halfW, -halfH),
      this.screenPointFor(view, halfW, -halfH),
      this.screenPointFor(view, halfW, halfH),
      this.screenPointFor(view, -halfW, halfH),
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
    this.selected = false;
    while (this.currentItem) {
      const bin = this.findBin(this.currentItem.bin);
      if (bin) bin.count += 1;
      this.correctPlacements += 1;
      this.currentItem = this.queue.shift() || null;
    }
    this.targetMap.delete('item:current');
    if (this.itemView) {
      this.itemView.removeFromParent();
      this.itemView.destroy({ children: true });
      this.itemView = null;
    }
    this.binViews.forEach((record) => this.drawBinPile(record));
    this.drawQueue();
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

  findBin(binId) {
    return this.mode && this.mode.bins.find((bin) => bin.id === binId);
  }

  binRecord(binId) {
    return this.binViews.find((record) => record && record.bin.id === binId);
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
  const copy = {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
    ...(config.copy || {}),
  };
  const voice = {
    intro: config.prompt || '',
    nudge: 'Almost. Try another basket.',
    roundCheer: 'All sorted!',
    cheer: 'Hooray! You sorted them all!',
    yums: ['Nice sorting!', 'That belongs there!', 'You found the basket!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice!')];
  const modes = Array.isArray(config.modes) && config.modes.length ? config.modes : [config];
  return {
    ...config,
    id: config.id || 'sort-into-bins',
    title: config.title || 'Sort Into Bins',
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || firstBinArt(modes) || 'emoji:🧺'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    copy,
    voice,
    modes: modes.map((mode) => normalizeMode(mode, voice)).filter((mode) => mode.bins.length >= 2 && mode.items.length),
  };
}

function normalizeMode(mode = {}, voice) {
  const bins = (mode.bins || [])
    .filter((bin) => bin && bin.id && bin.art)
    .slice(0, 3)
    .map((bin) => ({ ...bin, id: String(bin.id), art: normalizeArtRef(bin.art), count: 0 }));
  const binIds = new Set(bins.map((bin) => bin.id));
  const items = (mode.items || [])
    .filter((item) => item && item.art && binIds.has(String(item.bin)))
    .map((item) => ({ ...item, art: normalizeArtRef(item.art), bin: String(item.bin) }));
  return {
    ...mode,
    id: mode.id || 'play',
    title: mode.title || 'Sort',
    rounds: Math.max(1, Number(mode.rounds) || 1),
    prompt: mode.prompt || voice.intro || 'Where does it go?',
    itemsPerRound: Math.max(1, Math.min(Number(mode.itemsPerRound) || 4, items.length || 1)),
    bins,
    items,
  };
}

function firstBinArt(modes) {
  for (const mode of modes) {
    if (mode && mode.bins && mode.bins[0] && mode.bins[0].art) return mode.bins[0].art;
  }
  return null;
}

function normalizeArtRef(ref) {
  if (!ref) return 'emoji:🧺';
  if (ref.includes(':')) return ref;
  return `emoji:${ref}`;
}

function splashGlyph(ref) {
  if (!ref) return '🧺';
  if (ref.startsWith('emoji:')) return ref.slice(6);
  if (ref.startsWith('text:')) return ref.slice(5);
  if (ref.startsWith('swatch:')) return '🎨';
  return '🧺';
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
  if (styleInstalled || document.getElementById('qk-sort-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-sort-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    .qk-sort,.qk-sort * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-sort {
      --sky: #bee3f5; --navy: #17517e; --blue: #2d7dd2; --green: #58a945;
      --yellow: #ffd166; --coral: #f25f5c; --white: #ffffff;
      --shadow: 0 6px 0 rgba(23,81,126,.18),0 14px 30px rgba(23,81,126,.18);
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
    .qk-sort button,.qk-sort a { font: inherit; color: inherit; touch-action: manipulation; }
    .qk-sort button { border: 0; cursor: pointer; }
    .qk-sort button:focus-visible,.qk-sort a:focus-visible { outline: 5px solid rgba(45,125,210,.7); outline-offset: 4px; }
    .qk-sort-img-btn { display: grid; place-items: center; width: 96px; height: 96px; border-radius: 50%;
      background: transparent center/84px 84px no-repeat; text-decoration: none; box-shadow: none; }
    .qk-sort-img-btn:active { transform: scale(.93); }
    .qk-sort-home { background-image: url('${HOME_IMG}'); }
    .qk-sort-sound { background-image: url('${SOUND_IMG}'); }
    .qk-sort-splash,.qk-sort-end { display: grid; place-items: center;
      padding: max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right))
        max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left)); }
    .qk-sort-home { position: absolute; top: max(12px,env(safe-area-inset-top)); left: max(12px,env(safe-area-inset-left)); z-index: 5; }
    .qk-sort-splash-center,.qk-sort-end-center { width: min(900px,100%); display: grid; justify-items: center;
      gap: clamp(14px,2.5vmin,24px); text-align: center; padding-top: 54px; }
    .qk-sort-splash-art,.qk-sort-end-art { display: grid; place-items: center; width: clamp(150px,26vmin,230px);
      aspect-ratio: 1; border-radius: 28px; background: linear-gradient(180deg,#fff,#fff3d0);
      border: 5px solid var(--white); box-shadow: var(--shadow); font-size: clamp(70px,15vmin,126px); line-height: 1; }
    .qk-sort h1 { margin: 0; max-width: 13ch; color: var(--navy); font-size: clamp(38px,7vmin,78px);
      line-height: .98; text-shadow: 0 4px 0 rgba(255,255,255,.72); }
    .qk-sort-mode-list { display: grid; grid-template-columns: repeat(auto-fit,minmax(210px,1fr)); gap: 18px;
      width: min(760px,100%); margin-top: 6px; }
    .qk-sort-mode,.qk-sort-again { min-height: 104px; border-radius: 26px; border: 5px solid var(--white);
      padding: 18px 24px; color: var(--white); background: linear-gradient(180deg,rgba(255,255,255,.34),transparent 50%),var(--blue);
      box-shadow: var(--shadow); font-size: clamp(23px,4vmin,36px); line-height: 1.05; }
    .qk-sort-mode:nth-child(2n) { background-color: var(--green); }
    .qk-sort-mode:nth-child(3n) { background-color: var(--coral); }
    .qk-sort-mode:active,.qk-sort-again:active { transform: scale(.96); }
    .qk-sort-play { display: grid; grid-template-rows: auto 1fr; min-height: 100dvh;
      padding: max(10px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right))
        max(112px,calc(100px + env(safe-area-inset-bottom))) max(12px,env(safe-area-inset-left)); }
    .qk-sort-hud { position: relative; z-index: 4; display: grid; grid-template-columns: 96px 1fr 96px;
      align-items: center; min-height: 100px; }
    .qk-sort-hud .qk-sort-home { position: static; }
    .qk-sort-progress { justify-self: center; display: flex; flex-wrap: wrap; justify-content: center; gap: 10px;
      max-width: min(560px,58vw); padding: 8px 15px; border-radius: 999px; background: rgba(255,255,255,.42); }
    .qk-sort-dot { width: 18px; height: 18px; border-radius: 50%; background: rgba(255,255,255,.88);
      box-shadow: inset 0 -2px 0 rgba(23,81,126,.12); }
    .qk-sort-dot.is-filled { background: var(--green); }
    .qk-sort-dot.is-current { background: var(--yellow); box-shadow: 0 0 0 4px rgba(255,255,255,.72); }
    .qk-sort-stage { min-height: 0; position: relative; width: min(1200px,100%); justify-self: center; }
    .qk-sort-canvas { position: absolute; inset: 0; overflow: hidden; border-radius: 28px; touch-action: none; }
    .qk-sort-canvas canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .qk-sort-sound { position: absolute; left: max(12px,env(safe-area-inset-left)); bottom: max(12px,env(safe-area-inset-bottom)); z-index: 5; }
    .qk-sort-again { display: inline-flex; align-items: center; justify-content: center; min-width: min(380px,92vw); background-color: var(--green); }
    .qk-sort-play-icon { display: inline-block; width: 64px; height: 64px; margin-right: 10px;
      background: url('${PLAY_IMG}') center/contain no-repeat; }
    .qk-sort-burst { position: absolute; z-index: 9; pointer-events: none; }
    .qk-sort-burst span { position: absolute; width: 16px; height: 16px; border-radius: 5px;
      background: hsl(var(--hue),80%,58%); animation: qk-sort-burst .82s ease-out forwards; animation-delay: var(--delay); }
    @keyframes qk-sort-burst { from { opacity: 1; transform: translate(-50%,-50%) scale(.8); }
      to { opacity: 0; transform: translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(.2) rotate(220deg); } }
    @media (max-width: 620px) {
      .qk-sort-play { padding-left: max(8px,env(safe-area-inset-left)); padding-right: max(8px,env(safe-area-inset-right)); }
      .qk-sort-hud { grid-template-columns: 96px 1fr 16px; }
      .qk-sort-progress { max-width: 50vw; }
    }
    @media (prefers-reduced-motion: reduce) {
      .qk-sort * { animation-duration: .01ms !important; transition-duration: .01ms !important; }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
