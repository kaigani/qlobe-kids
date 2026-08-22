import config from '../config.js';
import { createScreens, wireEndScreen } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { burstConfetti, tada } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';

const root = document.getElementById('game');
const splashEl = root.querySelector('[data-qk-screen="splash"]');
const playEl = root.querySelector('[data-qk-screen="play"]');
const endEl = root.querySelector('[data-qk-screen="end"]');
const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
const timers = createTimers();

const state = {
  ready: false,
  modeId: null,
  phase: 'boot',
  seatIndex: 0,
  completedSeats: 0,
  placed: {},
  trayOrder: [],
  busy: false,
  wrongCount: 0,
  selectedId: null,
  muted: false,
  seed: 42,
};

let mode = null;
let rng = mulberry32(state.seed);
let playDrag = null;
let nudger = null;
let roundDisposers = [];
let currentCue = 'welcome';
let speakToken = 0;
let musicWanted = false;
let endConfetti = null;
let playGeneration = 0;

const screens = createScreens({ root, initial: 'splash', voice });

function allArtUrls() {
  const top = [
    ...Object.values(config.assets.backgrounds),
    config.assets.title,
    config.assets.placemat,
    config.assets.guideCard,
    config.assets.tray,
    config.assets.banner,
    config.assets.pip,
    config.assets.maya,
    ...(config.guests || []).map((guest) => guest.portrait),
  ];
  for (const meal of config.modes) {
    top.push(meal.art);
    top.push(...meal.required.map((item) => item.art));
    top.push(...meal.distractors.map((item) => item.art));
  }
  return top;
}

bgm.preload(config.music.track);

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './data/lines.json', config.voice),
  preloadImages(allArtUrls()),
]).then(() => {
  state.ready = true;
  state.phase = 'choose';
  if (musicWanted) startMusic();
  return true;
});

function startMusic() {
  musicWanted = true;
  bgm.play(config.music.track, { key: 'table-setting' });
  bgm.duck(0.34, 0);
}

function stopSpeaking() {
  speakToken += 1;
  voice.stop();
  bgm.duck(1, 180);
}

async function sayKey(key, token) {
  if (!key || token !== speakToken) return false;
  currentCue = key;
  await bgm.duckDuring(voice.say(key, config.voice[key]), { down: 0.18, downMs: 100, upMs: 320 });
  const stillCurrent = token === speakToken;
  if (stillCurrent) bgm.duck(0.34, 320);
  return stillCurrent;
}

function speak(key) {
  const token = ++speakToken;
  return sayKey(key, token);
}

function speakSequence(keys) {
  const token = ++speakToken;
  return (async () => {
    for (const key of keys) {
      if (!(await sayKey(key, token))) return false;
    }
    return true;
  })();
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  return state.muted;
}

const disposeUnlock = installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => {
    startMusic();
    if (screens.is('splash')) speak('welcome');
  },
});
const disposeKiosk = installKioskGuards();

function cleanRound() {
  playDrag?.detach();
  playDrag?.sweepStrayGhosts();
  playDrag = null;
  nudger?.stop();
  nudger = null;
  for (const dispose of roundDisposers.splice(0)) {
    try { dispose(); } catch { /* detached DOM is already inert */ }
  }
  document.querySelectorAll('.table-fly').forEach((node) => node.remove());
}

function cleanPlay() {
  playGeneration += 1;
  cleanRound();
  timers.clearAll();
  state.busy = false;
}

function cleanEnd() {
  endConfetti?.();
  endConfetti = null;
}

function image(src, className, alt = '') {
  const img = document.createElement('img');
  img.src = src;
  img.className = className;
  img.alt = alt;
  img.draggable = false;
  return img;
}

function addTarget(el, id, role = 'neutral') {
  el.dataset.target = id;
  el.dataset.role = role;
  return el;
}

