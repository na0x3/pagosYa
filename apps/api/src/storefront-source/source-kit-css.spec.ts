import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import postcss from 'postcss';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_KIT_PRODUCT_HOOK, SOURCE_MOTION_LIMITS, STORE_KIT_LAYER_ORDER, applySourceKitCss, extractKitBlock, validateAuthoredCss, validateStoreKitCss } from './source-kit-css';

/** Every declaration of a stylesheet with where it sits: inside the store-kit layer or not. */
function sheet(css: string) {
  const out: Array<{ layered: boolean; selector: string; prop: string; value: string; important: boolean }> = [];
  postcss.parse(css).walkDecls(decl => {
    let layered = false;
    for (let node: any = decl.parent; node; node = node.parent) if (node.type === 'atrule' && node.name === 'layer') layered = true;
    out.push({ layered, selector: (decl.parent as any).selector ?? '', prop: decl.prop, value: decl.value, important: Boolean(decl.important) });
  });
  return out;
}
const find = (css: string, selector: string, prop: string) => sheet(css).find(d => (d.selector === selector || d.selector === ':root:not(#pagosya-store-kit) ' + selector) && d.prop === prop);
const kit = (css: string) => validateStoreKitCss(css);

describe('store kit CSS: allowed selectors', () => {
  it.each([
    '.cart-drawer', '.cart-added', '.order-item__photo', '.checkout-review__summary', '[data-pagosya-checkout] .order-items',
    '.menu-item', '.menu-add', '.checkout-button', '.pagosya-contact-panel', '[data-pagosya-contact] h2', '[data-pagosya-privacy]',
    '.quantity button', 'dialog.cart-drawer', 'html[data-dna-cart=sheet] .cart-drawer', ':root[data-dna-button="pill"] .menu-add',
  ])('keeps a rule rooted on %s, inside the store-kit layer', selector => {
    const out = kit(`${selector}{border-radius:3px}`);
    expect(find(out.css, selector, 'border-radius')).toMatchObject({ layered: true, value: '3px' });
    expect(out.repairs).toEqual([]);
  });

  it('lets a bare :root or html rule set only --kit-* and --motion-* tokens', () => {
    const out = kit(':root{--kit-btn-radius:2px;--motion-base:300ms;color:red}');
    expect(find(out.css, ':root', '--kit-btn-radius')?.value).toBe('2px');
    expect(find(out.css, ':root', '--motion-base')?.value).toBe('300ms');
    expect(find(out.css, ':root', 'color')).toBeUndefined();
    expect(out.repairs.join('\n')).toMatch(/color/);
  });

  it.each([
    '.checkout-buttonX', '.quantityfoo', '.menu-itemx .a', '.cart-drawer-fake', '[data-pagosya-checkoutx]', '[data-pagosya-privacy-x]',
    '.cart-drawer ~ *', '.cart-drawer + main', '.menu-item ~ .hero .menu-add',
  ])('strips %s: not a kit surface', selector => {
    const out = kit(`${selector}{border-radius:3px}`);
    expect(sheet(out.css)).toEqual([]);
    expect(out.repairs.join('\n')).toMatch(/not a kit surface/);
  });

  it.each(['.menu-item + .menu-item', '.order-item ~ .order-item__photo', '[data-pagosya-checkout-page] .x', '[data-pagosya-product-page] .x', '.cart-drawer__body', '.menu-item--featured'])('keeps %s', selector => {
    const out = kit(`${selector}{border-radius:3px}`);
    expect(out.repairs).toEqual([]);
  });

  it('strips selectors that are not rooted on a kit surface, keeping the rest of the list', () => {
    const out = kit('body .menu-add, .cart-drawer{background:#fff}button{color:red}.hero{margin:0}.cart-drawer{.x{color:red}}');
    expect(sheet(out.css).map(d => d.selector)).toEqual(['.cart-drawer']);
    expect(out.repairs.join('\n')).toMatch(/body \.menu-add/);
    expect(out.repairs.join('\n')).toMatch(/button/);
    expect(out.repairs.join('\n')).toMatch(/\.hero/);
  });
});

