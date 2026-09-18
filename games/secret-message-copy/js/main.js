import { installUnlockOnGesture, installKioskGuards } from '../../../shared/js/audio-unlock.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import { createNarrator } from '../../../shared/js/narrator.js';
import * as sfx from '../../../shared/js/sfx.js';
import * as bgm from '../../../shared/js/bgm.js';
import { onTap } from '../../../shared/js/tap.js';
import { hudButton } from '../../../shared/js/hud.js';
import { createScreens } from '../../../shared/js/screens.js';
import { createTimers } from '../../../shared/js/timers.js';
import { createNudger } from '../../../shared/js/idle-nudge.js';
import { mulberry32, shuffle } from '../../../shared/js/rng.js';
import { preloadImages } from '../../../shared/js/preload.js';
import { burstConfetti } from '../../../shared/js/celebrate.js';
import { collectTargets, installDebug } from '../../../shared/js/debug-harness.js';
import { createLetterTracer, LETTER_STROKES } from './trace-letter.js';

const SHARED_FALLBACKS = Object.freeze({
  star: '../../shared/assets/objects/star.webp',
  moon: '../../shared/assets/objects/moon.webp',
  heart: '../../shared/assets/objects/star.webp',
  owl: '../../shared/assets/objects/owl.webp',
  home: '../../shared/assets/ui/btn-home.png',
  back: '../../shared/assets/ui/btn-back.png',
  sound: '../../shared/assets/ui/btn-sound.png',
  next: '../../shared/assets/ui/btn-play.png',
});

