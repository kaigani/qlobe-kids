import config from '../config.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { tada } from '../../../shared/js/celebrate.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug } from '../../../shared/js/debug-harness.js';

const mount = document.getElementById('game');
const ART = config.assets;
const BLOCKS = ART.blocks;
const timers = createTimers();
const narrator = createNarrator();
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

const state = {
  ready: false,
  screen: 'splash',
  mode: 'buddy',
  phase: 'setup',
  placement: 0,
  turn: 1,
  placed: [],
  inputLocked: false,
  dragging: false,
  muted: false,
  seed: 42,
  playerColors: [0, 0],
  reducedMotion: reduceQuery.matches,
};

let rng = mulberry32(state.seed);
let celebrationDispose = null;
let suppressClickUntil = 0;
let roundEpoch = 0;

const P1_COLORS = [
  { name: 'blue', filter: 'brightness(1)', swatch: '#209de0' },
  { name: 'green', filter: 'hue-rotate(78deg) saturate(.92)', swatch: '#79b83d' },
  { name: 'red', filter: 'hue-rotate(145deg) saturate(1.08)', swatch: '#ef543c' },
  { name: 'yellow', filter: 'hue-rotate(205deg) saturate(1.08)', swatch: '#f6c62f' },
];
const P2_COLORS = [
  { name: 'sunny', filter: 'brightness(1)', swatch: '#f6c62f' },
  { name: 'berry', filter: 'hue-rotate(285deg) saturate(1.08)', swatch: '#ef6476' },
  { name: 'ocean', filter: 'hue-rotate(128deg) saturate(1.05)', swatch: '#36a8dc' },
  { name: 'grape', filter: 'hue-rotate(220deg) saturate(1.05)', swatch: '#9b69c9' },
];

