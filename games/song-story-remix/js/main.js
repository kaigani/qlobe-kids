import config from '../config.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { burstConfetti, tada } from '../../../shared/js/celebrate.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { escapeHtml } from '../../../shared/js/dom.js';
import { hudButton } from '../../../shared/js/hud.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createScreens } from '../../../shared/js/screens.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createSongEngine, lineIndexAt } from './song-engine.js';
import { createVideoRecorder } from './show-media.js';
import { createReplayUrl, createShowStore, serializableShow } from './show-store.js';

const LINES = {
  welcome: 'Welcome to Song Story Remix! Pick a song and make it yours.',
  'choose-song': 'Pick a song book.',
  remix: 'Tap a picture to change the story.',
  'choose-singer': 'Now pick who will lead your song.',
  ready: 'Ready? Listen once, or record your own show.',
  'camera-choice': 'Camera and microphone are optional. You can sing without them.',
  recording: 'Sing it your way!',
  saved: 'Your remix is saved on this device.',
  'media-fallback': 'No camera? No problem. The show goes on!',
  'library-empty': 'Your remixes will appear here.',
  replay: 'Here comes your remix!',
  nudge: 'Tap a picture and hear the story change.',
  'one-more': 'Make another remix!',
  deleted: 'That remix is gone.',
};

const root = document.querySelector('#game');
const timers = createTimers();
const songEngine = createSongEngine();
const showStore = createShowStore({ maxShows: config.maxSavedShows });
const voice = createNarrator();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  songId: config.songs[0].id,
  choiceId: config.songs[0].choices[0].id,
  singerId: config.singers[0].id,
  phase: 'idle',
  recording: false,
  rehearsal: false,
  muted: false,
  permission: 'idle',
  mediaMode: 'real',
  elapsed: 0,
  lineIndex: 0,
  shows: [],
  currentShow: null,
  storagePersistent: false,
};

let activeRecorder = null;
let performanceFrame = 0;
let performanceStartedAt = 0;
let performanceFinishing = false;
let performanceRunId = 0;
let replay = null;
let confettiCancel = null;

const songById = (id = state.songId) => config.songs.find((song) => song.id === id) || config.songs[0];
const choiceById = (song = songById(), id = state.choiceId) => song.choices.find((choice) => choice.id === id) || song.choices[0];
const singerById = (id = state.singerId) => config.singers.find((singer) => singer.id === id) || config.singers[0];

function allArtUrls() {
  return [
    ...Object.values(config.assets.backgrounds),
    config.assets.title,
    config.assets.cameraFrame,
    ...Object.values(config.assets.controls),
    ...config.singers.map((singer) => singer.art),
    ...config.songs.flatMap((song) => [song.card, ...song.choices.map((choice) => choice.token)]),
  ];
}

function worldBackground(src, alt = '') {
  return `<img class="world-background" src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" draggable="false" />`;
}

function actionButton({ action, target = action, art, label, value = '', className = '' }) {
  return `<button class="art-action ${className}" data-action="${escapeHtml(action)}" data-target="${escapeHtml(target)}" data-value="${escapeHtml(value)}" aria-label="${escapeHtml(label)}">
    <img src="${escapeHtml(art)}" alt="" draggable="false" />
    <span>${escapeHtml(label)}</span>
  </button>`;
}

function bandMarkup(selectedId = state.singerId, className = '') {
  return `<div class="concert-band ${className}" aria-label="Kawaii song band">
    ${config.singers.map((singer, index) => `<div class="band-member ${singer.id === selectedId ? 'is-lead' : ''}" style="--band-index:${index}">
      <img src="${escapeHtml(singer.art)}" alt="${escapeHtml(singer.label)}" draggable="false" />
    </div>`).join('')}
  </div>`;
}

