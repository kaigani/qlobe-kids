// Letter Treasure Hunt — a full-viewport A–Z papercraft island carousel.
// Raster plates own the world; this module owns live copy, navigation, touch
// targets, phonics feedback, and the platform review/debug surface.

import * as sfx from '../../../shared/js/sfx.js';
import * as voice from '../../../shared/js/voice-clips.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { installDebug, collectTargets } from '../../../shared/js/debug-harness.js';
import { installKioskGuards, installUnlockOnGesture, unlockAll } from '../../../shared/js/audio-unlock.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { ISLANDS } from './islands.js';

const mount = document.getElementById('game');
const AUTHORING_PREVIEW = new URL(location.href).searchParams.get('layout-editor') === '1';
const timers = createTimers();
const AUTHORED_NARRATION = {
  'island-a': 'A island. A says ah. Apple Island.',
  'hunt-a': 'Find things that start with A. A says ah.',
  'found-a-ant': 'A is for ant. Ah, ant.',
  'found-a-apple': 'A is for apple. Ah, apple.',
  'found-a-alligator': 'A is for alligator. Ah, alligator.',
  'wrong-a': 'That is a treasure chest. Find an A thing.',
  'wrong-a-ball': 'Ball starts with B, not A. Find an A thing.',
  'idle-a': 'Can you find an A treasure? Listen for ah.',
  'complete-a': 'Well done! A is for apple. Ah, apple.',
  'island-b': 'B island. B says buh. Beach Ball Island.',
  'hunt-b': 'Find things that start with B. B says buh.',
  'found-b-butterfly': 'B is for butterfly. Buh, butterfly.',
  'found-b-ball': 'B is for ball. Buh, ball.',
  'found-b-boat': 'B is for boat. Buh, boat.',
  'wrong-b': 'That is a treasure chest. Find a B thing.',
  'wrong-b-cat': 'Cat starts with C, not B. Find a B thing.',
  'idle-b': 'Can you find a B treasure? Listen for buh.',
  'complete-b': 'Well done! B is for ball. Buh, ball.',
  'island-c': 'C island. C says kuh. Cupcake Island.',
  'hunt-c': 'Find things that start with C. C says kuh.',
  'found-c-cat': 'C is for cat. Kuh, cat.',
  'found-c-cupcake': 'C is for cupcake. Kuh, cupcake.',
  'found-c-car': 'C is for car. Kuh, car.',
  'wrong-c': 'That is a treasure chest. Find a C thing.',
  'wrong-c-apple': 'Apple starts with A, not C. Find a C thing.',
  'idle-c': 'Can you find a C treasure? Listen for kuh.',
  'complete-c': 'Well done! C is for cupcake. Kuh, cupcake.',
};

const ARTICLE_LETTERS = 'AEFHILMNORSX';
const NARRATION_CUES = {
  d: 'duh', e: 'eh', f: 'fuh', g: 'guh', h: 'huh', j: 'juh', k: 'kuh',
  l: 'luh', m: 'muh', n: 'nuh', p: 'puh', q: 'kwuh', r: 'ruh',
  t: 'tuh', v: 'vuh', w: 'wuh', y: 'yuh', z: 'zuh',
};

