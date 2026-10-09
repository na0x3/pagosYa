# YAPI Illustration Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give YAPI a searchable library of professionally drawn illustrations (colour and store-colour), a tool to find and see them, a tool to switch on a motif pack for the whole store, and prompt rules so it stops hand-drawing pictures.

**Architecture:** A dev-time script imports ~529 Fluent Emoji subjects in four styles into `packages/storefront-kit/kit/creative-assets/` with Spanish and English keywords. At run time `source-creative-assets.ts` merges that catalogue with every motif-pack drawing, searches it, and bundles referenced files into snapshots (existing mechanism). Two new agent tools (`search_illustrations` returning a contact-sheet image, `set_motif_pack` held on the toolbox like `pendingTheme`) and a kit `<Illustration>` component (CSS mask in a store colour) complete it.

**Tech Stack:** Node 22 ESM script, svgo 4.1.0 (dev only), NestJS API (TypeScript, Jest), sharp (contact sheet), Playwright (capture), React kit (`@pagosya/ui` = `packages/storefront-kit/kit/ui.tsx`).

**Spec:** `docs/superpowers/specs/2026-10-08-yapi-illustration-library-design.md`

## Global Constraints

- Sources: Fluent Emoji (MIT) at commit `1ffb34c752ecf5d402f04cfb4b392c77f57c54bc`, assets tree `87c68139ced65dfb0aa34e6ca63dade7db166d9d`; in-house motif packs. No OpenMoji.
- Spanish keywords: `https://cdn.jsdelivr.net/npm/cldr-annotations-full@48.2.0/annotations/es/annotations.json` (fetched by the script only; no runtime dependency).
- Budget: whole `creative-assets` folder ≤ 15 MB; one SVG ≤ 60 KB; one PNG ≤ 120 KB.
- `fluent-mono` and motif drawings paint only in `currentColor` or `none`.
- The 16 already-shipped subjects keep their paths: `fluent-flat|fluent-3d/{sparkles,fire,sunflower,seedling,coffee,croissant,strawberry,lemon,avocado,bread,pizza,heart,rocket,confetti,butterfly,dog}`.
- Nothing at run time fetches from the network; the storefront sandbox cannot.
- Pictures vs shapes: the library rule covers pictures only; shapes stay YAPI's own CSS work.
- Owner's dev servers read this working tree (memory: branch switching changes the live app). Do not switch branches; do not run prisma migrate/reset. The API runs in watch mode and reloads by itself.
- Commit only when the owner asks; each "Commit" step stages only that task's files.

## Review Focus

1. Spanish plurals and accents ("helados", "fresas", "corazón", "flores") must find the singular subjects — tested in Task 2.
2. An existing store that already references `assets/creative/fluent-flat/coffee.svg` must keep its art after the re-import — tested in Task 1 (legacy paths) and Task 2 (bundling).
3. A query of only filler words ("de la con") returns no results and a plain message, never a crash or an empty contact sheet — tested in Tasks 2 and 3.
4. A store whose pack was set in an earlier run keeps it on a later edit that does not touch packs, and `null` removes it — tested in Task 4.
5. A mistyped store-colour path renders an invisible span; the browser check must name it — tested in Task 5.

---

### Task 1: Import ~529 subjects in four styles

**Files:**
- Create: `packages/storefront-kit/kit/creative-assets/selection.json`
- Modify: `scripts/sync-creative-assets.mjs` (full rewrite)
- Modify: `package.json` (root devDependency `svgo`)
- Generated: `packages/storefront-kit/kit/creative-assets/{fluent-flat,fluent-color,fluent-mono,fluent-3d}/*`, `catalog.json`, `LICENSE-fluent.txt`
- Test: `apps/api/src/storefront-source/source-creative-assets.catalog.spec.ts`

**Interfaces:**
- Produces: `catalog.json` = `{ version: 1, assets: CatalogEntry[] }` where `CatalogEntry = { id, path, thumbnail, family: 'fluent-flat'|'fluent-color'|'fluent-mono'|'fluent-3d', subject, tone: 'colour'|'store', description, keywords: { es: string[], en: string[] }, tags: string[], license: 'MIT', source, bytes, sha256 }`. `path` = `assets/creative/<family>/<subject>.<svg|png>`; `id` = `<family>/<subject>`.

- [ ] **Step 1: Write the failing catalogue test**

Create `apps/api/src/storefront-source/source-creative-assets.catalog.spec.ts`:

```ts
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const root = kitPath('creative-assets');
const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8')).assets as Array<Record<string, any>>;
const folderBytes = (dir: string): number => readdirSync(dir).reduce((sum, name) => { const path = join(dir, name); return sum + (statSync(path).isDirectory() ? folderBytes(path) : statSync(path).size); }, 0);

describe('creative asset catalogue', () => {
  it('imports the curated subjects in the four Fluent styles', () => {
    expect([...new Set(catalog.map(asset => asset.family))].sort()).toEqual(['fluent-3d', 'fluent-color', 'fluent-flat', 'fluent-mono']);
    expect(catalog.filter(asset => asset.family === 'fluent-flat').length).toBeGreaterThanOrEqual(500);
    expect(catalog.filter(asset => asset.family === 'fluent-mono').length).toBeGreaterThanOrEqual(500);
    expect(catalog.filter(asset => asset.family === 'fluent-3d').length).toBe(60);
  });
  it('keeps every file byte-identical to its record, within budget, MIT-licensed and keyworded in both languages', () => {
    for (const asset of catalog) {
      const bytes = readFileSync(join(root, asset.path.slice('assets/creative/'.length)));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      expect(bytes.length).toBe(asset.bytes);
      expect(bytes.length).toBeLessThanOrEqual(asset.path.endsWith('.png') ? 120 * 1024 : 60 * 1024);
      expect(asset.license).toBe('MIT');
      expect(asset.keywords.es.length).toBeGreaterThan(0);
      expect(asset.keywords.en.length).toBeGreaterThan(0);
      expect(asset.tone).toBe(asset.family === 'fluent-mono' ? 'store' : 'colour');
    }
    expect(folderBytes(root)).toBeLessThanOrEqual(15 * 1024 * 1024);
  });
  it('paints store-colour art only in currentColor, with no external references', () => {
    for (const asset of catalog.filter(entry => entry.family === 'fluent-mono')) {
      const svg = readFileSync(join(root, asset.path.slice('assets/creative/'.length)), 'utf8');
      for (const [, value] of svg.matchAll(/(?:fill|stroke|stop-color)[=:]\s*"?([^";\s>]+)/g)) expect(['none', 'currentColor']).toContain(value);
      expect(svg).not.toMatch(/url\(|href=|<script|<image/i);
    }
  });
  it('keeps the paths of the sixteen subjects stores already use', () => {
    const paths = new Set(catalog.map(asset => asset.path));
    for (const slug of ['sparkles', 'fire', 'sunflower', 'seedling', 'coffee', 'croissant', 'strawberry', 'lemon', 'avocado', 'bread', 'pizza', 'heart', 'rocket', 'confetti', 'butterfly', 'dog']) {
      expect(paths).toContain(`assets/creative/fluent-flat/${slug}.svg`);
      expect(paths).toContain(`assets/creative/fluent-3d/${slug}.png`);
    }
  });
  it('finds ice cream under its Spanish name', () => {
    expect(catalog.find(asset => asset.id === 'fluent-flat/soft-ice-cream')!.keywords.es).toEqual(expect.arrayContaining(['helado']));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-creative-assets.catalog.spec.ts`
