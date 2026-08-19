# Color Gradient Cards — production game design

**Game id:** `color-gradient-cards`
**Status:** beta until a real iPad child playtest
**Audience:** ages 5–6 (the source concept spans ages 2–6)
**Category:** sensorial-science
**Canonical art direction:** Papercraft
**Runtime:** custom static DOM game with no model or gameplay-backend dependency;
the platform's site-wide analytics may load remotely

## 1. Product promise

Color Gradient Cards is a calm, tactile color atelier where a child can see
that one named color contains many related shades. Thick paper tablets snap
into a spectrum rack, two primary colors unfold into a visible bridge of mixed
colors, and familiar papercraft objects invite exact shade matching.

The game strengthens one closely related perceptual skill per mode:

1. **Spectrum Studio:** visual discrimination and light-to-dark seriation.
2. **Color Mixer:** cause-and-effect observation of primary-color blends.
3. **Shade Safari:** exact color matching between an object and a shade card.

The child should understand the active action within five seconds from the
picture arrangement, the spoken prompt, and a short first-round visual model.
No mode has a score, timer, lives, loss state, or forced reading.

## 2. Why the custom path replaces the prototype engine

The existing `sequence-order` stub proves drag/tap ordering, but the production
brief also promises a color mixer and a real-world shade-matching safari. Its
generic splash, generic slots, and generic end screen cannot preserve the
assembled rack for the mockup-specific spectrum reward. The production game
therefore keeps the registered id and route but replaces the engine shell with
a custom DOM implementation using the platform's shared screen, input, audio,
timer, nudge, celebration, and debug modules.

No shared runtime module needs to change. The reusable contribution is a
documented pattern for exact-color raster manipulatives: generated neutral
papercraft source art is deterministically colored and exported as final
sprites so the material stays authored while the educational values stay
exact and testable.

## 3. Screen and navigation map

```text
catalog
  -> splash / three picture-led mode cards
       -> Spectrum family picker -> spectrum play -> spectrum reward
       -> Mixer play -> blend reveal -> next blend -> mode end
       -> Safari play -> match reveal -> next object -> mode end
  <- play/end Back returns to splash
  <- splash Home returns to catalog
```

### Splash

- Generated `Color Gradient Cards` papercraft title lockup.
- Three large framed picture cards: a shade fan, overlapping color papers, and
  a magnifying glass with nature tokens.
- Home is the only catalog link.
- The first real gesture unlocks all audio. If it chooses a mode, that mode's
  instruction takes priority; otherwise the welcome line plays.

### Spectrum family picker

- Five picture-led family cards: reds, blues, greens, purples, and rainbow.
- Each card visibly previews its complete five-step sequence.
- The family name is optional supportive HTML; voice and color art carry the
  choice for a pre-reader.
- Back returns to the splash. Sound repeats the family-choice prompt.

### Play screens

- The stitched-paper Back control remains top-left and Sound remains bottom-left;
  both retain the shared HUD input and safe-area contract.
- Progress uses decorative dots plus spoken context; text is supportive only.
- A generated 4:3 atelier plate remains calm at center and keeps important art
  clear of HUD/safe areas in landscape, portrait, and wide-short viewports.

### Rewards and end

- Spectrum completion preserves the five assembled cards in the rack, adds a
  generated paper ribbon and paper-confetti ambience, and offers the shared
  Play button as "next color."
- Mixer and Safari each run three short rounds, then reach a distinct end
  tableau built from their authored mode art and the completed color cards.
- Reduced motion keeps the final tableau and praise but removes looping or
  travel animation.

## 4. Mode behavior

### 4.1 Spectrum Studio (`spectrum`)

1. Pick one of five families.
2. Five authored paper tablets appear shuffled in the lower tray. A first
   visit may model the lightest card with one brief glow; it never places an
   answer for the child.
3. Drag a tablet to the matching rack slot, or tap the tablet then the slot.
4. A correct placement snaps into the rack, plays the next pitch in an
   ascending five-note scale, and stays placed.
5. A wrong slot gives a soft paper wobble, a quiet low marimba note, and returns
   the same card to the tray. Nothing resets.
