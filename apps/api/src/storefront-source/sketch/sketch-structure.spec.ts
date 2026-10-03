import { repairSketchFree, repairSketchLayout, sketchApplyMove, sketchCanFree, sketchFreeablePaths, sketchFreePos, sketchListPath, sketchSetFree, sketchUnfree, sketchCanMove, sketchCanRemove, sketchFindNode, sketchNodeTree, sketchRemoveNode, sketchReorder, SKETCH_COPY_ORDER } from '@pagosya/shared-types';

const hero = () => ({ id: 'h', type: 'hero', variant: 'photo-right', headline: 'Hola', sub: 'sub', cta: 'Ver', cta2: 'Caja', trust: '★ 4.8', badge: '', note: '', sticker: 'Fresco', caption: 'pie', photo: 'assets/a.jpg', bg: 'paper', size: 'l' }) as any;

describe('sketch structure', () => {
  it('builds the hero tree in render order, skipping empty optional elements', () => {
    const tree = sketchNodeTree(hero());
    expect(tree.map(node => node.path)).toEqual(['copy', 'media']);
    expect(tree[0].children.map(node => node.key)).toEqual(['headline', 'sub', 'actions', 'trust']);
    expect(sketchFindNode(tree, 'copy/actions')!.children.map(node => node.path)).toEqual(['copy/actions/cta', 'copy/actions/cta2']);
    expect(tree[1].children.map(node => node.key)).toEqual(['photo', 'caption', 'sticker']);
    expect(sketchFindNode(tree, 'copy/actions')!.label).toBe('Botones');
  });
  it('follows a saved order and a swap', () => {
    const block = { ...hero(), order: ['actions', 'headline', 'sub', 'badge', 'trust', 'note'], swap: true };
    const copy = sketchNodeTree(block)[0];
    expect(copy.children.map(node => node.key)).toEqual(['actions', 'headline', 'sub', 'trust']);
    expect(copy.children[0].children.map(node => node.key)).toEqual(['cta2', 'cta']);
  });
  it('lists head + items for grid blocks, numbered labels for items', () => {
    const steps = { id: 's', type: 'steps', kicker: 'K', title: 'T', note: '', items: [{ icon: 'a', title: '1', text: '' }, { icon: 'b', title: '2', text: '' }], bg: 'paper', size: 'm' };
    const tree = sketchNodeTree(steps);
    expect(tree.map(node => node.key)).toEqual(['head', 'items']);
    expect(tree[0].children.map(node => node.key)).toEqual(['kicker', 'title']);
    expect(tree[1].children.map(node => node.label)).toEqual(['Paso 1', 'Paso 2']);
  });
  it('marquee and footer have no inner nodes; a hero without photo keeps its sticker at block level', () => {
    expect(sketchNodeTree({ type: 'marquee' })).toEqual([]);
    expect(sketchNodeTree({ type: 'footer', tagline: 'x' })).toEqual([]);
    expect(sketchNodeTree({ ...hero(), photo: undefined }).map(node => node.key)).toEqual(['copy', 'sticker']);
  });
  it('reorder rules per container', () => {
    expect(sketchReorder({ type: 'hero' }, '')).toEqual({ kind: 'flip' });
    expect(sketchReorder({ type: 'steps' }, '')).toEqual({ kind: 'none' });
    expect(sketchReorder({ type: 'hero' }, 'copy')).toEqual({ kind: 'order' });
    expect(sketchReorder({ type: 'hero' }, 'copy/actions')).toEqual({ kind: 'swap' });
    expect(sketchReorder({ type: 'reviews' }, 'items')).toEqual({ kind: 'array', field: 'quotes' });
    expect(sketchReorder({ type: 'announce' }, 'row')).toEqual({ kind: 'fields', a: 'left', b: 'right' });
  });
  it('can move only what the rules allow', () => {
    const block = hero();
    expect(sketchCanMove(block, '')).toBe(false);
    expect(sketchCanMove(block, 'copy')).toBe(true);
    expect(sketchCanMove({ ...block, photo: undefined }, 'copy')).toBe(false);
    expect(sketchCanMove(block, 'copy/headline')).toBe(true);
    expect(sketchCanMove(block, 'copy/actions/cta')).toBe(true);
    expect(sketchCanMove({ ...block, cta2: '' }, 'copy/actions/cta')).toBe(false);
    expect(sketchCanMove(block, 'media/photo')).toBe(false);
    expect(sketchCanMove({ type: 'newsletter', variant: 'center', photo: 'assets/a.jpg' }, 'copy')).toBe(false);
  });
  it('applies moves: order is live, arrays reload, bad permutations are rejected', () => {
    const block = hero();
    // Visible order first, hidden (empty) elements appended — the same rule the editor already used.
    expect(sketchApplyMove(block, 'copy', ['sub', 'headline', 'actions', 'trust'])).toBe('live');
    expect(block.order).toEqual(['sub', 'headline', 'actions', 'trust', 'badge', 'note']);
    expect(sketchApplyMove(block, 'copy', [...SKETCH_COPY_ORDER.hero])).toBe('live');
    expect(block.order).toBeUndefined();
    expect(sketchApplyMove(block, '', ['media', 'copy'])).toBe('live');
    expect(block.flip).toBe(true);
    expect(sketchApplyMove(block, 'copy/actions', ['cta2', 'cta'])).toBe('live');
    expect(block.swap).toBe(true);
    const split = { type: 'split', pills: ['a', 'b', 'c'] } as any;
    expect(sketchApplyMove(split, 'copy/pills', ['2', '0', '1'])).toBe('reload');
    expect(split.pills).toEqual(['c', 'a', 'b']);
    expect(sketchApplyMove(split, 'copy/pills', ['0', '0', '1'])).toBeNull();
    expect(sketchApplyMove(split, 'copy/pills', ['0', '1'])).toBeNull();
    expect(split.pills).toEqual(['c', 'a', 'b']);
    const announce = { type: 'announce', left: 'L', right: 'R' } as any;
    expect(sketchApplyMove(announce, 'row', ['right', 'left'])).toBe('reload');
    expect([announce.left, announce.right]).toEqual(['R', 'L']);
    expect(sketchApplyMove(block, 'media', ['caption', 'photo'])).toBeNull();
  });
  it('removes optional leaves and list items only', () => {
    const block = { ...hero(), stickerPos: { x: 1, y: 2 } };
    expect(sketchCanRemove(block, 'copy/headline')).toBe(false);
    expect(sketchCanRemove(block, 'copy/actions/cta2')).toBe(true);
    expect(sketchRemoveNode(block, 'copy/actions/cta2')).toBe(true);
    expect(block.cta2).toBe('');
    expect(sketchRemoveNode(block, 'media/sticker')).toBe(true);
    expect(block.sticker).toBe('');
    expect(block.stickerPos).toBeUndefined();
    const faq = { type: 'faq', items: [{ q: 'a' }, { q: 'b' }] } as any;
    expect(sketchRemoveNode(faq, 'items/0')).toBe(true);
    expect(faq.items).toEqual([{ q: 'b' }]);
    expect(sketchRemoveNode(faq, 'items/7')).toBe(false);
  });
  it('repairs layout: known groups and values only', () => {
    expect(repairSketchLayout('hero', { copy: { gap: 'l', valign: 'end', dir: 'row' }, actions: { dir: 'column', align: 'center', gap: 'xx' }, bogus: { gap: 's' } }))
      .toEqual({ copy: { gap: 'l', valign: 'end' }, actions: { dir: 'column', align: 'center' } });
    expect(repairSketchLayout('hero', { media: { gap: 's' } })).toBeUndefined();
    expect(repairSketchLayout('steps', { items: { gap: 's' }, head: { align: 'center' } })).toEqual({ items: { gap: 's' } });
    expect(repairSketchLayout('hero', 'nope')).toBeUndefined();
    expect(repairSketchLayout('marquee', { copy: { gap: 's' } })).toBeUndefined();
  });
});

