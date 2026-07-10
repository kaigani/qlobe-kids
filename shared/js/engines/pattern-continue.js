// pattern-continue.js — archetype engine for "what comes next?" repeating
// patterns. Config supplies pattern data; this module owns the full loop,
// modeling playback, gentle retry, celebration, and the QLOBE_DEBUG hook.

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
  if (!mountEl) throw new Error('pattern-continue requires a mount element');
  installStyle();
  return new PatternContinueGame(config, mountEl);
}

class PatternContinueGame {
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
    this.currentRound = null;
    this.filledMissing = 0;
    this.currentCandidates = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.yumIndex = 0;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.targetMap = new Map();
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
    document.querySelectorAll('.qk-pattern-fly').forEach((el) => el.remove());
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
      engine: 'pattern-continue',
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
      <button class="qk-pattern-mode" type="button" data-mode="${escapeAttr(mode.id)}">
        <span class="qk-pattern-mode-title">${escapeHtml(mode.title)}</span>
      </button>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-pattern qk-pattern-splash" aria-label="${escapeAttr(this.config.title)}">
        <a class="qk-pattern-home qk-pattern-img-btn qk-pattern-home-splash" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-pattern-splash-center">
          <div class="qk-pattern-splash-emoji" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.title)}</h1>
          <div class="qk-pattern-mode-list">${buttons}</div>
        </div>
      </section>
    `;

    this.mountEl.querySelectorAll('.qk-pattern-mode').forEach((button) => {
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
    this.roundItems = pickRounds(mode, this.rng);
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
      <span class="qk-pattern-dot" data-dot="${i}" aria-hidden="true"></span>
    `).join('');

    this.mountEl.innerHTML = `
      <section class="qk-pattern qk-pattern-play" aria-label="${escapeAttr(this.mode.title)}">
        <header class="qk-pattern-hud">
          <a class="qk-pattern-home qk-pattern-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
          <div class="qk-pattern-progress" aria-hidden="true">${dots}</div>
        </header>
        <main class="qk-pattern-stage">
          <div class="qk-pattern-prompt" aria-live="polite">${escapeHtml(this.mode.prompt)}</div>
          <div class="qk-pattern-row" aria-label="${escapeAttr(this.config.copy.pattern)}"></div>
          <div class="qk-pattern-candidates" aria-label="${escapeAttr(this.config.copy.candidates)}"></div>
        </main>
        <button class="qk-pattern-sound qk-pattern-img-btn" type="button" aria-label="${escapeAttr(this.config.copy.replay)}"></button>
      </section>
    `;

    const sound = this.mountEl.querySelector('.qk-pattern-sound');
    sound.addEventListener('pointerdown', (e) => e.stopPropagation());
    sound.addEventListener('click', () => this.replayPromptFromHud());
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play') return;
    this.clearIdleTimer();
    this.roundIndex = index;
    this.currentRound = this.roundItems[index];
    this.filledMissing = 0;
    this.awaitingInput = false;
    this.inputLocked = true;
    this.idlePrompted = false;

    this.updateDots();
    this.renderRound();
    await this.speakLine(this.mode.prompt, true);
    await this.performPattern({ slow: false });
    if (this.destroyed || this.screen !== 'play') return;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
  }

  renderRound() {
    this.targetMap.clear();
    this.renderPattern();
    this.renderCandidates();
  }

  renderPattern() {
    const row = this.mountEl.querySelector('.qk-pattern-row');
    row.innerHTML = '';

    this.currentRound.pattern.forEach((unitId, index) => {
      const visible = index < this.visibleCount();
      const current = index === this.currentEmptyIndex();
      const unit = this.currentRound.units[unitId] || fallbackUnit(unitId);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'qk-pattern-cell';
      cell.dataset.targetId = `cell:${index}`;
      cell.dataset.index = String(index);
      cell.setAttribute('aria-label', visible ? (unit.say || unitId) : this.config.copy.empty);
      cell.classList.toggle('is-empty', !visible);
      cell.classList.toggle('is-current', current);

      if (visible) cell.appendChild(artEl(unit.art, unit.alt || unit.say || unitId));
      else cell.innerHTML = '<span class="qk-pattern-hole" aria-hidden="true"></span>';

      cell.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.tapTarget(`cell:${index}`);
      });
      row.appendChild(cell);

      this.targetMap.set(`cell:${index}`, {
        id: `cell:${index}`,
        role: 'neutral',
        type: 'cell',
        el: cell,
        action: () => this.replayPatternFromCell(),
      });
    });
  }

  renderCandidates() {
    const candidatesEl = this.mountEl.querySelector('.qk-pattern-candidates');
    candidatesEl.innerHTML = '';
    for (const [id, target] of this.targetMap) {
      if (target.type === 'candidate') this.targetMap.delete(id);
    }
    this.currentCandidates = this.pickCandidatesForCurrentEmpty();
    candidatesEl.style.setProperty('--candidate-count', String(this.currentCandidates.length));

    this.currentCandidates.forEach((unitId, index) => {
      const id = `cand:${unitId}`;
      const unit = this.currentRound.units[unitId] || fallbackUnit(unitId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'qk-pattern-candidate qk-pattern-candidate-enter';
      button.style.setProperty('--enter-delay', `${index * 70}ms`);
      button.dataset.targetId = id;
      button.dataset.unit = unitId;
      button.setAttribute('aria-label', unit.say || unitId);
      button.appendChild(artEl(unit.art, unit.alt || unit.say || unitId));
      candidatesEl.appendChild(button);

      this.targetMap.set(id, {
        id,
        role: this.roleForUnit(unitId),
        type: 'candidate',
        unitId,
        el: button,
        action: () => this.handleCandidate(id),
      });

      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.tapTarget(id);
      });
    });
  }

  pickCandidatesForCurrentEmpty() {
    const correct = this.currentCorrectUnit();
    const base = unique([
      correct,
      ...this.currentRound.candidates,
      ...this.currentRound.pattern.slice(this.visibleBaseCount()),
    ].filter(Boolean));
    const wrongs = base.filter((unitId) => unitId !== correct);
    const count = clamp(this.currentRound.candidateCount, 2, 3);
    return shuffle([correct, ...shuffle(wrongs, this.rng).slice(0, count - 1)], this.rng);
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed) return { accepted: false };
    await target.action();
    return { accepted: true };
  }

  async handleCandidate(targetId) {
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
    const emptyIndex = this.currentEmptyIndex();
    const cell = this.cellEl(emptyIndex);

    this.playSfx('pop');
    animateOnce(target.el, 'qk-pattern-bounce');
    await this.flyCandidateToCell(target.el, cell);
    this.filledMissing += 1;
    this.renderPattern();
    this.playSfx('whoosh');
    await this.performPattern({ slow: false });

    if (this.filledMissing >= this.currentRound.missing) {
      this.playSfx('sparkle');
      this.createBurst(this.cellEl(this.currentRound.pattern.length - 1), 20);
      const yums = this.config.voice.yums;
      if (yums.length) {
        const line = yums[this.yumIndex % yums.length];
        this.yumIndex += 1;
        await this.speakLine(line, true);
      }
      await wait(this.shortDelay(380));
      const next = this.roundIndex + 1;
      if (next >= this.roundsTotal) await this.finishGame();
      else await this.showRound(next);
      return;
    }

    this.renderCandidates();
    this.awaitingInput = true;
    this.inputLocked = false;
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
  }

  async handleWrong(target) {
    this.inputLocked = true;
    this.playSfx('boing');
    animateOnce(target.el, 'qk-pattern-wiggle');
    await this.speakLine(this.config.voice.nudge, true);
    await this.performPattern({ slow: true });
    if (this.destroyed || this.screen !== 'play') return;
    this.inputLocked = false;
    this.awaitingInput = true;
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
  }

  async flyCandidateToCell(candidateEl, cellEl) {
    if (!candidateEl || !cellEl || this.reducedMotion()) {
      await wait(this.shortDelay(80));
      return;
    }

    const from = candidateEl.getBoundingClientRect();
    const to = cellEl.getBoundingClientRect();
    const clone = candidateEl.cloneNode(true);
    clone.className = 'qk-pattern-fly';
    clone.style.left = `${from.left}px`;
    clone.style.top = `${from.top}px`;
    clone.style.width = `${from.width}px`;
    clone.style.height = `${from.height}px`;
    document.body.appendChild(clone);
    candidateEl.classList.add('is-flying-source');

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const scale = Math.max(0.62, Math.min(1, to.width / Math.max(1, from.width)));
    const duration = this.shortDelay(520);

    try {
      const animation = clone.animate([
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${dx * 0.55}px, ${dy * 0.55 - 42}px) scale(${(1 + scale) / 2})`, opacity: 1, offset: 0.62 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.96 },
      ], {
        duration,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'forwards',
      });
      await animation.finished;
    } catch {
      await wait(duration);
    } finally {
      clone.remove();
      candidateEl.classList.remove('is-flying-source');
    }
  }

  async performPattern({ slow }) {
    const count = this.visibleCount();
    const delay = this.patternDelay(slow);
    for (let index = 0; index < count; index++) {
      if (this.destroyed || this.screen !== 'play') return;
      const unitId = this.currentRound.pattern[index];
      const unit = this.currentRound.units[unitId] || fallbackUnit(unitId);
      const cell = this.cellEl(index);
      if (cell) {
        animateOnce(cell, 'qk-pattern-perform');
        this.createBeat(cell, index);
      }
      this.playSfx(unit.sfx || 'tick');
      await this.speakLine(unit.say || unitId, true);
      await wait(delay);
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
    if (this.screen !== 'play' || !this.currentRound || this.inputLocked) return;
    const wasAwaiting = this.awaitingInput;
    this.clearIdleTimer();
    this.inputLocked = true;
    this.awaitingInput = false;
    await this.speakLine(this.mode.prompt, true);
    await this.performPattern({ slow: true });
    if (this.destroyed || this.screen !== 'play') return;
    this.awaitingInput = wasAwaiting;
    this.inputLocked = false;
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
  }

  async replayPatternFromCell() {
    if (this.screen !== 'play' || this.inputLocked) return;
    const wasAwaiting = this.awaitingInput;
    this.clearIdleTimer();
    this.inputLocked = true;
    this.awaitingInput = false;
    await this.performPattern({ slow: true });
    if (this.destroyed || this.screen !== 'play') return;
    this.awaitingInput = wasAwaiting;
    this.inputLocked = false;
    this.updateTargetRoles();
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.replayPrompt();
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
      <section class="qk-pattern qk-pattern-end" aria-label="${escapeAttr(this.config.voice.cheer)}">
        <a class="qk-pattern-home qk-pattern-img-btn" href="../../" aria-label="${escapeAttr(this.config.copy.home)}"></a>
        <div class="qk-pattern-end-center">
          <div class="qk-pattern-end-emoji" aria-hidden="true">${escapeHtml(this.config.splashEmoji)}</div>
          <h1>${escapeHtml(this.config.voice.cheer)}</h1>
          <button class="qk-pattern-again" type="button">
            <span class="qk-pattern-play-icon" aria-hidden="true"></span>
            <span>${escapeHtml(this.config.copy.playAgain)}</span>
          </button>
        </div>
      </section>
    `;
    const again = this.mountEl.querySelector('.qk-pattern-again');
    again.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.unlockAudio();
      this.playSfx('tick');
    });
    again.addEventListener('click', () => {
      if (this.mode) this.startMode(this.mode.id);
      else this.renderSplash();
    });
    this.createBurst(this.mountEl.querySelector('.qk-pattern-end-emoji'), 34);
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-pattern-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  updateTargetRoles() {
    for (const target of this.targetMap.values()) {
      if (target.type === 'candidate') target.role = this.roleForUnit(target.unitId);
      else target.role = 'neutral';
    }
  }

  createBeat(anchor, index) {
    if (!anchor || this.reducedMotion() || this.muted) return;
    const beat = document.createElement('span');
    beat.className = 'qk-pattern-beat';
    beat.style.setProperty('--beat-hue', String((index * 58 + 35) % 360));
    anchor.appendChild(beat);
    window.setTimeout(() => beat.remove(), 520);
  }

  createBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-pattern') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burst = document.createElement('div');
    burst.className = 'qk-pattern-burst';
    burst.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;

    for (let i = 0; i < count; i++) {
      const piece = document.createElement('span');
      const angle = (Math.PI * 2 * i) / count;
      const distance = 64 + this.fxRng() * 88;
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
    const startRound = this.roundIndex;
    while (this.screen === 'play' && this.roundIndex === startRound && this.filledMissing < this.currentRound.missing) {
      const correct = this.currentCorrectUnit();
      const target = this.targetMap.get(`cand:${correct}`);
      if (!target) return;
      await this.tapTarget(target.id);
    }
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
    await speech.speak(line, { rate: 0.82, pitch: 1.06, cancel });
  }

  playSfx(name) {
    if (this.muted || !sfx[name]) return;
    sfx[name]();
  }

  visibleBaseCount() {
    return this.currentRound.pattern.length - this.currentRound.missing;
  }

  visibleCount() {
    return this.visibleBaseCount() + this.filledMissing;
  }

  currentEmptyIndex() {
    return this.visibleCount();
  }

  currentCorrectUnit() {
    return this.currentRound.pattern[this.currentEmptyIndex()];
  }

  roleForUnit(unitId) {
    return unitId === this.currentCorrectUnit() ? 'correct' : 'wrong';
  }

  cellEl(index) {
    return this.mountEl.querySelector(`.qk-pattern-cell[data-index="${index}"]`);
  }

  patternDelay(slow) {
    if (this.muted || this.reducedMotion()) return slow ? 80 : 45;
    return slow ? 180 : 90;
  }

  shortDelay(ms) {
    if (this.muted || this.reducedMotion()) return Math.min(ms, 90);
    return ms;
  }

  reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
}

