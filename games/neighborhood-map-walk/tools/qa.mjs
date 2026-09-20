#!/usr/bin/env node
import {
  args, launchChrome, createReporter, openSession, resolveShots, ensureShots,
  shooter, debug, targetSizes, undersized, checkSessionClean,
} from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8000').replace(/\/$/, '');
const url = base + '/games/neighborhood-map-walk/';
const shots = resolveShots('games/neighborhood-map-walk/qa-shots');
const { check, note, finish } = createReporter({ style: 'ok', collapse: true, detailLimit: 300 });
const analytics = (entry) => entry.includes('googletagmanager.com') || entry.includes('google-analytics.com');

function clean(session, label) {
  checkSessionClean({ check }, {
    ...session,
    failed: session.failed.filter((entry) => !analytics(entry)),
    remote: session.remote.filter((entry) => !analytics(entry)),
  }, label);
}

async function imagesLoaded(page) {
  return page.locator('img:visible').evaluateAll((images) => images.every((image) => image.complete && image.naturalWidth > 0));
}

async function run() {
  await ensureShots(shots);
  const shot = shooter(shots);
  const browser = await launchChrome({ args: ['--autoplay-policy=no-user-gesture-required'] });
  let session = null;
  try {
    session = await openSession(browser, {
      url, base, viewport: { width: 1180, height: 820 }, ready: true, waitUntil: 'networkidle',
    });
    let { page } = session;
    await shot(page, '01-cover-landscape');
    check('cover opens ready', (await debug.getState(page)).screen === 'splash');
    check('one build mode is registered', (await debug.listModes(page))[0]?.id === 'build');
    check('cover raster art loaded', await imagesLoaded(page));
    check('cover debug targets meet 96px minimum', undersized(await targetSizes(page)).length === 0,
      JSON.stringify(undersized(await targetSizes(page))));

    await debug.call(page, 'clearAudioLog');
    await debug.mute(page, false);
    await debug.tap(page, 'start');
    await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.kind === 'clip'), null, { timeout: 7000 });
    check('first child action plays recorded teacher voice', (await debug.call(page, 'getAudioLog')).some((entry) => entry.kind === 'clip'));
    await debug.call(page, 'resetProgress');
    await debug.mute(page, true);

    await debug.startMode(page, 'build');
    check('build opens at house drawing', (await debug.getState(page)).phase === 'house');
    await shot(page, '02-draw-home-landscape');
    await debug.call(page, 'completeHouse');
    check('house completion preserves authored strokes', (await debug.getState(page)).houseStrokeCount >= 2);
    check('house completion reaches road drawing', (await debug.getState(page)).phase === 'road');
    await shot(page, '03-road-landscape');
    await page.locator('#road-canvas').click({ position: { x: 180, y: 220 } });
    check('a tap without travel does not count as a road', (await debug.getState(page)).roadStrokeCount === 0);
    await debug.call(page, 'completeRoad');
    check('road completion preserves path data', (await debug.getState(page)).roadStrokeCount >= 1);
    check('road completion reaches placement', (await debug.getState(page)).phase === 'place');
    await debug.call(page, 'placeLandmark', 'tree', .23, .52);
    await debug.call(page, 'placeLandmark', 'park', .74, .41);
    await debug.call(page, 'placeLandmark', 'pond', .72, .75);
    const placed = await debug.getState(page);
    check('three distinct landmarks are placed', placed.landmarkCount === 3 && new Set(placed.landmarkTypes).size === 3,
      JSON.stringify(placed));
    await shot(page, '04-place-landmarks-landscape');
    await debug.call(page, 'finishMap');
    const finale = await debug.getState(page);
    check('finale keeps house road and landmarks', finale.screen === 'end' && finale.houseReady
      && finale.roadStrokeCount >= 1 && finale.landmarkCount >= 3, JSON.stringify(finale));
    await page.waitForTimeout(650);
    await shot(page, '05-living-town-landscape');
    check('finale raster art loaded', await imagesLoaded(page));
    clean(session, 'landscape flow');

    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.QLOBE_DEBUG.ready);
    await debug.mute(page, true);
    check('reload safely returns to cover', (await debug.getState(page)).screen === 'splash');
    check('saved-town revisit is offered', await page.locator('[data-target="saved-town"]').isVisible());
    await debug.tap(page, 'saved-town');
    check('saved town reopens with composition', (await debug.getState(page)).landmarkCount >= 3);
    await page.evaluate(() => localStorage.setItem('qk-neighborhood-explorer-v1', JSON.stringify({
      houseStrokes: [{ color: 'not-a-color', points: [{ x: 'bad', y: 2 }] }],
      roadStrokes: [{ points: [{ x: .5, y: .5 }] }],
      landmarks: [{ type: 'tree\" onerror=alert(1)', x: 4, y: null }],
      round: 'oops',
    })));
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.QLOBE_DEBUG.ready);
    const sanitized = await debug.getState(page);
    check('malformed saved state is sanitized before rendering',
      sanitized.houseStrokeCount === 0 && sanitized.roadStrokeCount === 0 && sanitized.landmarkCount === 0,
      JSON.stringify(sanitized));

    await session.close();
    session = await openSession(browser, {
      url, base, viewport: { width: 820, height: 1180 }, ready: true, waitUntil: 'networkidle',
    });
    page = session.page;
    await debug.mute(page, true);
    await shot(page, '06-cover-portrait');
    await debug.startMode(page, 'build');
    await shot(page, '07-draw-home-portrait');
    await debug.call(page, 'completeHouse');
    await debug.call(page, 'completeRoad');
    await debug.call(page, 'placeLandmark', 'tree', .22, .5);
    await debug.call(page, 'placeLandmark', 'library', .76, .45);
    await debug.call(page, 'placeLandmark', 'flowers', .72, .76);
    await shot(page, '08-place-portrait');
    check('portrait primary targets stay on-screen', (await debug.getTargets(page)).every((target) => {
      const rect = target.rect;
      return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= 820 && rect.y + rect.h <= 1180;
    }));
    clean(session, 'portrait flow');

    await session.close();
    session = await openSession(browser, {
      url, base, viewport: { width: 1180, height: 560 }, reducedMotion: 'reduce',
      ready: true, waitUntil: 'networkidle',
    });
    page = session.page;
    await debug.mute(page, true);
    await debug.startMode(page, 'build');
    await debug.call(page, 'completeHouse');
    await debug.call(page, 'completeRoad');
    await debug.call(page, 'placeLandmark', 'tree', .24, .52);
    await debug.call(page, 'placeLandmark', 'park', .74, .42);
    await debug.call(page, 'placeLandmark', 'pond', .72, .75);
    await debug.call(page, 'finishMap');
    await shot(page, '09-finale-short-landscape-reduced-motion');
    check('reduced motion is reported', (await debug.getState(page)).reducedMotion === true);
    check('reduced-motion finale loads every visible raster', await imagesLoaded(page));
    clean(session, 'short landscape reduced-motion flow');
    note('screenshots in ' + shots);
  } catch (error) {
    check('QA flow completed', false, error.stack || error.message);
  } finally {
    if (session) await session.close();
    await browser.close();
  }
  finish({ suffix: '; shots in ' + shots });
}

run();