function addNarrationFor(island) {
  const { id, letter, name, items } = island;
  if (AUTHORED_NARRATION[`island-${id}`]) return;
  const article = ARTICLE_LETTERS.includes(letter) ? 'an' : 'a';
  const cue = NARRATION_CUES[id];
  const completionWord = island.scene?.completionWord || items[0].word;
  const distractor = island.scene?.distractors?.[0];

  if (id === 's') {
    AUTHORED_NARRATION[`island-${id}`] = 'S island. S says sss in sun and starfish. Starfish Island.';
    AUTHORED_NARRATION[`hunt-${id}`] = 'Find things that start with S. Listen for sss.';
  } else if (['i', 'o', 'u'].includes(id)) {
    AUTHORED_NARRATION[`island-${id}`] = `${letter} island. ${letter} has more than one sound. ${name}.`;
    AUTHORED_NARRATION[`hunt-${id}`] = `Find things that start with ${letter}.`;
  } else if (id === 'x') {
    AUTHORED_NARRATION[`island-${id}`] = 'X island. X is a special letter. Xylophone Island.';
    AUTHORED_NARRATION[`hunt-${id}`] = 'Find things that start with X.';
  } else {
    AUTHORED_NARRATION[`island-${id}`] = `${letter} island. ${letter} says ${cue}. ${name}.`;
    AUTHORED_NARRATION[`hunt-${id}`] = `Find things that start with ${letter}. ${letter} says ${cue}.`;
  }

  for (const item of items) {
    const lead = `${letter} is for ${item.word.toLowerCase()}.`;
    AUTHORED_NARRATION[`found-${id}-${item.id}`] = id === 's'
      ? (item.id === 'shell' ? lead : `${lead} Sss, ${item.word.toLowerCase()}.`)
      : cue ? `${lead} ${cue[0].toUpperCase()}${cue.slice(1)}, ${item.word.toLowerCase()}.` : lead;
  }
  AUTHORED_NARRATION[`wrong-${id}`] = `That is a treasure chest. Find ${article} ${letter} thing.`;
  if (distractor) {
    AUTHORED_NARRATION[distractor.narrationKey] = `${distractor.word} starts with ${distractor.letter}, not ${letter}. Find ${article} ${letter} thing.`;
  }
  AUTHORED_NARRATION[`idle-${id}`] = id === 's'
    ? 'Can you find an S treasure? Listen for sss.'
    : cue
    ? `Can you find ${article} ${letter} treasure? Listen for ${cue}.`
    : `Can you find ${article} ${letter} treasure?`;
  AUTHORED_NARRATION[`complete-${id}`] = id === 's'
    ? 'Well done! S is for starfish. Sss, starfish.'
    : cue
    ? `Well done! ${letter} is for ${completionWord.toLowerCase()}. ${cue[0].toUpperCase()}${cue.slice(1)}, ${completionWord.toLowerCase()}.`
    : `Well done! ${letter} is for ${completionWord.toLowerCase()}.`;
}

ISLANDS.forEach(addNarrationFor);
const ready = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', AUTHORED_NARRATION);
const ART = {
  celebration: new URL('../assets/papercraft/celebration.webp', import.meta.url).href,
  map: new URL('../assets/papercraft/quest-map.webp', import.meta.url).href,
  ui: {
    title: new URL('../assets/ui-raster/quest-title.webp', import.meta.url).href,
    next: new URL('../assets/ui-raster/next.webp', import.meta.url).href,
  },
};
const islands = ISLANDS;

const state = {
  screen: 'splash', // splash = carousel, play = hunt, end = celebration
  carouselIndex: 1, // B is the first fully narrated quest
  found: new Set(),
  busy: false,
  paused: false,
  toast: '',
  feedbackArt: '',
  muted: false,
  seed: null,
  rng: Math.random,
  idleTimer: null,
};

let disposers = [];
let liveRegion = null;
let questSession = 0;

if (!AUTHORING_PREVIEW) {
  installKioskGuards();
  installUnlockOnGesture({ onFirst: () => {} });
}

function currentIsland() {
  return islands[state.carouselIndex] || islands[0];
}

function currentArt(island = currentIsland()) {
  return new URL(island.art, import.meta.url).href;
}

function huntArt(island = currentIsland()) {
  return island.scene?.background ? new URL(island.scene.background, import.meta.url).href : currentArt(island);
}

function sceneArt(path) {
  return path ? new URL(path, import.meta.url).href : '';
}

function sceneStyle(position) {
  if (!position) return '';
  return `style="top:${position.y}%;right:auto;left:${position.x}%;width:${position.w}%;height:${position.h}%"`;
}

function hasArtTrim(position) {
  return Boolean(position?.trim && ['x', 'y', 'w', 'h'].every((key) => Number.isFinite(position.trim[key])));
}