mount.innerHTML = `
  <section class="qk-screen game-screen splash-screen" data-qk-screen="splash" aria-label="Build Together setup">
    <img class="viewport-backdrop" src="${ART.background}" alt="" draggable="false" />
    <div class="toy-stage setup-stage">
      <img class="stage-backdrop" src="${ART.background}" alt="" draggable="false" />
      <div class="wood-sign setup-title">
        <img src="${ART.ui['sign-plaque']}" alt="" draggable="false" />
        <h1>${config.displayTitle}</h1>
      </div>

      <div class="player-picker" aria-label="Choose builder colors">
        <button class="player-card player-one-card" type="button" data-target="player-one-color" aria-label="Change the blue builder color">
          <img class="player-card-frame" src="${ART.ui['player-card']}" alt="" draggable="false" />
          <span class="player-name" data-player-one-name>YOU</span>
          <img class="setup-friend friend-one" src="${ART.characters['friend-blue']}" alt="" draggable="false" />
          <span class="color-choice"><i></i><i></i><i></i><i></i></span>
        </button>
        <button class="player-card player-two-card" type="button" data-target="player-two-color" aria-label="Change the second builder color">
          <img class="player-card-frame" src="${ART.ui['player-card']}" alt="" draggable="false" />
          <span class="player-name" data-player-two-name>PIP</span>
          <img class="setup-friend friend-two" src="${ART.characters['friend-yellow']}" alt="" draggable="false" />
          <span class="color-choice"><i></i><i></i><i></i><i></i></span>
        </button>
      </div>

      <div class="mode-picker" aria-label="Choose how to build">
        ${config.modes.map((mode, index) => `
          <button class="plate-button mode-button ${index === 0 ? 'is-selected' : ''}" type="button"
                  data-mode="${mode.id}" data-target="mode-${mode.id}" aria-label="${mode.title}: ${mode.kicker}"
                  aria-pressed="${index === 0 ? 'true' : 'false'}">
            <img src="${index === 0 ? ART.ui['button-blue'] : ART.ui['button-green']}" alt="" draggable="false" />
            <span>${mode.title}</span><small>${mode.kicker}</small>
          </button>`).join('')}
      </div>

      <button class="plate-button start-button" type="button" data-target="start" aria-label="Start building">
        <img src="${ART.ui['button-green']}" alt="" draggable="false" />
        <span>START</span>
      </button>
    </div>
    <div class="splash-hud"></div>
  </section>

  <section class="qk-screen game-screen play-screen" data-qk-screen="play" aria-label="Build the tower" hidden>
    <img class="viewport-backdrop" src="${ART.background}" alt="" draggable="false" />
    <div class="toy-stage play-stage">
      <img class="stage-backdrop" src="${ART.background}" alt="" draggable="false" />
      <div class="wood-sign turn-sign" data-turn-sign>
        <img src="${ART.ui['sign-plaque']}" alt="" draggable="false" />
        <h2 data-turn-title>Your turn!</h2>
        <p data-turn-subtitle>Place one block</p>
      </div>
      <div class="progress-host" data-progress></div>

      <div class="builder builder-one" data-builder="1" aria-hidden="true">
        <span class="builder-glow"></span>
        <img class="builder-image friend-one" src="${ART.characters['friend-blue']}" alt="" draggable="false" />
        <span class="builder-label" data-builder-one-label>YOU</span>
      </div>
      <div class="builder builder-two" data-builder="2" aria-hidden="true">
        <span class="builder-glow"></span>
        <img class="builder-image friend-two" src="${ART.characters['friend-yellow']}" alt="" draggable="false" />
        <span class="builder-label" data-builder-two-label>PIP</span>
      </div>

      <button class="turn-token" type="button" data-target="turn-token" aria-label="Hear whose turn it is">
        <img src="${BLOCKS['turn-token']}" alt="" draggable="false" />
      </button>

      <div class="tower-field" data-tower-field aria-label="Shared tower">
        <img class="tower-base" src="${BLOCKS['tower-base']}" alt="" draggable="false" />
        <div class="placed-layer" data-placed-layer></div>
        <div class="target-layer" data-target-layer></div>
      </div>

      <div class="block-rack" data-block-rack aria-label="Blocks to place"></div>
      <p class="gesture-hint" data-gesture-hint>Drag or tap the glowing block</p>
    </div>
    <div class="play-hud"></div>
  </section>

  <section class="qk-screen game-screen end-screen" data-qk-screen="end" aria-label="Tower celebration" hidden>
    <img class="viewport-backdrop" src="${ART.background}" alt="" draggable="false" />
    <div class="toy-stage end-stage">
      <img class="stage-backdrop" src="${ART.background}" alt="" draggable="false" />
      <div class="wood-sign end-title">
        <img src="${ART.ui['sign-plaque']}" alt="" draggable="false" />
        <h2>We built it together!</h2>
      </div>
      <img class="end-friend end-friend-one friend-one" src="${ART.characters['friend-blue-cheer']}" alt="" draggable="false" />
      <img class="end-friend end-friend-two friend-two" src="${ART.characters['friend-yellow-cheer']}" alt="" draggable="false" />
      <div class="tower-field end-tower" data-end-tower aria-hidden="true">
        <img class="tower-base" src="${BLOCKS['tower-base']}" alt="" draggable="false" />
        <div class="placed-layer" data-end-placed></div>
      </div>
      <div class="end-actions">
        <button class="plate-button again-button" type="button" data-target="again">
          <img src="${ART.ui['button-green']}" alt="" draggable="false" /><span>PLAY AGAIN</span>
        </button>
        <button class="plate-button choose-button" type="button" data-target="choose">
          <img src="${ART.ui['button-blue']}" alt="" draggable="false" /><span>CHOOSE</span>
        </button>
      </div>
    </div>
    <div class="end-hud"></div>
  </section>`;

const els = {
  setup: mount.querySelector('.setup-stage'),
  play: mount.querySelector('.play-stage'),
  end: mount.querySelector('.end-stage'),
  placed: mount.querySelector('[data-placed-layer]'),
  target: mount.querySelector('[data-target-layer]'),
  rack: mount.querySelector('[data-block-rack]'),
  progress: mount.querySelector('[data-progress]'),
  turnSign: mount.querySelector('[data-turn-sign]'),
  turnTitle: mount.querySelector('[data-turn-title]'),
  turnSubtitle: mount.querySelector('[data-turn-subtitle]'),
  token: mount.querySelector('.turn-token'),
  hint: mount.querySelector('[data-gesture-hint]'),
  endPlaced: mount.querySelector('[data-end-placed]'),
};