describe('free layer', () => {
  const steps = () => ({ id: 's', type: 'steps', kicker: '', title: 'T', note: '', items: [{ icon: 'a', title: '1', text: '' }, { icon: 'b', title: '2', text: '' }, { icon: 'c', title: '3', text: '' }], bg: 'paper', size: 'm' }) as any;
  it('frees any inner part but never a top-level group, the sticker, the column photo or the account page', () => {
    const block = hero();
    for (const path of ['copy/headline', 'copy/actions', 'copy/actions/cta', 'copy/actions/cta2', 'media/caption']) expect(sketchCanFree(block, path)).toBe(true);
    for (const path of ['', 'copy', 'media', 'media/photo', 'media/sticker', 'copy/missing', 'extras/eab1']) expect(sketchCanFree(block, path)).toBe(false);
    expect(sketchCanFree({ ...hero(), cta2: '' }, 'copy/actions/cta2')).toBe(false);
    expect(sketchCanFree({ ...hero(), photo: undefined }, 'sticker')).toBe(false);
    expect(sketchCanFree(steps(), 'items/1')).toBe(true);
    expect(sketchCanFree({ id: 'account', type: 'account', kicker: 'K', title: 'T', lead: 'L', perks: [{ icon: 'x', text: 'p' }] }, 'intro/title')).toBe(false);
  });
  it('lists extras last as "Elementos sueltos", labelled by kind', () => {
    const tree = sketchNodeTree({ ...hero(), extras: [{ id: 'eab1', kind: 'emoji', value: '✨', x: 1, y: 1 }, { id: 'ecd2', kind: 'button', value: 'Pedir', x: 2, y: 2 }] });
    const extras = tree[tree.length - 1];
    expect([extras.path, extras.label]).toEqual(['extras', 'Elementos sueltos']);
    expect(extras.children.map(node => [node.path, node.label])).toEqual([['extras/eab1', 'Emoji'], ['extras/ecd2', 'Botón']]);
    expect(sketchNodeTree(hero()).some(node => node.key === 'extras')).toBe(false);
  });
  it('a freed part no longer reorders, and nothing inside it is freeable', () => {
    const block = { ...steps(), free: { 'items/1': { x: 1, y: 1 } } };
    expect(sketchCanMove(block, 'items/1')).toBe(false);
    expect(sketchCanMove(block, 'items/0')).toBe(true);
    const row = { ...hero(), free: { 'copy/actions': { x: 1, y: 1 } } };
    expect(sketchFreeablePaths(row)).toContain('copy/actions');
    expect(sketchFreeablePaths(row)).not.toContain('copy/actions/cta');
  });
  it('positions never nest: freeing a row rejoins its freed button; a button inside a freed row is refused', () => {
    const block = { ...hero(), free: { 'copy/actions/cta': { x: 1, y: 1 } } };
    expect(sketchSetFree(block, 'copy/actions', { x: 5, y: 6 })).toBe(true);
    expect(block.free).toEqual({ 'copy/actions': { x: 5, y: 6 } });
    expect(sketchSetFree(block, 'copy/actions/cta2', { x: 1, y: 1 })).toBe(false);
    expect(sketchSetFree(block, 'copy', { x: 1, y: 1 })).toBe(false);
    sketchUnfree(block, 'copy/actions');
    expect(block.free).toBeUndefined();
  });
  it('free spots follow their item when a list is reordered or shortened', () => {
    const cut = { ...steps(), free: { 'items/2': { x: 2, y: 2 }, 'items/0': { x: 3, y: 3 } } };
    expect(sketchRemoveNode(cut, 'items/0')).toBe(true);
    expect(cut.free).toEqual({ 'items/1': { x: 2, y: 2 } });
    const single = { ...hero(), free: { 'copy/sub': { x: 1, y: 1 } } };
    expect(sketchRemoveNode(single, 'copy/sub')).toBe(true);
    expect(single.free).toBeUndefined();
  });
  it('review: a reorder from the canvas (movable siblings only) keeps a freed part in its place', () => {
    const list = { ...steps(), free: { 'items/1': { x: 1, y: 1 } } };
    expect(sketchApplyMove(list, 'items', ['2', '0'])).toBe('reload');
    expect(list.items.map((item: any) => item.title)).toEqual(['3', '2', '1']);
    expect(list.free).toEqual({ 'items/1': { x: 1, y: 1 } });
    const copy = { ...hero(), free: { 'copy/headline': { x: 1, y: 1 } } };
    expect(sketchApplyMove(copy, 'copy', ['trust', 'sub', 'actions'])).toBe('live');
    expect(copy.order).toEqual(['headline', 'trust', 'sub', 'actions', 'badge', 'note']);
  });
  it('an inserted element is removed by id', () => {
    const block = { ...hero(), extras: [{ id: 'eab1', kind: 'emoji', value: '✨', x: 1, y: 1 }] };
    expect(sketchCanRemove(block, 'extras/eab1')).toBe(true);
    expect(sketchCanRemove(block, 'extras/zzzz')).toBe(false);
    expect(sketchRemoveNode(block, 'extras/eab1')).toBe(true);
    expect(block.extras).toBeUndefined();
  });
  it('clamps positions and repairs a free map', () => {
    expect(sketchFreePos({ x: 140.04, y: -3, w: 2, r: 8.6 })).toEqual({ x: 100, y: 0, w: 5, r: 9 });
    expect(sketchFreePos({ x: 1, y: 2, r: 0 })).toEqual({ x: 1, y: 2 });
    expect(sketchFreePos({ x: 'a', y: 2 })).toBeUndefined();
    expect(repairSketchFree(hero(), { 'copy/headline': { x: 1, y: 2 }, copy: { x: 1, y: 1 }, 'media/sticker': { x: 1, y: 1 }, 'copy/nope': { x: 1, y: 1 }, 'copy/sub': 'x' })).toEqual({ 'copy/headline': { x: 1, y: 2 } });
    expect(repairSketchFree(hero(), { 'copy/actions/cta': { x: 1, y: 1 }, 'copy/actions': { x: 2, y: 2 } })).toEqual({ 'copy/actions': { x: 2, y: 2 } });
    expect(repairSketchFree(hero(), [])).toBeUndefined();
    expect(sketchListPath('reviews', 'quotes')).toBe('items');
    expect(sketchListPath('split', 'pills')).toBe('copy/pills');
    expect(sketchListPath('hero', 'pills')).toBeUndefined();
  });
});
