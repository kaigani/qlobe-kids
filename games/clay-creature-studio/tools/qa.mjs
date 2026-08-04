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

// A dropped clay ball FALLS before it rests (see the WEIGHT check below), so a
// board point for the blob body can never be hard-coded — it has to be read
// back off QLOBE_DEBUG.clayStats()'s live aspect/viewScale and converted with
// the exact nx/ny map blob-field.js's own toBoard() uses. viewScale is not 1:
// the renderer fits the WHOLE visible stage inside the field's own 2.0-unit
// cube (viewScaleFor in blob-field.js), which on a landscape stage is
// 1/aspect. Hard-coding view scale 1, as this used to, quietly mis-places
// every point on any stage wider than it is tall.
async function blobBoardPoint(page, worldX, worldY) {
  return page.evaluate(([wx, wy]) => {
    const { aspect, viewScale } = window.QLOBE_DEBUG.clayStats();
    return { nx: wx / (2 * aspect * viewScale) + 0.5, ny: 0.5 - wy / (2 * viewScale) };
  }, [worldX, worldY]);
}

// Same conversion, carried on into page CLIENT pixels off the live canvas
// box — for the checks that must be a REAL page.mouse gesture (the whole
// point is that the gesture itself works), rather than a QLOBE_DEBUG verb.
async function blobClientPoint(page, worldX, worldY) {
  return page.evaluate(([wx, wy]) => {
    const { aspect, viewScale } = window.QLOBE_DEBUG.clayStats();
    const rect = document.getElementById('lobe-canvas').getBoundingClientRect();
    const nx = wx / (2 * aspect * viewScale) + 0.5;
    const ny = 0.5 - wy / (2 * viewScale);
    return { x: rect.left + nx * rect.width, y: rect.top + ny * rect.height };
  }, [worldX, worldY]);
}

// SILHOUETTE. The stored field has no per-piece geometry left to read a
// length off — there is no lobe, so there is nothing to ask "how long is
// this one" without asking the render itself. A pull is judged, instead, by
// whether the RENDERED clay actually got wider in pixels, which is the only
// claim that still means something once the model is a voxel field rather
// than a list of primitives. Copies the WebGL canvas into a 2-D canvas (a
// WebGL context can't be read back with getImageData directly) and finds the
// opaque extent, keeping the same antialiased-rim tolerance (alpha > 128)
// the old per-lobe pixel walk used, so the soft rendered edge never clips the
// true extent short. Returns device-pixel extents, or null when nothing is
// opaque yet (e.g. before the first ball has landed).
async function measureSilhouette(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('lobe-canvas');
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    const pixels = copy.getContext('2d').getImageData(0, 0, copy.width, copy.height).data;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let area = 0;
    for (let y = 0; y < copy.height; y++) {
      for (let x = 0; x < copy.width; x++) {
        if (pixels[(y * copy.width + x) * 4 + 3] <= 128) continue;
        area++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (area === 0) return null;
    return { width: maxX - minX + 1, height: maxY - minY + 1, area, minX, maxX, minY, maxY };
  });
}

/**
 * How BLUNT the pulled front is, measured on the rendered pixels.
 *
 * The owner's report was about a shape, not a number: "I don't want the sharp
 * tips." So this reads the canvas the child is looking at, finds the opaque
 * pixel that reaches furthest along the direction the finger dragged, and
 * measures how wide the creature still is a few pixels back from it. A rounded
 * limb stays wide; a drawn-out spike narrows to nothing.
 *
 * Screen coordinates, y down — pass the drag direction as the driver saw it.
 */
