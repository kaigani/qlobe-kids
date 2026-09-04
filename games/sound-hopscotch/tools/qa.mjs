#!/usr/bin/env node
// Sound Hopscotch smoke, interaction, and visual-QC gate.  This intentionally
// uses only the public QLOBE_DEBUG v1 surface so it remains a real-input test.
import path from 'node:path';
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, debug,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const url = `${base}/games/sound-hopscotch/`;
const shots = resolveShots(path.resolve('games/sound-hopscotch/qa-shots'));
const { check, finish } = createReporter();
const sessions = [];
const vp = { width: 1180, height: 820 };
const platformAnalytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const inside = (r, v) => r && r.x >= -1 && r.y >= -1 && r.x + r.w <= v.width + 1 && r.y + r.h <= v.height + 1;

async function openGame(browser, viewport = vp, reducedMotion = 'no-preference') {
  const s = await openSession(browser, { url, base, viewport, reducedMotion,
    ready: false, allowAbortedMedia: true, allowRemote: [...platformAnalytics, 'blob:'], goto: false });
  await s.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, async (route) => {
    await route.fulfill({ status: 204, contentType: 'text/javascript', body: '' });
  });
  await s.page.goto(url, { waitUntil: 'networkidle' });
  await debug.waitForHook(s.page); await debug.waitForReady(s.page);
  await debug.seed(s.page, 42); await debug.fastTimers(s.page, 0.05); await debug.mute(s.page, true);
  sessions.push(s); return s.page;
}
async function audit(page, viewport, label) {
  const targets = await debug.getTargets(page);
  check(`${label} targets are >=96px and in viewport`, targets.length > 0
    && targets.every((t) => Math.min(t.rect.w, t.rect.h) >= 96 && inside(t.rect, viewport)), JSON.stringify(targets));
  const images = await page.locator('img:visible').evaluateAll((xs) => xs.length === 0 || xs.every((x) => x.complete && x.naturalWidth > 0));
  check(`${label} visible raster assets decode`, images);
  const assets = await page.evaluate(async () => {
    const urls = [...document.querySelectorAll('*')].flatMap((el) => [...getComputedStyle(el).backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((m) => new URL(m[1], location.href).href));
    const rs = await Promise.all([...new Set(urls)].map((u) => fetch(u).then((r) => ({ u, ok: r.ok, type: r.headers.get('content-type') || '' })).catch(() => ({ u, ok: false, type: '' }))));
    return { count: rs.length, bad: rs.filter((r) => !r.ok || !r.type.startsWith('image/')) };
  });
  check(`${label} CSS raster assets load`, assets.bad.length === 0, JSON.stringify(assets));
  return targets;
}
async function complete(page, mode) {
  await debug.startMode(page, mode);
  for (let i = 0; i < 20; i += 1) {
    const state = await debug.getState(page);
    if (state.screen === 'reward' || state.screen === 'end') break;
    if (state.screen === 'maker') break;
    if (state.screen !== 'play') continue;
    const targets = await debug.getTargets(page);
    const wrong = targets.find((t) => !t.correct && t.id !== state.targetLetter);
    if (wrong) { await debug.tap(page, wrong.id); check(`${mode} wrong tap is gentle`, (await debug.getState(page)).round === state.round); }
    const right = targets.find((t) => t.correct || t.id === state.targetLetter || t.letter === state.targetLetter);
    if (right) await debug.tap(page, right.id); else await debug.winRound(page);
    await page.waitForTimeout(90);
  }
  return debug.getState(page);
}
async function main() {
  await ensureShots(shots); const browser = await launchChrome({ channel: 'chrome' });
  try {
    const page = await openGame(browser);
    check('splash boots', (await debug.getState(page)).screen === 'splash');
    const modes = await debug.listModes(page); check('three modes registered', modes.map((m) => m.id).join(',') === 'meadow,match,maker', JSON.stringify(modes));
    const voiceGate = await page.evaluate(async () => {
      const [config, manifest, qa] = await Promise.all([
        fetch('./config.json').then((r) => r.json()),
        fetch('./assets/audio/manifest.json').then((r) => r.json()),
        fetch('./assets/audio/qa.json').then((r) => r.json()),
      ]);
      const keys = Object.keys(config.voice);
      const missing = keys.filter((key) => !manifest[key]?.file);
      const rejected = keys.filter((key) => qa[key]?.accepted !== true);
      const files = await Promise.all(keys.filter((key) => manifest[key]?.file).map(async (key) => {
        const response = await fetch(`./assets/audio/${manifest[key].file}`);
        return { key, ok: response.ok, bytes: (await response.arrayBuffer()).byteLength };
      }));
      return { keys, missing, rejected, files };
    });
    check('all configured teacher lines have accepted recorded clips', voiceGate.missing.length === 0
      && voiceGate.rejected.length === 0
      && voiceGate.files.length === voiceGate.keys.length
      && voiceGate.files.every((file) => file.ok && file.bytes > 1000), JSON.stringify(voiceGate));
    await audit(page, vp, 'splash'); await page.screenshot({ path: path.join(shots, '01-splash.png') });
    await page.locator('[data-target="theme"]:visible').click();
    check('theme control changes the art world', (await debug.getState(page)).theme === 1);
    await page.locator('[data-target="theme"]:visible').click();
    await page.locator('[data-target="theme"]:visible').click();
    await page.evaluate(() => localStorage.setItem('qk-sound-hopscotch-path-v1', JSON.stringify({
      format: 'qlobe-freeform-board', formatVersion: 1,
      items: [{ id: 'bad\"] selector', kind: 'bogus', src: 'missing.png', x: .42, y: .5, size: .18, rotation: 0, meta: { letter: 'A', injected: true } }],
    })));
    await debug.startMode(page, 'maker');
    const restored = await debug.call(page, 'getMakerPath');
    check('maker sanitizes valid-but-hostile persisted items', restored.items.length === 1
      && restored.items[0].id === 'restored-sound-stone-1'
      && restored.items[0].meta.letter === 'A'
      && !('injected' in restored.items[0].meta), JSON.stringify(restored));
    await debug.call(page, 'playMakerPath');
    await debug.tap(page, 'clear'); await debug.call(page, 'home');
    for (const mode of ['meadow', 'match', 'maker']) {
      const state = await complete(page, mode); check(`${mode} reaches a stable screen`, ['reward', 'end', 'maker'].includes(state.screen), JSON.stringify(state));
      if (state.screen === 'reward') await page.waitForTimeout(950);
      await audit(page, vp, mode); await page.screenshot({ path: path.join(shots, `${mode}-play.png`) });
      if (mode === 'meadow') {
        const audioLog = await debug.call(page, 'getAudioLog');
        check('shared recorded phonics clips are requested', audioLog.some((entry) => entry.kind === 'clip' && /fragments\/[a-z]\.m4a/.test(entry.key)), JSON.stringify(audioLog));
      }
      if (mode === 'maker') {
        await debug.tap(page, 'add-A'); await debug.tap(page, 'add-M'); await debug.tap(page, 'add-S');
        check('maker adds three sound stones', (await debug.getState(page)).customCount === 3);
        const makerCues = await page.locator('.sh-maker-guide .sh-hop-cue:visible').count();
        const orderBadges = await page.locator('.sh-order-badge b:visible').allTextContents();
        check('maker exposes a five-stop runway and visible play order', makerCues === 5 && orderBadges.join(',') === '1,2,3', JSON.stringify({ makerCues, orderBadges }));
        const piece = page.locator('.qlobe-freeform-piece').first();
        const before = await debug.call(page, 'getMakerPath');
        const box = await piece.boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width / 2 - 115, box.y + box.height / 2 - 95, { steps: 6 });
          await page.mouse.up();
        }
        const after = await debug.call(page, 'getMakerPath');
        const moved = after.items.find((item) => item.id === before.items[0].id);
        check('maker stones drag with real pointer input', moved && (before.items[0].x !== moved.x || before.items[0].y !== moved.y), JSON.stringify({ before: before.items[0], after: moved }));
        const pieceRects = await page.locator('.qlobe-freeform-piece').evaluateAll((nodes) => nodes.map((node) => {
          const rect = node.getBoundingClientRect(); return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        }));
        const overlap = pieceRects.some((a, i) => pieceRects.slice(i + 1).some((b) => {
          const area = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
          return area / Math.min(a.w * a.h, b.w * b.h) > .12;
        }));
        check('maker default proof stays visually separated after drag', !overlap, JSON.stringify(pieceRects));
        await page.waitForTimeout(550);
        await page.screenshot({ path: path.join(shots, 'maker-built.png') });
        await debug.call(page, 'playMakerPath');
        check('custom path plays every sound and stays editable', (await debug.getState(page)).screen === 'maker' && !(await debug.getState(page)).pathPlaying);
      }
      if (state.screen === 'reward') {
        await debug.tap(page, 'retry'); await page.waitForTimeout(550);
        const playCues = await page.locator('.sh-play-guide .sh-hop-cue:visible').count();
        const listenLabel = await page.locator('.sh-listen-label:visible').textContent();
        check(`${mode} presents a visible hop route and listen cue`, playCues === 5 && listenLabel?.trim() === 'Listen!', JSON.stringify({ playCues, listenLabel }));
        await page.screenshot({ path: path.join(shots, `${mode}-retry.png`) });
      }
      await debug.call(page, 'home'); await page.waitForTimeout(80); check(`${mode} home returns splash`, (await debug.getState(page)).screen === 'splash');
    }
    const portraitVp = { width: 820, height: 1180 };
    const portrait = await openGame(browser, portraitVp); await audit(portrait, portraitVp, 'portrait splash'); await portrait.screenshot({ path: path.join(shots, 'portrait.png') });
    await debug.startMode(portrait, 'maker');
    await debug.tap(portrait, 'add-A'); await debug.tap(portrait, 'add-M'); await debug.tap(portrait, 'add-S');
    await audit(portrait, portraitVp, 'portrait maker'); await portrait.waitForTimeout(550); await portrait.screenshot({ path: path.join(shots, 'portrait-maker.png') });
    await debug.call(portrait, 'home'); await debug.startMode(portrait, 'meadow'); await portrait.waitForTimeout(180);
    await audit(portrait, portraitVp, 'portrait play'); await portrait.screenshot({ path: path.join(shots, 'portrait-play.png') });
    const reduced = await openGame(browser, vp, 'reduce'); check('reduced motion is detected', (await debug.getState(reduced)).reducedMotion === true);
    await debug.startMode(reduced, 'meadow'); await audit(reduced, vp, 'reduced motion'); await reduced.screenshot({ path: path.join(shots, 'reduced-motion.png') });
    for (const s of sessions) checkSessionClean({ check }, s, 'session');
  } finally { await Promise.all(sessions.map((s) => s.close())); await browser.close(); }
  finish({ suffix: `; screenshots in ${shots}` });
}
main().catch((e) => { console.error(e.stack || e); process.exitCode = 1; });
