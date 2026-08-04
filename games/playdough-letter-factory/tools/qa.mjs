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
  const startSpreadX = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough.spreadX);
  const startVolume = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough.volume);
  check('the roll phase mounts a clay height field', startSpreadX > 0 && startVolume > 0,
    JSON.stringify({ startSpreadX, startVolume }));

  // Render-on-demand (docs/interaction-patterns.md #12): an untouched field
  // must not reshade. `renders` counts real per-pixel shading passes.
  const idleRendersBefore = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough.renders);
  await page.waitForTimeout(900);
  const idleRendersAfter = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough.renders);
  check('an untouched dough canvas does not redraw (render-on-demand)',
    idleRendersAfter === idleRendersBefore, `${idleRendersBefore} -> ${idleRendersAfter}`);
  for (let pass = 0; pass < 3; pass += 1) {
    const forward = pass % 2 === 0;
    await page.mouse.move(
      rollBox.x + rollBox.width * (forward ? .2 : .8),
      rollBox.y + rollBox.height * .5,
    );
    await page.mouse.down();
    if (pass === 0) {
      await page.mouse.move(rollBox.x + rollBox.width * .5, rollBox.y + rollBox.height * .5, { steps: 6 });
      // The dough is a real mass-conserving height field now, so "it is
      // getting longer" is a measurement, not a CSS custom property: the
      // material's own bounding box has to widen mid-drag, while the
      // three-swipe progress rule has not credited anything yet.
      const liveRoll = await page.evaluate(() => {
        const state = window.QLOBE_DEBUG.getState();
        return { count: state.rollCount, spreadX: state.dough.spreadX, peak: state.dough.peak };
      });
      check('dough lengthens continuously before the first swipe is released',
        liveRoll.count === 0 && liveRoll.spreadX > startSpreadX, JSON.stringify({ startSpreadX, ...liveRoll }));
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
  const rolled = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough);
  check('three swipes leave the dough longer and flatter than the starting ball',
    rolled.spreadX > startSpreadX * 1.5, JSON.stringify({ startSpreadX, ...rolled }));
  check('rolling never creates or destroys dough (mass-conserving)',
    Math.abs(rolled.volume - startVolume) / startVolume < .01,
    JSON.stringify({ startVolume, volume: rolled.volume }));

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
  const slabBefore = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough);
  await traceActiveLetter(page, {
    onMidStroke: async () => {
      const mid = await page.evaluate(() => window.QLOBE_DEBUG.getState());
      check('tracing deepens an impression continuously inside the dough slab',
        mid.strokeProgress > 0 && mid.strokeProgress < 1, String(mid.strokeProgress));
      // The groove is carved into the field, so the revision must have moved
      // while the finger was still mid-stroke, and the displaced material
      // must still be on the slab (a press is conserving, not an eraser).
      check('a groove is carved into the dough while the stroke is still in progress',
        mid.dough.revision > slabBefore.revision, `${slabBefore.revision} -> ${mid.dough.revision}`);
      check('carving a groove conserves the slab (material moves to a rim, it is not erased)',
        Math.abs(mid.dough.volume - slabBefore.volume) / slabBefore.volume < .01,
        JSON.stringify({ before: slabBefore.volume, mid: mid.dough.volume }));
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
  check('Free Dough starts as a real sheet of dough, not an empty tray',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().dough.volume)) > 0);
  const sheetBefore = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough);
  await page.mouse.move(canvas.x + canvas.width * .2, canvas.y + canvas.height * .6);
  await page.mouse.down();
  await page.mouse.move(canvas.x + canvas.width * .75, canvas.y + canvas.height * .35, { steps: 18 });
  await page.mouse.up();
  const roped = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough);
  check('drawing squeezes out a raised rope of new dough',
    roped.volume > sheetBefore.volume && roped.peak > sheetBefore.peak,
    JSON.stringify({ before: sheetBefore, after: roped }));
  for (const mark of ['A', 'O', 'S', '★']) {
    await page.locator(`[data-target-id="stamp-${mark}"]`).click();
  }
  const stamped = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough);
  // A stamp PRESSES, it does not erase: the displaced dough goes to a rim
  // around the glyph, so the sheet's total volume must be unchanged while the
  // field itself has demonstrably moved.
  check('stamps press letter-shaped impressions without erasing any dough',
    stamped.revision > roped.revision
      && Math.abs(stamped.volume - roped.volume) / roped.volume < .001,
    JSON.stringify({ roped, stamped }));
  check('Free Dough accepts drawing and stamps',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().freeMarks)) >= 2);
  await page.screenshot({ path: path.join(shots, '08-free-dough.png') });

  // A colour change must retint the dough, never rebuild the field — the
  // child's ropes and stamps have to survive picking a new colour.
  const beforeRetint = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough);
  await page.locator('[data-target-id="palette-purple"]').click();
  const afterRetint = await page.evaluate(() => window.QLOBE_DEBUG.getState().dough);
  check('changing colour retints the dough without destroying the child\'s work',
    Math.abs(afterRetint.volume - beforeRetint.volume) < .01,
    JSON.stringify({ before: beforeRetint.volume, after: afterRetint.volume }));
  await page.screenshot({ path: path.join(shots, '08b-free-dough-retint.png') });

  await page.locator('[data-target-id="free-clear"]').click();
  check('clearing the tray resets to a fresh sheet',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().freeMarks)) === 0);

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

  // The clay canvases in a compact landscape window: they must fill their
  // trays and still respond to a real drag under reduced motion (where the
  // post-release settle collapses to one synchronous relax).
  await wide.evaluate(() => {
    window.QLOBE_DEBUG.home();
    return window.QLOBE_DEBUG.startMode('letters');
  });
  await wide.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'color');
  await wide.locator('[data-target-id="color-blue"]').click();
  await wide.locator('[data-target-id="color-go"]').click();
  await wide.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'roll');
  // Both rects in ONE evaluate: read across two round-trips they can land in
  // different layout frames (the prompt pill reflows the header, which
  // resizes the tray), and the check fails on a race rather than on a bug.
  const compactFit = await wide.evaluate(() => {
    const zone = document.querySelector('[data-target-id="roll-zone"]').getBoundingClientRect();
    const canvas = document.querySelector('.roll-canvas').getBoundingClientRect();
    return { zone: { w: zone.width, h: zone.height }, canvas: { w: canvas.width, h: canvas.height } };
  });
  check('the roll canvas fills its zone in a compact landscape window',
    Math.abs(compactFit.canvas.w - compactFit.zone.w) < 2 && Math.abs(compactFit.canvas.h - compactFit.zone.h) < 2,
    JSON.stringify(compactFit));
  const compactBox = await wide.locator('[data-target-id="roll-zone"]').boundingBox();

  const compactStart = await wide.evaluate(() => window.QLOBE_DEBUG.getState().dough.spreadX);
  await wide.mouse.move(compactBox.x + compactBox.width * .25, compactBox.y + compactBox.height * .5);
  await wide.mouse.down();
  await wide.mouse.move(compactBox.x + compactBox.width * .78, compactBox.y + compactBox.height * .5, { steps: 14 });
  await wide.mouse.up();
  const compactRolled = await wide.evaluate(() => window.QLOBE_DEBUG.getState().dough.spreadX);
  check('reduced motion still rolls the dough (settle collapses, it does not stop)',
    compactRolled > compactStart, `${compactStart} -> ${compactRolled}`);
  await wide.screenshot({ path: path.join(shots, '12-roll-compact-reduced.png') });

  // pointercancel is a cancel, not a completed swipe. iPadOS palm rejection
  // fires it mid-drag, and the pre-heightfield code credited a bead for it.
  const cancelBefore = await wide.evaluate(() => window.QLOBE_DEBUG.getState().rollCount);
  await wide.mouse.move(compactBox.x + compactBox.width * .25, compactBox.y + compactBox.height * .5);
  await wide.mouse.down();
  await wide.mouse.move(compactBox.x + compactBox.width * .8, compactBox.y + compactBox.height * .5, { steps: 10 });
  await wide.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, bubbles: true })));
  await wide.mouse.up();
  const cancelAfter = await wide.evaluate(() => window.QLOBE_DEBUG.getState().rollCount);
  check('a pointercancel mid-swipe never credits a roll',
    cancelAfter === cancelBefore, `${cancelBefore} -> ${cancelAfter}`);

  const portraitRoll = await openGame(browser, { width: 820, height: 1180 });
  await portraitRoll.evaluate(() => {
    window.QLOBE_DEBUG.mute();
    return window.QLOBE_DEBUG.startMode('free');
  });
  await portraitRoll.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'free');
  // Past the .42s tray-arrive fade, or the shot catches a translucent tray
  // and the dough looks like it is floating on the factory backdrop.
  await portraitRoll.waitForTimeout(600);
  const portraitFit = await portraitRoll.evaluate(() => {
    const tray = document.querySelector('.free-tray').getBoundingClientRect();
    const canvas = document.querySelector('.free-canvas').getBoundingClientRect();
    return { tray: { w: tray.width, h: tray.height }, canvas: { w: canvas.width, h: canvas.height } };
  });
  check('the free canvas fills its tray in portrait',
    Math.abs(portraitFit.canvas.w - portraitFit.tray.w) < 32 && portraitFit.canvas.h > 0,
    JSON.stringify(portraitFit));

  // The dough tray must end above the stamp row. In portrait the tray used to
  // keep its landscape fixed height and slide down underneath the tools.
  const portraitStack = await portraitRoll.evaluate(() => {
    const tray = document.querySelector('.free-tray').getBoundingClientRect();
    const tools = document.querySelector('.free-tools').getBoundingClientRect();
    const palette = document.querySelector('.free-palette').getBoundingClientRect();
    return { trayBottom: tray.bottom, toolsTop: tools.top, paletteTop: palette.top };
  });
  check('in portrait the dough tray sits above the stamp and palette rows, not under them',
    portraitStack.trayBottom <= portraitStack.toolsTop + 1
      && portraitStack.toolsTop < portraitStack.paletteTop,
    JSON.stringify(portraitStack));
  await portraitRoll.screenshot({ path: path.join(shots, '13-free-portrait.png') });

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
