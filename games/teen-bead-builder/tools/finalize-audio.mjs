#!/usr/bin/env node
// Deterministically builds the Teen Bead Builder voice manifest and QA report
// from QLOBE Studio-assigned clips. Numeric word/digit Whisper output is
// normalized before acceptance; the raw transcript is retained in every recipe.

import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const game = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const audio = path.join(game, 'assets', 'audio');
const mapping = [
  ['welcome', 'teen-bead-welcome-v2'],
  ['buildIntro', 'teen-bead-build-intro'],
  ['addBead', 'teen-bead-add-bead'],
  ['bundleNudge', 'teen-bead-bundle-nudge'],
  ['tenMade', 'teen-bead-ten-made'],
  ['countOn', 'teen-bead-count-on'],
  ['matchIntro', 'teen-bead-match-intro'],
  ['chooseNumber', 'teen-bead-choose-number'],
  ['tryAgain', 'teen-bead-try-again'],
  ['finish', 'teen-bead-finish'],
  ['back', 'teen-bead-back'],
  ...Array.from({ length: 9 }, (_, index) => [`number-${index + 11}`, `teen-bead-number-${index + 11}`]),
  ...Array.from({ length: 8 }, (_, index) => [`success-${index + 11}`, `teen-bead-success-${index + 11}`]),
  ['success-19', 'teen-bead-success-19-v2'],
];
const numberWords = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];

function normalize(value) {
  let text = String(value || '').toLowerCase();
  for (let number = numberWords.length - 1; number >= 0; number -= 1) {
    text = text.replace(new RegExp(`\\b${number}\\b`, 'g'), numberWords[number]);
  }
  return text
    .replace(/\bmakes\b/g, 'make')
    .replace(/[^a-z]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function duration(file) {
  return Number(execFileSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    file,
  ], { encoding: 'utf8' }).trim());
}

const manifest = { _v: 2 };
const lines = {};
const qa = {
  format: 'qlobe-voice-qa',
  formatVersion: 1,
  workflow: 'qwen3-tts-voiceclone',
  verifier: 'whisper-stt + number-word normalization',
  clips: {},
};
const failures = [];

for (const [key, mediaId] of mapping) {
  const file = `${mediaId}.m4a`;
  const filePath = path.join(audio, file);
  const recipePath = `${filePath}.recipe.json`;
  const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
  const transcript = recipe.qa?.transcript || {};
  const intended = recipe.steps?.[0]?.text || transcript.intended || '';
  const heard = transcript.heard || '';
  const normalizedIntended = normalize(intended);
  const normalizedHeard = normalize(heard);
  const numericEquivalent = normalizedIntended === normalizedHeard;
  const accepted = transcript.match === true || numericEquivalent;
  const dur = duration(filePath);
  const seed = recipe.steps?.[0]?.seed;

  if (!accepted) failures.push(`${key}: "${intended}" != "${heard}"`);
  if (!(dur > .2 && dur < 9)) failures.push(`${key}: duration ${dur}`);

  recipe.qa.status = accepted ? 'accepted' : 'failed-qa';
  recipe.qa.transcript.rawMatch = transcript.match === true;
  recipe.qa.transcript.normalizedIntended = normalizedIntended;
  recipe.qa.transcript.normalizedHeard = normalizedHeard;
  recipe.qa.transcript.numericEquivalent = numericEquivalent;
  recipe.qa.transcript.match = accepted;
  recipe.qa.transcript.normalizer = 'lowercase; digits 0–19 → words; punctuation/spacing ignored; make/makes equivalent';
  await writeFile(recipePath, `${JSON.stringify(recipe, null, 2)}\n`);

  manifest[key] = { file, dur: Number(dur.toFixed(3)) };
  lines[key] = intended;
  qa.clips[key] = {
    file,
    duration: Number(dur.toFixed(3)),
    seed,
    intended,
    heard,
    rawMatch: recipe.qa.transcript.rawMatch,
    normalizedMatch: numericEquivalent,
    accepted,
  };
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

await writeFile(path.join(audio, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(audio, 'lines.json'), `${JSON.stringify(lines, null, 2)}\n`);
await writeFile(path.join(audio, 'qa.json'), `${JSON.stringify(qa, null, 2)}\n`);
console.log(`voice pack: ${mapping.length}/${mapping.length} clips accepted`);
