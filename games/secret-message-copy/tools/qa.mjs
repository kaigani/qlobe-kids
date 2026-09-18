#!/usr/bin/env node
// Production smoke, real-input, accessibility, audio, and visual QA.
import path from 'node:path';
import {
  baseUrl,
  launchChrome,
  createReporter,
  openSession,
  resolveShots,
  ensureShots,
  dragPath,
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const gameUrl = `${base}/games/secret-message-copy/`;
const shots = resolveShots('artifacts/qa/secret-message-copy');
const { check, finish } = createReporter();

async function open(browser, viewport, reducedMotion = 'no-preference') {
  return openSession(browser, {
    url: gameUrl,
    base,
    viewport,
    reducedMotion,
    seed: 42,
    captureRequestFailures: false,
    allowRemote: [
      'blob:',
      'https://www.googletagmanager.com/',
      'https://www.google-analytics.com/',
    ],
  });
}

async function waitReady(page) {
  await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.waitForFunction(() => document.querySelector('#game')?.getAttribute('aria-busy') === 'false');
}

async function startMode(page, id) {
  await page.evaluate((modeId) => window.QLOBE_DEBUG.startMode(modeId), id);
  await page.waitForFunction((modeId) => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'play' && state.mode === modeId;
  }, id);
}

async function waitReward(page) {
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward', null, { timeout: 15_000 });
}

async function waitRewardSettled(page) {
  await waitReward(page);
  // Judge the authored tableau after its deliberate courier-arrival animation,
  // never from a translucent in-between frame.
  await page.waitForTimeout(700);
}

async function finishMode(page) {
  for (let guard = 0; guard < 8; guard += 1) {
    let state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    if (state.screen === 'play') {
      await page.evaluate(() => window.QLOBE_DEBUG.completeRound());
      await waitReward(page);
      state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    }
    if (state.screen === 'reward' && state.rewardFinal) return state;
    await page.evaluate(() => window.QLOBE_DEBUG.next());
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
  }
  return page.evaluate(() => window.QLOBE_DEBUG.getState());
}

