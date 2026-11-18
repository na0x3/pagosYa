import { cleanStepHtml } from './popup-html';

const offer = '<section class="o"><button data-close aria-label="Cerrar">×</button><h2>10% para ti</h2><img src="/v1/uploads/abc.webp" alt=""><button data-next>Quiero</button></section>';

describe('popup step html', () => {
  it('keeps a good step', () => {
    expect(cleanStepHtml(offer, 'offer')).toEqual({ html: expect.stringContaining('data-next') });
  });
  it('removes scripts, handlers, outside images and links, and keeps only custom properties in style', () => {
    const out = cleanStepHtml(offer.replace('<h2>', '<script>alert(1)</script><a href="https://x.y">x</a><h2 onclick="x()" style="--tilt:3deg;color:red">').replace('/v1/uploads/abc.webp', 'https://evil/x.png'), 'offer') as { html: string };
    expect(out.html).not.toMatch(/script|onclick|https?:|<a |color:red|evil/);
    expect(out.html).toContain('--tilt:3deg');
  });
  it('names the missing hook per kind', () => {
    expect(cleanStepHtml('<div><h2>Hola</h2></div>', 'offer')).toEqual({ problem: expect.stringMatching(/data-close/) });
    expect(cleanStepHtml('<div><button data-close></button><div data-tile><span data-slot="name"></span></div></div>', 'pick')).toEqual({ problem: expect.stringMatching(/data-slot="photo"/) });
    expect(cleanStepHtml('<div><button data-close></button><input data-field="email"></div>', 'capture')).toEqual({ problem: expect.stringMatching(/data-submit/) });
  });
  it('allows only text, email and tel inputs', () => {
    const out = cleanStepHtml('<div><button data-close></button><input type="file" data-field="whatsapp"><input type="tel" data-field="whatsapp"><button data-submit>Ok</button></div>', 'capture') as { html: string };
    expect(out.html).not.toContain('type="file"');
    expect(out.html).toContain('type="tel"');
  });
  it('refuses oversized markup', () => {
    expect(cleanStepHtml(`<div>${'x'.repeat(13_000)}</div>`, 'offer')).toEqual({ problem: expect.stringMatching(/grande/) });
  });
  // Final review (I7): the reveal needs a way on to the product, or the shopper never lands with the code.
  it('asks the reveal step for data-next', () => {
    expect(cleanStepHtml('<div><button data-close>×</button><strong data-slot="code"></strong></div>', 'reveal')).toEqual({ problem: expect.stringMatching(/data-next/) });
  });
  it('keeps SVG gradients that point inside the drawing, never outside', () => {
    const html = '<div><button data-close>×</button><svg viewBox="0 0 10 10"><defs><linearGradient id="g1"><stop offset="0" stop-color="#f00"></stop></linearGradient></defs><rect width="10" height="10" fill="url(#g1)"></rect><circle r="2" fill="url(https://x.test/a)"></circle></svg><button data-next>Ok</button></div>';
    const out = cleanStepHtml(html, 'offer') as { html: string };
    expect(out.html).toContain('fill="url(#g1)"');
    expect(out.html).toContain('stop-color="#f00"');
    expect(out.html).not.toContain('x.test');
  });
  it('cleans a launcher tab without step hooks', () => {
    expect(cleanStepHtml('<span class="tab">¿15% para ti?</span>', 'launcher')).toEqual({ html: '<span class="tab">¿15% para ti?</span>' });
    expect(cleanStepHtml('<span>x</span><input data-field>', 'launcher')).toEqual({ problem: expect.stringMatching(/pestaña/) });
  });
});
