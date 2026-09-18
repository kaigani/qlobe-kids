# Local API attempts

No unverified local-API output shipped.

- Krea log `7c0ab9b57256`, lava `90c25fc3f57f`, hop `bdd89993c8b0`, hub `e4c770f139a7`: `/free` returned 404.
- Qwen Image Layered Fern `867fe01004c5` and UI `72b01736a7f0`: `/upload/image` returned 404.
- Voice probe `76e308bc34f9`: stale path.
- Retried voice welcome `50e7ed7c6583` after correcting local-only teacher path: backend `/upload/image` returned 404 and workflow returned HTTP 500.

The game uses approved GPT Image 2 raster sources and Web Speech fallback until local voice cloning succeeds.
