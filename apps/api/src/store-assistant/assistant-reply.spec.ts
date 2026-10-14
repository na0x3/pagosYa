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

  it('allows an amount the buyer wrote', () => {
    expect(assembleReply({ text: 'Con tus Bs 100 alcanza.', box: box(), evidence: ['tengo Bs 100'], contactPhone: null }).guarded).toBe(false);
  });
});
