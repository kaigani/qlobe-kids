# Bead Path Builder — production game design

**Replaces:** `games/bead-path-builder/` (the `build-assemble` engine prototype with emoji/swatch placeholders)

**Concept source:** `01-game-concepts/bead-path-builder/` (brief, 4:3 mockups, and concept video)

**Category / age:** writing-fine-motor · 5–6

**Status target:** live

**Art direction:** **Toy** (legacy pipeline style id: `toy-table`)
**Core capability:** strand-safe curved-path drag with tap-to-place fallback, reusable authored bead sprites, and optional short-form video modeling/reward.

## Product promise

Open a warm wooden bead atelier, choose a tiny pattern, and string chunky painted beads onto a real cord one at a time. Each bead passes over the cord tip, slides home with a satisfying wooden click, and grows a necklace the child can proudly put on a friendly toy fox.

The game is deliberately narrower than Pattern Bracelet Studio. It does not turn beads into music or ask the child to operate a sequencer. Its one promise is the tactile rhythm of **pick → thread → slide → admire**, with AB/ABC pattern practice as a quiet support for left-to-right fine-motor control.

## Learning promise

- **AB Garden:** continue a two-part repeating pattern while placing left to right.
- **ABC Rainbow:** continue a three-part repeating pattern while placing left to right.
- **My Necklace:** plan and place a self-chosen sequence, then decide when it is finished.

Each guided round lasts roughly 25–50 seconds. There is no timer, score, loss state, or locked content.

## Screen map

```text
catalog → pattern shelf → threading board → necklace complete → magic mirror
             ↑                 |                 |                 |
             └──── back ───────┘                 └──── again ─────┘
             └──────────────────── back / choose pattern ──────────┘

pattern shelf home → catalog
all other screens back → pattern shelf
```

### 1. Pattern shelf (splash)

- Full-bleed top-down Toy atelier: honey beech worktable, cream linen mat, bead cups and cord at the edges, calm center.
- Generated graphic title lockup reading exactly **“Bead Path Builder”**.
- Three ≥160px wooden mode cards: AB, ABC, and a picture-only free necklace card. The cards contain real bead sprites and cord previews; labels are large HTML for adults but the pictures and narration carry meaning.
- One tap chooses a card and starts immediately. There is no separate Start confirmation: the large concept Start button is folded into the card press so the first child action has an immediate result.
- Home is the only catalog link. Sound replays the welcome or current card description.

### 2. Threading board

- Back and sound in the shared HUD corners; a small three-dot round-progress strip sits between safe areas.
- Authored wood-and-linen board fills the stage. A cream braided cord is baked into the board art and leaves an obvious free tip at the right.
- Six large bead positions follow one shallow tactile curve. Already-modeled beads are solid. Empty positions are soft translucent guides. Only the next position glows.
- The bottom wooden tray offers three authored bead choices in guided play and all six in free play.
- A picture prompt above the board repeats the seed pattern. Spoken guidance names it; reading is never required.
- First guided round offers an unobtrusive film-reel hint button. After two idle nudges, the same button pulses; the video never auto-opens over play.

### 3. Necklace complete

- The authored cord remains visible behind the finished beads, which stay exactly as the child made them.
- Sparkles travel across the necklace once; a three-layer celebration lands with click, shimmer, and chime.
- A large authored wooden **Wear It** button uses a tiny toy-fox necklace emblem. The exact HTML label is supplementary.
- Secondary actions: make another with the same mode, or back to pattern shelf.

### 4. Magic mirror (video reward)

- The Wear It press opens a framed “magic mirror” with a poster immediately visible and the local H.264 video playing from the gesture.
- A friendly carved wooden fox wears the canonical six-bead companion necklace,
  touches it, sways, and says, “Look what you made. It fits perfectly!” The
  completed board remains the exact record of the child’s own sequence.
- The video is a reward for the child’s action, not a passive interstitial. Replay and “make another” targets remain available throughout.
- If video cannot decode, reduced motion is requested, or data saving disables it, the poster remains and the same recorded teacher line plays outside the clip.

## Modes and content

### AB Garden

**Skill:** continue a two-part pattern and place each bead in sequence.

Three seeded round families, each six positions:

1. red round / yellow barrel (first two modeled)
2. blue diamond / coral heart (first two modeled)
3. teal flower / purple star (first two modeled)

The child adds four beads. Choice order is shuffled with a seeded RNG, never the pattern order.

### ABC Rainbow

**Skill:** continue a three-part pattern and hold a three-item sequence in working memory.

Three seeded round families, each six positions:

1. red round / yellow barrel / blue diamond (first three modeled)
2. coral heart / teal flower / purple star (first three modeled)
3. blue diamond / red round / teal flower (first three modeled)

