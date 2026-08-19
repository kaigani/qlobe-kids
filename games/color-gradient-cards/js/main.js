import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';

const mount = document.getElementById('game');
const screens = createScreens({ root: mount, initial: 'splash', splash: 'splash' });
const timers = createTimers();
const narrator = createNarrator();
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  screen: 'splash',
  mode: null,
  phase: 'splash',
  round: 0,
  family: null,
  selected: null,
  busy: false,
  muted: false,
  reducedMotion: reduceQuery.matches,
  seed: 42,
  placed: [],
  spectrumCards: [],
  lastPlaced: null,
  mixerWells: [],
  mixerBridge: null,
  completedBridges: [],
  safariDeck: [],
  safariChoices: [],
  safariMatch: null,
};

let rng = mulberry32(state.seed);
let drag = null;
let interactionDisposers = [];
let stopConfetti = null;
let pendingWelcome = true;
let toneContext = null;
const artFailures = [];

const artUrls = collectArtUrls(config);
const ready = Promise.all([
  voice.init(config.audio.manifest, config.audio.lines, config.voice).catch(() => undefined),
  preloadImages(artUrls).then(() => auditArt(artUrls)),
]).then(() => renderSplash());

installKioskGuards();
installUnlockOnGesture({
  extra: [unlockTone],
  onFirst: () => {
    if (!pendingWelcome) return;
    ready.then(() => {
      if (!pendingWelcome || state.screen !== 'splash') return;
      pendingWelcome = false;
      say('welcome');
    });
  },
});
reduceQuery.addEventListener?.('change', (event) => {
  state.reducedMotion = event.matches;
});

function cancelActiveDrag() {
  drag?.cancel();
}

window.addEventListener('resize', cancelActiveDrag);
window.addEventListener('orientationchange', cancelActiveDrag);

const nudger = createNudger({
  first: 11000,
  repeat: 11000,
  onNudge: () => idleNudge(),
});

function collectArtUrls(value, into = []) {
  if (typeof value === 'string' && /\.(?:webp|png|jpe?g)$/i.test(value)) into.push(value);
  else if (Array.isArray(value)) value.forEach((item) => collectArtUrls(item, into));
  else if (value && typeof value === 'object') Object.values(value).forEach((item) => collectArtUrls(item, into));
  return [...new Set(into)];
}

function auditArt(urls) {
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => {
      artFailures.push({ url, reason: 'failed' });
      console.warn(`Color Gradient Cards art failed: ${url}`);
      resolve();
    };
    image.src = url;
  })));
}

function say(key) {
  return narrator.say(key, config.voice[key]);
}

function saySequence(...keys) {
  return narrator.saySequence(keys.map((key) => ({ key, text: config.voice[key] })));
}

function img(src, alt = '', className = '') {
  return `<img class="${className}" src="${src}" alt="${alt}" draggable="false">`;
}

function makeButtonImage(src, alt = '') {
  const image = document.createElement('img');
  image.src = src;
  image.alt = alt;
  image.draggable = false;
  return image;
}

function register(disposer) {
  if (typeof disposer === 'function') interactionDisposers.push(disposer);
  return disposer;
}

function wireTap(element, action, { quiet = false } = {}) {
  if (!element) return;
  register(onTap(element, action, {
    feedback: (event) => {
      event.preventDefault?.();
      if (!quiet && !state.muted) sfx.tick();
    },
  }));
}

function resetWiring() {
  drag?.detach();
  drag = null;
  for (const dispose of interactionDisposers.splice(0)) {
    try { dispose(); } catch { /* stale controls are already gone */ }
  }
  document.querySelectorAll('[data-qk-drag-ghost], .gradient-confetti').forEach((node) => node.remove());
}

function clearFlow() {
  resetWiring();
  timers.clearAll();
  nudger.stop();
  narrator.stop();
  stopConfetti?.();
  stopConfetti = null;
}

function setBackdrop(screen) {
  screen.style.backgroundImage = `url('${config.assets.backdrop}')`;
}

function makeHud({ back, prompt, total = 0, done = 0, backLabel = 'Back' }) {
  const hud = document.createElement('div');
  hud.className = 'atelier-hud';
  const backButton = hudButton('back', back, { label: backLabel });
  backButton.classList.add('qk-hud-top-left');
  backButton.dataset.target = 'back';
  backButton.style.backgroundImage = `url('${config.assets.back}')`;
  const sound = hudButton('sound', soundDebounce(() => say(prompt)), { label: 'Hear directions again' });
  sound.classList.add('qk-hud-bottom-left');
  sound.dataset.target = 'sound';
  sound.style.backgroundImage = `url('${config.assets.sound}')`;
  hud.append(backButton, sound);
  register(backButton.dispose);
  register(sound.dispose);
  if (total > 0) {
    const dots = progressDots(total, done);
    dots.classList.add('atelier-progress');
    hud.append(dots);
  }
  return hud;
}

