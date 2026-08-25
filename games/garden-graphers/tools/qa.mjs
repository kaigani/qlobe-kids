#!/usr/bin/env node

// Production smoke/visual QA for Garden Graphers.  This deliberately keeps
// the assertions game-local while using the platform's real-Chrome driver.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  args, baseUrl, createReporter, debug, dragBetween, launchChrome,
  openSession, resolveShots, shooter, checkSessionClean,
} from '../../../tools/qa/lib/driver.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const base = baseUrl();
const url = `${base}/games/garden-graphers/`;
const shots = resolveShots(args.flag('shots', path.resolve('artifacts/qa/garden-graphers')));
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true, collapse: true, detailLimit: 1800 });
const { check, note, finish } = reporter;

const keys = Object.keys(JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8')).voice);

async function staticAudit() {
  const required = ['index.html', 'config.js', 'config.json', 'game.json', 'game-design.md', 'ASSETS.md', 'css/style.css', 'js/main.js', 'assets/audio/lines.json', 'assets/audio/manifest.json'];
  for (const file of required) check(`static file exists: ${file}`, await stat(path.join(root, file)).then(() => true, () => false));
  const config = JSON.parse(await readFile(path.join(root, 'config.json'), 'utf8'));
  const game = JSON.parse(await readFile(path.join(root, 'game.json'), 'utf8'));
  const registry = JSON.parse(await readFile(path.resolve(root, '../../games.json'), 'utf8')).games.find((item) => item.id === game.id);
  const lines = JSON.parse(await readFile(path.join(root, 'assets/audio/lines.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(root, 'assets/audio/manifest.json'), 'utf8'));
  check('QLOBE config declares Garden Graphers', config.id === 'garden-graphers' && config.artDirection === 'Watercolor / Storybook');
  check('registry and game.json metadata stay in parity', registry && ['id', 'title', 'category', 'path', 'age', 'status', 'accent'].every((key) => JSON.stringify(registry[key]) === JSON.stringify(game[key])) && JSON.stringify(registry.modes) === JSON.stringify(game.modes));
  check('voice keys are exact between config and lines contract', JSON.stringify(Object.keys(config.voice).sort()) === JSON.stringify(Object.keys(lines).sort()) && JSON.stringify(config.voice) === JSON.stringify(lines));
  const mk = Object.keys(manifest);
  check('voice manifest is all-or-none', mk.length === 0 || (mk.length === keys.length && keys.every((key) => mk.includes(key))), `manifest=${mk.length} required=${keys.length}`);
  const clips = (await readdir(path.join(root, 'assets/audio'))).filter((file) => /\.(?:wav|m4a|flac|mp3)$/i.test(file));
  check('empty voice manifest has no orphan clips', mk.length > 0 || clips.length === 0, clips.join(', '));
  const configured = [...new Set([...Object.values(config.assets), ...config.modes.map((m) => m.asset).filter(Boolean)])];
  const missing = [];
  for (const item of configured) if (!await stat(path.join(root, item.replace(/^\.\//, ''))).then(() => true, () => false)) missing.push(item);
  check('configured raster assets resolve', !missing.length, missing.join(', '));
  check('primary art is raster-only', configured.every((item) => /\.(?:webp|png|jpe?g)$/i.test(item)));
  const html = await readFile(path.join(root, 'index.html'), 'utf8');
  const css = await readFile(path.join(root, 'css/style.css'), 'utf8');
  check('no SVG, canvas, emoji, or CSS-gradient artwork', !/<svg|<canvas|emoji/i.test(html) && !/gradient\(/i.test(css));
  const assets = [];
  async function walk(dir) { for (const e of await readdir(dir, { withFileTypes: true })) { const f = path.join(dir, e.name); if (e.isDirectory() && e.name !== 'source') await walk(f); else if (e.isFile() && /\.(?:webp|png|jpe?g)$/i.test(e.name)) assets.push(f); } }
  await walk(path.join(root, 'assets'));
  const sizes = await Promise.all(assets.map(async (file) => [path.relative(root, file), (await stat(file)).size]));
  check('shipped raster foregrounds stay under 180 KB', sizes.filter(([name]) => !name.includes('bg/')).every(([, bytes]) => bytes <= 180_000), JSON.stringify(Object.fromEntries(sizes.filter(([name]) => !name.includes('bg/')))));
  const hub = await stat(path.resolve(root, '../../assets/hub/tiles/garden-graphers.jpg')).then((s) => s.size, () => 0);
  check('curated hub tile exists and stays under 180 KB', hub > 0 && hub <= 180_000, `${hub} bytes`);
}

async function auditTargets(page, label) {
  const result = await page.evaluate(() => {
    const visible = [...document.querySelectorAll('[data-target]')].filter((n) => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden' && !n.disabled);
    const bad = visible.map((n) => { const r = n.getBoundingClientRect(); const hud = n.classList.contains('qk-hud-btn'); const pseudo = hud ? getComputedStyle(n, '::before') : null; const w = hud ? parseFloat(pseudo.width) || r.width : r.width; const h = hud ? parseFloat(pseudo.height) || r.height : r.height; return { id: n.dataset.target, w, h, x: r.x, y: r.y, right: r.right, bottom: r.bottom }; }).filter((r) => r.w < 96 || r.h < 96 || r.x < -1 || r.y < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1);
    return { bad, overflow: document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1 };
  });
  check(`${label}: targets >=96px, contained, and no document overflow`, !result.bad.length && result.overflow, JSON.stringify(result));
}

async function auditImages(page) {
  const result = await page.evaluate(async () => {
    const config = await fetch('./config.json').then((response) => response.json());
    const urls = [...new Set(Object.values(config.assets))];
    return Promise.all(urls.map((url) => new Promise((resolve) => {
      const image = new Image(); image.onload = () => resolve({ url, ok: image.naturalWidth > 0, width: image.naturalWidth, height: image.naturalHeight }); image.onerror = () => resolve({ url, ok: false }); image.src = url;
    })));
  });
  check('configured rasters decode with non-zero natural dimensions in Chrome', result.every((item) => item.ok && item.width > 0 && item.height > 0), JSON.stringify(result));
}

async function boot(browser, viewport) {
  const session = await openSession(browser, { url, base, viewport, goto: false, ready: false, allowAbortedMedia: true, allowRemote: ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'] });
  await session.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, (route) => route.fulfill({ status: 204, body: '' }));
  await session.page.goto(url, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page); await debug.waitForReady(session.page); await debug.seed(session.page, 7); await debug.fastTimers(session.page, 0.03); await debug.mute(session.page, true);
  return session;
}

async function complete(page, mode) {
  await debug.startMode(page, mode);
  for (let i = 0; i < 3; i += 1) {
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play' && window.QLOBE_DEBUG.getState().awaitingInput);
    const roundId = (await debug.getState(page)).roundId;
    await debug.winRound(page);
    await page.waitForFunction((id) => {
      const state = window.QLOBE_DEBUG.getState();
      return state.screen !== 'play' || state.roundId !== id;
    }, roundId);
  }
  await page.waitForFunction((m) => window.QLOBE_DEBUG.getState().completedModes.includes(m), mode);
}

async function runtime(browser) {
  const viewports = [{ width: 1180, height: 820, label: 'landscape' }, { width: 1180, height: 520, label: 'short-landscape' }, { width: 820, height: 1180, label: 'portrait' }];
  const sessions = [];
  for (const viewport of viewports) {
    const session = await boot(browser, viewport); sessions.push(session); const { page } = session.page ? session : { page: session.page };
    check(`${viewport.label}: QLOBE_DEBUG v1`, await page.evaluate(() => window.QLOBE_DEBUG.version === 1));
    await auditTargets(page, `${viewport.label} splash`);
    if (viewport.label === 'landscape') {
      const og = await boot(browser, { width: 1200, height: 630 });
      await shot(og.page, 'og-source-1200x630');
      await og.close();
    }
    if (viewport.label === 'landscape') {
      await page.locator('[data-target="start"]').click(); await debug.waitForScreen(page, 'menu'); await auditTargets(page, 'menu'); await shot(page, '02-menu');
      await auditImages(page);
      await page.locator('[data-target="mode-sort"]').click(); await debug.waitForInput(page);
      const categoryKeys = await page.locator('.graph-key img').evaluateAll((nodes) => nodes.map((node) => ({ src: node.getAttribute('src'), alt: node.alt })));
      check('graph category keys use distinct labeled rasters, not countable visitor units', categoryKeys.length === 3 && categoryKeys.every(({ src, alt }) => /\/key-(?:bee|butterfly|ladybug)\.webp$/.test(src) && /category label$/.test(alt)), JSON.stringify(categoryKeys));
      const first = page.locator('.visitor-piece').first();
      const firstKind = await first.getAttribute('data-kind');
      const destination = page.locator(`[data-target="column-${firstKind}"]`);
      const a = await first.boundingBox(); const b = await destination.boundingBox();
      if (a && b) await dragBetween(page, a, b, { steps: 8 });
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placedIds.length === 1);
      const second = page.locator('.visitor-piece:not(:disabled)').first();
      const secondKind = await second.getAttribute('data-kind');
      await second.click();
      await page.waitForFunction(() => Boolean(window.QLOBE_DEBUG.getState().selectedVisitor));
      await page.locator(`[data-target="column-${secondKind}"]`).click();
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placedIds.length >= 2);
      await auditTargets(page, 'sort play');
      await shot(page, '03-sort-landscape');
      await complete(page, 'sort'); await page.locator('[data-target="next-page"]').click();
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play' && window.QLOBE_DEBUG.getState().mode === 'count');
      const before = await debug.getState(page);
      const token = page.locator('.graph-token[data-role="correct"]').first();
      const tokenId = await token.getAttribute('data-target');
      const exactToken = page.locator(`[data-target="${tokenId}"]`);
      await exactToken.click();
      const after = await debug.getState(page);
      await exactToken.evaluate((node) => node.click());
      const afterDuplicate = await debug.getState(page);
      check('count duplicate picture click is rejected/disabled', after.countedIds.length === before.countedIds.length + 1 && afterDuplicate.countedIds.length === after.countedIds.length && (await exactToken.isDisabled()));
      await page.locator('.graph-token[data-role="correct"]').evaluateAll((nodes) => nodes.forEach((node) => node.click()));
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().roundIndex >= 1);
      await complete(page, 'count');
      await page.locator('[data-target="next-page"]').click();
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().mode === 'compare');
      const wrong = page.locator('[data-target="column-bee"][data-role="wrong"]').first();
      if (await wrong.count()) await wrong.click();
      check('compare wrong answer keeps the round open', (await debug.getState(page)).awaitingInput === true);
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().roundId === 'compare-1');
      await debug.winRound(page); await page.waitForFunction(() => window.QLOBE_DEBUG.getState().roundId === 'compare-2');
      await debug.winRound(page); await page.waitForFunction(() => window.QLOBE_DEBUG.getState().roundId === 'compare-3');
      const same = page.locator('[data-target^="column-"][data-role="correct"]');
      check('compare same-pair answer uses two real column clicks', await same.count() === 2);
      await same.nth(0).click(); await same.nth(1).click();
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'complete');
      await page.locator('[data-target="next-page"]').click();
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'finale');
      await page.waitForTimeout(900);
      await shot(page, '99-finale');
    }
    if (viewport.label !== 'landscape') {
      await page.locator('[data-target="start"]').click(); await debug.waitForScreen(page, 'menu');
      await page.locator('[data-target="mode-count"]').click(); await debug.waitForInput(page);
      await auditTargets(page, `${viewport.label} count play`);
      await shot(page, `play-${viewport.label}`);
    }
    await shot(page, `viewport-${viewport.label}`);
    checkSessionClean(reporter, session, viewport.label);
  }
  return sessions;
}

await staticAudit();
const browser = await launchChrome();
try { await runtime(browser); } finally { await browser.close(); }
finish();
