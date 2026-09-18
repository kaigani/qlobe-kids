import config from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installKioskGuards, installUnlockOnGesture } from '../../../shared/js/audio-unlock.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { tada } from '../../../shared/js/celebrate.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';

const root = document.getElementById('game');
const narrator = createNarrator();
const screens = createScreens({
  root,
  initial: 'splash',
  splash: 'splash',
  voice: narrator,
});
const timers = createTimers();

let random = mulberry32(0x5ce17);
let dragController = null;
let cancelCelebration = null;

const state = {
  screen: 'splash',
  phase: 'splash',
  modeId: null,
  round: 0,
  completed: [],
  available: [],
  selectionIds: [],
  currentId: null,
  choiceIds: [],
  selectedId: null,
  misses: 0,
  wrongId: null,
  inputLocked: false,
  muted: false,
  seed: 0x5ce17,
  runToken: 0,
  currentCue: 'welcome',
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  artFailures: [],
};

const allArt = [
  ...Object.values(config.assets),
  ...config.modes.map((entry) => entry.art),
  ...config.scents.flatMap((entry) => [entry.lid, entry.token, entry.plume]),
].filter((value) => typeof value === 'string');

bgm.preload(config.music.track);
const ready = Promise.all([
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(allArt),
]).catch((error) => {
  console.warn('[smell-jars] preload degraded gracefully', error);
});

root.addEventListener('error', (event) => {
  const node = event.target;
  if (!(node instanceof HTMLImageElement)) return;
  const src = node.currentSrc || node.src || 'unknown';
  if (!state.artFailures.includes(src)) state.artFailures.push(src);
}, true);

function mode() {
  return config.modes.find((entry) => entry.id === state.modeId) || config.modes[0];
}

function scent(id = state.currentId) {
  return config.scents.find((entry) => entry.id === id) || config.scents[0];
}

function image(src, className, alt = '') {
  return `<img class="${className}" src="${src}" alt="${alt}" draggable="false" />`;
}

function worldMarkup() {
  return `
    <picture class="apothecary-world" aria-hidden="true">
      <source media="(orientation: portrait)" srcset="${config.assets.environmentPortrait}" />
      <img src="${config.assets.environmentWide}" alt="" draggable="false" />
    </picture>
    <div class="world-glow" aria-hidden="true"></div>
  `;
}

function promptMarkup(text, className = '') {
  return `
    <div class="wood-prompt ${className}" aria-hidden="true">
      ${image(config.assets.buttonPlaque, 'wood-prompt-art')}
      <span>${text}</span>
    </div>
  `;
}

function cleanupScene() {
  timers.clearAll();
  nudge.stop();
  if (dragController) {
    dragController.cancel();
    dragController.detach();
    dragController = null;
  }
  if (cancelCelebration) {
    cancelCelebration();
    cancelCelebration = null;
  }
}

function holdTap(node, fn) {
  if (!node) return;
  screens.hold(onTap(node, (event) => {
    nudge.poke();
    fn(event);
  }));
}

function addHomeHud(screen) {
  const home = hudButton('home', () => {
    window.location.href = '../../';
  }, { label: 'Back to QLOBE Kids' });
  home.classList.add('qk-hud-top-left');
  home.dataset.target = 'home';
  home.dataset.role = 'neutral';
  screen.append(home);
  screens.hold(home.dispose);

  const sound = hudButton('sound', soundDebounce(() => speak('welcome'), 650), {
    label: 'Hear the welcome again',
  });
  sound.classList.add('qk-hud-top-right');
  sound.dataset.target = 'sound';
  sound.dataset.role = 'neutral';
  screen.append(sound);
  screens.hold(sound.dispose);
}

function addPlayHud(screen) {
  const bar = document.createElement('div');
  bar.className = 'qk-hud-bar smell-hud';

  const back = hudButton('back', () => goSplash({ speakWelcome: true }), {
    label: 'Back to game choice',
  });
  back.dataset.target = 'back';
  back.dataset.role = 'neutral';

  const dots = progressDots(config.rounds, state.completed.length);
  dots.classList.add('smell-progress');

  const sound = hudButton('sound', soundDebounce(repeatCue, 650), {
    label: 'Hear the clue again',
  });
  sound.dataset.target = 'sound';
  sound.dataset.role = 'neutral';

  bar.append(back, dots, sound);
  screen.append(bar);
  screens.hold(back.dispose, sound.dispose);
}

