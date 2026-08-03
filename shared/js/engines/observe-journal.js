// observe-journal.js — Stage v2 archetype for "look, think, record".
// DOM owns the familiar splash/HUD/recap chrome. Pixi owns the live journal:
// the thing being observed, the open-ended sticker choices, and every stamp.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { onTap } from '../tap.js';
import { mulberry32 } from '../rng.js';
import { escapeHtml, escapeAttr } from '../dom.js';
import { createTimers } from '../timers.js';
import { installDebug } from '../debug-harness.js';
import { createScreens, wireEndScreen } from '../screens.js';
import { renderModeCards } from '../mode-select.js';
import { installEngineStyles } from './engine-styles.js';
import { createStage } from '../stage/stage.js';
import { to, ease, popIn, sway } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';
import { artEl } from './art.js';

const HOME_HREF = '../../';
const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const PAGE_W = 700;
const PAGE_H = 360;
const STICKER_SIZE = 138;
const STAMP_SIZE = 92;
const SCENE_CARD_SIZE = 154;
const STICKER_COLORS = [0xfff8e8, 0xe9fff1, 0xfff0e6, 0xeef1ff, 0xfff6cf];

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('observe-journal requires a mount element');
  installStyle();
  return new ObserveJournalGame(config, mountEl);
}

class ObserveJournalGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config || {});
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    // The engine keeps its own delay registry (clearDelays() RESOLVES pending
    // waits so an awaiting flow finishes instead of stalling -- timers.js
    // clearAll() deliberately does the opposite). The group is here purely as
    // the scale holder `fastTimers()` turns, read back through `timers.ms()`.
    this.timers = createTimers();

    // The screen router owns "which screen is live" — this.screen is a getter
    // over it, never a second copy of the fact (docs/shared-platform-refactor.md §4a).
    this.screens = null;
    this.mode = null;
    this.pages = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.promptIndex = 0;
    this.currentPage = null;
    this.currentPrompt = null;
    this.stamps = [];
    this.journal = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    this.muted = false;
    this.destroyed = false;
    this.seeded = false;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.targetMap = new Map();
    this.timerIds = new Set();
    this.rng = Math.random;

    this.stage = null;
    this.scene = null;
    this.pageView = null;
    this.sceneView = null;
    this.stickerViews = [];
    this.removeResize = null;
    this.stopSceneSway = null;
    this.stageGeneration = 0;
    this.roundGeneration = 0;
    this.promptGeneration = 0;
    this.activeTweens = new Set();
    this.pendingDelays = new Set();

    this.onFirstPointer = () => this.unlockAudio();
    this.preventGesture = (e) => e.preventDefault();
    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('gesturestart', this.preventGesture);
    window.addEventListener('contextmenu', this.preventGesture);

    this.ready = Promise.resolve();
    this.buildShell();

    // delegated back-button handling: play/end screens rebuild innerHTML, so the
    // listener lives on the mount and survives every screen swap. Delegating a
    // tap means checking BOTH ends of the press — the mount also covers the
    // gameplay surface, and releasing over the button after a press that
    // started elsewhere is not a back tap.
    this.backDownEl = null;
    this.removeBackTap = onTap(this.mountEl, (event) => {
      const el = backButtonFor(event.target);
      const startedOn = this.backDownEl;
      this.backDownEl = null;
      // a keyboard/AT click has no preceding pointerdown, so it only checks the target
      if (!el || (event.type !== 'click' && el !== startedOn)) return;
      speech.stop();
      this.renderSplash();
    }, {
      feedback: (event) => {
        this.backDownEl = backButtonFor(event.target);
      },
    });
    this.renderSplash();
    this.installDebug();
  }

  /** @returns {'splash'|'play'|'end'} the live screen, straight from the router */
  get screen() {
    return this.screens ? this.screens.current : 'splash';
  }

  /**
   * The three screens, built once and toggled by the router, instead of one
   * mount whose innerHTML is thrown away on every transition. Each section
   * keeps the exact class list it rendered with before, plus the shared
   * `qk-eng-*` vocabulary from shared/css/engine-base.css. The reset lives on
   * the mount itself (`qk-observe-root`/`qk-eng-root`) — this engine has always
   * split the reset host from the painted surface (`.qk-observe`), which every
   * section below carries alongside its own identity class.
   */
  buildShell() {
    this.mountEl.classList.add('qk-observe-root', 'qk-eng-root');
    this.mountEl.innerHTML = `
      <section class="qk-observe qk-observe-splash qk-eng-surface qk-eng-page" aria-label="${escapeAttr(this.config.title)}"></section>
      <section class="qk-observe qk-observe-play qk-eng-surface qk-eng-play" hidden></section>
      <section class="qk-observe qk-observe-end qk-eng-surface qk-eng-page" hidden></section>
    `;
    this.screens = createScreens({
      root: this.mountEl,
      screens: {
        splash: this.mountEl.querySelector('.qk-observe-splash'),
        play: this.mountEl.querySelector('.qk-observe-play'),
        end: this.mountEl.querySelector('.qk-observe-end'),
      },
      initial: 'splash',
      voice: { stop: () => speech.stop() },
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimers();
    this.disposeStage();
    speech.stop();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('gesturestart', this.preventGesture);
    window.removeEventListener('contextmenu', this.preventGesture);
    // the mount outlives this instance — leaving the delegated tap on it would let
    // a destroyed game answer the next one's back button
    if (this.removeBackTap) { this.removeBackTap(); this.removeBackTap = null; }
    if (this.screens) { this.screens.destroy(); this.screens = null; }
    this.targetMap.clear();
    this.mountEl.replaceChildren();
    if (this.disposeDebug) { this.disposeDebug(); this.disposeDebug = null; }
  }

  unlockAudio() {
    sfx.unlock();
    speech.unlock();
  }

  installDebug() {
    this.disposeDebug = installDebug({
      gameId: this.config.id,
      engine: 'observe-journal',
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

  // Splash and HUD are intentionally DOM: they stay crisp, semantic, and
  // identical to the other Stage v2 engines while the canvas can be replaced.
  renderSplash() {
    this.clearTimers();
    this.disposeStage();
    speech.stop();
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();

    const splash = this.screens.el('splash');
    // show() is IDEMPOTENT: re-entering the splash we are already on would not
    // run its bag, so release it by hand before the markup underneath changes.
    this.screens.release('splash');
    this.screens.show('splash');
    splash.innerHTML = `
      <a class="qk-observe-home qk-observe-img-btn qk-eng-img-btn qk-eng-ico-home qk-eng-corner-tl" href="${HOME_HREF}" aria-label="${escapeAttr(this.config.copy.home)}"></a>
      <div class="qk-observe-splash-center qk-eng-center">
        <div class="qk-observe-splash-art qk-eng-card" aria-hidden="true"></div>
        <h1 class="qk-eng-title">${escapeHtml(this.config.title)}</h1>
        <div class="qk-observe-mode-list qk-eng-mode-list"></div>
      </div>
    `;
    this.applyThemeBackdrop(splash);
    splash.querySelector('.qk-observe-splash-art').appendChild(
      artEl(this.config.splashArt, this.config.title),
    );

    const picker = renderModeCards({
      host: splash.querySelector('.qk-observe-mode-list'),
      modes: this.config.modes,
      // The engine paints its own cards (engine-base.css `.qk-eng-mode`), so the
      // screens.css card skin stays off — `skin: false` is what keeps every pixel.
      skin: false,
      cardClass: 'qk-observe-mode qk-eng-mode',
      feedback: (e) => {
        e.preventDefault();
        e.stopPropagation();
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
    const homeLink = splash.querySelector('a.qk-observe-home');
    if (homeLink) this.screens.hold(() => homeLink.remove());
    this.screens.hold(picker.dispose);
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;
    const mode = this.config.modes.find((item) => item.id === modeId) || this.config.modes[0];
    if (!mode) return;

    // The double-tap latch: a second card press while the first start is still
    // in flight is swallowed rather than running the whole teardown+render twice.
    return this.screens.start(() => this.runMode(mode));
  }

  async runMode(mode) {
    this.clearTimers();
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.roundIndex = 0;
    this.promptIndex = 0;
    this.journal = [];
    this.stamps = [];
    this.inputLocked = false;
    this.pages = mode.pages.slice(0, Math.min(mode.rounds || mode.pages.length, mode.pages.length));
    this.roundsTotal = this.pages.length;

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
    const dots = Array.from({ length: this.roundsTotal }, (_, index) =>
      `<span class="qk-observe-dot qk-eng-dot-ring" data-dot="${index}" aria-hidden="true"></span>`).join('');

    const play = this.screens.el('play');
    // Restarting a mode from the play screen re-renders in place, and show() is
    // idempotent — release the live tap handlers before the DOM under them goes.
    this.screens.release('play');
    play.setAttribute('aria-label', this.mode.title);
    play.innerHTML = `
      <header class="qk-observe-hud qk-eng-hud">
        <button class="qk-observe-back qk-observe-img-btn qk-eng-img-btn qk-eng-ico-back qk-eng-corner-tl" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-observe-dots" aria-hidden="true">${dots}</div>
      </header>
      <main class="qk-observe-stage qk-eng-stage">
        <div class="qk-observe-canvas qk-eng-canvas" aria-label="${escapeAttr(this.mode.title)}"></div>
        <div class="qk-observe-live" aria-live="polite"></div>
      </main>
      <button class="qk-observe-sound qk-observe-img-btn qk-eng-img-btn qk-eng-ico-sound qk-eng-corner-bl" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
    `;
    this.screens.show('play');
    this.applyThemeBackdrop(play);
    const sound = play.querySelector('.qk-observe-sound');
    this.screens.hold(onTap(sound, () => this.replayFromHud(), {
      feedback: (event) => event.stopPropagation(),
    }));
  }

  async createPlayStage() {
    const host = this.screens.el('play').querySelector('.qk-observe-canvas');
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
    this.promptGeneration += 1;
    this.stopSway();
    this.cancelTweens();
    this.clearDelays();
    if (this.removeResize) this.removeResize();
    this.removeResize = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
    this.pageView = null;
    this.sceneView = null;
    this.stickerViews = [];
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play' || !this.stage) return;
    this.clearTimers();
    this.stopSway();
    this.cancelTweens();
    this.roundIndex = index;
    this.promptIndex = 0;
    this.currentPage = this.pages[index];
    this.currentPrompt = null;
    this.stamps = [];
    this.journal[index] = { page: this.currentPage, stamps: this.stamps };
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.targetMap.clear();
    this.stickerViews = [];
    const generation = ++this.roundGeneration;

    this.updateDots();
    const scene = new this.stage.PIXI.Container();
    this.scene = scene;
    this.stage.setScene(scene);
    await this.buildPageView(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutField();
    await this.revealPage(generation);
    if (!this.roundIsCurrent(generation)) return;
    if (this.sceneView) this.stopSceneSway = sway(this.sceneView, { amount: 0.012, ms: 2600 });
    await this.showPrompt(0, true);
  }

  async buildPageView(generation) {
    const { PIXI } = this.stage;
    const page = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-PAGE_W / 2, -PAGE_H / 2 + 10, PAGE_W, PAGE_H, 30)
      .fill({ color: 0x17517e, alpha: 0.17 });
    const backing = cardBacking(PIXI, PAGE_W, PAGE_H, {
      fill: 0xfff8dc, stroke: 0xffffff, strokeWidth: 7, radius: 30,
    });
    const paperLines = new PIXI.Graphics();
    for (let y = -PAGE_H / 2 + 42; y < PAGE_H / 2; y += 38) {
      paperLines.moveTo(-PAGE_W / 2 + 34, y).lineTo(PAGE_W / 2 - 24, y)
        .stroke({ width: 2, color: 0x2d7dd2, alpha: 0.08 });
    }
    paperLines.moveTo(-PAGE_W / 2 + 46, -PAGE_H / 2 + 12)
      .lineTo(-PAGE_W / 2 + 46, PAGE_H / 2 - 12)
      .stroke({ width: 4, color: 0xf25f5c, alpha: 0.28 });
    page.addChild(shadow, backing, paperLines);
    page.hitArea = new PIXI.Rectangle(-PAGE_W / 2, -PAGE_H / 2, PAGE_W, PAGE_H);
    page.eventMode = 'static';
    page.cursor = 'pointer';
    page.accessible = true;
    page.accessibleType = 'button';
    page.accessibleTitle = this.currentPage.alt || this.currentPage.say || '';
    page.on('pointerdown', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.tapTarget('scene');
    });

    const sceneView = new PIXI.Container();
    page.addChild(sceneView);
    const refs = Array.isArray(this.currentPage.scene) ? this.currentPage.scene : [this.currentPage.scene || 'emoji:🔎'];
    const sceneTasks = refs.slice(0, 6).map(async (ref, index) => {
      const artSize = refs.length === 1 ? 212 : 112;
      const art = await artObj(PIXI, ref, artSize, this.currentPage.alt || this.currentPage.say || '');
      if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
      const size = refs.length === 1 ? 250 : SCENE_CARD_SIZE;
      const item = new PIXI.Container();
      const itemShadow = new PIXI.Graphics();
      itemShadow.roundRect(-size / 2, -size / 2 + 5, size, size, 24)
        .fill({ color: 0x17517e, alpha: 0.10 });
      item.addChild(itemShadow, cardBacking(PIXI, size, size, {
        fill: 0xffffff, stroke: 0xffffff, strokeWidth: 4, radius: 24,
      }), art);
      item.scale.set(0.01);
      item._enterIndex = index;
      sceneView.addChild(item);
    });
    await Promise.all(sceneTasks);
    if (!this.roundIsCurrent(generation)) { page.destroy({ children: true }); return; }

    this.pageView = page;
    this.sceneView = sceneView;
    this.layoutSceneArt();
    this.scene.addChild(page);
    this.targetMap.set('scene', {
      id: 'scene', role: 'neutral', type: 'scene', view: page,
      width: PAGE_W, height: PAGE_H, action: () => this.replayPrompt(),
    });
  }

  layoutSceneArt() {
    if (!this.sceneView) return;
    const items = this.sceneView.children;
    const count = items.length;
    if (!count) return;
    if (count === 1) {
      items[0].position.set(0, 0);
      return;
    }
    const columns = count <= 3 ? count : 3;
    const rows = Math.ceil(count / columns);
    const gap = 18;
    const stepX = SCENE_CARD_SIZE + gap;
    const stepY = Math.min(154, (PAGE_H - 46) / rows);
    items.forEach((item, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const rowCount = Math.min(columns, count - row * columns);
      item.position.set((col - (rowCount - 1) / 2) * stepX, (row - (rows - 1) / 2) * stepY);
      if (rows > 1) item.scale.set(0.01);
    });
  }

  async revealPage(generation) {
    if (!this.pageView) return;
    const finalScale = this.pageView.scale.x;
    this.pageView.alpha = this.reducedMotion() ? 1 : 0;
    this.pageView.scale.set(finalScale * 0.96);
    await this.runTween(to(this.pageView, {
      alpha: 1, scale: { x: finalScale, y: finalScale },
    }, { ms: 250, easing: ease.outCubic }));
    const sceneItems = this.sceneView ? this.sceneView.children.slice() : [];
    await Promise.all(sceneItems.map(async (item, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 70);
      if (!this.roundIsCurrent(generation)) return;
      await this.runTween(popIn(item, 330));
    }));
  }

  async showPrompt(index, includeIntro = false) {
    if (this.destroyed || !this.currentPage || !this.stage) return;
    this.clearTimers();
    this.cancelStickerTweens();
    this.promptIndex = index;
    this.currentPrompt = this.currentPage.prompts[index];
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    const generation = ++this.promptGeneration;

    const live = this.screens.el('play').querySelector('.qk-observe-live');
    const promptText = this.currentPrompt.say || this.currentPage.say || '';
    if (live) live.textContent = promptText;
    await this.buildStickerViews(generation);
    if (!this.promptIsCurrent(generation)) return;
    this.layoutField();
    await this.revealStickers(generation);
    if (!this.promptIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    const intro = includeIntro && this.roundIndex === 0 && this.mode.prompt ? `${this.mode.prompt} ` : '';
    this.speak(intro + promptText);
    this.scheduleIdlePrompt();
  }

  async buildStickerViews(generation) {
    for (const old of this.stickerViews) {
      this.targetMap.delete(old.id);
      if (old.view.parent) old.view.parent.removeChild(old.view);
      old.view.destroy({ children: true });
    }
    this.stickerViews = [];

    const tasks = this.currentPrompt.stickers.map(async (sticker, index) => {
      const id = `sticker:${index}`;
      const art = await artObj(this.stage.PIXI, sticker.art, 92, sticker.alt || sticker.say || '');
      if (!this.promptIsCurrent(generation)) { art.destroy({ children: true }); return; }
      const view = this.makeStickerView(art, index, sticker.alt || sticker.say || '');
      view.on('pointerdown', (event) => {
        if (event && event.preventDefault) event.preventDefault();
        this.unlockAudio();
        this.tapTarget(id);
      });
      const target = {
        id, role: 'correct', type: 'sticker', sticker, stickerIndex: index,
        view, motion: view.motion, width: STICKER_SIZE, height: STICKER_SIZE,
        action: () => this.chooseSticker(index),
      };
      this.stickerViews[index] = target;
      this.targetMap.set(id, target);
      this.scene.addChild(view);
    });
    await Promise.all(tasks);
  }

  makeStickerView(art, index, alt) {
    const { PIXI } = this.stage;
    const view = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-STICKER_SIZE / 2, -STICKER_SIZE / 2 + 7, STICKER_SIZE, STICKER_SIZE, 25)
      .fill({ color: 0x17517e, alpha: 0.16 });
    motion.addChild(shadow, cardBacking(PIXI, STICKER_SIZE, STICKER_SIZE, {
      fill: STICKER_COLORS[index % STICKER_COLORS.length], stroke: 0xffffff, strokeWidth: 6, radius: 25,
    }), art);
    view.addChild(motion);
    view.motion = motion;
    view.hitArea = new PIXI.Rectangle(-STICKER_SIZE / 2, -STICKER_SIZE / 2, STICKER_SIZE, STICKER_SIZE);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = alt;
    motion.scale.set(0.01);
    return view;
  }

  async revealStickers(generation) {
    await Promise.all(this.stickerViews.filter(Boolean).map(async (target, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 65);
      if (!this.promptIsCurrent(generation)) return;
      await this.runTween(popIn(target.motion, 330));
    }));
  }

  // The layout uses logical Pixi coordinates, then scales whole cards. Even at
  // the tightest supported fit every sticker remains at least 96 CSS pixels.
  layoutField() {
    if (!this.stage || !this.scene || !this.pageView) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;
    const stickers = this.stickerViews.filter(Boolean);
    const count = stickers.length;
    const portrait = h >= w;
    const pad = Math.max(8, Math.min(20, Math.min(w, h) * 0.025));
    const gap = Math.max(10, Math.min(20, Math.min(w, h) * 0.025));

    if (!portrait && w >= 660) {
      const pageAreaW = Math.max(360, w * 0.59);
      const pageScale = Math.min(1, (pageAreaW - pad * 2) / PAGE_W, (h - pad * 2) / PAGE_H);
      this.pageView.position.set(pageAreaW / 2, h / 2);
      this.pageView.scale.set(pageScale);
      if (!count) return;
      const columns = count <= 2 ? 1 : 2;
      const rows = Math.ceil(count / columns);
      const areaX = pageAreaW;
      const areaW = w - areaX;
      const fitW = (areaW - pad * 2 - gap * (columns - 1)) / columns;
      const fitH = (h - pad * 2 - gap * (rows - 1)) / rows;
      const size = Math.max(96, Math.min(STICKER_SIZE, fitW, fitH));
      this.placeStickerGrid(stickers, areaX, 0, areaW, h, columns, size, gap);
    } else {
      const pageAreaH = Math.max(205, h * 0.56);
      const pageScale = Math.min(1, (w - pad * 2) / PAGE_W, (pageAreaH - pad * 2) / PAGE_H);
      this.pageView.position.set(w / 2, pageAreaH / 2);
      this.pageView.scale.set(pageScale);
      if (!count) return;
      const columns = count <= 2 ? count : Math.min(3, count);
      const rows = Math.ceil(count / columns);
      const areaY = pageAreaH;
      const areaH = h - areaY;
      const fitW = (w - pad * 2 - gap * (columns - 1)) / columns;
      const fitH = (areaH - pad * 2 - gap * (rows - 1)) / rows;
      const size = Math.max(96, Math.min(STICKER_SIZE, fitW, fitH));
      this.placeStickerGrid(stickers, 0, areaY, w, areaH, columns, size, gap);
    }
    this.layoutStamps();
  }

  placeStickerGrid(targets, left, top, width, height, columns, size, gap) {
    const rows = Math.ceil(targets.length / columns);
    const totalH = rows * size + (rows - 1) * gap;
    const firstY = top + (height - totalH) / 2 + size / 2;
    targets.forEach((target, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      const rowCount = Math.min(columns, targets.length - row * columns);
      const totalW = rowCount * size + (rowCount - 1) * gap;
      const firstX = left + (width - totalW) / 2 + size / 2;
      target.view.position.set(firstX + col * (size + gap), firstY + row * (size + gap));
      target.view.scale.set(size / STICKER_SIZE);
    });
  }

  layoutStamps() {
    for (const stamp of this.stamps) {
      if (!stamp.view || !this.pageView) continue;
      stamp.view.position.set(
        this.pageView.x + ((stamp.x / 100) - 0.5) * PAGE_W * this.pageView.scale.x,
        this.pageView.y + ((stamp.y / 100) - 0.5) * PAGE_H * this.pageView.scale.y,
      );
      stamp.view.scale.set(this.pageView.scale.x);
    }
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed) return { accepted: false };
    if (target.type === 'sticker' && this.awaitingInput && !this.inputLocked && target.motion) {
      target.motion.scale.set(1.06);
      target.motion.y = -5;
    }
    await target.action();
    return { accepted: true };
  }

  async chooseSticker(index) {
    if (!this.awaitingInput || this.inputLocked || !this.currentPrompt || !this.stage) return { accepted: false };
    const target = this.targetMap.get(`sticker:${index}`);
    if (!target) return { accepted: false };
    const generation = this.promptGeneration;

    this.clearTimers();
    this.inputLocked = true;
    this.awaitingInput = false;
    this.playSfx('pop');
    await this.liftSticker(target);
    if (!this.promptIsCurrent(generation) || this.targetMap.get(target.id) !== target) return { accepted: false };
    this.playSfx('whoosh');
    const stamp = await this.flyStickerToPage(target, generation);
    if (!stamp || !this.promptIsCurrent(generation)) return { accepted: false };
    this.playSfx('sparkle');
    await Promise.all([
      sparkle(this.stage.PIXI, this.scene, stamp.view.x, stamp.view.y),
      this.squashStamp(stamp.view),
    ]);
    if (!this.promptIsCurrent(generation)) return { accepted: false };
    await this.speak(target.sticker.say || this.config.voice.yum);
    await this.delay(this.shortDelay(180));
    if (!this.promptIsCurrent(generation)) return { accepted: false };

    const nextPrompt = this.promptIndex + 1;
    if (nextPrompt < this.currentPage.prompts.length) {
      await this.showPrompt(nextPrompt);
      return { accepted: true };
    }

    await this.completePage();
    if (this.destroyed || this.screen !== 'play') return { accepted: true };
    const nextRound = this.roundIndex + 1;
    if (nextRound >= this.roundsTotal) await this.finishGame();
    else await this.showRound(nextRound);
    return { accepted: true };
  }

  async liftSticker(target) {
    await this.animateMotion(target, {
      y: -12, rotation: -0.035, scale: { x: 1.12, y: 1.12 },
    }, { ms: 150, easing: ease.outBack });
  }

  async flyStickerToPage(target, generation) {
    const position = this.nextStampPosition();
    const art = await artObj(this.stage.PIXI, target.sticker.art, 58, target.sticker.alt || target.sticker.say || '');
    if (!this.promptIsCurrent(generation)) {
      art.destroy({ children: true });
      return null;
    }
    const flight = new this.stage.PIXI.Container();
    flight.addChild(cardBacking(this.stage.PIXI, STAMP_SIZE, STAMP_SIZE, {
      fill: 0xffffff, stroke: 0xffffff, strokeWidth: 5, radius: 20,
    }), art);
    flight.position.set(target.view.x, target.view.y);
    const sourceScale = target.view.scale.x * STICKER_SIZE / STAMP_SIZE;
    flight.scale.set(sourceScale);
    flight.zIndex = 20;
    this.scene.sortableChildren = true;
    this.scene.addChild(flight);
    target.view.alpha = 0;

    const destination = this.stampStagePosition(position);
    const middleX = (flight.x + destination.x) / 2;
    const middleY = Math.min(flight.y, destination.y) - Math.max(42, Math.abs(flight.x - destination.x) * 0.12);
    const landingScale = this.pageView.scale.x;
    await this.runTween(to(flight, {
      x: middleX, y: middleY, rotation: position.turn * Math.PI / 360,
      scale: { x: landingScale * 1.12, y: landingScale * 1.12 },
    }, { ms: 230, easing: ease.outCubic }));
    if (!this.promptIsCurrent(generation)) {
      destroyDisplay(flight);
      return null;
    }
    await this.runTween(to(flight, {
      x: destination.x, y: destination.y, rotation: position.turn * Math.PI / 180,
      scale: { x: landingScale, y: landingScale },
    }, { ms: 210, easing: ease.inOutSine }));
    if (!this.promptIsCurrent(generation)) {
      destroyDisplay(flight);
      return null;
    }
    if (flight.parent) flight.parent.removeChild(flight);
    flight.destroy({ children: true });

    const stampArt = await artObj(this.stage.PIXI, target.sticker.art, 58, target.sticker.alt || target.sticker.say || '');
    if (!this.promptIsCurrent(generation)) {
      stampArt.destroy({ children: true });
      return null;
    }
    const view = new this.stage.PIXI.Container();
    const shadow = new this.stage.PIXI.Graphics();
    shadow.roundRect(-STAMP_SIZE / 2, -STAMP_SIZE / 2 + 5, STAMP_SIZE, STAMP_SIZE, 20)
      .fill({ color: 0x17517e, alpha: 0.15 });
    view.addChild(shadow, cardBacking(this.stage.PIXI, STAMP_SIZE, STAMP_SIZE, {
      fill: 0xffffff, stroke: 0xffffff, strokeWidth: 5, radius: 20,
    }), stampArt);
    view.rotation = position.turn * Math.PI / 180;
    this.scene.addChild(view);
    const stamp = {
      art: target.sticker.art,
      alt: target.sticker.alt || target.sticker.say || '',
      say: target.sticker.say || '',
      promptIndex: this.promptIndex,
      stickerIndex: target.stickerIndex,
      x: position.x, y: position.y, turn: position.turn, view,
    };
    this.stamps.push(stamp);
    this.layoutStamps();
    return stamp;
  }

  stampStagePosition(position) {
    return {
      x: this.pageView.x + ((position.x / 100) - 0.5) * PAGE_W * this.pageView.scale.x,
      y: this.pageView.y + ((position.y / 100) - 0.5) * PAGE_H * this.pageView.scale.y,
    };
  }

  async squashStamp(view) {
    await this.runTween(to(view, { scale: { x: this.pageView.scale.x * 1.15, y: this.pageView.scale.y * 0.82 } }, {
      ms: 105, easing: ease.outQuad,
    }));
    await this.runTween(to(view, { scale: { x: this.pageView.scale.x, y: this.pageView.scale.y } }, {
      ms: 180, easing: ease.outBack,
    }));
  }

  async completePage() {
    this.stopSway();
    this.playSfx('sparkle');
    const wobble = (async () => {
      if (!this.pageView) return;
      await this.runTween(to(this.pageView, { rotation: 0.025 }, { ms: 120, easing: ease.inOutSine }));
      await this.runTween(to(this.pageView, { rotation: -0.02 }, { ms: 140, easing: ease.inOutSine }));
      await this.runTween(to(this.pageView, { rotation: 0 }, { ms: 150, easing: ease.outBack }));
    })();
    const confetti = this.pageView
      ? burst(this.stage.PIXI, this.scene, this.pageView.x, this.pageView.y, { count: 30, power: 6, life: 650 })
      : Promise.resolve();
    await Promise.all([wobble, confetti]);
  }

  nextStampPosition() {
    const count = this.stamps.length;
    const base = [
      { x: 70, y: 68 },
      { x: 28, y: 70 },
      { x: 74, y: 34 },
      { x: 30, y: 32 },
    ][count % 4];
    return {
      x: clamp(base.x + (this.rng() * 10 - 5), 18, 82),
      y: clamp(base.y + (this.rng() * 10 - 5), 20, 82),
      turn: Math.round(this.rng() * 16 - 8),
    };
  }

  replayFromHud() {
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_DEBOUNCE_MS) return;
    this.lastReplay = now;
    this.playSfx('tick');
    this.replayPrompt();
  }

  async replayPrompt() {
    if (this.screen !== 'play' || !this.currentPrompt) return;
    this.clearTimers();
    await this.speak(this.currentPrompt.say || this.currentPage.say || '');
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearTimers();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    const id = window.setTimeout(() => {
      this.timerIds.delete(id);
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.speak(this.currentPrompt && (this.currentPrompt.say || this.currentPage.say));
    }, this.timers.ms(IDLE_MS));
    this.timerIds.add(id);
    this.idleTimer = id;
  }

  async finishGame() {
    if (this.destroyed) return;
    this.clearTimers();
    speech.stop();
    const end = this.screens.el('end');
    // show() is IDEMPOTENT, and Leave 'play' before the stage goes: everything
    // that guards on screen === 'play' must see the router flip here.
    this.screens.release('end');
    this.screens.show('end');
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    // The live Pixi ticker is gone before recap starts; recap is lightweight DOM
    // chrome, so an end screen left open cannot leak a renderer or animation loop.
    this.disposeStage();
    this.renderRecap(end);
    await this.runRecap();
    if (this.destroyed || this.screen !== 'end') return;
    this.playSfx('tada');
    this.createDomBurst();
    await this.speak(this.mode.cheer || this.config.voice.cheer);
  }

  renderRecap(end) {
    end.setAttribute('aria-label', this.mode.cheer || this.config.voice.cheer);
    end.innerHTML = `
      <button class="qk-observe-back qk-observe-img-btn qk-eng-img-btn qk-eng-ico-back qk-eng-corner-tl" type="button" aria-label="Back to the game menu"></button>
      <h1 class="qk-eng-title">${escapeHtml(this.mode.endTitle || this.config.copy.recap)}</h1>
      <div class="qk-observe-book" aria-hidden="true">
        <div class="qk-observe-recap-page"><div class="qk-observe-recap-layer"></div></div>
      </div>
      <button class="qk-observe-again qk-eng-mode" type="button">
        <span class="qk-observe-play-icon qk-eng-play-icon" aria-hidden="true"></span>
        <span>${escapeHtml(this.config.copy.playAgain)}</span>
      </button>
    `;
    this.applyThemeBackdrop(end);
    // Only "again" goes through wireEndScreen. The corner "back" is the
    // constructor's one delegated tap — it has to keep answering both this
    // screen and play's — and handing it to wireEndScreen as well would both
    // double-wire it and give it a press sound it never had.
    wireEndScreen({
      screens: this.screens,
      again: end.querySelector('.qk-observe-again'),
      feedback: (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.unlockAudio();
        this.playSfx('tick');
      },
      onAgain: () => {
        if (this.mode) this.startMode(this.mode.id);
        else this.renderSplash();
      },
    });
    this.recapEls = {
      page: end.querySelector('.qk-observe-recap-page'),
      layer: end.querySelector('.qk-observe-recap-layer'),
    };
  }

  async runRecap() {
    if (!this.recapEls) return;
    const pages = this.journal.filter(Boolean);
    const pageDelay = this.shortDelay(720);
    for (let index = 0; index < pages.length; index++) {
      if (this.destroyed || this.screen !== 'end') return;
      const entry = pages[index];
      this.paintRecapPage(entry, index);
      this.playSfx('whoosh');
      for (const stamp of entry.stamps) {
        if (stamp && stamp.say) await this.speak(stamp.say);
      }
      await this.delay(pageDelay);
    }
  }

  paintRecapPage(entry, index) {
    const { page, layer } = this.recapEls;
    page.classList.remove('qk-observe-page-slide');
    void page.offsetWidth;
    page.classList.add('qk-observe-page-slide');
    page.style.setProperty('--page-hue', String((index * 48) % 360));
    layer.replaceChildren();

    const scene = document.createElement('div');
    scene.className = 'qk-observe-recap-scene';
    const refs = Array.isArray(entry.page.scene) ? entry.page.scene : [entry.page.scene || 'emoji:🔎'];
    refs.slice(0, 6).forEach((ref) => {
      const item = document.createElement('span');
      item.className = 'qk-observe-recap-scene-card';
      item.appendChild(artEl(ref, entry.page.alt || entry.page.say || ''));
      scene.appendChild(item);
    });
    layer.appendChild(scene);

    entry.stamps.forEach((stamp, stampIndex) => {
      const item = document.createElement('span');
      item.className = 'qk-observe-recap-stamp';
      item.style.left = `${stamp.x}%`;
      item.style.top = `${stamp.y}%`;
      item.style.setProperty('--turn', `${stamp.turn}deg`);
      item.style.setProperty('--wave-delay', `${stampIndex * 80}ms`);
      item.appendChild(artEl(stamp.art, stamp.alt || ''));
      layer.appendChild(item);
    });
  }

  updateDots() {
    this.screens.el('play').querySelectorAll('.qk-observe-dot').forEach((dot, index) => {
      dot.classList.toggle('is-done', index < this.roundIndex);
      dot.classList.toggle('is-now', index === this.roundIndex);
    });
  }

  createDomBurst() {
    if (this.reducedMotion()) return;
    const host = this.screens.el('end') || this.mountEl;
    const node = document.createElement('div');
    node.className = 'qk-observe-burst';
    for (let index = 0; index < 20; index++) {
      const piece = document.createElement('span');
      const angle = (Math.PI * 2 * index) / 20;
      const distance = 95 + this.rng() * 150;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      piece.style.setProperty('--hue', String(Math.floor(this.rng() * 360)));
      node.appendChild(piece);
    }
    host.appendChild(node);
    const id = window.setTimeout(() => {
      this.timerIds.delete(id);
      node.remove();
    }, 900);
    this.timerIds.add(id);
  }

  getState() {
    return {
      screen: this.screen,
      mode: this.mode ? this.mode.id : null,
      round: this.screen === 'play' ? this.roundIndex : this.roundsTotal,
      roundsTotal: this.roundsTotal,
      awaitingInput: this.awaitingInput,
      prompt: this.screen === 'play' ? this.promptIndex : 0,
    };
  }

  getTargets() {
    if (this.screen !== 'play' || !this.stage) return [];
    const canvasRect = this.stage.app.canvas.getBoundingClientRect();
    const stageSize = this.stage.size();
    const scaleX = stageSize.w ? canvasRect.width / stageSize.w : 1;
    const scaleY = stageSize.h ? canvasRect.height / stageSize.h : 1;
    const { PIXI } = this.stage;
    return Array.from(this.targetMap.values()).filter((target) => target.view).sort(targetOrder).map((target) => {
      const halfW = target.width / 2;
      const halfH = target.height / 2;
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
    });
  }

  async winRound() {
    if (this.screen !== 'play') return;
    const startingRound = this.roundIndex;
    // Bounded and timer-friendly: when a tap is rejected (input locked during
    // an in-flight animation), WAIT before retrying — an instant-retry loop
    // spins the microtask queue and starves the very timers that unlock the
    // round, deadlocking at 100% CPU.
    const deadline = performance.now() + 15000;
    while (this.screen === 'play' && this.roundIndex === startingRound) {
      if (performance.now() > deadline) return;
      const target = Array.from(this.targetMap.values()).find((entry) => entry.id.startsWith('sticker:'));
      if (!target) {
        await new Promise((resolve) => setTimeout(resolve, 120));
        continue;
      }
      const res = await this.tapTarget(target.id);
      if (!res || !res.accepted) {
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    }
  }


  /** Art-world backdrop (docs/art-direction.md): theme.background paints the
   *  whole section via CSS cover -- the Pixi canvas is transparent above it. */
  applyThemeBackdrop(section) {
    const theme = this.config.theme;
    if (!theme || !theme.background || !section) return;
    const ref = String(theme.background);
    const url = ref.startsWith('shared:') || ref.startsWith('char:') ? artUrlRef(ref) : ref;
    if (!url) return;
    section.style.background = `#bfe3f5 url("${url}") center / cover no-repeat`;
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    this.seeded = true;
    this.rng = mulberry32(Number(n) || 1);
  }

  speak(text) {
    if (this.muted || !text) return Promise.resolve();
    return speech.speak(text, { rate: 0.8, pitch: 1.05, cancel: true });
  }

  playSfx(name) {
    if (this.muted || !name || typeof sfx[name] !== 'function') return;
    sfx[name]();
  }

  shortDelay(ms) {
    if (this.seeded || this.muted) return 60;
    return this.reducedMotion() ? Math.min(ms, 120) : ms;
  }

  reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  roundIsCurrent(generation) {
    return !this.destroyed && this.screen === 'play' && this.stage && generation === this.roundGeneration;
  }

  promptIsCurrent(generation) {
    return !this.destroyed && this.screen === 'play' && this.stage && generation === this.promptGeneration;
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

  cancelStickerTweens() {
    this.stickerViews.forEach((target) => {
      if (target && target.motionTween && target.motionTween.cancel) target.motionTween.cancel();
    });
  }

  cancelTweens() {
    this.activeTweens.forEach((tween) => tween.cancel && tween.cancel());
    this.activeTweens.clear();
  }

  stopSway() {
    if (this.stopSceneSway) this.stopSceneSway();
    this.stopSceneSway = null;
  }

  delay(ms) {
    return new Promise((resolve) => {
      const entry = { timer: 0, resolve };
      entry.timer = window.setTimeout(() => {
        this.pendingDelays.delete(entry);
        resolve();
      }, this.timers.ms(ms));
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

  clearTimers() {
    if (this.idleTimer) this.idleTimer = 0;
    for (const id of this.timerIds) window.clearTimeout(id);
    this.timerIds.clear();
  }
}

function normalizeConfig(config) {
  const modes = Array.isArray(config.modes) && config.modes.length ? config.modes : [config];
  return {
    ...config,
    id: config.id || 'observe-journal',
    title: config.title || 'Observation Journal',
    splashArt: config.splashArt || config.splashEmoji || 'emoji:🔎',
    copy: {
      home: 'Home', replay: 'Hear it again', recap: 'My Journal', playAgain: 'Play Again',
      ...(config.copy || {}),
    },
    voice: {
      cheer: 'You made a journal!', yum: 'Nice observation!', ...(config.voice || {}),
    },
    modes: modes.map(normalizeMode).filter((mode) => mode.pages.length),
  };
}

function normalizeMode(mode) {
  const pages = (mode.pages || []).map(normalizePage).filter((page) => page.prompts.length);
  return {
    ...mode,
    id: mode.id || 'journal',
    title: mode.title || 'Journal',
    rounds: Math.min(Number(mode.rounds || pages.length), pages.length),
    pages,
  };
}

function normalizePage(page) {
  const prompts = [];
  if (Array.isArray(page.prompts)) {
    for (const prompt of page.prompts) {
      const normalized = normalizePrompt(prompt, page.say);
      if (normalized) prompts.push(normalized);
    }
  } else {
    const first = normalizePrompt({ say: page.say, stickers: page.stickers }, page.say);
    if (first) prompts.push(first);
    const second = normalizePrompt({
      say: page.secondSay || page.followupSay,
      stickers: page.secondStickers || page.followupStickers,
    }, page.secondSay || page.followupSay);
    if (second) prompts.push(second);
  }
  return { ...page, scene: page.scene || 'emoji:🔎', prompts };
}

function normalizePrompt(prompt, fallbackSay) {
  const stickers = (prompt.stickers || [])
    .filter((item) => item && item.art)
    .slice(0, 5)
    .map((item) => ({ ...item, say: item.say || 'I see that!' }));
  if (!stickers.length) return null;
  return {
    ...prompt,
    say: prompt.say || fallbackSay || 'What do you notice?',
    stickers,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** The back button an event landed on, if any — null for anything else, including
 *  a target that is not an Element and so has no .closest. */
function backButtonFor(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest('.qk-observe-back');
}

function targetOrder(a, b) {
  if (a.id === 'scene') return -1;
  if (b.id === 'scene') return 1;
  return (Number(a.id.split(':')[1]) || 0) - (Number(b.id.split(':')[1]) || 0);
}

function destroyDisplay(display) {
  if (!display || display.destroyed) return;
  if (display.parent) display.parent.removeChild(display);
  display.destroy({ children: true });
}

function installStyle() {
  if (styleInstalled) return;
  styleInstalled = true;
  installEngineStyles('qk-observe-style', `
    /* observe-journal's own skin. Everything the other engines also had —
       @font-face, the reset, the surface, the 96px PNG buttons, the splash/end
       column, the mode buttons, the HUD grid, the ringed progress dots, the
       canvas — now comes from shared/css/engine-base.css; what is left below
       is either this engine's palette or a control only this engine has (the
       journal page, the sticker stamps, the recap book).

       The class names are unchanged and stay supported: see the compatibility
       window note in shared/js/engines/README.md. */

    .qk-observe {
      --navy: #17517e;
      --sky: #bee3f5;
      --green: #58a945;
      --gold: #ffd166;
      --purple: #7c4fc4;
      --blue: #2d7dd2;
      --shadow: 0 7px 0 rgba(23,81,126,.17), 0 16px 30px rgba(23,81,126,.17);

      /* Alias the legacy vars onto engine-base's tokens rather than letting its
         defaults stand — a game skin that redefines --navy or --shadow under
         #game must keep reaching every shared rule. */
      --qk-navy: var(--navy);
      --qk-sky: var(--sky);
      --qk-primary: var(--purple);
      --qk-shadow: var(--shadow);

      --qk-eng-bg-image:
        linear-gradient(180deg, rgba(255,255,255,.45), transparent 44%),
        radial-gradient(circle at 18% 22%, rgba(255,255,255,.32) 0 11px, transparent 12px),
        radial-gradient(circle at 78% 28%, rgba(255,255,255,.26) 0 15px, transparent 16px);
      --qk-eng-bg-size: auto, 170px 170px, 230px 230px;
      --qk-eng-focus-a: .62;
      --qk-eng-title-w: 14ch;
      --qk-eng-center-gap: clamp(16px, 2.8vmin, 28px);
      --qk-eng-center-pt: 56px;
      --qk-eng-play-pad:
        max(10px, env(safe-area-inset-top))
        max(14px, env(safe-area-inset-right))
        max(110px, calc(98px + env(safe-area-inset-bottom)))
        max(14px, env(safe-area-inset-left));
      --qk-eng-hud-h: 98px;
      --qk-eng-mode-min: min(250px, 86vw);
      --qk-eng-mode-list-mt: 0;
      --qk-eng-mode-h: 108px;
      --qk-eng-mode-pad: 16px 24px;
      --qk-eng-mode-sheen: linear-gradient(180deg, rgba(255,255,255,.32), transparent 52%);
      --qk-eng-mode-font: clamp(24px, 4vmin, 38px);
      --qk-eng-stage-w: min(1180px, 100%);
      --qk-eng-play-icon-size: 54px;
    }

    /* engine-base's .qk-eng-corner-tl sets z-index: var(--qk-eng-corner-z, 4) at
       equal specificity but earlier in the cascade (screens.css, then
       engine-base.css, then this residual) — this line keeps winning, exactly
       as it did when it was the only z-index either button had. */
    .qk-observe-img-btn { z-index: 5; }

    /* qk-eng-card's declaration list doesn't include a font-size (only
       qk-eng-card-glyph does), and this element never had one either — just
       --qk-art-size for the art.js emoji inside, so qk-eng-card-glyph is
       deliberately NOT adopted here. */
    .qk-observe-splash-art {
      --qk-eng-card-w: clamp(154px, 27vmin, 238px);
      --qk-eng-card-border: 6px solid #fff;
      --qk-eng-card-bg: linear-gradient(180deg, #fff, #fff0c2);
      --qk-art-size: clamp(82px, 17vmin, 138px);
      line-height: 1;
    }

    /* qk-eng-title has no color (every engine's h1 inherits its ink from the
       surface) and no text-align — the splash centers it via qk-eng-center,
       but the end screen has no such wrapper, so text-align stays explicit here. */
    .qk-observe h1 { text-align: center; }

    .qk-observe-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-observe-mode:nth-child(3n) { background-color: var(--green); }

    /* The centred pill of ringed dots is NOT engine-base's .qk-eng-pill (that
       one is 32px min-height / 6px 16px padding / .38 background) — this stays
       the engine's own rule. */
    .qk-observe-dots {
      grid-column: 2; display: flex; justify-content: center; align-items: center; gap: 11px;
      min-height: 34px; padding: 6px 14px; border-radius: 999px; background: rgba(255,255,255,.34);
    }
    .qk-observe-dot.is-done { background: var(--green); }
    .qk-observe-dot.is-now { background: var(--gold); transform: scale(1.12); }

    .qk-observe-live {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
      clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }

    .qk-observe-end { align-content: center; gap: clamp(12px, 2.2vmin, 22px); }
    .qk-observe-end h1 { font-size: clamp(32px, 5.6vmin, 62px); }
    .qk-observe-book { width: min(720px, 92vw); height: min(48vh, 410px); min-height: 250px; perspective: 900px; }
    .qk-observe-recap-page {
      position: relative; width: 100%; height: 100%; border-radius: 30px; border: 7px solid #fff;
      background:
        linear-gradient(90deg, hsla(var(--page-hue,42),75%,70%,.18) 0 48%, transparent 48% 52%, hsla(var(--page-hue,42),75%,70%,.12) 52%),
        repeating-linear-gradient(0deg, transparent 0 33px, rgba(45,125,210,.08) 34px 36px),
        linear-gradient(180deg, #fffef8, #fff1c9);
      box-shadow: var(--shadow); overflow: hidden; transform-origin: center;
    }
    .qk-observe-recap-layer { position: absolute; inset: 0; }
    .qk-observe-recap-scene {
      position: absolute; inset: 18px 24px; display: flex; align-items: center; justify-content: center;
      flex-wrap: wrap; gap: 10px; opacity: .78;
    }
    .qk-observe-recap-scene-card {
      display: grid; place-items: center; width: clamp(92px, 18vmin, 150px); aspect-ratio: 1;
      border-radius: 22px; background: rgba(255,255,255,.68); box-shadow: 0 4px 0 rgba(23,81,126,.09);
      --qk-art-size: clamp(54px, 10vmin, 92px); line-height: 1;
    }
    .qk-observe-recap-stamp {
      position: absolute; display: grid; place-items: center; width: clamp(76px, 12vmin, 106px); aspect-ratio: 1;
      translate: -50% -50%; border-radius: 20px; border: 5px solid #fff; background: #fff;
      box-shadow: 0 5px 0 rgba(23,81,126,.16), 0 10px 22px rgba(23,81,126,.14);
      --qk-art-size: clamp(44px, 7vmin, 68px); line-height: 1;
      transform: rotate(var(--turn)); animation: qk-observe-stamp-wave .58s ease-in-out var(--wave-delay) both;
    }
    .qk-observe-recap-scene-card .qk-art-img,
    .qk-observe-recap-stamp .qk-art-img { width: 82%; height: 82%; }
    .qk-observe-page-slide { animation: qk-observe-page-slide .46s ease both; }
    .qk-observe-again {
      display: inline-grid; grid-auto-flow: column; align-items: center; justify-content: center; gap: 12px;
      min-width: min(420px, 84vw); background-color: var(--green);
    }
    .qk-observe-burst { position: absolute; left: 50%; top: 50%; width: 1px; height: 1px; pointer-events: none; }
    .qk-observe-burst span {
      position: absolute; width: 22px; height: 22px; border-radius: 999px; background: hsl(var(--hue),82%,58%);
      animation: qk-observe-burst .85s ease-out both;
    }

    @keyframes qk-observe-page-slide {
      from { opacity: .35; transform: translateX(18%) rotate(2deg) scale(.96); }
      to { opacity: 1; transform: translateX(0) rotate(0) scale(1); }
    }
    @keyframes qk-observe-stamp-wave {
      0% { opacity: 0; transform: rotate(var(--turn)) translateY(10px) scale(.82); }
      55% { opacity: 1; transform: rotate(calc(var(--turn) - 5deg)) translateY(-6px) scale(1.06); }
      100% { opacity: 1; transform: rotate(var(--turn)) translateY(0) scale(1); }
    }
    @keyframes qk-observe-burst {
      from { opacity: 1; transform: translate(-50%,-50%) scale(.45); }
      to { opacity: 0; transform: translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1.25); }
    }

    @media (orientation: landscape) and (max-height: 590px) {
      .qk-observe-play { padding-bottom: max(96px, calc(84px + env(safe-area-inset-bottom))); }
      .qk-observe-hud { min-height: 90px; }
      .qk-observe-end { grid-template-columns: 1fr 1.5fr; grid-template-rows: auto 1fr auto; }
      .qk-observe-end h1 { grid-column: 1; align-self: end; }
      .qk-observe-book { grid-column: 2; grid-row: 1 / 4; width: min(58vw, 660px); height: min(76vh, 390px); }
      .qk-observe-again { grid-column: 1; min-width: min(36vw, 360px); }
    }
    @media (max-width: 560px) {
      .qk-observe-hud { grid-template-columns: 96px 1fr; }
      .qk-observe-dots { justify-self: end; }
      .qk-observe-dot { width: 19px; height: 19px; }
    }
    @media (prefers-reduced-motion: reduce) {
      .qk-observe *, .qk-observe *::before, .qk-observe *::after {
        animation-duration: .001ms !important; transition-duration: .001ms !important; scroll-behavior: auto !important;
      }
      .qk-observe-burst { display: none; }
    }
  `);
}
