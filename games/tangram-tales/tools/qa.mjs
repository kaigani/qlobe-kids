#!/usr/bin/env node
// Tangram Tales — real-Chrome smoke, interaction, persistence, and visual-QC driver.
//   python3 -m http.server 8127
//   node games/tangram-tales/tools/qa.mjs --base http://127.0.0.1:8127

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  args, launchChrome, createReporter, openSession,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8127');
const url = `${base.replace(/\/$/, '')}/games/tangram-tales/`;
const shots = resolveShots('qa-shots/tangram-tales');
const { check, note, finish } = createReporter();

async function session(browser, viewport, reducedMotion = 'no-preference') {
  return openSession(browser, { url, base, viewport, reducedMotion });
}

async function boot(page) {
  await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => {
    window.QLOBE_DEBUG.mute(true);
    window.QLOBE_DEBUG.fastTimers();
    window.QLOBE_DEBUG.seed(42);
  });
}

async function largeTargets(page, label) {
  const undersized = await page.locator('[data-target]').evaluateAll((nodes) => nodes
    .filter((node) => node.getClientRects().length && !node.disabled)
    .map((node) => ({ id: node.dataset.target, rect: node.getBoundingClientRect() }))
    .filter(({ rect }) => rect.width < 96 || rect.height < 96)
    .map(({ id, rect }) => `${id}:${Math.round(rect.width)}×${Math.round(rect.height)}`));
  check(`${label}: all visible child targets are at least 96px`, undersized.length === 0, undersized.join(', '));
}

async function realDragOutside(page, pieceId) {
  const source = await page.locator(`[data-target="piece-${pieceId}"]`).boundingBox();
  if (!source) return false;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(8, 8, { steps: 9 });
  await page.mouse.up();
  return true;
}

async function realDragOffset(page, pieceId, slotId, normalizedX) {
  const source = await page.locator(`[data-target="piece-${pieceId}"]`).boundingBox();
  const target = await page.locator(`[data-target="slot-${slotId}"]`).boundingBox();
  const field = await page.locator('#puzzle-field').boundingBox();
  if (!source || !target || !field) return false;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2 + field.width * normalizedX, target.y + target.height / 2, { steps: 9 });
  await page.mouse.up();
  return true;
}

async function measureDragWidth(page, pieceId, slotId) {
  const source = await page.locator(`[data-target="piece-${pieceId}"]`).boundingBox();
  if (!source) return null;
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  try {
    return await page.locator('.drag-piece').evaluate((piece, targetId) => {
      const field = document.querySelector('#puzzle-field');
      const slot = document.querySelector(`[data-target="slot-${targetId}"]`);
      const fieldWidth = field?.getBoundingClientRect().width || 0;
      const size = Number.parseFloat(getComputedStyle(slot).getPropertyValue('--size')) || 0;
      return {
        inlineWidth: Number.parseFloat(piece.style.width) || 0,
        expectedWidth: fieldWidth * size,
      };
    }, slotId);
  } finally {
    await page.mouse.move(8, 8);
    await page.mouse.up();
    await page.locator('.drag-piece').waitFor({ state: 'detached' });
  }
}

async function trayPieceIds(page) {
  return page.locator('.tray-piece').evaluateAll((nodes) => nodes.map((node) => node.dataset.piece));
}

async function holdRotateIntoSlot(page, pieceId, slotId) {
  const source = await page.locator(`[data-target="piece-${pieceId}"]`).boundingBox();
  const target = await page.locator(`[data-target="slot-${slotId}"]`).boundingBox();
  if (!source || !target) return { angle: 0, settling: false };
  const sx = source.x + source.width / 2;
  const sy = source.y + source.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.move(sx + 10, sy + 7, { steps: 3 });
  await page.waitForTimeout(620);
  const angle = await page.locator('.drag-piece').evaluate((piece) =>
    Number.parseFloat(piece.style.getPropertyValue('--held-rotation')) || 0);
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 9 });
  await page.mouse.up();
  const settling = await page.locator(`.placed-piece[data-slot="${slotId}"].is-settling`).count() === 1;
  return { angle, settling };
}