root.innerHTML = `
  <section id="screen-splash" class="qk-screen screen splash-screen" aria-label="Pick a song">
    ${worldBackground(config.assets.backgrounds.select, 'A plush purple song theater')}
    <img class="title-lockup" src="${escapeHtml(config.assets.title)}" alt="Song Story Remix" draggable="false" />
    <p class="screen-callout">Pick a song</p>
    <div class="song-grid">
      ${config.songs.map((song) => `<button class="song-card" data-action="song" data-value="${escapeHtml(song.id)}" data-target="song-${escapeHtml(song.id)}" aria-label="${escapeHtml(song.title)}">
        <img src="${escapeHtml(song.card)}" alt="" draggable="false" />
        <span>${escapeHtml(song.title)}</span>
      </button>`).join('')}
    </div>
    <div class="splash-band" aria-hidden="true">${bandMarkup(state.singerId, 'mini-band')}</div>
    <div class="splash-library-slot">
      ${actionButton({ action: 'library', target: 'library-open', art: config.assets.controls.library, label: 'My remixes', className: 'library-action' })}
      <span id="shelf-count" class="shelf-count" aria-live="polite"></span>
    </div>
  </section>

  <section id="screen-remix" class="qk-screen screen remix-screen" aria-label="Remix the story" hidden>
    ${worldBackground(config.assets.backgrounds.remix, 'A plush purple story remix book')}
    <div id="remix-content" class="remix-content"></div>
  </section>

  <section id="screen-perform" class="qk-screen screen perform-screen" aria-label="Song performance" hidden>
    ${worldBackground(config.assets.backgrounds.concert, 'A Kawaii concert stage')}
    <div id="live-lyric" class="live-lyric" aria-live="polite"></div>
    <img id="live-token" class="live-token" alt="" draggable="false" />
    <div id="performance-band"></div>
    <div id="camera-shell" class="camera-shell" hidden>
      <video id="camera-preview" class="camera-preview" muted playsinline autoplay poster="${escapeHtml(config.assets.cameraPoster)}"></video>
      <img class="camera-frame" src="${escapeHtml(config.assets.cameraFrame)}" alt="" draggable="false" />
      <div id="voice-meter" class="voice-meter" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    </div>
    <div class="performance-status" aria-live="polite">
      <span id="record-dot" class="record-dot" hidden></span>
      <span id="performance-label">Rehearsal</span>
      <span id="performance-time">0:00</span>
    </div>
    <div class="song-progress" aria-hidden="true"><i id="song-progress-fill"></i></div>
    <div id="performance-actions" class="performance-actions"></div>
  </section>

  <section id="screen-final" class="qk-screen screen final-screen" aria-label="Your remix" hidden>
    ${worldBackground(config.assets.backgrounds.concert, 'A Kawaii concert stage')}
    <div id="final-content" class="final-content"></div>
  </section>

  <section id="screen-library" class="qk-screen screen library-screen" aria-label="My remixes" hidden>
    ${worldBackground(config.assets.backgrounds.select, 'A plush purple song theater')}
    <div id="library-content" class="library-content"></div>
  </section>

  <div id="permission-sheet" class="permission-sheet" role="dialog" aria-modal="true" aria-label="Choose how to perform" hidden>
    <div class="permission-card">
      <img src="${escapeHtml(config.assets.controls.record)}" alt="" />
      <h2>Make your show</h2>
      <p>Camera + microphone are optional and stay on this device.</p>
      <div class="permission-actions">
        ${actionButton({ action: 'record-camera', target: 'record-camera', art: config.assets.controls.record, label: 'Camera show' })}
        ${actionButton({ action: 'record-stage', target: 'record-stage', art: config.assets.controls.play, label: 'Stage-only show' })}
      </div>
      <button class="permission-cancel" data-action="permission-cancel" data-target="permission-cancel">Not yet</button>
    </div>
  </div>
`;

const screens = createScreens({
  screens: {
    splash: document.querySelector('#screen-splash'),
    remix: document.querySelector('#screen-remix'),
    perform: document.querySelector('#screen-perform'),
    final: document.querySelector('#screen-final'),
    library: document.querySelector('#screen-library'),
  },
  initial: 'splash',
  voice,
});

const soundButtons = [];
function addHud(screenName, kind, location, action, label) {
  const button = hudButton(kind, action, { label });
  button.classList.add(location);
  screens.el(screenName).append(button);
  if (kind === 'sound') soundButtons.push(button);
  return button;
}

