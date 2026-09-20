import config from '../config.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as bgm from '../../../shared/js/bgm.js';
import * as sfx from '../../../shared/js/sfx.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { createScreens } from '../../../shared/js/screens.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { tada } from '../../../shared/js/celebrate.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { escapeHtml } from '../../../shared/js/dom.js';

const mount = document.getElementById('game');
const timers = createTimers();
const narrator = createNarrator();
const reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const ART = config.assets;

const state = {
  ready: false,
  screen: 'splash',
  storyId: config.stories[0].id,
  phase: 'welcome',
  breaths: 0,
  earlyTaps: 0,
  awaitingInput: true,
  completed: [],
  muted: false,
  reducedMotion: reduceQuery.matches,
  seed: 42,
};

let rng = mulberry32(state.seed);
let runEpoch = 0;
let celebrationDispose = null;
const disposers = [];

function storyCard(story) {
  return `
    <button class="story-card" type="button" data-story="${escapeHtml(story.id)}"
            data-target="story-${escapeHtml(story.id)}"
            aria-label="${escapeHtml(story.title)}: ${escapeHtml(story.skill)}">
      <img class="story-card-felt" src="${ART.ui['story-card']}" alt="" draggable="false" />
      <img class="story-picture" src="${ART.stories[story.medallion]}" alt="" draggable="false" />
      <span class="story-copy">
        <strong>${escapeHtml(story.title)}</strong>
        <small>${escapeHtml(story.skill)}</small>
      </span>
      <img class="story-star" src="${ART.ui['reward-star']}" alt="" draggable="false" />
    </button>`;
}

function phaseBadge(id, label) {
  return `
    <div class="phase-step" data-phase-step="${id}">
      <img src="${ART.ui[`badge-${id}`]}" alt="" draggable="false" />
      <span>${label}</span>
    </div>`;
}

