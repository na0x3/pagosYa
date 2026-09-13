// Reproducible import of optional, open-license artwork. Never runs during generation.
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../apps/api/src/stores/source-kit/creative-assets/', import.meta.url));
const fluent = '1ffb34c752ecf5d402f04cfb4b392c77f57c54bc';
const subjects = [
  ['Sparkles', '2728', 'sparkles', 'shine magic celebration'],
  ['Fire', '1f525', 'fire', 'heat grill energy'],
  ['Sunflower', '1f33b', 'sunflower', 'flower garden natural'],
  ['Seedling', '1f331', 'seedling', 'plant organic growth'],
  ['Hot beverage', '2615', 'coffee', 'coffee cafe tea warm'],
  ['Croissant', '1f950', 'croissant', 'bakery breakfast pastry'],
  ['Strawberry', '1f353', 'strawberry', 'fruit dessert berry'],
  ['Lemon', '1f34b', 'lemon', 'citrus fresh summer'],
  ['Avocado', '1f951', 'avocado', 'food fresh green'],
  ['Bread', '1f35e', 'bread', 'bakery artisan food'],
  ['Pizza', '1f355', 'pizza', 'food restaurant slice'],
  ['Red heart', '2764', 'heart', 'love care handmade'],
  ['Rocket', '1f680', 'rocket', 'space launch technology'],
  ['Party popper', '1f389', 'confetti', 'party celebration event'],
  ['Butterfly', '1f98b', 'butterfly', 'nature beauty wings'],
  ['Dog face', '1f436', 'dog', 'pet animal dog'],
];
const catalog = [];
async function download(url, path, kind) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (kind === 'svg' && (!bytes.toString().includes('<svg') || /<script|<foreignObject|\bon\w+\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:)/i.test(bytes.toString()))) throw new Error(`Unsafe SVG: ${url}`);
  if (kind === 'png' && bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`Invalid PNG: ${url}`);
  await mkdir(join(root, path, '..'), { recursive: true });
  await writeFile(join(root, path), bytes);
  return { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
// Fluent provides distinct flat-vector and dimensional PNG styles, not a website theme.
for (const [name, , slug, tags] of subjects) {
  for (const [folder, suffix, extension, family] of [['Flat', 'flat', 'svg', 'fluent-flat'], ['3D', '3d', 'png', 'fluent-3d']]) {
    const upstream = `${name.toLowerCase().replaceAll(' ', '_')}_${suffix}.${extension}`;
    const source = `https://raw.githubusercontent.com/microsoft/fluentui-emoji/${fluent}/assets/${encodeURIComponent(name)}/${folder}/${upstream}`;
    const relative = `${family}/${slug}.${extension}`;
    const integrity = await download(source, relative, extension);
    catalog.push({ id: `${family}/${slug}`, path: `assets/creative/${relative}`, thumbnail: `assets/creative/${relative}`, family, description: `${name}, ${folder === '3D' ? 'dimensional cutout' : 'flat vector illustration'}`, tags: tags.split(' '), license: 'MIT', source, ...integrity });
  }
  console.log(`Imported ${slug}`);
}
await download(`https://raw.githubusercontent.com/microsoft/fluentui-emoji/${fluent}/LICENSE`, 'LICENSE-fluent.txt', 'text');
await writeFile(join(root, 'catalog.json'), JSON.stringify({ version: 1, assets: catalog }, null, 2) + '\n');
console.log(`${catalog.length} local assets, with provenance and license.`);
