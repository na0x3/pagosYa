import { scopePopupCss } from './popup-css';

describe('popup css', () => {
  it('scopes every selector and renames keyframes', () => {
    const out = scopePopupCss('.card{color:#111}h2,p{margin:0}@keyframes pop{from{opacity:0}to{opacity:1}}.card{animation:pop .4s}', 'd123456789') as { css: string };
    expect(out.css).toContain('[data-pya-popup="d123456789"] .card');
    expect(out.css).toContain('[data-pya-popup="d123456789"] h2,[data-pya-popup="d123456789"] p');
    expect(out.css).toContain('@keyframes pp-d1234567-pop');
    expect(out.css).toMatch(/animation:\s*pp-d1234567-pop/);
  });
  it('drops imports, outside urls and fixed positioning, never hides the close or the fields', () => {
    const out = scopePopupCss('@import url(x.css);.bg{background:url(https://e/x.png)}.bar{position:fixed}[data-close]{display:none;color:red}input{opacity:0}', 'd1') as { css: string; dropped: string[] };
    expect(out.css).not.toMatch(/@import|https|position:\s*fixed|display:\s*none|opacity:\s*0/);
    expect(out.css).toContain('color:red');
    expect(out.dropped.length).toBeGreaterThanOrEqual(4);
  });
  it('maps :root and body to the popup root and refuses oversized sheets', () => {
    expect((scopePopupCss(':root{--a:1}body{--b:2}', 'd1') as { css: string }).css).toMatch(/^\[data-pya-popup="d1"\]\{--a:1\}/);
    expect(scopePopupCss(`.a{color:red}`.repeat(3000), 'd1')).toEqual({ problem: expect.stringMatching(/24/) });
  });
  // Final review minors (owner 2026-11-18 «fix the small things»).
  it('drops escaped url() and outside image-set addresses', () => {
    const out = scopePopupCss('.a{background:\\75 rl(https://x.test/a.png);color:red}.b{background-image:image-set("https://x.test/a.jpg" 1x)}.c{background:image-set("/v1/uploads/a.jpg" 1x)}', 'cdesign000000000000000001') as any;
    expect(out.css).not.toMatch(/x\.test/);
    expect(out.css).toContain('.a{color:red}');
    expect(out.css).toContain('/v1/uploads/a.jpg');
  });
  it('scopes nested rules once', () => {
    const out = scopePopupCss('.a{color:red; .b{color:blue}}', 'cdesign000000000000000001') as any;
    expect(out.css.match(/data-pya-popup/g)).toHaveLength(1);
  });
});

import { unscopePopupCss } from './popup-css';
describe('a stored sheet given back as the family look (final review I6)', () => {
  it('drops the welcome scope and keyframe prefix, so the new popup scopes it as its own', () => {
    const original = ':root{--ink:#111}.card{color:var(--ink);animation:pop .3s}@keyframes pop{from{opacity:0}to{opacity:1}}';
    const welcome = scopePopupCss(original, 'cwelcome0000000000000001') as { css: string };
    const back = unscopePopupCss(welcome.css, 'cwelcome0000000000000001');
    expect(back).not.toContain('cwelcome');
    const rescue = scopePopupCss(back, 'crescue00000000000000001') as { css: string };
    expect(rescue.css).toBe((scopePopupCss(original, 'crescue00000000000000001') as { css: string }).css);
  });
});
