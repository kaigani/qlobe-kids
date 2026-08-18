import config from '../config.js';
import { createScreens } from '../../../shared/js/screens.js';
import { onTap } from '../../../shared/js/tap.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { installUnlockOnGesture, installKioskGuards, unlockAll } from '../../../shared/js/audio-unlock.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle, pick } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { tada } from '../../../shared/js/celebrate.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createWheel } from './wheel.js';
import { createSoundscape } from './soundscape.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const linesResponse = await fetch(config.lines);
if (!linesResponse.ok) throw new Error(`Could not load spoken lines (${linesResponse.status})`);
const lines = await linesResponse.json();
await voice.init('./assets/audio/manifest.json', config.lines, lines);

const root = $('#game');
const timers = createTimers();
const soundscape = createSoundscape();
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const globalDisposers = [];
let garmentDisposers = [];
let celebrationDisposer = null;
let rngSeed = (Date.now() ^ 0x4d5357) >>> 0;
let rng = mulberry32(rngSeed);
let flowEpoch = 0;
let firstGesture = false;
let currentLine = 'choose-mode';
let currentFact = null;
let wheel = null;

const state = {
  mode: null,
  season: null,
  busy: false,
  dressAttempts: 0,
  discoveries: { plant: false, animal: false },
  visited: [],
  stamps: [],
  dressOrder: [],
  dressRound: 0,
  dressCompleted: [],
  pendingSeason: null,
  reducedMotion: reducedMotionQuery.matches,
};

const el = {
  modeWheel: $('#mode-wheel'),
  modeDress: $('#mode-dress'),
  wheelBackground: $('#wheel-background'),
  wheelProgress: $('#wheel-progress'),
  wheelPrompt: $('#wheel-prompt'),
  wheelTouch: $('#wheel-touch'),
  spinButton: $('#spin-button'),
  wheelFx: $('#wheel-fx'),
  dressBackground: $('#dress-background'),
  dressProgress: $('#dress-progress'),
  dressPrompt: $('#dress-prompt'),
  weatherLabel: $('#weather-label'),
  juni: $('#juni-character'),
  garmentGrid: $('#garment-grid'),
  dressFx: $('#dress-fx'),
  exploreScene: $('#explore-scene'),
  exploreBackdrop: $('#explore-backdrop'),
  exploreBackground: $('#explore-background'),
  exploreProgress: $('#explore-progress'),
  explorePrompt: $('#explore-prompt'),
  plantHotspot: $('#plant-hotspot'),
  animalHotspot: $('#animal-hotspot'),
  seasonComplete: $('#season-complete-button'),
  exploreFx: $('#explore-fx'),
  factOverlay: $('#fact-overlay'),
  factClose: $('#fact-close'),
  factReplay: $('#fact-replay'),
  factImage: $('#fact-image'),
  factTitle: $('#fact-title'),
  factCopy: $('#fact-copy'),
  rewardBackdrop: $('#reward-backdrop'),
  rewardBackground: $('#reward-background'),
  rewardPanel: $('#reward-panel'),
  rewardTitle: $('#reward-title'),
  rewardStamps: $('#reward-stamps'),
  dressReward: $('#dress-reward-collage'),
  rewardGarments: $('#reward-garments'),
  again: $('#again-button'),
  rewardFx: $('#reward-fx'),
  status: $('#game-status'),
};

const screens = createScreens({
  root,
  initial: 'splash',
  splash: 'splash',
  voice,
  onExit(name) {
    flowEpoch += 1;
    timers.clearAll();
    nudger.stop();
    soundscape.stop();
    celebrationDisposer?.();
    celebrationDisposer = null;
    if (name === 'wheel') wheel?.cancel();
    hideFact();
  },
});