describe('protected elements', () => {
  it.each([
    ['.menu-add', 'display:none'], ['.checkout-review .order-total', 'visibility:hidden'], ['.checkout-button', 'opacity:.4'], ['.menu-add', 'opacity:var(--fade)'],
    ['.product-detail__price', 'clip:rect(0 0 0 0)'], ['.menu-add', 'clip-path:inset(50%)'], ['[data-pagosya-checkout] .order-total', 'font-size:10px'],
    ['.product-detail__buy', 'font-size:0.6rem'], ['.menu-item__price', 'font-size:clamp(8px,2vw,14px)'], ['.menu-item__price', 'font-size:3vw'],
    ['.checkout-button', 'transform:scale(.5)'], ['.menu-add', 'scale:.8'], ['.quantity', 'left:-9999px'], ['.product-detail__status', 'text-indent:-999em'],
    ['.checkout-button', 'transform:translateX(-200vw)'], ['.menu-add', 'pointer-events:none'], ['.cart-drawer .order-total', 'color:transparent'],
    ['.pagosya-contact-panel .order-total', '-webkit-text-fill-color:rgba(0,0,0,0)'], ['.checkout-button span', 'visibility:hidden'],
    ['[data-pagosya-privacy] button', 'font-size:9px'], ['.menu-add', 'zoom:.5'],
  ])('strips %s { %s }', (selector, declaration) => {
    const prop = declaration.split(':')[0];
    for (const out of [kit(`${selector}{${declaration};border-radius:3px}`), validateAuthoredCss(`${selector}{${declaration};border-radius:3px}`, 'styles.css')]) {
      expect(find(out.css, selector, prop)).toBeUndefined();
      expect(find(out.css, selector, 'border-radius')?.value).toBe('3px');
      expect(out.repairs.join('\n')).toMatch(/protected/);
    }
  });

  it('strips a text colour equal to the background in the same rule', () => {
    const out = kit('.menu-add{color:#B00;background:#b00}');
    expect(find(out.css, '.menu-add', 'color')).toBeUndefined();
    expect(find(out.css, '.menu-add', 'background')?.value).toBe('#b00');
  });

  it.each([
    '.checkout-button[disabled]{opacity:.5}', '.menu-add:disabled{opacity:.5;pointer-events:none}', '.menu-add::before{display:none}',
    '.menu-add{transform:scale(.96)}', '.checkout-review .order-total{font-size:13px}', '.checkout-button svg{display:none}', '.menu-item{opacity:.8}',
    '.menu-add{clip-path:polygon(0 0,100% 0,100% 100%,0 100%)}', '.cart-drawer{transform:translateX(100%)}', '.menu-add{font-size:clamp(13px,1vw,16px)}',
    '.menu-add{opacity:1}', '.checkout-button{font-size:max(12px,1vw)}',
  ])('keeps %s', css => {
    const out = kit(css);
    expect(sheet(out.css).length).toBe(sheet(css).length);
    expect(out.repairs).toEqual([]);
  });
});

