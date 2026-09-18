import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { installKioskGuards, installUnlockOnGesture, unlockAll } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';

const root = document.getElementById('game');
const timers = createTimers();
const journalIds = config.modes.flatMap((mode) => mode.rounds.map((round) => round.id));
const journalSet = new Set(journalIds);
const modeById = Object.fromEntries(config.modes.map((mode) => [mode.id, mode]));
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  screen: 'splash',
  modeId: null,
  round: 0,
  phase: 'choose',
  misses: 0,
  transitioning: false,
  found: new Set(loadProgress()),
  lastVoiceKey: 'welcome',
  lastBirdCall: null,
  muted: false,
  renderToken: 0,
  rng: mulberry32(42),
  seed: 42,
};

let birdContext = null;
let birdMaster = null;
let birdNodes = [];
let traceObserver = null;

const assetUrls = [
  config.assets.title,
  config.assets.prompt,
  config.assets.button,
  config.assets.journalTab,
  config.assets.journalSlot,
  config.assets.discoveryGlow,
  config.assets.badge,
  config.assets.traceBrush,
  './assets/backgrounds/trail-hub.webp',
  './assets/backgrounds/journal-glow.webp',
  ...Object.values(config.guides),
  ...config.modes.flatMap((mode) => [mode.card, mode.scene]),
  ...Object.values(config.specimens).map((item) => item.asset),
  ...config.forestPool.map((id) => `./assets/specimens/${id}.webp`),
  ...modeById.tracks.rounds.map((round) => `./assets/specimens/track-${round.id}.webp`),
];

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(assetUrls),
]).then(() => true);

installKioskGuards();
installUnlockOnGesture({
  extra: [unlockBirdAudio],
  onFirst: () => timers.after(120, () => {
    if (state.screen === 'splash') say('welcome');
  }),
});

renderSplash({ greet: false });

function loadProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(config.progressKey) || '[]');
    return Array.isArray(saved) ? saved.filter((id) => journalSet.has(id)) : [];
  } catch {
    return [];
  }
}

function saveProgress() {
  try {
    localStorage.setItem(config.progressKey, JSON.stringify([...state.found]));
  } catch {
    // Progress is a delight, not a prerequisite; private browsing may deny storage.
  }
}

function line(key) {
  return config.voice[key] || '';
}

function say(key) {
  if (!key) return Promise.resolve(false);
  state.lastVoiceKey = key;
  if (state.muted) return Promise.resolve(false);
  return voice.say(key, line(key));
}

function playSfx(name) {
  unlockAll([unlockBirdAudio]);
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* Sound never carries game state. */ }
}

function specimen(id) {
  return config.specimens[id] || {
    id,
    name: id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' '),
    asset: `./assets/specimens/${id}.webp`,
  };
}

function shuffle(values) {
  const list = [...values];
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(state.rng() * (index + 1));
    [list[index], list[swap]] = [list[swap], list[index]];
  }
  return list;
}

function beginRender(screen) {
  timers.clearAll();
  traceObserver?.disconnect();
  traceObserver = null;
  stopBirdAudio();
  voice.stop();
  state.screen = screen;
  state.transitioning = false;
  state.renderToken += 1;
  return state.renderToken;
}

function renderSplash({ greet = true } = {}) {
  beginRender('splash');
  state.modeId = null;
  state.round = 0;
  state.phase = 'choose';
  root.innerHTML = `
    <section class="world-screen splash-screen" aria-label="Local Nature Guide trail map">
      <div class="hud-slot hud-left" data-hud-home></div>
      <div class="hud-slot hud-right" data-hud-sound></div>
      <main class="splash-layout">
        <img class="title-lockup" src="${config.assets.title}" alt="Local Nature Guide">
        <div class="splash-invitation paper-caption">
          <span class="eyebrow">Suri's trail map</span>
          <strong>Which way should we explore?</strong>
          <small>Later, take your guide eyes outside with a grown-up.</small>
        </div>
        <div class="mode-cards" aria-label="Choose an adventure">
          ${config.modes.map((mode) => `
            <button class="mode-card" type="button" data-mode="${mode.id}" data-target="mode-${mode.id}" aria-label="${mode.title}: ${mode.subtitle}">
              <img src="${mode.card}" alt="">
              <span class="mode-label"><strong>${mode.title}</strong><small>${mode.subtitle}</small></span>
              ${mode.rounds.every((round) => state.found.has(round.id)) ? `<img class="complete-stamp" src="${config.assets.badge}" alt="Complete">` : ''}
            </button>
          `).join('')}
        </div>
        <button class="journal-tab" type="button" data-open-journal data-target="journal">
          <img src="${config.assets.journalTab}" alt="">
          <span><strong>Nature Journal</strong><small>${state.found.size} of ${journalIds.length} discoveries</small></span>
        </button>
        <img class="guide guide-welcome" src="${config.guides.welcome}" alt="Suri the squirrel nature guide">
      </main>
    </section>`;

  mountHud({ splash: true });
  root.querySelectorAll('[data-mode]').forEach((button) => {
    bindTap(button, () => startMode(button.dataset.mode), 'pop');
  });
  bindTap(root.querySelector('[data-open-journal]'), () => openJournal(), 'whoosh');
  if (greet) say('welcome');
}

