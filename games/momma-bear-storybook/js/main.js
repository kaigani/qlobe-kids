// Momma Bear's Storybook — fixed-page tap-to-read story theater.

import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { onTap } from '../../../shared/js/tap.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { createWordLine } from '../../../shared/js/word-tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createStorybookStage } from './storybook-stage.js';

const GAME_ID = 'momma-bear-storybook';
const STORAGE_KEY = 'qk:momma-bear-storybook:v1';
const ACTS = ['beginning', 'middle', 'ending'];
const MOMMA_POSES = './assets/pose-actors/momma-bear/poses';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const root = document.querySelector('#game');
const timers = createTimers();
const disposers = [];
let shelfDisposers = [];
let scene = null;
let sceneStoryId = null;
let wordLine = null;
let flowToken = 0;
let fastScale = 1;
let resumePerformance = false;
let readyResolve;
const ready = new Promise((resolve) => { readyResolve = resolve; });

const storyById = (id) => config.stories.find((story) => story.id === id) || null;
const currentStory = () => storyById(state.storyId);
const currentPage = () => currentStory()?.pages?.[state.pageIndex] || null;

const state = {
  screen: 'shelf',
  storyId: null,
  pageIndex: 0,
  busy: false,
  lineComplete: false,
  tappedWords: [],
  completedStories: new Set(),
  promptedStories: new Set(),
  muted: false,
};

function loadProgress() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const valid = new Set(config.stories.map((story) => story.id));
    if (Array.isArray(value.completedStories)) {
      state.completedStories = new Set(value.completedStories.filter((id) => valid.has(id)));
    }
    return value;
  } catch {
    return {};
  }
}

function saveProgress() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      completedStories: [...state.completedStories],
      lastStory: state.storyId,
      lastPage: state.pageIndex,
      gestureDemoSeen: true,
    }));
  } catch { /* storage is never load-bearing */ }
}

function shell() {
  root.innerHTML = `
    <div class="mbs-shell">
      <section class="mbs-screen mbs-shelf" data-qk-screen="shelf" aria-label="Story shelf">
        <img class="mbs-screen-backdrop" src="${config.ui.shelfBackdrop}" alt="" />
        <a class="mbs-raster-button mbs-home" href="${config.home}" data-target="catalog-home" data-role="navigation" aria-label="All games">
          <img src="${config.ui.homeButton}" alt="" />
        </a>
        <button class="mbs-raster-button mbs-shelf-sound" type="button" data-action="sound" data-target="shelf-sound" data-role="sound" aria-label="Hear Momma Bear">
          <img src="${config.ui.soundButton}" alt="" />
        </button>
        <img class="mbs-title-lockup" src="${config.ui.title}" alt="Momma Bear's Storybook" />
        <div class="mbs-momma mbs-momma-shelf" aria-hidden="true">
          <img src="${MOMMA_POSES}/neutral.webp" alt="" />
        </div>
        <p class="mbs-welcome">Come close, little reader.<br />Pick a story for us.</p>
        <div class="mbs-story-cards" id="mbs-story-cards" aria-label="Choose a story"></div>
        <div class="mbs-charm-bookmark" id="mbs-charms" aria-label="Stories you finished"></div>
      </section>

      <section class="mbs-screen mbs-read" data-qk-screen="read" hidden aria-label="Read the story">
        <div class="mbs-stage-host" id="mbs-stage-host" aria-hidden="true"></div>
        <button class="mbs-raster-button mbs-read-back" type="button" data-action="shelf" data-target="back" data-role="navigation" aria-label="Back to the story shelf">
          <img src="${config.ui.shelfButton}" alt="" />
        </button>
        <button class="mbs-raster-button mbs-read-sound" type="button" data-action="sound" data-target="read-sound" data-role="sound" aria-label="Hear it again">
          <img src="${config.ui.soundButton}" alt="" />
        </button>
        <div class="mbs-act-progress" id="mbs-act-progress" aria-hidden="true"></div>
        <div class="mbs-reader-page">
          <img class="mbs-reader-panel-art" src="${config.ui.readingPanel}" alt="" />
          <div class="mbs-page-heading">
            <span class="mbs-act-name" id="mbs-act-name"></span>
            <span class="mbs-page-count" id="mbs-page-count"></span>
          </div>
          <p class="mbs-reader-status" id="mbs-reader-status" aria-live="polite"></p>
          <div class="mbs-word-line" id="mbs-word-line"></div>
          <div class="mbs-page-progress" id="mbs-page-progress" aria-hidden="true"></div>
          <button class="mbs-page-turn" id="mbs-page-turn" type="button" data-action="page-turn" data-target="page-turn" data-role="continue" hidden>
            <img src="${config.ui.pageTurn}" alt="" />
            <span>Turn the page</span>
          </button>
        </div>
      </section>

      <section class="mbs-screen mbs-complete" data-qk-screen="complete" hidden aria-label="Story complete">
        <img class="mbs-screen-backdrop" src="${config.ui.shelfBackdrop}" alt="" />
        <button class="mbs-raster-button mbs-complete-back" type="button" data-action="shelf" data-target="complete-back" data-role="navigation" aria-label="Back to the story shelf">
          <img src="${config.ui.shelfButton}" alt="" />
        </button>
        <button class="mbs-raster-button mbs-complete-sound" type="button" data-action="sound" data-target="complete-sound" data-role="sound" aria-label="Hear Momma Bear again">
          <img src="${config.ui.soundButton}" alt="" />
        </button>
        <div class="mbs-momma mbs-momma-complete" aria-hidden="true">
          <img src="${MOMMA_POSES}/celebrate.webp" alt="" />
        </div>
        <article class="mbs-complete-card">
          <img class="mbs-complete-panel-art" src="${config.ui.completionPanel}" alt="" />
          <p class="mbs-kicker">You read the whole story!</p>
          <h1 id="mbs-complete-title"></h1>
          <img class="mbs-complete-charm" id="mbs-complete-charm" alt="" />
          <p class="mbs-complete-line" id="mbs-complete-line"></p>
          <div class="mbs-complete-actions">
            <button type="button" data-action="again" data-target="again" data-role="replay">
              <img src="${config.ui.againButton}" alt="" />
              <span>Again</span>
            </button>
            <button type="button" data-action="shelf" data-target="shelf" data-role="navigation">
              <img src="${config.ui.shelfButton}" alt="" />
              <span>Story shelf</span>
            </button>
          </div>
        </article>
      </section>
    </div>`;
}

