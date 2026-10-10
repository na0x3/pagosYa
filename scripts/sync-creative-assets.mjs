// Reproducible import of open-license artwork (spec 2026-10-08-yapi-illustration-library). Dev-time only: network is
// allowed here and never during generation. Grow the library by editing creative-assets/selection.json, then run
// `node scripts/sync-creative-assets.mjs`.
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { optimize } from 'svgo';

const root = fileURLToPath(new URL('../packages/storefront-kit/kit/creative-assets/', import.meta.url));
const FLUENT = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc';
const ASSETS_TREE = '87c68139ced65dfb0aa34e6ca63dade7db166d9d';
const CLDR_ES = 'https://cdn.jsdelivr.net/npm/cldr-annotations-full@48.2.0/annotations/es/annotations.json';
const raw = path => `https://raw.githubusercontent.com/microsoft/fluentui-emoji/${FLUENT}/assets/${path.split('/').map(encodeURIComponent).join('/')}`;
const MAX_SVG = 60 * 1024, MAX_PNG = 120 * 1024;
const STYLES = [
  { family: 'fluent-flat', folder: 'Flat', tone: 'colour', es: 'ilustración plana a color' },
  { family: 'fluent-color', folder: 'Color', tone: 'colour', es: 'ilustración a color con degradados suaves' },
  { family: 'fluent-mono', folder: 'High Contrast', tone: 'store', es: 'dibujo de línea en el color de la tienda' },
  { family: 'fluent-3d', folder: '3D', tone: 'colour', es: 'figura 3D dimensional' },
];
// Subjects stores already reference keep their first slugs.
const LEGACY = { 'Hot beverage': 'coffee', 'Red heart': 'heart', 'Party popper': 'confetti', 'Dog face': 'dog', 'Dog': 'dog-full-body' };
const slug = name => LEGACY[name] ?? name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function get(url, as = 'json') {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: url.includes('api.github.com') ? { accept: 'application/vnd.github+json' } : {} });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return as === 'json' ? response.json() : Buffer.from(await response.arrayBuffer());
}
async function pool(items, size, task) {
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (next < items.length) { const item = items[next++]; await task(item); } }));
}
function svgFile(bytes, family) {
  let svg = bytes.toString('utf8');
  if (!svg.includes('<svg') || /<script|<foreignObject|<image|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:|data:)/i.test(svg)) throw new Error('unsafe SVG');
  svg = optimize(svg, { multipass: true, plugins: ['preset-default'] }).data;
  if (family === 'fluent-mono') svg = svg.replace(/(fill|stroke)="#[0-9a-fA-F]{3,8}"/g, '$1="currentColor"').replace(/(fill|stroke):#[0-9a-fA-F]{3,8}/g, '$1:currentColor');
  return Buffer.from(svg);
}

const selection = JSON.parse(await readFile(join(root, 'selection.json'), 'utf8'));
const tree = (await get(`https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/${ASSETS_TREE}?recursive=1`)).tree;
if (!Array.isArray(tree)) throw new Error('Could not list the Fluent asset tree');
const blobs = tree.filter(entry => entry.type === 'blob').map(entry => entry.path);
const subjects = tree.filter(entry => entry.type === 'tree' && !entry.path.includes('/')).map(entry => entry.path);
const metadata = {};
await pool(subjects, 24, async name => { metadata[name] = await get(raw(`${name}/metadata.json`)); });
const missing = [...selection.include, ...selection.threeD].filter(name => !metadata[name]);
if (missing.length) throw new Error(`Not in Fluent: ${missing.join(', ')}`);
const chosen = subjects.filter(name => (selection.groups.includes(metadata[name].group) && !selection.exclude.includes(name)) || selection.include.includes(name));
const taken = new Map();
for (const name of chosen) { const other = taken.get(slug(name)); if (other) throw new Error(`${name} and ${other} share the slug ${slug(name)}`); taken.set(slug(name), name); }
const spanish = (await get(CLDR_ES)).annotations.annotations;

for (const style of STYLES) await rm(join(root, style.family), { recursive: true, force: true });
const catalog = [];
let skipped = 0;
await pool(chosen, 16, async name => {
  const meta = metadata[name];
  const es = spanish[meta.glyph.replace(/️/g, '')] ?? spanish[meta.glyph];
  const keywords = { es: [...new Set([...(es?.tts ?? []), ...(es?.default ?? [])])], en: [...new Set([meta.cldr, ...meta.keywords])] };
  if (!keywords.es.length) keywords.es = [meta.cldr];
  for (const style of STYLES) {
    if (style.family === 'fluent-3d' && !selection.threeD.includes(name)) continue;
    // People come in skin tones; the Default folder holds the neutral one.
    const upstream = blobs.find(path => path.startsWith(`${name}/${style.folder}/`)) ?? blobs.find(path => path.startsWith(`${name}/Default/${style.folder}/`));
    if (!upstream) { skipped++; continue; }
    const extension = upstream.endsWith('.png') ? 'png' : 'svg';
    let bytes = await get(raw(upstream), 'bytes');
    if (extension === 'svg') bytes = svgFile(bytes, style.family);
    else if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${upstream}`);
    if (bytes.length > (extension === 'png' ? MAX_PNG : MAX_SVG)) { skipped++; continue; }
    const relative = `${style.family}/${slug(name)}.${extension}`;
    await mkdir(join(root, style.family), { recursive: true });
    await writeFile(join(root, relative), bytes);
    catalog.push({ id: `${style.family}/${slug(name)}`, path: `assets/creative/${relative}`, thumbnail: `assets/creative/${relative}`, family: style.family, subject: slug(name), tone: style.tone, description: `${keywords.es[0]}, ${style.es}`, keywords, tags: keywords.en, license: 'MIT', source: raw(upstream), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
});
catalog.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(join(root, 'LICENSE-fluent.txt'), await get(`https://raw.githubusercontent.com/microsoft/fluentui-emoji/${FLUENT}/LICENSE`, 'bytes'));
await writeFile(join(root, 'catalog.json'), JSON.stringify({ version: 1, assets: catalog }, null, 2) + '\n');
console.log(`${chosen.length} subjects, ${catalog.length} files, ${skipped} skipped (missing style or over budget).`);
