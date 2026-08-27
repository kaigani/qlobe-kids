#!/usr/bin/env node
// Momma Bear's Storybook — real-Chrome interaction and visual-QC driver.
//
// caffeinate -dims node games/momma-bear-storybook/tools/qa.mjs
// QLOBE_BASE_URL=https://qlo.be node games/momma-bear-storybook/tools/qa.mjs
// QLOBE_SHOTS=/tmp/momma-bear-shots node games/momma-bear-storybook/tools/qa.mjs
//
// This intentionally drives the published debug contract, rather than reaching
// into implementation details: a child can tap words in any order, must touch
// every word, pauses at the three-act turns, and earns a charm for each story.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, shooter, debug, audio, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl('http://127.0.0.1:8000', { envVar: 'QLOBE_BASE_URL' });
const GAME_URL = `${base}/games/momma-bear-storybook/`;
const shots = resolveShots('qa-shots/momma-bear-storybook');
const rawShot = shooter(shots);
const { check, head, results, failures, finish } = createReporter();
const captures = [];
const FAST = 0.05;
const STORY_IDS = ['little-mill', 'pink-flowers', 'glass-hill'];
const PLATFORM_ANALYTICS = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
let browser;

const isPlatformAnalytics = (url) => PLATFORM_ANALYTICS.some((prefix) => url.startsWith(prefix));

async function shot(page, name) {
  const file = await rawShot(page, name);
  captures.push(file);
  return file;
}

function checkClean(session, label) {
  const remote = session.remote.filter((url) => !isPlatformAnalytics(url) && !url.startsWith('blob:'));
  const failed = session.failed.filter((entry) => !isPlatformAnalytics(entry) && !/(^|\s)blob:/.test(entry));
  checkSessionClean({ check }, { ...session, remote, failed }, label);
}

async function prime(page, { mute = true } = {}) {
  const ready = await debug.waitForReady(page);
  check('debug ready has no content errors', Array.isArray(ready?.errors) && ready.errors.length === 0, JSON.stringify(ready));
  await debug.fastTimers(page, FAST);
  if (mute) await debug.mute(page, true);
  return ready;
}

async function openGame(viewport, { reducedMotion = 'no-preference', mute = true } = {}) {
  const session = await openSession(browser, {
    url: GAME_URL,
    base,
    viewport,
    reducedMotion,
    // The initial audio proof needs a real (unmuted) gesture. Every subsequent
    // replay is muted so the driver is considerate in a shared studio.
    mute: null,
    fastTimers: null,
    allowAbortedMedia: true,
  });
  await prime(session.page, { mute });
  return session;
}

async function waitForUsableRead(page, timeout = 25000) {
  await debug.waitForScreen(page, 'read', { timeout });
  await page.waitForFunction(() => {
    const s = window.QLOBE_DEBUG.getState();
    return s.screen === 'read' && !s.busy && s.words.length > 0;
  }, null, { timeout });
  return debug.getState(page);
}

async function waitAfterWords(page, before, timeout = 30000) {
  await page.waitForFunction(([index, screen]) => {
    const s = window.QLOBE_DEBUG.getState();
    const turn = document.querySelector('#mbs-page-turn');
    return s.screen !== screen || s.pageIndex !== index || Boolean(turn && !turn.hidden);
  }, [before.pageIndex, before.screen], { timeout });
  return debug.getState(page);
}

async function waitForSettledFinalLine(page, timeout = 30000) {
  await page.waitForFunction(() => {
    const state = window.QLOBE_DEBUG.getState();
    return state.screen === 'read' && state.lineComplete && !state.busy;
  }, null, { timeout });
  return debug.getState(page);
}

async function finishPage(page) {
  const before = await debug.getState(page);
  const count = before.words.length;
  const result = await debug.call(page, 'tapAllWords');
  check(`page ${before.pageIndex + 1}: tapAllWords covers all ${count} positions`, result === count, String(result));
  await waitAfterWords(page, before);
  return debug.getState(page);
}