function startMode(id, { announceIntro = true } = {}) {
  const mode = modeById[id];
  if (!mode) return false;
  state.modeId = id;
  state.round = 0;
  state.misses = 0;
  state.phase = id === 'tracks' ? 'trace' : 'choose';
  renderRound({ announceIntro });
  return true;
}

function renderRound({ announceIntro = false } = {}) {
  const mode = modeById[state.modeId];
  if (!mode) return renderSplash({ greet: false });
  if (state.round >= mode.rounds.length) return openJournal({ celebrationKey: mode.completeKey, focusMode: mode.id });
  const token = beginRender('play');
  state.phase = mode.id === 'tracks' ? 'trace' : 'choose';
  state.misses = 0;

  if (mode.id === 'forest') renderForest(mode);
  else if (mode.id === 'birds') renderBirds(mode);
  else renderTracks(mode);

  mountHud({ splash: false });
  mountProgress(mode);
  announceRound(mode, token, announceIntro);
}

function sceneShell(mode, content, guideKey = mode.guide) {
  return `
    <section class="world-screen play-screen mode-${mode.id}" style="background-image:url('${mode.scene}')" aria-label="${mode.title}">
      <div class="hud-slot hud-left" data-hud-back></div>
      <div class="hud-slot hud-right" data-hud-sound></div>
      <div class="progress-slot" data-progress></div>
      ${content}
      <button class="journal-shortcut" type="button" data-journal-shortcut data-target="journal-shortcut" aria-label="Open Nature Journal">
        <img src="${config.assets.journalTab}" alt="">
        <span>${state.found.size}/${journalIds.length}</span>
      </button>
      <img class="guide guide-${guideKey}" src="${config.guides[guideKey]}" alt="Suri helps with ${mode.title}">
      <p class="live-note" aria-live="polite" data-live></p>
    </section>`;
}

function promptPlate(copy, kicker) {
  return `
    <div class="prompt-plate">
      <img src="${config.assets.prompt}" alt="">
      <div class="prompt-copy"><span>${kicker}</span><strong data-prompt-copy>${copy}</strong></div>
    </div>`;
}

function renderForest(mode) {
  const round = mode.rounds[state.round];
  const target = specimen(round.id);
  const choices = shuffle(config.forestPool);
  const content = `
    ${promptPlate(`Find the ${target.name.toLowerCase()}`, `Forest find ${state.round + 1}`)}
    <div class="forest-find-grid" aria-label="Nature finds">
      ${choices.map((id) => {
        const item = specimen(id);
        return `<button type="button" class="specimen-button forest-specimen" data-pick="${id}" data-target="find-${id}" aria-label="${item.name}">
          <img src="${item.asset}" alt="${item.name}">
        </button>`;
      }).join('')}
    </div>`;
  root.innerHTML = sceneShell(mode, content, 'point');
  wireRound(mode, round);
}

function renderBirds(mode) {
  const round = mode.rounds[state.round];
  state.lastBirdCall = round.id;
  const choices = shuffle(mode.rounds.map((item) => item.id));
  const content = `
    ${promptPlate('Listen, then choose the bird', `Bird song ${state.round + 1}`)}
    <button class="painted-button replay-call" type="button" data-replay-call data-target="replay-call">
      <img src="${config.assets.button}" alt="">
      <span>Listen again</span>
    </button>
    <div class="bird-perches" aria-label="Bird choices">
      ${choices.map((id) => {
        const item = specimen(id);
        return `<button type="button" class="specimen-button bird-choice bird-${id}" data-pick="${id}" data-target="bird-${id}" aria-label="${item.name}">
          <img src="${item.asset}" alt="${item.name}">
          <span>${item.name}</span>
        </button>`;
      }).join('')}
    </div>`;
  root.innerHTML = sceneShell(mode, content, 'listen');
  bindTap(root.querySelector('[data-replay-call]'), () => {
    voice.stop();
    playBirdCall(round.id);
    root.querySelector('[data-replay-call]').classList.add('is-playing');
    timers.after(900, () => root.querySelector('[data-replay-call]')?.classList.remove('is-playing'));
  }, 'tick');
  wireRound(mode, round);
}

