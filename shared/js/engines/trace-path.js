// trace-path.js — archetype engine for finger tracing.
// Game authors provide 1000x1000 polylines; this module owns scaling,
// pointer tracing, gentle off-path nudges, celebration, and QLOBE_DEBUG.

import * as sfx from '../sfx.js';
import * as speech from '../speech.js';
import { artEl } from './art.js';

const FONT_URL = new URL('../../fonts/fredoka-latin-600-normal.woff2', import.meta.url).href;
const HOME_IMG = new URL('../../assets/ui/btn-home.png', import.meta.url).href;
const SOUND_IMG = new URL('../../assets/ui/btn-sound.png', import.meta.url).href;
const PLAY_IMG = new URL('../../assets/ui/btn-play.png', import.meta.url).href;
const HOME_HREF = '../../';

const WAIT_FOR_INPUT_MS = 80;
const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const WANDER_NUDGE_MS = 1500;
const TARGET_SIZE = 104;
const SAMPLE_STEP_PX = 16;
const SEARCH_BACK = 5;
const SEARCH_AHEAD = 34;

let styleInstalled = false;
let debugOwner = 0;

export function createGame(config, mountEl) {
  if (!mountEl) throw new Error('trace-path requires a mount element');
  installStyle();
  return new TracePathGame(config, mountEl);
}

class TracePathGame {
  constructor(config, mountEl) {
    this.config = normalizeConfig(config);
    this.mountEl = mountEl;
    this.id = ++debugOwner;
    this.previousDebug = window.QLOBE_DEBUG;
    this.destroyed = false;

    this.screen = 'splash';
    this.mode = null;
    this.roundPaths = [];
    this.roundIndex = 0;
    this.roundsTotal = 0;
    this.currentPath = null;
    this.currentStrokes = [];
    this.strokeIndex = 0;
    this.strokeProgress = [];
    this.strokesScreen = [];
    this.pathBounds = null;

    this.awaitingInput = false;
    this.inputLocked = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.lastReplay = 0;
    this.idleTimer = 0;
    this.idlePrompted = false;
    this.wanderTimer = 0;
    this.wanderNudged = false;
    this.demoFrame = 0;
    this.activeTrace = null;
    this.rng = Math.random;
    this.fxRng = Math.random;

    this.onFirstPointer = () => this.unlockAudio();
    this.onContextMenu = (e) => e.preventDefault();
    this.onGestureStart = (e) => e.preventDefault();
    this.onWindowMove = (e) => this.handleWindowMove(e);
    this.onWindowUp = (e) => this.handleWindowUp(e);
    this.onWindowCancel = (e) => this.handleWindowCancel(e);
    this.onWindowBlur = () => this.cancelTrace();
    this.onResize = () => this.refreshGeometry();

    window.addEventListener('pointerdown', this.onFirstPointer);
    window.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('gesturestart', this.onGestureStart);
    window.addEventListener('blur', this.onWindowBlur);
    window.addEventListener('resize', this.onResize);

    this.renderSplash();
    this.ready = Promise.resolve();
    this.installDebugHook();
  }

  destroy() {
    this.destroyed = true;
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    speech.stop();
    window.removeEventListener('pointerdown', this.onFirstPointer);
    window.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('gesturestart', this.onGestureStart);
    window.removeEventListener('blur', this.onWindowBlur);
    window.removeEventListener('resize', this.onResize);
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
      engine: 'trace-path',
      ready: this.ready,
      listModes: () => this.config.modes.map((mode) => ({ id: mode.id, title: mode.title })),
      startMode: (id) => this.startMode(id),
      getState: () => this.getState(),
      getTargets: () => this.getTargets(),
      tap: (targetId) => this.debugTap(targetId),
      winRound: () => this.winRound(),
      tracePoints: () => this.tracePoints(),
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
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    speech.stop();

    this.mountEl.replaceChildren();
    const root = el('section', 'qk-trace qk-trace-splash');
    root.setAttribute('aria-label', this.config.title);

    const home = this.renderImageButton('qk-trace-home', this.config.copy.home, HOME_HREF);
    const center = el('div', 'qk-trace-splash-center');
    const artCard = el('div', 'qk-trace-splash-art');
    artCard.appendChild(artEl(this.config.splashArt, this.config.title));
    const title = el('h1', '', this.config.title);
    const modeList = el('div', 'qk-trace-mode-list');

    for (const mode of this.config.modes) {
      const button = el('button', 'qk-trace-mode', mode.title || mode.id);
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
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    speech.stop();
    this.mode = mode;
    this.screen = 'play';
    this.roundIndex = 0;

    const paths = mode.shuffle === false ? mode.paths.slice() : shuffle(mode.paths.slice(), this.rng);
    const maxRounds = Math.min(mode.rounds || paths.length, paths.length);
    this.roundPaths = paths.slice(0, maxRounds);
    this.roundsTotal = this.roundPaths.length;

    this.renderPlayShell();
    if (!this.roundsTotal) {
      await this.finishGame();
      return;
    }
    await this.showRound(0);
  }

  renderPlayShell() {
    this.mountEl.replaceChildren();
    const root = el('section', 'qk-trace qk-trace-play');
    root.setAttribute('aria-label', this.mode.title || this.config.title);

    const hud = el('header', 'qk-trace-hud');
    const home = this.renderImageButton('qk-trace-home', this.config.copy.home, HOME_HREF);
    const progress = el('div', 'qk-trace-progress');
    progress.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < this.roundsTotal; i++) {
      progress.appendChild(el('span', 'qk-trace-dot'));
    }
    hud.append(home, progress, el('span', 'qk-trace-hud-spacer'));

    const stage = el('main', 'qk-trace-stage');
    stage.addEventListener('pointerdown', (e) => this.handleStagePointerDown(e), { passive: false });

    const sound = this.renderImageButton('qk-trace-sound', this.config.copy.replay);
    sound.addEventListener('click', () => this.replayPromptFromHud());

    root.append(hud, stage, sound);
    this.mountEl.appendChild(root);
  }

