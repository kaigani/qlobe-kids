#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/assets/source/gpt-image-2/monster-lineup-alpha.png"
OUT="$ROOT/assets/monsters"
mkdir -p "$OUT"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

# The lineup is a fixed 4x2 sheet. Keep these explicit boundaries so reruns
# remain deterministic even when adjacent cells have different widths.
names=(mint pink blue purple orange yellow teal coral)
xs=(0 443 887 1330)
ws=(443 444 443 444)
ys=(0 0 0 0 443 443 443 443)
for i in "${!names[@]}"; do
  row=$((i / 4))
  col=$((i % 4))
  y=$((row == 0 ? 0 : 443))
  raw="$TMP_DIR/${names[$i]}-raw.png"
  repaired="$TMP_DIR/${names[$i]}-repaired.png"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$SRC" \
    -vf "crop=${ws[$col]}:443:${xs[$col]}:${y},scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=black@0" \
    -frames:v 1 "$raw"

  # Preserve the original two-pixel silhouette feather while repairing the
  # source PNG's low-alpha dark eyes, mouths, brows, and claws.
  python3 "$ROOT/tools/repair-alpha.py" "$raw" "$repaired"

  ffmpeg -hide_banner -loglevel error -y \
    -i "$repaired" \
    -frames:v 1 -c:v libwebp -q:v 80 -compression_level 6 -pix_fmt yuva420p \
    "$OUT/${names[$i]}.webp"
done
