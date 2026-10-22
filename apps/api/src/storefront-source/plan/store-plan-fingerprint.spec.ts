import { clashesWith, clashWords, fingerprintOf, makeUnique, planDistance } from './store-plan-fingerprint';

const catalogue = { hero: ['full', 'type', 'split-left', 'poster'], header: ['classic', 'minimal', 'split'], grid: ['grid3', 'grid4', 'list'], story: ['split', 'quote'] };
const sections = ['process', 'faq', 'sizes', 'journal'];
const a = fingerprintOf({ variants: { hero: 'full', header: 'classic', grid: 'grid3', story: 'split', feature: 'duo' }, sections: ['faq'], palette: 'linen', fonts: 'grotesk', accent: '#f26b1d' });

it('identical stores are distance 0; sections weigh more than one part', () => {
  expect(planDistance(a, a)).toBe(0);
  expect(planDistance(a, { ...a, sections: ['journal'] })).toBeGreaterThan(planDistance(a, { ...a, variants: { ...a.variants, hero: 'type' } }));
});

it('the same section sequence always clashes, whatever else differs', () => {
  const far = fingerprintOf({ variants: { hero: 'poster', header: 'split', grid: 'list', story: 'quote', feature: 'duo' }, sections: ['faq'], palette: 'citrus', fonts: 'serif' });
  expect(clashesWith(far, [a])?.fields).toContain('sections');
});

it('names the matching fields in plain Spanish, never the other store', () => {
  expect(clashWords(['sections', 'hero', 'fonts'])).toBe('mismo orden de secciones, misma portada y misma tipografía que otra tienda');
});

it('two stores of the same kind made back to back end up apart', () => {
  const { fingerprint, exhausted } = makeUnique({ ...a }, [a], catalogue, sections, 'store-2');
  expect(exhausted).toBe(false);
  expect(planDistance(fingerprint, a)).toBeGreaterThanOrEqual(0.35);
  expect(fingerprint.sections.join('|')).not.toBe(a.sections.join('|'));
});

it('accent hue is bucketed by 30°', () => {
  expect(fingerprintOf({ variants: {}, sections: [], palette: 'x', fonts: 'y', accent: '#ff0000' }).accentHue).toBe(0);
  expect(fingerprintOf({ variants: {}, sections: [], palette: 'x', fonts: 'y', accent: '#00ff00' }).accentHue).toBe(4);
  expect(fingerprintOf({ variants: {}, sections: [], palette: 'x', fonts: 'y' }).accentHue).toBeNull();
});
