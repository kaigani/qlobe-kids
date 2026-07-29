import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';

const mount = document.getElementById('game');
const announcer = document.getElementById('announcer');
const UI = {
  home: new URL('../../../shared/assets/ui/btn-home.png', import.meta.url).href,
  back: new URL('../../../shared/assets/ui/btn-back.png', import.meta.url).href,
  sound: new URL('../../../shared/assets/ui/btn-sound.png', import.meta.url).href,
};
const RED_SOCK = '../../shared/assets/storybook/sock-red.png';
const BLUE_SOCK = '../../shared/assets/storybook/sock-blue.png';
const YELLOW_SOCK = '../../shared/assets/storybook/sock-yellow.png';
const BASKET = '../../shared/assets/storybook/basket-socks.png';
const DRAG_SLOP = 8;
const IDLE_MS = 11000;

const state = {
  screen: 'splash',
  mode: null,
  progress: 0,
  awaitingInput: true,
  inputLocked: false,
  selected: null,
  foldIndex: 0,
  foldStep: 0,
  matchedColors: [],
  muted: false,
  fast: false,
  seed: 42,
};

let mode = null;
let sortItems = [];
let activeBins = [];
let previousSortColors = '';
let pairCards = [];
let rng = mulberry32(state.seed);
let roundSerial = 0;
let disposers = [];
let idleTimer = 0;
let activeDrag = null;
let foldPointer = null;
let audioUnlocked = false;
let pendingWelcome = false;

const ready = (async () => {
  await voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice);
  await preloadCriticalImages();
})();

function preloadCriticalImages() {
  const urls = new Set([
    config.theme.background,
    ...config.modes.flatMap((item) => [
      ...(item.items || []).map((entry) => entry.art),
      ...(item.bins || []).map((entry) => entry.art),
      ...(item.foldItems || []).flatMap((entry) => entry.stages.map((stage) => stage.art)),
      ...(item.colors || []).filter((entry) => typeof entry === 'object').map((entry) => entry.art),
    ]),
  ]);
  return Promise.all([...urls].map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = url;
  })));
}

function unlockAudio() {
  voice.unlock();
  if (audioUnlocked) return;
  audioUnlocked = true;
  sfx.unlock();
  speech.unlock();
  if (pendingWelcome && state.screen === 'splash') {
    pendingWelcome = false;
    say('welcome');
  }
}

window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('gesturestart', (event) => event.preventDefault());
window.addEventListener('blur', cancelAllPointers);

function say(key) {
  const text = config.voice[key] || '';
  announcer.textContent = text;
  if (state.muted) return Promise.resolve(false);
  return voice.say(key, text);
}

function feedback(event) {
  event?.preventDefault?.();
  event?.stopPropagation?.();
  unlockAudio();
  if (!state.muted) sfx.tick();
}

function playSfx(name) {
  if (state.muted) return;
  sfx[name]?.();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, state.fast ? Math.min(12, ms) : ms));
}

function clearScreen() {
  clearTimeout(idleTimer);
  idleTimer = 0;
  voice.stop();
  cancelAllPointers();
  document.querySelectorAll('.drag-ghost, .spark').forEach((node) => node.remove());
  disposers.forEach((dispose) => dispose());
  disposers = [];
}

function cancelAllPointers() {
  if (activeDrag) finishDragCleanup();
  foldPointer = null;
  window.removeEventListener('pointermove', onSortPointerMove);
  window.removeEventListener('pointerup', onSortPointerUp);
  window.removeEventListener('pointercancel', onSortPointerCancel);
  window.removeEventListener('pointermove', onFoldPointerMove);
  window.removeEventListener('pointerup', onFoldPointerUp);
  window.removeEventListener('pointercancel', onFoldPointerCancel);
}

function scheduleIdle() {
  clearTimeout(idleTimer);
  if (state.fast || state.screen !== 'play') return;
  idleTimer = setTimeout(() => {
    if (state.screen === 'play' && state.awaitingInput && mode) say(mode.prompt);
  }, IDLE_MS);
}

function progressMarkup(done) {
  return `<div class="progress" aria-label="${done} of 3 parts complete">
    ${[0, 1, 2].map((index) => `<span class="progress-dot ${index < done ? 'is-done' : ''}"></span>`).join('')}
  </div>`;
}

function hudMarkup(done) {
  return `
    <button class="round-button back-button" type="button" data-action="back"
            data-target="back" aria-label="Back to the laundry menu"
            style="background-image:url('${UI.back}')"></button>
    <div class="hud">${progressMarkup(done)}</div>
    <button class="round-button sound-button" type="button" data-action="sound"
            data-target="sound" aria-label="Hear the directions again"
            style="background-image:url('${UI.sound}')"></button>`;
}

