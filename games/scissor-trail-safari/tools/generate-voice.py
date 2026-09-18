#!/usr/bin/env python3
"""Resumable Qwen voice-clone production and Whisper QA for Safari lines."""
from __future__ import annotations
import argparse, difflib, hashlib, json, os, re, shutil, subprocess, tempfile
from pathlib import Path

GAME = Path(__file__).resolve().parents[1]; ROOT = GAME.parents[1]; OUT = GAME/'assets/audio'; STATE = ROOT/'tools/state/local.json'; SEEDS=(7,8,9)
def h(s): return hashlib.sha256(s.encode()).hexdigest()[:16]
def lines():
    p=OUT/'lines.json'
    if p.exists(): return json.loads(p.read_text())
    # Keep narration sourced from the shipped game configuration without importing JS.
    value={'intro':'Choose a paper safari trail for your finger-scissors!','nudge':'Steady scissors. Find the dotted cutting line and keep going.','cheer':'Safari rescue complete! Every paper animal is free!'}
    p.parent.mkdir(parents=True,exist_ok=True); p.write_text(json.dumps(value,indent=2)+'\n'); return value
def run(c,t=900): return subprocess.run(c,capture_output=True,text=True,timeout=t)
def whisper(api,p,expected):
    r=run(['curl','-sS','-X','POST',f'{api}/workflows/whisper-stt?sync=true','-F',f'audio=@{p}','-F','model_size=base','-F','language=en','-F',f'initial_prompt={expected}','--max-time','900'])
    try:
        v=json.loads(r.stdout); return str(v.get('text') or v.get('transcript') or '')
    except json.JSONDecodeError:return ''
def norm(s): return ' '.join(re.findall(r'[a-z0-9]+',s.lower()))
def trans_ok(want,got):
    a,b=norm(want),norm(got); score=difflib.SequenceMatcher(None,a,b).ratio(); cov=sum(x in b.split() for x in a.split())/max(1,len(a.split())); return (a==b or score>=.92 and cov>=.95),round(score,3),round(cov,3)
def duration(p):
    r=run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(p)],30)
    try:return round(float(r.stdout.strip()),3)
    except ValueError:return 0
def mean_volume(p):
    r=run(['ffmpeg','-hide_banner','-nostats','-i',str(p),'-af','volumedetect','-f','null','-'],60)
    m=re.search(r'mean_volume:\s*(-?[0-9.]+) dB',r.stderr)
    return round(float(m.group(1)),1) if m else None
def inspect_clip(api,p,expected):
    heard=whisper(api,p,expected) if api else ''
    match,score,cov=trans_ok(expected,heard)
    dur=duration(p); volume=mean_volume(p); size=p.stat().st_size if p.exists() else 0
    valid=bool(heard) and match and size>=2000 and .35<=dur<=20 and volume is not None and volume>-55
    return {'engine':'qwen3-tts-voiceclone','voice':'voice_teacher','sourceText':expected,'textHash':h(expected),'duration':dur,'meanVolumeDb':volume,'bytes':size,'transcript':heard,'score':score,'coverage':cov,'whisperVerified':bool(heard) and match,'valid':valid}
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--qwen-url','--base-url',dest='base_url'); ap.add_argument('--voice-ref','--teacher',dest='teacher'); ap.add_argument('--only',action='append'); ap.add_argument('--force',action='store_true'); ap.add_argument('--check',action='store_true'); a=ap.parse_args()
    try: st=json.loads(STATE.read_text())
    except (FileNotFoundError,json.JSONDecodeError): st={}
    api=(a.base_url or os.getenv('QLOBE_QWEN_URL') or st.get('qwenUrl','')).rstrip('/')
    refs=[a.teacher,os.getenv('QLOBE_VOICE_REF'),st.get('teacherVoicePath'),str(ROOT/'shared/assets/refs/voice-teacher.wav')]
    ref=next((Path(value).expanduser() for value in refs if value and Path(value).expanduser().is_file()),Path(''))
    text=lines(); OUT.mkdir(parents=True,exist_ok=True)
    keys=[k for k in text if not a.only or any(k==x or k.startswith(x+'-') for x in a.only)]
    if not keys: raise SystemExit('--only did not match configured lines')
    if not a.check and (not api or not ref.is_file()): raise SystemExit('LAN endpoint or approved voice reference missing')
    qa=json.loads((OUT/'qa.json').read_text()) if (OUT/'qa.json').exists() else {}
    try: prior_manifest=json.loads((OUT/'manifest.json').read_text())
    except (FileNotFoundError,json.JSONDecodeError): prior_manifest={}
    check_targets=set(keys if a.only else (key for key in keys if (OUT/f'{key}.m4a').exists() or key in prior_manifest))
    for key in keys:
        dest=OUT/f'{key}.m4a'; record=qa.get(key,{})
        if dest.exists() and (dest.stat().st_size == 0 or not record.get('valid')):
            dest.unlink()
        if not a.check and (a.force or not record.get('valid') or record.get('textHash')!=h(text[key])):
            for seed in SEEDS:
                with tempfile.TemporaryDirectory(prefix='safari-voice-',dir=OUT) as d:
                    flac=Path(d)/'voice.flac'; r=run(['curl','-sS','-X','POST',f'{api}/workflows/qwen3-tts-voiceclone?sync=true','-F',f'voice=@{ref}','-F',f'text={text[key]}','-F',f'seed={seed}','--output',str(flac),'--max-time','900'])
                    staged=Path(d)/'voice.m4a'
                    if r.returncode or not flac.exists() or flac.stat().st_size<1024: continue
                    r=run(['ffmpeg','-y','-loglevel','error','-i',str(flac),'-af','loudnorm=I=-18:TP=-2:LRA=9','-c:a','aac','-b:a','96k','-ar','24000','-ac','1','-movflags','+faststart',str(staged)],60)
                    if r.returncode or not staged.exists(): continue
                    attempt=inspect_clip(api,staged,text[key])
                    attempt['seed']=seed
                    qa[key]=attempt
                    if attempt['valid']:
                        shutil.copyfile(staged,dest.with_suffix('.m4a.tmp'))
                        dest.with_suffix('.m4a.tmp').replace(dest)
                        break
        if dest.exists():
            qa[key]=inspect_clip(api,dest,text[key])
        elif not a.check and (key not in qa or qa[key].get('valid')):
            qa[key]={'sourceText':text[key],'textHash':h(text[key]),'whisperVerified':False,'valid':False}
    manifest={}
    for key,value in text.items():
        dest=OUT/f'{key}.m4a'; record=qa.get(key,{})
        if dest.exists() and record.get('valid') and record.get('whisperVerified') and record.get('textHash')==h(value):
            manifest[key]={'file':key+'.m4a','dur':record['duration'],'textHash':h(value)}
    (OUT/'manifest.json.tmp').write_text(json.dumps(manifest,indent=2)+'\n'); (OUT/'manifest.json.tmp').replace(OUT/'manifest.json')
    (OUT/'qa.json.tmp').write_text(json.dumps(qa,indent=2)+'\n'); (OUT/'qa.json.tmp').replace(OUT/'qa.json')
    required=check_targets if a.check else set(keys)
    failed=any(not qa.get(key,{}).get('valid') for key in required)
    print(f'complete: {len(manifest)}/{len(text)} verified; checked {len(required)}'); return 1 if failed else 0
if __name__=='__main__': raise SystemExit(main())
