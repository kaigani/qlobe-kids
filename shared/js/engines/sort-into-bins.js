// sort-into-bins.js — archetype engine for "put each thing where it belongs".
// The game author supplies bins and an item pool; this module owns drawing,
// one-at-a-time sorting, drag/tap input, warm retries, celebration, and debug.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { artEl } from './art.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const HOME_HREF = '../../';

const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const WAIT_FOR_INPUT_MS = 80;
const PRAISE_GAPS = [2, 3];

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('sort-into-bins requires a mount element');
  installStyle();
  return new SortIntoBinsGame(config, mountEl);
}

class SortIntoBinsGame {
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
    this.queue = [];
    this.currentItem = null;
    this.selected = false;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.rng = Math.random;
    this.fxRng = Math.random;
    this.correctPlacements = 0;
    this.nextPraiseAt = PRAISE_GAPS[0];
    this.praiseGapIndex = 0;
    this.praiseIndex = 0;
    this.activeDrag = null;

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (e) => e.preventDefault();
    this.onGestureStart = (e) => e.preventDefault();
    this.onWindowMove = (e) => this.handleWindowMove(e);
    this.onWindowUp = (e) => this.handleWindowUp(e);
    this.onWindowCancel = (e) => this.handleWindowCancel(e);
    this.onWindowBlur = () => this.cancelActiveDrag();

    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);
    window.addEventListener('blur', this.onWindowBlur);

    this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebugHook();
  }

  destroy() {
    this.destroyed = true;
    this.clearIdleTimer();
    this.removeDragListeners();
    this.sweepStrayClones();
    speech.stop();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gesturestart', this.onGestureStart);
    window.removeEventListener('blur', this.onWindowBlur);
    this.mountEl.replaceChildren();
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
      engine: 'sort-into-bins',
      ready: this.ready,
      listModes: () => this.config.modes.map((mode) => ({ id: mode.id, title: mode.title })),
      startMode: (id) => this.startMode(id),
      getState: () => this.getState(),
      getTargets: () => this.getTargets(),
      tap: (targetId) => this.debugTap(targetId),
      winRound: () => this.winRound(),
      mute: () => this.mute(),
      seed: (n) => this.seed(n),
    };
    window.QLOBE_DEBUG = this.debugHook;
  }

  renderSplash() {
    this.screen = 'splash';
    this.mode = null;
    this.awaitingInput = false;
    this.inputLocked = false;
    this.selected = false;
    this.clearIdleTimer();
    this.removeDragListeners();
    this.sweepStrayClones();
    speech.stop();

    this.mountEl.replaceChildren();
    const root = el('section', 'qk-sort qk-sort-splash');
    root.setAttribute('aria-label', this.config.title);

    const home = el('a', 'qk-sort-img-btn qk-sort-home');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', this.config.copy.home);
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const center = el('div', 'qk-sort-splash-center');
    const artCard = el('div', 'qk-sort-splash-art');
    artCard.appendChild(artEl(this.config.splashArt, this.config.title));
    const title = el('h1', '', this.config.title);
    const modeList = el('div', 'qk-sort-mode-list');

    for (const mode of this.config.modes) {
      const button = el('button', 'qk-sort-mode', mode.title || mode.id);
      button.type = 'button';
      button.dataset.mode = mode.id;
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.unlockAudio();
        this.playSfx('tick');
      });
      button.addEventListener('click', () => this.startMode(mode.id));
      modeList.appendChild(button);
    }

    center.append(artCard, title, modeList);
    root.append(home, center);
    this.mountEl.appendChild(root);
  }

  async startMode(modeId) {
    await this.ready;
    if (this.destroyed) return;

    const mode = this.config.modes.find((item) => item.id === modeId) || this.config.modes[0];
    if (!mode) return;

    this.clearIdleTimer();
    this.removeDragListeners();
    this.sweepStrayClones();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
    this.roundIndex = 0;
    this.roundsTotal = Math.max(1, mode.rounds);
    this.correctPlacements = 0;
    this.nextPraiseAt = PRAISE_GAPS[0];
    this.praiseGapIndex = 0;
    this.praiseIndex = 0;

    this.renderPlayShell();
    await this.showRound(0);
  }

  renderPlayShell() {
    this.mountEl.replaceChildren();
    const root = el('section', 'qk-sort qk-sort-play');
    root.setAttribute('aria-label', this.mode.title || this.config.title);

    const hud = el('header', 'qk-sort-hud');
    const home = el('a', 'qk-sort-img-btn qk-sort-home');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', this.config.copy.home);
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const progress = el('div', 'qk-sort-progress');
    progress.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < this.roundsTotal; i++) {
      progress.appendChild(el('span', 'qk-sort-dot'));
    }

    hud.append(home, progress, el('span', 'qk-sort-hud-spacer'));

    const stage = el('main', 'qk-sort-stage');
    const prompt = el('div', 'qk-sort-prompt');
    prompt.setAttribute('aria-hidden', 'true');
    const itemArea = el('div', 'qk-sort-item-area');
    const bins = el('div', 'qk-sort-bins');
    stage.append(prompt, itemArea, bins);

    const sound = el('button', 'qk-sort-img-btn qk-sort-sound');
    sound.type = 'button';
    sound.setAttribute('aria-label', this.config.copy.replay);
    sound.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
    });
    sound.addEventListener('click', () => this.replayPromptFromHud());

    root.append(hud, stage, sound);
    this.mountEl.appendChild(root);
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play') return;

    this.clearIdleTimer();
    this.removeDragListeners();
    this.sweepStrayClones();
    this.roundIndex = index;
    this.selected = false;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.idlePrompted = false;
    this.mode.bins.forEach((bin) => { bin.count = 0; });
    this.queue = this.drawRoundItems();
    this.currentItem = this.queue.shift() || null;

    this.updateDots();
    this.renderRound();
    await this.speakRoundStart();
    this.scheduleIdlePrompt();
    await wait(WAIT_FOR_INPUT_MS);
  }

  drawRoundItems() {
    const pool = shuffle(this.mode.items.slice(), this.rng);
    const count = Math.min(this.mode.itemsPerRound, pool.length);
    return pool.slice(0, count).map((item, index) => ({
      ...item,
      id: `round-${this.roundIndex}-item-${index}`,
    }));
  }

  renderRound() {
    this.renderPrompt();
    this.renderCurrentItem();
    this.renderBins();
  }

  renderPrompt() {
    const prompt = this.mountEl.querySelector('.qk-sort-prompt');
    if (prompt) prompt.textContent = this.mode.prompt || this.config.voice.intro;
  }

  renderCurrentItem() {
    const itemArea = this.mountEl.querySelector('.qk-sort-item-area');
    if (!itemArea) return;
    itemArea.replaceChildren();

    if (!this.currentItem) {
      itemArea.appendChild(el('div', 'qk-sort-empty'));
      return;
    }

    const button = el('button', 'qk-sort-item');
    button.type = 'button';
    button.dataset.itemId = 'item:current';
    button.dataset.targetId = 'item:current';
    button.setAttribute('aria-label', this.currentItem.alt || this.currentItem.say || '');
    button.classList.toggle('is-selected', this.selected);
    button.appendChild(this.renderItemFace(this.currentItem));
    button.addEventListener('pointerdown', (e) => this.handleItemPointerDown(e));
    itemArea.appendChild(button);
  }

  renderItemFace(item) {
    const face = el('span', 'qk-sort-face');
    if (item) face.appendChild(artEl(item.art, item.alt || item.say || ''));
    return face;
  }

  renderBins() {
    const binsEl = this.mountEl.querySelector('.qk-sort-bins');
    if (!binsEl) return;
    binsEl.replaceChildren();
    binsEl.style.setProperty('--bin-count', String(this.mode.bins.length));
    binsEl.classList.toggle('is-holding', Boolean(this.selected || this.activeDrag));

    for (const bin of this.mode.bins) {
      const button = el('button', 'qk-sort-bin');
      button.type = 'button';
      button.dataset.binId = bin.id;
      button.dataset.targetId = `bin:${bin.id}`;
      button.setAttribute('aria-label', bin.alt || bin.say || bin.id);
      if (this.currentItem) {
        button.classList.toggle('is-correct', this.currentItem.bin === bin.id);
      }
      button.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
      });
      button.addEventListener('click', () => this.handleBinTap(bin.id));

      const art = el('span', 'qk-sort-bin-art');
      art.appendChild(artEl(bin.art, bin.alt || bin.say || ''));
      const mouth = el('span', 'qk-sort-bin-mouth');
      const pile = el('span', 'qk-sort-bin-pile');
      const count = Math.min(6, bin.count || 0);
      for (let i = 0; i < count; i++) pile.appendChild(el('span'));
      button.append(art, mouth, pile);
      binsEl.appendChild(button);
    }
  }

  handleItemPointerDown(e) {
    if (this.destroyed || !this.awaitingInput || this.inputLocked || this.activeDrag) return;
    if (e.isPrimary === false || !this.currentItem) return;

    e.preventDefault();
    e.stopPropagation();
    this.unlockAudio();
    this.sweepStrayClones();
    this.selectCurrentItem();

    this.activeDrag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      sourceEl: e.currentTarget,
      clone: null,
      moved: false,
    };
    window.addEventListener('pointermove', this.onWindowMove, { passive: false });
    window.addEventListener('pointerup', this.onWindowUp, { passive: false });
    window.addEventListener('pointercancel', this.onWindowCancel, { passive: false });
  }

  handleWindowMove(e) {
    const drag = this.activeDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    drag.lastX = e.clientX;
    drag.lastY = e.clientY;

    const distance = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
    if (!drag.clone && distance > 8) {
      drag.moved = true;
      drag.clone = this.createDragClone(drag.sourceEl, e.clientX, e.clientY);
      drag.sourceEl.classList.add('is-dragging');
      this.renderBins();
    }
    if (drag.clone) this.moveCloneToPointer(drag.clone, e.clientX, e.clientY);
  }

  async handleWindowUp(e) {
    const drag = this.activeDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    this.removeDragListeners();

    if (!drag.moved || !drag.clone) {
      if (drag.sourceEl) drag.sourceEl.classList.remove('is-dragging');
      this.activeDrag = null;
      return;
    }

    const binId = this.binIdFromPoint(e.clientX, e.clientY);
    try {
      if (!binId) {
        await this.cancelDragHome(drag);
      } else {
        await this.attemptSort(binId, { clone: drag.clone });
      }
    } catch {
      await this.cancelDragHome(drag);
    } finally {
      if (drag.sourceEl) drag.sourceEl.classList.remove('is-dragging');
      this.activeDrag = null;
      this.renderBins();
      this.sweepStrayClones();
    }
  }

  handleWindowCancel(e) {
    const drag = this.activeDrag;
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    this.cancelActiveDrag();
  }

  async cancelActiveDrag() {
    const drag = this.activeDrag;
    if (!drag) {
      this.sweepStrayClones();
      return;
    }
    this.removeDragListeners();
    await this.cancelDragHome(drag);
    if (drag.sourceEl) drag.sourceEl.classList.remove('is-dragging');
    this.activeDrag = null;
    this.renderBins();
    this.sweepStrayClones();
  }

  async cancelDragHome(drag) {
    if (drag && drag.clone) {
      await this.animateCloneHome(drag.clone, this.itemEl());
    }
    this.playSfx('unpop');
  }

  removeDragListeners() {
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowCancel);
  }

  createDragClone(sourceEl, x, y) {
    const rect = sourceEl.getBoundingClientRect();
    const clone = sourceEl.cloneNode(true);
    clone.classList.add('drag-clone', 'qk-sort-drag-clone');
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    document.body.appendChild(clone);
    this.moveCloneToPointer(clone, x, y);
    return clone;
  }

  moveCloneToPointer(clone, x, y) {
    clone.style.transform = `translate(${x - clone.offsetWidth / 2 - Number.parseFloat(clone.style.left)}px, ${y - clone.offsetHeight / 2 - Number.parseFloat(clone.style.top)}px) scale(1.04)`;
  }

  binIdFromPoint(x, y) {
    const elAtPoint = document.elementFromPoint(x, y);
    const direct = elAtPoint && elAtPoint.closest && elAtPoint.closest('[data-bin-id]');
    if (direct) return direct.dataset.binId;

    const bins = this.mountEl.querySelectorAll('[data-bin-id]');
    for (const bin of bins) {
      const rect = bin.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return bin.dataset.binId;
      }
    }
    return null;
  }

  selectCurrentItem() {
    if (!this.currentItem || !this.awaitingInput || this.inputLocked) return { accepted: false };
    this.selected = true;
    this.playSfx('pop');
    this.renderCurrentItem();
    this.renderBins();
    this.speakItem();
    return { accepted: true };
  }

  async handleBinTap(binId) {
    if (!this.awaitingInput || this.inputLocked) {
      await this.speakBin(binId);
      return { accepted: false };
    }
    if (!this.selected) {
      await this.speakBin(binId);
      return { accepted: false };
    }
    return this.attemptSort(binId);
  }

  async attemptSort(binId, opts = {}) {
    const bin = this.findBin(binId);
    const item = this.currentItem;
    if (!item || !bin || !this.awaitingInput || this.inputLocked) {
      if (opts.clone) opts.clone.remove();
      return { accepted: false };
    }

    this.clearIdleTimer();
    this.inputLocked = true;

    if (item.bin === bin.id) {
      await this.handleCorrectSort(item, bin, opts.clone);
      return { accepted: true };
    }

    await this.handleWrongSort(item, bin, opts.clone);
    return { accepted: true };
  }

  async handleCorrectSort(item, bin, clone) {
    this.playSfx('pop');
    this.playSfx('sparkle');
    this.selected = false;
    bin.count += 1;
    this.correctPlacements += 1;

    const binEl = this.binEl(bin.id);
    if (clone && binEl) await this.animateCloneToBin(clone, binEl);
    else if (clone) clone.remove();

    this.currentItem = this.queue.shift() || null;
    this.renderRound();

    const landedBin = this.binEl(bin.id);
    if (landedBin) {
      animateOnce(landedBin, 'qk-sort-bounce');
      this.createBurst(landedBin, 13);
    }

    if (this.currentItem) {
      if (this.shouldPraise()) await this.speakNextPraise();
      this.inputLocked = false;
      await this.speakItem();
      this.scheduleIdlePrompt();
    } else {
      await this.completeRound();
    }
  }

  async handleWrongSort(item, bin, clone) {
    this.playSfx('boing');
    const binEl = this.binEl(bin.id);
    const itemEl = this.itemEl();
    animateOnce(binEl, 'qk-sort-wiggle');
    animateOnce(itemEl, 'qk-sort-wiggle');

    if (clone) {
      await this.animateCloneHome(clone, itemEl);
    } else if (itemEl) {
      await this.animateReturnFromBin(itemEl, binEl);
    }

    this.selected = false;
    this.renderCurrentItem();
    this.renderBins();
    await this.speakLine(this.config.voice.nudge, true);
    await this.speakItem(true);
    this.inputLocked = false;
    this.scheduleIdlePrompt();
  }

  shouldPraise() {
    if (this.correctPlacements < this.nextPraiseAt) return false;
    const gap = PRAISE_GAPS[this.praiseGapIndex % PRAISE_GAPS.length];
    this.praiseGapIndex += 1;
    this.nextPraiseAt += gap;
    return true;
  }

  async speakNextPraise() {
    const praises = this.config.voice.yums;
    if (!praises.length) return;
    const line = praises[this.praiseIndex % praises.length];
    this.praiseIndex += 1;
    await this.speakLine(line, true);
  }

  async completeRound() {
    this.awaitingInput = false;
    this.inputLocked = true;
    this.selected = false;
    this.playSfx('sparkle');
    const anchor = this.mountEl.querySelector('.qk-sort-bins');
    this.createBurst(anchor, 24);
    await this.speakLine(this.mode.roundCheer || this.config.voice.roundCheer, true);
    await wait(this.reducedMotion() ? 100 : 520);

    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) {
      await this.finishGame();
    } else {
      await this.showRound(next);
    }
  }

  async finishGame() {
    this.clearIdleTimer();
    this.removeDragListeners();
    this.sweepStrayClones();
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.selected = false;
    this.playSfx('tada');

    this.mountEl.replaceChildren();
    const root = el('section', 'qk-sort qk-sort-end');
    root.setAttribute('aria-label', this.config.voice.cheer);

    const home = el('a', 'qk-sort-img-btn qk-sort-home');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', this.config.copy.home);
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const center = el('div', 'qk-sort-end-center');
    const artCard = el('div', 'qk-sort-end-art');
    artCard.appendChild(artEl(this.config.endArt || this.config.splashArt, ''));
    const title = el('h1', '', this.config.voice.cheer);
    const again = el('button', 'qk-sort-again');
    again.type = 'button';
    const icon = el('span', 'qk-sort-play-icon');
    icon.setAttribute('aria-hidden', 'true');
    const label = el('span', '', this.config.copy.playAgain);
    again.append(icon, label);
    again.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.unlockAudio();
      this.playSfx('tick');
    });
    again.addEventListener('click', () => {
      if (this.mode) this.startMode(this.mode.id);
      else this.renderSplash();
    });

    center.append(artCard, title, again);
    root.append(home, center);
    this.mountEl.appendChild(root);
    this.createBurst(artCard, 34);
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
    await this.speakItem(true);
    this.scheduleIdlePrompt();
  }

  async speakRoundStart() {
    await this.speakLine(this.mode.prompt || this.config.voice.intro, true);
    await this.speakItem(true);
  }

  async speakItem(cancel = false) {
    if (!this.currentItem) return;
    await this.speakLine(this.currentItem.say || this.currentItem.alt, cancel);
  }

  async speakBin(binId) {
    const bin = this.findBin(binId);
    if (!bin) return;
    this.playSfx('tick');
    await this.speakLine(bin.say || bin.alt || bin.id, true);
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

  updateDots() {
    this.mountEl.querySelectorAll('.qk-sort-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-sort') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burst = el('div', 'qk-sort-burst');
    burst.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;

    for (let i = 0; i < count; i++) {
      const piece = el('span');
      const angle = (Math.PI * 2 * i) / count;
      const distance = 54 + this.fxRng() * 94;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      piece.style.setProperty('--hue', String(18 + Math.floor(this.fxRng() * 285)));
      piece.style.setProperty('--delay', `${this.fxRng() * 80}ms`);
      burst.appendChild(piece);
    }

    host.appendChild(burst);
    window.setTimeout(() => burst.remove(), 900);
  }

  async animateCloneHome(clone, targetEl) {
    if (!clone) return;
    if (!targetEl || this.reducedMotion()) {
      clone.remove();
      return;
    }
    const target = targetEl.getBoundingClientRect();
    const source = clone.getBoundingClientRect();
    clone.style.left = `${source.left}px`;
    clone.style.top = `${source.top}px`;
    clone.style.transform = 'translate(0, 0) scale(1)';
    await wait(20);
    clone.style.transform = `translate(${target.left - source.left}px, ${target.top - source.top}px) scale(.96)`;
    await wait(260);
    clone.remove();
  }

  async animateCloneToBin(clone, binEl) {
    if (!clone || !binEl || this.reducedMotion()) {
      if (clone) clone.remove();
      return;
    }
    const target = binEl.getBoundingClientRect();
    const source = clone.getBoundingClientRect();
    clone.style.left = `${source.left}px`;
    clone.style.top = `${source.top}px`;
    clone.style.transform = 'translate(0, 0) scale(1)';
    await wait(20);
    clone.style.transform = `translate(${target.left + target.width / 2 - source.left - source.width / 2}px, ${target.top + target.height * .55 - source.top - source.height / 2}px) scale(.62)`;
    await wait(230);
    clone.remove();
  }

  async animateReturnFromBin(itemEl, binEl) {
    if (!itemEl || !binEl || this.reducedMotion()) return;
    const itemRect = itemEl.getBoundingClientRect();
    const binRect = binEl.getBoundingClientRect();
    const clone = itemEl.cloneNode(true);
    clone.classList.add('drag-clone', 'qk-sort-drag-clone');
    clone.style.width = `${itemRect.width}px`;
    clone.style.height = `${itemRect.height}px`;
    clone.style.left = `${binRect.left + binRect.width / 2 - itemRect.width / 2}px`;
    clone.style.top = `${binRect.top + binRect.height * .45 - itemRect.height / 2}px`;
    document.body.appendChild(clone);
    await this.animateCloneHome(clone, itemEl);
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
    const targets = [];

    const itemNode = this.itemEl();
    if (itemNode) targets.push(targetFromEl('item:current', 'neutral', itemNode));

    for (const bin of this.mode.bins) {
      const node = this.binEl(bin.id);
      if (!node) continue;
      const role = this.currentItem && this.currentItem.bin === bin.id ? 'correct' : 'wrong';
      targets.push(targetFromEl(`bin:${bin.id}`, role, node));
    }

    return targets;
  }

  async debugTap(targetId) {
    if (this.screen !== 'play' || this.destroyed) return { accepted: false };
    if (targetId === 'item:current') return this.selectCurrentItem();
    if (targetId.startsWith('bin:')) return this.attemptSort(targetId.slice(4));
    return { accepted: false };
  }

  async winRound() {
    if (this.screen !== 'play' || this.destroyed) return;
    this.clearIdleTimer();
    this.removeDragListeners();
    this.sweepStrayClones();
    this.inputLocked = true;
    this.selected = false;

    while (this.currentItem) {
      const bin = this.findBin(this.currentItem.bin);
      if (bin) bin.count += 1;
      this.correctPlacements += 1;
      this.currentItem = this.queue.shift() || null;
    }
    this.renderRound();
    await this.completeRound();
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    const value = Number(n) || 0;
    this.rng = mulberry32(value);
    this.fxRng = mulberry32(value + 101);
  }

  async speakLine(line, cancel = false) {
    if (this.muted || !line) return;
    await speech.speak(line, { rate: 0.8, pitch: 1.05, cancel });
  }

  playSfx(name) {
    if (this.muted || !name || typeof sfx[name] !== 'function') return;
    sfx[name]();
  }

  reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  findBin(binId) {
    return this.mode && this.mode.bins.find((bin) => bin.id === binId);
  }

  itemEl() {
    return this.mountEl.querySelector('[data-item-id="item:current"]');
  }

  binEl(binId) {
    return this.mountEl.querySelector(`[data-bin-id="${cssEscape(binId)}"]`);
  }

  sweepStrayClones() {
    document.querySelectorAll('.drag-clone').forEach((node) => node.remove());
  }
}