const screens = createScreens({
  root: mount,
  initial: 'splash',
  splash: 'splash',
  voice: narrator,
  onExit(name) {
    nudger.stop();
    if (name === 'play') {
      timers.clearAll();
      drag.cancel();
      state.dragging = false;
    }
    if (name === 'end') {
      celebrationDispose?.();
      celebrationDispose = null;
    }
  },
});

function addHud() {
  const home = hudButton('home', () => { location.href = '../../'; });
  home.classList.add('qk-hud-top-left');
  home.dataset.target = 'home';
  mount.querySelector('.splash-hud').append(home);

  for (const selector of ['.play-hud', '.end-hud']) {
    const host = mount.querySelector(selector);
    const back = hudButton('back', showSplash, { label: 'Back to Build Together setup' });
    back.classList.add('qk-hud-top-left');
    back.dataset.target = 'back';
    const sound = hudButton('sound', soundDebounce(repeatPrompt, 650));
    sound.classList.add('qk-hud-bottom-left');
    sound.dataset.target = 'sound';
    host.append(back, sound);
  }
}
addHud();

function playSfx(name) {
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* sound never blocks play */ }
}

function speak(key, text = config.voice[key]) {
  return bgm.duckDuring(narrator.say(key, text));
}

function repeatPrompt() {
  if (state.screen === 'end') return speak('together-cheer');
  if (state.screen === 'splash') return speak('choose-mode');
  if (state.phase === 'ai') return speak('buddy-turn');
  if (state.mode === 'two-builders') return speak(state.turn === 1 ? 'player-one-turn' : 'player-two-turn');
  return speak('your-turn');
}

function applyPlayerColors() {
  const one = P1_COLORS[state.playerColors[0]];
  const two = P2_COLORS[state.playerColors[1]];
  mount.style.setProperty('--friend-one-filter', one.filter);
  mount.style.setProperty('--friend-two-filter', two.filter);
  mount.querySelectorAll('.player-one-card .color-choice i').forEach((dot, index) => {
    dot.style.background = P1_COLORS[index].swatch;
    dot.classList.toggle('is-current', index === state.playerColors[0]);
  });
  mount.querySelectorAll('.player-two-card .color-choice i').forEach((dot, index) => {
    dot.style.background = P2_COLORS[index].swatch;
    dot.classList.toggle('is-current', index === state.playerColors[1]);
  });
  mount.querySelector('.player-one-card').setAttribute('aria-label', `First builder color: ${one.name}. Tap to change.`);
  mount.querySelector('.player-two-card').setAttribute('aria-label', `Second builder color: ${two.name}. Tap to change.`);
}

function cycleColor(player) {
  const palette = player === 1 ? P1_COLORS : P2_COLORS;
  state.playerColors[player - 1] = (state.playerColors[player - 1] + 1) % palette.length;
  applyPlayerColors();
  playSfx('pop');
}

function selectMode(id, { speakChoice = true } = {}) {
  if (!config.modes.some((mode) => mode.id === id)) return false;
  state.mode = id;
  mount.querySelectorAll('.mode-button').forEach((button) => {
    button.classList.toggle('is-selected', button.dataset.mode === id);
    button.setAttribute('aria-pressed', button.dataset.mode === id ? 'true' : 'false');
  });
  const buddy = id === 'buddy';
  mount.querySelector('[data-player-one-name]').textContent = buddy ? 'YOU' : 'PLAYER 1';
  mount.querySelector('[data-builder-one-label]').textContent = buddy ? 'YOU' : 'PLAYER 1';
  mount.querySelector('[data-player-two-name]').textContent = buddy ? 'PIP' : 'PLAYER 2';
  mount.querySelector('[data-builder-two-label]').textContent = buddy ? 'PIP' : 'PLAYER 2';
  if (speakChoice) speak(buddy ? 'buddy-intro' : 'two-intro');
  return true;
}