function renderTracks(mode) {
  const round = mode.rounds[state.round];
  const choices = shuffle(mode.rounds.map((item) => item.id));
  const content = `
    ${promptPlate('Trace the trail from bottom to top', `Track clue ${state.round + 1}`)}
    <div class="track-workspace">
      <div class="track-board" data-track-board>
        <img class="track-ribbon" src="./assets/specimens/track-${round.id}.webp" alt="A trail of animal footprints">
        <img class="trace-start-glow" src="${config.assets.discoveryGlow}" alt="">
        <canvas class="trace-canvas" data-trace tabindex="0" role="button" aria-label="Trace along the animal footprints from bottom to top. Keyboard players can press Enter to complete the trace."></canvas>
        <img class="trace-brush-marker" data-trace-brush src="${config.assets.traceBrush}" alt="">
        <span class="trace-start-label" data-trace-start aria-hidden="true">Start here</span>
        <div class="trace-meter" aria-hidden="true"><span data-trace-meter></span></div>
      </div>
      <div class="track-answers" data-track-answers aria-hidden="true">
        <span class="answer-kicker" data-answer-kicker>Trace first, then choose</span>
        ${choices.map((id) => {
          const item = specimen(id);
          return `<button type="button" class="specimen-button animal-choice" data-pick="${id}" data-target="track-${id}" aria-label="${item.name}" disabled>
            <img src="${item.asset}" alt="${item.name}"><span>${item.name}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  root.innerHTML = sceneShell(mode, content, 'trace');
  wireRound(mode, round);
  setupTrace(round);
}

function wireRound(mode, round) {
  bindTap(root.querySelector('[data-journal-shortcut]'), () => openJournal(), 'whoosh');
  root.querySelectorAll('[data-pick]').forEach((button) => {
    bindTap(button, () => chooseAnswer(round.id, button), 'tick');
  });
}

function chooseAnswer(targetId, button) {
  if (state.transitioning || (state.modeId === 'tracks' && state.phase !== 'choose')) return false;
  if (button.dataset.pick !== targetId) {
    state.misses += 1;
    button.classList.remove('is-gentle-no');
    void button.offsetWidth;
    button.classList.add('is-gentle-no');
    const live = root.querySelector('[data-live]');
    if (live) live.textContent = 'Almost. Look or listen once more.';
    playSfx('boing');
    say('wrong');
    return false;
  }
  collectDiscovery(targetId, button);
  return true;
}

function collectDiscovery(id, button) {
  if (state.transitioning) return;
  state.transitioning = true;
  state.phase = 'reward';
  state.found.add(id);
  saveProgress();
  button?.classList.add('is-correct');
  button?.setAttribute('aria-disabled', 'true');
  const glow = document.createElement('img');
  glow.className = 'found-glow';
  glow.src = config.assets.discoveryGlow;
  glow.alt = '';
  button?.prepend(glow);
  playSfx('sparkle');
  say('praise');
  flyToJournal(button, specimen(id).asset);

  const praiseDuration = voice.duration('praise') ?? 3.4;
  const rewardFloor = reducedMotion.matches ? 500 : 1050;
  const delay = Math.max(rewardFloor, Math.min(4800, praiseDuration * 1000 + 180));
  timers.after(delay, () => {
    state.round += 1;
    if (state.round >= modeById[state.modeId].rounds.length) playSfx('tada');
    renderRound();
  });
}