function addEndHud(screen) {
  const back = hudButton('back', () => goSplash({ speakWelcome: true }), {
    label: 'Back to game choice',
  });
  back.classList.add('qk-hud-top-left');
  back.dataset.target = 'back';
  back.dataset.role = 'neutral';
  screen.append(back);
  screens.hold(back.dispose);

  const sound = hudButton('sound', soundDebounce(() => speak('end'), 650), {
    label: 'Hear the celebration again',
  });
  sound.classList.add('qk-hud-top-right');
  sound.dataset.target = 'sound';
  sound.dataset.role = 'neutral';
  screen.append(sound);
  screens.hold(sound.dispose);
}

function speak(key) {
  if (!key || !config.voice[key]) return Promise.resolve();
  state.currentCue = key;
  return bgm.duckDuring(narrator.say(key, config.voice[key]));
}

function repeatCue() {
  return speak(state.currentCue || 'select');
}

function renderSplash({ speakWelcome = false } = {}) {
  state.runToken += 1;
  cleanupScene();
  state.screen = 'splash';
  state.phase = 'splash';
  state.inputLocked = false;
  state.currentCue = 'welcome';
  screens.show('splash', { force: screens.current === 'splash' });

  const screen = screens.el('splash');
  screen.className = 'qk-screen smell-screen splash-screen';
  screen.innerHTML = `
    ${worldMarkup()}
    <div class="splash-stage">
      ${image(config.assets.title, 'title-art', 'Smell Jars')}
      <p class="eyebrow">Choose a nose game</p>
      <div class="mode-deck">
        ${config.modes.map((entry) => `
          <button
            class="mode-card"
            type="button"
            data-mode="${entry.id}"
            data-target="mode-${entry.id}"
            data-role="neutral"
            aria-label="${entry.title}. ${entry.description}"
          >
            ${image(entry.art, 'mode-art', '')}
            <span class="mode-copy">
              <strong>${entry.title}</strong>
              <small>${entry.description}</small>
            </span>
          </button>
        `).join('')}
      </div>
    </div>
  `;

  addHomeHud(screen);
  screen.querySelectorAll('[data-mode]').forEach((button) => {
    holdTap(button, () => startMode(button.dataset.mode));
  });
  if (speakWelcome) speak('welcome');
}

async function startMode(modeId) {
  const pickedMode = config.modes.find((entry) => entry.id === modeId);
  if (!pickedMode) return false;
  return screens.start(async () => {
    state.runToken += 1;
    cleanupScene();
    state.modeId = modeId;
    state.round = 0;
    state.completed = [];
    state.available = shuffle(config.scents.map((entry) => entry.id), random);
    state.currentId = null;
    state.choiceIds = [];
    state.selectedId = null;
    state.misses = 0;
    state.wrongId = null;
    state.inputLocked = false;
    prepareSelection();

    bgm.setVolume(config.music.volume);
    bgm.play(config.music.track, {
      key: 'smell-jars-workshop',
      fadeInMs: 700,
      fadeOutMs: 450,
      loopFadeOutMs: 2200,
    });
    await ready;
    renderPlay();
    state.currentCue = 'select';
    bgm.duckDuring(narrator.saySequence([
      { key: pickedMode.voice, text: config.voice[pickedMode.voice] },
      { key: 'select', text: config.voice.select, gap: 220 },
    ]));
    return true;
  }, { busy: false });
}

function prepareSelection() {
  state.phase = 'select';
  state.screen = 'play';
  state.round = state.completed.length;
  state.currentId = null;
  state.choiceIds = [];
  state.selectionIds = shuffle(state.available, random).slice(0, 3);
  state.selectedId = null;
  state.misses = 0;
  state.wrongId = null;
  state.inputLocked = false;
  state.currentCue = state.completed.length ? 'next' : 'select';
}

function renderPlay() {
  cleanupScene();
  state.screen = 'play';
  screens.show('play', { force: screens.current === 'play' });
  const screen = screens.el('play');
  screen.className = `qk-screen smell-screen play-screen phase-${state.phase} mode-${state.modeId}`;

  if (state.phase === 'select') renderSelection(screen);
  else if (state.phase === 'success') renderSuccess(screen);
  else renderJarScene(screen);

  addPlayHud(screen);
  if (state.phase === 'select' || state.phase === 'closed' || state.phase === 'match') {
    nudge.arm();
  }
}

