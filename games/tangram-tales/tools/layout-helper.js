import config from '../config.js';
import { createFreeformBoard } from '../../../shared/js/freeform-board.js';

const referenceCrops = {
  boat: [300, 284, 1055, 1087], fairy: [1512, 421, 728, 749], whale: [2318, 361, 890, 880], rabbit: [3439, 304, 924, 937],
  boy: [562, 1712, 763, 863], girl: [1462, 1665, 896, 964], horse: [2512, 1709, 1051, 883], candle: [3847, 1596, 539, 1127],
  dog: [452, 2877, 913, 775], camel: [1495, 2917, 723, 762], bear: [2442, 2917, 1040, 789], face: [3703, 2863, 834, 950],
  house: [455, 3983, 850, 816], cat: [1442, 3990, 696, 792], duck: [2332, 3906, 960, 944], lion: [3556, 4080, 1110, 739],
};
const pieceById = Object.fromEntries(config.pieces.map((piece) => [piece.id, piece]));
const taleSelect = document.querySelector('#tale');
const stage = document.querySelector('#stage');
const canvas = document.querySelector('#reference');
const context = canvas.getContext('2d');
const output = document.querySelector('#output');
const selectedLabel = document.querySelector('#selected-label');
const title = document.querySelector('#figure-title');
const opacity = document.querySelector('#opacity');
const pieceOpacity = document.querySelector('#piece-opacity');
const draftStatus = document.querySelector('#draft-status');
const pieceSelect = document.querySelector('#piece-select');
const lockSelection = document.querySelector('#lock-selection');
const rotationSlider = document.querySelector('#rotation');
const rotationValue = document.querySelector('#rotation-value');
const sizeSlider = document.querySelector('#size');
const sizeValue = document.querySelector('#size-value');
const flipHorizontal = document.querySelector('#flip-horizontal');
const referenceImage = new Image();
referenceImage.src = '../assets/source/tangrams-reference-user.png';

let board = null;
let selectedId = null;
let selectionLocked = false;
let currentTargets = {};
let drafts = {};
try { drafts = JSON.parse(localStorage.getItem('tangram-layout-helper-drafts')) || {}; } catch { drafts = {}; }

for (const tale of config.tales) {
  const option = document.createElement('option');
  option.value = tale.id;
  option.textContent = tale.title;
  taleSelect.append(option);
}
for (const piece of config.pieces) {
  const option = document.createElement('option');
  option.value = piece.id;
  option.textContent = piece.label;
  pieceSelect.append(option);
}

