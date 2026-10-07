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
  it('drops anything that is not https after resolution', () => {
    expect(emailImageUrl('/v1/uploads/abc.webp', 'http://localhost:3001')).toBeNull();
    expect(emailImageUrl('/v1/uploads/abc.webp', null)).toBeNull();
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
  it('points at the public icon route in the requested tone, only over https', () => {
    expect(emailIconUrl('truck', 'light', 'https://api.pagosya.bo')).toBe('https://api.pagosya.bo/v1/email-assets/icons/truck-light.png');
    expect(emailIconUrl('truck', 'dark', 'http://localhost:3001')).toBeNull();
    expect(emailIconUrl('truck', 'dark', null)).toBeNull();
  });
  it('ships every icon in both tones', () => {
    for (const icon of EMAIL_ICONS) for (const tone of ['dark', 'light']) expect(existsSync(kitPath('emails', 'icons', `${icon}-${tone}.png`))).toBe(true);
  });
});
