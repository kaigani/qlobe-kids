#!/usr/bin/env node
// Real-Chrome interaction, layout, audio, and visual acceptance for Kindness Delivery.
// Run from the repo root:
//   node games/kindness-delivery/tools/qa.mjs --base http://127.0.0.1:8000 \
//     --shots /private/tmp/qlobe-kindness-delivery-shots

import path from 'node:path';
import {
  baseUrl,
  checkSessionClean,
  createReporter,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
  targetSizes,
  undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl('http://127.0.0.1:8000');
const url = `${base}/games/kindness-delivery/`;
const shots = resolveShots('/private/tmp/qlobe-kindness-delivery-shots');
const reporter = createReporter();
const { check, finish } = reporter;
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

function checkRuntimeClean(session, label) {
  const failed = session.failed.filter((entry) => (
    !PLATFORM_ANALYTICS.some((prefix) => entry.startsWith(prefix))
  ));
  checkSessionClean(reporter, { ...session, failed }, label);
}

function layout(page) {
  return page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight },
    document: {
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
    },
  }));
}

function noOverflow(value) {
  return value.document.width <= value.viewport.width && value.document.height <= value.viewport.height;
}

async function openGame(browser, viewport, options = {}) {
  const suppliedAfter = options.after;
  return openSession(browser, {
    url,
    base,
    viewport,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
    ...options,
    after: async (page) => {
      await page.evaluate(() => {
        window.QLOBE_DEBUG.mute(true);
        window.QLOBE_DEBUG.fastTimers(true);
        window.QLOBE_DEBUG.seed(42);
      });
      if (suppliedAfter) await suppliedAfter(page);
    },
  });
}

async function actualDraw(page) {
  const box = await page.locator('#note-canvas').boundingBox();
  if (!box) throw new Error('note canvas is not visible');
  await page.mouse.move(box.x + box.width * .18, box.y + box.height * .58);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .38, box.y + box.height * .28, { steps: 7 });
  await page.mouse.move(box.x + box.width * .58, box.y + box.height * .62, { steps: 7 });
  await page.mouse.move(box.x + box.width * .82, box.y + box.height * .34, { steps: 7 });
  await page.mouse.up();
}

async function actualSwipe(page, dx, dy) {
  const box = await page.locator('#plane-actor').boundingBox();
  if (!box) throw new Error('plane is not visible');
  const x = box.x + Math.min(38, box.width * .3);
  const y = box.y + box.height * .55;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 10 });
  await page.mouse.up();
}

async function auditTargets(page, label) {
  const sizes = await targetSizes(page);
  const small = undersized(sizes);
  check(`${label} targets meet 96px minimum`, small.length === 0,
    small.map(({ id, w, h }) => `${id}:${Math.round(w)}×${Math.round(h)}`).join(', '));
  return sizes;
}

