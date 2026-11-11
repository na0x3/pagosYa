import { applyComposerChanges, commonOrder, composerCheck, composerTemplate, homeSummary, lookOptions, tooClose, type SectionFit } from './source-composer';
import { composerAnswerSchema, composerCatalogue, composerPrompt, composerReviewText, readComposerReview } from './source-composer';
import type { LayoutBlock } from './source-section-library';

const data: SectionFit = {
  fit: { merienda: ['story-split', 'benefits-bento', 'reviews-cards', 'promo-banner', 'faq-split', 'closing-photo', 'statement-sticker'] },
  signature: { merienda: ['cover-mega', 'products-rows'] },
  vetoed: { merienda: ['reviews-cards'] },
};
const preset = {
  layout: [{ type: 'cover-mega', look: 'side' }, { type: 'products-rows', look: 'alternate' }, { type: 'names-list', look: 'light' }, { type: 'faq-split', look: 'lines' }, { type: 'wave-divider' }, { type: 'closing-wordmark' }] as LayoutBlock[],
  choices: { looks: { 'cover-mega': ['side', 'stack', 'tilt'] } },
};
const T = composerTemplate('merienda', 'Merienda', preset, data)!;
const home = (types: string[], cover = 'cover-mega', look = 'side'): LayoutBlock[] => [{ type: cover, look }, ...types.map(type => ({ type }))];

describe('the composer template view', () => {
  it('allows the template\'s own sections and its fitting ones, never a vetoed or decoration section', () => {
    expect(T.allowed).toEqual(expect.arrayContaining(['cover-mega', 'products-rows', 'names-list', 'faq-split', 'closing-wordmark', 'story-split', 'benefits-bento']));
    expect(T.allowed).not.toContain('reviews-cards');
    expect(T.allowed).not.toContain('wave-divider');
    expect(T.signature).toEqual(['cover-mega', 'products-rows']);
  });
  it('knows each section\'s looks from the catalogue, the template\'s home and its drawn choices', () => {
    expect(lookOptions(T, 'cover-mega')).toEqual(expect.arrayContaining(['side', 'stack', 'tilt']));
    expect(lookOptions(T, 'faq-split')).toContain('lines');
  });
  it('is null without a signature or a fit list', () => {
    expect(composerTemplate('tacon', 'Tacón', preset, data)).toBeNull();
  });
  it('a template\'s own top bar may sit above the cover', () => {
    const shrine = composerTemplate('shrine', 'Shrine Pro', { layout: [{ type: 'promo-countdown' }, { type: 'cover-stage' }, { type: 'categories-tiles' }] as LayoutBlock[] },
      { fit: { shrine: ['story-split', 'products-grid', 'faq-split', 'closing-photo', 'benefits-bento', 'reviews-wall'] }, signature: { shrine: ['cover-stage'] } })!;
    expect(shrine.lead).toBe('promo-countdown');
    const ok: LayoutBlock[] = [{ type: 'promo-countdown' }, { type: 'cover-stage' }, { type: 'products-grid' }, { type: 'story-split' }, { type: 'benefits-bento' }, { type: 'faq-split' }, { type: 'closing-photo' }];
    expect(composerCheck(ok, shrine, [])).toEqual([]);
    const wrong: LayoutBlock[] = [{ type: 'story-split' }, { type: 'cover-stage' }, { type: 'products-grid' }, { type: 'benefits-bento' }, { type: 'faq-split' }, { type: 'reviews-wall' }, { type: 'closing-photo' }];
    expect(composerCheck(wrong, shrine, []).join(' ')).toMatch(/portada/);
  });
});

describe('too similar', () => {
  it('measures the common order', () => {
    expect(commonOrder(['a', 'b', 'c', 'd'], ['a', 'c', 'd'])).toBe(3);
    expect(commonOrder([], ['a'])).toBe(0);
  });
  it('same cover and 60% of the order is too close; another cover look is not', () => {
    const a = homeSummary('A', home(['products-rows', 'story-split', 'faq-split', 'closing-wordmark']));
    const b = homeSummary('B', home(['products-rows', 'story-split', 'benefits-bento', 'closing-wordmark']));
    expect(tooClose(a, b)).toBe(true);
    expect(tooClose(a, homeSummary('C', home(['products-rows', 'story-split', 'benefits-bento', 'closing-wordmark'], 'cover-mega', 'tilt')))).toBe(false);
  });
});

