# tools/qa — the QA driver toolkit

Every shipped QLOBE Kids game carries a `games/<id>/tools/qa.mjs`: a real-Chrome
driver that plays the game through `window.QLOBE_DEBUG` and prints a pass/fail
line per scenario. Those drivers all used to re-derive the same ~60 lines of
plumbing. That plumbing now lives in **`tools/qa/lib/driver.mjs`**; each game
file keeps only its own scenarios and assertions.

Nothing here is a test framework. There is no runner, no `describe`, no
lifecycle. A driver is a plain Node script with a `main()`, and the lib is a bag
of helpers it may use as much or as little as it likes.

---

## Running a driver

```sh
python3 -m http.server 8000                    # from the repo root
caffeinate -dims node games/<id>/tools/qa.mjs  # in another shell
```

`caffeinate -dims` is not optional for long runs. A Mac that sleeps mid-drive
freezes Chrome without failing the run — the driver just hangs forever.

Common flags (a driver only accepts the ones it actually reads; check its
header):

| flag | meaning | default |
| --- | --- | --- |
| `--base <url>` | origin to test — a local server, or `https://qlo.be` | `http://127.0.0.1:8000` |
| `--shots <dir>` | screenshot directory | `qa-shots/<game-id>` |
| `--playwright <dir>` | Playwright `node_modules` directory | `/private/tmp/pw/node_modules` |
| `--headed` | run Chrome headed | headless |

Environment equivalents: `$QLOBE_BASE`, `$QLOBE_SHOTS`,
`$PLAYWRIGHT_MODULE_PATH` (or `$PW_MODULE`).

### Playwright lives outside the repo

This is a **no-build repo** — no `package.json`, no `npm install`, ever. Install
Playwright once into a scratch directory and point the drivers at it:

```sh
mkdir -p /private/tmp/pw && cd /private/tmp/pw && npm install playwright@1.52.0
```

`loadPlaywright()` resolves it with `createRequire` against `<dir>/noop.js` —
only the *directory* has to exist, not the file. Resolution order, first hit
wins: an explicit `dir` argument → `--playwright` / `--pw-module` →
`$PLAYWRIGHT_MODULE_PATH` / `$PW_MODULE` → `/private/tmp/pw/node_modules`.

### `channel: 'chrome'` is load-bearing

Playwright's bundled Chromium ships **without an AAC decoder**. Every `.m4a` in a
game's `assets/audio/` silently fails to decode there, the game falls back to Web
Speech, and every recorded-clip assertion passes against the synth voice instead
of the real teacher clip — proving nothing. `launchChrome()` therefore defaults
to the system Chrome. A driver that genuinely never touches audio may pass
`channel: null`.

---

## The lib API

```js
import {
  args, createArgs, baseUrl,
  loadPlaywright, playwrightDir, launchChrome, DEFAULT_PLAYWRIGHT_DIR,
  createReporter, REPORT_STYLES,
  openSession, checkSessionClean,
  debug, audio,
  resolveShots, ensureShots, shooter,
  dragBetween, dragPath, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';
```

### Arguments

- `args` — the process argv, parsed once. `args.flag(name, fallback)`,
  `args.has(name)`, `args.num(name, fallback)`, `args.first([names], fallback)`.
- `createArgs(argv)` — same, over an argv you supply.
- `baseUrl(fallback?, { envVar })` — `--base` → `$QLOBE_BASE` → fallback, with
  the trailing slash stripped (drivers append `/games/<id>/` themselves).

### Browser

- `loadPlaywright({ dir?, flags?, envVars?, fallback?, required? })` →
  `{ chromium, firefox, webkit, dir }`.
- `launchChrome({ channel = 'chrome', headless = !--headed, ...launchOptions })`
  → a `Browser`. Resolves Playwright itself unless you pass `chromium`.

### Reporter

```js
const { check, note, head, results, failures, summary, finish } = createReporter({
  style: 'ok',        // 'ok' | 'pad' | 'wide' — see REPORT_STYLES
  detailLimit: 0,     // truncate the detail column (0 = no limit)
  collapse: false,    // collapse whitespace runs in the detail
  detailOnFail: false // print the detail only for failures
});

check('splash boots', state.screen === 'splash', JSON.stringify(state)); // -> boolean
finish({ suffix: `; shots in ${shots}` });   // prints "N/M checks passed", sets exitCode
```