function renderSplash() {
  screens.release('splash');
  splashEl.innerHTML = '';
  splashEl.style.backgroundImage = `url("${new URL(config.assets.backgrounds.splash, document.baseURI).href}")`;

  const scene = document.createElement('div');
  scene.className = 'splash-scene';
  scene.append(image(config.assets.title, 'title-art', 'Set the Table'));
  scene.append(image(config.assets.pip, 'splash-pip', 'Pip the teacup waves hello'));

  const home = addTarget(hudButton('home', () => { window.location.href = '../../'; }), 'home', 'nav');
  home.classList.add('qk-hud-top-left');
  scene.append(home);
  screens.hold(home.dispose);

  const prompt = document.createElement('p');
  prompt.className = 'chooser-prompt';
  prompt.textContent = 'Choose a meal';
  scene.append(prompt);

  const grid = document.createElement('div');
  grid.className = 'meal-grid';
  for (const meal of config.modes) {
    const card = addTarget(document.createElement('button'), `mode-${meal.id}`, 'mode');
    card.type = 'button';
    card.className = `meal-card meal-${meal.id}`;
    card.setAttribute('aria-label', `${meal.title}. ${meal.skill}.`);
    card.append(image(meal.art, 'meal-card-art', ''));
    const label = document.createElement('span');
    label.className = 'meal-label';
    label.textContent = meal.title;
    card.append(label);
    grid.append(card);
    screens.hold(onTap(card, () => startMode(meal.id), {
      feedback: () => { sfx.tick(); card.classList.add('is-pressed'); },
    }));
  }
  scene.append(grid);
  splashEl.append(scene);
}

function makeTrayOrder() {
  if (!mode) return [];
  return shuffle([
    ...mode.required.map((item) => item.id),
    ...mode.distractors.map((item) => item.id),
  ], rng);
}

function startMode(modeId) {
  const selected = config.modes.find((entry) => entry.id === modeId);
  if (!selected) return Promise.resolve({ ok: false, reason: 'unknown-mode' });
  return screens.start(async () => {
    stopSpeaking();
    mode = selected;
    state.modeId = selected.id;
    state.phase = 'placing';
    state.seatIndex = 0;
    state.completedSeats = 0;
    state.placed = {};
    state.trayOrder = makeTrayOrder();
    state.busy = false;
    state.wrongCount = 0;
    state.selectedId = null;
    screens.show('play', { force: screens.is('play') });
    playGeneration += 1;
    screens.hold(cleanPlay);
    renderPlay();
    speakSequence([mode.introKey, 'start-place']);
    return { ok: true, mode: mode.id };
  }, { busy: { ok: false, reason: 'busy' } });
}

function goSplash() {
  stopSpeaking();
  screens.show('splash');
  mode = null;
  state.modeId = null;
  state.phase = 'choose';
  state.seatIndex = 0;
  state.completedSeats = 0;
  state.placed = {};
  state.trayOrder = [];
  state.busy = false;
  state.selectedId = null;
  renderSplash();
  currentCue = 'choose';
}

function itemById(itemId) {
  return mode?.required.find((item) => item.id === itemId)
    || mode?.distractors.find((item) => item.id === itemId)
    || null;
}

function requiredForSlot(slotId) {
  return mode?.required.find((item) => item.slot === slotId) || null;
}

function slotStyle(slot, scale = 1) {
  return `--x:${slot.x}%;--y:${slot.y}%;--w:${slot.w * scale}%;--h:${(slot.h || slot.w) * scale}%`;
}

function settingMarkup({ guide = false, final = false } = {}) {
  const ghostOpacity = guide ? 1 : mode.ghostOpacity;
  const slots = mode.slots.map((slot) => {
    const item = requiredForSlot(slot.id);
    const placedId = state.placed[slot.id];
    const visible = guide || final ? item : itemById(placedId);
    const role = placedId ? 'placed' : 'slot';
    const target = guide || final ? '' : `data-target="slot-${slot.id}" data-role="${role}"`;
    const slotAttr = guide || final ? '' : `data-slot="${slot.id}"`;
    const contents = visible
      ? `<img class="${placedId || guide || final ? 'setting-item' : 'slot-ghost'}" src="${visible.art}" alt="" draggable="false">`
      : `<img class="slot-ghost" src="${item.art}" alt="" draggable="false">`;
    return `<div class="place-slot ${placedId ? 'is-filled' : ''}" ${slotAttr} ${target} style="${slotStyle(slot, guide || final ? 0.92 : 1)};--ghost:${ghostOpacity}">${contents}</div>`;
  }).join('');
  return `<img class="placemat-art" src="${config.assets.placemat}" alt="" draggable="false">${slots}`;
}

