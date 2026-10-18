import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';

/** Carousels and reviews (spec 2026-10-18-trust-draw-design.md): the kit turns [data-pagosya-carousel] into a one-at-a-time
 *  track with arrows and dots, and fills [data-pagosya-reviews] with the store's real reviews, labelled by where they came from. */
const { JSDOM, VirtualConsole } = createRequire(join(__dirname, '../../../checkout/package.json'))('jsdom');
const commerce = readFileSync(kitPath('commerce.js'), 'utf8');

const windows: any[] = [];
async function open(body: string, content: Record<string, unknown> = { articles: [], reviews: [], bundles: [] }, reduced = false) {
  const dom = new JSDOM(`<html><head></head><body>${body}<section data-pagosya-catalog></section></body></html>`, { url: 'https://shop.test/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: new VirtualConsole() });
  const w = dom.window; windows.push(w);
  w.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  w.matchMedia = (query: string) => ({ matches: query.includes('reduce') ? reduced : true });
  w.HTMLElement.prototype.scrollTo = function (options: { left: number }) { this.scrollLeft = options.left; };
  const data = { storeName: 'Marca', items: [], categories: [] };
  w.PAGOSYA_CONFIG = { slug: 'marca', apiBaseUrl: 'https://api.test', checkoutOrigin: 'https://pay.test', sitePurpose: 'shop', data };
  w.fetch = jest.fn(async (url: string) => ({ ok: true, json: async () => (String(url).includes('/content') ? content : data) }));
  // Every interval the kit starts, by its delay: the carousel's slow turn is the 7 s one.
  const intervals: number[] = []; const realInterval = w.setInterval.bind(w);
  w.setInterval = (fn: () => void, ms: number) => { intervals.push(ms); return realInterval(fn, ms); };
  w.__intervals = intervals;
  w.eval(commerce);
  await new Promise(resolve => setTimeout(resolve, 20));
  return w;
}
afterEach(() => { windows.splice(0).forEach(w => w.close()); });
/** Waits for the kit's content request to land, however busy the machine (a fixed delay failed under a parallel run). */
const until = async (ready: () => boolean) => { for (let i = 0; i < 200 && !ready(); i++) await new Promise(resolve => setTimeout(resolve, 10)); };
const slides = (n: number) => Array.from({ length: n }, (_, i) => `<figure><img src="${i}.jpg" alt="Foto ${i}"><figcaption>Foto ${i}</figcaption></figure>`).join('');

describe('the kit carousel', () => {
  it('adds arrows and one dot per slide after the track, marks the first slide, and labels the region', async () => {
    const w = await open(`<section><div data-pagosya-carousel aria-label="Ramos">${slides(4)}</div></section>`);
    const doc = w.document;
    const track = doc.querySelector('[data-pagosya-carousel]');
    expect(track.getAttribute('aria-roledescription')).toBe('carrusel');
    expect(track.getAttribute('aria-label')).toBe('Ramos');
    expect(track.nextElementSibling.className).toBe('pagosya-carousel__controls');
    expect(doc.querySelectorAll('.pagosya-carousel__dot')).toHaveLength(4);
    expect(doc.querySelector('.pagosya-carousel__dot').getAttribute('aria-current')).toBe('true');
    expect(Array.from(track.children, (slide: any) => slide.getAttribute('aria-label'))).toEqual(['1 de 4', '2 de 4', '3 de 4', '4 de 4']);
  });

  it('needs two slides, and never stacks a second set of controls', async () => {
    const w = await open(`<div data-pagosya-carousel>${slides(1)}</div><div data-pagosya-carousel id="two">${slides(2)}</div>`);
    expect(w.document.querySelectorAll('.pagosya-carousel__controls')).toHaveLength(1);
  });

  it('pins the one-at-a-time layout over a store grid, in the platform layer', async () => {
    const w = await open(`<div data-pagosya-carousel>${slides(3)}</div>`);
    const css = Array.from(w.document.querySelectorAll('style'), (style: any) => style.textContent).join('\n');
    expect(css).toContain('[data-pagosya-carousel]{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important');
    expect(css).toContain('[data-pagosya-carousel]>*{flex:0 0 100%');
    expect(css).toContain('[data-carousel-repaired]{grid-column:1/-1!important');
  });

  it('turns an auto carousel slowly, but never under reduced motion', async () => {
    expect((await open(`<div data-pagosya-carousel data-carousel-auto>${slides(3)}</div>`)).__intervals).toContain(7000);
    expect((await open(`<div data-pagosya-carousel data-carousel-auto>${slides(3)}</div>`, undefined, true)).__intervals).not.toContain(7000);
    expect((await open(`<div data-pagosya-carousel>${slides(3)}</div>`)).__intervals).not.toContain(7000);
  });
});

describe('the kit reviews', () => {
  const reviews = [
    { id: 'a', productId: null, displayName: 'Ana', rating: 5, body: 'Llegó <b>perfecto</b>', source: 'MERCHANT', sourceNote: 'por WhatsApp', createdAt: '2026-10-18' },
    { id: 'b', productId: 'p1', displayName: 'Luis', rating: 4, body: 'Muy lindo', source: 'ORDER', sourceNote: null, createdAt: '2026-10-17' },
  ];
  // The live store reads content only outside the editor preview.
  const live = async (body: string, list: unknown[]) => open(body, { articles: [], reviews: list, bundles: [] });

  it('labels a merchant-entered review and a verified purchase honestly, escaped, with stars, in a carousel', async () => {
    const w = await live('<section data-pagosya-reviews-section><h2>Lo que dicen</h2><div data-pagosya-reviews data-pagosya-carousel></div></section>', reviews);
    const doc = w.document;
    await until(() => doc.querySelectorAll('.pagosya-carousel__dot').length > 0);
    const text = Array.from(doc.querySelectorAll('.pagosya-review'), (el: any) => el.textContent.replace(/\s+/g, ' ').trim());
    expect(text).toEqual(['★★★★★Llegó <b>perfecto</b>Ana · Reseña de cliente · por WhatsApp', '★★★★☆Muy lindoLuis · Compra verificada']);
    expect(doc.querySelector('.pagosya-review__body b')).toBeNull();
    expect(doc.querySelector('.pagosya-review__stars').getAttribute('aria-label')).toBe('5 de 5');
    expect(doc.querySelectorAll('.pagosya-carousel__dot')).toHaveLength(2);
  });

  it('hides an empty reviews section away from the product page', async () => {
    const w = await live('<section data-pagosya-reviews-section><h2>Lo que dicen</h2><div data-pagosya-reviews></div></section>', []);
    await until(() => w.document.querySelector('[data-pagosya-reviews-section]').hidden);
    expect(w.document.querySelector('[data-pagosya-reviews-section]').hidden).toBe(true);
  });
});
