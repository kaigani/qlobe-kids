#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SING_SRC="$ROOT/assets/source/gpt-image-2/singing-mouth-source.png"
BLINK_SRC="$ROOT/assets/source/gpt-image-2/blink-face-source.png"
GAZE_LEFT_SRC="$ROOT/assets/source/gpt-image-2/gaze-left-source.png"
GAZE_RIGHT_SRC="$ROOT/assets/source/gpt-image-2/gaze-right-source.png"
BASE="$ROOT/assets/monsters"
SING_OUT="$ROOT/assets/monsters-singing"
BLINK_OUT="$ROOT/assets/monsters-blink"
GAZE_LEFT_OUT="$ROOT/assets/monsters-gaze-left"
GAZE_RIGHT_OUT="$ROOT/assets/monsters-gaze-right"

mkdir -p "$SING_OUT" "$BLINK_OUT" "$GAZE_LEFT_OUT" "$GAZE_RIGHT_OUT"

# GPT Image 2 preserved the 4x2 character order but returned a 1922x818 RGB
# checkerboard sheet instead of registered true-alpha frames. Never swap those
# full frames: isolate only the authored facial regions with a feathered ellipse
# and composite them over the exact accepted 512px sprites. Body identity,
# silhouette, accessories and alpha therefore stay pixel-identical.
names=(mint pink blue purple orange yellow teal coral)
xs=(0 480 961 1441)
ws=(480 481 480 481)
ys=(0 0 0 0 409 409 409 409)

ellipse_alpha="255*clip((1-pow((X-W/2)/(W/2),2)-pow((Y-H/2)/(H/2),2))*10,0,1)"
firm_ellipse_alpha="255*clip((1-pow((X-W/2)/(W/2),2)-pow((Y-H/2)/(H/2),2))*14,0,1)"
mouth_pose_alpha="255*clip((1-pow((X-W/2)/(W*0.45),2)-pow((Y-H*0.45)/(H*0.45),2))*14,0,1)"
eyes_alpha="255*clip(max((1-pow((X-72)/68,2)-pow((Y-66)/68,2))*14,(1-pow((X-248)/68,2)-pow((Y-66)/68,2))*14),0,1)"

for i in "${!names[@]}"; do
  name="${names[$i]}"
  cell="crop=${ws[$i % 4]}:409:${xs[$i % 4]}:${ys[$i]},scale=512:512"
  # Every generated face has a slightly different registration. Tight,
  # subject-specific bounds keep both eyes outside the borrowed patch; the
  # upward-centered ellipse follows the sustained-vowel silhouette and fades
  # before the source fur can read as a circular sticker.
  case "$name" in
    mint)   mouth_crop="crop=98:116:208:285"; mouth_x=207; mouth_y=247 ;;
    pink)   mouth_crop="crop=102:112:185:292"; mouth_x=205; mouth_y=250 ;;
    blue)   mouth_crop="crop=98:114:183:288"; mouth_x=207; mouth_y=248 ;;
    purple) mouth_crop="crop=90:108:185:298"; mouth_x=210; mouth_y=250 ;;
    orange) mouth_crop="crop=100:122:206:286"; mouth_x=206; mouth_y=244 ;;
    yellow) mouth_crop="crop=104:116:191:300"; mouth_x=204; mouth_y=248 ;;
    teal)   mouth_crop="crop=102:120:181:288"; mouth_x=205; mouth_y=246 ;;
    coral)  mouth_crop="crop=100:116:174:298"; mouth_x=206; mouth_y=250 ;;
  esac

  # The generated sustained-vowel mouth is intentionally larger than the
  # neutral mouth. The tight crop excludes eyes and all checkerboard pixels.
  ffmpeg -hide_banner -loglevel error -y \
    -i "$BASE/$name.webp" -i "$SING_SRC" \
    -filter_complex \
      "[1:v]$cell,$mouth_crop,format=rgba,"\
