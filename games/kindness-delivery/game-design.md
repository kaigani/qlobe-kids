# Kindness Delivery — production game design

Status: production replacement design · 2026-08-06

Category: social-emotional · Ages: 4–7

Art world: **Paper Garden** (the requested papercraft direction)

Route retained: `games/kindness-delivery/`

## 1. Product promise and capability contribution

Kindness Delivery lets a child make a real, personal picture-note and feel the
whole emotional arc of giving it away: choose a friend, draw and decorate,
fold the note, send it with one joyful swipe, and watch the friend receive it.

The one family skill is **expressing care through a concrete act of giving**.
Each friend variation gives that skill a slightly different focus:

| Mode / friend | One skill | Prompt emphasis |
| --- | --- | --- |
| `fox` | Express warmth through drawing | Make Fox a bright, cheerful picture. |
| `bunny` | Compose a supportive visual message | Combine marks, stamps, and stickers for Bunny. |
| `bear` | Connect a kind intention to a real-world act | Make Bear a cozy note, then choose one small kind thing to do away from the tablet. |

This replaces a generic `observe-journal` choice screen with two reusable,
production-strength capabilities:

1. semantic, resize-safe child creation using the shared musical canvas plus
   the shared normalized freeform board; and
2. a robust, equal-access swipe-launch interaction with a semantic launch
   event, pointer-cancel/blur safety, reduced-motion behavior, and a button/
   keyboard equivalent.

The game remains a pure static site. No model, account, child-work upload, or
game-specific network service is used at runtime; the platform's standard
page-view analytics shim remains unchanged. The child's note stays in memory
for the current delivery and is discarded when another note begins.

## 2. Source material and visual north star

Primary sources:

- `01-game-concepts/kindness-delivery/brief.md`
- `01-game-concepts/kindness-delivery/output/ui-mockups/01-friend-select.png`
- `01-game-concepts/kindness-delivery/output/ui-mockups/02-make-kind-note.png`
- `01-game-concepts/kindness-delivery/output/ui-mockups/03-kindness-delivered.png`
- the concept video in the same folder

The mockups establish the emotional tone and hierarchy: a tactile meadow,
three large recipient cards, one dominant note canvas on a craft table, a
simple three-tool tray, an unmistakable paper-plane action, and a generous
recipient reaction. They are not literal UI specifications; functional text
stays HTML and spoken guidance carries the interaction for pre-readers.

## 3. Core loop and session length

```text
friend select → make note → fold → swipe/send → flight → delivery reaction
      ↑                                                    │
      └──────────────────── send another ──────────────────┘
```

A first delivery should take 45–75 seconds. A child who already knows the game
can complete one in about 30 seconds. There is no score, timer, currency, loss,
or wrong note. Any mark is a valid act of care.

The five-second read is visual:

- splash: three inviting friend portraits and one glowing selection card;
- studio: a large blank paper card, chunky crayons/stamps/stickers, and a plane;
- flight: the finished plane rests at the start of a stitched flight trail;
- delivery: the chosen friend hugs the note inside a large warm heart.

## 4. Screen map and navigation

### 4.1 Boot

The game preloads every required raster asset and the voice manifest. The
splash becomes interactive only when the visible friend art is decoded.
`window.QLOBE_DEBUG.ready` resolves at the same gate.

No audio plays on load. `installUnlockOnGesture()` unlocks SFX, voice clips,
and musical-canvas audio on the first real child gesture.

### 4.2 Friend select / splash

- Full-bleed Paper Garden meadow backdrop.
- Generated `Kindness Delivery` graphic lockup; accessible game name remains
  on the title image.
- Three large real `<button>` friend cards: Fox, Bunny, Bear. Portraits and
  colored cloth labels are authored raster art; names are supporting HTML and
  not required to choose.
- The Home HUD button is the only route to the hub.
- A sound button repeats: “Choose a friend for your kindness note.”
- A selected card gives immediate tilt/lift feedback and enters the studio.

