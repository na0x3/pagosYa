import { existsSync, readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { SOURCE_FONT_CATALOG, SOURCE_FONT_SEED_IDS } from './source-font-catalog';

// Spec 2026-10-19 §5.2: premium-grade families, SIL OFL only (Fontshare's FFL forbids SaaS use).
const PREMIUM = ['geist', 'mona-sans', 'hanken-grotesk', 'schibsted-grotesk', 'gloock', 'crimson-pro'];

describe('premium OFL fonts', () => {
  it.each(PREMIUM)('%s is catalogued, shipped and OFL-licensed', id => {
    expect(SOURCE_FONT_CATALOG.some(font => font.id === id)).toBe(true);
    expect(existsSync(kitPath('fonts', `${id}.ttf`))).toBe(true);
    expect(readFileSync(kitPath('fonts', `${id}-OFL.txt`), 'utf8').toUpperCase()).toContain('SIL OPEN FONT LICENSE');
  });

  it('does not change the seeded set saved stores were drawn from', () => {
    expect(PREMIUM.some(id => (SOURCE_FONT_SEED_IDS as readonly string[]).includes(id))).toBe(false);
  });
});