describe('protected scope: the product page buy flow and legal text', () => {
  it.each([
    '.product-detail__purchase{display:none}', '[data-pagosya-product] *{visibility:hidden}', '.product-detail__buy{margin-left:-100%}',
    '.product-detail__buybox{opacity:.2}', '.product-detail__layout{clip-path:inset(50%)}', '.product-detail__copy{visibility:hidden}',
    '.product-detail__summary{display:none}', '.product-detail__pricing{opacity:0}', '[data-pagosya-product]{display:none}',
    '.product-detail__gallery{transform:translateX(-200vw)}', '[data-pagosya-product] .product-detail__sticky{pointer-events:none}',
    '[data-pagosya-privacy] p{display:none}', '[data-pagosya-privacy] a{visibility:hidden}', '[data-pagosya-privacy] label{font-size:8px}',
    '[data-pagosya-checkout] .pagosya-policies a{opacity:0}', '[data-pagosya-privacy] > div{display:none}', '[data-pagosya-checkout] [data-pagosya-status]{display:none}',
    '[data-pagosya-checkout] .pagosya-secure-note svg{display:none}', '.menu-item button{display:none}', '.cart-drawer a{visibility:hidden}', '.menu-item *{opacity:0}',
    '.checkout-button p{display:none}', '.menu-item :not(.menu-add){opacity:.5}', '.menu-add:has(:empty){display:none}', '.menu-add:where(:disabled,*){opacity:0}',
  ])('strips %s', css => {
    const out = kit(css);
    expect(sheet(out.css)).toEqual([]);
    expect(out.repairs.join('\n')).toMatch(/protected/);
  });

  it('checks product-page rules in the store\'s own stylesheets too', () => {
    const out = validateAuthoredCss('.product-detail__purchase{display:none;gap:4px}[data-pagosya-privacy] p{opacity:.1}', 'styles.css');
    expect(sheet(out.css).map(d => d.prop)).toEqual(['gap']);
  });

  it.each([
    '.product-detail__gallery{gap:4px;border-radius:9px}', '.product-detail__thumbnails [hidden]{display:none}', '.product-detail__buy::before{display:none}',
    '.product-detail__layout{grid-template-columns:1fr 1fr}', '[data-pagosya-privacy] p{color:#333;font-size:13px}', '.menu-item button{border-radius:0}',
  ])('keeps %s', css => {
    const out = kit(css);
    expect(sheet(out.css).length).toBe(sheet(css).length);
    expect(out.repairs).toEqual([]);
  });
});

