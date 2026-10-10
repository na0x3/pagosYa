import { BadRequestException } from '@nestjs/common';
import { normalizeProductBadge } from './product-badge';

describe('product photo badge', () => {
  it('keeps the three states: automatic, none and the merchant text', () => {
    expect(normalizeProductBadge(null)).toBeNull();
    expect(normalizeProductBadge(undefined)).toBeNull();
    expect(normalizeProductBadge('')).toBe('');
    expect(normalizeProductBadge('   ')).toBe('');
    expect(normalizeProductBadge('  Edición limitada ')).toBe('Edición limitada');
  });
  it('rejects text longer than 20 characters, line breaks and non-strings in Spanish', () => {
    expect(() => normalizeProductBadge('Una insignia demasiado larga')).toThrow(BadRequestException);
    expect(() => normalizeProductBadge('Más\nvendido')).toThrow(/insignia/i);
    expect(() => normalizeProductBadge(42)).toThrow(BadRequestException);
  });
});
