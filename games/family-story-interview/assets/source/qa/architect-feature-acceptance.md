# Architect feature acceptance — Family Story Interview

**Verdict: PASS — 0 blockers, 0 major findings, 0 minor findings.**

The bespoke implementation replaces the registered `observe-journal` stub with
the intended private family-memory loop. The supplied visual captures support
the select → live record → decorate → saved page → gallery experience. The
strict recording bound now has one authoritative 60-second cap and direct
auto-stop coverage.

## Requirements trace

| Requirement | Verdict | Evidence |
|---|---|---|
| Three visual question choices and rotation | PASS | `config.json` supplies three modes with three questions each; `main.js` `chooseTopic()` selects `topicTurns[mode.id] % questions.length`. The question-shelf capture shows all three cards. |
| Surprise/question randomization | PASS | `main.js` `handleAction('surprise')` uses the seeded `rng`, then enters the ordinary topic/question path. |
| Spoken, recorded prompts | PASS | `main.js` initializes `voice-clips` from the game-local manifest and `say()` delegates through `createNarrator`; `assets/audio/manifest.json` maps all 26 prompt/state clips. `assets/audio/qa.json` records Qwen voice-clone + Whisper validation per line. |
| Explicit microphone permission | PASS | `main.js` `startRecording()` is reachable only from `record-toggle`; `story-media.js` calls `getUserMedia({ audio: ... })` only inside recorder `start()`. |
| Live recording state | PASS | `main.js` `updateRecordingUi()` adds record status, live-dot, timer and analyser-driven waveform; capture `03-interview-recording.png` visibly shows this state. |
| Recording bound | PASS | `config.json` declares 60 seconds and `main.js` passes exactly `config.timeLimitSeconds * 1000` to `createRecorder()`. The recorder clamps the returned duration to its exact `maxDuration` and routes auto-stop through `completeRecording()`, the same result path as a manual stop. QA instantiates a fake recorder at 40 ms and asserts a nonempty Blob with returned duration `<= 40`. |
| Denied/unsupported microphone fallback | PASS | `story-media.js` returns `denied` for absent APIs, denial, and request timeout; `main.js` transitions to `fallback` and renders the usable Make the page action. Capture `13-microphone-denied-fallback.png` confirms the visible path. |
| Optional photo | PASS | `index.html` has a hidden `accept="image/*" capture="environment"` input; it opens only from explicit photo actions. `imageFileToJpeg()` limits type, 15 MB source size, 1280 px output edge, and JPEG-encodes before storage. No-photo decoration/save is retained. |
| Blob persistence, cap, reload/replay | PASS | `createMemoryStore()` persists local records to IndexedDB, retains photo/audio Blobs, evicts oldest beyond 12, and supplies a Map fallback if IndexedDB cannot open. `replayBlob()` plays from a revocable object URL. QA covers saved gallery and reload persistence. |
| Saved page/gallery and two-step clear | PASS | `renderSaved()` builds page/replay/add-photo/book actions; `renderBook()` lists safe metadata only. `clearBook()` requires a first confirmation state then a second tap before `store.clear()`. |
| Interruption cleanup | PASS | `visibilitychange` calls `preserveInterruptedRecording()`, releases replay and narration; `pagehide` also stops/keeps recording result, stops music, and releases replay. Recorder `cleanup()` stops tracks, analyser, timers and recorder. |
| No personal-media exposure | PASS | No upload/share/transcript fields are stored in the manifest/config; `serializableMemory()` removes `audioBlob`/`photoBlob` from debug output; IDs/titles are generated from fixed safe config strings. |
| Debug contract | PASS | `installDebug()` exposes v1 foundation (`ready`, modes, start, state, tap, home, mute, seeded RNG/timers) plus semantic media helpers. `getSavedStories()` returns metadata, not Blobs. |
| Responsive/reduced motion | PASS | CSS handles portrait, wide-short and reduced-motion states. Captures include landscape, portrait reduced motion, portrait interview and wide-short screens. The supplied QA checks 96 px targets and overflow in those layouts. |

## QA evidence

The game-local `tools/qa.mjs` now covers the full success/fallback flow plus
hardening behavior: fake and denied recording, exact recorder auto-stop,
optional photo/sticker, save/gallery/reload, target size, portrait, wide-short,
reduced motion, failed-clear truthfulness, duplicate permission suppression,
pending-permission cancellation with late-stream track stop, concurrent-save
de-duplication, 12-page eviction/reload, debug Blob privacy, non-image
rejection, and replay object-URL/source cleanup. It captures screenshots `01`
through `14` in `qa-shots/family-story-interview/`; `14-microphone-requesting`
specifically verifies the visible Opening microphone state.

The refreshed browser suite reports **53/53 passing**. I also inspected the
landscape shelf and denied-microphone captures directly; both are coherent
Watercolor / Storybook screens and the denial flow remains finishable.

## Disposition

Accepted. No feature blockers, major findings, or minor findings remain in
this review. Continue with the existing beta release gate: real-family iPad
playtest and production deployment verification.
