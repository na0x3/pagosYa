import { closestPreset } from './source-preset-pick';

// Owner 2026-10-22: «include that» — a new store starts from the Plantillas preset closest to its business, not a random roll.
describe('closestPreset', () => {
  it.each([
    ['goodProtein, tienda de salud animada: proteínas, recuperación y snacks de varias marcas', 'antojo'],
    ['Soy Noa Vargas, diseñadora de alta costura: vestidos de novia y de noche, una casa de moda de lujo', 'firma'],
    ['Poleras y jeans para todos los días', 'diario'],
    ['Cafetería de especialidad, tostamos nuestro café', 'horno'],
    ['Panadería de masa madre con tortas', 'horno'],
    ['Verduras y frutas orgánicas del mercado, almacén', 'mercado'],
    ['Skincare y maquillaje', 'glow'],
    ['Comida y juguetes para perros y gatos', 'patitas'],
    ['Ropa y juguetes para bebés y niños', 'recreo'],
    ['Celulares, audífonos y electrónica', 'voltio'],
    ['Software y servicios de tecnología para empresas', 'nucleo'],
    ['Materiales de construcción y obra gruesa', 'cimiento'],
    ['Equipo de montaña, bicicletas y deporte al aire libre', 'cima'],
    ['Decoración y muebles para el hogar', 'casa'],
  ])('«%s» → %s', (text, preset) => expect(closestPreset(text)).toBe(preset));
  it('leaves a business it cannot place to the usual roll', () => {
    expect(closestPreset('Una tienda')).toBeUndefined();
  });
});
