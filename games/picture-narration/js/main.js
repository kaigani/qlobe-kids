import config, { audioLines, storySentence, ui, worlds } from '../config.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { installKioskGuards, installUnlockOnGesture } from '../../../shared/js/audio-unlock.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { createTimers } from '../../../shared/js/timers.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';

const root = document.getElementById('game');
const announcer = document.getElementById('announcer');
const timers = createTimers();
const initialState = () => ({
  screen: 'splash',
  phase: 'splash',
  worldId: null,
  discoveries: [],
  lastDiscovery: null,
  choiceStep: 0,
  choices: [],
  muted: false,
  narrationPlaying: false,
  recordingState: 'idle',
  recordingDurationMs: 0,
    hasRecording: false,
    micFallback: false,
    micFallbackReason: null,
  completed: false,
  seed: 42,
});

let state = initialState();
let rng = mulberry32(state.seed);
let recordingUrl = '';
let recordingSequence = 0;
let activeRecordingSession = null;
let recordingPlayer = null;
let narrationToken = 0;

installKioskGuards();
installUnlockOnGesture({ target: window });

root.addEventListener('click', (event) => {
  const control = event.target.closest('[data-target]');
  if (!control || !root.contains(control)) return;
  const target = control.dataset.target;
  if (target === 'home' || target === 'record') return;
  event.preventDefault();
  handleTarget(target);
});

window.addEventListener('pointerup', finishRecordingHold, { passive: true });
window.addEventListener('pointercancel', cancelRecordingHold, { passive: true });
window.addEventListener('keyup', (event) => {
  if (event.code === 'Space' || event.code === 'Enter') {
    finishRecordingHold({ pointerId: `keyboard:${event.code}` });
  }
});
window.addEventListener('blur', () => {
  cancelRecordingHold({ pointerId: activeRecordingSession?.pointerId });
});
window.addEventListener('pagehide', releaseRecordingResources);

const ready = boot();

installDebug({
  formatVersion: 1,
  gameId: config.id,
  engine: 'taleteller-dom',
  ready,
  timers,
  voice,
  sfx,
  listModes: () => worlds.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState,
  tap: tapTarget,
  choose: chooseTarget,
  complete: completeWorld,
  win: completeWorld,
  winRound: completeWorld,
  mute: setMuted,
  setMuted,
  seed: setSeed,
  setSeed,
  fastTimers: setFastTimers,
  setFastTimers,
  reset,
  home: showSplash,
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  forceMicFallback: () => enterMicFallback('debug'),
});

async function boot() {
  const criticalArt = [ui.splash, ui.title, ui.storybook];
  const allArt = [
    ...Object.values(ui),
    ...worlds.flatMap((world) => [
      world.background,
      world.protagonist.art,
      ...world.hotspots.map((hotspot) => hotspot.art),
      ...world.choices.flat().map((choice) => choice.art),
    ]),
  ];

  await Promise.all([
    voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', audioLines),
    preloadImages(criticalArt),
  ]);
  preloadImages(allArt, { idle: true });
  render();
  root.setAttribute('aria-busy', 'false');
  return true;
}

function getWorld(id = state.worldId) {
  return worlds.find((world) => world.id === id) || null;
}

