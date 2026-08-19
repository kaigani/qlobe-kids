#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { args, launchChrome, createReporter, resolveShots, ensureShots, shooter } from '../../../tools/qa/lib/driver.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const BASE = (args.flag('base', process.env.QLOBE_BASE || 'http://127.0.0.1:8000')).replace(/\/$/, '');
const URL = `${BASE}/games/bean-sprout-watch/`;
const config = JSON.parse(readFileSync(path.join(GAME, 'config.json'), 'utf8'));
const PLATFORM_ANALYTICS = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const { check, finish } = createReporter({ style: 'pad' });
const shot = shooter(resolveShots(path.join(GAME, 'qa-shots')));

async function open(browser, viewport, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ viewport, reducedMotion });
  const page = await context.newPage();
  const errors = [], remote = [], failed = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', r => {
    if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')
      && !PLATFORM_ANALYTICS.some(prefix => r.url().startsWith(prefix))) remote.push(r.url());
  });
  page.on('response', r => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  return { page, context, errors, remote, failed };
}
const state = page => page.evaluate(() => window.QLOBE_DEBUG.getState());
async function tap(page, id) { return page.evaluate(id => window.QLOBE_DEBUG.tap(id), id); }
async function drawNormalized(page, paths, wobble = 0) {
  const box = await page.locator('[data-trace]').boundingBox();
  if (!box) throw new Error('trace canvas has no bounding box');
  for (const pathPoints of paths) {
    const points = [];
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const [ax, ay] = pathPoints[i], [bx, by] = pathPoints[i + 1];
      for (let step = 0; step < 7; step++) {
        const t = step / 7;
        const drift = wobble ? (i % 2 ? -wobble : wobble) * Math.sin(Math.PI * t) : 0;
        points.push({ x: box.x + (ax + (bx - ax) * t + drift) * box.width, y: box.y + (ay + (by - ay) * t) * box.height });
      }
    }
    const [x, y] = pathPoints.at(-1);
    points.push({ x: box.x + x * box.width, y: box.y + y * box.height });
    await page.mouse.move(points[0].x, points[0].y);
    await page.mouse.down();
    for (const point of points.slice(1)) await page.mouse.move(point.x, point.y);
    await page.mouse.up();
  }
}
async function beginCareDrag(page, kind, captureName = '') {
  const card = page.locator(`[data-care="${kind}"]`);
  const zone = page.locator('[data-plant-stage]');
  const from = await card.boundingBox();
  const to = await zone.boundingBox();
  const start = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const finish = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 12, start.y + 8);
  await page.waitForSelector('.care-drag-ghost');
  const ghostVisible = await page.evaluate(() => {
    const node = document.querySelector('.care-drag-ghost');
    return Boolean(node && Number.parseFloat(getComputedStyle(node).opacity) > 0.5);
  });
  if (captureName) await shot(page, captureName);
  return { finish: { x: to.x + to.width / 2, y: to.y + to.height / 2 }, ghostVisible };
}
async function dragCare(page, kind, captureName = '') {
  const { finish, ghostVisible } = await beginCareDrag(page, kind, captureName);
  await page.mouse.move(finish.x, finish.y, { steps: 8 });
  await page.mouse.up();
  return ghostVisible;
}
async function cancelCareDrag(page, kind) {
  const card = page.locator(`[data-care="${kind}"]`).first();
  const box = await card.boundingBox();
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await card.dispatchEvent('pointerdown', { pointerId: 77, isPrimary: true, clientX: point.x, clientY: point.y });
  await card.dispatchEvent('pointermove', { pointerId: 77, isPrimary: true, clientX: point.x + 12, clientY: point.y + 8 });
  const ghostStarted = await page.locator('.care-drag-ghost').count() === 1;
  await card.dispatchEvent('pointercancel', { pointerId: 77, isPrimary: true, clientX: point.x + 12, clientY: point.y + 8 });
  return { ghostStarted, ghostCleared: await page.locator('.care-drag-ghost').count() === 0 };
}
async function clickCare(page, kind) {
  const box = await page.locator(`[data-care="${kind}"]`).boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function main() {
  await ensureShots(resolveShots(path.join(GAME, 'qa-shots')));
  const browser = await launchChrome({ channel: args.flag('channel', 'chrome') });
  try {
    const run = await open(browser, { width: 1180, height: 820 }); const { page } = run;
    await shot(page, '01-splash-landscape.png');
    check('splash boots', (await state(page)).screen === 'splash');
    check('one mode registered', (await page.evaluate(() => window.QLOBE_DEBUG.listModes().length)) === 1);
    const imgs = await page.locator('img').evaluateAll(es => es.map(e => ({ src: e.currentSrc || e.src, ok: e.complete && e.naturalWidth > 0 && e.naturalHeight > 0 })));
    check('configured images load', imgs.length > 0 && imgs.every(i => i.ok));
    check('five day controls', await page.locator('[data-day]').count() === 5);
    check('day controls are touch-sized', await page.locator('[data-day]').evaluateAll(es => es.every(e => { const r=e.getBoundingClientRect(); return r.width >= 96 && r.height >= 96; })));
    const beforeGesture = await state(page);
    check('audio waits for a real gesture', beforeGesture.music.playing === false
      && (await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog())).length === 0);
    await page.evaluate(async () => {
      const voice = await import('/shared/js/voice-clips.js');
      window.__beanVoiceQa = { channel: null, keys: [] };
      voice.onClip((key, channel) => {
        window.__beanVoiceQa.channel = channel;
        window.__beanVoiceQa.keys.push(key);
      });
    });
    const firstDayBox = await page.locator('[data-day="1"]').boundingBox();
    await page.mouse.click(firstDayBox.x + firstDayBox.width / 2, firstDayBox.y + firstDayBox.height / 2);
    await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some(entry => entry.kind === 'clip' && entry.key === 'day-1-intro'));
    await page.waitForFunction(() => {
      const channel = window.__beanVoiceQa?.channel;
      return window.__beanVoiceQa?.keys.includes('day-1-intro')
        && channel?.played?.length && channel.played.end(channel.played.length - 1) > 0;
    });
    const recordedPlayback = await page.evaluate(() => {
      const channel = window.__beanVoiceQa.channel;
      return {
        src: channel.currentSrc || channel.src || '',
        played: channel.played.length ? channel.played.end(channel.played.length - 1) : 0,
        duration: Number.isFinite(channel.duration) ? channel.duration : 0,
        muted: channel.muted,
        error: channel.error?.code || null,
      };
    });
    check('recorded teacher media actually plays after the first gesture',
      recordedPlayback.src.includes('/day-1-intro.m4a') && recordedPlayback.played > 0
      && recordedPlayback.duration > .35 && recordedPlayback.muted === false
      && recordedPlayback.error === null && (await state(page)).music.playing === true,
      JSON.stringify(recordedPlayback));
    await page.evaluate(async () => {
      const voice = await import('/shared/js/voice-clips.js');
      void voice.say('__qa-missing-recording', 'The garden fallback is ready.');
    });
    await page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog()
      .some(entry => entry.kind === 'speech' && entry.key === '__qa-missing-recording'));
    check('missing recording uses the Web Speech fallback',
      (await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog()))
        .some(entry => entry.kind === 'speech' && entry.key === '__qa-missing-recording'));
    await page.evaluate(async () => { (await import('/shared/js/voice-clips.js')).stop(); });
    await tap(page, 'back');
    await page.evaluate(() => window.QLOBE_DEBUG.clearAudioLog());
    await page.evaluate((storageKey) => localStorage.setItem(storageKey, '{not valid json'), config.storageKey);
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.QLOBE_DEBUG.ready);
    check('corrupted local save recovers safely',
      (await state(page)).screen === 'splash' && (await state(page)).completedDays.length === 0);
    await page.evaluate(() => window.QLOBE_DEBUG.clearSaved());
    check('future day rejects', (await page.evaluate(() => window.QLOBE_DEBUG.selectDay(5))).accepted === false);
    await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
    check('start current day', (await page.evaluate(() => window.QLOBE_DEBUG.startMode('sprout-week'))).accepted === true);
    await shot(page, '02-play-landscape.png');
    check('water card has tap and drag instructions', (await page.locator('[data-care="water"]').getAttribute('aria-label')).includes('tapping or dragging'));
    const canceledCare = await cancelCareDrag(page, 'sun');
    check('cancelled care drag clears ghost and source state', canceledCare.ghostStarted && canceledCare.ghostCleared
      && !(await state(page)).watered && !(await state(page)).sunned);
    const waterGhost = await dragCare(page, 'water', '09-care-drag-landscape.png');
    check('water card drags with a semi-transparent ghost', waterGhost && (await state(page)).watered);
    await clickCare(page, 'sun');
    check('water and sun accepted by drag plus tap', (await state(page)).watered && (await state(page)).sunned);
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'trace');
    await shot(page, '03-play-trace-landscape.png');
    const guides = config.days[0].guides;
    const traceCanvas = page.locator('[data-trace]');
    const traceBox = await traceCanvas.boundingBox();
    await traceCanvas.dispatchEvent('pointerdown', { pointerId: 31, isPrimary: true, clientX: traceBox.x + 20, clientY: traceBox.y + 20 });
    await traceCanvas.dispatchEvent('pointermove', { pointerId: 31, isPrimary: true, clientX: traceBox.x + 45, clientY: traceBox.y + 45 });
    await traceCanvas.dispatchEvent('pointercancel', { pointerId: 31, isPrimary: true });
    check('pointer cancel discards an unfinished stroke', (await state(page)).traceStrokes.length === 0);
    await page.setViewportSize({ width: 1000, height: 760 });
    await page.setViewportSize({ width: 1180, height: 820 });
    check('orientation-style resize preserves trace state', (await state(page)).phase === 'trace' && (await state(page)).traceCanvasControllers === 1);
    await drawNormalized(page, guides, .018);
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
    check('loose real-pointer guide trace completes', (await state(page)).screen === 'reward');
    check('reward reached', (await state(page)).screen === 'reward');
    await shot(page, '04-reward-landscape.png');
    check('day persisted', (await state(page)).completedDays.includes(1));
    await tap(page, 'next-day'); check('next day returns journal', (await state(page)).screen === 'splash');
    await page.reload({ waitUntil: 'networkidle' });
    await page.evaluate(() => window.QLOBE_DEBUG.ready);
    await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
    check('saved journal survives reload', (await state(page)).completedDays.includes(1) && (await state(page)).screen === 'splash');
    const pointerPlayedDays = [];
    while ((await state(page)).completedDays.length < 5) {
      const day = (await state(page)).completedDays.length + 1;
      let started = await page.evaluate(() => window.QLOBE_DEBUG.startMode('sprout-week'));
      if (!started.accepted) throw new Error(`Day ${day} did not start: ${JSON.stringify(started)}`);
      if (day % 2) { await tap(page, 'water'); await tap(page, 'sun'); }
      else {
        if (day === 2) {
          await beginCareDrag(page, 'sun');
          await tap(page, 'back');
          await page.mouse.up();
          check('screen exit clears an active care drag', (await state(page)).screen === 'splash'
            && await page.locator('.care-drag-ghost').count() === 0);
          started = await page.evaluate(() => window.QLOBE_DEBUG.startMode('sprout-week'));
        }
        const sunGhost = await dragCare(page, 'sun');
        if (!sunGhost) throw new Error(`Day ${day} sunshine ghost did not appear`);
        await tap(page, 'water');
      }
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'trace');
      await drawNormalized(page, config.days[day - 1].guides, .012);
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
      const rewarded = await state(page);
      if (!rewarded.completedDays.includes(day) || rewarded.traceCanvasControllers !== 0) {
        throw new Error(`Day ${day} reward did not cleanly commit: ${JSON.stringify(rewarded)}`);
      }
      pointerPlayedDays.push(day);
      await tap(page, day < 5 ? 'next-day' : 'my-journal');
    }
    check('days 2–5 complete through fresh real-pointer controllers', pointerPlayedDays.join(',') === '2,3,4,5');
    check('all five days complete', (await state(page)).completedDays.length === 5 && (await state(page)).screen === 'complete');
    await shot(page, '05-complete-landscape.png');
    await tap(page, 'grow-again'); await tap(page, 'grow-again');
    check('grow again resets', (await state(page)).completedDays.length === 0 && (await state(page)).screen === 'splash');
    await page.evaluate(() => window.QLOBE_DEBUG.startMode('sprout-week'));
    await tap(page, 'water'); await tap(page, 'sun');
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'trace');
    const dotBox = await page.locator('[data-trace]').boundingBox();
    await page.mouse.click(dotBox.x + dotBox.width / 2, dotBox.y + dotBox.height / 2);
    check('real pointer dot does not complete', (await state(page)).screen === 'play' && (await state(page)).traceProgress.meaningfulStrokes === 0);
    await tap(page, 'back');
    check('back during trace destroys controller', (await state(page)).screen === 'splash' && (await state(page)).traceCanvasControllers === 0);
    check('landscape clean', run.errors.length === 0 && run.remote.length === 0 && run.failed.length === 0,
      JSON.stringify({ errors: run.errors, remote: run.remote, failed: run.failed }));
    await run.context.close();
    const portrait = await open(browser, { width: 820, height: 1180 }, 'reduce');
    await shot(portrait.page, '06-splash-portrait.png');
    await portrait.page.evaluate(() => window.QLOBE_DEBUG.mute(true));
    await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('sprout-week'));
    await tap(portrait.page, 'water'); await tap(portrait.page, 'sun');
    await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'trace');
    await shot(portrait.page, '07-play-portrait.png');
    await drawNormalized(portrait.page, config.days[0].guides, .012);
    await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
    check('portrait reduced-motion real trace reaches reward', (await state(portrait.page)).screen === 'reward');
    check('portrait reduced-motion clean', portrait.errors.length === 0 && portrait.remote.length === 0 && portrait.failed.length === 0,
      JSON.stringify({ errors: portrait.errors, remote: portrait.remote, failed: portrait.failed }));
    await portrait.context.close();

    const narrow = await open(browser, { width: 390, height: 844 }, 'reduce');
    await narrow.page.evaluate(() => window.QLOBE_DEBUG.restore({
      screen: 'complete', selectedDay: 5,
      saveState: { version: 1, completedDays: [1,2,3,4,5], badges: [1,2,3,4,5], lastVisitedAt: 0 },
    }));
    const narrowCards = await narrow.page.locator('.complete-journal [data-day]').evaluateAll(es => es.map(e => { const r=e.getBoundingClientRect(); return { w:r.width, h:r.height, right:r.right }; }));
    check('390px completed journal keeps replay cards touch-sized and on-screen',
      narrowCards.length === 5 && narrowCards.every(r => r.w >= 96 && r.h >= 96 && r.right <= 390));
    const narrowControls = await narrow.page.evaluate(() => {
      const rect = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r && { left:r.left, top:r.top, right:r.right, bottom:r.bottom, width:r.width, height:r.height }; };
      return { watch:rect('[data-target="watch-grow"]'), reset:rect('[data-target="grow-again"]'), sound:rect('[data-qk-screen="complete"] [data-target="sound"]') };
    });
    const intersects = (a, b) => a && b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    check('390px completion actions stay visible and clear of the sound control',
      [narrowControls.watch, narrowControls.reset].every(r => r && r.width >= 96 && r.height >= 68 && r.left >= 0 && r.right <= 390 && r.top >= 0 && r.bottom <= 844)
      && !intersects(narrowControls.watch, narrowControls.sound) && !intersects(narrowControls.reset, narrowControls.sound), JSON.stringify(narrowControls));
    await shot(narrow.page, '08-complete-narrow.png');
    check('narrow completed journal clean', narrow.errors.length === 0 && narrow.remote.length === 0 && narrow.failed.length === 0,
      JSON.stringify({ errors: narrow.errors, remote: narrow.remote, failed: narrow.failed }));
    await narrow.context.close();

    const accessible = await open(browser, { width: 1180, height: 820 }, 'reduce');
    await accessible.page.evaluate(() => window.QLOBE_DEBUG.mute(true));
    const assistedDays = [];
    for (let day = 1; day <= 5; day += 1) {
      const prior = Array.from({ length: day - 1 }, (_, index) => index + 1);
      await accessible.page.evaluate(({ dayNumber, completed }) => window.QLOBE_DEBUG.restore({
        screen: 'splash', selectedDay: dayNumber,
        saveState: { version: 1, completedDays: completed, badges: completed, lastVisitedAt: 0 },
      }), { dayNumber: day, completed: prior });
      const dayButton = accessible.page.locator(`[data-day="${day}"]`);
      await dayButton.focus();
      await dayButton.press('Enter');
      await accessible.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'play');
      if (day === 1) {
        check('inactive trace canvas is not exposed as an actionable target',
          await accessible.page.locator('[data-target="trace-canvas"]').count() === 0);
      }
      const water = accessible.page.locator('[data-care="water"]');
      const sun = accessible.page.locator('[data-care="sun"]');
      await water.focus(); await water.press('Enter');
      await sun.focus(); await sun.press('Enter');
      await accessible.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'trace');
      const canvas = accessible.page.locator('[data-trace]');
      const semantics = await canvas.evaluate(node => ({
        role: node.getAttribute('role'), tabIndex: node.tabIndex,
        label: node.getAttribute('aria-label'), shortcuts: node.getAttribute('aria-keyshortcuts'),
      }));
      if (semantics.role !== 'button' || semantics.tabIndex !== 0 || !semantics.label
        || semantics.shortcuts !== 'Enter Space') {
        throw new Error(`Day ${day} trace semantics are incomplete: ${JSON.stringify(semantics)}`);
      }
      await canvas.focus();
      if (day === 5) {
        await canvas.dispatchEvent('click', { detail: 0 });
      } else {
        await canvas.press(day % 2 ? 'Enter' : 'Space');
      }
      await accessible.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'reward');
      const assisted = await state(accessible.page);
      if (!assisted.completedDays.includes(day) || assisted.traceCanvasControllers !== 0) {
        throw new Error(`Day ${day} keyboard/switch completion failed: ${JSON.stringify(assisted)}`);
      }
      assistedDays.push(day);
    }
    check('all five trace states complete by keyboard or switch activation', assistedDays.join(',') === '1,2,3,4,5');
    check('keyboard and switch trace route is clean',
      accessible.errors.length === 0 && accessible.remote.length === 0 && accessible.failed.length === 0,
      JSON.stringify({ errors: accessible.errors, remote: accessible.remote, failed: accessible.failed }));
    await accessible.context.close();
  } finally { await browser.close(); }
  finish();
}
main().catch(e => { console.error(e); process.exitCode = 1; });