mount.innerHTML = `
  <section class="game-screen splash-screen" data-qk-screen="splash" aria-label="Puppet Patience Theater">
    <img class="viewport-backdrop" src="${ART.stage}" alt="" draggable="false" />
    <div class="felt-stage splash-stage">
      <img class="stage-backdrop" src="${ART.stage}" alt="" draggable="false" />
      <div class="splash-glow" aria-hidden="true"></div>
      <img class="title-lockup" src="${ART.title}" alt="Puppet Patience Theater" draggable="false" />
      <p class="splash-tagline">Watch <span>•</span> Breathe <span>•</span> Your turn!</p>
      <img class="splash-fox" src="${ART.characters['fox-wave']}" alt="Fox, the friendly puppet host" draggable="false" />
      <button class="felt-button play-button" type="button" data-target="play" aria-label="Open Puppet Patience Theater">
        <img src="${ART.ui['button-green']}" alt="" draggable="false" />
        <span>Open the Show</span>
      </button>
    </div>
    <div class="splash-hud"></div>
  </section>

  <section class="game-screen practice-screen" data-qk-screen="practice" aria-label="Choose a puppet story" hidden>
    <img class="viewport-backdrop" src="${ART.stage}" alt="" draggable="false" />
    <div class="felt-stage practice-stage">
      <img class="stage-backdrop" src="${ART.stage}" alt="" draggable="false" />
      <header class="practice-heading">
        <span class="eyebrow">Puppet Practice</span>
        <h1>Choose a tiny story</h1>
        <p>Help Fox wait for a turn.</p>
      </header>
      <img class="practice-fox" src="${ART.characters['fox-wave']}" alt="Fox inviting you to choose" draggable="false" />
      <div class="story-grid">${config.stories.map(storyCard).join('')}</div>
      <div class="practice-progress" data-practice-progress aria-label="Stories completed"></div>
    </div>
    <div class="practice-hud"></div>
  </section>

  <section class="game-screen play-screen" data-qk-screen="play" aria-label="Patience puppet story" hidden>
    <img class="viewport-backdrop" src="${ART.stage}" alt="" draggable="false" />
    <div class="felt-stage play-stage">
      <img class="stage-backdrop" src="${ART.stage}" alt="" draggable="false" />
      <div class="phase-rail" aria-label="Watch, breathe, then take your turn">
        ${phaseBadge('watch', 'Watch')}
        ${phaseBadge('breathe', 'Breathe')}
        ${phaseBadge('turn', 'Your Turn')}
      </div>
      <header class="play-prompt">
        <span class="prompt-kicker" data-prompt-kicker>Watch</span>
        <h1 data-play-title>Rabbit swings first</h1>
        <p data-play-copy>Your turn is coming.</p>
      </header>
      <div class="actors" aria-live="off">
        <img class="actor friend-actor" data-friend src="${ART.characters['rabbit-swing']}" alt="Rabbit" draggable="false" />
        <img class="actor fox-actor" data-fox src="${ART.characters['fox-wave']}" alt="Fox waiting patiently" draggable="false" />
      </div>
      <button class="stage-prop" type="button" data-stage-prop data-target="prop" aria-label="The story prop">
        <img src="${ART.props.swing}" alt="" draggable="false" />
        <span class="prop-label" data-prop-label>Almost your turn</span>
      </button>
      <div class="breath-station" data-breath-station hidden>
        <button class="breath-button" type="button" data-target="breath" aria-label="Take one slow breath">
          <img src="${ART.ui['breathe-flower']}" alt="A smiling felt breathing flower" draggable="false" />
          <span>Breathe</span>
        </button>
        <div class="breath-counter" data-breath-counter aria-label="Breaths taken"></div>
      </div>
      <p class="gentle-feedback" data-feedback aria-live="polite"></p>
    </div>
    <div class="play-hud"></div>
  </section>

  <section class="game-screen end-screen" data-qk-screen="end" aria-label="Patient puppet curtain call" hidden>
    <img class="viewport-backdrop" src="${ART.stage}" alt="" draggable="false" />
    <div class="felt-stage end-stage">
      <img class="stage-backdrop" src="${ART.stage}" alt="" draggable="false" />
      <header class="curtain-call-copy">
        <span class="eyebrow">Curtain Call</span>
        <h1>Patient play!</h1>
        <p>You watched, breathed, and waited for your turn.</p>
      </header>
      <img class="end-puppet end-friend" data-end-friend src="${ART.characters['rabbit-swing']}" alt="A puppet friend taking a bow" draggable="false" />
      <img class="end-puppet end-fox" data-end-fox src="${ART.characters['fox-celebrate']}" alt="Fox taking a happy bow" draggable="false" />
      <div class="end-stars" data-end-stars aria-label="Three shining patience stars"></div>
      <div class="end-actions">
        <button class="felt-button again-button" type="button" data-target="again" aria-label="Play this story again">
          <img src="${ART.ui['button-teal']}" alt="" draggable="false" /><span>Again</span>
        </button>
        <button class="felt-button another-button" type="button" data-target="another" aria-label="Choose another puppet story">
          <img src="${ART.ui['button-plum']}" alt="" draggable="false" /><span>Another Story</span>
        </button>
      </div>
    </div>
    <div class="end-hud"></div>
  </section>`;

const els = {
  promptKicker: mount.querySelector('[data-prompt-kicker]'),
  playTitle: mount.querySelector('[data-play-title]'),
  playCopy: mount.querySelector('[data-play-copy]'),
  fox: mount.querySelector('[data-fox]'),
  friend: mount.querySelector('[data-friend]'),
  propButton: mount.querySelector('[data-stage-prop]'),
  prop: mount.querySelector('[data-stage-prop] img'),
  propLabel: mount.querySelector('[data-prop-label]'),
  breathStation: mount.querySelector('[data-breath-station]'),
  breathCounter: mount.querySelector('[data-breath-counter]'),
  feedback: mount.querySelector('[data-feedback]'),
  progress: mount.querySelector('[data-practice-progress]'),
  endFriend: mount.querySelector('[data-end-friend]'),
  endFox: mount.querySelector('[data-end-fox]'),
  endStars: mount.querySelector('[data-end-stars]'),
};

