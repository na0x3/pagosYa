import { goodsIcon, GOODS_ICON_IDS } from './source-goods-icon';

/** Owner 2026-11-06 («si es una joyería que el carrito sea un anillo»): the header's cart shows what the store sells. */
describe('goods icon', () => {
  it.each([
    [['Anillo Sello', 'Aros Argolla', 'Collar Gota', 'Anillos', 'Aros'], 'gem'],
    [['Sillón Lino Arena', 'Cama de Roble 2 Plazas', 'Estante de Nogal', 'Sala', 'Dormitorio'], 'sofa'],
    [['Sérum de Rosa Mosqueta', 'Bruma de Lavanda', 'Bálsamo Reparador', 'Rostro'], 'flask'],
    [['Bife de chorizo', 'Costillas BBQ', 'Tabla para compartir', 'Cortes'], 'beef'],
    [['Gelato de tofu con cereal', 'Caja DooBoo con capibara', 'Vasos', 'DooBoo Gelato'], 'icecream'],
    [['Hoodie Boxy Esencial', 'Hoodie Slow Sunday', 'Básicos'], 'shirt'],
    [['Intermezzo - Sally Rooney', 'Pack de libros contemporáneos', 'Libros'], 'book'],
    [['Croissant de mantequilla', 'Caja de rolls rellenos', 'Panadería'], 'croissant'],
    [['Premios para perro', 'Comida fresca para perros', 'Mascotas'], 'paw'],
    [['Aceite de sésamo prensado', 'Aceite de coco', 'Aceites'], 'droplet'],
    // Evaluation stores 2026-11-06: dog food, a market, sodas, hot sauce.
    [['Croquetas naturales 2 kg', 'Comida fresca pollo y manzana 500 g', 'Croquetas', 'Snacks'], 'paw'],
    [['Caja semanal de frutas y verduras', 'Frutas premium surtidas', 'Selección de verduras verdes', 'Frutas'], 'apple'],
    [['Oh Belly soda prebiótica', 'Pack surtido x6', 'Sodas', 'Packs'], 'soda'],
    [['Salsa Red Pepper Heat 250 ml', 'Salsa Garlic Heat 250 ml', 'Salsas'], 'flame'],
  ])('%j → %s', (words, expected) => expect(goodsIcon(words)).toBe(expected));

  it('the store\'s own name weighs more than a product\'s («Taller Lienzo» sells paintings, some named «Café…»)', () => {
    const paintings = ['Café Good News', 'Café sobre Azulejos', 'Café en el Jardín', 'Retrato de Caballero Clásico', 'Ventana Mediterránea', 'Cafés y mesas', 'Lugares'];
    expect(goodsIcon(paintings, 'Taller Lienzo')).toBe('palette');
    expect(goodsIcon(paintings)).toBe('coffee');
  });

  it('keeps the theme\'s own cart when the goods say nothing clear', () => {
    expect(goodsIcon(['Licuadora personal 600 W', 'Vaso extra 700 ml'])).toBe('');
    expect(goodsIcon([])).toBe('');
  });

  it('a word inside another word never counts («pantalón» is not «pan»)', () => {
    expect(goodsIcon(['Pantalón Plisado', 'Camisa Lino', 'Blazer Noche'])).toBe('shirt');
  });

  it('names only icons the template draws', () => {
    expect(GOODS_ICON_IDS).toEqual(expect.arrayContaining(['gem', 'sofa', 'flask', 'beef', 'icecream', 'shirt', 'book', 'croissant', 'paw', 'droplet']));
  });
});
