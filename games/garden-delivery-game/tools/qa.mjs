#!/usr/bin/env node
// Usage: node games/garden-delivery-game/tools/qa.mjs --base http://127.0.0.1:8000 --shots <output-dir>
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { baseUrl, loadPlaywright, resolveShots } from '../../../tools/qa/lib/driver.mjs';
const { chromium } = loadPlaywright();
const base = baseUrl();
const shots = resolveShots('tmp/garden-delivery-qa');
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];
const isExpectedRemote = (url) => PLATFORM_ANALYTICS.some((prefix) => url.startsWith(prefix));
const checks = [];
const check = (name, ok, detail = '') => { checks.push(Boolean(ok)); console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`); };
async function open(browser, viewport, url = `${base}/games/garden-delivery-game/`, waitForGame = true, contextOptions = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, ...contextOptions }); const page = await context.newPage();
  const errors = [], failed = [], remote = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  page.on('request', r => {
    if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !isExpectedRemote(r.url())) remote.push(r.url());
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  if (waitForGame) await page.evaluate(() => window.QLOBE_DEBUG.ready);
  return { page, context, errors, failed, remote };
}
async function checkSlowAudioStartup(browser) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const page = await context.newPage();
  let releaseAudio;
  const audioGate = new Promise((resolve) => { releaseAudio = resolve; });
  await page.route('**/games/garden-delivery-game/assets/audio/*.json', async (route) => {
    await audioGate;
    await route.abort();
  });
  await page.goto(`${base}/games/garden-delivery-game/`, { waitUntil: 'domcontentloaded' });
  await page.locator('.map-screen').waitFor({ timeout: 1000 });
  check('slow audio metadata never blocks the map', await page.locator('.map-screen').count() === 1);
  const readyWithinDeadline = await Promise.race([
    page.evaluate(() => window.QLOBE_DEBUG.ready).then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 3200)),
  ]);
  check('debug ready has a bounded audio deadline', readyWithinDeadline);
  releaseAudio();
  await context.close();
}
async function winMode(page, id) {
  await page.locator(`[data-mode="${id}"]`).click();
  await page.evaluate(() => window.QLOBE_DEBUG.setTiltStatus('denied'));
  check(`${id} denied fallback status`, (await page.evaluate(() => window.QLOBE_DEBUG.getState().input.status)) === 'denied');
  await page.evaluate(() => window.QLOBE_DEBUG.setTilt(0, 0, 'debug'));
  const n = { rose: 3, tulip: 4, daisy: 5 }[id];
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().stableProgress > 0.04);
  check(`${id} centered input advances`, (await page.evaluate(() => window.QLOBE_DEBUG.getState().stableProgress)) > 0.04);
  await page.screenshot({ path: path.join(shots, `${id}-balance-centered.png`) });
  await page.evaluate(() => window.QLOBE_DEBUG.setTilt(1, 0, 'debug')); await page.waitForTimeout(20);
  await page.screenshot({ path: path.join(shots, `${id}-balance-spilling.png`) });
  await page.evaluate(() => window.QLOBE_DEBUG.setTilt(0, 0, 'debug'));
  for (let i = 0; i < n; i++) await page.evaluate(() => window.QLOBE_DEBUG.completeStep());
  check(`${id} balance reaches pour`, (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'pour');
  await page.screenshot({ path: path.join(shots, `${id}-pour-00.png`) });
  await page.evaluate(() => window.QLOBE_DEBUG.setTilt(.8, 0, 'debug'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().pourProgress > 0.45);
  await page.evaluate(() => window.QLOBE_DEBUG.pauseInput());
  check(`${id} held tip pours`, (await page.evaluate(() => window.QLOBE_DEBUG.getState().pourProgress)) > 0.25);
  await page.screenshot({ path: path.join(shots, `${id}-pour-50.png`) });
  await page.evaluate(() => window.QLOBE_DEBUG.setTilt(.8, 0, 'debug'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().pourProgress > 0.84);
  await page.evaluate(() => window.QLOBE_DEBUG.pauseInput());
  await page.screenshot({ path: path.join(shots, `${id}-pour-90.png`) });
  const streamGeometry = await page.locator('.water-stream').evaluate((stream) => {
    const box = stream.getBoundingClientRect();
    const sunny = document.querySelector('.scene-sunny')?.getBoundingClientRect();
    const flower = document.querySelector('.flower-socket')?.getBoundingClientRect();
    const anchor = {
      x: stream.offsetLeft + stream.offsetWidth / 2,
      y: stream.offsetTop,
    };
    const bucketLip = {
      x: sunny.left + sunny.width * .74,
      y: sunny.top + sunny.height * .545,
    };
    return { box, flower, sourceDistance: Math.hypot(anchor.x - bucketLip.x, anchor.y - bucketLip.y) };
  });
  check(`${id} stream starts at carried bucket`, streamGeometry.sourceDistance < 72, `distance ${streamGeometry.sourceDistance.toFixed(1)}px`);
  check(`${id} stream reaches flower bed`, streamGeometry.box.right >= streamGeometry.flower.left + streamGeometry.flower.width * .45 && streamGeometry.box.bottom >= streamGeometry.flower.top + streamGeometry.flower.height * .68);
  await page.screenshot({ path: path.join(shots, `${id}-pour-landscape.png`) });
  await page.evaluate(() => window.QLOBE_DEBUG.completePour());
  check(`${id} blooms`, (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'bloom');
  await page.screenshot({ path: path.join(shots, `${id}-bloom.png`) });
  await page.locator('[data-action="next"]').click();
}
async function main() {
  await mkdir(shots, { recursive: true }); const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
  await checkSlowAudioStartup(browser);
  const run = await open(browser, { width: 1180, height: 820 }); const { page } = run;
  check('map splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'map');
  check('music waits for child gesture', (await page.evaluate(() => window.QLOBE_DEBUG.music().playing)) === false);
  check('three modes registered', (await page.evaluate(() => window.QLOBE_DEBUG.listModes().length)) === 3);
  await page.screenshot({ path: path.join(shots, '01-map-landscape.png') });
  await page.locator('[data-mode="rose"]').click(); check('balance starts', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'balance');
  check('music starts after flower gesture', (await page.evaluate(() => window.QLOBE_DEBUG.music().playing)) === true);
  check('balance rail keeps both rounded caps', await page.locator('.balance-screen .rail-art').evaluate((image) => image.complete && image.naturalWidth / image.naturalHeight > 2.8));
  await page.locator('[data-rail]').dispatchEvent('pointerdown', { clientX: 200, clientY: 200, pointerId: 1, bubbles: true });
  const heldBeforeRotation = await page.evaluate(() => window.QLOBE_DEBUG.getState().pointerHeld);
  await page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
  const afterRotation = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('orientationchange releases stale pointer', heldBeforeRotation && afterRotation.pointerHeld === false && afterRotation.inputReady === false);
  await page.evaluate(() => window.QLOBE_DEBUG.setTiltStatus('unavailable')); check('unavailable fallback status', (await page.evaluate(() => window.QLOBE_DEBUG.getState().input.status)) === 'unavailable');
  await page.locator('[data-rail]').focus(); await page.keyboard.press('Home');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().stableProgress > 0.04);
  check('keyboard centers and advances balance', (await page.evaluate(() => window.QLOBE_DEBUG.getState().input.source)) === 'keyboard');
  check('keyboard value is visible', (await page.locator('[data-input-status]').textContent()).includes('Bucket centered'));
  await page.keyboard.press('End'); await page.waitForTimeout(30);
  check('keyboard can reach spill edge', await page.locator('.rail-area.is-spilling').count() === 1);
  for (let i = 0; i < 3; i++) await page.evaluate(() => window.QLOBE_DEBUG.completeStep());
  check('keyboard route reaches pour', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'pour');
  await page.locator('[data-rail]').focus(); await page.keyboard.press('End');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().pourProgress > 0.05);
  check('keyboard can tip and pour', (await page.evaluate(() => window.QLOBE_DEBUG.getState().input.source)) === 'keyboard');
  const pourBeforeBlur = await page.evaluate(() => window.QLOBE_DEBUG.getState().pourProgress);
  await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await page.waitForTimeout(120);
  const afterBlur = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('keyboard blur releases continuous input', afterBlur.inputReady === false && afterBlur.pourProgress - pourBeforeBlur < 0.02);
  await page.evaluate(() => window.QLOBE_DEBUG.mute(false));
  check('mute false state', (await page.evaluate(() => window.QLOBE_DEBUG.getState().muted)) === false);
  await page.locator('[data-action="sound"]').click();
  const audioLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  check('audio log records prompt', audioLog.length > 0);
  check('recorded clip selected', audioLog.some((entry) => entry.kind === 'clip'));
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true)); check('mute true state', (await page.evaluate(() => window.QLOBE_DEBUG.getState().muted)) === true);
  check('music follows mute', (await page.evaluate(() => window.QLOBE_DEBUG.music().muted)) === true);
  await page.locator('[data-action="back"]').click(); check('back returns map', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'map');
  for (const id of ['rose', 'tulip', 'daisy']) await winMode(page, id);
  check('all-three party appears', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'party');
  check('party background is ready at transition', await page.locator('.party-screen .garden-plate').evaluate((image) => image.complete && image.naturalWidth >= 1000));
  await page.screenshot({ path: path.join(shots, '02-party-landscape.png') }); await page.locator('[data-action="party-map"]').click();
  check('replay returns map', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'map');
  const portrait = await open(browser, { width: 600, height: 900 }); await portrait.page.screenshot({ path: path.join(shots, '03-map-portrait.png') });
  check('portrait clean', portrait.errors.length === 0 && portrait.failed.length === 0, [...portrait.errors, ...portrait.failed].join(' | '));
  check('portrait no unexpected off-origin requests', portrait.remote.length === 0, portrait.remote.join(' | ')); await portrait.context.close();
  const hub = await open(browser, { width: 1180, height: 820 }, `${base}/#movement-outdoor`, false);
  const hubTile = hub.page.locator('a.game-card[data-game-id="garden-delivery-game"]');
  await hubTile.waitFor();
  await hubTile.scrollIntoViewIfNeeded();
  await hubTile.locator('img').evaluate((image) => image.decode().catch(() => {}));
  check('hub registers playable Garden Delivery tile', await hubTile.count() === 1);
  check('hub tile art decodes', await hubTile.locator('img').evaluate((image) => image.complete && image.naturalWidth >= 640));
  await hub.page.screenshot({ path: path.join(shots, '04-hub-movement-outdoor.png') });
  check('hub clean', hub.errors.length === 0 && hub.failed.length === 0, [...hub.errors, ...hub.failed].join(' | '));
  check('hub no unexpected off-origin requests', hub.remote.length === 0, hub.remote.join(' | '));
  await hub.context.close();
  const reduced = await open(browser, { width: 600, height: 900 }, `${base}/games/garden-delivery-game/`, true, { reducedMotion: 'reduce' });
  check('reduced-motion map stays clean', await reduced.page.locator('.map-screen').count() === 1 && reduced.errors.length === 0 && reduced.failed.length === 0);
  await reduced.page.screenshot({ path: path.join(shots, '05-map-reduced-motion.png') });
  await reduced.page.locator('[data-mode="rose"]').click();
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.setTilt(0, 0, 'debug'));
  await reduced.page.evaluate(() => { for (let i = 0; i < 3; i++) window.QLOBE_DEBUG.completeStep(); });
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.setTilt(.8, 0, 'debug'));
  await reduced.page.waitForFunction(() => window.QLOBE_DEBUG.getState().pourProgress > 0.48);
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.pauseInput());
  await reduced.page.screenshot({ path: path.join(shots, '06-portrait-pour-half.png') });
  check('portrait pour stream connects', await reduced.page.locator('.water-stream').evaluate((stream) => stream.getBoundingClientRect().height > 0));
  await reduced.context.close();
  check('landscape clean', run.errors.length === 0 && run.failed.length === 0, [...run.errors, ...run.failed].join(' | ')); check('no unexpected off-origin requests', run.remote.length === 0, run.remote.join(' | '));
  await run.context.close();
  } finally {
    await browser.close();
  }
  if (checks.includes(false)) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
