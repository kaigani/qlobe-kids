# Puppet rig & asset spec

How to describe a QLOBE Kids character so the puppet engine
(`shared/js/stage/puppet.js`) can (a) animate it with a segmented bone rig +
spline-eased poses and (b) dress it in swappable outfits that follow the limbs.

This is the authoring contract behind **Puppet Retell**. It generalises the
lip-sync anchor convention already in `shared/characters/<id>/anim/mouths.json`
(a rect in reference-canvas pixels, scaled to render size) to a whole skeleton.

The reference implementation is the Bear:
`shared/characters/bear/rig.json` + `shared/js/stage/puppet.test.html` (smoke
test). Author and tune a rig visually with the **Puppet Studio** below rather than
hand-editing coordinates.

## Puppet Studio — `shared/js/stage/puppet-studio.html`

The one tool for rig, animation, and speech. Open it over a served repo
(`python3 -m http.server`, then `/shared/js/stage/puppet-studio.html`). Pick the
character with `?char=<id>` (defaults to `bear`); it loads that character's
`rig.json` + art. Four modes:

- **Build character** — ingest a body-parts sheet and a labelled 3×3 viseme
  sheet, run the local layered extractor, review alpha/component QC, then write
  the ten named parts, nine registered heads, and a starter `rig.json`. This mode
  needs the localhost authoring server described in `docs/puppet-pipeline.md`;
  the other three modes continue to work over any static HTTP server.

- **Rig parts** — pick a bone (dropdown or click it on the canvas) and **drag it
  to move its joint**; or set `joint x/y`, `anchor x/y`, `scale`, and layer `z`
  exactly. This is how you align parts, plug holes, and fix draw order.
- **Animate** — pick a clip, scrub the **timeline**, and **drag a limb to pose it
  at that frame** (writes/updates the keyframe). Toggle the drag between **⟳
  rotate** and **✦ move** (or hold Shift to move) — move writes `x`/`y` so you can
  slide a limb back into its socket. Edit each key's time, value, and ease in the
  list; add/delete keys; set clip duration/loop; press Play (or space) to
  preview. `$spine` (bend/squash) and `$motion` (x/y/…) are editable via the
  value field + "Set key @t". Editing the **value** field commits a key at the
  current frame. Under the timeline, solid red diamonds are this track's keys
  (click to jump); **hollow dashed diamonds** are keyframe times used by *other*
  tracks in the clip — a jump/alignment affordance only, not written to JSON until
  you edit a value there (which materialises a real key on this track).

- **Speak** — pick a voice line and hit **Speak**: it plays the clip, drives the
  viseme head-swap (mouth.js `followCues` → `setViseme`) *and* the `talk` body
  clip together, so you preview animation + lip-sync as they'll ship. The **sync
  offset** slider compensates audio-output latency (≈150–250ms on Bluetooth).
  Voice lines are discovered from `voice/manifest.json` (older built-in entries
  remain as a compatibility fallback); each needs viseme heads, an audio clip,
  and a matching `<clip>.cues.json`. Build mode's **Set up voice cues** step
  transcribes an uploaded WAV or MP3 through the Whisper workflow API, lets the
  author review/edit the text, then creates all three.

`Undo` (Ctrl+Z) steps back; `Save rig` writes directly when the localhost
authoring server is active, `Export rig.json` downloads a portable copy, and
`Copy JSON` copies it. The tool drives
the same engine (`puppet.js`) so what you see is what ships.

---

## 1. Canvas & pose

- **Canvas:** one fixed square, `1024 × 1024`, transparent. Every pivot, part,
  and outfit coordinate in `rig.json` is expressed in these pixels. At runtime
  the engine scales the *whole* puppet by one factor — you never pre-scale parts.
- **Pose:** a relaxed, symmetrical **A-pose** (arms a little away from the body,
  legs slightly apart, facing the viewer). This keeps every joint visible and
  every limb separable.
