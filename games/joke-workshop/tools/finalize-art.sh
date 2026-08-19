#!/usr/bin/env bash
set -euo pipefail

GAME_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_DIR="$GAME_DIR/assets/source/gpt-image-2"
WORK_DIR="$SOURCE_DIR/finalized"
ART_DIR="$GAME_DIR/assets/art"

mkdir -p \
  "$WORK_DIR/characters" \
  "$WORK_DIR/ui" \
  "$ART_DIR/backgrounds" \
  "$ART_DIR/topics" \
  "$ART_DIR/answers" \
  "$ART_DIR/ui"

for tool in ffmpeg ffprobe cwebp; do
  command -v "$tool" >/dev/null || {
    echo "Missing required tool: $tool" >&2
    exit 1
  }
done

assert_size() {
  local image_path="$1"
  local expected="$2"
  local actual
  actual="$(ffprobe -v error -select_streams v:0 \
    -show_entries stream=width,height -of csv=s=x:p=0 "$image_path")"
  if [[ "$actual" != "$expected" ]]; then
    echo "Unexpected dimensions for $image_path: $actual (expected $expected)" >&2
    exit 1
  fi
}

assert_size "$SOURCE_DIR/stage-background.png" "1448x1086"
assert_size "$SOURCE_DIR/character-sheet-alpha.png" "1448x1086"
assert_size "$SOURCE_DIR/ui-sheet-alpha.png" "1448x1086"
assert_size "$SOURCE_DIR/title-alpha.png" "1448x1086"
assert_size "$SOURCE_DIR/gummy-bear-alpha.png" "1254x1254"

# The generated sheets are exact 4:3 canvases. A 4x3 grid therefore yields
# twelve deterministic 362x362 cells with no interpolation or guessed bounds.
character_names=(
  bear bear-gummy bear-sleepy bear-dancing
  banana banana-peeling banana-split banana-phone
  ghost ghost-berries ghost-toast ghost-moon
)

ui_names=(
  topic-card-gold topic-card-cream topic-card-lavender joke-book
  choice-card-green choice-card-blue choice-card-violet question-banner
  button-red button-blue button-orange speech-plaque
)

crop_sheet() {
  local sheet="$1"
  local group="$2"
  shift 2
  local names=("$@")
  local index name row column x y png

  for index in "${!names[@]}"; do
    name="${names[$index]}"
    row=$((index / 4))
    column=$((index % 4))
    x=$((column * 362))
    y=$((row * 362))
    png="$WORK_DIR/$group/$name.png"
    ffmpeg -hide_banner -loglevel error -y -i "$sheet" \
      -vf "crop=362:362:$x:$y" -frames:v 1 "$png"
  done
}

crop_sheet "$SOURCE_DIR/character-sheet-alpha.png" characters "${character_names[@]}"

# UI props do not obey the visual contact-sheet guides: the wide buttons and
# plaques deliberately cross nominal cells. These bounds were inspected on the
# accepted 1448x1086 source and isolate each complete silhouette. Every prop is
# proportionally fitted onto a common transparent canvas for predictable CSS.
extract_ui_prop() {
  local name="$1"
  local width="$2"
  local height="$3"
  local x="$4"
  local y="$5"
  ffmpeg -hide_banner -loglevel error -y -i "$SOURCE_DIR/ui-sheet-alpha.png" \
    -vf "crop=$width:$height:$x:$y,scale=340:340:force_original_aspect_ratio=decrease,pad=362:362:(ow-iw)/2:(oh-ih)/2:color=0x00000000" \
    -frames:v 1 "$WORK_DIR/ui/$name.png"
}

extract_ui_prop topic-card-gold     290 440   50  20
extract_ui_prop topic-card-cream    300 440  380  20
extract_ui_prop topic-card-lavender 300 440  700  20
extract_ui_prop joke-book           420 450 1010  20
extract_ui_prop choice-card-green   320 370   40 460
extract_ui_prop choice-card-blue    300 370  370 460
extract_ui_prop choice-card-violet  300 370  680 460
extract_ui_prop question-banner     470 260  960 530
extract_ui_prop button-red          350 200   20 840
extract_ui_prop button-blue         330 200  365 840
extract_ui_prop button-orange       330 200  685 840
extract_ui_prop speech-plaque       420 220 1010 830

# Wide props keep their inspected native aspect ratio. Their CSS containers
# already define the desired on-screen dimensions; retaining a rectangular
# source prevents the usable paper face from collapsing into a thin strip.
extract_ui_native() {
  local name="$1"
  local width="$2"
  local height="$3"
  local x="$4"
  local y="$5"
  ffmpeg -hide_banner -loglevel error -y -i "$SOURCE_DIR/ui-sheet-alpha.png" \
    -vf "crop=$width:$height:$x:$y" -frames:v 1 "$WORK_DIR/ui/$name.png"
}

extract_ui_native question-banner 470 260  960 530
extract_ui_native button-red      350 200   20 840
extract_ui_native button-blue     330 200  365 840
extract_ui_native button-orange   330 200  685 840
extract_ui_native speech-plaque   420 220 1010 830

for topic in bear banana ghost; do
  cwebp -quiet -q 88 -alpha_q 96 \
    "$WORK_DIR/characters/$topic.png" \
    -o "$ART_DIR/topics/$topic.webp"
done

for answer in \
  bear-gummy bear-sleepy bear-dancing \
  banana-peeling banana-split banana-phone \
  ghost-berries ghost-toast ghost-moon; do
  cwebp -quiet -q 88 -alpha_q 96 \
    "$WORK_DIR/characters/$answer.png" \
    -o "$ART_DIR/answers/$answer.webp"
done

# The original contact-sheet gummy bear had a visible generation corruption.
# A dedicated, approved repair generation replaces only that answer asset.
cwebp -quiet -q 90 -alpha_q 98 -resize 362 362 \
  "$SOURCE_DIR/gummy-bear-alpha.png" \
  -o "$ART_DIR/answers/bear-gummy.webp"

for furniture in "${ui_names[@]}"; do
  cwebp -quiet -q 88 -alpha_q 96 \
    "$WORK_DIR/ui/$furniture.png" \
    -o "$ART_DIR/ui/$furniture.webp"
done

# The title has intentional transparent breathing room, but the source canvas
# is much taller than the lockup. This fixed crop was visually inspected on the
# accepted generation and retains the complete paper shadow silhouette.
ffmpeg -hide_banner -loglevel error -y -i "$SOURCE_DIR/title-alpha.png" \
  -vf "crop=1448:760:0:135,scale=1000:-2" -frames:v 1 "$WORK_DIR/title.png"
cwebp -quiet -q 90 -alpha_q 98 "$WORK_DIR/title.png" -o "$ART_DIR/title.webp"

cwebp -quiet -q 82 "$SOURCE_DIR/stage-background.png" \
  -o "$ART_DIR/backgrounds/comedy-stage.webp"

echo "Finalized Joke Workshop art in $ART_DIR"
