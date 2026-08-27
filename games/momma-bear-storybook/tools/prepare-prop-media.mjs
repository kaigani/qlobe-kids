#!/usr/bin/env node

// Crop approved prop contact sheets and stage each crop as a QLOBE media object.
// Studio owns the LAN inference connection; --queue only calls localhost Studio.
import { mkdir, writeFile, access, copyFile } from 'node:fs/promises';
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
const SETS = [
  { key: 'little-mill', execution: 'exec-0ef61569-ef9f-457d-a2d3-b1caf4944c82', ids: ['bun', 'half-bun', 'woodcarver', 'magic-mill', 'captain-boat', 'salt-ribbon', 'sea-sparkles', 'charm-little-mill'] },
  { key: 'pink-flowers', execution: 'exec-ddd8a22c-f92e-4046-b234-0ac82a702de0', ids: ['pinks-droop', 'plain-pitcher', 'wood-queen', 'gold-cup', 'cabbage', 'cottage-bed', 'water-ribbon', 'pinks-bloom'] },
  { key: 'glass-hill', execution: 'exec-f8267b70-ae38-4328-98b8-fe70a9ff371a', ids: ['haystack', 'copper-horse', 'silver-horse', 'gold-horse', 'vellum-trail', 'gold-apples', 'village-friends', 'charm-glass-hill'] },
];
const CHARACTER_IDS = new Set(['woodcarver', 'wood-queen', 'village-friends']);
const ffmpeg = process.env.FFMPEG_PATH || (spawnSync('which', ['ffmpeg'], { encoding: 'utf8' }).stdout || '').trim() || '/usr/local/bin/ffmpeg';
const staged = [];
const jobs = [];

function crop(source, output, x, y) {
  const result = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', source, '-vf', `crop=384:512:${x}:${y}`, '-frames:v', '1', output], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`ffmpeg crop failed for ${source}: ${result.stderr || result.error?.message || 'unknown error'}`);
}

for (const set of SETS) {
  const source = path.join(GAME, 'assets', 'source', 'prop-sheets', `${set.key}-v1.png`);
  await access(source);
  for (let index = 0; index < set.ids.length; index += 1) {
    const id = set.ids[index];
    const raw = path.join(GAME, 'assets', 'source', 'prop-crops', `${id}.raw.png`);
    await mkdir(path.dirname(raw), { recursive: true });
    crop(source, raw, (index % 4) * 384, Math.floor(index / 4) * 512);
    const folder = path.join(MEDIA, `momma-bear-prop-${id}`);
    const asset = `momma-bear-prop-${id}.png`;
    const recipePath = path.join(folder, 'recipe.json');
    let existing = false;
    try { await access(recipePath); existing = true; } catch { /* new media */ }
    if (!existing) {
      await mkdir(folder, { recursive: true });
      await copyFile(raw, path.join(folder, asset));
      const target = CHARACTER_IDS.has(id) ? 'character' : 'object';
      const recipe = {
        format: 'qlobe-recipe', formatVersion: 1, id: `momma-bear-prop-${id}`, kind: 'image', asset,
        steps: [
          { workflow: 'gpt-image-2', mode: 'built-in-imagegen', prompt: `Papercraft prop contact sheet for Momma Bear's Storybook: ${id}.`, promptRef: `games/momma-bear-storybook/assets/source/prop-sheets/PROMPTS.md#${set.key}`, execution: set.execution, output: `${set.key}-v1.png` },
          { op: 'crop', from: `${set.key}-v1.png`, cell: { grid: [4, 2], index, x: (index % 4) * 384, y: Math.floor(index / 4) * 512, width: 384, height: 512 }, output: asset },
        ],
        refs: {}, qa: { status: 'review', sourceSheetAccepted: true }, created: today,
      };
      await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);
    }
    const target = CHARACTER_IDS.has(id) ? 'character' : 'object';
    const maxSize = target === 'character' ? 900 : 760;
    const prompt = `Background layer = the exact flat saturated magenta input background. Top layer = the exact unchanged ${target} from the input on transparency. Preserve silhouette, paper fibers, colors, edges, proportions, and details exactly. No redraw, restyle, halo, shadow, crop, or added objects.`;
    if (queue) {
      const response = await fetch(`${STUDIO}/api/studio/media/momma-bear-prop-${id}/extract`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, maxSize, pad: 24, seed: 42, extractPrompt: prompt }) });
      let result = {};
      try { result = await response.json(); } catch { /* retain status */ }
      if (response.ok) jobs.push({ id, jobId: result.jobId, status: 'queued' });
      else if (response.status === 409) jobs.push({ id, status: 'existing', detail: result.error || 'already queued or extracted' });
      else throw new Error(`${id}: ${result.error || response.statusText}`);
    }
    staged.push({ id, source: `${set.key}-v1.png`, cell: index, target, existing });
  }
}

const output = { ok: true, staged: staged.length, queued: jobs.filter((job) => job.status === 'queued').length, jobs, props: staged };
await mkdir(path.join(GAME, 'assets', 'source', 'prop-sheets'), { recursive: true });
await writeFile(path.join(GAME, 'assets', 'source', 'prop-sheets', 'qwen-layer-jobs.json'), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output)}\n`);
