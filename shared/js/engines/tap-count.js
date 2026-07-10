// tap-count.js — archetype engine for "counting with your finger".
// Game authors supply the counting content; this module owns the touch loop,
// flight feedback, spoken counting, round progression, and QLOBE_DEBUG hook.

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
  if (!mountEl) throw new Error('tap-count requires a mount element');
  installStyle();
  return new TapCountGame(config, mountEl);
}

class TapCountGame {
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
    this.roundItems = [];
    this.currentRound = null;
    this.objects = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.counted = 0;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
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
      engine: 'tap-count',
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
    this.currentRound = null;
    this.objects = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    speech.stop();

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-tap-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        <span>${escapeHtml(mode.title)}</span>
      </button>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-tap qk-tap-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-tap-home qk-tap-img-btn qk-tap-home-splash" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-tap-splash-center">
          <div class="qk-tap-splash-art" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-tap-mode-list">${buttons}</div>
        </div>
      </section>
    `;

    this.mountEl.querySelectorAll('.qk-tap-mode').forEach((button) => {
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(button.dataset.mode));
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
    const maxRounds = Math.min(mode.rounds || mode.rounds_spec.length, mode.rounds_spec.length);
    const source = mode.difficultyRamp ? sortRounds(mode.rounds_spec, mode.type) : shuffle(mode.rounds_spec.slice(), this.rng);
    this.roundItems = source.slice(0, maxRounds);
    this.roundsTotal = this.roundItems.length;

    this.renderPlayShell();
    if (this.roundsTotal === 0) {
      await this.finishGame();
      return;
    }
    await this.showRound(0);
  }

  renderPlayShell() {
    const dots = Array.from({ length: this.roundsTotal }, (_, i) => `
      <span class="qk-tap-dot" data-dot="${i}" aria-hidden="true"></span>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-tap qk-tap-play" aria-label="${escapeAttr(this.mode.title)}">
        <header class="qk-tap-hud">
          <a class="qk-tap-home qk-tap-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
          <div class="qk-tap-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-tap-stage" aria-live="polite">
          <div class="qk-tap-prompt">
            <div class="qk-tap-number-card" aria-hidden="true"></div>
            <div class="qk-tap-prompt-art" aria-hidden="true"></div>
          </div>
          <div class="qk-tap-playfield"></div>
          <button class="qk-tap-goal" type="button"></button>
        </main>
        <button class="qk-tap-sound qk-tap-img-btn" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;

