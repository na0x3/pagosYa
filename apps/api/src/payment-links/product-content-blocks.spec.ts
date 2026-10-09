import { MAX_CONTENT_BLOCKS, normalizeContentBlocks, readContentBlocks } from './product-content-blocks';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
const A = '/v1/uploads/11111111-1111-1111-1111-111111111111.jpg';
const B = '/v1/uploads/22222222-2222-2222-2222-222222222222.jpg';
const media = { type: 'media', imageUrl: A, alt: ' Respaldo reclinado ', caption: ' 35° ' };
const compare = { type: 'compare', title: 'Reclinación', beforeUrl: A, afterUrl: B, beforeLabel: 'Recta', afterLabel: '35°', alt: 'Silla recta y reclinada' };

it('accepts media and compare with trimmed text and stable unique ids', () => {
  const rows = normalizeContentBlocks([media, compare]);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ type: 'media', alt: 'Respaldo reclinado', caption: '35°' });
  expect(rows[0].id).toMatch(/^blk_[a-z0-9]{12}$/);
  expect(normalizeContentBlocks(rows, rows)).toEqual(rows);
  const duplicate = normalizeContentBlocks([rows[0], rows[0]]);
  expect(duplicate[0].id).toBe(rows[0].id); expect(duplicate[1].id).not.toBe(rows[0].id);
  expect(normalizeContentBlocks([{ ...media, caption: '  ' }])[0]).not.toHaveProperty('caption');
});

it('clears on undefined/null/empty and rejects malformed collections and a thirteenth block', () => {
  for (const value of [undefined, null, []]) expect(normalizeContentBlocks(value)).toEqual([]);
  for (const value of ['nope', {}, [null], [1], [{ ...media, type: 'specs' }]]) expect(() => normalizeContentBlocks(value)).toThrow();
  expect(() => normalizeContentBlocks(Array(13).fill(media))).toThrow('12');
});

it.each([
  { ...media, imageUrl: 'https://evil.test/a.jpg' }, { ...media, imageUrl: 'javascript:alert(1)' },
  { ...media, imageUrl: '/v1/uploads/' + 'a'.repeat(200) }, { ...media, alt: ' ' }, { ...media, alt: 'x'.repeat(161) },
  { ...media, alt: '\u202ehidden' }, { ...media, caption: 'x'.repeat(141) },
  { ...compare, title: '' }, { ...compare, title: 'x'.repeat(61) },
  { ...compare, beforeLabel: 'x'.repeat(25) }, { ...compare, afterLabel: '' }, { ...compare, afterUrl: B + '?x=1' },
])('rejects invalid text or URLs: %j', row => expect(() => normalizeContentBlocks([row])).toThrow());

it('public reads drop invalid rows, omit unknown fields and cap valid blocks', () => {
  expect(readContentBlocks('nope')).toEqual([]);
  expect(readContentBlocks([{ ...media, imageUrl: 'javascript:alert(1)' }, { id: 'blk_abcdefghijkl', type: 'media', imageUrl: A, alt: 'ok', link: 'https://evil.test' }]))
    .toEqual([{ id: 'blk_abcdefghijkl', type: 'media', imageUrl: A, alt: 'ok' }]);
  expect(readContentBlocks(Array(15).fill(media))).toHaveLength(12);
});

it('validates nested content block safe text and upload URLs at the DTO boundary', () => {
  const errors = (blocks: unknown) => validateSync(plainToInstance(CreatePaymentLinkDto, { contentBlocks: blocks }), { whitelist: true, forbidNonWhitelisted: true }).filter(error => error.property === 'contentBlocks');
  expect(errors([media, compare])).toEqual([]);
  expect(errors([{ ...media, alt: '\u0000' }])).not.toEqual([]);
  expect(errors([{ ...media, imageUrl: 'https://evil.test' }])).not.toEqual([]);
  expect(errors(Array(13).fill(media))).not.toEqual([]);
});

