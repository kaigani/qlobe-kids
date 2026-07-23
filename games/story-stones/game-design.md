# Story Stones — Mini GDD

**Audience:** ages 3–7 · **Engine:** custom PixiJS unordered story library.

The child chooses three different illustrated stones in any mix of characters
and objects. The tray is deliberately unordered: the same group always resolves
to the same complete story, stable cast order, and setting however it was tapped
or dragged. Tapping a selected stone removes it.

The launch library contains five whole-image pose actors (dragon, orange cat,
white cat, friendly monster, owl) and seven magical objects (croissant, rose,
magic rock, treasure chest, golden key, magic bag, wishing star). Every one of
the 220 three-stone sets has its own beginning, complication, resolution, and
unique illustrated setting. All 1,320 input permutations resolve to those same
220 stories, with no wrong answers or compatibility dead ends. Object-only sets
let the three magical objects drive the action without adding an unseen hero.

Each 25–35 second result uses three recorded teacher-narrator clips and three
acted phases. Back returns to the tray with the same group for editing. After
the resolution, one clear **Choose Another Story** action returns to a completely
empty tray. Runtime is completely static; no model or authoring API is called by
the shipping game.