addHud('splash', 'home', 'qk-hud-top-left', () => {
  stopEverything();
  window.location.href = '../../';
}, 'Back to QLOBE Kids');
addHud('splash', 'sound', 'qk-hud-bottom-left', toggleMuted, 'Turn sound off');
for (const name of ['remix', 'perform', 'final', 'library']) {
  addHud(name, 'back', 'qk-hud-top-left', goSplash, 'Back to song selection');
  addHud(name, 'sound', 'qk-hud-bottom-left', toggleMuted, 'Turn sound off');
}

function say(key) {
  return voice.say(key, LINES[key] || key);
}

function toggleMuted() {
  state.muted = !state.muted;
  voice.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  songEngine.setMuted(state.muted);
  sfx.setMuted(state.muted);
  document.querySelectorAll('video').forEach((video) => {
    if (video.id !== 'camera-preview') video.muted = state.muted;
  });
  soundButtons.forEach((button) => {
    button.classList.toggle('is-muted', state.muted);
    button.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Turn sound off');
  });
}

function highlightedLyric(line, choice) {
  const safe = escapeHtml(line);
  const word = choice.label;
  const expression = new RegExp(`(${word})`, 'ig');
  return safe.replace(expression, '<mark>$1</mark>');
}

function renderRemix() {
  const song = songById();
  const choice = choiceById(song);
  const host = document.querySelector('#remix-content');
  host.innerHTML = `
    <div class="remix-heading">
      <span>${escapeHtml(song.title)}</span>
      <img src="${escapeHtml(choice.token)}" alt="${escapeHtml(choice.label)}" />
    </div>
    <div class="lyric-book" data-choice="${escapeHtml(choice.id)}">
      ${choice.lyrics.map((line, index) => `<p class="lyric-line" data-line="${index}">${highlightedLyric(line, choice)}</p>`).join('')}
    </div>
    <div class="choice-row" aria-label="Story choices">
      ${song.choices.map((item) => `<button class="choice-token ${item.id === choice.id ? 'is-selected' : ''}" data-action="choice" data-target="choice-${escapeHtml(item.id)}" data-value="${escapeHtml(item.id)}" aria-label="Put ${escapeHtml(item.label)} in the song" aria-pressed="${item.id === choice.id}">
        <img src="${escapeHtml(item.token)}" alt="" draggable="false" />
        <span>${escapeHtml(item.label)}</span>
      </button>`).join('')}
    </div>
    <div class="singer-picker" aria-label="Pick a bandleader">
      <p>Pick a singer</p>
      <div class="singer-row">
        ${config.singers.map((singer) => `<button class="singer-token ${singer.id === state.singerId ? 'is-selected' : ''}" data-action="singer" data-target="singer-${escapeHtml(singer.id)}" data-value="${escapeHtml(singer.id)}" aria-label="${escapeHtml(singer.label)} leads the song" aria-pressed="${singer.id === state.singerId}">
          <img src="${escapeHtml(singer.art)}" alt="" draggable="false" />
          <span>${escapeHtml(singer.label)}</span>
        </button>`).join('')}
      </div>
    </div>
    <div class="remix-actions">
      ${actionButton({ action: 'rehearse', target: 'rehearse', art: config.assets.controls.play, label: 'Hear my remix' })}
      ${actionButton({ action: 'record', target: 'record', art: config.assets.controls.record, label: 'Record my show' })}
    </div>
  `;
  wireActions(host);
}

function chooseSong(id) {
  const song = songById(id);
  state.songId = song.id;
  state.choiceId = song.choices[0].id;
  state.phase = 'remix';
  stopReplay();
  renderRemix();
  screens.show('remix');
  remixNudger.arm();
  say('remix');
}

function chooseChoice(id) {
  const song = songById();
  if (!song.choices.some((choice) => choice.id === id)) return;
  state.choiceId = id;
  songEngine.accent(song.instrument);
  remixNudger.poke();
  renderRemix();
  document.querySelector('.lyric-book')?.classList.add('just-remixed');
}

