# Game Design Document — Letter Treasure Hunt

## Game title

**Well Done! Phonics Treasure Island — Letter Treasure Hunt**

## Audience and art world

Toddlers and preschoolers, ages 2–5, playing on a tablet in landscape. The
runtime follows the Globe Spin Stories composition pattern: every screen is a
fixed full-viewport layer, a full-bleed raster scene owns the world, and
reviewed UI visuals (letters, banners, prompts, badges, controls, and buttons)
are raster assets over semantic HTML controls. Hidden DOM copy remains for
touch, accessibility, testing, and localization; it is not the visible art.

The visual system is premium tactile papercraft: layered construction paper,
deckled edges, visible fibers, stitched waves, and soft miniature shadows.

## Learning goal

Connect an uppercase letter to three familiar words that begin with it, using
an initial sound cue where the pictured words genuinely share that sound.

## Core loop

1. **Choose a Letter Quest:** use the left/right arrows to page through a sea
   map of three small letter islands. Every visible island is a direct launch
   target; tapping one opens that letter's quest immediately. The center island
   is the selected letter; the window wraps from A to Z and covers all 26
   data-driven quests.
2. **Find things that start with the letter:** the selected island opens a
   spatial hunt. All A–Z islands use reviewed layered papercraft backgrounds
   and independently positioned raster objects. D–Z positions come from the
   versioned `data/dz-scene-layouts.json` authoring document. Every island includes one raster object from a
   different letter and a visible treasure-chest decoy. A wrong object names
   the letter contrast without advancing progress. The target badge, prompt,
   and three progress tokens remain in the live UI layer.
3. **Collect letter tokens:** each correct find plays pop/sparkle feedback,
   speaks the word, and fills one token. Finds work in any order.
4. **Well Done:** an open treasure chest and three filled tokens celebrate the
  island. NEXT advances the carousel one letter for another short loop.

## Screen and interaction contract

- Carousel: home, sound control in the upper-right, previous/next arrows, and
  three large previous/selected/next map islands. There is no PLAY button or
  grown-up/parental control on this screen.
- Hunt: back, target-letter badge, prompt, three progress tokens, visible count,
  pause, sound, three large spatial target areas, one cross-letter wrong object,
  and one chest decoy on every A–Z island. Collected targets disappear into the
  raster progress tokens rather than using CSS-drawn imagery.
- End: back, sound, celebration copy, three filled letter tokens, score, and
  NEXT.
- Navigation and UI controls use the shared `onTap` press path and retain a
  minimum 96px target floor. D–Z scene choices use tight visible-art bounds
  with a 10px invisible tap halo, avoiding oversized empty interaction zones.
- Audio unlocks through `shared/js/audio-unlock.js`. The authored inventory has
  234 A–Z lines: island, hunt, idle, three finds, chest, cross-letter contrast,
  and completion for every letter. All 234 lines have recorded local
  Qwen3-TTS teacher-voice clips with complete manifest and Whisper
  coverage; Web Speech is retained only as a runtime recovery fallback. Human
  phoneme review remains the audio acceptance gate. I/O/U/X and
  S-shell use truthful letter-based copy instead of a misleading single-sound
  claim. Synthesized SFX provide pop, sparkle, tick, and tada.
- `window.QLOBE_DEBUG` exposes the 26 carousel modes, `startMode`, `getState`,
  `getTargets`, `tap`, `winRound`, `mute`, `fastTimers`, and `home` for QA.
- Reduced motion is respected in CSS. Portrait orientation receives a clear
  full-screen landscape guidance card because the scene plates are composed
  for a 4:3 tablet canvas.

## Content map

| Letter range | Example island targets |
|---|---|
| A–F | ant/apple/alligator · butterfly/ball/boat · cat/cupcake/car · dog/drum/duck · elephant/egg/envelope · fish/flower/frog |
| G–L | goat/grapes/guitar · hat/horse/house · ice cream/igloo/insect · jacket/jellyfish/juice · kite/key/kangaroo · lion/leaf/lemon |
| M–R | monkey/moon/muffin · nest/noodles/nose · owl/orange/octopus · penguin/pineapple/pizza · queen/quilt/quail · rabbit/rainbow/robot |
| S–Z | sun/starfish/shell · tiger/turtle/train · umbrella/unicorn/ukulele · violin/volcano/van · whale/watermelon/wagon · xylophone/x-ray/X mark · yak/yo-yo/yarn · zebra/zipper/zucchini |

## Verification gate

Run the game-local QA driver with a real Chrome session after starting the
static server from `qlobe-kids/`:

```sh
python3 -m http.server 8000
QLOBE_REQUIRE_RECORDED_AUDIO=1 node games/letter-treasure-hunt/tools/qa.mjs
```

The expanded browser gate covers all 26 scene records and representative
D/I/S/X/Z end-to-end play, including loaded raster assets, two wrong choices,
non-overlapping visible-art targets with verified tap halos, found markers, pause focus isolation, completion,
navigation cancellation, and browser errors. Recorded-manifest coverage and
human phoneme review remain the separate audio acceptance gates.
