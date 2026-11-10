import { AB_END, AB_REQUEST, AB_STATUS, abKind, endLine, popupWordsFor, progressLine, readPopupVariant, signupEvidence, staleTest, type AbNumbers } from './source-ab';

const DAY = 86400000;

describe('YAPI A/B tests: the words (spec 2026-11-09)', () => {
  it('hears a test request, and nothing else', () => {
    for (const yes of ['prueba si 15% atrae más que 10%', 'Prueba otra portada', 'prueba otro título', 'haz una prueba A/B de la ventana', 'haz una prueba con la foto',
      'quiero una prueba a/b', 'compara dos versiones de la portada', '¿qué funciona mejor, 10% o 15%?', 'prueba la ventana estilo revista', 'pon una prueba a/b del botón']) expect([yes, AB_REQUEST.test(yes)]).toEqual([yes, true]);
    for (const no of ['muéstrame mi tienda', 'prueba mi tienda en el celular', 'cambia la portada', 'pon 15% en la ventana', 'quiero probar el checkout', 'hazme una prueba de compra',
      '¿cómo va mi prueba?', 'termina la prueba', 'agrega una sección de prueba social', 'pon el texto «prueba gratis»',
      // Final review 2026-11-09: «prueba con…» is everyday Spanish for «try…», not a test.
      'Prueba con un fondo más claro', 'prueba la portada en azul', 'prueba un botón más grande', 'Por favor, prueba el título más corto',
      'compara mi tienda con la versión anterior y vuelve a esa']) expect([no, AB_REQUEST.test(no)]).toEqual([no, false]);
    expect(AB_REQUEST.test('prueba la portada con otra foto')).toBe(true);
  });
  it('hears status and end words', () => {
    for (const text of ['¿Cómo va mi prueba?', 'como va la prueba', 'resultados de la prueba', 'cómo va la prueba a/b']) expect([text, AB_STATUS.test(text)]).toEqual([text, true]);
    for (const text of ['termina la prueba', 'detén la prueba a/b', 'para la prueba', 'terminar prueba']) expect([text, AB_END.test(text)]).toEqual([text, true]);
    expect(AB_STATUS.test('prueba otra portada')).toBe(false);
    expect(AB_END.test('prueba si 15% atrae más')).toBe(false);
    // Final review 2026-11-09: «para» is also «for».
    for (const text of ['Agrega un botón para la prueba gratis', 'pon una sección de kits para prueba', 'cambia el título a «Muestras para prueba»']) expect([text, AB_END.test(text)]).toEqual([text, false]);
    expect(AB_STATUS.test('pon los resultados de la prueba clínica en la portada')).toBe(false);
  });
  it('tells a popup test from a design test', () => {
    expect(abKind('prueba si 15% atrae más que 10%')).toBe('popup');
    expect(abKind('prueba la ventana estilo revista')).toBe('popup');
    expect(abKind('prueba otro descuento de bienvenida')).toBe('popup');
    expect(abKind('prueba otra portada')).toBe('design');
    expect(abKind('prueba el botón verde')).toBe('design');
  });
});

describe('what B changes in the popup', () => {
  it('B is the other number', () => {
    expect(readPopupVariant('prueba si 15% atrae más que 10%', { discount: 10, look: 'postal' })).toEqual({ discount: 15 });
    expect(readPopupVariant('prueba si 15% atrae más que 10%', { discount: 15, look: 'postal' })).toEqual({ discount: 10 });
    expect(readPopupVariant('prueba con 20 %', { discount: 10, look: 'postal' })).toEqual({ discount: 20 });
  });
  it('reads a look by name, and refuses what is not a change', () => {
    expect(readPopupVariant('prueba la ventana estilo revista', { discount: 10, look: 'postal' })).toEqual({ look: 'revista' });
    expect(readPopupVariant('prueba la ventana estilo Clásica con 15%', { discount: 10, look: 'postal' })).toEqual({ discount: 15, look: 'clasica' });
    expect(readPopupVariant('prueba la ventana estilo postal', { discount: 10, look: 'postal' })).toBeNull();
    expect(readPopupVariant('prueba con 60%', { discount: 10, look: 'postal' })).toBeNull();
    expect(readPopupVariant('prueba otra ventana', { discount: 10, look: 'postal' })).toBeNull();
  });
});

