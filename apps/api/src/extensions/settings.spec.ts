import { BadRequestException } from '@nestjs/common';
import type { ExtensionManifest } from './extension';
import { assertRegistry } from './registry';
import { isConfigured, readSettings, validateInput } from './settings';

const manifest: ExtensionManifest = {
  id: 'demo', name: 'Demo', category: 'ads', tier: 'free', logo: null, summary: 's', description: 'd',
  settings: [
    { key: 'id', label: 'ID del pixel', type: 'text', required: true, pattern: /^[0-9]{8,20}$/, normalize: value => value.trim() },
    { key: 'mode', label: 'Modo', type: 'select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
    { key: 'on', label: 'Activo', type: 'toggle' },
  ],
  secrets: [{ key: 'token', label: 'Token', pattern: /^[A-Za-z0-9-]{10,}$/ }],
};

describe('extension settings', () => {
  it('keeps only valid stored values: a value that fails its pattern is "not configured"', () => {
    expect(readSettings(manifest, { id: '123456789', mode: 'b', on: true, stray: 'x' })).toEqual({ id: '123456789', mode: 'b', on: true });
    expect(readSettings(manifest, { id: '12<script>', mode: 'z' })).toEqual({});
    expect(readSettings(manifest, null)).toEqual({});
  });

  it('validates and normalizes input, naming the field in Spanish when it is wrong', () => {
    expect(validateInput(manifest, { settings: { id: ' 123456789 ', on: false } }, {})).toEqual({ settings: { id: '123456789', on: false }, secrets: {} });
    expect(() => validateInput(manifest, { settings: { id: 'abc' } }, {})).toThrow(new BadRequestException('Revisa «ID del pixel»: no tiene el formato esperado.'));
    expect(() => validateInput(manifest, { settings: {} }, {})).toThrow('Completa «ID del pixel».');
    expect(() => validateInput(manifest, { settings: { id: '123456789', extra: 'x' } }, {})).toThrow('«extra» no es parte de esta extensión.');
    expect(() => validateInput(manifest, { settings: { id: '123456789', mode: 'z' } }, {})).toThrow('Revisa «Modo»');
  });

  it('keeps a stored secret when the field comes back empty, replaces it when a new one is typed', () => {
    const stored = { token: 'old-token-123' };
    expect(validateInput(manifest, { settings: { id: '123456789' }, secrets: { token: '' } }, stored).secrets).toEqual(stored);
    expect(validateInput(manifest, { settings: { id: '123456789' } }, stored).secrets).toEqual(stored);
    expect(validateInput(manifest, { settings: { id: '123456789' }, secrets: { token: 'new-token-456' } }, stored).secrets).toEqual({ token: 'new-token-456' });
    expect(() => validateInput(manifest, { settings: { id: '123456789' }, secrets: { token: 'bad token' } }, stored)).toThrow('Revisa «Token»');
  });

  it('is configured only when every required field and every secret is present', () => {
    expect(isConfigured(manifest, { id: '123456789' }, { token: 't' })).toBe(true);
    expect(isConfigured(manifest, { id: '123456789' }, {})).toBe(false);
    expect(isConfigured(manifest, {}, { token: 't' })).toBe(false);
  });

  it('refuses two manifests with the same id', () => {
    expect(() => assertRegistry([manifest, manifest])).toThrow('Duplicate extension id: demo');
  });
});
