/** Icon names the storefront kit can draw, with the words a store owner reads. Kept in step with the API list by a test. */
export const PRODUCT_HIGHLIGHT_ICON_LABELS: Array<[string, string]> = [
  ['car', 'Auto'], ['fuel', 'Combustible'], ['gauge', 'Medidor'], ['gear', 'Engranaje'], ['seat', 'Asiento'], ['road', 'Carretera'],
  ['truck', 'Camión'], ['package', 'Paquete'], ['clock', 'Reloj'], ['calendar', 'Calendario'],
  ['bolt', 'Energía'], ['battery', 'Batería'], ['plug', 'Enchufe'], ['wifi', 'Wifi'], ['chip', 'Chip'], ['screen', 'Pantalla'],
  ['leaf', 'Hoja'], ['ruler', 'Medidas'], ['drop', 'Gota'], ['sun', 'Sol'], ['flame', 'Llama'], ['snowflake', 'Frío'],
  ['shirt', 'Prenda'], ['wash', 'Lavado'], ['sparkle', 'Brillo'], ['hand', 'Mano'], ['scissors', 'Tijeras'],
  ['cup', 'Taza'], ['wheat', 'Trigo'], ['chef-hat', 'Cocina'], ['bottle', 'Botella'],
  ['shield', 'Garantía'], ['star', 'Estrella'], ['heart', 'Favorito'], ['recycle', 'Reciclable'], ['check', 'Verificado'],
];
export const PRODUCT_HIGHLIGHT_ICONS = PRODUCT_HIGHLIGHT_ICON_LABELS.map(([name]) => name);
export type ProductHighlightInput = { icon: string; label: string; detail?: string };
