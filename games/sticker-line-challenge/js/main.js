import config from '../config.js';
import * as voice from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { hudButton } from '../../../shared/js/hud.js';
import { onTap } from '../../../shared/js/tap.js';
import { createScreens } from '../../../shared/js/screens.js';
import { tada } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTimers } from '../../../shared/js/timers.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createPlayfield } from './playfield.js';

const root = document.getElementById('game');
const status = document.getElementById('game-status');
const timers = createTimers();
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let rng = mulberry32(42);
let buddy = config.buddies[0];
let mode = null;
let roundIdx = 0;
let cheerIdx = 0;
let muted = false;
let starting = false;
let playfield = null;
let nudger = null;

const ASSETS = [
  ['./assets/bg-splash.jpg', 'bgSplash'],
  ['./assets/bg-play.jpg', 'bgPlay'],
  ['./assets/bg-end.jpg', 'bgEnd'],
  ['./assets/page.webp', 'page'],
  ['./assets/title.webp', 'title'],
  ['./assets/cards/wave.webp', 'card-wave'],
  ['./assets/cards/zigzag.webp', 'card-zigzag'],
  ['./assets/cards/loop.webp', 'card-loop'],
  ['./assets/ui/dash.png', 'dash'],
  ['./assets/ui/blob.png', 'blob'],
  ['./assets/ui/banner-green.webp', 'bannerGreen'],
  ['./assets/ui/banner-pink.webp', 'bannerPink'],
];
for (const b of config.buddies) ASSETS.push([b.img, `buddy-${b.id}`]);

const images = {};

const screens = createScreens({ root, splash: 'splash' });

function announce(text) {
  status.textContent = text;
}

function say(key) {
  announce(config.lines[key] ?? key);
  return voice.say(key, config.lines[key] ?? key);
}

function loadImg([src]) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function buildSplash() {
  const tray = document.getElementById('buddy-tray');
  for (const b of config.buddies) {
    const btn = document.createElement('button');
    btn.className = 'buddy-btn' + (b.id === buddy.id ? ' picked' : '');
    btn.dataset.target = '';
    btn.setAttribute('aria-label', `sticker ${b.id}`);
    const img = document.createElement('img');
    img.src = b.img;
    img.alt = '';
    btn.append(img);
    onTap(btn, () => pickBuddy(b, btn), { feedback: true });
    tray.append(btn);
  }
  const row = document.getElementById('card-row');
  for (const m of config.modes) {
    const btn = document.createElement('button');
    btn.className = 'card-btn';
    btn.dataset.target = '';
    btn.setAttribute('aria-label', m.title);
    const img = document.createElement('img');
    img.src = m.card;
    img.alt = '';
    btn.append(img);
    onTap(btn, () => pickMode(m), { feedback: true });
    row.append(btn);
  }
}

function pickBuddy(b, btn) {
  buddy = b;
  sfx.pop();
  for (const el of document.querySelectorAll('.buddy-btn')) el.classList.remove('picked');
  btn.classList.add('picked');
  playfield?.setBuddy(images[`buddy-${b.id}`]);
  say('picked');
}

function pickMode(m) {
  if (starting) return;
  starting = true;
  mode = m;
  roundIdx = 0;
  say(m.promptKey);
  timers.after(1000, () => {
    starting = false;
    startRound();
  });
}

async function startRound() {
  screens.show('play');
  await new Promise((r) => requestAnimationFrame(r));
  if (!playfield) setupPlayfield();
  const round = mode.rounds[roundIdx % mode.rounds.length];
  playfield.setRound(round.points);
  playfield.setBuddy(images[`buddy-${buddy.id}`]);
  buildCounter(round);
  document.getElementById('prompt-text').textContent = mode.title;
  playfield.resize();
  say('round_start');
  nudger.arm();
  nudger.poke();
}

function setupPlayfield() {
  const canvas = document.getElementById('stage');
  playfield = createPlayfield({
    canvas,
    images: {
      page: images.page,
      blob: images.blob,
      dash: images.dash,
      star: images['buddy-star'],
      buddy: images[`buddy-${buddy.id}`],
    },
    tuning: config.tuning,
    rng,
    reducedMotion,
    callbacks: {
      onCheckpoint: (i, passed, total) => {
        sfx.sparkle();
        const star = document.querySelectorAll('#counter img')[passed - 1];
        if (star) star.classList.add('passed');
      },
      onNudge: () => say('nudge'),
      onHalfway: () => say('halfway'),
      onAlmost: () => say('almost'),
      onComplete: (passed, total) => {
        const stars = document.querySelectorAll('#counter img');
        stars.forEach((star, idx) => {
          if (idx < passed) star.classList.add('passed');
        });
        finishRound();
      },
    },
  });
}

