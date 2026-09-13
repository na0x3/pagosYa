import { savedSourceDesign, sourceDesignExploration, SOURCE_DESIGN_CONTRACT, validateSourceDesign, validateSourceDesignImplementation } from './source-design';

const proposal = () => ({ selected: 1, concepts: ['Market', 'Workshop', 'Object'].map(name => ({
  name, premise: 'Handmade ceramics from La Paz', opening: name + ' opening', flow: name + ' flow',
  typography: 'System type', imagery: 'Use assets/bowl.webp', mobile: 'Preserve the featured bowl',
})) });

it('validates the sampled direction and only persists its documented fields', () => {
  const value = { ...proposal(), extra: 'untrusted' };
  expect(validateSourceDesign(value, 1)).toEqual(proposal());
  expect(() => validateSourceDesign(value, 0)).toThrow('tres composiciones');
  expect(sourceDesignExploration(2).selected).toBe(2);
});
it('rejects missing, duplicated and incomplete proposals before saving', () => {
  for (const value of [null, { ...proposal(), selected: 3 }, { ...proposal(), concepts: [proposal().concepts[0]] }]) {
    expect(() => validateSourceDesign(value)).toThrow();
  }
  const copied = proposal(); copied.concepts[1].opening = '  MARKET   opening ';
  expect(() => validateSourceDesign(copied)).toThrow();
  const incomplete = proposal(); incomplete.concepts[2].mobile = '';
  expect(() => validateSourceDesign(incomplete)).toThrow();
});
it('recovers saved direction without making legacy or malformed projects unreadable', () => {
  expect(savedSourceDesign([{ path: 'design-direction.json', content: JSON.stringify(proposal()) }])).toEqual(proposal());
  expect(savedSourceDesign([{ path: 'design-direction.json', content: '{broken' }])).toBeNull();
  expect(savedSourceDesign()).toBeNull();
});

it('requires executable layout commitments for new concepts while retaining legacy directions', () => {
  expect(() => validateSourceDesign(proposal(), 1, true)).toThrow();
  const value = proposal() as any;
  for (const concept of value.concepts) concept.layout = { sections: ['menu', 'visit'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true };
  expect(validateSourceDesign(value, 1, true).concepts[1].layout?.sections).toEqual(['menu', 'visit']);
  value.concepts[1].layout.sections = ['intro', 'menu'];
  expect(() => validateSourceDesign(value, 1, true)).toThrow();
});

it('rejects a catalog-first plan implemented as an extra hero, reordered sections or inert catalog', () => {
  const value = proposal() as any;
  value.concepts[1].layout = { sections: ['menu', 'visit'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true };
  const check = (html: string) => validateSourceDesignImplementation(value, [{ path: 'index.html', content: html }]);
  const menu = '<section id="menu"><div data-pagosya-catalog></div></section>', visit = '<aside id="visit">Visit</aside>';
  expect(() => check(`<main>${menu}${visit}<div data-pagosya-contact hidden></div></main>`)).not.toThrow();
  for (const html of [`<main><section id="hero">Hero</section>${menu}${visit}</main>`, `<main>${visit}${menu}</main>`, `<main>${menu.replace('<div data-pagosya-catalog></div>', '<template><div data-pagosya-catalog></div></template>')}${visit}</main>`]) expect(() => check(html)).toThrow('diseño elegido');
});

it('leaves composition to the concept while keeping navigation and purchasing usable', () => {
  expect(SOURCE_DESIGN_CONTRACT).not.toContain('one dominant filled CTA');
  expect(SOURCE_DESIGN_CONTRACT).not.toContain('at most two secondary destinations');
  expect(SOURCE_DESIGN_CONTRACT).toContain('Navigation uses real anchors and state changes use buttons');
  expect(SOURCE_DESIGN_CONTRACT).toContain('Keep purchasing accessible');
});
