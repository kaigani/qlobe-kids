#!/usr/bin/env node
// Real-Chrome smoke and visual-QC drive for Reading Buddies.
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, shooter, debug, dragBetween, targetSizes,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/picture-word-match');
const shot = shooter(shots);
const reporter = createReporter();
const { check, finish } = reporter;
const sessions = [];

async function openGame(browser, viewport, reducedMotion = 'no-preference', mute = false) {
  const session = await openSession(browser, {
    url: `${base}/games/picture-word-match/`, base, viewport, reducedMotion,
    seed: 42, fastTimers: 0.1, mute, allowAbortedMedia: true,
    allowRemote: ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'],
  });
  sessions.push(session);
  return session;
}

async function overflow(page) {
  return page.evaluate(() => ({ x: document.documentElement.scrollWidth - innerWidth,
    y: document.documentElement.scrollHeight - innerHeight }));
}

async function audit(page, label) {
  const sizes = await targetSizes(page);
  check(`${label} visible targets are at least 96px`, sizes.every(({ w, h }) => w >= 96 && h >= 96), JSON.stringify(sizes));
  const over = await overflow(page);
  check(`${label} has no viewport overflow`, over.x <= 1 && over.y <= 1, JSON.stringify(over));
  check(`${label} images decode and authored artwork avoids SVG/canvas/emoji`, await page.evaluate(() => {
    const images = [...document.images];
    return images.every((image) => image.complete && image.naturalWidth > 0)
      && !document.querySelector('svg,canvas')
      && ![...document.querySelectorAll('*')].some((node) => /[\u{1F300}-\u{1FAFF}]/u.test(node.textContent || ''));
  }));
}

async function auditCatalogArt(page) {
  return page.evaluate(async () => {
    const config = await fetch('./config.json').then((response) => response.json());
    const sources = [
      ...config.words.map((word) => word.art),
      ...config.chapters.map((chapter) => chapter.art),
      ...config.modes.map((mode) => mode.art),
    ];
    const failures = [];
    await Promise.all(sources.map(async (src) => {
      const image = new Image();
      image.src = src;
      try { await image.decode(); } catch { failures.push(src); }
      if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) failures.push(src);
    }));
    return { total: sources.length, failures: [...new Set(failures)] };
  });
}

async function auditPlayChrome(page, label) {
  const result = await page.evaluate(() => {
    const visibleRect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        visible: style.display !== 'none' && style.visibility !== 'hidden'
          && rect.width >= 96 && rect.height >= 96,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      };
    };
    const prompt = document.querySelector('.rb-play-prompt')?.getBoundingClientRect();
    return {
      back: visibleRect('[data-target="back-play"]'),
      sound: visibleRect('[data-target="sound"]'),
      prompt: prompt ? { top: prompt.top, bottom: prompt.bottom } : null,
      viewport: { width: innerWidth, height: innerHeight },
    };
  });
  const inside = (rect) => rect?.visible && rect.top >= 0 && rect.left >= 0
    && rect.right <= result.viewport.width && rect.bottom <= result.viewport.height;
  check(`${label} keeps both HUD controls in the safe viewport`, inside(result.back) && inside(result.sound), JSON.stringify(result));
  check(`${label} prompt is not top-clipped`, result.prompt?.top >= 4, JSON.stringify(result));
}

async function chooseAnimals(page) {
  await debug.tap(page, 'chapter-animals');
  await debug.waitForScreen(page, 'activities');
  check('Animals chapter opens', (await debug.getState(page)).chapterId === 'animals');
}

async function answerPicture(page, realDrag = false) {
  const state = await debug.getState(page);
  const word = state.currentWord;
  const picture = page.locator(`[data-target="picture-${word}"]`).first();
  const answer = page.locator(`[data-target="word-${word}"]`).first();
  if (realDrag) await dragBetween(page, await picture.boundingBox(), await answer.boundingBox(), { steps: 12 });
  else { await picture.click(); await answer.click(); }
  await debug.waitForScreen(page, 'great');
}

