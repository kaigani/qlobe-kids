// observe-journal.js — Stage v2 archetype for "look, think, record".
// DOM owns the familiar splash/HUD/recap chrome. Pixi owns the live journal:
// the thing being observed, the open-ended sticker choices, and every stamp.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { createStage } from '../stage/stage.js';
import { to, ease, popIn, sway } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';
import { artEl } from './art.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const BACK_IMG = new URL('../../assets/ui/btn-back.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;

const HOME_HREF = '../../';
const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const PAGE_W = 700;
const PAGE_H = 360;
const STICKER_SIZE = 138;
const STAMP_SIZE = 92;
const SCENE_CARD_SIZE = 154;
const STICKER_COLORS = [0xfff8e8, 0xe9fff1, 0xfff0e6, 0xeef1ff, 0xfff6cf];

let styleReady = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('observe-journal requires a mount element');
  injectStyle();
  return new ObserveJournalGame(config, mountEl);
}

class ObserveJournalGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config || {});
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;

    this.screen = 'splash';
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
    this.audioUnlocked = false;
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
    // delegated back-button handling: play/end screens rebuild innerHTML,
    // so the listener lives on the mount and survives every screen swap
    this.mountEl.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('.qk-observe-back')) {
        speech.stop();
        this.renderSplash();
      }
    });
    this.renderSplash();
    this.installDebug();
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
    this.targetMap.clear();
    this.mountEl.replaceChildren();
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
    };
    window.QLOBE_DEBUG = this.debug;
  }

  // Splash and HUD are intentionally DOM: they stay crisp, semantic, and
  // identical to the other Stage v2 engines while the canvas can be replaced.
  renderSplash() {
    this.clearTimers();
    this.disposeStage();
    speech.stop();
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    this.mountEl.classList.add('qk-observe-root');

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-observe-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        ${escapeHtml(mode.title)}
      </button>
    `).join('');
    this.mountEl.innerHTML = `
      <section class="qk-observe qk-observe-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-observe-home qk-observe-img-btn" href="${HOME_HREF}" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-observe-splash-center">
          <div class="qk-observe-splash-art" aria-hidden="true"></div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-observe-mode-list">${buttons}</div>
        </div>
      </section>
    `;
    this.applyThemeBackdrop();
    this.mountEl.querySelector('.qk-observe-splash-art').appendChild(
      artEl(this.config.splashArt, this.config.title),
    );
    this.mountEl.querySelectorAll('.qk-observe-mode').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.unlockAudio();
        this.playSfx('tick');
        this.startMode(button.dataset.mode);
      });
    });
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;
    const mode = this.config.modes.find((item) => item.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearTimers();
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
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
      `<span class="qk-observe-dot" data-dot="${index}" aria-hidden="true"></span>`).join('');
    this.mountEl.innerHTML = `
      <section class="qk-observe qk-observe-play" aria-label="${escapeAttr(this.mode.title)}">
        <header class="qk-observe-hud">
          <button class="qk-observe-back qk-observe-img-btn" type="button" aria-label="Back to the game menu"></button>
          <div class="qk-observe-dots" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-observe-stage">
          <div class="qk-observe-canvas" aria-label="${escapeAttr(this.mode.title)}"></div>
          <div class="qk-observe-live" aria-live="polite"></div>
        </main>
        <button class="qk-observe-sound qk-observe-img-btn" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;
    this.applyThemeBackdrop();
    const sound = this.mountEl.querySelector('.qk-observe-sound');
    sound.addEventListener('pointerdown', (event) => event.stopPropagation());
    sound.addEventListener('click', () => this.replayFromHud());
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-observe-canvas');
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

    const live = this.mountEl.querySelector('.qk-observe-live');
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
    }, IDLE_MS);
    this.timerIds.add(id);
    this.idleTimer = id;
  }

  async finishGame() {
    if (this.destroyed) return;
    this.clearTimers();
    speech.stop();
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    // The live Pixi ticker is gone before recap starts; recap is lightweight DOM
    // chrome, so an end screen left open cannot leak a renderer or animation loop.
    this.disposeStage();
    this.renderRecap();
    await this.runRecap();
    if (this.destroyed || this.screen !== 'end') return;
    this.playSfx('tada');
    this.createDomBurst();
    await this.speak(this.mode.cheer || this.config.voice.cheer);
  }

  renderRecap() {
    this.mountEl.innerHTML = `
      <section class="qk-observe qk-observe-end" aria-label="${escapeAttr(this.mode.cheer || this.config.voice.cheer)}">
        <button class="qk-observe-back qk-observe-img-btn" type="button" aria-label="Back to the game menu"></button>
        <h1>${escapeHtml(this.mode.endTitle || this.config.copy.recap)}</h1>
        <div class="qk-observe-book" aria-hidden="true">
          <div class="qk-observe-recap-page"><div class="qk-observe-recap-layer"></div></div>
        </div>
        <button class="qk-observe-again" type="button">
          <span class="qk-observe-play-icon" aria-hidden="true"></span>
          <span>${escapeHtml(this.config.copy.playAgain)}</span>
        </button>
      </section>
    `;
    this.applyThemeBackdrop();
    const again = this.mountEl.querySelector('.qk-observe-again');
    again.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.unlockAudio();
      this.playSfx('tick');
      if (this.mode) this.startMode(this.mode.id);
      else this.renderSplash();
    });
    this.recapEls = {
      page: this.mountEl.querySelector('.qk-observe-recap-page'),
      layer: this.mountEl.querySelector('.qk-observe-recap-layer'),
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
    this.mountEl.querySelectorAll('.qk-observe-dot').forEach((dot, index) => {
      dot.classList.toggle('is-done', index < this.roundIndex);
      dot.classList.toggle('is-now', index === this.roundIndex);
    });
  }

  createDomBurst() {
    if (this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-observe-end') || this.mountEl;
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
  applyThemeBackdrop() {
    const theme = this.config.theme;
    const section = this.mountEl.querySelector('.qk-observe');
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
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function escapeAttr(value) {
  return escapeHtml(value);
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

function injectStyle() {
  if (styleReady || document.getElementById('qk-observe-style')) {
    styleReady = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-observe-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-observe-root, .qk-observe-root * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-observe {
      --navy: #17517e;
      --sky: #bee3f5;
      --green: #58a945;
      --gold: #ffd166;
      --purple: #7c4fc4;
      --blue: #2d7dd2;
      --shadow: 0 7px 0 rgba(23,81,126,.17), 0 16px 30px rgba(23,81,126,.17);
      position: relative;
      width: 100%;
      height: 100dvh;
      min-height: 100%;
      overflow: hidden;
      color: var(--navy);
      background-color: var(--sky);
      background-image:
        linear-gradient(180deg, rgba(255,255,255,.45), transparent 44%),
        radial-gradient(circle at 18% 22%, rgba(255,255,255,.32) 0 11px, transparent 12px),
        radial-gradient(circle at 78% 28%, rgba(255,255,255,.26) 0 15px, transparent 16px);
      background-size: auto, 170px 170px, 230px 230px;
      font-family: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif;
      font-weight: 600;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
      touch-action: manipulation;
    }
    .qk-observe button, .qk-observe a { font: inherit; color: inherit; touch-action: manipulation; }
    .qk-observe button { border: 0; cursor: pointer; }
    .qk-observe button:focus-visible, .qk-observe a:focus-visible {
      outline: 5px solid rgba(45,125,210,.62); outline-offset: 4px;
    }
    .qk-observe-img-btn {
      display: grid; place-items: center; width: 96px; height: 96px; border-radius: 50%;
      background: transparent center / 84px 84px no-repeat; text-decoration: none; box-shadow: none; z-index: 5;
    }
    .qk-observe-img-btn:active { transform: scale(.93); }
    .qk-observe-home { background-image: url('${HOME_IMG}'); }
    .qk-observe-back { background-image: url('${BACK_IMG}'); }
    .qk-observe-sound { background-image: url('${SOUND_IMG}'); }

    .qk-observe-splash, .qk-observe-end {
      display: grid; place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }
    .qk-observe-home,     .qk-observe-back {
      position: absolute; left: max(12px, env(safe-area-inset-left)); top: max(12px, env(safe-area-inset-top));
    }
    .qk-observe-splash-center {
      display: grid; justify-items: center; gap: clamp(16px, 2.8vmin, 28px);
      width: min(900px, 100%); padding-top: 56px; text-align: center;
    }
    .qk-observe-splash-art {
      display: grid; place-items: center; width: clamp(154px, 27vmin, 238px); aspect-ratio: 1;
      border-radius: 28px; border: 6px solid #fff; background: linear-gradient(180deg, #fff, #fff0c2);
      box-shadow: var(--shadow); --qk-art-size: clamp(82px, 17vmin, 138px); line-height: 1;
    }
    .qk-observe h1 {
      margin: 0; max-width: 14ch; color: var(--navy); text-align: center;
      font-size: clamp(38px, 7vmin, 78px); line-height: .98; text-shadow: 0 4px 0 rgba(255,255,255,.72);
    }
    .qk-observe-mode-list {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(min(250px, 86vw), 1fr));
      gap: 18px; width: min(760px, 100%);
    }
    .qk-observe-mode, .qk-observe-again {
      min-height: 108px; border-radius: 26px; border: 5px solid #fff; padding: 16px 24px;
      color: #fff; background: linear-gradient(180deg, rgba(255,255,255,.32), transparent 52%), var(--purple);
      box-shadow: var(--shadow); font-size: clamp(24px, 4vmin, 38px); line-height: 1.05;
    }
    .qk-observe-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-observe-mode:nth-child(3n) { background-color: var(--green); }
    .qk-observe-mode:active, .qk-observe-again:active { transform: scale(.96); }

    .qk-observe-play {
      display: grid; grid-template-rows: auto 1fr;
      padding: max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(110px, calc(98px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }
    .qk-observe-hud {
      position: relative; z-index: 4; display: grid; grid-template-columns: 96px 1fr 96px;
      align-items: center; min-height: 98px;
    }
    .qk-observe-hud .qk-observe-home,     .qk-observe-hud .qk-observe-back { position: static; grid-column: 1; }
    .qk-observe-dots {
      grid-column: 2; display: flex; justify-content: center; align-items: center; gap: 11px;
      min-height: 34px; padding: 6px 14px; border-radius: 999px; background: rgba(255,255,255,.34);
    }
    .qk-observe-dot {
      width: 22px; height: 22px; border: 4px solid #fff; border-radius: 50%;
      background: rgba(255,255,255,.55); box-shadow: 0 3px 0 rgba(23,81,126,.13);
    }
    .qk-observe-dot.is-done { background: var(--green); }
    .qk-observe-dot.is-now { background: var(--gold); transform: scale(1.12); }
    .qk-observe-stage { min-height: 0; position: relative; width: min(1180px, 100%); justify-self: center; }
    .qk-observe-canvas { position: absolute; inset: 0; overflow: hidden; border-radius: 28px; touch-action: none; }
    .qk-observe-canvas canvas { display: block; width: 100%; height: 100%; touch-action: none; }
    .qk-observe-live {
      position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden;
      clip: rect(0,0,0,0); white-space: nowrap; border: 0;
    }
    .qk-observe-sound {
      position: absolute; left: max(14px, env(safe-area-inset-left)); bottom: max(12px, env(safe-area-inset-bottom));
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
    .qk-observe-play-icon { width: 54px; height: 54px; background: url('${PLAY_IMG}') center / contain no-repeat; }
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
  `;
  document.head.appendChild(style);
  styleReady = true;
}