const dom = {};
function cacheDom() {
  dom.screens = [...root.querySelectorAll('[data-qk-screen]')];
  dom.cards = root.querySelector('#mbs-story-cards');
  dom.charms = root.querySelector('#mbs-charms');
  dom.stageHost = root.querySelector('#mbs-stage-host');
  dom.readerPage = root.querySelector('.mbs-reader-page');
  dom.wordHost = root.querySelector('#mbs-word-line');
  dom.status = root.querySelector('#mbs-reader-status');
  dom.actName = root.querySelector('#mbs-act-name');
  dom.pageCount = root.querySelector('#mbs-page-count');
  dom.actProgress = root.querySelector('#mbs-act-progress');
  dom.pageProgress = root.querySelector('#mbs-page-progress');
  dom.pageTurn = root.querySelector('#mbs-page-turn');
  dom.completeTitle = root.querySelector('#mbs-complete-title');
  dom.completeCharm = root.querySelector('#mbs-complete-charm');
  dom.completeLine = root.querySelector('#mbs-complete-line');
}

function setPageTurnVisible(visible) {
  dom.pageTurn.hidden = !visible;
  dom.readerPage.dataset.pageTurn = String(Boolean(visible));
}

function showScreen(name) {
  state.screen = name;
  root.dataset.screen = name;
  for (const section of dom.screens) section.hidden = section.dataset.qkScreen !== name;
  if (name === 'read' && scene) requestAnimationFrame(() => scene?.relayout());
}

function speak(key, text) {
  const promise = voice.say(key, text);
  bgm.duckDuring(promise, { down: 0.16, downMs: 80, upMs: 280 });
  return promise;
}

const readerVoice = {
  unlock: () => voice.unlock(),
  say: (key, text) => speak(key, text),
};

function feedback(kind = 'tick') {
  try { (sfx[kind] || sfx.tick)?.(); } catch { /* visual action still runs */ }
}

function bindAction(element, action, kind = 'tick') {
  if (!element) return;
  disposers.push(onTap(element, (event) => {
    event.preventDefault();
    action();
  }, { feedback: () => feedback(kind) }));
}

