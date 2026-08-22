#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../../.." && pwd)"
workspace_root="$(cd "$repo_root/.." && pwd)"
concept_root="$workspace_root/01-game-concepts/monster-opera"
source_out="$repo_root/games/monster-opera/assets/source/concept-audio"
runtime_out="$repo_root/games/monster-opera/assets/audio/monsters"

video_tablet="$concept_root/dreamina-2026-08-17-2003-Tablet game demo for preschool age. Fast....mp4"
video_twelve="$concept_root/dreamina-2026-08-17-3309-Preschool show animation_ Twelve singing....mp4"
video_six="$concept_root/dreamina-2026-08-17-1377-Preschool show animation_ Six singing mo....mp4"

mkdir -p "$source_out" "$runtime_out"

# These are audition cuts, chosen where the video shows an individual singer.
# The source videos expose only a lossy stereo mix, so every cut remains marked
# provisional until the cleaner MiniMax H3 dry-vocal jobs are explicitly run.
cuts=(
  "mint|$video_twelve|3.80|1.25"
  "pink|$video_six|1.35|1.45"
  "blue|$video_six|4.14|0.92"
  "purple|$video_twelve|5.85|1.25"
  "orange|$video_six|5.64|1.16"
  "yellow|$video_twelve|7.90|1.20"
  "teal|$video_six|7.10|1.45"
  "coral|$video_tablet|5.75|1.10"
)

for cut in "${cuts[@]}"; do
  IFS='|' read -r id source start duration <<< "$cut"
  master="$source_out/$id.wav"
  runtime="$runtime_out/$id.mp3"
  fade_out="$(awk -v d="$duration" 'BEGIN { printf "%.3f", d - 0.035 }')"

  ffmpeg -hide_banner -loglevel error -y \
    -ss "$start" -t "$duration" -i "$source" -vn \
    -af "pan=mono|c0=0.5*c0+0.5*c1,highpass=f=90,lowpass=f=8500,afade=t=in:st=0:d=0.018,afade=t=out:st=$fade_out:d=0.035,loudnorm=I=-20:LRA=7:TP=-2" \
    -ar 44100 -c:a pcm_s16le "$master"

  ffmpeg -hide_banner -loglevel error -y -i "$master" \
    -c:a libmp3lame -b:a 96k -ar 44100 -ac 1 "$runtime"
done

for audio in "$runtime_out"/*.mp3; do
  ffprobe -v error -select_streams a:0 \
    -show_entries stream=codec_name,sample_rate,channels:format=duration,size \
    -of compact=p=0:nk=1 "$audio"
done