describe('hiding techniques that defeat the buy button', () => {
  it.each([
    ['.menu-add', 'height:0;overflow:hidden', 'height'], ['.checkout-button', 'max-height:0;overflow:clip', 'max-height'], ['.product-detail__purchase', 'max-height:0px;overflow-y:hidden', 'max-height'],
    ['.menu-add', 'transform:translateY(120%)', 'transform'], ['.product-detail__sticky', 'transform:translateY(100%)', 'transform'], ['.menu-add', 'translate:0 100%', 'translate'],
    ['.menu-add', 'left:9999px', 'left'], ['.checkout-button', 'right:100vw', 'right'], ['.menu-add', 'top:-499px', 'top'],
    ['.menu-add', 'filter:opacity(0)', 'filter'], ['.checkout-button', 'filter:blur(8px)', 'filter'], ['.menu-add', 'filter:brightness(0) opacity(.2)', 'filter'],
    ['.menu-add', 'transform:rotateY(90deg)', 'transform'], ['.menu-add', 'mask:linear-gradient(transparent,transparent)', 'mask'],
    ['.menu-add', 'clip-path:polygon(0 0,0 0,0 0)', 'clip-path'], ['.menu-add', 'content:url(assets/x.svg)', 'content'],
    ['.menu-add', 'color:rgba(0,0,0,.02)', 'color'], ['.checkout-review .order-total', 'color:#0003', 'color'], ['.menu-add', 'color:rgb(0 0 0 / 40%)', 'color'],
    ['.menu-add', 'color:color-mix(in srgb, red 0%, transparent)', 'color'], ['.menu-add', 'color:hsla(0,0%,0%,.3)', 'color'], ['.menu-add', '-webkit-text-fill-color:#00000010', '-webkit-text-fill-color'],
  ])('strips %s { %s }', (selector, declarations, prop) => {
    for (const out of [kit(`${selector}{${declarations};border-radius:3px}`), validateAuthoredCss(`${selector}{${declarations};border-radius:3px}`, 'styles.css')]) {
      expect(find(out.css, selector, prop)).toBeUndefined();
      expect(find(out.css, selector, 'border-radius')?.value).toBe('3px');
      expect(out.repairs.join('\n')).toMatch(/protected/);
    }
  });

  it('makes a positioned overlay on a kit surface let clicks through', () => {
    for (const [css, selector] of [['.menu-item::after{content:"";position:absolute;inset:0;z-index:50}', '.menu-item::after'], ['.cart-drawer:before{content:"";position:fixed;inset:0;pointer-events:auto}', '.cart-drawer:before']]) {
      for (const out of [kit(css), validateAuthoredCss(css, 'styles.css')]) {
        expect(find(out.css, selector, 'pointer-events')?.value).toBe('none');
        expect(sheet(out.css).filter(d => d.prop === 'pointer-events')).toHaveLength(1);
        expect(out.repairs.join('\n')).toMatch(/pointer-events/);
      }
    }
  });

  it.each([
    '.menu-add{height:0}', '.menu-add{overflow:hidden;max-height:3rem}', '.menu-add{transform:translateY(-2px)}', '.menu-add{translate:0 50%}',
    '.menu-add{filter:drop-shadow(0 1px 2px #0003)}', '.menu-add{filter:brightness(1.1)}', '.menu-add{transform:rotate(90deg)}',
    '.menu-add{color:rgba(0,0,0,.8)}', '.menu-add{background:rgba(0,0,0,.1)}', '.menu-add:disabled{color:rgb(0 0 0 / 40%)}',
    '.menu-item::after{content:"";position:absolute;inset:0;pointer-events:none}', '.menu-item::after{content:"";display:block;height:2px}',
    '.menu-add{clip-path:inset(0 round 8px)}', '.menu-add{margin-left:auto;left:12px}',
  ])('keeps %s', css => {
    const out = kit(css);
    expect(sheet(out.css).length).toBe(sheet(css).length);
    expect(out.repairs).toEqual([]);
  });

  it('leaves the store\'s own overlays off kit surfaces alone', () => {
    const css = '.hero::after{content:"";position:absolute;inset:0}';
    expect(validateAuthoredCss(css, 'styles.css')).toEqual({ css, repairs: [] });
  });
});

describe('store kit CSS: resources, importance and size', () => {
  it.each([
    '.cart-drawer{background:url(https://x.test/a.png)}', '.cart-drawer{background:url(data:image/png;base64,AAAA)}',
    '.cart-drawer{background:url(//cdn.test/a.png)}', '.cart-drawer{background:url(../../secret.png)}', '.cart-drawer{background:image-set("a.png" 1x)}',
  ])('strips %s', css => {
    const out = kit(css);
    expect(find(out.css, '.cart-drawer', 'background')).toBeUndefined();
    expect(out.repairs.join('\n')).toMatch(/url|image-set/);
  });

  it('strips @import and @font-face, and points bundled assets and motifs at the project root', () => {
    const out = kit('@import url(x.css);@font-face{font-family:x;src:url(assets/x.woff2)}.cart-drawer{background:url(assets/m.svg)}.cart-added{background-image:url(\'./motifs/lamp.svg\')}');
    expect(out.css).not.toMatch(/@import|@font-face/);
    expect(find(out.css, '.cart-drawer', 'background')?.value).toBe('url("../assets/m.svg")');
    expect(find(out.css, '.cart-added', 'background-image')?.value).toBe('url("../motifs/lamp.svg")');
    expect(out.repairs.join('\n')).toMatch(/@import/);
    expect(out.repairs.join('\n')).toMatch(/@font-face/);
  });

  it('drops !important and keeps the declaration', () => {
    const out = kit('.menu-add{background:red!important}');
    expect(find(out.css, '.menu-add', 'background')).toMatchObject({ value: 'red', important: false });
    expect(out.repairs.join('\n')).toMatch(/!important/);
  });

  it('caps the rules at 12 KB, dropping from the end', () => {
    const css = Array.from({ length: 600 }, (_, i) => `.menu-item:nth-child(${i + 1}){margin-top:${i}px}`).join('\n');
    expect(Buffer.byteLength(css)).toBeGreaterThan(13 * 1024);
    const out = kit(css);
    const kept = sheet(out.css);
    expect(kept[0].selector).toBe('.menu-item:nth-child(1)');
    expect(kept.some(d => d.selector === '.menu-item:nth-child(600)')).toBe(false);
    expect(kept.map(d => `${d.selector}{${d.prop}:${d.value}}`).join('\n').length).toBeLessThanOrEqual(12 * 1024);
    expect(out.repairs.join('\n')).toMatch(/12 KB/);
  });

  it('drops CSS that cannot be parsed, and returns nothing for an empty file', () => {
    expect(kit('.menu-add{color:red')).toEqual({ css: '', repairs: [expect.stringMatching(/could not be parsed/)] });
    expect(kit('  /* nada */ ')).toEqual({ css: '', repairs: [] });
  });
});