`check()` returns the condition's truthiness so a driver can branch on it. Three
styles exist because the fleet prints three column widths and the conversion bar
was byte-identical output:

| style | pass mark | fail mark | used by |
| --- | --- | --- | --- |
| `ok` | `` ok `` | `FAIL` | most games |
| `pad` | `  ok  ` | `  FAIL` | blend-train, sink-or-float, flashlight-cave, counting-treasure-cups, bug-hotel-observer (+ `detailOnFail`) |
| `wide` | `  ok   ` | `  FAIL ` | world-music-dance's smoke suite |

The marks are stored **without** the separator space — `check()` prints
`${mark} ${name}`. A mark that carries its own trailing space shifts the name
column by one, which is exactly the kind of off-by-one that breaks an A/B diff.
`tools/qa/` has no test runner, so when changing a mark, verify it against the
driver's original formatter by constructing both strings and comparing.

**New drivers should use the default `ok` style.**

### Sessions

`openSession(browser, opts)` gives you one context + one page with the three
collectors the platform always asserts on afterwards:

- `errors` — pageerrors and `console.error` text
- `failed` — failed requests and any response ≥ 400
- `remote` — any request that left the local base (a shipped game makes no
  model/service call, ever)

```js
const session = await openSession(browser, {
  url: `${base}/games/my-game/`,
  base,                              // origin for the "remote request" test
  viewport: { width: 1180, height: 820 },
  reducedMotion: 'no-preference',    // or 'reduce'
  context: { permissions: ['microphone'] },  // extra newContext options
  initScript: () => { /* runs before any page script */ },
  allowAbortedMedia: true,   // net::ERR_ABORTED on a *.m4a URL is a normal voice
                             // switch, not a failure. .m4a ONLY — a game that
                             // ships mp3/wav needs its own requestfailed handler.
  allowDataUrls: true,       // data: URIs are not "remote"
  ignoreConsole: ['known Chrome diagnostic'],  // routed to session.diagnostics
  ready: true,               // await window.QLOBE_DEBUG.ready (default)
  readyWhen: () => …,        // …or a custom page predicate instead
  seed: 42, fastTimers: true, mute: true,      // the QLOBE_DEBUG handshake
  after: async (page) => { … },                // anything else, once ready
});
// -> { context, page, errors, failed, remote, diagnostics, close() }

checkSessionClean(reporter, session, 'landscape');  // the three hygiene checks
```

### QLOBE_DEBUG helpers

`debug.*` are one-line `page.evaluate` wrappers over the v1 contract. Await each
one individually — several engines reject a state-changing hook fired before the
previous one resolves.

```js
await debug.waitForReady(page);
const modes = await debug.listModes(page);         // [{ id, title }]
await debug.startMode(page, 'sort');
await debug.waitForInput(page);                    // getState().awaitingInput
const state = await debug.getState(page);
const targets = await debug.getTargets(page);      // [{ id, role, rect:{x,y,w,h} }]
await debug.tap(page, 'bin-red');                  // by target id, real handler
await debug.winRound(page);
await debug.waitForScreen(page, 'end');
await debug.seed(page, 42);
await debug.fastTimers(page, 0.05);                // falls back to setFastTimers
await debug.mute(page, true);
await debug.call(page, 'tracePoints');             // any game-specific extra
```

### Audio-log assertions

`getAudioLog()` is a ring buffer of `{ key, text, kind, at }`.

- `kind` is `'clip'` (a real recorded `.m4a` decoded and played) or `'speech'`
  (the Web Speech fallback). The two are **indistinguishable in a screenshot**,
  which is the entire reason these helpers exist.
- `at` is **milliseconds since page load** (`performance.now()`), *not* a wall
  clock timestamp. Never compare it against `Date.now()` or a Node-side clock —
  only against other `at` values from the same page.

```js
await debug.clearAudioLog(page);
await debug.waitForAudio(page, 'prompt-sort');
const log = await debug.getAudioLog(page);

audio.heard(log, 'prompt-sort');           // heard at all?
audio.heardClip(log, 'prompt-sort');       // heard as a REAL recorded clip?
audio.count(log, 'prompt-sort') === 1;     // the "spoken exactly once" guard
audio.inOrder(log, ['letter-m', 'letter-a', 'letter-t']);
audio.clipsInOrder(log, [...]);            // …and every one was a clip
audio.since(log, mark);                    // entries at/after an `at` mark
audio.describe(log);                       // "clip:prompt-sort → speech:try-again"
```

