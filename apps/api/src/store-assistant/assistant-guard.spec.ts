import { allowedFrom, checkReply } from './assistant-guard';

describe('number guard', () => {
  const evidence = allowedFrom([
    JSON.stringify([{ nombre: 'Chompa', precio: 'Bs 250,00', precio_antes: 'Bs 300,00', descuento: '15%', descripcion: 'Alpaca 100% natural' }]),
    'Envío La Paz: Bs 15,00, gratis desde Bs 400,00',
  ]);

  it('allows amounts and percentages that came from tool results', () => {
    expect(checkReply('La chompa cuesta Bs 250 (antes Bs. 300,00), con 15% de descuento. Es 100% alpaca. El envío es 15 Bs.', evidence)).toEqual({ ok: true });
  });

  it('rejects an invented price', () => {
    expect(checkReply('Te la dejo en Bs 200.', evidence)).toEqual({ ok: false, offending: ['Bs 200'] });
  });

  it('rejects an invented percentage', () => {
    expect(checkReply('Para ti, 50% de descuento.', evidence)).toEqual({ ok: false, offending: ['50%'] });
  });

  it('rejects a price from a product that was not looked up this turn', () => {
    expect(checkReply('El gorro cuesta Bs 80,00.', evidence)).toEqual({ ok: false, offending: ['Bs 80'] });
  });

  it('rejects an invented second price in a range', () => {
    expect(checkReply('Entre Bs 250 y 999', evidence)).toEqual({ ok: false, offending: ['Bs 999'] });
  });

  it('ignores quantities, dates and phone numbers', () => {
    expect(checkReply('Quedan 3, llega el 12 de noviembre, llama al 70012345.', evidence)).toEqual({ ok: true });
  });
});
