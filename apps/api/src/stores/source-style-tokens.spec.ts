import { sourceStyleTokens } from './source-style-tokens';
import { buildSourceVisualSystem, savedSourceVisualSystem, withSourceStyleTokens } from './source-visual-system';

it('records literal base tokens while leaving expressions explicitly unresolved', () => {
  expect(sourceStyleTokens([{ path: 'styles/globals.css', content: ':root{--store-accent:#234531;--store-radius:6px;--store-surface:color-mix(in srgb,red 10%,white);--store-body-font:"Local Face",sans-serif}' }])).toMatchObject({
    accent: { authored: '#234531', resolved: '#234531', source: 'authored' },
    radius: { resolved: '6px' }, surface: { resolved: null, source: 'unresolved' }, 'body-font': { resolved: '"Local Face",sans-serif' },
  });
});
it('records confirmed brand before authored values and ignores conditional or scoped overrides', () => {
  expect(sourceStyleTokens([
    { path: 'brand.css', content: ':root{--brand-accent:#112233}' },
    { path: 'styles.css', content: ':root{--store-accent:var(--brand-accent,#ff00aa);--store-radius:4px}@media(max-width:400px){:root{--store-radius:8px}}.product{--store-radius:20px}' },
  ])).toMatchObject({ accent: { authored: 'var(--brand-accent,#ff00aa)', resolved: '#112233', source: 'confirmed', path: 'brand.css' }, radius: { resolved: '4px' } });
});
it('keeps v2 snapshots readable and re-extracts v3 evidence from the final styles', () => {
  const old = { ...buildSourceVisualSystem('off'), version: 2 };
  expect(savedSourceVisualSystem([{ path: 'visual-system.json', content: JSON.stringify(old) }])?.version).toBe(2);
  const next = withSourceStyleTokens(old as any, [{ path: 'styles.css', content: ':root{--store-accent:#102030}' }]);
  expect(next.tokens?.accent?.resolved).toBe('#102030');
  expect(withSourceStyleTokens(next, [{ path: 'styles.css', content: ':root{--store-accent:#304050}' }]).tokens?.accent?.resolved).toBe('#304050');
  expect(savedSourceVisualSystem([{ path: 'visual-system.json', content: JSON.stringify(next) }])).toEqual(next);
});

import { validateSourceStyleTokens } from './source-style-tokens';
it('prevents generated source from overriding confirmed identity while accepting merchant-specific fallbacks', () => {
  const confirmed = ':root{--brand-accent:#112233}';
  expect(() => validateSourceStyleTokens([{ path: 'styles.css', content: ':root{--brand-accent:red}' }], confirmed)).toThrow('reserva');
  expect(() => validateSourceStyleTokens([{ path: 'styles.css', content: ':root{--store-accent:#ff00aa}' }], confirmed)).toThrow('referenciar');
  expect(() => validateSourceStyleTokens([{ path: 'styles.css', content: ':root{--store-accent:var(--brand-accent,#ff00aa)}' }], confirmed)).not.toThrow();
  expect(() => validateSourceStyleTokens([{ path: 'styles.css', content: ':root{--store-accent:#ff00aa}' }])).not.toThrow();
});

it('records an explicit authored override rather than misreporting it as the old confirmed color', () => {
  expect(sourceStyleTokens([{ path: 'brand.css', content: ':root{--brand-accent:#112233}' }, { path: 'styles.css', content: ':root{--store-accent:#228855}' }]).accent).toMatchObject({ resolved: '#228855', source: 'authored' });
});
it('matches complete confirmed variable names and accepts CSS whitespace', () => {
  const brand = ':root{--brand-accent:#112233}';
  expect(() => validateSourceStyleTokens([{ path: 'styles.css', content: ':root{--store-accent:var(--brand-accent-foreground,#ffffff)}' }], brand)).toThrow('referenciar');
  expect(() => validateSourceStyleTokens([{ path: 'styles.css', content: ':root{--store-accent:var( --brand-accent , #ffffff)}' }], brand)).not.toThrow();
  expect(sourceStyleTokens([{ path: 'brand.css', content: brand }, { path: 'styles.css', content: ':root{--store-accent:var( --brand-accent , #ffffff)}' }]).accent?.resolved).toBe('#112233');
});
