// sequence-order.js — archetype engine for "put things in order".
// The game author supplies ordered sets; this module owns shuffling, placement,
// warm feedback, drag/tap input, celebration, and the QLOBE_DEBUG hook.

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
const WAIT_FOR_INPUT_MS = 80;
const PRAISE_GAPS = [2, 3];

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('sequence-order requires a mount element');
  installStyle();
  return new SequenceOrderGame(config, mountEl);
}

class SequenceOrderGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;
    this.destroyed = false;

    this.screen = 'splash';
    this.mode = null;
    this.roundSets = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.items = [];
    this.placements = [];
    this.selectedId = null;
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
    this.yumIndex = 0;
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
      engine: 'sequence-order',
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
    this.selectedId = null;
    this.clearIdleTimer();
    this.removeDragListeners();
    this.sweepStrayClones();
    speech.stop();

    this.mountEl.replaceChildren();
    const root = el('section', 'qk-seq qk-seq-splash');
    root.setAttribute('aria-label', this.config.title);

    const home = el('a', 'qk-seq-img-btn qk-seq-home');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', this.config.copy.home);
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const center = el('div', 'qk-seq-splash-center');
    const artCard = el('div', 'qk-seq-splash-art');
    artCard.appendChild(artEl(this.config.splashArt, this.config.title));
    const title = el('h1', '', this.config.title);
    const modeList = el('div', 'qk-seq-mode-list');

    for (const mode of this.config.modes) {
      const button = el('button', 'qk-seq-mode', mode.title || mode.id);
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
    this.correctPlacements = 0;
    this.nextPraiseAt = PRAISE_GAPS[0];
    this.praiseGapIndex = 0;
    this.yumIndex = 0;

    const maxRounds = Math.min(mode.rounds || mode.sets.length, mode.sets.length);
    this.roundSets = mode.sets.slice(0, maxRounds);
    this.roundsTotal = this.roundSets.length;

    this.renderPlayShell();
    if (!this.roundsTotal) {
      await this.finishGame();
      return;
    }
    await this.showRound(0);
  }

  renderPlayShell() {
    this.mountEl.replaceChildren();
    const root = el('section', 'qk-seq qk-seq-play');
    root.setAttribute('aria-label', this.mode.title || this.config.title);

    const hud = el('header', 'qk-seq-hud');
    const home = el('a', 'qk-seq-img-btn qk-seq-home');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', this.config.copy.home);
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const progress = el('div', 'qk-seq-progress');
    progress.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < this.roundsTotal; i++) {
      progress.appendChild(el('span', 'qk-seq-dot'));
    }

    hud.append(home, progress, el('span', 'qk-seq-hud-spacer'));

    const stage = el('main', 'qk-seq-stage');
    const slots = el('div', 'qk-seq-slots');
    const tray = el('div', 'qk-seq-tray');
    stage.append(slots, tray);

    const sound = el('button', 'qk-seq-img-btn qk-seq-sound');
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
    this.selectedId = null;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.idlePrompted = false;

    const set = this.roundSets[index];
    const sourceItems = this.mode.difficultyRamp && index === 0
      ? set.items.slice(0, Math.min(3, set.items.length))
      : set.items.slice();

    this.items = sourceItems.map((item, order) => ({
      ...item,
      id: `item:${order}`,
      order,
      location: 'tray',
    }));
    this.placements = Array.from({ length: this.items.length }, () => null);
    this.shuffleTrayOrder();
    this.updateDots();
    this.renderRound();
    this.speakLine(this.mode.prompt || this.config.voice.intro);
    this.scheduleIdlePrompt();
    await wait(WAIT_FOR_INPUT_MS);
  }

  shuffleTrayOrder() {
    const trayItems = this.items.filter((item) => item.location === 'tray');
    const shuffled = shuffle(trayItems.slice(), this.rng);
    if (shuffled.length > 1 && isCorrectOrder(shuffled)) {
      shuffled.push(shuffled.shift());
    }
    this.items = [
      ...this.items.filter((item) => item.location !== 'tray'),
      ...shuffled,
    ];
  }

  renderRound() {
    this.renderSlots();
    this.renderTray();
  }

  renderSlots() {
    const slotsEl = this.mountEl.querySelector('.qk-seq-slots');
    if (!slotsEl) return;
    slotsEl.replaceChildren();
    slotsEl.style.setProperty('--slot-count', String(this.placements.length));

    for (let i = 0; i < this.placements.length; i++) {
      const slot = el('button', 'qk-seq-slot');
      slot.type = 'button';
      slot.dataset.slotIndex = String(i);
      slot.dataset.targetId = `slot:${i}`;
      slot.setAttribute('aria-label', this.slotAriaLabel(i));
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.attemptSelectedSlot(i);
      });

      const itemId = this.placements[i];
      if (itemId) {
        const item = this.findItem(itemId);
        slot.classList.add('is-filled');
        slot.appendChild(this.renderItemFace(item));
      } else {
        slot.appendChild(el('span', 'qk-seq-slot-hole'));
      }

      const label = this.renderSlotMarker(i);
      if (label) slot.appendChild(label);
      slotsEl.appendChild(slot);
    }
  }

  renderTray() {
    const trayEl = this.mountEl.querySelector('.qk-seq-tray');
    if (!trayEl) return;
    trayEl.replaceChildren();

    const trayItems = this.items.filter((item) => item.location === 'tray');
    for (const item of trayItems) {
      const button = el('button', 'qk-seq-item');
      button.type = 'button';
      button.dataset.itemId = item.id;
      button.dataset.targetId = item.id;
      button.setAttribute('aria-label', item.alt || '');
      button.classList.toggle('is-selected', this.selectedId === item.id);
      button.appendChild(this.renderItemFace(item));
      button.addEventListener('pointerdown', (e) => this.handleItemPointerDown(e, item.id));
      trayEl.appendChild(button);
    }
  }

  renderItemFace(item) {
    const face = el('span', 'qk-seq-face');
    if (item) face.appendChild(artEl(item.art, item.alt || ''));
    return face;
  }

  renderSlotMarker(index) {
    if (!this.mode.slotLabels || !this.mode.slotLabels[index]) return null;
    const marker = el('span', 'qk-seq-slot-marker');
    marker.setAttribute('aria-hidden', 'true');
    marker.appendChild(el('span', 'qk-seq-slot-dot'));
    const hidden = el('span', 'qk-seq-visually-hidden', this.mode.slotLabels[index]);
    marker.appendChild(hidden);
    return marker;
  }

  slotAriaLabel(index) {
    const label = this.mode.slotLabels && this.mode.slotLabels[index];
    return label ? `Slot ${index + 1}, ${label}` : `Slot ${index + 1}`;
  }

  handleItemPointerDown(e, itemId) {
    if (this.destroyed || !this.awaitingInput || this.inputLocked || this.activeDrag) return;
    if (e.isPrimary === false) return;
    const item = this.findItem(itemId);
    if (!item || item.location !== 'tray') return;

    e.preventDefault();
    e.stopPropagation();
    this.unlockAudio();
    this.sweepStrayClones();
    this.selectItem(itemId);

    this.activeDrag = {
      pointerId: e.pointerId,
      itemId,
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

    const slotIndex = this.slotIndexFromPoint(e.clientX, e.clientY);
    try {
      if (slotIndex == null) {
        await this.cancelDragHome(drag);
      } else {
        await this.attemptPlacement(drag.itemId, slotIndex, { clone: drag.clone });
      }
    } catch {
      await this.cancelDragHome(drag);
    } finally {
      if (drag.sourceEl) drag.sourceEl.classList.remove('is-dragging');
      this.activeDrag = null;
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
    this.sweepStrayClones();
  }

  async cancelDragHome(drag) {
    if (drag && drag.clone) {
      await this.animateCloneHome(drag.clone, this.itemEl(drag.itemId));
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
    clone.classList.add('drag-clone', 'qk-seq-drag-clone');
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

  slotIndexFromPoint(x, y) {
    const elAtPoint = document.elementFromPoint(x, y);
    const direct = elAtPoint && elAtPoint.closest && elAtPoint.closest('[data-slot-index]');
    if (direct) return Number(direct.dataset.slotIndex);

    const slots = this.mountEl.querySelectorAll('[data-slot-index]');
    for (const slot of slots) {
      const rect = slot.getBoundingClientRect();
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
        return Number(slot.dataset.slotIndex);
      }
    }
    return null;
  }

  selectItem(itemId) {
    const item = this.findItem(itemId);
    if (!item || item.location !== 'tray') return { accepted: false };
    this.selectedId = itemId;
    this.playSfx('pop');
    this.renderTray();
    return { accepted: true };
  }

  async attemptSelectedSlot(slotIndex) {
    if (!this.selectedId || this.inputLocked) return { accepted: false };
    return this.attemptPlacement(this.selectedId, slotIndex);
  }

  async attemptPlacement(itemId, slotIndex, opts = {}) {
    const item = this.findItem(itemId);
    const slotEl = this.slotEl(slotIndex);
    if (!item || !slotEl || !this.awaitingInput || this.inputLocked || item.location !== 'tray') {
      if (opts.clone) opts.clone.remove();
      return { accepted: false };
    }

    this.clearIdleTimer();
    this.inputLocked = true;

    if (item.order === slotIndex && !this.placements[slotIndex]) {
      await this.handleCorrectPlacement(item, slotIndex, opts.clone);
      return { accepted: true };
    }

    await this.handleWrongPlacement(item, slotEl, opts.clone);
    return { accepted: true };
  }

  async handleCorrectPlacement(item, slotIndex, clone) {
    this.playSfx('pop');
    this.playSfx('sparkle');
    if (clone) clone.remove();

    this.placements[slotIndex] = item.id;
    item.location = 'slot';
    this.selectedId = null;
    this.correctPlacements += 1;
    this.renderRound();

    const placedEl = this.slotEl(slotIndex);
    if (placedEl) {
      animateOnce(placedEl, 'qk-seq-pop');
      this.createBurst(placedEl, 14);
    }

    if (this.shouldPraise()) {
      await this.speakNextYum();
    }

    if (this.isRoundComplete()) {
      await this.completeRound();
    } else {
      this.inputLocked = false;
      this.scheduleIdlePrompt();
    }
  }

  async handleWrongPlacement(item, slotEl, clone) {
    this.playSfx('boing');
    animateOnce(slotEl, 'qk-seq-wiggle');
    const itemEl = this.itemEl(item.id);
    if (itemEl) animateOnce(itemEl, 'qk-seq-wiggle');

    if (clone) {
      await this.animateCloneHome(clone, itemEl);
    } else {
      await this.animateReturnFromSlot(itemEl, slotEl);
    }

    this.selectedId = null;
    this.renderTray();
    await this.speakLine(this.config.voice.nudge, true);
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

  async speakNextYum() {
    const yums = this.config.voice.yums;
    if (!yums.length) return;
    const line = yums[this.yumIndex % yums.length];
    this.yumIndex += 1;
    await this.speakLine(line, true);
  }

  async completeRound() {
    this.awaitingInput = false;
    this.inputLocked = true;
    this.playSfx('sparkle');
    const anchor = this.mountEl.querySelector('.qk-seq-slots');
    this.createBurst(anchor, 24);

    const set = this.roundSets[this.roundIndex];
    await this.speakLine(set && set.say, true);
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
    this.selectedId = null;
    this.playSfx('tada');

    this.mountEl.replaceChildren();
    const root = el('section', 'qk-seq qk-seq-end');
    root.setAttribute('aria-label', this.config.voice.cheer);

    const home = el('a', 'qk-seq-img-btn qk-seq-home');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', this.config.copy.home);
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const center = el('div', 'qk-seq-end-center');
    const artCard = el('div', 'qk-seq-end-art');
    artCard.appendChild(artEl(this.config.endArt || this.config.splashArt, ''));
    const title = el('h1', '', this.config.voice.cheer);
    const again = el('button', 'qk-seq-again');
    again.type = 'button';
    const icon = el('span', 'qk-seq-play-icon');
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
    }, IDLE_MS);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-seq-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-seq') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burst = el('div', 'qk-seq-burst');
    burst.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;

    for (let i = 0; i < count; i++) {
      const piece = el('span');
      const angle = (Math.PI * 2 * i) / count;
      const distance = 60 + this.fxRng() * 100;
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

  async animateReturnFromSlot(itemEl, slotEl) {
    if (!itemEl || !slotEl || this.reducedMotion()) return;
    const itemRect = itemEl.getBoundingClientRect();
    const slotRect = slotEl.getBoundingClientRect();
    const clone = itemEl.cloneNode(true);
    clone.classList.add('drag-clone', 'qk-seq-drag-clone');
    clone.style.width = `${itemRect.width}px`;
    clone.style.height = `${itemRect.height}px`;
    clone.style.left = `${slotRect.left + slotRect.width / 2 - itemRect.width / 2}px`;
    clone.style.top = `${slotRect.top + slotRect.height / 2 - itemRect.height / 2}px`;
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
    const selected = this.selectedId ? this.findItem(this.selectedId) : null;

    for (let i = 0; i < this.placements.length; i++) {
      const node = this.slotEl(i);
      if (!node) continue;
      const role = selected ? (selected.order === i && !this.placements[i] ? 'correct' : 'wrong') : 'neutral';
      targets.push(targetFromEl(`slot:${i}`, role, node));
    }

    for (const item of this.items) {
      if (item.location !== 'tray') continue;
      const node = this.itemEl(item.id);
      if (node) targets.push(targetFromEl(item.id, 'neutral', node));
    }

    return targets;
  }

  async debugTap(targetId) {
    if (this.screen !== 'play' || this.destroyed) return { accepted: false };
    if (targetId.startsWith('item:')) return this.selectItem(targetId);
    if (targetId.startsWith('slot:')) {
      const slotIndex = Number(targetId.slice(5));
      if (!Number.isFinite(slotIndex)) return { accepted: false };
      return this.attemptSelectedSlot(slotIndex);
    }
    return { accepted: false };
  }

  async winRound() {
    if (this.screen !== 'play' || this.destroyed) return;
    this.clearIdleTimer();
    this.removeDragListeners();
    this.sweepStrayClones();
    this.inputLocked = true;
    this.selectedId = null;

    let placed = 0;
    for (const item of this.items) {
      if (item.location === 'tray') {
        item.location = 'slot';
        this.placements[item.order] = item.id;
        placed += 1;
      }
    }
    this.correctPlacements += placed;
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

  findItem(itemId) {
    return this.items.find((item) => item.id === itemId);
  }

  itemEl(itemId) {
    return this.mountEl.querySelector(`[data-item-id="${cssEscape(itemId)}"]`);
  }

  slotEl(index) {
    return this.mountEl.querySelector(`[data-slot-index="${index}"]`);
  }

  isRoundComplete() {
    return this.placements.length > 0 && this.placements.every(Boolean);
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
    intro: '',
    nudge: 'Try another spot.',
    cheer: 'You did it!',
    yums: ['Nice!', 'You got it!', 'Yes!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice!')];

  return {
    ...config,
    id: config.id || 'sequence-order',
    title: config.title || 'Put Things in Order',
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || 'emoji:⭐'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    copy,
    voice,
    modes: (config.modes || []).map(normalizeMode).filter((mode) => mode.sets.length),
  };
}

function normalizeMode(mode = {}) {
  const sets = (mode.sets || [])
    .map((set) => ({
      ...set,
      items: (set.items || []).filter((item) => item && item.art),
    }))
    .filter((set) => set.items.length >= 2);

  return {
    ...mode,
    id: mode.id || 'play',
    title: mode.title || 'Order',
    rounds: Math.min(mode.rounds || sets.length, sets.length),
    prompt: mode.prompt || '',
    slotLabels: Array.isArray(mode.slotLabels) ? mode.slotLabels : null,
    sets,
  };
}

function normalizeArtRef(ref) {
  if (!ref) return 'emoji:⭐';
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

function isCorrectOrder(items) {
  return items.every((item, index) => item.order === index);
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
  if (styleInstalled || document.getElementById('qk-seq-style')) {
    styleInstalled = true;
    return;
  }

  const style = document.createElement('style');
  style.id = 'qk-seq-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-seq, .qk-seq * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-seq {
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

    .qk-seq button, .qk-seq a {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    .qk-seq button {
      border: 0;
      cursor: pointer;
    }

    .qk-seq button:focus-visible,
    .qk-seq a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .7);
      outline-offset: 4px;
    }

    .qk-seq-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
    }

    .qk-seq-img-btn:active { transform: scale(.93); }
    .qk-seq-home { background-image: url('${HOME_IMG}'); }
    .qk-seq-sound { background-image: url('${SOUND_IMG}'); }

    .qk-seq-splash,
    .qk-seq-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }

    .qk-seq-home {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 5;
    }

    .qk-seq-splash-center,
    .qk-seq-end-center {
      width: min(900px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(14px, 2.5vmin, 24px);
      text-align: center;
      padding-top: 54px;
    }

    .qk-seq-splash-art,
    .qk-seq-end-art {
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

    .qk-seq h1 {
      margin: 0;
      max-width: 13ch;
      color: var(--navy);
      font-size: clamp(38px, 7vmin, 78px);
      line-height: .98;
      letter-spacing: 0;
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
    }

    .qk-seq-mode-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px;
      width: min(760px, 100%);
      margin-top: 6px;
    }

    .qk-seq-mode,
    .qk-seq-again {
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

    .qk-seq-mode:nth-child(2n) { background-color: var(--green); }
    .qk-seq-mode:nth-child(3n) { background-color: var(--coral); }
    .qk-seq-mode:active,
    .qk-seq-again:active { transform: scale(.96); }

    .qk-seq-play {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      padding: max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(112px, calc(100px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }

    .qk-seq-hud {
      position: relative;
      z-index: 3;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 100px;
    }

    .qk-seq-hud .qk-seq-home {
      position: static;
      grid-column: 1;
    }

    .qk-seq-progress {
      grid-column: 2;
      justify-self: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 11px;
      min-height: 32px;
      padding: 0 8px;
    }

    .qk-seq-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 4px solid var(--white);
      background: rgba(255,255,255,.52);
      box-shadow: 0 3px 0 rgba(23,81,126,.14);
    }

    .qk-seq-dot.is-current { background: var(--yellow); }
    .qk-seq-dot.is-filled { background: var(--green); }

    .qk-seq-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(126px, auto) minmax(126px, 1fr);
      align-content: center;
      gap: clamp(16px, 3.5vmin, 30px);
      padding: clamp(2px, 1vmin, 12px) 0 0;
    }

    .qk-seq-slots {
      display: flex;
      align-items: start;
      justify-content: center;
      gap: clamp(8px, 1.6vmin, 18px);
      width: 100%;
      min-height: 132px;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 8px max(4px, calc((100vw - 980px) / 2));
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .qk-seq-slots::-webkit-scrollbar { display: none; }

    .qk-seq-slot,
    .qk-seq-item,
    .qk-seq-drag-clone {
      display: grid;
      place-items: center;
      width: clamp(104px, 17vmin, 156px);
      height: clamp(104px, 17vmin, 156px);
      min-width: 104px;
      min-height: 104px;
      border-radius: 24px;
      border: 5px solid var(--white);
      background: linear-gradient(180deg, #fffef8, #f5e6c4);
      box-shadow: var(--shadow);
      --qk-art-size: clamp(58px, 10vmin, 98px);
    }

    .qk-seq-slot {
      position: relative;
      flex: 0 0 auto;
      color: rgba(23, 81, 126, .55);
      background:
        linear-gradient(180deg, rgba(255,255,255,.44), rgba(255,255,255,0) 62%),
        rgba(255, 248, 232, .68);
      border-style: dashed;
    }

    .qk-seq-slot.is-filled {
      border-style: solid;
      background: linear-gradient(180deg, #ffffff, #fff1c9);
    }

    .qk-seq-slot-hole {
      width: 54%;
      height: 54%;
      border-radius: 20px;
      background:
        radial-gradient(circle at 50% 42%, rgba(23,81,126,.12), rgba(23,81,126,.04) 62%, transparent 63%);
    }

    .qk-seq-slot-marker {
      position: absolute;
      left: 50%;
      bottom: -23px;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 34px;
      height: 18px;
      pointer-events: none;
    }

    .qk-seq-slot-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--blue);
      box-shadow: 18px 0 0 var(--yellow), -18px 0 0 var(--green);
    }

    .qk-seq-tray {
      align-self: center;
      justify-self: center;
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(104px, 156px));
      justify-content: center;
      align-content: center;
      gap: clamp(12px, 2.2vmin, 20px);
      width: min(930px, 100%);
      min-height: 132px;
      padding: clamp(12px, 2vmin, 24px);
    }

    .qk-seq-item {
      position: relative;
      touch-action: none;
      color: var(--navy);
      transition: transform .16s ease, box-shadow .16s ease, opacity .16s ease;
    }

    .qk-seq-item.is-selected {
      transform: translateY(-8px) scale(1.04);
      box-shadow: 0 0 0 8px rgba(255,209,102,.88), var(--shadow);
    }

    .qk-seq-item.is-dragging {
      opacity: .42;
      transform: scale(.96);
    }

    .qk-seq-face {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .qk-seq-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 4;
    }

    .qk-seq-end-center {
      gap: clamp(16px, 3vmin, 28px);
    }

    .qk-seq-again {
      display: inline-grid;
      grid-auto-flow: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      min-width: min(430px, 84vw);
      background-color: var(--green);
    }

    .qk-seq-play-icon {
      width: 46px;
      height: 46px;
      background: transparent center / contain no-repeat url('${PLAY_IMG}');
    }

    .qk-seq-burst {
      position: absolute;
      z-index: 9;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }

    .qk-seq-burst span {
      position: absolute;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: hsl(var(--hue), 76%, 58%);
      animation: qk-seq-burst .8s ease-out both;
      animation-delay: var(--delay);
    }

    .qk-seq-drag-clone {
      position: fixed;
      z-index: 1000;
      pointer-events: none;
      margin: 0;
      opacity: .96;
      transition: transform .24s ease;
      touch-action: none;
    }

    .qk-seq-visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .qk-seq-pop { animation: qk-seq-pop .42s ease-out; }
    .qk-seq-wiggle { animation: qk-seq-wiggle .46s ease-in-out; }

    @keyframes qk-seq-pop {
      0% { transform: scale(.9); }
      55% { transform: scale(1.09); }
      100% { transform: scale(1); }
    }

    @keyframes qk-seq-wiggle {
      0%, 100% { transform: translateX(0) rotate(0); }
      22% { transform: translateX(-7px) rotate(-2deg); }
      48% { transform: translateX(7px) rotate(2deg); }
      72% { transform: translateX(-4px) rotate(-1deg); }
    }

    @keyframes qk-seq-burst {
      from { opacity: 1; transform: translate(-50%, -50%) scale(.3); }
      to { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1.1); }
    }

    @media (orientation: landscape) and (max-height: 620px) {
      .qk-seq-play {
        padding-bottom: max(96px, calc(86px + env(safe-area-inset-bottom)));
      }
      .qk-seq-hud { min-height: 86px; }
      .qk-seq-stage {
        grid-template-columns: 1fr 1fr;
        grid-template-rows: minmax(0, 1fr);
        align-items: center;
        gap: 12px;
      }
      .qk-seq-slots {
        flex-wrap: wrap;
        align-content: center;
        min-height: 0;
        overflow: visible;
      }
      .qk-seq-tray {
        min-height: 0;
        grid-template-columns: repeat(auto-fit, minmax(104px, 136px));
      }
      .qk-seq-slot,
      .qk-seq-item,
      .qk-seq-drag-clone {
        width: clamp(104px, 22vh, 136px);
        height: clamp(104px, 22vh, 136px);
        --qk-art-size: clamp(58px, 13vh, 86px);
      }
    }

    @media (max-width: 560px) {
      .qk-seq-hud { grid-template-columns: 96px 1fr 28px; }
      .qk-seq-dot { width: 18px; height: 18px; }
      .qk-seq-stage { gap: 18px; }
      .qk-seq-tray {
        grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-seq *, .qk-seq *::before, .qk-seq *::after,
      .qk-seq-drag-clone {
        animation-duration: .001ms !important;
        transition-duration: .001ms !important;
        scroll-behavior: auto !important;
      }
      .qk-seq-burst { display: none; }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