function getState() {
  return {
    formatVersion: 1,
    screen: state.screen,
    phase: state.phase,
    worldId: state.worldId,
    discoveries: [...state.discoveries],
    lastDiscovery: state.lastDiscovery,
    choiceStep: state.choiceStep,
    choices: [...state.choices],
    sentence: state.worldId ? storySentence(getWorld(), state.choices) : '',
    muted: state.muted,
    narrationPlaying: state.narrationPlaying,
    recordingState: state.recordingState,
    recordingDurationMs: state.recordingDurationMs,
    hasRecording: state.hasRecording,
    micFallback: state.micFallback,
    micFallbackReason: state.micFallbackReason,
    completed: state.completed,
    seed: state.seed,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  if (recordingPlayer) recordingPlayer.muted = state.muted;
  if (state.muted) narrationToken += 1;
  if (state.muted) state.narrationPlaying = false;
  render();
  return state.muted;
}

function setSeed(value = 42) {
  const seed = Number.isFinite(Number(value)) ? Number(value) >>> 0 : 42;
  state.seed = seed;
  rng = mulberry32(seed);
  return seed;
}

function setFastTimers(scale = 0.05) {
  const number = Number(scale);
  const multiplier = Number.isFinite(number) && number > 0
    ? Math.min(1, Math.max(0.01, number > 1 ? 1 / number : number))
    : 0.05;
  timers.setScale(1 / multiplier);
  return multiplier;
}

function reset() {
  const muted = state.muted;
  const seed = state.seed;
  leaveRecording();
  voice.stop();
  timers.clearAll();
  state = { ...initialState(), muted, seed };
  rng = mulberry32(seed);
  render();
  return getState();
}

function showSplash() {
  leaveRecording();
  voice.stop();
  narrationToken += 1;
  state.screen = 'splash';
  state.phase = 'splash';
  state.worldId = null;
  state.discoveries = [];
  state.lastDiscovery = null;
  state.choices = [];
  state.choiceStep = 0;
  state.completed = false;
  state.narrationPlaying = false;
  render();
  return getState();
}

function showLibrary({ narrate = true } = {}) {
  leaveRecording();
  voice.stop();
  narrationToken += 1;
  state.screen = 'library';
  state.phase = 'library';
  state.worldId = null;
  state.discoveries = [];
  state.lastDiscovery = null;
  state.choices = [];
  state.choiceStep = 0;
  state.completed = false;
  state.narrationPlaying = false;
  render();
  announce('Choose a story world. Forest, ocean, or moon.');
  if (narrate) speak('choose-world', audioLines['choose-world']);
  return getState();
}

function startMode(id) {
  const world = getWorld(id);
  if (!world) return false;
  leaveRecording();
  voice.stop();
  narrationToken += 1;
  state.screen = 'play';
  state.phase = 'explore';
  state.worldId = world.id;
  state.discoveries = [];
  state.lastDiscovery = null;
  state.choiceStep = 0;
  state.choices = [];
  state.completed = false;
  state.narrationPlaying = false;
  state.recordingState = 'idle';
  state.micFallback = false;
  state.micFallbackReason = null;
  render();
  announce(world.intro);
  speak(`intro-${world.id}`, world.intro);
  return true;
}

function back() {
  if (state.screen === 'library') showSplash();
  else if (state.screen === 'play' || state.screen === 'finale') showLibrary();
  else showSplash();
}

function discoverHotspot(id) {
  if (state.screen !== 'play' || !state.phase.startsWith('explore')) return false;
  const world = getWorld();
  const hotspot = world?.hotspots.find((item) => item.id === id);
  if (!hotspot) return false;
  const firstDiscovery = !state.discoveries.includes(id);
  if (firstDiscovery) state.discoveries.push(id);
  state.lastDiscovery = id;
  if (state.discoveries.length === world.hotspots.length) state.phase = 'explore-ready';
  sfx.pop();
  render();
  announce(`${hotspot.label}. ${hotspot.pronunciation}.`);
  requestAnimationFrame(() => {
    root.querySelector(`[data-target="hotspot:${cssEscape(id)}"]`)?.classList.add('is-popped');
  });
  const line = speak(`word-${world.id}-${id}`, hotspot.line);
  if (firstDiscovery && state.discoveries.length === world.hotspots.length) {
    line.then(() => {
      if (state.screen === 'play' && state.phase === 'explore-ready') {
        speak('all-clues', audioLines['all-clues']);
      }
    });
  }
  return true;
}

function beginChoices() {
  if (state.screen !== 'play' || state.discoveries.length < 4) return false;
  const world = getWorld();
  state.phase = 'choice';
  state.choiceStep = 0;
  state.lastDiscovery = null;
  render();
  announce(world.choicePrompts[0]);
  speak(`prompt-${world.id}-1`, world.choicePrompts[0]);
  return true;
}

function selectChoice(id) {
  if (state.screen !== 'play' || state.phase !== 'choice') return false;
  const world = getWorld();
  const step = state.choiceStep;
  const choice = world?.choices[step]?.find((item) => item.id === id);
  if (!choice) return false;
  state.choices[step] = id;
  sfx.sparkle();
  const line = speak(`choice-${world.id}-${step + 1}-${id}`, choice.line);
  if (step === 0) {
    state.choiceStep = 1;
    render();
    announce(world.choicePrompts[1]);
    line.then(() => {
      if (state.screen === 'play' && state.phase === 'choice' && state.choiceStep === 1) {
        speak(`prompt-${world.id}-2`, world.choicePrompts[1]);
      }
    });
  } else {
    state.completed = true;
    state.screen = 'finale';
    state.phase = 'finale';
    state.recordingState = 'idle';
    state.micFallback = false;
    render();
    announce(`Your story is ready. ${storySentence(world, state.choices)}`);
    sfx.tada();
    line.then(() => {
      if (state.screen === 'finale'
        && !state.narrationPlaying
        && state.recordingState === 'idle') {
        speak('story-ready', audioLines['story-ready']);
      }
    });
  }
  return true;
}

function handleTarget(target) {
  if (!target) return false;
  if (target === 'enter') {
    sfx.tick();
    showLibrary();
    return true;
  }
  if (target === 'back') {
    sfx.tick();
    back();
    return true;
  }
  if (target === 'sound') {
    sfx.tick();
    setMuted(!state.muted);
    return true;
  }
  if (target === 'continue') {
    sfx.tick();
    return beginChoices();
  }
  if (target === 'listen-story') {
    sfx.tick();
    playStoryNarration();
    return true;
  }
  if (target === 'replay-recording') {
    sfx.tick();
    replayRecording();
    return true;
  }
  if (target === 'speak-aloud') {
    sfx.tick();
    enterMicFallback('chosen');
    return true;
  }
  if (target === 'guided') {
    sfx.tick();
    guidedRetell();
    return true;
  }
  if (target === 'another') {
    sfx.tick();
    showLibrary();
    return true;
  }
  if (target.startsWith('world:')) return startMode(target.slice('world:'.length));
  if (target.startsWith('hotspot:')) return discoverHotspot(target.slice('hotspot:'.length));
  if (target.startsWith('choice:')) return selectChoice(target.slice('choice:'.length));
  return false;
}

async function playStoryNarration() {
  if (state.screen !== 'finale' || state.narrationPlaying) return false;
  const world = getWorld();
  if (!world) return false;
  const token = ++narrationToken;
  state.narrationPlaying = true;
  render();
  for (let step = 0; step < 2; step += 1) {
    const choice = world.choices[step].find((item) => item.id === state.choices[step]);
    if (!choice || token !== narrationToken || state.screen !== 'finale') break;
    await speak(`choice-${world.id}-${step + 1}-${choice.id}`, choice.line);
  }
  if (token === narrationToken && state.screen === 'finale') {
    state.narrationPlaying = false;
    render();
  }
  return true;
}

async function guidedRetell() {
  if (state.screen !== 'finale') return false;
  const world = getWorld();
  if (!world) return false;
  const token = ++narrationToken;
  state.recordingState = 'guided';
  render();
  await speak('guided-begin', `Tell it with me. ${world.protagonist.label} began an adventure.`);
  for (let step = 0; step < 2; step += 1) {
    const choice = world.choices[step].find((item) => item.id === state.choices[step]);
    if (!choice || token !== narrationToken || state.screen !== 'finale') return false;
    await timers.wait(260);
    await speak(`choice-${world.id}-${step + 1}-${choice.id}`, choice.line);
  }
  if (token === narrationToken && state.screen === 'finale') {
    await timers.wait(240);
    await speak('guided-finish', audioLines['guided-finish']);
    state.recordingState = 'fallback';
    render();
  }
  return true;
}

function speak(key, text) {
  return voice.say(key, text);
}

async function beginRecordingHold(event) {
  if (state.screen !== 'finale') return;
  if (event.repeat) return;
  event.preventDefault();
  voice.stop();
  narrationToken += 1;
  state.narrationPlaying = false;
  stopRecordingReplay();

  if (activeRecordingSession?.recorder?.state === 'recording') return;
  if (activeRecordingSession) activeRecordingSession.cancelled = true;

  const session = {
    id: ++recordingSequence,
    pointerId: event.pointerId ?? `keyboard:${event.code}`,
    holdActive: true,
    cancelled: false,
    stream: null,
    recorder: null,
    chunks: [],
    startedAt: 0,
    limitTimer: null,
  };
  activeRecordingSession = session;

  if (!navigator.mediaDevices?.getUserMedia || typeof window.MediaRecorder !== 'function') {
    enterMicFallback('unsupported', session);
    return;
  }

  state.recordingState = 'requesting';
  render();
  announce('Getting the microphone ready. Keep holding.');

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (activeRecordingSession !== session
      || session.cancelled
      || !session.holdActive
      || state.screen !== 'finale') {
      stream.getTracks().forEach((track) => track.stop());
      if (activeRecordingSession === session) {
        activeRecordingSession = null;
        state.recordingState = state.hasRecording ? 'recorded' : 'idle';
        render();
      }
      return;
    }
    session.stream = stream;
    const options = preferredRecorderOptions();
    session.recorder = options ? new MediaRecorder(stream, options) : new MediaRecorder(stream);
    session.recorder.addEventListener('dataavailable', (chunkEvent) => {
      if (chunkEvent.data?.size) session.chunks.push(chunkEvent.data);
    });
    session.recorder.addEventListener('error', () => {
      if (activeRecordingSession === session) enterMicFallback('recorder-error', session);
    });
    session.recorder.addEventListener('stop', () => finishRecording(session));
    session.startedAt = performance.now();
    session.recorder.start(120);
    session.limitTimer = timers.after(60000, () => {
      if (activeRecordingSession !== session) return;
      session.holdActive = false;
      session.pointerId = null;
      if (session.recorder?.state === 'recording') session.recorder.stop();
    });
    state.recordingState = 'recording';
    sfx.pop();
    render();
    announce('I am listening. Tell your story, then let go.');
  } catch {
    if (activeRecordingSession === session) enterMicFallback('denied', session);
  }
}