function bindGlobalControls() {
  for (const button of root.querySelectorAll('[data-action="sound"]')) bindAction(button, replayPrompt);
  for (const button of root.querySelectorAll('[data-action="shelf"]')) bindAction(button, () => toShelf({ speakPrompt: true }));
  bindAction(root.querySelector('[data-action="again"]'), () => startStory(state.storyId), 'pop');
  bindAction(dom.pageTurn, () => advancePage(), 'pop');
}

function clearShelfBindings() {
  for (const dispose of shelfDisposers) {
    try { dispose(); } catch { /* ignore */ }
  }
  shelfDisposers = [];
}

function renderShelf() {
  clearShelfBindings();
  dom.cards.textContent = '';
  for (const story of config.stories) {
    const done = state.completedStories.has(story.id);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mbs-story-card';
    button.dataset.story = story.id;
    button.dataset.target = `story-${story.id}`;
    button.dataset.role = 'mode';
    button.dataset.complete = String(done);
    button.setAttribute('aria-label', `${story.title}${done ? ', read again' : ''}`);
    const art = document.createElement('img');
    art.src = story.card;
    art.alt = '';
    const label = document.createElement('span');
    label.className = 'mbs-story-label';
    label.textContent = story.shortTitle || story.title;
    button.append(art, label);
    if (done) {
      const badge = document.createElement('img');
      badge.className = 'mbs-read-badge';
      badge.src = story.charm;
      badge.alt = '';
      button.append(badge);
    }
    dom.cards.append(button);
    shelfDisposers.push(onTap(button, () => startStory(story.id), { feedback: () => feedback('pop') }));
  }

  dom.charms.textContent = '';
  for (const story of config.stories.filter((entry) => state.completedStories.has(entry.id))) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mbs-saved-charm';
    button.dataset.target = `charm-${story.id}`;
    button.dataset.role = 'reward';
    button.setAttribute('aria-label', `Remember ${story.title}`);
    const image = document.createElement('img');
    image.src = story.charm;
    image.alt = '';
    button.append(image);
    dom.charms.append(button);
    shelfDisposers.push(onTap(button, () => showComplete(story, { speakLines: true }), { feedback: () => feedback('tick') }));
  }
}

async function ensureStage() {
  if (scene) return scene;
  await new Promise((resolve) => requestAnimationFrame(resolve));
  scene = await createStorybookStage({ host: dom.stageHost, config, voice: readerVoice });
  scene.setTimeScale(fastScale);
  return scene;
}

function destroyWordLine() {
  if (wordLine) wordLine.destroy();
  wordLine = null;
  state.tappedWords = [];
  state.lineComplete = false;
}

function updateGuidance() {
  if (!wordLine) return;
  const buttons = [...dom.wordHost.querySelectorAll('.trt-word')];
  for (const button of buttons) button.classList.remove('is-next', 'is-modeling');
  const next = buttons.find((button) => button.dataset.tapped !== 'true');
  if (next) next.classList.add('is-next');
  state.tappedWords = wordLine.tappedWords();
  const waiting = wordLine.remaining();
  dom.status.textContent = waiting
    ? `${waiting} ${waiting === 1 ? 'word is' : 'words are'} waiting.`
    : 'Now watch the words come alive.';
}

const nudger = createNudger({
  first: 9000,
  repeat: 8000,
  onNudge(count) {
    if (state.screen !== 'read' || state.busy || !wordLine || wordLine.isComplete()) return;
    const next = dom.wordHost.querySelector('.trt-word[data-tapped="false"]');
    if (!next) return;
    next.classList.add(count >= 1 ? 'is-modeling' : 'is-next');
    if (count === 0) speak('ui:next-word', config.audio.ui['ui:next-word']);
    if (count >= 2) speak(`word:${next.dataset.word}`, next.dataset.word);
  },
});