The friend buttons are also the three debug modes. The visual screen remains a
friend-selection fantasy instead of exposing an abstract mode menu.

### 4.3 Note studio

- Back HUD button returns to friend select and discards the unfinished note.
- Sound HUD button repeats the friend-specific invitation.
- Full-bleed craft-table backdrop with a calm center.
- Authored deckled paper frame contains two semantic layers:
  1. child strokes rendered by `createMusicalCanvas`; and
  2. raster stamps/stickers rendered by `createFreeformBoard`.
- A bottom tray exposes three 96px tool buttons: crayon, stamp, sticker.
- Choosing a tool opens a small picture-only palette of four options.
- Undo reverses the most recent creation action across both layers.
- Clear is reversible: the first press clears both layers and reveals a large
  restore affordance until the next action.
- The plane/ready button is visibly sleepy until at least one stroke or placed
  item exists. Pressing it early says, “Add one little mark first.”
- Once there is content, the plane glows gently. Pressing it locks authoring,
  snapshots the semantic note, and begins the fold beat.

Crayon strokes are normalized and survive resize. Stickers may be added by a
simple tap (placed in the next open note position) and then dragged. Keyboard
or assistive-tech activation always has an equivalent; drag is never the sole
way to decorate.

### 4.4 Fold beat

The child's real note is flattened only as a transient presentation image; the
semantic strokes and sticker records remain the source of truth. Two paper
flaps fold over it and the authored plane sprite settles at the left side of
the sky. Input is locked for the short beat. Back cancels the route safely.

Under reduced motion, the fold resolves with a quick dissolve rather than a
3D flip.

### 4.5 Flight

- Full-bleed stitched-sky backdrop with calm HUD zones.
- The plane carries a small, clipped preview of the child's actual note.
- A large pulsing hand/arrow cue and stitched arc model a rightward swipe.
- The child can drag/flick the plane or press the large plane/send button.
- Every intentional launch succeeds. Distance and velocity only change the
  height, tilt, heart trail, and whoosh—not whether kindness arrives.
- A short or vertical gesture gives a warm wiggle and “Swipe toward your
  friend,” then immediately re-arms. There is no red state or buzzer.
- `pointercancel`, blur, navigation, or resize during a gesture cancels cleanly
  and restores the plane; it never commits a delivery.
- A semantic launch is accepted exactly once while input is locked. Timers and
  animations are cancelled by the route token on screen exit.

Under reduced motion, the plane crossfades from launch to destination in under
250ms while the whoosh and spoken response preserve the beat.

### 4.6 Delivery reaction / end

- Full-bleed meadow/delivery backdrop.
- Chosen friend's happy reaction sprite, holding the child's note preview.
- HTML heading: “Kindness delivered!”; the friend name is supporting text.
- Layered raster hearts rise once, then a very gentle ambient heart drift may
  continue until exit. Reduced motion keeps a still heart halo.
- The recorded line names the friend and reinforces the social effect.
- Bear's variation adds one spoken real-world transfer prompt; it never blocks
  completion.
- Large Send Another button returns to friend select. Back does the same.

## 5. Creation model

The in-memory note document is:

```js
{
  format: 'qlobe-kindness-note',
  formatVersion: 1,
  friendId: 'fox' | 'bunny' | 'bear',
  drawing: { format: 'qlobe-musical-painting', formatVersion: 1, strokes: [] },
  stickers: { format: 'qlobe-freeform-board', formatVersion: 1, items: [] }
}
```

`createMusicalCanvas` owns normalized stroke capture, resize, cancellation,
undo, and deterministic debug strokes. Its background hook draws warm paper
rather than the Sound Painting night field. The canvas is an interaction
surface and the child's own authored output, not a substitute for production
art.

`createFreeformBoard` owns normalized sticker placement, z-order, movement,
selection, undo, and cancellation rollback. Its DOM overlay is inert outside
the actual pieces, so it never steals drawing gestures.

The game tracks an application-level creation history token (`drawing` or
`sticker`) so the single Undo button addresses whichever medium changed last.
Clear stores one combined snapshot for restoration.

