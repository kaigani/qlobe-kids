#!/usr/bin/env node
// tools/validate/build-assemble-golden.mjs
//
// Golden regression suite proving the build-assemble engine upgrade left the
// 14 sibling games byte-identical. Plain Node, zero dependencies (no npm, no
// package.json — a hard platform rule for this repo), runnable as:
//
//   node tools/validate/build-assemble-golden.mjs
//
// WHY SOURCE-TEXT EXTRACTION, NOT `import build-assemble.js` DIRECTLY
// ---------------------------------------------------------------------------
// The repo intentionally ships no package.json, so every shared/js/**/*.js
// file is plain ESM loaded by the browser via <script type="module">, which
// Node's CommonJS-by-default loader cannot import as-is ("Cannot use import
// statement outside a module"). build-assemble.js also transitively imports
// stage.js/art-pixi.js/sfx.js/etc., which assume a DOM + a vendored Pixi
// <script> tag — not available under plain `node`.
//
// Rather than reimplementing engine logic by hand in this test (which the
// task brief explicitly rejects: "Duplicated logic proves nothing"), each
// function under test is EXTRACTED VERBATIM from the live source file at
// test-run time — the exact bytes between `export function NAME(` and its
// matching closing brace, via brace-depth counting — and evaluated as its own
// tiny ES module. This is the same technique already proven out in the
// pre-existing golden layout script (scratchpad/layout.test.mjs, 20412/20412
// bit-identical). If the real function changes, the extracted text changes
// with it automatically; nothing here can silently drift from the engine.
//
// The three helpers under test in TEST 2 (normalizeArtRef, artKey, matchKey)
// were previously unexported internals. Per the task brief this script adds
// narrow `export` keywords to those three declarations in build-assemble.js
// (functional no-op — only visibility changes) rather than duplicating their
// logic here.

import { readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ENGINE_PATH = path.join(ROOT, 'shared/js/engines/build-assemble.js');
const GAMES_DIR = path.join(ROOT, 'games');

const WORKDIR = mkdtempSync(path.join(tmpdir(), 'qk-ba-golden-'));

let checks = 0;
let failed = 0;
const failures = [];

function check(label, pass, detail) {
  checks++;
  if (!pass) {
    failed++;
    failures.push(detail ? `${label} — ${detail}` : label);
  }
}

function closeEnough(a, b, tol = 1e-9) {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) === Number.isNaN(b);
  return Math.abs(a - b) <= tol;
}

// ---------------------------------------------------------------------------
// Verbatim source-text extraction
// ---------------------------------------------------------------------------

/** Slice `export function NAME(...) { ... }` out of `src`, verbatim, via
 *  paren/brace counting. The parameter list itself may contain destructuring
 *  braces (e.g. `function f({ w, h }) {`), so the params' matching `)` must
 *  be found FIRST, and only then do we look for the body's opening `{`. */
