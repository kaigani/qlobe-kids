#!/usr/bin/env python3
"""Generate Sound Hopscotch voiceclone clips and Whisper transcript QA."""
import argparse,difflib,hashlib,json,os,re,shutil,subprocess,sys
from pathlib import Path
GAME=Path(__file__).resolve().parents[1]; ROOT=GAME.parents[1]; OUT=GAME/'assets/audio'; RAW=GAME/'assets/source/local-api/voice'; LINES=OUT/'lines.json'
def norm(s): return ' '.join(re.findall(r'[a-z0-9]+',s.lower()))
def sha(s): return hashlib.sha256(s.encode()).hexdigest()[:16]
def dur(p):
 r=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(p)],capture_output=True,text=True)
 try:return round(float(r.stdout.strip()),3)
 except ValueError:return 0
def post(url,fields,out):
 out.parent.mkdir(parents=True,exist_ok=True); c=['curl','-sS','-X','POST',url]
 for f in fields:c+=['-F',f]
 r=subprocess.run(c+['--output',str(out),'--max-time','900'],capture_output=True,timeout=930); return r.returncode==0 and out.exists() and out.stat().st_size>1000
def encode(src,dst):
 r=subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(src),'-af','silenceremove=start_periods=1:start_silence=0.04:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_silence=0.10:start_threshold=-45dB,areverse,loudnorm=I=-18:TP=-2:LRA=9','-c:a','aac','-b:a','96k','-ar','24000','-ac','1','-movflags','+faststart',str(dst)],capture_output=True,timeout=180); return r.returncode==0 and dst.exists() and dur(dst)>=.25
def transcript(p):
 try:
  j=json.loads(p.read_text()); return str(j.get('text') or j.get('transcript') or '').strip()
 except (OSError,ValueError):return ''
def score(want,got):
 a,b=norm(want),norm(got); aw,bw=a.split(),b.split(); ratio=difflib.SequenceMatcher(None,a,b).ratio(); cov=sum(x in bw for x in aw)/max(1,len(aw)); return (a==b or ratio>=.90 and cov>=.90),round(ratio,3),round(cov,3)
