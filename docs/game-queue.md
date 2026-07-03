# QLOBE Kids — Game Queue

The curated idea bank for contributors. Every idea here is drawn from our 100-game research bank and re-imagined as a tablet mini-game for kids aged 5–6.

## How to use this queue

1. **Pick one** — grab anything from **Up next** below, or any idea from the category tables that is marked **great fit** or **adaptable**.
2. **Or propose your own** — a variation, a new mode for an existing game family, or a fresh idea entirely.
3. **Point Claude Code at the repo** and say what you want to build. The agent onboarding brief is [`CLAUDE.md`](../CLAUDE.md); the step-by-step build flow is in [`docs/adding-a-game.md`](adding-a-game.md).
4. **Register it** in `games.json` when it is playable (`status: proposed → in-design → live`).

**Design rules of thumb** (full philosophy in [`docs/philosophy.md`](philosophy.md)): one skill per mini-game, many modes per family, touch-first with 96px+ targets, hear-it → see-it → do-it, 30–90s loops, no harsh failure, repeat with variation, no reading required. Reuse `shared/` assets before making anything new.

**Shared assets you can reach for** (all via `../../shared/`):

- `assets/letter-tiles/` — 56 onset (single consonant) + rime tile PNGs for word building.
- `assets/objects/` — 134 CVC word picture cards (cat, dog, sun, bus…).
- `assets/audio/` — teacher-voice library: `fragments/` (phonemes), `words/`, `prompts/`, `celebrate/`, `misc/`, indexed by `manifest.json`.
- `assets/ui/` — `btn-home`, `btn-play`, `btn-shuffle`, `btn-sound`.
- `assets/twemoji/` — open-licensed emoji SVGs for quick icons.
- `data/words.json` — master word / onset / rime manifest.
- `js/audio.js`, `js/speech.js`, `js/sfx.js` — playback, teacher voice, sound effects.
- `fonts/` (Fredoka), `vendor/` (three.js r166 + RoundedBoxGeometry) for 3D games.

**Fit legend**

- **great fit** — becomes an on-screen tablet game cleanly.
- **adaptable** — works on-screen with some invention or new art.
- **grown-up led, off-screen** — a real-world activity (pouring water, scissors, a nature walk). Honest answer: it belongs off the tablet. Some of these are **coach mode candidates** — the tablet narrates, times, or checks a real-world activity instead of replacing it.

Roughly a quarter of the bank is off-screen, and that is fine. QLOBE Kids is digital-only but body-aware.

---

## Up next — 5 starter picks (ready to build)

These five match the `proposed` entries already in `games.json`.

### `blend-train` — Blend Train (Reading & Phonics)
Sound cars roll on a track, each showing one phoneme (/m/ /a/ /t/). The child drags them together; as cars couple, the teacher voice blends the sounds faster until the whole word snaps out — "mat!" — and the matching picture card pops up. Reuses `assets/letter-tiles/`, `assets/audio/fragments/` + `words/`, and `assets/objects/`. Core loop: hear segments → couple cars → hear the blend → see the word.

### `pattern-train` — Pattern Train (Math & Number Sense)
A train of colored cars shows a repeating pattern (red-blue-red-blue…). The child taps the next car's color to continue it, then gets an "invent your own" mode where the train replays their pattern back. Start with color/shape, layer in clap-stomp audio patterns using `js/sfx.js`. Core loop: read the rhythm → predict the next → confirm by ear and eye.

### `tangram-tales` — Shape Tangram Tales (Math & Number Sense)
Drag and rotate a small set of shapes to fill an animal silhouette (cat, boat, bird). Pieces snap when close; a gentle chime and the animal's name reward completion. Freeform "make your own" mode lets kids build anything. New shape art needed; reuse `js/sfx.js` and Fredoka. Core loop: see the outline → place shapes → snap → name it.

### `story-sequence` — First-Next-Last Cards (Oral Language & Storytelling)
Three picture cards from a tiny story arrive shuffled; the child drags them into first-next-last order, then the teacher voice narrates the sequence they built. No wrong-answer buzzer — out-of-order just tells a sillier story. Reuse `assets/audio/prompts/`, `js/speech.js`; needs a few 3-card story sets as new art or twemoji collages. Core loop: study the pictures → order them → hear the story.