const screens = createScreens({
  root: mount,
  screens: {
    splash: mount.querySelector('[data-qk-screen="splash"]'),
    practice: mount.querySelector('[data-qk-screen="practice"]'),
    play: mount.querySelector('[data-qk-screen="play"]'),
    end: mount.querySelector('[data-qk-screen="end"]'),
  },
  initial: 'splash',
  voice: narrator,
});

function currentStory() {
  return config.stories.find(({ id }) => id === state.storyId) || config.stories[0];
}

function playSfx(name) {
  if (state.muted) return;
  try { sfx[name]?.(); } catch { /* sound never blocks play */ }
}

function speak(key, text = config.voice[key]) {
  return bgm.duckDuring(narrator.say(key, text), { down: 0.14, downMs: 90, upMs: 280 });
}

function setScreen(name) {
  state.screen = name;
  screens.show(name);
}

function resetRun() {
  runEpoch += 1;
  timers.clearAll();
  nudger.stop();
  narrator.stop();
  celebrationDispose?.();
  celebrationDispose = null;
}

function renderProgress() {
  els.progress.replaceChildren();
  for (const story of config.stories) {
    const star = document.createElement('img');
    const earned = state.completed.includes(story.id);
    star.src = ART.ui['reward-star'];
    star.alt = earned ? `${story.title} complete` : '';
    star.className = `progress-star${earned ? ' is-earned' : ''}`;
    star.draggable = false;
    els.progress.append(star);
    mount.querySelector(`[data-story="${story.id}"]`)?.classList.toggle('is-complete', earned);
  }
}

function renderBreaths(story) {
  els.breathCounter.replaceChildren();
  for (let index = 0; index < story.breaths; index += 1) {
    const star = document.createElement('img');
    const complete = index < state.breaths;
    star.src = ART.ui['reward-star'];
    star.alt = complete ? `Breath ${index + 1} complete` : '';
    star.className = `breath-star${complete ? ' is-earned' : ''}`;
    star.draggable = false;
    els.breathCounter.append(star);
  }
}

function renderPhase() {
  const story = currentStory();
  mount.querySelector('.play-stage').dataset.phase = state.phase;
  mount.querySelectorAll('[data-phase-step]').forEach((step) => {
    const order = { watch: 0, breathe: 1, turn: 2 };
    const current = order[state.phase] ?? -1;
    const own = order[step.dataset.phaseStep];
    step.classList.toggle('is-active', own === current);
    step.classList.toggle('is-complete', own < current || state.phase === 'success');
  });

  els.friend.src = ART.characters[story.friend];
  els.friend.alt = story.friendAlt;
  els.prop.src = ART.props[story.prop];
  els.propButton.setAttribute('aria-label', state.phase === 'turn'
    ? story.turnCaption
    : `Wait for your turn with the ${story.shortTitle.toLowerCase()} prop`);
  els.breathStation.hidden = state.phase !== 'breathe';
  els.feedback.textContent = '';
  els.propButton.classList.remove('is-ready', 'is-success', 'is-early');

  if (state.phase === 'watch') {
    els.promptKicker.textContent = 'Watch';
    els.playTitle.textContent = story.watchCaption;
    els.playCopy.textContent = 'See what happens first. Your turn is coming.';
    els.fox.src = ART.characters[story.foxWatch];
    els.fox.alt = 'Fox watching and waiting';
    els.propLabel.textContent = 'Almost your turn';
  } else if (state.phase === 'breathe') {
    els.promptKicker.textContent = 'Breathe';
    els.playTitle.textContent = `Help Fox wait — ${story.breaths} slow breaths`;
    els.playCopy.textContent = 'Tap the flower. Breathe in… and out.';
    els.fox.src = ART.characters['fox-breathe'];
    els.fox.alt = 'Fox sitting calmly and breathing';
    els.propLabel.textContent = 'Wait just a little';
    renderBreaths(story);
  } else {
    els.promptKicker.textContent = 'Your Turn!';
    els.playTitle.textContent = story.turnCaption;
    els.playCopy.textContent = 'You waited. Now make the story happen!';
    els.fox.src = ART.characters[story.foxTurn];
    els.fox.alt = 'Fox ready for a turn';
    els.propLabel.textContent = 'Tap me!';
    els.propButton.classList.add('is-ready');
  }
}

