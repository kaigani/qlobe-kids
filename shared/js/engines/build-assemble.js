// build-assemble.js - archetype engine for "build something from parts".
// Game authors supply builds in a 1000x1000 abstract space; this module owns
// scaling, drag/tap placement, warm feedback, round flow, and QLOBE_DEBUG.

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
const MIN_TOUCH = 96;
const SNAP_RADIUS_MULTIPLIER = 0.65; // diameter is about 1.3x the placed part.

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('build-assemble requires a mount element');
  installStyle();
  return new BuildAssembleGame(config, mountEl);
}

class BuildAssembleGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;
    this.destroyed = false;

    this.screen = 'splash';
    this.mode = null;
    this.roundBuilds = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.parts = [];
    this.slots = [];
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
      engine: 'build-assemble',
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
    const root = el('section', 'qk-build qk-build-splash');
    root.setAttribute('aria-label', this.config.title);

    const home = el('a', 'qk-build-img-btn qk-build-home');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', this.config.copy.home);
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const center = el('div', 'qk-build-splash-center');
    const artCard = el('div', 'qk-build-splash-art');
    artCard.appendChild(artEl(this.config.splashArt, this.config.title));
    const title = el('h1', '', this.config.title);
    const modeList = el('div', 'qk-build-mode-list');

    for (const mode of this.config.modes) {
      const button = el('button', 'qk-build-mode', mode.title || mode.id);
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

    const maxRounds = Math.min(mode.rounds || mode.builds.length, mode.builds.length);
    this.roundBuilds = shuffle(mode.builds.slice(), this.rng).slice(0, maxRounds);
    this.roundsTotal = this.roundBuilds.length;

    this.renderPlayShell();
    if (!this.roundsTotal) {
      await this.finishGame();
      return;
    }
    await this.showRound(0);
  }

  renderPlayShell() {
    this.mountEl.replaceChildren();
    const root = el('section', 'qk-build qk-build-play');
    root.setAttribute('aria-label', this.mode.title || this.config.title);

    const hud = el('header', 'qk-build-hud');
    const home = el('a', 'qk-build-img-btn qk-build-home');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', this.config.copy.home);
    home.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.playSfx('tick');
    });
    home.addEventListener('click', () => speech.stop());

    const progress = el('div', 'qk-build-progress');
    progress.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < this.roundsTotal; i++) {
      progress.appendChild(el('span', 'qk-build-dot'));
    }

    hud.append(home, progress, el('span', 'qk-build-hud-spacer'));

    const stage = el('main', 'qk-build-stage');
    const board = el('div', 'qk-build-board');
    board.appendChild(el('div', 'qk-build-canvas'));
    const tray = el('div', 'qk-build-tray');
    stage.append(board, tray);

    const sound = el('button', 'qk-build-img-btn qk-build-sound');
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

    const build = this.roundBuilds[index];
    this.slots = build.parts.map((part, slotIndex) => ({
      ...part,
      slotIndex,
      targetId: `slot:${slotIndex}`,
      occupantId: null,
      matchKey: part.matchKey || matchKey(part),
    }));
    this.parts = shuffle(build.parts.map((part, partIndex) => ({
      ...part,
      partIndex,
      id: `part:${partIndex}`,
      location: 'tray',
      matchKey: part.matchKey || matchKey(part),
    })), this.rng);

    this.updateDots();
    this.renderRound();
    this.speakLine(this.mode.prompt || this.config.voice.intro);
    this.scheduleIdlePrompt();
    await wait(WAIT_FOR_INPUT_MS);
  }

  renderRound() {
    this.renderCanvas();
    this.renderTray();
  }

  renderCanvas() {
    const canvas = this.mountEl.querySelector('.qk-build-canvas');
    if (!canvas) return;
    canvas.replaceChildren();

    for (const slot of this.slots) {
      const ghost = el('button', 'qk-build-slot');
      ghost.type = 'button';
      ghost.dataset.slotIndex = String(slot.slotIndex);
      ghost.dataset.targetId = slot.targetId;
      ghost.setAttribute('aria-label', slot.alt || `part ${slot.slotIndex + 1}`);
      this.positionPiece(ghost, slot, true);
      ghost.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.unlockAudio();
        this.attemptSelectedSlot(slot.slotIndex);
      });

      const ghostFace = el('span', 'qk-build-ghost-face');
      ghostFace.appendChild(artEl(slot.art, ''));
      ghost.appendChild(ghostFace);
      canvas.appendChild(ghost);
    }

    for (const slot of this.slots) {
      if (!slot.occupantId) continue;
      const part = this.findPart(slot.occupantId);
      const placed = el('div', 'qk-build-placed');
      placed.dataset.placedPartId = part.id;
      this.positionPiece(placed, slot, false);
      const face = el('span', 'qk-build-piece-face');
      face.appendChild(artEl(part.art, part.alt || ''));
      placed.appendChild(face);
      canvas.appendChild(placed);
    }
  }

  renderTray() {
    const tray = this.mountEl.querySelector('.qk-build-tray');
    if (!tray) return;
    tray.replaceChildren();

    for (const part of this.parts) {
      if (part.location !== 'tray') continue;
      const button = el('button', 'qk-build-part');
      button.type = 'button';
      button.dataset.partId = part.id;
      button.dataset.targetId = part.id;
      button.setAttribute('aria-label', part.alt || '');
      button.classList.toggle('is-selected', this.selectedId === part.id);
      button.classList.toggle('is-dimmed', !this.canUsePart(part));
      button.style.setProperty('--tray-size', `${Math.max(MIN_TOUCH, part.size * 0.36)}px`);
      button.style.setProperty('--qk-art-size', `${Math.max(58, Math.min(132, part.size * 0.24))}px`);

      const face = el('span', 'qk-build-piece-face');
      face.appendChild(artEl(part.art, part.alt || ''));
      button.appendChild(face);
      button.addEventListener('pointerdown', (e) => this.handlePartPointerDown(e, part.id));
      tray.appendChild(button);
    }
  }

  positionPiece(node, part, ghost) {
    const size = Math.max(40, part.size);
    node.style.left = `${part.x / 10}%`;
    node.style.top = `${part.y / 10}%`;
    node.style.width = `${size / 10}%`;
    node.style.height = `${size / 10}%`;
    node.style.setProperty('--qk-art-size', `min(${size * 0.72}px, ${size * 0.072}vmin)`);
    node.classList.toggle('is-ghost', ghost);
  }

  handlePartPointerDown(e, partId) {
    if (this.destroyed || !this.awaitingInput || this.inputLocked || this.activeDrag) return;
    if (e.isPrimary === false) return;
    const part = this.findPart(partId);
    if (!part || part.location !== 'tray') return;

    e.preventDefault();
    e.stopPropagation();
    this.unlockAudio();
    this.sweepStrayClones();
    const selected = this.selectPart(partId, { render: false });
    if (!selected.accepted) return;
    e.currentTarget.classList.add('is-selected');

    this.activeDrag = {
      pointerId: e.pointerId,
      partId,
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

    const slotIndex = this.slotIndexNearPoint(e.clientX, e.clientY, drag.partId);
    try {
      if (slotIndex == null) {
        await this.handleWrongPlacement(drag.partId, null, drag.clone);
      } else {
        await this.attemptPlacement(drag.partId, slotIndex, { clone: drag.clone });
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
      await this.animateCloneHome(drag.clone, this.partEl(drag.partId));
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
    clone.classList.add('drag-clone', 'qk-build-drag-clone');
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

  slotIndexNearPoint(x, y, partId) {
    const part = this.findPart(partId);
    let nearest = null;
    let nearestDistance = Infinity;

    for (const slot of this.slots) {
      if (slot.occupantId) continue;
      const slotEl = this.slotEl(slot.slotIndex);
      if (!slotEl) continue;
      const rect = slotEl.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const distance = Math.hypot(x - centerX, y - centerY);
      const radius = Math.max(MIN_TOUCH / 2, Math.max(rect.width, rect.height) * SNAP_RADIUS_MULTIPLIER);
      if (distance <= radius && distance < nearestDistance) {
        nearest = slot.slotIndex;
        nearestDistance = distance;
      }
    }

    if (nearest != null) return nearest;

    const elAtPoint = document.elementFromPoint(x, y);
    const direct = elAtPoint && elAtPoint.closest && elAtPoint.closest('[data-slot-index]');
    if (direct) return Number(direct.dataset.slotIndex);

    if (!part) return null;
    return null;
  }

  selectPart(partId, opts = {}) {
    const part = this.findPart(partId);
    if (!part || part.location !== 'tray' || !this.canUsePart(part)) {
      this.gentleNudge(partId);
      return { accepted: false };
    }
    this.selectedId = partId;
    this.playSfx('pop');
    if (opts.render !== false) this.renderRound();
    return { accepted: true };
  }

  async attemptSelectedSlot(slotIndex) {
    if (!this.selectedId || this.inputLocked) return { accepted: false };
    return this.attemptPlacement(this.selectedId, slotIndex);
  }

  async attemptPlacement(partId, slotIndex, opts = {}) {
    const part = this.findPart(partId);
    const slot = this.slots[slotIndex];
    const slotEl = this.slotEl(slotIndex);
    if (!part || !slot || !this.awaitingInput || this.inputLocked || part.location !== 'tray') {
      if (opts.clone) opts.clone.remove();
      return { accepted: false };
    }

    this.clearIdleTimer();
    this.inputLocked = true;

    if (this.canUsePart(part) && !slot.occupantId && slot.matchKey === part.matchKey) {
      await this.handleCorrectPlacement(part, slot, opts.clone);
      return { accepted: true };
    }

    await this.handleWrongPlacement(part.id, slotEl, opts.clone);
    return { accepted: true };
  }

  async handleCorrectPlacement(part, slot, clone) {
    this.playSfx('pop');
    this.playSfx('sparkle');
    if (clone) clone.remove();

    slot.occupantId = part.id;
    part.location = 'slot';
    this.selectedId = null;
    this.renderRound();

    const placed = this.placedEl(part.id);
    if (placed) {
      animateOnce(placed, 'qk-build-pop');
      this.createBurst(placed, 14);
    }

    await this.speakLine(part.say || part.alt, true);

    if (this.isRoundComplete()) {
      await this.completeRound();
    } else {
      this.inputLocked = false;
      this.scheduleIdlePrompt();
    }
  }

  async handleWrongPlacement(partId, slotEl, clone) {
    this.playSfx('boing');
    if (slotEl) animateOnce(slotEl, 'qk-build-wiggle');
    const partEl = this.partEl(partId);
    if (partEl) animateOnce(partEl, 'qk-build-wiggle');

    if (clone) {
      await this.animateCloneHome(clone, partEl);
    } else if (slotEl && partEl) {
      await this.animateReturnFromSlot(partEl, slotEl);
    }

    this.selectedId = null;
    this.renderTray();
    await this.speakLine(this.config.voice.nudge, true);
    this.inputLocked = false;
    this.scheduleIdlePrompt();
  }

  gentleNudge(partId) {
    const partEl = partId ? this.partEl(partId) : null;
    if (partEl) animateOnce(partEl, 'qk-build-wiggle');
    this.playSfx('boing');
    this.speakLine(this.config.voice.wait || this.config.voice.nudge, true);
  }

  async completeRound() {
    this.awaitingInput = false;
    this.inputLocked = true;
    this.selectedId = null;
    this.playSfx('tada');

    const board = this.mountEl.querySelector('.qk-build-canvas');
    if (board) {
      animateOnce(board, 'qk-build-built');
      this.createBurst(board, 28);
    }

    const build = this.roundBuilds[this.roundIndex];
    await this.speakLine(build && build.say, true);
    await wait(this.reducedMotion() ? 120 : 680);

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
    const root = el('section', 'qk-build qk-build-end');
    root.setAttribute('aria-label', this.config.voice.cheer);

    const home = el('a', 'qk-build-img-btn qk-build-home');
    home.href = HOME_HREF;
    home.setAttribute('aria-label', this.config.copy.home);
    home.addEventListener('pointerdown', (e) => e.stopPropagation());

    const center = el('div', 'qk-build-end-center');
    const artCard = el('div', 'qk-build-end-art');
    artCard.appendChild(artEl(this.config.endArt || this.config.splashArt, ''));
    const title = el('h1', '', this.config.voice.cheer);
    const again = el('button', 'qk-build-again');
    again.type = 'button';
    const icon = el('span', 'qk-build-play-icon');
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
    this.mountEl.querySelectorAll('.qk-build-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  createBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-build') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burst = el('div', 'qk-build-burst');
    burst.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;

    for (let i = 0; i < count; i++) {
      const piece = el('span');
      const angle = (Math.PI * 2 * i) / count;
      const distance = 58 + this.fxRng() * 102;
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

  async animateReturnFromSlot(partEl, slotEl) {
    if (!partEl || !slotEl || this.reducedMotion()) return;
    const partRect = partEl.getBoundingClientRect();
    const slotRect = slotEl.getBoundingClientRect();
    const clone = partEl.cloneNode(true);
    clone.classList.add('drag-clone', 'qk-build-drag-clone');
    clone.style.width = `${partRect.width}px`;
    clone.style.height = `${partRect.height}px`;
    clone.style.left = `${slotRect.left + slotRect.width / 2 - partRect.width / 2}px`;
    clone.style.top = `${slotRect.top + slotRect.height / 2 - partRect.height / 2}px`;
    document.body.appendChild(clone);
    await this.animateCloneHome(clone, partEl);
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
    const selected = this.selectedId ? this.findPart(this.selectedId) : null;

    for (const slot of this.slots) {
      const node = this.slotEl(slot.slotIndex);
      if (!node) continue;
      const role = selected
        ? (this.canUsePart(selected) && !slot.occupantId && slot.matchKey === selected.matchKey ? 'correct' : 'wrong')
        : 'neutral';
      targets.push(targetFromEl(slot.targetId, role, node));
    }

    for (const part of this.parts) {
      if (part.location !== 'tray') continue;
      const node = this.partEl(part.id);
      if (node) targets.push(targetFromEl(part.id, 'neutral', node));
    }

    return targets;
  }

  async debugTap(targetId) {
    if (this.screen !== 'play' || this.destroyed) return { accepted: false };
    if (targetId.startsWith('part:')) return this.selectPart(targetId);
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

    for (const slot of this.slots) {
      if (slot.occupantId) continue;
      const part = this.parts.find((candidate) => (
        candidate.location === 'tray' && candidate.matchKey === slot.matchKey
      ));
      if (part) {
        part.location = 'slot';
        slot.occupantId = part.id;
      }
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

  canUsePart(part) {
    if (!part || part.location !== 'tray') return false;
    const build = this.roundBuilds[this.roundIndex];
    if (!build || !build.ordered) return true;
    const nextSlot = this.slots.find((slot) => !slot.occupantId);
    return !!nextSlot && nextSlot.slotIndex === part.partIndex;
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

  findPart(partId) {
    return this.parts.find((part) => part.id === partId);
  }

  partEl(partId) {
    return this.mountEl.querySelector(`[data-part-id="${cssEscape(partId)}"]`);
  }

  slotEl(index) {
    return this.mountEl.querySelector(`[data-slot-index="${index}"]`);
  }

  placedEl(partId) {
    return this.mountEl.querySelector(`[data-placed-part-id="${cssEscape(partId)}"]`);
  }

  isRoundComplete() {
    return this.slots.length > 0 && this.slots.every((slot) => slot.occupantId);
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
    nudge: 'Try another spot.',
    wait: 'That piece comes later.',
    cheer: 'You built them all!',
    ...(config.voice || {}),
  };

  const modes = Array.isArray(config.modes) && config.modes.length
    ? config.modes
    : [{
      id: config.id || 'build',
      title: config.title || 'Build',
      rounds: config.rounds,
      prompt: config.prompt,
      builds: config.builds || [],
    }];

  return {
    ...config,
    id: config.id || 'build-assemble',
    title: config.title || 'Build It',
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || firstBuildArt(modes) || 'emoji:🧩'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    copy,
    voice,
    modes: modes.map(normalizeMode).filter((mode) => mode.builds.length),
  };
}

function normalizeMode(mode = {}) {
  const builds = (mode.builds || [])
    .map(normalizeBuild)
    .filter((build) => build.parts.length >= 2);

  return {
    ...mode,
    id: mode.id || 'build',
    title: mode.title || 'Build',
    rounds: Math.min(mode.rounds || builds.length, builds.length),
    prompt: mode.prompt || '',
    builds,
  };
}

function normalizeBuild(build = {}) {
  const parts = (build.parts || [])
    .filter((part) => part && part.art)
    .map((part, index) => ({
      ...part,
      art: normalizeArtRef(part.art),
      alt: part.alt || `part ${index + 1}`,
      x: clampNumber(part.x, 500, 0, 1000),
      y: clampNumber(part.y, 500, 0, 1000),
      size: clampNumber(part.size, 160, 60, 900),
    }));

  return {
    ...build,
    name: build.name || 'build',
    say: build.say || '',
    ordered: !!build.ordered,
    parts,
  };
}

function firstBuildArt(modes) {
  for (const mode of modes) {
    for (const build of mode.builds || []) {
      if (build.parts && build.parts[0] && build.parts[0].art) return build.parts[0].art;
    }
  }
  return null;
}

function normalizeArtRef(ref) {
  if (!ref) return 'emoji:🧩';
  if (ref.includes(':')) return ref;
  return `emoji:${ref}`;
}

function matchKey(part) {
  return `${part.art}|${part.alt || ''}`;
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
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
  window.setTimeout(() => node.classList.remove(className), 760);
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
  if (styleInstalled || document.getElementById('qk-build-style')) {
    styleInstalled = true;
    return;
  }

  const style = document.createElement('style');
  style.id = 'qk-build-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-build, .qk-build * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-build {
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
        radial-gradient(circle at 18% 18%, rgba(255,255,255,.42) 0 8px, transparent 9px),
        radial-gradient(circle at 78% 26%, rgba(255,255,255,.34) 0 12px, transparent 13px),
        radial-gradient(circle at 48% 88%, rgba(255,255,255,.28) 0 9px, transparent 10px);
      background-size: 160px 160px, 230px 230px, 200px 200px;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
    }

    .qk-build button, .qk-build a {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    .qk-build button {
      border: 0;
      cursor: pointer;
    }

    .qk-build button:focus-visible,
    .qk-build a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .7);
      outline-offset: 4px;
    }

    .qk-build-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
    }

    .qk-build-img-btn:active { transform: scale(.93); }
    .qk-build-home { background-image: url('${HOME_IMG}'); }
    .qk-build-sound { background-image: url('${SOUND_IMG}'); }

    .qk-build-splash,
    .qk-build-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }

    .qk-build-home {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 5;
    }

    .qk-build-splash-center,
    .qk-build-end-center {
      width: min(900px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(14px, 2.5vmin, 24px);
      text-align: center;
      padding-top: 54px;
    }

    .qk-build-splash-art,
    .qk-build-end-art {
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

    .qk-build h1 {
      margin: 0;
      max-width: 13ch;
      color: var(--navy);
      font-size: clamp(38px, 7vmin, 78px);
      line-height: .98;
      letter-spacing: 0;
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
    }

    .qk-build-mode-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px;
      width: min(760px, 100%);
      margin-top: 6px;
    }

    .qk-build-mode,
    .qk-build-again {
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

    .qk-build-mode:nth-child(2n) { background-color: var(--green); }
    .qk-build-mode:nth-child(3n) { background-color: var(--coral); }
    .qk-build-mode:active,
    .qk-build-again:active { transform: scale(.96); }

    .qk-build-play {
      display: grid;
      grid-template-rows: auto 1fr;
      min-height: 100dvh;
      padding: max(10px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right))
        max(116px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
    }

    .qk-build-hud {
      position: relative;
      z-index: 4;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      gap: 10px;
      min-height: 100px;
    }

    .qk-build-progress {
      justify-self: center;
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 10px;
      max-width: min(560px, 58vw);
      padding: 10px 14px;
      border-radius: 999px;
      background: rgba(255,255,255,.42);
    }

    .qk-build-dot {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: rgba(255,255,255,.88);
      box-shadow: inset 0 -2px 0 rgba(23,81,126,.12);
    }

    .qk-build-dot.is-filled { background: var(--green); }
    .qk-build-dot.is-current {
      background: var(--yellow);
      box-shadow: 0 0 0 4px rgba(255,255,255,.72), inset 0 -2px 0 rgba(23,81,126,.12);
    }

    .qk-build-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: minmax(0, 1fr) auto;
      gap: clamp(10px, 2vmin, 20px);
      align-items: stretch;
    }

    .qk-build-board {
      min-height: 0;
      display: grid;
      place-items: center;
      padding: 4px;
    }

    .qk-build-canvas {
      position: relative;
      width: min(78vmin, 760px);
      aspect-ratio: 1;
      max-width: 100%;
      max-height: 100%;
      border-radius: 28px;
      background:
        linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,248,232,.78)),
        radial-gradient(circle at 50% 50%, rgba(45,125,210,.12), transparent 62%);
      border: 5px solid rgba(255,255,255,.95);
      box-shadow: var(--shadow);
      overflow: visible;
      touch-action: manipulation;
    }

    .qk-build-slot,
    .qk-build-placed {
      position: absolute;
      display: grid;
      place-items: center;
      transform: translate(-50%, -50%);
      border-radius: 22%;
    }

    .qk-build-slot {
      min-width: 96px;
      min-height: 96px;
      padding: 0;
      background: transparent;
      opacity: .25;
      touch-action: manipulation;
    }

    .qk-build-slot.is-ghost.is-selected-correct { opacity: .42; }

    .qk-build-ghost-face,
    .qk-build-piece-face {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      pointer-events: none;
    }

    .qk-build-placed {
      min-width: 40px;
      min-height: 40px;
      pointer-events: none;
      z-index: 2;
      filter: drop-shadow(0 8px 8px rgba(23,81,126,.16));
    }

    .qk-build-tray {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: clamp(10px, 1.8vmin, 18px);
      min-height: 118px;
      max-height: 28dvh;
      overflow: auto;
      padding: 10px 112px 2px;
      scrollbar-width: none;
      touch-action: manipulation;
    }

    .qk-build-tray::-webkit-scrollbar { display: none; }

    .qk-build-part {
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: var(--tray-size, 112px);
      height: var(--tray-size, 112px);
      min-width: 96px;
      min-height: 96px;
      border-radius: 24px;
      border: 5px solid var(--white);
      background: linear-gradient(180deg, #ffffff, #fff3d0);
      box-shadow: 0 5px 0 rgba(23,81,126,.14), 0 10px 20px rgba(23,81,126,.15);
      touch-action: none;
    }

    .qk-build-part.is-selected {
      border-color: var(--yellow);
      box-shadow: 0 0 0 5px rgba(255,209,102,.34), 0 5px 0 rgba(23,81,126,.14), 0 10px 20px rgba(23,81,126,.15);
      transform: translateY(-4px) scale(1.04);
    }

    .qk-build-part.is-dimmed {
      opacity: .38;
      filter: grayscale(.2);
    }

    .qk-build-part.is-dragging {
      opacity: .35;
    }

    .qk-build-part:active { transform: scale(.96); }
    .qk-build-part.is-selected:active { transform: translateY(-4px) scale(.99); }

    .qk-build-drag-clone {
      position: fixed;
      z-index: 9999;
      pointer-events: none;
      margin: 0;
      transition: transform .24s ease;
      opacity: .96;
    }

    .qk-build-sound {
      position: absolute;
      left: max(12px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 5;
    }

    .qk-build-burst {
      position: absolute;
      left: 0;
      top: 0;
      z-index: 9;
      pointer-events: none;
    }

    .qk-build-burst span {
      position: absolute;
      width: 16px;
      height: 16px;
      border-radius: 5px;
      background: hsl(var(--hue), 80%, 58%);
      animation: qk-build-burst .82s ease-out forwards;
      animation-delay: var(--delay);
    }

    .qk-build-pop { animation: qk-build-pop .42s cubic-bezier(.2, 1.4, .35, 1); }
    .qk-build-built { animation: qk-build-built .62s cubic-bezier(.2, 1.35, .35, 1); }
    .qk-build-wiggle { animation: qk-build-wiggle .48s ease; }

    .qk-build-play-icon {
      display: inline-block;
      width: 58px;
      height: 58px;
      margin-right: 10px;
      vertical-align: middle;
      background: url('${PLAY_IMG}') center / contain no-repeat;
    }

    .qk-build-again {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: min(360px, 90vw);
      background-color: var(--green);
    }

    @keyframes qk-build-pop {
      0% { transform: translate(-50%, -50%) scale(.72); }
      60% { transform: translate(-50%, -50%) scale(1.12); }
      100% { transform: translate(-50%, -50%) scale(1); }
    }

    @keyframes qk-build-built {
      0%, 100% { transform: scale(1); }
      45% { transform: scale(1.045); }
      72% { transform: scale(.985); }
    }

    @keyframes qk-build-wiggle {
      0%, 100% { transform: translateX(0); }
      20% { transform: translateX(-8px) rotate(-2deg); }
      40% { transform: translateX(8px) rotate(2deg); }
      60% { transform: translateX(-5px) rotate(-1deg); }
      80% { transform: translateX(5px) rotate(1deg); }
    }

    @keyframes qk-build-burst {
      from { opacity: 1; transform: translate(-50%, -50%) scale(.8); }
      to { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(.2) rotate(220deg); }
    }

    @media (orientation: landscape) {
      .qk-build-stage {
        grid-template-columns: minmax(0, 1fr) minmax(132px, 24vw);
        grid-template-rows: minmax(0, 1fr);
      }

      .qk-build-canvas {
        width: min(70vmin, 680px);
      }

      .qk-build-tray {
        align-content: center;
        max-height: none;
        padding: 8px 4px 104px 4px;
      }
    }

    @media (max-width: 680px) {
      .qk-build-play {
        padding-left: max(8px, env(safe-area-inset-left));
        padding-right: max(8px, env(safe-area-inset-right));
      }

      .qk-build-hud {
        grid-template-columns: 96px 1fr 32px;
      }

      .qk-build-progress { max-width: 48vw; }
      .qk-build-canvas { width: min(94vw, 64dvh); }
      .qk-build-tray { padding-left: 4px; padding-right: 4px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-build *,
      .qk-build-drag-clone {
        animation-duration: .01ms !important;
        transition-duration: .01ms !important;
      }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
