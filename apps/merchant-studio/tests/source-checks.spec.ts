import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
const commerce = readFileSync(new URL('../../api/src/stores/source-kit/privacy.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8') + '\n' + readFileSync(new URL('../../api/src/stores/source-kit/motion.js', import.meta.url), 'utf8');
const snapshot = { schemaVersion: 1, brief: {}, files: [
  { path: 'index.html', content: '<meta charset="utf-8"><main><h1>Tienda de prueba</h1><a href="#catalogo">Catálogo</a><section id="catalogo" data-pagosya-catalog></section><button type="button" data-cart-open>Pedido <span data-cart-count>0</span></button><section data-pagosya-cart hidden></section><p data-pagosya-status></p></main><script src="config.js"></script><script src="commerce.js"></script>' },
  { path: 'config.js', content: 'window.PAGOSYA_CONFIG = '+JSON.stringify({ slug:'test', data:{ storeName:'Prueba', contactFormEnabled:true, items:[{id:'p1',name:'Café',amount:1200,currency:'BOB',stock:4}],categories:[] } })+';' },
  { path: 'commerce.js', content: commerce },
] };
const productTemplate = '<template data-pagosya-product-template><article class="custom-row"><div><a class="menu-item__details" data-product-link><h3 data-product-field="name"></h3></a><p data-product-field="description"></p></div><strong data-product-field="price"></strong><button data-product-add>Comprar</button></article></template>';

test('checks detect colliding headline lines and allow multiple opening controls', async ({ page }) => {
  await page.goto('/');
  const fixture = structuredClone(snapshot);
  fixture.files[0].content = fixture.files[0].content.replace('<h1>Tienda de prueba</h1>', '<h1 style="font-size:64px;line-height:.65">La próxima<br/><em>jugada</em> se viste.</h1><button style="background:black;color:white">Pausar movimiento</button><a href="#catalogo" style="background:black;color:white">Ver colección</a>');
  const check = () => page.evaluate(async value => { const { checkSourceWebsite } = await import('/src/source-checks.ts'); return checkSourceWebsite(value as any); }, fixture);
  const before = await check();
  expect(before.some(row => row.label.includes('Líneas de título superpuestas'))).toBe(true);
  expect(before.some(row => row.label.includes('Jerarquía de acciones'))).toBe(false);
  fixture.files[0].content = fixture.files[0].content.replace('line-height:.65', 'line-height:1.15');
  expect((await check()).some(row => row.label.includes('Líneas de título superpuestas'))).toBe(false);
});

for (const scenario of [
  { name: 'artwork overflowing its grid track', label: 'Ilustración sobre el producto', status: 'warning',
    template: productTemplate.replace('<article class="custom-row">', '<article class="custom-row"><div class="art" aria-hidden="true"><span></span></div>'),
    css: '.custom-row{display:grid;grid-template-columns:100px minmax(0,1fr);width:280px}.custom-row>.art{grid-column:1;grid-row:1;min-width:0}.art span{display:block;width:180px;height:60px;background:brown}.custom-row>div:not(.art){grid-column:2;grid-row:1}',
    repair: '.art span{width:70px}' },
  { name: 'a purchase control clipped by a hidden container', label: 'Controles de compra completos', status: 'failed', template: productTemplate,
    css: '.custom-row{position:relative;width:280px;height:180px;overflow:hidden}.custom-row button{position:absolute;left:250px;top:100px;width:80px;height:44px}',
    repair: '.custom-row button{position:static;width:auto}' },
  { name: 'a featured price displaced to the wrong row and column', label: 'Precio separado del producto', status: 'warning', template: productTemplate,
    css: '@media(min-width:800px){.custom-row{display:grid;grid-template-columns:200px 1fr;width:700px}.custom-row>div{grid-column:2;grid-row:1}.custom-row strong{grid-column:1;grid-row:2;justify-self:start;margin-top:240px}}',
    repair: '@media(min-width:800px){.custom-row strong{grid-column:2;margin-top:16px}}' },
]) test(`rendered checks identify ${scenario.name} and clear after a layout repair`, async ({ page }) => {
  await page.goto('/');
  const fixture = structuredClone(snapshot);
  fixture.files[0].content = `<style>${scenario.css}</style>` + scenario.template + fixture.files[0].content;
  const check = () => page.evaluate(async snapshot => { const { checkSourceWebsite } = await import('/src/source-checks.ts'); return checkSourceWebsite(snapshot as any); }, fixture);
  const before = await check();
  expect(before.some(row => row.label.includes(scenario.label) && row.status === scenario.status)).toBe(true);
  if (scenario.status === 'failed') expect(before.filter(row => row.label.includes('Ancho de la página')).every(row => row.status === 'passed')).toBe(true);
  fixture.files[0].content += `<style>${scenario.repair}</style>`;
  expect((await check()).filter(row => row.label.includes(scenario.label) && row.status === scenario.status)).toEqual([]);
});

test('design checks catch a disguised hero and collapsed mobile order access, then clear after repair', async ({ page }) => {
  await page.goto('/');
  const fixture = structuredClone(snapshot);
  fixture.files.push({ path: 'design-direction.json', content: JSON.stringify({ selected: 0, concepts: [{ layout: { sections: ['catalogo'], catalogSection: 'catalogo', standaloneIntro: false, productsInOpening: true } }] }) });
  fixture.files[0].content = '<style>.intro{height:1100px}@media(max-width:650px){header nav{display:none}}</style><header><nav><button data-cart-open>Mi pedido <span data-cart-count>0</span></button></nav></header><main><section id="catalogo"><div class="intro">Una portada disfrazada</div><div data-pagosya-catalog></div></section></main><section data-pagosya-cart hidden></section><p data-pagosya-status></p><script src="config.js"></script><script src="commerce.js"></script>';
  const check = (value: typeof snapshot) => page.evaluate(async snapshot => { const { checkSourceWebsite } = await import('/src/source-checks.ts'); return checkSourceWebsite(snapshot as any); }, value);
  const findings = await check(fixture);
  expect(findings.filter(row => row.label.includes('Productos en la primera pantalla') && row.status === 'warning')).toHaveLength(4);
  expect(findings.filter(row => row.label.includes('Pedido visible en móvil') && row.status === 'warning')).toHaveLength(2);
  fixture.files[0].content = fixture.files[0].content.replace('.intro{height:1100px}', '.intro{height:0;overflow:hidden}').replace('header nav{display:none}', 'header nav{display:block}');
  expect((await check(fixture)).filter(row => row.status === 'warning')).toEqual([]);
});

test('empty status surfaces consume no space but messages remain visible', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async snapshot => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    snapshot.files[0].content = '<style>[data-pagosya-status]{position:fixed;bottom:10px;background:black;color:white;padding:20px;min-width:40px;min-height:20px}</style>' + snapshot.files[0].content;
    const frame = document.createElement('iframe'); frame.title = 'Status'; frame.sandbox.add('allow-scripts'); frame.srcdoc = sourcePreviewDocument(snapshot as any); document.body.append(frame);
  }, structuredClone(snapshot));
  const frame = page.frameLocator('iframe[title="Status"]');
  await expect(frame.locator('[data-pagosya-status]')).toHaveCSS('width', '0px');
  await frame.locator('[data-add]').first().click();
  await expect(frame.locator('[data-pagosya-status]')).not.toBeEmpty();
  await expect(frame.locator('[data-pagosya-status]')).toBeVisible();
});

