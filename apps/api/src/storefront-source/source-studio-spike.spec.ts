import { rawColours, studioImagePrompts, studioImages, STUDIO_RULES } from './source-studio-spike';
import { homeWriterInstructions } from './source-home-writer-stage';

/** Spike 2026-11-12 (owner: «find how they operate and replicate it»): Lovable's way on our template stores. */
describe('studio spike: only the design system paints the home', () => {
  it('finds colours written by hand', () => {
    const code = `<section style={{ background: '#ff3300', color: 'rgb(10, 20, 30)' }}><p style={{ borderColor: 'hsl(20 80% 50%)' }}>Hola</p></section>`;
    expect(rawColours(code)).toEqual(['#ff3300', 'rgb(10, 20, 30)', 'hsl(20 80% 50%)']);
  });
  it('lets the tokens, white and black and transparent through', () => {
    const code = `<div style={{ background: 'var(--es-accent)', color: 'color-mix(in srgb, var(--es-ink) 60%, transparent)', borderColor: '#fff' }} />
      {/* #123456 in a comment */} <a href="#productos">Ver</a>`;
    expect(rawColours(code)).toEqual([]);
  });
});

describe('studio spike: the writer is told Lovable\'s order', () => {
  it('a studio template home may set its own fonts, starts from the design system and never stretches a photo', () => {
    const text = homeWriterInstructions({ template: 'Motion', studio: true });
    expect(text).toContain(STUDIO_RULES);
    expect(text).not.toMatch(/las fuentes son de la plantilla y se mantienen/);
    expect(STUDIO_RULES).toMatch(/sistema de diseño/);
    expect(STUDIO_RULES).toMatch(/nunca más ancha que su tamaño real/);
  });
  it('without studio, the template writer is as before', () => {
    expect(homeWriterInstructions({ template: 'Motion' })).toMatch(/las fuentes son de la plantilla y se mantienen/);
  });
});

describe('studio spike: brand images', () => {
  it('asks for a wide cover and a tall mood photo from the merchant\'s words, without text or logos', () => {
    const prompts = studioImagePrompts('Oh Belly', 'Sodas prebióticas sin azúcar, cinco sabores.');
    expect(prompts.map(p => p.aspectRatio)).toEqual(['landscape', 'portrait']);
    for (const p of prompts) expect(p.prompt).toMatch(/Sodas prebióticas/);
  });
});

describe('studio spike: brand images never stop the build', () => {
  it('returns the urls of the images made, and skips one that fails', async () => {
    const made: string[] = [];
    const visual = { canGenerateStorefrontImages: () => true,
      generateStorefrontImage: jest.fn(async (_m: string, _s: string, _n: string, request: { aspectRatio: string }) => {
        if (request.aspectRatio === 'portrait') throw new Error('moderation');
        made.push(request.aspectRatio); return { url: '/v1/uploads/hero.jpg' };
      }) };
    expect(await studioImages(visual, 'm1', 's1', 'Oh Belly', 'Sodas')).toEqual(['/v1/uploads/hero.jpg']);
    expect(made).toEqual(['landscape']);
  });
  it('no image service or none configured: no images', async () => {
    expect(await studioImages(undefined, 'm1', 's1', 'X', 'Y')).toEqual([]);
    expect(await studioImages({ canGenerateStorefrontImages: () => false, generateStorefrontImage: jest.fn() }, 'm1', 's1', 'X', 'Y')).toEqual([]);
  });
});
