#!/usr/bin/env node

// Defringe a magenta-backed cutout, trim its alpha bounds, and encode it as WebP.
import { access, mkdir, rename, unlink } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.length === 0) {
  console.log('Usage: node cutout-to-webp.mjs <input.png> <output.webp> [--key f80488] [--key-filter colorkey] [--similarity 0.20] [--blend 0.05] [--erode 2] [--alpha-cutoff 0] [--despill true] [--padding 16] [--quality 91]');
  process.exit(0);
}

const positional = [];
const options = { key: 'f80488', 'key-filter': 'colorkey', similarity: 0.20, blend: 0.05, erode: 2, 'alpha-cutoff': 0, despill: 'true', padding: 16, quality: 91 };
const optionNames = new Set(Object.keys(options));
function fail(message) { console.error(`Error: ${message}`); process.exit(1); }
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg.startsWith('--')) {
    const name = arg.slice(2);
    if (!optionNames.has(name)) fail(`unknown option --${name}`);
    const value = argv[++i];
    if (value === undefined) fail(`--${name} needs a value`);
    if (name === 'key') options.key = String(value).replace(/^#/, '').toLowerCase();
    else if (name === 'key-filter') options['key-filter'] = String(value).toLowerCase();
    else if (name === 'despill') options.despill = String(value).toLowerCase();
    else {
      if (!Number.isFinite(Number(value))) fail(`--${name} must be a number`);
      options[name] = Number(value);
    }
  } else positional.push(arg);
}
if (positional.length !== 2) fail('expected input PNG and output WebP paths');
if (!/^[0-9a-f]{6}$/.test(options.key)) fail('--key must be a six-digit RGB hex color');
if (!['colorkey', 'chromakey'].includes(options['key-filter'])) fail('--key-filter must be colorkey or chromakey');
if (!(options.similarity >= 0 && options.similarity <= 1)) fail('--similarity must be between 0 and 1');
if (!(options.blend >= 0 && options.blend <= 1)) fail('--blend must be between 0 and 1');
if (!Number.isInteger(options.erode) || options.erode < 0 || options.erode > 3) fail('--erode must be an integer from 0 to 3');
if (!Number.isInteger(options['alpha-cutoff']) || options['alpha-cutoff'] < 0 || options['alpha-cutoff'] > 254) fail('--alpha-cutoff must be an integer from 0 to 254');
if (!['true', 'false'].includes(options.despill)) fail('--despill must be true or false');
if (!Number.isInteger(options.padding) || options.padding < 0 || options.padding > 2048) fail('--padding must be an integer from 0 to 2048');
if (!(options.quality >= 0 && options.quality <= 100)) fail('--quality must be between 0 and 100');

const input = path.resolve(positional[0]);
const output = path.resolve(positional[1]);
if (input === output) fail('input and output must be different paths');
if (path.extname(input).toLowerCase() !== '.png' || path.extname(output).toLowerCase() !== '.webp') fail('input must be .png and output must be .webp');
try { await access(input); } catch { fail(`input does not exist: ${input}`); }
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const version = spawnSync(ffmpeg, ['-version'], { encoding: 'utf8' });
if (version.error || version.status !== 0) fail(`ffmpeg is unavailable${version.error ? `: ${version.error.message}` : ''}`);
const parent = path.dirname(output);
await mkdir(parent, { recursive: true });
const token = `${process.pid}.${randomBytes(6).toString('hex')}`;
const defringed = path.join(parent, `.${path.basename(output)}.${token}.defringed.png`);
const cropped = path.join(parent, `.${path.basename(output)}.${token}.cropped.png`);
const encodedTemp = path.join(parent, `.${path.basename(output)}.${token}.webp`);
const cleanup = async () => { await Promise.all([unlink(defringed).catch(() => {}), unlink(cropped).catch(() => {}), unlink(encodedTemp).catch(() => {})]); };
try {
  const sibling = path.join(path.dirname(fileURLToPath(import.meta.url)), 'defringe-alpha.mjs');
  const cut = spawnSync(process.execPath, [sibling, input, defringed, '--key', options.key, '--key-filter', options['key-filter'], '--similarity', options.similarity, '--blend', options.blend, '--erode', options.erode, '--alpha-cutoff', options['alpha-cutoff'], '--despill', options.despill], { encoding: 'utf8' });
  if (cut.status !== 0) throw new Error((cut.stderr || 'defringe failed').trim());
  const detect = spawnSync(ffmpeg, ['-v', 'info', '-loop', '1', '-i', defringed, '-vf', 'alphaextract,cropdetect=limit=0.01:round=2:reset=0', '-frames:v', '5', '-f', 'null', '-'], { encoding: 'utf8' });
  const matches = `${detect.stderr || ''}`.match(/crop=(\d+):(\d+):(\d+):(\d+)/g);
  if (detect.status !== 0 || !matches?.length) throw new Error('could not detect a nonzero alpha bounding box');
  const [, w0, h0, x0, y0] = matches.at(-1).match(/crop=(\d+):(\d+):(\d+):(\d+)/);
  const probe = spawnSync(ffmpeg, ['-v', 'error', '-i', defringed, '-f', 'null', '-'], { encoding: 'utf8' });
  if (probe.status !== 0) throw new Error('could not read defringed PNG');
  const wh = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', defringed], { encoding: 'utf8' });
  const dimensions = (wh.stdout || '').trim().split('x').map(Number);
  if (wh.status !== 0 || dimensions.length !== 2 || dimensions.some((value) => !Number.isFinite(value))) throw new Error('could not determine image dimensions');
  const [width, height] = dimensions;
  const x = Math.max(0, Number(x0) - options.padding);
  const y = Math.max(0, Number(y0) - options.padding);
  let right = Math.min(width, Number(x0) + Number(w0) + options.padding);
  let bottom = Math.min(height, Number(y0) + Number(h0) + options.padding);
  let cropX = x - (x % 2); let cropY = y - (y % 2);
  let cropW = right - cropX; let cropH = bottom - cropY;
  if (cropW % 2) cropW -= 1; if (cropH % 2) cropH -= 1;
  if (cropW < 2 || cropH < 2) throw new Error('detected alpha bounding box is empty');
  const crop = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', defringed, '-vf', `crop=${cropW}:${cropH}:${cropX}:${cropY}`, '-frames:v', '1', '-c:v', 'png', cropped], { encoding: 'utf8' });
  if (crop.status !== 0) throw new Error((crop.stderr || 'crop failed').trim());
  const encoded = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', '-i', cropped, '-frames:v', '1', '-c:v', 'libwebp', '-lossless', '0', '-q:v', String(options.quality), '-compression_level', '6', '-pix_fmt', 'yuva420p', encodedTemp], { encoding: 'utf8' });
  if (encoded.status !== 0) throw new Error((encoded.stderr || 'WebP encode failed').trim());
  await rename(encodedTemp, output);
  console.log(JSON.stringify({ ok: true, output, crop: { x: cropX, y: cropY, width: cropW, height: cropH }, padding: options.padding, keyFilter: options['key-filter'], alphaCutoff: options['alpha-cutoff'], despill: options.despill === 'true' }));
} catch (error) { await cleanup(); fail(error.message); }
await cleanup();