async function drive(browser) {
  await ensureShots(shots);
  const audioLines = JSON.parse(await readFile(new URL('../assets/audio/lines.json', import.meta.url), 'utf8'));
  const audioManifest = JSON.parse(await readFile(new URL('../assets/audio/manifest.json', import.meta.url), 'utf8'));

  const catalog = await openSession(browser, {
    url: `${base.replace(/\/$/, '')}/#math-number-sense`,
    base,
    viewport: { width: 1180, height: 820 },
    ready: false,
  });
  const catalogTile = catalog.page.locator('a[aria-label^="Tangram Tales"]');
  await catalogTile.waitFor();
  check('catalog registers Tangram Tales as a playable tile',
    await catalogTile.getAttribute('href') === 'games/tangram-tales/');
  check('catalog tile art loads at natural resolution', await catalogTile.locator('img').evaluate((image) => image.complete && image.naturalWidth >= 600));
  await catalogTile.click();
  await catalog.page.waitForURL(/\/games\/tangram-tales\/$/);
  await boot(catalog.page);
  check('catalog tile boots the real game route', (await catalog.page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'splash');
  check('catalog route has zero failed requests', catalog.failed.length === 0, catalog.failed.join(' | '));
  await catalog.context.close();

  const landscape = await session(browser, { width: 1180, height: 820 });
  const page = landscape.page;
  await boot(page);
  await page.evaluate(() => window.QLOBE_DEBUG.clearSaved());
  await page.reload({ waitUntil: 'networkidle' });
  await boot(page);
  await page.locator('[data-target="tale-fairy"]').click();
  await page.reload({ waitUntil: 'networkidle' });
  await boot(page);
  check('selected tale persists across reload', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).selectedTale === 'fairy');
  await page.evaluate(() => window.QLOBE_DEBUG.clearSaved());
  await page.reload({ waitUntil: 'networkidle' });
  await boot(page);

  let current = await page.evaluate(() => ({
    state: window.QLOBE_DEBUG.getState(),
    modes: window.QLOBE_DEBUG.listModes(),
    title: document.querySelector('.title-art')?.alt,
    catalogLinks: [...document.querySelectorAll('a[href]')].map((node) => node.getAttribute('href')),
  }));
  check('splash boots with the authored title', current.state.screen === 'splash' && current.title === 'Tangram Tales');
  check('all sixteen reference tales plus free play are registered', current.modes.map(({ id }) => id).join(',') ===
    'boat,fairy,whale,rabbit,boy,girl,horse,candle,dog,camel,bear,face,house,cat,duck,lion,free');
  check('splash has the only catalog link', current.catalogLinks.join(',') === '../../');
  check('runtime makes no remote requests', landscape.remote.length === 0, landscape.remote.join(', '));
  await largeTargets(page, 'splash');
  const titleBox = await page.locator('.title-art').boundingBox();
  check('title is fully visible instead of cover-cropped', titleBox && titleBox.y >= 0 && titleBox.y + titleBox.height <= 820,
    titleBox ? `${Math.round(titleBox.y)}–${Math.round(titleBox.y + titleBox.height)}` : 'missing');
  check('shelf shows four large choices per page', await page.locator('.tale-card').count() === 4);
  const fairyCardFigure = await page.locator('[data-target="tale-fairy"] .card-figure').boundingBox();
  check('tale thumbnails use the same 4:3 figure frame as the reveal',
    fairyCardFigure && Math.abs(fairyCardFigure.width / fairyCardFigure.height - 4 / 3) < .04,
    fairyCardFigure ? `${Math.round(fairyCardFigure.width)}×${Math.round(fairyCardFigure.height)}` : 'missing thumbnail figure');
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  const seenTales = [];
  for (let shelfPage = 0; shelfPage < 4; shelfPage += 1) {
    seenTales.push(...await page.locator('.tale-card').evaluateAll((cards) => cards.map((card) => card.dataset.value)));
    await page.screenshot({ path: path.join(shots, `01${String.fromCharCode(97 + shelfPage)}-shelf-page-${shelfPage + 1}.png`) });
    if (shelfPage < 3) await page.locator('[data-target="shelf-next"]').click();
  }
  check('paged shelf exposes each reference figure exactly once', seenTales.join(',') ===
    'boat,fairy,whale,rabbit,boy,girl,horse,candle,dog,camel,bear,face,house,cat,duck,lion');

  await page.evaluate(() => { window.QLOBE_DEBUG.seed(42); return window.QLOBE_DEBUG.startMode('boat'); });
  await page.waitForSelector('#puzzle-field');
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('boat starts with exactly three modeled pieces', current.screen === 'guided' && current.placed === 3);
  const firstBoatOpen = await trayPieceIds(page);
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('boat'));
  await page.waitForSelector('#puzzle-field');
  const secondBoatOpen = await trayPieceIds(page);
  check('replaying a tale randomizes the four manual pieces', firstBoatOpen.length === 4 && secondBoatOpen.length === 4 &&
    firstBoatOpen.join(',') !== secondBoatOpen.join(',') &&
    firstBoatOpen.some((pieceId) => ['square', 'parallelogram'].includes(pieceId)) &&
    secondBoatOpen.some((pieceId) => ['square', 'parallelogram'].includes(pieceId)),
    `${firstBoatOpen.join(',')} → ${secondBoatOpen.join(',')}`);
  await page.evaluate(() => { window.QLOBE_DEBUG.seed(42); return window.QLOBE_DEBUG.startMode('boat'); });
  await page.waitForSelector('#puzzle-field');
  const boatOpen = await trayPieceIds(page);
  const largePiece = boatOpen.find((pieceId) => pieceId.startsWith('large-'));
  const smallPiece = boatOpen.find((pieceId) => pieceId.startsWith('small-'));
  const secondLargePiece = boatOpen.find((pieceId) => pieceId.startsWith('large-') && pieceId !== largePiece);
  const boatField = await page.locator('#puzzle-field').boundingBox();
  check('boat guided field preserves the 4:3 composition ratio', boatField && Math.abs(boatField.width / boatField.height - 4 / 3) < .04,
    boatField ? `${Math.round(boatField.width)}×${Math.round(boatField.height)}` : 'missing field');
  await largeTargets(page, 'boat guided');
  const triangleArtWidths = await page.locator(`[data-target="piece-${largePiece}"] img, [data-target="piece-${smallPiece}"] img`)
    .evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [node.closest('.tray-piece').dataset.piece,
      node.getBoundingClientRect().width])));
  check('boat large triangle tray art is materially wider than small triangle art',
    largePiece && smallPiece && triangleArtWidths[largePiece] > triangleArtWidths[smallPiece] * 1.4,
    largePiece && smallPiece ? `${Math.round(triangleArtWidths[largePiece])}px vs ${Math.round(triangleArtWidths[smallPiece])}px` : 'missing large/small tray pieces');
  const boatBeforeMeasurements = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  const largeDrag = await measureDragWidth(page, largePiece, largePiece);
  check('large triangle drag width matches its open slot target size',
    largeDrag && Math.abs(largeDrag.inlineWidth - largeDrag.expectedWidth) < 0.5,
    largeDrag ? `${largeDrag.inlineWidth}px vs ${largeDrag.expectedWidth}px` : 'missing drag measurement');
  const smallDrag = await measureDragWidth(page, smallPiece, smallPiece);
  check('small triangle drag width matches its open slot target size',
    smallDrag && Math.abs(smallDrag.inlineWidth - smallDrag.expectedWidth) < 0.5,
    smallDrag ? `${smallDrag.inlineWidth}px vs ${smallDrag.expectedWidth}px` : 'missing drag measurement');
  const boatAfterMeasurements = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('triangle drag previews preserve Boat state',
    boatAfterMeasurements.placed === boatBeforeMeasurements.placed &&
    boatAfterMeasurements.misses === boatBeforeMeasurements.misses &&
    boatAfterMeasurements.selectedPiece === boatBeforeMeasurements.selectedPiece);
  await realDragOutside(page, largePiece);
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('release outside the board returns the piece without a miss', current.placed === 3 && current.misses === 0 && await page.locator('.drag-piece').count() === 0);
  check('wrong-family direct placement is gently refused', await page.evaluate(([pieceId, slotId]) => window.QLOBE_DEBUG.dragPiece(pieceId, slotId), [largePiece, smallPiece]) === false);
  check('miss is recorded without losing progress', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).misses === 1);
  await realDragOffset(page, smallPiece, smallPiece, -.19);
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('first near miss returns home and widens assistance', current.placed === 3 && current.misses === 2);
  await realDragOffset(page, smallPiece, smallPiece, -.19);
  check('repeat-miss assist accepts the same real pointer drop', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).placed === 4);
  const tapPiece = secondLargePiece || boatOpen.find((pieceId) => ![largePiece, smallPiece].includes(pieceId));
  await page.locator(`[data-target="piece-${tapPiece}"]`).click();
  const tapSlot = await page.locator(`[data-target="slot-${tapPiece}"]`).boundingBox();
  await page.mouse.click(tapSlot.x + tapSlot.width / 2, tapSlot.y + tapSlot.height / 2);
  check('tap-piece then tap-slot fallback places a piece', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).placed === 5);
  await page.screenshot({ path: path.join(shots, '02-boat-five-of-seven.png') });
  const guidedHold = await holdRotateIntoSlot(page, largePiece, largePiece);
  check('small tolerated hold movement starts slow guided rotation', guidedHold.angle >= 4 && guidedHold.angle <= 25,
    `${guidedHold.angle.toFixed(1)} degrees`);
  check('right guided piece auto-rotates and pops into its target', guidedHold.settling &&
    (await page.evaluate(() => window.QLOBE_DEBUG.getState())).placed === 6);
  const finalBoatPiece = await page.locator('.tray-piece').getAttribute('data-piece');
  await page.evaluate((pieceId) => window.QLOBE_DEBUG.placePiece(pieceId, pieceId), finalBoatPiece);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('boat completes into the living-tale reveal', true);
  check('play/reveal Back is a button to splash, not a catalog anchor', await page.locator('[data-target="back"]').evaluate((node) => node.tagName === 'BUTTON'));
  await largeTargets(page, 'boat reveal');
  await page.screenshot({ path: path.join(shots, '03-boat-reveal.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('whale'));
  await page.evaluate(() => window.QLOBE_DEBUG.completeRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('whale tale completes', (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)).includes('whale'));
  await page.screenshot({ path: path.join(shots, '04-whale-reveal.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  await page.evaluate(() => { window.QLOBE_DEBUG.seed(42); return window.QLOBE_DEBUG.startMode('rabbit'); });
  const rabbitLargeOpen = await trayPieceIds(page);
  check('rabbit leaves both large triangles open for family-swap QA', (await page.evaluate(() => window.QLOBE_DEBUG.getState().placed)) === 3);
  check('large triangle A accepts large triangle B slot', await page.evaluate(() => window.QLOBE_DEBUG.placePiece('large-a', 'large-b')) === true);
  check('large triangle B accepts large triangle A slot', await page.evaluate(() => window.QLOBE_DEBUG.placePiece('large-b', 'large-a')) === true);
  check('rabbit random round exposes both large triangles', rabbitLargeOpen.includes('large-a') && rabbitLargeOpen.includes('large-b'));
  await page.evaluate(() => window.QLOBE_DEBUG.completeRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('three completed reference tales persist', (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)).length === 3);
  await page.screenshot({ path: path.join(shots, '05-rabbit-reveal.png') });

  await page.evaluate(() => { window.QLOBE_DEBUG.seed(2); return window.QLOBE_DEBUG.startMode('rabbit'); });
  const rabbitSmallOpen = await trayPieceIds(page);
  check('rabbit replay exposes both small triangles', rabbitSmallOpen.includes('small-a') && rabbitSmallOpen.includes('small-b'));
  check('randomized rounds never leave only triangles in the tray', rabbitSmallOpen.length === 4 &&
    rabbitSmallOpen.some((pieceId) => ['square', 'parallelogram'].includes(pieceId)));
  check('small triangle A accepts small triangle B slot', await page.evaluate(() => window.QLOBE_DEBUG.placePiece('small-a', 'small-b')) === true);
  check('small triangle B accepts small triangle A slot', await page.evaluate(() => window.QLOBE_DEBUG.placePiece('small-b', 'small-a')) === true);

  const remainingTales = ['fairy', 'boy', 'girl', 'horse', 'candle', 'dog', 'camel', 'bear', 'face', 'house', 'cat', 'duck', 'lion'];
  for (const taleId of remainingTales) {
    if (taleId === 'candle') {
      await page.evaluate(() => { window.QLOBE_DEBUG.seed(42); return window.QLOBE_DEBUG.startMode('candle'); });
      check('candle large triangle A accepts large triangle B slot',
        await page.evaluate(() => window.QLOBE_DEBUG.placePiece('large-a', 'large-b')) === true);
      const alternateLargeDrag = await measureDragWidth(page, 'large-b', 'large-a');
      check('candle alternate large triangle preview matches its open slot target size',
        alternateLargeDrag && Math.abs(alternateLargeDrag.inlineWidth - alternateLargeDrag.expectedWidth) < 0.5,
        alternateLargeDrag ? `${alternateLargeDrag.inlineWidth}px vs ${alternateLargeDrag.expectedWidth}px` : 'missing drag measurement');
      check('candle large triangle B accepts large triangle A slot',
        await page.evaluate(() => window.QLOBE_DEBUG.placePiece('large-b', 'large-a')) === true);
    } else {
      await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), taleId);
    }
    await page.evaluate(() => window.QLOBE_DEBUG.completeRound());
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  }
  check('all sixteen reference tales complete and persist',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)).length === 16);
  await page.screenshot({ path: path.join(shots, '05-lion-reveal-all-done.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  check('visible completed tales use authored raster completion markers',
    await page.locator('.paper-star[src$="completion-star.webp"]').count() === 4);
  await page.screenshot({ path: path.join(shots, '05b-completed-shelf.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('free'));
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('free stage starts with the canonical seven pieces', current.screen === 'free' && current.freeItems.length === 7);
  const heldFreeId = current.freeItems[0].id;
  const heldFreeBefore = current.freeItems[0].rotation;
  const heldFreeBox = await page.locator(`[data-freeform-id="${heldFreeId}"]`).boundingBox();
  await page.mouse.move(heldFreeBox.x + heldFreeBox.width / 2, heldFreeBox.y + heldFreeBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.move(heldFreeBox.x + heldFreeBox.width / 2 + 9, heldFreeBox.y + heldFreeBox.height / 2 + 8, { steps: 3 });
  await page.waitForTimeout(620);
  const heldFreeDuring = (await page.evaluate(() => window.QLOBE_DEBUG.getState())).freeItems.find((item) => item.id === heldFreeId).rotation;
  await page.mouse.up();
  check('small tolerated hold movement starts slow free-play rotation',
    Math.abs(heldFreeDuring - heldFreeBefore) >= 4 && Math.abs(heldFreeDuring - heldFreeBefore) <= 25,
    `${heldFreeBefore} → ${heldFreeDuring}`);
  check('turn control uses an authored raster icon',
    await page.locator('[data-target="rotate-piece"] .button-icon[src$="turn-clockwise.webp"]').count() === 1);
  const before = await page.evaluate(() => window.QLOBE_DEBUG.snapshot());
  const edited = structuredClone(before);
  edited.items[0].x = .38;
  edited.items[0].y = .35;
  await page.evaluate((snapshot) => window.QLOBE_DEBUG.loadSnapshot(snapshot), edited);
  const oldRotation = edited.items[0].rotation;
  await page.evaluate((pieceId) => window.QLOBE_DEBUG.rotatePiece(pieceId, 45), edited.items[0].id);
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('shared freeform rotation changes semantic state by 45 degrees', current.freeItems.find((item) => item.id === edited.items[0].id).rotation === oldRotation + 45);
  await page.evaluate(() => window.QLOBE_DEBUG.tap('undo'));
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('freeform undo restores the prior semantic rotation', current.freeItems.find((item) => item.id === edited.items[0].id).rotation === oldRotation);
  await page.evaluate((pieceId) => window.QLOBE_DEBUG.rotatePiece(pieceId, 45), edited.items[0].id);
  await largeTargets(page, 'free stage');
  await page.screenshot({ path: path.join(shots, '06-free-stage.png') });
  check('free composition finishes after a real semantic edit', await page.evaluate(() => window.QLOBE_DEBUG.finish()) === true);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'free-reveal');
  await page.screenshot({ path: path.join(shots, '07-free-reveal.png') });

  await page.reload({ waitUntil: 'networkidle' });
  await boot(page);
  check('all guided completion survives reload', (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)).length === 16);
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('free'));
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('free composition survives reload as seven semantic items', current.freeMoved && current.freeItems.length === 7);

  const portrait = await session(browser, { width: 820, height: 1180 });
  await boot(portrait.page);
  await largeTargets(portrait.page, 'portrait splash');
  const portraitFairyCardFigure = await portrait.page.locator('[data-target="tale-fairy"] .card-figure').boundingBox();
  check('portrait tale thumbnails keep the 4:3 figure frame',
    portraitFairyCardFigure && Math.abs(portraitFairyCardFigure.width / portraitFairyCardFigure.height - 4 / 3) < .04,
    portraitFairyCardFigure ? `${Math.round(portraitFairyCardFigure.width)}×${Math.round(portraitFairyCardFigure.height)}` : 'missing portrait thumbnail figure');
  await portrait.page.screenshot({ path: path.join(shots, '08-splash-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('whale'));
  await largeTargets(portrait.page, 'portrait guided');
  const portraitField = await portrait.page.locator('#puzzle-field').boundingBox();
  check('portrait puzzle field stays large and 4:3', portraitField.width >= 690 && Math.abs(portraitField.width / portraitField.height - 4 / 3) < .04,
    `${Math.round(portraitField.width)}×${Math.round(portraitField.height)}`);
  await portrait.page.screenshot({ path: path.join(shots, '09-whale-portrait.png') });

  const short = await session(browser, { width: 1180, height: 520 });
  await boot(short.page);
  await short.page.evaluate(() => window.QLOBE_DEBUG.startMode('lion'));
  const shortField = await short.page.locator('#puzzle-field').boundingBox();
  check('short-landscape puzzle remains on screen', shortField.y >= 70 && shortField.y + shortField.height <= 520,
    `${Math.round(shortField.x)},${Math.round(shortField.y)} ${Math.round(shortField.width)}×${Math.round(shortField.height)}`);
  check('short-landscape puzzle preserves the 4:3 composition ratio', Math.abs(shortField.width / shortField.height - 4 / 3) < .04,
    `${Math.round(shortField.width)}×${Math.round(shortField.height)}`);
  await short.page.screenshot({ path: path.join(shots, '10-lion-short-landscape.png') });

  const reduced = await session(browser, { width: 1180, height: 820 }, 'reduce');
  await boot(reduced.page);
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.startMode('boat'));
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.completeRound());
  await reduced.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('reduced-motion guided tale completes', true);

  const storageFail = await openSession(browser, {
    url,
    base,
    viewport: { width: 1180, height: 820 },
    initScript: () => {
      for (const method of ['getItem', 'setItem', 'removeItem']) {
        Storage.prototype[method] = () => { throw new DOMException('Storage blocked for QA', 'SecurityError'); };
      }
    },
  });
  await boot(storageFail.page);
  await storageFail.page.evaluate(() => window.QLOBE_DEBUG.startMode('boat'));
  await storageFail.page.evaluate(() => window.QLOBE_DEBUG.completeRound());
  await storageFail.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('blocked localStorage degrades to complete session-only play',
    (await storageFail.page.evaluate(() => window.QLOBE_DEBUG.getState())).completed.includes('boat'));

  let recordedAudio = null;
  if (Object.keys(audioManifest).length) {
    check('recorded-voice manifest covers every exact script line',
      Object.keys(audioLines).every((key) => audioManifest[key]?.file));
    recordedAudio = await openSession(browser, {
      url,
      base,
      viewport: { width: 1180, height: 820 },
      ready: false,
    });
    await recordedAudio.page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
    await recordedAudio.page.evaluate(() => window.QLOBE_DEBUG.ready);
    await recordedAudio.page.locator('[data-target="tale-boat"]').click();
    await recordedAudio.page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'welcome'));
    const audioLog = await recordedAudio.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    check('a real first gesture selects the recorded welcome clip',
      audioLog.some((entry) => entry.key === 'welcome' && entry.kind === 'clip'));
  } else {
    note('recorded-voice playback checks are pending explicit Qwen upload approval');
  }

  const allErrors = [...landscape.errors, ...portrait.errors, ...short.errors, ...reduced.errors, ...storageFail.errors, ...(recordedAudio?.errors || [])];
  const allFailed = [...landscape.failed, ...portrait.failed, ...short.failed, ...reduced.failed, ...storageFail.failed, ...(recordedAudio?.failed || [])];
  const allRemote = [...landscape.remote, ...portrait.remote, ...short.remote, ...reduced.remote, ...storageFail.remote, ...(recordedAudio?.remote || [])];
  check('zero unexpected page errors', allErrors.length === 0, allErrors.join(' | '));
  check('zero failed requests or 404s', allFailed.length === 0, allFailed.join(' | '));
  check('zero remote runtime requests in every viewport', allRemote.length === 0, allRemote.join(' | '));

  await landscape.context.close();
  await portrait.context.close();
  await short.context.close();
  await reduced.context.close();
  await storageFail.context.close();
  await recordedAudio?.context.close();

  const title = await stat(new URL('../assets/title.webp', import.meta.url));
  check('title art stays below 150 KB', title.size <= 150_000, `${title.size} bytes`);
  const configText = await readFile(new URL('../config.json', import.meta.url), 'utf8');
  const cssText = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
  const jsText = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
  check('runtime config contains no emoji placeholder refs', !configText.includes('emoji:'));
  check('visible game skin contains no CSS gradients', !/gradient\(/.test(cssText));
  check('reveal animation moves the whole figure without an independent tail wave', cssText.includes('figure-wake') && !cssText.includes('tail-wave'));
  check('child-facing game UI contains no star or rotation font glyphs', !/[★↻]/.test(jsText));
}

const browser = await launchChrome();
try {
  await drive(browser);
} finally {
  await browser.close();
}
finish();
