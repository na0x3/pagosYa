import { relaxSourceTracking, validateSourcePresentation, adoptTrailingDesignSections, savedSourceDesign,sourceDesignExploration, SOURCE_DESIGN_CONTRACT, validateSourceDesign, validateSourceDesignImplementation , SOURCE_PRODUCT_PAGE_STYLES } from './source-design';
import { sourceDesignSchema, sourceEyebrowNote, sourceEyebrowSections, SOURCE_STOCK_PATTERNS } from './source-design';
import { validDna } from './fixtures/dna';

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
  // An intro planned before the catalog corrects a contradicting flag instead of discarding the run.
  expect(validateSourceDesign(value, 1, true).concepts[1].layout).toEqual(expect.objectContaining({ sections: ['intro', 'menu'], standaloneIntro: true }));
  value.concepts[1].layout.catalogSection = 'missing';
  expect(() => validateSourceDesign(value, 1, true)).toThrow('catalogSection');
});

it('persists a coherent story and bounded choreography for newly planned concepts', () => {
  const value = proposal() as any;
  for (const concept of value.concepts) {
    concept.layout = { sections: ['opening', 'menu', 'visit'], catalogSection: 'menu', standaloneIntro: true, productsInOpening: false };
    concept.story = { promise: 'A clear reason to visit', eyebrow: 'Hecho cerca', headline: `${concept.name} para compartir hoy`, support: 'Una propuesta breve, clara y basada en los datos del negocio.', primaryAction: 'Ver menú', beats: [
      { section: 'opening', role: 'opening', headline: 'Empieza por una pausa', media: 'hero' },
      { section: 'menu', role: 'offer', headline: 'Elige algo rico', media: 'product' },
      { section: 'visit', role: 'action', headline: 'Encuentra tu momento', media: 'none' },
    ] };
    concept.motion = { mode: 'expressive', scrollFeel: 'soft', entrance: 'stroke', scenes: [{ section: 'opening', kind: 'parallax-stack', intensity: 2 }, { section: 'visit', kind: 'text-fill', intensity: 1 }] };
  }
  const checked = validateSourceDesign(value, 1, true, true);
  expect(checked.concepts[1]).toMatchObject({ story: { primaryAction: 'Ver menú' }, motion: { scrollFeel: 'soft', scenes: expect.any(Array) } });
  expect(checked.concepts[1].motion).toMatchObject({ mode: 'expressive', entrance: 'none', scenes: [{ intensity: 2 }, { intensity: 2 }] });
  value.concepts[1].story.beats.reverse();
  expect(() => validateSourceDesign(value, 1, true, true)).toThrow('story.beats');
  value.concepts[1].story.beats.reverse(); value.concepts[1].motion.scenes.push({ section: 'menu', kind: 'sequence', intensity: 1 });
  expect(() => validateSourceDesign(value, 1, true, true)).toThrow('motion');
});

it('corrects a mislabelled catalog beat instead of discarding three finished concepts', () => {
  // Observed in production telemetry: one concept labelled its catalog beat
  // 'difference', the whole plan was rejected, and the bounded repair returned the
  // identical slip — 66 seconds of waiting for no draft.
  const value = proposal() as any;
  for (const concept of value.concepts) {
    concept.layout = { sections: ['opening', 'menu', 'visit'], catalogSection: 'menu', standaloneIntro: true, productsInOpening: false };
    concept.story = { promise: 'A clear reason to visit', eyebrow: 'Hecho cerca', headline: `${concept.name} para compartir hoy`, support: 'Una propuesta breve, clara y basada en los datos del negocio.', primaryAction: 'Ver menú', beats: [
      { section: 'opening', role: 'opening', headline: 'Empieza por una pausa', media: 'hero' },
      { section: 'menu', role: 'offer', headline: 'Elige algo rico', media: 'product' },
      { section: 'visit', role: 'action', headline: 'Encuentra tu momento', media: 'none' },
    ] };
    concept.motion = { mode: 'expressive', scrollFeel: 'soft', entrance: 'stroke', scenes: [{ section: 'opening', kind: 'parallax-stack', intensity: 2 }] };
  }
  value.concepts[1].story.beats[1].role = 'difference';
  const checked = validateSourceDesign(value, 1, true, true);
  expect(checked.concepts[1].story?.beats[1]).toMatchObject({ section: 'menu', role: 'offer' });
  // Only the catalog beat is corrected; the rest of the narrative is left as planned.
  expect(checked.concepts[1].story?.beats.map(beat => beat.role)).toEqual(['opening', 'offer', 'action']);
  // 'proof' is already a valid way to present the catalog and must survive untouched.
  value.concepts[1].story.beats[1].role = 'proof';
  expect(validateSourceDesign(value, 1, true, true).concepts[1].story?.beats[1].role).toBe('proof');
  // A story that never reaches the catalog is still a real failure. A new plan
  // cannot express that (its beats must match the layout exactly, which the rule
  // above already enforces), so this is the saved-direction path, where beats may
  // be a subset of the sections.
  for (const concept of value.concepts) concept.story.beats = [
    { section: 'opening', role: 'opening', headline: 'Empieza por una pausa', media: 'hero' },
    { section: 'visit', role: 'action', headline: 'Encuentra tu momento', media: 'none' },
  ];
  expect(() => validateSourceDesign(value, 1, true)).toThrow('catálogo');
});