function guestForSeat(index) {
  const guests = config.guests;
  return guests?.length ? guests[index % guests.length] : null;
}

function renderGuide() {
  return `
    <aside class="guide-wrap" aria-label="Picture guide for ${mode.title}">
      <img class="guide-card-art" src="${config.assets.guideCard}" alt="" draggable="false">
      <div class="guide-setting">${settingMarkup({ guide: true })}</div>
      <img class="guide-pip" src="${config.assets.pip}" alt="Pip points to the guide" draggable="false">
    </aside>`;
}

function renderRoundGuest() {
  const guest = guestForSeat(state.seatIndex);
  if (!guest) return '';
  return `<img class="round-guest" src="${guest.portrait}" alt="This place is for ${guest.name}" draggable="false">`;
}

function renderProgress() {
  const seats = [];
  for (let index = 0; index < mode.seats; index += 1) {
    const status = index < state.completedSeats ? 'is-done' : (index === state.seatIndex ? 'is-now' : 'is-next');
    const plate = mode.required.find((item) => item.slot === 'plate');
    seats.push(`
      <div class="seat-badge ${status}" aria-label="Place ${index + 1}${status === 'is-done' ? ' ready' : status === 'is-now' ? ' now' : ''}">
        <img src="${config.assets.placemat}" alt="" draggable="false">
        ${status === 'is-done' && plate ? `<img class="seat-badge-plate" src="${plate.art}" alt="" draggable="false">` : ''}
        <span>${index + 1}</span>
      </div>`);
  }
  return `<div class="seat-progress" aria-label="${state.completedSeats} of ${mode.seats} places ready">${seats.join('')}</div>`;
}

function renderTray() {
  const cards = state.trayOrder.map((id) => {
    const item = itemById(id);
    if (!item) return '';
    const isPlaced = mode.required.some((required) => required.id === id && state.placed[required.slot] === id);
    if (isPlaced) return '';
    const distractor = mode.distractors.some((entry) => entry.id === id);
    return `
      <button type="button" class="tray-item" data-item="${id}" data-target="item-${id}" data-role="${distractor ? 'distractor' : 'item'}" aria-label="${item.alt}">
        <img src="${item.art}" alt="" draggable="false">
      </button>`;
  }).join('');
  return `
    <div class="tray-zone" aria-label="Table helpers tray">
      <img class="tray-art" src="${config.assets.tray}" alt="" draggable="false">
      <div class="tray-scroll">${cards}</div>
    </div>`;
}

