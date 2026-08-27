#!/usr/bin/env node

// Crop the approved UI contact sheet and stage UI masters as QLOBE media.
// Studio owns LAN inference; --queue only calls localhost Studio.
import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const ROOT = path.resolve(GAME, '../..');
const MEDIA = path.join(ROOT, 'shared', 'media');
const STUDIO = process.env.QLOBE_STUDIO_URL || 'http://127.0.0.1:8000';
const queue = process.argv.includes('--queue');
const today = new Date().toISOString().slice(0, 10);
const cells = ['word-tile', 'word-tile-done', 'button-again', 'button-shelf', 'act-tab', 'page-turn', 'page-stitch', 'button-lamp'];
const execution = 'exec-dfb237bf-e7c1-48aa-9f64-d3833399291d';
const titleExecution = 'exec-93436c15-d523-4418-9283-d0a6ff8bbf72';
const ffmpeg = process.env.FFMPEG_PATH || (spawnSync('which', ['ffmpeg'], { encoding: 'utf8' }).stdout || '').trim() || '/usr/local/bin/ffmpeg';
const staged = [];
const jobs = [];

function crop(source, output, x, y, width = 384, height = 512) {
  const result = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', source, '-vf', `crop=${width}:${height}:${x}:${y}`, '-frames:v', '1', output], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg crop failed for ${source}: ${result.stderr || result.error?.message || 'unknown error'}`);
}

async function stage(id, source, output, recipe, target, maxSize) {
  const folder = path.join(MEDIA, `momma-bear-ui-${id}`);
  const recipePath = path.join(folder, 'recipe.json');
  let existing = false;
  try { await access(recipePath); existing = true; } catch { /* new media */ }
  if (!existing) {
    await mkdir(folder, { recursive: true });
    await copyFile(source, path.join(folder, output));
    await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
  }
  if (queue) {
    const extractPrompt = 'Background layer = the exact flat saturated magenta input background. Top layer = the exact unchanged UI artwork and text from the input on transparency. Preserve every letter, glyph, edge, color, paper fiber, stitch, and proportion exactly. Do not redraw, restyle, translate, crop, add a shadow, or leave a magenta halo.';
    const response = await fetch(`${STUDIO}/api/studio/media/momma-bear-ui-${id}/extract`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, maxSize, pad: 24, seed: 42, extractPrompt }) });
    let result = {};
    try { result = await response.json(); } catch { /* retain status */ }
    if (response.ok) jobs.push({ id, jobId: result.jobId, status: 'queued' });
    else if (response.status === 409) jobs.push({ id, status: 'existing', detail: result.error || 'already queued or extracted' });
    else throw new Error(`${id}: ${result.error || response.statusText}`);
  }
  staged.push({ id, source: path.basename(source), existing, target, maxSize });
}

const sheet = path.join(GAME, 'assets', 'source', 'ui-masters', 'ui-kit-v1.png');
const title = path.join(GAME, 'assets', 'source', 'ui-masters', 'title-lockup-v1.png');
await access(sheet);
await access(title);
for (let index = 0; index < cells.length; index += 1) {
  const id = cells[index];
  const raw = path.join(GAME, 'assets', 'source', 'ui-crops', `${id}.raw.png`);
  await mkdir(path.dirname(raw), { recursive: true });
  crop(sheet, raw, (index % 4) * 384, Math.floor(index / 4) * 512);
  await stage(id, raw, `momma-bear-ui-${id}.png`, {
    format: 'qlobe-recipe', formatVersion: 1, id: `momma-bear-ui-${id}`, kind: 'image', asset: `momma-bear-ui-${id}.png`,
    steps: [
      { workflow: 'gpt-image-2', mode: 'built-in-imagegen', prompt: `Papercraft UI kit contact sheet for Momma Bear's Storybook: ${id}.`, promptRef: 'games/momma-bear-storybook/assets/source/ui-masters/PROMPTS.md#ui-kit', execution, output: 'ui-kit-v1.png' },
      { op: 'crop', from: 'ui-kit-v1.png', cell: { grid: [4, 2], index, x: (index % 4) * 384, y: Math.floor(index / 4) * 512, width: 384, height: 512 }, output: `momma-bear-ui-${id}.png` },
    ], refs: {}, qa: { status: 'review', sourceAccepted: true }, created: today,
  }, 'object', 640);
}

const titleRaw = path.join(GAME, 'assets', 'source', 'ui-masters', 'title-lockup-v1.raw.png');
await copyFile(title, titleRaw);
await stage('title', titleRaw, 'momma-bear-ui-title.png', {
  format: 'qlobe-recipe', formatVersion: 1, id: 'momma-bear-ui-title', kind: 'image', asset: 'momma-bear-ui-title.png',
  steps: [{ workflow: 'gpt-image-2', mode: 'built-in-imagegen', prompt: "Isolated Momma Bear's Storybook title lockup in papercraft style.", promptRef: 'games/momma-bear-storybook/assets/source/ui-masters/PROMPTS.md#title-lockup', execution: titleExecution, output: 'title-lockup-v1.png' }, { op: 'source', from: 'title-lockup-v1.png', crop: 'full-source-no-reliable-magenta-bounds', output: 'momma-bear-ui-title.png' }],
  refs: {}, qa: { status: 'review', sourceAccepted: true, cropDeferredToStudio: true }, created: today,
}, 'object', 1200);

const hud = path.join(GAME, 'assets', 'source', 'ui-masters', 'hud-kit-v1.png');
await access(hud);
for (const [index, id] of ['button-home', 'button-sound'].entries()) {
  const raw = path.join(GAME, 'assets', 'source', 'ui-crops', `${id}.raw.png`);
  await mkdir(path.dirname(raw), { recursive: true });
  crop(hud, raw, index * 768, 0, 768, 1024);
  await stage(id, raw, `momma-bear-ui-${id}.png`, {
    format: 'qlobe-recipe', formatVersion: 1, id: `momma-bear-ui-${id}`, kind: 'image', asset: `momma-bear-ui-${id}.png`,
    steps: [
      { workflow: 'gpt-image-2', mode: 'built-in-imagegen', prompt: `Papercraft HUD control for Momma Bear's Storybook: ${id}.`, promptRef: 'games/momma-bear-storybook/assets/source/ui-masters/PROMPTS.md#hud-kit', execution: 'exec-c18ca9a4-f24e-4dcd-9425-9811b632a6bf', output: 'hud-kit-v1.png' },
      { op: 'crop', from: 'hud-kit-v1.png', cell: { grid: [2, 1], index, x: index * 768, y: 0, width: 768, height: 1024 }, output: `momma-bear-ui-${id}.png` },
    ], refs: {}, qa: { status: 'review', sourceAccepted: true }, created: today,
  }, 'object', 640);
}

const output = { ok: true, staged: staged.length, queued: jobs.filter((job) => job.status === 'queued').length, jobs, ui: staged };
await mkdir(path.dirname(path.join(GAME, 'assets', 'source', 'ui-masters', 'qwen-layer-jobs.json')), { recursive: true });
await writeFile(path.join(GAME, 'assets', 'source', 'ui-masters', 'qwen-layer-jobs.json'), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output)}\n`);
