import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import { onTap } from '../../../shared/js/tap.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { burstConfetti, tada } from '../../../shared/js/celebrate.js';

const mount = document.getElementById('game');
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
const timers = createTimers();
const narrator = createNarrator();
const shelfRuns = Object.fromEntries(config.shelves.map((shelf) => [shelf.id, 0]));
const PRAISE = ['praise-one', 'praise-two', 'praise-three'];

const state = {
  screen: 'splash',
  phase: 'choose',
  shelfId: null,
  items: [],
  bins: [],
  selectedId: null,
  placedCount: 0,
  wrongAttempts: 0,
  inputLocked: false,
  muted: false,
  seed: 42,
  roundSerial: 0,
};

let rng = mulberry32(state.seed);
let dragController = null;
let ambientConfetti = null;
let pendingWelcome = true;
let roundEpoch = 0;

mount.innerHTML = `
  <section class="reset-screen reset-splash" data-qk-screen="splash"></section>
  <section class="reset-screen reset-play" data-qk-screen="play" hidden></section>
  <section class="reset-screen reset-reward" data-qk-screen="reward" hidden></section>
`;

const screens = createScreens({
  root: mount,
  initial: 'splash',
  voice: narrator,
  onExit(name) {
    if (name === 'play') stopRoundSystems();
    if (name === 'reward' && ambientConfetti) {
      ambientConfetti();
      ambientConfetti = null;
    }
  },
});

const criticalArt = [
  './assets/art/room.webp',
  './assets/art/title-plaque.webp',
  './assets/art/progress-pill.webp',
  './assets/art/shelf-frame.webp',
  './assets/art/tray.webp',
  './assets/art/helper-neutral.webp',
  './assets/art/helper-point.webp',
  './assets/art/helper-cheer.webp',
  ...config.shelves.flatMap((shelf) => [
    shelf.card,
    ...shelf.bins.map((bin) => bin.asset),
    ...shelf.items.map((item) => item.asset),
  ]),
];

bgm.preload(config.music.track);
bgm.setVolume(config.music.volume ?? 0.12);
const ready = Promise.all([
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  preloadImages(criticalArt),
]).then(() => {
  mount.classList.remove('is-loading');
  mount.setAttribute('aria-busy', 'false');
  return true;
});

function say(key) {
  const speech = narrator.say(key, config.voice[key]);
  return state.screen === 'play' ? bgm.duckDuring(speech) : speech;
}

function saySequence(keys) {
  const speech = narrator.saySequence(keys.map((key, index) => ({
    key,
    text: config.voice[key],
    gap: index ? 170 : 0,
  })));
  return state.screen === 'play' ? bgm.duckDuring(speech) : speech;
}

function feedback(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  if (!state.muted) sfx.tick();
}

function addHud(screen, kind, onPress, position, label) {
  const button = hudButton(kind, onPress, { label });
  button.classList.add(position);
  button.dataset.target = kind;
  screen.append(button);
  screens.hold(button.dispose);
  return button;
}

function setRoomBackdrop(screen) {
  screen.style.setProperty('--room-backdrop', 'url("../assets/art/room.webp")');
}

function shelfById(id) {
  return config.shelves.find((shelf) => shelf.id === id) || config.shelves[0];
}

function plaqueMarkup(text, modifier = '') {
  return `
    <div class="wood-plaque ${modifier}">
      <img src="./assets/art/title-plaque.webp" alt="" draggable="false">
      <span>${text}</span>
    </div>
  `;
}

function cardMarkup({ compact = false } = {}) {
  return config.shelves.map((shelf) => `
    <button class="shelf-card ${compact ? 'is-compact' : ''}" type="button"
            data-shelf="${shelf.id}" data-target="shelf-${shelf.id}" data-role="choice"
            aria-label="Choose the ${shelf.title}">
      <img src="${shelf.card}" alt="" draggable="false">
      <span>${shelf.title}</span>
      ${shelfRuns[shelf.id] ? '<i class="ready-dot" aria-hidden="true"></i>' : ''}
    </button>
  `).join('');
}

