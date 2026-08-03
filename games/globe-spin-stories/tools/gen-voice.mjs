#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { mkdir, readFile, copyFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, '..');
const repoRoot = path.resolve(gameRoot, '../..');
const linesPath = path.join(gameRoot, 'data', 'lines.json');
const audioDir = path.join(gameRoot, 'assets', 'audio');
const recipesDir = path.join(gameRoot, 'assets', 'source', 'voice-recipes');
const transcriptsDir = path.join(gameRoot, 'assets', 'source', 'voice-qa');
const studio = process.env.QLOBE_STUDIO_URL || 'http://127.0.0.1:8000';
const seeds = [7, 8, 9];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${response.status} ${body.error || response.statusText}`);
  return body;
}

async function mediaState(mediaId) {
  const folder = path.join(repoRoot, 'shared', 'media', mediaId);
  try {
    const [recipe, transcript] = await Promise.all([
      readFile(path.join(folder, 'recipe.json'), 'utf8').then(JSON.parse),
      readFile(path.join(folder, 'qa-transcript.json'), 'utf8').then(JSON.parse),
    ]);
    const asset = path.join(folder, recipe.asset || `${mediaId}.m4a`);
    await readFile(asset);
    return { folder, asset, recipe, transcript };
  } catch {
    return null;
  }
}

async function generate(key, text, seed) {
  const mediaId = `gss-voice-${key}`;
  const queued = await jsonRequest(`${studio}/api/studio/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      template: 'character-voice-line',
      fields: { text },
      params: { id: mediaId, seed, overwrite: true },
    }),
  });
  process.stdout.write(`  queued seed ${seed} (${queued.jobId})\n`);

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
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error(`invalid duration for ${file}`);
  return Number(seconds.toFixed(3));
}

async function stage(key, media) {
  const audioPath = path.join(audioDir, `${key}.m4a`);
  await copyFile(media.asset, audioPath);
  await copyFile(path.join(media.folder, 'recipe.json'), path.join(recipesDir, `${key}.recipe.json`));
  await copyFile(path.join(media.folder, 'qa-transcript.json'), path.join(transcriptsDir, `${key}.json`));
  return { file: `${key}.m4a`, dur: await duration(audioPath) };
}

await Promise.all([audioDir, recipesDir, transcriptsDir].map((folder) => mkdir(folder, { recursive: true })));
const lines = JSON.parse(await readFile(linesPath, 'utf8'));
const manifest = {};
let number = 0;

for (const [key, text] of Object.entries(lines)) {
  number += 1;
  const mediaId = `gss-voice-${key}`;
  process.stdout.write(`[${number}/${Object.keys(lines).length}] ${key}\n`);
  let media = await mediaState(mediaId);

  if (!media?.transcript?.match) {
    for (const seed of seeds) {
      media = await generate(key, text, seed);
      if (media?.transcript?.match) break;
      process.stdout.write(`  transcript ratio ${media?.transcript?.ratio ?? 'unavailable'}; retrying\n`);
    }
  }

  if (!media?.transcript?.match) throw new Error(`${key}: transcript QA did not pass after ${seeds.length} seeds`);
  await jsonRequest(`${studio}/api/studio/media/${mediaId}/accept`, { method: 'POST' });
  media = await mediaState(mediaId);
  manifest[key] = await stage(key, media);
  process.stdout.write(`  accepted ratio ${media.transcript.ratio}, ${manifest[key].dur}s\n`);
}

await writeFile(path.join(audioDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`Wrote ${Object.keys(manifest).length} recorded lines to ${path.relative(repoRoot, audioDir)}\n`);