function normalizeConfig(config) {
  const copy = {
    home: 'Home',
    replay: 'Hear the pattern again',
    playAgain: 'Play Again',
    pattern: 'Pattern',
    candidates: 'Choices',
    empty: 'Empty spot',
    ...(config.copy || {}),
  };
  const voice = {
    intro: '',
    nudge: 'Listen to the pattern. Try another one.',
    cheer: 'Hooray! You made the patterns!',
    yums: ['Yes! The pattern keeps going!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice!')];

  const rawModes = Array.isArray(config.modes) && config.modes.length
    ? config.modes
    : [config];

  return {
    id: config.id || 'pattern-continue',
    title: config.title || 'Pattern Train',
    splashEmoji: config.splashEmoji || '🚂',
    ...config,
    copy,
    voice,
    modes: rawModes.map((mode, index) => normalizeMode(mode, index)),
  };
}

function normalizeMode(mode, index) {
  const rawRounds = mode.rounds_spec || mode.items || mode.patterns || [];
  const rounds = rawRounds.map(normalizeRound).filter(Boolean);
  return {
    id: mode.id || `mode-${index + 1}`,
    title: mode.title || 'Patterns',
    prompt: mode.prompt || 'What comes next? Watch the pattern!',
    difficultyRamp: Boolean(mode.difficultyRamp),
    ...mode,
    rounds: Math.min(Number(mode.rounds) || rounds.length, rounds.length),
    rounds_spec: rounds,
  };
}

