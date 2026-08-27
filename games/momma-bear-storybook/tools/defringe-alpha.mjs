#!/usr/bin/env node

// Cut saturated-magenta pixels from an RGB or RGBA PNG, preserving any
// authored alpha. Hidden RGB is scrubbed after the cut so lossy WebP encoding
// cannot pull the key color back into otherwise clean silhouette edges.
import { access, mkdir, rename, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

const args = process.argv.slice(2);
if (args.includes('--help') || args.length === 0) {
  process.stdout.write('Usage: node defringe-alpha.mjs <input.png> <output.png> [--key ff00ff] [--key-filter colorkey] [--similarity 0.18] [--blend 0.06] [--erode 0] [--alpha-cutoff 0] [--despill true]\n');
  process.exit(0);
}

function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

const positional = [];
let similarity = 0.18;
let blend = 0.06;
let erode = 0;
let alphaCutoff = 0;
let applyDespill = true;
let keyFilter = 'colorkey';
let key = 'ff00ff';
for (let index = 0; index < args.length; index += 1) {
  const arg = args[index];
  if (arg === '--key') {
    key = String(args[++index] || '').replace(/^#/, '').toLowerCase();
    if (!/^[0-9a-f]{6}$/.test(key)) fail('--key must be a six-digit RGB hex color');
    continue;
  }
  if (arg === '--despill') {
    const value = String(args[++index] || '').toLowerCase();
    if (!['true', 'false'].includes(value)) fail('--despill must be true or false');
    applyDespill = value === 'true';
    continue;
  }
  if (arg === '--key-filter') {
    keyFilter = String(args[++index] || '').toLowerCase();
    if (!['colorkey', 'chromakey'].includes(keyFilter)) fail('--key-filter must be colorkey or chromakey');
    continue;
  }
  if (arg === '--similarity' || arg === '--blend' || arg === '--erode' || arg === '--alpha-cutoff') {
    const value = args[++index];
    if (value === undefined || !Number.isFinite(Number(value))) fail(`${arg} must be a number`);
    if (arg === '--similarity') similarity = Number(value);
    else if (arg === '--blend') blend = Number(value);
    else if (arg === '--erode') erode = Number(value);
    else alphaCutoff = Number(value);
  } else if (arg.startsWith('--')) fail(`unknown option ${arg}`);
  else positional.push(arg);
}
if (positional.length !== 2) fail('expected input and output PNG paths');
if (!(similarity >= 0 && similarity <= 1)) fail('--similarity must be between 0 and 1');
if (!(blend >= 0 && blend <= 1)) fail('--blend must be between 0 and 1');
if (!Number.isInteger(erode) || erode < 0 || erode > 3) fail('--erode must be an integer between 0 and 3');
if (!Number.isInteger(alphaCutoff) || alphaCutoff < 0 || alphaCutoff > 254) fail('--alpha-cutoff must be an integer between 0 and 254');

const input = path.resolve(positional[0]);
const output = path.resolve(positional[1]);
if (input === output) fail('input and output must be different paths');
if (path.extname(input).toLowerCase() !== '.png' || path.extname(output).toLowerCase() !== '.png') fail('input and output must be PNG paths');
try { await access(input); } catch { fail(`input does not exist: ${input}`); }

const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const probe = spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' });
if (probe.error || probe.status !== 0) fail(`ffmpeg is unavailable${probe.error ? `: ${probe.error.message}` : ''}`);
const parent = path.dirname(output);
await mkdir(parent, { recursive: true });
const temp = path.join(parent, `.${path.basename(output)}.${process.pid}.${randomBytes(6).toString('hex')}.tmp.png`);

// Keep the original alpha, then multiply it by the colorkey-derived alpha.
// `geq` mathematically removes the key-color contribution from semitransparent
// pixels before WebP encoding. Without this despill, lossy color planes can
// resurrect a hidden magenta matte around dark hair. An optional alpha cutoff
// removes only the faintest remaining extraction noise.
const alphaCleanup = `[originala][keya]blend=all_mode=multiply${',erosion'.repeat(erode)}[finala]`;
const [keyR, keyG, keyB] = [key.slice(0, 2), key.slice(2, 4), key.slice(4, 6)].map((value) => Number.parseInt(value, 16));
const despill = (channel, keyChannel) => `if(gt(alpha(X,Y),0),clip((${channel}(X,Y)*255-(255-alpha(X,Y))*${keyChannel})/alpha(X,Y),0,255),0)`;
const scrub = (channel) => `if(gt(alpha(X,Y),0),${channel}(X,Y),0)`;
const keyStage = keyFilter === 'chromakey'
  ? `format=yuva444p,chromakey=0x${key}:${similarity}:${blend}`
  : `format=rgba,colorkey=0x${key}:${similarity}:${blend}`;
const filter = [
  'split=3[rgb][originalsrc][keysrc]',
  '[originalsrc]format=rgba,alphaextract[originala]',
  `[keysrc]${keyStage},alphaextract[keya]`,
  alphaCleanup,
  '[rgb]format=rgb24[base]',
  '[base][finala]alphamerge[merged]',
  `[merged]format=rgba,geq=r='${applyDespill ? despill('r', keyR) : scrub('r')}':g='${applyDespill ? despill('g', keyG) : scrub('g')}':b='${applyDespill ? despill('b', keyB) : scrub('b')}':a='if(lt(alpha(X,Y),${alphaCutoff}),0,alpha(X,Y))'`,
].join(';');
const result = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', input, '-filter_complex', filter, '-frames:v', '1', '-c:v', 'png', temp], { encoding: 'utf8' });
if (result.status !== 0) {
  await unlink(temp).catch(() => {});
  fail(`ffmpeg failed: ${(result.stderr || result.error?.message || 'unknown error').trim()}`);
}
try {
  await rename(temp, output);
} catch (error) {
  await unlink(temp).catch(() => {});
  fail(`could not finalize output: ${error.message}`);
}
process.stdout.write(`${JSON.stringify({ ok: true, input, output, key: `#${key}`, keyFilter, similarity, blend, erode, alphaCutoff, despill: applyDespill })}\n`);
