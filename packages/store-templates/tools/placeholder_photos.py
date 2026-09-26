"""Placeholder demo photos for a template until the owner's real photos replace them.

Soft studio backdrops with a simple product silhouette in the template's palette, so previews read as a finished
store. Usage: python3 tools/placeholder_photos.py <template-id> <spec.json>
spec: {"size": [w, h], "shots": {"slot": {"kind": "bag|bottle|jar|cup|box|garment|shoe|device|plant|pouch|candle|print|bread|toy|bowl|scene",
        "bg": ["#top", "#bottom"], "body": "#hex", "accent": "#hex", "size": [w, h]?}}}
"""
import json, sys
from PIL import Image, ImageDraw, ImageFilter

def hex_rgb(value):
    value = value.lstrip('#'); return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))

def backdrop(size, top, bottom):
    w, h = size; im = Image.new('RGB', size); d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / h; d.line([(0, y), (w, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    # A floor line for depth.
    d.rectangle([0, int(h * .72), w, h], fill=tuple(max(0, c - 14) for c in bottom))
    return im.filter(ImageFilter.GaussianBlur(24))

def shadow(im, box, strength=70):
    layer = Image.new('L', im.size, 0); ImageDraw.Draw(layer).ellipse(box, fill=strength)
    layer = layer.filter(ImageFilter.GaussianBlur(int(im.size[0] * .03)))
    dark = Image.new('RGB', im.size, (20, 16, 12)); im.paste(dark, (0, 0), layer)

def draw(kind, im, body, accent):
    w, h = im.size; d = ImageDraw.Draw(im); cx = w / 2; r = int(w * .02)
    base = h * .74
    shadow(im, [cx - w * .22, base - h * .03, cx + w * .22, base + h * .035])
    d = ImageDraw.Draw(im)
    if kind == 'bottle':
        d.rounded_rectangle([cx - w * .09, h * .34, cx + w * .09, base], radius=r * 2, fill=body)
        d.rounded_rectangle([cx - w * .05, h * .26, cx + w * .05, h * .35], radius=r, fill=accent)
    elif kind == 'jar':
        d.rounded_rectangle([cx - w * .15, h * .46, cx + w * .15, base], radius=r * 3, fill=body)
        d.rounded_rectangle([cx - w * .16, h * .41, cx + w * .16, h * .48], radius=r, fill=accent)
    elif kind == 'bag':
        d.polygon([(cx - w * .16, h * .30), (cx + w * .16, h * .30), (cx + w * .19, base), (cx - w * .19, base)], fill=body)
        d.rectangle([cx - w * .16, h * .30, cx + w * .16, h * .35], fill=tuple(max(0, c - 25) for c in body))
        d.rounded_rectangle([cx - w * .1, h * .47, cx + w * .1, h * .58], radius=r, fill=accent)
    elif kind == 'pouch':
        d.rounded_rectangle([cx - w * .17, h * .32, cx + w * .17, base], radius=r * 3, fill=body)
        d.rounded_rectangle([cx - w * .17, h * .32, cx + w * .17, h * .38], radius=r, fill=accent)
    elif kind == 'cup':
        d.polygon([(cx - w * .14, h * .44), (cx + w * .14, h * .44), (cx + w * .11, base), (cx - w * .11, base)], fill=body)
        d.ellipse([cx + w * .1, h * .5, cx + w * .2, h * .62], outline=body, width=int(w * .02))
        d.ellipse([cx - w * .14, h * .42, cx + w * .14, h * .47], fill=accent)
    elif kind == 'box':
        d.rectangle([cx - w * .18, h * .40, cx + w * .18, base], fill=body)
        d.polygon([(cx - w * .18, h * .40), (cx - w * .1, h * .33), (cx + w * .26, h * .33), (cx + w * .18, h * .40)], fill=tuple(min(255, c + 22) for c in body))
        d.polygon([(cx + w * .18, h * .40), (cx + w * .26, h * .33), (cx + w * .26, base - h * .07), (cx + w * .18, base)], fill=tuple(max(0, c - 30) for c in body))
        d.rectangle([cx - w * .18, h * .52, cx + w * .18, h * .57], fill=accent)
    elif kind == 'garment':
        d.polygon([(cx - w * .12, h * .22), (cx - w * .28, h * .32), (cx - w * .22, h * .42), (cx - w * .15, h * .38), (cx - w * .15, base), (cx + w * .15, base), (cx + w * .15, h * .38), (cx + w * .22, h * .42), (cx + w * .28, h * .32), (cx + w * .12, h * .22), (cx + w * .05, h * .26), (cx - w * .05, h * .26)], fill=body)
        d.rectangle([cx - w * .15, h * .6, cx + w * .15, h * .62], fill=accent)
    elif kind == 'shoe':
        d.rounded_rectangle([cx - w * .26, h * .6, cx + w * .26, base], radius=r, fill=accent)
        d.pieslice([cx - w * .26, h * .44, cx + w * .12, h * .76], 180, 360, fill=body)
        d.rounded_rectangle([cx - w * .06, h * .55, cx + w * .26, h * .66], radius=r * 2, fill=body)
    elif kind == 'device':
        d.rounded_rectangle([cx - w * .12, h * .22, cx + w * .12, base], radius=r * 3, fill=body)
        d.rounded_rectangle([cx - w * .105, h * .245, cx + w * .105, base - h * .025], radius=r * 2, fill=accent)
    elif kind == 'plant':
        d.polygon([(cx - w * .12, h * .56), (cx + w * .12, h * .56), (cx + w * .09, base), (cx - w * .09, base)], fill=body)
        for dx, dy, s in [(-.1, .32, .12), (.08, .28, .13), (0, .2, .1), (-.02, .4, .11), (.12, .42, .09)]:
            d.ellipse([cx + w * (dx - s / 2), h * dy, cx + w * (dx + s / 2), h * (dy + s * 1.6)], fill=accent)
    elif kind == 'candle':
        d.rounded_rectangle([cx - w * .13, h * .44, cx + w * .13, base], radius=r * 2, fill=body)
        d.rectangle([cx - w * .005, h * .38, cx + w * .005, h * .44], fill=(40, 30, 20))
        glow = Image.new('L', im.size, 0); ImageDraw.Draw(glow).ellipse([cx - w * .08, h * .26, cx + w * .08, h * .42], fill=160)
        im.paste(Image.new('RGB', im.size, hex_rgb('#ffd27a')), (0, 0), glow.filter(ImageFilter.GaussianBlur(int(w * .03))))
        ImageDraw.Draw(im).ellipse([cx - w * .012, h * .34, cx + w * .012, h * .385], fill=accent)
    elif kind == 'print':
        d.rectangle([cx - w * .2, h * .16, cx + w * .2, base], fill=(250, 248, 244))
        d.rectangle([cx - w * .16, h * .2, cx + w * .16, base - h * .05], fill=body)
        d.ellipse([cx - w * .08, h * .3, cx + w * .1, h * .46], fill=accent)
    elif kind == 'bread':
        d.ellipse([cx - w * .26, h * .5, cx + w * .26, base + h * .02], fill=body)
        for i in range(-2, 3):
            d.arc([cx + w * (i * .08 - .05), h * .54, cx + w * (i * .08 + .05), h * .64], 200, 340, fill=accent, width=int(w * .012))
    elif kind == 'toy':
        d.ellipse([cx - w * .16, h * .44, cx + w * .16, base], fill=body)
        d.ellipse([cx - w * .1, h * .28, cx + w * .1, h * .48], fill=accent)
        d.ellipse([cx - w * .16, h * .26, cx - w * .06, h * .36], fill=accent); d.ellipse([cx + w * .06, h * .26, cx + w * .16, h * .36], fill=accent)
    elif kind == 'bowl':
        d.pieslice([cx - w * .24, h * .38, cx + w * .24, base + h * .04], 0, 180, fill=body)
        d.ellipse([cx - w * .22, h * .52, cx + w * .22, h * .6], fill=accent)
    elif kind == 'scene':
        for i, (dx, s, col) in enumerate([(-.2, .18, body), (.05, .24, accent), (.24, .14, body)]):
            d.rounded_rectangle([cx + w * (dx - s / 2), base - h * s * 1.7, cx + w * (dx + s / 2), base], radius=r * 2, fill=col)

def main():
    template, spec_path = sys.argv[1], sys.argv[2]
    spec = json.load(open(spec_path))
    for slot, shot in spec['shots'].items():
        size = tuple(shot.get('size', spec['size']))
        im = backdrop(size, hex_rgb(shot['bg'][0]), hex_rgb(shot['bg'][1]))
        draw(shot['kind'], im, hex_rgb(shot['body']), hex_rgb(shot['accent']))
        im.save(f'templates/{template}/demo/{slot}.jpg', quality=80, optimize=True)

if __name__ == '__main__':
    main()
