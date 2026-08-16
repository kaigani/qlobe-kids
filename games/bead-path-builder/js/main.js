import configPromise from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { installKioskGuards, installUnlockOnGesture } from '../../../shared/js/audio-unlock.js';
import { hudButton, progressDots, soundDebounce } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTimers } from '../../../shared/js/timers.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { tada } from '../../../shared/js/celebrate.js';

const root = document.querySelector('#game');
const timers = createTimers();
const POINTS = [[16, 36], [30, 39], [44, 41], [58, 41], [72, 39], [86, 36]];
const STORAGE_KEY = 'qlo.be/bead-path-builder/v1';
const MODE_IDS = new Set(['ab', 'abc', 'free']);
let config, rng = Math.random, drag, kioskDispose;
let muted = false;
let celebration = () => {};
let state = freshState();

function freshState() {
  const saved = readProgress();
  return { screen: 'shelf', mode: null, round: 0, sequence: [], placed: [], expected: null, busy: false,
    selected: null, choices: [], choiceFor: null, freePage: 0, drag: false, muted, video: null, mismatches: 0,
    lastMode: saved.mode };
}
function readProgress() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return { mode: MODE_IDS.has(saved.mode) ? saved.mode : null, count: Math.max(0, Number(saved.count) || 0) };
  } catch { return { mode: null, count: 0 }; }
}
function writeProgress(mode, { increment = false } = {}) {
  const prior = readProgress();
  const next = { mode: MODE_IDS.has(mode) ? mode : prior.mode, count: prior.count + (increment ? 1 : 0) };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
  return next;
}
function fisherYates(items) { const a = [...items]; for (let i = a.length - 1; i; i -= 1) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function asset(id) { return `./assets/beads/${config.beads[id].file}`; }
function say(key) { if (!muted) voice.say(key, config.lines[key] || key); }
function on(el, fn) { return onTap(el, fn, { feedback: () => sfx.tick() }); }
function announce(message) { const live = document.querySelector('#game-status'); if (live) live.textContent = message; }
function clearScreen() { timers.clearAll(); drag?.detach(); drag = null; celebration(); celebration = () => {}; }
function setMarkup(markup) { clearScreen(); root.innerHTML = markup; }
function beadImages(ids, cls = '') { return ids.map((id) => `<img class="${cls}" src="${asset(id)}" alt="${config.beads[id].name} bead">`).join(''); }
function action(id, label, icon = 'play') { return `<button class="art-action" data-target="${id}" aria-label="${label}"><img src="../../shared/assets/ui/btn-${icon}.png" alt=""><span>${label}</span></button>`; }
function replayKey() {
  if (state.screen === 'mirror') return state.video === 'fox-necklace' ? 'wear-cheer' : 'drag-cue';
  if (state.screen === 'complete') return 'wear-prompt';
  if (state.screen === 'board') return state.mode ? `intro-${state.mode}` : 'welcome';
  return 'welcome';
}
function replayCurrent() {
  if (state.screen === 'mirror') {
    const video = root.querySelector('video');
    if (video) {
      video.currentTime = 0;
      video.play().catch(() => say(replayKey()));
      return;
    }
  }
  say(replayKey());
}
function mountHud({ home = false, back }) {
  const hud = document.createElement('div'); hud.className = 'hud';
  const nav = hudButton(home ? 'home' : 'back', home ? () => { location.href = '../../index.html'; } : back);
  nav.dataset.target = home ? 'home' : 'back'; nav.classList.add('qk-hud-top-left');
  const sound = hudButton('sound', soundDebounce(replayCurrent));
  sound.dataset.target = 'sound'; sound.classList.add('qk-hud-top-right');
  hud.append(nav);
  if (state.screen === 'board' && state.mode !== 'free') {
    const dots = progressDots(config.modes[state.mode].length, state.round);
    dots.classList.add('round-progress');
    hud.append(dots);
  }
  hud.append(sound); root.append(hud);
}

function shelf() {
  state = freshState(); state.screen = 'shelf';
  setMarkup(`<section class="screen"><div class="hero"><img class="title" src="./assets/title.webp" alt="Bead Path Builder"><div class="modes">${[
    ['ab', 'AB Garden', ['round-red', 'barrel-yellow']], ['abc', 'ABC Rainbow', ['round-red', 'barrel-yellow', 'diamond-blue']], ['free', 'My Necklace', ['heart-coral', 'flower-teal', 'star-purple']],
  ].map(([id, label, preview]) => `<button class="mode" data-target="mode-${id}" data-mode="${id}" aria-label="${label}${state.lastMode === id ? ', last played' : ''}"><span class="preview">${beadImages(preview, 'mini')}</span><span class="mode-label">${label}</span></button>`).join('')}</div></div></section>`);
  mountHud({ home: true }); root.querySelectorAll('[data-mode]').forEach((el) => on(el, () => startMode(el.dataset.mode)));
  announce('Choose AB Garden, ABC Rainbow, or My Necklace.');
}
function nextSequence(mode, round = state.round) { return mode === 'free' ? [] : [...config.modes[mode][round % config.modes[mode].length]]; }
function compactPortrait() { return matchMedia('(max-width: 520px) and (orientation: portrait)').matches; }
function trayChoices() {
  if (state.mode === 'free') {
    const ids = Object.keys(config.beads);
    return compactPortrait() ? ids.slice(state.freePage * 3, state.freePage * 3 + 3) : ids;
  }
  const expected = state.sequence[state.placed.length];
  if (state.choiceFor !== expected || !state.choices.length) {
    state.choiceFor = expected;
    state.choices = fisherYates([expected, ...fisherYates(Object.keys(config.beads).filter((id) => id !== expected)).slice(0, 2)]);
  }
  return state.choices;
}
function board() {
  state.busy = false;
  state.screen = 'board'; state.video = null; const modeled = state.mode === 'ab' ? 2 : state.mode === 'abc' ? 3 : 0;
  if (!state.placed.length) state.placed = state.sequence.slice(0, modeled);
  state.expected = state.mode === 'free' ? null : state.sequence[state.placed.length];
  const prompt = state.mode === 'free' ? [] : state.sequence.slice(0, modeled);
  const compactFree = state.mode === 'free' && compactPortrait();
  setMarkup(`<section class="screen"><div class="board-shell ${compactFree ? 'free-board compact-free' : ''}">${prompt.length ? `<div class="prompt" aria-label="Pattern prompt">${beadImages(prompt)}</div>` : ''}<div class="slots">${POINTS.map((point, index) => {
    const id = state.placed[index], current = index === state.placed.length;
    const interactive = current || (state.mode === 'free' && Boolean(id));
    const label = current ? `Next bead position, ${index + 1} of 6` : id ? `${config.beads[id].name} bead in position ${index + 1}` : `Future bead position ${index + 1}`;
    return `<button class="slot ${id ? 'placed' : ''} ${current ? 'current' : ''}" data-slot data-index="${index}" data-target="slot-${index}" aria-label="${label}" ${interactive ? '' : 'disabled'} style="left:${point[0]}%;top:${point[1]}%">${id ? `<img src="${asset(id)}" alt="">` : ''}</button>`;
  }).join('')}</div><div class="tray">${trayChoices().map((id) => `<button class="bead ${id === state.selected ? 'selected' : ''} ${id === state.expected && state.mismatches > 1 ? 'expected' : ''}" data-bead="${id}" data-target="bead-${id}" aria-label="${config.beads[id].name} bead" aria-pressed="${id === state.selected}"><img src="${asset(id)}" alt=""></button>`).join('')}</div>${compactFree ? `<div class="compact-free-actions">${action('more', state.freePage ? 'First beads' : 'More beads', 'shuffle')}${state.placed.length >= 4 ? action('finish', 'Finish necklace') : ''}</div>` : ''}${state.mode !== 'free' ? action('hint', 'Watch threading hint') : ''}${state.mode === 'free' && !compactFree && state.placed.length >= 4 ? action('finish', 'Finish necklace') : ''}</div></section>`);
  mountHud({ back: shelf }); bindBoard(); scheduleIdle();
  announce(state.mode === 'free' ? 'Choose a bead, then thread the glowing spot.' : `Find the ${config.beads[state.expected].name} bead for the glowing spot.`);
}
function bindBoard() {
  root.querySelector('[data-target=hint]') && on(root.querySelector('[data-target=hint]'), () => playVideo('threading-tip'));
  root.querySelector('[data-target=finish]') && on(root.querySelector('[data-target=finish]'), finishFree);
  root.querySelector('[data-target=more]') && on(root.querySelector('[data-target=more]'), () => { state.freePage = state.freePage ? 0 : 1; state.selected = null; board(); announce(state.freePage ? 'Heart, star, and flower beads.' : 'Round, barrel, and diamond beads.'); });
  root.querySelectorAll('[data-bead]').forEach((el) => { on(el, () => select(el.dataset.bead)); });
  root.querySelectorAll('[data-slot]').forEach((slot) => on(slot, () => { const i = +slot.dataset.index; if (state.selected && i === state.placed.length) attempt(state.selected); else if (state.mode === 'free' && i < state.placed.length) revise(i); }));
  drag = createDragToSlotDom({ root, slotPad: 40, getPiece: (id) => root.querySelector(`[data-bead="${id}"]`), canStart: () => state.screen === 'board' && !state.busy, onGrab: () => { state.drag = true; }, onDrop: (piece, record) => { state.drag = false; if (record.slot && +record.slot.dataset.index === state.placed.length) attempt(piece.dataset.bead); }, onCancel: () => { state.drag = false; }, onTap: () => { state.drag = false; } });
  root.querySelectorAll('[data-bead]').forEach((el) => el.addEventListener('pointerdown', (event) => drag.begin(event, el.dataset.bead)));
}
function select(id) { if (state.busy) return; if (state.selected === id) attempt(id); else { state.selected = id; board(); } }
function findKey(id) { return `find-${config.beads[id].name}`; }
function patternNudgeKey() {
  if (state.mode === 'ab' && state.round % config.modes.ab.length === 0) {
    return state.expected === 'barrel-yellow' ? 'pattern-barrel' : 'pattern-round';
  }
  if (state.mode === 'abc' && state.round % config.modes.abc.length === 0) return 'pattern-three';
  return findKey(state.expected);
}
function attempt(id) {
  if (state.busy) return;
  state.busy = true;
  if (state.mode !== 'free' && id !== state.expected) { state.mismatches += 1; state.selected = null; sfx.unpop(); root.querySelector(`[data-bead="${id}"]`)?.classList.add('wobble'); say(state.mismatches === 1 ? patternNudgeKey() : findKey(state.expected)); timers.after(360, board); return; }
  state.mismatches = 0;
  const source = root.querySelector(`[data-bead="${id}"]`);
  flyBead(id, state.placed.length, source, () => { state.placed.push(id); state.selected = null; sfx.pop(); state.placed.length === 6 ? complete() : board(); });
}
function flyBead(id, index, source, done) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced || !source) { done(); return; }
  const sourceRect = source.getBoundingClientRect(), boardRect = root.querySelector('.board-shell').getBoundingClientRect();
  const bead = source.querySelector('img').cloneNode(true); bead.className = 'thread-flight';
  bead.style.left = `${sourceRect.left + sourceRect.width / 2}px`; bead.style.top = `${sourceRect.top + sourceRect.height / 2}px`; bead.style.setProperty('--thread-ms', `${timers.ms(220)}ms`); root.append(bead);
  const point = (x, y) => ({ x: boardRect.left + boardRect.width * x / 100, y: boardRect.top + boardRect.height * y / 100 });
  const tip = point(89, 36), destination = point(...POINTS[index]);
  requestAnimationFrame(() => { bead.style.left = `${tip.x}px`; bead.style.top = `${tip.y}px`; });
  timers.after(220, () => { bead.style.left = `${destination.x}px`; bead.style.top = `${destination.y}px`; });
  timers.after(460, () => { bead.remove(); done(); });
}
function revise(index) { if (state.busy) return; state.busy = true; state.placed = state.placed.slice(0, index); state.selected = null; board(); }
function complete({ resume = false } = {}) {
  state.busy = false;
  state.screen = 'complete'; state.video = null; if (!resume) persist();
  setMarkup(`<section class="screen"><div class="board-shell complete-board"><h1>Beautiful necklace!</h1><div class="necklace">${state.placed.map((id, i) => `<img src="${asset(id)}" alt="${config.beads[id].name} bead" style="left:${POINTS[i][0]}%;top:${POINTS[i][1]}%">`).join('')}<span class="sparkle sparkle-one" aria-hidden="true"></span><span class="sparkle sparkle-two" aria-hidden="true"></span><span class="sparkle sparkle-three" aria-hidden="true"></span></div><button class="wear" data-target="wear" aria-label="Wear it with the fox"><span>Wear it!</span></button><div class="actions complete-actions">${action('again', 'Make another', 'shuffle')}${action('choose', 'Choose pattern', 'back')}</div></div></section>`);
  mountHud({ back: shelf }); root.querySelector('[data-target=wear]') && on(root.querySelector('[data-target=wear]'), () => playVideo('fox-necklace'));
  on(root.querySelector('[data-target=again]'), again); on(root.querySelector('[data-target=choose]'), shelf);
  if (!resume) { say(`cheer-${state.mode}`); celebration = tada({ host: root, rng }); }
  announce('Beautiful necklace complete. Wear it with the fox, make another, or choose a pattern.');
}
function again() { if (state.busy) return; if (state.mode !== 'free') state.round += 1; startMode(state.mode); }
function finishFree() { if (!state.busy && state.mode === 'free' && state.placed.length >= 4) { state.busy = true; complete(); } }
function replaceWithPoster(video, poster, id) { const image = document.createElement('img'); image.className = 'video'; image.src = poster; image.alt = id === 'fox-necklace' ? 'Wooden fox wearing a colorful bead necklace' : 'Cord lined up with the hole of a red wooden bead'; video.replaceWith(image); }
function playVideo(id, { posterOnly = false } = {}) {
  if (state.busy) return;
  state.busy = true;
  const reward = id === 'fox-necklace';
  state.screen = 'mirror'; state.video = id; const poster = `./assets/video/${id}-poster.webp`; const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches; const saveData = Boolean(navigator.connection?.saveData); const staticOnly = posterOnly || reduced || saveData;
  const media = staticOnly ? `<img class="video" src="${poster}" alt="${reward ? 'Wooden fox wearing a colorful bead necklace' : 'Cord lined up with the hole of a red wooden bead'}">` : `<video class="video" playsinline ${muted ? 'muted' : ''} poster="${poster}"><source src="./assets/video/${id}.mp4" type="video/mp4"></video>`;
  setMarkup(`<section class="screen"><div class="mirror"><h1>${reward ? 'Magic mirror' : 'Threading tip'}</h1>${media}<div class="actions mirror-actions">${action('replay', 'Replay')}${reward ? action('another', 'Make another', 'shuffle') : action('return', 'Back to beads', 'back')}</div></div></section>`);
  mountHud({ back: () => reward ? complete({ resume: true }) : board() }); const video = root.querySelector('video'); let fellBack = false;
  const fallback = () => { if (fellBack || !video?.isConnected) return; fellBack = true; replaceWithPoster(video, poster, id); say(reward ? 'wear-cheer' : 'drag-cue'); };
  if (staticOnly) say(reward ? 'wear-cheer' : 'drag-cue');
  else {
    video.addEventListener('error', fallback, { once: true });
    video.querySelector('source')?.addEventListener('error', fallback, { once: true });
    video.play().catch(fallback);
  }
  on(root.querySelector('[data-target=replay]'), replayCurrent);
  if (reward) on(root.querySelector('[data-target=another]'), again);
  else on(root.querySelector('[data-target=return]'), board);
  state.busy = false;
}
function scheduleIdle() { if (state.mode === 'free') return; timers.after(8000, () => { root.querySelector('.slot.current')?.classList.add('pulse'); root.querySelector(`[data-bead="${state.expected}"]`)?.classList.add('rock'); }); timers.after(16000, () => say(patternNudgeKey())); timers.after(26000, () => root.querySelector('[data-target=hint]')?.classList.add('pulse')); }
function persist() { writeProgress(state.mode, { increment: true }); }
function startMode(mode, { force = false } = {}) { if (state.busy && !force) return; const round = state.mode === mode ? state.round : 0; writeProgress(mode); state = { ...freshState(), mode, round, sequence: nextSequence(mode, round) }; board(); say(`intro-${mode}`); }
function setMuted(value = true) { muted = Boolean(value); state.muted = muted; voice.setMuted(muted); sfx.setMuted(muted); root.querySelectorAll('video').forEach((video) => { video.muted = muted; }); return muted; }
function debugCompleteRound() { if (!state.mode) startMode('ab', { force: true }); state.placed = state.mode === 'free' ? Object.keys(config.beads) : [...state.sequence]; complete(); }
function showScreen(name) { if (name === 'shelf') shelf(); else if (name === 'board') { if (!state.mode) startMode('ab', { force: true }); else board(); } else { if (!state.mode) startMode('ab', { force: true }); state.placed = state.mode === 'free' ? Object.keys(config.beads) : [...state.sequence]; complete(); } }

config = await configPromise;
const preload = preloadImages(['./assets/atelier.webp', './assets/workboard.webp', './assets/title.webp', './assets/ui/mode-card.webp', './assets/ui/wear-button.webp', ...Object.values(config.beads).map((b) => `./assets/beads/${b.file}`)]);
const voices = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.lines);
await Promise.all([preload, voices]); kioskDispose = installKioskGuards(); installUnlockOnGesture({ onFirst: () => say('welcome') });
installDebug({ gameId: config.id, ready: Promise.all([preload, voices]), listModes: () => ['ab', 'abc', 'free'], startMode: async (mode) => startMode(mode, { force: true }), getState: () => ({ ...state, muted, expectedBeadId: state.expected, audioLog: voice.getAudioLog() }), tap: async (id) => root.querySelector(`[data-target="${id}"]`)?.click(), mute: setMuted, onSeed: (next) => { rng = next; }, placeExpected: () => attempt(state.expected || Object.keys(config.beads)[0]), placeBead: (id) => attempt(id), finishFree, completeRound: debugCompleteRound, showScreen, playVideo, setRound: (index) => { state.round = Math.max(0, +index || 0); if (state.mode) state.sequence = nextSequence(state.mode, state.round); }, timers, voice, sfx });
shelf();
