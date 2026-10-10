import { kitPath } from '@pagosya/storefront-kit';
import { MOTIF_SVG_ATTRIBUTES } from '../storefront-source/source-svg-sanitize';
import { typographicLogo } from './typographic-logo';

const font = kitPath('fonts', 'bricolage.ttf');
const tags = (svg: string) => [...svg.matchAll(/<([a-zA-Z]+)\b([^>]*)>/g)].map(match => ({ name: match[1], attrs: [...match[2].matchAll(/([\w:-]+)="/g)].map(attr => attr[1]) }));

describe('typographicLogo', () => {
  it('draws a wordmark from outlines only, inside the sanitizer allow-lists', () => {
    const svg = typographicLogo({ name: 'Estudio Eje', fontPath: font, ink: '#1e297a', ground: '#f4efe4', mode: 'wordmark' });
    expect(svg).not.toContain('<text');
    for (const tag of tags(svg)) {
      expect(['svg', 'rect', 'path']).toContain(tag.name);
      for (const attr of tag.attrs) if (attr !== 'xmlns') expect(MOTIF_SVG_ATTRIBUTES as readonly string[]).toContain(attr);
    }
    expect(svg).toContain('fill="#1e297a"');
    expect(svg).not.toContain('<rect');
  });
  it('draws a square mark of the first letter on the ground colour', () => {
    const svg = typographicLogo({ name: 'pilts', fontPath: font, ink: '#ffffff', ground: '#0b3d2e', mode: 'mark' });
    expect(svg).toMatch(/viewBox="0 0 100 100"/);
    expect(svg).toContain('<rect width="100" height="100" fill="#0b3d2e"/>');
    expect(svg.match(/<path /g)).toHaveLength(1);
  });
  it('uppercases only when the design asks for it', () => {
    const lower = typographicLogo({ name: 'pilts', fontPath: font, ink: '#000000', ground: '#ffffff', mode: 'mark' });
    const upper = typographicLogo({ name: 'pilts', fontPath: font, ink: '#000000', ground: '#ffffff', mode: 'mark', upper: true });
    expect(upper).not.toBe(lower);
  });
  it('replaces colours that are not plain hex, so nothing but a colour reaches an attribute', () => {
    const svg = typographicLogo({ name: 'A', fontPath: font, ink: 'red" onload="x', ground: 'var(--x)', mode: 'mark' });
    expect(svg).toContain('fill="#111111"');
    expect(svg).toContain('fill="#ffffff"');
    expect(svg).not.toContain('onload');
  });
  it('throws when there is nothing to draw or no font', () => {
    expect(() => typographicLogo({ name: '   ', fontPath: font, ink: '#000000', ground: '#ffffff', mode: 'wordmark' })).toThrow();
    expect(() => typographicLogo({ name: 'A', fontPath: '/nope/missing.ttf', ink: '#000000', ground: '#ffffff', mode: 'mark' })).toThrow();
  });
});
