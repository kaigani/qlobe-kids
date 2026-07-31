import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as content from '../../../shared/js/content.js';
import { onTap } from '../../../shared/js/tap.js';

const $ = (selector) => document.querySelector(selector);
const els = {
  splash: $('#splash'),
  game: $('#game-screen'),
  reveal: $('#reveal'),
  cards: $('#mode-cards'),
  back: $('#back'),
  sound: $('#sound'),
  splashSound: $('.splash-sound'),
  revealBack: $('#reveal-back'),
  revealSound: $('#reveal-sound'),
  phaseDots: $('#phase-dots'),
  prompt: $('#prompt'),
  promptIcon: $('#prompt-icon'),
  promptText: $('#prompt-text'),
  playfield: $('#playfield'),
  revealCard: $('#reveal-card'),
  confetti: $('#confetti'),
  again: $('#again'),
  next: $('#next'),
};

const MODE_COLORS = [
  ['#ef7048', '#c34631'],
  ['#418fd1', '#235e9b'],
  ['#8063bf', '#533794'],
];
const MODE_TITLES = {
  letters: ['Make a Letter', 'A'],
  words: ['Build a Word', 'CAT'],
  free: ['Free Dough', ''],
};
const SHORT_PROMPTS = {
  welcome: 'Pick a way to play',
  color: 'Pick a dough color',
  roll: 'Roll the dough',
  trace: 'Follow the dotted line',
  nudge: 'Start at the glowing dot',
  'word-cat': 'Build CAT',
  'word-dog': 'Build DOG',
  'word-sun': 'Build SUN',
  free: 'Squish, stamp, and draw',
};
const PROMPT_ICONS = {
  welcome: '●',
  color: '●',
  roll: '↔',
  trace: '•',
  nudge: '•',
  words: 'A',
  free: '∿',
};
const CONFETTI_COLORS = ['#ef5b4f', '#f5ba35', '#3d8fd5', '#73b94d', '#9164c7', '#22a99c'];

const state = {
  screen: 'splash',
  mode: null,
  phase: null,
  promptKey: 'welcome',
  selectedColor: null,
  letterIndex: 0,
  wordIndex: 0,
  rollCount: 0,
  strokeIndex: 0,
  strokeProgress: 0,
  placed: 0,
  freeMarks: 0,
  awaitingInput: true,
  muted: false,
  timeScale: 1,
  seed: 42,
  transition: false,
};

let transitionPromise = Promise.resolve();
let currentActions = new Map();
let traceController = null;
let freeController = null;
let lastNudge = 0;

const ready = Promise.all([
  voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice),
  content.ready(),
]).then(() => {
  renderModeCards();
  wirePermanentControls();
  buildConfetti();
  return true;
});

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(1, ms * state.timeScale)));
}

function unlockAudio() {
  voice.unlock();
  speech.unlock();
  sfx.unlock();
}

window.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('gesturestart', (event) => event.preventDefault());

function playSfx(name) {
  if (!state.muted && typeof sfx[name] === 'function') sfx[name]();
}

function speak(key, fallback = config.voice[key]) {
  state.promptKey = key;
  if (state.muted) return Promise.resolve();
  return voice.say(key, fallback);
}

function setPrompt(key, icon = PROMPT_ICONS[key] || PROMPT_ICONS.words) {
  state.promptKey = key;
  els.promptIcon.textContent = icon;
  els.promptText.textContent = SHORT_PROMPTS[key] || config.voice[key] || key;
}

function showScreen(name) {
  state.screen = name;
  els.splash.classList.toggle('hidden', name !== 'splash');
  els.game.classList.toggle('hidden', name !== 'play');
  els.reveal.classList.toggle('hidden', name !== 'reveal');
}

function resetTransient() {
  traceController?.destroy();
  freeController?.destroy();
  traceController = null;
  freeController = null;
  voice.stop();
  currentActions = new Map();
  state.transition = false;
  state.awaitingInput = true;
  els.playfield.replaceChildren();
}

function goSplash({ greet = false } = {}) {
  resetTransient();
  state.mode = null;
  state.phase = null;
  state.selectedColor = null;
  showScreen('splash');
  if (greet) speak('again');
}

function registerTap(element, id, action, feedback = true) {
  element.dataset.targetId = id;
  currentActions.set(id, action);
  onTap(element, action, {
    feedback: () => {
      unlockAudio();
      if (feedback) playSfx('tick');
    },
  });
}

