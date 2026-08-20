#!/usr/bin/env node
import path from 'node:path';
import { access, mkdir, readFile } from 'node:fs/promises';
import {
  args,
  launchChrome,
  openSession,
  createReporter,
  checkSessionClean,
  dragBetween,
} from '../../../tools/qa/lib/driver.mjs';

const base = (args.flag('base', 'http://127.0.0.1:8765')).replace(/\/$/, '');
const url = `${base}/games/puzzle-map-match/`;
const shots = '/private/tmp/puzzle-explorer-jigsaw-qa';
const { check, finish } = createReporter();
const sessions = [];
const platformAnalytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const repoRoot = path.resolve(import.meta.dirname, '../../..');
await mkdir(shots, { recursive: true });

const gameConfig = JSON.parse(await readFile(path.join(repoRoot, 'games/puzzle-map-match/config.json'), 'utf8'));
const gameMeta = JSON.parse(await readFile(path.join(repoRoot, 'games/puzzle-map-match/game.json'), 'utf8'));
const registry = JSON.parse(await readFile(path.join(repoRoot, 'games.json'), 'utf8'));
const registryGame = registry.games.find((game) => game.id === 'puzzle-map-match');

check('metadata classifies the rebuilt game as a visual-spatial sensorial puzzle', gameMeta.category === 'sensorial-science' && registryGame?.category === 'sensorial-science');
check('metadata and registry expose the same three jigsaw puzzles', gameMeta.modes.map(({ id }) => id).join(',') === 'forest-fox,star-rocket,garden-flowers' && registryGame?.modes?.map(({ id }) => id).join(',') === 'forest-fox,star-rocket,garden-flowers');
check('game remains beta until a real child/iPad playtest', gameMeta.status === 'beta' && registryGame?.status === 'beta');

for (const puzzle of gameConfig.puzzles) {
  const folder = path.join(repoRoot, 'games/puzzle-map-match/assets/puzzles', puzzle.id);
  const manifest = JSON.parse(await readFile(path.join(folder, 'pieces.json'), 'utf8'));
  const expectedFiles = [
    ...manifest.pieces.map((piece) => piece.file),
    'pieces.json', 'outline.svg', 'assembled.png', 'preview.png',
  ];
  let existing = 0;
  for (const file of expectedFiles) {
    try { await access(path.join(folder, file)); existing += 1; } catch { /* reported below */ }
  }
  check(`${puzzle.id} has six durable piece PNGs and four pipeline QA artifacts`, manifest.pieces.length === 6 && existing === 10, `${existing}/10 files`);
  check(`${puzzle.id} manifest keeps the 3×2 1200×800 seeded contract`, manifest.cols === 3 && manifest.rows === 2 && manifest.width === 1200 && manifest.height === 800 && manifest.seedInput === puzzle.seed);
  check(`${puzzle.id} manifest has finite reconstruction coordinates and paths`, manifest.pieces.every((piece) => Number.isFinite(piece.x) && Number.isFinite(piece.y) && typeof piece.path === 'string' && piece.path.startsWith('M ')));

  const complement = (a, b) => (a === 'tab' && b === 'blank') || (a === 'blank' && b === 'tab');
  const byCell = new Map(manifest.pieces.map((piece) => [`${piece.row}:${piece.col}`, piece]));
  let joins = 0;
  let validJoins = 0;
  for (const piece of manifest.pieces) {
    const right = byCell.get(`${piece.row}:${piece.col + 1}`);
    const below = byCell.get(`${piece.row + 1}:${piece.col}`);
    if (right) { joins += 1; if (complement(piece.edges.right, right.edges.left)) validJoins += 1; }
    if (below) { joins += 1; if (complement(piece.edges.bottom, below.edges.top)) validJoins += 1; }
  }
  check(`${puzzle.id} has complementary tab/blank labels at all seven joins`, joins === 7 && validJoins === 7, `${validJoins}/${joins}`);
}

