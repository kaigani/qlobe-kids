#!/usr/bin/env node

import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/texture-trail');
const { check, note, finish } = createReporter();
const sessions = [];
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

async function openGame(browser, viewport, reducedMotion = 'no-preference', mute = true) {
  const session = await openSession(browser, {
    url: `${base}/games/texture-trail/`, base, viewport, reducedMotion,
    allowAbortedMedia: true, allowRemote: PLATFORM_ANALYTICS,
    seed: 42, fastTimers: true, mute,
  });
  sessions.push(session);
  return session.page;
}

const getState = (page) => page.evaluate(() => window.QLOBE_DEBUG.getState());
const waitFor = (page, predicate) => page.waitForFunction(predicate, null, { timeout: 9000 });

async function capture(page, name) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images]
    .filter((image) => {
      const rect = image.getBoundingClientRect();
      return image.getAttribute('src') && rect.width > 0 && rect.height > 0
        && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
    })
    .every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0));
  await page.waitForTimeout(1050);
  await page.screenshot({ path: path.join(shots, name) });
}

async function assertTargets(page, label, minimum, ids) {
  const targets = await page.evaluate(() => window.QLOBE_DEBUG.getTargets());
  const failures = [];
  for (const id of ids) {
    const target = targets.find((candidate) => candidate.id === id);
    if (!target) failures.push(`missing:${id}`);
    else if (target.rect.w < minimum || target.rect.h < minimum) {
      failures.push(`${id}:${Math.round(target.rect.w)}x${Math.round(target.rect.h)}`);
    }
  }
  check(`${label} keeps primary targets at least ${minimum}px`, failures.length === 0, failures.join(', '));
}

