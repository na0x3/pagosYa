import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { kitPath } from '@pagosya/storefront-kit';

// Owner 2026-10-29 («amboras created a little menu with the accent of the brand colors, font…»): the header menu wears the brand.
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');
it('the menu panel, active tab, links and footer take the brand accent, surface and heading font', () => {
  expect(commerce).toContain('.pym-panel{background:var(--store-surface,var(--store-background,#fff));border-top:3px solid var(--store-accent,currentColor)}');
  expect(commerce).toContain('.pym-tab[aria-selected="true"]{background:var(--store-accent,var(--store-foreground,#111));color:var(--store-on-accent,var(--store-background,#fff))}');
  expect(commerce).toContain('.pym-links a{font-family:var(--store-heading-font,inherit);font-size:19px}');
  expect(commerce).toContain('.pym-footer{background:var(--store-accent,var(--store-foreground,#111));color:var(--store-on-accent,var(--store-background,#fff))}');
});