The child adds three beads. Color and silhouette both carry the pattern so success is not hue-only.

### My Necklace

**Skill:** plan, revise, and complete a self-chosen left-to-right sequence.

- Six empty positions; all six bead types stay available. On compact portrait
  phones, two three-bead tray pages preserve 96px targets; one large picture
  control switches pages without locking or hiding progress.
- Any bead is accepted. Tap a placed bead before completion to return that bead and everything to its right to the tray, keeping the sequence physically plausible.
- Finish becomes available after four beads. Empty tail positions disappear when the child finishes.
- Completion and the Magic Mirror work with the exact chosen sequence in the static necklace. The video shows the canonical six-color necklace because generated video cannot safely reproduce arbitrary runtime state; this departure is disclosed in the reward as a “fox’s necklace,” not claimed as a pixel-identical replay.

## Interaction model

### Pick, drag, and tap

- Pointer Events, one active drag, pointer capture/window-level completion, blur and visibility cancellation.
- Use `shared/js/stage/drag-to-slot-dom.js` for hit testing, slop, cleanup, and `pointercancel` semantics.
- Drag a tray bead to the one glowing target. A correct bead follows a short two-part transform: it moves to the free cord tip, then slides along the cord into its destination.
- Tap fallback: tap a bead to select it, then tap the glowing slot; tapping the already-selected bead again also places it for children who discover only one-step tapping.
- Hit padding is at least 40px around the visual slot; every actionable target is ≥96px.
- Off-board releases simply return the bead to the tray. No speech is necessary for a motor miss.

### Guided mismatch

- A wrong pattern bead gives a soft wooden wobble, low “bup” sound, and returns home.
- First mismatch uses the full recorded pattern cue where that exact seed has one; every other seed names the expected silhouette. Visual pulses reinforce the same object.
- Repeated mismatch temporarily enlarges the correct tray bead and moves its glow to the front; no red X, buzzer, lost progress, or spoken “wrong.”

### Idle model

- 8 seconds: the target ring breathes and the expected tray bead rocks once.
- 16 seconds: voice models the current pattern.
- 26 seconds: the film-reel hint button pulses. Opening it plays the 4–5 second MiniMax H3 threading demonstration, then returns focus to the still-active target.

### Feedback choreography

1. Pickup: small scale lift + synthesized wood tick.
2. Correct drop: cord-tip hop → slide → click, then the placed bead gives one squash-and-settle.
3. Progress: one wooden progress pip fills; next slot glows.
4. Round finish: cord curl, three moving sparkles, chime, recorded praise, confetti burst.

Under `prefers-reduced-motion`, beads cross-fade into place, no board parallax/curl or confetti runs, the tutorial remains poster-only, and audio/clear state change preserve all feedback.

## Voice script — verbatim production source

All lines use one warm, non-identifying preschool-teacher voice created from a text description with Qwen Voice Design. Recorded clips are primary; Web Speech is the fallback. Every generated clip must pass Whisper transcription comparison before it is accepted. The initially planned clone of the locally configured teacher reference was not used because the execution environment requires separate risk-specific consent before uploading potentially identifying voice data.

| Key | Spoken line |
|---|---|
| `welcome` | “Welcome to the bead atelier. Pick a necklace to make!” |
| `mode-ab` | “Make a two-bead pattern: one, two, one, two.” |
| `mode-abc` | “Make a three-bead pattern: one, two, three, then repeat.” |
| `mode-free` | “Make your very own necklace. Any beads you like!” |
| `intro-ab` | “Follow the two-bead pattern. Thread the glowing spot next.” |
| `intro-abc` | “Follow the three-bead pattern. Thread the glowing spot next.” |
| `intro-free` | “Choose any bead. Start at the left and make it yours.” |
| `drag-cue` | “Through the hole, then slide it home!” |
| `off-target` | “Bring the bead to the glowing spot.” |
| `pattern-round` | “Round, barrel, round, barrel. Find the round bead.” |
| `pattern-barrel` | “Round, barrel, round, barrel. Find the barrel bead.” |
| `pattern-three` | “Round, barrel, diamond. What comes next?” |
| `find-round` | “Find the round bead.” |
| `find-barrel` | “Find the barrel bead.” |
| `find-diamond` | “Find the diamond bead.” |
| `find-flower` | “Find the flower bead.” |
| `find-star` | “Find the star bead.” |
| `find-heart` | “Find the heart bead.” |
| `cheer-ab` | “You followed the pattern. What a beautiful necklace!” |
| `cheer-abc` | “Three beads, then repeat. You did it!” |
| `cheer-free` | “Your necklace is one of a kind!” |
| `wear-prompt` | “Tap the fox to see the necklace!” |
| `wear-cheer` | “Look what you made. It fits perfectly!” |
| `again` | “Shall we make another?” |

