# World Music Dance — game design (production rebuild, 2026-07-29)

**Concept source:** `01-game-concepts/world-music-dance-cards/` (brief + 3 mockups).
**Rebuild-in-place** of the registered `world-music-dance` beta slot (was an emoji
`choose-one` stub). Category `culture-geography`, ages 5–6.

## Product promise

*Dance around the world at a lantern-lit paper festival.* The child picks a
glowing lantern on a cut-paper night map, meets that country's dancer, hears its
music, copies its three signature moves, earns the dance card, and pins it home
on the map. Six cultures, six dances, six songs — a collection the child
completes and can always revisit.

**One skill per phase:** listening/moving to a beat (dance screen), visual
pose-matching (copy loop), and country location on a world map (placement).

## Art world

**Paper Garden — festival night variant.** Ink-blue cardstock night field
replaces the warm cream; cut-paper edges, visible fibres, layering, and
saturated kraft brights are unchanged (the variant accepted during the Sound
Painting production pass). Motif: strings of glowing golden paper lanterns.
Departure from category default (Field Journal) argued here: the game's fantasy
is *handmade dance cards pinned to a paper map at a night festival* — physical
cut-paper cards are the core object, which is Paper Garden's exact grammar, and
the game is as much art-music as geography. The stub already declared
paper-garden; we keep it and adopt the approved night plate.

## Screen map & navigation

```
splash (DOM)          home → ../../ (catalog). Title lockup + hero card + Dance button.
  └─ map / choose (Pixi)   back → splash. Cut-paper night world map, 6 lantern pins.
       └─ dance (Pixi)     back → map. listen phase → copy phase (step rail 1-2-3).
            └─ map / place back → map(choose), earned card banks to the dock.
                 └─ celebrate → auto-return to map(choose) (~5s, Again affordance)
```

Home lives ONLY on splash. Audio channels (`sfx`, `voice-clips`, `music`)
unlock on the first pointerdown; no recorded line plays before the first
gesture (splash intro line is deferred to the Dance-button tap).

## Core loop (45–90 s per culture)

1. **Choose** — map glows; `choose-prompt` invites a tap. Placed cultures show
   their stamped cards; unplaced show pulsing lanterns. Tap a lantern →
2. **Listen & watch** (~2 song loops) — `greet-<culture>` over the intro bar.
   The cut-paper dancer grooves (bob + sway from the beat clock) and swaps
   between its 3 signature poses on bar lines (paper-pop). Music is an authored
   WebAudio song — seamless loop, real beat clock.
3. **Copy the moves** (3 steps) — step rail fills 1-2-3. The dancer holds/
   repeats move N; `move-<culture>-N` names it in kid language; the child taps
   the matching pose card among 3 (pure visual match, always winnable).
   Wrong tap → wiggle + `nudge-copy` + re-demo; second wrong → correct card
   slow-glows (modeling, no lockout). 3/3 → the dance card composes itself and
   whooshes to the dock.
4. **Pin it home** — `map-prompt`; the target lantern pulses bright. Drag (or
   tap-card-then-tap-lantern) → within the pin radius: confetti burst, card
   shrinks to a placed stamp, `placed-cheer` + `fact-<culture>`. Miss → card
   glides home + `nudge-map`, pin brightens. Never punitive.
5. **Collection** — placed state persists (`localStorage`). All six placed →
   one-time `collection-complete` celebration; everything stays replayable.

## Cultures

| id | dance | accent | song (bpm, feel) | signature moves (kid names) |
|---|---|---|---|---|
| india | Kathak | `#e2793d` marigold | india-kathak — 92, kafi scale, drone bass, tabla | twirl-wheel · stamp-bells · lotus-wave |
| brazil | Samba | `#f5c518` sun gold | brazil-samba — 118, anticipated bass, partido-alto | bounce-feet · wide-sway · feather-spin |
| japan | Bon Odori | `#e8555f` coral red | japan-bon-odori — 100, miyako-bushi, taiko don/ka | moon-reach · clap-step · fan-sweep |
| ghana | Kpanlogo | `#f0b428` kente gold | ghana-kpanlogo — 112, lead:'perc', bell pattern | stomp-clap · row-low · arm-circles |
| mexico | Folklórico | `#e0509a` fuchsia | mexico-folklorico — 140, 3/4 with hemiola | skirt-swish · heel-taps · flower-twirl |
| ireland | Jig | `#4bb04f` shamrock | ireland-jig — 112, D dorian, triplet feel | hop-kick · toe-point · quick-feet |

Pose set per dancer: `neutral`, `move-1`, `move-2`, `move-3`, `celebrate`
(5 poses × 6 dancers = 30 pose images, qlobe-pose-actor packs).

## Architecture

Bespoke Stage v2 game (no archetype engine fits the flow). Modeled on
`games/red-green-light/js/game.js` (router/debug) + `games/story-stones/js/main.js`
(DOM + Pixi stage). One lazily-created Pixi stage; `setScene()` swaps map ↔
dance scenes; splash and HUD/step-rail are DOM.

