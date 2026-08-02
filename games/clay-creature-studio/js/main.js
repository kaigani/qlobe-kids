import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import { onTap } from '../../../shared/js/tap.js';
import { createFreeformBoard } from '../../../shared/js/freeform-board.js';
import { driveLipsync, VISEME_IDENTITY } from '../../../shared/js/stage/lipsync.js';

const mount = document.getElementById('game');
const announcer = document.getElementById('announcer');
const STORAGE_KEY = 'qlobe-clay-creatures-v1';
const UI = {
  home: new URL('../../../shared/assets/ui/btn-home.png', import.meta.url).href,
  back: new URL('../../../shared/assets/ui/btn-back.png', import.meta.url).href,
  sound: new URL('../../../shared/assets/ui/btn-sound.png', import.meta.url).href,
  trash: new URL('../assets/trash.webp', import.meta.url).href,
};
const FAMILY_NAMES = {
  eyes: 'Eyes', mouths: 'Talking Mouths', tops: 'Horns, Spikes & Manes', wings: 'Wings',
  decorations: 'Decorations', limbs: 'Arms, Feet & Tails', 'dress-up': 'Dress-Up',
  'clay-balls': 'Shape Your Blob',
};

const state = {
  screen: 'splash', creature: null, mode: null, phase: 'decorate',
  prompt: 'welcome', pieces: 0, readyToWake: false, alive: null,
  savedCount: 0, muted: false, audioUnlocked: false, pendingWelcome: false,
  fast: false, seed: 42, promptDismissed: false, wakeSerial: 0,
};

let board = null;
let idleTimer = 0;
let pieceSerial = 0;
let disposers = [];
let trayDrag = null;
let wakeAudio = null;
let stopMouth = null;
const mouthRigLoads = new Map();

const creatureById = (id) => config.creatures.find((item) => item.id === id);
const partById = (id) => config.parts.find((item) => item.id === id);
const pieceById = (id) => partById(id) || config.blobBalls.find((item) => item.id === id);
const resolve = (path) => new URL(path, import.meta.url).href;

function preloadMouthRig(rig) {
  if (!mouthRigLoads.has(rig)) {
    const visemes = ['a', 'o', 'e', 'wr', 'ts', 'ln', 'uq', 'mbp', 'fv'];
    mouthRigLoads.set(rig, Promise.all(visemes.map((viseme) => new Promise((done) => {
      const image = new Image();
      image.onload = image.onerror = done;
      image.src = resolve(`../assets/mouths/${rig}/${viseme}.webp`);
    }))));
  }
  return mouthRigLoads.get(rig);
}

const ready = Promise.allSettled([
  resolve('../assets/workshop.webp'), resolve('../assets/title.webp'), resolve('../assets/alive.webp'),
  resolve('../assets/trash.webp'),
  ...config.creatures.map((item) => resolve(`../${item.art.replace('./', '')}`)),
  ...config.parts.map((item) => resolve(`../${item.art.replace('./', '')}`)),
  ...config.blobBalls.map((item) => resolve(`../${item.art.replace('./', '')}`)),
].map((src) => new Promise((done) => {
  const image = new Image();
  image.onload = image.onerror = done;
  image.src = src;
}))).then(() => { state.savedCount = loadGallery().length; });

function unlockAudio() {
  if (state.audioUnlocked) return;
  state.audioUnlocked = true;
  sfx.unlock();
  speech.unlock();
  if (state.pendingWelcome && state.screen === 'splash') {
    state.pendingWelcome = false;
    say('welcome');
  }
}
window.addEventListener('pointerdown', unlockAudio, { passive: true });

function say(key) {
  state.prompt = key;
  const line = config.voice[key] || '';
  announcer.textContent = line;
  if (state.muted || !line) return Promise.resolve();
  speech.stop();
  return speech.speak(line, { rate: .82, pitch: 1.04 });
}

function stopAudio() {
  speech.stop();
  stopMouth?.();
  stopMouth = null;
  if (wakeAudio) {
    wakeAudio.pause();
    wakeAudio.src = '';
  }
  wakeAudio = null;
}

function feedback(event) {
  event?.preventDefault?.();
  unlockAudio();
  if (!state.muted) sfx.tick();
}

function cleanup() {
  clearTimeout(idleTimer);
  stopAudio();
  board?.destroy();
  board = null;
  trayDrag?.cancel?.();
  trayDrag = null;
  for (const dispose of disposers) dispose();
  disposers = [];
}