The two video lines are `drag-cue` and `wear-cheer`. Final encoded clips are transcribed again because model-conditioned video may change, echo, or clip the supplied audio.

## Art list

Every child-facing physical object uses authored raster art. CSS/DOM owns layout, masks, glow, focus, hit areas, and animation only.

| Runtime asset | Target | Visible renderer / production direction |
|---|---:|---|
| `assets/atelier.webp` | 1448×1086, ≤300KB | Full-bleed 4:3 honey-beech Toy atelier, cream linen center, bead cups and tools at edges, empty center; generated with gpt-image-2 from concept mockup style reference. |
| `assets/workboard.webp` | 1448×1086, ≤300KB | Top-down rounded beech threading board with cream linen, authored cream cord and lower bead tray, no beads/text/UI; gpt-image-2. |
| `assets/title.webp` | 1000×412, ≤150KB | Exact “Bead Path Builder” carved/painted wooden title lockup, alpha cutout; gpt-image-2 guided by the concept title. |
| `assets/ui/mode-card.webp` | 480×625, ≤90KB | One blank recessed beech selection tile, alpha cutout; gpt-image-2. |
| `assets/beads/*.webp` | 384×384, ≤70KB each | Six consistent painted wooden beads: red round, yellow barrel, blue diamond, teal flower, purple star, coral heart; generated as a gpt-image-2 contact sheet, deterministically matted from its uniform key, then normalized. A Qwen Image Layered pilot timed out and was rejected rather than replacing the clean deterministic edges. |
| `assets/ui/wear-button.webp` | 640×210, ≤100KB | Blank wide wooden CTA with tiny fox portrait/necklace emblem and no baked words; authored raster. |
| `assets/video/threading-tip-poster.webp` | 832×480, ≤100KB | First frame: close-up red bead, cream cord tip, linen, Toy world. |
| `assets/video/threading-tip.mp4` | 832×480, 4–5s, ≤1.5MB | MiniMax H3: cord visibly passes through the bead hole and bead slides left; static camera; `drag-cue` voiceover. |
| `assets/video/fox-necklace-poster.webp` | 832×480, ≤100KB | Friendly carved wooden fox in the atelier wearing a six-bead necklace. |
| `assets/video/fox-necklace.mp4` | 832×480, 4–5s, ≤1.5MB | MiniMax H3: fox touches necklace, sways, and speaks `wear-cheer`; static camera, no cut. |
| `assets/audio/*.m4a` | 96kbps AAC | Qwen3 Voice Design production for every line above, each Whisper QA’d. |
| `assets/og-image.jpg` | 1200×630 | Production screenshot of the finished splash, regenerated through the repo pipeline. |

Opaque sources use JPEG/WebP; sprites use alpha WebP. Nondeterministic originals live under `assets/source/` with prompts/recipes. Final alpha assets are checked over saturated magenta and black.

## Video design and fallbacks

MiniMax H3 is used only where motion communicates more than a pose:

1. **Threading tip:** the cord passing through a bead hole is a physical action that a still arrow does not model. It is child-requested or a late idle offer, never a blocking intro.
2. **Magic mirror:** the concept’s “Wear It” promise becomes a responsive reward—press, then see a toy friend bring the necklace to life.

Both clips are produced through the LAN wrapper, normalized to H.264/yuv420p/`+faststart`, poster-backed, muted only when the game is muted, and loaded on demand. H3 altered the conditioned narration in its raw tutorial output, so the accepted clean Qwen master was remuxed over each final animation; both final tracks then scored 1.0 against the intended text in Whisper. Core gameplay never waits for video. Reduced motion keeps the poster and external teacher audio. Each final file is checked with `ffprobe`, decoded independently, viewed at full size, and its audio transcribed through `whisper-stt`.

## Audio and music

- Recorded teacher voice via `shared/js/voice-clips.js`; one reusable audio element and Web Speech fallback.
- Tactile synth SFX via `shared/js/sfx.js`; a small local WebAudio marimba/wood-click layer may vary pitch by bead silhouette but does not turn the game into a music activity.
- No continuous background music: the warm workshop should stay calm and voice intelligibility matters more than the brief’s suggested harp bed.
- Mute gates voice, SFX, and video audio together; sound replays the current instruction after debounce.

## Responsive and accessible behavior

