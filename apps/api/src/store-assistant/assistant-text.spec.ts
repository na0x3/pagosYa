import { foldText, laPazMonthStart, maskContact, normaliseQuestion, parseMoney, readReplyNumbers, stripContact } from './assistant-text';

describe('assistant text helpers', () => {
  it('folds accents and case', () => {
    expect(foldText('  Envío  a POTOSÍ ')).toBe('envio a potosi');
    expect(foldText('Niño')).toBe('nino');
  });

  it('reads Bolivian money formats as cents', () => {
    expect(parseMoney('125')).toBe(12500);
    expect(parseMoney('125,00')).toBe(12500);
    expect(parseMoney('1.250,50')).toBe(125050);
    expect(parseMoney('1,250.50')).toBe(125050);
    expect(parseMoney('1.250')).toBe(125000);
    expect(parseMoney('12,5')).toBe(1250);
    expect(parseMoney('abc')).toBeNull();
  });

  it('finds amounts with the currency before or after, and percentages', () => {
    expect(readReplyNumbers('Cuesta Bs 125,00 y la otra Bs. 1.250,50; envío 15 Bs.')).toEqual({ amounts: [12500, 125050, 1500], percents: [] });
    expect(readReplyNumbers('Bs125 o $us 20 o 30 bolivianos').amounts.sort((a, b) => a - b)).toEqual([2000, 3000, 12500]);
    expect(readReplyNumbers('Tiene 15% de descuento y es 100 por ciento algodón').percents).toEqual([15, 100]);
  });

  it('reads every amount in a range or list after one currency marker', () => {
    expect(readReplyNumbers('entre Bs 200 y 300').amounts).toEqual([20000, 30000]);
    expect(readReplyNumbers('desde Bs 100 hasta 500').amounts).toEqual([10000, 50000]);
    expect(readReplyNumbers('Bs 200 - 300').amounts).toEqual([20000, 30000]);
    expect(readReplyNumbers('Bs 100 o 150').amounts).toEqual([10000, 15000]);
    expect(readReplyNumbers('Bs 100/150').amounts).toEqual([10000, 15000]);
    expect(readReplyNumbers('Bs 100 a 150').amounts).toEqual([10000, 15000]);
  });

  it('reads space-grouped thousands as one amount', () => {
    expect(readReplyNumbers('Cuesta Bs 1 250,50').amounts).toEqual([125050]);
  });

  it('does not read quantities, times or phone numbers as money', () => {
    expect(readReplyNumbers('Quedan 3 unidades, abrimos a las 9:30, llama al 70012345')).toEqual({ amounts: [], percents: [] });
  });

  it('strips and masks contact details', () => {
    expect(stripContact('soy ana@mail.com y mi cel 70012345')).toBe('soy [contacto] y mi cel [contacto]');
    expect(maskContact('soy ana@mail.com, cel +591 700 12 345')).toBe('soy a***@mail.com, cel •••45');
    expect(normaliseQuestion('¿Abren el DOMINGO? escríbanme a ana@mail.com')).toBe('abren el domingo escribanme a [contacto]');
  });

  it('starts a month at midnight in La Paz', () => {
    expect(laPazMonthStart(new Date('2026-11-01T02:00:00Z')).toISOString()).toBe('2026-10-01T04:00:00.000Z');
    expect(laPazMonthStart(new Date('2026-11-01T05:00:00Z')).toISOString()).toBe('2026-11-01T04:00:00.000Z');
  });
});
