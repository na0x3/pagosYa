import { requestedSourceVariants, requestedVariantOperations, applyVariantOperations } from './source-product-options';
import { normalizeProductVariants } from '../payment-links/product-variants';
// Exercise the same structured-output parsers and transaction path used by chat.
import { ProductSubscriptionCadence } from '@prisma/client';
import { SOURCE_PRODUCT_OPTIONS, requestedSourceSubscriptions, requestedSubscriptionOperations, sourceSubscriptionsSchema, sourceSubscriptionOperationsSchema } from './source-product-options';
import { requestedSourceProducts, requestedSourceProductOperations, sourceProductsSchema, sourceProductOperationsSchema } from './source-products';
import { SourceProjectsService } from './source-projects.service';


const raw = { name:null, options:[{name:'Color',value:'Negro'},{name:'Talla',value:'M'}], amount:null, priceText:null, stock:5, stockText:'cinco de cada una', imageUrl:null };
describe('chat product combinations',()=>{
  it('creates real combinations with inherited prices and explicit stock',()=>{
    const values = requestedSourceVariants([raw,{...raw,options:[{name:'Color',value:'Blanco'},{name:'Talla',value:'L'}],amount:14000,priceText:'+Bs 20'}], 'Crea producto Camisa Bs 120, Color Negro M, Blanco L +Bs 20, cinco de cada una',12000,'BOB',new Set())!;
    const variants=normalizeProductVariants(values);
    expect(variants.map(v=>[v.name,v.amount,v.stock])).toEqual([['Negro / M',12000,5],['Blanco / L',14000,5]]);
    expect(new Set(variants.map(v=>v.id)).size).toBe(2);
  });
  it('preserves other variants and concurrent stock when applying a price delta',()=>{
    const existing=normalizeProductVariants([{name:'M',amount:12000,stock:3},{name:'L',amount:12000,stock:4}]);
    const operations=requestedVariantOperations([{action:'update',variantId:existing[0].id,name:null,options:null,amount:14000,priceText:'Bs 140',stock:null,stockText:null,imageUrl:null}], 'Cambia opción M a Bs 140',{variants:existing,currency:'BOB'},new Set());
    const updated=applyVariantOperations([{...existing[0],stock:2},existing[1]],operations);
    expect(updated[0]).toMatchObject({id:existing[0].id,stock:2,amount:14000});
    expect(updated[1]).toEqual(existing[1]);
  });
  it('marks a combination sold out without removing its ID',()=>{
    const existing=normalizeProductVariants([{name:'M',amount:12000,stock:3},{name:'L',amount:12000,stock:4}]);
    const operations=requestedVariantOperations([{action:'update',variantId:existing[1].id,name:null,options:null,amount:null,priceText:null,stock:0,stockText:'sold out',imageUrl:null}], 'Size L sold out',{variants:existing,currency:'BOB'},new Set());
    expect(applyVariantOperations(existing,operations)[1]).toEqual({...existing[1],stock:0});
  });
  it.each([
    {...raw,stock:null,stockText:null}, {...raw,stock:99}, {...raw,amount:14000,priceText:'Bs 140'}, {...raw,imageUrl:'/v1/uploads/foreign.jpg'}, {...raw,options:[{name:'Color',value:'Rojo'}]},
  ])('rejects invented inventory, prices, images and choices',value=>{
    expect(()=>requestedSourceVariants([value],'Color Negro, talla M, cinco de cada una',12000,'BOB',new Set())).toThrow();
  });
  it('rejects duplicate combinations and inconsistent dimensions',()=>{
    const variant={name:'Negro / M',amount:12000,stock:5,options:raw.options};
    expect(()=>normalizeProductVariants([variant,variant])).toThrow();
    expect(()=>normalizeProductVariants([variant,{...variant,options:[{name:'Color',value:'Blanco'}]}])).toThrow();
  });
  it('preserves legacy shared stock and refuses to mix tracking modes',()=>{
    const existing=[{id:'old',name:'M',amount:12000},{id:'large',name:'L',amount:14000}];
    expect(normalizeProductVariants(existing,existing)).toEqual(existing);
    expect(()=>normalizeProductVariants([...existing,{name:'XL',amount:15000,stock:4}],existing)).toThrow(/stock/);
  });
});


const subscription = { cadence: ProductSubscriptionCadence.MONTHLY, discountPercent: 10, confirmationText: 'mensual con 10% de descuento' };
const subscriptionRequest = 'Configura suscripción de Café mensual con 10% de descuento';

