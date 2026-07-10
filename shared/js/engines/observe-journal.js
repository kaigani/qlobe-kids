// observe-journal.js — archetype engine for "look, think, record".
// A scene prompt invites observation, every sticker is accepted, and the
// finished pages replay as a gentle journal recap.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { artEl } from './art.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;

const HOME_HREF = '../../';
const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;

let styleReady = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('observe-journal requires a mount element');
  injectStyle();
  return new ObserveJournalGame(config, mountEl);
}

class ObserveJournalGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config || {});
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;

    this.screen = 'splash';
    this.mode = null;
    this.pages = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.promptIndex = 0;
    this.currentPage = null;
    this.currentPrompt = null;
    this.stamps = [];
    this.journal = [];
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.destroyed = false;
    this.seeded = false;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.targetMap = new Map();
    this.timerIds = new Set();
    this.rng = Math.random;

    this.onFirstPointer = () => this.unlockAudio();
    this.preventGesture = (e) => e.preventDefault();
    window.addEventListener('pointerdown', this.onFirstPointer, { passive: true });
    window.addEventListener('gesturestart', this.preventGesture);
    window.addEventListener('contextmenu', this.preventGesture);

    this.ready = Promise.resolve();
    this.renderSplash();
    this.installDebug();
  }

  destroy() {
    this.destroyed = true;
    this.clearTimers();
    speech.stop();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('gesturestart', this.preventGesture);
    window.removeEventListener('contextmenu', this.preventGesture);
    this.targetMap.clear();
    this.mountEl.replaceChildren();
    if (window.QLOBE_DEBUG === this.debug) {
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

  installDebug() {
    this.debug = {
      version: 1,
      gameId: this.config.id,
      engine: 'observe-journal',
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
    window.QLOBE_DEBUG = this.debug;
  }

  renderSplash() {
    this.clearTimers();
    speech.stop();
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    this.mountEl.classList.add('qk-observe-root');
    this.mountEl.replaceChildren();

    const section = el('section', 'qk-observe qk-observe-splash');
    section.setAttribute('aria-label', this.config.title);

    const home = imageLink('qk-observe-home', HOME_IMG, this.config.copy.home);
    home.href = HOME_HREF;
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const center = el('div', 'qk-observe-splash-center');
    const artCard = el('div', 'qk-observe-splash-art');
    artCard.appendChild(artEl(this.config.splashArt, this.config.title));
    const title = el('h1', 'qk-observe-title', this.config.title);
    const modes = el('div', 'qk-observe-mode-list');

    for (const mode of this.config.modes) {
      const button = el('button', 'qk-observe-mode', mode.title);
      button.type = 'button';
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.playSfx('tick');
        this.startMode(mode.id);
      });
      modes.appendChild(button);
    }

    center.append(artCard, title, modes);
    section.append(home, center);
    this.mountEl.appendChild(section);
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;
    const mode = this.config.modes.find((item) => item.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearTimers();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
    this.roundIndex = 0;
    this.promptIndex = 0;
    this.journal = [];
    this.stamps = [];
    this.inputLocked = false;
    this.pages = mode.pages.slice(0, Math.min(mode.rounds || mode.pages.length, mode.pages.length));
    this.roundsTotal = this.pages.length;

    if (!this.roundsTotal) {
      await this.finishGame();
      return;
    }

    this.renderPlayShell();
    await this.showRound(0);
  }

  renderPlayShell() {
    const section = el('section', 'qk-observe qk-observe-play');
    section.setAttribute('aria-label', this.mode.title);

    const header = el('header', 'qk-observe-hud');
    const home = imageLink('qk-observe-home', HOME_IMG, this.config.copy.home);
    home.href = HOME_HREF;
    home.addEventListener('pointerdown', (e) => e.stopPropagation());
    const dots = el('div', 'qk-observe-dots');
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < this.roundsTotal; i++) dots.appendChild(el('span', 'qk-observe-dot'));
    header.append(home, dots, el('span', 'qk-observe-hud-spacer'));

    const stage = el('main', 'qk-observe-stage');
    const page = el('div', 'qk-observe-page');
    const scene = el('button', 'qk-observe-scene');
    scene.type = 'button';
    scene.dataset.targetId = 'scene';
    scene.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      this.tapTarget('scene');
    });
    const stampLayer = el('div', 'qk-observe-stamps');
    stampLayer.setAttribute('aria-hidden', 'true');
    page.append(scene, stampLayer);
    const prompt = el('div', 'qk-observe-prompt');
    const stickers = el('div', 'qk-observe-stickers');
    stage.append(page, prompt, stickers);

    const sound = imageButton('qk-observe-sound', SOUND_IMG, this.config.copy.replay);
    sound.addEventListener('pointerdown', (e) => e.stopPropagation());
    sound.addEventListener('click', () => this.replayFromHud());

    section.append(header, stage, sound);
    this.mountEl.replaceChildren(section);
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play') return;
    this.clearTimers();
    this.roundIndex = index;
    this.promptIndex = 0;
    this.currentPage = this.pages[index];
    this.stamps = [];
    this.journal[index] = { page: this.currentPage, stamps: this.stamps };
    this.inputLocked = false;

    this.renderPage();
    await this.showPrompt(0, true);
  }

  renderPage() {
    this.updateDots();
    this.targetMap.clear();

    const scene = this.mountEl.querySelector('.qk-observe-scene');
    scene.replaceChildren();
    scene.appendChild(sceneArtEl(this.currentPage.scene, this.currentPage.alt || this.currentPage.say || ''));
    scene.classList.remove('qk-observe-scene-enter');
    void scene.offsetWidth;
    scene.classList.add('qk-observe-scene-enter');

    this.targetMap.set('scene', {
      id: 'scene',
      role: 'neutral',
      el: scene,
      action: () => this.replayPrompt(),
    });

    this.mountEl.querySelector('.qk-observe-stamps').replaceChildren();
  }

  async showPrompt(index, includeIntro = false) {
    if (this.destroyed || !this.currentPage) return;
    this.clearTimers();
    this.promptIndex = index;
    this.currentPrompt = this.currentPage.prompts[index];
    this.awaitingInput = true;
    this.inputLocked = false;
    this.idlePrompted = false;

    const promptText = this.currentPrompt.say || this.currentPage.say || '';
    const promptEl = this.mountEl.querySelector('.qk-observe-prompt');
    promptEl.textContent = promptText;
    this.renderStickers();

    const intro = includeIntro && this.roundIndex === 0 && this.mode.prompt ? this.mode.prompt + ' ' : '';
    this.speak(intro + promptText);
    this.scheduleIdlePrompt();
    await wait(40);
  }

  renderStickers() {
    const stickersEl = this.mountEl.querySelector('.qk-observe-stickers');
    stickersEl.replaceChildren();
    stickersEl.style.setProperty('--sticker-count', String(this.currentPrompt.stickers.length));

    this.currentPrompt.stickers.forEach((sticker, index) => {
      const id = `sticker:${index}`;
      const button = el('button', 'qk-observe-sticker qk-observe-sticker-enter');
      button.type = 'button';
      button.dataset.targetId = id;
      button.style.setProperty('--enter-delay', `${index * 65}ms`);
      button.setAttribute('aria-label', sticker.alt || sticker.say || '');
      button.appendChild(artEl(sticker.art, sticker.alt || sticker.say || ''));
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.tapTarget(id);
      });
      stickersEl.appendChild(button);

      this.targetMap.set(id, {
        id,
        role: 'correct',
        type: 'sticker',
        el: button,
        sticker,
        stickerIndex: index,
        action: () => this.chooseSticker(index),
      });
    });
  }

  async tapTarget(targetId) {
    const target = this.targetMap.get(targetId);
    if (!target || this.destroyed) return { accepted: false };
    await target.action();
    return { accepted: true };
  }

  async chooseSticker(index) {
    if (!this.awaitingInput || this.inputLocked || !this.currentPrompt) return { accepted: false };
    const target = this.targetMap.get(`sticker:${index}`);
    if (!target) return { accepted: false };

    this.clearTimers();
    this.inputLocked = true;
    this.awaitingInput = false;
    this.playSfx('pop');
    this.playSfx('sparkle');
    this.animate(target.el, 'qk-observe-picked');
    this.addStamp(target.sticker, index);
    await this.speak(target.sticker.say || this.config.voice.yum);
    await wait(this.shortDelay(520));

    const nextPrompt = this.promptIndex + 1;
    if (nextPrompt < this.currentPage.prompts.length) {
      await this.showPrompt(nextPrompt);
      return { accepted: true };
    }

    const nextRound = this.roundIndex + 1;
    if (nextRound >= this.roundsTotal) await this.finishGame();
    else await this.showRound(nextRound);
    return { accepted: true };
  }

  addStamp(sticker, stickerIndex) {
    const layer = this.mountEl.querySelector('.qk-observe-stamps');
    const stamp = el('div', 'qk-observe-stamp');
    const position = this.nextStampPosition();
    stamp.style.left = `${position.x}%`;
    stamp.style.top = `${position.y}%`;
    stamp.style.setProperty('--turn', `${position.turn}deg`);
    stamp.appendChild(artEl(sticker.art, sticker.alt || sticker.say || ''));
    layer.appendChild(stamp);

    this.stamps.push({
      art: sticker.art,
      alt: sticker.alt || sticker.say || '',
      say: sticker.say || '',
      promptIndex: this.promptIndex,
      stickerIndex,
      x: position.x,
      y: position.y,
      turn: position.turn,
    });
  }

  nextStampPosition() {
    const count = this.stamps.length;
    const base = [
      { x: 70, y: 68 },
      { x: 28, y: 70 },
      { x: 74, y: 34 },
      { x: 30, y: 32 },
    ][count % 4];
    return {
      x: clamp(base.x + (this.rng() * 10 - 5), 18, 82),
      y: clamp(base.y + (this.rng() * 10 - 5), 20, 82),
      turn: Math.round(this.rng() * 16 - 8),
    };
  }

  replayFromHud() {
    const now = performance.now();
    if (now - this.lastReplay < REPLAY_DEBOUNCE_MS) return;
    this.lastReplay = now;
    this.playSfx('tick');
    this.replayPrompt();
  }

  async replayPrompt() {
    if (this.screen !== 'play' || !this.currentPrompt) return;
    this.clearTimers();
    await this.speak(this.currentPrompt.say || this.currentPage.say || '');
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearTimers();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    const id = window.setTimeout(() => {
      this.timerIds.delete(id);
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.speak(this.currentPrompt && (this.currentPrompt.say || this.currentPage.say));
    }, IDLE_MS);
    this.timerIds.add(id);
    this.idleTimer = id;
  }

  async finishGame() {
    if (this.destroyed) return;
    this.clearTimers();
    speech.stop();
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.targetMap.clear();
    this.renderRecap();
    await this.runRecap();
    this.playSfx('tada');
    this.createBurst();
    await this.speak(this.mode.cheer || this.config.voice.cheer);
  }

  renderRecap() {
    const section = el('section', 'qk-observe qk-observe-end');
    section.setAttribute('aria-label', this.mode.cheer || this.config.voice.cheer);
    const home = imageLink('qk-observe-home', HOME_IMG, this.config.copy.home);
    home.href = HOME_HREF;
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const title = el('h1', 'qk-observe-end-title', this.mode.endTitle || this.config.copy.recap);
    const book = el('div', 'qk-observe-book');
    const pageArt = el('div', 'qk-observe-recap-page');
    const stamps = el('div', 'qk-observe-recap-stamps');
    pageArt.append(stamps);
    book.append(pageArt);

    const again = el('button', 'qk-observe-again');
    again.type = 'button';
    const playIcon = el('span', 'qk-observe-play-icon');
    playIcon.setAttribute('aria-hidden', 'true');
    const againText = el('span', '', this.config.copy.playAgain);
    again.append(playIcon, againText);
    again.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      this.playSfx('tick');
      if (this.mode) this.startMode(this.mode.id);
      else this.renderSplash();
    });

    section.append(home, title, book, again);
    this.mountEl.replaceChildren(section);
    this.recapEls = { pageArt, stamps };
  }

  async runRecap() {
    if (!this.recapEls) return;
    const pages = this.journal.filter(Boolean);
    const pageDelay = this.shortDelay(720);
    for (let i = 0; i < pages.length; i++) {
      if (this.destroyed || this.screen !== 'end') return;
      const entry = pages[i];
      this.paintRecapPage(entry, i);
      this.playSfx('whoosh');
      for (const stamp of entry.stamps) {
        if (stamp && stamp.say) await this.speak(stamp.say);
      }
      await wait(pageDelay);
    }
  }

  paintRecapPage(entry, index) {
    this.recapEls.pageArt.classList.remove('qk-observe-page-flip');
    void this.recapEls.pageArt.offsetWidth;
    this.recapEls.pageArt.classList.add('qk-observe-page-flip');
    this.recapEls.pageArt.style.setProperty('--page-hue', String((index * 48) % 360));
    this.recapEls.stamps.replaceChildren();

    const scene = el('div', 'qk-observe-recap-scene');
    scene.appendChild(sceneArtEl(entry.page.scene, entry.page.alt || entry.page.say || ''));
    this.recapEls.stamps.appendChild(scene);

    for (const item of entry.stamps) {
      const stamp = el('div', 'qk-observe-stamp qk-observe-recap-stamp');
      stamp.style.left = `${item.x}%`;
      stamp.style.top = `${item.y}%`;
      stamp.style.setProperty('--turn', `${item.turn}deg`);
      stamp.appendChild(artEl(item.art, item.alt || ''));
      this.recapEls.stamps.appendChild(stamp);
    }
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-observe-dot').forEach((dot, index) => {
      dot.classList.toggle('is-done', index < this.roundIndex);
      dot.classList.toggle('is-now', index === this.roundIndex);
    });
  }

  createBurst() {
    if (this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-observe-end') || this.mountEl;
    const burst = el('div', 'qk-observe-burst');
    for (let i = 0; i < 20; i++) {
      const piece = el('span', 'qk-observe-spark');
      const angle = (Math.PI * 2 * i) / 20;
      const dist = 95 + this.rng() * 150;
      piece.style.setProperty('--x', `${Math.cos(angle) * dist}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * dist}px`);
      piece.style.setProperty('--hue', String(Math.floor(this.rng() * 360)));
      burst.appendChild(piece);
    }
    host.appendChild(burst);
    const id = window.setTimeout(() => {
      this.timerIds.delete(id);
      burst.remove();
    }, 900);
    this.timerIds.add(id);
  }

  animate(node, className) {
    if (!node || this.reducedMotion()) return;
    node.classList.remove(className);
    void node.offsetWidth;
    node.classList.add(className);
    const id = window.setTimeout(() => {
      this.timerIds.delete(id);
      node.classList.remove(className);
    }, 720);
    this.timerIds.add(id);
  }

  getState() {
    return {
      screen: this.screen,
      mode: this.mode ? this.mode.id : null,
      round: this.screen === 'play' ? this.roundIndex : this.roundsTotal,
      roundsTotal: this.roundsTotal,
      awaitingInput: this.awaitingInput,
      prompt: this.screen === 'play' ? this.promptIndex : 0,
    };
  }

  getTargets() {
    if (this.screen !== 'play') return [];
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
    const startingRound = this.roundIndex;
    while (this.screen === 'play' && this.roundIndex === startingRound) {
      const target = Array.from(this.targetMap.values()).find((entry) => entry.id.startsWith('sticker:'));
      if (!target) return;
      await this.tapTarget(target.id);
    }
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    this.seeded = true;
    this.rng = mulberry32(Number(n) || 1);
  }

  speak(text) {
    if (this.muted || !text) return Promise.resolve();
    return speech.speak(text, { rate: 0.8, pitch: 1.05, cancel: true });
  }

  playSfx(name) {
    if (this.muted || !name || typeof sfx[name] !== 'function') return;
    sfx[name]();
  }

  shortDelay(ms) {
    if (this.seeded || this.muted) return 60;
    return this.reducedMotion() ? Math.min(ms, 120) : ms;
  }

  reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  clearTimers() {
    if (this.idleTimer) this.idleTimer = 0;
    for (const id of this.timerIds) window.clearTimeout(id);
    this.timerIds.clear();
  }
}

