import configPromise from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installKioskGuards, installUnlockOnGesture, unlockAll } from '../../../shared/js/audio-unlock.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { tada } from '../../../shared/js/celebrate.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as music from '../../../shared/js/music.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createTraceCanvas, traceCanvasStats } from './trace-canvas.js';
import { createBotanySounds } from './botany-sounds.js';

const root = document.getElementById('game');
const config = await configPromise;
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
const timers = createTimers();
const botany = createBotanySounds();
const narrator = createNarrator({ announcerParent: root });
narrator.setMuted(true);

const sections = Object.fromEntries(
  [...root.querySelectorAll('[data-qk-screen]')].map((node) => [node.dataset.qkScreen, node]),
);
const screens = createScreens({ root, screens: sections, initial: 'splash', voice: narrator });

let muted = false;
let audioActivated = false;
let musicStarted = false;
let currentPromptKey = 'welcome';
let duckToken = 0;
let traceController = null;
let growthPromise = Promise.resolve();
let rng = Math.random;
let lapseToken = 0;

function sanitizeSaved(raw) {
  if (!raw || raw.version !== 1 || !Array.isArray(raw.completedDays)) {
    return { version: 1, completedDays: [], badges: [], lastVisitedAt: 0 };
  }
  const supplied = new Set(raw.completedDays.map(Number));
  const completedDays = [];
  for (let day = 1; day <= 5 && supplied.has(day); day += 1) completedDays.push(day);
  const badgeSet = new Set(Array.isArray(raw.badges) ? raw.badges.map(Number) : []);
  return {
    version: 1,
    completedDays,
    badges: completedDays.filter((day) => badgeSet.has(day) || supplied.has(day)),
    lastVisitedAt: Number(raw.lastVisitedAt) || 0,
  };
}

function loadSaved() {
  try {
    return sanitizeSaved(JSON.parse(localStorage.getItem(config.storageKey)));
  } catch {
    return sanitizeSaved(null);
  }
}

let saved = loadSaved();
const state = {
  screen: 'splash',
  selectedDay: Math.min(5, saved.completedDays.length + 1),
  phase: 'journal',
  watered: false,
  sunned: false,
  traceProgress: null,
  animationPhase: 'idle',
  resetArmed: false,
  timeLapseIndex: 5,
};

function saveProgress() {
  saved.lastVisitedAt = Date.now();
  try { localStorage.setItem(config.storageKey, JSON.stringify(saved)); } catch { /* private mode */ }
}

function daySpec(day = state.selectedDay) {
  return config.days.find((entry) => entry.day === Number(day)) || config.days[0];
}

function nextDay() {
  return Math.min(5, saved.completedDays.length + 1);
}

function isDayAvailable(day) {
  return saved.completedDays.includes(day) || day === nextDay();
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
}

function preloadImages() {
  const urls = [
    config.theme.background,
    config.theme.title,
    ...config.assets.stages,
    ...Object.values(config.assets).filter((value) => typeof value === 'string'),
  ];
  return Promise.all([...new Set(urls)].map((src) => new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
  })));
}

const assetReady = preloadImages();
const voiceReady = voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
const musicReady = music.init('../../../shared/assets/instruments/manifest.json');
const ready = Promise.all([assetReady, voiceReady, musicReady]).then(() => true);

function startMusic() {
  if (musicStarted) return;
  musicStarted = true;
  Promise.resolve(musicReady).then(() => {
    try {
      music.playSong(config.music.song, config.music.band);
      music.duck(.22, 60);
    } catch { /* music is optional */ }
  });
}

function speak(key) {
  if (!key || !config.voice[key]) return Promise.resolve();
  currentPromptKey = key;
  const mine = ++duckToken;
  if (audioActivated && !muted) music.duck(.075, 100);
  return narrator.say(key, config.voice[key]).finally(() => {
    if (mine === duckToken && audioActivated && !muted) music.duck(.22, 320);
  });
}

