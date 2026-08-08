# Cooking Craze — game design

## Product promise

Cooking Craze is a short, tactile pizza-making game for ages 3–7. A child pats dough, spreads sauce, matches cheerful toppings to pictured slices, and slides the finished pizza into a warm oven. Every mode is completable without reading, time pressure, scores, or failure.

Status: **beta**. The implementation, generated art, recorded voice, hub entry, automated QA, and responsive layouts are complete. A supervised child playtest remains useful release evidence before promotion to `live`.

## Concept and art direction

The source concept is `01-game-concepts/cooking-craze/brief.md` plus its title, Build Your Pizza, and Pizza Perfect mockups. The final art direction follows the user-selected **Kawaii** world: strawberry pink, vanilla cream, coral, warm brown outlines, rounded hand-crafted 3D forms, and smiling food characters.

Primary visual objects are authored raster assets. CSS provides layout, hit areas, responsive rules, and small effects only; it does not draw the kitchen, pizza, dough, toppings, cards, title, mascots, peel, or action plates.

## Modes

| Mode | Child-facing loop | Skill |
|---|---|---|
| Build Your Pizza | four dough pats → sauce coverage → six topping matches → upward peel slide → celebration | four-step sequencing and one-to-one matching |
| Sauce Swirl | four dough pats → sauce coverage → immediate finished-pizza celebration | broad pressing and continuous circular movement |
| Quick Bake | five topping matches on a ready base → upward peel slide → celebration | fast visual matching and controlled slide |

Build uses one of three seeded layouts (`rainbow`, `garden`, or `starry`). Each layout contains the same six recognizable topping kinds in a different slice order: tomato, pepperoni, mushroom, basil, olive, and cheese star.

## Interaction contract

- All primary touch targets are at least 96 px, including effective HUD pseudo-hit areas on narrow screens. At 568×320, toppings move into a two-column vertical rail that can be scrolled without shrinking a control.
- Dough accepts four real taps or pointer presses. Each press squishes the raster dough and emits a small flour effect.
- Sauce uses a round five-by-five coverage grid with the four outer corners excluded. Seventeen of the 21 valid cells satisfies the configured 80% threshold. The child may begin anywhere and move in either direction; the covered cells reveal one continuous authored sauce spiral over a faint goal image. Enter or Space advances coverage in four-cell groups for a keyboard-only path.
- Toppings support both strand-proof drag-to-slot and tap a topping → tap its matching pictured slice. A mismatch leaves state unchanged, wiggles the piece, and says “Try the matching slice!”
- The peel accepts an upward pointer drag. A 56 px travel threshold completes the bake; a tap alternative is retained for motor accessibility.
- `pointercancel`, window blur, screen changes, and Back all dispose active drag/listener/timer state.

## Screen map

```text
QLOBE hub → splash
              ├─ Build Your Pizza → press → sauce → toppings → bake → end
              ├─ Sauce Swirl      → press → sauce → end
              └─ Quick Bake       → toppings → bake → end

splash Home → QLOBE hub
play/end Back → splash
end Make Another → replay current mode
end Serve & Choose → splash
Sound → replay the current instruction or cheer
```

The splash preserves the mockup’s exact `COOKING CRAZE` title and three food mascots. The flagship play screen preserves `Build Your Pizza`, a six-slice pizza, six high-contrast pictured targets, and six matching toppings. The end screen uses an authored `PIZZA PERFECT!` and three-star lockup, the mascot audience, a large finished pizza, and distinct replay-pizza versus serving-cloche action pictograms.

## Feedback and pacing

- A four-star recipe rail communicates the active step without requiring text.
- Presses, matches, and sauce cells produce immediate motion and synthesized tactile SFX.
- The next instruction is spoken after every phase transition.
- An idle nudge begins after 6.5 seconds and repeats every 9 seconds.
- Completion uses a stable hero pizza, an authored three-star reward lockup, the mascot audience, confetti, and a recorded mode-specific cheer.
- There are no penalties, countdowns, lost progress, ads, purchases, or persistent rewards.

## Voice and accessibility

`config.json#voice` is the spoken-text source of truth. All 21 lines have committed teacher-voice M4A clips in `assets/audio/voice-clips/`, with `lines.json` as the exact fallback mirror and `manifest.json` carrying duration, seed, and text hash. Clips were produced with local Qwen3-TTS VoiceClone and checked from the final encoded M4A with Whisper. The three wording corrections made during final QA all received transcript ratio 1.0.

Every visible button has an accessible name. Ingredients expose their selected state and can be chosen with Enter or Space; slice buttons and the peel complete the same loop without a pointer. Instructions are mirrored to the narrator’s polite live region. The game works with reduced motion, landscape, and compact portrait layouts. Sound may be muted without changing the task.

## Runtime architecture

The game is a static ES-module page. It reuses QLOBE’s shared screen router, HUD, narrator, clip player, pointer-safe drag helper, timers, RNG, idle nudger, celebration, preload helper, and debug harness. There are no runtime model calls or game-specific remote asset dependencies.

`window.QLOBE_DEBUG` exposes:

- `ready`, `listModes()`, `startMode(id)`, `home()`;
- `getState()`, `getTargets()`, `tap(id)`, `getAudioLog()`, `clearAudioLog()`;
- `mute(on)`, `seed(n)`, `fastTimers(scale)`;
- `actions.pat()`, `addSauceProgress()`, `pickTopping(kind)`, `dropOn(index)`, `slideBake()`, and `complete()`.

The serialized state reports screen, mode, phase, press count, sauce coverage/cells, placed kinds/slots, recipe id, bake state, and completion.

## Deliberate departures from the early scaffold

- The final world is Kawaii hand-crafted 3D rather than the scaffold’s darker clay prototype.
- The kitchen’s authored central oven is used directly; a second foreground oven sprite would have obscured it.
- The airborne dough toss was reduced to four clear tabletop pats, which is more legible and reliable for ages 3–7.
- Build matches all six mockup toppings instead of naming only two ingredients. Spoken prompts were regenerated to describe the actual task.
- Sauce progress is visible only during spreading; it clears to the clean authored pizza before matching so the pictured slots remain readable.

## Acceptance evidence

Run from the repository root while the local site is served:

```sh
node games/cooking-craze/tools/qa.mjs --base http://127.0.0.1:8000
node tools/validate/run.mjs cooking-craze
node tools/pipeline/sync-games-registry.mjs --check --only cooking-craze
```

The Chrome suite covers hub launch; real-pointer pat, sauce, tap-to-match, and peel gestures; end-to-end keyboard-only Build and Quick loops; all three modes; Back navigation; 568×320 scroll reachability and end actions; compact portrait end composition; reduced motion; 96 px targets; valid sauce cells; all 21 packaged clips; real recorded-clip start; screenshots; console/request hygiene; and blocked local analytics during QA.
