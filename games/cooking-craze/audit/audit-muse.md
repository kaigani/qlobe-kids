# Cooking Craze — Audit (muse-spark-1.2-contributor)

> Scope: `qlobe-kids/games/cooking-craze/` · read-only end-to-end audit · 2026-08-08
> Model: muse-spark-1.2-contributor · not asked to apply fixes
> Method: static read of `js/main.js:1-333`, `index.html:1-67`, `config.json:1-65`, `css/style.css:1-865`, `tools/qa.mjs:1-198`, plus `shared/js/{tap,screens,timers,stage/drag-to-slot-dom,hud,voice-clips,narrator,audio-unlock,debug-harness,sfx,idle-nudge,celebrate,speech}.js` and `shared/css/{base,hud}.css`; ran `tools/validate/run.mjs` and `tools/pipeline/sync-games-registry.mjs --check --only cooking-craze` and asset/voice manifest checks.

---

## 1. Input / Event Flow Map

Game mounts `js/main.js:19-60` with `createTimers()` `js/main.js:41`, `createNarrator()` `js/main.js:42`, single `state` `js/main.js:37-40`, singleton `dragCtl` and `stageDisposers[]`+`bakePointer` `js/main.js:44-46`, delegated to `createScreens()` `js/main.js:302`.

| Entry | DOM `data-target` | Listener chain | Handler → next state |
|---|---|---|---|
| **Splash cards** | `mode-build` / `mode-swirl` / `mode-quick` | `renderSplash() js/main.js:87-106` `onTap(card)→startMode(id)` via `screens.start()` latch `shared/js/screens.js:265-273` | `startMode() js/main.js:294-299`: `disposeStage()` → `resetState(mode)` → `screens.show('play')` → `renderStage()` → `say(intro)` → `nudger.arm()` |
| **Pat dough** | `dough` | `makePizza({dough:true}) js/main.js:125-131` → `onTap(dough)→patDough()` `js/main.js:263` | `patDough() js/main.js:137-144` counts to `config.thresholds.pressTaps:4`, `sfx.pop()`, flour puff `timers.after(560)` → `setPhase('sauce')` |
| **Sauce** | `sauce-surface` (button, `tabIndex=0`) | `wireSauce() js/main.js:176-185`: `pointerdown+setPointerCapture` → `window pointermove/up/cancel` + `blur` + `keydown(Enter/Space/Spacebar)` | `sauceCellAt() js/main.js:145-150` circle(0.49)+5×5 grid minus 4 corners = 21 cells `js/main.js:33-36`; `addSauceProgress() js/main.js:151-160` → `renderSauceProgress() js/main.js:169-175` conic mask `--sauce-progress`; `size/21≥0.8` (17) → `finishSwirl() js/main.js:186-193` (swirl) or `setPhase('toppings')` |
| **Toppings (drag)** | `ingredient-{kind}` → `slot-{i}` / `slice-{i}` | `wireToppings() js/main.js:219-230` `createDragToSlotDom{slotSelector:'.pizza-slot:not(.is-filled)', slotPad:28, ghostClass:'ingredient-drag-ghost', preventDefaultOnPress:true}` `js/main.js:220` + per-piece `click(detail===0)` + `tray:pointerdown→dragCtl.begin()` | `onLift→pickTopping` `js/main.js:203-208` toggles `selected/aria-pressed` `sfx.tick()`; `onDrop→placeTopping` else `nudgePiece()` `js/main.js:209`; tap w/o move → `onTap→pickTopping` |
| **Toppings (tap)** | selected `ingredient-*` + `slice-{i}` | `pickTopping()` + `dropOn(i)→placeTopping(kind,i)` `js/main.js:218` | `placeTopping() js/main.js:210-217` validates `slot.dataset.kind===kind`, marks `is-filled`, appends ghost-art, `placed[]`; `placed.length≥toppingCount()` (`6` build / `5` quick `js/main.js:54`) → `setPhase('bake')` |
| **Bake peel** | `peel` + `oven` | `wireBake() js/main.js:236-254`: `peel:pointerdown+setPointerCapture` → `window pointermove(¬passive)/up/cancel/blur` + `onTap(peel)→beginBake()` | move clamps `dx±60 dy 0-260`, `transform translate`; `up`: `travelled≥56px` **or** `nearOven (clientY≤bottom+min(100,h/2))` `js/main.js:248-250` → `beginBake() js/main.js:231-235` `is-baking` + `timers.after(950)→completePizza()` |
| **HUD** | `back` `sound` | `hudButton()` `shared/js/hud.js:42-62` via `tap.js:21` + `soundDebounce(600)` `js/main.js:310-315` | `goSplash()` / `say(currentPromptKey())` |
| **End** | `again` `serve` | `onTap` `js/main.js:316-317` | `startMode(mode)` re-enters `play` / `goSplash()` |
| **Global** | `window` | `installUnlockOnGesture({extra:[sfx.unlock,voiceClips.unlock], onFirst:say('welcome')}) js/main.js:306` + `installKioskGuards()` `js/main.js:305` | fan-out + `visibilitychange/pageshow` re-latch `shared/js/audio-unlock.js:94-116`, `contextmenu/gesturestart` block |
| **Idle** | — | `createNudger({first:6500,repeat:9000}) js/main.js:303` `window:pointerdown→poke()` `shared/js/idle-nudge.js:68-93` | speaks `hint-press/hint-swirl/nudge/hint-oven` `js/main.js:303` |

