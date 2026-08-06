#!/usr/bin/env python3
"""Deterministic Pillow asset finalizer for Button-Zipper Lab."""
import argparse, json
from pathlib import Path
from PIL import Image, ImageChops

ROOT=Path(__file__).resolve().parents[1]; SRC=ROOT/'assets/source'; OUT=ROOT/'assets'
REPO=ROOT.parents[1]
MODES=['zipper','button','snap','velcro']
UI_CELLS = [
    ('zipper-pull', 'ui/zipper-pull.webp'),
    ('button', 'ui/button.webp'),
    ('snap-flap', 'ui/snap-flap.webp'),
    ('velcro-tab', 'ui/velcro-tab.webp'),
    ('helper-paw', 'ui/helper-paw.webp'),
    ('patch-zipper', 'patches/zipper.webp'),
    ('patch-button', 'patches/button.webp'),
    ('patch-snap', 'patches/snap.webp'),
    ('patch-velcro', 'patches/velcro.webp'),
]
UI_SOURCE_BOX = {
    'zipper-pull': (65, 20, 300, 385),
    'button': (330, 45, 655, 370),
    'snap-flap': (650, 65, 1040, 355),
    'velcro-tab': (1025, 65, 1430, 355),
    'helper-paw': (15, 375, 400, 690),
    'patch-zipper': (15, 675, 370, 1035),
    'patch-button': (360, 675, 710, 1035),
    'patch-snap': (710, 675, 1070, 1035),
    'patch-velcro': (1050, 675, 1435, 1035),
}
report={'inputs':[],'outputs':[],'skipped':[]}
check=False
check_fail=False

def rec_in(p, optional=False):
    exists=p.exists(); report['inputs'].append({'path':str(p.relative_to(ROOT)),'exists':exists})
    if not exists and optional: report['skipped'].append(str(p.relative_to(ROOT)))
    return exists
def save(im,p,fmt='WEBP',**kw):
    global check_fail
    import io
    b=io.BytesIO(); im.save(b,format=fmt,**kw); data=b.getvalue()
    if p.exists() and p.read_bytes()==data:
        report['outputs'].append({'path':str(p.relative_to(ROOT)),'width':im.width,'height':im.height,'bytes':len(data),'status':'unchanged'}); return
    if check:
        check_fail=True
        report['outputs'].append({'path':str(p.relative_to(ROOT)),'width':im.width,'height':im.height,'bytes':len(data),'status':'stale' if p.exists() else 'missing'}); return
    p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(data)
    report['outputs'].append({'path':str(p.relative_to(ROOT)),'width':im.width,'height':im.height,'bytes':len(data),'status':'written'})
def save_repo(im,p,fmt='JPEG',**kw):
    global check_fail
    import io
    b=io.BytesIO(); im.save(b,format=fmt,**kw); data=b.getvalue()
    status='unchanged' if p.exists() and p.read_bytes()==data else ('stale' if check and p.exists() else ('missing' if check else 'written'))
    if check and status!='unchanged': check_fail=True
    if status=='written': p.parent.mkdir(parents=True,exist_ok=True); p.write_bytes(data)
    report['outputs'].append({'path':str(p.relative_to(REPO)),'width':im.width,'height':im.height,'bytes':len(data),'status':status})
def trim(im,pad=12):
    if im.mode!='RGBA': im=im.convert('RGBA')
    a=im.getchannel('A'); box=a.getbbox()
    if not box: return Image.new('RGBA',(pad*2,pad*2))
    im=im.crop(box); out=Image.new('RGBA',(im.width+pad*2,im.height+pad*2)); out.paste(im,(pad,pad),im); return out