### `feelings-charades` — Feelings Charades (Social-Emotional & Self-Regulation)
A character on screen acts out an emotion (proud, frustrated, calm, worried); the child taps the matching feeling face, then a "your turn" mode invites them to make the face themselves before revealing the answer. Reuse `assets/twemoji/` faces, `js/speech.js`, `js/sfx.js`. Core loop: watch the feeling → name it → mirror it.

---

## Reading & Phonics

| Idea | Digital adaptation | Fit |
|---|---|---|
| Sound Basket | Objects tumble in; child sorts each into the basket of its beginning sound. Reuse `assets/objects/` + `audio/fragments/`. | great fit |
| Mystery Letter Bag | A hidden tile inside a bag plays its sound on tap; child guesses the letter, then it's revealed. Reuse `assets/letter-tiles/`, `audio/fragments/`, `audio/misc/mystery-intro`. | great fit |
| CVC Word Builder | Drag onset + rime tiles onto slots to build cat, sun, map; teacher voice reads the result. Reuse `assets/letter-tiles/`, `data/words.json`, `audio/words/`. | great fit |
| Rhyming Detective | Tap the two picture cards that rhyme out of a scattered set. Reuse `assets/objects/` + `data/words.json` rime data. | great fit |
| **Blend Train** | See Up next — couple phoneme cars to blend a word. | great fit |
| Letter Treasure Hunt | Find every "b" hiding across a busy scene; tap them before time runs out. Reuse `assets/letter-tiles/`, `audio/fragments/`. | great fit |
| Silly Swap Words | Change one tile to morph cat → hat → hot; each swap re-reads the new word. Reuse `assets/letter-tiles/`, `audio/words/`, `audio/misc/silly-*`. | great fit |
| Picture-to-Word Match | Match a picture card to its decodable spelling. Reuse `assets/objects/`, `data/words.json`. | great fit |
| Sound Hopscotch | Letter pads light up; child hops (taps) each pad as its sound is spoken. Reuse `assets/letter-tiles/`, `audio/fragments/`. | great fit |
| Tiny Reader Theater | A one-page decodable story reads aloud word-by-word as the child taps along, with simple animated characters. Reuse `data/words.json`, `js/speech.js`. | adaptable |

## Writing & Fine Motor

| Idea | Digital adaptation | Fit |
|---|---|---|
| Sand Tray Letters | Trace a letter with a finger; grains fill the stroke path and it reads the sound when complete. Reuse `assets/letter-tiles/` as guides, `audio/fragments/`. | great fit |
| Chalkboard Big Strokes | Full-screen loops, lines and curves the child draws over a dotted guide. Canvas + `js/sfx.js`. | great fit |
| Bead Path Builder | Drag beads left-to-right onto a string following a pattern. Reuse `js/sfx.js`; simple bead art. | great fit |
| Tweezer Rescue | Pinch-drag pom-poms into bins by color or beginning sound. Reuse `assets/objects/` or twemoji, `audio/fragments/`. | adaptable |
| Sticker Line Challenge | Place stickers precisely along curves and zigzags; snap-to-line feedback. Reuse `assets/twemoji/`. | great fit |
| Name Puzzle | Reorder scrambled letters of the child's own name (parent enters it once). Reuse `assets/letter-tiles/`, `js/speech.js`. | great fit |
| Letter Road Driving | Drive a car along a letter-shaped road, following the correct stroke order. Reuse `assets/letter-tiles/` paths, `js/sfx.js`. | great fit |
| Scissor Trail Safari | Drag along animal-path cut lines to "free" the animal — a digital tracing analog to scissor skills. New path art. | adaptable |
| Playdough Letter Factory | Squish and pull a dough blob to match a letter outline (physics-lite). New art; `js/sfx.js`. | adaptable |
| Secret Message Copy | Copy a short shown word into blank slots by dragging tiles. Reuse `assets/letter-tiles/`, `audio/words/`. | great fit |

## Math & Number Sense

