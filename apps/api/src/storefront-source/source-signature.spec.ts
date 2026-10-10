import { fitProse, normalizeSourceSignature, sourceSignatureAuthorDirection, sourceSignatureTaskLine, SOURCE_SIGNATURE_SCHEMA, SOURCE_SIGNATURE_PLANNING, SOURCE_SIGNATURE_BUILDING, SOURCE_TELLS_SELF_CHECK } from './source-signature';

const good = () => ({ idea: 'Un café de día que de noche es bar de vinilos: la tienda es un disco con dos caras.', source: 'El dueño pone vinilos después de las 20:00.', vocabulary: ['Tracklist', 'Cara A', 'Cara B'], device: 'Un disco que gira dibujado en CSS y etiquetas Cara A/B.', carries: ['opening', 'menu'] });

describe('normalizeSourceSignature', () => {
  it('keeps a valid signature verbatim and reports nothing', () => {
    expect(normalizeSourceSignature(good(), ['opening', 'menu', 'visit'], 'concepts[0]')).toEqual({ signature: good(), repairs: [] });
  });
  it('returns nothing and no repairs when there is no signature', () => {
    expect(normalizeSourceSignature(undefined, ['menu'], 'concepts[0]')).toEqual({ repairs: [] });
    expect(normalizeSourceSignature(null, ['menu'], 'concepts[0]')).toEqual({ repairs: [] });
  });
  it('drops a signature that is not an object or has no idea, and says why', () => {
    expect(normalizeSourceSignature('vinyl', ['menu'], 'concepts[1]')).toEqual({ repairs: ['concepts[1].signature: not an object, dropped'] });
    const result = normalizeSourceSignature({ ...good(), idea: '   ' }, ['menu'], 'concepts[1]');
    expect(result.signature).toBeUndefined();
    expect(result.repairs).toContain('concepts[1].signature: no idea, dropped');
  });
  it('keeps only carries that name planned sections', () => {
    const result = normalizeSourceSignature({ ...good(), carries: ['opening', 'ghost', 'menu', 'menu'] }, ['opening', 'menu'], 'concepts[2]');
    expect(result.signature!.carries).toEqual(['opening', 'menu']);
    expect(result.repairs).toEqual(['concepts[2].signature.carries: kept 2 of 4 section IDs']);
  });
  it('cuts long prose at a sentence and trims the vocabulary to eight short distinct entries', () => {
    // fitProse keeps a sentence only when it ends past half the limit, so the first sentence is ~115 chars.
    const sentence = 'Concepto ' + 'muy '.repeat(25) + 'claro.';
    const long = sentence + ' ' + 'x'.repeat(400);
    const words = ['Uno', 'uno', '', 'x'.repeat(41), 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve'];
    const result = normalizeSourceSignature({ ...good(), idea: long, vocabulary: words }, ['opening', 'menu'], 'concepts[0]');
    expect(result.signature!.idea).toBe(sentence);
    expect(result.signature!.vocabulary).toEqual(['Uno', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho']);
    expect(result.repairs).toEqual(expect.arrayContaining([expect.stringContaining('concepts[0].signature.idea'), expect.stringContaining('concepts[0].signature.vocabulary')]));
  });
  it('clears non-text fields instead of failing', () => {
    const result = normalizeSourceSignature({ ...good(), source: 42, device: undefined, vocabulary: 'Tracklist' }, ['opening', 'menu'], 'concepts[0]');
    expect(result.signature).toMatchObject({ source: '', device: '', vocabulary: [] });
  });
});

describe('signature prompt text and schema', () => {
  it('lists every field as required for strict mode and allows empty values', () => {
    expect(SOURCE_SIGNATURE_SCHEMA.required).toEqual(['idea', 'source', 'vocabulary', 'device', 'carries']);
    expect(SOURCE_SIGNATURE_SCHEMA.properties.idea).not.toHaveProperty('minLength');
    expect(SOURCE_SIGNATURE_SCHEMA.properties.vocabulary).not.toHaveProperty('minItems');
  });
  it('directs without banning anything', () => {
    for (const text of [SOURCE_SIGNATURE_PLANNING, SOURCE_SIGNATURE_BUILDING, SOURCE_TELLS_SELF_CHECK]) expect(text).not.toMatch(/\b(never use|forbidden|prohibid|must not use)\b/i);
    expect(SOURCE_SIGNATURE_PLANNING).toContain('restraint is a valid signature');
    expect(SOURCE_TELLS_SELF_CHECK).toContain('never blocks finishing');
    expect(SOURCE_TELLS_SELF_CHECK).toContain('tellsKept');
  });
  it('builds a task line only when enabled and a signature exists', () => {
    expect(sourceSignatureTaskLine({ signature: good() }, true)).toContain('Cara A · Cara B');
    expect(sourceSignatureTaskLine({ signature: good() }, false)).toBe('');
    expect(sourceSignatureTaskLine({}, true)).toBe('');
    expect(sourceSignatureTaskLine(undefined, true)).toBe('');
  });
  it('gives a whole-store author the building direction and the signature, or nothing', () => {
    const direction = sourceSignatureAuthorDirection({ signature: good() }, true);
    expect(direction.startsWith(SOURCE_SIGNATURE_BUILDING)).toBe(true);
    expect(direction).toContain('Cara A · Cara B');
    expect(sourceSignatureAuthorDirection({ signature: good() }, false)).toBe('');
    expect(sourceSignatureAuthorDirection({}, true)).toBe('');
  });
  it('keeps fitProse behaviour', () => {
    expect(fitProse('Primera frase. Segunda parte larga', 20)).toBe('Primera frase.');
    expect(fitProse('uno dos tres cuatro', 10)).toBe('uno dos');
  });
});
