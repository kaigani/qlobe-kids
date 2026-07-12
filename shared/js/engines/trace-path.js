// trace-path.js — Stage v2 archetype for friendly finger tracing.
//
// DOM owns the splash, HUD, prompt, and end screen. Pixi owns the play-field:
// guide dashes/checkpoints, the child's ink, traveler, demo comet, and particles.
// Pointer lifecycle lives on window so an interrupted stroke can never strand
// input. Progress already earned is kept after pointercancel or window blur.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { artEl } from './art.js';
import { createStage } from '../stage/stage.js';
import { to, ease } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef } from '../stage/art-pixi.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const BACK_IMG = new URL('../../assets/ui/btn-back.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;
const HOME_HREF = '../../';

const WAIT_FOR_INPUT_MS = 80;
const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const WANDER_NUDGE_MS = 1500;
const TARGET_SIZE = 104;
const SAMPLE_STEP_PX = 16;
const SEARCH_BACK = 5;
const SEARCH_AHEAD = 34;
const BOARD_SIZE = 1000;
const GUIDE_WIDTH = 34;
const INK_WIDTH = 42;
const DEMO_MIN_MS = 900;
const DEMO_MAX_MS = 1800;
const WIN_RETRY_MS = 120;
const WIN_BAIL_MS = 15000;

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('trace-path requires a mount element');
  installStyle();
  return new TracePathGame(config, mountEl);
}

class TracePathGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;
    this.destroyed = false;

    this.screen = 'splash';
    this.mode = null;
    this.roundPaths = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.currentPath = null;
    this.currentStrokes = [];
    this.strokeIndex = 0;
    this.strokeProgress = [];
    this.strokesScreen = [];
    this.pathBounds = null;

    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.wanderTimer = 0;
    this.wanderNudged = false;
    this.rng = Math.random;
    this.fxRng = Math.random;
    this.motionReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.stage = null;
    this.scene = null;
    this.fieldLayer = null;
    this.guideLayer = null;
    this.checkpointLayer = null;
    this.inkLayer = null;
    this.fxLayer = null;
    this.demoLayer = null;
    this.guideGraphics = [];
    this.inkGraphics = [];
    this.checkpoints = [];
    this.startMarkers = [];
    this.traveler = null;
    this.demoDot = null;
    this.demoTrail = null;
    this.demo = null;
    this.completionShimmer = null;
    this.boardScale = 1;
    this.boardLeft = 0;
    this.boardTop = 0;
    this.removeResize = null;
    this.removeTicker = null;
    this.stageGeneration = 0;
    this.roundGeneration = 0;
    this.activeTweens = new Set();
    this.pendingDelays = new Set();

    // The pointer handler only updates these scalar slots. The Pixi ticker
    // consumes them once per frame and owns all ribbon/checkpoint allocations.
    this.activeTrace = null;
    this.pointerQueue = new Float64Array(4096);
    this.pointerQueueCount = 0;
    this.brushX = 0;
    this.brushY = 0;
    this.brushReady = false;
    this.inkPoints = [];
    this.inkDirty = false;
    this.inkTargetAlpha = 1;
    this.guidePulse = 0;

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (e) => e.preventDefault();
    this.onGestureStart = (e) => e.preventDefault();
    this.onWindowMove = (e) => this.handleWindowMove(e);
    this.onWindowUp = (e) => this.handleWindowUp(e);
    this.onWindowCancel = (e) => this.handleWindowCancel(e);
    this.onWindowBlur = () => {
      this.consumePointer();
      this.cancelTrace();
    };

    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);
    window.addEventListener('blur', this.onWindowBlur);

    // delegated back-button handling: play/end screens rebuild innerHTML,
    // so the listener lives on the mount and survives every screen swap
    this.mountEl.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('.qk-trace-back')) {
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
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.disposeStage();
    speech.stop();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gesturestart', this.onGestureStart);
    window.removeEventListener('blur', this.onWindowBlur);
    this.mountEl.replaceChildren();
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
      engine: 'trace-path',
      ready: this.ready,
      listModes: () => this.config.modes.map((mode) => ({ id: mode.id, title: mode.title })),
      startMode: (id) => this.startMode(id),
      getState: () => this.getState(),
      getTargets: () => this.getTargets(),
      tap: (targetId) => this.debugTap(targetId),
      winRound: () => this.winRound(),
      tracePoints: () => this.tracePoints(),
      mute: () => this.mute(),
      seed: (n) => this.seed(n),
    };
    window.QLOBE_DEBUG = this.debugHook;
  }

  renderSplash() {
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.disposeStage();
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    speech.stop();

    this.mountEl.replaceChildren();
    const root = el('section', 'qk-trace qk-trace-splash');
    this.applyTheme(root);
    root.setAttribute('aria-label', this.config.title);
    const home = this.renderImageButton('qk-trace-home', this.config.copy.home, HOME_HREF);
    const center = el('div', 'qk-trace-splash-center');
    const artCard = el('div', 'qk-trace-splash-art');
    artCard.appendChild(artEl(this.config.splashArt, this.config.title));
    const modeList = el('div', 'qk-trace-mode-list');
    for (const mode of this.config.modes) {
      const button = el('button', 'qk-trace-mode', mode.title || mode.id);
      button.type = 'button';
      button.dataset.mode = mode.id;
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(mode.id));
      modeList.appendChild(button);
    }
    center.append(artCard, el('h1', '', this.config.title), modeList);
    root.append(home, center);
    this.mountEl.appendChild(root);
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;
    const mode = this.config.modes.find((item) => item.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
    this.roundIndex = 0;
    const paths = mode.shuffle ? shuffle(mode.paths.slice(), this.rng) : mode.paths.slice();
    const maxRounds = Math.min(mode.rounds || paths.length, paths.length);
    this.roundPaths = paths.slice(0, maxRounds);
    this.roundsTotal = this.roundPaths.length;

    this.renderPlayShell();
    if (!this.roundsTotal) {
      await this.finishGame();
      return;
    }
    if (!await this.createPlayStage()) return;
    await this.showRound(0);
  }

  renderPlayShell() {
    this.mountEl.replaceChildren();
    const root = el('section', 'qk-trace qk-trace-play');
    this.applyTheme(root);
    root.setAttribute('aria-label', this.mode.title || this.config.title);
    const hud = el('header', 'qk-trace-hud');
    const home = this.renderImageButton('qk-trace-back', 'Back to the game menu');
    home.addEventListener('click', () => { speech.stop(); this.renderSplash(); });
    const progress = el('div', 'qk-trace-progress');
    progress.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < this.roundsTotal; i++) progress.appendChild(el('span', 'qk-trace-dot'));
    hud.append(home, progress, el('span', 'qk-trace-hud-spacer'));

    const stage = el('main', 'qk-trace-stage');
    const prompt = el('div', 'qk-trace-prompt');
    const canvasHost = el('div', 'qk-trace-canvas');
    canvasHost.setAttribute('aria-label', this.mode.title || this.config.title);
    canvasHost.addEventListener('pointerdown', (e) => this.handleStagePointerDown(e), { passive: false });
    stage.append(prompt, canvasHost);

    const sound = this.renderImageButton('qk-trace-sound', this.config.copy.replay);
    sound.addEventListener('click', () => this.replayPromptFromHud());
    root.append(hud, stage, sound);
    this.mountEl.appendChild(root);
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-trace-canvas');
    if (!host) return false;
    const generation = ++this.stageGeneration;
    const stage = await createStage(host);
    if (this.destroyed || this.screen !== 'play' || generation !== this.stageGeneration) {
      stage.destroy();
      return false;
    }
    this.stage = stage;
    this.removeResize = stage.onResize(() => this.layoutField());
    this.tick = (ticker) => this.tickFrame(ticker);
    stage.app.ticker.add(this.tick);
    this.removeTicker = () => stage.app.ticker.remove(this.tick);
    return true;
  }

  disposeStage() {
    this.stageGeneration += 1;
    this.roundGeneration += 1;
    this.cancelDemo();
    this.removeTraceListeners();
    this.activeTrace = null;
    this.cancelTweens();
    this.clearDelays();
    if (this.removeResize) this.removeResize();
    if (this.removeTicker) this.removeTicker();
    this.removeResize = null;
    this.removeTicker = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
    this.fieldLayer = null;
    this.guideLayer = null;
    this.checkpointLayer = null;
    this.inkLayer = null;
    this.fxLayer = null;
    this.demoLayer = null;
    this.traveler = null;
    this.demoDot = null;
    this.demoTrail = null;
    this.completionShimmer = null;
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play' || !this.stage) return;
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.cancelTweens();
    this.roundIndex = index;
    this.currentPath = this.roundPaths[index];
    this.currentStrokes = normalizePathPoints(this.currentPath.points);
    this.strokeIndex = 0;
    this.strokeProgress = this.currentStrokes.map(() => ({ index: 0, ratio: 0 }));
    this.strokesScreen = [];
    this.pathBounds = null;
    this.checkpoints = [];
    this.startMarkers = [];
    this.inkPoints = this.currentStrokes.map(() => []);
    this.inkDirty = false;
    this.inkTargetAlpha = 1;
    this.pointerQueueCount = 0;
    this.brushReady = false;
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.wanderNudged = false;
    const generation = ++this.roundGeneration;

    this.updateDots();
    const prompt = this.mountEl.querySelector('.qk-trace-prompt');
    if (prompt) prompt.textContent = this.currentPrompt();
    await this.createRoundScene(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutField();
    this.positionTravelerAtCurrentStart();
    this.awaitingInput = true;
    this.inputLocked = false;
    this.speakLine(this.currentPrompt());
    this.scheduleIdlePrompt();
    this.playDemo();
    await this.delay(WAIT_FOR_INPUT_MS);
  }

  async createRoundScene(generation) {
    const { PIXI } = this.stage;
    const scene = new PIXI.Container();
    const field = new PIXI.Container();
    const guide = new PIXI.Container();
    const checkpoints = new PIXI.Container();
    const ink = new PIXI.Container();
    const fx = new PIXI.Container();
    const demo = new PIXI.Container();
    const panel = new PIXI.Graphics();
    const panelTheme = this.config.theme.panel || {};
    const hasPanelTheme = this.config.theme.panel && typeof this.config.theme.panel === 'object';
    panel.roundRect(0, 0, BOARD_SIZE, BOARD_SIZE, 42)
      .fill({ color: panelTheme.fill ?? 0xfffbef, alpha: hasPanelTheme ? 0.9 : 0 })
      .stroke({ width: hasPanelTheme ? 9 : 0, color: panelTheme.stroke ?? 0xffffff, alpha: 0.96 });
    field.addChild(panel, guide, checkpoints, ink, fx, demo);
    scene.addChild(field);
    this.scene = scene;
    this.fieldLayer = field;
    this.guideLayer = guide;
    this.checkpointLayer = checkpoints;
    this.inkLayer = ink;
    this.fxLayer = fx;
    this.demoLayer = demo;
    this.guideGraphics = [];
    this.inkGraphics = [];

    for (let i = 0; i < this.currentStrokes.length; i++) {
      const guideGraphic = new PIXI.Graphics();
      const inkGraphic = new PIXI.Graphics();
      guide.addChild(guideGraphic);
      ink.addChild(inkGraphic);
      this.guideGraphics.push(guideGraphic);
      this.inkGraphics.push(inkGraphic);
      this.buildCheckpointViews(i);
    }

    const traveler = await artObj(PIXI, this.mode.traveler || this.config.traveler, 62, '');
    if (!this.roundIsCurrent(generation)) {
      traveler.destroy({ children: true });
      return;
    }
    const travelerHalo = new PIXI.Graphics();
    travelerHalo.circle(0, 0, 43).fill({ color: 0xffffff, alpha: 0.8 })
      .stroke({ width: 4, color: 0xffffff, alpha: 0.96 });
    const travelerWrap = new PIXI.Container();
    travelerWrap.addChild(travelerHalo, traveler);
    fx.addChild(travelerWrap);
    this.traveler = travelerWrap;

    const trail = new PIXI.Graphics();
    const dotGlow = new PIXI.Graphics();
    dotGlow.circle(0, 0, 30).fill({ color: 0xffd166, alpha: 0.2 });
    dotGlow.circle(0, 0, 18).fill(0xffd166).stroke({ width: 5, color: 0xffffff });
    demo.addChild(trail, dotGlow);
    this.demoTrail = trail;
    this.demoDot = dotGlow;
    this.demoDot.visible = false;
    this.stage.setScene(scene);
  }

  buildCheckpointViews(strokeIndex) {
    const { PIXI } = this.stage;
    const control = this.currentStrokes[strokeIndex];
    const list = [];
    for (let i = 0; i < control.length; i++) {
      const point = control[i];
      const dot = new PIXI.Graphics();
      const isStart = i === 0;
      if (isStart) {
        dot.circle(0, 0, 52).fill({ color: 0xffd166, alpha: 0.96 })
          .stroke({ width: 6, color: 0xffffff });
        const next = control[1];
        if (next) {
          const direction = Math.atan2(next.y - point.y, next.x - point.x);
          const pointer = new PIXI.Graphics();
          pointer.moveTo(30, -13).lineTo(63, 0).lineTo(30, 13).closePath()
            .fill(0xffd166).stroke({ width: 5, color: 0xffffff, join: 'round' });
          pointer.rotation = direction;
          dot.addChild(pointer);
        }
        const arrow = new PIXI.Text({
          text: this.reducedMotion() ? String(strokeIndex + 1) : this.mode.startMarker,
          style: { fontFamily: 'Fredoka, sans-serif', fontSize: 46, fill: 0x17517e, align: 'center' },
        });
        arrow.anchor.set(0.5);
        dot.addChild(arrow);
        this.startMarkers.push({ strokeIndex, view: dot });
      } else {
        dot.circle(0, 0, 11).fill({ color: 0xffffff, alpha: 0.9 })
          .stroke({ width: 4, color: 0x2d7dd2, alpha: 0.38 });
      }
      dot.position.set(point.x, point.y);
      dot.alpha = isStart ? 0.72 : 0.82;
      this.checkpointLayer.addChild(dot);
      list.push({ view: dot, controlIndex: i, sampleIndex: 0, lit: false, isStart });
    }
    this.checkpoints[strokeIndex] = list;
  }

  layoutField() {
    if (!this.stage || !this.scene || !this.fieldLayer) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;
    const pad = Math.max(8, Math.min(24, Math.min(w, h) * 0.025));
    const size = Math.max(180, Math.min(w - pad * 2, h - pad * 2));
    this.boardScale = size / BOARD_SIZE;
    this.boardLeft = (w - size) / 2;
    this.boardTop = (h - size) / 2;
    this.fieldLayer.position.set(this.boardLeft, this.boardTop);
    this.fieldLayer.scale.set(this.boardScale);
    this.rebuildProjectedStrokes();
    this.drawGuides();
    this.drawAllInk();
    this.updateCheckpointStates(false);
    this.positionTravelerAtCurrentProgress();
  }

  rebuildProjectedStrokes() {
    this.strokesScreen = this.currentStrokes.map((control, index) => {
      const local = sampleSmoothStroke(control, Math.max(4, SAMPLE_STEP_PX / this.boardScale));
      const points = local.map((point) => this.screenPointFor(this.fieldLayer, point.x, point.y));
      const lengths = cumulativeLengths(points);
      const totalLength = lengths.length ? lengths[lengths.length - 1] : 0;
      const checkpoints = this.checkpoints[index] || [];
      for (const checkpoint of checkpoints) {
        const cp = control[checkpoint.controlIndex];
        checkpoint.sampleIndex = nearestPointIndex(local, cp);
      }
      return { index, local, points, lengths, totalLength };
    });
    const all = [];
    for (const stroke of this.strokesScreen) {
      for (const point of stroke.points) if (point) all.push(point);
    }
    this.pathBounds = boundsFromPoints(all, this.mode.tolerance || this.config.tolerance);
  }

  drawGuides() {
    const accent = colorNumber(this.config.theme.accent, 0x17517e);
    for (let strokeIndex = 0; strokeIndex < this.strokesScreen.length; strokeIndex++) {
      const graphic = this.guideGraphics[strokeIndex];
      const local = this.strokesScreen[strokeIndex].local;
      if (!graphic) continue;
      graphic.clear();
      // Pixi Graphics has no portable dash primitive; rounded beads create the
      // same forgiving dotted road while keeping geometry very cheap.
      const stride = Math.max(1, Math.round(24 / Math.max(1, SAMPLE_STEP_PX)));
      for (let i = 0; i < local.length; i += stride) {
        const point = local[i];
        if (point) graphic.circle(point.x, point.y, GUIDE_WIDTH * 0.22).fill({ color: accent, alpha: 0.34 });
      }
    }
  }

  drawAllInk() {
    for (let i = 0; i < this.inkGraphics.length; i++) this.drawInk(i);
    this.inkDirty = false;
  }

  drawInk(index) {
    const graphic = this.inkGraphics[index];
    const points = this.inkPoints[index] || [];
    if (!graphic) return;
    graphic.clear();
    if (!points.length) return;
    const color = colorNumber(this.mode.strokeColor || this.config.strokeColor, 0xe8734a);
    if (points.length === 1) {
      graphic.circle(points[0].x, points[0].y, INK_WIDTH / 2).fill({ color, alpha: 0.94 });
      return;
    }
    graphic.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      const point = points[i];
      if (point) graphic.lineTo(point.x, point.y);
    }
    graphic.stroke({ width: INK_WIDTH, color, alpha: 0.94, cap: 'round', join: 'round' });
  }

  renderImageButton(className, label, href) {
    const node = href ? el('a', `qk-trace-img-btn ${className}`) : el('button', `qk-trace-img-btn ${className}`);
    if (href) node.href = href;
    else node.type = 'button';
    node.setAttribute('aria-label', label);
    node.addEventListener('pointerdown', (e) => {
      if (!href) e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      this.playSfx('tick');
    });
    return node;
  }

  handleStagePointerDown(e) {
    if (!this.hasActiveIncompletePath() || this.activeTrace || e.isPrimary === false) return;
    e.preventDefault();
    this.unlockAudio();
    this.cancelDemo();
    this.clearIdleTimer();
    const targetId = this.isNearCurrentStart(e.clientX, e.clientY) ? `start:${this.strokeIndex}` : 'path';
    this.handleTargetAction(targetId);
    this.activeTrace = { pointerId: e.pointerId, offPath: false };
    this.queuePointer(e.clientX, e.clientY);
    this.brushReady = false;
    window.addEventListener('pointermove', this.onWindowMove, { passive: false });
    window.addEventListener('pointerup', this.onWindowUp, { passive: false });
    window.addEventListener('pointercancel', this.onWindowCancel, { passive: false });
    // Pointerdown is processed immediately so a tap at the final checkpoint is
    // not lost before the next animation frame.
    this.consumePointer();
  }

  handleWindowMove(e) {
    const trace = this.activeTrace;
    if (!trace || e.pointerId !== trace.pointerId || e.isPrimary === false) return;
    if (!this.hasActiveIncompletePath()) {
      this.cancelTrace();
      return;
    }
    e.preventDefault();
    this.queuePointer(e.clientX, e.clientY);
  }

  handleWindowUp(e) {
    const trace = this.activeTrace;
    if (!trace || e.pointerId !== trace.pointerId || e.isPrimary === false) return;
    e.preventDefault();
    this.queuePointer(e.clientX, e.clientY);
    this.consumePointer();
    this.cancelTrace();
    if (this.awaitingInput) this.scheduleIdlePrompt();
  }

  handleWindowCancel(e) {
    const trace = this.activeTrace;
    if (!trace || e.pointerId !== trace.pointerId || e.isPrimary === false) return;
    e.preventDefault();
    this.consumePointer();
    this.cancelTrace();
    if (this.awaitingInput) this.scheduleIdlePrompt();
  }

  cancelTrace() {
    this.removeTraceListeners();
    this.activeTrace = null;
    this.pointerQueueCount = 0;
    this.brushReady = false;
    this.clearWanderTimer();
    this.setGuideWandering(false);
  }

  removeTraceListeners() {
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowCancel);
  }

  tickFrame(ticker) {
    if (this.pointerQueueCount) this.consumePointer();
    this.tickBrush(ticker && ticker.deltaTime ? ticker.deltaTime : 1);
    this.tickDemo();
    this.tickCompletionShimmer();
    this.tickGuidePulse(ticker && ticker.deltaTime ? ticker.deltaTime : 1);
    this.tickInkSoftness(ticker && ticker.deltaTime ? ticker.deltaTime : 1);
    if (this.inkDirty) this.drawAllInk();
  }

  consumePointer() {
    const count = this.pointerQueueCount;
    if (!count) return;
    this.pointerQueueCount = 0;
    for (let i = 0; i < count; i++) {
      this.applyTracePointXY(this.pointerQueue[i * 2], this.pointerQueue[i * 2 + 1], true);
    }
  }

  queuePointer(x, y) {
    const capacity = this.pointerQueue.length / 2;
    const index = Math.min(this.pointerQueueCount, capacity - 1);
    this.pointerQueue[index * 2] = x;
    this.pointerQueue[index * 2 + 1] = y;
    if (this.pointerQueueCount < capacity) this.pointerQueueCount += 1;
  }

  applyTracePoint(point) {
    if (!point) return false;
    const strokeIndex = this.strokeIndex;
    const accepted = this.applyTracePointXY(point.x, point.y, false);
    // Debug automation still paints through the same accepted-point path so a
    // QLOBE_DEBUG-driven round looks like a child's completed trace.
    if (accepted) {
      const local = this.localPointFromScreen(point.x, point.y);
      if (local) this.appendInkPointAt(strokeIndex, local.x, local.y);
    }
    return accepted;
  }

  applyTracePointXY(x, y, paint) {
    if (!this.hasActiveIncompletePath() || !Number.isFinite(x) || !Number.isFinite(y)) return false;
    const stroke = this.currentScreenStroke();
    const current = this.strokeProgress[this.strokeIndex] || { index: 0, ratio: 0 };
    const currentIndex = Math.min(Math.max(0, Number(current.index) || 0), stroke.points.length - 1);
    const start = Math.max(0, currentIndex - SEARCH_BACK);
    const end = Math.min(stroke.points.length - 1, currentIndex + SEARCH_AHEAD);
    let bestIndex = currentIndex;
    let bestDistance = Infinity;
    for (let i = start; i <= end; i++) {
      const candidate = stroke.points[i];
      if (!candidate) continue;
      const dx = x - candidate.x;
      const dy = y - candidate.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
    if (!Number.isFinite(bestDistance)) return false;
    const tolerance = this.mode.tolerance || this.config.tolerance;
    if (bestDistance > tolerance) {
      this.handleWander();
      if (paint) this.softenCurrentInk();
      return false;
    }

    this.clearWanderTimer();
    this.setGuideWandering(false);
    if (this.activeTrace) this.activeTrace.offPath = false;
    if (bestIndex > currentIndex) {
      const ratio = stroke.totalLength > 0 ? stroke.lengths[bestIndex] / stroke.totalLength : 1;
      this.strokeProgress[this.strokeIndex] = { index: bestIndex, ratio };
      this.lightPassedCheckpoints(this.strokeIndex, bestIndex);
      this.positionTravelerLocal(stroke.local[bestIndex]);
    } else {
      this.positionTravelerScreen(x, y);
    }
    if (paint) {
      const local = this.localPointFromScreen(x, y);
      if (local) {
        this.brushX = local.x;
        this.brushY = local.y;
        if (!this.brushReady) {
          this.brushReady = true;
          this.appendInkPoint(local.x, local.y);
        }
      }
    }
    if (bestIndex >= stroke.points.length - 2 || (stroke.totalLength - stroke.lengths[bestIndex]) <= tolerance * 0.45) {
      this.completeStroke();
    }
    return true;
  }

  tickBrush(delta) {
    if (!this.activeTrace || !this.brushReady || !this.hasActiveIncompletePath()) return;
    const list = this.inkPoints[this.strokeIndex];
    if (!list || !list.length) return;
    const last = list[list.length - 1];
    const spring = this.reducedMotion() ? 1 : Math.min(0.62, 0.28 * delta);
    const x = last.x + (this.brushX - last.x) * spring;
    const y = last.y + (this.brushY - last.y) * spring;
    if (Math.hypot(x - last.x, y - last.y) >= 2.2 || Math.hypot(this.brushX - last.x, this.brushY - last.y) < 3) {
      this.appendInkPoint(x, y);
    }
  }

  appendInkPoint(x, y) {
    this.appendInkPointAt(this.strokeIndex, x, y);
  }

  appendInkPointAt(strokeIndex, x, y) {
    const list = this.inkPoints[strokeIndex];
    if (!list) return;
    const last = list[list.length - 1];
    if (last && Math.hypot(x - last.x, y - last.y) < 1.2) return;
    list.push({ x, y });
    this.inkDirty = true;
  }

  softenCurrentInk() {
    this.inkTargetAlpha = 0.58;
    if (this.activeTrace) this.activeTrace.offPath = true;
  }

  handleWander() {
    this.setGuideWandering(true);
    if (!this.activeTrace || this.wanderTimer || this.wanderNudged) return;
    this.wanderTimer = window.setTimeout(() => {
      this.wanderTimer = 0;
      if (!this.activeTrace || this.destroyed || !this.awaitingInput || this.wanderNudged) return;
      this.wanderNudged = true;
      this.speakLine(this.config.voice.nudge, true);
    }, WANDER_NUDGE_MS);
  }

  setGuideWandering(wandering) {
    if (!wandering) {
      this.guidePulse = 0;
      this.guideGraphics.forEach((graphic) => { graphic.alpha = 1; });
      this.inkTargetAlpha = 1;
      return;
    }
    if (!this.reducedMotion()) this.guidePulse = Math.max(this.guidePulse, 0.01);
  }

  tickGuidePulse(delta) {
    if (!this.guidePulse || this.reducedMotion()) return;
    this.guidePulse += delta * 0.12;
    const alpha = 0.72 + Math.sin(this.guidePulse) * 0.25;
    this.guideGraphics.forEach((graphic) => { graphic.alpha = alpha; });
  }

  tickInkSoftness(delta) {
    const ink = this.inkGraphics[this.strokeIndex];
    if (!ink) return;
    if (this.reducedMotion()) {
      ink.alpha = this.inkTargetAlpha;
      return;
    }
    const amount = Math.min(1, 0.16 * delta);
    ink.alpha += (this.inkTargetAlpha - ink.alpha) * amount;
  }

  lightPassedCheckpoints(strokeIndex, sampleIndex) {
    const list = this.checkpoints[strokeIndex] || [];
    for (const checkpoint of list) {
      if (checkpoint.lit || checkpoint.sampleIndex > sampleIndex) continue;
      checkpoint.lit = true;
      checkpoint.view.alpha = 1;
      checkpoint.view.tint = 0xffef9a;
      this.playSfx('sparkle');
      if (this.stage && this.fxLayer) sparkle(this.stage.PIXI, this.fxLayer, checkpoint.view.x, checkpoint.view.y);
    }
  }

  updateCheckpointStates(playFx) {
    for (let strokeIndex = 0; strokeIndex < this.checkpoints.length; strokeIndex++) {
      const progress = this.strokeProgress[strokeIndex] || { index: 0 };
      const list = this.checkpoints[strokeIndex] || [];
      for (const checkpoint of list) {
        const wasLit = checkpoint.lit;
        checkpoint.lit = strokeIndex < this.strokeIndex || checkpoint.sampleIndex <= progress.index;
        checkpoint.view.alpha = checkpoint.isStart
          ? (strokeIndex === this.strokeIndex ? 1 : checkpoint.lit ? 0.34 : 0.72)
          : (checkpoint.lit ? 1 : 0.82);
        checkpoint.view.tint = checkpoint.lit ? 0xffef9a : 0xffffff;
        if (playFx && checkpoint.lit && !wasLit) {
          this.playSfx('sparkle');
          sparkle(this.stage.PIXI, this.fxLayer, checkpoint.view.x, checkpoint.view.y);
        }
      }
    }
  }

  async completeStroke() {
    if (!this.hasActiveIncompletePath()) return;
    const stroke = this.currentScreenStroke();
    if (stroke) {
      this.strokeProgress[this.strokeIndex] = { index: stroke.points.length - 1, ratio: 1 };
      this.lightPassedCheckpoints(this.strokeIndex, stroke.points.length - 1);
      this.positionTravelerLocal(stroke.local[stroke.local.length - 1]);
      const end = stroke.local[stroke.local.length - 1];
      if (end) this.appendInkPoint(end.x, end.y);
    }
    this.playSfx('pop');
    if (this.strokeIndex < this.currentStrokes.length - 1) {
      this.strokeIndex += 1;
      this.brushReady = false;
      this.updateCheckpointStates(false);
      this.positionTravelerAtCurrentStart();
      return;
    }
    await this.completeRound();
  }

  async completeRound() {
    if (this.inputLocked || !this.awaitingInput) return;
    this.inputLocked = true;
    this.awaitingInput = false;
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.activeTrace = null;
    this.playSfx('sparkle');
    this.playSfx('pop');

    const generation = this.roundGeneration;
    const shimmer = this.reducedMotion() ? Promise.resolve() : this.shimmerInk();
    const center = this.screenPointFor(this.fieldLayer, BOARD_SIZE / 2, BOARD_SIZE / 2);
    const confetti = center
      ? burst(this.stage.PIXI, this.scene, center.stageX, center.stageY, { count: 36, power: 7, life: 780 })
      : Promise.resolve();
    await Promise.all([shimmer, confetti]);
    await this.speakLine(
      (this.currentPath && this.currentPath.say)
        || this.config.voice.yums[this.roundIndex % this.config.voice.yums.length],
      true,
    );
    await this.delay(this.reducedMotion() ? 100 : 320);
    if (!this.roundIsCurrent(generation)) return;
    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) await this.finishGame();
    else await this.showRound(next);
  }

  async shimmerInk() {
    const ink = this.inkLayer;
    if (!ink) return;
    const progress = { value: 0 };
    this.completionShimmer = { points: this.currentDemoPoints(), progress };
    if (this.demoDot) this.demoDot.visible = true;
    await Promise.all([
      this.runTween(to(progress, { value: 1 }, { ms: 680, easing: ease.inOutSine })),
      (async () => {
        await this.runTween(to(ink, { alpha: 0.58 }, { ms: 150, easing: ease.outQuad }));
        await this.runTween(to(ink, { alpha: 1 }, { ms: 250, easing: ease.outCubic }));
        await this.runTween(to(ink, { alpha: 0.78 }, { ms: 100, easing: ease.outQuad }));
        await this.runTween(to(ink, { alpha: 1 }, { ms: 180, easing: ease.outCubic }));
      })(),
    ]);
    this.completionShimmer = null;
    if (this.demoDot) this.demoDot.visible = false;
    if (this.demoTrail) this.demoTrail.clear();
  }

  async finishGame() {
    if (this.destroyed) return;
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.playSfx('tada');
    this.disposeStage();

    this.mountEl.replaceChildren();
    const root = el('section', 'qk-trace qk-trace-end');
    this.applyTheme(root);
    root.setAttribute('aria-label', this.config.voice.cheer);
    const home = this.renderImageButton('qk-trace-back', 'Back to the game menu');
    home.addEventListener('click', () => { speech.stop(); this.renderSplash(); });
    const center = el('div', 'qk-trace-end-center');
    const artCard = el('div', 'qk-trace-end-art');
    artCard.appendChild(artEl(this.config.endArt || this.config.splashArt, ''));
    const again = el('button', 'qk-trace-again');
    again.type = 'button';
    const icon = el('span', 'qk-trace-play-icon');
    icon.setAttribute('aria-hidden', 'true');
    again.append(icon, el('span', '', this.config.copy.playAgain));
    again.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.unlockAudio();
      this.playSfx('tick');
    });
    again.addEventListener('click', () => this.mode ? this.startMode(this.mode.id) : this.renderSplash());
    center.append(artCard, el('h1', '', this.config.voice.cheer), again);
    root.append(home, center);
    this.mountEl.appendChild(root);
    this.createDomBurst(artCard, 34);
    await this.speakLine(this.config.voice.cheer, true);
  }

  playDemo() {
    if (this.reducedMotion() || !this.demoDot || !this.demoTrail) return;
    const points = this.currentDemoPoints();
    if (!points || points.length < 2) return;
    this.demo = {
      points,
      started: performance.now(),
      duration: Math.min(DEMO_MAX_MS, Math.max(DEMO_MIN_MS, points.length * 18)),
      index: 0,
      trailStart: 0,
    };
    this.demoDot.visible = true;
  }

  currentDemoPoints() {
    const points = [];
    for (const stroke of this.strokesScreen) {
      if (!stroke || !Array.isArray(stroke.local)) continue;
      for (const point of stroke.local) points.push(point);
    }
    return points;
  }

  tickDemo() {
    const demo = this.demo;
    if (!demo || !this.demoDot || !this.demoTrail) return;
    if (this.destroyed || this.screen !== 'play' || this.inputLocked) {
      this.cancelDemo();
      return;
    }
    const t = Math.min(1, (performance.now() - demo.started) / demo.duration);
    const index = Math.min(demo.points.length - 1, Math.floor(t * (demo.points.length - 1)));
    const point = demo.points[index];
    // Projected samples can briefly be sparse while resize/round geometry is
    // rebuilding. Never assume a demo sample has x/y (a historic crash guard).
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return;
    demo.index = index;
    demo.trailStart = Math.max(0, index - 18);
    this.demoDot.position.set(point.x, point.y);
    this.demoTrail.clear();
    let started = false;
    for (let i = demo.trailStart; i <= index; i++) {
      const trailPoint = demo.points[i];
      if (!trailPoint || typeof trailPoint.x !== 'number' || typeof trailPoint.y !== 'number') continue;
      if (!started) {
        this.demoTrail.moveTo(trailPoint.x, trailPoint.y);
        started = true;
      } else {
        this.demoTrail.lineTo(trailPoint.x, trailPoint.y);
      }
    }
    if (started) this.demoTrail.stroke({ width: 18, color: 0xffd166, alpha: 0.34, cap: 'round', join: 'round' });
    if (t >= 1) this.cancelDemo();
  }

  tickCompletionShimmer() {
    const shimmer = this.completionShimmer;
    if (!shimmer || !this.demoDot || !this.demoTrail || !shimmer.points.length) return;
    const index = Math.min(
      shimmer.points.length - 1,
      Math.floor(shimmer.progress.value * (shimmer.points.length - 1)),
    );
    const point = shimmer.points[index];
    // Keep the same sparse-list guard as the teaching demo.
    if (!point || typeof point.x !== 'number' || typeof point.y !== 'number') return;
    this.demoDot.position.set(point.x, point.y);
    this.demoTrail.clear();
    let started = false;
    for (let i = Math.max(0, index - 12); i <= index; i++) {
      const trailPoint = shimmer.points[i];
      if (!trailPoint || typeof trailPoint.x !== 'number' || typeof trailPoint.y !== 'number') continue;
      if (!started) {
        this.demoTrail.moveTo(trailPoint.x, trailPoint.y);
        started = true;
      } else {
        this.demoTrail.lineTo(trailPoint.x, trailPoint.y);
      }
    }
    if (started) {
      this.demoTrail.stroke({ width: 22, color: 0xffffff, alpha: 0.58, cap: 'round', join: 'round' });
    }
  }

  cancelDemo() {
    this.demo = null;
    if (this.demoDot) this.demoDot.visible = false;
    if (this.demoTrail) this.demoTrail.clear();
  }

  replayPromptFromHud() {
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_DEBOUNCE_MS) return;
    this.lastReplay = now;
    this.replayPrompt();
  }

  async replayPrompt() {
    if (this.screen !== 'play' || !this.mode) return;
    this.clearIdleTimer();
    this.playSfx('tick');
    await this.speakLine(this.currentPrompt(), true);
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.speakLine(this.currentPrompt(), true);
    }, IDLE_MS);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  clearWanderTimer() {
    if (!this.wanderTimer) return;
    window.clearTimeout(this.wanderTimer);
    this.wanderTimer = 0;
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-trace-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  positionTravelerAtCurrentStart() {
    const stroke = this.currentScreenStroke();
    if (stroke && stroke.local.length) this.positionTravelerLocal(stroke.local[0]);
  }

  positionTravelerAtCurrentProgress() {
    const stroke = this.currentScreenStroke();
    if (!stroke || !stroke.local.length) return;
    const progress = this.strokeProgress[this.strokeIndex] || { index: 0 };
    this.positionTravelerLocal(stroke.local[Math.min(progress.index, stroke.local.length - 1)]);
  }

  positionTravelerLocal(point) {
    if (this.traveler && point) this.traveler.position.set(point.x, point.y);
  }

  positionTravelerScreen(x, y) {
    const local = this.localPointFromScreen(x, y);
    if (local) this.positionTravelerLocal(local);
  }

  localPointFromScreen(x, y) {
    if (!this.stage || !this.fieldLayer) return null;
    const canvas = this.stage.app.canvas.getBoundingClientRect();
    const size = this.stage.size();
    const stageX = canvas.width ? (x - canvas.left) * size.w / canvas.width : x;
    const stageY = canvas.height ? (y - canvas.top) * size.h / canvas.height : y;
    return this.fieldLayer.toLocal(new this.stage.PIXI.Point(stageX, stageY));
  }

  screenPointFor(view, x, y) {
    if (!this.stage || !view) return null;
    const global = view.toGlobal(new this.stage.PIXI.Point(x, y));
    const canvasRect = this.stage.app.canvas.getBoundingClientRect();
    const stageSize = this.stage.size();
    const scaleX = stageSize.w ? canvasRect.width / stageSize.w : 1;
    const scaleY = stageSize.h ? canvasRect.height / stageSize.h : 1;
    return {
      x: canvasRect.left + global.x * scaleX,
      y: canvasRect.top + global.y * scaleY,
      stageX: global.x,
      stageY: global.y,
    };
  }

  isNearCurrentStart(x, y) {
    const stroke = this.currentScreenStroke();
    const point = stroke && stroke.points[0];
    return point ? Math.hypot(x - point.x, y - point.y) <= TARGET_SIZE / 2 : false;
  }

  hasActiveIncompletePath() {
    if (this.destroyed || this.screen !== 'play' || !this.awaitingInput || this.inputLocked) return false;
    if (!this.currentPath || !this.currentStrokes.length || !this.strokesScreen.length) return false;
    return Boolean(this.currentScreenStroke());
  }

  currentScreenStroke() {
    const stroke = this.strokesScreen[this.strokeIndex];
    if (!stroke || !Array.isArray(stroke.points) || !stroke.points.length) return null;
    return stroke;
  }

  currentPrompt() {
    return (this.currentPath && this.currentPath.prompt)
      || this.mode.prompt
      || this.config.voice.intro
      || (this.currentPath && this.currentPath.name);
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
    const stroke = this.currentScreenStroke();
    const start = stroke && stroke.points[0];
    if (start) {
      targets.push({
        id: `start:${this.strokeIndex}`,
        role: 'correct',
        rect: { x: start.x - TARGET_SIZE / 2, y: start.y - TARGET_SIZE / 2, w: TARGET_SIZE, h: TARGET_SIZE },
      });
    }
    if (this.pathBounds) targets.push({ id: 'path', role: 'neutral', rect: { ...this.pathBounds } });
    return targets;
  }

  async debugTap(targetId) {
    if (this.screen !== 'play' || this.destroyed) return { accepted: false };
    return this.handleTargetAction(targetId);
  }

  async handleTargetAction(targetId) {
    if (targetId === 'path') return { accepted: true };
    if (targetId === `start:${this.strokeIndex}`) {
      await this.speakLine(this.currentPrompt(), true);
      return { accepted: true };
    }
    return { accepted: false };
  }

  async winRound() {
    if (this.screen !== 'play' || this.destroyed) return;
    const requestedRound = this.roundIndex;
    const started = performance.now();
    // tap() and speech are intentionally unawaitable by tests. Wait in humane
    // 120ms turns for the real input path instead of spinning microtasks.
    while (!this.destroyed && this.screen === 'play'
      && (this.roundIndex !== requestedRound || !this.awaitingInput || this.inputLocked || !this.currentScreenStroke())) {
      if (this.roundIndex !== requestedRound || performance.now() - started >= WIN_BAIL_MS) return;
      await this.delay(WIN_RETRY_MS);
    }
    if (this.destroyed || this.screen !== 'play' || this.roundIndex !== requestedRound) return;
    this.clearIdleTimer();
    this.cancelDemo();
    this.clearWanderTimer();
    for (let strokeIndex = this.strokeIndex; strokeIndex < this.strokesScreen.length; strokeIndex++) {
      while (!this.destroyed && this.screen === 'play' && this.roundIndex === requestedRound
        && this.strokeIndex === strokeIndex && (!this.awaitingInput || this.inputLocked)) {
        if (performance.now() - started >= WIN_BAIL_MS) return;
        await this.delay(WIN_RETRY_MS);
      }
      const stroke = this.strokesScreen[strokeIndex];
      if (!stroke) continue;
      for (const point of stroke.points) {
        if (!point || this.destroyed || this.screen !== 'play' || this.roundIndex !== requestedRound) break;
        this.applyTracePoint(point);
        await this.delay(this.reducedMotion() ? 1 : 6);
      }
    }
    while (!this.destroyed && this.screen === 'play' && this.roundIndex === requestedRound) {
      if (performance.now() - started >= WIN_BAIL_MS) return;
      await this.delay(WIN_RETRY_MS);
    }
  }

  tracePoints() {
    if (this.screen !== 'play') return [];
    const points = [];
    for (const stroke of this.strokesScreen) {
      for (const point of stroke.points) if (point) points.push({ x: point.x, y: point.y });
    }
    return points;
  }

  createDomBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-trace') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burstEl = el('div', 'qk-trace-burst');
    burstEl.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burstEl.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;
    for (let i = 0; i < count; i++) {
      const piece = el('span');
      const angle = Math.PI * 2 * i / count;
      const distance = 58 + this.fxRng() * 130;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      piece.style.setProperty('--hue', String(18 + Math.floor(this.fxRng() * 285)));
      piece.style.setProperty('--delay', `${this.fxRng() * 90}ms`);
      burstEl.appendChild(piece);
    }
    host.appendChild(burstEl);
    this.delay(900).then(() => burstEl.remove());
  }

  applyTheme(root) {
    const background = this.config.theme.background;
    if (background) {
      const ref = String(background);
      const url = ref.startsWith('shared:') || ref.startsWith('char:') ? artUrlRef(ref) : ref;
      if (!url) return;
      root.style.backgroundImage = `url("${url.replace(/"/g, '%22')}")`;
      root.style.backgroundSize = 'cover';
      root.style.backgroundPosition = 'center';
    }
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    const value = Number(n) || 0;
    this.rng = mulberry32(value);
    this.fxRng = mulberry32(value + 73);
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

function normalizeConfig(config = {}) {
  const copy = { home: 'Home', replay: 'Hear it again', playAgain: 'Play Again', ...(config.copy || {}) };
  const voice = {
    intro: 'Follow the sparkle with your finger.',
    nudge: 'Find the path and keep going.',
    cheer: 'You traced them all!',
    yums: ['Nice tracing!', 'You did it!', 'Great path!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice tracing!')];
  return {
    ...config,
    id: config.id || 'trace-path',
    title: config.title || 'Trace the Path',
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || 'emoji:⭐'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    traveler: normalizeArtRef(config.traveler || 'emoji:✏️'),
    strokeColor: config.strokeColor || '#e8734a',
    tolerance: Math.max(48, Number(config.tolerance || 64)),
    theme: { ...(config.theme || {}) },
    copy,
    voice,
    modes: (config.modes || []).map((mode) => normalizeMode(mode, config)).filter((mode) => mode.paths.length),
  };
}

function normalizeMode(mode = {}, config = {}) {
  const paths = (mode.paths || []).map((path, index) => ({
    ...path,
    id: path.id || `path-${index}`,
    name: path.name || `Path ${index + 1}`,
    points: path.points,
  })).filter((path) => normalizePathPoints(path.points).length);
  return {
    ...mode,
    id: mode.id || 'play',
    title: mode.title || 'Trace',
    prompt: mode.prompt || (config.voice && config.voice.intro) || '',
    rounds: Math.min(mode.rounds || paths.length, paths.length),
    traveler: normalizeArtRef(mode.traveler || config.traveler || 'emoji:✏️'),
    strokeColor: mode.strokeColor || config.strokeColor || '#e8734a',
    startMarker: mode.startMarker || config.startMarker || '⭐',
    tolerance: Math.max(48, Number(mode.tolerance || config.tolerance || 64)),
    paths,
  };
}

function normalizeArtRef(ref) {
  if (!ref) return 'emoji:⭐';
  if (ref.includes(':')) return ref;
  return `emoji:${ref}`;
}

function normalizePathPoints(points) {
  const strokes = rawStrokes(points);
  const flat = strokes.flat();
  if (!flat.length) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of flat) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const pad = 120;
  const scale = Math.min((BOARD_SIZE - pad * 2) / width, (BOARD_SIZE - pad * 2) / height);
  const offsetX = (BOARD_SIZE - width * scale) / 2 - minX * scale;
  const offsetY = (BOARD_SIZE - height * scale) / 2 - minY * scale;
  return strokes.map((stroke) => stroke.map((point) => ({
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
  })));
}

