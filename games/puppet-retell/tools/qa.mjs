#!/usr/bin/env node
// Real-Chrome smoke + visual-QC driver for Puppet Tales.
//
// Plumbing (flags, Playwright resolution, launch, monitored pages, reporter)
// comes from tools/qa/lib/driver.mjs — see tools/qa/README.md.

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import {
  baseUrl, launchChrome, createReporter, openSession,
  resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl('http://127.0.0.1:4173');
const url = `${base}/games/puppet-retell/`;
const shots = resolveShots('qa-shots/puppet-retell');

const CHROME_AVC1_DIAGNOSTIC = 'When using "avc1" for mp4 encoding, the codec description is not supposed to change';
const { check, finish } = createReporter();

async function monitoredPage(browser, viewport, { denyMicrophone = false } = {}) {
  return openSession(browser, {
    url,
    base,
    viewport,
    context: { permissions: ['microphone'] },
    initScript: denyMicrophone
      ? () => {
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: { getUserMedia: () => Promise.reject(new DOMException('denied for QA', 'NotAllowedError')) },
        });
      }
      : null,
    ignoreConsole: [CHROME_AVC1_DIAGNOSTIC],
    mute: true,
  });
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
  await ensureShots(shots);
  const browser = await launchChrome({
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
  await page.mouse.move(box.x + box.width * .50, box.y + box.height * .27, { steps: 5 });
  await page.waitForTimeout(90);
  const dragMotion = await page.evaluate(() => window.QLOBE_DEBUG.getPuppetMotion().a);
  const dragAngle = Math.max(...Object.values(dragMotion.angles).map(Math.abs));
  check('puppet can be lifted freely around the stage',
    dragMotion.active && dragMotion.fy < -.18,
    `vertical offset ${dragMotion.fy.toFixed(3)}`);
  check('2D dragging drives dramatic segmented limbs',
    dragAngle > .25,
    `max angle ${dragAngle.toFixed(3)} rad`);
  await page.screenshot({ path: path.join(shots, '05a-ragdoll-drag.png') });
  await page.mouse.up();
  await page.waitForTimeout(420);
  const fallingMotion = await page.evaluate(() => window.QLOBE_DEBUG.getPuppetMotion().a);
  const fallingAngle = Math.max(...Object.values(fallingMotion.angles).map(Math.abs));
  check('release drops the puppet with limbs flying up',
    fallingMotion.fy > dragMotion.fy && fallingAngle > .70,
    `offset ${fallingMotion.fy.toFixed(3)}, max angle ${fallingAngle.toFixed(3)} rad`);
  await page.screenshot({ path: path.join(shots, '05b-ragdoll-drop.png') });
  await page.waitForTimeout(800);
  const settledMotion = await page.evaluate(() => window.QLOBE_DEBUG.getPuppetMotion().a);
  const settledAngle = Math.max(...Object.values(settledMotion.angles).map(Math.abs));
  check('released puppet lands back on the stage',
    !settledMotion.active && Math.abs(settledMotion.fy) < .002,
    `offset ${settledMotion.fy.toFixed(3)}, max angle ${settledAngle.toFixed(3)} rad`);
  await page.mouse.move(box.x + box.width * .68, box.y + box.height * .65);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .50, box.y + box.height * .47, { steps: 4 });
  await page.waitForTimeout(90);
  const mirroredMotion = await page.evaluate(() => window.QLOBE_DEBUG.getPuppetMotion().b);
  const mirroredAngle = Math.max(...Object.values(mirroredMotion.angles).map(Math.abs));
  check('mirrored puppet receives the same ragdoll response',
    mirroredMotion.active && mirroredMotion.fy < -.08 && mirroredAngle > .25,
    `max angle ${mirroredAngle.toFixed(3)} rad`);
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
  if (landscape.diagnostics.length) {
    console.log(`info Chrome reported ${landscape.diagnostics.length} known avc1 MediaRecorder diagnostic`);
  }
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
  finish({ prefix: '\nPuppet Tales QA: ', listFailures: false, exit: true });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
