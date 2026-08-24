#!/bin/bash
# Sticker Line Challenge — image generation pipeline (resumable, skip-existing).
# Usage: gen_images.sh <stage>   stage in: t2i | layered | all
# Provenance: every prompt/seed is recorded next to the call; see ASSETS.md.
set -u
API="http://192.168.1.181:8100"
GAME="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$GAME/assets/source"
LAY="$SRC/layered"
mkdir -p "$SRC" "$LAY"

PAPER="Layered cut-paper papercraft collage style, construction paper and cardstock with deckled scissor-cut edges, visible paper grain and fibers, subtle creases, soft realistic drop shadows between layers, saturated craft-paper colors, handmade preschool sticker-book look. Premium preschool learning app asset, no text, no letters, no words, no UI."
CHARCOAL="The background is a perfectly flat, solid, uniform dark charcoal background, no gradient, no texture, no shadows on the background."

gen_t2i() { # name workflow w h seed prompt
  local name="$1" wf="$2" w="$3" h="$4" seed="$5" prompt="$6"
  local out="$SRC/$name.png"
  [ -s "$out" ] && { echo "[skip] $name"; return 0; }
  echo "[t2i] $name wf=$wf ${w}x${h} seed=$seed"
  curl -s --max-time 900 -X POST "$API/workflows/$wf?sync=true" \
    -F "prompt=$prompt" -F "width=$w" -F "height=$h" -F "seed=$seed" \
    --output "$out"
  [ -s "$out" ] && echo "[ok] $name" || echo "[FAIL] $name"
}

stage_t2i() {
  # --- full-bleed backdrops (krea2-turbo-t2i, 4:3, seed 42) ---
  gen_t2i bg-splash krea2-turbo-t2i 1600 1200 42 \
    "A preschool craft-table backdrop: a big sheet of sky-blue construction paper covering the whole view, with torn deckled edges revealing layers of purple, pink gingham, green striped and teal paper in the four corners, small strips of yellow and pink washi tape, a tiny paper flower sticker in the bottom right corner and a gold paper star sticker in the top left corner. The large center area is calm, even blue paper with soft paper grain. $PAPER"
  gen_t2i bg-play krea2-turbo-t2i 1600 1200 42 \
    "A preschool craft-table backdrop: layered torn construction-paper collage in soft purple and violet tones covering the whole view, torn deckled edges at the corners revealing yellow, pink polka-dot, teal and blue striped paper, two small washi tape strips in the top corners. The large center area is calm, even medium-purple paper with soft paper grain. $PAPER"
  gen_t2i bg-end krea2-turbo-t2i 1600 1200 42 \
    "A celebration backdrop: deep blue construction-paper sky with a big arcing rainbow made of layered paper strips in pink, coral, yellow, green, blue and purple rising from the lower left, scattered small die-cut paper stars and four-point sparkles in gold, pink and white around it. Upper middle and bottom center stay calm and uncrowded. $PAPER"

  # --- title lockup (ideogram4-t2i is the reliable text model; charcoal for extraction) ---
  gen_t2i title ideogram4-t2i 1376 640 42 \
    "The words 'Sticker Line' written in big playful hand-cut paper lettering, each letter cut from colorful construction paper (red, orange, yellow, teal and pink) with a white die-cut sticker border around each letter and a soft drop shadow, arranged on one line, tilted slightly like pasted stickers. $PAPER $CHARCOAL"

  # --- charcoal subjects for layered extraction (1024x1024, seed 42) ---
  gen_t2i page krea2-turbo-t2i 1024 1024 42 \
    "A single sheet of cream lined notebook paper in landscape orientation, gently rotated a few degrees, filling most of the frame, torn deckled edges, a column of punched binder holes down the left edge, faint blue ruling lines and a soft drop shadow under the sheet. $PAPER $CHARCOAL"
  gen_t2i card-wave krea2-turbo-t2i 1024 1024 42 \
    "A square cream cardstock card with a folded-up bottom-right corner, and one bold vertical wavy ribbon of pink construction paper with white dashed stitch marks running down the middle of the card. $PAPER $CHARCOAL"
  gen_t2i card-zigzag krea2-turbo-t2i 1024 1024 42 \
    "A square cream cardstock card with a folded-up bottom-right corner, and one bold vertical zigzag ribbon of green construction paper with white dashed stitch marks running down the middle of the card. $PAPER $CHARCOAL"
  gen_t2i card-loop krea2-turbo-t2i 1024 1024 42 \
    "A square cream cardstock card with a folded-up bottom-right corner, and one bold vertical loop-the-loop ribbon of blue construction paper with white dashed stitch marks running down the middle of the card. $PAPER $CHARCOAL"
  gen_t2i buddy-star krea2-turbo-t2i 1024 1024 42 \
    "One cute die-cut sticker of a plump five-pointed golden-yellow star with stitched stitch marks, a thick white die-cut paper border and a soft glossy sticker finish, facing the viewer, perfectly centered and upright. $PAPER $CHARCOAL"
  gen_t2i buddy-rainbow krea2-turbo-t2i 1024 1024 42 \
    "One cute die-cut sticker of a small arched rainbow with six paper strips in pink, coral, yellow, green, blue and purple, tiny paper clouds at both ends, a thick white die-cut paper border and a soft glossy sticker finish, perfectly centered and upright. $PAPER $CHARCOAL"
  gen_t2i buddy-heart krea2-turbo-t2i 1024 1024 42 \
    "One cute die-cut sticker of a plump warm-red paper heart with stitched stitch marks, a thick white die-cut paper border and a soft glossy sticker finish, perfectly centered and upright. $PAPER $CHARCOAL"
  gen_t2i buddy-flower krea2-turbo-t2i 1024 1024 42 \
    "One cute die-cut sticker of a pink paper flower with five rounded petals, a small yellow button center, a thick white die-cut paper border and a soft glossy sticker finish, perfectly centered and upright. $PAPER $CHARCOAL"
  gen_t2i banner-green krea2-turbo-t2i 1024 1024 42 \
    "One completely blank horizontal banner strip of bright green construction paper with torn deckled ends, held at each end by a small piece of yellow washi tape, very wide and short, centered. $PAPER $CHARCOAL"
  gen_t2i banner-pink krea2-turbo-t2i 1024 1024 42 \
    "One completely blank horizontal banner strip of warm pink construction paper with torn deckled ends, very wide and short, centered, with two tiny pieces of teal washi tape at the ends. $PAPER $CHARCOAL"
  gen_t2i dash krea2-turbo-t2i 1024 1024 42 \
    "One single small horizontal dash mark cut from medium purple construction paper with rounded ends and visible paper grain, centered, tiny in the frame. $PAPER $CHARCOAL"
  gen_t2i blob krea2-turbo-t2i 1024 1024 42 \
    "One single soft round pad of pale lavender construction paper with softly torn organic edges and visible paper grain, centered, tiny in the frame. $PAPER $CHARCOAL"
}

