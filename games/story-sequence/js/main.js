import { assets, sequenceLabels, storageKey, stories, voiceLines } from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';

const root = document.querySelector('#game');
const timers = createTimers();
const validStoryIds = new Set(stories.map((story) => story.id));
const media = window.matchMedia('(prefers-reduced-motion: reduce)');

let rng = mulberry32(42);
let currentStory = null;
let trayOrder = [];
let completed = readProgress();
let renderGeneration = 0;
let activeDrag = null;
let suppressClickUntil = 0;
let forcedReducedMotion = false;

let state = freshState();

const artUrls = [
  ...Object.values(assets),
  ...stories.flatMap((story) => story.steps.map((step) => cardUrl(step.id))),
  '../../shared/assets/ui/btn-home.png',
  '../../shared/assets/ui/btn-back.png',
  '../../shared/assets/ui/btn-sound.png',
];

renderLibrary({ announce: false });

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', voiceLines),
  preloadImages(artUrls),
  document.fonts?.ready || Promise.resolve(),
]).then(() => {
  root.setAttribute('aria-busy', 'false');
  return true;
});

document.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('pointermove', onDragMove, { passive: false });
window.addEventListener('pointerup', onDragEnd, { passive: false });
window.addEventListener('pointercancel', cancelDrag);
window.addEventListener('blur', cancelDrag);

installDebug({
  gameId: 'story-sequence',
  engine: 'first-next-last',
  ready,
  timers,
  voice,
  sfx,
  root,
  listModes: () => stories.map(({ id, title }) => ({ id, title })),
  startMode: async (id) => {
    await ready;
    return startStory(id, { announce: false });
  },
  getState,
  tap: (id) => {
    const target = root.querySelector(`[data-target="${cssEscape(id)}"]`);
    if (!target || target.disabled) return false;
    target.click();
    return true;
  },
  winRound: () => {
    if (state.screen !== 'play' || !currentStory) return getState();
    state.placedIds = currentStory.steps.map((step) => step.id);
    state.selectedId = null;
    state.phase = 'ready';
    state.locked = false;
    state.awaitingInput = true;
    renderPlay();
    return getState();
  },
  home: () => renderLibrary({ announce: false }),
  mute: (on = true) => {
    const muted = Boolean(on);
    voice.setMuted(muted);
    sfx.setMuted(muted);
    document.querySelectorAll('audio, video').forEach((node) => { node.muted = muted; });
    return muted;
  },
  onSeed: (nextRng) => { rng = nextRng; },
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  clearProgress: () => {
    completed = [];
    writeProgress();
    if (state.screen === 'splash') renderLibrary({ announce: false });
    return [];
  },
  setReducedMotion: (on = true) => {
    forcedReducedMotion = Boolean(on);
    document.documentElement.classList.toggle('force-reduced-motion', forcedReducedMotion);
    return forcedReducedMotion;
  },
});

function freshState() {
  return {
    screen: 'splash',
    storyId: null,
    phase: 'library',
    placedIds: [null, null, null],
    selectedId: null,
    playbackIndex: -1,
    awaitingInput: true,
    locked: false,
    lastAttempt: null,
  };
}

function getState() {
  return {
    screen: state.screen,
    storyId: state.storyId,
    phase: state.phase,
    placed: state.placedIds.filter(Boolean).length,
    placedIds: [...state.placedIds],
    selectedId: state.selectedId,
    playbackIndex: state.playbackIndex,
    awaitingInput: state.awaitingInput,
    locked: state.locked,
    lastAttempt: state.lastAttempt ? { ...state.lastAttempt } : null,
    completed: [...completed],
  };
}

