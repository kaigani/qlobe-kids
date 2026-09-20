import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createTimers } from '../../../shared/js/timers.js';
import { tada } from '../../../shared/js/celebrate.js';

const mount = document.getElementById('game');
const ART_ROOT = './assets/art/';
const ART = {
  splash: ART_ROOT + 'splash.jpg',
  sketch: ART_ROOT + 'draw-house.jpg',
  scene: ART_ROOT + 'scene.jpg',
  house: ART_ROOT + 'house.png',
  tree: ART_ROOT + 'tree.png',
  park: ART_ROOT + 'park.png',
  library: ART_ROOT + 'library.png',
  pond: ART_ROOT + 'pond.png',
  shop: ART_ROOT + 'shop.png',
  car: ART_ROOT + 'car.png',
  flowers: ART_ROOT + 'flowers.png',
};
const PLACE_TYPES = ['tree', 'park', 'library', 'pond', 'shop', 'flowers'];
const PLACE_NAMES = {
  tree: 'Tree',
  park: 'Park',
  library: 'Library',
  pond: 'Pond',
  shop: 'Bakery',
  flowers: 'Flowers',
};
const COLORS = ['#e6533f', '#ed8b24', '#f2c229', '#61a744', '#287bc1', '#7650a9'];
const STORAGE_KEY = 'qk-neighborhood-explorer-v1';
const timers = createTimers();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

function freshSave() {
  return {
    houseStrokes: [],
    roadStrokes: [],
    landmarks: [],
    houseReady: false,
    round: 0,
    lastPhase: 'splash',
  };
}

function loadSave() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!parsed || !Array.isArray(parsed.houseStrokes) || !Array.isArray(parsed.roadStrokes)
      || !Array.isArray(parsed.landmarks)) return freshSave();
    const point = (value) => {
      const x = Number(value?.x);
      const y = Number(value?.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
      return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
    };
    const strokes = (values, limit, pointLimit, withColor) => values.slice(-limit).map((stroke) => {
      const safePoints = Array.isArray(stroke?.points)
        ? stroke.points.slice(-pointLimit).map(point).filter(Boolean)
        : [];
      const safe = { points: safePoints };
      if (withColor) safe.color = COLORS.includes(stroke?.color) ? stroke.color : COLORS[0];
      return safe;
    }).filter((stroke) => stroke.points.length);
    const safe = freshSave();
    safe.houseStrokes = strokes(parsed.houseStrokes, 28, 220, true);
    safe.roadStrokes = strokes(parsed.roadStrokes, 12, 260, false)
      .filter((stroke) => stroke.points.length > 1);
    safe.landmarks = parsed.landmarks.slice(-14).map((item) => {
      const type = PLACE_TYPES.includes(item?.type) ? item.type : null;
      const x = Number(item?.x);
      const y = Number(item?.y);
      if (!type || !Number.isFinite(x) || !Number.isFinite(y)) return null;
      return {
        type,
        x: Math.max(.12, Math.min(.88, x)),
        y: Math.max(.24, Math.min(.82, y)),
      };
    }).filter(Boolean);
    safe.houseReady = Boolean(parsed.houseReady);
    safe.round = Number.isFinite(Number(parsed.round)) ? Math.max(0, Math.floor(Number(parsed.round))) : 0;
    safe.lastPhase = ['splash', 'house', 'magic', 'road', 'place', 'finale'].includes(parsed.lastPhase)
      ? parsed.lastPhase : 'splash';
    return safe;
  } catch {
    return freshSave();
  }
}

let saved = loadSave();
let phase = 'splash';
let muted = false;
let selectedType = 'tree';
let activeStroke = null;
let animationFrame = 0;
let animationStarted = 0;
let viewDisposers = [];
let celebrationDispose = null;

function persist() {
  saved.lastPhase = phase;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)); } catch { /* storage is optional */ }
}

function clearView() {
  timers.clearAll();
  viewDisposers.splice(0).forEach((dispose) => {
    try { dispose(); } catch { /* teardown never blocks navigation */ }
  });
  celebrationDispose?.();
  celebrationDispose = null;
  cancelAnimationFrame(animationFrame);
  animationFrame = 0;
  voiceClips.stop();
}

