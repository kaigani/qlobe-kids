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
  await page.locator('[data-target="tale-bird"]').click();
  await page.reload({ waitUntil: 'networkidle' });
  await boot(page);
  check('selected tale persists across reload', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).selectedTale === 'bird');
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
  check('three guided tales plus free play are registered', current.modes.map(({ id }) => id).join(',') === 'fox,fish,bird,free');
  check('splash has the only catalog link', current.catalogLinks.join(',') === '../../');
  check('runtime makes no remote requests', landscape.remote.length === 0, landscape.remote.join(', '));
  await largeTargets(page, 'splash');
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('fox'));
  await page.waitForSelector('#puzzle-field');
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('fox starts with exactly three modeled pieces', current.screen === 'guided' && current.placed === 3);
  await realDragOutside(page, 'medium');
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('release outside the board returns the piece without a miss', current.placed === 3 && current.misses === 0 && await page.locator('.drag-piece').count() === 0);
  check('wrong-family direct placement is gently refused', await page.evaluate(() => window.QLOBE_DEBUG.dragPiece('medium', 'large-b')) === false);
  check('miss is recorded without losing progress', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).misses === 1);
  await realDragOffset(page, 'medium', 'medium', .17);
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('first near miss returns home and widens assistance', current.placed === 3 && current.misses === 2);
  await realDragOffset(page, 'medium', 'medium', .17);
  check('repeat-miss assist accepts the same real pointer drop', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).placed === 4);
  await page.locator('[data-target="piece-large-b"]').click();
  const tapSlot = await page.locator('[data-target="slot-large-b"]').boundingBox();
  await page.mouse.click(tapSlot.x + tapSlot.width / 2, tapSlot.y + tapSlot.height / 2);
  check('tap-piece then tap-slot fallback places a piece', (await page.evaluate(() => window.QLOBE_DEBUG.getState())).placed === 5);
  await page.screenshot({ path: path.join(shots, '02-fox-five-of-seven.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.placePiece('small-a', 'small-a'));
  await page.evaluate(() => window.QLOBE_DEBUG.placePiece('small-b', 'small-b'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('fox completes into the living-tale reveal', true);
  check('play/reveal Back is a button to splash, not a catalog anchor', await page.locator('[data-target="back"]').evaluate((node) => node.tagName === 'BUTTON'));
  await largeTargets(page, 'fox reveal');
  await page.screenshot({ path: path.join(shots, '03-fox-reveal.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('fish'));
  await page.evaluate(() => window.QLOBE_DEBUG.completeRound());
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('fish tale completes', (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)).includes('fish'));
  await page.screenshot({ path: path.join(shots, '04-fish-reveal.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('bird'));
  check('bird leaves both large triangles open for family-swap QA', (await page.evaluate(() => window.QLOBE_DEBUG.getState().placed)) === 3);
  check('large triangle A accepts large triangle B slot', await page.evaluate(() => window.QLOBE_DEBUG.placePiece('large-a', 'large-b')) === true);
  check('large triangle B accepts large triangle A slot', await page.evaluate(() => window.QLOBE_DEBUG.placePiece('large-b', 'large-a')) === true);
  check('small triangle A accepts small triangle B slot', await page.evaluate(() => window.QLOBE_DEBUG.placePiece('small-a', 'small-b')) === true);
  check('small triangle B accepts small triangle A slot', await page.evaluate(() => window.QLOBE_DEBUG.placePiece('small-b', 'small-a')) === true);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('all three guided tales persist complete', (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)).length === 3);
  await page.screenshot({ path: path.join(shots, '05-bird-reveal-all-done.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  check('three completed tales use authored raster completion markers',
    await page.locator('.paper-star[src$="completion-star.webp"]').count() === 3);
  await page.screenshot({ path: path.join(shots, '05b-completed-shelf.png') });
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('free'));
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('free stage starts with the canonical seven pieces', current.screen === 'free' && current.freeItems.length === 7);
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
  check('guided completion survives reload', (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed)).length === 3);
  await page.evaluate(() => window.QLOBE_DEBUG.startMode('free'));
  current = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('free composition survives reload as seven semantic items', current.freeMoved && current.freeItems.length === 7);

  const portrait = await session(browser, { width: 820, height: 1180 });
  await boot(portrait.page);
  await largeTargets(portrait.page, 'portrait splash');
  await portrait.page.screenshot({ path: path.join(shots, '08-splash-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('fish'));
  await largeTargets(portrait.page, 'portrait guided');
  const portraitField = await portrait.page.locator('#puzzle-field').boundingBox();
  check('portrait puzzle field stays large and 4:3', portraitField.width >= 690 && Math.abs(portraitField.width / portraitField.height - 4 / 3) < .04,
    `${Math.round(portraitField.width)}×${Math.round(portraitField.height)}`);
  await portrait.page.screenshot({ path: path.join(shots, '09-fish-portrait.png') });

  const short = await session(browser, { width: 1180, height: 520 });
  await boot(short.page);
  await short.page.evaluate(() => window.QLOBE_DEBUG.startMode('bird'));
  const shortField = await short.page.locator('#puzzle-field').boundingBox();
  check('short-landscape puzzle remains on screen', shortField.y >= 70 && shortField.y + shortField.height <= 520,
    `${Math.round(shortField.x)},${Math.round(shortField.y)} ${Math.round(shortField.width)}×${Math.round(shortField.height)}`);
  await short.page.screenshot({ path: path.join(shots, '10-bird-short-landscape.png') });

  const reduced = await session(browser, { width: 1180, height: 820 }, 'reduce');
  await boot(reduced.page);
  await reduced.page.evaluate(() => window.QLOBE_DEBUG.startMode('fox'));
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
  await storageFail.page.evaluate(() => window.QLOBE_DEBUG.startMode('fox'));
  await storageFail.page.evaluate(() => window.QLOBE_DEBUG.completeRound());
  await storageFail.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('blocked localStorage degrades to complete session-only play',
    (await storageFail.page.evaluate(() => window.QLOBE_DEBUG.getState())).completed.includes('fox'));

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
    await recordedAudio.page.locator('[data-target="tale-fox"]').click();
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
  check('child-facing game UI contains no star or rotation font glyphs', !/[★↻]/.test(jsText));
}

const browser = await launchChrome();
try {
  await drive(browser);
} finally {
  await browser.close();
}
finish();
