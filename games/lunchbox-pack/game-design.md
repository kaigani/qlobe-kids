# Lunchbox Pack — Game Design

**Category:** Practical Life & Independence
**Age target:** 5–6 (playable at 4)
**Concept video / screens:** `00-reference/lunchbox pack concept/` (gameplay + splash, outside repo)

## Premise

Kid characters line up with empty lunch boxes. You pack each one what they ask
for. The characters are the heart of the game: each has a name, a face, and
favorite foods, so their requests feel personal ("Maya loves red things") and
kids learn the cast across replays. The cast lives in `shared/characters/` and
may appear in other games.

## Learning goals

1. Follow spoken 1–3 step instructions (listening comprehension)
2. Sort foods into groups: fruit, veggie, main, drink, treat
3. Recognize attributes: colors, "crunchy"
4. Count 1–5 while packing
5. Practical independence: what goes in a balanced lunch

## Modes

### 1. Pack for Me! (`pack`)
A character arrives (voice intro), then asks for **3 things**, one at a time:
a specific food ("Can you pack the apple?"), a category ("Can you pack a
veggie?"), or an attribute ("Can you find something red?"). Requests are
weighted toward the character's favorites. Each request also appears as a
picture chip (hear it, see it). Drag the food from the shelf into the open
lunch box. 3 correct → close the lid → cheer → next character.
**One skill:** listening & following instructions.

### 2. Healthy Helper (`healthy`)
Build a balanced box: **one fruit, one veggie, one main, one drink**, then
**one little treat**. A 5-slot meter shows the groups as icons and fills as
you pack (the concept screen's progress bar). Any food of the right group
counts — free choice inside structure.
**One skill:** food groups / healthy choices.

### 3. Count & Pack (`count`)
"Can you pack **three** of these?" (food shown as a picture chip). Tap-drag
the same food repeatedly; the game counts aloud with each drop ("One! Two!
Three!"). 2 rounds per box, quantities 2–5.
**One skill:** counting 1–5 with one-to-one correspondence.

## Cast (shared/characters/)

| id | name | look | favorites |
|---|---|---|---|
| maya | Maya | brown skin, curly hair, red bow, yellow tee | fruit, red |
| leo | Leo | ginger hair, freckles, green stripes | crunchy, mains |
| nia | Nia | dark skin, braids & beads, glasses, purple overalls | veggies, green, purple |
| sam | Sam | tan skin, spiky black hair, blue hoodie | drinks, orange |

Characters are narrated by the platform teacher voice in v1; distinct
character voices are a future upgrade (voice-design per character).

## Interaction model

Drag (pointer events, works with touch/mouse), with **tap-tap as fallback**:
tap a food, then tap the lunch box — same result, easier for some kids.
Targets ≥ 96px. Tap the character or a request chip to hear the request again.

## Feedback model (no harsh failure)

- Correct: pop + sparkle SFX, food lands in a compartment, "Yummy!" variants.
- Not-what-was-asked: food wiggles and glides back to the shelf; gentle voice
  "Hmm, not that one today. Try again!" Nothing is ever lost or punished.
- Round end: "Tap the lid!" → lid closes over the box, confetti burst, star
  on the progress row, next character slides in.
- Session: 3 boxes ≈ 3–5 minutes, then a "big cheer" screen; free replay.

## Difficulty progression

- Round 1 requests favor specific foods (easiest: match the picture).
- Later rounds favor categories/attributes (harder: reason about properties).
- Count mode ramps 2 → 5.
- Healthy mode is self-paced; the meter scaffolds the structure.

## Replay variation

Random character order, randomized requests weighted by favorites, food shelf
reshuffled each box. 18 foods × 4 characters × 3 request types keeps rounds
fresh.

## Movement prompt

After each closed lid: "Munch munch! Can you take a big pretend bite?"

## Shared assets used

`shared/assets/foods/` (NEW library seeded by this game: 18 transparent food
PNGs in the platform object style), `shared/characters/` (the cast art),
`shared/js/sfx.js`, `shared/js/speech.js` (fallback), `shared/fonts/`,
`shared/assets/ui/` (home/sound buttons). Game-local: lunchbox art, kitchen
background, splash, recorded voice clips (57, cloned platform teacher voice,
manifest-driven).
