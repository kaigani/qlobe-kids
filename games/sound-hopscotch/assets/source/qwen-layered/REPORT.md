# Qwen Image Layered retrieval

Retrieved successfully from the approved LAN API using `output=layer_2`:

- `bunny-ready.png` — completed, 368,322 bytes; PNG metadata should be inspected by the integrator.
- `bunny-hop.png` — completed, 832,022 bytes.
- `bunny-land.png` — completed, 539,308 bytes.

Remaining jobs were still `running` or `pending` at retrieval time (no failures observed): bunny-cheer, all pad/UI/effect assets, and title-lockup. The three downloaded files were not quality-processed or copied into runtime assets.

Additional completed retrievals (layer_2): `bunny-cheer.png` (559,499 bytes), `pad-coral.png` (961,559), `pad-yellow.png` (712,169), `pad-blue.png` (519,773), and `pad-lime.png` (695,056). `pad-violet` and the remaining UI/effect/title jobs were still non-terminal when this poll ended.

Final completed retrieval: `title-lockup.png` (job `c43dff44c9e14ccf8936aaebd2496fff`), RGBA 1024×456, alpha extrema 0–255, non-empty alpha bbox.

Complete job manifest: `bunny-ready.png` (6e99403704f3467c9ed483181563becf), `bunny-hop.png` (7b7529562915413a88700bcd494f0e5b), `bunny-land.png` (5250801b6eb54802ab76812f91ef6b0d), `bunny-cheer.png` (12b0b546934a4686869f01ee804fd046), `pad-coral.png` (30ce034c9c9040feb0f8f522d5ad4475), `pad-yellow.png` (f85a9b1753ad4516a6dca4673581ce0b), `pad-blue.png` (2fab5004a8f749569ed392dc02f2fbdc), `pad-lime.png` (007272e210504b07ae8bbf7263317987), `pad-violet.png` (5c98e3f07e674f2ea81b9e2cc985d4cd), `sound-plaque.png` (bae6c62c692648edaa88feaf88a47360), `play-button.png` (2fd6c826e2e344c4a4f1e2b30bc39fe1), `reward-star.png` (878df39b3113439cb715bb7488b943dd), `progress-flower.png` (51b7fa5d4d734ff0a0d3a7fd1baaa733), and `title-lockup.png` (c43dff44c9e14ccf8936aaebd2496fff). All reached completed status and were saved.

Usability conclusion: title-lockup and assets with alpha maxima 255 have an opaque subject core and are usable for visual review. Bunny-ready (alpha max 3), bunny-hop (17), bunny-land (3), bunny-cheer (5), and most pads/effects (max 3–17) are near-empty extractions and should **not** be treated as usable artwork without re-extraction or manual repair. This report makes no runtime changes.