- **Consistency across the cast:** all characters share the same canvas, the same
  ground line (`rig.ground`, the y of the soles), and roughly the same head/body
  proportion band, so a bear and a rabbit stand at the same scale on stage and
  can share outfit sizing.

## 2. Segmentation — the base body

Each body part is drawn on its **own transparent layer** and exported as
`shared/characters/<id>/parts/<bone>.png`, trimmed, at full 1024² canvas
registration (so a part's pixels sit where they belong on the canvas — do **not**
re-center them). The engine positions each part from its recorded canvas center.

Standard bone set (mirror left/right with `.L` / `.R`):

| Bone | Contains | Parent | Rotates about (joint) |
|---|---|---|---|
| `torso` | belly/chest, hips | — (root) | pelvis |
| `head` | face, ears, snout, eyes, mouth | `torso` | neck |
| `arm-upper.L/.R` | shoulder → elbow | `torso` | shoulder |
| `arm-lower.L/.R` | forearm + paw/hand | `arm-upper` | elbow |
| `leg-upper.L/.R` | hip → knee | `torso` | hip |
| `leg-lower.L/.R` | shin + foot | `leg-upper` | knee |

Species extras (tail, long ears, trunk) are extra parts bound to the nearest
bone (tail → `torso`, floppy ears → `head`). Small face features (eyes, snout)
can be separate parts on the `head` bone so you can add a blink later.

**Joint-overlap rule (important):** draw each part so it overlaps its neighbour
generously *at the joint* — a shoulder cap on the upper arm that tucks under the
torso, a hip cap on the thigh. When a limb rotates, the overlap hides the seam so
no gap opens at the pivot. Round the limb ends.

**Draw order** is a single **global** paint order across the whole puppet, set by
each part's `z` — decoupled from the bone hierarchy. Every part sprite is rendered
through one Pixi `RenderLayer` sorted by `z`, while it still lives under its bone
for transforms. So a part's `z` is absolute, not relative to its bone, and a child
bone's part can sit on either side of its parent's: e.g. `arm-upper.z 9` (behind
the torso) + `arm-lower.z 21` (in front) gives a natural arm **wrap-around**, even
though the lower arm is a child of the upper arm for the elbow rotation. Order the
whole cast by one scale, e.g. `arm-upper 9, legs 12/13, torso 10, arm-lower 21,
head 30`. The head must sit above the torso (and any torso outfit) or the face
renders behind it; give a bare part and the garment covering it adjacent `z` with
the garment higher. (Studio's **layer z** input edits a part's `z` live.)

## 3. Pivots — `rig.json`

**Start from the default positioning.** `shared/characters/default-rig.json` holds
the tuned joint positions, part anchors, z-order and spine for the standard bipedal
plush rig (hand-tuned on Rabbit). Copy its `bones` / `parts` / `spine` into a new
character's `rig.json`, then nudge each joint/anchor to fit that character's parts
in Studio Rig mode — a much better first pass than roughing from scratch. Its head
part carries a placeholder viseme map + fit that you replace per character (§5b).

For every bone, record its **joint** `[x, y]` in canvas pixels: the point it
rotates about and attaches to its parent. For every part, record the placeholder
box now and the art path later. Schema (see `bear/rig.json` for a full example):

```jsonc
{
  "id": "bear", "canvas": 1024,
  "anchor": { "x": 512, "y": 512 },      // pivot for scaling/placing the whole view
  "ground": 960,                          // y of the soles (align the cast)
  "bones": [
    { "id": "torso", "parent": null,   "joint": [512, 640] },
    { "id": "head",  "parent": "torso","joint": [512, 452] }
    // arms, legs…
  ],
  "spine":  { "control": [[512,640],[512,545],[512,452]] },  // hip → mid → neck
  "parts": [
    { "bone": "head", "z": 30,
      "art": "parts/head.png",           // real art (added later)
      "placeholder": { "shape": "ellipse", "color": "#9a6a40", "cx": 512, "cy": 372, "w": 300, "h": 288 } }
    // …one entry per part; cx/cy are the part's center in canvas px
  ],
  "mouth": { "bone": "head", "rect": { "x": 470, "y": 438, "w": 84, "h": 44 } },
  "outfitSlots": [ /* §4 */ ],
  "clips": { /* §5 */ }
}
```