onTap(mount.querySelector('.player-one-card'), () => cycleColor(1), { feedback: () => playSfx('tick') });
onTap(mount.querySelector('.player-two-card'), () => cycleColor(2), { feedback: () => playSfx('tick') });
mount.querySelectorAll('.mode-button').forEach((button) => {
  onTap(button, () => selectMode(button.dataset.mode), { feedback: () => playSfx('tick') });
});
onTap(mount.querySelector('.start-button'), () => startMode(state.mode), { feedback: () => playSfx('whoosh') });
onTap(mount.querySelector('.again-button'), () => startMode(state.mode), { feedback: () => playSfx('whoosh') });
onTap(mount.querySelector('.choose-button'), showSplash, { feedback: () => playSfx('tick') });
onTap(els.token, () => {
  if (state.phase === 'ai') speak('wait-nudge');
  else repeatPrompt();
}, { feedback: () => playSfx('tick') });

function clearRound() {
  roundEpoch += 1;
  timers.clearAll();
  drag.cancel();
  celebrationDispose?.();
  celebrationDispose = null;
  state.placement = 0;
  state.turn = 1;
  state.placed = [];
  state.inputLocked = false;
  state.dragging = false;
  els.placed.replaceChildren();
  els.target.replaceChildren();
  els.rack.replaceChildren();
  return roundEpoch;
}

function showSplash() {
  clearRound();
  state.screen = 'splash';
  state.phase = 'setup';
  screens.show('splash');
  selectMode(state.mode, { speakChoice: false });
  applyPlayerColors();
  return true;
}

async function startMode(id) {
  if (!selectMode(id, { speakChoice: false })) return false;
  return screens.start(async () => {
    const epoch = clearRound();
    state.screen = 'play';
    state.phase = 'intro';
    state.inputLocked = true;
    screens.show('play');
    renderTower();
    updateProgress();
    updateActors();
    bgm.play(config.music.track, { key: 'turn-taking-tower', fadeInMs: 650, loopFadeOutMs: 2300 });
    await speak(id === 'buddy' ? 'buddy-intro' : 'two-intro');
    if (epoch !== roundEpoch || state.screen !== 'play') return false;
    beginTurn();
    return true;
  }, { busy: false });
}

function currentPlacement() {
  return config.tower[state.placement] || null;
}

function pieceImage(entry, extraClass = '') {
  const image = document.createElement('img');
  image.className = `tower-piece ${extraClass}`.trim();
  image.src = BLOCKS[entry.asset];
  image.alt = '';
  image.draggable = false;
  image.dataset.placement = entry.id;
  image.style.left = `${entry.x}%`;
  image.style.top = `${entry.y}%`;
  image.style.width = `${entry.w}%`;
  return image;
}

function renderTower() {
  els.placed.replaceChildren(...state.placed.map((entry) => pieceImage(entry, 'is-placed')));
}

function renderEndTower() {
  els.endPlaced.replaceChildren(...config.tower.map((entry) => pieceImage(entry, 'is-placed')));
}

function renderTarget() {
  els.target.replaceChildren();
  const entry = currentPlacement();
  if (!entry || state.phase !== 'human') return;
  const slot = document.createElement('div');
  slot.className = 'tower-target';
  slot.dataset.slot = entry.id;
  slot.dataset.role = 'drop';
  slot.style.left = `${entry.x}%`;
  slot.style.top = `${entry.y}%`;
  slot.style.width = `${Math.max(entry.w, 18)}%`;
  slot.append(pieceImage({ ...entry, x: 50, y: 50, w: 100 }, 'target-piece'));
  els.target.append(slot);
}

function candidateAssets() {
  const current = currentPlacement();
  if (!current) return [];
  const pool = config.tower
    .slice(state.placement + 1)
    .map((entry) => entry.asset)
    .filter((asset, index, values) => asset !== current.asset && values.indexOf(asset) === index);
  const fallback = config.tower.map((entry) => entry.asset).filter((asset) => asset !== current.asset);
  const decoys = shuffle(pool.length >= 2 ? pool : fallback, rng).slice(0, 2);
  return shuffle([current.asset, ...decoys], rng);
}

