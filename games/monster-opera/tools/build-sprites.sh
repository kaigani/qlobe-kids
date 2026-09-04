#!/bin/sh
# Rebuild every monster's keyframe sprite package from the video masters in
# assets/source/video/. Run from any directory; needs ffmpeg + Pillow.
#
#   sh games/monster-opera/tools/build-sprites.sh            # all twelve
#   sh games/monster-opera/tools/build-sprites.sh 03 07      # just some
#
# The look parameters (--contrast 1.58 --saturation 1.06) reproduce the CSS
# filter the game applied to its black-backed videos, so the keyed frames
# match the approved art review. Every source frame is kept.
set -eu
game="$(cd "$(dirname "$0")/.." && pwd)"
tool="$game/../../tools/video-to-sprite-strips.py"
ids="${*:-01 02 03 04 05 06 07 08 09 10 11 12}"
for n in $ids; do
  m="monster-$n"
  src="$game/assets/source/video/$m"
  echo "== $m"
  python3 "$tool" \
    --out "$game/assets/monsters/$m/sprites" \
    --still "$game/assets/source/stills/$m.webp" \
    --loop dance --contrast 1.58 --saturation 1.06 --quality 85 --method 4 \
    "dance=$src/dance.mp4" \
    "noise-01=$src/noise-01.mp4" \
    "noise-02=$src/noise-02.mp4" \
    "noise-03=$src/noise-03.mp4"
done
