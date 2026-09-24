import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { kitPath } from '@pagosya/storefront-kit';
const commerce=readFileSync(kitPath('commerce.js'),'utf8');
const store={storeName:'Prueba',checkoutMode:'payment',contactFormEnabled:true,items:[{id:'p1',name:'Café',amount:10000,currency:'BOB',stock:4}],categories:[],locations:[]};
const snapshot={schemaVersion:1,brief:{businessType:'Café',audience:'Vecinos',primaryAction:'Comprar',visualDirection:'Editorial'},files:[
  {path:'index.html',content:'<meta charset="utf-8"><main><h1>Mi tienda</h1><a href="checkout.html">Checkout</a><section data-pagosya-catalog></section><button type="button" data-cart-open>Pedido <span data-cart-count>0</span></button><section data-pagosya-cart hidden></section><p data-pagosya-status></p></main><script src="config.js"></script><script src="commerce.js"></script>'},
  {path:'checkout.html',content:'<header><nav aria-label="Tienda"><a href="index.html">Catálogo</a></nav></header><main><h1>Tu pedido, a tu ritmo</h1><section data-pagosya-cart data-checkout-review="review"></section></main><script src="config.js"></script><script src="commerce.js"></script>'},
  {path:'config.js',content:'window.PAGOSYA_CONFIG = '+JSON.stringify({slug:'test',checkoutPage:'checkout.html',data:store})+';'},
  {path:'commerce.js',content:commerce}
]};
test('the design panels stay mounted beside the preview',async({page})=>{
  // They were unmounted once by a canvas cleanup; a merchant lost publishing,
  // the two-design test, the asset library and design improvements in one edit.
  await page.addInitScript(()=>sessionStorage.setItem('pagosya_merchant_session','test-session'));
  const version={revision:1,label:'Original',snapshot:structuredClone(snapshot)};
  await page.route('**/api/v1/**',async route=>{
    const p=new URL(route.request().url()).pathname;
    let body:any={};
    if(p.endsWith('/stores'))body=[{id:'s1',name:'Prueba',slug:'test'}];
    else if(p.endsWith('/conversation'))body={messages:[]};
    else if(p.endsWith('/catalog'))body=structuredClone(store);
    else if(p.endsWith('/versions/1'))body=version;
    else if(p.endsWith('/design-jobs'))body={enabled:true,job:null};
    else if(p.endsWith('/source-project'))body={revision:1,versions:[version],nextBefore:null,publication:{revision:1,version:0,active:true,slug:'test',publishedAt:'2026-09-20',experiment:null,contactFormEnabled:false}};
    await route.fulfill({json:body});
  });
  await page.goto('/?source=1');
  // The strip that used to carry these three is gone: publication hangs off the
  // toolbar switch it duplicated, the two design tools sit with the composer.
  await expect(page.locator('.source-revision-bar')).toHaveCount(0);
  const publication=page.locator('.canvas-toolbar .source-publication-details > summary');
  await expect(publication).toBeVisible();
  await expect(publication).toHaveAttribute('aria-label','Publicación y pruebas');
  await expect(page.locator('.source-canvas-tools').getByRole('button',{name:'Recursos visuales'})).toBeVisible();
  await expect(page.locator('.source-canvas-tools').getByRole('button',{name:'Mejorar diseño'})).toBeVisible();
  await publication.click();
  await expect(page.getByRole('checkbox',{name:'Formulario de contacto'})).toBeVisible();
  await expect(page.getByText('Comparar dos diseños',{exact:true})).toBeVisible();
});