### Screenshots

The convention is `qa-shots/<game-id>/NN-scenario.png` under the repo root.
Drivers that produce a lot of PNGs default **outside** the repo instead
(`/private/tmp/qlobe-<id>-shots`) so a run never leaves untracked files in a
worktree — pass that path as `resolveShots()`'s fallback.

```js
const shots = resolveShots('qa-shots/my-game');   // --shots / $QLOBE_SHOTS win
await ensureShots(shots);
const shot = shooter(shots);
await shot(page, '01-splash-landscape');          // .png appended if missing
```

### Pointer utilities

```js
await dragBetween(page, fromBox, toBox, { steps: 10 });  // bounding boxes or points
await dragPath(page, points);                            // a trace/fold/beam stroke
const sizes = await targetSizes(page);                   // visible [data-target] rects
check('targets meet 96px', undersized(sizes).length === 0, JSON.stringify(undersized(sizes)));
```

---

## Writing a new driver

```js
#!/usr/bin/env node
// games/my-game/tools/qa.mjs — real-Chrome smoke and visual-QC driver.
//
//   python3 -m http.server 8000
//   node games/my-game/tools/qa.mjs [--base …] [--shots …] [--playwright …]

import {
  baseUrl, launchChrome, createReporter, openSession, checkSessionClean,
  resolveShots, ensureShots, shooter, debug,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/my-game');
const shot = shooter(shots);
const { check, finish } = createReporter();

async function drive(browser) {
  const session = await openSession(browser, {
    url: `${base}/games/my-game/`, base, seed: 42, fastTimers: true,
  });
  const { page } = session;

  check('splash boots', (await debug.getState(page)).screen === 'splash');
  await shot(page, '01-splash');

  // …your scenarios…

  checkSessionClean({ check }, session);
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try {
    await drive(browser);
  } finally {
    await browser.close();
    finish();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
```

### `finally { await browser.close() }` is MANDATORY

Not a style preference — the difference between a driver that fails and a
driver that hangs. `main().catch()` sets `process.exitCode`, it does **not**
end the process: node exits when the event loop drains, and a live Chrome
keeps a socket and a child process on that loop forever. So a driver whose
`browser.close()` sits on the happy path — after the last check, before
`finish()` — never reaches it when a check throws, and the run sits there
silently until someone notices and kills it. Under `caffeinate -dims` that is
indistinguishable from a slow drive.

A locator that misses is not a rare event: every stale selector, every timing
assumption, every `boundingBox()` on a node the game no longer renders costs a
30-second Playwright timeout and then throws. The fix is structural — split the
scenarios into a `drive(browser)` and let `main()` own the browser lifetime:

```js
try {
  await drive(browser);
} finally {
  await browser.close();   // runs on the throw path too
  finish();                // report what DID run before the throw
}
```

Put `finish()` inside the `finally` as well. On a throw you then get the
partial scorecard first and the stack after it, which is what tells you which
check was the last one to pass. `main().catch()` runs after the `finally`, so
its `process.exitCode = 1` still wins over `finish()`'s.

Two related habits:

- A driver that keeps its own session/context list still needs this. Closing
  the browser closes every context under it; closing contexts one by one on
  the happy path does not.
- If a whole downstream block depends on one earlier check, branch on
  `check()`'s return value and stop deliberately — a reported FAIL plus a
  `note()` beats a 30s timeout forty lines later that buries the real cause:

  ```js
  const placed = check('drag places a part', state.pieces === 1);
  if (!placed) {
    check('no page error behind it', session.errors.length === 0, session.errors.join(' | '));
    note('the rest of the suite needs a placed part — stopping here');
    return;
  }
  ```

What belongs in the game file, not the lib: every scenario, every assertion,
every game-specific selector, and any bespoke instrumentation (an oscillator
spy, a `MutationObserver` on `#announcer`, a PNG pixel diff). The lib is
plumbing only. If two games grow the *same* scenario helper, that is when it
earns a place here.

## Other tools in this directory

- `build-assemble-sweep.mjs` — sweeps every `build-assemble` engine game at once
  rather than driving one game deeply. Not yet on the lib.