function renderRack() {
  els.rack.replaceChildren();
  if (state.phase !== 'human') {
    els.rack.classList.add('is-waiting');
    return;
  }
  els.rack.classList.remove('is-waiting');
  const correct = currentPlacement()?.asset;
  for (const asset of candidateAssets()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `block-choice ${asset === correct ? 'is-correct' : ''}`;
    button.dataset.piece = asset;
    button.dataset.target = `block-${asset}`;
    button.dataset.role = asset === correct ? 'correct' : 'wrong';
    button.setAttribute('aria-label', asset === correct ? 'The glowing block' : 'A block for later');
    const image = document.createElement('img');
    image.src = BLOCKS[asset];
    image.alt = '';
    image.draggable = false;
    button.append(image);
    button.addEventListener('pointerdown', (event) => drag.begin(event, asset));
    button.addEventListener('click', () => {
      if (performance.now() < suppressClickUntil) return;
      attemptPiece(asset, { onTarget: true, source: button });
    });
    els.rack.append(button);
  }
}

function updateProgress() {
  els.progress.replaceChildren(progressDots(config.tower.length, state.placement));
}

function updateActors() {
  mount.querySelectorAll('.builder').forEach((builder) => {
    builder.classList.toggle('is-active', Number(builder.dataset.builder) === state.turn && state.screen === 'play');
    builder.classList.toggle('is-waiting', Number(builder.dataset.builder) !== state.turn && state.screen === 'play');
  });
  els.token.classList.toggle('is-right', state.turn === 2);
  els.turnSign.classList.toggle('is-green', state.turn === 2);
}

function paintTurn() {
  const buddyTurn = state.mode === 'buddy' && state.turn === 2;
  if (buddyTurn) {
    els.turnTitle.textContent = "Pip's turn";
    els.turnSubtitle.textContent = 'Watch and wait';
    els.hint.textContent = 'Cheer for Pip!';
  } else if (state.mode === 'two-builders') {
    els.turnTitle.textContent = state.turn === 1 ? "Player 1's turn" : "Player 2's turn";
    els.turnSubtitle.textContent = 'Place one block';
    els.hint.textContent = 'Drag or tap the glowing block';
  } else {
    els.turnTitle.textContent = 'Your turn!';
    els.turnSubtitle.textContent = 'Place one block';
    els.hint.textContent = 'Drag or tap the glowing block';
  }
  updateActors();
}

function beginTurn() {
  if (state.screen !== 'play') return false;
  const entry = currentPlacement();
  if (!entry) return finishTower();
  state.turn = entry.owner;
  state.dragging = false;
  const isAi = state.mode === 'buddy' && state.turn === 2;
  state.phase = isAi ? 'ai' : 'human';
  state.inputLocked = isAi;
  paintTurn();
  updateProgress();
  renderTarget();
  renderRack();
  if (isAi) {
    speak('buddy-turn');
    timers.after(720, animateBuddyTurn);
  } else {
    const key = state.mode === 'two-builders'
      ? (state.turn === 1 ? 'player-one-turn' : 'player-two-turn')
      : 'your-turn';
    if (entry.shape === 'roof') narrator.saySequence([
      { key, text: config.voice[key] },
      { key: 'roof-turn', text: config.voice['roof-turn'], gap: 180 },
    ]);
    else speak(key);
    nudger.arm();
  }
}

function pulse(node, className = 'is-wrong') {
  if (!node) return;
  node.classList.remove(className);
  requestAnimationFrame(() => node.classList.add(className));
  timers.after(650, () => node.classList.remove(className));
}

function attemptPiece(asset, { onTarget = true, source = null } = {}) {
  if (state.screen !== 'play') return false;
  if (state.phase !== 'human' || state.inputLocked) {
    speak('wait-nudge');
    pulse(els.token, 'is-nudging');
    return false;
  }
  const entry = currentPlacement();
  if (!entry) return false;
  if (asset !== entry.asset) {
    playSfx('unpop');
    pulse(source || els.rack.querySelector(`[data-piece="${asset}"]`));
    pulse(els.target.firstElementChild, 'is-hinting');
    speak('wrong-shape');
    nudger.poke();
    return false;
  }
  if (!onTarget) {
    playSfx('unpop');
    pulse(els.target.firstElementChild, 'is-hinting');
    speak('place-block');
    nudger.poke();
    return false;
  }
  placeCurrent({ byBuddy: false });
  return true;
}