async function drawCurrentLetterWithPointer(page) {
  const before = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  for (let guard = 0; guard < 8; guard += 1) {
    const state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    if (state.letterIndex !== before.letterIndex || state.screen !== 'play') break;
    const points = await page.evaluate(() => window.QLOBE_DEBUG.tracePoints());
    if (points.length < 2) {
      await page.waitForTimeout(80);
      continue;
    }
    await dragPath(page, points);
    await page.waitForTimeout(60);
  }
  await page.waitForFunction((letterIndex) => {
    const state = window.QLOBE_DEBUG.getState();
    return state.letterIndex > letterIndex || state.screen === 'reward';
  }, before.letterIndex, { timeout: 10_000 });
  return page.evaluate(() => window.QLOBE_DEBUG.getState());
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  const sessions = [];
  try {
    const landscape = await open(browser, { width: 1280, height: 800 });
    sessions.push(landscape);
    const page = landscape.page;
    await waitReady(page);
    await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(20));

    let state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('splash boots ready', state.screen === 'splash' && state.mode === null, JSON.stringify(state));
    const modes = await page.evaluate(() => window.QLOBE_DEBUG.listModes());
    check('three canonical modes registered', modes.map(({ id }) => id).join(',') === 'picture-code,secret-words,moon-memory', JSON.stringify(modes));
    check('three raster envelope choices render', await page.locator('.mode-envelope img').count() === 3);
    const splashImages = await page.locator('.splash-screen img').evaluateAll((images) => images.map((image) => ({ src: image.currentSrc, width: image.naturalWidth })));
    check('splash production art decodes', splashImages.length >= 5 && splashImages.every(({ width }) => width > 0), JSON.stringify(splashImages));
    let sizes = await targetSizes(page);
    check('splash controls meet 96px floor', undersized(sizes).length === 0, JSON.stringify(undersized(sizes)));
    await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

    // Actual envelope and stamp clicks exercise unlock, shared tap routing, and retry.
    await page.locator('[data-target="mode-picture-code"]').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().mode === 'picture-code');
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    const wrong = ['star', 'moon', 'heart'].find((id) => id !== state.expected);
    await page.locator(`[data-target="stamp-${wrong}"]`).click();
    let afterWrong = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('wrong picture stamp is a gentle retry', afterWrong.inputIndex === 0 && afterWrong.wrongAttempts === 1 && afterWrong.screen === 'play', JSON.stringify(afterWrong));
    await page.screenshot({ path: path.join(shots, '02-picture-gentle-retry.png') });
    await page.locator(`[data-target="stamp-${state.targetSequence[0]}"]`).click();
    await page.waitForTimeout(70);
    await page.screenshot({ path: path.join(shots, '02b-picture-stamp-land.png') });
    for (const id of state.targetSequence.slice(1)) await page.locator(`[data-target="stamp-${id}"]`).click();
    await waitReward(page);
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('real picture-code taps deliver a message', state.screen === 'reward' && state.messagesDelivered === 1, JSON.stringify(state));
    await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some(({ key }) => key === 'delivered'), null, { timeout: 15_000 });
    await waitRewardSettled(page);
    await page.screenshot({ path: path.join(shots, '03-picture-delivery.png') });

    await page.locator('[data-target="reward-next"]').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('next advances to a fresh authored round', state.round === 1 && state.inputIndex === 0, JSON.stringify(state));
    await page.locator('[data-target="back-play"]').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash');
    check('play back returns in-page to splash', (await page.evaluate(() => window.QLOBE_DEBUG.getState().mode)) === null);

    // Sound is a true mute toggle, including the recorded BGM channel.
    await page.locator('[data-target="sound-splash"]').click();
    let audioState = await page.evaluate(() => ({ state: window.QLOBE_DEBUG.getState(), bgm: window.QLOBE_DEBUG.getBgmStats() }));
    check('sound control mutes voice, SFX, and BGM state', audioState.state.muted && audioState.bgm.muted, JSON.stringify(audioState));
    await page.locator('[data-target="sound-splash"]').click();
    audioState = await page.evaluate(() => ({ state: window.QLOBE_DEBUG.getState(), bgm: window.QLOBE_DEBUG.getBgmStats() }));
    check('sound control unmutes all channels', !audioState.state.muted && !audioState.bgm.muted, JSON.stringify(audioState));

    // Moon Memory must hide before accepting input and model after a miss.
    await startMode(page, 'moon-memory');
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().memoryPhase === 'copy');
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('moon code enters hidden copy phase', state.memoryPhase === 'copy' && !state.inputLocked, JSON.stringify(state));
    const memoryWrong = ['star', 'moon', 'heart'].find((id) => id !== state.expected);
    const wrongCountBeforeMemoryMiss = state.wrongAttempts;
    await page.locator(`[data-target="stamp-${memoryWrong}"]`).click();
    afterWrong = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('memory miss increments once, keeps place, and opens a gentle peek',
      afterWrong.inputIndex === 0
        && afterWrong.wrongAttempts === wrongCountBeforeMemoryMiss + 1
        && ['peek', 'copy'].includes(afterWrong.memoryPhase),
      JSON.stringify(afterWrong));
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().memoryPhase === 'copy');
    await page.waitForTimeout(550);
    const memoryVisual = await page.evaluate(() => {
      const prompt = document.querySelector('#memory-sequence');
      const cover = document.querySelector('#memory-cover');
      const image = cover?.querySelector('img');
      const slot = document.querySelector('#memory-copy .copy-slot');
      const imageRect = image?.getBoundingClientRect();
      const slotRect = slot?.getBoundingClientRect();
      return {
        promptVisibility: prompt ? getComputedStyle(prompt).visibility : 'missing',
        coverOpacity: cover ? Number(getComputedStyle(cover).opacity) : 0,
        imageBottom: imageRect?.bottom || 0,
        slotTop: slotRect?.top || 0,
      };
    });
    check('settled moon envelope fully conceals the prompt without covering copy slots',
      memoryVisual.promptVisibility === 'hidden'
        && memoryVisual.coverOpacity > .99
        && memoryVisual.imageBottom <= memoryVisual.slotTop + 2,
      JSON.stringify(memoryVisual));
    await page.screenshot({ path: path.join(shots, '04-moon-memory-hidden.png') });
    await page.evaluate(() => window.QLOBE_DEBUG.completeRound());
    await waitReward(page);
    check('moon-memory round completes through canonical input', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'reward');

    // Secret Words: cancel safely, then trace with genuine pointer movement.
    await startMode(page, 'secret-words');
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('word round exposes a real letter tracer', state.trace?.strokes > 0 && state.currentLetter, JSON.stringify(state));
    const cancelPoint = (await page.evaluate(() => window.QLOBE_DEBUG.tracePoints()))[0];
    await page.locator('#trace-canvas').dispatchEvent('pointerdown', {
      pointerId: 41, pointerType: 'touch', isPrimary: true,
      clientX: cancelPoint.x, clientY: cancelPoint.y, bubbles: true,
    });
    await page.locator('#trace-canvas').dispatchEvent('pointercancel', {
      pointerId: 41, pointerType: 'touch', isPrimary: true,
      clientX: cancelPoint.x, clientY: cancelPoint.y, bubbles: true,
    });
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('pointercancel releases without completing or sticking', !state.trace.drawing && state.letterIndex === 0 && state.trace.pointerId === null, JSON.stringify(state.trace));

    await drawCurrentLetterWithPointer(page);
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('real pointer tracing advances one letter', state.letterIndex === 1, JSON.stringify(state));
    await page.screenshot({ path: path.join(shots, '05-word-pointer-traced.png') });

    const beforeKeyboard = state.letterIndex;
    await page.locator('#trace-canvas').focus();
    await page.keyboard.press('Enter');
    await page.waitForFunction((index) => window.QLOBE_DEBUG.getState().letterIndex > index, beforeKeyboard);
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('keyboard switch alternative traces through same handler', state.letterIndex === beforeKeyboard + 1, JSON.stringify(state));
    await page.keyboard.press('Space');
    await waitReward(page);
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('three traced letters reveal the delivery tableau', state.screen === 'reward' && state.word?.length === 3, JSON.stringify(state));
    await waitRewardSettled(page);
    await page.screenshot({ path: path.join(shots, '06-word-delivery.png') });

    // Finish each mode to prove final/again state and debug hooks are truthful.
    await startMode(page, 'picture-code');
    let finalState = await finishMode(page);
    check('picture-code completes all four rounds', finalState.rewardFinal && finalState.messagesDelivered === 4, JSON.stringify(finalState));
    await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some(({ key }) => key === 'cheer'), null, { timeout: 20_000 });
    await startMode(page, 'moon-memory');
    finalState = await finishMode(page);
    check('moon-memory completes all four rounds', finalState.rewardFinal && finalState.messagesDelivered === 4, JSON.stringify(finalState));
    await startMode(page, 'secret-words');
    finalState = await finishMode(page);
    check('secret-words completes SUN CAT MAP OWL set', finalState.rewardFinal && finalState.messagesDelivered === 4, JSON.stringify(finalState));
    await waitRewardSettled(page);
    await page.screenshot({ path: path.join(shots, '07-final-cheer.png') });

    const audioLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    check('recorded clips decode for instructions and delivery praise',
      audioLog.some(({ key, kind }) => key === 'word-intro' && kind === 'clip')
        && audioLog.some(({ key, kind }) => key === 'delivered' && kind === 'clip')
        && audioLog.some(({ key, kind }) => key === 'cheer' && kind === 'clip'),
      JSON.stringify(audioLog.slice(-12)));
    const debugTargets = await page.evaluate(() => window.QLOBE_DEBUG.targets());
    check('debug targets report only visible controls', debugTargets.length >= 3 && debugTargets.every(({ rect }) => rect.w > 0 && rect.h > 0), JSON.stringify(debugTargets));

    const portrait = await open(browser, { width: 768, height: 1024 });
    sessions.push(portrait);
    await waitReady(portrait.page);
    await portrait.page.evaluate(() => window.QLOBE_DEBUG.fastTimers(20));
    await portrait.page.screenshot({ path: path.join(shots, '08-splash-portrait.png') });
    await startMode(portrait.page, 'picture-code');
    sizes = await targetSizes(portrait.page);
    check('portrait controls meet 96px floor', undersized(sizes).length === 0, JSON.stringify(undersized(sizes)));
    const paperRect = await portrait.page.locator('.paper-sheet').boundingBox();
    check('portrait paper remains large and on-screen', paperRect && paperRect.width >= 600 && paperRect.y >= 0 && paperRect.y + paperRect.height <= 1024, JSON.stringify(paperRect));
    await portrait.page.screenshot({ path: path.join(shots, '09-picture-portrait.png') });

    const reduced = await open(browser, { width: 1280, height: 800 }, 'reduce');
    sessions.push(reduced);
    await waitReady(reduced.page);
    await reduced.page.evaluate(() => window.QLOBE_DEBUG.fastTimers(20));
    await startMode(reduced.page, 'secret-words');
    const reducedState = await reduced.page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('reduced-motion tracing remains interactive', reducedState.reducedMotion && reducedState.trace?.strokes > 0, JSON.stringify(reducedState));
    await reduced.page.screenshot({ path: path.join(shots, '10-word-reduced-motion.png') });

    const errors = sessions.flatMap((session) => session.errors);
    const failed = sessions.flatMap((session) => session.failed);
    const remote = sessions.flatMap((session) => session.remote);
    check('zero page errors', errors.length === 0, errors.join(' | '));
    check('zero failed local or asset responses', failed.length === 0, failed.join(' | '));
    check('zero unexpected remote runtime requests', remote.length === 0, remote.join(' | '));
  } finally {
    await Promise.all(sessions.map((session) => session.context.close().catch(() => {})));
    await browser.close();
  }
  finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
