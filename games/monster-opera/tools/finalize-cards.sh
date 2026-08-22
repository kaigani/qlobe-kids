#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/source/gpt-image-2"
OUT_CARDS="$ROOT/assets/cards"
OUT_UI="$ROOT/assets/ui"
mkdir -p "$OUT_CARDS" "$OUT_UI"

# Remove the green key, then isolate the 12 accepted controls. The authored
# objects intentionally breathe across the conceptual cell gutters, so these
# crops come from the full 1448x1086 sheet instead of cutting at cell edges.
TMP_DIR="$(mktemp -d -t monster-opera-ui)"
TMP_UI="$TMP_DIR/sheet.png"
CARD_BASE="$TMP_DIR/card-base.webp"
trap 'rm -f "$TMP_UI" "$CARD_BASE"; rmdir "$TMP_DIR"' EXIT
ffmpeg -hide_banner -loglevel error -y -i "$SRC/chroma-ui-sheet.png" \
  -vf 'chromakey=color=0x07f810:similarity=0.18:blend=0.08' \
  -frames:v 1 "$TMP_UI"
names=(coral-pill teal-pill recording-pill pitch-high pitch-middle pitch-low replay pause resume selected-badge cast-tray purple-label)
crops=(
  '342:152:20:148' '334:150:386:150' '372:150:748:150' '260:246:1140:96'
  '256:256:53:405' '256:256:403:405' '258:258:772:405' '256:256:1126:406'
  '252:256:43:746' '230:220:340:772' '480:176:580:792' '350:150:1070:808'
)
for i in "${!names[@]}"; do
  ffmpeg -hide_banner -loglevel error -y -i "$TMP_UI" \
    -vf "crop=${crops[$i]}" -frames:v 1 \
    -c:v libwebp -q:v 88 -compression_level 6 "$OUT_UI/${names[$i]}.webp"
done

# Split and alpha-tighten the three transparent heading rows.
heading=(chorus-heading solo-heading stage-heading)
heading_crops=('938:390:56:69' '894:420:72:548' '868:410:82:1036')
for row in 0 1 2; do
  ffmpeg -hide_banner -loglevel error -y -i "$SRC/transparent-headings.png" \
    -vf "crop=${heading_crops[$row]}" -frames:v 1 \
    -c:v libwebp -q:v 90 -compression_level 6 "$OUT_UI/${heading[$row]}.webp"
done

# Render a neutral 374x420 base and place each exact runtime monster sprite.
ffmpeg -hide_banner -loglevel error -y -i "$SRC/blank-card-source.png" \
  -vf 'scale=374:420:flags=lanczos' -frames:v 1 \
  -c:v libwebp -q:v 90 -compression_level 6 "$CARD_BASE"
for name in blue coral mint orange pink purple teal yellow; do
  ffmpeg -hide_banner -loglevel error -y -i "$CARD_BASE" \
    -i "$ROOT/assets/monsters/$name.webp" \
    -filter_complex '[1:v]scale=230:230:flags=lanczos[s];[0:v][s]overlay=(W-w)/2:92:format=auto' \
    -frames:v 1 -c:v libwebp -q:v 88 -compression_level 6 "$OUT_CARDS/$name.webp"
done
