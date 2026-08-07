// match-pairs.js — Stage v2 archetype engine for "find the two that belong together".
//
// The menu, HUD, and end screen stay in the DOM for crisp text and familiar
// browser accessibility. Gameplay cards live in Pixi so every match can feel
// springy, responsive, and consistent without asking game configs to change.

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
import { to, ease, popIn, wiggle } from '../stage/tween.js';
import { burst, sparkle } from '../stage/particles.js';
import { artObj, artUrlRef, card as cardBacking } from '../stage/art-pixi.js';


const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const CARD_SIZE = 180;
const CARD_HALF = CARD_SIZE / 2;
const CARD_COLORS = [0xfff8e8, 0xe9fff1, 0xfff0e6, 0xeef1ff];

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('match-pairs requires a mount element');
  installStyle();
  return new MatchPairsGame(config, mountEl);
}

class MatchPairsGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    // The engine keeps its own delay registry (clearDelays() RESOLVES pending
    // waits so an awaiting flow finishes instead of stalling — timers.js
    // clearAll() deliberately does the opposite). The group is here purely as
    // the scale holder `fastTimers()` turns, read back through `timers.ms()`.
    this.timers = createTimers();

    this.destroyed = false;
    // The router owns "which screen is live"; `screen` below is a getter over it.
    this.screens = null;
    this.mode = null;
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.roundCards = [];
    this.selectedCardId = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.muted = false;
    this.matchCount = 0;
    this.yumIndex = 0;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.pairDeck = [];
    this.rng = Math.random;
    this.fxRng = Math.random;

    this.stage = null;
    this.scene = null;
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
        if (this.backDownEl) this.playSfx('tick');
      },
    });
    this.buildShell();
    this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebugHook();
  }

  /** @returns {'splash'|'play'|'end'} straight from the router */
  get screen() {
    return this.screens ? this.screens.current : 'splash';
  }

  /**
   * Three persistent sections, toggled by `hidden`, instead of one mount whose
   * innerHTML is thrown away on every transition. Each section keeps the exact
   * class list it rendered with before, plus the shared `qk-eng-*` vocabulary
   * from shared/css/engine-base.css.
   */
  buildShell() {
    this.mountEl.innerHTML = `
      <section class="qk-match qk-match-splash qk-eng-root qk-eng-surface qk-eng-page" aria-label="${escapeAttr(this.config.title)}"></section>
      <section class="qk-match qk-match-play qk-eng-root qk-eng-surface qk-eng-play" hidden></section>
      <section class="qk-match qk-match-end qk-eng-root qk-eng-surface qk-eng-page" hidden></section>
    `;
    this.screens = createScreens({
      root: this.mountEl,
      screens: {
        splash: this.mountEl.querySelector('.qk-match-splash'),
        play: this.mountEl.querySelector('.qk-match-play'),
        end: this.mountEl.querySelector('.qk-match-end'),
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
    // the mount outlives this instance — leaving the delegated tap on it would let
    // a destroyed game answer the next one's back button
    if (this.removeBackTap) { this.removeBackTap(); this.removeBackTap = null; }
    if (this.screens) { this.screens.destroy(); this.screens = null; }
    this.mountEl.innerHTML = '';
    if (this.disposeDebug) { this.disposeDebug(); this.disposeDebug = null; }
  }

  unlockAudio() {
    sfx.unlock();
    speech.unlock();
  }

  installDebugHook() {
    this.disposeDebug = installDebug({
      gameId: this.config.id,
      engine: 'match-pairs',
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
    this.roundCards = [];
    this.selectedCardId = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    speech.stop();

    const splash = this.screens.el('splash');
    // show() is IDEMPOTENT: re-entering the splash we are already on would run
    // neither the disposer bag nor voice.stop(), so release it by hand before
    // the markup underneath changes.
    this.screens.release('splash');
    this.screens.show('splash');
    splash.innerHTML = `
      <a class="qk-match-home qk-match-img-btn qk-match-home-splash qk-eng-img-btn qk-eng-ico-home qk-eng-corner-tl" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
      <div class="qk-match-splash-center qk-eng-center">
        <div class="qk-match-splash-art qk-eng-card qk-eng-card-glyph" aria-hidden="true">${escapeHtml(emojiFromRef(this.config.splashEmoji))}</div>
        <h1 class="qk-eng-title">${escapeHtml(this.config.title)}</h1>
        <div class="qk-match-mode-list qk-eng-mode-list"></div>
      </div>
    `;

    this.applyThemeBackdrop(splash);

    const picker = renderModeCards({
      host: splash.querySelector('.qk-match-mode-list'),
      modes: this.config.modes,
      // The engine paints its own cards (engine-base.css `.qk-eng-mode`), so the
      // screens.css card skin stays off — `skin: false` is what keeps every pixel.
      skin: false,
      cardClass: 'qk-match-mode qk-eng-mode',
      feedback: (event) => {
        event.preventDefault();
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
    const homeLink = splash.querySelector('a.qk-match-home');
    if (homeLink) this.screens.hold(() => homeLink.remove());
    this.screens.hold(picker.dispose);
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

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;

    const mode = this.config.modes.find((entry) => entry.id === modeId) || this.config.modes[0];
    if (!mode) return;

    // The double-tap latch: a second card press while the first start is still
    // in flight is swallowed rather than running teardown + render twice.
    return this.screens.start(() => this.runMode(mode));
  }

  async runMode(mode) {
    this.clearIdleTimer();
    this.disposeStage();
    // LIVE BUG FIX (pre-existing, not a Wave 4b regression — reproduced against
    // the pre-migration build at the same call site): disposeStage() destroys
    // every card's Pixi view but leaves `roundCards` pointing at them, and the
    // very next createPlayStage() fires an immediate onResize -> layoutCards(),
    // which reads `card.view.position` on a destroyed view and throws. Entering
    // a mode from the splash or from "again" happened to clear the list first;
    // restarting a mode IN PLACE — which is exactly what QLOBE_DEBUG.startMode()
    // does twice in a row — did not.
    this.roundCards = [];
    speech.stop();
    this.mode = mode;
    this.roundIndex = 0;
    this.roundsTotal = mode.rounds;
    this.matchCount = 0;
    this.yumIndex = 0;
    this.pairDeck = shuffle(mode.pairs.slice(), this.rng);

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
      <span class="qk-match-dot qk-eng-dot" data-dot="${index}" aria-hidden="true"></span>
    `).join('');

    const play = this.screens.el('play');
    // Restarting a mode re-renders in place, and show() is idempotent — release
    // the live tap handlers before the DOM under them goes.
    this.screens.release('play');
    play.setAttribute('aria-label', this.mode.title);
    play.innerHTML = `
      <header class="qk-match-hud qk-eng-hud">
        <button class="qk-match-back qk-match-img-btn qk-eng-img-btn qk-eng-ico-back qk-eng-corner-tl" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-match-progress qk-eng-pill" aria-hidden="true">${dots}</div>
      </header>
      <main class="qk-match-field">
        <div class="qk-match-prompt" aria-live="polite">${escapeHtml(this.mode.prompt)}</div>
        <div class="qk-match-canvas qk-eng-canvas" aria-label="${escapeAttr(this.mode.prompt)}"></div>
      </main>
      <button class="qk-match-sound qk-match-img-btn qk-eng-img-btn qk-eng-ico-sound qk-eng-corner-bl" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
    `;
    this.screens.show('play');
    this.applyThemeBackdrop(play);

    // the back button is owned by the delegated mount handler in the constructor

    const sound = play.querySelector('.qk-match-sound');
    this.screens.hold(onTap(sound, () => this.replayPromptFromHud(), {
      feedback: (event) => event.stopPropagation(),
    }));
  }

  async createPlayStage() {
    const host = this.screens.el('play').querySelector('.qk-match-canvas');
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
    this.removeResize = stage.onResize(() => this.layoutCards());
    return true;
  }

  disposeStage() {
    this.stageGeneration += 1;
    this.roundGeneration += 1;
    this.stopAllBreathing();
    this.cancelTweens();
    this.clearDelays();
    if (this.removeResize) this.removeResize();
    this.removeResize = null;
    if (this.stage) this.stage.destroy();
    this.stage = null;
    this.scene = null;
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play' || !this.stage) return;
    this.clearIdleTimer();
    this.stopAllBreathing();
    this.cancelTweens();
    this.roundIndex = index;
    this.selectedCardId = null;
    this.roundCards = [];
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;
    const generation = ++this.roundGeneration;

    const pairs = this.drawPairs(this.pairCountForRound(index));
    this.roundCards = this.makeCards(pairs);
    this.updateDots();

    const scene = new this.stage.PIXI.Container();
    this.scene = scene;
    this.stage.setScene(scene);
    await this.buildCardViews(generation);
    if (!this.roundIsCurrent(generation)) return;

    this.layoutCards();
    await this.popCardsIn(generation);
    if (!this.roundIsCurrent(generation)) return;

    this.awaitingInput = true;
    this.inputLocked = false;
    this.roundCards.forEach((card, cardIndex) => this.startBreathing(card, cardIndex, generation));
    this.speakLine(this.mode.prompt || this.config.voice.intro);
    this.scheduleIdlePrompt();
  }

  drawPairs(count) {
    const picked = [];
    while (picked.length < count && this.mode.pairs.length) {
      if (this.pairDeck.length === 0) this.pairDeck = shuffle(this.mode.pairs.slice(), this.rng);
      picked.push(this.pairDeck.shift());
    }
    return picked;
  }

  pairCountForRound(index) {
    const max = clamp(this.mode.pairsPerRound, 2, 4);
    if (!this.mode.difficultyRamp) return Math.min(max, this.mode.pairs.length);
    const span = max - 2;
    const step = this.roundsTotal <= 1 ? span : Math.floor((index * span) / (this.roundsTotal - 1));
    return Math.min(2 + step, this.mode.pairs.length);
  }

  makeCards(pairs) {
    const cards = [];
    pairs.forEach((pair, pairIndex) => {
      const pairKey = `pair:${this.roundIndex}:${pairIndex}`;
      cards.push(this.cardFromPair(pair, pairKey, 'a'));
      cards.push(this.cardFromPair(pair, pairKey, 'b'));
    });
    const dealt = shuffle(cards, this.rng);
    dealt.forEach((card, index) => {
      card.id = `card:${index}`;
      card.cardIndex = index;
    });
    return dealt;
  }

  cardFromPair(pair, pairKey, side) {
    const item = side === 'a' ? pair.a : pair.b;
    return {
      id: '', pairKey, pair,
      art: item.art,
      alt: item.alt || item.say || '',
      say: item.say || item.alt || '',
      matched: false,
      view: null,
      breath: null,
      motion: null,
      glow: null,
      check: null,
      stopBreath: null,
      motionTween: null,
    };
  }

  async buildCardViews(generation) {
    const tasks = this.roundCards.map((card) => this.buildCardView(card, generation));
    await Promise.all(tasks);
  }

  async buildCardView(card, generation) {
    const { PIXI } = this.stage;
    const art = await artObj(PIXI, card.art, 126, card.alt);
    if (!this.roundIsCurrent(generation)) {
      art.destroy({ children: true });
      return;
    }

    const view = new PIXI.Container();
    const breath = new PIXI.Container();
    const motion = new PIXI.Container();
    const shadow = new PIXI.Graphics();
    shadow.roundRect(-CARD_HALF, -CARD_HALF + 8, CARD_SIZE, CARD_SIZE, 25)
      .fill({ color: 0x17517e, alpha: 0.17 });

    const glow = new PIXI.Graphics();
    glow.roundRect(-CARD_HALF - 7, -CARD_HALF - 7, CARD_SIZE + 14, CARD_SIZE + 14, 30)
      .stroke({ width: 10, color: 0xf4c53d, alpha: 0.75 });
    glow.alpha = 0;

    const backing = cardBacking(PIXI, CARD_SIZE, CARD_SIZE, {
      fill: CARD_COLORS[card.cardIndex % CARD_COLORS.length],
      stroke: 0xffffff,
      strokeWidth: 6,
      radius: 25,
    });

    const check = new PIXI.Container();
    const checkDisc = new PIXI.Graphics();
    checkDisc.circle(0, 0, 23).fill(0x81d6a3).stroke({ width: 4, color: 0xffffff });
    const checkMark = new PIXI.Text({
      text: '✓',
      style: { fontFamily: 'Fredoka, sans-serif', fontSize: 30, fill: 0xffffff, fontWeight: '600' },
    });
    checkMark.anchor.set(0.5);
    check.addChild(checkDisc, checkMark);
    check.position.set(62, 61);
    check.visible = false;

    motion.addChild(shadow, glow, backing, art, check);
    breath.addChild(motion);
    view.addChild(breath);
    view.hitArea = new PIXI.Rectangle(-CARD_HALF, -CARD_HALF, CARD_SIZE, CARD_SIZE);
    view.eventMode = 'static';
    view.cursor = 'pointer';
    view.label = card.alt;
    view.accessible = true;
    view.accessibleType = 'button';
    view.accessibleTitle = card.alt;
    view.on('pointerdown', (event) => {
      if (event && event.preventDefault) event.preventDefault();
      this.unlockAudio();
      this.tapTarget(card.id);
    });

    card.view = view;
    card.breath = breath;
    card.motion = motion;
    card.glow = glow;
    card.check = check;
    motion.scale.set(0.01);
    this.scene.addChild(view);
  }

  async popCardsIn(generation) {
    await Promise.all(this.roundCards.map(async (card, index) => {
      await this.delay(this.reducedMotion() ? 0 : index * 55);
      if (!this.roundIsCurrent(generation) || !card.motion) return;
      await this.runTween(popIn(card.motion, 340));
    }));
  }

  layoutCards() {
    if (!this.stage || !this.scene || !this.roundCards.length) return;
    const { w, h } = this.stage.size();
    if (!w || !h) return;

    const count = this.roundCards.length;
    const portrait = window.innerHeight >= window.innerWidth;
    const columns = portrait ? 2 : (count === 6 ? 3 : Math.min(4, count));
    const rows = Math.ceil(count / columns);
    const gap = Math.max(12, Math.min(22, Math.min(w, h) * 0.025));
    const pad = Math.max(12, Math.min(24, Math.min(w, h) * 0.035));
    const fitW = (w - pad * 2 - gap * (columns - 1)) / columns;
    const fitH = (h - pad * 2 - gap * (rows - 1)) / rows;
    const size = Math.max(96, Math.min(190, fitW, fitH));
    const totalH = rows * size + (rows - 1) * gap;
    const firstY = (h - totalH) / 2 + size / 2;

    this.roundCards.forEach((card, index) => {
      if (!card.view) return;
      const row = Math.floor(index / columns);
      const col = index % columns;
      const rowCount = Math.min(columns, count - row * columns);
      const totalW = rowCount * size + (rowCount - 1) * gap;
      const firstX = (w - totalW) / 2 + size / 2;
      card.view.position.set(firstX + col * (size + gap), firstY + row * (size + gap));
      card.view.scale.set(size / CARD_SIZE);
    });
  }

  async tapTarget(targetId) {
    const card = this.cardById(targetId);
    if (!card || this.destroyed || this.screen !== 'play' || !this.awaitingInput || this.inputLocked) {
      return { accepted: false };
    }
    await this.handleCard(card);
    return { accepted: true };
  }

  async handleCard(card) {
    if (card.matched) return;
    this.clearIdleTimer();

    if (!this.selectedCardId) {
      this.selectCard(card);
      await this.speakLine(card.say, true);
      this.scheduleIdlePrompt();
      return;
    }

    if (this.selectedCardId === card.id) {
      this.playSfx('unpop');
      await this.speakLine(card.say, true);
      await this.clearSelection(true);
      this.scheduleIdlePrompt();
      return;
    }

    const first = this.cardById(this.selectedCardId);
    if (!first || first.matched) {
      this.selectCard(card);
      await this.speakLine(card.say, true);
      this.scheduleIdlePrompt();
      return;
    }

    await this.evaluatePair(first, card);
  }

  selectCard(card) {
    this.clearSelection(false);
    this.selectedCardId = card.id;
    card.glow.alpha = 1;
    this.playSfx('pop');
    this.animateMotion(card, {
      y: -9,
      rotation: card.cardIndex % 2 ? 0.028 : -0.028,
      scale: { x: 1.08, y: 1.08 },
    }, { ms: 190, easing: ease.outBack });
  }

  async clearSelection(animate = true) {
    const selected = this.selectedCardId ? this.cardById(this.selectedCardId) : null;
    this.selectedCardId = null;
    if (!selected || !selected.motion) return;
    selected.glow.alpha = 0;
    if (animate) {
      await this.animateMotion(selected, {
        y: 0, rotation: 0, scale: { x: 1, y: 1 },
      }, { ms: 170, easing: ease.outCubic });
    } else {
      if (selected.motionTween) selected.motionTween.cancel();
      selected.motion.y = 0;
      selected.motion.rotation = 0;
      selected.motion.scale.set(1);
    }
  }

  async evaluatePair(first, second) {
    this.inputLocked = true;
    if (first.pairKey === second.pairKey) await this.handleMatch(first, second);
    else await this.handleMiss(first, second);
    if (!this.destroyed && this.screen === 'play' && this.awaitingInput) this.scheduleIdlePrompt();
  }

  async handleMatch(first, second) {
    await this.clearSelection(false);
    this.stopBreathing(first);
    this.stopBreathing(second);
    this.playSfx('pop');
    this.playSfx('sparkle');
    this.matchCount += 1;

    const visual = Promise.all([
      this.bounceCard(first),
      this.bounceCard(second),
      sparkle(this.stage.PIXI, this.scene, first.view.x, first.view.y),
      sparkle(this.stage.PIXI, this.scene, second.view.x, second.view.y),
    ]).then(() => Promise.all([
      this.celebrationHop(first, -1),
      this.celebrationHop(second, 1),
    ]));
    await Promise.all([visual, this.speakLine(first.pair.say, true)]);

    if (this.matchCount % 2 === 0 && this.config.voice.yums.length) {
      const line = this.config.voice.yums[this.yumIndex % this.config.voice.yums.length];
      this.yumIndex += 1;
      await this.speakLine(line, true);
    }

    first.matched = true;
    second.matched = true;
    await Promise.all([this.setMatched(first), this.setMatched(second)]);

    if (this.roundCards.every((card) => card.matched)) await this.completeRound();
    else this.inputLocked = false;
  }

  async bounceCard(card) {
    await this.animateMotion(card, { y: -7, scale: { x: 1.15, y: 1.15 } }, { ms: 150, easing: ease.outBack });
    await this.animateMotion(card, { y: 0, scale: { x: 0.98, y: 0.98 } }, { ms: 120, easing: ease.outQuad });
    await this.animateMotion(card, { scale: { x: 1, y: 1 } }, { ms: 130, easing: ease.outBack });
  }

  async celebrationHop(card, direction) {
    await this.animateMotion(card, {
      y: -24, rotation: direction * 0.045, scale: { x: 1.04, y: 1.04 },
    }, { ms: 170, easing: ease.outCubic });
    await this.animateMotion(card, {
      y: 0, rotation: 0, scale: { x: 1, y: 1 },
    }, { ms: 250, easing: ease.outElastic });
  }

  async setMatched(card) {
    card.view.eventMode = 'none';
    card.check.visible = true;
    await Promise.all([
      this.runTween(to(card.view, { alpha: 0.58 }, { ms: 190, easing: ease.outCubic })),
      this.animateMotion(card, { scale: { x: 0.94, y: 0.94 } }, { ms: 190, easing: ease.outCubic }),
    ]);
  }

  async handleMiss(first, second) {
    this.playSfx('boing');
    await Promise.all([
      wiggle(first.motion),
      wiggle(second.motion),
      this.speakLine(this.config.voice.nudge, true),
    ]);
    await this.clearSelection(true);
    this.inputLocked = false;
  }

  async completeRound() {
    this.awaitingInput = false;
    this.inputLocked = true;
    await this.clearSelection(false);
    this.stopAllBreathing();
    const { w, h } = this.stage.size();
    await Promise.all([
      burst(this.stage.PIXI, this.scene, w / 2, h / 2, { count: 38, power: 7, life: 760 }),
      this.delay(this.reducedMotion() ? 120 : 650),
    ]);

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
    if (this.screen !== 'play') return;
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
      this.speakLine(this.mode.prompt || this.config.voice.intro, true);
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
    this.selectedCardId = null;
    // Leave 'play' before the stage goes: everything that guards on
    // `screen === 'play'` used to see the flag flip right here.
    const end = this.screens.el('end');
    end.setAttribute('aria-label', this.config.voice.cheer);
    this.screens.release('end');
    // `silent`: the cheer line is spoken below and the router's voice.stop()
    // would cut off whatever is still playing, which never happened before.
    this.screens.show('end', { silent: true });
    this.playSfx('tada');
    this.disposeStage();
    this.roundCards = [];
    this.renderEnd(end);
    this.createDomBurst(end.querySelector('.qk-match-end-art'), 34, end);
    await this.speakLine(this.config.voice.cheer, true);
  }

  renderEnd(end) {
    end.innerHTML = `
      <button class="qk-match-back qk-match-img-btn qk-eng-img-btn qk-eng-ico-back qk-eng-corner-tl" type="button" aria-label="Back to the game menu"></button>
      <div class="qk-match-end-center qk-eng-center">
        <div class="qk-match-end-art qk-eng-card qk-eng-card-glyph" aria-hidden="true">${escapeHtml(emojiFromRef(this.config.endArt || this.config.splashEmoji))}</div>
        <h1 class="qk-eng-title">${escapeHtml(this.config.voice.cheer)}</h1>
        <button class="qk-match-again qk-eng-mode" type="button">
          <span class="qk-match-play-icon qk-eng-play-icon" aria-hidden="true"></span>
          <span>${escapeHtml(this.config.copy.playAgain)}</span>
        </button>
      </div>
    `;

    this.applyThemeBackdrop(end);
    // the back button is owned by the delegated mount handler in the constructor,
    // so wireEndScreen only takes "again" — its `back`/`choose` slots would
    // double-wire a control that already has a listener.
    wireEndScreen({
      screens: this.screens,
      again: end.querySelector('.qk-match-again'),
      feedback: (event) => {
        event.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      },
      onAgain: () => {
        if (this.mode) this.startMode(this.mode.id);
        else this.renderSplash();
      },
    });
  }

  updateDots() {
    this.screens.el('play').querySelectorAll('.qk-match-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createDomBurst(anchor, count, host) {
    if (!anchor || this.reducedMotion() || !host) return;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burstEl = document.createElement('div');
    burstEl.className = 'qk-match-burst';
    burstEl.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burstEl.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;

    for (let index = 0; index < count; index++) {
      const piece = document.createElement('span');
      const angle = (Math.PI * 2 * index) / count;
      const distance = 58 + this.fxRng() * 82;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      piece.style.setProperty('--hue', String(18 + Math.floor(this.fxRng() * 300)));
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
    const canvasRect = this.stage.app.canvas.getBoundingClientRect();
    const stageSize = this.stage.size();
    const scaleX = stageSize.w ? canvasRect.width / stageSize.w : 1;
    const scaleY = stageSize.h ? canvasRect.height / stageSize.h : 1;
    const { PIXI } = this.stage;

    return this.roundCards.filter((card) => !card.matched && card.view).map((card) => {
      const corners = [
        card.view.toGlobal(new PIXI.Point(-CARD_HALF, -CARD_HALF)),
        card.view.toGlobal(new PIXI.Point(CARD_HALF, -CARD_HALF)),
        card.view.toGlobal(new PIXI.Point(CARD_HALF, CARD_HALF)),
        card.view.toGlobal(new PIXI.Point(-CARD_HALF, CARD_HALF)),
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
        id: card.id,
        role: this.debugRole(card),
        rect: {
          x: canvasRect.left + minX * scaleX,
          y: canvasRect.top + minY * scaleY,
          w: (maxX - minX) * scaleX,
          h: (maxY - minY) * scaleY,
        },
      };
    });
  }

  debugRole(card) {
    if (!this.selectedCardId || card.id === this.selectedCardId) return 'neutral';
    const selected = this.cardById(this.selectedCardId);
    if (!selected) return 'neutral';
    return card.pairKey === selected.pairKey ? 'correct' : 'wrong';
  }

  async winRound() {
    if (this.screen !== 'play' || this.destroyed) return;
    const round = this.roundIndex;
    await this.clearSelection(false);
    while (this.screen === 'play' && this.roundIndex === round) {
      const first = this.roundCards.find((card) => !card.matched);
      if (!first) break;
      const second = this.roundCards.find((card) => !card.matched && card !== first && card.pairKey === first.pairKey);
      if (!second) break;
      await this.tapTarget(first.id);
      await this.tapTarget(second.id);
    }
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    const value = Number(n) || 0;
    this.rng = mulberry32(value);
    this.fxRng = mulberry32(value ^ 0x9E3779B9);
  }

  cardById(id) {
    return this.roundCards.find((card) => card.id === id);
  }

  roundIsCurrent(generation) {
    return !this.destroyed && this.screen === 'play' && this.stage && generation === this.roundGeneration;
  }

  async animateMotion(card, props, options) {
    if (!card || !card.motion) return;
    if (card.motionTween) card.motionTween.cancel();
    const tween = to(card.motion, props, options);
    card.motionTween = tween;
    await this.runTween(tween);
    if (card.motionTween === tween) card.motionTween = null;
  }

  async runTween(tween) {
    this.activeTweens.add(tween);
    try {
      await tween;
    } finally {
      this.activeTweens.delete(tween);
    }
  }

  cancelTweens() {
    this.activeTweens.forEach((tween) => tween.cancel && tween.cancel());
    this.activeTweens.clear();
  }

  startBreathing(card, index, generation) {
    if (this.reducedMotion() || !card.breath || card.matched) return;
    const control = { stopped: false, current: null };
    card.stopBreath = () => {
      control.stopped = true;
      if (control.current && control.current.cancel) control.current.cancel();
      if (card.breath) card.breath.scale.set(1);
    };
    (async () => {
      await this.delay(250 + index * 90);
      while (!control.stopped && this.roundIsCurrent(generation) && !card.matched) {
        control.current = to(card.breath, { scale: { x: 1.012, y: 1.012 } }, { ms: 1750, easing: ease.inOutSine });
        await control.current;
        if (control.stopped) break;
        control.current = to(card.breath, { scale: { x: 1, y: 1 } }, { ms: 1750, easing: ease.inOutSine });
        await control.current;
      }
    })();
  }

  stopBreathing(card) {
    if (card && card.stopBreath) card.stopBreath();
    if (card) card.stopBreath = null;
  }

  stopAllBreathing() {
    this.roundCards.forEach((card) => this.stopBreathing(card));
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
}

function normalizeConfig(config = {}) {
  const voice = {
    intro: 'Find the two that go together.',
    nudge: 'Hmm, try another one.',
    cheer: 'Hooray! You matched them all!',
    yums: ['Yum!', 'Nice match!', 'You found it!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice match!')];

  const copy = {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
    ...(config.copy || {}),
  };

  const rawModes = Array.isArray(config.modes) && config.modes.length ? config.modes : [config];
  const modes = rawModes.map((mode, index) => {
    const pairs = (mode.pairs || []).map(normalizePair).filter(Boolean);
    const pairsPerRound = clamp(mode.pairsPerRound || 3, 2, 4);
    return {
      ...mode,
      id: mode.id || `mode-${index + 1}`,
      title: mode.title || config.title || 'Match!',
      prompt: mode.prompt || voice.intro,
      pairsPerRound,
      rounds: Math.max(0, Math.floor(mode.rounds || 1)),
      pairs,
    };
  }).filter((mode) => mode.pairs.length >= 2);

  return {
    ...config,
    id: config.id || 'match-pairs',
    title: config.title || 'Match Pairs',
    splashEmoji: config.splashEmoji || config.splashArt || '🔎',
    copy,
    voice,
    modes,
  };
}

function normalizePair(pair) {
  if (!pair || !pair.a || !pair.b || !pair.a.art || !pair.b.art) return null;
  const a = {
    art: pair.a.art,
    alt: pair.a.alt || pair.a.say || '',
    say: pair.a.say || pair.a.alt || '',
  };
  const b = {
    art: pair.b.art,
    alt: pair.b.alt || pair.b.say || '',
    say: pair.b.say || pair.b.alt || '',
  };
  return {
    ...pair,
    say: pair.say || `${a.say} and ${b.say} go together.`,
    a,
    b,
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

/** The back button an event landed on, if any — null for anything else, including
 *  a target that is not an Element and so has no .closest. */
function backButtonFor(target) {
  if (!target || typeof target.closest !== 'function') return null;
  return target.closest('.qk-match-back');
}

function installStyle() {
  if (styleInstalled) return;
  styleInstalled = true;
  installEngineStyles('qk-match-style', `
    /* match-pairs' own skin. The @font-face, the reset, the surface, the 96px
       PNG buttons, the splash/end column, the mode buttons, the HUD grid and the
       canvas now come from shared/css/engine-base.css; what is left is this
       engine's palette and the two-row matching field.

       The .qk-match-* class names are unchanged and stay supported — see the
       compatibility window note in shared/js/engines/README.md. */

    .qk-match {
      --sky: #bee3f5;
      --navy: #17517e;
      --blue: #2d7dd2;
      --purple: #7c4fc4;
      --white: #ffffff;
      --mint: #81d6a3;
      --peach: #ffad7a;
      --shadow: 0 6px 0 rgba(23,81,126,.18), 0 14px 30px rgba(23,81,126,.18);

      /* Alias the legacy vars onto engine-base's tokens rather than letting its
         defaults stand — a game skin that redefines --navy or --shadow under
         #game must keep reaching every shared rule. */
      --qk-navy: var(--navy);
      --qk-sky: var(--sky);
      --qk-white: var(--white);
      --qk-primary: var(--purple);
      --qk-shadow: var(--shadow);

      --qk-eng-bg-image:
        radial-gradient(circle at 14% 18%, rgba(255,255,255,.45) 0 8px, transparent 9px),
        radial-gradient(circle at 82% 24%, rgba(255,255,255,.35) 0 11px, transparent 12px),
        radial-gradient(circle at 46% 84%, rgba(255,255,255,.32) 0 8px, transparent 9px);
      --qk-eng-bg-size: 180px 180px, 250px 250px, 220px 220px;

      --qk-eng-title-w: 12ch;
      --qk-eng-hud-z: 3;
      --qk-eng-hud-h: 96px;
      --qk-eng-play-rows: auto minmax(0, 1fr);
      --qk-eng-play-pad:
        max(8px, env(safe-area-inset-top))
        max(12px, env(safe-area-inset-right))
        max(104px, calc(94px + env(safe-area-inset-bottom)))
        max(12px, env(safe-area-inset-left));
      --qk-eng-sound-x: 14px;
      --qk-eng-sound-y: 10px;
    }

    .qk-match-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-match-mode:nth-child(3n) { background-color: #2e9f76; }

    .qk-match-dot { opacity: .8; }
    .qk-match-dot.is-filled { background: var(--mint); opacity: 1; }
    .qk-match-dot.is-current { background: var(--peach); opacity: 1; transform: scale(1.16); }

    /* The matching field: a spoken prompt pill over the Pixi card table. Not
       engine-base's .qk-eng-stage — this one is a two-row grid whose canvas is
       a flow child, not an absolutely-positioned fill. */
    .qk-match-field {
      min-height: 0;
      width: min(1120px, 100%);
      justify-self: center;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: clamp(8px, 1.5vmin, 16px);
    }
    .qk-match-prompt {
      justify-self: center;
      min-height: 44px;
      max-width: min(820px, 100%);
      display: grid;
      place-items: center;
      padding: 7px 22px;
      border-radius: 999px;
      background: rgba(255,255,255,.48);
      color: var(--navy);
      font-size: clamp(19px, 3vmin, 30px);
      line-height: 1.08;
      text-align: center;
    }
    /* Overrides engine-base's absolutely-positioned .qk-eng-canvas: here the
       canvas is the field grid's second row. */
    .qk-match-canvas {
      position: relative;
      inset: auto;
      min-width: 0;
      min-height: 0;
    }

    .qk-match-again {
      display: inline-grid;
      grid-template-columns: 72px auto;
      align-items: center;
      gap: 14px;
      min-width: min(420px, 100%);
      background-color: var(--blue);
    }

    .qk-match-burst { position: absolute; left: 0; top: 0; z-index: 5; pointer-events: none; }
    .qk-match-burst span {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 5px;
      background: hsl(var(--hue), 82%, 62%);
      animation: qk-match-burst .78s ease-out both;
      animation-delay: var(--delay);
    }

    @media (max-width: 560px) {
      .qk-match-hud { grid-template-columns: 96px 1fr; }
      .qk-match-progress { justify-self: end; }
    }
    @media (max-height: 560px) and (orientation: landscape) {
      .qk-match-play { padding-bottom: max(92px, calc(84px + env(safe-area-inset-bottom))); }
      .qk-match-hud { min-height: 84px; }
      .qk-match-prompt { min-height: 38px; font-size: clamp(17px, 3vmin, 24px); }
    }
    @media (prefers-reduced-motion: reduce) {
      .qk-match-burst span { animation: none !important; }
      .qk-match * { transition: none !important; }
    }
    @keyframes qk-match-burst {
      0% { opacity: 1; transform: translate(-7px, -7px) scale(.8) rotate(0); }
      100% { opacity: 0; transform: translate(calc(var(--x) - 7px), calc(var(--y) - 7px)) scale(.25) rotate(160deg); }
    }
  `);
}
