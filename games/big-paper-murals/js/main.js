import config from '../config.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as speech from '../../../shared/js/speech.js';
import { onTap } from '../../../shared/js/tap.js';
import { createMusicalCanvas } from '../../../shared/js/musical-canvas.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { unlockAll, installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { mulberry32 } from '../../../shared/js/rng.js';

const mount = document.getElementById('game');
const STORAGE_KEY = 'qlobe-big-paper-mural-current-v1';
const GALLERY_KEY = 'qlobe-big-paper-mural-gallery-v1';

const state = {
  screen: 'splash',
  theme: null,
  tool: 'brush',
  color: config.palette[0],
  selectedStamp: null,
  activeArtists: 0,
  muted: false,
  replaying: false,
  fast: false,
  seed: 42,
  exportStatus: 'idle',
};

let rng = mulberry32(42);
let mural = null;
let canvasApi = null;
let canvasNode = null;
let disposers = [];
let idleTimer = 0;
// Separate from idleTimer on purpose: both used to share one variable, so
// clearTimeout(idleTimer) at a stroke start could silently cancel an
// in-flight clear-confirm countdown — clearArmed stayed true and the button's
// "armed" class never reset, leaving the next tap an unconfirmed instant clear.
let clearArmTimer = 0;
let saveTimer = 0;
let clearArmed = false;
let lastClear = null;
const imageCache = new Map();

const narrator = createNarrator({
  say: (_key, text) => speech.speak(text, { rate: .82, pitch: 1.08 }),
  stop: speech.stop,
});

const assetUrls = [
  './assets/title.webp',
  ...config.themes.map((theme) => theme.art).filter(Boolean),
  ...Object.values(config.stamps).map((stamp) => stamp.art),
  ...config.tools.map((tool) => tool.art),
];

const ready = Promise.all(assetUrls.map(preload)).then(() => true);

installKioskGuards();
installUnlockOnGesture({
  extra: [() => canvasApi?.unlock()],
});

function preload(src) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => { imageCache.set(src, image); resolve(image); };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function line(key) {
  return config.voice[key] || '';
}

function say(key) {
  return narrator.say(key, line(key));
}

function feedback(event) {
  event?.preventDefault?.();
  unlockAll([() => canvasApi?.unlock()]);
  if (!state.muted) sfx.tick();
}

function cleanupScreen() {
  clearTimeout(idleTimer);
  clearTimeout(clearArmTimer);
  // Flush rather than drop: a debounced save may still be pending when the
  // child taps back mid-stroke, and losing it would silently undo their last
  // few brushstrokes.
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; saveCurrent(); }
  narrator.stop();
  canvasApi?.destroy();
  canvasApi = null;
  canvasNode = null;
  for (const dispose of disposers) dispose();
  disposers = [];
  state.activeArtists = 0;
  state.replaying = false;
  clearArmed = false;
}

function showSplash({ greet = false } = {}) {
  cleanupScreen();
  state.screen = 'splash';
  state.theme = null;
  const resumable = loadCurrent();
  mount.innerHTML = `
    <section class="screen splash-screen" aria-label="Big Paper Murals theme shelf">
      <a class="qk-hud-btn qk-hud-home qk-hud-top-left" href="../../" data-target="catalog-home"
         aria-label="Back to all games"></a>
      <button class="qk-hud-btn qk-hud-sound qk-hud-top-right" type="button"
              data-action="sound" data-target="sound" aria-label="${state.muted ? 'Turn sound on' : 'Hear the welcome'}"></button>
      <img class="title-art" src="./assets/title.webp" alt="Big Paper Murals" />
      <div class="theme-shelf" role="list" aria-label="Choose a mural paper">
        ${config.themes.slice(0, 3).map((theme) => `
          <button class="theme-card theme-${theme.id}" type="button" role="listitem"
                  data-action="theme" data-value="${theme.id}" data-target="theme-${theme.id}"
                  aria-label="${theme.title}">
            <img src="${theme.art}" alt="" aria-hidden="true" />
            <span>${theme.title}</span>
          </button>`).join('')}
      </div>
      <div class="splash-actions">
        <button class="fresh-paper" type="button" data-action="theme" data-value="blank"
                data-target="theme-blank" aria-label="Start with fresh paper">
          <span class="rainbow-swipe" aria-hidden="true"></span><strong>Fresh Paper</strong>
        </button>
        ${resumable ? `
          <button class="resume-mural" type="button" data-action="resume" data-target="resume"
                  aria-label="Keep painting the last mural">Keep Painting</button>` : ''}
      </div>
      <p class="splash-whisper">Two fingers can paint together.</p>
    </section>`;
  wireActions();
  if (greet) say('welcome');
}

