import { catalogueDigest } from './sketch-catalogue-digest';
import { specificityReport } from './sketch-specificity';
import type { StoreSketch } from './sketch-schema';

const digest = catalogueDigest(
  [
    { name: 'Focaccia romero', amount: 4500, categoryId: 'c1', tags: ['artesanal'], description: 'Masa de 24 horas.', variants: [{ options: [{ name: 'Tamaño', value: 'Chica' }, { name: 'Tamaño', value: 'Grande' }] }] },
    { name: 'Pan de masa madre', amount: 3000, categoryId: 'c1', specifications: [{ label: 'Harina', value: 'Integral' }] },
    { name: 'Tarta', amount: 6000, categoryId: 'c2' },
  ],
  [{ id: 'c1', name: 'Panadería' }, { id: 'c2', name: 'Dulces' }],
);
const sketchOf = (blocks: unknown[]) => ({ blocks }) as unknown as StoreSketch;

describe('specificityReport', () => {
  it('counts prose bands that mention something real from the catalogue', () => {
    const report = specificityReport(sketchOf([
      { id: 'a', type: 'story', title: 'Masa madre', paragraphs: ['Fermentamos el pan de masa madre 24 horas.'] },
      { id: 'b', type: 'banner', headline: 'Llevate una focaccia romero' },
    ]), digest);
    expect(report).toMatchObject({ blocks: 2, bands: 2, groundedBands: 2 });
    expect(report.hits).toBeGreaterThanOrEqual(2);
  });

  it('separates how many bands carry prose from how many are grounded', () => {
    const report = specificityReport(sketchOf([
      { id: 'a', type: 'story', title: 'Nuestra historia', paragraphs: ['Empezamos hace diez años en una esquina.'] },
      { id: 'b', type: 'banner', headline: 'Pan recién salido del horno hoy' },
      { id: 'c', type: 'catalog', title: 'Panadería de barrio' },
      { id: 'd', type: 'marquee', text: 'ya' },
    ]), digest);
    expect(report).toMatchObject({ blocks: 4, bands: 3, groundedBands: 1 });
  });

  it('names the filler it found, and a filler-only page is not grounded', () => {
    const report = specificityReport(sketchOf([{ id: 'a', type: 'story', title: 'Nuestra historia', paragraphs: ['Una selección pensada con calidad que se nota.'] }]), digest);
    expect(report.groundedBands).toBe(0);
    expect(report.filler).toEqual(expect.arrayContaining(['calidad que se nota', 'una selección pensada']));
  });

  it('matches options, materials and tags, folding accents and plurals', () => {
    const report = specificityReport(sketchOf([
      { id: 'a', type: 'story', title: 'x', paragraphs: ['Disponible en tamaño grande para compartir'] },
      { id: 'b', type: 'story', title: 'x', paragraphs: ['Siempre con harina integral de molino'] },
      { id: 'c', type: 'story', title: 'x', paragraphs: ['Todo es muy ARTESANAL en esta casa'] },
      { id: 'd', type: 'story', title: 'x', paragraphs: ['Las tartas de la casa cada mañana'] },
    ]), digest);
    expect(report.groundedBands).toBe(4);
  });

  it('does not count ids, hrefs, button labels or short terms as prose or as a match', () => {
    const short = catalogueDigest([{ name: 'Sal', amount: 100, categoryId: 'c' }], [{ id: 'c', name: 'Pan' }]);
    const report = specificityReport(sketchOf([
      { id: 'focaccia romero entera', type: 'hero', headline: 'Bienvenidos a nuestra casa de siempre', cta: 'Focaccia romero', href: 'focaccia.html' },
    ]), short);
    expect(report.groundedBands).toBe(0);
    const withBig = specificityReport(sketchOf([{ id: 'x', type: 'hero', headline: 'Bienvenidos a nuestra casa de siempre', cta: 'Focaccia romero', photo: 'focaccia romero.jpg' }]), digest);
    expect(withBig.groundedBands).toBe(0);
  });

  it('reads nested prose such as items and quotes', () => {
    const report = specificityReport(sketchOf([{ id: 'a', type: 'faq', title: 'Preguntas', items: [{ q: '¿Cuánto dura la focaccia?', a: 'Dos días.' }] }]), digest);
    expect(report.groundedBands).toBe(1);
  });

  it('reports and never rewrites', () => {
    const sketch = sketchOf([{ id: 'a', type: 'story', title: 'Una selección pensada', paragraphs: ['Focaccia romero, hecho con amor.'] }]);
    const before = JSON.stringify(sketch);
    specificityReport(sketch, digest);
    expect(JSON.stringify(sketch)).toBe(before);
  });

  it('never throws on garbage', () => {
    for (const bad of [undefined, null, {}, { blocks: 'x' }, { blocks: [null, 3, { title: 5 }] }]) {
      expect(() => specificityReport(bad as never, digest)).not.toThrow();
      expect(() => specificityReport(sketchOf([{ title: 'hola mundo largo' }]), bad as never)).not.toThrow();
    }
    expect(specificityReport(undefined as never, digest)).toMatchObject({ bands: 0, groundedBands: 0, filler: [] });
  });
});
