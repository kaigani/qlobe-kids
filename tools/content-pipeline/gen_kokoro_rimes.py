#!/usr/bin/env python3
"""Generate phoneme-exact Kokoro reference clips for every rime, as the
'correct pronunciation' reference for the A/B comparison page. Idempotent."""
import os, subprocess
ROOT = "/Users/kaigani/Documents/PROJECTS/DEVELOPMENT/260612 phonics game"
API = "http://192.168.1.181:8100/workflows/geeky-kokoro-tts?sync=true"
VOICE = "🇺🇸 🚺 Heart ❤️"
OUT = f"{ROOT}/sound-sprouts/assets/audio/ref_kokoro"
RAW = f"{ROOT}/02 generated/raw/kokoro"
FFMPEG = "/usr/local/bin/ffmpeg"
os.makedirs(OUT, exist_ok=True); os.makedirs(RAW, exist_ok=True)

# misaki/IPA phonemes, primary stress before the vowel to keep it full.
# short a=æ  e=ɛ  i=ɪ  o=ɑ  u=ʌ
IPA = {
  "at":"ˈæt","an":"ˈæn","ap":"ˈæp","ag":"ˈæɡ","am":"ˈæm","ad":"ˈæd","ab":"ˈæb","ax":"ˈæks","ak":"ˈæk",
  "ed":"ˈɛd","eg":"ˈɛɡ","em":"ˈɛm","en":"ˈɛn","et":"ˈɛt","eb":"ˈɛb",
  "ig":"ˈɪɡ","in":"ˈɪn","ip":"ˈɪp","it":"ˈɪt","ix":"ˈɪks","ib":"ˈɪb","id":"ˈɪd",
  "og":"ˈɑɡ","op":"ˈɑp","ot":"ˈɑt","ox":"ˈɑks","ob":"ˈɑb","od":"ˈɑd","om":"ˈɑm",
  "un":"ˈʌn","up":"ˈʌp","ug":"ˈʌɡ","ub":"ˈʌb","ud":"ˈʌd","um":"ˈʌm","ut":"ˈʌt","us":"ˈʌs",
}

def gen(rime, ipa):
    out = f"{OUT}/{rime}.m4a"
    if os.path.exists(out) and os.path.getsize(out) > 1500:
        return "skip"
    raw = f"{RAW}/{rime}.wav"
    try:
        subprocess.run(["curl","-s","-X","POST",API,"-F",f"text={ipa}",
                        "-F","use_phonemes=true","-F",f"voice={VOICE}",
                        "--output",raw,"--max-time","300"], capture_output=True, timeout=320)
    except subprocess.TimeoutExpired:
        return "FAIL(timeout)"
    if not (os.path.exists(raw) and os.path.getsize(raw) > 1500):
        return "FAIL(no audio)"
    subprocess.run([FFMPEG,"-y","-loglevel","error","-i",raw,"-c:a","aac","-b:a","64k",out],
                   capture_output=True)
    return "ok" if os.path.exists(out) else "FAIL(convert)"

if __name__ == "__main__":
    for rime, ipa in IPA.items():
        print(rime, ipa, gen(rime, ipa), flush=True)
    print("=== KOKORO RIMES DONE ===")