- Landscape 4:3 is the art target; extra-wide layouts letterbox the board inside atelier edges rather than stretch it.
- Portrait stacks prompt, board, and tray while preserving ≥96px bead targets; compact phones page the six free-play choices three at a time, and the full background may crop at its sides.
- Safe-area variables protect every HUD button. No functional control sits in generated art.
- Beads differ by silhouette, highlight notch, and color. Pattern narration names shapes, not colors alone.
- Keyboard and assistive-tech path: real buttons, concise labels, visible focus ring, `aria-live` for prompts, tap-to-place works with Enter/Space.
- All runtime text remains HTML. Decorative generated title text has an accessible name and is visually spell-checked.

## Persistence and privacy

- Store only the last selected mode and a small count of completed necklaces in localStorage under `qlo.be/bead-path-builder/v1`. Reloading returns to the shelf and marks that mode as “last played” for assistive technology; it never auto-enters play.
- No child name, photo, microphone, account, upload, or analytics beyond the shared pageview tag.
- Generated video and audio are authoring-time local assets committed with the game; runtime makes no model or network request.

## Shared modules

- `voice-clips.js`, `sfx.js`, `audio-unlock.js`, `tap.js`, `narrator.js`
- `hud.js`, `screens.js`, `celebrate.js`, `idle-nudge.js`
- `stage/drag-to-slot-dom.js`
- `debug-harness.js`, `timers.js`, `rng.js`, `preload.js`
- `base.css`, `hud.css`, `screens.css`, shared HUD bitmaps and Fredoka font

The generic `build-assemble` engine is intentionally retired for this route. Its straight generic part→slot abstraction cannot model cord-tip threading, free-sequence revision, on-demand video hints, or the Magic Mirror reward without turning the engine into game-specific code.

## Explicit departures

- **Prototype:** replace emoji/swatches, two generic modes, Web Speech-only prompts, and engine splash/end screens with authored Toy raster art, three concept modes, recorded voice, a physical slide-on-cord animation, and Wear It reward.
- **Mockup Start button:** mode cards start immediately, reducing a redundant tap. Selection feedback still appears during the press.
- **Mockup settings gear:** shared sound control replaces it; a one-game settings panel would add reading and no meaningful choice.
- **Brief age 2–5:** platform registration remains 5–6, the repository’s supported audience. Targets and cues remain accessible to younger supervised players.
- **Brief looping harp/piano:** omitted to protect calm and spoken cue clarity.
- **Unlockable beads:** all six bead types are available immediately; no progression gate or extrinsic grind.
- **Exact arbitrary necklace in video:** static completion preserves the child’s sequence; generated fox video uses the canonical six-bead necklace and is framed as the fox admiring its companion necklace.
- **Teacher voice clone:** replaced with non-identifying Qwen Voice Design because uploading a potentially identifying reference voice requires separate risk-specific consent in this execution environment.
- **Concept video’s candy road:** motion reference only. The production world follows the authoritative Toy mockups: wood, linen, painted bead objects, and restrained shadows.

## `QLOBE_DEBUG` v1 surface

- Standard: `version`, `ready`, `state()`, `targets()`, `tap(id)`, `mute(on)`, `seed(n)`, `fastTimers(on)`.
- Game helpers: `startMode('ab'|'abc'|'free')`, `placeExpected()`, `placeBead(id)`, `finishFree()`, `completeRound()`, `showScreen(name)`, `playVideo(id, { posterOnly })`, `setRound(index)`.
- State includes screen, mode, round, sequence, placed bead ids, expected bead id, drag state, muted, video state, and audio log.

## Release gates

- Every mockup promise is represented: AB/ABC/FREE, large drag choices, left-to-right target, exact ABCABC demo, six-of-six completion, sparkle/chime, and Wear It destination.
- A new child can act within five seconds using pictures/voice alone.
- Every primary object is an authored raster Toy asset; no emoji, swatch, CSS-drawn bead, cord, tray, card, or reward remains.
- All voice clips pass Whisper; both final videos pass visual, decode, file-budget, and transcription review.
- All guided rounds, free revision, compact-phone tray paging, incorrect bead, off-target drop, tap fallback, idle hint, video fallback, selection persistence/reload, navigation loop, mute, reduced motion, landscape, and portrait are exercised in production Chrome with zero console errors or 404s.
- Registry manifests validate, status is `live`, the hub tile remains the user-curated asset, and the final splash screenshot replaces `og-image.jpg`.
- An independent adversarial art-direction review passes foreground material fidelity, hierarchy, legibility, edge quality, responsive crops, and delight—not only functional QA.

Final evidence: 137/137 production-Chrome assertions pass, including 375×667
compact Free and guided states; the independent art director returned ACCEPT
after the compact tray blocker was corrected.