async function placeCurrent({ byBuddy }) {
  const epoch = roundEpoch;
  const entry = currentPlacement();
  if (state.screen !== 'play' || !entry || state.inputLocked && !byBuddy) return false;
  state.inputLocked = true;
  state.phase = 'settling';
  nudger.stop();
  state.placed.push(entry);
  state.placement += 1;
  renderTarget();
  renderRack();
  renderTower();
  updateProgress();
  const piece = els.placed.querySelector(`[data-placement="${entry.id}"]`);
  piece?.classList.add('just-placed');
  playSfx('pop');
  try { navigator.vibrate?.(18); } catch { /* optional */ }

  const halfway = state.placement === Math.ceil(config.tower.length / 2);
  const praise = halfway ? 'halfway' : (byBuddy ? 'buddy-placed' : 'good-place');
  if (state.placement < config.tower.length) {
    await Promise.race([speak(praise), timers.wait(1650)]);
    await timers.wait(120);
  } else {
    await timers.wait(360);
  }
  if (epoch !== roundEpoch || state.screen !== 'play') return false;
  if (state.placement >= config.tower.length) return finishTower();
  beginTurn();
  return true;
}

async function animateBuddyTurn() {
  const epoch = roundEpoch;
  if (state.screen !== 'play' || state.phase !== 'ai') return;
  const entry = currentPlacement();
  const target = document.createElement('div');
  target.className = 'tower-target ai-target';
  target.style.left = `${entry.x}%`;
  target.style.top = `${entry.y}%`;
  target.style.width = `${Math.max(entry.w, 18)}%`;
  els.target.replaceChildren(target);

  const flyer = document.createElement('img');
  flyer.className = 'ai-flying-block';
  flyer.src = BLOCKS[entry.asset];
  flyer.alt = '';
  flyer.draggable = false;
  document.body.append(flyer);
  const from = mount.querySelector('.builder-two .builder-image').getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const width = Math.max(82, to.width);
  Object.assign(flyer.style, {
    width: `${width}px`,
    left: `${from.left + from.width * .5}px`,
    top: `${from.top + from.height * .35}px`,
  });
  const duration = state.reducedMotion ? 1 : timers.ms(820);
  const animation = flyer.animate([
    { left: `${from.left + from.width * .5}px`, top: `${from.top + from.height * .35}px`, transform: 'translate(-50%, -50%) scale(.78) rotate(7deg)' },
    { left: `${to.left + to.width * .5}px`, top: `${to.top + to.height * .5}px`, transform: 'translate(-50%, -50%) scale(1.04) rotate(-3deg)', offset: .82 },
    { left: `${to.left + to.width * .5}px`, top: `${to.top + to.height * .5}px`, transform: 'translate(-50%, -50%) scale(1) rotate(0)' },
  ], { duration, easing: 'cubic-bezier(.2,.82,.28,1)', fill: 'forwards' });
  await Promise.race([animation.finished.catch(() => {}), timers.wait(900)]);
  flyer.remove();
  if (epoch !== roundEpoch || state.screen !== 'play' || state.phase !== 'ai') return;
  await placeCurrent({ byBuddy: true });
}

async function finishTower() {
  const epoch = roundEpoch;
  if (state.screen !== 'play') return false;
  state.phase = 'complete';
  state.inputLocked = true;
  await timers.wait(420);
  if (epoch !== roundEpoch || state.screen !== 'play') return false;
  state.screen = 'end';
  screens.show('end');
  renderEndTower();
  updateActors();
  celebrationDispose?.();
  celebrationDispose = tada({ host: els.end, count: 42, duration: 3000, rng });
  await speak('together-cheer');
  return true;
}