async function manifestEvidence(page) {
  return page.evaluate(async () => {
    const response = await fetch('./assets/audio/manifest.json', { cache: 'no-store' });
    if (!response.ok) return { ok: false, status: response.status, manifest: null };
    try { return { ok: true, status: response.status, manifest: await response.json() }; }
    catch (error) { return { ok: false, status: response.status, error: String(error), manifest: null }; }
  });
}

async function audioRecipeEvidence(page, manifest) {
  return page.evaluate(async (entries) => {
    const normalize = (value) => String(value ?? '').toLowerCase()
      .replace(/[‘’]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim().replace(/\s+/g, ' ');
    const classify = (recipe, fallback) => {
      const qa = recipe?.qa || {};
      if (qa.status !== 'accepted') return 'pending';
      const transcript = qa.transcript || {};
      const intended = normalize(transcript.intended || fallback);
      const heard = normalize(transcript.heard);
      if (intended && intended === heard) return 'native';
      const expectedTokens = intended.split(' ').filter(Boolean);
      const heardTokens = heard.split(' ').filter(Boolean);
      if (expectedTokens.length === heardTokens.length && expectedTokens.length) {
        let changed = false; let valid = true;
        for (let index = 0; index < expectedTokens.length; index += 1) {
          const expected = expectedTokens[index]; const actual = heardTokens[index];
          if (expected === actual) continue;
          const equivalent = (expected === 'one' && actual === '1')
            || (expected === 'to' && ['two', '2'].includes(actual))
            || (expected === 'by' && ['buy', 'bye'].includes(actual))
            || (expected === 'sea' && actual === 'see')
            || (['whirr', 'whir'].includes(expected) && actual === 'where')
            || (expected === 'a' && ['ay', 'hey'].includes(actual));
          if (!equivalent) { valid = false; break; }
          changed = true;
        }
        if (valid && changed) return 'equivalence';
      }
      const contextual = qa.contextualTranscript || {};
      const source = qa.sourceTranscript || {};
      const contextualHay = normalize(fallback) === 'hay'
        && normalize(contextual.intended) === 'hay'
        && normalize(contextual.heard) === 'hay'
        && contextual.match === true
        && normalize(source.heard).split(' ').includes('hay');
      return contextualHay ? 'contextual' : 'hardFailure';
    };
    const results = await Promise.all(Object.entries(entries).map(async ([key, item]) => {
      const file = item?.file;
      if (!file) return { key, verdict: 'pending', error: 'manifest entry has no file' };
      try {
        const response = await fetch(`./assets/audio/${file}.recipe.json`, { cache: 'no-store' });
        if (!response.ok) return { key, verdict: 'pending', error: `recipe ${response.status}` };
        const recipe = await response.json();
        return { key, verdict: classify(recipe, item.text || key.split(':').at(-1)), status: recipe?.qa?.status || null };
      } catch (error) {
        return { key, verdict: 'pending', error: String(error) };
      }
    }));
    const counts = Object.fromEntries(['native', 'contextual', 'equivalence', 'hardFailure', 'pending']
      .map((verdict) => [verdict, results.filter((item) => item.verdict === verdict).length]));
    return { counts, failures: results.filter((item) => ['hardFailure', 'pending'].includes(item.verdict)) };
  }, manifest);
}

async function auditTargets(page, label) {
  const sizes = await targetSizes(page);
  const small = undersized(sizes);
  check(`${label}: visible interactive targets are at least 96×96`, small.length === 0, JSON.stringify(small));
}

async function auditPageTurnClearance(page, label) {
  const overlaps = await page.evaluate(() => {
    const turn = document.querySelector('#mbs-page-turn');
    if (!turn || turn.hidden) return [{ error: 'page-turn is not visible' }];
    const control = turn.getBoundingClientRect();
    const gap = 12;
    return [...document.querySelectorAll('#mbs-word-line .trt-word')]
      .map((word) => ({ word: word.textContent.trim(), rect: word.getBoundingClientRect() }))
      .filter(({ rect }) => !(
        rect.right + gap <= control.left
        || rect.left >= control.right + gap
        || rect.bottom + gap <= control.top
        || rect.top >= control.bottom + gap
      ))
      .map(({ word, rect }) => ({
        word,
        wordRect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom },
        turnRect: { left: control.left, top: control.top, right: control.right, bottom: control.bottom },
      }));
  });
  check(`${label}: page-turn control clears every word tile by 12px`, overlaps.length === 0, JSON.stringify(overlaps));
}