describe('--motion-* values', () => {
  it.each([
    ['--motion-base:3000ms', '900ms'], ['--motion-slow:2s', '900ms'], ['--motion-fast:-5ms', '0ms'], ['--motion-press-scale:0', '0.85'],
    ['--motion-distance:-4px', '0px'], ['--motion-distance:200px', '40px'], ['--motion-parallax:9', '2'], ['--motion-stagger:1s', '120ms'],
  ])('clamps %s to %s in kit and authored CSS', (declaration, value) => {
    const prop = declaration.split(':')[0];
    for (const out of [kit(`:root{${declaration}}`), validateAuthoredCss(`.hero{${declaration}}`, 'styles.css')]) {
      expect(sheet(out.css).find(d => d.prop === prop)?.value).toBe(value);
      expect(out.repairs.join('\n')).toMatch(/--motion-/);
    }
  });

  it('keeps values in range untouched and drops ones it cannot read', () => {
    const inRange = ':root{--motion-base:0.3s;--motion-press-scale:.92}';
    expect(validateAuthoredCss(inRange, 'styles.css')).toEqual({ css: inRange, repairs: [] });
    const out = validateAuthoredCss(':root{--motion-fast:var(--x);--motion-ease:cubic-bezier(.2,.9,.2,1)}', 'styles.css');
    expect(sheet(out.css).map(d => d.prop)).toEqual(['--motion-ease']);
  });

  it('uses the kit runtime limits', () => {
    const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
    expect(runInNewContext(`(${commerce.match(/const MOTION_LIMITS = (\{[^}]*\});/)![1]})`)).toEqual(SOURCE_MOTION_LIMITS);
  });
});

describe('the served form', () => {
  const INPUT = [
    '.menu-add, .product-detail__buy{border-radius:3px}',
    'html[data-dna-button=pill] .product-detail__buy{letter-spacing:.1em}',
    '@media (max-width:600px){.product-detail__gallery{gap:4px}.cart-drawer{width:100vw}}',
    '@keyframes glow{from{opacity:0}to{opacity:1}}',
    '@layer anything{.cart-added{padding:9px}}',
  ].join('\n');

  it('declares the layer order, layers surface rules and scopes product-page rules outside the layer', () => {
    const out = kit(INPUT);
    expect(out.css.split('\n').find(line => line.startsWith('@layer'))).toBe(STORE_KIT_LAYER_ORDER);
    expect(find(out.css, '.menu-add', 'border-radius')?.layered).toBe(true);
    expect(find(out.css, '.cart-added', 'padding')?.layered).toBe(true);
    expect(find(out.css, '.cart-drawer', 'width')?.layered).toBe(true);
    expect(find(out.css, ':root:not(#pagosya-store-kit) .product-detail__buy', 'border-radius')?.layered).toBe(false);
    expect(find(out.css, 'html[data-dna-button=pill]:not(#pagosya-store-kit) .product-detail__buy', 'letter-spacing')?.layered).toBe(false);
    expect(find(out.css, ':root:not(#pagosya-store-kit) .product-detail__gallery', 'gap')?.layered).toBe(false);
    expect(sheet(out.css).filter(d => d.prop === 'opacity').every(d => d.layered)).toBe(true);
    expect(out.repairs.join('\n')).toMatch(/@layer anything/);
  });

  it('is idempotent: the served form normalizes to itself with nothing to repair', () => {
    const once = kit(INPUT).css;
    expect(kit(once)).toEqual({ css: once, repairs: [] });
    expect(kit(once + '\n.checkout-review{gap:2px}').css).toBe(kit(INPUT + '\n.checkout-review{gap:2px}').css);
  });

  it('matches the product hooks the kit runtime releases', () => {
    const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
    expect(commerce).toContain(`const productHook = ${SOURCE_KIT_PRODUCT_HOOK.toString()};`);
  });
});