function renderProgress(page) {
  dom.actName.textContent = page.act[0].toUpperCase() + page.act.slice(1);
  dom.pageCount.textContent = `Page ${state.pageIndex + 1} of 6`;
  dom.actProgress.textContent = '';
  ACTS.forEach((act, index) => {
    const item = document.createElement('span');
    item.className = 'mbs-act-tab';
    item.dataset.active = String(act === page.act);
    item.dataset.done = String(index < ACTS.indexOf(page.act));
    const art = document.createElement('img');
    art.src = config.ui.actTab;
    art.alt = '';
    const text = document.createElement('b');
    text.textContent = act[0].toUpperCase();
    item.append(art, text);
    dom.actProgress.append(item);
  });
  dom.pageProgress.textContent = '';
  for (let index = 0; index < 6; index += 1) {
    const stitch = document.createElement('img');
    stitch.src = config.ui.pageStitch;
    stitch.alt = '';
    stitch.dataset.done = String(index < state.pageIndex);
    stitch.dataset.current = String(index === state.pageIndex);
    dom.pageProgress.append(stitch);
  }
}

async function startStory(storyId) {
  const story = storyById(storyId);
  if (!story || state.busy) return false;
  flowToken += 1;
  timers.clearAll();
  nudger.stop();
  voice.stop();
  destroyWordLine();
  state.storyId = story.id;
  state.pageIndex = 0;
  state.busy = true;
  showScreen('read');
  const ownFlow = flowToken;
  const mounted = await ensureStage();
  if (ownFlow !== flowToken) return false;
  if (sceneStoryId !== story.id) {
    await mounted.setStory(story);
    if (ownFlow !== flowToken) return false;
    sceneStoryId = story.id;
  }
  await renderPage({ speakPrompt: !state.promptedStories.has(story.id) });
  return true;
}

async function renderPage({ speakPrompt = false } = {}) {
  const story = currentStory();
  const page = currentPage();
  if (!story || !page || !scene) return false;
  const ownFlow = ++flowToken;
  timers.clearAll();
  nudger.stop();
  destroyWordLine();
  state.busy = true;
  root.dataset.performing = 'false';
  setPageTurnVisible(false);
  dom.status.textContent = 'The paper stage is getting ready…';
  renderProgress(page);
  saveProgress();
  await scene.preparePage(page);
  if (ownFlow !== flowToken) return false;

  wordLine = createWordLine({
    host: dom.wordHost,
    line: page.line,
    nodeId: page.id,
    lineIndex: state.pageIndex,
    voice: readerVoice,
    onWordTap() {
      nudger.poke();
      scene?.reactToWord();
      requestAnimationFrame(updateGuidance);
    },
    onComplete: () => performCurrentLine(),
  });
  state.busy = false;
  updateGuidance();
  nudger.arm();
  if (speakPrompt) {
    state.promptedStories.add(story.id);
    speak('ui:how-to', config.audio.ui['ui:how-to']);
  }
  return true;
}

async function performCurrentLine() {
  const story = currentStory();
  const page = currentPage();
  if (!story || !page || !scene || !wordLine || !wordLine.isComplete() || state.busy) return false;
  const ownFlow = flowToken;
  state.busy = true;
  state.lineComplete = true;
  root.dataset.performing = 'true';
  nudger.stop();
  wordLine.lock();
  updateGuidance();
  await scene.performPage(page);
  if (ownFlow !== flowToken) return false;
  state.busy = false;
  root.dataset.performing = 'false';

  if (state.pageIndex === story.pages.length - 1) {
    await timers.wait(650);
    if (ownFlow === flowToken) await finishCurrentStory();
    return true;
  }
  if (state.pageIndex === 1 || state.pageIndex === 3) {
    setPageTurnVisible(true);
    const key = state.pageIndex === 1 ? 'ui:beginning-done' : 'ui:middle-done';
    speak(key, config.audio.ui[key]);
    return true;
  }
  await timers.wait(760);
  if (ownFlow === flowToken) await advancePage();
  return true;
}

async function advancePage() {
  const story = currentStory();
  if (!story || state.busy || state.pageIndex >= story.pages.length - 1) return false;
  state.pageIndex += 1;
  await renderPage();
  return true;
}

async function finishCurrentStory() {
  const story = currentStory();
  if (!story) return false;
  state.completedStories.add(story.id);
  saveProgress();
  scene?.celebrate();
  showComplete(story, { speakLines: true });
  return true;
}

