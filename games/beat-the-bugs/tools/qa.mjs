#!/usr/bin/env node
// Real-Chrome smoke and visual-QC driver for Beat the Bugs.
import path from 'node:path';
import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, debug, audio,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const url = `${base}/games/beat-the-bugs/`;
const outIndex = process.argv.indexOf('--out');
const shots = outIndex >= 0 && process.argv[outIndex + 1]
  ? path.resolve(process.argv[outIndex + 1])
  : resolveShots('games/beat-the-bugs/tmp/qa');
const { check, finish } = createReporter();
const sessions = [];
const platformAnalytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

async function openGame(browser, viewport, reducedMotion = 'no-preference', mute = true) {
  const session = await openSession(browser, {
    url, base, viewport, reducedMotion, goto: false, ready: false,
    allowAbortedMedia: true, allowRemote: [...platformAnalytics, 'blob:'],
  });
  await session.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, async (route) => {
    await route.fulfill({ status: 204, contentType: 'text/javascript', body: '' });
  });
  await session.page.goto(url, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page);
  await debug.waitForReady(session.page);
  await debug.seed(session.page, 42);
  await debug.mute(session.page, mute);
  sessions.push(session);
  return session.page;
}
async function openHub(browser) {
  const session = await openSession(browser, {
    url: `${base}/#practical-life`, base, viewport: { width: 1180, height: 820 },
    goto: false, ready: false, allowRemote: platformAnalytics,
  });
  await session.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, async (route) => {
    await route.fulfill({ status: 204, contentType: 'text/javascript', body: '' });
  });
  await session.page.goto(`${base}/#practical-life`, { waitUntil: 'networkidle' });
  sessions.push(session);
  return session.page;
}
async function visibleImagesDecode(page) {
  return page.locator('img:visible').evaluateAll((images) => ({
    count: images.length,
    ok: images.length > 0 && images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0),
  }));
}
async function rasterStatus(page) {
  return page.evaluate(async () => {
    const urls = [...document.querySelectorAll('*')].flatMap((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden') return [];
      return [...style.backgroundImage.matchAll(/url\(["']?([^"')]+)["']?\)/g)].map((match) => new URL(match[1], location.href).href);
    });
    const unique = [...new Set(urls)];
    const responses = await Promise.all(unique.map((u) => fetch(u).then((r) => ({ url: u, ok: r.ok, type: r.headers.get('content-type') || '' })).catch(() => ({ url: u, ok: false, type: '' }))));
    return { count: unique.length, ok: responses.every((r) => r.ok && r.type.startsWith('image/')), failed: responses.filter((r) => !r.ok || !r.type.startsWith('image/')) };
  });
}
function inside(rect, viewport) {
  return rect && rect.x >= -1 && rect.y >= -1 && rect.x + rect.w <= viewport.width + 1 && rect.y + rect.h <= viewport.height + 1;
}
async function screenChecks(page, viewport, name) {
  const images = await visibleImagesDecode(page);
  const backgrounds = await rasterStatus(page);
  check(`${name} visible raster art decodes`, images.ok, JSON.stringify(images));
  check(`${name} CSS raster assets load`, backgrounds.count > 0 && backgrounds.ok, JSON.stringify(backgrounds));
  const targets = await debug.getTargets(page);
  check(`${name} controls meet 96px touch floor`, targets.every(({ rect }) => Math.min(rect.w, rect.h) >= 96), JSON.stringify(targets));
  check(`${name} target boxes stay in viewport`, targets.every(({ rect }) => inside(rect, viewport)));
  return targets;
}
async function checkNavRule(page, screen) {
  const visibleHome = await page.locator('.qk-hud-home:visible').count();
  check(`${screen} obeys home-only-on-splash navigation`, visibleHome === (screen === 'splash' ? 1 : 0));
}
async function completeMode(page, mode, shotPrefix) {
  await page.locator(`[data-target="${mode}"]`).click();
  await debug.waitForScreen(page, 'play');
  const state = await debug.getState(page);
  const expected = mode === 'suds' ? ['wet','soap','palms','backs','between','nails','rinse'] : ['paste','fronts','tops','insides','tongue','floss','two-by-two'];
  check(`${mode} starts with exact teaching sequence`, state.mode === mode && state.phase === 0 && state.zone === expected[0]);
  for (const step of expected) {
    const before = await debug.getState(page);
    check(`${mode} step ${step} is current`, before.zone === step);
    if (step === (mode === 'suds' ? 'palms' : 'fronts')) {
      const board = page.locator('[data-target="board"]');
      const box = await board.boundingBox();
      await page.mouse.move(box.x + box.width * .35, box.y + box.height * .5);
      await page.mouse.down();
      for (let i = 1; i <= 5; i += 1) {
        await page.waitForTimeout(110);
        await page.mouse.move(box.x + box.width * (.35 + i * .06), box.y + box.height * (.5 + (i % 2 ? .05 : -.05)));
      }
      await page.mouse.up();
      const afterPointer = await debug.getState(page);
      check(`${mode} accepts real pointer movement`, afterPointer.coverage > 0, JSON.stringify(afterPointer));
      if (mode === 'suds') {
        await page.mouse.move(box.x + box.width * .45, box.y + box.height * .5); await page.mouse.down();
        await page.waitForTimeout(110); await page.mouse.move(box.x + box.width * .55, box.y + box.height * .5);
        const beforeEscape = (await debug.getState(page)).coverage;
        await page.waitForTimeout(130); await page.mouse.move(box.x + box.width + 80, box.y + box.height * .5);
        await page.waitForTimeout(130); await page.mouse.move(box.x + box.width + 140, box.y + box.height * .6); await page.mouse.up();
        const afterEscape = (await debug.getState(page)).coverage;
        check('leaving the board cancels a scrub without earning outside progress', Math.abs(afterEscape - beforeEscape) < .001, JSON.stringify({ beforeEscape, afterEscape }));

        await page.mouse.move(box.x + box.width * .42, box.y + box.height * .52); await page.mouse.down();
        await page.waitForTimeout(110); await page.mouse.move(box.x + box.width * .52, box.y + box.height * .52);
        const beforeResize = (await debug.getState(page)).coverage;
        await page.setViewportSize({ width: 1160, height: 800 });
        await page.waitForTimeout(130); await page.mouse.move(box.x + box.width * .68, box.y + box.height * .62); await page.mouse.up();
        const afterResize = (await debug.getState(page)).coverage;
        check('resize cancels an active scrub without adding stale progress', Math.abs(afterResize - beforeResize) < .001, JSON.stringify({ beforeResize, afterResize }));
        await page.setViewportSize({ width: 1180, height: 820 });
        const freshBox = await board.boundingBox();
        await page.mouse.move(freshBox.x + freshBox.width * .4, freshBox.y + freshBox.height * .5); await page.mouse.down();
        await page.waitForTimeout(110); await page.mouse.move(freshBox.x + freshBox.width * .5, freshBox.y + freshBox.height * .5); await page.mouse.up();
        check('a fresh scrub starts normally after resize cleanup', (await debug.getState(page)).coverage > afterResize);
      }
      await debug.call(page, 'stroke', step, mode === 'suds' ? 2.5 : 2);
      const mid = await debug.getState(page);
      check(`${mode} gesture records partial continuous progress`, mid.coverage > 0 && mid.coverage < (mode === 'suds' ? 5 : 4));
      const guidance = await page.evaluate(() => {
        const boardRect = document.querySelector('[data-target="board"]').getBoundingClientRect();
        const ring = document.querySelector('[data-ring]');
        const ringStyle = getComputedStyle(ring);
        return { widthRatio: parseFloat(ringStyle.width) / boardRect.width, opacity: Number(ringStyle.opacity) };
      });
      check(`${mode} guidance ring is compact and translucent`, guidance.widthRatio <= .43 && guidance.opacity <= .55, JSON.stringify(guidance));
      await screenChecks(page, { width: 1180, height: 820 }, `${mode} gesture`);
      await page.screenshot({ path: path.join(shots, shotPrefix) });
    }
    if (step === 'floss') {
      const boxes = await page.locator('.bb-floss-gap').evaluateAll((nodes) => nodes.map((node) => { const r=node.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; }));
      await page.mouse.move(boxes[0].x,boxes[0].y); await page.mouse.down();
      await page.mouse.move(boxes[1].x,boxes[1].y,{steps:4}); await page.mouse.move(boxes[2].x,boxes[2].y,{steps:4}); await page.mouse.up();
      check(`${mode} floss drag reaches all three gaps`, (await debug.getState(page)).flossGaps.length === 3);
      await page.screenshot({ path: path.join(shots, '06-floss.png') });
    } else if (step === 'soap') {
      await page.locator('[data-target="tool"]').click(); await page.locator('[data-target="tool"]').click();
    } else if (['wet','paste','rinse','two-by-two'].includes(step)) {
      if (step === 'two-by-two') {
        check('two-by-two clears the completed floss targets', await page.locator('[data-floss]:visible').count() === 0);
      }
      await page.screenshot({ path: path.join(shots, '07-two-by-two.png') });
      await page.locator('[data-target="tool"]').click();
    } else {
      await debug.call(page, 'completeStep');
    }
    await page.waitForTimeout(320);
  }
  await debug.waitForScreen(page, 'reward');
  const reward = await debug.getState(page);
  const exactProgress = mode === 'suds' ? reward.bubbles === 20 : reward.stars === 16;
  check(`${mode} reaches exact progress total and reward badge`, exactProgress && reward.badges[mode] === true && reward.screen === 'reward', JSON.stringify(reward));
  await checkNavRule(page, 'reward');
  await screenChecks(page, { width: 1180, height: 820 }, `${mode} reward`);
  await page.screenshot({ path: path.join(shots, shotPrefix.replace('play', 'reward')) });
}
async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ channel: 'chrome' });
  try {
    const hub = await openHub(browser);
    const hubTile = hub.locator('a.game-card[data-game-id="beat-the-bugs"]');
    await hubTile.waitFor({ state: 'visible' });
    check('hub exposes the registered Beat the Bugs beta tile', await hubTile.count() === 1);
    const hubImage = hubTile.locator('img');
    await hubTile.evaluate((node) => node.scrollIntoView({ block: 'center' }));
    await hub.waitForTimeout(250);
    await hubImage.evaluate((node) => { node.loading = 'eager'; });
    await hub.waitForFunction((node) => node.complete && node.naturalWidth > 0, await hubImage.elementHandle());
    const hubArt = await hubImage.evaluate((node) => ({ src: node.getAttribute('src'), width: node.naturalWidth, height: node.naturalHeight }));
    check('hub decodes the curated 6:5 GPT Image 2 tile', /assets\/hub\/tiles\/beat-the-bugs\.jpg$/.test(hubArt.src || '') && hubArt.width === 640 && hubArt.height === 533, JSON.stringify(hubArt));
    await hub.screenshot({ path: path.join(shots, '00-hub.png') });
    await Promise.all([hub.waitForURL('**/games/beat-the-bugs/'), hubTile.click()]);
    await debug.waitForHook(hub); await debug.waitForReady(hub);
    check('hub route boots Beat the Bugs to its ready splash', (await debug.getState(hub)).screen === 'splash');

    const page = await openGame(browser, { width: 1180, height: 820 });
    const modes = await debug.listModes(page);
    check('splash boots', (await debug.getState(page)).screen === 'splash');
    check('valid mode list', modes.length === 2 && modes.map((m) => m.id).join(',') === 'suds,smile', JSON.stringify(modes));
    await screenChecks(page, { width: 1180, height: 820 }, 'splash');
    await checkNavRule(page, 'splash');
    await page.screenshot({ path: path.join(shots, '01-splash.png') });
    await completeMode(page, 'suds', '02-suds-play.png');
    const audioAfterSuds = await debug.getAudioLog(page);
    check('suds records expected voice keys', audioAfterSuds.some((e) => e.key === 'suds-intro') && audioAfterSuds.some((e) => e.key === 'suds-cheer'));
    await debug.tap(page, 'choose');
    await completeMode(page, 'smile', '04-smile-play.png');
    await debug.tap(page, 'choose');
    await debug.waitForScreen(page, 'finale');
    check('finale appears after both badges', (await debug.getState(page)).badges.suds && (await debug.getState(page)).badges.smile);
    await checkNavRule(page, 'finale');
    await page.screenshot({ path: path.join(shots, '09-finale.png') });
    const log = await debug.getAudioLog(page);
    check('finale voice is present', audio.heard(log, 'finale'));
    const manifestAvailable = await page.evaluate(() => fetch('./assets/audio/manifest.json').then((response) => response.ok).catch(() => false));
    if (manifestAvailable) check('accepted teacher lines resolve to recorded clips', log.filter((entry) => ['suds-intro','suds-cheer','smile-intro','smile-cheer','finale'].includes(entry.key)).every((entry) => entry.kind === 'clip'), JSON.stringify(log));
    const music = await debug.call(page, 'musicStats');
    check('BGM is keyed to the recorded playground track after mission start', music.key === 'beat-the-bugs' && /upbeat-playground-pop\.mp3$/.test(music.url || ''), JSON.stringify(music));
    const finalState = await debug.getState(page);
    check('runtime invariants remain healthy', finalState.screen === 'finale' && finalState.mode === 'smile' && finalState.failed !== true && finalState.badges.suds && finalState.badges.smile, JSON.stringify(finalState));
    check('finale keeps authored raster celebration accents after motion ends', await page.locator('.bb-finale-aura img:visible').count() === 8);
    await screenChecks(page, { width: 1180, height: 820 }, 'finale');
    const audioProbe = await openGame(browser, { width: 640, height: 480 }, 'no-preference', false);
    await audioProbe.locator('[data-target="suds"]').click();
    await debug.waitForAudio(audioProbe, 'suds-intro');
    const probe = await audioProbe.evaluate(async () => {
      const manifest = await fetch('./assets/audio/manifest.json').then((r) => r.json());
      const clip = manifest.clips?.['suds-intro'] || manifest['suds-intro'];
      const response = await fetch(`./assets/audio/${clip?.file || 'suds-intro.m4a'}`);
      const body = await response.arrayBuffer();
      const type = response.headers.get('content-type') || 'audio/mp4';
      const decoded = await new AudioContext().decodeAudioData(body.slice(0));
      const element = new Audio(URL.createObjectURL(new Blob([body], { type })));
      await new Promise((resolve,reject)=>{element.addEventListener('canplay',resolve,{once:true});element.addEventListener('error',reject,{once:true});element.load();});
      const played = await element.play().then(()=>true,()=>false); element.pause();
      return { status: response.status, type, bytes: body.byteLength, duration: decoded.duration, state: element.readyState, error: element.error?.code || 0, played };
    });
    check('unmuted recorded clip fetches, decodes, and plays', probe.status >= 200 && probe.status < 300 && probe.type.startsWith('audio/') && probe.bytes > 0 && probe.duration > 0 && probe.state >= 2 && probe.error === 0 && probe.played, JSON.stringify(probe));
    const portrait = await openGame(browser, { width: 820, height: 1180 });
    const portraitTargets = await screenChecks(portrait, { width: 820, height: 1180 }, 'portrait splash');
    const portraitSuds = portraitTargets.find(({ id }) => id === 'suds')?.rect;
    const portraitSmile = portraitTargets.find(({ id }) => id === 'smile')?.rect;
    const portraitHero = await portrait.locator('.bb-splash .bb-maya').boundingBox();
    check('portrait splash stacks large mission choices below a complete hero',
      portraitSuds && portraitSmile && portraitHero
        && Math.abs(portraitSuds.x - portraitSmile.x) < 2
        && portraitSmile.y > portraitSuds.y + portraitSuds.h
        && portraitSuds.w >= 400 && inside({ x: portraitHero.x, y: portraitHero.y, w: portraitHero.width, h: portraitHero.height }, { width: 820, height: 1180 }),
      JSON.stringify({ portraitSuds, portraitSmile, portraitHero }));
    await portrait.screenshot({ path: path.join(shots, '10-portrait-splash.png') });
    await portrait.locator('[data-target="suds"]').click(); await debug.waitForScreen(portrait, 'play');
    await screenChecks(portrait, { width: 820, height: 1180 }, 'portrait mission');
    await portrait.screenshot({ path: path.join(shots, '11-portrait-mission.png') });
    await debug.winRound(portrait); await debug.waitForScreen(portrait, 'reward');
    await screenChecks(portrait, { width: 820, height: 1180 }, 'portrait reward');
    await portrait.screenshot({ path: path.join(shots, '12-portrait-reward.png') });
    await debug.tap(portrait, 'choose'); await debug.waitForScreen(portrait, 'splash');
    await portrait.locator('[data-target="smile"]').click(); await debug.waitForScreen(portrait, 'play');
    await debug.winRound(portrait); await debug.waitForScreen(portrait, 'reward');
    await debug.tap(portrait, 'choose'); await debug.waitForScreen(portrait, 'finale');
    await screenChecks(portrait, { width: 820, height: 1180 }, 'portrait finale');
    check('portrait finale keeps its permanent raster aura', await portrait.locator('.bb-finale-aura img:visible').count() === 8);
    await portrait.screenshot({ path: path.join(shots, '14-portrait-finale.png') });
    const reduced = await openGame(browser, { width: 1180, height: 820 }, 'reduce');
    await screenChecks(reduced, { width: 1180, height: 820 }, 'reduced-motion splash');
    await debug.startMode(reduced, 'suds'); await debug.waitForScreen(reduced, 'play');
    check('runtime detects reduced motion', (await debug.getState(reduced)).reducedMotion === true);
    await screenChecks(reduced, { width: 1180, height: 820 }, 'reduced-motion play');
    await debug.winRound(reduced); await debug.waitForScreen(reduced, 'reward');
    await screenChecks(reduced, { width: 1180, height: 820 }, 'reduced-motion reward');
    await reduced.screenshot({ path: path.join(shots, '13-reduced-motion-reward.png') });
    sessions.forEach((session,index)=>checkSessionClean({ check }, session, `session ${index + 1}`));
  } finally { await Promise.all(sessions.map((session) => session.close())); await browser.close(); }
  finish({ suffix: `; screenshots in ${shots}` });
}
main().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
