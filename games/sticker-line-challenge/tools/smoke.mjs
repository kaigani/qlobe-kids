#!/usr/bin/env node
// Production-Chrome acceptance and visual-QC driver for Sticker Line Challenge.
// Run from the repo root while the site is served locally:
//   node games/sticker-line-challenge/tools/smoke.mjs --base http://127.0.0.1:8000

import {
  baseUrl,
  debug,
  ensureShots,
  launchChrome,
  openSession,
  checkSessionClean,
  createReporter,
  resolveShots,
  shooter,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const gameUrl = `${base}/games/sticker-line-challenge/`;
const shots = resolveShots('qa-shots/sticker-line-challenge');
await ensureShots(shots);
const { check, finish } = createReporter({ detailOnFail: true });
const shot = shooter(shots);

const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

async function stubAnalytics(session) {
  await session.context.route(
    /https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//,
    (route) => route.fulfill({ status: 204, body: '' }),
  );
}

async function openRun(browser, {
  viewport = { width: 1180, height: 820 },
  reducedMotion = 'no-preference',
  mute = true,
} = {}) {
  const session = await openSession(browser, {
    url: gameUrl,
    base,
    viewport,
    reducedMotion,
    goto: false,
    ready: false,
    allowDataUrls: true,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  await stubAnalytics(session);
  await session.page.goto(gameUrl, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page);
  await debug.waitForReady(session.page);
  await debug.seed(session.page, 42);
  await debug.mute(session.page, mute);
  return session;
}

const state = (page) => debug.getState(page);

// Drive the game's real window pointer handlers along the live sampled path.
async function traceRound(page, modeId, round) {
  await debug.call(page, 'startMode', modeId, round);
  await page.waitForTimeout(500);
  const points = await debug.call(page, 'tracePoints');
  check(`${modeId} r${round} exposes trace points`, Array.isArray(points) && points.length > 20, String(points?.length));
  return debug.call(page, 'trace', points);
}

const browser = await launchChrome();

// ─── landscape run ───────────────────────────────────────────────────────────
{
  const s = await openRun(browser);
  const { page } = s;

  let st = await state(page);
  check('boots to splash', st.screen === 'splash', JSON.stringify(st));
  check('three modes registered', (await debug.listModes(page)).length === 3);
  await shot(page, '01-splash-landscape.png');

  // Wrong-input probe: tapping the canvas away from the buddy must not advance.
  await debug.call(page, 'startMode', 'waves', 0);
  await page.waitForTimeout(500);
  st = await state(page);
  check('startMode lands on play', st.screen === 'play', JSON.stringify(st));
  check('round starts uncompleted', st.completed === false && st.progressFraction === 0, JSON.stringify(st));

  await page.mouse.click(590, 760);
  await page.waitForTimeout(300);
  st = await state(page);
  check('stray tap does not complete', st.completed === false && st.progressFraction === 0, JSON.stringify(st));

  for (const modeId of await debug.listModes(page)) {
    const done = await traceRound(page, modeId, 0);
    check(`${modeId} trace completes`, done.completed === true, JSON.stringify(done));
    check(`${modeId} all checkpoints passed`, done.checkpointsPassed === done.checkpointCount,
      `${done.checkpointsPassed}/${done.checkpointCount}`);
    await page.waitForTimeout(2400);
    st = await state(page);
    check(`${modeId} reaches end screen`, st.screen === 'end', st.screen);
    if (modeId === 'waves') await shot(page, '03-end-landscape.png');
    await page.locator('section:not([hidden]) [data-hud="back"]').click();
    await page.waitForTimeout(400);
    st = await state(page);
    check(`${modeId} back returns to splash`, st.screen === 'splash', st.screen);
  }

  // Peak-trail capture for visual QC.
  await debug.call(page, 'startMode', 'loops', 2);
  await page.waitForTimeout(400);
  const pts = await debug.call(page, 'tracePoints');
  await debug.call(page, 'trace', pts.slice(0, Math.floor(pts.length * 0.55)));
  await page.waitForTimeout(200);
  await shot(page, '02-play-midtrace-landscape.png');
  await debug.winRound(page);
  await page.waitForTimeout(200);
  await shot(page, '02b-play-traced-landscape.png');

  checkSessionClean({ check }, s, 'landscape session');
  await s.close();
}

// ─── portrait run ────────────────────────────────────────────────────────────
{
  const s = await openRun(browser, { viewport: { width: 820, height: 1180 } });
  const { page } = s;
  await shot(page, '04-splash-portrait.png');
  await debug.call(page, 'startMode', 'waves', 0);
  await page.waitForTimeout(500);
  await shot(page, '05-play-portrait.png');
  const done = await traceRound(page, 'waves', 0);
  check('portrait trace completes', done.completed === true, JSON.stringify(done));
  await page.waitForTimeout(2300);
  check('portrait reaches end', (await state(page)).screen === 'end');
  await shot(page, '06-end-portrait.png');
  checkSessionClean({ check }, s, 'portrait session');
  await s.close();
}

// ─── reduced motion ──────────────────────────────────────────────────────────
{
  const s = await openRun(browser, { reducedMotion: 'reduce' });
  const { page } = s;
  await debug.call(page, 'startMode', 'waves', 0);
  await page.waitForTimeout(400);
  const done = await traceRound(page, 'waves', 0);
  check('reduced-motion trace completes', done.completed === true, JSON.stringify(done));
  checkSessionClean({ check }, s, 'reduced-motion session');
  await s.close();
}

finish({ suffix: `; screenshots in ${shots}`, exit: true });
