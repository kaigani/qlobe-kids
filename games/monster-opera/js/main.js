import config from '../config.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createScreens } from '../../../shared/js/screens.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';

import { MonsterAudioEngine } from './audio-engine.js';
import {
  composerPosition, createClock, occurrencesBetween, overlapsBlock, wrap,
} from './transport.js';

const { loopSeconds, laneSeconds, clipSeconds, lookaheadSeconds, schedulerMilliseconds } = config.timing;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const game = document.querySelector('#game');
const audio = new MonsterAudioEngine();
const composerClock = createClock();
const concertClock = createClock();
const disposers = [];
const concertDisposers = [];

const state = {
  screen: 'splash',
  song: { events: [] },
  eventSerial: 0,
  muted: false,
  beatEnabled: true,
  activeLaneId: 'white',
  composerPhase: 0,
  concertPhase: 0,
  timeScale: 1,
  assetErrors: [],
  ready: false,
};

let screens;
let composerFrame = 0;
let concertFrame = 0;
let composerReducedPaintAt = 0;
let scheduler = 0;
let scheduled = new Set();
let visualTimers = new Set();
const performances = new Map();
let concertStarting = false;
let concertStartToken = 0;
let lineupTapSuppressedUntil = 0;

const imageFor = (monsterId) => `./assets/monsters/${monsterId}/still.webp`;
const mediaFor = (monsterId, laneId, extension) => {
  const lane = config.lanes.find((item) => item.id === laneId);
  return `./assets/monsters/${monsterId}/${lane.noise}.${extension}`;
};

function iconButton({ id, target = id, label, src, className = '', pressed = null }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `chalk-control ${className}`.trim();
  button.id = id;
  button.dataset.target = target;
  button.setAttribute('aria-label', label);
  if (pressed !== null) button.setAttribute('aria-pressed', String(pressed));
  const image = document.createElement('img');
  image.src = src;
  image.alt = '';
  image.draggable = false;
  button.append(image);
  return button;
}