function cutoutMarkup(position, className = 'lth-treasure-art') {
  if (!position?.art) return '';
  const trimmed = hasArtTrim(position);
  const trim = position.trim;
  const trimStyle = trimmed
    ? ` style="left:${-trim.x / trim.w * 100}%;top:${-trim.y / trim.h * 100}%;width:${10000 / trim.w}%;height:${10000 / trim.h}%"`
    : '';
  return `<img class="${className}${trimmed ? ' is-alpha-trimmed' : ''}" src="${sceneArt(position.art)}"${trimStyle} alt="" draggable="false">`;
}

function authoredLine(key, fallback) {
  return AUTHORED_NARRATION[key] || fallback;
}

function letterArticle(letter) {
  return ARTICLE_LETTERS.includes(letter) ? 'an' : 'a';
}

function feedbackAsset(kind, island, itemId = '') {
  if (!island.scene) return '';
  if (kind === 'found') return itemId;
  if (island.id === 'b') return kind === 'wrong' ? 'wrong' : 'another';
  return `${kind}-${island.id}`;
}

function uiArt(path) {
  return new URL(`../assets/ui-raster/${path}.webp`, import.meta.url).href;
}

function selectLetter(index, { speak = false } = {}) {
  questSession += 1;
  state.carouselIndex = (index + islands.length) % islands.length;
  state.found.clear();
  state.busy = false;
  state.paused = false;
  state.toast = '';
  state.feedbackArt = '';
  preloadNeighbors();
  render();
  if (speak) {
    sfx.tick();
    const selected = currentIsland();
    const key = `island-${selected.id}`;
    announce(key, authoredLine(key, `${selected.letter} island. ${selected.name}.`));
  }
  return state;
}

function preloadNeighbors() {
  const island = currentIsland();
  const previous = islands[(state.carouselIndex + islands.length - 1) % islands.length];
  const next = islands[(state.carouselIndex + 1) % islands.length];
  const sceneAssets = island.scene ? [
    sceneArt(island.scene.background),
    sceneArt(island.scene.celebration),
    sceneArt(island.scene.decoy.art),
    ...Object.values(island.scene.targets).map((target) => sceneArt(target.art)).filter(Boolean),
    ...(island.scene.distractors || []).map((distractor) => sceneArt(distractor.art)),
    ...(island.scene.completionTargets || []).map((target) => sceneArt(target.art)),
    sceneArt(island.scene.completionDecoration?.art),
    uiArt(`completion-${island.id}`),
  ] : [];
  void preloadImages([currentArt(), currentArt(previous), currentArt(next), ...sceneAssets]);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[char]));
}

function iconButton(target, label, className, icon = target) {
  return `<button class="lth-icon-button ${className}" type="button" data-target="${target}" data-role="neutral" aria-label="${escapeHtml(label)}"><img class="lth-control-art" src="${uiArt(`controls/${icon}`)}" alt="" draggable="false"></button>`;
}

function frame(art, content, island = currentIsland()) {
  return `<div class="lth-frame" data-letter="${island.letter}"><img class="lth-art" src="${art}" alt="" draggable="false">${content}</div>`;
}

function carouselMarkup() {
  const island = currentIsland();
  const nearby = [-1, 0, 1].map((offset) => islands[(state.carouselIndex + offset + islands.length) % islands.length]);
  const islandButtons = nearby.map((item, position) => {
    const selected = position === 1;
    return `<button class="lth-map-island lth-map-island-${position} ${selected ? 'is-selected' : ''}" data-target="launch-island" data-index="${item.index}" data-role="primary" type="button" aria-label="Start ${item.letter} island quest, ${escapeHtml(item.name)}">
      <img class="lth-map-letter" src="${uiArt(`letters/${item.id}`)}" alt="" draggable="false"><span class="visually-hidden">${item.letter}</span>
    </button>`;
  }).join('');
  const toast = state.toast ? `<p class="lth-toast lth-paper" role="status">${escapeHtml(state.toast)}</p>` : '';
  return `<section class="lth-screen lth-carousel" aria-label="Choose a letter island">
    ${frame(ART.map, `
      <a class="lth-icon-button lth-home" href="../../" data-target="home" data-role="navigation" aria-label="Back to the QLOBE Kids home"><img class="lth-control-art" src="${uiArt('controls/home')}" alt="" draggable="false"></a>
      <img class="lth-title" src="${ART.ui.title}" alt="" draggable="false"><h1 class="visually-hidden">Choose a Letter Quest</h1>
      <button class="lth-carousel-arrow lth-arrow-left" data-target="carousel-prev" data-role="neutral" type="button" aria-label="Previous letter island"><img src="${uiArt('controls/previous')}" alt="" draggable="false"></button>
      <button class="lth-carousel-arrow lth-arrow-right" data-target="carousel-next" data-role="neutral" type="button" aria-label="Next letter island"><img src="${uiArt('controls/next')}" alt="" draggable="false"></button>
      <div class="lth-map-islands" aria-live="polite">${islandButtons}</div>
      ${iconButton('sound', 'Hear the selected letter island', 'lth-sound')}
      ${toast}
      <p class="lth-live-region visually-hidden" aria-live="polite"></p>
    `, island)}
  </section>`;
}

