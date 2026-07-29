#!/bin/bash
# Sink or Float Lab — object art batch (qwen-image-edit from the approved duck anchor).
# Resumable: skips outputs that already exist. Host comes from QLOBE_QWEN_URL.
set -u
API="${QLOBE_QWEN_URL:?set QLOBE_QWEN_URL, e.g. export QLOBE_QWEN_URL=http://HOST:PORT}"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
ANCHOR="$DIR/assets/source/anchors/duck.png"
OUT="$DIR/assets/source/raw-edit"
mkdir -p "$OUT"

edit() { # name desc
  local f="$OUT/$1.png"
  [ -s "$f" ] && { echo "skip $1"; return; }
  curl -s -X POST "$API/workflows/qwen-image-edit?sync=true" \
    -F "image=@$ANCHOR" \
    -F "prompt=Replace the rubber duck with $2 in this soft gouache watercolor children's book illustration style, hand-painted texture with visible brushstrokes, perfectly matching the artistic style of the reference image. Whole object centered and fully visible, clean readable silhouette, no text. The background stays a perfectly flat, solid, uniform dark charcoal background, no gradient, no texture, no shadows on the background." \
    -F "seed=${3:-42}" \
    --output "$f" --max-time 900
  echo "done $1 $(stat -f%z "$f" 2>/dev/null || echo 0)"
}

edit rock "a smooth grey rock"
edit wooden-block "a small light brown wooden toy block cube"
edit sponge "a yellow rectangular kitchen sponge"
edit cork "a light brown cylindrical bottle cork"
edit apple "a shiny red apple with a small leaf"
edit leaf "a single fresh green leaf"
edit key "an old brass metal key"
edit coin "a shiny golden coin"
edit marble "a shiny blue glass marble"
edit spoon "a silver metal spoon"
edit shell "a pink and cream spiral seashell"
edit watermelon "a whole green striped watermelon"
edit pebble "a tiny smooth grey pebble"
edit log "a small brown tree log with rough bark"
edit paperclip "a silver metal paperclip"
edit orange "a whole orange fruit"
edit egg "a plain white chicken egg"
echo "OBJECT EDIT BATCH DONE"
