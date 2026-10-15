import { avoidPhrases, checkCopy, moneyIn, copyFindingCounts, copyFindingLines, storePrices, visibleSentences, type CopyCheckInput } from './copy-check';
import { PLAYBOOK } from './design-engine/playbook';
import { SOURCE_TELLS_SELF_CHECK } from './source-signature';
import { foldText, sanitizeVoice } from './store-voice';

/** A home page: the platform header, a style and a script carry words the check must never read. */
const page = (body: string) => `<!doctype html><html><head><title>Inicio</title><style>.x{content:"Descubre"}</style></head><body><header data-pagosya-header><a href="#">Descubre la carta</a></header><main>${body}</main><script>const t = "aún no";</script></body></html>`;
const input = (files: CopyCheckInput['files'], over: Partial<CopyCheckInput> = {}): CopyCheckInput => ({ files, merchantText: [], sources: [], prices: [], siblings: [], ...over });

const REMANSO_STORY = 'Un lugar calmo para leer, trabajar y conversar sin apuro. Luz suave, mesas de madera y café bien hecho.';
const REMANSO_BRIEF = 'Café Remanso es una cafetería de barrio tranquila en La Paz, enfocada en café de especialidad y pastelería casera.';
const REMANSO = page('<h1>Media mañana, bien hecha</h1><p>Café Remanso es una cafetería de barrio tranquila en La Paz. Un lugar calmo para leer, trabajar y conversar sin apuro, con luz suave, mesas de madera y café bien hecho.</p><h2>En La Paz, sin apuro</h2><p>Podés pedir para retiro. La sucursal o dirección de retiro todavía debe confirmarse al completar tu pedido.</p>');
const CHISPA = page('<h2>Primero la idea. Después, que se note.</h2><p>Los detalles de formatos y materiales aún no están publicados.</p><p>La dirección se confirmará cuando esté configurada.</p><p>No hay un área de envío configurada por ahora.</p><footer><p>La información de la tienda aparecerá aquí.</p><p>Aún no hay datos de contacto publicados.</p><p>Sin dirección ni horario publicados todavía.</p></footer>');
const BRUJULA = page('<h2>Del servicio elegido al siguiente paso.</h2><ol><li><strong>01</strong> Elige<p>Revisa el catálogo y selecciona el servicio que necesitas.</p></li><li><strong>02</strong> Añade<p>Agrega el servicio al carrito desde su ficha.</p></li><li><strong>04</strong> Completa<p>Continúa al pago mediante pagosYa.</p></li></ol><p>La sucursal para retiro aún está pendiente de configuración. La plataforma mostrará su disponibilidad cuando esté definida.</p>');
const SHEET = sanitizeVoice({ version: 1, voice: 'Hablamos de tú.', specifics: [{ id: 's1', text: 'Cold brew 350 ml', source: 'product' }], texture: [], assumed: [{ id: 'a1', text: 'desde 1998', kind: 'history', status: 'assumed' }], words: {}, avoid: ['pausa perfecta'] })!;

