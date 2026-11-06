import { MENU_PAGES, addableSections, applyLayoutOps, layoutAdds, menuPagesFor, layoutDigest, layoutEditReply, layoutEditSchema, readLayoutEdit, LAYOUT_EDIT_PROMPT } from './source-layout-edit';
import { STORE_EDIT_PROMPT } from './source-store-edit';
import type { LayoutBlock } from './source-section-library';

const home: LayoutBlock[] = [
  { type: 'bar-note', title: 'Envíos a todo Bolivia' },
  { type: 'cover-split', eyebrow: 'Nuevo', title: 'Proteína de verdad', text: 'Para entrenar mejor.', cta: 'Ver todo', link: 'products', photo: '/v1/uploads/a.jpg' },
  { type: 'icon-columns', title: 'Una selección para ti', items: [{ title: 'Whey', text: 'Rápida' }, { title: 'Vegetal', text: 'Sin lácteos' }] },
  { type: 'products-grid', card: 'classic' },
  { type: 'faq-split', title: 'Preguntas', items: [{ title: '¿Cómo se toma?', text: 'Con agua.' }, { title: '¿Envían?', text: 'Sí.' }, { title: '¿Veganas?', text: 'Hay una.' }] },
  { type: 'closing-photo', title: 'Hasta pronto', cta: 'Comprar', link: 'products', photo: '/v1/uploads/b.jpg' },
];
const op = (partial: Record<string, unknown>) => ({ op: 'text', at: -1, field: '', item: -1, value: '', to: -1, ...partial }) as never;

