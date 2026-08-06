import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as sfx from '../../../shared/js/sfx.js';
import { onTap } from '../../../shared/js/tap.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createMusicalCanvas } from '../../../shared/js/musical-canvas.js';
import { createFreeformBoard } from '../../../shared/js/freeform-board.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32 } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { installDebug } from '../../../shared/js/debug-harness.js';

const TOOL_ART = Object.freeze({
  crayon: './assets/props/tool-crayon.webp',
  stamp: './assets/props/tool-stamp.webp',
  sticker: './assets/props/tool-sticker.webp',
});

const POSITION_LADDER = Object.freeze([
  [.28, .3], [.52, .28], [.72, .42], [.36, .61],
  [.62, .65], [.78, .7], [.2, .73], [.5, .48],
]);

const FALLBACK_LINES = Object.freeze({
  welcome: 'Welcome to Kindness Delivery. Choose a friend for your kindness note.',
  'choose-friend': 'Who would you like to make smile?',
  'fox-invite': 'Fox would love a bright picture. Make anything cheerful.',
  'bunny-invite': 'Bunny loves little surprises. Draw a happy note, then add stamps and stickers.',
  'bear-invite': 'Bear could use a cozy smile. Make a gentle note just for Bear.',
  'add-mark': 'Add one little mark first. Every picture can carry kindness.',
  'stamp-sun': 'You make the day brighter.',
  'stamp-heart': 'I’m glad you’re my friend.',
  'stamp-flower': 'You help good things grow.',
  'stamp-star': 'You are wonderfully you.',
  'note-ready': 'Your kindness note is ready. Let’s fold it into a paper plane.',
  folding: 'Fold, fold, and one last tuck.',
  swipe: 'Swipe the plane toward your friend.',
  'swipe-nudge': 'Try a bigger swipe toward your friend.',
  'fox-delivered': 'Special delivery! Your picture made Fox’s whole face light up.',
  'bunny-delivered': 'Kindness delivered! Bunny feels so loved.',
  'bear-delivered': 'Your gentle note made Bear feel warm and cared for.',
  'bear-transfer': 'Can you think of one small kind thing to do for someone near you?',
  'send-another': 'Would you like to make another kindness note?',
  restored: 'Your note is back.',
});