test('every custom product link targets its own product and empty media links disappear', async ({ page }) => {
  await page.goto('/');
  const custom = structuredClone(snapshot);
  custom.files[1].content = custom.files[1].content.replace('"slug":"test"', '"slug":"test","productPage":"product.html"');
  custom.files[0].content = '<template data-pagosya-product-template><article><a data-product-link class="photo" href="product.html"><img data-product-field="image"></a><h3 data-product-field="name"></h3><strong data-product-field="price"></strong><a data-product-link class="details" href="product.html">Ver detalle</a><button data-product-add>Comprar</button></article></template>' + custom.files[0].content;
  await page.evaluate(async snapshot => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    const frame = document.createElement('iframe'); frame.title = 'Links'; frame.sandbox.add('allow-scripts'); frame.srcdoc = sourcePreviewDocument(snapshot as any); document.body.append(frame);
  }, custom);
  const frame = page.frameLocator('iframe[title="Links"]');
  await expect(frame.locator('.menu-item .photo')).toBeHidden();
  await expect(frame.locator('.menu-item .details')).toHaveAttribute('href', 'product.html?id=p1');
  await expect(frame.locator('.menu-item .details')).toHaveAttribute('aria-label', 'Ver detalle de Café');
});

test('authored href normalization cannot strip the product ID when opening a detail page', async ({ page }) => {
  await page.goto('/');
  const custom = structuredClone(snapshot);
  custom.files[1].content = custom.files[1].content.replace('"slug":"test"', '"slug":"test","productPage":"product.html"');
  custom.files[0].content = productTemplate + custom.files[0].content + '<script>document.querySelectorAll("[data-product-link]").forEach(link => link.href = "product.html")</script>';
  custom.files.push({ path: 'product.html', content: '<h1>Detail</h1>' });
  await page.evaluate(async snapshot => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    window.addEventListener('message', event => { if (event.data?.type === 'pagosya:source-navigate') document.body.dataset.destination = event.data.page + event.data.query; });
    const frame = document.createElement('iframe'); frame.title = 'Bound links'; frame.sandbox.add('allow-scripts'); frame.srcdoc = sourcePreviewDocument(snapshot as any); document.body.append(frame);
  }, custom);
  const link = page.frameLocator('iframe[title="Bound links"]').locator('.menu-item a[data-product-link]');
  await expect(link).toHaveAttribute('href', 'product.html');
  await link.click();
  await expect(page.locator('body')).toHaveAttribute('data-destination', 'product.html?id=p1');
});