"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='$mouth_pose_alpha'[mouth];"\
"[0:v][mouth]overlay=$mouth_x:$mouth_y:format=auto[out]" \
    -map '[out]' -frames:v 1 -c:v libwebp -q:v 82 -compression_level 6 \
    -pix_fmt yuva420p "$SING_OUT/$name.webp"

  # The blink source is registered differently by row. Use one coherent face
  # patch so the closed lids fully replace the neutral open eyes; the broad
  # feather stays entirely inside each monster's authored fur silhouette.
  blink_crop="crop=312:170:100:205"
  blink_x=100
  blink_y=180
  blink_mask="$ellipse_alpha"
  if (( i >= 4 )); then
    blink_crop="crop=312:170:100:215"
    blink_y=145
  fi
  if [[ "$name" == "yellow" ]]; then
    blink_crop="crop=288:210:112:180"
    blink_x=112
    blink_y=130
    blink_mask="$firm_ellipse_alpha"
  elif [[ "$name" == "teal" ]]; then
    blink_crop="crop=312:210:100:180"
    blink_y=120
    blink_mask="$firm_ellipse_alpha"
  fi
  blink_filter="[1:v]$cell,$blink_crop,format=rgba,"\
"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='$blink_mask'[face];"\
"[0:v][face]overlay=$blink_x:$blink_y:format=auto[out]"

  # The neutral pink/coral frames have long outer lashes. The broad face patch
  # removes almost all of them; these tiny local cleanups remove the remaining
  # pixels without touching the authored lids, brows, or mouths.
  if [[ "$name" == "pink" ]]; then
    blink_filter="[1:v]$cell,$blink_crop,format=rgba,"\
"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='$blink_mask'[face];"\
"[0:v][face]overlay=$blink_x:$blink_y:format=auto,"\
"delogo=x=338:y=184:w=34:h=36[out]"
  elif [[ "$name" == "coral" ]]; then
    blink_filter="[1:v]$cell,split=2[cellface][cellclean];"\
"[cellface]$blink_crop,format=rgba,"\
"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='$blink_mask'[face];"\
"[cellclean]crop=40:40:125:212,format=rgba,"\
"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='$ellipse_alpha'[clean];"\
"[0:v][face]overlay=$blink_x:$blink_y:format=auto[blinked];"\
"[blinked][clean]overlay=125:142:format=auto[out]"
  fi

  ffmpeg -hide_banner -loglevel error -y \
    -i "$BASE/$name.webp" -i "$BLINK_SRC" \
    -filter_complex "$blink_filter" \
    -map '[out]' -frames:v 1 -c:v libwebp -q:v 82 -compression_level 6 \
    -pix_fmt yuva420p "$BLINK_OUT/$name.webp"

  # GPT Image 2 returned two nearly registered full-cast gaze sheets. Preserve
  # exact runtime bodies by borrowing only a feathered eye-region patch from
  # the matching cell. The sources have different exact dimensions, so their
  # cell geometry is deliberately recorded separately here.
  left_x=$(( (i % 4) * 443 ))
  left_y=$(( (i / 4) * 444 ))
  right_x=$(( (i % 4) * 444 ))
  right_y=$(( (i / 4) * 443 ))
  ffmpeg -hide_banner -loglevel error -y \
    -i "$BASE/$name.webp" -i "$GAZE_LEFT_SRC" \
    -filter_complex \
      "[1:v]crop=443:444:$left_x:$left_y,scale=512:512,"\
"crop=320:142:96:158,format=rgba,"\
"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='$eyes_alpha'[eyes];"\
"[0:v][eyes]overlay=96:158:format=auto[out]" \
    -map '[out]' -frames:v 1 -c:v libwebp -q:v 82 -compression_level 6 \
    -pix_fmt yuva420p "$GAZE_LEFT_OUT/$name.webp"

  ffmpeg -hide_banner -loglevel error -y \
    -i "$BASE/$name.webp" -i "$GAZE_RIGHT_SRC" \
    -filter_complex \
      "[1:v]crop=444:443:$right_x:$right_y,scale=512:512,"\
"crop=320:142:96:158,format=rgba,"\
"geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='$eyes_alpha'[eyes];"\
"[0:v][eyes]overlay=96:158:format=auto[out]" \
    -map '[out]' -frames:v 1 -c:v libwebp -q:v 82 -compression_level 6 \
    -pix_fmt yuva420p "$GAZE_RIGHT_OUT/$name.webp"
done
