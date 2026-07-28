import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { createMusicalCanvas } from '../../../shared/js/musical-canvas.js';

const mount = document.getElementById('game');
const announcer = document.getElementById('announcer');
const UI = {
  home: new URL('../../../shared/assets/ui/btn-home.png', import.meta.url).href,
  back: new URL('../../../shared/assets/ui/btn-back.png', import.meta.url).href,
  sound: new URL('../../../shared/assets/ui/btn-sound.png', import.meta.url).href,
};
const STORAGE_KEY = 'qlobe-sound-paintings-v1';

const state = {
  screen: 'splash',
  mode: null,
  color: null,
  strokes: 0,
  replaying: false,
  muted: false,
  fast: false,
  pendingWelcome: false,
  savedCount: 0,
  seed: 42,
};

let canvas = null;
let keepsakeCanvas = null;
let latestPainting = null;
let nudgeTimer = 0;
let disposers = [];
let audioUnlocked = false;

const ready = (async () => {
  await voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
  state.savedCount = loadGallery().length;
})();

function unlockAudio() {
  voice.unlock();
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();
  speech.unlock();
  canvas?.unlock();
  keepsakeCanvas?.unlock();
  if (state.pendingWelcome && state.screen === 'splash') {
    state.pendingWelcome = false;
    say('welcome');
  }
}
window.addEventListener('pointerdown', unlockAudio, { passive: true });

function say(key) {
  const line = config.voice[key] || '';
  announcer.textContent = line;
  if (state.muted) return Promise.resolve();
  return voice.say(key, line);
}

async function saySequence(keys) {
  for (const key of keys) {
    if (state.muted) return;
    await say(key);
  }
}

function feedback(event) {
  event?.preventDefault?.();
  unlockAudio();
  if (!state.muted) sfx.tick();
}

function clearScreen() {
  clearTimeout(nudgeTimer);
  voice.stop();
  canvas?.destroy();
  keepsakeCanvas?.destroy();
  canvas = null;
  keepsakeCanvas = null;
  for (const dispose of disposers) dispose();
  disposers = [];
}

function showSplash({ greet = true } = {}) {
  clearScreen();
  state.screen = 'splash';
  state.mode = null;
  state.strokes = 0;
  state.replaying = false;
  mount.innerHTML = `
    <section class="screen splash" aria-label="Sound Painting">
      <a class="round-button home-button" href="../../" aria-label="Back to all games"
         style="background-image:url('${UI.home}')"></a>
      <button class="round-button sound-button" type="button" data-action="welcome"
              data-target="sound-welcome" aria-label="Hear the welcome again"
              style="background-image:url('${UI.sound}')"></button>
      <header class="splash-heading">
        <h1>Sound<br>Painting</h1>
        <p>Paint what you hear</p>
      </header>
      <div class="mode-grid" role="list" aria-label="Musical brushes">
        ${config.modes.map((mode) => `
          <button class="mode-card" type="button" role="listitem"
                  data-action="start" data-value="${mode.id}" data-target="mode-${mode.id}" data-mode="${mode.id}"
                  aria-label="${mode.title}">
            <span class="mode-symbol" aria-hidden="true">${mode.symbol}</span>
            <span class="mode-title">${mode.title}</span>
          </button>`).join('')}
      </div>
      <p class="splash-note">No wrong way to paint.</p>
    </section>`;
  wireActions();
  if (!greet) return;
  ready.then(async () => {
    if (state.screen !== 'splash') return;
    const played = await voice.trySay('welcome');
    state.pendingWelcome = !played;
    if (played) audioUnlocked = true;
  });
}

