# Ari

- **Role:** guide (cave companion) — never a collectible. Ari hosts the search
  and cheers the find; the letters and their reveal objects are the content.
- **Personality:** warm, unhurried, a little conspiratorial (we're in a cave
  together). "Ooh… it's dark in here. Good thing we brought a flashlight!"
- **Visual design:** a warm brown cartoon armadillo with a pink snout, big
  round friendly eyes, pink-lined ears, a banded shell across his back and
  tail, cream belly. Bright, soft 3D toy-cartoon style with glossy highlights,
  matching QLOBE Kids' Storybook Rooms character rendering. Silhouette
  readable at 128px: rounded snout + banded shell profile.
- **Voice:** cloned via `qwen3-tts-voicedesign` from
  `shared/assets/refs/voice-teacher.wav` — warm and unhurried, a shade
  brighter and younger than the base teacher voice. Reference committed at
  `games/flashlight-cave/assets/audio/ref/ari.flac`.
- **Movement/animation:** rendered as a `qlobe-pose-actor` (DOM pose-actor,
  `js/actor.js`), not a bone rig. Six poses: `neutral` (calm, all four feet
  down, both front paws relaxed — arms-down was a deliberate design
  constraint, see below), `enter` (walking in, head turned to the viewer),
  `notice` (head tilted, one paw near his snout, ears perked), `interact`
  (upright, mouth open mid-sentence, one paw gesturing forward), `react`
  (gentle playful surprise, paws to chest, curled slightly into his shell —
  never scared), `celebrate` (upright, both paws thrown up, big open happy
  smile). Transitions are a 220ms "paper-pop" swap, no bone animation.
- **Appears in:** flashlight-cave
- **Art:** `portrait.png` (bust, transparent, 420×420). The full six-pose pack
  lives with the game at `games/flashlight-cave/assets/pose-actors/ari/`
  (`qlobe-pose-actor` v1 format) — the canonical neutral pose is what
  `portrait.png` is cropped from. Generated locally: the neutral was
  conditioned on the finished armadillo art in the game's own concept
  mockups (`01-game-concepts/flashlight-cave/output/ui-mockups/`, cropped
  first) via `qwen-image-edit`, redrawn calm; the other five poses were each
  derived from that neutral via `qwen-image-edit` so the character, palette
  and proportions hold across the set; cutouts via `qwen-image-layered`
  (async job flow). Full provenance in `games/flashlight-cave/ASSETS.md`.
  CC BY 4.0.
- **Design lesson carried forward:** the mockup reference has Ari mid-wave,
  one arm raised. A cheerful raised-arm reference bleeds its energy into
  every derived pose (they all inherit the "excited" read), so the neutral
  step explicitly redraws him calm — all four feet down, both front paws
  relaxed — before any other pose is derived from it. See
  `docs/polish-process.md` §3.
- **Status:** adopted
