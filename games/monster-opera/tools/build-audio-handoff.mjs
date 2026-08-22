#!/usr/bin/env node
// Regenerate adjacent provisional-audio recipes and aggregate technical QA.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(gameRoot, 'assets');
const runtimeRoot = path.join(assetRoot, 'audio/monsters');
const created = '2026-08-18';
const replacementTarget = 'MiniMax H3 candidate after Whisper and manual isolation review';

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function probe(file) {
  const output = execFileSync('ffprobe', [
    '-v', 'error',
    '-select_streams', 'a:0',
    '-show_entries', 'stream=codec_name,sample_rate,channels,channel_layout:format=duration,size',
    '-of', 'json',
    file,
  ], { encoding: 'utf8' });
  const payload = JSON.parse(output);
  const stream = payload.streams?.[0] || {};
  return {
    durationSeconds: Number(payload.format?.duration || 0),
    codec: stream.codec_name || 'unknown',
    sampleRate: Number(stream.sample_rate || 0),
    channels: Number(stream.channels || 0),
    channelLayout: stream.channel_layout || 'unknown',
    bytes: Number(payload.format?.size || fs.statSync(file).size),
  };
}

function technicalChecks(mp3, wav) {
  return {
    mp3Decode: mp3.codec === 'mp3' && mp3.durationSeconds > 0.08 && mp3.bytes > 0,
    wavDecode: wav.codec === 'pcm_s16le' && wav.durationSeconds > 0.08 && wav.bytes > 0,
    mono: mp3.channels === 1 && wav.channels === 1,
    sampleRate: mp3.sampleRate === 44100 && wav.sampleRate === 44100,
  };
}

const ids = fs.readdirSync(runtimeRoot)
  .filter((filename) => filename.endsWith('.mp3'))
  .map((filename) => path.basename(filename, '.mp3'))
  .sort();

const tracks = ids.map((id) => {
  const asset = `audio/monsters/${id}.mp3`;
  const wav = `source/concept-audio/${id}.wav`;
  const mp3Absolute = path.join(assetRoot, asset);
  const wavAbsolute = path.join(assetRoot, wav);
  if (!fs.existsSync(wavAbsolute)) throw new Error(`Missing source master: assets/${wav}`);

  const mp3Metadata = probe(mp3Absolute);
  const wavMetadata = probe(wavAbsolute);
  const checks = technicalChecks(mp3Metadata, wavMetadata);
  const technicalPass = Object.values(checks).every(Boolean);
  const recipe = {
    format: 'qlobe-recipe',
    formatVersion: 1,
    id: `monster-opera-audio-${id}`,
    kind: 'voice',
    asset: `${id}.mp3`,
    steps: [
      {
        workflow: 'project-owned-concept-video-extract',
        sourceRef: 'source/concept-audio/README.md',
        output: wav,
        script: 'tools/extract-concept-samples.sh',
        processing: 'mono, 90 Hz high-pass, 8.5 kHz low-pass, fades, -20 LUFS / -2 dBTP',
      },
      {
        op: 'encode',
        source: wav,
        output: asset,
        script: 'tools/extract-concept-samples.sh',
        codec: 'libmp3lame',
        bitrate: '96k',
        sampleRate: 44100,
        channels: 1,
      },
    ],
    refs: {
      wav,
      readme: 'source/concept-audio/README.md',
      script: 'tools/extract-concept-samples.sh',
    },
    derivedFrom: null,
    qa: {
      status: 'provisional',
      technicalStatus: technicalPass ? 'passed' : 'failed',
      checks,
      decode: technicalPass,
      mp3: mp3Metadata,
      wav: wavMetadata,
      replacementTarget,
    },
    created,
  };
  const recipePath = `${asset}.recipe.json`;
  writeJson(path.join(assetRoot, recipePath), recipe);
  return {
    id,
    asset,
    recipe: `assets/${recipePath}`,
    wav: `assets/${wav}`,
    technicalPass,
    checks,
    mp3: mp3Metadata,
    wavMetadata,
    qa: 'provisional',
  };
});

const passed = tracks.filter((track) => track.technicalPass).length;
writeJson(path.join(assetRoot, 'source/qa/concept-audio-report.json'), {
  format: 'qlobe-audio-qa',
  formatVersion: 1,
  created,
  overallStatus: 'provisional-runtime',
  replacementTarget,
  counts: {
    tracks: tracks.length,
    technicalPass: passed,
    technicalFail: tracks.length - passed,
  },
  tracks,
});

if (passed !== tracks.length) {
  throw new Error(`${tracks.length - passed} provisional audio track(s) failed technical QA`);
}
console.log(`Generated ${tracks.length} provisional audio recipes and report`);
