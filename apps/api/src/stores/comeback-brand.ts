/** Card identity follows confirmed brand colors, then the published store settings. */
export function comebackBrand(store: any) {
  const facts = store.brandProfile?.data?.confirmed;
  const brand = Object.fromEntries(Array.isArray(facts) ? facts.map((f: any) => [f.field, f.value]) : []);
  const color = (value: unknown): value is string => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value);
  const palette = ['#b69b88', '#cedcc9', '#cbd8e2', '#decbd5', '#e2d3af'];
  const seed = [...store.name].reduce((sum: number, c: string) => sum + c.codePointAt(0)!, 0);
  const background = [brand.surface, brand.background, store.backgroundColor, brand.accent, store.accentColor].find(color) || palette[seed % palette.length];
  const luminance = (hex: string) => {
    const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
  };
  const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
  const fallback = contrast(background, '#241e19') >= 4.5 ? '#241e19' : '#ffffff';
  const foreground = color(brand.foreground) && contrast(background, brand.foreground) >= 4.5 ? brand.foreground : fallback;
  return { name: store.name, logoUrl: store.logoUrl, background, foreground, fontStyle: store.fontStyle,
    stamp: /caf[eé]|coffee|roast|espresso|capuch|cappucc/i.test(`${store.name} ${store.tagline || ''}`) ? 'coffee' : 'brand' };
}
