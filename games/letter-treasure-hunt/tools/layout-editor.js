import { saveDocument, serverStatus } from '../../../shared/js/studio/api.js';

const DOCUMENT_PATH = 'games/letter-treasure-hunt/data/dz-scene-layouts.json';
const DOCUMENT_URL = '../data/dz-scene-layouts.json';
const DRAFT_KEY = 'letter-treasure-hunt-layout-draft-v2';
const LETTERS = 'defghijklmnopqrstuvwxyz'.split('');
const VIEWPORTS = {
  standard: { width: 1180, height: 820 },
  wide: { width: 2048, height: 987 },
  compact: { width: 667, height: 375 },
};

const ui = Object.fromEntries([
  'save-status', 'save-project', 'save-draft', 'reset-letter', 'download-json',
  'copy-json', 'import-json', 'import-file', 'previous-letter', 'letter-select',
  'next-letter', 'mode-select', 'preview-shell', 'game-preview', 'show-guides',
  'selected-label', 'item-select', 'rect-x', 'rect-y', 'rect-w', 'rect-h',
  'lock-aspect', 'bring-forward', 'send-back', 'json-output',
].map((id) => [id, document.getElementById(id)]));

let committed = null;
let layouts = null;
let previewReady = false;
let selectedKey = null;
let descriptors = [];
let dirty = false;
let busy = false;
let previewObserver = null;

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function isRect(rect) {
  return rect && ['x', 'y', 'w', 'h'].every((key) => Number.isFinite(rect[key]))
    && rect.x >= 0 && rect.y >= 0 && rect.w > 0 && rect.h > 0
    && rect.x + rect.w <= 100 && rect.y + rect.h <= 100;
}

function targetKeys(entry, mode) {
  return Object.keys(entry?.[mode]?.targets || {}).sort();
}

function validateDocument(documentValue, expected = null) {
  if (!documentValue || documentValue.version !== 2
      || documentValue.coordinateSpace?.unit !== 'percent'
      || documentValue.coordinateSpace?.origin !== 'top-left'
      || documentValue.coordinateSpace?.aspectRatio !== '4:3'
      || documentValue.coordinateSpace?.rectMeaning !== 'visible-alpha-bounds') {
    throw new Error('Expected a version 2, visible-art, percentage-based 4:3 layout document.');
  }
  const letters = Object.keys(documentValue.letters || {}).sort();
  if (letters.join('') !== LETTERS.join('')) throw new Error('The document must contain exactly letters D through Z.');
  const trimKeys = Object.keys(documentValue.artTrims || {}).sort();
  if (!trimKeys.length || !trimKeys.every((key) => isRect(documentValue.artTrims[key]))) {
    throw new Error('The document is missing valid visible-art trim metadata.');
  }
  if (expected && JSON.stringify(documentValue.artTrims) !== JSON.stringify(expected.artTrims)) {
    throw new Error('Imported art trim metadata does not match the game assets.');
  }
  for (const letter of LETTERS) {
    const entry = documentValue.letters[letter];
    for (const mode of ['hunt', 'completion']) {
      const keys = targetKeys(entry, mode);
      if (keys.length !== 3) throw new Error(`${letter.toUpperCase()} ${mode} must contain exactly three targets.`);
      if (expected && keys.join('|') !== targetKeys(expected.letters[letter], mode).join('|')) {
        throw new Error(`${letter.toUpperCase()} ${mode} target IDs do not match the game.`);
      }
      for (const id of keys) if (!isRect(entry[mode].targets[id])) throw new Error(`${letter.toUpperCase()} ${mode} ${id} has an invalid rectangle.`);
      if (!isRect(entry[mode].chest)) throw new Error(`${letter.toUpperCase()} ${mode} chest has an invalid rectangle.`);
    }
    if (!isRect(entry.hunt.distractor)) throw new Error(`${letter.toUpperCase()} distractor has an invalid rectangle.`);
  }
  return documentValue;
}

function currentLetter() {
  return ui['letter-select'].value.toLowerCase();
}