describe('layout edit', () => {
  it('digests the home as numbered sections with their words and no photos', () => {
    const digest = layoutDigest(home);
    expect(digest.map(section => section.at)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(digest[1]).toMatchObject({ type: 'cover-split', eyebrow: 'Nuevo', title: 'Proteína de verdad', cta: 'Ver todo' });
    expect(digest[1].name).toBeTruthy();
    expect(JSON.stringify(digest)).not.toContain('/v1/uploads');
    expect(digest[4].items).toEqual([{ title: '¿Cómo se toma?', text: 'Con agua.' }, { title: '¿Envían?', text: 'Sí.' }, { title: '¿Veganas?', text: 'Hay una.' }]);
  });

  it('sets a headline and a button text, leaving everything else alone', () => {
    const result = applyLayoutOps(home, [op({ at: 1, field: 'title', value: 'Proteína buena, todos los días' }), op({ at: 1, field: 'cta', value: 'Comprar ahora' })]);
    expect(result.layout[1]).toEqual({ ...home[1], title: 'Proteína buena, todos los días', cta: 'Comprar ahora' });
    expect(result.layout.filter((_, at) => at !== 1)).toEqual(home.filter((_, at) => at !== 1));
    expect(result.done).toHaveLength(2);
    expect(result.refused).toEqual([]);
  });

  it('gives a new button a link and drops the link with the button', () => {
    const added = applyLayoutOps(home, [op({ at: 2, field: 'cta', value: 'Ver proteínas' })]).layout[2];
    expect(added).toMatchObject({ cta: 'Ver proteínas', link: 'products' });
    const gone = applyLayoutOps(home, [op({ at: 5, field: 'cta', value: '' })]).layout[5];
    expect(gone.cta).toBeUndefined();
    expect(gone.link).toBeUndefined();
  });

  it('edits an item and never empties an item title or the cover title', () => {
    const result = applyLayoutOps(home, [op({ at: 4, item: 1, field: 'text', value: 'Sí, a todo el país.' }), op({ at: 4, item: 0, field: 'title', value: '' }), op({ at: 1, field: 'title', value: '' })]);
    expect(result.layout[4].items![1]).toEqual({ title: '¿Envían?', text: 'Sí, a todo el país.' });
    expect(result.layout[4].items![0].title).toBe('¿Cómo se toma?');
    expect(result.layout[1].title).toBe('Proteína de verdad');
    expect(result.done).toHaveLength(1);
    expect(result.refused.length).toBeGreaterThanOrEqual(1);
  });

  it('caps words like the library', () => {
    const result = applyLayoutOps(home, [op({ at: 1, field: 'title', value: 'x'.repeat(300) })]);
    expect(result.layout[1].title!.length).toBeLessThanOrEqual(80);
  });

  it('removes a section but never the main grid or the cover', () => {
    const result = applyLayoutOps(home, [op({ op: 'remove', at: 2 }), op({ op: 'remove', at: 3 }), op({ op: 'remove', at: 1 })]);
    expect(result.layout.map(block => block.type)).toEqual(['bar-note', 'cover-split', 'products-grid', 'faq-split', 'closing-photo']);
    expect(result.done).toEqual([expect.stringContaining('Una selección para ti')]);
    expect(result.refused).toHaveLength(2);
  });

  it('moves a section into another place, never above the cover', () => {
    const up = applyLayoutOps(home, [op({ op: 'move', at: 4, to: 2 })]);
    expect(up.layout.map(block => block.type)).toEqual(['bar-note', 'cover-split', 'faq-split', 'icon-columns', 'products-grid', 'closing-photo']);
    const down = applyLayoutOps(home, [op({ op: 'move', at: 2, to: 4 })]);
    expect(down.layout.map(block => block.type)).toEqual(['bar-note', 'cover-split', 'products-grid', 'faq-split', 'icon-columns', 'closing-photo']);
    const top = applyLayoutOps(home, [op({ op: 'move', at: 4, to: 0 })]);
    expect(top.layout.map(block => block.type)).toEqual(['bar-note', 'cover-split', 'faq-split', 'icon-columns', 'products-grid', 'closing-photo']);
    const cover = applyLayoutOps(home, [op({ op: 'move', at: 1, to: 4 })]);
    expect(cover.layout).toEqual(home);
    expect(cover.refused).toHaveLength(1);
  });

  it('ops point at the numbers the merchant saw, even after a removal', () => {
    const result = applyLayoutOps(home, [op({ op: 'remove', at: 2 }), op({ at: 4, field: 'title', value: 'Dudas' })]);
    expect(result.layout.find(block => block.type === 'faq-split')!.title).toBe('Dudas');
  });

  it('ignores unknown numbers and words that are already there', () => {
    const result = applyLayoutOps(home, [op({ at: 9, field: 'title', value: 'x' }), op({ at: 1, field: 'title', value: 'Proteína de verdad' }), op({ op: 'remove', at: -3 })]);
    expect(result.layout).toEqual(home);
    expect(result.done).toEqual([]);
  });

  it('reads the answer and its rest', () => {
    expect(readLayoutEdit({ ops: [op({ at: 1, field: 'title', value: 'Hola' }), { op: 'paint' }], rest: '  verde lima ' })).toEqual({ ops: [op({ at: 1, field: 'title', value: 'Hola' })], store: [], catalog: [], rest: 'verde lima' });
    expect(readLayoutEdit(null)).toBeNull();
    expect(layoutEditSchema().required).toEqual(['ops', 'store', 'catalogo', 'rest', 'ask']);
  });

  it('says what changed and what it would not do', () => {
    expect(layoutEditReply(['el título de la portada ahora dice «Hola»'], [])).toMatch(/^Listo: el título de la portada ahora dice «Hola»\./);
    const both = layoutEditReply(['quité «Una selección para ti»'], ['No quité la grilla de productos: la tienda la necesita.']);
    expect(both).toContain('quité «Una selección para ti»');
    expect(both).toContain('No quité la grilla de productos');
  });
});

it('names the cover by its kind and says the new words', () => {
  const result = applyLayoutOps(home, [op({ at: 1, field: 'title', value: 'Proteína buena' }), op({ at: 1, field: 'cta', value: 'Comprar ahora' })]);
  expect(layoutEditReply(result.done, result.refused)).toBe('Listo: el título de la portada ahora dice «Proteína buena» y el botón de la portada ahora dice «Comprar ahora». Revisa la vista previa.');
});

describe('adding a section (fix 3, 2026-11-02)', () => {
  it('offers every library section but covers, main grids, decoration and the menu note', () => {
    const ids = addableSections().map(section => section.id);
    expect(ids).toEqual(expect.arrayContaining(['faq-split', 'steps-howto', 'compare-table', 'story-list', 'icon-columns']));
    expect(ids.some(id => id.startsWith('cover-') || ['products-grid', 'products-tabs', 'wave-divider', 'bar-note'].includes(id))).toBe(false);
    // The schema also offers the covers, which only a menu page takes (spec 2026-11-05); layoutAdds refuses them on the home.
    expect(layoutEditSchema().properties.ops.items.properties.type.enum).toEqual([...addableSections('menu').map(section => section.id), '']);
    expect(addableSections('menu').map(section => section.id)).toEqual(expect.arrayContaining([...ids, 'cover-centered']));
  });

  it('reads at most two new sections the home does not have', () => {
    const ops = [op({ op: 'add', type: 'steps-howto', to: 4, value: 'Cómo preparar el batido' }), op({ op: 'add', type: 'faq-split' }), op({ op: 'add', type: 'cover-full' }),
      op({ op: 'add', type: 'compare-table' }), op({ op: 'add', type: 'story-list' })];
    const { adds, refused } = layoutAdds(home, ops);
    expect(adds).toEqual([{ type: 'steps-howto', to: 4, about: 'Cómo preparar el batido' }, { type: 'compare-table', to: -1, about: '' }]);
    expect(refused).toEqual([expect.stringContaining('ya tiene «Preguntas»'), expect.stringContaining('ya tiene su portada'), expect.stringContaining('hasta dos')]);
  });

  it('puts a filled new section before the one it was asked before, else before the closing, never above the cover', () => {
    const steps = { type: 'steps-howto', title: 'Cómo se prepara', items: [{ title: 'Mide' }, { title: 'Mezcla' }, { title: 'Disfruta' }] };
    const before = applyLayoutOps(home, [], [{ to: 4, block: steps }]);
    expect(before.layout.map(block => block.type)).toEqual(['bar-note', 'cover-split', 'icon-columns', 'products-grid', 'steps-howto', 'faq-split', 'closing-photo']);
    expect(before.done).toEqual(['agregué la sección «Cómo se prepara»']);
    expect(applyLayoutOps(home, [], [{ to: -1, block: steps }]).layout.map(block => block.type).slice(-2)).toEqual(['steps-howto', 'closing-photo']);
    const two = applyLayoutOps(home, [], [{ to: -1, block: steps }, { to: -1, block: { type: 'compare-table', title: 'Por qué nosotros' } }]);
    expect(layoutEditReply(two.done, two.refused)).toBe('Listo: agregué la sección «Cómo se prepara» y la sección «Por qué nosotros». Revisa la vista previa.');
    expect(applyLayoutOps(home, [], [{ to: 0, block: steps }]).layout.map(block => block.type).slice(0, 3)).toEqual(['bar-note', 'cover-split', 'steps-howto']);
    // Its place follows the section it was asked before, after a removal.
    const moved = applyLayoutOps(home, [op({ op: 'remove', at: 2 })], [{ to: 3, block: steps }]);
    expect(moved.layout.map(block => block.type)).toEqual(['bar-note', 'cover-split', 'steps-howto', 'products-grid', 'faq-split', 'closing-photo']);
  });
});

describe('layout edit: photos and the product page (spec 2026-11-03)', () => {
  const photos = [{ url: '/v1/uploads/nueva.jpg', from: 'mensaje' as const }];
  it('marks the photo places in the digest, never the photos', () => {
    const digest = layoutDigest([...home, { type: 'story-overlap', title: 'Historia', photo: '/v1/uploads/c.jpg', photo2: '/v1/uploads/d.jpg', items: [{ title: 'Uno', photo: '/v1/uploads/e.jpg' }] }]);
    expect(digest[1].fotos).toEqual(['photo']);
    expect(digest[6]).toMatchObject({ fotos: ['photo', 'photo2'], items: [{ title: 'Uno', foto: true }] });
    expect(digest[2].fotos).toBeUndefined();
    expect(JSON.stringify(digest)).not.toContain('/v1/uploads');
  });

  it('swaps a photo the section shows, and only there', () => {
    const result = applyLayoutOps(home, [op({ op: 'photo', at: 1, field: 'photo', value: 'f0' }), op({ op: 'photo', at: 2, field: 'photo', value: 'f0' }), op({ op: 'photo', at: 5, value: 'f7' })], [], { photos });
    expect(result.layout[1].photo).toBe('/v1/uploads/nueva.jpg');
    expect(result.layout[2].photo).toBeUndefined();
    expect(result.done).toEqual(['cambié la foto de la portada']);
    expect(result.refused).toHaveLength(2);
    expect(result.refused[0]).toMatch(/^La sección «Una selección para ti» no muestra/);
  });

  it('keeps the product page ops apart from the home ones and names the ficha', () => {
    const ficha: LayoutBlock[] = [{ type: 'steps-howto', title: 'Cómo se usa', items: [{ title: 'Mezcla' }] }, { type: 'compare-table', title: 'Comparación' }];
    const ops = [op({ at: 0, field: 'title', value: 'Así se toma', page: 'product' }), op({ op: 'remove', at: 1, page: 'product' }), op({ at: 1, field: 'title', value: 'Hola' })];
    const product = applyLayoutOps(ficha, ops, [], { page: 'product' });
    expect(product.layout.map(block => block.title)).toEqual(['Así se toma']);
    expect(product.done).toEqual(['el título de la sección «Cómo se usa» de la ficha de producto ahora dice «Así se toma»', 'quité la sección «Comparación» de la ficha de producto'.replace('la sección ', '')]);
    expect(applyLayoutOps(home, ops).layout[1].title).toBe('Hola');
    expect(readLayoutEdit({ ops: [op({ at: 0, page: 'product' }), op({ at: 1, page: 'home' })], store: [], rest: '' })!.ops.map(entry => (entry as { page?: string }).page)).toEqual(['product', undefined]);
    expect(layoutAdds(home, [op({ op: 'add', at: -1, type: 'steps-howto', page: 'product' })]).adds).toEqual([]);
  });

  it('reads the store ops of the same answer', () => {
    const read = readLayoutEdit({ ops: [], store: [{ part: 'faq', field: 'add', at: -1, title: '¿Envían?', value: 'Sí.' }, { part: 'evil', field: 'x' }], rest: '' });
    expect(read!.store).toEqual([{ part: 'faq', field: 'add', at: -1, title: '¿Envían?', value: 'Sí.' }]);
  });
});

describe('layout edit: menu pages (spec 2026-11-05)', () => {
  it('reads ops for Nosotros, Contacto, Preguntas and Envíos and offers them in the schema', () => {
    expect(layoutEditSchema().properties.ops.items.properties.page.enum).toEqual(['home', 'product', ...MENU_PAGES, 'nueva']);
    expect(MENU_PAGES).toEqual(['about', 'contact', 'faq', 'shipping']);
    // A page address (spec 2026-11-05 creates anything) is read; one with no page behind it changes nothing later. Junk is dropped.
    const read = readLayoutEdit({ ops: [op({ at: 0, page: 'about' }), op({ at: 0, page: 'faq' }), op({ at: 0, page: 'evil' }), op({ at: 0, page: 'Evil Page!' })], store: [], rest: '' })!;
    expect(read.ops.map(entry => (entry as { page?: string }).page)).toEqual(['about', 'faq', 'evil', undefined]);
  });

  it('builds an empty page from up to five new sections, one cover, never touching the home', () => {
    const ops = [op({ op: 'add', type: 'story-split', page: 'about', value: 'Quiénes somos' }), op({ op: 'add', type: 'cover-centered', page: 'about' }),
      op({ op: 'add', type: 'cover-full', page: 'about' }), op({ op: 'add', type: 'icon-columns', page: 'about' }), op({ op: 'add', type: 'steps-howto', page: 'about' }),
      op({ op: 'add', type: 'closing-photo', page: 'about' }), op({ op: 'add', type: 'faq-split', page: 'about' }), op({ op: 'add', type: 'products-grid', page: 'about' })];
    const { adds, refused } = layoutAdds([], ops, 'about');
    expect(adds.map(add => add.type)).toEqual(['story-split', 'cover-centered', 'icon-columns', 'steps-howto', 'closing-photo']);
    expect(refused).toEqual([expect.stringContaining('una portada'), expect.stringContaining('hasta cinco')]);
    // The home reads none of them.
    expect(layoutAdds(home, ops).adds).toEqual([]);
    // A cover the home may not add.
    expect(layoutAdds(home, [op({ op: 'add', type: 'cover-centered' })]).adds).toEqual([]);
  });

  it('sends the menu pages only when they matter, and the new-section list only when a page is named or open (minor 2026-11-05)', () => {
    const empty = { about: [], contact: [], faq: [], shipping: [] };
    expect(menuPagesFor(empty, 'Cambia el título de la portada')).toBeNull();
    const built = { ...empty, about: [{ type: 'story-split', title: 'Somos BOXY' }] as LayoutBlock[] };
    expect(menuPagesFor(built, 'Cambia el título de la portada')).toEqual({ pages: { about: built.about }, offer: false });
    expect(menuPagesFor(empty, 'Haz la página de nosotros más bonita')).toEqual({ pages: empty, offer: true });
    expect(menuPagesFor(empty, 'Agrega fotos aquí', 'contacto.html')).toEqual({ pages: empty, offer: true });
    expect(menuPagesFor(empty, 'Agrega fotos aquí', 'index.html')).toBeNull();
  });

  it('keeps a menu page to eight sections whatever the requests add up to', () => {
    const types = addableSections('home').map(section => section.id);
    const page = types.slice(0, 7).map(type => ({ type, title: type })) as LayoutBlock[];
    const { adds, refused } = layoutAdds(page, [op({ op: 'add', type: types[7], page: 'about' }), op({ op: 'add', type: types[8], page: 'about' })], 'about');
    expect(adds.map(add => add.type)).toEqual([types[7]]);
    expect(refused).toEqual([expect.stringContaining('ocho secciones')]);
    expect(layoutAdds([...page, { type: types[7] }] as LayoutBlock[], [op({ op: 'add', type: types[8], page: 'about' })], 'about').adds).toEqual([]);
  });

  it('puts a new cover first and names the page in the reply', () => {
    const story = { type: 'story-split', title: 'Nuestra historia', photo: '/v1/uploads/a.jpg' };
    const cover = { type: 'cover-centered', title: 'Somos BOXY', photo: '/v1/uploads/b.jpg' };
    const built = applyLayoutOps([], [], [{ to: -1, block: story }, { to: -1, block: cover }], { page: 'about' });
    expect(built.layout.map(block => block.type)).toEqual(['cover-centered', 'story-split']);
    expect(layoutEditReply(built.done, built.refused)).toBe('Listo: agregué la sección «Nuestra historia» y la sección «Somos BOXY» a tu página «Nosotros». Revisa la vista previa.');
    const page: LayoutBlock[] = [cover, story];
    const edited = applyLayoutOps(page, [op({ at: 1, field: 'title', value: 'Cómo empezamos', page: 'about' }), op({ at: 1, field: 'title', value: 'Hola' })], [], { page: 'about' });
    expect(edited.layout[1].title).toBe('Cómo empezamos');
    expect(edited.done).toEqual(['el título de la sección «Nuestra historia» de la página «Nosotros» ahora dice «Cómo empezamos»']);
  });
});

describe('layout edit: menu pages, review fixes (2026-11-05)', () => {
  it('lets a menu page lose its cover, so the page can go back to its text', () => {
    const page: LayoutBlock[] = [{ type: 'cover-centered', title: 'Somos BOXY' }, { type: 'story-split', title: 'Historia' }];
    const out = applyLayoutOps(page, [op({ op: 'remove', at: 0, page: 'about' }), op({ op: 'remove', at: 1, page: 'about' })], [], { page: 'about' });
    expect(out.layout).toEqual([]);
    expect(out.refused).toEqual([]);
  });

  it('says so when a cover is asked for on the home, instead of dropping it silently', () => {
    expect(layoutAdds(home, [op({ op: 'add', type: 'cover-centered' })]).refused).toEqual([expect.stringContaining('ya tiene su portada')]);
  });
});

// Live 2026-11-05 (NOA «agrega una pregunta sobre arreglos de vestidos»): a question without its answer is never invented; YAPI
// asks for the answer instead of «No logré que ese cambio se vea».
it('reads the question YAPI asks back, and the schema always asks for one', () => {
  expect(readLayoutEdit({ ops: [], store: [], rest: '', ask: '  ¿Qué respuesta le pongo a «¿Hacen arreglos?»?  ' })).toEqual({ ops: [], store: [], catalog: [], rest: '', ask: '¿Qué respuesta le pongo a «¿Hacen arreglos?»?' });
  expect(readLayoutEdit({ ops: [], store: [], rest: '', ask: '' })).toEqual({ ops: [], store: [], catalog: [], rest: '' });
  expect(layoutEditSchema().required).toContain('ask');
  expect(LAYOUT_EDIT_PROMPT + STORE_EDIT_PROMPT).toContain('«ask»');
});

describe('items inside a section (spec 2026-11-05 creates anything)', () => {
  const steps: LayoutBlock[] = [{ type: 'cover-split', title: 'Hola' }, { type: 'story-list', title: 'Pasos', items: [{ title: 'Uno' }, { title: 'Dos' }, { title: 'Tres' }] }];
  // Final review 2026-11-05: item numbers are the ones the model saw; a new item brings its text on a second line.
  it('adds an item before the item it names, with its text, and other ops keep the numbers that were shown', () => {
    const out = applyLayoutOps(steps, [op({ op: 'item-add', at: 1, item: 1, value: 'Uno y medio\nEntre uno y dos' }), op({ op: 'text', at: 1, item: 1, field: 'text', value: 'Segundo' })], []);
    expect(out.layout[1].items!.map(i => [i.title, i.text])).toEqual([['Uno', undefined], ['Uno y medio', 'Entre uno y dos'], ['Dos', 'Segundo'], ['Tres', undefined]]);
    expect(out.done.join(' ')).toContain('agregué el punto «Uno y medio»');
    const appended = applyLayoutOps(steps, [op({ op: 'item-add', at: 1, item: -1, value: 'Cuatro\nX' }), op({ op: 'text', at: 1, item: -1, field: 'title', value: 'Pasos' })], []);
    expect(appended.layout[1].items!.at(-1)).toEqual({ title: 'Cuatro', text: 'X' });
  });
  it('«quita el paso 1 y cambia el paso 3» changes the third step that was shown', () => {
    const out = applyLayoutOps(steps, [op({ op: 'item-remove', at: 1, item: 0 }), op({ op: 'text', at: 1, item: 2, field: 'title', value: 'Tres nuevo' })], []);
    expect(out.layout[1].items!.map(i => i.title)).toEqual(['Dos', 'Tres nuevo']);
  });
  it('appends with item -1, removes and moves', () => {
    expect(applyLayoutOps(steps, [op({ op: 'item-add', at: 1, item: -1, value: 'Cuatro' })], []).layout[1].items!.at(-1)!.title).toBe('Cuatro');
    expect(applyLayoutOps(steps, [op({ op: 'item-remove', at: 1, item: 0 })], []).layout[1].items!.map(i => i.title)).toEqual(['Dos', 'Tres']);
    expect(applyLayoutOps(steps, [op({ op: 'item-move', at: 1, item: 2, to: 0 })], []).layout[1].items!.map(i => i.title)).toEqual(['Tres', 'Uno', 'Dos']);
  });
  it('keeps the section type limits and refuses sections without items', () => {
    const full: LayoutBlock[] = [steps[0], { ...steps[1], items: [...steps[1].items!, { title: 'Cuatro' }] }];
    const over = applyLayoutOps(full, [op({ op: 'item-add', at: 1, item: -1, value: 'Cinco' })], []);
    expect(over.layout[1].items).toHaveLength(4);
    expect(over.refused[0]).toMatch(/ya son 4, el máximo/);
    const two: LayoutBlock[] = [steps[0], { ...steps[1], items: steps[1].items!.slice(0, 2) }];
    expect(applyLayoutOps(two, [op({ op: 'item-remove', at: 1, item: 0 })], []).refused[0]).toMatch(/al menos 2/);
    expect(applyLayoutOps([{ type: 'products-grid' }] as LayoutBlock[], [op({ op: 'item-add', at: 0, item: -1, value: 'x' })], []).refused[0]).toMatch(/no tiene puntos/);
  });
  it('reads the item ops and offers them in the schema', () => {
    expect(readLayoutEdit({ ops: [op({ op: 'item-add', at: 1, item: -1, value: 'x' })], store: [], rest: '' })!.ops).toHaveLength(1);
    expect(JSON.stringify(layoutEditSchema())).toContain('item-add');
  });
});

it('offers the page ops and the store pages in the schema, and keeps a page op naming a page (spec 2026-11-05 creates anything)', () => {
  const schema = JSON.stringify(layoutEditSchema(['novias']));
  for (const word of ['"novias"', '"nueva"', 'page-add', 'page-remove', 'page-link', 'page-rename']) expect(schema).toContain(word);
  expect(readLayoutEdit({ ops: [op({ op: 'page-remove', page: 'novias' }), op({ op: 'add', type: 'cover-split', page: 'nueva' }), op({ page: '../x' })], store: [], rest: '' })!.ops.map(o => o.page))
    .toEqual(['novias', 'nueva', undefined]);
});

it('reads the catalog ops beside the section and store ops (spec 2026-11-05 creates anything part 2)', () => {
  const read = readLayoutEdit({ ops: [], store: [], catalogo: [{ kind: 'code-add', at: -1, name: 'VERANO20', price: '', stock: '', text: '', category: '', photo: '', option: '', value: '20 %' }, { kind: 'hack' }], rest: '', ask: '' });
  expect(read?.catalog).toEqual([expect.objectContaining({ kind: 'code-add', name: 'VERANO20', value: '20 %' })]);
  expect(layoutEditSchema().properties.catalogo.items.required).toContain('kind');
  expect(LAYOUT_EDIT_PROMPT).toContain('«catalogo»');
  expect(STORE_EDIT_PROMPT).toContain('option-price');
});
