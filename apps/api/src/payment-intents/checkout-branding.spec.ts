import { sourceCheckoutBranding, normalizeCheckoutBranding } from '@pagosya/shared-types';
import { PaymentIntentsService } from './payment-intents.service';

describe('checkout store identity', () => {
  it('reads the storefront palette and fonts, including local font files', () => {
    const brand = sourceCheckoutBranding({name:'TOLEDO'}, {files:[
      {path:'checkout.html',content:'<link href="site.css" rel="stylesheet">'},
      {path:'site.css',content:'@font-face{font-family:Fraunces;src:url(/assets/fraunces.ttf);font-weight:100 900}:root{--cream:#f3eddf;--paper:#fffdf7;--ink:#173326;--green:#08783f;--sans:Instrument,system-ui,sans-serif;--serif:Fraunces,serif}body{background:var(--cream);color:var(--ink);font-family:var(--sans)}h1,h2{font-family:var(--serif)}'},
      {path:'assets/fraunces.ttf',encoding:'base64',content:'AAEAAA=='},
    ]});
    expect(brand).toMatchObject({name:'TOLEDO',background:'#f3eddf',surface:'#fffdf7',foreground:'#173326',accent:'#08783f',bodyFont:'Instrument,system-ui,sans-serif',headingFont:'Fraunces,serif'});
    expect(brand.fonts[0]).toMatchObject({family:'Fraunces',source:'data:font/ttf;base64,AAEAAA=='});
  });
  it('keeps dark themes readable and rejects active content and remote fonts', () => {
    const brand=normalizeCheckoutBranding({background:'#111111',foreground:'#222222',surface:'#ffffff',accent:'#ffbbdd',accentForeground:'#ffffff',logoUrl:'javascript:alert(1)',bodyFont:'x; background:url(https://evil)',fonts:[{family:'x',source:'https://evil/font'}]},'Noche');
    expect(brand.foreground).toBe('#ffffff');expect(brand.surface).toBe('#111111');expect(brand.accentForeground).toBe('#171717');
    expect(brand.logoUrl).toBeNull();expect(brand.bodyFont).toBe('system-ui, sans-serif');expect(brand.fonts).toEqual([]);
  });
  it('resolves only the intent merchant and the published revision, ignoring metadata and newer drafts', async () => {
    const prisma={store:{findUnique:jest.fn().mockResolvedValue({id:'store-owned',name:'Published shop',publishedSourceRevision:3})},storeSourceVersion:{findUnique:jest.fn().mockResolvedValue({snapshot:{files:[{path:'site.css',content:'body{background:#123123;color:#ffffff}'}]}})}};
    const service=Object.create(PaymentIntentsService.prototype);service.prisma=prisma;
    const brand=await service.checkoutBranding({merchantId:'owner',metadata:{storeId:'another-store',revision:99}});
    expect(prisma.store.findUnique.mock.calls[0][0].where).toEqual({merchantId:'owner'});
    expect(prisma.storeSourceVersion.findUnique.mock.calls[0][0].where).toEqual({storeId_revision:{storeId:'store-owned',revision:3}});
    expect(brand).toMatchObject({name:'Published shop',background:'#123123'});
  });
  it('never reads a draft for an unpublished store, and leaves merchants without a store unchanged', async () => {
    const prisma={store:{findUnique:jest.fn().mockResolvedValueOnce({id:'s',name:'Tienda',publishedSourceRevision:null}).mockResolvedValueOnce(null)},storeSourceVersion:{findUnique:jest.fn()}};
    const service=Object.create(PaymentIntentsService.prototype);service.prisma=prisma;
    expect((await service.checkoutBranding({merchantId:'owner'})).name).toBe('Tienda');
    expect(await service.checkoutBranding({merchantId:'no-store'})).toBeNull();expect(prisma.storeSourceVersion.findUnique).not.toHaveBeenCalled();
  });
});