- `placeholder` lets the rig render and animate **before any art exists** (flat
  tinted shapes: `ellipse`, `roundRect` + `r`, `triangle`). When you add real
  PNGs, set `art` and pass a `partFactory` that returns sprites — no engine or
  clip change.
- `mouth.rect` reuses the `mouths.json` model, so the existing viseme lip-sync
  (`shared/js/stage/mouth.js`) drops straight onto the head bone.
- `spine.control` are 2–3 points up the body's midline; the engine bends the
  torso/head along them for the plush wobble and squash.

## 4. Character variants — whole sprite sets (not dress-up)

**Decision:** each character/outfit variant is a **complete, separately-drawn
sprite set** — its own `parts/*.png` + `rig.json` under
`shared/characters/<id>/` — not a base body with layered clothing swapped on.
So the Bear's green onesie is baked into its parts, Mia is her own folder, etc.
To make a "same character, new outfit" variant, produce a new A-pose sheet in that
outfit and rig it the same way (§1–§3); reuse the joint/anchor numbers from the
base as a starting point since the proportions match.

This keeps every character crisp (art drawn as a whole, no seams between a body
and a coat) at the cost of not mixing-and-matching clothes at runtime — which the
game doesn't need.

> The engine still ships an **optional** `outfitSlots` capability (a sprite
> parented to a bone, swapped with `setOutfit(slot, id)`, rides the limb through
> clips). It's unused by the current characters — leave `"outfitSlots": []`. It's
> there only if a future game ever wants true layered dress-up.

## 5. Clips — spline-eased pose animation