function renderLibrary({ announce = true } = {}) {
  renderGeneration += 1;
  timers.clearAll();
  voice.stop();
  cancelDrag();
  currentStory = null;
  trayOrder = [];
  state = freshState();

  const count = completed.length;
  const storyButtons = stories.map((story) => {
    const finished = completed.includes(story.id);
    const coverId = `${story.id}-${story.coverStep}`;
    return `
      <button class="story-choice${finished ? ' is-complete' : ''}"
        type="button" data-story-id="${story.id}" data-target="story:${story.id}"
        aria-label="${escapeHtml(story.menuLabel)} story${finished ? ', Storyteller Star earned' : ''}">
        <span class="story-choice-art">
          <img src="${cardUrl(coverId)}" alt="" draggable="false" />
        </span>
        <span class="story-choice-copy">
          <strong>${escapeHtml(story.menuLabel)}</strong>
          <small>${escapeHtml(story.menuPrompt)}</small>
        </span>
        ${finished ? `<img class="earned-star" src="${assets.star}" alt="Storyteller Star earned" />` : ''}
      </button>`;
  }).join('');

  root.innerHTML = `
    <section class="game-screen library-screen" aria-labelledby="library-title">
      <nav class="corner-controls" aria-label="Game controls">
        <a class="image-control" href="../../" data-target="hub-home" aria-label="Back to QLOBE Kids">
          <img src="../../shared/assets/ui/btn-home.png" alt="" />
        </a>
        <button class="image-control" type="button" data-hear="select-story" data-target="hear-library"
          aria-label="Hear the instructions">
          <img src="../../shared/assets/ui/btn-sound.png" alt="" />
        </button>
      </nav>

      <header class="library-heading">
        <img class="storybook-mark" src="${assets.storybook}" alt="" />
        <div class="title-paper">
          <p class="eyebrow">A little story adventure</p>
          <h1 id="library-title">First, Next, Last</h1>
          <p>Choose a story. Then put its pictures in order.</p>
        </div>
        <div class="story-progress" aria-label="${count} of 4 stories complete">
          <img src="${assets.star}" alt="" />
          <span><strong>${count}</strong> of 4 stories</span>
        </div>
      </header>

      <div class="story-grid" aria-label="Choose a story">
        ${storyButtons}
      </div>
    </section>`;

  root.querySelectorAll('[data-story-id]').forEach((button) => {
    button.addEventListener('click', () => {
      unlockAudio();
      sfx.pop();
      startStory(button.dataset.storyId);
    });
  });
  bindHearButtons();
  if (announce) void speak('select-story');
}

function startStory(id, { announce = true } = {}) {
  const nextStory = stories.find((story) => story.id === id);
  if (!nextStory) return false;

  renderGeneration += 1;
  timers.clearAll();
  voice.stop();
  cancelDrag();
  currentStory = nextStory;
  trayOrder = shuffle(nextStory.steps.map((step) => step.id));
  state = {
    screen: 'play',
    storyId: nextStory.id,
    phase: 'ordering',
    placedIds: [null, null, null],
    selectedId: null,
    playbackIndex: -1,
    awaitingInput: true,
    locked: false,
    lastAttempt: null,
  };
  renderPlay();
  if (announce) void speak('prompt-first');
  return true;
}

