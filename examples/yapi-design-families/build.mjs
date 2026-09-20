import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir, copyFile, writeFile } from 'node:fs/promises';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const require = createRequire(join(root, 'apps/api/package.json'));
const { build } = require('esbuild');
const sharp = require('sharp');
export const dist = join(here, 'dist');
export const families = ['cafe-expressive', 'beauty-editorial', 'product-cinematic'];
const sources = {
  'cafe-expressive': {
    'breakfast.webp': 'examples/independent-cafe/assets/breakfast.webp',
    'granola.webp': 'examples/savia/assets/granola.jpg',
    'juice.webp': 'examples/savia/assets/juice.jpg',
  },
  'beauty-editorial': {
    'crema.webp': 'examples/premium-benchmark-photos/fixtures/beauty/crema.jpg',
    'jabon.webp': 'examples/premium-benchmark-photos/fixtures/beauty/jabon.jpg',
    'scene-crema.webp': 'examples/premium-benchmark-photos/beauty-photo-1/scene-crema.jpg',
    'scene-jabon.webp': 'examples/premium-benchmark-photos/beauty-photo-1/scene-jabon.jpg',
  },
  'product-cinematic': {
    'manta.webp': 'examples/premium-benchmark-photos/fixtures/home/manta.jpg',
    'cojin.webp': 'examples/premium-benchmark-photos/fixtures/home/cojin.jpg',
    'scene-manta.webp': 'examples/premium-benchmark-photos/home-photo-1/scene-manta.jpg',
    'scene-cojin.webp': 'examples/premium-benchmark-photos/home-photo-1/scene-cojin.jpg',
  },
};
export async function buildGallery() {
  await mkdir(join(dist, 'fonts'), { recursive: true });
  await Promise.all(['bricolage.ttf', 'bricolage-OFL.txt', 'instrument.ttf', 'instrument-OFL.txt', 'instrument-serif.ttf', 'instrument-serif-OFL.txt'].map(name => copyFile(join(root, 'packages/storefront-kit/kit/fonts', name), join(dist, 'fonts', name))));
  await Promise.all(['commerce.js', 'commerce-pages.css'].map(name => copyFile(join(root, 'packages/storefront-kit/kit', name), join(dist, name))));
  await copyFile(join(here, 'styles.css'), join(dist, 'styles.css'));
  for (const family of families) {
    const target = join(dist, family);
    await mkdir(join(target, 'assets'), { recursive: true });
    await Promise.all(Object.entries(sources[family]).map(([name, source]) => sharp(join(root, source)).rotate().resize({ width: 1280, withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(join(target, 'assets', name))));
    await build({ entryPoints: [join(here, 'shared.tsx')], bundle: true, minify: true, outfile: join(target, 'app.js'), format: 'iife', platform: 'browser', jsx: 'automatic', nodePaths: [join(root, 'apps/api/node_modules')], alias: { '@pagosya/ui': join(root, 'packages/storefront-kit/kit/ui.tsx'), family: join(here, family, 'home.tsx') }, define: { 'process.env.NODE_ENV': '"production"' } });
    const hero = { 'cafe-expressive': 'breakfast.webp', 'beauty-editorial': 'scene-crema.webp', 'product-cinematic': 'scene-manta.webp' }[family];
    const fonts = family === 'cafe-expressive' ? ['bricolage.ttf', 'instrument.ttf'] : ['instrument-serif.ttf', 'instrument.ttf'];
    const heroPreload = `<link rel="preload" as="image" href="assets/${hero}" fetchpriority="high">`;
    const preload = heroPreload + fonts.map(font => `<link rel="preload" as="font" type="font/ttf" href="../fonts/${font}" crossorigin>`).join('');
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${family} · YAPI</title>${preload}<link rel="stylesheet" href="../styles.css"><link rel="stylesheet" href="../commerce-pages.css"></head><body><div id="app"></div><script src="app.js"></script></body></html>`;
    await Promise.all(['index.html', 'product.html', 'checkout.html'].map(name => writeFile(join(target, name), name === 'index.html' ? html : html.replace(heroPreload, ''))));
  }
  const cards = [
    ['cafe-expressive', 'Aroma', 'Una pausa con carácter.', 'breakfast.webp', 'Café · Entrada de marca · Menú panorámico', 'desayuno'],
    ['beauty-editorial', 'Bruma', 'El cuidado, con calma.', 'scene-crema.webp', 'Belleza · Editorial · Comparación de imágenes', 'crema'],
    ['product-cinematic', 'Pliegue', 'Objetos para habitar.', 'scene-manta.webp', 'Hogar · Cinemático · Historia de producto', 'manta'],
  ];
  await writeFile(join(dist, 'index.html'), `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>YAPI · Direcciones de diseño</title><link rel="stylesheet" href="styles.css"><style>body{background:#f4f5f1;color:#252924;font:16px/1.5 Instrument,sans-serif}main{max-width:1360px;margin:auto;padding:60px 32px}header{max-width:850px;padding-bottom:56px}h1{font:500 clamp(48px,7vw,96px)/.95 Bricolage,sans-serif;letter-spacing:-.05em;margin:32px 0}header p{max-width:600px;color:#53584f}.index-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:28px}figure{margin:0}figure img{width:100%;height:360px;object-fit:cover}figure a{color:inherit;display:block;text-decoration:none}figcaption{padding-block:20px}h2{font:500 32px Bricolage,sans-serif;margin:0}figcaption p{margin:8px 0}.meta{font-size:12px;color:#53584f}.product-link{font-size:13px;text-decoration:underline!important;text-underline-offset:4px;padding-block:12px}:focus-visible{outline:3px solid #2753e5;outline-offset:5px}@media(max-width:820px){main{padding:32px 20px}.index-grid{grid-template-columns:1fr}figure img{height:400px}header{padding-bottom:32px}}</style></head><body><main><header><span>YAPI / ESTUDIOS DE DISEÑO</span><h1>Tres mundos.<br>Tu próxima idea.</h1><p>Explora la composición, las imágenes y el movimiento. Cada tienda incluye producto, carrito y un recorrido de compra de prueba.</p></header><div class="index-grid">${cards.map(([id, name, subtitle, photo, detail, product]) => `<figure><a href="${id}/"><img src="${id}/assets/${photo}" alt="${subtitle}"><figcaption><h2>${name} ↗</h2><p>${subtitle}</p><span class="meta">${detail}</span></figcaption></a><a class="product-link" href="${id}/product.html?id=${product}">Explorar producto →</a></figure>`).join('')}</div></main></body></html>`);
  return dist;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { await buildGallery(); console.log(`Built ${families.length} stores in ${dist}`); }
