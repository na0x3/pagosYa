import { drawPresetChoices } from './source-preset-choices';

// Spec 2026-11-10 Merienda: one template style, a different font, title slant, photo treatment and section looks per store.
describe('drawPresetChoices', () => {
  const preset = {
    palette: 'mono', fonts: 'merienda-archivo', variants: { theme: 'merienda', photos: 'sticker', titles: 'slant' },
    layout: [{ type: 'cover-mega', look: 'side' }, { type: 'products-rows', look: 'alternate' }, { type: 'faq-split', look: 'lines' }],
    choices: { fonts: ['merienda-archivo', 'merienda-bowlby', 'merienda-titan', 'merienda-rubik', 'merienda-unbounded'],
      variants: { photos: ['sticker', 'blend', 'round'], titles: ['slant', 'upper'] },
      looks: { 'cover-mega': ['side', 'stack', 'tilt'], 'products-rows': ['alternate', 'cards', 'stack'] } },
  };

  it('picks the same parts for the same store every time', () => {
    expect(drawPresetChoices(preset, 'store-a')).toEqual(drawPresetChoices(preset, 'store-a'));
  });

  it('only picks values from each list and leaves sections without choices alone', () => {
    const drawn = drawPresetChoices(preset, 'store-b');
    expect(preset.choices.fonts).toContain(drawn.fonts);
    expect(preset.choices.variants.photos).toContain(drawn.variants.photos);
    expect(preset.choices.variants.titles).toContain(drawn.variants.titles);
    expect(drawn.variants.theme).toBe('merienda');
    expect(preset.choices.looks['cover-mega']).toContain(drawn.layout![0].look);
    expect(drawn.layout![2]).toEqual({ type: 'faq-split', look: 'lines' });
    expect(preset.layout[0].look).toBe('side');
  });

  it('gives different stores different combinations', () => {
    const seen = new Set(Array.from({ length: 30 }, (_, at) => { const d = drawPresetChoices(preset, `store-${at}`); return [d.fonts, d.variants.photos, d.variants.titles, d.layout![0].look, d.layout![1].look].join('/'); }));
    expect(seen.size).toBeGreaterThan(20);
    const fonts = new Set(Array.from({ length: 30 }, (_, at) => drawPresetChoices(preset, `store-${at}`).fonts));
    expect(fonts.size).toBe(5);
  });

  it('alternates the looks of a section used more than once', () => {
    const twice = { ...preset, layout: [{ type: 'block-split', look: '' }, { type: 'faq-split', look: '' }, { type: 'block-split', look: '' }, { type: 'block-split', look: '' }], choices: { looks: { 'block-split': ['left', 'right'] } } };
    const looks = drawPresetChoices(twice, 'store-a').layout!.filter(block => block.type === 'block-split').map(block => block.look);
    expect(looks[0]).not.toBe(looks[1]);
    expect(looks[0]).toBe(looks[2]);
  });

  // Owner 2026-11-10 («i dont see many templates of the 4 its always the same»): stores of one style also differ in their cover,
  // the order of their sections and where the colour bands fall.
  it('draws a section order, a cover and colour bands per store, all from the lists', () => {
    const style = { palette: 'mono', fonts: 'a', variants: { theme: 'oliva' },
      layout: [{ type: 'cover-full', look: '' }, { type: 'story-split', look: '' }, { type: 'faq-split', look: '' }, { type: 'closing-wordmark', look: '' }],
      choices: { swaps: { 'cover-full': ['cover-full', 'cover-centered', 'cover-split'] }, orders: [[0, 1, 2, 3], [0, 2, 1, 3]], bands: [{} as Record<string, string>, { '1': 'muted' }] } };
    const drawn = Array.from({ length: 40 }, (_, at) => drawPresetChoices(style, `store-${at}`).layout!);
    expect(new Set(drawn.map(layout => layout[0].type))).toEqual(new Set(['cover-full', 'cover-centered', 'cover-split']));
    expect(new Set(drawn.map(layout => layout.map(block => block.type).slice(1).join(',')))).toEqual(new Set(['story-split,faq-split,closing-wordmark', 'faq-split,story-split,closing-wordmark']));
    expect(drawn.some(layout => (layout[1] as { band?: string }).band === 'muted')).toBe(true);
    for (const layout of drawn) expect(layout.at(-1)!.type).toBe('closing-wordmark');
  });

  it('ignores an order that is not the whole page once', () => {
    const style = { palette: 'mono', fonts: 'a', variants: {}, layout: [{ type: 'a', look: '' }, { type: 'b', look: '' }], choices: { orders: [[0, 0]] } };
    expect(drawPresetChoices(style, 'store-a').layout!.map(block => block.type)).toEqual(['a', 'b']);
  });

  it('returns a preset without choices as it is', () => {
    const plain = { palette: 'mono', fonts: 'classic', variants: { theme: 'botica' } };
    expect(drawPresetChoices(plain, 'store-a')).toBe(plain);
  });
});
