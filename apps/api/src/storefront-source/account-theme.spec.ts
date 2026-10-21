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
  // PEPPA please 2026-10-20: «solo en Crear cuenta» had no way into the theme.
  it('narrows a rule to one page by either of its names, and refuses an unknown page', () => {
    const { theme, dropped } = resolveAccountTheme({ layout: 'split', css: '[data-account-gate="register"] [data-part=card]{border:0} [data-account-gate=ingresar] [data-part=title]{letter-spacing:1px} [data-account-gate="checkout"] [data-part=card]{border:0}' }, []);
    expect(theme.css).toContain(':is([data-account-gate="register"],[data-account-gate="registro"]) [data-part="card"]');
    expect(theme.css).toContain(':is([data-account-gate="login"],[data-account-gate="ingresar"]) [data-part="title"]');
    expect(dropped).toEqual([expect.stringContaining('checkout')]);
    expect(normalizeAccountTheme(theme)!.css).toBe(theme.css);
  });
});
