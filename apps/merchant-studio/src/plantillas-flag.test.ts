import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The Plantillas gallery is gone (owner 2026-10-25); the API's Plantillas-fill flag still gates double-click editing.
describe('double-click editing behind the Plantillas-fill flag', () => {
  const source = readFileSync(new URL('./source-studio.ts', import.meta.url), 'utf8');
  it('double-click editing in the preview needs the flag too', () => {
    expect(source).toMatch(/inlineText: plantillasOn && !visualEditing/);
  });
});