describe('validateAuthoredCss', () => {
  it('returns the stylesheet byte for byte when nothing is wrong, whatever it targets', () => {
    const css = '/* store */\nbody .hero { margin: 0 }\n.menu-add{border-radius:50%}\n[data-pagosya-status]:empty{display:none}\n.menu-add[hidden]{display:none}\n';
    expect(validateAuthoredCss(css, 'styles.css')).toEqual({ css, repairs: [] });
  });

  it('strips only the violating declaration and names the file', () => {
    const out = validateAuthoredCss('.menu-add{display:none;color:red}', 'styles.css');
    expect(sheet(out.css).map(d => d.prop)).toEqual(['color']);
    expect(out.repairs[0]).toMatch(/^styles\.css: /);
  });

  it('reads nested rules and @scope rules against their parent selector', () => {
    const out = validateAuthoredCss('.menu-add{ &{display:none} &:disabled{opacity:.5} .x &{gap:1px} }@scope (.menu-add){ :scope{opacity:0} }.hero{ .menu-add{visibility:hidden} }', 'styles.css');
    expect(sheet(out.css).map(d => d.prop)).toEqual(['opacity', 'gap']);
    expect(out.repairs).toHaveLength(3);
  });

  it('leaves unparsable CSS to the other validators', () => {
    expect(validateAuthoredCss('.a{', 'styles.css')).toEqual({ css: '.a{', repairs: [] });
  });
});

