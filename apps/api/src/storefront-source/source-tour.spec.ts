import { keepsStep, stepLine, tourFocus, tourSteps, TOUR_REQUEST } from './source-tour';

describe('YAPI store tour steps (spec 2026-11-09)', () => {
  it('walks header, every home section in order, footer, a product, the popup and the cart', () => {
    const steps = tourSteps({ layout: [{ type: 'hero', title: 'Pan de verdad' }, { type: 'products' }, { type: 'mystery' }], hasProduct: true, popupLookName: 'Postal' });
    expect(steps.map(s => [s.kind, s.page, s.at ?? s.part ?? null, s.label])).toEqual([
      ['part', 'home', 'header', 'Encabezado y menú'],
      ['section', 'home', 0, 'Pan de verdad'],
      ['section', 'home', 1, 'Productos'],
      ['section', 'home', 2, 'Sección 3'],
      ['part', 'home', 'footer', 'Pie de página'],
      ['product', 'product', null, 'Ficha de producto'],
      ['popup', 'home', null, 'Tu ventana de suscripción — estilo Postal'],
      ['cart', 'home', null, 'Carrito'],
    ]);
    expect(new Set(steps.map(s => s.id)).size).toBe(steps.length);
  });
  it('skips the product page when there is no product, and works without a layout', () => {
    // Live 2026-11-09 (Remolino): a store from before the section library has no layout — its home is one «Portada» step.
    expect(tourSteps({ layout: [], hasProduct: false, popupLookName: 'Clásica' }).map(s => [s.kind, s.part ?? null, s.label])).toEqual([['part', 'header', 'Encabezado y menú'], ['part', 'main', 'Portada'], ['part', 'footer', 'Pie de página'], ['popup', null, 'Tu ventana de suscripción — estilo Clásica'], ['cart', null, 'Carrito']]);
    expect(tourFocus({ instruction: 'otra foto arriba' }, { id: 'main', kind: 'part', page: 'home', part: 'main', label: 'Portada' }).instruction).toBe('En la portada: otra foto arriba');
  });
  it('asks the same question at every step, and hears a tour request in Spanish', () => {
    expect(stepLine({ id: 'x', kind: 'section', page: 'home', at: 0, label: 'Portada' }, 1, 8)).toBe('Paso 1 de 8 · Portada. ¿Te gusta así o cambio algo?');
    for (const text of ['muéstrame mi tienda', 'Hazme un tour', 'recorre mi tienda conmigo', 'quiero recorrer mi tienda', 'pero sigue con los pasos de antes', 'sigamos con el recorrido', 'continúa el tour']) expect(TOUR_REQUEST.test(text)).toBe(true);
    for (const text of ['muestra el precio', 'cambia el tour de la portada']) expect(TOUR_REQUEST.test(text)).toBe(false);
  });
  it('focuses the reply to «¿Qué le cambio?» on that step: a home section is pointed at, the rest named', () => {
    expect(tourFocus({ instruction: 'otra foto' }, { id: 'home-2', kind: 'section', page: 'home', at: 2, label: 'Opiniones' }))
      .toEqual({ instruction: 'otra foto', selection: { sectionId: 'home-2', page: 'home', at: 2 }, tourStepId: 'home-2', tourWords: 'otra foto' });
    expect(tourFocus({ instruction: 'más grande el logo' }, { id: 'header', kind: 'part', page: 'home', part: 'header', label: 'Encabezado y menú' }))
      .toEqual({ instruction: 'En el encabezado y menú: más grande el logo', tourStepId: 'header', tourWords: 'más grande el logo' });
    expect(tourFocus({ instruction: 'ponle otro color' }, { id: 'popup', kind: 'popup', page: 'home', label: 'Tu ventana de suscripción — estilo Postal' }).instruction)
      .toBe('En la ventana de suscripción: ponle otro color');
    expect(tourFocus({ instruction: 'x' }, { id: 'cart', kind: 'cart', page: 'home', label: 'Carrito' }).instruction).toBe('En el carrito: x');
    expect(tourFocus({ instruction: 'x' }, { id: 'product', kind: 'product', page: 'product', label: 'Ficha de producto' }).instruction).toBe('En la ficha de producto: x');
  });
  it('hears «keep it» while YAPI waits for a change (owner 2026-11-09: «perdón me equivoqué, sí me gustaba»)', () => {
    for (const text of ['perdon me equivoque si me gustaba', 'déjala así', 'no, está bien así', 'mejor no la cambies', 'me gusta', 'sigue', 'nada, siguiente'])
      expect(keepsStep(text)).toBe(true);
    for (const text of ['me gusta pero ponle otra foto', 'cambia el título', 'quítala', 'más corta', 'otro color'])
      expect(keepsStep(text)).toBe(false);
  });
  it('the focused request keeps the merchant own words for the chat', () => {
    expect(tourFocus({ instruction: 'x' }, { id: 'cart', kind: 'cart', page: 'home', label: 'Carrito' })).toMatchObject({ instruction: 'En el carrito: x', tourWords: 'x' });
  });
});