6. After all five placements, the rack remains visible while a rainbow-paper
   glow travels once across it. Spoken praise and a Next Color button return
   to the family picker.

Each family uses five perceptually ordered lightness values. Family selection
changes the data, art, and voice but never the interaction grammar. Rainbow is
ordered red -> orange -> yellow -> green -> blue and is introduced as a color
path rather than a lightness claim.

### 4.2 Color Mixer (`mixer`)

One skill: observe that two different primary colors create a new color and a
continuous transition between them.

1. A paper mixing press shows two empty wells and three loose primary-color
   tablets: red, yellow, and blue.
2. Place two different tablets by drag or tap-tap. Any different pair is valid.
3. The press opens into a five-card gradient bridge from the first primary,
   through three deterministic blend steps, to the second primary.
4. The central mixed color lifts into focus while the narrator names the
   relationship: orange, green, or purple.
5. A same-color attempt receives a playful "more red stays red" model and the
   second tablet returns; no harsh failure.
6. Three varied blends complete the mode. Pair order may reverse visually, but
   the resulting named color stays correct.

### 4.3 Shade Safari (`safari`)

One skill: match an exact visible object color to the same shade among nearby
distractors.

1. One authored papercraft nature object appears on a display card: red apple,
   golden sunflower, green leaf, blue ocean wave, or purple berry cluster.
2. Three shade tablets from that object's family appear shuffled. All are
   plausible; only one exactly matches the object's authored color.
3. Drag a card to the object's paper sample window, or tap the card then the
   object.
4. A match slides the card beside the object and briefly joins their edges with
   a paper-spark trail. The narrator names the match.
5. A non-match gently returns and the object/sample softly pulses to model
   "look again." The choice order remains stable.
6. Three objects complete a 30–90 second session.

## 5. Direct-manipulation contract

- Every visible interactive target has at least a 96 x 96 px hit area.
- `createDragToSlotDom` supplies one active pointer, global completion,
  pointer-cancel/blur cleanup, a padded receiving slot, and a visual drag ghost.
- Tapping a card selects it; tapping a valid target invokes the same semantic
  placement handler used by drag and by `QLOBE_DEBUG`.
- The drag ghost tracks the pointer without hiding the original destination.
- Off-target drops restore the source in place. Rotation or viewport resize
  cancels an active drag rather than stranding it.
- Busy phases lock only the operation being animated. Back and the
  repeat-directions sound control remain responsive.

## 6. Exact color data

Runtime gameplay references committed raster card sprites, not CSS swatches.
Each sprite is produced from the same accepted neutral cardstock source and a
recorded exact fill value. The five family scales are authored to maintain
visible separation at tablet size and checked in grayscale/lightness order.
The rainbow uses five familiar hues in one mockup-compatible rack.

Final color values, object targets, and blend steps live in `config.json` so
QLOBE Studio can inspect the content. A build-time processing record maps each
value to its committed sprite.

## 7. Complete spoken script

All runtime lines below are recorded with the approved warm teacher reference,
then transcript-checked with Whisper. `voice-clips.js` falls back to the exact
same text through device speech when a clip is absent or rejected.

| Key | Verbatim line |
| --- | --- |
| `welcome` | "Welcome to the color atelier. Choose a color adventure." |
| `mode-spectrum` | "Build a beautiful color spectrum." |
| `choose-family` | "Choose a color family." |
| `family-reds` | "Reds." |
| `family-blues` | "Blues." |
| `family-greens` | "Greens." |
| `family-purples` | "Purples." |
| `family-rainbow` | "Rainbow." |
| `arrange-spectrum` | "Look closely. Put the cards from light to dark." |
| `arrange-rainbow` | "Make a rainbow path from red to blue." |
| `order-nudge` | "Look again. Which shade fits here?" |
| `shade-fit` | "That shade fits." |
| `spectrum-complete` | "Well done! Look at that beautiful spectrum." |
| `mode-mixer` | "Blend two colors and watch the shades change." |
| `mixer-prompt` | "Choose two different colors for the paper press." |
| `same-red` | "More red stays red. Choose a different color." |
| `same-yellow` | "More yellow stays yellow. Choose a different color." |
| `same-blue` | "More blue stays blue. Choose a different color." |
| `result-orange` | "Red and yellow make orange." |
| `result-green` | "Yellow and blue make green." |
| `result-purple` | "Red and blue make purple." |
| `mixer-complete` | "Your color bridges are glowing." |
| `mode-safari` | "Find the shade that matches each paper treasure." |
| `safari-apple` | "Find the red that matches the apple." |
| `safari-sunflower` | "Find the golden shade that matches the sunflower." |
| `safari-leaf` | "Find the green that matches the leaf." |
| `safari-ocean` | "Find the blue that matches the ocean wave." |
| `safari-berries` | "Find the purple that matches the berries." |
| `match-nudge` | "Almost. Look closely at the shade." |
| `match-cheer` | "A perfect shade match." |
| `safari-complete` | "You found a whole garden of color." |