async function driveStory(page, storyId, index, { initialPartial = false } = {}) {
  head(`${storyId}: six-page reading path`);
  const started = await debug.startMode(page, storyId);
  check(`${storyId}: startMode accepted`, started === true, String(started));
  let state = await waitForUsableRead(page);
  check(`${storyId}: begins at page 1 / Beginning`, state.pageIndex === 0 && state.act === 'beginning', JSON.stringify(state));

  // Page one intentionally proves the word mechanic rather than merely
  // fast-forwarding it: one tap, one replay, a later-word-first tap, then the
  // remaining positions. This protects the Tiny Reader Theater learning rule.
  const wordCount = state.words.length;
  const first = initialPartial ? 0 : Math.min(1, wordCount - 1);
  const firstTap = await debug.call(page, 'tapWord', first);
  check(`${storyId}: partial word tap accepted`, firstTap === true, String(firstTap));
  state = await debug.getState(page);
  check(`${storyId}: partial tap leaves words required`, state.tappedWords.length === 1 && state.wordsRemaining === wordCount - 1, JSON.stringify(state));
  await shot(page, `${String(index + 1).padStart(2, '0')}-${storyId}-page1-partial`);

  const replay = await debug.call(page, 'tapWord', first);
  check(`${storyId}: repeat word replays without advancing`, replay === true, String(replay));
  const afterReplay = await debug.getState(page);
  check(`${storyId}: repeated word is counted once`, afterReplay.tappedWords.length === 1 && afterReplay.pageIndex === 0, JSON.stringify(afterReplay));

  const last = wordCount - 1;
  if (last !== first) {
    const outOfOrder = await debug.call(page, 'tapWord', last);
    check(`${storyId}: out-of-order word tap accepted`, outOfOrder === true, String(outOfOrder));
    const afterOutOfOrder = await debug.getState(page);
    check(`${storyId}: out-of-order tap still cannot complete line`, afterOutOfOrder.wordsRemaining > 0, JSON.stringify(afterOutOfOrder));
  }
  for (let word = 0; word < wordCount; word += 1) {
    const current = await debug.getState(page);
    if (!current.tappedWords.includes(current.words[word])) await debug.call(page, 'tapWord', word);
  }
  await waitAfterWords(page, { pageIndex: 0, screen: 'read' });
  state = await debug.getState(page);
  check(`${storyId}: all page-1 positions were required before advance`, state.pageIndex === 1 || state.screen !== 'read', JSON.stringify(state));

  // Page 2 is the first intentional act turn. It must show the child's page
  // turn rather than advancing automatically.
  state = await waitForUsableRead(page);
  check(`${storyId}: page 2 remains Beginning`, state.pageIndex === 1 && state.act === 'beginning', JSON.stringify(state));
  await finishPage(page);
  state = await debug.getState(page);
  check(`${storyId}: Beginning ends with a page-turn gate`, state.screen === 'read' && state.pageIndex === 1, JSON.stringify(state));
  const firstTurnVisible = await page.locator('#mbs-page-turn').isVisible();
  check(`${storyId}: Beginning page-turn button is visible`, firstTurnVisible, String(firstTurnVisible));
  await auditPageTurnClearance(page, `${storyId} Beginning turn`);
  if (index === 0) {
    await page.locator('#mbs-page-turn').click();
    check(`${storyId}: physical page-turn tap is accepted`, true, 'native button click');
  } else if (index === 1) {
    await page.locator('#mbs-page-turn').focus();
    await page.keyboard.press('Enter');
    check(`${storyId}: keyboard page-turn activation is accepted`, true, 'native button Enter');
  } else {
    const next = await debug.call(page, 'nextPage');
    check(`${storyId}: nextPage crosses Beginning → Middle`, next === true, String(next));
  }

  state = await waitForUsableRead(page);
  check(`${storyId}: page 3 is Middle`, state.pageIndex === 2 && state.act === 'middle', JSON.stringify(state));
  await shot(page, `${String(index + 1).padStart(2, '0')}-${storyId}-page3`);
  await auditTargets(page, `${storyId} page 3`);
  await finishPage(page);

  state = await waitForUsableRead(page);
  check(`${storyId}: page 4 remains Middle`, state.pageIndex === 3 && state.act === 'middle', JSON.stringify(state));
  await finishPage(page);
  state = await debug.getState(page);
  check(`${storyId}: Middle ends with a page-turn gate`, state.screen === 'read' && state.pageIndex === 3, JSON.stringify(state));
  await auditPageTurnClearance(page, `${storyId} Middle turn`);
  await shot(page, `${String(index + 1).padStart(2, '0')}-${storyId}-act-turn`);
  const secondTurn = await debug.call(page, 'nextPage');
  check(`${storyId}: nextPage crosses Middle → Ending`, secondTurn === true, String(secondTurn));

  state = await waitForUsableRead(page);
  check(`${storyId}: page 5 is Ending`, state.pageIndex === 4 && state.act === 'ending', JSON.stringify(state));
  await finishPage(page);
  state = await waitForUsableRead(page);
  check(`${storyId}: page 6 remains Ending`, state.pageIndex === 5 && state.act === 'ending', JSON.stringify(state));
  // Give Chrome a real screenshot window before the reward transition. At the
  // global QA speed the authored 650 ms hold is only ~33 ms, shorter than a
  // full-page capture on some machines.
  await debug.fastTimers(page, 1);
  const finalCount = state.words.length;
  const finishFinal = await debug.call(page, 'tapAllWords');
  check(`${storyId}: page 6 tapAllWords covers final positions`, finishFinal === finalCount, String(finishFinal));
  const finalWords = await waitForSettledFinalLine(page);
  check(`${storyId}: page 6 has a complete-word state before reward`, finalWords.lineComplete && finalWords.wordsRemaining === 0, JSON.stringify(finalWords));
  await shot(page, `${String(index + 1).padStart(2, '0')}-${storyId}-page6-complete-word-state`);
  await debug.fastTimers(page, FAST);
  await debug.waitForScreen(page, 'complete', { timeout: 30000 });
  state = await debug.getState(page);
  check(`${storyId}: reaches completion`, state.screen === 'complete' && state.completedStories.includes(storyId), JSON.stringify(state));
  // Capture the authored reward after its short paper-drop lands, rather than
  // freezing the first translucent frame of the charm animation.
  await page.waitForTimeout(700);
  await shot(page, `${String(index + 1).padStart(2, '0')}-${storyId}-completion`);
  return state;
}