## 6. Tools and content

### Crayons

Four high-contrast paper-garden colors: sunshine `#f4b83f`, berry `#e95575`,
sky `#4d9bd8`, and leaf `#63a95f`. The selected crayon image lifts from the
tray. Drawing emits quiet pentatonic tones through the shared canvas; muting
silences them.

### Stamps

- smiling sun — spoken thought: “You make the day brighter.”
- warm heart — “I’m glad you’re my friend.”
- growing flower — “You help good things grow.”
- little star — “You are wonderfully you.”

A tap places the stamp at a deterministic open position and speaks its kind
thought. The child can reposition it afterward.

### Stickers

Rainbow, envelope-heart, sparkle-star, and daisy. These are decorative,
wordless, authored raster cutouts. A tap adds; drag repositions.

## 7. Verbatim voice script

These keys and lines are the source of truth for Qwen voice-clone production.
Runtime uses the recorded clip first and Web Speech as a correct fallback.

| Key | Verbatim line |
| --- | --- |
| `welcome` | “Welcome to Kindness Delivery. Choose a friend for your kindness note.” |
| `choose-friend` | “Who would you like to make smile?” |
| `fox-invite` | “Fox would love a bright picture. Make anything cheerful.” |
| `bunny-invite` | “Bunny loves little surprises. Draw, stamp, and sticker a happy note.” |
| `bear-invite` | “Bear could use a cozy smile. Make a gentle note just for Bear.” |
| `add-mark` | “Add one little mark first. Every picture can carry kindness.” |
| `stamp-sun` | “You make the day brighter.” |
| `stamp-heart` | “I’m glad you’re my friend.” |
| `stamp-flower` | “You help good things grow.” |
| `stamp-star` | “You are wonderfully you.” |
| `note-ready` | “Your kindness note is ready. Let’s fold it into a paper plane.” |
| `folding` | “Fold, fold, and one last tuck.” |
| `swipe` | “Swipe the plane toward your friend.” |
| `swipe-nudge` | “Try a bigger swipe toward your friend.” |
| `fox-delivered` | “Special delivery! Your picture made Fox’s whole face light up.” |
| `bunny-delivered` | “Kindness delivered! Bunny feels so loved.” |
| `bear-delivered` | “Your gentle note made Bear feel warm and cared for.” |
| `bear-transfer` | “Can you think of one small kind thing to do for someone near you?” |
| `send-another` | “Would you like to make another kindness note?” |
| `restored` | “Your note is back.” |

Voice is warm, unhurried, and delighted—not evaluative. It never claims the
child drew a particular object.

## 8. Art direction and complete visible-art inventory

The chosen user direction is **Papercraft**, implemented as the repository's
Paper Garden world: construction paper, deckled card, stitched cloth details,
visible fiber, imperfect cut edges, and soft physical layer shadows. It is one
coherent material language across backdrop, characters, note, tools, controls,
stickers, plane, hearts, and rewards. No emoji, SVG illustration, CSS-drawn
primary object, or generic gradient card ships in the final game.

### Krea 2 concept gate (source-only)

Four 4:3 concepts establish one world before production art:

1. friend-select meadow and three friend cards;
2. note studio and tool tray;
3. swipe-flight sky with stitched trail;
4. delivery reaction with the chosen friend and heart halo.

All use `krea2-turbo-t2i`, seeds recorded in
`assets/source/concepts/krea2/PROMPTS.md`, and are reviewed together for material,
palette, character silhouette, center calmness, and HUD-safe composition.

### Production raster art