async function startMode(modeId) {
  const mode = config.modes.find((candidate) => candidate.id === modeId);
  if (!mode) return false;
  await ready;
  clearScreen();
  state.screen = 'paint';
  state.mode = mode.id;
  state.color = mode.colors[0];
  state.strokes = 0;
  state.replaying = false;
  latestPainting = null;
  mount.innerHTML = `
    <section class="screen paint-screen" aria-label="${mode.title} sound canvas">
      <header class="topbar">
        <button class="round-button" type="button" data-action="back" data-target="back"
                aria-label="Back to musical brushes" style="background-image:url('${UI.back}')"></button>
        <div class="paint-title">${mode.title}</div>
        <div class="top-actions">
          <button class="icon-button" type="button" data-action="undo" data-target="undo"
                  aria-label="Undo the last mark" disabled>↶</button>
          <button class="round-button" type="button" data-action="prompt" data-target="sound-prompt"
                  aria-label="Hear the painting idea again" style="background-image:url('${UI.sound}')"></button>
        </div>
      </header>
      <div class="workbench">
        <div class="canvas-frame">
          <canvas id="paint-canvas" aria-label="Draw a ${mode.title} painting with one finger"></canvas>
          <div class="canvas-hint"><span class="finger" aria-hidden="true">●</span>Draw here to make music</div>
        </div>
        <div class="palette" role="radiogroup" aria-label="Paint colors">
          ${mode.colors.map((color, index) => `
            <button class="color-button ${index === 0 ? 'selected' : ''}" type="button"
                    role="radio" aria-checked="${index === 0}" aria-label="Color ${index + 1}"
                    data-action="color" data-value="${color}" data-target="color-${index}"
                    style="--swatch:${color}"></button>`).join('')}
        </div>
      </div>
      <footer class="paint-controls">
        <div class="control-group">
          <button class="paper-button" type="button" data-action="clear" data-target="clear"
                  aria-label="Clear the painting">Fresh<br>Paper</button>
        </div>
        <button class="play-button" type="button" data-action="play" data-target="play"
                aria-label="Play my painting" disabled>▶ Play My Painting</button>
        <div class="control-group">
          <button class="paper-button finish-button" type="button" data-action="finish" data-target="finish"
                  aria-label="Finish and save the painting" disabled>✓ Finished</button>
        </div>
      </footer>
    </section>`;

  canvas = createMusicalCanvas(document.getElementById('paint-canvas'), {
    brush: mode.brush,
    color: mode.colors[0],
    palette: mode.colors,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    onStrokeStart: () => {
      mount.querySelector('.canvas-hint')?.classList.add('fade');
      clearTimeout(nudgeTimer);
    },
    onChange: (painting) => {
      latestPainting = painting;
      state.strokes = painting.strokes.length;
      updatePaintControls();
    },
  });
  canvas.setMuted(state.muted);
  canvas.unlock();
  wireActions();
  nudgeTimer = setTimeout(() => {
    if (state.screen === 'paint' && !canvas?.hasStrokes()) say('empty');
  }, state.fast ? 300 : 6000);
  saySequence([mode.labelKey, mode.promptKey]);
  return true;
}

function updatePaintControls() {
  const has = !!canvas?.hasStrokes();
  const undo = mount.querySelector('[data-target="undo"]');
  const play = mount.querySelector('[data-target="play"]');
  const finish = mount.querySelector('[data-target="finish"]');
  if (undo) undo.disabled = !has;
  if (play) play.disabled = !has || state.replaying;
  if (finish) finish.disabled = !has || state.replaying;
  const hint = mount.querySelector('.canvas-hint');
  hint?.classList.toggle('fade', has);
}

async function playPainting(target = canvas) {
  if (!target?.hasStrokes()) {
    await say('empty');
    return false;
  }
  state.replaying = true;
  updatePaintControls();
  await say('replay');
  if (state.screen === 'paint') await target.replay({ speed: state.fast ? 5 : 1 });
  else await target.replay({ speed: state.fast ? 5 : 1 });
  state.replaying = false;
  updatePaintControls();
  return true;
}