function rawStrokes(points) {
  if (!Array.isArray(points) || !points.length) return [];
  const maybePoint = points[0];
  const source = Array.isArray(maybePoint) && typeof maybePoint[0] === 'number' ? [points] : points;
  return source.map((stroke) => {
    if (!Array.isArray(stroke)) return [];
    return stroke.map((point) => {
      if (!Array.isArray(point) || point.length < 2) return null;
      const x = Number(point[0]);
      const y = Number(point[1]);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    }).filter(Boolean);
  }).filter((stroke) => stroke.length >= 2);
}

// Match the former SVG quadratic smoothing: start point, quadratic segments to
// successive midpoints, then a final straight segment to the endpoint.
function sampleSmoothStroke(points, step) {
  if (!points.length) return [];
  const result = [{ x: points[0].x, y: points[0].y }];
  if (points.length === 1) return result;
  if (points.length === 2) {
    appendLineSamples(result, points[0], points[1], step);
    return result;
  }
  let from = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i];
    const toPoint = midpoint(points[i], points[i + 1]);
    appendQuadraticSamples(result, from, control, toPoint, step);
    from = toPoint;
  }
  appendLineSamples(result, from, points[points.length - 1], step);
  return result;
}

function appendLineSamples(result, a, b, step) {
  const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    result.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  }
}

