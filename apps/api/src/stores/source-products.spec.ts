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
