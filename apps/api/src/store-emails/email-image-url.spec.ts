import { emailImageUrl } from './email-image-url';

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
