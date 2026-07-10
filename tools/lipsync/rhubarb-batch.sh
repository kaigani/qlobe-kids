#!/bin/bash
# Generate Rhubarb viseme timelines for a directory of voice clips.
#
#   ./rhubarb-batch.sh <wav-dir> <lines.json> <out-dir>
#
# - Requires rhubarb (https://github.com/DanielSWolf/rhubarb-lip-sync, MIT)
#   on PATH or via RHUBARB env var.
# - Clips may be FLAC-in-.wav (our TTS pipeline's habit); they're converted
#   to PCM WAVE via afconvert (macOS) before analysis.
# - lines.json maps clip key -> spoken text; the transcript drives Rhubarb's
#   highest-accuracy mode.
# - Output: <out-dir>/<key>.viseme.json (Rhubarb JSON, extended shapes GHX).
set -euo pipefail
WAVDIR="$1"; LINES="$2"; OUT="$3"
RB="${RHUBARB:-$(command -v rhubarb || true)}"
[ -x "$RB" ] || { echo "rhubarb not found — set RHUBARB=/path/to/rhubarb"; exit 2; }
mkdir -p "$OUT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

python3 - "$LINES" > "$TMP/keys.tsv" <<'EOF'
import json, sys
for k, v in json.load(open(sys.argv[1])).items():
    print(f"{k}\t{v}")
EOF

while IFS=$'\t' read -r key text; do
  SRC="$WAVDIR/$key.wav"
  [ -f "$SRC" ] || continue
  DST="$OUT/$key.viseme.json"
  [ -f "$DST" ] && continue
  PCM="$TMP/$key.pcm.wav"
  afconvert -f WAVE -d LEI16 "$SRC" "$PCM" 2>/dev/null || cp "$SRC" "$PCM"
  printf '%s' "$text" > "$TMP/$key.txt"
  "$RB" -f json --extendedShapes GHX -d "$TMP/$key.txt" "$PCM" -o "$DST" 2>/dev/null \
    && echo "ok  $key" || echo "FAIL $key"
done < "$TMP/keys.tsv"