function dismissPrompt() {
  if (state.screen !== 'build' || state.promptDismissed) return;
  state.promptDismissed = true;
  const plate = mount.querySelector('.prompt-plate');
  plate?.classList.add('is-dismissed');
  plate?.setAttribute('aria-hidden', 'true');
  plate?.setAttribute('tabindex', '-1');
}

function pointInside(rect, x, y) {
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function mirrorForPart(part, x) {
  if (!part?.autoMirror) return false;
  return part.sourceFacing === 'left' ? x > .5 : x < .5;
}

function clayButton({ action, target, label, className = '', value = '', content = '' }) {
  return `<button type="button" class="clay-button ${className}" data-action="${action}"
    data-target="${target}" data-value="${value}" aria-label="${label}">${content}</button>`;
}

function roundButton(kind, action, target, label) {
  return `<button type="button" class="round-button ${kind}-button" data-action="${action}"
    data-target="${target}" aria-label="${label}" style="background-image:url('${UI[kind]}')"></button>`;
}

function showSplash({ greet = true } = {}) {
  cleanup();
  state.screen = 'splash';
  state.creature = null;
  state.mode = null;
  state.alive = null;
  mount.innerHTML = `
    <section class="screen splash" aria-label="Clay Creature Studio">
      <a class="round-button home-button" href="../../" aria-label="Back to all games"
         style="background-image:url('${UI.home}')"></a>
      ${roundButton('sound', 'prompt', 'sound-welcome', 'Hear the welcome again')}
      <img class="title-art" src="./assets/title.webp" alt="Clay Creature Studio">
      <div class="creature-picker" role="list" aria-label="Choose a clay creature">
        ${config.creatures.map((creature) => `
          <button type="button" role="listitem" class="creature-card creature-${creature.id}"
            data-action="creature" data-value="${creature.id}" data-target="creature-${creature.id}"
            aria-label="Make a ${creature.title}">
            <span class="card-halo"></span>
            <img src="${creature.art}" alt="">
            <span>${creature.title}</span>
          </button>`).join('')}
      </div>
      ${state.savedCount ? clayButton({ action: 'shelf', target: 'shelf', label: `Open my shelf with ${state.savedCount} creatures`, className: 'shelf-button', content: `<span aria-hidden="true">▦</span> My Shelf <b>${state.savedCount}</b>` }) : ''}
      <p class="splash-whisper">Pick a clay friend</p>
    </section>`;
  wireActions();
  if (greet) {
    if (state.audioUnlocked) say('welcome');
    else state.pendingWelcome = true;
  }
}

function chooseCreature(id) {
  const creature = creatureById(id);
  if (!creature) return false;
  cleanup();
  state.screen = 'mode';
  state.creature = creature;
  mount.style.setProperty('--creature-accent', creature.accent);
  mount.innerHTML = `
    <section class="screen mode-screen" aria-label="Choose how to make your ${creature.title}">
      ${roundButton('back', 'back', 'back', 'Back to creature choices')}
      ${roundButton('sound', 'prompt', 'sound-mode', 'Hear the choices again')}
      <div class="mode-creature"><img src="${creature.art}" alt="Blank clay ${creature.title}"></div>
      <div class="mode-copy">
        <p>${creature.title}</p>
        <h1>How shall we make it?</h1>
      </div>
      <div class="mode-picker">
        ${clayButton({ action: 'start', target: 'mode-free', value: 'free', label: `Make your own ${creature.title}`, className: 'mode-plaque free-plaque', content: '<span class="mode-icon hand-icon" aria-hidden="true"><i></i></span><strong>Make My Own</strong><small>Any clay parts!</small>' })}
        ${clayButton({ action: 'start', target: 'mode-copy', value: 'copy', label: `Copy a ${creature.title} creature card`, className: 'mode-plaque copy-plaque', content: `<span class="mode-icon card-icon" aria-hidden="true"><img src="${creature.art}" alt=""></span><strong>Copy My Card</strong><small>Look and match</small>` })}
      </div>
    </section>`;
  wireActions();
  say(id).then(() => state.screen === 'mode' && say('choose-mode'));
  return true;
}

function copyCardMarkup(creature) {
  return `<aside class="copy-card" aria-label="Creature picture to copy">
    <span class="copy-pin" aria-hidden="true"></span>
    <div class="copy-mini">
      <img class="copy-body" src="${creature.art}" alt="">
      ${creature.copy.map((id, index) => {
        const part = partById(id);
        const [x, y] = part.positions?.[creature.id] || part.place;
        const mirrored = mirrorForPart(part, x);
        return `<img class="copy-part" data-copy-kind="${id}" src="${part.art}" alt=""
          style="left:${x * 100}%;top:${y * 100}%;width:${part.size * 88}% ;transform:translate(-50%,-50%) rotate(${index % 2 ? 4 : -3}deg) scaleX(${mirrored ? -1 : 1})">`;
      }).join('')}
    </div>
    <span class="copy-checks">${creature.copy.map((id) => `<i data-copy-check="${id}"></i>`).join('')}</span>
  </aside>`;
}

function startMode(modeId, creatureId = state.creature?.id || 'dino') {
  const mode = config.modes.find((item) => item.id === modeId);
  const creature = creatureById(creatureId);
  if (!mode || !creature) return false;
  cleanup();
  state.screen = 'build';
  state.mode = mode.id;
  state.creature = creature;
  state.phase = creature.id === 'blob' ? 'shape' : 'decorate';
  state.pieces = 0;
  state.readyToWake = false;
  state.promptDismissed = false;
  pieceSerial = 0;
  mount.style.setProperty('--creature-accent', creature.accent);
  mount.innerHTML = `
    <section class="screen build-screen" aria-label="Decorate your clay ${creature.title}">
      <header class="work-header">
        ${roundButton('back', 'back', 'back', 'Back to creature choices')}
        <button type="button" class="prompt-plate" data-action="prompt" data-target="prompt" aria-label="Hear the instruction again">
          <span class="prompt-orb" aria-hidden="true"></span>
          <span>${creature.id === 'blob' ? 'Drag • Squish • Shape' : mode.id === 'copy' ? 'Look • Drag • Place' : 'Drag • Make • Create'}</span>
        </button>
        ${roundButton('sound', 'prompt', 'sound-prompt', 'Hear the instruction again')}
      </header>
      <main class="work-area">
        ${mode.id === 'copy' ? copyCardMarkup(creature) : ''}
        <div class="turntable" aria-hidden="true"></div>
        <div class="creature-stage" id="creature-stage">
          ${creature.id === 'blob' ? '' : `<img class="body-art body-${creature.id}" src="${creature.art}" alt="Blank clay ${creature.title}">`}
          <div class="piece-layer" id="piece-layer" aria-label="Your clay creature decorations"></div>
        </div>
        <div class="progress-clay" aria-label="Creature progress">
          ${[0, 1, 2, 3].map((index) => `<i data-progress="${index}"></i>`).join('')}
        </div>
        ${clayButton({ action: 'wake', target: 'wake', label: 'Wake up my clay creature', className: 'wake-button', content: '<span aria-hidden="true">★</span> Wake Up!' })}
        ${creature.id === 'blob' ? clayButton({ action: 'finish-shape', target: 'finish-shape', label: 'Finish building the blob shape and start decorating', className: 'shape-button', content: '<span aria-hidden="true">●</span> Decorate My Blob' }) : ''}
      </main>
      <footer class="parts-dock">
        <div class="tray-shell">
          <div class="tray-row">
            ${clayButton({ action: 'tray-page', target: 'tray-prev', value: '-1', label: 'See earlier clay parts', className: 'tray-arrow tray-prev', content: '<span aria-hidden="true">‹</span>' })}
            <div class="parts-tray" id="parts-tray" aria-label="Drag clay parts onto your creature"></div>
            ${clayButton({ action: 'tray-page', target: 'tray-next', value: '1', label: 'See more clay parts', className: 'tray-arrow tray-next', content: '<span aria-hidden="true">›</span>' })}
            <div class="trash-zone" id="trash-zone" aria-label="Drag a clay part here to discard it">
              <img src="${UI.trash}" alt=""><span>Drop here</span>
            </div>
          </div>
        </div>
      </footer>
    </section>`;

  board = createFreeformBoard(document.getElementById('piece-layer'), {
    onChange: () => updateBuildState(),
    onGrab: () => { dismissPrompt(); if (!state.muted) sfx.pop(); },
    onDrag: (_item, point) => updateTrashHover(point.clientX, point.clientY),
    onDrop: (item, { moved, clientX, clientY }) => {
      const discarded = discardAtTrash(item.id, clientX, clientY);
      updateTrashHover();
      if (moved && !discarded && !state.muted) sfx.sparkle();
    },
  });
  wireActions();
  renderTray();
  wireTrayDrag(document.getElementById('parts-tray'));
  updateBuildState();
  const intro = creature.id === 'blob' ? 'blob-shape-intro' : mode.id === 'copy' ? 'copy-intro' : 'free-intro';
  say(intro).then(() => {
    if (state.screen === 'build' && state.phase === 'decorate' && !board.getItems().length) say('eyes-first');
  });
  scheduleNudge();
  return true;
}

function renderTray() {
  const tray = mount.querySelector('#parts-tray');
  if (!tray) return;
  const pieces = state.phase === 'shape' ? config.blobBalls : config.parts;
  let family = '';
  tray.innerHTML = pieces.map((part) => {
    const marker = part.family !== family
      ? `<div class="family-marker"><span>${FAMILY_NAMES[part.family] || part.family}</span></div>` : '';
    family = part.family;
    return `${marker}<button type="button" class="part-choice" data-part-id="${part.id}"
      data-family="${part.family}" data-target="part-${part.id}" aria-label="Drag ${part.title} onto your creature">
      <img src="${part.art}" alt=""><span>${part.title}</span>
    </button>`;
  }).join('');
  tray.scrollLeft = 0;
  updateTrayArrows();
}

function updateTrayArrows() {
  const tray = mount.querySelector('#parts-tray');
  const prev = mount.querySelector('[data-target="tray-prev"]');
  const next = mount.querySelector('[data-target="tray-next"]');
  if (!tray || !prev || !next) return;
  prev.disabled = tray.scrollLeft <= 3;
  next.disabled = tray.scrollLeft >= tray.scrollWidth - tray.clientWidth - 3;
}

function pageTray(direction) {
  const tray = mount.querySelector('#parts-tray');
  if (!tray) return false;
  tray.scrollBy({ left: Number(direction) * tray.clientWidth * .84,
    behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  setTimeout(updateTrayArrows, 360);
  return true;
}

function updateTrashHover(clientX, clientY) {
  const trash = mount.querySelector('#trash-zone');
  if (!trash) return false;
  const hot = pointInside(trash.getBoundingClientRect(), clientX, clientY);
  trash.classList.toggle('is-hot', hot);
  return hot;
}

function discardAtTrash(id, clientX, clientY) {
  if (!updateTrashHover(clientX, clientY)) return false;
  const removed = board?.remove(id) || false;
  if (removed && !state.muted) {
    sfx.unpop();
    setTimeout(() => sfx.whoosh(), 70);
  }
  return removed;
}

function wireTrayDrag(tray) {
  if (!tray) return;

  const pointerDown = (event) => {
    const choice = event.target.closest('.part-choice');
    if (!choice || trayDrag || event.isPrimary === false) return;
    const part = pieceById(choice.dataset.partId);
    if (!part) return;
    event.preventDefault();
    event.stopPropagation();
    unlockAudio();
    const start = { x: event.clientX, y: event.clientY };
    const startScroll = tray.scrollLeft;
    let mode = 'pending';
    let ghost = null;

    const position = (x, y) => {
      if (!ghost) return;
      ghost.style.left = `${x}px`;
      ghost.style.top = `${y}px`;
    };

    const beginDrag = (x, y) => {
      mode = 'drag';
      dismissPrompt();
      ghost = document.createElement('div');
      ghost.className = 'tray-drag-ghost';
      ghost.style.setProperty('--ghost-size', `${Math.max(94, innerWidth * part.size * .42)}px`);
      ghost.innerHTML = `<img src="${part.art}" alt="">`;
      document.body.append(ghost);
      choice.classList.add('is-grabbed');
      choice.setAttribute('aria-grabbed', 'true');
      position(x, y);
    };

    const finish = (release, cancelled = false) => {
      if (!trayDrag || (Number.isFinite(release?.pointerId) && release.pointerId !== event.pointerId)) return;
      release?.preventDefault?.();
      const layer = mount.querySelector('#piece-layer');
      const stage = mount.querySelector('#creature-stage');
      if (!cancelled && mode === 'drag' && layer && stage && pointInside(stage.getBoundingClientRect(), release.clientX, release.clientY)) {
        const rect = layer.getBoundingClientRect();
        placePart(part.id, {
          x: (release.clientX - rect.left) / Math.max(1, rect.width),
          y: (release.clientY - rect.top) / Math.max(1, rect.height),
        });
      }
      ghost?.remove();
      choice.classList.remove('is-grabbed');
      choice.removeAttribute('aria-grabbed');
      stage?.classList.remove('is-tray-target');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      trayDrag = null;
    };
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      moveEvent.preventDefault();
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (mode === 'pending' && Math.hypot(dx, dy) > 8) {
        if (Math.abs(dx) > Math.abs(dy) * 1.15) mode = 'scroll';
        else beginDrag(moveEvent.clientX, moveEvent.clientY);
      }
      if (mode === 'scroll') {
        tray.scrollLeft = startScroll - dx;
        updateTrayArrows();
        return;
      }
      if (mode !== 'drag') return;
      position(moveEvent.clientX, moveEvent.clientY);
      const layer = mount.querySelector('#piece-layer');
      if (part.autoMirror && layer) {
        const layerRect = layer.getBoundingClientRect();
        const x = (moveEvent.clientX - layerRect.left) / Math.max(1, layerRect.width);
        ghost.classList.toggle('is-mirrored', mirrorForPart(part, x));
      }
      const stage = mount.querySelector('#creature-stage');
      stage?.classList.toggle('is-tray-target', pointInside(stage.getBoundingClientRect(), moveEvent.clientX, moveEvent.clientY));
    };
    const up = (upEvent) => finish(upEvent, false);
    const cancel = (cancelEvent) => finish(cancelEvent, true);
    trayDrag = { cancel: () => finish(null, true) };
    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { passive: false });
    window.addEventListener('pointercancel', cancel, { passive: false });
    window.addEventListener('blur', cancel);
  };

  tray.addEventListener('pointerdown', pointerDown, { passive: false });
  tray.addEventListener('scroll', updateTrayArrows, { passive: true });
  disposers.push(() => {
    tray.removeEventListener('pointerdown', pointerDown);
    tray.removeEventListener('scroll', updateTrayArrows);
  });
}

function placePart(partId, options = {}) {
  if (state.screen !== 'build' || !board) return false;
  const part = pieceById(partId);
  if (!part) return false;
  if (state.phase === 'shape' && !part.ball) return false;
  dismissPrompt();
  clearTimeout(idleTimer);
  const existing = board.getItems().filter((item) => item.kind === part.id).length;
  const angle = ((pieceSerial * 17 + state.seed) % 13) - 6;
  const offset = Math.min(existing, 3) * .035;
  const place = part.positions?.[state.creature.id] || part.place;
  const x = options.x ?? Math.min(.82, place[0] + offset);
  const y = options.y ?? Math.min(.78, place[1] + offset * .45);
  board.add({
    id: `${part.id}-${++pieceSerial}`,
    kind: part.id,
    src: part.art,
    alt: part.title,
    x,
    y,
    size: part.size,
    rotation: options.rotation ?? angle,
    mirror: options.mirror ?? mirrorForPart(part, x),
    meta: {
      family: part.family,
      eye: !!part.eye,
      mouth: !!part.mouth,
      rig: part.rig || null,
      ball: !!part.ball,
      autoMirror: !!part.autoMirror,
      sourceFacing: part.sourceFacing || 'right',
    },
  });
  if (!state.muted) { sfx.pop(); setTimeout(() => sfx.sparkle(), 90); }
  if (state.phase === 'shape' && board.getItems().filter((item) => item.meta.ball).length === 4) say('blob-shape-ready');
  else if (board.getItems().length === 1 && part.eye) say('decorate');
  scheduleNudge();
  return true;
}

function completion() {
  const items = board?.getItems() || [];
  const kinds = new Set(items.map((item) => item.kind));
  const balls = items.filter((item) => item.meta.ball).length;
  if (state.phase === 'shape') return { done: false, progress: Math.min(4, balls), shapeReady: balls >= 4 };
  if (state.mode === 'copy') {
    const required = state.creature.copy;
    const matched = required.filter((kind) => kinds.has(kind)).length;
    return { done: required.every((kind) => kinds.has(kind)) && (state.creature.id !== 'blob' || balls >= 4), progress: matched };
  }
  const hasEye = items.some((item) => item.meta.eye);
  const hasMouth = items.some((item) => item.meta.mouth);
  const decorations = items.filter((item) => !item.meta.ball).length;
  return { done: hasEye && hasMouth && decorations >= 4, progress: Math.min(4, (hasEye ? 1 : 0) + (hasMouth ? 1 : 0) + Math.min(2, Math.max(0, decorations - 2))) };
}

function finishBlobShape() {
  if (state.screen !== 'build' || state.creature?.id !== 'blob' || state.phase !== 'shape') return false;
  if ((board?.getItems() || []).filter((item) => item.meta.ball).length < 4) return false;
  state.phase = 'decorate';
  state.readyToWake = false;
  renderTray();
  updateBuildState();
  say('blob-decorate');
  return true;
}

function updateBuildState() {
  if (state.screen !== 'build') return;
  const result = completion();
  const wasReady = state.readyToWake;
  state.pieces = board?.getItems().length || 0;
  state.readyToWake = result.done;
  mount.querySelectorAll('[data-progress]').forEach((dot, index) => dot.classList.toggle('filled', index < result.progress));
  mount.querySelectorAll('[data-copy-check]').forEach((dot) => {
    const present = board?.getItems().some((item) => item.kind === dot.dataset.copyCheck);
    dot.classList.toggle('filled', present);
  });
  const wake = mount.querySelector('[data-target="wake"]');
  if (wake) {
    wake.hidden = state.phase === 'shape';
    wake.disabled = !result.done;
    wake.classList.toggle('is-ready', result.done);
  }
  const finishShape = mount.querySelector('[data-target="finish-shape"]');
  if (finishShape) {
    finishShape.hidden = state.phase !== 'shape';
    finishShape.disabled = !result.shapeReady;
    finishShape.classList.toggle('is-ready', !!result.shapeReady);
  }
  if (!wasReady && result.done) {
    if (!state.muted) sfx.tada();
    say('ready');
  }
}

function scheduleNudge() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (state.screen !== 'build' || state.readyToWake) return;
    say(state.phase === 'shape' ? 'blob-shape-intro' : state.mode === 'copy' ? 'copy-nudge' : 'eyes-first');
  }, state.fast ? 300 : 9000);
}

