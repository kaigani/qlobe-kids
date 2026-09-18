# Family Story Interview — production game design

## Product promise

Family Story Interview turns a child into the family reporter for one short,
loving conversation. The child picks a picture-led question, hears it aloud,
asks a grown-up, records the answer, decorates one keepsake page, and can replay
the story from a private on-device memory book.

The useful new platform capability is a complete local media loop: explicit
microphone permission, bounded audio recording, optional photo import, Blob
persistence in IndexedDB, replay, deletion, and friendly no-permission/storage
fallbacks. No captured family media leaves the browser.

- **Audience:** ages 3–8 with a parent, grandparent, caregiver, or other loved
  grown-up; primary controls and narration target ages 5–6.
- **Category:** Oral Storytelling.
- **Canonical art direction:** **Watercolor / Storybook**.
- **Per-game treatment:** a warm handmade family album: cream cotton paper,
  deckled edges, watercolor blooms, gouache props, tape, stitches, pressed
  leaves, and a blue cloth binding.
- **Session:** one memory takes about 45–90 seconds; three memories form a
  satisfying 4–7 minute family session.
- **No reading required:** every question and state change is spoken; pictures
  distinguish the three topics and all primary actions.

## Skills and modes

Each mode teaches one oral-language skill while sharing the same keepsake loop.

1. **When You Were Little** — ask a clear question and listen for one detail
   from another person's childhood.
2. **Favorite Things** — invite descriptive language about a meaningful object
   or activity.
3. **Family Traditions** — listen for the order and people in a repeated family
   ritual.

The surprise button does not create a fourth mode. It selects one question from
the same three decks using the seeded game RNG.

## Core loop

```text
picture topic → spoken question → ask grown-up → record answer
→ optional photo + sticker → save page → replay together / make another
```

1. The opening gesture unlocks every audio channel and starts quiet recorded
   background music.
2. The child taps one of three authored watercolor cards, or the surprise
   button. A paper-lift response and spoken topic confirmation follow.
3. The chosen question fills the interview sheet and is read aloud. The child
   can always tap the shared sound button to hear it again.
4. Only a deliberate tap on the coral record control requests microphone
   access. An inclusive listening-grown-up medallion keeps the shared interview
   relationship visible. While recording, the coral plate changes to the
   explicit label “Tap to stop,” alongside a live waveform, timer, pulsing mic,
   and paper-red state marker. Recording stops on tap or at 60 seconds; there
   is no countdown pressure.
5. If permission is denied or recording is unsupported, the game says the
   family can still tell the story together and offers the same decoration/save
   path without audio.
6. On the decoration page the child may import/take one local photo and choose
   one authored watercolor sticker. Photo is optional and never blocks save.
7. Saving stamps the page, adds it to the local memory book, and opens a
   tangible saved spread with play, add/change photo, another question, and
   book actions.
8. Replay ducks the music completely. Returning to questions retains the book;
   returning to the catalog stops recording, playback, narration, and music.

## Screen map and navigation

### 1. Question shelf (`choose`)

- Platform Home lives at top-left and is the only route to the catalog.
- Platform Sound lives top-right and toggles every game audio channel.
- The exact generated title lockup sits above three raster question cards.
- A watercolor reporter guide frames the lower edge without covering targets.
- Cards show childhood, toys, and a shared tradition before a child can read
  their live HTML labels.
- The wide blue raster plate is the surprise action; the authored memory album
  opens the Book.
- First successful gesture starts `mug-and-sunbeam.mp3` at a quiet volume.

### 2. Interview sheet (`interview`)

- Platform Back returns to Question Shelf and cancels any unsaved recording
  only after stopping/releasing the stream.
- The selected topic appears as a live coral kicker above the question.
- The exact live question is the largest readable element and is spoken on
  entry.