function renderPlay() {
  if (!currentStory) return;
  const placedCount = state.placedIds.filter(Boolean).length;
  const playback = state.phase === 'playback';
  const readyToWatch = state.phase === 'ready';
  const labels = sequenceLabels.map((label, index) => {
    const placedId = state.placedIds[index];
    const step = currentStory.steps[index];
    const interactive = !placedId && state.phase === 'ordering' && !state.locked;
    const role = state.selectedId
      ? (state.selectedId === step.id ? 'correct' : 'wrong')
      : 'neutral';
    return `
      <div class="sequence-cell${state.playbackIndex === index ? ' is-playing' : ''}">
        <span class="sequence-label label-${index}">${label}</span>
        <button class="sequence-slot${placedId ? ' is-filled' : ''}" type="button"
          data-slot-index="${index}" ${interactive ? `data-target="slot:${index}" data-role="${role}"` : 'disabled'}
          aria-label="${label} story space${placedId ? `, ${escapeHtml(step.caption)}` : ''}">
          ${placedId ? `
            <img class="placed-card" src="${cardUrl(placedId)}" alt="${escapeHtml(step.caption)}" draggable="false" />
            <img class="correct-badge" src="${assets.check}" alt="Correct" />
          ` : `
            <span class="empty-slot-number" aria-hidden="true">${index + 1}</span>
            <span class="empty-slot-copy">Put a picture here</span>
          `}
        </button>
      </div>`;
  });

  const remaining = trayOrder.filter((id) => !state.placedIds.includes(id));
  const tray = remaining.map((id) => {
    const step = currentStory.steps.find((entry) => entry.id === id);
    const selected = state.selectedId === id;
    return `
      <button class="story-card${selected ? ' is-selected' : ''}" type="button"
        data-card-id="${id}" data-target="card:${id}" aria-pressed="${selected}"
        aria-label="Picture: ${escapeHtml(step.caption)}. Tap, then choose First, Next, or Last.">
        <img src="${cardUrl(id)}" alt="${escapeHtml(step.caption)}" draggable="false" />
        <span>${escapeHtml(step.caption)}</span>
      </button>`;
  }).join('');

  const prompt = playPrompt();
  root.innerHTML = `
    <section class="game-screen play-screen${playback ? ' is-playback' : ''}" aria-labelledby="play-prompt">
      <nav class="corner-controls" aria-label="Game controls">
        <button class="image-control" type="button" data-target="home" aria-label="Back to story choices">
          <img src="../../shared/assets/ui/btn-back.png" alt="" />
        </button>
        <button class="image-control" type="button" data-hear="current" data-target="hear-play"
          ${playback ? 'disabled aria-label="Story narration is playing"' : 'aria-label="Hear that again"'}>
          <img src="../../shared/assets/ui/btn-sound.png" alt="" />
        </button>
      </nav>

      <header class="play-heading">
        <p class="story-kicker">${escapeHtml(currentStory.title)}</p>
        <h1 id="play-prompt">${escapeHtml(prompt.title)}</h1>
        <p class="playback-line" aria-live="polite">${escapeHtml(prompt.detail)}</p>
        <div class="count-pill" aria-label="${placedCount} of 3 pictures placed">
          <strong>${placedCount}</strong> of 3
        </div>
      </header>

      <div class="sequence-board" aria-label="First, next, last story board">
        ${labels[0]}
        <span class="sequence-arrow" aria-hidden="true">→</span>
        ${labels[1]}
        <span class="sequence-arrow" aria-hidden="true">→</span>
        ${labels[2]}
      </div>

      <section class="card-shelf${playback ? ' is-hidden' : ''}" aria-label="Story pictures">
        <p>${readyToWatch ? 'Your three story parts are in order!' : 'Drag a picture, or tap it and then tap a story space.'}</p>
        <div class="card-tray">${tray}</div>
      </section>

      <div class="primary-actions">
        ${readyToWatch ? `
          <button class="primary-button watch-button" type="button" data-target="watch">
            <span class="play-symbol" aria-hidden="true">▶</span>
            Watch My Story
          </button>` : ''}
      </div>
    </section>`;

  root.querySelector('[data-target="home"]')?.addEventListener('click', () => renderLibrary());
  root.querySelectorAll('[data-card-id]').forEach((card) => {
    card.addEventListener('click', () => {
      if (performance.now() < suppressClickUntil) return;
      selectCard(card.dataset.cardId);
    });
    card.addEventListener('pointerdown', beginDrag);
  });
  root.querySelectorAll('[data-slot-index]').forEach((slot) => {
    slot.addEventListener('click', () => void attemptPlacement(Number(slot.dataset.slotIndex)));
  });
  root.querySelector('[data-target="watch"]')?.addEventListener('click', () => void startPlayback());
  bindHearButtons();
}

