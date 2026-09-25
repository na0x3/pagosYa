import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import postcss from 'postcss';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_KIT_PRODUCT_HOOK, SOURCE_MOTION_LIMITS, STORE_KIT_LAYER_ORDER, validateAuthoredCss, validateStoreKitCss } from './source-kit-css';

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
    '.menu-item :not(.menu-add){opacity:.5}', '.menu-add{opacity:1}', '.checkout-button{font-size:max(12px,1vw)}',
  ])('keeps %s', css => {
    const out = kit(css);
    expect(sheet(out.css).length).toBe(sheet(css).length);
    expect(out.repairs).toEqual([]);
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

  it('leaves unparsable CSS to the other validators', () => {
    expect(validateAuthoredCss('.a{', 'styles.css')).toEqual({ css: '.a{', repairs: [] });
  });
});
