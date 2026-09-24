import { SOURCE_COMPOSITION_FAMILIES, SOURCE_COMPOSITION_PLANNING, sourceUiCompositions, sourceUiCompositionRecipe } from './source-composition-registry';

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
    expect(firstDirections.size).toBe(3);
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