function renderPlay() {
  if (!screens.is('play') || !mode) return;
  cleanRound();
  playEl.style.backgroundImage = `url("${new URL(config.assets.backgrounds.play, document.baseURI).href}")`;
  playEl.innerHTML = `
    <div class="play-shell">
      <div class="task-banner">
        <img src="${config.assets.banner}" alt="" draggable="false">
        <p>${mode.instruction}</p>
      </div>
      ${renderProgress()}
      ${renderGuide()}
      ${renderRoundGuest()}
      <div class="setting-zone" aria-label="Place ${state.seatIndex + 1} of ${mode.seats}">
        <div class="placemat-wrap">${settingMarkup()}</div>
      </div>
      ${renderTray()}
      <div class="play-announcer visually-hidden" aria-live="polite"></div>
    </div>`;

  const back = addTarget(hudButton('back', goSplash), 'back', 'nav');
  back.classList.add('qk-hud-top-left');
  playEl.append(back);
  roundDisposers.push(back.dispose);

  const replayCue = soundDebounce(() => speak(currentCue), 650);
  const sound = addTarget(hudButton('sound', replayCue), 'sound', 'audio');
  sound.classList.add('qk-hud-bottom-left');
  playEl.append(sound);
  roundDisposers.push(sound.dispose);

  for (const slotEl of playEl.querySelectorAll('.place-slot.is-filled')) {
    const slotId = slotEl.dataset.slot;
    if (!slotId || state.phase !== 'placing') continue;
    slotEl.classList.add('is-returnable');
    slotEl.setAttribute('role', 'button');
    slotEl.setAttribute('tabindex', '0');
    slotEl.setAttribute('aria-label', `Return ${requiredForSlot(slotId)?.alt || 'item'} to the tray`);
    roundDisposers.push(onTap(slotEl, () => returnPlaced(slotId)));
  }

  const pieces = new Map();
  for (const itemEl of playEl.querySelectorAll('[data-item]')) {
    const item = itemById(itemEl.dataset.item);
    if (!item) continue;
    const record = { id: item.id, item, el: itemEl };
    pieces.set(item.id, record);
  }

  playDrag = createDragToSlotDom({
    getPiece: (id) => pieces.get(id) || null,
    root: playEl,
    slotSelector: '[data-slot]',
    slotPad: 32,
    hoverClass: 'is-hovered',
    grabOffset: 0.45,
    canStart: () => screens.is('play') && state.phase === 'placing' && !state.busy,
    makeGhost: (piece) => {
      const ghost = piece.el.cloneNode(true);
      const rect = piece.el.getBoundingClientRect();
      ghost.className = 'table-drag-ghost';
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      return ghost;
    },
    onGrab: (piece) => {
      state.selectedId = piece.id;
      piece.el.classList.add('is-selected');
      nudger?.poke();
      return true;
    },
    onLift: (piece) => piece.el.classList.add('is-dragging'),
    onDrop: async (piece, drag) => {
      piece.el.classList.remove('is-selected', 'is-dragging');
      await attemptPlace(piece.id, drag.slot?.dataset.slot || null, {
        from: { x: drag.lastX, y: drag.lastY },
        sourceEl: piece.el,
        dragged: true,
      });
    },
    onCancel: async (piece) => {
      piece.el.classList.remove('is-selected', 'is-dragging');
      state.selectedId = null;
      softWobble(piece.el);
    },
    onTap: (piece) => {
      piece.el.classList.remove('is-selected');
      attemptPlace(piece.id, piece.item.slot || null, { sourceEl: piece.el });
    },
  });

  for (const piece of pieces.values()) {
    const down = (event) => playDrag?.begin(event, piece.id);
    const keyboard = (event) => {
      if (event.detail === 0) attemptPlace(piece.id, piece.item.slot || null, { sourceEl: piece.el });
    };
    piece.el.addEventListener('pointerdown', down);
    piece.el.addEventListener('click', keyboard);
    roundDisposers.push(() => {
      piece.el.removeEventListener('pointerdown', down);
      piece.el.removeEventListener('click', keyboard);
    });
  }

  nudger = createNudger({
    first: 8000,
    repeat: 12000,
    onNudge: (count) => {
      if (!screens.is('play') || state.busy || state.phase !== 'placing') return;
      highlightNext();
      const next = mode.required.find((item) => !state.placed[item.slot]);
      speak(count === 0 ? 'tap-help' : (next?.clue || 'tap-help'));
    },
  });
  nudger.arm();

  if (state.phase === 'seat-complete') {
    playEl.querySelector('.placemat-wrap')?.classList.add('is-complete');
  }
}

function highlightNext() {
  const next = mode?.required.find((item) => !state.placed[item.slot]);
  if (!next) return;
  const itemEl = [...playEl.querySelectorAll('[data-item]')].find((node) => node.dataset.item === next.id);
  const slotEl = [...playEl.querySelectorAll('[data-slot]')].find((node) => node.dataset.slot === next.slot);
  itemEl?.classList.add('needs-help');
  slotEl?.classList.add('needs-help');
  timers.after(1600, () => {
    itemEl?.classList.remove('needs-help');
    slotEl?.classList.remove('needs-help');
  });
}

