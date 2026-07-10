// match-pairs.js — archetype engine for "find the two that belong together".
// Game authors supply paired content; this module owns the touch loop, feedback,
// round progression, and the required QLOBE_DEBUG hook.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { artEl } from './art.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;

const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;

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

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (e) => e.preventDefault();
    this.onGestureStart = (e) => e.preventDefault();
    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);

    this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebugHook();
  }

  destroy() {
    this.destroyed = true;
    this.clearIdleTimer();
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

    this.mountEl.querySelectorAll('.qk-match-mode').forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => {
        this.startMode(button.dataset.mode);
      });
    });
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;

    const mode = this.config.modes.find((entry) => entry.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearIdleTimer();
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
    await this.showRound(0);
  }

  renderPlayShell() {
    const dots = Array.from({ length: this.roundsTotal }, (_, i) => `
      <span class="qk-match-dot" data-dot="${i}" aria-hidden="true"></span>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-match qk-match-play" aria-label="${escapeAttr(this.mode.title)}">
        <header class="qk-match-hud">
          <a class="qk-match-home qk-match-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
          <div class="qk-match-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-match-stage">
          <div class="qk-match-prompt" aria-live="polite">${escapeHtml(this.mode.prompt)}</div>
          <div class="qk-match-grid" aria-live="polite"></div>
        </main>
        <button class="qk-match-sound qk-match-img-btn" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;

    const home = this.mountEl.querySelector('.qk-match-home');
    home.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.playSfx('tick');
    });
    home.addEventListener('click', () => speech.stop());

    const sound = this.mountEl.querySelector('.qk-match-sound');
    sound.addEventListener('pointerdown', (e) => e.stopPropagation());
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play') return;
    this.clearIdleTimer();
    this.roundIndex = index;
    this.selectedCardId = null;
    this.roundCards = [];
    this.awaitingInput = true;
    this.inputLocked = false;
    this.idlePrompted = false;

    const pairs = this.drawPairs(this.pairCountForRound(index));
    this.roundCards = this.makeCards(pairs);

    this.updateDots();
    this.renderCards();
    this.speakLine(this.mode.prompt || this.config.voice.intro);
    this.scheduleIdlePrompt();
  }

  drawPairs(count) {
    const picked = [];
    while (picked.length < count && this.mode.pairs.length) {
      if (this.pairDeck.length === 0) {
        this.pairDeck = shuffle(this.mode.pairs.slice(), this.rng);
      }
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
    });
    return cards;
  }

  cardFromPair(pair, pairKey, side) {
    const item = side === 'a' ? pair.a : pair.b;
    return {
      id: '',
      pairKey,
      pair,
      art: item.art,
      alt: item.alt || item.say || '',
      say: item.say || item.alt || '',
      matched: false,
      el: null,
    };
  }

  renderCards() {
    const grid = this.mountEl.querySelector('.qk-match-grid');
    grid.innerHTML = '';
    grid.style.setProperty('--card-count', String(this.roundCards.length));

    this.roundCards.forEach((card, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'qk-match-card qk-match-card-enter';
      button.style.setProperty('--enter-delay', `${index * 55}ms`);
      button.dataset.targetId = card.id;
      button.setAttribute('aria-label', card.alt);
      button.appendChild(artEl(card.art, card.alt));
      card.el = button;
      grid.appendChild(button);

      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.tapTarget(card.id);
      });
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
      this.clearSelection();
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
    this.clearSelection();
    this.selectedCardId = card.id;
    card.el.classList.add('is-selected');
    this.playSfx('pop');
  }

  clearSelection() {
    if (this.selectedCardId) {
      const selected = this.cardById(this.selectedCardId);
      if (selected && selected.el) selected.el.classList.remove('is-selected');
    }
    this.selectedCardId = null;
  }

  async evaluatePair(first, second) {
    this.inputLocked = true;
    if (first.pairKey === second.pairKey) {
      await this.handleMatch(first, second);
    } else {
      await this.handleMiss(first, second);
    }
    if (!this.destroyed && this.screen === 'play' && this.awaitingInput) {
      this.scheduleIdlePrompt();
    }
  }

  async handleMatch(first, second) {
    this.clearSelection();
    animateOnce(first.el, 'qk-match-paired');
    animateOnce(second.el, 'qk-match-paired');
    this.playSfx('pop');
    this.playSfx('sparkle');
    this.createBurst(first.el, 12);
    this.createBurst(second.el, 12);
    this.matchCount += 1;

    await this.speakLine(first.pair.say, true);
    if (this.matchCount % 2 === 0 && this.config.voice.yums.length) {
      const line = this.config.voice.yums[this.yumIndex % this.config.voice.yums.length];
      this.yumIndex += 1;
      await this.speakLine(line, true);
    }

    first.matched = true;
    second.matched = true;
    first.el.classList.add('is-matched');
    second.el.classList.add('is-matched');

    if (this.roundCards.every((card) => card.matched)) {
      await this.completeRound();
    } else {
      this.inputLocked = false;
    }
  }

  async handleMiss(first, second) {
    this.playSfx('boing');
    animateOnce(first.el, 'qk-match-wiggle');
    animateOnce(second.el, 'qk-match-wiggle');
    await this.speakLine(this.config.voice.nudge, true);
    this.clearSelection();
    this.inputLocked = false;
  }

  async completeRound() {
    this.awaitingInput = false;
    this.inputLocked = true;
    this.clearSelection();
    await wait(this.reducedMotion() ? 120 : 650);

    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) {
      await this.finishGame();
    } else {
      await this.showRound(next);
    }
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
    this.roundCards = [];
    this.selectedCardId = null;
    this.playSfx('tada');
    this.renderEnd();
    this.createBurst(this.mountEl.querySelector('.qk-match-end-art'), 34);
    await this.speakLine(this.config.voice.cheer, true);
  }

  renderEnd() {
    this.mountEl.innerHTML = `
      <section class="qk-match qk-match-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <a class="qk-match-home qk-match-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
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

    const home = this.mountEl.querySelector('.qk-match-home');
    home.addEventListener('pointerdown', (e) => e.stopPropagation());
    home.addEventListener('click', () => speech.stop());

    const again = this.mountEl.querySelector('.qk-match-again');
    again.addEventListener('pointerdown', (e) => {
      e.preventDefault();
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

  createBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-match') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'qk-match-burst';
    burst.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      const angle = (Math.PI * 2 * i) / count;
      const distance = 58 + this.fxRng() * 82;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      piece.style.setProperty('--hue', String(18 + Math.floor(this.fxRng() * 300)));
      piece.style.setProperty('--delay', `${this.fxRng() * 80}ms`);
      burst.appendChild(piece);
    }

    host.appendChild(burst);
    window.setTimeout(() => burst.remove(), 900);
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
    if (this.screen !== 'play') return [];
    return this.roundCards.filter((card) => !card.matched && card.el).map((card) => {
      const rect = card.el.getBoundingClientRect();
      return {
        id: card.id,
        role: this.debugRole(card),
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      };
    });
  }

  debugRole(card) {
    if (!this.selectedCardId) return 'neutral';
    if (card.id === this.selectedCardId) return 'neutral';
    const selected = this.cardById(this.selectedCardId);
    if (!selected) return 'neutral';
    return card.pairKey === selected.pairKey ? 'correct' : 'wrong';
  }

  async winRound() {
    if (this.screen !== 'play' || this.destroyed) return;
    const round = this.roundIndex;
    this.clearSelection();

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || min));
}

