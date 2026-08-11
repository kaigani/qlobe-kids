from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).parents[1]
ui = root / 'assets/ui-raster'
ui.joinpath('dialogs').mkdir(exist_ok=True)
font = root.parents[1] / 'shared/fonts/fredoka-latin-600-normal.woff2'


def render(name, base, lines, sizes, ys, colors):
    image = Image.open(ui / base).convert('RGBA')
    draw = ImageDraw.Draw(image)
    for text, y, size, color in zip(lines, ys, sizes, colors):
        face = ImageFont.truetype(font, size)
        box = draw.textbbox((0, 0), text, font=face)
        x = (image.width - (box[2] - box[0])) // 2
        draw.text((x + 4, y + 5), text, font=face, fill=(85, 52, 25, 72))
        draw.text((x, y), text, font=face, fill=color)
    image.save(ui / name, 'WEBP', lossless=True)


render('dialogs/pause-b.webp', 'prompt-base.webp',
       ['Beach Ball Island paused'], [74], [112], [(22, 123, 122, 255)])
render('dialogs/grownup.webp', 'prompt-base.webp',
       ['Grown-up area', '26 letter islands are ready to explore.', 'Choose a letter, then tap PLAY.'],
       [76, 47, 47], [70, 190, 260],
       [(22, 123, 122, 255), (90, 53, 31, 255), (90, 53, 31, 255)])
render('dialogs/orientation.webp', 'prompt-base.webp',
       ['Turn your tablet sideways', 'The treasure map is ready in landscape.'],
       [70, 48], [80, 215],
       [(22, 123, 122, 255), (90, 53, 31, 255)])
render('controls/ok.webp', 'control-base.webp', ['OK'], [138], [445], [(22, 123, 122, 255)])
