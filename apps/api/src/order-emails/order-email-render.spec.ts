import { renderOrderEmail, type OrderEmailData } from './order-email-render';

const template = `<!doctype html><html><body>
<p data-order-greeting></p><p data-order-id></p>
<table data-order-items><tr data-order-item><td data-order-item-name></td><td data-order-item-variant></td><td data-order-item-extras></td><td data-order-item-quantity></td><td data-order-item-amount></td></tr></table>
<p data-order-total></p><p data-order-original-total></p>
<a data-order-tracking>Seguir</a><p data-order-subscription></p>
<img data-store-logo><span data-store-name></span>
</body></html>`;

const base: OrderEmailData = {
  storeName: 'Mantecate', logoUrl: null, customerName: 'Ana', orderId: 'pi_SYNTH001',
  items: [{ name: 'Café', variantName: null, extras: null, quantity: 2, amount: 'Bs 150,00' }],
  total: 'Bs 150,00', originalTotal: null, trackingUrl: null, subscription: null, appointment: null,
};

describe('order email renderer', () => {
  it('fills the slots it has values for', () => {
    const { html } = renderOrderEmail(template, base);
    expect(html).toContain('Ana');
    expect(html).toContain('pi_SYNTH001');
    expect(html).toContain('Bs 150,00');
  });

  it('removes a slot it has no value for, label and all', () => {
    const { html } = renderOrderEmail(template, base);
    expect(html).not.toContain('data-order-original-total');
    expect(html).not.toContain('Seguir');
  });

  it('escapes markup in a product or customer name instead of emitting it', () => {
    const { html } = renderOrderEmail(template, {
      ...base, customerName: 'Tom & Jerry',
      items: [{ name: 'Café <b>Premium</b><script>alert(1)</script>', variantName: null, extras: null, quantity: 1, amount: 'Bs 10,00' }],
    });
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<b>Premium</b>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('Tom &amp; Jerry');
  });

  it('clones the marked row once per cart line and drops the template row', () => {
    const { html } = renderOrderEmail(template, {
      ...base,
      items: [
        { name: 'Café', variantName: '250 g', extras: null, quantity: 1, amount: 'Bs 75,00' },
        { name: 'Taza', variantName: null, extras: 'grabado', quantity: 2, amount: 'Bs 75,00' },
      ],
    });
    expect(html.match(/Café/g)).toHaveLength(1);
    expect(html).toContain('Taza');
    expect(html).toContain('250 g');
    expect(html).toContain('grabado');
    expect(html).not.toContain('data-order-item=');
  });

  it('does not throw on a malformed cart and reports what it dropped', () => {
    const bad = { ...base, items: [{ name: '', variantName: null, extras: null, quantity: 0, amount: '' }] } as OrderEmailData;
    const { html, repairs } = renderOrderEmail(template, bad);
    expect(typeof html).toBe('string');
    expect(repairs.join(' ')).toContain('line');
  });

  it('does not throw when items is not a list at all', () => {
    const { repairs } = renderOrderEmail(template, { ...base, items: 'nope' as unknown as OrderEmailData['items'] });
    expect(repairs.join(' ')).toContain('not a list');
  });

  it('reports a template whose item row is missing, and uses the first when there are two', () => {
    const noRow = template.replace(' data-order-item>', '>');
    expect(renderOrderEmail(noRow, base).repairs.join(' ')).toContain('data-order-item');
    const twoRows = template.replace('</table>', '<tr data-order-item><td data-order-item-name></td></tr></table>');
    expect(renderOrderEmail(twoRows, base).repairs.join(' ')).toContain('more than one');
  });

  it('clamps a render that many cart lines pushed past the budget', () => {
    const many = Array.from({ length: 4000 }, (_, i) => ({ name: `Producto ${i} ${'x'.repeat(40)}`, variantName: null, extras: null, quantity: 1, amount: 'Bs 1,00' }));
    const { html, repairs } = renderOrderEmail(template, { ...base, items: many });
    expect(Buffer.byteLength(html, 'utf8')).toBeLessThanOrEqual(90 * 1024);
    expect(repairs.join(' ')).toContain('clamped');
  });
});