function renderShell() {
  game.replaceChildren();
  game.className = 'monster-opera';

  const splash = document.createElement('section');
  splash.id = 'splash-screen';
  splash.className = 'screen board-screen splash-screen';
  splash.dataset.qkScreen = 'splash';
  splash.setAttribute('aria-label', 'Monster Opera start screen');
  splash.innerHTML = `
    <a class="platform-home" data-hud="home" data-target="home-catalog" href="../../" aria-label="Back to QLOBE Kids">
      <img src="../../shared/assets/ui/btn-home.png" alt="" draggable="false" />
    </a>
    <img class="splash-title" src="${config.assets.title}" alt="Monster Opera" draggable="false" />
    <div class="splash-stage" aria-hidden="true"></div>
    <div class="splash-lanes" aria-hidden="true">
      ${config.lanes.map((lane) => `<img src="${lane.line}" alt="" />`).join('')}
    </div>
  `;
  const stage = splash.querySelector('.splash-stage');
  for (const dancer of config.splashDancers) {
    const monster = config.monsters.find((item) => item.id === dancer.monsterId);
    const performer = document.createElement('div');
    performer.className = `splash-performer splash-${dancer.monsterId}`;
    performer.innerHTML = `
      <img src="${imageFor(dancer.monsterId)}" alt="" draggable="false" />
      <video src="${dancer.video}" poster="${imageFor(dancer.monsterId)}" muted loop playsinline preload="metadata" aria-label="${monster.label} dancing"></video>
    `;
    stage.append(performer);
  }
  const play = iconButton({
    id: 'start-song', target: 'start', label: 'Start making a song', src: config.assets.controls.play,
    className: 'splash-play primary-control',
  });
  splash.append(play);

  const composer = document.createElement('section');
  composer.id = 'composer-screen';
  composer.className = 'screen board-screen composer-screen';
  composer.dataset.qkScreen = 'composer';
  composer.hidden = true;
  composer.setAttribute('aria-label', 'Compose a monster song');
  const composerBack = iconButton({
    id: 'composer-back', target: 'composer-back', label: 'Back to the Monster Opera start',
    src: config.assets.controls.back, className: 'corner-control top-left',
  });
  const composerSound = iconButton({
    id: 'composer-sound', target: 'sound-composer', label: 'Turn all sound off',
    src: config.assets.controls.soundOn, className: 'corner-control top-right sound-control', pressed: true,
  });
  const composerBeat = iconButton({
    id: 'composer-beat', target: 'beat-composer', label: 'Turn the drum beat off',
    src: config.assets.controls.drumOn, className: 'corner-control bottom-left beat-control', pressed: true,
  });
  const go = iconButton({
    id: 'go-concert', target: 'go', label: 'Play my monster song', src: config.assets.controls.go,
    className: 'go-control primary-control',
  });
  composer.append(composerBack, composerSound, composerBeat, go);

  const timeline = document.createElement('div');
  timeline.className = 'composer-timeline';
  timeline.setAttribute('role', 'img');
  timeline.setAttribute('aria-label', 'Three sixteen-second song lines. The white line is listening now.');
  const laneStack = document.createElement('div');
  laneStack.className = 'lane-stack';
  for (const lane of config.lanes) {
    const row = document.createElement('div');
    row.className = `timeline-lane lane-${lane.id}`;
    row.dataset.laneId = lane.id;
    row.innerHTML = `<img class="lane-art" src="${lane.line}" alt="" draggable="false" /><div class="event-dots" aria-hidden="true"></div>`;
    laneStack.append(row);
  }
  const playhead = document.createElement('img');
  playhead.className = 'composer-playhead';
  playhead.src = config.assets.playhead;
  playhead.alt = '';
  playhead.draggable = false;
  laneStack.append(playhead);
  timeline.append(laneStack);
  composer.append(timeline);

  const lineup = document.createElement('div');
  lineup.className = 'monster-lineup';
  lineup.setAttribute('role', 'list');
  lineup.setAttribute('aria-label', 'Swipe, drag, or scroll, then tap a chalk monster');
  for (const monster of config.monsters) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'composer-monster';
    button.dataset.monsterId = monster.id;
    button.dataset.target = monster.id;
    button.setAttribute('role', 'listitem');
    button.setAttribute('aria-label', `Play the ${monster.label}`);
    button.innerHTML = `
      <img class="monster-still" src="${imageFor(monster.id)}" alt="" draggable="false" />
      <video class="monster-dance" src="${monster.dance}" poster="${imageFor(monster.id)}" muted loop playsinline preload="metadata" aria-hidden="true"></video>
      <video class="monster-video" muted playsinline preload="metadata" aria-hidden="true"></video>
      <span class="monster-chalk-burst" aria-hidden="true"></span>
    `;
    lineup.append(button);
  }
  composer.append(lineup);

  const concert = document.createElement('section');
  concert.id = 'concert-screen';
  concert.className = 'screen board-screen concert-screen';
  concert.dataset.qkScreen = 'concert';
  concert.hidden = true;
  concert.setAttribute('aria-label', 'Your infinitely looping monster concert');
  const concertBack = iconButton({
    id: 'concert-back', target: 'concert-back', label: 'Back to composing',
    src: config.assets.controls.back, className: 'corner-control top-left',
  });
  const concertSound = iconButton({
    id: 'concert-sound', target: 'sound-concert', label: 'Turn all sound off',
    src: config.assets.controls.soundOn, className: 'corner-control top-right sound-control', pressed: true,
  });
  const concertBeat = iconButton({
    id: 'concert-beat', target: 'beat-concert', label: 'Turn the drum beat off',
    src: config.assets.controls.drumOn, className: 'corner-control bottom-left beat-control', pressed: true,
  });
  const newSong = iconButton({
    id: 'new-song', target: 'new-song', label: 'Erase this song and make a new one',
    src: config.assets.controls.newSong, className: 'corner-control bottom-right new-song-control',
  });
  concert.innerHTML = `
    <div class="concert-viewport" aria-label="Your song scrolls past the orange play line">
      <div class="concert-world"></div>
      <img class="concert-playhead" src="${config.assets.playhead}" alt="" draggable="false" />
    </div>
  `;
  concert.append(concertBack, concertSound, concertBeat, newSong);

  const live = document.createElement('p');
  live.className = 'visually-hidden';
  live.id = 'monster-opera-status';
  live.setAttribute('aria-live', 'polite');
  game.append(splash, composer, concert, live);
}

renderShell();

const els = {
  splash: game.querySelector('#splash-screen'),
  composer: game.querySelector('#composer-screen'),
  concert: game.querySelector('#concert-screen'),
  status: game.querySelector('#monster-opera-status'),
  play: game.querySelector('#start-song'),
  composerBack: game.querySelector('#composer-back'),
  concertBack: game.querySelector('#concert-back'),
  go: game.querySelector('#go-concert'),
  newSong: game.querySelector('#new-song'),
  timeline: game.querySelector('.composer-timeline'),
  playhead: game.querySelector('.composer-playhead'),
  lineup: game.querySelector('.monster-lineup'),
  world: game.querySelector('.concert-world'),
};

game.addEventListener('error', (event) => {
  const node = event.target;
  if (!(node instanceof HTMLImageElement || node instanceof HTMLVideoElement)) return;
  const source = node.currentSrc || node.src || 'unknown-media';
  if (!state.assetErrors.includes(source)) state.assetErrors.push(source);
}, true);

