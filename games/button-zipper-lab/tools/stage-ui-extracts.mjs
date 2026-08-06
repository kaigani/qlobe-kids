#!/usr/bin/env node
/** Stage or collect per-cell Qwen Layered UI extraction jobs. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const game = path.resolve(here, '..');
const repo = path.resolve(game, '../..');
const mediaRoot = path.join(repo, 'shared/media');
const opaqueRoot = path.join(game, 'assets/source/ui-cells-opaque');
const standaloneRoot = path.join(game, 'assets/source/ui-standalone');
const layeredRoot = path.join(game, 'assets/source/ui-layered');
const ids = [
  'zipper-pull', 'button', 'snap-flap', 'velcro-tab',
  'helper-paw',
  'patch-zipper', 'patch-button', 'patch-snap', 'patch-velcro',
];
const acceptedMediaOverride = {
  'zipper-pull': 'bzl-ui-zipper-pull-gpt2',
  'snap-flap': 'bzl-ui-snap-flap-gpt2',
  'velcro-tab': 'bzl-ui-velcro-tab-gpt3',
  'patch-zipper': 'bzl-ui-patch-zipper-gpt3',
  'patch-button': 'bzl-ui-patch-button-gpt3',
  'patch-snap': 'bzl-ui-patch-snap-gpt3',
  'patch-velcro': 'bzl-ui-patch-velcro-gpt3',
};
const standaloneSources = {
  'velcro-tab': {
    file: 'velcro-tab-gpt-image-2.png',
    prompt: 'Edit this exact preschool quiet-book UI object into a clean extraction source. Preserve the single complete orange felt hook-and-loop tab as one assembled object: the entire rounded orange rectangle, fully visible left and right edges, lifted triangular orange corner, exposed cream hook-and-loop fibers, cream blanket stitching, proportions, colors, wool texture, and believable soft contact shadow. Center the entire object at generous scale with wide empty margin on every side. Replace the dark background with one perfectly uniform flat chroma green (#00FF00), edge to edge: no gradient, texture, vignette, horizon, floor, checkerboard, or other background color. Keep only a tiny contact shadow immediately touching the felt edge. No extra object, text, letters, logo, watermark, frame, crop, hand, garment, bear, vector, or flat graphic style. Square production source image.',
  },
  'patch-zipper': {
    file: 'patch-zipper-gpt-image-2.png',
    prompt: 'Edit this exact preschool quiet-book reward patch into a clean extraction source. Preserve the single complete yellow five-point wool-felt star badge as one assembled object: all five full points, the entire blue blanket-stitched outer border, the attached complete brushed-silver zipper pull with slider housing, long pull tab and oval opening, proportions, colors, felt fibers, metal texture, and believable soft contact shadow. Center the entire badge at generous scale with wide empty margin on every side. Replace the dark background with one perfectly uniform flat chroma green (#00FF00), edge to edge: no gradient, texture, vignette, horizon, floor, checkerboard, or other background color. Keep only a tiny contact shadow immediately touching the badge edge. No extra object, text, letters, logo, watermark, frame, crop, hand, garment, bear, vector, or flat graphic style. Square production source image.',
  },
  'patch-button': {
    file: 'patch-button-gpt-image-2.png',
    prompt: 'Edit this exact preschool quiet-book reward patch into a clean extraction source. Preserve the single complete yellow five-point wool-felt star badge as one assembled object: all five full points, the entire blue blanket-stitched outer border, the attached complete green four-hole felt button with its cream crossed thread, proportions, colors, felt fibers, and believable soft contact shadow. Center the entire badge at generous scale with wide empty margin on every side. Replace the dark background with one perfectly uniform flat chroma green (#00FF00), edge to edge: no gradient, texture, vignette, horizon, floor, checkerboard, or other background color. Keep only a tiny contact shadow immediately touching the badge edge. No extra object, text, letters, logo, watermark, frame, crop, hand, garment, bear, vector, or flat graphic style. Square production source image.',
  },
  'patch-snap': {
    file: 'patch-snap-gpt-image-2.png',
    prompt: 'Edit this exact preschool quiet-book reward patch into a clean extraction source. Preserve the single complete yellow five-point wool-felt star badge as one assembled object: all five full points, the entire blue blanket-stitched outer border, both attached complete brushed-silver snap halves with their distinct open socket and raised stud, proportions, colors, felt fibers, metal texture, and believable soft contact shadow. Center the entire badge at generous scale with wide empty margin on every side. Replace the dark background with one perfectly uniform flat chroma green (#00FF00), edge to edge: no gradient, texture, vignette, horizon, floor, checkerboard, or other background color. Keep only a tiny contact shadow immediately touching the badge edge. No extra object, text, letters, logo, watermark, frame, crop, hand, garment, bear, vector, or flat graphic style. Square production source image.',
  },
  'patch-velcro': {
    file: 'patch-velcro-gpt-image-2.png',
    prompt: 'Edit this exact preschool quiet-book reward patch into a clean extraction source. Preserve the single complete yellow five-point wool-felt star badge as one assembled object: all five full points, the entire blue blanket-stitched outer border, the attached complete orange triangular hook-and-loop patch with its lifted corner and exposed cream fibers, proportions, colors, felt texture, and believable soft contact shadow. Center the entire badge at generous scale with wide empty margin on every side. Replace the dark background with one perfectly uniform flat chroma green (#00FF00), edge to edge: no gradient, texture, vignette, horizon, floor, checkerboard, or other background color. Keep only a tiny contact shadow immediately touching the badge edge. No extra object, text, letters, logo, watermark, frame, crop, hand, garment, bear, vector, or flat graphic style. Square production source image.',
  },
};

const collect = process.argv.includes('--collect');
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='));
const selected = onlyArg ? onlyArg.slice('--only='.length).split(',').filter(Boolean) : ids;
if (selected.some((cell) => !ids.includes(cell))) throw new Error(`Unknown UI cell in --only: ${selected.find((cell) => !ids.includes(cell))}`);
if (collect && selected.length !== ids.length) throw new Error('--only is supported for staging only; collection requires all 9 cells');
if (collect) fs.mkdirSync(layeredRoot, { recursive: true });

for (const cell of selected) {
  const stagedMediaId = `bzl-ui-${cell}-gpt`;
  const mediaId = acceptedMediaOverride[cell] || stagedMediaId;
  const folder = path.join(mediaRoot, mediaId);
  if (collect) {
    const pairs = [
      [`${mediaId}.png`, `${cell}.png`],
      ['recipe.json', `${cell}.recipe.json`],
      ['qa-magenta.png', `${cell}.qa-magenta.png`],
      [`${mediaId}.layer2.png`, `${cell}.layer2.png`],
    ];
    for (const [source, destination] of pairs) {
      const from = path.join(folder, source);
      if (!fs.existsSync(from)) throw new Error(`Missing extraction output: ${from}`);
      fs.copyFileSync(from, path.join(layeredRoot, destination));
    }
    continue;
  }

  fs.mkdirSync(folder, { recursive: true });
  const asset = `${mediaId}.png`;
  const standalone = standaloneSources[cell];
  fs.copyFileSync(standalone
    ? path.join(standaloneRoot, standalone.file)
    : path.join(opaqueRoot, `${cell}.png`), path.join(folder, asset));
  const recipe = {
    format: 'qlobe-recipe',
    formatVersion: 1,
    id: mediaId,
    kind: 'image',
    asset,
    steps: standalone ? [{
      workflow: 'gpt-image-2',
      prompt: standalone.prompt,
      output: `games/button-zipper-lab/assets/source/ui-standalone/${standalone.file}`,
      ground: null,
    }] : [
      {
        workflow: 'gpt-image-2',
        prompt: `Button-Zipper Lab exact felt ${cell} sprite on a flat dark charcoal background`,
        seed: 42,
        output: 'ui-sprites-gpt-image-2.png',
      },
      {
        op: 'crop',
        from: 'ui-sprites-gpt-image-2.png',
        output: asset,
      },
    ],
    refs: { parent: 'games/button-zipper-lab/assets/source/ui-sprites-gpt-image-2.png' },
    qa: { status: 'accepted' },
    created: '2026-08-05',
  };
  fs.writeFileSync(path.join(folder, 'recipe.json'), `${JSON.stringify(recipe, null, 2)}\n`);
}

console.log(`${collect ? 'Collected' : 'Staged'} ${selected.length} Button-Zipper Lab UI cells.`);