function wire(target, action, feedback = true) {
  const node = typeof target === 'string' ? mount.querySelector(target) : target;
  if (!node) return;
  viewDisposers.push(onTap(node, action, {
    feedback: feedback ? () => { voiceClips.unlock(); sfx.tick(); } : undefined,
  }));
}

function speak(key, text) {
  return voiceClips.say(key, text);
}

function hud(backAction, splash = false) {
  return '<div class="hud">'
    + '<button class="hud-btn hud-left" data-target="' + (splash ? 'catalog-home' : 'back')
    + '" aria-label="' + (splash ? 'QLOBE Kids home' : 'Back') + '">'
    + (splash ? '⌂' : '←') + '</button>'
    + '<button class="hud-btn hud-right" data-target="sound" aria-label="'
    + (muted ? 'Turn sound on' : 'Turn sound off') + '">' + (muted ? '×' : '♪') + '</button>'
    + '</div>';
}

function bindHud(backAction, splash = false) {
  wire('[data-target="' + (splash ? 'catalog-home' : 'back') + '"]', () => {
    if (splash) window.location.href = '../../';
    else backAction();
  });
  wire('[data-target="sound"]', () => setMuted(!muted));
}

function setMuted(on) {
  muted = Boolean(on);
  voiceClips.setMuted(muted);
  sfx.setMuted(muted);
  const button = mount.querySelector('[data-target="sound"]');
  if (button) {
    button.textContent = muted ? '×' : '♪';
    button.setAttribute('aria-label', muted ? 'Turn sound on' : 'Turn sound off');
  }
  return muted;
}

function paperPrompt(eyebrow, title, hint) {
  return '<div class="paper-prompt"><span>' + eyebrow + '</span><h1>' + title
    + '</h1><p>' + hint + '</p></div>';
}

function showSplash() {
  clearView();
  phase = 'splash';
  persist();
  const hasTown = saved.landmarks.length || saved.roadStrokes.length || saved.houseReady;
  mount.innerHTML = '<section class="screen splash-screen">'
    + '<img class="full-art" src="' + ART.splash + '" alt="" />'
    + hud(showSplash, true)
    + '<button class="start-hotspot" data-target="start" aria-label="Start Neighborhood Explorer">'
    + '<span class="visually-hidden">Start</span></button>'
    + (hasTown ? '<button class="saved-town" data-target="saved-town" aria-label="Visit your saved neighborhood">'
      + '<img src="' + ART.house + '" alt="" /><span>My town</span></button>' : '')
    + '</section>';
  bindHud(showSplash, true);
  wire('[data-target="start"]', startFresh);
  if (hasTown) wire('[data-target="saved-town"]', showFinale);
}

function startFresh() {
  const nextRound = saved.round;
  saved = freshSave();
  saved.round = nextRound;
  selectedType = 'tree';
  persist();
  showHouse();
}

function drawStrokes(ctx, strokes, width, height, lineWidth) {
  ctx.clearRect(0, 0, width, height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  strokes.forEach((stroke) => {
    if (!stroke.points || stroke.points.length < 2) return;
    ctx.strokeStyle = stroke.color || COLORS[0];
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    stroke.points.forEach((point, index) => {
      const x = point.x * width;
      const y = point.y * height;
      if (index) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    });
    ctx.stroke();
  });
}

function normalizedPoint(event, node) {
  const rect = node.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
    y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
  };
}