async function startTheme(themeId, saved = null) {
  await ready;
  const theme = config.themes.find((candidate) => candidate.id === themeId);
  if (!theme) return false;
  mural = saved && saved.theme === themeId ? normalizeMural(saved) : freshMural(themeId);
  state.theme = themeId;
  state.tool = 'brush';
  state.color = theme.colors[0];
  state.selectedStamp = theme.stamps[0];
  state.exportStatus = 'idle';
  renderStudio();
  say(theme.promptKey);
  return true;
}

function resumeMural() {
  const saved = loadCurrent();
  if (!saved) return false;
  return startTheme(saved.theme, saved);
}

function freshMural(themeId) {
  return {
    format: 'qlobe-big-paper-mural',
    formatVersion: 1,
    id: `mural-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    theme: themeId,
    painting: { format: 'qlobe-musical-painting', formatVersion: 1, strokes: [] },
    stamps: [],
    history: [],
  };
}

function normalizeMural(value) {
  const theme = config.themes.some(({ id }) => id === value?.theme) ? value.theme : 'blank';
  return {
    format: 'qlobe-big-paper-mural', formatVersion: 1,
    id: String(value?.id || `mural-${Date.now().toString(36)}`),
    createdAt: String(value?.createdAt || new Date().toISOString()),
    updatedAt: String(value?.updatedAt || new Date().toISOString()),
    theme,
    painting: {
      format: 'qlobe-musical-painting', formatVersion: 1,
      strokes: Array.isArray(value?.painting?.strokes) ? value.painting.strokes : [],
    },
    stamps: Array.isArray(value?.stamps) ? value.stamps.filter(validStamp).slice(0, 40) : [],
    history: Array.isArray(value?.history) ? value.history : [],
  };
}

function renderStudio() {
  cleanupScreen();
  state.screen = 'studio';
  const theme = currentTheme();
  mount.innerHTML = `
    <section class="screen studio-screen" data-tool="${state.tool}" data-theme="${theme.id}"
             aria-label="${theme.title} mural studio">
      <header class="studio-bar">
        <button class="qk-hud-btn qk-hud-back" type="button" data-action="back" data-target="back"
                aria-label="Back to mural papers"></button>
        <div class="studio-title"><span>${theme.title}</span><small>Paint together!</small></div>
        <div class="artist-meter" data-target="artist-meter" aria-label="No fingers painting yet">
          <i></i><i></i><span>2</span>
        </div>
        <button class="paper-control undo-control" type="button" data-action="undo" data-target="undo"
                aria-label="Undo the last mark" ${hasContent() ? '' : 'disabled'}>↶</button>
        <button class="paper-control clear-control" type="button" data-action="clear" data-target="clear"
                aria-label="Clear the mural" ${hasContent() ? '' : 'disabled'}>✦</button>
        <button class="qk-hud-btn qk-hud-sound" type="button" data-action="sound" data-target="sound"
                aria-label="${state.muted ? 'Turn sound on' : 'Turn sound off'}"></button>
        <button class="finish-control" type="button" data-action="finish" data-target="finish"
                aria-label="Make the mural come alive"><span>✓</span><strong>Alive!</strong></button>
      </header>
      <div class="mural-workbench">
        <div class="mural-frame">
          <canvas id="mural-canvas" aria-label="Paint on the mural with one or more fingers"></canvas>
          <div class="stamp-layer" aria-label="Tap to place a paper stamp"></div>
          <div class="canvas-hint"><b aria-hidden="true">● ●</b><span>Paint together</span></div>
        </div>
      </div>
      <footer class="studio-dock">
        <div class="tool-tray" role="radiogroup" aria-label="Art tools">
          ${config.tools.map((tool) => `
            <button class="tool-button ${state.tool === tool.id ? 'selected' : ''}" type="button"
                    data-action="tool" data-value="${tool.id}" data-target="tool-${tool.id}"
                    role="radio" aria-checked="${state.tool === tool.id}" aria-label="${tool.title}">
              <img src="${tool.art}" alt="" /><span>${tool.title}</span>
            </button>`).join('')}
        </div>
        <div class="choice-tray color-tray" role="radiogroup" aria-label="Paint colors">
          ${theme.colors.map((color, index) => `
            <button class="color-button ${state.color === color ? 'selected' : ''}" type="button"
                    data-action="color" data-value="${color}" data-target="color-${index}"
                    role="radio" aria-checked="${state.color === color}" aria-label="Paint color ${index + 1}"
                    style="--paint:${color}"></button>`).join('')}
        </div>
        <div class="choice-tray stamp-tray" role="radiogroup" aria-label="Paper stamps">
          ${theme.stamps.map((stampId) => {
            const stamp = config.stamps[stampId];
            return `<button class="stamp-choice ${state.selectedStamp === stampId ? 'selected' : ''}" type="button"
                    data-action="select-stamp" data-value="${stampId}" data-target="stamp-${stampId}"
                    role="radio" aria-checked="${state.selectedStamp === stampId}" aria-label="${stamp.label} stamp">
              <img src="${stamp.art}" alt="" />
            </button>`;
          }).join('')}
        </div>
      </footer>
    </section>`;

  canvasNode = mount.querySelector('#mural-canvas');
  canvasApi = createMusicalCanvas(canvasNode, {
    brush: toolBrush(state.tool),
    color: state.color,
    palette: theme.colors,
    multiTouch: true,
    maxPoints: 4200,
    reducedMotion: reducedMotion(),
    renderBackground: makeBackgroundRenderer(theme),
    onActivePointers: updateArtists,
    onStrokeStart: () => {
      lastClear = null;
      mount.querySelector('.canvas-hint')?.classList.add('hidden');
      clearTimeout(idleTimer);
    },
    onStrokeEnd: () => {
      mural.history.push('stroke');
      mural.painting = canvasApi.snapshot();
      scheduleSave();
      updateStudioControls();
    },
    onChange: (painting) => { mural.painting = painting; },
  });
  canvasApi.load(mural.painting);
  canvasApi.setMuted(state.muted);
  renderStampLayer(false);
  const layer = mount.querySelector('.stamp-layer');
  const onStampDown = (event) => {
    if (state.tool !== 'stamp' || state.replaying) return;
    event.preventDefault();
    const rect = layer.getBoundingClientRect();
    placeStampNormalized(
      (event.clientX - rect.left) / Math.max(1, rect.width),
      (event.clientY - rect.top) / Math.max(1, rect.height),
    );
  };
  layer.addEventListener('pointerdown', onStampDown, { passive: false });
  disposers.push(() => layer.removeEventListener('pointerdown', onStampDown));
  wireActions();
  updateStudioControls();
  idleTimer = setTimeout(() => {
    if (state.screen === 'studio' && !hasContent()) say(state.tool === 'stamp' ? 'stampNudge' : 'paintNudge');
  }, state.fast ? 250 : 6500);
}

function makeBackgroundRenderer(theme) {
  const image = theme.art ? imageCache.get(theme.art) : null;
  return (ctx, width, height) => {
    ctx.fillStyle = '#f7efd9';
    ctx.fillRect(0, 0, width, height);
    if (image?.naturalWidth) {
      const sourceY = Math.round(image.naturalHeight * .22);
      const sourceH = image.naturalHeight - sourceY;
      const scale = Math.max(width / image.naturalWidth, height / sourceH);
      const drawW = image.naturalWidth * scale;
      const drawH = sourceH * scale;
      ctx.save();
      ctx.globalAlpha = theme.id === 'blank' ? 0 : .22;
      ctx.drawImage(image, 0, sourceY, image.naturalWidth, sourceH,
        (width - drawW) / 2, (height - drawH) / 2, drawW, drawH);
      ctx.restore();
    }
    ctx.save();
    ctx.globalAlpha = .065;
    ctx.fillStyle = '#8a6b45';
    const step = Math.max(20, Math.round(Math.min(width, height) / 34));
    for (let y = step; y < height; y += step) {
      for (let x = (y / step % 2) * step * .5; x < width; x += step) ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.restore();
  };
}

function updateArtists(count) {
  state.activeArtists = count;
  const meter = mount.querySelector('.artist-meter');
  if (!meter) return;
  meter.dataset.active = String(Math.min(2, count));
  meter.setAttribute('aria-label', `${count} ${count === 1 ? 'finger' : 'fingers'} painting now`);
}

function selectTool(toolId) {
  if (toolId === 'music') return playMural();
  const tool = config.tools.find(({ id }) => id === toolId);
  if (!tool) return false;
  state.tool = toolId;
  canvasApi?.setBrush(tool.brush || 'ribbon');
  const screen = mount.querySelector('.studio-screen');
  if (screen) screen.dataset.tool = toolId;
  for (const button of mount.querySelectorAll('.tool-button')) {
    const selected = button.dataset.value === toolId;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
  if (toolId === 'stamp') say('stampNudge');
  return true;
}

function selectColor(color) {
  if (!currentTheme().colors.includes(color)) return false;
  state.color = color;
  canvasApi?.setColor(color);
  canvasApi?.previewColor(color);
  for (const button of mount.querySelectorAll('.color-button')) {
    const selected = button.dataset.value === color;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
  return true;
}

function selectStamp(stampId) {
  if (!currentTheme().stamps.includes(stampId)) return false;
  state.selectedStamp = stampId;
  for (const button of mount.querySelectorAll('.stamp-choice')) {
    const selected = button.dataset.value === stampId;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-checked', String(selected));
  }
  canvasApi?.previewColor(config.stamps[stampId].color);
  return true;
}

function placeStampNormalized(x, y, stampId = state.selectedStamp) {
  if (!mural || !config.stamps[stampId] || mural.stamps.length >= 40) return false;
  lastClear = null;
  const stamp = {
    id: `${stampId}-${Date.now().toString(36)}-${mural.stamps.length}`,
    stampId,
    x: round(clamp(x, .07, .93)),
    y: round(clamp(y, .09, .91)),
    scale: round(.16 + rng() * .055),
    rotation: round(-10 + rng() * 20),
  };
  mural.stamps.push(stamp);
  mural.history.push('stamp');
  renderStampLayer(false);
  canvasApi?.previewColor(config.stamps[stampId].color);
  if (!state.muted) sfx.pop();
  saveCurrent();
  updateStudioControls();
  return stamp;
}

function renderStampLayer(interactive) {
  const layer = mount.querySelector('.stamp-layer');
  if (!layer || !mural) return;
  layer.classList.toggle('interactive-stamps', interactive);
  layer.innerHTML = mural.stamps.map((placed, index) => {
    const source = config.stamps[placed.stampId];
    const tag = interactive ? 'button' : 'span';
    const attrs = interactive
      ? `type="button" data-action="play-stamp" data-value="${index}" data-target="living-stamp-${index}" aria-label="Play the ${source.label}"`
      : 'aria-hidden="true"';
    return `<${tag} class="placed-stamp" ${attrs}
      style="--x:${placed.x * 100}%;--y:${placed.y * 100}%;--size:${placed.scale * 100}%;--turn:${placed.rotation}deg">
      <img src="${source.art}" alt="" /></${tag}>`;
  }).join('');
  if (interactive) wireActions(layer);
}

function undoLast() {
  if (!mural?.history.length) {
    if (!lastClear) return false;
    mural = normalizeMural(lastClear);
    lastClear = null;
    renderStudio();
    saveCurrent();
    return true;
  }
  const kind = mural.history.pop();
  if (kind === 'stamp') mural.stamps.pop();
  else canvasApi?.undo();
  mural.painting = canvasApi?.snapshot() || mural.painting;
  renderStampLayer(false);
  saveCurrent();
  updateStudioControls();
  return true;
}

function clearMural() {
  if (!hasContent()) return false;
  if (!clearArmed) {
    clearArmed = true;
    mount.querySelector('[data-target="clear"]')?.classList.add('armed');
    clearArmTimer = setTimeout(() => {
      clearArmed = false;
      mount.querySelector('[data-target="clear"]')?.classList.remove('armed');
    }, state.fast ? 180 : 2400);
    return true;
  }
  clearArmed = false;
  lastClear = snapshotMural();
  canvasApi?.clear();
  mural.painting = canvasApi?.snapshot() || mural.painting;
  mural.stamps = [];
  mural.history = [];
  renderStampLayer(false);
  saveCurrent();
  updateStudioControls();
  say('fresh');
  return true;
}

async function playMural() {
  if (state.replaying || !hasContent()) {
    if (!hasContent()) say('finishNudge');
    return false;
  }
  state.replaying = true;
  mount.querySelector('.screen')?.classList.add('is-replaying');
  say('music');
  const stampPromise = animateStamps();
  const paintPromise = canvasApi?.hasStrokes()
    ? canvasApi.replay({ speed: state.fast ? 12 : 1 })
    : Promise.resolve(true);
  await Promise.all([stampPromise, paintPromise]);
  state.replaying = false;
  mount.querySelector('.screen')?.classList.remove('is-replaying');
  return true;
}

async function animateStamps() {
  const nodes = [...mount.querySelectorAll('.placed-stamp')];
  for (let index = 0; index < nodes.length; index++) {
    if (state.screen !== 'studio' && state.screen !== 'alive') break;
    nodes[index].classList.add('playing');
    canvasApi?.previewColor(config.stamps[mural.stamps[index].stampId].color);
    await wait(state.fast ? 12 : 170);
    nodes[index].classList.remove('playing');
  }
}

function finishMural() {
  if (!hasContent()) {
    say('finishNudge');
    return false;
  }
  mural.painting = canvasApi?.snapshot() || mural.painting;
  saveCurrent(true);
  showAlive();
  return true;
}

function showAlive() {
  cleanupScreen();
  state.screen = 'alive';
  const theme = currentTheme();
  mount.innerHTML = `
    <section class="screen alive-screen" data-theme="${theme.id}" aria-label="Living mural">
      <header class="alive-heading">
        <button class="qk-hud-btn qk-hud-back" type="button" data-action="edit" data-target="edit"
                aria-label="Edit the mural"></button>
        <div><h1>Our mural is alive!</h1><p>Tap the art to make music</p></div>
        <button class="qk-hud-btn qk-hud-sound" type="button" data-action="sound" data-target="sound"
                aria-label="${state.muted ? 'Turn sound on' : 'Turn sound off'}"></button>
      </header>
      <div class="living-stage">
        <div class="mural-frame living-frame">
          <canvas id="mural-canvas" aria-label="The finished musical mural"></canvas>
          <div class="stamp-layer interactive-stamps" aria-label="Playable mural stamps"></div>
          <div class="paper-confetti" aria-hidden="true"></div>
        </div>
      </div>
      <footer class="alive-actions">
        <button class="alive-button play-mural" type="button" data-action="music" data-target="music"
                aria-label="Play the whole mural"><img src="./assets/tools/music.webp" alt="" /><span>Play Mural</span></button>
        <button class="alive-button save-mural" type="button" data-action="save-picture" data-target="save-picture"
                aria-label="Save the mural picture"><span class="download-mark">↓</span><strong>Save Picture</strong></button>
        <button class="alive-button new-mural" type="button" data-action="new" data-target="new"
                aria-label="Make a new mural"><span class="new-paper-mark">＋</span><strong>New Mural</strong></button>
      </footer>
    </section>`;

  canvasNode = mount.querySelector('#mural-canvas');
  canvasApi = createMusicalCanvas(canvasNode, {
    color: state.color,
    palette: theme.colors,
    reducedMotion: reducedMotion(),
    renderBackground: makeBackgroundRenderer(theme),
  });
  canvasApi.load(mural.painting);
  canvasApi.setMuted(state.muted);
  canvasNode.style.pointerEvents = 'none';
  renderStampLayer(true);
  wireActions();
  if (!reducedMotion()) mount.querySelector('.alive-screen')?.classList.add('celebrate');
  say('alive');
}

function playStamp(index) {
  const placed = mural?.stamps[index];
  const node = mount.querySelector(`[data-target="living-stamp-${index}"]`);
  if (!placed || !node) return false;
  node.classList.remove('playing');
  requestAnimationFrame(() => node.classList.add('playing'));
  canvasApi?.previewColor(config.stamps[placed.stampId].color);
  if (!state.muted) sfx.sparkle();
  return true;
}

async function savePicture() {
  if (!canvasNode || !mural) return false;
  state.exportStatus = 'working';
  const output = document.createElement('canvas');
  output.width = 1600;
  output.height = 1200;
  const ctx = output.getContext('2d');
  ctx.drawImage(canvasNode, 0, 0, output.width, output.height);
  for (const placed of mural.stamps) {
    const source = config.stamps[placed.stampId];
    const image = imageCache.get(source.art);
    if (!image?.naturalWidth) continue;
    const size = placed.scale * output.width;
    const aspect = image.naturalHeight / image.naturalWidth;
    ctx.save();
    ctx.translate(placed.x * output.width, placed.y * output.height);
    ctx.rotate(placed.rotation * Math.PI / 180);
    ctx.drawImage(image, -size / 2, -size * aspect / 2, size, size * aspect);
    ctx.restore();
  }
  const blob = await new Promise((resolve) => output.toBlob(resolve, 'image/png'));
  if (!blob) {
    state.exportStatus = 'failed';
    return false;
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `big-paper-mural-${mural.theme}.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1200);
  state.exportStatus = 'saved';
  say('saved');
  return { bytes: blob.size, filename: link.download };
}

