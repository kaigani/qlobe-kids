// game.js — Red Light, Green Light: pick-your-caller video engine.
// A child chooses a muppet-style video puppet; that caller says the cues in
// its own voice, bops to invite running on green, and freezes on red. Built
// game-local (coach-timer, the old engine, is shared by 22 games and can't be
// taught video) following the proven video pattern in games/feelings-charades.
//
// Screens: select (caller grid) -> mode (2 buttons) -> play (video loop) -> end.
// Audio never speaks before the first gesture; the select tap unlocks + blesses
// one <video> and one <audio> element so later timer-driven playback isn't
// blocked by autoplay policy. Reduced motion swaps looping video for a held
// poster + spoken line. If a clip fails to load, we fall back to poster+speech
// so a round never blocks.

import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { unlockAll, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { mulberry32 } from '../../../shared/js/rng.js';

// @font-face, the reset and the HUD button artwork now come from
// shared/css/base.css + shared/css/hud.css, linked by index.html.
const PLAY_IMG = new URL('../../../shared/assets/ui/btn-play.png', import.meta.url).href;
const BG_IMG = new URL('../assets/bg.jpg', import.meta.url).href;
const TITLE_IMG = new URL('../assets/title.webp', import.meta.url).href;

const IDLE_MS = 10000;
const REPLAY_DEBOUNCE_MS = 600;
const VIDEO_READY_TIMEOUT = 2600;
let styleReady = false;

export function createGame(config, callers, mountEl) {
  if (!mountEl) throw new Error('red-green-light requires a mount element');
  injectStyle();
  return new CallerGame(config || {}, callers || [], mountEl);
}

class CallerGame {
  constructor(config, callers, mountEl) {
    this.config = config;
    this.callers = callers;
    this.ready = callers.filter((c) => c.ready);
    this.mountEl = mountEl;
    this.screen = 'select';
    this.caller = null;
    this.mode = null;
    this.cycleIndex = 0;
    this.stateIndex = 0;
    this.paused = false;
    this.awaitingInput = false;
    this.audioUnlocked = false;
    this.muted = false;
    this.destroyed = false;
    this.seeded = false;
    this.rng = Math.random;
    this.reduced = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.idlePrompted = false;
    // One cancellable, time-scalable group. Every delay in the game goes on it,
    // which is what makes QLOBE_DEBUG.fastTimers() real rather than a flag some
    // call sites remember to multiply in (two of them used to divide instead,
    // making the video-ready and clip-fallback guards 50x LONGER under fast).
    this.timers = createTimers();
    this.videoEl = null;
    this.speakToken = 0;

    this.disposeGuards = installKioskGuards();

    // Delegated back/home so the listener survives every innerHTML swap.
    this.mountEl.addEventListener('click', (event) => {
      const back = event.target.closest && event.target.closest('.rgl-back');
      if (back) { this.stopVoice(); this.onBack(); }
    });

    this.mountEl.classList.add('rgl-root');
    this.renderSelect();
    this.disposeDebug = this.installDebug();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearTimers();
    this.stopVoice();
    this.teardownMedia();
    this.disposeGuards?.();
    this.mountEl.classList.remove('rgl-root');
    this.mountEl.replaceChildren();
    this.disposeDebug?.();
  }

  // ---------- audio/video unlock ----------

  unlock() {
    if (this.audioUnlocked) return;
    this.audioUnlocked = true;
    // Fan out to every platform channel, including voice-clips — the caller's
    // greet/cheer lines play through its single unlocked element (sayFile), and
    // iOS only grants that element playback once it has played in a gesture.
    unlockAll();
    // Bless the reused video inside the gesture so later programmatic play()
    // (from timers) is allowed and unmuted audio isn't throttled on iOS.
    if (this.videoEl) blessMedia(this.videoEl);
  }

  teardownMedia() {
    const el = this.videoEl;
    if (!el) return;
    try { el.pause(); el.removeAttribute('src'); el.load(); } catch { /* ignore */ }
  }

  // ---------- screen 1: caller select ----------

  renderSelect() {
    this.clearTimers();
    this.stopVoice();
    this.screen = 'select';
    this.mode = null;
    this.awaitingInput = false;
    const tiles = this.ready.map((c) => `
      <button class="rgl-caller-tile" type="button" data-caller="${escAttr(c.id)}" style="--accent:${escAttr(c.accent)}" aria-label="${escAttr(c.name)}">
        <span class="rgl-tile-frame"><img class="rgl-caller-poster" src="${escAttr(c.poster)}" alt="" draggable="false" /></span>
        <span class="rgl-name-pill">${escHtml(c.name)}</span>
      </button>`).join('');
    this.mountEl.innerHTML = `
      <section class="rgl rgl-select" aria-label="${escAttr(this.config.title || '')}">
        <a class="rgl-home qk-hud-btn qk-hud-home" href="../../" aria-label="Home"></a>
        <div class="rgl-select-center">
          <img class="rgl-title" src="${TITLE_IMG}" alt="${escAttr(this.config.title || '')} — ${escAttr(this.config.selectPrompt || 'Pick your caller')}" draggable="false" />
          <div class="rgl-caller-grid">${tiles}</div>
        </div>
      </section>`;
    this.mountEl.querySelectorAll('.rgl-caller-tile').forEach((tile) => {
      const img = tile.querySelector('.rgl-caller-poster');
      if (img) img.addEventListener('error', () => img.replaceWith(emojiSpan('🎪')), { once: true });
      onTap(tile, () => this.pickCaller(tile.dataset.caller), {
        feedback: () => { this.unlock(); this.playSfx('tick'); },
      });
    });
  }

  pickCaller(id) {
    const caller = this.ready.find((c) => c.id === id);
    if (!caller || this.destroyed) return;
    this.unlock();
    this.caller = caller;
    this.playSfx('pop');
    this.renderModes();
    this.playClipVoice(caller.audio.greet, 'Hi there! Come play with me!');
  }

  // ---------- screen 2: mode select ----------

  renderModes() {
    this.screen = 'mode';
    this.awaitingInput = false;
    const c = this.caller;
    this.mountEl.innerHTML = `
      <section class="rgl rgl-mode" style="--accent:${escAttr(c.accent)}" aria-label="${escAttr(c.name)}">
        <button class="rgl-back qk-hud-btn qk-hud-back" type="button" aria-label="Back to callers"></button>
        <div class="rgl-mode-center">
          <div class="rgl-caller-card">
            ${this.idleFrameHTML('rgl-mode-poster')}
            <span class="rgl-name-pill">${escHtml(c.name)}</span>
          </div>
          <h1 class="rgl-heading">${escHtml(this.config.modePrompt || 'How shall we play?')}</h1>
          <div class="rgl-mode-grid"></div>
        </div>
      </section>`;
    this.wireIdle();
    // getTargets()/tapTarget() (below) read `.rgl-mode-button` + dataset.mode
    // directly and build their own `mode:<id>` ids — data-target is unused by
    // this game's own debug harness, so targetPrefix is dropped entirely.
    renderModeCards({
      host: this.mountEl.querySelector('.rgl-mode-grid'),
      modes: this.config.modes || [],
      skin: false, // .rgl-mode-button keeps its own pixel-for-pixel look; only
                   // the shared .qk-mode-card touch-floor contract is added (a
                   // no-op — .rgl-mode-button's own min-height is already 96px).
      cardClass: 'rgl-mode-button',
      showTitle: false, // decorate() sets bare text content, matching the
                         // original markup exactly (no wrapper span)
      targetPrefix: null,
      decorate: (btn, mode) => { btn.textContent = mode.title || mode.id; },
      onPick: (id) => this.startMode(id),
      feedback: () => { this.unlock(); this.playSfx('tick'); },
    });
  }

  onBack() {
    // From play/end -> back to mode select; from mode select -> caller select.
    if (this.screen === 'mode') this.renderSelect();
    else if (this.caller) this.renderModes();
    else this.renderSelect();
  }

  // A framed poster that a muted, seamless idle loop fades in over — keeps the
  // caller alive on the mode + end screens. Muted loops autoplay pre-unlock.
  idleFrameHTML(frameClass) {
    const c = this.caller;
    return `<div class="rgl-idle-frame ${frameClass}">
        <img class="rgl-idle-poster" src="${escAttr(c.poster)}" alt="" draggable="false" />
        <video class="rgl-idle-video" muted loop playsinline preload="auto"></video>
      </div>`;
  }

  wireIdle() {
    const frame = this.mountEl.querySelector('.rgl-idle-frame');
    if (!frame || !this.caller) return;
    const img = frame.querySelector('.rgl-idle-poster');
    if (img) img.addEventListener('error', () => img.replaceWith(emojiSpan('🎪')), { once: true });
    const video = frame.querySelector('.rgl-idle-video');
    const src = this.caller.video.idle;
    if (!video || this.reduced || !src) { if (video) video.remove(); return; }
    video.addEventListener('canplay', () => {
      video.classList.add('is-on');
      const p = video.play();
      if (p && p.catch) p.catch(() => video.classList.remove('is-on'));
    }, { once: true });
    video.addEventListener('error', () => video.remove(), { once: true });
    video.src = src;
    video.load();
  }

  // ---------- screen 3: play ----------

  startMode(id) {
    const mode = (this.config.modes || []).find((m) => m.id === id);
    if (!mode || this.destroyed) return;
    this.unlock();
    this.clearTimers();
    this.mode = mode;
    this.screen = 'play';
    this.cycleIndex = 0;
    this.stateIndex = 0;
    this.paused = false;
    this.renderPlayShell();
    this.startState(0);
  }

  renderPlayShell() {
    const c = this.caller;
    this.mountEl.innerHTML = `
      <section class="rgl rgl-play" style="--accent:${escAttr(c.accent)};--state:${escAttr((this.mode.states[0] || {}).color || '#58a945')}" aria-label="${escAttr(this.mode.title || '')}">
        <header class="rgl-hud qk-hud-bar">
          <button class="rgl-back qk-hud-btn qk-hud-back" type="button" aria-label="Back to the game menu"></button>
          <div class="rgl-round-dots qk-dots" aria-hidden="true"></div>
          <button class="rgl-pause" type="button" aria-label="Pause">Ⅱ</button>
        </header>
        <div class="rgl-stage">
          <div class="rgl-frame">
            <img class="rgl-poster" alt="" draggable="false" />
            <video class="rgl-video" playsinline preload="auto"></video>
          </div>
          <div class="rgl-cue" aria-live="polite"></div>
          <div class="rgl-timebar"><span class="rgl-timebar-fill"></span></div>
        </div>
        <button class="rgl-sound qk-hud-btn qk-hud-sound" type="button" aria-label="Hear it again"></button>
      </section>`;
    this.videoEl = this.mountEl.querySelector('.rgl-video');
    this.posterEl = this.mountEl.querySelector('.rgl-poster');
    // The voice channel is voice-clips' own element now, already unlocked by
    // unlockAll() — only this screen's fresh <video> still needs blessing.
    if (this.audioUnlocked) blessMedia(this.videoEl);
    this.videoEl.muted = false;
    const pause = this.mountEl.querySelector('.rgl-pause');
    onTap(pause, () => this.togglePause(), { feedback: () => this.unlock() });
    const sound = this.mountEl.querySelector('.rgl-sound');
    onTap(sound, () => this.replay());
    this.updateRoundDots();
  }

  async startState(index, startsAt = Date.now()) {
    if (this.destroyed || this.screen !== 'play') return;
    const states = this.mode.states || [];
    if (!states.length) return this.endMode();
    this.clearTimers();
    this.stateIndex = index % states.length;
    const state = states[this.stateIndex];
    this.awaitingInput = true;
    this.idlePrompted = false;
    const section = this.mountEl.querySelector('.rgl-play');
    if (section) section.style.setProperty('--state', state.color || '#58a945');
    const cue = this.mountEl.querySelector('.rgl-cue');
    if (cue) cue.textContent = state.say || '';
    this.updateRoundDots();
    this.playSfx(state.sfx || 'pop');
    await this.showCue(state);
    if (this.destroyed || this.screen !== 'play' || this.paused) return;
    this.scheduleIdlePrompt(state);
    // Run the movement window, then advance.
    const ms = this.stateDurationMs(state);
    this.runTimebar(this.timers.ms(ms));   // the bar has to finish when the timer fires
    this.schedule(() => this.advanceState(Date.now()), ms);
  }

  // Show the caller's cue clip; loop for a bop, hold the last frame for a
  // freeze. Falls back to poster + spoken line on any load/play failure.
  async showCue(state) {
    const c = this.caller;
    const poster = c.poster;
    const src = c.video[state.videoKey];
    if (this.posterEl) { this.posterEl.src = poster; this.posterEl.classList.remove('hidden'); }
    const video = this.videoEl;
    if (!video || this.reduced || !src) { this.speak(state.say); return; }
    const ok = await this.loadVideo(src);
    if (this.destroyed || this.screen !== 'play') return;
    if (ok) {
      video.loop = state.motion === 'loop';
      video.currentTime = 0;
      video.classList.remove('hidden');
      const p = video.play();
      if (p && p.catch) p.catch(() => { video.classList.add('hidden'); this.speak(state.say); });
      // A held clip keeps its last frame on-screen automatically once ended.
    } else {
      video.classList.add('hidden');
      this.speak(state.say);
    }
  }

  loadVideo(src) {
    const video = this.videoEl;
    return new Promise((resolve) => {
      const ok = () => { cleanup(); resolve(true); };
      const err = () => { cleanup(); resolve(false); };
      const cleanup = () => {
        video.removeEventListener('canplay', ok);
        video.removeEventListener('error', err);
      };
      video.addEventListener('canplay', ok, { once: true });
      video.addEventListener('error', err, { once: true });
      video.src = src;
      video.load();
      this.schedule(() => { cleanup(); resolve(video.readyState >= 3); }, VIDEO_READY_TIMEOUT);
    });
  }

  advanceState(startsAt) {
    if (this.destroyed || this.paused || this.screen !== 'play') return;
    const states = this.mode.states || [];
    const next = this.stateIndex + 1;
    if (next >= states.length) {
      this.cycleIndex += 1;
      if (this.cycleIndex >= Number(this.mode.rounds || 1)) return this.endMode();
      this.startState(0, startsAt);
    } else {
      this.startState(next, startsAt);
    }
  }

  stateDurationMs(state) {
    const dur = Array.isArray(state.durSec) ? state.durSec : [state.durSec || 2, state.durSec || 2];
    const min = Number(dur[0] || 1);
    const max = Number(dur[1] || min);
    const seconds = this.seeded ? min : min + this.rng() * Math.max(0, max - min);
    return Math.max(0.05, seconds) * 1000;
  }

  runTimebar(ms) {
    const fill = this.mountEl.querySelector('.rgl-timebar-fill');
    if (!fill) return;
    fill.style.transition = 'none';
    fill.style.transform = 'scaleX(1)';
    if (this.reduced) return;
    requestAnimationFrame(() => {
      fill.style.transition = `transform ${ms}ms linear`;
      fill.style.transform = 'scaleX(0)';
    });
  }

  togglePause() {
    if (this.screen !== 'play') return;
    this.paused = !this.paused;
    this.clearTimers();
    this.playSfx('tick');
    const pause = this.mountEl.querySelector('.rgl-pause');
    const section = this.mountEl.querySelector('.rgl-play');
    if (pause) { pause.textContent = this.paused ? '▶' : 'Ⅱ'; pause.setAttribute('aria-label', this.paused ? 'Play' : 'Pause'); }
    if (section) section.classList.toggle('is-paused', this.paused);
    if (this.videoEl) { if (this.paused) { try { this.videoEl.pause(); } catch { /* ignore */ } } }
    if (!this.paused) this.startState(this.stateIndex);
  }

  updateRoundDots() {
    const existing = this.mountEl.querySelector('.rgl-round-dots');
    if (!existing) return;
    // progressDots() builds the whole row; keep the rgl- hook class on it so the
    // next update can find it again.
    const dots = progressDots(Number(this.mode.rounds || 1), this.cycleIndex);
    dots.classList.add('rgl-round-dots');
    existing.replaceWith(dots);
  }

  // ---------- replay / idle ----------

  // soundDebounce: a child drumming on the sound button gets the cue once, not
  // eight overlapping copies. Leading-edge, so the first press is immediate.
  replay = soundDebounce(() => {
    this.playSfx('tick');
    this.clearIdle();
    const state = (this.mode.states || [])[this.stateIndex];
    if (state) this.showCue(state);
    this.scheduleIdlePrompt(state);
  }, REPLAY_DEBOUNCE_MS);

  scheduleIdlePrompt(state) {
    this.clearIdle();
    if (this.idlePrompted || this.screen !== 'play' || this.paused) return;
    this.idleTimer = this.schedule(() => {
      this.idleTimer = 0;
      if (this.destroyed || this.idlePrompted || this.screen !== 'play' || this.paused) return;
      this.idlePrompted = true;
      if (state) this.speak(state.say);
    }, IDLE_MS);
  }

  clearIdle() {
    if (!this.idleTimer) return;
    this.timers.clear(this.idleTimer);
    this.idleTimer = 0;
  }

  // ---------- screen 4: end ----------

  endMode() {
    if (this.destroyed) return;
    this.clearTimers();
    this.teardownVideo();
    this.screen = 'end';
    this.awaitingInput = true;
    this.playSfx('tada');
    const mode = this.mode;
    const c = this.caller;
    this.mountEl.innerHTML = `
      <section class="rgl rgl-end" style="--accent:${escAttr(c.accent)}" aria-label="${escAttr((mode && mode.endTitle) || '')}">
        <div class="rgl-end-center">
          <div class="rgl-caller-card">
            ${this.idleFrameHTML('rgl-end-poster')}
            <span class="rgl-name-pill">${escHtml(c.name)}</span>
          </div>
          <h1 class="rgl-heading">${escHtml((mode && (mode.endTitle || mode.title)) || this.config.title || '')}</h1>
          <button class="rgl-again" type="button"><span class="rgl-play-icon" aria-hidden="true"></span>${escHtml((mode && mode.againLabel) || 'PLAY AGAIN')}</button>
          <button class="rgl-back qk-hud-btn qk-hud-back" type="button" aria-label="Back to the game menu"></button>
        </div>
      </section>`;
    this.wireIdle();
    const again = this.mountEl.querySelector('.rgl-again');
    onTap(again, () => this.startMode(mode.id), {
      feedback: () => { this.unlock(); this.playSfx('tick'); },
    });
    this.playClipVoice(c.audio.cheer, (mode && mode.cheer) || (this.config.voice && this.config.voice.cheer));
  }

  teardownVideo() {
    if (!this.videoEl) return;
    try { this.videoEl.pause(); this.videoEl.removeAttribute('src'); this.videoEl.load(); } catch { /* ignore */ }
    this.videoEl = null;
    this.posterEl = null;
  }

  // ---------- voice ----------

  // Play a recorded clip if it loads; otherwise speak the text (never before
  // unlock, so a greeting can't slip to system TTS at page load).
  //
  // voice-clips.sayFile() is the manifest-free file path: one iOS-unlocked
  // channel element shared with the rest of the platform, a Web Speech fallback
  // on load/play failure, and every line recorded in getAudioLog() for QA.
  // Callers' clip paths are page-relative (`./assets/callers/…`), and sayFile
  // only passes a path through untouched when it is absolute or escapes the
  // game folder — so resolve against the document first.
  playClipVoice(src, fallbackText) {
    if (this.muted || !this.audioUnlocked || !src) return;
    this.speakToken++;
    voiceClips.sayFile(new URL(src, document.baseURI).href, fallbackText || '');
  }

  speak(text) {
    if (this.muted || !text || !this.audioUnlocked) return;
    this.speakToken++;
    speech.speak(text);
  }

  stopVoice() {
    this.speakToken++;
    // stops the clip channel AND cancels speech synthesis
    voiceClips.stop();
  }

  playSfx(name) {
    if (!this.muted && name && typeof sfx[name] === 'function') sfx[name]();
  }

  // ---------- timers ----------

  /** Delays are given at scale 1; the group applies fastTimers()' scale. */
  schedule(fn, ms) {
    return this.timers.after(Math.max(0, ms), fn);
  }

  clearTimers() {
    this.timers.clearAll();
    this.idleTimer = 0;
  }

  // ---------- debug (headless playtest, mirrors coach-timer surface) ----------

  installDebug() {
    return installDebug({
      gameId: this.config.id || 'red-green-light',
      engine: 'caller-cues',
      ready: Promise.resolve(),
      listCallers: () => this.ready.map((c) => ({ id: c.id, name: c.name })),
      listModes: () => (this.config.modes || []).map((m) => ({ id: m.id, title: m.title })),
      selectCaller: (id) => this.pickCaller(id),
      startMode: (id) => { if (!this.caller) this.pickCaller((this.ready[0] || {}).id); this.startMode(id); },
      getState: () => this.getState(),
      getTargets: () => this.getTargets(),
      tap: (targetId) => this.tapTarget(targetId),
      winRound: () => this.winRound(),
      // The game's own mute: `this.muted` gates sfx, cues and clip playback, so
      // the hook has to set it rather than only silencing the channels.
      mute: (on = true) => {
        this.muted = on !== false;
        window.__qkMuted = this.muted;
        voiceClips.setMuted(this.muted);
        this.stopVoice();
        for (const el of document.querySelectorAll('audio, video')) el.muted = this.muted;
        return this.muted;
      },
      seed: (n) => this.seed(n),
      // fastTimers() comes free from the group every delay is scheduled on.
      timers: this.timers,
      voice: voiceClips,
      sfx,
    });
  }

  getState() {
    return {
      screen: this.screen,
      caller: this.caller ? this.caller.id : null,
      mode: this.mode ? this.mode.id : null,
      round: this.cycleIndex,
      roundsTotal: this.mode ? Number(this.mode.rounds || 1) : 0,
      stateId: this.mode ? ((this.mode.states || [])[this.stateIndex] || {}).id : null,
      paused: this.paused,
      awaitingInput: this.awaitingInput,
    };
  }

  getTargets() {
    const rectOf = (el, id, role) => {
      const r = el.getBoundingClientRect();
      return { id, role, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    };
    const out = [];
    if (this.screen === 'select') {
      this.mountEl.querySelectorAll('.rgl-caller-tile').forEach((t) => out.push(rectOf(t, `caller:${t.dataset.caller}`, 'correct')));
    } else if (this.screen === 'mode') {
      this.mountEl.querySelectorAll('.rgl-mode-button').forEach((b) => out.push(rectOf(b, `mode:${b.dataset.mode}`, 'correct')));
    } else if (this.screen === 'play') {
      const pause = this.mountEl.querySelector('.rgl-pause');
      if (pause) out.push(rectOf(pause, 'pause', 'neutral'));
    } else if (this.screen === 'end') {
      const again = this.mountEl.querySelector('.rgl-again');
      if (again) out.push(rectOf(again, 'again', 'correct'));
    }
    return out;
  }

  tapTarget(id) {
    if (id.startsWith('caller:')) { this.pickCaller(id.slice(7)); return { accepted: true }; }
    if (id.startsWith('mode:')) { this.startMode(id.slice(5)); return { accepted: true }; }
    if (id === 'pause') { this.togglePause(); return { accepted: true }; }
    if (id === 'again' && this.mode) { this.startMode(this.mode.id); return { accepted: true }; }
    return { accepted: false };
  }

  // Skip to the end of the current mode via the real advance path.
  async winRound() {
    const deadline = Date.now() + 15000;
    if (this.screen === 'select') this.pickCaller((this.ready[0] || {}).id);
    if (this.screen === 'mode') this.startMode((this.config.modes[0] || {}).id);
    while (!this.destroyed && this.screen === 'play' && Date.now() < deadline) {
      this.clearTimers();
      this.advanceState(Date.now());
      await new Promise((r) => setTimeout(r, 30));
    }
  }

  // Seeding pins every cue window to its MINIMUM duration (see stateDurationMs)
  // so a headless run is both reproducible and quick; the generator is kept for
  // any future seeded choice, and is now the platform's mulberry32 rather than
  // a private LCG, so seed(42) means the same thing here as everywhere else.
  seed(n) {
    this.seeded = true;
    const value = Number.isFinite(Number(n)) ? Number(n) >>> 0 : 42;
    this.rng = mulberry32(value);
    return value;
  }
}

// ---------- helpers ----------

function blessMedia(el) {
  const wasMuted = el.muted;
  try {
    el.muted = true;
    const p = el.play();
    if (p && p.then) p.then(() => { el.pause(); el.muted = wasMuted; }).catch(() => { el.muted = wasMuted; });
    else { el.pause(); el.muted = wasMuted; }
  } catch { el.muted = wasMuted; }
}

function emojiSpan(emoji) {
  const s = document.createElement('span');
  s.className = 'rgl-emoji';
  s.textContent = emoji;
  return s;
}

function escHtml(v) {
  return String(v).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function escAttr(v) { return escHtml(v); }

function injectStyle() {
  if (styleReady || document.getElementById('rgl-style')) { styleReady = true; return; }
  const style = document.createElement('style');
  style.id = 'rgl-style';
  style.textContent = `
    /* @font-face and the * reset come from shared/css/base.css. */
    .rgl { --navy:#17517e; --sky:#bee3f5; --accent:#58a945; --state:#58a945; position:relative; width:100%; height:100dvh; min-height:100%; overflow:hidden; color:var(--navy); font-family:'Fredoka','Arial Rounded MT Bold',sans-serif; font-weight:600; background:var(--sky); touch-action:manipulation; user-select:none; -webkit-user-select:none; -webkit-touch-callout:none; }
    /* The round HUD buttons are shared/css/hud.css's .qk-hud-btn + .qk-hud-home
       /back/sound (artwork, 96px target, press feedback, focus ring, small-screen
       step-down). Only their PLACEMENT is this game's, below. */
    .rgl-emoji { display:grid; place-items:center; width:100%; height:100%; font-size:clamp(48px,12vmin,110px); }
    .rgl-caller-tile:active, .rgl-mode-button:active, .rgl-again:active, .rgl-pause:active { transform:scale(.95); }

    /* shared screen scaffolding */
    .rgl-select, .rgl-mode, .rgl-end { display:grid; place-items:center; padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left)); }
    .rgl-select { background:#bfe4f7 url('${BG_IMG}') center 62% / cover no-repeat; }
    .rgl-mode, .rgl-end { background:
      radial-gradient(ellipse 72% 56% at 50% 22%, rgba(255,255,255,.66), transparent 60%),
      radial-gradient(circle at 20% 22%, rgba(255,255,255,.30) 0 9px, transparent 10px),
      radial-gradient(circle at 78% 30%, rgba(255,255,255,.24) 0 13px, transparent 14px),
      linear-gradient(#e6f5ff,#bfe4f7); background-size:auto,120px 120px,170px 170px,auto; }
    .rgl-select > .rgl-home, .rgl-mode > .rgl-back { position:absolute; left:max(16px,env(safe-area-inset-left)); top:max(16px,env(safe-area-inset-top)); z-index:5; filter:drop-shadow(0 4px 6px rgba(0,0,0,.25)); }

    /* the chunky white-outlined heading, matching the title art */
    .rgl-heading { margin:0; max-width:94vw; font-size:clamp(30px,6.6vmin,62px); line-height:1.04; color:#2f7fd6;
      -webkit-text-stroke:6px #fff; paint-order:stroke fill; text-shadow:0 5px 0 rgba(23,81,126,.20); text-wrap:balance; }

    /* accent name pill (tiles + caller card) */
    .rgl-name-pill { position:absolute; left:50%; bottom:0; transform:translateX(-50%); z-index:3;
      background:var(--accent); border:4px solid #fff; border-radius:999px; color:#fff; white-space:nowrap;
      padding:5px 20px; font-size:clamp(16px,2.5vmin,26px); box-shadow:0 5px 12px rgba(23,81,126,.28); text-shadow:0 1px 2px rgba(0,0,0,.28); }

    /* select */
    .rgl-select-center { display:grid; justify-items:center; align-content:center; gap:clamp(6px,1.4vmin,14px); width:min(940px,95vw); max-height:100dvh; text-align:center; }
    .rgl-title { width:min(680px,74vw); height:auto; display:block; margin:clamp(-48px,-5vmin,-22px) 0 clamp(-60px,-6.5vmin,-30px); filter:drop-shadow(0 6px 10px rgba(0,0,0,.22)); }
    .rgl-caller-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:clamp(8px,1.5vmin,16px) clamp(12px,2vw,24px); width:100%; }
    .rgl-caller-tile { position:relative; display:block; padding:0 0 clamp(14px,2.1vmin,22px); border:0; background:none; cursor:pointer; }
    .rgl-tile-frame { display:block; position:relative; aspect-ratio:5/4; border:6px solid #fff; border-radius:24px; overflow:hidden; background:#0c1622; box-shadow:0 6px 0 rgba(23,81,126,.18),0 14px 24px rgba(23,81,126,.20); }
    .rgl-caller-poster { width:100%; height:100%; object-fit:cover; display:block; }

    /* mode + end shared */
    .rgl-mode-center, .rgl-end-center { display:grid; justify-items:center; gap:clamp(14px,2.8vmin,26px); width:min(760px,94vw); text-align:center; }
    .rgl-caller-card { position:relative; width:min(44vmin,320px); max-width:82vw; padding-bottom:clamp(16px,2.4vmin,24px); }
    .rgl-mode-poster, .rgl-end-poster { width:100%; aspect-ratio:1/1; border:7px solid #fff; border-radius:30px; box-shadow:0 8px 0 rgba(23,81,126,.16),0 18px 34px rgba(23,81,126,.16); }
    .rgl-idle-frame { position:relative; overflow:hidden; background:#0c1622; }
    .rgl-idle-poster, .rgl-idle-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
    .rgl-idle-video { opacity:0; transition:opacity .35s ease; }
    .rgl-idle-video.is-on { opacity:1; }
    .rgl-mode-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(min(240px,86vw),1fr)); gap:16px; width:100%; }
    .rgl-mode-button, .rgl-again { min-height:96px; border:6px solid #fff; border-radius:26px; color:#1f5c96; background:linear-gradient(#ffe07a,#ffc93c); box-shadow:0 7px 0 rgba(23,81,126,.20),0 16px 26px rgba(23,81,126,.18); font:inherit; font-weight:600; font-size:clamp(23px,3.8vmin,38px); cursor:pointer; padding:10px 22px; text-shadow:0 2px 0 rgba(255,255,255,.5); }

    /* play */
    .rgl-play { background:#0c1622; }
    /* .rgl-hud is shared/css/hud.css's .qk-hud-bar verbatim; only z-index is ours. */
    .rgl-hud { z-index:7; }
    .rgl-pause { width:96px; min-height:96px; border:6px solid #fff; border-radius:50%; background:#fffef8; color:var(--navy); font:inherit; font-size:44px; line-height:1; cursor:pointer; }
    /* Progress pips come from hud.js progressDots() + hud.css (.qk-dots/.qk-dot). */
    .rgl-stage { position:absolute; inset:112px 12px 12px; display:grid; grid-template-rows:1fr auto auto; justify-items:center; gap:10px; min-height:0; }
    .rgl-frame { position:relative; width:100%; height:100%; min-height:0; border:12px solid var(--state); border-radius:28px; box-shadow:0 0 0 4px #fff, 0 0 46px 6px color-mix(in srgb, var(--state) 60%, transparent); overflow:hidden; background:#0c1622; transition:border-color .2s ease, box-shadow .2s ease; }
    .rgl-poster, .rgl-video { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; display:block; }
    .rgl-video.hidden { display:none; }
    .rgl-cue { max-width:min(1000px,94vw); text-align:center; color:#fff; font-size:clamp(26px,4.4vmin,50px); line-height:1.02; text-shadow:0 3px 10px rgba(0,0,0,.55); }
    .rgl-timebar { width:min(680px,90vw); height:12px; border-radius:8px; background:rgba(255,255,255,.22); overflow:hidden; }
    .rgl-timebar-fill { display:block; width:100%; height:100%; border-radius:8px; background:var(--state); transform-origin:left center; }
    .rgl-sound { position:absolute; z-index:8; left:max(16px,env(safe-area-inset-left)); bottom:max(16px,env(safe-area-inset-bottom)); }
    .rgl-play.is-paused .rgl-frame { filter:saturate(.7) brightness(.8); }

    /* end */
    .rgl-again { display:flex; align-items:center; justify-content:center; gap:12px; min-width:min(440px,84vw); }
    .rgl-play-icon { width:56px; height:56px; background:transparent url('${PLAY_IMG}') center/contain no-repeat; }

    /* keep the 4x2 grid across tablet orientations; 2 cols only on narrow phones */
    @media (orientation:portrait) {
      .rgl-title { width:min(660px,92vw); }
      .rgl-stage { inset:104px 10px 10px; }
    }
    @media (max-width:540px) { .rgl-caller-grid { grid-template-columns:repeat(2,1fr); } }
    @media (orientation:landscape) and (max-height:560px) {
      .rgl-title { width:min(560px,60vw); margin-bottom:clamp(-46px,-7vmin,-24px); }
      .rgl-caller-tile { padding-bottom:12px; }
      .rgl-caller-card { width:min(34vmin,240px); }
    }
    @media (prefers-reduced-motion:reduce) { .rgl-root *, .rgl-root *::before, .rgl-root *::after { animation-duration:.001ms!important; transition-duration:.001ms!important; } }
  `;
  document.head.appendChild(style);
  styleReady = true;
}