- Idle: microphone art plus “Ready when your grown-up is ready.”
- Requesting: calm “Opening the microphone…” state; repeat taps are latched.
- Recording: coral painted plate, large stop state, reactive waveform, elapsed
  time, and a persistent “stays on this device” privacy line.
- Stopped: play-back-before-save and decorate/save actions. A failed/empty
  recording can still continue as a no-audio memory.

### 3. Decorate (`decorate`)

- A physical scrapbook page shows the question, topic art, audio state, and a
  watercolor placeholder.
- “Add photo” is a real file input using `accept="image/*"` and `capture`; it is
  invoked only by a large raster-skinned button. The selected image is decoded,
  orientation-normalized by the browser, resized to a maximum 1280 px edge, and
  stored as a compressed JPEG Blob.
- Three large authored sticker choices (heart, star, flower) are mutually
  exclusive and can be changed freely.
- “Save memory” persists one record. Storage failure falls back to session
  memory and still reaches success.

### 4. Saved memory (`saved`)

- Matches the concept's tangible album spread: binding, photo/illustration
  frame, audio strip, page title, selected sticker, and visible saved stamp.
- Play Story is disabled only when this memory has no audio; Make Another and
  Open Book always work.
- Add/Change Photo reopens the same optional image picker and updates the
  record.
- A short watercolor-heart/paper-stamp celebration closes the loop; reduced
  motion retains the final stamp and sound without moving particles.

### 5. Memory book (`book`)

- Saved stories render as small album pages with topic art, safe generated
  title (“Our toy story”), date, photo or painted placeholder, audio status,
  and replay.
- No transcript, user-entered name, URL, upload, share, or account is exposed.
- Empty state uses the authored album and reporter art and sends the child back
  to pick a question.
- Grown-up tidy is a two-step confirmation area at the bottom. It can clear all
  local memories, but no child-sized destructive icon appears on each page.
- Records are capped at 12; saving the thirteenth removes the oldest record.

## Question content

### When You Were Little

1. “What game did you love to play when you were little?”
2. “What made you laugh when you were my age?”
3. “What was a school day like when you were little?”

### Favorite Things

1. “What was your favorite toy as a child?”
2. “What food did you love when you were little?”
3. “What song or story did you ask for again and again?”

### Family Traditions

1. “What family tradition made you feel happy?”
2. “How did your family celebrate a special day?”
3. “What did everyone do together when you were little?”

## Recorded narrator script

These keys and exact lines are the source for voice cloning, `lines.json`, and
Web Speech fallback.

| Key | Spoken line |
| --- | --- |
| `welcome` | “Welcome, family reporter! Pick a picture to find your first question.” |
| `choose` | “Pick a question, or let the surprise button choose for you.” |
| `surprise` | “Surprise question! Let's see which family memory we find.” |
| `topic-childhood` | “When you were little. Ask about a long-ago childhood memory.” |
| `topic-favorites` | “Favorite things. Ask about something your grown-up really loved.” |
| `topic-traditions` | “Family traditions. Ask about something your family did together.” |
| `q-childhood-game` | “What game did you love to play when you were little?” |
| `q-childhood-laugh` | “What made you laugh when you were my age?” |
| `q-childhood-school` | “What was a school day like when you were little?” |
| `q-favorite-toy` | “What was your favorite toy as a child?” |
| `q-favorite-food` | “What food did you love when you were little?” |
| `q-favorite-story` | “What song or story did you ask for again and again?” |
| `q-tradition-happy` | “What family tradition made you feel happy?” |
| `q-tradition-celebrate` | “How did your family celebrate a special day?” |
| `q-tradition-together` | “What did everyone do together when you were little?” |
| `ready-record` | “Ask your grown-up the question. Then tap the coral microphone when they are ready to share.” |
| `recording` | “I'm listening. Tap again when the story is finished.” |
| `recorded` | “Story captured! You can listen, or decorate your memory page.” |
| `mic-fallback` | “That's okay. Tell the story together, and we can still make a beautiful memory page.” |
| `decorate` | “Add a family photo if you want, then pick a sticker for your page.” |
| `photo-added` | “Photo added. Your memory page is coming together.” |
| `saved` | “Story saved in your family memory book!” |
| `book-empty` | “Your memory book is ready for its first family story.” |
| `book-open` | “Here are your family stories. Tap a page to hear one again.” |
| `storage-fallback` | “Your page is safe for this play time. This device could not keep it after you leave.” |
| `nudge` | “Your grown-up can take all the time they need. Tap the microphone when you're ready.” |