test('custom product compositions bind real catalog fields, keep stock controls and complete checkout', async ({ page }) => {
  await page.goto('/');
  const custom = structuredClone(snapshot);
  custom.files[0].content = '<style>.custom-row{display:grid;grid-template-columns:1fr auto auto;gap:16px}h3{margin:0}</style><nav style="display:flex" data-pagosya-categories></nav>' + productTemplate + custom.files[0].content;
  custom.files[1].content = 'window.PAGOSYA_CONFIG = ' + JSON.stringify({ slug: 'test', data: { storeName: 'Prueba', categories: [], items: [
    { id: 'p1', name: 'Café <b>real</b>', description: 'Café <b>real</b>', amount: 1200, currency: 'BOB', stock: 4 },
    { id: 'p2', name: 'Agotado', amount: 2500, currency: 'BOB', stock: 0 },
    { id: 'p3', name: 'Con opciones sin stock', amount: 3000, currency: 'BOB', stock: 0, variants: [{ id: 'large', name: 'Grande', amount: 4000 }] },
  ] } }) + ';';
  await page.evaluate(async snapshot => {
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    const frame = document.createElement('iframe'); frame.title = 'Custom catalog'; frame.sandbox.add('allow-scripts'); frame.srcdoc = sourcePreviewDocument(snapshot as any); document.body.append(frame);
  }, custom);
  const frame = page.frameLocator('iframe[title="Custom catalog"]');
  await expect(frame.locator('.custom-row')).toHaveCount(3);
  await expect(frame.locator('.custom-row').first()).toHaveCSS('display', 'grid');
  await expect(frame.locator('.custom-row .menu-item__details').first()).toHaveCSS('position', 'static');
  await expect(frame.locator('[data-product-field=name]').first()).toHaveText('Café <b>real</b>');
  await expect(frame.locator('[data-product-field=name] b')).toHaveCount(0);
  await expect(frame.locator('[data-product-field=price]').first()).toContainText('12');
  await expect(frame.locator('[data-product-field=description]').first()).toBeHidden();
  await expect(frame.locator('[data-pagosya-categories]')).toBeHidden();
  await expect(frame.locator('[data-add=p2]')).toBeDisabled();
  await expect(frame.locator('[data-add=p3]')).toBeDisabled();
  await frame.locator('[data-product-link]').first().click();
  await expect(frame.getByRole('dialog', { name: 'Café <b>real</b>', exact: true })).toBeVisible();
  const checks = await page.evaluate(async snapshot => { const { checkSourceWebsite } = await import('/src/source-checks.ts'); return checkSourceWebsite(snapshot as any); }, custom);
  expect(checks.filter(row => row.status === 'failed' || row.status === 'warning')).toEqual([]);
  expect(checks.filter(row => row.label.includes('Apertura del formulario')).map(row => row.status)).toEqual(['passed', 'passed', 'passed', 'passed']);
});

