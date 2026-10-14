import { COSMETIC_PARTS, sanitizeKitSurfaceCss, sanitizeProductThemeCss } from './product-theme-css';

const norm = (css: string) => css.replace(/\s+/g, '');
const PREFIX = '[data-pagosya-product][data-style]';
/** Sanitize and assert nothing was dropped; returns the whitespace-free output. */
const clean = (css: string) => { const result = sanitizeProductThemeCss(css); expect(result.dropped).toEqual([]); return norm(result.css); };
/** Sanitize and assert everything was refused. */
const refused = (css: string) => { const result = sanitizeProductThemeCss(css); expect(result.css).toBe(''); expect(result.dropped.length).toBeGreaterThan(0); for (const item of result.dropped) expect(item.reason.length).toBeGreaterThan(3); return result; };
const rule = (declarations: string, selector = '[data-part="gallery"]') => `${selector}{${declarations}}`;

describe('guarded product theme CSS', () => {
  describe('selectors', () => {
    it.each(COSMETIC_PARTS)('keeps a rule on the cosmetic part %s, scoped to the product page', part => {
      expect(clean(rule('border:1px solid #111', `[data-part="${part}"]`))).toBe(norm(`${PREFIX} [data-part="${part}"]{border:1px solid #111}`));
    });

    it('accepts single or missing quotes and normalizes them', () => {
      expect(clean(rule('color:#111', "[data-part='title']"))).toBe(norm(`${PREFIX} [data-part="title"]{color:#111}`));
      expect(clean(rule('color:#111', '[data-part=title]'))).toBe(norm(`${PREFIX} [data-part="title"]{color:#111}`));
    });

    it.each([
      ['body'], ['*'], ['html'], ['div'], ['#x'], ['.product-detail__buy'], ['.product-detail__price'],
      ['[data-part="price"]'], ['[data-part="buy"]'], ['[data-part="seal"]'],
      ['[data-part="gallery"]:not(.x)'], ['[data-part="gallery"]:is(a)'], ['[data-part="gallery"]:has(img)'], ['[data-part="gallery"]:where(a)'],
      ['[data-part="gallery"] + [data-part="thumb"]'], ['[data-part="gallery"] ~ [data-part="thumb"]'], ['[data-part="gallery"] .x'],
      ['[data-part="gallery"]:visited'], ['[data-part="gallery"]::marker'], ['[data-part="gallery"]::before::after'], ['[data-part="gallery"]::before:hover'],
      ['[data-part="block"][data-part-type="video"]'], ['[data-other="x"]'], ['[data-part^="gal"]'], ['[data-part="a"] > [data-part="b"] > [data-part="c"] > [data-part="d"]'],
    ])('refuses the selector %s', selector => {
      const result = refused(rule('color:#111', selector));
      expect(result.dropped[0].reason).toMatch(/selector/i);
    });

    it('keeps the allowed half of a comma list and reports the other', () => {
      const result = sanitizeProductThemeCss('[data-part="gallery"], body, [data-part="title"]{color:#111}');
      expect(norm(result.css)).toBe(norm(`${PREFIX} [data-part="gallery"],${PREFIX} [data-part="title"]{color:#111}`));
      expect(result.dropped).toHaveLength(1);
      expect(result.dropped[0].rule).toContain('body');
    });

    it.each([
      ['[data-part="thumb"]:hover'], ['[data-part="thumb"]:focus-visible'], ['[data-part="thumb"]:active'], ['[data-part="thumb"]:first-child'], ['[data-part="thumb"]:last-child'],
      ['[data-part="thumb"]:nth-child(2)'], ['[data-part="title"]::before'], ['[data-part="title"]::after'],
      ['[data-part="blocks"] > [data-part="block"]'], ['[data-part="blocks"] [data-part="block"] [data-part="block-media"]'],
      ['[data-part="block"][data-part-type="compare"]'], ['[data-part="block"][data-part-type="media"]:hover'],
    ])('keeps the selector %s', selector => {
      expect(clean(rule('color:#111', selector))).toBe(norm(`${PREFIX} ${selector}{color:#111}`));
    });
  });

  describe('declarations', () => {
    it.each([
      ['url in a background', 'background:url(x.png)'], ['uppercase URL', 'background-image:URL(x.png)'], ['escaped url', 'background-image:u\\72l(x.png)'],
      ['image-set', 'background-image:image-set("a.png" 1x)'], ['expression', 'width:expression(alert(1))'], ['uppercase EXPRESSION', 'width:EXPRESSION(alert(1))'],
      ['important', 'color:red !important'], ['calc', 'width:calc(100% - 4px)'], ['clamp', 'font-size:clamp(12px,2vw,20px)'], ['env', 'padding:env(safe-area-inset-top)'], ['attr', 'width:attr(data-x)'],
      ['custom property', '--x:1'], ['too transparent', 'opacity:0.3'], ['just under the floor', 'opacity:0.59'], ['pointer-events', 'pointer-events:none'], ['cursor', 'cursor:pointer'],
      ['fixed position', 'position:fixed'], ['absolute without a pseudo-element', 'position:absolute'], ['display none', 'display:none'], ['visibility hidden', 'visibility:hidden'],
      ['font-size zero', 'font-size:0'], ['huge font', 'font-size:80px'], ['z-index high', 'z-index:9'], ['negative z-index', 'z-index:-1'],
      ['text content without a pseudo-element', 'content:"Verificado"'], ['free font family', 'font-family:Arial'], ['foreign variable', 'color:var(--evil)'],
      ['big translate', 'transform:translateX(500px)'], ['big rotate', 'transform:rotate(90deg)'], ['blur filter', 'filter:blur(4px)'], ['url filter', 'filter:url(#a)'],
      ['clip-path url', 'clip-path:url(#a)'], ['vendor property', '-webkit-box-shadow:0 0 1px red'], ['huge negative margin', 'margin:-40px'], ['huge padding', 'padding:80px'],
      ['long animation', 'animation:x 5s ease'], ['undefined animation', 'animation:spin 1s ease'], ['width on a non-sized part', 'width:100px'],
      ['unknown property', 'behavior:url(x)'], ['overflow scroll', 'overflow:scroll'], ['thick border', 'border:20px solid #111'], ['url as a colour', 'color:url(x)'],
    ])('drops %s', (_name, declaration) => {
      const selector = declaration.startsWith('width:100px') ? '[data-part="title"]' : '[data-part="gallery"]';
      refused(rule(declaration, selector));
    });

    it.each([
      'opacity:0.6', 'opacity:1', 'border-radius:12px', 'border-radius:50%', 'box-shadow:0 8px 20px rgba(0,0,0,.2)', 'box-shadow:0 0 0 2px #111',
      'transform:translateY(-4px) rotate(2deg)', 'transform:scale(1.05)', 'background:linear-gradient(135deg,#fff,#eee)', 'background-color:#fafafa', 'background-color:var(--pd-tint)',
      'clip-path:polygon(0 0,100% 0,100% 90%,0 100%)', 'clip-path:inset(0 round 12px)', 'clip-path:circle(50% at 50% 50%)', 'color:var(--store-ink)',
      'font-family:var(--store-heading-font)', 'letter-spacing:.1em', 'aspect-ratio:4 / 3', 'transition:transform .2s ease', 'filter:grayscale(.4) contrast(1.1)',
      'padding:8px 12px', 'margin:0 0 16px', 'gap:12px', 'font-size:1.25rem', 'font-weight:600', 'line-height:1.4', 'text-transform:uppercase', 'text-decoration:underline',
      'outline:2px solid #111', 'outline-offset:2px', 'object-fit:cover', 'mix-blend-mode:multiply', 'display:grid', 'overflow:hidden', 'z-index:1', 'border:1.5px dashed #111',
    ])('keeps %s', declaration => {
      const out = clean(rule(declaration));
      expect(out.startsWith(norm(`${PREFIX} [data-part="gallery"]{`))).toBe(true);
    });

    it('allows content:"" and absolute positioning on a pseudo-element or a decor slot only', () => {
      expect(clean(rule('content:"";position:absolute;top:0;left:0;width:24px;height:24px', '[data-part="gallery"]::before'))).toContain('position:absolute');
      expect(clean(rule('position:absolute;top:10px;left:10px', '[data-part="decor-a"]'))).toContain('position:absolute');
      refused(rule('position:absolute', '[data-part="title"]'));
      refused(rule('content:"x"', '[data-part="title"]::before'));
      refused(rule('content:""', '[data-part="title"]'));
    });

    it('allows width and height only on the parts that are sized boxes', () => {
      expect(clean(rule('width:40px;height:40px', '[data-part="swatch"]'))).toContain('width:40px');
      expect(clean(rule('width:100%', '[data-part="thumb"]'))).toContain('width:100%');
      refused(rule('width:100px;height:10px', '[data-part="title"]'));
    });

    it('protects interactive parts from being hidden, shrunk, clipped or stripped of focus', () => {
      refused(rule('width:0', '[data-part="swatch"]'));
      refused(rule('width:8px;height:8px', '[data-part="swatch"]'));
      refused(rule('width:20px;height:20px', '[data-part="swatch"]'));
      refused(rule('max-width:0', '[data-part="swatch"]'));
      expect(clean(rule('width:24px;height:24px', '[data-part="swatch"]'))).toContain('width:24px');
      expect(clean(rule('width:0;height:0', '[data-part="decor-a"]'))).toContain('width:0');
      refused(rule('clip-path:inset(100%)', '[data-part="swatch"]'));
      refused(rule('clip-path:polygon(0 0,0 0,0 0)', '[data-part="thumb"]'));
      expect(clean(rule('clip-path:inset(0 round 8px)', '[data-part="block"]'))).toContain('clip-path');
      refused(rule('outline:none', '[data-part="swatch"]:focus-visible'));
      refused(rule('outline:0', '[data-part="swatch"]:focus-visible'));
      refused(rule('color:transparent', '[data-part="swatch"]'));
      refused(rule('color:rgba(0,0,0,.2)', '[data-part="swatch"]'));
      expect(clean(rule('color:rgba(0,0,0,.8)', '[data-part="swatch"]'))).toContain('rgba');
    });

    it('reports each dropped declaration and keeps the valid ones in the same rule', () => {
      const result = sanitizeProductThemeCss(rule('color:#111;pointer-events:none;border-radius:8px'));
      expect(norm(result.css)).toBe(norm(`${PREFIX} [data-part="gallery"]{color:#111;border-radius:8px}`));
      expect(result.dropped).toEqual([expect.objectContaining({ declaration: expect.stringContaining('pointer-events'), reason: expect.stringMatching(/not allowed/) })]);
    });
  });

  describe('at-rules, motion and limits', () => {
    it.each(['@import url(x.css);', '@import "x.css";', '@font-face{font-family:x;src:url(a.woff)}', '@supports (display:grid){[data-part="gallery"]{color:red}}',
      '@container (min-width:10px){[data-part="gallery"]{color:red}}', '@layer x{[data-part="gallery"]{color:red}}', '@charset "utf-8";', '@page{margin:0}', '@property --x{syntax:"<color>";inherits:false}',
    ])('drops the at-rule %s', css => {
      refused(css);
    });

    it('keeps width and reduced-motion media queries and drops the rest', () => {
      expect(clean('@media (max-width: 600px){[data-part="gallery"]{padding:8px}}')).toContain('@media(max-width:600px)');
      expect(clean('@media (min-width: 900px){[data-part="gallery"]{padding:8px}}')).toContain('@media(min-width:900px)');
      expect(clean('@media (prefers-reduced-motion: reduce){[data-part="gallery"]{transition:none}}')).toContain('prefers-reduced-motion:reduce');
      refused('@media (min-width: 3000px){[data-part="gallery"]{padding:8px}}');
      refused('@media print{[data-part="gallery"]{padding:8px}}');
      refused('@media (max-width: 100px){[data-part="gallery"]{padding:8px}}');
    });

    it('renames keyframes to pt-<name>, rewrites references and only allows infinite inside no-preference motion', () => {
      const keyframes = '@keyframes bob{from{transform:translateY(0)}to{transform:translateY(8px)}}';
      const guarded = clean(`${keyframes}@media (prefers-reduced-motion: no-preference){${rule('animation:bob 1.2s ease-in-out infinite')}}`);
      expect(guarded).toContain('@keyframespt-bob');
      expect(guarded).toContain('animation:pt-bob1.2sease-in-outinfinite');
      const bare = sanitizeProductThemeCss(`${keyframes}${rule('animation:bob 1.2s ease-in-out infinite')}`);
      expect(norm(bare.css)).not.toContain('animation');
      expect(bare.dropped.some(item => /infinite/.test(item.reason))).toBe(true);
      const finite = clean(`${keyframes}${rule('animation:bob 1s ease 2')}`);
      expect(finite).toContain('animation:pt-bob1sease2');
    });

    it('drops keyframe steps that use forbidden properties', () => {
      const result = sanitizeProductThemeCss('@keyframes bad{from{pointer-events:none}to{opacity:1}}');
      expect(result.dropped.some(item => /pointer-events/.test(item.declaration ?? ''))).toBe(true);
    });

    it('fails closed on oversized input, too many rules, non-text and invalid CSS', () => {
      expect(refused('a'.repeat(3001)).dropped[0].reason).toMatch(/long|3000/i);
      expect(refused(Array.from({ length: 41 }, () => rule('color:#111')).join('')).dropped[0].reason).toMatch(/too many rules/);
      for (const junk of [undefined, null, 42, {}, ['x']]) expect(sanitizeProductThemeCss(junk).css).toBe('');
      expect(refused('[data-part="gallery"]{color:#111').dropped[0].reason).toMatch(/invalid CSS/);
    });

    it('ignores comments and is deterministic', () => {
      const css = `/* hello */ ${rule('color:#111')}`;
      expect(sanitizeProductThemeCss(css)).toEqual(sanitizeProductThemeCss(css));
      expect(clean(css)).toBe(norm(`${PREFIX} [data-part="gallery"]{color:#111}`));
    });

    it('is idempotent: sanitizing its own output changes nothing (stored designs are normalized again on every load)', () => {
      const css = '@keyframes bob{from{transform:translateY(0)}to{transform:translateY(8px)}}@media (prefers-reduced-motion: no-preference){[data-part="gallery"]{animation:bob 1.2s ease-in-out infinite}}[data-part="thumb"]:hover{color:#111}[data-part="title"]::before{content:"";color:#111}[data-part="blocks"] > [data-part="block"]{border:1px solid #111}@media (max-width: 600px){[data-part="gallery"]{padding:8px}}';
      const once = sanitizeProductThemeCss(css);
      expect(once.dropped).toEqual([]);
      expect(once.css.length).toBeGreaterThan(200);
      const twice = sanitizeProductThemeCss(once.css);
      expect(twice.dropped).toEqual([]);
      expect(twice.css).toBe(once.css);
    });

    it('counts the input without its scope prefixes, so a full-size theme survives being sanitized twice', () => {
      const rules = Array.from({ length: 30 }, (_, i) => `[data-part="gallery"]:nth-child(${i % 9 + 1}){border:1px solid #11${i % 10}}`).join('');
      const once = sanitizeProductThemeCss(rules);
      expect(rules.length).toBeLessThanOrEqual(3000);
      expect(once.css.length).toBeGreaterThan(3000);
      expect(sanitizeProductThemeCss(once.css).css).toBe(once.css);
    });

    it('drops top-level declarations that have no rule', () => {
      refused('color:#111;');
    });
  });
});