function playButton(label, action, target = 'next') {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'paper-play-button';
  button.dataset.target = target;
  button.setAttribute('aria-label', label);
  button.style.backgroundImage = `url('${config.assets.playButton}')`;
  button.innerHTML = `<span>${label}</span>`;
  wireTap(button, action);
  return button;
}

function renderSplash() {
  clearFlow();
  Object.assign(state, {
    screen: 'splash', mode: null, phase: 'splash', round: 0, family: null,
    selected: null, busy: false, placed: [], spectrumCards: [], lastPlaced: null,
    mixerWells: [], mixerBridge: null, completedBridges: [], safariDeck: [],
    safariChoices: [], safariMatch: null,
  });
  screens.show('splash', { force: true });
  const screen = screens.el('splash');
  setBackdrop(screen);
  screen.innerHTML = `
    <a class="splash-home paper-icon" href="../../" data-target="home" aria-label="Back to all games">
      ${img(config.assets.home, '')}
    </a>
    <header class="splash-title">${img(config.assets.title, config.title, 'title-art')}</header>
    <p class="paper-kicker">Choose a color adventure</p>
    <div class="mode-grid" role="list" aria-label="Choose a color adventure"></div>`;
  const rendered = renderModeCards({
    host: screen.querySelector('.mode-grid'),
    modes: config.modes,
    skin: false,
    cardClass: 'paper-mode-card',
    showTitle: false,
    art: () => null,
    label: (mode) => `${mode.title}. ${mode.description}`,
    decorate(button, mode) {
      button.insertAdjacentHTML('beforeend', img(mode.art, '', 'mode-art'));
      const copy = document.createElement('span');
      copy.className = 'mode-copy';
      copy.innerHTML = `<strong>${mode.title}</strong><small>${mode.description}</small>`;
      button.append(copy);
    },
    onPick: (id) => startMode(id),
  });
  register(rendered.dispose);
}

function startMode(id) {
  const mode = config.modes.find((entry) => entry.id === id);
  if (!mode || state.busy) return false;
  clearFlow();
  pendingWelcome = false;
  Object.assign(state, {
    mode: id,
    round: 0,
    family: null,
    selected: null,
    busy: false,
    placed: [],
    spectrumCards: [],
    lastPlaced: null,
    mixerWells: [],
    mixerBridge: null,
    completedBridges: [],
    safariDeck: [],
    safariChoices: [],
    safariMatch: null,
  });
  if (id === 'spectrum') {
    state.phase = 'family-picker';
    renderFamilyPicker();
    saySequence(mode.voice, 'choose-family');
  } else if (id === 'mixer') {
    state.phase = 'mixer-pick';
    state.mixerWells = [null, null];
    state.mixerBridge = null;
    state.completedBridges = [];
    renderMixer();
    saySequence(mode.voice, 'mixer-prompt');
  } else {
    state.phase = 'safari-pick';
    state.safariDeck = shuffle(config.safari.objects, rng).slice(0, config.safari.rounds);
    state.safariMatch = null;
    prepareSafariChoices();
    renderSafari();
    saySequence(mode.voice, currentSafari().voice);
  }
  return true;
}

function renderFamilyPicker() {
  clearFlow();
  state.screen = 'picker';
  state.phase = 'family-picker';
  state.selected = null;
  screens.show('picker', { force: true });
  const screen = screens.el('picker');
  setBackdrop(screen);
  screen.innerHTML = '';
  screen.append(makeHud({ back: renderSplash, prompt: 'choose-family', backLabel: 'Back to adventures' }));
  const content = document.createElement('div');
  content.className = 'picker-content';
  content.innerHTML = `
    <header class="paper-heading">
      <p>Pick a paper palette</p>
      <h1>Choose a color family</h1>
    </header>
    <div class="family-grid" role="list" aria-label="Color families"></div>`;
  screen.append(content);
  const grid = content.querySelector('.family-grid');
  Object.entries(config.families).forEach(([id, family]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `family-card family-${id}`;
    button.dataset.target = `family-${id}`;
    button.setAttribute('aria-label', family.label);
    button.innerHTML = `${img(family.preview, '', 'family-preview')}<strong>${family.label}</strong>`;
    grid.append(button);
    wireTap(button, () => chooseFamily(id));
  });
}