test('rendered design diagnostics expose empty sections, missed catalog layouts and invalid templates as advisory findings', async ({ page }) => {
  await page.goto('/');
  const brokenDesign = structuredClone(snapshot);
  brokenDesign.files[0].content = '<style>.catalog-grid{display:grid;grid-template-columns:repeat(3,1fr)}</style><section><h2>Contacto</h2></section><section hidden><h2>Oculto</h2></section><template data-pagosya-product-template><article>Missing data slots</article></template>' + brokenDesign.files[0].content;
  const checks = await page.evaluate(async snapshot => { const { checkSourceWebsite } = await import('/src/source-checks.ts'); return checkSourceWebsite(snapshot as any); }, brokenDesign);
  expect(checks.filter(row => row.status === 'failed')).toEqual([]);
  const warnings = checks.filter(row => row.status === 'warning');
  expect(warnings.filter(row => row.label.includes('Secciones sin contenido'))).toHaveLength(4);
  expect(warnings.filter(row => row.label.includes('Distribución del catálogo'))).toHaveLength(4);
  expect(warnings.filter(row => row.label.includes('Composición de productos'))).toHaveLength(4);
  expect(warnings.some(row => row.detail?.includes('Oculto'))).toBe(false);
  const fixed = structuredClone(snapshot);
  fixed.files[0].content = fixed.files[0].content.replace('<section data-pagosya-cart hidden></section>', '<dialog class="cart-drawer" data-pagosya-cart></dialog>');
  fixed.files[0].content = '<style>.catalog-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}@media(min-width:2000px){.products-grid{display:grid}}</style>' + productTemplate + fixed.files[0].content.replace('id="catalogo"', 'id="catalogo" class="catalog-grid"');
  const fixedChecks = await page.evaluate(async snapshot => { const { checkSourceWebsite } = await import('/src/source-checks.ts'); return checkSourceWebsite(snapshot as any); }, fixed);
  expect(fixedChecks.filter(row => row.status === 'warning' || row.status === 'failed')).toEqual([]);
});
test('the contact form is optional and keeps authored styling in preview and hosted pages', async ({page}) => {
  await page.goto('/?demo=1');
  await page.evaluate(async snapshot => {
    const {sourcePreviewDocument} = await import('/src/source-preview.ts');
    document.body.innerHTML='';
    for (const hosted of [false,true]) for (const enabled of [false,true]) {
      const copy=structuredClone(snapshot);
      copy.files[0].content='<style>[data-pagosya-contact] button{background:rgb(15, 80, 160);border-radius:0;font-family:serif}</style><section data-pagosya-contact></section>'+copy.files[0].content;
      copy.files[1].content='window.PAGOSYA_CONFIG = '+JSON.stringify({slug:'test',data:{storeName:'Prueba',contactFormEnabled:enabled,items:[],categories:[]}})+';';
      const frame=document.createElement('iframe');frame.title=`${hosted}-${enabled}`;frame.sandbox.add('allow-scripts');
      frame.srcdoc=sourcePreviewDocument(copy as any,'index.html',{hosted});document.body.append(frame);
    }
  },snapshot);
  for (const hosted of [false,true]) {
    const hidden=page.frameLocator(`iframe[title="${hosted}-false"]`);
    await expect(hidden.locator('[data-pagosya-contact]')).toBeHidden();
    await expect(hidden.getByRole('button',{name:'Enviar consulta'})).toHaveCount(0);
    // The form lives behind the floating Contacto launcher.
    const shown=page.frameLocator(`iframe[title="${hosted}-true"]`);
    await shown.getByRole('button',{name:'Abrir formulario de contacto'}).click();
    const button=shown.getByRole('button',{name:'Enviar consulta'});
    await expect(button).toHaveCSS('background-color','rgb(15, 80, 160)');
    await expect(button).toHaveCSS('border-radius','0px');
  }
});
test('automatic checks exercise desktop/mobile cart and payment without network or mutations to the visible preview', async ({ page }) => {
  await page.goto('/');
  const calls: string[] = []; page.on('request', request => { if (/cart-checkout|\/leads/.test(request.url())) calls.push(request.url()); });
  const checks = await page.evaluate(async snapshot => {
    const { checkSourceWebsite } = await import('/src/source-checks.ts');
    const input = document.createElement('input'); input.id = 'focus-check'; document.body.append(input); input.focus();
    return checkSourceWebsite(snapshot as any);
  }, snapshot);
  expect(checks.filter(row => row.status === 'failed')).toEqual([]);
  expect(checks.filter(row => row.label.includes('Apertura del formulario')).map(row => row.status)).toEqual(['passed','passed','passed','passed']);
  expect(checks.some(row => row.label.includes('Formulario en modo de prueba') && row.status === 'passed')).toBe(true);
  expect(calls).toEqual([]);
  await expect(page.locator('#focus-check')).toBeFocused();
  expect(await page.locator('iframe[title="Comprobación automática del sitio"]').count()).toBe(0);
});
test('narrow mobile overflow is caught even when the 390px layout fits', async ({ page }) => {
  await page.goto('/');
  const narrow = structuredClone(snapshot);
  narrow.files[0].content = '<style>body{margin:0;min-width:323px}</style>' + narrow.files[0].content;
  const checks = await page.evaluate(async snapshot => {
    const { checkSourceWebsite } = await import('/src/source-checks.ts');
    return checkSourceWebsite(snapshot as any);
  }, narrow);
  const widths = checks.filter(row => row.label.includes('Ancho de la página'));
  expect(widths.map(row => row.status)).toEqual(['passed', 'passed', 'passed', 'failed']);
  expect(widths[3].label).toContain('Móvil pequeño');
});
test('broken links and authored script exceptions are visible failures', async ({ page }) => {
  await page.goto('/');
  const broken = structuredClone(snapshot);
  broken.files[0].content += '<a href="missing.html">Enlace roto</a><script>throw new Error("Broken authored code")</script>';
  const checks = await page.evaluate(async snapshot => {
    const { checkSourceWebsite } = await import('/src/source-checks.ts'); return checkSourceWebsite(snapshot as any);
  }, broken);
  expect(checks.some(row => row.status === 'failed' && row.label === 'Enlaces y secciones internas')).toBe(true);
  expect(checks.some(row => row.status === 'failed' && row.label.includes('JavaScript'))).toBe(true);
});
test('exported contact form submits to the store inbox and partner code follows checkout', async ({ page }) => {
  const live = structuredClone(snapshot);
  live.files[1].content = 'window.PAGOSYA_CONFIG = '+JSON.stringify({ slug:'test', apiBaseUrl:'https://store.test/v1', checkoutOrigin:'https://store.test', data:{} })+';';
  const store = { storeName:'Prueba',contactFormEnabled:true,items:[{id:'p1',name:'Café',amount:1200,currency:'BOB',stock:4}],categories:[] };
  let lead: any, checkout: any;
  await page.route('https://store.test/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/leads')) { lead = route.request().postDataJSON(); return route.fulfill({ json:{submitted:true,leadId:'lead1'} }); }
    if (path.endsWith('/cart-checkout')) { checkout = route.request().postDataJSON(); return route.fulfill({ json:{clientSecret:'test_secret'} }); }
    if (path.endsWith('/store')) return route.fulfill({json:store});
    if (path === '/s/test') return route.fulfill({body:'<h1>Pago de prueba</h1>',contentType:'text/html'});
    const file = live.files.find(f=>'/'+f.path === path);
    return route.fulfill({body:file?.content || '',contentType:path.endsWith('.js')?'text/javascript':'text/html'});
  });
  await page.addInitScript(() => localStorage.setItem('pagosya:privacy:test', JSON.stringify({version:1,analytics:true,expires:Date.now()+86400000})));
  await page.goto('https://store.test/index.html?partner=partner_test_123');
  await page.getByRole('button',{name:'Abrir formulario de contacto'}).click();
  await page.getByLabel('Nombre',{exact:true}).fill('Cliente de prueba');
  await page.getByLabel('Correo',{exact:true}).fill('prueba@example.com');
  await page.getByLabel('Tu mensaje',{exact:true}).fill('Información de entregas');
  await page.getByRole('button',{name:'Enviar consulta'}).click();
  await expect(page.locator('[data-contact-status]')).toContainText('Consulta recibida');
  expect(lead).toMatchObject({items:[],name:'Cliente de prueba',email:'prueba@example.com',message:'Información de entregas'});
  await page.goto('https://store.test/index.html');
  await page.getByRole('button',{name:'Añadir Café',exact:true}).click();
  await page.getByRole('button',{name:/^Pedido/}).click();
  await page.getByRole('button',{name:'Continuar con mi pedido'}).click();
  await page.getByRole('button',{name:'Pagar con pagosYa'}).click();
  await expect(page).toHaveURL(/\/s\/test#client_secret/);
  expect(checkout).toMatchObject({partnerCode:'partner_test_123',items:[{paymentLinkId:'p1',quantity:1}]});
});
test('catalogs with options buy on the page, while extras still check the trusted handoff', async ({page}) => {
  await page.goto('/');
  const run = (snapshot: any) => page.evaluate(async snapshot => { const {checkSourceWebsite} = await import('/src/source-checks.ts'); return checkSourceWebsite(snapshot as any); }, snapshot);
  for (const template of ['', productTemplate]) {
    const options = structuredClone(snapshot); options.files[0].content = template + options.files[0].content;
    options.files[1].content = 'window.PAGOSYA_CONFIG = '+JSON.stringify({slug:'test',checkoutOrigin:'https://checkout.test',data:{storeName:'Prueba',items:[{id:'p1',name:'Café',amount:1200,currency:'BOB',stock:4,variants:[{id:'large',name:'Grande',amount:1500}]}]}})+';';
    const checks = await run(options);
    expect(checks.filter(row => row.status === 'failed')).toEqual([]);
    expect(checks.filter(row => row.label.includes('Opciones de producto disponibles')).map(row => row.status)).toEqual(['passed','passed','passed','passed']);
    expect(checks.filter(row => row.label.includes('Apertura de opciones'))).toEqual([]);
    expect(checks.filter(row => row.label.includes('Apertura del formulario')).map(row => row.status)).toEqual(['skipped','skipped','skipped','skipped']);
  }
  const extras = structuredClone(snapshot);
  extras.files[1].content = 'window.PAGOSYA_CONFIG = '+JSON.stringify({slug:'test',checkoutOrigin:'https://checkout.test',data:{storeName:'Prueba',items:[{id:'p1',name:'Café',amount:1200,currency:'BOB',stock:4,extras:[{id:'shot',name:'Carga extra',amount:300}]}]}})+';';
  const handoff = await run(extras);
  expect(handoff.filter(row => row.status === 'failed')).toEqual([]);
  expect(handoff.filter(row => row.label.includes('Apertura de opciones')).map(row => row.status)).toEqual(['passed','passed','passed','passed']);
  expect(handoff.filter(row => row.label.includes('Apertura del formulario')).map(row => row.status)).toEqual(['skipped','skipped','skipped','skipped']);
});
test('an empty catalog and a missing Pedido trigger cannot pass publishing checks', async ({page}) => {
  await page.goto('/');
  const missing = structuredClone(snapshot); missing.files[0].content = missing.files[0].content.replace('data-cart-open','data-broken').replace('data-cart-count','data-count-broken');
  const checks = await page.evaluate(async snapshot => { const {checkSourceWebsite}=await import('/src/source-checks.ts'); return checkSourceWebsite(snapshot as any); }, missing);
  expect(checks.some(row=>row.label.includes('Pedido abre')&&row.status==='failed')).toBe(true);
  const empty = structuredClone(snapshot); empty.files[1].content='window.PAGOSYA_CONFIG = {"data":{"items":[]}};';
  const emptyChecks=await page.evaluate(async snapshot=>{const {checkSourceWebsite}=await import('/src/source-checks.ts');return checkSourceWebsite(snapshot as any);},empty);
  expect(emptyChecks.filter(row=>row.status==='failed')).toEqual([]);
  expect(emptyChecks.filter(row=>row.label.includes('Compra de producto') || row.label.includes('Apertura del formulario'))).toEqual([]);
  expect(emptyChecks.filter(row=>row.blocking)).toEqual([expect.objectContaining({label:'Catálogo pendiente',status:'skipped'})]);
  expect(await page.evaluate(async rows=>{const {sourceChecksBlockPublishing}=await import('/src/source-checks.ts');return sourceChecksBlockPublishing(rows);},emptyChecks)).toBe(true);
});

test('overflow reports measured dimensions and carousel crop warnings clear with a contained image', async ({ page }) => {
  await page.goto('/');
  const copy = structuredClone(snapshot);
  const photo = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="1200"><rect width="600" height="1200" fill="red"/></svg>');
  copy.files[0].content += `<section aria-roledescription="carrusel"><img alt="Hamburguesa" src="${photo}" style="width:100%;height:100px;object-fit:cover"></section><div style="width:1400px">Texto desbordado</div>`;
  const check = (value: typeof snapshot) => page.evaluate(async snapshot => { const { checkSourceWebsite } = await import('/src/source-checks.ts'); return checkSourceWebsite(snapshot as any); }, value);
  const rows = await check(copy);
  expect(rows.find(row => row.label.includes('Ancho de la página') && row.status === 'failed')?.detail).toMatch(/1408 px.*1280 px/);
  expect(rows.filter(row => row.label.includes('Encuadre del carrusel'))).toHaveLength(4);
  copy.files[0].content = copy.files[0].content.replace('object-fit:cover', 'object-fit:contain').replace('width:1400px', 'max-width:100%');
  expect((await check(copy)).filter(row => row.status === 'failed' || row.label.includes('Encuadre del carrusel'))).toEqual([]);
});