function renderModeCards() {
  els.cards.replaceChildren();
  config.modes.forEach((mode, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mode-card';
    button.style.setProperty('--card-top', MODE_COLORS[index][0]);
    button.style.setProperty('--card-bottom', MODE_COLORS[index][1]);
    button.style.setProperty('--tilt', `${[-2.5, 1.8, -1.2][index]}deg`);
    button.style.setProperty('--i', index);
    button.setAttribute('aria-label', mode.title);

    const art = document.createElement('span');
    art.className = `mode-art mode-art-${mode.id === 'letters' ? 'letter' : mode.id === 'words' ? 'word' : 'free'}`;
    art.setAttribute('aria-hidden', 'true');
    if (mode.id === 'letters') {
      art.textContent = MODE_TITLES[mode.id][1];
    } else if (mode.id === 'words') {
      [...MODE_TITLES[mode.id][1]].forEach((letter) => {
        const part = document.createElement('span');
        part.textContent = letter;
        art.append(part);
      });
    } else {
      art.append(document.createElement('i'));
    }

    const label = document.createElement('span');
    label.className = 'mode-label';
    label.textContent = MODE_TITLES[mode.id][0];
    button.append(art, label);
    els.cards.append(button);
    onTap(button, () => startMode(mode.id), {
      feedback: () => {
        unlockAudio();
        playSfx('pop');
      },
    });
  });
}

function wirePermanentControls() {
  onTap(els.splashSound, () => speak('welcome'), { feedback: unlockAudio });
  onTap(els.back, () => goSplash({ greet: true }), { feedback: () => playSfx('unpop') });
  onTap(els.revealBack, () => goSplash({ greet: true }), { feedback: () => playSfx('unpop') });
  onTap(els.sound, () => repeatPrompt(), { feedback: unlockAudio });
  onTap(els.revealSound, () => repeatReveal(), { feedback: unlockAudio });
  onTap(els.again, () => replayCurrent(), { feedback: () => playSfx('pop') });
  onTap(els.next, () => nextRound(), { feedback: () => playSfx('sparkle') });
}

function repeatPrompt() {
  const fallback = config.voice[state.promptKey];
  if (fallback) speak(state.promptKey, fallback);
}

function repeatReveal() {
  if (state.mode === 'letters') return speakLetterReward();
  if (state.mode === 'words') return speak('word-done');
  return speak('free');
}

async function startMode(modeId) {
  resetTransient();
  state.mode = modeId;
  state.letterIndex = seededIndex(config.letters.length);
  state.wordIndex = seededIndex(config.words.length);
  showScreen('play');
  if (modeId === 'letters') return renderColorShop();
  if (modeId === 'words') return renderWordMaker();
  return renderFreeDough();
}

function seededIndex(length) {
  const value = Math.abs((state.seed * 1664525 + 1013904223) | 0);
  state.seed = value;
  return value % length;
}

function phaseRail(count, active) {
  els.phaseDots.replaceChildren();
  for (let index = 0; index < count; index += 1) {
    const dot = document.createElement('i');
    dot.className = 'phase-dot';
    if (index < active) dot.classList.add('done');
    if (index === active) dot.classList.add('active');
    els.phaseDots.append(dot);
  }
}

function activeLetter() {
  return config.letters[state.letterIndex % config.letters.length];
}

function activeWord() {
  return config.words[state.wordIndex % config.words.length];
}

function colorById(id = state.selectedColor) {
  return config.colors.find((color) => color.id === id) || config.colors[0];
}

function applyColor(color) {
  document.documentElement.style.setProperty('--dough', color.value);
  document.documentElement.style.setProperty('--dough-dark', color.dark);
}

/* Letter factory: choose, roll, trace, reveal */

function renderColorShop() {
  resetTransient();
  state.mode = 'letters';
  state.phase = 'color';
  state.selectedColor = null;
  state.awaitingInput = true;
  showScreen('play');
  phaseRail(3, 0);
  setPrompt('color');

  const shop = document.createElement('div');
  shop.className = 'color-shop';

  const mascot = document.createElement('img');
  mascot.className = 'color-mascot';
  mascot.src = './assets/ui/mascot.webp';
  mascot.alt = '';

  const machine = document.createElement('div');
  machine.className = 'target-machine';
  machine.textContent = activeLetter().letter;
  machine.setAttribute('aria-label', `Today we are making ${activeLetter().letter}`);

  const belt = document.createElement('div');
  belt.className = 'color-belt';
  const go = document.createElement('button');
  go.type = 'button';
  go.className = 'clay-action color-go';
  go.innerHTML = '<span aria-hidden="true">➜</span>';
  go.setAttribute('aria-label', 'Start rolling');
  go.disabled = true;

  config.colors.forEach((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'color-tub';
    button.style.setProperty('--swatch', color.value);
    button.style.setProperty('--swatch-dark', color.dark);
    button.setAttribute('aria-label', color.label);
    button.innerHTML = '<span class="dough-lump"></span><span class="tub-body"></span><span class="tub-check">✓</span>';
    registerTap(button, `color-${color.id}`, () => {
      state.selectedColor = color.id;
      applyColor(color);
      belt.querySelectorAll('.color-tub').forEach((tub) => {
        tub.classList.toggle('selected', tub === button);
        tub.setAttribute('aria-pressed', String(tub === button));
      });
      go.disabled = false;
      playSfx('pop');
      return true;
    });
    belt.append(button);
  });

  registerTap(go, 'color-go', () => {
    if (!state.selectedColor) return false;
    return renderRolling();
  });
  belt.append(go);
  shop.append(mascot, machine, belt);
  els.playfield.append(shop);
  transitionPromise = speak('color');
  return transitionPromise;
}

