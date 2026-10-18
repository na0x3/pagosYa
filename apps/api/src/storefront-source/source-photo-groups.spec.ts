import { repairSourcePhotoGroups, sourcePhotoGroups } from './source-photo-groups';

/** florart 3mst1q0y 2026-10-18: the Sep-5 author's home page, cut to the photo wall and its neighbours. */
const FLORART_GALLERY = `<section class="gallery shell" aria-labelledby="galeria-title">
      <div class="gallery__heading reveal">
        <p class="eyebrow eyebrow--ink">Color, textura, luz</p>
        <h2 id="galeria-title">La mesa se llena de flores.</h2>
      </div>
      <div class="gallery__grid">
        <figure class="gallery__item gallery__item--a reveal"><img src="assets/image-813c3063c3f1.jpg" alt="Ramo con lirios"></figure>
        <figure class="gallery__item gallery__item--b reveal"><img src="assets/image-47430fb00ccd.jpg" alt="Ramo colorido"></figure>
        <figure class="gallery__item gallery__item--c reveal"><img src="assets/image-e3b32da4d4cb.jpg" alt="Ramo de gerberas"></figure>
        <figure class="gallery__item gallery__item--d reveal"><img src="assets/image-e41bf7087be8.jpg" alt="Bouquet pastel"></figure>
      </div>
    </section>`;
const page = (main: string) => `<!doctype html><html lang="es"><head><title>florart</title></head><body><header data-pagosya-header><img src="assets/logo.png" alt=""></header><main>
    <section class="story" id="florart" data-nav-label="Florart"><img src="assets/image-88d2dbaa2067.jpg" alt="Flores"><p>El olor de una idea.</p></section>
    ${main}
    <section class="answers" id="contacto"><h2>Preguntas</h2></section>
  </main><footer><img src="a.png" alt=""><img src="b.png" alt=""><img src="c.png" alt=""></footer></body></html>`;
const file = (content: string, path = 'index.html') => ({ path, content });
const run = (content: string, options: Partial<Parameters<typeof repairSourcePhotoGroups>[1]> = {}) =>
  repairSourcePhotoGroups([file(content)], { previousFiles: [], allowPhotoGroups: false, ...options });

describe('no photo groups at save time', () => {
  it('moves florart\'s photo wall into a carousel, keeping the section, its heading and the rest of the page', () => {
    const { files, repairs } = run(page(FLORART_GALLERY));
    const html = files[0].content;
    expect(repairs).toEqual(['index.html: moved a group of 4 photos into a carousel (no photo groups)']);
    // The grid wrapper held only photos, so it becomes the track; every photo and its figure survive, in order.
    expect(html).not.toContain('gallery__grid');
    expect(html).toContain('La mesa se llena de flores');
    expect(html).toContain('<section class="gallery shell" aria-labelledby="galeria-title">');
    expect(html).toMatch(/<div data-pagosya-carousel data-carousel-repaired aria-label="Fotos">\s*<figure class="gallery__item gallery__item--a reveal"><img src="assets\/image-813c3063c3f1.jpg"[^]*image-e41bf7087be8.jpg[^]*<\/figure>\s*<\/div>/);
    expect(html.match(/<figure/g)).toHaveLength(4);
    // One photo beside its story, the header logo and the footer are never a group.
    expect(html).toContain('image-88d2dbaa2067.jpg');
    expect(html).toContain('<img src="c.png" alt="">');
    expect(sourcePhotoGroups(html)).toEqual([]);
  });

  it('keeps the text around photos placed straight in the section, and the section in the menu', () => {
    const { files } = run(page('<section id="fotos" data-nav-label="Fotos"><h2>Fotos</h2><img src="1.jpg" alt=""><p>Entre fotos</p><img src="2.jpg" alt=""><img src="3.jpg" alt=""><p>Después</p></section>'));
    expect(files[0].content).toContain('<section id="fotos" data-nav-label="Fotos"><h2>Fotos</h2><div data-pagosya-carousel data-carousel-repaired aria-label="Fotos">\n<img src="1.jpg" alt="">\n<img src="2.jpg" alt="">\n<img src="3.jpg" alt="">\n</div><p>Entre fotos</p><p>Después</p></section>');
  });

  it('keeps two photos in a section, product cards that link to their page or sell themselves, the catalog mount and a carousel', () => {
    const twoPhotos = '<section><img src="1.jpg" alt=""><img src="2.jpg" alt=""><p>Texto</p></section>';
    const linkedCards = '<section>' + [1, 2, 3].map(n => `<a href="product.html?id=${n}"><img src="p${n}.jpg" alt=""><h3>Ramo ${n}</h3></a>`).join('') + '</section>';
    const sellingCards = '<section>' + [1, 2, 3].map(n => `<article><img src="s${n}.jpg" alt=""><button data-product-add data-add="${n}">Sumar</button></article>`).join('') + '</section>';
    const catalog = '<section><div data-pagosya-catalog><img src="c1.jpg" alt=""><img src="c2.jpg" alt=""><img src="c3.jpg" alt=""></div></section>';
    const carousel = '<section><div data-pagosya-carousel><figure><img src="k1.jpg" alt=""></figure><figure><img src="k2.jpg" alt=""></figure><figure><img src="k3.jpg" alt=""></figure></div></section>';
    const html = page(twoPhotos + linkedCards + sellingCards + catalog + carousel);
    expect(run(html)).toEqual({ files: [file(html)], repairs: [] });
  });

  it('counts the photos of a section once, whatever the wrapper (a direct child of main counts as a section)', () => {
    const { files, repairs } = run(page('<div class="mosaic"><div><picture><source srcset="1.webp"><img src="1.jpg" alt=""></picture></div><img src="2.jpg" alt=""><img src="./3.jpg" alt=""></div>'));
    expect(repairs).toEqual(['index.html: moved a group of 3 photos into a carousel (no photo groups)']);
    expect(files[0].content).toContain('<div class="mosaic"><div data-pagosya-carousel data-carousel-repaired aria-label="Fotos">\n<div><picture><source srcset="1.webp"><img src="1.jpg" alt=""></picture></div>');
  });

  it('lets the merchant\'s own gallery request through', () => {
    const html = page(FLORART_GALLERY);
    expect(run(html, { allowPhotoGroups: true }).repairs).toEqual([]);
  });

  it('leaves a group the previous revision already showed (a local edit), but not a new one', () => {
    const html = page(FLORART_GALLERY);
    expect(run(html, { previousFiles: [file(html)] }).repairs).toEqual([]);
    expect(run(html, { previousFiles: [file(page(''))] }).repairs).toHaveLength(1);
  });

  it('skips kit pages and binary files', () => {
    const wall = page('<section><img src="1.jpg" alt=""><img src="2.jpg" alt=""><img src="3.jpg" alt=""></section>');
    expect(repairSourcePhotoGroups([file(wall, 'product.html'), { path: 'x.html', content: 'AAAA', encoding: 'base64' } as any], { previousFiles: [], allowPhotoGroups: false }).repairs).toEqual([]);
  });
});