describe('applySourceKitCss: static projects', () => {
  const LINK = '<link rel="stylesheet" href="styles/kit.css" data-pagosya-kit="store">';
  const project = () => [
    { path: 'index.html', content: '<!doctype html><html><head><link rel="stylesheet" href="commerce-pages.css"><link rel="stylesheet" href="styles.css">\n<style data-pagosya-kit="product">.x{}</style></head><body></body></html>' },
    { path: 'pages/nosotros.html', content: '<!doctype html><html><head><link rel="stylesheet" href="../styles.css"></head><body></body></html>' },
    { path: 'bare.html', content: '<!doctype html><main></main>' },
    { path: 'styles.css', content: '.menu-add{display:none;color:red}' },
    { path: 'brand.css', content: '.menu-add{display:none}' },
    { path: 'styles/kit.css', content: '.cart-drawer{background:#fff}body{margin:0}' },
  ];

  it('links the kit CSS after the store\'s stylesheet on every page and validates every stylesheet', () => {
    const { files, repairs } = applySourceKitCss(project(), { next: false });
    const file = (path: string) => files.find((f: { path: string }) => f.path === path)!.content;
    expect(file('index.html')).toContain(`<link rel="stylesheet" href="styles.css">${LINK}`);
    expect(file('pages/nosotros.html')).toContain(`<link rel="stylesheet" href="../styles.css"><link rel="stylesheet" href="../styles/kit.css" data-pagosya-kit="store">`);
    expect(file('bare.html')).toBe(`<!doctype html>${LINK}<main></main>`);
    expect(file('index.html')).toContain('<style>.x{}</style>');
    expect(file('styles.css')).toBe('.menu-add{color:red}');
    expect(file('brand.css')).toBe('.menu-add{display:none}');
    expect(file('styles/kit.css')).toBe(validateStoreKitCss('.cart-drawer{background:#fff}').css);
    expect(repairs.join('\n')).toMatch(/styles\.css: removed `display:none`/);
    expect(repairs.join('\n')).toMatch(/styles\/kit\.css: removed selector body/);
    const again = applySourceKitCss(files, { next: false });
    expect(again).toEqual({ files, repairs: [] });
  });

  it('unlinks the kit CSS when there is none, or when nothing valid is left', () => {
    const linked = applySourceKitCss(project(), { next: false }).files;
    for (const files of [linked.filter(f => f.path !== 'styles/kit.css'), linked.map(f => f.path === 'styles/kit.css' ? { ...f, content: 'body{margin:0}' } : f)]) {
      const out = applySourceKitCss(files, { next: false }).files;
      expect(out.some(f => f.path === 'styles/kit.css')).toBe(false);
      expect(out.filter(f => f.path.endsWith('.html')).map(f => f.content).join('')).not.toContain('kit.css');
    }
  });

  it('holds inline <style> elements and style attributes to the protected-element rules', () => {
    const html = [
      '<!doctype html><html><head><link rel="stylesheet" href="styles.css"><style>.menu-add{display:none}.hero{color:red}</style></head><body>',
      '<div class="hero" style="opacity:0">x</div><!-- <b class="menu-add" style="display:none"> -->',
      '<template data-pagosya-product-card><article class="menu-item"><img src="a.png" style="opacity:.5"><strong data-product-field="price" style="visibility:hidden;color:red">1</strong><button type="button" style=\'opacity:.2\'>+</button></article></template>',
      '<div data-pagosya-privacy><p style="font-size:8px">Aviso</p><br><a href="/privacidad" style="color:rgba(0,0,0,.1)">Privacidad</a></div>',
      '<script>const s = \'<b class="menu-add" style="display:none">\';</script></body></html>',
    ].join('');
    const { files, repairs } = applySourceKitCss([{ path: 'index.html', content: html }, { path: 'styles.css', content: '' }], { next: false });
    const out = files.find((f: { path: string }) => f.path === 'index.html')!.content;
    expect(out).toContain('<style>.hero{color:red}</style>');
    expect(out).toContain('<div class="hero" style="opacity:0">');
    expect(out).toContain('<!-- <b class="menu-add" style="display:none"> -->');
    expect(out).toContain('<img src="a.png" style="opacity:.5">');
    expect(out).toContain('<strong data-product-field="price" style="color:red">');
    expect(out).toContain('<button type="button">+</button>');
    expect(out).toContain('<p>Aviso</p>');
    expect(out).toContain('<a href="/privacidad">Privacidad</a>');
    expect(out).toContain(`<script>const s = '<b class="menu-add" style="display:none">';</script>`);
    expect(repairs.filter(note => note.startsWith('index.html'))).toHaveLength(5);
    expect(applySourceKitCss(files, { next: false }).repairs).toEqual([]);
    expect(applySourceKitCss([{ path: 'index.html', content: html }], { next: false, authored: false }).files[0].content).toContain('<p style="font-size:8px">');
  });

  it('leaves the store\'s other stylesheets alone when asked to (a merchant\'s own save)', () => {
    const { files } = applySourceKitCss(project(), { next: false, authored: false });
    expect(files.find((f: { path: string }) => f.path === 'styles.css')!.content).toBe('.menu-add{display:none;color:red}');
    expect(files.find((f: { path: string }) => f.path === 'styles/kit.css')!.content).toContain('@layer pagosya-store-kit');
  });
});

