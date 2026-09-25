import { extractSourceMotifs, isSourceMotifFile, motifSlug, sourceMotifConfig, sourceMotifPaths, sourceMotifPrompt, withSanitizedMotifs } from './source-motifs';
import type { SourceDnaMotif } from './source-dna';
import { LAMP_SVG } from './fixtures/motifs';

const lamp: SourceDnaMotif = { for: 'product', target: 'Lámpara Luna', meaning: 'La lámpara se enciende y brilla', behavior: 'glow', trigger: 'hover', placement: 'product' };
const cup: SourceDnaMotif = { for: 'category', target: 'Café', meaning: 'Vapor de una taza recién servida', behavior: 'steam', trigger: 'add-to-cart', placement: 'cart' };
const hero: SourceDnaMotif = { for: 'store', target: 'Taller', meaning: 'Un sol que sale', behavior: 'grow', trigger: 'appear', placement: 'hero' };
const thanks: SourceDnaMotif = { for: 'store', target: 'Tienda', meaning: 'Un corazón que late', behavior: 'bounce', trigger: 'appear', placement: 'confirmation' };
const CUP_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path data-part="steam" d="M8 3v3M12 2v4"/><path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/></svg>';
const config = (value: unknown) => ({ path: 'config.js', content: `window.PAGOSYA_CONFIG = ${JSON.stringify(value)};\n` });
const readConfig = (files: Array<{ path: string; content: string }>) => JSON.parse(files.find(f => f.path === 'config.js')!.content.match(/=\s*([\s\S]*?);?\s*$/)![1]);

describe('motif file names', () => {
  it('derives a stable, accent-free slug from the target, deduplicated, with a fallback', () => {
    const taken = new Set<string>();
    expect(motifSlug('Lámpara Luna', 0, taken)).toBe('lampara-luna');
    expect(motifSlug('Lámpara  luna!', 1, taken)).toBe('lampara-luna-2');
    expect(motifSlug('★★', 2, taken)).toBe('motif-3');
    expect(motifSlug('Una lámpara de pie con pantalla de lino tejido', 0, new Set())).toBe('una-lampara-de-pie-con');
    expect(sourceMotifPaths([lamp, cup, hero])).toEqual(['motifs/lampara-luna.svg', 'motifs/cafe.svg', 'motifs/taller.svg']);
    expect(isSourceMotifFile('motifs/cafe.svg')).toBe(true);
    for (const path of ['motifs/../x.svg', 'motifs/a/b.svg', 'motifs/x.png', 'assets/x.svg', 'motifs/X.svg']) expect(isSourceMotifFile(path)).toBe(false);
  });
});

describe('the build prompt', () => {
  it('says nothing for a store without motifs', () => {
    expect(sourceMotifPrompt([])).toBe('');
  });
  it('lists every file to draw, with the part to label, and the hero <img> rule', () => {
    const prompt = sourceMotifPrompt([lamp, cup, hero]);
    for (const text of ['motifs/lampara-luna.svg', 'motifs/cafe.svg', 'motifs/taller.svg', 'data-part="light"', 'data-part="steam"', 'viewBox', 'currentColor', '<img src="motifs/taller.svg" alt="" aria-hidden="true">']) expect(prompt).toContain(text);
    expect(prompt).toMatch(/never an inline <svg>/i);
  });
});

describe('extracting the model\'s motif files', () => {
  it('keeps declared files sanitised, drops undeclared ones and hostile content, and reports each change', () => {
    const files = [
      { path: 'index.html', content: '<main></main>' },
      { path: 'motifs/lampara-luna.svg', content: LAMP_SVG.replace('<title>', '<script>alert(1)</script><title>') },
      { path: 'motifs/extra.svg', content: CUP_SVG },
      { path: 'motifs/cafe.svg', content: '<svg><defs/></svg>' },
    ];
    const result = extractSourceMotifs(files, [lamp, cup]);
    expect(result.files.map(f => f.path)).toEqual(['index.html']);
    expect(result.motifs.map(f => f.path)).toEqual(['motifs/lampara-luna.svg']);
    expect(result.motifs[0].content).not.toContain('script');
    expect(result.motifs[0].content).toContain('id="lampara-luna-glow"');
    expect(result.repairs).toEqual([
      'motifs/lampara-luna.svg: removed <script>',
      'motifs/extra.svg: not a DNA motif, dropped',
      'motifs/cafe.svg: dropped (no usable viewBox)',
    ]);
  });
  it('leaves a generation without motif files untouched', () => {
    const files = [{ path: 'index.html', content: '<main></main>' }];
    expect(extractSourceMotifs(files, [lamp])).toEqual({ files, motifs: [], repairs: [] });
  });
});

