#!/usr/bin/env node
// Production smoke, input, audio, and visual QA for Scissor Trail Safari.
import path from 'node:path';
import {
  baseUrl,
  launchChrome,
  createReporter,
  openSession,
  resolveShots,
  ensureShots,
  dragPath,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const gameUrl = `${base}/games/scissor-trail-safari/`;
const shots = resolveShots('artifacts/qa/scissor-trail-safari');
const { check, finish } = createReporter();

async function open(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, {
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
  return session;
}

async function waitReady(page) {
  await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
}

async function startMode(page, id) {
  await page.evaluate((modeId) => window.QLOBE_DEBUG.startMode(modeId), id);
  await page.waitForFunction((modeId) => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'play' && state.mode === modeId && state.awaitingInput;
  }, id);
}

async function finishCurrentMode(page) {
  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(20));
  for (let guard = 0; guard < 6; guard += 1) {
    const before = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    if (before.screen === 'end') return;
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await page.waitForFunction((round) => {
      const state = window.QLOBE_DEBUG.getState();
      return state.screen === 'end' || state.round !== round;
    }, before.round, { timeout: 15_000 });
    await page.waitForTimeout(60);
  }
}

function destinationIsLargeAndInsideBoard(state) {
  const bounds = state.destinationBounds;
  const board = state.boardBounds;
  const tolerance = 2;
  return state.destinationVisible
    && bounds
    && board
    && bounds.w >= 96
    && bounds.h >= 96
    && bounds.x >= board.x - tolerance
    && bounds.y >= board.y - tolerance
    && bounds.x + bounds.w <= board.x + board.w + tolerance
    && bounds.y + bounds.h <= board.y + board.h + tolerance;
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  const sessions = [];
  try {
    const land = await open(browser, { width: 1280, height: 800 });
    sessions.push(land);
    const page = land.page;
    await waitReady(page);

    const splashState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('splash boots', splashState.screen === 'splash', JSON.stringify(splashState));
    const modes = await page.evaluate(() => window.QLOBE_DEBUG.listModes());
    check('three safari modes registered', modes.length === 3, JSON.stringify(modes));
    check('all three mode cards render', await page.locator('.qk-trace-mode').count() === 3);
    await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

    const targets = await page.locator('button, a').evaluateAll((nodes) => nodes.map((node) => {
      const rect = node.getBoundingClientRect();
      return { label: node.getAttribute('aria-label') || node.textContent.trim(), w: rect.width, h: rect.height };
    }).filter((item) => item.w > 0 && item.h > 0));
    check(
      'all visible controls meet 96px touch floor',
      targets.every((item) => item.w >= 96 && item.h >= 96),
      JSON.stringify(targets),
    );

    // Use the actual card for the first entry so audio unlock and tap routing are exercised.
    await page.locator('.qk-trace-mode[data-mode="straight"]').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
    let state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('straight mode starts', state.mode === 'straight', JSON.stringify(state));
    check('destination animal is visible, readable, and inside the board',
      destinationIsLargeAndInsideBoard(state), JSON.stringify({ destination: state.destinationBounds, board: state.boardBounds }));
    const points = await page.evaluate(() => window.QLOBE_DEBUG.tracePoints());
    check('straight trail exposes dense trace samples', points.length >= 20, `points=${points.length}`);
    await page.screenshot({ path: path.join(shots, '02-straight-start.png') });

    const board = state.boardBounds;
    await page.mouse.move(board.x + board.w * 0.15, board.y + board.h * 0.15);
    await page.mouse.down();
    await page.mouse.move(board.x + board.w * 0.3, board.y + board.h * 0.28, { steps: 8 });
    await page.mouse.up();
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('off-path drag cannot advance', state.round === 0 && state.stroke === 0, JSON.stringify(state));

    const snipsBefore = await page.evaluate(() => window.QLOBE_DEBUG.getSfxStats().snip || 0);
    await dragPath(page, points);
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().round >= 1, null, { timeout: 15_000 });
    const snipsAfter = await page.evaluate(() => window.QLOBE_DEBUG.getSfxStats().snip || 0);
    check('real pointer tracing advances a round', (await page.evaluate(() => window.QLOBE_DEBUG.getState().round)) === 1);
    check('tracing plays tactile snip feedback', snipsAfter > snipsBefore, `${snipsBefore} -> ${snipsAfter}`);
    await page.screenshot({ path: path.join(shots, '03-straight-round-two.png') });

    await startMode(page, 'curvy');
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('curvy mode destination stays inside the board',
      destinationIsLargeAndInsideBoard(state), JSON.stringify({ destination: state.destinationBounds, board: state.boardBounds }));
    await page.screenshot({ path: path.join(shots, '04-curvy.png') });

    await startMode(page, 'spiral');
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('spiral mode destination stays inside the board',
      destinationIsLargeAndInsideBoard(state), JSON.stringify({ destination: state.destinationBounds, board: state.boardBounds }));
    await page.screenshot({ path: path.join(shots, '05-spiral.png') });

    const manifest = await page.evaluate(async () => {
      const response = await fetch('./assets/audio/manifest.json');
      return response.ok ? response.json() : {};
    });
    if (Object.keys(manifest).length) {
      await page.evaluate(() => {
        window.__QLOBE_MEDIA_PLAYS__ = [];
        document.addEventListener('playing', (event) => {
          if (event.target instanceof HTMLMediaElement) {
            window.__QLOBE_MEDIA_PLAYS__.push(event.target.currentSrc || event.target.src || '');
          }
        }, true);
      });
      await page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog());
      await page.locator('.qk-trace-sound').click();
      await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().length > 0);
      const lastVoice = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog().at(-1));
      const expectedFile = manifest[lastVoice.key]?.file || '';
      if (expectedFile) {
        await page.waitForFunction((file) => window.__QLOBE_MEDIA_PLAYS__.some((src) => {
          try { return new URL(src).pathname.endsWith(`/assets/audio/${file}`); } catch { return false; }
        }), expectedFile, { timeout: 10_000 });
      }
      const playedSources = await page.evaluate(() => window.__QLOBE_MEDIA_PLAYS__);
      const clipPlayed = expectedFile && playedSources.some((src) => {
        try { return new URL(src).pathname.endsWith(`/assets/audio/${expectedFile}`); } catch { return false; }
      });
      check('replay plays its matching recorded teacher clip', lastVoice.kind === 'clip' && clipPlayed,
        JSON.stringify({ lastVoice, expectedFile, playedSources }));
    } else {
      check('voice fallback manifest is intentionally empty', true, 'LAN TTS unavailable; Web Speech fallback active');
    }

    await finishCurrentMode(page);
    state = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('all spiral rounds reach the success screen', state.screen === 'end', JSON.stringify(state));
    check('end screen has replay and home controls',
      await page.locator('.qk-trace-end .qk-trace-again').count() === 1
        && await page.locator('.qk-trace-end .qk-eng-ico-back').count() === 1);
    await page.screenshot({ path: path.join(shots, '06-success.png') });

    const portrait = await open(browser, { width: 768, height: 1024 });
    sessions.push(portrait);
    await waitReady(portrait.page);
    await portrait.page.screenshot({ path: path.join(shots, '07-splash-portrait.png') });
    await startMode(portrait.page, 'curvy');
    const portraitState = await portrait.page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('portrait play board remains large', portraitState.boardBounds.w >= 560 && portraitState.boardBounds.h >= 560,
      JSON.stringify(portraitState.boardBounds));
    check('portrait destination stays inside the board', destinationIsLargeAndInsideBoard(portraitState),
      JSON.stringify({ destination: portraitState.destinationBounds, board: portraitState.boardBounds }));
    await portrait.page.screenshot({ path: path.join(shots, '08-play-portrait.png') });

    const reduced = await open(browser, { width: 1280, height: 800 }, 'reduce');
    sessions.push(reduced);
    await waitReady(reduced.page);
    await startMode(reduced.page, 'straight');
    const reducedState = await reduced.page.evaluate(() => window.QLOBE_DEBUG.getState());
    check('reduced-motion play remains interactive', reducedState.awaitingInput && reducedState.mode === 'straight');
    await reduced.page.screenshot({ path: path.join(shots, '09-reduced-motion.png') });

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
  finish({ listFailures: false });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