function huntMarkup() {
  const island = currentIsland();
  const letter = island.letter;
  const layered = Boolean(island.scene);
  const coverAligned = island.index >= 3;
  const tokens = island.items.map((item, index) => {
    const filled = state.found.size > index;
    return `<span class="lth-token ${filled ? 'is-filled' : ''}" aria-label="${filled ? `${letter} treasure found` : 'empty treasure token'}"><img src="${uiArt(filled ? `tokens/${island.id}` : 'tokens/empty')}" alt="" draggable="false"></span>`;
  }).join('');
  const foundMarks = layered ? '' : island.items.filter((item) => state.found.has(item.id))
    .map((item) => `<span class="lth-found-mark lth-found-${item.layout}" aria-hidden="true">✓</span>`).join('');
  const feedbackSrc = state.feedbackArt ? uiArt(`feedback/${state.feedbackArt}`) : '';
  const toast = `<p class="lth-feedback ${state.toast ? 'is-visible' : ''}" role="status" aria-hidden="${state.toast ? 'false' : 'true'}">${feedbackSrc ? `<img src="${feedbackSrc}" alt="" draggable="false">` : ''}<span class="visually-hidden">${escapeHtml(state.toast)}</span></p>`;
  const paused = state.paused ? `<div class="lth-paused" role="dialog" aria-modal="true" aria-label="Game paused">
      <div class="lth-paused-card"><img class="lth-dialog-art" src="${uiArt(`dialogs/pause-${layered ? island.id : 'b'}`)}" alt="" draggable="false"><span class="visually-hidden">${escapeHtml(island.name)} paused</span><button class="lth-resume" data-target="resume" data-role="primary" type="button" aria-label="Resume game"><img src="${uiArt('controls/resume')}" alt="" draggable="false"></button></div>
    </div>` : '';
  const targets = island.items.map((item) => {
    const position = island.scene?.targets[item.id];
    const found = state.found.has(item.id);
    const image = layered ? cutoutMarkup(position) : '';
    const bakedFound = island.scene?.bakedTargets && found
      ? `<img class="lth-baked-found-art" src="${uiArt(`tokens/${island.id}`)}" alt="" draggable="false">`
      : '';
    return `<button class="lth-hotspot lth-hotspot-${item.layout} lth-target-${item.id} ${layered ? 'is-layered' : ''} ${hasArtTrim(position) ? 'has-tight-art' : ''} ${found ? 'is-found' : ''}" ${sceneStyle(position)} data-target="${item.id}" data-layout="${item.layout}" data-role="correct" type="button" aria-label="${escapeHtml(item.word)}" ${found ? 'disabled' : ''}>${image}${bakedFound}<span class="visually-hidden">${escapeHtml(item.word)}</span></button>`;
  }).join('');
  const decoy = island.decoy;
  const decoyPosition = island.scene?.decoy;
  const decoyTarget = layered ? `<button class="lth-wrong-hotspot lth-wrong-${decoy.layout} ${hasArtTrim(decoyPosition) ? 'has-tight-art' : ''}" ${sceneStyle(decoyPosition)} data-target="${decoy.id}" data-layout="${decoy.layout}" data-role="wrong" type="button" aria-label="${escapeHtml(decoy.word)}">${cutoutMarkup(decoyPosition)}<span class="visually-hidden">${escapeHtml(decoy.word)}</span></button>` : '';
  const distractorTargets = (island.scene?.distractors || []).map((distractor) => `<button class="lth-distractor-hotspot lth-${distractor.id} ${hasArtTrim(distractor) ? 'has-tight-art' : ''}" ${sceneStyle(distractor)} data-target="${distractor.id}" data-role="wrong" type="button" aria-label="${escapeHtml(distractor.word)}, starts with ${distractor.letter}">${cutoutMarkup(distractor)}<span class="visually-hidden">${escapeHtml(distractor.word)} starts with ${distractor.letter}, not ${letter}</span></button>`).join('');
  return `<section class="lth-screen lth-hunt" aria-label="Find things that start with ${letter}">
    ${frame(huntArt(island), `
      ${iconButton('back', 'Back to letter islands', 'lth-back')}
      <div class="lth-badge" aria-label="Target letter ${letter}"><img src="${uiArt(`badges/${island.id}`)}" alt="" draggable="false"></div>
      <p class="lth-prompt"><img src="${uiArt(`prompts/${island.id}`)}" alt="" draggable="false"><span class="visually-hidden">Find things that start with ${letter}</span></p>
      <div class="lth-progress" aria-label="${state.found.size} of ${island.items.length} treasures found">${tokens}</div>
      <button class="lth-pause" data-target="pause" data-role="neutral" type="button" aria-label="${state.paused ? 'Resume' : 'Pause'}"><img class="lth-control-art" src="${uiArt(`controls/${state.paused ? 'resume' : 'pause'}`)}" alt="" draggable="false"></button>
      <div class="lth-scene-stage ${coverAligned ? 'is-cover-aligned' : ''}">
        ${targets}
        ${distractorTargets}
        ${decoyTarget}
        ${foundMarks}
      </div>
      ${iconButton('sound', `Hear the ${letter} hunt prompt again`, 'lth-sound')}
      ${toast}
      <p class="lth-count" aria-live="polite"><img src="${uiArt(`counts/${state.found.size}`)}" alt="" draggable="false"><span class="visually-hidden">${state.found.size} of ${island.items.length}</span></p>
      <p class="lth-live-region visually-hidden" aria-live="polite"></p>
      ${paused}
    `, island)}
  </section>`;
}