const nudger = createNudger({
  first: config.tuning.idleHelpMs,
  repeat: config.tuning.idleHelpMs,
  onNudge(count) {
    if (screens.is('wheel')) {
      setPrompt(el.wheelPrompt, count === 0 ? 'wheel-help' : 'wheel-prompt');
      el.spinButton.classList.toggle('is-bouncing', count > 0);
      speak(count === 0 ? 'wheel-help' : 'wheel-prompt');
      return;
    }
    if (screens.is('dress')) {
      const correct = $(`[data-garment="${config.seasons[state.season].dress}"]`, el.garmentGrid);
      if (count === 0) {
        speak(`${state.season}-dress`);
      } else if (count === 1) {
        correct?.classList.add('is-bouncing');
        speak('dress-nudge');
      } else {
        correct?.classList.add('is-model');
        speak('dress-model');
      }
      return;
    }
    if (screens.is('explore')) {
      const missing = !state.discoveries.plant ? el.plantHotspot : el.animalHotspot;
      missing?.classList.add('is-bouncing');
      speak(count === 0 ? 'explore-prompt' : 'explore-nudge');
    }
  },
});

function spokenText(key) {
  return lines[key] || '';
}

function setPrompt(node, key, fallback) {
  const text = fallback || spokenText(key);
  node.textContent = text;
  el.status.textContent = text;
}

function speak(key) {
  currentLine = key;
  const text = spokenText(key);
  if (text) el.status.textContent = text;
  return voice.say(key, text);
}

function replayCurrentLine() {
  if (screens.is('explore') && !el.factOverlay.hidden) return false;
  if (currentLine) speak(currentLine);
  return true;
}

function touchFeedback(event) {
  event.preventDefault?.();
  unlockAll([soundscape.unlock]);
  nudger.poke();
  try { sfx.tick(); } catch { /* audio is supportive */ }
}

function allAssetUrls(value, found = new Set()) {
  if (typeof value === 'string' && /\.(?:webp|png|jpe?g)$/i.test(value)) found.add(value);
  else if (Array.isArray(value)) value.forEach((entry) => allAssetUrls(entry, found));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => allAssetUrls(entry, found));
  return [...found];
}

void preloadImages(allAssetUrls(config), { idle: true });

function clearGarmentButtons() {
  for (const dispose of garmentDisposers.splice(0)) dispose();
}

function renderProgress(node, completed) {
  node.replaceChildren();
  for (const season of config.seasonOrder) {
    const slot = document.createElement('span');
    slot.className = 'stamp-slot';
    if (completed.includes(season)) {
      const stamp = document.createElement('img');
      stamp.src = config.seasons[season].stamp;
      stamp.alt = `${config.seasons[season].label} stamp`;
      slot.append(stamp);
    } else {
      slot.classList.add('is-empty');
      slot.setAttribute('aria-label', `${config.seasons[season].label} stamp not collected yet`);
    }
    node.append(slot);
  }
}

function setScene(image, season, { neutral = false, animate = false } = {}) {
  const data = season ? config.seasons[season] : null;
  const src = neutral ? config.assets.backgrounds.wheel : data?.background || config.assets.backgrounds.splash;
  const alt = neutral
    ? 'A layered paper mountain waiting for the seasons wheel'
    : `${data?.label || 'Four seasons'} on the layered paper mountain`;
  if (animate) image.classList.add('is-changing');
  const apply = () => {
    image.src = src;
    image.alt = alt;
    requestAnimationFrame(() => image.classList.remove('is-changing'));
  };
  if (animate && !state.reducedMotion) timers.after(130, apply);
  else apply();
}

function particleImage(season) {
  return pick(config.assets.particles[season] || [], rng);
}

function burstParticles(container, season, count = 12, reward = false) {
  container.replaceChildren();
  if (state.reducedMotion) return;
  const seasons = reward ? config.seasonOrder : [season];
  for (let index = 0; index < count; index += 1) {
    const whichSeason = seasons[index % seasons.length];
    const piece = document.createElement('img');
    piece.className = 'paper-particle';
    piece.src = particleImage(whichSeason);
    piece.alt = '';
    piece.style.setProperty('--x', `${Math.round(rng() * 92)}%`);
    piece.style.setProperty('--size', `${Math.round(34 + rng() * 42)}px`);
    piece.style.setProperty('--duration', `${(2.1 + rng() * 1.8).toFixed(2)}s`);
    piece.style.setProperty('--delay', `${(rng() * 0.65).toFixed(2)}s`);
    const direction = rng() < 0.5 ? -1 : 1;
    piece.style.setProperty('--drift', `${direction * Math.round(24 + rng() * 160)}px`);
    piece.style.setProperty('--turn', `${direction * Math.round(160 + rng() * 520)}deg`);
    piece.addEventListener('animationend', () => piece.remove(), { once: true });
    container.append(piece);
  }
}

