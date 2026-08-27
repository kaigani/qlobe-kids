#!/usr/bin/env node

// Stage the six deterministic crops from each approved GPT Image pose sheet as
// QLOBE Studio media objects, then optionally queue Qwen Image Layered jobs.
// The script never knows the LAN inference URL: Studio owns that connection.

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const ROOT = path.resolve(GAME, '../..');
const MEDIA = path.join(ROOT, 'shared', 'media');
const STUDIO = process.env.QLOBE_STUDIO_URL || 'http://127.0.0.1:8000';
const queue = process.argv.includes('--queue');

const POSES = ['neutral', 'enter', 'notice', 'interact', 'react', 'celebrate'];
const ACTORS = {
  'momma-bear': {
    execution: 'exec-bafe1c44-7eb0-444e-9b5a-dd4d4217c444',
    subject: 'Momma Bear in her indigo embroidered shawl and cream apron',
  },
  pip: {
    execution: 'exec-0ceccb65-900e-48ab-8bcb-bea81dbaad22',
    subject: 'Pip in his cream shirt, red neckerchief, and patched slate trousers',
  },
  fia: {
    execution: 'exec-8fc04910-ba86-44b8-a5ff-119e8b21a8f8',
    subject: 'Fia with two puff buns, sage blouse, and dusty-rose pinafore',
  },
  ash: {
    execution: 'exec-2ddb5c11-5790-4a68-a644-abfdc72d7b04',
    subject: 'Ash in a teal tunic and ochre quilted vest',
  },
};

const today = new Date().toISOString().slice(0, 10);
const jobs = [];

for (const [actor, meta] of Object.entries(ACTORS)) {
  const set = `${actor}-v1`;
  for (const pose of POSES) {
    const id = `${set}-${pose}`;
    const source = path.join(GAME, 'assets', 'source', 'pose-crops', actor, `${pose}.raw.png`);
    const folder = path.join(MEDIA, id);
    const asset = `${id}.png`;
    await mkdir(folder, { recursive: true });
    await copyFile(source, path.join(folder, asset));

    const recipe = {
      format: 'qlobe-recipe',
      formatVersion: 1,
      id,
      kind: 'image',
      asset,
      steps: [
        {
          workflow: 'gpt-image-2',
          mode: 'built-in-imagegen',
          prompt: `Six-pose premium handmade papercraft contact sheet for ${meta.subject}.`,
          promptRef: `games/momma-bear-storybook/assets/source/pose-sheets/PROMPTS.md#${actor}`,
          execution: meta.execution,
          output: `${actor}-v1.png`,
        },
        {
          op: 'crop',
          from: `${actor}-v1.png`,
          cell: pose,
          grid: [3, 2],
          output: asset,
        },
      ],
      refs: {},
      qa: { status: 'review', sourceSheetAccepted: true },
      created: today,
    };
    await writeFile(path.join(folder, 'recipe.json'), `${JSON.stringify(recipe, null, 2)}\n`);

    if (queue) {
      const extractPrompt = [
        'Background layer: the perfectly flat saturated magenta background from the input.',
        `Top layer: the exact same isolated full-body ${meta.subject}, in the ${pose} pose, on true transparency.`,
        'Preserve the input identity, silhouette, paper fibers, felt texture, stitching, colors, edges, proportions, and expression exactly.',
        'Do not redraw, restyle, crop, add a shadow, add an object, or leave a magenta halo.',
      ].join(' ');
      const response = await fetch(`${STUDIO}/api/studio/media/${id}/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ target: 'character', maxSize: 900, pad: 24, seed: 42, extractPrompt }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(`${id}: ${result.error || response.statusText}`);
      jobs.push({ actor, pose, id, jobId: result.jobId });
    }
  }
}

const output = { ok: true, staged: Object.keys(ACTORS).length * POSES.length, queued: jobs.length, jobs };
await writeFile(path.join(GAME, 'assets', 'source', 'pose-sheets', 'qwen-layer-jobs.json'), `${JSON.stringify(output, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(output)}\n`);