describe('confirmed recurring-purchase options in chat', () => {
  it.each([
    ['WEEKLY', 'weekly with 5% off', 5],
    ['WEEKLY', 'semanal con 99% de descuento', 99],
    ['BIWEEKLY', 'cada dos semanas con 8% de descuento', 8],
    ['BIWEEKLY', 'every two weeks 8%', 8],
    ['MONTHLY', 'monthly no discount', 0],
    ['MONTHLY', 'mensual sin descuento', 0],
    ['MONTHLY', 'monthly 0%', 0],
  ])('accepts an explicit %s cadence and its confirmed discount', (cadence, confirmationText, discountPercent) => {
    expect(requestedSourceSubscriptions([{ cadence, confirmationText, discountPercent }], `Configura suscripción ${confirmationText}`)).toEqual([{ cadence, discountPercent }]);
  });

  it('does nothing for omitted or empty output', () => {
    expect(requestedSourceSubscriptions(undefined, 'Diseña una tienda de café')).toBeUndefined();
    expect(requestedSourceSubscriptions([], 'Diseña una tienda de café')).toBeUndefined();
    expect(requestedSubscriptionOperations([], 'Cambia el título')).toEqual([]);
  });

  it.each([
    { ...subscription, discountPercent: 15 },
    { ...subscription, discountPercent: '10' },
    { ...subscription, discountPercent: null },
    { ...subscription, cadence: 'WEEKLY' },
    { ...subscription, cadence: 'DAILY' },
    { ...subscription, confirmationText: '10%' },
    { ...subscription, confirmationText: 'monthly 10%' },
    { ...subscription, confirmationText: null },
    null,
  ])('rejects unconfirmed cadences/discounts and malformed data: %j', option => {
    expect(() => requestedSourceSubscriptions([option], subscriptionRequest)).toThrow();
  });

  it.each([
    'Diseña una tienda de café',
    'Un competidor ofrece suscripción mensual con 10% de descuento',
    '¿Ofrece suscripción mensual con 10% de descuento?',
    'No configura suscripción mensual con 10% de descuento',
    'Configura suscripción pero no mensual con 10% de descuento',
    'Conversación anterior: Configura suscripción mensual con 10% de descuento\nPedido actual del comercio: Cambia el título',
    'Conversación anterior: Configura suscripción mensual con 10% de descuento\nPedido actual del comercio: Configura una suscripción mensual',
  ])('does not reuse missing, reference-site or historical authorization: %s', instruction => {
    expect(() => requestedSourceSubscriptions([subscription], instruction)).toThrow();
  });

  it('does not borrow a discount from another cadence or a one-time campaign', () => {
    const weekly = { cadence: 'WEEKLY', discountPercent: 20, confirmationText: 'weekly 20%' };
    expect(() => requestedSourceSubscriptions([weekly], 'Set subscriptions weekly 10%, monthly 20%')).toThrow();
    expect(() => requestedSourceSubscriptions([weekly], 'Set subscriptions weekly; one-time promotion 20%')).toThrow();
    expect(() => requestedSourceSubscriptions([weekly], 'Set subscriptions biweekly 20%')).toThrow();
  });

  it.each([[-1, 'monthly -1%'], [100, 'monthly 100%'], [1.5, 'monthly 1.5%'], [0, 'monthly']])('requires a supported exact percentage: %s', (discountPercent, confirmationText) => {
    expect(() => requestedSourceSubscriptions([{ cadence: 'MONTHLY', discountPercent, confirmationText }], `Set subscriptions ${confirmationText}`)).toThrow();
  });

  it('rejects duplicate/excess cadences', () => {
    expect(() => requestedSourceSubscriptions([subscription, subscription], subscriptionRequest)).toThrow();
    expect(() => requestedSourceSubscriptions(Array(4).fill(subscription), subscriptionRequest)).toThrow();
    expect(() => requestedSubscriptionOperations([{ ...subscription, action: 'upsert' }, { ...subscription, action: 'upsert' }], subscriptionRequest)).toThrow();
  });

  it('requires explicit cadence-specific removal and does not turn an empty list into deletion', () => {
    const deletion = { action: 'delete', cadence: 'MONTHLY', discountPercent: null, confirmationText: 'elimina mensual' };
    expect(requestedSubscriptionOperations([deletion], 'Suscripciones de Café: elimina mensual')).toEqual([{ action: 'delete', cadence: 'MONTHLY' }]);
    expect(() => requestedSubscriptionOperations([deletion], subscriptionRequest)).toThrow();
    expect(() => requestedSubscriptionOperations([{ ...deletion, cadence: 'WEEKLY' }], 'Suscripciones: elimina mensual')).toThrow();
    expect(() => requestedSubscriptionOperations([{ ...deletion, discountPercent: 10 }], 'Suscripciones: elimina mensual')).toThrow();
    expect(() => requestedSubscriptionOperations([{ ...subscription, action: 'replace' }], subscriptionRequest)).toThrow();
  });

  it('wires the schemas into model output and strips evidence before persistence', () => {
    expect(sourceProductsSchema.items.properties.subscriptionOptions).toBe(sourceSubscriptionsSchema);
    expect(sourceProductOperationsSchema.items.properties.subscriptionOperations).toBe(sourceSubscriptionOperationsSchema);
    const created = requestedSourceProducts([{
      name: 'Café', description: '', amount: 3500, currency: 'BOB', priceText: 'Bs 35', imageUrls: [], subscriptionOptions: [subscription],
    }], `Crea producto Café Bs 35 con suscripción ${subscription.confirmationText}`, new Set());
    expect(created[0].subscriptionOptions).toEqual([{ cadence: 'MONTHLY', discountPercent: 10 }]);
    const updated = requestedSourceProductOperations([{
      action: 'update', productId: 'p1', subscriptionOperations: [{ ...subscription, action: 'upsert' }],
    }], subscriptionRequest, [{ id: 'p1' }], new Set());
    expect(updated).toEqual([{ action: 'update', productId: 'p1', changes: {}, subscriptionOperations: [{ action: 'upsert', cadence: 'MONTHLY', discountPercent: 10 }] }]);
    expect(() => requestedSourceProductOperations([{
      action: 'update', productId: 'foreign', subscriptionOperations: [{ ...subscription, action: 'upsert' }],
    }], subscriptionRequest, [{ id: 'p1' }], new Set())).toThrow();
    expect(SOURCE_PRODUCT_OPTIONS).toContain('subscriptionOptions');
    expect(SOURCE_PRODUCT_OPTIONS).toContain('A suggestion is not authorization');
    expect(SOURCE_PRODUCT_OPTIONS).toContain('automatic charging are not implemented');
  });

  it('persists chat creation and cadence edits in the source revision transaction', async () => {
    const prisma: any = {
      store: { findFirst: jest.fn().mockResolvedValue({ id: 's1' }) },
      storeSourceProject: { upsert: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      storeSourceGeneration: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      storeSourceVersion: { create: jest.fn().mockResolvedValue({ revision: 1 }) },
      paymentLink: {
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'new', ...data })),
        findFirst: jest.fn().mockResolvedValue({ id: 'p1', name: 'Café', currency: 'BOB', variants: [], imageUrls: [] }),
        update: jest.fn().mockResolvedValue({ id: 'p1', name: 'Café' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      productSubscriptionOption: { upsert: jest.fn(), deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    prisma.$transaction = jest.fn(async work => work(prisma));
    const service = new SourceProjectsService(prisma);
    const input = { revision: 0, label: 'Suscripciones', brief: { businessType: 'Café', audience: 'Neighbors', primaryAction: 'Pickup', visualDirection: 'Menu' }, files: [
      { path: 'package.json', content: '{"name":"cafe","scripts":{"build":"node build.mjs"}}' },
      { path: 'README.md', content: 'Build with npm run build. Commerce uses PagosYa.' },
      { path: 'build.mjs', content: 'console.log("build")' },
    ] };
    const products = requestedSourceProducts([{
      name: 'Café', description: '', amount: 3500, currency: 'BOB', priceText: 'Bs 35', imageUrls: [], subscriptionOptions: [subscription],
    }], `Crea producto Café Bs 35 con suscripción ${subscription.confirmationText}`, new Set());
    const productOperations = requestedSourceProductOperations([{
      action: 'update', productId: 'p1', subscriptionOperations: [{ ...subscription, action: 'upsert' }, { action: 'delete', cadence: 'WEEKLY', discountPercent: null, confirmationText: 'elimina semanal' }],
    }], `${subscriptionRequest}; elimina semanal`, [{ id: 'p1' }], new Set());
    await service.save('m1', 's1', input, { id: 'g1', data: { status: 'COMPLETED' }, products, productOperations });
    expect(prisma.paymentLink.create.mock.calls[0][0].data.subscriptionOptions).toEqual({ create: [{ cadence: 'MONTHLY', discountPercent: 10 }] });
    expect(prisma.productSubscriptionOption.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { discountPercent: 10 }, create: { paymentLinkId: 'p1', cadence: 'MONTHLY', discountPercent: 10 } }));
    expect(prisma.productSubscriptionOption.deleteMany).toHaveBeenCalledWith({ where: { paymentLinkId: 'p1', cadence: 'WEEKLY' } });
    expect(prisma.storeSourceVersion.create).toHaveBeenCalledTimes(1);
    prisma.productSubscriptionOption.upsert.mockRejectedValueOnce(new Error('cadence write failed'));
    await expect(service.save('m1', 's1', input, { id: 'g2', data: {}, productOperations })).rejects.toThrow('cadence write failed');
    expect(prisma.storeSourceVersion.create).toHaveBeenCalledTimes(1);
  });
});