describe('applySourceKitCss: component projects', () => {
  it('keeps the block plain and validated in globals.css and checks the rest of the file', () => {
    const globals = 'body{margin:0}\n/* pagosya-kit:start */\n.cart-drawer{background:#fff}\n.hero{color:red}\n/* pagosya-kit:end */\n.menu-add{font-size:8px}\n';
    const { files, repairs } = applySourceKitCss([{ path: 'styles/globals.css', content: globals }, { path: 'components/home.tsx', content: 'x' }], { next: true });
    const out = files.find((f: { path: string }) => f.path === 'styles/globals.css')!.content;
    expect(out).toBe('body{margin:0}\n/* pagosya-kit:start */\n.cart-drawer{background:#fff}\n/* pagosya-kit:end */\n');
    expect(files.some(f => f.path === 'styles/kit.css')).toBe(false);
    expect(repairs.join('\n')).toMatch(/styles\/globals\.css: removed selector \.hero/);
    expect(repairs.join('\n')).toMatch(/styles\/globals\.css: removed `font-size:8px`/);
    expect(applySourceKitCss(files, { next: true })).toEqual({ files, repairs: [] });
  });

  it('holds JSX style objects to the protected-element rules, under their JSX ancestors', () => {
    const tsx = [
      'export default function Home() {',
      '  return <main><div className="hero" style={{ opacity: 0 }} />',
      '    <template data-pagosya-product-template><article className="menu-item">',
      '      <strong data-product-field="price" style={{ visibility: \'hidden\', color: \'red\' }}>1</strong>',
      '      <button type="button" data-product-add style={{ opacity: 0.2 }}>+</button>',
      '      <img src="a.png" alt="" style={{ opacity: 0.5 }} />',
      '    </article></template>',
      '    <div data-pagosya-privacy><p style={{ fontSize: 8, color: fade }}>Aviso</p></div></main>;',
      '}',
    ].join('\n');
    const { files, repairs } = applySourceKitCss([{ path: 'components/home.tsx', content: tsx }], { next: true });
    const out = files[0].content;
    expect(out).toContain('<div className="hero" style={{ opacity: 0 }} />');
    expect(out).toContain('<strong data-product-field="price" style={{ color: \'red\' }}>1</strong>');
    expect(out).toContain('<button type="button" data-product-add>+</button>');
    expect(out).toContain('<img src="a.png" alt="" style={{ opacity: 0.5 }} />');
    expect(out).toContain('<p style={{ color: fade }}>Aviso</p>');
    expect(repairs.filter(note => note.startsWith('components/home.tsx'))).toHaveLength(3);
    expect(applySourceKitCss(files, { next: true }).repairs).toEqual([]);
    expect(applySourceKitCss([{ path: 'components/home.tsx', content: tsx }], { next: true, authored: false }).files[0].content).toBe(tsx);
  });

  it('reads every block', () => {
    expect(extractKitBlock('a{}/* pagosya-kit:start */.cart-drawer{}/* pagosya-kit:end */b{}/*pagosya-kit:start*/.cart-added{}/*pagosya-kit:end*/')).toEqual({ rest: 'a{}b{}', block: '.cart-drawer{}.cart-added{}' });
    expect(extractKitBlock('a{}')).toEqual({ rest: 'a{}', block: null });
  });

  it('never swallows the rest of globals.css: a block without its end marker leaves the file untouched, with a repair note', () => {
    const globals = ':root{--brand:#123}\n/* pagosya-kit:start */\n.cart-drawer{background:#fff}\n\nbody{font-family:Inter;margin:0}\n.hero{display:grid;min-height:80vh}\n.menu-add{font-size:8px}\n';
    expect(extractKitBlock(globals)).toEqual({ rest: globals, block: null });
    const { files, repairs } = applySourceKitCss([{ path: 'styles/globals.css', content: globals }], { next: true });
    expect(files[0].content).toBe(globals);
    expect(repairs.join('\n')).toMatch(/styles\/globals\.css: .*pagosya-kit:end/);
  });
});