function renderSelection(screen) {
  screen.innerHTML = `
    ${worldMarkup()}
    <div class="selection-stage">
      ${promptMarkup('Pick a mystery jar', 'selection-prompt')}
      <div class="mystery-shelf" aria-label="Mystery smell jars">
        ${image(config.assets.tray, 'selection-tray')}
        <div class="mystery-row">
          ${state.selectionIds.map((id, index) => {
            const entry = scent(id);
            return `
              <button
                class="mystery-jar"
                type="button"
                data-jar-id="${id}"
                data-target="mystery-${index + 1}"
                data-role="neutral"
                aria-label="Mystery jar ${index + 1}"
                style="--jar-accent:${entry.accent}"
              >
                <span class="mini-jar-stack" aria-hidden="true">
                  ${image(config.assets.jar, 'mini-jar-body')}
                  ${image(entry.lid, 'mini-jar-lid')}
                  ${image(config.assets.spark, 'mini-spark')}
                </span>
              </button>
            `;
          }).join('')}
        </div>
      </div>
      <p class="gesture-note">Tap a lid to begin</p>
    </div>
  `;

  screen.querySelectorAll('[data-jar-id]').forEach((button) => {
    holdTap(button, () => chooseMystery(button.dataset.jarId));
  });
}

function chooseMystery(id) {
  if (state.phase !== 'select' || state.inputLocked || !state.selectionIds.includes(id)) return false;
  const pickedMode = mode();
  state.currentId = id;
  state.choiceIds = shuffle([
    id,
    ...shuffle(config.scents.filter((entry) => entry.id !== id), random)
      .slice(0, pickedMode.choices - 1)
      .map((entry) => entry.id),
  ], random);
  state.selectedId = null;
  state.misses = 0;
  state.phase = 'closed';
  state.currentCue = 'open';
  renderPlay();
  speak('open');
  return true;
}

function jarMarkup(entry) {
  const plumeVisible = ['opening', 'scent', 'match'].includes(state.phase);
  const lidOnJar = ['closed', 'opening'].includes(state.phase);
  const memoryFaded = mode().memory && state.phase === 'match';
  return `
    <div class="hero-jar" style="--jar-accent:${entry.accent}">
      ${plumeVisible ? image(entry.plume, `scent-plume${memoryFaded ? ' is-memory-faded' : ''}`) : ''}
      <div class="hero-jar-stack" aria-hidden="true">
        ${image(config.assets.jar, 'hero-jar-body')}
        ${lidOnJar ? image(entry.lid, 'hero-jar-lid') : ''}
      </div>
      ${state.phase === 'closed' ? `
        <button
          class="lid-control"
          type="button"
          data-target="lid"
          data-role="neutral"
          aria-label="Lift the mystery jar lid"
        ></button>
      ` : ''}
      ${state.phase === 'match' ? `
        ${image(entry.lid, 'landed-lid')}
        <button
          class="jar-label-slot${state.selectedId ? ' has-token' : ''}"
          type="button"
          data-slot="jar-label"
          data-target="jar-label"
          data-role="neutral"
          aria-label="${state.selectedId ? `Match ${scent(state.selectedId).title} to the jar` : 'Put a picture token on the jar'}"
        >
          ${state.selectedId ? image(scent(state.selectedId).token, 'slot-token') : image(config.assets.spark, 'slot-spark')}
        </button>
      ` : ''}
      ${state.phase === 'opening' ? image(config.assets.spark, 'opening-spark') : ''}
    </div>
  `;
}