function chooseSinger(id) {
  if (!config.singers.some((singer) => singer.id === id)) return;
  state.singerId = id;
  songEngine.accent(songById().instrument);
  remixNudger.poke();
  renderRemix();
  document.querySelector(`[data-target="singer-${CSS.escape(id)}"]`)?.classList.add('just-picked');
}

function openPermissionSheet() {
  const sheet = document.querySelector('#permission-sheet');
  sheet.hidden = false;
  sheet.querySelector('[data-target="record-camera"]')?.focus({ preventScroll: true });
  say('camera-choice');
}

function closePermissionSheet() {
  document.querySelector('#permission-sheet').hidden = true;
}

function renderPerformance({ camera = false, record = false } = {}) {
  const song = songById();
  const choice = choiceById(song);
  screens.el('perform').classList.toggle('with-camera', camera);
  document.querySelector('#performance-band').innerHTML = bandMarkup(state.singerId, record ? 'is-recording' : 'is-rehearsing');
  document.querySelector('#live-token').src = choice.token;
  document.querySelector('#live-token').alt = choice.label;
  document.querySelector('#camera-shell').hidden = !camera;
  document.querySelector('#record-dot').hidden = !record;
  document.querySelector('#performance-label').textContent = record ? (camera ? 'Opening camera…' : 'Stage show') : 'Rehearsal';
  document.querySelector('#performance-time').textContent = '0:00';
  document.querySelector('#song-progress-fill').style.width = '0%';
  document.querySelector('#performance-actions').innerHTML = actionButton({
    action: 'stop-performance',
    target: 'performance-stop',
    art: config.assets.controls.stop,
    label: record ? 'Finish show' : 'Stop rehearsal',
    className: 'stop-action',
  });
  state.lineIndex = 0;
  state.elapsed = 0;
  updateLiveLyric();
  wireActions(document.querySelector('#performance-actions'));
}

function updateLiveLyric() {
  const choice = choiceById();
  const line = choice.lyrics[state.lineIndex] || choice.lyrics[0];
  const cue = document.querySelector('#live-lyric');
  cue.innerHTML = highlightedLyric(line, choice);
  cue.dataset.line = String(state.lineIndex);
  document.querySelectorAll('#performance-band .band-member').forEach((member) => {
    member.classList.toggle('on-beat', state.lineIndex % 2 === Number(member.style.getPropertyValue('--band-index')) % 2);
  });
}

function updatePerformanceFrame(now) {
  if (!performanceStartedAt) return;
  const duration = config.performanceDuration;
  state.elapsed = Math.max(0, Math.min(duration, (now - performanceStartedAt) / 1000));
  const line = lineIndexAt(state.elapsed, duration, 4);
  if (line !== state.lineIndex) {
    state.lineIndex = line;
    updateLiveLyric();
    sfx.sparkle();
  }
  const progress = Math.min(1, state.elapsed / duration);
  document.querySelector('#song-progress-fill').style.width = `${(progress * 100).toFixed(2)}%`;
  document.querySelector('#performance-time').textContent = `0:${String(Math.floor(state.elapsed)).padStart(2, '0')}`;
  performanceFrame = requestAnimationFrame(updatePerformanceFrame);
}

