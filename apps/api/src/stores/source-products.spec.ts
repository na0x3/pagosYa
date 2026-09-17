import { requestedSourceProductOperations, requestedSourceProducts } from './source-products';
const product = { name: 'Café', description: 'Café frío', amount: 3500, currency: 'BOB', priceText: 'Bs 35', imageUrls: [] };
describe('Products requested in source chat', () => {
  it('accepts explicit prices in minor units and only returns supported catalog fields', () => {
    expect(requestedSourceProducts([product], 'Crea el producto Café por Bs 35', new Set())).toEqual([{ name:'Café', description:'Café frío', amount:3500, currency:'BOB', imageUrls:[] }]);
    expect(requestedSourceProducts([{...product, amount:1250,currency:'USD',priceText:'USD 12.50'}], 'Add product Coffee at USD 12.50', new Set())[0].amount).toBe(1250);
  });
  it.each([
    ['Cambia el color a Bs 35', product],
    ['Crea el producto Café', product],
    ['Crea el producto Café por Bs 35', {...product,amount:35000}],
    ['Crea el producto Café por Bs 35', {...product,currency:'USD'}],
    ['Crea el producto Café por Bs 35', {...product,imageUrls:['/v1/uploads/foreign.png']}],
    ['Crea el producto Café por Bs 35', {...product,name:''}],
  ])('rejects unauthorized, invented or invalid product data: %s', (instruction, value) => {
    expect(()=>requestedSourceProducts([value], instruction, new Set())).toThrow();
  });
  it('does not treat past product requests as permission to create duplicates', () => {
    expect(()=>requestedSourceProducts([product], 'Conversación anterior: Crea el producto Café por Bs 35\nPedido actual del comercio:\nCambia el título', new Set())).toThrow();
  });
  it('accepts a merchant-chosen local name and an explicitly assigned photo', () => {
    const photo = '/v1/uploads/11111111-1111-4111-8111-111111111111.jpg';
    const operation = { action: 'update', productId: 'p1', name: 'Perrusi', description: null, amount: null, currency: null, priceText: null, imageUrls: [photo], imagePositions: null, tags: null, stock: null, color: null };
    expect(requestedSourceProductOperations([operation], 'Pon esta foto en el producto Perrusi', [{ id: 'p1', imageUrls: [] }], new Set([photo]))).toEqual([
      { action: 'update', productId: 'p1', changes: { name: 'Perrusi', imageUrls: [photo] } },
    ]);
  });
  it('accepts explicit product deletion only for an existing product', () => {
    const operation = { action: 'delete', productId: 'p1', name: null, description: null, amount: null, currency: null, priceText: null, imageUrls: null, imagePositions: null, tags: null, stock: null, color: null };
    expect(requestedSourceProductOperations([operation], 'Elimina el producto Perrusi', [{ id: 'p1' }], new Set())).toEqual([{ action: 'delete', productId: 'p1' }]);
  });
});

describe('prices stated in an agreed catalog summary', () => {
  const summary = 'Crea la tienda con todo lo acordado.\nContexto acordado:\nCatálogo confirmado (Bs): Chocolate chips 18; Doble chocolate rellena 22; Matcha 22; Caja de 4 80; Caja de 12 220.';
  const item = (name: string, amount: number) => ({ name, description: '', amount, currency: 'BOB', priceText: `Bs ${amount / 100}`, imageUrls: [] });
  it('accepts a price that follows its own product name under a currency heading', () => {
    expect(requestedSourceProducts([item('Chocolate chips', 1800), item('Caja de 4', 8000), item('Caja de 12', 22000)], summary, new Set()).map(p => p.amount)).toEqual([1800, 8000, 22000]);
  });
  it('still rejects a price that is not the one stated for that product', () => {
    expect(() => requestedSourceProducts([item('Matcha', 1800)], summary, new Set())).toThrow('no inventa precios');
    expect(() => requestedSourceProducts([item('Pistacho', 2200)], summary, new Set())).toThrow('no inventa precios');
    expect(() => requestedSourceProducts([item('Caja de 4', 400)], summary, new Set())).toThrow('no inventa precios');
    expect(() => requestedSourceProducts([item('Caja de 1', 200)], summary, new Set())).toThrow('no inventa precios');
    expect(() => requestedSourceProducts([item('Caja de 1', 22000)], summary, new Set())).toThrow('no inventa precios');
    expect(() => requestedSourceProducts([{ ...item('Matcha', 2200), currency: 'USD', priceText: 'USD 22' }], summary, new Set())).toThrow();
  });
  it('accepts a launch catalog of up to twelve products in one message', () => {
    const names = Array.from({ length: 12 }, (_, i) => `Sabor ${String.fromCharCode(65 + i)}`);
    const text = 'Crea el catálogo (Bs): ' + names.map(n => `${n} 20`).join('; ');
    expect(requestedSourceProducts(names.map(n => item(n, 2000)), text, new Set())).toHaveLength(12);
    expect(() => requestedSourceProducts([...names, 'Sabor Z'].map(n => item(n, 2000)), text, new Set())).toThrow('hasta 12');
  });
});

describe('harmless price slips', () => {
  it('reads the amount from a correct quote when the model wrote bolivianos or added punctuation', () => {
    const text = 'Crea el producto Matcha por Bs 22 y el producto Caja de 6 por Bs 115';
    const base = { description: '', currency: 'BOB', imageUrls: [] };
    expect(requestedSourceProducts([{ ...base, name: 'Matcha', amount: 22, priceText: 'Bs 22' }], text, new Set())[0].amount).toBe(2200);
    expect(requestedSourceProducts([{ ...base, name: 'Caja de 6', amount: 11500, priceText: 'Bs 115.' }], text, new Set())[0].amount).toBe(11500);
  });
  it('still rejects an amount that disagrees with the quote', () => {
    const text = 'Crea el producto Matcha por Bs 22';
    expect(() => requestedSourceProducts([{ name: 'Matcha', description: '', currency: 'BOB', imageUrls: [], amount: 2300, priceText: 'Bs 22' }], text, new Set())).toThrow('precios claros');
  });
});
