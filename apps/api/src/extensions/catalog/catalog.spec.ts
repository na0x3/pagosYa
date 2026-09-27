import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { EXTENSIONS } from '../registry';
import { GUIDES } from './guides';

const logos = join(__dirname, '../../../../merchant-studio/public/integrations');

describe('extension catalog', () => {
  it('ships the 13 extensions of the spec, in order, with the catalogs as Pro', () => {
    expect(EXTENSIONS.map(item => item.id)).toEqual(['google-analytics', 'google-tag-manager', 'microsoft-clarity', 'hotjar', 'meta-pixel', 'tiktok-pixel', 'pinterest-tag', 'google-ads', 'google-search-console', 'bing-webmaster', 'pinterest-verification', 'google-shopping', 'meta-catalog']);
    expect(EXTENSIONS.filter(item => item.tier === 'pro').map(item => item.id)).toEqual(['google-shopping', 'meta-catalog']);
  });

  it.each(EXTENSIONS.map(item => [item.id, item] as const))('%s is complete: Spanish copy, a logo, placeholders its patterns accept, one capability', (_id, item) => {
    expect(item.summary.length).toBeGreaterThan(10);
    expect(item.description.length).toBeGreaterThan(20);
    if (item.logo) expect(existsSync(join(logos, `${item.logo}.svg`))).toBe(true);
    for (const field of item.settings) if (field.pattern && field.placeholder) expect(field.pattern.test(field.normalize ? field.normalize(field.placeholder) : field.placeholder)).toBe(true);
    expect([item.storefrontLoader, item.verificationMeta, item.productFeed].filter(Boolean)).toHaveLength(1);
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- parses the loader source the storefront embeds
    if (item.storefrontLoader) expect(() => new Function(`return (${item.storefrontLoader})`)()).not.toThrow();
    if (item.verificationMeta) expect(item.settings.some(field => field.key === item.verificationMeta!.settingKey && field.pattern)).toBe(true);
  });

  it('keeps guides apart from extensions', () => {
    expect(GUIDES.map(item => item.id)).toEqual(['meta-business-suite', 'instagram-ads', 'whatsapp-business']);
    for (const guide of GUIDES) expect(EXTENSIONS.some(item => item.id === guide.id)).toBe(false);
  });
});