function chooseFamily(id) {
  const family = config.families[id];
  if (!family || state.busy) return false;
  clearFlow();
  state.family = id;
  state.phase = 'spectrum-play';
  state.placed = Array(family.palette.length).fill(null);
  state.spectrumCards = shuffle(
    family.palette.map((entry, order) => ({ ...entry, id: `shade-${order}`, order })),
    rng,
  );
  state.lastPlaced = null;
  state.selected = null;
  state.busy = false;
  renderSpectrum();
  saySequence(family.voice, id === 'rainbow' ? 'arrange-rainbow' : 'arrange-spectrum');
  return true;
}

function spectrumPrompt() {
  return state.family === 'rainbow' ? 'arrange-rainbow' : 'arrange-spectrum';
}

function spectrumCardLabel(familyId, family, order) {
  if (familyId === 'rainbow') {
    return `${['Red', 'Orange', 'Yellow', 'Green', 'Blue'][order]} paper card`;
  }
  const shade = ['lightest', 'lighter', 'middle', 'darker', 'darkest'][order];
  return `${family.label}, ${shade} shade card`;
}

function renderSpectrum() {
  resetWiring();
  state.screen = 'play';
  screens.show('play', { force: true });
  const screen = screens.el('play');
  setBackdrop(screen);
  const complete = state.phase === 'spectrum-reward';
  const placedCount = state.placed.filter((entry) => entry != null).length;
  screen.innerHTML = '';
  screen.append(makeHud({
    back: renderFamilyPicker,
    prompt: complete ? 'spectrum-complete' : spectrumPrompt(),
    total: 5,
    done: placedCount,
    backLabel: 'Back to color families',
  }));
  const workbench = document.createElement('div');
  workbench.className = `atelier-workbench spectrum-workbench${complete ? ' is-complete' : ''}`;
  const family = config.families[state.family];
  workbench.innerHTML = `
    <header class="paper-prompt spectrum-prompt">
      <span>${state.family === 'rainbow' ? 'RED' : 'LIGHT'}</span>
      <strong>${complete ? `${family.label} glow together!` : (state.family === 'rainbow' ? 'Build the rainbow path' : `${family.label}: light to dark`)}</strong>
      <span>${state.family === 'rainbow' ? 'BLUE' : 'DARK'}</span>
    </header>
    <section class="rack-shell" aria-label="Five-card spectrum rack">
      ${img(config.assets.rack, '', 'rack-art')}
      <div class="rack-slots"></div>
      <div class="spectrum-sweep" aria-hidden="true"></div>
    </section>
    <section class="tray-shell" aria-label="Loose shade cards">
      ${img(config.assets.tray, '', 'tray-art')}
      <div class="card-tray"></div>
    </section>
    <div class="spectrum-reward" ${complete ? '' : 'hidden'}>
      ${img(config.assets.reward, '', 'reward-art')}
      <strong>Beautiful spectrum!</strong>
    </div>`;
  screen.append(workbench);

  const slots = workbench.querySelector('.rack-slots');
  state.placed.forEach((cardOrder, slotIndex) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `rack-slot${slotIndex === state.lastPlaced ? ' is-new' : ''}`;
    button.dataset.slot = 'spectrum';
    button.dataset.slotIndex = String(slotIndex);
    button.dataset.target = `slot-${slotIndex}`;
    button.dataset.role = state.selected == null ? 'neutral' : (state.selected === slotIndex ? 'correct' : 'wrong');
    button.setAttribute('aria-label', `Spectrum position ${slotIndex + 1}${cardOrder == null ? '' : ', filled'}`);
    if (cardOrder != null) {
      const card = family.palette[cardOrder];
      button.classList.add('is-filled');
      button.disabled = true;
      button.append(makeButtonImage(card.card, `${family.label} shade ${cardOrder + 1}`));
    } else if (!complete) {
      wireTap(button, () => {
        if (state.selected != null) attemptSpectrum(state.selected, slotIndex);
      }, { quiet: true });
    }
    slots.append(button);
  });

  const tray = workbench.querySelector('.card-tray');
  if (!complete) {
    state.spectrumCards.forEach((card) => {
      if (state.placed.includes(card.order)) return;
      const button = cardButton(card, {
        target: `card-${card.order}`,
        selected: state.selected === card.order,
        label: spectrumCardLabel(state.family, family, card.order),
      });
      button.dataset.cardOrder = String(card.order);
      tray.append(button);
      wireTap(button, () => selectSpectrumCard(card.order));
      button.addEventListener('pointerdown', (event) => drag?.begin(event, card.order));
    });
    wireSpectrumDrag(screen);
    nudger.arm();
  } else {
    const reward = workbench.querySelector('.spectrum-reward');
    reward.append(playButton('Choose another color', renderFamilyPicker, 'next-color'));
    if (!state.reducedMotion) {
      stopConfetti = burstConfetti({ host: screen, count: 26, duration: 2300, rng });
    }
  }
}