function softWobble(el) {
  if (!el || reducedMotion) return;
  el.classList.remove('soft-wobble');
  void el.offsetWidth;
  el.classList.add('soft-wobble');
  timers.after(520, () => el.classList.remove('soft-wobble'));
}

function announce(message) {
  const live = playEl.querySelector('.play-announcer');
  if (live) live.textContent = message;
}

function returnPlaced(slotId) {
  if (state.busy || state.phase !== 'placing' || !state.placed[slotId]) return false;
  const itemId = state.placed[slotId];
  delete state.placed[slotId];
  state.selectedId = null;
  sfx.unpop();
  announce(`${itemById(itemId)?.alt || 'Item'} returned to the tray.`);
  renderPlay();
  return true;
}

async function animatePlacement(item, sourceEl, slotEl, from) {
  if (reducedMotion || !slotEl) return;
  const sourceRect = sourceEl?.getBoundingClientRect();
  const targetRect = slotEl.getBoundingClientRect();
  const startX = Number.isFinite(from?.x) ? from.x : (sourceRect?.left ?? targetRect.left) + (sourceRect?.width ?? 0) / 2;
  const startY = Number.isFinite(from?.y) ? from.y : (sourceRect?.top ?? targetRect.top) + (sourceRect?.height ?? 0) / 2;
  const endX = targetRect.left + targetRect.width / 2;
  const endY = targetRect.top + targetRect.height / 2;
  const flyer = image(item.art, 'table-fly', '');
  const startSize = Math.max(72, Math.min(sourceRect?.width || 112, 150));
  flyer.style.width = `${startSize}px`;
  flyer.style.left = `${startX}px`;
  flyer.style.top = `${startY}px`;
  document.body.append(flyer);
  const duration = timers.ms(420);
  const animation = flyer.animate([
    { left: `${startX}px`, top: `${startY}px`, transform: 'translate(-50%, -50%) scale(1)', offset: 0 },
    { left: `${(startX + endX) / 2}px`, top: `${Math.min(startY, endY) - 70}px`, transform: 'translate(-50%, -50%) scale(1.1)', offset: 0.52 },
    { left: `${endX}px`, top: `${endY}px`, transform: 'translate(-50%, -50%) scale(.9)', offset: 1 },
  ], { duration, easing: 'cubic-bezier(.2,.75,.2,1)', fill: 'forwards' });
  try { await animation.finished; } catch { /* screen navigation cancels the flight */ }
  flyer.remove();
}