for (const width of [1280,390]) test(`publishing distinguishes drafts and controls a two-version test at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const versions=[{revision:1,label:'Original',snapshot:structuredClone(snapshot)}];
  let publication:any={revision:null,version:0,active:true,slug:'test',publishedAt:null,experiment:null,contactFormEnabled:false};
  await page.addInitScript(()=>sessionStorage.setItem('pagosya_merchant_session','test-session'));
  await page.route('**/api/v1/**',async route=>{
    const p=new URL(route.request().url()).pathname;
    let body:any;
    if(p.endsWith('/stores'))body=[{id:'s1',name:'Prueba',slug:'test'}];
    else if(p.endsWith('/catalog'))body=store;
    else if(p.endsWith('/conversation'))body={messages:[]};
    else if(p.endsWith('/estimate'))body={model:'gpt-5.6-terra',maxCredits:50,estimate:{minCredits:4,maxCredits:16},reason:'Diseño'};
    else if(p.endsWith('/source-project'))body={revision:versions[0].revision,versions,publication,nextBefore:null};
    else if(/\/versions\/\d+$/.test(p))body=versions.find(v=>v.revision===Number(p.split('/').at(-1)));
    else if(p.endsWith('/publish')){expect(route.request().postDataJSON()).toEqual({revision:1,publicationVersion:0});publication={...publication,revision:1,version:1,publishedAt:new Date().toISOString()};body=publication;}
    else if(p.endsWith('/visibility')) { const input=route.request().postDataJSON();expect(input.publicationVersion).toBe(publication.version);publication={...publication,active:input.published,version:publication.version+1};body=publication; }
    else if(p.endsWith('/contact-form')) { const input=route.request().postDataJSON();expect(input.revision).toBe(versions[0].revision);const v=structuredClone(versions[0]);v.revision++;versions.unshift(v);publication={...publication,contactFormEnabled:input.enabled};body=v; }
    else if(p.endsWith('/alternative')){const v=structuredClone(versions[0]);v.revision=2;v.label='Beneficios claros';v.snapshot.files[0].content=v.snapshot.files[0].content.replace('Mi tienda','Beneficios claros');versions.unshift(v);body=v;}
    else if(p.endsWith('/experiments')){expect(route.request().postDataJSON()).toEqual({revision:2,publicationVersion:1});publication={...publication,version:2,experiment:{id:'e1',controlRevision:1,variantRevision:2,status:'RUNNING',startedAt:new Date().toISOString(),evidence:{winner:null,reason:'Recopilando datos'},variants:['A','B'].map((variant,i)=>({variant,revision:i+1,visitors:0,buyers:0,conversionRate:0,revenue:[]}))}};body=publication;}
    else if(p.endsWith('/experiments/finish')){expect(route.request().postDataJSON()).toEqual({experimentId:'e1',publicationVersion:2,apply:false});publication={...publication,version:3,experiment:{...publication.experiment,status:'STOPPED'}};body=publication;}
    else if(p.endsWith('/checks'))body={id:'check'};
    else if(p.endsWith('/design-jobs'))body={enabled:false,job:null};
    else throw new Error(p);
    await route.fulfill({json:body});
  });
  await page.goto('/?source=1');
  const publish=page.getByRole('button',{name:'Publicar este diseño',exact:true});await expect(publish).toBeEnabled();
  await expect(page.locator('.canvas-toolbar #source-publish')).toBeVisible();
  const preview = page.locator('iframe[title="Vista previa del sitio"]');
  if (width > 900) {
    expect((await preview.boundingBox())!.height).toBeGreaterThan(560);
    expect((await page.locator('.agent-stream').boundingBox())!.height).toBeGreaterThan(420);
    expect((await page.locator('.source-generation-controls').boundingBox())!.height).toBeLessThan(60);
  }
  await page.screenshot({path:`.test-artifacts/source-layout-${width}.png`,fullPage:true});
  // The readiness steps sit at the top of the chat stream; phones show the stream only after opening the conversation.
  if (width <= 900) await page.getByRole('button',{name:'Ver conversación',exact:true}).click();
  await page.locator('[data-agent-stream]').evaluate(el => el.scrollTo({ top: 0 }));
  await page.locator('.store-readiness > summary').click();
  await expect(page.locator('[data-readiness-step=payments]')).toContainText('Integración pendiente');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({path:`/tmp/pagosya-readiness-integrated-${width}.png`,fullPage:true});
  await page.locator('.store-readiness > summary').click();
  if (width <= 900) await page.getByRole('button',{name:'Ocultar conversación',exact:true}).click();
  await publish.click();
  await expect(page.getByRole('switch',{name:'Tienda publicada'})).toBeChecked();
  await page.screenshot({path:`.test-artifacts/source-publication-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const toggle=page.getByRole('switch',{name:'Tienda publicada'});
  await toggle.click();await expect(toggle).not.toBeChecked();
  await page.reload();await expect(toggle).not.toBeChecked();
  await toggle.click();await expect(toggle).toBeChecked();
});