  async showRound(index) {
    if (this.destroyed || this.screen !== 'play') return;

    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.roundIndex = index;
    this.currentPath = this.roundPaths[index];
    this.currentStrokes = normalizePathPoints(this.currentPath.points);
    this.strokeIndex = 0;
    this.strokeProgress = this.currentStrokes.map(() => ({ index: 0, ratio: 0 }));
    this.strokesScreen = [];
    this.pathBounds = null;
    this.awaitingInput = true;
    this.inputLocked = false;
    this.idlePrompted = false;
    this.wanderNudged = false;
    this.updateDots();
    this.renderRound();
    await nextFrame();
    this.refreshGeometry();
    this.positionTravelerAtCurrentStart();
    this.speakLine(this.currentPrompt());
    this.scheduleIdlePrompt();
    this.playDemo();
    await wait(WAIT_FOR_INPUT_MS);
  }

  renderRound() {
    const stage = this.mountEl.querySelector('.qk-trace-stage');
    if (!stage) return;
    stage.replaceChildren();

    const prompt = el('div', 'qk-trace-prompt', this.currentPrompt());
    const field = el('div', 'qk-trace-field');
    field.classList.toggle('is-reduced', this.reducedMotion());

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'qk-trace-svg');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true');

    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filter.setAttribute('id', `qk-trace-crayon-${this.id}`);
    const turbulence = document.createElementNS('http://www.w3.org/2000/svg', 'feTurbulence');
    turbulence.setAttribute('type', 'fractalNoise');
    turbulence.setAttribute('baseFrequency', '0.025');
    turbulence.setAttribute('numOctaves', '2');
    turbulence.setAttribute('seed', String(3 + Math.floor(this.fxRng() * 90)));
    const displacement = document.createElementNS('http://www.w3.org/2000/svg', 'feDisplacementMap');
    displacement.setAttribute('in', 'SourceGraphic');
    displacement.setAttribute('scale', '3');
    filter.append(turbulence, displacement);
    defs.appendChild(filter);
    svg.appendChild(defs);

    this.currentStrokes.forEach((points, index) => {
      const d = smoothPath(points);
      const guide = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      guide.setAttribute('class', 'qk-trace-guide');
      guide.setAttribute('d', d);
      guide.setAttribute('pathLength', '1000');
      guide.dataset.strokeIndex = String(index);

      const fill = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      fill.setAttribute('class', 'qk-trace-fill');
      fill.setAttribute('d', d);
      fill.setAttribute('filter', `url(#qk-trace-crayon-${this.id})`);
      fill.style.stroke = this.mode.strokeColor || this.config.strokeColor;
      fill.dataset.strokeIndex = String(index);

      svg.append(guide, fill);
    });

    const markerLayer = el('div', 'qk-trace-markers');
    this.currentStrokes.forEach((points, index) => {
      const marker = el('div', 'qk-trace-start');
      marker.dataset.startIndex = String(index);
      marker.dataset.targetId = `start:${index}`;
      marker.setAttribute('aria-hidden', 'true');
      marker.textContent = this.reducedMotion() ? String(index + 1) : this.mode.startMarker;
      markerLayer.appendChild(marker);
    });

    const demoDot = el('div', 'qk-trace-demo-dot');
    const traveler = el('div', 'qk-trace-traveler');
    traveler.appendChild(artEl(this.mode.traveler || this.config.traveler, ''));