function appendQuadraticSamples(result, a, control, b, step) {
  const estimate = Math.hypot(control.x - a.x, control.y - a.y)
    + Math.hypot(b.x - control.x, b.y - control.y);
  const count = Math.max(2, Math.ceil(estimate / step));
  for (let i = 1; i <= count; i++) {
    const t = i / count;
    const u = 1 - t;
    result.push({
      x: u * u * a.x + 2 * u * t * control.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * control.y + t * t * b.y,
    });
  }
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function nearestPointIndex(points, target) {
  let best = 0;
  let distance = Infinity;
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) continue;
    const d = Math.hypot(point.x - target.x, point.y - target.y);
    if (d < distance) {
      distance = d;
      best = i;
    }
  }
  return best;
}

function cumulativeLengths(points) {
  const lengths = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0 && points[i] && points[i - 1]) {
      total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    lengths.push(total);
  }
  return lengths;
}

function boundsFromPoints(points, pad) {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    if (!point) continue;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  if (!Number.isFinite(minX)) return null;
  return { x: minX - pad, y: minY - pad, w: maxX - minX + pad * 2, h: maxY - minY + pad * 2 };
}

function colorNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.replace('#', ''), 16);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
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

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function installStyle() {
  if (styleInstalled || document.getElementById('qk-trace-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-trace-style';
  style.textContent = `
    @font-face { font-family:'Fredoka'; src:url('${FONT_URL}') format('woff2'); font-weight:600; font-style:normal; font-display:swap; }
    .qk-trace,.qk-trace * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
    .qk-trace { --sky:#bee3f5; --navy:#17517e; --blue:#2d7dd2; --green:#58a945; --yellow:#ffd166;
      --coral:#f25f5c; --white:#fff; --shadow:0 6px 0 rgba(23,81,126,.18),0 14px 30px rgba(23,81,126,.18);
      position:relative; width:100%; height:100dvh; min-height:100%; overflow:hidden; color:var(--navy);
      font-family:'Fredoka','Arial Rounded MT Bold','Trebuchet MS',sans-serif; font-weight:600; background-color:var(--sky);
      background-image:radial-gradient(circle at 18% 18%,rgba(255,255,255,.42) 0 8px,transparent 9px),
        radial-gradient(circle at 82% 28%,rgba(255,255,255,.34) 0 12px,transparent 13px),
        radial-gradient(circle at 42% 84%,rgba(255,255,255,.28) 0 9px,transparent 10px);
      background-size:160px 160px,230px 230px,200px 200px; touch-action:manipulation; -webkit-user-select:none;
      user-select:none; -webkit-touch-callout:none; overscroll-behavior:none; }
    .qk-trace button,.qk-trace a { font:inherit; color:inherit; touch-action:manipulation; }
    .qk-trace button { border:0; cursor:pointer; }
    .qk-trace button:focus-visible,.qk-trace a:focus-visible { outline:5px solid rgba(45,125,210,.7); outline-offset:4px; }
    .qk-trace-img-btn { display:grid; place-items:center; width:96px; height:96px; border-radius:50%;
      background:transparent center/84px 84px no-repeat; text-decoration:none; box-shadow:none; }
    .qk-trace-img-btn:active { transform:scale(.93); }
    .qk-trace-home { background-image:url('${HOME_IMG}'); }
    .qk-trace-back { background-image:url('${BACK_IMG}'); }
    .qk-trace-sound { background-image:url('${SOUND_IMG}'); }
    .qk-trace-splash,.qk-trace-end { display:grid; place-items:center; padding:max(18px,env(safe-area-inset-top))
      max(18px,env(safe-area-inset-right)) max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left)); }
    .qk-trace-home, .qk-trace-back { position:absolute; top:max(12px,env(safe-area-inset-top)); left:max(12px,env(safe-area-inset-left)); z-index:5; }
    .qk-trace-splash-center,.qk-trace-end-center { width:min(900px,100%); display:grid; justify-items:center;
      gap:clamp(14px,2.5vmin,24px); text-align:center; padding-top:54px; }
    .qk-trace-splash-art,.qk-trace-end-art { display:grid; place-items:center; width:clamp(150px,26vmin,230px);
      aspect-ratio:1; border-radius:28px; background:linear-gradient(180deg,#fff,#fff3d0); border:5px solid var(--white);
      box-shadow:var(--shadow); --qk-art-size:clamp(82px,16vmin,132px); }
    .qk-trace h1 { margin:0; max-width:13ch; font-size:clamp(38px,7vmin,78px); line-height:.98;
      text-shadow:0 4px 0 rgba(255,255,255,.72); }
    .qk-trace-mode-list { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:18px;
      width:min(760px,100%); margin-top:6px; }
    .qk-trace-mode,.qk-trace-again { min-height:104px; border-radius:26px; border:5px solid var(--white); padding:18px 24px;
      color:var(--white); background:linear-gradient(180deg,rgba(255,255,255,.34),transparent 50%),var(--blue);
      box-shadow:var(--shadow); font-size:clamp(23px,4vmin,36px); line-height:1.05; }
    .qk-trace-mode:nth-child(2n) { background-color:var(--green); }
    .qk-trace-mode:nth-child(3n) { background-color:var(--coral); }
    .qk-trace-mode:active,.qk-trace-again:active { transform:scale(.96); }
    .qk-trace-play { display:grid; grid-template-rows:auto minmax(0,1fr); padding:max(12px,env(safe-area-inset-top))
      max(14px,env(safe-area-inset-right)) max(112px,calc(100px + env(safe-area-inset-bottom))) max(14px,env(safe-area-inset-left)); }
    .qk-trace-hud { position:relative; z-index:4; display:grid; grid-template-columns:96px 1fr 96px; align-items:center; min-height:100px; }
    .qk-trace-hud .qk-trace-home, .qk-trace-hud .qk-trace-back { position:static; grid-column:1; }
    .qk-trace-progress { grid-column:2; justify-self:center; display:flex; align-items:center; justify-content:center; gap:11px; min-height:32px; }
    .qk-trace-dot { width:22px; height:22px; border-radius:50%; border:4px solid var(--white);
      background:rgba(255,255,255,.52); box-shadow:0 3px 0 rgba(23,81,126,.14); }
    .qk-trace-dot.is-current { background:var(--yellow); } .qk-trace-dot.is-filled { background:var(--green); }
    .qk-trace-stage { min-height:0; display:grid; grid-template-rows:auto minmax(0,1fr); gap:clamp(8px,1.6vmin,18px); touch-action:none; }
    .qk-trace-prompt { justify-self:center; max-width:min(900px,92vw); min-height:44px; text-align:center; font-size:clamp(24px,4vmin,44px);
      line-height:1.05; text-shadow:0 3px 0 rgba(255,255,255,.65); pointer-events:none; }
    .qk-trace-canvas { position:relative; min-height:0; width:min(1200px,100%); height:100%; justify-self:center;
      overflow:hidden; border-radius:28px; touch-action:none; }
    .qk-trace-canvas canvas { display:block; width:100%; height:100%; touch-action:none; }
    .qk-trace-sound { position:absolute; left:max(14px,env(safe-area-inset-left)); bottom:max(12px,env(safe-area-inset-bottom)); z-index:5; }
    .qk-trace-again { display:inline-grid; grid-auto-flow:column; align-items:center; justify-content:center; gap:14px;
      min-width:min(430px,84vw); background-color:var(--green); }
    .qk-trace-play-icon { width:46px; height:46px; background:transparent center/contain no-repeat url('${PLAY_IMG}'); }
    .qk-trace-burst { position:absolute; z-index:9; width:1px; height:1px; pointer-events:none; }
    .qk-trace-burst span { position:absolute; width:20px; height:20px; border-radius:50%; background:hsl(var(--hue),78%,58%);
      animation:qk-trace-burst .82s ease-out both; animation-delay:var(--delay); }
    @keyframes qk-trace-burst { from { opacity:1; transform:translate(-50%,-50%) scale(.35); }
      to { opacity:0; transform:translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1.15); } }
    @media (orientation:landscape) and (max-height:620px) {
      .qk-trace-play { grid-template-rows:92px minmax(0,1fr); padding-bottom:max(96px,calc(88px + env(safe-area-inset-bottom))); }
      .qk-trace-hud { min-height:92px; } .qk-trace-prompt { font-size:clamp(22px,5vh,34px); min-height:34px; }
    }
    @media (max-width:560px) { .qk-trace-play { padding-left:max(8px,env(safe-area-inset-left)); padding-right:max(8px,env(safe-area-inset-right)); } }
    @media (prefers-reduced-motion:reduce) { .qk-trace *,.qk-trace *::before,.qk-trace *::after {
      animation-duration:.001ms !important; transition-duration:.001ms !important; scroll-behavior:auto !important; }
      .qk-trace-burst { display:none !important; } }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