function speakSequence(keys) {
  const parts = keys.filter((key) => config.voice[key]).map((key, index) => ({
    key,
    text: config.voice[key],
    gap: index ? 160 : 0,
  }));
  if (!parts.length) return Promise.resolve();
  currentPromptKey = parts[parts.length - 1].key;
  const mine = ++duckToken;
  if (audioActivated && !muted) music.duck(.075, 100);
  return narrator.saySequence(parts).finally(() => {
    if (mine === duckToken && audioActivated && !muted) music.duck(.22, 320);
  });
}

function setMuted(on = true) {
  muted = Boolean(on);
  narrator.setMuted(muted || !audioActivated);
  voiceClips.setMuted(muted || !audioActivated);
  botany.setMuted(muted);
  sfx.setMuted(muted);
  music.setMuted(muted);
  if (muted) narrator.stop();
  return muted;
}

const replayPrompt = soundDebounce(() => speak(currentPromptKey), 650);

function appendHud(section, { splash = false, onBack } = {}) {
  const nav = hudButton(splash ? 'home' : 'back', splash
    ? () => { window.location.href = '../../'; }
    : () => (onBack ? onBack() : showJournal()));
  nav.classList.add('qk-hud-top-left');
  nav.dataset.target = splash ? 'home' : 'back';
  section.append(nav);

  const sound = hudButton('sound', replayPrompt);
  sound.classList.add('qk-hud-bottom-left');
  sound.dataset.target = 'sound';
  section.append(sound);
  screens.hold(nav.dispose, sound.dispose);
}

function bindTap(element, action, { quiet = false } = {}) {
  if (!element) return;
  screens.hold(onTap(element, action, {
    feedback: quiet ? undefined : () => { try { sfx.tick(); } catch { /* optional */ } },
  }));
}

function bindCareDrag(card, kind, section) {
  if (!card) return;
  let pointerId = null;
  let start = null;
  let dragging = false;
  let ghost = null;
  let suppressClickUntil = 0;
  const dropZone = () => section.querySelector('[data-plant-stage]');
  const pointIn = (element, x, y) => {
    const rect = element?.getBoundingClientRect();
    return Boolean(rect && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  };
  const moveGhost = (x, y) => {
    if (!ghost) return;
    ghost.style.left = `${x}px`;
    ghost.style.top = `${y}px`;
  };
  const removeWindowListeners = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    window.removeEventListener('blur', onBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);
  };
  const clear = () => {
    const zone = dropZone();
    const capturedPointerId = pointerId;
    zone?.classList.remove('is-drop-target');
    // Reset the active state before releasing capture. Some tablet browsers
    // dispatch lostpointercapture after the current event; a late notification
    // must not be able to clear the next drag.
    pointerId = null;
    start = null;
    dragging = false;
    removeWindowListeners();
    if (capturedPointerId !== null) {
      try {
        if (card.hasPointerCapture?.(capturedPointerId)) card.releasePointerCapture(capturedPointerId);
      } catch { /* pointer may already have been released */ }
    }
    card.classList.remove('is-dragging');
    ghost?.remove();
    ghost = null;
  };
  const onDown = (event) => {
    if (event.isPrimary === false || pointerId !== null || state.phase !== 'care') return;
    try { sfx.tick(); } catch { /* optional */ }
    pointerId = event.pointerId;
    start = { x: event.clientX, y: event.clientY };
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp, { passive: false });
    window.addEventListener('pointercancel', onCancel, { passive: false });
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    try { card.setPointerCapture(event.pointerId); } catch { /* optional */ }
  };
  const onMove = (event) => {
    if (event.pointerId !== pointerId || !start) return;
    const distance = Math.hypot(event.clientX - start.x, event.clientY - start.y);
    if (!dragging && distance < 8) return;
    if (!dragging) {
      dragging = true;
      ghost = card.cloneNode(true);
      ghost.classList.add('care-drag-ghost');
      ghost.removeAttribute('data-target');
      ghost.setAttribute('aria-hidden', 'true');
      const cardRect = card.getBoundingClientRect();
      ghost.style.width = `${cardRect.width}px`;
      ghost.style.height = `${cardRect.height}px`;
      document.body.append(ghost);
      card.classList.add('is-dragging');
    }
    if (event.cancelable) event.preventDefault();
    moveGhost(event.clientX, event.clientY);
    const zone = dropZone();
    zone?.classList.toggle('is-drop-target', pointIn(zone, event.clientX, event.clientY));
  };
  const onUp = (event) => {
    if (event.pointerId !== pointerId) return;
    const wasDragging = dragging;
    const accepted = wasDragging && pointIn(dropZone(), event.clientX, event.clientY);
    if (wasDragging && event.cancelable) event.preventDefault();
    suppressClickUntil = performance.now() + 700;
    clear();
    if (accepted || !wasDragging) useCare(kind);
  };
  const onCancel = (event) => {
    if (event.pointerId !== pointerId) return;
    suppressClickUntil = performance.now() + 700;
    clear();
  };
  const onBlur = () => {
    if (pointerId !== null) clear();
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === 'hidden') onBlur();
  };
  const onClick = (event) => {
    if (event.detail > 0) {
      // A pointerup already handled this press. The fallback below covers a
      // browser that emits click without delivering pointerup to our window
      // listener, but never turns a real drag into an accidental tap.
      if (performance.now() < suppressClickUntil) return;
      if (pointerId !== null) {
        const wasDragging = dragging;
        clear();
        if (wasDragging || state.phase !== 'care') return;
      } else {
        return;
      }
    }
    if (state.phase === 'care') useCare(kind);
  };
  card.addEventListener('pointerdown', onDown);
  card.addEventListener('click', onClick);
  screens.hold(() => {
    card.removeEventListener('pointerdown', onDown);
    card.removeEventListener('click', onClick);
    clear();
  });
}

