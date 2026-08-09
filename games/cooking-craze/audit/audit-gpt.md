# Cooking Craze — GPT audit

Date: 2026-08-08

## Summary

The existing game QA suite passed all 56 checks, and the game/registry validators were clean. A focused code review and Chrome interaction probes found five issues that the happy-path suite does not cover. No game files were modified during this audit.

## Findings

### Medium — compact-landscape topping drags conflict with rail scrolling

At 568×320 landscape, the ingredient rail and its children use `touch-action: pan-y` ([style.css:833](../css/style.css:833), [style.css:836](../css/style.css:836)), while the topping drag controller starts from `pointerdown` with `preventDefaultOnPress: true` ([main.js:220](../js/main.js:220)). A Chrome touch probe starting on an ingredient changed the rail from `scrollTop: 0` to `scrollTop: 85` and left the topping unplaced, indicating that vertical-major drags can be claimed by scrolling/cancelled rather than reaching a pizza slice.

Impact: drags toward vertically distant slices are unreliable on compact landscape touch devices. Tap-a-topping then tap-a-slice remains a workaround.

Suggested direction: separate the scroll affordance from the draggable controls, or otherwise make the interaction arbitration explicit so a topping drag cannot be cancelled by the rail’s vertical pan.

### Medium — early play can fall back to synthesized narration

Audio initialization starts asynchronously ([main.js:307](../js/main.js:307)), but mode start speaks immediately ([main.js:297](../js/main.js:297)). The voice player uses synthesized speech whenever the manifest is not loaded yet ([voice-clips.js:180](../../../shared/js/voice-clips.js:180)).

Reproduction: delay `manifest.json` and `lines.json`, then select a mode immediately after the page appears. The focused probe logged both `welcome` and `build-intro` as `kind: "speech"` rather than recorded clips.

Suggested direction: gate or queue the first narration until audio initialization settles, while preserving user-gesture playback behavior on iOS.

Related sequencing issue: the first pointerdown starts `welcome` ([main.js:306](../js/main.js:306)), then the mode’s pointerup immediately starts `<mode>-intro` ([main.js:297](../js/main.js:297)), so the welcome line is likely clipped on the first mode selection.

### Low/Medium — completion renders duplicate confetti layers

`tada()` already creates a confetti burst, but completion calls `burstConfetti()` immediately afterward ([main.js:257](../js/main.js:257); [celebrate.js:245](../../../shared/js/celebrate.js:245)). With reduced motion disabled, a focused Chrome probe found two `.qk-confetti-layer` elements after completion.

Impact: twice the intended confetti density and extra short-lived DOM/timer work. The layers can remain visible briefly after navigating away.

Suggested fix: call only `tada()`, or call `tada({ confetti: false })` when the separate burst is intentional.

### Low — keyboard activity does not reset idle nudges

The game arms the idle nudger but never calls `nudger.poke()` ([main.js:303](../js/main.js:303)). The shared nudger resets only from `window.pointerdown` ([idle-nudge.js:68](../../../shared/js/idle-nudge.js:68)).

Reproduction: start Build with the keyboard, press Space on the dough after three seconds, and continue waiting. The probe logged `hint-press` at the 6.5-second idle deadline despite the recent keyboard action.

Impact: keyboard-only players can receive an idle prompt while actively playing. Long pointer gestures can similarly exceed the deadline after their initial pointerdown.

Suggested direction: poke the nudger from accepted keyboard actions and from meaningful ongoing pointer interaction.

### Low — secondary mouse buttons activate controls

The shared `onTap` helper rejects non-primary pointers but does not reject secondary mouse buttons ([tap.js:27](../../../shared/js/tap.js:27), [tap.js:33](../../../shared/js/tap.js:33)). Cooking Craze wires mode cards, dough, slots, peel, and end controls through this helper ([main.js:103](../js/main.js:103), [main.js:263](../js/main.js:263), [main.js:253](../js/main.js:253)).

Reproduction: right-click a mode card. The focused Chrome probe entered the mode (`screen: "play"`, `mode: "build"`). The global context-menu guard does not prevent the activation.

Suggested fix: ignore non-left mouse buttons in the pointerdown path while retaining the click path for keyboard and assistive technology activation.

## Verified clean areas

- Existing Chrome QA: `56/56 checks passed`.
- `node tools/validate/run.mjs cooking-craze`: 0 errors, 0 warnings.
- Registry check: `games.json` agrees with `game.json`.
- Sauce coordinate mapping and circular hit testing.
- Pointer capture, pointer IDs, pointer cancellation, blur handling, screen transitions, and stage/timer teardown.
- Normal Build, Sauce Swirl, Quick Bake, keyboard, reduced-motion, portrait, and landscape happy paths.
- Packaged narration manifest, line table, referenced files, and Chrome decoding.
