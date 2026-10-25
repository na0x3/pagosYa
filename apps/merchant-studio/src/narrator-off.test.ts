import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Owner 2026-10-25: the floating «YAPI · Ahora: interpretando tu pedido…» window over the preview goes; the chat panel
// already shows the request, its steps and YAPI's reply.
describe('no narrator window during a build', () => {
  const source = readFileSync(new URL('./source-studio.ts', import.meta.url), 'utf8');
  it('builds never write into the glass window', () => {
    expect(source).not.toMatch(/narratorBridge\(narratorWindow/);
    expect(source).toMatch(/const narrator = narratorBridge\(\{ open\(\) \{\}, show\(\) \{\} \}/);
  });
});