All primary mutators gate on `active() = screens.is('play') && !completed` `js/main.js:52`: `setPhase:71`, `patDough:138`, `addSauceProgress:152`, `pick/place:204,211`, `beginBake:232`, `finishSwirl:187`, `completePizza:256`.

## 2. State Transitions

`state js/main.js:37-40` — `screen{splash,play,end}` `mode{build,swirl,quick}` `phase{menu,press,sauce,toppings,bake,complete}` `step==phase` (except `complete`) + `presses sauceCells:Set placed[] slots[] recipe selectedKind baking completed`.

```
splash
 ├─startMode('build')→ play:press --4 pat→ sauce --≥17/21→ toppings --6 matched→ bake --slide/tap→ end
 ├─startMode('swirl')→ play:press ---------> sauce --≥17/21→ bake(=complete sparkle) --after 850→ end
 └─startMode('quick')→ play:toppings ----------------------------------5 matched→ bake --slide/tap→ end

play/end Back → splash (goSplash() js/main.js:300)
end Make Another → startMode(currentMode)   end Serve & Choose → splash
```

`STEPS=['press','sauce','toppings','bake'] js/main.js:30` drives `renderProgress() js/main.js:76-82`. `resetState() js/main.js:61-69` picks `recipe` seeded `mulberry32(42) js/main.js:43` from `config.recipes{rainbow,garden,starry}`; `toppingCount() js/main.js:54` 5 vs 6 slices `POSITIONS js/main.js:31`. `renderStage() js/main.js:259-288` disposes then branches per `phase`.

## 3. Available Checks — Evidence Run Read-Only

| Check | Command | Result |
|---|---|---|
| Game validation | `node tools/validate/run.mjs cooking-craze` | `1 subject(s) · 0 error(s) · 0 warning(s)` — pass (observed in-situ) |
| Registry mirroring | `node tools/pipeline/sync-games-registry.mjs --check --only cooking-craze` | `games.json agrees with every game.json on title, status, category, age, accent, modes` — pass |
| Voice/assets integrity | manifest vs `config.voice` (21 keys), `lines.json==voice`, all `config.assets` paths exist | 21/21, hashes present, no missing `webp/m4a` (manual `ls` audit) — pass |
| Concent QA suite | `games/cooking-craze/tools/qa.mjs:101-196` (17 named checks + per-viewport `audit()`) | Not re-executed here (requires `launchChrome`); suite documents real-pointer pat/sauce/topping/peel, keyboard-only Build+Quick, 568×320 scroll rail, portrait reduced-motion, 96px audit, 21-clip decode, recorded-clip start — previous run green per `game-design.md:89-96` |
| Static paths | lowercase relative `../../shared/...` `./assets/...` | pass |

## 4. Edge-Case Inspection — Touch / Pointer / Keyboard / Timers / Teardown