function round(value) { return Math.round(value * 1000) / 1000; }
function targetsFromSnapshot() {
  return Object.fromEntries((board?.getItems() || []).map((item) => [item.id, {
    x: round(item.x), y: round(item.y), size: round(item.size), rotation: round(item.rotation), mirror: !!item.mirror,
  }]));
}
function refreshOutput() {
  currentTargets = targetsFromSnapshot();
  output.value = JSON.stringify(currentTargets, null, 2);
  refreshPieceControls();
}
function refreshPieceControls() {
  const item = board?.getItems().find((candidate) => candidate.id === selectedId);
  pieceSelect.value = item?.id || '';
  rotationSlider.disabled = !item;
  sizeSlider.disabled = !item;
  const canFlip = item?.id === 'parallelogram';
  flipHorizontal.disabled = !canFlip;
  flipHorizontal.setAttribute('aria-pressed', String(!!item?.mirror));
  if (!item) return;
  rotationSlider.value = String(item.rotation);
  rotationValue.value = `${round(item.rotation)}°`;
  sizeSlider.value = String(item.size);
  sizeValue.value = item.size.toFixed(3);
  refreshSelectionLock();
}
function refreshSelectionLock() {
  document.querySelectorAll('.qlobe-freeform-piece').forEach((element) => {
    const locked = selectionLocked && element.dataset.freeformId !== selectedId;
    element.classList.toggle('is-selection-locked', locked);
    element.setAttribute('aria-disabled', String(locked));
  });
}
function synchronizedSizeIds(id) {
  if (id === 'large-a' || id === 'large-b') return ['large-a', 'large-b'];
  if (id === 'small-a' || id === 'small-b') return ['small-a', 'small-b'];
  return [id];
}
function setSelectedSize(size) {
  if (!selectedId) return;
  const ids = new Set(synchronizedSizeIds(selectedId));
  for (const id of ids) board.transform(id, { size }, { record: false });
}
function drawReference() {
  if (!referenceImage.complete) return;
  const [sx, sy, sw, sh] = referenceCrops[taleSelect.value];
  const scale = Math.min(canvas.width / sw, canvas.height / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalAlpha = Number(opacity.value);
  context.drawImage(referenceImage, sx, sy, sw, sh, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  context.globalAlpha = 1;
}
function createBoard(tale, targets = tale.targets) {
  board?.destroy();
  selectedId = null;
  board = createFreeformBoard(document.querySelector('#board'), {
    onChange: refreshOutput,
    onSelect(item) {
      selectedId = item?.id || null;
      selectedLabel.textContent = item ? pieceById[item.id].label : 'Select a piece on the board.';
      refreshPieceControls();
      refreshSelectionLock();
    },
  });
  for (const [id, target] of Object.entries(targets)) {
    const piece = pieceById[id];
    board.add({ id, ...target, kind: piece.shape, src: `../${piece.art.replace('./', '')}`, alt: piece.label }, { record: false, emitChange: false });
  }
  refreshOutput();
}
function loadTale(id) {
  const tale = config.tales.find((candidate) => candidate.id === id) || config.tales[0];
  taleSelect.value = tale.id;
  title.textContent = tale.title;
  createBoard(tale, drafts[tale.id] || tale.targets);
  draftStatus.textContent = drafts[tale.id] ? 'Using your saved browser draft.' : 'Using committed targets.';
  drawReference();
  const url = new URL(location.href);
  url.searchParams.set('tale', tale.id);
  history.replaceState(null, '', url);
}
function adjacent(delta) {
  const current = config.tales.findIndex((tale) => tale.id === taleSelect.value);
  loadTale(config.tales[(current + delta + config.tales.length) % config.tales.length].id);
}
function transformSelected(changes) {
  if (!selectedId) return;
  const item = board.getItems().find((candidate) => candidate.id === selectedId);
  if (!item) return;
  board.transform(selectedId, typeof changes === 'function' ? changes(item) : changes);
}

document.querySelector('#previous').addEventListener('click', () => adjacent(-1));
document.querySelector('#next').addEventListener('click', () => adjacent(1));
taleSelect.addEventListener('change', () => loadTale(taleSelect.value));
pieceSelect.addEventListener('change', () => {
  if (pieceSelect.value) board?.select(pieceSelect.value);
});
lockSelection.addEventListener('change', () => {
  selectionLocked = lockSelection.checked;
  refreshSelectionLock();
});
opacity.addEventListener('input', drawReference);
pieceOpacity.addEventListener('input', () => stage.style.setProperty('--piece-opacity', pieceOpacity.value));
referenceImage.addEventListener('load', drawReference);
document.querySelector('#save').addEventListener('click', () => {
  drafts[taleSelect.value] = targetsFromSnapshot();
  try { localStorage.setItem('tangram-layout-helper-drafts', JSON.stringify(drafts)); } catch { /* browser storage unavailable */ }
  draftStatus.textContent = 'Draft saved in this browser.';
});
document.querySelector('#reset').addEventListener('click', () => {
  delete drafts[taleSelect.value];
  try { localStorage.setItem('tangram-layout-helper-drafts', JSON.stringify(drafts)); } catch { /* browser storage unavailable */ }
  loadTale(taleSelect.value);
});
rotationSlider.addEventListener('input', () => {
  if (!selectedId) return;
  board.transform(selectedId, { rotation: Number(rotationSlider.value) }, { record: false });
});
sizeSlider.addEventListener('input', () => {
  if (!selectedId) return;
  setSelectedSize(Number(sizeSlider.value));
});
flipHorizontal.addEventListener('click', () => {
  if (selectedId !== 'parallelogram') return;
  const item = board.getItems().find((candidate) => candidate.id === selectedId);
  if (item) board.transform(selectedId, { mirror: !item.mirror }, { record: false });
});
document.querySelector('#copy').addEventListener('click', async () => {
  refreshOutput();
  output.select();
  await navigator.clipboard?.writeText(output.value).catch(() => {});
});
document.querySelector('#copy-all').addEventListener('click', async () => {
  const allTargets = Object.fromEntries(config.tales.map((tale) => [tale.id, drafts[tale.id] || tale.targets]));
  output.value = JSON.stringify(allTargets, null, 2);
  output.select();
  await navigator.clipboard?.writeText(output.value).catch(() => {});
});
window.addEventListener('keydown', (event) => {
  if (!selectedId || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  const step = event.shiftKey ? .02 : .005;
  const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (moves[event.key]) {
    event.preventDefault();
    transformSelected((item) => ({ x: item.x + moves[event.key][0], y: item.y + moves[event.key][1] }));
  }
});

const requested = new URL(location.href).searchParams.get('tale');
stage.style.setProperty('--piece-opacity', pieceOpacity.value);
loadTale(config.tales.some((tale) => tale.id === requested) ? requested : config.tales[0].id);