it('does not count the trusted decorative entrance as a planned main content block', () => {
  const value = proposal() as any;
  for (const concept of value.concepts) concept.layout = { sections: ['opening', 'menu'], catalogSection: 'menu', standaloneIntro: true, productsInOpening: false };
  const design = validateSourceDesign(value, 1, true);
  const valid = '<main><div className="ui-entrance" aria-hidden="true"></div><section id="opening"><h1>Inicio</h1></section><section id="menu"><div data-pagosya-catalog></div></section></main>';
  expect(() => validateSourceDesignImplementation(design, [{ path: 'index.html', content: valid }])).not.toThrow();
  const untrusted = valid.replace('className="ui-entrance"', 'className="custom-overlay"');
  expect(() => validateSourceDesignImplementation(design, [{ path: 'index.html', content: untrusted }])).toThrow('(sin id)');
});

it('trims prose slightly past the limit at a sentence, and still rejects runaway text', () => {
  const value = proposal() as any;
  value.concepts[2].premise = 'Una apertura cálida con la caja naranja como protagonista. '.repeat(9) + 'Cierre.';
  const premise = validateSourceDesign(value, 1).concepts[2].premise;
  expect(premise.length).toBeLessThanOrEqual(500);
  expect(premise.endsWith('protagonista.')).toBe(true);
  value.concepts[2].premise = 'x '.repeat(1200);
  expect(() => validateSourceDesign(value, 1)).toThrow('premise');
  value.concepts[2].premise = 'ok'; value.concepts[2].name = 'N'.repeat(81);
  expect(() => validateSourceDesign(value, 1)).toThrow('name');
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
  for (const style of ['image-led', 'story-led']) {
    value.concepts[1].layout.productPage = style;
    expect(validateSourceDesign(value, 1, true).concepts[1].layout?.productPage).toBe(style);
  }
  delete value.concepts[1].layout.productPage;
  expect(validateSourceDesign(value, 1, true).concepts[1].layout).not.toHaveProperty('productPage');
  value.concepts[1].layout.productPage = 'luxury';
  expect(() => validateSourceDesign(value, 1, true)).toThrow('productPage');
  expect(SOURCE_DESIGN_CONTRACT).toContain('layout.productPage');
});

// Baseline visual defaults remain available without restricting deliberate merchant compositions.
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
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('line-height 1.5-1.8');
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('default display:body band is not a maximum');
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('Italic is optional');
  expect(SOURCE_TYPE_ROLE_DIRECTION).toContain('empty 100vh');
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
  expect(SOURCE_ACCENT_SLOTS).toEqual(['announcement bar fill', 'rating marks', 'small label text', 'selected-state ring or fill', 'primary action fill']);
  expect(SOURCE_HAIRLINES_PER_SCREEN_MAX).toBe(3);
  expect(SOURCE_MEDIA_TO_CONTROL_RADIUS).toEqual({ min: 1.2, max: 2 });
  expect(SOURCE_RHYTHM_DIRECTION).toContain('4 / 8 / 12 / 20 / 32 / 48 / 72 / 112');
  expect(SOURCE_RHYTHM_DIRECTION).toContain('at least 6x the smallest');
  expect(SOURCE_RHYTHM_DIRECTION).toContain('large colour fields');
  expect(SOURCE_RHYTHM_DIRECTION).toContain('all words and controls must remain visible');
  for (const slot of SOURCE_ACCENT_SLOTS) expect(SOURCE_RHYTHM_DIRECTION).toContain(slot);
  expect(SOURCE_RHYTHM_DIRECTION).toContain('color-mix(in srgb, var(--store-foreground) 14%, var(--store-background))');
  expect(SOURCE_RHYTHM_DIRECTION).toContain('text-wrap:balance');
  // The accent, surface and scene-first rules only work because they name the measured manifest facts.
  for (const fact of ['shot', 'productKey', 'dominant', 'backdropHex']) expect(SOURCE_RHYTHM_DIRECTION).toContain(fact);
  expect(SOURCE_RHYTHM_DIRECTION).toContain('leads with the scene');
});