function showSplash({ speakPrompt = false } = {}) {
  resetRun();
  state.phase = 'welcome';
  state.awaitingInput = true;
  setScreen('splash');
  if (speakPrompt) speak('welcome');
  return true;
}

function showPractice({ speakPrompt = true } = {}) {
  resetRun();
  state.phase = 'choose';
  state.awaitingInput = true;
  setScreen('practice');
  renderProgress();
  if (speakPrompt) speak('pick-story');
  return true;
}

async function startStory(id = state.storyId) {
  const story = config.stories.find((entry) => entry.id === id);
  if (!story) return false;
  resetRun();
  const epoch = runEpoch;
  state.storyId = story.id;
  state.phase = 'watch';
  state.breaths = 0;
  state.earlyTaps = 0;
  state.awaitingInput = true;
  renderPhase();
  setScreen('play');
  playSfx('whoosh');
  await speak(story.watchKey);
  if (epoch !== runEpoch || state.screen !== 'play' || state.phase !== 'watch') return false;
  await timers.wait(state.reducedMotion ? 1 : 480);
  if (epoch !== runEpoch || state.screen !== 'play' || state.phase !== 'watch') return false;
  return enterBreathe();
}

function enterWatch() {
  if (state.screen !== 'play') return false;
  resetRun();
  state.phase = 'watch';
  state.breaths = 0;
  state.awaitingInput = true;
  renderPhase();
  return true;
}

function enterBreathe() {
  if (state.screen !== 'play') return false;
  state.phase = 'breathe';
  state.awaitingInput = true;
  renderPhase();
  speak(currentStory().breatheKey);
  nudger.arm();
  return true;
}

function enterTurn() {
  if (state.screen !== 'play') return false;
  state.phase = 'turn';
  state.awaitingInput = true;
  nudger.arm();
  renderPhase();
  playSfx('sparkle');
  speak(currentStory().turnKey);
  return true;
}

async function takeBreath() {
  const story = currentStory();
  if (state.screen !== 'play' || state.phase !== 'breathe' || !state.awaitingInput) return false;
  const epoch = runEpoch;
  state.awaitingInput = false;
  nudger.stop();
  state.breaths = Math.min(story.breaths, state.breaths + 1);
  renderBreaths(story);
  const button = mount.querySelector('.breath-button');
  button.classList.remove('is-breathing');
  void button.offsetWidth;
  button.classList.add('is-breathing');
  playSfx('pop');
  await speak('breath');
  if (epoch !== runEpoch || state.screen !== 'play' || state.phase !== 'breathe') return false;
  if (state.breaths >= story.breaths) {
    await timers.wait(state.reducedMotion ? 1 : 220);
    if (epoch !== runEpoch || state.phase !== 'breathe') return false;
    return enterTurn();
  }
  state.awaitingInput = true;
  nudger.arm();
  return true;
}

function earlyTap() {
  if (state.screen !== 'play' || !['watch', 'breathe'].includes(state.phase)) return false;
  state.earlyTaps += 1;
  els.propButton.classList.remove('is-early');
  void els.propButton.offsetWidth;
  els.propButton.classList.add('is-early');
  els.feedback.textContent = 'Almost your turn — you can do one more calm breath.';
  playSfx('boing');
  speak('early');
  if (state.phase === 'breathe') nudger.arm();
  return true;
}