## Art inventory and visible renderer

Every child-facing primary object has an authored raster renderer. DOM/CSS
provides placement, hit areas, focus, labels, safe-area response, and state;
the reactive waveform uses live DOM bars, and canvas is used only for local
photo resampling.

| Object | Visible renderer | Interaction substrate |
| --- | --- | --- |
| World | GPT Image 2 scrapbook workspace, opaque WebP | full-screen DOM background |
| Title | GPT Image 2 title lockup with deterministic cutter matte | accessible `img` |
| Topic choices | three GPT Image 2 watercolor cards with deterministic cutter mattes | 3 semantic buttons |
| Reporter guide | GPT Image 2 character with deterministic cutter matte | decorative `img` |
| Interview partner | GPT Image 2 inclusive listening-grown-up medallion with deterministic cutter matte | decorative `figure`/`img` |
| Record control | authored coral plate + microphone sprites | semantic button/state text |
| Play/photo/save/surprise | authored green/blue/coral plates with exact live HTML labels | semantic buttons |
| Album/book | authored closed memory album sprite | semantic button / gallery anchor |
| Stickers | authored heart/star/flower cutout sprites | three semantic buttons |
| Prompt props | authored train/teddy/camera/notebook sprites | decorative context |
| Live waveform | live teal/coral DOM bars on a quiet paper-colored state strip | dynamic state indicator |
| Photo frame | authored paper/card treatment plus real photo Blob | `img`/object URL |
| Rewards | authored sticker + page stamp plus shared reduced-motion-aware confetti | DOM layer |
| Hub tile | Krea 2 toy-table reporter microphone + memory album, no text | curated hub JPEG |

Source masters, exact prompts, cutter boxes/masks, Layered results, and magenta
alpha QA remain under `assets/source/`. Runtime derivatives are downscaled and
encoded separately.

## Audio and motion

- Cloned teacher narration is primary; Web Speech repeats the identical line on
  missing/rejected clips.
- All generated clips are re-transcribed with Whisper. Material transcript
  mismatches are retried with seeds 8 and 9 or left unrecorded.
- `mug-and-sunbeam.mp3` is reused from `shared/assets/music/`, preloaded before
  the first gesture, played quietly, and ducked around narration. It is muted
  completely during microphone capture and family-story replay.
- Shared synthesized SFX support paper lift, record start/stop, photo placement,
  sticker placement, save stamp, and celebration.
- Motion is tangible but calm: paper rises 12–18 px, the record plate breathes,
  the waveform responds to input, the saved stamp lands, and a page turns.
- `prefers-reduced-motion` removes travel/pulse/confetti while keeping final
  states, color/state contrast, and sound.

## Privacy, permission, storage, and interruption

- Microphone is requested only inside the child's explicit record press.
- Photo/file UI is opened only inside the explicit Add Photo press.
- Audio and images are never sent to a server, model, analytics event, URL, or
  debug log. Runtime contains no model endpoint.
- Active tracks stop on record completion, Back/Home, `pagehide`, and destroy.
- On app backgrounding during capture, the current recording is stopped and
  retained as an unsaved draft when possible; the mic indicator is released.
- IndexedDB records contain only generated id, game id, question/topic ids,
  timestamp, optional audio Blob, optional photo Blob, sticker id, duration,
  and MIME types. They contain no transcript or personal name.