### Touch & Pointer
- **Sauce** `wireSauce js/main.js:176-185` primary-only, `setPointerCapture`, window-level `move/up/cancel`, `blur` reset, `passive:true` on move (no preventDefault needed). Circle+grid filter correct.
- **Toppings** delegated to `createDragToSlotDom js/main.js:220` — window listeners, `isPrimary===false` reject, slop 10 `shared/js/stage/drag-to-slot-dom.js:95`, `pointercancel→cancel()` (not a drop) `shared/js/stage/drag-to-slot-dom.js:487`, `blur/visibilitychange/pagehide→cancel()` `shared/js/stage/drag-to-slot-dom.js:336-340`, idempotent `detach()` `shared/js/stage/drag-to-slot-dom.js:351-368`, ghost `pointer-events:none` + stray sweep. Strand-proof per `game-design.md:30`.
- **Peel** `wireBake js/main.js:236-254` window `move` with `passive:false` + `preventDefault` to suppress scroll, `dx±60 dy 0-260` clamp, `pointercancel/blur→reset`. Retained tap alternative `onTap(peel)→beginBake()` for motor accessibility `js/main.js:253`.
- **Buttons** all via `onTap() shared/js/tap.js:21-57` — `pointerup` over element is the action, `click` only for keyboard/AT, `pointercancel` cancels, `suppressClickUntil 700ms` prevents double-fire.

### Keyboard
- Dough: `button[type=button] aria-label` `js/main.js:129` reachable; `onTap` handles `click` from Enter/Space.
- Sauce: `div.sauce-surface tabIndex=0 role=button aria-label` `js/main.js:267` `keydown` Enter/`' '`/`'Spacebar'` `js/main.js:182` advances 4 cells `addNextSauceCells() js/main.js:161`.
- Ingredients: `button.ingredient aria-pressed` `js/main.js:278` `click(detail===0)` `js/main.js:224-226` handles keyboard activation; `pickTopping()` toggles `selected`.
- Slots: `button.pizza-slot aria-label "Pizza slice N"` `js/main.js:197` `onTap→dropOn()`.
- Peel: `button.peel-control aria-label` `js/main.js:282` `onTap→beginBake()`.
- QA proves full Build+Quick keyboard loops `tools/qa.mjs:129-150` (focus + Enter/Space interleaved, sauce via 30 Space/Enter).

### Timers
- Single group `createTimers() js/main.js:41` `shared/js/timers.js:29`; `disposeStage() js/main.js:56` does `dragCtl.cancel/detach` + `stageDisposers.forEach(try)` + `bakePointer=null` + `timers.clearAll()`. Clears `finishSwirl after 850` `js/main.js:191` and `beginBake after 950` `js/main.js:234` on any teardown/navigation, preventing post-exit `completePizza()`.
- Flour puff `timers.after(560 puff.remove) js/main.js:135` is intentionally cleared on phase change — board `replaceChildren() js/main.js:260` discards orphan puff (see E4).
- `fastTimers()` wired via `installDebug({timers}) js/main.js:320` → `debug-harness.js:137-143`.

### Scene Teardown
- `renderStage() js/main.js:259` always leads with `disposeStage()`; `startMode() js/main.js:296`, `goSplash() js/main.js:300`, `completePizza() js/main.js:257` all call it before `screens.show()`. `screens.js:199-212` `show()` also runs previous screen bag (unused here — teardown owned by `stageDisposers`); `screens.start()` `shared/js/screens.js:265` prevents re-entrancy.
- `nudger.stop() js/main.js:257,300` removes `pointerdown` listener `shared/js/idle-nudge.js:96-104`.

## 5. Findings

Severity: **Critical** = ship-blocker · **High** = must-fix before live · **Medium** = user-visible friction · **Low** = hardening · **Info** = note.