    field.append(svg, markerLayer, demoDot, traveler);
    stage.append(prompt, field);
  }

  renderImageButton(className, label, href) {
    const node = href ? el('a', `qk-trace-img-btn ${className}`) : el('button', `qk-trace-img-btn ${className}`);
    if (href) node.href = href;
    else node.type = 'button';
    node.setAttribute('aria-label', label);
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.unlockAudio();
      this.playSfx('tick');
    });
    return node;
  }

  handleStagePointerDown(e) {
    if (this.destroyed || !this.awaitingInput || this.inputLocked || this.activeTrace) return;
    if (e.isPrimary === false) return;
    e.preventDefault();
    this.unlockAudio();
    this.cancelDemo();
    this.clearIdleTimer();

    if (this.isNearCurrentStart(e.clientX, e.clientY)) {
      this.speakLine(this.currentPrompt(), true);
    }

    this.activeTrace = {
      pointerId: e.pointerId,
      moved: false,
      offPath: false,
    };
    window.addEventListener('pointermove', this.onWindowMove, { passive: false });
    window.addEventListener('pointerup', this.onWindowUp, { passive: false });
    window.addEventListener('pointercancel', this.onWindowCancel, { passive: false });
    this.applyTracePoint({ x: e.clientX, y: e.clientY });
  }

  handleWindowMove(e) {
    const trace = this.activeTrace;
    if (!trace || e.pointerId !== trace.pointerId) return;
    e.preventDefault();
    trace.moved = true;
    this.applyTracePoint({ x: e.clientX, y: e.clientY });
  }

  handleWindowUp(e) {
    const trace = this.activeTrace;
    if (!trace || e.pointerId !== trace.pointerId) return;
    e.preventDefault();
    this.cancelTrace();
    if (this.awaitingInput) this.scheduleIdlePrompt();
  }

  handleWindowCancel(e) {
    const trace = this.activeTrace;
    if (!trace || e.pointerId !== trace.pointerId) return;
    e.preventDefault();
    this.cancelTrace();
    if (this.awaitingInput) this.scheduleIdlePrompt();
  }

  cancelTrace() {
    this.removeTraceListeners();
    this.activeTrace = null;
    this.clearWanderTimer();
    const field = this.mountEl.querySelector('.qk-trace-field');
    if (field) field.classList.remove('is-wandering', 'is-tracing');
  }

  removeTraceListeners() {
    window.removeEventListener('pointermove', this.onWindowMove);
    window.removeEventListener('pointerup', this.onWindowUp);
    window.removeEventListener('pointercancel', this.onWindowCancel);
  }

  applyTracePoint(point) {
    if (!this.awaitingInput || this.inputLocked || !this.strokesScreen.length) return false;
    const stroke = this.strokesScreen[this.strokeIndex];
    if (!stroke || !stroke.points.length) return false;

    const current = this.strokeProgress[this.strokeIndex] || { index: 0, ratio: 0 };
    const start = Math.max(0, current.index - SEARCH_BACK);
    const end = Math.min(stroke.points.length - 1, current.index + SEARCH_AHEAD);
    let bestIndex = current.index;
    let bestDistance = Infinity;

    for (let i = start; i <= end; i++) {
      const candidate = stroke.points[i];
      const distance = Math.hypot(point.x - candidate.x, point.y - candidate.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    const tolerance = this.mode.tolerance || this.config.tolerance;
    if (bestDistance > tolerance) {
      this.handleWander();
      return false;
    }

    this.clearWanderTimer();
    const field = this.mountEl.querySelector('.qk-trace-field');
    if (field) field.classList.add('is-tracing');
    if (field) field.classList.remove('is-wandering');

    if (bestIndex > current.index) {
      const ratio = stroke.totalLength > 0 ? stroke.lengths[bestIndex] / stroke.totalLength : 1;
      this.strokeProgress[this.strokeIndex] = { index: bestIndex, ratio };
      this.updateStrokeFill(this.strokeIndex);
      this.positionTraveler(stroke.points[bestIndex]);
    } else {
      this.positionTraveler(point);
    }

    if (bestIndex >= stroke.points.length - 2 || (stroke.totalLength - stroke.lengths[bestIndex]) <= tolerance * 0.45) {
      this.completeStroke();
    }
    return true;
  }

  handleWander() {
    const field = this.mountEl.querySelector('.qk-trace-field');
    if (field) field.classList.add('is-wandering');
    if (!this.activeTrace || this.wanderTimer || this.wanderNudged) return;
    this.wanderTimer = window.setTimeout(() => {
      this.wanderTimer = 0;
      if (!this.activeTrace || this.destroyed || !this.awaitingInput || this.wanderNudged) return;
      this.wanderNudged = true;
      this.speakLine(this.config.voice.nudge, true);
    }, WANDER_NUDGE_MS);
  }

  async completeStroke() {
    if (!this.awaitingInput || this.inputLocked) return;
    const stroke = this.strokesScreen[this.strokeIndex];
    if (stroke) {
      this.strokeProgress[this.strokeIndex] = { index: stroke.points.length - 1, ratio: 1 };
      this.updateStrokeFill(this.strokeIndex);
      this.positionTraveler(stroke.points[stroke.points.length - 1]);
    }
    this.playSfx('pop');

    if (this.strokeIndex < this.currentStrokes.length - 1) {
      this.strokeIndex += 1;
      this.updateStartMarkers();
      this.positionTravelerAtCurrentStart();
      return;
    }

    await this.completeRound();
  }

  async completeRound() {
    if (this.inputLocked || !this.awaitingInput) return;
    this.inputLocked = true;
    this.awaitingInput = false;
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.playSfx('sparkle');
    this.playSfx('pop');

    const field = this.mountEl.querySelector('.qk-trace-field');
    if (field) {
      field.classList.remove('is-wandering', 'is-tracing');
      field.classList.add('is-complete');
      this.createBurst(field, 26);
    }

    await this.speakLine((this.currentPath && this.currentPath.say) || this.config.voice.yums[this.roundIndex % this.config.voice.yums.length], true);
    await wait(this.reducedMotion() ? 100 : 620);

    const next = this.roundIndex + 1;
    if (next >= this.roundsTotal) {
      await this.finishGame();
    } else {
      await this.showRound(next);
    }
  }

  async finishGame() {
    if (this.destroyed) return;
    this.screen = 'end';
    this.awaitingInput = false;
    this.inputLocked = false;
    this.clearIdleTimer();
    this.clearWanderTimer();
    this.cancelDemo();
    this.removeTraceListeners();
    this.playSfx('tada');

    this.mountEl.replaceChildren();
    const root = el('section', 'qk-trace qk-trace-end');
    root.setAttribute('aria-label', this.config.voice.cheer);

    const home = this.renderImageButton('qk-trace-home', this.config.copy.home, HOME_HREF);
    const center = el('div', 'qk-trace-end-center');
    const artCard = el('div', 'qk-trace-end-art');
    artCard.appendChild(artEl(this.config.endArt || this.config.splashArt, ''));
    const title = el('h1', '', this.config.voice.cheer);
    const again = el('button', 'qk-trace-again');
    again.type = 'button';
    const icon = el('span', 'qk-trace-play-icon');
    icon.setAttribute('aria-hidden', 'true');
    again.append(icon, el('span', '', this.config.copy.playAgain));
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
    this.replayPrompt();
  }

  async replayPrompt() {
    if (this.screen !== 'play' || !this.mode) return;
    this.clearIdleTimer();
    this.playSfx('tick');
    await this.speakLine(this.currentPrompt(), true);
    this.scheduleIdlePrompt();
  }

  scheduleIdlePrompt() {
    this.clearIdleTimer();
    if (this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
    this.idleTimer = window.setTimeout(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || !this.awaitingInput) return;
      this.idlePrompted = true;
      this.speakLine(this.currentPrompt(), true);
    }, IDLE_MS);
  }

  clearIdleTimer() {
    if (!this.idleTimer) return;
    window.clearTimeout(this.idleTimer);
    this.idleTimer = 0;
  }

  clearWanderTimer() {
    if (!this.wanderTimer) return;
    window.clearTimeout(this.wanderTimer);
    this.wanderTimer = 0;
  }

  refreshGeometry() {
    if (this.screen !== 'play') return;
    const svg = this.mountEl.querySelector('.qk-trace-svg');
    if (!svg) return;
    this.strokesScreen = Array.from(svg.querySelectorAll('.qk-trace-fill')).map((path, index) => {
      const points = sampleSvgPath(svg, path);
      const lengths = cumulativeLengths(points);
      const totalLength = lengths.length ? lengths[lengths.length - 1] : 0;
      return { index, path, points, lengths, totalLength };
    });
    this.pathBounds = boundsFromPoints(this.strokesScreen.flatMap((stroke) => stroke.points), this.mode.tolerance || this.config.tolerance);
    this.strokesScreen.forEach((stroke) => this.setupStrokeDash(stroke));
    this.updateAllStrokeFills();
    this.updateStartMarkers();
    this.positionTravelerAtCurrentProgress();
  }

  setupStrokeDash(stroke) {
    let pathLength = 1;
    try {
      pathLength = Math.max(1, stroke.path.getTotalLength());
    } catch {
      pathLength = 1;
    }
    stroke.svgLength = pathLength;
    stroke.path.style.strokeDasharray = String(pathLength);
  }

  updateAllStrokeFills() {
    for (let i = 0; i < this.strokesScreen.length; i++) this.updateStrokeFill(i);
  }

  updateStrokeFill(index) {
    const stroke = this.strokesScreen[index];
    if (!stroke) return;
    const progress = this.strokeProgress[index] || { ratio: 0 };
    const offset = stroke.svgLength * (1 - Math.max(0, Math.min(1, progress.ratio)));
    stroke.path.style.strokeDashoffset = String(offset);
  }

  updateStartMarkers() {
    const field = this.mountEl.querySelector('.qk-trace-field');
    if (!field) return;
    const rect = field.getBoundingClientRect();
    field.querySelectorAll('.qk-trace-start').forEach((marker) => {
      const index = Number(marker.dataset.startIndex);
      const stroke = this.strokesScreen[index];
      const point = stroke && stroke.points[0];
      marker.hidden = !point;
      if (!point) return;
      marker.style.left = `${point.x - rect.left}px`;
      marker.style.top = `${point.y - rect.top}px`;
      marker.classList.toggle('is-current', index === this.strokeIndex);
      marker.classList.toggle('is-done', index < this.strokeIndex);
    });
  }

  positionTravelerAtCurrentStart() {
    const stroke = this.strokesScreen[this.strokeIndex];
    if (stroke && stroke.points.length) this.positionTraveler(stroke.points[0]);
  }

  positionTravelerAtCurrentProgress() {
    const stroke = this.strokesScreen[this.strokeIndex];
    if (!stroke || !stroke.points.length) return;
    const progress = this.strokeProgress[this.strokeIndex] || { index: 0 };
    this.positionTraveler(stroke.points[Math.min(progress.index, stroke.points.length - 1)]);
  }

  positionTraveler(point) {
    const field = this.mountEl.querySelector('.qk-trace-field');
    const traveler = this.mountEl.querySelector('.qk-trace-traveler');
    if (!field || !traveler || !point) return;
    const rect = field.getBoundingClientRect();
    traveler.style.left = `${point.x - rect.left}px`;
    traveler.style.top = `${point.y - rect.top}px`;
  }

  playDemo() {
    if (this.reducedMotion()) return;
    const points = this.tracePoints();
    if (points.length < 2) return;
    const dot = this.mountEl.querySelector('.qk-trace-demo-dot');
    const field = this.mountEl.querySelector('.qk-trace-field');
    if (!dot || !field) return;
    const rect = field.getBoundingClientRect();
    const duration = Math.min(1800, Math.max(900, points.length * 18));
    const started = performance.now();
    dot.hidden = false;

    const step = (now) => {
      if (this.destroyed || this.screen !== 'play' || this.inputLocked) {
        dot.hidden = true;
        return;
      }
      const t = Math.min(1, (now - started) / duration);
      const index = Math.min(points.length - 1, Math.floor(t * (points.length - 1)));
      const point = points[index];
      dot.style.left = `${point.x - rect.left}px`;
      dot.style.top = `${point.y - rect.top}px`;
      if (t >= 1) {
        dot.hidden = true;
        this.demoFrame = 0;
        return;
      }
      this.demoFrame = window.requestAnimationFrame(step);
    };
    this.demoFrame = window.requestAnimationFrame(step);
  }

  cancelDemo() {
    if (this.demoFrame) window.cancelAnimationFrame(this.demoFrame);
    this.demoFrame = 0;
    const dot = this.mountEl.querySelector('.qk-trace-demo-dot');
    if (dot) dot.hidden = true;
  }

  createBurst(anchor, count) {
    if (!anchor || this.reducedMotion()) return;
    const host = this.mountEl.querySelector('.qk-trace') || this.mountEl;
    const hostRect = host.getBoundingClientRect();
    const rect = anchor.getBoundingClientRect();
    const burst = el('div', 'qk-trace-burst');
    burst.style.left = `${rect.left - hostRect.left + rect.width / 2}px`;
    burst.style.top = `${rect.top - hostRect.top + rect.height / 2}px`;

    for (let i = 0; i < count; i++) {
      const piece = el('span');
      const angle = (Math.PI * 2 * i) / count;
      const distance = 58 + this.fxRng() * 130;
      piece.style.setProperty('--x', `${Math.cos(angle) * distance}px`);
      piece.style.setProperty('--y', `${Math.sin(angle) * distance}px`);
      piece.style.setProperty('--hue', String(18 + Math.floor(this.fxRng() * 285)));
      piece.style.setProperty('--delay', `${this.fxRng() * 90}ms`);
      burst.appendChild(piece);
    }

    host.appendChild(burst);
    window.setTimeout(() => burst.remove(), 900);
  }

  updateDots() {
    this.mountEl.querySelectorAll('.qk-trace-dot').forEach((dot, index) => {
      dot.classList.toggle('is-filled', index < this.roundIndex);
      dot.classList.toggle('is-current', index === this.roundIndex);
    });
  }

  isNearCurrentStart(x, y) {
    const stroke = this.strokesScreen[this.strokeIndex];
    const point = stroke && stroke.points[0];
    return point ? Math.hypot(x - point.x, y - point.y) <= TARGET_SIZE / 2 : false;
  }

  currentPrompt() {
    return (this.currentPath && (this.currentPath.prompt || this.currentPath.name)) || this.mode.prompt || this.config.voice.intro;
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
    const marker = this.mountEl.querySelector(`[data-target-id="start:${this.strokeIndex}"]`);
    if (marker) {
      const target = targetFromEl(`start:${this.strokeIndex}`, 'correct', marker);
      target.id = this.strokeIndex === 0 ? 'start:0' : `start:${this.strokeIndex}`;
      targets.push(target);
    }
    if (this.pathBounds) {
      targets.push({ id: 'path', role: 'neutral', rect: this.pathBounds });
    }
    return targets;
  }

  async debugTap(targetId) {
    if (this.screen !== 'play' || this.destroyed) return { accepted: false };
    if (targetId === 'path') return { accepted: true };
    if (targetId.startsWith('start:')) {
      await this.speakLine(this.currentPrompt(), true);
      return { accepted: true };
    }
    return { accepted: false };
  }

  async winRound() {
    if (this.screen !== 'play' || this.destroyed || !this.awaitingInput) return;
    this.clearIdleTimer();
    this.cancelDemo();
    this.clearWanderTimer();
    const points = this.tracePoints();
    for (const point of points) {
      if (!this.awaitingInput || this.screen !== 'play') break;
      this.applyTracePoint(point);
      await wait(this.reducedMotion() ? 1 : 6);
    }
  }

  tracePoints() {
    if (this.screen !== 'play') return [];
    const points = [];
    for (const stroke of this.strokesScreen) {
      for (const point of stroke.points) points.push({ x: point.x, y: point.y });
    }
    return points;
  }

  mute() {
    this.muted = true;
    speech.stop();
  }

  seed(n) {
    const value = Number(n) || 0;
    this.rng = mulberry32(value);
    this.fxRng = mulberry32(value + 73);
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
}

function normalizeConfig(config = {}) {
  const copy = {
    home: 'Home',
    replay: 'Hear it again',
    playAgain: 'Play Again',
    ...(config.copy || {}),
  };
  const voice = {
    intro: 'Follow the sparkle with your finger.',
    nudge: 'Find the path and keep going.',
    cheer: 'You traced them all!',
    yums: ['Nice tracing!', 'You did it!', 'Great path!'],
    ...(config.voice || {}),
  };
  if (!Array.isArray(voice.yums)) voice.yums = [String(voice.yums || 'Nice tracing!')];

  return {
    ...config,
    id: config.id || 'trace-path',
    title: config.title || 'Trace the Path',
    splashArt: normalizeArtRef(config.splashArt || config.splashEmoji || 'emoji:⭐'),
    endArt: config.endArt ? normalizeArtRef(config.endArt) : null,
    traveler: normalizeArtRef(config.traveler || 'emoji:✏️'),
    strokeColor: config.strokeColor || '#e8734a',
    tolerance: Math.max(48, Number(config.tolerance || 64)),
    copy,
    voice,
    modes: (config.modes || []).map((mode) => normalizeMode(mode, config)).filter((mode) => mode.paths.length),
  };
}

function normalizeMode(mode = {}, config = {}) {
  const paths = (mode.paths || [])
    .map((path, index) => ({
      ...path,
      id: path.id || `path-${index}`,
      name: path.name || `Path ${index + 1}`,
      points: path.points,
    }))
    .filter((path) => normalizePathPoints(path.points).length);

  return {
    ...mode,
    id: mode.id || 'play',
    title: mode.title || 'Trace',
    prompt: mode.prompt || (config.voice && config.voice.intro) || '',
    rounds: Math.min(mode.rounds || paths.length, paths.length),
    traveler: normalizeArtRef(mode.traveler || config.traveler || 'emoji:✏️'),
    strokeColor: mode.strokeColor || config.strokeColor || '#e8734a',
    startMarker: mode.startMarker || '⭐',
    tolerance: Math.max(48, Number(mode.tolerance || config.tolerance || 64)),
    paths,
  };
}

function normalizeArtRef(ref) {
  if (!ref) return 'emoji:⭐';
  if (ref.includes(':')) return ref;
  return `emoji:${ref}`;
}

function normalizePathPoints(points) {
  const strokes = rawStrokes(points);
  const flat = strokes.flat();
  if (!flat.length) return [];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of flat) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const pad = 120;
  const scale = Math.min((1000 - pad * 2) / width, (1000 - pad * 2) / height);
  const offsetX = (1000 - width * scale) / 2 - minX * scale;
  const offsetY = (1000 - height * scale) / 2 - minY * scale;

  return strokes.map((stroke) => stroke.map((point) => ({
    x: point.x * scale + offsetX,
    y: point.y * scale + offsetY,
  })));
}