async function answerListen(page) {
  const word = (await debug.getState(page)).currentWord;
  await page.locator(`[data-target="picture-${word}"]`).first().click();
  await debug.waitForScreen(page, 'great');
}

async function auditRecordedAudio(page) {
  return page.evaluate(async () => {
    const response = await fetch('./assets/audio/manifest.json');
    if (!response.ok) return { total: 0, failures: ['manifest'] };
    const manifest = await response.json();
    const context = new AudioContext();
    const failures = [];
    for (const [key, entry] of Object.entries(manifest)) {
      try {
        const clip = await fetch(`./assets/audio/${entry.file}`);
        if (!clip.ok) throw new Error(`HTTP ${clip.status}`);
        const decoded = await context.decodeAudioData(await clip.arrayBuffer());
        if (!(decoded.duration > 0.3)) throw new Error('empty decode');
      } catch (error) {
        failures.push(`${key}:${error.message}`);
      }
    }
    await context.close();
    return { total: Object.keys(manifest).length, failures };
  });
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ channel: 'chrome' });
  try {
    const session = await openGame(browser, { width: 1180, height: 820 });
    const page = session.page;
    const hub = await openSession(browser, { url: `${base}/#reading-phonics`, base, viewport: { width: 1180, height: 820 }, ready: false, allowRemote: ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'] });
    sessions.push(hub);
    const tile = hub.page.locator('a.game-card[data-game-id="picture-word-match"]');
    check('hub registers Reading Buddies exactly once', await tile.count() === 1);
    await shot(hub.page, '00-hub');
    await tile.click();
    await hub.page.waitForURL('**/games/picture-word-match/');
    check('hub tile opens the game route', hub.page.url().includes('/games/picture-word-match/'));
    check('library screen loads', await page.locator('#screen-library').isVisible());
    await audit(page, 'library');
    const catalogArt = await auditCatalogArt(page);
    check('all 24 chapter, mode, and word illustrations decode', catalogArt.total === 24 && catalogArt.failures.length === 0, JSON.stringify(catalogArt));
    await shot(page, '01-library-landscape');
    await chooseAnimals(page);
    await audit(page, 'activities');
    check('three reading modes are offered', await page.locator('.rb-mode-card').count() === 3);
    await shot(page, '01b-activities-landscape');
    await page.locator('[data-target="mode-picture"]').click();
    await debug.waitForScreen(page, 'play');
    await auditPlayChrome(page, 'Picture Pairs');
    await shot(page, '02-picture-play');
    await page.locator(`[data-target^="picture-"]`).first().click();
    check('first gesture uses recorded narration', (await debug.getAudioLog(page)).some((entry) => entry.kind === 'clip'));
    const currentPictureWord = (await debug.getState(page)).currentWord;
    const wrong = page.locator(`[data-target^="word-"]:not([data-target="word-${currentPictureWord}"])`).first();
    await wrong.click();
    check('wrong picture answer preserves the round', (await debug.getState(page)).roundIndex === 0);
    await answerPicture(page, true);
    await shot(page, '02-picture-great');
    await debug.call(page, 'advance');
    await debug.waitForScreen(page, 'play');

    await debug.startMode(page, 'listen');
    await debug.waitForScreen(page, 'play');
    await auditPlayChrome(page, 'Buddy Says');
    await shot(page, '03-listen-play');
    await answerListen(page);
    check('listen mode accepts the matching picture', (await debug.getState(page)).screen === 'great');
    await debug.call(page, 'advance'); await debug.waitForScreen(page, 'play');

    await debug.startMode(page, 'build');
    await debug.waitForScreen(page, 'play');
    await auditPlayChrome(page, 'Word Garden');
    await shot(page, '04-build-play');
    const buildState = await debug.getState(page);
    const expected = await page.evaluate(() => {
      const s = window.QLOBE_DEBUG.getState();
      return document.querySelector('.rb-letter-slot')?.textContent.trim().slice(0, 1) || s.currentWord;
    });
    const piece = buildState.pieces.find((p) => !p.used && p.letter === expected);
    if (piece) await debug.call(page, 'place', piece.id, 'slot-0');
    check('build mode accepts a real letter interaction', (await debug.getState(page)).placed[0] === expected);
    const secondExpected = await page.evaluate(() => {
      const s = window.QLOBE_DEBUG.getState();
      return fetch('./config.json').then((r) => r.json()).then((c) => c.words.find((w) => w.id === s.currentWord).letters[1]);
    });
    const afterFirst = await debug.getState(page);
    const secondPiece = afterFirst.pieces.find((item) => !item.used && item.letter === secondExpected);
    const activePiece = page.locator(`[data-target="${secondPiece?.id || 'missing'}"]`).first();
    const slot = page.locator('[data-target="slot-1"]').first();
    if (secondPiece && await activePiece.count()) await dragBetween(page, await activePiece.boundingBox(), await slot.boundingBox(), { steps: 10 });
    check('build mode supports a real pointer drag', (await debug.getState(page)).placed[1] === secondExpected);
    await debug.call(page, 'winRound'); await debug.waitForScreen(page, 'great');
    await shot(page, '03-build-great');
    await debug.call(page, 'advance'); await debug.waitForScreen(page, 'play');
    await debug.call(page, 'winRound'); await debug.waitForScreen(page, 'great');
    await debug.call(page, 'advance'); await debug.waitForScreen(page, 'play');
    await debug.call(page, 'winRound'); await debug.waitForScreen(page, 'great');
    await debug.call(page, 'advance'); await debug.waitForScreen(page, 'complete');
    check('reward and final completion screens render', await page.locator('#screen-complete').isVisible());
    await page.waitForTimeout(700);
    await shot(page, '04-complete');
    await audit(page, 'complete');
    const audioAudit = await auditRecordedAudio(page);
    check('all 39 committed narration clips decode in Chrome', audioAudit.total === 39 && audioAudit.failures.length === 0, JSON.stringify(audioAudit));

    const portrait = await openGame(browser, { width: 820, height: 1180 }, 'reduce', true);
    await audit(portrait.page, 'portrait reduced-motion');
    await portrait.page.locator('[data-target="chapter-animals"]').click();
    await portrait.page.locator('[data-target="mode-picture"]').click();
    await debug.waitForScreen(portrait.page, 'play');
    await shot(portrait.page, '05-portrait');
    const dragPiece = portrait.page.locator('[data-target^="picture-"]').first();
    const dragBox = await dragPiece.boundingBox();
    await portrait.page.mouse.move(dragBox.x + dragBox.width / 2, dragBox.y + dragBox.height / 2);
    await portrait.page.mouse.down();
    await portrait.page.mouse.move(dragBox.x + dragBox.width / 2 + 50, dragBox.y + dragBox.height / 2 + 40, { steps: 8 });
    check('a real held pointer creates the drag ghost', await portrait.page.locator('.qk-drag-ghost').count() === 1);
    await portrait.page.setViewportSize({ width: 1180, height: 820 });
    await portrait.page.waitForFunction(() => !document.querySelector('.qk-drag-ghost'), null, { timeout: 2000 }).catch(() => {});
    check('rotation clears the drag ghost', await portrait.page.locator('.qk-drag-ghost').count() === 0);
    await portrait.page.mouse.up();
    for (const s of sessions) {
      // GA is explicitly allowlisted above. Chrome aborts its fire-and-forget
      // beacon when a QA context closes; keep every other request failure.
      s.failed = s.failed.filter((line) => !(
        line.includes('google-analytics.com/g/collect') && line.includes('net::ERR_ABORTED')
      ));
      checkSessionClean(reporter, s, 'picture-word-match');
    }
  } finally {
    await browser.close();
  }
  finish();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