export function startKindnessDelivery(config, root) {
  if (!(root instanceof HTMLElement)) throw new Error('Kindness Delivery requires a mount element');

  const byId = (id) => root.querySelector(`#${id}`);
  const els = {
    loading: byId('loading-card'),
    select: byId('screen-select'),
    friendList: byId('friend-list'),
    selectHud: byId('select-hud'),
    studio: byId('screen-studio'),
    studioHud: byId('studio-hud'),
    studioArtboard: byId('studio-artboard'),
    studioBg: byId('studio-bg'),
    studioPrompt: byId('studio-prompt'),
    noteSurface: byId('note-surface'),
    noteCanvas: byId('note-canvas'),
    stickerBoard: byId('sticker-board'),
    toolPalette: byId('tool-palette'),
    toolTray: byId('tool-tray'),
    studioActions: byId('studio-actions'),
    foldOverlay: byId('fold-overlay'),
    foldPreview: byId('fold-preview'),
    flight: byId('screen-flight'),
    flightHud: byId('flight-hud'),
    flightArtboard: byId('flight-artboard'),
    plane: byId('plane-actor'),
    planeNote: byId('plane-note-preview'),
    heartTrail: byId('heart-trail'),
    delivery: byId('screen-delivery'),
    deliveryHud: byId('delivery-hud'),
    deliverySubtitle: byId('delivery-subtitle'),
    reactionWrap: byId('reaction-wrap'),
    reactionFriend: byId('reaction-friend'),
    reactionNote: byId('reaction-note-preview'),
    heartBurst: byId('heart-burst'),
    sendAnother: byId('send-another'),
  };

  const timers = createTimers();
  const narrator = createNarrator();
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const friends = new Map(config.friends.map((friend) => [friend.id, friend]));
  const state = {
    friendId: null,
    activeTool: 'crayon',
    activeColor: config.crayons[0]?.color || '#e95575',
    strokeCount: 0,
    stickerCount: 0,
    hasContent: false,
    folded: false,
    awaitingInput: true,
    inputLocked: false,
    launchSource: null,
    reducedMotion,
    muted: false,
    rng: mulberry32(42),
    seed: 42,
  };

  let lines = { ...FALLBACK_LINES };
  let drawing = null;
  let board = null;
  let clearSnapshot = null;
  let lastNote = null;
  let notePreview = '';
  let actionHistory = [];
  let pendingDrawingBefore = null;
  let pendingBoardBefore = null;
  let suppressHistory = false;
  let paletteDisposers = [];
  let routeToken = 0;
  let itemSerial = 0;
  let flightGesture = null;
  let flightAnimation = null;
  let removeFlightListeners = () => {};

  const screens = createScreens({
    root,
    screens: {
      select: els.select,
      studio: els.studio,
      flight: els.flight,
      delivery: els.delivery,
    },
    initial: 'select',
    splash: 'select',
    voice: narrator,
    onExit: (name) => leaveScreen(name),
  });

  const nudger = createNudger({
    first: 11500,
    repeat: 10500,
    onNudge: (index) => {
      if (!state.awaitingInput || state.inputLocked) return;
      if (screens.is('studio')) {
        if (index === 0) say(currentFriend()?.promptKey || 'choose-friend');
        else pulseReadyOrTool();
      } else if (screens.is('flight')) {
        say(index === 0 ? 'swipe' : 'swipe-nudge');
        nudgePlane();
      }
    },
  });

  const ready = bootstrap();

  installUnlockOnGesture({
    extra: [() => drawing?.unlock()],
    onFirst: () => {
      ready.then(() => {
        window.setTimeout(() => {
          if (screens.is('select')) say('welcome');
        }, 180);
      });
    },
  });
  installKioskGuards();

  renderFriendCards();
  renderToolTray();
  renderStudioActions();
  installHud();
  removeFlightListeners = installFlightGesture();
  onTap(els.sendAnother, () => goSelect(), { feedback: () => sfx.whoosh() });

  const disposeDebug = installDebug({
    gameId: config.id,
    engine: 'kindness-delivery-custom',
    ready,
    listModes: () => config.friends.map(({ id, name, skill }) => ({ id, title: name, skill })),
    startMode,
    getState,
    tap: debugTap,
    winRound,
    home: goSelect,
    mute: setMuted,
    timers,
    narrator,
    voice: voiceClips,
    sfx,
    onSeed: (rng, seed) => { state.rng = rng; state.seed = seed; },
    chooseFriend: startMode,
    drawStroke: (points) => {
      if (!drawing) return null;
      const result = drawing.debugStroke(points);
      updateCreationState();
      return result;
    },
    addSticker: (id, x = .5, y = .5) => debugAddSticker(id, x, y),
    clearNote,
    restoreNote,
    fold: readyNote,
    launch,
    completeFlight,
    getNote: () => clone(currentNote()),
    getAudioLog: () => voiceClips.getAudioLog(),
    destroy: () => {
      disposeDebug();
      removeFlightListeners();
      destroyCreation();
      screens.destroy();
      narrator.dispose();
    },
  });

  async function bootstrap() {
    const lineRequest = fetch('./assets/audio/lines.json')
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (value && typeof value === 'object') lines = { ...lines, ...value }; })
      .catch(() => {});
    const voiceReady = voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', FALLBACK_LINES);
    const imageUrls = [
      './assets/backgrounds/select.webp',
      './assets/backgrounds/studio.webp',
      './assets/backgrounds/flight.webp',
      './assets/backgrounds/delivery.webp',
      './assets/ui/title.webp',
      './assets/props/plane.webp',
      './assets/props/send-button.webp',
      ...config.friends.flatMap(({ card, idle, reaction }) => [card, idle, reaction]),
      ...config.stamps.map(({ src }) => src),
      ...config.stickers.map(({ src }) => src),
      ...Object.values(TOOL_ART),
    ];
    await Promise.all([
      lineRequest,
      voiceReady,
      preloadImages(imageUrls),
      document.fonts?.ready || Promise.resolve(),
    ]);
    try { await els.studioBg.decode(); } catch { /* preload fallback remains playable */ }
    root.classList.add('is-ready');
    root.setAttribute('aria-busy', 'false');
    window.setTimeout(() => { els.loading.hidden = true; }, 320);
    return true;
  }

  function line(key) {
    return lines[key] || FALLBACK_LINES[key] || '';
  }

  function say(key) {
    return narrator.say(key, line(key));
  }

  function currentFriend() {
    return friends.get(state.friendId) || null;
  }

  function installHud() {
    const home = hudButton('home', () => {
      narrator.stop();
      window.location.href = '../../';
    }, { label: 'Back to QLOBE Kids' });
    home.classList.add('qk-hud-top-left');
    home.dataset.target = 'home';
    els.selectHud.append(home);

    const selectSound = hudButton('sound', soundDebounce(() => say('choose-friend')), { label: 'Hear the invitation again' });
    selectSound.classList.add('qk-hud-bottom-left');
    selectSound.dataset.target = 'sound-select';
    els.selectHud.append(selectSound);

    for (const [host, suffix] of [[els.studioHud, 'studio'], [els.flightHud, 'flight'], [els.deliveryHud, 'delivery']]) {
      const back = hudButton('back', goSelect, { label: 'Back to friends' });
      back.classList.add('qk-hud-top-left');
      back.dataset.target = `back-${suffix}`;
      host.append(back);
      const replay = hudButton('sound', soundDebounce(() => repeatCurrentPrompt()), { label: 'Hear that again' });
      replay.classList.add('qk-hud-bottom-left');
      replay.dataset.target = `sound-${suffix}`;
      host.append(replay);
    }
  }

  function repeatCurrentPrompt() {
    if (screens.is('studio')) return say(currentFriend()?.promptKey || 'choose-friend');
    if (screens.is('flight')) return say('swipe');
    if (screens.is('delivery')) return say(currentFriend()?.deliveredKey || 'send-another');
    return say('choose-friend');
  }

  function renderFriendCards() {
    els.friendList.replaceChildren();
    for (const friend of config.friends) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'friend-card';
      button.dataset.target = `friend-${friend.id}`;
      button.setAttribute('aria-label', `Make a kindness note for ${friend.name}`);
      button.innerHTML = `
        <img class="friend-frame" src="${friend.card}" alt="" />
        <img class="friend-character" src="${friend.idle}" alt="" />
        <span>${friend.name}</span>`;
      onTap(button, () => startMode(friend.id), {
        feedback: () => {
          sfx.pop();
          button.classList.add('is-pressed');
          window.setTimeout(() => button.classList.remove('is-pressed'), 180);
        },
      });
      els.friendList.append(button);
    }
  }

  function renderToolTray() {
    els.toolTray.replaceChildren();
    for (const kind of ['crayon', 'stamp', 'sticker']) {
      const button = imageButton({
        className: 'tool-button',
        target: `tool-${kind}`,
        label: `${kind[0].toUpperCase()}${kind.slice(1)} tool`,
        src: TOOL_ART[kind],
      });
      button.setAttribute('aria-pressed', String(state.activeTool === kind));
      onTap(button, () => selectTool(kind), { feedback: () => sfx.tick() });
      els.toolTray.append(button);
    }
  }

  function renderStudioActions() {
    const undo = imageButton({ className: 'paper-action', target: 'undo', label: 'Undo the last mark', src: './assets/props/undo.webp' });
    undo.id = 'undo-note';
    onTap(undo, undoLast, { feedback: () => sfx.unpop() });

    const clear = imageButton({ className: 'paper-action', target: 'clear', label: 'Clear the note', src: './assets/props/eraser.webp' });
    clear.id = 'clear-note';
    onTap(clear, () => clearSnapshot ? restoreNote() : clearNote(), { feedback: () => sfx.unpop() });

    const readyButton = imageButton({ className: 'paper-action ready-note', target: 'ready-note', label: 'Fold and send the note', src: './assets/props/send-button.webp' });
    readyButton.id = 'ready-note';
    readyButton.setAttribute('aria-disabled', 'false');
    onTap(readyButton, readyNote, { feedback: () => state.hasContent ? sfx.whoosh() : sfx.tick() });

    els.studioActions.replaceChildren(undo, clear, readyButton);
    updateCreationControls();
  }

  function imageButton({ className, target, label, src }) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.dataset.target = target;
    button.setAttribute('aria-label', label);
    const image = document.createElement('img');
    image.src = src;
    image.alt = '';
    image.draggable = false;
    button.append(image);
    return button;
  }

  function selectTool(kind) {
    if (state.inputLocked || !['crayon', 'stamp', 'sticker'].includes(kind)) return false;
    state.activeTool = kind;
    els.noteCanvas.style.pointerEvents = kind === 'crayon' ? 'auto' : 'none';
    for (const button of els.toolTray.querySelectorAll('.tool-button')) {
      button.setAttribute('aria-pressed', String(button.dataset.target === `tool-${kind}`));
    }
    renderPalette(kind);
    nudger.poke();
    return true;
  }

  function renderPalette(kind) {
    for (const dispose of paletteDisposers) dispose();
    paletteDisposers = [];
    els.toolPalette.replaceChildren();
    const values = kind === 'crayon' ? config.crayons : kind === 'stamp' ? config.stamps : config.stickers;

    for (const item of values) {
      const button = imageButton({
        className: `palette-button ${kind === 'crayon' ? 'crayon-choice' : ''}`,
        target: `${kind}-${item.id}`,
        label: item.label,
        src: kind === 'crayon' ? TOOL_ART.crayon : item.src,
      });
      if (kind === 'crayon') {
        button.querySelector('img').style.filter = item.filter;
        button.setAttribute('aria-pressed', String(state.activeColor === item.color));
      }
      const dispose = onTap(button, () => {
        if (kind === 'crayon') {
          state.activeColor = item.color;
          drawing?.setColor(item.color);
          drawing?.previewColor(item.color);
          renderPalette(kind);
        } else {
          addDecoration(item, kind);
        }
      }, { feedback: () => sfx.pop() });
      paletteDisposers.push(dispose);
      els.toolPalette.append(button);
    }
    els.toolPalette.classList.add('is-open');
  }

  async function startMode(id) {
    await ready;
    const friend = friends.get(id);
    if (!friend) return false;
    if (screens.is('studio')) screens.show('studio', { force: true });
    else screens.show('studio');

    state.friendId = friend.id;
    state.activeTool = 'crayon';
    state.activeColor = config.crayons[0]?.color || '#e95575';
    state.strokeCount = 0;
    state.stickerCount = 0;
    state.hasContent = false;
    state.folded = false;
    state.awaitingInput = true;
    state.inputLocked = false;
    state.launchSource = null;
    clearSnapshot = null;
    lastNote = null;
    notePreview = '';
    actionHistory = [];
    pendingDrawingBefore = null;
    pendingBoardBefore = null;
    itemSerial = 0;
    els.studioPrompt.textContent = `Make a note for ${friend.name}`;
    els.foldOverlay.hidden = true;
    setupCreation();
    renderToolTray();
    selectTool('crayon');
    updateCreationControls();
    nudger.arm();
    say(friend.promptKey);
    return true;
  }

  function setupCreation() {
    destroyCreation();
    const renderBackground = (ctx, width, height) => {
      const image = els.studioBg;
      if (image.complete && image.naturalWidth) {
        const sx = image.naturalWidth * .126;
        const sy = image.naturalHeight * .132;
        const sw = image.naturalWidth * .748;
        const sh = image.naturalHeight * .576;
        ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
      } else {
        ctx.fillStyle = '#fff4dc';
        ctx.fillRect(0, 0, width, height);
      }
    };

    drawing = createMusicalCanvas(els.noteCanvas, {
      brush: 'ribbon',
      color: state.activeColor,
      palette: config.crayons.map(({ color }) => color),
      renderBackground,
      reducedMotion,
      onStrokeStart: (stroke) => {
        const before = currentNote();
        if (before?.drawing?.strokes) {
          before.drawing.strokes = before.drawing.strokes.filter(({ id }) => id !== stroke.id);
        }
        pendingDrawingBefore = before;
      },
      onStrokeEnd: () => {
        recordAction(pendingDrawingBefore);
        pendingDrawingBefore = null;
        updateCreationState();
        nudger.poke();
      },
      onChange: () => updateCreationState(),
    });
    drawing.setMuted(state.muted);

    board = createFreeformBoard(els.stickerBoard, {
      reducedMotion,
      onChange: (_snapshot, meta) => {
        if (!suppressHistory && ['add', 'move', 'transform', 'remove'].includes(meta.reason)) {
          recordAction(pendingBoardBefore);
          pendingBoardBefore = null;
        }
        updateCreationState();
        nudger.poke();
      },
      onGrab: () => { pendingBoardBefore = currentNote(); },
      onDrop: () => { pendingBoardBefore = null; },
    });
    requestAnimationFrame(() => drawing?.resize());
  }

  function destroyCreation() {
    drawing?.destroy();
    board?.destroy();
    drawing = null;
    board = null;
    pendingDrawingBefore = null;
    pendingBoardBefore = null;
    els.stickerBoard.replaceChildren();
  }

  function recordAction(before) {
    if (suppressHistory || !before) return;
    actionHistory.push(clone(before));
    if (actionHistory.length > 60) actionHistory.shift();
    clearSnapshot = null;
    updateCreationControls();
  }

  function addDecoration(item, kind, position = null) {
    if (!board || state.inputLocked) return null;
    pendingBoardBefore = currentNote();
    const base = position || POSITION_LADDER[itemSerial % POSITION_LADDER.length];
    const jitter = () => (state.rng() - .5) * .035;
    const id = `${kind}-${item.id}-${++itemSerial}`;
    const added = board.add({
      id,
      kind,
      src: item.src,
      alt: item.label,
      x: clamp(base[0] + jitter(), .1, .9),
      y: clamp(base[1] + jitter(), .12, .88),
      size: kind === 'stamp' ? .18 : .2,
      rotation: (state.rng() - .5) * 12,
      meta: { assetId: item.id, voiceKey: item.voiceKey || null },
    });
    if (!added) pendingBoardBefore = null;
    if (added && item.voiceKey) say(item.voiceKey);
    updateCreationState();
    return added;
  }

  function debugAddSticker(id, x, y) {
    const item = [...config.stickers, ...config.stamps].find((entry) => entry.id === id);
    if (!item) return null;
    const kind = config.stamps.includes(item) ? 'stamp' : 'sticker';
    return addDecoration(item, kind, [Number(x), Number(y)]);
  }

  function undoLast() {
    if (state.inputLocked) return false;
    const previous = actionHistory.pop();
    if (!previous) return false;
    suppressHistory = true;
    drawing?.load(previous.drawing);
    board?.load(previous.stickers);
    suppressHistory = false;
    clearSnapshot = null;
    updateCreationState();
    return true;
  }

  function clearNote() {
    if (!drawing || !board || state.inputLocked || !state.hasContent) return false;
    clearSnapshot = {
      note: currentNote(),
      history: clone(actionHistory),
    };
    suppressHistory = true;
    drawing.clear();
    board.clear();
    suppressHistory = false;
    actionHistory = [];
    updateCreationState();
    return true;
  }

  function restoreNote() {
    if (!drawing || !board || !clearSnapshot || state.inputLocked) return false;
    const snapshot = clearSnapshot;
    suppressHistory = true;
    drawing.load(snapshot.note.drawing);
    board.load(snapshot.note.stickers);
    suppressHistory = false;
    actionHistory = clone(snapshot.history);
    clearSnapshot = null;
    updateCreationState();
    say('restored');
    return true;
  }

  function currentNote() {
    if (drawing && board) {
      return {
        format: 'qlobe-kindness-note',
        formatVersion: 1,
        friendId: state.friendId,
        drawing: drawing.snapshot(),
        stickers: board.snapshot(),
      };
    }
    return lastNote;
  }

  function updateCreationState() {
    state.strokeCount = drawing?.strokeCount() || 0;
    state.stickerCount = board?.getItems().length || 0;
    state.hasContent = state.strokeCount + state.stickerCount > 0;
    updateCreationControls();
  }

  function updateCreationControls() {
    const undo = byId('undo-note');
    const clear = byId('clear-note');
    const readyButton = byId('ready-note');
    els.noteSurface.classList.toggle('is-locked', state.inputLocked);
    els.noteSurface.inert = state.inputLocked;
    for (const button of [...els.toolTray.querySelectorAll('button'), ...els.toolPalette.querySelectorAll('button')]) {
      button.disabled = state.inputLocked;
      button.setAttribute('aria-disabled', String(state.inputLocked));
    }
    if (undo) {
      undo.disabled = !actionHistory.length || state.inputLocked;
      undo.setAttribute('aria-disabled', String(undo.disabled));
    }
    if (clear) {
      const restore = Boolean(clearSnapshot);
      clear.querySelector('img').src = restore ? './assets/props/restore.webp' : './assets/props/eraser.webp';
      clear.dataset.target = restore ? 'restore' : 'clear';
      clear.setAttribute('aria-label', restore ? 'Restore the cleared note' : 'Clear the note');
      clear.disabled = (!state.hasContent && !restore) || state.inputLocked;
      clear.setAttribute('aria-disabled', String(clear.disabled));
    }
    if (readyButton) {
      readyButton.disabled = state.inputLocked;
      readyButton.setAttribute('aria-disabled', String(state.inputLocked));
      readyButton.setAttribute('aria-label', state.hasContent
        ? 'Fold and send the note'
        : 'Add one mark, then fold and send the note');
      readyButton.classList.toggle('is-ready', state.hasContent && !state.inputLocked);
    }
  }

  async function readyNote() {
    if (!screens.is('studio') || state.inputLocked) return false;
    if (!state.hasContent) {
      say('add-mark');
      pulseReadyOrTool();
      return false;
    }
    state.inputLocked = true;
    state.awaitingInput = false;
    nudger.stop();
    updateCreationControls();
    lastNote = currentNote();
    notePreview = await flattenNote();
    if (!screens.is('studio')) return false;
    els.foldPreview.src = notePreview;
    els.foldOverlay.hidden = false;
    say('note-ready');
    const token = routeToken;
    await timers.wait(reducedMotion ? 120 : 520);
    if (token !== routeToken || !screens.is('studio')) return false;
    say('folding');
    await timers.wait(reducedMotion ? 90 : 650);
    if (token !== routeToken || !screens.is('studio')) return false;
    state.folded = true;
    screens.show('flight');
    setupFlight();
    return true;
  }

  async function flattenNote() {
    const width = 960;
    const height = Math.max(480, Math.round(width * els.noteCanvas.height / Math.max(1, els.noteCanvas.width)));
    const output = document.createElement('canvas');
    output.width = width;
    output.height = height;
    const ctx = output.getContext('2d');
    ctx.drawImage(els.noteCanvas, 0, 0, width, height);
    const items = board?.getItems() || [];
    for (const item of items) {
      const image = await loadImage(item.src);
      if (!image) continue;
      const itemWidth = item.size * width;
      const itemHeight = itemWidth * image.naturalHeight / Math.max(1, image.naturalWidth);
      ctx.save();
      ctx.translate(item.x * width, item.y * height);
      ctx.rotate(item.rotation * Math.PI / 180);
      ctx.scale(item.mirror ? -1 : 1, 1);
      ctx.drawImage(image, -itemWidth / 2, -itemHeight / 2, itemWidth, itemHeight);
      ctx.restore();
    }
    return output.toDataURL('image/jpeg', .9);
  }

  function setupFlight() {
    state.inputLocked = false;
    state.awaitingInput = true;
    state.launchSource = null;
    resetPlane();
    els.planeNote.src = notePreview;
    els.heartTrail.replaceChildren();
    nudger.arm();
    say('swipe');
  }

  function installFlightGesture() {
    const onDown = (event) => {
      if (!screens.is('flight') || state.inputLocked || flightGesture || event.isPrimary === false) return;
      event.preventDefault();
      els.plane.setPointerCapture?.(event.pointerId);
      flightGesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        started: performance.now(),
        moved: false,
      };
      els.plane.classList.add('is-listening');
      nudger.poke();
    };
    const onMove = (event) => {
      if (!flightGesture || event.pointerId !== flightGesture.pointerId) return;
      event.preventDefault();
      flightGesture.x = event.clientX;
      flightGesture.y = event.clientY;
      const dx = clamp(event.clientX - flightGesture.startX, -25, els.flightArtboard.clientWidth * .28);
      const dy = clamp(event.clientY - flightGesture.startY, -els.flightArtboard.clientHeight * .18, els.flightArtboard.clientHeight * .12);
      flightGesture.moved ||= Math.hypot(dx, dy) > 12;
      els.plane.style.transform = `translate(${dx}px, ${dy}px) rotate(${clamp(-6 + dx * .035 - dy * .025, -15, 12)}deg)`;
    };
    const finish = (event, cancelled = false) => {
      if (!flightGesture || (event && event.pointerId !== flightGesture.pointerId)) return;
      event?.preventDefault?.();
      const gesture = flightGesture;
      flightGesture = null;
      els.plane.classList.remove('is-listening');
      if (cancelled || !screens.is('flight')) {
        resetPlane();
        return;
      }
      const dx = gesture.x - gesture.startX;
      const dy = gesture.y - gesture.startY;
      const elapsed = Math.max(80, performance.now() - gesture.started);
      const horizontal = dx >= 52 && Math.abs(dx) >= Math.abs(dy) * .72;
      if (horizontal || !gesture.moved) {
        launch({
          distance: clamp(dx / Math.max(1, els.flightArtboard.clientWidth), .28, 1),
          velocity: clamp(dx / elapsed * 1000 / Math.max(1, els.flightArtboard.clientWidth), .45, 2.2),
          source: gesture.moved ? 'swipe' : 'tap',
        });
      } else {
        resetPlane();
        say('swipe-nudge');
        nudgePlane();
      }
    };
    const onCancel = (event) => finish(event, true);
    const onKeyboardClick = (event) => {
      if (event.detail !== 0 || !screens.is('flight')) return;
      launch({ distance: .65, velocity: 1, source: 'button' });
    };
    const onBlur = () => finish(null, true);
    els.plane.addEventListener('pointerdown', onDown, { passive: false });
    els.plane.addEventListener('click', onKeyboardClick);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', finish, { passive: false });
    window.addEventListener('pointercancel', onCancel, { passive: false });
    window.addEventListener('blur', onBlur);
    return () => {
      els.plane.removeEventListener('pointerdown', onDown);
      els.plane.removeEventListener('click', onKeyboardClick);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('blur', onBlur);
    };
  }

  async function launch({ distance = .65, velocity = 1, source = 'debug' } = {}) {
    if (!screens.is('flight') || state.inputLocked) return false;
    state.inputLocked = true;
    state.awaitingInput = false;
    state.launchSource = source;
    nudger.stop();
    narrator.stop();
    sfx.whoosh();
    const token = routeToken;
    const rect = els.flightArtboard.getBoundingClientRect();
    const strength = clamp((Number(distance) + Number(velocity) * .35) / 1.35, .35, 1);
    const dx = rect.width * .72;
    const rise = rect.height * (.2 + strength * .2);
    const duration = reducedMotion ? 100 : timers.ms(1150 + (1 - strength) * 300);
    const turns = -6 + strength * 14;

    for (let i = 0; i < 7; i++) {
      timers.after(reducedMotion ? 0 : 120 + i * duration / 10, () => {
        if (token === routeToken && screens.is('flight')) addTrailHeart(i, strength);
      });
    }

    try {
      flightAnimation = els.plane.animate([
        { transform: 'translate(0, 0) rotate(-6deg) scale(1)', offset: 0 },
        { transform: `translate(${dx * .48}px, ${-rise}px) rotate(${turns}deg) scale(1.04)`, offset: .5 },
        { transform: `translate(${dx}px, ${-rise * .38}px) rotate(${turns + 4}deg) scale(.72)`, offset: 1 },
      ], { duration, easing: 'cubic-bezier(.22,.72,.22,1)', fill: 'forwards' });
      await flightAnimation.finished;
    } catch { /* navigation or reduced-motion cancellation */ }
    if (token !== routeToken || !screens.is('flight')) return false;
    return showDelivery();
  }

  function completeFlight() {
    if (!screens.is('flight')) return false;
    flightAnimation?.finish?.();
    if (!state.inputLocked) return launch({ distance: 1, velocity: 2, source: 'debug-complete' });
    return true;
  }

  function addTrailHeart(index, strength) {
    const image = document.createElement('img');
    image.className = 'trail-heart';
    image.src = './assets/props/stamp-heart.webp';
    image.alt = '';
    image.style.left = `${18 + index * 8.5}%`;
    image.style.top = `${61 - Math.sin(index / 6 * Math.PI) * (21 + strength * 9)}%`;
    image.style.setProperty('--turn', `${-24 + state.rng() * 48}deg`);
    els.heartTrail.append(image);
    window.setTimeout(() => image.remove(), reducedMotion ? 80 : 1100);
  }

  async function showDelivery() {
    const friend = currentFriend();
    if (!friend) return false;
    screens.show('delivery');
    state.inputLocked = false;
    state.awaitingInput = true;
    els.deliverySubtitle.textContent = `You made ${friend.name} smile.`;
    els.reactionFriend.src = friend.reaction;
    els.reactionFriend.alt = `${friend.name} happily holding the note`;
    els.reactionNote.src = notePreview;
    renderHeartBurst();
    sfx.tada();
    if (friend.id === 'bear') {
      narrator.saySequence([
        [friend.deliveredKey, line(friend.deliveredKey)],
        ['bear-transfer', line('bear-transfer')],
      ]);
    } else {
      say(friend.deliveredKey);
    }
    return true;
  }

  function renderHeartBurst() {
    els.heartBurst.replaceChildren();
    const count = reducedMotion ? 7 : 15;
    for (let i = 0; i < count; i++) {
      const image = document.createElement('img');
      image.className = 'burst-heart';
      image.src = './assets/props/stamp-heart.webp';
      image.alt = '';
      const angle = (i / count) * Math.PI * 2;
      const radius = 15 + state.rng() * 17;
      image.style.left = `${50 + Math.cos(angle) * radius}%`;
      image.style.top = `${58 + Math.sin(angle) * radius * .65}%`;
      image.style.width = `${4 + state.rng() * 4}%`;
      image.style.animationDelay = reducedMotion ? '0ms' : `${i * 42}ms`;
      image.style.setProperty('--turn', `${-30 + state.rng() * 60}deg`);
      els.heartBurst.append(image);
    }
  }

  function resetPlane() {
    flightAnimation?.cancel?.();
    flightAnimation = null;
    flightGesture = null;
    els.plane.style.removeProperty('transform');
    els.plane.classList.remove('is-listening', 'is-nudged');
  }

  function nudgePlane() {
    els.plane.classList.remove('is-nudged');
    void els.plane.offsetWidth;
    els.plane.classList.add('is-nudged');
    timers.after(560, () => els.plane.classList.remove('is-nudged'));
  }

  function pulseReadyOrTool() {
    const target = state.hasContent ? byId('ready-note') : els.toolTray.querySelector('[data-target="tool-crayon"]');
    if (!target) return;
    target.animate?.([
      { transform: 'scale(1)' },
      { transform: 'translateY(-7px) scale(1.09)' },
      { transform: 'scale(1)' },
    ], { duration: reducedMotion ? 1 : 620, easing: 'ease-out' });
  }

  function goSelect() {
    if (screens.is('select')) return true;
    screens.show('select');
    state.friendId = null;
    state.awaitingInput = true;
    state.inputLocked = false;
    state.folded = false;
    state.launchSource = null;
    state.strokeCount = 0;
    state.stickerCount = 0;
    state.hasContent = false;
    return true;
  }

  function setMuted(on = true) {
    const muted = Boolean(on);
    state.muted = muted;
    narrator.setMuted(muted);
    voiceClips.setMuted(muted);
    drawing?.setMuted(muted);
    if (muted) {
      narrator.stop();
      voiceClips.stop();
      try { window.speechSynthesis?.cancel(); } catch { /* audio is never load-bearing */ }
    }
    for (const node of document.querySelectorAll('audio, video')) node.muted = muted;
    return muted;
  }

  function leaveScreen(name) {
    routeToken += 1;
    nudger.stop();
    timers.clearAll();
    if (name === 'studio') {
      els.foldOverlay.hidden = true;
      destroyCreation();
      for (const dispose of paletteDisposers) dispose();
      paletteDisposers = [];
      els.toolPalette.classList.remove('is-open');
    }
    if (name === 'flight') {
      resetPlane();
      els.heartTrail.replaceChildren();
    }
    if (name === 'delivery') {
      els.heartBurst.replaceChildren();
    }
  }

  function getState() {
    return {
      screen: screens.current,
      friendId: state.friendId,
      activeTool: state.activeTool,
      strokeCount: state.strokeCount,
      stickerCount: state.stickerCount,
      hasContent: state.hasContent,
      folded: state.folded,
      awaitingInput: state.awaitingInput,
      inputLocked: state.inputLocked,
      launchSource: state.launchSource,
      reducedMotion: state.reducedMotion,
      muted: state.muted,
      seed: state.seed,
      timerCount: timers.size(),
    };
  }

  async function debugTap(id) {
    const target = root.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
    if (!target || target.getBoundingClientRect().width === 0 || target.disabled) return false;
    target.click();
    await Promise.resolve();
    return true;
  }

  async function winRound() {
    if (screens.is('select')) return startMode('bunny');
    if (screens.is('studio')) {
      if (!state.hasContent) {
        drawing?.debugStroke();
        updateCreationState();
      }
      return readyNote();
    }
    if (screens.is('flight')) return launch({ distance: 1, velocity: 2, source: 'debug-win' });
    return true;
  }

  function loadImage(src) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => resolve(null);
      image.src = src;
    });
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  return { ready, destroy: () => window.QLOBE_DEBUG?.destroy?.() };
}