function bubbleMarkup(count = 12) {
  const colors = ['#ffffff', '#a7ecff', '#d6c8ff'];
  return Array.from({ length: count }, (_, index) => {
    const size = 24 + (index * 17) % 46;
    const x = 4 + (index * 37) % 92;
    const duration = 3 + (index % 5) * .55;
    const delayValue = -(index % 7) * .6;
    return `<span class="bubble" style="--size:${size}px;--x:${x}%;--dur:${duration}s;--delay:${delayValue}s;--color:${colors[index % colors.length]}"></span>`;
  }).join('');
}

function wireCommon() {
  const back = mount.querySelector('[data-action="back"]');
  const sound = mount.querySelector('[data-action="sound"]');
  if (back) disposers.push(onTap(back, () => showSplash({ greet: false }), { feedback }));
  if (sound) disposers.push(onTap(sound, () => {
    if (mode) say(mode.prompt);
    else say('welcome');
    scheduleIdle();
  }, { feedback }));
}

function showSplash({ greet = true } = {}) {
  clearScreen();
  state.screen = 'splash';
  state.mode = null;
  state.progress = 0;
  state.awaitingInput = true;
  state.inputLocked = false;
  state.selected = null;
  state.foldIndex = 0;
  state.foldStep = 0;
  state.matchedColors = [];
  mode = null;

  const sortMode = config.modes.find((item) => item.id === 'sort');
  const foldMode = config.modes.find((item) => item.id === 'fold');
  const pairMode = config.modes.find((item) => item.id === 'pairs');
  const cards = [
    {
      mode: sortMode,
      art: `<img class="art-center" src="${BASKET}" alt="">
            <img class="art-small" src="${RED_SOCK}" alt="">`,
    },
    {
      mode: foldMode,
      art: `<img class="art-center" src="${foldMode.foldItems[0].stages.at(-1).art}" alt="">`,
    },
    {
      mode: pairMode,
      art: `<img class="art-left" src="${YELLOW_SOCK}" alt="">
            <img class="art-right" src="${YELLOW_SOCK}" alt="">`,
    },
  ];

  mount.innerHTML = `
    <section class="screen splash" aria-label="Laundry Sorter">
      <a class="round-button home-button" href="../../" aria-label="Back to all games"
         style="background-image:url('${UI.home}')"></a>
      <header class="title-lockup" aria-label="Laundry Sorter">
        <h1><span class="title-top">Laundry</span><span class="title-bottom">Sorter</span></h1>
      </header>
      <div class="splash-helper" aria-hidden="true">
        <img src="${RED_SOCK}" alt="">
        <img src="${BLUE_SOCK}" alt="">
        <img src="${YELLOW_SOCK}" alt="">
        <img src="../../shared/assets/storybook/sock-green.png" alt="">
      </div>
      <div class="mode-grid" role="list" aria-label="Choose a laundry chore">
        ${cards.map((card) => `
          <button class="mode-card" type="button" role="listitem"
                  data-mode="${card.mode.id}" data-target="mode-${card.mode.id}"
                  aria-label="${card.mode.title}">
            <span class="mode-art" aria-hidden="true">${card.art}</span>
            <span class="mode-title">${card.mode.title}</span>
          </button>`).join('')}
      </div>
    </section>`;

  mount.querySelectorAll('.mode-card').forEach((button) => {
    disposers.push(onTap(button, () => startMode(button.dataset.mode), { feedback }));
  });
  const home = mount.querySelector('.home-button');
  home.addEventListener('pointerdown', feedback, { passive: false });

  if (!greet) return;
  ready.then(async () => {
    if (state.screen !== 'splash') return;
    const played = await voice.trySay('welcome');
    pendingWelcome = !played;
    if (played) audioUnlocked = true;
  });
}

async function startMode(modeId) {
  await ready;
  const nextMode = config.modes.find((item) => item.id === modeId);
  if (!nextMode) return false;
  clearScreen();
  mode = nextMode;
  state.screen = 'play';
  state.mode = mode.id;
  state.progress = 0;
  state.awaitingInput = false;
  state.inputLocked = false;
  state.selected = null;
  state.foldIndex = 0;
  state.foldStep = 0;
  state.matchedColors = [];
  rng = mulberry32((state.seed + Math.imul(roundSerial, 0x9e3779b9)) >>> 0);
  roundSerial += 1;

  if (mode.id === 'sort') renderSort();
  else if (mode.id === 'fold') renderFold();
  else renderPairs();
  await delay(40);
  state.awaitingInput = true;
  say(mode.prompt);
  scheduleIdle();
  return true;
}