function showScreen(name, render, { force = false } = {}) {
  duckToken += 1;
  narrator.stop();
  if (audioActivated && !muted) music.duck(.22, 180);
  screens.show(name, { force });
  state.screen = name;
  render();
}

function cardMarkup(day, { compact = false } = {}) {
  const complete = saved.completedDays.includes(day);
  const current = !complete && day === nextDay();
  const future = !complete && !current;
  const classes = ['journal-card', complete ? 'is-complete' : '', current ? 'is-current' : '', future ? 'is-future' : '', compact ? 'is-compact' : ''].filter(Boolean).join(' ');
  return `
    <button class="${classes}" type="button" data-day="${day}" data-target="day-${day}" aria-label="Day ${day}${complete ? ', complete, replay' : current ? ', ready to grow' : ', still growing'}">
      <img class="journal-card__paper" src="${config.assets.dayCard}" alt="" draggable="false" />
      <span class="journal-card__day">Day ${day}</span>
      <img class="journal-card__plant" src="${config.assets.stages[day]}" alt="" draggable="false" />
      ${complete ? '<span class="journal-card__status" aria-hidden="true">✓</span>' : current ? '<span class="journal-card__status" aria-hidden="true">▶</span>' : ''}
    </button>`;
}

function renderJournal() {
  const section = sections.splash;
  const allDone = saved.completedDays.length === 5;
  section.innerHTML = `
    <div class="splash-wrap">
      <img class="title-lockup" src="${config.theme.title}" alt="Bean Sprout Watch" draggable="false" />
      <div class="paper-heading">
        <img src="${config.assets.promptBanner}" alt="" draggable="false" />
        <div><strong>${allDone ? 'Your bean grew!' : 'My Bean Journal'}</strong><span>${allDone ? 'All five days complete' : 'Five little growing days'}</span></div>
      </div>
      <div class="journal-strip">
        <img class="journal-vine" src="${config.assets.progressVine}" alt="" aria-hidden="true" draggable="false" />
        <div class="journal-grid">${[1, 2, 3, 4, 5].map((day) => cardMarkup(day)).join('')}</div>
      </div>
      <p class="splash-helper">${allDone ? 'Tap any day to visit it again.' : `Day ${nextDay()} is ready for a little care.`}</p>
      ${allDone ? `<button class="art-button reset-button journal-reset-button" type="button" data-target="grow-again" aria-label="Grow a new bean">
        <img src="${config.assets.resetSeed}" alt="" draggable="false" /><span>Grow again</span>
      </button>` : ''}
    </div>`;
  appendHud(section, { splash: true });
  for (const button of section.querySelectorAll('[data-day]')) {
    bindTap(button, () => chooseDay(Number(button.dataset.day)));
  }
  if (allDone) bindTap(section.querySelector('[data-target="grow-again"]'), () => resetProgress());
  currentPromptKey = allDone ? 'all-grown' : 'welcome';
  state.phase = 'journal';
  state.animationPhase = 'idle';
  state.resetArmed = false;
}