function currentMode() {
  return ui['mode-select'].value;
}

function currentEntry() {
  return layouts.letters[currentLetter()][currentMode()];
}

function rectForKey(key) {
  const entry = currentEntry();
  if (key === 'chest') return entry.chest;
  if (key === 'distractor') return entry.distractor;
  return entry.targets[key.replace(/^target:/, '')];
}

function setStatus(message, tone = '') {
  ui['save-status'].textContent = message;
  ui['save-status'].dataset.tone = tone;
}

function markDirty(message = 'Unsaved layout changes') {
  dirty = true;
  setStatus(message, 'dirty');
  refreshJson();
}

function refreshJson() {
  if (!layouts) return;
  ui['json-output'].value = JSON.stringify({
    letter: currentLetter(),
    ...layouts.letters[currentLetter()],
  }, null, 2);
}

function setBusy(value, message = '') {
  busy = value;
  for (const control of [ui['previous-letter'], ui['letter-select'], ui['next-letter'], ui['mode-select']]) control.disabled = value;
  if (message) setStatus(message);
}

async function waitFor(predicate, timeout = 8000) {
  const started = performance.now();
  while (performance.now() - started < timeout) {
    const result = predicate();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw new Error('The game preview did not become ready in time.');
}

async function ensurePreview() {
  const frame = ui['game-preview'];
  if (!previewReady) {
    if (!frame.contentWindow?.QLOBE_DEBUG) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('The game preview could not load.')), 10000);
        frame.addEventListener('load', () => { clearTimeout(timer); resolve(); }, { once: true });
      });
    }
    await waitFor(() => frame.contentWindow?.QLOBE_DEBUG);
    await frame.contentWindow.QLOBE_DEBUG.ready;
    previewReady = true;
  }
  return frame.contentWindow;
}

async function renderPreview({ preserveSelection = false } = {}) {
  if (busy) return;
  setBusy(true, `Loading ${currentLetter().toUpperCase()} ${currentMode()}…`);
  try {
    const win = await ensurePreview();
    const debug = win.QLOBE_DEBUG;
    debug.mute(true);
    // Completion needs accelerated feedback timers; hunt mode stays at real
    // speed so the game's idle reminder does not constantly rebuild the DOM.
    debug.fastTimers(currentMode() === 'completion' ? 0.01 : 1);
    await debug.startMode(`${currentLetter()}-quest`);
    if (currentMode() === 'completion') {
      for (let index = 0; index < 3; index += 1) await debug.winRound();
      await waitFor(() => debug.getState().screen === 'end');
    } else {
      await waitFor(() => debug.getState().screen === 'play');
    }
    installEditorLayer(win);
    watchPreviewRenders(win);
    if (!preserveSelection || !descriptors.some((item) => item.key === selectedKey)) selectedKey = descriptors[0]?.key || null;
    selectItem(selectedKey);
    setStatus(dirty ? 'Unsaved layout changes' : 'Layout loaded', dirty ? 'dirty' : 'ok');
  } catch (error) {
    console.error(error);
    setStatus(error.message, 'error');
  } finally {
    setBusy(false);
  }
}

function watchPreviewRenders(win) {
  previewObserver?.disconnect();
  const mount = win.document.getElementById('app');
  if (!mount) return;
  previewObserver = new win.MutationObserver(() => {
    const stage = currentMode() === 'hunt'
      ? win.document.querySelector('.lth-scene-stage')
      : win.document.querySelector('.lth-completion-scene-stage');
    if (!stage || stage.querySelector('.lth-layout-editor-box')) return;
    installEditorLayer(win);
    if (!descriptors.some((item) => item.key === selectedKey)) selectedKey = descriptors[0]?.key || null;
    selectItem(selectedKey);
  });
  previewObserver.observe(mount, { childList: true, subtree: true });
}