def grid(path,size, names, dest, alpha=False, cols=2, rows=2):
    im=Image.open(path)
    if im.size!=(size*cols,size*rows): raise ValueError(f'{path.name}: expected {(size*cols,size*rows)}, got {im.size}')
    for i,n in enumerate(names):
        x=(i%cols)*size; y=(i//cols)*size; c=im.crop((x,y,x+size,y+size)); c=trim(c) if alpha else c
        save(c,dest/n, 'WEBP' if alpha else 'PNG', quality=88) if alpha else save(c,dest/n,'PNG')

def main():
    global check
    ap=argparse.ArgumentParser(); ap.add_argument('--check',action='store_true'); args=ap.parse_args(); check=args.check
    boards=SRC/'game-boards-gpt-image-2.png';
    if rec_in(boards): grid(boards,627, [f'{m}-gpt.png' for m in MODES], SRC/'boards', False)
    cards=SRC/'mode-cards-alpha.png'
    if rec_in(cards,True):
        im=Image.open(cards)
        if im.width%2 or im.height%2: raise ValueError(f'{cards.name}: dimensions must divide into a 2x2 grid, got {im.size}')
        cell_w,cell_h=im.width//2,im.height//2
        crops=[trim(im.crop(((i%2)*cell_w,(i//2)*cell_h,(i%2+1)*cell_w,(i//2+1)*cell_h))) for i in range(4)]
        scale=min(1.0,520/max(max(c.width,c.height) for c in crops)); dims=[(round(c.width*scale),round(c.height*scale)) for c in crops]
        cw,ch=min(520,max(w for w,h in dims)),min(520,max(h for w,h in dims))
        for m,c,(w,h) in zip(MODES,crops,dims):
            if scale<1: c=c.resize((w,h),Image.Resampling.LANCZOS)
            canvas=Image.new('RGBA',(cw,ch)); canvas.paste(c,((cw-w)//2,(ch-h)//2),c); save(canvas,OUT/'cards'/f'{m}.webp',quality=88)
    opaque_ui=SRC/'ui-sprites-gpt-image-2.png'
    if rec_in(opaque_ui):
        im=Image.open(opaque_ui)
        if im.size!=(1448,1086): raise ValueError(f'{opaque_ui.name}: expected (1448,1086), got {im.size}')
        for cell_id,_ in UI_CELLS:
            save(im.crop(UI_SOURCE_BOX[cell_id]),SRC/'ui-cells-opaque'/f'{cell_id}.png','PNG')
    layered_required=(SRC/'ui-layered').is_dir()
    for cell_id,destination in UI_CELLS:
        layered=SRC/'ui-layered'/f'{cell_id}.png'
        if rec_in(layered,not layered_required): save(trim(Image.open(layered)),OUT/destination,quality=88)
        elif layered_required: raise FileNotFoundError(f'missing required layered UI input: {layered}')
    title=SRC/'title-alpha.png'
    if rec_in(title,True):
        im=trim(Image.open(title));
        if im.width>1200: im=im.resize((1200,round(im.height*1200/im.width)),Image.Resampling.LANCZOS)
        save(im,OUT/'title.webp',quality=88)
    for n in ['splash-bg-gpt-image-2.png','reward-bg-gpt-image-2.png']:
        p=SRC/n
        if rec_in(p): save(Image.open(p).convert('RGB'),OUT/n.replace('-gpt-image-2.png','.webp'),quality=86)
    for m in MODES:
        p=SRC/'boards'/f'{m}-qwen.png'
        if not rec_in(p,True): continue
        im=Image.open(p).convert('RGB');
        if im.size!=(1024,1024): raise ValueError(f'{p}: expected (1024,1024), got {im.size}')
        im=im.crop((20,20,1004,1004)).resize((1024,1024),Image.Resampling.LANCZOS)
        save(im,OUT/'boards'/f'{m}.webp',quality=88)
        if m=='zipper':
            tile=im.crop((0,85,1024,938)).resize((640,533),Image.Resampling.LANCZOS)
            save_repo(tile,REPO/'assets/hub/tiles/button-zipper-lab.jpg',quality=86,optimize=True,progressive=True)
    rp=SRC/'finalize-report.json'
    payload=json.dumps(report,indent=2,sort_keys=True)+'\n'
    if not check:
        rp.parent.mkdir(exist_ok=True)
        rp.write_text(payload)
    print(payload,end='')
    if check and check_fail: raise SystemExit(1)
if __name__=='__main__': main()