## 8. Production art list

Every item below is child-facing raster art in the Papercraft world. HTML/CSS
provides layout, hit areas, exact text, focus, responsive transforms, masks,
and state; it does not draw substitute cards, racks, icons, or nature objects.

| Asset | Final target | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| Atelier backdrop | 1600 x 1200 WebP/JPEG, <=300 KB | Opaque 4:3 layered construction-paper studio plate, calm center and safe corners | Full-screen section background |
| Title lockup | ~900 x 300 transparent WebP, <=150 KB | Exact "Color Gradient Cards" cut-paper lettering | Accessible `<img>` heading |
| Three mode cards | ~520 x 420 transparent WebP each | Framed spectrum, mixer, and safari paper tableaux | 96 px+ HTML buttons |
| Five family cards | ~360 x 460 WebP each | Framed previews made from the final shade sprites | HTML buttons |
| Neutral cardstock tablet source | 384 x 512 transparent PNG | Fibers, deckled radius, bevel, and physical paper shadow | Offline deterministic color finalization only |
| Final shade tablets | ~256 x 340 transparent WebP, about 30 variants | Exact-color authored paper cards | HTML buttons plus shared drag controller |
| Spectrum rack | ~1200 x 360 transparent WebP | Empty cream five-slot cardstock rack | Five semantic HTML slots aligned over art |
| Loose-card tray | ~1200 x 380 transparent WebP | Shallow kraft/cream paper tray | Layout region only |
| Mixer press | ~1000 x 600 transparent WebP | Two wells and a five-card bridge channel | Two semantic slots and result region |
| Safari display frame | ~800 x 620 transparent WebP | Layered paper specimen/display card | One padded semantic target |
| Safari objects | ~480 px transparent WebP each | Apple, sunflower, leaf, ocean wave, berry cluster in cohesive cut paper | `<img>` content; target color recorded in config |
| Reward ribbon | ~900 x 260 transparent WebP | Blank gold folded-paper ribbon and star flecks; runtime praise remains HTML/audio | Decorative reveal layer |
| HUD controls | 256 x 256 transparent WebP each | Stitched cream/coral paper Home, Back, Sound, and Play buttons with navy cut-paper symbols | Shared HUD/play-button HTML hit targets |
| Hub tile | 640 x 533 JPEG | One recognizable rack-and-card game moment in the separate Toy menu grammar; no text | Hub link image |
| Link preview | 1200 x 630 JPEG | Captured final splash, not hand-edited | Open Graph metadata |

Generated sources and prompts remain under `assets/source/`. Cutouts are
alpha-trimmed, padded, normalized, centered by alpha bounds, and checked on a
saturated magenta composite. No final subject may touch its canvas edge or sit
visibly off-center in its bounding box.

## 9. Audio, motion, and feedback

- Recorded AAC/M4A teacher clips are the primary voice channel; Web Speech is
  the exact-text fallback.
- Shared synthesized SFX cover taps, soft returns, and celebrations.
- A tiny game-local WebAudio tone helper plays five equal-tempered pitches for
  shade placement; it creates no asset files and is silenced by debug mute.
- Successful cards travel at most 350 ms with a soft overshoot. Wrong cards
  wobble and return in at most 500 ms.
- Reward motion is one sweep plus optional ambient paper confetti. Under
  reduced motion, state changes immediately and the finished art stays visible.
