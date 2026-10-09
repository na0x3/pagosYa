import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

const root = kitPath('creative-assets');
const catalog = JSON.parse(readFileSync(join(root, 'catalog.json'), 'utf8')).assets as Array<Record<string, any>>;
const folderBytes = (dir: string): number => readdirSync(dir).reduce((sum, name) => { const path = join(dir, name); return sum + (statSync(path).isDirectory() ? folderBytes(path) : statSync(path).size); }, 0);

describe('creative asset catalogue', () => {
  it('imports the curated subjects in the four Fluent styles', () => {
    expect([...new Set(catalog.map(asset => asset.family))].sort()).toEqual(['fluent-3d', 'fluent-color', 'fluent-flat', 'fluent-mono']);
    expect(catalog.filter(asset => asset.family === 'fluent-flat').length).toBeGreaterThanOrEqual(500);
    expect(catalog.filter(asset => asset.family === 'fluent-mono').length).toBeGreaterThanOrEqual(500);
    expect(catalog.filter(asset => asset.family === 'fluent-3d').length).toBe(60);
  });
  it('keeps every file byte-identical to its record, within budget, MIT-licensed and keyworded in both languages', () => {
    for (const asset of catalog) {
      const bytes = readFileSync(join(root, asset.path.slice('assets/creative/'.length)));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.sha256);
      expect(bytes.length).toBe(asset.bytes);
      expect(bytes.length).toBeLessThanOrEqual(asset.path.endsWith('.png') ? 120 * 1024 : 60 * 1024);
      expect(asset.license).toBe('MIT');
      expect(asset.keywords.es.length).toBeGreaterThan(0);
      expect(asset.keywords.en.length).toBeGreaterThan(0);
      expect(asset.tone).toBe(asset.family === 'fluent-mono' ? 'store' : 'colour');
    }
    expect(folderBytes(root)).toBeLessThanOrEqual(15 * 1024 * 1024);
  });
  it('paints store-colour art only in currentColor, with no external references', () => {
    for (const asset of catalog.filter(entry => entry.family === 'fluent-mono')) {
      const svg = readFileSync(join(root, asset.path.slice('assets/creative/'.length)), 'utf8');
      for (const [, value] of svg.matchAll(/(?:fill|stroke|stop-color)[=:]\s*"?([^";\s>]+)/g)) expect(['none', 'currentColor']).toContain(value);
      // url(#…) points inside the same file (clip paths); anything else would reach outside it.
      expect(svg).not.toMatch(/url\((?!#)|href=|<script|<image/i);
    }
  });
  it('gives every file its own path', () => {
    expect(new Set(catalog.map(asset => asset.path)).size).toBe(catalog.length);
  });
  it('keeps the paths of the sixteen subjects stores already use', () => {
    const paths = new Set(catalog.map(asset => asset.path));
    for (const slug of ['sparkles', 'fire', 'sunflower', 'seedling', 'coffee', 'croissant', 'strawberry', 'lemon', 'avocado', 'bread', 'pizza', 'heart', 'rocket', 'confetti', 'butterfly', 'dog']) {
      expect(paths).toContain(`assets/creative/fluent-flat/${slug}.svg`);
      expect(paths).toContain(`assets/creative/fluent-3d/${slug}.png`);
    }
  });
  it('leaves out drawings with words inside, which the prompt forbids', () => {
    const subjects = new Set(catalog.map(asset => asset.subject));
    for (const subject of ['white-flower', 'new-button', 'hundred-points']) expect(subjects.has(subject)).toBe(false);
  });
  it('finds ice cream under its Spanish name', () => {
    expect(catalog.find(asset => asset.id === 'fluent-flat/soft-ice-cream')!.keywords.es).toEqual(expect.arrayContaining(['helado']));
  });
});
