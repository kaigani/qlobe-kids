#!/usr/bin/env python3
"""Build Tiny Sentence Workshop raster derivatives from accepted masters."""
import argparse, datetime, hashlib, io, json, os, sys, time, uuid
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT/'assets/source/gpt-image-2'; AS = ROOT/'assets'
SCENES = ['cat-nap','cat-hop','dog-nap','dog-dig','pig-jog','pig-sit','hen-sit','hen-run','fox-box','fox-log','bug-rug','bug-mug']
UI = ['word-tile-coral','word-tile-teal','word-tile-mustard','word-tile-grape','word-socket','sentence-strip','label-plaque','action-slab','scene-card-frame','reward-shelf','golden-star','progress-pebbles']
# Full-size runtime review found that equal 2x2 cells retained the master
# sheet's charcoal gutters. These inspected panel bounds are the illustrated
# clay tableaux themselves (right/bottom are PIL-exclusive); they deliberately
# remove the contact-sheet frame instead of hiding it with CSS at runtime.
SCENE_SOURCE_BOXES={
    'scenes-cat-dog-master.png':[(38,38,602,603),(646,38,1210,603),(38,645,602,1212),(646,645,1210,1212)],
    'scenes-pig-hen-master.png':[(38,38,602,603),(645,38,1211,603),(38,644,602,1213),(645,644,1211,1213)],
    'scenes-fox-bug-master.png':[(39,40,602,603),(645,40,1211,603),(39,644,602,1212),(645,644,1211,1212)],
}
# Full-size review found four wide/tall subjects crossing their nominal equal
# cells. These inspected source boxes preserve the complete object plus ground
# margin; the other eight exact cells remain unchanged so accepted hashes stay
# stable and are not needlessly regenerated.
UI_SOURCE_BOXES={
    'sentence-strip':(300,450,745,640),
    'scene-card-frame':(55,705,322,1012),
    'reward-shelf':(340,755,750,970),
    'golden-star':(760,735,1025,990),
    'progress-pebbles':(1028,785,1420,955),
}
PROMPT='Background layer: plain flat dark charcoal background. Top layer: the exact same clay interface object from the image, on a transparent background. Keep it identical to the input image.'
LAYER_SEEDS=(42,1337,9001,7)
HUB_PROMPT=('QLOBE Kids menu tile, miniature handcrafted stop-motion polymer clay sentence workshop on a warm wooden toy table, '
            'close-up of one completely blank smooth coral clay block being pressed into a blank cream sentence strip, both surfaces '
            'totally unmarked with no symbols, tiny teal scene viewer with a sleeping '
            'orange clay cat waking up, magnifying glass, mustard and grape tools, warm studio lighting, visible fingerprints and sculpted '
            'seams, rounded hand-shaped forms, matte plasticine, delightful preschool composition, strong central silhouette, toy-table '
            'menu tile framing, absolutely no writing, typography, glyphs, letters, numbers, logos, or symbols anywhere, no flat vector, '
            'no plastic 3D render, 6:5 composition.')