function renderSort() {
  clearScreen();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = shuffle(mode.bins, rng).slice(0, 2);
    const signature = candidate.map((bin) => bin.id).sort().join('|');
    activeBins = candidate;
    if (signature !== previousSortColors) {
      previousSortColors = signature;
      break;
    }
  }
  sortItems = shuffle(activeBins.flatMap((bin) =>
    shuffle(mode.items.filter((item) => item.color === bin.id), rng)
      .slice(0, 3)
      .map((item) => ({ ...item, sorted: false }))), rng);
  state.progress = 0;
  state.selected = null;
  mount.innerHTML = `
    <section class="screen play-screen sort-screen" aria-label="Sort the clothing by color">
      ${hudMarkup(0)}
      <div class="play-layout">
        <div class="sort-board">
          <div class="laundry-shelf" aria-label="Laundry to sort">
            ${sortItems.map((item) => `
              <button class="sock-piece" type="button" data-item="${item.id}" data-color="${item.color}"
                      style="--item-filter:${item.filter || 'hue-rotate(0deg)'}"
                      data-target="sock-${item.id}" aria-label="${item.alt}">
                <img src="${item.art}" alt="">
              </button>`).join('')}
          </div>
          <div class="basket-row">
            ${activeBins.map((bin) => `
              <button class="basket" type="button" data-bin="${bin.id}"
                      style="--bin-filter:${bin.filter || 'hue-rotate(0deg)'}"
                      data-target="bin-${bin.id}" aria-label="${bin.alt}">
                <img src="${bin.art}" alt="">
                <span class="basket-count" aria-label="0 items">0</span>
              </button>`).join('')}
          </div>
        </div>
      </div>
      <div class="prompt-ribbon" aria-hidden="true">${mode.title}</div>
    </section>`;
  wireCommon();
  wireSort();
  updateProgress(0);
}

function wireSort() {
  mount.querySelectorAll('.sock-piece').forEach((piece) => {
    piece.addEventListener('pointerdown', onSortPointerDown, { passive: false });
  });
  mount.querySelectorAll('.basket').forEach((basket) => {
    disposers.push(onTap(basket, () => {
      if (!state.selected) {
        say(mode.prompt);
        return;
      }
      attemptSort(state.selected, basket.dataset.bin);
    }, { feedback }));
  });
}

function onSortPointerDown(event) {
  if (state.inputLocked || activeDrag || event.isPrimary === false) return;
  const source = event.currentTarget;
  const item = sortItems.find((candidate) => candidate.id === source.dataset.item);
  if (!item || item.sorted) return;
  event.preventDefault();
  unlockAudio();
  const rect = source.getBoundingClientRect();
  activeDrag = {
    pointerId: event.pointerId,
    itemId: item.id,
    source,
    rect,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    moved: false,
    ghost: null,
  };
  window.addEventListener('pointermove', onSortPointerMove, { passive: false });
  window.addEventListener('pointerup', onSortPointerUp, { passive: false });
  window.addEventListener('pointercancel', onSortPointerCancel, { passive: false });
  beginGhost({ markMoved: false });
}

function onSortPointerMove(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  event.preventDefault();
  activeDrag.x = event.clientX;
  activeDrag.y = event.clientY;
  const distance = Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY);
  if (!activeDrag.moved && distance >= DRAG_SLOP) {
    activeDrag.moved = true;
    playSfx('pop');
  }
  if (!activeDrag.moved) return;
  const tilt = clamp((event.clientX - activeDrag.startX) * .07, -12, 12);
  const left = event.clientX - activeDrag.offsetX;
  const top = event.clientY - activeDrag.offsetY;
  activeDrag.ghost.style.setProperty('--ghost-x', `${left}px`);
  activeDrag.ghost.style.setProperty('--ghost-y', `${top}px`);
  activeDrag.ghost.style.setProperty('--ghost-tilt', `${tilt}deg`);
  highlightHoveredBasket(event.clientX, event.clientY);
}

function beginGhost({ markMoved = true } = {}) {
  if (!activeDrag || activeDrag.ghost) return;
  activeDrag.moved = markMoved;
  const image = activeDrag.source.querySelector('img');
  const ghost = document.createElement('img');
  ghost.className = 'drag-ghost';
  ghost.src = image.src;
  ghost.alt = '';
  ghost.style.filter = getComputedStyle(image).filter;
  ghost.style.setProperty('--ghost-size', `${activeDrag.rect.width}px`);
  ghost.style.setProperty('--ghost-x', `${activeDrag.rect.left}px`);
  ghost.style.setProperty('--ghost-y', `${activeDrag.rect.top}px`);
  document.body.appendChild(ghost);
  activeDrag.ghost = ghost;
  activeDrag.source.classList.add('is-drag-source');
}

function highlightHoveredBasket(x, y) {
  mount.querySelectorAll('.basket').forEach((basket) => {
    basket.classList.toggle('is-hover', pointInside(x, y, basket.getBoundingClientRect()));
  });
}

async function onSortPointerUp(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  event.preventDefault();
  const drag = activeDrag;
  const target = [...mount.querySelectorAll('.basket')]
    .find((basket) => pointInside(event.clientX, event.clientY, basket.getBoundingClientRect()));
  activeDrag = null;
  detachSortDragListeners();
  mount.querySelectorAll('.basket').forEach((basket) => basket.classList.remove('is-hover'));
  if (drag.moved) {
    if (target) await attemptSort(drag.itemId, target.dataset.bin, drag);
    else {
      await animateDragReturn(drag);
      cleanupDragVisual(drag);
      bounceSortItem(drag.itemId);
    }
  } else {
    cleanupDragVisual(drag);
    selectSortItem(drag.itemId);
  }
}

