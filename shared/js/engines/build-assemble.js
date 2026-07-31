// build-assemble.js — Stage v2 archetype for building pictures from parts.
//
// DOM owns the splash, HUD, and end screen. Pixi owns every gameplay object:
// the build space guide, placed assembly, draggable parts, and parts tray.
//
// The build space defaults to a 1000×1000 square (BUILD_SPACE) — that is the
// coordinate system every existing config authors against. A game may opt into
// a non-square space with `space: [w, h]` (config / mode / build, innermost
// wins); a wide space flips the tray to the bottom so a horizontal build gets
// the full landscape width instead of a square letterbox.
//
// Drag plumbing lives in shared/js/stage/drag-to-slot.js. Hit testing stays
// here: the module reports the dragged card's centre in STAGE coordinates
// (drag.stageX/stageY) and this engine decides what that centre is over.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import * as clips from '../voice-clips.js';
import * as content from '../content.js';
import { onTap } from '../tap.js';
import { createStage } from '../stage/stage.js';
import { to, ease, popIn, wiggle } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';
import { artEl } from './art.js';
import { createDragToSlot } from '../stage/drag-to-slot.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const BACK_IMG = new URL('../../assets/ui/btn-back.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;
const SHARED_ASSETS = new URL('../../assets/', import.meta.url); // -> shared/assets/

const IDLE_MS = 10000;
// Longest the round loop will wait on a spoken line before moving on regardless.
// The longest authored line is a 4-clip blend readout with gaps: comfortably under this.
const VOICE_CEILING_MS = 9000;
// A single piece sound is one short fragment; cap it tightly so rapid tapping stays snappy.
const PIECE_VOICE_CEILING_MS = 2500;
// Minimum time a build's picture reward stays on screen, independent of the voice.
const REVEAL_HOLD_MS = 1600;
const REPLAY_DEBOUNCE_MS = 600;
const WAIT_FOR_INPUT_MS = 80;
const MIN_TOUCH = 96;
const SNAP_RADIUS_MULTIPLIER = 0.65;
const HOVER_RADIUS_MULTIPLIER = 1.45;
const HALO_REST_ALPHA = 0.07;
const HALO_HOVER_ALPHA = 0.34;
const HOVER_PULSE = 1.06;
const BUILD_SPACE = 1000;
const TRAY_CARD = 124;
const ART_SIZE = 92;
const AUDIO_LOG_MAX = 80;

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('build-assemble requires a mount element');
  installStyle();
  return new BuildAssembleGame(config, mountEl);
}

/**
 * Pure field layout: where the board sits, how big it is, and where the tray
 * goes. Exported so it can be golden-tested from Node — no `this`, no DOM,
 * no Pixi.
 *
 * A square space (spaceW === spaceH) reproduces the pre-generalisation maths
 * exactly, which is what keeps the 14 sibling games byte-identical.
 *
 * @param {{w:number,h:number,spaceW:number,spaceH:number,portrait:boolean}} args
 * @returns {{pad:number,boardScale:number,boardLeft:number,boardTop:number,
 *            boardW:number,boardH:number,
 *            tray:{left:number,top:number,w:number,h:number},
 *            trayAtBottom:boolean}}
 */
