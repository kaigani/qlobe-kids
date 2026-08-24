#!/bin/bash
# Sticker Line Challenge — voice clone batch + manifest + Whisper QA (resumable).
set -u
API="http://192.168.1.181:8100"
GAME="$(cd "$(dirname "$0")/.." && pwd)"
AUD="$GAME/assets/audio"
REF="/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game/smoke/voice_teacher.wav"
mkdir -p "$AUD"

# key|text pairs — source of truth: config.json lines
LINES=(
"welcome|Hi! Pick a sticker friend!"
"picked|Great choice!"
"pick_line|Now, pick a line!"
"mode_waves|Wavy lines! Follow the wave with your finger."
"mode_zigzags|Zigzag trail! In and out, here we go!"
"mode_loops|Loop the loops! Round and round!"
"round_start|Put your finger on the sticker and follow the line!"
"halfway|Halfway! Keep going!"
"almost|Almost there!"
"nudge|Oops! Come back to the line!"
"cheer_1|You did it! Amazing tracing!"
"cheer_2|Wonderful! You followed the whole line!"
"cheer_3|Hooray! What careful fingers!"
"line_done|Line complete! You are a tracing superstar!"
"new_line|Pick a new line!"
)

gen_one() { # key text seed
  local key="$1" text="$2" seed="$3"
  local raw="$AUD/$key.flac" out="$AUD/$key.m4a"
  [ -s "$out" ] && { echo "[skip] $key"; return 0; }
  echo "[tts] $key seed=$seed"
  curl -s --max-time 900 -X POST "$API/workflows/qwen3-tts-voiceclone?sync=true" \
    -F "voice=@$REF" -F "text=$text" -F "seed=$seed" --output "$raw"
  [ -s "$raw" ] || { echo "[FAIL] $key (no audio)"; return 1; }
  ffmpeg -y -loglevel error -i "$raw" -c:a aac -b:a 64k -movflags +faststart "$out" \
    && rm -f "$raw" && echo "[ok] $key" || { echo "[FAIL] $key (encode)"; return 1; }
}

for pair in "${LINES[@]}"; do
  key="${pair%%|*}"; text="${pair#*|}"
  gen_one "$key" "$text" 7 || gen_one "$key" "$text" 8 || gen_one "$key" "$text" 9
done

# manifest with durations
python3 - "$AUD" <<'EOF'
import json, os, sys
aud = sys.argv[1]
manifest, lines = {}, {}
for f in sorted(os.listdir(aud)):
    if f.endswith(".m4a"):
        key = f[:-4]
        import subprocess
        dur = subprocess.run(["ffprobe","-v","quiet","-show_entries","format=duration",
                              "-of","csv=p=0", os.path.join(aud,f)],
                             capture_output=True, text=True).stdout.strip()
        manifest[key] = {"file": f, "dur": round(float(dur), 2)}
lines_path = os.path.join(os.path.dirname(aud), "..", "config.json")
cfg = json.load(open(lines_path))
lines = cfg["lines"]
json.dump(manifest, open(os.path.join(aud,"manifest.json"),"w"), indent=2)
json.dump(lines, open(os.path.join(aud,"lines.json"),"w"), indent=2)
print("manifest:", len(manifest), "clips; lines:", len(lines))
EOF

# Whisper QA
echo "== whisper QA =="
for pair in "${LINES[@]}"; do
  key="${pair%%|*}"; text="${pair#*|}"
  [ -s "$AUD/$key.m4a" ] || continue
  heard=$(curl -s --max-time 300 -X POST "$API/workflows/whisper-stt" \
    -F "audio=@$AUD/$key.m4a" -F "model_size=base" -F "language=en" \
    | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('text', d))" 2>/dev/null)
  echo "QA $key"
  echo "  want: $text"
  echo "  heard: $heard"
done
echo "done: audio"