async function attemptPlace(itemId, slotId, { sourceEl = null, from = null, dragged = false } = {}) {
  if (!screens.is('play') || !mode || state.phase !== 'placing' || state.busy) {
    return { ok: false, reason: 'busy' };
  }
  const item = itemById(itemId);
  if (!item) return { ok: false, reason: 'unknown-item' };
  const attemptGeneration = playGeneration;
  const attemptModeId = mode.id;
  nudger?.poke();
  state.selectedId = itemId;

  const isDistractor = mode.distractors.some((entry) => entry.id === itemId);
  if (isDistractor) {
    state.wrongCount += 1;
    sfx.silly();
    softWobble(sourceEl || playEl.querySelector(`[data-item="${itemId}"]`));
    playEl.querySelector('.guide-pip')?.classList.add('pip-nibble');
    timers.after(620, () => playEl.querySelector('.guide-pip')?.classList.remove('pip-nibble'));
    speak('distractor');
    state.selectedId = null;
    return { ok: false, reason: 'distractor' };
  }

  const wanted = item.slot;
  if (!slotId) {
    if (dragged) {
      softWobble(sourceEl);
      state.selectedId = null;
      return { ok: false, reason: 'miss' };
    }
    slotId = wanted;
  }

  if (slotId !== wanted || state.placed[slotId]) {
    state.wrongCount += 1;
    sfx.boing();
    softWobble(sourceEl || playEl.querySelector(`[data-item="${itemId}"]`));
    const wrongSlot = [...playEl.querySelectorAll('[data-slot]')].find((node) => node.dataset.slot === slotId);
    softWobble(wrongSlot);
    announce(`Try another place for ${item.alt}.`);
    speak(item.clue || 'gentle-retry');
    state.selectedId = null;
    return { ok: false, reason: 'wrong-slot', wanted };
  }

  state.busy = true;
  const slotEl = [...playEl.querySelectorAll('[data-slot]')].find((node) => node.dataset.slot === wanted);
  await animatePlacement(item, sourceEl, slotEl, from);
  if (!screens.is('play')
    || playGeneration !== attemptGeneration
    || state.modeId !== attemptModeId
    || mode?.id !== attemptModeId) {
    return { ok: false, reason: 'cancelled' };
  }

  state.placed[wanted] = itemId;
  state.selectedId = null;
  sfx.pop();
  timers.after(70, () => sfx.sparkle());
  announce(`${item.alt} is in place.`);
  const complete = mode.required.every((required) => state.placed[required.slot] === required.id);

  if (!complete) {
    state.busy = false;
    renderPlay();
    if (Object.keys(state.placed).length === 2) speak(rng() > 0.5 ? 'praise-perfect' : 'praise-helper');
    return { ok: true, item: itemId, slot: wanted, complete: false };
  }

  state.phase = 'seat-complete';
  renderPlay();
  burstConfetti({ host: playEl.querySelector('.setting-zone'), count: 16, duration: 950, rng });
  await Promise.all([speak('place-ready'), timers.wait(900)]);
  if (!screens.is('play') || state.phase !== 'seat-complete') return { ok: false, reason: 'cancelled' };
  await completeSeat();
  return { ok: true, item: itemId, slot: wanted, complete: true };
}

async function completeSeat() {
  state.completedSeats += 1;
  if (state.completedSeats >= mode.seats) {
    showEnd();
    return;
  }
  state.seatIndex += 1;
  state.placed = {};
  state.trayOrder = makeTrayOrder();
  state.phase = 'placing';
  state.busy = false;
  renderPlay();
  speak(state.seatIndex === mode.seats - 1 ? 'last-place' : 'next-place');
}

function finalSettingMarkup(guest) {
  const items = mode.slots.map((slot) => {
    const item = requiredForSlot(slot.id);
    return `<img class="final-item" src="${item.art}" alt="" draggable="false" style="${slotStyle(slot, 0.9)}">`;
  }).join('');
  const badge = guest ? `<img class="final-guest" src="${guest.portrait}" alt="${guest.name}'s place" draggable="false">` : '';
  return `<div class="final-setting"><img src="${config.assets.placemat}" class="final-placemat" alt="" draggable="false">${items}${badge}</div>`;
}

function showEnd() {
  stopSpeaking();
  state.phase = 'table-ready';
  state.busy = false;
  screens.show('end');
  screens.hold(cleanEnd);
  endEl.style.backgroundImage = `url("${new URL(config.assets.backgrounds.end, document.baseURI).href}")`;
  endEl.innerHTML = `
    <div class="end-shell">
      <div class="end-banner">
        <img src="${config.assets.banner}" alt="" draggable="false">
        <h1>Table ready!</h1>
      </div>
      <div class="four-place-table" aria-label="Four complete place settings">
        ${Array.from({ length: mode.seats }, (_, index) => finalSettingMarkup(guestForSeat(index))).join('')}
      </div>
      <img class="end-maya" src="${config.assets.maya}" alt="Maya gives a thumbs-up" draggable="false">
      <img class="end-pip" src="${config.assets.pip}" alt="Pip celebrates" draggable="false">
      <button type="button" class="again-card" data-target="again" data-role="action" aria-label="Set this table again">
        <img src="${mode.art}" alt="" draggable="false">
        <span>Again!</span>
      </button>
    </div>`;

  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'qk-hud-btn qk-hud-back qk-hud-top-left';
  back.setAttribute('aria-label', 'Choose another meal');
  addTarget(back, 'back', 'nav');
  endEl.append(back);
  const again = endEl.querySelector('.again-card');
  wireEndScreen({
    screens,
    back,
    again,
    onSplash: goSplash,
    onAgain: () => startMode(mode.id),
  });
  endConfetti = tada({ host: endEl, count: 64, duration: 2700, rng });
  speak('table-ready');
}

