#!/usr/bin/env python3
"""Re-voice the 18 Kokoro rimes into the warm teacher voice WITHOUT losing the
correct pronunciation: voice-convert (chatterbox v2v) the phoneme-exact Kokoro
clip (source = correct sound) into a teacher-voice target built from the
celebration/word/prompt clips of words that contain that rime. Candidates land
in assets/audio/cand_clone/ for the A/B comparison page (not shipped yet)."""
import os, json, subprocess, re
ROOT = "/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game"
AUD = f"{ROOT}/sound-sprouts/assets/audio"
KOK = f"{AUD}/ref_kokoro"
OUT = f"{AUD}/cand_clone"
TMP = "/tmp/clone_ref"
V2V = "http://192.168.1.181:8100/workflows/chatterbox-v2v?sync=true"
WH = "http://192.168.1.181:8100/workflows/whisper-stt?sync=true"
FFMPEG = "/usr/local/bin/ffmpeg"
os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)

TARGETS = ["ag","am","ab","ax","ed","em","et","eb","ig","in","ib","id","og","ot","ob","om","un","up"]
TRIM = ("silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak,"
        "areverse,silenceremove=start_periods=1:start_duration=0:start_threshold=-45dB:detection=peak,areverse")

words = json.load(open(f"{ROOT}/content/words.json"))["words"]
by_rime = {}
for w in words:
    by_rime.setdefault(w["rime"], []).append(w["word"])

def build_ref(rime):
    """Concatenate celebrate+word+prompt clips of the rime's words -> teacher ref."""
    items = []
    for wd in by_rime.get(rime, []):
        for cat in ("celebrate", "words", "prompts"):
            p = f"{AUD}/{cat}/{wd}.m4a"
            if os.path.exists(p): items.append(p)
    if not items:
        return None
    lst = f"{TMP}/list_{rime}.txt"
    with open(lst, "w") as f:
        for p in items: f.write(f"file '{p}'\n")
    ref = f"{TMP}/ref_{rime}.wav"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", lst, "-ar", "24000", "-ac", "1", ref], capture_output=True)
    return ref if os.path.exists(ref) else None

def whisper(p):
    try:
        out = subprocess.run(["curl","-s","-X","POST",WH,"-F",f"audio=@{p}",
                              "-F","model_size=base","-F","language=en"], capture_output=True, text=True).stdout
        return json.loads(out).get("text","").strip()
    except Exception:
        return "?"

def gen(rime):
    out = f"{OUT}/{rime}.m4a"
    src = f"{KOK}/{rime}.m4a"
    ref = build_ref(rime)
    if not ref or not os.path.exists(src):
        return "FAIL(no ref/src)"
    raw = f"{TMP}/v2v_{rime}.wav"
    for seed in range(3):
        r = subprocess.run(["curl","-s","-X","POST",V2V,"-F",f"source_audio=@{src}",
                            "-F",f"target_voice=@{ref}","--output",raw,"--max-time","300"],
                           capture_output=True)
        if os.path.exists(raw) and os.path.getsize(raw) > 3000:
            break
    if not (os.path.exists(raw) and os.path.getsize(raw) > 3000):
        return "FAIL(no audio)"
    subprocess.run([FFMPEG,"-y","-loglevel","error","-i",raw,
                    "-af",f"{TRIM},loudnorm=I=-18:TP=-1.5:LRA=11","-ar","24000","-c:a","aac","-b:a","64k",out],
                   capture_output=True)
    if not os.path.exists(out): return "FAIL(convert)"
    d = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",out],
                       capture_output=True, text=True).stdout.strip()
    return f"ok dur={d}s nwords={len(by_rime.get(rime,[]))} whisper='{whisper(out)}'"

if __name__ == "__main__":
    for r in TARGETS:
        print(r, gen(r), flush=True)
    print("=== CLONE CANDIDATES DONE ===")