function announce(text) {
  els.status.textContent = '';
  requestAnimationFrame(() => { els.status.textContent = text; });
}

function activeComposerPosition() {
  return composerPosition(composerClock.elapsed(), laneSeconds, config.lanes.length);
}

function updateControlArt() {
  for (const button of game.querySelectorAll('.sound-control')) {
    const image = button.querySelector('img');
    image.src = state.muted ? config.assets.controls.soundOff : config.assets.controls.soundOn;
    button.setAttribute('aria-pressed', String(!state.muted));
    button.setAttribute('aria-label', state.muted ? 'Turn all sound on' : 'Turn all sound off');
  }
  for (const button of game.querySelectorAll('.beat-control')) {
    const image = button.querySelector('img');
    image.src = state.beatEnabled ? config.assets.controls.drumOn : config.assets.controls.drumOff;
    button.setAttribute('aria-pressed', String(state.beatEnabled));
    button.setAttribute('aria-label', state.beatEnabled ? 'Turn the drum beat off' : 'Turn the drum beat on');
  }
  els.go.classList.toggle('is-ready', state.song.events.length > 0);
  els.go.classList.toggle('is-loading', concertStarting);
  els.go.setAttribute('aria-disabled', String(state.song.events.length === 0 || concertStarting));
}

function setConcertStarting(on) {
  concertStarting = Boolean(on);
  els.go.disabled = concertStarting;
  els.go.setAttribute('aria-busy', String(concertStarting));
  updateControlArt();
}

function setMuted(on) {
  state.muted = Boolean(on);
  audio.setMuted(state.muted);
  sfx.setMuted(state.muted);
  updateControlArt();
  announce(state.muted ? 'Sound off' : 'Sound on');
  return state.muted;
}

function toggleSound() {
  setMuted(!state.muted);
  if (!state.muted) audio.unlock();
}

function toggleBeat() {
  state.beatEnabled = !state.beatEnabled;
  audio.setBeatEnabled(state.beatEnabled);
  updateControlArt();
  announce(state.beatEnabled ? 'Drum beat on' : 'Drum beat off');
}

function playSplashVideos() {
  if (reduceMotion.matches) return;
  for (const video of els.splash.querySelectorAll('video')) video.play().catch(() => {});
}

function playComposerDance(button) {
  const video = button?.querySelector('.monster-dance');
  if (!video || reduceMotion.matches || document.hidden || !screens?.is('composer')) return;
  video.play().then(
    () => button.classList.add('is-dance-ready'),
    () => button.classList.remove('is-dance-ready'),
  );
}

function playComposerDances() {
  for (const button of els.lineup.querySelectorAll('.composer-monster')) playComposerDance(button);
}

function pauseVideos(root = game) {
  const buttons = new Set();
  for (const video of root.querySelectorAll('video')) {
    const button = video.closest('.composer-monster, .concert-event');
    if (button) buttons.add(button);
  }
  for (const button of buttons) performances.get(button)?.();
  for (const video of root.querySelectorAll('video')) {
    try { video.pause(); } catch { /* media is optional */ }
  }
}

function startComposerFrames() {
  cancelAnimationFrame(composerFrame);
  composerReducedPaintAt = 0;
  const paint = (time) => {
    if (!screens?.is('composer')) return;
    const position = activeComposerPosition();
    if (!reduceMotion.matches || time - composerReducedPaintAt > 350) {
      composerReducedPaintAt = time;
      const lane = config.lanes[position.laneIndex];
      state.activeLaneId = lane.id;
      state.composerPhase = position.phase;
      for (const row of els.timeline.querySelectorAll('.timeline-lane')) {
        row.classList.toggle('is-active', row.dataset.laneId === lane.id);
      }
      const percent = 2.5 + position.phase / loopSeconds * 95;
      els.playhead.style.left = `${percent}%`;
      els.timeline.setAttribute('aria-label', `Three sixteen-second song lines. The ${lane.id} line is listening now.`);
    }
    composerFrame = requestAnimationFrame(paint);
  };
  composerFrame = requestAnimationFrame(paint);
}

function stopComposerFrames() {
  cancelAnimationFrame(composerFrame);
  composerFrame = 0;
}

function renderComposerEvents(newEventId = null) {
  for (const lane of config.lanes) {
    const host = els.timeline.querySelector(`[data-lane-id="${lane.id}"] .event-dots`);
    host.replaceChildren();
    for (const event of state.song.events.filter((item) => item.laneId === lane.id)) {
      const dot = document.createElement('img');
      dot.className = 'timeline-dot';
      if (event.id === newEventId) dot.classList.add('is-new');
      dot.src = lane.dot;
      dot.alt = '';
      dot.dataset.eventId = event.id;
      dot.style.left = `${2.5 + event.at / loopSeconds * 95}%`;
      host.append(dot);
    }
  }
  updateControlArt();
}

