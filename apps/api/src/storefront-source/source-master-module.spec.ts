import { moduleFor } from './source-master-module';

// Owner 2026-10-27: one working module per store, only when the business plainly fits.
it('gives each business its own module, and none when nothing fits', () => {
  expect(moduleFor({ words: '', business: 'NOA VARGAS Atelier — alta costura: vestidos de novia y de noche' })).toBe('measure');
  expect(moduleFor({ words: '', business: 'Flor — ramos de flores frescas en papeles de colores' })).toBe('bouquet');
  expect(moduleFor({ words: '', business: 'Cuadrízate — láminas de arte enmarcadas a mano' })).toBe('frame');
  expect(moduleFor({ words: '', business: 'Remolino — licuadoras para batidos' })).toBe('compare');
  expect(moduleFor({ words: '', business: 'Antojo — cafetería y brunch en Sopocachi' })).toBe('reserve');
  expect(moduleFor({ words: '', business: 'Oh Belly — soda prebiótica sin azúcar' })).toBe('none');
  // Live check 2026-10-27: flowers named on a couture house or a print do not make a florist.
  expect(moduleFor({ words: 'vestidos de novia con flores esculpidas', business: 'NOA VARGAS Atelier' })).toBe('measure');
  expect(moduleFor({ words: '', business: 'Cuadrízate láminas enmarcadas: Flores en azul, Ventana a Amalfi' })).toBe('frame');
});

// Live check 2026-10-27: a soda brand with one poster in its catalogue, and a ready-to-wear house that mentions tailoring.
it('reads what the store is, not one product, and keeps measurements for made-to-measure', () => {
  expect(moduleFor({ words: 'Crea la tienda de Oh Belly, soda prebiótica', business: 'Oh Belly\nSoda prebiótica con burbujas' })).toBe('none');
  expect(moduleFor({ words: 'sastrería de temporada, abrigos y blazers', business: 'ZARA' })).toBe('none');
  expect(moduleFor({ words: '', business: 'Vestidos a medida para novias' })).toBe('measure');
});
