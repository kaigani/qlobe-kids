#!/usr/bin/env node
// Rhythm Copycat — real-Chrome smoke, interaction, responsive, and console gate.
import {
  baseUrl, checkSessionClean, createReporter, debug, ensureShots,
  launchChrome, openSession, resolveShots, shooter, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('/private/tmp/qlobe-rhythm-copycat-shots');
const writeShot = shooter(shots);
ensureShots(shots);
const report = createReporter();
const { check, note, finish } = report;
const sessions = [];
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

async function stubPlatformAnalytics(session) {
  await session.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

async function openGame(browser, viewport, reducedMotion = 'no-preference', mute = true) {
  const s = await openSession(browser, {
    url: `${base}/games/rhythm-copycat/`, base, viewport, reducedMotion,
    goto: false, ready: false, allowRemote: PLATFORM_ANALYTICS,
  });
  await stubPlatformAnalytics(s);
  await s.page.goto(`${base}/games/rhythm-copycat/`, { waitUntil: 'networkidle' });
  await s.page.evaluate(() => window.QLOBE_DEBUG.ready);
  await debug.seed(s.page, 42);
  await debug.mute(s.page, mute);
  await debug.fastTimers(s.page, 20);
  sessions.push(s);
  return s;
}

async function shot(page, name) { await writeShot(page, name); }

async function audit(session, label) {
  const a = await session.page.evaluate(() => ({
    targets: window.QLOBE_DEBUG.getTargets(),
    state: window.QLOBE_DEBUG.getState(),
    viewport: { width: innerWidth, height: innerHeight },
    overflow: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
    hud: [...document.querySelectorAll('.qk-hud-btn')].filter((el) => el.offsetParent !== null).map((el) => {
      const pseudo = getComputedStyle(el, '::before');
      return { id: el.dataset.target, w: parseFloat(pseudo.width), h: parseFloat(pseudo.height) };
    }),
  }));
  const undersizedTargets = undersized(a.targets.filter(({ id }) => !['home', 'back', 'sound'].includes(id)), 96);
  const outside = a.targets.filter(({ id, rect }) => {
    if (id === 'home') return false;
    return rect.x < -1 || rect.y < -1 || rect.x + rect.w > a.viewport.width + 1 || rect.y + rect.h > a.viewport.height + 1;
  });
  const undersizedHud = a.hud.filter(({ w, h }) => w < 96 || h < 96);
  check(`${label}: targets >=96px, visible, no overflow, zero console errors/404s`,
    undersizedTargets.length === 0 && undersizedHud.length === 0 && outside.length === 0
      && a.overflow && session.errors.length === 0 && session.failed.length === 0,
    JSON.stringify({ undersized: undersizedTargets, undersizedHud, outside, overflow: a.overflow, errors: session.errors, failed: session.failed }));
}

async function waitScreen(page, name) {
  await page.waitForFunction((n) => window.QLOBE_DEBUG.getState().screen === n, name);
}
async function waitPhase(page, phase) {
  await page.waitForFunction((p) => window.QLOBE_DEBUG.getState().phase === p, phase);
}
async function waitArmed(page) {
  await page.waitForFunction(() => document.querySelector('[data-rc-start]')?.classList.contains('is-armed'));
}

async function playthrough(page, modeId, prefix) {
  await shot(page, `${prefix}-01-splash.png`);
  await debug.tap(page, `mode-${modeId}`);
  await waitScreen(page, 'select');
  await shot(page, `${prefix}-02-select.png`);
  await debug.tap(page, 'card-hop');
  await waitArmed(page);
  await debug.tap(page, 'start');
  await waitScreen(page, 'play');
  await waitPhase(page, 'demo');
  await shot(page, `${prefix}-03-play-demo.png`);
  await waitPhase(page, 'copy');
  await shot(page, `${prefix}-04-play-copy.png`);
  // fill the whole copy phase deterministically
  for (let i = 0; i < 16; i++) {
    const phase = await page.evaluate(() => window.QLOBE_DEBUG.getState().phase);
    if (phase !== 'copy') break;
    await page.evaluate(() => window.QLOBE_DEBUG.fillNext());
    await page.waitForTimeout(50);
  }
  await page.waitForFunction(() => ['song', 'end'].includes(window.QLOBE_DEBUG.getState().phase), { timeout: 60000 });
  await shot(page, `${prefix}-05-play.png`);
}

async function fullRun(session, modeId, label) {
  const page = session.page;
  await debug.tap(page, `mode-${modeId}`);
  await waitScreen(page, 'select');
  await debug.tap(page, 'card-hop');
  await waitArmed(page);
  await debug.tap(page, 'start');
  await waitScreen(page, 'play');
  // finish every round: fill each copy phase as it arrives
  for (let guard = 0; guard < 400; guard++) {
    const st = await page.evaluate(() => window.QLOBE_DEBUG.getState());
    if (st.screen === 'end') break;
    if (st.phase === 'copy') {
      await page.evaluate(() => window.QLOBE_DEBUG.fillNext());
      await page.waitForTimeout(40);
    } else {
      await page.waitForTimeout(60);
    }
  }
  await waitScreen(page, 'end');
  await shot(page, `${label}-06-end.png`);
  await audit(session, `${label} end (full run)`);
  const stars = await page.evaluate(() => window.QLOBE_DEBUG.getState().stars);
  check(`${label} full run reached end with 1-3 stars`, stars >= 1 && stars <= 3, `stars=${stars}`);
}

const browser = await launchChrome();
try {
  {
    const s = await openGame(browser, { width: 1180, height: 820 });
    await playthrough(s.page, 'clap-stomp', 'landscape');
    await audit(s, 'landscape demo/copy');
    await fullRun(s, 'clap-stomp', 'landscape');
    await debug.tap(s.page, 'back');
    await waitScreen(s.page, 'select');
    await audit(s, 'landscape splash after back');
  }
  {
    const s = await openGame(browser, { width: 820, height: 1180 });
    await playthrough(s.page, 'drum-circle', 'portrait');
    // wrong-pad path: on the next copy phase, tap a pad that is not the answer
    await debug.tap(s.page, 'mode-drum-circle');
    await waitScreen(s.page, 'select');
    await debug.tap(s.page, 'card-trot');
    await waitArmed(s.page);
    await debug.tap(s.page, 'start');
    await waitScreen(s.page, 'play');
    await waitPhase(s.page, 'copy');
    await page_eval(s.page, () => {
      const st = window.QLOBE_DEBUG.getState();
      const expected = st.pattern[st.slot];
      const wrong = ['clap', 'stomp', 'tap', 'shake'].find((p) => p !== expected) || 'clap';
      window.QLOBE_DEBUG.tap(`pad-${wrong}`);
    });
    await shot(s.page, 'portrait-07-copy-wrong.png');
    await audit(s, 'portrait copy after wrong tap');
    await fullRun(s, 'drum-circle', 'portrait');
  }
  {
    const s = await openGame(browser, { width: 1180, height: 820, reducedMotion: 'reduce' });
    await playthrough(s.page, 'clap-stomp', 'reduced-motion');
    await audit(s, 'reduced-motion screens');
  }
} finally {
  await browser.close();
}

async function page_eval(page, fn) { await page.evaluate(fn); }

sessions.forEach((session, i) => checkSessionClean(report, session, `run ${i + 1}`));
note(`screenshots in ${shots}`);
finish();