#!/usr/bin/env node
// Real-Chrome interaction smoke test and screenshot driver.
//
//   python3 -m http.server 8000        # from the repo root
//   node games/clay-creature-studio/tools/qa.mjs [--base http://127.0.0.1:8000]
//        [--shots <dir>] [--playwright /private/tmp/pw/node_modules] [--skip-talk]
//
// Plumbing (flags, Playwright resolution, launch, monitored pages, reporter)
// comes from tools/qa/lib/driver.mjs — see tools/qa/README.md.

import path from 'node:path';
import {
  args, launchChrome, createReporter, openSession,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const skipTalk = args.has('skip-talk');
const base = args.flag('base', 'http://127.0.0.1:8000');
const url = `${base.replace(/\/$/, '')}/games/clay-creature-studio/`;
const shots = resolveShots('games/clay-creature-studio/qa-shots/clay-creature-studio');
const { check, note, finish } = createReporter();

async function monitoredPage(browser, viewport, reducedMotion = 'no-preference', contextOptions = {}) {
  return openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    context: contextOptions,
    // This game boots straight to its splash; the harness has no `ready` promise.
    readyWhen: () => window.QLOBE_DEBUG?.getState().screen === 'splash',
    after: (page) => page.evaluate(() => {
      window.QLOBE_DEBUG.mute(true);
      window.QLOBE_DEBUG.fastTimers(true);
      window.QLOBE_DEBUG.seed(42);
      window.QLOBE_DEBUG.clearSaved();
    }),
  });
}

async function visibleTargetSizes(page) {
  return page.locator('[data-target]').evaluateAll((nodes) => nodes
    .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.disabled)
    .map((node) => {
      const rect = node.getBoundingClientRect();
      return { id: node.dataset.target, w: rect.width, h: rect.height };
    }));
}

async function assertTargets(page, label) {
  const sizes = await visibleTargetSizes(page);
  const undersized = sizes.filter(({ w, h }) => w < 95.5 || h < 95.5);
  check(`${label} controls meet the 96px touch minimum`, undersized.length === 0,
    undersized.map(({ id, w, h }) => `${id}:${Math.round(w)}×${Math.round(h)}`).join(', '));
}

async function dragSelectedPiece(page) {
  const piece = page.locator('.qlobe-freeform-piece').last();
  const before = await page.evaluate(() => window.QLOBE_DEBUG.getBoard().items.at(-1));
  const box = await piece.boundingBox();
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .45);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 1.15, box.y + box.height * .75, { steps: 8 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.QLOBE_DEBUG.getBoard().items.at(-1));
  return { before, after };
}

async function dragTrayPart(page, target, x = .5, y = .34) {
  const choice = page.locator(`[data-target="${target}"]`);
  await choice.scrollIntoViewIfNeeded();
  const from = await choice.boundingBox();
  const layer = await page.locator('#piece-layer').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(layer.x + layer.width * x, layer.y + layer.height * y, { steps: 12 });
  await page.mouse.up();
}

async function dragPieceTo(page, piece, target) {
  const from = await piece.boundingBox();
  const to = await target.boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
}

