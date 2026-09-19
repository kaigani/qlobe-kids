#!/usr/bin/env python3
"""Produce Happy Ripe Fruit voice lines with the approved local TTS/Whisper workflow."""
from __future__ import annotations
import argparse, difflib, hashlib, json, os, re, subprocess
from datetime import datetime, timezone
from pathlib import Path

GAME=Path(__file__).resolve().parents[1]; ROOT=GAME.parents[1]
OUT=GAME/'assets/audio'; RAW=GAME/'assets/source/local-api/voice'; REF=ROOT/'shared/assets/refs/voice-teacher.wav'
def load(p,d=None):
 try:return json.loads(p.read_text('utf-8'))
 except (OSError,json.JSONDecodeError):return d if d is not None else {}
def norm(s):return ' '.join(re.findall(r'[a-z0-9]+',s.lower()))
def dur(p):
 r=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(p)],capture_output=True,text=True)
 try:return round(float(r.stdout.strip()),3)
 except ValueError:return 0
def plausible(t,s):return .25<=s<=1.9+max(1,len(t.split()))*.72
def post(url,fields,out,min_size=1):
 cmd=['curl','-sS','-X','POST',url]; [cmd.extend(['-F',f]) for f in fields]; cmd += ['--output',str(out),'--connect-timeout','5','--max-time','90']
 try:r=subprocess.run(cmd,capture_output=True,timeout=100)
 except (OSError,subprocess.TimeoutExpired):return False
 return r.returncode==0 and out.exists() and out.stat().st_size>=min_size
def encode(raw,final):
 r=subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(raw),'-vn','-af','silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9','-c:a','aac','-b:a','80k','-ar','24000','-ac','1','-movflags','+faststart',str(final)],capture_output=True,timeout=180)
 return r.returncode==0 and final.exists() and final.stat().st_size>1500
def main():
 p=argparse.ArgumentParser(); p.add_argument('--seed',type=int,default=7); p.add_argument('--only',nargs='*'); p.add_argument('--force',action='store_true'); p.add_argument('--dry-run',action='store_true'); a=p.parse_args()
 cfg=load(GAME/'config.json'); lines=cfg.get('voice',{}); OUT.mkdir(parents=True,exist_ok=True); RAW.mkdir(parents=True,exist_ok=True)
 (OUT/'lines.json').write_text(json.dumps(lines,indent=2,ensure_ascii=False)+'\n','utf-8')
 if a.dry_run: print(f'dry-run: {len(lines)} voice lines; seeds 7,8,9; reference={REF.name}'); return 0
 state=load(ROOT/'tools/state/local.json'); base=(os.environ.get('QLOBE_QWEN_URL') or state.get('qwenUrl') or '').rstrip('/')
 if not base: raise SystemExit('Qwen endpoint missing');
 if not REF.exists(): raise SystemExit(f'missing approved reference {REF}')
 keys=a.only or list(lines); unknown=[k for k in keys if k not in lines]
 if unknown: raise SystemExit('unknown keys: '+','.join(unknown))
 tts=f'{base}/workflows/qwen3-tts-voiceclone?sync=true'; whisper=f'{base}/workflows/whisper-stt?sync=true'
 previous_receipt=load(RAW/'receipt.json'); generated=dict(previous_receipt.get('generation',{}))
 qa=load(OUT/'qa.json'); manifest={k:v for k,v in load(OUT/'manifest.json').items() if k in lines and isinstance(v,dict)}
 for key in keys:
  text=lines[key]; final=OUT/f'{key}.m4a'; raw=RAW/f'{key}-seed{a.seed}.flac'
  if not a.force and final.exists() and plausible(text,dur(final)):
   generated[key]={'seed':manifest.get(key,{}).get('seed',a.seed),'status':'kept','duration':dur(final)}; continue
  ok=False
  for seed in [a.seed,8,9]:
   raw=RAW/f'{key}-seed{seed}.flac'
   ok=(raw.exists() and raw.stat().st_size>1500 and not a.force) or post(tts,[f'voice=@{REF}',f'text={text}',f'seed={seed}'],raw,1500)
   if ok and encode(raw,final): generated[key]={'seed':seed,'status':'encoded','duration':dur(final)}; break
  if not ok: generated[key]={'seed':a.seed,'status':'tts-failed'}
 for key in keys:
  text=lines[key]; final=OUT/f'{key}.m4a'; seconds=dur(final) if final.exists() else 0
  if not final.exists() or not plausible(text,seconds): qa[key]={'accepted':False,'reason':'missing or implausible duration','want':text,'duration':seconds}; manifest.pop(key,None); continue
  seed=int(generated.get(key,{}).get('seed',manifest.get(key,{}).get('seed',a.seed)))
  tr=RAW/f'{key}-seed{seed}-transcript.json'; ok=post(whisper,[f'audio=@{final}','model_size=base','language=en',f'initial_prompt=Happy Ripe Fruit. {text}'],tr); payload=load(tr) if ok else {}; heard_raw=str(payload.get('text') or payload.get('transcript') or '').strip(); want=norm(text); heard=norm(heard_raw); score=difflib.SequenceMatcher(None,want,heard).ratio(); words=want.split(); coverage=sum(w in heard.split() for w in words)/max(1,len(words)); accepted=heard==want if len(words)<=3 else score>=.86 and coverage>=.90
  qa[key]={'accepted':accepted,'score':round(score,3),'coverage':round(coverage,3),'want':text,'transcript':heard_raw,'seed':seed,'duration':seconds}
  if accepted: manifest[key]={'file':final.name,'dur':seconds,'textHash':hashlib.sha256(text.encode()).hexdigest()[:16],'seed':seed}
  else: manifest.pop(key,None)
 (OUT/'manifest.json').write_text(json.dumps({'_v':hashlib.sha256(json.dumps(manifest,sort_keys=True).encode()).hexdigest()[:12],**dict(sorted(manifest.items()))},indent=2)+'\n','utf-8'); (OUT/'qa.json').write_text(json.dumps(dict(sorted(qa.items())),indent=2,ensure_ascii=False)+'\n','utf-8')
 receipt={'format':'qlobe-voice-production-receipt','formatVersion':1,'game':GAME.name,'createdAt':datetime.now(timezone.utc).isoformat(),'workflow':'qwen3-tts-voiceclone -> AAC/M4A -> whisper-stt transcript QA','endpoint':'authorized local workflow API (address intentionally omitted)','reference':str(REF.relative_to(ROOT)).replace('\\','/'),'generation':generated,'accepted':[k for k in lines if k in manifest],'fallback':[k for k in lines if k not in manifest]}; (RAW/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n','utf-8'); print(f"voice complete: {len(receipt['accepted'])}/{len(lines)} accepted")
if __name__=='__main__':main()