function showJournal({ prompt } = {}) {
  showScreen('splash', renderJournal, { force: screens.current === 'splash' });
  if (prompt) speak(prompt);
}

function chooseDay(day) {
  if (!isDayAvailable(day)) {
    const button = sections.splash.querySelector(`[data-day="${day}"]`);
    button?.animate?.([
      { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' }, { transform: 'translateX(0)' },
    ], { duration: reducedMotion ? 1 : 260 });
    speak('future-day');
    return { accepted: false, reason: 'future-day' };
  }
  return screens.start(async () => {
    state.selectedDay = day;
    state.watered = false;
    state.sunned = false;
    state.traceProgress = null;
    state.phase = 'care';
    state.animationPhase = 'idle';
    showScreen('play', renderPlay);
    speak(daySpec().intro);
    return { accepted: true, day };
  }, { busy: { accepted: false, reason: 'busy' } });
}

function progressMarkup(day) {
  return [1, 2, 3, 4, 5].map((number) => {
    const cls = number < day ? 'is-done' : number === day ? 'is-now' : '';
    return `<span class="day-progress__pip ${cls}"></span>`;
  }).join('');
}

function playPrompt() {
  const spec = daySpec();
  if (state.phase === 'trace') return config.voice[spec.trace];
  if (state.watered && state.sunned) return config.voice['care-ready'];
  return `Give your day ${state.selectedDay} bean water and sunshine.`;
}

function renderPlay() {
  const section = sections.play;
  const spec = daySpec();
  section.innerHTML = `
    <div class="play-wrap">
      <div class="play-head">
        <span aria-hidden="true"></span>
        <div class="prompt-card">
          <img src="${config.assets.promptBanner}" alt="" draggable="false" />
          <p data-prompt>${escapeHtml(playPrompt())}</p>
        </div>
        <div class="day-progress" aria-hidden="true">
          <img src="${config.assets.progressVine}" alt="" draggable="false" />
          <div class="day-progress__pips">${progressMarkup(state.selectedDay)}</div>
        </div>
      </div>
      <div class="care-layout">
        <button class="care-tool ${state.watered ? 'is-used' : ''}" type="button" data-care="water" data-target="water" aria-label="Give the bean water by tapping or dragging it to the pot">
          <img src="${config.assets.water}" alt="" draggable="false" /><span>Water</span>
        </button>
        <div class="observation-page ${state.phase === 'trace' ? 'is-tracing' : ''}" data-page>
          <div class="observation-page__day">Day ${state.selectedDay}</div>
          <div class="plant-stage" data-plant-stage>
            <img class="plant-stage__art is-before" src="${config.assets.stages[spec.before]}" alt="Bean plant before today's growth" draggable="false" />
            <img class="plant-stage__art is-after" src="${config.assets.stages[spec.after]}" alt="Bean plant after today's growth" draggable="false" />
            <canvas class="trace-canvas" data-trace tabindex="-1" aria-hidden="true"></canvas>
          </div>
          <p class="observation-note">${escapeHtml(spec.observation)}</p>
        </div>
        <button class="care-tool ${state.sunned ? 'is-used' : ''}" type="button" data-care="sun" data-target="sun" aria-label="Give the bean warm sunshine by tapping or dragging it to the pot">
          <img src="${config.assets.sun}" alt="" draggable="false" /><span>Sunshine</span>
        </button>
      </div>
    </div>`;
  appendHud(section, { onBack: () => showJournal() });
  bindCareDrag(section.querySelector('[data-care="water"]'), 'water', section);
  bindCareDrag(section.querySelector('[data-care="sun"]'), 'sun', section);

  const nudger = createNudger({
    first: 12500,
    repeat: 10500,
    onNudge: () => {
      if (screens.current !== 'play') return;
      speak(state.phase === 'trace' ? 'trace-nudge' : 'care-nudge');
    },
  });
  nudger.arm();
  screens.hold(nudger.stop, () => timers.clearAll(), () => {
    traceController?.destroy();
    traceController = null;
  });
  if (state.phase === 'trace') enterTrace({ speakPrompt: false });
}

function useCare(kind) {
  if (screens.current !== 'play') return { accepted: false };
  const key = kind === 'water' ? 'watered' : 'sunned';
  state[key] = true;
  const button = sections.play.querySelector(`[data-care="${kind}"]`);
  button?.classList.add('is-used');
  if (kind === 'water') botany.water();
  else botany.sun();
  speak(kind);
  if (state.watered && state.sunned && state.phase === 'care') {
    state.phase = 'care-ready';
    sections.play.querySelector('[data-prompt]').textContent = config.voice['care-ready'];
    timers.after(420, () => enterTrace({ speakPrompt: true }));
  }
  return { accepted: true, kind, watered: state.watered, sunned: state.sunned };
}

function enterTrace({ speakPrompt = true } = {}) {
  if (screens.current !== 'play' || traceController || !state.watered || !state.sunned) return;
  state.phase = 'trace';
  const spec = daySpec();
  const page = sections.play.querySelector('[data-page]');
  const canvas = sections.play.querySelector('[data-trace]');
  page?.classList.add('is-tracing');
  const prompt = sections.play.querySelector('[data-prompt]');
  if (prompt) prompt.textContent = config.voice[spec.trace];
  canvas.dataset.target = 'trace-canvas';
  canvas.tabIndex = 0;
  canvas.removeAttribute('aria-hidden');
  canvas.setAttribute('role', 'button');
  canvas.setAttribute('aria-keyshortcuts', 'Enter Space');
  canvas.setAttribute('aria-label', `${config.voice[spec.trace]} Draw with a pointer, or press Enter or Space to grow the line.`);
  traceController = createTraceCanvas(canvas, {
    paths: spec.guides,
    thresholds: {
      radius: .075,
      minGesturePx: config.thresholds.minGesturePx,
      completion: config.thresholds.coverage,
      softCompletion: config.thresholds.softCoverage,
      softenAfterStrokes: config.thresholds.softenAfterStrokes,
    },
    brushUrl: config.assets.brush,
    reducedMotion,
    onProgress: (progress) => { state.traceProgress = progress; },
    onComplete: () => { growthPromise = finishGrowth(); },
  });
  const assistTrace = (event) => {
    if (!traceController || state.phase !== 'trace') return;
    if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
    if (event.type === 'click' && event.detail !== 0) return;
    event.preventDefault();
    const controller = traceController;
    for (const guide of spec.guides) {
      const result = controller.ingest(guide);
      if (result?.complete) break;
    }
  };
  canvas.addEventListener('keydown', assistTrace);
  canvas.addEventListener('click', assistTrace);
  const onResize = () => traceController?.resize();
  window.addEventListener('resize', onResize);
  screens.hold(
    () => window.removeEventListener('resize', onResize),
    () => canvas.removeEventListener('keydown', assistTrace),
    () => canvas.removeEventListener('click', assistTrace),
  );
  if (speakPrompt) speakSequence(['care-ready', spec.trace]);
}

function commitDay(day) {
  if (!saved.completedDays.includes(day)) {
    saved.completedDays.push(day);
    saved.completedDays.sort((a, b) => a - b);
  }
  if (!saved.badges.includes(day)) saved.badges.push(day);
  saveProgress();
}

async function finishGrowth() {
  if (state.phase === 'growing' || state.phase === 'reward') return;
  state.phase = 'growing';
  state.animationPhase = 'cross-grow';
  const page = sections.play.querySelector('[data-page]');
  const plant = sections.play.querySelector('[data-plant-stage]');
  page?.classList.remove('is-tracing');
  plant?.classList.add('is-grown');
  const completedTrace = traceController;
  traceController = null;
  completedTrace?.destroy();
  botany.leaf();
  await timers.wait(reducedMotion ? 80 : 900);
  commitDay(state.selectedDay);
  state.phase = 'reward';
  state.animationPhase = 'badge';
  showScreen('reward', renderReward);
}

function renderReward() {
  const section = sections.reward;
  const spec = daySpec();
  const finalDay = state.selectedDay === 5;
  section.innerHTML = `
    <div class="reward-wrap">
      <div class="prompt-card">
        <img src="${config.assets.promptBanner}" alt="" draggable="false" />
        <p>Look what changed on day ${state.selectedDay}!</p>
      </div>
      <div class="reward-stage">
        <img class="reward-plant" src="${config.assets.stages[spec.after]}" alt="${escapeHtml(spec.observation)}" draggable="false" />
        <div class="reward-badge" aria-label="Nature Explorer badge earned">
          <img src="${config.assets.badge}" alt="" draggable="false" />
          <strong>Nature Explorer</strong>
        </div>
      </div>
      <p class="reward-observation">${escapeHtml(spec.observation)}</p>
      <button class="art-button green-button" type="button" data-target="${finalDay ? 'my-journal' : 'next-day'}">
        <img src="${config.assets.actionGreen}" alt="" draggable="false" /><span>${finalDay ? 'My journal' : 'Next day'}</span>
      </button>
    </div>`;
  appendHud(section, { onBack: () => showJournal() });
  bindTap(section.querySelector('.art-button'), () => {
    if (finalDay) showComplete({ prompt: true });
    else showJournal({ prompt: 'choose-day' });
  });
  const cancel = tada({
    host: section,
    count: 20,
    duration: reducedMotion ? 1 : 1900,
    palette: ['#789a43', '#d39a34', '#d86b37', '#a6bd63'],
    rng,
  });
  screens.hold(cancel);
  botany.badge();
  speakSequence([spec.success, 'badge']);
}

function renderComplete() {
  const section = sections.complete;
  section.innerHTML = `
    <div class="complete-wrap">
      <img class="title-lockup" src="${config.theme.title}" alt="Bean Sprout Watch" draggable="false" />
      <div class="paper-heading">
        <img src="${config.assets.promptBanner}" alt="" draggable="false" />
        <div><strong>My growing journal</strong><span>Seed to young plant</span></div>
      </div>
      <div class="complete-journal journal-strip">
        <img class="journal-vine" src="${config.assets.progressVine}" alt="" aria-hidden="true" draggable="false" />
        <div class="journal-grid">${[1, 2, 3, 4, 5].map((day) => cardMarkup(day, { compact: true })).join('')}</div>
      </div>
      <div class="time-lapse" data-lapse aria-live="polite">
        ${[1, 2, 3, 4, 5].map((stage) => `<img class="${stage === 5 ? 'is-showing' : ''}" data-lapse-stage="${stage}" src="${config.assets.stages[stage]}" alt="Day ${stage} bean plant" draggable="false" />`).join('')}
      </div>
      <div class="complete-actions">
        <button class="art-button green-button" type="button" data-target="watch-grow">
          <img src="${config.assets.actionGreen}" alt="" draggable="false" /><span>Watch it grow</span>
        </button>
        <button class="art-button reset-button ${state.resetArmed ? 'is-armed' : ''}" type="button" data-target="grow-again" aria-label="${state.resetArmed ? 'Confirm grow a new bean' : 'Grow a new bean'}">
          <img src="${config.assets.resetSeed}" alt="" draggable="false" /><span>${state.resetArmed ? 'Tap again' : 'Grow again'}</span>
        </button>
      </div>
    </div>`;
  appendHud(section, { onBack: () => showJournal() });
  for (const button of section.querySelectorAll('[data-day]')) bindTap(button, () => chooseDay(Number(button.dataset.day)));
  bindTap(section.querySelector('[data-target="watch-grow"]'), runTimeLapse);
  bindTap(section.querySelector('[data-target="grow-again"]'), resetProgress);
  screens.hold(() => { lapseToken += 1; }, () => timers.clearAll());
}

function showComplete({ prompt = false } = {}) {
  state.phase = 'complete';
  state.animationPhase = 'idle';
  state.resetArmed = false;
  showScreen('complete', renderComplete, { force: screens.current === 'complete' });
  if (prompt) speak('all-grown');
}

async function runTimeLapse() {
  const mine = ++lapseToken;
  const button = sections.complete.querySelector('[data-target="watch-grow"]');
  if (button) button.disabled = true;
  for (let stage = 1; stage <= 5; stage += 1) {
    if (mine !== lapseToken || screens.current !== 'complete') return;
    state.timeLapseIndex = stage;
    for (const image of sections.complete.querySelectorAll('[data-lapse-stage]')) {
      image.classList.toggle('is-showing', Number(image.dataset.lapseStage) === stage);
    }
    if (stage > 1) botany.leaf();
    await timers.wait(reducedMotion ? 90 : 520);
  }
  if (button) button.disabled = false;
}

function resetProgress() {
  if (screens.current === 'splash' && saved.completedDays.length === 5) {
    try { localStorage.removeItem(config.storageKey); } catch { /* private mode */ }
    saved = sanitizeSaved(null);
    state.selectedDay = 1;
    state.watered = false;
    state.sunned = false;
    state.traceProgress = null;
    state.resetArmed = false;
    showJournal();
    speak('reset-done');
    return { accepted: true, reset: true };
  }
  if (!state.resetArmed) {
    state.resetArmed = true;
    const button = sections.complete.querySelector('[data-target="grow-again"]');
    button?.classList.add('is-armed');
    const label = button?.querySelector('span');
    if (label) label.textContent = 'Tap again';
    button?.setAttribute('aria-label', 'Confirm grow a new bean');
    speak('reset-check');
    return { accepted: true, armed: true };
  }
  try { localStorage.removeItem(config.storageKey); } catch { /* private mode */ }
  saved = sanitizeSaved(null);
  state.selectedDay = 1;
  state.watered = false;
  state.sunned = false;
  state.traceProgress = null;
  state.resetArmed = false;
  showJournal();
  speak('reset-done');
  return { accepted: true, reset: true };
}

function getState() {
  return {
    screen: screens.current,
    selectedDay: state.selectedDay,
    phase: state.phase,
    watered: state.watered,
    sunned: state.sunned,
    traceProgress: state.traceProgress ? JSON.parse(JSON.stringify(state.traceProgress)) : null,
    traceStrokes: traceController?.snapshot?.() || [],
    completedDays: [...saved.completedDays],
    badges: [...saved.badges],
    animationPhase: state.animationPhase,
    resetArmed: state.resetArmed,
    timeLapseIndex: state.timeLapseIndex,
    reducedMotion,
    muted,
    saveState: { ...saved, completedDays: [...saved.completedDays], badges: [...saved.badges] },
    music: music.stats(),
    traceCanvasControllers: traceCanvasStats().activeControllers,
  };
}

function debugTap(id) {
  const target = [...(screens.el(screens.current)?.querySelectorAll('[data-target]') || [])]
    .find((node) => node.dataset.target === String(id));
  if (!target || target.disabled) return { accepted: false, reason: 'target-unavailable' };
  target.click();
  return { accepted: true, id: String(id) };
}

function debugTrace(points) {
  if (!traceController || state.phase !== 'trace') return { accepted: false, reason: 'trace-not-ready' };
  return { accepted: true, result: traceController.ingest(points) };
}

async function winRound() {
  if (screens.current !== 'play') await chooseDay(nextDay());
  if (!state.watered) useCare('water');
  if (!state.sunned) useCare('sun');
  if (!traceController) enterTrace({ speakPrompt: false });
  for (const guide of daySpec().guides) traceController?.ingest(guide);
  await growthPromise;
  return getState();
}

function snapshot() {
  return getState();
}

async function restore(snapshotValue) {
  const snap = snapshotValue && typeof snapshotValue === 'object' ? snapshotValue : {};
  saved = sanitizeSaved(snap.saveState || snap);
  saveProgress();
  state.selectedDay = Math.max(1, Math.min(5, Number(snap.selectedDay) || nextDay()));
  state.watered = Boolean(snap.watered);
  state.sunned = Boolean(snap.sunned);
  state.phase = snap.phase === 'trace' ? 'trace' : 'care';
  if (snap.screen === 'complete' && saved.completedDays.length === 5) {
    showComplete();
  } else if (snap.screen === 'play') {
    showScreen('play', renderPlay, { force: screens.current === 'play' });
    if (state.phase === 'trace') traceController?.restore(snap.traceStrokes || []);
  } else {
    showJournal();
  }
  return getState();
}

function clearSaved() {
  try { localStorage.removeItem(config.storageKey); } catch { /* private mode */ }
  saved = sanitizeSaved(null);
  state.selectedDay = 1;
  state.watered = false;
  state.sunned = false;
  state.traceProgress = null;
  showJournal();
  return getState();
}

function audioLog() {
  return [
    ...voiceClips.getAudioLog().map((entry) => ({ ...entry, source: 'teacher-voice' })),
    ...botany.getLog().map((entry) => ({ ...entry, source: 'botany-sfx' })),
  ].sort((a, b) => (a.at || 0) - (b.at || 0));
}

const disposeKiosk = installKioskGuards();
function activateAudio(event) {
  if (audioActivated) return;
  audioActivated = true;
  narrator.setMuted(muted);
  voiceClips.setMuted(muted);
  startMusic();
  if (!event.target?.closest?.('[data-day], [data-hud="sound"]')) speak('welcome');
}

const onKeyboardUnlock = (event) => {
  if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
  if (!event.target?.closest?.('button, [role="button"]')) return;
  unlockAll([music.unlock, botany.unlock]);
  activateAudio(event);
};
window.addEventListener('keydown', onKeyboardUnlock, true);
const disposeKeyboardUnlock = () => window.removeEventListener('keydown', onKeyboardUnlock, true);
const disposeUnlock = installUnlockOnGesture({
  extra: [music.unlock, botany.unlock],
  onFirst: activateAudio,
});

const disposeDebug = installDebug({
  gameId: config.id,
  engine: 'bean-sprout-watch-custom',
  ready,
  listModes: () => [{ id: 'sprout-week', title: 'Five-Day Sprout Journal' }],
  startMode: (mode) => (mode === 'sprout-week' ? chooseDay(nextDay()) : { accepted: false, reason: 'unknown-mode' }),
  getState,
  tap: debugTap,
  trace: debugTrace,
  winRound,
  selectDay: chooseDay,
  clearSaved,
  snapshot,
  restore,
  home: () => showJournal(),
  getAudioLog: audioLog,
  clearAudioLog: () => { voiceClips.clearAudioLog(); },
  mute: setMuted,
  onSeed: (next) => { rng = next; },
  timers,
  narrator,
  sfx,
  voice: voiceClips,
  root,
});

renderJournal();

window.addEventListener('beforeunload', () => {
  saveProgress();
  timers.clearAll();
  traceController?.destroy();
  botany.destroy();
  narrator.dispose();
  music.stopSong();
  screens.destroy();
  disposeKeyboardUnlock();
  disposeUnlock();
  disposeKiosk();
  disposeDebug();
}, { once: true });