async function waitForVisibleImages(page) {
  await page.waitForFunction(() => [...document.images].filter((image) => {
    const rect = image.getBoundingClientRect();
    return image.getAttribute('src') && rect.width > 0 && rect.height > 0
      && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
  }).every((image) => image.complete && image.naturalWidth > 0));
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  const sessions = [];
  try {
    const hub = await openSession(browser, {
      url: `${base}/#social-emotional`,
      base,
      viewport: { width: 1180, height: 820 },
      ready: false,
      allowRemote: PLATFORM_ANALYTICS,
    });
    sessions.push(hub);
    const hubTile = hub.page.locator('a.tile[aria-label^="Kindness Delivery"]');
    await hubTile.waitFor();
    check('hub lists a playable Kindness Delivery tile', await hubTile.count() === 1);
    check('hub tile uses the curated raster art',
      (await hubTile.locator('img').getAttribute('src')) === 'assets/hub/tiles/kindness-delivery.jpg');
    await hubTile.scrollIntoViewIfNeeded();
    await waitForVisibleImages(hub.page);
    await hub.page.screenshot({ path: path.join(shots, '00-hub-tile.png') });
    await Promise.all([hub.page.waitForURL('**/games/kindness-delivery/'), hubTile.click()]);
    await hub.page.evaluate(() => window.QLOBE_DEBUG.ready);
    check('hub launches the game route', hub.page.url().endsWith('/games/kindness-delivery/'));
    checkRuntimeClean(hub, 'hub route');
    await hub.close();

    const core = await openGame(browser, { width: 1180, height: 820 });
    sessions.push(core);
    const page = core.page;
    check('friend-select screen boots', (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'select');
    check('three friend modes are registered',
      (await page.evaluate(() => QLOBE_DEBUG.listModes().map((mode) => mode.id).join(','))) === 'fox,bunny,bear');
    check('landscape has no document overflow', noOverflow(await layout(page)));
    await auditTargets(page, 'friend-select');
    await page.screenshot({ path: path.join(shots, '01-friend-select-landscape.png') });

    await page.evaluate(() => QLOBE_DEBUG.mute(false));
    await page.locator('[data-target="friend-fox"]').click();
    await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'studio');
    await page.waitForFunction(() => QLOBE_DEBUG.getAudioLog().some((entry) => entry.kind === 'clip'), null, { timeout: 8000 }).catch(() => {});
    const firstAudio = await page.evaluate(() => QLOBE_DEBUG.getAudioLog());
    check('first real gesture starts recorded teacher narration',
      firstAudio.some((entry) => entry.kind === 'clip'), JSON.stringify(firstAudio));
    await page.evaluate(() => QLOBE_DEBUG.mute(true));
    await auditTargets(page, 'studio');

    await page.locator('[data-target="ready-note"]').click();
    check('blank note cannot skip the creation step',
      (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'studio'
      && !(await page.evaluate(() => QLOBE_DEBUG.getState().hasContent)));

    await actualDraw(page);
    check('real pointer drawing records a stroke',
      (await page.evaluate(() => QLOBE_DEBUG.getState().strokeCount)) === 1);

    await page.locator('[data-target="tool-stamp"]').click();
    await actualDraw(page);
    check('stamp mode does not add accidental crayon strokes',
      (await page.evaluate(() => QLOBE_DEBUG.getState().strokeCount)) === 1);
    await page.locator('[data-target="stamp-sun"]').click();
    check('real stamp button adds one decoration',
      (await page.evaluate(() => QLOBE_DEBUG.getState().stickerCount)) === 1);

    await page.locator('[data-target="tool-sticker"]').click();
    await page.locator('[data-target="sticker-rainbow"]').click();
    check('real sticker button adds a second decoration',
      (await page.evaluate(() => QLOBE_DEBUG.getState().stickerCount)) === 2);
    const pieceSize = await page.locator('.qlobe-freeform-piece').last().evaluate((node) => {
      const rect = node.getBoundingClientRect();
      return { w: rect.width, h: rect.height };
    });
    check('movable note pieces have a 96px real button box', pieceSize.w >= 96 && pieceSize.h >= 96,
      `${Math.round(pieceSize.w)}×${Math.round(pieceSize.h)}`);

    const moving = page.locator('.qlobe-freeform-piece').last();
    const beforeMove = await page.evaluate(() => QLOBE_DEBUG.getNote().stickers.items.at(-1));
    const moveBox = await moving.boundingBox();
    await page.mouse.move(moveBox.x + moveBox.width / 2, moveBox.y + moveBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(moveBox.x + moveBox.width * .8, moveBox.y - moveBox.height * .2, { steps: 8 });
    await page.mouse.up();
    const afterMove = await page.evaluate(() => QLOBE_DEBUG.getNote().stickers.items.at(-1));
    check('sticker drag updates normalized note data', beforeMove.x !== afterMove.x || beforeMove.y !== afterMove.y);
    const cancelBox = await moving.boundingBox();
    await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(cancelBox.x - cancelBox.width * .35, cancelBox.y + cancelBox.height * .8, { steps: 6 });
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true,
      cancelable: true,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    })));
    await page.mouse.up();
    const afterCancel = await page.evaluate(() => QLOBE_DEBUG.getNote().stickers.items.at(-1));
    check('pointer cancellation rolls sticker movement back',
      afterCancel.x === afterMove.x && afterCancel.y === afterMove.y);
    await page.screenshot({ path: path.join(shots, '02-created-note.png') });

    await page.locator('[data-target="undo"]').click();
    check('undo restores the sticker position',
      (await page.evaluate(() => QLOBE_DEBUG.getNote().stickers.items.at(-1).x)) === beforeMove.x);
    await page.locator('[data-target="undo"]').click();
    check('undo removes the last sticker',
      (await page.evaluate(() => QLOBE_DEBUG.getState().stickerCount)) === 1);
    await page.locator('[data-target="undo"]').click();
    check('undo crosses media and removes the stamp',
      (await page.evaluate(() => QLOBE_DEBUG.getState().stickerCount)) === 0);
    await page.locator('[data-target="undo"]').click();
    check('undo reaches the original drawing action',
      (await page.evaluate(() => QLOBE_DEBUG.getState().strokeCount)) === 0);

    await page.locator('[data-target="tool-stamp"]').click();
    await page.locator('[data-target="stamp-heart"]').click();
    await page.locator('[data-target="tool-crayon"]').click();
    await actualDraw(page);
    await page.locator('[data-target="clear"]').click();
    check('clear removes the whole note', !(await page.evaluate(() => QLOBE_DEBUG.getState().hasContent)));
    await page.locator('[data-target="restore"]').click();
    check('restore returns both drawing and decoration', await page.evaluate(() => {
      const state = QLOBE_DEBUG.getState();
      return state.strokeCount === 1 && state.stickerCount === 1;
    }));
    await page.locator('[data-target="undo"]').click();
    check('restore preserves interleaved undo chronology', await page.evaluate(() => {
      const state = QLOBE_DEBUG.getState();
      return state.strokeCount === 0 && state.stickerCount === 1;
    }));
    await actualDraw(page);

    await page.locator('[data-target="ready-note"]').click();
    await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'flight');
    check('fold preserves the authored note in the plane',
      (await page.locator('#plane-note-preview').getAttribute('src')).startsWith('data:image/jpeg'));
    await auditTargets(page, 'flight');
    await page.screenshot({ path: path.join(shots, '03-flight-ready.png') });

    await actualSwipe(page, 18, 6);
    check('short off-target swipe stays in the forgiving flight screen',
      (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'flight');
    await page.waitForTimeout(560);
    await actualSwipe(page, 230, -28);
    await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'delivery');
    check('real swipe delivers the note',
      (await page.evaluate(() => QLOBE_DEBUG.getState().launchSource)) === 'swipe');
    check('delivery shows the child-created note',
      (await page.locator('#reaction-note-preview').getAttribute('src')).startsWith('data:image/jpeg'));
    await auditTargets(page, 'delivery');
    await page.screenshot({ path: path.join(shots, '04-kindness-delivered.png') });
    await page.locator('[data-target="send-another"]').click();
    check('Send another returns in-page to friend select',
      (await page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'select');
    checkRuntimeClean(core, 'core interaction');
    await core.close();

    const portrait = await openGame(browser, { width: 820, height: 1180 }, { reducedMotion: 'reduce' });
    sessions.push(portrait);
    check('reduced-motion preference reaches game state',
      (await portrait.page.evaluate(() => QLOBE_DEBUG.getState().reducedMotion)) === true);
    for (const friend of ['fox', 'bunny', 'bear']) {
      await portrait.page.evaluate((id) => QLOBE_DEBUG.startMode(id), friend);
      const friendId = await portrait.page.evaluate(() => QLOBE_DEBUG.getState().friendId);
      check(`debug mode starts ${friend}`, friendId === friend);
      await portrait.page.evaluate(() => QLOBE_DEBUG.drawStroke());
      if (friend === 'bear') {
        await portrait.page.screenshot({ path: path.join(shots, '05-bear-studio-portrait-reduced.png') });
      }
      await portrait.page.evaluate(() => QLOBE_DEBUG.fold());
      await portrait.page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'flight');
      if (friend === 'bunny') {
        await portrait.page.locator('#plane-actor').focus();
        await portrait.page.keyboard.press('Enter');
      } else {
        await portrait.page.evaluate(() => QLOBE_DEBUG.completeFlight());
      }
      await portrait.page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'delivery');
      const reaction = await portrait.page.locator('#reaction-friend').getAttribute('src');
      check(`${friend} reaches its own delivery reaction`, reaction.endsWith(`${friend}-reaction.webp`));
      if (friend === 'bunny') {
        check('keyboard plane activation reaches the equal launch path',
          (await portrait.page.evaluate(() => QLOBE_DEBUG.getState().launchSource)) === 'button');
      }
    }
    check('portrait has no document overflow', noOverflow(await layout(portrait.page)));
    await auditTargets(portrait.page, 'portrait delivery');
    await portrait.page.screenshot({ path: path.join(shots, '06-bear-delivery-portrait-reduced.png') });
    await portrait.page.evaluate(() => QLOBE_DEBUG.startMode('fox'));
    await portrait.page.evaluate(() => QLOBE_DEBUG.drawStroke());
    await portrait.page.evaluate(() => {
      QLOBE_DEBUG.fold();
      QLOBE_DEBUG.home();
    });
    await portrait.page.waitForTimeout(300);
    check('back navigation cancels an in-flight fold route',
      (await portrait.page.evaluate(() => QLOBE_DEBUG.getState().screen)) === 'select');
    checkRuntimeClean(portrait, 'portrait reduced-motion');
    await portrait.close();

    const touch = await openGame(browser, { width: 1024, height: 768 }, {
      deviceScaleFactor: 2,
      context: { hasTouch: true, isMobile: true },
    });
    sessions.push(touch);
    const foxBox = await touch.page.locator('[data-target="friend-fox"]').boundingBox();
    await touch.page.touchscreen.tap(foxBox.x + foxBox.width / 2, foxBox.y + foxBox.height / 2);
    await touch.page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'studio');
    check('touch-first iPad-like tap starts a mode',
      (await touch.page.evaluate(() => QLOBE_DEBUG.getState().friendId)) === 'fox');
    check('touch viewport has no document overflow', noOverflow(await layout(touch.page)));
    await auditTargets(touch.page, 'touch studio');
    await touch.page.screenshot({ path: path.join(shots, '07-touch-tablet.png') });
    checkRuntimeClean(touch, 'touch tablet');
    await touch.close();

    const short = await openGame(browser, { width: 1180, height: 520 });
    sessions.push(short);
    await short.page.evaluate(() => QLOBE_DEBUG.startMode('bunny'));
    check('short landscape has no document overflow', noOverflow(await layout(short.page)));
    await auditTargets(short.page, 'short landscape studio');
    await short.page.screenshot({ path: path.join(shots, '08-studio-short-landscape.png') });
    checkRuntimeClean(short, 'short landscape');
    await short.close();
  } finally {
    for (const session of sessions) {
      try { await session.close(); } catch { /* already closed */ }
    }
    await browser.close();
  }
  finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
