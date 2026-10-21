import test from 'node:test';
import assert from 'node:assert/strict';
import { slotifyFiles } from '../tools/slotify.mjs';

// Spec 2026-10-20 Plantillas fill §3: every visible text leaves the components for flat `copy` slots.
const home = `import { Reveal } from '@pagosya/ui';
import Shell from './Shell';
import { store, photos } from './store-data';

const faqs = [
  { q: '¿Cómo pago?', a: 'Con QR de cualquier banco.' },
];

export default function Home() {
  return <Shell>
    <main id="contenido">
      <h1 className="tv-display">Café que vale
        la pena</h1>
      <p className="tv-lead">{store.tagline || 'Granos tostados cada semana.'}</p>
      <a className="tv-btn" href="#cafes">Comprar café</a>
      <img src={photos.hero} alt="Mesa con tazas de café" />
      <template data-pagosya-product-template>
        <h3 data-product-field="name">Café</h3>
      </template>
      {faqs.map(f => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
      <p>{\`Desde \${store.city}\`}</p>
    </main>
  </Shell>;
}
`;

test('moves every visible text into copy slots and leaves structure alone', () => {
  const { files, slots, leftovers } = slotifyFiles([{ path: 'components/home.tsx', content: home }]);
  const out = files[0].content;
  assert.deepEqual(slots.map(s => [s.key, s.role, s.default]), [
    ['home_1', 'question', '¿Cómo pago?'],
    ['home_2', 'answer', 'Con QR de cualquier banco.'],
    ['home_3', 'headline', 'Café que vale la pena'],
    ['home_4', 'lead', 'Granos tostados cada semana.'],
    ['home_5', 'cta', 'Comprar café'],
    ['home_6', 'alt', 'Mesa con tazas de café'],
  ]);
  assert.match(out, /import \{ store, photos, copy \} from '\.\/store-data';/);
  assert.match(out, /\{ q: copy\.home_1, a: copy\.home_2 \}/);
  assert.match(out, /<h1 className="tv-display">\{copy\.home_3\}<\/h1>/);
  assert.match(out, /store\.tagline \|\| copy\.home_4/);
  assert.match(out, /href="#cafes">\{copy\.home_5\}<\/a>/);
  assert.match(out, /alt=\{copy\.home_6\}/);
  // The runtime fills product cards; classes, links and ids are structure.
  assert.match(out, /<h3 data-product-field="name">Café<\/h3>/);
  assert.match(out, /className="tv-btn" href="#cafes"/);
  assert.deepEqual(leftovers, ['components/home.tsx:21 `Desde ${store.city}`']);
  for (const slot of slots) assert.ok(slot.max >= 12 && slot.max <= 420);
});

test('adds the store-data import when a file has none, and keeps JSX spacing between inline elements', () => {
  const shell = `export default function Shell({ children }) {\n  return <footer><p>Hecho en <strong>La Paz</strong> con cariño</p>{children}</footer>;\n}\n`;
  const { files, slots } = slotifyFiles([{ path: 'components/Shell.tsx', content: shell }]);
  assert.deepEqual(slots.map(s => s.default), ['Hecho en ', 'La Paz', ' con cariño']);
  assert.match(files[0].content, /^import \{ copy \} from '\.\/store-data';\n/);
  assert.match(files[0].content, /<p>\{copy\.shell_1\}<strong>\{copy\.shell_2\}<\/strong>\{copy\.shell_3\}<\/p>/);
});

test('decodes entities and skips slugs, urls and symbols', () => {
  const product = `import { store } from './store-data';\nconst links = [{ label: 'Envíos', href: 'index.html#envios', tone: 'warm' }];\nexport default function P() { return <p>Pan &amp; café · <span>—</span></p>; }\n`;
  const { slots } = slotifyFiles([{ path: 'components/product.tsx', content: product }]);
  assert.deepEqual(slots.map(s => s.default), ['Envíos', 'Pan & café · ']);
});