describe('the runtime config', () => {
  const files = [{ path: 'motifs/lampara-luna.svg', content: LAMP_SVG }, { path: 'motifs/cafe.svg', content: CUP_SVG }, { path: 'motifs/taller.svg', content: CUP_SVG }, { path: 'motifs/tienda.svg', content: CUP_SVG }];
  it('carries enums, the target and the sanitised markup, never the meaning prose; hero motifs have no kit slot', () => {
    const motifs = sourceMotifConfig([lamp, cup, hero], files);
    expect(motifs).toEqual([
      { file: 'motifs/lampara-luna.svg', for: 'product', target: 'Lámpara Luna', behavior: 'glow', trigger: 'hover', placement: 'product', svg: expect.stringContaining('data-part="light"') },
      { file: 'motifs/cafe.svg', for: 'category', target: 'Café', behavior: 'steam', trigger: 'add-to-cart', placement: 'cart', svg: CUP_SVG },
    ]);
    expect(JSON.stringify(motifs)).not.toMatch(/meaning|enciende|Vapor/);
  });
  it('drops motifs with unknown enums or no drawing, and plays the confirmation on purchase', () => {
    const odd = [{ ...lamp, behavior: 'explode' }, { ...cup, trigger: 'wink' }, { ...cup, placement: 'footer' }] as unknown as SourceDnaMotif[];
    expect(sourceMotifConfig(odd, files)).toEqual([]);
    expect(sourceMotifConfig([lamp], [])).toEqual([]);
    expect(sourceMotifConfig([thanks], files)[0]).toMatchObject({ placement: 'confirmation', trigger: 'purchase' });
    // purchase only happens on the confirmation; elsewhere it plays when the motif appears.
    expect(sourceMotifConfig([{ ...lamp, trigger: 'purchase' }], files)[0].trigger).toBe('appear');
    expect(sourceMotifConfig([], files)).toEqual([]);
  });
});

describe('every save re-sanitises motifs', () => {
  it('cleans a hand-edited config.js and motif file, and drops what cannot be cleaned', () => {
    const hostile = { file: 'motifs/lampara-luna.svg', for: 'product', target: 'Lámpara', behavior: 'glow', trigger: 'hover', placement: 'product', meaning: 'prose', svg: LAMP_SVG.replace('<title>', '<foreignObject><img src=x onerror=alert(1)></foreignObject><title>') };
    const files = [
      config({ slug: 's', motifs: [hostile, { ...hostile, svg: '<img src=x onerror=alert(1)>' }, { ...hostile, file: '../x.svg' }, { ...hostile, behavior: 'explode' }] }),
      { path: 'motifs/cafe.svg', content: CUP_SVG.replace('<path', '<path onclick="alert(1)"') },
      { path: 'motifs/bad.svg', content: '<p>no</p>' },
    ];
    const result = withSanitizedMotifs(files);
    const motifs = readConfig(result.files).motifs;
    expect(motifs).toHaveLength(1);
    expect(motifs[0]).not.toHaveProperty('meaning');
    expect(motifs[0].svg).not.toMatch(/foreignObject|onerror/);
    expect(result.files.find(f => f.path === 'motifs/cafe.svg')!.content).not.toContain('onclick');
    expect(result.files.some(f => f.path === 'motifs/bad.svg')).toBe(false);
    expect(result.repairs.length).toBeGreaterThan(0);
  });
  it('returns the very same files when there is nothing to clean', () => {
    const files = [config({ slug: 's', dna: { version: 1 } }), { path: 'index.html', content: '<main></main>' }];
    expect(withSanitizedMotifs(files).files).toBe(files);
    const clean = [config({ slug: 's', motifs: sourceMotifConfig([lamp], [{ path: 'motifs/lampara-luna.svg', content: LAMP_SVG }]) }), { path: 'motifs/cafe.svg', content: CUP_SVG }];
    expect(withSanitizedMotifs(clean).files).toBe(clean);
  });
});