export function computeFieldLayout({ w, h, spaceW = BUILD_SPACE, spaceH = BUILD_SPACE, portrait,
                                     trayReserve = null, trayOverlay = false }) {
  const sw = spaceW > 0 ? spaceW : BUILD_SPACE;
  const sh = spaceH > 0 ? spaceH : BUILD_SPACE;
  const isPortrait = portrait == null ? h >= w : !!portrait;
  const pad = Math.max(8, Math.min(20, Math.min(w, h) * 0.025));
  // The tray side keys on the BUILD aspect, not the viewport alone. A square
  // space gives aspect 1.0 => wideBuild false => trayAtBottom === portrait,
  // i.e. exactly the branch every existing game takes today.
  const wideBuild = sw / sh >= 1.25;
  const trayAtBottom = isPortrait || wideBuild;
  // Smallest allowed board width, matching the old `Math.max(180, …)` floor,
  // which clamped the LONGER edge of a (square) board to 180px.
  const minSpan = 180 * (sw / Math.max(sw, sh));

  let boardScale;
  let boardLeft;
  let boardTop;
  let trayLeft;
  let trayTop;
  let trayW;
  let trayH;

  if (trayAtBottom) {
    // How much height the tray takes from the board. The default is generous, which is
    // right for a square build whose board cannot use the extra height anyway — but a
    // wide build is height-starved, and every pixel the tray gives back makes the board
    // (and therefore the pieces a child has to read) meaningfully bigger. `trayReserve`
    // lets a game buy that back: a value < 1 is a fraction of the viewport height, >= 1
    // is a pixel count. Omitted => the original formula, so every existing game is
    // numerically untouched.
    const reserve = trayReserve == null
      ? Math.max(112, Math.min(h * 0.29, 255))
      : Math.max(112, trayReserve < 1 ? h * trayReserve : trayReserve);
    const boxW = w - pad * 2;
    // trayOverlay: the tray floats ON the board instead of taking a slice out of it. For
    // a game whose backdrop is a full scene, reserving a strip leaves the scene as a
    // letterboxed rectangle sitting in dead space; overlaying lets the board fill the
    // play area and puts the tray cards on the scenery, the way the concept art composes
    // it. The board owner is responsible for keeping its pieces clear of the tray strip.
    const boxH = trayOverlay ? (h - pad * 2) : (h - reserve - pad * 3);
    // Both extents come from ONE span, exactly as the pre-generalisation code
    // derived width and height from a single `boardSize`. Deriving them
    // independently from a scale would break bit-equality (a/b*b !== a).
    const boardW = Math.max(minSpan, Math.min(boxW, boxH * (sw / sh)));
    const boardH = boardW * (sh / sw);
    boardScale = boardW / sw;
    boardLeft = (w - boardW) / 2;
    // A wide build in a portrait viewport cannot fill the box — a 1600x700 space in a
    // tall window leaves real vertical slack. Split that slack between sky above the
    // board and the tray region below it, rather than pinning the board high and the
    // tray to the very bottom, which left a dead band of background between the two
    // that read as a broken layout. The tray still occupies the lower region (its cards
    // centre within it, so they stay in the thumb zone) and simply gets taller.
    // A square space keeps boardTop === pad and trayTop === pad + boardH + pad, which is
    // exactly what the sibling games render today — see the golden layout test.
    const slackY = Math.max(0, boxH - boardH);
    boardTop = pad + (wideBuild ? slackY * 0.34 : 0);
    trayLeft = pad;
    trayTop = trayOverlay ? (h - reserve - pad) : (boardTop + boardH + pad);
    trayW = w - pad * 2;
    trayH = trayOverlay ? Math.max(96, reserve) : Math.max(96, h - trayTop - pad);
    return {
      pad, boardScale, boardLeft, boardTop, boardW, boardH,
      tray: { left: trayLeft, top: trayTop, w: trayW, h: trayH },
      trayAtBottom,
    };
  }

  trayW = Math.max(126, Math.min(w * 0.28, 330));
  const boxW = w - trayW - pad * 3;
  const boxH = h - pad * 2;
  const boardW = Math.max(minSpan, Math.min(boxW, boxH * (sw / sh)));
  const boardH = boardW * (sh / sw);
  boardScale = boardW / sw;
  boardLeft = pad + Math.max(0, (boxW - boardW) / 2);
  boardTop = (h - boardH) / 2;
  trayLeft = w - trayW - pad;
  trayTop = pad;
  trayH = h - pad * 2;
  return {
    pad, boardScale, boardLeft, boardTop, boardW, boardH,
    tray: { left: trayLeft, top: trayTop, w: trayW, h: trayH },
    trayAtBottom,
  };
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
    this.muted = false;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.rng = Math.random;
    this.fxRng = Math.random;
    this.timeScale = 1;
    this.motionReduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    this.stage = null;
    this.scene = null;
    this.backdropLayer = null;
    this.backdropView = null;
    this.backdropMask = null;
    this.backdropNatural = null;
    this.backdropRect = null;
    this.boardLayer = null;
    this.guideLayer = null;
    this.assemblyLayer = null;
    this.trayLayer = null;
    this.dragLayer = null;
    this.boardPanel = null;
    this.boardScale = 1;
    this.boardLeft = 0;
    this.boardTop = 0;
    this.fieldLayout = null;
    this.trayCardSize = MIN_TOUCH;
    this.removeResize = null;
    this.removeDragTick = null;
    this.stageGeneration = 0;
    this.roundGeneration = 0;
    this.pendingDelays = new Set();
    this.activeTweens = new Set();
    this.targetMap = new Map();
    this.drag = null;
    this.hoveredSlot = null;

    // recorded voice
    this.voiceGeneration = 0;
    this.clipsLoading = null;
    this.clipsReady = false;
    this.audioLog = [];

    // config.sound.* effect elements, one per url, and which of them have
    // already played inside a gesture (see blessSounds)
    this.soundEls = new Map();
    this.blessedSounds = new Set();
    // elements with a playSound() play() in flight — el.paused can still read true here
    // (iOS), so blessSounds() must not treat these as unprimed and prime over them
    this.soundsRequested = new Set();

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (e) => e.preventDefault();
    this.onGestureStart = (e) => e.preventDefault();
    this.onWindowBlur = () => { if (this.drag) this.drag.cancel(); };

    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);
    window.addEventListener('blur', this.onWindowBlur);

    // Delegated back-button handling: play/end screens rebuild innerHTML, so the
    // listener lives on the mount and survives every screen swap. Delegating a
    // tap means checking BOTH ends of the press — the mount also covers the drag
    // surface, and releasing a dragged part over the button is not a back tap.
    this.backDownEl = null;
    this.removeBackTap = onTap(this.mountEl, (event) => {
      const el = backButtonFor(event.target);
      const startedOn = this.backDownEl;
      this.backDownEl = null;
      // a keyboard/AT click has no preceding pointerdown, so it only checks the target
      if (!el || (event.type !== 'click' && el !== startedOn)) return;
      this.stopVoice();
      this.renderSplash();
    }, {
      feedback: (event) => {
        this.backDownEl = backButtonFor(event.target);
        if (this.backDownEl) this.playSfx('tick');
      },
    });
    this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebugHook();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearIdleTimer();
    this.detachDrag();
    this.disposeStage();
    this.stopVoice();
    this.stopSounds();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gesturestart', this.onGestureStart);
    window.removeEventListener('blur', this.onWindowBlur);
    // the mount outlives this instance — leaving the delegated tap on it would let
    // a destroyed game answer the next one's back button
    if (this.removeBackTap) { this.removeBackTap(); this.removeBackTap = null; }
    this.mountEl.replaceChildren();
    this.targetMap.clear();
    if (window.QLOBE_DEBUG === this.debugHook) {
      if (this.previousDebug) window.QLOBE_DEBUG = this.previousDebug;
      else delete window.QLOBE_DEBUG;
    }
  }

  /**
   * iPad trap: every unlock below self-guards and only latches once the channel
   * has genuinely played, so they all run on EVERY gesture. Latching this on a
   * "first touch" flag strands a channel whose very first unlock failed, and
   * again whenever iPadOS suspends the context later (app switch, notification,
   * lock) — the resume would then never be reached. They are cheap and idempotent.
   */
  unlockAudio() {
    clips.unlock();
    sfx.unlock();
    speech.unlock();
    this.blessSounds();
  }

  /**
   * config.sound.* effects are fired BY the round loop (the train's roll and horn
   * play out of the completion animation, long after the touch that finished the
   * build), and iOS refuses an element that has never played inside a gesture.
   * Prime the very elements playSound() will reuse, the way voice-clips.unlock()
   * primes its channel: muted play, then pause and rewind. Each element latches
   * only once its play() actually resolved, so a refused gesture is retried on
   * the next one. A game with no `sound` block does nothing here.
   */
  blessSounds() {
    const sounds = this.config.sound;
    if (!sounds) return;
    Object.keys(sounds).forEach((key) => {
      const el = this.soundElFor(key);
      if (!el || this.blessedSounds.has(el)) return;
      // one already sounding, or a real playSound() play() still in flight (el.paused can
      // lag true past the play() call — see soundsRequested), is plainly headed for unlocked;
      // priming over it here would cut the real effect short
      if (!el.paused || this.soundsRequested.has(el)) { this.blessedSounds.add(el); return; }
      try {
        el.muted = true;
        const p = el.play();
        const settle = () => {
          // a real playSound() started while this muted prime was settling: leave it alone
          if (!el.muted) return;
          try { el.pause(); el.currentTime = 0; } catch { /* ignore */ }
          el.muted = false;
        };
        if (p && typeof p.then === 'function') {
          p.then(() => { this.blessedSounds.add(el); settle(); }).catch(() => { el.muted = false; });
        } else {
          this.blessedSounds.add(el);
          settle();
        }
      } catch { /* a later gesture retries */ }
    });
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
      getAudioLog: () => this.getAudioLog(),
      clearAudioLog: () => this.clearAudioLog(),
      getLayout: () => this.layoutSnapshot(),
      /** Compress every timed beat so QA does not sit through celebrations. */
      fastTimers: (scale = 0.05) => this.fastTimers(scale),
      /** Back to the splash, no page reload, so QA can loop modes. */
      home: () => this.home(),
    };
    window.QLOBE_DEBUG = this.debugHook;
  }

  renderSplash() {
    this.clearIdleTimer();
    this.detachDrag();
    this.disposeStage();
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.selectedId = null;
    this.targetMap.clear();
    // Never speak at page load: the splash is silent by contract.
    this.stopVoice();

    // A mode button labelled only with text is unusable by the audience this platform
    // is built for — they cannot read it. `mode.art` is optional so every existing game
    // renders exactly as before, but a game that supplies it gets a picture the child
    // can actually choose from, with the title kept underneath for the adult.
    const buttons = this.config.modes.map((mode, index) => `
      <button class="qk-build-mode${mode.art ? ' qk-build-mode-art' : ''}" type="button"
              data-mode="${escapeAttr(mode.id)}" data-mode-index="${index}">
        ${mode.art ? '<span class="qk-build-mode-art-slot" aria-hidden="true"></span>' : ''}
        <span class="qk-build-mode-label">${escapeHtml(lineText(mode.title || mode.id))}</span>
      </button>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-build qk-build-splash" aria-label="${escapeAttr(lineText(this.config.title))}">
        <a class="qk-build-img-btn qk-build-home" href="../../" aria-label="${escapeAttr(lineText(this.config.copy.home))}"></a>
        <div class="qk-build-splash-center">
          <div class="qk-build-splash-art" aria-hidden="true"></div>
          <h1>${escapeHtml(lineText(this.config.title))}</h1>
          <div class="qk-build-mode-list">${buttons}</div>
        </div>
      </section>
    `;

    this.renderScreenArt('.qk-build-splash-art', this.config.splashArt);
    this.config.modes.forEach((mode, index) => {
      if (mode.art) {
        this.renderScreenArt(`[data-mode-index="${index}"] .qk-build-mode-art-slot`, mode.art);
      }
    });
    this.applyThemeBackdrop();

    this.mountEl.querySelectorAll('.qk-build-mode').forEach((button) => {
      onTap(button, () => this.startMode(button.dataset.mode), {
        feedback: (e) => {
          e.preventDefault();
          this.unlockAudio();
          this.playSfx('tick');
        },
      });
    });
  }

  /** Render a real art ref (emoji, image, layered stack) into a DOM card. */
  renderScreenArt(selector, ref) {
    const host = this.mountEl.querySelector(selector);
    if (!host || !ref) return;
    host.replaceChildren(artEl(ref, '', { base: this.config.assetBase }));
  }

  /** Art-world backdrop (docs/art-direction.md): theme.background paints the
   *  whole section via CSS cover — the Pixi canvas is transparent above it. */
  applyThemeBackdrop() {
    const theme = this.config.theme;
    const section = this.mountEl.querySelector('.qk-build');
    if (!theme || !theme.background || !section) return;
    const ref = String(theme.background);
    const url = artUrlRef(ref, this.config.assetBase) || ref;
    if (!url) return;
    section.style.background = `#bfe3f5 url("${url}") center / cover no-repeat`;
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;
    const mode = this.config.modes.find((item) => item.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearIdleTimer();
    this.detachDrag();
    this.disposeStage();
    this.stopVoice();
    this.mode = mode;
    this.screen = 'play';
    this.roundIndex = 0;
    const maxRounds = Math.min(mode.rounds || mode.builds.length, mode.builds.length);
    this.roundBuilds = shuffle(mode.builds.slice(), this.rng).slice(0, maxRounds);
    this.roundsTotal = this.roundBuilds.length;

    this.renderPlayShell();
    // Lazy: a game with no voice.clips block never fetches anything. Loaded
    // alongside the stage so it never delays first paint.
    const clipsReady = this.ensureVoiceClips();
    if (!this.roundsTotal) {
      await this.finishGame();
      return;
    }
    const stageReady = await this.createPlayStage();
    if (!stageReady) return;
    await clipsReady;
    if (this.destroyed || this.screen !== 'play' || this.mode !== mode) return;
    await this.showRound(0);
  }

  renderPlayShell() {
    const dots = Array.from({ length: this.roundsTotal }, () => (
      '<span class="qk-build-dot" aria-hidden="true"></span>'
    )).join('');
    this.mountEl.innerHTML = `
      <section class="qk-build qk-build-play" aria-label="${escapeAttr(lineText(this.mode.title || this.config.title))}">
        <header class="qk-build-hud">
          <button class="qk-build-back qk-build-img-btn" type="button" aria-label="Back to the game menu"></button>
          <div class="qk-build-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-build-stage">
          <div class="qk-build-canvas" aria-label="${escapeAttr(lineText(this.mode.title || this.config.title))}"></div>
        </main>
        <button class="qk-build-img-btn qk-build-sound" type="button" aria-label="${escapeAttr(lineText(this.config.copy.replay))}"></button>
      </section>
    `;
    this.applyThemeBackdrop();
    // .qk-build-back is wired once, delegated on the mount (see the constructor).
    const sound = this.mountEl.querySelector('.qk-build-sound');
    onTap(sound, () => this.replayPromptFromHud(), {
      feedback: (e) => { e.preventDefault(); e.stopPropagation(); this.unlockAudio(); },
    });
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
    this.drag = this.createDragController(stage);
    this.removeResize = stage.onResize(() => this.layoutField());
    this.dragTicker = () => { if (this.drag) this.drag.tick(); };
    stage.app.ticker.add(this.dragTicker);
    this.removeDragTick = () => stage.app.ticker.remove(this.dragTicker);
    return true;
  }

  /**
   * Every engine-side rule stays here: selection + ordered-build gating,
   * placement validation, the wrong-placement wiggle/boing/glide-home, sfx and
   * voice. drag-to-slot.js owns only the pointer plumbing.
   */
  createDragController(stage) {
    return createDragToSlot({
      stage,
      dragLayer: () => this.dragLayer,
      // Only a tray part is draggable — a placed part must not even
      // preventDefault, exactly as before.
      getPiece: (id) => {
        const part = this.findPart(id);
        return part && part.location === 'tray' ? part : null;
      },
      canStart: () => !this.destroyed && this.awaitingInput && !this.inputLocked,
      onGrab: (part) => {
        this.unlockAudio();
        return this.selectPart(part.id).accepted;
      },
      onLift: (part) => { if (part && part.shadow) part.shadow.alpha = 0.28; },
      // Hover feedback keys on the CARD's projected centre, never the pointer:
      // with grab-offset preservation the finger sits under the card, and a
      // child aims with the silhouette they can see.
      onMove: (part, drag) => this.updateHoveredSlot(drag.stageX, drag.stageY),
      onDrop: async (part, drag) => {
        this.clearHoveredSlot();
        const slotIndex = this.slotIndexNearStagePoint(drag.stageX, drag.stageY);
        if (slotIndex == null) await this.handleWrongPlacement(part.id, null);
        else await this.attemptPlacement(part.id, slotIndex);
      },
      onCancel: async (part, drag) => {
        this.clearHoveredSlot();
        if (part && drag && drag.moved) await this.glidePartHome(part);
        this.playSfx('unpop');
        this.inputLocked = false;
      },
      reducedMotion: () => this.reducedMotion(),
      shadowAlpha: null, // onLift owns it (0.28 here, other engines differ)
    });
  }

  detachDrag() {
    if (this.drag) this.drag.detach();
    this.clearHoveredSlot();
  }

  disposeStage() {
    this.stageGeneration += 1;
    this.roundGeneration += 1;
    if (this.drag) { this.drag.detach(); this.drag = null; }
    this.hoveredSlot = null;
    this.cancelTweens();
    this.clearDelays();
    if (this.removeResize) this.removeResize();
    if (this.removeDragTick) this.removeDragTick();
    this.removeResize = null;
    this.removeDragTick = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
    this.backdropLayer = null;
    this.backdropView = null;
    this.backdropMask = null;
    this.backdropNatural = null;
    this.backdropRect = null;
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
    this.stopSounds();
    this.detachDrag();
    this.cancelTweens();
    this.bumpVoice();
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
      halo: null,
      baseScale: 1,
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
      hitLocalSize: TRAY_CARD,
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
    // Deliberately NOT awaited: input is already live, and a child who wants to grab a
    // car straight away must never be made to sit through the audio first.
    this.introduceRound(generation);
    this.scheduleIdlePrompt();
    await this.delay(WAIT_FOR_INPUT_MS);
  }

  createRoundScene() {
    const { PIXI } = this.stage;
    const [spaceW, spaceH] = this.currentSpace();
    const scene = new PIXI.Container();
    const backdropLayer = new PIXI.Container();
    const boardLayer = new PIXI.Container();
    const guideLayer = new PIXI.Container();
    const assemblyLayer = new PIXI.Container();
    const trayLayer = new PIXI.Container();
    const dragLayer = new PIXI.Container();
    if (this.currentPanel()) {
      const panel = new PIXI.Graphics();
      panel.roundRect(0, 0, spaceW, spaceH, 42)
        .fill({ color: 0xfffbef, alpha: 0.9 })
        .stroke({ width: 9, color: 0xffffff, alpha: 0.98 });
      const glow = new PIXI.Graphics();
      glow.circle(spaceW / 2, spaceH / 2, Math.min(spaceW, spaceH) * 0.36).fill({ color: 0x2d7dd2, alpha: 0.055 });
      boardLayer.addChild(panel, glow);
      this.boardPanel = panel;
    } else {
      this.boardPanel = null;
    }
    boardLayer.addChild(guideLayer, assemblyLayer);
    scene.addChild(backdropLayer, boardLayer, trayLayer, dragLayer);
    this.scene = scene;
    this.backdropLayer = backdropLayer;
    this.backdropView = null;
    this.backdropMask = null;
    this.backdropNatural = null;
    this.boardLayer = boardLayer;
    this.guideLayer = guideLayer;
    this.assemblyLayer = assemblyLayer;
    this.trayLayer = trayLayer;
    this.dragLayer = dragLayer;
    this.stage.setScene(scene);
  }

  async buildRoundViews(generation) {
    await Promise.all([
      this.buildBackdrop(generation),
      ...this.slots.map((slot) => this.buildSlotView(slot, generation)),
      ...this.parts.map((part) => this.buildPartView(part, generation)),
    ]);
  }

  /** Optional backdrop art, cover-fitted over the board region (the field the
   *  board is allotted), so vertical slack reads as sky, not emptiness. */
  async buildBackdrop(generation) {
    const ref = this.currentBackdrop();
    if (!ref || !this.backdropLayer) return;
    const { PIXI } = this.stage;
    const opts = { base: this.config.assetBase };
    let view = null;
    const url = artUrlRef(ref, this.config.assetBase);
    if (url) {
      let tex = null;
      try { tex = await PIXI.Assets.load(url); } catch { tex = null; }
      if (!this.roundIsCurrent(generation) || !this.backdropLayer) return;
      if (!tex) return;
      view = new PIXI.Sprite(tex);
      view.anchor.set(0.5);
    } else {
      view = await artObj(PIXI, ref, BUILD_SPACE, '', opts);
      if (!this.roundIsCurrent(generation) || !this.backdropLayer) {
        view.destroy({ children: true });
        return;
      }
    }
    this.backdropNatural = {
      w: Math.max(1, view.width || BUILD_SPACE),
      h: Math.max(1, view.height || BUILD_SPACE),
    };
    const mask = new PIXI.Graphics();
    this.backdropLayer.addChild(view, mask);
    this.backdropLayer.mask = mask;
    this.backdropView = view;
    this.backdropMask = mask;
    this.layoutBackdrop();
  }

  layoutBackdrop() {
    const rect = this.backdropRect;
    const view = this.backdropView;
    if (!rect || !view || !this.backdropNatural) return;
    const k = Math.max(rect.w / this.backdropNatural.w, rect.h / this.backdropNatural.h);
    view.scale.set(k);
    view.position.set(rect.x + rect.w / 2, rect.y + rect.h / 2);
    if (this.backdropMask) {
      this.backdropMask.clear();
      this.backdropMask.rect(rect.x, rect.y, rect.w, rect.h).fill({ color: 0xffffff });
    }
  }

  async buildSlotView(slot, generation) {
    const { PIXI } = this.stage;
    const art = await artObj(PIXI, slot.art, ART_SIZE, '', { base: this.config.assetBase });
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
    const view = new PIXI.Container();
    const halo = new PIXI.Graphics();
    // Fill at full alpha and carry the resting value on the object, so the
    // hover band can lift it to HALO_HOVER_ALPHA without a second Graphics.
    halo.circle(0, 0, ART_SIZE * 0.54).fill({ color: 0x2d7dd2, alpha: 1 });
    halo.alpha = HALO_REST_ALPHA;
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
    slot.halo = halo;
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
    const art = await artObj(PIXI, part.art, ART_SIZE, part.alt, { base: this.config.assetBase });
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
    view.on('pointerdown', (event) => { if (this.drag) this.drag.begin(event, part.id); });
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

  /**
   * Speak the prompt, then walk the build in order popping each piece and playing its
   * own sound, so a child hears "m ... at" before touching anything.
   *
   * Detached on purpose (see the call site): it must never gate input. Every step is
   * guarded by the round generation AND the voice generation, so a tap, a drag, Back, or
   * the next round all cut it off mid-sequence rather than talking over the child.
   */
  async introduceRound(generation) {
    await this.speakCapped(this.mode.prompt || this.config.voice.intro, true, VOICE_CEILING_MS, 'prompt');
    const voice = this.voiceGeneration;
    const build = this.roundBuilds[this.roundIndex];
    const pieces = (build && build.parts) || [];
    for (let i = 0; i < pieces.length; i++) {
      if (!this.roundIsCurrent(generation) || voice !== this.voiceGeneration) return;
      if (this.selectedId || (this.drag && this.drag.active)) return;  // child took over
      const part = this.parts.find((p) => p.partIndex === i);
      if (part) this.bouncePiece(part);
      await this.speakCapped(pieces[i].say, false, PIECE_VOICE_CEILING_MS, 'piece');
      if (i < pieces.length - 1) await this.delay(this.ms(160));
    }
  }

  /** A small squash-and-pop so the piece that is speaking is the one being looked at. */
  bouncePiece(part) {
    const node = part.location === 'slot' ? part.view : part.motion;
    if (!node || this.reducedMotion()) { this.playSfx('pop'); return; }
    this.playSfx('pop');
    // The bounce outlives the tap that started it, and the LAST piece of a round is placed
    // milliseconds before that round tears its display objects down. A tween still
    // pointing at a destroyed object throws from inside the ticker ("cannot read
    // properties of null (reading '_x')") -- and because that throw lands mid-await in the
    // round-advance chain, the next round deals its cars but never arms input, stranding
    // the child just as surely as a hang. So only animate a node that is still attached,
    // and only while this round is still the current one.
    const generation = this.roundGeneration;
    const alive = () => !this.destroyed
      && this.roundGeneration === generation
      && node.parent != null
      && node.scale != null;
    if (!alive()) return;
    const base = part.location === 'slot' ? node.scale.x : 1;
    this.runTween(to(node.scale, { x: base * 1.12, y: base * 1.12 }, { ms: this.ms(110), easing: ease.outCubic }))
      .then(() => (alive()
        ? this.runTween(to(node.scale, { x: base, y: base }, { ms: this.ms(180), easing: ease.outBack }))
        : null))
      .catch(() => { /* a round change mid-bounce is fine */ });
  }

  /**
   * Play a piece's own sound on tap. FIRE AND FORGET, never awaited: children tap fast
   * and repeatedly, and every tap must be able to interrupt the last one and must never
   * block a drag. voice-clips supersedes the previous clip on its single channel, so
   * rapid taps chase each other instead of queueing.
   */
  speakPiece(part) {
    if (!part) return;
    this.bouncePiece(part);
    this.speakCapped(part.say, true, PIECE_VOICE_CEILING_MS, 'piece');
  }

  async popRoundIn(generation) {
    if (this.guideLayer) {
      this.guideLayer.alpha = 0;
      await this.runTween(to(this.guideLayer, { alpha: 1 }, { ms: this.ms(280), easing: ease.outCubic }));
    }
    await Promise.all(this.parts.map(async (part, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 55);
      if (!this.roundIsCurrent(generation) || !part.motion) return;
      await this.runTween(popIn(part.motion, this.ms(340)));
    }));
  }

  /** Build space for the current round: build > mode > config > 1000×1000. */
  currentSpace() {
    const build = this.roundBuilds[this.roundIndex];
    if (build && build.space) return build.space;
    if (this.mode && this.mode.space) return this.mode.space;
    return this.config.space || [BUILD_SPACE, BUILD_SPACE];
  }

  currentBackdrop() {
    const build = this.roundBuilds[this.roundIndex];
    if (build && build.backdrop) return build.backdrop;
    if (this.mode && this.mode.backdrop) return this.mode.backdrop;
    return this.config.backdrop || null;
  }

  currentPanel() {
    const build = this.roundBuilds[this.roundIndex];
    if (build && typeof build.panel === 'boolean') return build.panel;
    if (this.mode && typeof this.mode.panel === 'boolean') return this.mode.panel;
    return this.config.panel !== false;
  }

  layoutField() {
    if (!this.stage || !this.scene || !this.boardLayer) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;
    this.clearHoveredSlot();
    const [spaceW, spaceH] = this.currentSpace();
    const layout = computeFieldLayout({ w, h, spaceW, spaceH, portrait: h >= w,
      trayReserve: this.config.trayReserve, trayOverlay: this.config.trayOverlay });
    this.fieldLayout = layout;
    this.boardScale = layout.boardScale;
    this.boardLeft = layout.boardLeft;
    this.boardTop = layout.boardTop;
    this.boardLayer.position.set(this.boardLeft, this.boardTop);
    this.boardLayer.scale.set(this.boardScale);
    // The backdrop occupies the BOARD rect, not the whole play area. The board rect
    // always carries the build space's aspect, so a backdrop authored at that aspect
    // maps 1:1 onto space coordinates and anything a build positions in space — a car
    // on a rail, a bead on a wire — lands exactly where the artwork says it should.
    // Filling the play area instead re-scales the backdrop independently of the board
    // (0.66 vs 0.48 on a portrait iPad), which crops the art and floats every part off
    // the scenery it is supposed to be standing on.
    this.backdropRect = {
      x: layout.boardLeft,
      y: layout.boardTop,
      w: Math.max(1, layout.boardW),
      h: Math.max(1, layout.boardH),
    };
    this.layoutBackdrop();
    this.layoutSlots();
    this.layoutTray(layout.tray.left, layout.tray.top, layout.tray.w, layout.tray.h, layout.trayAtBottom);
    this.layoutPlacedParts();
    this.refreshSelection();
    // Keep the dragged card under the finger across a resize / orientation flip.
    if (this.drag) this.drag.reproject();
  }

  layoutSlots() {
    for (const slot of this.slots) {
      if (!slot.view) continue;
      slot.view.position.set(slot.x, slot.y);
      const artScale = Math.max(40, slot.size) / ART_SIZE;
      slot.baseScale = artScale;
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

  layoutTray(left, top, width, height, stacked) {
    const trayParts = this.parts.filter((part) => part.location === 'tray');
    if (!trayParts.length) return;
    let columns;
    let rows;
    if (stacked) {
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
    const active = this.drag ? this.drag.active : null;

    trayParts.forEach((part, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      part.homeX = firstX + col * (this.trayCardSize + gap);
      part.homeY = firstY + row * (this.trayCardSize + gap);
      part.homeScale = scale;
      // Identity, not id. Part ids are positional (`part:0`, `part:1`, …) so every round
      // reuses them, and a drag record can outlive its round: the drop that completes a
      // round is still settling when the next round is built. Matching on the id then
      // makes the NEW round's car look like the one being dragged, so its layout is
      // skipped and it is left at the tray layer's origin at the wrong scale — a car
      // stranded in the top-left corner. Comparing the object itself cannot alias.
      if (!part.view || (active && active.piece === part && active.moved)) return;
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

  /** Nearest free slot to a STAGE-space point. Slot centres come from
   *  toGlobal(), so this stays correct whatever the board scale is. */
  slotIndexNearStagePoint(sx, sy) {
    const slot = this.nearestSlot(sx, sy, SNAP_RADIUS_MULTIPLIER);
    return slot ? slot.slotIndex : null;
  }

  nearestSlot(sx, sy, radiusMultiplier) {
    if (!this.stage || !Number.isFinite(sx) || !Number.isFinite(sy)) return null;
    let nearest = null;
    let nearestDistance = Infinity;
    for (const slot of this.slots) {
      if (slot.occupantId || !slot.view || !slot.view.visible) continue;
      const center = slot.view.toGlobal(new this.stage.PIXI.Point(0, 0));
      const distance = Math.hypot(sx - center.x, sy - center.y);
      const radius = Math.max(MIN_TOUCH / 2, slot.hitSize * SNAP_RADIUS_MULTIPLIER) * radiusMultiplier;
      if (distance <= radius && distance < nearestDistance) {
        nearest = slot;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  /** "You're close" halo — a wider band than the snap band, so the ghost lights
   *  up before the card would actually land. */
  updateHoveredSlot(sx, sy) {
    const next = this.nearestSlot(sx, sy, HOVER_RADIUS_MULTIPLIER);
    if (this.hoveredSlot === next) return;
    this.clearHoveredSlot();
    if (!next) return;
    this.hoveredSlot = next;
    if (next.halo) next.halo.alpha = HALO_HOVER_ALPHA;
    if (next.view && Number.isFinite(next.baseScale) && !this.reducedMotion()) {
      next.view.scale.set(next.baseScale * HOVER_PULSE);
    }
  }

  clearHoveredSlot() {
    const slot = this.hoveredSlot;
    this.hoveredSlot = null;
    if (!slot) return;
    if (slot.halo) slot.halo.alpha = HALO_REST_ALPHA;
    if (slot.view && Number.isFinite(slot.baseScale)) slot.view.scale.set(slot.baseScale);
  }

  selectPart(partId) {
    const part = this.findPart(partId);
    if (!part || part.location !== 'tray' || !this.canUsePart(part)) {
      this.gentleNudge(partId);
      return { accepted: false };
    }
    this.selectedId = partId;
    this.refreshSelection();
    this.speakPiece(part);
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
    // A refused placement must report accepted:false. The child-facing behaviour was
    // always right (boing, wiggle, glide home, spoken nudge, round intact) but the
    // debug hook claimed the input was taken, which is exactly the lie the contract
    // warns about: getTargets() roles and tap() results are what let an automated
    // reviewer verify the gentle-nudge path without a human watching it.
    await this.handleWrongPlacement(part.id, slot);
    return { accepted: false };
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
      this.runTween(to(part.view, { x, y, rotation: 0, scale: { x: scale, y: scale } }, { ms: this.ms(300), easing: ease.outBack })),
      sparkle(
        this.stage.PIXI,
        this.scene,
        this.boardLeft + slot.x * this.boardScale,
        this.boardTop + slot.y * this.boardScale,
      ),
      this.acknowledgeTray(part.id),
    ]);
    // A coupled car stays tappable so a child can replay its sound while building the
    // word. It is re-registered as its own target (the placement target was consumed
    // above); the slot underneath is occupied, so this cannot steal a drop.
    part.view.eventMode = 'static';
    part.view.cursor = 'pointer';
    part.view.removeAllListeners('pointerdown');
    part.view.on('pointerdown', (event) => {
      if (event && event.stopPropagation) event.stopPropagation();
      this.speakPiece(part);
    });
    this.targetMap.set(`placed:${part.partIndex}`, {
      id: `placed:${part.partIndex}`,
      type: 'placed',
      part,
      view: part.view,
      action: () => { this.speakPiece(part); return { accepted: true }; },
    });
    // Not awaited: the placement sound must not hold the round-complete check, and a
    // child tapping other cars meanwhile should interrupt it, not queue behind it.
    this.speakPiece(part);
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
    const motions = [wiggle(part.motion, 0.075, this.ms(75))];
    if (slot && slot.view) motions.push(wiggle(slot.view, 0.055, this.ms(72)));
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
    }, { ms: this.ms(280), easing: ease.outCubic }));
    if (part.location === 'tray' && this.trayLayer) this.trayLayer.addChild(part.view);
    part.shadow.alpha = 0.16;
    part.motion.rotation = 0;
    part.motion.scale.set(1);
  }

  async acknowledgeTray(excludeId) {
    const remaining = this.parts.filter((part) => part.location === 'tray' && part.id !== excludeId && part.motion);
    await Promise.all(remaining.map(async (part, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 22);
      await this.runTween(to(part.motion, { scale: { x: 1.045, y: 1.045 } }, { ms: this.ms(90), easing: ease.outBack }));
      await this.runTween(to(part.motion, { scale: { x: 1, y: 1 } }, { ms: this.ms(110), easing: ease.outQuad }));
    }));
  }

  gentleNudge(partId) {
    const part = partId ? this.findPart(partId) : null;
    if (part && part.motion) wiggle(part.motion, 0.07, this.ms(75));
    this.playSfx('boing');
    this.speakLine(this.config.voice.wait || this.config.voice.nudge, true);
  }

  /**
   * Optional picture reveal: when a build names `reveal`, the finished word's object card
   * pops up above the assembly while the blend line plays, so the child sees a sun at the
   * same moment they hear "sun". Lives on the board layer in space coordinates, so it
   * scales and positions with everything else and is torn down with the round scene.
   */
  async showReveal(build, generation) {
    const ref = build && build.reveal;
    if (!ref || !this.assemblyLayer || !this.stage) return null;
    const { PIXI } = this.stage;
    const [spaceW, spaceH] = this.currentSpace();
    const size = Number.isFinite(build.revealSize)
      ? build.revealSize
      : Math.round(Math.min(spaceW, spaceH) * 0.30);
    // Shared object cards carry their own transparent margin, and how much varies with
    // the subject (a mat is genuinely wide and flat; a cat is tall). Render the art a
    // little larger than the plate's inner box so a typical object reads at a good size,
    // but only a little — enough to overflow the widest of them would clip it.
    const art = await artObj(PIXI, normalizeArtRef(ref), Math.round(size * 1.15), '',
      { base: this.config.assetBase });
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return null; }

    const card = new PIXI.Container();
    const pad = size * 0.06;   // thin frame: the picture is the point, not the plate
    const w = size + pad * 2;
    const h = size + pad * 2;
    const plate = new PIXI.Graphics();
    plate.roundRect(-w / 2, -h / 2, w, h, size * 0.17)
      .fill({ color: 0xfdf6e3 })
      .stroke({ width: Math.max(3, size * 0.045), color: 0xffffff });
    card.addChild(plate, art);
    const at = Array.isArray(build.revealAt)
      ? build.revealAt
      // High enough to clear the assembly below it — a card that overlaps the very
      // pieces the child just placed hides the thing it is celebrating.
      : [spaceW / 2, Math.round(spaceH * 0.17)];
    card.position.set(at[0], at[1]);
    card.scale.set(0.01);
    this.assemblyLayer.addChild(card);
    await this.runTween(popIn(card, this.ms(360)));
    return card;
  }

  /**
   * The finished train rolls forward and closes its couplings. This replaces a board-wide
   * pop, which drew the eye to the whole screen at the moment the interesting thing was
   * the WORD: the cars sliding together read as the pieces becoming one thing.
   *
   * The sprites are not precision-cut, so this closes the gap by a configured fraction of
   * the authored spacing rather than pretending to compute a perfect butt joint.
   */
  async coupleUpTrain(build, generation) {
    const cfg = (build && build.coupleUp) || this.config.coupleUp;
    if (!cfg || !this.slots.length) return;
    const cars = this.slots
      .filter((slot) => slot.occupantId)
      .map((slot) => ({ slot, part: this.findPart(slot.occupantId) }))
      .filter((entry) => entry.part && entry.part.view && !entry.part.view.destroyed);
    if (cars.length < 2) return;
    const close = Number.isFinite(cfg.close) ? cfg.close : 0.86;
    const roll = Number.isFinite(cfg.roll) ? cfg.roll : 0;
    const step = (cars[1].slot.x - cars[0].slot.x) * close;
    const startX = cars[0].slot.x - roll;
    this.playSound('roll');
    await Promise.all(cars.map((entry, index) => this.runTween(
      to(entry.part.view, { x: startX + index * step },
        { ms: this.ms(720), easing: ease.outCubic }))));
    if (!this.roundIsCurrent(generation)) return;
    this.playSound('horn');
  }

  async completeRound() {
    this.awaitingInput = false;
    this.inputLocked = true;
    this.selectedId = null;
    this.detachDrag();
    this.playSfx('tada');
    const [spaceW, spaceH] = this.currentSpace();
    const centerX = this.boardLeft + spaceW * this.boardScale / 2;
    const centerY = this.boardTop + spaceH * this.boardScale / 2;
    const build = this.roundBuilds[this.roundIndex];
    const generation = this.roundGeneration;
    // A game that defines coupleUp gets the roll-together; everything else keeps the
    // board pulse it has always had.
    const rolls = !!((build && build.coupleUp) || this.config.coupleUp);
    const originalScale = this.boardScale;
    await Promise.all([
      rolls
        ? this.coupleUpTrain(build, generation)
        : (async () => {
            await this.runTween(to(this.boardLayer.scale, { x: originalScale * 1.045, y: originalScale * 1.045 }, { ms: this.ms(180), easing: ease.outBack }));
            await this.runTween(to(this.boardLayer.scale, { x: originalScale, y: originalScale }, { ms: this.ms(220), easing: ease.outElastic }));
          })(),
      burst(this.stage.PIXI, this.scene, centerX, centerY, { count: 36, power: 7, life: this.ms(760) }),
    ]);
    const revealed = await this.showReveal(build, generation);
    const revealedAt = Date.now();
    // Belt and braces: the round advance must NEVER be hostage to audio. The blend line
    // is the best moment in the game and worth waiting for, but if a clip fails to decode,
    // autoplay is blocked, or a device's speech synth never reports back, the child would
    // be stranded on a finished round with an empty tray and no way forward. Wait for the
    // voice OR a generous ceiling, whichever lands first, then carry on.
    await this.speakCapped(build && build.say, true, VOICE_CEILING_MS, 'blend');
    // Hold the picture for its own sake, not the voice's. Normally the blend readout
    // keeps it on screen for seconds, but with audio muted or a clip missing the line
    // returns instantly and the reward would flash past unseen. The picture IS the
    // reward for a child who cannot read the word, so it gets a floor of its own.
    if (revealed) {
      const held = Date.now() - revealedAt;
      const floor = this.ms(this.reducedMotion() ? 700 : REVEAL_HOLD_MS);
      if (held < floor) await this.delay(floor - held);
    }
    await this.delay(this.ms(this.reducedMotion() ? 120 : 420));
    if (this.destroyed || this.screen !== 'play') return;
    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) await this.finishGame();
    else await this.showRound(next);
  }

  async finishGame() {
    this.clearIdleTimer();
    this.detachDrag();
    this.bumpVoice();
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.selectedId = null;
    this.targetMap.clear();
    this.playSfx('tada');
    this.disposeStage();
    const cheer = lineText(this.config.voice.cheer);
    this.mountEl.innerHTML = `
      <section class="qk-build qk-build-end" aria-label="${escapeAttr(cheer)}">
        <button class="qk-build-back qk-build-img-btn" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-build-end-center">
          <div class="qk-build-end-art" aria-hidden="true"></div>
          <h1>${escapeHtml(cheer)}</h1>
          <button class="qk-build-again" type="button">
            <span class="qk-build-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(lineText(this.config.copy.playAgain))}</span>
          </button>
        </div>
      </section>
    `;
    this.renderScreenArt('.qk-build-end-art', this.config.endArt || this.config.splashArt);
    const again = this.mountEl.querySelector('.qk-build-again');
    onTap(again, () => this.mode ? this.startMode(this.mode.id) : this.renderSplash(), {
      feedback: (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); },
    });
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
    }, this.ms(IDLE_MS));
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
    const build = this.screen === 'play' ? this.roundBuilds[this.roundIndex] : null;
    const dragActive = this.drag ? this.drag.active : null;
    const spec = this.config.voice && this.config.voice.clips;
    return {
      // Required floor (every build-assemble sibling and every other archetype
      // relies on exactly these five keys existing).
      screen: this.screen,
      mode: this.mode ? this.mode.id : null,
      round: this.screen === 'play' ? this.roundIndex : this.roundsTotal,
      roundsTotal: this.roundsTotal,
      awaitingInput: this.awaitingInput,
      // build-assemble extras.
      build: build ? (build.name || null) : null,
      space: this.currentSpace(),
      slotsTotal: this.slots.length,
      placed: this.slots.filter((slot) => slot.occupantId).length,
      selected: this.selectedId,
      dragging: dragActive ? dragActive.id : null,
      hovered: this.hoveredSlot ? this.hoveredSlot.targetId : null,
      muted: this.muted,
      clips: {
        configured: !!(spec && spec.manifest),
        loading: !!this.clipsLoading && !this.clipsReady,
        ready: this.clipsReady,
      },
    };
  }

  /** Measured layout, for QA: board scale, on-screen part sizes, tray box. */
  layoutSnapshot() {
    if (!this.stage || !this.fieldLayout) return null;
    const size = this.stage.size();
    const [spaceW, spaceH] = this.currentSpace();
    return {
      stage: { w: size.w, h: size.h },
      space: [spaceW, spaceH],
      boardScale: this.boardScale,
      boardLeft: this.boardLeft,
      boardTop: this.boardTop,
      boardW: this.fieldLayout.boardW,
      boardH: this.fieldLayout.boardH,
      tray: { ...this.fieldLayout.tray },
      trayAtBottom: this.fieldLayout.trayAtBottom,
      trayCardSize: this.trayCardSize,
      slotScreenSizes: this.slots.map((slot) => Math.max(40, slot.size) * this.boardScale),
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
    // Coupled cars are tappable (they replay their own sound), so they are real targets.
    // They keep a distinct `placed:` id: a QA driver counting the tray by `part:` prefix
    // would otherwise see a placed car as still being in the tray.
    for (const part of this.parts) {
      if (part.location !== 'slot' || !part.view) continue;
      const target = this.targetRect(`placed:${part.partIndex}`, 'neutral', part.view, ART_SIZE);
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
    this.detachDrag();
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

  /** Silence everything audible, including anything outside our own control
   *  (a stray <audio>/<video> element, an in-flight speechSynthesis utterance)
   *  so QA screenshots/recordings are never spoiled by a trailing voice line. */
  mute() {
    this.muted = true;
    this.stopVoice(); // bumps voiceGeneration, stops the clip channel + speech.js
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    document.querySelectorAll('audio, video').forEach((el) => { el.muted = true; });
  }

  seed(n) {
    const value = Number(n) || 0;
    this.rng = mulberry32(value);
    this.fxRng = mulberry32(value + 101);
  }

  /** QA speed-up: compress every timed beat (tweens, wiggles, idle prompt) so
   *  a reviewer does not sit through real-time celebrations. Clamped so a
   *  caller can never freeze the engine (0) or slow it down past real-time. */
  fastTimers(scale = 0.05) {
    this.timeScale = Math.max(0.01, Math.min(1, Number(scale) || 0.01));
    return this.timeScale;
  }

  getAudioLog() {
    return this.audioLog.slice();
  }

  clearAudioLog() {
    this.audioLog.length = 0;
  }

  /** Return to the splash so QA can loop modes without a page reload. */
  home() {
    this.renderSplash();
  }

  canUsePart(part) {
    if (!part || part.location !== 'tray') return false;
    const build = this.roundBuilds[this.roundIndex];
    if (!build || !build.ordered) return true;
    const nextSlot = this.slots.find((slot) => !slot.occupantId);
    return !!nextSlot && nextSlot.slotIndex === part.partIndex;
  }

  // ------------------------------------------------------------------ voice

  bumpVoice() {
    this.voiceGeneration += 1;
  }

  /** Cancel everything audible: recorded clip channel AND synthesized speech. */
  stopVoice() {
    this.voiceGeneration += 1;
    clips.stop(); // pauses the clip channel and calls speech.stop()
  }

  /** Load the GAME-LOCAL flat clip manifest, once, lazily. A config with no
   *  voice.clips block never fetches anything — that is what keeps the 14
   *  sibling games network-silent. */
  ensureVoiceClips() {
    const spec = this.config.voice && this.config.voice.clips;
    if (!spec || !spec.manifest) return Promise.resolve();
    if (!this.clipsLoading) {
      const base = this.config.assetBase;
      const manifestUrl = new URL(spec.manifest, base).href;
      // clips.init() defaults linesUrl to './data/lines.json'; hand it an inline
      // empty object instead of provoking a 404 when the game has no lines file.
      const linesUrl = spec.lines ? new URL(spec.lines, base).href : 'data:application/json,%7B%7D';
      // Settle clipsReady on success AND failure — for QA it means "the
      // attempt is done", not "recorded clips exist" (init() never rejects).
      this.clipsLoading = clips.init(manifestUrl, linesUrl, spec.defaults || {})
        .then(() => { this.clipsReady = true; })
        .catch(() => { this.clipsReady = true; });
    }
    return this.clipsLoading;
  }

  logAudio(kind, ref, url, tag) {
    this.audioLog.push({
      t: Date.now(),
      kind,
      // Why this line played, passed down the call chain rather than parked on `this`.
      // Several things speak concurrently -- the round's blend readout awaits each clip,
      // and a child tapping cars mid-readout speaks over it -- so a single mutable
      // instance field gets overwritten between the awaits of one sequence and the log
      // ends up attributing half a blend readout to a tap.
      tag: tag || 'other',
      ref: ref == null ? null : String(ref),
      url: url || null,
    });
    if (this.audioLog.length > AUDIO_LOG_MAX) this.audioLog.shift();
  }

  /**
   * Speak one authored line. A line is either a plain STRING (today's path,
   * unchanged) or a line object:
   *   { clip: 'letter:m', text: 'mmm' }
   *   { seq: ['letter:m','letter:a','letter:t','word:mat'], gap: 240, text: '…' }
   * Sequence timing comes from the real clip durations (playClip resolves on
   * the audio element's `ended`), never a hardcoded guess — only `gap` is
   * authored.
   */
  /**
   * speakLine, but it always settles. Used anywhere the game LOOP waits on a line:
   * a stuck voice may cost the line, never the game.
   * The ceiling is real time, not scaled by fastTimers -- a real clip sequence must be
   * allowed to finish, and QA mutes rather than racing it.
   */
  async speakCapped(line, cancel = false, ceilingMs = VOICE_CEILING_MS, tag = 'other') {
    if (this.muted || !line) return;
    let timer = null;
    try {
      await Promise.race([
        this.speakLine(line, cancel, tag),
        new Promise((resolve) => { timer = window.setTimeout(resolve, ceilingMs); }),
      ]);
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  async speakLine(line, cancel = false, tag = null) {
    if (this.muted || !line) return;
    if (cancel) this.bumpVoice();
    const generation = this.voiceGeneration;

    if (typeof line === 'string') {
      this.logAudio('speech', line, null, tag);
      await speech.speak(line, { rate: 0.8, pitch: 1.05, cancel });
      return;
    }
    if (typeof line !== 'object') return;

    const text = typeof line.text === 'string' ? line.text : '';
    const seq = Array.isArray(line.seq)
      ? line.seq.filter(Boolean)
      : (line.clip ? [line.clip] : []);

    if (!seq.length) {
      if (!text) return;
      this.logAudio('speech', text, null, tag);
      await speech.speak(text, { rate: 0.8, pitch: 1.05, cancel });
      return;
    }

    const gap = Number.isFinite(line.gap) ? Math.max(0, line.gap) : 0;
    const single = seq.length === 1;
    let spoke = false;
    for (let i = 0; i < seq.length; i++) {
      if (this.destroyed || generation !== this.voiceGeneration) return;
      const fallback = single ? (text || clipFallbackText(seq[i])) : clipFallbackText(seq[i]);
      if (await this.speakOne(seq[i], fallback, tag)) spoke = true;
      if (this.destroyed || generation !== this.voiceGeneration) return;
      if (gap && i < seq.length - 1) await this.delay(gap);
    }
    // Level-2 fallback: nothing in the sequence was resolvable or speakable.
    if (!spoke && text && !this.destroyed && generation === this.voiceGeneration) {
      this.logAudio('speech', text, null);
      await speech.speak(text, { rate: 0.8, pitch: 1.05 });
    }
  }

  /**
   * Play one clip ref. Returns true when something was actually voiced.
   * `clip:<key>` goes through the game-local manifest; every other scheme
   * resolves to a URL and goes through clips.sayFile(), because the SHARED
   * manifest (shared/assets/audio/manifest.json) is nested by category and
   * clips.init() on it would silently no-op.
   */
  async speakOne(ref, fallbackText, tag) {
    if (typeof ref !== 'string' || !ref) {
      if (!fallbackText) return false;
      this.logAudio('speech', ref, null, tag);
      await speech.speak(fallbackText, { rate: 0.8, pitch: 1.05 });
      return true;
    }
    if (ref.startsWith('clip:')) {
      const key = ref.slice(5);
      this.logAudio('clip', ref, key, tag);
      await clips.say(key, fallbackText);
      return true;
    }
    const url = clipUrlFor(ref, this.config.assetBase);
    if (!url) {
      if (!fallbackText) return false;
      this.logAudio('speech', ref, null, tag);
      await speech.speak(fallbackText, { rate: 0.8, pitch: 1.05 });
      return true;
    }
    this.logAudio('clip', ref, url, tag);
    await clips.sayFile(url, fallbackText);
    return true;
  }

  /**
   * The one element behind a config.sound.* key, created on demand and kept for the
   * life of the game. It has to be the SAME element every time: the only element iOS
   * will let the round loop play unprompted is one that already played inside a
   * gesture, and blessSounds() primes exactly these. One element per url, so a short
   * roll can still be ringing out when the horn starts over the top of it.
   */
  soundElFor(key) {
    const entry = this.config.sound && this.config.sound[key];
    if (!entry) return null;
    const ref = typeof entry === 'string' ? entry : entry.src;
    if (!ref) return null;
    const url = clipUrlFor(ref, this.config.assetBase);
    if (!url) return null;
    let el = this.soundEls.get(url);
    if (!el) {
      el = new Audio();
      el.preload = 'auto';
      el.src = url;
      this.soundEls.set(url, el);
    }
    return el;
  }

  /**
   * Play a game-supplied sound FILE (config.sound.*), as distinct from playSfx()'s
   * synthesised blips. Deliberately not the voice channel: a train rolling in should
   * layer under the spoken word, not cancel it.
   * Fire and forget — nothing in the round loop may ever wait on a sound effect.
   */
  playSound(key) {
    if (this.muted) return;
    const entry = this.config.sound && this.config.sound[key];
    if (!entry) return;
    const el = this.soundElFor(key);
    if (!el) return;
    // An entry is either a bare ref or { src, volume }. Volume matters: these are real
    // recordings sitting next to a synthesised SFX bed and a spoken voice line, and a
    // sound mastered for its own sake is almost always too loud in the mix — it has to
    // sit UNDER the word the child is listening for, not compete with it.
    const volume = typeof entry === 'object' && Number.isFinite(entry.volume)
      ? Math.max(0, Math.min(1, entry.volume))
      : 1;
    try {
      el.muted = false;      // cleared here because stopSounds() mutes on the way out
      el.volume = volume;
      el.currentTime = 0;
      // latch before play() so blessSounds() sees the in-flight request even while
      // el.paused still reads true; cleared once play() settles either way
      this.soundsRequested.add(el);
      const p = el.play();
      if (p && typeof p.then === 'function') {
        p.then(
          () => { this.soundsRequested.delete(el); this.blessedSounds.add(el); },
          () => { this.soundsRequested.delete(el); /* blocked before a gesture */ },
        );
      } else {
        this.soundsRequested.delete(el);
        this.blessedSounds.add(el);
      }
    } catch {
      this.soundsRequested.delete(el);
      /* a missing sound must never break a round */
    }
  }

  /** Stop any game sounds — used by mute() and teardown. */
  stopSounds() {
    // Mute as well as pause. These elements are detached `new Audio()` objects, so the
    // `document.querySelectorAll('audio, video')` sweep in mute() cannot reach them —
    // pausing here is what actually silences a train that is mid-roll.
    this.soundEls.forEach((el) => {
      try { el.pause(); el.muted = true; } catch { /* ignore */ }
    });
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

  /** QA speed-up: scales a hardcoded duration by this.timeScale (default 1,
   *  so every duration is byte-identical unless fastTimers() has been used). */
  ms(n) {
    return Math.max(1, Math.round(n * this.timeScale));
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
  // Game-local asset base for `game:` art refs and `game:` clip refs. Matches
  // the raw './assets/…' convention configs already use for theme.background.
  const assetBase = new URL(config.assetBase || './', document.baseURI).href;
  const inherited = {
    space: normalizeSpace(config.space, [BUILD_SPACE, BUILD_SPACE]),
    backdrop: config.backdrop ? normalizeArtRef(config.backdrop) : null,
    panel: config.panel !== false,
  };
  return {
    ...config,
    id: config.id || 'build-assemble',
    title: config.title || 'Build It',
    assetBase,
    space: inherited.space,
    backdrop: inherited.backdrop,
    panel: inherited.panel,
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || firstBuildArt(modes) || 'emoji:🧩'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    copy,
    voice,
    modes: modes.map((mode) => normalizeMode(mode, inherited)).filter((mode) => mode.builds.length),
  };
}

function normalizeMode(mode = {}, inherited = {}) {
  const resolved = {
    space: normalizeSpace(mode.space, inherited.space || [BUILD_SPACE, BUILD_SPACE]),
    backdrop: mode.backdrop ? normalizeArtRef(mode.backdrop) : (inherited.backdrop || null),
    panel: typeof mode.panel === 'boolean' ? mode.panel : (inherited.panel !== false),
  };
  const builds = (mode.builds || [])
    .map((build) => normalizeBuild(build, resolved))
    .filter((build) => build.parts.length >= 2);
  return {
    ...mode,
    id: mode.id || 'build',
    title: mode.title || 'Build',
    rounds: Math.min(mode.rounds || builds.length, builds.length),
    prompt: mode.prompt || '',
    space: resolved.space,
    backdrop: resolved.backdrop,
    panel: resolved.panel,
    builds,
  };
}

function normalizeBuild(build = {}, inherited = {}) {
  const space = normalizeSpace(build.space, inherited.space || [BUILD_SPACE, BUILD_SPACE]);
  const [spaceW, spaceH] = space;
  const maxSize = Math.max(spaceW, spaceH) * 0.9;
  const parts = (build.parts || []).filter((part) => part && part.art).map((part, index) => ({
    ...part,
    art: normalizeArtRef(part.art),
    alt: part.alt || `part ${index + 1}`,
    x: clampNumber(part.x, spaceW / 2, 0, spaceW),
    y: clampNumber(part.y, spaceH / 2, 0, spaceH),
    size: clampNumber(part.size, 160, 60, maxSize),
  }));
  return {
    ...build,
    name: build.name || 'build',
    say: build.say || '',
    ordered: !!build.ordered,
    space,
    backdrop: build.backdrop ? normalizeArtRef(build.backdrop) : (inherited.backdrop || null),
    panel: typeof build.panel === 'boolean' ? build.panel : (inherited.panel !== false),
    parts,
  };
}

/** `[w, h]` build space, falling back to the inherited value. */
function normalizeSpace(value, fallback) {
  if (!Array.isArray(value) || value.length < 2) return fallback;
  const w = Number(value[0]);
  const h = Number(value[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return fallback;
  return [w, h];
}

function firstBuildArt(modes) {
  for (const mode of modes) {
    for (const build of mode.builds || []) {
      if (build.parts && build.parts[0] && build.parts[0].art) return build.parts[0].art;
    }
  }
  return null;
}

/**
 * Normalise an art ref. A string without a colon gains the `emoji:` prefix
 * (unchanged). An ARRAY is a layer stack: each entry is normalised in place,
 * string entries stay strings and object entries keep their scale/dx/dy/alpha.
 */
export function normalizeArtRef(ref) {
  if (Array.isArray(ref)) {
    return ref.map((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return { ...entry, ref: normalizeArtRef(entry.ref) };
      }
      return normalizeArtRef(entry);
    });
  }
  if (!ref) return 'emoji:🧩';
  if (typeof ref !== 'string') return 'emoji:🧩';
  if (ref.includes(':')) return ref;
  return `emoji:${ref}`;
}

/**
 * A stable identity for an art ref. Strings return themselves, so every
 * existing config produces byte-identical match keys; layered refs get a
 * deterministic JSON form (slots and parts share the same normalised object,
 * so key order is stable).
 */
export function artKey(ref) {
  if (typeof ref === 'string') return ref;
  try {
    return JSON.stringify(ref);
  } catch {
    return String(ref);
  }
}

export function matchKey(part) {
  return `${artKey(part.art)}|${part.alt || ''}`;
}

/** Display text for a value that may be a string or a { text } line object. */
function lineText(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.text === 'string') return value.text;
  return '';
}

/**
 * Clip-ref grammar, mirroring the art-ref grammar:
 *   letter:<x>       phonic fragment (lowercased only, so rimes like 'at' work)
 *   word:<w>         spoken word
 *   cheer:<w>        celebratory word
 *   isfor:<w>        "B is for ball"
 *   shared:audio/…   any file under shared/assets/
 *   game:…           game-local file, against config.assetBase
 * `clip:<key>` is deliberately NOT here — it goes through the game-local
 * manifest via clips.say(). Everything resolved here is played with
 * clips.sayFile(url, fallbackText).
 */
function clipUrlFor(ref, base) {
  if (typeof ref !== 'string' || !ref) return null;
  if (ref.startsWith('letter:')) return content.letterSoundUrl(ref.slice(7));
  if (ref.startsWith('word:')) return content.wordAudio(ref.slice(5));
  if (ref.startsWith('cheer:')) return content.wordCelebrate(ref.slice(6));
  if (ref.startsWith('isfor:')) return content.isforAudio(ref.slice(6));
  if (ref.startsWith('shared:')) return new URL(ref.slice(7), SHARED_ASSETS).href;
  if (ref.startsWith('game:')) return new URL(ref.slice(5), base || document.baseURI).href;
  return null;
}

/** Spoken fallback for a clip ref when the recording is missing. */
function clipFallbackText(ref) {
  if (typeof ref !== 'string') return '';
  if (ref.startsWith('letter:')) return ref.slice(7);
  if (ref.startsWith('word:')) return ref.slice(5);
  if (ref.startsWith('cheer:')) return ref.slice(6);
  if (ref.startsWith('isfor:')) return ref.slice(6);
  return '';
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
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

/** The back button an event landed on, if any — null for anything else, including
 *  a target that is not an Element and so has no .closest. */
function backButtonFor(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest('.qk-build-back');
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
      border: 5px solid var(--white); box-shadow: var(--shadow); font-size: clamp(70px,15vmin,126px); line-height: 1;
      --qk-art-size: clamp(70px,15vmin,126px); }
    .qk-build-splash-art .qk-art-img,.qk-build-end-art .qk-art-img,
    .qk-build-splash-art .qk-art-stack,.qk-build-end-art .qk-art-stack { width: 84%; height: 84%; }
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
    /* Picture-led mode buttons. Only applied when a game supplies mode.art, so the
       text-only buttons every other game renders are untouched. */
    .qk-build-mode-art { display: grid; grid-template-rows: 1fr auto; gap: 8px;
      align-items: center; justify-items: center; padding: 14px 16px 16px; }
    .qk-build-mode-art-slot { display: block; width: 100%; height: clamp(96px,17vmin,168px);
      --qk-art-size: clamp(60px,11vmin,104px); }
    .qk-build-mode-art .qk-build-mode-label { font-size: clamp(19px,3vmin,28px); }
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
