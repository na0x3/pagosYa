import { assumedIdsByPage, authoredPages, foldText, kindQuestionNote, merchantMessagesText, merchantSpecificCount, merchantTextOf, neverAssumedReason, nextKindQuestion, pendingAssumptions, pendingFactsNote, readOnboardingMaterial, readVoice, sanitizeVoice, sanitizeVoiceReport, VOICE_FILE, voiceFile, voiceForSave, voicesToDiffer, withOnboardingAnswers, withVoiceFile, type StoreVoice } from './store-voice';

const SHEET: StoreVoice = {
  version: 1,
  voice: 'Hablamos de tú, despacio y con nombres propios; nunca prometemos lo que no servimos.',
  specifics: [{ id: 's1', text: 'El flat white con alfajor de maicena es lo que todos piden', source: 'merchant' }, { id: 's2', text: 'Cold brew 350 ml a Bs 25', source: 'product' }],
  texture: ['El vapor de la leche empaña la ventana a media mañana'],
  assumed: [{ id: 'a1', text: 'tostado en Caranavi', kind: 'origin', status: 'assumed' }, { id: 'a2', text: 'abiertos desde 2019', kind: 'history', status: 'assumed' }],
  words: { products: 'la carta', customers: 'vecinos', order: 'Tu pedido', team: 'el equipo del Remanso' },
  avoid: ['pausa perfecta'],
};
const page = (path: string, body: string) => ({ path, content: `<!doctype html><html><body><header data-pagosya-header></header><main>${body}</main><footer>Café Remanso</footer></body></html>` });

describe('sanitizeVoice (spec 2026-10-14, part 2)', () => {
  it('keeps a valid sheet as it is, and is idempotent', () => {
    expect(sanitizeVoice(SHEET)).toEqual(SHEET);
    expect(sanitizeVoice(sanitizeVoice(SHEET))).toEqual(SHEET);
  });

  it.each([
    ['a price', 'la taza a Bs 18'], ['a percent', '20% menos azúcar'], ['a discount', 'descuento para vecinos'], ['free delivery', 'envío gratis los lunes'],
    ['a quote', '«El mejor café de La Paz», dijo Ana'], ['a testimonial', 'testimonio de una clienta feliz'], ['a review', 'cinco estrellas en cada reseña'],
    ['a health claim', 'cura la gastritis'], ['a weight claim', 'te ayuda a bajar de peso'], ['a results claim', 'resultados visibles en 7 días'], ['accents and case', 'SANA tu piel'],
  ])('never keeps %s as an assumption', (_name, text) => {
    const report = sanitizeVoiceReport({ ...SHEET, assumed: [{ id: 'a9', text, kind: 'number', status: 'assumed' }] });
    expect(report.voice!.assumed).toEqual([]);
    expect(report.rejected).toEqual([expect.objectContaining({ field: 'assumed', text })]);
  });

  it('keeps plausible facts, and never checks a fact the merchant confirmed', () => {
    for (const text of ['tostado en Caranavi', 'abiertos desde 2019', '300 litros de leche por semana', 'la receta de la abuela Rosa']) expect(neverAssumedReason(text)).toBeUndefined();
    const confirmed = { id: 'a3', text: 'Bs 18 la taza desde siempre', kind: 'number' as const, status: 'confirmed' as const };
    expect(sanitizeVoice({ ...SHEET, assumed: [confirmed] })!.assumed).toEqual([confirmed]);
  });

  it('drops a repeated or unsafe id and keeps the first entry with it', () => {
    const voice = sanitizeVoice({ ...SHEET,
      specifics: [...SHEET.specifics, { id: 's1', text: 'otra cosa', source: 'merchant' }, { id: 'S3', text: 'mayúsculas', source: 'merchant' }],
      assumed: [...SHEET.assumed, { id: 's2', text: 'el id de un specific', kind: 'place', status: 'assumed' }, { id: '"><b', text: 'markup', kind: 'place', status: 'assumed' }] })!;
    expect(voice.specifics.map(entry => entry.id)).toEqual(['s1', 's2']);
    expect(voice.assumed.map(entry => entry.id)).toEqual(['a1', 'a2']);
  });

  it('rejects anything over the limits', () => {
    expect(sanitizeVoice({ ...SHEET, voice: 'x'.repeat(201) })).toBeUndefined();
    const voice = sanitizeVoice({ ...SHEET,
      specifics: Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, text: `dato ${i}`, source: 'merchant' })),
      texture: ['a'.repeat(121), ...Array.from({ length: 7 }, (_, i) => `escena ${i}`)],
      assumed: Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, text: `hecho ${i}`, kind: 'place', status: 'assumed' })),
      avoid: Array.from({ length: 25 }, (_, i) => `frase ${i}`),
      words: { order: 'x'.repeat(41), team: ' el   equipo ' } })!;
    expect(voice.specifics).toHaveLength(8);
    expect(voice.texture).toEqual(['escena 0', 'escena 1', 'escena 2', 'escena 3', 'escena 4']);
    expect(voice.assumed).toHaveLength(6);
    expect(voice.avoid).toHaveLength(20);
    expect(voice.words).toEqual({ team: 'el equipo' });
  });

  it('drops markup, unknown enums and another version', () => {
    expect(sanitizeVoice({ ...SHEET, version: 2 })).toBeUndefined();
    expect(sanitizeVoice('{}')).toBeUndefined();
    const voice = sanitizeVoice({ ...SHEET,
      specifics: [{ id: 's1', text: '<img src=x>', source: 'merchant' }, { id: 's2', text: 'ok', source: 'rumor' }],
      assumed: [{ id: 'a1', text: 'desde 1998', kind: 'legend', status: 'assumed' }, { id: 'a2', text: 'desde 1998', kind: 'history', status: 'maybe' }] })!;
    expect(voice.specifics).toEqual([]);
    expect(voice.assumed).toEqual([]);
  });
});

