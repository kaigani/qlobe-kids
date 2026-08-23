#!/usr/bin/env node
// Shadow Chase smoke drive. Usage: node games/shadow-chase/tools/qa.mjs [--base URL] [--shots DIR]
import { baseUrl, loadPlaywright, launchChrome, createReporter, openSession, checkSessionClean, debug, audio, resolveShots, ensureShots } from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('/private/tmp/qlobe-shadow-chase-shots');
const platformAnalytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const { check, finish } = createReporter({ style: 'ok' });
const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: false });
const url = `${base}/games/shadow-chase/`;

function discardExpectedAnalyticsAborts(session) {
  const kept = session.failed.filter((entry) => !platformAnalytics.some((prefix) => entry.startsWith(prefix)));
  session.failed.splice(0, session.failed.length, ...kept);
}

async function waitPlay(page) {
  await page.waitForFunction(() => ['match', 'sun', 'show'].includes(QLOBE_DEBUG.getState().phase), null, { timeout: 15000 });
}
async function advance(page, count) {
  for (let i = 0; i < count; i += 1) {
    await debug.winRound(page);
    await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'reveal' || QLOBE_DEBUG.getState().screen === 'end', null, { timeout: 10000 });
    if ((await debug.getState(page)).screen !== 'end') await debug.tap(page, 'next');
    await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'end' || QLOBE_DEBUG.getState().phase !== 'reveal', null, { timeout: 10000 });
  }
}

async function targetsMeetFloor(page) {
  return (await debug.getTargets(page)).every((target) => target.rect.w >= 96 && target.rect.h >= 96);
}