function normalizeConfig(config) {
  const modes = Array.isArray(config.modes) && config.modes.length
    ? config.modes
    : [config];

  return {
    ...config,
    id: config.id || 'observe-journal',
    title: config.title || 'Observation Journal',
    splashArt: config.splashArt || config.splashEmoji || 'emoji:🔎',
    copy: {
      home: 'Home',
      replay: 'Hear it again',
      recap: 'My Journal',
      playAgain: 'Play Again',
      ...(config.copy || {}),
    },
    voice: {
      cheer: 'You made a journal!',
      yum: 'Nice observation!',
      ...(config.voice || {}),
    },
    modes: modes.map(normalizeMode).filter((mode) => mode.pages.length),
  };
}

function normalizeMode(mode) {
  const pages = (mode.pages || []).map(normalizePage).filter((page) => page.prompts.length);
  return {
    ...mode,
    id: mode.id || 'journal',
    title: mode.title || 'Journal',
    rounds: Math.min(Number(mode.rounds || pages.length), pages.length),
    pages,
  };
}

function normalizePage(page) {
  const prompts = [];
  if (Array.isArray(page.prompts)) {
    for (const prompt of page.prompts) {
      const normalized = normalizePrompt(prompt, page.say);
      if (normalized) prompts.push(normalized);
    }
  } else {
    const first = normalizePrompt({ say: page.say, stickers: page.stickers }, page.say);
    if (first) prompts.push(first);
    const second = normalizePrompt({
      say: page.secondSay || page.followupSay,
      stickers: page.secondStickers || page.followupStickers,
    }, page.secondSay || page.followupSay);
    if (second) prompts.push(second);
  }

  return {
    ...page,
    scene: page.scene || 'emoji:🔎',
    prompts,
  };
}