function preferredRecorderOptions() {
  const choices = [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  const mimeType = choices.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });
  return mimeType ? { mimeType } : null;
}

function finishRecordingHold(event) {
  const session = activeRecordingSession;
  if (!session || event.pointerId !== session.pointerId) return;
  session.holdActive = false;
  session.pointerId = null;
  if (session.recorder?.state === 'recording') {
    try {
      session.recorder.stop();
    } catch {
      enterMicFallback('recorder-stop', session);
    }
  }
}

function cancelRecordingHold(event) {
  const session = activeRecordingSession;
  if (!session || event.pointerId !== session.pointerId) return;
  session.cancelled = true;
  session.holdActive = false;
  session.pointerId = null;
  if (session.recorder?.state === 'recording') {
    try {
      session.recorder.stop();
    } catch {
      if (session.limitTimer !== null) {
        timers.clear(session.limitTimer);
        session.limitTimer = null;
      }
      stopSessionStream(session);
      activeRecordingSession = null;
      if (state.screen === 'finale') {
        state.recordingState = state.hasRecording ? 'recorded' : 'idle';
        render();
        announce('Recording stopped. Hold the microphone when you are ready to try again.');
      }
    }
  } else if (state.screen === 'finale' && state.recordingState === 'requesting') {
    state.recordingState = state.hasRecording ? 'recorded' : 'idle';
    render();
  }
}

