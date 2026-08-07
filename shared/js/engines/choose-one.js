// choose-one.js — Stage v2 archetype for "hear/see a prompt, tap one answer".
// DOM owns the familiar chrome; Pixi owns the playful prompt and answer field.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { onTap } from '../tap.js';
import { mulberry32, shuffle } from '../rng.js';
import { escapeHtml, escapeAttr } from '../dom.js';
import { emojiFromRef } from '../art-ref.js';
import { createTimers } from '../timers.js';
import { installDebug } from '../debug-harness.js';
import { createScreens, wireEndScreen } from '../screens.js';
import { renderModeCards } from '../mode-select.js';
import { installEngineStyles } from './engine-styles.js';
import { createStage } from '../stage/stage.js';
import { to, ease, popIn, wiggle, sway } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';

const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const ANSWER_SIZE = 180;
const PROMPT_SIZE = 166;
const CARD_COLORS = [0xfff8e8, 0xe9fff1, 0xfff0e6, 0xeef1ff];

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('choose-one requires a mount element');
  installStyle();
  return new ChooseOneGame(config, mountEl);
}

class ChooseOneGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.destroyed = false;
    // The engine keeps its own delay registry (clearDelays() RESOLVES pending
    // waits so an awaiting flow finishes instead of stalling -- timers.js
    // clearAll() deliberately does the opposite). The group is here purely as
    // the scale holder `fastTimers()` turns, read back through `timers.ms()`.
    this.timers = createTimers();

    // The screen router owns "which screen is live" — this.screen is a getter
    // over it, never a second copy of the fact (docs/shared-platform-refactor.md §4a).
    this.screens = null;
    this.mode = null;
    this.roundItems = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.currentItem = null;
    this.currentAnswers = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    this.muted = false;
    this.yumIndex = 0;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.targetMap = new Map();
    this.targetSeq = 0;
    this.seedValue = null;
    this.rng = Math.random;
    this.fxRng = Math.random;

    this.stage = null;
    this.scene = null;
    this.promptView = null;
    this.answerViews = [];
    this.removeResize = null;
    this.stopPromptSway = null;
    this.stageGeneration = 0;
    this.roundGeneration = 0;
    this.pendingDelays = new Set();
    this.activeTweens = new Set();

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (e) => e.preventDefault();
    this.onGestureStart = (e) => e.preventDefault();
    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);

    this.buildShell();
    this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebugHook();
  }

  /** @returns {'splash'|'play'|'end'} the live screen, straight from the router */
  get screen() {
    return this.screens ? this.screens.current : 'splash';
  }

  /**
   * The three screens, built once and toggled by the router, instead of one
   * mount whose innerHTML is thrown away on every transition. Each section keeps
   * the exact class list it rendered with before, plus the shared `qk-eng-*`
   * vocabulary from shared/css/engine-base.css.
   */
  buildShell() {
    this.mountEl.innerHTML = `
      <section class="qk-choose qk-choose-splash qk-eng-root qk-eng-surface qk-eng-page" aria-label="${escapeAttr(this.config.title)}"></section>
      <section class="qk-choose qk-choose-play qk-eng-root qk-eng-surface qk-eng-play" hidden></section>
      <section class="qk-choose qk-choose-end qk-eng-root qk-eng-surface qk-eng-page" hidden></section>
    `;
    this.screens = createScreens({
      root: this.mountEl,
      screens: {
        splash: this.mountEl.querySelector('.qk-choose-splash'),
        play: this.mountEl.querySelector('.qk-choose-play'),
        end: this.mountEl.querySelector('.qk-choose-end'),
      },
      initial: 'splash',
      voice: { stop: () => speech.stop() },
    });
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
    if (this.screens) { this.screens.destroy(); this.screens = null; }
    this.mountEl.innerHTML = '';
    this.targetMap.clear();
    if (this.disposeDebug) { this.disposeDebug(); this.disposeDebug = null; }
  }

  unlockAudio() {
    // unlock/resume run on every gesture, not just the first: iPadOS can
    // suspend the AudioContext later (app switch, notification, lock), and
    // these calls are cheap and idempotent
    sfx.unlock();
    speech.unlock();
  }

  installDebugHook() {
    this.disposeDebug = installDebug({
      gameId: this.config.id,
      engine: 'choose-one',
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

  renderSplash() {
    this.clearIdleTimer();
    this.disposeStage();
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    speech.stop();

    const splash = this.screens.el('splash');
    // show() is IDEMPOTENT: re-entering the splash we are already on would not
    // run its bag, so release it by hand before the markup underneath changes.
    this.screens.release('splash');
    this.screens.show('splash');
    splash.innerHTML = `
      <a class="qk-choose-home qk-choose-img-btn qk-choose-home-splash qk-eng-img-btn qk-eng-ico-home qk-eng-corner-tl" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
      <div class="qk-choose-splash-center qk-eng-center">
        <div class="qk-choose-splash-emoji qk-eng-card qk-eng-card-glyph" aria-hidden="true">${escapeHtml(emojiFromRef(this.config.splashEmoji))}</div>
        <h1 class="qk-eng-title">${escapeHtml(this.config.title)}</h1>
        <div class="qk-choose-mode-list qk-eng-mode-list"></div>
      </div>
    `;

    const picker = renderModeCards({
      host: splash.querySelector('.qk-choose-mode-list'),
      modes: this.config.modes,
      // The engine paints its own cards (engine-base.css `.qk-eng-mode`), so the
      // screens.css card skin stays off — `skin: false` is what keeps every pixel.
      skin: false,
      cardClass: 'qk-choose-mode qk-eng-mode',
      decorate: (btn) => btn.querySelector('.qk-mode-title')?.classList.add('qk-choose-mode-title'),
      feedback: (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); },
      onPick: (id) => this.startMode(id),
    });

    // docs/interaction-patterns.md §8, as a DOM invariant rather than a comment:
    // the catalog link exists ONLY while the splash is the live screen. With
    // persistent screen sections the anchor would otherwise sit in the document
    // (hidden, but still findable) for the whole session — and "no catalog link
    // on the play screen" is a check the QA drivers actually make.
    const homeLink = splash.querySelector('a.qk-choose-home');
    if (homeLink) this.screens.hold(() => homeLink.remove());
    this.screens.hold(picker.dispose);
  }

  // play/end screens rebuild their innerHTML, so the back button is rewired at
  // each render; the disposer rides the screen's own teardown bag.
  wireBack(section) {
    const back = section.querySelector('.qk-choose-back');
    if (!back) return;
    this.screens.hold(onTap(back, () => { speech.stop(); this.renderSplash(); }));
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;

    const mode = this.config.modes.find((m) => m.id === modeId) || this.config.modes[0];
    if (!mode) return;

    // The double-tap latch: a second card press while the first start is still
    // in flight is swallowed rather than running the whole teardown+render twice.
    return this.screens.start(() => this.runMode(mode));
  }

  async runMode(mode) {
    this.clearIdleTimer();
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.roundIndex = 0;
    this.yumIndex = 0;
    const maxRounds = Math.min(mode.rounds || mode.items.length, mode.items.length);
    this.roundItems = shuffle(mode.items.slice(), this.rng).slice(0, maxRounds);
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
    const dots = Array.from({ length: this.roundsTotal }, (_, i) => `
      <span class="qk-choose-dot qk-eng-dot" data-dot="${i}" aria-hidden="true"></span>
    `).join('');

    const play = this.screens.el('play');
    // Restarting a mode from the play screen re-renders in place, and show() is
    // idempotent — release the live tap handlers before the DOM under them goes.
    this.screens.release('play');
    play.setAttribute('aria-label', this.mode.title);
    play.innerHTML = `
      <header class="qk-choose-hud qk-eng-hud">
        <button class="qk-choose-back qk-choose-img-btn qk-eng-img-btn qk-eng-ico-back qk-eng-corner-tl" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-choose-progress qk-eng-pill" aria-hidden="true">${dots}</div>
      </header>
      <main class="qk-choose-stage qk-eng-stage">
        <div class="qk-choose-video hidden" aria-hidden="true">
          <video muted playsinline preload="auto"></video>
        </div>
        <div class="qk-choose-canvas qk-eng-canvas" aria-label="${escapeAttr(this.mode.title)}"></div>
      </main>
      <button class="qk-choose-sound qk-choose-img-btn qk-eng-img-btn qk-eng-ico-sound qk-eng-corner-bl" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
    `;
    this.screens.show('play');
    this.applyThemeBackdrop(play);
    this.wireBack(play);

    const sound = play.querySelector('.qk-choose-sound');
    this.screens.hold(onTap(sound, () => this.replayPromptFromHud(), {
      feedback: (e) => { e.stopPropagation(); this.unlockAudio(); },
    }));
    // tapping the story vignette replays it together with the spoken line
    const videoWrap = play.querySelector('.qk-choose-video');
    const replayVideo = () => {
      this.unlockAudio();
      this.replayPromptFromHud();
    };
    videoWrap.addEventListener('pointerdown', replayVideo);
    this.screens.hold(() => videoWrap.removeEventListener('pointerdown', replayVideo));
  }

  /** Art-world backdrop (docs/art-direction.md): theme.background paints the
   *  whole section via CSS cover — the Pixi canvas is transparent above it. */
  applyThemeBackdrop(section) {
    const theme = this.config.theme;
    if (!theme || !theme.background || !section) return;
    const ref = String(theme.background);
    const url = ref.startsWith('shared:') || ref.startsWith('char:') ? artUrlRef(ref) : ref;
    if (!url) return;
    section.style.background = `#bfe3f5 url("${url}") center / cover no-repeat`;
  }

  /** Story Screen (docs/art-direction.md): an item with promptVideo plays a
   *  short muted vignette as the round's prompt; the voice line narrates it.
   *  Playback failure just leaves the poster frame — never blocks the round. */
  updatePromptVideo() {
    const wrap = this.screens.el('play').querySelector('.qk-choose-video');
    if (!wrap) return;
    const video = wrap.querySelector('video');
    const src = this.currentItem && this.currentItem.promptVideo;
    const canvasHost = this.mountEl.querySelector('.qk-choose-canvas');
    if (!src) {
      wrap.classList.add('hidden');
      if (canvasHost) canvasHost.classList.remove('with-video');
      if (video) { try { video.pause(); video.removeAttribute('src'); video.load(); } catch { /* ignore */ } }
      return;
    }
    wrap.classList.remove('hidden');
    if (canvasHost) canvasHost.classList.add('with-video');
    try {
      if (video.getAttribute('src') !== src) video.src = src;
      video.currentTime = 0;
      const p = video.play();
      if (p && typeof p.catch === 'function') p.catch(() => { /* poster frame is fine */ });
    } catch { /* ignore */ }
    // the canvas shrank under the video — let Pixi re-measure and re-lay-out
    if (this.stage && this.stage.app && this.stage.app.resize) {
      try { this.stage.app.resize(); } catch { /* ignore */ }
    }
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-choose-canvas');
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
    this.stopSway();
    this.cancelTweens();
    this.clearDelays();
    if (this.removeResize) this.removeResize();
    this.removeResize = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
    this.promptView = null;
    this.answerViews = [];
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play' || !this.stage) return;
    this.clearIdleTimer();
    this.stopSway();
    this.cancelTweens();
    this.roundIndex = index;
    this.currentItem = this.roundItems[index];
    this.currentAnswers = this.pickAnswers(this.currentItem);
    this.targetMap.clear();
    this.targetSeq = 0;
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    this.promptView = null;
    this.answerViews = [];
    const generation = ++this.roundGeneration;

    this.updateDots();
    this.updatePromptVideo();
    const scene = new this.stage.PIXI.Container();
    this.scene = scene;
    this.stage.setScene(scene);
    await this.buildRoundViews(generation);
    if (!this.roundIsCurrent(generation)) return;
    this.layoutField();
    const { w } = this.stage.size();
    if (!this.reducedMotion()) {
      scene.x = Math.min(72, w * 0.08);
      scene.alpha = 0.65;
    }
    await Promise.all([
      this.popRoundIn(generation),
      this.runTween(to(scene, { x: 0, alpha: 1 }, { ms: 360, easing: ease.outCubic })),
    ]);
    if (!this.roundIsCurrent(generation)) return;
    this.awaitingInput = true;
    this.inputLocked = false;
    if (this.promptView) this.stopPromptSway = sway(this.promptView.motion, { amount: 0.018, ms: 2300 });
    this.speakLine(this.currentItem.say);
    this.scheduleIdlePrompt();
  }

  async buildRoundViews(generation) {
    const tasks = [];
    // a story vignette replaces static prompt art for the round
    if (this.currentItem.promptArt && !this.currentItem.promptVideo) tasks.push(this.buildPromptView(this.nextTargetId('prompt'), generation));
    this.currentAnswers.forEach((answer, index) => tasks.push(
      this.buildAnswerView(answer, index, this.nextTargetId('answer'), generation),
    ));
    await Promise.all(tasks);
  }

  async buildPromptView(id, generation) {
    const { PIXI } = this.stage;
    const art = await artObj(PIXI, this.currentItem.promptArt, 116, this.currentItem.promptAlt || '');
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
    const view = this.makeCardView(PROMPT_SIZE, 0xe7f7ff, art, this.currentItem.promptAlt || '', false);
    view.on('pointerdown', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.tapTarget(id);
    });
    const target = { id, role: 'neutral', type: 'prompt', view, motion: view.motion, size: PROMPT_SIZE, action: () => this.replayPrompt() };
    this.promptView = target;
    this.targetMap.set(id, target);
    this.scene.addChild(view);
  }

  async buildAnswerView(answer, index, id, generation) {
    const { PIXI } = this.stage;
    const art = await artObj(PIXI, answer.art, 126, answer.alt || '');
    if (!this.roundIsCurrent(generation)) { art.destroy({ children: true }); return; }
    const view = this.makeCardView(ANSWER_SIZE, CARD_COLORS[index % CARD_COLORS.length], art, answer.alt || '', true);
    view.on('pointerdown', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.tapTarget(id);
    });
    const target = {
      id, role: answer.correct ? 'correct' : 'wrong', type: 'answer', answer,
      view, motion: view.motion, size: ANSWER_SIZE, action: () => this.handleAnswer(id),
    };
    this.answerViews[index] = target;
    this.targetMap.set(id, target);
    this.scene.addChild(view);
  }

  makeCardView(size, fill, art, alt, answerCard) {
    const { PIXI } = this.stage;
    const view = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-size / 2, -size / 2 + 8, size, size, 25).fill({ color: 0x17517e, alpha: 0.17 });
    const backing = cardBacking(PIXI, size, size, { fill, stroke: 0xffffff, strokeWidth: answerCard ? 6 : 5, radius: 25 });
    motion.addChild(shadow, backing, art);
    view.addChild(motion);
    view.motion = motion;
    view.hitArea = new PIXI.Rectangle(-size / 2, -size / 2, size, size);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = alt;
    motion.scale.set(0.01);
    return view;
  }

  async popRoundIn(generation) {
    if (this.promptView) await this.runTween(popIn(this.promptView.motion, 330));
    await Promise.all(this.answerViews.filter(Boolean).map(async (target, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 65);
      if (!this.roundIsCurrent(generation)) return;
      await this.runTween(popIn(target.motion, 340));
    }));
  }

  layoutField() {
    if (!this.stage || !this.scene || !this.answerViews.length) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;
    const answers = this.answerViews.filter(Boolean);
    const count = answers.length;
    const portrait = h >= w;
    const pad = Math.max(8, Math.min(22, Math.min(w, h) * 0.025));
    const gap = Math.max(10, Math.min(24, Math.min(w, h) * 0.025));
    const hasPrompt = Boolean(this.promptView);

    if (!portrait && hasPrompt) {
      const promptArea = Math.min(w * 0.25, 220);
      const columns = Math.min(count, 4);
      const rows = Math.ceil(count / columns);
      const availableW = w - promptArea - pad * 3;
      const fitW = (availableW - gap * (columns - 1)) / columns;
      const fitH = (h - pad * 2 - gap * (rows - 1)) / rows;
      const size = Math.max(96, Math.min(205, fitW, fitH));
      this.promptView.view.position.set(pad + promptArea / 2, h / 2);
      this.promptView.view.scale.set(Math.min(1.1, promptArea / PROMPT_SIZE, (h - pad * 2) / PROMPT_SIZE));
      this.placeGrid(answers, promptArea + pad * 2, 0, availableW, h, columns, size, gap);
      return;
    }

    const promptH = hasPrompt ? Math.min(190, Math.max(106, h * 0.27)) : 0;
    if (hasPrompt) {
      this.promptView.view.position.set(w / 2, pad + promptH / 2);
      this.promptView.view.scale.set(Math.min(1, (promptH - gap) / PROMPT_SIZE, (w - pad * 2) / PROMPT_SIZE));
    }
    const top = hasPrompt ? promptH + pad : 0;
    const areaH = h - top;
    const columns = count <= 2 ? count : 2;
    const rows = Math.ceil(count / columns);
    const fitW = (w - pad * 2 - gap * (columns - 1)) / columns;
    const fitH = (areaH - pad * 2 - gap * (rows - 1)) / rows;
    const size = Math.max(96, Math.min(205, fitW, fitH));
    this.placeGrid(answers, 0, top, w, areaH, columns, size, gap);
  }

  placeGrid(targets, left, top, width, height, columns, size, gap) {
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
      target.view.scale.set(size / ANSWER_SIZE);
    });
  }

  pickAnswers(item) {
    const answers = item.answers.slice(0, 4);
    const correct = answers.find((answer) => answer.correct) || answers[0];
    const wrongs = answers.filter((answer) => answer !== correct);
    let count = answers.length;

    if (this.mode.difficultyRamp && answers.length > 2) {
      const span = answers.length - 2;
      const step = this.roundsTotal <= 1 ? span : Math.floor((this.roundIndex * span) / (this.roundsTotal - 1));
      count = Math.min(answers.length, 2 + step);
    }

    const picked = [correct, ...shuffle(wrongs.slice(), this.rng).slice(0, Math.max(0, count - 1))];
    return shuffle(picked, this.rng);
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed) return { accepted: false };
    if (target.type === 'answer' && this.awaitingInput && !this.inputLocked && target.motion) {
      target.motion.scale.set(1.06);
      target.motion.y = -5;
    }
    await target.action();
    return { accepted: true };
  }

  async handleAnswer(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || !this.awaitingInput || this.inputLocked) return;

    this.clearIdleTimer();
    if (target.role === 'correct') {
      await this.handleCorrect(target);
    } else {
      await this.handleWrong(target);
    }
  }

  async handleCorrect(target) {
    this.inputLocked = true;
    this.awaitingInput = false;
    this.stopSway();
    this.playSfx('pop');
    this.playSfx('sparkle');

    // Success is layered but short: bounce, sparkle, quiet the distractors,
    // then let the chosen card take one happy hop before the round changes.
    const others = this.answerViews.filter((entry) => entry && entry !== target);
    await Promise.all([
      this.bounceCard(target),
      sparkle(this.stage.PIXI, this.scene, target.view.x, target.view.y),
      ...others.map((entry) => this.runTween(to(entry.view, { alpha: 0.42 }, { ms: 220, easing: ease.outCubic }))),
    ]);

    const yums = this.config.voice.yums;
    if (yums.length) {
      const line = yums[this.yumIndex % yums.length];
      this.yumIndex += 1;
      await this.speakLine(line, true);
    }

    await this.celebrationHop(target);
    const { w, h } = this.stage.size();
    await Promise.all([
      burst(this.stage.PIXI, this.scene, w / 2, h / 2, { count: 34, power: 7, life: 720 }),
      this.delay(this.reducedMotion() ? 100 : 500),
    ]);
    if (this.destroyed || this.screen !== 'play') return;
    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) await this.finishGame();
    else await this.showRound(next);
  }

  async handleWrong(target) {
    this.inputLocked = true;
    this.playSfx('boing');
    await Promise.all([
      wiggle(target.motion),
      (async () => {
        await this.speakLine(this.config.voice.nudge, true);
        await this.speakLine(this.currentItem.say, true);
      })(),
    ]);
    if (this.destroyed || this.screen !== 'play' || !this.awaitingInput) return;
    target.motion.y = 0;
    target.motion.rotation = 0;
    target.motion.scale.set(1);
    this.inputLocked = false;
    this.scheduleIdlePrompt();
  }

  async bounceCard(target) {
    await this.animateMotion(target, { y: -8, scale: { x: 1.14, y: 1.14 } }, { ms: 150, easing: ease.outBack });
    await this.animateMotion(target, { y: 0, scale: { x: 0.98, y: 0.98 } }, { ms: 115, easing: ease.outQuad });
    await this.animateMotion(target, { scale: { x: 1, y: 1 } }, { ms: 130, easing: ease.outBack });
  }

  async celebrationHop(target) {
    await this.animateMotion(target, { y: -23, rotation: 0.045, scale: { x: 1.05, y: 1.05 } }, { ms: 170, easing: ease.outCubic });
    await this.animateMotion(target, { y: 0, rotation: 0, scale: { x: 1, y: 1 } }, { ms: 245, easing: ease.outElastic });
  }

  replayPromptFromHud() {
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_DEBOUNCE_MS) return;
    this.lastReplay = now;
    this.playSfx('tick');
    this.replayPrompt();
  }

  async replayPrompt() {
    if (!this.currentItem || this.screen !== 'play') return;
    this.clearIdleTimer();
    this.updatePromptVideo(); // replay restarts the story vignette too
    await this.speakLine(this.currentItem.say, true);
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.speakLine(this.currentItem.say, true);
    }, this.timers.ms(IDLE_MS));
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  async finishGame() {
    this.clearIdleTimer();
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    // Leave 'play' before the stage goes: everything that guards on
    // `screen === 'play'` used to see the flag flip here, and the router is now
    // the only place that fact lives.
    const end = this.screens.el('end');
    end.setAttribute('aria-label', this.config.voice.cheer);
    this.screens.release('end');
    this.screens.show('end', { silent: true });
    this.playSfx('tada');
    this.disposeStage();
    await this.renderEnd(end);
    this.speakLine(this.config.voice.cheer, true);
  }

  async renderEnd(end) {
    end.innerHTML = `
      <button class="qk-choose-back qk-choose-img-btn qk-eng-img-btn qk-eng-ico-back qk-eng-corner-tl" type="button" aria-label="Back to the game menu"></button>
      <div class="qk-choose-end-center qk-eng-center">
        <div class="qk-choose-end-emoji qk-eng-card qk-eng-card-glyph" aria-hidden="true">${escapeHtml(emojiFromRef(this.config.endArt || this.config.splashEmoji))}</div>
        <h1 class="qk-eng-title">${escapeHtml(this.config.voice.cheer)}</h1>
        <button class="qk-choose-again qk-eng-mode" type="button">
          <span class="qk-choose-play-icon qk-eng-play-icon" aria-hidden="true"></span>
          <span>${escapeHtml(this.config.copy.playAgain)}</span>
        </button>
      </div>
    `;
    wireEndScreen({
      screens: this.screens,
      back: end.querySelector('.qk-choose-back'),
      again: end.querySelector('.qk-choose-again'),
      // Back has always been a silent return to the splash here; the default
      // `preventDefault + sfx.tick` would add a sound this screen never made.
      feedback: null,
      onSplash: () => { speech.stop(); this.renderSplash(); },
      onAgain: () => {
        if (this.mode) this.startMode(this.mode.id);
        else this.renderSplash();
      },
    });
    // "again" keeps its own richer press feedback (unlock + tick).
    const again = end.querySelector('.qk-choose-again');
    const press = (e) => { e.preventDefault(); this.unlockAudio(); this.playSfx('tick'); };
    again.addEventListener('pointerdown', press);
    this.screens.hold(() => again.removeEventListener('pointerdown', press));
    this.createBurst(end.querySelector('.qk-choose-end-emoji'), 30, end);
  }

  updateDots() {
    this.screens.el('play').querySelectorAll('.qk-choose-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createBurst(anchor, count, host) {
    if (!anchor || this.reducedMotion() || !host) return;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'qk-choose-burst';
    burst.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      const angle = (Math.PI * 2 * i) / count;
      const distance = 70 + this.fxRng() * 90;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      piece.style.setProperty('--hue', String(20 + Math.floor(this.fxRng() * 290)));
      piece.style.setProperty('--delay', `${this.fxRng() * 90}ms`);
      burst.appendChild(piece);
    }

    host.appendChild(burst);
    this.delay(900).then(() => burst.remove());
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
    const targets = Array.from(this.targetMap.values())
      .filter((target) => target.view)
      .sort((a, b) => targetSequence(a.id) - targetSequence(b.id));
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
    const target = Array.from(this.targetMap.values()).find((entry) => entry.role === 'correct');
    if (target) await this.tapTarget(target.id);
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
    await speech.speak(line, { rate: 0.8, pitch: 1.05, cancel });
  }

  playSfx(name) {
    if (this.muted || !sfx[name]) return;
    sfx[name]();
  }

  reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  nextTargetId(prefix) {
    this.targetSeq += 1;
    return `${prefix}-${this.roundIndex + 1}-${this.targetSeq}`;
  }

  roundIsCurrent(generation) {
    return !this.destroyed && this.screen === 'play' && this.stage && generation === this.roundGeneration;
  }

  async animateMotion(target, props, options) {
    if (!target || !target.motion) return;
    if (target.motionTween) target.motionTween.cancel();
    // The lift makes pointer-down feel physical before the success animation.
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

  stopSway() {
    if (this.stopPromptSway) this.stopPromptSway();
    this.stopPromptSway = null;
  }

  delay(ms) {
    return new Promise((resolve) => {
      const entry = { timer: 0, resolve };
      entry.timer = window.setTimeout(() => { this.pendingDelays.delete(entry); resolve(); }, this.timers.ms(ms));
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
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
    ...(config.copy || {}),
  };
  const voice = {
    intro: '',
    nudge: 'Try another one.',
    cheer: 'You did it!',
    yums: ['Nice!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice!')];

  return {
    ...config,
    id: config.id || 'choose-one',
    title: config.title || 'Choose One',
    splashEmoji: config.splashEmoji || config.splashArt || '⭐',
    copy,
    voice,
    modes: (config.modes || []).map((mode) => {
      const items = (mode.items || []).filter((item) => item && item.say && Array.isArray(item.answers) && item.answers.length >= 2);
      return {
        ...mode,
        rounds: Math.min(mode.rounds || items.length, items.length),
        items,
      };
    }),
  };
}

function targetSequence(id) {
  return Number(String(id).split('-').pop()) || 0;
}

function installStyle() {
  if (styleInstalled) return;
  styleInstalled = true;
  installEngineStyles('qk-choose-style', `
    /* choose-one's own skin. Everything the other engines also had —
       @font-face, the reset, the surface, the 96px PNG buttons, the splash/end
       column, the mode buttons, the HUD grid, the canvas — now comes from
       shared/css/engine-base.css; what is left below is either this engine's
       palette or a control only this engine has (the story-vignette video).

       The class names are unchanged and stay supported: see the compatibility
       window note in shared/js/engines/README.md. */

    .qk-choose {
      --sky: #bee3f5;
      --sky-deep: #a4d3ec;
      --navy: #17517e;
      --blue: #2d7dd2;
      --purple: #7c4fc4;
      --cream: #fff8e8;
      --white: #ffffff;
      --mint: #81d6a3;
      --peach: #ffad7a;
      --shadow: 0 6px 0 rgba(23, 81, 126, .18), 0 14px 30px rgba(23, 81, 126, .18);

      /* Alias the legacy vars onto engine-base's tokens rather than letting its
         defaults stand — a game skin that redefines --navy or --shadow under
         #game must keep reaching every shared rule. */
      --qk-navy: var(--navy);
      --qk-sky: var(--sky);
      --qk-white: var(--white);
      --qk-primary: var(--purple);
      --qk-shadow: var(--shadow);

      --qk-eng-bg-image:
        radial-gradient(circle at 18% 18%, rgba(255,255,255,.45) 0 7px, transparent 8px),
        radial-gradient(circle at 72% 22%, rgba(255,255,255,.38) 0 10px, transparent 11px),
        radial-gradient(circle at 42% 82%, rgba(255,255,255,.30) 0 8px, transparent 9px);
      --qk-eng-bg-size: 170px 170px, 240px 240px, 210px 210px;
      --qk-eng-title-w: 12ch;
      --qk-eng-hud-z: 3;
      --qk-eng-stage-w: min(1100px, 100%);
    }

    .qk-choose-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-choose-mode:nth-child(3n) { background-color: #2e9f76; }

    .qk-choose-dot { opacity: .8; }
    .qk-choose-dot.is-filled { background: var(--mint); opacity: 1; }
    .qk-choose-dot.is-current { background: var(--peach); opacity: 1; transform: scale(1.16); }

    /* Story Screen: a muted vignette sits above the Pixi field as the prompt. */
    .qk-choose-video {
      position: absolute;
      top: 4px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2;
    }
    .qk-choose-video.hidden { display: none; }
    .qk-choose-video video {
      display: block;
      height: 32vh;
      max-width: min(88vw, 680px);
      border-radius: 20px;
      border: 5px solid #ffffff;
      box-shadow: 0 10px 26px rgba(23, 81, 126, 0.22);
      background: #10283f;
    }
    .qk-choose-canvas.with-video { top: calc(32vh + 24px); }

    .qk-choose-again {
      display: inline-grid;
      grid-template-columns: 72px auto;
      align-items: center;
      gap: 14px;
      min-width: min(420px, 100%);
      background-color: var(--blue);
    }

    .qk-choose-burst {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 5;
      pointer-events: none;
    }

    .qk-choose-burst span {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 5px;
      background: hsl(var(--hue), 82%, 62%);
      animation: qk-choose-burst .78s ease-out both;
      animation-delay: var(--delay);
    }

    @media (max-width: 560px) {
      .qk-choose-hud { grid-template-columns: 96px 1fr; }
      .qk-choose-progress { justify-self: end; }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-choose-burst span { animation: none !important; }
      .qk-choose * { transition: none !important; }
    }

    @keyframes qk-choose-burst {
      0% { opacity: 1; transform: translate(-7px, -7px) scale(.8) rotate(0); }
      100% { opacity: 0; transform: translate(calc(var(--x) - 7px), calc(var(--y) - 7px)) scale(.25) rotate(160deg); }
    }
  `);
}
