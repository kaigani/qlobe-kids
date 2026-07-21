# My Puppet Band — game design

**One skill:** joyful ensemble music-making — hearing how instruments sound
alone and together, with zero wrong answers.

**Design brief:** `260613 QLOBE concepts/my-puppet-band/brief.md` (music
sandbox: pick puppet performers, assign instruments, stage a rainbow concert).
Lessons carried from Problem-Solving Puppets' playtest: interactive within
seconds, one-press-path everywhere, big grounded puppets, recorded narrator.

## The loop

1. **Tap to Play** — title over the rainbow stage, two live mascot greeters
   waving. One tap in.
2. **Build your band (~seconds to first sound)** — grid of all 8 rigged
   puppets. Tap a friend → they join the band (pop + a preview note from
   their instrument). Tap the instrument badge on any tile → cycles to the
   next free instrument and plays its note. 2 friends is enough to start
   (cap 5); "Play Show!" arms with a narrator prompt.
3. **Rainbow concert** — the band stands big on stage (feet on the floor of
   each song's own backdrop) playing a real song. Every song declares a LEAD
   family (keys / wind / strings / percussion): the melody goes to one
   matching instrument, the rest take bass and chord pads, so the same band
   sounds piano-led on one song and drum-driven on another — octave-folded so
   ANY combination stays musical. Each instrument family has its own
   performance animation (strumming, drumming, blowing, key-tapping,
   shaking). **Tap any puppet → a beat-quantized solo riff** (the band lays
   out). **Tap a stool → that puppet sits and nods while their part goes
   quiet** — musical segments toggle on and off. A carousel of all 8 friends
   runs along the bottom: tap to add, remove, or (when full) randomly swap
   members WHILE the music keeps playing. Next-song cycles the set list.

No fail states, no score. It is an instrument.

## The set list (all originals, hand-authored note data in config.js)

- **Rainbow Jam** — upbeat pentatonic singalong loop (104bpm)
- **Bubble Pop** — bright pop with a pumping bass (112bpm)
- **Sleepy Cat Swing** — lazy swing with a walking bass (96bpm)
- **Dino Stomp** — stomping rock riff (120bpm)
- **Teddy Bear Parade** — proud oom-pah march with a parade fill (108bpm)
- **Cloud Waltz** — gentle 3/4 twirl, bass-chord-chord (90bpm)
- **Robot Disco** — octave-pumping funk with offbeat stabs (116bpm)
- **Lullaby Moon** — slow, soft wind-down with long tones (72bpm)
- **Seoul Sparkle** — K-Pop brightness with the classic borrowed bVI→bVII lift (124bpm)
- **Gamelan Garden** — Indonesian-style interlocking eighths in parallel fourths over a gong cycle (100bpm)
- **Desert Caravan** — hijaz mode with its augmented-second snake and a drone that rubs against an F cluster (108bpm)
- **Samba Sunshine** — Brazilian groove on rootless maj7/m7 voicings with anticipated bass (116bpm)

## Audio tech

`shared/js/music.js` + `shared/assets/instruments/` (12 real instrument
samples, one sustained note each for tonal instruments, hit pairs for
percussion — user-supplied recordings). Notes are pitch-shifted from each
sample's measured base pitch via WebAudio playbackRate, scheduled by a
lookahead scheduler, and octave-folded into each instrument's register.
Solos quantize to the next beat so they always land in time.

## Playtest checklist

- First sound within seconds of "Tap to Play" (join notes on the build grid).
- Any 2–5 band mix sounds musical on all four songs.
- Solos: tap response feels immediate (quantization ≤ one beat).
- Instrument swap is tap-only; every target ≥96px.
- Reduced motion: puppets stand still, the music is unaffected.
