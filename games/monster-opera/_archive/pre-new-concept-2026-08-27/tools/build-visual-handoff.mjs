#!/usr/bin/env node
// Regenerate adjacent qlobe-recipe sidecars and aggregate decode metadata for
// every shipped Monster Opera raster. This tool never mutates the artwork.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const assetRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'assets');
const promptDocument = 'source/gpt-image-2/PROMPTS.md';
const conceptPromptDocument = 'source/ui-mockups/PROMPTS.md';
const groups = [
  'bg',
  'monsters',
  'monsters-singing',
  'monsters-blink',
  'monsters-gaze-left',
  'monsters-gaze-right',
  'cards',
  'ui',
];
const overviewAssets = ['og-image.jpg', 'hub-tile.jpg'];
const rasterExtensions = new Set(['.webp', '.jpg', '.jpeg', '.png']);
const created = '2026-08-18';

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function probe(relativeAsset) {
  const absolute = path.join(assetRoot, relativeAsset);
  const output = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt:format=size',
    '-of', 'json',
    absolute,
  ], { encoding: 'utf8' });
  const payload = JSON.parse(output);
  const stream = payload.streams?.[0] || {};
  const metadata = {
    width: Number(stream.width || 0),
    height: Number(stream.height || 0),
    codec: stream.codec_name || 'unknown',
    pixelFormat: stream.pix_fmt || 'unknown',
    bytes: Number(payload.format?.size || fs.statSync(absolute).size),
  };
  metadata.decode = metadata.width > 0
    && metadata.height > 0
    && metadata.codec !== 'unknown'
    && metadata.bytes > 0;
  return metadata;
}

function sourcePlan(relativeAsset) {
  if (!relativeAsset.includes('/')) {
    return {
      workflow: 'project-concept-art',
      promptRef: conceptPromptDocument,
      sources: ['source/ui-mockups/splash.png'],
      op: 'crop-resize-encode',
    };
  }

  const [group, filename] = relativeAsset.split('/');
  const id = path.basename(filename, path.extname(filename));
  if (group === 'bg') {
    const sourceById = {
      cloud: 'cloud-stage-clean.png',
      garden: 'garden-stage-clean.png',
      moon: 'moon-stage-clean.png',
      solo: 'solo-stage-clean.png',
      splash: 'splash-clean.png',
      'splash-portrait': 'splash-portrait.png',
    };
    return {
      workflow: 'gpt-image-2',
      promptRef: promptDocument,
      sources: [`source/gpt-image-2/${sourceById[id]}`],
      op: 'resize-encode',
    };
  }
  if (group === 'monsters') {
    return {
      workflow: 'gpt-image-2',
      promptRef: promptDocument,
      sources: [
        'source/gpt-image-2/monster-lineup-black.png',
        'source/gpt-image-2/monster-lineup-alpha.png',
      ],
      op: 'repair-interior-alpha-split-resize-encode',
      script: 'tools/finalize-cast.sh',
      supportingScripts: ['tools/repair-alpha.py'],
    };
  }
  if (group === 'monsters-singing' || group === 'monsters-blink') {
    const source = group === 'monsters-singing'
      ? 'source/gpt-image-2/singing-mouth-source.png'
      : 'source/gpt-image-2/blink-face-source.png';
    return {
      workflow: 'gpt-image-2',
      promptRef: promptDocument,
      sources: [`monsters/${id}.webp`, source],
      op: 'registered-raster-patch-composite',
      script: 'tools/finalize-facial-poses.sh',
    };
  }
  if (group === 'monsters-gaze-left' || group === 'monsters-gaze-right') {
    const source = group === 'monsters-gaze-left'
      ? 'source/gpt-image-2/gaze-left-source.png'
      : 'source/gpt-image-2/gaze-right-source.png';
    return {
      workflow: 'gpt-image-2',
      promptRef: promptDocument,
      sources: [`monsters/${id}.webp`, source],
      op: 'registered-raster-eye-patch-composite',
      script: 'tools/finalize-facial-poses.sh',
    };
  }
  if (group === 'cards') {
    return {
      workflow: 'gpt-image-2',
      promptRef: promptDocument,
      sources: ['source/gpt-image-2/blank-card-source.png', `monsters/${id}.webp`],
      op: 'plate-sprite-composite',
      script: 'tools/finalize-cards.sh',
    };
  }
  if (group === 'ui') {
    const source = id.endsWith('-heading')
      ? 'source/gpt-image-2/transparent-headings.png'
      : 'source/gpt-image-2/chroma-ui-sheet.png';
    return {
      workflow: 'gpt-image-2',
      promptRef: promptDocument,
      sources: [source],
      op: 'isolate-crop-resize-encode',
      script: 'tools/finalize-cards.sh',
    };
  }
  throw new Error(`No visual provenance mapping for ${relativeAsset}`);
}

function recipeFor(relativeAsset, metadata) {
  const plan = sourcePlan(relativeAsset);
  const promptRef = plan.promptRef;
  const slug = relativeAsset
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return {
    format: 'qlobe-recipe',
    formatVersion: 1,
    id: `monster-opera-${slug}`,
    kind: 'image',
    asset: path.basename(relativeAsset),
    steps: [
      {
        workflow: plan.workflow,
        promptRef,
        sources: plan.sources,
      },
      {
        op: plan.op,
        sources: plan.sources,
        output: relativeAsset,
        ...(plan.script ? { script: plan.script } : {}),
        ...(plan.supportingScripts ? { supportingScripts: plan.supportingScripts } : {}),
        dimensions: { width: metadata.width, height: metadata.height },
        encoding: metadata.codec,
      },
    ],
    refs: {
      promptDocument: promptRef,
      sources: plan.sources,
    },
    // Shared-media recipes use a media-bucket id here. These are adjacent
    // game-local recipes, so file lineage lives in steps/refs instead.
    derivedFrom: null,
    qa: {
      status: metadata.decode ? 'accepted' : 'rejected',
      decode: metadata.decode,
      width: metadata.width,
      height: metadata.height,
      codec: metadata.codec,
      pixelFormat: metadata.pixelFormat,
      bytes: metadata.bytes,
    },
    created,
  };
}

const assets = groups.flatMap((group) => (
  fs.readdirSync(path.join(assetRoot, group))
    .filter((filename) => rasterExtensions.has(path.extname(filename).toLowerCase()))
    .map((filename) => `${group}/${filename}`)
)).concat(overviewAssets).sort();

const records = assets.map((relativeAsset) => {
  const metadata = probe(relativeAsset);
  const recipe = recipeFor(relativeAsset, metadata);
  const recipePath = `${relativeAsset}.recipe.json`;
  writeJson(path.join(assetRoot, recipePath), recipe);
  return {
    asset: relativeAsset,
    recipe: `assets/${recipePath}`,
    ...metadata,
    status: metadata.decode ? 'accepted' : 'rejected',
  };
});

const accepted = records.filter((record) => record.status === 'accepted').length;
writeJson(path.join(assetRoot, 'source/qa/image-report.json'), {
  format: 'qlobe-visual-qa',
  formatVersion: 1,
  created,
  status: accepted === records.length ? 'accepted' : 'rejected',
  counts: {
    assets: records.length,
    accepted,
    rejected: records.length - accepted,
  },
  assets: records,
});

if (accepted !== records.length) {
  throw new Error(`${records.length - accepted} raster asset(s) failed metadata decode`);
}
console.log(`Generated ${records.length} visual recipes and image-report.json`);
