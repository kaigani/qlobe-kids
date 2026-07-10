### Mini-GDD: Sound Basket (games/sound-basket/)
**Category:** reading-phonics · **Engine:** sort-into-bins · **splashEmoji:** 🧺
**Premise:** sort pictures by their FIRST SOUND into letter baskets. Reuses the
real platform art: bins are `shared:letter-tiles/<x>.png`, items are
`shared:objects/<word>.png` (check `shared/data/words.json` + ls the objects dir;
only use words whose PNG exists).
**Learning:** initial-sound isolation (core phonemic awareness).
**Modes:** 1. `two` "Two Baskets" (rounds 3, itemsPerRound 4): bin pairs per your
choice from onsets with rich word pools, e.g. b (bat,bed,bug,bun,bus) vs s
(sun,sock? use existing: sad? — verify) — pick 3 bin-pairs with 4+ existing words
each; item say = the word. 2. `three` "Three Baskets" (rounds 3, itemsPerRound 5):
three bins, e.g. c/m/p with their word pools.
**Assets needed:** none new for art; recorded word + letter-sound lines.