function showHouse() {
  clearView();
  phase = 'house';
  persist();
  mount.innerHTML = '<section class="screen sketch-screen">'
    + '<img class="full-art" src="' + ART.sketch + '" alt="" />'
    + hud(showSplash)
    + '<canvas id="house-canvas" class="house-canvas" width="900" height="620" aria-label="Draw your home"></canvas>'
    + '<div class="crayon-hotspots" aria-label="Crayon colors">'
    + COLORS.map((color, index) => '<button data-color="' + color + '" style="--i:' + index
      + ';--color:' + color + '" aria-label="Choose crayon color ' + (index + 1) + '"></button>').join('')
    + '</div>'
    + '<button class="done-hotspot" data-target="house-done" aria-label="Turn my drawing into a house">'
    + '<span class="visually-hidden">Done</span></button>'
    + '<div class="gesture-hint" aria-hidden="true"><i></i><i></i><i></i></div>'
    + '</section>';
  bindHud(showSplash);
  const canvas = mount.querySelector('#house-canvas');
  const ctx = canvas.getContext('2d');
  drawStrokes(ctx, saved.houseStrokes, canvas.width, canvas.height, 19);
  let activeColor = COLORS[0];
  const palette = [...mount.querySelectorAll('[data-color]')];
  palette[0]?.classList.add('is-selected');
  palette.forEach((button) => wire(button, () => {
    activeColor = button.dataset.color;
    palette.forEach((item) => item.classList.toggle('is-selected', item === button));
    sfx.pop();
  }));
  const begin = (event) => {
    if (event.isPrimary === false) return;
    canvas.setPointerCapture?.(event.pointerId);
    activeStroke = { color: activeColor, points: [normalizedPoint(event, canvas)] };
    saved.houseStrokes.push(activeStroke);
    if (saved.houseStrokes.length > 28) saved.houseStrokes.shift();
  };
  const move = (event) => {
    if (!activeStroke || event.isPrimary === false) return;
    const point = normalizedPoint(event, canvas);
    const last = activeStroke.points.at(-1);
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.008) return;
    activeStroke.points.push(point);
    if (activeStroke.points.length > 220) activeStroke.points.shift();
    drawStrokes(ctx, saved.houseStrokes, canvas.width, canvas.height, 19);
  };
  const finish = () => {
    if (!activeStroke) return;
    activeStroke = null;
    persist();
    mount.querySelector('.gesture-hint')?.classList.add('is-hidden');
  };
  canvas.addEventListener('pointerdown', begin);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  viewDisposers.push(() => {
    canvas.removeEventListener('pointerdown', begin);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', finish);
    canvas.removeEventListener('pointercancel', finish);
  });
  wire('[data-target="house-done"]', showHouseMagic);
  speak('draw-home', 'Draw your home. Any shape you make can become a wonderful house!');
}

function showHouseMagic() {
  clearView();
  phase = 'magic';
  saved.houseReady = true;
  persist();
  mount.innerHTML = '<section class="screen magic-screen">'
    + '<img class="full-art" src="' + ART.scene + '" alt="" />'
    + hud(showHouse)
    + '<div class="magic-rays" aria-hidden="true"></div>'
    + '<img class="magic-house" src="' + ART.house + '" alt="Your watercolor house" />'
    + paperPrompt('YOU MADE IT!', 'Your house!', 'Now let’s draw a road for your neighbors.')
    + '<button class="big-action" data-target="magic-next">Draw a road <b>→</b></button>'
    + '</section>';
  bindHud(showHouse);
  wire('[data-target="magic-next"]', showRoad);
  sfx.sparkle();
  speak('house-magic', 'A little neighborhood magic. Your drawing became a home!');
}

function landmarkMarkup(living = false) {
  return saved.landmarks.map((item, index) => {
    const classes = 'placed-landmark type-' + item.type + (living ? ' is-living' : '');
    return '<img class="' + classes + '" data-landmark-index="' + index + '" src="' + ART[item.type]
      + '" alt="' + PLACE_NAMES[item.type] + '" style="--x:' + item.x + ';--y:' + item.y
      + ';--delay:' + ((index % 5) * 0.18) + 's" />';
  }).join('');
}

function worldStage(mode) {
  const living = mode === 'finale';
  return '<div id="world-stage" class="world-stage mode-' + mode + '">'
    + '<img class="world-art" src="' + ART.scene + '" alt="" />'
    + '<canvas id="road-canvas" width="1200" height="900" aria-label="Your neighborhood roads"></canvas>'
    + '<div class="drawing-glow" aria-hidden="true"></div>'
    + '<img class="world-home' + (living ? ' is-living' : '') + '" src="' + ART.house + '" alt="Your home" />'
    + landmarkMarkup(living)
    + (living ? '<img id="town-car" class="town-car" src="' + ART.car + '" alt="A little car driving through your town" />'
      + '<div class="water-shimmer" aria-hidden="true"></div><div class="fireflies" aria-hidden="true"></div>' : '')
    + '</div>';
}

