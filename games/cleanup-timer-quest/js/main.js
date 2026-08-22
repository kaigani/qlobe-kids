import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as music from '../../../shared/js/music.js';
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
const roomRuns = Object.fromEntries(config.rooms.map((room) => [room.id, 0]));
const CATEGORY_VOICE = {
  plush: 'plush-home',
  blocks: 'blocks-home',
  clothes: 'clothes-home',
  books: 'books-home',
  wheels: 'wheels-home',
  music: 'music-home',
};
const PRAISE = ['praise-one', 'praise-two', 'praise-three'];
const FIRST_PLAYROOM = ['teddy', 'bunny', 'red-cube', 'blue-arch'];

const state = {
  screen: 'splash',
  phase: 'choose',
  roomId: null,
  items: [],
  bins: [],
  selectedId: null,
  placedCount: 0,
  remainingSec: config.timer.durationSec,
  extensions: 0,
  inputLocked: false,
  muted: false,
  seed: 42,
  roundSerial: 0,
};

let rng = mulberry32(state.seed);
let countdownId = null;
let dragController = null;
let ambientConfetti = null;
let pendingWelcome = true;
let roundEpoch = 0;

mount.innerHTML = `
  <section class="quest-screen quest-splash" data-qk-screen="splash"></section>
  <section class="quest-screen quest-play" data-qk-screen="play" hidden></section>
  <section class="quest-screen quest-reward" data-qk-screen="reward" hidden></section>
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
  './assets/title.webp',
  './assets/timer-track.webp',
  ...config.rooms.flatMap((room) => [
    room.scene,
    `./assets/rooms/${room.id}.webp`,
    ...room.items.map((item) => item.asset),
    ...room.bins.map((bin) => bin.asset),
  ]),
];

const ready = Promise.all([
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  music.init(new URL('../../../shared/assets/instruments/manifest.json', import.meta.url).href),
  preloadImages(criticalArt),
]).then(() => {
  mount.classList.remove('is-loading');
  return true;
});

function say(key) {
  return music.duckDuring(narrator.say(key, config.voice[key]));
}

function saySequence(parts) {
  return music.duckDuring(narrator.saySequence(parts.map((part) => ({
    ...part,
    text: config.voice[part.key],
  }))));
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

function setScene(screen, url) {
  const resolved = new URL(url, document.baseURI).href;
  screen.style.setProperty('--quest-scene', `url("${resolved}")`);
}

function roomById(id) {
  return config.rooms.find((room) => room.id === id) || config.rooms[0];
}

function chooseItems(room) {
  if (room.id === 'playroom' && roomRuns.playroom === 0) {
    return FIRST_PLAYROOM.map((id) => ({ ...room.items.find((item) => item.id === id), placed: false }));
  }
  const categories = [...new Set(room.items.map((item) => item.category))];
  const chosen = categories.flatMap((category) =>
    shuffle(room.items.filter((item) => item.category === category), rng).slice(0, 2));
  return shuffle(chosen, rng).map((item) => ({ ...item, placed: false }));
}

function roomCardsMarkup({ compact = false } = {}) {
  return config.rooms.map((room) => `
    <button class="room-card ${compact ? 'is-compact' : ''}" type="button"
            data-room="${room.id}" data-target="room-${room.id}" data-role="choice"
            aria-label="Rescue the ${room.title}">
      <span class="room-card-frame">
        <img src="./assets/rooms/${room.id}.webp" alt="" draggable="false">
        ${roomRuns[room.id] ? '<span class="rescue-stamp" aria-hidden="true">★</span>' : ''}
      </span>
      <span class="room-card-label">${room.title}</span>
    </button>
  `).join('');
}

function renderSplash({ announce = false } = {}) {
  roundEpoch += 1;
  stopRoundSystems();
  state.screen = 'splash';
  state.phase = 'choose';
  state.roomId = null;
  state.selectedId = null;
  state.inputLocked = false;
  const screen = screens.el('splash');
  setScene(screen, './assets/scenes/playroom.webp');
  screen.innerHTML = `
    <div class="splash-scrim" aria-hidden="true"></div>
    <div class="title-wrap">
      <h1 class="visually-hidden">Clean-Up Timer Quest</h1>
      <img class="title-art" src="./assets/title.webp" alt="" draggable="false">
      <div class="quest-kicker" aria-hidden="true"><span>★</span><span>Choose a room to rescue</span><span>★</span></div>
    </div>
    <div class="room-deck" aria-label="Choose a room">${roomCardsMarkup()}</div>
  `;
  screens.show('splash', { force: screens.current === 'splash' });
  addHud(screen, 'home', () => { window.location.href = '../../'; }, 'qk-hud-top-left', 'Back to all games');

  screen.querySelectorAll('[data-room]').forEach((card) => {
    screens.hold(onTap(card, () => startRoom(card.dataset.room), { feedback }));
  });
  if (announce) say('choose-another');
}

async function startRoom(roomId) {
  return screens.start(async () => {
    const epoch = ++roundEpoch;
    await ready;
    if (epoch !== roundEpoch) return false;
    const room = roomById(roomId);
    state.roomId = room.id;
    state.items = chooseItems(room);
    state.bins = shuffle(room.bins, rng).map((bin) => ({ ...bin }));
    state.selectedId = null;
    state.placedCount = 0;
    state.remainingSec = config.timer.durationSec;
    state.extensions = 0;
    state.inputLocked = false;
    state.phase = 'sorting';
    state.screen = 'play';
    state.roundSerial += 1;
    roomRuns[room.id] += 1;
    renderPlay(room);
    screens.show('play');
    startRoundSystems(room);
    await say(room.promptKey);
  }, { busy: false });
}

function itemMarkup(item, index) {
  return `
    <button class="quest-item" type="button" data-item="${item.id}"
            data-target="item-${item.id}" data-role="piece"
            aria-label="Move ${item.id.replaceAll('-', ' ')}" style="--item-i:${index}">
      <span class="item-puck"><img src="${item.asset}" alt="" draggable="false"></span>
    </button>
  `;
}

function binMarkup(bin, index) {
  return `
    <button class="quest-bin" type="button" data-slot data-bin="${bin.id}"
            data-category="${bin.category}" data-target="bin-${bin.category}"
            data-role="slot" aria-label="${bin.category} home" style="--bin-i:${index}">
      <span class="bin-glow" aria-hidden="true"></span>
      <span class="stored-items" aria-hidden="true"></span>
      <img class="bin-art" src="${bin.asset}" alt="" draggable="false">
    </button>
  `;
}

function timerMarkup() {
  return `
    <div class="music-timer" aria-label="Gentle clean-up music timer">
      <img src="./assets/timer-track.webp" alt="" draggable="false">
      <span class="timer-shade" aria-hidden="true"></span>
      <span class="timer-count" aria-hidden="true">${state.remainingSec}</span>
      <span class="timer-beats" aria-hidden="true">
        ${Array.from({ length: 8 }, (_, index) => `<i data-beat="${index}"></i>`).join('')}
      </span>
    </div>
  `;
}

function renderPlay(room) {
  const screen = screens.el('play');
  screen.dataset.room = room.id;
  setScene(screen, room.scene);
  screen.innerHTML = `
    <div class="play-vignette" aria-hidden="true"></div>
    <header class="quest-banner" aria-label="${room.title}: ${state.placedCount} of ${state.items.length} objects home">
      <span class="room-name">${room.title}</span>
      <span class="progress-pips" aria-hidden="true">
        ${state.items.map((_, index) => `<i class="${index < state.placedCount ? 'is-done' : ''}"></i>`).join('')}
      </span>
    </header>
    ${timerMarkup()}
    <div class="item-field" aria-label="Objects to tidy">
      ${state.items.map(itemMarkup).join('')}
    </div>
    <div class="bin-row" aria-label="Picture-marked homes">
      ${state.bins.map(binMarkup).join('')}
    </div>
    <div class="room-sparkles" aria-hidden="true"></div>
  `;

  screens.show('play', { force: screens.current === 'play' });
  addHud(screen, 'back', () => renderSplash(), 'qk-hud-top-left', 'Back to room choice');
  addHud(screen, 'sound', soundDebounce(() => say(room.promptKey), 650), 'qk-hud-bottom-left', 'Hear the directions again');
  wirePlayInput(screen, room);
  updatePlayHud();
}

function wirePlayInput(screen, room) {
  dragController = createDragToSlotDom({
    root: screen,
    ghostHost: screen,
    slotSelector: '[data-slot]',
    slotPad: 42,
    hoverClass: 'is-hovered',
    ghostClass: 'qk-drag-ghost quest-drag-ghost',
    grabOffset: 0.28,
    getPiece(id) {
      const item = state.items.find((entry) => entry.id === id && !entry.placed);
      if (!item) return null;
      return { ...item, el: screen.querySelector(`[data-item="${item.id}"]`) };
    },
    canStart: () => state.screen === 'play' && !state.inputLocked,
    onGrab(piece, drag) {
      nudge.poke();
      // Pointer-down selects immediately so a real drag gets its destination
      // halo. Remember the prior state so pointer-up can still implement the
      // equal tap-tap path without toggling the same press twice.
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
      await attemptPlacement(piece.id, drag.slot?.dataset.category || null);
    },
    onCancel(piece) {
      piece.el?.classList.remove('is-lifting');
    },
    onTap(piece, drag) {
      if (drag.wasSelected) selectItem(piece.id, { speak: false });
      else say(CATEGORY_VOICE[piece.category]);
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
      if (state.selectedId) attemptPlacement(state.selectedId, bin.dataset.category);
      else {
        bin.classList.add('is-speaking');
        timers.after(650, () => bin.classList.remove('is-speaking'));
        say(CATEGORY_VOICE[bin.dataset.category]);
      }
    }, { feedback }));
  });
}

function selectItem(itemId, { speak: speakHint } = {}) {
  if (state.inputLocked || state.screen !== 'play') return false;
  const item = state.items.find((entry) => entry.id === itemId && !entry.placed);
  if (!item) return false;
  const isDeselecting = state.selectedId === item.id;
  state.selectedId = isDeselecting ? null : item.id;
  const screen = screens.el('play');
  screen.querySelectorAll('[data-item]').forEach((node) => {
    node.classList.toggle('is-selected', !isDeselecting && node.dataset.item === item.id);
  });
  screen.querySelectorAll('[data-bin]').forEach((node) => {
    node.classList.toggle('is-hinted', !isDeselecting && node.dataset.category === item.category);
  });
  if (!state.muted) sfx.pop();
  if (speakHint && !isDeselecting) say(CATEGORY_VOICE[item.category]);
  return true;
}

async function attemptPlacement(itemId, category) {
  if (state.inputLocked || state.screen !== 'play') return false;
  const item = state.items.find((entry) => entry.id === itemId && !entry.placed);
  if (!item) return false;
  const epoch = roundEpoch;
  const roomId = state.roomId;
  nudge.poke();
  if (!category) {
    selectItem(item.id, { speak: false });
    return false;
  }
  const bin = screens.el('play').querySelector(`[data-bin][data-category="${category}"]`);
  if (item.category !== category) {
    bin?.classList.remove('is-wrong');
    void bin?.offsetWidth;
    bin?.classList.add('is-wrong');
    timers.after(620, () => bin?.classList.remove('is-wrong'));
    if (!state.muted) sfx.silly();
    say('wrong-bin');
    return false;
  }

  state.inputLocked = true;
  const source = screens.el('play').querySelector(`[data-item="${item.id}"]`);
  await animateLanding(source, bin);
  if (epoch !== roundEpoch || state.screen !== 'play' || state.roomId !== roomId) return false;
  item.placed = true;
  state.placedCount += 1;
  state.selectedId = null;
  source?.classList.add('is-placed');
  bin?.classList.add('has-delivery');
  addStoredItem(bin, item, state.placedCount);
  if (!state.muted) sfx.sparkle();
  sparkleAt(bin);
  updatePlayHud();
  state.inputLocked = false;

  if (state.placedCount >= state.items.length) {
    state.phase = 'celebrating';
    state.inputLocked = true;
    await timers.wait(520);
    if (epoch !== roundEpoch || state.screen !== 'play' || state.roomId !== roomId) return false;
    showReward(roomById(state.roomId));
  } else {
    const praise = PRAISE[(state.placedCount - 1) % PRAISE.length];
    say(praise);
  }
  return true;
}

function animateLanding(source, bin) {
  if (!source || !bin || reducedMotion || typeof source.animate !== 'function') return Promise.resolve();
  const a = source.getBoundingClientRect();
  const b = bin.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height * 0.35 - (a.top + a.height / 2);
  const animation = source.animate([
    { transform: 'translate(0, 0) rotate(0deg) scale(1)' },
    { transform: `translate(${dx * 0.48}px, ${dy * 0.3 - 48}px) rotate(-7deg) scale(1.12)`, offset: 0.48 },
    { transform: `translate(${dx}px, ${dy}px) rotate(4deg) scale(.58)` },
  ], { duration: timers.ms(560), easing: 'cubic-bezier(.2,.85,.28,1)', fill: 'forwards' });
  // Background review tabs can suspend Web Animations entirely. A bounded
  // fallback keeps placement (and the child) from ever waiting on rendering.
  return Promise.race([
    animation.finished.catch(() => undefined),
    timers.wait(720),
  ]);
}

function addStoredItem(bin, item, index) {
  const host = bin?.querySelector('.stored-items');
  if (!host) return;
  const img = document.createElement('img');
  img.src = item.asset;
  img.alt = '';
  img.style.setProperty('--stored-i', index);
  host.append(img);
}

function sparkleAt(target) {
  const layer = screens.el('play').querySelector('.room-sparkles');
  if (!layer || !target) return;
  const rootRect = layer.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const x = rect.left - rootRect.left + rect.width / 2;
  const y = rect.top - rootRect.top + rect.height * 0.35;
  for (let index = 0; index < 9; index += 1) {
    const sparkle = document.createElement('i');
    sparkle.style.setProperty('--spark-x', `${x}px`);
    sparkle.style.setProperty('--spark-y', `${y}px`);
    sparkle.style.setProperty('--spark-angle', `${index * 40}deg`);
    layer.append(sparkle);
    timers.after(720, () => sparkle.remove());
  }
}

function updatePlayHud() {
  const screen = screens.el('play');
  const banner = screen.querySelector('.quest-banner');
  if (banner) banner.setAttribute('aria-label', `${roomById(state.roomId).title}: ${state.placedCount} of ${state.items.length} objects home`);
  screen.querySelectorAll('.progress-pips i').forEach((pip, index) => pip.classList.toggle('is-done', index < state.placedCount));
  updateTimerVisual();
}

function startRoundSystems(room) {
  stopCountdown();
  music.unlock();
  music.playSong(config.music.song, config.music.band, {
    onNote: () => screens.el('play')?.querySelector('.music-timer')?.classList.toggle('is-playing'),
  });
  countdownId = timers.every(1000, tickCountdown);
  nudge.arm();
  screens.hold(nudge.stop);
  screens.hold(stopCountdown);
  screens.hold(music.stopSong);
  updateTimerVisual();
  void room;
}

function stopCountdown() {
  if (countdownId !== null) timers.clear(countdownId);
  countdownId = null;
}

function stopRoundSystems() {
  stopCountdown();
  nudge.stop();
  music.stopSong();
  dragController?.cancel();
  timers.clearAll();
}

function tickCountdown() {
  if (state.screen !== 'play' || state.phase !== 'sorting') return;
  state.remainingSec = Math.max(0, state.remainingSec - 1);
  updateTimerVisual();
  if (state.remainingSec > 0) return;
  state.extensions += 1;
  state.remainingSec = config.timer.extensionSec;
  const timer = screens.el('play').querySelector('.music-timer');
  timer?.classList.remove('is-extended');
  void timer?.offsetWidth;
  timer?.classList.add('is-extended');
  timers.after(850, () => timer?.classList.remove('is-extended'));
  say('more-time');
  updateTimerVisual();
}

function updateTimerVisual() {
  const timer = screens.el('play')?.querySelector('.music-timer');
  if (!timer) return;
  const cycle = state.extensions ? config.timer.extensionSec : config.timer.durationSec;
  const ratio = Math.max(0, Math.min(1, state.remainingSec / cycle));
  timer.style.setProperty('--timer-used', `${(1 - ratio) * 100}%`);
  const count = timer.querySelector('.timer-count');
  if (count) count.textContent = state.remainingSec;
  const live = Math.ceil(ratio * 8);
  timer.querySelectorAll('[data-beat]').forEach((beat, index) => beat.classList.toggle('is-live', index < live));
}

const nudge = createNudger({
  first: 12000,
  repeat: 14000,
  onNudge(index) {
    if (state.screen !== 'play') return;
    if (index === 0) say(roomById(state.roomId).promptKey);
    else {
      const next = state.items.find((item) => !item.placed);
      if (next) selectItem(next.id, { speak: true });
    }
  },
});

function rewardBinsMarkup() {
  return state.bins.map((bin) => {
    const matching = state.items.filter((item) => item.category === bin.category);
    return `
      <div class="reward-bin">
        <span class="stored-items is-reward" aria-hidden="true">
          ${matching.map((item, index) => `<img src="${item.asset}" alt="" style="--stored-i:${index + 1}">`).join('')}
        </span>
        <img src="${bin.asset}" alt="" draggable="false">
      </div>
    `;
  }).join('');
}

function showReward(room) {
  stopRoundSystems();
  state.screen = 'reward';
  state.phase = 'reward';
  const screen = screens.el('reward');
  screen.dataset.room = room.id;
  setScene(screen, room.scene);
  screen.innerHTML = `
    <div class="reward-glow" aria-hidden="true"></div>
    <div class="reward-copy">
      <span class="reward-stars" aria-hidden="true">★ ★ ★</span>
      <h2>${room.title} rescued!</h2>
      <p>Everything found its home.</p>
    </div>
    <div class="reward-bins" aria-hidden="true">${rewardBinsMarkup()}</div>
    <div class="reward-actions">
      <button class="again-button" type="button" data-action="again" data-target="again" aria-label="Rescue this room again">
        <img src="../../shared/assets/ui/btn-play.png" alt="" draggable="false">
        <span>Again!</span>
      </button>
      <div class="reward-room-deck" aria-label="Choose another room">${roomCardsMarkup({ compact: true })}</div>
    </div>
  `;
  screens.show('reward');
  addHud(screen, 'back', () => renderSplash({ announce: true }), 'qk-hud-top-left', 'Back to room choice');
  addHud(screen, 'sound', soundDebounce(() => saySequence([
    { key: `${room.id}-cheer` },
    { key: 'sparkling', gap: 160 },
  ]), 650), 'qk-hud-bottom-left', 'Hear the celebration again');

  const again = screen.querySelector('[data-action="again"]');
  screens.hold(onTap(again, () => startRoom(room.id), { feedback }));
  screen.querySelectorAll('[data-room]').forEach((card) => {
    screens.hold(onTap(card, () => startRoom(card.dataset.room), { feedback }));
  });
  if (!state.muted) tada({ host: screen, count: 42, duration: 2300, rng: mulberry32(state.seed + state.roundSerial) });
  ambientConfetti = burstConfetti({
    host: screen,
    count: 18,
    loop: true,
    duration: 4200,
    drift: 45,
    rng: mulberry32(state.seed + 900 + state.roundSerial),
    piece: { width: 12, height: 12, radius: '50%' },
  });
  saySequence([
    { key: `${room.id}-cheer` },
    { key: 'sparkling', gap: 180 },
  ]);
}

function tapDebugTarget(id) {
  if (id === 'back') {
    renderSplash();
    return true;
  }
  if (id === 'sound') {
    if (state.screen === 'play') say(roomById(state.roomId).promptKey);
    else if (state.screen === 'reward') say('sparkling');
    else say('welcome');
    return true;
  }
  if (id === 'again' && state.roomId) return startRoom(state.roomId);
  if (id.startsWith('room-')) return startRoom(id.slice(5));
  if (id.startsWith('item-')) return selectItem(id.slice(5), { speak: false });
  if (id.startsWith('bin-') && state.selectedId) return attemptPlacement(state.selectedId, id.slice(4));
  return false;
}

async function winRound() {
  if (state.screen === 'splash') await startRoom(state.roomId || 'playroom');
  if (state.screen !== 'play') return false;
  for (const item of state.items.filter((entry) => !entry.placed)) {
    await attemptPlacement(item.id, item.category);
    if (state.screen !== 'play') break;
  }
  return true;
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  music.setMuted(state.muted);
  return state.muted;
}

installUnlockOnGesture({
  extra: [music.unlock],
  onFirst: (event) => {
    if (pendingWelcome && state.screen === 'splash') {
      pendingWelcome = false;
      // A room card already answers the welcome with its own concise prompt.
      // Do not start a greeting that pointerup would immediately cut off.
      if (event?.target?.closest?.('[data-room]')) return;
      say('welcome');
    }
  },
});
window.addEventListener('pointerdown', () => voiceClips.unlock(), { passive: true });
installKioskGuards();

installDebug({
  gameId: config.id,
  engine: 'cleanup-timer-quest',
  version: 1,
  ready,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  listModes: () => config.rooms.map((room) => ({ id: room.id, title: room.title })),
  startMode: (id) => startRoom(id),
  getState: () => ({
    ...state,
    items: state.items.map(({ id, category, placed }) => ({ id, category, placed })),
    bins: state.bins.map(({ id, category }) => ({ id, category })),
    roomRuns: { ...roomRuns },
    timerScale: timers.getScale(),
  }),
  getTargets: () => collectTargets(mount),
  tap: tapDebugTarget,
  winRound,
  mute: setMuted,
  seed: (value) => {
    state.seed = Number(value) >>> 0;
    rng = mulberry32(state.seed);
    for (const id of Object.keys(roomRuns)) roomRuns[id] = 0;
    return state.seed;
  },
  fastTimers: (scale = 0.05) => {
    const number = Number(scale);
    const multiplier = Number.isFinite(number) && number > 0
      ? Math.min(1, Math.max(0.01, number > 1 ? 1 / number : number))
      : 0.05;
    timers.setScale(1 / multiplier);
    if (state.screen === 'play') {
      stopCountdown();
      countdownId = timers.every(1000, tickCountdown);
    }
    return multiplier;
  },
  home: () => renderSplash(),
  wrong: async () => {
    if (state.screen !== 'play') await startRoom('playroom');
    const item = state.items.find((entry) => !entry.placed);
    const wrong = state.bins.find((bin) => bin.category !== item.category);
    return attemptPlacement(item.id, wrong.category);
  },
  expireTimer: () => {
    state.remainingSec = 1;
    tickCountdown();
    return state.extensions;
  },
  getAudioLog: () => voiceClips.getAudioLog(),
  musicStats: () => music.stats(),
});

mount.classList.add('is-loading');
renderSplash();