function flyToJournal(source, src) {
  const destination = root.querySelector('[data-journal-shortcut]');
  if (!source || !destination || reducedMotion.matches || typeof source.animate !== 'function') {
    destination?.classList.add('is-receiving');
    return;
  }
  const from = source.getBoundingClientRect();
  const to = destination.getBoundingClientRect();
  const image = document.createElement('img');
  image.className = 'collection-flight';
  image.src = src;
  image.alt = '';
  image.style.left = `${from.left + from.width / 2 - 55}px`;
  image.style.top = `${from.top + from.height / 2 - 55}px`;
  document.body.append(image);
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);
  const animation = image.animate([
    { transform: 'translate(0, 0) scale(.78) rotate(-5deg)', opacity: 0.9 },
    { transform: `translate(${dx * 0.48}px, ${dy * 0.3 - 58}px) scale(1.18) rotate(7deg)`, opacity: 1, offset: 0.48 },
    { transform: `translate(${dx}px, ${dy}px) scale(.24) rotate(2deg)`, opacity: 0.35 },
  ], { duration: timers.ms(920), easing: 'cubic-bezier(.2,.85,.2,1)' });
  animation.onfinish = () => {
    image.remove();
    destination.classList.add('is-receiving');
  };
}

async function announceRound(mode, token, announceIntro) {
  if (announceIntro) await say(mode.introKey);
  if (token !== state.renderToken || state.screen !== 'play') return;
  const round = mode.rounds[state.round];
  await say(round.promptKey);
  if (token !== state.renderToken || state.screen !== 'play') return;
  if (mode.id === 'birds') playBirdCall(round.id);
}

function setupTrace(round) {
  const canvas = root.querySelector('[data-trace]');
  const board = root.querySelector('[data-track-board]');
  if (!canvas || !board) return;
  const context = canvas.getContext('2d');
  const brush = root.querySelector('[data-trace-brush]');
  const startLabel = root.querySelector('[data-trace-start]');
  let activePointer = null;
  let checkpoint = 0;
  let last = null;

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = 'rgba(74, 111, 62, .78)';
    context.lineWidth = Math.max(10, rect.width * 0.055);
  };
  resize();
  if (typeof ResizeObserver === 'function') {
    traceObserver = new ResizeObserver(resize);
    traceObserver.observe(canvas);
  }

  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      px: event.clientX - rect.left,
      py: event.clientY - rect.top,
    };
  };
  const distance = (a, b) => Math.hypot(a.x - b[0], a.y - b[1]);
  const updateMeter = () => {
    const meter = root.querySelector('[data-trace-meter]');
    if (meter) meter.style.height = `${Math.min(100, checkpoint / round.checkpoints.length * 100)}%`;
  };
  const draw = (from, to) => {
    context.beginPath();
    context.moveTo(from.px, from.py);
    context.lineTo(to.px, to.py);
    context.stroke();
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (state.phase !== 'trace' || event.isPrimary === false) return;
    const here = point(event);
    if (distance(here, round.checkpoints[0]) > 0.19) {
      board.classList.add('show-start');
      timers.after(520, () => board.classList.remove('show-start'));
      say('trace-again');
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    activePointer = event.pointerId;
    checkpoint = 1;
    last = here;
    startLabel?.classList.add('is-hidden');
    context.clearRect(0, 0, canvas.width, canvas.height);
    updateMeter();
    if (brush) {
      brush.style.left = `${here.x * 100}%`;
      brush.style.top = `${here.y * 100}%`;
      brush.classList.add('is-active');
    }
    playSfx('tick');
  });
  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerId !== activePointer || state.phase !== 'trace') return;
    const here = point(event);
    draw(last, here);
    last = here;
    if (brush) {
      brush.style.left = `${here.x * 100}%`;
      brush.style.top = `${here.y * 100}%`;
    }
    while (checkpoint < round.checkpoints.length && distance(here, round.checkpoints[checkpoint]) < 0.17) {
      checkpoint += 1;
      updateMeter();
      playSfx('pop');
    }
    if (checkpoint >= round.checkpoints.length) finishTrace();
  });
  const finishPointer = (event) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    brush?.classList.remove('is-active');
    if (state.phase === 'trace' && checkpoint < round.checkpoints.length) {
      board.classList.add('trace-paused');
      timers.after(420, () => board.classList.remove('trace-paused'));
    }
  };
  canvas.addEventListener('pointerup', finishPointer);
  canvas.addEventListener('pointercancel', finishPointer);
  canvas.addEventListener('keydown', (event) => {
    if (state.phase !== 'trace' || !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    startLabel?.classList.add('is-hidden');
    finishTrace();
  });

  function finishTrace() {
    if (state.phase !== 'trace') return;
    state.phase = 'choose';
    activePointer = null;
    canvas.classList.add('is-complete');
    board.classList.add('is-complete');
    brush?.classList.add('is-finished');
    startLabel?.classList.add('is-hidden');
    const answers = root.querySelector('[data-track-answers]');
    answers.hidden = false;
    answers.setAttribute('aria-hidden', 'false');
    answers.querySelectorAll('button').forEach((button) => { button.disabled = false; });
    const kicker = root.querySelector('[data-answer-kicker]');
    if (kicker) kicker.textContent = 'Who walked here?';
    const prompt = root.querySelector('[data-prompt-copy]');
    if (prompt) prompt.textContent = 'Who left these tracks?';
    playSfx('sparkle');
    say('trace-ready');
  }

  canvas.completeTraceForQa = finishTrace;
}