function editableDescriptors(win) {
  const doc = win.document;
  const entry = currentEntry();
  if (currentMode() === 'hunt') {
    const correct = [...doc.querySelectorAll('.lth-hotspot[data-role="correct"]')];
    const targets = Object.keys(entry.targets).map((id) => ({
      key: `target:${id}`,
      label: id.replaceAll('-', ' '),
      element: correct.find((element) => element.dataset.target === id),
    }));
    return [
      ...targets,
      { key: 'distractor', label: doc.querySelector('.lth-distractor-hotspot')?.getAttribute('aria-label') || 'Distractor', element: doc.querySelector('.lth-distractor-hotspot') },
      { key: 'chest', label: 'Treasure chest', element: doc.querySelector('.lth-wrong-hotspot') },
    ];
  }
  const targetElements = [...doc.querySelectorAll('.lth-completion-target')];
  return [
    ...Object.keys(entry.targets).map((id) => ({
      key: `target:${id}`,
      label: id.replaceAll('-', ' '),
      element: targetElements.find((target) => target.dataset.layoutId === id),
    })),
    { key: 'chest', label: 'Open treasure chest', element: doc.querySelector('.lth-completion-decoration') },
  ];
}

function installEditorLayer(win) {
  const doc = win.document;
  doc.getElementById('lth-layout-editor-style')?.remove();
  const style = doc.createElement('style');
  style.id = 'lth-layout-editor-style';
  style.textContent = `
    .lth-layout-editor-box{position:absolute;z-index:90;box-sizing:border-box;border:2px dashed rgba(255,246,190,.92);background:rgba(19,38,48,.09);cursor:grab;touch-action:none;min-width:0;min-height:0;color:#fff;font:700 12px/1 system-ui;text-shadow:0 1px 3px #000}
    .lth-layout-editor-box:hover{background:rgba(247,185,75,.16)}
    .lth-layout-editor-box.is-selected{border:3px solid #ffba45;background:rgba(255,171,51,.12);box-shadow:0 0 0 2px rgba(20,28,32,.72),0 0 18px rgba(255,183,61,.55)}
    .lth-layout-editor-label{position:absolute;top:3px;left:4px;padding:3px 5px;border-radius:4px;background:rgba(16,24,29,.82);pointer-events:none;text-transform:capitalize;white-space:nowrap}
    .lth-layout-editor-resize{position:absolute;right:-7px;bottom:-7px;width:18px;height:18px;border:2px solid #fff;border-radius:3px;background:#ff9d32;box-shadow:0 2px 5px #0008;cursor:nwse-resize}
    .lth-layout-editor-guide{display:none;position:absolute;z-index:89;pointer-events:none}
    .lth-layout-editor-guides .lth-layout-editor-guide{display:block}
    .lth-layout-editor-guide.ground{left:0;top:54%;width:100%;border-top:2px dotted rgba(255,231,112,.9)}
    .lth-layout-editor-guide.targets{left:0;top:55%;width:100%;border-top:2px dotted rgba(119,231,255,.9)}
    .lth-layout-editor-guide::after{position:absolute;right:8px;top:4px;padding:3px 5px;border-radius:3px;background:#15232bcf;color:#fff;font:700 10px system-ui;content:attr(data-label)}
  `;
  doc.head.append(style);
  const stage = currentMode() === 'hunt'
    ? doc.querySelector('.lth-scene-stage')
    : doc.querySelector('.lth-completion-scene-stage');
  if (!stage) throw new Error('Editable scene stage was not found.');
  stage.querySelectorAll('.lth-layout-editor-box,.lth-layout-editor-guide').forEach((element) => element.remove());
  stage.classList.toggle('lth-layout-editor-guides', ui['show-guides'].checked);
  for (const guide of [{ className: 'ground', label: 'Upper object baseline' }, { className: 'targets', label: 'Target row starts' }]) {
    const line = doc.createElement('div');
    line.className = `lth-layout-editor-guide ${guide.className}`;
    line.dataset.label = guide.label;
    stage.append(line);
  }
  descriptors = editableDescriptors(win).filter((descriptor) => descriptor.element);
  for (const descriptor of descriptors) {
    applyOriginalRect(descriptor);
    const box = doc.createElement('div');
    box.className = 'lth-layout-editor-box';
    box.dataset.editorKey = descriptor.key;
    box.tabIndex = 0;
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', `Edit ${descriptor.label}`);
    const label = doc.createElement('span');
    label.className = 'lth-layout-editor-label';
    label.textContent = descriptor.label;
    const resize = doc.createElement('span');
    resize.className = 'lth-layout-editor-resize';
    resize.setAttribute('aria-hidden', 'true');
    box.append(label, resize);
    stage.append(box);
    descriptor.overlay = box;
    applyOverlayRect(descriptor);
    box.addEventListener('pointerdown', (event) => beginPointerEdit(win, descriptor, event));
    box.addEventListener('focus', () => selectItem(descriptor.key));
  }
  populateItemSelect();
}

