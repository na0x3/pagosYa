import { normalizeContentBlocks, readContentBlocks } from './product-content-blocks';
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

it('clears on undefined/null/empty and rejects malformed collections and a seventh block', () => {
  for (const value of [undefined, null, []]) expect(normalizeContentBlocks(value)).toEqual([]);
  for (const value of ['nope', {}, [null], [1], [{ ...media, type: 'specs' }]]) expect(() => normalizeContentBlocks(value)).toThrow();
  expect(() => normalizeContentBlocks(Array(7).fill(media))).toThrow('6');
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
  expect(readContentBlocks(Array(9).fill(media))).toHaveLength(6);
});

it('validates nested content block safe text and upload URLs at the DTO boundary', () => {
  const errors = (blocks: unknown) => validateSync(plainToInstance(CreatePaymentLinkDto, { contentBlocks: blocks }), { whitelist: true, forbidNonWhitelisted: true }).filter(error => error.property === 'contentBlocks');
  expect(errors([media, compare])).toEqual([]);
  expect(errors([{ ...media, alt: '\u0000' }])).not.toEqual([]);
  expect(errors([{ ...media, imageUrl: 'https://evil.test' }])).not.toEqual([]);
  expect(errors(Array(7).fill(media))).not.toEqual([]);
});