Expected: FAIL — only `fluent-flat` and `fluent-3d` exist (32 entries, no `keywords`).

- [ ] **Step 3: Add the curated selection**

Create `packages/storefront-kit/kit/creative-assets/selection.json`:

```json
{
  "groups": ["Food & Drink", "Animals & Nature"],
  "exclude": ["Microbe", "Cockroach", "Mosquito", "Fly", "Worm", "Bug", "Scorpion", "Rat", "Wilted flower", "Empty nest"],
  "include": [
    "Backpack", "Basket", "Bathtub", "Bed", "Bell", "Billed cap", "Bikini", "Bookmark", "Books", "Bubbles", "Briefcase", "Broom", "Bucket", "Calendar", "Camera", "Candle", "Chair", "Clipboard", "Clutch bag", "Coat", "Couch and lamp", "Crayon", "Credit card", "Crown", "Door", "Dress", "Envelope", "Flat shoe", "Folding hand fan", "Fountain pen", "Gear", "Gem stone", "Glasses", "Gloves", "Graduation cap", "Guitar", "Hammer", "Handbag", "Headphone", "High-heeled shoe", "Hiking boot", "Jeans", "Key", "Kimono", "Label", "Laptop", "Light bulb", "Lipstick", "Lotion bottle", "Magnifying glass tilted right", "Megaphone", "Memo", "Microphone", "Mirror", "Mobile phone", "Money bag", "Musical notes", "Necktie", "Notebook with decorative cover", "One-piece swimsuit", "Open book", "Package", "Paintbrush", "Pencil", "Pill", "Purse", "Razor", "Receipt", "Red paper lantern", "Ring", "Running shoe", "Scarf", "Scissors", "Shopping bags", "Shopping cart", "Shorts", "Soap", "Socks", "Sponge", "Sunglasses", "T-shirt", "Thong sandal", "Toolbox", "Toothbrush", "Top hat", "Window", "Womans boot", "Womans clothes", "Womans hat", "Womans sandal", "Wrench",
    "1st place medal", "Admission tickets", "Artist palette", "Balloon", "Basketball", "Bullseye", "Christmas tree", "Confetti ball", "Crystal ball", "Fireworks", "Framed picture", "Game die", "Jack-o-lantern", "Kite", "Magic wand", "Mirror ball", "Party popper", "Piñata", "Puzzle piece", "Ribbon", "Running shirt", "Sewing needle", "Soccer ball", "Sparkler", "Sparkles", "Teddy bear", "Tennis", "Thread", "Ticket", "Trophy", "Video game", "Wrapped gift", "Yarn", "Yo-yo",
    "Check mark button", "Curly loop", "Dotted six-pointed star", "Eight-pointed star", "Fleur-de-lis", "Heavy dollar sign", "Infinity", "Name badge", "New button", "Recycling symbol", "Sparkle",
    "Beaming face with smiling eyes", "Beating heart", "Blue heart", "Brown heart", "Collision", "Dizzy", "Face blowing a kiss", "Face savoring food", "Face with tears of joy", "Ghost", "Green heart", "Grinning cat", "Grinning face", "Grinning face with big eyes", "Grinning face with smiling eyes", "Growing heart", "Heart decoration", "Heart exclamation", "Heart on fire", "Heart with arrow", "Heart with ribbon", "Hugging face", "Hundred points", "Kiss mark", "Light blue heart", "Love letter", "Melting face", "Orange heart", "Partying face", "Pink heart", "Purple heart", "Red heart", "Revolving hearts", "Robot", "Slightly smiling face", "Smiling cat with heart-eyes", "Smiling face", "Smiling face with heart-eyes", "Smiling face with hearts", "Smiling face with smiling eyes", "Smiling face with sunglasses", "Sparkling heart", "Speech balloon", "Star-struck", "Sweat droplets", "Thought balloon", "Two hearts", "White heart", "Winking face", "Yellow heart", "Zany face",
    "Airplane", "Alarm clock", "Beach with umbrella", "Bicycle", "Camping", "Carousel horse", "Castle", "Circus tent", "Cloud", "Comet", "Compass", "Convenience store", "Crescent moon", "Delivery truck", "Department store", "Desert island", "Droplet", "Ferris wheel", "Fire", "Fountain", "Glowing star", "Globe with meridians", "Hourglass not done", "House", "House with garden", "Kick scooter", "Luggage", "Milky way", "Mountain", "Night with stars", "Rainbow", "Ringed planet", "Rock", "Rocket", "Roller skate", "Sailboat", "Shooting star", "Skateboard", "Snowflake", "Snowman", "Star", "Sun", "Sun behind small cloud", "Sun with face", "Sunrise", "Sunset", "Tent", "Umbrella", "Watch", "Water wave", "Wedding", "Wood",
    "Clapping hands", "Crossed fingers", "Flexed biceps", "Folded hands", "Heart hands", "Ok hand", "Palms up together", "Raising hands", "Thumbs up", "Victory hand", "Waving hand", "Writing hand"
  ],
  "threeD": ["Soft ice cream", "Ice cream", "Shaved ice", "Birthday cake", "Shortcake", "Cupcake", "Doughnut", "Cookie", "Croissant", "Bread", "Baguette bread", "Pizza", "Hamburger", "Taco", "Sushi", "Hot beverage", "Teacup without handle", "Bubble tea", "Tropical drink", "Wine glass", "Clinking glasses", "Strawberry", "Cherries", "Peach", "Lemon", "Avocado", "Watermelon", "Grapes", "Red apple", "Banana", "Cactus", "Potted plant", "Sunflower", "Tulip", "Rose", "Bouquet", "Cherry blossom", "Seedling", "Dog face", "Cat face", "Paw prints", "Butterfly", "Honeybee", "Sparkles", "Red heart", "Fire", "Star", "Rainbow", "Party popper", "Wrapped gift", "Balloon", "Crown", "Gem stone", "Shopping bags", "Lipstick", "Dress", "High-heeled shoe", "Rocket", "Light bulb", "Paintbrush"]
}
```

(Verified against the pinned metadata on 2026-10-08: every name exists; 529 subjects; every 3D pick is a chosen subject.)

- [ ] **Step 4: Add svgo as a root dev dependency**

Run: `cd /Users/saramia/pagosYa && pnpm add -Dw svgo@4.1.0`
Expected: root `package.json` devDependencies gains `"svgo": "4.1.0"`; lockfile updated.

- [ ] **Step 5: Rewrite the import script**

Replace `scripts/sync-creative-assets.mjs` with:

