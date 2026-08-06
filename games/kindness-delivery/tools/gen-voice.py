#!/usr/bin/env python3
"""Generate cloned teacher clips in one TTS batch, then run Whisper QA."""
from __future__ import annotations
import argparse, difflib, hashlib, json, os, re, subprocess, sys
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]; ROOT = GAME.parents[1]
OUTPUT = GAME / "assets/audio"; RAW = GAME / "assets/source/local-api/voice"
REFERENCE = ROOT / "shared/assets/refs/voice-teacher.wav"
LINES = json.loads((OUTPUT / "lines.json").read_text())

def norm(s): return " ".join(re.findall(r"[a-z0-9]+", s.lower()))
def duration(p):
    r = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",str(p)],capture_output=True,text=True)
    try: return round(float(r.stdout.strip()),3)
    except ValueError: return 0
def call(url, fields, out, minimum=1):
    out.parent.mkdir(parents=True, exist_ok=True); cmd=["curl","-sS","-X","POST",url]
    for f in fields: cmd += ["-F", f]
    cmd += ["--output",str(out),"--max-time","900"]
    r=subprocess.run(cmd,capture_output=True,timeout=930); return r.returncode==0 and out.exists() and out.stat().st_size>=minimum

def main():
    p=argparse.ArgumentParser(); p.add_argument("--seed",type=int,default=7); p.add_argument("--only",nargs="*",default=None); p.add_argument("--force",action="store_true"); a=p.parse_args()
    state_path=ROOT/"tools/state/local.json"
    try: state=json.loads(state_path.read_text())
    except (OSError,json.JSONDecodeError): state={}
    base=(os.getenv("QLOBE_QWEN_URL") or state.get("qwenUrl") or "").rstrip("/")
    if not base: raise SystemExit("Qwen endpoint missing: set QLOBE_QWEN_URL or tools/state/local.json qwenUrl")
    if not REFERENCE.exists(): raise SystemExit(f"approved teacher voice reference missing: {REFERENCE}")
    OUTPUT.mkdir(parents=True,exist_ok=True); RAW.mkdir(parents=True,exist_ok=True)
    keys=a.only or list(LINES); bad=[k for k in keys if k not in LINES]
    if bad: raise SystemExit("unknown voice key(s): "+", ".join(bad))
    tts=f"{base}/workflows/qwen3-tts-voiceclone?sync=true"; whisper=f"{base}/workflows/whisper-stt?sync=true"
    for k in keys:
        final=OUTPUT/f"{k}.m4a"; raw=RAW/f"{k}-seed{a.seed}.flac"
        if not a.force and final.exists() and duration(final)>.25: continue
        if not (raw.exists() and raw.stat().st_size>1500) and not call(tts,[f"voice=@{REFERENCE}",f"text={LINES[k]}",f"seed={a.seed}"],raw,1500): continue
        subprocess.run(["ffmpeg","-y","-loglevel","error","-i",str(raw),"-af","loudnorm=I=-18:TP=-2:LRA=9","-c:a","aac","-b:a","80k","-ar","24000","-ac","1","-movflags","+faststart",str(final)],check=True)
    qa_path=OUTPUT/"qa.json"; manifest_path=OUTPUT/"manifest.json"
    try: qa=json.loads(qa_path.read_text())
    except (OSError,json.JSONDecodeError): qa={}
    try: manifest=json.loads(manifest_path.read_text())
    except (OSError,json.JSONDecodeError): manifest={}
    for k in keys:
        final=OUTPUT/f"{k}.m4a"
        if not final.exists():
            qa[k]={"accepted":False,"reason":"missing clip","want":LINES[k]}
            manifest.pop(k,None)
            continue
        tr=RAW/f"{k}-transcript.json"; ok=call(whisper,[f"audio=@{final}","model_size=base","language=en"],tr)
        try: heard=str(json.loads(tr.read_text()).get("text","")).strip() if ok else ""
        except Exception: heard=""
        score=difflib.SequenceMatcher(None,norm(LINES[k]),norm(heard)).ratio(); accepted=score>=.72
        qa[k]={"accepted":accepted,"score":round(score,3),"want":LINES[k],"transcript":heard,"seed":a.seed,"duration":duration(final)}
        if accepted: manifest[k]={"file":final.name,"dur":duration(final),"textHash":hashlib.sha256(LINES[k].encode()).hexdigest()[:16]}
        else: manifest.pop(k,None)
    manifest_path.write_text(json.dumps(manifest,indent=2)+"\n"); qa_path.write_text(json.dumps(qa,indent=2,ensure_ascii=False)+"\n")
if __name__=="__main__": sys.exit(main())