| Idea | Digital adaptation | Fit |
|---|---|---|
| Number Rod Race | Drag colored rods into order shortest-to-longest; wrong order nudges gently. New rod art; `js/sfx.js`. | great fit |
| Counting Treasure Cups | Drag exactly N objects into a numbered cup; the cup celebrates when the count matches. Reuse `assets/objects/` or twemoji, `audio/celebrate/`. | great fit |
| Sandpaper Number Match | Trace a numeral, then tap the set with that many objects. Reuse `assets/twemoji/`, `js/speech.js`. | great fit |
| Teen Bead Builder | Combine a ten-bar with ones to build 11–19; the total speaks. New bead art; `js/speech.js`. | great fit |
| Snack Addition Stories | Narrated word problems ("three berries plus two"); child drags counters to solve. Reuse `assets/twemoji/`, `js/speech.js`. | great fit |
| Subtraction Picnic | Animals "eat" counters away; child taps the remaining count. Reuse `assets/twemoji/`, `audio/celebrate/`. | great fit |
| Number Line Jump | A character hops forward/back along a floor number line to land on the target. Reuse `js/sfx.js`. | great fit |
| **Shape Tangram Tales** | See Up next — fill animal silhouettes with shapes. | great fit |
| Block Tower Measure | Stack cube blocks and compare two towers' heights. Reuse `vendor/` three.js + RoundedBoxGeometry, `js/sfx.js`. | great fit |
| **Pattern Train** | See Up next — continue and invent repeating patterns. | great fit |

## Practical Life & Independence

| Idea | Digital adaptation | Fit |
|---|---|---|
| Pouring Station | Best done with real water/beans; tablet can time and cheer the real activity. | grown-up led, off-screen (coach mode candidate) |
| Table-Setting Mission | Drag plate/cup/fork onto their spots from a visual placemat card. Reuse `assets/twemoji/`, `js/speech.js`. | great fit |
| Snack Chef | Real peeling/spreading; a picture recipe card on the tablet can guide steps. | grown-up led, off-screen (coach mode candidate) |
| Laundry Sorter | Drag socks into matching pairs and colors on screen. Reuse `assets/twemoji/`, `js/sfx.js`. | great fit |
| Sweep the Trail | Real broom work; tablet can play the timer song. | grown-up led, off-screen |
| Button-Zipper Lab | Real dressing frames; hard to convey the motor skill on glass. | grown-up led, off-screen |
| Plant Care Captain | A daily checklist the child taps (watered? misted?) that coaches real plant care. Reuse `assets/twemoji/`, `js/speech.js`. | grown-up led, off-screen (coach mode candidate) |
| Shelf Reset Game | Real tidying routine; tablet as narrator/timer. | grown-up led, off-screen (coach mode candidate) |
| Lunchbox Pack | Drag items from a picture checklist into a lunchbox — pure on-screen. Reuse `assets/twemoji/`. | great fit |
| Clean-Up Timer Quest | Tablet plays a clean-up song and countdown while the child tidies the real room. Reuse `js/sfx.js`, `audio/celebrate/`. | grown-up led, off-screen (coach mode candidate) |

## Sensorial & Early Science

| Idea | Digital adaptation | Fit |
|---|---|---|
| Sink or Float Lab | Predict then drop objects into water; a physics-lite sim shows the result. Reuse `assets/twemoji/`, `js/sfx.js`. | adaptable |
| Magnet Explorer | Real magnets are best; on-screen version drags objects to a magnet and sorts sticky/not. | adaptable |
| Sound Cylinder Match | Tap shakers to hear them; pair the two that sound alike. Reuse `js/sfx.js`. | great fit |
| Texture Trail | Textures don't transmit through glass; a visual rough/smooth sort is a weak stand-in. | grown-up led, off-screen |
| Smell Jars | Smell can't be digitized. | grown-up led, off-screen |
| Color Gradient Cards | Drag color chips into order light-to-dark. Canvas colors; `js/sfx.js`. | great fit |
| Bean Sprout Watch | A daily photo/drawing journal the tablet prompts and stores, coaching a real seed. `js/speech.js`. | grown-up led, off-screen (coach mode candidate) |
| Weather Scientist | Tap today's weather onto a chart; builds a week's log. Reuse `assets/twemoji/`, `js/speech.js`. | great fit |
| Bug Hotel Observer | Real observation; tablet as an ID guide and journal. | grown-up led, off-screen (coach mode candidate) |
| Melting Race | Real ice experiment; tablet times the melt and records guesses. | grown-up led, off-screen (coach mode candidate) |