async function enterTrail(page, mode) {
  await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), mode);
  await waitFor(page, () => window.QLOBE_DEBUG.getState().screen === 'explore');
  await page.evaluate(() => window.QLOBE_DEBUG.tap('follow-trail'));
  await waitFor(page, () => window.QLOBE_DEBUG.getState().screen === 'trail');
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try {
    const page = await openGame(browser, { width: 1180, height: 820 }, 'no-preference', false);
    let current = await getState(page);
    check('boots to the authored texture chooser', current.screen === 'splash', JSON.stringify(current));
    check('preloads every runtime raster', current.artFailures.length === 0, current.artFailures.join(', '));
    const modes = await page.evaluate(() => window.QLOBE_DEBUG.listModes());
    check('registers all four tactile adventures', modes.map(({ id }) => id).join(',') === 'bumpy,smooth,ridged,soft');
    await assertTargets(page, 'landscape splash', 96, ['mode-bumpy', 'mode-smooth', 'mode-ridged', 'mode-soft', 'home']);
    await capture(page, '01-splash-landscape.png');

    await page.locator('[data-target="mode-bumpy"]').click();
    await waitFor(page, () => window.QLOBE_DEBUG.getState().screen === 'explore');
    check('first gesture starts recorded teacher narration', await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog()
      .some((entry) => entry.key === 'bumpyExplore' && entry.kind === 'clip')));
    await assertTargets(page, 'landscape explore', 96, ['texture-sample', 'example-0', 'example-1', 'follow-trail', 'back', 'sound']);
    await capture(page, '02-bumpy-explore-landscape.png');

    await page.locator('[data-target="follow-trail"]').click();
    await waitFor(page, () => window.QLOBE_DEBUG.getState().screen === 'trail');
    await assertTargets(page, 'landscape trail', 96, ['marker-0', 'back', 'sound']);
    await capture(page, '03-bumpy-trail-start.png');

    const markerZero = await page.locator('[data-target="marker-0"]').boundingBox();
    await page.mouse.move(markerZero.x + markerZero.width / 2, markerZero.y + markerZero.height / 2);
    await page.mouse.down();
    await page.evaluate(() => window.dispatchEvent(new PointerEvent('pointercancel', {
      bubbles: true, pointerId: 1, pointerType: 'mouse', isPrimary: true,
    })));
    await page.mouse.up();
    current = await getState(page);
    check('pointer cancellation clears the one-pointer trace safely', !current.dragging && current.screen === 'trail', JSON.stringify(current));

    const markerCenters = await page.evaluate(() => window.QLOBE_DEBUG.getLayout().markers
      .slice(0, 6).map(({ x, y, w, h }) => ({ x: x + w / 2, y: y + h / 2 })));
    await page.mouse.move(markerCenters[0].x, markerCenters[0].y);
    await page.mouse.down();
    for (const point of markerCenters.slice(1)) await page.mouse.move(point.x, point.y, { steps: 5 });
    await page.mouse.up();
    current = await getState(page);
    check('a real drag follows ordered stones through the shared attempt path', current.progress >= 6, JSON.stringify(current));
    await capture(page, '04-bumpy-trail-progress.png');

    await page.evaluate(() => window.QLOBE_DEBUG.completeTrail());
    await waitFor(page, () => window.QLOBE_DEBUG.getState().screen === 'complete');
    current = await getState(page);
    check('Bumpy completes all eleven tactile contacts', current.progress === 11 && current.completedModes.includes('bumpy'), JSON.stringify(current));
    await assertTargets(page, 'completion', 96, ['again', 'next', 'back', 'sound']);
    await capture(page, '05-bumpy-complete.png');

    const replayRoute = current.routeIndex;
    await page.locator('[data-target="again"]').click();
    await waitFor(page, () => window.QLOBE_DEBUG.getState().screen === 'trail');
    current = await getState(page);
    check('Again starts a fresh real trail without a stale completion', current.progress === 0 && current.phase === 'trail');
    check('seeded replay variation stays within reviewed route set', [0, 1].includes(current.routeIndex) && [0, 1].includes(replayRoute));

    for (const mode of ['smooth', 'ridged', 'soft']) {
      await enterTrail(page, mode);
      await page.evaluate(() => window.QLOBE_DEBUG.completeTrail());
      await waitFor(page, () => window.QLOBE_DEBUG.getState().screen === 'complete');
      current = await getState(page);
      check(`${mode} mode reaches its authored celebration`, current.completedModes.includes(mode), JSON.stringify(current));
    }
    const audioLog = await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    check('core narration uses packaged teacher clips', ['bumpyExplore', 'bumpyTrail', 'bumpySuccess', 'smoothSuccess', 'ridgedSuccess', 'softSuccess']
      .every((key) => audioLog.some((entry) => entry.key === key && entry.kind === 'clip')),
    audioLog.map(({ kind, key }) => `${kind}:${key}`).join(' -> '));

    const portrait = await openGame(browser, { width: 820, height: 1180 });
    await assertTargets(portrait, 'portrait splash', 96, ['mode-bumpy', 'mode-smooth', 'mode-ridged', 'mode-soft', 'home']);
    await capture(portrait, '06-splash-portrait.png');
    await portrait.evaluate(() => window.QLOBE_DEBUG.startMode('soft'));
    await capture(portrait, '07-soft-explore-portrait.png');
    await portrait.evaluate(() => window.QLOBE_DEBUG.tap('follow-trail'));
    await waitFor(portrait, () => window.QLOBE_DEBUG.getState().screen === 'trail');
    await assertTargets(portrait, 'portrait trail', 96, ['marker-0', 'back', 'sound']);
    await portrait.evaluate(() => {
      for (let index = 0; index < 5; index += 1) window.QLOBE_DEBUG.tapMarker(index);
    });
    await capture(portrait, '08-soft-trail-portrait.png');
    await portrait.evaluate(() => window.QLOBE_DEBUG.completeTrail());
    await waitFor(portrait, () => window.QLOBE_DEBUG.getState().screen === 'complete');
    await capture(portrait, '09-soft-complete-portrait.png');

    const compact = await openGame(browser, { width: 568, height: 320 });
    await assertTargets(compact, 'compact landscape splash', 96, ['mode-bumpy', 'mode-smooth', 'mode-ridged', 'mode-soft', 'home']);
    await capture(compact, '10-splash-compact.png');
    await compact.evaluate(() => window.QLOBE_DEBUG.startMode('ridged'));
    await waitFor(compact, () => window.QLOBE_DEBUG.getState().screen === 'explore');
    await compact.waitForTimeout(700);
    await assertTargets(compact, 'compact landscape explore', 96, ['example-0', 'example-1', 'follow-trail']);
    check('compact explore art, labels, and action stay visible without overlap', await compact.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      const hero = rect('[data-explore-card]');
      const art = [rect('[data-example-art="0"]'), rect('[data-example-art="1"]')];
      const labels = [
        rect('[data-example="0"] .example-label'),
        rect('[data-example="1"] .example-label'),
      ];
      const follow = rect('[data-target="follow-trail"]');
      const visible = (r) => r && r.width > 0 && r.height > 0
        && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      const overlaps = (a, b) => a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top;
      return [hero, ...art, ...labels, follow].every(visible)
        && !overlaps(hero, art[0]) && !overlaps(hero, art[1])
        && !overlaps(art[0], art[1]) && !overlaps(labels[0], labels[1])
        && !overlaps(labels[0], follow) && !overlaps(labels[1], follow);
    }));
    await capture(compact, '11-ridged-explore-compact.png');
    await compact.evaluate(() => window.QLOBE_DEBUG.tap('follow-trail'));
    await waitFor(compact, () => window.QLOBE_DEBUG.getState().screen === 'trail');
    await assertTargets(compact, 'compact landscape trail', 96, ['marker-0', 'back', 'sound']);
    await capture(compact, '12-ridged-trail-compact.png');
    await compact.evaluate(() => window.QLOBE_DEBUG.completeTrail());
    await waitFor(compact, () => window.QLOBE_DEBUG.getState().screen === 'complete');
    await compact.waitForTimeout(950);
    await assertTargets(compact, 'compact landscape completion', 96, ['again', 'next']);
    check('compact completion reward and controls stay visible without overlap', await compact.evaluate(() => {
      const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
      const controls = ['again', 'next'].map((id) => rect(`[data-target="${id}"]`));
      const reward = rect('[data-complete-medal]');
      const card = rect('.complete-card');
      const visible = (r) => r && r.width > 0 && r.height > 0
        && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight;
      const overlaps = (a, b) => a.right > b.left && b.right > a.left && a.bottom > b.top && b.bottom > a.top;
      return [card, reward, ...controls].every(visible)
        && controls.every((r) => r.width >= 96 && r.height >= 96)
        && !overlaps(reward, card) && controls.every((control) => !overlaps(reward, control));
    }));
    await capture(compact, '13-ridged-complete-compact.png');

    const reduced = await openGame(browser, { width: 1180, height: 620 }, 'reduce');
    await enterTrail(reduced, 'smooth');
    await reduced.evaluate(() => window.QLOBE_DEBUG.completeTrail());
    await waitFor(reduced, () => window.QLOBE_DEBUG.getState().screen === 'complete');
    current = await getState(reduced);
    check('reduced motion preserves semantic completion', current.reducedMotion && current.progress === 11, JSON.stringify(current));
    await capture(reduced, '14-smooth-complete-reduced.png');

    const hubSession = await openSession(browser, {
      url: `${base}/#sensorial-science`, base, viewport: { width: 1180, height: 820 },
      ready: false, allowRemote: PLATFORM_ANALYTICS,
    });
    sessions.push(hubSession);
    const tile = hubSession.page.locator('a.game-card[aria-label^="Texture Trail"]');
    await tile.waitFor({ state: 'visible' });
    const hubImage = tile.locator('img');
    await hubImage.evaluate((node) => { node.loading = 'eager'; });
    await hubSession.page.waitForFunction((node) => node.complete && node.naturalWidth > 0, await hubImage.elementHandle());
    const hubSize = await hubImage.evaluate((node) => ({ width: node.naturalWidth, height: node.naturalHeight }));
    check('hub uses the curated 640x533 catalog tile', hubSize.width === 640 && hubSize.height === 533, JSON.stringify(hubSize));
    await tile.scrollIntoViewIfNeeded();
    await capture(hubSession.page, '00-hub-tile.png');

    for (const session of sessions) {
      session.failed = session.failed.filter((entry) => !PLATFORM_ANALYTICS.some((prefix) => entry.startsWith(prefix)));
      checkSessionClean({ check }, session);
    }

    const css = await readFile(new URL('../css/style.css', import.meta.url), 'utf8');
    const source = await readFile(new URL('../js/main.js', import.meta.url), 'utf8');
    check('CSS does not synthesize primary art with gradients', !/gradient\(/.test(css));
    check('runtime uses no emoji or SVG gameplay substitutes', !/emoji:|<svg|\.svg["']/i.test(source));
    const folders = ['art', 'characters', 'objects', 'world'];
    const files = (await Promise.all(folders.map(async (folder) => (await readdir(new URL(`../assets/${folder}/`, import.meta.url)))
      .map((name) => ({ folder, name }))))).flat();
    const sizes = await Promise.all(files.filter(({ name }) => /\.(?:webp|png|jpe?g)$/i.test(name)).map(async ({ folder, name }) => ({
      file: `${folder}/${name}`,
      size: (await stat(new URL(`../assets/${folder}/${name}`, import.meta.url))).size,
    })));
    check('runtime rasters stay under 300 KB each', sizes.every(({ size }) => size < 300_000), JSON.stringify(sizes.filter(({ size }) => size >= 300_000)));
    note(`visual QC screenshots: ${shots}`);
  } finally {
    for (const session of sessions) await session.context.close().catch(() => {});
    await browser.close();
  }
  finish({ suffix: `; screenshots in ${shots}` });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
