import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateStoreDto } from './dto/update-store.dto';
import { storePolicies } from './store-presentation';

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