function renderRolling() {
  resetTransient();
  state.phase = 'roll';
  state.rollCount = 0;
  state.awaitingInput = true;
  showScreen('play');
  phaseRail(3, 1);
  setPrompt('roll');
  applyColor(colorById());

  const stage = document.createElement('div');
  stage.className = 'roll-stage';
  const tray = document.createElement('div');
  tray.className = 'work-tray roll-tray';
  const zone = document.createElement('div');
  zone.className = 'roll-zone';
  zone.dataset.targetId = 'roll-zone';
  const rope = document.createElement('div');
  rope.className = 'dough-rope';
  const roller = document.createElement('div');
  roller.className = 'rolling-pin';
  const cue = document.createElement('div');
  cue.className = 'swipe-cue';
  zone.append(rope, roller, cue);
  tray.append(zone);

  const meter = document.createElement('div');
  meter.className = 'roll-meter';
  for (let index = 0; index < 3; index += 1) {
    const bead = document.createElement('i');
    bead.className = 'roll-bead';
    bead.textContent = '✓';
    meter.append(bead);
  }
  stage.append(tray, meter);
  els.playfield.append(stage);

  let pointerId = null;
  let startX = 0;
  let latestX = 0;
  let maximumTravel = 0;
  const pointX = (event) => {
    const rect = zone.getBoundingClientRect();
    return Math.max(0, Math.min(rect.width, event.clientX - rect.left));
  };
  const onDown = (event) => {
    if (pointerId !== null || state.transition) return;
    pointerId = event.pointerId;
    startX = pointX(event);
    latestX = startX;
    maximumTravel = 0;
    zone.setPointerCapture?.(pointerId);
    cue.classList.add('fade');
  };
  const onMove = (event) => {
    if (event.pointerId !== pointerId) return;
    event.preventDefault();
    latestX = pointX(event);
    maximumTravel = Math.max(maximumTravel, Math.abs(latestX - startX));
    const percent = 12 + (latestX / Math.max(1, zone.clientWidth)) * 76;
    zone.style.setProperty('--roller-x', `${percent}%`);
  };
  const finish = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    if (maximumTravel < Math.min(115, zone.clientWidth * .2)) {
      gentleNudge(tray);
      return;
    }
    state.rollCount = Math.min(3, state.rollCount + 1);
    rope.style.setProperty('--rolled', `${.48 + state.rollCount * .17}`);
    rope.style.setProperty('--squish', `${1.15 - state.rollCount * .08}`);
    meter.children[state.rollCount - 1]?.classList.add('done');
    playSfx(state.rollCount === 3 ? 'sparkle' : 'pop');
    if (state.rollCount >= 3) {
      state.awaitingInput = false;
      state.transition = true;
      transitionPromise = wait(500).then(renderTracing);
    }
  };
  zone.addEventListener('pointerdown', onDown);
  zone.addEventListener('pointermove', onMove);
  zone.addEventListener('pointerup', finish);
  zone.addEventListener('pointercancel', finish);
  currentActions.set('roll-zone', () => false);
  transitionPromise = speak('roll');
  return transitionPromise;
}

function renderTracing() {
  resetTransient();
  state.phase = 'trace';
  state.strokeIndex = 0;
  state.strokeProgress = 0;
  state.awaitingInput = true;
  showScreen('play');
  phaseRail(3, 2);
  setPrompt('trace');
  applyColor(colorById());

  const letter = activeLetter();
  const stage = document.createElement('div');
  stage.className = 'trace-stage';
  const tray = document.createElement('div');
  tray.className = 'work-tray trace-tray';
  const side = document.createElement('aside');
  side.className = 'trace-side';
  side.innerHTML = `
    <div class="target-letter-chip" aria-label="Letter ${letter.letter}">${letter.letter}</div>
    <div class="trace-color-chip" aria-hidden="true"><i></i></div>
    <div class="stroke-meter" aria-hidden="true">${letter.paths.map(() => '<i class="stroke-dot"></i>').join('')}</div>`;
  stage.append(tray, side);
  els.playfield.append(stage);

  traceController = createTraceSurface(tray, letter.paths, {
    onProgress: (value) => { state.strokeProgress = value; },
    onStrokeComplete: (index) => {
      state.strokeIndex = index + 1;
      state.strokeProgress = 0;
      side.querySelectorAll('.stroke-dot')[index]?.classList.add('done');
      playSfx('pop');
    },
    onWrongStart: () => {
      gentleNudge(tray);
      const now = performance.now();
      if (now - lastNudge > 1200) {
        lastNudge = now;
        setPrompt('nudge');
        speak('nudge').finally(() => {
          if (state.phase === 'trace') setPrompt('trace');
        });
      }
    },
    onComplete: () => {
      state.awaitingInput = false;
      state.transition = true;
      playSfx('sparkle');
      transitionPromise = wait(480).then(showLetterReveal);
    },
  });
  currentActions.set('trace-surface', () => false);
  transitionPromise = speak('trace');
  return transitionPromise;
}

