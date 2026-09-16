import { adoptTrailingDesignSections, savedSourceDesign,sourceDesignExploration, SOURCE_DESIGN_CONTRACT, validateSourceDesign, validateSourceDesignImplementation } from './source-design';

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

it('adopts extra blocks after the planned sequence (e.g. requested tabs) but never before or between it', () => {
  const value = proposal() as any;
  value.concepts[1].layout = { sections: ['hero', 'menu'], catalogSection: 'menu', standaloneIntro: true, productsInOpening: false };
  const menu = '<section id="menu"><div data-pagosya-catalog></div></section>';
  const adopted = adoptTrailingDesignSections(value, `<main><section id="hero">Hi</section>${menu}<section id="residences"></section><section id="aviation"></section></main>`);
  expect(adopted.concepts[1].layout!.sections).toEqual(['hero', 'menu', 'residences', 'aviation']);
  expect(value.concepts[1].layout.sections).toEqual(['hero', 'menu']);
  for (const html of [`<main><section id="intro"></section><section id="hero"></section>${menu}</main>`, `<main><section id="hero"></section><section id="x"></section>${menu}</main>`, `<main><section id="hero"></section>${menu}<section id="menu"></section></main>`]) {
    expect(adoptTrailingDesignSections(value, html)).toBe(value);
  }
});

it('leaves composition to the concept while keeping navigation and purchasing usable', () => {
  expect(SOURCE_DESIGN_CONTRACT).not.toContain('one dominant filled CTA');
  expect(SOURCE_DESIGN_CONTRACT).not.toContain('at most two secondary destinations');
  expect(SOURCE_DESIGN_CONTRACT).toContain('Navigation uses real anchors and state changes use buttons');
  expect(SOURCE_DESIGN_CONTRACT).toContain('Keep purchasing accessible');
});

it('keeps the chosen product page style and rejects unknown styles', () => {
  const value = proposal() as any;
  for (const concept of value.concepts) concept.layout = { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true, productPage: 'dense' };
  expect(validateSourceDesign(value, 1, true).concepts[1].layout?.productPage).toBe('dense');
  delete value.concepts[1].layout.productPage;
  expect(validateSourceDesign(value, 1, true).concepts[1].layout).not.toHaveProperty('productPage');
  value.concepts[1].layout.productPage = 'luxury';
  expect(() => validateSourceDesign(value, 1, true)).toThrow('productPage');
  expect(SOURCE_DESIGN_CONTRACT).toContain('layout.productPage');
});

// docs/STOREFRONT_DESIGN_LEVEL_UP.md §3-§4. These are the numbers the quality bar is made of; a
// later prompt edit must not be able to widen a band, drop a role or grow the accent budget.
import { SOURCE_ACCENT_SLOTS, SOURCE_BODY_MEASURE_CH, SOURCE_CARD_AND_MASTHEAD_DIRECTION, SOURCE_CREATIVE_DIRECTION, SOURCE_DISPLAY_BODY_RATIO, SOURCE_GAP_CONTRAST_MIN, SOURCE_HAIRLINES_PER_SCREEN_MAX, SOURCE_INK_LADDER, SOURCE_MEDIA_TO_CONTROL_RADIUS, SOURCE_RHYTHM_DIRECTION, SOURCE_SPACING_SCALE, SOURCE_SPACING_SCALE_FACTOR, SOURCE_TYPE_ROLE_DIRECTION, SOURCE_TYPE_ROLES } from './source-design';

it('pins the five type roles, the display:body band and the ink opacity ladder', () => {
  expect(SOURCE_TYPE_ROLES).toEqual(['display', 'subhead', 'body', 'label', 'numeric']);
  expect(SOURCE_DISPLAY_BODY_RATIO).toEqual({ min: 2.6, max: 3.2 });
  expect(SOURCE_INK_LADDER).toEqual([100, 85, 70, 55, 40]);
  expect(SOURCE_BODY_MEASURE_CH).toEqual({ min: 46, max: 62 });
  for (const role of SOURCE_TYPE_ROLES) expect(SOURCE_TYPE_ROLE_DIRECTION).toContain(`\n- ${role}:`);
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('titles at 2.6-3.2x body');
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('100% / 85% / 70% / 55% / 40%');
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('max-width 46-62ch');
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('price 1.0-1.3x body in editorial concepts and 1.8-2.2x in dense ones');
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('italic');
  // Contrast is bought with size, measure and colour, never with weight.
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('at most two weights per family');
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('line-height 1.7-1.8');
});