describe('when a test has an answer', () => {
  const start = new Date('2026-11-01T00:00:00Z');
  it('signups: 7 days, 100 visitors and 20 signups per version, then 95 % intervals', () => {
    expect(signupEvidence({ visitors: 90, signups: 30 }, { visitors: 120, signups: 60 }, start, new Date(start.getTime() + 8 * DAY))).toMatchObject({ winner: null, reason: expect.stringContaining('Recopilando datos') });
    expect(signupEvidence({ visitors: 300, signups: 20 }, { visitors: 300, signups: 60 }, start, new Date(start.getTime() + 6 * DAY)).winner).toBeNull();
    expect(signupEvidence({ visitors: 300, signups: 20 }, { visitors: 300, signups: 60 }, start, new Date(start.getTime() + 8 * DAY)).winner).toBe('B');
    expect(signupEvidence({ visitors: 300, signups: 40 }, { visitors: 300, signups: 44 }, start, new Date(start.getTime() + 8 * DAY)).winner).toBeNull();
  });
  it('a test is stale after 28 days, or after its extension', () => {
    expect(staleTest(start, null, new Date(start.getTime() + 27 * DAY))).toBe(false);
    expect(staleTest(start, null, new Date(start.getTime() + 28 * DAY))).toBe(true);
    expect(staleTest(start, new Date(start.getTime() + 42 * DAY), new Date(start.getTime() + 30 * DAY))).toBe(false);
  });
});

describe('what YAPI says', () => {
  const numbers = (over: Partial<AbNumbers> = {}): AbNumbers => ({ kind: 'design', request: 'otra portada', days: 9, a: { visitors: 140, buyers: 6, signups: 3 }, b: { visitors: 152, buyers: 11, signups: 5 }, winner: null, stale: false, ...over });
  it('says how a test is going in plain words', () => {
    expect(progressLine(numbers())).toBe('Tu prueba de «otra portada» lleva 9 días: A tuvo 140 visitantes y 6 compras, B 152 y 11. Todavía no hay una diferencia clara.');
    expect(progressLine(numbers({ kind: 'popup', request: '15% vs 10%', days: 1 }))).toBe('Tu prueba de «15% vs 10%» lleva 1 día: A tuvo 140 visitantes y 3 suscripciones, B 152 y 5. Todavía no hay una diferencia clara.');
  });
  it('one is singular, and a test from today says so (live Remolino 2026-11-09: «lleva 0 días … 1 suscripciones»)', () => {
    expect(progressLine(numbers({ kind: 'popup', request: '15% vs 10%', days: 0, a: { visitors: 2, buyers: 0, signups: 1 }, b: { visitors: 1, buyers: 0, signups: 1 } })))
      .toBe('Tu prueba de «15% vs 10%» empezó hoy: A tuvo 2 visitantes y 1 suscripción, B 1 y 1. Todavía no hay una diferencia clara.');
    expect(progressLine(numbers({ days: 2, a: { visitors: 1, buyers: 1, signups: 0 }, b: { visitors: 3, buyers: 0, signups: 0 } })))
      .toBe('Tu prueba de «otra portada» lleva 2 días: A tuvo 1 visitante y 1 compra, B 3 y 0. Todavía no hay una diferencia clara.');
  });
  it('the end line names the winner with its rate, or recommends A when nothing shows', () => {
    expect(endLine(numbers({ winner: 'B' }))).toBe('B vende más: compró el 7,2 % de sus visitantes, contra 4,3 % en A. ¿La dejo como tu tienda?');
    expect(endLine(numbers({ kind: 'popup', winner: 'B' }))).toBe('B suscribe más: se suscribió el 3,3 % de sus visitantes, contra 2,1 % en A. ¿La dejo como tu ventana?');
    expect(endLine(numbers({ stale: true, days: 28 }))).toBe('Pasaron 28 días y no se nota diferencia entre A y B. Te recomiendo quedarte con A.');
  });
});

describe('B words', () => {
  it('only the popup words change their percent — never the comeback card reward (final review 2026-11-09)', () => {
    expect(popupWordsFor({ signupBody: 'Un 10 % de bienvenida.', signupTitle: 'Hola', rewardLabel: '10 % en tu 5ª visita' }, { discount: 15, percentA: 10 }))
      .toEqual({ signupBody: 'Un 15 % de bienvenida.' });
  });
});