function createTraceSurface(mount, pathData, callbacks) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.classList.add('letter-svg');
  svg.setAttribute('viewBox', '0 0 600 600');
  svg.dataset.targetId = 'trace-surface';
  svg.innerHTML = `
    <defs>
      <filter id="clay-shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="10" stdDeviation="4" flood-color="var(--dough-dark)" flood-opacity=".72"/>
        <feDropShadow dx="-4" dy="-5" stdDeviation="5" flood-color="#fff" flood-opacity=".18"/>
      </filter>
    </defs>`;
  const guides = [];
  const clays = [];
  pathData.forEach((data) => {
    const guide = document.createElementNS(svgNS, 'path');
    guide.setAttribute('d', data);
    guide.setAttribute('class', 'letter-guide');
    const clay = document.createElementNS(svgNS, 'path');
    clay.setAttribute('d', data);
    clay.setAttribute('class', 'letter-clay');
    svg.append(guide, clay);
    guides.push(guide);
    clays.push(clay);
  });
  const start = document.createElementNS(svgNS, 'circle');
  start.setAttribute('r', '26');
  start.setAttribute('class', 'trace-start');
  svg.append(start);
  const finger = document.createElement('div');
  finger.className = 'trace-finger';
  mount.append(svg, finger);

  const lengths = clays.map((path) => path.getTotalLength());
  lengths.forEach((length, index) => {
    clays[index].style.strokeDasharray = `${length}`;
    clays[index].style.strokeDashoffset = `${length}`;
  });

  let index = 0;
  let progressLength = 0;
  let pointerId = null;
  let destroyed = false;

  const pointAt = (pathIndex, length) => clays[pathIndex].getPointAtLength(length);
  const updateCue = () => {
    if (index >= clays.length) {
      start.style.display = 'none';
      finger.style.display = 'none';
      return;
    }
    const point = pointAt(index, progressLength);
    start.setAttribute('cx', point.x);
    start.setAttribute('cy', point.y);
    const clientPoint = svg.createSVGPoint();
    clientPoint.x = point.x;
    clientPoint.y = point.y;
    const screenPoint = clientPoint.matrixTransform(svg.getScreenCTM());
    const mountRect = mount.getBoundingClientRect();
    finger.style.left = `${screenPoint.x - mountRect.left}px`;
    finger.style.top = `${screenPoint.y - mountRect.top}px`;
  };
  updateCue();

  const localPoint = (event) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  };
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  const onDown = (event) => {
    if (pointerId !== null || index >= clays.length || destroyed) return;
    const local = localPoint(event);
    const expected = pointAt(index, progressLength);
    if (distance(local, expected) > 88) {
      callbacks.onWrongStart();
      return;
    }
    pointerId = event.pointerId;
    svg.setPointerCapture?.(pointerId);
    finger.style.display = 'none';
  };
  const onMove = (event) => {
    if (event.pointerId !== pointerId || index >= clays.length) return;
    event.preventDefault();
    const local = localPoint(event);
    const total = lengths[index];
    let best = progressLength;
    const from = Math.max(0, progressLength - 24);
    const to = Math.min(total, progressLength + Math.max(125, total * .2));
    for (let cursor = from; cursor <= to; cursor += 5) {
      if (distance(local, pointAt(index, cursor)) < 82) best = Math.max(best, cursor);
    }
    if (best > progressLength) {
      progressLength = best;
      clays[index].style.strokeDashoffset = `${Math.max(0, total - progressLength)}`;
      callbacks.onProgress(progressLength / total);
      updateCue();
    }
  };
  const onUp = (event) => {
    if (event.pointerId !== pointerId || index >= clays.length) return;
    pointerId = null;
    const total = lengths[index];
    if (progressLength / total >= .82) {
      clays[index].style.strokeDashoffset = '0';
      callbacks.onStrokeComplete(index);
      index += 1;
      progressLength = 0;
      if (index >= clays.length) callbacks.onComplete();
      else {
        finger.style.display = '';
        updateCue();
      }
    } else {
      finger.style.display = '';
      updateCue();
    }
  };
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  return {
    complete() {
      if (destroyed) return;
      while (index < clays.length) {
        clays[index].style.strokeDashoffset = '0';
        callbacks.onStrokeComplete(index);
        index += 1;
      }
      callbacks.onComplete();
    },
    destroy() {
      destroyed = true;
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
    },
  };
}

