import config from '../config.js';
import { createStage } from '../../../shared/js/stage/stage.js';
import { createTheater } from '../../../shared/js/stage/theater.js';
import { createPerformanceRecorder, openPerformanceStore } from '../../../shared/js/performance-recorder.js';
import { onTap } from '../../../shared/js/tap.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as speech from '../../../shared/js/speech.js';
import * as sfx from '../../../shared/js/sfx.js';

const appEl = document.querySelector('#app');
const confettiEl = document.querySelector('#confetti');
const roles = ['a', 'b'];
const names = {
  bear: 'Bear', doggy: 'Doggy', fox: 'Fox', frog: 'Frog',
  rabbit: 'Rabbit', unicorn: 'Unicorn',
  'princess-lily': 'Lily', 'princess-zoe': 'Zoe',
};
const actions = [
  ['wave', '👋', 'Wave'],
  ['jump', '⬆️', 'Jump'],
  ['talk', '💬', 'Talk'],
  ['think', '💭', 'Think'],
  ['hug', '🤗', 'Hug'],
  ['cheer', '🎉', 'Cheer'],
];
const defaultLines = {
  ...config.voice,
  ...Object.fromEntries(config.stories.flatMap((story) =>
    story.beats.map((beat) => [`story.${story.id}.${beat.id}`, beat.line]))),
};

let current = null;
let store = null;
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });

const state = {
  screen: 'loading',
  mode: null,
  storyId: null,
  cast: [],
  stageId: config.stages[0].id,
  activeRole: 'a',
  accessories: { a: null, b: null },
  phase: 'idle',
  beat: 0,
  recording: false,
  replaying: false,
  showCount: 0,
  muted: false,
  seed: 1,
  fastTimers: false,
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function unlock() {
  voice.unlock();
  speech.unlock();
  sfx.unlock();
}

function tapAll(root = document) {
  root.querySelectorAll('[data-action]').forEach((el) => {
    onTap(el, () => handleAction(el.dataset.action, el.dataset.value, el), {
      feedback: () => { unlock(); if (!state.muted) sfx.tick(); },
    });
  });
}

function header(title, back = 'splash') {
  return `<header class="screen-header">
    <button class="icon-button back-button" data-action="${back}" data-target="back" aria-label="Go back"></button>
    <h1>${esc(title)}</h1>
    <button class="icon-button sound-button" data-action="sound" data-target="sound" aria-label="Turn sound ${state.muted ? 'on' : 'off'}" style="${state.muted ? 'filter:grayscale(1);opacity:.6' : ''}"></button>
  </header>`;
}

function face(character) {
  return `../../shared/characters/${character}/anim/head-ts.png`;
}

function getStory(id = state.storyId) {
  return config.stories.find((item) => item.id === id) || config.stories[0];
}

function getStage(id = state.stageId) {
  return config.stages.find((item) => item.id === id) || config.stages[0];
}

function speak(key, text = defaultLines[key]) {
  if (state.muted || !text) return Promise.resolve();
  return voice.say(key, text);
}

async function cleanupScene() {
  if (!current) return;
  current.dragCleanup?.();
  current.recorder?.cancelPlayback();
  if (current.recordTimer) clearInterval(current.recordTimer);
  if (current.theater && !current.theater.destroyed) current.theater.destroy();
  current.stage?.destroy();
  current.urls?.forEach((url) => URL.revokeObjectURL(url));
  current = null;
  state.recording = false;
  state.replaying = false;
  voice.stop();
}

function setHtml(html) {
  appEl.innerHTML = html;
  tapAll(appEl);
}

async function renderSplash({ announce = true } = {}) {
  await cleanupScene();
  state.screen = 'splash';
  state.phase = 'idle';
  state.mode = null;
  setHtml(`<section class="screen splash with-bg">
    <div class="splash-scrim"></div>
    <a class="icon-button home-button" data-target="platform-home" href="../../" aria-label="QLOBE Kids home"></a>
    <button class="icon-button sound-button" data-action="sound" data-target="sound" aria-label="Sound"></button>
    <img class="mascot left" src="${face('bear')}" alt="" />
    <img class="mascot right" src="${face('rabbit')}" alt="" />
    <div class="splash-card">
      <div class="logo-kicker">Make your own</div>
      <h1 class="logo">Puppet Retell</h1>
      <p class="tagline">Pick two stars. Tell it your way!</p>
      <div class="splash-actions">
        <button class="mode-button" data-action="mode" data-value="guided" data-target="mode-guided"><span class="mode-emoji">📖</span><span class="mode-label">Story Starters</span></button>
        <button class="mode-button" data-action="mode" data-value="free" data-target="mode-free"><span class="mode-emoji">🎭</span><span class="mode-label">Free Show</span></button>
        <button class="mode-button" data-action="shows" data-target="my-shows"><span class="mode-emoji">📼</span><span class="mode-label">My Shows</span></button>
      </div>
    </div>
  </section>`);
  if (announce) speak('intro');
}

function renderStories() {
  state.screen = 'stories';
  const groups = [
    ['original', 'New Story Starters'],
    ['classic', 'Classic Tales'],
  ];
  setHtml(`<section class="screen">
    ${header('Pick a Story')}
    <div class="content-scroll">
      ${groups.map(([collection, label]) => `<h2 class="section-label">${label}</h2>
        <div class="card-grid">${config.stories.filter((story) => story.collection === collection).map((story) => {
          const scene = getStage(story.stage);
          return `<button class="choice-card story-card" style="background-image:url('${scene.backdrop}')" data-action="story" data-value="${story.id}" data-target="story-${story.id}">
            <span class="big-emoji">${story.emoji}</span><span class="choice-title">${esc(story.title)}</span>
          </button>`;
        }).join('')}</div>`).join('')}
    </div>
  </section>`);
  speak('pickStory');
}

function renderCast() {
  state.screen = 'cast';
  setHtml(`<section class="screen">
    ${header('Pick Two Puppet Stars', state.mode === 'guided' ? 'stories' : 'splash')}
    <div class="content-scroll">
      <div class="cast-grid">${config.cast.map((character) => {
        const pick = state.cast.indexOf(character);
        return `<button class="choice-card cast-card ${pick >= 0 ? 'selected' : ''}" data-action="cast" data-value="${character}" data-target="cast-${character}" aria-pressed="${pick >= 0}">
          ${pick >= 0 ? `<span class="pick-number">${pick + 1}</span>` : ''}
          <img src="${face(character)}" alt="" /><span class="choice-title">${esc(names[character] || character)}</span>
        </button>`;
      }).join('')}</div>
    </div>
    <div class="continue-bar"><span>${state.cast.length}/2 stars</span><button class="primary-button" ${state.cast.length !== 2 ? 'disabled' : ''} data-action="setup" data-target="cast-next">Dress the Cast →</button></div>
  </section>`);
}

function renderSetup() {
  state.screen = 'setup';
  const stageCards = config.stages.map((stage) =>
    `<button class="choice-card stage-card ${stage.id === state.stageId ? 'selected' : ''}" style="background-image:url('${stage.backdrop}')" data-action="stage" data-value="${stage.id}" data-target="stage-${stage.id}"><span class="choice-title">${stage.emoji} ${esc(stage.title)}</span></button>`).join('');
  const puppetCards = roles.map((role, index) => {
    const character = state.cast[index];
    return `<button class="dress-puppet ${state.activeRole === role ? 'active' : ''}" data-action="role" data-value="${role}" data-target="dress-${role}">
      <img src="${face(character)}" alt="" /><strong>${esc(names[character] || character)}</strong>
      <small>${state.accessories[role] ? ` · ${config.accessories.find((a) => a.id === state.accessories[role])?.emoji}` : ''}</small>
    </button>`;
  }).join('');
  const accessories = config.accessories.map((item) =>
    `<button class="accessory ${state.accessories[state.activeRole] === item.id ? 'selected' : ''}" data-action="accessory" data-value="${item.id}" data-target="prop-${item.id}" aria-label="${esc(item.title)}">${item.emoji}</button>`).join('');
  setHtml(`<section class="screen">
    ${header('Build Your Show', 'cast')}
    <div class="setup-layout">
      <div class="setup-panel"><h2>1. Pick a Stage</h2><div class="stage-grid">${stageCards}</div></div>
      <div class="setup-panel"><h2>2. Dress a Puppet</h2><div class="dress-cast">${puppetCards}</div><div class="accessory-grid"><button class="accessory ${!state.accessories[state.activeRole] ? 'selected' : ''}" data-action="accessory" data-value="" data-target="prop-none" aria-label="No prop">✋</button>${accessories}</div></div>
    </div>
    <div class="continue-bar"><span>Tap a puppet, then a prop</span><button class="primary-button" data-action="perform" data-target="stage-ready">Open the Curtain →</button></div>
  </section>`);
  speak('pickStage');
}

function performanceHtml({ replay = false } = {}) {
  const story = state.mode === 'guided' ? getStory() : null;
  const beat = story?.beats[state.beat];
  const loading = state.phase === 'loading';
  return `<section class="screen performance-screen">
    <div class="stage-host" id="stage-host"></div>
    <div class="performance-hud">
      <button class="icon-button back-button" data-action="leave-performance" data-target="back" aria-label="Leave the stage"></button>
      <div class="role-picker" aria-label="Puppet for the next action">
        ${roles.map((role, index) => `<button class="role-button ${state.activeRole === role ? 'active' : ''}" data-action="active-role" data-value="${role}" data-target="active-${role}" aria-label="Choose ${esc(names[state.cast[index]] || state.cast[index])}"><img src="${face(state.cast[index])}" alt="" /></button>`).join('')}
      </div>
      <div class="record-status ${state.recording ? 'live' : ''}" id="record-status">${state.recording ? '<span class="record-dot"></span><span id="record-time">0:00</span>' : loading ? 'Opening curtain…' : replay ? '▶ Replaying' : 'Ready!'}</div>
      ${beat ? `<div class="beat-card" id="beat-card"><span class="beat-emoji">${beat.emoji}</span><span>${esc(beat.line)}</span>${state.recording && state.beat < story.beats.length - 1 ? '<button class="next-beat" data-action="next-beat" data-target="next-beat" aria-label="Next story part">→</button>' : ''}</div>` : ''}
      <div class="privacy-pill">🔒 Stays on this device</div>
      <div class="action-tray" id="action-tray">
        ${loading ? '<span class="curtain-loader" aria-label="Loading the stage">🎭</span>' : state.recording ? actions.map(([id, emoji, label]) => `<button class="action-button" data-action="puppet-action" data-value="${id}" data-target="action-${id}" aria-label="${label}">${emoji}</button>`).join('') + '<button class="done-button" data-action="stop-recording" data-target="record-stop">Save<br>Show</button>' : replay ? '<button class="done-button" data-action="stop-replay" data-target="replay-stop">Stop</button>' : '<button class="record-button" data-action="start-recording" data-target="record-start" aria-label="Start recording">●</button>'}
      </div>
    </div>
  </section>`;
}

async function mountPerformance(initial = null, { replay = false } = {}) {
  await cleanupScene();
  if (initial) {
    state.mode = initial.mode || 'free';
    state.storyId = initial.storyId || null;
    state.cast = initial.cast?.slice(0, 2) || config.cast.slice(0, 2);
    state.stageId = initial.stageId || config.stages[0].id;
    state.accessories = { a: initial.accessories?.a || null, b: initial.accessories?.b || null };
  }
  state.screen = 'performance';
  state.phase = 'loading';
  state.replaying = replay;
  state.beat = 0;
  setHtml(performanceHtml({ replay }));
  const stageDef = getStage();
  const stage = await createStage(document.querySelector('#stage-host'));
  const theater = await createTheater(stage, {
    backdrop: stageDef.backdrop,
    floorY: stageDef.floorY,
    worldScale: 1.2,
  });
  stage.root.addChild(theater.view);
  const actors = {
    a: await theater.addActor('a', state.cast[0], { x: .32, flip: false, scale: .68, widthShare: .4 }),
    b: await theater.addActor('b', state.cast[1], { x: .68, flip: true, scale: .68, widthShare: .4 }),
  };
  for (const role of roles) {
    const accessory = config.accessories.find((item) => item.id === state.accessories[role]);
    if (accessory) {
      await theater.addProp(`costume-${role}`, {
        ...accessory,
        holder: role,
        offset: accessory.offset,
      });
    }
  }
  const recorder = createPerformanceRecorder({
    gameId: config.id,
    maxDurationMs: 90_000,
    onLimit: () => finishRecording(),
  });
  current = { stage, theater, actors, recorder, urls: [], recordTimer: 0, dragCleanup: bindDragging(stage, theater, actors) };
  state.phase = replay ? 'replay' : 'ready';
  refreshPerformanceHud();
  if (!replay) speak('ready');
}

function bindDragging(stage, theater, actors) {
  const canvas = stage.app.canvas;
  let dragging = null;
  let lastRecorded = 0;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return Math.max(.1, Math.min(.9, (event.clientX - rect.left) / rect.width));
  };
  const down = (event) => {
    if (!state.recording || state.replaying) return;
    const x = point(event);
    dragging = Math.abs(x - actors.a.fx) <= Math.abs(x - actors.b.fx) ? 'a' : 'b';
    setActiveRole(dragging);
    canvas.setPointerCapture?.(event.pointerId);
  };
  const move = (event) => {
    if (!dragging) return;
    const x = point(event);
    const actor = actors[dragging];
    actor.fx = x;
    theater.placeActor(actor);
    const now = performance.now();
    if (now - lastRecorded > 70) {
      current?.recorder.record('move', { role: dragging, x: Math.round(x * 1000) / 1000 });
      lastRecorded = now;
    }
  };
  const up = () => { dragging = null; };
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  return () => {
    canvas.removeEventListener('pointerdown', down);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', up);
    canvas.removeEventListener('pointercancel', up);
  };
}