describe('the code check', () => {
  const good = home(['products-rows', 'story-split', 'names-list', 'benefits-bento', 'faq-split', 'closing-wordmark']);
  it('passes a composed home', () => {
    expect(composerCheck(good, T, [])).toEqual([]);
  });
  it('no recent homes: nothing to be close to', () => {
    expect(composerCheck(good, T, [])).toEqual([]);
  });
  it('names a missing signature, a section that does not fit, a short page and a look-alike', () => {
    const missing = home(['story-split', 'names-list', 'benefits-bento', 'faq-split', 'closing-wordmark', 'promo-banner']);
    expect(composerCheck(missing, T, []).join(' ')).toMatch(/products-rows/);
    expect(composerCheck([...good.slice(0, 6), { type: 'reviews-cards' }], T, []).join(' ')).toMatch(/reviews-cards/);
    expect(composerCheck(good.slice(0, 4), T, []).join(' ')).toMatch(/7 y 12/);
    expect(composerCheck(good, T, [homeSummary('Miga', good)]).join(' ')).toMatch(/Miga/);
  });
  it('refuses the cover the last two stores on the template used', () => {
    const other = homeSummary('Canasta', home(['faq-split', 'closing-wordmark']));
    expect(composerCheck(good, T, [other]).join(' ')).toMatch(/portada.*Canasta/);
  });
});

describe('review changes', () => {
  const layout = home(['products-rows', 'story-split', 'names-list', 'benefits-bento', 'faq-split', 'closing-wordmark']);
  it('applies a look, a band, a photo, a swap, a remove and a move', () => {
    const withPhoto = layout.map((block, at) => (at === 2 ? { ...block, photo: '/a.jpg' } : block));
    const out = applyComposerChanges(withPhoto, [
      { problem: 'x', at: 0, kind: 'look', value: 'tilt' },
      { problem: 'x', at: 2, kind: 'band', value: 'muted' },
      { problem: 'x', at: 2, kind: 'photo', value: '1' },
      { problem: 'x', at: 4, kind: 'swap', value: 'promo-banner' },
      { problem: 'x', at: 3, kind: 'remove', value: '' },
      { problem: 'x', at: 5, kind: 'move', value: '2' },
    ], T, ['/a.jpg', '/b.jpg']);
    expect(out.layout.map(block => block.type)).toEqual(['cover-mega', 'products-rows', 'faq-split', 'story-split', 'promo-banner', 'closing-wordmark']);
    expect(out.layout[0].look).toBe('tilt');
    expect(out.layout[3]).toMatchObject({ type: 'story-split', band: 'muted', photo: '/b.jpg' });
    expect(out.rewrite).toEqual([4]);
    expect(out.applied).toHaveLength(6);
  });
  it('ignores changes it cannot apply', () => {
    const out = applyComposerChanges(layout, [
      { problem: 'x', at: 1, kind: 'remove', value: '' },            // a signature section
      { problem: 'x', at: 0, kind: 'move', value: '3' },             // the cover
      { problem: 'x', at: 2, kind: 'swap', value: 'reviews-cards' }, // vetoed
      { problem: 'x', at: 40, kind: 'look', value: 'tilt' },         // no such section
      { problem: 'x', at: 2, kind: 'look', value: 'nope' },
      { problem: 'x', at: 1, kind: 'band', value: 'deep' },          // a dark band on a product section
    ], T, []);
    expect(out.layout).toEqual(layout);
    expect(out.applied).toEqual([]);
  });
});

