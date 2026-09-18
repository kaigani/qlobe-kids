"""Build Community Helper Cards runtime art from approved transparent cuts."""
from pathlib import Path
import hashlib, json
from PIL import Image, ImageOps, ImageDraw
import numpy as np

GAME = Path(__file__).resolve().parents[1]
REPO = GAME.parents[1]
SRC = GAME / "assets/source"
ART = GAME / "assets/art"
QA = SRC / "qa"
OUT = REPO / "assets/hub/tiles/community-helper-cards.jpg"

def clean(im, max_size):
    im = im.convert("RGBA")
    a = im.getchannel("A").point(lambda p: 0 if p <= 5 else 255 if p >= 240 else p)
    im.putalpha(a)
    bbox = a.getbbox()
    if bbox: im = im.crop(bbox)
    im.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)
    return im

def save(src, name, max_size, quality=82):
    im = clean(Image.open(src), max_size)
    if name in ("helmet.webp", "stethoscope.webp"):
        # Cutter QA: retain only the authored silhouette's largest connected alpha island.
        # This removes detached guide specks without repainting the raster.
        a = np.array(im.getchannel("A")) > 5
        seen = np.zeros(a.shape, dtype=bool); islands=[]
        h,w=a.shape
        for y,x in zip(*np.where(a)):
            if seen[y,x]: continue
            stack=[(y,x)]; seen[y,x]=True; pts=[]
            while stack:
                yy,xx=stack.pop(); pts.append((yy,xx))
                for dy,dx in ((1,0),(-1,0),(0,1),(0,-1)):
                    ny,nx=yy+dy,xx+dx
                    if 0<=ny<h and 0<=nx<w and a[ny,nx] and not seen[ny,nx]: seen[ny,nx]=True; stack.append((ny,nx))
            islands.append(pts)
        keep=max(islands,key=len) if islands else []
        mask=np.zeros(a.shape,dtype=np.uint8)
        for yy,xx in keep: mask[yy,xx]=255
        if name == "stethoscope.webp":
            # The generated transparent master also has saturated red guide
            # flecks touching the intended component through antialias pixels.
            rgba = np.array(im)
            red = (
                (rgba[:, :, 0] > 115)
                & (rgba[:, :, 0] > rgba[:, :, 1] * 1.35)
                & (rgba[:, :, 0] > rgba[:, :, 2] * 1.15)
            )
            contamination = np.zeros_like(red)
            for dy in range(-2, 3):
                for dx in range(-2, 3):
                    y_dst = slice(max(0, dy), min(h, h + dy))
                    x_dst = slice(max(0, dx), min(w, w + dx))
                    y_src = slice(max(0, -dy), min(h, h -dy))
                    x_src = slice(max(0, -dx), min(w, w - dx))
                    contamination[y_dst, x_dst] |= red[y_src, x_src]
            mask[contamination] = 0
            mask[220:, :36] = 0
        im.putalpha(Image.fromarray(mask))
        cleaned_bbox = im.getchannel("A").getbbox()
        if cleaned_bbox:
            im = im.crop(cleaned_bbox)
    dst = ART / name
    dst.parent.mkdir(parents=True, exist_ok=True)
    im.save(dst, "WEBP", quality=quality, method=6, exact=True)
    return dst, im

