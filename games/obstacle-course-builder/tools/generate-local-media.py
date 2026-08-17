#!/usr/bin/env python3
"""LAN media driver for Obstacle Course Builder (dry-run unless --execute).

Narration uses a non-identifying voice designed from text. No recorded voice,
biometric reference, or machine-local identity sample is uploaded.
"""
from __future__ import annotations
import argparse, difflib, hashlib, json, os, re, subprocess, tempfile, urllib.request
from pathlib import Path

GAME=Path(__file__).resolve().parents[1]; ROOT=GAME.parents[1]; STATE=ROOT/'tools/state/local.json'
AUDIO=GAME/'assets/audio'; QA=GAME/'assets/source/qa'; VOICE_RAW=GAME/'assets/source/voice-raw'; ALLOWED=(AUDIO.resolve(),(GAME/'assets/source').resolve())
SEEDS=(7,8,9)
VOICE_INSTRUCT=('A warm, calm preschool adventure guide with a gentle smile in her voice, '
                'clear American English, unhurried pace, natural and encouraging, never sing-song.')
def state():
    try: return json.loads(STATE.read_text())
    except Exception as e: raise SystemExit(f'cannot read local state: {e}')
def safe(p, kind, exist=False):
    p=Path(p); p=(ROOT/p if not p.is_absolute() else p).resolve()
    if not any(p==r or r in p.parents for r in ALLOWED): raise SystemExit(f'{kind} outside allowed assets roots')
    if exist and not p.is_file(): raise SystemExit(f'{kind} does not exist')
    return p
def rel(p): return str(p.resolve().relative_to(ROOT))
def run(cmd, timeout=900):
    try: return subprocess.run(cmd,capture_output=True,text=True,timeout=timeout)
    except Exception as e: return subprocess.CompletedProcess(cmd,127,'',str(e))
def norm(s): return re.sub(r'[^a-z0-9]','',s.lower())
def ratio(a,b): return difflib.SequenceMatcher(None,norm(a),norm(b)).ratio()
def duration(path):
    r=run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(path)],30)
    try: return round(float(r.stdout.strip()),3)
    except Exception: return 0.0
def write(path,obj):
    path.parent.mkdir(parents=True,exist_ok=True); tmp=path.with_suffix(path.suffix+'.tmp'); tmp.write_text(json.dumps(obj,indent=2,ensure_ascii=False)+'\n'); tmp.replace(path)
def layered(a,cfg):
    src=Path(a.image); src=(ROOT/src if not src.is_absolute() else src).resolve()
    if GAME not in src.parents or not src.is_file(): raise SystemExit('image must be an existing file in this game')
    out=safe(a.output,'output'); qa=safe(a.qa,'QA directory')
    plan={'workflow':'qwen-image-layered','fields':{'prompt':a.prompt,'layers':2,'seed':a.seed,'steps':20,'cfg':2.5},'source':rel(src),'output':rel(out),'resultOutput':'layer_2'}
    if not a.execute: return plan
    if out.exists() and not a.overwrite: result={'status':'skipped','saved':rel(out)}
    else:
        body=('--form',f'image=@{src}','--form',f'prompt={a.prompt}','--form','layers=2','--form',f'seed={a.seed}')
        raw=out.with_suffix(out.suffix+'.tmp'); r=run(['curl','-sS','-X','POST',f"{cfg['qwenUrl'].rstrip('/')}/workflows/qwen-image-layered?sync=true",*body,'--output',str(raw)])
        if r.returncode or not raw.exists(): raise SystemExit('layered workflow failed')
        raw.replace(out); result={'status':'completed','saved':rel(out),'bytes':out.stat().st_size}
    write(qa/(out.stem+'.layered.recipe.json'),{'format':'qlobe-recipe','formatVersion':1,**plan,'result':result}); return plan