function paintRoads(canvas) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  saved.roadStrokes.forEach((stroke) => {
    if (!stroke.points?.length) return;
    const trace = () => {
      ctx.beginPath();
      stroke.points.forEach((point, index) => {
        const x = point.x * canvas.width;
        const y = point.y * canvas.height;
        if (index) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      });
      ctx.stroke();
    };
    ctx.setLineDash([]);
    ctx.strokeStyle = '#8c7661';
    ctx.lineWidth = 54;
    trace();
    ctx.strokeStyle = '#d7c3a0';
    ctx.lineWidth = 38;
    trace();
    ctx.setLineDash([18, 24]);
    ctx.strokeStyle = 'rgba(255,250,220,.96)';
    ctx.lineWidth = 5;
    trace();
    ctx.setLineDash([]);
  });
}

function setupRoadDrawing() {
  const canvas = mount.querySelector('#road-canvas');
  paintRoads(canvas);
  const begin = (event) => {
    if (event.isPrimary === false) return;
    canvas.setPointerCapture?.(event.pointerId);
    activeStroke = { points: [normalizedPoint(event, canvas)] };
    saved.roadStrokes.push(activeStroke);
    if (saved.roadStrokes.length > 12) saved.roadStrokes.shift();
    mount.querySelector('.road-nudge')?.classList.add('is-hidden');
  };
  const move = (event) => {
    if (!activeStroke || event.isPrimary === false) return;
    const point = normalizedPoint(event, canvas);
    const last = activeStroke.points.at(-1);
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.009) return;
    activeStroke.points.push(point);
    if (activeStroke.points.length > 260) activeStroke.points.shift();
    paintRoads(canvas);
  };
  const finish = () => {
    if (!activeStroke) return;
    const finishedStroke = activeStroke;
    activeStroke = null;
    if (finishedStroke.points.length < 2) {
      saved.roadStrokes = saved.roadStrokes.filter((stroke) => stroke !== finishedStroke);
      speak('draw-road', 'Draw a wiggly road from your home to somewhere you love.');
    }
    persist();
    sfx.whoosh();
  };
  canvas.addEventListener('pointerdown', begin);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', finish);
  canvas.addEventListener('pointercancel', finish);
  viewDisposers.push(() => {
    canvas.removeEventListener('pointerdown', begin);
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerup', finish);
    canvas.removeEventListener('pointercancel', finish);
  });
}

function showRoad() {
  clearView();
  phase = 'road';
  persist();
  mount.innerHTML = '<section class="screen world-screen">'
    + worldStage('road') + hud(showHouseMagic)
    + paperPrompt('STEP 2', 'Draw a road', 'Wiggle from your house to anywhere!')
    + '<div class="road-nudge" aria-hidden="true"><span></span></div>'
    + '<button class="big-action world-next" data-target="road-done">Add places <b>→</b></button>'
    + '</section>';
  bindHud(showHouseMagic);
  setupRoadDrawing();
  wire('[data-target="road-done"]', showPlace);
  speak('draw-road', 'Draw a wiggly road from your home to somewhere you love.');
}