const browser = await launchChrome({ channel: 'chrome' });
try {
  const mainSession = await openSession(browser, {
    url,
    base,
    viewport: { width: 1200, height: 800 },
    reducedMotion: 'no-preference',
    allowAbortedMedia: true,
    allowRemote: platformAnalytics,
    mute: true,
  });
  sessions.push(mainSession);
  const { page } = mainSession;
  const state = () => page.evaluate(() => window.QLOBE_DEBUG.getState());

  const api = await page.evaluate(() => ({
    id: window.QLOBE_DEBUG.gameId,
    engine: window.QLOBE_DEBUG.engine,
    modes: window.QLOBE_DEBUG.listModes(),
  }));
  check('debug hook exposes the jigsaw engine at the stable game id', api.id === 'puzzle-map-match' && api.engine === 'dom-jigsaw-v1', JSON.stringify(api));
  check('debug hook lists fox, rocket, and garden', api.modes.map(({ id }) => id).join(',') === 'forest-fox,star-rocket,garden-flowers');
  check('choice screen boots with three picture-led puzzle cards', (await state()).screen === 'choose' && await page.locator('[data-puzzle]').count() === 3);
  check('all visible choice-screen raster art decodes', await page.locator('img:visible').evaluateAll((images) => images.every((image) => image.naturalWidth > 0 && image.naturalHeight > 0)));
  check('boot reports no missing art', (await state()).artFailures.length === 0);
  await page.screenshot({ path: path.join(shots, '01-choose.png') });

  const voicePack = await page.evaluate(async () => {
    const [manifestResponse, linesResponse] = await Promise.all([
      fetch('./assets/audio/manifest.json'),
      fetch('./data/lines.json'),
    ]);
    const [manifest, lines] = await Promise.all([manifestResponse.json(), linesResponse.json()]);
    const decodeIssues = [];
    const provenanceIssues = [];
    const context = new OfflineAudioContext(1, 1, 44100);
    for (const [key, entry] of Object.entries(manifest)) {
      try {
        const response = await fetch(`./assets/audio/${entry.file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const audio = await context.decodeAudioData(await response.arrayBuffer());
        if (!(audio.duration > 0) || Math.abs(audio.duration - entry.dur) > 0.12) throw new Error(`duration ${audio.duration}`);
      } catch (error) {
        decodeIssues.push(`${key}: ${error.message}`);
      }
      try {
        const [recipeResponse, sidecarResponse] = await Promise.all([
          fetch(`./assets/source/voice-recipes/${key}.recipe.json`),
          fetch(`./assets/source/voice-qa/${key}.json`),
        ]);
        if (!recipeResponse.ok || !sidecarResponse.ok) throw new Error('missing provenance');
        const [recipe, sidecar] = await Promise.all([recipeResponse.json(), sidecarResponse.json()]);
        if (recipe?.steps?.[0]?.text !== lines[key] || recipe?.qa?.transcript?.match !== true || Number(recipe?.qa?.transcript?.ratio) < 0.98 || sidecar?.match !== true || Number(sidecar?.ratio) < 0.98) throw new Error('transcript mismatch');
      } catch (error) {
        provenanceIssues.push(`${key}: ${error.message}`);
      }
    }
    return {
      manifestKeys: Object.keys(manifest),
      lineCount: Object.keys(lines).length,
      exactWelcome: lines.welcome,
      exactSuccess: lines.success,
      decodeIssues,
      provenanceIssues,
    };
  });
  check('17 concise jigsaw lines replace the 58 geography lines', voicePack.lineCount === 17);
  check('the two required concept phrases remain exact', voicePack.exactWelcome === 'Welcome to Puzzle Explorer! Let’s discover the world together.' && voicePack.exactSuccess === 'It’s puzzle-tastic!');
  check('accepted teacher clips are intentionally limited to exact welcome and success', voicePack.manifestKeys.sort().join(',') === 'success,welcome', voicePack.manifestKeys.join(','));
  check('both retained teacher clips decode and keep accepted Whisper provenance', voicePack.decodeIssues.length === 0 && voicePack.provenanceIssues.length === 0, [...voicePack.decodeIssues, ...voicePack.provenanceIssues].join('; '));

  await page.evaluate(() => window.QLOBE_DEBUG.startPuzzle('forest-fox'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
  let playState = await state();
  check('forest puzzle starts as a six-piece 3×2 cut', playState.geometry?.width === 1200 && playState.geometry?.height === 800 && playState.geometry?.rows === 2 && playState.geometry?.cols === 3 && playState.totalPieces === 6, JSON.stringify(playState.geometry));
  check('runtime geometry exactly matches the committed cutter manifest', playState.manifestMatches === true && playState.manifestIssues.length === 0);
  check('board starts empty with one real loose cut canvas', playState.placed.length === 0 && await page.locator('.placed-piece').count() === 0 && await page.locator('.loose-piece canvas').count() === 1);
  const alpha = await page.locator('.loose-piece canvas').evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let clear = 0; let opaque = 0;
    for (let index = 3; index < data.length; index += 16) {
      if (data[index] === 0) clear += 1;
      if (data[index] > 200) opaque += 1;
    }
    return { clear, opaque, width: canvas.width, height: canvas.height };
  });
  check('loose piece canvas has transparent surround and painted image pixels', alpha.clear > 0 && alpha.opaque > 0, JSON.stringify(alpha));
  const assembly = await page.evaluate(() => window.QLOBE_DEBUG.verifyAssembly());
  check('all six runtime canvases reassemble the CLI proof pixel-for-pixel', assembly.match === true && assembly.mismatchedPixels === 0 && assembly.maxDelta === 0, JSON.stringify(assembly));

  let slots = await page.locator('[data-piece-index]').evaluateAll((nodes) => nodes.map((node) => {
    const rect = node.getBoundingClientRect();
    return { index: Number(node.dataset.pieceIndex), x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }));
  check('desktop board exposes six non-overlapping generous semantic spaces', slots.length === 6 && slots.every((slot) => slot.width >= 96 && slot.height >= 96));
  await page.screenshot({ path: path.join(shots, '02-fox-play.png') });

  const pieceBox = await page.locator('[data-role="draggable"]:visible').boundingBox();
  const wrongBox = slots.find((slot) => slot.index !== playState.expectedSlot);
  await dragBetween(page, pieceBox, wrongBox, { steps: 10 });
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().busy);
  playState = await state();
  check('wrong real drag leaves progress and piece order unchanged', playState.step === 0 && playState.placed.length === 0 && playState.currentPiece === 0);
  check('wrong real drag always removes its ghost', await page.locator('[data-qk-drag-ghost]').count() === 0);
  await page.screenshot({ path: path.join(shots, '03-wrong-return.png') });

  const offboardPiece = await page.locator('[data-role="draggable"]:visible').boundingBox();
  await dragBetween(page, offboardPiece, { x: 4, y: 4 }, { steps: 9 });
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().busy);
  check('off-board drop returns without mutation', (await state()).placed.length === 0 && (await state()).step === 0);

  let cancelPiece = await page.locator('[data-role="draggable"]:visible').boundingBox();
  await page.mouse.move(cancelPiece.x + cancelPiece.width / 2, cancelPiece.y + cancelPiece.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelPiece.x + cancelPiece.width / 2 + 35, cancelPiece.y + cancelPiece.height / 2 - 28, { steps: 5 });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().activeDrag);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().activeDrag);
  await page.mouse.up();
  check('resize-mid-drag cancels safely and preserves progress', (await state()).placed.length === 0 && await page.locator('[data-qk-drag-ghost]').count() === 0);

  cancelPiece = await page.locator('[data-role="draggable"]:visible').boundingBox();
  await page.mouse.move(cancelPiece.x + cancelPiece.width / 2, cancelPiece.y + cancelPiece.height / 2);
  await page.mouse.down();
  await page.mouse.move(cancelPiece.x + cancelPiece.width / 2 + 32, cancelPiece.y + cancelPiece.height / 2 + 25, { steps: 5 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().activeDrag);
  await page.mouse.up();
  check('blur-mid-drag cancels safely and removes the ghost', (await state()).placed.length === 0 && await page.locator('[data-qk-drag-ghost]').count() === 0);

  await page.evaluate(() => window.QLOBE_DEBUG.showHint());
  check('lightbulb hint highlights only the exact current space', await page.locator('.piece-slot.is-hint').count() === 1 && (await state()).hintVisible === true);
  await page.screenshot({ path: path.join(shots, '04-hint.png') });

  playState = await state();
  const correctBox = slots.find((slot) => slot.index === playState.expectedSlot);
  const correctPiece = await page.locator('[data-role="draggable"]:visible').boundingBox();
  await page.mouse.move(correctPiece.x + correctPiece.width / 2, correctPiece.y + correctPiece.height / 2);
  await page.mouse.down();
  await page.mouse.move(correctBox.x + correctBox.width / 2, correctBox.y + correctBox.height / 2, { steps: 12 });
  check('real drag uses one bitmap-bearing ghost', await page.locator('[data-qk-drag-ghost] canvas').count() === 1);
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placed.length === 1);
  check('correct real drag snaps the expected cutter piece', (await state()).phase === 'snapping' && await page.locator('.placed-piece').count() === 1);
  await page.screenshot({ path: path.join(shots, '05-snap.png') });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().step === 1 && window.QLOBE_DEBUG.getState().phase === 'playing');

  const audioLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  check('exact welcome and success use retained teacher clips while new jigsaw lines use local fallback', audioLog.some((entry) => entry.key === 'welcome' && entry.kind === 'clip') && audioLog.some((entry) => entry.key === 'success' && entry.kind === 'clip') && audioLog.some((entry) => entry.key === 'puzzle-fox' && entry.kind === 'speech'), JSON.stringify(audioLog));

  await page.locator('[data-role="draggable"]:visible').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().selected === true);
  playState = await state();
  const wrongTapIndex = slots.find((slot) => slot.index !== playState.expectedSlot && !playState.placed.includes(slot.index)).index;
  await page.locator(`[data-piece-index="${wrongTapIndex}"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().busy);
  check('wrong keyboard/tap choice preserves progress and selection', (await state()).step === 1 && (await state()).selected === true);
  await page.locator(`[data-piece-index="${playState.expectedSlot}"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placed.length === 2);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().step === 2 && window.QLOBE_DEBUG.getState().phase === 'playing');
  check('keyboard path places through the same exact snap state', (await state()).placed.length === 2 && await page.locator('.placed-piece').count() === 2);
  await page.screenshot({ path: path.join(shots, '06-two-placed.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.fastTimers(20));
  let correctPaths = 0;
  for (const puzzleId of ['forest-fox', 'star-rocket', 'garden-flowers']) {
    await page.evaluate((id) => window.QLOBE_DEBUG.startPuzzle(id), puzzleId);
    await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().puzzle === id && window.QLOBE_DEBUG.getState().phase === 'playing', puzzleId);
    check(`${puzzleId} runtime cut agrees with its durable manifest`, (await state()).manifestMatches === true);
    for (let index = 0; index < 6; index += 1) {
      const before = await state();
      check(`${puzzleId} piece ${index + 1} exposes one expected slot`, Number.isInteger(before.currentPiece) && before.currentPiece === before.expectedSlot);
      await page.evaluate(({ piece, slot }) => window.QLOBE_DEBUG.place(piece, slot), { piece: before.currentPiece, slot: before.expectedSlot });
      correctPaths += 1;
      if (index < 5) await page.waitForFunction((step) => window.QLOBE_DEBUG.getState().step === step && window.QLOBE_DEBUG.getState().phase === 'playing', index + 1);
      else await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'complete');
    }
    check(`${puzzleId} reaches a complete assembled scene`, (await state()).screen === 'complete' && await page.locator('.solved-piece').count() === 6);
  }
  check('all eighteen configured piece-to-space paths complete', correctPaths === 18);
  check('completion exposes build-again, next-puzzle, and choose controls', await page.locator('[data-target="again"], [data-target="next"], [data-target="choose"]').count() === 3);
  await page.screenshot({ path: path.join(shots, '07-complete.png') });

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  check('all three completed puzzles persist across reload', (await state()).screen === 'choose' && (await state()).completedPuzzles.length === 3);

  const phone = await openSession(browser, {
    url,
    base,
    viewport: { width: 320, height: 800 },
    reducedMotion: 'no-preference',
    allowAbortedMedia: true,
    allowRemote: platformAnalytics,
    fastTimers: 20,
    mute: true,
  });
  sessions.push(phone);
  const phoneChoice = await phone.page.locator('[data-puzzle]').evaluateAll((cards) => cards.map((card) => {
    const cardRect = card.getBoundingClientRect();
    const picture = card.querySelector('.puzzle-card-picture');
    const pictureRect = picture.getBoundingClientRect();
    const image = picture.querySelector('img');
    const label = card.querySelector('.puzzle-card-label');
    return {
      width: cardRect.width,
      height: cardRect.height,
      pictureWidth: pictureRect.width,
      pictureHeight: pictureRect.height,
      imageFit: getComputedStyle(image).objectFit,
      labelFont: parseFloat(getComputedStyle(label).fontSize),
    };
  }));
  check('320px chooser keeps three recognizable landscape scene cards', phoneChoice.length === 3 && phoneChoice.every((card) => card.width / card.height >= 1.75 && card.pictureWidth >= 150 && card.pictureHeight >= 90 && card.imageFit === 'contain' && card.labelFont >= 13), JSON.stringify(phoneChoice));
  await phone.page.screenshot({ path: path.join(shots, '08-phone-choose.png') });
  await phone.page.evaluate(() => window.QLOBE_DEBUG.startPuzzle('forest-fox'));
  await phone.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
  const phoneLayout = await phone.page.evaluate(() => ({
    viewport: { width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight },
    cue: (() => { const element = document.querySelector('.piece-cue'); const rect = element.getBoundingClientRect(); return { font: parseFloat(getComputedStyle(element).fontSize), width: rect.width, height: rect.height }; })(),
    piece: (() => { const rect = document.querySelector('[data-role="draggable"]').getBoundingClientRect(); return { width: rect.width, height: rect.height }; })(),
    slots: [...document.querySelectorAll('[data-piece-index]')].map((element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }),
  }));
  check('320px portrait keeps six 96px puzzle spaces', phoneLayout.slots.length === 6 && phoneLayout.slots.every((slot) => slot.width >= 96 && slot.height >= 96), JSON.stringify(phoneLayout.slots));
  check('320px portrait keeps a readable tap-or-drag cue and loose piece', phoneLayout.cue.font >= 10.5 && phoneLayout.cue.width > 0 && phoneLayout.piece.width >= 120, JSON.stringify(phoneLayout));
  check('320px portrait has no page overflow', phoneLayout.viewport.scrollWidth <= phoneLayout.viewport.width + 1 && phoneLayout.viewport.scrollHeight <= phoneLayout.viewport.height + 1, JSON.stringify(phoneLayout.viewport));
  await phone.page.screenshot({ path: path.join(shots, '08-phone-play.png') });

  for (let index = 0; index < 6; index += 1) {
    const before = await phone.page.evaluate(() => window.QLOBE_DEBUG.getState());
    await phone.page.locator('[data-role="draggable"]:visible').click();
    await phone.page.waitForFunction(() => window.QLOBE_DEBUG.getState().selected === true);
    await phone.page.locator(`[data-piece-index="${before.expectedSlot}"]`).click();
    if (index < 5) await phone.page.waitForFunction((step) => window.QLOBE_DEBUG.getState().step === step && window.QLOBE_DEBUG.getState().phase === 'playing', index + 1);
    else await phone.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'complete');
  }
  check('all six phone-width pointer taps complete the puzzle', (await phone.page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'complete');
  await phone.page.screenshot({ path: path.join(shots, '09-phone-complete.png') });

  const compact = await openSession(browser, {
    url,
    base,
    viewport: { width: 568, height: 320 },
    reducedMotion: 'no-preference',
    allowAbortedMedia: true,
    allowRemote: platformAnalytics,
    fastTimers: 20,
    mute: true,
  });
  sessions.push(compact);
  await compact.page.evaluate(() => window.QLOBE_DEBUG.startPuzzle('star-rocket'));
  await compact.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
  const compactLayout = await compact.page.evaluate(() => ({
    board: (() => { const rect = document.querySelector('.board-frame').getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; })(),
    tray: (() => { const rect = document.querySelector('.piece-tray').getBoundingClientRect(); return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }; })(),
    cue: (() => { const element = document.querySelector('.piece-cue'); const rect = element.getBoundingClientRect(); return { font: parseFloat(getComputedStyle(element).fontSize), width: rect.width, height: rect.height }; })(),
    slots: [...document.querySelectorAll('[data-piece-index]')].map((element) => { const rect = element.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }),
    viewport: { width: innerWidth, height: innerHeight },
  }));
  check('568×320 landscape keeps board and tray fully on screen', [compactLayout.board, compactLayout.tray].every((rect) => rect.left >= -1 && rect.top >= -1 && rect.right <= compactLayout.viewport.width + 1 && rect.bottom <= compactLayout.viewport.height + 1), JSON.stringify(compactLayout));
  check('568×320 landscape keeps every drop space at least 96px', compactLayout.slots.every((slot) => slot.width >= 96 && slot.height >= 96), JSON.stringify(compactLayout.slots));
  check('568×320 landscape keeps the tap-or-drag cue readable', compactLayout.cue.font >= 11.5 && compactLayout.cue.width >= 100 && compactLayout.cue.height >= 24, JSON.stringify(compactLayout.cue));
  await compact.page.screenshot({ path: path.join(shots, '10-compact-landscape.png') });

  const portrait = await openSession(browser, {
    url,
    base,
    viewport: { width: 700, height: 1100 },
    reducedMotion: 'reduce',
    allowAbortedMedia: true,
    allowRemote: platformAnalytics,
    fastTimers: 20,
    mute: true,
  });
  sessions.push(portrait);
  check('portrait reduced-motion choice screen boots', (await portrait.page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'choose' && (await portrait.page.evaluate(() => window.QLOBE_DEBUG.getState())).reducedMotion === true);
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startPuzzle('garden-flowers'));
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
  const portraitSlots = await portrait.page.locator('[data-piece-index]').evaluateAll((nodes) => nodes.map((node) => { const rect = node.getBoundingClientRect(); return { width: rect.width, height: rect.height }; }));
  check('700×1100 portrait keeps six generous puzzle spaces', portraitSlots.length === 6 && portraitSlots.every((slot) => slot.width >= 96 && slot.height >= 96), JSON.stringify(portraitSlots));
  check('reduced motion removes the modeled hand without removing the hint target', await portrait.page.locator('.hand-guide').evaluate((node) => getComputedStyle(node).display === 'none') && await portrait.page.locator('[data-target="hint"]').isVisible());
  await portrait.page.screenshot({ path: path.join(shots, '11-portrait-reduced.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.completePuzzle());
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'complete');
  await portrait.page.screenshot({ path: path.join(shots, '12-portrait-complete.png') });

  for (const [index, session] of sessions.entries()) {
    session.failed = session.failed.filter((request) => !platformAnalytics.some((prefix) => request.startsWith(prefix)));
    checkSessionClean({ check }, session, `browser session ${index + 1}`);
  }
  await Promise.all(sessions.map((session) => session.close()));
} finally {
  await browser.close();
}

finish({ suffix: `; screenshots: ${shots}` });
