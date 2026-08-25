import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { onTap } from '../../../shared/js/tap.js';
import { hudButton, soundDebounce } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';
import { createLetterWriter } from './letter-writing.js';

const FALLBACK_LINES = Object.freeze({
  welcome: 'Welcome to Post Office Letters! Tap the big envelope to open the mail window.',
  'open-shift': 'The post office is open. Our first customer is here!',
  'trace-first': 'Start at the glowing dot and follow the letter trail.',
  'trace-nudge': 'Stay near the glowing trail. Watch where it goes.',
  'next-letter': 'Lovely letter. Now write the next one.',
  'name-complete': 'The name is ready. Choose a picture stamp.',
  'stamp-selected': 'Perfect postage! Now send the letter through the smiling mail chute.',
  sent: 'Whoosh! The letter is on its way.',
  'pickup-nudge': 'That letter is looking for someone else. Match the name to our customer.',
  'pickup-success': 'Special delivery! You matched the name.',
  'shift-complete': 'Every letter found its person. You made the post office sparkle!',
});

const CUES = Object.freeze({
  stamp: 'Choose a picture stamp',
  pickup: 'Find the matching name',
  success: 'Special delivery!',
});

/** Start the complete Post Office Letters mail-shift experience. */
export function startPostOfficeLetters(config, root) {
  if (!(root instanceof HTMLElement)) throw new Error('Post Office Letters requires a mount element.');

  const byId = (id) => root.querySelector(`#${id}`);
  const els = {
    loading: byId('loading-curtain'),
    splash: byId('screen-splash'),
    play: byId('screen-play'),
    end: byId('screen-end'),
    splashHud: byId('splash-hud'),
    playHud: byId('play-hud'),
    endHud: byId('end-hud'),
    waitingQueue: byId('waiting-queue'),
    startShift: byId('start-shift'),
    anotherShift: byId('another-shift'),
    playArtboard: byId('play-artboard'),
    roundProgress: byId('round-progress'),
    phaseCue: byId('phase-cue'),
    customerStage: byId('customer-stage'),
    customerPortrait: byId('customer-portrait'),
    customerName: byId('customer-name'),
    customerDrop: byId('customer-drop'),
    recipientCubby: byId('recipient-cubby'),
    recipientPortrait: byId('recipient-portrait'),
    recipientName: byId('recipient-name'),
    mailPiece: byId('mail-piece'),
    addressLine: byId('address-line'),
    chosenStamp: byId('chosen-stamp'),
    mailActionHint: byId('mail-action-hint'),
    nameWriter: byId('name-writer'),
    stampTray: byId('stamp-tray'),
    pickupTray: byId('pickup-tray'),
    sendSlot: byId('send-slot'),
    sparkles: byId('delivery-sparkles'),
    endFriends: byId('end-friends'),
    deliveredMail: byId('delivered-mail'),
  };

  const visitors = new Map(config.visitors.map((visitor) => [visitor.id, visitor]));
  const stamps = new Map(config.assets.stamps.map((stamp) => [stamp.id, stamp]));
  const timers = createTimers();
  const narrator = createNarrator({ announcerParent: root });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    screen: 'splash',
    phase: 'splash',
    seed: 42,
    rng: mulberry32(42),
    routeOrder: [],
    roundIndex: 0,
    routeId: null,
    letterIndex: 0,
    completedLetters: [],
    stampId: null,
    pickupChoices: [],
    delivered: [],
    inputLocked: false,
    started: false,
    muted: false,
    reducedMotion,
  };

  let lines = { ...FALLBACK_LINES };
  let writer = null;
  let writerObserver = null;
  let writerKeyDispose = () => {};
  let routeToken = 0;
  let lastTraceNudge = 0;
  let dynamicDisposers = [];
  let staticDisposers = [];
  let celebrationDispose = () => {};
  let destroyed = false;

  const screens = createScreens({
    root,
    screens: { splash: els.splash, play: els.play, end: els.end },
    initial: 'splash',
    splash: 'splash',
    voice: narrator,
    onEnter: (name) => { state.screen = name; },
    onExit: (name) => {
      if (name === 'play') {
        nudger.stop();
        timers.clearAll();
        destroyWriter();
        clearDynamicControls();
        drag.cancel();
      }
      if (name === 'end') celebrationDispose();
    },
  });

  const nudger = createNudger({
    first: 11000,
    repeat: 10500,
    onNudge: (index) => {
      if (!screens.is('play') || state.inputLocked) return;
      if (state.phase === 'writing') {
        if (index === 0) say(activeLetter()?.voiceKey || 'trace-first');
        else {
          writer?.model();
          say('trace-nudge');
        }
      } else if (state.phase === 'stamp') {
        els.stampTray.querySelector('.stamp-choice')?.classList.add('is-nudging');
        say('name-complete');
      } else if (state.phase === 'send') {
        say('stamp-selected');
      } else if (state.phase === 'pickup') {
        say(currentRoute()?.pickupVoice || 'pickup-nudge');
      } else if (state.phase === 'arrival') {
        say(currentRoute()?.arrivalVoice || 'open-shift');
      }
    },
  });

  const dragPieces = new Map();
  const drag = createDragToSlotDom({
    getPiece: (id) => dragPieces.get(id) || null,
    root: els.playArtboard,
    slotSelector: '[data-mail-slot]',
    slotPad: 40,
    hoverClass: 'is-drop-hover',
    ghostClass: 'mail-drag-ghost',
    makeGhost: (piece) => piece.el.cloneNode(true),
    canStart: () => screens.is('play') && !state.inputLocked,
    onDrop: async (piece, record) => {
      const slot = record.slot?.dataset.mailSlot;
      if (piece.kind === 'send' && slot === 'send') return sendLetter();
      if (piece.kind === 'pickup' && slot === 'customer') return choosePickup(piece.name);
      if (piece.kind === 'pickup') gentleWrong(piece.name);
      nudger.poke();
      return false;
    },
  });

  bgm.preload(config.assets.music);
  bgm.setVolume(.16);
  const ready = bootstrap();
  const disposeUnlock = installUnlockOnGesture({
    extra: [bgm.unlock],
    onFirst: () => {
      bgm.play(config.assets.music, { key: 'post-office-shift', fadeInMs: 900, loopFadeOutMs: 2600 });
      ready.then(() => timers.after(180, () => {
        if (screens.is('splash') && !state.started) say('welcome');
      }));
    },
  });
  const disposeKiosk = installKioskGuards();

  installHud();
  renderWaitingQueue();
  installStaticControls();

  const disposeDebug = installDebug({
    gameId: config.id,
    engine: 'post-office-letters-custom',
    ready,
    listModes: () => [{ id: 'mail-shift', title: 'Mail Shift', skill: 'lowercase name writing and functional print' }],
    startMode,
    getState,
    tap: debugTap,
    winRound,
    home: goSplash,
    mute: setMuted,
    timers,
    narrator,
    voice: voiceClips,
    sfx,
    onSeed: (rng, seed) => { state.rng = rng; state.seed = seed; },
    traceCurrent: debugTraceCurrent,
    getTraceModel: () => writer?.model() || null,
    chooseStamp,
    sendLetter: () => sendLetter({ immediate: true }),
    choosePickup,
    completeShift,
    getAudioLog: () => voiceClips.getAudioLog(),
  });

  window.addEventListener('pagehide', destroy, { once: true });

  async function bootstrap() {
    const lineRequest = fetch('./assets/audio/lines.json')
      .then((response) => response.ok ? response.json() : null)
      .then((value) => { if (value && typeof value === 'object') lines = { ...lines, ...value }; })
      .catch(() => {});
    const voiceReady = voiceClips.init('./assets/audio/manifest.json', './assets/audio/lines.json', FALLBACK_LINES);
    const images = [
      config.assets.background,
      config.assets.title,
      config.assets.envelope,
      ...config.assets.stamps.map(({ src }) => src),
      ...config.visitors.map(({ portrait }) => portrait),
      '../../shared/assets/ui/btn-play.png',
    ];
    await Promise.all([lineRequest, voiceReady, preloadImages(images), document.fonts?.ready || Promise.resolve()]);
    root.classList.add('is-ready');
    root.setAttribute('aria-busy', 'false');
    timers.after(360, () => { if (els.loading) els.loading.hidden = true; });
    return true;
  }

  function line(key) {
    return lines[key] || FALLBACK_LINES[key] || '';
  }

  function say(key) {
    return bgm.duckDuring(narrator.say(key, line(key)));
  }

  function saySequence(keys) {
    return bgm.duckDuring(narrator.saySequence(keys.map((key, index) => ({ key, text: line(key), gap: index ? 120 : 0 }))));
  }

  function currentRoute() {
    return state.routeOrder[state.roundIndex] || config.routes.find(({ id }) => id === state.routeId) || null;
  }

  function sender() {
    return visitors.get(currentRoute()?.sender) || null;
  }

  function recipient() {
    return visitors.get(currentRoute()?.recipient) || null;
  }

  function activeLetter() {
    const character = recipient()?.print[state.letterIndex];
    return config.letters[character] || null;
  }

  function stampById(id = state.stampId) {
    return stamps.get(id) || null;
  }

  function installHud() {
    const home = hudButton('home', () => { window.location.href = '../../'; }, { label: 'Back to QLOBE Kids' });
    home.classList.add('qk-hud-top-left');
    home.dataset.target = 'home';
    els.splashHud.append(home);

    const splashSound = hudButton('sound', soundDebounce(() => say('welcome')), { label: 'Hear the welcome again' });
    splashSound.classList.add('qk-hud-top-right');
    splashSound.dataset.target = 'sound-splash';
    els.splashHud.append(splashSound);

    for (const [host, suffix] of [[els.playHud, 'play'], [els.endHud, 'end']]) {
      const back = hudButton('back', goSplash, { label: 'Back to the post office window' });
      back.classList.add('qk-hud-top-left');
      back.dataset.target = `back-${suffix}`;
      host.append(back);
      const sound = hudButton('sound', soundDebounce(repeatCurrentPrompt), { label: 'Hear that again' });
      sound.classList.add('qk-hud-top-right');
      sound.dataset.target = `sound-${suffix}`;
      host.append(sound);
      staticDisposers.push(() => back.dispose(), () => sound.dispose());
    }
    staticDisposers.push(() => home.dispose(), () => splashSound.dispose());
  }

  function installStaticControls() {
    staticDisposers.push(
      onTap(els.startShift, () => startMode('mail-shift'), { feedback: () => sfx.whoosh() }),
      onTap(els.anotherShift, () => startMode('mail-shift'), { feedback: () => sfx.whoosh() }),
      onTap(els.mailPiece, () => {
        if (state.phase === 'arrival') startWriting();
        else if (state.phase === 'send') sendLetter();
      }, { feedback: () => { if (state.phase === 'arrival') sfx.pop(); } }),
      onTap(els.sendSlot, () => { if (state.phase === 'send') sendLetter(); }, { feedback: () => sfx.whoosh() }),
      onTap(els.customerDrop, () => { if (state.phase === 'pickup') say(currentRoute()?.pickupVoice || 'pickup-nudge'); }),
    );

    const beginOutgoingDrag = (event) => {
      if (state.phase !== 'send' || state.inputLocked) return;
      dragPieces.set('outgoing', { el: els.mailPiece, kind: 'send', name: recipient()?.print });
      drag.begin(event, 'outgoing');
    };
    els.mailPiece.addEventListener('pointerdown', beginOutgoingDrag);
    staticDisposers.push(() => els.mailPiece.removeEventListener('pointerdown', beginOutgoingDrag));
  }

  function renderWaitingQueue() {
    els.waitingQueue.replaceChildren();
    config.visitors.slice(0, 3).forEach((visitor) => {
      const image = document.createElement('img');
      image.className = 'queue-friend';
      image.src = visitor.portrait;
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      els.waitingQueue.append(image);
    });
  }

  async function startMode(id = 'mail-shift') {
    if (id !== 'mail-shift') return false;
    return screens.start(async () => {
      await ready;
      celebrationDispose();
      timers.clearAll();
      clearDynamicControls();
      destroyWriter();
      routeToken += 1;
      state.started = true;
      state.routeOrder = shuffle(config.routes, state.rng).slice(0, config.roundsPerShift);
      state.roundIndex = 0;
      state.delivered = [];
      state.inputLocked = false;
      screens.show('play', { force: screens.is('play') });
      beginRound();
      saySequence(['open-shift', currentRoute().arrivalVoice]);
      return getState();
    }, { busy: false });
  }

  function beginRound() {
    timers.clearAll();
    clearDynamicControls();
    destroyWriter();
    drag.cancel();
    routeToken += 1;
    const route = currentRoute();
    state.routeId = route?.id || null;
    state.phase = 'arrival';
    state.letterIndex = 0;
    state.completedLetters = [];
    state.stampId = null;
    state.pickupChoices = [];
    state.inputLocked = false;
    renderPhase();
    nudger.arm();
  }

  function startWriting() {
    if (state.phase !== 'arrival' || state.inputLocked) return false;
    narrator.stop();
    state.phase = 'writing';
    state.letterIndex = 0;
    state.completedLetters = [];
    renderPhase();
    renderWriter();
    nudger.arm();
    saySequence(['trace-first', activeLetter()?.voiceKey].filter(Boolean));
    return true;
  }

  function renderPhase() {
    const route = currentRoute();
    const from = sender();
    const to = recipient();
    root.dataset.phase = state.phase;
    els.mailPiece.classList.remove('is-flying');
    els.customerStage.classList.toggle('is-entering', state.phase === 'arrival');
    els.customerStage.classList.toggle('is-happy', state.phase === 'success');

    const shownCustomer = ['pickup', 'success'].includes(state.phase) ? to : from;
    if (shownCustomer) {
      els.customerPortrait.src = shownCustomer.portrait;
      els.customerPortrait.alt = shownCustomer.alt;
      els.customerName.textContent = shownCustomer.name;
    }
    if (to) {
      els.recipientPortrait.src = to.portrait;
      els.recipientPortrait.alt = '';
      els.recipientName.textContent = to.print;
    }

    const completeName = to?.print || '';
    els.addressLine.textContent = ['stamp', 'send', 'success'].includes(state.phase)
      ? completeName
      : '';
    const chosen = stampById();
    els.chosenStamp.hidden = !chosen;
    if (chosen) {
      els.chosenStamp.src = chosen.src;
      els.chosenStamp.alt = '';
    } else {
      els.chosenStamp.removeAttribute('src');
    }

    els.mailActionHint.textContent = state.phase === 'arrival'
      ? 'Tap to write'
      : (state.phase === 'send' ? 'Tap or slide to send' : '');
    els.phaseCue.textContent = phaseCue();
    els.mailPiece.setAttribute('aria-label', state.phase === 'send'
      ? `Send the letter addressed to ${completeName}`
      : `Write ${completeName} on the envelope`);
    renderProgress();
    renderStamps();
    renderPickupChoices();
    renderSparkles();
  }

  function phaseCue() {
    const from = sender();
    const to = recipient();
    if (!from || !to) return '';
    if (state.phase === 'arrival') return `${from.name} has a letter for ${to.name}`;
    if (state.phase === 'writing') return `Write ${to.print}`;
    if (state.phase === 'stamp') return CUES.stamp;
    if (state.phase === 'send') return `Send ${to.print}'s letter`;
    if (state.phase === 'pickup') return `${to.name} is picking up — find ${to.print}`;
    if (state.phase === 'success') return `Special delivery for ${to.name}!`;
    return '';
  }

  function renderProgress() {
    els.roundProgress.replaceChildren();
    const total = Math.max(1, state.routeOrder.length || config.roundsPerShift);
    for (let index = 0; index < total; index += 1) {
      const image = document.createElement('img');
      image.src = config.assets.envelope;
      image.alt = '';
      if (index < state.roundIndex) image.classList.add('is-done');
      else if (index === state.roundIndex) image.classList.add('is-now');
      els.roundProgress.append(image);
    }
  }

  function renderWriter() {
    destroyWriter();
    els.nameWriter.replaceChildren();
    const word = recipient()?.print || '';
    els.nameWriter.style.setProperty('--name-length', Math.max(1, word.length));
    for (let index = 0; index < word.length; index += 1) {
      const cell = document.createElement('div');
      cell.className = 'name-cell';
      if (index < state.letterIndex) {
        const glyph = document.createElement('span');
        glyph.className = 'written-glyph';
        glyph.textContent = word[index];
        cell.append(glyph);
      } else if (index === state.letterIndex) {
        cell.classList.add('is-current');
        const canvas = document.createElement('canvas');
        canvas.tabIndex = 0;
        canvas.setAttribute('role', 'button');
        canvas.dataset.target = `trace-${word[index]}-${index}`;
        canvas.dataset.role = 'trace';
        canvas.setAttribute('aria-label', `Trace lowercase ${word[index]}. Press Enter or Space for guided switch tracing.`);
        cell.append(canvas);
      } else {
        cell.classList.add('is-waiting');
        const glyph = document.createElement('span');
        glyph.className = 'written-glyph';
        glyph.textContent = word[index];
        glyph.setAttribute('aria-hidden', 'true');
        cell.append(glyph);
      }
      els.nameWriter.append(cell);
    }

    const canvas = els.nameWriter.querySelector('canvas');
    const recipe = activeLetter();
    if (!canvas || !recipe) return;
    const token = routeToken;
    writer = createLetterWriter({
      canvas,
      reducedMotion,
      tolerance: .12,
      onProgress: () => nudger.poke(),
      onStrokeComplete: () => sfx.pop(),
      onLetterComplete: () => timers.after(110, () => finishCurrentLetter(token)),
      onNudge: () => {
        const now = performance.now();
        writer?.model();
        if (now - lastTraceNudge > 1400) {
          lastTraceNudge = now;
          say('trace-nudge');
        }
      },
    });
    writer.setLetter({ id: word[state.letterIndex], strokes: recipe.strokes, color: '#e85472' });
    const onTraceKey = (event) => {
      if (!['Enter', ' '].includes(event.key) || state.phase !== 'writing') return;
      event.preventDefault();
      debugTraceCurrent();
    };
    canvas.addEventListener('keydown', onTraceKey);
    writerKeyDispose = () => canvas.removeEventListener('keydown', onTraceKey);
    if (typeof ResizeObserver === 'function') {
      writerObserver = new ResizeObserver(() => writer?.resize());
      writerObserver.observe(canvas);
    }
    requestAnimationFrame(() => writer?.resize());
  }

  function finishCurrentLetter(token) {
    if (token !== routeToken || state.phase !== 'writing' || state.inputLocked) return false;
    const word = recipient()?.print || '';
    state.completedLetters.push(word[state.letterIndex]);
    state.letterIndex += 1;
    sfx.sparkle();
    if (state.letterIndex >= word.length) {
      destroyWriter();
      state.phase = 'stamp';
      renderPhase();
      nudger.arm();
      say('name-complete');
      return true;
    }
    renderPhase();
    renderWriter();
    saySequence(['next-letter', activeLetter()?.voiceKey].filter(Boolean));
    return true;
  }

  function destroyWriter() {
    writerKeyDispose();
    writerKeyDispose = () => {};
    writerObserver?.disconnect();
    writerObserver = null;
    writer?.destroy();
    writer = null;
  }

  function clearDynamicControls() {
    dynamicDisposers.splice(0).forEach((dispose) => {
      try { dispose(); } catch { /* stale controls are harmless */ }
    });
    dragPieces.clear();
  }

  function renderStamps() {
    els.stampTray.replaceChildren();
    if (state.phase !== 'stamp') return;
    for (const stamp of config.assets.stamps) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stamp-choice';
      button.dataset.target = `stamp-${stamp.id}`;
      button.dataset.role = 'choice';
      button.setAttribute('aria-label', stamp.label);
      const image = document.createElement('img');
      image.src = stamp.src;
      image.alt = '';
      button.append(image);
      els.stampTray.append(button);
      dynamicDisposers.push(onTap(button, () => chooseStamp(stamp.id), { feedback: () => sfx.pop() }));
    }
  }

  function chooseStamp(id) {
    if (state.phase !== 'stamp' || state.inputLocked || !stamps.has(id)) return false;
    clearDynamicControls();
    state.stampId = id;
    state.phase = 'send';
    renderPhase();
    nudger.arm();
    sfx.sparkle();
    say('stamp-selected');
    return true;
  }

  function sendLetter({ immediate = false } = {}) {
    if (state.phase !== 'send' || state.inputLocked) return false;
    state.inputLocked = true;
    nudger.stop();
    drag.cancel();
    els.mailPiece.classList.add('is-flying');
    sfx.whoosh();
    say('sent');
    if (immediate) enterPickup();
    else timers.after(reducedMotion ? 120 : 720, enterPickup);
    return true;
  }

  function enterPickup() {
    if (state.phase !== 'send') return false;
    const to = recipient();
    const decoys = shuffle(config.visitors.filter(({ id }) => id !== to.id), state.rng).slice(0, 2);
    state.pickupChoices = shuffle([to, ...decoys], state.rng).map(({ print }) => print);
    state.phase = 'pickup';
    state.inputLocked = false;
    renderPhase();
    nudger.arm();
    say(currentRoute()?.pickupVoice || 'pickup-nudge');
    return true;
  }

  function renderPickupChoices() {
    els.pickupTray.replaceChildren();
    if (state.phase !== 'pickup') return;
    for (const name of state.pickupChoices) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pickup-envelope';
      button.dataset.target = `pickup-${name}`;
      button.dataset.role = 'choice';
      button.setAttribute('aria-label', `Letter addressed to ${name}`);
      const image = document.createElement('img');
      image.src = config.assets.envelope;
      image.alt = '';
      const label = document.createElement('span');
      label.textContent = name;
      button.append(image, label);
      els.pickupTray.append(button);
      const id = `pickup-${name}`;
      dragPieces.set(id, { el: button, kind: 'pickup', name });
      const begin = (event) => drag.begin(event, id);
      button.addEventListener('pointerdown', begin);
      dynamicDisposers.push(
        () => button.removeEventListener('pointerdown', begin),
        onTap(button, () => choosePickup(name), { feedback: () => sfx.tick() }),
      );
    }
  }

  function choosePickup(name, { immediate = false } = {}) {
    if (state.phase !== 'pickup' || state.inputLocked || !state.pickupChoices.includes(name)) return false;
    if (name !== recipient()?.print) return gentleWrong(name);
    state.inputLocked = true;
    nudger.stop();
    clearDynamicControls();
    state.delivered.push({
      routeId: currentRoute().id,
      recipientId: recipient().id,
      name: recipient().print,
      stampId: state.stampId,
    });
    state.phase = 'success';
    renderPhase();
    sfx.tada();
    say('pickup-success');
    const advance = () => {
      state.roundIndex += 1;
      if (state.roundIndex >= state.routeOrder.length) showEnd();
      else {
        beginRound();
        saySequence(['next-customer', currentRoute().arrivalVoice]);
      }
    };
    if (immediate) advance();
    else timers.after(reducedMotion ? 420 : 1450, advance);
    return true;
  }

  function gentleWrong(name) {
    if (state.phase !== 'pickup') return false;
    const button = els.pickupTray.querySelector(`[data-target="pickup-${CSS.escape(name)}"]`);
    button?.classList.remove('is-wrong');
    requestAnimationFrame(() => button?.classList.add('is-wrong'));
    timers.after(520, () => button?.classList.remove('is-wrong'));
    sfx.unpop();
    say('pickup-nudge');
    nudger.poke();
    return false;
  }

  function renderSparkles() {
    els.sparkles.replaceChildren();
    if (state.phase !== 'success') return;
    for (let index = 0; index < 3; index += 1) els.sparkles.append(document.createElement('i'));
  }

  function showEnd() {
    timers.clearAll();
    clearDynamicControls();
    destroyWriter();
    state.phase = 'end';
    state.inputLocked = false;
    root.dataset.phase = 'end';
    renderEnd();
    screens.show('end');
    celebrationDispose();
    celebrationDispose = burstConfetti({ host: els.end, count: 38, duration: 2600, rng: state.rng });
    say('shift-complete');
    return getState();
  }

  function renderEnd() {
    els.endFriends.replaceChildren();
    els.deliveredMail.replaceChildren();
    for (const delivery of state.delivered) {
      const friend = visitors.get(delivery.recipientId);
      if (friend) {
        const portrait = document.createElement('img');
        portrait.src = friend.portrait;
        portrait.alt = friend.alt;
        els.endFriends.append(portrait);
      }
      const card = document.createElement('div');
      card.className = 'delivered-card';
      const envelope = document.createElement('img');
      envelope.src = config.assets.envelope;
      envelope.alt = '';
      const name = document.createElement('span');
      name.className = 'delivered-name';
      name.textContent = delivery.name;
      const stamp = document.createElement('img');
      stamp.className = 'delivered-stamp';
      stamp.src = stampById(delivery.stampId)?.src || config.assets.stamps[0].src;
      stamp.alt = '';
      card.append(envelope, name, stamp);
      els.deliveredMail.append(card);
    }
  }

  function repeatCurrentPrompt() {
    if (screens.is('splash')) return say('welcome');
    if (screens.is('end')) return say('shift-complete');
    if (state.phase === 'arrival') return say(currentRoute()?.arrivalVoice || 'open-shift');
    if (state.phase === 'writing') return say(activeLetter()?.voiceKey || 'trace-first');
    if (state.phase === 'stamp') return say('name-complete');
    if (state.phase === 'send') return say('stamp-selected');
    if (state.phase === 'pickup') return say(currentRoute()?.pickupVoice || 'pickup-nudge');
    return say('pickup-success');
  }

  function goSplash() {
    routeToken += 1;
    timers.clearAll();
    nudger.stop();
    clearDynamicControls();
    destroyWriter();
    drag.cancel();
    celebrationDispose();
    narrator.stop();
    state.phase = 'splash';
    state.inputLocked = false;
    root.dataset.phase = 'splash';
    screens.show('splash');
    renderWaitingQueue();
    return getState();
  }

  function getState() {
    return {
      screen: screens.current,
      phase: state.phase,
      seed: state.seed,
      roundIndex: state.roundIndex,
      rounds: state.routeOrder.length,
      routeId: state.routeId,
      sender: sender()?.id || null,
      recipient: recipient()?.id || null,
      recipientPrint: recipient()?.print || null,
      letterIndex: state.letterIndex,
      currentLetter: recipient()?.print[state.letterIndex] || null,
      completedLetters: [...state.completedLetters],
      stampId: state.stampId,
      pickupChoices: [...state.pickupChoices],
      delivered: state.delivered.map((item) => ({ ...item })),
      inputLocked: state.inputLocked,
      reducedMotion: state.reducedMotion,
      muted: state.muted,
      trace: writer?.debugTrace() || null,
    };
  }

  function debugTap(id) {
    const target = root.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
    if (!target || !(target.getBoundingClientRect().width > 0)) return false;
    target.click();
    return true;
  }

  function debugTraceCurrent() {
    if (state.phase !== 'writing' || !writer) return false;
    const strokes = activeLetter()?.strokes || [];
    for (const stroke of strokes) {
      if (!stroke?.length) continue;
      writer.pointerDown(stroke[0]);
      for (let index = 1; index < stroke.length; index += 1) {
        const [ax, ay] = stroke[index - 1];
        const [bx, by] = stroke[index];
        const count = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / .006));
        for (let step = 1; step <= count; step += 1) {
          const t = step / count;
          writer.pointerMove([ax + (bx - ax) * t, ay + (by - ay) * t]);
        }
      }
      writer.pointerUp();
    }
    return writer?.debugTrace() || { complete: true };
  }

  function winRound() {
    if (!screens.is('play')) return false;
    if (state.phase === 'arrival') startWriting();
    if (state.phase === 'writing') {
      const name = recipient().print;
      destroyWriter();
      state.completedLetters = [...name];
      state.letterIndex = name.length;
      state.phase = 'stamp';
      renderPhase();
    }
    if (state.phase === 'stamp') chooseStamp(config.assets.stamps[0].id);
    if (state.phase === 'send') sendLetter({ immediate: true });
    if (state.phase === 'pickup') choosePickup(recipient().print, { immediate: true });
    return getState();
  }

  function completeShift() {
    if (!state.routeOrder.length) {
      state.routeOrder = config.routes.slice(0, config.roundsPerShift);
    }
    state.delivered = state.routeOrder.map((route, index) => ({
      routeId: route.id,
      recipientId: route.recipient,
      name: visitors.get(route.recipient).print,
      stampId: config.assets.stamps[index % config.assets.stamps.length].id,
    }));
    state.roundIndex = state.routeOrder.length;
    return showEnd();
  }

  function setMuted(on = true) {
    state.muted = Boolean(on);
    narrator.setMuted(state.muted);
    voiceClips.setMuted(state.muted);
    sfx.setMuted(state.muted);
    bgm.setMuted(state.muted);
    return state.muted;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    routeToken += 1;
    timers.clearAll();
    nudger.stop();
    drag.cancel();
    drag.detach();
    clearDynamicControls();
    destroyWriter();
    celebrationDispose();
    staticDisposers.splice(0).forEach((dispose) => {
      try { dispose(); } catch { /* teardown must continue */ }
    });
    disposeDebug();
    screens.destroy();
    narrator.dispose();
    voiceClips.stop();
    bgm.stop({ fadeOutMs: 0 });
    disposeUnlock();
    disposeKiosk();
  }
}