const drag = createDragToSlotDom({
  root: els.play,
  ghostHost: document.body,
  slotSelector: '[data-slot]',
  slotPad: 72,
  hoverClass: 'is-hovered',
  ghostClass: 'block-choice dragging',
  grabOffset: .4,
  getPiece(asset) {
    const el = els.rack.querySelector(`[data-piece="${asset}"]`);
    return el ? { el, asset } : null;
  },
  canStart: () => state.screen === 'play' && state.phase === 'human' && !state.inputLocked,
  onGrab() {
    state.dragging = true;
    nudger.poke();
    return true;
  },
  onDrop(piece, record) {
    state.dragging = false;
    suppressClickUntil = performance.now() + 140;
    return attemptPiece(piece.asset, {
      onTarget: record.slot?.dataset.slot === currentPlacement()?.id,
      source: piece.el,
    });
  },
  onCancel() {
    state.dragging = false;
    suppressClickUntil = performance.now() + 140;
  },
});

const nudger = createNudger({
  first: 9500,
  repeat: 13000,
  onNudge() {
    if (state.screen !== 'play') return;
    if (state.phase === 'human') {
      speak('idle');
      pulse(els.rack.querySelector('.is-correct'), 'is-hinting');
      pulse(els.target.firstElementChild, 'is-hinting');
    } else if (state.phase === 'ai') {
      speak('wait-nudge');
      pulse(els.token, 'is-nudging');
    }
  },
});

bgm.preload(config.music.track);
bgm.setVolume(config.music.volume);
const disposeUnlock = installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => {
    bgm.play(config.music.track, { key: 'turn-taking-tower', fadeInMs: 650, loopFadeOutMs: 2300 });
    if (state.screen === 'splash') narrator.saySequence([
      { key: 'welcome', text: config.voice.welcome },
      { key: 'choose-mode', text: config.voice['choose-mode'], gap: 180 },
    ]);
  },
});
const disposeKiosk = installKioskGuards();

const assetUrls = [
  ART.background,
  ...Object.values(ART.characters),
  ...Object.values(ART.ui),
  ...Object.values(BLOCKS),
];
const ready = Promise.all([
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(assetUrls),
]).then(() => {
  state.ready = true;
  return true;
});

const disposeDebug = installDebug({
  gameId: config.id,
  engine: 'turn-taking-tower-custom',
  ready,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  root: mount,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: () => ({
    ...state,
    playerColors: [...state.playerColors],
    placed: state.placed.map(({ id, asset, owner }) => ({ id, asset, owner })),
    current: currentPlacement() ? { ...currentPlacement() } : null,
  }),
  tap(id) {
    const node = [...mount.querySelectorAll('[data-target]')].find((item) => item.dataset.target === id && item.getClientRects().length);
    if (!node) return false;
    node.click();
    return true;
  },
  winRound() {
    const entry = currentPlacement();
    if (!entry) return false;
    if (state.phase === 'ai') return placeCurrent({ byBuddy: true });
    return attemptPiece(entry.asset, { onTarget: true });
  },
  completeTower() {
    if (state.screen !== 'play') return false;
    state.placed = config.tower.map((entry) => ({ ...entry }));
    state.placement = config.tower.length;
    renderTower();
    updateProgress();
    return finishTower();
  },
  attempt(asset, onTarget = true) {
    return attemptPiece(asset, { onTarget });
  },
  home: showSplash,
  mute(on = true) {
    state.muted = Boolean(on);
    narrator.setMuted(state.muted);
    voiceClips.setMuted(state.muted);
    sfx.setMuted(state.muted);
    bgm.setMuted(state.muted);
    return state.muted;
  },
  onSeed(next, seed) {
    rng = next;
    state.seed = seed;
    if (state.phase === 'human') renderRack();
  },
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  getAudioState: () => ({ bgm: bgm.stats(), voiceMuted: voiceClips.isMuted(), sfxMuted: sfx.isMuted() }),
});

applyPlayerColors();
selectMode('buddy', { speakChoice: false });
updateActors();

reduceQuery.addEventListener('change', (event) => { state.reducedMotion = event.matches; });
window.addEventListener('pagehide', () => {
  timers.clearAll();
  celebrationDispose?.();
  drag.detach();
  bgm.stop({ fadeOutMs: 0 });
  narrator.dispose();
  disposeUnlock();
  disposeKiosk();
  disposeDebug();
}, { once: true });
