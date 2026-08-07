import config from '../config.js';
import { createFreeformBoard } from '../../../shared/js/freeform-board.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import { installKioskGuards, installUnlockOnGesture, unlockAll } from '../../../shared/js/audio-unlock.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { renderModeCards } from '../../../shared/js/mode-select.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { createTexturedStrokeCanvas } from './textured-stroke-canvas.js';
import {
  normalizeArtwork,
  renderArtworkToCanvas,
  downloadArtworkPng,
  createArtworkThumbnail,
} from './artwork-renderer.js';

const mount = document.getElementById('game');
const DRAFT_KEY = 'qlobe-little-artist-draft-v1';
const GALLERY_KEY = 'qlobe-little-artist-gallery-v1';
const MAX_GALLERY = 6;
const MAX_ITEMS = 80;
const MAX_STROKES = 80;
const clone = (value) => JSON.parse(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const now = () => Date.now();
const uid = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.floor(rng() * 0xFFFFFF).toString(36)}`;
const paperById = (id) => config.papers.find((item) => item.id === id);
const materialById = (id) => config.materials.find((item) => item.id === id);
const yarnById = (id) => config.yarns.find((item) => item.id === id);
const modeById = (id) => config.modes.find((item) => item.id === id);
const ideaById = (id) => config.ideas.find((item) => item.id === id);
const resolve = (path) => new URL(`../${String(path || '').replace(/^\.\//, '')}`, import.meta.url).href;

const state = {
  screen: 'splash',
  mode: null,
  promptId: null,
  paperId: config.papers[0]?.id || 'cream',
  family: config.materialFamilies[0]?.id || 'nature',
  tool: 'pieces',
  yarnId: config.yarns[0]?.id || 'sky',
  muted: false,
  seed: 42,
  fast: false,
  exportStatus: 'idle',
  selectedId: null,
  teddyReacted: false,
};

let rng = mulberry32(state.seed);
let artwork = null;
let board = null;
let strokes = null;
let disposers = [];
let trayDrag = null;
let nudge = null;
let confettiDispose = null;
let history = [];
let historyCapture = null;
let applying = false;
let promptDeck = [];
let pendingSplashWelcome = false;

const narrator = createNarrator({
  say: (key, fallback) => voiceClips.say(key, fallback),
  stop: () => voiceClips.stop(),
});

const ready = preloadImages([
  ...config.papers.map((item) => resolve(item.art)),
  ...config.materials.map((item) => resolve(item.art)),
  ...config.yarns.map((item) => resolve(item.art)),
  ...config.modes.map((item) => resolve(item.art)),
]).then(() => voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', config.voice));

installKioskGuards();
installUnlockOnGesture({
  extra: [() => strokes?.unlock?.()],
  onFirst: () => {
    if (!pendingSplashWelcome || state.screen !== 'splash') return;
    pendingSplashWelcome = false;
    say('welcome').then(() => state.screen === 'splash' && say('choose'));
  },
});

function voiceLine(key) { return config.voice[key] || ''; }
function say(key) {
  if (!key) return Promise.resolve();
  return narrator.say(key, voiceLine(key));
}
function currentPromptKey() {
  if (state.mode === 'teddy' && artwork?.promptId) return ideaById(artwork.promptId)?.voiceKey || 'teddy-prompt';
  return modeById(state.mode)?.promptKey || 'welcome';
}
function screenVoiceKey() {
  if (state.screen === 'gallery') return 'gallery';
  if (state.screen === 'splash') return 'welcome';
  return currentPromptKey();
}
function soundFeedback(event, kind = 'tick') {
  event?.preventDefault?.();
  unlockAll([() => strokes?.unlock?.()]);
  if (!state.muted) sfx[kind]?.();
}

function disposeScreen() {
  trayDrag?.cancel?.();
  trayDrag = null;
  nudge?.stop();
  nudge = null;
  confettiDispose?.();
  confettiDispose = null;
  board?.destroy();
  board = null;
  strokes?.destroy?.();
  strokes = null;
  for (const dispose of disposers.splice(0)) dispose();
  narrator.stop();
  state.selectedId = null;
}

function freshArtwork(modeId, promptId = null) {
  const stamp = now();
  return {
    format: 'qlobe-little-artist', formatVersion: 1,
    id: uid('art'), createdAt: stamp, updatedAt: stamp,
    mode: modeId, promptId, paperId: state.paperId,
    yarn: { format: 'qlobe-textured-strokes', formatVersion: 1, strokes: [] },
    collage: { format: 'qlobe-freeform-board', formatVersion: 1, items: [] },
  };
}

function safeNormalize(raw) {
  if (!raw || typeof raw !== 'object') return null;
  let normalized = raw;
  try { normalized = normalizeArtwork(raw, config) || raw; } catch { /* local validation below is the fallback */ }
  if (normalized?.format !== 'qlobe-little-artist' || Number(normalized.formatVersion) !== 1) return null;
  if (!modeById(normalized.mode) || !paperById(normalized.paperId)) return null;
  const itemList = Array.isArray(normalized.collage?.items) ? normalized.collage.items : [];
  const strokeList = Array.isArray(normalized.yarn?.strokes) ? normalized.yarn.strokes : [];
  const items = itemList.filter((item) => materialById(item?.meta?.assetId || item?.kind)).slice(0, MAX_ITEMS).map((item, index) => {
    const assetId = item.meta?.assetId || item.kind;
    const material = materialById(assetId);
    return {
      id: typeof item.id === 'string' ? item.id.slice(0, 100) : `restored-${index}`,
      kind: assetId, src: material.art, alt: material.title,
      x: clamp(Number(item.x) || .5, -.08, 1.08), y: clamp(Number(item.y) || .5, -.08, 1.08),
      size: clamp(Number(item.size) || material.size || .2, .08, .55),
      rotation: clamp(Number(item.rotation) || 0, -180, 180), mirror: !!item.mirror,
      z: clamp(Number(item.z) || index + 10, 1, 999), meta: { assetId },
    };
  });
  const strokesList = strokeList.filter((stroke) => yarnById(stroke?.textureId || stroke?.colorId || stroke?.yarnId || stroke?.meta?.yarnId)).slice(0, MAX_STROKES);
  return {
    format: 'qlobe-little-artist', formatVersion: 1,
    id: String(normalized.id || uid('art')).slice(0, 120),
    createdAt: String(normalized.createdAt || now()), updatedAt: String(normalized.updatedAt || now()),
    mode: normalized.mode,
    promptId: normalized.mode === 'teddy' && ideaById(normalized.promptId) ? normalized.promptId : null,
    paperId: normalized.paperId,
    yarn: { format: 'qlobe-textured-strokes', formatVersion: 1, strokes: clone(strokesList) },
    collage: { format: 'qlobe-freeform-board', formatVersion: 1, items },
  };
}

function storageGet(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
function loadDraft() { return safeNormalize(storageGet(DRAFT_KEY)); }
function saveDraft() {
  if (!artwork) return false;
  artwork.updatedAt = now();
  return storageSet(DRAFT_KEY, artwork);
}
function loadGallery() {
  const saved = storageGet(GALLERY_KEY);
  return (Array.isArray(saved) ? saved : []).map(safeNormalize).filter(Boolean).slice(-MAX_GALLERY);
}
function saveGallery(items) { return storageSet(GALLERY_KEY, items.slice(-MAX_GALLERY)); }
function saveFinished(doc = artwork) {
  if (!doc) return false;
  const existing = loadGallery().filter((item) => item.id !== doc.id);
  existing.push(clone(doc));
  return saveGallery(existing);
}

function snapshotArtwork() {
  if (!artwork) return null;
  const next = clone(artwork);
  if (board) next.collage = board.snapshot();
  if (strokes) next.yarn = strokes.snapshot();
  return safeNormalize(next) || next;
}
function remember(before = snapshotArtwork()) {
  if (!before || applying) return;
  history.push(clone(before));
  if (history.length > 50) history.shift();
}
function captureBeforeChange() { historyCapture = snapshotArtwork(); }
function commitChange() {
  if (applying) return;
  if (historyCapture) { remember(historyCapture); historyCapture = null; }
  syncArtwork();
}
function syncArtwork() {
  if (!artwork) return;
  if (board) artwork.collage = board.snapshot();
  if (strokes) artwork.yarn = strokes.snapshot();
  artwork.paperId = state.paperId;
  artwork.updatedAt = now();
  saveDraft();
  updateWorkbench();
}
function loadIntoWorkbench(doc) {
  const clean = safeNormalize(doc);
  if (!clean || !board || !strokes) return false;
  applying = true;
  artwork = clean;
  state.mode = clean.mode;
  state.paperId = clean.paperId;
  state.promptId = clean.promptId;
  board.load(clean.collage);
  strokes.load(clean.yarn);
  applying = false;
  syncArtwork();
  return true;
}
function undo() {
  const previous = history.pop();
  if (!previous || !board || !strokes) return false;
  loadIntoWorkbench(previous);
  if (!state.muted) sfx.unpop();
  return true;
}
function hasContent() {
  const doc = snapshotArtwork() || artwork;
  return Boolean(doc?.collage?.items?.length || doc?.yarn?.strokes?.length);
}

function showSplash({ greet = false } = {}) {
  disposeScreen();
  state.screen = 'splash';
  state.mode = null;
  const draft = loadDraft();
  const resumable = draft && (draft.collage.items.length > 0 || draft.yarn.strokes.length > 0);
  const saved = loadGallery();
  pendingSplashWelcome = !!greet;
  mount.innerHTML = `
    <section class="la-screen la-splash" aria-label="Little Artist home">
      <a class="la-home-button" href="../../" data-target="catalog-home" aria-label="Back to all games"></a>
      <button class="la-sound-button" type="button" data-action="replay" data-target="sound" aria-label="Hear the welcome again"></button>
      <button class="la-mute-button" type="button" data-action="mute" data-target="mute" aria-pressed="${state.muted}" aria-label="${state.muted ? 'Turn sound on' : 'Mute sound'}"></button>
      <img class="la-title-art" src="${resolve(config.theme.title)}" alt="Little Artist" />
      <img class="la-teddy-welcome" src="${resolve(config.art.teddyWelcome)}" alt="Teddy waves from the craft basket" />
      <div class="la-mode-cards" role="list" aria-label="Choose how to make art"></div>
      <div class="la-splash-actions">
        ${resumable ? `<button class="la-resume-card" type="button" data-action="resume" data-target="resume" aria-label="Continue your saved artwork"><span class="la-card-pin" aria-hidden="true"></span><strong>Keep making</strong><small>Your paper is waiting</small></button>` : ''}
        ${saved.length ? `<button class="la-gallery-button" type="button" data-action="gallery" data-target="gallery" aria-label="Open your gallery"><img src="${resolve(config.art.gallery)}" alt="" /><span>Your gallery</span></button>` : ''}
      </div>
  </section>`;
  // The mode cards are the one splash control NOT wired through wireActions()'s
  // generic [data-action] sweep below — renderModeCards() owns their tap path
  // directly (it always attaches its own onTap, so leaving `data-action` on
  // these buttons too would double-wire them). The debug tap() below has the
  // matching fallback for QLOBE_DEBUG.tap('mode-x').
  renderModeCards({
    host: mount.querySelector('.la-mode-cards'),
    modes: config.modes.map(({ icon, ...mode }) => mode),
    skin: false, // .la-mode-card keeps its own pixel-for-pixel look; only the
                 // shared .qk-mode-card touch-floor contract is added (a
                 // no-op — .la-mode-card's own 260px min-height clears it,
                 // and the card's own width is already well above 96px).
    cardClass: (mode) => `la-mode-card la-mode-${mode.id}`,
    showTitle: false, // decorate() builds .la-mode-name + the <small> skill line itself
    art: () => null, // suppress modeCard()'s own auto <img class="qk-mode-art">
                      // from the raw `mode.art` field — decorate() below builds
                      // the real, resolved <img> itself; without this the two
                      // stacked (doubling the picture, breaking the polaroid look).
    decorate(btn, mode) {
      btn.setAttribute('role', 'listitem');
      const img = document.createElement('img');
      img.src = resolve(mode.art);
      img.alt = '';
      btn.append(img);
      const name = document.createElement('span');
      name.className = 'la-mode-name';
      name.textContent = mode.title;
      btn.append(name);
      const skill = document.createElement('small');
      skill.textContent = mode.skill;
      btn.append(skill);
    },
    onPick: (id) => startMode(id),
    feedback: (e) => soundFeedback(e),
  });
  wireActions();
}

function choosePrompt() {
  if (!promptDeck.length) promptDeck = shuffle(config.ideas.map((item) => item.id), rng);
  return promptDeck.shift() || config.ideas[0]?.id || null;
}
async function startMode(id, saved = null) {
  await ready;
  const mode = modeById(id);
  if (!mode) return false;
  state.mode = id;
  state.tool = mode.startTool || 'pieces';
  state.promptId = saved?.promptId || (id === 'teddy' ? choosePrompt() : null);
  artwork = safeNormalize(saved) || freshArtwork(id, state.promptId);
  artwork.mode = id;
  artwork.promptId = state.promptId;
  state.paperId = artwork.paperId;
  state.teddyReacted = false;
  pendingSplashWelcome = false;
  history = [];
  state.exportStatus = 'idle';
  saveDraft();
  renderWorkbench();
  say(currentPromptKey());
  return true;
}
function resumeDraft() {
  const draft = loadDraft();
  if (!draft) return false;
  return startMode(draft.mode, draft).then((ok) => { if (ok) say('resume'); return ok; });
}

function workbenchMarkup() {
  const materials = config.materials.filter((item) => item.family === state.family);
  const selected = board?.getSelected?.() || state.selectedId;
  const idea = state.mode === 'teddy' ? ideaById(artwork?.promptId) : null;
  return `
    <section class="la-screen la-workbench" data-tool="${state.tool}" data-family="${state.family}" aria-label="Little Artist workbench">
      <header class="la-workbench-hud">
        <button class="la-back-button" type="button" data-action="back" data-target="back" aria-label="Back to Little Artist home"></button>
        <button class="la-prompt-button" type="button" data-action="replay" data-target="prompt" aria-label="Hear your art invitation again"><span class="la-prompt-icon" aria-hidden="true"></span></button>
        <button class="la-mute-button" type="button" data-action="mute" data-target="mute" aria-pressed="${state.muted}" aria-label="${state.muted ? 'Turn sound on' : 'Mute sound'}"></button>
        <button class="la-undo-button" type="button" data-action="undo" data-target="undo" aria-label="Undo your last art move" ${history.length ? '' : 'disabled'}><img src="${resolve(config.art.undo)}" alt="" /></button>
        <button class="la-fresh-button" type="button" data-action="fresh" data-target="fresh" aria-label="Start with fresh paper"><img src="${resolve(config.art.fresh)}" alt="" /></button>
        <button class="la-finish-button ${hasContent() ? 'is-ready' : 'is-waiting'}" type="button" data-action="finish" data-target="finish" aria-label="Finish your artwork" ${hasContent() ? '' : 'aria-disabled="true"'}><img src="${resolve(config.art.finish)}" alt="" /></button>
      </header>
      <main class="la-workbench-plate">
        <div class="la-paper-picker" role="radiogroup" aria-label="Choose your paper">
          ${config.papers.map((paper) => `<button class="la-paper-choice ${paper.id === state.paperId ? 'is-selected' : ''}" type="button" data-action="paper" data-value="${paper.id}" data-target="paper-${paper.id}" role="radio" aria-checked="${paper.id === state.paperId}" aria-label="${paper.title}" style="--paper-swatch:${paper.swatch}"></button>`).join('')}
        </div>
        <div class="la-sheet" id="art-sheet" style="--paper-image:url('${resolve(paperById(state.paperId)?.art)}');--paper-swatch:${paperById(state.paperId)?.swatch || '#fff7e4'}">
          <canvas class="la-yarn-canvas" id="yarn-canvas" aria-label="Draw yarn on your paper"></canvas>
          <div class="la-piece-board" id="piece-board" aria-label="Arrange your craft treasures"></div>
        </div>
        <div class="la-selection-tools ${selected ? 'is-visible' : ''}" id="selection-tools" aria-label="Selected treasure tools">
          <button class="la-transform-button la-turn-button" type="button" data-action="turn" data-target="turn" aria-label="Turn selected treasure"><img src="${resolve(config.art.turn)}" alt="" /></button>
          <button class="la-transform-button la-smaller-button" type="button" data-action="smaller" data-target="smaller" aria-label="Make selected treasure smaller"><img src="${resolve(config.art.smaller)}" alt="" /></button>
          <button class="la-transform-button la-bigger-button" type="button" data-action="bigger" data-target="bigger" aria-label="Make selected treasure bigger"><img src="${resolve(config.art.bigger)}" alt="" /></button>
          <button class="la-transform-button la-recycle-button" type="button" data-action="recycle" data-target="recycle" aria-label="Recycle selected treasure"><img src="${resolve(config.art.recycle)}" alt="" /></button>
        </div>
        ${idea ? `<aside class="la-idea-card" aria-label="Teddy's little idea">
          <span class="la-idea-card-label">Teddy's idea</span>
          <div class="la-idea-sprites" aria-hidden="true">${idea.pieces.map((piece) => {
            const material = materialById(piece.assetId);
            return material ? `<img class="la-idea-piece" src="${resolve(material.art)}" alt="" style="left:${piece.x * 100}%;top:${piece.y * 100}%;width:${piece.size * 100}%;transform:translate(-50%,-50%) rotate(${piece.rotation || 0}deg)" />` : '';
          }).join('')}</div>
        </aside>` : ''}
        <img class="la-teddy-peek" src="${resolve(config.art.teddyPeek)}" alt="Teddy peeks beside your paper" />
      </main>
      <footer class="la-craft-basket" aria-label="Craft Basket">
        <img class="la-basket-art" src="${resolve(config.art.basket)}" alt="" />
        <div class="la-basket-tabs" role="tablist" aria-label="Material families">
          ${config.materialFamilies.map((family) => {
            const representative = materialById(family.representative);
            return `<button class="la-family-tab ${family.id === state.family ? 'is-selected' : ''}" type="button" role="tab" aria-selected="${family.id === state.family}" data-action="family" data-value="${family.id}" data-target="family-${family.id}"><img src="${resolve(representative?.art)}" alt="" /><span>${family.title}</span></button>`;
          }).join('')}
          <button class="la-yarn-tab ${state.tool === 'yarn' ? 'is-selected' : ''}" type="button" data-action="tool" data-value="yarn" data-target="tool-yarn" aria-pressed="${state.tool === 'yarn'}"><img src="${resolve(config.yarns[0]?.art)}" alt="" /><span>Yarn</span></button>
        </div>
        <div class="la-tray-row">
          <button class="la-tray-page la-tray-prev" type="button" data-action="tray-page" data-value="-1" data-target="tray-prev" aria-label="See earlier treasures"></button>
          <div class="la-material-tray" id="material-tray" aria-label="Tap or drag a treasure onto the paper">
            ${materials.map((item) => `<button class="la-material-choice" type="button" data-action="material" data-value="${item.id}" data-asset-id="${item.id}" data-target="material-${item.id}" aria-label="Add ${item.title}"><img src="${resolve(item.art)}" alt="" /></button>`).join('')}
          </div>
          <button class="la-tray-page la-tray-next" type="button" data-action="tray-page" data-value="1" data-target="tray-next" aria-label="See more treasures"></button>
        </div>
        <div class="la-yarn-spools" role="radiogroup" aria-label="Choose a yarn color">
          ${config.yarns.map((yarn) => `<button class="la-yarn-spool ${yarn.id === state.yarnId ? 'is-selected' : ''}" type="button" data-action="yarn" data-value="${yarn.id}" data-target="yarn-${yarn.id}" role="radio" aria-checked="${yarn.id === state.yarnId}" aria-label="${yarn.title}"><img src="${resolve(yarn.art)}" alt="" /></button>`).join('')}
        </div>
      </footer>
    </section>`;
}

function renderWorkbench() {
  disposeScreen();
  state.screen = 'workbench';
  mount.innerHTML = workbenchMarkup();
  const yarnCanvas = mount.querySelector('#yarn-canvas');
  strokes = createTexturedStrokeCanvas(yarnCanvas, {
    textures: config.yarns.map((yarn) => ({ id: yarn.id, art: resolve(yarn.art) })),
    initialTextureId: state.yarnId,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    onChange: () => commitChange(),
    onStrokeStart: () => { captureBeforeChange(); nudge?.poke(); },
    onStrokeEnd: () => { if (!state.muted) sfx.whoosh(); reactTeddy(); },
  });
  board = createFreeformBoard(mount.querySelector('#piece-board'), {
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    onGrab: () => { captureBeforeChange(); state.selectedId = board?.getSelected?.() || null; updateWorkbench(); },
    onSelect: (item) => { state.selectedId = item?.id || null; updateSelectionTools(); },
    onChange: () => commitChange(),
    onDrop: (_item, info) => {
      if (!info.moved) historyCapture = null;
      if (info.moved && !state.muted) sfx.pop();
    },
  });
  applying = true;
  board.load(artwork.collage);
  strokes.load(artwork.yarn);
  strokes.setTexture?.(state.yarnId);
  applying = false;
  updateCreativeLayer();
  wireActions();
  wireTrayDrag(mount.querySelector('#material-tray'));
  nudge = createNudger({
    first: state.fast ? 300 : 9000, repeat: state.fast ? 300 : 12000,
    onNudge: () => { if (state.screen === 'workbench') say(hasContent() ? 'finish-ready' : 'empty'); },
  });
  nudge.arm();
  updateWorkbench();
}

function updateSelectionTools() {
  const tools = mount.querySelector('#selection-tools');
  const selected = board?.getSelected?.();
  state.selectedId = selected || null;
  tools?.classList.toggle('is-visible', !!selected);
}
function updateWorkbench() {
  if (state.screen !== 'workbench') return;
  const finish = mount.querySelector('[data-target="finish"]');
  const undoButton = mount.querySelector('[data-target="undo"]');
  const readyToFinish = hasContent();
  finish?.classList.toggle('is-ready', readyToFinish);
  finish?.classList.toggle('is-waiting', !readyToFinish);
  if (finish) finish.disabled = !readyToFinish;
  if (undoButton) undoButton.disabled = !history.length;
  updateSelectionTools();
}
function updateCreativeLayer() {
  const canvas = mount.querySelector('#yarn-canvas');
  if (canvas) canvas.style.pointerEvents = state.tool === 'yarn' ? 'auto' : 'none';
}

function addPiece(assetId, x = null, y = null) {
  const material = materialById(assetId);
  if (!material || !board || !artwork) return false;
  captureBeforeChange();
  const count = board.getItems().length;
  const stagger = ((count % 5) - 2) * .035;
  const piece = board.add({
    id: uid('piece'), kind: material.id, src: material.art, alt: material.title,
    x: x == null ? .5 + stagger : clamp(Number(x), -.08, 1.08),
    y: y == null ? .49 + stagger : clamp(Number(y), -.08, 1.08),
    size: material.size, rotation: Math.round((rng() - .5) * 18), meta: { assetId: material.id },
  });
  if (!piece) { historyCapture = null; return false; }
  if (!state.muted) sfx.pop();
  reactTeddy();
  nudge?.poke();
  return piece;
}
function transformSelected(changes) {
  const id = board?.getSelected?.();
  if (!id) return false;
  captureBeforeChange();
  const ok = board.transform(id, changes);
  if (ok && !state.muted) sfx.tick();
  return ok;
}
function recycleSelected() {
  const id = board?.getSelected?.();
  if (!id) return false;
  captureBeforeChange();
  const ok = board.remove(id);
  if (ok && !state.muted) sfx.unpop();
  return ok;
}
function setPaper(id) {
  if (!paperById(id) || id === state.paperId) return false;
  remember(snapshotArtwork());
  state.paperId = id;
  artwork.paperId = id;
  renderWorkbench();
  return true;
}
function setFamily(id) {
  if (!config.materialFamilies.some((family) => family.id === id)) return false;
  state.family = id;
  state.tool = 'pieces';
  renderWorkbench();
  return true;
}
function setYarn(id) {
  if (!yarnById(id)) return false;
  state.yarnId = id;
  state.tool = 'yarn';
  strokes?.setTexture?.(id);
  mount.querySelector('.la-workbench')?.setAttribute('data-tool', 'yarn');
  updateCreativeLayer();
  mount.querySelectorAll('.la-yarn-spool').forEach((el) => {
    const selected = el.dataset.value === id;
    el.classList.toggle('is-selected', selected);
    el.setAttribute('aria-checked', String(selected));
  });
  if (!state.muted) sfx.tick();
  return true;
}
function setTool(tool) {
  state.tool = tool === 'yarn' ? 'yarn' : 'pieces';
  mount.querySelector('.la-workbench')?.setAttribute('data-tool', state.tool);
  updateCreativeLayer();
  return true;
}
function freshPaper() {
  if (!artwork || !board || !strokes) return false;
  remember(snapshotArtwork());
  applying = true;
  board.clear({ record: false, emitChange: false });
  strokes.clear?.();
  applying = false;
  syncArtwork();
  say('fresh');
  return true;
}


function wireTrayDrag(tray) {
  if (!tray) return;
  const onDown = (event) => {
    const choice = event.target.closest('.la-material-choice');
    const material = materialById(choice?.dataset.assetId);
    if (!choice || !material || trayDrag || event.isPrimary === false) return;
    event.preventDefault();
    soundFeedback(event, 'tick');
    const start = { x: event.clientX, y: event.clientY, scroll: tray.scrollLeft };
    let drag = false;
    let scroll = false;
    let ghost = null;
    const cleanup = () => {
      ghost?.remove(); choice.classList.remove('is-grabbed'); choice.removeAttribute('aria-grabbed');
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel); window.removeEventListener('blur', cancel); trayDrag = null;
    };
    const finish = (release) => {
      if (!trayDrag || release.pointerId !== event.pointerId) return;
      release.preventDefault();
      const sheet = mount.querySelector('#art-sheet');
      if (drag && sheet && pointInside(sheet.getBoundingClientRect(), release.clientX, release.clientY)) {
        const rect = sheet.getBoundingClientRect();
        addPiece(material.id, (release.clientX - rect.left) / rect.width, (release.clientY - rect.top) / rect.height);
      }
      cleanup();
    };
    const cancel = (release) => { if (!release || release.pointerId === event.pointerId) cleanup(); };
    const move = (moveEvent) => {
      if (moveEvent.pointerId !== event.pointerId) return;
      moveEvent.preventDefault();
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!drag && !scroll && Math.hypot(dx, dy) > 8) {
        if (Math.abs(dx) > Math.abs(dy) * 1.15) scroll = true;
        else {
          drag = true; choice.classList.add('is-grabbed'); choice.setAttribute('aria-grabbed', 'true');
          ghost = document.createElement('div'); ghost.className = 'la-tray-drag-ghost';
          ghost.innerHTML = `<img src="${resolve(material.art)}" alt="" />`; document.body.append(ghost);
        }
      }
      if (scroll) { tray.scrollLeft = start.scroll - dx; return; }
      if (ghost) { ghost.style.left = `${moveEvent.clientX}px`; ghost.style.top = `${moveEvent.clientY}px`; }
    };
    trayDrag = { cancel };
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', finish, { passive: false });
    window.addEventListener('pointercancel', cancel, { passive: false }); window.addEventListener('blur', cancel);
  };
  tray.addEventListener('pointerdown', onDown, { passive: false });
  disposers.push(() => tray.removeEventListener('pointerdown', onDown));
}
function pointInside(rect, x, y) { return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom; }
function pageTray(direction) {
  const tray = mount.querySelector('#material-tray');
  if (!tray) return false;
  tray.scrollBy({ left: Number(direction) * tray.clientWidth * .82, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  return true;
}
function reactTeddy() {
  if (state.teddyReacted) return;
  state.teddyReacted = true;
  mount.querySelector('.la-teddy-peek, .la-teddy-welcome')?.classList.add('is-happy');
}

function finishArtwork() {
  if (!hasContent()) { say('empty'); return false; }
  artwork = snapshotArtwork();
  if (!artwork) return false;
  saveDraft();
  const persisted = saveFinished(artwork);
  showReveal(artwork, { celebrate: true, persisted });
  return true;
}
function renderPreview(canvas, doc) {
  if (!canvas || !doc) return;
  return renderArtworkToCanvas(canvas, doc, config).catch(() => null);
}
function showReveal(doc = artwork, { celebrate = false, persisted = true } = {}) {
  disposeScreen();
  const clean = safeNormalize(doc);
  if (!clean) { showSplash(); return; }
  artwork = clean;
  state.screen = 'reveal';
  state.mode = clean.mode;
  state.paperId = clean.paperId;
  state.promptId = clean.promptId;
  mount.innerHTML = `
    <section class="la-screen la-reveal" aria-label="Your Little Artist keepsake">
      <button class="la-back-button" type="button" data-action="back" data-target="back" aria-label="Back to Little Artist home"></button>
      <button class="la-prompt-button" type="button" data-action="replay" data-target="prompt" aria-label="Hear your art invitation again"></button>
      <button class="la-mute-button" type="button" data-action="mute" data-target="mute" aria-pressed="${state.muted}" aria-label="${state.muted ? 'Turn sound on' : 'Mute sound'}"></button>
      <main class="la-keepsake-frame"><canvas class="la-keepsake-canvas" id="keepsake-canvas" aria-label="Your finished artwork"></canvas><img class="la-frame-art" src="${resolve(config.art.frame)}" alt="" /></main>
      <img class="la-teddy-celebrate" src="${resolve(config.art.teddyCelebrate)}" alt="Teddy claps for your artwork" />
      <p class="la-saved-device ${persisted ? '' : 'is-temporary'}" role="status">${persisted ? 'Saved on this device' : 'Save a picture to keep it'}</p>
      <div class="la-reveal-actions">
        <button class="la-picture-button" type="button" data-action="save-picture" data-target="save-picture" aria-label="Save a PNG picture"><img src="${resolve(config.art.picture)}" alt="" /><span>Save picture</span></button>
        <button class="la-another-button" type="button" data-action="another" data-target="another" aria-label="Make another artwork">Make another</button>
        <button class="la-gallery-button" type="button" data-action="gallery" data-target="gallery" aria-label="Open your gallery"><img src="${resolve(config.art.gallery)}" alt="" /><span>Your gallery</span></button>
      </div>
    </section>`;
  renderPreview(mount.querySelector('#keepsake-canvas'), clean);
  wireActions();
  if (celebrate) {
    confettiDispose = burstConfetti({ host: mount.querySelector('.la-reveal'), count: 22, rng });
    if (!state.muted) sfx.tada();
    say('done');
  }
}
async function savePicture() {
  if (!artwork) return false;
  state.exportStatus = 'rendering';
  try {
    const downloaded = await downloadArtworkPng(artwork, config, 'little-artist.png');
    if (!downloaded) throw new Error('PNG export unavailable');
    state.exportStatus = 'saved';
    say('saved');
    return true;
  } catch {
    state.exportStatus = 'failed';
    return false;
  }
}
function makeAnother() { return startMode(state.mode || 'collage'); }

async function showGallery() {
  disposeScreen();
  state.screen = 'gallery';
  const saved = loadGallery();
  mount.innerHTML = `
    <section class="la-screen la-gallery" aria-label="Your Little Artist gallery">
      <button class="la-back-button" type="button" data-action="back" data-target="back" aria-label="Back to Little Artist home"></button>
      <button class="la-prompt-button" type="button" data-action="replay" data-target="prompt" aria-label="Hear the gallery message"></button>
      <button class="la-mute-button" type="button" data-action="mute" data-target="mute" aria-pressed="${state.muted}" aria-label="${state.muted ? 'Turn sound on' : 'Mute sound'}"></button>
      <main class="la-gallery-book"><h1>Your gallery</h1><div class="la-gallery-grid" id="gallery-grid">${saved.length ? saved.map((doc, index) => `<button class="la-gallery-artwork" type="button" data-action="open-saved" data-value="${index}" data-target="saved-${index}" aria-label="Open saved artwork ${index + 1}"><span class="la-thumb-slot" data-thumb="${index}"></span><img class="la-gallery-frame" src="${resolve(config.art.frame)}" alt="" /></button>`).join('') : '<p class="la-gallery-empty">Your gallery is ready for its first masterpiece.</p>'}</div></main>
    </section>`;
  wireActions();
  const grid = mount.querySelector('#gallery-grid');
  for (const [index, doc] of saved.entries()) {
    const slot = grid?.querySelector(`[data-thumb="${index}"]`);
    if (!slot) continue;
    const canvas = document.createElement('canvas');
    canvas.className = 'la-gallery-canvas'; canvas.width = 360; canvas.height = 270;
    slot.append(canvas);
    try { await createArtworkThumbnail(canvas, doc, config); } catch { renderPreview(canvas, doc); }
    if (state.screen !== 'gallery') return;
  }
  say(saved.length ? 'gallery' : 'gallery-empty');
}
function openSaved(index) {
  const doc = loadGallery()[Number(index)];
  if (!doc) return false;
  showReveal(doc);
  return true;
}

function toggleMute() {
  state.muted = !state.muted;
  narrator.setMuted(state.muted);
  voiceClips.setMuted(state.muted);
  mount.querySelectorAll('[data-target="mute"]').forEach((button) => {
    button.setAttribute('aria-pressed', String(state.muted));
    button.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Mute sound');
  });
  if (!state.muted) { unlockAll([() => strokes?.unlock?.()]); say(screenVoiceKey()); }
  return state.muted;
}

function wireActions() {
  mount.querySelectorAll('[data-action]').forEach((element) => {
    const dispose = onTap(element, () => {
      const action = element.dataset.action;
      const value = element.dataset.value;
      route(action, value);
    }, { feedback: (event) => soundFeedback(event) });
    disposers.push(dispose);
  });
}
function route(action, value) {
  if (action === 'start-mode') return startMode(value);
  if (action === 'resume') return resumeDraft();
  if (action === 'back') return showSplash();
  if (action === 'gallery') return showGallery();
  if (action === 'open-saved') return openSaved(value);
  if (action === 'replay') return say(screenVoiceKey());
  if (action === 'mute') return toggleMute();
  if (action === 'family') return setFamily(value);
  if (action === 'material') return addPiece(value);
  if (action === 'tool') return setTool(value);
  if (action === 'yarn') return setYarn(value);
  if (action === 'paper') return setPaper(value);
  if (action === 'tray-page') return pageTray(value);
  if (action === 'undo') return undo();
  if (action === 'fresh') return freshPaper();
  if (action === 'turn') return transformSelected({ rotation: ((board?.getItems().find((item) => item.id === board?.getSelected?.())?.rotation || 0) + 45) });
  if (action === 'smaller') { const item = board?.getItems().find((candidate) => candidate.id === board?.getSelected?.()); return item && transformSelected({ size: item.size - .05 }); }
  if (action === 'bigger') { const item = board?.getItems().find((candidate) => candidate.id === board?.getSelected?.()); return item && transformSelected({ size: item.size + .05 }); }
  if (action === 'recycle') return recycleSelected();
  if (action === 'finish') return finishArtwork();
  if (action === 'save-picture') return savePicture();
  if (action === 'another') return makeAnother();
  return false;
}

function debugState() {
  const doc = snapshotArtwork() || artwork;
  return {
    screen: state.screen, mode: state.mode, prompt: state.promptId, paper: state.paperId,
    strokes: doc?.yarn?.strokes?.length || 0, items: doc?.collage?.items?.length || 0,
    selection: board?.getSelected?.() || null, draft: !!loadDraft(), drafts: loadDraft() ? 1 : 0,
    saves: loadGallery().length, export: state.exportStatus, muted: state.muted,
    awaitingInput: ['splash', 'workbench', 'reveal', 'gallery'].includes(state.screen),
  };
}
function debugDrawYarn(points, colorId = state.yarnId) {
  if (state.screen !== 'workbench' || !Array.isArray(points) || points.length < 2 || !yarnById(colorId)) return false;
  const normalized = points.map((point) => ({ x: clamp(Number(point.x), 0, 1), y: clamp(Number(point.y), 0, 1) }));
  const before = snapshotArtwork();
  const result = strokes?.debugStroke?.(normalized, colorId);
  if (!result) return false;
  remember(before); syncArtwork(); return true;
}
function debugAddPiece(assetId, x, y) { return !!addPiece(assetId, x, y); }
function debugMovePiece(id, x, y) { if (!board?.getItems().some((item) => item.id === id)) return false; captureBeforeChange(); return board.move(id, x, y); }
function debugTransformPiece(id, changes) { if (!board?.getItems().some((item) => item.id === id)) return false; captureBeforeChange(); return board.transform(id, changes); }
function loadArtwork(doc) {
  const clean = safeNormalize(doc);
  if (!clean) return false;
  if (state.screen === 'workbench') { remember(snapshotArtwork()); return loadIntoWorkbench(clean); }
  return startMode(clean.mode, clean);
}
function clearSaved() {
  try { localStorage.removeItem(DRAFT_KEY); localStorage.removeItem(GALLERY_KEY); } catch { /* memory state remains usable */ }
  return true;
}
async function winRound() {
  if (state.screen !== 'workbench' || !artwork) await startMode(config.modes[0]?.id || 'collage');
  if (!hasContent()) addPiece(config.materials[0]?.id);
  return finishArtwork();
}

installDebug({
  gameId: config.id, engine: 'little-artist-mixed-media', ready,
  listModes: () => config.modes.map(({ id, title }) => ({ id, title })),
  startMode,
  getState: debugState,
  tap: (id) => {
    const target = mount.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
    if (!target || target.disabled) return false;
    // Mode cards are wired directly by renderModeCards(), not the
    // [data-action] sweep, so they carry data-target but no data-action.
    if (target.dataset.action) return route(target.dataset.action, target.dataset.value);
    if (String(id).startsWith('mode-')) return startMode(String(id).slice(5));
    return false;
  },
  drawYarn: debugDrawYarn, addPiece: debugAddPiece, movePiece: debugMovePiece, transformPiece: debugTransformPiece,
  snapshot: () => snapshotArtwork(), loadArtwork, finishArtwork, savePicture,
  winRound,
  getAudioLog: voiceClips.getAudioLog,
  clearSaved,
  mute: (on = true) => { const desired = !!on; if (state.muted !== desired) toggleMute(); return state.muted; },
  fastTimers: (scale = .05) => {
    const value = Number(scale);
    const multiplier = Math.min(1, Math.max(.01, Number.isFinite(value) && value > 0 ? (value > 1 ? 1 / value : value) : .05));
    state.fast = multiplier < 1;
    return multiplier;
  },
  onSeed: (next, value) => { rng = next; state.seed = value; promptDeck = []; },
  home: () => showSplash(),
});

showSplash({ greet: true });