describe('kit surface profiles (spec 2026-10-14)', () => {
  it('scopes each surface and keeps allowed declarations, including kit variables', () => {
    const card = sanitizeKitSurfaceCss('card', '[data-part="card-media"]{transform:rotate(-3deg);box-shadow:6px 6px 0 var(--kit-ink)}');
    expect(card.css).toContain('[data-pagosya-catalog] [data-part="card-media"]');
    expect(card.css).toContain('var(--kit-ink)');
    expect(sanitizeKitSurfaceCss('cart', '[data-part="cart-line"]{border-bottom:2px dashed var(--store-foreground)}').css).toContain('.cart-drawer [data-part="cart-line"]');
    expect(sanitizeKitSurfaceCss('catalog', '[data-part="page-title"]{letter-spacing:.2em}').css).toContain('body:has([data-catalog-full]) [data-part="page-title"]');
  });

  it('out-weighs the look: every scope starts with :root:root:root so a touch beats the look on the same property', () => {
    expect(sanitizeKitSurfaceCss('card', '[data-part="card"]{border:1px solid #111}').css.trim().startsWith(':root:root:root [data-pagosya-catalog] ')).toBe(true);
    expect(sanitizeKitSurfaceCss('cart', '[data-part="cart-head"]{border-bottom:1px solid #111}').css.trim().startsWith(':root:root:root .cart-drawer ')).toBe(true);
    expect(sanitizeKitSurfaceCss('catalog', '[data-part="tabs"]{gap:4px}').css.trim().startsWith(':root:root:root body:has([data-catalog-full]) ')).toBe(true);
  });

  it('is idempotent', () => {
    const once = sanitizeKitSurfaceCss('card', '[data-part="card"]{border:2px solid #111}[data-part="card-name"]{text-transform:uppercase}').css;
    expect(sanitizeKitSurfaceCss('card', once).css).toBe(once);
  });

  it("refuses protected controls, other surfaces' parts, url() and hiding a card or a cart line", () => {
    expect(sanitizeKitSurfaceCss('card', '.menu-add{opacity:0}').css).toBe('');
    expect(sanitizeKitSurfaceCss('card', '[data-part="gallery"]{border:1px solid red}').css).toBe('');
    expect(sanitizeKitSurfaceCss('card', '[data-part="card-media"]{background:url(x.png)}').css).toBe('');
    expect(sanitizeKitSurfaceCss('card', '[data-part="card"]{display:none}').css).toBe('');
    expect(sanitizeKitSurfaceCss('cart', '[data-part="cart-line"]{opacity:.1}').css).toBe('');
  });

  it('leaves the product profile as it was', () => {
    expect(sanitizeProductThemeCss('[data-part="gallery"]{border:1px solid var(--kit-ink)}').css).toBe('');
    expect(sanitizeProductThemeCss('[data-part="gallery"]{border:1px solid var(--pd-line)}').css).toContain('var(--pd-line)');
  });
});
