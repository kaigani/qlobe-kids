#!/usr/bin/env node
// Real-Chrome smoke, interaction, persistence, audio, and visual-QC driver.
//
//   python3 -m http.server 8000
//   node games/loose-parts-collage/tools/qa.mjs \
//     --base http://127.0.0.1:8000 --shots /private/tmp/little-artist-qa

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  audio,
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

const base = baseUrl();
const url = `${base}/games/loose-parts-collage/`;
const shots = resolveShots('/private/tmp/little-artist-qa');
const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(gameRoot, '../..');
const reporter = createReporter();
const { check, note, finish } = reporter;

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const existing = async (file) => {
  try { return await stat(file); } catch { return null; }
};

function configAssetRefs(config) {
  return [
    config.theme.background,
    config.theme.title,
    ...Object.values(config.art),
    ...config.papers.map(({ art }) => art),
    ...config.materials.map(({ art }) => art),
    ...config.yarns.map(({ art }) => art),
    ...config.modes.map(({ art }) => art),
  ];
}

async function staticChecks() {
  const config = await readJson(path.join(gameRoot, 'config.json'));
  const refs = [...new Set(configAssetRefs(config))];
  const assetStats = await Promise.all(refs.map(async (ref) => ({
    ref,
    info: await existing(path.resolve(gameRoot, ref.replace(/^\.\//, ''))),
  })));
  const missing = assetStats.filter(({ info }) => !info).map(({ ref }) => ref);
  const oversized = assetStats
    .filter(({ info }) => info?.size > 300 * 1024)
    .map(({ ref, info }) => `${ref}:${Math.round(info.size / 1024)}KB`);
  check('every configured runtime artwork exists', missing.length === 0, missing.join(', '));
  check('every configured runtime artwork stays within 300KB', oversized.length === 0, oversized.join(', '));

  const lines = await readJson(path.join(gameRoot, 'assets/audio/lines.json'));
  const manifest = await readJson(path.join(gameRoot, 'assets/audio/manifest.json'));
  const voiceQa = await readJson(path.join(gameRoot, 'assets/audio/qa.json'));
  const voiceKeys = Object.keys(config.voice).sort();
  check('voice text and config have the same 20 keys',
    voiceKeys.length === 20 && JSON.stringify(Object.keys(lines).sort()) === JSON.stringify(voiceKeys),
    `config=${voiceKeys.length}, lines=${Object.keys(lines).length}`);
  const missingVoice = [];
  for (const key of voiceKeys) {
    const entry = manifest[key];
    const file = entry?.file && await existing(path.join(gameRoot, 'assets/audio', entry.file));
    if (!entry || !file || file.size < 1_000 || file.size > 300 * 1024) missingVoice.push(key);
  }
  check('all 20 recorded teacher clips exist within budget', missingVoice.length === 0, missingVoice.join(', '));
  const rejectedVoice = voiceKeys.filter((key) => voiceQa[key]?.accepted !== true);
  check('Whisper QA accepted every recorded line', rejectedVoice.length === 0, rejectedVoice.join(', '));
  const weakVoiceQa = voiceKeys.filter((key) => voiceQa[key]?.verifierVersion !== 2
    || voiceQa[key]?.whisperConditioning !== 'none'
    || voiceQa[key]?.score !== 1);
  check('every voice passed exact unconditioned Whisper verification',
    weakVoiceQa.length === 0, weakVoiceQa.join(', '));

  const plan = await readJson(path.join(gameRoot, 'assets/source/local-api/plan.json'));
  const unapproved = [];
  for (const job of plan.jobs.filter(({ extract }) => extract)) {
    const metricsFile = path.join(gameRoot, `assets/source/local-api/qa/${job.id}-metrics.json`);
    const metrics = await existing(metricsFile) && await readJson(metricsFile);
    if (metrics?.visualQa?.status !== 'human-approved') unapproved.push(job.id);
  }
  check('every Layered extraction has explicit human visual approval', unapproved.length === 0, unapproved.join(', '));

  const registry = await readJson(path.join(repoRoot, 'games.json'));
  const entry = registry.games.find(({ id }) => id === config.id);
  check('hub registry names and routes Little Artist',
    entry?.title === 'Little Artist' && entry?.path === 'games/loose-parts-collage/',
    entry ? `${entry.title} ${entry.path}` : 'missing');
  const hub = await existing(path.join(repoRoot, 'assets/hub/tiles/loose-parts-collage.jpg'));
  check('curated Little Artist hub tile exists within budget',
    Boolean(hub && hub.size > 10_000 && hub.size <= 300 * 1024),
    hub ? `${Math.round(hub.size / 1024)}KB` : 'missing');
}

async function session(browser, viewport, reducedMotion = 'no-preference', context = {}) {
  return openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    context,
    allowAbortedMedia: true,
    readyWhen: () => window.QLOBE_DEBUG?.getState().screen === 'splash',
    after: (page) => page.evaluate(() => {
      window.QLOBE_DEBUG.clearSaved();
      window.QLOBE_DEBUG.fastTimers(.02);
    }),
  });
}

async function assertTargets(page, label) {
  const small = undersized(await targetSizes(page), 95.5);
  check(`${label} child controls meet the 96px touch minimum`, small.length === 0,
    small.map(({ id, w, h }) => `${id}:${Math.round(w)}×${Math.round(h)}`).join(', '));
}

async function assertImagesLoaded(page, label) {
  const failed = await page.locator('img').evaluateAll((images) => images
    .filter((image) => image.getClientRects().length && (!image.complete || image.naturalWidth === 0))
    .map((image) => image.getAttribute('src')));
  check(`${label} visible authored images decode`, failed.length === 0, failed.join(', '));
}

async function dragTrayPiece(page, target, x = .66, y = .34) {
  const choice = page.locator(`[data-target="${target}"]`);
  await choice.scrollIntoViewIfNeeded();
  const from = await choice.boundingBox();
  const sheet = await page.locator('#art-sheet').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(sheet.x + sheet.width * x, sheet.y + sheet.height * y, { steps: 14 });
  await page.mouse.up();
}

async function drawRealYarn(page) {
  const box = await page.locator('#yarn-canvas').boundingBox();
  const points = [
    [.18, .68], [.29, .37], [.43, .58], [.56, .29], [.7, .56], [.83, .35],
  ];
  await page.mouse.move(box.x + box.width * points[0][0], box.y + box.height * points[0][1]);
  await page.mouse.down();
  for (const [x, y] of points.slice(1)) {
    await page.mouse.move(box.x + box.width * x, box.y + box.height * y, { steps: 5 });
  }
  await page.mouse.up();
}

async function driveLandscape(browser) {
  const current = await session(browser, { width: 1180, height: 820 });
  const { page } = current;
  check('Little Artist boots to its splash',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('three production modes are registered',
    (await page.evaluate(() => window.QLOBE_DEBUG.listModes().map(({ id }) => id).join(','))) === 'collage,yarn,teddy');
  check('no narration starts before a child gesture',
    (await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog())).length === 0);
  await assertTargets(page, 'splash');
  await assertImagesLoaded(page, 'splash');
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.locator('[data-target="mode-collage"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'workbench');
  await page.waitForTimeout(650);
  const firstAudio = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  check('first gesture plays recorded narration rather than Web Speech',
    audio.clips(firstAudio).length > 0 && audio.speech(firstAudio).length === 0,
    audio.describe(firstAudio));
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  await assertTargets(page, 'collage workbench');
  await assertImagesLoaded(page, 'collage workbench');

  const beforeTap = await page.evaluate(() => window.QLOBE_DEBUG.getState().items);
  await page.locator('[data-target="material-maple-leaf-coral"]').click();
  const afterTap = await page.evaluate(() => window.QLOBE_DEBUG.getState().items);
  check('one material tap creates exactly one piece', afterTap === beforeTap + 1,
    `${beforeTap} → ${afterTap}`);
  check('the new piece is selected and exposes transform tools',
    (await page.evaluate(() => Boolean(window.QLOBE_DEBUG.getState().selection)))
      && await page.locator('#selection-tools.is-visible').count() === 1);

  const firstBefore = await page.evaluate(() => window.QLOBE_DEBUG.snapshot().collage.items.at(-1));
  await page.locator('[data-target="turn"]').click();
  await page.locator('[data-target="bigger"]').click();
  const firstAfter = await page.evaluate(() => window.QLOBE_DEBUG.snapshot().collage.items.at(-1));
  check('turn and bigger transform semantic artwork',
    firstAfter.rotation !== firstBefore.rotation && firstAfter.size > firstBefore.size,
    `${firstBefore.rotation}/${firstBefore.size} → ${firstAfter.rotation}/${firstAfter.size}`);
  await page.locator('[data-target="undo"]').click();
  const firstUndo = await page.evaluate(() => window.QLOBE_DEBUG.snapshot().collage.items.at(-1));
  check('undo restores the most recent transform', firstUndo.size === firstBefore.size,
    `${firstUndo.size} vs ${firstBefore.size}`);

  await page.locator('[data-target="paper-sky"]').click();
  check('paper choice persists in semantic state',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().paper)) === 'sky');
  const countBeforeDrag = await page.evaluate(() => window.QLOBE_DEBUG.getState().items);
  await dragTrayPiece(page, 'material-oak-leaf-gold');
  check('real tray-to-paper drag creates one positioned piece',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().items)) === countBeforeDrag + 1);

  const piece = page.locator('.qlobe-freeform-piece').last();
  const pieceBox = await piece.boundingBox();
  const movedBefore = await page.evaluate(() => window.QLOBE_DEBUG.snapshot().collage.items.at(-1));
  await page.mouse.move(pieceBox.x + pieceBox.width / 2, pieceBox.y + pieceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(pieceBox.x - 85, pieceBox.y + 70, { steps: 10 });
  await page.mouse.up();
  const movedAfter = await page.evaluate(() => window.QLOBE_DEBUG.snapshot().collage.items.at(-1));
  check('real pointer drag changes normalized piece position',
    Math.abs(movedAfter.x - movedBefore.x) > .02 || Math.abs(movedAfter.y - movedBefore.y) > .02,
    `${movedBefore.x.toFixed(2)},${movedBefore.y.toFixed(2)} → ${movedAfter.x.toFixed(2)},${movedAfter.y.toFixed(2)}`);
  const firstPiece = page.locator('.qlobe-freeform-piece').first();
  const firstPieceId = await firstPiece.getAttribute('data-freeform-id');
  await firstPiece.focus();
  await page.keyboard.press('Enter');
  check('keyboard activation selects placed art and exposes its tools',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().selection)) === firstPieceId
      && await firstPiece.getAttribute('aria-pressed') === 'true'
      && await page.locator('#selection-tools.is-visible').count() === 1,
    firstPieceId || 'missing piece id');
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(shots, '02-collage-workbench.png') });

  await page.locator('[data-target="finish"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reveal');
  check('finish saves one semantic artwork',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().saves)) === 1);
  await assertTargets(page, 'reveal');
  await page.screenshot({ path: path.join(shots, '03-collage-reveal.png') });

  const downloadPromise = page.waitForEvent('download');
  await page.locator('[data-target="save-picture"]').click();
  const download = await downloadPromise;
  const exportPath = path.join(shots, 'little-artist-export.png');
  await download.saveAs(exportPath);
  const exported = await stat(exportPath);
  check('local keepsake export is a substantive PNG', exported.size > 10_000,
    `${Math.round(exported.size / 1024)}KB`);

  await page.locator('[data-target="gallery"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'gallery');
  check('gallery renders the saved artwork', await page.locator('.la-gallery-artwork').count() === 1);
  await page.screenshot({ path: path.join(shots, '04-gallery.png') });

  for (let index = 0; index < 7; index += 1) {
    await page.evaluate(async () => {
      await window.QLOBE_DEBUG.startMode('collage');
      window.QLOBE_DEBUG.addPiece('button-coral', .5, .5);
      window.QLOBE_DEBUG.finishArtwork();
    });
  }
  check('local gallery is capped at six artworks',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().saves)) === 6);

  await page.evaluate(async () => {
    await window.QLOBE_DEBUG.startMode('collage');
    window.QLOBE_DEBUG.addPiece('paper-heart-pink', .48, .52);
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  check('nonempty draft exposes resume after reload', await page.locator('[data-target="resume"]').count() === 1);
  await page.locator('[data-target="resume"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'workbench');
  check('resume restores semantic collage content',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().items)) === 1);

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('yarn'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().mode === 'yarn');
  await drawRealYarn(page);
  check('real pointer path records one textured yarn stroke',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 1);
  await page.evaluate(() => window.QLOBE_DEBUG.drawYarn([
    { x: .2, y: .3 }, { x: .5, y: .72 }, { x: .82, y: .28 },
  ], 'coral'));
  check('semantic yarn hook adds a second bounded stroke',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 2);
  await page.screenshot({ path: path.join(shots, '05-yarn-magic.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('teddy'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().mode === 'teddy');
  const teddyState = await page.evaluate(() => window.QLOBE_DEBUG.getState());
  check('Teddy mode chooses one authored idea prompt',
    ['grow', 'fly', 'face', 'pattern'].includes(teddyState.prompt), teddyState.prompt);
  check('Teddy idea card is noninteractive and visually populated',
    await page.locator('.la-idea-card').count() === 1
      && await page.locator('.la-idea-piece').count() >= 3
      && await page.locator('.la-idea-card [data-target]').count() === 0);
  await page.evaluate(() => window.QLOBE_DEBUG.addPiece('twig-fork', .5, .55));
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(shots, '06-teddy-idea.png') });
  check('Teddy artwork finishes through the common semantic renderer',
    await page.evaluate(() => window.QLOBE_DEBUG.finishArtwork()));

  await page.evaluate(async () => {
    await window.QLOBE_DEBUG.startMode('collage');
    window.QLOBE_DEBUG.addPiece('button-coral', .5, .5);
    window.__littleArtistStorageSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new DOMException('storage denied', 'QuotaExceededError'); };
    window.QLOBE_DEBUG.finishArtwork();
  });
  check('storage denial gives an honest export-only keepsake message',
    await page.locator('.la-saved-device.is-temporary').textContent() === 'Save a picture to keep it');
  await page.evaluate(() => { Storage.prototype.setItem = window.__littleArtistStorageSetItem; });

  checkSessionClean(reporter, current, 'landscape session');
  await current.close();
}