function normalizeRound(round) {
  if (!round || !Array.isArray(round.pattern) || round.pattern.length < 3) return null;
  const pattern = round.pattern.map((unitId) => String(unitId));
  const units = {};
  const rawUnits = round.units || {};

  unique(pattern.concat(Object.keys(rawUnits))).forEach((unitId) => {
    const unit = rawUnits[unitId] || {};
    units[unitId] = {
      art: unit.art || `text:${unitId}`,
      alt: unit.alt || unit.say || unitId,
      say: unit.say || unit.alt || unitId,
      sfx: unit.sfx || 'tick',
    };
  });

  const missing = clamp(Number(round.missing) || 1, 1, Math.min(2, pattern.length - 1));
  const candidates = unique((round.candidates || Object.keys(units)).map((unitId) => String(unitId)));
  const hidden = pattern.slice(pattern.length - missing);

  return {
    ...round,
    pattern,
    missing,
    units,
    candidates: unique(candidates.concat(hidden)),
    candidateCount: clamp(Number(round.candidateCount) || Math.max(2, Math.min(3, candidates.length || Object.keys(units).length)), 2, 3),
    difficultyScore: difficultyScore(pattern, missing),
  };
}

function pickRounds(mode, rng) {
  let rounds = mode.rounds_spec.slice();
  if (mode.difficultyRamp) {
    rounds = rounds
      .map((round, index) => ({ round, index }))
      .sort((a, b) => a.round.difficultyScore - b.round.difficultyScore || a.index - b.index)
      .map((entry) => entry.round);
  } else {
    rounds = shuffle(rounds, rng);
  }
  return rounds.slice(0, mode.rounds);
}