```js
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
const LEGACY = { 'Hot beverage': 'coffee', 'Red heart': 'heart', 'Party popper': 'confetti', 'Dog face': 'dog' };
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
  svg = optimize(svg, { multipass: true, plugins: [{ name: 'preset-default', params: { overrides: { removeViewBox: false } } }] }).data;
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
```

- [ ] **Step 6: Run the import**

Run: `cd /Users/saramia/pagosYa && node scripts/sync-creative-assets.mjs && du -sh packages/storefront-kit/kit/creative-assets`
Expected: about `529 subjects, ~1640 files, few skipped`; folder under 15M. If it is over 15M, set `MAX_SVG` for `fluent-color` only to `40 * 1024` (add `const max = style.family === 'fluent-color' ? 40 * 1024 : MAX_SVG;` and use it in the size check), re-run, and record the new figure in the spec's §3 Budget line.

- [ ] **Step 7: Run the catalogue test**

Run: `cd apps/api && npx jest src/storefront-source/source-creative-assets.catalog.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml scripts/sync-creative-assets.mjs packages/storefront-kit/kit/creative-assets apps/api/src/storefront-source/source-creative-assets.catalog.spec.ts
git commit -m "feat(yapi-art): import 529 Fluent subjects in flat, colour, store-colour and 3D styles with Spanish keywords"
```

---

### Task 2: Search, motif-pack entries and bundling

**Files:**
- Modify: `apps/api/src/storefront-source/source-creative-assets.ts` (full rewrite)
- Modify: `apps/api/src/storefront-source/source-creative-assets.spec.ts` (full rewrite)

**Interfaces:**
- Consumes: Task 1 `catalog.json`; `listMotifPacks(): SourceMotifPackManifest[]` and `MotifPackPlacement` from `./source-motif-packs`.
- Produces:
  - `type CreativeTone = 'colour' | 'store'`
  - `type CreativeAsset = { id: string; path: string; thumbnail: string; family: string; subject: string; tone: CreativeTone; description: string; keywords: { es: string[]; en: string[] }; tags: string[]; license: string; source: string; bytes: number; sha256: string }`
  - `creativeAssetCatalog(): CreativeAsset[]` (Fluent + motif drawings, cached per process)
  - `searchCreativeAssets(query: string, limit = 12, tone: CreativeTone | null = null): CreativeAsset[]`
  - `creativeAssetFile(asset: CreativeAsset): SourceProjectFileDto`
  - `withCreativeAssets(files: SourceProjectFileDto[]): SourceProjectFileDto[]` (unchanged signature)

- [ ] **Step 1: Write the failing tests**

Replace `apps/api/src/storefront-source/source-creative-assets.spec.ts` with:

```ts
import { createHash } from 'node:crypto';
import { creativeAssetCatalog, creativeAssetFile, searchCreativeAssets, withCreativeAssets } from './source-creative-assets';

describe('searchCreativeAssets', () => {
  it('finds subjects by Spanish name, plural and accent-free, and by English', () => {
    expect(searchCreativeAssets('helado').map(asset => asset.subject)).toContain('soft-ice-cream');
    expect(searchCreativeAssets('helados').map(asset => asset.subject)).toContain('soft-ice-cream');
    expect(searchCreativeAssets('fresas').map(asset => asset.subject)).toContain('strawberry');
    expect(searchCreativeAssets('corazón').map(asset => asset.subject)).toContain('heart');
    expect(searchCreativeAssets('flores').length).toBeGreaterThan(0);
    expect(searchCreativeAssets('ice cream').map(asset => asset.subject)).toContain('soft-ice-cream');
  });
  it('filters by tone and caps the list', () => {
    expect(searchCreativeAssets('helado', 12, 'store').every(asset => asset.tone === 'store')).toBe(true);
    expect(searchCreativeAssets('helado', 12, 'colour').every(asset => asset.tone === 'colour')).toBe(true);
    expect(searchCreativeAssets('comida').length).toBeLessThanOrEqual(12);
    expect(searchCreativeAssets('helado', 3)).toHaveLength(3);
  });
  it('includes the in-house motif drawings as store-colour art', () => {
    expect(searchCreativeAssets('heladería', 32, 'store').some(asset => asset.family === 'motif-icecream')).toBe(true);
  });
  it('returns nothing for filler words, empty text or unrelated topics', () => {
    expect(searchCreativeAssets('de la con para')).toEqual([]);
    expect(searchCreativeAssets('')).toEqual([]);
    expect(searchCreativeAssets('abogados contratos')).toEqual([]);
  });
  it('keeps the old rocket query working', () => {
    expect(searchCreativeAssets('rocket dimensional', 1)[0].id).toBe('fluent-3d/rocket');
  });
});

describe('creativeAssetFile', () => {
  it('reads every Fluent file and every motif drawing byte-identical to its record', () => {
    for (const asset of creativeAssetCatalog()) {
      const file = creativeAssetFile(asset);
      const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
    }
  });
});

describe('withCreativeAssets', () => {
  it('bundles referenced colour, store-colour and motif art with one Fluent licence, and nothing unreferenced', () => {
    const source = { path: 'components/home.tsx', content: '<img src="/assets/creative/fluent-flat/coffee.svg"/><Illustration src="/assets/creative/fluent-mono/soft-ice-cream.svg"/><Illustration src="/assets/creative/motif-icecream/sticker.svg"/>' };
    const bundled = withCreativeAssets([source]);
    expect(bundled.map(file => file.path).sort()).toEqual([source.path, 'assets/creative/fluent-flat/coffee.svg', 'assets/creative/fluent-mono/soft-ice-cream.svg', 'assets/creative/motif-icecream/sticker.svg', 'assets/creative/LICENSE-fluent.txt', 'assets/creative/catalog.json'].sort());
    expect(withCreativeAssets(bundled)).toEqual(bundled);
  });
  it('ignores a misspelt path instead of failing, and adds nothing to a page without art', () => {
    expect(withCreativeAssets([{ path: 'components/home.tsx', content: '<img src="/assets/creative/fluent-flat/ice-creem.svg"/>' }])).toHaveLength(1);
    expect(withCreativeAssets([{ path: 'index.html', content: '<h1>Sin arte</h1>' }])).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-creative-assets.spec.ts`
Expected: FAIL — no `subject`/`tone` on results, no motif entries, plurals do not match.

- [ ] **Step 3: Rewrite the module**

Replace `apps/api/src/storefront-source/source-creative-assets.ts` with:

```ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SourceProjectFileDto } from './dto/save-source-project.dto';
import { kitPath } from '@pagosya/storefront-kit';
import { listMotifPacks, type MotifPackPlacement } from './source-motif-packs';

export type CreativeTone = 'colour' | 'store';
export type CreativeAsset = { id: string; path: string; thumbnail: string; family: string; subject: string; tone: CreativeTone; description: string; keywords: { es: string[]; en: string[] }; tags: string[]; license: string; source: string; bytes: number; sha256: string };
const root = kitPath('creative-assets');
const MOTIF_PATH = /^assets\/creative\/motif-([a-z0-9]+(?:-[a-z0-9]+)*)\/([a-z0-9]+(?:-[a-z0-9]+)*\.svg)$/;
const PLACEMENT_ES: Record<MotifPackPlacement, string> = { button: 'motivo de botón', pattern: 'patrón', divider: 'separador', sticker: 'sticker', empty: 'ilustración de estado vacío', product: 'motivo de producto', card: 'motivo de tarjeta', cart: 'motivo del carrito' };

/** Every motif-pack drawing as store-colour art; the file stays in its pack folder (see sourcePath). */
function motifPackAssets(): CreativeAsset[] {
  return listMotifPacks().flatMap(pack => pack.motifs.map(motif => {
    const bytes = readFileSync(join(kitPath('motif-packs'), pack.id, motif.file));
    const path = `assets/creative/motif-${pack.id}/${motif.file}`;
    const name = motif.file.replace(/\.svg$/, '');
    return { id: `motif-${pack.id}/${name}`, path, thumbnail: path, family: `motif-${pack.id}`, subject: `${pack.id}-${name}`, tone: 'store' as const, description: `${pack.name}: ${PLACEMENT_ES[motif.placement]}`, keywords: { es: pack.topics.es, en: pack.topics.en }, tags: pack.topics.en, license: 'pagosYa', source: `motif-packs/${pack.id}/${motif.file}`, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }));
}
let catalog: CreativeAsset[] | undefined;
/** The Fluent catalogue plus every motif-pack drawing, read once per process. */
export function creativeAssetCatalog(): CreativeAsset[] {
  return catalog ??= [...JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8')).assets, ...motifPackAssets()];
}

const normalize = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (text: string) => normalize(text).match(/[a-z0-9]+/g) || [];
/** Filler words would match every Spanish CLDR phrase ("cucurucho de helado"). */
const STOP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'y', 'o', 'con', 'para', 'en', 'por', 'a', 'al', 'the', 'of', 'and', 'with', 'for', 'in']);
/** "helados", "fresas", "flores" and "flowers" meet their singular keywords. */
const variants = (word: string) => [word, ...(word.length > 3 && word.endsWith('s') ? [word.slice(0, -1)] : []), ...(word.length > 4 && word.endsWith('es') ? [word.slice(0, -2)] : [])];
const synonyms: Record<string, string> = { cafe: 'coffee', cafeteria: 'coffee', pan: 'bread', panaderia: 'bakery', pasteleria: 'pastry', frutilla: 'strawberry', palta: 'avocado', mascotas: 'pet', parrilla: 'grill', fiesta: 'party', heladeria: 'helado' };
const FAMILY_ORDER = ['fluent-flat', 'fluent-color', 'fluent-mono', 'fluent-3d'];
const familyRank = (family: string) => { const index = FAMILY_ORDER.indexOf(family); return index < 0 ? FAMILY_ORDER.length : index; };
const vocabularies = new WeakMap<CreativeAsset, Set<string>>();
const vocabulary = (asset: CreativeAsset) => {
  let found = vocabularies.get(asset);
  if (!found) vocabularies.set(asset, found = new Set(words(`${asset.subject.replace(/-/g, ' ')} ${asset.family} ${asset.description} ${asset.keywords.es.join(' ')} ${asset.keywords.en.join(' ')}`)));
  return found;
};

/** Retrieve by subject or style, Spanish or English, without choosing a visual identity for the model. */
export function searchCreativeAssets(query: string, limit = 12, tone: CreativeTone | null = null): CreativeAsset[] {
  const terms = [...new Set(words(query).filter(word => !STOP.has(word)).flatMap(word => [word, synonyms[word]].filter(Boolean) as string[]))];
  if (!terms.length) return [];
  return creativeAssetCatalog().filter(asset => !tone || asset.tone === tone).map(asset => {
    const known = vocabulary(asset);
    const subject = new Set(words(asset.subject.replace(/-/g, ' ')));
    const score = terms.reduce((sum, term) => sum + (variants(term).some(v => known.has(v)) ? 1 : 0) + (variants(term).some(v => subject.has(v)) ? 1 : 0), 0);
    return { asset, score };
  }).filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.asset.subject.localeCompare(b.asset.subject) || familyRank(a.asset.family) - familyRank(b.asset.family) || a.asset.family.localeCompare(b.asset.family))
    .slice(0, Math.max(0, Math.min(limit, 32))).map(result => result.asset);
}

function sourcePath(path: string): string {
  const motif = path.match(MOTIF_PATH);
  return motif ? join(kitPath('motif-packs'), motif[1], motif[2]) : join(root, path.slice('assets/creative/'.length));
}
export function creativeAssetFile(asset: CreativeAsset): SourceProjectFileDto {
  const bytes = readFileSync(sourcePath(asset.path));
  return { path: asset.path, content: bytes.toString(asset.path.endsWith('.svg') ? 'utf8' : 'base64'), encoding: asset.path.endsWith('.svg') ? 'utf8' : 'base64' };
}

export function withCreativeAssets(files: SourceProjectFileDto[]): SourceProjectFileDto[] {
  const source = files.filter(file => /\.(html|css|tsx|jsx|js)$/.test(file.path) && !file.path.startsWith('_compiled/')).map(file => file.content).join('\n');
  const result = [...files];
  const selected = creativeAssetCatalog().filter(asset => source.includes(asset.path) || result.some(file => file.path === asset.path));
  for (const asset of selected) if (!result.some(file => file.path === asset.path)) result.push(creativeAssetFile(asset));
  if (!selected.length) return result;
  const licensePath = 'assets/creative/LICENSE-fluent.txt';
  if (selected.some(asset => asset.family.startsWith('fluent-')) && !result.some(file => file.path === licensePath)) result.push({ path: licensePath, content: readFileSync(join(root, 'LICENSE-fluent.txt'), 'utf8') });
  const manifest = 'assets/creative/catalog.json';
  return [...result.filter(file => file.path !== manifest), { path: manifest, content: JSON.stringify({ version: 1, assets: selected }, null, 2) + '\n' }];
}
```

`source-motif-packs.ts` already exports `MotifPackPlacement` and does not import this module (no cycle).

- [ ] **Step 4: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/source-creative-assets`
Expected: PASS (both spec files). If `corazón` fails, inspect `fluent-flat/heart` `keywords.es` in `catalog.json` (CLDR gives "corazón rojo"; `normalize` strips the accent).

- [ ] **Step 5: Check the existing generation caller still compiles**

Run: `cd apps/api && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i creative`
Expected: no output (`source-generation.service.ts:457` calls `searchCreativeAssets(text)` and keeps `.png` results; the signature stays compatible).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/source-creative-assets.ts apps/api/src/storefront-source/source-creative-assets.spec.ts
git commit -m "feat(yapi-art): search the illustration library in Spanish and English, with motif drawings and a tone filter"
```

---

### Task 3: `search_illustrations` tool with a contact sheet

**Files:**
- Create: `apps/api/src/storefront-source/agent/agent-illustrations.ts`
- Create: `apps/api/src/storefront-source/agent/agent-illustrations.spec.ts`
- Modify: `apps/api/src/storefront-source/agent/agent-tools.ts` (type union line 19, `AGENT_TOOLS`, `execute` switch)