function initialShowState() {
  return {
    mode: state.mode,
    storyId: state.storyId,
    cast: [...state.cast],
    stageId: state.stageId,
    accessories: { ...state.accessories },
  };
}

async function startRecording() {
  if (!current || state.recording) return;
  const mic = await current.recorder.requestMicrophone();
  await speak(mic ? 'micOkay' : 'micNo');
  await speak('recording');
  current.recorder.start(initialShowState(), {
    title: state.mode === 'guided' ? getStory().title : 'Free Show',
    storyEmoji: state.mode === 'guided' ? getStory().emoji : '🎭',
    microphone: mic,
  });
  state.recording = true;
  state.phase = 'recording';
  state.beat = 0;
  refreshPerformanceHud();
  const started = performance.now();
  current.recordTimer = setInterval(() => {
    const seconds = Math.floor((performance.now() - started) / 1000);
    const clock = document.querySelector('#record-time');
    if (clock) clock.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  }, 250);
  if (state.mode === 'guided') {
    const beat = getStory().beats[0];
    current.recorder.record('beat', { index: 0 });
    speak(`story.${getStory().id}.${beat.id}`, beat.line);
  }
}

function refreshPerformanceHud() {
  const hud = document.querySelector('.performance-hud');
  if (!hud) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = performanceHtml({ replay: state.replaying });
  hud.replaceWith(wrapper.firstElementChild.querySelector('.performance-hud'));
  tapAll(document.querySelector('.performance-hud'));
}