def voice(a,cfg):
    lines=json.loads((AUDIO/'lines.json').read_text()); manifest={}; qa={}; api=cfg.get('qwenUrl','').rstrip('/')
    if not a.execute:
        return {'workflow':'qwen3-tts-voicedesign','lines':len(lines),'voice':'non-identifying-designed-narrator','output':rel(AUDIO),'dryRun':True}
    if not api: raise SystemExit('configured local media endpoint is unavailable')
    AUDIO.mkdir(parents=True,exist_ok=True); QA.mkdir(parents=True,exist_ok=True); VOICE_RAW.mkdir(parents=True,exist_ok=True)
    try: previous=json.loads((AUDIO/'qa.json').read_text())
    except Exception: previous={}
    with tempfile.TemporaryDirectory(prefix='obstacle-voice-') as td:
      for key,text in lines.items():
        dest=AUDIO/(re.sub(r'[^a-z0-9-]','',key.lower())+'.m4a')
        prior=previous.get(key,{}) if isinstance(previous,dict) else {}
        if (dest.exists() and not a.overwrite and prior.get('valid') is True
            and prior.get('intended')==text and prior.get('ratio',0)>=.90
            and duration(dest)>=.25):
          manifest[key]={'file':dest.name,'dur':duration(dest),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'text':text}
          qa[key]={**prior,'duration':duration(dest),'bytes':dest.stat().st_size}; continue
        accepted=None; attempts=[]
        for seed in SEEDS:
          raw=Path(td)/(key+f'-{seed}.flac')
          r=run(['curl','-sS','-X','POST',f'{api}/workflows/qwen3-tts-voicedesign?sync=true','-F',f'instruct={VOICE_INSTRUCT}','-F',f'text={text}','-F',f'seed={seed}','--output',str(raw),'--max-time','900'],930)
          if r.returncode or not raw.exists() or raw.stat().st_size<2000: attempts.append({'seed':seed,'error':'synthesis failed'}); continue
          enc=Path(td)/(key+f'-{seed}.m4a'); e=run(['ffmpeg','-y','-loglevel','error','-i',str(raw),'-ac','1','-c:a','aac','-b:a','96k',str(enc)],60)
          if e.returncode: attempts.append({'seed':seed,'error':'encode failed'}); continue
          tr=run(['curl','-sS','-X','POST',f'{api}/workflows/whisper-stt?sync=true','-F',f'audio=@{enc}','-F','model_size=base','-F','language=en','-F',f'initial_prompt={text}','--max-time','900'],930)
          try: heard=str(json.loads(tr.stdout).get('text','')).strip()
          except Exception: heard=''
          sc=ratio(text,heard); attempts.append({'seed':seed,'heard':heard,'ratio':round(sc,3)})
          if sc>=.90 and duration(enc)>=.25:
            raw_dest=VOICE_RAW/f'{key}-s{seed}.flac'; raw.replace(raw_dest); enc.replace(dest); accepted=(seed,heard,sc,raw_dest); break
        if accepted:
          seed,heard,sc,raw_dest=accepted; dur=duration(dest); digest=hashlib.sha256(dest.read_bytes()).hexdigest(); manifest[key]={'file':dest.name,'dur':dur,'sha256':digest,'text':text}; qa[key]={'valid':True,'workflow':'qwen3-tts-voicedesign','seed':seed,'intended':text,'heard':heard,'ratio':round(sc,3),'file':dest.name,'duration':dur,'bytes':dest.stat().st_size,'sha256':digest}
          write(QA/(key+'.voice.recipe.json'),{'format':'qlobe-recipe','formatVersion':1,'workflow':'qwen3-tts-voicedesign','fields':{'instruct':VOICE_INSTRUCT,'text':text,'seed':seed},'source':rel(raw_dest),'output':rel(dest),'whisper':{'workflow':'whisper-stt','heard':heard,'ratio':round(sc,3),'accepted':True}})
        else: qa[key]={'valid':False,'intended':text,'attempts':attempts}
    write(AUDIO/'manifest.json',manifest if len(manifest)==len(lines) else {}); write(AUDIO/'qa.json',qa)
    if len(manifest)!=len(lines): raise SystemExit(f'voice QA incomplete: {len(manifest)}/{len(lines)} passed')
    return {'count':len(manifest),'total':len(lines),'workflow':'qwen3-tts-voicedesign'}
def main():
    p=argparse.ArgumentParser(); p.add_argument('--execute',action='store_true'); p.add_argument('--overwrite',action='store_true'); s=p.add_subparsers(dest='cmd',required=True)
    l=s.add_parser('layered'); l.add_argument('image'); l.add_argument('output'); l.add_argument('--prompt',required=True); l.add_argument('--seed',type=int,default=42); l.add_argument('--qa',default='games/obstacle-course-builder/assets/source/qa')
    v=s.add_parser('voice')
    a=p.parse_args(); cfg=state()
    print(json.dumps(layered(a,cfg) if a.cmd=='layered' else voice(a,cfg),sort_keys=True))
if __name__=='__main__': main()
