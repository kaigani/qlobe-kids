// Production Chrome QA for Subtraction Picnic.
// Run from qlobe-kids after starting a static server:
// node games/subtraction-picnic/tools/qa.mjs http://localhost:4173
import { launchChrome } from '../../../tools/qa/lib/driver.mjs';

const base = process.argv[2] || 'http://localhost:4173';
const url = `${base}/games/subtraction-picnic/`;
const shots = 'games/subtraction-picnic/assets/source/qa';
const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
const localFailures = [];
const localOrigin = new URL(base).origin;
page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
page.on('pageerror', (error) => errors.push(error.message));
page.on('requestfailed', (request) => {
  const reason = request.failure()?.errorText || 'failed';
  if (reason === 'net::ERR_ABORTED' && request.resourceType() === 'media') return;
  if (new URL(request.url()).origin === localOrigin) localFailures.push(`${reason} ${request.url()}`);
});
page.on('response', (response) => {
  if (new URL(response.url()).origin === localOrigin && response.status() >= 400) localFailures.push(`HTTP ${response.status()} ${response.url()}`);
});
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
await page.evaluate(() => QLOBE_DEBUG.fastTimers(0.04));
await page.screenshot({ path: `${shots}/runtime-splash-1024x768.png` });
await page.click('[data-target="mode-forest"]');
await page.waitForTimeout(80);
const musicStarted = await page.evaluate(async () => (await import('/shared/js/bgm.js')).stats());
if (!musicStarted.key) throw new Error('background music did not start from the mode gesture');
await page.evaluate(() => QLOBE_DEBUG.home());
await page.waitForTimeout(650);
const musicStopped = await page.evaluate(async () => (await import('/shared/js/bgm.js')).stats());
if (musicStopped.key || musicStopped.playing) throw new Error('background music did not stop after leaving play');
await page.evaluate(() => QLOBE_DEBUG.clearAudioLog());

const scenarios = await page.evaluate(async () => {
  const q = QLOBE_DEBUG;
  const out = [];
  for (const mode of q.listModes()) {
    await q.startMode(mode.id);
    await q.tap('sound');
    await q.winRound();
    out.push({ mode: mode.id, state: q.getState(), targets: q.getTargets() });
    await q.home();
  }
  return { out, audio: q.getAudioLog(), layout: q.getLayout() };
});

for (const scenario of scenarios.out) {
  if (scenario.state.screen !== 'play') throw new Error(`untruthful screen in ${scenario.mode}`);
  if (scenario.mode !== 'party' && scenario.state.phase !== 'reveal') {
    throw new Error(`${scenario.mode} did not complete a round`);
  }
  if (scenario.mode === 'party' && scenario.state.left !== 0) {
    throw new Error('Picnic Party debug completion did not reach zero');
  }
}

const requiredClipKeys = new Set(['forest-intro', 'practice-intro', 'party-intro', 'how-many-left', 'all-gone']);
for (const scenario of scenarios.out) {
  if (scenario.mode !== 'party') {
    requiredClipKeys.add(scenario.state.promptKey);
    requiredClipKeys.add(`equation-${scenario.state.start}-${scenario.state.take}-${scenario.state.left}`);
  }
}
for (const key of requiredClipKeys) {
  if (!scenarios.audio.some((event) => event.key === key && event.kind === 'clip')) {
    throw new Error(`recorded clip was not selected for ${key}`);
  }
}

// Let the intentionally asynchronous prior celebration finish before the
// clean layout plates are captured.
await page.waitForTimeout(3000);

for (const [width, height] of [[1024, 768], [768, 1024], [1180, 520], [844, 390]]) {
  await page.setViewportSize({ width, height });
  await page.evaluate(async () => {
    QLOBE_DEBUG.fastTimers(0.04);
    await QLOBE_DEBUG.startMode('party');
  });
  const targets = await page.evaluate(() => QLOBE_DEBUG.getTargets());
  for (const target of targets) {
    if (target.rect.w < 96 || target.rect.h < 96) {
      throw new Error(`undersized ${target.id} (${target.rect.w}×${target.rect.h}) at ${width}×${height}`);
    }
  }
  await page.screenshot({ path: `${shots}/runtime-party-${width}x${height}.png` });
  await page.evaluate(() => QLOBE_DEBUG.home());
  await page.screenshot({ path: `${shots}/runtime-splash-${width}x${height}.png` });
}