it('pins one eight-step spacing scale with a real gap contrast and a five-slot accent budget', () => {
  expect(SOURCE_SPACING_SCALE).toEqual([4, 8, 12, 20, 32, 48, 72, 112]);
  expect(SOURCE_SPACING_SCALE).toHaveLength(8);
  for (let index = 1; index < SOURCE_SPACING_SCALE.length; index++) {
    expect(SOURCE_SPACING_SCALE[index] / SOURCE_SPACING_SCALE[index - 1]).toBeGreaterThanOrEqual(1.4);
  }
  // The scale itself must be able to deliver the promised contrast between the biggest and smallest gap.
  expect(SOURCE_SPACING_SCALE.at(-1)! / SOURCE_SPACING_SCALE[0]).toBeGreaterThanOrEqual(SOURCE_GAP_CONTRAST_MIN);
  expect(SOURCE_GAP_CONTRAST_MIN).toBe(6);
  expect(SOURCE_SPACING_SCALE_FACTOR).toEqual({ min: 0.85, max: 1.25 });
  expect(SOURCE_ACCENT_SLOTS).toHaveLength(5);
  expect(SOURCE_ACCENT_SLOTS).toEqual(['announcement bar fill', 'rating marks', 'eyebrow text', 'selected-state ring or fill', 'primary action fill']);
  expect(SOURCE_HAIRLINES_PER_SCREEN_MAX).toBe(3);
  expect(SOURCE_MEDIA_TO_CONTROL_RADIUS).toEqual({ min: 1.2, max: 2 });
  expect(SOURCE_RHYTHM_DIRECTION).toContain('4 / 8 / 12 / 20 / 32 / 48 / 72 / 112');
  expect(SOURCE_RHYTHM_DIRECTION).toContain('at least 6x the smallest');
  expect(SOURCE_RHYTHM_DIRECTION).toContain('exactly one accent, in at most 5 places per page');
  for (const slot of SOURCE_ACCENT_SLOTS) expect(SOURCE_RHYTHM_DIRECTION).toContain(slot);
  expect(SOURCE_RHYTHM_DIRECTION).toContain('color-mix(in srgb, var(--store-foreground) 14%, var(--store-background))');
  expect(SOURCE_RHYTHM_DIRECTION).toContain('text-wrap:balance');
});

it('derives the accent from the merchant’s own goods and never from a generic palette', () => {
  expect(SOURCE_RHYTHM_DIRECTION).toContain("sample the accent from a colour physically present in this merchant's own product photography");
  expect(SOURCE_RHYTHM_DIRECTION).toContain('never from a generic palette');
});

it('carries the type, rhythm, card and masthead rules into the prompts that reach the model', () => {
  expect(SOURCE_CREATIVE_DIRECTION).toContain(SOURCE_TYPE_ROLE_DIRECTION);
  expect(SOURCE_CREATIVE_DIRECTION).toContain(SOURCE_RHYTHM_DIRECTION);
  expect(SOURCE_DESIGN_CONTRACT).toContain(SOURCE_CARD_AND_MASTHEAD_DIRECTION);
  expect(SOURCE_CARD_AND_MASTHEAD_DIRECTION).toContain('one image aspect ratio');
  // §8.2 lockup, and the honesty rule that keeps it from being invented.
  expect(SOURCE_CARD_AND_MASTHEAD_DIRECTION).toContain('wordmark plus one second line at the label role');
  expect(SOURCE_CARD_AND_MASTHEAD_DIRECTION).toContain('four to six navigation entries');
  expect(SOURCE_CARD_AND_MASTHEAD_DIRECTION).toContain('cart count badge');
  expect(SOURCE_CARD_AND_MASTHEAD_DIRECTION).toContain('Never invent a tagline');
});