async function startPerformance({ record = false, camera = false } = {}) {
  if (state.phase === 'performing' || performanceFinishing) return;
  performanceRunId += 1;
  closePermissionSheet();
  stopReplay();
  remixNudger.stop();
  state.recording = record;
  state.rehearsal = !record;
  state.phase = camera ? 'requesting' : 'ready';
  state.permission = camera ? 'requesting' : 'skipped';
  renderPerformance({ camera, record });
  screens.show('perform');

  let granted = false;
  if (record && camera) {
    const recorder = createVideoRecorder({
      mode: state.mediaMode,
      maxDuration: (config.performanceDuration + 1.25) * 1000,
      onState(value) {
        state.permission = value === 'recording' ? 'granted' : value;
        const label = document.querySelector('#performance-label');
        if (label && value === 'requesting') label.textContent = 'Opening camera…';
      },
      onLevel(level) {
        document.querySelector('#voice-meter')?.style.setProperty('--voice-level', level.toFixed(3));
      },
      onAutoStop(result) {
        finishPerformance({ recorderResult: result, automatic: true });
      },
    });
    activeRecorder = recorder;
    granted = await recorder.start(document.querySelector('#camera-preview'));
    if (activeRecorder !== recorder || screens.current !== 'perform') {
      recorder.cleanup();
      if (activeRecorder === recorder) activeRecorder = null;
      return;
    }
    if (!granted) {
      recorder.cleanup();
      activeRecorder = null;
      screens.el('perform').classList.remove('with-camera');
      document.querySelector('#camera-shell').hidden = true;
      state.permission = 'denied';
      await say('media-fallback');
    }
  }

  if (screens.current !== 'perform') {
    activeRecorder?.cleanup();
    activeRecorder = null;
    return;
  }
  // Do not put teacher narration inside a child's camera recording. Stage-only
  // shows can await the spoken cue because no media track is being captured.
  if (record && !granted && state.permission !== 'denied') await say('recording');
  state.phase = 'performing';
  document.querySelector('#performance-label').textContent = record ? (granted ? 'Recording' : 'Stage show') : 'Rehearsal';
  const handle = songEngine.play(songById(), {
    duration: config.performanceDuration,
    onEnd: () => finishPerformance({ automatic: true }),
  });
  performanceStartedAt = handle.startedAt || performance.now();
  cancelAnimationFrame(performanceFrame);
  performanceFrame = requestAnimationFrame(updatePerformanceFrame);
}

function makeShow({ mediaBlob = null, mediaType = '', duration = 0, simulated = false } = {}) {
  return {
    format: 'qlobe-song-story-show',
    formatVersion: 1,
    createdAt: Date.now(),
    songId: state.songId,
    choiceId: state.choiceId,
    singerId: state.singerId,
    lyrics: [...choiceById().lyrics],
    durationMs: Math.max(500, Math.min(config.performanceDuration * 1000, duration || state.elapsed * 1000 || config.performanceDuration * 1000)),
    mediaBlob,
    mediaType,
    simulated,
  };
}

async function finishPerformance({ recorderResult = null, automatic = false, cancel = false } = {}) {
  if (performanceFinishing || !['performing', 'requesting', 'ready'].includes(state.phase)) return;
  const finishingRunId = performanceRunId;
  performanceFinishing = true;
  cancelAnimationFrame(performanceFrame);
  performanceFrame = 0;
  performanceStartedAt = 0;
  songEngine.stop();
  let result = recorderResult;
  if (activeRecorder && !result) result = await activeRecorder.stop();
  activeRecorder?.cleanup();
  activeRecorder = null;
  if (finishingRunId !== performanceRunId || screens.current !== 'perform') return;

  const wasRecording = state.recording;
  state.recording = false;
  state.rehearsal = false;
  state.phase = cancel ? 'idle' : 'finishing';
  if (cancel) {
    performanceFinishing = false;
    return;
  }
  if (!wasRecording) {
    state.phase = 'remix';
    renderRemix();
    screens.show('remix');
    remixNudger.arm();
    if (automatic) say('ready');
    performanceFinishing = false;
    return;
  }

  const show = makeShow({
    mediaBlob: result?.blob || null,
    mediaType: result?.mimeType || '',
    duration: result?.duration || state.elapsed * 1000,
    simulated: Boolean(result?.simulated),
  });
  const savedShow = await showStore.put(show);
  if (finishingRunId !== performanceRunId || screens.current !== 'perform') return;
  state.currentShow = savedShow;
  await refreshShows();
  if (finishingRunId !== performanceRunId || screens.current !== 'perform') return;
  renderFinal();
  screens.show('final');
  state.phase = 'saved';
  say('saved');
  confettiCancel?.();
  confettiCancel = burstConfetti({ host: screens.el('final'), count: 44, duration: 1700 });
  tada({ confetti: false });
  performanceFinishing = false;
}

