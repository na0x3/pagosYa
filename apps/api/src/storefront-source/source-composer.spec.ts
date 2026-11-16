import { applyComposerChanges, commonOrder, composerCheck, composerTemplate, homeSummary, lookOptions, tooClose, type SectionFit } from './source-composer';
import { composerAnswerSchema, composerCatalogue, composerPrompt, composerReviewText, fillableTemplate, readComposerReview } from './source-composer';
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
    const ok: LayoutBlock[] = [{ type: 'promo-countdown' }, { type: 'cover-stage' }, { type: 'products-grid' }, { type: 'story-split' }, { type: 'benefits-bento' }, { type: 'faq-split' }, { type: 'reviews-wall' }, { type: 'story-split' }, { type: 'benefits-bento' }, { type: 'closing-photo' }];
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
  const good = home(['products-rows', 'story-split', 'names-list', 'benefits-bento', 'promo-banner', 'statement-sticker', 'faq-split', 'closing-photo', 'closing-wordmark']);
  it('passes a composed home', () => {
    expect(composerCheck(good, T, [])).toEqual([]);
  });
  it('no recent homes: nothing to be close to', () => {
    expect(composerCheck(good, T, [])).toEqual([]);
  });
  it('names a missing signature, a section that does not fit, a short page and a look-alike', () => {
    const missing = home(['story-split', 'names-list', 'benefits-bento', 'faq-split', 'closing-wordmark', 'promo-banner', 'statement-sticker', 'closing-photo', 'story-split']);
    expect(composerCheck(missing, T, []).join(' ')).toMatch(/products-rows/);
    expect(composerCheck([...good.slice(0, 6), { type: 'reviews-cards' }], T, []).join(' ')).toMatch(/reviews-cards/);
    expect(composerCheck(good.slice(0, 4), T, []).join(' ')).toMatch(/10 y 14/);
    expect(composerCheck([...good, ...good.slice(1, 6)], T, []).join(' ')).toMatch(/10 y 14/);
    expect(composerCheck(good, T, [homeSummary('Miga', good)]).join(' ')).toMatch(/Miga/);
  });
  it('a signature section that is neither the cover nor products may be left out, never repeated (NOA comp 2026-11-12)', () => {
    const press = composerTemplate('merienda', 'Merienda', preset, { ...data, signature: { merienda: ['cover-mega', 'products-rows', 'promo-banner'] } })!;
    expect(composerCheck(good.filter(block => block.type !== 'promo-banner').concat({ type: 'story-split' }), press, [])).toEqual([]);
    expect(composerCheck([...good, { type: 'promo-banner' }], press, []).join(' ')).toMatch(/promo-banner va una vez/);
  });
  it('refuses the cover the last two stores on the template used', () => {
    const other = homeSummary('Canasta', home(['faq-split', 'closing-wordmark']));
    expect(composerCheck(good, T, [other]).join(' ')).toMatch(/portada.*Canasta/);
  });
});