function wakeCreature(snapshot = board?.snapshot()) {
  if (state.screen !== 'build' || !snapshot || (!state.readyToWake && !state.fast)) return false;
  const saved = { creature: state.creature.id, mode: state.mode, board: snapshot };
  showAlive(saved, { fresh: true });
  return true;
}

function sceneMarkup(saved, className = '') {
  const creature = creatureById(saved.creature) || config.creatures[0];
  const items = [...(saved.board?.items || [])].sort((a, b) => a.z - b.z);
  const builtBlob = creature.id === 'blob' && items.some((item) => item.meta?.ball);
  return `<div class="saved-scene ${className}" style="--saved-accent:${creature.accent}">
    ${builtBlob ? '' : `<img class="saved-body body-${creature.id}" src="${creature.art}" alt="">`}
    <div class="saved-piece-layer">${items.map((item) => `
      <img class="saved-part" data-saved-id="${item.id}" data-saved-kind="${item.kind}" src="${item.src}" alt="" style="left:${item.x * 100}%;top:${item.y * 100}%;width:${item.size * 100}%;z-index:${item.z};transform:translate(-50%,-50%) rotate(${item.rotation}deg) scaleX(${item.mirror ? -1 : 1})">`).join('')}</div>
  </div>`;
}

async function playMouthVoice(saved) {
  const mouthItem = [...(saved.board?.items || [])]
    .filter((item) => item.meta?.mouth || partById(item.kind)?.mouth)
    .sort((a, b) => b.z - a.z)[0];
  const mouth = mouthItem && partById(mouthItem.kind);
  if (!mouth || state.muted) return false;
  try {
    const manifestUrl = resolve('../assets/audio/mouths/manifest.json');
    const manifest = await fetch(manifestUrl).then((response) => {
      if (!response.ok) throw new Error(`dialogue manifest ${response.status}`);
      return response.json();
    });
    const dialogue = manifest.mouths?.[mouth.rig];
    if (!dialogue?.phrases?.length) throw new Error(`missing dialogue for ${mouth.rig}`);
    const phrase = dialogue.phrases[(state.seed + state.wakeSerial++) % dialogue.phrases.length];
    announcer.textContent = phrase.text;
    const image = mount.querySelector(`[data-saved-id="${CSS.escape(mouthItem.id)}"]`);
    const audio = new Audio(resolve(`../${phrase.audio.replace(/^\.\//, '')}`));
    wakeAudio = audio;
    const cuesPromise = fetch(resolve(`../${phrase.cues.replace(/^\.\//, '')}`)).then((response) => response.json());
    const audioReady = new Promise((done, reject) => {
      audio.addEventListener('canplaythrough', done, { once: true });
      audio.addEventListener('error', reject, { once: true });
    });
    audio.load();
    const [cues] = await Promise.all([cuesPromise, preloadMouthRig(mouth.rig), audioReady]);
    if (image) {
      const puppet = {
        setViseme(viseme) {
          const frame = viseme === 'rest' ? 'mbp' : viseme;
          image.src = resolve(`../assets/mouths/${mouth.rig}/${frame}.webp`);
        },
      };
      stopMouth = driveLipsync(puppet, audio, cues.mouthCues || cues, { map: VISEME_IDENTITY });
    }
    await audio.play();
    return true;
  } catch (error) {
    console.warn('Clay mouth dialogue fallback:', error.message);
    say(`${saved.creature}-alive`);
    return false;
  }
}