async function nextBeat() {
  const story = getStory();
  if (state.beat >= story.beats.length - 1) return;
  state.beat += 1;
  current.recorder.record('beat', { index: state.beat });
  refreshPerformanceHud();
  await speak('nextBeat');
  const beat = story.beats[state.beat];
  speak(`story.${story.id}.${beat.id}`, beat.line);
}

function applyPuppetAction(role, action, { record = true } = {}) {
  if (!current?.actors?.[role] || !current.theater) return;
  const actor = current.actors[role];
  if (record) current.recorder.record('action', { role, action });
  if (action === 'hug') {
    current.actors.a.fx = .45;
    current.actors.b.fx = .55;
    current.theater.placeActor(current.actors.a);
    current.theater.placeActor(current.actors.b);
    current.actors.a.puppet.playClip('hug');
    current.actors.b.puppet.playClip('hug');
  } else {
    actor.puppet.playClip(action);
  }
  if (action === 'cheer') {
    current.theater.playFx('burst', role);
    if (!state.muted) sfx.sparkle();
  } else if (!state.muted) {
    action === 'jump' ? sfx.boing() : sfx.pop();
  }
  const delay = state.fastTimers ? 60 : 1050;
  setTimeout(() => {
    if (!current?.actors) return;
    if (action === 'hug') roles.forEach((item) => current.actors[item]?.puppet.playClip('idle'));
    else current.actors[role]?.puppet.playClip('idle');
  }, delay);
}

