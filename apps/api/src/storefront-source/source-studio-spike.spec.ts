import { hiddenCardParts, rawColours, studioImageMaker, unknownKitVars, studioImagePrompts, studioImages, STUDIO_RULES } from './source-studio-spike';
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

describe('studio spike: images with their own key on the ChatGPT plan (live 2026-11-12: the plan blanks the OpenAI key)', () => {
  it('asks the image model for a jpeg of the right shape and saves it', async () => {
    const fetchImage = jest.fn(async () => ({ ok: true, json: async () => ({ data: [{ b64_json: Buffer.from('jpeg-bytes').toString('base64') }] }) }));
    const save = jest.fn(async (bytes: Buffer) => ({ url: `/v1/uploads/${bytes.toString()}.jpg` }));
    const maker = studioImageMaker({ apiKey: 'k', model: 'gpt-image-2', fetch: fetchImage as never, save });
    expect(maker.canGenerateStorefrontImages()).toBe(true);
    expect(await maker.generateStorefrontImage('m', 's', 'Oh Belly', { prompt: 'Sodas', aspectRatio: 'portrait' })).toEqual({ url: '/v1/uploads/jpeg-bytes.jpg' });
    const body = JSON.parse((fetchImage.mock.calls[0] as any)[1].body);
    expect(body).toMatchObject({ model: 'gpt-image-2', size: '1024x1536', output_format: 'jpeg' });
    expect(body.prompt).toMatch(/Sodas[\s\S]*Sin texto/);
  });
  it('no key: no images', () => {
    expect(studioImageMaker({ apiKey: '', model: 'gpt-image-2', save: jest.fn() }).canGenerateStorefrontImages()).toBe(false);
  });
});

describe('studio spike: the cover title never sits on the photo on a computer (owner: Oh Belly hero, NOA studio 2026-11-12)', () => {
  it('says so in the rules', () => {
    expect(STUDIO_RULES).toMatch(/nunca va encima de la foto/);
  });
});

describe('studio spike: real names and nothing cut off (Oh Belly studio 2026-11-12: «Sabor uno», a sticker off the edge)', () => {
  it('says so in the rules', () => {
    expect(STUDIO_RULES).toMatch(/nunca nombres de relleno/);
    expect(STUDIO_RULES).toMatch(/nada se sale de la pantalla/);
  });
});

describe('studio spike: titles in the brand font at a title size (NOA studio2 2026-11-12: var(--es-font-heading), body-size h2)', () => {
  it('finds kit variables the stylesheet never defines', () => {
    const css = ':root{--es-paper:#fff;--es-ink:#111;--es-heading:\'Fraunces\';--es-body:\'Figtree\'}';
    const code = '<h1 style={{ fontFamily: \'var(--es-font-heading)\', color: \'var(--es-ink)\' }}>Hola</h1><style>{`[data-x]{--es-gap:2rem;margin:var(--es-gap)}`}</style>';
    expect(unknownKitVars(code, css)).toEqual(['--es-font-heading']);
  });
  it('names the real variables in the rules', () => {
    expect(STUDIO_RULES).toMatch(/var\(--es-heading\)/);
    expect(STUDIO_RULES).toMatch(/título de sección/);
  });
});

describe('studio spike: product cards keep their photos (NOA studio3 2026-11-12: .es-catalog .es-card__media{display:none})', () => {
  it('finds a home that hides the photo of the template\'s product cards', () => {
    expect(hiddenCardParts('<style>{`.es-catalog .es-card{padding:26px}.es-catalog .es-card__media{display:none!important}`}</style>')).toEqual(['.es-catalog .es-card__media']);
    expect(hiddenCardParts('<style>{`.menu-item img { visibility: hidden }`}</style>')).toEqual(['.menu-item img']);
  });
  it('finds photos hidden under the writer\'s own name for the product grid (Oh Belly studio3 2026-11-12)', () => {
    const code = '<style>{`[data-belly=main] img,[data-belly=main] picture,[data-belly=hero] img{display:none}`}</style><div className="es-grid" data-belly="main" data-pagosya-catalog data-pagosya-filters />';
    expect(hiddenCardParts(code)).toEqual(['[data-belly=main] img', '[data-belly=main] picture']);
  });
  it('lets the cards be framed and spaced', () => {
    expect(hiddenCardParts('<style>{`.es-catalog .es-card{border:0;padding:12px}.es-card__media img{border-radius:8px}.es-hero{display:none}`}</style>')).toEqual([]);
  });
  it('says so in the rules, with the grid filling the width', () => {
    expect(STUDIO_RULES).toMatch(/tarjetas de producto llevan su foto/);
    expect(STUDIO_RULES).toMatch(/medio ancho vacío/);
  });
});
