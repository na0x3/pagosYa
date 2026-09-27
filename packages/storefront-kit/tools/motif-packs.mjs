#!/usr/bin/env node
/**
 * Draws the identity motif packs (T2a) into packages/storefront-kit/kit/motif-packs/<id>/ from the hand-drawn glyphs in
 * motif-pack-drawings.mjs. Every pack has two glyphs on a 24-unit grid; this tool composes them into five files with one
 * stroke weight per placement, and writes pack.json:
 *   button.svg   24×24, the primary glyph (button icons, card corners, the cart header)
 *   pattern.svg  96×96 tile, both glyphs and two dots (sections marked data-motif-pattern)
 *   divider.svg  64×24, the primary glyph between two small secondary glyphs
 *   sticker.svg  64×64, the primary glyph inside a burst (badges)
 *   empty.svg    64×64, the primary glyph large, the secondary small, a soft ground shadow (empty cart, product page)
 * Output is written exactly as the API's motif sanitiser serialises it, so the kit can inline it byte for byte.
 * Usage: node packages/storefront-kit/tools/motif-packs.mjs            write every pack
 *        node packages/storefront-kit/tools/motif-packs.mjs --check    exit 1 when disk differs from the drawings
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PACKS } from './motif-pack-drawings.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../kit/motif-packs');
const NS = 'http://www.w3.org/2000/svg';
const n = value => String(Math.round(value * 100) / 100);
const svg = (viewBox, strokeWidth, body) => `<svg xmlns="${NS}" viewBox="${viewBox}" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
/** A glyph moved and scaled; its strokes stay `stroke` units wide in the file's own grid. */
const place = (glyph, x, y, scale, stroke, mirror = false) =>
  `<g transform="translate(${n(x)} ${n(y)}) scale(${mirror ? `-${n(scale)} ${n(scale)}` : n(scale)})" stroke-width="${n(stroke / scale)}">${glyph.join('')}</g>`;
function burst(cx, cy, outer, inner, points) {
  const coords = [];
  for (let i = 0; i < points * 2; i++) {
    const radius = i % 2 ? inner : outer, angle = (Math.PI * i) / points - Math.PI / 2;
    coords.push(`${n(cx + radius * Math.cos(angle))},${n(cy + radius * Math.sin(angle))}`);
  }
  return `<polygon points="${coords.join(' ')}" fill="currentColor" fill-opacity=".12"/>`;
}
const DOTS = '<circle cx="78" cy="22" r="1.5" fill="currentColor" stroke="none"/><circle cx="22" cy="78" r="1.5" fill="currentColor" stroke="none"/>';
const drawings = ({ primary, secondary }) => ({
  'button.svg': svg('0 0 24 24', 2, primary.join('')),
  'pattern.svg': svg('0 0 96 96', 1.5, place(primary, 10, 10, 1, 1.5) + place(secondary, 60, 58, 1, 1.5) + DOTS),
  'divider.svg': svg('0 0 64 24', 2, place(secondary, 2, 5, .58, 2) + place(primary, 20, 0, 1, 2) + place(secondary, 62, 5, .58, 2, true)),
  'sticker.svg': svg('0 0 64 64', 2, burst(32, 32, 30, 26, 14) + place(primary, 14, 14, 1.5, 2)),
  'empty.svg': svg('0 0 64 64', 2, '<ellipse cx="26" cy="57" rx="17" ry="3" fill="currentColor" fill-opacity=".12" stroke="none"/>' + place(primary, 6, 14, 1.65, 2) + place(secondary, 44, 2, .75, 2)),
});
const FILE_OF = { button: 'button.svg', pattern: 'pattern.svg', divider: 'divider.svg', sticker: 'sticker.svg', empty: 'empty.svg', product: 'empty.svg', card: 'button.svg', cart: 'button.svg' };
const MOTION = { button: 'bounce', pattern: 'float', divider: 'grow', sticker: 'sway', empty: 'float', product: 'grow', card: 'bounce', cart: 'bounce' };
const manifest = pack => ({ id: pack.id, version: 1, name: pack.name, topics: { es: pack.es, en: pack.en },
  motifs: Object.keys(FILE_OF).map(placement => ({ placement, file: FILE_OF[placement], behavior: pack.motion?.[placement] ?? MOTION[placement] })) });

const check = process.argv.includes('--check');
const problems = [];
const ids = new Set(PACKS.map(pack => pack.id));
if (ids.size !== PACKS.length) problems.push('two packs share an id');
for (const pack of PACKS) {
  const dir = join(root, pack.id);
  const output = { ...drawings(pack), 'pack.json': `${JSON.stringify(manifest(pack), null, 2)}\n` };
  if (!check) {
    mkdirSync(dir, { recursive: true });
    for (const [name, content] of Object.entries(output)) writeFileSync(join(dir, name), content);
    continue;
  }
  for (const [name, content] of Object.entries(output)) if (!existsSync(join(dir, name)) || readFileSync(join(dir, name), 'utf8') !== content) problems.push(`${pack.id}/${name} differs from what the tool draws`);
  if (existsSync(dir)) for (const name of readdirSync(dir).filter(name => !name.startsWith('.'))) if (!(name in output)) problems.push(`${pack.id}/${name} is not drawn by the tool`);
}
if (existsSync(root)) for (const name of readdirSync(root).filter(name => !name.startsWith('.'))) if (!ids.has(name)) problems.push(`${name} is on disk but not in motif-pack-drawings.mjs`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(check ? `${PACKS.length} packs match their drawings` : `drew ${PACKS.length} packs into ${root}`);
