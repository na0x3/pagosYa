import { BadGatewayException } from '@nestjs/common';
import { buildSourceVisualSystem, savedSourceVisualSystem, SOURCE_VISUAL_SYSTEM_FILE, sourceVisualSystemContext, validateSourceVisualSystem } from './source-visual-system';

const design = {
  selected: 0,
  concepts: [{ name: 'Mercado', premise: 'Products first', opening: 'Open with products', flow: 'Browse then buy', typography: 'Friendly', imagery: 'Use real photos', mobile: 'Stack buying controls', layout: { sections: ['catalog', 'story'], catalogSection: 'catalog', standaloneIntro: false, productsInOpening: true } }],
} as any;

describe('source visual system foundation', () => {
  it('derives guidance from the project concept, motion and assets without preset styling', () => {
    const system = buildSourceVisualSystem('expressive', [{ path: 'assets/photo.webp', role: 'product', description: 'Product photo', references: [], kind: 'image', bytes: 10 }], design);
    expect(system.version).toBe(3);
    expect(system).not.toHaveProperty('themeId');
    expect(system).not.toHaveProperty('tokens');
    expect(system.typography.display).toBe('Friendly');
    expect(system.iconography.family).toBe('lucide-local');
    expect(system.motion.mode).toBe('expressive');
    expect(system.layout.sectionOrder).toEqual(['catalog', 'story']);
    expect(system.assets[0]).toMatchObject({ path: 'assets/photo.webp', role: 'product' });
    expect(system.invariants).toEqual(expect.arrayContaining([expect.stringContaining('header, homepage, product page, cart, checkout')]))
  });

  it('does not revive old preset manifests and accepts independently authored colors', () => {
    expect(savedSourceVisualSystem([{ path: SOURCE_VISUAL_SYSTEM_FILE, content: JSON.stringify({ version: 1, themeId: 'print-club', tokens: { paper: '#fff4d6' } }) }])).toBeNull();
    expect(() => validateSourceVisualSystem([{ path: 'styles.css', content: ':root { --background: navy; --accent: lime; }' }])).not.toThrow();
  });

  it('rejects mixed external icon libraries and unavailable icon assets', () => {
    expect(() => validateSourceVisualSystem([{ path: 'styles/globals.css', content: '.x{background:url("assets/icons/not-real.svg")}'}])).toThrow(BadGatewayException);
    expect(() => validateSourceVisualSystem([{ path: 'components/home.tsx', content: "import { ShoppingCart } from 'lucide-react';" }])).toThrow('biblioteca de iconos externa');
  });

  it('round-trips the persisted manifest and exposes it to the generation prompt', () => {
    const system = buildSourceVisualSystem('off');
    const files = [{ path: SOURCE_VISUAL_SYSTEM_FILE, content: JSON.stringify(system) }];
    expect(savedSourceVisualSystem(files)).toEqual(system);
    expect(sourceVisualSystemContext(system)).toContain('Project-specific design guidance');
  });
});
