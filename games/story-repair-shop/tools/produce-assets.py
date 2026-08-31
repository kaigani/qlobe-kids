#!/usr/bin/env python3
"""Resumable Story Repair Shop asset production driver (plan by default)."""
from __future__ import annotations
import argparse, hashlib, json, mimetypes, subprocess, sys, time, uuid
from pathlib import Path
from urllib.request import Request, urlopen
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps

GAME=Path(__file__).resolve().parents[1]; ROOT=GAME.parents[1]
SRC=GAME/'assets/source'; GPT=SRC/'gpt-image-2'; LOCAL=SRC/'local-api'; QA=SRC/'qa'; OUT=GAME/'assets'
STATE=ROOT/'tools/state/local.json'; CUT=ROOT/'tools/cut-asset-sheet.py'; FINAL=ROOT/'tools/pipeline/cutout_finalize.py'
SHEETS={'ui-kit-sheet.png':('ui-crops','ui-crops-mask.png','ui',760,6,['prompt-banner','next-button','repair-mode','wild-mode','torn-patch','sparkles']), 'cards-repair-sheet.png':('card-crops-repair','card-crops-repair-mask.png','cards',440,9,['bridge','striped-kite','yellow-rain-boot','sunflower','blue-teapot','red-toy-train','umbrella','birthday-cake','paper-crown']), 'cards-silly-sheet.png':('card-crops-silly','card-crops-silly-mask.png','cards',440,9,['bicycle','bubbles','water-plant','trumpet-skates','pillow','cocoa','moon-soup','family-dinner','soup-bowl'])}
RUNTIME={'crops-ui':('ui',760),'crops-repair':('cards',440),'crops-silly':('cards',440)}
LAYERED_SOURCES=('title-lockup-source.png',)

def cfg():
    try:
        data=json.loads(STATE.read_text())
        if not data.get('qwenUrl'): raise ValueError('qwenUrl is missing')
        return data
    except Exception as exc:
        raise SystemExit('local media config unavailable; create ignored tools/state/local.json') from exc
def digest(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(1<<20),b''): h.update(b)
    return h.hexdigest()