describe('voice.json', () => {
  it('reads what it writes, and ignores a broken or binary file', () => {
    expect(voiceFile(SHEET).path).toBe(VOICE_FILE);
    expect(readVoice([voiceFile(SHEET)])).toEqual(SHEET);
    expect(readVoice([{ path: VOICE_FILE, content: '{nope' }])).toBeUndefined();
    expect(readVoice([{ path: VOICE_FILE, content: JSON.stringify(SHEET), encoding: 'base64' }])).toBeUndefined();
    const files = withVoiceFile([{ path: 'index.html', content: '<h1>x</h1>' }, { path: VOICE_FILE, content: '{}' }], SHEET);
    expect(files.map(file => file.path)).toEqual(['index.html', VOICE_FILE]);
    expect(readVoice(files)).toEqual(SHEET);
    expect(withVoiceFile(files, undefined).map(file => file.path)).toEqual(['index.html']);
  });
});

describe('assumed facts on the pages', () => {
  it('reads the pages YAPI wrote, not the kit pages or the platform copies', () => {
    const files = [
      page('index.html', '<p>Tostado <span data-assumed="a1">en Caranavi</span>.</p>'),
      page('pages/carta.html', `<p><span class="x" data-assumed='a2'>desde 2019</span></p>`),
      page('nosotros.html', '<div data-pagosya-page="about"></div>'),
      page('product.html', '<span data-assumed="a1">x</span>'),
      { path: 'assets/a.png', content: '<span data-assumed="a1">', encoding: 'base64' },
    ];
    expect(authoredPages(files).map(file => file.path)).toEqual(['index.html', 'pages/carta.html']);
    expect([...assumedIdsByPage(files)]).toEqual([['index.html', ['a1']], ['pages/carta.html', ['a2']]]);
  });

  it('saves only the assumptions a page still carries, and moves confirmed facts to the merchant specifics', () => {
    const files = [page('index.html', '<p><span data-assumed="a1">tostado en Caranavi</span></p>')];
    const withConfirmed: StoreVoice = { ...SHEET, assumed: [...SHEET.assumed, { id: 'a3', text: 'hornean cada mañana', kind: 'process', status: 'confirmed' }] };
    const saved = voiceForSave(withConfirmed, files);
    expect(saved.assumed.map(entry => entry.id)).toEqual(['a1']);
    expect(saved.specifics.at(-1)).toEqual({ id: 'a3', text: 'hornean cada mañana', source: 'merchant' });
    expect(pendingAssumptions(saved).map(entry => entry.id)).toEqual(['a1']);
    expect(pendingAssumptions(undefined)).toEqual([]);
  });

  it('keeps at most 8 specifics, dropping the ones YAPI sourced before the merchant’s', () => {
    const full: StoreVoice = { ...SHEET,
      specifics: [...Array.from({ length: 6 }, (_, i) => ({ id: `m${i}`, text: `del comercio ${i}`, source: 'merchant' as const })), { id: 'p1', text: 'del catálogo', source: 'product' }, { id: 'p2', text: 'de una foto', source: 'photo' }],
      assumed: [{ id: 'a1', text: 'desde 2019', kind: 'history', status: 'confirmed' }] };
    const saved = voiceForSave(full, []);
    expect(saved.specifics.map(entry => entry.id)).toEqual(['m0', 'm1', 'm2', 'm3', 'm4', 'm5', 'p1', 'a1']);
    expect(merchantSpecificCount(saved)).toBe(7);
  });
});