function cardButton(card, { target, selected = false, label = 'Color card', className = '' } = {}) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `paper-card-button ${className}${selected ? ' is-selected' : ''}`;
  button.dataset.target = target;
  button.setAttribute('aria-label', label);
  button.append(makeButtonImage(card.card, ''));
  return button;
}

function selectSpectrumCard(order) {
  if (state.busy || state.phase !== 'spectrum-play' || state.placed.includes(order)) return false;
  state.selected = state.selected === order ? null : order;
  renderSpectrum();
  return true;
}

function wireSpectrumDrag(screen) {
  drag = createDragToSlotDom({
    root: screen,
    slotSelector: '[data-slot="spectrum"]',
    slotPad: 30,
    hoverClass: 'is-ready',
    ghostClass: 'qk-drag-ghost paper-card-ghost',
    getPiece: (order) => {
      const element = screen.querySelector(`[data-card-order="${order}"]`);
      return element ? { el: element, order: Number(order) } : null;
    },
    makeGhost: (piece) => piece.el.cloneNode(true),
    canStart: () => !state.busy && state.phase === 'spectrum-play',
    onLift: (piece) => piece.el.classList.add('is-lifted'),
    onDrop: async (piece, record) => {
      piece.el.classList.remove('is-lifted');
      if (!record.slot) return paperReturn(piece.el);
      return attemptSpectrum(piece.order, Number(record.slot.dataset.slotIndex));
    },
    onCancel: (piece) => piece.el.classList.remove('is-lifted'),
  });
}

function attemptSpectrum(cardOrder, slotIndex) {
  if (state.busy || state.phase !== 'spectrum-play') return false;
  if (!Number.isInteger(cardOrder) || !Number.isInteger(slotIndex)) return false;
  if (state.placed.includes(cardOrder) || state.placed[slotIndex] != null) return false;
  nudger.poke();
  if (cardOrder !== slotIndex) {
    state.busy = true;
    state.selected = null;
    if (!state.muted) sfx.unpop();
    const card = screens.el('play').querySelector(`[data-card-order="${cardOrder}"]`);
    const slot = screens.el('play').querySelector(`[data-slot-index="${slotIndex}"]`);
    card?.classList.add('is-wrong');
    slot?.classList.add('is-wrong');
    say('order-nudge');
    timers.after(520, () => {
      state.busy = false;
      renderSpectrum();
    });
    return false;
  }
  state.placed[slotIndex] = cardOrder;
  state.lastPlaced = slotIndex;
  state.selected = null;
  if (!state.muted) sfx.pop();
  playTone(slotIndex);
  if (state.placed.every((entry) => entry != null)) {
    state.phase = 'spectrum-reward';
    state.busy = false;
    renderSpectrum();
    if (!state.muted) sfx.tada();
    say('spectrum-complete');
  } else {
    renderSpectrum();
    say('shade-fit');
  }
  return true;
}

function paperReturn(element) {
  if (!element) return false;
  element.classList.add('is-returning');
  if (!state.muted) sfx.unpop();
  timers.after(340, () => element.classList.remove('is-returning'));
  return false;
}