## Oral Language & Storytelling

| Idea | Digital adaptation | Fit |
|---|---|---|
| Story Stones | Shuffle and tap three picture stones, then the child tells a story about them (open-ended, no scoring). Reuse `assets/twemoji/`, `js/speech.js`. | great fit |
| Puppet Retell | Tap puppets to speak a familiar story; child voices along. Reuse `assets/twemoji/`, `js/speech.js`. | adaptable |
| **First-Next-Last Cards** | See Up next — sequence a 3-card picture story. | great fit |
| Question Ball | A spinning ball lands on who/what/why/how; teacher voice asks, child answers aloud. Reuse `js/speech.js`, `js/sfx.js`. | great fit |
| Silly Sentence Builder | Combine noun + verb + place cards into a sentence the tablet reads back. Reuse `assets/objects/`, `assets/twemoji/`, `js/speech.js`. | great fit |
| Picture Narration | One rich illustration appears; teacher voice prompts "tell me what you see." `js/speech.js`. | great fit |
| Emotion Voice Game | Say a line happy, then scared, then proud — the tablet models each tone. Reuse `js/speech.js`, `assets/twemoji/` faces. | great fit |
| Joke Workshop | Riddle-of-the-day with a tap-to-reveal punchline; wordplay templates. Reuse `js/speech.js`. | adaptable |
| Family Story Interview | Prompts the child to ask a grown-up about "long ago" — off-screen conversation. | grown-up led, off-screen (coach mode candidate) |
| Story Repair Shop | A story is missing its ending; child picks or invents one from options. Reuse `assets/twemoji/`, `js/speech.js`. | great fit |

## Culture, Geography & History

| Idea | Digital adaptation | Fit |
|---|---|---|
| Puzzle Map Match | Drag animals/foods/landmarks onto their continent or country. New map art; `js/speech.js`. | great fit |
| Globe Spin Stories | Spin a 3D globe; it stops and asks "what might live there?" Reuse `vendor/` three.js, `js/speech.js`. | great fit |
| Land-Water Tray | Paint or drag to make island, lake, peninsula, bay from a model card. New art. | adaptable |
| Then-and-Now Sort | Match old vs. new pairs (candle/lamp, old phone/new). Reuse `assets/twemoji/`. | great fit |
| Family Timeline | Order photos baby → toddler → now → future (parent adds photos). `js/speech.js`. | adaptable |
| Community Helper Cards | Match tools to the helper who uses them. Reuse `assets/twemoji/`. | great fit |
| Mountain Seasons Wheel | Spin a wheel to see local weather, clothing, plants per season. New art; `js/sfx.js`. | great fit |
| Neighborhood Map Walk | Draw home/trail/store on a simple map canvas — pairs with a real walk. | grown-up led, off-screen (coach mode candidate) |
| World Music Dance Cards | Hear a clip, move to it, then tap where on the map it's from. Reuse `js/sfx.js`, map art. | great fit |
| Local Nature Guide | An ID guide for pinecones, rocks, birds, tracks used on a real walk. Reuse `assets/twemoji/`. | grown-up led, off-screen (coach mode candidate) |

## Art & Music

| Idea | Digital adaptation | Fit |
|---|---|---|
| Color Mixing Lab | Tap primary paint blobs together to discover new colors. Canvas blending; `js/sfx.js`. | great fit |
| Clay Creature Studio | Sculpt a soft 3D blob into creatures. Reuse `vendor/` three.js; ambitious. | adaptable |
| Rhythm Copycat | The tablet claps/taps a pattern; the child repeats it by tapping. Reuse `js/sfx.js`. | great fit |
| Sound Painting | Music plays; the child draws freely and the brush reacts to the beat. Canvas + `js/sfx.js`. | great fit |
| Loose Parts Collage | Drag leaves/buttons/yarn pieces onto a canvas to arrange. Reuse `assets/twemoji/`. | great fit |
| Instrument Detective | Hear a shaker/drum/bell/chime and tap which instrument it is. Reuse `js/sfx.js`. | great fit |
| Big Paper Murals | Best as real collaborative floor drawing; a shared canvas is a weak stand-in. | grown-up led, off-screen |
| Pattern Bracelet Band | String beads into a repeating pattern to "wear." Reuse `js/sfx.js`; bead art (shares logic with Pattern Train). | great fit |
| Shape-to-Picture Challenge | Start from a circle; add strokes to turn it into an animal or object. Canvas; `js/speech.js`. | great fit |
| Song Story Remix | Swap words in a familiar tune ("Twinkle") and hear it sung back. Reuse `js/speech.js`, `js/sfx.js`. | adaptable |

