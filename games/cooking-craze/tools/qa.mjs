#!/usr/bin/env node
import path from 'node:path';
import { baseUrl, checkSessionClean, createReporter, debug, ensureShots, launchChrome, openSession, resolveShots } from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('/private/tmp/qlobe-cooking-craze-shots');
ensureShots(shots);
const { check, finish } = createReporter({ detailOnFail: true });
const sessions = [];
const PLATFORM_ANALYTICS = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];

async function stubPlatformAnalytics(session) {
  await session.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });
}

async function openGame(browser, viewport, reducedMotion = 'no-preference', mute = true) {
  const s = await openSession(browser, {
    url: `${base}/games/cooking-craze/`, base, viewport, reducedMotion,
    goto: false, ready: false, allowAbortedMedia: true, allowRemote: PLATFORM_ANALYTICS,
  });
  // The platform analytics tag is expected in production. Fulfil it locally in QA
  // so the browser neither exports page metadata nor reports network noise.
  await stubPlatformAnalytics(s);
  await s.page.goto(`${base}/games/cooking-craze/`, { waitUntil: 'networkidle' });
  await s.page.evaluate(() => window.QLOBE_DEBUG.ready);
  await debug.seed(s.page, 42);
  await debug.mute(s.page, mute);
  sessions.push(s); return s;
}
async function openHub(browser) {
  const s = await openSession(browser, {
    url: `${base}/#practical-life`, base, viewport: { width: 1180, height: 820 },
    goto: false, ready: false, allowRemote: PLATFORM_ANALYTICS,
  });
  await stubPlatformAnalytics(s);
  await s.page.goto(`${base}/#practical-life`, { waitUntil: 'networkidle' });
  sessions.push(s); return s;
}
async function shot(page, name) { await page.screenshot({ path: path.join(shots, name) }); }
async function audit(page, label) {
  const a = await page.evaluate(() => ({
    targets: window.QLOBE_DEBUG.getTargets(),
    state: window.QLOBE_DEBUG.getState(),
    viewport: { width: innerWidth, height: innerHeight },
    overflow: document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight,
    scrollReachableIds: [...document.querySelectorAll('.cooking-tray [data-target]')]
      .filter((el) => { const tray = el.closest('.cooking-tray'); return tray && (tray.scrollWidth > tray.clientWidth + 1 || tray.scrollHeight > tray.clientHeight + 1); })
      .map((el) => el.dataset.target),
    hud: [...document.querySelectorAll('.qk-hud-btn')].filter((el) => el.offsetParent !== null).map((el) => {
      const pseudo = getComputedStyle(el, '::before');
      return { id: el.dataset.target, w: parseFloat(pseudo.width), h: parseFloat(pseudo.height) };
    }),
  }));
  const undersized = a.targets.filter(({ id, rect }) => !['home', 'back', 'sound'].includes(id) && (rect.w < 96 || rect.h < 96));
  const outside = a.targets.filter(({ id, rect }) => {
    if (!(rect.x < -1 || rect.y < -1 || rect.x + rect.w > a.viewport.width + 1 || rect.y + rect.h > a.viewport.height + 1)) return false;
    // Ingredient controls may be off-screen only inside a genuinely scrollable tray.
    return !a.scrollReachableIds.includes(id);
  });
  const undersizedHud = a.hud.filter(({ w, h }) => w < 96 || h < 96);
  check(`${label}: targets >=96px, stay visible, and no overflow`, undersized.length === 0 && undersizedHud.length === 0 && outside.length === 0 && a.overflow, JSON.stringify({ undersized, undersizedHud, outside }));
}
async function choose(page, id) { await debug.tap(page, `mode-${id}`); await page.waitForFunction((m) => window.QLOBE_DEBUG.getState().mode === m, id); }
async function spreadSauceWithPointer(page, { capture = true } = {}) {
  const box = await page.locator('[data-target="sauce-surface"]').boundingBox();
  const cells = [[1, 0], [2, 0], [3, 0], [4, 1], [3, 1], [2, 1], [1, 1], [0, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [4, 3], [3, 3], [2, 3], [1, 3], [0, 3], [1, 4], [2, 4], [3, 4]];
  const point = ([x, y]) => ({ x: box.x + (x + .5) * box.width / 5, y: box.y + (y + .5) * box.height / 5 });
  const first = point(cells[0]); await page.mouse.move(first.x, first.y); await page.mouse.down();
  for (const [index, cell] of cells.slice(1).entries()) {
    const next = point(cell); await page.mouse.move(next.x, next.y);
    if (capture && index === 14) await shot(page, '03b-build-sauce-progress.png');
  }
  await page.mouse.up();
}
async function completeBuild(page) {
  await choose(page, 'build');
  await shot(page, '02-build-press.png');
  for (let i = 0; i < 4; i++) await page.locator('[data-target="dough"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'sauce');
  await shot(page, '03-build-sauce.png');
  await spreadSauceWithPointer(page);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'toppings');
  await shot(page, '04-build-toppings.png');
  const kinds = await page.evaluate(() => [...document.querySelectorAll('.pizza-slot')].map((x) => x.dataset.kind));
  for (let i = 0; i < kinds.length; i++) {
    await page.locator(`[data-target="ingredient-${kinds[i]}"]`).click();
    await page.locator(`[data-target="slice-${i}"]`).click();
  }
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'bake');
  await shot(page, '05-build-bake.png');
  const peel = await page.locator('[data-target="peel"]').boundingBox();
  await page.mouse.move(peel.x + peel.width / 2, peel.y + peel.height / 2); await page.mouse.down();
  await page.mouse.move(peel.x + peel.width / 2, peel.y + peel.height / 2 - 100, { steps: 5 }); await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
}
async function main() {
  const browser = await launchChrome();
  try {
    const hubSession = await openHub(browser);
    const hubTile = hubSession.page.locator('a.tile[aria-label*="Cooking Craze"]');
    check('hub lists Cooking Craze exactly once', await hubTile.count() === 1);
    check('hub uses the dedicated Cooking Craze tile', (await hubTile.locator('img').getAttribute('src')) === 'assets/hub/tiles/cooking-craze-v2.jpg');
    await shot(hubSession.page, '00-hub.png');
    await Promise.all([hubSession.page.waitForURL('**/games/cooking-craze/'), hubTile.click()]);
    await hubSession.page.evaluate(() => window.QLOBE_DEBUG.ready);
    check('hub launches the Cooking Craze production route', (await debug.getState(hubSession.page)).screen === 'splash');
    const s = await openGame(browser, { width: 1180, height: 820 }); const { page } = s;
    check('splash and exact title', (await debug.getState(page)).screen === 'splash' && await page.title() === 'Cooking Craze — QLOBE Kids');
    check('three modes available', (await debug.listModes(page)).join(',') === 'build,swirl,quick');
    await audit(page, 'splash'); await shot(page, '01-splash.png');
    await completeBuild(page); check('real-pointer Build reaches end', (await debug.getState(page)).screen === 'end'); await page.waitForTimeout(700); await shot(page, '06-build-end.png');
    await debug.tap(page, 'back'); check('Back returns to splash', (await debug.getState(page)).screen === 'splash');
    await choose(page, 'swirl'); for (let i = 0; i < 4; i++) await page.evaluate(() => window.QLOBE_DEBUG.actions.pat()); await spreadSauceWithPointer(page, { capture: false }); await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end'); check('Swirl completes with real-pointer sauce', true); await page.waitForTimeout(700); await shot(page, '07-swirl-end.png');
    await debug.tap(page, 'back'); await choose(page, 'quick');
    const kinds = await page.evaluate(() => [...document.querySelectorAll('.pizza-slot')].map((x) => x.dataset.kind));
    for (let i = 0; i < kinds.length; i++) await page.evaluate(({ kind, i }) => { window.QLOBE_DEBUG.actions.pickTopping(kind); window.QLOBE_DEBUG.actions.dropOn(i); }, { kind: kinds[i], i });
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'bake'); await page.evaluate(() => window.QLOBE_DEBUG.actions.slideBake()); await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end'); check('Quick completes', true);
    const r = await openGame(browser, { width: 390, height: 844 }, 'reduce'); check('portrait reduced-motion boots', (await debug.getState(r.page)).screen === 'splash'); await audit(r.page, 'portrait reduced-motion splash'); await shot(r.page, '08-portrait-splash-reduced.png');
    await choose(r.page, 'build'); for (let i = 0; i < 4; i++) await r.page.evaluate(() => window.QLOBE_DEBUG.actions.pat()); while ((await debug.getState(r.page)).phase === 'sauce') await r.page.evaluate(() => window.QLOBE_DEBUG.actions.addSauceProgress());
    const portraitSauceCells = (await debug.getState(r.page)).sauceCells;
    check('debug sauce progression uses only the 21 valid round-pizza cells', !portraitSauceCells.some((cell) => ['0-0', '4-0', '0-4', '4-4'].includes(cell)), JSON.stringify(portraitSauceCells));
    await audit(r.page, 'portrait reduced-motion toppings'); await shot(r.page, '09-portrait-toppings-reduced.png');
    // Keyboard-only Build and Quick paths, including sauce, toppings, slots, and bake.
    const keyboard = await openGame(browser, { width: 1024, height: 768 }, 'reduce');
    await keyboard.page.locator('[data-target="mode-build"]').focus(); await keyboard.page.keyboard.press('Enter');
    await keyboard.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'press');
    await keyboard.page.locator('[data-target="dough"]').focus(); for (let i = 0; i < 4; i++) await keyboard.page.keyboard.press(i % 2 ? 'Enter' : 'Space');
    await keyboard.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'sauce');
    const sauce = keyboard.page.locator('[data-target="sauce-surface"]'); await sauce.focus();
    for (let i = 0; i < 30; i++) { await keyboard.page.keyboard.press(i % 2 ? 'Space' : 'Enter'); if ((await debug.getState(keyboard.page)).phase !== 'sauce') break; }
    check('keyboard Enter/Space completes sauce', (await debug.getState(keyboard.page)).phase === 'toppings');
    let keyboardKinds = await keyboard.page.evaluate(() => [...document.querySelectorAll('.pizza-slot')].map((x) => x.dataset.kind));
    for (let i = 0; i < keyboardKinds.length; i++) {
      const ingredient = keyboard.page.locator(`[data-target="ingredient-${keyboardKinds[i]}"]`); await ingredient.focus(); await keyboard.page.keyboard.press(i % 2 ? 'Space' : 'Enter');
      check(`keyboard selects Build topping ${i + 1}`, await ingredient.getAttribute('aria-pressed') === 'true');
      await keyboard.page.locator(`[data-target="slice-${i}"]`).focus(); await keyboard.page.keyboard.press(i % 2 ? 'Enter' : 'Space');
    }
    await keyboard.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'bake'); await keyboard.page.locator('[data-target="peel"]').focus(); await keyboard.page.keyboard.press('Enter'); await keyboard.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
    check('keyboard-only Build reaches end', true);
    await keyboard.page.locator('[data-target="serve"]').focus(); await keyboard.page.keyboard.press('Enter'); await keyboard.page.locator('[data-target="mode-quick"]').focus(); await keyboard.page.keyboard.press('Space');
    await keyboard.page.waitForFunction(() => window.QLOBE_DEBUG.getState().mode === 'quick' && window.QLOBE_DEBUG.getState().phase === 'toppings');
    keyboardKinds = await keyboard.page.evaluate(() => [...document.querySelectorAll('.pizza-slot')].map((x) => x.dataset.kind));
    for (let i = 0; i < keyboardKinds.length; i++) { await keyboard.page.locator(`[data-target="ingredient-${keyboardKinds[i]}"]`).focus(); await keyboard.page.keyboard.press('Enter'); await keyboard.page.locator(`[data-target="slice-${i}"]`).focus(); await keyboard.page.keyboard.press('Space'); }
    await keyboard.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'bake'); await keyboard.page.locator('[data-target="peel"]').focus(); await keyboard.page.keyboard.press('Space'); await keyboard.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
    check('keyboard-only Quick reaches end', true);
    // Short landscape tray reachability and end action sizing.
    const landscape = await openGame(browser, { width: 568, height: 320 }, 'reduce'); await choose(landscape.page, 'build');
    for (let i = 0; i < 4; i++) await landscape.page.locator('[data-target="dough"]').click(); await landscape.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'sauce');
    await spreadSauceWithPointer(landscape.page, { capture: false }); await landscape.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'toppings'); await shot(landscape.page, '10-landscape-toppings.png');
    const rail = await landscape.page.locator('.cooking-tray').evaluate((el) => ({ scrollable: el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1, w: el.clientWidth, h: el.clientHeight, scrollW: el.scrollWidth, scrollH: el.scrollHeight }));
    check('short landscape uses a scrollable ingredient rail', rail.scrollable, JSON.stringify(rail));
    const landscapeKinds = await landscape.page.evaluate(() => [...document.querySelectorAll('.pizza-slot')].map((x) => x.dataset.kind));
    for (let i = 0; i < landscapeKinds.length; i++) { const ingredient = landscape.page.locator(`[data-target="ingredient-${landscapeKinds[i]}"]`); await ingredient.scrollIntoViewIfNeeded(); check(`landscape ingredient ${i + 1} reachable`, await ingredient.isVisible()); await ingredient.click(); await landscape.page.locator(`[data-target="slice-${i}"]`).click(); }
    await landscape.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'bake'); await shot(landscape.page, '11-landscape-bake.png'); await landscape.page.evaluate(() => window.QLOBE_DEBUG.actions.slideBake()); await landscape.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end'); await audit(landscape.page, 'short landscape end'); await shot(landscape.page, '12-landscape-end.png');
    const compact = await openGame(browser, { width: 320, height: 568 }, 'reduce'); await choose(compact.page, 'quick');
    const compactKinds = await compact.page.evaluate(() => [...document.querySelectorAll('.pizza-slot')].map((x) => x.dataset.kind));
    for (let i = 0; i < compactKinds.length; i++) await compact.page.evaluate(({ kind, i }) => { window.QLOBE_DEBUG.actions.pickTopping(kind); window.QLOBE_DEBUG.actions.dropOn(i); }, { kind: compactKinds[i], i });
    await compact.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'bake'); await compact.page.evaluate(() => window.QLOBE_DEBUG.actions.slideBake()); await compact.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end'); await audit(compact.page, 'compact portrait end'); await shot(compact.page, '13-portrait-end.png');
    const audioSession = await openGame(browser, { width: 1024, height: 768 }, 'reduce', false);
    const audioPage = audioSession.page;
    const clipCoverage = await audioPage.evaluate(async () => {
      const manifest = await fetch('./assets/audio/manifest.json').then((response) => response.json());
      const lines = await fetch('./assets/audio/lines.json').then((response) => response.json());
      const clips = await import('../../../shared/js/voice-clips.js');
      window.__cookingClipStarts = [];
      clips.onClip((key) => window.__cookingClipStarts.push(key));
      window.QLOBE_DEBUG.clearAudioLog();
      const audioContext = new AudioContext();
      const decoded = await Promise.all(Object.entries(manifest).map(async ([key, entry]) => {
        try {
          const response = await fetch(`./assets/audio/${entry.file}`); if (!response.ok) return { key, ok: false, reason: `HTTP ${response.status}` };
          const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
          return { key, ok: Number.isFinite(buffer.duration) && buffer.duration > 0, duration: buffer.duration };
        } catch (error) { return { key, ok: false, reason: String(error) }; }
      }));
      await audioContext.close();
      return {
        manifest: Object.keys(manifest), lines: Object.keys(lines),
        valid: Object.values(manifest).every((entry) => entry.file && entry.dur > 0 && entry.textHash),
        decoded,
      };
    });
    check('all 21 narration lines have packaged clips', clipCoverage.manifest.length === 21 && clipCoverage.lines.length === 21 && clipCoverage.valid, JSON.stringify(clipCoverage));
    check('all 21 packaged narration clips decode in Chrome', clipCoverage.decoded.length === 21 && clipCoverage.decoded.every((entry) => entry.ok), JSON.stringify(clipCoverage.decoded));
    await audioPage.locator('[data-target="mode-build"]').click();
    await audioPage.waitForFunction(() => window.__cookingClipStarts.includes('build-intro'));
    const audioLog = await audioPage.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
    check('first real mode gesture starts the corrected recorded Build prompt', audioLog.some((entry) => entry.key === 'build-intro' && entry.kind === 'clip' && entry.text === "Let's make a rainbow pizza!"), JSON.stringify(audioLog));
    for (const [index, session] of sessions.entries()) checkSessionClean({ check }, session, `session ${index + 1}`);
    finish();
  } finally { await Promise.all(sessions.map((s) => s.context.close())); await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
