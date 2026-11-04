import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateStoreDto } from './dto/update-store.dto';
import { storeFaq, storePolicies, storeUpdateData } from './store-presentation';

describe('store policies', () => {
  it('accepts plain multi-line text, rejects invisible control characters and oversize text', () => {
    const ok = plainToInstance(UpdateStoreDto, { policies: { returns: 'Cambios en 7 días.\nCon boleta.', delivery: null } });
    expect(validateSync(ok, { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    for (const returns of ['a‮b', 'x'.repeat(6001), 12]) {
      expect(validateSync(plainToInstance(UpdateStoreDto, { policies: { returns } }), { whitelist: true, forbidNonWhitelisted: true }).length).toBeGreaterThan(0);
    }
    expect(validateSync(plainToInstance(UpdateStoreDto, { policies: { refunds: 'x' } }), { whitelist: true, forbidNonWhitelisted: true }).length).toBeGreaterThan(0);
  });
  it('keeps only known, non-empty, trimmed policies', () => {
    expect(storePolicies({ returns: '  Cambios\r\nsí  ', delivery: '   ', terms: null, extra: 'x' })).toEqual({ returns: 'Cambios\nsí' });
    expect(storePolicies('nope')).toEqual({});
  });
});

describe('owner-controlled public visibility', () => {
  it('accepts only a boolean and maps it onto the store update', () => {
    const { storeUpdateData } = jest.requireActual('./store-presentation');
    expect(validateSync(plainToInstance(UpdateStoreDto, { publicVisibility: true }), { whitelist: true, forbidNonWhitelisted: true })).toEqual([]);
    expect(validateSync(plainToInstance(UpdateStoreDto, { publicVisibility: 'yes' }), { whitelist: true, forbidNonWhitelisted: true }).length).toBeGreaterThan(0);
    expect(storeUpdateData(plainToInstance(UpdateStoreDto, { publicVisibility: true }))).toMatchObject({ publicVisibility: true });
    expect(storeUpdateData(plainToInstance(UpdateStoreDto, { name: 'X' }))).not.toHaveProperty('publicVisibility');
  });
});

describe('measurement IDs moved to extensions', () => {
  it('no longer writes the old Store columns: an old Studio saving them changes nothing', () => {
    const { storeUpdateData } = jest.requireActual('./store-presentation');
    const data = storeUpdateData(plainToInstance(UpdateStoreDto, { name: 'X', analyticsGa4Id: 'G-ABC1234567', analyticsGtmId: 'GTM-ABCD123', analyticsMetaPixelId: '123456789012345', analyticsTiktokPixelId: 'CJKLMNOP1234' }));
    for (const column of ['analyticsGa4Id', 'analyticsGtmId', 'analyticsMetaPixelId', 'analyticsTiktokPixelId']) expect(data).not.toHaveProperty(column);
  });
});

describe('the merchant\'s own FAQ questions (YAPI edits everything, 2026-11-03)', () => {
  it('reads policies.faq trimmed and capped, dropping half entries and unsafe text', () => {
    expect(storeFaq({ faq: [{ q: '  ¿Hacen envíos?  ', a: ' Sí.\r\nTodos los días. ' }, { q: 'Sin respuesta', a: '' }, { q: 'a\u202Eb', a: 'x' }, 'nope'] }))
      .toEqual([{ q: '¿Hacen envíos?', a: 'Sí.\nTodos los días.' }]);
    expect(storeFaq({ faq: Array.from({ length: 20 }, (_, n) => ({ q: `P${n}`, a: 'R' })) })).toHaveLength(12);
    expect(storeFaq(null)).toEqual([]);
  });
  it('saving Ajustes policies keeps the stored questions', () => {
    const current = { bannerUrl: null, aboutImageUrl: null, editorialGallery: null, policies: { returns: 'Viejo', faq: [{ q: '¿Tortas?', a: 'Sí.' }] } };
    const data = storeUpdateData(plainToInstance(UpdateStoreDto, { policies: { returns: 'Nuevo' } }), null, current) as { policies: unknown };
    expect(data.policies).toEqual({ returns: 'Nuevo', faq: [{ q: '¿Tortas?', a: 'Sí.' }] });
  });
});