function onSortPointerCancel(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  const itemId = activeDrag.itemId;
  finishDragCleanup();
  bounceSortItem(itemId);
}

function finishDragCleanup() {
  if (!activeDrag) return;
  const drag = activeDrag;
  activeDrag = null;
  cleanupDragVisual(drag);
  mount.querySelectorAll('.basket').forEach((basket) => basket.classList.remove('is-hover'));
  detachSortDragListeners();
}

function cleanupDragVisual(drag) {
  drag?.ghost?.remove();
  drag?.source?.classList.remove('is-drag-source');
}

function detachSortDragListeners() {
  window.removeEventListener('pointermove', onSortPointerMove);
  window.removeEventListener('pointerup', onSortPointerUp);
  window.removeEventListener('pointercancel', onSortPointerCancel);
}

function selectSortItem(itemId) {
  if (state.inputLocked) return false;
  const item = sortItems.find((candidate) => candidate.id === itemId);
  if (!item || item.sorted) return false;
  state.selected = state.selected === itemId ? null : itemId;
  playSfx(state.selected ? 'pop' : 'unpop');
  mount.querySelectorAll('.sock-piece').forEach((piece) => {
    piece.classList.toggle('is-selected', piece.dataset.item === state.selected);
  });
  mount.querySelectorAll('.basket').forEach((basket) => basket.classList.toggle('is-ready', !!state.selected));
  scheduleIdle();
  return true;
}

async function attemptSort(itemId, binId, drag = null) {
  if (state.inputLocked) return false;
  const item = sortItems.find((candidate) => candidate.id === itemId);
  const bin = mode.bins.find((candidate) => candidate.id === binId);
  if (!item || item.sorted || !bin) return false;
  const source = mount.querySelector(`[data-item="${cssEscape(itemId)}"]`);
  const basket = mount.querySelector(`[data-bin="${cssEscape(binId)}"]`);
  state.selected = null;
  mount.querySelectorAll('.sock-piece').forEach((piece) => piece.classList.remove('is-selected'));
  mount.querySelectorAll('.basket').forEach((node) => node.classList.remove('is-ready'));

  if (item.color !== bin.id) {
    playSfx('silly');
    if (drag) await animateDragReturn(drag);
    cleanupDragVisual(drag);
    source?.classList.add('is-wrong');
    basket?.classList.add('is-wrong');
    setTimeout(() => {
      source?.classList.remove('is-wrong');
      basket?.classList.remove('is-wrong');
    }, state.fast ? 12 : 520);
    say(mode.nudge);
    scheduleIdle();
    return false;
  }

  state.inputLocked = true;
  state.awaitingInput = false;
  playSfx('whoosh');
  if (source && basket) {
    if (drag) await animateDragIntoBasket(drag, basket.getBoundingClientRect());
    else await animateFlight(source.querySelector('img'), source.getBoundingClientRect(), basket.getBoundingClientRect());
    source.classList.add('is-sorted');
  }
  cleanupDragVisual(drag);
  item.sorted = true;
  state.progress += 1;
  const count = sortItems.filter((candidate) => candidate.sorted && candidate.color === bin.id).length;
  const badge = basket?.querySelector('.basket-count');
  if (badge) {
    badge.textContent = String(count);
    badge.setAttribute('aria-label', `${count} items`);
  }
  sparkleAt(basket);
  playSfx(state.progress === sortItems.length ? 'tada' : 'sparkle');
  updateProgress(Math.floor(state.progress / 2));
  state.inputLocked = false;
  state.awaitingInput = true;
  if (state.progress >= sortItems.length) {
    await delay(420);
    showCelebration();
  } else {
    scheduleIdle();
  }
  return true;
}

async function animateDragIntoBasket(drag, target) {
  if (!drag?.ghost) return;
  const startX = drag.x - drag.offsetX;
  const startY = drag.y - drag.offsetY;
  const endX = target.left + target.width / 2 - drag.rect.width / 2;
  const endY = target.top + target.height * .38 - drag.rect.height / 2;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || state.fast) {
    drag.ghost.style.setProperty('--ghost-x', `${endX}px`);
    drag.ghost.style.setProperty('--ghost-y', `${endY}px`);
    return;
  }
  const animation = drag.ghost.animate([
    { transform: `translate3d(${startX}px, ${startY}px, 0) rotate(0deg) scale(1.08)`, opacity: 1 },
    { transform: `translate3d(${endX}px, ${endY}px, 0) rotate(-5deg) scale(.28)`, opacity: .12 },
  ], { duration: 330, easing: 'cubic-bezier(.2,.82,.35,1)', fill: 'forwards' });
  await animation.finished.catch(() => {});
}

