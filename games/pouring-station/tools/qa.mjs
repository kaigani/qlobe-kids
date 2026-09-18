#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { args, audio, launchChrome, createReporter, resolveShots, ensureShots, shooter } from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const BASE = (args.flag('base', process.env.QLOBE_BASE || 'http://127.0.0.1:8000')).replace(/\/$/, '');
const URL = `${BASE}/games/pouring-station/`;
const { check, finish } = createReporter({ style: 'pad' });
const shot = shooter(resolveShots(path.join(GAME, 'qa-shots')));
const modes = ['water', 'beans', 'rice'];
const platformAnalytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

async function open(browser, viewport, reducedMotion = 'no-preference', contextOptions = {}) {
  const context = await browser.newContext({ viewport, reducedMotion, ...contextOptions });
  const page = await context.newPage();
  const errors = [], remote = [], failed = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', request => {
    const url = request.url();
    if (!url.startsWith(BASE) && !url.startsWith('data:') && !platformAnalytics.some(prefix => url.startsWith(prefix))) remote.push(url);
  });
  page.on('response', response => { if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  return { page, context, errors, remote, failed };
}
const state = page => page.evaluate(() => window.QLOBE_DEBUG.getState());
const debug = (page, expression, ...values) => page.evaluate(({ expression, values }) => window.QLOBE_DEBUG[expression](...values), { expression, values });
const targetsAreLarge = page => page.locator('[data-target]:visible').evaluateAll(es => es.every(e => {
  const r = e.getBoundingClientRect();
  return r.width >= 96 && r.height >= 96;
}));

async function completeMode(page, mode) {
  const started = await debug(page, 'startMode', mode);
  check(`${mode} starts`, started === true || started?.accepted === true, JSON.stringify(started));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
  const pitcher = page.locator('#pitcher');
  const dragToPour = async (holdMs, capture = false) => {
    const box = await pitcher.boundingBox();
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 310, y - 170, { steps: 14 });
    await page.waitForTimeout(holdMs);
    if (capture) await shot(page, '06-play-water-pouring-landscape.png');
    await page.mouse.up();
  };
  await dragToPour(440, mode === 'water');
  const partial = await state(page);
  check(`${mode} real pointer drag creates partial fill`, partial.fill > 0 && partial.fill < partial.target && !partial.dragging && !partial.pouring, JSON.stringify(partial));
  await page.waitForTimeout(620);
  const box = await pitcher.boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 310, y - 170, { steps: 14 });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase !== 'active', null, { timeout: 9000 });
  await page.mouse.up();
  check(`${mode} real pointer resume completes round 1`, (await state(page)).completed === 1);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'active');
  for (let round = 1; round < 3; round += 1) {
    check(`${mode} round ${round + 1} reaches line`, await debug(page, 'pourToLine'));
    if (round < 2) await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'active');
  }
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check(`${mode} reaches reveal`, (await state(page)).screen === 'reveal');
}

