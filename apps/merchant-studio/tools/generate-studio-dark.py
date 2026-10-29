"""Generates apps/merchant-studio/src/studio-dark.css: dark equivalents for the Studio's near-grey light backgrounds,
dark text and light borders, scoped to html[data-theme="dark"]. Brand colours (saturated) are never touched."""
import re, glob, colorsys, os, sys
SRC = '/Users/saramia/pagosYa/apps/merchant-studio/src'
NAMED = {'white': (255,255,255), 'black': (0,0,0)}
def parse(c):
    c = c.strip().lower()
    if c in NAMED: return NAMED[c], 1.0
    m = re.fullmatch(r'#([0-9a-f]{3,8})', c)
    if m:
        h = m.group(1)
        if len(h) in (3,4): h = ''.join(x*2 for x in h)
        r,g,b = int(h[0:2],16), int(h[2:4],16), int(h[4:6],16)
        a = int(h[6:8],16)/255 if len(h)==8 else 1.0
        return (r,g,b), a
    m = re.fullmatch(r'rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)\s*(?:[/,]\s*([\d.]+%?))?\s*\)', c)
    if m:
        a = m.group(4); a = (float(a[:-1])/100 if a and a.endswith('%') else float(a)) if a else 1.0
        return (int(m.group(1)),int(m.group(2)),int(m.group(3))), a
    return None
def lum(rgb): r,g,b=[x/255 for x in rgb]; return 0.2126*r+0.7152*g+0.0722*b
def sat(rgb):
    h,l,s = colorsys.rgb_to_hls(*[x/255 for x in rgb]); return s if 0.05 < l < 0.95 else 0
COLOR = r'(#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|\bwhite\b)'
def map_bg(rgb, a):
    L = lum(rgb)
    if sat(rgb) > 0.25: return None
    if a < 0.98 and L > 0.85: return f'rgb(30 30 35 / {max(a,0.6):.2f})'
    if L > 0.97: return '#1b1b1f'
    if L > 0.88: return '#232328'
    if L > 0.78: return '#2b2b31'
    return None
def map_text(rgb, a):
    if sat(rgb) > 0.3: return None
    L = lum(rgb)
    if L < 0.12: return '#ededef'
    if L < 0.45: return '#a1a1aa'
    return None
def map_border(rgb, a):
    if sat(rgb) > 0.25: return None
    L = lum(rgb)
    if L > 0.6: return 'rgb(255 255 255 / .12)'
    return None
PROPS = {'background': map_bg, 'background-color': map_bg, 'color': map_text, 'border-color': map_border,
         'border': map_border, 'border-top': map_border, 'border-bottom': map_border, 'border-left': map_border, 'border-right': map_border,
         'outline-color': map_border}
def rules(css):
    css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
    out = []; i = 0; stack = []
    # tokenise top-level and one level of @media
    for m in re.finditer(r'(@media[^{]+)\{((?:[^{}]*\{[^{}]*\})*)\s*\}|([^{}@]+)\{([^{}]*)\}', css):
        if m.group(1):
            for r in re.finditer(r'([^{}]+)\{([^{}]*)\}', m.group(2)): out.append((m.group(1).strip(), r.group(1).strip(), r.group(2)))
        else: out.append((None, m.group(3).strip(), m.group(4)))
    return out
lines = []
for path in sorted(glob.glob(os.path.join(SRC, '*.css'))):
    if path.endswith('studio-dark.css'): continue
    for media, sel, body in rules(open(path).read()):
        if not sel or sel.startswith('@') or 'keyframes' in sel or re.match(r'^(from|to|\d+%)', sel): continue
        decls = []
        for d in body.split(';'):
            if ':' not in d: continue
            prop, val = d.split(':', 1); prop = prop.strip().lower(); val = val.strip()
            if prop.startswith('--'):
                # Component tokens (--yp-ink, --resource-surface…): mapped by what the name says it paints.
                if 'gradient' in val or 'url(' in val or 'shadow' in prop: continue
                name = prop.lower()
                kind = 'text' if re.search(r'(ink|text|muted|faint|fg|foreground)', name) else 'border' if re.search(r'(line|edge|border|keyline|rule)', name) else 'bg' if re.search(r'(glass|surface|paper|bg|background|field|soft|card|panel|canvas|sheet)', name) else None
                if not kind: continue
                cols = re.findall(COLOR, val)
                new = val; changed = False
                for c in cols:
                    p2 = parse(c)
                    if not p2: continue
                    m2 = {'text': map_text, 'border': map_border, 'bg': map_bg}[kind](*p2)
                    if kind == 'border' and not m2 and lum(p2[0]) < 0.25 and p2[1] < 0.5: m2 = 'rgb(255 255 255 / .10)'
                    if m2: new = new.replace(c, m2, 1); changed = True
                if changed: decls.append(f'{prop}: {new.replace("!important","").strip()}')
                continue
            if prop not in PROPS or 'gradient' in val or 'url(' in val: continue
            cols = re.findall(COLOR, val)
            if not cols: continue
            new = val; changed = False
            for c in cols:
                p = parse(c)
                if not p: continue
                m2 = PROPS[prop](*p)
                if m2: new = new.replace(c, m2, 1); changed = True
            if changed: decls.append(f'{prop}: {new.replace("!important","").strip()}')
        if not decls: continue
        sels = []
        for s in sel.split(','):
            s = s.strip()
            if not s: continue
            if s.startswith(':root'): sels.append('html[data-theme="dark"]' + s[5:])
            elif s.startswith('html'): sels.append('html[data-theme="dark"]' + s[4:])
            else: sels.append('html[data-theme="dark"] ' + s)
        block = f'{", ".join(sels)} {{ {"; ".join(decls)}; }}'
        lines.append((media, block, os.path.basename(path)))
out = ['/* Generated by the overnight 2026-10-29 dark pass (apps/merchant-studio/tools/generate-studio-dark.py): the Studio embedded in the dark dashboard.',
       '   Near-grey light backgrounds, dark text and light borders get dark equivalents; brand colours are untouched. */',
       'html[data-theme="dark"] { color-scheme: dark; color: #ededef; background: #121214;',
       '  --ink: #ededef; --muted: #a1a1aa; --faint: #8b8b94; --paper: #121214; --warm-paper: #16161a; --surface: #1b1b1f;',
       '  --line: rgb(255 255 255 / .12); --line-firm: rgb(255 255 255 / .22); --sage-soft: rgb(74 222 128 / .12);',
       '  --blue-soft: rgb(59 130 246 / .16); --warning-soft: rgb(251 191 36 / .12); }',
       'html[data-theme="dark"] body { background: transparent; }',
       # source-library.css forces a light scheme on resource pages (more specific than the rule above); a scheme that
       # differs from the dark dashboard makes Chrome paint the iframe opaque white.
       'html[data-theme="dark"]:has(body.store-resource-body) { color-scheme: dark; background: transparent; }',
       'html[data-theme="dark"] body.store-resource-body { --resource-surface: #1b1b1f; --resource-field: #141417; --resource-soft: #26262b;',
       '  --resource-line: rgb(255 255 255 / .12); --resource-ink: #ededef; --resource-muted: #a1a1aa; }',
       'html[data-theme="dark"] body.store-resource-body :is(input, select, textarea) { background: #141417; color: #ededef; border-color: rgb(255 255 255 / .15); }']
cur = None
for media, block, src in lines:
    if media: out.append(f'{media} {{ {block} }}')
    else: out.append(block)
open(os.path.join(SRC, 'studio-dark.css'), 'w').write('\n'.join(out) + '\n')
print('rules', len(lines))