**Interfaces:**
- Consumes: `searchCreativeAssets`, `creativeAssetFile`, `CreativeAsset`, `CreativeTone` (Task 2).
- Produces: `illustrationSheet(assets: CreativeAsset[]): Promise<string>` (JPEG data URL, 640 px wide); `searchIllustrations(query: string, tone: CreativeTone | null): Promise<{ output: string; image?: string }>`; tool `'search_illustrations'` in `AgentToolName`.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/storefront-source/agent/agent-illustrations.spec.ts`:

```ts
import sharp from 'sharp';
import { searchIllustrations } from './agent-illustrations';
import { AgentToolbox, AGENT_TOOLS } from './agent-tools';
import { AgentWorkspace } from './agent-workspace';

const toolbox = () => new AgentToolbox({ workspace: new AgentWorkspace([], { redesign: false }), previous: [], base: {} as never, instruction: 'dibujos de helado', purpose: 'shop', maxScreenshots: 0 } as never);

describe('search_illustrations', () => {
  it('returns numbered paths and a contact sheet the model can look at', async () => {
    const result = await searchIllustrations('helado', null);
    const { matches, use } = JSON.parse(result.output);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches.length).toBeLessThanOrEqual(12);
    expect(matches[0]).toEqual(expect.objectContaining({ n: 1, path: expect.stringMatching(/^assets\/creative\//), tone: expect.stringMatching(/^(colour|store)$/) }));
    expect(use).toContain('<Illustration');
    expect(result.image).toMatch(/^data:image\/jpeg;base64,/);
    expect((await sharp(Buffer.from(result.image!.split(',')[1], 'base64')).metadata()).width).toBe(640);
  });
  it('says plainly when nothing matches, without a sheet', async () => {
    const result = await searchIllustrations('de la con', null);
    expect(result.output).toMatch(/No hay ilustraciones/);
    expect(result.image).toBeUndefined();
  });
  it('is a strict tool the toolbox runs, recording a step', async () => {
    const tool = AGENT_TOOLS.find(t => t.name === 'search_illustrations') as any;
    expect(tool.strict).toBe(true);
    expect(Object.keys(tool.parameters.properties).sort()).toEqual(['query', 'tone']);
    const box = toolbox();
    const result = await box.run('search_illustrations', JSON.stringify({ query: 'fresa', tone: 'colour' }));
    expect(JSON.parse(result.output).matches.every((match: any) => match.tone === 'colour')).toBe(true);
    expect(box.steps.at(-1)).toEqual(expect.objectContaining({ kind: 'search_illustrations', label: 'Buscó ilustraciones: fresa' }));
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-illustrations.spec.ts`
Expected: FAIL — `Cannot find module './agent-illustrations'`.

- [ ] **Step 3: Implement the sheet and the tool output**

Create `apps/api/src/storefront-source/agent/agent-illustrations.ts`:

```ts
import sharp from 'sharp';
import { creativeAssetFile, searchCreativeAssets, type CreativeAsset, type CreativeTone } from '../source-creative-assets';

const CELL = 160, PAD = 20, COLUMNS = 4;
/** The matches on one light sheet, numbered like the JSON list, so the model chooses by sight. Store-colour art
 * (currentColor) renders in a neutral ink. */
export async function illustrationSheet(assets: CreativeAsset[]): Promise<string> {
  const width = COLUMNS * CELL, height = Math.ceil(assets.length / COLUMNS) * CELL;
  const tiles = await Promise.all(assets.map(async (asset, index) => {
    const file = creativeAssetFile(asset);
    const bytes = Buffer.from(file.content, file.encoding === 'base64' ? 'base64' : 'utf8');
    const art = await sharp(bytes, { density: 288 }).resize(CELL - 2 * PAD, CELL - 2 * PAD, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return { input: art, left: (index % COLUMNS) * CELL + PAD, top: Math.floor(index / COLUMNS) * CELL + PAD };
  }));
  const labels = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${assets.map((_, index) => `<text x="${(index % COLUMNS) * CELL + 8}" y="${Math.floor(index / COLUMNS) * CELL + 18}" font-family="sans-serif" font-size="15" font-weight="700" fill="#6b6459">${index + 1}</text>`).join('')}</svg>`);
  const sheet = await sharp({ create: { width, height, channels: 3, background: '#f6f3ec' } }).composite([...tiles, { input: labels, left: 0, top: 0 }]).jpeg({ quality: 80 }).toBuffer();
  return 'data:image/jpeg;base64,' + sheet.toString('base64');
}

export async function searchIllustrations(query: string, tone: CreativeTone | null): Promise<{ output: string; image?: string }> {
  const matches = searchCreativeAssets(query, 12, tone);
  if (!matches.length) return { output: `No hay ilustraciones para «${query}». Prueba otra palabra en español o inglés, o el tema general. Si nada sirve, dibuja la figura a mano siguiendo la guía de ILLUSTRATIONS.` };
  const list = matches.map((asset, index) => ({ n: index + 1, path: asset.path, subject: asset.subject, family: asset.family, tone: asset.tone, description: asset.description }));
  const use = 'Colour art: <img src="/PATH" alt="" aria-hidden="true">. Store-colour art: <Illustration src="/PATH" tone="accent" size={96} /> imported from @pagosya/ui (tone: ink, accent, onAccent, paper, surface or a store CSS variable such as var(--butter)). Copy PATH exactly. One family per page.';
  return { output: JSON.stringify({ matches: list, use }), image: await illustrationSheet(matches) };
}
```

- [ ] **Step 4: Register the tool**

In `apps/api/src/storefront-source/agent/agent-tools.ts`:

1. Import beside the other agent imports:
```ts
import { searchIllustrations } from './agent-illustrations';
```
2. Append `| 'search_illustrations'` to the `AgentToolName` union (line 19).
3. Add to `AGENT_TOOLS` directly after the `inspect_asset` entry:
```ts
  tool('search_illustrations', 'Busca dibujos profesionales (ilustraciones de objetos, comida, animales, caras, plantas, símbolos) por tema, en español o inglés, ANTES de dibujar una figura a mano. Devuelve hasta 12 rutas numeradas y una hoja con las imágenes. tone: colour (a color), store (línea de un color que toma la paleta de la tienda) o null (ambos). No sirve para formas de diseño (bordes, sombras, bloques, ondas).', { query: text, tone: nullableEnum(['colour', 'store']) }),
```
4. Add to `switch (name)` in `execute`, before `case 'inspect_project'`:
```ts
      case 'search_illustrations': {
        const query = String(args.query || '').slice(0, 80);
        step('search_illustrations', `Buscó ilustraciones: ${query}`);
        return searchIllustrations(query, args.tone === 'colour' || args.tone === 'store' ? args.tone : null);
      }
```

- [ ] **Step 5: Run the tests**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-illustrations.spec.ts src/storefront-source/agent/agent-tools.spec.ts`
Expected: PASS. If an existing test asserts the exact `AGENT_TOOLS` name list, add `'search_illustrations'` to it.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/storefront-source/agent/agent-illustrations.ts apps/api/src/storefront-source/agent/agent-illustrations.spec.ts apps/api/src/storefront-source/agent/agent-tools.ts
git commit -m "feat(yapi-art): search_illustrations returns numbered paths and a contact sheet"
```

---

### Task 4: `set_motif_pack` for the whole store

**Files:**
- Modify: `apps/api/src/storefront-source/source-motif-packs.ts` (append two functions)
- Modify: `apps/api/src/storefront-source/source-motif-packs.spec.ts` (append tests)
- Modify: `apps/api/src/storefront-source/agent/agent-tools.ts`
- Create: `apps/api/src/storefront-source/agent/agent-tools.motif-pack.spec.ts`
- Modify: `apps/api/src/storefront-source/source-generation.service.ts` (~605, ~1177, ~1182, ~1210–1217, ~1382)

**Interfaces:**
- Consumes: `loadMotifPack`, `sanitizeRuntimeMotifPack`, `listMotifPacks`, `SourceRuntimeMotifPack` (existing).
- Produces:
  - `chosenMotifPack(choice: string | null | undefined, previous: unknown): SourceRuntimeMotifPack | undefined`
  - `snapshotWithMotifPack<S extends { files: Array<{ path: string; content: string }> }>(snapshot: S, pack: SourceRuntimeMotifPack | undefined): S`
  - `AgentToolbox.pendingMotifPack: string | null | undefined` (undefined = untouched this run, null = remove, string = pack id)

- [ ] **Step 1: Write the failing pure-function tests**

Append to `apps/api/src/storefront-source/source-motif-packs.spec.ts` (merge the names into its existing `./source-motif-packs` import if it has one):

```ts
import { chosenMotifPack, loadMotifPack, snapshotWithMotifPack } from './source-motif-packs';

describe('chosenMotifPack', () => {
  it("uses this run's pack, removes it on null, and otherwise keeps what the store had", () => {
    const icecream = loadMotifPack('icecream')!;
    expect(chosenMotifPack('icecream', undefined)).toEqual(icecream);
    expect(chosenMotifPack(null, icecream)).toBeUndefined();
    expect(chosenMotifPack(undefined, icecream)?.id).toBe('icecream');
    expect(chosenMotifPack(undefined, undefined)).toBeUndefined();
    expect(chosenMotifPack('no-such-pack', icecream)).toBeUndefined();
  });
});

describe('snapshotWithMotifPack', () => {
  const snapshot = { files: [{ path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"slug":"dacho","motifPack":{"id":"coffee","motifs":[]}};' }, { path: 'index.html', content: '<h1>x</h1>' }] };
  it('sets, replaces and removes config.motifPack without touching other keys or files', () => {
    const set = snapshotWithMotifPack(snapshot, loadMotifPack('icecream'));
    const config = JSON.parse(set.files[0].content.replace(/^window\.PAGOSYA_CONFIG = /, '').replace(/;$/, ''));
    expect(config.slug).toBe('dacho');
    expect(config.motifPack.id).toBe('icecream');
    expect(set.files[1]).toBe(snapshot.files[1]);
    expect(snapshotWithMotifPack(snapshot, undefined).files[0].content).not.toContain('motifPack');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-packs.spec.ts`
Expected: FAIL — `chosenMotifPack is not a function`.

- [ ] **Step 3: Implement the two functions**

Append to `apps/api/src/storefront-source/source-motif-packs.ts`:

```ts
/** config.js `motifPack` at save: YAPI's choice this run wins (a pack id, or null to remove it); untouched (undefined),
 * the store keeps the pack it had, re-sanitised. */
export function chosenMotifPack(choice: string | null | undefined, previous: unknown): SourceRuntimeMotifPack | undefined {
  if (choice === null) return undefined;
  if (typeof choice === 'string') return loadMotifPack(choice);
  return sanitizeRuntimeMotifPack(previous);
}

/** The draft's config.js with the pack set or removed, so previews, screenshots and verify show it. */
export function snapshotWithMotifPack<S extends { files: Array<{ path: string; content: string }> }>(snapshot: S, pack: SourceRuntimeMotifPack | undefined): S {
  return { ...snapshot, files: snapshot.files.map(file => {
    if (file.path !== 'config.js') return file;
    const match = file.content.match(/^\s*window\.PAGOSYA_CONFIG\s*=\s*([\s\S]*?);?\s*$/);
    if (!match) return file;
    const { motifPack: _previous, ...config } = JSON.parse(match[1]);
    return { ...file, content: `window.PAGOSYA_CONFIG = ${JSON.stringify(pack ? { ...config, motifPack: pack } : config)};` };
  }) };
}
```

- [ ] **Step 4: Run the pure tests**

Run: `cd apps/api && npx jest src/storefront-source/source-motif-packs.spec.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing tool test**

Create `apps/api/src/storefront-source/agent/agent-tools.motif-pack.spec.ts`:

```ts
import { AgentToolbox, AGENT_TOOLS } from './agent-tools';
import { AgentWorkspace } from './agent-workspace';
import { listMotifPacks } from '../source-motif-packs';

const toolbox = () => new AgentToolbox({ workspace: new AgentWorkspace([], { redesign: false }), previous: [], base: {} as never, instruction: 'heladería divertida', purpose: 'shop', maxScreenshots: 0 } as never);
const call = (box: AgentToolbox, id: string | null) => box.run('set_motif_pack', JSON.stringify({ id }));

describe('set_motif_pack', () => {
  it('lists every valid pack as a strict nullable enum', () => {
    const tool = AGENT_TOOLS.find(t => t.name === 'set_motif_pack') as any;
    expect(tool.strict).toBe(true);
    expect(tool.parameters.properties.id.enum).toEqual([...listMotifPacks().map(pack => pack.id), null]);
  });
  it('holds the chosen pack for the save and reports its placements', async () => {
    const box = toolbox();
    const { output } = await call(box, 'icecream');
    expect(box.pendingMotifPack).toBe('icecream');
    expect(output).toContain('icecream');
    expect(output).toMatch(/sticker|button|divider/);
    expect(box.steps.at(-1)?.kind).toBe('set_motif_pack');
  });
  it('removes with null and refuses an unknown pack, leaving the choice unchanged', async () => {
    const box = toolbox();
    await call(box, null);
    expect(box.pendingMotifPack).toBeNull();
    expect((await call(box, 'unicorns')).output).toMatch(/no existe/);
    expect(box.pendingMotifPack).toBeNull();
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-tools.motif-pack.spec.ts`
Expected: FAIL — tool not found.

- [ ] **Step 7: Add the tool to the toolbox**

In `apps/api/src/storefront-source/agent/agent-tools.ts`:

1. Import:
```ts
import { chosenMotifPack, listMotifPacks, loadMotifPack, snapshotWithMotifPack } from '../source-motif-packs';
```
2. Append `| 'set_motif_pack'` to `AgentToolName`.
3. Add to `AGENT_TOOLS` after the `set_account_theme` entry:
```ts
  tool('set_motif_pack', `Activa para toda la tienda un paquete de motivos dibujados por pagosYa (botones, separadores, patrón, estados vacíos), pintados con la paleta de la tienda, o null para quitarlo. Solo si el tema de la tienda coincide con el paquete y la identidad es lúdica; nunca en una identidad seria o minimalista. Paquetes: ${listMotifPacks().map(pack => `${pack.id} (${pack.name})`).join(', ')}.`, { id: nullableEnum(listMotifPacks().map(pack => pack.id)) }),
```
4. Add the field after `pendingAccountTheme`:
```ts
  /** The motif pack YAPI chose this run: a pack id, null to remove the store's pack, undefined when untouched. */
  pendingMotifPack: string | null | undefined = undefined;
```
5. In `previewSnapshot()`, replace its `return` line with:
```ts
    const accounted = this.pendingAccountTheme ? snapshotWithAccountTheme(themed, this.pendingAccountTheme) : themed;
    return this.pendingMotifPack === undefined ? accounted : snapshotWithMotifPack(accounted, chosenMotifPack(this.pendingMotifPack, undefined));
```
6. In `run()`, add `const pack = this.pendingMotifPack;` after `const theme = this.pendingTheme;`, and change the preview condition to `(version !== this.workspace.version || theme !== this.pendingTheme || pack !== this.pendingMotifPack)`.
7. Add `'set_motif_pack'` to the `taskRequired` guard array in `execute` (the one that lists `'set_product_card_theme'`).
8. Add before `case 'finish'`:
```ts
      case 'set_motif_pack': {
        const id = args.id === null ? null : String(args.id);
        const pack = id === null ? undefined : loadMotifPack(id);
        if (id !== null && !pack) return { output: `El paquete ${id} no existe o no es válido. Elige uno de la lista o null.` };
        this.pendingMotifPack = id;
        this.lastVerify = null;
        step('set_motif_pack', pack ? `Activó el paquete de motivos ${pack.id}` : 'Quitó el paquete de motivos');
        return { output: pack ? `Paquete ${pack.id} activado para toda la tienda: ${pack.motifs.map(motif => motif.placement).join(', ')}. Míralo con screenshot antes de terminar.` : 'Paquete de motivos quitado de la tienda.' };
      }
```
9. In `plan_task`, extend `if (this.requirements.length && (ws.changedPaths().length || this.pendingTheme))` to `(ws.changedPaths().length || this.pendingTheme || this.pendingMotifPack !== undefined)`.

- [ ] **Step 8: Carry the choice through checkpoint, resume and save**

In `apps/api/src/storefront-source/source-generation.service.ts`:

1. Import `chosenMotifPack` from `./source-motif-packs` (merge into an existing import from that module if present).
2. After `let agentAccountTheme ...` (~605): `let agentMotifPack: AgentToolbox['pendingMotifPack'] = undefined;`
3. In the resume block after `toolbox.pendingAccountTheme = ...` (~1177): `toolbox.pendingMotifPack = typeof checkpoint.motifPack === 'string' || checkpoint.motifPack === null ? checkpoint.motifPack : undefined;`
4. In `saveCheckpoint`'s `checkpoint: { ... }` object (~1182), next to the existing `accountTheme` entry: `...(toolbox.pendingMotifPack !== undefined ? { motifPack: toolbox.pendingMotifPack } : {}),`
5. In the two conditions that treat a pending theme as a change (~1210 before `acceptIfBuildable`, ~1214 "YAPI terminó sin cambiar la tienda"), add `|| toolbox.pendingMotifPack !== undefined` next to `toolbox.pendingTheme`.
6. After `agentAccountTheme = toolbox.pendingAccountTheme;` (~1217): `agentMotifPack = toolbox.pendingMotifPack;`
7. Before `const config = {` (~1382): `const motifPack = chosenMotifPack(agentMotifPack, previousConfig.motifPack);` and inside the config object, after `...(accountTheme ? { accountTheme } : {}),` add `...(motifPack ? { motifPack } : {}),`.

- [ ] **Step 9: Run the tests and typecheck**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-tools.motif-pack.spec.ts src/storefront-source/source-motif-packs.spec.ts src/storefront-source/agent/agent-tools.spec.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS; no type errors.

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/storefront-source/source-motif-packs.ts apps/api/src/storefront-source/source-motif-packs.spec.ts apps/api/src/storefront-source/agent/agent-tools.ts apps/api/src/storefront-source/agent/agent-tools.motif-pack.spec.ts apps/api/src/storefront-source/source-generation.service.ts
git commit -m "feat(yapi-art): set_motif_pack switches a pack on for the whole store, kept across later edits"
```

---

### Task 5: `<Illustration>` in the kit and a check for missing art

**Files:**
- Modify: `packages/storefront-kit/kit/ui.tsx` (new export after `Badge`, ~line 515)
- Modify: `apps/api/src/storefront-source/agent/agent-capture.ts` (health check ~line 73 and ~line 100)
- Modify: `apps/api/src/storefront-source/agent/agent-capture.spec.ts`

**Interfaces:**
- Consumes: CSS variables `--ui-ink`, `--ui-accent`, `--ui-on-accent`, `--ui-paper`, `--ui-surface` (set by `themeCss`); `withCreativeAssets` bundling via `agentPreviewSnapshot` (Task 2).
- Produces: `Illustration({ src, tone = 'accent', size = 96, label, className })` exported from `@pagosya/ui`; DOM marker `data-illustration="<src>"` on store-colour art; capture error `Ilustración no disponible: <src>`.

- [ ] **Step 1: Write the failing capture test**

In `apps/api/src/storefront-source/agent/agent-capture.spec.ts`, add after the `compiles an edited draft…` test:

```ts
  it('paints store-colour art with a mask, shows colour art as an image, and names a missing illustration', async () => {
    const base = await templateDemoRevision(listTemplates().find(t => t.id === 'pausa')!, templateSourceFiles('pausa'));
    const art = '<Illustration src="/assets/creative/fluent-mono/soft-ice-cream.svg" tone="accent" size={80} /><Illustration src="/assets/creative/fluent-flat/coffee.svg" label="Café" /><Illustration src="/assets/creative/fluent-mono/no-such-thing.svg" />';
    const authored = base.files.filter(f => nextSourceFile(f.path)).map(f => f.path === 'components/home.tsx' ? { ...f, content: `import { Illustration as Illustration } from '@pagosya/ui';\n${f.content.replace('</h1>', `</h1>${art}`)}` } : f);
    const snapshot = await agentPreviewSnapshot(base, authored);
    expect(snapshot.files.some(f => f.path === 'assets/creative/fluent-mono/soft-ice-cream.svg')).toBe(true);
    const shot = await captureAgentDraft(snapshot, 390);
    expect(shot.errors).toEqual(['Ilustración no disponible: /assets/creative/fluent-mono/no-such-thing.svg']);
  });
```

(If `pausa`'s `components/home.tsx` already imports from `@pagosya/ui`, a second import of a different name is still valid TypeScript; if the compiler rejects a duplicate import, merge `Illustration` into the existing import instead.)

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-capture.spec.ts -t "store-colour art"`
Expected: FAIL — `Illustration` is not exported by `@pagosya/ui`.

- [ ] **Step 3: Add the component to the kit**

In `packages/storefront-kit/kit/ui.tsx`, after the `Badge` export:

```tsx
const ILLUSTRATION_TONES: Record<string, string> = { ink: 'var(--ui-ink)', accent: 'var(--ui-accent)', onAccent: 'var(--ui-on-accent)', paper: 'var(--ui-paper)', surface: 'var(--ui-surface)' };
/** A picture from the illustration library (assets/creative/…). Store-colour art (fluent-mono, motif packs) is painted
 * in a store colour through a CSS mask; colour art is a plain image. Decorative unless a label is given. */
export function Illustration({ src, tone = 'accent', size = 96, label, className }: { src: string; tone?: 'ink' | 'accent' | 'onAccent' | 'paper' | 'surface' | (string & {}); size?: number; label?: string; className?: string }) {
  if (!/assets\/creative\/(?:fluent-mono|motif-[a-z0-9-]+)\//.test(src)) return <img className={className} src={src} alt={label || ''} aria-hidden={label ? undefined : true} width={size} height={size} />;
  const mask = `url("${src}") center / contain no-repeat`;
  return <span className={['ui-illustration', className].filter(Boolean).join(' ')} data-illustration={src} {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    style={{ display: 'inline-block', width: size, height: size, flex: 'none', backgroundColor: ILLUSTRATION_TONES[tone] ?? tone, WebkitMask: mask, mask }} />;
}
```

- [ ] **Step 4: Report missing illustrations in the capture health check**

In `apps/api/src/storefront-source/agent/agent-capture.ts`:

1. In the `health` object returned by `page.evaluate` (beside `missing:`), add:
```ts
      illustrations: Array.from(document.querySelectorAll<HTMLElement>('[data-illustration]')).map(el => el.dataset.illustration || ''),
```
2. After `errors.push(...health.missing.map(path => 'Imagen no disponible: ' + path));`, add:
```ts
    // A store-colour illustration is a CSS mask: a wrong path draws nothing and raises no image error.
    errors.push(...[...new Set(health.illustrations)].filter(src => !snapshot.files.some(file => '/' + file.path === src || file.path === src)).slice(0, 8).map(src => 'Ilustración no disponible: ' + src));
```
(`captureAgentDraft`'s first parameter is the snapshot; use its actual name if it differs from `snapshot`.)

- [ ] **Step 5: Run the capture spec and the kit typecheck**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-capture.spec.ts && cd ../../packages/storefront-kit && npx tsc -p tsconfig.json --noEmit`
Expected: all capture tests PASS (including the second-photo test from 2026-10-08); kit typecheck clean.

- [ ] **Step 6: Commit**

```bash
git add packages/storefront-kit/kit/ui.tsx apps/api/src/storefront-source/agent/agent-capture.ts apps/api/src/storefront-source/agent/agent-capture.spec.ts
git commit -m "feat(yapi-art): <Illustration> paints library art in store colours; the browser check names missing art"
```

---

### Task 6: Prompt rules, full verification, live check

**Files:**
- Modify: `apps/api/src/storefront-source/agent/agent-prompt.ts` (new line before the `Limits:` line, ~34)
- Modify: `apps/api/src/storefront-source/agent/agent-prompt.spec.ts`

**Interfaces:**
- Consumes: tool names `search_illustrations`, `set_motif_pack` (Tasks 3–4); component `Illustration` (Task 5).

- [ ] **Step 1: Write the failing prompt test**

Append inside `describe('agent instructions', …)` in `agent-prompt.spec.ts`:

```ts
  it('sends pictures to the library first and leaves shapes to the design', () => {
    for (const prompt of [agentInstructions('CONTRATOS', 'shop', true, true), agentInstructions('CONTRATOS', 'shop', false, false)]) {
      expect(prompt).toContain('ILLUSTRATIONS.');
      expect(prompt).toContain('search_illustrations');
      expect(prompt).toContain('Shapes are not pictures');
      expect(prompt).toContain('<Illustration');
      expect(prompt).toContain('set_motif_pack');
    }
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-prompt.spec.ts`
Expected: FAIL — `ILLUSTRATIONS.` not found.

- [ ] **Step 3: Add the section**

In `agent-prompt.ts`, inside the template literal of `agentInstructions`, insert this line immediately before the line that starts with `Limits: 40 tool calls`:

```
ILLUSTRATIONS. A picture depicts something: an object, food, drink, animal, person, face, plant or a symbol sticker (heart, star, sparkle). For a picture, call search_illustrations first and look at its sheet; place colour art with <img src="/PATH" alt="" aria-hidden="true"> and store-colour line art with <Illustration src="/PATH" tone="accent" /> from @pagosya/ui (tone: ink, accent, onAccent, paper, surface or a store variable such as var(--butter)). Use one family per page and copy paths exactly. Draw a picture by hand only when the search has nothing usable: one stroke width per page, round caps and joins, store colours only, simple geometry on a 24- or 48-unit grid, at most about 12 paths, no text inside, and check it in a screenshot at real size. Shapes are not pictures: borders, outlines, offset colour shadows, rounded or arched frames, colour blocks and panels, blobs, wavy lines, stripes, dots and dividers stay your own CSS design in the store palette; never search for them. Use set_motif_pack only when the store's subject matches a pack and the identity is playful; never for a serious or minimal identity.
```

- [ ] **Step 4: Run the prompt spec**

Run: `cd apps/api && npx jest src/storefront-source/agent/agent-prompt.spec.ts`
Expected: PASS.

- [ ] **Step 5: Full verification**

Run: `cd apps/api && npx jest src/storefront-source/agent/ src/storefront-source/source-creative-assets src/storefront-source/source-motif-packs && npx tsc --noEmit -p tsconfig.json && cd ../../packages/storefront-kit && npm test`
Expected: all pass, except the pre-existing `agent-tools.theme.spec.ts` "strict schema" test, which already fails on this branch because uncommitted product-card work added `assurances` and `media` (not caused by this plan; report it, do not change it here).

- [ ] **Step 6: Confirm the running API reloaded**

Run: `ps -axo pid,lstart,command | grep "dist/src/main" | grep -v grep`
Expected: a start time after the last edit (watch mode). If older, tell the owner rather than restarting their stack.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/storefront-source/agent/agent-prompt.ts apps/api/src/storefront-source/agent/agent-prompt.spec.ts
git commit -m "feat(yapi-art): prompt sends pictures to the illustration library and leaves shapes to the design"
```

- [ ] **Step 8: Live check (ask the owner first — it spends their ChatGPT plan)**

Ask the owner to send, on the Dacho store: "Cambia los dibujitos de la sección Helado para compartir por ilustraciones bonitas de helados". Then read the run read-only from the dev DB (as in memory `project_yapi_chatgpt_plan`): success = the attempts' `tools` include `search_illustrations`, the saved revision references `assets/creative/…` paths, and the section screenshot shows library art. Also open "Ver en navegador" to confirm mask-painted art shows outside the preview.