function finishRecording(session) {
  if (session.limitTimer !== null) {
    timers.clear(session.limitTimer);
    session.limitTimer = null;
  }
  const duration = Math.max(0, Math.round(performance.now() - session.startedAt));
  const mimeType = session.recorder?.mimeType || session.chunks[0]?.type || 'audio/webm';
  stopSessionStream(session);
  if (activeRecordingSession !== session) {
    session.chunks = [];
    return;
  }
  activeRecordingSession = null;
  if (session.cancelled || !session.chunks.length || duration < 180) {
    session.chunks = [];
    if (state.screen === 'finale') {
      state.recordingState = state.micFallback
        ? 'fallback'
        : state.hasRecording ? 'recorded' : 'idle';
      render();
    }
    return;
  }
  if (recordingUrl) URL.revokeObjectURL(recordingUrl);
  recordingUrl = URL.createObjectURL(new Blob(session.chunks, { type: mimeType }));
  session.chunks = [];
  state.recordingDurationMs = duration;
  state.hasRecording = true;
  state.recordingState = 'recorded';
  state.micFallback = false;
  state.micFallbackReason = null;
  sfx.tada();
  render();
  announce('Your recording is ready. Press replay to hear it.');
  speak('recorded', audioLines['recorded']);
}

function replayRecording() {
  if (!recordingUrl || state.screen !== 'finale') return false;
  voice.stop();
  stopRecordingReplay();
  const player = new Audio(recordingUrl);
  recordingPlayer = player;
  player.muted = state.muted;
  state.recordingState = 'replaying';
  render();
  const settle = () => {
    if (recordingPlayer !== player) return;
    recordingPlayer = null;
    if (state.screen === 'finale' && state.hasRecording) {
      state.recordingState = 'recorded';
      render();
    }
  };
  player.addEventListener('ended', settle, { once: true });
  player.addEventListener('error', settle, { once: true });
  player.play().catch(settle);
  return true;
}

function stopRecordingReplay() {
  if (!recordingPlayer) return;
  try {
    recordingPlayer.pause();
    recordingPlayer.removeAttribute('src');
    recordingPlayer.load();
  } catch {
    // A local replay must never block the game if a browser drops its decoder.
  }
  recordingPlayer = null;
}

function enterMicFallback(reason = 'unavailable', requestedSession = activeRecordingSession) {
  const session = requestedSession;
  if (session && activeRecordingSession && session !== activeRecordingSession) return false;
  if (session) {
    session.cancelled = true;
    session.holdActive = false;
    session.pointerId = null;
    if (session.limitTimer !== null) {
      timers.clear(session.limitTimer);
      session.limitTimer = null;
    }
  }
  activeRecordingSession = null;
  if (session?.recorder?.state === 'recording') {
    try {
      session.recorder.stop();
    } catch {
      stopSessionStream(session);
    }
  } else if (session) stopSessionStream(session);
  state.recordingState = 'fallback';
  state.micFallback = true;
  state.micFallbackReason = reason;
  render();
  announce('No microphone needed. Tell the story out loud with me.');
  speak('mic-fallback', audioLines['mic-fallback']);
  return true;
}