function updateWheelBackground(season) {
  setScene(el.wheelBackground, season, { animate: true });
  burstParticles(el.wheelFx, season, 15);
}

function availableAdventureSeason() {
  const remaining = config.seasonOrder.filter((season) => !state.visited.includes(season));
  return pick(remaining.length ? remaining : config.seasonOrder, rng);
}

function chooseWheelTarget(forcedSeason) {
  if (!screens.is('wheel') || state.busy || wheel?.spinning) return null;
  const season = config.seasons[forcedSeason] ? forcedSeason : availableAdventureSeason();
  state.pendingSeason = season;
  return config.seasonOrder.indexOf(season);
}

async function assistedSpin(forcedSeason) {
  const target = chooseWheelTarget(forcedSeason);
  if (target == null) return false;
  return wheel.spinTo(target);
}

async function onWheelSettle(index) {
  const season = state.pendingSeason || config.seasonOrder[index];
  state.pendingSeason = null;
  state.season = season;
  state.busy = true;
  updateWheelBackground(season);
  setPrompt(el.wheelPrompt, `${season}-land`);
  try { sfx.sparkle(); } catch { /* supportive only */ }
  soundscape.start(season);
  const token = flowEpoch;
  await speak(`${season}-land`);
  if (token !== flowEpoch || !screens.is('wheel') || state.season !== season) return;
  timers.after(300, () => showDressRound(season));
}

wheel = createWheel({
  element: el.wheelTouch,
  reducedMotion: state.reducedMotion,
  turns: config.tuning.wheelTurns,
  durationMs: config.tuning.spinDurationMs,
  onRequestSpin: () => chooseWheelTarget(),
  onStart() {
    state.busy = true;
    nudger.stop();
    el.spinButton.disabled = true;
    el.spinButton.classList.remove('is-bouncing');
    setPrompt(el.wheelPrompt, 'wheel-turning');
    try { sfx.whoosh(); } catch { /* supportive only */ }
    speak('wheel-turning');
  },
  onTick() {
    try { sfx.tick(); } catch { /* supportive only */ }
  },
  onSettle(index) {
    el.spinButton.disabled = false;
    void onWheelSettle(index);
  },
});

function resetSession(mode) {
  flowEpoch += 1;
  timers.clearAll();
  voice.stop();
  wheel.cancel();
  wheel.setAngle(0);
  state.mode = mode;
  state.season = null;
  state.busy = false;
  state.dressAttempts = 0;
  state.discoveries = { plant: false, animal: false };
  state.visited = [];
  state.stamps = [];
  state.dressOrder = shuffle(config.seasonOrder, rng);
  state.dressRound = 0;
  state.dressCompleted = [];
  state.pendingSeason = null;
  currentFact = null;
  clearGarmentButtons();
}

function showWheel() {
  state.busy = false;
  state.season = null;
  screens.show('wheel');
  setScene(el.wheelBackground, null, { neutral: true });
  renderProgress(el.wheelProgress, state.stamps);
  setPrompt(el.wheelPrompt, 'wheel-prompt');
  el.spinButton.disabled = false;
  el.spinButton.classList.remove('is-bouncing');
  soundscape.start(state.stamps.at(-1) || 'spring');
  speak('wheel-prompt');
  nudger.arm();
}

function renderGarments(season) {
  clearGarmentButtons();
  el.garmentGrid.replaceChildren();
  const garmentIds = shuffle(Object.keys(config.garments), rng);
  for (const garmentId of garmentIds) {
    const garment = config.garments[garmentId];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'garment-card';
    button.dataset.target = `garment-${garmentId}`;
    button.dataset.role = 'choice';
    button.dataset.garment = garmentId;
    button.setAttribute('aria-label', garment.alt);

    const image = document.createElement('img');
    image.src = garment.path;
    image.alt = garment.alt;
    const label = document.createElement('span');
    label.textContent = garment.label;
    button.append(image, label);
    el.garmentGrid.append(button);
    garmentDisposers.push(onTap(button, () => chooseGarment(garmentId), { feedback: touchFeedback }));
  }
  const correctId = config.seasons[season].dress;
  $(`[data-garment="${correctId}"]`, el.garmentGrid)?.setAttribute('data-correct', 'true');
}