async function abortPerformance() {
  if (!activeRecorder && !['performing', 'requesting', 'ready', 'finishing'].includes(state.phase)) return;
  performanceRunId += 1;
  state.phase = 'aborting';
  cancelAnimationFrame(performanceFrame);
  performanceFrame = 0;
  performanceStartedAt = 0;
  songEngine.stop();
  activeRecorder?.cleanup();
  activeRecorder = null;
  state.recording = false;
  state.rehearsal = false;
  performanceFinishing = false;
  state.phase = 'idle';
}

function stopReplay() {
  if (!replay) return;
  cancelAnimationFrame(replay.frame);
  globalThis.clearTimeout(replay.timer);
  replay.video?.pause?.();
  replay.video?.removeAttribute?.('src');
  replay.video?.load?.();
  replay.url?.release?.();
  songEngine.stop();
  replay = null;
  document.querySelector('#final-stage')?.classList.remove('is-replaying');
}

function finalBandMarkup(show) {
  return bandMarkup(show?.singerId || state.singerId, 'final-band');
}

function renderFinal() {
  stopReplay();
  const show = state.currentShow || makeShow();
  const song = songById(show.songId);
  const choice = choiceById(song, show.choiceId);
  const singer = singerById(show.singerId);
  const hasMedia = Boolean(show.mediaBlob?.size);
  document.querySelector('#final-content').innerHTML = `
    <div class="final-heading">
      <span>Your remix!</span>
      <small>${escapeHtml(song.title)} · ${escapeHtml(choice.label)} · ${escapeHtml(singer.label)} · ${hasMedia ? 'Private video on this device' : 'Saved on this device'}</small>
    </div>
    <div id="final-live-lyric" class="live-lyric final-live-lyric">${highlightedLyric(choice.lyrics[0], choice)}</div>
    <img class="final-token" src="${escapeHtml(choice.token)}" alt="${escapeHtml(choice.label)}" />
    <div id="final-stage" class="final-stage">${finalBandMarkup(show)}</div>
    <div class="final-camera ${hasMedia ? 'has-media' : ''}" ${hasMedia ? '' : 'hidden'}>
      <video id="final-video" playsinline poster="${escapeHtml(config.assets.cameraPoster)}"></video>
      <img class="camera-frame" src="${escapeHtml(config.assets.cameraFrame)}" alt="" />
    </div>
    <div class="final-actions">
      ${actionButton({ action: 'replay-current', target: 'replay-current', art: config.assets.controls.replay, label: 'Play remix' })}
      ${actionButton({ action: 'new-song', target: 'new-song', art: config.assets.controls.play, label: 'New song' })}
      ${actionButton({ action: 'library', target: 'library-open-final', art: config.assets.controls.library, label: 'My remixes' })}
    </div>
  `;
  wireActions(document.querySelector('#final-content'));
}

function beginReplay(show = state.currentShow) {
  if (!show) return;
  stopReplay();
  state.currentShow = show;
  if (screens.current !== 'final') {
    renderFinal();
    screens.show('final');
  }
  const song = songById(show.songId);
  const choice = choiceById(song, show.choiceId);
  const stage = document.querySelector('#final-stage');
  const lyric = document.querySelector('#final-live-lyric');
  const video = document.querySelector('#final-video');
  const duration = Math.max(4, Math.min(config.performanceDuration, Number(show.durationMs || config.performanceDuration * 1000) / 1000));
  const url = createReplayUrl(show.mediaBlob);
  const startedAt = performance.now() + 60;
  let lastLine = -1;
  replay = { frame: 0, timer: 0, video, url, startedAt };
  stage?.classList.add('is-replaying');
  if (url && video) {
    video.src = url.url;
    video.muted = state.muted;
    video.currentTime = 0;
    video.play().catch(() => {});
  } else {
    songEngine.play(song, { duration });
  }
  if (!url) say('replay');

  const frame = (now) => {
    if (!replay) return;
    const elapsed = Math.max(0, (now - startedAt) / 1000);
    const line = lineIndexAt(elapsed, duration, 4);
    if (line !== lastLine) {
      lastLine = line;
      lyric.innerHTML = highlightedLyric(choice.lyrics[line], choice);
      lyric.dataset.line = String(line);
    }
    replay.frame = requestAnimationFrame(frame);
  };
  replay.frame = requestAnimationFrame(frame);
  replay.timer = globalThis.setTimeout(() => {
    stopReplay();
    confettiCancel?.();
    confettiCancel = burstConfetti({ host: screens.el('final'), count: 26, duration: 1250 });
  }, (duration * 1000) + 180);
}