describe('what the composer reads', () => {
  it('the prompt names the signature, the recent homes and what failed last time', () => {
    const text = composerPrompt(T, [{ store: 'Miga', cover: 'cover-mega:side', types: ['cover-mega', 'products-rows'] }], ['falta products-rows']);
    expect(text).toMatch(/Merienda/);
    expect(text).toMatch(/cover-mega, products-rows/);
    expect(text).toMatch(/Miga: cover-mega:side/);
    expect(text).toMatch(/falta products-rows/);
  });
  it('the catalogue is the allowed sections with every look they may take', () => {
    const cover = composerCatalogue(T).find(section => section.id === 'cover-mega')!;
    expect(cover.looks).toEqual(expect.arrayContaining(['side', 'stack', 'tilt']));
    expect(composerCatalogue(T).map(section => section.id)).not.toContain('reviews-cards');
  });
  it('the answer schema offers only allowed sections and accepts the template\'s own looks', () => {
    const schema = composerAnswerSchema(5, T) as any;
    expect(schema.properties.blocks.items.properties.look.enum).toEqual(expect.arrayContaining(['side', 'lines', 'alternate']));
    expect(schema.properties.blocks.items.properties.type.enum).toEqual(T.allowed);
  });
  it('the review sees numbered sections and reads back only known problems and changes', () => {
    expect(composerReviewText(home(['products-rows']), T, [], 4)).toMatch(/^0\. cover-mega \(side\)/m);
    expect(readComposerReview({ problemas: [
      { problema: 'palabras cortadas', seccion: 2, cambio: 'look', valor: 'tilt' },
      { problema: 'inventado', seccion: 1, cambio: 'look', valor: 'x' },
      { problema: 'palabras cortadas', seccion: 1, cambio: 'repaint', valor: 'x' },
    ] })).toEqual([{ problem: 'palabras cortadas', at: 2, kind: 'look', value: 'tilt' }]);
    expect(readComposerReview('{oops')).toEqual([]);
  });
});

describe('a template whose home opens without a cover (owner 2026-11-11: its opener stays first)', () => {
  const own = [{ type: 'promo-banner' }, { type: 'products-grid' }, { type: 'statement-reveal' }, { type: 'story-split' }, { type: 'closing-photo' }] as LayoutBlock[];
  const tacon = composerTemplate('tacon', 'Tacón', { layout: own },
    { fit: { tacon: ['benefits-bento', 'faq-split', 'categories-list', 'press-quotes', 'icon-columns'] }, signature: { tacon: ['promo-banner', 'statement-reveal'] } })!;
  const page = (rest: string[]): LayoutBlock[] => [{ type: 'promo-banner' }, { type: 'products-grid' }, ...rest.map(type => ({ type }))];
  it('keeps its opener in place of a cover, not as a bar above one', () => {
    expect(tacon.opener).toBe('promo-banner');
    expect(tacon.lead).toBeUndefined();
  });
  it('passes a home that starts with the opener and has no cover', () => {
    expect(composerCheck(page(['statement-reveal', 'benefits-bento', 'faq-split', 'press-quotes', 'closing-photo']), tacon, [])).toEqual([]);
  });
  it('refuses a home that does not start with the opener, or adds a cover', () => {
    const late: LayoutBlock[] = [{ type: 'products-grid' }, { type: 'promo-banner' }, { type: 'statement-reveal' }, { type: 'benefits-bento' }, { type: 'faq-split' }, { type: 'press-quotes' }, { type: 'closing-photo' }];
    expect(composerCheck(late, tacon, []).join(' ')).toMatch(/promo-banner va primera/);
    const covered: LayoutBlock[] = [{ type: 'promo-banner' }, { type: 'cover-full' }, { type: 'products-grid' }, { type: 'statement-reveal' }, { type: 'benefits-bento' }, { type: 'faq-split' }, { type: 'closing-photo' }];
    expect(composerCheck(covered, tacon, []).join(' ')).toMatch(/sin otra portada/);
  });
  it('compares recent homes by their order, since the opener is the same in every store', () => {
    const recent = [homeSummary('Lola', page(['statement-reveal', 'categories-list', 'icon-columns', 'story-split', 'closing-photo']))];
    expect(recent[0].cover).toBe('promo-banner:');
    expect(composerCheck(page(['statement-reveal', 'benefits-bento', 'faq-split', 'press-quotes', 'closing-photo']), tacon, recent)).toEqual([]);
    expect(composerCheck(page(['statement-reveal', 'categories-list', 'icon-columns', 'story-split', 'closing-photo']), tacon, recent).join(' ')).toMatch(/se parece a la tienda Lola/);
  });
  it('a review never moves the opener or puts a section above it', () => {
    const start = page(['statement-reveal', 'benefits-bento', 'faq-split', 'press-quotes', 'closing-photo']);
    const { layout } = applyComposerChanges(start, [{ problem: 'x', at: 0, kind: 'move', value: '3' }, { problem: 'x', at: 3, kind: 'move', value: '0' }], tacon, []);
    expect(layout.map(block => block.type)).toEqual(start.map(block => block.type));
  });
  it('the prompt says the opener opens the page and no cover is added', () => {
    expect(composerPrompt(tacon, [], [])).toMatch(/promo-banner abre la página.*sin otra portada/s);
  });
});
