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
});