function confettiMarkup() {
  const colors = ['#f7ca48', '#ef715b', '#66a8d9', '#8d63bd', '#57ab72'];
  return Array.from({ length: 34 }, (_, index) => {
    const x = (index * 37 + state.seed * 11) % 100;
    const delay = ((index * 13) % 17) / 10;
    const turn = (index * 47) % 180;
    return `<i style="--x:${x}%;--delay:${delay}s;--turn:${turn}deg;--confetti:${colors[index % colors.length]}"></i>`;
  }).join('');
}

function showAlive(saved, { fresh = false } = {}) {
  cleanup();
  const creature = creatureById(saved.creature) || config.creatures[0];
  state.screen = 'alive';
  state.creature = creature;
  state.mode = saved.mode || 'free';
  state.alive = saved;
  state.readyToWake = true;
  mount.style.setProperty('--creature-accent', creature.accent);
  mount.innerHTML = `
    <section class="screen alive-screen" aria-label="Your clay ${creature.title} is alive">
      ${roundButton('back', 'back', 'back', 'Back to Clay Creature Studio')}
      <div class="confetti" aria-hidden="true">${confettiMarkup()}</div>
      <img class="alive-banner" src="./assets/alive.webp" alt="Alive!">
      <div class="alive-turntable">
        ${sceneMarkup(saved, 'alive-creature')}
      </div>
      <div class="alive-actions">
        ${clayButton({ action: 'save', target: 'save', label: 'Save this creature on my shelf', className: 'save-button', content: '<span aria-hidden="true">♥</span> Save to Shelf' })}
        ${clayButton({ action: 'again', target: 'again', label: 'Make another clay creature', className: 'again-button', content: '<span aria-hidden="true">＋</span> Make Another' })}
      </div>
    </section>`;
  wireActions();
  if (fresh) {
    if (!state.muted) sfx.tada();
    playMouthVoice(saved);
  }
}