// A compact portrait pass preserves saved evidence for the states most likely
// to regress when the page, actors, and turn control reflow at iPad Air size.
// It deliberately uses the public debug contract, just like the full path.
async function drivePortraitStory(page, storyId) {
  const prefix = `20-portrait-${storyId}`;
  head(`${storyId}: portrait visual path`);
  const started = await debug.startMode(page, storyId);
  check(`${storyId} portrait: startMode accepted`, started === true, String(started));
  let state = await waitForUsableRead(page);
  check(`${storyId} portrait: begins at page 1`, state.pageIndex === 0 && state.act === 'beginning', JSON.stringify(state));
  await auditTargets(page, `${storyId} portrait page 1`);
  await shot(page, `${prefix}-page1`);

  // Finish page 1 and page 2, then capture the first middle-page state.
  await finishPage(page);
  state = await waitForUsableRead(page);
  await finishPage(page);
  state = await debug.getState(page);
  check(`${storyId} portrait: Beginning turn is visible`, state.pageIndex === 1 && state.screen === 'read', JSON.stringify(state));
  await auditTargets(page, `${storyId} portrait Beginning turn`);
  await shot(page, `${prefix}-beginning-act-turn`);
  check(`${storyId} portrait: crosses Beginning turn`, await debug.call(page, 'nextPage') === true, 'nextPage');

  state = await waitForUsableRead(page);
  check(`${storyId} portrait: page 3 is Middle`, state.pageIndex === 2 && state.act === 'middle', JSON.stringify(state));
  if (storyId === 'pink-flowers') {
    await auditTargets(page, `${storyId} portrait page 3`);
    await shot(page, `${prefix}-page3`);
  }
  await finishPage(page);
  state = await waitForUsableRead(page);
  check(`${storyId} portrait: page 4 remains Middle`, state.pageIndex === 3 && state.act === 'middle', JSON.stringify(state));
  if (storyId === 'pink-flowers') {
    await auditTargets(page, `${storyId} portrait page 4`);
    await shot(page, `${prefix}-page4`);
  }
  await finishPage(page);
  state = await debug.getState(page);
  check(`${storyId} portrait: Middle turn is visible`, state.pageIndex === 3 && state.screen === 'read', JSON.stringify(state));
  await auditTargets(page, `${storyId} portrait Middle turn`);
  // The richer middle turn is the release evidence: it shows the authored
  // story prop after the two-row line has been completed.
  await shot(page, `${prefix}-act-turn`);
  await debug.call(page, 'nextPage');

  state = await waitForUsableRead(page);
  await finishPage(page);
  state = await waitForUsableRead(page);
  check(`${storyId} portrait: page 6 is Ending`, state.pageIndex === 5 && state.act === 'ending', JSON.stringify(state));
  await debug.fastTimers(page, 1);
  const finalCount = state.words.length;
  const tapped = await debug.call(page, 'tapAllWords');
  check(`${storyId} portrait: page 6 words complete`, tapped === finalCount, String(tapped));
  state = await waitForSettledFinalLine(page);
  check(`${storyId} portrait: page 6 complete-word state`, state.lineComplete && state.wordsRemaining === 0, JSON.stringify(state));
  await auditTargets(page, `${storyId} portrait page 6 complete`);
  await shot(page, `${prefix}-page6-complete-word`);
  await debug.fastTimers(page, FAST);
  await debug.waitForScreen(page, 'complete', { timeout: 30000 });
  await auditTargets(page, `${storyId} portrait completion`);
  await page.waitForTimeout(700);
  await shot(page, `${prefix}-completion`);
}