describe('merchant material (spec part 1)', () => {
  it('takes the merchant’s messages latest first, up to 2,000 characters', () => {
    const text = merchantMessagesText([{ content: 'último' }, { content: 'x'.repeat(1990) }, { content: 'el primero, que ya no cabe' }]);
    expect(text.startsWith('último\n')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(2000);
    expect(text).not.toContain('el primero');
  });

  it('reads the onboarding answers defensively, and a store with none gives none', () => {
    expect(readOnboardingMaterial(undefined)).toEqual({ answers: [] });
    expect(readOnboardingMaterial({ version: 1, what: ' Café ', story: 7, answers: [{ question: '¿Qué pide todo el mundo?', answer: 'El cortado' }, { question: 3 }, null] }))
      .toEqual({ what: 'Café', answers: [{ question: '¿Qué pide todo el mundo?', answer: 'El cortado' }] });
    expect(merchantTextOf('', { answers: [] })).toEqual([]);
    expect(merchantTextOf('hola', { what: 'Café', answers: [{ question: '¿A?', answer: 'sí' }] })).toEqual(['hola', 'Café', 'sí']);
  });

  it('adds answers the sheet does not have yet as the merchant’s own specifics; none leaves the sheet as it is', () => {
    expect(withOnboardingAnswers(SHEET, [])).toBe(SHEET);
    expect(withOnboardingAnswers(SHEET, [{ question: '¿Qué pide todo el mundo?', answer: 'El flat white con alfajor de maicena.' }])).toBe(SHEET);
    const voice = withOnboardingAnswers(SHEET, [
      { question: '¿Qué pide todo el mundo?', answer: 'El flat white con alfajor de maicena es lo que todos piden' },
      { question: '¿Qué tiene tu local?', answer: 'Una ventana grande a la plaza Avaroa' },
    ]);
    expect(voice.specifics.map(entry => entry.text)).toEqual([...SHEET.specifics.map(entry => entry.text), 'Una ventana grande a la plaza Avaroa']);
    expect(voice.specifics.at(-1)).toEqual({ id: 'm1', text: 'Una ventana grande a la plaza Avaroa', source: 'merchant' });
  });

  it('asks the next kind question nobody asked yet, accents ignored', () => {
    const questions = ['¿Qué pide todo el mundo?', '¿Qué tiene tu local que no tenga otro?'];
    expect(nextKindQuestion(questions, ['¿Que pide todo el mundo?'])).toBe('¿Qué tiene tu local que no tenga otro?');
    expect(nextKindQuestion(questions, questions)).toBeUndefined();
    expect(kindQuestionNote('¿Qué pide todo el mundo?')).toBe('Una pregunta para que tu tienda suene más tuya: ¿Qué pide todo el mundo? Si me respondes, lo uso en los próximos cambios.');
  });

  it('says how many facts are waiting, in Spanish', () => {
    expect(pendingFactsNote(1)).toBe('Supuse 1 dato de tu negocio: confírmalo, corrígelo o quítalo en «Datos que YAPI supuso» antes de publicar.');
    expect(pendingFactsNote(3)).toBe('Supuse 3 datos de tu negocio: confírmalos, corrígelos o quítalos en «Datos que YAPI supuso» antes de publicar.');
  });

  it('differs from same-kind stores first, then the newest others, six at most', () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ kind: i % 3 === 0 ? 'cafe-food' : 'clothing', voice: { ...SHEET, voice: `voz ${i}` }, sentences: [] }));
    expect(voicesToDiffer(rows, 'cafe-food').map(row => row.voice!.voice)).toEqual(['voz 0', 'voz 3', 'voz 6', 'voz 1', 'voz 2', 'voz 4']);
  });

  it('folds accents and case for every comparison', () => {
    expect(foldText('Experiencia ÚNICA, Pasión')).toBe('experiencia unica, pasion');
  });
});

describe('final review fixes 2026-10-15', () => {
  it('never assumes money or quotes written other ways', () => {
    for (const text of ['20€ menos', 'cuesta 20 USD', 'veinte por ciento menos', '‘lo mejor del barrio’']) expect(neverAssumedReason(text)).toBeDefined();
  });
  it('keeps a pending fact a page states without its mark, and drops it once no page says it', () => {
    const sheet = sanitizeVoice({ ...SHEET, assumed: [{ id: 'a1', text: 'tostado en Caranavi', kind: 'origin', status: 'assumed' }] })!;
    expect(voiceForSave(sheet, [{ path: 'index.html', content: '<main><p>Café tostado en Caranavi.</p></main>' }]).assumed.map(fact => fact.id)).toEqual(['a1']);
    expect(voiceForSave(sheet, [{ path: 'index.html', content: '<main><p>Café de la casa.</p></main>' }]).assumed).toEqual([]);
  });
});
