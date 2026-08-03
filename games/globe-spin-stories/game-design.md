# Globe Spin Stories — production game design

**Category:** culture-geography · **Ages:** 5–6 · **Status:** beta until a child playtest

**Art direction:** Papercraft — torn paper, stitched cloth, layered card, visible fibres and soft tabletop shadows

**Concept:** `01-game-concepts/globe-spin-stories/brief.md` and its three 4:3 mockups
**Replaces:** the emoji `observe-journal` prototype at this same id and route

## Product promise

> A globe that feels like a handmade toy is waiting under your finger. Give it a spin, follow a glowing paper pin, and it opens into a pop-up book about one faraway habitat. Every place leaves a stamp in your little passport.

The production build must make three promises true:

1. The globe is genuinely manipulable: drag, flick, inertia, broad snap zones, keyboard support, and a one-tap assisted spin all operate the same globe state.
2. Every destination becomes a distinct authored pop-up book, not a generic card with swapped text.
3. A child who does not read can complete the loop from pictures, motion, touch, and spoken guidance.

There is one mode and one skill: **associate five broad world regions with a characteristic animal and habitat**. The game is discovery, not a map quiz; there is no wrong continent, score, timer, locked content, or stereotyped costume play.

## Session and screen map

```text
SPLASH --play--> GLOBE --land--> STORYBOOK --stamp--> GLOBE
   ^                |                         |          |
   |                +--passport overlay------+          +--after 5--> END
   +--------------------------- back --------------------+

SPLASH home --> catalog (the only page navigation)
GLOBE / STORYBOOK / END back --> SPLASH
```

- **Splash (3–8 s):** authored title lockup, slow paper-cloud drift, one large play button. Home is present only here.
- **Globe (10–45 s):** the narrator names the next destination. Drag/flick spins freely. The destination pin projects from accurate land geometry and grows when it approaches the front. Releasing near it magnetically snaps. The large spin control gives the globe a playful throw and then guides it to the same destination, so motor precision never blocks play.
- **Storybook (20–50 s):** the book opens. The animal, habitat, and “wonder” discovery buttons pulse one at a time. Each touch speaks a short factual line and fills one paper star. After all three, the passport stamp becomes available.
- **Passport (optional overlay):** five stamped slots persist in `localStorage`; reset is an adult-sized, two-step action in the overlay and never part of core play.
- **End (10–30 s):** all five stamps orbit the closed passport. “Spin again” returns to the globe with a new seeded order; back returns to splash.

One destination is approximately 30–75 seconds. Five form a 3–6 minute session.

## Five destinations and full spoken script

All functional copy stays HTML. Every quoted line is present in `data/lines.json`; recorded clips may replace Web Speech without changing code.

### Global lines

- `welcome`: “Ready, world traveler? Spin the globe and see where our story lands!”
- `drag-help`: “Swipe the globe, or tap the big spin button.”
- `closer`: “You’re getting close. Follow the glowing pin.”
- `landed`: “We found it! Tap the glowing pin to open the storybook.”
- `passport-open`: “Here is your world passport. Every place you visit gets a stamp.”
- `page-complete`: “You discovered the whole page. Stamp your passport!”
- `all-complete`: “Five wonderful places! Our big world is full of animals, homes, and stories.”
- `replay`: “Let’s spin around the world again.”

### Asia — giant panda in a bamboo forest

- Prompt: “Spin to Asia, the biggest continent.”
- Landing: “Welcome to Asia. Let’s open a bamboo forest story.”
- Animal: “Giant pandas use strong jaws to munch crunchy bamboo.”
- Habitat: “Bamboo forests give pandas food, shade, and places to climb.”
- Wonder: “A panda can spend much of its day eating bamboo.”
- Stamp: “Asia stamp collected!”

### Africa — African elephant on a savanna

- Prompt: “Spin to Africa, where the savanna stretches wide.”
- Landing: “Welcome to Africa. Let’s open a sunny savanna story.”
- Animal: “African elephants use their trunks to breathe, drink, and pick things up.”
- Habitat: “Savannas are wide grasslands with scattered trees.”
- Wonder: “Elephant families travel together and help care for their calves.”
- Stamp: “Africa stamp collected!”