function renderSplash({ announce = false } = {}) {
  roundEpoch += 1;
  stopRoundSystems();
  state.screen = 'splash';
  state.phase = 'choose';
  state.shelfId = null;
  state.items = [];
  state.bins = [];
  state.selectedId = null;
  state.placedCount = 0;
  state.inputLocked = false;
  const screen = screens.el('splash');
  setRoomBackdrop(screen);
  screen.innerHTML = `
    <div class="room-soften" aria-hidden="true"></div>
    <header class="splash-title">
      <h1 class="visually-hidden">Shelf Reset</h1>
      ${plaqueMarkup('Shelf Reset')}
      <div class="prompt-pill">
        <img src="./assets/art/progress-pill.webp" alt="" draggable="false">
        <span>Choose a shelf</span>
      </div>
    </header>
    <img class="sunny sunny-neutral" src="./assets/art/helper-neutral.webp" alt="Sunny, your shelf helper" draggable="false">
    <div class="shelf-deck" aria-label="Choose a shelf">${cardMarkup()}</div>
  `;
  screens.show('splash', { force: screens.current === 'splash' });
  addHud(screen, 'home', () => { window.location.href = '../../'; }, 'qk-hud-top-left', 'Back to all games');
  addHud(screen, 'sound', soundDebounce(() => say('choose-another'), 650), 'qk-hud-top-right', 'Hear the choices again');
  screen.querySelectorAll('[data-shelf]').forEach((card) => {
    screens.hold(onTap(card, () => startShelf(card.dataset.shelf), { feedback }));
  });
  if (announce) say('choose-another');
}

async function startShelf(shelfId) {
  return screens.start(async () => {
    const epoch = ++roundEpoch;
    await ready;
    if (epoch !== roundEpoch) return false;
    const shelf = shelfById(shelfId);
    state.shelfId = shelf.id;
    state.items = shuffle(shelf.items, rng).map((item) => ({ ...item, placed: false }));
    state.bins = shelf.bins.map((bin) => ({ ...bin }));
    state.selectedId = null;
    state.placedCount = 0;
    state.wrongAttempts = 0;
    state.inputLocked = false;
    state.phase = 'sorting';
    state.screen = 'play';
    state.roundSerial += 1;
    renderPlay(shelf);
    screens.show('play');
    startRoundSystems();
    await say(shelf.promptKey);
    return true;
  }, { busy: false });
}

function itemMarkup(item, index) {
  return `
    <button class="loose-item" type="button" data-item="${item.id}"
            data-target="item-${item.id}" data-role="piece"
            aria-label="Move the ${item.name}" style="--item-i:${index}">
      <img src="${item.asset}" alt="" draggable="false">
    </button>
  `;
}

function storedMarkup(homeId, reward = false) {
  const matching = state.items.filter((item) => item.home === homeId && (reward || item.placed));
  return matching.map((item, index) => `
    <img src="${item.asset}" alt="" draggable="false" style="--stored-i:${index}">
  `).join('');
}

function binMarkup(bin, index) {
  return `
    <button class="shelf-bin" type="button" data-slot data-bin="${bin.id}"
            data-target="bin-${bin.id}" data-role="slot" aria-label="${bin.id.replaceAll('-', ' ')} home"
            style="--bin-i:${index}">
      <span class="bin-glow" aria-hidden="true"></span>
      <img class="home-marker" src="${bin.asset}" alt="" draggable="false">
      <span class="stored-items" aria-hidden="true">${storedMarkup(bin.id)}</span>
    </button>
  `;
}

function shelfStageMarkup({ reward = false } = {}) {
  return `
    <div class="shelf-stage ${reward ? 'is-reward' : ''}" aria-label="Three picture-marked shelf homes">
      <img class="shelf-frame" src="./assets/art/shelf-frame.webp" alt="" draggable="false">
      <div class="cubby-row">
        ${state.bins.map((bin, index) => reward ? `
          <div class="shelf-bin reward-bin" style="--bin-i:${index}">
            <img class="home-marker" src="${bin.asset}" alt="" draggable="false">
            <span class="stored-items" aria-hidden="true">${storedMarkup(bin.id, true)}</span>
          </div>
        ` : binMarkup(bin, index)).join('')}
      </div>
    </div>
  `;
}