function renderMixer() {
  resetWiring();
  state.screen = 'play';
  screens.show('play', { force: true });
  const screen = screens.el('play');
  setBackdrop(screen);
  const reveal = state.phase === 'mixer-reveal' && state.mixerBridge;
  const bridge = reveal ? config.mixer.bridges.find((entry) => entry.id === state.mixerBridge) : null;
  screen.innerHTML = '';
  screen.append(makeHud({
    back: renderSplash,
    prompt: reveal ? bridge.voice : 'mixer-prompt',
    total: config.rounds,
    done: state.completedBridges.length,
    backLabel: 'Back to adventures',
  }));
  const workbench = document.createElement('div');
  workbench.className = `atelier-workbench mixer-workbench${reveal ? ' is-revealed' : ''}`;
  workbench.innerHTML = `
    <header class="paper-prompt mixer-prompt">
      <span>RED</span>
      <strong>${reveal ? `${bridge.result[0].toUpperCase()}${bridge.result.slice(1)}!` : 'Choose two different colors'}</strong>
      <span>BLUE</span>
    </header>
    <section class="press-shell" aria-label="Paper color mixing press">
      ${img(config.assets.press, '', 'press-art')}
      <div class="mixer-wells"></div>
      <div class="bridge-slots" aria-live="polite"></div>
    </section>
    <section class="mixer-tray" aria-label="Primary color cards" ${reveal ? 'hidden' : ''}></section>
    <div class="mixer-result" ${reveal ? '' : 'hidden'}>
      <strong>${reveal ? `${bridge.colors[0]} + ${bridge.colors[1]} = ${bridge.result}` : ''}</strong>
    </div>`;
  screen.append(workbench);

  const wells = workbench.querySelector('.mixer-wells');
  [0, 1].forEach((index) => {
    const color = state.mixerWells[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `mixer-well${color ? ' is-filled' : ''}`;
    button.dataset.slot = 'mixer';
    button.dataset.wellIndex = String(index);
    button.dataset.target = `well-${index}`;
    button.dataset.role = state.selected && !color ? 'correct' : 'neutral';
    button.setAttribute('aria-label', color ? `${color} in mixing well ${index + 1}` : `Empty mixing well ${index + 1}`);
    if (color) button.append(makeButtonImage(config.mixer.primary[color].card, color));
    else if (!reveal) wireTap(button, () => {
      if (state.selected) placeMixer(state.selected, index);
    }, { quiet: true });
    wells.append(button);
  });

  const bridgeHost = workbench.querySelector('.bridge-slots');
  if (reveal) {
    const cards = state.mixerWells[0] === bridge.colors[0] ? bridge.cards : [...bridge.cards].reverse();
    cards.forEach((source, index) => {
      const holder = document.createElement('div');
      holder.className = `bridge-card${index === 2 ? ' is-result' : ''}`;
      holder.style.setProperty('--bridge-index', index);
      holder.append(makeButtonImage(source, index === 2 ? bridge.result : ''));
      bridgeHost.append(holder);
    });
  }

  const tray = workbench.querySelector('.mixer-tray');
  if (!reveal) {
    Object.entries(config.mixer.primary).forEach(([color, primary]) => {
      const button = cardButton(primary, {
        target: `primary-${color}`,
        selected: state.selected === color,
        label: `${primary.label} color card`,
        className: `primary-card primary-${color}`,
      });
      button.dataset.color = color;
      tray.append(button);
      wireTap(button, () => selectMixerColor(color));
      button.addEventListener('pointerdown', (event) => drag?.begin(event, color));
    });
    wireMixerDrag(screen);
    nudger.arm();
  } else {
    workbench.querySelector('.mixer-result').append(playButton(
      state.completedBridges.length === config.rounds - 1 ? 'See my color bridges' : 'Make another bridge',
      advanceMixer,
      'next-bridge',
    ));
  }
}

function selectMixerColor(color) {
  if (state.busy || state.phase !== 'mixer-pick') return false;
  state.selected = state.selected === color ? null : color;
  renderMixer();
  return true;
}

function wireMixerDrag(screen) {
  drag = createDragToSlotDom({
    root: screen,
    slotSelector: '[data-slot="mixer"]',
    slotPad: 42,
    hoverClass: 'is-ready',
    ghostClass: 'qk-drag-ghost paper-card-ghost',
    getPiece: (color) => {
      const element = screen.querySelector(`[data-color="${color}"]`);
      return element ? { el: element, color } : null;
    },
    makeGhost: (piece) => piece.el.cloneNode(true),
    canStart: () => !state.busy && state.phase === 'mixer-pick',
    onLift: (piece) => piece.el.classList.add('is-lifted'),
    onDrop: async (piece, record) => {
      piece.el.classList.remove('is-lifted');
      if (!record.slot) return paperReturn(piece.el);
      return placeMixer(piece.color, Number(record.slot.dataset.wellIndex));
    },
    onCancel: (piece) => piece.el.classList.remove('is-lifted'),
  });
}

function findBridge(colors) {
  return config.mixer.bridges.find((bridge) => colors.every((color) => bridge.colors.includes(color)));
}

function placeMixer(color, wellIndex) {
  if (state.busy || state.phase !== 'mixer-pick') return false;
  if (!config.mixer.primary[color] || ![0, 1].includes(wellIndex) || state.mixerWells[wellIndex]) return false;
  nudger.poke();
  const other = state.mixerWells[wellIndex === 0 ? 1 : 0];
  if (other === color) {
    state.selected = null;
    state.busy = true;
    if (!state.muted) sfx.silly();
    const well = screens.el('play').querySelector(`[data-well-index="${wellIndex}"]`);
    well?.classList.add('is-wrong');
    say(`same-${color}`);
    timers.after(620, () => {
      state.busy = false;
      renderMixer();
    });
    return false;
  }
  state.mixerWells[wellIndex] = color;
  state.selected = null;
  if (!state.muted) sfx.pop();
  if (state.mixerWells.some((entry) => !entry)) {
    renderMixer();
    return true;
  }
  const bridge = findBridge(state.mixerWells);
  if (!bridge) return false;
  if (state.completedBridges.includes(bridge.id)) {
    state.busy = true;
    renderMixer();
    say('mixer-prompt');
    timers.after(760, () => {
      state.mixerWells = [null, null];
      state.busy = false;
      renderMixer();
    });
    return false;
  }
  state.mixerBridge = bridge.id;
  state.phase = 'mixer-reveal';
  state.busy = false;
  renderMixer();
  if (!state.muted) sfx.sparkle();
  say(bridge.voice);
  return true;
}

function advanceMixer() {
  if (state.phase !== 'mixer-reveal' || !state.mixerBridge) return false;
  if (!state.completedBridges.includes(state.mixerBridge)) state.completedBridges.push(state.mixerBridge);
  state.round = state.completedBridges.length;
  if (state.completedBridges.length >= config.rounds) {
    renderEnd('mixer');
    return true;
  }
  clearFlow();
  state.phase = 'mixer-pick';
  state.mixerWells = [null, null];
  state.mixerBridge = null;
  state.selected = null;
  renderMixer();
  say('mixer-prompt');
  return true;
}

function currentSafari() {
  return state.safariDeck[state.round] || null;
}

function prepareSafariChoices() {
  const item = currentSafari();
  state.safariChoices = item ? shuffle(item.choices, rng) : [];
}

function renderSafari() {
  resetWiring();
  const item = currentSafari();
  if (!item) return renderEnd('safari');
  state.screen = 'play';
  screens.show('play', { force: true });
  const screen = screens.el('play');
  setBackdrop(screen);
  const reveal = state.phase === 'safari-reveal' && state.safariMatch;
  screen.innerHTML = '';
  screen.append(makeHud({
    back: renderSplash,
    prompt: reveal ? 'match-cheer' : item.voice,
    total: config.safari.rounds,
    done: state.round,
    backLabel: 'Back to adventures',
  }));
  const workbench = document.createElement('div');
  workbench.className = `atelier-workbench safari-workbench${reveal ? ' is-matched' : ''}`;
  workbench.innerHTML = `
    <header class="paper-prompt safari-prompt">
      <span aria-hidden="true">⌕</span>
      <strong>${reveal ? 'A perfect shade match!' : `Find the shade for the ${item.label}`}</strong>
      <span aria-hidden="true">✦</span>
    </header>
    <section class="safari-display" aria-label="Match a shade to the ${item.label}">
      ${img(config.assets.safariFrame, '', 'safari-frame-art')}
      <div class="safari-object">${img(item.asset, `Papercraft ${item.label}`, 'safari-object-art')}</div>
      <button type="button" class="safari-target${reveal ? ' is-filled' : ''}" data-slot="safari" data-target="safari-target" aria-label="Shade match target"></button>
    </section>
    <section class="safari-tray" aria-label="Shade choices" ${reveal ? 'hidden' : ''}></section>`;
  screen.append(workbench);
  const target = workbench.querySelector('.safari-target');
  if (reveal) {
    const match = item.choices.find((choice) => choice.id === state.safariMatch);
    target.style.setProperty('--safari-match-color', match.hex);
    target.append(makeButtonImage(match.card, 'Matching shade'));
  } else {
    target.dataset.role = state.selected ? 'correct' : 'neutral';
    wireTap(target, () => {
      if (state.selected) attemptSafari(state.selected);
    }, { quiet: true });
  }

  const tray = workbench.querySelector('.safari-tray');
  if (!reveal) {
    state.safariChoices.forEach((choice) => {
      const button = cardButton(choice, {
        target: `safari-${choice.id}`,
        selected: state.selected === choice.id,
        label: `${['Lighter', 'Middle', 'Darker'][item.choices.indexOf(choice)]} ${item.colorLabel} shade card`,
        className: 'safari-choice',
      });
      button.dataset.choiceId = choice.id;
      button.dataset.role = choice.correct ? 'correct' : 'wrong';
      tray.append(button);
      wireTap(button, () => selectSafariChoice(choice.id));
      button.addEventListener('pointerdown', (event) => drag?.begin(event, choice.id));
    });
    wireSafariDrag(screen);
    nudger.arm();
  } else {
    const action = document.createElement('div');
    action.className = 'safari-next';
    action.append(playButton(state.round === config.safari.rounds - 1 ? 'See my color garden' : 'Find another shade', advanceSafari, 'next-safari'));
    workbench.append(action);
  }
}

function selectSafariChoice(choiceId) {
  if (state.busy || state.phase !== 'safari-pick') return false;
  if (!state.safariChoices.some((choice) => choice.id === choiceId)) return false;
  state.selected = state.selected === choiceId ? null : choiceId;
  renderSafari();
  return true;
}

function wireSafariDrag(screen) {
  drag = createDragToSlotDom({
    root: screen,
    slotSelector: '[data-slot="safari"]',
    slotPad: 54,
    hoverClass: 'is-ready',
    ghostClass: 'qk-drag-ghost paper-card-ghost',
    getPiece: (choiceId) => {
      const element = screen.querySelector(`[data-choice-id="${choiceId}"]`);
      return element ? { el: element, choiceId } : null;
    },
    makeGhost: (piece) => piece.el.cloneNode(true),
    canStart: () => !state.busy && state.phase === 'safari-pick',
    onLift: (piece) => piece.el.classList.add('is-lifted'),
    onDrop: async (piece, record) => {
      piece.el.classList.remove('is-lifted');
      if (!record.slot) return paperReturn(piece.el);
      return attemptSafari(piece.choiceId);
    },
    onCancel: (piece) => piece.el.classList.remove('is-lifted'),
  });
}

function attemptSafari(choiceId) {
  if (state.busy || state.phase !== 'safari-pick') return false;
  const choice = state.safariChoices.find((entry) => entry.id === choiceId);
  if (!choice) return false;
  nudger.poke();
  state.selected = null;
  if (!choice.correct) {
    state.busy = true;
    if (!state.muted) sfx.unpop();
    const card = screens.el('play').querySelector(`[data-choice-id="${choiceId}"]`);
    const target = screens.el('play').querySelector('[data-slot="safari"]');
    card?.classList.add('is-wrong');
    target?.classList.add('is-wrong');
    say('match-nudge');
    timers.after(560, () => {
      state.busy = false;
      renderSafari();
    });
    return false;
  }
  state.safariMatch = choice.id;
  state.phase = 'safari-reveal';
  state.busy = false;
  renderSafari();
  if (!state.muted) sfx.sparkle();
  say('match-cheer');
  return true;
}

function advanceSafari() {
  if (state.phase !== 'safari-reveal') return false;
  state.round += 1;
  if (state.round >= config.safari.rounds) {
    renderEnd('safari');
    return true;
  }
  clearFlow();
  state.phase = 'safari-pick';
  state.safariMatch = null;
  state.selected = null;
  prepareSafariChoices();
  renderSafari();
  say(currentSafari().voice);
  return true;
}

function renderEnd(modeId) {
  clearFlow();
  const mode = config.modes.find((entry) => entry.id === modeId);
  const endKey = modeId === 'mixer' ? 'mixer-complete' : 'safari-complete';
  const title = modeId === 'mixer' ? 'Three glowing color bridges!' : 'A whole garden of color!';
  state.screen = 'end';
  state.mode = modeId;
  state.phase = 'end';
  state.busy = false;
  screens.show('end', { force: true });
  const screen = screens.el('end');
  setBackdrop(screen);
  screen.innerHTML = '';
  screen.append(makeHud({ back: renderSplash, prompt: endKey, backLabel: 'Back to adventures' }));
  const tableau = document.createElement('div');
  tableau.className = `end-tableau end-${modeId}`;
  tableau.innerHTML = `
    ${img(config.assets.reward, '', 'end-ribbon')}
    ${img(mode.art, '', 'end-mode-art')}
    <h1>${title}</h1>
    <p>${modeId === 'mixer' ? 'Red, yellow, and blue made new colors.' : 'You matched every paper treasure.'}</p>
    <div class="qk-end-actions"></div>`;
  screen.append(tableau);
  tableau.querySelector('.qk-end-actions').append(playButton(`Play ${mode.title} again`, () => startMode(modeId), 'replay'));
  if (!state.reducedMotion) stopConfetti = burstConfetti({ host: screen, count: 34, loop: true, duration: 2900, rng, drift: 65 });
  if (!state.muted) sfx.tada();
  say(endKey);
}

function idleNudge() {
  if (state.busy) return;
  if (state.phase === 'spectrum-play') {
    screens.el('play')?.querySelector('.paper-card-button:not(.is-lifted)')?.classList.add('is-nudged');
    say('order-nudge');
  } else if (state.phase === 'mixer-pick') {
    screens.el('play')?.querySelector('.primary-card')?.classList.add('is-nudged');
    say('mixer-prompt');
  } else if (state.phase === 'safari-pick') {
    screens.el('play')?.querySelector('.safari-choice')?.classList.add('is-nudged');
    say(currentSafari().voice);
  }
}

function unlockTone() {
  try {
    if (!toneContext) toneContext = new (window.AudioContext || window.webkitAudioContext)();
    if (toneContext.state === 'suspended') toneContext.resume();
  } catch { /* pitch feedback is decorative */ }
}

function playTone(index) {
  if (state.muted) return;
  unlockTone();
  if (!toneContext) return;
  const frequencies = [261.63, 293.66, 329.63, 392.0, 440.0];
  const now = toneContext.currentTime;
  const oscillator = toneContext.createOscillator();
  const gain = toneContext.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.value = frequencies[index] || frequencies[0];
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
  oscillator.connect(gain).connect(toneContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.36);
}

function tapTarget(id) {
  const target = [...mount.querySelectorAll('[data-target]')].find((node) => node.dataset.target === id);
  if (!target || target.matches(':disabled')) return false;
  target.click();
  return true;
}

function getState() {
  return {
    screen: state.screen,
    mode: state.mode,
    phase: state.phase,
    round: state.round,
    totalRounds: state.mode === 'spectrum' ? 5 : config.rounds,
    family: state.family,
    selected: state.selected,
    placed: [...state.placed],
    mixerWells: [...state.mixerWells],
    mixerBridge: state.mixerBridge,
    completedBridges: [...state.completedBridges],
    safariTarget: currentSafari()?.id || null,
    safariMatch: state.safariMatch,
    busy: state.busy,
    muted: state.muted,
    reducedMotion: state.reducedMotion,
    activeDrag: Boolean(drag?.active),
    artFailures: artFailures.map((entry) => ({ ...entry })),
  };
}

async function debugWinRound() {
  await ready;
  if (state.mode === 'spectrum') {
    if (state.phase === 'family-picker') chooseFamily('reds');
    if (state.phase !== 'spectrum-play') return false;
    state.placed = state.placed.map((entry, index) => entry == null ? index : entry);
    state.lastPlaced = 4;
    state.phase = 'spectrum-reward';
    renderSpectrum();
    return true;
  }
  if (state.mode === 'mixer') {
    if (state.phase === 'mixer-reveal') return advanceMixer();
    const bridge = config.mixer.bridges.find((entry) => !state.completedBridges.includes(entry.id));
    if (!bridge) return false;
    state.mixerWells = [...bridge.colors];
    state.mixerBridge = bridge.id;
    state.phase = 'mixer-reveal';
    renderMixer();
    return true;
  }
  if (state.mode === 'safari' && state.phase === 'safari-pick') {
    const correct = state.safariChoices.find((choice) => choice.correct);
    return correct ? attemptSafari(correct.id) : false;
  }
  if (state.mode === 'safari' && state.phase === 'safari-reveal') return advanceSafari();
  return false;
}

async function debugCompleteMode() {
  await ready;
  if (state.mode === 'spectrum') {
    if (state.phase === 'family-picker') chooseFamily('reds');
    state.placed = [0, 1, 2, 3, 4];
    state.lastPlaced = 4;
    state.phase = 'spectrum-reward';
    renderSpectrum();
    return true;
  }
  if (state.mode === 'mixer') {
    state.completedBridges = config.mixer.bridges.map((bridge) => bridge.id);
    state.round = config.rounds;
    renderEnd('mixer');
    return true;
  }
  if (state.mode === 'safari') {
    state.round = config.safari.rounds;
    renderEnd('safari');
    return true;
  }
  return false;
}

function mute(on = true) {
  const muted = Boolean(on);
  state.muted = muted;
  sfx.setMuted(muted);
  voice.setMuted(muted);
  narrator.setMuted(muted);
  if (muted && toneContext?.state === 'running') toneContext.suspend().catch(() => undefined);
  return muted;
}

installDebug({
  gameId: config.id,
  engine: 'custom-dom',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode: async (id) => { await ready; return startMode(id); },
  getState,
  getTargets: () => collectTargets(mount),
  tap: async (id) => { await ready; return tapTarget(id); },
  winRound: debugWinRound,
  completeMode: debugCompleteMode,
  chooseFamily: async (id) => { await ready; return chooseFamily(id); },
  placeCard: async (cardId, slotId) => {
    await ready;
    const cardOrder = Number(String(cardId).replace(/^(?:card-|shade-)/, ''));
    const slotIndex = Number(String(slotId).replace(/^slot-/, ''));
    return attemptSpectrum(cardOrder, slotIndex);
  },
  chooseSafari: async (choiceId) => { await ready; return attemptSafari(choiceId); },
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  mute,
  timers,
  narrator,
  sfx,
  voice,
  onSeed: (nextRng, seed) => {
    rng = nextRng;
    state.seed = seed;
  },
  home: () => { window.location.href = '../../'; },
  artFailures,
});