async function animateDragReturn(drag) {
  if (!drag?.ghost || window.matchMedia('(prefers-reduced-motion: reduce)').matches || state.fast) return;
  const startX = drag.x - drag.offsetX;
  const startY = drag.y - drag.offsetY;
  const animation = drag.ghost.animate([
    { transform: `translate3d(${startX}px, ${startY}px, 0) rotate(0deg) scale(1.08)` },
    { transform: `translate3d(${drag.rect.left}px, ${drag.rect.top}px, 0) rotate(0deg) scale(1)` },
  ], { duration: 260, easing: 'cubic-bezier(.25,.8,.35,1)', fill: 'forwards' });
  await animation.finished.catch(() => {});
}

function bounceSortItem(itemId) {
  const source = mount.querySelector(`[data-item="${cssEscape(itemId)}"]`);
  source?.classList.add('is-wrong');
  setTimeout(() => source?.classList.remove('is-wrong'), state.fast ? 12 : 500);
}

async function animateFlight(image, from, target) {
  if (!image || window.matchMedia('(prefers-reduced-motion: reduce)').matches || state.fast) return;
  const flyer = image.cloneNode();
  flyer.className = 'drag-ghost';
  flyer.style.filter = getComputedStyle(image).filter;
  flyer.style.setProperty('--ghost-size', `${from.width}px`);
  flyer.style.left = '0';
  flyer.style.top = '0';
  document.body.appendChild(flyer);
  const endX = target.left + target.width / 2 - from.width * .24;
  const endY = target.top + target.height * .34 - from.height * .24;
  const animation = flyer.animate([
    { transform: `translate(${from.left}px, ${from.top}px) scale(1) rotate(0deg)`, opacity: 1 },
    { transform: `translate(${(from.left + endX) / 2}px, ${Math.min(from.top, endY) - 100}px) scale(.82) rotate(10deg)`, opacity: 1, offset: .55 },
    { transform: `translate(${endX}px, ${endY}px) scale(.28) rotate(-5deg)`, opacity: .2 },
  ], { duration: 560, easing: 'cubic-bezier(.2,.8,.35,1)', fill: 'forwards' });
  await animation.finished.catch(() => {});
  flyer.remove();
}

function renderFold({ keepPrompt = false } = {}) {
  const foldItem = mode.foldItems[state.foldIndex];
  const completed = mode.foldItems.slice(0, state.progress);
  const stage = foldItem.stages[state.foldStep];
  const currentPrompt = stage.label || mode.title;
  clearScreen();
  mount.innerHTML = `
    <section class="screen play-screen fold-screen" aria-label="Fold the laundry">
      ${hudMarkup(state.progress)}
      <div class="play-layout">
        <div class="fold-board">
          <div class="fold-worktop"></div>
          <button class="fold-zone" type="button" data-step="${state.foldStep}"
                  data-direction="${stage.direction}" data-target="fold-zone"
                  aria-label="${foldItem.alt}: ${stage.label}">
            <img class="fold-image" src="${stage.art}" alt="">
            <span class="fold-guide ${stage.direction}"></span>
          </button>
          <div class="fold-stack" aria-label="${state.progress} folded items">
            ${completed.map((item, index) => `
              <img src="${item.stages.at(-1).art}" alt="" style="--stack-bottom:${index * 28}px">`).join('')}
          </div>
        </div>
      </div>
      <div class="prompt-ribbon" aria-hidden="true">${currentPrompt}</div>
    </section>`;
  wireCommon();
  wireFold();
  if (!keepPrompt && state.screen === 'play') scheduleIdle();
}

function wireFold() {
  const zone = mount.querySelector('.fold-zone');
  zone.addEventListener('pointerdown', onFoldPointerDown, { passive: false });
}

function onFoldPointerDown(event) {
  if (state.inputLocked || foldPointer || event.isPrimary === false) return;
  event.preventDefault();
  unlockAudio();
  foldPointer = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
  };
  window.addEventListener('pointermove', onFoldPointerMove, { passive: false });
  window.addEventListener('pointerup', onFoldPointerUp, { passive: false });
  window.addEventListener('pointercancel', onFoldPointerCancel, { passive: false });
}

function onFoldPointerMove(event) {
  if (!foldPointer || event.pointerId !== foldPointer.pointerId) return;
  event.preventDefault();
  foldPointer.x = event.clientX;
  foldPointer.y = event.clientY;
}

function onFoldPointerUp(event) {
  if (!foldPointer || event.pointerId !== foldPointer.pointerId) return;
  event.preventDefault();
  const dx = event.clientX - foldPointer.startX;
  const dy = event.clientY - foldPointer.startY;
  const foldItem = mode.foldItems[state.foldIndex];
  const direction = foldItem.stages[state.foldStep].direction;
  const correct = foldDirectionMatches(direction, dx, dy);
  cleanupFoldPointer();
  attemptFold(correct);
}

function foldDirectionMatches(direction, dx, dy) {
  if (direction === 'right') return dx > 56 && Math.abs(dx) > Math.abs(dy);
  if (direction === 'left') return dx < -56 && Math.abs(dx) > Math.abs(dy);
  if (direction === 'up') return dy < -56 && Math.abs(dy) > Math.abs(dx);
  if (direction === 'down') return dy > 56 && Math.abs(dy) > Math.abs(dx);
  return false;
}