describe('checkCopy with the 2026-10-14 stores (spec part 4)', () => {
  it('Café Remanso: the brief echoed, «sin apuro», and pickup narrated as missing', () => {
    const found = checkCopy(input([{ path: 'index.html', content: REMANSO }], { merchantText: [REMANSO_STORY, REMANSO_BRIEF] }));
    expect(found).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'echo', page: 'index.html', line: 'Café Remanso es una cafetería de barrio tranquila en La Paz.' }),
      expect.objectContaining({ kind: 'echo', line: 'Un lugar calmo para leer, trabajar y conversar sin apuro, con luz suave, mesas de madera y café bien hecho.' }),
      expect.objectContaining({ kind: 'avoid', line: 'En La Paz, sin apuro', problem: 'frase genérica «sin apuro»' }),
      expect.objectContaining({ kind: 'missing', line: 'La sucursal o dirección de retiro todavía debe confirmarse al completar tu pedido.', problem: 'narra un dato que falta' }),
    ]));
    expect(found.some(finding => finding.line === 'Media mañana, bien hecha')).toBe(false);
    // The header, the style and the script are never read.
    expect(found.map(finding => finding.line).join('\n')).not.toMatch(/Descubre|const t/);
  });

  it('Chispa Láminas: every way of narrating missing data', () => {
    const found = checkCopy(input([{ path: 'index.html', content: CHISPA }]));
    expect(found.filter(finding => finding.kind === 'missing').map(finding => finding.line)).toEqual([
      'Los detalles de formatos y materiales aún no están publicados.', 'La dirección se confirmará cuando esté configurada.', 'No hay un área de envío configurada por ahora.',
      'La información de la tienda aparecerá aquí.', 'Aún no hay datos de contacto publicados.', 'Sin dirección ni horario publicados todavía.',
    ]);
    expect(found.some(finding => finding.line.startsWith('Primero la idea'))).toBe(false);
  });

  it('Brújula Consultores: checkout steps and the platform as content', () => {
    const found = checkCopy(input([{ path: 'index.html', content: BRUJULA }]));
    expect(found).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'avoid', line: 'Agrega el servicio al carrito desde su ficha.', problem: 'explica la compra o nombra la plataforma («al carrito»)' }),
      expect.objectContaining({ kind: 'avoid', line: 'Continúa al pago mediante pagosYa.' }),
      expect.objectContaining({ kind: 'missing', line: 'La sucursal para retiro aún está pendiente de configuración.' }),
      expect.objectContaining({ kind: 'missing', line: 'La plataforma mostrará su disponibilidad cuando esté definida.' }),
    ]));
    // Step numbers are layout, not facts.
    expect(found.some(finding => finding.kind === 'unsourced')).toBe(false);
  });
});

describe('checkCopy rules', () => {
  it('flags facts with no source, an unknown data-assumed id and a money amount that is not a price', () => {
    const html = page([
      '<p>Tostamos <span data-assumed="a1">desde 1998</span> cada semana.</p>',
      '<p>Servimos café desde 1998.</p>',
      '<p>Estamos a 3 cuadras de la plaza.</p>',
      '<p>Cold brew 350 ml por Bs 25.</p>',
      '<p>La promo cuesta Bs 30.</p>',
      '<p><span data-assumed="a7">a 12 km</span> del centro.</p>',
      '<p>Café cultivado en Coroico.</p>',
      '<p>Nuestra pausa perfecta.</p>',
    ].join(''));
    const found = checkCopy(input([{ path: 'index.html', content: html }], { voice: SHEET, prices: [25], sources: ['Cold brew 350 ml'] }));
    expect(found.map(({ kind, line, problem }) => [kind, line, problem])).toEqual(expect.arrayContaining([
      ['unsourced', 'Servimos café desde 1998.', 'dato supuesto sin marcar con data-assumed («1998»)'],
      ['unsourced', 'Estamos a 3 cuadras de la plaza.', 'dato sin fuente («3 cuadras»)'],
      ['unsourced', 'La promo cuesta Bs 30.', 'el monto Bs 30 no es el precio de un producto'],
      ['unsourced', 'data-assumed="a7"', 'data-assumed="a7" no está en la hoja de voz'],
      ['unsourced', 'Café cultivado en Coroico.', 'dato sin fuente («Coroico»)'],
      ['avoid', 'Nuestra pausa perfecta.', 'frase genérica «pausa perfecta»'],
    ]));
    // Wrapped and sourced facts pass: the span, the product and its real price.
    expect(found.some(finding => finding.line.startsWith('Tostamos') || finding.line.startsWith('Cold brew'))).toBe(false);
  });

  it('matches the avoid lists whatever the accents and case, and only whole words', () => {
    const html = page('<p>DESCUBRE nuestra carta.</p><p>Pasion por el cafe.</p><p>Una Experiencia ÚNICA.</p><p>Hecho con AMOR.</p><p>El elevador del edificio.</p><p>Descubrimos la receta.</p><p>Eleva tu mañana.</p>');
    const lines = checkCopy(input([{ path: 'index.html', content: html }])).filter(finding => finding.kind === 'avoid').map(finding => finding.line);
    expect(lines).toEqual(['DESCUBRE nuestra carta.', 'Pasion por el cafe.', 'Una Experiencia ÚNICA.', 'Hecho con AMOR.', 'Eleva tu mañana.']);
  });

  it('flags a sentence said twice on the site or already on a sibling store, never short labels', () => {
    const home = page('<p>Café de especialidad para leer y conversar en Sopocachi.</p><p>Ver productos</p><p>Ver productos</p>');
    const carta = page('<p>Café de especialidad para leer y conversar en Sopocachi.</p><p>Tostamos los lunes para toda la semana.</p>');
    const found = checkCopy(input([{ path: 'index.html', content: home }, { path: 'pages/carta.html', content: carta }], { siblings: ['Tostamos los lunes para toda la semana.'] }));
    expect(found.filter(finding => finding.kind === 'repeat').map(finding => [finding.page, finding.line, finding.problem])).toEqual([
      ['index.html', 'Café de especialidad para leer y conversar en Sopocachi.', 'la misma frase aparece dos veces en el sitio'],
      ['pages/carta.html', 'Café de especialidad para leer y conversar en Sopocachi.', 'la misma frase aparece dos veces en el sitio'],
      ['pages/carta.html', 'Tostamos los lunes para toda la semana.', 'la misma frase aparece en otra tienda'],
    ]);
  });

  it('with no merchant text, flags no echo', () => {
    expect(checkCopy(input([{ path: 'index.html', content: REMANSO }])).some(finding => finding.kind === 'echo')).toBe(false);
  });

  it('writes the findings as lines for the review and counts them by kind', () => {
    const found = [{ kind: 'avoid' as const, page: 'index.html', line: 'En La Paz, sin apuro', problem: 'frase genérica «sin apuro»' }];
    expect(copyFindingLines(found)).toEqual(['línea: «En La Paz, sin apuro» (index.html); problema: frase genérica «sin apuro»; reescribe con un specific o una textura de la hoja']);
    expect(copyFindingCounts(found)).toEqual({ avoid: 1, echo: 0, repeat: 0, missing: 0, unsourced: 0 });
  });
});