function showDressRound(season = state.dressOrder[state.dressRound], { announce = true } = {}) {
  if (!config.seasons[season]) return false;
  state.season = season;
  state.busy = false;
  state.dressAttempts = 0;
  state.discoveries = { plant: false, animal: false };
  screens.show('dress', { force: screens.is('dress') });
  setScene(el.dressBackground, season);
  el.juni.src = config.assets.juniBase;
  el.juni.alt = `Juni waiting to dress for ${config.seasons[season].label.toLowerCase()}`;
  el.juni.classList.remove('is-dressed');
  el.weatherLabel.textContent = config.seasons[season].weather;
  renderGarments(season);
  renderProgress(el.dressProgress, state.mode === 'dress' ? state.dressCompleted : state.stamps);
  setPrompt(el.dressPrompt, `${season}-dress`);
  burstParticles(el.dressFx, season, 8);
  soundscape.start(season);
  if (announce) {
    speak(`${season}-dress`);
    nudger.arm();
  }
  return true;
}

async function chooseGarment(garmentId) {
  if (!screens.is('dress') || state.busy || !config.garments[garmentId]) return false;
  nudger.poke();
  const season = state.season;
  const correctId = config.seasons[season].dress;
  const button = $(`[data-garment="${garmentId}"]`, el.garmentGrid);
  const correctButton = $(`[data-garment="${correctId}"]`, el.garmentGrid);
  if (garmentId !== correctId) {
    state.dressAttempts += 1;
    button?.classList.remove('is-wrong');
    requestAnimationFrame(() => button?.classList.add('is-wrong'));
    try { sfx.boing(); } catch { /* supportive only */ }
    if (state.dressAttempts === 1) {
      correctButton?.classList.add('is-model');
      setPrompt(el.dressPrompt, `${season}-hint`);
      const token = flowEpoch;
      await speak('dress-nudge');
      if (token === flowEpoch
        && screens.is('dress')
        && !state.busy
        && state.season === season
        && state.dressAttempts === 1) {
        speak(`${season}-hint`);
      }
    } else {
      correctButton?.classList.add('is-model');
      setPrompt(el.dressPrompt, 'dress-model');
      speak('dress-model');
    }
    return false;
  }

  state.busy = true;
  nudger.stop();
  for (const choice of $$('.garment-card', el.garmentGrid)) choice.disabled = true;
  correctButton?.classList.remove('is-model', 'is-bouncing');
  correctButton?.classList.add('is-correct');
  try { sfx.sparkle(); } catch { /* supportive only */ }
  const token = flowEpoch;
  timers.after(260, () => {
    if (token !== flowEpoch) return;
    el.juni.src = config.seasons[season].character;
    el.juni.alt = `Juni dressed for ${config.seasons[season].label.toLowerCase()} weather`;
    el.juni.classList.add('is-dressed');
    burstParticles(el.dressFx, season, 13);
  });
  setPrompt(el.dressPrompt, `${season}-correct`);
  await speak(`${season}-correct`);
  if (token !== flowEpoch || !screens.is('dress') || state.season !== season) return true;
  timers.after(420, () => {
    if (state.mode === 'wheel') {
      showExplore();
      return;
    }
    if (!state.dressCompleted.includes(season)) state.dressCompleted.push(season);
    state.dressRound += 1;
    if (state.dressRound >= config.seasonOrder.length) showReward();
    else showDressRound(state.dressOrder[state.dressRound]);
  });
  return true;
}

function renderedSceneBox(image) {
  const width = image.clientWidth || window.innerWidth;
  const height = image.clientHeight || window.innerHeight;
  const sourceRatio = 4 / 3;
  const contain = window.matchMedia('(orientation: portrait)').matches;
  let renderWidth;
  let renderHeight;
  if (contain) {
    renderWidth = width;
    renderHeight = width / sourceRatio;
    if (renderHeight > height) {
      renderHeight = height;
      renderWidth = height * sourceRatio;
    }
  } else {
    renderWidth = width;
    renderHeight = width / sourceRatio;
    if (renderHeight < height) {
      renderHeight = height;
      renderWidth = height * sourceRatio;
    }
  }
  return {
    x: (width - renderWidth) / 2,
    y: (height - renderHeight) / 2,
    width: renderWidth,
    height: renderHeight,
  };
}