def crop_grid(im, cols, rows, i):
    w,h=im.size; cw,ch=w//cols,h//rows
    # remove likely sheet gutters while retaining consistent cards
    gx,gy=max(2,int(cw*.025)),max(2,int(ch*.025)); x=(i%cols)*cw; y=(i//cols)*ch
    return im.crop((x+gx,y+gy,x+cw-gx,y+ch-gy))
def webp(im, out):
    out.parent.mkdir(parents=True,exist_ok=True); im.save(out,'WEBP',lossless=im.mode=='RGBA',quality=95)
def qa(im, name):
    q=AS/'source/qa'; q.mkdir(parents=True,exist_ok=True)
    bg=Image.new('RGBA',im.size,(255,0,255,255)); bg.alpha_composite(im.convert('RGBA')); bg.convert('RGB').save(q/(name+'-magenta.png'))
def deterministic():
    for n,fn in enumerate(['scenes-cat-dog-master.png','scenes-pig-hen-master.png','scenes-fox-bug-master.png']):
        im=Image.open(SRC/fn).convert('RGB')
        for j in range(4):
            card=ImageOps.fit(im.crop(SCENE_SOURCE_BOXES[fn][j]),(640,640),Image.Resampling.LANCZOS)
            webp(card,AS/'scenes'/f'{SCENES[n*4+j]}.webp'); qa(card,SCENES[n*4+j])
    im=Image.open(SRC/'ui-kit-master.png').convert('RGBA')
    for i,name in enumerate(UI):
        card=im.crop(UI_SOURCE_BOXES[name]) if name in UI_SOURCE_BOXES else crop_grid(im,4,3,i)
        stage=AS/'source/deterministic/ui-cells'/f'{name}.webp'; webp(card,stage)
        card.save(stage.with_suffix('.png'),'PNG',optimize=True)
        if not (AS/'ui'/f'{name}.webp').exists(): webp(card,AS/'ui'/f'{name}.webp')
        qa(card,name)
    bg=Image.open(SRC/'workshop-background-master.png').convert('RGB'); bg.thumbnail((1600,1600),Image.Resampling.LANCZOS); webp(bg,AS/'backgrounds/workshop.webp')
    splash=Image.open(SRC/'visual-system-master.png').convert('RGB'); splash.thumbnail((1600,1600),Image.Resampling.LANCZOS); webp(splash,AS/'backgrounds/splash.webp')
    # deterministic contact sheets for quick visual QA
    q=AS/'source/qa'; sheet=Image.new('RGB',(4*320,3*320),'#ff00ff')
    for i,n in enumerate(SCENES): sheet.paste(Image.open(AS/'scenes'/f'{n}.webp').convert('RGB').resize((320,320)),((i%4)*320,(i//4)*320))
    sheet.save(q/'scenes-contact-sheet.jpg',quality=92)
def normalize_layer(layer):
    """Reject fake alpha, trim the subject, and center it on a stable canvas."""
    layer = layer.convert('RGBA')
    alpha = layer.getchannel('A')
    lo, hi = alpha.getextrema()
    histogram = alpha.histogram()
    total = max(1, sum(histogram))
    transparent = sum(histogram[:16]) / total
    visible = sum(histogram[240:]) / total
    bbox = alpha.point(lambda value: 255 if value >= 32 else 0).getbbox()
    if not bbox or lo >= 250 or hi <= 10 or transparent < .01 or visible < .01:
        raise RuntimeError('layer has no meaningful transparent subject separation')
    subject = layer.crop(bbox)
    subject.thumbnail((608, 608), Image.Resampling.LANCZOS)
    padding=max(12,round(max(subject.size)*.035))
    canvas = Image.new('RGBA', (subject.width+padding*2, subject.height+padding*2), (0, 0, 0, 0))
    canvas.alpha_composite(subject, (padding,padding))
    return canvas, {
        'alphaExtrema': [lo, hi],
        'transparentRatio': round(transparent, 4),
        'visibleRatio': round(visible, 4),
        'sourceBbox': list(bbox),
    }

def contiguous_ground_key(source):
    """Fallback for a flat source-sheet ground after Layered exhausts QA.

    Only dark pixels connected to the outside edge are removed, so the grape
    center and shaded clay remain protected behind the plaque's cream border.
    """
    image=source.convert('RGBA'); rgb=image.convert('RGB'); width,height=image.size; pixels=rgb.load()
    samples=[pixels[0,0],pixels[width-1,0],pixels[0,height-1],pixels[width-1,height-1]]
    ground=tuple(round(sum(sample[channel] for sample in samples)/len(samples)) for channel in range(3))
    threshold=80; threshold_sq=threshold*threshold
    alpha=Image.new('L',(width,height),255); alpha_pixels=alpha.load(); seen=bytearray(width*height)
    stack=[*( (x,0) for x in range(width) ),*( (x,height-1) for x in range(width) ),
           *( (0,y) for y in range(height) ),*( (width-1,y) for y in range(height) )]
    while stack:
        x,y=stack.pop(); index=y*width+x
        if seen[index]: continue
        seen[index]=1; color=pixels[x,y]
        if sum((color[channel]-ground[channel])**2 for channel in range(3))>threshold_sq: continue
        alpha_pixels[x,y]=0
        if x: stack.append((x-1,y))
        if x+1<width: stack.append((x+1,y))
        if y: stack.append((x,y-1))
        if y+1<height: stack.append((x,y+1))
    alpha=alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(.55))
    image.putalpha(alpha)
    return image,{'sampledGround':list(ground),'distanceThreshold':threshold,'method':'edge-connected RGB-distance key'}

def layered(fallback_remaining=False):
    import urllib.request, uuid
    host=os.environ.get('QLOBE_QWEN_URL')
    if not host and not fallback_remaining: raise RuntimeError('QLOBE_QWEN_URL is required for --layered')
    import urllib.error
    outdir=AS/'source/local-api/layered'; outdir.mkdir(parents=True,exist_ok=True)
    manifest={
        'format':'qlobe-local-image-receipt-set', 'formatVersion':1,
        'workflow':'qwen-image-layered', 'preferredOutput':'layer_2', 'fallbackOutput':'layer_1', 'layers':2,
        'seedLadder':list(LAYER_SEEDS), 'prompt':PROMPT,
        'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'items':[],
    }
    manifest_path=outdir/'manifest.json'
    try:
        prior=json.loads(manifest_path.read_text())
    except (FileNotFoundError,json.JSONDecodeError):
        prior={}
    prior_items={item.get('name'):item for item in prior.get('items',[]) if isinstance(item,dict)}
    for name in UI:
        src=AS/'source/deterministic/ui-cells'/f'{name}.png'; data=src.read_bytes()
        source_hash=hashlib.sha256(data).hexdigest()
        runtime=AS/'ui'/f'{name}.webp'
        old=prior_items.get(name,{})
        source_changed=bool(old.get('sourceSha256') and old.get('sourceSha256')!=source_hash)
        superseded=({'reason':'source crop corrected after full-size alpha review',
                     'sourceSha256':old.get('sourceSha256'),'layerOutput':old.get('layerOutput'),
                     'acceptedOutput':old.get('acceptedOutput'),'acceptedSeed':old.get('acceptedSeed')}
                    if source_changed else None)
        old_raw=outdir/str(old.get('layerOutput',''))
        if old.get('sourceSha256') == source_hash and old_raw.is_file():
            try:
                layer,alpha_meta=normalize_layer(Image.open(old_raw))
                webp(layer,runtime); qa(layer,name+'-layered')
                if isinstance(old.get('response'),dict) and 'jobIdRecorded' in old['response']:
                    old['response']['jobIdRedacted']=bool(old['response'].pop('jobIdRecorded'))
                old.setdefault('acceptedOutput','layer_1' if 'layer-1' in old_raw.name else 'layer_2')
                if old.get('acceptedOutput')=='deterministic-contiguous-ground-key':
                    old['workflowOverride']='deterministic fallback'
                    old.setdefault('fallback',{}).setdefault('reason','both Layered roles rejected by meaningful-alpha gate')
                old.update({'runtimeSha256':hashlib.sha256(runtime.read_bytes()).hexdigest(),'alpha':alpha_meta})
                manifest['items'].append(old); manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
                continue
            except Exception:
                pass
        attempts=(list(old.get('attempts',[])) if isinstance(old.get('attempts'),list) and not source_changed else []); accepted=None
        for rejected_path in ([] if source_changed else sorted(outdir.glob(f'{name}-seed-*-layer-*.png'))):
            if any(attempt.get('layerOutput')==rejected_path.name for attempt in attempts): continue
            parts=rejected_path.stem.split('-'); seed_value=next((int(part) for part in parts if part.isdigit()),None)
            output_value='layer_1' if 'layer-1' in rejected_path.name else 'layer_2'
            attempts.append({'seed':seed_value,'output':output_value,'accepted':False,
                             'reason':'preserved output rejected by meaningful-alpha gate','layerOutput':rejected_path.name})
        attempted_seeds={attempt.get('seed') for attempt in attempts if attempt.get('seed') in LAYER_SEEDS}
        structurally_rejected=fallback_remaining or any(
            {'layer_1','layer_2'}.issubset({attempt.get('output') for attempt in attempts if attempt.get('seed')==seed})
            for seed in LAYER_SEEDS
        )
        for seed in LAYER_SEEDS:
            if structurally_rejected: break
            if seed in attempted_seeds: continue
            boundary='----Qlobeboundary'+uuid.uuid4().hex
            item_prompt=f'{PROMPT} The interface object is the {name.replace("-"," ")}.'
            def field(k,v): return (f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n').encode()
            body=field('prompt',item_prompt)+field('layers','2')+field('seed',str(seed))+f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{name}.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+data+f'\r\n--{boundary}--\r\n'.encode()
            req=urllib.request.Request(host.rstrip('/')+'/workflows/qwen-image-layered',data=body,method='POST'); req.add_header('Content-Type',f'multipart/form-data; boundary={boundary}')
            try:
                with urllib.request.urlopen(req,timeout=30) as r: job=json.load(r)
                jid=job.get('job_id')
                if not jid: raise RuntimeError('missing job id')
                state={}
                for _ in range(int(os.environ.get('QLOBE_QWEN_TIMEOUT','900'))):
                    with urllib.request.urlopen(host.rstrip('/')+'/jobs/'+str(jid),timeout=30) as r: state=json.load(r)
                    if state.get('status') in ('done','completed','succeeded'): break
                    if state.get('status') in ('failed','error','cancelled'):
                        raise RuntimeError(f"job ended with status {state.get('status')}")
                    time.sleep(1)
                else: raise RuntimeError('job polling timed out')
                outputs_checked=0
                for output_name in ('layer_2','layer_1'):
                    raw_path=None
                    try:
                        with urllib.request.urlopen(host.rstrip('/')+'/jobs/'+str(jid)+f'/result?output={output_name}',timeout=30) as r: result=r.read()
                        outputs_checked+=1
                        raw_path=outdir/f'{name}-seed-{seed}-{output_name.replace("_","-")}.png'; raw_path.write_bytes(result)
                        layer,alpha_meta=normalize_layer(Image.open(io.BytesIO(result)))
                        webp(layer,runtime); qa(layer,name+'-layered')
                        accepted={
                            'name':name,'source':f'../../deterministic/ui-cells/{name}.png',
                            'layerOutput':raw_path.name,'acceptedOutput':output_name,'runtime':f'../../../ui/{name}.webp',
                            'acceptedSeed':seed,'sourceSha256':source_hash,
                            'layerSha256':hashlib.sha256(result).hexdigest(),
                            'runtimeSha256':hashlib.sha256(runtime.read_bytes()).hexdigest(),
                            'alpha':alpha_meta,'attempts':attempts,
                            'response':{'status':state.get('status'),'jobIdRedacted':bool(jid)},
                        }
                        break
                    except Exception as layer_error:
                        attempt={'seed':seed,'output':output_name,'accepted':False,'reason':str(layer_error)[:180]}
                        if raw_path and raw_path.is_file(): attempt['layerOutput']=raw_path.name
                        attempts.append(attempt)
                if accepted: break
                if outputs_checked==2: break
            except Exception as error:
                attempts.append({'seed':seed,'output':'job','accepted':False,'reason':str(error)[:180]})
        if not accepted:
            keyed,key_meta=contiguous_ground_key(Image.open(src)); raw_path=outdir/f'{name}-keyed-fallback.png'; keyed.save(raw_path,'PNG',optimize=True)
            layer,alpha_meta=normalize_layer(keyed); webp(layer,runtime); qa(layer,name+'-layered')
            fallback_reason=('reviewed deterministic fallback requested for remaining flat-ground UI'
                             if fallback_remaining else 'both Layered roles rejected by meaningful-alpha gate')
            accepted={'name':name,'source':f'../../deterministic/ui-cells/{name}.png','layerOutput':raw_path.name,
                      'acceptedOutput':'deterministic-contiguous-ground-key','workflowOverride':'deterministic fallback',
                      'runtime':f'../../../ui/{name}.webp','acceptedSeed':None,'sourceSha256':source_hash,
                      'layerSha256':hashlib.sha256(raw_path.read_bytes()).hexdigest(),
                      'runtimeSha256':hashlib.sha256(runtime.read_bytes()).hexdigest(),'alpha':alpha_meta,
                      'fallback':{**key_meta,'reason':fallback_reason},'attempts':attempts,
                      'response':{'status':'local-fallback','jobIdRedacted':False}}
        if superseded: accepted['superseded']=superseded
        manifest['items'].append(accepted); manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
    manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
def qa_contact():
    """Fail closed on fake alpha and make one full-size review artifact."""
    q=AS/'source/qa'; q.mkdir(parents=True,exist_ok=True)
    cell_w,cell_h=320,250
    sheet=Image.new('RGB',(cell_w*4,cell_h*3),(255,0,255))
    draw=ImageDraw.Draw(sheet)
    items=[]
    for i,name in enumerate(UI):
        path=AS/'ui'/f'{name}.webp'
        if not path.is_file(): raise RuntimeError(f'missing runtime UI asset: {name}')
        with Image.open(path) as source: im=source.convert('RGBA')
        alpha=im.getchannel('A'); lo,hi=alpha.getextrema(); hist=alpha.histogram(); total=max(1,sum(hist))
        transparent=sum(hist[:16])/total; visible=sum(hist[240:])/total
        bbox=alpha.point(lambda value:255 if value>=32 else 0).getbbox()
        corners=[alpha.getpixel(point) for point in ((0,0),(im.width-1,0),(0,im.height-1),(im.width-1,im.height-1))]
        if not bbox or lo>=250 or hi<=10 or transparent<.01 or visible<.01 or max(corners)>64:
            raise RuntimeError(f'fake or contaminated alpha: {name}')
        thumb=im.copy(); thumb.thumbnail((cell_w-28,cell_h-48),Image.Resampling.LANCZOS)
        preview=Image.new('RGBA',(cell_w,cell_h),(255,0,255,255))
        preview.alpha_composite(thumb,((cell_w-thumb.width)//2,8+(cell_h-48-thumb.height)//2))
        x=(i%4)*cell_w; y=(i//4)*cell_h
        sheet.paste(preview.convert('RGB'),(x,y))
        draw.rectangle((x,y+cell_h-34,x+cell_w,y+cell_h),fill=(36,33,39))
        draw.text((x+10,y+cell_h-26),name,fill=(255,255,255))
        items.append({'name':name,'file':f'assets/ui/{name}.webp','size':list(im.size),'alphaExtrema':[lo,hi],
                      'transparentRatio':round(transparent,4),'visibleRatio':round(visible,4),
                      'alphaBbox':list(bbox),'cornerAlpha':corners,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    contact=q/'ui-layered-contact-magenta.png'; report=q/'ui-layered-alpha-report.json'
    sheet.save(contact,'PNG',optimize=True)
    report.write_text(json.dumps({'format':'qlobe-alpha-qa','formatVersion':1,'allValid':True,
                                  'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                  'contactSheet':contact.name,'items':items},indent=2)+'\n')
    print(f'alpha QA: {len(items)}/{len(UI)} valid; {contact.relative_to(ROOT)}')

def submit_job(base, workflow, fields, max_polls=900):
    boundary='----Qlobeboundary'+uuid.uuid4().hex
    body=b''.join((f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n').encode()
                  for key,value in fields.items())+f'--{boundary}--\r\n'.encode()
    request=Request(base.rstrip('/')+f'/workflows/{workflow}',data=body,method='POST',
                    headers={'Content-Type':f'multipart/form-data; boundary={boundary}'})
    with urlopen(request,timeout=60) as response: submitted=json.load(response)
    job_id=submitted.get('job_id') or submitted.get('id')
    if not job_id: raise RuntimeError(f'{workflow} returned no job id')
    for _ in range(max_polls):
        with urlopen(base.rstrip('/')+f'/jobs/{job_id}',timeout=60) as response: state=json.load(response)
        status=str(state.get('status','')).lower()
        if status in ('done','completed','complete','success','succeeded'): return str(job_id)
        if status in ('failed','error','cancelled','canceled'): raise RuntimeError(f'{workflow} failed')
        time.sleep(1)
    raise TimeoutError(f'{workflow} timed out')

def hub(seed=9001, force=False):
    base=os.environ.get('QLOBE_QWEN_URL','').rstrip('/')
    if not base: raise RuntimeError('QLOBE_QWEN_URL is required for --hub')
    repo=ROOT.parents[1]; final=repo/'assets/hub/tiles/tiny-sentence-workshop.jpg'
    outdir=AS/'source/local-api/hub'; raw=outdir/f'tiny-sentence-workshop-krea2-seed-{seed}.png'; recipe=outdir/'recipe.json'
    if final.is_file() and recipe.is_file() and not force:
        print(f'hub: reused {final.relative_to(repo)}'); return
    outdir.mkdir(parents=True,exist_ok=True)
    if force and recipe.is_file():
        previous=json.loads(recipe.read_text())
        previous_seed=previous.get('steps',[{}])[0].get('seed','unknown')
        previous.setdefault('qa',{})['status']='rejected'
        previous['qa']['reviewNotes']='Rejected in full-size human review: generated coral block contained pseudo-lettering despite the no-text constraint.'
        (outdir/f'recipe-rejected-seed-{previous_seed}.json').write_text(json.dumps(previous,indent=2)+'\n')
    job_id=submit_job(base,'krea2-turbo-t2i',{'prompt':HUB_PROMPT,'seed':seed,'width':768,'height':640,'steps':8,'cfg':1})
    with urlopen(base+f'/jobs/{job_id}/result',timeout=300) as response: raw.write_bytes(response.read())
    try:
        with Image.open(raw) as source:
            source.load()
            if source.width<512 or source.height<512 or raw.stat().st_size<5000: raise RuntimeError('undersized Krea hub result')
            image=ImageOps.fit(source.convert('RGB'),(640,533),Image.Resampling.LANCZOS,centering=(.5,.5))
    except Exception as error: raise RuntimeError('invalid Krea hub result') from error
    final.parent.mkdir(parents=True,exist_ok=True); image.save(final,'JPEG',quality=91,optimize=True)
    receipt={'format':'qlobe-recipe','formatVersion':1,'id':'tiny-sentence-workshop-hub','kind':'image',
             'asset':'assets/hub/tiles/tiny-sentence-workshop.jpg','artDirection':'Claymation',
             'steps':[{'workflow':'krea2-turbo-t2i','prompt':HUB_PROMPT,'seed':seed,'width':768,'height':640,'steps':8,'cfg':1}],
             'source':raw.name,'sourceSha256':hashlib.sha256(raw.read_bytes()).hexdigest(),
             'finalSha256':hashlib.sha256(final.read_bytes()).hexdigest(),
             'qa':{'status':'pending-human-review','finalSize':[640,533],
                   'checks':['no text or lettering','clear clay sentence-workshop action','legible at 320px']},
             'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    recipe.write_text(json.dumps(receipt,indent=2)+'\n')
    print(f'hub: generated {final.relative_to(repo)}; human review required')
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--deterministic',action='store_true'); ap.add_argument('--layered',action='store_true'); ap.add_argument('--fallback-remaining',action='store_true'); ap.add_argument('--qa-contact',action='store_true'); ap.add_argument('--hub',action='store_true'); ap.add_argument('--seed',type=int,default=9001); ap.add_argument('--force',action='store_true'); ap.add_argument('--all',action='store_true'); a=ap.parse_args()
    selected=a.deterministic or a.layered or a.fallback_remaining or a.qa_contact or a.hub or a.all
    if a.deterministic or a.all or not selected: deterministic()
    if a.layered or a.fallback_remaining or a.all: layered(a.fallback_remaining)
    if a.qa_contact or a.all: qa_contact()
    if a.hub: hub(a.seed,a.force)
if __name__=='__main__': main()