test('published source navigates in isolation, submits real forms and hands checkout to the trusted parent',async({page})=>{
  let checkout:any,lead:any;const visits:string[]=[];
  await page.route('**/v1/stores/public/test/**',async route=>{
    const p=new URL(route.request().url()).pathname;
    if(p.endsWith('/source-site')){visits.push(new URL(route.request().url()).searchParams.get('visitorId')||'');return route.fulfill({json:{published:true,revision:2,visitToken:'v'.repeat(32),snapshot}});}
    if(p.endsWith('/funnel')) return route.fulfill({json:{token:'f'.repeat(32)}});
    if(p.endsWith('/leads')){lead=route.request().postDataJSON();return route.fulfill({json:{submitted:true}});}
    if(p.endsWith('/cart-checkout')){checkout=route.request().postDataJSON();return route.fulfill({json:{clientSecret:'test-checkout-secret'}});}
    if(p.endsWith('/retention')) return route.fulfill({json:{}});
    if(p.endsWith('/verification')) return route.fulfill({json:{storeName:'Test',slug:'test',verifiedBusiness:true,verifiedSince:'2026-08-02',electronicInvoicing:false,securePayments:true,onPlatformSince:'2026-07-01',reviews:{count:0,average:null},officialDomain:null}});
    throw new Error(p);
  });
  await page.addInitScript(() => localStorage.setItem('pagosya:privacy:test', JSON.stringify({version:1,analytics:true,expires:Date.now()+86400000})));
  await page.goto('/?demo=1');
  await page.addStyleTag({content:readFileSync(new URL('../../checkout/src/style.css',import.meta.url),'utf8')});
  const modulePath='/@fs'+new URL('../../checkout/src/source-storefront.ts',import.meta.url).pathname;
  await page.evaluate(async({modulePath,store})=>{
    const {mountPublishedSource}=await import(modulePath);
    document.body.replaceChildren();const app=document.createElement('main');app.id='app';document.body.append(app);
    await mountPublishedSource(app,'test',store,async(secret:string)=>{(window as any).paidSecret=secret;app.textContent='Trusted payment form';});
  },{modulePath,store});
  for (const width of [1440,390]) {
    await page.setViewportSize({width,height:812});
    expect(await page.locator('iframe').boundingBox()).toEqual({x:0,y:0,width,height:812});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  }
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'null', data: { type:'pagosya:hosted-request', id:1000, action:'checkout', body:{items:[]} } })));
  const frame=page.frameLocator('iframe');await expect(frame.getByRole('heading',{name:'Mi tienda'})).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute('sandbox','allow-scripts allow-forms');
  await frame.getByRole('button',{name:'Abrir formulario de contacto'}).click();
  await expect(frame.getByLabel('Correo',{exact:true})).toHaveCount(0);await frame.getByRole('button',{name:'Enviar consulta'}).click();
  const secure=page.getByRole('dialog',{name:/Escribe a/});await secure.getByLabel('Nombre',{exact:true}).fill('Cliente');await secure.getByLabel('Correo',{exact:true}).fill('cliente@example.com');await secure.getByLabel('Tu mensaje').fill('Consulta real');await secure.getByRole('button',{name:'Enviar consulta'}).click();
  await expect(frame.locator('[data-contact-status]')).toContainText('Consulta recibida');expect(lead).toMatchObject({name:'Cliente',message:'Consulta real'});
  // The floating contact panel stays open after sending; close it before shopping.
  await frame.getByRole('button',{name:'Cerrar formulario de contacto'}).click();
  await frame.getByRole('button',{name:'Añadir Café',exact:true}).click();await frame.getByRole('button',{name:/^Pedido/}).click();await frame.getByRole('button',{name:'Continuar con mi pedido',exact:true}).click();
  await expect(frame.getByRole('heading',{name:'Tu pedido, a tu ritmo',exact:true})).toBeVisible();
  await expect(frame.getByRole('navigation',{name:'Tienda'})).toBeVisible();
  await expect(frame.getByRole('heading',{name:'Revisa tu pedido',exact:true})).toHaveCount(0);
  await frame.getByRole('button',{name:'Pagar con pagosYa',exact:true}).click();
  await expect(page.getByText('Trusted payment form',{exact:true})).toBeVisible();
  await expect(page.locator('body')).not.toHaveClass(/source-store-page/);
  expect(await page.evaluate(()=>getComputedStyle(document.body).padding)).toBe('20px');
  expect(checkout).toMatchObject({sourceVisitToken:'v'.repeat(32),items:[{paymentLinkId:'p1',quantity:1}]});
  expect(visits[0]).toMatch(/^[a-f0-9-]{36}$/);
  expect(await page.evaluate(()=>(window as any).paidSecret)).toBe('test-checkout-secret');
});
