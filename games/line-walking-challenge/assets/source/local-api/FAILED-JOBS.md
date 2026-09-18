# Local Studio generation attempts — 2026-09-18

Private LAN hostnames and addresses are intentionally omitted. No failed or
unverified output from these attempts is present in runtime assets.

## Krea 2 menu tile

- Studio job `80a6eacd26fb`
- Workflow: `krea2-turbo-t2i`, template `menu-game-tile`, seed 42,
  768×640, Toy menu grammar
- Remote job: `676ecd85c6ca4205925335d67893986c`
- Result: failed while retrieving the upstream result (`404 Not Found`)
- Direct helper retries: seeds 42 and 1337; both returned `Krea job failed`
- Resolution: ship the separately authored GPT Image 2 hub tile fallback.

## Qwen 3 TTS voice clone

Studio template jobs used seed 7 and the shared teacher voice reference:

| Line | Studio job | Result |
|---|---|---|
| `intro` | `554da5d54e8c` | HTTP 500 |
| `choose` | `1c05c28c9db7` | HTTP 500 |
| `forest-name` | `dbb52a477dc8` | HTTP 500 |
| `river-name` | `44fc2127fcc1` | HTTP 500 |
| `start` | `cc83025a8787` | HTTP 500 |
| `return` | `3c73241a79f9` | HTTP 500 |
| `steady` | `2ecb9c5fa07a` | HTTP 500 |
| `bloom` | `3b0eae0f5082` | HTTP 500 |
| `complete` | `059f3fdfff16` | HTTP 500 |

The direct batch helper then tried every committed line with seeds 7, 8, and 9.
No response passed the minimum audio-container size check. Whisper STT was
therefore correctly skipped: transcript QA cannot approve a missing or invalid
audio candidate. `assets/audio/manifest.json` remains empty and the shipped
voice layer falls back to the exact text in `assets/audio/lines.json`.

Re-run later with:

```powershell
python games/line-walking-challenge/tools/generate-hub-tile.py --force --seed 42
python games/line-walking-challenge/tools/generate-voice.py --force
```