**Start from the defaults.** `shared/characters/default-clips.json` holds the
tuned baseline `idle / wave / walk / jump / talk` for the standard bipedal plush
rig (bones `torso, head, arm-upper/lower.L/R, leg-upper/lower.L/R` + `$spine`,
`$motion`). Copy its `clips` into a new character's `rig.json`, then retune per
proportions in Studio. These are **portable** — rotations/scale/spine/motion
only, no character-specific per-bone `x`/`y` socket offsets (add those per
character in Studio's ✦ move if a rotated limb pulls out of its socket).

A clip is a named set of **keyframe tracks**; each track drives one property of
one target along its keys. `t` runs 0..1 across the clip; the engine samples with
`spline.js` (`sampleTrack`): 2 keys or an eased segment → eased lerp, 3+ keys →
Catmull-Rom through the values, so motion flows through the middle keys.

```jsonc
"clips": {
  "wave": { "duration": 1100, "loop": true, "tracks": [
    { "target": "arm-upper.R", "prop": "rotation",
      "keys": [ { "t": 0, "v": 0 }, { "t": 0.18, "v": -1.35, "ease": "outCubic" },
                { "t": 0.85, "v": -1.35 }, { "t": 1, "v": 0 } ] }
  ] }
}
```

- **Targets:** any `bone` id, or the specials `$motion` (hops/drifts the whole
  body — `x`,`y`,`rotation`,`scaleX`,`scaleY`) and `$spine` (`bend`, `squash`).
- **Props:** `rotation` (radians, absolute, rest 0), `x`/`y` (canvas-px offset on
  top of the bone's structural joint, rest 0 — use this to slide a limb so a
  rotated shoulder/hip stays seated in its socket), `scaleX`/`scaleY` (rest 1).
  A bone's `x`/`y` moves its whole chain (children follow). Scale/rotation/x/y on
  the **torso** compose with the `$spine` squash/bend rather than being replaced.
- `ease` on a key (`outCubic`, `inOutSine`, `outBack`, …) forces an eased lerp on
  that segment; omit it to let the spline smooth through neighbours.
- Ship at least `idle`, `wave`, `walk`, `jump`, `talk`. `idle` and `talk` loop;
  `jump` runs once. `prefers-reduced-motion` holds a still pose automatically.

## 5b. Lip-sync — viseme head swap

For a sculpted plush face, mouth-patch overlays read as pasted-on. Instead, swap
the **whole head** between viseme sprites. The `head` part in `rig.json` carries a
`visemes` map (viseme name → transparent head PNG); its `art`/`anchor`/`scale` fit
the **rest** head to the body, and because all viseme heads are mutually
registered (same canvas, tops/eyes aligned, only the jaw moves) that one
anchor/scale serves them all:

```jsonc
{ "bone": "head", "z": 30, "art": "anim/head-ts.png", "anchor": [0.5, 0.844], "scale": 0.878,
  "visemes": { "rest": "anim/head-ts.png", "a": "anim/head-a.png", "o": "…", "e": "…",
               "wr": "…", "ts": "…", "ln": "…", "uq": "…", "mbp": "…", "fv": "…" } }
```

`loadRigArt` preloads every viseme texture; `puppet.setViseme(key)` swaps the head
sprite's texture (unknown key → `rest`). Drive it from a Rhubarb cue timeline with
`mouth.js` `followCues(audioEl, cues, setViseme-wrapper)`, mapping Rhubarb's
A–H+X to the rig's viseme names. Reference: `puppet-lipsync.test.html`.

**Producing viseme heads:** generate a labelled grid of heads (identical except
the mouth) from the base head; slice to one head per 1024² grey tile with
`tools/lipsync/slice-viseme-grid.py`; background-separate each to transparent via
the local `qwen-image-layered` workflow (async job → `layer_2`); alpha-trim and
re-register (see below) into `anim/head-<viseme>.png`. The extractor is a redraw —
verify the heads stay registered (only the mouth should differ).

**Slicing is NON-DESTRUCTIVE — never matte at slice time.** The tile must be the
head crop verbatim on grey; Qwen is what isolates it. An earlier version
threshold-fed an alpha and re-composited onto grey, which **re-cut the soft
felt-fur edges** (and Qwen then redrew the damage). `slice-viseme-grid.py` only
locates each head (largest closed component → drops the label, keeps the ears)
and crops raw pixels centred by the head on a 1024² canvas. It never scales the
crop, and samples the canvas grey from that crop's own corner.

**Registration.** Qwen redraws each head independently, so the set can drift. If
the drift is large, re-register the cutouts by a **stable feature** — for the
unicorn, the white face. Puppet Studio first crops every transparent Qwen result
to its alpha bounds, then aligns those 1:1 crops by integer translation on one
shared transparent canvas. It does not correct Qwen scale drift by resizing;
that remains visible for QC rather than introducing another resampling pass.

## 6. Generation workflow

Clean segmentation is the hard part, so split the work by difficulty:

1. **Foundational image model** (GPT Image / Dreamina) for the structural art:
   generate the character in the A-pose on the 1024² transparent canvas, then a
   matching **layer/part breakout** (each limb separated with the joint overlaps
   from §2). This is where a stronger model earns its keep over the local API.
2. **Alpha-key & slice** with the existing flood-fill pipeline (see the
   `character-sheet.md` process): key the background to transparent, cut each
   part to `parts/<bone>.png` keeping canvas registration, and read off each
   joint + part center into `rig.json`.
3. **Local ComfyUI API** for the easy, high-volume variants: outfit recolors,
   accessories, alternate hats/props — anything that's a restyle of an existing
   piece rather than new segmentation.
4. **Log provenance** for every asset in the game's `ASSETS.md` (source, model,
   license, modifications), per the platform asset rules.

Until the PNGs exist, the `placeholder` blocks keep the rig fully animatable and
dressable — build and tune clips against the placeholder Bear first, then drop in
art with zero code changes.