function rawStrokes(points) {
  if (!Array.isArray(points) || !points.length) return [];
  const maybePoint = points[0];
  const source = Array.isArray(maybePoint) && typeof maybePoint[0] === 'number' ? [points] : points;
  return source.map((stroke) => {
    if (!Array.isArray(stroke)) return [];
    return stroke
      .map((point) => {
        if (!Array.isArray(point) || point.length < 2) return null;
        const x = Number(point[0]);
        const y = Number(point[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
      })
      .filter(Boolean);
  }).filter((stroke) => stroke.length >= 2);
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

  const parts = [`M ${points[0].x} ${points[0].y}`];
  for (let i = 1; i < points.length - 1; i++) {
    const mid = midpoint(points[i], points[i + 1]);
    parts.push(`Q ${points[i].x} ${points[i].y} ${mid.x} ${mid.y}`);
  }
  const last = points[points.length - 1];
  parts.push(`L ${last.x} ${last.y}`);
  return parts.join(' ');
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function sampleSvgPath(svg, path) {
  const ctm = svg.getScreenCTM && svg.getScreenCTM();
  if (!ctm || !path.getTotalLength) return [];
  let total = 0;
  try {
    total = path.getTotalLength();
  } catch {
    total = 0;
  }
  if (!total) return [];
  const steps = Math.max(2, Math.ceil(total / SAMPLE_STEP_PX));
  const svgPoint = svg.createSVGPoint();
  const points = [];
  for (let i = 0; i <= steps; i++) {
    const local = path.getPointAtLength((total * i) / steps);
    svgPoint.x = local.x;
    svgPoint.y = local.y;
    const screen = svgPoint.matrixTransform(ctm);
    points.push({ x: screen.x, y: screen.y });
  }
  return points;
}

function cumulativeLengths(points) {
  const lengths = [];
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    if (i > 0) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    lengths.push(total);
  }
  return lengths;
}

function boundsFromPoints(points, pad) {
  if (!points.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    w: maxX - minX + pad * 2,
    h: maxY - minY + pad * 2,
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

function targetFromEl(id, role, node) {
  const rect = node.getBoundingClientRect();
  return {
    id,
    role,
    rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
  };
}

function nextFrame() {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
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

function installStyle() {
  if (styleInstalled || document.getElementById('qk-trace-style')) {
    styleInstalled = true;
    return;
  }

  const style = document.createElement('style');
  style.id = 'qk-trace-style';
  style.textContent = `
    @font-face {
      font-family: 'Fredoka';
      src: url('${FONT_URL}') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }

    .qk-trace, .qk-trace * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
    .qk-trace {
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
        radial-gradient(circle at 82% 28%, rgba(255,255,255,.34) 0 12px, transparent 13px),
        radial-gradient(circle at 42% 84%, rgba(255,255,255,.28) 0 9px, transparent 10px);
      background-size: 160px 160px, 230px 230px, 200px 200px;
      touch-action: manipulation;
      -webkit-user-select: none;
      user-select: none;
      -webkit-touch-callout: none;
      overscroll-behavior: none;
    }

    .qk-trace button, .qk-trace a {
      font: inherit;
      color: inherit;
      touch-action: manipulation;
    }

    .qk-trace button {
      border: 0;
      cursor: pointer;
    }

    .qk-trace button:focus-visible,
    .qk-trace a:focus-visible {
      outline: 5px solid rgba(45, 125, 210, .7);
      outline-offset: 4px;
    }

    .qk-trace-img-btn {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 50%;
      background: transparent center / 84px 84px no-repeat;
      text-decoration: none;
      box-shadow: none;
    }

    .qk-trace-img-btn:active { transform: scale(.93); }
    .qk-trace-home { background-image: url('${HOME_IMG}'); }
    .qk-trace-sound { background-image: url('${SOUND_IMG}'); }

    .qk-trace-splash,
    .qk-trace-end {
      display: grid;
      place-items: center;
      padding: max(18px, env(safe-area-inset-top)) max(18px, env(safe-area-inset-right))
        max(18px, env(safe-area-inset-bottom)) max(18px, env(safe-area-inset-left));
    }

    .qk-trace-home {
      position: absolute;
      top: max(12px, env(safe-area-inset-top));
      left: max(12px, env(safe-area-inset-left));
      z-index: 5;
    }

    .qk-trace-splash-center,
    .qk-trace-end-center {
      width: min(900px, 100%);
      display: grid;
      justify-items: center;
      gap: clamp(14px, 2.5vmin, 24px);
      text-align: center;
      padding-top: 54px;
    }

    .qk-trace-splash-art,
    .qk-trace-end-art {
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

    .qk-trace h1 {
      margin: 0;
      max-width: 13ch;
      color: var(--navy);
      font-size: clamp(38px, 7vmin, 78px);
      line-height: .98;
      letter-spacing: 0;
      text-shadow: 0 4px 0 rgba(255,255,255,.72);
    }

    .qk-trace-mode-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
      gap: 18px;
      width: min(760px, 100%);
      margin-top: 6px;
    }

    .qk-trace-mode,
    .qk-trace-again {
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
      letter-spacing: 0;
    }

    .qk-trace-mode:nth-child(2n) { background-color: var(--green); }
    .qk-trace-mode:nth-child(3n) { background-color: var(--coral); }
    .qk-trace-mode:active,
    .qk-trace-again:active { transform: scale(.96); }

    .qk-trace-play {
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      padding: max(12px, env(safe-area-inset-top)) max(14px, env(safe-area-inset-right))
        max(112px, calc(100px + env(safe-area-inset-bottom))) max(14px, env(safe-area-inset-left));
    }

    .qk-trace-hud {
      position: relative;
      z-index: 4;
      display: grid;
      grid-template-columns: 96px 1fr 96px;
      align-items: center;
      min-height: 100px;
    }

    .qk-trace-hud .qk-trace-home {
      position: static;
      grid-column: 1;
    }

    .qk-trace-progress {
      grid-column: 2;
      justify-self: center;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 11px;
      min-height: 32px;
      padding: 0 8px;
    }

    .qk-trace-dot {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 4px solid var(--white);
      background: rgba(255,255,255,.52);
      box-shadow: 0 3px 0 rgba(23,81,126,.14);
    }

    .qk-trace-dot.is-current { background: var(--yellow); }
    .qk-trace-dot.is-filled { background: var(--green); }

    .qk-trace-stage {
      min-height: 0;
      display: grid;
      grid-template-rows: auto minmax(0, 1fr);
      gap: clamp(8px, 1.6vmin, 18px);
      touch-action: none;
    }

    .qk-trace-prompt {
      justify-self: center;
      max-width: min(900px, 92vw);
      min-height: 44px;
      text-align: center;
      color: var(--navy);
      font-size: clamp(24px, 4vmin, 44px);
      line-height: 1.05;
      letter-spacing: 0;
      text-shadow: 0 3px 0 rgba(255,255,255,.65);
      pointer-events: none;
    }

    .qk-trace-field {
      position: relative;
      align-self: stretch;
      justify-self: center;
      width: min(92vw, 920px);
      min-height: 0;
      aspect-ratio: 1;
      max-height: min(70dvh, 920px);
      border-radius: 8px;
      touch-action: none;
    }

    .qk-trace-svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
      touch-action: none;
    }

    .qk-trace-guide,
    .qk-trace-fill {
      fill: none;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
      pointer-events: none;
    }

    .qk-trace-guide {
      stroke: rgba(23, 81, 126, .35);
      stroke-width: 34px;
      stroke-dasharray: 1 20;
    }

    .qk-trace-fill {
      stroke-width: 42px;
      opacity: .94;
    }

    .qk-trace-field.is-wandering .qk-trace-guide {
      animation: qk-trace-pulse .72s ease-in-out infinite;
    }

    .qk-trace-field.is-complete .qk-trace-fill {
      animation: qk-trace-shimmer .72s ease-out both;
    }

    .qk-trace-start {
      position: absolute;
      z-index: 3;
      display: grid;
      place-items: center;
      width: ${TARGET_SIZE}px;
      height: ${TARGET_SIZE}px;
      margin-left: -${TARGET_SIZE / 2}px;
      margin-top: -${TARGET_SIZE / 2}px;
      border-radius: 50%;
      border: 5px solid var(--white);
      background:
        linear-gradient(180deg, rgba(255,255,255,.55), rgba(255,255,255,0) 55%),
        var(--yellow);
      box-shadow: var(--shadow);
      font-size: 48px;
      line-height: 1;
      pointer-events: none;
      transform: scale(.88);
      opacity: .72;
    }

    .qk-trace-start.is-current {
      opacity: 1;
      transform: scale(1);
      animation: qk-trace-start-pop 1s ease-in-out infinite;
    }

    .qk-trace-start.is-done {
      opacity: .34;
      transform: scale(.76);
    }

    .qk-trace-traveler,
    .qk-trace-demo-dot {
      position: absolute;
      z-index: 4;
      left: 0;
      top: 0;
      width: 86px;
      height: 86px;
      margin-left: -43px;
      margin-top: -43px;
      pointer-events: none;
      display: grid;
      place-items: center;
      --qk-art-size: 56px;
    }

    .qk-trace-traveler {
      border-radius: 50%;
      background: rgba(255,255,255,.78);
      border: 4px solid rgba(255,255,255,.92);
      box-shadow: 0 4px 0 rgba(23,81,126,.12), 0 9px 22px rgba(23,81,126,.18);
    }

    .qk-trace-demo-dot {
      z-index: 5;
      width: 42px;
      height: 42px;
      margin-left: -21px;
      margin-top: -21px;
      border-radius: 50%;
      background: var(--yellow);
      border: 5px solid var(--white);
      box-shadow: 0 0 0 9px rgba(255,209,102,.28), 0 6px 18px rgba(23,81,126,.22);
    }

    .qk-trace-demo-dot[hidden] { display: none; }

    .qk-trace-sound {
      position: absolute;
      left: max(14px, env(safe-area-inset-left));
      bottom: max(12px, env(safe-area-inset-bottom));
      z-index: 5;
    }

    .qk-trace-end-center {
      gap: clamp(16px, 3vmin, 28px);
    }

    .qk-trace-again {
      display: inline-grid;
      grid-auto-flow: column;
      align-items: center;
      justify-content: center;
      gap: 14px;
      min-width: min(430px, 84vw);
      background-color: var(--green);
    }

    .qk-trace-play-icon {
      width: 46px;
      height: 46px;
      background: transparent center / contain no-repeat url('${PLAY_IMG}');
    }

    .qk-trace-burst {
      position: absolute;
      z-index: 9;
      width: 1px;
      height: 1px;
      pointer-events: none;
    }

    .qk-trace-burst span {
      position: absolute;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: hsl(var(--hue), 78%, 58%);
      animation: qk-trace-burst .82s ease-out both;
      animation-delay: var(--delay);
    }

    @keyframes qk-trace-burst {
      from { opacity: 1; transform: translate(-50%, -50%) scale(.35); }
      to { opacity: 0; transform: translate(calc(-50% + var(--x)), calc(-50% + var(--y))) scale(1.15); }
    }

    @keyframes qk-trace-pulse {
      0%, 100% { stroke: rgba(23, 81, 126, .35); stroke-width: 34px; }
      50% { stroke: rgba(242, 95, 92, .48); stroke-width: 44px; }
    }

    @keyframes qk-trace-shimmer {
      0% { filter: saturate(1) brightness(1); }
      40% { filter: saturate(1.35) brightness(1.35); }
      100% { filter: saturate(1) brightness(1); }
    }

    @keyframes qk-trace-start-pop {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.08); }
    }

    @media (orientation: landscape) and (max-height: 620px) {
      .qk-trace-play {
        grid-template-rows: 92px minmax(0, 1fr);
        padding-bottom: max(96px, calc(88px + env(safe-area-inset-bottom)));
      }

      .qk-trace-hud { min-height: 92px; }
      .qk-trace-field {
        width: min(76vw, 82dvh);
        max-height: 82dvh;
      }
      .qk-trace-prompt { font-size: clamp(22px, 5vh, 34px); min-height: 34px; }
    }

    @media (max-width: 560px) {
      .qk-trace-start { width: 96px; height: 96px; margin-left: -48px; margin-top: -48px; }
      .qk-trace-field { width: 94vw; max-height: 68dvh; }
      .qk-trace-traveler { width: 76px; height: 76px; margin-left: -38px; margin-top: -38px; --qk-art-size: 50px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .qk-trace *, .qk-trace *::before, .qk-trace *::after {
        animation-duration: .001ms !important;
        transition-duration: .001ms !important;
        scroll-behavior: auto !important;
      }
      .qk-trace-demo-dot,
      .qk-trace-burst { display: none !important; }
    }
  `;
  document.head.appendChild(style);
  styleInstalled = true;
}