async function useProp() {
  if (state.screen !== 'play') return false;
  if (state.phase !== 'turn') return earlyTap();
  if (!state.awaitingInput) return false;
  resetRun();
  const story = currentStory();
  const epoch = runEpoch;
  state.phase = 'success';
  state.awaitingInput = false;
  state.completed = [...new Set([...state.completed, story.id])];
  els.propButton.classList.add('is-ready', 'is-success');
  els.fox.src = ART.characters[story.foxTurn];
  els.friend.classList.add('is-cheering');
  els.feedback.textContent = 'You waited for your turn!';
  playSfx('sparkle');
  celebrationDispose = tada({ host: mount.querySelector('.play-stage'), count: 34, duration: 2400, rng });
  await timers.wait(state.reducedMotion ? 1 : 620);
  if (epoch !== runEpoch || state.phase !== 'success') return true;
  els.endFriend.src = ART.characters[story.friend];
  els.endFriend.alt = story.friendAlt;
  els.endFox.src = ART.characters[story.foxTurn];
  els.endStars.innerHTML = Array.from({ length: 3 }, (_, index) =>
    `<img class="end-star" src="${ART.ui['reward-star']}" alt="Patience star ${index + 1}" draggable="false" />`).join('');
  state.screen = 'end';
  state.phase = 'complete';
  state.awaitingInput = true;
  screens.show('end');
  renderProgress();
  celebrationDispose?.();
  celebrationDispose = tada({ host: mount.querySelector('.end-stage'), count: 44, duration: 3000, rng });
  speak('success');
  return true;
}

function repeatPrompt() {
  if (state.screen === 'splash') return speak('welcome');
  if (state.screen === 'practice') return speak('pick-story');
  if (state.screen === 'end') return speak('success');
  const story = currentStory();
  if (state.phase === 'watch') return speak(story.watchKey);
  if (state.phase === 'breathe') return speak(story.breatheKey);
  return speak(story.turnKey);
}

function setMuted(on = true) {
  state.muted = Boolean(on);
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  mount.querySelectorAll('[data-target="sound"]').forEach((button) => {
    button.classList.toggle('is-muted', state.muted);
    button.setAttribute('aria-pressed', state.muted ? 'true' : 'false');
    button.setAttribute('aria-label', state.muted
      ? 'Sound is quiet. Tap to turn sound on and hear the prompt.'
      : 'Sound is on. Tap for quiet.');
  });
  return state.muted;
}

function toggleMute() {
  const muted = setMuted(!state.muted);
  if (!muted) repeatPrompt();
  return muted;
}

function addHud() {
  const home = hudButton('home', () => { location.href = '../../'; }, { label: 'Back to QLOBE Kids' });
  home.classList.add('qk-hud-top-left');
  home.dataset.target = 'home';
  mount.querySelector('.splash-hud').append(home);

  for (const selector of ['.practice-hud', '.play-hud', '.end-hud']) {
    const host = mount.querySelector(selector);
    const back = hudButton('back', () => showSplash({ speakPrompt: true }), { label: 'Back to theater entrance' });
    back.classList.add('qk-hud-top-left');
    back.dataset.target = 'back';
    const sound = hudButton('sound', soundDebounce(toggleMute, 650), { label: 'Sound is on. Tap for quiet.' });
    sound.classList.add('qk-hud-top-right');
    sound.dataset.target = 'sound';
    sound.setAttribute('aria-pressed', 'false');
    host.append(back, sound);
  }
}

addHud();
renderProgress();

disposers.push(onTap(mount.querySelector('.play-button'), () => showPractice({ speakPrompt: true }), {
  feedback: () => playSfx('whoosh'),
}));

mount.querySelectorAll('.story-card').forEach((button) => {
  disposers.push(onTap(button, () => startStory(button.dataset.story), {
    feedback: () => playSfx('pop'),
  }));
});

