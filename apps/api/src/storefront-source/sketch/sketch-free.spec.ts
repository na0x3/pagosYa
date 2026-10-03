import { renderBlock, SKETCH_BASE_CSS } from './sketch-blocks';
import { stampFree } from './sketch-free';
import { repairSketch } from './sketch-schema';

const ctx = { storeName: 'salv', purpose: 'shop' as const, photos: ['assets/a.jpg'] };
const render = (raw: object, store = ctx) => {
  const { sketch } = repairSketch({ blocks: [raw] }, store);
  return renderBlock(sketch.blocks[0], sketch, store);
};
const tagOf = (markup: string, marker: string) => markup.slice(markup.lastIndexOf('<', markup.indexOf(marker)), markup.indexOf('>', markup.indexOf(marker)) + 1);

it('stamps each freed part with its spot as CSS variables, and nothing else', () => {
  const out = render({ id: 'h', type: 'hero', headline: 'Hola', sub: 'sub', cta: 'Ver', cta2: 'Caja', free: { 'copy/headline': { x: 10, y: 20, w: 40, r: 8 }, 'copy/actions/cta2': { x: 5, y: 80 } } });
  const headline = tagOf(out, 'data-skb-el="headline"');
  expect(headline).toContain('data-skb-free="on"');
  expect(headline).toContain('["--skb-fx" as string]: "10"');
  expect(headline).toContain('["--skb-fw" as string]: "40"');
  expect(headline).toContain('["--skb-fr" as string]: "8"');
  const ghost = tagOf(out, 'data-skb-node={"cta2"}');
  expect(ghost).toContain('["--skb-fy" as string]: "80"');
  expect(ghost).not.toContain('--skb-fw');
  expect(out.match(/data-skb-free/g)).toHaveLength(2);
});

it('merges into an existing style object and skips braces and angle brackets inside expressions', () => {
  const markup = '<section data-skb={"a"} style={{ ["--skb-bg" as string]: "#fff" }}><p data-skb-node={"k"} style={{ left: "1%" }}>{"a<b{c}"}</p><span data-skb-node={"z"}>{"</p>"}</span></section>';
  const out = stampFree(markup, { k: { x: 1, y: 2 }, z: { x: 3, y: 4 } });
  expect(out).toContain('<p data-skb-node={"k"} style={{ ["--skb-fx" as string]: "1", ["--skb-fy" as string]: "2", left: "1%" }} data-skb-free="on">');
  expect(out).toContain('<span data-skb-node={"z"} data-skb-free="on" style={{ ["--skb-fx" as string]: "3", ["--skb-fy" as string]: "4" }}>');
  expect(out).toContain('style={{ ["--skb-bg" as string]: "#fff" }}>');
});

it('a hostile store name in an attribute never names a part', () => {
  const hostile = { ...ctx, storeName: 'x" data-skb-node="photo' };
  const out = render({ id: 'h', type: 'hero', headline: 'H', caption: 'pie', photo: 'assets/a.jpg', free: { 'media/caption': { x: 1, y: 1 } } }, hostile);
  expect(out.match(/data-skb-free/g)).toHaveLength(1);
  expect(tagOf(out, 'data-skb-node={"caption"}')).toContain('data-skb-free="on"');
});

it('renders every kind of inserted element as a layer at the end of its section', () => {
  const out = render({ id: 'sp', type: 'split', headline: 'H', photo: 'assets/a.jpg', extras: [
    { id: 'eab1', kind: 'emoji', value: '🍪', x: 10, y: 10, w: 8 },
    { id: 'eab2', kind: 'text', value: 'Hecho hoy', x: 20, y: 20 },
    { id: 'eab3', kind: 'button', value: 'Escríbenos', href: 'https://wa.me/59170000000', x: 30, y: 30 },
    { id: 'eab4', kind: 'photo', value: 'assets/a.jpg', x: 40, y: 40, w: 22 },
    { id: 'eab5', kind: 'icon', value: 'gift', x: 50, y: 50, r: 15 },
  ] });
  expect(out).toMatch(/<div className="skb-extras" data-skb-group=\{"extras"\}>[\s\S]*<\/div>\s*<\/section>$/);
  expect(tagOf(out, 'data-skb-node={"eab1"}')).toContain('skb-x--emoji');
  expect(tagOf(out, 'data-skb-node={"eab2"}')).toContain('data-skb-field={"extras.1.value"}');
  const button = tagOf(out, 'data-skb-node={"eab3"}');
  expect(button).toContain('href={"https://wa.me/59170000000"}');
  expect(button).toContain('target="_blank"');
  expect(tagOf(out, 'data-skb-node={"eab4"}')).toContain('data-skb-photo={"extras.3.value"}');
  expect(tagOf(out, 'data-skb-node={"eab5"}')).toContain('src={"assets/icons/gift.svg"}');
  expect(out.match(/data-skb-free="on"/g)).toHaveLength(5);
});

it('free spots apply from 900px up only; phones keep everything in the column', () => {
  const split = SKETCH_BASE_CSS.indexOf('@media (min-width: 900px) {\n  .skb [data-skb-free]');
  expect(split).toBeGreaterThan(-1);
  expect(SKETCH_BASE_CSS.slice(split)).toContain('position: absolute');
  const phone = SKETCH_BASE_CSS.slice(0, split);
  expect(phone).not.toMatch(/\[data-skb-free\][^{]*\{[^}]*position: absolute/);
  expect(phone).toContain('.skb-extras { display: flex;');
});
