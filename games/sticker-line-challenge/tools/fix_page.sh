#!/bin/bash
# Regenerate the notebook page as an explicit LANDSCAPE sheet, re-extract, refinalize.
set -u
API="http://192.168.1.181:8100"
GAME="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$GAME/assets/source"
LAY="$SRC/layered"
PAPER="Layered cut-paper papercraft collage style, construction paper and cardstock with deckled scissor-cut edges, visible paper grain and fibers, subtle creases, soft realistic drop shadows between layers, saturated craft-paper colors, handmade preschool sticker-book look. Premium preschool learning app asset, no text, no letters, no words, no UI."
CHARCOAL="The background is a perfectly flat, solid, uniform dark charcoal background, no gradient, no texture, no shadows on the background."

gen() { # name wf w h seed prompt
  local name="$1" wf="$2" w="$3" h="$4" seed="$5" prompt="$6"
  local out="$SRC/$name.png"
  echo "[t2i] $name seed=$seed"
  curl -s --max-time 900 -X POST "$API/workflows/$wf?sync=true" \
    -F "prompt=$prompt" -F "width=$w" -F "height=$h" -F "seed=$seed" --output "$out"
  [ -s "$out" ] && echo "[ok] $name" || echo "[FAIL] $name"
}

gen page-v2 krea2-turbo-t2i 1024 1024 42 \
  "A single wide landscape sheet of cream lined notebook paper, much wider than tall, lying horizontally across the middle of the frame, torn deckled edges, a row of punched binder holes along its short top edge, faint horizontal blue ruling lines, a soft drop shadow under the sheet. $PAPER $CHARCOAL"

for SEED in 42 1337 9001; do
  echo "== layered page-v2 seed $SEED =="
  JOB=$(curl -s --max-time 60 -X POST "$API/workflows/qwen-image-layered" \
    -F "image=@$SRC/page-v2.png" \
    -F "prompt=Solid flat green background layer. Top layer: the exact same wide landscape cream lined notebook paper sheet with torn deckled edges and punched holes along the top, from the image. Keep it identical to the input image." \
    -F "layers=2" -F "seed=$SEED" | python3 -c "import json,sys; print(json.load(sys.stdin).get('job_id',''))")
  echo "job=$JOB"
  for i in $(seq 1 60); do
    sleep 5
    ST=$(curl -s --max-time 30 "$API/jobs/$JOB" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
    [ "$ST" = "completed" ] && break
  done
  curl -s --max-time 120 "$API/jobs/$JOB/result?output=layer_2" --output "$LAY/page-v2-layer2.png"
  MAXA=$(python3 -c "
from PIL import Image
im=Image.open('$LAY/page-v2-layer2.png').convert('RGBA')
print(im.getchannel('A').getextrema()[1])")
  [ "$MAXA" = "255" ] && echo "SUCCESS seed $SEED" && break
  echo "seed $SEED produced blank alpha, next"
done

# swap in as the canonical page and refinalize
cp "$LAY/page-v2-layer2.png" "$LAY/page-layer2.png"
rm -f "$GAME/assets/page.webp"
python3 "$GAME/tools/postprocess.py"
echo "done: page regen"