function positionHotspots() {
  if (!state.season || !screens.is('explore')) return;
  const box = renderedSceneBox(el.exploreBackground);
  for (const [kind, button] of [['plant', el.plantHotspot], ['animal', el.animalHotspot]]) {
    const point = config.seasons[state.season][kind];
    button.style.left = `${box.x + point.x * box.width}px`;
    button.style.top = `${box.y + point.y * box.height}px`;
  }
}

function showExplore() {
  const season = state.season;
  state.busy = false;
  state.discoveries = { plant: false, animal: false };
  currentFact = null;
  screens.show('explore');
  setScene(el.exploreBackground, season);
  el.exploreBackdrop.src = config.seasons[season].background;
  renderProgress(el.exploreProgress, state.stamps);
  el.plantHotspot.classList.remove('is-found', 'is-bouncing');
  el.animalHotspot.classList.remove('is-found', 'is-bouncing');
  el.plantHotspot.disabled = false;
  el.animalHotspot.disabled = false;
  el.seasonComplete.hidden = true;
  el.seasonComplete.querySelector('span').textContent = `Add ${config.seasons[season].label} stamp`;
  setPrompt(el.explorePrompt, 'explore-prompt');
  positionHotspots();
  requestAnimationFrame(positionHotspots);
  burstParticles(el.exploreFx, season, 10);
  soundscape.start(season);
  speak('explore-prompt');
  nudger.arm();
}

function discover(kind) {
  if (!screens.is('explore') || state.busy || !el.factOverlay.hidden || !['plant', 'animal'].includes(kind)) return false;
  const season = state.season;
  const discovery = config.seasons[season][kind];
  const hotspot = kind === 'plant' ? el.plantHotspot : el.animalHotspot;
  state.discoveries[kind] = true;
  hotspot.classList.add('is-found');
  hotspot.classList.remove('is-bouncing');
  currentFact = `${season}-${kind}`;
  el.factImage.src = discovery.path;
  el.factImage.alt = discovery.alt;
  el.factTitle.textContent = discovery.label;
  el.factCopy.textContent = spokenText(currentFact);
  setFactModal(true);
  el.factClose.focus({ preventScroll: true });
  if (state.discoveries.plant && state.discoveries.animal) {
    el.seasonComplete.hidden = false;
    setPrompt(el.explorePrompt, null, `Both discoveries found — add the ${config.seasons[season].label.toLowerCase()} stamp!`);
  }
  try { sfx.pop(); } catch { /* supportive only */ }
  speak(currentFact);
  nudger.poke();
  return true;
}

function setFactModal(open) {
  if (!el.factOverlay) return;
  for (const sibling of el.factOverlay.parentElement.children) {
    if (sibling !== el.factOverlay) sibling.inert = open;
  }
  el.factOverlay.hidden = !open;
}

function hideFact() {
  setFactModal(false);
}

function closeFact() {
  if (el.factOverlay.hidden) return;
  hideFact();
  const focusTarget = currentFact?.endsWith('-plant') ? el.plantHotspot : el.animalHotspot;
  focusTarget?.focus({ preventScroll: true });
  nudger.arm();
}

async function completeSeason({ force = false } = {}) {
  if (!screens.is('explore') || state.busy || !el.factOverlay.hidden) return false;
  if (!force && !(state.discoveries.plant && state.discoveries.animal)) return false;
  const season = state.season;
  state.busy = true;
  hideFact();
  nudger.stop();
  if (!state.stamps.includes(season)) state.stamps.push(season);
  if (!state.visited.includes(season)) state.visited.push(season);
  renderProgress(el.exploreProgress, state.stamps);
  burstParticles(el.exploreFx, season, 20);
  try { sfx.tada(); } catch { /* supportive only */ }
  const token = flowEpoch;
  await speak(`${season}-stamp`);
  if (token !== flowEpoch || !screens.is('explore')) return true;
  await speak('season-complete');
  if (token !== flowEpoch || !screens.is('explore')) return true;
  timers.after(360, () => {
    if (state.stamps.length >= config.seasonOrder.length) showReward();
    else showWheel();
  });
  return true;
}