function onFoldPointerCancel(event) {
  if (!foldPointer || event.pointerId !== foldPointer.pointerId) return;
  cleanupFoldPointer();
}

function cleanupFoldPointer() {
  foldPointer = null;
  window.removeEventListener('pointermove', onFoldPointerMove);
  window.removeEventListener('pointerup', onFoldPointerUp);
  window.removeEventListener('pointercancel', onFoldPointerCancel);
}

async function attemptFold(correct = true) {
  if (state.inputLocked || state.screen !== 'play' || state.mode !== 'fold') return false;
  if (!correct) {
    playSfx('silly');
    const worktop = mount.querySelector('.fold-worktop');
    worktop?.classList.add('is-wrong');
    setTimeout(() => worktop?.classList.remove('is-wrong'), state.fast ? 12 : 520);
    say(mode.nudge);
    scheduleIdle();
    return false;
  }
  state.inputLocked = true;
  state.awaitingInput = false;
  playSfx('whoosh');
  const zone = mount.querySelector('.fold-zone');
  const image = mount.querySelector('.fold-image');
  const foldItem = mode.foldItems[state.foldIndex];
  const currentStage = foldItem.stages[state.foldStep];
  const nextStage = foldItem.stages[state.foldStep + 1];
  await swapFoldStage(image, currentStage.direction, nextStage.art);
  state.foldStep += 1;
  zone.dataset.step = String(state.foldStep);

  if (state.foldStep < foldItem.stages.length - 1) {
    const upcoming = foldItem.stages[state.foldStep];
    zone.dataset.direction = upcoming.direction;
    zone.setAttribute('aria-label', `${foldItem.alt}: ${upcoming.label}`);
    const guide = zone.querySelector('.fold-guide');
    guide.className = `fold-guide ${upcoming.direction}`;
    const ribbon = mount.querySelector('.prompt-ribbon');
    if (ribbon) ribbon.textContent = upcoming.label;
    await delay(180);
    playSfx('pop');
    say('fold-again');
    state.inputLocked = false;
    state.awaitingInput = true;
    scheduleIdle();
    return true;
  }

  zone.querySelector('.fold-guide')?.remove();
  await delay(280);
  state.progress += 1;
  updateProgress(state.progress);
  sparkleAt(zone);
  playSfx(state.progress === mode.foldItems.length ? 'tada' : 'sparkle');
  await delay(360);
  if (state.progress >= mode.foldItems.length) {
    state.inputLocked = false;
    showCelebration();
    return true;
  }
  state.foldIndex += 1;
  state.foldStep = 0;
  state.inputLocked = false;
  state.awaitingInput = true;
  renderFold({ keepPrompt: true });
  scheduleIdle();
  return true;
}

async function swapFoldStage(image, direction, nextArt) {
  if (!image) return;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches || state.fast;
  if (!reduced) {
    const x = direction === 'right' ? 42 : direction === 'left' ? -42 : 0;
    const y = direction === 'down' ? 36 : direction === 'up' ? -36 : 0;
    const out = image.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      { transform: `translate(${x}px, ${y}px) scale(.9)`, opacity: .22 },
    ], { duration: 210, easing: 'cubic-bezier(.35,0,.65,1)', fill: 'forwards' });
    await out.finished.catch(() => {});
  }
  image.src = nextArt;
  await image.decode?.().catch(() => {});
  if (!reduced) {
    const incoming = image.animate([
      { transform: 'scale(.86)', opacity: .2 },
      { transform: 'scale(1)', opacity: 1 },
    ], { duration: 290, easing: 'cubic-bezier(.2,1.2,.4,1)', fill: 'forwards' });
    await incoming.finished.catch(() => {});
  }
}

function renderPairs() {
  clearScreen();
  const colors = shuffle(mode.colors.slice(), rng).slice(0, 3);
  pairCards = makePairDeck(colors);
  state.progress = 0;
  state.selected = null;
  state.matchedColors = [];
  mount.innerHTML = `
    <section class="screen play-screen pairs-screen" aria-label="Find the matching sock pairs">
      ${hudMarkup(0)}
      <div class="play-layout">
        <div class="pairs-board">
          <div class="pair-line" aria-label="Matched sock pairs"></div>
          <div class="pair-grid">
            ${pairCards.map((card) => `
              <button class="pair-card" type="button" data-card="${card.instance}"
                      data-target="pair-${card.instance}" aria-label="${card.alt}">
                <img src="${card.art}" alt="">
              </button>`).join('')}
          </div>
        </div>
      </div>
      <div class="prompt-ribbon" aria-hidden="true">${mode.title}</div>
    </section>`;
  wireCommon();
  mount.querySelectorAll('.pair-card').forEach((card) => {
    disposers.push(onTap(card, () => attemptPair(card.dataset.card), { feedback }));
  });
  updateProgress(0);
}

