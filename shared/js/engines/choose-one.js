// choose-one.js — archetype engine for "hear/see a prompt, tap one answer".
// The game author supplies only config data; this module owns the full loop,
// touch handling, warm feedback, and the required QLOBE_DEBUG hook.

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
    this.previousDebug = window.QLOBE_DEBUG;

    this.screen = 'splash';
    this.mode = null;
    this.roundItems = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.currentItem = null;
    this.currentAnswers = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
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
    this.targetMap.clear();
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
    };
    window.QLOBE_DEBUG = this.debugHook;
  }

  renderSplash() {
    this.clearIdleTimer();
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    speech.stop();

    const buttons = this.config.modes.map((mode) => `
      <button class="qk-choose-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        <span class="qk-choose-mode-title">${escapeHtml(mode.title)}</span>
      </button>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-choose qk-choose-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-choose-home qk-choose-img-btn qk-choose-home-splash" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-choose-splash-center">
          <div class="qk-choose-splash-emoji" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-choose-mode-list">${buttons}</div>
        </div>
      </section>
    `;

    this.mountEl.querySelectorAll('.qk-choose-mode').forEach((button) => {
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

    const mode = this.config.modes.find((m) => m.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearIdleTimer();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
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
    await this.showRound(0);
  }

  renderPlayShell() {
    const dots = Array.from({ length: this.roundsTotal }, (_, i) => `
      <span class="qk-choose-dot" data-dot="${i}" aria-hidden="true"></span>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-choose qk-choose-play" aria-label="${escapeAttr(this.mode.title)}">
        <header class="qk-choose-hud">
          <a class="qk-choose-home qk-choose-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
          <div class="qk-choose-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-choose-stage">
          <button class="qk-choose-prompt" type="button" hidden></button>
          <div class="qk-choose-answers" aria-live="polite"></div>
        </main>
        <button class="qk-choose-sound qk-choose-img-btn" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;

    const sound = this.mountEl.querySelector('.qk-choose-sound');
    sound.addEventListener('pointerdown', (e) => e.stopPropagation());
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play') return;
    this.clearIdleTimer();
    this.roundIndex = index;
    this.currentItem = this.roundItems[index];
    this.currentAnswers = this.pickAnswers(this.currentItem);
    this.targetMap.clear();
    this.targetSeq = 0;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.idlePrompted = false;

    this.updateDots();
    this.renderPrompt();
    this.renderAnswers();
    this.speakLine(this.currentItem.say);
    this.scheduleIdlePrompt();
  }

  renderPrompt() {
    const promptButton = this.mountEl.querySelector('.qk-choose-prompt');
    promptButton.innerHTML = '';
    if (!this.currentItem.promptArt) {
      promptButton.hidden = true;
      return;
    }

    promptButton.hidden = false;
    promptButton.appendChild(artEl(this.currentItem.promptArt, this.currentItem.promptAlt || ''));
    const id = this.nextTargetId('prompt');
    promptButton.dataset.targetId = id;
    this.targetMap.set(id, {
      id,
      role: 'neutral',
      type: 'prompt',
      el: promptButton,
      action: () => this.replayPrompt(),
    });

    promptButton.onpointerdown = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      this.tapTarget(id);
    };
  }

  renderAnswers() {
    const answersEl = this.mountEl.querySelector('.qk-choose-answers');
    answersEl.innerHTML = '';
    answersEl.style.setProperty('--answer-count', String(this.currentAnswers.length));

    this.currentAnswers.forEach((answer, index) => {
      const id = this.nextTargetId('answer');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'qk-choose-card qk-choose-card-enter';
      button.style.setProperty('--enter-delay', `${index * 70}ms`);
      button.dataset.targetId = id;
      button.setAttribute('aria-label', answer.alt || '');
      button.appendChild(artEl(answer.art, answer.alt || ''));
      answersEl.appendChild(button);

      this.targetMap.set(id, {
        id,
        role: answer.correct ? 'correct' : 'wrong',
        type: 'answer',
        answer,
        el: button,
        action: () => this.handleAnswer(id),
      });

      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.tapTarget(id);
      });
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
    this.playSfx('pop');
    this.playSfx('sparkle');
    animateOnce(target.el, 'qk-choose-bounce');
    this.createBurst(target.el, 18);

    const yums = this.config.voice.yums;
    if (yums.length) {
      const line = yums[this.yumIndex % yums.length];
      this.yumIndex += 1;
      await this.speakLine(line, true);
    }

    await wait(this.reducedMotion() ? 120 : 650);
    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) await this.finishGame();
    else await this.showRound(next);
  }

  async handleWrong(target) {
    this.playSfx('boing');
    animateOnce(target.el, 'qk-choose-wiggle');
    await this.speakLine(this.config.voice.nudge, true);
    await this.speakLine(this.currentItem.say, true);
    this.scheduleIdlePrompt();
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
    this.targetMap.clear();
    this.playSfx('tada');
    await this.renderEnd();
    this.speakLine(this.config.voice.cheer, true);
  }

  async renderEnd() {
    this.mountEl.innerHTML = `
      <section class="qk-choose qk-choose-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <a class="qk-choose-home qk-choose-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-choose-end-center">
          <div class="qk-choose-end-emoji" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <button class="qk-choose-again" type="button">
            <span class="qk-choose-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>
    `;
    const again = this.mountEl.querySelector('.qk-choose-again');
    again.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.unlockAudio();
      this.playSfx('tick');
    });
    again.addEventListener('click', () => {
      if (this.mode) this.startMode(this.mode.id);
      else this.renderSplash();
    });
    this.createBurst(this.mountEl.querySelector('.qk-choose-end-emoji'), 30);
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-choose-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-choose') || this.mountEl;
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
    return Array.from(this.targetMap.values()).map((target) => {
      const rect = target.el.getBoundingClientRect();
      return {
        id: target.id,
        role: target.role,
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
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
    id: config.id || 'choose-one',
    title: config.title || 'Choose One',
    splashEmoji: config.splashEmoji || '⭐',
    ...config,
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

function animateOnce(el, className) {
  el.classList.remove(className);
  void el.offsetWidth;
  el.classList.add(className);
  window.setTimeout(() => el.classList.remove(className), 700);
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
  if (styleInstalled || document.getElementById('qk-choose-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-choose-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-choose, .qk-choose * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
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
      position: relative;
      min-height: 100dvh;
      width: 100%;
      overflow: hidden;
      color: var(--navy);
      font-family: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif;
      font-weight: 600;
      background-color: var(--sky);
      background-image:
        radial-gradient(circle at 18% 18%, rgba(255,255,255,.45) 0 7px, transparent 8px),
        radial-gradient(circle at 72% 22%, rgba(255,255,255,.38) 0 10px, transparent 11px),
        radial-gradient(circle at 42% 82%, rgba(255,255,255,.30) 0 8px, transparent 9px);
      background-size: 170px 170px, 240px 240px, 210px 210px;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
    }

    .qk-choose button, .qk-choose a {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    .qk-choose button {
      border: 0;
      cursor: pointer;
    }

    .qk-choose button:focus-visible,
    .qk-choose a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .65);
      outline-offset: 4px;
    }

    .qk-choose-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
    }

    .qk-choose-img-btn:active { transform: scale(.93); }
    .qk-choose-home { background-image: url('${HOME_IMG}'); }
    .qk-choose-sound { background-image: url('${SOUND_IMG}'); }

    .qk-choose-splash,
    .qk-choose-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }

    .qk-choose-home {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 4;
    }

    .qk-choose-splash-center,
    .qk-choose-end-center {
      width: min(900px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(14px, 2.5vmin, 24px);
      text-align: center;
      padding-top: 54px;
    }

    .qk-choose-splash-emoji,
    .qk-choose-end-emoji {
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

    .qk-choose h1 {
      margin: 0;
      font-size: clamp(38px, 7vmin, 78px);
      line-height: .98;
      letter-spacing: 0;
      color: var(--navy);
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
      max-width: 12ch;
    }

    .qk-choose-mode-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px;
      width: min(760px, 100%);
      margin-top: 6px;
    }

    .qk-choose-mode,
    .qk-choose-again {
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

    .qk-choose-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-choose-mode:nth-child(3n) { background-color: #2e9f76; }
    .qk-choose-mode:active,
    .qk-choose-again:active { transform: scale(.96); }

    .qk-choose-play {
      display: grid;
      grid-template-rows: auto 1fr;
      padding: max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(112px, calc(100px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }

    .qk-choose-hud {
      position: relative;
      z-index: 3;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 100px;
    }

    .qk-choose-hud .qk-choose-home {
      position: static;
      grid-column: 1;
    }

    .qk-choose-progress {
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

    .qk-choose-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(255,255,255,.9);
      box-shadow: inset 0 -2px 0 rgba(23,81,126,.12);
      opacity: .8;
    }

    .qk-choose-dot.is-filled {
      background: var(--mint);
      opacity: 1;
    }

    .qk-choose-dot.is-current {
      background: var(--peach);
      opacity: 1;
      transform: scale(1.16);
    }

    .qk-choose-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(120px, auto) 1fr;
      align-items: center;
      gap: clamp(14px, 3vmin, 30px);
      width: min(1100px, 100%);
      justify-self: center;
    }

    .qk-choose-prompt {
      justify-self: center;
      display: grid;
      place-items: center;
      width: clamp(126px, 22vmin, 210px);
      aspect-ratio: 1;
      border-radius: 28px;
      border: 5px solid var(--white);
      background: linear-gradient(180deg, #ffffff, #e7f7ff);
      box-shadow: var(--shadow);
      padding: 18px;
      --qk-art-size: clamp(78px, 13vmin, 138px);
    }

    .qk-choose-prompt[hidden] {
      display: block;
      visibility: hidden;
      pointer-events: none;
    }

    .qk-choose-answers {
      align-self: stretch;
      display: grid;
      grid-template-columns: repeat(var(--answer-count), minmax(120px, 1fr));
      gap: clamp(16px, 3vmin, 28px);
      align-items: center;
      justify-content: center;
      width: 100%;
    }

    .qk-choose-card {
      min-width: 120px;
      min-height: clamp(130px, 30vmin, 230px);
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      border-radius: 24px;
      border: 6px solid var(--white);
      background:
        linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.18) 48%, rgba(255,255,255,0)),
        var(--cream);
      box-shadow: var(--shadow);
      padding: clamp(14px, 2.4vmin, 24px);
      --qk-art-size: clamp(72px, 15vmin, 150px);
    }

    .qk-choose-card:nth-child(2n) { background-color: #e9fff1; }
    .qk-choose-card:nth-child(3n) { background-color: #fff0e6; }
    .qk-choose-card:nth-child(4n) { background-color: #eef1ff; }
    .qk-choose-card:active { transform: scale(.96); }

    .qk-choose-card-enter {
      animation: qk-choose-enter .46s cubic-bezier(.2,.8,.25,1.25) both;
      animation-delay: var(--enter-delay);
    }

    .qk-choose-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 4;
    }

    .qk-choose-again {
      display: inline-grid;
      grid-template-columns: 72px auto;
      align-items: center;
      gap: 14px;
      min-width: min(420px, 100%);
      background-color: var(--blue);
    }

    .qk-choose-play-icon {
      display: block;
      width: 72px;
      height: 72px;
      background: transparent url('${PLAY_IMG}') center / contain no-repeat;
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

    .qk-choose-bounce { animation: qk-choose-bounce .54s cubic-bezier(.2,.7,.2,1.3); }
    .qk-choose-wiggle { animation: qk-choose-wiggle .48s ease-in-out; }

    @media (orientation: portrait) {
      .qk-choose-stage {
        grid-template-rows: minmax(112px, auto) 1fr;
      }
      .qk-choose-answers {
        grid-template-columns: repeat(2, minmax(120px, min(38vw, 230px)));
        align-content: center;
      }
      .qk-choose-answers[style*="--answer-count: 2"] {
        grid-template-columns: repeat(2, minmax(120px, min(40vw, 230px)));
      }
    }

    @media (max-width: 560px) {
      .qk-choose-hud {
        grid-template-columns: 96px 1fr;
      }
      .qk-choose-progress {
        justify-self: end;
      }
      .qk-choose-card {
        border-radius: 20px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-choose-card-enter,
      .qk-choose-bounce,
      .qk-choose-wiggle,
      .qk-choose-burst span {
        animation: none !important;
      }
      .qk-choose * {
        transition: none !important;
      }
    }

    @keyframes qk-choose-enter {
      from { opacity: 0; transform: translateY(22px) scale(.92); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes qk-choose-bounce {
      0% { transform: scale(1); }
      38% { transform: scale(1.12, .9); }
      72% { transform: scale(.96, 1.08); }
      100% { transform: scale(1); }
    }

    @keyframes qk-choose-wiggle {
      0%, 100% { transform: translateX(0) rotate(0); }
      22% { transform: translateX(-9px) rotate(-2deg); }
      48% { transform: translateX(8px) rotate(2deg); }
      72% { transform: translateX(-5px) rotate(-1deg); }
    }

    @keyframes qk-choose-burst {
      0% { opacity: 1; transform: translate(-7px, -7px) scale(.8) rotate(0); }
      100% { opacity: 0; transform: translate(calc(var(--x) - 7px), calc(var(--y) - 7px)) scale(.25) rotate(160deg); }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
