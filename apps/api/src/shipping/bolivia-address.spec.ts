import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { BOLIVIA_DEPARTMENTS, isInsideBolivia, ShippingDestinationDto } from './bolivia-address';

const valid = { department: 'LA_PAZ', city: 'La Paz', street: 'Av. 6 de Agosto 2170', references: 'Frente al parque', lat: -16.5, lng: -68.12, recipientName: 'Ana Quispe', recipientPhone: '+59171234567' };

describe('Bolivian shipping destination', () => {
  it('lists the nine departments', () => {
    expect(BOLIVIA_DEPARTMENTS).toEqual(['LA_PAZ', 'SANTA_CRUZ', 'COCHABAMBA', 'ORURO', 'POTOSI', 'CHUQUISACA', 'TARIJA', 'BENI', 'PANDO']);
  });
  it('accepts pins inside Bolivia and rejects pins outside', () => {
    expect(isInsideBolivia(-17.78, -63.18)).toBe(true);
    expect(isInsideBolivia(-12.05, -77.04)).toBe(false); // Lima
    expect(isInsideBolivia(-23.01, -65)).toBe(false);
    expect(isInsideBolivia(Number.NaN, -65)).toBe(false);
  });
  it('validates a complete destination', async () => {
    expect(await validate(plainToInstance(ShippingDestinationDto, valid))).toHaveLength(0);
  });
  it('rejects unknown departments, foreign pins, bad phones and missing fields', async () => {
    for (const changed of [{ department: 'LIMA' }, { lat: -12.05, lng: -77.04 }, { recipientPhone: 'abc' }, { street: '' }, { city: undefined }]) {
      expect((await validate(plainToInstance(ShippingDestinationDto, { ...valid, ...changed }))).length).toBeGreaterThan(0);
    }
  });
});