function publicState() {
  const openSlots = mode ? mode.required.filter((item) => !state.placed[item.slot]).map((item) => item.slot) : [];
  return {
    screen: screens.current,
    ready: state.ready,
    modeId: state.modeId,
    phase: state.phase,
    activeSeat: state.seatIndex,
    completedSeats: state.completedSeats,
    totalSeats: mode?.seats || 0,
    placed: { ...state.placed },
    openSlots,
    trayOrder: state.trayOrder.slice(),
    busy: state.busy,
    wrongCount: state.wrongCount,
    selectedId: state.selectedId,
    reducedMotion,
    muted: state.muted,
    seed: state.seed,
    playGeneration,
  };
}

function debugTap(targetId) {
  const activeScreen = root.querySelector(`[data-qk-screen="${screens.current}"]`);
  const target = [...(activeScreen?.querySelectorAll('[data-target]') || [])]
    .find((node) => node.dataset.target === targetId);
  if (!target) return false;
  target.click();
  return true;
}

async function finishPlace() {
  if (!mode || !screens.is('play')) return false;
  const originalSeat = state.seatIndex;
  for (const item of mode.required) {
    if (state.seatIndex !== originalSeat || !screens.is('play')) break;
    if (!state.placed[item.slot]) await attemptPlace(item.id, item.slot);
  }
  return state.seatIndex !== originalSeat || screens.is('end');
}

async function finishAll() {
  let guard = 0;
  while (screens.is('play') && guard < 8) {
    guard += 1;
    await finishPlace();
  }
  return screens.is('end');
}

function debugWrong(itemId, slotId) {
  if (!mode) return Promise.resolve({ ok: false, reason: 'no-mode' });
  const item = mode.required.find((entry) => entry.id === itemId) || mode.required[0];
  const wrongSlot = slotId && slotId !== item.slot
    ? slotId
    : mode.slots.find((slot) => slot.id !== item.slot)?.id;
  return attemptPlace(item.id, wrongSlot);
}

function getLayout() {
  const targets = collectTargets(root);
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight, orientation: window.innerWidth >= window.innerHeight ? 'landscape' : 'portrait' },
    activeSeat: state.seatIndex,
    openSlots: publicState().openSlots,
    trayOrder: state.trayOrder.slice(),
    reducedMotion,
    targetSizes: targets.map(({ id, rect }) => ({ id, width: rect.w, height: rect.h })),
  };
}

installDebug({
  gameId: config.id,
  engine: 'table-setting-dom',
  ready,
  listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode,
  getState: publicState,
  getTargets: () => collectTargets(root),
  tap: debugTap,
  winRound: finishAll,
  home: goSplash,
  timers,
  voice,
  sfx,
  mute: setMuted,
  onSeed: (nextRng, seed) => {
    rng = nextRng;
    state.seed = seed;
    if (mode && screens.is('play') && Object.keys(state.placed).length === 0) {
      state.trayOrder = makeTrayOrder();
      renderPlay();
    }
  },
  place: (itemId, slotId) => attemptPlace(itemId, slotId),
  wrong: debugWrong,
  finishPlace,
  finishAll,
  getLayout,
  getAudioLog: () => voice.getAudioLog(),
  getMusicStats: () => bgm.stats(),
});

window.addEventListener('pagehide', () => {
  disposeUnlock();
  disposeKiosk();
  cleanPlay();
  cleanEnd();
  bgm.stop({ fadeOutMs: 0 });
}, { once: true });

renderSplash();
