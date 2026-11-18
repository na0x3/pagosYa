import { brandLinks, isBrandRequest } from './brand-intent';

describe('brand intent', () => {
  it('recognises a branding request in Spanish and English', () => {
    for (const text of ['Mejorar mi marca', 'quiero que mi tienda parezca una marca', 'hazme un branding para mi tienda', 'improve my branding', 'rediseña mi identidad de marca']) expect(isBrandRequest(text)).toBe(true);
    for (const text of ['cambia el color del botón', 'agrega un producto', 'la marca de mi licuadora es Oster']) expect(isBrandRequest(text)).toBe(false);
    // Final review 2026-11-18: everyday edits that name the brand are edits, never a rebrand.
    for (const text of ['haz más grande el logo de mi marca', 'cambiar el color de la marca en el header', 'dame un banner con mi marca', 'mejora el texto de la marca', 'quita el branding de pagosYa del footer']) expect(isBrandRequest(text)).toBe(false);
    for (const text of ['quiero mejorar mi marca', 'Mejorar mi marca. https://calima-sauce.myshopify.com']) expect(isBrandRequest(text)).toBe(true);
  });

  it('finds the website and tells social profiles apart', () => {
    expect(brandLinks('mi tienda https://calima-sauce.myshopify.com gracias')).toEqual({ website: 'https://calima-sauce.myshopify.com' });
    expect(brandLinks('https://www.instagram.com/calima.bo/')).toEqual({ social: 'instagram' });
    expect(brandLinks('mira https://vm.tiktok.com/abc')).toEqual({ social: 'tiktok' });
    expect(brandLinks('sin enlaces')).toEqual({});
  });
});