function makePairDeck(colors) {
  // Deal one of each colour per row, then rotate the second row so a matching
  // pair can never land directly above/below itself (an accidentally trivial
  // board at seed 42 exposed why a plain six-card shuffle was not enough).
  const top = shuffle(colors.slice(), rng)
    .map((color) => ({ ...color, instance: `${color.id}-a`, matched: false }));
  const shift = rng() < .5 ? 1 : 2;
  const bottom = top.map((_, index) => {
    const color = top[(index + shift) % top.length];
    return { ...color, instance: `${color.id}-b`, matched: false };
  });
  return [...top, ...bottom];
}

async function attemptPair(cardId) {
  if (state.inputLocked || state.screen !== 'play' || state.mode !== 'pairs') return false;
  const card = pairCards.find((candidate) => candidate.instance === cardId);
  if (!card || card.matched) return false;
  const element = mount.querySelector(`[data-card="${cssEscape(cardId)}"]`);
  if (!state.selected) {
    state.selected = cardId;
    element?.classList.add('is-selected');
    playSfx('pop');
    scheduleIdle();
    return true;
  }
  if (state.selected === cardId) {
    state.selected = null;
    element?.classList.remove('is-selected');
    playSfx('unpop');
    scheduleIdle();
    return true;
  }

  const first = pairCards.find((candidate) => candidate.instance === state.selected);
  const firstElement = mount.querySelector(`[data-card="${cssEscape(state.selected)}"]`);
  state.selected = null;
  firstElement?.classList.remove('is-selected');
  if (!first) return false;

  if (first.id !== card.id) {
    playSfx('silly');
    firstElement?.classList.add('is-wrong');
    element?.classList.add('is-wrong');
    setTimeout(() => {
      firstElement?.classList.remove('is-wrong');
      element?.classList.remove('is-wrong');
    }, state.fast ? 12 : 520);
    say(mode.nudge);
    scheduleIdle();
    return false;
  }

  state.inputLocked = true;
  state.awaitingInput = false;
  first.matched = true;
  card.matched = true;
  firstElement?.classList.add('is-matched');
  element?.classList.add('is-matched');
  playSfx('whoosh');
  await delay(340);
  state.matchedColors.push(card.id);
  state.progress += 1;
  const line = mount.querySelector('.pair-line');
  line?.insertAdjacentHTML('beforeend', `
    <span class="hung-pair" data-hung="${card.id}">
      <img src="${card.art}" alt=""><img src="${card.art}" alt="">
    </span>`);
  sparkleAt(line?.lastElementChild);
  playSfx(state.progress === 3 ? 'tada' : 'sparkle');
  updateProgress(state.progress);
  state.inputLocked = false;
  state.awaitingInput = true;
  if (state.progress >= 3) {
    await delay(520);
    showCelebration();
  } else {
    scheduleIdle();
  }
  return true;
}

function updateProgress(done) {
  mount.querySelectorAll('.progress-dot').forEach((dot, index) => {
    dot.classList.toggle('is-done', index < done);
  });
}

function sparkleAt(element) {
  if (!element || window.matchMedia('(prefers-reduced-motion: reduce)').matches || state.fast) return;
  const rect = element.getBoundingClientRect();
  const colors = ['#ffd33d', '#ff5e78', '#7ee45d', '#8b5de8', '#ffffff'];
  for (let index = 0; index < 14; index += 1) {
    const spark = document.createElement('span');
    spark.className = 'spark';
    const angle = (Math.PI * 2 * index) / 14;
    const distance = 55 + (index % 4) * 18;
    spark.style.setProperty('--x', `${rect.left + rect.width / 2}px`);
    spark.style.setProperty('--y', `${rect.top + rect.height / 2}px`);
    spark.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    spark.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    spark.style.setProperty('--color', colors[index % colors.length]);
    document.body.appendChild(spark);
    setTimeout(() => spark.remove(), 800);
  }
}

function showCelebration() {
  const finishedMode = mode;
  clearScreen();
  state.screen = 'end';
  state.awaitingInput = true;
  state.inputLocked = false;
  const art = finishedMode.id === 'fold'
    ? finishedMode.foldItems[0].stages.at(-1).art
    : finishedMode.id === 'pairs' ? YELLOW_SOCK : BASKET;
  mount.innerHTML = `
    <section class="screen celebration" aria-label="${finishedMode.title} complete">
      ${bubbleMarkup(16)}
      <button class="round-button back-button" type="button" data-action="back"
              data-target="back" aria-label="Back to the laundry menu"
              style="background-image:url('${UI.back}')"></button>
      <div class="celebration-card">
        <div class="success-art" aria-hidden="true"><img src="${art}" alt=""></div>
        <h2>${finishedMode.title}<br>is tidy!</h2>
        <button class="again-button" type="button" data-action="again"
                data-target="again" aria-label="Play ${finishedMode.title} again">Play Again</button>
      </div>
    </section>`;
  const back = mount.querySelector('[data-action="back"]');
  const again = mount.querySelector('[data-action="again"]');
  disposers.push(onTap(back, () => showSplash({ greet: false }), { feedback }));
  disposers.push(onTap(again, () => startMode(finishedMode.id), { feedback }));
  say(finishedMode.cheer);
}