function loadGallery() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(data) ? data.filter((item) => item?.board?.format === 'qlobe-freeform-board') : [];
  } catch { return []; }
}

function saveAlive() {
  if (!state.alive) return false;
  const gallery = loadGallery();
  const saved = { ...state.alive, id: `clay-${Date.now().toString(36)}`, createdAt: new Date().toISOString() };
  gallery.unshift(saved);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(gallery.slice(0, 6))); } catch { /* optional */ }
  state.savedCount = Math.min(6, gallery.length);
  const button = mount.querySelector('[data-target="save"]');
  if (button) { button.disabled = true; button.innerHTML = '<span aria-hidden="true">✓</span> On My Shelf'; }
  if (!state.muted) sfx.sparkle();
  say('saved');
  return true;
}

function showShelf() {
  cleanup();
  state.screen = 'shelf';
  const gallery = loadGallery();
  mount.innerHTML = `
    <section class="screen shelf-screen" aria-label="My saved clay creature shelf">
      ${roundButton('back', 'back', 'back', 'Back to Clay Creature Studio')}
      <header class="shelf-title"><span aria-hidden="true">★</span><h1>My Clay Shelf</h1><p>Saved on this device</p></header>
      <div class="shelf-grid">
        ${gallery.map((saved, index) => `
          <button type="button" class="shelf-card" data-action="open-saved" data-value="${index}"
            data-target="saved-${index}" aria-label="Open saved ${creatureById(saved.creature)?.title || 'creature'}">
            ${sceneMarkup(saved, 'shelf-creature')}
            <span>${creatureById(saved.creature)?.title || 'Creature'}</span>
          </button>`).join('')}
      </div>
    </section>`;
  wireActions();
}