disposers.push(onTap(mount.querySelector('.breath-button'), takeBreath, {
  feedback: () => playSfx('tick'),
}));
disposers.push(onTap(els.propButton, useProp, { feedback: () => playSfx('tick') }));
disposers.push(onTap(mount.querySelector('.again-button'), () => startStory(), {
  feedback: () => playSfx('pop'),
}));
disposers.push(onTap(mount.querySelector('.another-button'), () => {
  showPractice({ speakPrompt: false });
  speak('another');
}, { feedback: () => playSfx('tick') }));

const nudger = createNudger({
  first: 10500,
  repeat: 12000,
  onNudge(index) {
    if (state.screen !== 'play') return;
    if (state.phase === 'breathe') {
      speak(index === 0 ? 'breath' : currentStory().breatheKey);
      mount.querySelector('.breath-button')?.classList.add('is-nudging');
      timers.after(900, () => mount.querySelector('.breath-button')?.classList.remove('is-nudging'));
    } else if (state.phase === 'turn') {
      speak(currentStory().turnKey);
      els.propButton.classList.add('is-nudging');
      timers.after(900, () => els.propButton.classList.remove('is-nudging'));
    }
  },
});

bgm.preload(config.music.track);
bgm.setVolume(config.music.volume);
const disposeUnlock = installUnlockOnGesture({
  extra: [bgm.unlock],
  onFirst: () => bgm.play(config.music.track, {
    key: config.id,
    fadeInMs: 800,
    loopFadeOutMs: 2400,
  }),
});
const disposeKiosk = installKioskGuards();

const assetUrls = [
  ART.stage,
  ART.title,
  ...Object.values(ART.characters),
  ...Object.values(ART.props),
  ...Object.values(ART.stories),
  ...Object.values(ART.ui),
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
  engine: 'puppet-patience-theater-custom',
  ready,
  timers,
  narrator,
  voice: voiceClips,
  sfx,
  root: mount,
  listModes: () => config.stories.map(({ id, title, skill }) => ({ id, title, skill })),
  startMode: (id) => startStory(id),
  getState: () => ({
    screen: state.screen,
    mode: state.storyId,
    round: state.phase === 'complete' ? 1 : 0,
    roundsTotal: 1,
    phase: state.phase,
    breaths: state.breaths,
    breathsNeeded: currentStory().breaths,
    earlyTaps: state.earlyTaps,
    awaitingInput: state.awaitingInput,
    completed: [...state.completed],
    muted: state.muted,
  }),
  tap(targetId) {
    if (targetId.startsWith('story-')) return startStory(targetId.slice(6));
    const node = [...mount.querySelectorAll('[data-target]')]
      .find((entry) => entry.dataset.target === targetId && entry.getClientRects().length);
    if (!node) return false;
    node.click();
    return true;
  },
  winRound() {
    if (state.screen !== 'play') return false;
    if (state.phase === 'watch') return enterBreathe();
    if (state.phase === 'breathe') {
      state.breaths = currentStory().breaths;
      renderBreaths(currentStory());
      return enterTurn();
    }
    if (state.phase === 'turn') return useProp();
    return false;
  },
  home: showSplash,
  showPractice,
  chooseStory: startStory,
  enterWatch,
  enterBreathe,
  enterTurn,
  takeBreath,
  earlyTap,
  mute: setMuted,
  onSeed(next, seed) {
    rng = next;
    state.seed = seed;
  },
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  resetProgress() {
    state.completed = [];
    renderProgress();
    return true;
  },
});

reduceQuery.addEventListener('change', (event) => { state.reducedMotion = event.matches; });

window.addEventListener('pagehide', () => {
  runEpoch += 1;
  timers.clearAll();
  nudger.stop();
  celebrationDispose?.();
  disposers.forEach((dispose) => dispose());
  bgm.stop({ fadeOutMs: 0 });
  narrator.dispose();
  disposeUnlock();
  disposeKiosk();
  disposeDebug();
}, { once: true });