async function thumbnailBlob() {
  const renderer = current?.stage?.app?.renderer;
  if (!renderer || !current?.theater?.view) return null;
  return new Promise((resolve) => {
    Promise.resolve(renderer.extract.canvas({ target: current.theater.view }))
      .then((canvas) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', .72))
      .catch(() => resolve(null));
  });
}

function setActiveRole(role) {
  if (!roles.includes(role)) return;
  state.activeRole = role;
  document.querySelectorAll('.role-button').forEach((button) => {
    button.classList.toggle('active', button.dataset.value === role);
  });
}

async function finishRecording() {
  if (!current?.recorder?.isRecording()) return;
  state.recording = false;
  state.phase = 'saving';
  if (current.recordTimer) clearInterval(current.recordTimer);
  const show = await current.recorder.stop({
    finalBeat: state.beat,
    title: state.mode === 'guided' ? getStory().title : 'Free Show',
  });
  if (!show) return;
  show.thumbnailBlob = await thumbnailBlob();
  try {
    await store.save(show);
    state.showCount = (await store.list()).length;
    state.phase = 'saved';
    if (!state.muted) sfx.tada();
    burstConfetti();
    showSaved(show.id);
    speak('saved');
  } catch (error) {
    state.phase = 'ready';
    refreshPerformanceHud();
    if (error.code === 'SHELF_FULL') {
      showModal('Show Shelf Full', config.voice.shelfFull, [
        ['My Shows', 'shows', '', 'secondary-button'],
        ['Back to Stage', 'close-modal', '', 'primary-button'],
      ]);
      speak('shelfFull');
    } else {
      showModal('Could Not Save', 'Please try your show one more time.', [
        ['Try Again', 'close-modal', '', 'primary-button'],
      ]);
    }
  }
}

function showSaved(showId) {
  appEl.insertAdjacentHTML('beforeend', `<div class="saved-overlay">
    <div class="celebration-card">
      <div style="font-size:80px">🌟🎭🌟</div><h2>Show Saved!</h2>
      <p>Your voice and puppet moves stay right here on this device.</p>
      <div class="celebration-actions">
        <button class="secondary-button" data-action="play-show" data-value="${showId}" data-target="replay-saved">▶ Replay</button>
        <button class="primary-button" data-action="again" data-target="make-another">Make Another</button>
        <button class="secondary-button" data-action="shows" data-target="saved-shows">My Shows</button>
      </div>
    </div>
  </div>`);
  tapAll(appEl.querySelector('.saved-overlay'));
}

async function renderShows() {
  await cleanupScene();
  state.screen = 'shows';
  state.phase = 'shelf';
  const shows = await store.list();
  state.showCount = shows.length;
  const urls = [];
  const cards = shows.map((show) => {
    const url = show.thumbnailBlob instanceof Blob && show.thumbnailBlob.size
      ? URL.createObjectURL(show.thumbnailBlob) : '';
    if (url) urls.push(url);
    const date = new Date(show.createdAt);
    const length = Math.max(1, Math.round((show.durationMs || 0) / 1000));
    return `<article class="choice-card show-card" data-target="show-${show.id}">
      <button class="show-thumb" style="${url ? `background-image:url('${url}')` : ''}" data-action="play-show" data-value="${show.id}" aria-label="Play ${esc(show.metadata?.title || 'puppet show')}">${url ? '' : esc(show.metadata?.storyEmoji || '🎭')}</button>
      <div class="show-meta"><span>${esc(show.metadata?.title || 'Puppet Show')}<br><small>${date.toLocaleDateString()} · ${length}s</small></span><button class="show-delete" data-action="delete-show" data-value="${show.id}" aria-label="Delete show">🗑️</button></div>
    </article>`;
  }).join('');
  setHtml(`<section class="screen">
    ${header('My Shows')}
    <div class="content-scroll">${shows.length ? `<p class="section-label">${shows.length} of ${store.maxShows} saved on this device</p><div class="shows-grid">${cards}</div>` : '<div class="empty-shelf"><div class="big">🎭</div><h2>Your stage is waiting!</h2><p>Make a show and it will appear here.</p><button class="primary-button" data-action="splash">Make a Show</button></div>'}</div>
  </section>`);
  current = { urls };
  speak('shows');
}

async function playShow(id) {
  const show = await store.get(id);
  if (!show) return;
  await mountPerformance(show.initialState, { replay: true });
  state.phase = 'replay';
  state.replaying = true;
  current.recorder.play(show, {
    applyEvent: (event) => {
      if (event.type === 'move') {
        const actor = current?.actors?.[event.payload.role];
        if (actor) {
          actor.fx = Math.max(.1, Math.min(.9, Number(event.payload.x) || .5));
          current.theater.placeActor(actor);
        }
      } else if (event.type === 'action') {
        applyPuppetAction(event.payload.role, event.payload.action, { record: false });
      } else if (event.type === 'beat' && state.mode === 'guided') {
        state.beat = Number(event.payload.index) || 0;
        refreshPerformanceHud();
      }
    },
    onEnd: () => {
      state.replaying = false;
      state.phase = 'replay-done';
      showModal('The End!', 'What a wonderful puppet story!', [
        ['Replay', 'play-show', id, 'secondary-button'],
        ['My Shows', 'shows', '', 'primary-button'],
      ]);
      if (!state.muted) sfx.tada();
      speak('cheer');
    },
  });
}

function showModal(title, message, buttons) {
  document.querySelector('.modal')?.remove();
  appEl.insertAdjacentHTML('beforeend', `<div class="modal"><div class="modal-card"><h2>${esc(title)}</h2><p>${esc(message)}</p><div class="celebration-actions">
    ${buttons.map(([label, action, value, cls]) => `<button class="${cls}" data-action="${action}" data-value="${esc(value)}">${esc(label)}</button>`).join('')}
  </div></div></div>`);
  tapAll(appEl.querySelector('.modal'));
}

function confirmDelete(id) {
  showModal('Erase This Show?', 'This cannot be undone.', [
    ['Keep It', 'close-modal', '', 'secondary-button'],
    ['Erase', 'confirm-delete', id, 'danger-button'],
  ]);
}

function burstConfetti() {
  confettiEl.innerHTML = '';
  const colors = ['#f7c94b', '#ef6148', '#17b8bd', '#8f70d7', '#fff'];
  for (let i = 0; i < 48; i += 1) {
    const bit = document.createElement('i');
    bit.className = 'confetti-bit';
    bit.style.left = `${Math.random() * 100}%`;
    bit.style.background = colors[i % colors.length];
    bit.style.animationDelay = `${Math.random() * .6}s`;
    bit.style.setProperty('--drift', `${Math.round((Math.random() - .5) * 240)}px`);
    confettiEl.appendChild(bit);
  }
  setTimeout(() => { confettiEl.innerHTML = ''; }, 3400);
}

async function handleAction(action, value, el) {
  if (action === 'sound') {
    state.muted = !state.muted;
    if (state.muted) voice.stop();
    el.style.filter = state.muted ? 'grayscale(1)' : '';
    el.style.opacity = state.muted ? '.6' : '';
    return;
  }
  if (action === 'splash') return renderSplash({ announce: false });
  if (action === 'mode') {
    state.mode = value;
    state.cast = [];
    state.accessories = { a: null, b: null };
    if (value === 'guided') {
      renderStories();
      speak('guided');
    } else {
      state.storyId = null;
      renderCast();
      speak('free');
    }
    return;
  }
  if (action === 'stories') return renderStories();
  if (action === 'story') {
    state.storyId = value;
    state.stageId = getStory(value).stage;
    state.cast = [];
    renderCast();
    speak('pickCast');
    return;
  }
  if (action === 'cast') {
    const index = state.cast.indexOf(value);
    if (index >= 0) state.cast.splice(index, 1);
    else if (state.cast.length < 2) state.cast.push(value);
    else state.cast[1] = value;
    renderCast();
    return;
  }
  if (action === 'setup' && state.cast.length === 2) return renderSetup();
  if (action === 'stage') { state.stageId = value; renderSetup(); return; }
  if (action === 'role') { state.activeRole = value; renderSetup(); return; }
  if (action === 'accessory') {
    const other = state.activeRole === 'a' ? 'b' : 'a';
    state.accessories[state.activeRole] = value || null;
    if (value && state.accessories[other] === value) state.accessories[other] = null;
    renderSetup();
    return;
  }
  if (action === 'perform') return mountPerformance();
  if (action === 'active-role') { setActiveRole(value); return; }
  if (action === 'leave-performance') {
    if (state.recording) {
      showModal('Leave the Stage?', 'This show has not been saved yet.', [
        ['Keep Playing', 'close-modal', '', 'secondary-button'],
        ['Leave', 'discard-show', '', 'danger-button'],
      ]);
    } else return renderSplash({ announce: false });
    return;
  }
  if (action === 'discard-show') {
    await current?.recorder?.destroy();
    return renderSplash({ announce: false });
  }
  if (action === 'start-recording') return startRecording();
  if (action === 'stop-recording') return finishRecording();
  if (action === 'next-beat') return nextBeat();
  if (action === 'puppet-action') {
    applyPuppetAction(state.activeRole, value);
    const pressed = document.querySelector(`[data-target="action-${value}"]`);
    pressed?.classList.add('active');
    setTimeout(() => pressed?.classList.remove('active'), 300);
    return;
  }
  if (action === 'again') {
    await cleanupScene();
    state.cast = [];
    state.accessories = { a: null, b: null };
    return state.mode === 'guided' ? renderStories() : renderCast();
  }
  if (action === 'shows') return renderShows();
  if (action === 'play-show') {
    document.querySelector('.modal')?.remove();
    return playShow(value);
  }
  if (action === 'stop-replay') {
    current?.recorder?.cancelPlayback();
    return renderShows();
  }
  if (action === 'delete-show') return confirmDelete(value);
  if (action === 'close-modal') { document.querySelector('.modal')?.remove(); return; }
  if (action === 'confirm-delete') {
    await store.remove(value);
    speak('deleted');
    return renderShows();
  }
}

async function init() {
  await Promise.all([
    voice.init('./assets/audio/manifest.json', './data/lines.json', defaultLines),
    openPerformanceStore(config.id).then((result) => { store = result; }),
  ]);
  state.showCount = (await store.list()).length;
  await renderSplash({ announce: false });
  readyResolve();
}

window.addEventListener('pagehide', () => {
  current?.recorder?.destroy();
  voice.stop();
  speech.stop();
});

window.QLOBE_DEBUG = {
  version: 1,
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode: async (id) => {
    unlock();
    await handleAction('mode', id === 'free' ? 'free' : 'guided');
  },
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    phase: state.phase,
    storyId: state.storyId,
    cast: [...state.cast],
    stageId: state.stageId,
    recording: state.recording,
    replaying: state.replaying,
    showCount: state.showCount,
    round: state.mode === 'guided' ? state.beat + 1 : 1,
    roundsTotal: state.mode === 'guided' ? 3 : 1,
    awaitingInput: !['saving'].includes(state.phase),
  }),
  getTargets: () => [...document.querySelectorAll('[data-target]')].map((el) => {
    const rect = el.getBoundingClientRect();
    return { id: el.dataset.target, x: rect.x, y: rect.y, width: rect.width, height: rect.height, disabled: !!el.disabled };
  }),
  tap: async (id) => {
    const el = document.querySelector(`[data-target="${CSS.escape(id)}"]`);
    if (!el) throw new Error(`No target: ${id}`);
    el.click();
    await new Promise((resolve) => setTimeout(resolve, 20));
  },
  winRound: async () => {
    if (state.screen === 'stories') return handleAction('story', config.stories[0].id);
    if (state.screen === 'cast') {
      state.cast = config.cast.slice(0, 2);
      renderCast();
      return;
    }
    if (state.screen === 'setup') return mountPerformance();
    if (state.screen === 'performance' && state.recording) return finishRecording();
    if (state.screen === 'performance') return startRecording();
  },
  mute: (value = true) => { state.muted = !!value; if (value) voice.stop(); },
  seed: (value) => { state.seed = Number(value) || 1; },
  extras: {
    fastTimers: (value = true) => { state.fastTimers = !!value; },
    finishRecording,
  },
};

init().catch((error) => {
  console.error(error);
  setHtml('<section class="screen"><div class="empty-shelf"><div class="big">🎭</div><h1>The puppets need a quick rest.</h1><p>Reload the page to open the curtain.</p></div></section>');
  readyResolve();
});
