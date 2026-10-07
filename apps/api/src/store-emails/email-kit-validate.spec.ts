import { validateEmailKit, validateEmailCopy } from './email-kit-validate';

const layout = `<!doctype html><html><body style="background:#fafafa;color:#111"><table><tr><td data-store-name></td></tr>
  <tr><td data-email-content></td></tr></table></body></html>`;
const blocks = `<table data-block="heading"><tr><td><h1 data-block-title></h1><p data-block-text></p></td></tr></table>
  <table data-block="items"><tr data-item><td><img data-item-image><span data-item-name></span><span data-item-quantity></span><span data-item-amount></span></td></tr>
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

  it('refuses blocks that lack their fact slots, so AI-written text never stands in for the order', () => {
    const noSlots = `<table data-block="heading"><tr><td>Gracias Maria</td></tr></table>
      <table data-block="items"><tr data-item><td>Camisa Oxford azul x2</td></tr><tr><td>Total pagado</td></tr></table>
      <table data-block="button"><tr><td><a>Ver pedido</a></td></tr></table>
      <table data-block="note"><tr><td>Te esperamos pronto</td></tr></table>`;
    const result = validateEmailKit({ layout, blocks: noSlots, copy: {} });
    expect(result.usable).toBe(false);
    expect(result.kit.blocks).toEqual({});
    expect(result.repairs.join(' ')).toMatch(/items: missing data-item-name/);
    expect(result.repairs.join(' ')).toMatch(/button: missing data-block-link/);
  });

  it('blanks any text inside an item row that sits outside a slot', () => {
    const loose = blocks.replace('<span data-item-name></span>', '<span data-item-name></span> Camisa Oxford x2 <span data-item-quantity></span>');
    const result = validateEmailKit({ layout, blocks: loose, copy: {} });
    expect(result.kit.blocks.items).toBeDefined();
    expect(result.kit.blocks.items).not.toContain('Camisa');
    expect(result.repairs.join(' ')).toMatch(/text outside a slot/);
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

  it('drops a line that states an amount, a date or an order number, so the platform wording is used instead', () => {
    for (const intro of [
      'Tu pedido pi_ABC123 de Bs 150,00 llega el 12/10.',
      'Tu pedido de 150 Bs llega el 12 de octubre.',
      'Pedido #123 por Bs. 1.500,50',
      'Pagaste 200 bolivianos.',
    ]) {
      const { copy, repairs } = validateEmailCopy({ order_confirmation: { intro } });
      expect(copy.order_confirmation?.intro).toBeUndefined();
      expect(repairs.join(' ')).toMatch(/removed; the platform fills facts/);
    }
  });

  it('keeps ordinary numbers that are not facts', () => {
    expect(validateEmailCopy({ order_confirmation: { intro: 'Respondemos en 24 horas y damos 2 años de garantía.' } }).copy.order_confirmation?.intro)
      .toBe('Respondemos en 24 horas y damos 2 años de garantía.');
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