it('uses real colour evidence when available and honors a brief without photos', () => {
  expect(SOURCE_RHYTHM_DIRECTION).toContain("sample the accent from a colour physically present in this merchant's own product photography");
  expect(SOURCE_RHYTHM_DIRECTION).toContain('select a palette from the brief');
  expect(SOURCE_RHYTHM_DIRECTION).toContain('Explicit merchant colours take priority');
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

it('eases an over-tight heading to the tracking floor instead of failing the store', () => {
  const files = [
    { path: 'styles/globals.css', content: '.hero-title{font-size:96px;letter-spacing:-.06em}.body{letter-spacing:-.08em}' },
    { path: 'components/home.tsx', content: '<h1 className="tracking-[-0.07em]">Hola</h1>' },
  ];
  expect(() => validateSourcePresentation(files)).toThrow('espaciado');
  const relaxed = relaxSourceTracking(files);
  expect(relaxed[0].content).toBe('.hero-title{font-size:96px;letter-spacing:-0.04em}.body{letter-spacing:-.08em}');
  expect(relaxed[1].content).toContain('tracking-[-0.04em]');
  expect(() => validateSourcePresentation(relaxed)).not.toThrow();
  expect(relaxSourceTracking(files, files)).toEqual(files);
});

describe('design DNA in concepts', () => {
  const planned = () => { const value = proposal() as any; for (const concept of value.concepts) concept.layout = { sections: ['menu'], catalogSection: 'menu', standaloneIntro: false, productsInOpening: true, productPage: 'dense' }; return value; };
  it('keeps a valid DNA and lets its product surface decide the product page', () => {
    const value = planned(); value.concepts[1].dna = validDna();
    const concept = validateSourceDesign(value, 1, true).concepts[1];
    expect(concept.dna).toEqual(validDna());
    expect(concept.layout?.productPage).toBe('story-led');
  });
  it('repairs an invalid DNA in code, reports it, and keeps the planned product page when the DNA product was defaulted', () => {
    const value = planned(); value.concepts[1].dna = { ...validDna(), buttons: { form: 'sparkle', hover: 'lift', press: 'pop' }, surfaces: { ...validDna().surfaces, product: 'luxury' } };
    const repairs: string[] = [];
    const concept = validateSourceDesign(value, 1, true, false, { seed: 'store-1', repairs }).concepts[1];
    expect(concept.dna!.buttons.form).not.toBe('sparkle');
    expect(concept.dna!.surfaces.product).toBe('dense');
    expect(concept.layout?.productPage).toBe('dense');
    expect(repairs.filter(repair => repair.startsWith('concepts[1]'))).toEqual([expect.stringContaining('concepts[1].dna.buttons.form'), expect.stringContaining('concepts[1].dna.surfaces.product')]);
  });
  it('gives every planned concept a DNA, and leaves a saved design without one untouched', () => {
    expect(validateSourceDesign(planned(), 1, true).concepts.every(concept => concept.dna)).toBe(true);
    expect(validateSourceDesign(proposal(), 1).concepts.some(concept => 'dna' in concept)).toBe(false);
    expect(SOURCE_PRODUCT_PAGE_STYLES).toEqual(['editorial', 'dense', 'image-led', 'story-led']);
  });
});

describe('no stock patterns by default', () => {
  const planned = () => {
    const value = proposal() as any;
    for (const concept of value.concepts) {
      concept.layout = { sections: ['opening', 'menu'], catalogSection: 'menu', standaloneIntro: true, productsInOpening: false };
      concept.story = { promise: 'A clear reason to visit', eyebrow: '', headline: `${concept.name} para compartir hoy`, support: 'Una propuesta breve y clara.', primaryAction: 'Ver menú', beats: [
        { section: 'opening', role: 'opening', headline: 'Empieza por una pausa', media: 'hero' },
        { section: 'menu', role: 'offer', headline: 'Elige algo rico', media: 'product' },
      ] };
      concept.motion = { mode: 'subtle', scrollFeel: 'soft', entrance: 'none', scenes: [] };
    }
    return value;
  };

  it('accepts an empty eyebrow in the schema and the validator, and keeps it empty', () => {
    const story = (sourceDesignSchema.properties.concepts.items.properties as any).story;
    expect(story.required).toContain('eyebrow');
    expect(story.properties.eyebrow.minLength).toBe(0);
    const checked = validateSourceDesign(planned(), 1, true, true);
    expect(checked.concepts[1].story?.eyebrow).toBe('');
    const missing = planned(); delete missing.concepts[1].story.eyebrow;
    expect(validateSourceDesign(missing, 1, true, true).concepts[1].story?.eyebrow).toBe('');
    const long = planned(); long.concepts[1].story.eyebrow = 'x'.repeat(41);
    expect(() => validateSourceDesign(long, 1, true, true)).toThrow('story');
  });

  it('stops asking for an eyebrow and names the stock patterns to avoid', () => {
    expect(SOURCE_DESIGN_CONTRACT).not.toMatch(/opening eyebrow/);
    for (const pattern of ['uppercase eyebrow above every heading', 'centred hero with two buttons', 'three icon-and-text columns', 'Why choose us', 'testimonial carousel without real reviews']) {
      expect(SOURCE_STOCK_PATTERNS).toContain(pattern);
    }
    expect(SOURCE_DESIGN_CONTRACT).toContain(SOURCE_STOCK_PATTERNS);
    expect(SOURCE_TYPE_ROLE_DIRECTION).not.toMatch(/label: eyebrows/);
  });
});

describe('soft eyebrow counter', () => {
  const css = '.kicker-ish{font-size:12px;text-transform:uppercase;letter-spacing:.14em} .tag{text-transform:uppercase} .note{letter-spacing:0.2em;text-transform:uppercase;font-size:2rem}';
  const html = `<main>
    <section id="a"><p class="kicker-ish">Desde 1998</p><h2>Pan de masa madre</h2></section>
    <section id="b"><span class="section-eyebrow">Hecho aquí</span><h2>Nuestro horno</h2></section>
    <section id="c"><h2>Visítanos</h2><p class="kicker-ish">Abierto hoy</p></section>
    <section id="d"><p class="tag">Nuevo</p><h3>Sin tracking</h3></section>
    <section id="e"><p class="note">Grande</p><h2>Demasiado grande para ser eyebrow</h2></section>
  </main>`;
  const tsx = 'export default function Home(){return <main><section id="x"><Eyebrow>Temporada</Eyebrow><Heading>Hola</Heading></section><section id="y"><Hero eyebrow="Recién hecho" title="Pan"/></section></main>}';

  it('counts sections whose heading is preceded by an eyebrow-like label', () => {
    expect(sourceEyebrowSections([{ path: 'styles.css', content: css }, { path: 'index.html', content: html }])).toBe(2);
    expect(sourceEyebrowSections([{ path: 'components/home.tsx', content: tsx }])).toBe(2);
    expect(sourceEyebrowSections([{ path: 'styles.css', content: css }, { path: 'index.html', content: html }, { path: 'components/home.tsx', content: tsx }])).toBe(4);
  });

  it('adds guidance only above two sections, and never throws', () => {
    expect(sourceEyebrowNote([{ path: 'styles.css', content: css }, { path: 'index.html', content: html }])).toBeNull();
    const note = sourceEyebrowNote([{ path: 'styles.css', content: css }, { path: 'index.html', content: html }, { path: 'components/home.tsx', content: tsx }]);
    expect(note).toContain('4 sections');
    for (const broken of ['<section><h2', '<section class="', '{{{', '.a{text-transform:uppercase;letter-spacing:', '']) {
      expect(() => sourceEyebrowNote([{ path: 'styles.css', content: broken }, { path: 'index.html', content: broken }])).not.toThrow();
    }
    expect(sourceEyebrowNote([{ path: 'assets/x.png', content: 'AAAA', encoding: 'base64' }])).toBeNull();
  });
});