function wireActions(root = mount) {
  for (const element of root.querySelectorAll('[data-action]:not([data-wired])')) {
    element.dataset.wired = '1';
    disposers.push(onTap(element, () => route(element.dataset.action, element.dataset.value), { feedback }));
  }
}

async function route(action, value) {
  if (action === 'creature') return chooseCreature(value);
  if (action === 'start') return startMode(value);
  if (action === 'back' || action === 'again') return showSplash({ greet: false });
  if (action === 'prompt') return say(state.prompt || 'welcome');
  if (action === 'tray-page') return pageTray(value);
  if (action === 'finish-shape') return finishBlobShape();
  if (action === 'part') return placePart(value);
  if (action === 'wake') return wakeCreature();
  if (action === 'save') return saveAlive();
  if (action === 'shelf') return showShelf();
  if (action === 'open-saved') {
    const saved = loadGallery()[Number(value)];
    if (saved) showAlive(saved, { fresh: false });
    return !!saved;
  }
  return false;
}

function targets() {
  return [...mount.querySelectorAll('[data-target]')].map((element) => {
    const rect = element.getBoundingClientRect();
    return { id: element.dataset.target, role: element.disabled ? 'disabled' : 'neutral', rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height } };
  });
}

window.QLOBE_DEBUG = {
  version: 1,
  gameId: config.id,
  engine: 'custom-freeform-board',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  listCreatures: () => config.creatures.map(({ id, title }) => ({ id, title })),
  listParts: () => config.parts.map(({ id, title, family, mouth, eye, autoMirror }) => ({ id, title, family, mouth: !!mouth, eye: !!eye, autoMirror: !!autoMirror })),
  listBlobBalls: () => config.blobBalls.map(({ id, title, size }) => ({ id, title, size })),
  getState: () => ({
    screen: state.screen, creature: state.creature?.id || null, mode: state.mode,
    phase: state.phase, pieces: state.pieces, readyToWake: state.readyToWake,
    savedCount: state.savedCount, awaitingInput: ['splash', 'mode', 'build', 'alive', 'shelf'].includes(state.screen),
  }),
  getTargets: targets,
  chooseCreature,
  startMode,
  placePart,
  finishBlobShape,
  pageTray,
  movePiece: (id, x, y) => board?.move(id, x, y) || false,
  getBoard: () => board?.snapshot() || null,
  tap: async (targetId) => {
    const element = mount.querySelector(`[data-target="${CSS.escape(targetId)}"]`);
    if (!element || element.disabled) return { accepted: false };
    await route(element.dataset.action, element.dataset.value);
    return { accepted: true };
  },
  winRound: () => {
    if (state.screen === 'splash') chooseCreature('dino');
    if (state.screen === 'mode') startMode('free');
    if (state.screen === 'build') {
      if (state.creature.id === 'blob' && state.phase === 'shape') {
        for (const kind of ['ball-coral', 'ball-yellow', 'ball-teal', 'ball-lavender']) placePart(kind);
        finishBlobShape();
      }
      const needed = state.mode === 'copy' ? state.creature.copy : ['eyes-pair', 'mouth-goofy', 'spikes-blue', 'heart'];
      for (const kind of needed) if (!board.getItems().some((item) => item.kind === kind)) placePart(kind);
      state.fast = true;
      wakeCreature(board.snapshot());
    }
    return state.screen;
  },
  mute: (value = true) => { state.muted = !!value; stopAudio(); return state.muted; },
  fastTimers: (value = true) => { state.fast = !!value; return state.fast; },
  seed: (value) => { state.seed = Number(value) || 42; return state.seed; },
  clearSaved: () => { try { localStorage.removeItem(STORAGE_KEY); } catch {} state.savedCount = 0; },
  home: () => showSplash({ greet: false }),
};

window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('gesturestart', (event) => event.preventDefault());
ready.then(() => showSplash());
