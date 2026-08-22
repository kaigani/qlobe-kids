#!/usr/bin/env node
// Deterministic smoke/visual QA for Block Tower Measure.
import {
  args, launchChrome, createReporter, openSession, resolveShots, ensureShots,
  shooter, debug, targetSizes, undersized, checkSessionClean, dragBetween,
} from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8000').replace(/\/$/, '');
const url = `${base}/games/block-tower-measure/`;
const shots = resolveShots('games/block-tower-measure/qa-shots');
const { check, finish } = createReporter({ style: 'ok', collapse: true, detailLimit: 240 });
const isPlatformAnalytics = (entry) => entry.includes('googletagmanager.com') || entry.includes('google-analytics.com');

function checkClean(session, label) {
  checkSessionClean({ check }, {
    ...session,
    failed: session.failed.filter((entry) => !isPlatformAnalytics(entry)),
    remote: session.remote.filter((entry) => !isPlatformAnalytics(entry)),
  }, label);
}

async function clippedTargets(page) {
  return page.evaluate(() => {
    const { innerWidth: width, innerHeight: height } = window;
    return window.QLOBE_DEBUG.getTargets()
      .filter(({ rect }) => rect.x < 0 || rect.y < 0 || rect.x + rect.w > width || rect.y + rect.h > height)
      .map(({ id, rect }) => ({ id, ...rect }));
  });
}