function renderReward() {
  el.rewardStamps.replaceChildren();
  for (const [index, season] of config.seasonOrder.entries()) {
    const stamp = document.createElement('img');
    stamp.src = config.seasons[season].stamp;
    stamp.alt = `${config.seasons[season].label} stamp`;
    stamp.style.animationDelay = `${index * 110}ms`;
    el.rewardStamps.append(stamp);
  }

  el.rewardGarments.replaceChildren();
  for (const garment of Object.values(config.garments)) {
    const image = document.createElement('img');
    image.src = garment.path;
    image.alt = garment.alt;
    el.rewardGarments.append(image);
  }
}

function showReward() {
  state.busy = false;
  screens.show('reward');
  soundscape.stop();
  renderReward();
  if (state.mode === 'dress') {
    el.rewardBackground.src = config.assets.backgrounds.splash;
    el.rewardBackdrop.src = config.assets.backgrounds.splash;
    el.rewardBackground.alt = 'The paper mountain shown in all four seasons';
    el.dressReward.hidden = false;
    el.rewardTitle.textContent = 'Juni is ready for every kind of weather!';
  } else {
    el.rewardBackground.src = config.assets.rewardAdventure;
    el.rewardBackdrop.src = config.assets.rewardAdventure;
    el.rewardBackground.alt = 'A four-panel folded paper mountain showing the whole year';
    el.dressReward.hidden = true;
    el.rewardTitle.textContent = 'You found the whole mountain year!';
  }
  burstParticles(el.rewardFx, 'spring', 30, true);
  celebrationDisposer = tada({ confetti: false });
  speak(state.mode === 'dress' ? 'dress-complete' : 'adventure-complete');
}

function goSplash() {
  if (screens.is('explore') && !el.factOverlay.hidden) return false;
  resetSession(null);
  screens.show('splash');
  currentLine = 'choose-mode';
  if (firstGesture) speak('choose-mode');
  return true;
}

function startMode(mode) {
  if (!config.modes[mode]) return Promise.resolve(false);
  return screens.start(async () => {
    resetSession(mode);
    if (mode === 'wheel') showWheel();
    else {
      const season = state.dressOrder[0];
      showDressRound(season, { announce: false });
      setPrompt(el.dressPrompt, 'dress-intro');
      const token = flowEpoch;
      await speak('dress-intro');
      if (token === flowEpoch && screens.is('dress') && !state.busy && state.season === season) {
        setPrompt(el.dressPrompt, `${season}-dress`);
        speak(`${season}-dress`);
        nudger.arm();
      }
    }
    return true;
  }, { busy: false });
}

function installHud() {
  for (const screenName of ['wheel', 'dress', 'explore', 'reward']) {
    const screen = screens.el(screenName);
    const backSlot = $('[data-hud-slot="back"]', screen);
    const soundSlot = $('[data-hud-slot="sound"]', screen);
    const back = hudButton('back', goSplash, { label: 'Back to game choices' });
    back.dataset.target = `${screenName}-back`;
    back.dataset.role = 'navigation';
    const sound = hudButton('sound', soundDebounce(replayCurrentLine), { label: 'Hear it again' });
    sound.dataset.target = `${screenName}-sound`;
    sound.dataset.role = 'audio';
    backSlot.append(back);
    soundSlot.append(sound);
    globalDisposers.push(() => back.dispose(), () => sound.dispose());
  }
}

installHud();
globalDisposers.push(
  onTap(el.modeWheel, () => startMode('wheel'), { feedback: touchFeedback }),
  onTap(el.modeDress, () => startMode('dress'), { feedback: touchFeedback }),
  onTap(el.spinButton, () => assistedSpin(), { feedback: touchFeedback }),
  onTap(el.plantHotspot, () => discover('plant'), { feedback: touchFeedback }),
  onTap(el.animalHotspot, () => discover('animal'), { feedback: touchFeedback }),
  onTap(el.seasonComplete, () => completeSeason(), { feedback: touchFeedback }),
  onTap(el.factClose, closeFact, { feedback: touchFeedback }),
  onTap(el.factReplay, () => currentFact && speak(currentFact), { feedback: touchFeedback }),
  onTap(el.again, () => startMode(state.mode || 'wheel'), { feedback: touchFeedback }),
);

