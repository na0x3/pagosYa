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

import { accountFramePolicy, protectAccountResponse } from '../account-security.mjs';
it('restricts production account embedding to same-origin stores and explicitly configured editors',()=>{
 const policy=accountFramePolicy({NODE_ENV:'production',MERCHANT_DASHBOARD_ORIGIN:'https://merchant.example',MERCHANT_STUDIO_ORIGIN:'javascript:alert(1)'});
 expect(policy).toContain("frame-ancestors 'self' https://merchant.example;");
 expect(policy).not.toContain('frame-ancestors https:');expect(policy).not.toContain('localhost');
 expect(accountFramePolicy({NODE_ENV:'production',MERCHANT_DASHBOARD_ORIGIN:'https://merchant.example; https://evil.example'})).not.toContain('evil.example');
 const result=new Map<string,string>();protectAccountResponse('/cuenta/shop/ingresar',{setHeader:(k:string,v:string)=>result.set(k,v)},{NODE_ENV:'production'});
 expect(result.get('Cache-Control')).toBe('no-store');
});