function renderPlace() {
  clearView();
  phase = 'place';
  persist();
  const dots = [0, 1, 2].map((index) => '<i class="' + (saved.landmarks.length > index ? 'is-full' : '') + '"></i>').join('');
  mount.innerHTML = '<section class="screen world-screen place-screen">'
    + worldStage('place') + hud(showRoad)
    + paperPrompt('STEP 3', 'Fill your neighborhood', 'Pick a place. Tap the grass.')
    + '<div class="place-tray" aria-label="Neighborhood places">'
    + PLACE_TYPES.map((type) => '<button class="place-choice' + (selectedType === type ? ' is-selected' : '')
      + '" data-place="' + type + '" aria-label="Choose ' + PLACE_NAMES[type] + '"><img src="' + ART[type]
      + '" alt="" /><span>' + PLACE_NAMES[type] + '</span></button>').join('')
    + '</div>'
    + '<div class="place-progress" aria-label="' + Math.min(3, saved.landmarks.length) + ' of 3 places">' + dots + '</div>'
    + '<button class="big-action world-next" data-target="place-done" '
    + (saved.landmarks.length < 3 ? 'disabled' : '') + '>Bring it alive <b>★</b></button>'
    + '</section>';
  bindHud(showRoad);
  paintRoads(mount.querySelector('#road-canvas'));
  mount.querySelectorAll('[data-place]').forEach((button) => wire(button, () => {
    selectedType = button.dataset.place;
    mount.querySelectorAll('[data-place]').forEach((item) => item.classList.toggle('is-selected', item === button));
    sfx.pop();
    speak('pick-place', 'Great choice. Tap the grass to put it in your neighborhood.');
  }));
  const stage = mount.querySelector('#world-stage');
  const placeAt = (event) => {
    if (event.target.closest('.hud, .paper-prompt, .place-tray, .big-action')) return;
    const point = normalizedPoint(event, stage);
    const item = {
      type: selectedType,
      x: Math.max(0.12, Math.min(0.88, point.x)),
      y: Math.max(0.24, Math.min(0.82, point.y)),
    };
    saved.landmarks.push(item);
    if (saved.landmarks.length > 14) saved.landmarks.shift();
    persist();
    sfx.sparkle();
    renderPlace();
  };
  stage.addEventListener('pointerup', placeAt);
  viewDisposers.push(() => stage.removeEventListener('pointerup', placeAt));
  wire('[data-target="place-done"]', showFinale);
  if (!saved.landmarks.length) speak('place-intro', 'Choose a special place, then tap the grass. Add at least three!');
}

function showPlace() {
  saved.roadStrokes = saved.roadStrokes.filter((stroke) => stroke.points?.length > 1);
  if (!saved.roadStrokes.length) {
    saved.roadStrokes = [{ points: [
      { x: .48, y: .56 }, { x: .39, y: .64 }, { x: .28, y: .71 }, { x: .16, y: .72 },
    ] }];
  }
  renderPlace();
}

function carRoute() {
  const longest = saved.roadStrokes.reduce((best, stroke) => (
    stroke.points.length > best.length ? stroke.points : best
  ), []);
  return longest.length > 2 ? longest : [
    { x: .16, y: .72 }, { x: .30, y: .67 }, { x: .48, y: .57 },
    { x: .63, y: .66 }, { x: .82, y: .72 },
  ];
}

function startLivingAnimation() {
  const car = mount.querySelector('#town-car');
  const stage = mount.querySelector('#world-stage');
  if (!car || !stage || reduceMotion.matches) return;
  const route = carRoute();
  animationStarted = performance.now();
  const tick = (now) => {
    const duration = 7600;
    const travel = ((now - animationStarted) % duration) / duration;
    const scaled = travel * (route.length - 1);
    const index = Math.min(route.length - 2, Math.floor(scaled));
    const mix = scaled - index;
    const a = route[index];
    const b = route[index + 1];
    const x = a.x + (b.x - a.x) * mix;
    const y = a.y + (b.y - a.y) * mix;
    car.style.left = (x * 100) + '%';
    car.style.top = (y * 100) + '%';
    car.style.transform = 'translate(-50%,-55%) scaleX(' + (b.x < a.x ? -1 : 1) + ')';
    animationFrame = requestAnimationFrame(tick);
  };
  animationFrame = requestAnimationFrame(tick);
}

function showFinale() {
  clearView();
  phase = 'finale';
  saved.houseReady = true;
  if (saved.landmarks.length < 3) {
    const defaults = [
      { type: 'tree', x: .26, y: .50 },
      { type: 'park', x: .72, y: .42 },
      { type: 'pond', x: .72, y: .74 },
    ];
    saved.landmarks.push(...defaults.slice(saved.landmarks.length));
  }
  saved.round += 1;
  persist();
  mount.innerHTML = '<section class="screen world-screen finale-screen">'
    + worldStage('finale') + hud(showSplash)
    + paperPrompt('LOOK WHAT YOU MADE!', 'Our neighborhood!', 'The whole town is waking up.')
    + '<div class="final-actions"><button class="big-action" data-target="again">Make another</button>'
    + '<button class="big-action secondary" data-target="splash">All done</button></div>'
    + '</section>';
  bindHud(showSplash);
  paintRoads(mount.querySelector('#road-canvas'));
  wire('[data-target="again"]', startFresh);
  wire('[data-target="splash"]', showSplash);
  startLivingAnimation();
  celebrationDispose = tada({ host: mount, count: 34, duration: 2800 });
  speak('town-alive', 'Look what you made! Your neighborhood is alive. Every road and place has your story.');
}