async function main() {
  await ensureShots(shots);
  const { chromium } = await loadPlaywright();
  const browser = await launchChrome({ chromium });
  const run = await openSession(browser, {
    url, base, viewport: { width: 1180, height: 820 }, seed: 42, mute: false,
    allowAbortedMedia: true, allowRemote: platformAnalytics,
  });
  const { page } = run;
  const splash = await debug.getState(page);
  check('landscape splash boots', splash.screen === 'splash');
  check('modes are match/sun/show', JSON.stringify((await debug.listModes(page)).map((m) => m.id)) === '["match","sun","show"]');
  check('splash targets are at least 96px', await targetsMeetFloor(page));
  await shot(page, '01-splash-landscape');
  await debug.startMode(page, 'match'); await waitPlay(page);
  const matchTargets = await debug.getTargets(page);
  const wrong = matchTargets.find((t) => t.role === 'wrong');
  if (wrong) await debug.tap(page, wrong.id);
  check('wrong match remains playable', wrong && (await debug.getState(page)).screen === 'play');
  await shot(page, '02-match-wrong');
  await advance(page, 4);
  check('match reaches collection end', (await debug.getState(page)).screen === 'end');
  await page.waitForTimeout(750);
  await shot(page, '03-match-end');
  await debug.tap(page, 'back');
  await debug.startMode(page, 'sun'); await waitPlay(page);
  const rail = await page.locator('.sun-track-wrap').boundingBox();
  const firstHandle = await page.locator('.sun-handle').boundingBox();
  check('sun rail and handle render for physical drag QA', Boolean(rail && firstHandle));
  if (rail && firstHandle) {
    await page.mouse.move(firstHandle.x + firstHandle.width / 2, firstHandle.y + firstHandle.height / 2);
    await page.mouse.down();
    await page.mouse.move(rail.x + rail.width * (0.07 + 0.86 * 0.41), firstHandle.y + firstHandle.height / 2, { steps: 6 });
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
    await page.mouse.up();
    const afterCancel = (await debug.getState(page)).sunT;
    const secondHandle = await page.locator('.sun-handle').boundingBox();
    if (secondHandle) {
      await page.mouse.move(secondHandle.x + secondHandle.width / 2, secondHandle.y + secondHandle.height / 2);
      await page.mouse.down();
      await page.mouse.move(rail.x + rail.width * (0.07 + 0.86 * 0.63), secondHandle.y + secondHandle.height / 2, { steps: 6 });
      await page.mouse.up();
    }
    const afterSecondDrag = (await debug.getState(page)).sunT;
    check('real pointer drag updates the continuous sun state', Math.abs(afterCancel - 0.41) < 0.04);
    check('pointer cancel releases capture for the next drag', Math.abs(afterSecondDrag - 0.63) < 0.04);
  }
  for (const [name, value] of [['low-left', 0.08], ['noon', 0.5], ['low-right', 0.92]]) {
    await debug.call(page, 'previewSun', value);
    await shot(page, `04-sun-${name}`);
  }
  await advance(page, 4); check('sun reaches collection end', (await debug.getState(page)).screen === 'end');
  await debug.tap(page, 'back'); await debug.startMode(page, 'show');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'show-choose', null, { timeout: 10000 });
  const toy = (await debug.getTargets(page)).find((t) => t.id.startsWith('toy-'));
  if (toy) await debug.tap(page, toy.id);
  await waitPlay(page); await shot(page, '05-show-morning');
  await debug.call(page, 'togglePlayback');
  check('whole-day playback exposes a raster pause control', (await debug.getState(page)).sunPlayback === true
    && await page.locator('.pause-icon:visible').count() === 1);
  await shot(page, '05-show-playing');
  await debug.call(page, 'togglePlayback');
  check('whole-day playback can pause immediately', (await debug.getState(page)).sunPlayback === false);
  await debug.tap(page, 'time-noon');
  check('noon card updates the spoken state', (await debug.getState(page)).currentVoiceKey === 'show-noon');
  await shot(page, '06-show-noon');
  await debug.tap(page, 'time-evening');
  check('evening card updates the spoken state', (await debug.getState(page)).currentVoiceKey === 'show-evening');
  await shot(page, '06-show-evening');
  await debug.call(page, 'togglePlayback');
  await debug.tap(page, 'back');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'splash');
  await page.waitForTimeout(1700);
  check('Back cancels active whole-day playback without late navigation', (await debug.getState(page)).screen === 'splash'
    && (await debug.getState(page)).sunPlayback === false);
  await debug.startMode(page, 'show');
  await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'show-choose');
  await debug.winRound(page);
  await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'show' && QLOBE_DEBUG.getState().complete);
  await debug.tap(page, 'done');
  check('show reaches collection end', (await debug.getState(page)).screen === 'end');
  const log = await debug.getAudioLog(page); check('recorded voice clip heard', audio.heardClip(log, 'show-intro') || log.some((e) => e.kind === 'clip'));
  discardExpectedAnalyticsAborts(run);
  checkSessionClean({ check }, run, 'landscape'); await run.close();

  const portrait = await openSession(browser, {
    url, base, viewport: { width: 820, height: 1180 }, reducedMotion: 'reduce', seed: 7,
    fastTimers: true, mute: true, allowRemote: platformAnalytics,
  });
  check('portrait splash targets are at least 96px', await targetsMeetFloor(portrait.page));
  await shot(portrait.page, '07-portrait-splash-reduced');
  await debug.startMode(portrait.page, 'match'); await waitPlay(portrait.page);
  check('portrait match targets are at least 96px', await targetsMeetFloor(portrait.page));
  await shot(portrait.page, '08-portrait-match');
  await debug.winRound(portrait.page);
  await portrait.page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'reveal');
  await portrait.page.waitForFunction(() => {
    const toy = document.querySelector('.reveal-toy');
    return toy?.complete && toy.naturalWidth > 0 && Number.parseFloat(getComputedStyle(toy).opacity) >= 0.99;
  });
  await shot(portrait.page, '09-portrait-reveal');
  await debug.tap(portrait.page, 'back');
  await debug.startMode(portrait.page, 'sun'); await waitPlay(portrait.page);
  await debug.call(portrait.page, 'previewSun', 0.92);
  check('portrait sun targets are at least 96px', await targetsMeetFloor(portrait.page));
  await shot(portrait.page, '10-portrait-sun');
  await debug.tap(portrait.page, 'back');
  await debug.startMode(portrait.page, 'show');
  await portrait.page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'show-choose');
  await shot(portrait.page, '11-portrait-show-chooser');
  const portraitToy = (await debug.getTargets(portrait.page)).find((target) => target.id.startsWith('toy-'));
  if (portraitToy) await debug.tap(portrait.page, portraitToy.id);
  await waitPlay(portrait.page);
  check('portrait show targets are at least 96px', await targetsMeetFloor(portrait.page));
  await shot(portrait.page, '12-portrait-show');
  await debug.winRound(portrait.page); await debug.tap(portrait.page, 'done');
  await portrait.page.waitForFunction(() => {
    const toy = document.querySelector('.end-toy');
    return toy?.complete && toy.naturalWidth > 0 && Number.parseFloat(getComputedStyle(toy).opacity) >= 0.99;
  });
  await shot(portrait.page, '13-portrait-end');
  discardExpectedAnalyticsAborts(portrait);
  checkSessionClean({ check }, portrait, 'portrait/reduced-motion'); await portrait.close();

  const compact = await openSession(browser, {
    url, base, viewport: { width: 1024, height: 600 }, reducedMotion: 'reduce', seed: 19,
    fastTimers: true, mute: true, allowRemote: platformAnalytics,
  });
  check('compact splash targets are at least 96px', await targetsMeetFloor(compact.page));
  await shot(compact.page, '14-compact-splash');
  await debug.startMode(compact.page, 'match'); await waitPlay(compact.page);
  check('compact match targets are at least 96px', await targetsMeetFloor(compact.page));
  await shot(compact.page, '15-compact-match');
  await debug.tap(compact.page, 'back');
  await debug.startMode(compact.page, 'sun'); await waitPlay(compact.page);
  await debug.call(compact.page, 'previewSun', 0.08);
  check('compact sun targets are at least 96px', await targetsMeetFloor(compact.page));
  await shot(compact.page, '16-compact-sun');
  await debug.tap(compact.page, 'back');
  await debug.startMode(compact.page, 'show');
  await compact.page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'show-choose');
  const compactToy = (await debug.getTargets(compact.page)).find((target) => target.id.startsWith('toy-'));
  if (compactToy) await debug.tap(compact.page, compactToy.id);
  await waitPlay(compact.page);
  check('compact show targets are at least 96px', await targetsMeetFloor(compact.page));
  await shot(compact.page, '17-compact-show');
  discardExpectedAnalyticsAborts(compact);
  checkSessionClean({ check }, compact, 'compact/reduced-motion'); await compact.close();
  await browser.close(); finish({ suffix: `; shots in ${shots}` });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