function normalizeConfig(config = {}) {
  const copy = {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
    ...(config.copy || {}),
  };
  const voice = {
    intro: config.prompt || '',
    nudge: 'Almost. Try another basket.',
    roundCheer: 'All sorted!',
    cheer: 'Hooray! You sorted them all!',
    yums: ['Nice sorting!', 'That belongs there!', 'You found the basket!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice!')];

  const modes = Array.isArray(config.modes) && config.modes.length
    ? config.modes
    : [config];

  return {
    ...config,
    id: config.id || 'sort-into-bins',
    title: config.title || 'Sort Into Bins',
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || firstBinArt(modes) || 'emoji:🧺'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    copy,
    voice,
    modes: modes.map((mode) => normalizeMode(mode, voice)).filter((mode) => mode.bins.length >= 2 && mode.items.length),
  };
}

function normalizeMode(mode = {}, voice) {
  const bins = (mode.bins || [])
    .filter((bin) => bin && bin.id && bin.art)
    .slice(0, 3)
    .map((bin) => ({
      ...bin,
      id: String(bin.id),
      art: normalizeArtRef(bin.art),
      count: 0,
    }));
  const binIds = new Set(bins.map((bin) => bin.id));
  const items = (mode.items || [])
    .filter((item) => item && item.art && binIds.has(String(item.bin)))
    .map((item) => ({
      ...item,
      art: normalizeArtRef(item.art),
      bin: String(item.bin),
    }));

  return {
    ...mode,
    id: mode.id || 'play',
    title: mode.title || 'Sort',
    rounds: Math.max(1, Number(mode.rounds) || 1),
    prompt: mode.prompt || voice.intro || 'Where does it go?',
    itemsPerRound: Math.max(1, Math.min(Number(mode.itemsPerRound) || 4, items.length || 1)),
    bins,
    items,
  };
}

