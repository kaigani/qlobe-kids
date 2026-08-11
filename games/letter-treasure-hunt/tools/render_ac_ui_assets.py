"""Render deterministic completion, pause, and feedback plates."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
RASTER = ROOT / "assets" / "ui-raster"
FONT = ROOT.parents[1] / "shared" / "fonts" / "fredoka-latin-600-normal.woff2"

def font(size):
    return ImageFont.truetype(str(FONT), size)

def centered(draw, box, text, fnt, fill, shadow=(72, 48, 35, 145), stroke=0):
    x0, y0, x1, y1 = box
    bb = draw.textbbox((0, 0), text, font=fnt, stroke_width=stroke)
    x = (x0 + x1 - (bb[2] - bb[0])) / 2 - bb[0]
    y = (y0 + y1 - (bb[3] - bb[1])) / 2 - bb[1]
    draw.text((x + 7, y + 8), text, font=fnt, fill=shadow, stroke_width=2, stroke_fill=shadow)
    draw.text((x, y), text, font=fnt, fill=fill, stroke_width=stroke,
              stroke_fill=(255, 239, 203, 225) if stroke else None)

def completion(letter, phrase, accent, out):
    im = Image.open(RASTER / "completion-base.webp").convert("RGBA")
    d = ImageDraw.Draw(im)
    w, h = im.size
    centered(d, (170, 65, w - 170, 335), "Well Done!", font(220), (239, 101, 72, 255), stroke=3)
    centered(d, (180, 315, w - 180, 515), phrase, font(112), accent, stroke=2)
    centered(d, (660, 565, 1235, 730), "3 of 3", font(86), (255, 255, 245, 255), shadow=(20, 57, 96, 170))
    im.save(RASTER / out, "WEBP", lossless=True, method=0)

def fit_font(text, max_width, start=72):
    size = start
    while size > 24 and ImageDraw.Draw(Image.new("RGB", (1, 1))).textbbox((0, 0), text, font=font(size))[2] > max_width:
        size -= 2
    return font(size)

def feedback(name, text, accent):
    im = Image.open(RASTER / "prompt-base.webp").convert("RGBA")
    d = ImageDraw.Draw(im)
    f = fit_font(text, int(im.width * 0.84), 78)
    centered(d, (130, 72, im.width - 130, 384), text, f, accent, shadow=(62, 43, 28, 135), stroke=1)
    path = RASTER / "feedback" / f"{name}.webp"
    path.parent.mkdir(exist_ok=True)
    im.save(path, "WEBP", lossless=True, method=0)

def pause(name, text):
    im = Image.open(RASTER / "prompt-base.webp").convert("RGBA")
    d = ImageDraw.Draw(im)
    f = fit_font(text, int(im.width * 0.84), 82)
    centered(d, (130, 72, im.width - 130, 300), text, f,
             (8, 127, 136, 255), shadow=(91, 53, 25, 180), stroke=1)
    path = RASTER / "dialogs" / f"{name}.webp"
    path.parent.mkdir(exist_ok=True)
    im.save(path, "WEBP", lossless=True, method=0)

if __name__ == "__main__":
    # Preserve the original A/C copy and add the remaining islands.
    islands = {
      "A": ("Apple Island", "Apple", [("ant","Ant"),("apple","Apple"),("alligator","Alligator")]),
      "B": ("Beach Ball Island", "Ball", [("butterfly","Butterfly"),("ball","Ball"),("boat","Boat")]),
      "C": ("Cupcake Island", "Cupcake", [("cat","Cat"),("cupcake","Cupcake"),("car","Car")]),
      "D": ("Drum Island", "Drum", [("dog","Dog"),("drum","Drum"),("duck","Duck")]), "E": ("Elephant Island","Elephant",[("elephant","Elephant"),("egg","Egg"),("envelope","Envelope")]), "F": ("Frog Island","Frog",[("fish","Fish"),("flower","Flower"),("frog","Frog")]), "G": ("Grape Island","Grapes",[("goat","Goat"),("grapes","Grapes"),("guitar","Guitar")]), "H": ("Horse Island","Horse",[("hat","Hat"),("horse","Horse"),("house","House")]), "I": ("Ice Cream Island","Ice Cream",[("ice-cream","Ice Cream"),("igloo","Igloo"),("insect","Insect")]), "J": ("Jellyfish Island","Jellyfish",[("jacket","Jacket"),("jellyfish","Jellyfish"),("juice","Juice")]), "K": ("Kite Island","Kite",[("kite","Kite"),("key","Key"),("kangaroo","Kangaroo")]), "L": ("Lemon Island","Lemon",[("lion","Lion"),("leaf","Leaf"),("lemon","Lemon")]), "M": ("Moon Island","Moon",[("monkey","Monkey"),("moon","Moon"),("muffin","Muffin")]), "N": ("Nest Island","Nest",[("nest","Nest"),("noodles","Noodles"),("nose","Nose")]), "O": ("Orange Island","Orange",[("owl","Owl"),("orange","Orange"),("octopus","Octopus")]), "P": ("Pineapple Island","Pineapple",[("penguin","Penguin"),("pineapple","Pineapple"),("pizza","Pizza")]), "Q": ("Quilt Island","Quilt",[("queen","Queen"),("quilt","Quilt"),("quail","Quail")]), "R": ("Rainbow Island","Rainbow",[("rabbit","Rabbit"),("rainbow","Rainbow"),("robot","Robot")]), "S": ("Starfish Island","Starfish",[("sun","Sun"),("starfish","Starfish"),("shell","Shell")]), "T": ("Train Island","Train",[("tiger","Tiger"),("turtle","Turtle"),("train","Train")]), "U": ("Umbrella Island","Umbrella",[("umbrella","Umbrella"),("unicorn","Unicorn"),("ukulele","Ukulele")]), "V": ("Violin Island","Violin",[("violin","Violin"),("volcano","Volcano"),("van","Van")]), "W": ("Watermelon Island","Watermelon",[("whale","Whale"),("watermelon","Watermelon"),("wagon","Wagon")]), "X": ("Xylophone Island","Xylophone",[("xylophone","Xylophone"),("x-ray","X-ray"),("x-mark","X Marks the Spot")]), "Y": ("Yo-Yo Island","Yo-Yo",[("yak","Yak"),("yo-yo","Yo-Yo"),("yarn","Yarn")]), "Z": ("Zebra Island","Zebra",[("zebra","Zebra"),("zipper","Zipper"),("zucchini","Zucchini")])}
    accents = [(239,101,72,255),(22,123,122,255),(8,127,136,255),(187,90,52,255)]
    distractors = {'A':'ball','B':'cat','C':'apple','D':'apple','E':'ball','F':'cat','G':'ant','H':'butterfly','I':'cupcake','J':'alligator','K':'boat','L':'car','M':'apple','N':'ball','O':'cat','P':'ant','Q':'butterfly','R':'cupcake','S':'alligator','T':'boat','U':'car','V':'apple','W':'ball','X':'cat','Y':'ant','Z':'butterfly'}
    cues = {'A':'Ah','B':'Buh','C':'Kuh', **dict(zip('DEFGHJKLMNPQRTVWYZ', ['Duh','Eh','Fuh','Guh','Huh','Juh','Kuh','Luh','Muh','Nuh','Puh','Kwuh','Ruh','Tuh','Vuh','Wuh','Yuh','Zuh']))}
    article_an = set('AEFHILMNORSX')
    items = {}
    for idx, (L, (island, completion_word, targets)) in enumerate(islands.items()):
        accent = accents[idx % 4]; low = L.lower()
        completion(L, f"{L} is for {completion_word}!", accent, f"completion-{low}.webp")
        pause(f"pause-{low}", f"{island} paused")
        for item_id, word in targets:
            if L == 'S' and item_id == 'shell': text = 'S is for shell!'
            elif L == 'S' and item_id in ('sun','starfish'): text = f'S is for {word.lower()}! Sss, {word.lower()}.'
            elif L in 'IOUX': text = f'{L} is for {word.lower()}!'
            else: text = f'{L} is for {word.lower()}! {cues.get(L, L + "uh")}, {word.lower()}.'
            items[item_id] = text
        items[f'another-{low}'] = f"Treasure found! Find another {L} thing."
        art = 'an' if L in article_an else 'a'
        items[f'wrong-{low}'] = f"That is a treasure chest. Find {art} {L} thing."
        items[f'idle-{low}'] = f"Can you find {art} {L} treasure?"
        dw = distractors.get(L, 'ball'); other = dw[0].upper()
        items[f'wrong-{low}-{dw}'] = f"{dw.capitalize()} starts with {other}, not {L}. Find {art} {L} thing."
    # Render all generated copy using destination-island accents.
    for name, text in items.items():
        L = name.split('-')[1] if name.startswith(('another-','wrong-','idle-')) else next((k.lower() for k,v in islands.items() if name in [x[0] for x in v[2]]), 'a')
        feedback(name, text, accents[(ord(L.upper())-65) % 4])