- **New shared module** `shared/js/stage/pose-conductor.js` — reusable
  pose-actor ↔ music-sync bridge: puppet shim maps `setClipPhase` → groove bob
  (~10 px sine + ±1.5° sway); `bar` hook → `setPose(order[⌊bar/barsPerPose⌋ % n])`;
  `onLoop` → one bar of `celebrate`; `hold(pose)`/`release()` for the copy
  phase. Reduced motion: no bob/sway, instant pose swaps, no loop celebrate.
- Map drag via `shared/js/stage/drag-to-slot.js` (strand-proof, reproject on
  resize). Map art contain-fit, letterboxed on ink-blue — pins can never crop
  off in portrait. Drop radius `max(pinRadiusArt × mapScale, 120px)`.
- Music: `shared/js/music.js` (`playSong`/`songNow`), songs in `js/songs.js`
  (note data, my-puppet-band pattern). Per-culture `band` + `bandFallback` in
  `config.json`; `resolveBand()` filters against `music.instrumentIds()` so
  missing world-instrument samples degrade gracefully to the proven 12.
- Voice: `shared/js/voice-clips.js` with game-local manifest; Web Speech
  fallback per line. Collection in `localStorage` `qlobe:world-music-dance:v1`.

## Spoken script (verbatim, frozen for TTS)

Global — `intro` "Welcome to the world music festival! Pick a lantern on the
map, and let's dance around the world!" · `choose-prompt` "Where shall we
dance? Tap a glowing lantern on the map!" · `your-turn` "Now it's your turn!
Watch the dancer, and find the matching move!" · `copy-intro` "Can you copy the
dance? Watch closely!" · `map-prompt` "You earned the dance card! Drag it home
to its place on the map!" · `placed-cheer` "You did it! The card is home!" ·
`collection-complete` "Hooray! You danced all around the whole wide world!
What a festival!" · `again-prompt` "Tap another lantern to keep dancing!" ·
`nudge-copy` "Good try! Watch the dancer one more time, then tap the move that
matches." · `nudge-map` "Almost! Look for the glowing lantern, and drop the
card right there." · `nudge-idle` "Tap a card to keep the party going!" ·
`praise-1` "Yes! That's the move!" · `praise-2` "You found it! Beautiful
dancing!" · `praise-3` "Wonderful! You've got the rhythm!" · `praise-4`
"That's it! What a dancer you are!"

India — `greet-india` "Namaste! We're in India! This dance is called Kathak.
Hear the sitar sing — watch the dancer twirl!" · `fact-india` "In India, Kathak
dancers wear tiny bells on their ankles that jingle with every step!" ·
`move-india-1` "Twirl like a spinning wheel! Find the twirling move!" ·
`move-india-2` "Stamp, stamp, jingle the bells! Find the stamping move!" ·
`move-india-3` "Wave your arms like a swaying lotus! Find the waving move!"

Brazil — `greet-brazil` "Olá! Welcome to Brazil! It's carnival time — this
dance is the samba!" · `fact-brazil` "In Brazil, samba dancers parade through
the streets at carnival, with feathers as bright as parrots!" ·
`move-brazil-1` "Bounce with quick, happy feet! Find the bouncing move!" ·
`move-brazil-2` "Open your arms wide and sway! Find the swaying move!" ·
`move-brazil-3` "Spin and let the feathers fly! Find the spinning move!"

Japan — `greet-japan` "Konnichiwa! We're in Japan! At the summer festival,
everyone dances the Bon Odori!" · `fact-japan` "In Japan, people dance Bon
Odori in a big circle around a tower of drums, under paper lanterns!" ·
`move-japan-1` "Reach up high, like catching the moon! Find the reaching
move!" · `move-japan-2` "Clap, then take a little step! Find the clapping
move!" · `move-japan-3` "Sweep your fan through the air! Find the fan move!"

Ghana — `greet-ghana` "Akwaaba! Welcome to Ghana! Hear the drums? This dance
is called Kpanlogo!" · `fact-ghana` "In Ghana, drummers and dancers talk to
each other — the drum asks, and the dancer answers!" · `move-ghana-1` "Stomp
and clap with the big drum! Find the stomping move!" · `move-ghana-2` "Bend
your knees and row like a boat! Find the rowing move!" · `move-ghana-3` "Make
great big circles with your arms! Find the circling move!"

Mexico — `greet-mexico` "¡Hola! We're in Mexico! The trumpets are playing —
it's time for folklórico!" · `fact-mexico` "In Mexico, folklórico dancers
swish giant rainbow skirts that swirl like butterfly wings!" ·
`move-mexico-1` "Swish your skirt from side to side! Find the swishing move!" ·
`move-mexico-2` "Tap your heels, quick quick quick! Find the heel-tapping
move!" · `move-mexico-3` "Twirl till your skirt opens like a flower! Find the
twirling move!"

