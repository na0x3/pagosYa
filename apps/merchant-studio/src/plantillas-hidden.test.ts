import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Spec 2026-10-19 §5.1: no «Plantillas» button in the Studio's Diseño y contenido group.
describe('Plantillas hidden', () => {
  it('the Studio renders no Plantillas button', () => {
    const source = readFileSync(new URL('./source-studio.ts', import.meta.url), 'utf8');
    expect(source).not.toContain('data-open-templates');
  });
});