function endMarkup() {
  const island = currentIsland();
  const completionWord = island.scene?.completionWord || island.items[0].word;
  const art = island.scene?.celebration ? sceneArt(island.scene.celebration) : ART.celebration;
  const decoration = island.scene?.completionDecoration;
  const completionTargets = (island.scene?.completionTargets || [])
    .map((target) => `<div class="lth-completion-target"${target.id ? ` data-layout-id="${escapeHtml(target.id)}"` : ''} ${sceneStyle(target)}>${cutoutMarkup(target, 'lth-completion-object-art')}</div>`)
    .join('');
  const completionScene = completionTargets || decoration
    ? `<div class="lth-completion-scene-stage${island.index >= 3 ? ' is-cover-aligned' : ''}">
        ${completionTargets}
        ${decoration ? `<div class="lth-completion-decoration" ${sceneStyle(decoration)}>${cutoutMarkup(decoration, 'lth-completion-object-art')}</div>` : ''}
      </div>`
    : '';
  return `<section class="lth-screen lth-end" aria-label="Well Done">
    ${frame(art, `
      ${iconButton('back', 'Back to letter islands', 'lth-back')}
      ${completionScene}
      <div class="lth-end-card">
        <div class="lth-end-tokens" aria-label="Three ${island.letter} treasures collected"><img src="${uiArt(`tokens/${island.id}`)}" alt=""><img src="${uiArt(`tokens/${island.id}`)}" alt=""><img src="${uiArt(`tokens/${island.id}`)}" alt=""></div>
        ${island.scene ? `<img class="lth-completion-panel" src="${uiArt(`completion-${island.id}`)}" alt="" draggable="false">` : `<div class="lth-legacy-end-copy"><h1>Well Done!</h1><p><strong>${island.letter}</strong> is for <strong>${escapeHtml(completionWord)}!</strong></p><span>${island.items.length} of ${island.items.length}</span></div>`}
        <span class="visually-hidden">Well Done! ${island.letter} is for ${escapeHtml(completionWord)}! ${island.items.length} of ${island.items.length}</span>
      </div>
      <button class="lth-next" data-target="next" data-role="primary" type="button" aria-label="Next letter island"><img src="${ART.ui.next}" alt="" draggable="false"></button>
      ${iconButton('sound', 'Hear the celebration again', 'lth-sound')}
      <p class="lth-live-region visually-hidden" aria-live="polite"></p>
    `, island)}
  </section>`;
}