layer_one() { # name prompt
  local name="$1" prompt="$2"
  local out="$LAY/$name-layer2.png"
  [ -s "$out" ] && { echo "[skip] layered $name"; return 0; }
  echo "[layered] $name"
  local job
  job=$(curl -s --max-time 60 -X POST "$API/workflows/qwen-image-layered" \
    -F "image=@$SRC/$name.png" -F "prompt=$prompt" -F "layers=2" -F "seed=42" \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('job_id',''))")
  [ -z "$job" ] && { echo "[FAIL] layered $name (no job id)"; return 1; }
  for i in $(seq 1 120); do
    sleep 5
    local st
    st=$(curl -s --max-time 30 "$API/jobs/$job" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status',''))" 2>/dev/null)
    case "$st" in
      completed)
        curl -s --max-time 120 "$API/jobs/$job/result?output=layer_2" --output "$out"
        [ -s "$out" ] && echo "[ok] layered $name" || echo "[FAIL] layered $name (no result)"
        return 0 ;;
      failed|error) echo "[FAIL] layered $name ($st)"; return 1 ;;
    esac
  done
  echo "[FAIL] layered $name (timeout)"
  return 1
}

stage_layered() {
  local P="Solid flat green background layer. Top layer: the exact same"
  layer_one page        "$P cream lined notebook paper sheet with torn deckled edges and punched holes on the left, from the image. Keep it identical to the input image."
  layer_one card-wave   "$P cream cardstock card with the pink wavy dashed ribbon, from the image. Keep it identical to the input image."
  layer_one card-zigzag "$P cream cardstock card with the green zigzag dashed ribbon, from the image. Keep it identical to the input image."
  layer_one card-loop   "$P cream cardstock card with the blue loop-the-loop dashed ribbon, from the image. Keep it identical to the input image."
  layer_one buddy-star  "$P golden-yellow star sticker with white die-cut border, from the image. Keep it identical to the input image."
  layer_one buddy-rainbow "$P arched rainbow sticker with paper clouds and white die-cut border, from the image. Keep it identical to the input image."
  layer_one buddy-heart "$P warm-red paper heart sticker with white die-cut border, from the image. Keep it identical to the input image."
  layer_one buddy-flower "$P pink paper flower sticker with yellow button center and white die-cut border, from the image. Keep it identical to the input image."
  layer_one banner-green "$P blank green construction-paper banner strip with yellow washi tape at the ends, from the image. Keep it identical to the input image."
  layer_one banner-pink "$P blank pink construction-paper banner strip with teal washi tape at the ends, from the image. Keep it identical to the input image."
  layer_one title       "$P colorful hand-cut paper lettering spelling 'Sticker Line' with white die-cut borders, from the image. Keep it identical to the input image."
}

case "${1:-all}" in
  t2i) stage_t2i ;;
  layered) stage_layered ;;
  all) stage_t2i; stage_layered ;;
esac
echo "done: $1"
