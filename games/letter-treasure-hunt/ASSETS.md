# Asset Log — Letter Treasure Hunt

| Asset | Source | License / note |
|---|---|---|
| `assets/papercraft/quest-map.webp` | Built-in gpt-image-2 workflow | Sea-map plate with three small blank islands for the previous, selected, and next letters in the scrolling A–Z menu. |
| `assets/papercraft/b-hunt/background.webp` | Built-in gpt-image-2 workflow | Runtime B hunt background layer. |
| `assets/papercraft/b-hunt/{butterfly,ball,boat,chest}.webp` | Built-in gpt-image-2 workflow | Runtime B hunt overlays: three matching targets plus the treasure-chest decoy, layered above the background. |
| `assets/papercraft/a-hunt/` and `assets/papercraft/c-hunt/` | Built-in imagegen workflow | Reviewed layered A and C hunt packages: opaque background plus three matching target overlays and a treasure-chest decoy. A/B/C reuse one another's transparent target layers as cross-letter wrong choices. |
| `assets/papercraft/{a,c}-celebration.webp` | Built-in imagegen workflow | Reviewed A and C open-chest completion scenes with their three target objects and confetti. |
| `assets/islands/{a-z}.webp` | Built-in gpt-image-2 workflow | Legacy full-bleed letter plates retained for provenance; D–Z no longer use these at runtime. |
| `assets/papercraft/{d-z}-hunt/` | Built-in imagegen workflow plus component-aware chroma extraction | Reviewed D–Z layered packages: one 4:3 background and three transparent target objects per letter. Cross-letter distractors and chests remain separate raster layers. |
| `data/dz-scene-layouts.json` | QLOBE local authoring data | Versioned 4:3 visible-alpha rectangles and immutable source-art trim metadata for every D–Z hunt/completion object. Edit through `Launch Layout Editor.command`; runtime validates each rectangle and retains built-in fallbacks. |
| `assets/papercraft/shared/open-chest.webp` | Built-in imagegen workflow plus chroma-key removal | Reusable transparent open-chest and confetti overlay for D–Z completion scenes. `open-chest-source.png` retains the generated source plate for provenance. |
| `assets/papercraft/island-hunt.webp` | Built-in gpt-image-2 workflow | Legacy/unused pre-layered B hunt plate retained for provenance; superseded by the runtime B layers above. |
| `assets/papercraft/decoy-chest.webp` | Built-in gpt-image-2 workflow | Legacy/unused generic decoy retained for provenance. |
| `assets/papercraft/island-celebration.webp` | Built-in gpt-image-2 workflow | Full-bleed open-chest celebration plate used by the runtime. |
| `assets/papercraft/celebration.webp` | Built-in gpt-image-2 workflow | Legacy/unused celebration plate retained for provenance; superseded by `island-celebration.webp`. |
| `assets/ui-raster/` | Built-in imagegen bases plus deterministic author-time raster compositing | Complete A–Z raster UI inventory: quest title, PLAY, controls, letters, prompts, pause/grown-up/orientation dialogs, OK control, badges, progress counts/tokens, feedback, NEXT, and per-letter completion art. Runtime uses bitmap assets over semantic controls, while hidden DOM copy remains for accessibility, testing, and localization. |
| `../assets/hub/heroes/letter-treasure-hunt.webp` | Built-in GPT Image 2 workflow using the quest map, link-preview art, and QLOBE toy-style splash as visual references | QLOBE Kids / GPT Image 2 | CC BY 4.0 | New text-free wide papercraft sea-map hero, right-weighted for the main hub’s featured copy; 1672×941 PNG converted to WebP q92 |
| Fredoka SemiBold | QLOBE Kids shared font library | SIL OFL 1.1 |
| Sound effects | `shared/js/sfx.js` | Synthesized at runtime; no external files |
| Narration | `assets/audio/` | All 234 A–Z core, chest, and cross-letter lines ship as local Qwen3-TTS teacher-voice `.m4a` clips with duration/hash manifest coverage and Whisper transcript QA. Generation uses the workflow host's asynchronous job API; Web Speech remains only a runtime recovery fallback. Human phoneme review remains required because broad transcription matching can accept variants such as `boo` for authored `buh`. |

Scene plates remain text-free, but reviewed UI copy is rendered into raster
assets rather than drawn live with CSS/SVG. Hidden DOM copy remains HTML so it
can be tested, localized, and kept synchronized with the accessible state.
`assets/source` is not copied into the game; the built-in imagegen
outputs remain in the Codex generated-image archive as provenance.
