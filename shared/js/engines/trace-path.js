// trace-path.js — Stage v2 archetype for friendly finger tracing.
//
// DOM owns the splash, HUD, prompt, and end screen. Pixi owns the play-field:
// guide dashes/checkpoints, the child's ink, traveler, demo comet, and particles.
// Pointer lifecycle lives on window so an interrupted stroke can never strand
// input. Progress already earned is kept after pointercancel or window blur.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import * as voiceClips from '../voice-clips.js';
import { onTap } from '../tap.js';
import { mulberry32, hashString, shuffle } from '../rng.js';
import { createTimers } from '../timers.js';
import { installDebug } from '../debug-harness.js';
import { createScreens, wireEndScreen } from '../screens.js';
import { renderModeCards } from '../mode-select.js';
import { installEngineStyles } from './engine-styles.js';
import { artEl } from './art.js';
import { createStage } from '../stage/stage.js';
import { to, ease } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef } from '../stage/art-pixi.js';

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
    // The engine keeps its own delay registry (clearDelays() RESOLVES pending
    // waits so an awaiting flow finishes instead of stalling -- timers.js
    // clearAll() deliberately does the opposite). The group is here purely as
    // the scale holder `fastTimers()` turns, read back through `timers.ms()`.
    this.timers = createTimers();
    this.destroyed = false;

    // The screen router owns "which screen is live" — this.screen is a getter
    // over it, never a second copy of the fact (docs/shared-platform-refactor.md §4a).
    this.screens = null;
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
    this.muted = false;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.wanderTimer = 0;
    this.wanderNudged = false;
    this.drivingReplay = false;
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
    this.actualTraveler = null;
    this.ghostTraveler = null;
    this.rewardVisual = null;
    this.rewardRevealed = false;
    this.destinationView = null;
    this.decorLayer = null;
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

    this.buildShell();
    this.renderSplash();
    this.ready = this.config.voiceClips
      ? voiceClips.init(
        this.config.voiceClips.manifest,
        this.config.voiceClips.lines,
        voiceDefaults(this.config),
      )
      : Promise.resolve();
    this.installDebugHook();
  }

  /** @returns {'splash'|'play'|'end'} the live screen, straight from the router */
  get screen() {
    return this.screens ? this.screens.current : 'splash';
  }

  /**
   * The three screens, built once and toggled by the router, instead of one
   * mount whose content is thrown away on every transition. Each section keeps
   * the exact class list it rendered with before, plus the shared `qk-eng-*`
   * vocabulary from shared/css/engine-base.css.
   */
  buildShell() {
    this.mountEl.replaceChildren(
      el('section', 'qk-trace qk-trace-splash qk-eng-root qk-eng-surface qk-eng-page'),
      el('section', 'qk-trace qk-trace-play qk-eng-root qk-eng-surface qk-eng-play'),
      el('section', 'qk-trace qk-trace-end qk-eng-root qk-eng-surface qk-eng-page'),
    );
    this.screens = createScreens({
      root: this.mountEl,
      screens: {
        splash: this.mountEl.querySelector('.qk-trace-splash'),
        play: this.mountEl.querySelector('.qk-trace-play'),
        end: this.mountEl.querySelector('.qk-trace-end'),
      },
      initial: 'splash',
      voice: { stop: () => this.stopVoice() },
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.disposeStage();
    this.stopVoice();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gesturestart', this.onGestureStart);
    window.removeEventListener('blur', this.onWindowBlur);
    if (this.screens) { this.screens.destroy(); this.screens = null; }
    this.mountEl.replaceChildren();
    if (this.disposeDebug) { this.disposeDebug(); this.disposeDebug = null; }
  }

  unlockAudio() {
    // Every qualifying gesture re-runs these — iPadOS can suspend the
    // AudioContext after app switch/lock, and a one-shot gate would leave
    // audio dead for the rest of the session. unlock() calls are idempotent.
    sfx.unlock();
    speech.unlock();
    if (this.config.voiceClips) voiceClips.unlock();
  }

  installDebugHook() {
    this.disposeDebug = installDebug({
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
      traceStrokes: () => this.traceStrokes(),
      mute: () => this.mute(),
      seed: (n) => this.seed(n),
      timers: this.timers,
    });
  }

  renderSplash() {
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.disposeStage();
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.stopVoice();

    const splash = this.screens.el('splash');
    // show() is IDEMPOTENT: re-entering the splash we are already on would not
    // run its bag, so release it by hand before the markup underneath changes.
    this.screens.release('splash');
    this.screens.show('splash');
    splash.replaceChildren();
    this.applyTheme(splash);
    splash.setAttribute('aria-label', this.config.title);
    const home = this.renderImageButton(
      'qk-trace-home', this.config.copy.home, HOME_HREF, null,
      'qk-eng-ico-home qk-eng-corner-tl',
    );
    const center = el('div', 'qk-trace-splash-center qk-eng-center');
    const artCard = el('div', 'qk-trace-splash-art qk-eng-card');
    artCard.appendChild(artEl(this.config.splashArt, this.config.title));
    const modeList = el('div', 'qk-trace-mode-list qk-eng-mode-list');
    const picker = renderModeCards({
      host: modeList,
      modes: this.config.modes,
      // The engine paints its own cards (engine-base.css `.qk-eng-mode`), so the
      // screens.css card skin stays off — `skin: false` is what keeps every pixel.
      skin: false,
      cardClass: 'qk-trace-mode qk-eng-mode',
      feedback: (e) => {
        e.preventDefault();
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
    const homeLink = splash.querySelector('a.qk-trace-home');
    if (homeLink) this.screens.hold(() => homeLink.remove());
    this.screens.hold(picker.dispose);
    center.append(artCard, el('h1', 'qk-eng-title', this.config.title), modeList);
    splash.append(home, center);
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
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.disposeStage();
    this.stopVoice();
    this.mode = mode;
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
    const play = this.screens.el('play');
    // Restarting a mode from the play screen re-renders in place, and show() is
    // idempotent — release the live tap handlers before the DOM under them goes.
    this.screens.release('play');
    this.screens.show('play');
    play.replaceChildren();
    this.applyTheme(play);
    play.setAttribute('aria-label', this.mode.title || this.config.title);
    const hud = el('header', 'qk-trace-hud qk-eng-hud');
    const home = this.renderImageButton('qk-trace-back', 'Back to the game menu', null, () => {
      this.stopVoice();
      this.renderSplash();
    }, 'qk-eng-ico-back qk-eng-corner-tl');
    const progress = el('div', 'qk-trace-progress');
    progress.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < this.roundsTotal; i++) progress.appendChild(el('span', 'qk-trace-dot qk-eng-dot-ring'));
    hud.append(home, progress, el('span', 'qk-trace-hud-spacer'));

    const stage = el('main', 'qk-trace-stage');
    const prompt = el('div', 'qk-trace-prompt');
    const canvasHost = el('div', 'qk-trace-canvas');
    canvasHost.setAttribute('aria-label', this.mode.title || this.config.title);
    const onStagePointerDown = (e) => this.handleStagePointerDown(e);
    canvasHost.addEventListener('pointerdown', onStagePointerDown, { passive: false });
    this.screens.hold(() => canvasHost.removeEventListener('pointerdown', onStagePointerDown));
    stage.append(prompt, canvasHost);

    const sound = this.renderImageButton(
      'qk-trace-sound',
      this.config.copy.replay,
      null,
      () => this.replayPromptFromHud(),
      'qk-eng-ico-sound qk-eng-corner-bl',
    );
    play.append(hud, stage, sound);
  }

  async createPlayStage() {
    const host = this.screens.el('play').querySelector('.qk-trace-canvas');
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
    this.actualTraveler = null;
    this.ghostTraveler = null;
    this.rewardVisual = null;
    this.rewardRevealed = false;
    this.destinationView = null;
    this.decorLayer = null;
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
    this.destinationView = null;
    this.idlePrompted = false;
    this.wanderNudged = false;
    const generation = ++this.roundGeneration;

    this.updateDots();
    this.renderCurrentPrompt();
    await this.createRoundScene(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutField();
    this.positionTravelerAtCurrentStart();
    this.positionActualTravelerAtRouteStart();
    this.awaitingInput = true;
    this.inputLocked = false;
    this.speakLine(this.currentPrompt(), this.currentPromptKey());
    this.scheduleIdlePrompt();
    this.playDemo();
    await this.delay(WAIT_FOR_INPUT_MS);
  }

  async createRoundScene(generation) {
    const { PIXI } = this.stage;
    const scene = new PIXI.Container();
    const field = new PIXI.Container();
    const decor = new PIXI.Container();
    const destination = new PIXI.Container();
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
    field.addChild(panel, decor, guide, checkpoints, ink, destination, fx, demo);
    scene.addChild(field);
    this.scene = scene;
    this.fieldLayer = field;
    this.decorLayer = decor;
    this.guideLayer = guide;
    this.checkpointLayer = checkpoints;
    this.inkLayer = ink;
    this.fxLayer = fx;
    this.demoLayer = demo;
    this.guideGraphics = [];
    this.inkGraphics = [];
    await this.buildTownDecorations(decor, destination, generation);
    if (!this.roundIsCurrent(generation)) return;

    for (let i = 0; i < this.currentStrokes.length; i++) {
      const guideGraphic = new PIXI.Graphics();
      const inkGraphic = new PIXI.Graphics();
      guide.addChild(guideGraphic);
      ink.addChild(inkGraphic);
      this.guideGraphics.push(guideGraphic);
      this.inkGraphics.push(inkGraphic);
      this.buildCheckpointViews(i);
    }

    const travelerRef = this.currentPath.traveler || this.mode.traveler || this.config.traveler;
    const travelerSize = this.currentPath.travelerSize || this.mode.travelerSize || this.config.travelerSize;
    const rewardLetter = String(this.currentPath.id || '').charAt(0).toLowerCase();
    const rewardArtBase = this.config.rewardArtBase || 'game:assets/rewards/final/';
    const rewardRef = this.currentPath.rewardArt
      || (rewardLetter ? `${rewardArtBase}${rewardLetter}.png` : null);
    const [actualArt, ghostArt, rewardArt] = await Promise.all([
      artObj(PIXI, travelerRef, travelerSize, this.currentPath.carName || ''),
      this.config.ghostTrace
        ? artObj(PIXI, travelerRef, travelerSize, this.currentPath.carName || '')
        : Promise.resolve(null),
      this.config.rewardVisuals && rewardRef
        ? artObj(
          PIXI,
          rewardRef,
          this.currentPath.rewardSize || this.config.rewardSize || 430,
          `${this.currentPath.destination || 'Destination'} reward`,
        )
        : Promise.resolve(null),
    ]);
    if (!this.roundIsCurrent(generation)) {
      actualArt.destroy({ children: true });
      if (ghostArt) ghostArt.destroy({ children: true });
      if (rewardArt) rewardArt.destroy({ children: true });
      return;
    }
    const travelerHaloRadius = Math.max(43, travelerSize * 0.54);
    const actualHalo = new PIXI.Graphics();
    actualHalo.circle(0, 0, travelerHaloRadius).fill({ color: 0xffdc4a, alpha: 0.28 })
      .stroke({ width: 5, color: 0xffffff, alpha: 0.92 });
    const actualWrap = new PIXI.Container();
    actualWrap.addChild(actualHalo, actualArt);
    fx.addChild(actualWrap);
    this.actualTraveler = actualWrap;

    if (ghostArt) {
      const ghostHalo = new PIXI.Graphics();
      ghostHalo.circle(0, 0, travelerHaloRadius).fill({ color: 0xffffff, alpha: 0.28 })
        .stroke({ width: 5, color: 0xffffff, alpha: 0.72 });
      const ghostWrap = new PIXI.Container();
      ghostWrap.addChild(ghostHalo, ghostArt);
      ghostWrap.alpha = 0.48;
      fx.addChild(ghostWrap);
      this.ghostTraveler = ghostWrap;
      this.traveler = ghostWrap;
    } else {
      this.traveler = actualWrap;
    }

    if (rewardArt) {
      const rewardWrap = new PIXI.Container();
      rewardWrap.addChild(rewardArt);
      rewardWrap.visible = false;
      rewardWrap.alpha = 0;
      rewardWrap.scale.set(0.28);
      fx.addChild(rewardWrap);
      this.rewardVisual = rewardWrap;
      this.rewardRevealed = false;
      this.positionRewardVisual();
    }

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

  async buildTownDecorations(container, destinationContainer, generation) {
    if (!container || !this.stage || !this.currentPath) return;
    // Generated map sprites are an opt-in theme capability. Other trace-path
    // games keep their original undecorated boards and never request
    // Letter Road-specific assets.
    if (!this.config.mapSprites) return;
    const { PIXI } = this.stage;
    const destination = Array.isArray(this.currentPath.destinationPosition)
      ? {
        x: clamp(Number(this.currentPath.destinationPosition[0]) || 820, 110, 890),
        y: clamp(Number(this.currentPath.destinationPosition[1]) || 820, 120, 880),
      }
      : { x: 830, y: 820 };
    const destinationName = this.currentPath.destination || 'Letter Stop';
    const destinationId = this.currentPath.destinationArtId || slugify(destinationName);
    const destinationArt = await artObj(
      PIXI,
      this.currentPath.destinationArt || mapArtRef('destinations', destinationId),
      230,
      destinationName,
    );
    if (!this.roundIsCurrent(generation)) {
      destinationArt.destroy({ children: true });
      return;
    }
    const destinationView = townDestination(
      PIXI,
      destinationName,
      letterFromPath(this.currentPath),
      colorNumber(this.currentPath.destinationColor, 0xef5b45),
      destinationArt,
    );
    destinationView.position.set(destination.x, destination.y);
    (destinationContainer || container).addChild(destinationView);
    this.destinationView = destinationView;

    const candidates = [
      { x: 125, y: 145 }, { x: 500, y: 125 }, { x: 875, y: 145 },
      { x: 120, y: 430 }, { x: 500, y: 390 }, { x: 875, y: 430 },
      { x: 125, y: 790 }, { x: 500, y: 860 }, { x: 875, y: 790 },
      { x: 340, y: 520 }, { x: 660, y: 520 }, { x: 500, y: 670 },
    ];
    const safe = candidates.filter((point) =>
      Math.hypot(point.x - destination.x, point.y - destination.y) > 190
      && distanceToStrokes(point, this.currentStrokes) > 125);
    const kinds = [
      ['tree', 152], ['flower-bed', 138], ['lamp', 118], ['bench', 134],
      ['fountain', 158], ['cottage', 170], ['mailbox', 112],
      ['picket-fence', 132], ['topiary', 118], ['hydrant', 102],
      ['signpost', 112], ['pond', 142], ['swings', 152],
      ['gazebo', 162], ['picnic-table', 148],
    ];
    const offset = hashString(this.currentPath.id || '') % kinds.length;
    const placed = safe.slice(0, 5);
    const propSpecs = placed.map((_, index) => kinds[(index + offset) % kinds.length]);
    const props = await Promise.all(propSpecs.map(([kind, size]) =>
      artObj(PIXI, mapArtRef('props', kind), size, kind)));
    if (!this.roundIsCurrent(generation)) {
      props.forEach((prop) => prop.destroy({ children: true }));
      return;
    }
    placed.forEach((point, index) => {
      const prop = props[index];
      prop.position.set(point.x, point.y);
      prop.alpha = 0.98;
      container.addChild(prop);
    });
    const random = mulberry32(hashString(this.currentPath.id || '') + 911);
    const detailKinds = [['flowers', 40], ['pebbles', 34], ['grass', 38]];
    let sprinkled = 0;
    const sprinklePoints = [];
    for (let attempt = 0; attempt < 40 && sprinkled < 10; attempt++) {
      const point = { x: 78 + random() * 844, y: 92 + random() * 800 };
      if (Math.hypot(point.x - destination.x, point.y - destination.y) < 145) continue;
      if (distanceToStrokes(point, this.currentStrokes) < 104) continue;
      if (placed.some((item) => Math.hypot(point.x - item.x, point.y - item.y) < 82)) continue;
      sprinklePoints.push({ ...point, spec: detailKinds[sprinkled % detailKinds.length] });
      sprinkled += 1;
    }
    const details = await Promise.all(sprinklePoints.map(({ spec: [kind, size] }) =>
      artObj(PIXI, mapArtRef('props', kind), size, kind)));
    if (!this.roundIsCurrent(generation)) {
      details.forEach((detail) => detail.destroy({ children: true }));
      return;
    }
    details.forEach((detail, index) => {
      detail.position.set(sprinklePoints[index].x, sprinklePoints[index].y);
      detail.alpha = 0.92;
      container.addChild(detail);
    });
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
          text: (this.mode.numberedStarts || this.reducedMotion())
            ? String(strokeIndex + 1)
            : this.mode.startMarker,
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
    this.positionActualTravelerAtRouteStart();
    this.positionRewardVisual();
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
      if ((this.mode.guideStyle || this.config.guideStyle) === 'road') {
        drawPolyline(graphic, local);
        graphic.stroke({ width: 118, color: 0xd7dce1, alpha: 1, cap: 'round', join: 'round' });
        drawPolyline(graphic, local);
        graphic.stroke({ width: 94, color: 0x505963, alpha: 1, cap: 'round', join: 'round' });
        const dashStride = Math.max(3, Math.round(58 / Math.max(1, SAMPLE_STEP_PX)));
        for (let i = 0; i < local.length; i += dashStride) {
          const point = local[i];
          if (point) graphic.circle(point.x, point.y, 7).fill({ color: 0xffffff, alpha: 0.94 });
        }
        continue;
      }
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

  renderImageButton(className, label, href, action, engClass) {
    const classes = `qk-trace-img-btn ${className} qk-eng-img-btn ${engClass}`;
    const node = href ? el('a', classes) : el('button', classes);
    if (href) node.href = href;
    else node.type = 'button';
    node.setAttribute('aria-label', label);
    // href buttons (e.g. home) navigate natively on click; action is a no-op
    // and onTap never calls preventDefault, so that navigation still fires.
    // Called only once `screens.show()` has made the owning screen current, so
    // hold() lands the disposer on the right screen's teardown bag.
    this.screens.hold(onTap(node, action || (() => {}), {
      feedback: (e) => {
        if (!href) e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.playSfx('tick');
      },
    }));
    return node;
  }

  handleStagePointerDown(e) {
    if (!this.hasActiveIncompletePath() || this.activeTrace || e.isPrimary === false) return;
    e.preventDefault();
    this.unlockAudio();
    this.cancelDemo();
    this.clearIdleTimer();
    if (this.config.ghostTrace && this.actualTraveler && this.ghostTraveler) {
      this.actualTraveler.visible = false;
      this.ghostTraveler.visible = true;
    }
    const targetId = this.isNearCurrentStart(e.clientX, e.clientY) ? `start:${this.strokeIndex}` : 'path';
    this.handleTargetAction(targetId);
    this.playSfx(this.mode.driveSfx || this.config.driveSfx);
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
    const strokeIndex = this.strokeIndex;
    this.pointerQueueCount = 0;
    for (let i = 0; i < count; i++) {
      if (this.strokeIndex !== strokeIndex) break;
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
      this.speakLine(this.config.voice.nudge, this.config.voice.nudgeKey, true);
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
        checkpoint.lit = strokeIndex < this.strokeIndex
          || (!checkpoint.isStart && checkpoint.sampleIndex <= progress.index)
          || (checkpoint.isStart && strokeIndex === this.strokeIndex && progress.ratio > 0);
        checkpoint.view.alpha = checkpoint.isStart
          ? (strokeIndex === this.strokeIndex ? 1 : checkpoint.lit ? 0.34 : 0.9)
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
      // A completed stroke ends the current drag. Otherwise its final
      // pointer sample can also land on the next stroke (the middle and
      // bottom bars of I intersect), immediately pulling the car away from
      // the newly numbered start.
      this.cancelTrace();
      this.strokeIndex += 1;
      this.brushReady = false;
      this.updateCheckpointStates(false);
      this.positionTravelerAtCurrentStart();
      const lineIndex = Math.min(this.strokeIndex - 1, this.config.voice.nextStroke.length - 1);
      this.speakLine(
        this.config.voice.nextStroke[lineIndex],
        this.config.voice.nextStrokeKeys[lineIndex],
        true,
      );
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
    await this.driveCompletedRoute();
    if (!this.roundIsCurrent(generation)) return;
    this.playSfx(this.mode.finishSfx || this.config.finishSfx);
    const shimmer = this.reducedMotion() ? Promise.resolve() : this.shimmerInk();
    const center = this.screenPointFor(this.fieldLayer, BOARD_SIZE / 2, BOARD_SIZE / 2);
    const confetti = center
      ? burst(this.stage.PIXI, this.scene, center.stageX, center.stageY, { count: 36, power: 7, life: 780 })
      : Promise.resolve();
    const reward = this.revealRewardVisual();
    await Promise.all([shimmer, confetti, reward]);
    const yumIndex = this.roundIndex % this.config.voice.yums.length;
    await this.speakLine(
      (this.currentPath && this.currentPath.say) || this.config.voice.yums[yumIndex],
      (this.currentPath && this.currentPath.sayKey) || this.config.voice.yumKeys[yumIndex],
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
    const end = this.screens.el('end');
    // Leave 'play' before the stage goes: everything that guards on
    // `screen === 'play'` used to see the flag flip here, and the router is now
    // the only place that fact lives. `silent` skips the router's own
    // voice.stop() — the original never stopped speech at this point, letting
    // the round's praise line carry into the cheer that follows.
    this.screens.release('end');
    this.screens.show('end', { silent: true });
    this.awaitingInput = false;
    this.inputLocked = false;
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.playSfx('tada');
    this.disposeStage();

    end.replaceChildren();
    this.applyTheme(end);
    end.setAttribute('aria-label', this.config.voice.cheer);
    const home = this.renderImageButton('qk-trace-back', 'Back to the game menu', null, () => {
      this.stopVoice();
      this.renderSplash();
    }, 'qk-eng-ico-back qk-eng-corner-tl');
    const center = el('div', 'qk-trace-end-center qk-eng-center');
    const artCard = el('div', 'qk-trace-end-art qk-eng-card');
    artCard.appendChild(artEl(this.config.endArt || this.config.splashArt, ''));
    const again = el('button', 'qk-trace-again qk-eng-mode');
    again.type = 'button';
    const icon = el('span', 'qk-trace-play-icon qk-eng-play-icon');
    icon.setAttribute('aria-hidden', 'true');
    again.append(icon, el('span', '', this.config.copy.playAgain));
    // wireEndScreen rather than a bare onTap: it is what enforces the §8
    // navigation rule, and it puts its own disposer on this screen's bag —
    // `hold` defaults to true, which is right for an engine that rebuilds and
    // so rewires the end screen on every visit.
    wireEndScreen({
      screens: this.screens,
      again,
      feedback: (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      },
      onAgain: () => (this.mode ? this.startMode(this.mode.id) : this.renderSplash()),
    });
    center.append(artCard, el('h1', 'qk-eng-title', this.config.voice.cheer), again);
    end.append(home, center);
    this.createDomBurst(artCard, 34);
    await this.speakLine(this.config.voice.cheer, this.config.voice.cheerKey, true);
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
    await this.speakLine(this.currentPrompt(), this.currentPromptKey(), true);
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      // The destination mission is announced once when the round loads. Idle
      // support stays visual so it never restarts a long instruction while the
      // child is thinking or moving between numbered strokes.
      this.playDemo();
    }, this.timers.ms(IDLE_MS));
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
    this.screens.el('play').querySelectorAll('.qk-trace-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  positionTravelerAtCurrentStart() {
    const stroke = this.currentScreenStroke();
    if (stroke && stroke.local.length) this.positionTravelerLocal(stroke.local[0]);
  }

  positionActualTravelerAtRouteStart() {
    if (!this.actualTraveler || !this.strokesScreen.length) return;
    const stroke = this.strokesScreen[0];
    if (stroke && stroke.local.length) {
      this.positionDisplayAlongStroke(this.actualTraveler, stroke.local[0], stroke.local);
    }
  }

  positionTravelerAtCurrentProgress() {
    const stroke = this.currentScreenStroke();
    if (!stroke || !stroke.local.length) return;
    const progress = this.strokeProgress[this.strokeIndex] || { index: 0 };
    this.positionTravelerLocal(stroke.local[Math.min(progress.index, stroke.local.length - 1)]);
  }

  positionTravelerLocal(point) {
    if (!this.traveler || !point) return;
    const stroke = this.currentScreenStroke();
    this.positionDisplayAlongStroke(this.traveler, point, stroke && stroke.local);
  }

  positionDisplayAlongStroke(display, point, local) {
    if (!display || !point) return;
    display.position.set(point.x, point.y);
    this.orientDisplayAlongStroke(display, point, local);
  }

  orientDisplayAlongStroke(display, point, local) {
    if (!display || !point) return;
    if (!(this.mode.orientTraveler ?? this.config.orientTraveler)) return;
    if (!local || local.length < 2) return;
    const index = nearestPointIndex(local, point);
    const before = local[Math.max(0, index - 2)];
    const after = local[Math.min(local.length - 1, index + 2)];
    if (!before || !after) return;
    display.rotation = Math.atan2(after.y - before.y, after.x - before.x)
      + (this.mode.travelerRotationOffset ?? this.config.travelerRotationOffset ?? 0);
  }

  async driveCompletedRoute() {
    if (!this.config.driveReplay || !this.actualTraveler || this.actualTraveler === this.traveler) return;
    const route = this.strokesScreen.filter((stroke) =>
      stroke && Array.isArray(stroke.local) && stroke.local.length > 1);
    if (!route.length) return;
    this.positionDisplayAlongStroke(this.actualTraveler, route[0].local[0], route[0].local);
    if (this.ghostTraveler) this.ghostTraveler.visible = false;
    this.actualTraveler.visible = true;
    this.drivingReplay = true;
    const samples = route.reduce((sum, stroke) => sum + stroke.local.length, 0);
    if (!this.muted && typeof sfx.motor === 'function') {
      sfx.motor(clamp(samples * 22, 1200, 3600));
    }
    try {
      for (let strokeIndex = 0; strokeIndex < route.length; strokeIndex++) {
        const local = route[strokeIndex].local;
        this.positionDisplayAlongStroke(this.actualTraveler, local[0], local);
        if (strokeIndex) await this.delay(this.reducedMotion() ? 0 : 120);
        const stride = Math.max(1, Math.floor(local.length / 30));
        for (let i = stride; i < local.length; i += stride) {
          const point = local[Math.min(i, local.length - 1)];
          this.orientDisplayAlongStroke(this.actualTraveler, point, local);
          await this.runTween(to(
            this.actualTraveler.position,
            { x: point.x, y: point.y },
            { ms: this.reducedMotion() ? 0 : 42, easing: ease.linear },
          ));
        }
        this.positionDisplayAlongStroke(this.actualTraveler, local[local.length - 1], local);
      }
    } finally {
      this.drivingReplay = false;
    }
  }

  async revealRewardVisual() {
    if (!this.rewardVisual || this.rewardRevealed) return;
    this.rewardRevealed = true;
    const reward = this.rewardVisual;
    const target = this.rewardVisualTarget();
    reward.visible = true;
    if (this.reducedMotion()) {
      reward.position.set(target.x, target.y);
      reward.alpha = 1;
      reward.rotation = 0;
      reward.scale.set(1);
      return;
    }
    reward.position.set(target.x - 150, target.y + 56);
    reward.alpha = 0;
    reward.rotation = -0.04;
    reward.scale.set(0.38);
    await Promise.all([
      this.runTween(to(
        reward,
        { x: target.x, y: target.y, alpha: 1, rotation: 0 },
        { ms: 440, easing: ease.outCubic },
      )),
      this.runTween(to(
        reward,
        { scale: { x: 1.03, y: 1.03 } },
        { ms: 440, easing: ease.outBack },
      )),
    ]);
    await this.runTween(to(
      reward,
      { scale: { x: 1, y: 1 } },
      { ms: 150, easing: ease.inOutSine },
    ));
  }

  rewardVisualTarget() {
    if (!this.stage) return { x: BOARD_SIZE / 2, y: 530 };
    const { w, h } = this.stage.size();
    const wide = w > h * 1.15;
    return {
      x: wide ? -70 : 465,
      y: wide ? 530 : 520,
    };
  }

  positionRewardVisual() {
    if (!this.rewardVisual || this.rewardRevealed) return;
    const target = this.rewardVisualTarget();
    this.rewardVisual.position.set(target.x, target.y);
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

  renderCurrentPrompt() {
    const prompt = this.screens.el('play').querySelector('.qk-trace-prompt');
    if (!prompt) return;
    prompt.replaceChildren(el('span', 'qk-trace-mission', this.currentPrompt()));
    if (this.currentPath && this.currentPath.destination) {
      prompt.appendChild(el(
        'span',
        'qk-trace-letter-cue',
        `★  Trace the letter ${letterFromPath(this.currentPath)}.  ★`,
      ));
    }
  }

  currentPromptKey() {
    return (this.currentPath && this.currentPath.promptKey)
      || this.mode.promptKey
      || this.config.voice.introKey;
  }

  getState() {
    const rewardBounds = this.rewardVisual && this.rewardVisual.visible
      ? this.rewardVisual.getBounds()
      : null;
    const travelerScreen = this.traveler && this.stage
      ? this.screenPointFor(this.traveler, 0, 0)
      : null;
    return {
      screen: this.screen,
      mode: this.mode ? this.mode.id : null,
      round: this.screen === 'play' ? this.roundIndex : this.roundsTotal,
      roundsTotal: this.roundsTotal,
      stroke: this.screen === 'play' ? this.strokeIndex : null,
      strokesTotal: this.screen === 'play' ? this.currentStrokes.length : 0,
      awaitingInput: this.awaitingInput,
      replaying: this.drivingReplay,
      path: this.currentPath ? this.currentPath.id : null,
      sequence: this.roundPaths.map((path) => path.id),
      travelerGap: this.actualTraveler && this.ghostTraveler
        ? Math.hypot(
          this.actualTraveler.position.x - this.ghostTraveler.position.x,
          this.actualTraveler.position.y - this.ghostTraveler.position.y,
        )
        : 0,
      ghostVisible: Boolean(this.ghostTraveler && this.ghostTraveler.visible),
      actualVisible: Boolean(this.actualTraveler && this.actualTraveler.visible),
      travelerScreen: travelerScreen
        ? { x: travelerScreen.x, y: travelerScreen.y }
        : null,
      rewardVisible: Boolean(
        this.rewardVisual
          && this.rewardVisual.visible
          && this.rewardVisual.alpha > 0.98,
      ),
      rewardBounds: rewardBounds
        ? {
          x: rewardBounds.x,
          y: rewardBounds.y,
          w: rewardBounds.width,
          h: rewardBounds.height,
        }
        : null,
      destinationLabel: this.destinationView && this.destinationView.destinationLabel
        ? {
          text: this.destinationView.destinationLabel.text,
          w: this.destinationView.destinationLabel.width,
          h: this.destinationView.destinationLabel.height,
        }
        : null,
      boardBounds: {
        x: this.boardLeft,
        y: this.boardTop,
        w: BOARD_SIZE * this.boardScale,
        h: BOARD_SIZE * this.boardScale,
      },
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
      // Starting a stroke should begin driving immediately. The full mission
      // has already played at round start; later strokes receive their concise
      // numbered cue from completeStroke().
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

  traceStrokes() {
    if (this.screen !== 'play') return [];
    return this.strokesScreen.map((stroke) => (
      stroke.points.filter(Boolean).map((point) => ({ x: point.x, y: point.y }))
    ));
  }

  createDomBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    // createDomBurst is only ever called from finishGame(): with three live
    // sections all wearing `.qk-trace`, a bare mountEl-wide query would return
    // the splash (first in document order), not the end screen the burst
    // anchor actually lives in.
    const host = this.screens.el('end') || this.mountEl;
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
    this.stopVoice();
  }

  seed(n) {
    const value = Number(n) || 0;
    this.rng = mulberry32(value);
    this.fxRng = mulberry32(value + 73);
  }

  async speakLine(line, key, cancel = false) {
    if (this.muted || !line) return;
    if (this.config.voiceClips && key) {
      await voiceClips.say(key, line);
      return;
    }
    await speech.speak(line, { rate: 0.8, pitch: 1.05, cancel });
  }

  stopVoice() {
    if (this.config.voiceClips) voiceClips.stop();
    else speech.stop();
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
}

function normalizeConfig(config = {}) {
  const copy = { home: 'Home', replay: 'Hear it again', playAgain: 'Play Again', ...(config.copy || {}) };
  const voice = {
    intro: 'Follow the sparkle with your finger.',
    introKey: null,
    nudge: 'Find the path and keep going.',
    nudgeKey: null,
    cheer: 'You traced them all!',
    cheerKey: null,
    yums: ['Nice tracing!', 'You did it!', 'Great path!'],
    yumKeys: [],
    nextStroke: ['Great! Find the next start.'],
    nextStrokeKeys: [],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice tracing!')];
  if (!Array.isArray(voice.yumKeys)) voice.yumKeys = [];
  if (!Array.isArray(voice.nextStroke) || !voice.nextStroke.length) {
    voice.nextStroke = ['Great! Find the next start.'];
  }
  if (!Array.isArray(voice.nextStrokeKeys)) voice.nextStrokeKeys = [];
  return {
    ...config,
    id: config.id || 'trace-path',
    title: config.title || 'Trace the Path',
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || 'emoji:⭐'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    traveler: normalizeArtRef(config.traveler || 'emoji:✏️'),
    travelerSize: Math.max(48, Number(config.travelerSize || 72)),
    strokeColor: config.strokeColor || '#e8734a',
    tolerance: Math.max(48, Number(config.tolerance || 64)),
    orientTraveler: Boolean(config.orientTraveler),
    travelerRotationOffset: Number(config.travelerRotationOffset || 0),
    guideStyle: config.guideStyle || 'dots',
    driveSfx: config.driveSfx || null,
    finishSfx: config.finishSfx || null,
    voiceClips: config.voiceClips && config.voiceClips.manifest
      ? {
        manifest: config.voiceClips.manifest,
        lines: config.voiceClips.lines || './assets/audio/lines.json',
      }
      : null,
    theme: { ...(config.theme || {}) },
    copy,
    voice,
    modes: (config.modes || []).map((mode) => normalizeMode(mode, config)).filter((mode) => mode.paths.length),
  };
}

function voiceDefaults(config) {
  const result = {};
  const add = (key, text) => {
    if (key && text) result[key] = text;
  };
  const voice = config.voice || {};
  add(voice.introKey, voice.intro);
  add(voice.nudgeKey, voice.nudge);
  add(voice.cheerKey, voice.cheer);
  (voice.yums || []).forEach((text, index) => add((voice.yumKeys || [])[index], text));
  (voice.nextStroke || []).forEach((text, index) => add((voice.nextStrokeKeys || [])[index], text));
  for (const mode of config.modes || []) {
    add(mode.promptKey, mode.prompt);
    for (const path of mode.paths || []) {
      add(path.promptKey, path.prompt);
      add(path.sayKey, path.say);
    }
  }
  return result;
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
    travelerSize: Math.max(48, Number(mode.travelerSize || config.travelerSize || 72)),
    orientTraveler: mode.orientTraveler ?? Boolean(config.orientTraveler),
    travelerRotationOffset: Number(mode.travelerRotationOffset ?? config.travelerRotationOffset ?? 0),
    guideStyle: mode.guideStyle || config.guideStyle || 'dots',
    driveSfx: mode.driveSfx || config.driveSfx || null,
    finishSfx: mode.finishSfx || config.finishSfx || null,
    numberedStarts: Boolean(mode.numberedStarts),
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

function drawPolyline(graphic, points) {
  if (!graphic || !points || points.length < 2) return;
  graphic.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) graphic.lineTo(points[i].x, points[i].y);
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

function townDestination(PIXI, name, letter, accent, art) {
  const wrap = new PIXI.Container();
  if (art) {
    art.position.set(0, -2);
    wrap.addChild(art);
  }

  const badge = new PIXI.Graphics();
  badge.circle(0, -103, 32).fill(0xffd739).stroke({ width: 5, color: 0xffffff });
  wrap.addChild(badge);
  const letterText = new PIXI.Text({
    text: letter,
    style: {
      fontFamily: 'Fredoka, Arial Rounded MT Bold, sans-serif',
      fontWeight: '600',
      fontSize: 40,
      fill: 0x6a2dbb,
      align: 'center',
    },
  });
  letterText.anchor.set(0.5);
  letterText.position.set(0, -104);
  wrap.addChild(letterText);
  const label = new PIXI.Text({
    text: name,
    style: {
      fontFamily: 'Fredoka, Arial Rounded MT Bold, sans-serif',
      fontWeight: '600',
      fontSize: 22,
      fill: 0x17517e,
      align: 'center',
      wordWrap: false,
    },
  });
  label.anchor.set(0.5);
  label.position.set(0, 126);
  const maxLabelWidth = 158;
  if (label.width > maxLabelWidth) {
    label.scale.set(maxLabelWidth / label.width);
  }
  const pill = new PIXI.Graphics();
  pill.roundRect(-92, 107, 184, 40, 19).fill({ color: 0xffffff, alpha: 0.96 })
    .stroke({ width: 4, color: accent, alpha: 0.55 });
  wrap.addChild(pill, label);
  wrap.destinationLabel = label;
  return wrap;
}

function mapArtRef(folder, id) {
  return `game:assets/map/${folder}/${id}.png`;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function distanceToStrokes(point, strokes) {
  let best = Infinity;
  for (const stroke of strokes || []) {
    for (let i = 1; i < stroke.length; i++) {
      best = Math.min(best, pointSegmentDistance(point, stroke[i - 1], stroke[i]));
    }
  }
  return best;
}

function pointSegmentDistance(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq
    ? clamp(((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSq, 0, 1)
    : 0;
  return Math.hypot(point.x - (a.x + dx * t), point.y - (a.y + dy * t));
}

function letterFromPath(path) {
  const match = String(path && (path.name || path.id) || '').match(/\b([A-Z])\b/i);
  return match ? match[1].toUpperCase() : '★';
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function colorNumber(value, fallback) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value.replace('#', ''), 16);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function installStyle() {
  if (styleInstalled) return;
  styleInstalled = true;
  installEngineStyles('qk-trace-style', `
    /* trace-path's own skin. Everything the other engines also had —
       @font-face, the reset, the surface, the 96px PNG buttons, the splash/end
       column, the mode buttons, the HUD grid, the ringed dots, the play icon —
       now comes from shared/css/engine-base.css; what is left below is either
       this engine's palette or a control only this engine has (the road-style
       guide, the freeform canvas box, the completion burst).

       The class names are unchanged and stay supported: see the compatibility
       window note in shared/js/engines/README.md — letter-road-driving skins
       .qk-trace-* directly, including redefining --navy/--blue/--shadow
       under #game .qk-trace, so every alias below has to keep flowing. */

    .qk-trace {
      --sky: #bee3f5;
      --navy: #17517e;
      --blue: #2d7dd2;
      --green: #58a945;
      --yellow: #ffd166;
      --coral: #f25f5c;
      --white: #fff;
      --shadow: 0 6px 0 rgba(23, 81, 126, .18), 0 14px 30px rgba(23, 81, 126, .18);

      /* Alias the legacy vars onto engine-base's tokens rather than letting its
         defaults stand — letter-road-driving redefines --navy/--blue/--shadow
         under #game .qk-trace and the alias is what keeps that flowing. */
      --qk-navy: var(--navy);
      --qk-sky: var(--sky);
      --qk-white: var(--white);
      --qk-primary: var(--blue);
      --qk-shadow: var(--shadow);

      --qk-eng-bg-image:
        radial-gradient(circle at 18% 18%, rgba(255,255,255,.42) 0 8px, transparent 9px),
        radial-gradient(circle at 82% 28%, rgba(255,255,255,.34) 0 12px, transparent 13px),
        radial-gradient(circle at 42% 84%, rgba(255,255,255,.28) 0 9px, transparent 10px);
      --qk-eng-bg-size: 160px 160px, 230px 230px, 200px 200px;

      --qk-eng-corner-z: 5;
      --qk-eng-hud-z: 4;
      --qk-eng-title-w: 13ch;
      --qk-eng-focus-a: .7;
      --qk-eng-play-rows: auto minmax(0,1fr);
      --qk-eng-ring-a: .52;
      --qk-eng-ring-shadow-a: .14;
      --qk-eng-play-icon-size: 46px;
    }

    /* .qk-eng-card sizes the tile; this engine's art has no font-size/line-height
       of its own (art.js sizes by --qk-art-size), so qk-eng-card-glyph is never
       adopted and this one custom property is all that's left to carry. */
    .qk-trace-splash-art,
    .qk-trace-end-art {
      --qk-art-size: clamp(82px, 16vmin, 132px);
    }

    /* Specificity workaround, pre-existing: .qk-trace button (0,1,1) beats
       .qk-eng-mode (0,1,0), so the mode/again buttons would otherwise fall
       back to an inherited ink instead of engine-base's white. Preserved, not
       "fixed". */
    .qk-trace button.qk-trace-mode,
    .qk-trace button.qk-trace-again { color: var(--white); }

    .qk-trace-mode:nth-child(2n) { background-color: var(--green); }
    .qk-trace-mode:nth-child(3n) { background-color: var(--coral); }

    /* No pill background here — just a centred flex row of dots. */
    .qk-trace-progress {
      grid-column: 2;
      justify-self: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 11px;
      min-height: 32px;
    }
    .qk-trace-dot.is-current { background: var(--yellow); }
    .qk-trace-dot.is-filled { background: var(--green); }

    /* The Pixi mount is a grid with its own rows/gap, not the shared absolute
       stage box — kept as-is rather than adopting qk-eng-stage. */
    .qk-trace-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0,1fr);
      gap: clamp(8px, 1.6vmin, 18px);
      touch-action: none;
    }

    .qk-trace-prompt {
      justify-self: center;
      max-width: min(900px, 92vw);
      min-height: 44px;
      text-align: center;
      font-size: clamp(24px, 4vmin, 44px);
      line-height: 1.05;
      text-shadow: 0 3px 0 rgba(255,255,255,.65);
      pointer-events: none;
    }

    /* Positioned (relative, not absolute) and sized by width/height/justify-self
       — does not match qk-eng-canvas's absolute box, so it stays local, along
       with its canvas child rule. */
    .qk-trace-canvas {
      position: relative;
      min-height: 0;
      width: min(1200px, 100%);
      height: 100%;
      justify-self: center;
      overflow: hidden;
      border-radius: 28px;
      touch-action: none;
    }
    .qk-trace-canvas canvas { display: block; width: 100%; height: 100%; touch-action: none; }

    .qk-trace-again {
      display: inline-grid;
      grid-auto-flow: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      min-width: min(430px, 84vw);
      background-color: var(--green);
    }

    .qk-trace-burst { position: absolute; z-index: 9; width: 1px; height: 1px; pointer-events: none; }
    .qk-trace-burst span {
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: hsl(var(--hue), 78%, 58%);
      animation: qk-trace-burst .82s ease-out both;
      animation-delay: var(--delay);
    }
    @keyframes qk-trace-burst {
      from { opacity: 1; transform: translate(-50%,-50%) scale(.35); }
      to { opacity: 0; transform: translate(calc(-50% + var(--x)),calc(-50% + var(--y))) scale(1.15); }
    }

    @media (orientation: landscape) and (max-height: 620px) {
      .qk-trace-play { grid-template-rows: 92px minmax(0,1fr); padding-bottom: max(96px, calc(88px + env(safe-area-inset-bottom))); }
      .qk-trace-hud { min-height: 92px; }
      .qk-trace-prompt { font-size: clamp(22px, 5vh, 34px); min-height: 34px; }
    }
    @media (max-width: 560px) {
      .qk-trace-play { padding-left: max(8px, env(safe-area-inset-left)); padding-right: max(8px, env(safe-area-inset-right)); }
    }
    @media (prefers-reduced-motion: reduce) {
      .qk-trace *, .qk-trace *::before, .qk-trace *::after {
        animation-duration: .001ms !important; transition-duration: .001ms !important; scroll-behavior: auto !important;
      }
      .qk-trace-burst { display: none !important; }
    }
  `);
}