def main():
 p=argparse.ArgumentParser(description='Generate Sound Hopscotch voiceclone clips and Whisper QA.'); p.add_argument('--qwen-url',default=os.environ.get('QLOBE_QWEN_URL','http://localhost:8100')); p.add_argument('--voice-ref',default=str(ROOT/'shared/assets/refs/voice-teacher.wav')); p.add_argument('--only',nargs='*'); p.add_argument('--seeds',type=int,nargs='+',default=[7,8,9]); p.add_argument('--force',action='store_true'); p.add_argument('--submit-only',action='store_true'); a=p.parse_args()
 ref=Path(a.voice_ref); base=a.qwen_url.rstrip('/');
 if not ref.is_file():raise SystemExit('approved voice reference is missing')
 for b in ('curl','ffmpeg','ffprobe'):
  if not shutil.which(b):raise SystemExit('required binary missing: '+b)
 lines=json.loads(LINES.read_text()); cfg=json.loads((GAME/'config.json').read_text()).get('voice',{});
 if lines!=cfg:raise SystemExit('lines.json must exactly match config.json voice')
 keys=a.only or list(lines); bad=[k for k in keys if k not in lines]
 if bad:raise SystemExit('unknown voice key(s): '+', '.join(bad))
 OUT.mkdir(parents=True,exist_ok=True); RAW.mkdir(parents=True,exist_ok=True); qa={}; manifest={}; tts=base+'/workflows/qwen3-tts-voiceclone'; whisper=base+'/workflows/whisper-stt'
 state=RAW/'jobs.json'
 try: jobs=json.loads(state.read_text())
 except (OSError,ValueError): jobs={}
 if a.submit_only:
  tts=base+'/workflows/qwen3-tts-voiceclone'
  for k in keys:
   tag=f'{k}-seed7'
   if tag in jobs: print(f'{k}: retained job {jobs[tag]}',flush=True); continue
   r=subprocess.run(['curl','-sS','-X','POST',tts,'-F',f'voice=@{ref.as_posix()}','-F',f'text={lines[k]}','-F','seed=7'],capture_output=True,text=True,timeout=30)
   try: j=json.loads(r.stdout); jobs[tag]=j['job_id']; print(f'{k}: submitted {j["job_id"]} position={j.get("position")}',flush=True)
   except (ValueError,KeyError): print(f'{k}: submission failed {r.stdout}',flush=True)
  state.write_text(json.dumps(jobs,indent=2)+'\n'); return 0
 # Async resume path: never re-submit completed TTS. Download outputs, then
 # enqueue Whisper jobs once and persist their IDs for the next poll.
 def status(job):
  r=subprocess.run(['curl','-sS',f'{base}/jobs/{job}'],capture_output=True,text=True,timeout=30)
  try:return json.loads(r.stdout)
  except ValueError:return {'status':'unknown'}
 def download(job,out,output='output0',min_bytes=1000):
  r=subprocess.run(['curl','-sS','-f',f'{base}/jobs/{job}/result?output={output}','--output',str(out)],capture_output=True,timeout=120)
  return r.returncode==0 and out.exists() and out.stat().st_size>min_bytes
 for k in keys:
  tag=f'{k}-seed7'; job=jobs.get(tag)
  if not job: continue
  s=status(job); print(f'{k}: TTS {s.get("status")}',flush=True)
  raw=RAW/f'{k}-seed7.flac'; cand=RAW/f'{k}-seed7.m4a'
  if s.get('status')=='completed' and (not raw.exists() or raw.stat().st_size<1000): download(job,raw)
  if raw.exists() and (not cand.exists() or a.force): encode(raw,cand)
  if cand.exists() and dur(cand)>=.25 and f'{k}-whisper' not in jobs:
   tmp=RAW/f'{k}-whisper-submit.json'; r=subprocess.run(['curl','-sS','-X','POST',whisper,'-F',f'audio=@{cand.as_posix()}','-F','model_size=base','-F','language=en','-F',f'initial_prompt=Sound Hopscotch bunny Meadow Hop Sound Match Make a Path. {lines[k]}'],capture_output=True,text=True,timeout=30)
   try: w=json.loads(r.stdout); jobs[f'{k}-whisper']=w['job_id']; print(f'{k}: Whisper submitted {w["job_id"]}',flush=True)
   except (ValueError,KeyError): print(f'{k}: Whisper submission pending/failed {r.stdout}',flush=True)
 state.write_text(json.dumps(jobs,indent=2)+'\n')
 for k in keys:
  w=jobs.get(f'{k}-whisper'); cand=RAW/f'{k}-seed7.m4a'; tr=RAW/f'{k}-seed7-transcript.json'
  if not w: continue
  s=status(w); print(f'{k}: Whisper {s.get("status")}',flush=True)
  if s.get('status')=='completed' and not tr.exists(): download(w,tr,'json',2)
  if tr.exists():
   got=transcript(tr); good,ratio,cov=score(lines[k],got); qa[k]={'accepted':good,'acceptedSeed':7,'attempts':[{'seed':7,'accepted':good,'wanted':lines[k],'transcript':got,'score':ratio,'coverage':cov,'duration':dur(cand)}]}
   if good:
    final=OUT/f'{k}.m4a'; shutil.copy2(cand,final); manifest[k]={'file':final.name,'dur':dur(final),'textHash':sha(lines[k]),'seed':7}
    (OUT/f'{k}.m4a.recipe.json').write_text(json.dumps({'recipeVersion':'qlobe-recipe-v1','workflow':'qwen3-tts-voiceclone','jobId':jobs.get(f'{k}-seed7'),'text':lines[k],'textHash':sha(lines[k]),'seed':7,'encoding':{'codec':'aac','container':'m4a','sampleRate':24000,'channels':1,'bitrate':96000},'whisper':{'jobId':w,'score':ratio,'coverage':cov,'transcript':got},'teacherReference':'shared/assets/refs/voice-teacher.wav'},indent=2)+'\n')
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n'); (OUT/'qa.json').write_text(json.dumps(qa,indent=2)+'\n'); print(f'async poll complete: {len(manifest)}/{len(keys)} accepted',flush=True); return 0
 for seed in a.seeds:
  for k in keys:
   raw=RAW/f'{k}-seed{seed}.flac'; cand=RAW/f'{k}-seed{seed}.m4a'; print(f'{k}: TTS seed {seed}',flush=True)
   if a.force or not raw.exists() or raw.stat().st_size<1000:post(tts,[f'voice=@{ref}',f'text={lines[k]}',f'seed={seed}'],raw)
   if raw.exists() and (a.force or not cand.exists()):encode(raw,cand)
 for k in keys:
  attempts=[]; accepted=None
  for seed in a.seeds:
   cand=RAW/f'{k}-seed{seed}.m4a'; tr=RAW/f'{k}-seed{seed}-transcript.json'
   if not cand.exists() or dur(cand)<.25: attempts.append({'seed':seed,'accepted':False,'reason':'candidate missing'}); continue
   ok=post(whisper,[f'audio=@{cand}','model_size=base','language=en',f'initial_prompt=Sound Hopscotch bunny Meadow Hop Sound Match Make a Path. {lines[k]}'],tr); heard=transcript(tr) if ok else ''; good,ratio,cov=score(lines[k],heard); attempts.append({'seed':seed,'accepted':good,'wanted':lines[k],'transcript':heard,'score':ratio,'coverage':cov,'duration':dur(cand)}); print(f'{k}: {"accepted" if good else "rejected"} seed {seed} {ratio:.3f}/{cov:.3f} -> {heard}',flush=True)
   if good:
    final=OUT/f'{k}.m4a'; shutil.copy2(cand,final); accepted=seed; manifest[k]={'file':final.name,'dur':dur(final),'textHash':sha(lines[k]),'seed':seed}; (OUT/f'{k}.m4a.recipe.json').write_text(json.dumps({'recipeVersion':'qlobe-recipe-v1','workflow':'qwen3-tts-voiceclone','text':lines[k],'textHash':sha(lines[k]),'seed':seed,'encoding':{'codec':'aac','container':'m4a','sampleRate':24000,'channels':1,'bitrate':96000},'whisper':{'score':ratio,'coverage':cov,'transcript':heard},'teacherReference':'shared/assets/refs/voice-teacher.wav'},indent=2)+'\n'); break
  qa[k]={'accepted':accepted is not None,'acceptedSeed':accepted,'attempts':attempts}
 (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n'); (OUT/'qa.json').write_text(json.dumps(qa,indent=2)+'\n'); failures=[k for k in keys if k not in manifest]; print(f'voice complete: {len(manifest)}/{len(keys)} accepted; failures={failures}',flush=True); return 1 if failures else 0
if __name__=='__main__':sys.exit(main())
