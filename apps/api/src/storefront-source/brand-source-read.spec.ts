import { brandSheet, brandSourcePrompt, parseBrandRead } from './brand-source-read';

it('keeps only verbatim quotes, trims and caps them', () => {
  const read = parseBrandRead({ quotes: [{ text: ' Hecho con amor ', verbatim: true, where: 'post 1' }, { text: 'Inventada', verbatim: false, where: 'x' }, { text: 'x'.repeat(300), verbatim: true, where: 'y' }], voice: 'cálida, de tú, sin emojis', layout: 'fotos grandes, mucho aire', typeLook: 'serif de alto contraste' });
  expect(read.quotes.map(q => q.text)).toEqual(['Hecho con amor']);
  expect(read.quotes[0].source).toBe('image');
  expect(parseBrandRead({ nonsense: true }).quotes).toEqual([]);
});

it('builds the sheet and a prompt that says it is the merchant\'s own brand and to use quotes verbatim', () => {
  const sheet = brandSheet({ imageUrls: ['/v1/uploads/a.jpg'], captureIndexes: [], quotes: [{ text: 'Cada pan cuenta una historia', source: 'website', where: 'blockquote' }], fontFamilies: ['Playfair Display'], imported: [], look: true, notes: [] },
    { quotes: [{ text: 'Hecho con amor', source: 'image', where: 'post' }], voice: 'cálida', layout: 'fotos grandes', typeLook: 'serif' }, undefined);
  expect(sheet.quotes.map(q => q.text)).toEqual(['Cada pan cuenta una historia', 'Hecho con amor']);
  expect(sheet.fonts?.display).toBe('Playfair Display');
  const prompt = brandSourcePrompt(sheet);
  expect(prompt).toContain("BRAND SOURCE (the merchant's own brand");
  expect(prompt).toContain('«Cada pan cuenta una historia»');
  expect(prompt).toMatch(/never reword/i);
  expect(brandSheet({ imageUrls: ['/x.jpg'], captureIndexes: [], quotes: [], fontFamilies: [], imported: [], look: false, notes: [] }, undefined, undefined).notes).toContain('No pude leer los textos de tus capturas.');
});

it('says what it took from the brand, in the merchant\'s Spanish', () => {
  const { brandSourceReceipt } = require('./brand-source-read');
  const line = brandSourceReceipt({ palette: { id: 'photo:x', name: 'n', paper: '#faf7f5', ink: '#2b1e17', accent: '#5c2c13', accent2: '#cbbab1', dark: false }, quotes: [{ text: 'Hecho con amor', source: 'image', where: 'post' }], fonts: { display: 'Playfair Display' }, imported: [{ url: '/v1/uploads/a.jpg', source: 'https://x.bo/a.jpg', kind: 'photo' }, { url: '/v1/uploads/b.jpg', source: 'https://x.bo/b.jpg', kind: 'photo' }], notes: ['No pude traer 1 imagen de tu página anterior.'] });
  expect(line).toBe('Tomé de tu marca: sus colores, la frase «Hecho con amor», la tipografía Playfair Display y 2 fotos de tu página anterior (puedes quitarlas en Medios). No pude traer 1 imagen de tu página anterior.');
  expect(brandSourceReceipt({ quotes: [], imported: [], notes: [] })).toBe('');
});

it('names only what the checks verified', () => {
  const { brandSourceReceipt } = require('./brand-source-read');
  const sheet = { palette: { id: 'photo:x', name: 'n', paper: '#faf7f5', ink: '#2b1e17', accent: '#5c2c13', accent2: '#cbbab1', dark: false }, quotes: [{ text: 'Uno dos tres', source: 'image', where: 'x' }], fonts: { display: 'Playfair Display' }, imported: [], notes: [] };
  expect(brandSourceReceipt(sheet, { colours: false })).toBe('Tomé de tu marca: la tipografía Playfair Display.');
  expect(brandSourceReceipt(sheet, { colours: true, quote: 'Hecho con amor' })).toBe('Tomé de tu marca: sus colores, la frase «Hecho con amor» y la tipografía Playfair Display.');
});

it('the Sep-5 author prompt carries the BRAND SOURCE block (final review 2026-10-16, C2)', () => {
  const { sep5AuthorPrompt } = require('./design-engine/sep5-author');
  const prompt = sep5AuthorPrompt({ brief: {}, instruction: 'x', data: {}, assetLegend: [], brand: "BRAND SOURCE (the merchant's own brand): «Hecho con amor»" });
  expect(prompt).toContain('«Hecho con amor»');
  expect(sep5AuthorPrompt({ brief: {}, instruction: 'x', data: {}, assetLegend: [] })).not.toContain('BRAND SOURCE');
});

// Deferred minor (final review 2026-10-16): phrases the read could not vouch for are kept apart, never as the brand's phrases.
it('keeps phrases the read was unsure of apart from its verbatim quotes', () => {
  const read = parseBrandRead({ quotes: [{ text: 'Hecho con amor', verbatim: true, where: 'post' }, { text: 'Flores que cuentan historias', verbatim: false, where: 'post 2' }, { text: 'ok', verbatim: false, where: 'x' }], voice: 'v', layout: 'l', typeLook: 't' });
  expect(read.quotes.map(q => q.text)).toEqual(['Hecho con amor']);
  expect(read.unsure.map(q => q.text)).toEqual(['Flores que cuentan historias']);
  const sheet = brandSheet({ imageUrls: ['/a.jpg'], captureIndexes: [], quotes: [], fontFamilies: [], imported: [], look: true, notes: [] }, read, undefined);
  expect(sheet.unsure.map(q => q.text)).toEqual(['Flores que cuentan historias']);
  expect(brandSourcePrompt(sheet)).not.toContain('Flores que cuentan historias');
});