async function driveResponsive(browser) {
  const portrait = await session(browser, { width: 820, height: 1180 });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  await portrait.page.screenshot({ path: path.join(shots, '07-splash-portrait.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('collage'));
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.addPiece('pressed-daisy', .5, .45));
  await portrait.page.waitForTimeout(220);
  const portraitSheet = await portrait.page.locator('#art-sheet').boundingBox();
  check('portrait paper remains a large usable art surface',
    portraitSheet.width >= 600 && portraitSheet.height >= 440,
    `${Math.round(portraitSheet.width)}×${Math.round(portraitSheet.height)}`);
  await assertTargets(portrait.page, 'portrait workbench');
  await portrait.page.screenshot({ path: path.join(shots, '08-collage-portrait.png') });

  const short = await session(browser, { width: 1180, height: 520 });
  await short.page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  await short.page.evaluate(() => window.QLOBE_DEBUG.startMode('collage'));
  await short.page.evaluate(() => window.QLOBE_DEBUG.addPiece('paper-star-plum', .5, .5));
  const shortLayout = await short.page.evaluate(() => {
    const sheet = document.getElementById('art-sheet').getBoundingClientRect();
    return {
      sheet: [sheet.width, sheet.height],
      horizontalOverflow: document.documentElement.scrollWidth - innerWidth,
    };
  });
  check('short landscape keeps the paper usable without horizontal clipping',
    shortLayout.sheet[0] >= 500 && shortLayout.sheet[1] >= 240 && shortLayout.horizontalOverflow <= 1,
    `${shortLayout.sheet.map(Math.round).join('×')}, overflow=${shortLayout.horizontalOverflow}`);
  await assertTargets(short.page, 'short landscape workbench');
  await short.page.screenshot({ path: path.join(shots, '09-collage-short.png') });

  const ipad = await session(
    browser,
    { width: 1024, height: 768 },
    'reduce',
    { deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  );
  await ipad.page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  await ipad.page.evaluate(() => window.QLOBE_DEBUG.startMode('yarn'));
  await drawRealYarn(ipad.page);
  const ipadCanvas = await ipad.page.locator('#yarn-canvas').evaluate((canvas) => ({
    css: [canvas.clientWidth, canvas.clientHeight],
    backing: [canvas.width, canvas.height],
  }));
  check('iPad-density reduced-motion yarn records from a real pointer path',
    (await ipad.page.evaluate(() => window.QLOBE_DEBUG.getState().strokes)) === 1
      && ipadCanvas.backing[0] >= ipadCanvas.css[0] * 1.9,
    `${ipadCanvas.css.join('×')} CSS / ${ipadCanvas.backing.join('×')} backing`);
  await ipad.page.screenshot({ path: path.join(shots, '10-yarn-ipad-reduced.png') });

  checkSessionClean(reporter, portrait, 'portrait session');
  checkSessionClean(reporter, short, 'short landscape session');
  checkSessionClean(reporter, ipad, 'iPad session');
  await portrait.close();
  await short.close();
  await ipad.close();
}

async function main() {
  await ensureShots(shots);
  await staticChecks();
  const browser = await launchChrome({ headless: true });
  try {
    await driveLandscape(browser);
    await driveResponsive(browser);
  } finally {
    await browser.close();
    finish({ listFailures: true });
  }
}

main().catch((error) => {
  note(error.stack || error.message || String(error));
  console.error(error);
  process.exitCode = 1;
});
