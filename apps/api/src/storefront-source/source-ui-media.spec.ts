import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
import { compileNextPreview, nextProjectExport, validateNextSources } from './source-next';
import { uiStoreFiles } from './fixtures/ui-store';

jest.setTimeout(60_000);
const { JSDOM } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');

describe('visual storefront sections', () => {
  it('typechecks, compiles and exports the media APIs through the real preview pipeline', async () => {
    const files = uiStoreFiles();
    files[1].content = files[1].content
      .replace('Hero, ProductShowcase,', 'Hero, VideoHero, FloatingMedia, BeforeAfter, ProductShowcase, BrandEntrance, PageEntrance, EntranceGroup, Parallax, Reveal,')
      .replace('<main id="contenido">', `<main id="contenido">
        <BrandEntrance name="Taller Uno" duration={1000} />
        <PageEntrance variant="letter" mark="a" duration={900} />
        <EntranceGroup stagger={60}><p>Una colección</p><p>Con carácter</p></EntranceGroup>
        <Parallax strength={60} mobileStrength={0}><img src="/assets/sample.png" alt="Una pieza" /></Parallax>
        <Reveal delay={80}><p>Los detalles</p></Reveal>
        <VideoHero title="La colección" poster={{ src: '/assets/sample.png', alt: 'Una pieza' }} />
        <FloatingMedia title="El ritual" images={[{ src: '/assets/sample.png', alt: 'Una pieza' }]} />
        <BeforeAfter label="Dos vistas" before={{ src: '/assets/sample.png', alt: 'Estudio' }} after={{ src: '/assets/sample.png', alt: 'Ambiente' }} beforeLabel="Estudio" afterLabel="Ambiente" aspect="1/1" />`);
    expect(() => validateNextSources(files)).not.toThrow();
    const compiled = await compileNextPreview(files);
    expect(compiled.find(file => file.path === '_compiled/home.js')!.content).toContain('ui-video-hero');
    const exported = nextProjectExport(files, 'media');
    const ui = exported.find(file => file.path === 'lib/ui.tsx')!.content;
    expect(ui).toContain('export function BeforeAfter');
    expect(ui).toContain('export function PageEntrance');
    expect(ui).toContain('export function BrandEntrance');
    expect(ui).toContain('ui-overlay-menu');
    expect(ui).toContain('data-pagosya-video-managed');
  });

  it('keeps managed videos under React control while legacy videos still loop', () => {
    const dom = new JSDOM('<video data-pagosya-video-managed></video><video id="legacy"></video>', { runScripts: 'outside-only' });
    const play = jest.fn(async () => {});
    dom.window.HTMLMediaElement.prototype.play = play;
    dom.window.eval(readFileSync(kitPath('video.js'), 'utf8'));
    const managed = dom.window.document.querySelector('[data-pagosya-video-managed]');
    expect(managed.autoplay).toBe(false);
    expect(managed.loop).toBe(false);
    expect(dom.window.document.getElementById('legacy').autoplay).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    dom.window.close();
  });
});