async function refreshShows() {
  state.shows = await showStore.list();
  state.storagePersistent = showStore.persistent();
  const count = document.querySelector('#shelf-count');
  if (count) count.textContent = state.shows.length ? String(state.shows.length) : '';
}

function renderLibrary() {
  const host = document.querySelector('#library-content');
  host.innerHTML = `
    <div class="library-heading">
      <img src="${escapeHtml(config.assets.controls.library)}" alt="" />
      <div><h1>My remixes</h1><p>${state.storagePersistent ? 'Saved on this device' : 'Saved for this visit'}</p></div>
    </div>
    <div class="remix-shelf ${state.shows.length ? (state.shows.length === 1 ? 'is-single' : '') : 'is-empty'}">
      ${state.shows.length ? state.shows.map((show) => {
        const song = songById(show.songId);
        const choice = choiceById(song, show.choiceId);
        const singer = singerById(show.singerId);
        return `<article class="saved-remix">
          <button class="saved-remix-open" data-action="open-show" data-value="${escapeHtml(show.id)}" data-target="show-${escapeHtml(show.id)}" aria-label="Play ${escapeHtml(song.title)} with ${escapeHtml(choice.label)} and ${escapeHtml(singer.label)}">
            <img class="saved-card-art" src="${escapeHtml(song.card)}" alt="" />
            <img class="saved-choice-art" src="${escapeHtml(choice.token)}" alt="" />
            <span>${escapeHtml(song.title)}</span>
            <small>${show.mediaBlob?.size ? 'Video remix' : 'Stage remix'}</small>
          </button>
          <button class="delete-remix" data-action="delete-show" data-value="${escapeHtml(show.id)}" data-target="delete-${escapeHtml(show.id)}" aria-label="Delete this remix">×</button>
        </article>`;
      }).join('') : `<div class="empty-shelf">
        <img src="${escapeHtml(config.assets.controls.save)}" alt="" />
        <h2>Your first remix goes here</h2>
        <p>Pick a song, swap the story, and make a show.</p>
      </div>`}
    </div>
  `;
  wireActions(host);
}

async function openLibrary() {
  stopReplay();
  await refreshShows();
  renderLibrary();
  screens.show('library');
  state.phase = 'library';
  if (!state.shows.length) say('library-empty');
}

async function openShow(id) {
  const show = state.shows.find((item) => item.id === id) || await showStore.get(id);
  if (!show) return;
  state.currentShow = show;
  state.songId = show.songId;
  state.choiceId = show.choiceId;
  state.singerId = show.singerId;
  renderFinal();
  screens.show('final');
  state.phase = 'saved';
}

async function deleteShow(id) {
  if (state.currentShow?.id === id) state.currentShow = null;
  await showStore.delete(id);
  await refreshShows();
  renderLibrary();
  say('deleted');
}

async function goSplash() {
  closePermissionSheet();
  await abortPerformance();
  stopReplay();
  remixNudger.stop();
  confettiCancel?.();
  confettiCancel = null;
  state.phase = 'idle';
  screens.show('splash');
  await refreshShows();
  say('choose-song');
}

function stopEverything() {
  performanceRunId += 1;
  closePermissionSheet();
  activeRecorder?.cleanup();
  activeRecorder = null;
  cancelAnimationFrame(performanceFrame);
  performanceFrame = 0;
  songEngine.stop();
  stopReplay();
  voice.stop();
  remixNudger.stop();
  confettiCancel?.();
}