function choicesMarkup() {
  if (state.phase !== 'match') return '';
  return `
    <div class="token-dock" aria-label="Scent picture choices">
      ${state.choiceIds.map((id) => {
        const entry = scent(id);
        return `
          <button
            class="scent-token${state.selectedId === id ? ' is-selected' : ''}${state.misses >= 2 && id === state.currentId ? ' is-hint' : ''}"
            type="button"
            data-scent-id="${id}"
            data-target="token-${id}"
            data-role="${id === state.currentId ? 'correct' : 'wrong'}"
            aria-label="${entry.title} picture"
            aria-pressed="${state.selectedId === id}"
            style="--token-accent:${entry.accent}"
          >
            ${image(entry.token, 'scent-token-art')}
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderJarScene(screen) {
  const entry = scent();
  const prompts = {
    closed: 'Lift the lid',
    opening: 'Sniff the swirl',
    scent: 'Remember this scent',
    match: state.selectedId ? 'Tap the jar' : 'Pick a picture',
  };
  screen.innerHTML = `
    ${worldMarkup()}
    <div class="jar-scene">
      ${promptMarkup(prompts[state.phase] || 'Follow the scent', 'jar-prompt')}
      <div class="jar-workbench">
        ${image(config.assets.tray, 'hero-tray')}
        ${jarMarkup(entry)}
      </div>
      ${choicesMarkup()}
      ${state.phase === 'match' ? '<p class="gesture-note match-note">Tap a picture, then the jar — or drag it there</p>' : ''}
    </div>
  `;

  const lid = screen.querySelector('.lid-control');
  if (lid) holdTap(lid, openJar);

  const slot = screen.querySelector('.jar-label-slot');
  if (slot) {
    holdTap(slot, () => {
      if (state.selectedId) attemptScent(state.selectedId);
      else {
        slot.classList.add('needs-token');
        timers.after(600, () => slot.classList.remove('needs-token'));
        speak(mode().memory ? 'memory-choose' : 'choose');
      }
    });
  }

  if (state.phase === 'match') wireTokens(screen);
}

async function openJar() {
  if (state.phase !== 'closed' || state.inputLocked) return false;
  const run = state.runToken;
  state.inputLocked = true;
  state.phase = 'opening';
  renderPlay();
  sfx.whoosh();

  await timers.wait(state.reducedMotion ? 80 : 760);
  if (run !== state.runToken || state.phase !== 'opening') return false;

  if (mode().memory) {
    state.phase = 'scent';
    renderPlay();
    sfx.sparkle();
    // Reduced motion removes movement, not observation time. Keep the static
    // clue up long enough for a young player to encode it before memory play.
    await timers.wait(state.reducedMotion ? 1600 : 1450);
    if (run !== state.runToken || state.phase !== 'scent') return false;
  }

  state.phase = 'match';
  state.inputLocked = false;
  state.selectedId = null;
  renderPlay();
  speak(mode().memory ? 'memory-choose' : 'choose');
  return true;
}

function wireTokens(screen) {
  dragController = createDragToSlotDom({
    root: screen,
    ghostHost: screen,
    slotSelector: '[data-slot="jar-label"]',
    slotPad: 42,
    hoverClass: 'is-hovered',
    ghostClass: 'qk-drag-ghost scent-drag-ghost',
    grabOffset: 0.2,
    getPiece(id) {
      const element = screen.querySelector(`[data-scent-id="${id}"]`);
      return element ? { id, el: element } : null;
    },
    canStart: () => state.phase === 'match' && !state.inputLocked,
    onGrab() {
      nudge.poke();
      return true;
    },
    onLift(piece) {
      piece.el.classList.add('is-lifting');
      sfx.whoosh();
    },
    onDrop: async (piece, drag) => {
      piece.el?.classList.remove('is-lifting');
      if (drag.slot) await attemptScent(piece.id);
      else {
        selectToken(piece.id);
        const live = screen.querySelector(`[data-scent-id="${piece.id}"]`);
        live?.classList.add('is-returning');
        timers.after(420, () => live?.classList.remove('is-returning'));
      }
    },
    onCancel(piece) {
      piece.el?.classList.remove('is-lifting');
    },
    onTap(piece) {
      selectToken(piece.id);
    },
  });

  screens.hold(() => {
    dragController?.cancel();
    dragController?.detach();
    dragController = null;
  });

  screen.querySelectorAll('[data-scent-id]').forEach((button) => {
    const pointerDown = (event) => dragController?.begin(event, button.dataset.scentId);
    const keyboardActivate = (event) => {
      if (event.type === 'click' && event.detail !== 0) return;
      if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
      if (event.type === 'keydown') event.preventDefault();
      selectToken(button.dataset.scentId);
    };
    button.addEventListener('pointerdown', pointerDown);
    button.addEventListener('keydown', keyboardActivate);
    button.addEventListener('click', keyboardActivate);
    screens.hold(() => {
      button.removeEventListener('pointerdown', pointerDown);
      button.removeEventListener('keydown', keyboardActivate);
      button.removeEventListener('click', keyboardActivate);
    });
  });
}

function selectToken(id) {
  if (state.phase !== 'match' || state.inputLocked || !state.choiceIds.includes(id)) return false;
  state.selectedId = id;
  state.wrongId = null;
  sfx.tick();
  const screen = screens.el('play');
  screen.querySelectorAll('[data-scent-id]').forEach((button) => {
    const selected = button.dataset.scentId === id;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const slot = screen.querySelector('.jar-label-slot');
  if (slot) {
    slot.classList.add('has-token');
    slot.classList.remove('needs-token');
    slot.innerHTML = image(scent(id).token, 'slot-token');
    slot.setAttribute('aria-label', `Match ${scent(id).title} to the jar`);
  }
  return true;
}

async function attemptScent(id) {
  if (state.phase !== 'match' || state.inputLocked || !state.choiceIds.includes(id)) return false;
  nudge.poke();
  if (id !== state.currentId) {
    state.misses += 1;
    state.wrongId = id;
    state.selectedId = null;
    sfx.silly();

    const screen = screens.el('play');
    const wrong = screen.querySelector(`[data-scent-id="${id}"]`);
    wrong?.classList.remove('is-selected');
    wrong?.classList.add('is-wrong');
    wrong?.setAttribute('aria-pressed', 'false');
    const slot = screen.querySelector('.jar-label-slot');
    if (slot) {
      slot.classList.remove('has-token');
      slot.innerHTML = image(config.assets.spark, 'slot-spark');
      slot.setAttribute('aria-label', 'Put a picture token on the jar');
    }
    if (state.misses >= 2) {
      screen.querySelector(`[data-scent-id="${state.currentId}"]`)?.classList.add('is-hint');
      screen.querySelector('.scent-plume')?.classList.add('clue-again');
    }
    const cue = state.misses >= 2 ? 'retry-two' : 'retry-one';
    speak(cue);
    timers.after(850, () => wrong?.classList.remove('is-wrong'));
    timers.after(1350, () => screen.querySelector('.scent-plume')?.classList.remove('clue-again'));
    return false;
  }

  state.inputLocked = true;
  state.phase = 'success';
  state.selectedId = id;
  state.completed.push(id);
  state.available = state.available.filter((entry) => entry !== id);
  state.round = state.completed.length;
  renderPlay();
  const screen = screens.el('play');
  cancelCelebration = tada({
    host: screen,
    count: 22,
    duration: state.reducedMotion ? 0 : 1800,
    rng: random,
    palette: ['#f3c94a', '#81b985', '#a88acb', '#e78969', '#fbf3d4'],
    drift: 70,
  });
  speak(scent(id).successVoice);
  return true;
}

function renderSuccess(screen) {
  const entry = scent();
  screen.innerHTML = `
    ${worldMarkup()}
    <div class="success-stage" style="--jar-accent:${entry.accent}">
      ${image(config.assets.sun, 'success-sun')}
      ${image(config.assets.spark, 'success-spark spark-one')}
      ${image(config.assets.spark, 'success-spark spark-two')}
      <div class="success-jar">
        ${image(entry.plume, 'success-plume')}
        ${image(config.assets.jar, 'success-jar-body')}
        ${image(entry.token, 'success-token')}
        ${image(config.assets.check, 'success-check')}
      </div>
      <div class="success-copy" aria-live="polite">
        <h1>${entry.title}!</h1>
        <p>${entry.descriptor}</p>
      </div>
      <button class="plaque-button" type="button" data-target="next" data-role="neutral" aria-label="${state.completed.length >= config.rounds ? 'See my smell shelf' : 'Next mystery jar'}">
        ${image(config.assets.buttonPlaque, 'plaque-art')}
        <span>${state.completed.length >= config.rounds ? 'My Smell Shelf' : 'Next Jar'}</span>
      </button>
    </div>
  `;
  holdTap(screen.querySelector('[data-target="next"]'), nextRound);
}

function nextRound() {
  if (state.phase !== 'success') return false;
  state.runToken += 1;
  if (state.completed.length >= config.rounds) {
    showEnd({ speakEnd: true });
    return true;
  }
  prepareSelection();
  renderPlay();
  speak('next');
  return true;
}

function showEnd({ speakEnd = false } = {}) {
  state.runToken += 1;
  cleanupScene();
  state.screen = 'end';
  state.phase = 'end';
  state.inputLocked = false;
  state.currentCue = 'end';
  screens.show('end', { force: screens.current === 'end' });
  const screen = screens.el('end');
  screen.className = 'qk-screen smell-screen end-screen';
  screen.innerHTML = `
    ${worldMarkup()}
    <div class="end-stage">
      ${image(config.assets.sun, 'end-sun')}
      <div class="end-shelf" aria-label="Your four matched smells">
        ${image(config.assets.tray, 'end-tray')}
        <div class="end-token-row">
          ${state.completed.map((id) => image(scent(id).token, 'end-token', scent(id).title)).join('')}
        </div>
      </div>
      <div class="end-copy">
        <h1>Super Sniffer!</h1>
        <p>You matched every mystery smell.</p>
      </div>
      <button class="plaque-button end-again" type="button" data-target="again" data-role="neutral" aria-label="Play this nose game again">
        ${image(config.assets.buttonPlaque, 'plaque-art')}
        <span>Play Again</span>
      </button>
    </div>
  `;
  addEndHud(screen);
  holdTap(screen.querySelector('[data-target="again"]'), () => startMode(state.modeId));
  cancelCelebration = tada({
    host: screen,
    count: 34,
    duration: state.reducedMotion ? 0 : 2500,
    rng: random,
    palette: ['#f3c94a', '#81b985', '#a88acb', '#e78969', '#fbf3d4'],
    drift: 95,
  });
  if (speakEnd) speak('end');
}

function goSplash({ speakWelcome = false } = {}) {
  bgm.stop({ fadeOutMs: 500 });
  renderSplash({ speakWelcome });
}

function nudgeCurrent() {
  if (state.screen !== 'play' || state.inputLocked) return;
  const screen = screens.el('play');
  if (state.phase === 'select') {
    screen.querySelector('.mystery-jar')?.classList.add('is-nudged');
    timers.after(900, () => screen.querySelector('.mystery-jar')?.classList.remove('is-nudged'));
    speak(state.currentCue || 'select');
  } else if (state.phase === 'closed') {
    screen.querySelector('.lid-control')?.classList.add('is-nudged');
    timers.after(900, () => screen.querySelector('.lid-control')?.classList.remove('is-nudged'));
    speak('open');
  } else if (state.phase === 'match') {
    const target = state.selectedId
      ? screen.querySelector('.jar-label-slot')
      : screen.querySelector('.scent-token');
    target?.classList.add('is-nudged');
    timers.after(900, () => target?.classList.remove('is-nudged'));
    speak(mode().memory ? 'memory-choose' : 'choose');
  }
}

const nudge = createNudger({
  first: 9000,
  repeat: 10500,
  onNudge: nudgeCurrent,
});

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  document.querySelectorAll('audio, video').forEach((node) => {
    node.muted = state.muted;
  });
  return state.muted;
}

async function debugTap(id) {
  if (id.startsWith('mode-')) return startMode(id.slice(5));
  if (id.startsWith('mystery-')) {
    const index = Number(id.split('-').at(-1)) - 1;
    return chooseMystery(state.selectionIds[index]);
  }
  if (id === 'lid') return openJar();
  if (id.startsWith('token-')) return selectToken(id.slice(6));
  if (id === 'jar-label') return state.selectedId ? attemptScent(state.selectedId) : false;
  if (id === 'next') return nextRound();
  if (id === 'again') return startMode(state.modeId);
  if (id === 'back') {
    goSplash({ speakWelcome: false });
    return true;
  }
  if (id === 'sound') {
    repeatCue();
    return true;
  }
  const node = root.querySelector(`[data-target="${CSS.escape(id)}"]`);
  if (!node) return false;
  node.click();
  return true;
}

installDebug({
  gameId: config.id,
  engine: 'custom-dom',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    ...state,
    completed: [...state.completed],
    available: [...state.available],
    selectionIds: [...state.selectionIds],
    choiceIds: [...state.choiceIds],
    mode: mode().id,
  }),
  getTargets: () => collectTargets(root),
  tap: debugTap,
  openJar,
  chooseScent: (id) => (state.phase === 'match' ? attemptScent(id) : false),
  next: nextRound,
  winRound: async () => {
    if (state.phase === 'select') chooseMystery(state.selectionIds[0]);
    if (state.phase === 'closed') {
      state.phase = 'match';
      state.inputLocked = false;
      renderPlay();
    }
    if (state.phase === 'opening' || state.phase === 'scent') {
      state.phase = 'match';
      state.inputLocked = false;
      renderPlay();
    }
    return attemptScent(state.currentId);
  },
  home: () => goSplash({ speakWelcome: false }),
  mute: setMuted,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  onSeed: (nextRandom, seed) => {
    random = nextRandom;
    state.seed = seed;
  },
  getAudioLog: voiceClips.getAudioLog,
  getArtFailures: () => [...state.artFailures],
  getLayout: () => ({
    width: innerWidth,
    height: innerHeight,
    orientation: matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape',
    screen: state.screen,
    phase: state.phase,
  }),
});

installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => {
    if (state.screen === 'splash') speak('welcome');
  },
});
installKioskGuards();

window.addEventListener('pagehide', () => {
  cleanupScene();
  narrator.stop();
  bgm.stop({ fadeOutMs: 0 });
});

renderSplash();
