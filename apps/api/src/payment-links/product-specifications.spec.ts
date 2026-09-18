import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreatePaymentLinkDto } from './dto/create-payment-link.dto';
import { normalizeProductSpecifications } from './payment-links.service';

describe('product specifications', () => {
  const dto = (specifications: unknown) => plainToInstance(CreatePaymentLinkDto, { name: 'Lámpara', amount: 22000, specifications });
  const errors = async (specifications: unknown) => (await validate(dto(specifications))).filter(error => error.property === 'specifications');

  it('accepts ordered label/value rows and rejects oversized or unsafe input', async () => {
    expect(await errors([{ label: 'Material', value: 'Aluminio anodizado' }, { label: 'Alimentación', value: 'USB-C, 5 V' }])).toHaveLength(0);
    expect(await errors(Array.from({ length: 9 }, (_, i) => ({ label: `Dato ${i}`, value: 'x' })))).not.toHaveLength(0);
    expect(await errors([{ label: 'x'.repeat(41), value: 'y' }])).not.toHaveLength(0);
    expect(await errors([{ label: 'Material', value: '' }])).not.toHaveLength(0);
    expect(await errors([{ label: 'Material' }])).not.toHaveLength(0);
  });

  it('trims, drops blank and repeated labels, and keeps merchant order', () => {
    expect(normalizeProductSpecifications([
      { label: ' Material ', value: ' Algodón ' }, { label: 'material', value: 'Lino' }, { label: 'Peso', value: '   ' }, { label: 'Origen', value: 'La Paz' },
    ])).toEqual([{ label: 'Material', value: 'Algodón' }, { label: 'Origen', value: 'La Paz' }]);
    expect(normalizeProductSpecifications(undefined)).toEqual([]);
  });
});