function progressMarkup() {
  const left = state.items.length - state.placedCount;
  return `
    <div class="progress-plaque" aria-label="${left} objects left">
      <img src="./assets/art/progress-pill.webp" alt="" draggable="false">
      <span>${left ? `${left} left` : 'All home!'}</span>
    </div>
  `;
}

function renderPlay(shelf) {
  const screen = screens.el('play');
  screen.dataset.shelf = shelf.id;
  setRoomBackdrop(screen);
  screen.innerHTML = `
    <div class="play-warmth" aria-hidden="true"></div>
    <header class="play-heading">
      <h1 class="visually-hidden">Put the ${shelf.title} back</h1>
      ${progressMarkup()}
    </header>
    ${shelfStageMarkup()}
    <section class="sorting-tray" aria-label="Things waiting for their homes">
      <img class="tray-art" src="./assets/art/tray.webp" alt="" draggable="false">
      <div class="loose-items">${state.items.map(itemMarkup).join('')}</div>
    </section>
    <img class="sunny sunny-point" src="./assets/art/helper-point.webp" alt="Sunny points toward the shelf" draggable="false">
    <div class="sparkle-layer" aria-hidden="true"></div>
    <p class="live-message visually-hidden" aria-live="polite"></p>
  `;
  screens.show('play', { force: screens.current === 'play' });
  addHud(screen, 'back', () => renderSplash(), 'qk-hud-top-left', 'Back to shelf choices');
  addHud(screen, 'sound', soundDebounce(() => say(shelf.promptKey), 650), 'qk-hud-top-right', 'Hear the directions again');
  wirePlayInput(screen);
  updatePlayHud();
}

function wirePlayInput(screen) {
  dragController = createDragToSlotDom({
    root: screen,
    ghostHost: screen,
    slotSelector: '[data-slot]',
    slotPad: 48,
    hoverClass: 'is-hovered',
    ghostClass: 'qk-drag-ghost shelf-drag-ghost',
    grabOffset: 0.24,
    getPiece(id) {
      const item = state.items.find((entry) => entry.id === id && !entry.placed);
      if (!item) return null;
      return { ...item, el: screen.querySelector(`[data-item="${item.id}"]`) };
    },
    canStart: () => state.screen === 'play' && !state.inputLocked,
    onGrab(piece, drag) {
      nudge.poke();
      drag.wasSelected = state.selectedId === piece.id;
      if (!drag.wasSelected) selectItem(piece.id, { speak: false });
      return true;
    },
    onLift(piece) {
      piece.el?.classList.add('is-lifting');
      if (!state.muted) sfx.whoosh();
    },
    onDrop: async (piece, drag) => {
      piece.el?.classList.remove('is-lifting');
      await attemptPlacement(piece.id, drag.slot?.dataset.bin || null);
    },
    onCancel(piece) {
      piece.el?.classList.remove('is-lifting');
    },
    onTap(piece, drag) {
      if (drag.wasSelected) selectItem(piece.id, { speak: false });
      else say(voiceForHome(piece.home));
    },
  });
  screens.hold(() => {
    dragController?.cancel();
    dragController?.detach();
    dragController = null;
  });

  screen.querySelectorAll('[data-item]').forEach((button) => {
    const pointerDown = (event) => dragController?.begin(event, button.dataset.item);
    const keyDown = (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      selectItem(button.dataset.item, { speak: true });
    };
    button.addEventListener('pointerdown', pointerDown);
    button.addEventListener('keydown', keyDown);
    screens.hold(() => {
      button.removeEventListener('pointerdown', pointerDown);
      button.removeEventListener('keydown', keyDown);
    });
  });

  screen.querySelectorAll('[data-bin]').forEach((bin) => {
    screens.hold(onTap(bin, () => {
      nudge.poke();
      if (state.selectedId) attemptPlacement(state.selectedId, bin.dataset.bin);
      else {
        bin.classList.add('is-speaking');
        timers.after(620, () => bin.classList.remove('is-speaking'));
        say(voiceForHome(bin.dataset.bin));
      }
    }, { feedback }));
  });
}

