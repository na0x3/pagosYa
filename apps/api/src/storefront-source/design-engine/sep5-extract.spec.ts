import { extractSep5, sectionFamily } from './sep5-extract';

// A reduced Sep-5 project in the shape the real generator emits: --ink and
// --paper named by role, every other hue named by colour, sections named for
// the job they do rather than the family they belong to.
const css = `:root{
  --ink: #172b2d;
  --paper: #fff8ee;
  --white: #fffdf8;
  --blue: #087f98;
  --blue-dark: #00566b;
  --orange: #ed5a2a;
  --yellow: #f2b628;
  --line: rgba(23, 43, 45, 0.22);
  --serif: Georgia, "Times New Roman", serif;
  --sans: Arial, Helvetica, sans-serif;
}
.hero{background:var(--blue);color:var(--paper)}
.hero h1{font-family:var(--serif)}
.buying-rhythm{background:var(--paper)}
.shop-section{background:var(--blue)}
.last-call{background:var(--orange)}`;
const html = `<!doctype html><html><body>
<section class="hero"><h1>Que no te gane el fondo de la bolsa.</h1><p>Repón el alimento del mes.</p></section>
<section class="buying-rhythm"><h2>Cada mes, sin pensarlo</h2></section>
<section class="shop-section" data-pagosya-catalog><h2>El catálogo</h2></section>
<section class="costal-note"><h2>Del costal a la casa</h2></section>
<section class="last-call"><h2>¿Algo más?</h2></section>
</body></html>`;
const files = [{ path: 'index.html', content: html }, { path: 'styles.css', content: css }];

it('fills the five engine palette slots from role-named and hue-named properties', () => {
  const { palette } = extractSep5(files);
  expect(palette.paper).toBe('#fff8ee');
  expect(palette.ink).toBe('#172b2d');
  // The most-used strong hue leads; its darker sibling becomes deep; the hue
  // furthest from the accent becomes pop.
  expect(palette.accent).toBe('#087f98');
  expect(palette.deep).toBe('#00566b');
  expect(palette.pop).toBe('#ed5a2a');
});

it('reports every hue it could not place rather than dropping it silently', () => {
  const { droppedColours, losses } = extractSep5(files);
  expect(droppedColours).toEqual(['#f2b628']);
  expect(losses.some(l => l.includes('#f2b628'))).toBe(true);
});

it('maps Sep-5 section names onto registry families and keeps their headings', () => {
  const { sections } = extractSep5(files);
  expect(sections.map(s => s.family)).toEqual(['hero', 'steps', 'catalog', 'story', 'banner']);
  expect(sections[1].heading).toBe('Cada mes, sin pensarlo');
  expect(sections[3].name).toBe('costal-note');
});

it('takes the headline and notes a serif display face', () => {
  const extraction = extractSep5(files);
  expect(extraction.headline).toBe('Que no te gane el fondo de la bolsa.');
  expect(extraction.displayIsSerif).toBe(true);
});

it('maps unknown section names to no family and says so', () => {
  expect(sectionFamily('route-guide')).toBe('steps');
  expect(sectionFamily('origin-story')).toBe('story');
  expect(sectionFamily('office-callout')).toBe('banner');
  expect(sectionFamily('questions')).toBe('faq');
  expect(sectionFamily('chalkboard-thing')).toBeNull();
  const { losses } = extractSep5([{ path: 'index.html', content: '<section class="chalkboard-thing"><h2>¿Qué vas a tomar?</h2></section>' }, { path: 'styles.css', content: ':root{--ink:#111111;--paper:#ffffff}' }]);
  expect(losses.some(l => l.includes('chalkboard-thing'))).toBe(true);
});

it('weighs a hue by the area its selector covers, not how often it is named', () => {
  // Yellow is named on four controls; teal paints one hero. Teal is what the
  // page reads as, so teal must take the accent slot.
  const paint = `:root{--ink:#172b2d;--paper:#fff8ee;--teal:#087f98;--teal-dark:#00566b;--yellow:#f2b628;}
  .hero__media{background:var(--teal)}
  .cart-link{background:var(--yellow)}
  .button--yellow{background:var(--yellow)}
  .checkout-button{background:var(--yellow)}
  .category-ribbon{background:var(--yellow)}`;
  const { palette } = extractSep5([{ path: 'index.html', content: '<h1>x</h1>' }, { path: 'styles.css', content: paint }]);
  expect(palette.accent).toBe('#087f98');
  expect(palette.deep).toBe('#00566b');
});

it('treats a near-black dominant hue as the deep field and promotes the brighter accent', () => {
  const css = `:root{--ink:#17211d;--paper:#f4f0e5;--forest:#0d2c23;--mustard:#e9c84a;}
  body{background:var(--forest)}
  .hero{background:var(--forest)}
  .shop-section{background:var(--mustard)}`;
  const { palette } = extractSep5([{ path: 'index.html', content: '<h1>x</h1>' }, { path: 'styles.css', content: css }]);
  expect(palette.deep).toBe('#0d2c23');
  expect(palette.accent).toBe('#e9c84a');
  expect(palette.accent).not.toBe(palette.deep);
});

it('carries the corner language and a condensed display face across', () => {
  const base = (css: string) => extractSep5([{ path: 'index.html', content: '<h1>x</h1>' }, { path: 'styles.css', content: `:root{--ink:#111111;--paper:#ffffff;${css}}` }]);
  expect(base('--radius: 1.45rem;').cornerStyle).toBe('round');
  expect(base('--radius: 0.25rem;').cornerStyle).toBe('soft');
  expect(base('--radius: 0;').cornerStyle).toBe('square');
  expect(base('').cornerStyle).toBe('square');
  expect(base('--sans: "Arial Narrow", Arial, sans-serif;').displayIsCondensed).toBe(true);
  expect(base('--sans: Arial, sans-serif;').displayIsCondensed).toBe(false);
});