function clearTimers() {
  timers.clearAll();
  state.idleTimer = null;
}

function clearHandlers() {
  for (const dispose of disposers) dispose();
  disposers = [];
}

function render() {
  clearHandlers();
  clearTimers();
  mount.innerHTML = state.screen === 'splash' ? carouselMarkup() : state.screen === 'play' ? huntMarkup() : endMarkup();
  liveRegion = mount.querySelector('.lth-live-region');
  if (!AUTHORING_PREVIEW) {
    wireControls();
    activateModal();
    if (state.screen === 'play' && !state.paused && state.found.size < currentIsland().items.length) armIdleNudge();
  }
}

function activateModal() {
  const dialog = mount.querySelector('[role="dialog"][aria-modal="true"]');
  if (!dialog) return;
  const frameElement = dialog.closest('.lth-frame');
  for (const child of frameElement?.children || []) {
    if (child !== dialog) child.inert = true;
  }
  dialog.querySelector('button')?.focus({ preventScroll: true });
}

function restoreFocus(selector) {
  mount.querySelector(selector)?.focus({ preventScroll: true });
}

function wireControls() {
  for (const element of mount.querySelectorAll('[data-target]')) {
    if (element.matches('a[href]')) continue;
    disposers.push(onTap(element, () => handleTarget(element.dataset.target, element), {
      feedback: () => { unlockAll(); },
    }));
  }
}

function announce(key, text) {
  if (liveRegion) liveRegion.textContent = text;
  return state.muted ? Promise.resolve() : voice.say(key, text);
}

function motionDuration(duration) {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 60 : duration;
}

function armIdleNudge() {
  state.idleTimer = timers.after(10000, () => {
    if (state.screen !== 'play' || state.paused || state.busy || state.found.size === currentIsland().items.length) return;
    const island = currentIsland();
    state.toast = `Can you find ${letterArticle(island.letter)} ${island.letter} treasure?`;
    state.feedbackArt = feedbackAsset('idle', island);
    const key = `idle-${island.id}`;
    announce(key, authoredLine(key, state.toast));
    render();
  });
}

function updateFeedback(text, art = '') {
  state.toast = text;
  state.feedbackArt = art;
  const feedback = mount.querySelector('.lth-feedback');
  if (!feedback) return;
  feedback.innerHTML = art
    ? `<img src="${uiArt(`feedback/${art}`)}" alt="" draggable="false"><span class="visually-hidden">${escapeHtml(text)}</span>`
    : `<span>${escapeHtml(text)}</span>`;
  feedback.classList.toggle('is-visible', Boolean(text));
  feedback.setAttribute('aria-hidden', text ? 'false' : 'true');
}

function lockPauseDuringFeedback(locked) {
  const pause = mount.querySelector('.lth-pause');
  if (!pause) return;
  pause.disabled = Boolean(locked);
  pause.setAttribute('aria-disabled', String(Boolean(locked)));
}

function startHunt() {
  questSession += 1;
  const island = currentIsland();
  state.screen = 'play';
  state.found.clear();
  state.busy = false;
  state.paused = false;
  state.toast = '';
  state.feedbackArt = '';
  render();
  if (!AUTHORING_PREVIEW) timers.after(220, () => {
    const key = `hunt-${island.id}`;
    announce(key, authoredLine(key, `Find things that start with ${island.letter}.`));
  });
  return state;
}