function voiceForHome(homeId) {
  return state.bins.find((bin) => bin.id === homeId)?.voiceKey || shelfById(state.shelfId).promptKey;
}

function selectItem(itemId, { speak: speakHint } = {}) {
  if (state.inputLocked || state.screen !== 'play') return false;
  const item = state.items.find((entry) => entry.id === itemId && !entry.placed);
  if (!item) return false;
  const deselect = state.selectedId === item.id;
  state.selectedId = deselect ? null : item.id;
  const screen = screens.el('play');
  screen.querySelectorAll('[data-item]').forEach((node) => {
    node.classList.toggle('is-selected', !deselect && node.dataset.item === item.id);
  });
  screen.querySelectorAll('[data-bin]').forEach((node) => {
    node.classList.toggle('is-hinted', !deselect && node.dataset.bin === item.home);
  });
  if (!state.muted) sfx.pop();
  if (speakHint && !deselect) say(voiceForHome(item.home));
  return true;
}

async function attemptPlacement(itemId, homeId) {
  if (state.inputLocked || state.screen !== 'play') return false;
  const item = state.items.find((entry) => entry.id === itemId && !entry.placed);
  if (!item) return false;
  const epoch = roundEpoch;
  const shelfId = state.shelfId;
  nudge.poke();
  if (!homeId) {
    selectItem(item.id, { speak: false });
    return false;
  }
  const screen = screens.el('play');
  const bin = screen.querySelector(`[data-bin="${homeId}"]`);
  if (item.home !== homeId) {
    state.wrongAttempts += 1;
    bin?.classList.remove('is-wrong');
    void bin?.offsetWidth;
    bin?.classList.add('is-wrong');
    screen.querySelector(`[data-item="${item.id}"]`)?.classList.add('is-wrong');
    screen.querySelector('.sunny-point')?.classList.add('is-helping');
    timers.after(620, () => {
      bin?.classList.remove('is-wrong');
      screen.querySelector(`[data-item="${item.id}"]`)?.classList.remove('is-wrong');
      screen.querySelector('.sunny-point')?.classList.remove('is-helping');
    });
    if (!state.muted) sfx.silly();
    screen.querySelector('.live-message').textContent = config.voice['wrong-home'];
    say('wrong-home');
    return false;
  }

  state.inputLocked = true;
  const source = screen.querySelector(`[data-item="${item.id}"]`);
  await animateLanding(source, bin);
  if (epoch !== roundEpoch || state.screen !== 'play' || state.shelfId !== shelfId) return false;
  item.placed = true;
  state.placedCount += 1;
  state.selectedId = null;
  source?.classList.add('is-placed');
  bin?.classList.add('has-delivery');
  addStoredItem(bin, item);
  if (!state.muted) sfx.sparkle();
  sparkleAt(bin);
  updatePlayHud();
  state.inputLocked = false;

  if (state.placedCount >= state.items.length) {
    state.phase = 'celebrating';
    state.inputLocked = true;
    await timers.wait(520);
    if (epoch !== roundEpoch || state.screen !== 'play' || state.shelfId !== shelfId) return false;
    showReward(shelfById(state.shelfId));
  } else if (state.placedCount === 3) {
    say('halfway');
  } else {
    say(PRAISE[(state.placedCount - 1) % PRAISE.length]);
  }
  return true;
}

