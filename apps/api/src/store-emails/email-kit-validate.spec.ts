// apps/api/src/store-emails/email-kit-validate.spec.ts
import { validateEmailKit, validateEmailCopy } from './email-kit-validate';

const layout = `<!doctype html><html><body style="background:#fafafa;color:#111"><table><tr><td data-store-name></td></tr>
  <tr><td data-email-content></td></tr></table></body></html>`;
const blocks = `<table data-block="heading"><tr><td><h1 data-block-title></h1><p data-block-text></p></td></tr></table>
  <table data-block="items"><tr data-item><td><img data-item-image><span data-item-name></span><span data-item-amount></span></td></tr>
    <tr><td data-items-total></td></tr></table>
  <table data-block="button"><tr><td><a data-block-link><span data-block-label></span></a></td></tr></table>
  <table data-block="note"><tr><td data-block-text></td></tr></table>`;

describe('validateEmailKit', () => {
  it('accepts a kit with one content slot and the required blocks', () => {
    const { kit, usable } = validateEmailKit({ layout, blocks, copy: {} });
    expect(usable).toBe(true);
    expect(kit.layout).toContain('data-email-content');
    expect(Object.keys(kit.blocks).sort()).toEqual(['button', 'heading', 'items', 'note']);
  });

  it('rejects a layout with no content slot, or two', () => {
    expect(validateEmailKit({ layout: '<html><body><p>x</p></body></html>', blocks, copy: {} }).kit.layout).toBeNull();
    const two = layout.replace('<tr><td data-email-content></td></tr>', '<tr><td data-email-content></td></tr><tr><td data-email-content></td></tr>');
    const result = validateEmailKit({ layout: two, blocks, copy: {} });
    expect(result.kit.layout).toBeNull();
    expect(result.usable).toBe(false);
    expect(result.repairs.join(' ')).toContain('data-email-content');
  });

  it('drops an items block without exactly one data-item row, and keeps the others', () => {
    const result = validateEmailKit({ layout, blocks: blocks.replace('<tr data-item>', '<tr>'), copy: {} });
    expect(result.kit.blocks.items).toBeUndefined();
    expect(result.kit.blocks.heading).toBeDefined();
    expect(result.usable).toBe(false);
  });

  it('keeps only the first sample of a block type and ignores unknown types', () => {
    const doubled = blocks + '<table data-block="heading"><tr><td>second</td></tr></table><table data-block="banner"></table>';
    const result = validateEmailKit({ layout, blocks: doubled, copy: {} });
    expect(result.kit.blocks.heading).not.toContain('second');
    expect(result.repairs.join(' ')).toMatch(/heading appears twice/);
    expect(result.repairs.join(' ')).toMatch(/banner/);
  });

  it('strips scripts, layout CSS and literal amounts, as the receipt validator does', () => {
    const dirty = blocks.replace('<td data-items-total></td>', '<td data-items-total>Bs 150,00</td>') + '<script>alert(1)</script>';
    const result = validateEmailKit({ layout: layout.replace('<td data-email-content>', '<td data-email-content style="display:flex">'), blocks: dirty, copy: {} });
    expect(result.kit.blocks.items).not.toContain('150');
    expect(JSON.stringify(result.kit)).not.toContain('<script');
    expect(result.kit.layout).not.toContain('display:flex');
  });

  it('reads copy given as a JSON string, and survives broken JSON', () => {
    expect(validateEmailKit({ layout, blocks, copy: '{"order_confirmation":{"headline":"Gracias"}}' }).kit.copy).toEqual({ order_confirmation: { headline: 'Gracias' } });
    expect(validateEmailKit({ layout, blocks, copy: '{oops' }).kit.copy).toEqual({});
  });
});

describe('validateEmailCopy', () => {
  it('keeps clean wording per type and field', () => {
    const { copy, repairs } = validateEmailCopy({ order_confirmation: { headline: '¡Gracias, {cliente}!', intro: 'Ya estamos preparando tu pedido.' } });
    expect(copy.order_confirmation).toEqual({ headline: '¡Gracias, {cliente}!', intro: 'Ya estamos preparando tu pedido.' });
    expect(repairs).toEqual([]);
  });

  it('removes amounts, dates and order numbers the AI typed', () => {
    const { copy, repairs } = validateEmailCopy({ order_confirmation: { intro: 'Tu pedido pi_ABC123 de Bs 150,00 llega el 12/10.' } });
    expect(copy.order_confirmation!.intro).not.toMatch(/pi_ABC123|150|12\/10/);
    expect(repairs.length).toBeGreaterThan(0);
  });

  it('drops a line that implies automatic charging', () => {
    expect(validateEmailCopy({ order_confirmation: { signoff: 'Te cobraremos automáticamente cada mes.' } }).copy.order_confirmation?.signoff).toBeUndefined();
  });

  it('caps length, removes unknown placeholders, ignores unknown types, fields and non-strings', () => {
    const { copy } = validateEmailCopy({
      order_confirmation: { cta: 'x'.repeat(50), headline: 'Hola {nombre} de {tienda}', intro: 42 },
      welcome_v9: { headline: 'nope' },
    });
    expect(copy.order_confirmation!.cta).toHaveLength(30);
    expect(copy.order_confirmation!.headline).toBe('Hola de {tienda}');
    expect(copy.order_confirmation!.intro).toBeUndefined();
    expect(Object.keys(copy)).toEqual(['order_confirmation']);
  });

  it('treats a non-object as empty wording', () => {
    expect(validateEmailCopy('not json').copy).toEqual({});
    expect(validateEmailCopy(null).copy).toEqual({});
  });
});
