# Cooking Craze tools

## Acceptance QA

Serve the repository root, then run:

```sh
node games/cooking-craze/tools/qa.mjs --base http://127.0.0.1:8000
```

The driver uses the shared real-Chrome harness. It safely fulfils the platform analytics URLs inside the browser context so local QA exports no page metadata. Screenshots default to `/private/tmp/qlobe-cooking-craze-shots/`; pass the shared harness screenshot option when a different temporary destination is needed.

The suite launches from the QLOBE hub; exercises Build and Sauce Swirl with real pointer sauce; completes Build and Quick Bake end-to-end by keyboard, including sauce, toppings, slots, and peel; audits reduced-motion portrait, compact portrait end, and the scrollable 568×320 ingredient rail; verifies the complete audio package and a real corrected prompt start; and fails on page errors, request failures, unexpected remote requests, invalid sauce cells, undersized primary targets, unreachable targets, or document overflow.

## Visual authoring

Final GPT Image 2 sources, prompt recipes, accepted/rejected notes, and chroma-finalization parameters are in `../assets/source/gpt-image-2/README.md` and `../ASSETS.md`.

## Voice corrections

Use QLOBE Studio’s generic `generate-voice` job with the existing media id, updated text, seed 7, and top-level `overwrite: true`. Each job runs local Qwen3-TTS VoiceClone, M4A encoding, and Whisper QA. Review and accept the staged result in `shared/media/<media-id>/`, then promote its M4A to `../assets/audio/voice-clips/<key>.m4a` and update `config.json`, `lines.json`, and the single matching manifest entry together.

There is intentionally no game-specific generator script. The Studio server reads the LAN URL and teacher reference from git-ignored local state; never hard-code either value into this game.
