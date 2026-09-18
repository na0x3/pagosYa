import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const commerce=readFileSync(new URL('../../api/src/stores/source-kit/commerce.js',import.meta.url),'utf8');
const store={storeName:'Prueba',checkoutMode:'payment',contactFormEnabled:true,items:[{id:'p1',name:'Café',amount:10000,currency:'BOB',stock:4}],categories:[],locations:[]};
const snapshot={schemaVersion:1,brief:{businessType:'Café',audience:'Vecinos',primaryAction:'Comprar',visualDirection:'Editorial'},files:[
  {path:'index.html',content:'<meta charset="utf-8"><main><h1>Mi tienda</h1><a href="checkout.html">Checkout</a><section data-pagosya-catalog></section><button type="button" data-cart-open>Pedido <span data-cart-count>0</span></button><section data-pagosya-cart hidden></section><p data-pagosya-status></p></main><script src="config.js"></script><script src="commerce.js"></script>'},
  {path:'checkout.html',content:'<header><nav aria-label="Tienda"><a href="index.html">Catálogo</a></nav></header><main><h1>Tu pedido, a tu ritmo</h1><section data-pagosya-cart data-checkout-review="review"></section></main><script src="config.js"></script><script src="commerce.js"></script>'},
  {path:'config.js',content:'window.PAGOSYA_CONFIG = '+JSON.stringify({slug:'test',checkoutPage:'checkout.html',data:store})+';'},
  {path:'commerce.js',content:commerce}
]};
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
    else if(p.endsWith('/design-jobs'))body={enabled:false,job:null};
    else throw new Error(p);
    await route.fulfill({json:body});
  });
  await page.goto('/?source=1');
  await expect(page.getByText('Diseño sin publicar',{exact:true})).toBeVisible();
  const publish=page.getByRole('button',{name:'Publicar este diseño',exact:true});await expect(publish).toBeEnabled();
  await expect(page.locator('.canvas-toolbar #source-publish')).toBeVisible();
  const preview = page.locator('iframe[title="Vista previa del sitio"]');
  if (width > 900) {
    expect((await preview.boundingBox())!.height).toBeGreaterThan(560);
    expect((await page.locator('.agent-stream').boundingBox())!.height).toBeGreaterThan(420);
    expect((await page.locator('.source-generation-controls').boundingBox())!.height).toBeLessThan(60);
  }
  const before = await preview.boundingBox();
  await page.getByText('Publicación y pruebas',{exact:true}).click();
  expect((await preview.boundingBox())!.height).toBe(before!.height);
  await page.locator('.source-publication-details > summary').press('Escape');
  await expect(page.locator('.source-publication-details')).not.toHaveAttribute('open');
  await expect(page.locator('.source-publication-details > summary')).toBeFocused();
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
  await expect(page.locator('.source-publication > strong')).toContainText('Publicado');
  await page.getByText('Publicación y pruebas',{exact:true}).click();
  await page.getByText('Comparar dos diseños',{exact:true}).click();
  await page.getByRole('button',{name:'Crear alternativa con YAPI'}).click();
  await expect(page.locator('#source-revision')).toHaveCount(0);
  await expect(page.getByText(/Los clientes siguen viendo el diseño publicado/)).toBeVisible();
  await page.getByRole('button',{name:'Probar estos cambios contra el publicado'}).click();
  await expect(page.getByText('Prueba activa · comparando dos diseños',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Aplicar ganador',exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Publicar estos cambios'})).toBeDisabled();
  await expect(page.frameLocator('iframe[title="Vista previa del sitio"]').getByRole('heading',{name:'Beneficios claros',exact:true})).toBeVisible();
  await page.screenshot({path:`.test-artifacts/source-publication-${width}.png`,fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Detener y conservar A'}).click();
  await expect(page.locator('.source-publication > strong')).toContainText('Publicado');
  await page.reload();
  await expect(page.locator('.source-publication > strong')).toContainText('Publicado');
  await page.getByText('Publicación y pruebas',{exact:true}).click();
  await expect(page.getByText(/Los clientes siguen viendo el diseño publicado/)).toBeVisible();
  const toggle=page.getByRole('switch',{name:'Tienda publicada'});
  await expect(toggle).toBeChecked();await toggle.click();await expect(toggle).not.toBeChecked();
  await page.reload();await expect(toggle).not.toBeChecked();
  await toggle.click();await expect(toggle).toBeChecked();
  await page.getByText('Publicación y pruebas',{exact:true}).click();
  const form=page.getByRole('checkbox',{name:'Formulario de contacto'});
  await expect(form).not.toBeChecked();await form.check();await expect(form).toBeChecked();
  await page.reload();await page.getByText('Publicación y pruebas',{exact:true}).click();await expect(form).toBeChecked();
  await form.uncheck();await expect(form).not.toBeChecked();
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
  await frame.getByLabel('Nombre',{exact:true}).fill('Cliente');await frame.getByLabel('Correo',{exact:true}).fill('cliente@example.com');await frame.getByLabel('Tu mensaje').fill('Consulta real');await frame.getByRole('button',{name:'Enviar consulta'}).click();
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