function showComplete(story, { speakLines = false } = {}) {
  if (!story) return false;
  flowToken += 1;
  timers.clearAll();
  nudger.stop();
  destroyWordLine();
  scene?.interrupt();
  state.storyId = story.id;
  state.pageIndex = story.pages.length - 1;
  state.busy = false;
  dom.completeTitle.textContent = story.title;
  dom.completeLine.textContent = story.completion;
  dom.completeCharm.src = story.charm;
  dom.completeCharm.alt = `${story.title} story charm`;
  showScreen('complete');
  feedback('tada');
  if (speakLines) {
    speak('ui:story-done', config.audio.ui['ui:story-done'])
      .then(() => speak(story.completionKey, story.completion));
  }
  return true;
}

function toShelf({ speakPrompt = false } = {}) {
  flowToken += 1;
  timers.clearAll();
  nudger.stop();
  destroyWordLine();
  scene?.interrupt();
  voice.stop();
  state.busy = false;
  renderShelf();
  showScreen('shelf');
  if (speakPrompt) speak('ui:new-story', config.audio.ui['ui:new-story']);
  return true;
}

function replayPrompt() {
  if (state.screen === 'shelf') return speak('ui:welcome', config.audio.ui['ui:welcome']);
  if (state.screen === 'complete') {
    const story = currentStory();
    return story ? speak(story.completionKey, story.completion) : Promise.resolve();
  }
  const page = currentPage();
  if (!page || !wordLine) return Promise.resolve();
  if (state.busy || wordLine.isCompletionPending?.() || wordLine.isLocked?.()) return Promise.resolve(false);
  const next = wordLine.tokens.find((token) => !wordLine.tappedIndices().includes(token.index));
  return next
    ? speak(`word:${next.key}`, next.key || next.text)
    : speak(page.lineKey, page.line);
}

function snapshot() {
  const page = currentPage();
  return {
    screen: state.screen,
    storyId: state.storyId,
    pageIndex: state.pageIndex,
    pageId: page?.id || null,
    act: page?.act || null,
    line: page?.line || null,
    words: wordLine?.tokens.map((token) => token.key) || [],
    tappedWords: wordLine?.tappedWords() || [],
    wordsRemaining: wordLine?.remaining() || 0,
    lineComplete: wordLine?.isComplete() || state.lineComplete,
    busy: state.busy,
    completedStories: [...state.completedStories],
    reducedMotion,
    muted: state.muted,
    stageMounted: Boolean(scene),
  };
}

function validateContent() {
  const errors = [];
  const lineKeys = new Set();
  if (config.stories.length !== 3) errors.push('exactly three stories are required');
  for (const story of config.stories) {
    if (story.pages?.length !== 6) errors.push(`${story.id}: exactly six pages are required`);
    const acts = Object.fromEntries(ACTS.map((act) => [act, 0]));
    for (const page of story.pages || []) {
      if (!(page.line || '').trim()) errors.push(`${page.id}: line is blank`);
      const count = (page.line || '').trim().split(/\s+/).filter(Boolean).length;
      if (count < 5 || count > 9) errors.push(`${page.id}: ${count} tokens (expected 5–9)`);
      if (lineKeys.has(page.lineKey)) errors.push(`${page.id}: duplicate line key ${page.lineKey}`);
      lineKeys.add(page.lineKey);
      if (!(page.act in acts)) errors.push(`${page.id}: invalid act ${page.act}`);
      else acts[page.act] += 1;
    }
    for (const act of ACTS) if (acts[act] !== 2) errors.push(`${story.id}: ${act} has ${acts[act]} pages`);
    if (!(story.completion || '').trim()) errors.push(`${story.id}: completion is blank`);
  }
  return errors;
}

function tapWord(index) {
  return wordLine ? wordLine.tap(Number(index)) : false;
}

function tapAllWords() {
  return wordLine ? wordLine.tapAll() : 0;
}

function tapTarget(id) {
  const target = String(id || '');
  if (target.startsWith('word-')) return tapWord(Number(target.slice(5)));
  if (target.startsWith('story-')) return startStory(target.slice(6));
  if (target.startsWith('charm-')) return showComplete(storyById(target.slice(6)), { speakLines: false });
  if (target === 'page-turn') return advancePage();
  if (target === 'again') return startStory(state.storyId);
  if (target === 'shelf' || target === 'back' || target === 'complete-back') return toShelf();
  if (target.endsWith('sound')) return replayPrompt();
  return false;
}