function firstBinArt(modes) {
  for (const mode of modes) {
    if (mode && mode.bins && mode.bins[0] && mode.bins[0].art) return mode.bins[0].art;
  }
  return null;
}

function normalizeArtRef(ref) {
  if (!ref) return 'emoji:🧺';
  if (ref.includes(':')) return ref;
  return `emoji:${ref}`;
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

function animateOnce(node, className) {
  if (!node) return;
  node.classList.remove(className);
  void node.offsetWidth;
  node.classList.add(className);
  window.setTimeout(() => node.classList.remove(className), 700);
}

function targetFromEl(id, role, node) {
  const rect = node.getBoundingClientRect();
  return {
    id,
    role,
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
  };
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
  return String(value).replace(/"/g, '\\"');
}

function installStyle() {
  if (styleInstalled || document.getElementById('qk-sort-style')) {
    styleInstalled = true;
    return;
  }

  const style = document.createElement('style');
  style.id = 'qk-sort-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-sort, .qk-sort * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-sort {
      --sky: #bee3f5;
      --navy: #17517e;
      --blue: #2d7dd2;
      --green: #58a945;
      --yellow: #ffd166;
      --coral: #f25f5c;
      --cream: #fff8e8;
      --white: #ffffff;
      --shadow: 0 6px 0 rgba(23, 81, 126, .18), 0 14px 30px rgba(23, 81, 126, .18);
      position: relative;
      width: 100%;
      min-height: 100dvh;
      overflow: hidden;
      color: var(--navy);
      font-family: 'Fredoka', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif;
      font-weight: 600;
      background-color: var(--sky);
      background-image:
        radial-gradient(circle at 16% 20%, rgba(255,255,255,.42) 0 8px, transparent 9px),
        radial-gradient(circle at 82% 24%, rgba(255,255,255,.34) 0 12px, transparent 13px),
        radial-gradient(circle at 46% 86%, rgba(255,255,255,.28) 0 9px, transparent 10px);
      background-size: 160px 160px, 230px 230px, 200px 200px;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
    }

    .qk-sort button, .qk-sort a {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    .qk-sort button {
      border: 0;
      cursor: pointer;
    }

    .qk-sort button:focus-visible,
    .qk-sort a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .7);
      outline-offset: 4px;
    }

    .qk-sort-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
    }

    .qk-sort-img-btn:active { transform: scale(.93); }
    .qk-sort-home { background-image: url('${HOME_IMG}'); }
    .qk-sort-sound { background-image: url('${SOUND_IMG}'); }

    .qk-sort-splash,
    .qk-sort-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }

    .qk-sort-home {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 5;
    }

    .qk-sort-splash-center,
    .qk-sort-end-center {
      width: min(900px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(14px, 2.5vmin, 24px);
      text-align: center;
      padding-top: 54px;
    }

    .qk-sort-splash-art,
    .qk-sort-end-art {
      display: grid;
      place-items: center;
      width: clamp(150px, 26vmin, 230px);
      aspect-ratio: 1;
      border-radius: 28px;
      background: linear-gradient(180deg, #ffffff, #fff3d0);
      border: 5px solid var(--white);
      box-shadow: var(--shadow);
      --qk-art-size: clamp(82px, 16vmin, 132px);
    }

    .qk-sort h1 {
      margin: 0;
      max-width: 13ch;
      color: var(--navy);
      font-size: clamp(38px, 7vmin, 78px);
      line-height: .98;
      letter-spacing: 0;
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
    }

    .qk-sort-mode-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px;
      width: min(760px, 100%);
      margin-top: 6px;
    }

    .qk-sort-mode,
    .qk-sort-again {
      min-height: 104px;
      border-radius: 26px;
      border: 5px solid var(--white);
      padding: 18px 24px;
      color: var(--white);
      background:
        linear-gradient(180deg, rgba(255,255,255,.34), rgba(255,255,255,0) 50%),
        var(--blue);
      box-shadow: var(--shadow);
      font-size: clamp(23px, 4vmin, 36px);
      line-height: 1.05;
    }

    .qk-sort-mode:nth-child(2n) { background-color: var(--green); }
    .qk-sort-mode:nth-child(3n) { background-color: var(--coral); }
    .qk-sort-mode:active,
    .qk-sort-again:active { transform: scale(.96); }

    .qk-sort-play {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      padding: max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(112px, calc(100px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }

    .qk-sort-hud {
      position: relative;
      z-index: 3;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 100px;
    }

    .qk-sort-hud .qk-sort-home {
      position: static;
      grid-column: 1;
    }

    .qk-sort-progress {
      grid-column: 2;
      justify-self: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 11px;
      min-height: 32px;
      padding: 0 8px;
    }

    .qk-sort-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 4px solid var(--white);
      background: rgba(255,255,255,.52);
      box-shadow: 0 3px 0 rgba(23, 81, 126, .12);
    }

    .qk-sort-dot.is-filled { background: var(--green); }
    .qk-sort-dot.is-current { background: var(--yellow); transform: scale(1.15); }

    .qk-sort-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(160px, 1fr) auto;
      gap: clamp(10px, 1.8vmin, 18px);
      align-items: center;
    }

    .qk-sort-prompt {
      justify-self: center;
      max-width: min(780px, 90vw);
      min-height: 42px;
      color: rgba(23, 81, 126, .88);
      font-size: clamp(22px, 3.2vmin, 34px);
      line-height: 1.08;
      text-align: center;
      text-shadow: 0 2px 0 rgba(255,255,255,.68);
    }

    .qk-sort-item-area {
      min-height: 158px;
      display: grid;
      place-items: center;
      align-self: stretch;
    }

    .qk-sort-item {
      display: grid;
      place-items: center;
      width: clamp(132px, 28vmin, 260px);
      aspect-ratio: 1;
      min-width: 132px;
      min-height: 132px;
      border-radius: 30px;
      border: 6px solid var(--white);
      background: linear-gradient(180deg, #ffffff, #fff2c8);
      box-shadow: var(--shadow);
      touch-action: none;
      --qk-art-size: clamp(76px, 16vmin, 150px);
    }

    .qk-sort-face {
      display: grid;
      place-items: center;
      width: 78%;
      height: 78%;
      pointer-events: none;
    }

    .qk-sort-item.is-selected {
      transform: translateY(-4px) scale(1.03);
      box-shadow: 0 0 0 8px rgba(255, 209, 102, .55), var(--shadow);
    }

    .qk-sort-item.is-dragging {
      opacity: .35;
    }

    .qk-sort-bins {
      display: grid;
      grid-template-columns: repeat(var(--bin-count), minmax(112px, 1fr));
      gap: clamp(12px, 2.6vmin, 28px);
      width: min(960px, 100%);
      justify-self: center;
      align-items: end;
    }

    .qk-sort-bin {
      position: relative;
      display: grid;
      grid-template-rows: minmax(74px, 1fr) 24px;
      place-items: center;
      min-height: 136px;
      min-width: 112px;
      border-radius: 26px 26px 32px 32px;
      border: 6px solid var(--white);
      padding: 12px 10px 16px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.48), rgba(255,255,255,0) 42%),
        var(--cream);
      box-shadow: var(--shadow);
      overflow: hidden;
      --qk-art-size: clamp(48px, 8vmin, 84px);
    }

    .qk-sort-bin:nth-child(2n) { background-color: #dff2d7; }
    .qk-sort-bin:nth-child(3n) { background-color: #ffe2df; }
    .qk-sort-bin:active { transform: scale(.97); }

    .qk-sort-bins.is-holding .qk-sort-bin {
      box-shadow: 0 0 0 8px rgba(255, 209, 102, .36), var(--shadow);
    }

    .qk-sort-bin-art {
      z-index: 1;
      display: grid;
      place-items: center;
      width: min(92px, 76%);
      aspect-ratio: 1;
      border-radius: 20px;
      background: rgba(255,255,255,.72);
      pointer-events: none;
    }

    .qk-sort-bin-mouth {
      width: 72%;
      height: 18px;
      border-radius: 999px;
      background: rgba(23, 81, 126, .2);
      box-shadow: inset 0 3px 0 rgba(23, 81, 126, .16);
      pointer-events: none;
    }

    .qk-sort-bin-pile {
      position: absolute;
      left: 16%;
      right: 16%;
      bottom: 17px;
      display: flex;
      justify-content: center;
      gap: 4px;
      pointer-events: none;
    }

    .qk-sort-bin-pile span {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--yellow);
      border: 2px solid rgba(255,255,255,.8);
    }

    .qk-sort-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 4;
    }

    .qk-sort-again {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
      min-width: min(340px, 86vw);
      background-color: var(--green);
    }

    .qk-sort-play-icon {
      width: 0;
      height: 0;
      border-top: 17px solid transparent;
      border-bottom: 17px solid transparent;
      border-left: 25px solid currentColor;
      filter: drop-shadow(0 2px 0 rgba(23, 81, 126, .16));
    }

    .qk-sort-drag-clone {
      position: fixed;
      z-index: 9999;
      margin: 0;
      pointer-events: none;
      transition: transform 260ms ease;
      opacity: .96;
    }

    .qk-sort-burst {
      position: absolute;
      z-index: 10;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }

    .qk-sort-burst span {
      position: absolute;
      left: 0;
      top: 0;
      width: 13px;
      height: 13px;
      border-radius: 4px;
      background: hsl(var(--hue), 82%, 56%);
      animation: qk-sort-burst 820ms ease-out var(--delay) forwards;
    }

    .qk-sort-bounce { animation: qk-sort-bounce 520ms ease; }
    .qk-sort-wiggle { animation: qk-sort-wiggle 430ms ease; }

    @keyframes qk-sort-burst {
      0% { transform: translate(0, 0) scale(.4) rotate(0deg); opacity: 1; }
      100% { transform: translate(var(--x), var(--y)) scale(.1) rotate(210deg); opacity: 0; }
    }

    @keyframes qk-sort-bounce {
      0%, 100% { transform: translateY(0) scale(1); }
      38% { transform: translateY(-12px) scale(1.05, .96); }
      70% { transform: translateY(3px) scale(.98, 1.02); }
    }

    @keyframes qk-sort-wiggle {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-9px) rotate(-2deg); }
      40% { transform: translateX(8px) rotate(2deg); }
      60% { transform: translateX(-5px) rotate(-1deg); }
      80% { transform: translateX(4px) rotate(1deg); }
    }

    @media (orientation: landscape) and (max-height: 650px) {
      .qk-sort-play {
        padding-bottom: max(94px, calc(82px + env(safe-area-inset-bottom)));
      }

      .qk-sort-stage {
        grid-template-rows: auto minmax(120px, 1fr) auto;
        gap: 8px;
      }

      .qk-sort-item {
        width: clamp(124px, 25vmin, 188px);
        min-width: 124px;
        min-height: 124px;
      }

      .qk-sort-bin {
        min-height: 116px;
        padding-top: 8px;
        padding-bottom: 12px;
      }
    }

    @media (max-width: 620px) {
      .qk-sort-bins {
        grid-template-columns: repeat(var(--bin-count), minmax(96px, 1fr));
        gap: 10px;
      }

      .qk-sort-bin {
        min-width: 96px;
        min-height: 124px;
        border-width: 5px;
      }

      .qk-sort-prompt {
        font-size: 22px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-sort *,
      .qk-sort-drag-clone {
        animation-duration: 1ms !important;
        transition-duration: 1ms !important;
      }

      .qk-sort-burst { display: none; }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
