#!/usr/bin/env node
/** Package accepted Qwen3 teacher clips; retry failed transcripts at seeds 7/8/9. */
import { execFile } from 'node:child_process';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, '..');
const repoRoot = path.resolve(gameRoot, '../..');
const audioDir = path.join(gameRoot, 'assets/audio');
const recipesDir = path.join(gameRoot, 'assets/source/voice-recipes');
const transcriptsDir = path.join(gameRoot, 'assets/source/voice-qa');
const studio = process.env.QLOBE_STUDIO_URL || 'http://127.0.0.1:8002';
const seeds = [7, 8, 9];
const minimumTranscriptRatio = 0.98;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error || response.statusText}`);
  return body;
}

async function mediaState(mediaId) {
  const folder = path.join(repoRoot, 'shared/media', mediaId);
  try {
    const [recipe, transcript] = await Promise.all([
      readFile(path.join(folder, 'recipe.json'), 'utf8').then(JSON.parse),
      readFile(path.join(folder, 'qa-transcript.json'), 'utf8').then(JSON.parse),
    ]);
    const asset = path.join(folder, recipe.asset || `${mediaId}.m4a`);
    await readFile(asset);
    return { folder, asset, recipe, transcript };
  } catch { return null; }
}

async function generate(key, text, seed) {
  const mediaId = `bzl-voice-${key}`;
  const queued = await jsonRequest(`${studio}/api/studio/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template: 'character-voice-line',
      fields: { text },
      params: { id: mediaId, seed, overwrite: true },
    }),
  });
  for (;;) {
    await sleep(2000);
    const { job } = await jsonRequest(`${studio}/api/studio/jobs/${queued.jobId}`);
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
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`Invalid duration: ${file}`);
  return Number(seconds.toFixed(3));
}

function transcriptPass(media) {
  return Boolean(media?.transcript?.match)
    && Number(media.transcript.ratio) >= minimumTranscriptRatio;
}

await Promise.all([audioDir, recipesDir, transcriptsDir].map((folder) => mkdir(folder, { recursive: true })));
const config = JSON.parse(await readFile(path.join(gameRoot, 'config.json'), 'utf8'));
const lines = config.voice;
const manifest = {};

for (const [key, text] of Object.entries(lines)) {
  const mediaId = `bzl-voice-${key}`;
  let media = await mediaState(mediaId);
  if (!transcriptPass(media)) {
    for (const seed of seeds) {
      media = await generate(key, text, seed);
      if (transcriptPass(media)) break;
    }
  }
  if (!transcriptPass(media)) throw new Error(`${key}: transcript QA stayed below ${minimumTranscriptRatio}`);
  await jsonRequest(`${studio}/api/studio/media/${mediaId}/accept`, { method: 'POST' });
  media = await mediaState(mediaId);
  const target = path.join(audioDir, `${key}.m4a`);
  await copyFile(media.asset, target);
  await copyFile(path.join(media.folder, 'recipe.json'), path.join(recipesDir, `${key}.recipe.json`));
  await copyFile(path.join(media.folder, 'qa-transcript.json'), path.join(transcriptsDir, `${key}.json`));
  manifest[key] = { file: `${key}.m4a`, dur: await duration(target) };
  process.stdout.write(`${key}: ${media.transcript.ratio}, ${manifest[key].dur}s\n`);
}

await Promise.all([
  writeFile(path.join(audioDir, 'lines.json'), `${JSON.stringify(lines, null, 2)}\n`),
  writeFile(path.join(audioDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
]);
process.stdout.write(`Packaged ${Object.keys(manifest).length} recorded lines.\n`);