function stopSessionStream(session) {
  if (session?.stream) {
    session.stream.getTracks().forEach((track) => track.stop());
    session.stream = null;
  }
}

function releaseRecordingResources() {
  const session = activeRecordingSession;
  activeRecordingSession = null;
  if (!session) return;
  session.cancelled = true;
  session.holdActive = false;
  if (session.limitTimer !== null) {
    timers.clear(session.limitTimer);
    session.limitTimer = null;
  }
  if (session.recorder?.state === 'recording') {
    try {
      session.recorder.stop();
    } catch {
      stopSessionStream(session);
    }
  } else stopSessionStream(session);
}

function leaveRecording() {
  releaseRecordingResources();
  stopRecordingReplay();
  if (recordingUrl) {
    URL.revokeObjectURL(recordingUrl);
    recordingUrl = '';
  }
  state.hasRecording = false;
  state.recordingDurationMs = 0;
  state.recordingState = 'idle';
  state.micFallback = false;
  state.micFallbackReason = null;
}

function render() {
  root.replaceChildren();
  if (state.screen === 'splash') renderSplash();
  else if (state.screen === 'library') renderLibrary();
  else if (state.screen === 'play') renderPlay();
  else if (state.screen === 'finale') renderFinale();
}

function renderSplash() {
  const screen = el('section', 'game-screen splash-screen');
  screen.setAttribute('aria-label', 'TaleTeller title screen');
  screen.append(
    sceneImage(ui.splash, 'A watercolor storybook world', 'splash-backdrop'),
    el('div', 'backdrop-wash'),
    createHud({ home: true }),
  );

  const layout = el('div', 'splash-layout');
  const card = el('div', 'splash-card');
  card.append(el('p', 'splash-kicker', 'A picture story adventure'));

  const title = el('div', 'brand-title art-frame');
  title.append(
    el('div', 'brand-title-fallback art-fallback', 'TaleTeller'),
    artImage(ui.title, 'TaleTeller', 'title-art'),
  );
  card.append(title);
  card.append(el('p', 'splash-subtitle', 'Find story words. Choose what happens. Tell it your way.'));

  const enter = actionButton('enter', 'Open the storybook', 'primary-action', ui.storybook);
  card.append(enter);
  layout.append(card);
  screen.append(layout);
  root.append(screen);
}

function renderLibrary() {
  const screen = el('section', 'game-screen library-screen');
  screen.setAttribute('aria-label', 'Choose a story world');
  screen.append(
    sceneImage(ui.splash, 'Watercolor leaves around the story library', 'splash-backdrop'),
    el('div', 'backdrop-wash'),
    createHud({ back: true }),
  );
  const scroll = el('div', 'screen-scroll');
  const layout = el('div', 'library-layout');
  layout.append(
    el('h1', 'screen-heading', 'Choose a story'),
    el('p', 'screen-prompt', 'Forest, ocean, or moon?'),
  );
  const grid = el('div', 'world-grid');
  for (const world of worlds) {
    const card = el('button', 'world-card art-frame');
    card.type = 'button';
    card.dataset.target = `world:${world.id}`;
    card.dataset.role = 'choice';
    card.setAttribute('aria-label', `Choose the ${world.title} story`);
    card.append(
      el('div', 'art-fallback', world.title),
      artImage(world.background, `${world.title} watercolor story world`, 'world-art'),
      el('span', 'world-label', world.title),
    );
    grid.append(card);
  }
  layout.append(grid);
  scroll.append(layout);
  screen.append(scroll);
  root.append(screen);
}

function renderPlay() {
  const world = getWorld();
  if (!world) {
    showLibrary({ narrate: false });
    return;
  }
  const screen = el('section', `game-screen play-screen world-${world.id}`);
  screen.setAttribute('aria-label', `${world.title} story builder`);
  screen.append(
    sceneImage(world.background, `${world.title} watercolor scene`, 'scene-backdrop'),
    el('div', 'screen-shade'),
    createHud({ back: true }),
  );

  const layout = el('div', 'play-layout');
  const header = el('header', 'play-header');
  const prompt = state.phase === 'choice'
    ? world.choicePrompts[state.choiceStep]
    : state.phase === 'explore-ready'
      ? 'Every clue is ready. Choose what happens next!'
      : 'Tap the glowing story clues';
  header.append(el('h1', 'prompt-plaque', prompt));
  if (state.phase === 'explore') header.append(renderProgress(world));
  layout.append(header);

  const stage = el('div', 'story-stage');
  if (state.phase.startsWith('explore')) renderExploreStage(stage, world);
  else renderChoiceStage(stage, world);
  layout.append(stage, renderSentenceStrip(world));
  screen.append(layout);
  root.append(screen);
}