function buildCounter(round) {
  const counter = document.getElementById('counter');
  counter.textContent = '';
  const n = round.points.length <= 6 ? round.points.length : 6;
  for (let i = 0; i < n; i++) {
    const img = document.createElement('img');
    img.src = './assets/buddies/star.webp';
    img.alt = '';
    counter.append(img);
  }
}

function finishRound() {
  if (!mode) return;
  sfx.tada();
  say(`cheer_${cheerIdx + 1}`);
  cheerIdx = (cheerIdx + 1) % 3;
  if (!reducedMotion) tada({ host: root, rng });
  roundIdx += 1;
  nudger.stop();
  timers.after(1700, () => {
    screens.show('end');
    say('line_done');
  });
}

function goSplash() {
  screens.show('splash');
  timers.after(400, () => say('pick_line'));
}

function corner(btn, place, parent) {
  btn.classList.add(place);
  parent.append(btn);
  return btn;
}

function wireHud() {
  const home = corner(hudButton('home', () => {
    window.location.href = '../../index.html';
  }), 'qk-hud-top-left', document.querySelector('[data-qk-screen="splash"]'));

  const backPlay = corner(hudButton('back', () => goSplash()), 'qk-hud-top-left', document.querySelector('[data-qk-screen="play"]'));
  const backEnd = corner(hudButton('back', () => goSplash()), 'qk-hud-top-left', document.querySelector('[data-qk-screen="end"]'));

  const sound = corner(hudButton('sound', () => {
    muted = !muted;
    voice.setMuted(muted);
    sfx.setMuted(muted);
    bgm.setMuted(muted);
  }), 'qk-hud-bottom-left', root);
  return { home, backPlay, backEnd, sound };
}

async function boot() {
  buildSplash();
  wireHud();
  installKioskGuards();
  bgm.preload(config.music.track);
  const voices = voice.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.lines);
  const preload = preloadImages(ASSETS.map(([src]) => src));
  await Promise.all(ASSETS.map(async ([src, key]) => {
    images[key] = await loadImg([src]);
  }));
  await Promise.all([voices, preload]);

  nudger = createNudger({
    first: 12000,
    repeat: 12000,
    onNudge: () => playfield?.startDemo(),
  });

  installUnlockOnGesture({
    onFirst: () => {
      bgm.play(config.music.track, { key: 'sticker-line-challenge' });
      bgm.setVolume(config.music.volume);
      say('welcome');
      timers.after(2800, () => say('pick_line'));
    },
  });

  window.addEventListener('resize', () => playfield?.resize());

  installDebug({
    timers,
    voice,
    sfx,
    onSeed: (generator) => {
      rng = generator;
    },
    mute: (on = true) => {
      muted = Boolean(on);
      voice.setMuted(muted);
      sfx.setMuted(muted);
      bgm.setMuted(muted);
      return muted;
    },
    ready: readyPromise,
    listModes: () => config.modes.map((m) => m.id),
    startMode: (id, round = 0) => {
      mode = config.modes.find((m) => m.id === id) || config.modes[0];
      roundIdx = Number(round) || 0;
      return startRound();
    },
    getState: () => ({
      screen: document.querySelector('[data-qk-screen]:not([hidden])')?.dataset.qkScreen,
      mode: mode?.id ?? null,
      round: mode ? roundIdx % mode.rounds.length : null,
      pathId: mode ? mode.rounds[roundIdx % mode.rounds.length].id : null,
      buddy: buddy.id,
      muted,
      ...(playfield?.getState() ?? {}),
    }),
    getTargets: () => [{ id: 'path', kind: 'path', neutral: true }],
    tracePoints: () => playfield?.tracePoints() ?? [],
    trace: tracePath,
    winRound: () => playfield?.winRound(),
    sayLine: (key) => say(key),
  });
}

async function tracePath(points) {
  if (!playfield) throw new Error('start a mode first');
  const rect = playfield.canvas.getBoundingClientRect();
  const seq = points.map(([fx, fy]) => ({
    x: rect.left + fx * rect.width,
    y: rect.top + fy * rect.height,
  }));
  const fire = (type, p) => window.dispatchEvent(new PointerEvent(type, {
    pointerId: 777,
    isPrimary: true,
    clientX: p.x,
    clientY: p.y,
    bubbles: true,
  }));
  fire('pointerdown', seq[0]);
  for (let i = 1; i < seq.length; i++) {
    await timers.wait(16);
    fire('pointermove', seq[i]);
  }
  await timers.wait(80);
  fire('pointerup', seq[seq.length - 1]);
  await timers.wait(120);
  return playfield.getState();
}

const readyPromise = (async () => {
  await boot();
  return true;
})();