function gentleNudge(element) {
  playSfx('silly');
  element.classList.remove('nudge');
  void element.offsetWidth;
  element.classList.add('nudge');
}

function showLetterReveal() {
  resetTransient();
  state.phase = 'reveal';
  state.awaitingInput = true;
  showScreen('reveal');
  const letter = activeLetter();
  const color = colorById();
  applyColor(color);
  els.revealCard.replaceChildren();

  const wrap = document.createElement('div');
  wrap.className = 'reveal-letter-wrap';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('reveal-letter-svg');
  svg.setAttribute('viewBox', '0 0 600 600');
  svg.innerHTML = `
    <defs><filter id="reveal-shadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="12" stdDeviation="5" flood-color="${color.dark}" flood-opacity=".75"/>
      <feDropShadow dx="-4" dy="-5" stdDeviation="5" flood-color="#fff" flood-opacity=".16"/>
    </filter></defs>`;
  letter.paths.forEach((data) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', data);
    path.setAttribute('class', 'letter-clay-finished');
    path.style.filter = 'url(#reveal-shadow)';
    svg.append(path);
  });
  const face = document.createElement('span');
  face.className = 'reveal-face';
  face.innerHTML = '<i></i><i></i>';
  const smile = document.createElement('span');
  smile.className = 'reveal-smile';
  wrap.append(svg, face, smile);

  const object = document.createElement('img');
  object.className = 'phonics-object';
  object.src = letter.object;
  object.alt = letter.word;
  const label = document.createElement('div');
  label.className = 'phonics-label';
  label.innerHTML = `<strong>${letter.letter}</strong> is for ${letter.word.toUpperCase()}`;
  els.revealCard.append(wrap, object, label);
  playSfx('tada');
  transitionPromise = speakLetterReward();
  return transitionPromise;
}

async function speakLetterReward() {
  const letter = activeLetter();
  await speak('letter-done');
  if (state.muted || state.screen !== 'reveal') return;
  const clip = content.isforAudio?.(letter.word);
  if (clip) await voice.sayFile(clip, `${letter.letter} is for ${letter.word}.`);
  else await speech.speak(`${letter.letter} is for ${letter.word}.`);
}

/* Word maker */

function renderWordMaker() {
  resetTransient();
  state.mode = 'words';
  state.phase = 'word';
  state.placed = 0;
  state.awaitingInput = true;
  showScreen('play');
  phaseRail(3, state.wordIndex % 3);
  const word = activeWord();
  setPrompt(`word-${word.id}`, PROMPT_ICONS.words);

  const stage = document.createElement('div');
  stage.className = 'word-stage';
  const clue = document.createElement('aside');
  clue.className = 'word-clue';
  clue.innerHTML = `<img src="${word.object}" alt="${word.id}"><div class="word-stars" aria-hidden="true"><i></i><i></i><i></i></div>`;
  const machine = document.createElement('div');
  machine.className = 'word-machine';
  const slots = document.createElement('div');
  slots.className = 'word-slots';
  const tray = document.createElement('div');
  tray.className = 'letter-tray';
  const letters = [...word.word];

  letters.forEach((letter, index) => {
    const slot = document.createElement('div');
    slot.className = `word-slot${index === 0 ? ' current' : ''}`;
    slot.textContent = letter;
    slot.dataset.targetId = `slot-${index}`;
    slots.append(slot);
  });

  const shuffled = seededShuffle(letters.map((letter, index) => ({ letter, original: index })));
  shuffled.forEach((item, tokenIndex) => {
    const color = config.colors[(tokenIndex + state.wordIndex) % config.colors.length];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'letter-token';
    button.textContent = item.letter;
    button.dataset.letter = item.letter;
    button.dataset.targetId = `token-${tokenIndex}`;
    button.style.setProperty('--token-color', color.value);
    button.style.setProperty('--token-dark', color.dark);
    wireWordToken(button, () => placeWordToken(button, color));
    tray.append(button);
  });

  machine.append(slots, tray);
  stage.append(clue, machine);
  els.playfield.append(stage);
  transitionPromise = speak(`word-${word.id}`);
  return transitionPromise;
}

function seededShuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = seededIndex(index + 1);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function wireWordToken(button, action) {
  const id = button.dataset.targetId;
  currentActions.set(id, action);
  let pointerId = null;
  let start = null;
  let moved = false;
  let suppressClickUntil = 0;
  const resetTransform = () => {
    button.classList.remove('dragging');
    button.style.transform = '';
  };
  button.addEventListener('pointerdown', (event) => {
    if (button.classList.contains('used') || pointerId !== null) return;
    unlockAudio();
    playSfx('tick');
    pointerId = event.pointerId;
    start = { x: event.clientX, y: event.clientY };
    moved = false;
    button.setPointerCapture?.(pointerId);
  });
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId || !start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.hypot(dx, dy) > 8) moved = true;
    if (moved) {
      event.preventDefault();
      button.classList.add('dragging');
      button.style.transform = `translate(${dx}px, ${dy}px) scale(1.08) rotate(-3deg)`;
    }
  });
  const finish = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    suppressClickUntil = performance.now() + 650;
    const current = els.playfield.querySelector('.word-slot.current');
    const rect = current?.getBoundingClientRect();
    const droppedOnCurrent = moved && rect
      && event.clientX >= rect.left - 28 && event.clientX <= rect.right + 28
      && event.clientY >= rect.top - 28 && event.clientY <= rect.bottom + 28;
    resetTransform();
    if (!moved || droppedOnCurrent) action();
    else wrongWordToken(button);
  };
  button.addEventListener('pointerup', finish);
  button.addEventListener('pointercancel', (event) => {
    if (event.pointerId === pointerId) {
      pointerId = null;
      resetTransform();
    }
  });
  button.addEventListener('click', () => {
    if (performance.now() < suppressClickUntil) return;
    action();
  });
}

function placeWordToken(button, color) {
  if (state.transition || button.classList.contains('used')) return false;
  const word = activeWord();
  const expected = word.word[state.placed];
  if (button.dataset.letter !== expected) {
    wrongWordToken(button);
    return false;
  }
  const slots = [...els.playfield.querySelectorAll('.word-slot')];
  const slot = slots[state.placed];
  slot.classList.remove('current');
  slot.classList.add('filled');
  slot.style.setProperty('--slot-color', color.value);
  slot.style.setProperty('--slot-dark', color.dark);
  button.classList.add('used');
  els.playfield.querySelectorAll('.word-stars i')[state.placed]?.classList.add('done');
  state.placed += 1;
  playSfx(state.placed === word.word.length ? 'sparkle' : 'pop');
  if (state.placed < word.word.length) {
    slots[state.placed].classList.add('current');
  } else {
    state.awaitingInput = false;
    state.transition = true;
    transitionPromise = wait(520).then(showWordReveal);
  }
  return true;
}

function wrongWordToken(button) {
  button.classList.remove('wrong');
  void button.offsetWidth;
  button.classList.add('wrong');
  playSfx('silly');
  return false;
}

function showWordReveal() {
  resetTransient();
  state.phase = 'reveal';
  state.awaitingInput = true;
  showScreen('reveal');
  const word = activeWord();
  els.revealCard.replaceChildren();
  const row = document.createElement('div');
  row.className = 'word-reveal';
  [...word.word].forEach((letter, index) => {
    const color = config.colors[(index + state.wordIndex) % config.colors.length];
    const part = document.createElement('span');
    part.textContent = letter;
    part.style.setProperty('--letter-color', color.value);
    part.style.setProperty('--letter-dark', color.dark);
    part.style.setProperty('--i', index);
    row.append(part);
  });
  const object = document.createElement('img');
  object.className = 'word-reveal-object';
  object.src = word.object;
  object.alt = word.id;
  const label = document.createElement('div');
  label.className = 'phonics-label';
  label.textContent = word.word;
  els.revealCard.append(row, object, label);
  playSfx('tada');
  transitionPromise = speak('word-done');
  return transitionPromise;
}

/* Free play */

