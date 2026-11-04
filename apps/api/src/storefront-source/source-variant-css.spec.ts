import { frameChoices, masterDnaLook, refreshVariantBlocks, withOnlyTheme, withOnlyVariants } from './source-master';

// Template frame variety (2026-11-03): every template carries every footer, button, card and product page; a store keeps only the
// CSS of the ones it uses («v:part=value» blocks), so new variants never push a store past the 180 kB stylesheet limit (Palo Alto).
describe('variant CSS blocks', () => {
  const sheet = [
    '.es-footer{padding:72px}',
    '/* v:footer=mega */.es-footer[data-es-footer="mega"] .es-footer__grid{grid-template-columns:repeat(5,1fr)}/* /v:footer=mega */',
    '/* v:footer=band */.es-footer[data-es-footer="band"]{background:var(--es-accent)}/* /v:footer=band */',
    '/* v:button=sticker */.es[data-es-button="sticker"] .es-btn{border:2px solid}/* /v:button=sticker */',
    '/* v:lbcard=overlay */.lb-card[data-lb-card="overlay"]{position:relative}/* /v:lbcard=overlay */',
    '/* theme:paloalto */[data-es-theme="paloalto"] .es-footer{background:#111}/* /theme:paloalto */',
  ].join('\n');

  it('keeps the blocks of the chosen variants and empties the rest, leaving their markers', () => {
    const out = withOnlyVariants(sheet, { footer: 'mega', button: 'pill', lbcard: 'overlay' });
    expect(out).toContain('repeat(5,1fr)');
    expect(out).not.toContain('background:var(--es-accent)');
    expect(out).toContain('/* v:footer=band *//* /v:footer=band */');
    expect(out).not.toContain('border:2px solid');
    expect(out).toContain('/* v:button=sticker *//* /v:button=sticker */');
    expect(out).toContain('.lb-card[data-lb-card="overlay"]');
    expect(out).toContain('.es-footer{padding:72px}');
  });

  it('empties every block of a part the store has no value for (a default never has a block)', () => {
    const out = withOnlyVariants(sheet, {});
    expect(out).not.toMatch(/repeat\(5,1fr\)|var\(--es-accent\)|border:2px solid|position:relative/);
  });

  it('withOnlyTheme keeps the variant markers when it drops the developer notes', () => {
    const out = withOnlyTheme(`/* a note */${sheet}`, 'paloalto', new Set(), { footer: 'band' });
    expect(out).not.toContain('a note');
    expect(out).toContain('/* v:footer=mega *//* /v:footer=mega */');
    expect(out).toContain('background:var(--es-accent)');
    expect(out).toContain('[data-es-theme="paloalto"] .es-footer{background:#111}');
  });

  it('a refill fills the block of a newly chosen variant from the template and empties the old one', () => {
    const store = withOnlyVariants(sheet, { footer: 'mega' });
    const out = refreshVariantBlocks(store, sheet, { footer: 'band' });
    expect(out).toContain('background:var(--es-accent)');
    expect(out).toContain('/* v:footer=mega *//* /v:footer=mega */');
  });

  it('a refill adds a chosen block an older store never had, before the theme block', () => {
    const older = '.es-footer{padding:72px}\n/* theme:paloalto */x{}/* /theme:paloalto */';
    const out = refreshVariantBlocks(older, sheet, { footer: 'band' });
    expect(out.indexOf('background:var(--es-accent)')).toBeGreaterThan(-1);
    expect(out.indexOf('background:var(--es-accent)')).toBeLessThan(out.indexOf('/* theme:paloalto */'));
    expect(refreshVariantBlocks(older, sheet, { footer: 'columns' })).toBe(older);
  });

  it('tells the kit how to draw the product photos and its own buttons for the new product pages and button looks', () => {
    expect(masterDnaLook({ pdp: 'grid-2' } as any).gallery).toBe('mosaic');
    expect(masterDnaLook({ pdp: 'stacked' } as any).gallery).toBe('stack');
    expect(masterDnaLook({ pdp: 'strip' } as any).gallery).toBe('strip');
    expect(masterDnaLook({ pdp: 'gallery-left' } as any).gallery).toBeUndefined();
    expect(masterDnaLook({ button: 'sticker' } as any).button).toBe('sticker');
    expect(masterDnaLook({ button: 'caps' } as any).button).toBe('outline');
    for (const look of ['lift', 'block', 'rounded', 'cushion', 'chunky']) expect(masterDnaLook({ button: look } as any).button).toBe('block');
  });

  it('reads the frame choices from the variants and the first products section', () => {
    expect(frameChoices({ footer: 'mega', button: 'sticker', pdp: 'grid-2', theme: 'gumdrop' }, [{ type: 'cover-full' }, { type: 'products-grid', card: 'overlay' }]))
      .toEqual({ footer: 'mega', button: 'sticker', pdp: 'grid-2', lbcard: 'overlay' });
    expect(frameChoices({}, []).lbcard).toBe('classic');
  });
});
