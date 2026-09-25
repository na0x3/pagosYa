import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_COMPOSITION_FAMILIES, SOURCE_COMPOSITION_PLANNING, sourceUiCompositions, sourceUiCompositionRecipe } from './source-composition-registry';

import { SOURCE_DNA_ENUMS } from './source-dna';
import { SOURCE_FONT_CATALOG } from './source-font-catalog';

const photos = (count: number) => Array.from({ length: count }, () => ({ kind: 'image', role: 'product' }));

describe('composition selection', () => {
  it('supplies a bounded, self-contained recipe without inventing media for photo-free directions', () => {
    const composition = sourceUiCompositions({ brief: 'Café', assets: [] })[0];
    const recipe = sourceUiCompositionRecipe(composition);
    expect(recipe).toContain('<Hero variant="typographic"');
    expect(recipe).not.toContain('image={approvedHero}');
    expect(recipe).toContain('<Catalog');
    expect(recipe).toContain('chosen concept overrides');
    expect(recipe.length).toBeLessThan(2700);
  });
  it.each([
    ['Cafetería con café de especialidad', 'cafe-expressive'],
    ['An expressive coffee shop', 'cafe-expressive'],
    ['Cosmética y cuidado de la piel', 'beauty-editorial'],
    ['An editorial skincare brand', 'beauty-editorial'],
    ['Muebles y objetos para interiores', 'product-cinematic'],
    ['Hardware parts catalog', 'catalog-practical'],
  ])('fits the brief %s', (brief, family) => {
    expect(sourceUiCompositions({ brief, assets: photos(3), catalogItemCount: 6 })[0].family).toBe(family);
  });

  it('does not count logos, references, unused media or videos as usable product/scene photographs', () => {
    const suggestions = sourceUiCompositions({ brief: 'Café', assets: [
      { kind: 'image', role: 'logo' }, { kind: 'image', role: 'reference' },
      { kind: 'image', role: 'unused' }, { kind: 'video', role: 'business' }, { kind: 'icon' },
    ] });
    expect(suggestions[0].direction).toBe('Counter poster');
    expect(suggestions).toHaveLength(3);
    for (const suggestion of suggestions) {
      const definition = SOURCE_COMPOSITION_FAMILIES.find(family => family.id === suggestion.family)!.directions.find(direction => direction.direction === suggestion.direction)!;
      expect(definition.minImages).toBe(0);
      expect(suggestion.hero).toBe('typographic');
    }
  });

  it('offers three complete, different directions and reproduces a run from its seed', () => {
    const input = { seed: 'store:1:brief', brief: 'Cosmética', assets: photos(3) };
    const suggestions = sourceUiCompositions(input);
    expect(suggestions).toEqual(sourceUiCompositions(input));
    expect(new Set(suggestions.map(s => s.direction)).size).toBe(3);
    expect(new Set(suggestions.map(s => s.hero)).size).toBe(3);
    expect(suggestions.every(s => s.family === 'beauty-editorial')).toBe(true);
    const firstDirections = new Set(Array.from({ length: 20 }, (_, seed) => sourceUiCompositions({ ...input, seed: String(seed) })[0].direction));
    const reachable = SOURCE_COMPOSITION_FAMILIES.find(family => family.id === 'beauty-editorial')!.directions.filter(direction => direction.minImages <= 3).length;
    expect(firstDirections.size).toBe(reachable);
  });

  it('keeps large catalogs discoverable instead of forcing a cinematic rail', () => {
    const suggestions = sourceUiCompositions({ brief: 'Furniture', catalogItemCount: 80, assets: photos(3) });
    expect(suggestions[0].family).toBe('catalog-practical');
    expect(suggestions.every(s => ['grid', 'editorial'].includes(s.catalog))).toBe(true);
  });

  it('links authored examples and keeps merchant decisions/custom composition authoritative', () => {
    expect(SOURCE_COMPOSITION_FAMILIES.filter(f => f.referenceExample).map(f => f.id)).toEqual(['cafe-expressive', 'beauty-editorial', 'product-cinematic']);
    expect(SOURCE_COMPOSITION_PLANNING).toContain('Merchant instructions, confirmed typography/colors and actual image roles override every candidate');
    expect(SOURCE_COMPOSITION_PLANNING).toContain('custom composition');
    expect(SOURCE_COMPOSITION_PLANNING).toContain('Keep all unrelated composition and tokens on later local edits');
  });
});