### Australia — koala in eucalyptus woodland

- Prompt: “Spin to Australia, a continent surrounded by ocean.”
- Landing: “Welcome to Australia. Let’s open a eucalyptus woodland story.”
- Animal: “Koalas grip branches with strong paws and sharp claws.”
- Habitat: “Eucalyptus trees give koalas both food and a place to rest.”
- Wonder: “Koalas sleep for many hours so their bodies can save energy.”
- Stamp: “Australia stamp collected!”

### North America — brown bear in a mountain forest

- Prompt: “Spin to North America, between the Atlantic and Pacific oceans.”
- Landing: “Welcome to North America. Let’s open a mountain forest story.”
- Animal: “Brown bears have an excellent sense of smell.”
- Habitat: “Mountain forests can offer bears berries, roots, rivers, and shelter.”
- Wonder: “Many brown bears rest in dens through the coldest part of winter.”
- Stamp: “North America stamp collected!”

### South America — toucan in a rainforest

- Prompt: “Spin to South America, home to the great Amazon rainforest.”
- Landing: “Welcome to South America. Let’s open a rainforest story.”
- Animal: “A toucan uses its long, light beak to reach fruit on slender branches.”
- Habitat: “Rainforests are warm, wet, and layered with plant life.”
- Wonder: “Toucans toss fruit into the air and catch it in their beaks.”
- Stamp: “South America stamp collected!”

## Interaction and feedback rules

- Pointer input has one path. The globe captures a single primary pointer; `pointercancel`, `lostpointercapture`, `blur`, and screen exit all end the drag cleanly.
- Horizontal drag changes longitude; a smaller vertical component changes latitude within a safe ±38° tilt. Release velocity becomes damped inertia.
- Destination snap tolerance is intentionally broad. Near alignment, the pin grows, a paper halo appears, and the globe eases the final distance. The child never has to hold a precise angle.
- The assisted spin button applies a visible full rotation before snapping, so it is an alternative gesture, not a fake scene cut.
- Book discoveries are large, overlapping 112 px minimum paper seals. Any order is valid. Re-tapping replays the fact.
- A non-interactive tap produces only a soft paper rustle; no red X, buzzer, score, or failure speech exists.
- The sound button repeats the current prompt or most recent fact.
- Idle help occurs at 12 and 26 seconds and stops after interaction.
- Reduced motion removes inertia, cloud drift, page flip depth, stamp orbit, and particle travel; state changes remain immediate and clear.

## Art inventory

| Asset | Size / renderer | Visible renderer | Interaction substrate |
| --- | --- | --- | --- |
| Splash title lockup | alpha WebP, target ≤150 KB | authored stitched navy ribbon with layered cream paper letters | accessible `<img>` inside splash |
| Globe | WebGL canvas | procedural paper ocean plus Natural Earth public-domain land geometry rendered as layered fibre-textured paper | reusable `paper-globe.js` drag, inertia, snap and pin projection |
| Globe surround | CSS + tiny paper texture | layered paper hills, clouds, stars and travel path; procedural is faithful because these are simple cut-paper silhouettes, not lesson objects | decorative DOM, pointer-events none |
| Five storybooks | 1600×1200 opaque WebP, target ≤300 KB each | GPT Image 2 papercraft pop-up spreads, no baked text or controls | responsive scene image with HTML discovery seals over measured hotspots |
| Discovery seals | one authored paper seal sprite reused with runtime pictograms | textured paper medallion | 112–144 px buttons positioned by config |
| Five stamps | CSS-masked paper ink stamps with exact HTML continent names | runtime ink + paper treatment; exact text must stay reliable | passport buttons / completion state |
| Passport | CSS paper/leather composition | layered paper object faithful to papercraft world | dialog with focus-safe controls |
| HUD | shared PNG Home/Back/Sound controls | platform interaction grammar | ≥96 px controls |
| Celebration | small paper stars/confetti | papercraft shapes, not emoji | DOM particle layer, reduced-motion aware |

Generation sources, exact prompts, processing, and licenses are recorded in `ASSETS.md`. Source generations stay in `assets/source/`.

