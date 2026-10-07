import { validateOrderEmailHtml } from './source-email-html';

const wrap = (inner: string) =>
  `<!doctype html><html><body><table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table><p data-order-total></p>${inner}</body></html>`;

describe('order email validator', () => {
  it('strips a script and reports it, without throwing', () => {
    const { html, repairs, usable } = validateOrderEmailHtml(wrap('<script>alert(1)</script>'));
    expect(html).not.toContain('<script');
    expect(repairs.join(' ')).toContain('script');
    expect(usable).toBe(true);
  });

  it.each(['iframe', 'form', 'input', 'object', 'embed'])('drops a %s element', tag => {
    expect(validateOrderEmailHtml(wrap(`<${tag}></${tag}>`)).html).not.toContain(`<${tag}`);
  });

  it('drops event handlers and javascript: urls', () => {
    const { html } = validateOrderEmailHtml(wrap('<a href="javascript:alert(1)" onclick="x()">hola</a>'));
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
  });

  it('strips flex, grid and position declarations but keeps colour', () => {
    const { html } = validateOrderEmailHtml(wrap('<div style="display:flex;position:fixed;color:#111;background:#fff">x</div>'));
    expect(html).not.toContain('display:flex');
    expect(html).not.toContain('position:fixed');
    expect(html).toContain('color');
  });

  it('drops external stylesheets', () => {
    expect(validateOrderEmailHtml(wrap('<link rel="stylesheet" href="https://cdn.example/x.css">')).html).not.toContain('stylesheet');
  });

  it('inlines a style block onto the element', () => {
    const { html } = validateOrderEmailHtml(
      `<!doctype html><html><head><style>.t{color:#b3261e}</style></head><body><table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table><p data-order-total></p><p class="t">x</p></body></html>`,
    );
    expect(html).toMatch(/style="[^"]*color/);
  });

  it('rejects a literal amount inside the order summary but keeps one in the footer', () => {
    const inside = `<!doctype html><html><body><table data-order-items><tr data-order-item><td data-order-item-name></td></tr></table><p data-order-total>Bs 120</p></body></html>`;
    expect(validateOrderEmailHtml(inside).repairs.join(' ')).toContain('amount');

    const footer = wrap('<p>Envíos gratis desde Bs 300</p>');
    const { html, repairs } = validateOrderEmailHtml(footer);
    expect(html).toContain('Envíos gratis desde Bs 300');
    expect(repairs.join(' ')).not.toContain('amount');
  });

  it('marks a template missing a required slot as unusable', () => {
    expect(validateOrderEmailHtml('<!doctype html><html><body><p>hola</p></body></html>').usable).toBe(false);
  });

  it('gives an element that sets a colour an explicit background too', () => {
    const { html, repairs } = validateOrderEmailHtml(wrap('<p style="color:#111">x</p>'));
    expect(html).toMatch(/style="[^"]*background/);
    expect(repairs.join(' ')).toContain('background');
  });

  it('leaves an element that already pairs them alone', () => {
    expect(validateOrderEmailHtml(wrap('<p style="color:#111;background:#fff">x</p>')).repairs.join(' ')).not.toContain('background');
  });

  it('clamps an oversized document', () => {
    const { html, repairs } = validateOrderEmailHtml(wrap(`<p>${'x'.repeat(200 * 1024)}</p>`));
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThanOrEqual(80 * 1024);
    expect(repairs.join(' ')).toContain('clamped');
  });
});