function getTargets() {
  if (state.screen === 'splash') {
    return config.modes.map((item) => targetFor(`mode-${item.id}`, 'neutral'));
  }
  if (state.screen === 'end') {
    return [targetFor('again', 'correct'), targetFor('back', 'neutral')].filter(Boolean);
  }
  if (state.screen !== 'play') return [];
  if (state.mode === 'sort') {
    const selected = sortItems.find((item) => item.id === state.selected);
    const items = sortItems.filter((item) => !item.sorted)
      .map((item) => targetFor(`sock-${item.id}`, 'neutral'));
    const bins = activeBins.map((bin) => targetFor(
      `bin-${bin.id}`,
      selected ? (selected.color === bin.id ? 'correct' : 'wrong') : 'neutral',
    ));
    return [...items, ...bins].filter(Boolean);
  }
  if (state.mode === 'fold') {
    return [targetFor('fold-zone', 'correct')].filter(Boolean);
  }
  const selected = pairCards.find((card) => card.instance === state.selected);
  return pairCards.filter((card) => !card.matched).map((card) => targetFor(
    `pair-${card.instance}`,
    selected && card.instance !== selected.instance
      ? (card.id === selected.id ? 'correct' : 'wrong')
      : 'neutral',
  )).filter(Boolean);
}

function targetFor(id, role) {
  const element = mount.querySelector(`[data-target="${cssEscape(id)}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { id, role, rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
}

async function debugTap(targetId) {
  if (targetId.startsWith('mode-')) return startMode(targetId.slice(5));
  if (targetId === 'back') {
    showSplash({ greet: false });
    return true;
  }
  if (targetId === 'again' && state.screen === 'end') return startMode(mode.id);
  if (state.mode === 'sort') {
    if (targetId.startsWith('sock-')) return selectSortItem(targetId.slice(5));
    if (targetId.startsWith('bin-')) return attemptSort(state.selected, targetId.slice(4));
  }
  if (state.mode === 'fold' && targetId === 'fold-zone') return attemptFold(true);
  if (state.mode === 'pairs' && targetId.startsWith('pair-')) return attemptPair(targetId.slice(5));
  return false;
}

async function winRound() {
  if (state.screen !== 'play') return false;
  if (state.mode === 'sort') {
    for (const item of sortItems.filter((candidate) => !candidate.sorted)) {
      await attemptSort(item.id, item.color);
    }
    return true;
  }
  if (state.mode === 'fold') {
    while (state.screen === 'play') {
      if (state.inputLocked) {
        await delay(24);
        continue;
      }
      await attemptFold(true);
    }
    return true;
  }
  while (state.screen === 'play') {
    if (state.inputLocked) {
      await delay(24);
      continue;
    }
    const remaining = pairCards.filter((card) => !card.matched);
    if (!remaining.length) break;
    const first = remaining[0];
    const second = remaining.find((card) => card.id === first.id && card.instance !== first.instance);
    await attemptPair(first.instance);
    await attemptPair(second.instance);
  }
  return true;
}

async function wrong() {
  if (state.screen !== 'play') return false;
  if (state.mode === 'sort') {
    const item = sortItems.find((candidate) => !candidate.sorted);
    const wrongBin = activeBins.find((bin) => bin.id !== item.color);
    return attemptSort(item.id, wrongBin.id);
  }
  if (state.mode === 'fold') return attemptFold(false);
  const remaining = pairCards.filter((card) => !card.matched);
  const first = remaining[0];
  const second = remaining.find((card) => card.id !== first.id);
  await attemptPair(first.instance);
  return attemptPair(second.instance);
}

window.QLOBE_DEBUG = {
  version: 1,
  gameId: config.id,
  engine: 'custom-storybook-chores',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    progress: state.progress,
    selected: state.selected,
    foldIndex: state.foldIndex,
    foldStep: state.foldStep,
    awaitingInput: state.awaitingInput && !state.inputLocked,
  }),
  getTargets,
  tap: debugTap,
  winRound,
  wrong,
  mute: () => {
    state.muted = true;
    voice.stop();
    speech.stop();
    return true;
  },
  seed: (number) => {
    state.seed = Number(number) >>> 0;
    roundSerial = 0;
    previousSortColors = '';
    rng = mulberry32(state.seed);
    return state.seed;
  },
  setFastTimers: (value = true) => {
    state.fast = !!value;
    return state.fast;
  },
};

function pointInside(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function shuffle(values, random) {
  const result = values.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function mulberry32(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function cssEscape(value) {
  return window.CSS?.escape ? window.CSS.escape(String(value)) : String(value).replace(/["\\]/g, '\\$&');
}

showSplash();
