import { describe, expect, it } from 'vitest';
import { escapeHtml } from './studio-ui';

describe('escapeHtml', () => {
  it('escapa los caracteres que rompen el marcado', () => {
    expect(escapeHtml('<b>"Tía" & Cía\'s</b>')).toBe('&lt;b&gt;&quot;Tía&quot; &amp; Cía&#39;s&lt;/b&gt;');
  });

  /** El fallo real: el TTL y la prioridad de un registro DNS llegan como número
   * y tumbaban la vista de Dominio entera. */
  it('acepta números sin reventar', () => {
    expect(escapeHtml(3600)).toBe('3600');
    expect(escapeHtml(0)).toBe('0');
  });

  it('escribe vacío para nulo y undefined, no la palabra "null"', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});