function playPrompt() {
  if (state.phase === 'ready') {
    return { title: 'Your story is ready!', detail: 'Tap Watch My Story to bring it to life.' };
  }
  if (state.phase === 'playback' && state.playbackIndex >= 0) {
    const index = state.playbackIndex;
    return {
      title: sequenceLabels[index],
      detail: currentStory.steps[index].narration,
    };
  }
  const placedCount = state.placedIds.filter(Boolean).length;
  const nextWord = sequenceLabels[Math.min(placedCount, 2)].toLowerCase();
  return {
    title: placedCount === 0 ? 'What happens first?' : `What happens ${nextWord}?`,
    detail: 'Look closely at all three pictures.',
  };
}

function selectCard(id) {
  if (state.screen !== 'play' || state.phase !== 'ordering' || state.locked) return false;
  if (!trayOrder.includes(id) || state.placedIds.includes(id)) return false;
  state.selectedId = state.selectedId === id ? null : id;
  state.lastAttempt = null;
  root.querySelectorAll('[data-card-id]').forEach((card) => {
    const selected = card.dataset.cardId === state.selectedId;
    card.classList.toggle('is-selected', selected);
    card.setAttribute('aria-pressed', String(selected));
  });
  root.querySelectorAll('[data-slot-index]').forEach((slot) => {
    const expected = currentStory.steps[Number(slot.dataset.slotIndex)].id;
    slot.dataset.role = state.selectedId
      ? (expected === state.selectedId ? 'correct' : 'wrong')
      : 'neutral';
  });
  if (state.selectedId) sfx.tick();
  return true;
}

async function attemptPlacement(slotIndex, explicitCardId = null) {
  const cardId = explicitCardId || state.selectedId;
  if (!cardId || state.screen !== 'play' || state.phase !== 'ordering' || state.locked) return false;
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2 || state.placedIds[slotIndex]) return false;

  const expectedId = currentStory.steps[slotIndex].id;
  if (cardId !== expectedId) {
    state.lastAttempt = { cardId, slotIndex, result: 'wrong' };
    const card = root.querySelector(`[data-card-id="${cssEscape(cardId)}"]`);
    const slot = root.querySelector(`[data-slot-index="${slotIndex}"]`);
    card?.classList.remove('is-wrong');
    slot?.classList.remove('is-wrong');
    void card?.offsetWidth;
    card?.classList.add('is-wrong');
    slot?.classList.add('is-wrong');
    sfx.boing();
    void speak('wrong-slot');
    timers.after(620, () => {
      card?.classList.remove('is-wrong');
      slot?.classList.remove('is-wrong');
    });
    return false;
  }

  const generation = ++renderGeneration;
  state.locked = true;
  state.awaitingInput = false;
  state.lastAttempt = { cardId, slotIndex, result: 'correct' };
  state.placedIds[slotIndex] = cardId;
  state.selectedId = null;
  const complete = state.placedIds.every(Boolean);
  state.phase = complete ? 'ready' : 'ordering';
  state.locked = false;
  state.awaitingInput = true;
  sfx.pop();
  renderPlay();

  const feedbackKey = ['correct-first', 'correct-next', 'correct-last'][slotIndex];
  await speak(feedbackKey);
  if (generation !== renderGeneration || !complete || state.phase !== 'ready') return true;
  sfx.sparkle();
  await timers.wait(220);
  if (generation === renderGeneration && state.phase === 'ready') await speak('story-ready');
  return true;
}