function renderProgress(world) {
  const progress = el('div', 'progress-pips');
  progress.setAttribute('aria-label', `${state.discoveries.length} of ${world.hotspots.length} clues found`);
  for (let index = 0; index < world.hotspots.length; index += 1) {
    progress.append(el('span', `progress-pip${index < state.discoveries.length ? ' is-found' : ''}`));
  }
  return progress;
}

function renderExploreStage(stage, world) {
  for (const hotspot of world.hotspots) {
    const discovered = state.discoveries.includes(hotspot.id);
    const button = el('button', `hotspot art-frame${discovered ? ' is-discovered' : ''}`);
    button.classList.add(`motion-${hotspot.id}`);
    button.type = 'button';
    button.dataset.target = `hotspot:${hotspot.id}`;
    button.dataset.role = 'choice';
    button.style.left = `${hotspot.x}%`;
    button.style.top = `${hotspot.y}%`;
    button.setAttribute('aria-label', discovered ? `Hear ${hotspot.label} again` : `Discover ${hotspot.label}`);
    button.append(
      el('span', 'art-fallback', hotspot.label),
      artImage(hotspot.art, hotspot.label, 'hotspot-art'),
    );
    stage.append(button);
  }

  const found = world.hotspots.find((hotspot) => hotspot.id === state.lastDiscovery);
  if (found) {
    const plaque = el('div', 'word-plaque');
    plaque.setAttribute('role', 'status');
    const copy = el('div');
    copy.append(el('strong', '', found.label), el('span', '', found.pronunciation));
    plaque.append(copy);
    stage.append(plaque);
  }

  if (state.phase === 'explore-ready') {
    const next = actionButton('continue', 'Choose what happens', 'primary-action continue-action', ui.next);
    stage.append(next);
  }
}

function renderChoiceStage(stage, world) {
  stage.append(artImage(world.protagonist.art, world.protagonist.label, 'choice-character'));
  if (state.choiceStep > 0) {
    const previous = world.choices[0].find((choice) => choice.id === state.choices[0]);
    if (previous) {
      const beat = el('div', 'choice-outcome');
      beat.setAttribute('aria-label', `Story so far: ${previous.line}`);
      beat.append(
        artImage(previous.art, '', 'choice-outcome-art'),
        el('span', 'choice-outcome-kicker', 'Story so far'),
        el('strong', '', previous.line),
      );
      stage.append(beat);
    }
  }
  const choices = el('div', 'choice-panel');
  for (const choice of world.choices[state.choiceStep]) {
    const card = el('button', 'choice-card art-frame');
    card.type = 'button';
    card.dataset.target = `choice:${choice.id}`;
    card.dataset.role = 'choice';
    card.setAttribute('aria-label', `Choose ${choice.label}`);
    card.append(
      el('div', 'art-fallback', choice.label),
      artImage(choice.art, choice.label, 'choice-art'),
      el('span', 'choice-label', choice.label),
    );
    choices.append(card);
  }
  stage.append(choices);
}

function renderSentenceStrip(world) {
  const strip = el('div', 'sentence-strip');
  const ribbonUrl = new URL(ui.sentenceRibbon, document.baseURI).href;
  strip.style.setProperty('--ribbon-image', `url("${ribbonUrl}")`);
  strip.setAttribute('aria-label', 'Your picture sentence');
  strip.append(el('span', 'sentence-lead', 'My story'));
  strip.append(storyToken(world.protagonist.art, world.protagonist.name, 'protagonist'));

  for (const discoveryId of state.discoveries) {
    const clue = world.hotspots.find((hotspot) => hotspot.id === discoveryId);
    if (clue) strip.append(storyToken(clue.art, clue.label, 'clue'));
  }

  state.choices.forEach((choiceId, step) => {
    const choice = world.choices[step]?.find((item) => item.id === choiceId);
    if (choice) strip.append(storyToken(choice.art, choice.token, 'choice'));
  });
  requestAnimationFrame(() => {
    if (!strip.isConnected || strip.scrollWidth <= strip.clientWidth + 4) return;
    strip.scrollTo({
      left: strip.scrollWidth,
      behavior: 'auto',
    });
  });
  return strip;
}

function storyToken(src, label, kind) {
  const token = el('span', `story-token is-${kind}`);
  token.append(artImage(src, '', 'token-art'), el('span', '', label));
  return token;
}

