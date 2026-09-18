#!/usr/bin/env node

/** Author accepted teacher-voice clips through QLOBE Studio with Whisper QA. */
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, '..');
const repoRoot = path.resolve(gameRoot, '../..');
const audioDir = path.join(gameRoot, 'assets/audio');
const recipeDir = path.join(gameRoot, 'assets/source/voice-recipes');
const qaDir = path.join(gameRoot, 'assets/source/voice-qa');
const voiceRef = path.join(repoRoot, 'shared/assets/refs/voice-teacher.wav');
const studioInput = process.env.QLOBE_STUDIO_URL;
const allowLan = process.argv.includes('--allow-lan');
const seeds = [7, 8, 9];
const threshold = 0.96;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

if (!allowLan) throw new Error('Refusing generation without --allow-lan.');
if (!studioInput) throw new Error('Set QLOBE_STUDIO_URL to the approved local Studio server.');
let studio;
try { studio = new URL(studioInput); } catch { throw new Error('QLOBE_STUDIO_URL is invalid.'); }
const privateHost = studio.hostname === 'localhost' || studio.hostname === '127.0.0.1'
  || /^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(studio.hostname)
  || /^192\.168\.(?:\d{1,3}\.)\d{1,3}$/.test(studio.hostname)
  || /^172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3}$/.test(studio.hostname);
if (!privateHost || !['http:', 'https:'].includes(studio.protocol) || studio.username || studio.password) {
  throw new Error('Studio server must be an uncredentialed private/LAN HTTP(S) address.');
}
const studioBase = studio.origin;

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status}: ${body.error || response.statusText}`);
  return body;
}

async function mediaState(mediaId) {
  const folder = path.join(repoRoot, 'shared/media', mediaId);
  try {
    const [recipe, transcript] = await Promise.all([
      readFile(path.join(folder, 'recipe.json'), 'utf8').then(JSON.parse),
      readFile(path.join(folder, 'qa-transcript.json'), 'utf8').then(JSON.parse),
    ]);
    const assetName = recipe.asset || `${mediaId}.m4a`;
    if (path.basename(assetName) !== assetName || !assetName.endsWith('.m4a')) throw new Error('unsafe media filename');
    const asset = path.join(folder, assetName);
    await readFile(asset);
    return { folder, recipe, transcript, asset };
  } catch (error) {
    if (error.message === 'unsafe media filename') throw error;
    return null;
  }
}

function passes(media, expected) {
  return Boolean(media?.transcript?.match)
    && Number(media.transcript.ratio) >= threshold
    && media.transcript.intended === expected
    && media.recipe?.steps?.[0]?.text === expected
    && media.recipe?.refs?.voice === 'teacher';
}

async function generate(mediaId, text, seed) {
  const queued = await jsonRequest(`${studioBase}/api/studio/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template: 'character-voice-line',
      fields: { text },
      params: { id: mediaId, seed, overwrite: true },
    }),
  });
  process.stdout.write(`  queued seed ${seed}\n`);
  for (;;) {
    await sleep(1500);
    const { job } = await jsonRequest(`${studioBase}/api/studio/jobs/${queued.jobId}`);
    if (job.status === 'completed') return mediaState(mediaId);
    if (['failed', 'cancelled', 'canceled'].includes(job.status)) {
      throw new Error(job.error || job.message || `job ${job.status}`);
    }
  }
}

async function duration(file) {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file,
  ]);
  const seconds = Number(JSON.parse(stdout).format.duration);
  if (!(seconds > 0)) throw new Error(`Invalid duration for ${file}`);
  return Number(seconds.toFixed(3));
}

await readFile(voiceRef);
const config = JSON.parse(await readFile(path.join(gameRoot, 'config.json'), 'utf8'));
const lines = JSON.parse(await readFile(path.join(audioDir, 'lines.json'), 'utf8'));
if (JSON.stringify(config.voice) !== JSON.stringify(lines)) throw new Error('config.voice and audio/lines.json differ');
const plan = Object.entries(lines).map(([key, text]) => ({ key, text, mediaId: `sweep-trail-${key}` }));
const staging = path.join(audioDir, `.voice-staging-${process.pid}`);
await rm(staging, { recursive: true, force: true });
await Promise.all([
  mkdir(path.join(staging, 'audio'), { recursive: true }),
  mkdir(path.join(staging, 'recipes'), { recursive: true }),
  mkdir(path.join(staging, 'qa'), { recursive: true }),
]);

const manifest = {};
try {
  for (const [index, item] of plan.entries()) {
    process.stdout.write(`[${index + 1}/${plan.length}] ${item.key}\n`);
    let media = await mediaState(item.mediaId);
    if (!passes(media, item.text)) {
      for (const seed of seeds) {
        media = await generate(item.mediaId, item.text, seed);
        if (passes(media, item.text)) break;
        process.stdout.write(`  Whisper ratio ${media?.transcript?.ratio ?? 'unavailable'}; retrying\n`);
      }
    }
    if (!passes(media, item.text)) throw new Error(`${item.key}: transcript QA remained below ${threshold}`);
    await jsonRequest(`${studioBase}/api/studio/media/${item.mediaId}/accept`, { method: 'POST' });
    media = await mediaState(item.mediaId);
    if (!passes(media, item.text)) throw new Error(`${item.key}: accepted media failed provenance/QA`);

    const target = path.join(staging, 'audio', `${item.key}.m4a`);
    await copyFile(media.asset, target);
    await copyFile(path.join(media.folder, 'recipe.json'), path.join(staging, 'recipes', `${item.key}.recipe.json`));
    await copyFile(path.join(media.folder, 'qa-transcript.json'), path.join(staging, 'qa', `${item.key}.json`));
    manifest[item.key] = { file: `${item.key}.m4a`, dur: await duration(target) };
    process.stdout.write(`  accepted ${media.transcript.ratio}, ${manifest[item.key].dur}s\n`);
  }

  await writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await Promise.all([mkdir(audioDir, { recursive: true }), mkdir(recipeDir, { recursive: true }), mkdir(qaDir, { recursive: true })]);
  for (const item of plan) {
    await rename(path.join(staging, 'audio', `${item.key}.m4a`), path.join(audioDir, `${item.key}.m4a`));
    await rename(path.join(staging, 'recipes', `${item.key}.recipe.json`), path.join(recipeDir, `${item.key}.recipe.json`));
    await rename(path.join(staging, 'qa', `${item.key}.json`), path.join(qaDir, `${item.key}.json`));
  }
  await rename(path.join(staging, 'manifest.json'), path.join(audioDir, 'manifest.json'));
} finally {
  await rm(staging, { recursive: true, force: true });
}

console.log(`Packaged ${plan.length} Qwen teacher clips with Whisper QA.`);
