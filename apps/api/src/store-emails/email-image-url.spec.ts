import { existsSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
import { EMAIL_ICONS, emailIconUrl, emailImageUrl } from './email-image-url';

describe('emailImageUrl', () => {
  const base = 'https://api.pagosya.bo';
  it('turns an upload path into an absolute https URL', () => {
    expect(emailImageUrl('/v1/uploads/abc.webp', base)).toBe('https://api.pagosya.bo/v1/uploads/abc.webp');
  });
  it('passes an absolute https URL through', () => {
    expect(emailImageUrl('https://cdn.example.com/a.png', base)).toBe('https://cdn.example.com/a.png');
  });
  // The base is the caller's decision: a sent email only ever gets the https PUBLIC_ASSET_BASE_URL
  // (StoreEmailService.base), the dashboard preview gets the API's own address so dev previews show images.
  it('resolves an upload path against the base its caller chose, and drops one without a base', () => {
    expect(emailImageUrl('/v1/uploads/abc.webp', 'http://localhost:3001')).toBe('http://localhost:3001/v1/uploads/abc.webp');
    expect(emailImageUrl('/v1/uploads/abc.webp', 'ftp://example.com')).toBeNull();
    expect(emailImageUrl('/v1/uploads/abc.webp', null)).toBeNull();
  });
  it('drops an absolute image that is not https', () => {
    expect(emailImageUrl('http://cdn.example.com/a.png', base)).toBeNull();
    expect(emailImageUrl('data:image/png;base64,AAAA', base)).toBeNull();
    expect(emailImageUrl('javascript:alert(1)', base)).toBeNull();
  });
  it('drops empty and unknown relative paths', () => {
    expect(emailImageUrl('', base)).toBeNull();
    expect(emailImageUrl(null, base)).toBeNull();
    expect(emailImageUrl('assets/hero.jpg', base)).toBeNull();
    expect(emailImageUrl('/v1/uploads/../secret', base)).toBeNull();
  });
});

describe('emailIconUrl', () => {
  it('points at the public icon route in the requested tone, on the base its caller chose', () => {
    expect(emailIconUrl('truck', 'light', 'https://api.pagosya.bo')).toBe('https://api.pagosya.bo/v1/email-assets/icons/truck-light.png');
    expect(emailIconUrl('truck', 'dark', 'http://localhost:3001')).toBe('http://localhost:3001/v1/email-assets/icons/truck-dark.png');
    expect(emailIconUrl('truck', 'dark', null)).toBeNull();
  });
  it('ships every icon in both tones', () => {
    for (const icon of EMAIL_ICONS) for (const tone of ['dark', 'light']) expect(existsSync(kitPath('emails', 'icons', `${icon}-${tone}.png`))).toBe(true);
  });
});