async function measureTipBluntness(page, dirX, dirY) {
  const len = Math.hypot(dirX, dirY) || 1;
  return page.evaluate(([ux, uy]) => {
    const canvas = document.getElementById('lobe-canvas');
    const copy = document.createElement('canvas');
    copy.width = canvas.width;
    copy.height = canvas.height;
    copy.getContext('2d').drawImage(canvas, 0, 0);
    const data = copy.getContext('2d').getImageData(0, 0, copy.width, copy.height).data;
    const W = copy.width;
    const H = copy.height;
    const opaque = (x, y) => {
      const xi = Math.round(x);
      const yi = Math.round(y);
      return xi >= 0 && yi >= 0 && xi < W && yi < H && data[(yi * W + xi) * 4 + 3] > 128;
    };
    let best = -Infinity;
    let bx = 0;
    let by = 0;
    let area = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] <= 128) continue;
        area++;
        const t = x * ux + y * uy;
        if (t > best) { best = t; bx = x; by = y; }
      }
    }
    if (!area) return null;
    // Perpendicular to the pull, in the same screen frame.
    const qx = -uy;
    const qy = ux;
    const widthAt = (back) => {
      const cx = bx - ux * back;
      const cy = by - uy * back;
      if (!opaque(cx, cy)) return 0;
      let plus = 0;
      let minus = 0;
      while (plus < W && opaque(cx + qx * (plus + 1), cy + qy * (plus + 1))) plus++;
      while (minus < W && opaque(cx - qx * (minus + 1), cy - qy * (minus + 1))) minus++;
      return plus + minus + 1;
    };
    return {
      area,
      bufferWidth: W,
      tip: [bx, by],
      // Device pixels across the front, at three depths behind the tip.
      widthAt4: widthAt(4),
      widthAt8: widthAt(8),
      widthAt16: widthAt(16),
    };
  }, [dirX / len, dirY / len]);
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

  // The field renderer (blob-field.js) loads three.js asynchronously, and the
  // ground plane is only measured once the renderer exists (its own
  // measureGround(), called from init()). Placing the first ball before that
  // has happened would drop it with no plane to catch it — the WEIGHT check
  // below reads a resting height that was never measured, and nothing ever
  // stamps. clayStats() reports null until the renderer is up, so this is the
  // one wait every blob driver owes before its first placePart.
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.clayStats() !== null);

  // WEIGHT. A ball dropped in mid-air FALLS to the turntable and comes to
  // rest there — and it is still LOOSE clay: nothing has joined the field yet,
  // the op log is untouched, and the ball remains exactly the movable,
  // binnable object it was in the tray. That is the product line loose clay
  // draws (blob-field.js's header comment): unwelded clay is a thing you are
  // holding, not yet the creature. Waited out the way the field itself expects
  // a driver to — poll looseBalls() for `falling` to clear rather than sleep a
  // magic number — then a short settle beat, and checked against the table's
  // own measured height rather than a constant, since a screenshot can't tell
  // "resting on the table" apart from "hanging just above it".
  const dropY = 0.16;
  await blob.page.evaluate((y) => window.QLOBE_DEBUG.placePart('ball-coral', { x: 0.5, y }), dropY);
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.looseBalls().every((b) => !b.falling), null, { timeout: 4000 });
  await blob.page.waitForTimeout(120);
  const afterFall = await blob.page.evaluate(() => ({
    loose: window.QLOBE_DEBUG.looseBalls(),
    ops: window.QLOBE_DEBUG.opCount(),
    ground: window.QLOBE_DEBUG.clayStats().groundBoardY,
  }));
  // THE BALL'S UNDERSIDE MEETS THE TABLE — not its centre, which is a whole
  // radius higher. Board space makes that conversion easy to get wrong: `nr` is
  // a fraction of the stage WIDTH while `ny` is a fraction of its HEIGHT, so a
  // radius expressed in ny units is `nr * aspect`. Comparing the centre against
  // the ground directly reads as a 0.18 miss on a ball that is sitting
  // perfectly, which is exactly what the first run of this check reported.
  const ballStats = await blob.page.evaluate(() => window.QLOBE_DEBUG.clayStats());
  const radiusInNy = afterFall.loose[0].nr * ballStats.aspect;
  const underside = afterFall.loose[0].ny + radiusInNy;
  check('a dropped clay ball falls and rests ON the turntable, and is still loose clay when it gets there',
    afterFall.loose.length === 1 && afterFall.ops === 0
      && afterFall.loose[0].ny > dropY + 0.05
      // Within a fifth of a radius of the table: it is ON the wood, and it has
      // bitten slightly INTO it (that overlap is what the renderer slices off
      // to make the flat contact patch), rather than hovering over its shadow.
      && Math.abs(underside - afterFall.ground) < radiusInNy * 0.25,
    `ny ${dropY} -> ${afterFall.loose[0]?.ny.toFixed(4)}, underside ${underside.toFixed(4)} vs table ${afterFall.ground?.toFixed(4)} ` +
    `(radius ${radiusInNy.toFixed(4)} in ny units), ops=${afterFall.ops}`);

  // WELD IS STAMPING. A ball dropped ON existing clay welds — which is to say
  // it STAMPS, and ceases to exist as an object. This is the same taught
  // moment it always was ("the second blob places ON the first blob"), now
  // implemented as the thing it always meant: the falling ball writes itself
  // into the stored field, and there is no lobe list left for two entries to
  // sit in side by side. Dropped near the resting ball's own LIVE nx (read
  // back off looseBalls(), never hard-coded) so it lands on clay rather than
  // beside it on the bare table, which is the one thing that would leave it
  // loose instead.
  const restingNx = afterFall.loose[0].nx;
  await blob.page.evaluate(([x]) => window.QLOBE_DEBUG.placePart('ball-teal', { x, y: 0.14 }), [restingNx + 0.05]);
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.looseBalls().every((b) => !b.falling), null, { timeout: 4000 });
  await blob.page.waitForTimeout(120);
  const afterWeld = await blob.page.evaluate(() => ({
    loose: window.QLOBE_DEBUG.looseBalls().length,
    ops: window.QLOBE_DEBUG.opCount(),
    balls: window.QLOBE_DEBUG.getState().balls,
    volume: window.QLOBE_DEBUG.clayVolume(),
  }));
  // THREE OPS FOR TWO BALLS, and the third one is the point. Both balls stamp
  // (2 ops) and the second one lands ON the first, so the column under it
  // squashes and logs a compression op — the owner's "some of the weight should
  // compress down and flatten down at the base", visible in the op log. `balls`
  // counts tray stamps only, so it stays at 2: a compression is not a ball and
  // must never move the Decorate gate.
  const weldCompressions = await blob.page.evaluate(() => window.QLOBE_DEBUG.clayOps().filter((o) => o.t === 'c').length);
  check('a ball landing ON clay welds: both stamp into the field and neither is an object any more',
    afterWeld.loose === 0 && afterWeld.balls === 2 && afterWeld.volume > 0
      && afterWeld.ops === 2 + weldCompressions,
    `${JSON.stringify(afterWeld)}, compressions=${weldCompressions}`);
  check('...and the clay TAKES THE WEIGHT: landing on clay squashes the column under it',
    weldCompressions === 1, `${weldCompressions} compression ops logged`);

  // PULL IS ADVECTION. A REAL press-and-drag on the welded lump has to move
  // the MATERIAL under the finger — the whole reason a stored field is a
  // different animal from the old analytic lobes (blob-field.js's header: "the
  // operation the July research said an analytic SDF could not do"). The grab
  // point is read off the LIVE clayBounds(), never a hard-coded board point:
  // a board point goes stale the instant the clay settles onto the table (the
  // trap that cost the feature drive two runs), so aiming at a coordinate
  // computed before the settle risks landing on bare table and getting back
  // { ok: false, reason: 'no-surface' } instead of a pull.
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const beforePull = await blob.page.evaluate(() => ({
    bounds: window.QLOBE_DEBUG.clayBounds(),
    volume: window.QLOBE_DEBUG.clayVolume(),
    ops: window.QLOBE_DEBUG.opCount(),
  }));
  const silhouetteBefore = await measureSilhouette(blob.page);
  const grabWorld = await blob.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.clayBounds();
    return { x: (b.minX + b.maxX) / 2 + (b.maxX - b.minX) * 0.30, y: (b.minY + b.maxY) / 2 };
  });
  const grabPt = await blobClientPoint(blob.page, grabWorld.x, grabWorld.y);
  await blob.page.mouse.move(grabPt.x, grabPt.y);
  await blob.page.mouse.down();
  // Stepped by hand rather than passed a `steps` option: a fast flick arrives
  // as one big pointermove in real use, but the point of THIS gesture is the
  // ordinary case, well past the platform drag slop (interaction-patterns.md
  // #11), dragged up and to the right in an unambiguous straight line.
  for (let i = 1; i <= 18; i++) await blob.page.mouse.move(grabPt.x + 10 * i, grabPt.y - 5 * i);
  await blob.page.mouse.up();
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const afterPull = await blob.page.evaluate(() => ({
    bounds: window.QLOBE_DEBUG.clayBounds(),
    volume: window.QLOBE_DEBUG.clayVolume(),
    ops: window.QLOBE_DEBUG.opCount(),
  }));
  const silhouetteAfter = await measureSilhouette(blob.page);
  const pullVolDriftPct = Math.abs(afterPull.volume - beforePull.volume) / beforePull.volume * 100;
  check('a real press-and-drag on the welded lump pulls the MATERIAL out: the op count rises, the lump widens, and volume is conserved',
    afterPull.ops > beforePull.ops && afterPull.bounds.width > beforePull.bounds.width && pullVolDriftPct < 2,
    `ops ${beforePull.ops}->${afterPull.ops}, width ${beforePull.bounds.width.toFixed(4)}->${afterPull.bounds.width.toFixed(4)}, volume drift ${pullVolDriftPct.toFixed(3)}%`);
  check("...and the RENDERED creature reads visibly wider in actual pixels, not merely in the model's own numbers",
    silhouetteBefore !== null && silhouetteAfter !== null && silhouetteAfter.width > silhouetteBefore.width,
    silhouetteBefore && silhouetteAfter
      ? `silhouette width ${silhouetteBefore.width}px -> ${silhouetteAfter.width}px`
      : 'nothing opaque to measure');

  // ==========================================================================
  // ROUNDED FRONTS — the owner's note on the shipped build: "I don't want the
  // sharp tips. I rounded it out towards the hand in the prototype and that was
  // the ideal setting."
  //
  // The prototype is experiments/clay-physics-lab/field/, whose brush slider is
  // labelled fingertip / medium / palm / whole hand, and the shipped brush was
  // that slider at a quarter — a fingertip. The engine underneath is the same
  // code in both; only the number differed. It is 0.26 now, with a rigid palm
  // in the falloff (field.js's PULL_CORE) so the front stays blunt however hard
  // the clay is worked.
  //
  // Measured on the pixels, not on the model, because "sharp" is something the
  // owner SAW. The floor is in voxels so it does not move when the buffer or
  // the display density does.
  const VOXEL = 0.025;
  const bluntnessVoxels = (m, key) => (m ? (m[key] * 2) / m.bufferWidth / VOXEL : 0);
  const pulledTip = await measureTipBluntness(blob.page, 10, -5);
  check('the pulled limb comes away ROUNDED — the front is still voxels thick just behind its own tip, not drawn out to a point',
    bluntnessVoxels(pulledTip, 'widthAt4') >= 2.2 && bluntnessVoxels(pulledTip, 'widthAt8') >= 3.0,
    pulledTip
      ? `${bluntnessVoxels(pulledTip, 'widthAt4').toFixed(2)} voxels across 4px behind the tip, ${bluntnessVoxels(pulledTip, 'widthAt8').toFixed(2)} at 8px, ${bluntnessVoxels(pulledTip, 'widthAt16').toFixed(2)} at 16px (${pulledTip.widthAt4}/${pulledTip.widthAt8}/${pulledTip.widthAt16} device px on a ${pulledTip.bufferWidth}px buffer)`
      : 'nothing opaque to measure');

  // SETTLE. Every release runs the field's own brief, finite, deterministic
  // relaxation and then goes idle — not merely visually still, but genuinely
  // done: settleState().active has to flip to false on its own, comfortably
  // inside a second, and the geometry it leaves behind then has to hold
  // completely still. The idempotence half is the one that actually protects
  // a child's work: a settle that quietly nudged the same composition every
  // time it was asked would sag the mass a little further on every later
  // gesture for the rest of the session, and none of the checks above this one
  // would ever catch it, because they only look once.
  const settleDeadline = Date.now() + 1000;
  let settle = await blob.page.evaluate(() => window.QLOBE_DEBUG.settleState());
  while (settle?.active && Date.now() < settleDeadline) {
    await blob.page.waitForTimeout(40);
    settle = await blob.page.evaluate(() => window.QLOBE_DEBUG.settleState());
  }
  check('a release settles to stillness within about a second',
    settle?.active === false, JSON.stringify(settle));

  const stillOnce = await blob.page.evaluate(() => ({ bounds: window.QLOBE_DEBUG.clayBounds(), volume: window.QLOBE_DEBUG.clayVolume() }));
  await blob.page.waitForTimeout(200);
  const stillTwice = await blob.page.evaluate(() => ({ bounds: window.QLOBE_DEBUG.clayBounds(), volume: window.QLOBE_DEBUG.clayVolume() }));
  check('a settled stage holds completely still once idle',
    JSON.stringify(stillOnce) === JSON.stringify(stillTwice));

  const forcedBefore = await blob.page.evaluate(() => ({ bounds: window.QLOBE_DEBUG.clayBounds(), volume: window.QLOBE_DEBUG.clayVolume() }));
  await blob.page.evaluate(() => window.QLOBE_DEBUG.settleNow());
  const forcedAfter = await blob.page.evaluate(() => ({ bounds: window.QLOBE_DEBUG.clayBounds(), volume: window.QLOBE_DEBUG.clayVolume() }));
  const settleStateAfterForce = await blob.page.evaluate(() => window.QLOBE_DEBUG.settleState());
  check('settling an already-settled creature is a literal no-op',
    JSON.stringify(forcedBefore) === JSON.stringify(forcedAfter),
    `settleNow() on an idle stage returned settleState ${JSON.stringify(settleStateAfterForce)}`);

  await blob.page.screenshot({ path: path.join(shots, '13-blob-pulled-clay.png') });

  // ==========================================================================
  // THE ROUNDNESS GUARANTEE, under the gestures that used to break it.
  //
  // A gentle drag staying round is the easy half. What produced the spike in
  // the shipped build was a child being a child: flinging a finger, and going
  // back to the same spot over and over. Both are run here on a page of their
  // own, and the front has to still be blunt at the end of them.
  //
  // The flick matters for a second reason. A pointermove longer than three
  // substeps can carry gets shortened by the field's own step cap, and a
  // gesture that then advanced its grab by the length it ASKED for would walk
  // the brush off the front of its own material and start pulling a thread with
  // the outer skirt of the falloff. Measured with that bug present the front
  // came out at 0.87 voxels; blob-field.js's pullToward() clamps first.
  const rough = await monitoredPage(browser, { width: 1180, height: 820 });
  await rough.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'blob'));
  await rough.page.waitForFunction(() => window.QLOBE_DEBUG.clayStats() !== null);
  await rough.page.evaluate(() => {
    window.QLOBE_DEBUG.stampAt(0.44, 0.55, 0.15, '#ee4a44');
    window.QLOBE_DEBUG.stampAt(0.56, 0.53, 0.13, '#1fbca4');
  });
  await rough.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});

  const flickWorld = await rough.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.clayBounds();
    return { x: (b.minX + b.maxX) / 2 + (b.maxX - b.minX) * 0.30, y: (b.minY + b.maxY) / 2 };
  });
  const flickPt = await blobClientPoint(rough.page, flickWorld.x, flickWorld.y);
  await rough.page.mouse.move(flickPt.x, flickPt.y);
  await rough.page.mouse.down();
  // Six pointermoves of 58 CSS px each. A flung finger, not a drag.
  for (let i = 1; i <= 6; i++) await rough.page.mouse.move(flickPt.x + 55 * i, flickPt.y - 20 * i);
  await rough.page.mouse.up();
  await rough.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const flickTip = await measureTipBluntness(rough.page, 55, -20);
  check('a FLUNG finger still leaves a rounded front — the grab never outruns the clay it is holding',
    bluntnessVoxels(flickTip, 'widthAt4') >= 2.2 && bluntnessVoxels(flickTip, 'widthAt8') >= 3.0,
    flickTip
      ? `${bluntnessVoxels(flickTip, 'widthAt4').toFixed(2)} voxels across 4px behind the tip, ${bluntnessVoxels(flickTip, 'widthAt8').toFixed(2)} at 8px`
      : 'nothing opaque to measure');

  // Ten more gestures, each re-grabbing the tip the last one made. This is the
  // shape that ran away: every pull sharpened the front, and the next pull took
  // hold of the sharpened thing.
  for (let g = 0; g < 10; g++) {
    const tipWorld = await rough.page.evaluate(() => {
      const b = window.QLOBE_DEBUG.clayBounds();
      return { x: b.maxX - 0.04, y: (b.minY + b.maxY) / 2 };
    });
    const tipPt = await blobClientPoint(rough.page, tipWorld.x, tipWorld.y);
    await rough.page.mouse.move(tipPt.x, tipPt.y);
    await rough.page.mouse.down();
    for (let i = 1; i <= 5; i++) await rough.page.mouse.move(tipPt.x + 14 * i, tipPt.y - 3 * i);
    await rough.page.mouse.up();
  }
  await rough.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 6000 }).catch(() => {});
  const worriedTip = await measureTipBluntness(rough.page, 14, -3);
  check('ten gestures that each re-grab the last one\'s tip STILL leave a rounded front — the sharpening does not compound',
    bluntnessVoxels(worriedTip, 'widthAt4') >= 2.2 && bluntnessVoxels(worriedTip, 'widthAt8') >= 3.0,
    worriedTip
      ? `${bluntnessVoxels(worriedTip, 'widthAt4').toFixed(2)} voxels across 4px behind the tip, ${bluntnessVoxels(worriedTip, 'widthAt8').toFixed(2)} at 8px`
      : 'nothing opaque to measure');
  await rough.page.screenshot({ path: path.join(shots, '13a-blob-rounded-under-rough-handling.png') });

  // ==========================================================================
  // DELETED FROM THIS SECTION, ON PURPOSE, NOT BY ACCIDENT — a check that
  // asserts a behaviour the toy no longer has is worse than no check:
  //   - BRANCH / BRANCH TAPER. Branching was the one gesture that minted a
  //     new primitive. There are no primitives any more, so a sideways drag
  //     off a long mass is just a pull in a sideways direction; there is no
  //     second lobe left to taper.
  //   - MERGE (the whole isolated `merge` session: the same-colour candidate,
  //     the cross-colour non-candidate, the count-drops-by-one settle). Merge
  //     and consolidation have no meaning in a stored field. Two masses that
  //     touch ARE one mass, from the instant they touch — not eventually, and
  //     not pending a same-colour check.
  //   - FURTHER STRETCH as its own check. It is the identical gesture to the
  //     PULL already proven in pass 1 (PULL IS ADVECTION), just aimed at a
  //     different point on the same lump.
  // ==========================================================================

  // SLOP. A press that never clears PULL_SLOP_PX (10 CSS px) changes nothing
  // whatsoever — no op, no material moved, no way for a child resting a
  // finger on their creature to accidentally smear it. Pressed dead centre of
  // the live lump, read off clayBounds(), so the point is guaranteed to land
  // on clay rather than the bare table beside it.
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const beforeSlop = await blob.page.evaluate(() => ({
    ops: window.QLOBE_DEBUG.opCount(),
    volume: window.QLOBE_DEBUG.clayVolume(),
    bounds: window.QLOBE_DEBUG.clayBounds(),
  }));
  const slopWorld = await blob.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.clayBounds();
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  });
  const slopPoint = await blobClientPoint(blob.page, slopWorld.x, slopWorld.y);
  await blob.page.mouse.move(slopPoint.x, slopPoint.y);
  await blob.page.mouse.down();
  await blob.page.mouse.move(slopPoint.x + 5, slopPoint.y + 3, { steps: 3 }); // well under PULL_SLOP_PX (10px)
  await blob.page.mouse.up();
  await blob.page.waitForTimeout(120);
  const afterSlop = await blob.page.evaluate(() => ({
    ops: window.QLOBE_DEBUG.opCount(),
    volume: window.QLOBE_DEBUG.clayVolume(),
    bounds: window.QLOBE_DEBUG.clayBounds(),
  }));
  check('a sub-slop press on the lump changes nothing at all — a resting finger can never smear the creature',
    afterSlop.ops === beforeSlop.ops && afterSlop.volume === beforeSlop.volume
      && JSON.stringify(afterSlop.bounds) === JSON.stringify(beforeSlop.bounds),
    `ops ${beforeSlop.ops}->${afterSlop.ops}, volume ${beforeSlop.volume} vs ${afterSlop.volume}`);

  // MID-GESTURE REVERT. A real press-and-drag well past the slop, cut off
  // mid-flight by a genuine `pointercancel` — what iOS actually dispatches
  // when the system takes the gesture away (an incoming call, control
  // centre, multitouch confusion). Colour is the thing that CANNOT be
  // un-mixed by re-pulling — running a drag backwards makes a stir worse, not
  // better (see STIR below) — so this escape has to work at the storage
  // level, not the gesture level: `clayCensus(...).mixedFraction` is asserted
  // bit-exact alongside volume, ops and bounds, not merely "close".
  const fingerprint = () => blob.page.evaluate(() => ({
    ops: window.QLOBE_DEBUG.opCount(),
    volume: window.QLOBE_DEBUG.clayVolume(),
    bounds: window.QLOBE_DEBUG.clayBounds(),
    census: window.QLOBE_DEBUG.clayCensus(['#ee4a44', '#1fbca4']),
  }));
  const fp0 = await fingerprint();
  const cancelWorld = await blob.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.clayBounds();
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  });
  const cancelPt = await blobClientPoint(blob.page, cancelWorld.x, cancelWorld.y);
  await blob.page.mouse.move(cancelPt.x, cancelPt.y);
  await blob.page.mouse.down();
  for (let i = 1; i <= 12; i++) await blob.page.mouse.move(cancelPt.x + 9 * i, cancelPt.y - 4 * i);
  await blob.page.evaluate(() => {
    // A real pointercancel, not a hand-rolled escape hatch of this driver's
    // own invention — the same event class the platform actually dispatches.
    window.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 1, isPrimary: true, bubbles: true }));
  });
  await blob.page.mouse.up();
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const fpCancel = await fingerprint();
  check('a pointercancel mid-pull reverts the gesture bit-exactly, including the colour census',
    fpCancel.ops === fp0.ops
      && Math.abs(fpCancel.volume - fp0.volume) < 1e-12
      && Math.abs(fpCancel.census.mixedFraction - fp0.census.mixedFraction) < 1e-12
      && JSON.stringify(fpCancel.bounds) === JSON.stringify(fp0.bounds),
    `ops ${fp0.ops}->${fpCancel.ops}, volume ${fp0.volume} vs ${fpCancel.volume}, ` +
    `mixed ${fp0.census.mixedFraction} vs ${fpCancel.census.mixedFraction}`);

  // BIN ESCAPE. Same drag, carried to `#trash-zone` and released there
  // instead of cancelled. A pull makes no new material — it only moves
  // material that was already part of the creature — so carrying it to the
  // bin means the same thing as it never having happened: bit-exact revert,
  // not a partial undo that quietly eats a sliver of clay.
  const trashZone = await blob.page.locator('#trash-zone').boundingBox();
  const binWorld = await blob.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.clayBounds();
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  });
  const binPt = await blobClientPoint(blob.page, binWorld.x, binWorld.y);
  await blob.page.mouse.move(binPt.x, binPt.y);
  await blob.page.mouse.down();
  for (let i = 1; i <= 10; i++) await blob.page.mouse.move(binPt.x + 8 * i, binPt.y - 4 * i);
  await blob.page.mouse.move(trashZone.x + trashZone.width / 2, trashZone.y + trashZone.height / 2, { steps: 12 });
  await blob.page.mouse.up();
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const fpBin = await fingerprint();
  check('carrying an in-flight pull to the bin reverts it bit-exactly, rather than eating clay',
    fpBin.ops === fp0.ops && Math.abs(fpBin.volume - fp0.volume) < 1e-12
      && JSON.stringify(fpBin.bounds) === JSON.stringify(fp0.bounds),
    `ops ${fp0.ops} vs ${fpBin.ops}, volume ${fp0.volume} vs ${fpBin.volume}`);

  // ==========================================================================
  // STIR MARBLES THE CLAY, AND CANNOT BE UN-STIRRED — the atomic-identity
  // proof, on a stage of its own so the seam sits exactly where it is placed.
  //
  // The owner's own words: "the green clay should now be a part of the whole
  // and behave accordingly, not have an atomic identity." Colour is a
  // property of the material AT A PLACE now, not a label on an object, so
  // dragging across a colour boundary drags the boundary itself. Lab numbers
  // from the field drive this recipe is ported from: mixedFraction sits at
  // 0.012-0.039 for an untouched seam, rises to 0.109 after a real stir, and
  // rises AGAIN to 0.258 after running the exact inverse drag in reverse
  // order — running a gesture backwards makes real clay MORE mixed, never
  // less. That the fraction only ever climbs, gesture after gesture, IS the
  // proof the atomic identity is gone.
  // ==========================================================================
  const stir = await monitoredPage(browser, { width: 1180, height: 820 });
  await stir.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'blob'));
  await stir.page.waitForFunction(() => window.QLOBE_DEBUG.clayStats() !== null);
  // Stamped where the clay will REST (derived from groundWorldY, not a board
  // guess), so the settle below has nothing to do and the seam stays exactly
  // where the stir loop expects to find it — the staleness trap
  // VOCABULARY.md warns about: a board point goes stale the instant the clay
  // settles onto the table.
  await stir.page.evaluate(() => {
    const s = window.QLOBE_DEBUG.clayStats();
    const toB = (x, y) => ({ nx: x / (2 * s.aspect * s.viewScale) + 0.5, ny: 0.5 - y / (2 * s.viewScale) });
    const A = toB(-0.22, s.groundWorldY + 0.24);
    const B = toB(0.22, s.groundWorldY + 0.24);
    const nr = 0.26 / (2 * s.aspect * s.viewScale);
    window.QLOBE_DEBUG.stampAt(A.nx, A.ny, nr, '#3fbf6f');
    window.QLOBE_DEBUG.stampAt(B.nx, B.ny, nr, '#ff7314');
  });
  await stir.page.evaluate(() => window.QLOBE_DEBUG.settleNow());
  await stir.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const censusBefore = await stir.page.evaluate(() => window.QLOBE_DEBUG.clayCensus(['#3fbf6f', '#ff7314']));

  // A STIR, not a drag: an orbiting, folding motion round the seam's own
  // centre. A straight-line drag mostly relocates a crisp interface; only
  // shear actually marbles two colours together.
  await stir.page.evaluate(() => {
    const s = window.QLOBE_DEBUG.clayStats();
    const b = window.QLOBE_DEBUG.clayBounds();
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const toB = (x, y) => ({ nx: x / (2 * s.aspect * s.viewScale) + 0.5, ny: 0.5 - y / (2 * s.viewScale) });
    const dB = (x, y) => ({ dx: x / (2 * s.aspect * s.viewScale), dy: -y / (2 * s.viewScale) });
    const N = 30;
    // How far each stir gesture reaches, in world units. A round number on
    // purpose: it used to be written as `brush * 0.34 * 3` — a guess at how far
    // three substeps at the old step cap could carry — which was never true (it
    // always asked for more than one gesture delivers, and the field truncated
    // the rest) and went stale the moment the cap moved. The bar this drives is
    // the colour census, not a distance, so what it wants is a stir big enough
    // to fold the seam and a number that does not lie about where it came from.
    const STIR_REACH = 0.22;
    for (let i = 0; i < N; i++) {
      const angle = (i * 2 * Math.PI * 4) / N;
      const r = 0.06 + 0.16 * (0.5 + 0.5 * Math.sin(i * 0.75));
      const p = toB(cx + r * Math.cos(angle), cy + r * Math.sin(angle) * 0.5);
      const d = dB(-Math.sin(angle) * STIR_REACH, Math.cos(angle) * 0.5 * STIR_REACH);
      window.QLOBE_DEBUG.pullAt(p.nx, p.ny, d.dx, d.dy, 3);
    }
  });
  await stir.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const censusStirred = await stir.page.evaluate(() => window.QLOBE_DEBUG.clayCensus(['#3fbf6f', '#ff7314']));
  check('stirring two colours MARBLES the clay (mixed fraction rises sharply)',
    censusStirred.mixedFraction > censusBefore.mixedFraction * 3 && censusStirred.mixedFraction > 0.10,
    `mixedFraction ${censusBefore.mixedFraction.toFixed(4)} -> ${censusStirred.mixedFraction.toFixed(4)}`);

  // Now the EXACT inverse: same points, negated deltas, reverse order. In
  // real clay this makes the seam worse, not better — that irreversibility
  // is the feature the owner chose, not an oversight of the port.
  const stirCentre = await stir.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.clayBounds();
    return { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 };
  });
  await stir.page.evaluate((centre) => {
    const s = window.QLOBE_DEBUG.clayStats();
    const toB = (x, y) => ({ nx: x / (2 * s.aspect * s.viewScale) + 0.5, ny: 0.5 - y / (2 * s.viewScale) });
    const dB = (x, y) => ({ dx: x / (2 * s.aspect * s.viewScale), dy: -y / (2 * s.viewScale) });
    const N = 30;
    const STIR_REACH = 0.22; // must match the forward stir above, or this is not its inverse
    for (let i = N - 1; i >= 0; i--) {
      const angle = (i * 2 * Math.PI * 4) / N;
      const r = 0.06 + 0.16 * (0.5 + 0.5 * Math.sin(i * 0.75));
      const p = toB(centre.cx + r * Math.cos(angle), centre.cy + r * Math.sin(angle) * 0.5);
      const d = dB(Math.sin(angle) * STIR_REACH, -Math.cos(angle) * 0.5 * STIR_REACH);
      window.QLOBE_DEBUG.pullAt(p.nx, p.ny, d.dx, d.dy, 3);
    }
  }, stirCentre);
  await stir.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const censusInverted = await stir.page.evaluate(() => window.QLOBE_DEBUG.clayCensus(['#3fbf6f', '#ff7314']));
  check('...and running the drag backwards does NOT recover the seam — colour mixing is monotone, the proof the identity is gone',
    censusInverted.mixedFraction >= censusStirred.mixedFraction * 0.9
      && censusInverted.mixedFraction > censusBefore.mixedFraction * 2,
    `before ${censusBefore.mixedFraction.toFixed(4)}, stirred ${censusStirred.mixedFraction.toFixed(4)}, after inverse ${censusInverted.mixedFraction.toFixed(4)}`);
  await stir.page.screenshot({ path: path.join(shots, '16-blob-marbled.png') });

  // NO-REFUSAL SOAK. The core promise of the redesign: a child can work the
  // same creature forever, because reshaping the field allocates nothing —
  // there is no lobe budget to exhaust and no cap to hit any more
  // (blob-field.js's header: "THERE ARE NO LOBES AND THEREFORE NO LOBE CAP").
  // Sixty gestures on the pass-1 lump, each aimed at a point derived from the
  // LIVE clayBounds() at the moment it fires — a soak that keeps pulling at a
  // point the creature has since moved away from measures nothing but its
  // own stale arithmetic.
  const SOAK_GESTURES = 60;
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const soakBefore = await blob.page.evaluate(() => ({ volume: window.QLOBE_DEBUG.clayVolume(), probe: window.QLOBE_DEBUG.clayProbe(9) }));
  const soakResult = await blob.page.evaluate((n) => {
    let seed = 11;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const st = window.QLOBE_DEBUG.clayStats();
    const toB = (x, y) => ({ nx: x / (2 * st.aspect * st.viewScale) + 0.5, ny: 0.5 - y / (2 * st.viewScale) });
    let refusals = 0;
    const opP95s = [];
    for (let i = 0; i < n; i++) {
      const bb = window.QLOBE_DEBUG.clayBounds();
      const a = rnd() * Math.PI * 2;
      const rad = 0.20 + rnd() * 0.18;
      const p = toB((bb.minX + bb.maxX) / 2 + Math.cos(a) * rad * (bb.maxX - bb.minX) * 0.5,
        (bb.minY + bb.maxY) / 2 + Math.sin(a) * rad * (bb.maxY - bb.minY) * 0.5);
      const r = window.QLOBE_DEBUG.pullAt(p.nx, p.ny, (rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.08, 4);
      if (!r.ok) { refusals += 1; continue; }
      opP95s.push(r.opP95Ms);
    }
    return { refusals, opP95Ms: opP95s.length ? Math.max(...opP95s) : 0 };
  }, SOAK_GESTURES);
  // THE DRAG'S OWN UPLOAD, read before the settle that follows it.
  //
  // The check further down is about what a DRAG costs the GPU bus, and a drag
  // uploads the handful of bricks it dirtied. A settle rewrites every voxel in
  // the grid and uploads all of it, once — that is the known, deliberate hitch,
  // not a coalescing failure. Reading `lastUpload*` after waiting for the settle
  // therefore measures the wrong operation entirely, and only passed before
  // because the soak happened to leave the creature level enough that no settle
  // was owed. Now that gravity solves the lean the child can actually SEE, sixty
  // random pulls usually do leave one owed, and the sample has to be taken while
  // the last thing uploaded is still the last thing dragged.
  const soakDragStats = await blob.page.evaluate(() => window.QLOBE_DEBUG.clayStats());
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 8000 }).catch(() => {});
  const soakAfter = await blob.page.evaluate(() => ({
    volume: window.QLOBE_DEBUG.clayVolume(),
    probe: window.QLOBE_DEBUG.clayProbe(9),
    stats: window.QLOBE_DEBUG.clayStats(),
  }));
  const soakDriftPct = Math.abs(soakAfter.volume - soakBefore.volume) / soakBefore.volume * 100;
  check(`${SOAK_GESTURES} successive pulls across the creature never refuse on a point that hits clay`,
    soakResult.refusals === 0, `refusals=${soakResult.refusals} of ${SOAK_GESTURES}`);
  check(`${SOAK_GESTURES} gestures: total clay drifts less than 2%`,
    soakDriftPct < 2, `${soakDriftPct.toFixed(3)}%`);
  check(`${SOAK_GESTURES} gestures: pull CPU per advection stays inside the 8ms p95 budget`,
    soakResult.opP95Ms < 8, `worst opP95Ms across the soak: ${soakResult.opP95Ms.toFixed(2)}ms`);
  check(`${SOAK_GESTURES} gestures: the raymarch stays FLAT (no growth with sculpting complexity)`,
    soakAfter.probe.medianMs < Math.max(soakBefore.probe.medianMs * 1.6, 6) && soakAfter.probe.medianMs < 13,
    `march ${soakBefore.probe.medianMs.toFixed(2)}ms -> ${soakAfter.probe.medianMs.toFixed(2)}ms at DPR ${soakAfter.probe.pixelRatio}`);
  // The byte bound is there to tell a coalesced DRAG region apart from a whole-
  // grid settle bake, which is 2000 KB — not to police the region's size, which
  // legitimately grew with the brush (200 KB / 0.90 ms at the old fingertip
  // brush, 420 KB / 1.30 ms at the hand-sized one, against a 4 ms bar).
  check('drag uploads stay COALESCED into one region per frame',
    soakDragStats.lastUploadMs < 4 && soakDragStats.lastUploadBytes < 1000 * 1024,
    `${soakDragStats.lastUploadRegion}, ${(soakDragStats.lastUploadBytes / 1024).toFixed(1)} KB in ${soakDragStats.lastUploadMs.toFixed(2)}ms`);
  await blob.page.screenshot({ path: path.join(shots, '14-blob-worked-and-rested.png') });

  // THE BALL RESERVE, IN SPIRIT. The four-ball Decorate gate must never be
  // starved by however much sculpting a child does first — drop the two
  // remaining balls now, after sixty pulls' worth of clay-work, and they
  // still have to land and weld.
  for (const kind of ['ball-yellow', 'ball-lavender']) {
    await blob.page.evaluate((k) => window.QLOBE_DEBUG.placePart(k), kind);
    // eslint-disable-next-line no-await-in-loop
    await blob.page.waitForFunction(() => window.QLOBE_DEBUG.looseBalls().every((b) => !b.falling), null, { timeout: 4000 });
    // eslint-disable-next-line no-await-in-loop
    await blob.page.waitForTimeout(120);
  }
  const afterReserveDrop = await blob.page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('after sixty sculpting gestures the two remaining balls still land and weld, reaching the four the Decorate gate needs',
    afterReserveDrop.balls === 4 && afterReserveDrop.loose === 0,
    `balls=${afterReserveDrop.balls}, loose=${afterReserveDrop.loose}`);

  // Proved, not assumed: one more gesture after the fourth ball is down, and
  // ball count still reads four — a pull is not a stamp and can never fake or
  // cost progress against the gate.
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const oneMoreWorld = await blob.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.clayBounds();
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  });
  const oneMorePt = await blobBoardPoint(blob.page, oneMoreWorld.x, oneMoreWorld.y);
  await blob.page.evaluate(({ nx, ny }) => window.QLOBE_DEBUG.pullAt(nx, ny, 0.05, 0.05, 4), oneMorePt);
  const ballsAfterOneMore = await blob.page.evaluate(() => window.QLOBE_DEBUG.getState().balls);
  check('ball count never drops below four once four balls are down',
    ballsAfterOneMore === 4, `balls=${ballsAfterOneMore}`);

  // A WELDED BALL IS NOT A HANDLE. A press-and-drag from the middle of the
  // welded lump, carried all the way to the trash and released there, must
  // NOT remove any clay — the gesture is a pull (PULL IS ADVECTION, pass 1),
  // and a pull carried to the bin reverts exactly like any other in-flight
  // pull (BIN ESCAPE, above). The lump is not made of handles any more:
  // there is no ball left inside it for a drag to lever back out.
  const notHandleBefore = await blob.page.evaluate(() => ({ volume: window.QLOBE_DEBUG.clayVolume(), ops: window.QLOBE_DEBUG.opCount() }));
  const notHandleWorld = await blob.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.clayBounds();
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  });
  const notHandleStart = await blobClientPoint(blob.page, notHandleWorld.x, notHandleWorld.y);
  const trashBoxHandle = await blob.page.locator('#trash-zone').boundingBox();
  await blob.page.mouse.move(notHandleStart.x, notHandleStart.y);
  await blob.page.mouse.down();
  await blob.page.mouse.move(notHandleStart.x - 30, notHandleStart.y - 20, { steps: 8 }); // clear the slop first
  await blob.page.mouse.move(trashBoxHandle.x + trashBoxHandle.width / 2, trashBoxHandle.y + trashBoxHandle.height / 2, { steps: 14 });
  await blob.page.mouse.up();
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const notHandleAfter = await blob.page.evaluate(() => ({ volume: window.QLOBE_DEBUG.clayVolume(), ops: window.QLOBE_DEBUG.opCount() }));
  check('dragging from the middle of the welded lump to the bin removes no clay at all — the lump is not made of handles any more',
    Math.abs(notHandleAfter.volume - notHandleBefore.volume) < 1e-12 && notHandleAfter.ops === notHandleBefore.ops,
    `volume ${notHandleBefore.volume} vs ${notHandleAfter.volume}, ops ${notHandleBefore.ops} -> ${notHandleAfter.ops}`);

  // ==========================================================================
  // GRAVITY REST — the owner's first playtest defect, on a stage of its own.
  //
  // "Note how the object has not settled as it would from gravity — it would be
  // rotated to sit on the table." The ground behaviour only ever flattened clay
  // that OVERLAPPED the plane, which says nothing about orientation, so a mass
  // drawn out and upward was left balanced on one end with its long belly
  // hanging in the air and stayed there for the rest of the session.
  //
  // Built directly with stampAt rather than dropped-and-dragged balls: five
  // stamps walking up a 40-degree diagonal, DELIBERATELY in mid-air — a loaf
  // standing on one end is the fixture itself, not an accident of where balls
  // happened to land.
  const rest = await monitoredPage(browser, { width: 1180, height: 820 });
  await rest.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'blob'));
  await rest.page.waitForFunction(() => window.QLOBE_DEBUG.clayStats() !== null);
  await rest.page.evaluate(() => {
    // Five balls up a 40-degree diagonal: a loaf standing on one end.
    const angle = (40 * Math.PI) / 180;
    for (let i = 0; i < 5; i++) {
      const t = (i - 2) * 0.075;
      window.QLOBE_DEBUG.stampAt(0.5 + Math.cos(angle) * t, 0.55 - Math.sin(angle) * t, 0.09, i < 2 ? '#3fbf6f' : '#ff7314');
    }
  });
  // A short beat so the render-on-demand loop has actually run a frame and
  // started the owed settle animation (settlePending only becomes a live
  // settleAnim on the NEXT rAF) — otherwise settleNow() below finds no
  // in-flight animation to log, further down.
  await rest.page.waitForTimeout(80);
  const tiltBefore = await rest.page.evaluate(() => window.QLOBE_DEBUG.settleState());
  // IT LANDS BEFORE IT FALLS OVER, and that ordering is the physics rather than
  // a quirk of the fixture. This loaf is stamped deliberately in MID-AIR, and
  // balance is a question about a body and the ground it stands on: with nothing
  // under it there is no footprint for its centre of mass to be outside of, so
  // the only thing owed is the drop. The shape-based solver this replaced did
  // not care — it read the silhouette, which looks the same falling as it does
  // resting, and planned a full topple for a creature in free fall.
  //
  // So what is asserted here is that the creature knows it is not at rest and
  // that what it is owed is a real drop; the topple itself is asserted below,
  // once it has landed and there is something to topple about.
  check('a creature built standing on one end in mid-air reports it cannot hold the pose, with a real drop owed',
    tiltBefore?.atRest === false && Math.abs(tiltBefore.drop) > 0.05,
    `atRest=${tiltBefore?.atRest}, drop=${(tiltBefore?.drop ?? 0).toFixed(4)}, angle=${((tiltBefore?.angle ?? 0) * 180 / Math.PI).toFixed(1)}deg`);
  check('...and it is not asked to rotate while it is still in the air — you cannot topple about a table you are not touching',
    tiltBefore?.angle === 0 && tiltBefore?.balance === null,
    `angle=${((tiltBefore?.angle ?? 0) * 180 / Math.PI).toFixed(1)}deg, balance=${JSON.stringify(tiltBefore?.balance)}`);

  // LATERAL, AND ONLY LATERAL. The owner, on the shipped build: "The rotation
  // forward and back is unnecessary — we only need lateral rotation <-> if the
  // object is unbalanced. On the x-y plane of the laptop, no z-direction
  // forward or back."
  //
  // It is checked as an axis rather than judged from a screenshot because a
  // rotation about x is precisely the one a screenshot cannot show: the camera
  // is orthographic down -z, so pitching the creature toward the viewer barely
  // moves its silhouette — what the child gets is not a topple but their
  // creature quietly changing shape. Measured on the build before this fix, a
  // plain 40-degree LATERAL lean planned an axis of [-0.79, 0, -0.62]: four
  // fifths of that settle was a pitch nobody asked for.
  const lateralOnly = (axis) => Array.isArray(axis) && Math.abs(axis[0]) < 1e-9 && Math.abs(axis[1]) < 1e-9 && Math.abs(Math.abs(axis[2]) - 1) < 1e-9;
  check('gravity turns the loaf about the VIEW axis and nothing else — it tips sideways, it never pitches toward the viewer',
    lateralOnly(tiltBefore?.axis),
    `axis [${(tiltBefore?.axis ?? []).map((v) => v.toFixed(6)).join(', ')}]`);

  await rest.page.evaluate(() => window.QLOBE_DEBUG.settleNow());
  await rest.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 });
  const tiltAfter = await rest.page.evaluate(() => ({
    settle: window.QLOBE_DEBUG.settleState(),
    bounds: window.QLOBE_DEBUG.clayBounds(),
    ground: window.QLOBE_DEBUG.clayStats().groundWorldY,
  }));
  check('a tilted loaf reports it cannot hold the pose, then settleNow() lands it at rest',
    tiltAfter.settle.atRest === true && tiltAfter.settle.angle < 0.05,
    `tilt ${(tiltBefore.angle * 180 / Math.PI).toFixed(1)}deg -> atRest=${tiltAfter.settle.atRest}, angle=${(tiltAfter.settle.angle * 180 / Math.PI).toFixed(1)}deg`);
  // IT LIES DOWN, in the geometry — the owner's own annotation stated as a
  // measurement: wider than tall, and its underside actually on the wood.
  check('...and the loaf ends up WIDER than it is tall — it lies down in the geometry, not merely in a stability predicate',
    tiltAfter.bounds.width > tiltAfter.bounds.height,
    `${tiltAfter.bounds.width.toFixed(4)} wide x ${tiltAfter.bounds.height.toFixed(4)} tall`);
  check('...and it actually TOUCHES the table',
    Math.abs(tiltAfter.bounds.minY - tiltAfter.ground) < 0.06,
    `minY ${tiltAfter.bounds.minY.toFixed(4)} vs ground ${tiltAfter.ground.toFixed(4)}`);

  // The settle log records the topple that rode along with the relaxation —
  // the review hook a settle that quietly did nothing would still have to lie
  // to, since it can only report `resting: true` on a plan it actually had.
  // NOW MAKE IT GENUINELY UNBALANCED, and watch it go over.
  //
  // The loaf above is not the fixture for this. Its 40 degrees are 40 degrees of
  // BOARD, and board space is anisotropic — nx spans two world units across the
  // stage while ny spans only 2/aspect — so in the world the camera actually
  // shows, that "loaf standing on one end" is 0.71 wide and 0.56 tall. It is
  // wider than it is tall before anything settles it, its centre of mass sits
  // comfortably over its own foot, and a creature in that state is not falling
  // over: it is standing. The old shape-based solver rotated it anyway, which is
  // the defect this whole section now exists to prevent.
  //
  // So: hang a heavy ball off one side of the settled body, well outside its
  // footprint, in WORLD coordinates. That is a real overhang and it must topple.
  const restStats = await rest.page.evaluate(() => window.QLOBE_DEBUG.clayStats());
  const restBounds = await rest.page.evaluate(() => window.QLOBE_DEBUG.clayBounds());
  const cantileverWorldX = restBounds.maxX + 0.20;
  const cantileverWorldY = restStats.groundWorldY + 0.42;
  const cantilever = await blobBoardPoint(rest.page, cantileverWorldX, cantileverWorldY);
  const balanceBefore = await rest.page.evaluate(() => window.QLOBE_DEBUG.settleState());
  await rest.page.evaluate(([nx, ny, nr]) => window.QLOBE_DEBUG.stampAt(nx, ny, nr, '#ff7314'),
    [cantilever.nx, cantilever.ny, 0.22 / (2 * restStats.aspect * restStats.viewScale)]);
  const overhung = await rest.page.evaluate(() => window.QLOBE_DEBUG.settleState());
  check('a heavy mass hung off one side puts the centre of mass OUTSIDE the footprint, and the creature reports it is falling',
    overhung?.balance?.toppling === true && overhung.angle > 0.06,
    `overhang ${overhung?.balance?.overhang?.toFixed(2)} (was ${balanceBefore?.balance?.overhang?.toFixed(2)}), planned ${((overhung?.angle ?? 0) * 180 / Math.PI).toFixed(1)}deg`);

  const toppleBounds = await rest.page.evaluate(() => window.QLOBE_DEBUG.clayBounds());
  await rest.page.evaluate(() => window.QLOBE_DEBUG.settleNow());
  await rest.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 });

  // A FALL IS SEVERAL SETTLES, so the topple is somewhere IN the log rather
  // than only in its last entry. Each settle corrects a damped bite of the
  // imbalance and re-measures the footprint — which has MOVED, because
  // different clay is touching the table now — so the sequence reads: the real
  // rotations, then a final zero-angle plan, which is how the creature reports
  // it has come to rest rather than rocking on forever.
  const restEntries = await rest.page.evaluate(() => window.QLOBE_DEBUG.blobSettleLog());
  const toppleEntry = restEntries.reduce((best, e) => (e.angle > (best?.angle ?? -1) ? e : best), null);
  check('the settle log records the topple that rode along with the relaxation',
    toppleEntry?.resting === true && toppleEntry?.baked === true && toppleEntry?.angle > 0.06,
    `${restEntries.length} settles logged, biggest turn ${((toppleEntry?.angle ?? 0) * 180 / Math.PI).toFixed(1)}deg (resting=${toppleEntry?.resting}, baked=${toppleEntry?.baked}); angles [${restEntries.map((e) => (e.angle * 180 / Math.PI).toFixed(1)).join(', ')}]`);
  check('...and the fall ENDS at rest — the last settle plans nothing, which is how a roll stops instead of rocking',
    restEntries.at(-1)?.angle === 0,
    `final planned angle ${((restEntries.at(-1)?.angle ?? 0) * 180 / Math.PI).toFixed(2)}deg`);

  const toppledBounds = await rest.page.evaluate(() => window.QLOBE_DEBUG.clayBounds());
  const settledBalance = await rest.page.evaluate(() => window.QLOBE_DEBUG.settleState());
  check('...and the toppled creature ends up LOWER and BALANCED — it fell, and then it stopped because it was done falling',
    toppledBounds.height < toppleBounds.height && settledBalance?.balance?.toppling === false,
    `height ${toppleBounds.height.toFixed(4)} -> ${toppledBounds.height.toFixed(4)}, final overhang ${settledBalance?.balance?.overhang?.toFixed(2)}`);
  // ...and the log carries the axis, so "it only ever tips sideways" is a fact
  // a reviewer reads rather than a claim the code makes about itself. Every
  // settle in the session, not just the last one.
  const restAxes = await rest.page.evaluate(() => window.QLOBE_DEBUG.blobSettleLog().map((e) => e.axis));
  check('every settle this session logged turned about the view axis alone',
    restAxes.length > 0 && restAxes.every(lateralOnly),
    `${restAxes.length} settles, worst off-axis ${Math.max(0, ...restAxes.map((a) => Math.max(Math.abs(a?.[0] ?? 1), Math.abs(a?.[1] ?? 1)))).toExponential(2)}`);

  // IDEMPOTENT. A creature that has come to rest does not move again — the
  // same fixed-point guarantee the rest of the settle carries. Without it a
  // rested creature would rock forever, one dead band at a time.
  const restedOnce = await rest.page.evaluate(() => ({ bounds: window.QLOBE_DEBUG.clayBounds(), volume: window.QLOBE_DEBUG.clayVolume() }));
  await rest.page.evaluate(() => { window.QLOBE_DEBUG.settleNow(); window.QLOBE_DEBUG.settleNow(); });
  const restedTwice = await rest.page.evaluate(() => ({ bounds: window.QLOBE_DEBUG.clayBounds(), volume: window.QLOBE_DEBUG.clayVolume() }));
  check('settling a rested creature again is a literal no-op',
    Math.abs(restedTwice.volume - restedOnce.volume) < 1e-9 && JSON.stringify(restedTwice.bounds) === JSON.stringify(restedOnce.bounds),
    `volume ${restedOnce.volume} vs ${restedTwice.volume}`);

  // DELETED: "gravity never rotates clay while a finger is on it", and the
  // rigid-rotation check sampled through blobRestPose() mid-fall. There is no
  // per-component pose hook left to sample, and rigidity is no longer
  // something a driver can assert from outside — it is structural now: the
  // settle animation is a POSE applied to the renderer that never touches a
  // single voxel while it plays, and the material is re-baked into the stored
  // field exactly once, at the very end of the relaxation (blob-field.js's
  // advanceSettle). There is no mid-fall MATERIAL state to check pairwise
  // distances against any more — only a mid-fall camera pose over clay that
  // has not moved yet.
  await rest.page.screenshot({ path: path.join(shots, '15-blob-gravity-rest.png') });

  // ==========================================================================
  // DEPTH IMBALANCE IS NOT A PROBLEM TO SOLVE — the other half of the owner's
  // rule, and the half that is invisible if you only ever look at screenshots.
  //
  // The fixture is a loaf that is already lying flat ON SCREEN, but tilted so
  // one end is nearer the camera than the other. There is nothing about it a
  // child can see as off balance. The 3-D solver this replaced found the tilt
  // anyway and pitched it 48 degrees about x to "correct" it, and because that
  // rotation is almost invisible through an orthographic lens, what the child
  // actually saw was their creature spontaneously changing shape.
  //
  // stampAt's `depth` exists for this check and nothing else: it is the only
  // way to build a body that is unbalanced in z ALONE (see blob-field.js).
  const depth = await monitoredPage(browser, { width: 1180, height: 820 });
  await depth.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'blob'));
  await depth.page.waitForFunction(() => window.QLOBE_DEBUG.clayStats() !== null);
  await depth.page.evaluate(() => {
    // Five balls walking across the screen, and simultaneously from the back of
    // the table to the front. Flat in the plane the child sees; steeply tilted
    // in the one they do not.
    for (let i = 0; i < 5; i++) {
      const t = (i - 2) * 0.075;
      window.QLOBE_DEBUG.stampAt(0.5 + t, 0.55, 0.09, i < 2 ? '#3fbf6f' : '#ff7314', { depth: t * 3.6 });
    }
  });
  await depth.page.waitForTimeout(80);
  const depthBefore = await depth.page.evaluate(() => ({
    settle: window.QLOBE_DEBUG.settleState(),
    bounds: window.QLOBE_DEBUG.clayBounds(),
  }));
  const depthSilhouetteBefore = await measureSilhouette(depth.page);
  check('a creature tilted ONLY in depth is not asked to rotate — gravity has nothing to say about a lean the child cannot see',
    depthBefore.settle?.angle < 0.06,
    `planned ${((depthBefore.settle?.angle ?? 0) * 180 / Math.PI).toFixed(2)}deg (the settle trigger is 3.4deg; the 3-D solver this replaced planned 48deg on the same fixture)`);
  check('...and the rotation it would plan is still about the view axis, never a pitch',
    lateralOnly(depthBefore.settle?.axis),
    `axis [${(depthBefore.settle?.axis ?? []).map((v) => v.toFixed(6)).join(', ')}]`);

  await depth.page.evaluate(() => window.QLOBE_DEBUG.settleNow());
  await depth.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 });
  const depthSilhouetteAfter = await measureSilhouette(depth.page);
  const depthWidthDrift = depthSilhouetteBefore && depthSilhouetteAfter
    ? Math.abs(depthSilhouetteAfter.width - depthSilhouetteBefore.width) / depthSilhouetteBefore.width
    : 1;
  const depthAspectBefore = depthSilhouetteBefore ? depthSilhouetteBefore.width / depthSilhouetteBefore.height : 0;
  const depthAspectAfter = depthSilhouetteAfter ? depthSilhouetteAfter.width / depthSilhouetteAfter.height : 0;
  // Forced through a settle, the creature may sit DOWN, and sitting down trims
  // the underside against the table — so its HEIGHT is allowed to lose a few
  // pixels and regularly does. Its WIDTH is not: a lateral turn is the only
  // thing that changes how wide a body reads, so that is the number that
  // answers "did gravity turn it?". Measured across the settle it moves by well
  // under a pixel in three hundred.
  check('...and forcing a settle on it does not turn it: the rendered creature is exactly as wide afterwards',
    depthWidthDrift < 0.02,
    depthSilhouetteBefore && depthSilhouetteAfter
      ? `silhouette ${depthSilhouetteBefore.width}x${depthSilhouetteBefore.height}px -> ${depthSilhouetteAfter.width}x${depthSilhouetteAfter.height}px (width moved ${(depthWidthDrift * 100).toFixed(2)}%, aspect ${depthAspectBefore.toFixed(3)} -> ${depthAspectAfter.toFixed(3)}; the table cut is what trims the height)`
      : 'nothing opaque to measure');
  await depth.page.screenshot({ path: path.join(shots, '15a-blob-depth-tilt-left-alone.png') });

  // ==========================================================================
  // THE LEVER PROOF — the owner's second playtest defect, on a stage of its
  // own, and the most important check in the blob half of this file.
  //
  // "With further distortion, I'm able to rotate the green clay piece out
  // completely. The intention is that the green clay should now be a part of
  // the whole and behave accordingly, not have an atomic identity." The OLD
  // check proved a weld held. THE CHECK INVERTS here: there is no weld left to
  // lever, because there is no accessor that could return "the green ball" as
  // its own addressable thing any more — proving that is now a STRUCTURAL
  // claim about the review hook itself, not just a behavioural one about the
  // clay.
  //
  // CROSS-COLOUR ON PURPOSE: a same-colour seam would keep mixing toward
  // uniform and the question "did the green come out as a unit" would stop
  // being answerable either way. Real pointer gestures throughout, not the
  // programmatic hook — the owner's original defect was a real drag.
  // ==========================================================================
  const lever = await monitoredPage(browser, { width: 1180, height: 820 });
  await lever.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'blob'));
  await lever.page.waitForFunction(() => window.QLOBE_DEBUG.clayStats() !== null);

  // STRUCTURAL. The review hook has to stop being ABLE to ask "which piece is
  // this?", or QLOBE_DEBUG stops being a truthful description of the toy.
  const debugKeys = await lever.page.evaluate(() => Object.keys(window.QLOBE_DEBUG));
  const deadVerbs = ['getLobes', 'blobShapes', 'pullOnLobe', 'blobWelds', 'blobMergeCandidate', 'consolidateBlob', 'blobRestPose'];
  const survivingDeadVerbs = deadVerbs.filter((name) => debugKeys.includes(name));
  check('the review hook exposes no per-piece accessor any more — nothing left can answer "which piece is this?"',
    survivingDeadVerbs.length === 0, `still present: ${survivingDeadVerbs.join(', ') || 'none'}`);

  // BEHAVIOURAL. Green welded to orange, stamped at REST height (derived from
  // groundWorldY, per VOCABULARY.md's staleness trap) so the lever attempts
  // below start from a known, already-settled pose rather than fighting their
  // own fixture's fall.
  await lever.page.evaluate(() => {
    const s = window.QLOBE_DEBUG.clayStats();
    const toB = (x, y) => ({ nx: x / (2 * s.aspect * s.viewScale) + 0.5, ny: 0.5 - y / (2 * s.viewScale) });
    const nr = (r) => r / (2 * s.aspect * s.viewScale);
    const green = toB(-0.16, s.groundWorldY + 0.20);
    const orange = toB(0.14, s.groundWorldY + 0.18);
    window.QLOBE_DEBUG.stampAt(green.nx, green.ny, nr(0.20), '#3fbf6f');
    window.QLOBE_DEBUG.stampAt(orange.nx, orange.ny, nr(0.20), '#ff7314');
  });
  await lever.page.evaluate(() => window.QLOBE_DEBUG.settleNow());
  await lever.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});

  // Board-point drag helper: real press, real release, forced settle between
  // attempts so each attack starts from a stable pose rather than compounding
  // an in-flight relaxation onto the next drag.
  const dragBoard = async (page, from, to, steps = 14) => {
    const toClient = (p) => page.evaluate(({ nx, ny }) => {
      const rect = document.getElementById('lobe-canvas').getBoundingClientRect();
      return { x: rect.left + nx * rect.width, y: rect.top + ny * rect.height };
    }, p);
    const a = await toClient(from);
    const b = await toClient(to);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    for (let i = 1; i <= steps; i++) await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps);
    await page.mouse.up();
    await page.evaluate(() => window.QLOBE_DEBUG.settleNow());
    await page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  };

  const leverCensusBefore = await lever.page.evaluate(() => window.QLOBE_DEBUG.clayCensus(['#3fbf6f', '#ff7314']));
  const leverVolumeBefore = await lever.page.evaluate(() => window.QLOBE_DEBUG.clayVolume());
  await lever.page.screenshot({ path: path.join(shots, '16a-blob-worked-hard.png') });

  // Haul the green side round the clock, ~24 times, the same attack the owner
  // used to walk a welded mass out of the body. The grab point is the LIVE
  // bounds' own left edge (where green was stamped) every attempt — there is
  // no lobe id left to ask "where is the green end now".
  const LEVER_ATTEMPTS = 24;
  let worstGreenFraction = leverCensusBefore.fractions[0];
  let worstGreenAt = 'start';
  let worstVolume = leverVolumeBefore;
  let mostMixed = leverCensusBefore.mixed;
  let mixingEverUndone = false;
  let lastMixedFraction = leverCensusBefore.mixedFraction;
  for (let attempt = 0; attempt < LEVER_ATTEMPTS; attempt++) {
    const theta = (attempt % 12) / 12 * Math.PI * 2;
    // eslint-disable-next-line no-await-in-loop
    const grabWorld = await lever.page.evaluate(() => {
      const b = window.QLOBE_DEBUG.clayBounds();
      return { x: b.minX + (b.maxX - b.minX) * 0.15, y: (b.minY + b.maxY) / 2 };
    });
    // eslint-disable-next-line no-await-in-loop
    const grabBoard = await blobBoardPoint(lever.page, grabWorld.x, grabWorld.y);
    // eslint-disable-next-line no-await-in-loop
    const toBoard = await blobBoardPoint(lever.page, grabWorld.x + Math.cos(theta) * 0.9, grabWorld.y + Math.sin(theta) * 0.9);
    // eslint-disable-next-line no-await-in-loop
    await dragBoard(lever.page, grabBoard, toBoard);
    // eslint-disable-next-line no-await-in-loop
    const now = await lever.page.evaluate(() => ({
      census: window.QLOBE_DEBUG.clayCensus(['#3fbf6f', '#ff7314']),
      volume: window.QLOBE_DEBUG.clayVolume(),
    }));
    if (now.census.fractions[0] < worstGreenFraction) {
      worstGreenFraction = now.census.fractions[0];
      worstGreenAt = `attempt ${attempt}`;
    }
    // THE INVARIANT IS ON THE ABSOLUTE AMOUNT OF MIXED MATERIAL, NOT ON THE
    // FRACTION, and the difference is the whole point of this check.
    //
    // `mixedFraction` is mixed/material, and a pull STRETCHES the creature —
    // the same clay comes to occupy more voxels, and the new surface it opens
    // up is unmixed. So the ratio can fall while not one atom of mixing has
    // been undone. Asserting the ratio is monotone would flake on a gesture
    // that is behaving perfectly. What must never fall is the amount of clay
    // that has stopped being either tray colour: that is the thing there is no
    // way back from, and it is what "no atomic identity" cashes out to.
    if (now.census.mixed > mostMixed) mostMixed = now.census.mixed;
    if (now.census.mixed < mostMixed * 0.85) mixingEverUndone = true;
    // Volume is allowed to FALL a little and is not allowed to collapse. These
    // are 0.9-unit drags across the whole domain, far more violent than a child
    // could manage, and clay driven into the table is cut off by the ground —
    // which is the physics being right, not clay leaking. What would be a
    // defect is the creature coming apart.
    if (now.volume < worstVolume) worstVolume = now.volume;
    lastMixedFraction = now.census.mixedFraction;
  }
  check(`a welded green mass survives ${LEVER_ATTEMPTS} real-pointer lever attempts round the clock and never comes out as a unit`,
    worstGreenFraction >= leverCensusBefore.fractions[0] * 0.6
      && worstVolume >= leverVolumeBefore * 0.6
      && !mixingEverUndone,
    `green fraction ${leverCensusBefore.fractions[0].toFixed(4)} -> worst ${worstGreenFraction.toFixed(4)} (${worstGreenAt}), ` +
    `volume ${leverVolumeBefore.toFixed(5)} -> worst ${worstVolume.toFixed(5)}, ` +
    `mixed voxels peaked at ${mostMixed} and never fell below 85% of that (${mixingEverUndone ? 'FAILED' : 'held'}), ` +
    `mixedFraction ${leverCensusBefore.mixedFraction.toFixed(4)} -> ${lastMixedFraction.toFixed(4)}`);
  await lever.page.screenshot({ path: path.join(shots, '16-blob-no-atomic-identity.png') });

  // ==========================================================================
  // LOOSE CLAY, on a stage of its own. A ball that never welded to anything is
  // ordinary loose clay still — it moves under a drag and still bins, exactly
  // as it always could. Only a WELDED ball lost those two gestures (PULL IS
  // ADVECTION and A WELDED BALL IS NOT A HANDLE, above).
  //
  // It gets a FRESH session rather than sharing any worked creature above, and
  // that is a correctness requirement, not tidiness. A ball dropped NEAR
  // existing clay legitimately welds on the way down — that is the toy
  // working, not the test failing — so this fixture needs a patch of empty
  // table wide enough that the loose ball's own radius clears the creature,
  // and an empty stage is the simplest way to guarantee one exists.
  // ==========================================================================
  const loose = await monitoredPage(browser, { width: 1180, height: 820 });
  await loose.page.evaluate(() => window.QLOBE_DEBUG.startMode('free', 'blob'));
  await loose.page.waitForFunction(() => window.QLOBE_DEBUG.clayStats() !== null);
  // ONE ball, and an otherwise empty table. Two would be a better story — both
  // stay loose, because a ball welds to what it TOUCHES and neither has touched
  // anything — but the checks below shove this ball right across the table, and
  // a second ball parked in its path gets welded into on the way, at which
  // point there is no loose ball left to bin and the section is measuring the
  // wrong thing. That is the toy working correctly; it is just not what this
  // fixture is asking about.
  await loose.page.evaluate(() => window.QLOBE_DEBUG.placePart('ball-mint', { x: 0.22, y: 0.16 }));
  await loose.page.waitForFunction(() => window.QLOBE_DEBUG.looseBalls().every((b) => !b.falling), null, { timeout: 4000 });
  await loose.page.waitForTimeout(120);
  const looseState0 = await loose.page.evaluate(() => ({ loose: window.QLOBE_DEBUG.looseBalls(), ops: window.QLOBE_DEBUG.opCount() }));
  check('a ball dropped clear of everything stays LOOSE clay, and nothing has joined the field',
    looseState0.loose.length === 1 && looseState0.ops === 0,
    JSON.stringify(looseState0));
  if (!looseState0.loose.length) throw new Error('loose-ball fixture welded on the way down — widen the drop point');

  const clientOf = (page, b) => page.evaluate(({ nx, ny }) => {
    const rect = document.getElementById('lobe-canvas').getBoundingClientRect();
    return { x: rect.left + nx * rect.width, y: rect.top + ny * rect.height };
  }, b);
  const looseBefore = looseState0.loose[0];
  const loosePoint = await clientOf(loose.page, looseBefore);
  // A press that lands on some other element is a broken test, not a broken
  // toy, and the two read identically from the assertion below — so say
  // which it is before pressing.
  const looseElAtPoint = await loose.page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? { id: el.id, cls: el.className, tag: el.tagName } : null;
  }, loosePoint);
  check('the loose ball\'s press point lands on the clay canvas, not some other UI on top of it',
    !!looseElAtPoint && looseElAtPoint.id === 'lobe-canvas',
    `element at press point: ${JSON.stringify(looseElAtPoint)}`);

  const looseTarget = await loose.page.evaluate(() => {
    const rect = document.getElementById('lobe-canvas').getBoundingClientRect();
    return { x: rect.left + 0.14 * rect.width, y: rect.top + 0.40 * rect.height };
  });
  await loose.page.mouse.move(loosePoint.x, loosePoint.y);
  await loose.page.mouse.down();
  await loose.page.mouse.move(looseTarget.x, looseTarget.y, { steps: 12 });
  await loose.page.mouse.up();
  await loose.page.waitForTimeout(150);
  const looseAfter = (await loose.page.evaluate(() => window.QLOBE_DEBUG.looseBalls()))[0];
  check('a loose ball still moves under a real drag exactly as it always could',
    !!looseAfter && Math.hypot(looseAfter.nx - looseBefore.nx, looseAfter.ny - looseBefore.ny) > 0.02,
    `from ${JSON.stringify(looseBefore)} to ${JSON.stringify(looseAfter)}`);

  // EDGE CLAMP — the regression guard for a silent, unrecoverable trap. The
  // canvas element is only as wide as the stage box, so a ball shoved past its
  // edge used to come to rest with its centre OUTSIDE the element that carries
  // the pointerdown listener: from then on nothing could pick it up, move it,
  // or carry it to the bin. It just sat there for the rest of the session, on
  // a toy whose whole promise is that everything is reversible. The clamp now
  // ALSO keeps the ball inside the field's own MATERIAL GRID — clay pushed
  // past the grid is not clipped by a camera, it stops existing, which is a
  // strictly worse trap than an off-screen sprite ever was. Shove one hard at
  // the far edge and prove the clay is still under the finger afterwards —
  // `elementFromPoint`, not a bounds calculation, because being inside the
  // canvas RECT is not the same claim as the canvas actually receiving the
  // press. The bin drag immediately below then proves it is still grabbable.
  const shovePoint = await clientOf(loose.page, looseAfter);
  const canvasBox = await loose.page.locator('#lobe-canvas').boundingBox();
  await loose.page.mouse.move(shovePoint.x, shovePoint.y);
  await loose.page.mouse.down();
  await loose.page.mouse.move(canvasBox.x + canvasBox.width + 260, shovePoint.y, { steps: 14 });
  await loose.page.mouse.up();
  await loose.page.waitForTimeout(150);
  // BY ID, not by index. There are two loose balls on this table (see the
  // check above — that is the point of the fixture), and indexing into the
  // array picks whichever one the engine happens to list first rather than the
  // one this section has been dragging around.
  const shoved = await loose.page.evaluate((id) => window.QLOBE_DEBUG.looseBalls().find((b) => b.id === id) || null, looseBefore.id);
  const shovedPoint = shoved ? await clientOf(loose.page, shoved) : null;
  const stillOnCanvas = shovedPoint ? await loose.page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return !!el && el.id === 'lobe-canvas';
  }, shovedPoint) : false;
  check('a ball shoved past the edge of the stage stays on the clay canvas, not stranded off it or lost past the material grid',
    !!shoved && stillOnCanvas,
    shoved ? `ball centre at ${Math.round(shovedPoint.x)},${Math.round(shovedPoint.y)}; canvas right edge ${Math.round(canvasBox.x + canvasBox.width)}` : 'ball vanished');

  const trashBoxLoose = await loose.page.locator('#trash-zone').boundingBox();
  await loose.page.mouse.move(shovedPoint.x, shovedPoint.y);
  await loose.page.mouse.down();
  await loose.page.mouse.move(trashBoxLoose.x + trashBoxLoose.width / 2, trashBoxLoose.y + trashBoxLoose.height / 2, { steps: 12 });
  await loose.page.mouse.up();
  await loose.page.waitForTimeout(150);
  const afterBin = await loose.page.evaluate((id) => ({
    gone: !window.QLOBE_DEBUG.looseBalls().some((b) => b.id === id),
    loose: window.QLOBE_DEBUG.looseBalls().length,
    // It went in the BIN, not into the creature: binning a loose ball must
    // discard it, never weld it. An empty op log is the proof.
    ops: window.QLOBE_DEBUG.opCount(),
  }), looseBefore.id);
  check('a loose ball still bins exactly as it always could, and is discarded rather than welded',
    afterBin.gone && afterBin.loose === 0 && afterBin.ops === 0, JSON.stringify(afterBin));

  // Somewhere on the creature there is always clay to pull, and there is no
  // spent spot to route around any more — reshaping never refuses. Point
  // derived from the LIVE clayBounds(), after every round trip above
  // (pointercancel, bin-escape, the sixty-gesture soak, the not-a-handle drag).
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});
  const finalWorld = await blob.page.evaluate(() => {
    const b = window.QLOBE_DEBUG.clayBounds();
    return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
  });
  const finalBoard = await blobBoardPoint(blob.page, finalWorld.x, finalWorld.y);
  const finalPull = await blob.page.evaluate(({ nx, ny }) => window.QLOBE_DEBUG.pullAt(nx, ny, 0.10, 0.08, 5), finalBoard);
  check('the lump can still be pulled after every pointercancel/bin-escape/soak round-trip above',
    finalPull.ok === true, JSON.stringify(finalPull));

  // Wait for the RELAXATION that pull just started, not for a fixed slice of
  // time. Every release now hands the lump a settle, and those are real
  // animated frames — measuring "idle" before they are done measures the
  // settle and reports a render-on-demand violation that is not one.
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.settleState()?.active === false, null, { timeout: 4000 }).catch(() => {});

  // Render-on-demand, per docs/interaction-patterns.md #12. A settled stage
  // must cost the battery nothing at all.
  //
  // QUIESCE FIRST, THEN MEASURE. `settleState().active === false` says the
  // physics is done; it does not say the RENDERER has finished drawing the
  // result. A release deliberately chains a couple of extra frames after the
  // last one (the fix for "the texture upload lands on the frame that draws
  // it"), so starting the clock the instant the settle reports done can catch
  // one of those in the window and report a render-on-demand violation that is
  // nothing of the kind. Poll until the counter stops moving, and only then
  // measure — that is what "idle" means.
  const idleRenders = await blob.page.evaluate(async () => {
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    let last = -1;
    for (let i = 0; i < 40; i++) {
      const now = window.QLOBE_DEBUG.clayStats().renders;
      if (now === last) break;
      last = now;
      await sleep(100);
    }
    const before = window.QLOBE_DEBUG.clayStats().renders;
    await sleep(2000);
    return { before, after: window.QLOBE_DEBUG.clayStats().renders };
  });
  check('an idle clay stage renders zero frames', idleRenders.after === idleRenders.before,
    `${idleRenders.before} -> ${idleRenders.after} over 2s`);

  // SEED. The hand-worked-surface displacement is keyed to a per-creature
  // seed, and it has to be a real, finite number on the live field before
  // there is any point asking whether it survives a save (below).
  const seedValue = await blob.page.evaluate(() => window.QLOBE_DEBUG.blobSeed());
  check('the creature carries a finite hand-worked-surface seed', Number.isFinite(seedValue), `seed=${seedValue}`);

  // ball-yellow and ball-lavender went down in the no-refusal soak above.
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

  // SAVE FORMAT v5. The save is an OP LOG now, not a lobe list — the sequence
  // of stamps and pulls that made this creature, a few hundred bytes for a
  // dozen of them against 34 KB for a gzipped grid of the same body — and it
  // is byte-exact on replay, which is what lets a shelf card be RE-DERIVED
  // from the log instead of stored as its own image data. That has to hold
  // for both places a composition is written: the raw field doc (checked
  // here) and the actual on-device keepsake this game persists to
  // localStorage (checked below). The storage key is reproduced here directly
  // (main.js's STORAGE_KEY constant is not exported for a driver to import).
  const liveDoc = await blob.page.evaluate(() => window.QLOBE_DEBUG.getClay());
  const liveBytes = JSON.stringify(liveDoc).length;
  const bytesPerOp = liveBytes / Math.max(1, liveDoc.ops?.length || 1);
  // BOUNDED PER OP, NOT IN TOTAL, and the difference is a real property of this
  // save format worth stating rather than papering over: the log records the
  // child's whole SESSION, so it grows with how long they worked and not with
  // how complicated the creature ended up. Measured in node: ~88 bytes and
  // ~0.85 ms of replay per op, dead linear — 29 ops is 2.6 KB and 92 ms, 504
  // ops is 44 KB and 440 ms. A hard total ceiling here would therefore be a
  // ceiling on PLAYTIME, which is not a thing this toy is allowed to have; what
  // has to hold is that each gesture costs a bounded, small amount.
  check('the live clay field serialises as a v6 op log carrying the seed, at a bounded cost per gesture',
    liveDoc.format === 'qlobe-clay-field' && liveDoc.version === 6 && liveDoc.seed === seedValue
      && Array.isArray(liveDoc.ops) && liveDoc.ops.length > 0
      && bytesPerOp < 140 && liveBytes < 262144,
    `format=${liveDoc.format} version=${liveDoc.version} seed=${liveDoc.seed} ops=${liveDoc.ops?.length} ` +
    `bytes=${liveBytes} (${bytesPerOp.toFixed(1)}/op)`);

  await blob.page.locator('[data-target="wake"]').click();
  await blob.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'alive');
  await blob.page.waitForTimeout(750);
  await blob.page.locator('[data-target="save"]').click();
  check('waking and saving the built Blob creates one on-device keepsake',
    (await blob.page.evaluate(() => window.QLOBE_DEBUG.getState().savedCount)) === 1);
  const savedDoc = await blob.page.evaluate(() => {
    const gallery = JSON.parse(localStorage.getItem('qlobe-clay-creatures-v1') || '[]');
    return gallery[0]?.blob || null;
  });
  check('the on-device save carries the same v6 op log the live field had',
    !!savedDoc && savedDoc.version === 6 && savedDoc.seed === seedValue
      && JSON.stringify(savedDoc.ops) === JSON.stringify(liveDoc.ops),
    savedDoc
      ? `version=${savedDoc.version} seed=${savedDoc.seed} ops=${savedDoc.ops?.length}`
      : 'no saved blob doc found in localStorage');

  // REPLAY DETERMINISM THROUGH THE NEW OPS. A save is only a save if replaying
  // it rebuilds the same clay, and this session's log now contains op kinds
  // that did not exist before — compressions from every ball that welded onto
  // clay, and stamps and pulls whose numbers were clamped by the domain guard
  // before they were written down. Rebuilt in the PAGE, from the module the
  // game itself is running, and compared voxel-for-voxel against the live grid.
  // Replayed TWICE and compared, rather than against the live field: by this
  // point the creature has been woken, and waking tears the clay stage down —
  // there is no live grid left to compare to, which is exactly why the save has
  // to be able to stand on its own.
  const replayCheck = await blob.page.evaluate(async (doc) => {
    const mod = await import('../../shared/js/clay/field.js');
    const a = mod.createFieldFromDocument(doc);
    const b = mod.createFieldFromDocument(doc);
    if (!a || !b) return { ok: false, reason: 'document refused' };
    let diffs = 0;
    for (let i = 0; i < a.dist.length; i++) if (a.dist[i] !== b.dist[i]) diffs++;
    let colourDiffs = 0;
    for (let i = 0; i < a.color.length; i++) if (a.color[i] !== b.color[i]) colourDiffs++;
    return {
      ok: diffs === 0 && colourDiffs === 0 && a.volume() > 0,
      diffs,
      colourDiffs,
      compressions: doc.ops.filter((o) => o.t === 'c').length,
      stamps: doc.ops.filter((o) => o.t === 's').length,
      pulls: doc.ops.filter((o) => o.t === 'p').length,
      volume: a.volume(),
    };
  }, savedDoc);
  check('the saved op log replays BIT-EXACT, through the compression and domain-guard ops this session wrote',
    replayCheck.ok === true && replayCheck.compressions > 0,
    `${replayCheck.stamps} stamps, ${replayCheck.pulls} pulls, ${replayCheck.compressions} compressions -> ${replayCheck.diffs} differing voxels, ${replayCheck.colourDiffs} differing colour bytes, volume ${replayCheck.volume?.toFixed(6)}`);

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

  const all = [landscape, portrait, blob, rough, stir, rest, depth, lever, loose, talking, wide, reduced, ipad].filter(Boolean);
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
