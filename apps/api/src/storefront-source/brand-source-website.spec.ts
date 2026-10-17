import { extractBrandWebsite } from './brand-source-website';
import { matchServedFont } from './brand-source-fonts';

const html = `<!doctype html><html><head><title>BAEK</title><meta name="description" content="Hecho con amor, horneado con pasión.">
<meta property="og:image" content="/img/portada.jpg"><link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png">
<style>h1{font-family:"Playfair Display",Georgia,serif} body{font-family:Inter,system-ui,sans-serif}</style></head>
<body><header><img src="/logo.png" alt="BAEK logo" width="120"></header>
<main><section><h1>El sabor que alegra tus días</h1><p>Panes artesanales y café en Sopocachi.</p><img src="data:image/png;base64,AAAA"><img src="/tiny.png" width="16"></section>
<section><blockquote>Cada pan cuenta una historia</blockquote><img srcset="/a-400.jpg 400w, /a-1600.jpg 1600w" src="/a-400.jpg"><img src="/icon.svg"></section></main></body></html>`;

describe('extractBrandWebsite', () => {
  const out = extractBrandWebsite(html, 'https://baek-old.bo/');
  it('keeps headings, the description and blockquotes verbatim, de-duplicated', () => {
    expect(out.quotes.map(q => q.text)).toEqual(expect.arrayContaining(['Hecho con amor, horneado con pasión.', 'El sabor que alegra tus días', 'Cada pan cuenta una historia']));
    expect(out.quotes.every(q => q.source === 'website' && q.text.length <= 160)).toBe(true);
    expect(out.quotes.length).toBeLessThanOrEqual(8);
  });
  it('reads the first non-generic font family per rule', () => {
    expect(out.fontFamilies).toEqual(expect.arrayContaining(['Playfair Display', 'Inter']));
    expect(out.fontFamilies).not.toContain('serif');
  });
  it('lists photo and logo candidates as absolute URLs, skipping data URIs, SVG and declared-tiny images', () => {
    const urls = out.images.map(i => i.url);
    expect(urls).toEqual(expect.arrayContaining(['https://baek-old.bo/img/portada.jpg', 'https://baek-old.bo/a-1600.jpg', 'https://baek-old.bo/logo.png']));
    expect(urls.some(u => u.startsWith('data:') || u.endsWith('.svg') || u.endsWith('/tiny.png'))).toBe(false);
    expect(out.images.find(i => i.url.endsWith('/logo.png'))!.kind).toBe('logo');
  });
  it('lists nothing from a site of only icons and data URIs', () => {
    expect(extractBrandWebsite('<img src="/a.svg"><img src="data:image/png;base64,AA"><img src="/b.png" width="20">', 'https://x.bo/').images).toEqual([]);
  });
});

describe('matchServedFont', () => {
  it('keeps a served family, maps others by kind, and gives nothing for unknowns', () => {
    expect(matchServedFont('Playfair Display', 'display')).toBe('Playfair Display');
    expect(matchServedFont('Georgia', 'text')).toMatch(/./);
    expect(matchServedFont('serif elegante de alto contraste', 'display')).toMatch(/./);
    expect(matchServedFont('zzz', 'display')).toBeUndefined();
  });
});

it('does not take navigation words as brand phrases', () => {
  const out = extractBrandWebsite('<h2>Contacto</h2><h3>Menú</h3><h2>Pan recién horneado cada mañana</h2>', 'https://x.bo/');
  expect(out.quotes.map(q => q.text)).toEqual(['Pan recién horneado cada mañana']);
});

// Deferred minor (final review 2026-10-16): a phrase split by inline markup kept a space where the tag was («amor .»).
it('reads a phrase split by inline markup as the visitor sees it, and keeps blocks apart', () => {
  const out = extractBrandWebsite('<main><section><h1>Hecho con <em>amor</em>.</h1><h2>Pan de <b>masa</b> ma<span>dre</span> cada día</h2><ul><li>Uno dos tres</li><li>cuatro cinco seis</li></ul><blockquote>Lo mejor<br>de la casa, siempre</blockquote></section></main>', 'https://x.bo/');
  expect(out.quotes.map(q => q.text)).toEqual(expect.arrayContaining(['Hecho con amor.', 'Pan de masa madre cada día', 'Lo mejor de la casa, siempre']));
});

it('says when an old site has nothing to import', () => {
  const { brandWebsiteNotes } = require('./brand-source-website');
  expect(brandWebsiteNotes({ quotes: [], images: [] })).toEqual(['En tu página anterior no encontré fotos ni frases que pudiera traer.']);
  expect(brandWebsiteNotes({ quotes: [{ text: 'Hecho con amor', source: 'website', where: 'h1' }], images: [] })).toEqual(['En tu página anterior no encontré fotos que pudiera traer.']);
  expect(brandWebsiteNotes({ quotes: [], images: [{ url: 'https://x.bo/a.jpg', kind: 'photo' }] })).toEqual([]);
});