describe('the avoid list and the visible text', () => {
  it('merges the shared list, the old empty-copy words, the sketch filler, the kind list and the sheet list once each', () => {
    const list = avoidPhrases('cafe-food', SHEET);
    for (const phrase of ['calidad que se nota', 'Descubre', 'Discover', 'objetos que conversan', 'lo mejor para ti', PLAYBOOK['cafe-food'].avoid[0], 'pausa perfecta']) expect(list).toContain(phrase);
    expect(list.filter(phrase => foldText(phrase) === 'hecho con amor')).toHaveLength(1);
    // The agent's self-check still names the same words, byte for byte.
    expect(SOURCE_TELLS_SELF_CHECK).toContain('empty copy words (Descubre, Eleva, Vive la experiencia, Discover, Elevate, Experience)');
  });

  it('reads only visible text: no header, scripts, styles, templates or hidden elements', () => {
    expect(visibleSentences(page('<p hidden>Descubre oculto.</p><template><p>Eleva</p></template><p>Hola. Qué tal.</p>'))).toEqual(['Hola.', 'Qué tal.']);
  });

  it('collects the store prices: products, variants, extras and membership periods', () => {
    expect(storePrices([{ amount: 1800, variants: [{ amount: 2200 }], extras: [{ amount: 500 }], membershipPeriods: [{ amount: 90000 }] }, null, { amount: 'x' }]).sort((a, b) => a - b)).toEqual([5, 18, 22, 900]);
  });
});

describe('money amounts', () => {
  it('reads dot and comma decimals, keeps three-digit groups as thousands, never a space', () => {
    expect(moneyIn('Taza a Bs 35.50')).toEqual([35.5]);
    expect(moneyIn('Taza a Bs 35,50')).toEqual([35.5]);
    expect(moneyIn('Bs 1.200')).toEqual([1200]);
    expect(moneyIn('Bs 1.200,50')).toEqual([1200.5]);
    expect(moneyIn('Bs 25 200 ml')).toEqual([25]);
    const run = (text: string, prices: number[]) => checkCopy(input([{ path: 'index.html', content: page(`<p>${text}</p>`) }], { prices })).filter(finding => finding.kind === 'unsourced');
    expect(run('Taza a Bs 35.50.', [35.5])).toEqual([]);
    expect(run('Taza a Bs 35,50.', [35.5])).toEqual([]);
    expect(run('El lote cuesta Bs 1.200.', [1200])).toEqual([]);
  });
});