function handleAction(action, value) {
  switch (action) {
    case 'theme': return startTheme(value);
    case 'resume': return resumeMural();
    case 'back': return showSplash();
    case 'sound': return toggleSound();
    case 'tool': return selectTool(value);
    case 'color': return selectColor(value);
    case 'select-stamp': return selectStamp(value);
    case 'undo': return undoLast();
    case 'clear': return clearMural();
    case 'finish': return finishMural();
    case 'music': return playMural();
    case 'play-stamp': return playStamp(Number(value));
    case 'save-picture': return savePicture();
    case 'edit': return renderStudio();
    case 'new': return showSplash();
    default: return false;
  }
}

function wireActions(root = mount) {
  for (const element of root.querySelectorAll('[data-action]')) {
    if (element.dataset.wired) continue;
    element.dataset.wired = 'true';
    disposers.push(onTap(element, () => handleAction(element.dataset.action, element.dataset.value), { feedback }));
  }
}

function toggleSound(force) {
  state.muted = typeof force === 'boolean' ? force : !state.muted;
  narrator.setMuted(state.muted);
  canvasApi?.setMuted(state.muted);
  document.body.classList.toggle('muted', state.muted);
  for (const button of mount.querySelectorAll('[data-target="sound"]')) {
    button.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Turn sound off');
  }
  if (!state.muted && state.screen === 'splash') say('welcome');
  return state.muted;
}

