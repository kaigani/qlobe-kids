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
# --- variation expansion, 2026-07-29: classic pool 12->36, tricky 6->18 ---
edit banana "a ripe yellow banana"
edit lemon "a whole bright yellow lemon"
edit tennis-ball "a fuzzy yellow-green tennis ball"
edit beach-ball "a colorful striped inflatable beach ball"
edit pencil "a yellow wooden pencil"
edit ice-cube "a frosty translucent ice cube"
edit candle "a plain white unlit candle"
edit pinecone "a brown pinecone"
edit toy-boat "a small red and white toy sailboat"
edit flip-flop "a blue foam flip-flop sandal"
edit balloon "a red inflated party balloon"
edit stick "a small brown tree twig stick"
edit fork "a silver metal fork"
edit hammer "a hammer with a wooden handle and steel head"
edit magnet "a red horseshoe magnet with silver tips"
edit button "a large blue plastic clothing button with four holes"
edit dice "a white dice with black dots"
edit toy-car "a small red metal toy car"
edit golf-ball "a white dimpled golf ball"
edit crayon "a red wax crayon"
edit domino "a black domino tile with white dots"
edit teacup "a small ceramic teacup with a handle"
edit padlock "a brass metal padlock"
edit bolt "a grey steel bolt"
edit pumpkin "a round orange pumpkin"
edit coconut "a brown hairy coconut"
edit pineapple "a whole pineapple with green leaves"
edit avocado "a dark green avocado"
edit bell-pepper "a red bell pepper"
edit corn-cob "a yellow corn on the cob with green husk leaves"
edit grape "a single purple grape"
edit cherry "a single red cherry with a stem"
edit raisin "a single wrinkled brown raisin"
edit bean "a single red kidney bean"
edit screw "a small silver metal screw"
edit pearl "a single round white pearl"
echo "OBJECT EDIT BATCH DONE"