function openJournal({ celebrationKey = null, focusMode = null } = {}) {
  beginRender('journal');
  state.modeId = focusMode;
  const allComplete = state.found.size === journalIds.length;
  const empty = state.found.size === 0;
  const heading = allComplete ? 'Official Nature Guide' : celebrationKey ? 'New discoveries!' : 'Nature Journal';
  root.innerHTML = `
    <section class="world-screen journal-screen" aria-label="Nature Journal">
      <div class="hud-slot hud-left" data-hud-back></div>
      <div class="hud-slot hud-right" data-hud-sound></div>
      <main class="journal-layout ${allComplete ? 'is-complete' : ''}">
        <div class="journal-heading">
          <span class="eyebrow">${state.found.size} of ${journalIds.length} discoveries</span>
          <h1>${heading}</h1>
        </div>
        <div class="journal-grid">
          ${journalIds.map((id) => {
            const item = specimen(id);
            const unlocked = state.found.has(id);
            return `<button type="button" class="journal-sticker ${unlocked ? 'is-found' : 'is-locked'}" data-fact="${id}" data-target="journal-${id}" ${unlocked ? '' : 'disabled'} aria-label="${unlocked ? `${item.name}. Hear its nature note.` : 'Undiscovered journal slot'}">
              <img class="slot-paper" src="${config.assets.journalSlot}" alt="">
              ${unlocked ? `<img class="slot-specimen" src="${item.asset}" alt=""><span>${item.name}</span>` : '<span class="mystery-mark">?</span>'}
            </button>`;
          }).join('')}
        </div>
        ${allComplete ? `<img class="guide-badge" src="${config.assets.badge}" alt="Local Nature Guide badge">` : ''}
        <img class="guide guide-journal" src="${config.guides[allComplete || celebrationKey ? 'celebrate' : 'journal']}" alt="Suri presents the Nature Journal">
        <button class="painted-button journal-action" type="button" data-journal-done data-target="journal-done">
          <img src="${config.assets.button}" alt=""><span>${empty ? 'Choose a trail' : 'Keep exploring'}</span>
        </button>
      </main>
      <p class="live-note" aria-live="polite" data-live></p>
    </section>`;

  mountHud({ splash: false, journal: true });
  root.querySelectorAll('[data-fact]:not(:disabled)').forEach((button) => {
    bindTap(button, () => {
      const item = specimen(button.dataset.fact);
      root.querySelector('[data-live]').textContent = item.fact;
      button.classList.add('is-speaking');
      timers.after(900, () => button.classList.remove('is-speaking'));
      say(item.factKey);
    }, 'pop');
  });
  bindTap(root.querySelector('[data-journal-done]'), () => renderSplash({ greet: false }), 'whoosh');

  if (allComplete) {
    playSfx('tada');
    say('all-complete');
  } else if (celebrationKey) {
    say(celebrationKey);
  } else {
    say(empty ? 'journal-empty' : 'journal-intro');
  }
}

function mountHud({ splash = false } = {}) {
  const left = root.querySelector(splash ? '[data-hud-home]' : '[data-hud-back]');
  const right = root.querySelector('[data-hud-sound]');
  if (left) {
    const button = hudButton(splash ? 'home' : 'back', () => {
      if (splash) window.location.href = '../../';
      else renderSplash({ greet: false });
    }, { label: splash ? 'Back to QLOBE Kids' : 'Back to the trail map' });
    button.dataset.target = splash ? 'home' : 'back';
    left.append(button);
  }
  if (right) {
    const repeat = soundDebounce(() => {
      if (state.screen === 'play' && state.modeId === 'birds' && state.lastBirdCall) playBirdCall(state.lastBirdCall);
      else say(state.lastVoiceKey || 'welcome');
    });
    const button = hudButton('sound', repeat, { label: 'Hear it again' });
    button.dataset.target = 'sound';
    right.append(button);
  }
}