async function startPlayback() {
  if (state.screen !== 'play' || state.phase !== 'ready' || state.locked || !currentStory) return false;
  unlockAudio();
  const generation = ++renderGeneration;
  state.phase = 'playback';
  state.playbackIndex = -1;
  state.locked = true;
  state.awaitingInput = false;
  renderPlay();

  for (let index = 0; index < currentStory.steps.length; index += 1) {
    if (generation !== renderGeneration || state.phase !== 'playback') return false;
    state.playbackIndex = index;
    updatePlaybackBeat(index);
    sfx.whoosh();
    await speak(currentStory.steps[index].id, currentStory.steps[index].narration);
    if (generation !== renderGeneration || state.phase !== 'playback') return false;
    await timers.wait(reducedMotion() ? 120 : 420);
  }

  if (generation !== renderGeneration) return false;
  finishStory();
  return true;
}

function updatePlaybackBeat(index) {
  root.querySelectorAll('.sequence-cell').forEach((cell, cellIndex) => {
    cell.classList.toggle('is-playing', cellIndex === index);
    cell.classList.toggle('is-past', cellIndex < index);
  });
  const title = root.querySelector('#play-prompt');
  const detail = root.querySelector('.playback-line');
  if (title) title.textContent = sequenceLabels[index];
  if (detail) detail.textContent = currentStory.steps[index].narration;
}

function finishStory() {
  const firstCompletion = !completed.includes(currentStory.id);
  if (firstCompletion) {
    completed = [...completed, currentStory.id];
    writeProgress();
  }
  state.screen = 'end';
  state.phase = 'celebrate';
  state.playbackIndex = 2;
  state.locked = false;
  state.awaitingInput = true;
  renderEnd();
  sfx.tada();
  void speak(completed.length === stories.length ? 'all-stories' : 'great-story');
}

function renderEnd() {
  const allDone = completed.length === stories.length;
  const cards = currentStory.steps.map((step, index) => `
    <article class="final-card">
      <span>${sequenceLabels[index]}</span>
      <img src="${cardUrl(step.id)}" alt="${escapeHtml(step.caption)}" />
      <img class="correct-badge" src="${assets.check}" alt="Correct" />
    </article>`).join('');

  root.innerHTML = `
    <section class="game-screen end-screen" aria-labelledby="end-title">
      <nav class="corner-controls" aria-label="Game controls">
        <button class="image-control" type="button" data-target="home" aria-label="Back to story choices">
          <img src="../../shared/assets/ui/btn-back.png" alt="" />
        </button>
        <button class="image-control" type="button" data-hear="end" data-target="hear-end" aria-label="Hear the celebration">
          <img src="../../shared/assets/ui/btn-sound.png" alt="" />
        </button>
      </nav>

      <img class="confetti-art confetti-left" src="${assets.confetti}" alt="" />
      <img class="confetti-art confetti-right" src="${assets.confetti}" alt="" />
      <header class="end-heading">
        <p class="eyebrow">FIRST · NEXT · LAST</p>
        <h1 id="end-title">${allDone ? 'Storyteller Star!' : 'Great story!'}</h1>
        <p>${allDone ? 'You brought all four little stories to life.' : 'You put every picture in just the right place.'}</p>
      </header>

      <div class="final-sequence">${cards}</div>

      <div class="reward-row">
        <img src="${assets.star}" alt="Storyteller Star" />
        <p><strong>${completed.length} of 4</strong> Storyteller Stars</p>
      </div>

      <div class="end-actions">
        <button class="secondary-button" type="button" data-target="again">Play Again</button>
        <button class="primary-button" type="button" data-target="another">Choose Another Story</button>
      </div>
    </section>`;

  root.querySelector('[data-target="home"]')?.addEventListener('click', () => renderLibrary());
  root.querySelector('[data-target="again"]')?.addEventListener('click', () => startStory(currentStory.id));
  root.querySelector('[data-target="another"]')?.addEventListener('click', () => renderLibrary());
  bindHearButtons();
}