function difficultyScore(pattern, missing) {
  const motif = repeatingMotif(pattern);
  const uniqueCount = unique(motif).length;
  return (missing - 1) * 100 + motif.length * 10 + uniqueCount;
}

function repeatingMotif(pattern) {
  for (let size = 1; size <= Math.min(4, pattern.length); size++) {
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] !== pattern[i % size]) {
        ok = false;
        break;
      }
    }
    if (ok) return pattern.slice(0, size);
  }
  return pattern.slice(0, Math.min(4, pattern.length));
}

function fallbackUnit(unitId) {
  return { art: `text:${unitId}`, alt: unitId, say: unitId, sfx: 'tick' };
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

function unique(list) {
  return Array.from(new Set(list));
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

function animateOnce(el, className) {
  if (!el) return;
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
  if (styleInstalled || document.getElementById('qk-pattern-style')) {
    styleInstalled = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'qk-pattern-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-pattern, .qk-pattern * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-pattern {
      --sky: #bee3f5;
      --navy: #17517e;
      --blue: #2d7dd2;
      --green: #2e9f76;
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
        linear-gradient(180deg, rgba(255,255,255,.36), rgba(255,255,255,0) 42%),
        radial-gradient(circle at 18% 20%, rgba(255,248,232,.72) 0 9px, transparent 10px),
        radial-gradient(circle at 72% 18%, rgba(129,214,163,.42) 0 12px, transparent 13px),
        radial-gradient(circle at 45% 82%, rgba(255,173,122,.36) 0 10px, transparent 11px);
      background-size: auto, 180px 180px, 250px 250px, 220px 220px;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
    }

    .qk-pattern button, .qk-pattern a {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    .qk-pattern button {
      border: 0;
      cursor: pointer;
    }

    .qk-pattern button:focus-visible,
    .qk-pattern a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .65);
      outline-offset: 4px;
    }

    .qk-pattern-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
    }

    .qk-pattern-img-btn:active { transform: scale(.93); }
    .qk-pattern-home { background-image: url('${HOME_IMG}'); }
    .qk-pattern-sound { background-image: url('${SOUND_IMG}'); }

    .qk-pattern-splash,
    .qk-pattern-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }

    .qk-pattern-home {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 4;
    }

    .qk-pattern-splash-center,
    .qk-pattern-end-center {
      width: min(900px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(14px, 2.5vmin, 24px);
      text-align: center;
      padding-top: 54px;
    }

    .qk-pattern-splash-emoji,
    .qk-pattern-end-emoji {
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

    .qk-pattern h1 {
      margin: 0;
      font-size: clamp(38px, 7vmin, 78px);
      line-height: .98;
      letter-spacing: 0;
      color: var(--navy);
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
      max-width: 12ch;
    }

    .qk-pattern-mode-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px;
      width: min(760px, 100%);
      margin-top: 6px;
    }

    .qk-pattern-mode,
    .qk-pattern-again {
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

    .qk-pattern-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-pattern-mode:nth-child(3n) { background-color: var(--green); }
    .qk-pattern-mode:active,
    .qk-pattern-again:active { transform: scale(.96); }

    .qk-pattern-play {
      display: grid;
      grid-template-rows: auto 1fr;
      padding: max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(112px, calc(100px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }

    .qk-pattern-hud {
      position: relative;
      z-index: 3;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 100px;
    }

    .qk-pattern-hud .qk-pattern-home {
      position: static;
      grid-column: 1;
    }

    .qk-pattern-progress {
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

    .qk-pattern-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(255,255,255,.9);
      box-shadow: inset 0 -2px 0 rgba(23,81,126,.12);
      opacity: .8;
    }

    .qk-pattern-dot.is-filled {
      background: var(--mint);
      opacity: 1;
    }

    .qk-pattern-dot.is-current {
      background: var(--peach);
      opacity: 1;
      transform: scale(1.16);
    }

    .qk-pattern-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(116px, auto) 1fr;
      align-items: center;
      gap: clamp(16px, 3vmin, 30px);
      width: min(1120px, 100%);
      justify-self: center;
    }

    .qk-pattern-prompt {
      justify-self: center;
      max-width: min(760px, 100%);
      min-height: 42px;
      padding: 0 12px;
      font-size: clamp(22px, 3.4vmin, 36px);
      line-height: 1.08;
      text-align: center;
      text-shadow: 0 3px 0 rgba(255,255,255,.72);
    }

    .qk-pattern-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: clamp(10px, 1.8vmin, 18px);
      min-height: 116px;
      width: 100%;
    }

    .qk-pattern-cell {
      position: relative;
      display: grid;
      place-items: center;
      flex: 0 0 clamp(96px, 13vmin, 132px);
      width: clamp(96px, 13vmin, 132px);
      aspect-ratio: 1;
      border-radius: 24px;
      border: 5px solid var(--white);
      background:
        linear-gradient(180deg, rgba(255,255,255,.8), rgba(255,255,255,.2) 54%, rgba(255,255,255,0)),
        var(--cream);
      box-shadow: var(--shadow);
      padding: clamp(10px, 1.7vmin, 16px);
      --qk-art-size: clamp(54px, 8vmin, 86px);
    }

    .qk-pattern-cell.is-empty {
      background: rgba(255,255,255,.25);
      border: 5px dashed rgba(23, 81, 126, .42);
      box-shadow: inset 0 0 0 5px rgba(255,255,255,.42);
    }

    .qk-pattern-cell.is-current {
      outline: 6px solid rgba(244,197,61,.7);
      outline-offset: 3px;
    }

    .qk-pattern-hole {
      width: 46%;
      height: 46%;
      border-radius: 50%;
      background: rgba(255,255,255,.56);
      box-shadow: inset 0 -4px 0 rgba(23,81,126,.12);
    }

    .qk-pattern-candidates {
      align-self: stretch;
      display: grid;
      grid-template-columns: repeat(var(--candidate-count), minmax(112px, 1fr));
      gap: clamp(16px, 3vmin, 28px);
      align-items: center;
      justify-content: center;
      width: min(820px, 100%);
      justify-self: center;
    }

    .qk-pattern-candidate {
      min-width: 112px;
      min-height: clamp(126px, 28vmin, 220px);
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      border-radius: 24px;
      border: 6px solid var(--white);
      background:
        linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.18) 48%, rgba(255,255,255,0)),
        #e9fff1;
      box-shadow: var(--shadow);
      padding: clamp(14px, 2.4vmin, 24px);
      --qk-art-size: clamp(70px, 14vmin, 146px);
    }

    .qk-pattern-candidate:nth-child(2n) { background-color: #fff0e6; }
    .qk-pattern-candidate:nth-child(3n) { background-color: #eef1ff; }
    .qk-pattern-candidate:active { transform: scale(.96); }
    .qk-pattern-candidate.is-flying-source { opacity: .35; }

    .qk-pattern-candidate-enter {
      animation: qk-pattern-enter .46s cubic-bezier(.2,.8,.25,1.25) both;
      animation-delay: var(--enter-delay);
    }

    .qk-pattern-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 4;
    }

    .qk-pattern-again {
      display: inline-grid;
      grid-template-columns: 72px auto;
      align-items: center;
      gap: 14px;
      min-width: min(420px, 100%);
      background-color: var(--blue);
    }

    .qk-pattern-play-icon {
      display: block;
      width: 72px;
      height: 72px;
      background: transparent url('${PLAY_IMG}') center / contain no-repeat;
    }

    .qk-pattern-fly {
      position: fixed;
      z-index: 30;
      display: grid;
      place-items: center;
      border-radius: 24px;
      border: 6px solid #ffffff;
      background:
        linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.18) 48%, rgba(255,255,255,0)),
        #fff8e8;
      box-shadow: 0 6px 0 rgba(23, 81, 126, .18), 0 14px 30px rgba(23, 81, 126, .18);
      padding: 16px;
      pointer-events: none;
      --qk-art-size: clamp(54px, 11vmin, 112px);
    }

    .qk-pattern-beat {
      position: absolute;
      inset: -8px;
      border-radius: inherit;
      border: 7px solid hsla(var(--beat-hue), 82%, 58%, .55);
      pointer-events: none;
      animation: qk-pattern-beat .48s ease-out both;
    }

    .qk-pattern-burst {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 5;
      pointer-events: none;
    }

    .qk-pattern-burst span {
      position: absolute;
      width: 14px;
      height: 14px;
      border-radius: 5px;
      background: hsl(var(--hue), 82%, 62%);
      animation: qk-pattern-burst .78s ease-out both;
      animation-delay: var(--delay);
    }

    .qk-pattern-bounce { animation: qk-pattern-bounce .54s cubic-bezier(.2,.7,.2,1.3); }
    .qk-pattern-wiggle { animation: qk-pattern-wiggle .48s ease-in-out; }
    .qk-pattern-perform { animation: qk-pattern-perform .44s cubic-bezier(.2,.7,.2,1.3); }

    @media (orientation: portrait) {
      .qk-pattern-stage {
        grid-template-rows: auto minmax(210px, auto) 1fr;
      }
      .qk-pattern-candidates {
        grid-template-columns: repeat(var(--candidate-count), minmax(112px, min(28vw, 210px)));
      }
    }

    @media (max-width: 560px) {
      .qk-pattern-hud {
        grid-template-columns: 96px 1fr;
      }
      .qk-pattern-progress {
        justify-self: end;
      }
      .qk-pattern-candidates {
        grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
      }
      .qk-pattern-cell,
      .qk-pattern-candidate {
        border-radius: 20px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-pattern-candidate-enter,
      .qk-pattern-bounce,
      .qk-pattern-wiggle,
      .qk-pattern-perform,
      .qk-pattern-beat,
      .qk-pattern-burst span {
        animation: none !important;
      }
      .qk-pattern * {
        transition: none !important;
      }
    }

    @keyframes qk-pattern-enter {
      from { opacity: 0; transform: translateY(22px) scale(.92); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes qk-pattern-bounce {
      0% { transform: scale(1); }
      38% { transform: scale(1.12, .9); }
      72% { transform: scale(.96, 1.08); }
      100% { transform: scale(1); }
    }

    @keyframes qk-pattern-wiggle {
      0%, 100% { transform: translateX(0) rotate(0); }
      22% { transform: translateX(-9px) rotate(-2deg); }
      48% { transform: translateX(8px) rotate(2deg); }
      72% { transform: translateX(-5px) rotate(-1deg); }
    }

    @keyframes qk-pattern-perform {
      0% { transform: translateY(0) scale(1); }
      42% { transform: translateY(-14px) scale(1.08, .94); }
      100% { transform: translateY(0) scale(1); }
    }

    @keyframes qk-pattern-beat {
      0% { opacity: .75; transform: scale(.92); }
      100% { opacity: 0; transform: scale(1.22); }
    }

    @keyframes qk-pattern-burst {
      0% { opacity: 1; transform: translate(-7px, -7px) scale(.8) rotate(0); }
      100% { opacity: 0; transform: translate(calc(var(--x) - 7px), calc(var(--y) - 7px)) scale(.25) rotate(160deg); }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