function mountProgress(mode) {
  const slot = root.querySelector('[data-progress]');
  if (!slot) return;
  slot.append(progressDots(mode.rounds.length, state.round));
  slot.setAttribute('aria-label', `${state.round + 1} of ${mode.rounds.length}`);
}

function bindTap(element, action, sound = null) {
  if (!element) return () => {};
  return onTap(element, action, {
    feedback: () => {
      unlockAll([unlockBirdAudio]);
      if (sound) playSfx(sound);
    },
  });
}

function unlockBirdAudio() {
  const AudioCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtor) return;
  if (!birdContext) {
    birdContext = new AudioCtor();
    birdMaster = birdContext.createGain();
    birdMaster.gain.value = state.muted ? 0 : 0.22;
    birdMaster.connect(birdContext.destination);
  }
  if (birdContext.state !== 'running') birdContext.resume().catch(() => {});
}

function stopBirdAudio() {
  for (const node of birdNodes) {
    try { node.stop(); } catch { /* already stopped */ }
  }
  birdNodes = [];
}

function setBirdMuted(on) {
  state.muted = Boolean(on);
  if (birdMaster) birdMaster.gain.value = state.muted ? 0 : 0.22;
}

function chirp(start, duration, from, to = from, type = 'sine', gainValue = 0.42) {
  if (!birdContext || !birdMaster) return;
  const oscillator = birdContext.createOscillator();
  const gain = birdContext.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(from, start);
  oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + Math.min(0.025, duration / 4));
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain).connect(birdMaster);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.03);
  birdNodes.push(oscillator);
}

function playBirdCall(id) {
  unlockBirdAudio();
  stopBirdAudio();
  state.lastBirdCall = id;
  if (!birdContext || state.muted) return;
  const now = birdContext.currentTime + 0.035;
  if (id === 'chickadee') {
    chirp(now, 0.14, 1180, 920);
    chirp(now + 0.23, 0.09, 1730, 1520);
    chirp(now + 0.36, 0.075, 1520, 1420);
    chirp(now + 0.47, 0.075, 1490, 1390);
    chirp(now + 0.58, 0.075, 1460, 1360);
  } else if (id === 'robin') {
    chirp(now, 0.24, 760, 1120, 'sine', 0.34);
    chirp(now + 0.31, 0.22, 1060, 690, 'sine', 0.34);
    chirp(now + 0.62, 0.2, 810, 1250, 'sine', 0.31);
    chirp(now + 0.9, 0.25, 1160, 740, 'sine', 0.32);
  } else {
    for (let index = 0; index < 9; index += 1) {
      chirp(now + index * 0.055, 0.034, 185, 120, 'square', 0.18);
    }
  }
  timers.after(1350, () => { birdNodes = []; });
}

function tapTarget(id) {
  const node = root.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
  if (!node || node.matches(':disabled')) return false;
  node.click();
  return true;
}

function winRound() {
  if (state.screen !== 'play' || !state.modeId) return false;
  const round = modeById[state.modeId].rounds[state.round];
  if (!round) return false;
  if (state.modeId === 'tracks' && state.phase === 'trace') {
    root.querySelector('[data-trace]')?.completeTraceForQa?.();
  }
  const target = root.querySelector(`[data-pick="${CSS.escape(round.id)}"]`);
  return chooseAnswer(round.id, target);
}

installDebug({
  gameId: config.id,
  engine: 'custom',
  ready,
  timers,
  voice,
  sfx,
  narrator: { setMuted: setBirdMuted, stop: stopBirdAudio },
  root,
  listModes: () => config.modes.map((mode) => mode.id),
  startMode: async (id) => {
    await ready;
    return startMode(id, { announceIntro: false });
  },
  getState: () => ({
    screen: state.screen,
    mode: state.modeId,
    round: state.round,
    phase: state.phase,
    found: [...state.found],
    misses: state.misses,
    transitioning: state.transitioning,
    reducedMotion: reducedMotion.matches,
    seed: state.seed,
  }),
  tap: async (id) => tapTarget(id),
  winRound: async () => winRound(),
  home: () => renderSplash({ greet: false }),
  onSeed: (rng, seed) => {
    state.rng = rng;
    state.seed = seed;
    if (state.screen === 'play') renderRound();
  },
  openJournal: () => openJournal(),
  clearProgress: () => {
    state.found.clear();
    saveProgress();
    renderSplash({ greet: false });
    return true;
  },
  getAudioLog: () => voice.getAudioLog(),
  clearAudioLog: () => voice.clearAudioLog(),
  clipInfo: (key) => voice.clipInfo(key),
});