function updateStudioControls() {
  const has = hasContent();
  const undo = mount.querySelector('[data-target="undo"]');
  const clear = mount.querySelector('[data-target="clear"]');
  if (undo) undo.disabled = !(has || lastClear);
  if (clear) clear.disabled = !has;
  mount.querySelector('.canvas-hint')?.classList.toggle('hidden', has);
}

function hasContent() {
  return !!(mural && ((mural.painting?.strokes?.length || 0) + mural.stamps.length));
}

function currentTheme() {
  return config.themes.find(({ id }) => id === (mural?.theme || state.theme)) || config.themes.at(-1);
}

function toolBrush(toolId) {
  return config.tools.find(({ id }) => id === toolId)?.brush || 'ribbon';
}

function snapshotMural() {
  if (!mural) return null;
  const snapshot = structuredClone(mural);
  if (canvasApi) snapshot.painting = canvasApi.snapshot();
  return snapshot;
}

// A stroke can end dozens of times a minute, and each save re-serializes the
// WHOLE mural (every painting point plus every stamp) into localStorage.
// Coalesce rapid strokes into one write shortly after the child pauses,
// instead of blocking the main thread on every brush lift. cleanupScreen()
// flushes any pending save immediately so leaving mid-stroke never drops it.
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = 0; saveCurrent(); }, state.fast ? 30 : 900);
}

