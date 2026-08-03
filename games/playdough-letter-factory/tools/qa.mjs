#!/usr/bin/env node
// Real-Chrome smoke test and visual-QC capture for Playdough Letter Factory.
//
//   python3 -m http.server 8000        # from the repo root
//   node games/playdough-letter-factory/tools/qa.mjs
//        [--base http://127.0.0.1:8000] [--shots qa-shots/playdough-letter-factory]
//        [--playwright /private/tmp/pw/node_modules]
//        [--chromium]  # visual-only fallback when system Chrome is occupied
//   ($QLOBE_BASE / $QLOBE_SHOTS still work.)
//
// Plumbing (flags, Playwright resolution, launch, monitored pages, reporter)
// comes from tools/qa/lib/driver.mjs — see tools/qa/README.md.

import path from 'node:path';
import {
  baseUrl, launchChrome, createReporter, openSession,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/playdough-letter-factory');
const { check, finish } = createReporter();
const sessions = [];

async function openGame(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, {
    url: `${base}/games/playdough-letter-factory/`,
    base,
    viewport,
    reducedMotion,
    allowDataUrls: true,
    allowAbortedMedia: true,
    seed: 42,
    fastTimers: 0.03,
  });
  sessions.push(session);
  return session.page;
}

async function traceActiveLetter(page, { onMidStroke } = {}) {
  const strokeCount = await page.locator('.letter-clay').count();
  for (let stroke = 0; stroke < strokeCount; stroke += 1) {
    const points = await page.locator('.letter-clay').nth(stroke).evaluate((pathEl) => {
      const svg = pathEl.ownerSVGElement;
      const length = pathEl.getTotalLength();
      return Array.from({ length: 18 }, (_, index) => {
        const point = pathEl.getPointAtLength(length * index / 17);
        const svgPoint = svg.createSVGPoint();
        svgPoint.x = point.x;
        svgPoint.y = point.y;
        const screen = svgPoint.matrixTransform(svg.getScreenCTM());
        return { x: screen.x, y: screen.y };
      });
    });
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (let index = 1; index < points.length; index += 1) {
      await page.mouse.move(points[index].x, points[index].y, { steps: 2 });
      if (stroke === 0 && index === Math.floor(points.length / 2) && onMidStroke) {
        await onMidStroke();
      }
    }
    await page.mouse.up();
  }
}

