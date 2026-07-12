// match-pairs.js — Stage v2 archetype engine for "find the two that belong together".
//
// The menu, HUD, and end screen stay in the DOM for crisp text and familiar
// browser accessibility. Gameplay cards live in Pixi so every match can feel
// springy, responsive, and consistent without asking game configs to change.

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
    this.previousDebug = window.QLOBE_DEBUG;

    this.destroyed = false;
    this.screen = 'splash';
    this.mode = null;
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.roundCards = [];
    this.selectedCardId = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
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

    // delegated back-button handling: play/end screens rebuild innerHTML,
    // so the listener lives on the mount and survives every screen swap
    this.mountEl.addEventListener('click', (event) => {
      if (event.target && event.target.closest && event.target.closest('.qk-match-back')) {
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
    this.disposeStage();
    speech.stop();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gesturestart', this.onGestureStart);
    this.mountEl.innerHTML = '';
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
    };
    window.QLOBE_DEBUG = this.debugHook;
  }

  renderSplash() {
    this.clearIdleTimer();
    this.disposeStage();
    this.screen = 'splash';
    this.mode = null;
    this.roundCards = [];
    this.selectedCardId = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    speech.stop();

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-match-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        <span>${escapeHtml(mode.title)}</span>
      </button>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-match qk-match-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-match-home qk-match-img-btn qk-match-home-splash" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-match-splash-center">
          <div class="qk-match-splash-art" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-match-mode-list">${buttons}</div>
        </div>
      </section>
    `;

    this.applyThemeBackdrop();

    this.mountEl.querySelectorAll('.qk-match-mode').forEach((button) => {
      button.addEventListener('pointerdown', (event) => {
        event.preventDefault();
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
    const section = this.mountEl.querySelector('.qk-match');
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

    this.clearIdleTimer();
    this.disposeStage();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
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
      <span class="qk-match-dot" data-dot="${index}" aria-hidden="true"></span>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-match qk-match-play" aria-label="${escapeAttr(this.mode.title)}">
        <header class="qk-match-hud">
          <button class="qk-match-back qk-match-img-btn" type="button" aria-label="Back to the game menu"></button>
          <div class="qk-match-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-match-field">
          <div class="qk-match-prompt" aria-live="polite">${escapeHtml(this.mode.prompt)}</div>
          <div class="qk-match-canvas" aria-label="${escapeAttr(this.mode.prompt)}"></div>
        </main>
        <button class="qk-match-sound qk-match-img-btn" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;
    this.applyThemeBackdrop();

    const home = this.mountEl.querySelector('.qk-match-back');
    home.addEventListener('pointerdown', (event) => {
      event.stopPropagation();
      this.playSfx('tick');
    });
    home.addEventListener('click', () => { speech.stop(); this.renderSplash(); });

    const sound = this.mountEl.querySelector('.qk-match-sound');
    sound.addEventListener('pointerdown', (event) => event.stopPropagation());
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async createPlayStage() {
    const host = this.mountEl.querySelector('.qk-match-canvas');
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
    shuffle(cards, this.rng);
    cards.forEach((card, index) => {
      card.id = `card:${index}`;
      card.cardIndex = index;
    });
    return cards;
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
    }, IDLE_MS);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  async finishGame() {
    this.clearIdleTimer();
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.selectedCardId = null;
    this.playSfx('tada');
    this.disposeStage();
    this.roundCards = [];
    this.renderEnd();
    this.createDomBurst(this.mountEl.querySelector('.qk-match-end-art'), 34);
    await this.speakLine(this.config.voice.cheer, true);
  }

  renderEnd() {
    // (backdrop re-applied below after innerHTML replaces the section)
    this.mountEl.innerHTML = `
      <section class="qk-match qk-match-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <button class="qk-match-back qk-match-img-btn" type="button" aria-label="Back to the game menu"></button>
        <div class="qk-match-end-center">
          <div class="qk-match-end-art" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <button class="qk-match-again" type="button">
            <span class="qk-match-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>
    `;

    this.applyThemeBackdrop();
    const home = this.mountEl.querySelector('.qk-match-back');
    home.addEventListener('pointerdown', (event) => event.stopPropagation());
    home.addEventListener('click', () => { speech.stop(); this.renderSplash(); });

    const again = this.mountEl.querySelector('.qk-match-again');
    again.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      this.unlockAudio();
      this.playSfx('tick');
    });
    again.addEventListener('click', () => {
      if (this.mode) this.startMode(this.mode.id);
      else this.renderSplash();
    });
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-match-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createDomBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-match') || this.mountEl;
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
    id: config.id || 'match-pairs',
    title: config.title || 'Match Pairs',
    splashEmoji: config.splashEmoji || '🔎',
    ...config,
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

function shuffle(list, rng) {
  for (let index = list.length - 1; index > 0; index--) {
    const other = Math.floor(rng() * (index + 1));
    [list[index], list[other]] = [list[other], list[index]];
  }
  return list;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return function random() {
    value += 0x6D2B79F5;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[character]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function installStyle() {
  if (styleInstalled || document.getElementById('qk-match-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-match-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-match, .qk-match * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-match {
      --sky: #bee3f5;
      --navy: #17517e;
      --blue: #2d7dd2;
      --purple: #7c4fc4;
      --white: #ffffff;
      --mint: #81d6a3;
      --peach: #ffad7a;
      --shadow: 0 6px 0 rgba(23,81,126,.18), 0 14px 30px rgba(23,81,126,.18);
      position: relative;
      width: 100%;
      height: 100dvh;
      min-height: 100%;
      overflow: hidden;
      color: var(--navy);
      font-family: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif;
      font-weight: 600;
      background-color: var(--sky);
      background-image:
        radial-gradient(circle at 14% 18%, rgba(255,255,255,.45) 0 8px, transparent 9px),
        radial-gradient(circle at 82% 24%, rgba(255,255,255,.35) 0 11px, transparent 12px),
        radial-gradient(circle at 46% 84%, rgba(255,255,255,.32) 0 8px, transparent 9px);
      background-size: 180px 180px, 250px 250px, 220px 220px;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
    }

    .qk-match button, .qk-match a { font: inherit; color: inherit; touch-action: manipulation; }
    .qk-match button { border: 0; cursor: pointer; }
    .qk-match button:focus-visible, .qk-match a:focus-visible {
      outline: 5px solid rgba(45,125,210,.65);
      outline-offset: 4px;
    }

    .qk-match-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
    }
    .qk-match-img-btn:active { transform: scale(.93); }
    .qk-match-home { background-image: url('${HOME_IMG}'); }
    .qk-match-back { background-image: url('${BACK_IMG}'); }
    .qk-match-sound { background-image: url('${SOUND_IMG}'); }

    .qk-match-splash, .qk-match-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }
    .qk-match-home,     .qk-match-back {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 4;
    }
    .qk-match-splash-center, .qk-match-end-center {
      width: min(900px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(14px, 2.5vmin, 24px);
      text-align: center;
      padding-top: 54px;
    }
    .qk-match-splash-art, .qk-match-end-art {
      display: grid;
      place-items: center;
      width: clamp(150px, 26vmin, 230px);
      aspect-ratio: 1;
      border-radius: 28px;
      background: linear-gradient(180deg, #ffffff, #fff3d0);
      border: 5px solid var(--white);
      box-shadow: var(--shadow);
      font-size: clamp(82px, 16vmin, 132px);
      line-height: 1;
    }
    .qk-match h1 {
      margin: 0;
      font-size: clamp(38px, 7vmin, 78px);
      line-height: .98;
      color: var(--navy);
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
      max-width: 12ch;
    }
    .qk-match-mode-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px;
      width: min(760px, 100%);
      margin-top: 6px;
    }
    .qk-match-mode, .qk-match-again {
      min-height: 104px;
      border-radius: 26px;
      border: 5px solid var(--white);
      padding: 18px 24px;
      color: var(--white);
      background: linear-gradient(180deg, rgba(255,255,255,.34), rgba(255,255,255,0) 50%), var(--purple);
      box-shadow: var(--shadow);
      font-size: clamp(23px, 4vmin, 36px);
      line-height: 1.05;
    }
    .qk-match-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-match-mode:nth-child(3n) { background-color: #2e9f76; }
    .qk-match-mode:active, .qk-match-again:active { transform: scale(.96); }

    .qk-match-play {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      padding: max(8px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
        max(104px, calc(94px + env(safe-area-inset-bottom))) max(12px, env(safe-area-inset-left));
    }
    .qk-match-hud {
      position: relative;
      z-index: 3;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 96px;
    }
    .qk-match-hud .qk-match-home,     .qk-match-hud .qk-match-back { position: static; grid-column: 1; }
    .qk-match-progress {
      grid-column: 2;
      justify-self: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 11px;
      min-height: 32px;
      padding: 6px 16px;
      border-radius: 999px;
      background: rgba(255,255,255,.38);
    }
    .qk-match-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(255,255,255,.9);
      box-shadow: inset 0 -2px 0 rgba(23,81,126,.12);
      opacity: .8;
    }
    .qk-match-dot.is-filled { background: var(--mint); opacity: 1; }
    .qk-match-dot.is-current { background: var(--peach); opacity: 1; transform: scale(1.16); }

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
    .qk-match-canvas {
      position: relative;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
      border-radius: 28px;
      touch-action: none;
    }
    .qk-match-canvas canvas {
      display: block;
      width: 100%;
      height: 100%;
      touch-action: none;
    }
    .qk-match-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(10px, env(safe-area-inset-bottom));
      z-index: 4;
    }
    .qk-match-again {
      display: inline-grid;
      grid-template-columns: 72px auto;
      align-items: center;
      gap: 14px;
      min-width: min(420px, 100%);
      background-color: var(--blue);
    }
    .qk-match-play-icon {
      display: block;
      width: 72px;
      height: 72px;
      background: transparent url('${PLAY_IMG}') center / contain no-repeat;
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
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