function animateOnce(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), 720);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
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
      --cream: #fff8e8;
      --white: #ffffff;
      --mint: #81d6a3;
      --peach: #ffad7a;
      --gold: #f4c53d;
      --shadow: 0 6px 0 rgba(23, 81, 126, .18), 0 14px 30px rgba(23, 81, 126, .18);
      position: relative;
      min-height: 100dvh;
      width: 100%;
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

    .qk-match button, .qk-match a {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    .qk-match button {
      border: 0;
      cursor: pointer;
    }

    .qk-match button:focus-visible,
    .qk-match a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .65);
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
    .qk-match-sound { background-image: url('${SOUND_IMG}'); }

    .qk-match-splash,
    .qk-match-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }

    .qk-match-home {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 4;
    }

    .qk-match-splash-center,
    .qk-match-end-center {
      width: min(900px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(14px, 2.5vmin, 24px);
      text-align: center;
      padding-top: 54px;
    }

    .qk-match-splash-art,
    .qk-match-end-art {
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
      letter-spacing: 0;
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

    .qk-match-mode,
    .qk-match-again {
      min-height: 104px;
      border-radius: 26px;
      border: 5px solid var(--white);
      padding: 18px 24px;
      color: var(--white);
      background:
        linear-gradient(180deg, rgba(255,255,255,.34), rgba(255,255,255,0) 50%),
        var(--purple);
      box-shadow: var(--shadow);
      font-size: clamp(23px, 4vmin, 36px);
      line-height: 1.05;
    }

    .qk-match-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-match-mode:nth-child(3n) { background-color: #2e9f76; }
    .qk-match-mode:active,
    .qk-match-again:active { transform: scale(.96); }

    .qk-match-play {
      display: grid;
      grid-template-rows: auto 1fr;
      padding: max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(112px, calc(100px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }

    .qk-match-hud {
      position: relative;
      z-index: 3;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 100px;
    }

    .qk-match-hud .qk-match-home {
      position: static;
      grid-column: 1;
    }

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

    .qk-match-dot.is-filled {
      background: var(--mint);
      opacity: 1;
    }

    .qk-match-dot.is-current {
      background: var(--peach);
      opacity: 1;
      transform: scale(1.16);
    }

    .qk-match-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: auto 1fr;
      align-items: stretch;
      gap: clamp(12px, 2vmin, 22px);
      width: min(1120px, 100%);
      justify-self: center;
    }

    .qk-match-prompt {
      justify-self: center;
      min-height: 48px;
      max-width: min(820px, 100%);
      display: grid;
      place-items: center;
      padding: 8px 22px;
      border-radius: 999px;
      background: rgba(255,255,255,.48);
      color: var(--navy);
      font-size: clamp(20px, 3vmin, 32px);
      line-height: 1.08;
      text-align: center;
    }

    .qk-match-grid {
      align-self: stretch;
      display: grid;
      grid-template-columns: repeat(4, minmax(120px, 1fr));
      gap: clamp(12px, 2.2vmin, 22px);
      align-content: center;
      justify-content: center;
      width: 100%;
    }

    .qk-match-grid[style*="--card-count: 4"] {
      grid-template-columns: repeat(4, minmax(132px, 1fr));
    }

    .qk-match-grid[style*="--card-count: 6"] {
      grid-template-columns: repeat(3, minmax(122px, 1fr));
    }

    .qk-match-card {
      position: relative;
      min-width: 96px;
      min-height: 96px;
      height: min(25vmin, 190px);
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      border-radius: 24px;
      border: 6px solid var(--white);
      background:
        linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.18) 48%, rgba(255,255,255,0)),
        var(--cream);
      box-shadow: var(--shadow);
      padding: clamp(12px, 2vmin, 22px);
      --qk-art-size: clamp(58px, 12vmin, 126px);
      transition: transform .18s ease, filter .18s ease, opacity .18s ease, border-color .18s ease;
    }

    .qk-match-card:nth-child(2n) { background-color: #e9fff1; }
    .qk-match-card:nth-child(3n) { background-color: #fff0e6; }
    .qk-match-card:nth-child(4n) { background-color: #eef1ff; }
    .qk-match-card:active { transform: scale(.96); }

    .qk-match-card.is-selected {
      transform: translateY(-10px) scale(1.04);
      border-color: var(--gold);
      box-shadow: 0 8px 0 rgba(244,197,61,.45), 0 18px 34px rgba(23,81,126,.22);
    }

    .qk-match-card.is-matched {
      opacity: .58;
      filter: saturate(.75);
      transform: scale(.94);
      border-color: var(--mint);
    }

    .qk-match-card.is-matched::after {
      content: "✓";
      position: absolute;
      right: 8px;
      bottom: 6px;
      width: 42px;
      height: 42px;
      display: grid;
      place-items: center;
      border-radius: 50%;
      background: var(--mint);
      color: #ffffff;
      border: 4px solid #ffffff;
      font-size: 28px;
      line-height: 1;
      box-shadow: 0 4px 0 rgba(23,81,126,.12);
    }

    .qk-match-card-enter {
      animation: qk-match-enter .44s cubic-bezier(.2,.8,.25,1.25) both;
      animation-delay: var(--enter-delay);
    }

    .qk-match-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
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

    .qk-match-burst {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 5;
      pointer-events: none;
    }

    .qk-match-burst span {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 5px;
      background: hsl(var(--hue), 82%, 62%);
      animation: qk-match-burst .78s ease-out both;
      animation-delay: var(--delay);
    }

    .qk-match-paired { animation: qk-match-paired .62s cubic-bezier(.2,.8,.24,1.3); }
    .qk-match-wiggle { animation: qk-match-wiggle .48s ease-in-out; }

    @media (orientation: portrait) {
      .qk-match-grid,
      .qk-match-grid[style*="--card-count: 4"],
      .qk-match-grid[style*="--card-count: 6"] {
        grid-template-columns: repeat(2, minmax(112px, min(40vw, 220px)));
      }

      .qk-match-card {
        height: clamp(96px, 15vh, 170px);
      }
    }

    @media (max-width: 560px) {
      .qk-match-hud {
        grid-template-columns: 96px 1fr;
      }

      .qk-match-progress {
        justify-self: end;
      }

      .qk-match-card {
        border-radius: 20px;
      }
    }

    @media (max-height: 560px) and (orientation: landscape) {
      .qk-match-play {
        padding-bottom: max(96px, calc(88px + env(safe-area-inset-bottom)));
      }

      .qk-match-hud {
        min-height: 88px;
      }

      .qk-match-card {
        height: min(24vmin, 140px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-match-card-enter,
      .qk-match-paired,
      .qk-match-wiggle,
      .qk-match-burst span {
        animation: none !important;
      }

      .qk-match * {
        transition: none !important;
      }
    }

    @keyframes qk-match-enter {
      from { opacity: 0; transform: translateY(20px) scale(.92); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes qk-match-paired {
      0% { transform: scale(1); }
      34% { transform: scale(1.12) rotate(-1deg); }
      68% { transform: scale(.98) rotate(1deg); }
      100% { transform: scale(.94) rotate(0); }
    }

    @keyframes qk-match-wiggle {
      0%, 100% { transform: translateX(0) rotate(0); }
      22% { transform: translateX(-9px) rotate(-2deg); }
      48% { transform: translateX(8px) rotate(2deg); }
      72% { transform: translateX(-5px) rotate(-1deg); }
    }

    @keyframes qk-match-burst {
      0% { opacity: 1; transform: translate(-7px, -7px) scale(.8) rotate(0); }
      100% { opacity: 0; transform: translate(calc(var(--x) - 7px), calc(var(--y) - 7px)) scale(.25) rotate(160deg); }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