describe('story handedness', () => {
  /** Every recipe used to emit the same FeatureSplit, so every store's story
   * section put the photo on the same side. The side must vary by direction. */
  const splits = SOURCE_COMPOSITION_FAMILIES.flatMap(family => family.directions
    .map(direction => sourceUiCompositionRecipe({ ...direction, family: family.id, direction: direction.direction })))
    .filter(recipe => recipe.includes('<FeatureSplit'));

  it('does not give every direction the same handedness', () => {
    expect(splits.length).toBeGreaterThan(2);
    const mirrored = splits.filter(recipe => /<FeatureSplit[^>]*\breverse\b/.test(recipe));
    expect(mirrored.length).toBeGreaterThan(0);
    expect(mirrored.length).toBeLessThan(splits.length);
  });

  it('asks for alternation when one page carries more than one', () => {
    for (const recipe of splits) expect(recipe).toMatch(/alternate the side/i);
  });

  it('keeps the same direction on the same side every time it is built', () => {
    const composition = sourceUiCompositions({ brief: 'Muebles y objetos para interiores', assets: [{ kind: 'image', role: 'product' }, { kind: 'image', role: 'product' }], catalogItemCount: 6 })
      .find(candidate => !['typographic', 'fullbleed'].includes(candidate.hero))!;
    expect(sourceUiCompositionRecipe(composition)).toBe(sourceUiCompositionRecipe(composition));
  });
});

/**
 * The kit ships scroll scenes that no direction ever asked for: the recipe — the
 * one piece of the prompt a model reliably copies — handed every direction the
 * same Hero/Catalog/FeatureSplit page. These lock the wiring in place.
 */
describe('signature scenes reach the recipe', () => {
  const kit = readFileSync(kitPath('ui.tsx'), 'utf8');
  const exported = new Set([...kit.matchAll(/^export function ([A-Z]\w+)/gm)].map(match => match[1]));
  const every = SOURCE_COMPOSITION_FAMILIES.flatMap(family => family.directions
    .map(direction => ({ family: family.id, direction, recipe: sourceUiCompositionRecipe({ ...direction, family: family.id, direction: direction.direction }) })));

  it('gives every direction a declared scene', () => {
    for (const { direction } of every) expect(direction.scene).toBeTruthy();
  });

  it('renders the declared scene instead of collapsing to one story shape', () => {
    const stories = new Set(every.map(({ recipe }) => recipe.match(/<section id="story">(<[A-Za-z]+)/)![1]));
    expect(stories.size).toBeGreaterThanOrEqual(6);
    const scrub = every.find(({ direction }) => direction.scene === 'scrub-media')!;
    expect(scrub.recipe).toContain('<ScrollScrubHero poster=');
    expect(every.find(({ direction }) => direction.scene === 'parallax-stack')!.recipe).toContain('<ParallaxStack images=');
    expect(every.find(({ direction }) => direction.scene === 'text-fill')!.recipe).toContain('<TextFillStatement>');
  });

  it('only ever names components the kit actually exports', () => {
    for (const { recipe } of every) {
      const imported = recipe.match(/^import \{([^}]+)\}/m)![1].split(',');
      for (const name of imported) expect(exported.has(name.trim()) || name.trim() === 'StoreTheme').toBe(true);
      // Anything used in the JSX must have been imported, or the example does not compile.
      for (const used of new Set([...recipe.matchAll(/<([A-Z]\w+)/g)].map(match => match[1]))) {
        expect(imported.map(name => name.trim())).toContain(used);
      }
    }
  });

  /**
   * The failure this whole set exists to prevent: a scene is built in the kit,
   * styled, given a reduced-motion path — and then no direction ever selects it,
   * so no merchant ever sees it. A new scroll component must arrive with a
   * direction that asks for it.
   */
  it('leaves no scroll scene in the kit unreachable', () => {
    const scenes = new Set(SOURCE_COMPOSITION_FAMILIES.flatMap(family => family.directions.map(direction => direction.scene)));
    const reachable = new Set(every.flatMap(({ recipe }) => [...recipe.matchAll(/<([A-Z]\w+)/g)].map(match => match[1])));
    for (const component of ['ScrollScrubHero', 'ParallaxStack', 'ProductShowcase', 'StoryChapters', 'FloatingMedia',
      'Gallery', 'Marquee', 'TextFillStatement', 'SectionSequence', 'BeforeAfter', 'VideoHero', 'FeatureSplit']) {
      expect(exported.has(component)).toBe(true);
      expect([...reachable]).toContain(component);
    }
    expect(scenes.size).toBeGreaterThanOrEqual(10);
  });

  it('exercises the catalog layouts, cards and effects the kit styles', () => {
    const all = SOURCE_COMPOSITION_FAMILIES.flatMap(family => family.directions);
    // Each of these was implemented and styled in ui.tsx but selected by nobody.
    for (const layout of ['rail', 'masonry']) expect(all.some(direction => direction.catalog === layout)).toBe(true);
    for (const card of ['classic', 'overlay']) expect(all.some(direction => direction.card === card)).toBe(true);
    for (const fx of ['grow', 'zoom', 'grow zoom', 'reveal zoom', 'reveal lift']) expect(all.some(direction => direction.fx === fx)).toBe(true);
    expect(all.filter(direction => direction.fx === 'none').length).toBeLessThan(all.length * 0.7);
  });
});

