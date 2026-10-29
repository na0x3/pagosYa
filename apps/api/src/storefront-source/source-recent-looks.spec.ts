import { lookOf, recentLooks } from './source-recent-looks';

describe('the look of recent stores (2026-10-28)', () => {
  it('reads a free design\'s paper and heading font', () => {
    expect(lookOf([{ path: 'styles/globals.css', content: ':root{--store-background: #F3E7F5; --store-heading-font: "Bricolage Grotesque", sans-serif;}' }]))
      .toEqual({ paper: '#f3e7f5', heading: 'Bricolage Grotesque' });
  });
  it('reads an Esencial store\'s paper and heading font, the last declaration winning', () => {
    expect(lookOf([{ path: 'styles/globals.css', content: '.es{--es-paper:#ffffff;--es-heading:\'Geist\',sans-serif}\n.es{--es-paper: #faf5f5; --es-heading: \'Fredoka\',Georgia,serif;}' }]))
      .toEqual({ paper: '#faf5f5', heading: 'Fredoka' });
  });
  it('skips a heading that only points at another variable (Esencial maps --store-heading-font to var(--es-heading))', () => {
    expect(lookOf([{ path: 'styles/globals.css', content: ".es{--es-heading:'Fredoka',Georgia,serif;--store-heading-font:var(--es-heading)}" }]).heading).toBe('Fredoka');
  });
  it('gives nothing for a store without either', () => {
    expect(lookOf([{ path: 'components/home.tsx', content: '<main />' }])).toEqual({});
  });
  it('takes one look per store, newest first, never the store being built', async () => {
    const css = (paper: string) => ({ files: [{ path: 'styles/globals.css', content: `--store-background:${paper};` }] });
    const prisma = { storeSourceVersion: { findMany: jest.fn(async () => [
      { storeId: 'a', snapshot: css('#111111') }, { storeId: 'a', snapshot: css('#222222') }, { storeId: 'b', snapshot: css('#333333') },
    ]) } };
    expect(await recentLooks(prisma as any, 'self', 10)).toEqual([{ paper: '#111111' }, { paper: '#333333' }]);
    expect((prisma.storeSourceVersion.findMany.mock.calls[0] as any[])[0].where).toEqual({ storeId: { not: 'self' } });
  });
});
