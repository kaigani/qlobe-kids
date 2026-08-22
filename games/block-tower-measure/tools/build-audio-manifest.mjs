#!/usr/bin/env node
// Rebuild the runtime voice manifest and the committed Whisper QA summary from
// Studio-assigned teacher-voice clips. Run from any working directory.
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audioRoot = path.join(gameRoot, 'assets', 'audio');
const lines = JSON.parse(await readFile(path.join(gameRoot, 'data', 'lines.json'), 'utf8'));
const manifest = {};
const qa = {};
const failures = [];
const NUMBER_WORDS = new Map([
  ['zero', '0'], ['one', '1'], ['two', '2'], ['three', '3'],
  ['four', '4'], ['five', '5'], ['six', '6'],
]);

function normalizeSpeech(text) {
  return String(text || '').toLowerCase()
    .replace(/\b(zero|one|two|three|four|five|six)\b/g, (word) => NUMBER_WORDS.get(word))
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const probeDuration = (file) => Number(execFileSync('ffprobe', [
  '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file,
], { encoding: 'utf8' }).trim());

function probeMeanVolume(file) {
  const result = spawnSync('ffmpeg', [
    '-hide_banner', '-nostats', '-i', file, '-af', 'volumedetect', '-f', 'null', '-',
  ], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || `ffmpeg failed for ${file}`);
  const match = result.stderr.match(/mean_volume:\s*(-?[\d.]+) dB/);
  return match ? Number(match[1]) : Number.NaN;
}

for (const [key, sourceText] of Object.entries(lines)) {
  const file = `btm-voice-${key}.m4a`;
  const assetPath = path.join(audioRoot, file);
  const recipePath = `${assetPath}.recipe.json`;
  const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
  const transcript = recipe.qa?.transcript || {};
  const duration = probeDuration(assetPath);
  const meanVolumeDb = probeMeanVolume(assetPath);
  const info = await stat(assetPath);
  const seed = recipe.steps?.find((step) => step.workflow === 'qwen3-tts-voiceclone')?.seed;
  const ratio = Number(transcript.ratio || 0);
  const semanticMatch = normalizeSpeech(transcript.intended) === normalizeSpeech(transcript.heard);
  const valid = transcript.match === true && semanticMatch
    && transcript.intended === sourceText && Number.isFinite(duration) && duration > 0
    && Number.isFinite(meanVolumeDb) && meanVolumeDb > -35 && meanVolumeDb < -5;

  manifest[key] = { file, dur: Number(duration.toFixed(3)) };
  qa[key] = {
    engine: 'qwen3-tts-voiceclone',
    voice: 'voice_teacher',
    seed,
    sourceText,
    textHash: createHash('sha256').update(sourceText).digest('hex').slice(0, 16),
    duration: Number(duration.toFixed(3)),
    meanVolumeDb: Number(meanVolumeDb.toFixed(1)),
    bytes: info.size,
    transcript: transcript.heard || '',
    valid,
    score: ratio,
    semanticMatch,
  };
  if (!valid) failures.push(`${key} (ratio ${ratio}, semanticMatch ${semanticMatch}, match ${transcript.match})`);
}

if (failures.length) {
  throw new Error(`voice QA did not meet the exact semantic transcript gate: ${failures.join(', ')}`);
}

async function writeJsonAtomic(name, value) {
  const target = path.join(audioRoot, name);
  const temporary = `${target}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, target);
}

await writeJsonAtomic('manifest.json', manifest);
await writeJsonAtomic('qa.json', qa);
console.log(`audio manifest: ${Object.keys(manifest).length} teacher-voice clips passed Whisper QA`);
