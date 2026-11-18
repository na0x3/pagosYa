"""Numbered contact sheets (48 per sheet) of a candidates folder, for picking a sector's photos by eye."""
import glob, os, sys
from PIL import Image, ImageDraw
d = sys.argv[1]; files = sorted(glob.glob(os.path.join(d, '[0-9]*.jpg')))
W, H, cols = 240, 170, 8
for start in range(0, len(files), 48):
    chunk = files[start:start + 48]; rows = (len(chunk) + cols - 1) // cols
    img = Image.new('RGB', (cols * W, rows * H), 'white'); draw = ImageDraw.Draw(img)
    for i, f in enumerate(chunk):
        try:
            src = Image.open(f); size = src.size; t = src.convert('RGB'); t.thumbnail((W - 6, H - 22))
            x, y = (i % cols) * W, (i // cols) * H; img.paste(t, (x + 3, y + 3)); draw.text((x + 4, y + H - 18), f'{os.path.basename(f)[:3]} {size[0]}x{size[1]}', fill='black')
        except Exception:
            pass
    img.save(os.path.join(d, f'sheet{start // 48}.jpg'), quality=80)
