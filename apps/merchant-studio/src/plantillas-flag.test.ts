import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Spec 2026-10-19 §5.1 hid Plantillas; spec 2026-10-20 brings the button back only while the API says Plantillas fill is on.
describe('Plantillas behind the flag', () => {
  const source = readFileSync(new URL('./source-studio.ts', import.meta.url), 'utf8');
  it('the Plantillas button renders only with the flag', () => {
    expect(source).toMatch(/\$\{plantillasOn \? `<button data-open-templates/);
    expect(source.match(/data-open-templates/g)?.length).toBe(2);
  });
  it('double-click editing in the preview needs the flag too', () => {
    expect(source).toMatch(/inlineText: plantillasOn && !visualEditing/);
  });
});
