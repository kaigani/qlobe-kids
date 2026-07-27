#!/usr/bin/env node
// Real-Chrome smoke + visual-QC driver for Puppet Retell.

import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = argv.indexOf(`--${name}`);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};
const base = flag('base', 'http://127.0.0.1:4173');
const url = `${base.replace(/\/$/, '')}/games/puppet-retell/`;
const shots = path.resolve(flag('shots', 'qa-shots/puppet-retell'));
const playwrightRoot = flag('playwright', '/private/tmp/pw/node_modules');
const require = createRequire(path.join(playwrightRoot, 'noop.js'));
const { chromium } = require('playwright');

const results = [];
function check(name, value, detail = '') {
  const ok = !!value;
  results.push({ name, ok, detail });
  console.log(`${ok ? ' ok ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function monitoredPage(browser, viewport, { denyMicrophone = false } = {}) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    permissions: ['microphone'],
  });
  const page = await context.newPage();
  if (denyMicrophone) {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: () => Promise.reject(new DOMException('denied for QA', 'NotAllowedError')) },
      });
    });
  }
  const errors = [];
  const failed = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', (request) => failed.push(`${request.url()} ${request.failure()?.errorText || ''}`));
  page.on('response', (response) => {
    if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  return { context, page, errors, failed };
}

async function tap(page, id) {
  await page.locator(`[data-target="${id}"]`).click();
  await page.waitForTimeout(80);
}

async function buildCast(page, mode = 'guided') {
  await tap(page, `mode-${mode}`);
  if (mode === 'guided') await tap(page, 'story-forest-rescue');
  await tap(page, 'cast-bear');
  await tap(page, 'cast-rabbit');
  await tap(page, 'cast-next');
  check('six stage backgrounds available', (await page.locator('.stage-card').count()) === 6);
  await tap(page, 'dress-a');
  await tap(page, 'prop-crown');
  await tap(page, 'dress-b');
  await tap(page, 'prop-magic-wand');
  await tap(page, mode === 'free' ? 'stage-moon-adventure' : 'stage-forest-cottage');
  await tap(page, 'stage-ready');
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'performance' && state.phase === 'ready';
  }, null, { timeout: 30000 });
  await page.waitForTimeout(1000);
}

async function main() {
  await mkdir(shots, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });

  const landscape = await monitoredPage(browser, { width: 1180, height: 820 });
  const { page } = landscape;
  check('splash boots', (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('two play modes registered', (await page.evaluate(() => window.QLOBE_DEBUG.listModes())).length === 2);
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  await page.evaluate(async () => {
    const clips = await import('../../shared/js/voice-clips.js');
    window.__voiceClipsPlayed = [];
    clips.onClip((key) => window.__voiceClipsPlayed.push(key));
    window.QLOBE_DEBUG.mute(false);
  });
  await tap(page, 'mode-guided');
  await page.waitForTimeout(500);
  check('recorded narrator clip starts',
    (await page.evaluate(() => window.__voiceClipsPlayed.length)) > 0,
    (await page.evaluate(() => window.__voiceClipsPlayed.join(', '))));
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  check('six guided stories', (await page.locator('[data-target^="story-"]').count()) === 6);
  await page.screenshot({ path: path.join(shots, '02-story-picker.png') });
  await tap(page, 'story-forest-rescue');
  await tap(page, 'cast-bear');
  await tap(page, 'cast-rabbit');
  check('cast counter reaches two', (await page.locator('.pick-number').count()) === 2);
  await page.screenshot({ path: path.join(shots, '03-cast-picker.png') });
  await tap(page, 'cast-next');
  await tap(page, 'dress-a');
  await tap(page, 'prop-crown');
  await tap(page, 'dress-b');
  await tap(page, 'prop-magic-wand');
  await tap(page, 'stage-forest-cottage');
  await page.screenshot({ path: path.join(shots, '04-build-show.png') });
  await tap(page, 'stage-ready');
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'performance' && state.phase === 'ready';
  }, null, { timeout: 30000 });
  await page.waitForTimeout(1300);
  check('two rigged actors loaded', await page.evaluate(() => document.querySelectorAll('#stage-host canvas').length === 1));
  await page.screenshot({ path: path.join(shots, '05-stage-ready.png') });

  await tap(page, 'record-start');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().recording === true, null, { timeout: 15000 });
  await tap(page, 'action-wave');
  const canvas = page.locator('#stage-host canvas');
  const box = await canvas.boundingBox();
  await page.mouse.move(box.x + box.width * .32, box.y + box.height * .65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .45, box.y + box.height * .65, { steps: 8 });
  await page.mouse.up();
  await tap(page, 'next-beat');
  await page.waitForTimeout(400);
  check('timeline advances to middle', (await page.evaluate(() => window.QLOBE_DEBUG.getState().round)) === 2);
  await page.screenshot({ path: path.join(shots, '06-recording.png') });
  await tap(page, 'record-stop');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'saved', null, { timeout: 15000 });
  check('show saves locally', (await page.evaluate(() => window.QLOBE_DEBUG.getState().showCount)) >= 1);
  await page.screenshot({ path: path.join(shots, '07-show-saved.png') });

  await tap(page, 'saved-shows');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'shows');
  check('saved show appears on shelf', (await page.locator('.show-card').count()) >= 1);
  await page.screenshot({ path: path.join(shots, '08-my-shows.png') });
  await page.locator('.show-export').first().click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().exporting === true);
  await page.waitForSelector('.export-progress');
  await page.screenshot({ path: path.join(shots, '08a-export-progress.png') });
  await page.waitForSelector('text=Your MP4 Is Ready!', { timeout: 20000 });
  await page.screenshot({ path: path.join(shots, '08b-export-ready.png') });
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save MP4' }).click();
  const download = await downloadPromise;
  const mp4Path = path.join(shots, 'puppet-retell-export.mp4');
  await download.saveAs(mp4Path);
  const mp4Bytes = await readFile(mp4Path);
  check('MP4 export downloads', (await stat(mp4Path)).size > 20_000, `${(await stat(mp4Path)).size} bytes`);
  check('export is an MP4 container', mp4Bytes.subarray(4, 8).toString('ascii') === 'ftyp');
  await page.getByRole('button', { name: 'My Shows' }).click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'shows');
  await page.locator('.show-thumb').first().click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'replay');
  await page.waitForTimeout(700);
  check('replay opens recorded stage', (await page.evaluate(() => window.QLOBE_DEBUG.getState().replaying)) === true);
  await tap(page, 'replay-stop');
  await page.locator('.show-delete').first().click();
  check('delete requires confirmation', (await page.locator('.modal').count()) === 1);
  await page.getByRole('button', { name: 'Keep It' }).click();

  await page.evaluate(() => window.QLOBE_DEBUG.tap('back'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'splash');
  await buildCast(page, 'free');
  check('free show reaches stage', (await page.evaluate(() => window.QLOBE_DEBUG.getState().mode)) === 'free');

  check('no page errors in landscape', landscape.errors.length === 0, landscape.errors.join(' | '));
  check('no failed requests in landscape', landscape.failed.length === 0, landscape.failed.join(' | '));
  await landscape.context.close();

  const portrait = await monitoredPage(browser, { width: 820, height: 1180 });
  await portrait.page.screenshot({ path: path.join(shots, '09-splash-portrait.png') });
  await tap(portrait.page, 'mode-guided');
  await portrait.page.screenshot({ path: path.join(shots, '10-stories-portrait.png') });
  check('portrait has no horizontal overflow',
    await portrait.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  check('no page errors in portrait', portrait.errors.length === 0, portrait.errors.join(' | '));
  check('no failed requests in portrait', portrait.failed.length === 0, portrait.failed.join(' | '));
  await portrait.context.close();

  const denied = await monitoredPage(browser, { width: 1024, height: 768 }, { denyMicrophone: true });
  await buildCast(denied.page, 'free');
  await tap(denied.page, 'record-start');
  await denied.page.waitForFunction(() => window.QLOBE_DEBUG.getState().recording === true, null, { timeout: 15000 });
  check('microphone denial keeps movement-only recording available',
    (await denied.page.evaluate(() => window.QLOBE_DEBUG.getState().phase)) === 'recording');
  await tap(denied.page, 'record-stop');
  await denied.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'saved', null, { timeout: 15000 });
  check('movement-only show saves', (await denied.page.evaluate(() => window.QLOBE_DEBUG.getState().showCount)) === 1);
  await tap(denied.page, 'export-saved');
  await denied.page.waitForSelector('text=Your MP4 Is Ready!', { timeout: 20000 });
  const silentDownloadPromise = denied.page.waitForEvent('download');
  await denied.page.getByRole('button', { name: 'Save MP4' }).click();
  const silentDownload = await silentDownloadPromise;
  const silentMp4Path = path.join(shots, 'puppet-retell-movement-only-export.mp4');
  await silentDownload.saveAs(silentMp4Path);
  const silentMp4Bytes = await readFile(silentMp4Path);
  check('movement-only MP4 exports',
    silentMp4Bytes.length > 20_000 && silentMp4Bytes.subarray(4, 8).toString('ascii') === 'ftyp',
    `${silentMp4Bytes.length} bytes`);
  check('no errors in microphone-denied fallback', denied.errors.length === 0, denied.errors.join(' | '));
  await denied.page.close({ runBeforeUnload: false });
  await Promise.race([
    denied.context.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  await Promise.race([
    browser.close(),
    new Promise((resolve) => setTimeout(resolve, 5000)),
  ]);
  const failed = results.filter((item) => !item.ok);
  console.log(`\nPuppet Retell QA: ${results.length - failed.length}/${results.length} checks passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