## Movement & Outdoor Learning

| Idea | Digital adaptation | Fit |
|---|---|---|
| Balance Beam Trail | Real balance work; tablet can demo and cheer. | grown-up led, off-screen (coach mode candidate) |
| Animal Walk Cards | Tablet shows and names a move (bear crawl, frog jump); child does it in the room. Reuse `assets/twemoji/`, `js/speech.js`. | grown-up led, off-screen (coach mode candidate) |
| Nature Scavenger Hunt | A tap-off checklist (smooth, green, round, tiny) for a real outdoor hunt. Reuse `assets/twemoji/`. | grown-up led, off-screen (coach mode candidate) |
| Throwing Target Garden | Real beanbag toss; tablet keeps score and calls targets. | grown-up led, off-screen (coach mode candidate) |
| Obstacle Course Builder | Tablet deals a sequence of move cards (crawl, hop, carry) to build a real course. Reuse `assets/twemoji/`. | grown-up led, off-screen (coach mode candidate) |
| Line-Walking Challenge | Real slow-walking practice; tablet plays calm pacing music. | grown-up led, off-screen |
| Trail Counting Walk | Tally counter for stairs/birds/pinecones on a real walk. Reuse `js/speech.js`. | grown-up led, off-screen (coach mode candidate) |
| Shadow Chase | Real shadow observation; tablet can journal photos across the day. | grown-up led, off-screen (coach mode candidate) |
| Garden Delivery Game | Real carry-water task; tablet times it. | grown-up led, off-screen |
| Freeze-and-Focus Dance | Music plays and stops; child freezes — the tablet is the DJ/caller. Reuse `js/sfx.js`, `audio/celebrate/`. | great fit |

## Social-Emotional & Self-Regulation

| Idea | Digital adaptation | Fit |
|---|---|---|
| Grace-and-Courtesy Theater | Tap-through scenarios (greeting, asking, waiting) with a character modeling the polite move. Reuse `assets/twemoji/`, `js/speech.js`. | adaptable |
| **Feelings Charades** | See Up next — act out and match emotions. | great fit |
| Calm Corner Cards | Tap a calming tool (breathe, squeeze, draw, rest) and the tablet guides it — e.g. a breathing pacer. Reuse `js/sfx.js`, `js/speech.js`. | great fit |
| Turn-Taking Tower | Two players add one block each per turn on a shared 3D tower. Reuse `vendor/` three.js. | great fit |
| Waiting Muscle Game | A treasure appears; a countdown asks the child to wait before tapping — builds impulse control. Reuse `js/sfx.js`, `audio/celebrate/`. | great fit |
| Problem-Solving Puppets | Puppets act out a conflict, then pause; child taps a "repair" choice. Reuse `assets/twemoji/`, `js/speech.js`. | great fit |
| Plan-Do-Review Board | Choose a task icon, do it, then tap a reflection face — a simple routine board. Reuse `assets/twemoji/`, `js/speech.js`. | adaptable |
| Kindness Delivery | Make a quick drawing/note on canvas to "deliver" to someone. Canvas + `js/speech.js`. | adaptable |
| Red Light, Green Light | On-screen light flips green/red; child moves/freezes (with a real-body movement mode). Reuse `js/sfx.js`. | great fit |
| Board Game Reset Ritual | A tiny cooperative board game with a built-in "clean up together" ending. Reuse `assets/twemoji/`, `js/sfx.js`. | adaptable |
