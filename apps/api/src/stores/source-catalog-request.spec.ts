import {continuedCatalogRequest, pendingCatalogRequest} from './source-catalog-request';
const pending='Crea el producto Camisa a Bs 120, colores Negro y Blanco, tallas M y L';
it('carries only unanswered catalog details into a clarification',()=>{
  expect(continuedCatalogRequest(pending,'cinco de cada una')).toContain(pending);
  expect(continuedCatalogRequest(pending,'5 de cada una')).toContain(pending);
  expect(continuedCatalogRequest(pending,'Cambia el fondo')).toBe('Cambia el fondo');
  expect(continuedCatalogRequest(pending,'Cancela, cambia el logo')).toBe('Cancela, cambia el logo');
  expect(continuedCatalogRequest(undefined,'sí')).toBe('sí');
});

it('keeps a catalog priced during setup until the merchant asks to build the store',()=>{
  const prices='Galletas sueltas: Chocolate chips – Bs 18. Matcha – Bs 22. Caja de 4 – Bs 80.';
  // No "crea" in the priced message, and the next message is about delivery, not a clarification.
  let pending=pendingCatalogRequest(prices,true);
  expect(pending).toBe(prices);
  const delivery=continuedCatalogRequest(pending,'Por ahora solo retiro en tienda, sin delivery.',true);
  pending=pendingCatalogRequest(delivery,true,pending);
  const build=continuedCatalogRequest(pending,'Crea la tienda con todo lo que ya acordamos.',true);
  expect(build).toContain('Chocolate chips – Bs 18');
  expect(build).toContain('Crea la tienda');
  expect(continuedCatalogRequest(pending,'Cancela los productos, solo el diseño',true)).toBe('Cancela los productos, solo el diseño');
});
it('does not carry an old request once the store has a site',()=>{
  expect(pendingCatalogRequest('Chocolate chips – Bs 18')).toBeUndefined();
  expect(continuedCatalogRequest('Crea el producto Matcha a Bs 22','Cambia el título')).toBe('Cambia el título');
  expect(pendingCatalogRequest('Hola, vendo galletas',true)).toBeUndefined();
});