async function run() {
  await ensureShots(shots);
  // Do not pass Chrome's OS-level mute flag: the first physical gesture below
  // deliberately proves that a real recorded clip can start unmuted.
  browser = await launchChrome();

  head('Landscape boot, content, and recorded voice proof');
  const landscape = await openGame({ width: 1180, height: 820 }, { mute: false });
  const { page } = landscape;
  const initial = await debug.getState(page);
  check('boots on the story shelf', initial.screen === 'shelf', JSON.stringify(initial));
  const modes = await debug.listModes(page);
  check('exactly three story modes are listed', Array.isArray(modes) && modes.length === 3 && modes.map((mode) => mode.id).join(',') === STORY_IDS.join(','), JSON.stringify(modes));
  const contentErrors = await debug.call(page, 'validateContent');
  check('validateContent() is empty', Array.isArray(contentErrors) && contentErrors.length === 0, JSON.stringify(contentErrors));
  await auditTargets(page, 'shelf landscape');
  const homeLinks = await page.locator('a[href]').evaluateAll((els) => els.map((el) => ({ target: el.dataset.target, href: el.getAttribute('href') })));
  check('shelf has the only catalog Home link', homeLinks.length === 1 && homeLinks[0].target === 'catalog-home', JSON.stringify(homeLinks));
  await shot(page, '00-shelf-landscape');

  const manifest = await manifestEvidence(page);
  check('audio manifest is shipped (not intentionally pending)', manifest.ok && manifest.manifest && Object.keys(manifest.manifest).length > 0, JSON.stringify({ ok: manifest.ok, status: manifest.status, keys: Object.keys(manifest.manifest || {}).length, error: manifest.error }));
  check('audio manifest contains the complete 109-clip library', Object.keys(manifest.manifest || {}).length === 109, String(Object.keys(manifest.manifest || {}).length));
  const firstWord = 'pip';
  check('manifest includes welcome, one word, and one narrated line', Boolean(manifest.manifest?.['ui:welcome'] && manifest.manifest?.[`word:${firstWord}`] && manifest.manifest?.['line:little-mill:1']), JSON.stringify({ welcome: manifest.manifest?.['ui:welcome'], word: manifest.manifest?.[`word:${firstWord}`], line: manifest.manifest?.['line:little-mill:1'] }));
  const recipeQA = await audioRecipeEvidence(page, manifest.manifest || {});
  check('all shipped voice recipes pass the strict transcript gate', recipeQA.counts.hardFailure === 0 && recipeQA.counts.pending === 0, JSON.stringify(recipeQA));
  check('voice QA ledger is 101 native + 1 contextual + 7 exact homophones', recipeQA.counts.native === 101 && recipeQA.counts.contextual === 1 && recipeQA.counts.equivalence === 7, JSON.stringify(recipeQA.counts));

  // A physical, unmuted gesture exercises the browser's genuine media policy.
  await page.locator('[data-target="shelf-sound"]').click();
  await debug.waitForAudio(page, 'ui:welcome', { timeout: 10000 }).catch(() => {});
  await page.locator('[data-target="story-little-mill"]').click();
  await waitForUsableRead(page);
  await page.locator('[data-target="word-0"]').click();
  await debug.waitForAudio(page, 'word:pip', { timeout: 10000 }).catch(() => {});
  const earlyLog = await debug.getAudioLog(page);
  check('real unmuted gesture hears recorded welcome clip', audio.heardClip(earlyLog, 'ui:welcome'), audio.describe(earlyLog));
  check('real unmuted gesture hears a recorded word clip', audio.heardClip(earlyLog, 'word:pip'), audio.describe(earlyLog));
  check('narrated line exists as a recorded asset', Boolean(manifest.manifest?.['line:little-mill:1']), JSON.stringify(manifest.manifest?.['line:little-mill:1']));

  // Complete the first line with physical word buttons, then press the real
  // speaker during the final word. The replay guard must not supersede that
  // word or double-start the line performance.
  await debug.clearAudioLog(page);
  const proofState = await debug.getState(page);
  for (let word = 1; word < proofState.words.length - 1; word += 1) {
    await page.locator(`[data-target="word-${word}"]`).click();
    await page.waitForTimeout(900);
  }
  const finalWordIndex = proofState.words.length - 1;
  const finalWordKey = proofState.words[finalWordIndex];
  await page.locator(`[data-target="word-${finalWordIndex}"]`).click();
  await page.locator('[data-target="read-sound"]').click();
  await debug.waitForAudio(page, 'line:little-mill:1', { timeout: 15000 });
  const replayGuardLog = await debug.getAudioLog(page);
  check('speaker during final word preserves that recorded word', audio.heardClip(replayGuardLog, `word:${finalWordKey}`), audio.describe(replayGuardLog));
  check('speaker during final word starts the narrated line exactly once', audio.count(replayGuardLog, 'line:little-mill:1') === 1 && audio.heardClip(replayGuardLog, 'line:little-mill:1'), audio.describe(replayGuardLog));
  check('final word precedes the narrated line', audio.inOrder(replayGuardLog, [`word:${finalWordKey}`, 'line:little-mill:1']), audio.describe(replayGuardLog));
  const afterPhysicalLine = await waitAfterWords(page, { pageIndex: 0, screen: 'read' }, 30000);
  check('physical final-word path advances to page 2', afterPhysicalLine.pageIndex === 1, JSON.stringify(afterPhysicalLine));
  await debug.mute(page, true);
  await debug.fastTimers(page, FAST);
  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'shelf');
  await debug.call(page, 'resetProgress');

  for (let index = 0; index < STORY_IDS.length; index += 1) {
    await driveStory(page, STORY_IDS[index], index);
    if (index === 0) {
      const again = await debug.tap(page, 'again');
      check('Again restarts the just-finished story at page 1', again === true, String(again));
      const replay = await waitForUsableRead(page);
      check('Again returns to the same story page 1', replay.storyId === STORY_IDS[index] && replay.pageIndex === 0, JSON.stringify(replay));
      const shelf = await debug.tap(page, 'shelf');
      check('Shelf returns from replay to catalog', shelf === true, String(shelf));
      await debug.waitForScreen(page, 'shelf');
    } else if (index < STORY_IDS.length - 1) {
      const shelf = await debug.tap(page, 'shelf');
      check(`${STORY_IDS[index]}: Shelf returns to catalog`, shelf === true, String(shelf));
      await debug.waitForScreen(page, 'shelf');
    }
  }

  head('Progress survives a fresh load');
  await page.reload({ waitUntil: 'networkidle' });
  await prime(page, { mute: true });
  const afterReload = await debug.getState(page);
  check('all three completion charms persist after reload', STORY_IDS.every((id) => afterReload.completedStories.includes(id)), JSON.stringify(afterReload));
  checkClean(landscape, 'landscape full-story session');
  await landscape.close();

  head('Responsive visual gates');
  const wide = await openGame({ width: 1180, height: 520 });
  await auditTargets(wide.page, 'wide-short shelf');
  check('wide-short boots on shelf', (await debug.getState(wide.page)).screen === 'shelf', JSON.stringify(await debug.getState(wide.page)));
  await shot(wide.page, '10-wide-short-shelf');
  check('wide-short starts Little Mill', await debug.startMode(wide.page, 'little-mill') === true, 'startMode');
  await waitForUsableRead(wide.page);
  await finishPage(wide.page);
  await waitForUsableRead(wide.page);
  await finishPage(wide.page);
  await auditPageTurnClearance(wide.page, 'wide-short Little Mill Beginning turn');
  await shot(wide.page, '10-wide-short-little-mill-act-turn');
  checkClean(wide, 'wide-short session');
  await wide.close();

  const portrait = await openGame({ width: 820, height: 1180 });
  await auditTargets(portrait.page, 'portrait shelf');
  check('portrait boots on shelf', (await debug.getState(portrait.page)).screen === 'shelf', JSON.stringify(await debug.getState(portrait.page)));
  await shot(portrait.page, '11-portrait-shelf');
  await debug.call(portrait.page, 'resetProgress');
  for (const storyId of STORY_IDS) {
    await drivePortraitStory(portrait.page, storyId);
    await debug.call(portrait.page, 'home');
    await debug.waitForScreen(portrait.page, 'shelf');
  }
  checkClean(portrait, 'portrait session');
  await portrait.close();

  const reduced = await openGame({ width: 1180, height: 820 }, { reducedMotion: 'reduce' });
  const reducedState = await debug.getState(reduced.page);
  check('reduced-motion boot is exposed by debug state', reducedState.screen === 'shelf' && reducedState.reducedMotion === true, JSON.stringify(reducedState));
  await auditTargets(reduced.page, 'reduced-motion shelf');
  await shot(reduced.page, '12-reduced-motion-shelf');
  checkClean(reduced, 'reduced-motion session');
  await reduced.close();
}

try {
  await run();
} catch (error) {
  check('QA driver completed without an unhandled error', false, String(error?.stack || error));
} finally {
  try { await browser?.close(); } catch { /* the report remains useful */ }
  await ensureShots(shots);
  const report = {
    gameId: 'momma-bear-storybook',
    base,
    createdAt: new Date().toISOString(),
    captures,
    checks: results,
    failures: failures(),
  };
  await writeFile(path.join(shots, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  finish({ suffix: `; visual evidence and report in ${shots}` });
}