Ireland — `greet-ireland` "Hello from Ireland! The tin whistle is playing a
jig — quick, dancing feet!" · `fact-ireland` "In Irish dancing, your feet hop
and skip as fast as raindrops, but your arms stay very still!" ·
`move-ireland-1` "Hop and kick, light as a feather! Find the hopping move!" ·
`move-ireland-2` "Point your toe, tip tap tip! Find the toe-pointing move!" ·
`move-ireland-3` "Quick feet, then a little spin! Find the quick-feet move!"

(45 lines. TTS: qwen3-tts-voiceclone seeds 7→8→9, whisper-small QA; lines with
loanwords — Namaste, Olá, Konnichiwa, Akwaaba, folklórico, Kpanlogo, Bon Odori
— carry per-line accepted-transcript alternates in `tools/gen-voice.py`; a line
that never passes is omitted and falls back to Web Speech.)

## Art list

See `assets/source/PROMPTS.md` for verbatim prompts. Summary: night world map
2048×1280 ≤300 KB; festival stage bg 1600×1200 ≤300 KB; title lockup alpha
WebP ≤150 KB (spell-checked at full size); 6 dancer masters + 24 derives → 30
cutouts → 6 pose packs (WebP q90, 50–80 KB each, lazy-loaded per culture);
card backing 512×640 ≤60 KB; lantern pin 256×320 ≤40 KB (runtime-tinted per
accent). Dance/move cards and confetti are runtime composites (frame + pose
texture; `particles.js`) — zero extra bytes. Hub tile exists (hands-off).
First load < 1.5 MB; +~0.4 MB per selected culture.

## Interaction & feedback rules

- Touch targets ≥ 96 px (pins floor at 120 px on screen; move cards ≥ 120 px).
- Tap-tap parity for every drag; single active drag; pointercancel/blur safe.
- Gentle retry everywhere; no fail states, no locks, no timers.
- Idle re-prompt once per phase (`nudge-idle`).
- `prefers-reduced-motion`: no groove bob/sway, instant pose swaps, particles
  reduced to a soft glow.
- Portrait and landscape; map contain-fit; HUD in safe areas.

## Difficulty / replay

No difficulty ramp — variation is cultural breadth. Placed cultures stay
replayable (re-dance any card; placement is skipped if already placed, with a
short cheer instead). Move-card order shuffles per step (seeded RNG).

## Privacy / persistence / fallback

No accounts, no network at runtime, no microphone. `localStorage` only
(placed map). Missing voice clip → Web Speech; missing world-instrument
sample → `bandFallback`; missing pose art (dev) → pose-sprite falls back to
`neutral`.

## Departures from brief / mockups / stub

- Mockup's baked English labels ("India", "1 of 3") → spoken lines + iconic
  step-rail dots (pre-readers).
- Mockup's bright-yellow daytime style → Paper Garden festival night (house
  art-world rule; mockups are storyboard, not style spec).
- Stub's two quiz modes (choose-one) → one continuous festival loop; the
  stub's "where's that music?" listening skill survives inside the map-choose
  + greet moment; its movement vocabulary survives as the real copy-the-moves
  loop.
- Brief's "authentic regional instrumentals" → original authored songs in each
  culture's musical language (license-clean, seamless loops, beat clock drives
  the dancer — recorded audio cannot).

## Shared modules used / strengthened

Uses: stage, pose-sprite, music-sync, drag-to-slot, particles, tween, music,
voice-clips, sfx, speech, tap. **Adds** `shared/js/stage/pose-conductor.js`
(any future rhythm/dance game) and, if the experiment passes, world-instrument
one-shots in `shared/assets/instruments/` (any music game).

## QLOBE_DEBUG (v1 + extras)

Floor: `ready, listModes()` (cultures), `startMode(id), getState()`
(`{screen, culture, phase, step, placedCount, awaitingInput}`), truthful
`getTargets()` (wrong move cards, correct pin), `tap(id)` through real
handlers, `winRound(), mute(), seed(n)`. Extras: `fastTimers(scale),
getAudioLog(), getMusicStats()` (beat-sync proof), `getCollection(),
resetCollection(), placeCard(id), home()`.

## Risks & release gate

Risks (ranked): LTX one-shot sample quality (structural bandFallback — ships
either way) · pose identity drift (derive-from-approved-neutral only, contact
strips, seed ladder) · portrait map drag (contain-fit, 120 px floor, reproject)
· night readability (glow halos on every interactive, calm map centers,
dimmed-brightness screenshot check) · iPad beat-visual latency (config
`sync.latencyMs`, bar-boundary swaps forgive ±100 ms).

Gate: full smoke suite green locally and on qlo.be, screenshots visually
reviewed, zero new validator errors. Status stays `beta` until the real-iPad
child playtest passes.
