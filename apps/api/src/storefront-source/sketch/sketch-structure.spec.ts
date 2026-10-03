import { repairSketchLayout, sketchApplyMove, sketchCanMove, sketchCanRemove, sketchFindNode, sketchNodeTree, sketchRemoveNode, sketchReorder, SKETCH_COPY_ORDER } from '@pagosya/shared-types';

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