async function session(browser, viewport, reducedMotion = 'no-preference') {
  return openSession(browser, { url, base, viewport, reducedMotion, ready: true, waitUntil: 'networkidle',
    after: (page) => page.evaluate(() => { window.QLOBE_DEBUG.mute(true); window.QLOBE_DEBUG.fastTimers(0.05); window.QLOBE_DEBUG.seed(42); }),
  });
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const shot = shooter(shots);
  const landscape = { width: 1024, height: 768 };
  const portrait = { width: 768, height: 1024 };
  let s;
  try {
    s = await session(browser, landscape);
    const { page } = s;
    const modes = await debug.listModes(page);
    check('QLOBE_DEBUG exposes all three modes', JSON.stringify(modes.map(({ id }) => id)) === JSON.stringify(['build', 'compare', 'robot']), JSON.stringify(modes));
    await shot(page, '01-splash');
    check('primary splash targets meet 96px minimum', (await targetSizes(page)).every((r) => r.w >= 96 && r.h >= 96));
    await debug.mute(page, false);
    await debug.clearAudioLog(page);
    await debug.tap(page, 'sound');
    await debug.waitForAudio(page, 'welcome', { timeout: 10000 });
    const welcomeAudio = (await debug.getAudioLog(page)).find((entry) => entry.key === 'welcome');
    check('welcome uses the recorded teacher clip', welcomeAudio?.kind === 'clip', JSON.stringify(welcomeAudio));
    await debug.mute(page, true);

    await debug.startMode(page, 'build');
    await shot(page, '02-build-empty');
    check('build targets meet 96px minimum', undersized(await targetSizes(page)).length === 0);
    const source = await page.getByRole('button', { name: 'Add a paper block' }).boundingBox();
    const drop = await page.locator('[data-drop-zone]').boundingBox();
    await dragBetween(page, source, drop, { steps: 12 });
    const oneBlockRemove = (await targetSizes(page)).find(({ id }) => id === 'remove-top');
    check('the paper-sized top block has a 96px remove hit area', oneBlockRemove?.w >= 96 && oneBlockRemove?.h >= 96, JSON.stringify(oneBlockRemove));
    await page.getByRole('button', { name: 'Add a paper block' }).click();
    await debug.waitForState(page, 'phase', 'measured');
    const measured = await debug.getState(page);
    check('two real block taps complete the first measured tower', measured.towerHeight === 2 && measured.targetHeight === 2 && !measured.awaitingInput, JSON.stringify(measured));
    await shot(page, '03-build-success');
    await debug.tap(page, 'next');
    for (let round = 1; round < 4; round += 1) {
      await debug.winRound(page);
      await debug.tap(page, 'next');
    }
    const buildEnd = await debug.getState(page);
    check('four build rounds reach the end screen', buildEnd.screen === 'end' && buildEnd.phase === 'complete', JSON.stringify(buildEnd));
    await shot(page, '03b-build-end');
    check('end-screen targets meet 96px minimum', undersized(await targetSizes(page)).length === 0);

    await debug.startMode(page, 'compare');
    const cleanCompareState = await debug.getState(page);
    check('Compare starts without stale Build state', cleanCompareState.towerHeight === 0 && cleanCompareState.targetHeight === 0, JSON.stringify(cleanCompareState));
    await debug.call(page, 'setCompareCase', 2, 4, 'taller');
    await page.waitForTimeout(650);
    await shot(page, '04-compare');
    check('compare targets meet 96px minimum', undersized(await targetSizes(page)).length === 0);
    const guides = await page.evaluate(() => {
      const ruler = document.querySelector('.compare-ruler')?.getBoundingClientRect();
      return [...document.querySelectorAll('.compare-height-guide')].map((node) => {
        const rect = node.getBoundingClientRect();
        const side = node.classList.contains('compare-height-guide-left') ? 'left' : 'right';
        const tower = document.querySelector(`[data-side="${side}"] .tower-visible`)?.getBoundingClientRect();
        const reachesRuler = side === 'left' ? rect.right >= ruler?.left : rect.left <= ruler?.right;
        return {
          side,
          width: rect.width,
          y: rect.top + rect.height / 2,
          towerTop: tower?.top ?? NaN,
          reachesRuler,
        };
      });
    });
    check('compare height guides bridge each tower top to the central ruler', guides.length === 2 && guides.every((g) => g.width > 0 && g.reachesRuler && Math.abs(g.y - g.towerTop) < 24), JSON.stringify(guides));
    await debug.tap(page, 'tower-left');
    const stateAfterWrong = await debug.getState(page);
    check('wrong taller answer retries without advancing', stateAfterWrong.phase === 'compare' && stateAfterWrong.awaitingInput && stateAfterWrong.attempts === 1, JSON.stringify(stateAfterWrong));
    check('wrong compare answer visibly replays both measurement guides', await page.locator('.compare-height-guide.replay-guide').count() === 2);
    await debug.tap(page, 'tower-right');
    const tallerSuccess = await debug.getState(page);
    check('correct taller answer succeeds', tallerSuccess.phase === 'success' && !tallerSuccess.awaitingInput, JSON.stringify(tallerSuccess));
    await page.waitForTimeout(750);
    await shot(page, '05-compare-success');
    await debug.call(page, 'setCompareCase', 5, 2, 'shorter');
    await page.waitForTimeout(650);
    await shot(page, '05b-compare-shorter');
    await debug.winRound(page);
    check('shorter relation succeeds deterministically', (await debug.getState(page)).phase === 'success');
    await debug.call(page, 'setCompareCase', 3, 3, 'same');
    await page.waitForTimeout(650);
    await shot(page, '05c-compare-same');
    await debug.winRound(page);
    check('same-height relation succeeds deterministically', (await debug.getState(page)).phase === 'success');

    await debug.startMode(page, 'compare');
    for (let round = 0; round < 5; round += 1) {
      await debug.winRound(page);
      await debug.tap(page, 'next');
    }
    const compareEnd = await debug.getState(page);
    check('five compare rounds reach the end screen', compareEnd.screen === 'end' && compareEnd.phase === 'complete', JSON.stringify(compareEnd));
    await shot(page, '05d-compare-end');

    await debug.startMode(page, 'robot');
    const cleanRobotState = await debug.getState(page);
    check('Robot Workshop starts without stale Compare state', cleanRobotState.compareCase === null, JSON.stringify(cleanRobotState));
    await debug.call(page, 'setTowerHeight', 2);
    const removedAtMinimum = await debug.tap(page, 'remove-top');
    check('robot workshop cannot remove below its two-block minimum', removedAtMinimum === false && (await debug.getState(page)).towerHeight === 2);
    await debug.call(page, 'setTowerHeight', 4);
    const robotRemove = (await targetSizes(page)).find(({ id }) => id === 'remove-top');
    check('robot top-block removal keeps a 96px hit area', robotRemove?.w >= 96 && robotRemove?.h >= 96, JSON.stringify(robotRemove));
    const robotSource = await page.getByRole('button', { name: 'Add a paper block' }).boundingBox();
    await page.mouse.move(robotSource.x + robotSource.width / 2, robotSource.y + robotSource.height / 2);
    await page.mouse.down();
    await page.mouse.move(robotSource.x - 45, robotSource.y - 45, { steps: 5 });
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await page.mouse.up();
    check('window blur cancels an active block drag', (await debug.getState(page)).towerHeight === 4 && await page.locator('.drag-ghost').count() === 0);
    await dragBetween(page, robotSource, { x: 8, y: landscape.height - 8 }, { steps: 12 });
    check('a missed drag leaves the robot tower unchanged', (await debug.getState(page)).towerHeight === 4);
    await shot(page, '06-robot-build');
    await debug.call(page, 'revealRobot');
    const robot = await debug.getState(page);
    check('robot reveal preserves the built height', robot.robotRevealed && robot.towerHeight === 4, JSON.stringify(robot));
    await page.waitForTimeout(900);
    await shot(page, '07-robot-reveal');
    check('robot reward targets meet 96px minimum', undersized(await targetSizes(page)).length === 0);
    checkClean(s, 'landscape session');

    await s.close();
    s = await session(browser, portrait);
    await shot(s.page, '08-portrait-splash');
    check('portrait splash targets meet 96px minimum', undersized(await targetSizes(s.page)).length === 0);
    await debug.startMode(s.page, 'robot');
    await debug.call(s.page, 'setTowerHeight', 4);
    await debug.call(s.page, 'revealRobot');
    await s.page.waitForTimeout(900);
    await shot(s.page, '09-portrait-robot-reveal');
    checkClean(s, 'portrait session');

    await s.close();
    s = await session(browser, landscape, 'reduce');
    await debug.startMode(s.page, 'robot');
    await debug.call(s.page, 'setTowerHeight', 3);
    await debug.call(s.page, 'revealRobot');
    const reduced = await debug.getState(s.page);
    check('reduced motion keeps the robot reward playable', reduced.robotRevealed && reduced.towerHeight === 3, JSON.stringify(reduced));
    await shot(s.page, '10-reduced-motion-robot-reveal');
    checkClean(s, 'reduced-motion session');

    await s.close();
    s = await session(browser, { width: 375, height: 667 });
    await shot(s.page, '11-phone-portrait-splash');
    check('phone portrait keeps every splash target on-screen', (await clippedTargets(s.page)).length === 0, JSON.stringify(await clippedTargets(s.page)));
    await debug.startMode(s.page, 'build');
    await debug.call(s.page, 'setTowerHeight', 1);
    await shot(s.page, '12-phone-portrait-build');
    check('phone portrait keeps build controls on-screen', (await clippedTargets(s.page)).length === 0, JSON.stringify(await clippedTargets(s.page)));
    await debug.startMode(s.page, 'compare');
    await debug.call(s.page, 'setCompareCase', 2, 4, 'taller');
    await s.page.waitForTimeout(650);
    await shot(s.page, '13-phone-portrait-compare');
    check('phone portrait keeps both tower choices on-screen', (await clippedTargets(s.page)).length === 0, JSON.stringify(await clippedTargets(s.page)));
    await debug.tap(s.page, 'tower-right');
    await s.page.waitForTimeout(2200);
    await shot(s.page, '13b-phone-portrait-compare-success');
    check('phone portrait keeps the settled compare reward on-screen', (await clippedTargets(s.page)).length === 0, JSON.stringify(await clippedTargets(s.page)));
    const phoneRewardLayout = await s.page.evaluate(() => {
      const rewards = [...document.querySelectorAll('.compare-success .result-star, .compare-success .paper-action')]
        .map((node) => node.getBoundingClientRect());
      const plates = [...document.querySelectorAll('.count-plate')]
        .map((node) => node.getBoundingClientRect());
      const overlaps = rewards.some((reward) => plates.some((plate) => !(
        reward.right <= plate.left || reward.left >= plate.right ||
        reward.bottom <= plate.top || reward.top >= plate.bottom
      )));
      return {
        rewards: rewards.map(({ x, y, width, height }) => ({ x, y, width, height })),
        plates: plates.map(({ x, y, width, height }) => ({ x, y, width, height })),
        overlaps,
      };
    });
    check('phone portrait reward has a clear lane between the answer plates', !phoneRewardLayout.overlaps, JSON.stringify(phoneRewardLayout));
    checkClean(s, 'phone-portrait session');

    await s.close();
    s = await session(browser, { width: 667, height: 375 });
    await shot(s.page, '14-phone-landscape-splash');
    check('short landscape keeps every splash target on-screen', (await clippedTargets(s.page)).length === 0, JSON.stringify(await clippedTargets(s.page)));
    await debug.startMode(s.page, 'compare');
    await debug.call(s.page, 'setCompareCase', 2, 4, 'taller');
    await s.page.waitForTimeout(650);
    await shot(s.page, '15-phone-landscape-compare');
    check('short landscape keeps both tower choices on-screen', (await clippedTargets(s.page)).length === 0, JSON.stringify(await clippedTargets(s.page)));
    await debug.startMode(s.page, 'robot');
    await debug.call(s.page, 'setTowerHeight', 6);
    await shot(s.page, '16-phone-landscape-robot-six');
    const compactRemove = s.page.locator('[data-target="remove-top"]');
    const compactRemoveBox = await compactRemove.boundingBox();
    const compactCenterIsLive = await compactRemove.evaluate((target) => {
      const rect = target.getBoundingClientRect();
      return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)?.closest('[data-target]') === target;
    });
    await s.page.mouse.click(compactRemoveBox.x + compactRemoveBox.width / 2, compactRemoveBox.y + compactRemoveBox.height / 2);
    check('short-landscape six-block remove target is fully on-screen and live at its center', compactCenterIsLive && (await clippedTargets(s.page)).length === 0 && (await debug.getState(s.page)).towerHeight === 5, JSON.stringify(compactRemoveBox));
    checkClean(s, 'phone-landscape session');
  } catch (error) { check('QA flow completed', false, error.stack || error.message); }
  finally { if (s) await s.close(); await browser.close(); }
  finish({ suffix: `; screenshots in ${shots}`, label: 'Block Tower Measure QA: ' });
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