function returnToCarousel({ advance = false } = {}) {
  questSession += 1;
  voice.stop();
  state.screen = 'splash';
  state.found.clear();
  state.busy = false;
  state.paused = false;
  state.toast = '';
  state.feedbackArt = '';
  if (advance) state.carouselIndex = (state.carouselIndex + 1) % islands.length;
  preloadNeighbors();
  render();
  return state;
}

function finishQuest() {
  questSession += 1;
  voice.stop();
  state.screen = 'end';
  state.busy = false;
  state.paused = false;
  state.toast = '';
  state.feedbackArt = '';
  render();
  sfx.tada();
  timers.after(180, () => {
    const island = currentIsland();
    const key = `complete-${island.id}`;
    announce(key, authoredLine(key, `Well done! ${island.letter} island complete.`));
  });
  return state;
}

async function tapTreasure(item, element = null) {
  const island = currentIsland();
  if (state.screen !== 'play' || state.paused || state.busy || state.found.has(item.id)) return { accepted: false, reason: 'not-ready' };
  const session = questSession;
  clearTimers();
  state.busy = true;
  lockPauseDuringFeedback(true);
  const message = `${island.letter} is for ${item.word}!`;
  updateFeedback(message, feedbackAsset('found', island, item.id));
  element?.classList.add('is-collecting', `lth-collect-${item.id}`);
  sfx.pop();
  sfx.sparkle();
  const key = `found-${island.id}-${item.id}`;
  const narration = announce(key, authoredLine(key, `${message} ${item.word}.`));
  await timers.wait(element ? motionDuration(680) : 120);
  if (session !== questSession || state.screen !== 'play' || currentIsland().id !== island.id) {
    return { accepted: true, id: item.id, cancelled: true, found: state.found.size };
  }
  state.found.add(item.id);
  if (state.found.size === island.items.length) {
    render();
    await Promise.all([narration, timers.wait(260)]);
    if (session !== questSession || state.screen !== 'play' || currentIsland().id !== island.id) {
      return { accepted: true, id: item.id, cancelled: true, found: state.found.size };
    }
    finishQuest();
  } else {
    state.busy = false;
    state.toast = `Treasure found! Find another ${island.letter} thing.`;
    state.feedbackArt = feedbackAsset('another', island);
    render();
  }
  return { accepted: true, id: item.id, found: state.found.size };
}

async function tapDecoy(decoy, element = null) {
  const island = currentIsland();
  if (state.screen !== 'play' || state.paused || state.busy) return { accepted: false, reason: 'not-ready' };
  const session = questSession;
  clearTimers();
  state.busy = true;
  lockPauseDuringFeedback(true);
  const isCrossLetter = Boolean(decoy.letter && decoy.letter !== island.letter);
  const message = isCrossLetter
    ? `${decoy.word} starts with ${decoy.letter}, not ${island.letter}. Find ${letterArticle(island.letter)} ${island.letter} thing.`
    : `That is a ${decoy.word}. Find ${letterArticle(island.letter)} ${island.letter} thing.`;
  const feedbackArt = isCrossLetter ? decoy.feedbackKey : feedbackAsset('wrong', island);
  updateFeedback(message, feedbackArt);
  element?.classList.add('is-wobbling');
  sfx.tick();
  const key = isCrossLetter ? decoy.narrationKey : `wrong-${island.id}`;
  announce(key, authoredLine(key, message));
  await timers.wait(element ? motionDuration(520) : 80);
  if (session !== questSession || state.screen !== 'play' || currentIsland().id !== island.id) {
    return { accepted: true, id: decoy.id, wrong: true, cancelled: true, found: state.found.size };
  }
  state.busy = false;
  state.toast = `Find another ${island.letter} thing.`;
  state.feedbackArt = feedbackAsset('another', island);
  render();
  return { accepted: true, id: decoy.id, wrong: true, found: state.found.size };
}