function pulseBlocked(monsterId, candidate) {
  const button = els.lineup.querySelector(`[data-monster-id="${monsterId}"]`);
  button.classList.remove('is-blocked');
  requestAnimationFrame(() => button.classList.add('is-blocked'));
  setTimeout(() => button.classList.remove('is-blocked'), 650);
  const match = state.song.events.find((event) => (
    event.laneId === candidate.laneId && event.monsterId === candidate.monsterId
    && Math.min(Math.abs(event.at - candidate.at), loopSeconds - Math.abs(event.at - candidate.at)) < clipSeconds
  ));
  if (match) {
    const dot = els.timeline.querySelector(`[data-event-id="${match.id}"]`);
    dot?.classList.add('is-winking');
    setTimeout(() => dot?.classList.remove('is-winking'), 650);
  }
}

function showMonsterVideo(button, laneId, kind = 'preview') {
  const monsterId = button.dataset.monsterId || button.dataset.eventMonster;
  const video = button.querySelector('.monster-video');
  const dance = button.querySelector('.monster-dance');
  const source = mediaFor(monsterId, laneId, 'mp4');
  performances.get(button)?.();
  dance?.pause();
  if (!video.src.endsWith(source.replace('./', '/'))) video.src = source;
  video.currentTime = 0;
  button.classList.remove('is-performing', 'is-solo');
  let settled = false;
  let fallback = 0;
  const begin = () => {
    if (settled) return;
    button.classList.add('is-performing');
    if (kind === 'manual') button.classList.add('is-solo');
  };
  const finish = () => {
    if (settled) return;
    settled = true;
    clearTimeout(fallback);
    button.classList.remove('is-performing', 'is-solo');
    video.removeEventListener('playing', begin);
    video.removeEventListener('ended', finish);
    if (performances.get(button) === finish) performances.delete(button);
    playComposerDance(button);
  };
  performances.set(button, finish);
  video.addEventListener('playing', begin, { once: true });
  video.addEventListener('ended', finish, { once: true });
  fallback = setTimeout(finish, (clipSeconds + 0.75) * 1000);
  video.play().then(begin, finish);
}

function installLineupScrolling(lineup) {
  let drag = null;

  const onWheel = (event) => {
    const raw = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (!raw) return;
    const scale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 32
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? lineup.clientWidth : 1;
    const delta = raw * scale;
    const max = Math.max(0, lineup.scrollWidth - lineup.clientWidth);
    const next = Math.max(0, Math.min(max, lineup.scrollLeft + delta));
    if (Math.abs(next - lineup.scrollLeft) < 0.5) return;
    event.preventDefault();
    lineup.scrollLeft = next;
  };

  const onPointerDown = (event) => {
    if (event.pointerType !== 'mouse' || event.button !== 0 || event.isPrimary === false) return;
    drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: lineup.scrollLeft,
      moved: false,
    };
  };

  const onPointerMove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const delta = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(delta) < 7) return;
    drag.moved = true;
    lineup.classList.add('is-dragging');
    lineup.scrollLeft = drag.startScrollLeft - delta;
    event.preventDefault();
  };

  const finishPointer = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.moved) {
      lineupTapSuppressedUntil = performance.now() + 350;
      event.preventDefault();
    }
    drag = null;
    lineup.classList.remove('is-dragging');
  };

  lineup.addEventListener('wheel', onWheel, { passive: false });
  lineup.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove, { passive: false });
  window.addEventListener('pointerup', finishPointer, true);
  window.addEventListener('pointercancel', finishPointer, true);
  return () => {
    lineup.removeEventListener('wheel', onWheel);
    lineup.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', finishPointer, true);
    window.removeEventListener('pointercancel', finishPointer, true);
  };
}