| Runtime asset | Master / final target | Visible renderer |
| --- | --- | --- |
| Splash meadow | 1600×1200 source → optimized WebP/JPEG ≤300KB | cover-fit `<img>` backdrop |
| Craft table | 1600×1200 source → optimized WebP/JPEG ≤300KB | cover-fit `<img>` backdrop |
| Flight sky | 1600×1200 source → optimized WebP/JPEG ≤300KB | cover-fit `<img>` backdrop |
| Delivery meadow | 1600×1200 source → optimized WebP/JPEG ≤300KB | cover-fit `<img>` backdrop |
| Title lockup | alpha WebP/PNG, ≤150KB | accessible `<img>` |
| Fox/Bunny/Bear idle portraits | alpha WebP, ~420px each | friend-card `<img>` |
| Fox/Bunny/Bear reaction poses | alpha WebP, ~560px each | end-screen `<img>` |
| Friend card frame + label tabs | alpha WebP | button art beneath HTML name |
| Deckled note and tool tray | integrated in the clean studio backdrop | backdrop beneath semantic creation layers |
| Three tool icons + four crayon choices | alpha WebP | real button images |
| Four stamps + four stickers | alpha WebP, 160–240px | freeform item images |
| Undo, clear, restore, and send controls | alpha WebP | real button images |
| Child-note fold preview + paper plane | transient child render + alpha WebP | fold and flight actors |
| Swipe cue | authored plane plus code-driven nudge | spoken and animated instruction |
| Heart family | reusable alpha heart stamp | trail and celebration sprites |
| Hub tile | 640×533 JPEG, menu toy-table grammar | hub registry image |
| OG image | 1200×630 JPEG | screenshot of final splash |

Primary background/character/tool masters are produced with GPT Image 2 after
the Krea concept gate. Simple opaque cutouts use the built-in image workflow on
a flat removable key background; all final alpha edges are inspected on
magenta and on the actual backdrops. Nondeterministic masters and prompts stay
under `assets/source/`; final derivation is deterministic and documented in
`ASSETS.md`.

## 9. Interaction substrate versus visible art

- HTML supplies semantics, exact functional text, layout, focus, and hit areas.
- Canvas supplies the child's own strokes and the transient flattened note.
- DOM transforms animate authored raster characters, plane, tools, and hearts.
- CSS may supply masks, clipping, invisible hit zones, focus rings, and layout;
  it does not draw the friends, note, tools, plane, stickers, or reward objects.

Every control is at least 96 CSS pixels in its hit area. Tool palettes may show
smaller visible art only inside a 96px button.

## 10. Feedback, difficulty, and replay

- Every valid tool selection gives a small lift and `tick`/`pop`.
- Drawing makes gentle musical notes, giving movement immediate consequence.
- Stickers and stamps arrive with a paper pop; moving them remains reversible.
- Any intentional send succeeds; gesture strength changes flourish only.
- Small decorative placements vary with the seeded RNG.
- Replaying with another friend changes the invitation, character art,
  reaction art, spoken response, and Bear's real-world transfer line.
- Idle nudges first repeat the prompt, then animate the relevant affordance.

There is no grading. A blank note cannot be sent only because the child needs
one visible cause-and-effect action before the payoff; the correction is warm
and immediate.

## 11. Accessibility, privacy, and resilience

- Core play never requires reading; every state is image-led and spoken.
- Functional text stays real HTML and is mirrored to an `aria-live` narrator.
- Friend cards, tools, palette choices, note pieces, plane, Back, Home, Sound,
  Undo, Clear, Restore, and Send Another have explicit accessible names.
- Pointer play has keyboard/assistive-tech button equivalents.
- Canvas has a useful accessible label and debug/AT decoration buttons provide
  a non-drawing creation path.
- Portrait, landscape, 1180×520, and safe-area insets retain the note and HUD.
- Reduced motion removes looping drift, fold flips, and long flight arcs while
  preserving clear before/after states and audio.
- Audio is non-load-bearing. Mute and unavailable recorded clips preserve play.
- The child note is never uploaded or written to persistent storage.
- A route token plus per-screen timer/animation teardown prevents late fold,
  flight, or voice callbacks from reopening an exited screen.

## 12. Shared modules used