function renderFinale() {
  const world = getWorld();
  if (!world) {
    showLibrary({ narrate: false });
    return;
  }
  const screen = el('section', `game-screen finale-screen world-${world.id}`);
  screen.setAttribute('aria-label', `${world.storyTitle} finale`);
  screen.append(
    sceneImage(world.background, `${world.title} watercolor scene`, 'scene-backdrop'),
    el('div', 'screen-shade'),
    createHud({ back: true }),
  );

  const scroll = el('div', 'screen-scroll');
  const layout = el('div', 'finale-layout');
  const illustration = el('div', 'finale-illustration');
  illustration.append(artImage(world.protagonist.art, world.protagonist.label, 'scene-character'));
  const stars = el('div', 'finale-stars');
  for (let index = 0; index < 5; index += 1) {
    stars.append(artImage(ui.star, '', 'finale-star'));
  }
  const outcomes = el('div', 'finale-outcomes');
  state.choices.forEach((choiceId, step) => {
    const choice = world.choices[step]?.find((item) => item.id === choiceId);
    if (!choice) return;
    const outcome = el('div', 'finale-outcome art-frame');
    outcome.append(
      artImage(choice.art, choice.label, 'finale-outcome-art'),
      el('span', '', choice.label),
    );
    outcomes.append(outcome);
  });
  illustration.append(stars, outcomes);

  const card = el('article', 'finale-card');
  card.append(
    el('p', 'finale-kicker', 'You made a story'),
    el('h1', 'finale-heading', world.storyTitle),
    el('p', 'finished-sentence', storySentence(world, state.choices)),
  );

  const actions = el('div', 'finale-actions');
  const listen = actionButton(
    'listen-story',
    state.narrationPlaying ? 'Telling your story…' : 'Hear my story',
    'secondary-action',
    ui.replay,
  );
  listen.disabled = state.narrationPlaying;
  actions.append(listen);
  card.append(actions, renderRecordingPanel(world));

  const another = el('button', 'another-story', 'Choose another story');
  another.type = 'button';
  another.dataset.target = 'another';
  another.dataset.role = 'navigation';
  card.append(another);

  layout.append(illustration, card);
  scroll.append(layout);
  screen.append(scroll);
  root.append(screen);
}

function renderRecordingPanel(world) {
  if (state.recordingState === 'fallback' || state.recordingState === 'guided') {
    const panel = el('div', 'fallback-panel');
    const message = state.recordingState === 'guided'
      ? 'Listen, pause, and say each story part with me.'
      : 'No microphone needed. Tell the story out loud with me!';
    panel.append(el('p', '', message));
    const guided = actionButton(
      'guided',
      state.recordingState === 'guided' ? 'Telling together…' : 'Tell it together',
      'secondary-action',
      ui.storybook,
    );
    guided.disabled = state.recordingState === 'guided';
    panel.append(guided, el('p', 'privacy-note', 'Nothing is uploaded or saved.'));
    return panel;
  }

  const panel = el('div', 'record-panel');
  const recording = state.recordingState === 'recording';
  const mic = el('button', `mic-button art-frame${recording ? ' is-recording' : ''}`);
  mic.type = 'button';
  mic.dataset.target = 'record';
  mic.dataset.role = 'record';
  mic.setAttribute('aria-label', state.hasRecording ? 'Hold to record your story again' : 'Hold to record your story');
  mic.append(
    el('span', 'icon-fallback', recording ? 'Listening' : 'Hold to talk'),
    artImage(ui.mic, '', 'mic-art'),
  );
  mic.addEventListener('pointerdown', beginRecordingHold);
  mic.addEventListener('keydown', (event) => {
    if ((event.code === 'Space' || event.code === 'Enter') && !event.repeat) {
      beginRecordingHold(event);
    }
  });
  mic.addEventListener('contextmenu', (event) => event.preventDefault());
  panel.append(mic);

  const copy = el('div', 'record-copy');
  const labels = {
    idle: ['Hold to tell your story', 'Keep holding while you talk. Let go when you finish.'],
    requesting: ['Keep holding…', 'Getting the microphone ready.'],
    recording: ['I’m listening!', 'Tell your story, then let go.'],
    recorded: ['Your story is ready!', 'Hold again to make a new recording.'],
    replaying: ['Playing your story…', 'Listen to your wonderful storyteller voice.'],
  };
  const [title, detail] = labels[state.recordingState] || labels.idle;
  copy.append(el('strong', '', title), el('span', '', detail));
  panel.append(copy, el('p', 'privacy-note', 'Stays on this device. Never uploaded or saved.'));

  if (state.hasRecording) {
    const replay = actionButton(
      'replay-recording',
      state.recordingState === 'replaying' ? 'Playing…' : 'Replay my voice',
      'secondary-action',
      ui.replay,
    );
    replay.disabled = state.recordingState === 'replaying';
    replay.style.gridColumn = '1 / -1';
    panel.append(replay);
  } else if (state.recordingState === 'idle') {
    const noMic = el('button', 'another-story', 'Tell it together instead');
    noMic.type = 'button';
    noMic.dataset.target = 'speak-aloud';
    noMic.dataset.role = 'choice';
    noMic.style.gridColumn = '1 / -1';
    panel.append(noMic);
  }
  return panel;
}