function flyDot(button, event) {
  if (reduceMotion.matches) return;
  const lane = config.lanes.find((item) => item.id === event.laneId);
  const row = els.timeline.querySelector(`[data-lane-id="${event.laneId}"]`);
  const from = button.getBoundingClientRect();
  const to = row.getBoundingClientRect();
  const flying = document.createElement('img');
  flying.className = 'flying-dot';
  flying.src = lane.dot;
  flying.alt = '';
  flying.style.left = `${from.left + from.width / 2}px`;
  flying.style.top = `${from.top + from.height * 0.32}px`;
  game.append(flying);
  const dx = to.left + to.width * (0.025 + event.at / loopSeconds * 0.95) - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height * 0.32);
  const animation = flying.animate([
    { transform: 'translate(-50%, -50%) scale(1.7)', opacity: 0.9 },
    { transform: `translate(calc(-50% + ${dx * 0.52}px), calc(-50% + ${dy * 0.2 - 70}px)) scale(1.15)`, opacity: 1, offset: 0.55 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(.75)`, opacity: 0.25 },
  ], { duration: 620, easing: 'cubic-bezier(.2,.8,.2,1)' });
  animation.finished.then(() => flying.remove(), () => flying.remove());
}

function recordMonster(monsterId, button = null) {
  if (!screens.is('composer') || concertStarting) return false;
  const position = activeComposerPosition();
  const lane = config.lanes[position.laneIndex];
  const candidate = {
    id: `event-${state.eventSerial + 1}`,
    monsterId,
    laneId: lane.id,
    at: Math.round(position.phase * 100) / 100,
    createdAt: state.eventSerial + 1,
  };
  if (overlapsBlock(state.song.events, candidate, { loopSeconds, clipSeconds })) {
    pulseBlocked(monsterId, candidate);
    return false;
  }
  state.eventSerial += 1;
  candidate.id = `event-${state.eventSerial}`;
  candidate.createdAt = state.eventSerial;
  state.song.events.push(candidate);
  const target = button || els.lineup.querySelector(`[data-monster-id="${monsterId}"]`);
  showMonsterVideo(target, lane.id, 'preview');
  audio.play(mediaFor(monsterId, lane.id, 'm4a'), {
    kind: 'preview', monsterId, laneId: lane.id, eventId: candidate.id,
  });
  if (!state.muted) sfx.pop();
  renderComposerEvents(candidate.id);
  flyDot(target, candidate);
  announce(`${lane.id} line added the ${config.monsters.find((item) => item.id === monsterId).label}`);
  return true;
}

function nudgeComposer() {
  if (!screens?.is('composer')) return;
  els.lineup.classList.add('is-nudged');
  els.timeline.querySelector(`[data-lane-id="${state.activeLaneId}"]`)?.classList.add('is-nudged');
  const origin = els.lineup.scrollLeft;
  const peek = Math.min(148, els.lineup.clientWidth * 0.16);
  if (!reduceMotion.matches && els.lineup.scrollWidth > els.lineup.clientWidth + peek) {
    els.lineup.scrollTo({ left: origin + peek, behavior: 'smooth' });
    setTimeout(() => {
      if (Math.abs(els.lineup.scrollLeft - origin - peek) < 28) {
        els.lineup.scrollTo({ left: origin, behavior: 'smooth' });
      }
    }, 820);
  }
  setTimeout(() => {
    els.lineup.classList.remove('is-nudged');
    for (const row of els.timeline.querySelectorAll('.timeline-lane')) row.classList.remove('is-nudged');
  }, 1800);
}

const nudger = createNudger({ first: 8500, repeat: 11000, onNudge: nudgeComposer });

function renderConcert() {
  for (const dispose of concertDisposers.splice(0)) dispose?.();
  els.concert.classList.toggle('is-sparse', state.song.events.length <= 4);
  els.world.replaceChildren();
  for (let panelIndex = 0; panelIndex < 3; panelIndex += 1) {
    const panel = document.createElement('div');
    panel.className = 'song-panel';
    panel.dataset.panel = String(panelIndex);
    const plate = document.createElement('img');
    plate.className = 'concert-track-art video-overlay-layer';
    plate.src = config.assets.concertPlate;
    plate.alt = '';
    plate.draggable = false;
    panel.append(plate);
    for (const event of state.song.events) {
      const monster = config.monsters.find((item) => item.id === event.monsterId);
      const laneIndex = config.lanes.findIndex((item) => item.id === event.laneId);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `concert-event concert-lane-${event.laneId}`;
      button.dataset.eventId = event.id;
      button.dataset.eventMonster = event.monsterId;
      button.dataset.laneId = event.laneId;
      button.dataset.target = `concert-${event.id}-${panelIndex}`;
      button.setAttribute('aria-label', `Play ${monster.label} now`);
      button.style.setProperty('--event-x', `${event.at / loopSeconds * 100}%`);
      button.style.setProperty('--lane-y', `${17 + laneIndex * 33}%`);
      button.innerHTML = `
        <img class="monster-still" src="${imageFor(event.monsterId)}" alt="" draggable="false" />
        <video class="monster-video video-overlay-layer" muted playsinline preload="metadata" aria-hidden="true"></video>
      `;
      panel.append(button);
      concertDisposers.push(onTap(button, () => playManual(event, button), { feedback: () => button.classList.add('is-pressed') }));
      const release = () => button.classList.remove('is-pressed');
      button.addEventListener('pointerup', release);
      button.addEventListener('pointercancel', release);
      concertDisposers.push(() => {
        button.removeEventListener('pointerup', release);
        button.removeEventListener('pointercancel', release);
      });
    }
    els.world.append(panel);
  }
}

function playManual(event, button) {
  if (!screens.is('concert')) return false;
  showMonsterVideo(button, event.laneId, 'manual');
  audio.play(mediaFor(event.monsterId, event.laneId, 'm4a'), {
    kind: 'manual', monsterId: event.monsterId, laneId: event.laneId, eventId: event.id, gain: 0.72,
  });
  announce(`${config.monsters.find((item) => item.id === event.monsterId).label} solo`);
  return true;
}

function nearestConcertButton(eventId) {
  const center = innerWidth / 2;
  return [...els.concert.querySelectorAll(`[data-event-id="${eventId}"]`)]
    .map((node) => ({ node, distance: Math.abs(node.getBoundingClientRect().left + node.offsetWidth / 2 - center) }))
    .sort((a, b) => a.distance - b.distance)[0]?.node || null;
}

function animateScheduled(event) {
  if (!screens.is('concert')) return;
  const button = nearestConcertButton(event.id);
  if (button) showMonsterVideo(button, event.laneId, 'scheduled');
}

function clearVisualTimers() {
  for (const timer of visualTimers) clearTimeout(timer);
  visualTimers.clear();
}

function scheduleConcert() {
  if (!screens.is('concert') || !concertClock.running) return;
  const now = concertClock.elapsed();
  const realLookahead = lookaheadSeconds * concertClock.speed;
  const occurrences = occurrencesBetween(state.song.events, now - 0.045 * concertClock.speed, now + realLookahead, loopSeconds);
  for (const occurrence of occurrences) {
    const key = `${occurrence.event.id}@${occurrence.loop}`;
    if (scheduled.has(key)) continue;
    scheduled.add(key);
    const delay = Math.max(0, (occurrence.at - now) / concertClock.speed);
    const when = (audio.context?.currentTime || 0) + delay;
    audio.play(mediaFor(occurrence.event.monsterId, occurrence.event.laneId, 'm4a'), {
      kind: 'scheduled', monsterId: occurrence.event.monsterId, laneId: occurrence.event.laneId,
      eventId: occurrence.event.id, when, gain: 0.68,
    });
    const timer = setTimeout(() => {
      visualTimers.delete(timer);
      animateScheduled(occurrence.event);
    }, delay * 1000);
    visualTimers.add(timer);
  }
  const oldLoop = Math.floor(now / loopSeconds) - 2;
  for (const key of [...scheduled]) {
    if (Number(key.split('@')[1]) < oldLoop) scheduled.delete(key);
  }
}

function startConcertFrames() {
  cancelAnimationFrame(concertFrame);
  const paint = () => {
    if (!screens?.is('concert')) return;
    const elapsed = concertClock.elapsed();
    const phase = wrap(elapsed, loopSeconds);
    state.concertPhase = phase;
    const x = reduceMotion.matches ? -100 : -50 - phase / loopSeconds * 100;
    els.world.style.transform = `translate3d(${x}vw, 0, 0)`;
    concertFrame = requestAnimationFrame(paint);
  };
  concertFrame = requestAnimationFrame(paint);
}

function startConcertTransport() {
  scheduled = new Set();
  clearVisualTimers();
  concertClock.resume();
  scheduleConcert();
  clearInterval(scheduler);
  scheduler = setInterval(scheduleConcert, schedulerMilliseconds);
  startConcertFrames();
  if (!audio.getAudioLog().some(({ kind }) => kind === 'manual')) {
    const invitation = setTimeout(() => {
      visualTimers.delete(invitation);
      if (!screens.is('concert') || !state.song.events.length) return;
      const button = nearestConcertButton(state.song.events[0].id);
      if (!button) return;
      button.classList.add('is-inviting');
      const finish = setTimeout(() => {
        visualTimers.delete(finish);
        button.classList.remove('is-inviting');
      }, 1500);
      visualTimers.add(finish);
    }, 3600);
    visualTimers.add(invitation);
  }
}

function stopConcertTransport({ pause = true } = {}) {
  clearInterval(scheduler);
  scheduler = 0;
  cancelAnimationFrame(concertFrame);
  concertFrame = 0;
  clearVisualTimers();
  scheduled.clear();
  if (pause) concertClock.pause();
  audio.stopVoices();
  pauseVideos(els.concert);
}

function resetSong() {
  concertStartToken += 1;
  setConcertStarting(false);
  state.song.events = [];
  state.eventSerial = 0;
  composerClock.set(0);
  concertClock.set(0);
  state.activeLaneId = 'white';
  state.composerPhase = 0;
  state.concertPhase = 0;
  audio.stopVoices();
  renderComposerEvents();
  announce('A fresh song is ready');
  return true;
}

function startComposer({ reset = false } = {}) {
  if (reset) resetSong();
  screens.show('composer', { force: screens.is('composer') });
  return true;
}

async function startConcert() {
  if (state.song.events.length === 0) {
    nudgeComposer();
    announce('Tap a monster first');
    return false;
  }
  if (concertStarting) return false;
  const origin = screens.current;
  const token = ++concertStartToken;
  setConcertStarting(true);
  const used = state.song.events.map((event) => mediaFor(event.monsterId, event.laneId, 'm4a'));
  try {
    await audio.preload(used);
    if (token !== concertStartToken || screens.current !== origin || state.song.events.length === 0) return false;
    concertClock.set(0);
    renderConcert();
    screens.show('concert', { force: screens.is('concert') });
    if (!state.muted) sfx.sparkle();
    return true;
  } finally {
    if (token === concertStartToken) setConcertStarting(false);
  }
}

function enterScreen(name) {
  state.screen = name;
  if (name === 'splash') {
    playSplashVideos();
  } else if (name === 'composer') {
    pauseVideos(els.splash);
    composerClock.resume();
    renderComposerEvents();
    startComposerFrames();
    playComposerDances();
    nudger.arm();
  } else if (name === 'concert') {
    composerClock.pause();
    nudger.stop();
    startConcertTransport();
  }
}

function exitScreen(name) {
  if (name === 'splash') pauseVideos(els.splash);
  if (name === 'composer') {
    if (concertStarting) {
      concertStartToken += 1;
      setConcertStarting(false);
    }
    composerClock.pause();
    stopComposerFrames();
    nudger.stop();
    audio.stopVoices('preview');
    pauseVideos(els.composer);
  }
  if (name === 'concert') stopConcertTransport();
}

screens = createScreens({
  screens: { splash: els.splash, composer: els.composer, concert: els.concert },
  initial: 'splash',
  onEnter: enterScreen,
  onExit: exitScreen,
});

function bindControls() {
  disposers.push(installLineupScrolling(els.lineup));
  disposers.push(onTap(els.play, async () => {
    await audio.unlock();
    audio.startBeat(config.assets.beat);
    const allSamples = config.monsters.flatMap((monster) => config.lanes.map((lane) => mediaFor(monster.id, lane.id, 'm4a')));
    audio.preload(allSamples);
    startComposer();
  }, { feedback: () => { if (!state.muted) sfx.tick(); } }));
  disposers.push(onTap(els.composerBack, () => screens.show('splash'), { feedback: () => { if (!state.muted) sfx.tick(); } }));
  disposers.push(onTap(els.concertBack, () => screens.show('composer'), { feedback: () => { if (!state.muted) sfx.tick(); } }));
  disposers.push(onTap(els.go, startConcert, { feedback: () => { if (!state.muted) sfx.tick(); } }));
  disposers.push(onTap(els.newSong, () => startComposer({ reset: true }), { feedback: () => { if (!state.muted) sfx.unpop(); } }));
  for (const button of game.querySelectorAll('.sound-control')) {
    disposers.push(onTap(button, toggleSound, { feedback: () => { if (!state.muted) sfx.tick(); } }));
  }
  for (const button of game.querySelectorAll('.beat-control')) {
    disposers.push(onTap(button, toggleBeat, { feedback: () => { if (!state.muted) sfx.tick(); } }));
  }
  for (const button of els.lineup.querySelectorAll('.composer-monster')) {
    disposers.push(onTap(button, () => (
      performance.now() < lineupTapSuppressedUntil
        ? false
        : recordMonster(button.dataset.monsterId, button)
    ), {
      feedback: () => button.classList.add('is-pressed'),
    }));
    button.addEventListener('pointerup', () => button.classList.remove('is-pressed'));
    button.addEventListener('pointercancel', () => button.classList.remove('is-pressed'));
  }
}

bindControls();
updateControlArt();
renderComposerEvents();

const uninstallKiosk = installKioskGuards();
const uninstallUnlock = installUnlockOnGesture({ extra: [() => audio.unlock()] });
disposers.push(uninstallKiosk, uninstallUnlock);

function setTransportSpeed(input = 0.05) {
  const n = Number(input);
  const multiplier = Number.isFinite(n) && n > 0 ? Math.min(1, n > 1 ? 1 / n : n) : 0.05;
  const speed = 1 / Math.max(0.01, multiplier);
  state.timeScale = speed;
  composerClock.setSpeed(speed);
  concertClock.setSpeed(speed);
  scheduled.clear();
  return multiplier;
}

function debugTap(targetId) {
  if (targetId === 'go') return startConcert();
  if (targetId === 'new-song') return startComposer({ reset: true });
  const monster = config.monsters.find((item) => item.id === targetId);
  if (monster && screens.is('composer')) return recordMonster(monster.id);
  const concertMatch = String(targetId).match(/^concert-(event-\d+)(?:-\d+)?$/);
  if (concertMatch && screens.is('concert')) {
    const event = state.song.events.find((item) => item.id === concertMatch[1]);
    const button = nearestConcertButton(event?.id);
    return event && button ? playManual(event, button) : false;
  }
  const node = game.querySelector(`[data-target="${CSS.escape(String(targetId))}"]`);
  if (!node) return false;
  node.click();
  return true;
}

function setComposerTime(seconds) {
  composerClock.set(Math.max(0, Number(seconds) || 0));
  const position = activeComposerPosition();
  state.activeLaneId = config.lanes[position.laneIndex].id;
  state.composerPhase = position.phase;
  return { laneId: state.activeLaneId, phase: state.composerPhase };
}

function setConcertTime(seconds) {
  concertClock.set(Math.max(0, Number(seconds) || 0));
  state.concertPhase = wrap(concertClock.elapsed(), loopSeconds);
  audio.stopVoices();
  scheduled.clear();
  clearVisualTimers();
  if (screens.is('concert')) scheduleConcert();
  return state.concertPhase;
}

let resolveReady;
const ready = new Promise((resolve) => { resolveReady = resolve; });

const uninstallDebug = installDebug({
  gameId: config.id,
  engine: config.engine,
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode: (id) => (id === 'concert' ? startConcert() : startComposer()),
  getState: () => ({
    screen: screens.current,
    muted: state.muted,
    beatEnabled: state.beatEnabled,
    activeLaneId: state.activeLaneId,
    composerPhase: Math.round(state.composerPhase * 100) / 100,
    concertPhase: Math.round(state.concertPhase * 100) / 100,
    timeScale: state.timeScale,
    song: { events: state.song.events.map((event) => ({ ...event })) },
    concertStarting,
    activeManualVoices: [...audio.voices].filter((voice) => voice.kind === 'manual').length,
    audio: audio.stats(),
    assetErrors: [...state.assetErrors],
  }),
  tap: debugTap,
  home: () => { screens.show('splash'); return true; },
  mute: setMuted,
  fastTimers: setTransportSpeed,
  setComposerTime,
  setConcertTime,
  getSong: () => ({ events: state.song.events.map((event) => ({ ...event })) }),
  newSong: () => startComposer({ reset: true }),
  getAudioLog: () => audio.getAudioLog(),
  getTransportState: () => ({
    composerElapsed: composerClock.elapsed(), concertElapsed: concertClock.elapsed(),
    composerRunning: composerClock.running, concertRunning: concertClock.running,
    scheduled: scheduled.size,
  }),
});
disposers.push(uninstallDebug);

function handleVisibility() {
  if (document.hidden) {
    if (screens.is('composer')) {
      composerClock.pause();
      stopComposerFrames();
    }
    if (screens.is('concert')) stopConcertTransport();
    audio.stopVoices();
    pauseVideos();
    return;
  }
  if (screens.is('composer')) {
    composerClock.resume();
    startComposerFrames();
    playComposerDances();
  }
  if (screens.is('concert')) startConcertTransport();
  if (screens.is('splash')) playSplashVideos();
}
document.addEventListener('visibilitychange', handleVisibility);
disposers.push(() => document.removeEventListener('visibilitychange', handleVisibility));

const criticalImages = [
  config.assets.blackboard, config.assets.title, config.assets.playhead, config.assets.concertPlate,
  ...Object.values(config.assets.controls), ...config.lanes.flatMap((lane) => [lane.line, lane.dot]),
  ...config.monsters.map((monster) => imageFor(monster.id)),
];

preloadImages(criticalImages).then(() => {
  state.ready = true;
  game.classList.add('is-ready');
  resolveReady(true);
  playSplashVideos();
});

window.addEventListener('pagehide', () => {
  for (const dispose of concertDisposers.splice(0)) {
    try { dispose?.(); } catch { /* teardown always continues */ }
  }
  for (const dispose of disposers.splice(0)) {
    try { dispose?.(); } catch { /* teardown always continues */ }
  }
  screens.destroy();
  nudger.stop();
  audio.destroy();
}, { once: true });
