// validators/story-pack.mjs — qlobe-story-pack v2. This does NOT re-implement the
// story-stones rules: tools/validate-story-stones.mjs remains the authority. This
// validator wraps it as a subprocess (structural sweep by default; the caller can
// pass --assets/--audio for the heavier ffmpeg-backed checks) and folds its
// output into the unified findings stream. Additional story-pack instances beyond
// story-stones would each need their own authority tool; today there is one.

import { spawnSync } from 'node:child_process';
import { registryObjectsOfType, isFile, tryReadJSON, ROOT } from '../lib.mjs';

const AUTHORITY = 'tools/validate-story-stones.mjs';

function subjects() {
  return registryObjectsOfType('story-pack').map((o) => ({ id: o.id, project: o.project, document: o.document }));
}

function validate(subject, r) {
  const doc = tryReadJSON(subject.document);
  if (!doc) { r.error(`${subject.id}: ${subject.document} is missing or not valid JSON`); return; }
  if (doc.format !== 'qlobe-story-pack') r.warn(`format should be "qlobe-story-pack" (found ${JSON.stringify(doc.format)})`);

  // Only story-stones has a dedicated authority tool. Others get a shape sanity
  // pass here rather than a false clean bill.
  if (subject.project !== 'story-stones' && subject.id !== 'story-stones-storybook-library') {
    if (!doc.stones || !doc.stories) r.warn('story pack has no authority validator; basic shape only');
    return;
  }
  if (!isFile(AUTHORITY)) { r.warn(`authority validator missing: ${AUTHORITY}`); return; }

  const run = spawnSync('node', [AUTHORITY, ...process.argv.slice(2).filter((a) => a === '--assets' || a === '--audio')],
    { cwd: ROOT, encoding: 'utf8' });
  const out = `${run.stdout || ''}\n${run.stderr || ''}`;
  let failLines = 0;
  for (const line of out.split('\n')) {
    const t = line.trim();
    if (t.startsWith('WARN ')) r.warn(`validate-story-stones: ${t.slice(5)}`);
    else if (t.startsWith('FAIL ')) { r.error(`validate-story-stones: ${t.slice(5)}`); failLines += 1; }
  }
  if (run.status !== 0 && !failLines) r.error(`validate-story-stones exited ${run.status}${run.error ? `: ${run.error.message}` : ''}`);
  const summary = out.split('\n').find((l) => l.includes('stories') && l.includes('permutations'));
  if (summary) r.info(summary.trim());
  if (run.status === 0) r.info('validate-story-stones: PASS');
}

// Note: no 'story-stones' alias — that token is the GAME id, and must route to
// game-id targeting (registry completeness + this pack via project match).
export default { target: 'story-pack', aliases: ['story-packs'], subjects, validate };