## Responsive and accessibility contract

- Art space is 1600×1200. Scene images use cover-fit on landscape and contain-fit inside a paper surround on portrait.
- Landscape globe layout gives the globe 62–72% of width; the prompt cloud sits left. Portrait stacks prompt above globe and keeps the globe at least 58vw.
- Touch targets are at least 96×96 CSS px; discovery seals are at least 112×112.
- Every image has meaningful alt text, every control has an accessible name, keyboard focus is visible, and globe rotation also supports arrow keys plus Enter to land.
- No essential instruction is image text. Captions support adults but voice and motion carry the child path.
- Safe-area insets protect every HUD control. No remote runtime requests, accounts, analytics, camera, microphone, geolocation, accelerometer, or device permission.

## Persistence and privacy

Only `localStorage['qk-globe-spin-stories-v1']` is written. It contains a schema number, visited destination ids, and no name, voice, location, date, or device identifier. A two-step parent reset clears only that key. If storage is unavailable, the current session still works in memory.

## Architecture and reusable capability

- `shared/js/paper-globe.js` is the reusable platform capability: accurate land texture generation from compact GeoJSON, Three.js sphere lifecycle, drag/inertia, `latLonToVector3`, front-visibility projection, landmark pin DOM projection, snap/ease, resize, reduced motion, and full teardown.
- `games/globe-spin-stories/js/main.js` owns screens, itinerary, narration, passport state, book discoveries, and `QLOBE_DEBUG`.
- `config.json` owns destinations, coordinates, facts, scene assets, hotspots, tuning, and adult captions.
- Shared `tap.js`, `voice-clips.js`, `audio-unlock.js`, `sfx.js`, `screens.js`, `timers.js`, and `debug-harness.js` remain authoritative.

## QLOBE_DEBUG v1

The hook exposes the standard fields plus:

- `getState()` → screen, destination id, itinerary, globe lat/lon, dragging, aligned, discoveries, visited, passport open, reduced motion.
- `getTargets()` → visible tappable rects only.
- `startMode('world-tour')`, `tap(id)`, `home()`, `mute(on)`, `seed(n)`, `fastTimers(scale)`.
- `setGlobe(lat, lon)`, `alignDestination(id)`, `land()`, `discover(kind)`, `stamp()`, `openPassport()`, and `completeTour()`.
- `getAudioLog()` proves a line was requested and whether it used a clip or speech fallback.

## Explicit departures

- The stub’s imaginary habitat sticker journal is removed because it does not deliver the concept’s central 3D globe or continent learning.
- Costume try-on is deferred. A five-year-old geography game needs careful regional specificity; generic “continent costumes” easily become inaccurate stereotypes and distract from the single habitat-association skill.
- The five-stop session uses Asia, Africa, Australia, North America, and South America. Europe is reserved for an expansion so the release keeps the mockup’s five-stop length and maximizes immediately distinctive habitat scenes.
- Pins are broad assisted landing zones, not tiny map targets. The visual location remains accurate while motor precision does not gate success.
- Passport stamps are available from the start and record visits; nothing is “unlocked,” and there is no reward economy.
- Functional titles, facts, and button labels are HTML rather than model-rendered text. Only the splash title is generated brand art and must pass spelling QC.

## Release gate

- Every screen and branch runs without console errors or 404s in real Chrome.
- Globe drag, inertia, assisted spin, snap, pin projection, resize, cancel/blur, keyboard, and teardown pass automated probes.
- All five destinations complete end to end; fact buttons speak; stamps persist across reload and reset only through the parent action.
- Home/back routing, audio unlock/repeat, no hidden catalog link, ≥96 px targets, reduced motion, landscape (1024×768 and 1366×768), portrait (768×1024), and narrow phone fallback pass.
- Static checks verify exact config ids/coordinates, case-sensitive asset paths, no emoji placeholder art, local-only runtime, art budgets, and registry parity.
- Visual review separately approves layout, foreground material fidelity, title spelling, geographic recognizability, and all five generated storybooks at full size.
- Remains beta until a real child playtest; this task intentionally does not require iPad access.