async function drive(browser) {
  const landscape = await monitoredPage(browser, { width: 1180, height: 820 });
  const page = landscape.page;
  check('production splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('two distinct modes registered',
    (await page.evaluate(() => window.QLOBE_DEBUG.listModes().map((item) => item.id).join(','))) === 'free,copy');
  check('six clay starters registered', (await page.evaluate(() => window.QLOBE_DEBUG.listCreatures())).length === 6);
  check('runtime makes no external requests', landscape.remote.length === 0, landscape.remote.join(', '));
  await assertTargets(page, 'splash');
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.locator('[data-target="creature-dino"]').click();
  check('creature card opens mode choice', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'mode');
  await assertTargets(page, 'mode-choice');
  await page.screenshot({ path: path.join(shots, '02-mode-choice.png') });

  await page.locator('[data-target="mode-free"]').click();
  check('free build opens', (await page.evaluate(() => window.QLOBE_DEBUG.getState().mode)) === 'free');
  check('item type tabs are absent', await page.locator('.category-tabs,.category-tab').count() === 0);
  const familyCounts = await page.evaluate(() => Object.fromEntries(
    window.QLOBE_DEBUG.listParts().reduce((groups, part) => groups.set(part.family, (groups.get(part.family) || 0) + 1), new Map())));
  for (const family of ['eyes', 'mouths', 'tops', 'wings', 'decorations']) {
    check(`${family} family contains exactly eight clay parts`, familyCounts[family] === 8, String(familyCounts[family]));
  }
  check('spots are four individual draggable decorations',
    (await page.evaluate(() => window.QLOBE_DEBUG.listParts().filter((part) => part.id.startsWith('spot-')).length)) === 4);
  check('all eight mouths are canonical rigs',
    (await page.evaluate(() => window.QLOBE_DEBUG.listParts().filter((part) => part.mouth).length)) === 8);
  check('interaction banner begins visible', await page.locator('.prompt-plate').isVisible());
  await page.locator('[data-target="part-eyes-pair"]').click();
  check('clicking a tray piece does not place it', (await page.evaluate(() => window.QLOBE_DEBUG.getState().pieces)) === 0);
  const swipeChoice = await page.locator('[data-target="part-eyes-pair"]').boundingBox();
  await page.mouse.move(swipeChoice.x + swipeChoice.width * .75, swipeChoice.y + swipeChoice.height / 2);
  await page.mouse.down();
  await page.mouse.move(Math.max(8, swipeChoice.x - 240), swipeChoice.y + swipeChoice.height / 2, { steps: 12 });
  await page.mouse.up();
  const swipeScroll = await page.locator('#parts-tray').evaluate((node) => node.scrollLeft);
  const swipePieces = await page.evaluate(() => window.QLOBE_DEBUG.getState().pieces);
  check('horizontal part gesture scrolls the continuous row without creating',
    swipeScroll > 100 && swipePieces === 0,
    `scrollLeft=${Math.round(swipeScroll)}`);
  await page.locator('#parts-tray').evaluate((node) => { node.scrollLeft = 0; });
  await dragTrayPart(page, 'part-eyes-pair', .5, .29);
  const placed = check('tray-to-creature drag adds a semantic clay part',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().pieces)) === 1);
  check('interaction banner dismisses after creation begins', await page.locator('.prompt-plate.is-dismissed').count() === 1);
  if (!placed) {
    // Every remaining scenario needs a placed clay part on the board. Report
    // the page error that explains it and stop, rather than letting the next
    // `.qlobe-freeform-piece` lookup burn a 30s locator timeout and throw.
    check('the tray-drag gesture leaves no page error behind',
      landscape.errors.length === 0, landscape.errors.join(' | '));
    note('tray drag placed nothing — the rest of the suite depends on it; stopping here');
    await landscape.context.close();
    return;
  }
  const drag = await dragSelectedPiece(page);
  check('real pointer drag changes normalized position',
    Math.abs(drag.after.x - drag.before.x) > .02 || Math.abs(drag.after.y - drag.before.y) > .02,
    `${drag.before.x.toFixed(2)},${drag.before.y.toFixed(2)} → ${drag.after.x.toFixed(2)},${drag.after.y.toFixed(2)}`);
  check('undo and fresh controls are absent',
    await page.locator('[data-target="undo"],[data-target="clear"]').count() === 0);
  await dragTrayPart(page, 'part-horn-yellow', .52, .01);
  const horn = await page.evaluate(() => window.QLOBE_DEBUG.getBoard().items.find((item) => item.kind === 'horn-yellow'));
  check('parts can reach the very top of the figure', horn.y < .03, `y=${horn.y.toFixed(3)}`);
  await page.evaluate((id) => window.QLOBE_DEBUG.movePiece(id, .53, .14), horn.id);
  await page.locator('[data-target="part-wing-teal"]').scrollIntoViewIfNeeded();
  const wingChoice = await page.locator('[data-target="part-wing-teal"]').boundingBox();
  const wingLayer = await page.locator('#piece-layer').boundingBox();
  await page.mouse.move(wingChoice.x + wingChoice.width / 2, wingChoice.y + wingChoice.height / 2);
  await page.mouse.down();
  await page.mouse.move(wingLayer.x + wingLayer.width * .28, wingLayer.y + wingLayer.height * .48, { steps: 8 });
  const trayGhostLeft = await page.locator('.tray-drag-ghost').evaluate((node) => node.classList.contains('is-mirrored'));
  await page.mouse.move(wingLayer.x + wingLayer.width * .72, wingLayer.y + wingLayer.height * .48, { steps: 8 });
  const trayGhostRight = await page.locator('.tray-drag-ghost').evaluate((node) => node.classList.contains('is-mirrored'));
  check('tray drag ghost flips while crossing the median before release', trayGhostLeft !== trayGhostRight,
    `${trayGhostLeft} → ${trayGhostRight}`);
  await page.mouse.up();
  const wingBefore = await page.evaluate(() => window.QLOBE_DEBUG.getBoard().items.find((item) => item.kind === 'wing-teal'));
  const wingPiece = page.locator(`[data-freeform-id="${wingBefore.id}"]`);
  const wingBox = await wingPiece.boundingBox();
  await page.mouse.move(wingBox.x + wingBox.width / 2, wingBox.y + wingBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(wingLayer.x + wingLayer.width * .28, wingLayer.y + wingLayer.height * .48, { steps: 10 });
  const wingDuringDrag = await page.evaluate((id) => window.QLOBE_DEBUG.getBoard().items.find((item) => item.id === id), wingBefore.id);
  check('placed wing flips during pointer movement before release', wingBefore.mirror !== wingDuringDrag.mirror,
    `${wingBefore.mirror} → ${wingDuringDrag.mirror}`);
  await page.screenshot({ path: path.join(shots, '03a-wing-live-flip.png') });
  await page.mouse.up();
  const wingAfter = await page.evaluate((id) => window.QLOBE_DEBUG.getBoard().items.find((item) => item.id === id), wingBefore.id);
  check('directional wing keeps its live orientation after release', wingDuringDrag.mirror === wingAfter.mirror);
  const beforeTrash = (await page.evaluate(() => window.QLOBE_DEBUG.getState().pieces));
  await dragPieceTo(page, page.locator(`[data-freeform-id="${wingAfter.id}"]`), page.locator('#trash-zone'));
  check('dragging a placed part into clay trash discards it',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().pieces)) === beforeTrash - 1);
  check('limbs family contains eight draggable shapes', familyCounts.limbs === 8);
  check('dress-up family contains eight draggable shapes', familyCounts['dress-up'] === 8);
  const scrollBefore = await page.locator('#parts-tray').evaluate((node) => node.scrollLeft);
  await page.locator('[data-target="tray-next"]').click();
  await page.waitForTimeout(450);
  const scrollAfter = await page.locator('#parts-tray').evaluate((node) => node.scrollLeft);
  check('right clay arrow advances the continuous row', scrollAfter > scrollBefore + 100, `${scrollBefore} → ${Math.round(scrollAfter)}`);
  const trayShell = await page.locator('.tray-shell').boundingBox();
  check('parts tray spans the workbench width', trayShell.width > 1120, `${Math.round(trayShell.width)}px`);
  await page.evaluate(() => {
    window.QLOBE_DEBUG.placePart('spikes-blue');
    window.QLOBE_DEBUG.placePart('heart');
    window.QLOBE_DEBUG.placePart('mouth-goofy');
  });
  check('wake-up unlocks only after a complete free creature',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().readyToWake))
      && await page.locator('[data-target="wake"]').isEnabled());
  await assertTargets(page, 'workbench');
  await page.screenshot({ path: path.join(shots, '03-free-workbench.png') });

  await page.locator('[data-target="wake"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'alive');
  await page.waitForTimeout(750);
  check('wake-up reaches living creature reveal', true);
  await assertTargets(page, 'reveal');
  await page.screenshot({ path: path.join(shots, '04-alive.png') });
  await page.locator('[data-target="save"]').click();
  check('save creates one on-device keepsake', (await page.evaluate(() => window.QLOBE_DEBUG.getState().savedCount)) === 1);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.QLOBE_DEBUG?.getState().screen === 'splash');
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  check('saved creature survives reload', (await page.evaluate(() => window.QLOBE_DEBUG.getState().savedCount)) === 1);
  await page.locator('[data-target="shelf"]').click();
  check('shelf opens saved semantic composition', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'shelf');
  await page.screenshot({ path: path.join(shots, '05-shelf.png') });
  await page.locator('[data-target="saved-0"]').click();
  check('saved composition reopens on the real reveal stage', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'alive');

  await page.evaluate(() => {
    window.QLOBE_DEBUG.home();
    window.QLOBE_DEBUG.chooseCreature('monster');
    window.QLOBE_DEBUG.startMode('copy');
  });
  check('copy mode shows a picture card', await page.locator('.copy-card').isVisible());
  await page.evaluate(() => {
    for (const kind of ['eyes-three', 'mouth-smirk', 'horns-purple', 'heart']) window.QLOBE_DEBUG.placePart(kind);
  });
  check('copy checklist recognizes all required part kinds',
    (await page.locator('.copy-checks i.filled').count()) === 4
      && (await page.evaluate(() => window.QLOBE_DEBUG.getState().readyToWake)));
  await page.screenshot({ path: path.join(shots, '06-copy-monster.png') });

  const portrait = await monitoredPage(browser, { width: 820, height: 1180 });
  await portrait.page.screenshot({ path: path.join(shots, '07-splash-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'dragon'));
  await portrait.page.evaluate(() => {
    for (const kind of ['eyes-mismatch', 'mouth-fangs', 'antlers-crystal', 'wing-lavender']) window.QLOBE_DEBUG.placePart(kind);
  });
  await portrait.page.screenshot({ path: path.join(shots, '08-dragon-portrait.png') });
  const portraitStage = await portrait.page.locator('.creature-stage').boundingBox();
  check('portrait keeps a large creature work area', portraitStage.width > 650 && portraitStage.height > 450,
    `${Math.round(portraitStage.width)}×${Math.round(portraitStage.height)}`);

  const blob = await monitoredPage(browser, { width: 1180, height: 820 });
  await blob.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'blob'));
  check('Blob starts in a clay-ball shape phase',
    (await blob.page.evaluate(() => window.QLOBE_DEBUG.getState().phase)) === 'shape');
  check('Blob offers twelve color-and-size clay starters',
    (await blob.page.evaluate(() => window.QLOBE_DEBUG.listBlobBalls().length)) === 12
      && await blob.page.locator('.part-choice').count() === 12);
  check('Blob shape begins without a prefabricated body', await blob.page.locator('.body-art').count() === 0);
  await blob.page.evaluate(() => {
    for (const kind of ['ball-coral', 'ball-yellow', 'ball-teal', 'ball-lavender']) window.QLOBE_DEBUG.placePart(kind);
  });
  check('four clay balls unlock Blob decoration', await blob.page.locator('[data-target="finish-shape"]').isEnabled());
  await blob.page.locator('[data-target="finish-shape"]').click();
  check('Blob decoration phase reveals the continuous full tray',
    (await blob.page.evaluate(() => window.QLOBE_DEBUG.getState().phase)) === 'decorate'
      && await blob.page.locator('.part-choice').count() === 56);
  await blob.page.evaluate(() => {
    for (const kind of ['eyes-insect', 'mouth-bubbly', 'antennae-bug', 'spot-yellow']) window.QLOBE_DEBUG.placePart(kind);
  });
  check('built Blob with eyes and mouth can wake up', await blob.page.locator('[data-target="wake"]').isEnabled());
  await blob.page.screenshot({ path: path.join(shots, '09-blob-built-from-balls.png') });

  let talking = null;
  if (!skipTalk) {
    talking = await monitoredPage(browser, { width: 1180, height: 820 });
    await talking.page.mouse.click(600, 400);
    await talking.page.evaluate(() => {
      window.QLOBE_DEBUG.startMode('free', 'dino');
      for (const kind of ['eyes-starry', 'mouth-hero', 'mohawk-clay', 'heart']) window.QLOBE_DEBUG.placePart(kind);
      window.QLOBE_DEBUG.mute(false);
    });
    await talking.page.locator('[data-target="wake"]').click();
    await talking.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'alive');
    await talking.page.waitForFunction(() => {
      const mouth = document.querySelector('[data-saved-kind="mouth-hero"]');
      return mouth && !mouth.src.endsWith('/e.webp');
    }, null, { timeout: 10000 });
    check('Wake Up drives the chosen mouth through live viseme frames', true);
    check('Wake Up uses a cloned mouth-specific phrase',
      (await talking.page.locator('#announcer').textContent()).includes('Capes up'));
    await talking.page.screenshot({ path: path.join(shots, '10-live-mouth-viseme.png') });
  }

  const wide = await monitoredPage(browser, { width: 1180, height: 520 });
  await wide.page.evaluate(() => window.QLOBE_DEBUG.startMode('copy', 'dino'));
  await wide.page.evaluate(() => window.QLOBE_DEBUG.winRound());
  check('wide-short viewport completes without losing controls',
    (await wide.page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'alive');
  await wide.page.waitForTimeout(750);
  await wide.page.screenshot({ path: path.join(shots, '11-wide-alive.png') });

  const reduced = await monitoredPage(browser, { width: 1180, height: 820 }, 'reduce');
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'dino'));
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.winRound());
  check('reduced-motion path reaches reveal', (await reduced.page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'alive');

  const ipad = await monitoredPage(browser, { width: 1024, height: 768 }, 'no-preference', {
    deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  });
  await ipad.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'dino'));
  await dragTrayPart(ipad.page, 'part-eyes-pair', .5, .29);
  check('iPad-sized tray drag adds a clay part', (await ipad.page.evaluate(() => window.QLOBE_DEBUG.getState().pieces)) === 1);
  await ipad.page.screenshot({ path: path.join(shots, '12-ipad-touch.png') });

  const all = [landscape, portrait, blob, talking, wide, reduced, ipad].filter(Boolean);
  const errors = all.flatMap((item) => item.errors);
  const failed = all.flatMap((item) => item.failed);
  check('zero unexpected page or console errors', errors.length === 0, errors.join(' | '));
  check('zero failed requests or 404s', failed.length === 0, failed.join(' | '));

  for (const item of all) await item.context.close();
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  // MANDATORY: close the browser in a `finally`. A check that throws mid-drive
  // otherwise leaves Chrome and its Playwright pipe alive, so node never runs
  // out of handles and the driver hangs forever instead of reporting a failure.
  try {
    await drive(browser);
  } finally {
    await browser.close();
    finish({ listFailures: false });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