describe('review changes', () => {
  const layout = home(['products-rows', 'story-split', 'names-list', 'benefits-bento', 'faq-split', 'closing-wordmark', 'statement-sticker', 'closing-photo', 'story-split', 'names-list']);
  it('applies a look, a band, a photo, a swap, a remove and a move', () => {
    const withPhoto = layout.map((block, at) => (at === 2 ? { ...block, photo: '/a.jpg' } : block));
    const out = applyComposerChanges(withPhoto, [
      { problem: 'x', at: 0, kind: 'look', value: 'tilt' },
      { problem: 'x', at: 2, kind: 'band', value: 'muted' },
      { problem: 'x', at: 2, kind: 'photo', value: '1' },
      { problem: 'x', at: 4, kind: 'swap', value: 'promo-banner' },
      { problem: 'x', at: 3, kind: 'remove', value: '' },
      { problem: 'x', at: 5, kind: 'move', value: '2' },
    ], T, ['/a.jpg', '/b.jpg'], 10);
    expect(out.layout.map(block => block.type)).toEqual(['cover-mega', 'products-rows', 'faq-split', 'story-split', 'promo-banner', 'closing-wordmark', 'statement-sticker', 'closing-photo', 'story-split', 'names-list']);
    expect(out.layout[0].look).toBe('tilt');
    expect(out.layout[3]).toMatchObject({ type: 'story-split', band: 'muted', photo: '/b.jpg' });
    expect(out.rewrite).toEqual([4]);
    expect(out.applied).toHaveLength(6);
  });
  it('fixes before it shortens: a remove that takes the home under the floor is refused', () => {
    const out = applyComposerChanges(layout.slice(0, 10), [{ problem: 'x', at: 3, kind: 'remove', value: '' }], T, [], 10);
    expect(out.layout).toHaveLength(10);
    expect(out.applied).toEqual([]);
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

describe('what the store can fill (live test 2026-11-11: Oh Belly had no press quotes, Remolino no services)', () => {
  it('drops a signature section the store cannot fill, never its cover, and offers only sections it can fill', () => {
    const gum = composerTemplate('gumdrop', 'Gumdrop', { layout: [{ type: 'cover-ribbon' }, { type: 'press-quotes' }, { type: 'compare-table' }] as LayoutBlock[] },
      { fit: { gumdrop: ['story-split', 'strip-services', 'faq-split'] }, signature: { gumdrop: ['cover-ribbon', 'press-quotes', 'compare-table'] } })!;
    const view = fillableTemplate(gum, type => !['press-quotes', 'strip-services', 'cover-ribbon'].includes(type));
    expect(view.signature).toEqual(['cover-ribbon', 'compare-table']);
    expect(view.allowed).toEqual(expect.arrayContaining(['cover-ribbon', 'compare-table', 'story-split', 'faq-split']));
    expect(view.allowed).not.toContain('press-quotes');
    expect(view.allowed).not.toContain('strip-services');
  });
});

describe('a template with one cover and no other look (live test 2026-11-11: Estudio)', () => {
  it('does not ask for another cover it cannot give; the order still tells homes apart', () => {
    const estudio = composerTemplate('estudio', 'Estudio', { layout: [{ type: 'cover-half' }, { type: 'products-grid' }, { type: 'categories-list' }] as LayoutBlock[] },
      { fit: { estudio: ['story-split', 'benefits-bento', 'faq-split', 'press-quotes', 'closing-photo'] }, signature: { estudio: ['cover-half', 'categories-list'] } })!;
    const page = (rest: string[]): LayoutBlock[] => [{ type: 'cover-half' }, { type: 'products-grid' }, ...rest.map(type => ({ type }))];
    const recent = [homeSummary('Taller Roble', page(['categories-list', 'story-split', 'benefits-bento', 'faq-split', 'closing-photo']))];
    expect(composerCheck(page(['story-split', 'categories-list', 'press-quotes', 'closing-photo', 'faq-split', 'press-quotes', 'press-quotes', 'press-quotes']), estudio, recent)).toEqual([]);
  });
  it('a signature cover with one look is never asked to change, even with other covers in the fit (Motion, composer test 2026-11-12)', () => {
    const motion = composerTemplate('motion', 'Motion', { layout: [{ type: 'hero-split' }, { type: 'products-tabs' }, { type: 'categories-mosaic' }] as LayoutBlock[] },
      { fit: { motion: ['story-split', 'faq-split', 'closing-photo', 'cover-half', 'benefits-bento'] }, signature: { motion: ['hero-split', 'categories-mosaic'] } })!;
    const page = (rest: string[]): LayoutBlock[] => [{ type: 'hero-split' }, { type: 'products-tabs' }, ...rest.map(type => ({ type }))];
    const recent = [homeSummary('Oh Belly · light', page(['categories-mosaic', 'story-split', 'benefits-bento', 'faq-split', 'closing-photo']))];
    expect(composerCheck(page(['story-split', 'categories-mosaic', 'faq-split', 'benefits-bento', 'closing-photo']), motion, recent).join(' ')).not.toMatch(/otro look u otra portada/);
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
    expect(composerCheck(page(['statement-reveal', 'benefits-bento', 'faq-split', 'press-quotes', 'closing-photo', 'press-quotes', 'faq-split', 'benefits-bento']), tacon, [])).toEqual([]);
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
    expect(composerCheck(page(['statement-reveal', 'benefits-bento', 'faq-split', 'press-quotes', 'closing-photo', 'press-quotes', 'faq-split', 'benefits-bento']), tacon, recent)).toEqual([]);
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
