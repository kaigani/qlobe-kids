#!/usr/bin/env node
// Build a redacted, local-only H3 audio audition handoff and synchronize the
// generated candidate recipes with completed Whisper evidence.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetsRoot = path.join(gameRoot, 'assets');
const sourceRoot = path.join(assetsRoot, 'source');
const qaRoot = path.join(sourceRoot, 'qa');
const h3Root = path.join(qaRoot, 'h3-audio');
const audioRoot = path.join(sourceRoot, 'audio-h3');
const videoRoot = path.join(sourceRoot, 'video-raw');
const outputJson = path.join(h3Root, 'report.json');
const outputHtml = path.join(h3Root, 'index.html');
const generationReportPath = path.join(qaRoot, 'h3-generation-report.json');
const currentAudioReportPath = path.join(qaRoot, 'concept-audio-report.json');
const configPath = path.join(gameRoot, 'config.json');
const created = '2026-08-18';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, payload) {
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function gameRelative(file) {
  return path.relative(gameRoot, file).split(path.sep).join('/');
}

function pageRelative(file) {
  return path.relative(h3Root, file).split(path.sep).join('/');
}

function uniqueIds(label, values) {
  const normalized = values.map((value) => String(value || '').trim());
  if (normalized.some((value) => !value)) throw new Error(`${label} contains an empty ID`);
  const duplicates = normalized.filter((value, index) => normalized.indexOf(value) !== index);
  if (duplicates.length) {
    throw new Error(`${label} contains duplicate ID(s): ${[...new Set(duplicates)].join(', ')}`);
  }
  return [...normalized].sort();
}

function assertExactIds(label, actual, expected) {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const missing = expected.filter((id) => !actualSet.has(id));
  const extra = actual.filter((id) => !expectedSet.has(id));
  if (missing.length || extra.length) {
    const parts = [];
    if (missing.length) parts.push(`missing ${missing.join(', ')}`);
    if (extra.length) parts.push(`unexpected ${extra.join(', ')}`);
    throw new Error(`${label} does not match runtime cast: ${parts.join('; ')}`);
  }
}

function verifyArtifact(file, label, { expectedBytes, recorded = [] } = {}) {
  if (!fs.existsSync(file)) throw new Error(`${label} is missing: ${gameRelative(file)}`);
  const bytes = fs.statSync(file).size;
  if (bytes <= 0) throw new Error(`${label} is empty: ${gameRelative(file)}`);
  if (expectedBytes !== undefined && bytes !== expectedBytes) {
    throw new Error(`${label} byte count no longer matches technical QA`);
  }
  const digest = sha256(file);
  const recordedHashes = [...new Set(recorded.map((value) => value?.sha256).filter(Boolean))];
  if (recordedHashes.length > 1) throw new Error(`${label} has conflicting recorded hashes`);
  if (recordedHashes.length === 1 && recordedHashes[0] !== digest) {
    throw new Error(`${label} no longer matches its recorded hash`);
  }
  return {
    asset: gameRelative(file),
    bytes,
    sha256: digest,
  };
}

function escapeHtml(value) {
  const entities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}

function preview(value, maximum = 180) {
  const text = String(value ?? '');
  return text.length > maximum ? `${text.slice(0, maximum - 3)}…` : text;
}

function formatDuration(value) {
  const seconds = Number(value);
  return Number.isFinite(seconds) ? `${seconds.toFixed(2)} s` : 'unknown length';
}

function formatSampleRate(value) {
  const hertz = Number(value);
  if (!Number.isFinite(hertz)) return 'unknown sample rate';
  return `${Number.isInteger(hertz / 1000) ? hertz / 1000 : (hertz / 1000).toFixed(1)} kHz`;
}

function displayName(id) {
  return `${id.charAt(0).toUpperCase()}${id.slice(1)}`;
}

const ids = uniqueIds('H3 audio QA records', fs.readdirSync(h3Root)
  .filter((file) => file.endsWith('.audio.qa.json'))
  .map((file) => file.replace('.audio.qa.json', '')));

if (!ids.length) throw new Error('No H3 audio QA records found');

const config = readJson(configPath);
const cast = config.cast || [];
const runtimeIds = uniqueIds('Runtime cast', cast.map((monster) => monster.id));
if (runtimeIds.length !== 8) throw new Error(`Expected 8 runtime monsters, found ${runtimeIds.length}`);
const runtimeById = new Map(cast.map((monster) => [monster.id, monster]));

const generationReport = readJson(generationReportPath);
const generationResults = generationReport.results || [];
const generationIds = uniqueIds('H3 generation results', generationResults.map((result) => result.id));
const generationById = new Map(
  generationResults.map((result) => [result.id, result]),
);
const currentAudioReport = readJson(currentAudioReportPath);
const currentTracks = currentAudioReport.tracks || [];
const currentIds = uniqueIds('Current runtime audio report', currentTracks.map((track) => track.id));
const currentById = new Map(
  currentTracks.map((track) => [track.id, track]),
);

assertExactIds('H3 audio QA records', ids, runtimeIds);
assertExactIds('H3 generation results', generationIds, runtimeIds);
assertExactIds('Current runtime audio report', currentIds, runtimeIds);

for (const id of ids) {
  const transcriptPath = path.join(qaRoot, `${id}.candidate.transcript.qa.json`);
  const audioQaPath = path.join(h3Root, `${id}.audio.qa.json`);
  const candidateRecipePath = path.join(audioRoot, `${id}.candidate.mp3.recipe.json`);
  const videoRecipePath = path.join(qaRoot, `${id}-voice.video.recipe.json`);
  const transcript = readJson(transcriptPath);
  const audioQa = readJson(audioQaPath);
  const candidateRecipe = readJson(candidateRecipePath);
  const videoRecipe = readJson(videoRecipePath);
  const generation = generationById.get(id);
  if (!generation) throw new Error(`No H3 generation provenance for ${id}`);

  const rawVideo = path.join(videoRoot, `${id}-voice-raw.mp4`);
  if (fs.statSync(rawVideo).size !== generation.bytes || sha256(rawVideo) !== generation.sha256) {
    throw new Error(`H3 raw video no longer matches verified provenance for ${id}`);
  }

  const candidateMp3 = path.join(audioRoot, `${id}.candidate.mp3`);
  const candidateWav = path.join(audioRoot, `${id}.wav`);
  const waveform = path.join(h3Root, `${id}.waveform.png`);
  const spectrogram = path.join(h3Root, `${id}.spectrogram.png`);
  const mp3Bytes = audioQa.technicalGate?.mp3?.bytes;
  const wavBytes = audioQa.technicalGate?.wav?.bytes;
  if (!Number.isInteger(mp3Bytes) || !Number.isInteger(wavBytes)) {
    throw new Error(`H3 technical QA is missing artifact byte counts for ${id}`);
  }
  const priorIntegrity = [
    audioQa.artifactIntegrity,
    candidateRecipe.qa?.artifactIntegrity,
    videoRecipe.qa?.artifactIntegrity,
  ];
  const artifactIntegrity = {
    candidateMp3: verifyArtifact(candidateMp3, `${id} H3 candidate MP3`, {
      expectedBytes: mp3Bytes,
      recorded: priorIntegrity.map((value) => value?.candidateMp3),
    }),
    wav: verifyArtifact(candidateWav, `${id} H3 candidate WAV`, {
      expectedBytes: wavBytes,
      recorded: priorIntegrity.map((value) => value?.wav),
    }),
    waveform: verifyArtifact(waveform, `${id} H3 waveform`, {
      recorded: priorIntegrity.map((value) => value?.waveform),
    }),
    spectrogram: verifyArtifact(spectrogram, `${id} H3 spectrogram`, {
      recorded: priorIntegrity.map((value) => value?.spectrogram),
    }),
  };

  const result = transcript.result || {};
  const heard = String(result.heard || '');
  const whisper = {
    status: result.status || 'unknown',
    expected: transcript.expected || '',
    heard,
    emptyTranscript: !heard.trim(),
    ratio: result.ratio ?? null,
  };

  const humanValues = [
    audioQa.manualIsolationReview,
    candidateRecipe.qa?.manualIsolationReview,
    videoRecipe.qa?.manualIsolationReview,
  ].filter((value) => value && value !== 'pending');
  const distinctHumanValues = [...new Set(humanValues)];
  if (distinctHumanValues.length > 1) {
    throw new Error(`Conflicting human isolation decisions for ${id}`);
  }
  const manualIsolationReview = distinctHumanValues[0]
    || audioQa.manualIsolationReview
    || candidateRecipe.qa?.manualIsolationReview
    || videoRecipe.qa?.manualIsolationReview
    || 'pending';

  audioQa.whisper = whisper;
  audioQa.manualIsolationReview = manualIsolationReview;
  audioQa.productionAcceptance ||= 'pending-human-review';
  audioQa.artifactIntegrity = artifactIntegrity;
  writeJson(audioQaPath, audioQa);

  candidateRecipe.qa ||= {};
  candidateRecipe.qa.status ||= 'review';
  candidateRecipe.qa.whisper = whisper;
  candidateRecipe.qa.manualIsolationReview = manualIsolationReview;
  candidateRecipe.qa.artifactIntegrity = artifactIntegrity;
  writeJson(candidateRecipePath, candidateRecipe);

  const videoResult = {
    jobId: generation.jobId,
    status: generation.status,
    saved: `games/monster-opera/assets/source/video-raw/${id}-voice-raw.mp4`,
    bytes: generation.bytes,
    sha256: generation.sha256,
    remoteResultHashMatch: generation.remoteResultHashMatch,
    createdAt: generation.createdAt,
    completedAt: generation.completedAt,
  };
  videoRecipe.steps[0].result = videoResult;
  videoRecipe.qa ||= {};
  videoRecipe.qa.status ||= 'review';
  videoRecipe.qa.audioExtraction = 'passed';
  videoRecipe.qa.whisper = 'completed';
  videoRecipe.qa.manualIsolationReview = manualIsolationReview;
  videoRecipe.qa.artifactIntegrity = artifactIntegrity;
  writeJson(videoRecipePath, videoRecipe);
}

const monsters = ids.map((id) => {
  const audioQa = readJson(path.join(h3Root, `${id}.audio.qa.json`));
  const whisper = audioQa.whisper || {};
  const current = currentById.get(id);
  if (!current) throw new Error(`No current runtime audio QA record for ${id}`);
  const currentAudio = path.join(assetsRoot, current.asset);
  if (!fs.existsSync(currentAudio)) throw new Error(`Current runtime audio is missing for ${id}`);
  const runtime = runtimeById.get(id);
  const expectedRuntimeAudio = `./${gameRelative(currentAudio)}`;
  if (runtime?.audio !== expectedRuntimeAudio) {
    throw new Error(`Current audio report does not match the runtime path for ${id}`);
  }
  const currentIntegrity = verifyArtifact(currentAudio, `${id} current runtime MP3`, {
    expectedBytes: current.mp3?.bytes,
  });
  const candidateMp3 = path.join(audioRoot, `${id}.candidate.mp3`);
  const waveform = path.join(h3Root, `${id}.waveform.png`);
  const spectrogram = path.join(h3Root, `${id}.spectrogram.png`);
  return {
    id,
    expected: audioQa.expectedSyllable || whisper.expected || '',
    heard: whisper.heard || '',
    emptyTranscript: Boolean(whisper.emptyTranscript),
    whisperRatio: whisper.ratio ?? null,
    whisperStatus: whisper.status || 'unknown',
    technicalStatus: audioQa.technicalGate?.status || 'unknown',
    checks: audioQa.technicalGate?.checks || {},
    mp3: audioQa.technicalGate?.mp3 || {},
    generation: generationById.get(id),
    manualIsolationReview: audioQa.manualIsolationReview || 'pending',
    productionAcceptance: audioQa.productionAcceptance || 'pending-human-review',
    waveform: gameRelative(waveform),
    spectrogram: gameRelative(spectrogram),
    audio: gameRelative(candidateMp3),
    qa: gameRelative(path.join(qaRoot, `${id}.candidate.transcript.qa.json`)),
    currentRuntime: {
      label: 'A — Current game',
      source: 'provisional concept-video cut',
      asset: gameRelative(currentAudio),
      reviewPageSrc: pageRelative(currentAudio),
      qaStatus: current.qa || 'unknown',
      technicalStatus: current.technicalPass ? 'passed' : 'failed',
      checks: current.checks || {},
      mp3: current.mp3 || {},
      integrity: currentIntegrity,
    },
    h3Candidate: {
      label: 'B — H3 candidate',
      source: 'clean-source candidate',
      asset: gameRelative(candidateMp3),
      reviewPageSrc: pageRelative(candidateMp3),
      technicalStatus: audioQa.technicalGate?.status || 'unknown',
      checks: audioQa.technicalGate?.checks || {},
      mp3: audioQa.technicalGate?.mp3 || {},
      integrity: audioQa.artifactIntegrity,
      whisper,
      manualIsolationReview: audioQa.manualIsolationReview || 'pending',
      productionAcceptance: audioQa.productionAcceptance || 'pending-human-review',
    },
  };
});

const existsFor = (root, suffix) => (monster) => (
  fs.existsSync(path.join(root, `${monster.id}${suffix}`))
);
const counts = {
  monsters: monsters.length,
  currentRuntimeMp3s: monsters.filter((monster) => (
    fs.existsSync(path.join(gameRoot, monster.currentRuntime.asset))
  )).length,
  currentTechnicalPass: monsters.filter((monster) => (
    monster.currentRuntime.technicalStatus === 'passed'
  )).length,
  h3Videos: monsters.filter(existsFor(videoRoot, '-voice-raw.mp4')).length,
  candidateMp3s: monsters.filter(existsFor(audioRoot, '.candidate.mp3')).length,
  h3ArtifactIntegrityVerified: monsters.filter((monster) => (
    ['candidateMp3', 'wav', 'waveform', 'spectrogram'].every((key) => (
      Boolean(monster.h3Candidate.integrity?.[key]?.sha256)
    ))
  )).length,
  h3TechnicalPass: monsters.filter((monster) => monster.technicalStatus === 'passed').length,
  remoteResultHashVerified: monsters.filter((monster) => monster.generation?.remoteResultHashMatch).length,
  whisperJobs: monsters.length,
  whisperComplete: monsters.filter((monster) => monster.whisperStatus === 'completed').length,
  humanAccepted: monsters.filter((monster) => monster.manualIsolationReview === 'accepted').length,
  humanRejected: monsters.filter((monster) => monster.manualIsolationReview === 'rejected').length,
};
const manualIsolationReview = counts.humanAccepted === monsters.length
  ? 'accepted'
  : counts.humanRejected === monsters.length
    ? 'rejected'
    : counts.humanAccepted || counts.humanRejected
      ? 'mixed-review'
      : 'pending';
const overallStatus = manualIsolationReview === 'accepted'
  ? 'accepted'
  : manualIsolationReview === 'rejected'
    ? 'rejected'
    : 'review';
const report = {
  format: 'monster-opera-h3-audio-handoff',
  formatVersion: 3,
  created,
  pathBase: 'games/monster-opera/',
  reviewPage: gameRelative(outputHtml),
  overallStatus,
  manualIsolationReview,
  counts,
  monsters,
};
writeJson(outputJson, report);

const cards = monsters.map((monster) => {
  const current = monster.currentRuntime;
  const candidate = monster.h3Candidate;
  const currentMeta = [
    formatDuration(current.mp3.durationSeconds),
    String(current.mp3.codec || 'MP3').toUpperCase(),
    current.mp3.channelLayout || `${current.mp3.channels || '?'} channel`,
    formatSampleRate(current.mp3.sampleRate),
  ].join(' · ');
  const candidateMeta = [
    formatDuration(candidate.mp3.durationSeconds),
    String(candidate.mp3.codec || 'MP3').toUpperCase(),
    candidate.mp3.channelLayout || `${candidate.mp3.channels || '?'} channel`,
    formatSampleRate(candidate.mp3.sampleRate),
  ].join(' · ');
  const h3Checks = Object.entries(candidate.checks).map(([key, passed]) => (
    `<span class="check ${passed ? 'ok' : 'bad'}">${escapeHtml(key)}: ${passed ? 'pass' : 'fail'}</span>`
  )).join(' ');

  return `
  <article id="monster-${escapeHtml(monster.id)}" data-monster="${escapeHtml(monster.id)}">
    <header class="card-heading">
      <h2>${escapeHtml(displayName(monster.id))}</h2>
      <span class="decision-state" data-decision-state>Decision needed</span>
    </header>

    <div class="comparison" aria-label="${escapeHtml(displayName(monster.id))} audio comparison">
      <section class="version version-current">
        <p class="eyebrow">A · CURRENT RUNTIME</p>
        <h3>Current game sound</h3>
        <p class="source-note">Concept-video cut · playing in the game now</p>
        <audio controls preload="none" src="${escapeHtml(current.reviewPageSrc)}"
          aria-label="${escapeHtml(displayName(monster.id))} current game sound"></audio>
        <p class="media-meta">${escapeHtml(currentMeta)}</p>
        <p class="gate ${current.technicalStatus === 'passed' ? 'ok' : 'bad'}">Technical gate: ${escapeHtml(current.technicalStatus)}</p>
      </section>

      <section class="version version-candidate">
        <p class="eyebrow">B · H3 CANDIDATE</p>
        <h3>New clean-source sound</h3>
        <p class="source-note">H3 vocal candidate · not yet used by the game</p>
        <audio controls preload="none" src="${escapeHtml(candidate.reviewPageSrc)}"
          aria-label="${escapeHtml(displayName(monster.id))} H3 candidate sound"></audio>
        <p class="media-meta">${escapeHtml(candidateMeta)}</p>
        <p class="gate ${candidate.technicalStatus === 'passed' ? 'ok' : 'bad'}">Technical gate: ${escapeHtml(candidate.technicalStatus)}</p>
      </section>
    </div>

    <div class="listening-note">
      <p><b>Target syllable:</b> ${escapeHtml(monster.expected)} &nbsp; <b>Whisper heard from B:</b>
        <span class="heard">${escapeHtml(preview(monster.heard)) || '<i>empty transcript</i>'}</span></p>
      <p>Whisper: ${escapeHtml(monster.whisperStatus)} · human dry-vocal/isolation review: ${escapeHtml(monster.manualIsolationReview)}</p>
    </div>

    <fieldset class="decision">
      <legend>Choose ${escapeHtml(displayName(monster.id))}</legend>
      <label><input type="radio" name="choice-${escapeHtml(monster.id)}" value="current"> Keep A — current</label>
      <label><input type="radio" name="choice-${escapeHtml(monster.id)}" value="h3"> Use B — H3</label>
      <label><input type="radio" name="choice-${escapeHtml(monster.id)}" value="regenerate"> Request another take</label>
    </fieldset>

    <details class="evidence">
      <summary>Show H3 waveform and automated evidence</summary>
      <p>${h3Checks}</p>
      <div class="images">
        <figure><img src="${escapeHtml(monster.id)}.waveform.png" alt="${escapeHtml(monster.id)} H3 waveform"><figcaption>H3 waveform</figcaption></figure>
        <figure><img src="${escapeHtml(monster.id)}.spectrogram.png" alt="${escapeHtml(monster.id)} H3 spectrogram"><figcaption>H3 spectrogram</figcaption></figure>
      </div>
    </details>
  </article>`;
}).join('');

fs.writeFileSync(outputHtml, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="icon" href="data:,">
  <title>Monster Opera Audio A/B Review</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-rounded, system-ui, sans-serif; color: #27173a; background: #f6f1fa; }
    * { box-sizing: border-box; }
    body { max-width: 1180px; margin: 0 auto; padding: 2rem 1rem 5rem; }
    h1 { margin-bottom: 0.35rem; font-size: clamp(2rem, 4vw, 3.25rem); line-height: 1; }
    h2, h3, p { margin-top: 0; }
    button, input, textarea { font: inherit; }
    .intro { max-width: 58rem; color: #574568; font-size: 1.05rem; line-height: 1.55; }
    .review-panel { background: #29133f; color: white; padding: 1.25rem; margin: 1.5rem 0 2rem; border-radius: 1.25rem; box-shadow: 0 12px 32px #29133f26; }
    .review-panel h2 { margin-bottom: 0.5rem; }
    .review-panel ol { margin: 0.5rem 0 1rem; padding-left: 1.4rem; line-height: 1.55; }
    .review-panel .fine-print { color: #d9cde4; margin-bottom: 0; font-size: 0.9rem; }
    .review-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
    .review-actions button { border: 0; border-radius: 999px; padding: 0.7rem 1rem; font-weight: 750; cursor: pointer; }
    #copy-choices { background: #f5cf4f; color: #27173a; }
    #clear-choices { background: #563a6c; color: white; }
    #copy-status { min-height: 1.5em; color: #f5cf4f; }
    #choice-summary { width: 100%; min-height: 12rem; margin-top: 1rem; border: 1px solid #745d87; border-radius: 0.75rem; padding: 0.75rem; resize: vertical; background: #1f0d31; color: white; }
    article { background: white; padding: clamp(1rem, 3vw, 1.5rem); margin: 1.25rem 0; border: 1px solid #ded3e7; border-radius: 1.25rem; box-shadow: 0 5px 16px #3115420b; }
    .card-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .card-heading h2 { margin-bottom: 0; font-size: 1.75rem; }
    .decision-state { border-radius: 999px; padding: 0.35rem 0.65rem; background: #eee8f2; color: #665571; font-size: 0.85rem; font-weight: 750; }
    .decision-state.chosen { background: #d9f3df; color: #135d2e; }
    .comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .version { min-width: 0; padding: 1rem; border: 2px solid; border-radius: 1rem; }
    .version-current { border-color: #9b8ba8; background: #faf8fc; }
    .version-candidate { border-color: #8151b5; background: #f7f0ff; }
    .eyebrow { margin-bottom: 0.35rem; font-size: 0.78rem; letter-spacing: 0.08em; font-weight: 850; color: #6b4d81; }
    .version h3 { margin-bottom: 0.2rem; }
    .source-note { min-height: 2.4em; margin-bottom: 0.7rem; color: #665571; font-size: 0.92rem; }
    audio { width: 100%; }
    .media-meta { margin: 0.55rem 0 0; color: #665571; font-size: 0.82rem; }
    .gate { margin: 0.35rem 0 0; font-size: 0.88rem; font-weight: 750; }
    .listening-note { margin: 1rem 0; padding: 0.85rem 1rem; border-radius: 0.85rem; background: #f4f0f7; }
    .listening-note p { margin-bottom: 0.35rem; }
    .listening-note p:last-child { margin-bottom: 0; color: #665571; font-size: 0.9rem; }
    .heard { overflow-wrap: anywhere; word-break: break-word; }
    .decision { display: flex; flex-wrap: wrap; gap: 0.6rem; margin: 0; padding: 0; border: 0; }
    .decision legend { width: 100%; margin-bottom: 0.5rem; font-weight: 800; }
    .decision label { flex: 1 1 12rem; display: flex; align-items: center; gap: 0.5rem; min-height: 3rem; padding: 0.65rem 0.8rem; border: 1px solid #cfc2d8; border-radius: 0.75rem; cursor: pointer; }
    .decision label:has(input:checked) { border-color: #6c309c; outline: 2px solid #6c309c; background: #f2e7fa; }
    .decision input { width: 1.15rem; height: 1.15rem; accent-color: #6c309c; }
    .evidence { margin-top: 1rem; border-top: 1px solid #e3dae9; padding-top: 0.8rem; }
    .evidence summary { cursor: pointer; color: #583473; font-weight: 750; }
    .images { display: flex; gap: 1rem; flex-wrap: wrap; }
    .images figure { flex: 1 1 28rem; margin: 0; }
    .images img { width: 100%; height: auto; }
    figcaption { color: #665571; font-size: 0.85rem; }
    .check { margin-right: 0.6rem; }
    .ok { color: #176b36; }
    .bad { color: #a51d2d; }
    @media (max-width: 720px) {
      body { padding-top: 1.25rem; }
      .comparison { grid-template-columns: 1fr; }
      .source-note { min-height: auto; }
    }
  </style>
</head>
<body>
  <h1>Monster Opera Audio A/B Review</h1>
  <p class="intro">Compare the sound currently in the game with the new H3 candidate for each monster. Only one clip can play at a time, so switching between A and B stays clear.</p>

  <section class="review-panel" aria-labelledby="review-heading">
    <h2 id="review-heading">Make your choices</h2>
    <ol>
      <li>Listen to A (current game), then B (H3 candidate).</li>
      <li>Choose which version to keep, or request another take.</li>
      <li>Copy the summary and paste it back into the chat.</li>
    </ol>
    <div class="review-actions">
      <strong id="decision-count">0 of ${monsters.length} chosen</strong>
      <button id="copy-choices" type="button">Copy choices</button>
      <button id="clear-choices" type="button">Clear choices</button>
      <span id="copy-status" role="status" aria-live="polite"></span>
    </div>
    <textarea id="choice-summary" readonly aria-label="Choice summary"></textarea>
    <p class="fine-print">Selections are stored only in this browser. This review page does not change the game or accept any candidate automatically. H3 status: ${escapeHtml(overallStatus)} · human isolation review: ${escapeHtml(manualIsolationReview)}.</p>
  </section>
${cards}
  <script>
    (() => {
      const storageKey = 'monster-opera-h3-audio-choices-v1';
      const labels = {
        current: 'keep current (A)',
        h3: 'use H3 candidate (B)',
        regenerate: 'request another take',
      };
      const cards = Array.from(document.querySelectorAll('[data-monster]'));
      const inputs = Array.from(document.querySelectorAll('.decision input[type="radio"]'));
      const count = document.querySelector('#decision-count');
      const summary = document.querySelector('#choice-summary');
      const status = document.querySelector('#copy-status');

      function choices() {
        const result = {};
        cards.forEach((card) => {
          const selected = card.querySelector('.decision input:checked');
          if (selected) result[card.dataset.monster] = selected.value;
        });
        return result;
      }

      function update() {
        const selected = choices();
        const total = Object.keys(selected).length;
        count.textContent = total + ' of ${monsters.length} chosen';
        cards.forEach((card) => {
          const value = selected[card.dataset.monster];
          const badge = card.querySelector('[data-decision-state]');
          badge.textContent = value ? labels[value] : 'Decision needed';
          badge.classList.toggle('chosen', Boolean(value));
        });
        summary.value = ['Monster Opera audio choices', '']
          .concat(cards.map((card) => {
            const value = selected[card.dataset.monster];
            return card.dataset.monster + ': ' + (value ? labels[value] : 'not chosen');
          }))
          .join('\\n');
        try {
          localStorage.setItem(storageKey, JSON.stringify(selected));
        } catch {}
      }

      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
        Object.entries(saved).forEach(([id, value]) => {
          const input = document.querySelector('input[name="choice-' + id + '"][value="' + value + '"]');
          if (input) input.checked = true;
        });
      } catch {}

      inputs.forEach((input) => input.addEventListener('change', () => {
        status.textContent = '';
        update();
      }));

      const players = Array.from(document.querySelectorAll('audio'));
      players.forEach((player) => player.addEventListener('play', () => {
        players.forEach((other) => {
          if (other !== player) other.pause();
        });
      }));

      document.querySelector('#copy-choices').addEventListener('click', async () => {
        let copied = false;
        try {
          await navigator.clipboard.writeText(summary.value);
          copied = true;
        } catch {}
        if (!copied) {
          summary.focus();
          summary.select();
          try { copied = document.execCommand('copy'); } catch {}
        }
        status.textContent = copied ? 'Copied.' : 'Select the summary and copy it manually.';
      });

      document.querySelector('#clear-choices').addEventListener('click', () => {
        inputs.forEach((input) => { input.checked = false; });
        try { localStorage.removeItem(storageKey); } catch {}
        status.textContent = 'Choices cleared.';
        update();
      });

      update();
    })();
  </script>
</body>
</html>
`);

console.log(`Generated H3 handoff for ${monsters.length} monsters`);
