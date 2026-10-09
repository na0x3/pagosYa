import { normalizeAccountTheme, resolveAccountTheme } from './account-theme';

describe('account theme', () => {
  it('keeps a known layout, a store photo and cosmetic CSS on account parts, scoped', () => {
    const { theme, dropped } = resolveAccountTheme({ layout: 'split', photo: 'assets/hero.jpg', css: '[data-part=title]{letter-spacing:.02em} [data-part=card]{border-radius:24px}' }, ['assets/hero.jpg']);
    expect(theme.layout).toBe('split');
    expect(theme.photo).toBe('assets/hero.jpg');
    expect(theme.css).toContain('[data-account-gate] [data-part="title"]');
    expect(dropped).toEqual([]);
  });
  it('never lets CSS hide the controls, and refuses foreign photos and layouts', () => {
    const { theme, dropped } = resolveAccountTheme({ layout: 'fullscreen', photo: 'https://evil.test/x.jpg', css: '[data-part=input]{display:none} [data-part=submit]{opacity:0} [data-part=error]{visibility:hidden} body{color:red}' }, ['assets/hero.jpg']);
    expect(theme).toEqual({ layout: 'card' });
    expect(dropped.length).toBeGreaterThanOrEqual(4);
  });
  it('is idempotent on a stored theme and drops garbage', () => {
    const { theme } = resolveAccountTheme({ layout: 'panel', css: '[data-part=lead]{font-size:18px}' }, []);
    expect(theme.css).toBeTruthy();
    expect(normalizeAccountTheme(theme)).toEqual(theme);
    expect(normalizeAccountTheme('nope')).toBeUndefined();
  });
});