    const home = this.mountEl.querySelector('.qk-tap-home');
    home.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.playSfx('tick');
    });
    home.addEventListener('click', () => speech.stop());

    const sound = this.mountEl.querySelector('.qk-tap-sound');
    sound.addEventListener('pointerdown', (e) => e.stopPropagation());
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play') return;
    this.clearIdleTimer();
    this.roundIndex = index;
    this.currentRound = this.roundItems[index];
    this.counted = 0;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.idlePrompted = false;
    this.objects = this.makeObjects(this.currentRound);

    this.updateDots();
    this.renderRound();
    this.speakLine(this.currentRound.say || this.config.voice.intro);
    this.scheduleIdlePrompt();
  }

  makeObjects(round) {
    const quota = quotaFor(this.mode.type, round);
    const total = this.mode.type === 'takeaway'
      ? clamp(round.start, quota, 10)
      : clamp(Math.max(6, quota + 2), quota, 10);

    return Array.from({ length: total }, (_, index) => ({
      id: `obj:${index + 1}`,
      index,
      art: round.itemArt,
      alt: round.itemAlt || '',
      used: false,
      el: null,
    }));
  }

  renderRound() {
    const numberCard = this.mountEl.querySelector('.qk-tap-number-card');
    const promptArt = this.mountEl.querySelector('.qk-tap-prompt-art');
    const playfield = this.mountEl.querySelector('.qk-tap-playfield');
    const goal = this.mountEl.querySelector('.qk-tap-goal');
    const quota = quotaFor(this.mode.type, this.currentRound);

    numberCard.innerHTML = '';
    numberCard.appendChild(artEl(`text:${quota}`, String(quota)));

    promptArt.innerHTML = '';
    promptArt.appendChild(artEl(this.currentRound.itemArt, this.currentRound.itemAlt || ''));

    playfield.innerHTML = '';
    playfield.style.setProperty('--object-count', String(this.objects.length));
    this.objects.forEach((obj, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'qk-tap-object qk-tap-object-enter';
      button.dataset.targetId = obj.id;
      button.style.setProperty('--enter-delay', `${index * 38}ms`);
      button.setAttribute('aria-label', obj.alt || 'counting item');
      button.appendChild(artEl(obj.art, obj.alt || ''));
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.tapTarget(obj.id);
      });
      obj.el = button;
      playfield.appendChild(button);
    });

    goal.innerHTML = '';
    goal.className = `qk-tap-goal ${this.mode.type === 'takeaway' ? 'qk-tap-creature' : 'qk-tap-basket'}`;
    goal.dataset.targetId = this.mode.type === 'takeaway' ? 'creature' : 'basket';
    goal.setAttribute('aria-label', this.mode.type === 'takeaway' ? this.config.copy.creature : this.config.copy.basket);
    const goalArt = this.mode.type === 'takeaway'
      ? this.currentRound.creatureArt
      : this.mode.basketArt || this.config.basketArt || 'emoji:🧺';
    goal.appendChild(artEl(goalArt, goal.getAttribute('aria-label') || ''));
    goal.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      this.tapTarget(goal.dataset.targetId);
    };
  }

  async tapTarget(targetId) {
    if (this.destroyed) return { accepted: false };
    if (targetId === 'basket' || targetId === 'creature') {
      this.playSfx('tick');
      await this.replayPrompt();
      return { accepted: true };
    }

    const obj = this.objects.find((entry) => entry.id === targetId);
    if (!obj || !this.awaitingInput || this.inputLocked || obj.used) {
      return { accepted: false };
    }

    await this.handleObjectTap(obj);
    return { accepted: true };
  }

  async handleObjectTap(obj) {
    this.clearIdleTimer();
    this.inputLocked = true;
    obj.used = true;
    this.counted += 1;

    this.playSfx('pop');
    if (this.mode.type === 'takeaway') this.playSfx('silly');
    else this.playSfx('whoosh');

    await this.flyObjectToGoal(obj);
    await this.speakCount(this.counted);

    const quota = quotaFor(this.mode.type, this.currentRound);
    if (this.counted >= quota) {
      this.awaitingInput = false;
      this.markTargetsNeutral();
      if (this.mode.type === 'takeaway') await this.completeTakeawayRound();
      else await this.completeCollectRound();
      return;
    }

    this.inputLocked = false;
    this.scheduleIdlePrompt();
  }

  async flyObjectToGoal(obj) {
    const el = obj.el;
    const goal = this.mountEl.querySelector('.qk-tap-goal');
    if (!el || !goal) return;

    const objectRect = el.getBoundingClientRect();
    const goalRect = goal.getBoundingClientRect();
    const dx = goalRect.left + goalRect.width / 2 - (objectRect.left + objectRect.width / 2);
    const dy = goalRect.top + goalRect.height / 2 - (objectRect.top + objectRect.height / 2);
    el.style.setProperty('--fly-x', `${dx}px`);
    el.style.setProperty('--fly-y', `${dy}px`);
    animateOnce(el, 'qk-tap-fly');
    animateOnce(goal, 'qk-tap-goal-pop');
    await wait(this.reducedMotion() ? 80 : 390);
    el.classList.add('is-used');
  }

  async completeCollectRound() {
    this.playSfx('sparkle');
    this.createBurst(this.mountEl.querySelector('.qk-tap-goal'), 22);
    await this.speakLine(this.collectCelebration(), true);
    await wait(this.reducedMotion() ? 80 : 450);
    await this.advanceRound();
  }

  async completeTakeawayRound() {
    this.playSfx('sparkle');
    await this.speakLine(this.config.voice.leftQuestion, true);
    await this.countRemainder();
    await wait(this.reducedMotion() ? 80 : 420);
    await this.advanceRound();
  }

  async countRemainder() {
    const remaining = this.objects.filter((obj) => !obj.used);
    if (remaining.length === 0) {
      await this.speakLine(this.config.voice.noneLeft, true);
      return;
    }

    for (let i = 0; i < remaining.length; i++) {
      animateOnce(remaining[i].el, 'qk-tap-bounce');
      await this.speakCount(i + 1, i === 0);
      await wait(this.reducedMotion() ? 20 : 90);
    }
    const words = remaining.map((_, index) => cleanCountWord(this.config.voice.counts[index])).join(', ');
    await this.speakLine(`${words} left!`, true);
  }

  collectCelebration() {
    const word = cleanCountWord(this.config.voice.counts[this.counted - 1]) || String(this.counted);
    const item = pluralize(this.currentRound.itemAlt || this.config.copy.items, this.counted);
    return `${word} ${item}! You did it!`;
  }

  async advanceRound() {
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
    if (!this.currentRound || this.screen !== 'play') return;
    this.clearIdleTimer();
    await this.speakLine(this.currentRound.say || this.config.voice.intro, true);
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.speakLine(this.currentRound.say || this.config.voice.intro, true);
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
    this.playSfx('tada');
    this.renderEnd();
    this.speakLine(this.config.voice.cheer, true);
  }

  renderEnd() {
    this.mountEl.innerHTML = `
      <section class="qk-tap qk-tap-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <a class="qk-tap-home qk-tap-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-tap-end-center">
          <div class="qk-tap-end-art" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <button class="qk-tap-again" type="button">
            <span class="qk-tap-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>
    `;
    const again = this.mountEl.querySelector('.qk-tap-again');
    again.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.unlockAudio();
      this.playSfx('tick');
    });
    again.addEventListener('click', () => {
      if (this.mode) this.startMode(this.mode.id);
      else this.renderSplash();
    });
    this.createBurst(this.mountEl.querySelector('.qk-tap-end-art'), 30);
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-tap-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  markTargetsNeutral() {
    this.objects.forEach((obj) => {
      if (obj.el) obj.el.classList.add('is-round-done');
    });
  }

  createBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-tap') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'qk-tap-burst';
    burst.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      const angle = (Math.PI * 2 * i) / count;
      const distance = 58 + this.fxRng() * 86;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      piece.style.setProperty('--hue', String(25 + Math.floor(this.fxRng() * 280)));
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
      count: this.counted,
      quota: this.currentRound && this.mode ? quotaFor(this.mode.type, this.currentRound) : 0,
    };
  }

  getTargets() {
    if (this.screen !== 'play') return [];
    const targets = this.objects.map((obj) => {
      const rect = obj.el ? obj.el.getBoundingClientRect() : emptyRect();
      return {
        id: obj.id,
        role: this.awaitingInput && !obj.used ? 'correct' : 'neutral',
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      };
    });

    const goal = this.mountEl.querySelector('.qk-tap-goal');
    if (goal) {
      const rect = goal.getBoundingClientRect();
      targets.push({
        id: this.mode.type === 'takeaway' ? 'creature' : 'basket',
        role: 'neutral',
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      });
    }
    return targets;
  }

  async winRound() {
    if (this.screen !== 'play') return;
    const startRound = this.roundIndex;
    while (this.screen === 'play' && this.roundIndex === startRound && this.awaitingInput && this.currentRound) {
      const target = this.objects.find((obj) => !obj.used);
      if (!target) break;
      await this.tapTarget(target.id);
    }
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    this.rng = mulberry32(Number(n) || 0);
    this.fxRng = mulberry32((Number(n) || 0) + 973);
  }

  async speakCount(index, cancel = true) {
    const line = this.config.voice.counts[index - 1] || `${index}!`;
    await this.speakLine(line, cancel);
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

function normalizeConfig(config) {
  const copy = {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
    basket: 'basket',
    creature: 'hungry friend',
    items: 'things',
    ...(config.copy || {}),
  };
  const voice = {
    intro: 'Tap and count.',
    cheer: 'Hooray, you counted them all!',
    leftQuestion: 'How many are left?',
    noneLeft: 'None left!',
    counts: ['One!', 'Two!', 'Three!', 'Four!', 'Five!', 'Six!', 'Seven!', 'Eight!', 'Nine!', 'Ten!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.counts)) voice.counts = [];

  return {
    id: config.id || 'tap-count',
    title: config.title || 'Tap Count',
    splashEmoji: config.splashEmoji || '🔢',
    basketArt: config.basketArt || 'emoji:🧺',
    ...config,
    copy,
    voice,
    modes: (config.modes || []).map((mode) => {
      const type = mode.type === 'takeaway' ? 'takeaway' : 'collect';
      const rounds = (mode.rounds_spec || []).map((round) => normalizeRound(round, type)).filter(Boolean);
      return {
        ...mode,
        type,
        rounds: Math.min(mode.rounds || rounds.length, rounds.length),
        rounds_spec: rounds,
      };
    }),
  };
}

function normalizeRound(round, type) {
  if (!round || !round.itemArt) return null;
  if (type === 'takeaway') {
    const start = clamp(round.start, 1, 10);
    const eat = clamp(round.eat, 1, start);
    if (!round.creatureArt) return null;
    return { ...round, start, eat, say: round.say || `Eat ${eat}.` };
  }

  const count = clamp(round.count, 1, 10);
  return { ...round, count, say: round.say || `Put ${count} in the basket.` };
}

function quotaFor(type, round) {
  return type === 'takeaway' ? round.eat : round.count;
}

function sortRounds(rounds, type) {
  return rounds.slice().sort((a, b) => {
    const aq = type === 'takeaway' ? a.eat : a.count;
    const bq = type === 'takeaway' ? b.eat : b.count;
    return aq - bq;
  });
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
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function cleanCountWord(word) {
  return String(word || '').replace(/[!?.]/g, '').trim();
}

function pluralize(word, count) {
  const clean = String(word || 'things').trim();
  if (count === 1 || clean.endsWith('s')) return clean;
  return `${clean}s`;
}

function animateOnce(el, className) {
  if (!el) return;
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), 760);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function emptyRect() {
  return { x: 0, y: 0, width: 0, height: 0 };
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
  if (styleInstalled || document.getElementById('qk-tap-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-tap-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-tap, .qk-tap * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-tap {
      --sky: #bee3f5;
      --navy: #17517e;
      --blue: #2d7dd2;
      --green: #2e9f76;
      --purple: #7c4fc4;
      --cream: #fff8e8;
      --gold: #f4c53d;
      --white: #ffffff;
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
        radial-gradient(circle at 78% 24%, rgba(255,255,255,.36) 0 11px, transparent 12px),
        linear-gradient(180deg, rgba(255,255,255,.32), rgba(255,255,255,0) 44%);
      background-size: 180px 180px, 250px 250px, 100% 100%;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
    }

    .qk-tap button, .qk-tap a {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    .qk-tap button {
      border: 0;
      cursor: pointer;
    }

    .qk-tap button:focus-visible,
    .qk-tap a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .65);
      outline-offset: 4px;
    }

    .qk-tap-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
    }

    .qk-tap-img-btn:active { transform: scale(.93); }
    .qk-tap-home { background-image: url('${HOME_IMG}'); }
    .qk-tap-sound { background-image: url('${SOUND_IMG}'); }

    .qk-tap-splash,
    .qk-tap-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }

    .qk-tap-home {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 4;
    }

    .qk-tap-splash-center,
    .qk-tap-end-center {
      width: min(900px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(14px, 2.6vmin, 24px);
      text-align: center;
      padding-top: 54px;
    }

    .qk-tap-splash-art,
    .qk-tap-end-art {
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

    .qk-tap h1 {
      margin: 0;
      font-size: clamp(38px, 7vmin, 78px);
      line-height: 1;
      letter-spacing: 0;
      color: var(--navy);
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
      max-width: 13ch;
    }

    .qk-tap-mode-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px;
      width: min(760px, 100%);
      margin-top: 6px;
    }

    .qk-tap-mode,
    .qk-tap-again {
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

    .qk-tap-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-tap-mode:nth-child(3n) { background-color: var(--green); }
    .qk-tap-mode:active,
    .qk-tap-again:active { transform: scale(.96); }

    .qk-tap-play {
      display: grid;
      grid-template-rows: auto 1fr;
      padding: max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(110px, calc(100px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }

    .qk-tap-hud {
      position: relative;
      z-index: 3;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 96px;
    }

    .qk-tap-hud .qk-tap-home {
      position: static;
      grid-column: 1;
    }

    .qk-tap-progress {
      grid-column: 2;
      justify-self: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 11px;
      min-height: 32px;
    }

    .qk-tap-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(255,255,255,.72);
      border: 3px solid rgba(23, 81, 126, .18);
    }

    .qk-tap-dot.is-filled { background: var(--green); border-color: rgba(23, 81, 126, .24); }
    .qk-tap-dot.is-current { transform: scale(1.24); background: var(--gold); }

    .qk-tap-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: auto 1fr auto;
      gap: clamp(10px, 2vmin, 18px);
      align-items: center;
      justify-items: center;
      width: min(1120px, 100%);
      margin: 0 auto;
    }

    .qk-tap-prompt {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: clamp(12px, 2vmin, 22px);
      min-height: 112px;
    }

    .qk-tap-number-card,
    .qk-tap-prompt-art {
      display: grid;
      place-items: center;
      width: clamp(104px, 16vmin, 154px);
      aspect-ratio: 1;
      border-radius: 24px;
      border: 5px solid var(--white);
      background: linear-gradient(180deg, #ffffff, #fff3d0);
      box-shadow: var(--shadow);
      --qk-art-size: clamp(58px, 9vmin, 92px);
    }

    .qk-tap-prompt-art {
      background: linear-gradient(180deg, #ffffff, #eaf8ff);
      --qk-art-size: clamp(54px, 8.5vmin, 86px);
    }

    .qk-tap-playfield {
      width: min(900px, 100%);
      min-height: 220px;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
      gap: clamp(10px, 1.8vmin, 18px);
      align-content: center;
      justify-items: center;
    }

    .qk-tap-object {
      position: relative;
      z-index: 1;
      display: grid;
      place-items: center;
      width: clamp(104px, 13vmin, 132px);
      aspect-ratio: 1;
      border-radius: 24px;
      border: 5px solid var(--white);
      background:
        linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,248,232,.95)),
        var(--cream);
      box-shadow: var(--shadow);
      --qk-art-size: clamp(56px, 8.8vmin, 82px);
      will-change: transform, opacity;
    }

    .qk-tap-object:not(.is-used):active { transform: scale(.94); }
    .qk-tap-object.is-used {
      pointer-events: none;
      opacity: .32;
      filter: saturate(.75);
      box-shadow: 0 4px 0 rgba(23, 81, 126, .12);
    }

    .qk-tap-object-enter {
      animation: qk-tap-enter .34s ease both;
      animation-delay: var(--enter-delay, 0ms);
    }

    .qk-tap-goal {
      display: grid;
      place-items: center;
      width: clamp(134px, 20vmin, 178px);
      aspect-ratio: 1;
      border-radius: 30px;
      border: 5px solid var(--white);
      background:
        linear-gradient(180deg, rgba(255,255,255,.76), rgba(255,243,208,.92)),
        #ffd98a;
      box-shadow: var(--shadow);
      --qk-art-size: clamp(72px, 12vmin, 108px);
    }

    .qk-tap-creature {
      background:
        linear-gradient(180deg, rgba(255,255,255,.78), rgba(229,247,255,.94)),
        #9bd8f3;
    }

    .qk-tap-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 5;
    }

    .qk-tap-play-icon {
      display: inline-block;
      width: 48px;
      height: 48px;
      margin-right: 10px;
      vertical-align: middle;
      background: url('${PLAY_IMG}') center / contain no-repeat;
    }

    .qk-tap-burst {
      position: absolute;
      z-index: 9;
      left: 0;
      top: 0;
      pointer-events: none;
    }

    .qk-tap-burst span {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 5px;
      background: hsl(var(--hue), 78%, 58%);
      animation: qk-tap-burst .78s ease-out forwards;
      animation-delay: var(--delay, 0ms);
    }

    .qk-tap-fly { animation: qk-tap-fly .38s cubic-bezier(.2,.8,.28,1) both; }
    .qk-tap-bounce { animation: qk-tap-bounce .42s ease both; }
    .qk-tap-goal-pop { animation: qk-tap-goal-pop .36s ease both; }

    @keyframes qk-tap-enter {
      from { opacity: 0; transform: translateY(18px) scale(.88); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes qk-tap-fly {
      0% { transform: translate(0, 0) scale(1); opacity: 1; }
      72% { transform: translate(calc(var(--fly-x) * .9), calc(var(--fly-y) * .9 - 22px)) scale(.82); opacity: .94; }
      100% { transform: translate(var(--fly-x), var(--fly-y)) scale(.35); opacity: 0; }
    }

    @keyframes qk-tap-bounce {
      0%, 100% { transform: translateY(0) scale(1); }
      45% { transform: translateY(-18px) scale(1.08); }
    }

    @keyframes qk-tap-goal-pop {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }

    @keyframes qk-tap-burst {
      to {
        transform: translate(var(--x), var(--y)) rotate(240deg);
        opacity: 0;
      }
    }

    @media (orientation: landscape) {
      .qk-tap-stage {
        grid-template-columns: minmax(170px, .45fr) 1fr minmax(160px, .5fr);
        grid-template-rows: 1fr;
      }

      .qk-tap-prompt {
        flex-direction: column;
      }

      .qk-tap-playfield {
        min-height: 0;
        align-self: stretch;
      }

      .qk-tap-goal {
        align-self: center;
      }
    }

    @media (max-width: 640px) {
      .qk-tap-play {
        padding-left: max(10px, env(safe-area-inset-left));
        padding-right: max(10px, env(safe-area-inset-right));
      }

      .qk-tap-hud {
        grid-template-columns: 96px 1fr 96px;
        min-height: 96px;
      }

      .qk-tap-playfield {
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        gap: 9px;
      }

      .qk-tap-object {
        width: 96px;
        border-radius: 21px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-tap *,
      .qk-tap *::before,
      .qk-tap *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .01ms !important;
      }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
