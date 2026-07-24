# tools/pipeline — GenAI content pipeline drivers

Repo-local, parameterized drivers for the offline content pipeline (QLOBE Studio
v2 spec §3.5 / §11). These are the **keepers** ported from the retired
`tools/content-pipeline/` (predecessor-repo scripts), with every hard-coded path
and the model host turned into arguments.

## The model host is never committed

Every generator takes the ComfyUI wrapper base URL from `--api-url`, defaulting to
the `QLOBE_QWEN_URL` environment variable. **No LAN host or IP appears in this
directory** (it is a public repo). The repo/content root comes from `--root`
(default: current directory). Run with `--dry-run` to preview planned work with
**zero network calls** and no host required. Without `--dry-run` and without a
host, a generator exits with a clear error.

```
export QLOBE_QWEN_URL=http://YOUR-MODEL-HOST:8100   # never committed
python3 tools/pipeline/gen_images.py --root . --words-json content/words.json
python3 tools/pipeline/gen_images.py --dry-run       # preview, no host, no calls
```

## The canonical lifecycle (spec §3.5)

```
brief (game-design.md art list + verbatim voice script)
 → generate  (batched by workflow type; image seed ladder 42 → 1337 → 9001 → 7)
 → stage     (raw/ outside the public repo)
 → extract   (qwen-image-layered, layer_2 = subject alpha)
 → QA        (images: alpha histogram + magenta composite; voice: whisper transcript diff)
 → finalize  (deterministic bbox-crop / resize / fixed-canvas normalize scripts)
 → finals    (games/<id>/assets/… or shared/assets/…, compact webp/png/m4a)
 → manifests (audio manifest.json with _v cache-bust; packs)
 → validate  (tools/validate/run.mjs)
 → register  (game.json + games.json entry / status flip)
```

The single-queue model-swap constraint (interleaving workflow types craters
throughput ~25×) is handled by the authoring server's job scheduler (spec §10);
these standalone drivers each drive one workflow type, so they are naturally
batched when run one script at a time.

## Tools

| Tool | Workflow | Preserves |
|---|---|---|
| `gen_images.py` | `qwen-image-edit` (tile + object recipes) | seed ladder `[42,1337,9001,7]`, skip-existing, blank-white rejection (grayscale stddev < 6), min-size check, per-seed retry |
| `gen_audio.py` | `qwen3-tts-voiceclone` | seed ladder `[7,8,9]`, skip-existing, duration bounds `0.2 < dur < 9 s`, FLAC→m4a via ffmpeg |
| `gen_kokoro_rimes.py` | `geeky-kokoro-tts` (`use_phonemes=true`) | the IPA phoneme map (phoneme-exact "correct pronunciation" refs), skip-existing, size validation |
| `gen_clone_candidates.py` | `chatterbox-v2v` + `whisper-stt` QA | A/B teacher-voice clone candidates (source = phoneme-exact Kokoro clip), per-candidate whisper transcript QA, loudnorm |
| `analyze_rimes.py` | *(no model)* — acoustic QA | F1/F2 onset-vowel extraction, per-speaker normalized vowel-space classification, deviation ranking for A/B triage |

`gen_clone_candidates.py` + `analyze_rimes.py` are the **A/B QA recipe**:
generate teacher-voiced rime candidates, then acoustically rank which rimes drift
from the reference vowel so a human checks those first (the ear is the decider).

## Optional-dependency tool

`analyze_rimes.py` needs `numpy` + `praat-parselmouth` (NOT stdlib, NOT a server
dependency). Run it from its own venv:

```
python3 -m venv venv && ./venv/bin/pip install numpy praat-parselmouth
./venv/bin/python tools/pipeline/analyze_rimes.py --root .
```

`--help` works even when those packages are absent (imports are guarded). This
mirrors `tools/lipsync/whisper-visemes.py`: an optional venv tool the pipeline
calls, never a dependency of the stdlib-only authoring server.

## Every tool

```
python3 tools/pipeline/<tool>.py --help
```

for the full argument surface. All generators support `--dry-run`.