function extractExportedFunction(src, name) {
  const marker = `export function ${name}(`;
  const start = src.indexOf(marker);
  if (start === -1) throw new Error(`extractExportedFunction: "${marker}" not found in source`);
  const parenStart = start + marker.length - 1; // index of the opening "("
  let depth = 0;
  let parenEnd = -1;
  for (let i = parenStart; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) { parenEnd = i; break; }
    }
  }
  if (parenEnd === -1) throw new Error(`extractExportedFunction: unbalanced parens for ${name}`);
  const braceStart = src.indexOf('{', parenEnd);
  if (braceStart === -1) throw new Error(`extractExportedFunction: no body found for ${name}`);
  let bdepth = 0;
  let end = -1;
  for (let i = braceStart; i < src.length; i++) {
    const c = src[i];
    if (c === '{') bdepth++;
    else if (c === '}') {
      bdepth--;
      if (bdepth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) throw new Error(`extractExportedFunction: unbalanced braces for ${name}`);
  return src.slice(start, end);
}

function extractConst(src, name) {
  const re = new RegExp(`const ${name}\\s*=\\s*[^;]+;`);
  const m = src.match(re);
  if (!m) throw new Error(`extractConst: "${name}" not found in source`);
  return m[0];
}

const engineSrc = readFileSync(ENGINE_PATH, 'utf8');

// Sanity: fail loudly (not silently) if the extraction targets have moved or
// been renamed, rather than producing a vacuously-passing empty module.
for (const name of ['computeFieldLayout', 'normalizeArtRef', 'artKey', 'matchKey']) {
  check(
    `engine still exports function ${name} (extraction target present)`,
    engineSrc.includes(`export function ${name}(`),
  );
}

const extractedModuleSrc = [
  extractConst(engineSrc, 'BUILD_SPACE'),
  '',
  extractExportedFunction(engineSrc, 'computeFieldLayout'),
  '',
  extractExportedFunction(engineSrc, 'normalizeArtRef'),
  '',
  extractExportedFunction(engineSrc, 'artKey'),
  '',
  extractExportedFunction(engineSrc, 'matchKey'),
  '',
].join('\n');

const extractedModulePath = path.join(WORKDIR, 'extracted-build-assemble-pure.mjs');
writeFileSync(extractedModulePath, extractedModuleSrc, 'utf8');

const { computeFieldLayout, normalizeArtRef, artKey, matchKey } =
  await import(pathToFileURL(extractedModulePath).href);

// ---------------------------------------------------------------------------
// TEST 1 — layout parity: computeFieldLayout([1000,1000]) reproduces the
// pre-change layoutField maths, bit-for-bit within 1e-9, at four viewports.
//
// Oracle constants below were confirmed against the CURRENT source
// (shared/js/engines/build-assemble.js lines ~71-136, computeFieldLayout)
// immediately before writing this test:
//   pad               = max(8, min(20, min(w,h) * 0.025))                      [line 75]
//   portrait tray      = clamp(h * 0.29, 112, 255)   (== reserve, line 94)
//   landscape tray      = clamp(w * 0.28, 126, 330)   (== trayW,  line 120)
// These match the brief's oracle exactly. For a SQUARE space (spaceW===spaceH
// ===1000) the engine's `wideBuild` flag (sw/sh >= 1.25) is false, so
// `trayAtBottom === isPortrait` and `boardTop === pad` unconditionally
// (the 0.35 upward bias only fires when wideBuild is true) — i.e. the real
// code takes exactly the legacy branch for every one of the 14 siblings,
// which is the guarantee this test exists to pin down.
// ---------------------------------------------------------------------------

function legacyLayoutField(w, h) {
  const portrait = h >= w;
  const pad = Math.max(8, Math.min(20, Math.min(w, h) * 0.025));
  let boardSize, trayLeft, trayTop, trayW, trayH, boardLeft, boardTop;
  if (portrait) {
    trayH = Math.max(112, Math.min(h * 0.29, 255));
    boardSize = Math.max(180, Math.min(w - pad * 2, h - trayH - pad * 3));
    boardLeft = (w - boardSize) / 2;
    boardTop = pad;
    trayLeft = pad;
    trayTop = boardTop + boardSize + pad;
    trayW = w - pad * 2;
    trayH = Math.max(96, h - trayTop - pad);
  } else {
    trayW = Math.max(126, Math.min(w * 0.28, 330));
    boardSize = Math.max(180, Math.min(h - pad * 2, w - trayW - pad * 3));
    boardLeft = pad + Math.max(0, (w - trayW - pad * 3 - boardSize) / 2);
    boardTop = (h - boardSize) / 2;
    trayLeft = w - trayW - pad;
    trayTop = pad;
    trayH = h - pad * 2;
  }
  return {
    pad,
    boardScale: boardSize / 1000,
    board: { left: boardLeft, top: boardTop, w: boardSize, h: boardSize },
    tray: { left: trayLeft, top: trayTop, w: trayW, h: trayH },
  };
}

const VIEWPORTS = [
  [1156, 598], // landscape iPad 1180x820 minus HUD and padding
  [796, 958], // portrait iPad 820x1180 minus HUD and padding
  [1024, 768],
  [500, 500],
];

for (const [w, h] of VIEWPORTS) {
  const oracle = legacyLayoutField(w, h);
  const real = computeFieldLayout({ w, h, spaceW: 1000, spaceH: 1000, portrait: h >= w });
  const realBoard = { left: real.boardLeft, top: real.boardTop, w: real.boardW, h: real.boardH };

  check(
    `TEST1 [${w}x${h}] boardScale`,
    closeEnough(oracle.boardScale, real.boardScale),
    `oracle=${oracle.boardScale} real=${real.boardScale}`,
  );
  for (const k of ['left', 'top', 'w', 'h']) {
    check(
      `TEST1 [${w}x${h}] board.${k}`,
      closeEnough(oracle.board[k], realBoard[k]),
      `oracle=${oracle.board[k]} real=${realBoard[k]}`,
    );
    check(
      `TEST1 [${w}x${h}] tray.${k}`,
      closeEnough(oracle.tray[k], real.tray[k]),
      `oracle=${oracle.tray[k]} real=${real.tray[k]}`,
    );
  }
  check(
    `TEST1 [${w}x${h}] pad`,
    closeEnough(oracle.pad, real.pad),
    `oracle=${oracle.pad} real=${real.pad}`,
  );
  check(
    `TEST1 [${w}x${h}] tray side (portrait -> trayAtBottom)`,
    oracle_side(w, h) === real.trayAtBottom,
  );
}
function oracle_side(w, h) { return h >= w; }

// ---------------------------------------------------------------------------
// TEST 2 — art-ref and matchKey parity across every shipping build-assemble
// config, for the 14 SIBLINGS strictly, blend-train reported separately.
// ---------------------------------------------------------------------------

// Discovery, equivalent to: rg -l "build-assemble" games/*/config.js
const gameIds = readdirSync(GAMES_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

const buildAssembleConfigJsGames = [];
for (const id of gameIds) {
  const cfgPath = path.join(GAMES_DIR, id, 'config.js');
  let text;
  try { text = readFileSync(cfgPath, 'utf8'); } catch { continue; }
  if (text.includes('build-assemble')) buildAssembleConfigJsGames.push(id);
}

check(
  'TEST2 discovery: 14 sibling config.js files declare engine build-assemble',
  buildAssembleConfigJsGames.length === 14,
  `found ${buildAssembleConfigJsGames.length}: ${buildAssembleConfigJsGames.join(', ')}`,
);

// blend-train's engine declaration lives in config.json (config.js is a thin
// `await fetch(...).then(r => r.json())` shim, per the shim's own header
// comment) — `rg -l "build-assemble" games/*/config.js` literally does NOT
// match it, so the task brief's "expect 15, including blend-train" undercounts
// by one relative to the literal grep. Reported separately below, not folded
// into the 14-sibling strict-equality set.
const blendTrainConfigJsonPath = path.join(GAMES_DIR, 'blend-train/config.json');
let blendTrainDeclaresEngine = false;
try {
  const j = JSON.parse(readFileSync(blendTrainConfigJsonPath, 'utf8'));
  blendTrainDeclaresEngine = j.engine === 'build-assemble';
} catch { /* reported below */ }

/** CJS-transform a legacy `export default {...}` config.js and require() it.
 *  Every one of the 14 sibling config.js files is self-contained (no
 *  `import` statements — confirmed by grep) and has exactly one `export`
 *  token, so a literal `export default` -> `module.exports =` swap is a
 *  faithful, mechanical re-emission of the same object literal, not a
 *  reimplementation of any engine or config logic. */
function loadLegacyConfig(id) {
  const cfgPath = path.join(GAMES_DIR, id, 'config.js');
  const src = readFileSync(cfgPath, 'utf8');
  const exportCount = (src.match(/\bexport\b/g) || []).length;
  if (exportCount !== 1 || !src.includes('export default')) {
    throw new Error(`${id}/config.js: expected exactly one "export default", found ${exportCount} export token(s)`);
  }
  if (/^\s*import\s/m.test(src)) {
    throw new Error(`${id}/config.js: unexpected import statement, CJS transform unsafe`);
  }
  const cjs = src.replace('export default', 'module.exports =');
  const outPath = path.join(WORKDIR, `${id}.config.cjs`);
  writeFileSync(outPath, cjs, 'utf8');
  return import(pathToFileURL(outPath).href).then((m) => m.default);
}

// Old (pre-change) art-ref algorithm, verbatim per the task brief:
//   !ref ? 'emoji:🧩' : (ref.includes(':') ? ref : 'emoji:' + ref)
function oldNormalizeArtRef(ref) {
  return !ref ? 'emoji:🧩' : (ref.includes(':') ? ref : 'emoji:' + ref);
}

function walkParts(config, fn) {
  for (const mode of config.modes || []) {
    for (const build of mode.builds || []) {
      for (const part of build.parts || []) {
        fn(part, { modeId: mode.id, buildName: build.name });
      }
    }
  }
}

let siblingPartsChecked = 0;
for (const id of buildAssembleConfigJsGames) {
  let config;
  try {
    config = await loadLegacyConfig(id);
  } catch (err) {
    check(`TEST2 [${id}] config.js loads`, false, err.message);
    continue;
  }
  check(`TEST2 [${id}] config.js loads`, !!config && Array.isArray(config.modes));
  if (!config || !Array.isArray(config.modes)) continue;

  walkParts(config, (part, where) => {
    siblingPartsChecked++;
    const rawArt = part.art;
    const oldArt = oldNormalizeArtRef(rawArt);
    const newArt = normalizeArtRef(rawArt);
    check(
      `TEST2 [${id}/${where.modeId}/${where.buildName}] normalizeArtRef(${JSON.stringify(rawArt)}) unchanged`,
      oldArt === newArt,
      `old=${JSON.stringify(oldArt)} new=${JSON.stringify(newArt)}`,
    );

    const oldMatchKey = `${oldArt}|${part.alt || ''}`;
    const newMatchKey = matchKey({ art: newArt, alt: part.alt });
    check(
      `TEST2 [${id}/${where.modeId}/${where.buildName}] matchKey(${JSON.stringify(rawArt)}, ${JSON.stringify(part.alt)}) unchanged`,
      oldMatchKey === newMatchKey,
      `old=${JSON.stringify(oldMatchKey)} new=${JSON.stringify(newMatchKey)}`,
    );

    // artKey on an already-string ref must be pure identity (the doc comment's
    // claim that "strings return themselves, so every existing config produces
    // byte-identical match keys").
    check(
      `TEST2 [${id}/${where.modeId}/${where.buildName}] artKey(string) === identity`,
      artKey(newArt) === newArt,
    );
  });
}

check('TEST2 at least one part was actually exercised across the 14 siblings', siblingPartsChecked > 0, `checked ${siblingPartsChecked} parts`);

// blend-train reported, never asserted for strict equality against the 14.
let blendTrainReport = 'blend-train: config.json not readable as JSON';
try {
  const j = JSON.parse(readFileSync(blendTrainConfigJsonPath, 'utf8'));
  let blendTrainParts = 0;
  const mismatches = [];
  walkParts(j, (part) => {
    blendTrainParts++;
    const oldArt = oldNormalizeArtRef(part.art);
    const newArt = normalizeArtRef(part.art);
    if (oldArt !== newArt) mismatches.push({ art: part.art, oldArt, newArt });
  });
  blendTrainReport = `blend-train (config.json, engine=${JSON.stringify(j.engine)}): ${blendTrainParts} parts scanned, `
    + `${mismatches.length} normalizeArtRef divergence(s) from the old algorithm (expected/allowed — blend-train is the`
    + ` rewrite target, not a sibling)`
    + (mismatches.length ? `: ${JSON.stringify(mismatches.slice(0, 5))}${mismatches.length > 5 ? ', …' : ''}` : '');
} catch (err) {
  blendTrainReport = `blend-train: config.json not readable/parseable (${err.message})`;
}

// ---------------------------------------------------------------------------
// TEST 3 — no accidental fetches: content.ready( must never appear at module
// top level or inside the constructor.
// ---------------------------------------------------------------------------

const readyOccurrences = [];
{
  const lines = engineSrc.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('content.ready(')) readyOccurrences.push({ line: i + 1, text: line.trim() });
  });
}
check(
  'TEST3 content.ready( never appears anywhere in build-assemble.js',
  readyOccurrences.length === 0,
  readyOccurrences.length ? readyOccurrences.map((o) => `L${o.line}: ${o.text}`).join(' | ') : undefined,
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

console.log('');
console.log('build-assemble golden regression suite');
console.log('='.repeat(72));
console.log(`engine under test: ${path.relative(ROOT, ENGINE_PATH)}`);
console.log(`siblings discovered: ${buildAssembleConfigJsGames.length} — ${buildAssembleConfigJsGames.join(', ')}`);
console.log(`sibling parts exercised (TEST2): ${siblingPartsChecked}`);
console.log(blendTrainReport);
if (readyOccurrences.length === 0) {
  console.log('TEST3: content.ready( does not appear anywhere in the engine — no fetch risk to gate.');
}
console.log('');

if (failures.length) {
  console.log(`FAILURES (${failures.length}):`);
  for (const f of failures) console.log(`  - ${f}`);
  console.log('');
}

console.log(`${checks - failed}/${checks} checks passed`);

process.exit(failed === 0 ? 0 : 1);