def main():
    ART.mkdir(parents=True, exist_ok=True); QA.mkdir(parents=True, exist_ok=True)
    jobs = {}
    for folder, names, limit in [
        ("cuts/helpers-neutral", [("firefighter.png","firefighter.webp"),("doctor.png","doctor.webp"),("teacher.png","teacher.webp"),("mail-carrier.png","mail-carrier.webp")],720),
        ("cuts/helpers-success", [(f+".png",f+".webp") for f in ["firefighter-success","doctor-success","teacher-success","mail-carrier-success"]],760),
        ("cuts/tools", [(f+".png",f+".webp") for f in ["hose","helmet","stethoscope","first-aid-kit","book","pencils","mailbag","letters"]],480),
        ("cuts/ui", [(f+".png",f+".webp") for f in ["card-red","card-teal","card-plum","card-blue","tool-card","prompt-panel","action-button","tool-tray"]],1200),
        ("cuts/title", [("title.png","title.webp")],1100),
        ("cuts/rewards", [(f+".png",f+".webp") for f in ["badge","album","star"]],500),
        ("cuts/role-badges", [(f+".png",f+".webp") for f in ["badge-firefighter","badge-doctor","badge-teacher","badge-mail-carrier"]],500),
    ]:
        quality = 76 if folder == "cuts/tools" else 80 if folder in ("cuts/ui", "cuts/rewards", "cuts/role-badges") else 82
        for src, dst in names: jobs[dst] = save(SRC/folder/src, dst, limit, quality)
    bg = Image.open(SRC/"gpt-image-2/theater-master.png").convert("RGB")
    bg = ImageOps.fit(bg, (1600,1200), method=Image.Resampling.LANCZOS)
    bgdst=ART/"theater.webp"; bg.save(bgdst,"WEBP",quality=78,method=6); jobs["theater.webp"]=(bgdst,bg)
    HUB_SOURCE = GAME / "assets/source/local-api/hub/krea-menu-seed42.png"
    hub = ImageOps.fit(Image.open(HUB_SOURCE).convert("RGB"), (640,533), method=Image.Resampling.LANCZOS)
    OUT.parent.mkdir(parents=True,exist_ok=True); hub.save(OUT,"JPEG",quality=91,optimize=True)
    # hostile magenta contact sheet for alpha/placement QA
    thumbs=[]
    for n,(p,im) in jobs.items():
        tile=Image.new("RGBA",(220,170),(255,0,180,255)); cp=im.copy().convert("RGBA"); cp.thumbnail((200,130)); tile.alpha_composite(cp,((220-cp.width)//2,8)); ImageDraw.Draw(tile).text((6,145),n,fill="white")
        thumbs.append(tile)
    sheet=Image.new("RGBA",(880,((len(thumbs)+3)//4)*170),(255,0,180,255))
    for i,t in enumerate(thumbs): sheet.alpha_composite(t,((i%4)*220,(i//4)*170))
    sheet.convert("RGB").save(QA/"contact-sheet-magenta.jpg",quality=90)
    receipt={"outputs":{},"hub":{"path":"assets/hub/tiles/community-helper-cards.jpg","size":list(hub.size),"bytes":OUT.stat().st_size}}
    for n,(p,im) in jobs.items():
        data=p.read_bytes(); alpha=im.getchannel("A") if im.mode=="RGBA" else None
        receipt["outputs"][n]={"path":str(p.relative_to(GAME)).replace("\\","/"),"size":list(im.size),"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest(),"alpha_nonzero":alpha.getbbox() is not None if alpha else False}
    (QA/"receipt.json").write_text(json.dumps(receipt,indent=2),encoding="utf-8")
    recipe={"workflow":"krea2-turbo-t2i","seed":42,"width":768,"height":640,"steps":8,"cfg":1,"prompt":"A red firefighter helmet beside a coiled yellow fire hose, a blue stethoscope, a red storybook, and a brown mailbag with one cream envelope, arranged around a small golden star badge on a warm toy stage. Bright soft 3D cartoon style with rounded simplified forms and cheerful proportions. Saturated colors, smooth shading, soft highlights, toy-like glossy finish. Premium preschool learning app asset, clean centered 6:5 composition, airy light background, no people, no title, no text, no letters, no words, no UI, no logos, no watermark."}
    hp=SRC/"local-api/hub/krea-menu-seed42.json"; hp.parent.mkdir(parents=True,exist_ok=True); hp.write_text(json.dumps(recipe,indent=2),encoding="utf-8")
    receipt["qa_process"]="Exact-count shared raster cutter cuts; alpha threshold <=5=>0 >=240=>255; helmet and stethoscope retain their largest 4-connected alpha island, while stethoscope additionally removes saturated red guide flecks with a 2 px fringe plus the tiny lower-left guide tail, then both retrim; no visible object pixels are repainted. Role badges cut from the approved GPT Image 2 sheet with expected-count=4 and close-radius=0."
    (SRC/"processing.json").write_text(json.dumps(receipt,indent=2),encoding="utf-8")
    (QA/"receipt.json").write_text(json.dumps(receipt,indent=2),encoding="utf-8")

if __name__ == "__main__": main()
