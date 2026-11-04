import { bolivianos, readShippingAsk } from './source-shipping-ask';
import { plainReply } from './source-plain-reply';

describe('shipping ask', () => {
  it('reads free shipping from an amount', () => {
    expect(readShippingAsk('Envío gratis desde Bs 300')).toEqual({ freeAbove: 30000, rest: '' });
    expect(readShippingAsk('quiero envíos gratis a partir de 250 bs')).toMatchObject({ freeAbove: 25000 });
    expect(readShippingAsk('envio gratis por compras mayores a 1.500')).toMatchObject({ freeAbove: 150000 });
    expect(readShippingAsk('delivery gratis en compras de más de 200 bolivianos')).toMatchObject({ freeAbove: 20000 });
  });

  it('reads the fee, alone or with the free amount', () => {
    expect(readShippingAsk('el envío cuesta Bs 15')).toEqual({ fee: 1500, rest: '' });
    expect(readShippingAsk('cobra el delivery a 12,50')).toMatchObject({ fee: 1250 });
    expect(readShippingAsk('envío a Bs 12 y gratis desde 300')).toMatchObject({ fee: 1200, freeAbove: 30000 });
  });

  it('keeps the rest of the message for the usual edit', () => {
    const ask = readShippingAsk('Cambia el titular a «Proteína buena» y envío gratis desde Bs 300');
    expect(ask).toMatchObject({ freeAbove: 30000, rest: 'Cambia el titular a «Proteína buena»' });
    expect(readShippingAsk('envío gratis desde 300 y el titular «Fuerza y sabor, todos los días»')).toMatchObject({ freeAbove: 30000, rest: 'el titular «Fuerza y sabor, todos los días»' });
  });

  it('knows free always from free without an amount', () => {
    expect(readShippingAsk('envío gratis en todos los pedidos')).toMatchObject({ freeAlways: true });
    expect(readShippingAsk('pon envío gratis')).toMatchObject({ unclearFree: true });
  });

  it('leaves questions, page words and other messages alone', () => {
    expect(readShippingAsk('¿Cuánto cuesta el envío?')).toBeNull();
    expect(readShippingAsk('agrega una franja que diga envío gratis desde Bs 300')).toBeNull();
    expect(readShippingAsk('cambia el color a verde')).toBeNull();
    expect(readShippingAsk('hacemos envíos a todo el país')).toBeNull();
  });

  it('writes amounts in bolivianos', () => {
    expect(bolivianos(30000)).toBe('Bs 300');
    expect(bolivianos(1250)).toBe('Bs 12,50');
  });
});

describe('plain reply', () => {
  it('drops markdown and keeps the words', () => {
    expect(plainReply('Tienes **9 productos**; el más caro es *Equip Prime* (Bs 320).')).toBe('Tienes 9 productos; el más caro es Equip Prime (Bs 320).');
    expect(plainReply('## Resumen\n- uno\n* dos')).toBe('Resumen\n• uno\n• dos');
    expect(plainReply('2 * 3 = 6')).toBe('2 * 3 = 6');
  });
});