function renderFreeDough() {
  resetTransient();
  state.mode = 'free';
  state.phase = 'free';
  state.freeMarks = 0;
  state.awaitingInput = true;
  state.selectedColor = config.colors[0].id;
  applyColor(config.colors[0]);
  showScreen('play');
  phaseRail(1, 0);
  setPrompt('free');

  const stage = document.createElement('div');
  stage.className = 'free-stage';
  const tray = document.createElement('div');
  tray.className = 'work-tray free-tray';
  const tools = document.createElement('div');
  tools.className = 'free-tools';
  const palette = document.createElement('div');
  palette.className = 'free-palette';

  ['A', 'O', 'S', '★'].forEach((stamp) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stamp-button';
    button.textContent = stamp;
    button.setAttribute('aria-label', `Stamp ${stamp === '★' ? 'a star' : stamp}`);
    registerTap(button, `stamp-${stamp}`, () => {
      freeController?.stamp(stamp);
      return true;
    });
    tools.append(button);
  });

  config.colors.forEach((color, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `palette-dot${index === 0 ? ' selected' : ''}`;
    button.style.setProperty('--swatch', color.value);
    button.style.setProperty('--swatch-dark', color.dark);
    button.setAttribute('aria-label', color.label);
    registerTap(button, `palette-${color.id}`, () => {
      state.selectedColor = color.id;
      applyColor(color);
      palette.querySelectorAll('.palette-dot').forEach((dot) => dot.classList.toggle('selected', dot === button));
      return true;
    });
    palette.append(button);
  });

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'clay-action free-clear';
  clear.innerHTML = '<span aria-hidden="true">↺</span>';
  clear.setAttribute('aria-label', 'Clear the tray');
  registerTap(clear, 'free-clear', () => {
    freeController?.clear();
    playSfx('unpop');
    return true;
  });
  palette.append(clear);
  stage.append(tray, tools, palette);
  els.playfield.append(stage);

  freeController = createFreeSurface(tray, {
    color: () => colorById(),
    onMark: () => {
      state.freeMarks += 1;
      playSfx(state.freeMarks % 4 === 0 ? 'sparkle' : 'pop');
    },
    onClear: () => { state.freeMarks = 0; },
  });
  currentActions.set('free-canvas', () => {
    freeController?.stamp('★');
    return true;
  });
  transitionPromise = speak('free');
  return transitionPromise;
}

function createFreeSurface(mount, callbacks) {
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.classList.add('free-canvas');
  svg.setAttribute('viewBox', '0 0 900 600');
  svg.dataset.targetId = 'free-canvas';
  svg.innerHTML = `
    <defs>
      <filter id="free-shadow" x="-30%" y="-30%" width="160%" height="180%">
        <feDropShadow dx="0" dy="9" stdDeviation="4" flood-color="#592d21" flood-opacity=".28"/>
        <feDropShadow dx="-3" dy="-4" stdDeviation="4" flood-color="#fff" flood-opacity=".16"/>
      </filter>
    </defs>`;
  const hint = document.createElement('div');
  hint.className = 'free-hint';
  hint.textContent = '∿';
  mount.append(svg, hint);

  let pointerId = null;
  let currentPath = null;
  let points = [];
  let destroyed = false;
  const localPoint = (event) => {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM().inverse());
  };
  const redraw = () => {
    if (!currentPath || points.length === 0) return;
    currentPath.setAttribute('d', points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' '));
  };
  const onDown = (event) => {
    if (pointerId !== null || destroyed) return;
    pointerId = event.pointerId;
    svg.setPointerCapture?.(pointerId);
    const color = callbacks.color();
    currentPath = document.createElementNS(svgNS, 'path');
    currentPath.setAttribute('stroke', color.value);
    currentPath.setAttribute('stroke-width', '56');
    currentPath.dataset.mark = 'draw';
    points = [localPoint(event)];
    svg.append(currentPath);
    redraw();
    hint.classList.add('fade');
  };
  const onMove = (event) => {
    if (event.pointerId !== pointerId || !currentPath) return;
    event.preventDefault();
    const point = localPoint(event);
    const previous = points[points.length - 1];
    if (Math.hypot(point.x - previous.x, point.y - previous.y) >= 7) {
      points.push(point);
      redraw();
    }
  };
  const onUp = (event) => {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    if (points.length < 2) {
      const start = points[0];
      currentPath.setAttribute('d', `M${start.x - 1} ${start.y} L${start.x + 1} ${start.y}`);
    }
    currentPath = null;
    points = [];
    callbacks.onMark();
  };
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);

  return {
    stamp(mark) {
      const color = callbacks.color();
      const text = document.createElementNS(svgNS, 'text');
      const count = svg.querySelectorAll('[data-mark]').length;
      text.dataset.mark = 'stamp';
      text.textContent = mark;
      text.setAttribute('x', `${230 + (count * 173) % 470}`);
      text.setAttribute('y', `${220 + (count * 109) % 245}`);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('font-family', 'Fredoka, sans-serif');
      text.setAttribute('font-size', mark === '★' ? '170' : '225');
      text.setAttribute('font-weight', '600');
      text.setAttribute('fill', color.value);
      text.setAttribute('stroke', color.dark);
      text.setAttribute('stroke-width', '10');
      text.setAttribute('paint-order', 'stroke fill');
      text.setAttribute('filter', 'url(#free-shadow)');
      svg.append(text);
      hint.classList.add('fade');
      callbacks.onMark();
    },
    clear() {
      svg.querySelectorAll('[data-mark]').forEach((mark) => mark.remove());
      hint.classList.remove('fade');
      callbacks.onClear();
    },
    destroy() {
      destroyed = true;
      svg.removeEventListener('pointerdown', onDown);
      svg.removeEventListener('pointermove', onMove);
      svg.removeEventListener('pointerup', onUp);
      svg.removeEventListener('pointercancel', onUp);
    },
  };
}