- Idle nudge begins after 11 seconds and repeats no faster than every 11 seconds;
  any real input resets it.

## 10. Data, randomness, and replay variation

- `config.json` is the canonical editable content document.
- One seeded RNG controls family/object order and card shuffles.
- Spectrum choice stays child-directed; completing a family returns to the
  same open picker and never gates another family.
- Mixer leaves pair order child-directed, remembers completed bridges for the
  current run, and gently returns any duplicate pair.
- Safari chooses three of five objects without replacement, then reshuffles on
  replay.
- No child profile, typed or recorded child input, microphone, camera, account,
  or persistent personal information is used. Gameplay needs no model or remote
  backend; the page retains QLOBE's site-wide analytics loader.

## 11. Shared modules

- `audio-unlock.js`, `voice-clips.js`, `narrator.js`, `sfx.js`
- `screens.js`, `hud.js`, `tap.js`, `mode-select.js`
- `stage/drag-to-slot-dom.js`
- `timers.js`, `idle-nudge.js`, `rng.js`, `preload.js`
- `celebrate.js`, `debug-harness.js`

## 12. `QLOBE_DEBUG` v1

The semantic QA surface exposes:

- `ready`, `listModes()`, `startMode(id)`, `getState()`, `getTargets()`
- `tap(targetId)` through the same handlers as real input
- `winRound()` and `completeMode()` for deterministic end-to-end coverage
- `chooseFamily(id)`, `placeCard(cardId, slotId)`, and `chooseSafari(cardId)`
- `getAudioLog()`, `clearAudioLog()`, `mute(on)`, `seed(n)`, `fastTimers(scale)`
- `home()` and an `artFailures` list

State reports screen, mode, phase, round, total rounds, selected family/card,
placed order, current target, mixer wells/result, reduced motion, mute, busy,
and active drag. Targets report truthful `correct`, `wrong`, or `neutral` roles
for the current prompt.

## 13. Explicit departures from source material and prototype

- The brief names five families including Purples; the mockup omits Purples.
  Production keeps Purples because the written brief is authoritative and it
  completes the mixer/safari color language.
- The mockup uses separate color selection and Start. Production makes each
  large family card start its puzzle immediately, removing a redundant action
  for young children.
- Mockup text such as "LIGHT," "DARK," and progress remains supportive HTML,
  while picture anchors and voice make the action playable without reading.
- The concept video is a gameplay reference, not the visual world; its glossy
  generic app treatment is replaced by the brief's canonical Papercraft world.
- The prototype's Rainbow Order becomes the Rainbow family inside Spectrum
  Studio so the splash can represent the three concept features promised by
  the brief: spectrum, mixing, and safari.
- The prototype's generic emoji, CSS swatches, engine slots, and generic end
  screen are removed rather than reskinned.

## 14. Risks and release gates

Risks:

- Subtle adjacent shades may collapse on low-contrast displays; validate each
  family at actual tablet size and in grayscale/lightness measurements.
- Generated cutout shadows can create misleading alpha bounds; center using
  the visible-alpha bbox and inspect the normalized canvas, not file dimensions
  alone.
- A rack background and semantic slots can drift under responsive scaling;
  derive all slot positions from one aspect-ratio-controlled rack container and
  expose measured rectangles to QA.
- Voice clips can exist but say the wrong line; only Whisper-passing clips enter
  `manifest.json`.

Release gates:

- Every asset in the art list exists, is provenance-logged, optimized, and
  visually inspected at full size.
- All three modes complete through tap and drag; wrong, cancel, off-target, and
  orientation-change paths cannot strand a card.
- Recorded voice plays after a real gesture and fallback remains exact.
- `node --check`, scoped registry sync check, the full validator baseline, and
  the game-local real-Chrome QA suite add zero errors.
- Screenshots cover splash, family picker, active/retry/reward states for every
  mode, landscape, portrait, wide-short, phone, and reduced motion.
- The local build and the production route have zero unexpected page errors,
  failed requests, 404s, or runtime model calls. Only the platform's explicit
  analytics allowlist may contact a remote origin.
- Status remains `beta` until a real iPad child playtest confirms comprehension
  and delight.
