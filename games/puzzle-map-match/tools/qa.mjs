#!/usr/bin/env node
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { args, launchChrome, openSession, createReporter, checkSessionClean } from '../../../tools/qa/lib/driver.mjs';

const base = (args.flag('base', 'http://127.0.0.1:8765')).replace(/\/$/, '');
const url = `${base}/games/puzzle-map-match/`;
const shots = '/private/tmp/puzzle-explorer-qa';
const { check, finish } = createReporter();
const sessions = [];
const platformAnalytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
await mkdir(shots, { recursive: true });

const browser = await launchChrome({ channel: 'chrome' });
try {
  const mainSession = await openSession(browser, { url, base, viewport: { width: 1200, height: 800 }, reducedMotion: 'no-preference', allowAbortedMedia: true, fastTimers: true, allowRemote: platformAnalytics });
  sessions.push(mainSession);
  const { page } = mainSession;
  await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  const debug = () => page.evaluate(() => window.QLOBE_DEBUG.getState());
  const api = await page.evaluate(() => ({ id: window.QLOBE_DEBUG.gameId, engine: window.QLOBE_DEBUG.engine, modes: window.QLOBE_DEBUG.listModes() }));
  check('game id and engine exposed', api.id === 'puzzle-map-match' && typeof api.engine === 'string', JSON.stringify(api));
  check('three modes registered', api.modes.length === 3 && api.modes.map(m => m.id).join(',') === 'animal-trek,tasty-travels,world-wonders');
  check('splash screen visible', (await debug()).screen === 'splash');
  check('splash art decodes', await page.locator('img:visible').evaluateAll(xs => xs.every(x => x.naturalWidth > 0)));
  check('no art failures', (await debug()).artFailures.length === 0);
  const voicePack = await page.evaluate(async () => {
    const [manifestResponse, linesResponse] = await Promise.all([
      fetch('./assets/audio/manifest.json'),
      fetch('./data/lines.json'),
    ]);
    const [manifest, lines] = await Promise.all([manifestResponse.json(), linesResponse.json()]);
    const issues = [];
    const provenanceIssues = [];
    let decoded = 0;
    const context = new OfflineAudioContext(1, 1, 44100);
    for (const [key, entry] of Object.entries(manifest)) {
      try {
        const response = await fetch(`./assets/audio/${entry.file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const audio = await context.decodeAudioData(await response.arrayBuffer());
        if (!(audio.duration > 0)) throw new Error('zero duration');
        if (Number.isFinite(entry.dur) && Math.abs(audio.duration - entry.dur) > 0.12) {
          throw new Error(`duration ${audio.duration.toFixed(3)} != ${entry.dur}`);
        }
        decoded += 1;
      } catch (error) {
        issues.push(`${key}: ${error.message}`);
      }
    }
    await Promise.all(Object.entries(lines).map(async ([key, authored]) => {
      let recipe;
      let sidecar;
      try {
        const [recipeResponse, sidecarResponse] = await Promise.all([
          fetch(`./assets/source/voice-recipes/${key}.recipe.json`),
          fetch(`./assets/source/voice-qa/${key}.json`),
        ]);
        if (!recipeResponse.ok) throw new Error(`recipe HTTP ${recipeResponse.status}`);
        if (!sidecarResponse.ok) throw new Error(`QA HTTP ${sidecarResponse.status}`);
        [recipe, sidecar] = await Promise.all([recipeResponse.json(), sidecarResponse.json()]);
      } catch (error) {
        provenanceIssues.push(`${key}: ${error.message}`);
        return;
      }
      const step = recipe?.steps?.[0];
      const recipeTranscript = recipe?.qa?.transcript;
      const failures = [];
      if (recipe?.qa?.status !== 'accepted') failures.push('status');
      if (recipe?.refs?.voice !== 'teacher') failures.push('voice ref');
      if (step?.workflow !== 'qwen3-tts-voiceclone') failures.push('workflow');
      if (step?.text !== authored) failures.push('recipe text');
      if (recipeTranscript?.intended !== authored) failures.push('recipe intended');
      if (sidecar?.intended !== authored) failures.push('QA intended');
      if (recipeTranscript?.match !== true || !Number.isFinite(Number(recipeTranscript?.ratio)) || Number(recipeTranscript.ratio) < 0.98) failures.push('recipe transcript QA');
      if (sidecar?.match !== true || !Number.isFinite(Number(sidecar?.ratio)) || Number(sidecar.ratio) < 0.98) failures.push('QA transcript');
      if (failures.length) provenanceIssues.push(`${key}: ${failures.join(', ')}`);
    }));
    return {
      manifestCount: Object.keys(manifest).length,
      lineCount: Object.keys(lines).length,
      decoded,
      issues,
      provenanceCount: Object.keys(lines).length - provenanceIssues.length,
      provenanceIssues,
      sameKeys: Object.keys(lines).every((key) => Object.hasOwn(manifest, key)),
    };
  });
  check('recorded voice manifest covers all 58 authored lines', voicePack.lineCount === 58 && voicePack.manifestCount === 58 && voicePack.sameKeys, JSON.stringify(voicePack));
  check('real Chrome decodes all recorded voice clips', voicePack.decoded === 58 && voicePack.issues.length === 0, voicePack.issues.join('; '));
  check('all 58 voice provenance pairs pass accepted teacher-voice transcript QA', voicePack.provenanceCount === 58 && voicePack.provenanceIssues.length === 0, voicePack.provenanceIssues.join('; '));
  await page.screenshot({ path: path.join(shots, '01-splash.png') });

  await page.evaluate(() => window.QLOBE_DEBUG.startMode('animal-trek'));
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'map');
  let state = await debug();
  const card = await page.locator('[data-role="draggable"]:visible').boundingBox();
  const targets = await page.locator('[data-role="drop-target"]:visible').evaluateAll(ns => ns.map(n => ({ id: n.dataset.continent, rect: (() => { const r=n.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })() })));
  check('animal trek has card and six continent targets', !!card && targets.length === 6);
  check('targets are at least 96px', targets.every(t => t.rect.width >= 96 && t.rect.height >= 96));
  await page.screenshot({ path: path.join(shots, '02-play.png') });
  const wrong = targets.find(t => t.id !== state.expectedContinent);
  await page.mouse.move(card.x + card.width / 2, card.y + card.height / 2); await page.mouse.down();
  await page.mouse.move(wrong.rect.x + wrong.rect.width / 2, wrong.rect.y + wrong.rect.height / 2, { steps: 10 }); await page.mouse.up();
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().busy);
  state = await debug();
  check('wrong real drag does not place card', state.placed.length === 0 && state.round === 0);
  await page.evaluate(() => window.QLOBE_DEBUG.tap('sound'));
  check('sound control replays the active prompt after a nudge', await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog().at(-1)?.key === window.QLOBE_DEBUG.getState().currentItem.replace(/^/, 'prompt-') || window.QLOBE_DEBUG.getAudioLog().at(-1)?.text === document.querySelector('.prompt-copy')?.textContent?.trim()));
  await page.screenshot({ path: path.join(shots, '03-retry.png') });

  const offMapCard = await page.locator('[data-role="draggable"]:visible').boundingBox();
  await page.mouse.move(offMapCard.x + offMapCard.width / 2, offMapCard.y + offMapCard.height / 2); await page.mouse.down();
  await page.mouse.move(4, 4, { steps: 10 }); await page.mouse.up();
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().busy);
  check('off-map real drag returns card without progress', (await debug()).placed.length === 0 && (await debug()).round === 0);

  const cancel = await page.evaluate(() => { const c=document.querySelector('[data-role="draggable"]'); const r=c.getBoundingClientRect(); const id=91; c.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:id,clientX:r.x+r.width/2,clientY:r.y+r.height/2})); window.dispatchEvent(new Event('resize')); c.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:id})); return window.QLOBE_DEBUG.getState(); });
  check('resize-mid-drag cancels interaction', !cancel.activeDrag && cancel.placed.length === 0);
  const blurCard = await page.locator('[data-role="draggable"]:visible').boundingBox();
  await page.mouse.move(blurCard.x + blurCard.width / 2, blurCard.y + blurCard.height / 2); await page.mouse.down(); await page.mouse.move(blurCard.x + blurCard.width / 2 + 35, blurCard.y + blurCard.height / 2 - 35, { steps: 5 });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().activeDrag);
  check('blur-mid-drag removes the ghost and preserves progress', await page.locator('[data-qk-drag-ghost]').count() === 0 && (await debug()).placed.length === 0);
  await page.mouse.up();
  const expected = targets.find(t => t.id === state.expectedContinent);
  const card2 = await page.locator('[data-role="draggable"]:visible').boundingBox();
  await page.mouse.move(card2.x + card2.width / 2, card2.y + card2.height / 2); await page.mouse.down(); await page.mouse.move(expected.rect.x + expected.rect.width / 2, expected.rect.y + expected.rect.height / 2, { steps: 12 });
  check('real drag creates one ghost', await page.locator('[data-qk-drag-ghost]').count() === 1);
  await page.mouse.up();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placed.length === 1);
  check('correct real drag places expected card', (await debug()).phase === 'reward');
  await page.screenshot({ path: path.join(shots, '04-success.png') });
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().round === 1 && window.QLOBE_DEBUG.getState().phase === 'playing');
  state = await debug();
  await page.locator('[data-role="draggable"]:visible').focus();
  await page.keyboard.press('Enter');
  const selected = await debug(); check('tap-to-place selects the current card', selected.selected === true);
  await page.evaluate(() => window.QLOBE_DEBUG.tap('sound'));
  check('sound control replays the active prompt after tap help', await page.evaluate(() => window.QLOBE_DEBUG.getAudioLog().at(-1)?.text === document.querySelector('.prompt-copy')?.textContent?.trim()));
  await page.locator(`[data-continent="${selected.expectedContinent}"]`).focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().placed.length === 2);
  await page.screenshot({ path: path.join(shots, '05-animal-progress.png') });

  let correctPaths = 0;
  for (const modeId of ['animal-trek', 'tasty-travels', 'world-wonders']) {
    await page.evaluate((id) => window.QLOBE_DEBUG.startMode(id), modeId);
    await page.waitForFunction((id) => window.QLOBE_DEBUG.getState().mode === id && window.QLOBE_DEBUG.getState().phase === 'playing', modeId);
    if (modeId !== 'animal-trek') await page.screenshot({ path: path.join(shots, modeId === 'tasty-travels' ? '10-tasty-play.png' : '11-wonders-play.png') });
    for (let index = 0; index < 6; index += 1) {
      const before = await debug();
      check(`${modeId} round ${index + 1} has a mapped item`, Boolean(before.currentItem && before.expectedContinent));
      await page.evaluate(({ item, continent }) => window.QLOBE_DEBUG.place(item, continent), { item: before.currentItem, continent: before.expectedContinent });
      correctPaths += 1;
    }
    check(`${modeId} completes all six correct paths`, (await debug()).screen === 'end');
  }
  check('all eighteen configured correct paths complete', correctPaths === 18);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await page.evaluate(() => window.QLOBE_DEBUG.ready);
  const reloaded = await debug();
  check('passport completion persists across reload', reloaded.screen === 'splash' && reloaded.completedModes.length === 3);
  await page.evaluate(() => window.QLOBE_DEBUG.mute(true));

  const phone = await openSession(browser, { url, base, viewport: { width: 320, height: 800 }, reducedMotion: 'no-preference', allowAbortedMedia: true, fastTimers: true, allowRemote: platformAnalytics });
  sessions.push(phone);
  await phone.page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await phone.page.evaluate(() => window.QLOBE_DEBUG.ready);
  await phone.page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  await phone.page.evaluate(() => window.QLOBE_DEBUG.startMode('animal-trek'));
  await phone.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'map');
  const phoneType = await phone.page.evaluate(() => ({
    cue: (() => { const el = document.querySelector('.tray-instruction'); const style = getComputedStyle(el); const rect = el.getBoundingClientRect(); return { display: style.display, font: parseFloat(style.fontSize), width: rect.width, height: rect.height }; })(),
    prompt: parseFloat(getComputedStyle(document.querySelector('.prompt-copy')).fontSize),
    labels: [...document.querySelectorAll('.continent-target span')].map((el) => parseFloat(getComputedStyle(el).fontSize)),
    targets: [...document.querySelectorAll('[data-continent]')].map((el) => { const rect = el.getBoundingClientRect(); return { id: el.dataset.continent, width: rect.width, height: rect.height }; }),
  }));
  check('320px portrait keeps a readable visual tap-or-drag cue', phoneType.cue.display !== 'none' && phoneType.cue.font >= 10.5 && phoneType.cue.width > 0 && phoneType.cue.height > 0, JSON.stringify(phoneType.cue));
  check('320px portrait keeps readable prompt and continent type', phoneType.prompt >= 14 && phoneType.labels.every((size) => size >= 10.5), JSON.stringify(phoneType));
  check('320px portrait keeps six 96px semantic targets', phoneType.targets.length === 6 && phoneType.targets.every((target) => target.width >= 96 && target.height >= 96), JSON.stringify(phoneType.targets));
  await phone.page.waitForFunction(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'drag-help'));
  check('first idle hand cue uses the recorded drag-help clip', await phone.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog().some((entry) => entry.key === 'drag-help' && entry.kind === 'clip')));
  await phone.page.screenshot({ path: path.join(shots, '12-phone-play.png') });

  let phonePlacements = 0;
  for (let index = 0; index < 6; index += 1) {
    const before = await phone.page.evaluate(() => window.QLOBE_DEBUG.getState());
    const phoneCard = await phone.page.locator('[data-role="draggable"]:visible').boundingBox();
    await phone.page.mouse.click(phoneCard.x + phoneCard.width / 2, phoneCard.y + phoneCard.height / 2);
    await phone.page.waitForFunction(() => window.QLOBE_DEBUG.getState().selected === true);
    const phoneTarget = await phone.page.locator(`[data-continent="${before.expectedContinent}"]`).boundingBox();
    await phone.page.mouse.click(phoneTarget.x + phoneTarget.width / 2, phoneTarget.y + phoneTarget.height / 2);
    phonePlacements += 1;
    await phone.page.waitForFunction((count) => window.QLOBE_DEBUG.getState().placed.length === count, phonePlacements);
    if (index === 0) {
      const factSize = await phone.page.locator('.prompt-copy small').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
      check('320px portrait success fact remains readable', factSize >= 12, String(factSize));
      await phone.page.screenshot({ path: path.join(shots, '13-phone-success.png') });
    }
    if (index < 5) await phone.page.waitForFunction((round) => window.QLOBE_DEBUG.getState().round === round && window.QLOBE_DEBUG.getState().phase === 'playing', index + 1);
  }
  await phone.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('all six phone-width pointer taps route to their intended continent', phonePlacements === 6 && (await phone.page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'end');

  const portrait = await openSession(browser, { url, base, viewport: { width: 700, height: 1100 }, reducedMotion: 'reduce', allowAbortedMedia: true, fastTimers: true, allowRemote: platformAnalytics });
  sessions.push(portrait);
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.ready);
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  check('portrait reduced-motion splash boots', (await portrait.page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'splash');
  check('reduced motion state reported', (await portrait.page.evaluate(() => window.QLOBE_DEBUG.getState())).reducedMotion === true);
  await portrait.page.screenshot({ path: path.join(shots, '06-portrait-reduced.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.startMode('animal-trek'));
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'map');
  const portraitTargets = await portrait.page.locator('[data-role="drop-target"]:visible').evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { id: node.dataset.continent, x: rect.x, y: rect.y, width: rect.width, height: rect.height }; }));
  check('portrait map keeps six 96px continent targets', portraitTargets.length === 6 && portraitTargets.every(rect => rect.width >= 96 && rect.height >= 96));
  const portraitOverlaps = portraitTargets.flatMap((a, index) => portraitTargets.slice(index + 1).filter((b) => Math.min(a.x + a.width, b.x + b.width) > Math.max(a.x, b.x) && Math.min(a.y + a.height, b.y + b.height) > Math.max(a.y, b.y)).map((b) => `${a.id}/${b.id}`));
  check('portrait continent targets do not overlap', portraitOverlaps.length === 0, portraitOverlaps.join(','));
  check('portrait target centers route through the raster map surface', await portrait.page.locator('[data-role="drop-target"]:visible').evaluateAll(nodes => nodes.every(node => { const rect = node.getBoundingClientRect(); return Boolean(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.closest?.('[data-map-surface]')); })));
  check('portrait current card remains at least 132px', await portrait.page.locator('[data-role="draggable"]:visible').evaluate(node => node.getBoundingClientRect().width >= 132));
  await portrait.page.screenshot({ path: path.join(shots, '07-portrait-play.png') });
  await portrait.page.evaluate(() => {
    const state = window.QLOBE_DEBUG.getState();
    const surface = document.querySelector('[data-map-surface]').getBoundingClientRect();
    const target = document.querySelector(`[data-continent="${state.expectedContinent}"]`).getBoundingClientRect();
    const normalizedX = (target.x + target.width / 2 - surface.x) / surface.width;
    const normalizedY = (target.y + target.height / 2 - surface.y) / surface.height;
    window.QLOBE_DEBUG.dropAt(state.currentItem, normalizedX, normalizedY);
    return true;
  });
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'reward');
  await portrait.page.screenshot({ path: path.join(shots, '08-portrait-success.png') });
  await portrait.page.evaluate(() => window.QLOBE_DEBUG.completeMode());
  await portrait.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  check('debug completion reaches end screen', (await portrait.page.evaluate(() => window.QLOBE_DEBUG.getState())).screen === 'end');
  const audioEvents = await portrait.page.evaluate(() => window.QLOBE_DEBUG.getAudioLog());
  const keys = audioEvents.map((entry) => entry.key);
  check('audio log records gameplay voice from clips', audioEvents.length > 0 && audioEvents.every((entry) => entry.kind === 'clip'), JSON.stringify(audioEvents));
  await portrait.page.screenshot({ path: path.join(shots, '09-end.png') });
  for (const session of sessions) {
    session.failed = session.failed.filter((request) => !platformAnalytics.some((prefix) => request.startsWith(prefix)));
    checkSessionClean({ check }, session);
  }
  await portrait.page.close(); await phone.page.close(); await page.close();
} finally { await browser.close(); }
finish({ suffix: `; screenshots: ${shots}` });
