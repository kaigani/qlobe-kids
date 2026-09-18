# Pouring Station Assets

All current art is emoji placeholder art rendered by the `coach-timer` engine on soft rounded cards. No image files, generated art, downloaded art, recorded clips, or network assets are used.

## Assets needed

Art:

- Pitcher: friendly toy-3D pitcher sized for a practical-life pouring setup.
- Two cups: two small kid-safe cups, clear enough to show the pour target.
- Water stream: gentle stream of water moving from pitcher to cup.
- Beans: dry beans for first-time pouring practice, visually distinct from water mode.
- Cloth: soft wiping cloth for cleanup and drips.

Voice lines:

- Let's practice slow, careful pouring.
- Careful hands. Nice work.
- You practiced every pouring step!
- You practiced water pouring from start to finish!
- Gather a pitcher and two cups.
- Fill the pitcher just a little.
- Pour slooowly into cup one.
- That was slow, careful pouring.
- Pour back the other way.
- You kept your hands steady.
- Wipe any drips. Wiping makes you a pouring pro.
- You practiced bean pouring from start to finish!
- Gather a pitcher and two cups for bean pouring.
- Fill one cup with a few dry beans.
- Beans are great for first-time pourers. Pour slowly and listen to the sound they make.
- Nice slow bean pouring.
- Pour the beans back the other way.
- You listened and poured with care.
- Scoop up any beans that spilled. Cleanup is part of the work.

## Link preview (og:image)

| Asset | Source | Creator | License | Attribution required | Modifications |
|---|---|---|---|---|---|
| `assets/og-image.jpg` | Generated screenshot of this game's own splash screen (1200×630), captured by `tools/pipeline/capture_og_images.mjs` | QLOBE Kids | CC BY 4.0 | No | Regenerate with the tool rather than editing by hand |


## Recorded voice clips (assets/audio/)

Recorded teacher-voice clips for every spoken line, in the platform's shared
warm-teacher voice (locally generated voice clone of the platform voice
reference; no cloud services). Each clip was QA'd by speech-to-text transcript
comparison against the authored line; `manifest.json` maps line keys to files
with measured durations, `lines.json` holds the transcript per key. Original
assets, CC BY 4.0. The engine falls back to Web Speech for any missing clip.