/** Start the custom Secret Message Copy runtime. */
export function startSecretMessageCopy(config, root) {
  if (!(root instanceof HTMLElement)) throw new TypeError('Secret Message Copy needs a mount element.');

  const byId = (id) => root.querySelector(`#${id}`);
  const els = {
    splash: byId('screen-splash'),
    play: byId('screen-play'),
    reward: byId('screen-reward'),
    splashHud: byId('splash-hud'),
    playHud: byId('play-hud'),
    rewardHud: byId('reward-hud'),
    modes: byId('mode-envelopes'),
    playStage: byId('play-stage'),
    progress: byId('round-progress'),
    pictureBoard: byId('picture-board'),
    targetSequence: byId('target-sequence'),
    copySequence: byId('copy-sequence'),
    memoryBoard: byId('memory-board'),
    memorySequence: byId('memory-sequence'),
    memoryCover: byId('memory-cover'),
    memoryCopy: byId('memory-copy'),
    wordBoard: byId('word-board'),
    wordProgress: byId('word-progress'),
    traceCanvas: byId('trace-canvas'),
    stampDock: byId('stamp-dock'),
    playOwl: byId('play-owl'),
    rewardOwl: byId('reward-owl'),
    rewardTitle: byId('reward-title'),
    rewardNext: byId('reward-next'),
  };

  const modeMap = new Map(config.modes.map((mode) => [mode.id, mode]));
  const symbolMap = new Map(config.symbols.map((symbol) => [symbol.id, symbol]));
  const timers = createTimers();
  const narrator = createNarrator({ announcerParent: root });
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const state = {
    screen: 'splash',
    phase: 'splash',
    modeId: null,
    roundIndex: 0,
    roundOrder: [],
    inputIndex: 0,
    selected: [],
    word: null,
    letterIndex: 0,
    memoryPhase: null,
    inputLocked: false,
    wrongAttempts: 0,
    messagesDelivered: 0,
    rewardFinal: false,
    muted: false,
    seed: 42,
    rng: mulberry32(42),
    reducedMotion,
  };

  let tracer = null;
  let tracerObserver = null;
  let tracerToken = 0;
  let lastTraceNudge = 0;
  let celebrationDispose = () => {};
  let staticDisposers = [];
  let dynamicDisposers = [];
  let soundButtons = [];
  let destroyed = false;

  const screens = createScreens({
    root,
    screens: { splash: els.splash, play: els.play, reward: els.reward },
    initial: 'splash',
    splash: 'splash',
    voice: narrator,
    onEnter: (name) => {
      state.screen = name;
      root.dataset.phase = name === 'play' && state.modeId ? `play-${state.modeId}` : name;
    },
    onExit: (name) => {
      if (name === 'play') {
        timers.clearAll();
        nudger.stop();
        destroyTracer();
        clearDynamicControls();
      }
      if (name === 'reward') celebrationDispose();
    },
  });

  const nudger = createNudger({
    first: 9000,
    repeat: 8500,
    onNudge: () => {
      if (!screens.is('play') || state.inputLocked) return;
      if (state.modeId === 'secret-words') {
        tracer?.model();
        say('trace-nudge');
      } else if (state.modeId === 'moon-memory' && state.memoryPhase === 'copy') {
        gentleWrong(null, { count: false, fromNudge: true });
      } else if (state.modeId === 'picture-code') {
        clueExpected();
        say('nudge');
      }
    },
  });

  bgm.preload(config.music);
  bgm.setVolume(.12);

  renderModeCards();
  installHud();
  installStaticControls();
  installRasterFallbacks(root);

  const ready = bootstrap();
  const disposeUnlock = installUnlockOnGesture({
    extra: [bgm.unlock],
    onFirst: () => {
      bgm.play(config.music, {
        key: 'secret-message-copy',
        fadeInMs: 1000,
        loopFadeOutMs: 2700,
      });
      ready.then(() => timers.after(140, () => {
        if (screens.is('splash')) say('welcome');
      }));
    },
  });
  const disposeKiosk = installKioskGuards();

  const disposeDebug = installDebug({
    gameId: config.id,
    engine: config.engine,
    ready,
    listModes: () => config.modes.map(({ id, title, skill }) => ({ id, title, skill })),
    startMode,
    getState,
    getTargets: () => collectTargets(root),
    targets: () => collectTargets(root),
    tap: debugTap,
    chooseInput: chooseSymbol,
    stamp: chooseSymbol,
    traceCurrent,
    traceLetter,
    tracePoints: () => tracer?.activeScreenPath() || [],
    getTraceState: () => tracer?.getState() || null,
    completeRound,
    winRound: completeRound,
    next: advanceReward,
    coverMemory,
    home: goSplash,
    mute: setMuted,
    timers,
    narrator,
    voice: voiceClips,
    sfx,
    onSeed: (rng, seed) => {
      state.rng = rng;
      state.seed = seed;
    },
    getAudioLog: () => voiceClips.getAudioLog(),
    clearAudioLog: () => voiceClips.clearAudioLog(),
    getBgmStats: () => bgm.stats(),
    getSfxStats: () => sfx.stats(),
  });

  window.addEventListener('pagehide', destroy, { once: true });

  async function bootstrap() {
    const voiceReady = voiceClips.init(config.voiceClips.manifest, config.voiceClips.lines, config.voice);
    const art = [
      ...Object.values(config.art),
      ...config.symbols.flatMap(({ stamp, envelope }) => [stamp, envelope]),
      ...config.modes.map(({ envelope }) => envelope),
    ];
    await Promise.all([
      voiceReady,
      preloadImages(art),
      document.fonts?.ready || Promise.resolve(),
    ]);
    if (destroyed) return false;
    root.classList.add('is-ready');
    root.setAttribute('aria-busy', 'false');
    return true;
  }

  function line(key) {
    return config.voice[key] || '';
  }

  function say(key) {
    return bgm.duckDuring(narrator.say(key, line(key)));
  }

  function saySequence(keys) {
    const parts = keys.filter(Boolean).map((key, index) => ({
      key,
      text: line(key),
      gap: index ? 90 : 0,
    }));
    return bgm.duckDuring(narrator.saySequence(parts));
  }

  function currentMode() {
    return modeMap.get(state.modeId) || null;
  }

  function currentRound() {
    return state.roundOrder[state.roundIndex] || null;
  }

  function currentSequence() {
    return currentRound()?.sequence || [];
  }

  function symbol(id) {
    return symbolMap.get(id) || null;
  }

  function renderModeCards() {
    els.modes.replaceChildren();
    for (const mode of config.modes) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'mode-envelope qk-mode-card';
      button.dataset.target = `mode-${mode.id}`;
      button.dataset.role = 'mode';
      button.dataset.mode = mode.id;
      button.setAttribute('aria-label', `${mode.title}. ${mode.skill}.`);
      const image = raster(mode.envelope, '', './assets/og-image.jpg');
      image.alt = '';
      const label = document.createElement('span');
      label.className = 'visually-hidden';
      label.textContent = mode.title;
      button.append(image, label);
      els.modes.append(button);
      staticDisposers.push(onTap(button, () => startMode(mode.id), { feedback: () => sfx.whoosh() }));
    }
  }

  function installHud() {
    const home = rasterHud('home', config.art.home, SHARED_FALLBACKS.home, () => {
      window.location.href = '../../';
    }, 'Back to QLOBE Kids');
    home.dataset.target = 'home';
    home.classList.add('qk-hud-top-left');
    els.splashHud.append(home);

    const splashSound = rasterHud('sound', config.art.sound, SHARED_FALLBACKS.sound, toggleMuted, 'Turn sound off');
    splashSound.dataset.target = 'sound-splash';
    splashSound.classList.add('qk-hud-top-right');
    els.splashHud.append(splashSound);

    for (const [host, suffix] of [[els.playHud, 'play'], [els.rewardHud, 'reward']]) {
      const back = rasterHud('back', config.art.back, SHARED_FALLBACKS.back, goSplash, 'Back to the envelopes');
      back.dataset.target = `back-${suffix}`;
      back.classList.add('qk-hud-top-left');
      host.append(back);

      const sound = rasterHud('sound', config.art.sound, SHARED_FALLBACKS.sound, toggleMuted, 'Turn sound off');
      sound.dataset.target = `sound-${suffix}`;
      sound.classList.add('qk-hud-top-right');
      host.append(sound);
    }
    updateSoundButtons();
  }

  function rasterHud(kind, src, fallback, action, label) {
    const button = hudButton(kind, action, { label });
    button.classList.add('secret-raster-hud');
    const image = raster(src, '', fallback);
    image.alt = '';
    button.append(image);
    soundButtons = kind === 'sound' ? [...soundButtons, button] : soundButtons;
    staticDisposers.push(() => button.dispose());
    return button;
  }

  function installStaticControls() {
    staticDisposers.push(onTap(els.rewardNext, advanceReward, { feedback: () => sfx.whoosh() }));
    const onTraceKey = (event) => {
      if (!['Enter', ' '].includes(event.key) || !screens.is('play') || state.modeId !== 'secret-words') return;
      event.preventDefault();
      traceCurrent();
    };
    els.traceCanvas.addEventListener('keydown', onTraceKey);
    staticDisposers.push(() => els.traceCanvas.removeEventListener('keydown', onTraceKey));
  }

  async function startMode(id) {
    const mode = modeMap.get(id);
    if (!mode) return false;
    return screens.start(async () => {
      await ready;
      if (destroyed) return false;
      celebrationDispose();
      timers.clearAll();
      nudger.stop();
      destroyTracer();
      clearDynamicControls();
      state.modeId = id;
      state.roundOrder = shuffle(mode.rounds, state.rng);
      state.roundIndex = 0;
      state.messagesDelivered = 0;
      state.rewardFinal = false;
      state.wrongAttempts = 0;
      state.inputLocked = false;
      screens.show('play', { force: screens.is('play') });
      startRound();
      say(mode.introKey);
      return getState();
    }, { busy: false });
  }

  function startRound() {
    const mode = currentMode();
    const round = currentRound();
    if (!mode || !round) return false;
    timers.clearAll();
    nudger.stop();
    destroyTracer();
    clearDynamicControls();
    state.phase = mode.id;
    state.inputIndex = 0;
    state.selected = [];
    state.word = round.word || null;
    state.letterIndex = 0;
    state.memoryPhase = mode.id === 'moon-memory' ? 'watch' : null;
    state.inputLocked = mode.id === 'moon-memory';
    state.rewardFinal = false;
    root.dataset.phase = `play-${mode.id}`;
    root.dataset.mode = mode.id;
    renderProgress();
    showOnlyBoard(mode.id);

    if (mode.id === 'picture-code') {
      renderPictureRound();
      renderStampDock();
      state.inputLocked = false;
      nudger.arm();
    } else if (mode.id === 'moon-memory') {
      renderMemoryRound();
      renderStampDock({ disabled: true });
      const delay = reducedMotion ? Math.max(1500, mode.revealMs - 400) : mode.revealMs;
      timers.after(delay, coverMemory);
    } else {
      renderWordRound();
      setupTracer();
      state.inputLocked = false;
      nudger.arm();
    }
    return getState();
  }

  function showOnlyBoard(modeId) {
    els.pictureBoard.hidden = modeId !== 'picture-code';
    els.memoryBoard.hidden = modeId !== 'moon-memory';
    els.wordBoard.hidden = modeId !== 'secret-words';
    els.stampDock.hidden = modeId === 'secret-words';
    els.playOwl.src = config.art.owlNeutral;
  }

  function renderProgress() {
    els.progress.replaceChildren();
    const mode = currentMode();
    const sealId = mode?.id === 'picture-code' ? 'star' : (mode?.id === 'moon-memory' ? 'moon' : 'heart');
    const seal = symbol(sealId);
    for (let index = 0; index < state.roundOrder.length; index += 1) {
      const image = raster(seal?.stamp, '', fallbackForSymbol(sealId));
      image.alt = '';
      image.className = 'progress-seal';
      if (index < state.roundIndex) image.classList.add('is-done');
      else if (index === state.roundIndex) image.classList.add('is-now');
      els.progress.append(image);
    }
    els.progress.setAttribute('aria-label', `Message ${state.roundIndex + 1} of ${state.roundOrder.length}`);
  }

  function renderPictureRound() {
    renderSequence(els.targetSequence, currentSequence(), { target: true });
    renderCopiedSequence(els.copySequence, currentSequence());
  }

  function renderMemoryRound() {
    els.memoryCover.classList.remove('is-covered', 'is-peeking');
    els.memorySequence.classList.remove('is-concealed');
    renderSequence(els.memorySequence, currentSequence(), { target: true });
    renderCopiedSequence(els.memoryCopy, currentSequence());
  }

  function renderSequence(host, sequence, { target = false } = {}) {
    host.replaceChildren();
    sequence.forEach((id, index) => {
      const item = symbol(id);
      const image = raster(item?.stamp, item?.label || id, fallbackForSymbol(id));
      image.className = 'symbol-token';
      image.dataset.index = String(index);
      image.dataset.symbol = id;
      if (target && index === state.inputIndex) image.classList.add('is-next');
      host.append(image);
    });
  }

  function renderCopiedSequence(host, sequence) {
    host.replaceChildren();
    sequence.forEach((id, index) => {
      const slot = document.createElement('span');
      slot.className = 'copy-slot';
      slot.dataset.index = String(index);
      if (index < state.selected.length) {
        const selectedId = state.selected[index];
        const item = symbol(selectedId);
        const image = raster(item?.stamp, item?.label || selectedId, fallbackForSymbol(selectedId));
        image.className = 'symbol-token copied-token';
        slot.append(image);
        slot.classList.add('is-filled');
      } else if (index === state.inputIndex) {
        slot.classList.add('is-next');
      }
      host.append(slot);
    });
  }

  function renderStampDock({ disabled = false } = {}) {
    clearDynamicControls();
    els.stampDock.replaceChildren();
    els.stampDock.classList.toggle('is-watching', disabled);
    for (const item of config.symbols) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'stamp-button';
      button.dataset.target = `stamp-${item.id}`;
      button.dataset.role = 'choice';
      button.dataset.symbol = item.id;
      button.disabled = disabled;
      button.setAttribute('aria-label', `Stamp the ${item.label}`);
      const image = raster(item.stamp, '', fallbackForSymbol(item.id));
      image.alt = '';
      button.append(image);
      els.stampDock.append(button);
      dynamicDisposers.push(onTap(button, () => chooseSymbol(item.id), { feedback: () => sfx.tick() }));
    }
  }

  function chooseSymbol(id) {
    if (!screens.is('play') || state.inputLocked || !symbolMap.has(id)) return false;
    if (!['picture-code', 'moon-memory'].includes(state.modeId)) return false;
    if (state.modeId === 'moon-memory' && state.memoryPhase !== 'copy') return false;
    const sequence = currentSequence();
    const expected = sequence[state.inputIndex];
    nudger.poke();
    if (id !== expected) return gentleWrong(id);

    state.selected.push(id);
    state.inputIndex += 1;
    sfx.pop();
    if (state.modeId === 'picture-code') {
      renderSequence(els.targetSequence, sequence, { target: true });
      renderCopiedSequence(els.copySequence, sequence);
    } else {
      renderCopiedSequence(els.memoryCopy, sequence);
    }
    if (state.inputIndex >= sequence.length) {
      state.inputLocked = true;
      nudger.stop();
      els.playOwl.src = config.art.owlCheer;
      timers.after(reducedMotion ? 90 : 300, showReward);
    }
    return true;
  }

  function gentleWrong(id, { count = true, fromNudge = false } = {}) {
    if (!screens.is('play')) return false;
    if (count) state.wrongAttempts += 1;
    sfx.unpop();
    const button = id ? els.stampDock.querySelector(`[data-symbol="${CSS.escape(id)}"]`) : null;
    button?.classList.remove('is-gentle-wrong');
    requestAnimationFrame(() => button?.classList.add('is-gentle-wrong'));

    if (state.modeId === 'moon-memory' && state.memoryPhase === 'copy') {
      state.inputLocked = true;
      state.memoryPhase = 'peek';
      setStampDockDisabled(true);
      els.memorySequence.classList.remove('is-concealed');
      els.memoryCover.classList.add('is-peeking');
      timers.after(reducedMotion ? 420 : 760, () => {
        if (!screens.is('play') || state.modeId !== 'moon-memory') return;
        els.memoryCover.classList.remove('is-peeking');
        els.memorySequence.classList.add('is-concealed');
        state.memoryPhase = 'copy';
        state.inputLocked = false;
        setStampDockDisabled(false);
        nudger.arm();
      });
    } else {
      clueExpected();
      timers.after(560, () => button?.classList.remove('is-gentle-wrong'));
    }
    if (!fromNudge) say('nudge');
    else say('nudge');
    return false;
  }

  function clueExpected() {
    const host = state.modeId === 'moon-memory' ? els.memorySequence : els.targetSequence;
    const clue = host.querySelector(`[data-index="${state.inputIndex}"]`);
    clue?.classList.remove('is-clue');
    requestAnimationFrame(() => clue?.classList.add('is-clue'));
    timers.after(900, () => clue?.classList.remove('is-clue'));
  }

  function setStampDockDisabled(disabled) {
    els.stampDock.classList.toggle('is-watching', disabled);
    for (const button of els.stampDock.querySelectorAll('button')) button.disabled = disabled;
  }

  function coverMemory() {
    if (!screens.is('play') || state.modeId !== 'moon-memory' || state.memoryPhase !== 'watch') return false;
    state.memoryPhase = 'copy';
    state.inputLocked = false;
    els.memorySequence.classList.add('is-concealed');
    els.memoryCover.classList.add('is-covered');
    setStampDockDisabled(false);
    nudger.arm();
    return getState();
  }

  function renderWordRound() {
    els.wordProgress.replaceChildren();
    const word = currentRound()?.word || '';
    [...word].forEach((letter, index) => {
      const span = document.createElement('span');
      span.className = 'word-letter';
      span.textContent = letter;
      if (index < state.letterIndex) span.classList.add('is-written');
      else if (index === state.letterIndex) span.classList.add('is-current');
      else span.classList.add('is-waiting');
      els.wordProgress.append(span);
    });
    els.wordProgress.setAttribute('aria-label', `Copy the word ${word}`);
  }

  function setupTracer() {
    destroyTracer();
    const word = currentRound()?.word || '';
    const letter = word[state.letterIndex];
    if (!letter || !LETTER_STROKES[letter]) return false;
    const token = ++tracerToken;
    els.traceCanvas.setAttribute('aria-label', `Trace uppercase ${letter}. Press Enter or Space for guided switch tracing.`);
    tracer = createLetterTracer({
      canvas: els.traceCanvas,
      reducedMotion,
      tolerance: .13,
      completionThreshold: .93,
      onProgress: () => nudger.poke(),
      onStrokeComplete: () => sfx.pop(),
      onLetterComplete: () => {
        state.inputLocked = true;
        sfx.sparkle();
        timers.after(reducedMotion ? 70 : 150, () => finishLetter(token));
      },
      onNudge: () => {
        state.wrongAttempts += 1;
        tracer?.model();
        const time = performance.now();
        if (time - lastTraceNudge > 1250) {
          lastTraceNudge = time;
          say('trace-nudge');
        }
      },
    });
    tracer.setLetter({ id: letter, strokes: LETTER_STROKES[letter] });
    if (typeof ResizeObserver === 'function') {
      tracerObserver = new ResizeObserver(() => tracer?.resize());
      tracerObserver.observe(els.traceCanvas);
    }
    requestAnimationFrame(() => tracer?.resize());
    return true;
  }

  function finishLetter(token) {
    if (token !== tracerToken || !screens.is('play') || state.modeId !== 'secret-words') return false;
    const word = currentRound()?.word || '';
    state.letterIndex += 1;
    renderWordRound();
    if (state.letterIndex >= word.length) {
      destroyTracer();
      nudger.stop();
      state.inputLocked = true;
      els.playOwl.src = config.art.owlCheer;
      showReward();
      return true;
    }
    setupTracer();
    state.inputLocked = false;
    nudger.arm();
    return true;
  }

  function destroyTracer() {
    tracerToken += 1;
    tracerObserver?.disconnect();
    tracerObserver = null;
    tracer?.destroy();
    tracer = null;
  }

  function traceCurrent() {
    if (!screens.is('play') || state.modeId !== 'secret-words' || state.inputLocked || !tracer) return false;
    nudger.poke();
    return tracer.traceLetter();
  }

  function traceLetter(letter = null) {
    const expected = currentRound()?.word?.[state.letterIndex] || null;
    if (letter && String(letter).toUpperCase() !== expected) return false;
    return traceCurrent();
  }

  function showReward() {
    if (!screens.is('play')) return false;
    const round = currentRound();
    state.inputLocked = true;
    state.messagesDelivered = Math.max(state.messagesDelivered, state.roundIndex + 1);
    state.rewardFinal = state.roundIndex >= state.roundOrder.length - 1;
    els.rewardOwl.src = state.rewardFinal ? config.art.owlCheer : config.art.owlCarry;
    els.rewardOwl.alt = state.rewardFinal
      ? 'The owl courier cheers after delivering every message'
      : 'The owl courier carries the delivered message';
    els.rewardTitle.textContent = state.rewardFinal ? 'Every message delivered!' : 'Message delivered!';
    els.rewardNext.setAttribute('aria-label', state.rewardFinal ? 'Copy these messages again' : 'Next secret message');
    const rewardButtonImage = els.rewardNext.querySelector('img');
    if (rewardButtonImage) rewardButtonImage.src = state.rewardFinal ? config.art.replay : config.art.next;
    screens.show('reward');
    celebrationDispose();
    celebrationDispose = burstConfetti({
      host: els.reward,
      count: state.rewardFinal ? 46 : 28,
      duration: reducedMotion ? 0 : 2300,
      rng: state.rng,
    });
    sfx.tada();
    const voice = ['correct'];
    if (state.modeId === 'secret-words' && round?.voiceKey) voice.push(round.voiceKey);
    voice.push('delivered');
    if (state.rewardFinal) voice.push('cheer');
    saySequence(voice);
    return getState();
  }

  function advanceReward() {
    if (!screens.is('reward') || !state.modeId) return false;
    narrator.stop();
    celebrationDispose();
    if (state.rewardFinal) return startMode(state.modeId);
    state.roundIndex += 1;
    screens.show('play');
    startRound();
    say(currentMode()?.introKey);
    return getState();
  }

  async function completeRound() {
    if (screens.is('reward')) return getState();
    if (!screens.is('play')) return false;
    const roundIndex = state.roundIndex;
    if (state.modeId === 'moon-memory' && state.memoryPhase === 'watch') coverMemory();
    if (['picture-code', 'moon-memory'].includes(state.modeId)) {
      while (screens.is('play') && !state.inputLocked && state.inputIndex < currentSequence().length) {
        chooseSymbol(currentSequence()[state.inputIndex]);
      }
    } else if (state.modeId === 'secret-words') {
      let guard = 0;
      while (screens.is('play') && state.roundIndex === roundIndex && guard < 8) {
        if (!state.inputLocked) traceCurrent();
        await wait(Math.max(20, timers.ms(210)));
        guard += 1;
      }
    }
    await wait(Math.max(20, timers.ms(360)));
    return getState();
  }

  function repeatPrompt() {
    if (screens.is('splash')) return say('welcome');
    if (screens.is('reward')) return say(state.rewardFinal ? 'cheer' : 'delivered');
    if (state.modeId === 'secret-words') {
      tracer?.model();
      return say('word-intro');
    }
    return say(currentMode()?.introKey || 'nudge');
  }

  function toggleMuted() {
    setMuted(!state.muted);
    if (!state.muted) timers.after(100, repeatPrompt);
    return state.muted;
  }

  function setMuted(on = true) {
    state.muted = Boolean(on);
    narrator.setMuted(state.muted);
    voiceClips.setMuted(state.muted);
    sfx.setMuted(state.muted);
    bgm.setMuted(state.muted);
    updateSoundButtons();
    return state.muted;
  }

  function updateSoundButtons() {
    for (const button of soundButtons) {
      button.classList.toggle('is-muted', state.muted);
      button.setAttribute('aria-pressed', String(state.muted));
      button.setAttribute('aria-label', state.muted ? 'Turn sound on' : 'Turn sound off');
      const image = button.querySelector('img');
      if (image) image.src = state.muted ? (config.art.muted || config.art.sound) : config.art.sound;
    }
  }

  function goSplash() {
    timers.clearAll();
    nudger.stop();
    destroyTracer();
    clearDynamicControls();
    celebrationDispose();
    narrator.stop();
    state.phase = 'splash';
    state.modeId = null;
    state.roundIndex = 0;
    state.roundOrder = [];
    state.inputIndex = 0;
    state.selected = [];
    state.word = null;
    state.letterIndex = 0;
    state.memoryPhase = null;
    state.inputLocked = false;
    state.rewardFinal = false;
    screens.show('splash');
    root.dataset.phase = 'splash';
    return getState();
  }

  function clearDynamicControls() {
    dynamicDisposers.splice(0).forEach((dispose) => {
      try { dispose(); } catch { /* teardown continues */ }
    });
  }

  function raster(src, alt = '', fallback = './assets/og-image.jpg') {
    const image = document.createElement('img');
    image.src = src || fallback;
    image.alt = alt;
    if (fallback) image.dataset.fallback = fallback;
    installRasterFallback(image);
    return image;
  }

  function fallbackForSymbol(id) {
    return SHARED_FALLBACKS[id] || SHARED_FALLBACKS.star;
  }

  function installRasterFallback(image) {
    if (!(image instanceof HTMLImageElement) || image.dataset.fallbackReady === 'true') return;
    image.dataset.fallbackReady = 'true';
    image.addEventListener('error', () => {
      const fallback = image.dataset.fallback;
      if (!fallback || image.dataset.fallbackUsed === 'true') return;
      image.dataset.fallbackUsed = 'true';
      image.src = fallback;
    });
  }

  function installRasterFallbacks(scope) {
    for (const image of scope.querySelectorAll('img[data-fallback]')) installRasterFallback(image);
  }

  function debugTap(id) {
    const target = root.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
    if (!target || !(target.getBoundingClientRect().width > 0) || target.matches(':disabled')) return false;
    target.click();
    return true;
  }

  function getState() {
    const round = currentRound();
    return {
      screen: screens.current,
      phase: state.phase,
      mode: state.modeId,
      seed: state.seed,
      round: state.roundIndex,
      rounds: state.roundOrder.length,
      roundId: round?.id || null,
      targetSequence: [...(round?.sequence || [])],
      selected: [...state.selected],
      inputIndex: state.inputIndex,
      expected: round?.sequence?.[state.inputIndex] || null,
      word: round?.word || null,
      currentLetter: round?.word?.[state.letterIndex] || null,
      letterIndex: state.letterIndex,
      memoryPhase: state.memoryPhase,
      inputLocked: state.inputLocked,
      wrongAttempts: state.wrongAttempts,
      messagesDelivered: state.messagesDelivered,
      rewardFinal: state.rewardFinal,
      muted: state.muted,
      reducedMotion: state.reducedMotion,
      trace: tracer?.getState() || null,
      timers: timers.size(),
    };
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    window.removeEventListener('pagehide', destroy);
    timers.clearAll();
    nudger.stop();
    destroyTracer();
    clearDynamicControls();
    celebrationDispose();
    staticDisposers.splice(0).forEach((dispose) => {
      try { dispose(); } catch { /* teardown continues */ }
    });
    disposeDebug();
    screens.destroy();
    narrator.dispose();
    voiceClips.stop();
    bgm.stop({ fadeOutMs: 0 });
    disposeUnlock();
    disposeKiosk();
  }

  return { ready, destroy, getState };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}
