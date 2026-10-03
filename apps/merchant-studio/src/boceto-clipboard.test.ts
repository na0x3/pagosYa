import { expect, it } from 'vitest';
import { copyPicks, duplicatePicks, pasteClip } from './boceto-clipboard';

const page = () => ({
  blocks: [
    { id: 'h', type: 'hero', headline: 'Algo dulce', sub: '', cta: 'Ver', href: 'index.html#skb-catalogo', photo: 'assets/a.jpg', free: { 'copy/headline': { x: 10, y: 20 } }, extras: [{ id: 'eab1', kind: 'emoji', value: '🍪', x: 50, y: 50, w: 8 }] },
    { id: 'st', type: 'steps', title: 'T', items: [{ icon: 'a', title: 'Uno', text: '' }, { icon: 'b', title: 'Dos', text: '' }] },
    { id: 'st2', type: 'steps', title: 'U', items: [{ icon: 'c', title: 'Tres', text: '' }, { icon: 'd', title: 'Cuatro', text: '' }, { icon: 'e', title: 'Cinco', text: '' }, { icon: 'f', title: 'Seis', text: '' }] },
    { id: 'fin', type: 'footer', tagline: 'x' },
  ] as any[],
});

it('copies blocks, list items and extras as they are, and fixed parts as inserted elements', () => {
  const sketch = page();
  const clip = copyPicks(sketch.blocks, [{ id: 'st', path: '' }, { id: 'st', path: 'items/1' }, { id: 'h', path: 'extras/eab1' }, { id: 'h', path: 'copy/headline' }, { id: 'h', path: 'copy/actions/cta' }, { id: 'h', path: 'media/photo' }, { id: 'h', path: 'copy/sub' }, { id: 'h', path: 'copy' }]);
  expect(clip.map(item => item.kind)).toEqual(['block', 'item', 'extra', 'extra', 'extra', 'extra']);
  expect(clip[1]).toEqual({ kind: 'item', type: 'steps', field: 'items', item: { icon: 'b', title: 'Dos', text: '' } });
  expect(clip.slice(3).map(item => item.kind === 'extra' && [item.extra.kind, item.extra.value, item.extra.x, item.extra.y, item.extra.href])).toEqual([
    ['text', 'Algo dulce', 10, 20, undefined], ['button', 'Ver', 45, 40, 'index.html#skb-catalogo'], ['photo', 'assets/a.jpg', 45, 40, undefined],
  ]);
  sketch.blocks[1].items[1].title = 'cambiado';
  expect((clip[1] as any).item.title).toBe('Dos'); // deep copies
});

it('pastes into the target block: blocks after it (never after the footer), items into the same list, extras offset', () => {
  const sketch = page();
  const clip = copyPicks(sketch.blocks, [{ id: 'st', path: '' }, { id: 'st', path: 'items/0' }, { id: 'h', path: 'extras/eab1' }]);
  const result = pasteClip(sketch, clip, { blockId: 'st' });
  expect(sketch.blocks.map(block => block.id)).toEqual(['h', 'st', 'st-copia', 'st2', 'fin']);
  expect(sketch.blocks[1].items.map((item: any) => item.title)).toEqual(['Uno', 'Dos', 'Uno']);
  expect(sketch.blocks[1].extras).toEqual([{ id: 'ec001', kind: 'emoji', value: '🍪', x: 53, y: 53, w: 8 }]);
  expect(result).toEqual({ picks: [{ id: 'st-copia', path: '' }, { id: 'st', path: 'items/2' }, { id: 'st', path: 'extras/ec001' }], skipped: 0 });
  pasteClip(sketch, copyPicks(sketch.blocks, [{ id: 'st', path: '' }]), { blockId: 'fin' });
  expect(sketch.blocks.at(-1)!.id).toBe('fin');
  expect(sketch.blocks.map(block => block.id)).toContain('st-copia-2');
});

it('"Pegar aquí" puts extras at the clicked spot, keeping their distances; what does not fit is skipped and counted', () => {
  const sketch = page();
  const two = [...copyPicks(sketch.blocks, [{ id: 'h', path: 'extras/eab1' }]), ...copyPicks(sketch.blocks, [{ id: 'h', path: 'copy/headline' }])];
  pasteClip(sketch, two, { blockId: 'st', at: { x: 80, y: 10 } });
  expect(sketch.blocks[1].extras.map((extra: any) => [extra.x, extra.y])).toEqual([[80, 10], [40, 0]]);
  // the second steps list is full (4): another steps item goes nowhere
  expect(pasteClip(sketch, copyPicks(sketch.blocks, [{ id: 'st', path: 'items/0' }]), { blockId: 'st2' })).toEqual({ picks: [], skipped: 1 });
  // a list item never lands in another kind of block
  expect(pasteClip(sketch, copyPicks(sketch.blocks, [{ id: 'st', path: 'items/0' }]), { blockId: 'h' }).skipped).toBe(1);
  const full = page(); full.blocks[0].extras = Array.from({ length: 12 }, (_, i) => ({ id: `ex${String(i).padStart(2, '0')}`, kind: 'emoji', value: '✨', x: 1, y: 1 }));
  expect(pasteClip(full, two, { blockId: 'h' })).toEqual({ picks: [], skipped: 2 });
  const crowded = { blocks: Array.from({ length: 20 }, (_, i) => ({ id: `b${i}`, type: 'faq', title: 'Q', items: [] })) as any[] };
  expect(pasteClip(crowded, copyPicks(crowded.blocks, [{ id: 'b0', path: '' }]), { blockId: 'b0' }).skipped).toBe(1);
});

it('duplicate copies each pick into its own block, in place', () => {
  const sketch = page();
  const result = duplicatePicks(sketch, [{ id: 'h', path: 'extras/eab1' }, { id: 'st', path: 'items/1' }, { id: 'st2', path: '' }]);
  expect(sketch.blocks[0].extras.map((extra: any) => [extra.id, extra.x])).toEqual([['eab1', 50], ['ec001', 53]]);
  expect(sketch.blocks[1].items.map((item: any) => item.title)).toEqual(['Uno', 'Dos', 'Dos']);
  expect(sketch.blocks.map(block => block.id)).toEqual(['h', 'st', 'st2', 'st2-copia', 'fin']);
  expect(result.picks).toHaveLength(3);
});

it('review: duplicating a long-named block again and again keeps every id unique and short', () => {
  const sketch = { blocks: [{ id: 'a'.repeat(30), type: 'faq', title: 'Q', items: [] }, { id: 'fin', type: 'footer' }] as any[] };
  let pick = { id: sketch.blocks[0].id, path: '' };
  for (let i = 0; i < 8; i++) pick = duplicatePicks(sketch, [pick]).picks[0];
  const ids = sketch.blocks.map(block => block.id);
  expect(new Set(ids).size).toBe(ids.length);
  expect(ids.every(id => /^[a-z0-9-]{1,32}$/.test(id))).toBe(true);
});
