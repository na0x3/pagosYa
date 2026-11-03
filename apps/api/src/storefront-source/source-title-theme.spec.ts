import { templateManifest } from '@pagosya/store-templates';
import { masterLook, masterThemeCss } from './source-master';

const settings = templateManifest('esencial')!.master!;
describe('title colours in the theme block (spec 2026-11-03 chunky colour titles)', () => {
  it('writes four title variables and the chosen style\'s font', () => {
    const look = masterLook(settings, { colors: { paper: '#f6f4ee', ink: '#1d1d1b', accent: '#5d7a2e' }, titles: ['#5d7a2e', '#c0392b'] });
    const css = masterThemeCss(settings, look, 'burbuja');
    expect(css).toMatch(/--es-title-1:#5d7a2e;--es-title-2:#c0392b;--es-title-3:#5d7a2e;--es-title-4:#c0392b;/);
    expect(css).toContain('url(assets/baloo-2.ttf)');
    expect(css).toContain("--es-title-font:'Baloo 2',var(--es-heading)");
  });
  it('falls back to two colours, and writes no title font for normal titles', () => {
    const css = masterThemeCss(settings, masterLook(settings, { colors: { paper: '#ffffff', ink: '#111111', accent: '#2457c5' } }));
    expect(css).toMatch(/--es-title-1:#[0-9a-f]{6};--es-title-2:#[0-9a-f]{6};--es-title-3:/);
    expect(css).not.toContain('--es-title-font');
  });
  it('drops invalid title colours', () => {
    expect(masterLook(settings, { titles: ['red', '#ABCDEF', '#123456', '#000000', '#ffffff', '#222222'] }).titles).toEqual(['#abcdef', '#123456', '#000000', '#ffffff']);
  });
});

describe('a title-style change rewrites the theme (spec 2026-11-03 §6)', () => {
  it('refill with variants.titles writes the new style\'s font face', () => {
    const { MASTER_THEME_START, MASTER_THEME_END, masterCopy } = require('./source-master');
    const { refillMasterFiles, templateStoreDataFile } = require('./source-templates');
    const manifest = { id: 'esencial', name: 'Esencial', category: 'general', description: 'x', tags: [], sitePurpose: 'shop', order: 0, hidden: true, master: settings, photos: [] };
    const files = [templateStoreDataFile({ name: 'Nube' }, { hero: '' }, { copy: masterCopy(settings), look: masterLook(settings), variants: { theme: 'unico', titles: 'redonda', sections: [] } }),
      { path: 'styles/globals.css', content: `${MASTER_THEME_START}\n:root{}\n${MASTER_THEME_END}\nbody{margin:0}` }];
    const out = refillMasterFiles(files, manifest, { variants: { titles: 'burbuja' } });
    const css = out.find((file: { path: string }) => file.path === 'styles/globals.css')!.content as string;
    expect(css).toContain('url(assets/baloo-2.ttf)');
    expect(css).toContain("--es-title-font:'Baloo 2',var(--es-heading)");
  });
});