function saveCurrent(addToGallery = false) {
  if (!mural) return false;
  mural.updatedAt = new Date().toISOString();
  if (canvasApi) mural.painting = canvasApi.snapshot();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mural));
    if (addToGallery) {
      const gallery = loadGallery().filter(({ id }) => id !== mural.id);
      gallery.unshift(snapshotMural());
      localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery.slice(0, 3)));
    }
    return true;
  } catch {
    return false;
  }
}

function loadCurrent() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return value?.format === 'qlobe-big-paper-mural' ? normalizeMural(value) : null;
  } catch {
    return null;
  }
}

function loadGallery() {
  try {
    const value = JSON.parse(localStorage.getItem(GALLERY_KEY));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function clearSaved() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(GALLERY_KEY);
    return true;
  } catch {
    return false;
  }
}

function validStamp(stamp) {
  return stamp && config.stamps[stamp.stampId]
    && Number.isFinite(Number(stamp.x)) && Number.isFinite(Number(stamp.y));
}

function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function debugTap(target) {
  const node = mount.querySelector(`[data-target="${CSS.escape(target)}"]`);
  if (!node) return false;
  node.click();
  return true;
}

installDebug({
  gameId: 'big-paper-murals',
  engine: 'custom-musical-canvas',
  ready,
  root: mount,
  listModes: () => config.themes.map(({ id, title }) => ({ id, title })),
  startMode: (id) => startTheme(id),
  getState: () => ({
    ...state,
    strokes: mural?.painting?.strokes?.length || 0,
    stamps: mural?.stamps?.length || 0,
    savedCount: loadGallery().length,
    hasSaved: !!loadCurrent(),
  }),
  tap: debugTap,
  winRound: () => finishMural(),
  completeRound: () => finishMural(),
  home: () => showSplash(),
  mute: (on = true) => toggleSound(Boolean(on)),
  seed: (value) => {
    state.seed = Number.isFinite(Number(value)) ? Number(value) >>> 0 : 42;
    rng = mulberry32(state.seed);
    return state.seed;
  },
  fastTimers: () => { state.fast = true; return .05; },
  drawStroke: (points) => canvasApi?.debugStroke(points) || false,
  placeStamp: (stampId, x = .5, y = .5) => placeStampNormalized(x, y, stampId || state.selectedStamp),
  finish: () => finishMural(),
  replayMural: () => playMural(),
  savePicture: () => savePicture(),
  loadMural: (value) => {
    mural = normalizeMural(value);
    state.theme = mural.theme;
    renderStudio();
    return true;
  },
  snapshot: () => snapshotMural(),
  clearSaved,
  restoreLastClear: () => {
    if (!lastClear) return false;
    mural = normalizeMural(lastClear);
    lastClear = null;
    renderStudio();
    return true;
  },
});

showSplash();