async function main() {
  await ensureShots(resolveShots(path.join(GAME, 'qa-shots')));
  const browser = await launchChrome({ channel: args.flag('channel', 'chrome') });
  try {
    const run = await open(browser, { width: 1440, height: 900 });
    const { page } = run;
    await shot(page, '01-splash-landscape.png');
    check('direct landscape boot', (await state(page)).screen === 'splash');
    await page.locator('#splash-hud .qk-hud-top-right').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some(entry => entry.key === 'welcome'));
    const modesFound = await page.evaluate(() => window.QLOBE_DEBUG.listModes().map(mode => mode.id));
    check('debug modes water/beans/rice', modes.every(mode => modesFound.includes(mode)), JSON.stringify(modesFound));
    check('splash targets are at least 96px', await targetsAreLarge(page));
    for (const mode of modes) { await completeMode(page, mode); if (mode !== 'rice') { await page.getByRole('button', { name: 'Choose something else to pour' }).click(); await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash'); } }
    await shot(page, '02-reveal-landscape.png');
    await page.getByRole('button', { name: 'Choose something else to pour' }).click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash');
    check('back/again navigation returns splash', (await state(page)).screen === 'splash');
    const recordings = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog?.() || []);
    const requiredClips = ['welcome', 'water-intro', 'beans-intro', 'rice-intro', 'line-one', 'line-two', 'water-cheer', 'beans-cheer', 'rice-cheer'];
    check('required dialogue uses recorded clips', requiredClips.every(key => audio.heardClip(recordings, key)), JSON.stringify(recordings));
    check('landscape clean session', !run.errors.length && !run.remote.length && !run.failed.length, JSON.stringify(run));
    await run.context.close();

    const portrait = await open(browser, { width: 820, height: 1180 }, 'reduce');
    await shot(portrait.page, '03-splash-portrait.png');
    check('portrait reduced-motion boot', (await state(portrait.page)).screen === 'splash');
    await debug(portrait.page, 'startMode', 'water');
    await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
    await shot(portrait.page, '04-play-portrait.png');
    check('portrait play targets are at least 96px', await targetsAreLarge(portrait.page));
    const keyboardPitcher = portrait.page.locator('#pitcher');
    await keyboardPitcher.focus();
    await portrait.page.keyboard.down('Space');
    await portrait.page.waitForTimeout(440);
    await portrait.page.keyboard.up('Space');
    const keyboardState = await state(portrait.page);
    check('keyboard hold pours and releases cleanly', keyboardState.fill > 0 && !keyboardState.dragging && !keyboardState.pouring, JSON.stringify(keyboardState));
    check('portrait reduced-motion clean session', !portrait.errors.length && !portrait.remote.length && !portrait.failed.length);
    await portrait.context.close();

    const touch = await open(browser, { width: 820, height: 1180 }, 'reduce', { hasTouch: true, isMobile: true });
    await debug(touch.page, 'startMode', 'water');
    await touch.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
    const touchBox = await touch.page.locator('#pitcher').boundingBox();
    const touchState = await touch.page.evaluate(async box => {
      const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const end = { x: start.x - 310, y: start.y - 170 };
      const target = document.querySelector('#pitcher');
      target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: start.x, clientY: start.y }));
      window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: end.x, clientY: end.y }));
      await new Promise(resolve => setTimeout(resolve, 440));
      window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 41, pointerType: 'touch', isPrimary: true, clientX: end.x, clientY: end.y }));
      return window.QLOBE_DEBUG.getState();
    }, touchBox);
    check('touch-context pointer drag pours and releases cleanly', touchState.fill > 0 && touchState.fill < touchState.target && !touchState.dragging && !touchState.pouring, JSON.stringify(touchState));
    check('touch-context session is clean', !touch.errors.length && !touch.remote.length && !touch.failed.length);
    await touch.context.close();

    const narrow = await open(browser, { width: 1024, height: 620 }, 'reduce');
    await shot(narrow.page, '05-splash-short-landscape.png');
    check('short-landscape reduced-motion boot', (await state(narrow.page)).screen === 'splash');
    check('short-landscape clean session', !narrow.errors.length && !narrow.remote.length && !narrow.failed.length);
    await narrow.context.close();

    const hubContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const hubPage = await hubContext.newPage();
    const hubErrors = [], hubFailed = [];
    hubPage.on('pageerror', error => hubErrors.push(String(error)));
    hubPage.on('console', message => { if (message.type() === 'error') hubErrors.push(message.text()); });
    hubPage.on('response', response => { if (response.status() >= 400) hubFailed.push(`${response.status()} ${response.url()}`); });
    await hubPage.goto(`${BASE}/#practical-life`, { waitUntil: 'networkidle' });
    const hubCard = hubPage.locator('a[href*="pouring-station"]').first();
    check('hub exposes the Pouring Station card', await hubCard.isVisible().catch(() => false));
    if (await hubCard.count()) {
      await hubCard.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center' }));
      await hubPage.waitForTimeout(180);
      await hubPage.screenshot({ path: path.join(resolveShots(path.join(GAME, 'qa-shots')), '07-hub-practical-life.png') });
      await Promise.all([
        hubPage.waitForURL('**/games/pouring-station/**'),
        hubCard.click(),
      ]);
      await hubPage.waitForFunction(() => Boolean(window.QLOBE_DEBUG));
      await hubPage.evaluate(() => window.QLOBE_DEBUG.ready);
      check('hub card boots the game route', await hubPage.evaluate(() => window.QLOBE_DEBUG.getState().screen === 'splash'));
    }
    check('hub-to-game session is clean', !hubErrors.length && !hubFailed.length, JSON.stringify({ hubErrors, hubFailed }));
    await hubContext.close();
  } finally { await browser.close(); }
  finish();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