async function waitUntil(test, timeout = 20000) {
  const started = performance.now();
  while (!test()) {
    if (performance.now() - started > timeout) return false;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return true;
}

async function debugFinishStory() {
  if (!currentStory()) await startStory(config.stories[0].id);
  let guard = 0;
  while (state.screen === 'read' && guard < 12) {
    guard += 1;
    const before = state.pageIndex;
    tapAllWords();
    await waitUntil(() => state.screen !== 'read' || (!state.busy && (state.pageIndex !== before || !dom.pageTurn.hidden)), 30000);
    if (state.screen !== 'read') break;
    if (!dom.pageTurn.hidden) await advancePage();
  }
  return snapshot();
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted?.(state.muted);
  bgm.setMuted(state.muted);
  root.dataset.muted = String(state.muted);
  return state.muted;
}

function onVisibilityChange() {
  if (!document.hidden || state.screen !== 'read') return;
  voice.stop();
  if (!state.busy || !wordLine?.isComplete()) return;
  flowToken += 1;
  timers.clearAll();
  scene?.interrupt();
  state.busy = false;
  root.dataset.performing = 'false';
  wordLine.unlock();
  resumePerformance = true;
  dom.status.textContent = 'Tap once to bring the story back.';
}

function resumeAfterForeground() {
  if (!resumePerformance || document.hidden || state.screen !== 'read') return;
  resumePerformance = false;
  const resume = async () => {
    if (!scene || !currentPage()) return;
    await scene.preparePage(currentPage());
    await performCurrentLine();
  };
  window.addEventListener('pointerdown', resume, { once: true });
}

async function boot() {
  installKioskGuards();
  loadProgress();
  shell();
  cacheDom();
  bindGlobalControls();
  renderShelf();
  showScreen('shelf');

  await voice.init(config.audio.manifest, config.audio.lines, config.audio.ui);
  bgm.preload(config.audio.bgm);
  bgm.setVolume(0.13);
  installUnlockOnGesture({
    extra: [bgm.unlock],
    onFirst: () => {
      if (!state.muted) bgm.play(config.audio.bgm, { key: GAME_ID, fadeInMs: 1100, loopFadeOutMs: 2200 });
      if (state.screen === 'shelf') speak('ui:welcome', config.audio.ui['ui:welcome']);
    },
  });
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pageshow', resumeAfterForeground);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeAfterForeground(); });

  installDebug({
    gameId: GAME_ID,
    engine: 'storybook-pose-reader',
    ready,
    listModes: () => config.modes.map((mode) => ({ ...mode })),
    startMode: (id) => startStory(id),
    getState: snapshot,
    state: snapshot,
    tap: tapTarget,
    tapWord,
    tapAllWords,
    performLine: performCurrentLine,
    nextPage: advancePage,
    winRound: () => { tapAllWords(); return snapshot(); },
    finishStory: debugFinishStory,
    home: () => toShelf(),
    getAudioLog: () => voice.getAudioLog(),
    clearAudioLog: () => voice.clearAudioLog(),
    getStageState: () => ({
      mounted: Boolean(scene),
      storyId: state.storyId,
      hero: currentStory()?.hero || null,
      page: currentPage()?.stage || null,
    }),
    validateContent,
    resetProgress: () => {
      state.completedStories = new Set();
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      renderShelf();
      return [];
    },
    mute: setMuted,
    timers,
    voice,
    sfx,
    fastTimers(scale = 0.05) {
      const number = Number(scale);
      const raw = Number.isFinite(number) && number > 0 ? (number > 1 ? 1 / number : number) : 0.05;
      const multiplier = Math.min(1, Math.max(0.01, raw));
      fastScale = 1 / multiplier;
      timers.setScale(fastScale);
      scene?.setTimeScale(fastScale);
      return multiplier;
    },
  });

  const errors = validateContent();
  if (errors.length) console.error('[momma-bear-storybook] content errors', errors);
  readyResolve({ gameId: GAME_ID, stories: config.stories.map((story) => story.id), errors });
}

boot().catch((error) => {
  console.error('[momma-bear-storybook] boot failed', error);
  root.innerHTML = '<p class="qk-loading-fallback">Momma Bear dropped a page. Please reload the storybook.</p>';
  readyResolve({ gameId: GAME_ID, error: String(error?.message || error) });
});
