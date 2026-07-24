// validators/voice-pack.mjs — voice manifest + cue files (qlobe-voice-pack v1
// and the legacy schemaVersion-only shape; §3.4/§7.2).
//
// The cue rules (monotonic, non-overlapping, <=5000, viseme-set membership) are
// NOT re-derived here: this module imports validateCues from the SAME source
// shared/js/studio/workspaces/speech-data.js that the Speech workspace and the
// parity harness use, which in turn mirrors the server's validated_cues()
// exactly. Cue data issues are reported as WARN (they are on-disk data, not a
// workspace regression — matching parity-speech.mjs), while a missing referenced
// audio/cue file, or a broken manifest, is an ERROR.

import { readFileSync } from 'node:fs';
import {
  listCharacterIds, isFile, tryReadJSON, abs,
} from '../lib.mjs';
import { inferTier } from './character.mjs';

// Load validateCues from the exact browser source (zero-import module → data URL,
// the same technique tools/parity-speech.mjs uses).
const speechDataSource = readFileSync(
  abs('shared/js/studio/workspaces/speech-data.js'), 'utf8');
const { validateCues } = await import(`data:text/javascript,${encodeURIComponent(speechDataSource)}`);

const voiceDir = (id) => `shared/characters/${id}/voice`;

function subjects() {
  return listCharacterIds()
    .filter((id) => isFile(`${voiceDir(id)}/manifest.json`))
    .map((id) => ({ id, characterId: id, document: `${voiceDir(id)}/manifest.json` }));
}

function validate(subject, r) {
  const id = subject.id;
  const dir = voiceDir(id);
  const manifest = tryReadJSON(`${dir}/manifest.json`);
  if (!manifest) { r.error(`${id}: voice/manifest.json is missing or not valid JSON`); return; }

  // Accept both shapes. v1 declares format/formatVersion/id; legacy carries only
  // schemaVersion. Neither is rewritten on disk (first-touch materialization).
  if (manifest.format !== undefined) {
    if (manifest.format !== 'qlobe-voice-pack') r.error(`manifest.format must be "qlobe-voice-pack" when present (found ${JSON.stringify(manifest.format)})`);
    if (manifest.formatVersion !== undefined && !Number.isInteger(manifest.formatVersion)) r.error('manifest.formatVersion must be an integer');
    if (manifest.id !== undefined && manifest.id !== id) r.error(`manifest.id "${manifest.id}" does not match character "${id}"`);
  } else if (manifest.schemaVersion !== undefined) {
    r.info('legacy voice manifest (schemaVersion only — becomes qlobe-voice-pack v1 at first touch)');
  } else {
    r.warn('voice manifest has neither format nor schemaVersion');
  }

  const lines = manifest.lines;
  if (!Array.isArray(lines) || !lines.length) { r.error('voice manifest has no lines[]'); return; }

  let cueFiles = 0;
  const seen = new Set();
  for (const [i, line] of lines.entries()) {
    const key = line?.id || line?.cues || `#${i + 1}`;
    if (line?.id) { if (seen.has(line.id)) r.error(`duplicate line id "${line.id}"`); seen.add(line.id); }
    if (typeof line?.audio !== 'string' || !line.audio) { r.error(`line "${key}" has no audio`); }
    else {
      const audioRel = line.audio.replace(/^voice\//, '');
      if (!isFile(`${dir}/${audioRel}`)) r.error(`line "${key}" audio not found: ${line.audio}`);
    }
    if (typeof line?.cues !== 'string' || !line.cues) { r.warn(`line "${key}" has no cues file`); continue; }
    const cuesRel = line.cues.replace(/^voice\//, '');
    const cuesPath = `${dir}/${cuesRel}`;
    if (!isFile(cuesPath)) { r.error(`line "${key}" cues not found: ${line.cues}`); continue; }
    cueFiles += 1;
    const cueDoc = tryReadJSON(cuesPath);
    if (!cueDoc) { r.error(`line "${key}" cues is not valid JSON`); continue; }
    // validated_cues() expects { mouthCues, metadata } — the on-disk shape.
    const result = validateCues(cueDoc);
    if (!result.ok) for (const err of result.errors) r.warn(`${cuesRel}: ${err}`);
  }
  r.info(`${lines.length} line(s), ${cueFiles} cue file(s)`);

  // A rigged character SHOULD have voice lines for its tier; anim-only need not.
  if (inferTier(id) === 'rigged' && !lines.length) r.warn('rigged character has no voice lines');
}

export default { target: 'voice-pack', aliases: ['voice', 'voices'], subjects, validate };
