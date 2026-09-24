import { describe, expect, it } from 'vitest';
import { applySecurityHeaders } from '../../../scripts/http-security.mjs';

function headers(options = {}) {
  const values = new Map<string, string>();
  applySecurityHeaders({ setHeader: (name: string, value: string) => values.set(name, value) }, options);
  return values;
}

describe('storefront shell CSP', () => {
  it('restricts frame navigation while preserving embedding', () => {
    const result = headers({ allowEmbedding: true, allowGeolocation: true, storefront: true });
    const sources = "'self' https://www.openstreetmap.org/export/embed.html https://www.google.com/maps https://www.google.com/maps/ https://maps.google.com/maps https://maps.google.com/maps/";
    expect(result.get('content-security-policy')).toBe(
      `frame-ancestors https: http://localhost:* http://127.0.0.1:*; frame-src ${sources}; child-src ${sources}`,
    );
    expect(result.has('x-frame-options')).toBe(false);
    expect(result.get('cross-origin-resource-policy')).toBe('cross-origin');
    expect(result.get('permissions-policy')).toContain('geolocation=(self)');
  });

  it('preserves headers for other applications using the shared helper', () => {
    expect(headers().get('content-security-policy')).toBe("frame-ancestors 'none'; base-uri 'none'");
    expect(headers().get('x-frame-options')).toBe('DENY');
    expect(headers({ allowEmbedding: true }).get('content-security-policy')).toBe(
      'frame-ancestors https: http://localhost:* http://127.0.0.1:*',
    );
  });
});