function replayCurrent() {
  if (state.mode === 'letters') return renderColorShop();
  if (state.mode === 'words') return renderWordMaker();
  return renderFreeDough();
}

function nextRound() {
  if (state.mode === 'letters') {
    state.letterIndex = (state.letterIndex + 1) % config.letters.length;
    return renderColorShop();
  }
  if (state.mode === 'words') {
    state.wordIndex = (state.wordIndex + 1) % config.words.length;
    return renderWordMaker();
  }
  return renderFreeDough();
}

function buildConfetti() {
  els.confetti.replaceChildren();
  for (let index = 0; index < 28; index += 1) {
    const piece = document.createElement('i');
    piece.style.left = `${3 + (index * 37) % 94}%`;
    piece.style.setProperty('--confetti', CONFETTI_COLORS[index % CONFETTI_COLORS.length]);
    piece.style.setProperty('--duration', `${2.8 + (index % 7) * .23}s`);
    piece.style.setProperty('--delay', `${-(index % 11) * .31}s`);
    els.confetti.append(piece);
  }
}

function targetRole(element) {
  const id = element.dataset.targetId || '';
  if (state.mode === 'words' && id.startsWith('token-')) {
    return element.dataset.letter === activeWord().word[state.placed] ? 'correct' : 'wrong';
  }
  if (id === 'color-go') return state.selectedColor ? 'correct' : 'neutral';
  if (id.startsWith('color-') || id.startsWith('palette-') || id.startsWith('stamp-')) return 'neutral';
  if (['roll-zone', 'trace-surface', 'free-canvas'].includes(id)) return 'correct';
  return 'neutral';
}

async function debugTap(targetId) {
  const action = currentActions.get(targetId);
  if (!action) return { accepted: false };
  const result = await action();
  return { accepted: result !== false };
}

async function debugWinRound() {
  if (state.mode === 'letters') {
    if (state.phase === 'color') {
      state.selectedColor = config.colors[0].id;
      applyColor(config.colors[0]);
      await renderRolling();
    }
    if (state.phase === 'roll') {
      state.rollCount = 3;
      await renderTracing();
    }
    if (state.phase === 'trace') traceController?.complete();
    await transitionPromise;
    return true;
  }
  if (state.mode === 'words' && state.phase === 'word') {
    const word = activeWord();
    for (const letter of word.word) {
      const token = [...els.playfield.querySelectorAll('.letter-token:not(.used)')]
        .find((candidate) => candidate.dataset.letter === letter);
      if (token) {
        const index = [...token.parentElement.children].indexOf(token);
        const color = config.colors[(index + state.wordIndex) % config.colors.length];
        placeWordToken(token, color);
      }
    }
    await transitionPromise;
    return true;
  }
  if (state.mode === 'free') {
    freeController?.stamp('A');
    freeController?.stamp('★');
    return true;
  }
  return false;
}

function debugMute() {
  state.muted = true;
  voice.stop();
  speech.stop();
  window.speechSynthesis?.cancel();
  document.querySelectorAll('audio, video').forEach((media) => { media.muted = true; });
  return true;
}

window.QLOBE_DEBUG = {
  version: 1,
  gameId: config.id,
  engine: 'custom-playdough-factory',
  ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: () => ({
    screen: state.screen,
    mode: state.mode,
    phase: state.phase,
    round: state.mode === 'letters' ? state.letterIndex : state.wordIndex,
    roundsTotal: state.mode === 'letters' ? config.letters.length : state.mode === 'words' ? config.words.length : 1,
    awaitingInput: state.awaitingInput,
    selectedColor: state.selectedColor,
    letter: state.mode === 'letters' ? activeLetter().letter : null,
    word: state.mode === 'words' ? activeWord().word : null,
    rollCount: state.rollCount,
    stroke: state.strokeIndex,
    strokeProgress: state.strokeProgress,
    placed: state.placed,
    freeMarks: state.freeMarks,
    muted: state.muted,
  }),
  getTargets: () => [...document.querySelectorAll('[data-target-id]')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        id: element.dataset.targetId,
        role: targetRole(element),
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
      };
    }),
  tap: debugTap,
  winRound: debugWinRound,
  mute: debugMute,
  seed: (value) => {
    state.seed = Number(value) || 1;
    return state.seed;
  },
  fastTimers: (scale = .05) => {
    state.timeScale = Math.max(.01, Math.min(1, Number(scale) || .05));
    return state.timeScale;
  },
  home: () => goSplash(),
};
