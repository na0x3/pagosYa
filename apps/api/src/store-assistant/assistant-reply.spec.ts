import { assembleReply, SAFE_REPLY_NO_CARDS, SAFE_REPLY_WITH_CARDS } from './assistant-reply';

const card = (id: string, name: string) => ({ id, name, price: 'Bs 255,00', originalPrice: null, inStock: true, image: null, addKey: id });
const box = (patch: Record<string, any> = {}) => ({ evidence: ['[{"precio":"Bs 255,00"}]'], cards: new Map([['p1', card('p1', 'Chompa')], ['p2', card('p2', 'Polera')]]), searched: ['p1', 'p2'], addBlocks: [], handoff: null, ...patch }) as any;

describe('reply assembly', () => {
  it('shows cards for the products the reply names', () => {
    const { reply, guarded } = assembleReply({ text: 'La Chompa cuesta Bs 255,00.', box: box(), evidence: [], contactPhone: null });
    expect(guarded).toBe(false);
    expect(reply.blocks).toEqual([{ type: 'products', items: [card('p1', 'Chompa')] }]);
  });

  it('falls back to the top search results when the reply names none', () => {
    const { reply } = assembleReply({ text: 'Mira estas opciones.', box: box(), evidence: [], contactPhone: null });
    expect(reply.blocks[0]).toEqual({ type: 'products', items: [card('p1', 'Chompa'), card('p2', 'Polera')] });
  });

  it('replaces a reply with an invented price and keeps the real cards', () => {
    const { reply, guarded, offending } = assembleReply({ text: 'Te la dejo en Bs 200.', box: box(), evidence: [], contactPhone: null });
    expect(guarded).toBe(true);
    expect(offending).toEqual(['Bs 200']);
    expect(reply.text).toBe(SAFE_REPLY_WITH_CARDS);
    expect(reply.blocks[0].type).toBe('products');
  });

  it('with nothing to show, the safe reply hands off', () => {
    const { reply } = assembleReply({ text: '50% para ti', box: box({ cards: new Map(), searched: [] }), evidence: [], contactPhone: '+591 7000-0000' });
    expect(reply.text).toBe(SAFE_REPLY_NO_CARDS);
    expect(reply.blocks).toEqual([{ type: 'handoff', whatsappUrl: 'https://wa.me/59170000000?text=' + encodeURIComponent('Hola, vengo del chat de la tienda.'), summary: '' }]);
  });

  it('a handoff carries the summary in the WhatsApp text, or no URL when there is no number', () => {
    const handoff = { reason: 'no_se', question: '¿NIT?', summary: 'Pregunta por factura.' };
    expect(assembleReply({ text: 'Te paso con la tienda.', box: box({ handoff, searched: [] }), evidence: [], contactPhone: '70000000' }).reply.blocks).toContainEqual({ type: 'handoff', whatsappUrl: 'https://wa.me/70000000?text=' + encodeURIComponent('Hola, vengo del chat de la tienda. Pregunta por factura.'), summary: 'Pregunta por factura.' });
    expect(assembleReply({ text: 'Te paso con la tienda.', box: box({ handoff, searched: [] }), evidence: [], contactPhone: null }).reply.blocks).toContainEqual({ type: 'handoff', whatsappUrl: null, summary: 'Pregunta por factura.' });
  });

  it('does not accept an amount only the buyer wrote (the buyer message is never evidence)', () => {
    const { guarded, offending } = assembleReply({ text: 'Con tus Bs 100 alcanza.', box: box(), evidence: [], contactPhone: null });
    expect(guarded).toBe(true);
    expect(offending).toEqual(['Bs 100']);
  });

  it('matches product names on whole words only', () => {
    const tea = box({ cards: new Map([['t1', card('t1', 'Té')]]), searched: [] });
    expect(assembleReply({ text: 'También tenemos café.', box: tea, evidence: [], contactPhone: null }).reply.blocks).toEqual([]);
    expect(assembleReply({ text: 'El Té verde está bien', box: tea, evidence: [], contactPhone: null }).reply.blocks).toEqual([{ type: 'products', items: [card('t1', 'Té')] }]);
  });

  it('never matches a card with an empty name', () => {
    const blank = box({ cards: new Map([['e1', card('e1', '  ')]]), searched: [] });
    expect(assembleReply({ text: 'Mira estas opciones.', box: blank, evidence: [], contactPhone: null }).reply.blocks).toEqual([]);
  });

  it('shows one add button per addKey', () => {
    const add = { type: 'add_to_cart', productId: 'p1', addKey: 'p1', label: 'Chompa', price: 'Bs 255,00' };
    const { reply } = assembleReply({ text: 'La Chompa cuesta Bs 255,00.', box: box({ addBlocks: [add, { ...add }] }), evidence: [], contactPhone: null });
    expect(reply.blocks.filter((b) => b.type === 'add_to_cart')).toEqual([add]);
  });

  it('a guarded reply never carries the model-written handoff summary into the handoff', () => {
    const handoff = { reason: 'no_se', question: '¿NIT?', summary: 'Te lo dejo en Bs 10' };
    const { reply, guarded } = assembleReply({ text: 'Te la dejo en Bs 200.', box: box({ handoff }), evidence: [], contactPhone: '70000000' });
    expect(guarded).toBe(true);
    expect(reply.blocks).toContainEqual({ type: 'handoff', whatsappUrl: 'https://wa.me/70000000?text=' + encodeURIComponent('Hola, vengo del chat de la tienda.'), summary: '' });
  });
});
