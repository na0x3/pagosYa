import { copyBlueprintPrompt, copyReplyNote, copyStructureCheck, homeBlocks, normalizeBlueprint } from './copy-blueprint';

const raw = {
  sections: [
    { role: 'header', height: 80, background: '#ffffff', columns: 3, images: 1, placement: 'left', headings: [], buttons: 1, textChars: 40, align: 'left' },
    { role: 'hero', height: 720, background: 'image', columns: 2, mobileColumns: 1, images: 1, placement: 'right', headings: [{ level: 1, size: 64, weight: 800, uppercase: true, font: '"Playfair Display", serif', words: 5 }], buttons: 2, textChars: 160, align: 'left' },
    { role: 'section', height: 30, columns: 1 },
    { role: 'section', height: 540, background: '#F4EFE6', columns: 4, images: 4, placement: 'grid', headings: [{ level: 2, size: 36, weight: 700 }], buttons: 0, textChars: 600, align: 'center', carousel: true },
    { role: 'sneaky<script>', height: 300, background: 'url(javascript:1)', columns: 99, images: -3, placement: 'x', headings: [{ font: '<img onerror=1>' }], buttons: 1, textChars: 50 },
    { role: 'footer', height: 260, background: '#111111', columns: 4, buttons: 0, textChars: 400 },
  ],
  look: { background: '#FFFFFF', text: '#111111', accent: '#e4572e', surfaces: ['#f4efe6', 'nope'], headingFont: 'Playfair Display', bodyFont: 'Inter, sans-serif', radius: 999, contentWidth: 1180, button: 'pill' },
};

describe('normalizeBlueprint (spec 2026-10-18 website copy)', () => {
  it('keeps sane measures, drops slivers and cleans hostile values', () => {
    const blueprint = normalizeBlueprint(raw, 'https://www.otra.com/', [{ index: 1, image: 'data:image/jpeg;base64,AAA' }, { index: 9, image: 'data:image/jpeg;base64,BBB' }, { index: 0, image: 'javascript:x' }])!;
    expect(blueprint.host).toBe('otra.com');
    expect(blueprint.sections.map(section => section.role)).toEqual(['header', 'hero', 'section', 'section', 'footer']);
    expect(blueprint.sections.map(section => section.index)).toEqual([0, 1, 2, 3, 4]);
    expect(blueprint.sections[1]).toMatchObject({ background: 'image', columns: 2, mobileColumns: 1, headings: [{ level: 1, size: 64, weight: 800, uppercase: true, font: 'Playfair Display', words: 5 }] });
    expect(blueprint.sections[2]).toMatchObject({ background: '#f4efe6', placement: 'grid', carousel: true, align: 'center' });
    expect(blueprint.sections[3]).toMatchObject({ role: 'section', background: null, columns: 6, images: 0, placement: 'none', headings: [{ font: 'img onerror1' }] });
    expect(blueprint.look).toMatchObject({ background: '#ffffff', surfaces: ['#f4efe6'], bodyFont: 'Inter', radius: 60, button: 'pill' });
    expect(blueprint.crops).toEqual([{ index: 1, image: 'data:image/jpeg;base64,AAA' }]);
  });
  it('is null when nothing came through', () => {
    expect(normalizeBlueprint({ sections: [{ height: 10 }] }, 'https://x.com')).toBeNull();
    expect(normalizeBlueprint(null, 'https://x.com')).toBeNull();
  });
});

describe('copyBlueprintPrompt', () => {
  const blueprint = normalizeBlueprint(raw, 'https://www.otra.com/')!;
  it('lists every section in order with its layout, and never the other site\'s words', () => {
    const block = copyBlueprintPrompt(blueprint);
    expect(block).toContain('COPY BLUEPRINT (the merchant asked to copy the structure and look of otra.com');
    expect(block).toContain('2. hero: 2 columns (phone: 1), image on the right (1 image), h1 64px weight 800 uppercase (~5 words), 2 buttons');
    expect(block).toContain('3. section: 4 columns, a grid of images (4 images), shown as a carousel');
    expect(block).toContain('4. section: 6 columns');
    expect(block).toContain("Without them, use the reference's palette (background #ffffff, text #111111, accent #e4572e, section backgrounds #f4efe6)");
    expect(block).toContain("the merchant's confirmed brand colours, logo and fonts win when it has them");
    expect(block).toContain("Never copy otra.com's words, logo, photos");
  });
});

describe('homeBlocks / copyStructureCheck / copyReplyNote', () => {
  const blueprint = normalizeBlueprint(raw, 'https://www.otra.com/')!;
  const page = (sections: number) => `<html><body><header>x</header><main>${'<section>s</section>'.repeat(sections)}</main><footer>f</footer><script>1</script></body></html>`;
  it('reads the saved home page as header, hero, sections, footer', () => {
    expect(homeBlocks(page(3))).toEqual(['header', 'hero', 'section', 'section', 'footer']);
    expect(homeBlocks('<body><nav>n</nav><section>a</section><section>b</section></body>')).toEqual(['header', 'hero', 'section']);
  });
  it('counts body sections against the blueprint and says how close it came', () => {
    expect(copyStructureCheck(blueprint, page(3))).toEqual({ expected: 3, built: 3, ratio: 1, missing: 0 });
    const short = copyStructureCheck(blueprint, page(1));
    expect(short).toMatchObject({ expected: 3, built: 1, missing: 2 });
    expect(short.ratio).toBeCloseTo(1 / 3);
    expect(copyReplyNote(blueprint, copyStructureCheck(blueprint, page(4)))).toBe('Copié la estructura de otra.com: 3 de 3 secciones, con tu marca y tu contenido.');
    expect(copyReplyNote(blueprint, short)).toBe('Copié la estructura de otra.com: 1 de 3 secciones; 2 quedaron fuera. Pídeme «agrega las secciones que faltan» si las quieres.');
  });
});