function animateLanding(source, bin) {
  if (!source || !bin || reducedMotion || typeof source.animate !== 'function') return Promise.resolve();
  const from = source.getBoundingClientRect();
  const to = bin.getBoundingClientRect();
  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height * 0.48 - (from.top + from.height / 2);
  const animation = source.animate([
    { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
    { transform: `translate(${dx * 0.48}px, ${dy * 0.34 - 42}px) rotate(-7deg) scale(1.12)`, offset: 0.48 },
    { transform: `translate(${dx}px, ${dy}px) rotate(3deg) scale(.58)` },
  ], { duration: timers.ms(540), easing: 'cubic-bezier(.2,.85,.28,1)', fill: 'forwards' });
  return Promise.race([animation.finished.catch(() => undefined), timers.wait(700)]);
}

function addStoredItem(bin, item) {
  const host = bin?.querySelector('.stored-items');
  if (!host) return;
  const index = state.items.filter((entry) => entry.home === item.home && entry.placed).length - 1;
  const image = document.createElement('img');
  image.src = item.asset;
  image.alt = '';
  image.draggable = false;
  image.style.setProperty('--stored-i', index);
  host.append(image);
}

function sparkleAt(target) {
  const layer = screens.el('play').querySelector('.sparkle-layer');
  if (!layer || !target) return;
  const base = layer.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const x = rect.left - base.left + rect.width / 2;
  const y = rect.top - base.top + rect.height * 0.36;
  for (let index = 0; index < 10; index += 1) {
    const sparkle = document.createElement('i');
    sparkle.style.setProperty('--spark-x', `${x}px`);
    sparkle.style.setProperty('--spark-y', `${y}px`);
    sparkle.style.setProperty('--spark-angle', `${index * 36}deg`);
    layer.append(sparkle);
    timers.after(760, () => sparkle.remove());
  }
}

function updatePlayHud() {
  const screen = screens.el('play');
  const old = screen.querySelector('.progress-plaque');
  if (old) old.outerHTML = progressMarkup();
  screen.querySelectorAll('[data-bin]').forEach((bin) => {
    const selected = state.items.find((item) => item.id === state.selectedId);
    bin.classList.toggle('is-hinted', Boolean(selected && selected.home === bin.dataset.bin));
  });
}

function startRoundSystems() {
  bgm.unlock();
  bgm.play(config.music.track, { key: 'shelf-reset' });
  nudge.arm();
  screens.hold(nudge.stop);
  screens.hold(() => bgm.stop());
}

function stopRoundSystems({ musicFadeMs = 1200 } = {}) {
  nudge.stop();
  bgm.stop({ fadeOutMs: musicFadeMs });
  dragController?.cancel();
  timers.clearAll();
}

const nudge = createNudger({
  first: 10500,
  repeat: 13500,
  onNudge(index) {
    if (state.screen !== 'play') return;
    if (index === 0) say(shelfById(state.shelfId).promptKey);
    else {
      const next = state.items.find((item) => !item.placed);
      if (next) selectItem(next.id, { speak: true });
    }
  },
});

function showReward(shelf) {
  // Reward speech starts immediately, so finish the round's music fade before
  // it can compete with the celebration or be revived by a speech-duck tween.
  stopRoundSystems({ musicFadeMs: 300 });
  shelfRuns[shelf.id] += 1;
  state.screen = 'reward';
  state.phase = 'reward';
  const screen = screens.el('reward');
  screen.dataset.shelf = shelf.id;
  setRoomBackdrop(screen);
  screen.innerHTML = `
    <div class="reward-warmth" aria-hidden="true"></div>
    <header class="reward-title">${plaqueMarkup('Shelf ready!', 'is-reward')}</header>
    ${shelfStageMarkup({ reward: true })}
    <div class="empty-tray" aria-label="The sorting tray is empty">
      <img src="./assets/art/tray.webp" alt="" draggable="false">
    </div>
    <img class="sunny sunny-cheer" src="./assets/art/helper-cheer.webp" alt="Sunny cheers for the neat shelf" draggable="false">
    <button class="again-button" type="button" data-action="again" data-target="again" aria-label="Reset this shelf again">
      <img src="../../shared/assets/ui/btn-play.png" alt="" draggable="false">
      <span>Again!</span>
    </button>
  `;
  screens.show('reward');
  // screens.show() also runs the play screen's graceful exit fade. Seal that
  // transition before reward narration begins so no older duck tween can
  // cancel the fade callback and leave the round track playing.
  bgm.stop({ fadeOutMs: 0 });
  addHud(screen, 'back', () => renderSplash({ announce: true }), 'qk-hud-top-left', 'Back to shelf choices');
  addHud(screen, 'sound', soundDebounce(() => saySequence([shelf.cheerKey, 'sparkling']), 650), 'qk-hud-top-right', 'Hear the celebration again');
  const again = screen.querySelector('[data-action="again"]');
  screens.hold(onTap(again, () => startShelf(shelf.id), { feedback }));
  if (!state.muted) tada({ host: screen, count: 46, duration: 2300, rng: mulberry32(state.seed + state.roundSerial) });
  ambientConfetti = burstConfetti({
    host: screen,
    count: 20,
    loop: true,
    duration: 4400,
    drift: 42,
    rng: mulberry32(state.seed + 900 + state.roundSerial),
    piece: { width: 12, height: 12, radius: '50%' },
  });
  saySequence([shelf.cheerKey, 'sparkling']);
}

function tapDebugTarget(id) {
  if (id === 'back') {
    renderSplash();
    return true;
  }
  if (id === 'sound') {
    if (state.screen === 'play') say(shelfById(state.shelfId).promptKey);
    else if (state.screen === 'reward') say('sparkling');
    else say('choose-another');
    return true;
  }
  if (id === 'again' && state.shelfId) return startShelf(state.shelfId);
  if (id.startsWith('shelf-')) return startShelf(id.slice(6));
  if (id.startsWith('item-')) return selectItem(id.slice(5), { speak: false });
  if (id.startsWith('bin-') && state.selectedId) return attemptPlacement(state.selectedId, id.slice(4));
  return false;
}

async function winRound() {
  if (state.screen === 'splash') await startShelf(state.shelfId || 'art');
  if (state.screen !== 'play') return false;
  for (const item of state.items.filter((entry) => !entry.placed)) {
    await attemptPlacement(item.id, item.home);
    if (state.screen !== 'play') break;
  }
  return true;
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  return state.muted;
}

installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: (event) => {
    if (pendingWelcome && state.screen === 'splash') {
      pendingWelcome = false;
      if (event?.target?.closest?.('[data-shelf]')) return;
      say('welcome');
    }
  },
});
window.addEventListener('pointerdown', () => voiceClips.unlock(), { passive: true });
installKioskGuards();

