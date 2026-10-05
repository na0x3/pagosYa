import { repairPhotoPairing } from './sketch-photo-pairing';
import { repairSketch } from './sketch-schema';

const ctx = { storeName: 'fgfg', purpose: 'shop' as const, photos: ['assets/flores.jpg', 'assets/retrato.jpg', 'assets/sendero.jpg'] };

/** The descriptions a vision pass wrote for the uploads of the store this bug was found on. They are authoritative:
 * the model copies them into the cards it writes, and then has to retype a 12-hex-character filename to say which
 * photo each card shows. On 2026-10-05 it retyped the wrong ones and the page captioned a vase of flowers as a path
 * through a park. */
const facts = [
  { path: 'assets/flores.jpg', description: 'Bodegón floral con amapolas y flores blancas sobre fondo azul.' },
  { path: 'assets/retrato.jpg', description: 'Retrato pictórico de una persona sentada con vestimenta oscura.' },
  { path: 'assets/sendero.jpg', description: 'Paisaje pictórico con sendero, vegetación y figuras en un parque.' },
];

const build = (items: Array<{ title: string; text: string; photo: string }>) =>
  repairSketch({ blocks: [{ id: 's1', type: 'collections', title: 'Obras', items }] }, ctx).sketch;

const photos = (sketch: ReturnType<typeof build>) =>
  (sketch.blocks.find(b => b.type === 'collections') as { items: Array<{ title: string; photo?: string }> }).items
    .map(item => [item.title, item.photo] as const);

it('re-pairs cards whose text plainly belongs to another photo', () => {
  const sketch = build([
    { title: 'Sendero entre vegetación', text: 'Paisaje pictórico con un camino, vegetación y figuras visibles en un parque.', photo: 'assets/flores.jpg' },
    { title: 'Figura sentada', text: 'Retrato pictórico de una persona sentada con vestimenta oscura.', photo: 'assets/sendero.jpg' },
    { title: 'Flores sobre azul', text: 'Amapolas y flores blancas se recortan sobre un fondo azul.', photo: 'assets/retrato.jpg' },
  ]);
  const { sketch: fixed, notes } = repairPhotoPairing(sketch, facts);
  expect(photos(fixed)).toEqual([
    ['Sendero entre vegetación', 'assets/sendero.jpg'],
    ['Figura sentada', 'assets/retrato.jpg'],
    ['Flores sobre azul', 'assets/flores.jpg'],
  ]);
  expect(notes.length).toBe(1);
});

it('leaves a correct pairing exactly as it found it', () => {
  const sketch = build([
    { title: 'Flores sobre azul', text: 'Amapolas y flores blancas sobre fondo azul.', photo: 'assets/flores.jpg' },
    { title: 'Figura sentada', text: 'Retrato de una persona sentada con vestimenta oscura.', photo: 'assets/retrato.jpg' },
  ]);
  const { sketch: fixed, notes } = repairPhotoPairing(sketch, facts);
  expect(photos(fixed)).toEqual([['Flores sobre azul', 'assets/flores.jpg'], ['Figura sentada', 'assets/retrato.jpg']]);
  expect(notes).toEqual([]);
});

it('keeps its hands off cards whose copy says nothing about the picture', () => {
  // Evocative titles are a legitimate choice; with no shared words there is no evidence of a mispairing, and
  // guessing here would scramble a page the merchant arranged on purpose.
  const sketch = build([
    { title: 'Primera mirada', text: 'Abrí la muestra por acá.', photo: 'assets/flores.jpg' },
    { title: 'Segunda mirada', text: 'Seguí el recorrido.', photo: 'assets/retrato.jpg' },
  ]);
  const { sketch: fixed, notes } = repairPhotoPairing(sketch, facts);
  expect(photos(fixed)).toEqual([['Primera mirada', 'assets/flores.jpg'], ['Segunda mirada', 'assets/retrato.jpg']]);
  expect(notes).toEqual([]);
});

it('re-pairs across blocks, because the swap that caused this crossed them', () => {
  const sketch = repairSketch({ blocks: [
    { id: 's1', type: 'collections', title: 'Retratos', items: [{ title: 'Figura sentada', text: 'Retrato pictórico de una persona sentada con vestimenta oscura.', photo: 'assets/flores.jpg' }] },
    { id: 's2', type: 'collections', title: 'Bodegones', items: [{ title: 'Flores sobre azul', text: 'Bodegón floral con amapolas y flores blancas sobre fondo azul.', photo: 'assets/retrato.jpg' }] },
  ] }, ctx).sketch;
  const { sketch: fixed } = repairPhotoPairing(sketch, facts);
  const items = fixed.blocks.filter(b => b.type === 'collections').flatMap(b => (b as { items: Array<{ photo?: string }> }).items);
  expect(items.map(i => i.photo)).toEqual(['assets/retrato.jpg', 'assets/flores.jpg']);
});

it('never invents a photo the page was not already showing', () => {
  const sketch = build([
    { title: 'Sendero entre vegetación', text: 'Paisaje pictórico con sendero, vegetación y figuras en un parque.', photo: 'assets/flores.jpg' },
  ]);
  const { sketch: fixed, notes } = repairPhotoPairing(sketch, facts);
  // assets/sendero.jpg matches the copy, but it is not on the page: a lone card keeps what it had.
  expect(photos(fixed)).toEqual([['Sendero entre vegetación', 'assets/flores.jpg']]);
  expect(notes).toEqual([]);
});

it('does nothing without descriptions to judge by', () => {
  const sketch = build([
    { title: 'Sendero entre vegetación', text: 'Paisaje con sendero, vegetación y figuras en un parque.', photo: 'assets/flores.jpg' },
    { title: 'Flores sobre azul', text: 'Amapolas y flores blancas sobre fondo azul.', photo: 'assets/sendero.jpg' },
  ]);
  const { sketch: fixed, notes } = repairPhotoPairing(sketch, [{ path: 'assets/flores.jpg' }, { path: 'assets/sendero.jpg' }]);
  expect(photos(fixed)).toEqual([['Sendero entre vegetación', 'assets/flores.jpg'], ['Flores sobre azul', 'assets/sendero.jpg']]);
  expect(notes).toEqual([]);
});

it('lets a correctly paired card keep its photo against a weaker claim', () => {
  // Both cards talk about flowers; only the first is actually describing the picture it holds. A greedy match that
  // ignored what a card already has could hand the flowers to the second and scramble a correct page.
  const sketch = build([
    { title: 'Bodegón floral', text: 'Bodegón floral con amapolas y flores blancas sobre fondo azul.', photo: 'assets/flores.jpg' },
    { title: 'Más flores', text: 'Otras flores blancas del recorrido.', photo: 'assets/retrato.jpg' },
  ]);
  const { sketch: fixed, notes } = repairPhotoPairing(sketch, facts);
  expect(photos(fixed)).toEqual([['Bodegón floral', 'assets/flores.jpg'], ['Más flores', 'assets/retrato.jpg']]);
  expect(notes).toEqual([]);
});