| # | Severity | Area | Finding | Evidence |
|---|---|---|---|---|
| **F1** | **Medium** | Touch · tray scroll | Drag on an ingredient blocks native rail scroll on short-landscape. `createDragToSlotDom({preventDefaultOnPress:true}) js/main.js:220` → `drag-to-slot-dom.js:523` `event.preventDefault()` on `pointerdown` of any ingredient. At `568×320` `css/style.css:814-837` tray is `overflow-y:auto; touch-action:pan-y` 2×96px rail. Pressing the ingredient itself therefore never pans; pan only on the 4px gaps/tray chrome. QA proves rail is programmatically scrollable `tools/qa.mjs:155-158` (`scrollIntoViewIfNeeded`) but real finger-scroll by dragging an ingredient starts a drag (slop 10) not a scroll. | `js/main.js:220,229` `shared/js/stage/drag-to-slot-dom.js:259-523` `css/style.css:833-836` `tools/qa.mjs:158` |
| **F2** | Low | Pointer | Sauce capture never released. `wireSauce` `pointerdown` `setPointerCapture` `js/main.js:178` but `end/blur` only nulls `pointerId`; no `releasePointerCapture`. If `disposeStage()` runs mid-stroke (phase→toppings via keyboard, Back), implicit capture persists until next `pointerup`. Window listeners are removed so no leak to toppings, but next gesture on some Android can be retargeted. | `js/main.js:178-184` |
| **F3** | Low | Pointer | Peel omits `visibilitychange/pagehide`. `wireBake` handles `pointercancel+blur→reset` `js/main.js:252` but not `visibilitychange` (toppings helper does `shared/js/stage/drag-to-slot-dom.js:339`). App-switch without `blur` leaves `peel.style.transform` translated until next interaction; `disposeStage js/main.js:59` nulls `bakePointer` but not the inline transform (element discarded only on next `renderStage`). | `js/main.js:236-254` vs `shared/js/stage/drag-to-slot-dom.js:339` |
| **F4** | Info | Timers | Flour puff cleanup races teardown. `addFlourPuff timers.after(560) js/main.js:135` is cleared by `disposeStage timers.clearAll() js/main.js:59` on any phase exit, leaving puff `span` until `els.board.replaceChildren() js/main.js:260` discards it. Harmless in normal flow; only observable via `debug.actions.pat()` outside board lifecycle. | `js/main.js:59,133-135,260` |
| **F5** | Info | Geometry | Sauce rim 1% dead zone. `sauceCellAt hypot>0.49 js/main.js:147` rejects the outermost ~5px annulus that still maps to a valid cell, requiring child to stay slightly inside the pizza edge. Negligible given 96px target and `passive:true` sweep. | `js/main.js:146-149` |
| **F6** | Low | Bake heuristic | `nearOven` only checks Y `js/main.js:249` `clientY ≤ bottom+min(100,h/2)`. With `dx±60` clamp `js/main.js:241` X error is bounded, so Y-only is intentional leniency; a vertical-only lift far-left still bakes, but never user-visible failure. | `js/main.js:241,248-250` |
| **F7** | Low | Idle | Nudge can fire mid-sauce sweep. `createNudger:6500/9000 js/main.js:303` resets only on `pointerdown shared/js/idle-nudge.js:68-93`; a continuous `pointermove`-only sweep >6.5s can emit `hint-swirl` over the gesture. `idle-nudge` defers when `document.hidden` but not when drag is active. Benign (gentle hint) but overlaps SFX. | `js/main.js:303` `shared/js/idle-nudge.js:46-68` |
| **F8** | Info | Accessibility | No extra finding to correct: sauce surface labelled, ingredients `aria-pressed`, slots labelled `Pizza slice N`, peel labelled, dough labelled; keyboard paths fully covered `tools/qa.mjs:129-150`. | — |

**Not findings (pass):** `pointercancel` as cancel-not-drop, `isPrimary===false` filtering, `screens.start()` latch + `onTap` `suppressClickUntil` double-tap guard, `active()`+`completed` gates, `stageDisposers`+`timers.clearAll`+`dragCtl.cancel/detach` on every exit, recorded-clip 21/21 decode, 96px targets (`largeTarget() js/main.js:86` + `hud.css:52` pseudo `max(96px,100%)`), `prefers-reduced-motion` `css/style.css:856`, home-only-on-splash `index.html:40` audit in `shared/js/screens.js:135-145`.

## 6. Verdict

**Beta → Live ready** after acknowledging F1. No critical/high ship-blockers. Validate + registry green. If keeping `preventDefaultOnPress:true` for strand-proof drag, accept F1 as documented tradeoff (scroll via gap/background) or change to `preventDefaultOnPress:false` and let `touch-action:none` only after slop — re-verify `tools/qa.mjs:155-158` rail scroll and drag-to-slot on real iPad.