async function handleAction(action, value) {
  switch (action) {
    case 'song': chooseSong(value); break;
    case 'choice': chooseChoice(value); break;
    case 'singer': chooseSinger(value); break;
    case 'rehearse': await startPerformance({ record: false, camera: false }); break;
    case 'record': openPermissionSheet(); break;
    case 'record-camera': await startPerformance({ record: true, camera: true }); break;
    case 'record-stage': await startPerformance({ record: true, camera: false }); break;
    case 'permission-cancel': closePermissionSheet(); break;
    case 'stop-performance': await finishPerformance({ automatic: false }); break;
    case 'replay-current': beginReplay(); break;
    case 'new-song': await goSplash(); say('one-more'); break;
    case 'library': await openLibrary(); break;
    case 'open-show': await openShow(value); break;
    case 'delete-show': await deleteShow(value); break;
    default: break;
  }
}

function wireActions(scope = root) {
  scope.querySelectorAll('[data-action]:not([data-wired])').forEach((button) => {
    button.dataset.wired = 'true';
    onTap(button, () => {
      Promise.resolve(handleAction(button.dataset.action, button.dataset.value || '')).catch(() => {
        state.phase = 'idle';
      });
    }, { feedback: () => sfx.tick() });
  });
}

const remixNudger = createNudger({
  first: 9_000,
  repeat: 11_000,
  onNudge(index) {
    if (screens.current !== 'remix' || state.phase === 'performing') return;
    if (index === 0) say('nudge');
    else document.querySelector('.choice-token:not(.is-selected)')?.classList.add('is-nudged');
  },
});

async function debugSaveShow() {
  if (screens.current !== 'remix') chooseSong(state.songId);
  state.currentShow = await showStore.put(makeShow({ duration: config.performanceDuration * 1000 }));
  await refreshShows();
  renderFinal();
  screens.show('final');
  state.phase = 'saved';
  return serializableShow(state.currentShow);
}

function debugTap(target) {
  const element = document.querySelector(`[data-target="${CSS.escape(String(target))}"]`);
  if (!element || element.disabled || element.hidden) return false;
  element.click();
  return true;
}

const voiceReady = voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', LINES);
const ready = Promise.all([
  voiceReady,
  preloadImages(allArtUrls()),
  refreshShows(),
]).then(() => true);

installUnlockOnGesture({
  extra: [() => songEngine.unlock()],
  onFirst: () => say('welcome'),
});
installKioskGuards();
wireActions();

installDebug({
  gameId: config.id,
  ready,
  listModes: () => config.songs.map(({ id, title }) => ({ id, title })),
  startMode: async (id) => {
    chooseSong(id);
    return true;
  },
  getState: () => ({
    screen: screens.current,
    phase: state.phase,
    songId: state.songId,
    choiceId: state.choiceId,
    singerId: state.singerId,
    recording: state.recording,
    rehearsal: state.rehearsal,
    permission: state.permission,
    lineIndex: state.lineIndex,
    elapsed: Number(state.elapsed.toFixed(2)),
    savedCount: state.shows.length,
    storagePersistent: state.storagePersistent,
    muted: state.muted,
  }),
  tap: debugTap,
  winRound: debugSaveShow,
  home: goSplash,
  timers,
  narrator: voice,
  voice: voiceClips,
  sfx,
  choose(choiceId, singerId = state.singerId) {
    chooseChoice(choiceId);
    chooseSinger(singerId);
    return { choiceId: state.choiceId, singerId: state.singerId };
  },
  setMediaMode(mode) {
    if (!['real', 'fake', 'denied'].includes(mode)) return false;
    state.mediaMode = mode;
    return true;
  },
  completeShow: debugSaveShow,
  listShows: () => state.shows.map(serializableShow),
  clearShows: async () => {
    await showStore.clear();
    await refreshShows();
    return true;
  },
  getAudioLog: () => voiceClips.getAudioLog(),
  getSongEngine: () => songEngine.getState(),
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) return;
  if (screens.current === 'perform') {
    abortPerformance().then(() => goSplash());
  } else {
    stopReplay();
  }
});
window.addEventListener('pagehide', stopEverything);
reducedMotion.addEventListener?.('change', () => {
  document.documentElement.classList.toggle('reduced-motion', reducedMotion.matches);
});
document.documentElement.classList.toggle('reduced-motion', reducedMotion.matches);

ready.then(() => {
  root.classList.add('is-ready');
  if (!state.shows.length) document.querySelector('#shelf-count').textContent = '';
});
