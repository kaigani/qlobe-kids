# Puppet Studio character pipeline

Puppet Studio's **Build character** mode turns the two author-supplied sheets
into a rig-ready character project. It is an authoring tool: the shipped QLOBE
Kids site remains static and never calls a model.

## Start the authoring server

From `qlobe-kids/`:

```sh
python3 tools/puppet-studio-server.py --qwen-url http://YOUR-MODEL-HOST:8100
```

Then open:

```text
http://127.0.0.1:8000/shared/js/stage/puppet-studio.html?mode=build
```

The server binds to localhost, serves the static repo, writes only validated
puppet-pipeline paths, and proxies long Qwen jobs so browser CORS and request
timeouts are not part of the workflow. The model host is supplied at launch and
is deliberately not committed to this public repo. Without `--qwen-url`, the
Build UI can still inspect and assemble existing extraction outputs.

## End-to-end flow

1. Enter a lowercase character id and display name. Choose the body-parts PNG
   and labelled 3×3 viseme PNG, then **Save both sources**. They become
   `00-reference/puppet parts/<id>/raw-base.png` and `head-visemes.png`.
2. **Slice 9 visemes** locates the largest foreground component in every grid
   cell using a guarded overlap so artwork crossing a nominal cell edge is not
   clipped. It excludes the label, samples the background colour from that
   crop's top-left corner, and copies the crop 1:1 onto a matching 1024² tile.
   It does not resize, matte, or redraw the fur edge.
3. Run **Extract body sheet**, then **Extract 9 heads**. Each is an asynchronous
   `qwen-image-layered` job and saves `layer_2`, never the composite `layer_0`.
   The explicit prompts are editable because this model separates by semantic
   understanding and can invent details when the subject is underspecified. The
   default head prompt is intentionally minimal: `Solid grey background,
   Character head on top layer on transparent background`.
4. **QC / slice body** checks the alpha histogram and requires exactly ten
   connected subject components. Fixed sheet positions map to `head`, `torso`,
   four arm pieces, and four leg pieces. Review every crop in the gallery.
5. **Register heads + build rig** aligns the nine heads on a stable light-neutral
   face region when one is shared by the set, falling back to the full alpha
   silhouette. Each Qwen result is cropped again to its alpha bounds, then the
   crops are aligned on a shared transparent canvas using integer translation
   only. No head is resized. It writes all final PNGs and merges `default-rig.json`
   with `default-clips.json` into the new `rig.json`.
6. In **Set up voice cues**, name a line, choose a WAV or MP3 sample, and
   wait for the workflow API's Whisper transcription. The transcript stays
   disabled with **Transcribing...** until the job finishes, then becomes editable
   for review. The authoring server converts the clip to browser-ready M4A, gives
   the edited text to the bundled Rhubarb Lip Sync analyzer, maps its mouth shapes
   to the rig visemes, and writes `<line>.m4a`, `<line>.cues.json`, and
   `voice/manifest.json` under `shared/characters/<id>/voice/`. The line becomes
   available immediately in Speak mode.
7. Open the character in **Rig parts**, place the joints/anchors visually, then
   use **Save rig**. Animate and Speak are the existing downstream authoring
   tools.

The **allow replacing existing pipeline files** checkbox is required before the
tool overwrites sources, Qwen outputs, final parts, heads, or an existing rig.

## What is automated, and what uses inference

| Stage | Method | Why |
|---|---|---|
| Source ingest and naming | deterministic | File validation and fixed project paths |
| Viseme grid slicing | deterministic Canvas processing | Preserves source pixels and removes labels by geometry |
| Background separation | Qwen Image Layered inference | Produces a soft true-alpha subject edge; it is a generative redraw |
| Alpha/component QC | deterministic | Measures transparent/partial/opaque pixels and component count |
| Body part crop and name assignment | deterministic | The body sheet has a fixed ten-position layout |
| Head alpha trim/registration | deterministic | Crops Qwen output and aligns a stable feature by translation only |
| Starter skeleton and clips | deterministic template merge | Reuses the project-wide biped defaults |
| Voice transcription | Whisper workflow API inference | Produces editable spoken text from the uploaded sample |
| Voice conversion and cues | deterministic local analysis | FFmpeg normalization + reviewed transcript + Rhubarb timing + fixed rig-viseme mapping |
| Identity/detail QC | human review | Qwen may subtly redraw a face, texture, or silhouette |
| Joint/anchor placement | human visual authoring | The breakout sheet does not encode assembled joint coordinates |
| Animation retuning | human visual authoring | Shared clips are a useful baseline, not species-specific motion |

A future vision-model QC pass can score identity consistency, but it should be a
review aid rather than an automatic acceptance gate: pixel/alpha metrics cannot
detect a changed eye, mane, mouth shape, or expression.

## Output contract

```text
00-reference/puppet parts/<id>/
  raw-base.png
  head-visemes.png
  sprites-<id>.png
  viseme-tiles/viseme-{a,o,e,wr,ts,ln,uq,mbp,fv}.png
  viseme-cutouts/head-{a,o,e,wr,ts,ln,uq,mbp,fv}.png

shared/characters/<id>/
  parts/{head,torso,arm-*,leg-*}.png
  anim/head-{a,o,e,wr,ts,ln,uq,mbp,fv}.png
  voice/<line>.m4a
  voice/<line>.cues.json
  voice/manifest.json
  rig.json
```

If body QC does not find ten components, retry Qwen with another seed after
reviewing the layer. Do not force the slicer: a merged or missing component is an
extraction failure. If the gallery shows identity drift, retry that extraction
even when the alpha metrics pass.
