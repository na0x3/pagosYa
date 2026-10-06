import { sep5CreativePlan } from './sep5-plan';
import { creativePlanSchema } from './design-schemas';
import type { Sep5Extraction } from './sep5-extract';

const extraction = (over: Partial<Sep5Extraction> = {}): Sep5Extraction => ({
  palette: { paper: '#fff8ee', ink: '#172b2d', accent: '#087f98', deep: '#00566b', pop: '#ed5a2a' },
  droppedColours: [], headline: 'Que no te gane el fondo de la bolsa.',
  sections: [
    { name: 'hero', family: 'hero', heading: null },
    { name: 'buying-rhythm', family: 'steps', heading: 'Cada mes, sin pensarlo' },
    { name: 'shop-section', family: 'catalog', heading: 'El catálogo' },
    { name: 'costal-note', family: 'story', heading: 'Del costal a la casa' },
  ],
  displayIsSerif: true, displayIsCondensed: false, cornerStyle: 'round',
  displayMaxRem: 4.25, hardShadow: false, uppercaseCount: 4, losses: [],
  ...over,
});

it('produces a plan the engine schema accepts', () => {
  const { plan } = sep5CreativePlan(extraction());
  expect(creativePlanSchema.safeParse(plan).success).toBe(true);
});

it('carries the extracted palette and corner language through untouched', () => {
  const { plan } = sep5CreativePlan(extraction());
  expect(plan.palette).toEqual({ paper: '#fff8ee', ink: '#172b2d', accent: '#087f98', deep: '#00566b', pop: '#ed5a2a' });
  expect(plan.artDirection.cornerStyle).toBe('round');
});

it('keeps each section heading as the intent so the voice survives', () => {
  const { plan } = sep5CreativePlan(extraction());
  expect(plan.sections.map(s => s.type)).toEqual(['hero', 'steps', 'catalog', 'story']);
  expect(plan.sections.find(s => s.type === 'steps')?.intent).toBe('Cada mes, sin pensarlo');
});

it('reports that the engine keeps only one section per family', () => {
  const { losses } = sep5CreativePlan(extraction({ sections: [
    { name: 'hero', family: 'hero', heading: null },
    { name: 'plan-guide', family: 'steps', heading: 'Elegí tu plan' },
    { name: 'catalog-section', family: 'catalog', heading: null },
    { name: 'week-rhythm', family: 'steps', heading: 'La semana' },
  ] }));
  expect(losses.some(l => /steps/.test(l) && /one/.test(l))).toBe(true);
});

it('drops a section with no family and names it', () => {
  const { plan, losses } = sep5CreativePlan(extraction({ sections: [
    { name: 'hero', family: 'hero', heading: null },
    { name: 'chalkboard', family: null, heading: '¿Qué vas a tomar?' },
    { name: 'shop', family: 'catalog', heading: null },
    { name: 'note', family: 'story', heading: null },
  ] }));
  expect(plan.sections.map(s => s.type)).not.toContain(null);
  expect(losses.some(l => l.includes('chalkboard'))).toBe(true);
});

it('pads to the three-section minimum the schema requires and says so', () => {
  const { plan, losses } = sep5CreativePlan(extraction({ sections: [{ name: 'hero', family: 'hero', heading: null }] }));
  expect(plan.sections.length).toBeGreaterThanOrEqual(3);
  expect(creativePlanSchema.safeParse(plan).success).toBe(true);
  expect(losses.some(l => /pad|minimum/i.test(l))).toBe(true);
});

it('answers a condensed Sep-5 face with a condensed display and contrasts the text face', () => {
  const { plan } = sep5CreativePlan(extraction({ displayIsSerif: false, displayIsCondensed: true }));
  expect(plan.fonts.display).toBe('oswald');
  expect(plan.fonts.text).toBe('newsreader');
  expect(plan.artDirection.style).toBe('bold-commerce');
});

it('reads art direction from signals that vary, not from serif-versus-sans', () => {
  const style = (over: Partial<Sep5Extraction>) => sep5CreativePlan(extraction(over)).plan.artDirection.style;
  // All nine benchmark stores use a serif, so these four must still differ.
  expect(style({ hardShadow: true, cornerStyle: 'soft' })).toBe('playful');
  expect(style({ hardShadow: true, cornerStyle: 'square', uppercaseCount: 21 })).toBe('retro');
  expect(style({ hardShadow: true, cornerStyle: 'square', uppercaseCount: 9 })).toBe('bold-commerce');
  expect(style({ cornerStyle: 'round', uppercaseCount: 0 })).toBe('luxury');
  expect(style({ cornerStyle: 'round', uppercaseCount: 7 })).toBe('organic');
  expect(style({ cornerStyle: 'square', uppercaseCount: 14 })).toBe('editorial');
  expect(style({ cornerStyle: 'square', uppercaseCount: 6 })).toBe('minimal');
});

it('carries the headline proportion the source chose into displayScale', () => {
  expect(sep5CreativePlan(extraction({ displayMaxRem: 4.5 })).plan.displayScale).toBeCloseTo(7.2);
  expect(sep5CreativePlan(extraction({ displayMaxRem: 3.7 })).plan.displayScale).toBeCloseTo(5.9);
  expect(sep5CreativePlan(extraction({ displayMaxRem: null })).plan.displayScale).toBe(7);
});
