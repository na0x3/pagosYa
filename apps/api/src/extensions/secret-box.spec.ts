import { openSecrets, sealSecrets, SecretBoxError } from './secret-box';

describe('SecretBox', () => {
  it('round-trips a secrets object and never stores it in the clear', () => {
    const sealed = sealSecrets('k'.repeat(32), { token: 'EAAG-secret' });
    expect(sealed).toMatch(/^v1\.[0-9a-f]{8}\.[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(sealed).not.toContain('EAAG-secret');
    expect(openSecrets('k'.repeat(32), sealed)).toEqual({ token: 'EAAG-secret' });
  });

  it('refuses a tampered envelope, a different key and garbage', () => {
    const sealed = sealSecrets('k'.repeat(32), { token: 'x' });
    const parts = sealed.split('.');
    parts[4] = (parts[4][0] === 'A' ? 'B' : 'A') + parts[4].slice(1);
    expect(() => openSecrets('k'.repeat(32), parts.join('.'))).toThrow(SecretBoxError);
    expect(() => openSecrets('z'.repeat(32), sealed)).toThrow(SecretBoxError);
    expect(() => openSecrets('k'.repeat(32), 'garbage')).toThrow(SecretBoxError);
  });
});