function createHud({ home = false, back: withBack = false } = {}) {
  const hud = el('nav', 'hud');
  hud.setAttribute('aria-label', 'Game controls');
  const left = el('div', 'hud-side');
  const right = el('div', 'hud-side');
  if (home) {
    left.append(iconButton({
      target: 'home',
      label: 'QLOBE Kids home',
      art: ui.home,
      fallback: 'Home',
      href: '../../',
    }));
  } else if (withBack) {
    left.append(iconButton({
      target: 'back',
      label: state.screen === 'library' ? 'Back to title' : 'Back to story library',
      art: ui.back,
      fallback: 'Back',
    }));
  }
  right.append(iconButton({
    target: 'sound',
    label: state.muted ? 'Turn sound on' : 'Turn sound off',
    art: state.muted ? ui.soundOff : ui.sound,
    fallback: state.muted ? 'Sound on' : 'Sound off',
  }));
  hud.append(left, right);
  return hud;
}

function iconButton({ target, label, art, fallback, href = '' }) {
  const button = el(href ? 'a' : 'button', 'icon-button art-frame');
  if (href) button.href = href;
  else button.type = 'button';
  button.dataset.target = target;
  button.dataset.role = 'navigation';
  button.setAttribute('aria-label', label);
  button.append(
    el('span', 'icon-fallback', fallback),
    artImage(art, '', 'icon-art'),
  );
  return button;
}

function actionButton(target, label, className, art = '') {
  const button = el('button', className);
  button.type = 'button';
  button.dataset.target = target;
  button.dataset.role = target === 'continue' ? 'navigation' : 'action';
  button.setAttribute('aria-label', label.replace('…', ''));
  if (art) button.append(artImage(art, '', 'action-art'));
  button.append(el('span', '', label));
  return button;
}

function sceneImage(src, alt, className) {
  return artImage(src, alt, className);
}

function artImage(src, alt = '', className = '') {
  const image = document.createElement('img');
  image.className = `raster-art ${className}`.trim();
  image.alt = alt;
  image.draggable = false;
  image.decoding = 'async';
  image.addEventListener('load', () => {
    image.classList.add('is-loaded');
    image.closest('.art-frame')?.classList.add('has-art');
  }, { once: true });
  image.addEventListener('error', () => {
    image.classList.add('is-missing');
    image.closest('.art-frame')?.classList.add('missing-art');
  }, { once: true });
  image.src = src;
  if (image.complete) {
    queueMicrotask(() => {
      if (image.naturalWidth > 0) {
        image.classList.add('is-loaded');
        image.closest('.art-frame')?.classList.add('has-art');
      } else {
        image.classList.add('is-missing');
      }
    });
  }
  return image;
}

function el(tag, className = '', text = '') {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

let announcementId = 0;
function announce(message) {
  if (!announcer || !message) return;
  const id = ++announcementId;
  announcer.textContent = '';
  requestAnimationFrame(() => {
    if (id === announcementId) announcer.textContent = message;
  });
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/["\\]/g, '\\$&');
}

function findTarget(id) {
  return [...root.querySelectorAll('[data-target]')].find((node) => node.dataset.target === id) || null;
}

function tapTarget(id) {
  if (id === 'record') return false;
  const target = findTarget(id);
  if (!target || target.disabled) return false;
  target.click();
  return true;
}

function chooseTarget(id) {
  return tapTarget(String(id).startsWith('choice:') ? String(id) : `choice:${id}`);
}

async function completeWorld() {
  if (state.screen === 'finale') return getState();
  if (!state.worldId) startMode('forest');
  if (state.screen !== 'play') startMode(state.worldId || 'forest');
  const world = getWorld();
  if (!world) return false;
  if (state.phase.startsWith('explore')) {
    for (const hotspot of world.hotspots) {
      if (!state.discoveries.includes(hotspot.id)) {
        tapTarget(`hotspot:${hotspot.id}`);
        await Promise.resolve();
      }
    }
    tapTarget('continue');
    await Promise.resolve();
  }
  while (state.screen === 'play' && state.phase === 'choice') {
    const choices = world.choices[state.choiceStep];
    const pick = choices[Math.floor(rng() * choices.length)] || choices[0];
    tapTarget(`choice:${pick.id}`);
    await Promise.resolve();
  }
  return getState();
}
