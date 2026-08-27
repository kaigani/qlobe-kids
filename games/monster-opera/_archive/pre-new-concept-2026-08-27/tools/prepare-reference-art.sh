#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../../.." && pwd)"
MOCKUPS="$ROOT/01-game-concepts/monster-opera/output/ui-mockups"
OUT="$ROOT/qlobe-kids/games/monster-opera/assets/source"
UI="$OUT/ui-mockups"
KEYS="$OUT/video-keys"
mkdir -p "$UI" "$KEYS"

cp "$MOCKUPS/00-overview.png" "$UI/splash.png"
cp "$MOCKUPS/01-make-a-chorus.png" "$UI/chorus.png"
cp "$MOCKUPS/02-sing-with-me.png" "$UI/solo.png"
cp "$MOCKUPS/03-pick-a-stage.png" "$UI/stages.png"
cp "$MOCKUPS/04-full-choir.png" "$UI/show.png"

# The chorus mockup contains a 4x2 card grid. Each crop is scaled by height,
# preserving its portrait ratio, then centered on a pale-lavender 832x480 pad.
src="$UI/chorus.png"
cards=(
  "mint:48:190" "pink:394:190" "blue:741:190" "purple:1080:190"
  "orange:48:580" "yellow:394:580" "teal:741:580" "coral:1080:580"
)
for card in "${cards[@]}"; do
  IFS=: read -r name x y <<< "$card"
  ffmpeg -y -loglevel error -i "$src" \
    -vf "crop=330:370:${x}:${y},scale=-2:430:flags=lanczos,pad=832:480:(ow-iw)/2:(oh-ih)/2:color=#e9e2ff,format=rgb24" \
    -frames:v 1 "$KEYS/$name.png"
done