describe('no stock eyebrow in the examples a model copies', () => {
  it('never hands a recipe an eyebrow prop', () => {
    for (const family of SOURCE_COMPOSITION_FAMILIES) for (const direction of family.directions) {
      expect(sourceUiCompositionRecipe({ ...direction, family: family.id, direction: direction.direction })).not.toMatch(/eyebrow/i);
    }
  });
});

describe('grammar-aligned families', () => {
  const byId = (id: string) => SOURCE_COMPOSITION_FAMILIES.find(family => family.id === id)!;
  const fields = ['direction', 'minImages', 'scene', 'header', 'hero', 'catalog', 'card', 'fx', 'signature', 'footer', 'radius', 'rhythm', 'typography', 'mobile', 'assetPlan', 'sections'] as const;

  it('adds five families beyond the original four, each with 3–4 complete directions', () => {
    expect(SOURCE_COMPOSITION_FAMILIES.length).toBeGreaterThanOrEqual(9);
    for (const id of ['poster-loud', 'magazine-spread', 'collage-cutout', 'brutalist-raw', 'index-archive']) {
      const family = byId(id);
      expect(family.directions.length).toBeGreaterThanOrEqual(3);
      expect(family.directions.length).toBeLessThanOrEqual(4);
      for (const direction of family.directions) for (const field of fields) expect(direction[field]).toBeDefined();
      expect(family.directions.some(direction => direction.minImages === 0)).toBe(true);
    }
  });

  it('serves every DNA layout grammar with at least one family', () => {
    for (const grammar of SOURCE_DNA_ENUMS.layout.grammar) expect(SOURCE_COMPOSITION_FAMILIES.some(family => family.grammars.includes(grammar))).toBe(true);
    for (const family of SOURCE_COMPOSITION_FAMILIES) for (const grammar of family.grammars) expect(SOURCE_DNA_ENUMS.layout.grammar).toContain(grammar);
  });

  it("prefers families that match the chosen concept's grammar", () => {
    const input = { seed: 'store:9', brief: 'Tienda de barrio', assets: photos(3), catalogItemCount: 6 };
    expect(sourceUiCompositions(input)[0].family).not.toBe('brutalist-raw');
    expect(sourceUiCompositions({ ...input, grammar: 'brutalist' })[0].family).toBe('brutalist-raw');
    expect(sourceUiCompositions({ ...input, grammar: 'magazine' })[0].family).toBe('magazine-spread');
    expect(sourceUiCompositions({ ...input, grammar: 'collage' }).every(s => s.family === 'collage-cutout')).toBe(true);
    // An unknown grammar is ignored rather than trusted.
    expect(sourceUiCompositions({ ...input, grammar: 'nonsense' })).toEqual(sourceUiCompositions(input));
  });

  it('never hands a neutral brief a domain-bound family through the grammar alone', () => {
    const domainBound = ['cafe-expressive', 'beauty-editorial'];
    for (const brief of ['Tienda de relojes y accesorios', 'Tienda de barrio']) for (const grammar of SOURCE_DNA_ENUMS.layout.grammar) {
      const picked = sourceUiCompositions({ seed: 'store:4', brief, grammar, assets: photos(3), catalogItemCount: 6 });
      for (const suggestion of picked) expect(domainBound).not.toContain(suggestion.family);
    }
  });

  it('still lets a matching brief and grammar pick the domain-bound family', () => {
    const cafe = { seed: 'store:4', assets: photos(3), catalogItemCount: 6 };
    expect(sourceUiCompositions({ ...cafe, brief: 'Cafeteria de especialidad', grammar: 'poster' })[0].family).toBe('cafe-expressive');
    expect(sourceUiCompositions({ ...cafe, brief: 'Skincare y maquillaje', grammar: 'editorial' })[0].family).toBe('beauty-editorial');
  });

  it('picks the new families from the brief alone when it fits them', () => {
    expect(sourceUiCompositions({ brief: 'Tienda de discos y vinilos', assets: photos(3), catalogItemCount: 6 })[0].family).toBe('poster-loud');
    expect(sourceUiCompositions({ brief: 'Ropa vintage y antigüedades', assets: photos(3), catalogItemCount: 6 })[0].family).toBe('index-archive');
  });

  it('names only catalogued fonts in the new directions', () => {
    const families = SOURCE_FONT_CATALOG.map(font => font.family).sort((a, b) => b.length - a.length);
    for (const id of ['poster-loud', 'magazine-spread', 'collage-cutout', 'brutalist-raw', 'index-archive']) for (const direction of byId(id).directions) {
      const named = direction.typography!.split(/\s*\/\s*/).map(part => part.replace(/\s+(display|text)$/, ''));
      for (const name of named) expect(families).toContain(name);
    }
  });
});