const disposeUnlock = installUnlockOnGesture({
  extra: [soundscape.unlock],
  onFirst() {
    firstGesture = true;
    $('.splash-listen')?.setAttribute('hidden', '');
    if (state.season) soundscape.start(state.season);
    if (screens.is('splash')) {
      const token = flowEpoch;
      speak('welcome').then(() => {
        if (token === flowEpoch && screens.is('splash')) speak('choose-mode');
      });
    }
  },
});
const disposeKiosk = installKioskGuards();
globalDisposers.push(disposeUnlock, disposeKiosk);

function onReducedMotionChange(event) {
  state.reducedMotion = event.matches;
  wheel.setReducedMotion(event.matches);
}

reducedMotionQuery.addEventListener?.('change', onReducedMotionChange);
globalDisposers.push(() => reducedMotionQuery.removeEventListener?.('change', onReducedMotionChange));

function onResize() {
  positionHotspots();
}

window.addEventListener('resize', onResize);
globalDisposers.push(() => window.removeEventListener('resize', onResize));

function onKeyDown(event) {
  if (el.factOverlay.hidden) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeFact();
    return;
  }
  if (event.key === 'Tab') {
    const controls = [el.factClose, el.factReplay].filter((node) => !node.disabled && node.getClientRects().length);
    if (!controls.length) return;
    const first = controls[0];
    const last = controls.at(-1);
    if (!controls.includes(document.activeElement)
      || (!event.shiftKey && document.activeElement === last)
      || (event.shiftKey && document.activeElement === first)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus({ preventScroll: true });
    }
  }
}

window.addEventListener('keydown', onKeyDown);
globalDisposers.push(() => window.removeEventListener('keydown', onKeyDown));

const ready = Promise.resolve(true);
const disposeDebug = installDebug({
  gameId: config.id,
  engine: 'mountain-seasons-custom',
  ready,
  root,
  timers,
  voice,
  sfx,
  narrator: soundscape,
  listModes: () => Object.entries(config.modes).map(([id, mode]) => ({ id, ...mode })),
  startMode,
  getState: () => ({
    screen: screens.current,
    mode: state.mode,
    season: state.season,
    wheelAngle: Math.round(wheel.getAngle() * 100) / 100,
    spinning: wheel.spinning,
    busy: state.busy,
    dressAttempts: state.dressAttempts,
    discoveries: { ...state.discoveries },
    visited: [...state.visited],
    stamps: [...state.stamps],
    dressOrder: [...state.dressOrder],
    dressRound: state.dressRound,
    dressCompleted: [...state.dressCompleted],
    reducedMotion: state.reducedMotion,
    seed: rngSeed,
  }),
  tap: (id) => {
    const target = $$('[data-target]', root).find((node) => node.dataset.target === id && node.getClientRects().length);
    if (!target) return false;
    target.click();
    return true;
  },
  home: goSplash,
  onSeed(nextRng, seed) {
    rng = nextRng;
    rngSeed = seed;
  },
  spin: (season) => assistedSpin(season),
  settleWheel: (season = state.pendingSeason || availableAdventureSeason()) => {
    if (!screens.is('wheel') || !config.seasons[season]) return false;
    wheel.cancel();
    const index = config.seasonOrder.indexOf(season);
    state.pendingSeason = season;
    wheel.setAngle(-index * 90);
    void onWheelSettle(index);
    return true;
  },
  chooseGarment,
  discover,
  completeSeason: () => {
    state.discoveries = { plant: true, animal: true };
    return completeSeason({ force: true });
  },
  completeMode: () => {
    if (!state.mode) return false;
    if (state.mode === 'wheel') {
      state.stamps = [...config.seasonOrder];
      state.visited = [...config.seasonOrder];
    } else {
      state.dressCompleted = [...config.seasonOrder];
      state.dressRound = config.seasonOrder.length;
    }
    showReward();
    return true;
  },
  getAudioLog: voice.getAudioLog,
});
globalDisposers.push(disposeDebug);

renderProgress(el.wheelProgress, []);
renderProgress(el.dressProgress, []);
renderProgress(el.exploreProgress, []);

window.addEventListener('pagehide', () => {
  clearGarmentButtons();
  celebrationDisposer?.();
  timers.clearAll();
  nudger.stop();
  wheel.destroy();
  soundscape.destroy();
  screens.destroy();
  for (const dispose of globalDisposers.splice(0)) {
    try { dispose(); } catch { /* teardown continues */ }
  }
}, { once: true });