installDebug({
  gameId: config.id,
  engine: 'shelf-reset-custom',
  version: 1,
  ready,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  listModes: () => config.shelves.map((shelf) => ({ id: shelf.id, title: shelf.title })),
  startMode: (id) => startShelf(id),
  getState: () => ({
    ...state,
    items: state.items.map(({ id, home, name, placed }) => ({ id, home, name, placed })),
    bins: state.bins.map(({ id, voiceKey }) => ({ id, voiceKey })),
    shelfRuns: { ...shelfRuns },
    timerScale: timers.getScale(),
  }),
  getTargets: () => collectTargets(mount),
  tap: tapDebugTarget,
  winRound,
  mute: setMuted,
  seed: (value) => {
    state.seed = Number(value) >>> 0;
    rng = mulberry32(state.seed);
    for (const id of Object.keys(shelfRuns)) shelfRuns[id] = 0;
    return state.seed;
  },
  fastTimers: (scale = 0.05) => {
    const number = Number(scale);
    const multiplier = Number.isFinite(number) && number > 0
      ? Math.min(1, Math.max(0.01, number > 1 ? 1 / number : number))
      : 0.05;
    timers.setScale(1 / multiplier);
    return multiplier;
  },
  home: () => renderSplash(),
  wrong: async () => {
    if (state.screen !== 'play') await startShelf('art');
    const item = state.items.find((entry) => !entry.placed);
    const wrong = state.bins.find((bin) => bin.id !== item.home);
    return attemptPlacement(item.id, wrong.id);
  },
  getAudioLog: () => voiceClips.getAudioLog(),
  musicStats: () => bgm.stats(),
});

mount.classList.add('is-loading');
renderSplash();