function finishPainting() {
  if (!canvas?.hasStrokes()) {
    say('empty');
    return false;
  }
  latestPainting = canvas.snapshot();
  const saved = {
    id: `painting-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    mode: state.mode,
    painting: latestPainting,
  };
  const gallery = loadGallery();
  gallery.unshift(saved);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(gallery.slice(0, 6)));
  } catch {
    // Storage is an optional keepsake, never a gameplay dependency.
  }
  state.savedCount = Math.min(6, gallery.length);
  showKeepsake(saved);
  return true;
}

function showKeepsake(saved) {
  clearScreen();
  state.screen = 'keepsake';
  state.mode = saved.mode;
  state.replaying = false;
  mount.innerHTML = `
    <section class="screen keepsake" aria-label="Finished Sound Painting">
      <button class="round-button" type="button" data-action="back" data-target="back"
              aria-label="Back to musical brushes" style="background-image:url('${UI.back}')"></button>
      <div class="keepsake-card">
        <div class="keepsake-preview"><canvas id="keepsake-canvas" aria-label="Your finished sound painting"></canvas></div>
        <div class="keepsake-copy">
          <div class="rosette" aria-hidden="true">✦</div>
          <h2>Music we can see!</h2>
          <p>Saved on this device.</p>
          <div class="keepsake-actions">
            <button class="paper-button" type="button" data-action="replay-keepsake"
                    data-target="replay-keepsake" aria-label="Replay the painting">▶ Replay</button>
            <button class="paper-button" type="button" data-action="picture"
                    data-target="picture" aria-label="Save a picture of the painting">▣ Picture</button>
            <button class="paper-button keepsake-again" type="button" data-action="again"
                    data-target="again" aria-label="Make another Sound Painting">Make Another</button>
          </div>
        </div>
      </div>
    </section>`;
  const mode = config.modes.find((candidate) => candidate.id === saved.mode) || config.modes[0];
  keepsakeCanvas = createMusicalCanvas(document.getElementById('keepsake-canvas'), {
    brush: mode.brush,
    color: mode.colors[0],
    palette: mode.colors,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });
  keepsakeCanvas.load(saved.painting);
  keepsakeCanvas.setMuted(state.muted);
  wireActions();
  if (!state.muted) sfx.tada();
  saySequence(['saved', 'done']);
}

function loadGallery() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(value) ? value.filter((item) => item?.painting?.format === 'qlobe-musical-painting') : [];
  } catch {
    return [];
  }
}

function wireActions() {
  for (const element of mount.querySelectorAll('[data-action]')) {
    disposers.push(onTap(element, () => route(element.dataset.action, element.dataset.value), { feedback }));
  }
}

async function route(action, value) {
  if (action === 'start') return startMode(value);
  if (action === 'back' || action === 'again') return showSplash({ greet: false });
  if (action === 'welcome') return say('welcome');
  if (action === 'prompt') {
    const mode = config.modes.find((candidate) => candidate.id === state.mode);
    return mode && say(mode.promptKey);
  }
  if (action === 'color') {
    state.color = value;
    canvas?.setColor(value);
    for (const button of mount.querySelectorAll('.color-button')) {
      const selected = button.dataset.value === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-checked', String(selected));
    }
    if (!state.muted) canvas?.previewColor(value);
    return true;
  }
  if (action === 'undo') {
    const changed = canvas?.undo() || canvas?.restoreLastClear();
    if (changed && !state.muted) sfx.unpop();
    return changed;
  }
  if (action === 'clear') {
    const changed = canvas?.clear();
    if (changed) {
      if (!state.muted) sfx.whoosh();
      say('clear');
    }
    return changed;
  }
  if (action === 'play') return playPainting(canvas);
  if (action === 'finish') return finishPainting();
  if (action === 'replay-keepsake') return playPainting(keepsakeCanvas);
  if (action === 'picture') {
    keepsakeCanvas?.exportPng(`sound-painting-${state.mode}.png`);
    if (!state.muted) sfx.sparkle();
    return true;
  }
  return false;
}

function targets() {
  return [...mount.querySelectorAll('[data-target]')].filter((element) => !element.disabled).map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      id: element.dataset.target,
      role: 'neutral',
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
    };
  });
}

window.QLOBE_DEBUG = {
  version: 1,
  gameId: config.id,
  engine: 'custom-musical-canvas',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    strokes: state.strokes,
    replaying: state.replaying,
    awaitingInput: state.screen === 'splash' || (state.screen === 'paint' && !state.replaying),
    savedCount: state.savedCount,
  }),
  getTargets: targets,
  tap: async (targetId) => {
    const element = mount.querySelector(`[data-target="${CSS.escape(targetId)}"]`);
    if (!element || element.disabled) return { accepted: false };
    await route(element.dataset.action, element.dataset.value);
    return { accepted: true };
  },
  drawStroke: (points) => {
    if (state.screen !== 'paint' || !canvas) return false;
    canvas.debugStroke(points);
    return true;
  },
  loadPainting: (painting) => {
    if (state.screen !== 'paint' || !canvas) return false;
    canvas.load(painting);
    return true;
  },
  replayPainting: (options) => {
    if (state.screen !== 'paint' || !canvas) return Promise.resolve(false);
    return canvas.replay(options);
  },
  winRound: async () => {
    if (state.screen === 'splash') await startMode(config.modes[0].id);
    if (state.screen === 'paint' && !canvas.hasStrokes()) canvas.debugStroke();
    if (state.screen === 'paint') finishPainting();
  },
  mute: (value = true) => {
    state.muted = !!value;
    voice.stop();
    canvas?.setMuted(state.muted);
    keepsakeCanvas?.setMuted(state.muted);
    return state.muted;
  },
  seed: (value) => { state.seed = Number(value) || 42; return state.seed; },
  fastTimer: (value = true) => { state.fast = !!value; return state.fast; },
  clearSaved: () => { localStorage.removeItem(STORAGE_KEY); state.savedCount = 0; },
};

window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('gesturestart', (event) => event.preventDefault());
showSplash();
