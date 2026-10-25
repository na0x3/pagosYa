import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Owner 2026-10-22: «la lupa del header nunca sirve». buscar.html (pages/standard.js) filled its results with the catalogue's
// search rule before catalog/filters.js had run, and threw «Cannot access 'filterFold' before initialization»: the page came
// out empty. Everything the search page calls must be hoisted (a function declaration), never a const of a later part.
describe('the search page in the kit runtime', () => {
  const kit = readFileSync(resolve(__dirname, '../../../packages/storefront-kit/kit/commerce.js'), 'utf8');
  it('only calls hoisted helpers', () => {
    for (const name of ['filterFold', 'searchWords', 'matchesSearch']) {
      expect(kit).toMatch(new RegExp(`\\n\\s*function ${name}\\(`));
      expect(kit).not.toMatch(new RegExp(`\\b(?:const|let) ${name}\\b`));
    }
  });
});