const pagePhoto = '/v1/uploads/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
const page = [
  { type: 'story', origin: 'yapi', problem: 'Llevas tres bolsas al trabajo.', tried: 'Una lonchera aparte se derrama.', solution: 'Un solo bolso con zona térmica.' },
  { type: 'versus', title: 'Comparado', ours: 'Este bolso', theirs: 'Lo de siempre', rows: [{ label: 'Zona térmica', ours: true, theirs: false }, { label: 'Bolsillo laptop', ours: true, theirs: false }] },
  { type: 'faq', items: [{ q: '¿Cabe mi laptop?', a: 'Sí, hasta 15.6 pulgadas.' }, { q: '¿Se lava?', a: 'Se limpia con un paño húmedo.' }] },
  { type: 'details', items: [{ imageUrl: pagePhoto, title: 'Asas acolchadas', text: 'No cortan el hombro.', alt: 'Asas del bolso' }] },
  { type: 'features', title: 'Lo que lo hace especial', items: [{ icon: 'snowflake', label: 'Frío', detail: 'Zona térmica' }, { icon: 'laptop', label: 'Laptop', detail: 'Funda acolchada' }, { icon: 'drop', label: 'Impermeable', detail: 'Exterior repelente' }] },
];

describe('long product page blocks', () => {
  it('accepts every page type, keeps the YAPI marker and gives each an id', () => {
    const blocks = normalizeContentBlocks(page);
    expect(blocks.map(block => block.type)).toEqual(['story', 'versus', 'faq', 'details', 'features']);
    expect(blocks[0]).toEqual(expect.objectContaining({ origin: 'yapi', id: expect.stringMatching(/^blk_[a-z0-9]{12}$/) }));
    expect(blocks[1]).not.toHaveProperty('origin');
  });
  it('enforces caps, counts, safe text and uploaded photos', () => {
    expect(() => normalizeContentBlocks([{ ...page[0], problem: 'x'.repeat(221) }])).toThrow(/problem/);
    expect(() => normalizeContentBlocks([{ ...page[2], items: [{ q: 'Solo una', a: 'pregunta' }] }])).toThrow(/2 a 8/);
    expect(() => normalizeContentBlocks([{ ...page[3], items: [{ ...(page[3] as any).items[0], imageUrl: 'https://evil.test/x.jpg' }] }])).toThrow(/foto subida/);
    expect(() => normalizeContentBlocks([{ ...page[4], items: [{ icon: 'rocket', label: 'X', detail: 'Y' }, ...(page[4] as any).items] }])).toThrow(/icono/);
    expect(() => normalizeContentBlocks([{ ...page[1], rows: [{ label: 'Uno', ours: 'sí', theirs: false }, { label: 'Dos', ours: true, theirs: false }] }])).toThrow(/sí o no/);
  });
  it('allows twelve blocks and reads stored rows without breaking on bad ones', () => {
    expect(MAX_CONTENT_BLOCKS).toBe(12);
    expect(normalizeContentBlocks([...page, ...page, page[0], page[1]])).toHaveLength(12);
    expect(readContentBlocks([page[0], { type: 'faq', items: [] }, page[2]]).map(block => block.type)).toEqual(['story', 'faq']);
  });
  it('lets every page type and the YAPI marker through the API boundary, still rejecting unsafe text', () => {
    const errors = (blocks: unknown) => validateSync(plainToInstance(CreatePaymentLinkDto, { contentBlocks: blocks }), { whitelist: true, forbidNonWhitelisted: true }).filter(error => error.property === 'contentBlocks');
    expect(errors(page)).toEqual([]);
    expect(errors(Array(12).fill(page[0]))).toEqual([]);
    expect(errors([{ ...page[0], problem: 'oculto\u202E' }])).not.toEqual([]);
    expect(errors([{ ...page[0], origin: 'robot' }])).not.toEqual([]);
  });
});