function applyStyle(element, rect) {
  element.style.top = `${rect.y}%`;
  element.style.right = 'auto';
  element.style.left = `${rect.x}%`;
  element.style.width = `${rect.w}%`;
  element.style.height = `${rect.h}%`;
}

function applyOriginalRect(descriptor) {
  applyStyle(descriptor.element, rectForKey(descriptor.key));
}

function applyOverlayRect(descriptor) {
  applyStyle(descriptor.overlay, rectForKey(descriptor.key));
}

function clampRect(rect) {
  const minimum = 2;
  const w = Math.min(100, Math.max(minimum, rect.w));
  const h = Math.min(100, Math.max(minimum, rect.h));
  return {
    x: round(Math.min(100 - w, Math.max(0, rect.x))),
    y: round(Math.min(100 - h, Math.max(0, rect.y))),
    w: round(w),
    h: round(h),
  };
}

function updateDescriptor(descriptor, nextRect, { announce = true } = {}) {
  const rect = rectForKey(descriptor.key);
  Object.assign(rect, clampRect(nextRect));
  applyOriginalRect(descriptor);
  applyOverlayRect(descriptor);
  if (selectedKey === descriptor.key) refreshSelectionControls();
  if (announce) markDirty();
}

function beginPointerEdit(win, descriptor, event) {
  if (event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  selectItem(descriptor.key);
  const resizing = event.target.classList.contains('lth-layout-editor-resize');
  const stage = descriptor.overlay.parentElement;
  const stageBox = stage.getBoundingClientRect();
  const start = { ...rectForKey(descriptor.key) };
  const origin = { x: event.clientX, y: event.clientY };
  const aspect = start.w / start.h;
  descriptor.overlay.setPointerCapture?.(event.pointerId);
  const move = (nextEvent) => {
    const dx = (nextEvent.clientX - origin.x) / stageBox.width * 100;
    const dy = (nextEvent.clientY - origin.y) / stageBox.height * 100;
    if (!resizing) {
      updateDescriptor(descriptor, { ...start, x: start.x + dx, y: start.y + dy }, { announce: false });
      return;
    }
    let w = start.w + dx;
    let h = start.h + dy;
    if (ui['lock-aspect'].checked) {
      const fromWidth = Math.max(2, w);
      const fromHeight = Math.max(2, h) * aspect;
      w = Math.abs(dx / start.w) >= Math.abs(dy / start.h) ? fromWidth : fromHeight;
      h = w / aspect;
    }
    updateDescriptor(descriptor, { ...start, w, h }, { announce: false });
  };
  const end = () => {
    win.removeEventListener('pointermove', move, true);
    win.removeEventListener('pointerup', end, true);
    win.removeEventListener('pointercancel', end, true);
    markDirty();
  };
  win.addEventListener('pointermove', move, true);
  win.addEventListener('pointerup', end, true);
  win.addEventListener('pointercancel', end, true);
}

function populateItemSelect() {
  ui['item-select'].replaceChildren();
  for (const descriptor of descriptors) {
    const option = document.createElement('option');
    option.value = descriptor.key;
    option.textContent = descriptor.label;
    ui['item-select'].append(option);
  }
  ui['item-select'].disabled = descriptors.length === 0;
}

function selectItem(key) {
  selectedKey = key;
  for (const descriptor of descriptors) descriptor.overlay?.classList.toggle('is-selected', descriptor.key === key);
  const descriptor = descriptors.find((item) => item.key === key);
  ui['selected-label'].textContent = descriptor ? descriptor.label : 'Nothing selected';
  ui['item-select'].value = descriptor?.key || '';
  for (const input of [ui['rect-x'], ui['rect-y'], ui['rect-w'], ui['rect-h']]) input.disabled = !descriptor;
  refreshSelectionControls();
}

function refreshSelectionControls() {
  const descriptor = descriptors.find((item) => item.key === selectedKey);
  if (!descriptor) return;
  const rect = rectForKey(descriptor.key);
  ui['rect-x'].value = rect.x;
  ui['rect-y'].value = rect.y;
  ui['rect-w'].value = rect.w;
  ui['rect-h'].value = rect.h;
}

function adjustSelected(changes) {
  const descriptor = descriptors.find((item) => item.key === selectedKey);
  if (!descriptor) return;
  updateDescriptor(descriptor, { ...rectForKey(descriptor.key), ...changes });
}

async function loadInitialDocument() {
  const response = await fetch(DOCUMENT_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load layout document (${response.status}).`);
  committed = validateDocument(await response.json());
  layouts = clone(committed);
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (draft) {
      layouts = clone(validateDocument(draft, committed));
      dirty = true;
      setStatus('Restored browser draft', 'dirty');
    }
  } catch (error) {
    console.warn('Ignoring invalid browser layout draft:', error);
    localStorage.removeItem(DRAFT_KEY);
  }
}

async function saveProject() {
  const saving = clone(layouts);
  try {
    validateDocument(saving, committed);
    setStatus('Saving layout document…');
    await saveDocument(DOCUMENT_PATH, saving);
    committed = saving;
    if (JSON.stringify(layouts) === JSON.stringify(saving)) {
      localStorage.removeItem(DRAFT_KEY);
      dirty = false;
      setStatus('Saved to project', 'ok');
    } else {
      dirty = true;
      localStorage.setItem(DRAFT_KEY, JSON.stringify(layouts));
      setStatus('Saved earlier state; newer edits remain unsaved', 'dirty');
    }
  } catch (error) {
    console.error(error);
    setStatus(`${error.message} Use the local launcher or export JSON.`, 'error');
  }
}

function saveDraft() {
  try {
    validateDocument(layouts, committed);
    localStorage.setItem(DRAFT_KEY, JSON.stringify(layouts));
    dirty = true;
    setStatus('Draft saved in this browser', 'dirty');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function downloadJson() {
  const blob = new Blob([`${JSON.stringify(layouts, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'dz-scene-layouts.json';
  link.click();
  URL.revokeObjectURL(url);
  setStatus('Layout JSON downloaded', 'ok');
}

async function copyJson() {
  try {
    const text = `${JSON.stringify(layouts, null, 2)}\n`;
    await navigator.clipboard.writeText(text);
    setStatus('Full layout JSON copied', 'ok');
  } catch {
    ui['json-output'].value = JSON.stringify(layouts, null, 2);
    ui['json-output'].select();
    setStatus('Clipboard unavailable; JSON selected below', 'error');
  }
}

async function importJson(file) {
  try {
    const imported = validateDocument(JSON.parse(await file.text()), committed);
    layouts = clone(imported);
    dirty = true;
    selectedKey = null;
    await renderPreview();
    markDirty('Imported layout; save or store a draft');
  } catch (error) {
    setStatus(`Import failed: ${error.message}`, 'error');
  } finally {
    ui['import-file'].value = '';
  }
}

function setViewport(name) {
  const viewport = VIEWPORTS[name] || VIEWPORTS.standard;
  ui['preview-shell'].style.aspectRatio = `${viewport.width} / ${viewport.height}`;
  ui['preview-shell'].dataset.viewport = name;
  document.querySelectorAll('[data-viewport]').forEach((button) => button.classList.toggle('active', button.dataset.viewport === name));
  requestAnimationFrame(() => {
    const descriptor = descriptors.find((item) => item.key === selectedKey);
    descriptor?.overlay?.focus({ preventScroll: true });
  });
}

function adjacentLetter(delta) {
  const index = LETTERS.indexOf(currentLetter());
  const next = LETTERS[(index + delta + LETTERS.length) % LETTERS.length];
  ui['letter-select'].value = next.toUpperCase();
  selectedKey = null;
  void renderPreview();
}

ui['previous-letter'].addEventListener('click', () => adjacentLetter(-1));
ui['next-letter'].addEventListener('click', () => adjacentLetter(1));
ui['letter-select'].addEventListener('change', () => { selectedKey = null; void renderPreview(); });
ui['mode-select'].addEventListener('change', () => { selectedKey = null; void renderPreview(); });
ui['item-select'].addEventListener('change', () => {
  selectItem(ui['item-select'].value);
  descriptors.find((item) => item.key === selectedKey)?.overlay?.focus({ preventScroll: true });
});
ui['show-guides'].addEventListener('change', () => {
  const win = ui['game-preview'].contentWindow;
  const stage = currentMode() === 'hunt'
    ? win?.document.querySelector('.lth-scene-stage')
    : win?.document.querySelector('.lth-completion-scene-stage');
  stage?.classList.toggle('lth-layout-editor-guides', ui['show-guides'].checked);
});
for (const button of document.querySelectorAll('[data-viewport]')) button.addEventListener('click', () => setViewport(button.dataset.viewport));
for (const [id, key] of [['rect-x', 'x'], ['rect-y', 'y'], ['rect-w', 'w'], ['rect-h', 'h']]) {
  ui[id].addEventListener('input', () => {
    if (ui[id].value.trim() === '' || ui[id].validity.badInput) return;
    const value = Number(ui[id].value);
    if (Number.isFinite(value)) adjustSelected({ [key]: value });
  });
  ui[id].addEventListener('change', refreshSelectionControls);
}
ui['save-project'].addEventListener('click', saveProject);
ui['save-draft'].addEventListener('click', saveDraft);
ui['reset-letter'].addEventListener('click', async () => {
  layouts.letters[currentLetter()] = clone(committed.letters[currentLetter()]);
  selectedKey = null;
  await renderPreview();
  markDirty(`${currentLetter().toUpperCase()} reset to committed positions`);
});
ui['download-json'].addEventListener('click', downloadJson);
ui['copy-json'].addEventListener('click', copyJson);
ui['import-json'].addEventListener('click', () => ui['import-file'].click());
ui['import-file'].addEventListener('change', () => { if (ui['import-file'].files[0]) void importJson(ui['import-file'].files[0]); });
window.addEventListener('keydown', (event) => {
  if (!selectedKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName)) return;
  const step = event.shiftKey ? 1 : .25;
  const rect = rectForKey(selectedKey);
  const moves = {
    ArrowLeft: { x: rect.x - step }, ArrowRight: { x: rect.x + step },
    ArrowUp: { y: rect.y - step }, ArrowDown: { y: rect.y + step },
  };
  if (moves[event.key]) {
    event.preventDefault();
    adjustSelected(moves[event.key]);
  }
});
window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  event.preventDefault();
  event.returnValue = '';
});

async function init() {
  try {
    await loadInitialDocument();
    const requestedLetter = new URL(location.href).searchParams.get('letter')?.toLowerCase();
    if (LETTERS.includes(requestedLetter)) ui['letter-select'].value = requestedLetter.toUpperCase();
    setViewport('standard');
    refreshJson();
    void serverStatus().then(
      () => { if (!dirty) setStatus('Project saving available', 'ok'); },
      () => { if (!dirty) setStatus('Static preview; launch locally to save', 'dirty'); },
    );
    await renderPreview();
  } catch (error) {
    console.error(error);
    setStatus(error.message, 'error');
  }
}

void init();
