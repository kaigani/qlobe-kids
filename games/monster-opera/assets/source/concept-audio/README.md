# Provisional concept-video sample cuts

These eight cuts are an offline audition set created by
`tools/extract-concept-samples.sh`. They prove the runtime sampling and musical
scheduler without waiting on a generation service.

They are **not accepted production masters**. Each Dreamina MP4 contains only a
single lossy stereo mix, so the cuts may contain accompaniment or UI texture.
The intended production replacement is the dry MiniMax H3 set described by
`tools/video-jobs.jsonl`; when accepted, H3 derivatives replace the runtime
files at `assets/audio/monsters/<id>.mp3` without changing game code.

Update (2026-08-18): all eight H3 references were generated under explicit LAN
upload authorization, their extracted candidates passed the automated audio
gate, and LAN Whisper QA completed. The candidates remain in
`assets/source/audio-h3/` pending a human isolation listen; runtime promotion
has not occurred.

| id | concept source | start | duration |
| --- | --- | ---: | ---: |
| mint | twelve-singer animation (`3309`) | 3.80s | 1.25s |
| pink | six-singer animation (`1377`) | 1.35s | 1.45s |
| blue | six-singer animation (`1377`) | 4.14s | 0.92s |
| purple | twelve-singer animation (`3309`) | 5.85s | 1.25s |
| orange | six-singer animation (`1377`) | 5.64s | 1.16s |
| yellow | twelve-singer animation (`3309`) | 7.90s | 1.20s |
| teal | six-singer animation (`1377`) | 7.10s | 1.45s |
| coral | tablet-demo animation (`2003`) | 5.75s | 1.10s |

Processing is deterministic: stereo-to-mono average, 90 Hz high-pass, 8.5 kHz
low-pass, 18/35 ms fades, EBU loudness normalization to −20 LUFS / −2 dBTP,
44.1 kHz WAV master, then mono 96 kb/s MP3 runtime derivative.
