import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';

const files = ['commerce.js', 'privacy.js', 'retention.js', 'motion.js', 'video.js'].map(name => ({ name, source: readFileSync(kitPath(name), 'utf8') }));
// Storage prefixes the runtime may touch, each covered by a line of the cookies page (commerce.js, COOKIES_BODY).
// `funnel` and `analytics` are only cleared by privacy.js when a visitor declines statistics.
const DISCLOSED = ['cart', 'privacy', 'source-visitor', 'source-visit', 'partner', 'signup-dismissed', 'recovery', 'funnel', 'analytics'];

describe('the cookies page tells the truth about browser storage', () => {
  it('the runtime writes no cookies', () => {
    for (const { name, source } of files) expect({ name, cookies: /document\.cookie\s*=/.test(source) }).toEqual({ name, cookies: false });
  });

  it('every storage key prefix the runtime uses is one the page discloses', () => {
    const used = new Set<string>();
    for (const { source } of files) for (const match of source.matchAll(/pagosya:([a-z-]+):\$\{/g)) used.add(match[1]);
    const undisclosed = [...used].filter(prefix => !DISCLOSED.includes(prefix));
    expect(undisclosed).toEqual([]);
  });

  it('the page mentions each kind of stored data in words', () => {
    const body = readFileSync(kitPath('commerce.js'), 'utf8').match(/const COOKIES_BODY = '([^']*(?:\\'[^']*)*)'/)![1];
    for (const word of ['carrito', 'privacidad', 'Estadísticas', 'referido', 'Avisos']) expect(body).toContain(word);
  });
});
