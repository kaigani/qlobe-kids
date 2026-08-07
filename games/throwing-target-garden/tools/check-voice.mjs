#!/usr/bin/env node
// Deterministic, read-only release validator for Throwing Target Garden narration.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const GAME = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(GAME, 'assets', 'audio');
const failures = [];
const fail = (message) => failures.push(message);
const readJson = (name) => {
  try { return JSON.parse(fs.readFileSync(path.join(AUDIO, name), 'utf8')); }
  catch (error) { fail(`${name}: unreadable JSON`); return {}; }
};
const lines = readJson('lines.json');
const manifest = readJson('manifest.json');
const qa = readJson('qa.json');
const lineKeys = Object.keys(lines).sort();
if (!lineKeys.length) fail('lines.json has no narration lines');
for (const key of lineKeys) {
  if (!/^[a-z0-9-]+$/.test(key) || typeof lines[key] !== 'string' || !lines[key].trim()) {
    fail(`${key}: invalid narration source line`);
  }
}
const checkKeys = (label, value) => {
  const keys = value && typeof value === 'object' && !Array.isArray(value) ? Object.keys(value).sort() : [];
  if (keys.join('\0') !== lineKeys.join('\0')) {
    const missing = lineKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !lineKeys.includes(key));
    fail(`${label} keys mismatch${missing.length ? ` missing ${missing.join(',')}` : ''}${extra.length ? ` extra ${extra.join(',')}` : ''}`);
  }
};
checkKeys('manifest', manifest);
checkKeys('qa', qa);

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const clipFiles = new Set(fs.existsSync(AUDIO) ? fs.readdirSync(AUDIO).filter((name) => name.endsWith('.m4a')) : []);
for (const key of lineKeys) {
  const entry = manifest[key];
  const q = qa[key];
  const expectedFile = `${key}.m4a`;
  if (!q || q.intended !== lines[key]
    || q.textHash !== sha(String(lines[key])).slice(0, 16)
    || typeof q.checkedAt !== 'string' || !q.checkedAt) fail(`${key}: stale or missing QA source record`);
  if (!entry || typeof entry !== 'object') { fail(`${key}: invalid manifest entry`); continue; }
  if (typeof entry.file !== 'string' || !/^[a-z0-9-]+\.m4a$/.test(entry.file) || entry.file !== expectedFile) fail(`${key}: invalid filename`);
  if (!Number.isFinite(entry.dur) || entry.dur < 0.25) fail(`${key}: invalid duration`);
  if (typeof entry.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(entry.sha256)) fail(`${key}: invalid sha256`);
  if (typeof entry.textHash !== 'string' || !/^[a-f0-9]{16}$/.test(entry.textHash) || entry.textHash !== sha(String(lines[key])).slice(0, 16)) fail(`${key}: textHash mismatch`);
  const file = path.join(AUDIO, expectedFile);
  if (!fs.existsSync(file)) { fail(`${expectedFile}: missing clip`); continue; }
  const bytes = fs.readFileSync(file);
  if (bytes.length < 2048) fail(`${expectedFile}: clip is under 2KB`);
  if (sha(bytes) !== entry.sha256) fail(`${expectedFile}: sha256 mismatch`);
  const probe = spawnSync('ffprobe', [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,channels,sample_rate:format=duration',
    '-of', 'json', file,
  ], { encoding: 'utf8' });
  let media = {};
  try { media = JSON.parse(probe.stdout || '{}'); } catch { /* reported below */ }
  const stream = media.streams?.[0] || {};
  const duration = Number.parseFloat(media.format?.duration);
  if (probe.status !== 0 || stream.codec_name !== 'aac' || stream.channels !== 1
    || Number.parseInt(stream.sample_rate, 10) < 24000) fail(`${expectedFile}: invalid AAC stream`);
  if (!Number.isFinite(duration) || duration < 0.25
    || Math.abs(duration - entry.dur) > 0.15) fail(`${expectedFile}: ffprobe duration mismatch`);
  const volume = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file,
    '-af', 'volumedetect', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  const mean = Number.parseFloat(volume.stderr?.match(/mean_volume: (-?[0-9.]+) dB/)?.[1]);
  const peak = Number.parseFloat(volume.stderr?.match(/max_volume: (-?[0-9.]+) dB/)?.[1]);
  if (volume.status !== 0 || !Number.isFinite(mean) || !Number.isFinite(peak)
    || mean < -30 || mean > -12 || peak < -12 || peak >= 0) {
    fail(`${expectedFile}: loudness or clipping envelope failed`);
  }
  if (!q || q.valid !== true || q.intended !== lines[key]
    || !Number.isFinite(q.ratio) || q.ratio < 0.92
    || !Number.isFinite(q.duration) || q.duration < 0.25
    || Math.abs(q.duration - duration) > 0.15
    || q.bytes !== bytes.length || q.sha256 !== entry.sha256) fail(`${key}: QA mismatch`);
}
for (const file of clipFiles) if (!lineKeys.includes(file.slice(0, -4)) || file !== `${file.slice(0, -4)}.m4a`) fail(`${file}: unexpected clip`);

if (failures.length) { console.error(failures.map((item) => `FAIL ${item}`).join('\n')); process.exit(1); }
console.log(`PASS throwing-target-garden narration: ${lineKeys.length} clips validated`);
