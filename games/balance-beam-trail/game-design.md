# Balance Beam Trail - production design

Balance Beam Trail turns the concept's living-room adventure into a direct-manipulation Papercraft game for ages 4-8. Fern the fox crosses three miniature trails built across a warm paper living room. The child should understand the next action from the glowing star, Fern's pose, and spoken cue within five seconds.

## Play loop

The runtime follows `select -> play(mode, checkpoint 0-5) -> complete -> next trail`. Completing all three modes changes the reward copy to an all-trails celebration. Progress is stored locally so an earned three-star badge appears on the selection card; the all-complete Play Again action clears it for a fresh set.

- **Log Crossing:** move a star to the green center and hold it steady for five short checkpoints. Continuous device tilt feels like balancing; drag and arrow keys provide identical no-permission fallbacks.
- **Lava River:** steer to five changing positions on the balance rail. Each successful hold moves Fern to the next broad stepping stone.
- **Hop Trail:** tap five glowing stars in order. A different pad gives a soft silly sound and immediately leaves the correct star available.

There is no countdown, health, score loss, or game-over state. A wobble changes Fern's pose and gently drains the steady meter; it never removes a checkpoint. The two balance modes use forgiving target tolerances and a short 820 ms hold so success feels intentional without becoming tiring.

## Interaction and feedback

Device orientation is progressive enhancement and is requested only from the Start Trail gesture. A stable initial sensor position becomes neutral. Rotation recalibrates safely, pointer capture is cancelled on blur or orientation change, and a denied or missing sensor changes the visible cue to "Drag the star." Keyboard arrows, Home, Enter, and Space remain usable.

Every child-facing target is at least 96 px. Home appears only on selection; Back on play and completion returns to the in-game selection screen. The sound control repeats the current cue on a short press and toggles mute on a long press. Spoken lines use recorded clips when present and the shared Web Speech fallback otherwise. Idle nudges repeat the current instruction without counting down or shaming the child.

Each checkpoint fills a raster star, advances Fern along the pictured path, plays a soft effect, and flashes the paper stage edge. Completion uses a dedicated generated finish scene, Fern's celebration pose, a raster flag, three large raster stars, confetti, and a clear Next Trail action.

## Visual and responsive system

All child-facing art is raster; no CSS or vector scene art is used. GPT Image 2 source masters establish a single handmade paper world across the selection room, three perspective stages, Fern poses, controls, title, and completion scene. The selection cards and controls were cut with the repository bounding-box cutter and finalized with a deterministic Pillow build script. A separate 6:5 tile follows the catalog's toy-object grammar.

The 4:3 tablet layout is canonical. Full-bleed art uses centered cover cropping so the trail remains aligned in portrait and wide landscape; HUD elements respect safe areas. Portrait narrows the cards and splits Fern/action placement on completion. Reduced motion keeps every mechanic intact while collapsing decorative transitions and repeated motion.

## QA contract and beta gate

`window.QLOBE_DEBUG` format version 1 exposes readiness, all modes, semantic state, truthful targets, taps, balance samples, checkpoint advancement, completion, mute, deterministic seed, timer scaling, reset, calibration, and audio logs. The production driver covers all three modes, a wrong-hop probe, completion, landscape, portrait, reduced motion, page errors, request failures, and screenshots.

The game remains beta until a real iPad child playtest confirms that a 4-8-year-old can discover Start, distinguish the live and target stars, recover from a wobble, and choose the next trail without adult explanation.
