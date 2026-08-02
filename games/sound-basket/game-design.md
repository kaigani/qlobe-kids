# Sound Basket — production game design

## Promise and learning goal

Sound Basket turns first-sound isolation into a physical-feeling toy action: hear a picture word, notice its opening sound, and tuck matching pictures into a woven basket. The child never needs to read instructions. Each mode practices one skill:

- **Two Sounds:** distinguish two randomly selected initial sounds from the full A–Z library.
- **Three Sounds:** hold three randomly selected initial sounds in mind, one target per round.

## Screen map

1. **Splash:** generated graphic title, basket tableau, catalog Home, replay-audio button, one large default Play button, and two image-led difficulty choices.
2. **Play:** Back returns to the splash. A cream ribbon and oversized letter card show the current target. The teacher voice models the sound. Four ≥96 px picture cards sit on the lower shelf.
3. **Round celebration:** three stars, the filled basket, target letter, and one large Next/Finish control. Back returns to the splash.
4. **End:** a final full-basket tableau and Play Again. Back returns to the splash.

Navigation follows the platform contract: only splash Home leaves for the catalog; all deeper Back buttons return in-page to the splash.

## Core loop (35–70 seconds)

1. The game speaks the mode intro on the first round, then the target letter sound.
2. Four picture cards appear: exactly two begin with the target sound and two are distractors.
3. Tap a card to hear its name without sorting it. A shared word clip plays when available; the platform speech fallback covers the expanded alphabet set.
4. Drag the picture itself into the basket to sort it. A match settles visibly among the basket contents with pop, glow, and star particles. A distractor returns gently, remains available, and gets a recorded warm nudge.
5. Two matches fill the basket. A short celebration closes the round.
6. Three rounds complete the mode. Every new game draws a fresh two- or three-letter set from all 26 letters, then reshuffles target order and picture choice.

The drag path uses a single-pointer lock, window-level move/up/cancel listeners, blur cancellation, and a return animation for off-basket drops. Tap is intentionally pronunciation-only; sorting happens only after a real basket drop.

## Spoken script

All fixed lines ship as Qwen teacher-voice-clone clips with Web Speech fallback. Letter sounds use the shared recorded library. Every picture object has packaged teacher-voice coverage: 9 shared direct names, 68 game-local direct names, and one accepted shared pairing line for “ice cream” after direct one-word candidates failed pronunciation QA.

| Key | Exact line |
|---|---|
| `welcome` | “Come fill a sound basket! Listen for the first sound.” |
| `two-sounds` | “Two sounds. Ready to listen!” |
| `three-sounds` | “Three sounds. Ready for a challenge?” |
| `find` | “Listen. Find the pictures that start with this sound.” |
| `nudge` | “That starts with a different sound. Try another picture.” |
| `round-cheer` | “Great listening! The basket is full.” |
| `final-cheer` | “You filled every sound basket!” |
| `idle` | “Tap a picture to hear its word.” |

## Art direction and asset list

**World:** Toy Table, the reading/phonics category default. The visible field is one coherent material language: glossy rounded toys, cream cards, cyan table rim, honey-gold wicker, navy outlines, and small candy-colored stars.

| Asset | Runtime size / role | Production path |
|---|---|---|
| `assets/art/title.webp` | 1400 px wide splash lockup, ~70 KB | gpt-image-2 → chroma removal → WebP |
| `assets/art/backdrop.webp` | 1344×768 full-bleed field, ~38 KB | QLOBE Studio Krea 2 template → WebP |
| `assets/art/basket.png` | 640 px alpha cutout, main target | Krea 2 render → Qwen Image Layered → crop/QA |
| 78 picture cards | three curated Toy Table object WebPs for every A–Z letter | `shared/assets/objects/` via `shared/js/content.js` |
| live letter cards | responsive CSS toy tiles; no baked-in letter images | game HTML/CSS |
| Home/Back/Sound controls | shared platform PNGs | `shared/assets/ui/` |
| 8 teacher lines | AAC clips + recipes | Qwen voice clone, seed 7, transcript-QA pass |

The first gpt-image-2 scene exploration was rejected: it was 1.7 MB, baked a one-off kitten into the field, and could not support responsive object placement. It is archived under `tmp/sound-basket-rejected/`, outside the shipped game.

## Feedback, accessibility, and fallback

- Correct answers never depend on color alone; object, spoken word, target sound, and motion agree.
- Wrong choices produce no red X, score loss, timer, or game-over state.
- All child controls are at least 96 px in both landscape and portrait.
- HTML labels support assistive technology; gameplay itself remains picture/audio led.
- `prefers-reduced-motion` collapses decorative transitions.
- Missing game voice falls back through `voice-clips.js`; picture naming prefers packaged local/shared audio and reaches Web Speech only after a file-level playback failure.
- No microphone, account, network request, or personal data is used at runtime.

## Departures from the concept and old beta

- The brief’s locked roadmap and points economy are omitted. They distract from a 30–90 second Montessori-style loop and add no phonemic value.
- One target basket is used per round, matching the strongest mockup. “Two” and “Three” describe the sound set complexity, not simultaneous bins.
- The concept’s one-off purple kitten is omitted to preserve the platform cast policy. The basket itself is the guide and reward object.
- The generic `sort-into-bins` beta was replaced with custom code because its equal-size bins could not reproduce the large central basket fantasy, recorded word-first choreography, or scene-led responsive layout.
- Mode tuning lives in `config.json`; randomized A–Z picture sets come from the platform's curated `letter-objects.json` through `shared/js/content.js`.

## Debug and release gate

`window.QLOBE_DEBUG` implements version 1: `ready`, `listModes`, `start`, `getState`, `getLetterPool`, `getTargets`, `tap`, `drop`, `speakWord`, `winRound`, `mute`, `seed`, `fastTimers`, and `home`. QA must verify full packaged audio coverage, the reported Quail/Jellyfish/Queen/Jet combination, the full A–Z pool and session variation, tap-to-speak without sorting, persistent in-basket objects, both modes, one wrong-drop branch, real drag placement, navigation, landscape, portrait, and reduced motion with zero errors/404s. Status remains `beta` until iPad sign-off.