function bindHearButtons() {
  root.querySelectorAll('[data-hear]').forEach((button) => {
    button.addEventListener('click', () => {
      unlockAudio();
      sfx.tick();
      const kind = button.dataset.hear;
      if (kind === 'select-story') void speak('select-story');
      else if (kind === 'end') void speak(completed.length === stories.length ? 'all-stories' : 'great-story');
      else if (state.phase === 'ready') void speak('story-ready');
      else if (state.phase === 'playback' && state.playbackIndex >= 0) {
        const step = currentStory.steps[state.playbackIndex];
        void speak(step.id, step.narration);
      } else void speak('prompt-first');
    });
  });
}

function beginDrag(event) {
  if (state.screen !== 'play' || state.phase !== 'ordering' || state.locked || activeDrag) return;
  if (event.button !== undefined && event.button !== 0) return;
  const card = event.currentTarget;
  const rect = card.getBoundingClientRect();
  activeDrag = {
    pointerId: event.pointerId,
    cardId: card.dataset.cardId,
    origin: card,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    height: rect.height,
    moved: false,
    ghost: null,
    slotIndex: null,
  };
  card.setPointerCapture?.(event.pointerId);
}

function onDragMove(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  const distance = Math.hypot(event.clientX - activeDrag.startX, event.clientY - activeDrag.startY);
  if (!activeDrag.moved && distance < 9) return;
  event.preventDefault();

  if (!activeDrag.moved) {
    activeDrag.moved = true;
    activeDrag.origin.classList.add('is-drag-origin');
    activeDrag.ghost = activeDrag.origin.cloneNode(true);
    activeDrag.ghost.removeAttribute('data-target');
    activeDrag.ghost.classList.add('drag-ghost');
    activeDrag.ghost.style.width = `${activeDrag.width}px`;
    activeDrag.ghost.style.height = `${activeDrag.height}px`;
    document.body.appendChild(activeDrag.ghost);
    sfx.whoosh();
  }

  activeDrag.ghost.style.left = `${event.clientX - activeDrag.offsetX}px`;
  activeDrag.ghost.style.top = `${event.clientY - activeDrag.offsetY}px`;
  const hovered = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-slot-index]');
  activeDrag.slotIndex = hovered && !hovered.disabled ? Number(hovered.dataset.slotIndex) : null;
  root.querySelectorAll('[data-slot-index]').forEach((slot) => {
    slot.classList.toggle('is-drop-hover', Number(slot.dataset.slotIndex) === activeDrag.slotIndex);
  });
}

function onDragEnd(event) {
  if (!activeDrag || event.pointerId !== activeDrag.pointerId) return;
  event.preventDefault();
  const { cardId, moved, slotIndex } = activeDrag;
  cleanupDragVisuals();
  suppressClickUntil = performance.now() + 350;
  if (!moved) selectCard(cardId);
  else if (slotIndex !== null) void attemptPlacement(slotIndex, cardId);
  else sfx.unpop();
}

function cancelDrag() {
  if (!activeDrag) return;
  cleanupDragVisuals();
}

function cleanupDragVisuals() {
  activeDrag?.ghost?.remove();
  activeDrag?.origin?.classList.remove('is-drag-origin');
  root.querySelectorAll('.is-drop-hover').forEach((slot) => slot.classList.remove('is-drop-hover'));
  activeDrag = null;
}

function unlockAudio() {
  voice.unlock();
  sfx.unlock();
}

function speak(key, fallback = voiceLines[key]) {
  return voice.say(key, fallback || '');
}

function reducedMotion() {
  return forcedReducedMotion || media.matches;
}

function cardUrl(id) {
  return `./assets/art/cards/${id}.webp`;
}

function shuffle(values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(rng() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
    if (!Array.isArray(saved)) return [];
    return [...new Set(saved.filter((id) => validStoryIds.has(id)))];
  } catch {
    return [];
  }
}

function writeProgress() {
  try { localStorage.setItem(storageKey, JSON.stringify(completed)); } catch { /* session state still works */ }
}

function preloadImages(urls) {
  return Promise.all([...new Set(urls)].map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  })));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[character]);
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
}