function normalizePrompt(prompt, fallbackSay) {
  const stickers = (prompt.stickers || [])
    .filter((item) => item && item.art)
    .slice(0, 5)
    .map((item) => ({ ...item, say: item.say || 'I see that!' }));
  if (!stickers.length) return null;
  return {
    ...prompt,
    say: prompt.say || fallbackSay || 'What do you notice?',
    stickers,
  };
}

function sceneArtEl(scene, alt) {
  const wrap = el('div', Array.isArray(scene) ? 'qk-observe-scene-cluster' : 'qk-observe-scene-single');
  const refs = Array.isArray(scene) ? scene : [scene || 'emoji:🔎'];
  refs.slice(0, 6).forEach((ref, index) => {
    const card = el('span', 'qk-observe-scene-card');
    card.style.setProperty('--cluster-delay', `${index * 70}ms`);
    card.appendChild(artEl(ref, alt));
    wrap.appendChild(card);
  });
  return wrap;
}

function imageButton(className, imageUrl, label) {
  const button = el('button', `qk-observe-img-btn ${className}`);
  button.type = 'button';
  button.style.backgroundImage = `url('${imageUrl}')`;
  button.setAttribute('aria-label', label);
  return button;
}

function imageLink(className, imageUrl, label) {
  const link = el('a', `qk-observe-img-btn ${className}`);
  link.style.backgroundImage = `url('${imageUrl}')`;
  link.setAttribute('aria-label', label);
  return link;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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

function injectStyle() {
  if (styleReady || document.getElementById('qk-observe-style')) {
    styleReady = true;
    return;
  }

  const style = document.createElement('style');
  style.id = 'qk-observe-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-observe-root, .qk-observe-root * {
      box-sizing: border-box;
      -webkit-tap-highlight-color: transparent;
    }

    .qk-observe {
      --navy: #17517e;
      --sky: #bee3f5;
      --cream: #fff8e8;
      --paper: #fffef8;
      --green: #58a945;
      --gold: #ffd166;
      --coral: #f25f5c;
      --purple: #7c4fc4;
      --blue: #2d7dd2;
      --shadow: 0 7px 0 rgba(23, 81, 126, .17), 0 16px 30px rgba(23, 81, 126, .17);
      position: relative;
      min-height: 100dvh;
      width: 100%;
      overflow: hidden;
      color: var(--navy);
      background-color: var(--sky);
      background-image:
        linear-gradient(180deg, rgba(255,255,255,.45), rgba(255,255,255,0) 44%),
        radial-gradient(circle at 18% 22%, rgba(255,255,255,.32) 0 11px, transparent 12px),
        radial-gradient(circle at 78% 28%, rgba(255,255,255,.26) 0 15px, transparent 16px);
      background-size: auto, 170px 170px, 230px 230px;
      font-family: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif;
      font-weight: 600;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
      touch-action: manipulation;
    }

    .qk-observe button, .qk-observe a {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    .qk-observe button {
      border: 0;
      cursor: pointer;
    }

    .qk-observe button:focus-visible,
    .qk-observe a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .62);
      outline-offset: 4px;
    }

    .qk-observe-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
      z-index: 5;
    }

    .qk-observe-img-btn:active { transform: scale(.93); }

    .qk-observe-splash,
    .qk-observe-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }

    .qk-observe-home {
      position: absolute;
      left: max(12px, env(safe-area-inset-left));
      top: max(12px, env(safe-area-inset-top));
    }

    .qk-observe-splash-center {
      display: grid;
      justify-items: center;
      gap: clamp(16px, 2.8vmin, 28px);
      width: min(900px, 100%);
      padding-top: 56px;
      text-align: center;
    }

    .qk-observe-splash-art {
      display: grid;
      place-items: center;
      width: clamp(154px, 27vmin, 238px);
      aspect-ratio: 1;
      border-radius: 28px;
      border: 6px solid #fff;
      background: linear-gradient(180deg, #ffffff, #fff0c2);
      box-shadow: var(--shadow);
      --qk-art-size: clamp(82px, 17vmin, 138px);
    }

    .qk-observe-title,
    .qk-observe-end-title {
      margin: 0;
      max-width: 13ch;
      color: var(--navy);
      text-align: center;
      font-size: clamp(38px, 7vmin, 78px);
      line-height: .98;
      letter-spacing: 0;
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
    }

    .qk-observe-mode-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(250px, 86vw), 1fr));
      gap: 18px;
      width: min(760px, 100%);
    }

    .qk-observe-mode,
    .qk-observe-again {
      min-height: 108px;
      border-radius: 26px;
      border: 5px solid #fff;
      padding: 16px 24px;
      color: #fff;
      background: linear-gradient(180deg, rgba(255,255,255,.32), rgba(255,255,255,0) 52%), var(--purple);
      box-shadow: var(--shadow);
      font-size: clamp(24px, 4vmin, 38px);
      line-height: 1.05;
    }

    .qk-observe-mode:nth-child(2n) { background-color: var(--blue); }
    .qk-observe-mode:nth-child(3n) { background-color: var(--green); }
    .qk-observe-mode:active,
    .qk-observe-again:active { transform: scale(.96); }

    .qk-observe-play {
      display: grid;
      grid-template-rows: auto 1fr;
      padding: max(10px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(110px, calc(98px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }

    .qk-observe-hud {
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 98px;
      z-index: 4;
    }

    .qk-observe-hud .qk-observe-home {
      position: static;
      grid-column: 1;
    }

    .qk-observe-dots {
      grid-column: 2;
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 11px;
      min-height: 34px;
      padding: 0 10px;
    }

    .qk-observe-dot {
      width: 24px;
      height: 24px;
      border: 4px solid #fff;
      border-radius: 50%;
      background: rgba(255,255,255,.55);
      box-shadow: 0 3px 0 rgba(23,81,126,.13);
    }

    .qk-observe-dot.is-done { background: var(--green); }
    .qk-observe-dot.is-now { background: var(--gold); }

    .qk-observe-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(220px, 1fr) auto auto;
      align-items: center;
      justify-items: center;
      gap: clamp(10px, 2vmin, 18px);
    }

    .qk-observe-page {
      position: relative;
      width: min(760px, 92vw);
      height: min(48vh, 430px);
      min-height: 220px;
      border-radius: 28px;
      border: 6px solid #fff;
      background:
        linear-gradient(90deg, rgba(23,81,126,.08) 0 2px, transparent 2px 100%) 50% 50% / 34px 34px,
        linear-gradient(180deg, var(--paper), #fff2c8);
      box-shadow: var(--shadow);
      overflow: hidden;
    }

    .qk-observe-page::before {
      content: "";
      position: absolute;
      left: 24px;
      top: 0;
      bottom: 0;
      width: 4px;
      background: rgba(242,95,92,.38);
    }

    .qk-observe-scene {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      padding: 24px 34px 34px 46px;
      background: transparent;
      touch-action: manipulation;
    }

    .qk-observe-scene-single,
    .qk-observe-scene-cluster {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
    }

    .qk-observe-scene-cluster {
      grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
      gap: 14px;
      max-width: 620px;
      margin: auto;
    }

    .qk-observe-scene-card {
      display: grid;
      place-items: center;
      width: min(100%, 230px);
      aspect-ratio: 1;
      margin: auto;
      border-radius: 24px;
      border: 4px solid rgba(255,255,255,.92);
      background: rgba(255,255,255,.62);
      box-shadow: 0 5px 0 rgba(23,81,126,.10);
      --qk-art-size: clamp(92px, 21vmin, 188px);
    }

    .qk-observe-scene-single .qk-observe-scene-card {
      width: min(52vmin, 300px);
      --qk-art-size: clamp(112px, 30vmin, 240px);
    }

    .qk-observe-stamps {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
    }

    .qk-observe-stamp {
      position: absolute;
      display: grid;
      place-items: center;
      width: clamp(84px, 14vmin, 126px);
      aspect-ratio: 1;
      translate: -50% -50%;
      border-radius: 22px;
      border: 5px solid #fff;
      background: #fff;
      box-shadow: 0 5px 0 rgba(23,81,126,.16), 0 10px 22px rgba(23,81,126,.14);
      transform: rotate(var(--turn, 0deg));
      --qk-art-size: clamp(48px, 8vmin, 76px);
      animation: qk-observe-stamp .52s cubic-bezier(.2, 1.7, .35, 1) both;
    }

    .qk-observe-prompt {
      min-height: 44px;
      max-width: min(900px, 92vw);
      color: var(--navy);
      text-align: center;
      font-size: clamp(24px, 4.2vmin, 46px);
      line-height: 1.05;
      letter-spacing: 0;
      text-shadow: 0 3px 0 rgba(255,255,255,.7);
    }

    .qk-observe-stickers {
      display: grid;
      grid-template-columns: repeat(var(--sticker-count), minmax(96px, 134px));
      justify-content: center;
      gap: clamp(10px, 2vmin, 18px);
      max-width: 94vw;
    }

    .qk-observe-sticker {
      display: grid;
      place-items: center;
      min-width: 96px;
      min-height: 96px;
      aspect-ratio: 1;
      border-radius: 24px;
      border: 5px solid #fff;
      background: linear-gradient(180deg, #ffffff, var(--cream));
      box-shadow: 0 6px 0 rgba(23,81,126,.15), 0 12px 22px rgba(23,81,126,.14);
      --qk-art-size: clamp(54px, 9vmin, 82px);
    }

    .qk-observe-sticker:active { transform: translateY(4px) scale(.96); box-shadow: 0 2px 0 rgba(23,81,126,.15); }
    .qk-observe-sticker-enter { animation: qk-observe-card-in .35s ease-out both; animation-delay: var(--enter-delay, 0ms); }
    .qk-observe-picked { animation: qk-observe-pick .56s ease both; }
    .qk-observe-scene-enter { animation: qk-observe-scene-in .34s ease-out both; }

    .qk-observe-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
    }

    .qk-observe-end {
      align-content: center;
      gap: clamp(14px, 2.4vmin, 24px);
    }

    .qk-observe-book {
      width: min(720px, 92vw);
      height: min(52vh, 430px);
      min-height: 260px;
      perspective: 900px;
    }

    .qk-observe-recap-page {
      position: relative;
      width: 100%;
      height: 100%;
      border-radius: 30px;
      border: 7px solid #fff;
      background:
        linear-gradient(90deg, hsla(var(--page-hue, 42), 75%, 70%, .18) 0 48%, transparent 48% 52%, hsla(var(--page-hue, 42), 75%, 70%, .12) 52% 100%),
        linear-gradient(180deg, #fffef8, #fff1c9);
      box-shadow: var(--shadow);
      overflow: hidden;
      transform-origin: left center;
    }

    .qk-observe-recap-stamps {
      position: absolute;
      inset: 0;
    }

    .qk-observe-recap-scene {
      position: absolute;
      inset: 20px 20px 20px 42px;
      display: grid;
      place-items: center;
      opacity: .84;
    }

    .qk-observe-recap-scene .qk-observe-scene-card {
      width: min(42vmin, 240px);
      --qk-art-size: min(23vmin, 180px);
    }

    .qk-observe-recap-stamp {
      width: clamp(82px, 12vmin, 112px);
      --qk-art-size: clamp(46px, 7vmin, 68px);
    }

    .qk-observe-page-flip { animation: qk-observe-flip .42s ease both; }

    .qk-observe-again {
      display: inline-grid;
      grid-auto-flow: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      min-width: min(420px, 84vw);
      color: #fff;
      background-color: var(--green);
    }

    .qk-observe-play-icon {
      width: 54px;
      height: 54px;
      background: url('${PLAY_IMG}') center / contain no-repeat;
    }

    .qk-observe-burst {
      position: absolute;
      left: 50%;
      top: 50%;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }

    .qk-observe-spark {
      position: absolute;
      width: 22px;
      height: 22px;
      border-radius: 999px;
      background: hsl(var(--hue), 82%, 58%);
      animation: qk-observe-burst .85s ease-out both;
    }

    @keyframes qk-observe-card-in {
      from { opacity: 0; transform: translateY(16px) scale(.9); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes qk-observe-pick {
      0% { transform: scale(1); }
      35% { transform: scale(1.12) rotate(-3deg); }
      70% { transform: scale(.96) rotate(2deg); }
      100% { transform: scale(1); }
    }

    @keyframes qk-observe-stamp {
      0% { opacity: 0; transform: rotate(var(--turn, 0deg)) scale(1.55); }
      55% { opacity: 1; transform: rotate(calc(var(--turn, 0deg) - 5deg)) scale(.9); }
      100% { opacity: 1; transform: rotate(var(--turn, 0deg)) scale(1); }
    }

    @keyframes qk-observe-scene-in {
      from { opacity: 0; transform: translateY(10px) scale(.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    @keyframes qk-observe-flip {
      from { transform: rotateY(-16deg); opacity: .72; }
      to { transform: rotateY(0); opacity: 1; }
    }

    @keyframes qk-observe-burst {
      from { opacity: 1; transform: translate(-50%, -50%) scale(.45); }
      to { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1.25); }
    }

    @media (orientation: landscape) and (max-height: 560px) {
      .qk-observe-play {
        grid-template-rows: auto 1fr;
        padding-bottom: max(96px, calc(84px + env(safe-area-inset-bottom)));
      }

      .qk-observe-stage {
        grid-template-columns: minmax(300px, 1fr) minmax(290px, .9fr);
        grid-template-rows: 1fr auto;
        column-gap: 18px;
      }

      .qk-observe-page {
        grid-row: 1 / 3;
        height: min(68vh, 360px);
      }

      .qk-observe-prompt {
        align-self: end;
        font-size: clamp(22px, 5.4vh, 36px);
      }

      .qk-observe-stickers {
        grid-template-columns: repeat(3, minmax(96px, 118px));
        align-self: start;
      }

      .qk-observe-sticker {
        min-height: 96px;
      }
    }

    @media (max-width: 680px) {
      .qk-observe-stickers {
        grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
        width: min(520px, 94vw);
      }

      .qk-observe-page {
        width: min(94vw, 560px);
      }
    }

    @media (max-width: 430px) {
      .qk-observe-hud {
        grid-template-columns: 96px 1fr 24px;
      }

      .qk-observe-dot {
        width: 20px;
        height: 20px;
      }

      .qk-observe-prompt {
        font-size: clamp(22px, 7vw, 34px);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-observe *, .qk-observe *::before, .qk-observe *::after {
        animation-duration: .001ms !important;
        transition-duration: .001ms !important;
        scroll-behavior: auto !important;
      }

      .qk-observe-spark {
        display: none;
      }
    }
  `;
  document.head.appendChild(style);
  styleReady = true;
}