async function visibleLetterReveal(page) {
  return page.locator('.letter-clay-finished').evaluateAll((paths) => paths.length > 0 && paths.every((pathEl) => {
    const box = pathEl.getBBox();
    const style = getComputedStyle(pathEl);
    return pathEl.getTotalLength() > 0 && (box.width > 0 || box.height > 0)
      && style.stroke !== 'none' && style.stroke !== 'rgba(0, 0, 0, 0)'
      && !style.filter.includes('url(');
  }));
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({
    channel: process.argv.includes('--chromium') ? null : 'chrome',
  });

  const hubContext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
  const hubPage = await hubContext.newPage();
  await hubPage.goto(`${base}/#writing-fine-motor`, { waitUntil: 'networkidle' });
  const hubTile = hubPage.locator('a.tile[aria-label*="Playdough Letter Factory"]');
  check('hub lists Playdough Letter Factory once', await hubTile.count() === 1);
  check('hub uses the curated clay workshop tile',
    (await hubTile.locator('img').getAttribute('src')) === 'assets/hub/tiles/playdough-letter-factory.jpg');
  await hubPage.screenshot({ path: path.join(shots, '00-hub.png') });
  await hubContext.close();

  const page = await openGame(browser, { width: 1180, height: 820 });
  check('splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('three modes are registered',
    (await page.evaluate(() => window.QLOBE_DEBUG.listModes())).map((item) => item.id).join(',') === 'letters,words,free');
  check('graphic title has the exact accessible name',
    (await page.locator('.title-art').getAttribute('alt')) === 'Playdough Letter Factory');
  const cards = await page.locator('.mode-card').evaluateAll((nodes) =>
    nodes.map((node) => ({ w: node.getBoundingClientRect().width, h: node.getBoundingClientRect().height })));
  check('splash mode cards meet the 96px target', cards.every(({ w, h }) => w >= 96 && h >= 96), JSON.stringify(cards));
  await page.waitForTimeout(350);
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(async () => {
    const clips = await import('../../../shared/js/voice-clips.js');
    window.__playdoughVoice = [];
    clips.onClip((key) => window.__playdoughVoice.push(key));
  });
  await page.locator('.mode-card').first().click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'color');
  await page.waitForFunction(() => window.__playdoughVoice.includes('color'));
  check('first child gesture unlocks the recorded factory guide',
    await page.evaluate(() => window.__playdoughVoice.includes('color')),
    await page.evaluate(() => window.__playdoughVoice.join(', ')));
  const colorTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('color shop exposes five colors and one start control',
    colorTargets.filter(({ id }) => id.startsWith('color-')).length === 6);
  check('color controls meet the 96px target',
    colorTargets.filter(({ id }) => id.startsWith('color-')).every(({ rect }) => rect.w >= 96 && rect.h >= 96),
    JSON.stringify(colorTargets));
  await page.screenshot({ path: path.join(shots, '02-color-shop.png') });

  await page.locator('[data-target-id="color-coral"]').click();
  await page.locator('[data-target-id="color-go"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'roll');
  const rollBox = await page.locator('[data-target-id="roll-zone"]').boundingBox();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, '03-roll-ready.png') });
  for (let pass = 0; pass < 3; pass += 1) {
    const forward = pass % 2 === 0;
    await page.mouse.move(
      rollBox.x + rollBox.width * (forward ? .2 : .8),
      rollBox.y + rollBox.height * .5,
    );
    await page.mouse.down();
    if (pass === 0) {
      await page.mouse.move(rollBox.x + rollBox.width * .5, rollBox.y + rollBox.height * .5, { steps: 6 });
      const liveRoll = await page.evaluate(() => ({
        count: window.QLOBE_DEBUG.getState().rollCount,
        amount: Number.parseFloat(document.querySelector('.dough-rope').style.getPropertyValue('--rolled')),
      }));
      check('dough expands continuously before the first swipe is released',
        liveRoll.count === 0 && liveRoll.amount > .48, JSON.stringify(liveRoll));
      await page.screenshot({ path: path.join(shots, '03-roll-live.png') });
    }
    await page.mouse.move(
      rollBox.x + rollBox.width * (forward ? .8 : .2),
      rollBox.y + rollBox.height * .5,
      { steps: 10 },
    );
    await page.mouse.up();
    if (pass === 0) await page.screenshot({ path: path.join(shots, '03-roll-dough.png') });
  }
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'trace');
  check('three real swipes advance to tracing', true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, '04-trace-ready.png') });

  const tray = page.locator('.trace-tray');
  const trayBox = await tray.boundingBox();
  await page.mouse.click(trayBox.x + trayBox.width * .86, trayBox.y + trayBox.height * .16);
  await page.waitForTimeout(50);
  check('a wrong trace start gives a gentle nudge without progress',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().stroke)) === 0);
  await traceActiveLetter(page, {
    onMidStroke: async () => {
      const progress = await page.evaluate(() => window.QLOBE_DEBUG.getState().strokeProgress);
      check('tracing deepens an impression continuously inside the dough slab', progress > 0 && progress < 1, String(progress));
      await page.screenshot({ path: path.join(shots, '04b-trace-impression.png') });
    },
  });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('real guided tracing reaches the phonics reveal', true);
  check('first completed letter reveal is visible without an SVG URL filter', await visibleLetterReveal(page));
  await page.waitForTimeout(450);
  await page.screenshot({ path: path.join(shots, '05-letter-reveal.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  let repeatedRevealsVisible = true;
  for (let round = 0; round < 6; round += 1) {
    await page.locator('#next').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'color');
    await page.evaluate(() => window.QLOBE_DEBUG.winRound());
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
    repeatedRevealsVisible &&= await visibleLetterReveal(page);
  }
  check('letter art remains visible through seven consecutive completed rounds', repeatedRevealsVisible);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, '05b-letter-reveal-repeat.png') });

  await page.locator('#reveal-back').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash');
  check('reveal Back returns to the game splash', true);

  await page.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    return window.QLOBE_DEBUG.startMode('words');
  });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'word');
  const wordTargets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  const wrong = wordTargets.find(({ role }) => role === 'wrong');
  if (wrong) await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), wrong.id);
  check('wrong word letter keeps progress at zero',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().placed)) === 0);
  const correct = wordTargets.find(({ role }) => role === 'correct');
  if (correct) await page.evaluate((id) => window.QLOBE_DEBUG.tap(id), correct.id);
  check('correct word letter fills the next slot',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().placed)) === 1);
  await page.waitForTimeout(50);
  await page.screenshot({ path: path.join(shots, '06-word-maker.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.winRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('Word Maker reaches a complete word reveal', true);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(shots, '07-word-reveal.png') });

  await page.evaluate(() => {
    window.QLOBE_DEBUG.home();
    return window.QLOBE_DEBUG.startMode('free');
  });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'free');
  const canvas = await page.locator('[data-target-id="free-canvas"]').boundingBox();
  await page.mouse.move(canvas.x + canvas.width * .2, canvas.y + canvas.height * .6);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .75, canvas.y + canvas.height * .35, { steps: 18 });
  await page.mouse.up();
  await page.locator('[data-target-id="stamp-A"]').click();
  check('Free Dough accepts drawing and stamps',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().freeMarks)) >= 2);
  await page.screenshot({ path: path.join(shots, '08-free-dough.png') });

  const portrait = await openGame(browser, { width: 820, height: 1180 });
  await portrait.screenshot({ path: path.join(shots, '09-splash-portrait.png') });
  await portrait.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    return window.QLOBE_DEBUG.startMode('letters');
  });
  await portrait.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'color');
  await portrait.screenshot({ path: path.join(shots, '10-color-portrait.png') });
  const portraitTargets = await portrait.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('portrait keeps every active target onscreen',
    portraitTargets.every(({ rect }) => rect.x >= -1 && rect.y >= -1
      && rect.x + rect.w <= 821 && rect.y + rect.h <= 1181),
    JSON.stringify(portraitTargets));

  const wide = await openGame(browser, { width: 1180, height: 620 }, 'reduce');
  await wide.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    return window.QLOBE_DEBUG.startMode('words');
  });
  await wide.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'word');
  await wide.screenshot({ path: path.join(shots, '11-word-wide-reduced.png') });
  const wideTargets = await wide.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('wide reduced-motion play targets stay at least 96px',
    wideTargets.filter(({ id }) => id.startsWith('token-')).every(({ rect }) => rect.w >= 96 && rect.h >= 96),
    JSON.stringify(wideTargets));

  for (const session of sessions) {
    check('session has no page or console errors', session.errors.length === 0, session.errors.join(' | '));
    check('session has no failed requests or 4xx responses', session.failed.length === 0, session.failed.join(' | '));
    check('session makes no runtime model or third-party requests', session.remote.length === 0, session.remote.join(' | '));
    await session.close();
  }
  await browser.close();

  finish({ listFailures: false });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