- `shared/js/audio-unlock.js` — first-gesture unlock and kiosk guards
- `shared/js/voice-clips.js` + `shared/js/narrator.js` — recorded voice/fallback
- `shared/js/sfx.js` — tactile feedback
- `shared/js/tap.js` — one press path
- `shared/js/hud.js` — Home/Back/Sound controls
- `shared/js/screens.js` — screen routing and teardown
- `shared/js/musical-canvas.js` — normalized drawing
- `shared/js/freeform-board.js` — normalized raster item placement
- `shared/js/timers.js` — cancellable, QA-scalable beats
- `shared/js/rng.js` — deterministic decoration variation
- `shared/js/idle-nudge.js` — gentle help ladder
- `shared/js/debug-harness.js` — QA contract

## 13. `window.QLOBE_DEBUG` v1

Required standard surface:

- `ready`
- `listModes()` → fox, bunny, bear
- `startMode(id)`
- `getState()`
- `getTargets()`
- `tap(target)`
- `winRound()`
- `home()`
- `mute(on)`
- `seed(number)`
- `fastTimers(multiplier)`

Game-specific semantic extensions:

- `chooseFriend(id)`
- `drawStroke(points)`
- `addSticker(id, x, y)`
- `clearNote()` / `restoreNote()`
- `fold()`
- `launch({ distance, velocity, source })`
- `completeFlight()`
- `getNote()`
- `getAudioLog()`

`getState()` exposes only serializable truth: screen, friend, active tool,
stroke count, sticker count, hasContent, folded, awaitingInput, inputLocked,
launch source, and reduced-motion status.

## 14. Explicit departures

### From the old beta

- The `observe-journal` engine, emoji recipients, canned choice cards, and
  heart-stamp journal are removed. They demonstrate empathy prompts but do not
  deliver the concept's authored-note, fold, flight, or friend-reaction fantasy.
- The old “tired grown-up / scraped knee / new neighbor” pages become three
  recurring animal friends from the approved mockup. This gives consistent,
  reusable characters and avoids requiring a child to infer ambiguous emoji.
- The old separate Secret Kindness mode is folded into Bear's post-delivery
  transfer prompt. This retains real-world transfer without interrupting the
  visual making loop with a text-heavy scenario chooser.

### From the brief

- The plane is guided by one expressive launch swipe rather than continuous
  steering through obstacles. The social act remains the focus and every note
  arrives; gesture quality never becomes a gate on kindness.
- Positive phrases are spoken by wordless stamps rather than baked into the
  note. A pre-reader can use them, AI-generated typography cannot misspell
  them, and the child's picture remains personal.

### From the mockups

- The note text shown in the concept is replaced with real child-created marks.
- Tool labels are supporting HTML; the image/tool silhouette is sufficient.
- A distinct flight screen is added between craft and reaction because the
  concept brief promises a meaningful swipe launch and the mockup set omits
  that interaction state.
- Undo, clear/restore, Back, Sound, reduced-motion, and accessible alternatives
  are added for production robustness.

## 15. Release gate and known risks

The game is ready to ship only when:

- every item in the art inventory is real, coherent raster art;
- title spelling and all cutout edges pass full-size visual review;
- every recorded voice clip is transcript-QA'd, with fallback tested;
- actual pointer drawing, stamp placement, sticker drag/cancel, cross-medium
  undo, clear/restore, fold cancellation, short-swipe retry, successful launch,
  and all three recipient reactions pass in real Chrome;
- splash, studio, flight, and reaction are captured and inspected at 1180×820,
  820×1180, 1024×768 touch/DPR2, 1180×520, and reduced motion;
- the direct route and hub route produce no page errors, failed requests, 404s,
  or off-origin runtime requests;
- registry/manifest/head metadata/usage index validators add no errors;
- the same suite passes against `https://qlo.be` after deployment.

Known risks are the canvas/sticker overlay intercepting pointers, fold/flight
callbacks surviving navigation, alpha fringes on tactile cutouts, cover-fit
cropping in short landscape, and recorded voice falling back silently. Each has
an explicit automated check plus screenshot evidence in the QA plan. Real iPad
child sign-off remains the gate from `beta` to `live`.
