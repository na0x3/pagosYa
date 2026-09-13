import {continuedCatalogRequest} from './source-catalog-request';
const pending='Crea el producto Camisa a Bs 120, colores Negro y Blanco, tallas M y L';
it('carries only unanswered catalog details into a clarification',()=>{
  expect(continuedCatalogRequest(pending,'cinco de cada una')).toContain(pending);
  expect(continuedCatalogRequest(pending,'5 de cada una')).toContain(pending);
  expect(continuedCatalogRequest(pending,'Cambia el fondo')).toBe('Cambia el fondo');
  expect(continuedCatalogRequest(pending,'Cancela, cambia el logo')).toBe('Cancela, cambia el logo');
  expect(continuedCatalogRequest(undefined,'sí')).toBe('sí');
});
