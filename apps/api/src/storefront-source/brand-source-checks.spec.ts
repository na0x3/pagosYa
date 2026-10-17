import { brandColourDrift, brandQuotesUsed } from './brand-source-checks';

const palette = { id: 'photo:faf7f5.2b1e17.5c2c13.cbbab1.l', name: 'p', paper: '#faf7f5', ink: '#2b1e17', accent: '#5c2c13', accent2: '#cbbab1', dark: false };
const css = (bg: string, fg: string, accent: string) => [{ path: 'styles.css', content: `:root{--store-background:${bg};--store-foreground:${fg};--store-accent:${accent}}` }];

it('accepts the brand colours or near shades, and names the token that drifted', () => {
  expect(brandColourDrift(css('#faf7f5', '#2b1e17', '#5c2c13'), palette)).toEqual([]);
  expect(brandColourDrift(css('#f8f4f1', '#2a1d16', '#5e2d14'), palette)).toEqual([]);
  const problems = brandColourDrift(css('#0f4c4c', '#2b1e17', '#f2a65a'), palette).join(' ');
  expect(problems).toContain('--store-background');
  expect(problems).toContain('--store-accent');
  expect(problems).not.toContain('--store-foreground');
  expect(brandColourDrift([{ path: 'styles.css', content: 'body{}' }], palette)).toEqual([]);
});

it('finds a quote in any page, through entities, case and whitespace', () => {
  const quotes = [{ text: 'Hecho con amor, horneado con pasión', source: 'image' as const, where: 'post' }];
  expect(brandQuotesUsed([{ path: 'index.html', content: '<h2>Hecho  con amor,\n horneado con pasi&oacute;n</h2>' }], quotes)).toBe(true);
  expect(brandQuotesUsed([{ path: 'nosotros.html', content: '<p>«HECHO CON AMOR, HORNEADO CON PASIÓN»</p>' }], quotes)).toBe(true);
  expect(brandQuotesUsed([{ path: 'index.html', content: '<h2>Otra cosa</h2>' }], quotes)).toBe(false);
  expect(brandQuotesUsed([{ path: 'index.html', content: '' }], [])).toBe(true);
});

// Live 2026-10-16 (Florería Prueba Checkout): the model used the posts' magenta (#84205f) as accent, a real brand colour, and
// the per-token check against the palette's accent (green) failed the whole request twice.
it('accepts any of the brand\'s own colours for any token, and neutrals', () => {
  const brand = ['#7a1f5c', '#fdf2f8', '#3f7d3a'];
  expect(brandColourDrift(css('#fdf2f8', '#84205f', '#84205f'), palette, brand)).toEqual([]);
  expect(brandColourDrift(css('#ffffff', '#111111', '#3f7d3a'), palette, brand)).toEqual([]);
  expect(brandColourDrift(css('#ffffff', '#111111', '#1d4ed8'), palette, brand).join(' ')).toContain('--store-accent');
});

it('says which quote the site used', () => {
  const { brandQuoteFound } = require('./brand-source-checks');
  const quotes = [{ text: 'Uno dos tres', source: 'image', where: 'x' }, { text: 'Hecho con amor', source: 'image', where: 'y' }];
  expect(brandQuoteFound([{ path: 'index.html', content: '<p>hecho con amor</p>' }], quotes)?.text).toBe('Hecho con amor');
  expect(brandQuoteFound([{ path: 'index.html', content: '<p>nada</p>' }], quotes)).toBeUndefined();
});

// Deferred minor (final review 2026-10-16): «con <em>amor</em>.» read as «con amor .» and missed the quote «con amor.».
it('finds a quote split by inline markup, never one glued across blocks', () => {
  const { brandQuoteFound } = require('./brand-source-checks');
  const quotes = [{ text: 'Hecho con amor.', source: 'image', where: 'post' }];
  expect(brandQuoteFound([{ path: 'index.html', content: '<h2>Hecho con <em>amor</em>.</h2>' }], quotes)?.text).toBe('Hecho con amor.');
  expect(brandQuoteFound([{ path: 'index.html', content: '<p>Hecho con a<span>mor</span>.</p>' }], quotes)?.text).toBe('Hecho con amor.');
  expect(brandQuoteFound([{ path: 'index.html', content: '<p>Hecho con</p><p>amor.</p>' }], [{ text: 'Hecho conamor.', source: 'image', where: 'x' }])).toBeUndefined();
});