function completeHouseForDebug() {
  if (!saved.houseStrokes.length) {
    saved.houseStrokes = [
      { color: COLORS[0], points: [{ x: .2, y: .72 }, { x: .2, y: .36 }, { x: .5, y: .12 }, { x: .8, y: .36 }, { x: .8, y: .72 }, { x: .2, y: .72 }] },
      { color: COLORS[4], points: [{ x: .42, y: .72 }, { x: .42, y: .48 }, { x: .58, y: .48 }, { x: .58, y: .72 }] },
    ];
  }
  saved.houseReady = true;
  persist();
  showRoad();
  return true;
}

function completeRoadForDebug() {
  if (!saved.roadStrokes.length) {
    saved.roadStrokes = [{ points: [
      { x: .49, y: .58 }, { x: .43, y: .64 }, { x: .34, y: .67 },
      { x: .25, y: .74 }, { x: .14, y: .70 },
    ] }];
  }
  persist();
  showPlace();
  return true;
}

function placeForDebug(type = 'tree', x = .25, y = .55) {
  const safeType = PLACE_TYPES.includes(type) ? type : 'tree';
  saved.landmarks.push({ type: safeType, x: Math.max(.12, Math.min(.88, x)), y: Math.max(.24, Math.min(.82, y)) });
  persist();
  if (phase === 'place') renderPlace();
  return saved.landmarks.length;
}

const ready = Promise.all([
  voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', {}),
  preloadImages(Object.values(ART)),
]).then(() => true);

const disposeUnlock = installUnlockOnGesture();
const disposeKiosk = installKioskGuards();
const disposeDebug = installDebug({
  gameId: 'neighborhood-map-walk',
  engine: 'neighborhood-explorer-custom',
  ready,
  timers,
  voice: voiceClips,
  sfx,
  root: mount,
  listModes: () => [{ id: 'build', title: 'Build a Neighborhood', skill: 'draw routes and place familiar landmarks' }],
  startMode: () => {
    startFresh();
    return true;
  },
  getState: () => ({
    screen: phase === 'splash' ? 'splash' : (phase === 'finale' ? 'end' : 'play'),
    phase,
    mode: 'build',
    round: phase === 'finale' ? 1 : 0,
    roundsTotal: 1,
    awaitingInput: !['magic', 'finale'].includes(phase),
    houseStrokeCount: saved.houseStrokes.length,
    roadStrokeCount: saved.roadStrokes.length,
    landmarkCount: saved.landmarks.length,
    landmarkTypes: saved.landmarks.map((item) => item.type),
    houseReady: saved.houseReady,
    muted,
    reducedMotion: reduceMotion.matches,
  }),
  tap(targetId) {
    const node = [...mount.querySelectorAll('[data-target]')].find((item) => item.dataset.target === targetId && item.getClientRects().length);
    if (!node || node.disabled) return false;
    node.click();
    return true;
  },
  winRound() {
    if (phase === 'house' || phase === 'magic') return completeHouseForDebug();
    if (phase === 'road') return completeRoadForDebug();
    if (phase === 'place') {
      while (saved.landmarks.length < 3) {
        const defaults = [
          ['tree', .23, .54], ['park', .74, .42], ['pond', .72, .74],
        ][saved.landmarks.length];
        saved.landmarks.push({ type: defaults[0], x: defaults[1], y: defaults[2] });
      }
      showFinale();
      return true;
    }
    return phase === 'finale';
  },
  home: showSplash,
  mute: setMuted,
  completeHouse: completeHouseForDebug,
  completeRoad: completeRoadForDebug,
  placeLandmark: placeForDebug,
  finishMap: showFinale,
  getAudioLog: voiceClips.getAudioLog,
  clearAudioLog: voiceClips.clearAudioLog,
  resetProgress() {
    saved = freshSave();
    persist();
    showSplash();
    return true;
  },
});

showSplash();

window.addEventListener('pagehide', () => {
  clearView();
  disposeUnlock();
  disposeKiosk();
  disposeDebug();
}, { once: true });