- The store caps at 12 records and exposes list/get/put/delete/clear. If
  IndexedDB is unavailable, an in-memory session store implements the same API.
- A storage failure never blocks the success screen.

## Responsive and accessibility rules

- Required captures: 1180×820 landscape, 1180×520 wide-short, 820×1180
  portrait, and reduced-motion landscape.
- All controls have at least a 96 px hit box independent of painted bounds.
- Wide layouts use the album spread; portrait stacks the title/question above
  the focal object and controls without scrolling the core action.
- HUD safe zones stay empty. Functional text remains high-contrast live HTML;
  no generated lettering other than the visually checked title is functional.
- State is never color-only: icon/label, shape, motion, and narration agree.
- Every control has an accessible name; narration also mirrors into the shared
  `aria-live` announcer.

## Shared modules and local modules

Reuse:

- `audio-unlock.js`, `voice-clips.js`, `narrator.js`, `sfx.js`, `bgm.js`
- `tap.js`, `celebrate.js`, `idle-nudge.js`
- `timers.js`, `debug-harness.js`
- shared HUD art and `mug-and-sunbeam.mp3`

Game-local:

- `js/story-media.js`: MediaRecorder/analyser lifecycle, Blob replay, photo
  normalization, and bounded IndexedDB/session store. It is adapted from the
  proven Puppet Tales recorder without importing another game's private module.
- `js/main.js`: Family Story Interview state machine and screen orchestration.

## `QLOBE_DEBUG` surface

The standard v1 contract exposes `ready`, `listModes`, `startMode`, `getState`,
`getTargets`, `tap`, `home`, `mute`, `seed`, and `fastTimers`.
Game-specific helpers remain semantic and serializable:

- `setMicMode('fake'|'denied'|'real')`
- `finishAnswer()`
- `addFakePhoto()`
- `saveCurrentStory()`
- `getSavedStories()` (metadata only; never Blobs)
- `clearStories()`

`getState()` includes screen, mode, question id, recorder state, mic outcome,
photo/sticker state, replay state, saved count, and whether persistence is real
or session-only.

## Departures from concept and prototype

- The emoji `observe-journal` prototype is replaced rather than reskinned; it
  cannot deliver recording, photo, local persistence, or replay.
- The supplied mockups show one grandmother. Production uses a neutral
  “grown-up” flow and the family's optional real photo so parents,
  grandparents, caregivers, and all family structures fit.
- The prompt wheel becomes an authored surprise button for v1. It preserves the
  delight and random selection while avoiding a visually crowded precision
  spinner on small portrait screens.
- Photo is file/camera input, not direct camera-stream UI. This is the most
  compatible privacy-preserving progressive enhancement across iPadOS and
  Android; no-photo completion is equally polished.
- Sharing/export is intentionally omitted. The brief's strongest promise is a
  private local memory book; a child-facing upload/share path conflicts with it.
- The game ships as **beta** until a real family uses it on an iPad. Automated
  checks cannot validate whether a child knows when to hand the conversation to
  their grown-up.

## Release gate

- Exact Watercolor / Storybook visual system; no emoji, SVG, CSS-drawn primary
  art, malformed generated text, alpha fringe, or placeholder object.
- Full choose → record/fallback → decorate → persist → replay → book loop.
- Real microphone and denied-microphone tests; photo/no-photo; persistence,
  reload, replay, and two-step clear; session-store fallback.
- Recorded narrator clip playback proved in real Chrome; Whisper QA artifacts
  committed for generated clips.
- Zero page errors, failed local requests, remote runtime calls, or 404s.
- Registry/manifest validation, 96 px target audit, portrait/landscape/
  wide-short/reduced-motion screenshots, and adversarial art review with no
  unresolved blocker or major finding.
- Local commit and push, successful Pages run, then the same smoke and visual
  review against `https://qlo.be`.