def multipart(url,fields,files):
    boundary='----qlobe-'+uuid.uuid4().hex; body=[]
    for k,v in fields.items(): body += [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()]
    for k,p in files.items(): body += [f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{p.name}"\r\nContent-Type: {mimetypes.guess_type(p.name)[0] or "application/octet-stream"}\r\n\r\n'.encode(),p.read_bytes(),b'\r\n']
    body.append(f'--{boundary}--\r\n'.encode())
    with urlopen(Request(url,data=b''.join(body),method='POST',headers={'Content-Type':f'multipart/form-data; boundary={boundary}'}),timeout=180) as r:return json.load(r)
def layered_path(source):
    stem=source.stem.removesuffix('-source')
    return LOCAL/'layered'/(stem+'-layer_2.png')
def layered(base, source, force, receipts):
    out=layered_path(source)
    if out.exists() and not force:
        receipts.append({'source':str(source.relative_to(GAME)),'status':'cached','output':'layer_2','file':str(out.relative_to(GAME)),'sha256':digest(out)})
        return out
    background='transparent checkerboard' if source.name=='title-lockup-source.png' else 'flat dark charcoal surrounding every separate object'
    prompt=(f'Background layer: remove only the {background}. Top layer: preserve every exact painted foreground pixel, '
            'alpha edge, scale, and position. Do not redraw, crop, move, merge, add, recolor, restyle, or remove any foreground object. '
            'Do not generate text or alter existing title lettering.')
    r=multipart(base.rstrip('/')+'/workflows/qwen-image-layered',{'prompt':prompt,'layers':2,'seed':42},{'image':source}); jid=r.get('job_id') or r.get('id')
    if not jid: raise RuntimeError('Layered submit returned no job id')
    for _ in range(450):
        time.sleep(2)
        with urlopen(base.rstrip('/')+'/jobs/'+jid,timeout=60) as h:s=json.load(h)
        st=str(s.get('status','')).lower()
        if st in {'completed','complete','success','succeeded'}: break
        if st in {'failed','error','cancelled','canceled'}: raise RuntimeError(str(s))
    else: raise TimeoutError(jid)
    with urlopen(base.rstrip('/')+f'/jobs/{jid}/result?output=layer_2',timeout=300) as h:data=h.read()
    if not data.startswith(b'\x89PNG\r\n\x1a\n'): raise RuntimeError('Qwen layer_2 result was not PNG')
    out.parent.mkdir(parents=True,exist_ok=True); out.write_bytes(data); receipts.append({'source':str(source.relative_to(GAME)),'job_id':jid,'status':'completed','output':'layer_2','file':str(out.relative_to(GAME)),'sha256':digest(out)})
    return out
def run(cmd):
    p=subprocess.run(cmd,capture_output=True,text=True)
    if p.returncode not in (0,3): raise RuntimeError(p.stderr or p.stdout)
    result=json.loads(p.stdout)
    if p.returncode==3 or result.get('pass') is False: raise RuntimeError(result.get('reason') or 'asset QA failed')
    return result
def cutter_matte(source, full_mask, crop_box, output, fill_holes=True):
    image=Image.open(source).convert('RGBA')
    hard=full_mask.crop(tuple(crop_box)).convert('L')
    if hard.size!=image.size: raise RuntimeError(f'cutter mask mismatch for {source.name}')
    if fill_holes:
        # Cards and UI plates are solid paper objects. Fill only zero regions
        # that cannot reach the padded crop border, preserving the rounded outer
        # silhouette while preventing dark painted details from becoming holes.
        flood=hard.copy(); ImageDraw.floodfill(flood,(0,0),128,thresh=0)
        hard=flood.point(lambda value:0 if value==128 else 255)
    # Feather inward only: zero stays zero outside the cutter silhouette, while
    # the innermost edge softens by less than one pixel. This avoids importing
    # charcoal RGB into the alpha fringe and preserves all painted interiors.
    soft=hard.filter(ImageFilter.GaussianBlur(.8))
    alpha=ImageChops.darker(hard,soft).point(lambda value:0 if value<=3 else value)
    image.putalpha(alpha)
    output.parent.mkdir(parents=True,exist_ok=True); image.save(output,'PNG',optimize=True)
    hist=alpha.histogram(); total=image.width*image.height
    return {'method':'asset-cutter silhouette + enclosed-hole fill + inward 0.8px alpha feather' if fill_holes else 'asset-cutter silhouette + inward 0.8px alpha feather','transparentPct':round(100*hist[0]/total,3),'partialPct':round(100*sum(hist[1:255])/total,3),'source':str(source.relative_to(GAME))}
def execute(force):
    base=cfg()['qwenUrl']; receipts=[]; prompt_specs=GPT/'prompt-specs.json'
    prov={'gptImage2':json.loads(prompt_specs.read_text()),'sources':{},'layered':receipts,'rejectedLayeredAttempts':[],'cutter':[],'mattes':[],'finalize':[],'runtime':{}}
    prov['sources'][str(prompt_specs.relative_to(GAME))]=digest(prompt_specs)
    for name in LAYERED_SOURCES:
        p=GPT/name; prov['sources'][str(p.relative_to(GAME))]=digest(p)
        layered(base,p,force,receipts)
    # Sheet-level and early per-object Layered trials are retained as honest QA
    # evidence but rejected when they omit an object, erase the paper card, or
    # keep an opaque matte. They never feed runtime output.
    for attempt in sorted((LOCAL/'layered').glob('*-layer_2.png')):
        if attempt.name!='title-lockup-layer_2.png':
            prov['rejectedLayeredAttempts'].append({'file':str(attempt.relative_to(GAME)),'sha256':digest(attempt),'reason':'human visual rejection: incomplete foreground or opaque matte; excluded from runtime'})
    for sheet,(folder,mask_name,subdir,edge,count,names) in SHEETS.items():
        inp=GPT/sheet; dest=SRC/folder; mask_path=SRC/mask_name
        if force or not (dest/'boxes.json').exists():
            cmd=[sys.executable,str(CUT),str(inp),str(dest),'--names',*names,'--expected-count',str(count),'--debug-mask',str(mask_path)]
            if force: cmd.append('--force')
            run(cmd)
        manifest=json.loads((dest/'boxes.json').read_text()); full_mask=Image.open(mask_path).convert('L')
        records={record['name']:record for record in manifest['assets']}
        prov['sources'][str(inp.relative_to(GAME))]=digest(inp)
        prov['cutter'].append({'sheet':str(inp.relative_to(GAME)),'expectedCount':count,'boxes':str((dest/'boxes.json').relative_to(GAME)),'mask':str(mask_path.relative_to(GAME)),'isolation':'semantic cutter geometry on untouched GPT Image 2 master'})
        for n in names:
            crop=dest/(n+'.png'); matte=LOCAL/'mattes'/subdir/(n+'.png'); png=LOCAL/'finals'/subdir/(n+'.png'); qa=QA/(n+'-magenta.png'); png.parent.mkdir(parents=True,exist_ok=True); qa.parent.mkdir(parents=True,exist_ok=True)
            if force or not matte.exists(): prov['mattes'].append({'name':n,**cutter_matte(crop,full_mask,records[n]['cropBbox'],matte,fill_holes=n!='sparkles')})
            else: prov['mattes'].append({'name':n,'method':'cached asset-cutter matte','source':str(crop.relative_to(GAME)),'sha256':digest(matte)})
            if force or not png.exists():
                rec=run([sys.executable,str(FINAL),'--input',str(matte),'--output',str(png),'--magenta',str(qa),'--max-size',str(edge),'--pad','12','--alpha-floor','4']); prov['finalize'].append({'name':n,**rec})
            runtime=OUT/subdir/(n+'.webp'); runtime.parent.mkdir(parents=True,exist_ok=True)
            if force or not runtime.exists(): Image.open(png).save(runtime,'WEBP',quality=90,method=6)
            prov['runtime'][str(runtime.relative_to(GAME))]={'sha256':digest(runtime),'dimensions':list(Image.open(runtime).size)}
    title=layered_path(GPT/'title-lockup-source.png'); tp=LOCAL/'finals/title-lockup.png'; tq=QA/'title-lockup-magenta.png'; tp.parent.mkdir(parents=True,exist_ok=True); tq.parent.mkdir(parents=True,exist_ok=True)
    if force or not tp.exists(): prov['finalize'].append({'name':'title-lockup',**run([sys.executable,str(FINAL),'--input',str(title),'--output',str(tp),'--magenta',str(tq),'--max-size','900','--pad','12','--alpha-floor','4'])})
    tr=OUT/'ui/title-lockup.webp'; tr.parent.mkdir(parents=True,exist_ok=True)
    if force or not tr.exists(): Image.open(tp).save(tr,'WEBP',quality=90,method=6)
    prov['runtime'][str(tr.relative_to(GAME))]={'sha256':digest(tr),'dimensions':list(Image.open(tr).size),'source':str((GPT/'title-lockup-source.png').relative_to(GAME))}
    for stem in ['workshop-backdrop','workshop-backdrop-portrait']+[f'scene-{x}' for x in ('nia-sunflower','dragon-trumpet','leo-umbrella','bear-moon-soup','fox-bridge','fish-bicycle')]:
        is_backdrop=stem.startswith('workshop-backdrop')
        src=GPT/(stem+'-source.png'); dest=OUT/('ui/'+stem+'.webp' if is_backdrop else 'scenes/'+stem.removeprefix('scene-')+'.webp'); dest.parent.mkdir(parents=True,exist_ok=True)
        prov['sources'][str(src.relative_to(GAME))]=digest(src)
        if force or not dest.exists():
            image=Image.open(src).convert('RGB')
            if not is_backdrop: image=image.resize((1280,853),Image.Resampling.LANCZOS)
            image.save(dest,'WEBP',quality=86 if is_backdrop else 88,method=6)
        prov['runtime'][str(dest.relative_to(GAME))]={'sha256':digest(dest),'dimensions':list(Image.open(dest).size),'source':str(src.relative_to(GAME))}
    hub_src=GPT/'hub-tile-source.png'; hub_dest=ROOT/'assets/hub/tiles/story-repair-shop.jpg'
    prov['sources'][str(hub_src.relative_to(GAME))]=digest(hub_src)
    hub=ImageOps.fit(Image.open(hub_src).convert('RGB'),(640,533),method=Image.Resampling.LANCZOS,centering=(.5,.5))
    hub.save(hub_dest,'JPEG',quality=90,optimize=True,progressive=True)
    krea=SRC/'krea2/story-repair-shop-hub-v2.png'
    prov['catalogTile']={'accepted':{'file':str(hub_dest.relative_to(ROOT)),'sha256':digest(hub_dest),'dimensions':list(Image.open(hub_dest).size),'source':str(hub_src.relative_to(GAME)),'reason':'matches the canonical watercolor atelier and gameplay repair ritual'},'superseded':{'file':str(krea.relative_to(GAME)),'sha256':digest(krea),'reason':'visually polished but glossy 3D style conflicts with the canonical Watercolor / Storybook world'}}
    (SRC/'media-provenance.json').write_text(json.dumps(prov,indent=2)+'\n')
def main():
    ap=argparse.ArgumentParser(); ap.add_argument('command',choices=['plan','execute'],nargs='?',default='plan'); ap.add_argument('--execute',action='store_true'); ap.add_argument('--force',action='store_true'); a=ap.parse_args()
    if a.command=='plan' and not a.execute:
        print('Story Repair Shop asset plan: GPT Image 2 masters → semantic cutter + deterministic matte → Qwen Layered title → finalize + magenta QA → WebP runtime → provenance'); return
    execute(a.force)
if __name__=='__main__': main()