await page.setViewportSize({ width: 1024, height: 768 });
await page.evaluate(async () => {
  await QLOBE_DEBUG.startMode('forest');
  QLOBE_DEBUG.fastTimers(0.04);
});
const firstFood = await page.locator('[data-target="food-0"]').boundingBox();
await page.mouse.move(firstFood.x + firstFood.width / 2, firstFood.y + firstFood.height / 2);
await page.mouse.down();
await page.mouse.move(24, 420, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(80);
const givenAfterRejectedDrag = await page.evaluate(() => QLOBE_DEBUG.getState().given);
if (givenAfterRejectedDrag !== 0) throw new Error('an invalid drag fed a snack');
await page.click('[data-target="food-0"]');
await page.waitForTimeout(80);
await page.click('[data-target="food-1"]');
await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'answer');
await page.screenshot({ path: `${shots}/runtime-forest-answer-1024x768.png` });
const wrongTarget = await page.evaluate(() => {
  const left = QLOBE_DEBUG.getState().left;
  return [...document.querySelectorAll('.answer')].find((button) => Number(button.textContent) !== left)?.dataset.target;
});
if (!wrongTarget) throw new Error('answer round rendered no wrong-choice probe');
await page.evaluate(async (target) => QLOBE_DEBUG.tap(target), wrongTarget);
if (await page.evaluate(() => QLOBE_DEBUG.getState().phase) !== 'answer') {
  throw new Error('a wrong answer escaped the gentle retry state');
}
await page.evaluate(async () => {
  const state = QLOBE_DEBUG.getState();
  await QLOBE_DEBUG.tap(`answer-${state.left}`);
});
await page.waitForFunction(() => QLOBE_DEBUG.getState().phase === 'reveal');
await page.screenshot({ path: `${shots}/runtime-forest-reveal-1024x768.png` });
await page.evaluate(async () => {
  QLOBE_DEBUG.clearAudioLog();
  await QLOBE_DEBUG.tap('sound');
});
await page.waitForTimeout(50);
const revealReplay = await page.evaluate(() => QLOBE_DEBUG.getAudioLog());
if (!revealReplay.some((event) => event.key === 'equation-5-2-3' && event.kind === 'clip')) {
  throw new Error('reveal Sound did not replay the recorded solved equation');
}
for (const [width, height] of [[768, 1024], [844, 390]]) {
  await page.setViewportSize({ width, height });
  const revealTargets = await page.evaluate(() => QLOBE_DEBUG.getTargets());
  for (const target of revealTargets) {
    if (target.rect.w < 96 || target.rect.h < 96) {
      throw new Error(`undersized reveal ${target.id} (${target.rect.w}×${target.rect.h}) at ${width}×${height}`);
    }
  }
  await page.screenshot({ path: `${shots}/runtime-forest-reveal-${width}x${height}.png` });
}

await page.setViewportSize({ width: 1024, height: 768 });
await page.evaluate(async () => {
  await QLOBE_DEBUG.startMode('forest');
  for (let round = 0; round < 5; round += 1) {
    await QLOBE_DEBUG.winRound();
    await QLOBE_DEBUG.tap('next');
  }
});
await page.waitForFunction(() => QLOBE_DEBUG.getState().screen === 'finale');
await page.screenshot({ path: `${shots}/runtime-finale-1024x768.png` });
const finaleAudio = await page.evaluate(() => QLOBE_DEBUG.getAudioLog());
if (!finaleAudio.some((event) => event.key === 'mode-complete' && event.kind === 'clip')) {
  throw new Error('finale did not select the recorded completion clip');
}

if (errors.length) throw new Error(`browser errors:\n${errors.join('\n')}`);
if (localFailures.length) throw new Error(`local request failures:\n${localFailures.join('\n')}`);
console.log(JSON.stringify(scenarios, null, 2));
await browser.close();
