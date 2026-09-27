import { describe, expect, it } from 'vitest';
import { composeActionMode } from './source-studio-actions';

describe('a message handed over from the dashboard', () => {
  const idle = { busy: false, blocked: false };
  it('is sent to YAPI right away when it comes from the YAPI box on any tab', () => {
    expect(composeActionMode({ text: 'Hazme una tienda de café' }, idle)).toBe('send');
  });
  it('waits in the composer when it is a Crecimiento suggestion, YAPI is busy, or there are unsaved edits', () => {
    expect(composeActionMode({ text: 'Agrega un banner', origin: 'growth' }, idle)).toBe('compose');
    expect(composeActionMode({ text: 'Hazme una tienda' }, { busy: true, blocked: false })).toBe('compose');
    expect(composeActionMode({ text: 'Hazme una tienda' }, { busy: false, blocked: true })).toBe('compose');
    expect(composeActionMode({ text: '   ' }, idle)).toBe('compose');
  });
});