async function handleTarget(id, element) {
  if (id === 'launch-island') {
    state.carouselIndex = (Number(element?.dataset.index || 0) + islands.length) % islands.length;
    sfx.tick();
    return startHunt();
  }
  if (id === 'carousel-prev') return selectLetter(state.carouselIndex - 1, { speak: true });
  if (id === 'carousel-next') return selectLetter(state.carouselIndex + 1, { speak: true });
  if (id === 'back' || id === 'home') return returnToCarousel();
  if (id === 'next') return returnToCarousel({ advance: true });
  if (id === 'sound') {
    const island = currentIsland();
    const completionWord = island.scene?.completionWord || island.items[0].word;
    const key = state.screen === 'play'
      ? `hunt-${island.id}`
      : state.screen === 'end'
        ? `complete-${island.id}`
        : `island-${island.id}`;
    const fallback = state.screen === 'play'
        ? `Find things that start with ${island.letter}.`
        : state.screen === 'end'
          ? `Well done! ${island.letter} is for ${completionWord}!`
          : `${island.letter} island. ${island.name}.`;
    announce(key, authoredLine(key, fallback));
    sfx.tick();
    return { accepted: true, id };
  }
  if (id === 'pause' || id === 'resume') {
    if (state.busy) return { accepted: false, reason: 'busy', paused: state.paused };
    state.paused = id === 'pause';
    voice.stop();
    render();
    if (id === 'resume') restoreFocus('.lth-pause');
    return { accepted: true, id, paused: state.paused };
  }
  if (id === currentIsland().decoy.id) return tapDecoy(currentIsland().decoy, element);
  const distractor = currentIsland().scene?.distractors?.find((choice) => choice.id === id);
  if (distractor) return tapDecoy(distractor, element);
  const item = currentIsland().items.find((treasure) => treasure.id === id);
  if (item) return tapTreasure(item, element);
  return { accepted: false, reason: 'unknown-target' };
}

function tapTarget(id) {
  return handleTarget(id);
}

function winRound() {
  if (state.screen !== 'play') return Promise.resolve(false);
  const next = currentIsland().items.find((item) => !state.found.has(item.id));
  return next ? tapTreasure(next).then(() => true) : Promise.resolve(true);
}

const disposeDebug = installDebug({
  gameId: 'letter-treasure-hunt',
  engine: 'papercraft-letter-carousel',
  authoringPreview: AUTHORING_PREVIEW,
  ready,
  listModes: () => islands.map((island) => ({ id: `${island.id}-quest`, title: island.name })),
  startMode: (modeId) => {
    const id = String(modeId || '').replace(/-quest$/, '');
    const index = islands.findIndex((island) => island.id === id);
    if (index < 0 && modeId !== 'letter-quest' && modeId !== 'hunt') return state;
    if (index >= 0) state.carouselIndex = index;
    return startHunt();
  },
  getState: () => ({
    screen: state.screen,
    mode: `${currentIsland().id}-quest`,
    target: currentIsland().letter,
    selectedLetter: currentIsland().letter,
    carouselIndex: state.carouselIndex,
    carouselTotal: islands.length,
    islandName: currentIsland().name,
    found: state.found.size,
    total: currentIsland().items.length,
    awaitingInput: state.screen === 'play' && !state.paused && !state.busy,
    paused: state.paused,
    seed: state.seed,
  }),
  getTargets: () => collectTargets(mount),
  selectLetter: (letterOrIndex) => {
    const value = String(letterOrIndex ?? '').toLowerCase();
    const index = Number.isFinite(Number(letterOrIndex))
      ? Number(letterOrIndex)
      : islands.findIndex((island) => island.id === value || island.letter.toLowerCase() === value);
    return selectLetter(index < 0 ? 0 : index);
  },
  tap: tapTarget,
  winRound,
  home: returnToCarousel,
  timers,
  narrator: voice,
  sfx,
  mute: (on = true) => {
    state.muted = Boolean(on);
    voice.stop();
    voice.setMuted(state.muted);
    sfx.setMuted(state.muted);
    return state.muted;
  },
  onSeed: (rng, seed) => { state.rng = rng; state.seed = seed; },
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
});

window.addEventListener('beforeunload', () => {
  clearHandlers();
  clearTimers();
  disposeDebug();
});

preloadNeighbors();
render();
