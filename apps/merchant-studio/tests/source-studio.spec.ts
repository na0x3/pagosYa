import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'../../../examples/independent-cafe');
const files: Array<{path:string;content:string;encoding:'utf8'|'base64'}> = [];
function scan(dir:string,prefix='') { for(const e of readdirSync(dir,{withFileTypes:true})) { if(e.name==='dist'||e.name.startsWith('.'))continue;const p=path.join(dir,e.name),name=prefix+e.name;if(e.isDirectory())scan(p,name+'/');else files.push({path:name,content:readFileSync(p).toString(/\.(webp|ttf)$/.test(name)?'base64':'utf8'),encoding:/\.(webp|ttf)$/.test(name)?'base64':'utf8'}); } }
scan(root);
files.find(file => file.path === 'commerce.js')!.content = readFileSync(new URL('../../api/src/stores/source-kit/commerce.js', import.meta.url), 'utf8');
const snapshotCatalog = JSON.parse(files.find(f => f.path === 'config.js')!.content.split('=').slice(1).join('=').trim().replace(/;$/, '')).data;
const snapshot={schemaVersion:1,brief:{businessType:'Cafetería',audience:'Vecinos',primaryAction:'Hacer un pedido',visualDirection:'Menú editorial'},files};

for (const clipped of [false, true]) test(`design findings prepare a repair message without making a paid request (clipped: ${clipped})`, async ({ page }) => {
  const copy = structuredClone(snapshot);
  copy.files.find(f => f.path === 'index.html')!.content += '<section><h2>Sección incompleta para revisar</h2></section>';
  if (clipped) copy.files.find(f => f.path === 'index.html')!.content += '<style>.menu-item [data-add]{position:relative!important;left:1000px!important;right:auto!important}</style>';
  const version = { revision: 1, label: 'Diseño por revisar', snapshot: copy };
  const paid: string[] = [];
  let submitted: any;
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: any = {};
    if (pathname.endsWith('/dashboard/login')) body = { token: 'test-session', user: { email: 'test@example.com' } };
    else if (pathname.endsWith('/stores')) body = [{ id: 's1', name: 'Café Aroma', slug: 'cafe-aroma' }];
    else if (pathname.endsWith('/conversation')) body = { messages: [] };
    else if (pathname.endsWith('/catalog')) body = structuredClone(snapshotCatalog);
    else if (pathname.endsWith('/estimate')) body = { model: 'gpt-5.6-terra', reason: 'Ajuste de diseño', maxCredits: 25, estimate: { minCredits: 4, maxCredits: 10 } };
    else if (pathname.endsWith('/versions/1')) body = version;
    else if (pathname.endsWith('/source-project')) body = { revision: 1, versions: [version], nextBefore: null };
    else if (/\/(messages|generate)$/.test(pathname)) {
      paid.push(pathname); submitted = route.request().postDataJSON();
      body = { userMessage: { id: 'repair-u', role: 'USER', content: submitted.instruction }, assistantMessage: { id: 'repair-a', role: 'ASSISTANT', content: 'Solicitud recibida.' } };
    }
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByLabel('Correo', { exact: true }).fill('test@example.com');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al Studio', exact: true }).click();
  await page.locator('[data-source-checks] summary').click();
  const prepare = page.getByRole('button', { name: clipped ? 'Preparar correcciones' : 'Preparar ajustes de diseño' });
  await expect(prepare).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('status', { name: 'Comprobación del navegador' })).toContainText(clipped ? 'necesita correcciones' : 'detalles visuales');
  await prepare.click();
  const composer = page.getByRole('textbox', { name: 'Indicación para YAPI' });
  await expect(composer).toHaveValue(clipped ? /Controles de compra completos/ : /Sección incompleta para revisar/);
  await expect(composer).toBeFocused();
  await expect(prepare).toBeDisabled();
  expect(paid).toEqual([]);
  await page.getByRole('button', { name: 'Enviar a YAPI', exact: true }).click();
  await expect.poll(() => submitted?.browserReview?.length || 0).toBeGreaterThan(0);
  expect(submitted.browserReview.join('\n')).toContain(clipped ? 'Controles de compra completos' : 'Sección incompleta para revisar');
});

test('empty catalog is one pending setup step in chat and keeps publishing blocked after rerender', async ({ page }) => {
  const copy = structuredClone(snapshot);
  copy.files.find(f => f.path === 'config.js')!.content = 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};';
  const version = { revision: 1, label: 'Borrador sin productos', snapshot: copy };
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: any = {};
    if (pathname.endsWith('/dashboard/login')) body = { token: 'test-session', user: { email: 'test@example.com' } };
    else if (pathname.endsWith('/stores')) body = [{ id: 's1', name: 'Café Aroma', slug: 'cafe-aroma' }];
    else if (pathname.endsWith('/conversation')) body = { messages: [] };
    else if (pathname.endsWith('/catalog')) body = { items: [] };
    else if (pathname.endsWith('/versions/1')) body = version;
    else if (pathname.endsWith('/source-project')) body = { revision: 1, versions: [version], nextBefore: null };
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByLabel('Correo', { exact: true }).fill('test@example.com');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al Studio', exact: true }).click();
  await expect(page.getByRole('status', { name: 'Comprobación del navegador' })).toContainText('Las imágenes del diseño no crean productos', { timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Publicar este diseño', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Ver móvil', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Publicar este diseño', exact: true })).toBeDisabled();
  await page.locator('[data-source-checks] summary').click();
  await expect(page.locator('[data-source-checks] [data-check-status="skipped"]')).toHaveCount(1);
  await expect(page.locator('[data-source-checks] [data-check-status="failed"]')).toHaveCount(0);
});

test('source studio generates, previews commerce, edits a file, restores and downloads',async({page})=>{
  const versions:any[]=[];let revision=0;let patch:any;let generated:any;const messages:any[]=[];
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/**',async route=>{
    const url=new URL(route.request().url());const pathname=url.pathname;const method=route.request().method();
    let body:any={};
    if (pathname.endsWith('/estimate')) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ model: 'gpt-5.6-terra', reason: 'Diseño y composición del sitio.', maxCredits: 50, estimate: { minCredits: 4, maxCredits: 16 } }) }); return; }
    if(pathname.endsWith('/dashboard/login')) body={token:'test-session',user:{email:'test@example.com'}};
    else if(pathname.endsWith('/stores'))body=[{id:'s1',name:'Café Aroma',slug:'cafe-aroma'}];
    else if(pathname.endsWith('/conversation'))body={messages};
    else if(pathname.endsWith('/messages')) {generated=route.request().postDataJSON();revision++;versions.unshift({revision,label:'Carta propia',snapshot:structuredClone(snapshot)});const userMessage={id:`u${revision}`,role:'USER',content:generated.instruction,metadata:{},createdAt:new Date().toISOString()};const assistantMessage={id:`a${revision}`,role:'ASSISTANT',content:'Preparé la carta. Dime qué ajustamos.',metadata:{sourceRevision:revision,label:'Carta propia'},createdAt:new Date().toISOString()};messages.push(userMessage,assistantMessage);body={userMessage,assistantMessage,revision:versions[0]};}
    else if(pathname.endsWith('/file')) {patch=route.request().postDataJSON();const copy=structuredClone(versions[0].snapshot);copy.files.find((f:any)=>f.path===patch.path).content=patch.content;revision++;versions.unshift({revision,label:'Edición',snapshot:copy});body=versions[0];}
    else if(pathname.endsWith('/restore')) {const target=Number(pathname.split('/').at(-2));revision++;versions.unshift({revision,label:'Restaurada',restoredFrom:target,snapshot:structuredClone(versions.find(v=>v.revision===target).snapshot)});body=versions[0];}
    else if(pathname.endsWith('/export')) {await route.fulfill({status:200,contentType:'application/zip',body:Buffer.from('PK-test-download')});return;}
    else if(/\/versions\/\d+$/.test(pathname))body=versions.find(v=>v.revision===Number(pathname.split('/').at(-1)));
    else if(pathname.endsWith('/catalog'))body=structuredClone(snapshotCatalog);
    else if(pathname.endsWith('/source-project'))body={revision,versions,nextBefore:null};
    else throw new Error(`Unexpected request ${method} ${pathname}`);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/?source=1');await page.getByLabel('Correo',{exact:true}).fill('test@example.com');await page.getByLabel('Contraseña').fill('test-password');await page.getByRole('button',{name:'Entrar al Studio',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Un sitio que se sienta tuyo.'})).toBeVisible();
  await page.getByRole('textbox',{name:'Indicación para YAPI'}).fill('Crea una cafetería con una carta clara y pedido visible');await page.getByRole('button',{name:'Enviar a YAPI'}).click();
  const frame=page.frameLocator('iframe[title="Vista previa del sitio"]');await expect(frame.getByRole('heading',{name:'Un buen día empieza aquí.'})).toBeVisible();
  expect(generated.motion).toBe('subtle');expect(generated.revision).toBe(0);expect(generated.instruction).toContain('cafetería');expect(generated).not.toHaveProperty('brief');
  await page.reload();await expect(page.getByText('Preparé la carta. Dime qué ajustamos.',{exact:true})).toBeVisible();
  await expect(page.locator('iframe[title="Vista previa del sitio"]')).toHaveAttribute('sandbox','allow-scripts');
  await frame.getByRole('button',{name:'Añadir Café americano',exact:true}).click();
  await expect(frame.locator('[data-cart-count]')).toHaveText('1');
  await frame.getByRole('link', { name: /^Pedido/ }).click();
  await frame.getByRole('button',{name:'Continuar con mi pedido',exact:true}).click();await expect(frame.getByRole('heading',{name:'Revisa tu pedido'})).toBeVisible();await frame.getByRole('button',{name:'Continuar al pago de prueba'}).click();await expect(page.getByRole('dialog', {name:'Formulario de pago de pagosYa'})).toBeVisible();await expect(page.getByRole('dialog').locator('iframe')).toHaveAttribute('src', /source_payment_preview=1/);await page.getByRole('dialog').getByRole('button',{name:'Volver al pedido'}).click();await expect(frame.getByRole('heading',{name:'Revisa tu pedido'})).toBeVisible();
  await page.getByRole('button',{name:'Código',exact:true}).click();const editor=page.getByRole('textbox',{name:'Código del archivo'});await editor.fill((await editor.inputValue()).replace('Un buen día','Una buena mañana'));
  await expect(page.getByRole('button',{name:'Descargar ZIP'})).toBeDisabled();await page.getByRole('button',{name:'Guardar cambios'}).click();expect(patch.revision).toBe(1);expect(patch.path).toBe('index.html');expect(patch).not.toHaveProperty('files');
  await expect(page.getByRole('button',{name:'Enviar a YAPI'})).toBeEnabled();
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar ZIP'}).click();expect((await download).suggestedFilename()).toBe('storefront-r2.zip');
  await page.getByRole('textbox',{name:'Indicación para YAPI'}).fill('Haz la portada más editorial');await page.getByRole('button',{name:'Enviar a YAPI'}).click();expect(generated.revision).toBe(2);
  await page.getByRole('button',{name:'Vista previa',exact:true}).click();await expect(frame.getByRole('heading',{name:'Un buen día empieza aquí.'})).toBeVisible();await page.screenshot({path:'.test-artifacts/source-studio-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.locator('iframe[title="Vista previa del sitio"]').scrollIntoViewIfNeeded();await expect(frame.getByRole('heading',{name:'Un buen día empieza aquí.'})).toBeVisible();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.test-artifacts/source-studio-mobile.png',fullPage:false});await page.locator('iframe[title="Vista previa del sitio"]').scrollIntoViewIfNeeded();await expect(frame.getByRole('heading',{name:'Un buen día empieza aquí.'})).toBeVisible();await page.screenshot({path:'.test-artifacts/source-studio-mobile-preview.png',fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('preview blocks access to parent session and network requests',async({page})=>{
  await page.goto('/?demo=1');
  const result=await page.evaluate(async()=>{
    const {sourcePreviewDocument}=await import('/src/source-preview.ts' as string);
    sessionStorage.setItem('preview-test-secret','private');
    const html='<div id="result">pending</div><script>let parentBlocked=false;try{parent.sessionStorage.getItem("preview-test-secret")}catch{parentBlocked=true}fetch("https://example.invalid/exfil").then(()=>document.getElementById("result").textContent="network allowed").catch(()=>document.getElementById("result").textContent=parentBlocked?"isolated":"parent allowed")</script>';
    const frame=document.createElement('iframe');frame.sandbox.add('allow-scripts');frame.title='Isolation check';frame.srcdoc=sourcePreviewDocument({schemaVersion:1,brief:{},files:[{path:'index.html',content:html}]});document.body.append(frame);return true;
  });expect(result).toBe(true);await expect(page.frameLocator('iframe[title="Isolation check"]').locator('#result')).toHaveText('isolated');
});

test('portable commerce refreshes stock and sends only product ids and quantities to checkout',async({page})=>{
  await page.goto('/?demo=1');
  const configText=files.find(f=>f.path==='config.js')!.content.replace('"demo": true','"demo": false');
  const commerce=files.find(f=>f.path==='commerce.js')!.content;
  let checkout:any;let loaded=false;
  await page.route('**/v1/stores/public/cafe-aroma/store',async route=>{const config=JSON.parse(configText.slice(configText.indexOf('=')+1).trim().replace(/;$/,''));config.data.items[0].stock=1;loaded=true;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(config.data)});});
  await page.route('**/v1/stores/public/cafe-aroma/cart-checkout',async route=>{checkout=route.request().postDataJSON();await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({message:'Prueba sin crear cobros'})});});
  await page.setContent('<div data-pagosya-categories></div><div data-pagosya-catalog></div><div data-pagosya-cart></div><p data-pagosya-status></p>');await page.addScriptTag({content:configText});await page.addScriptTag({content:commerce});
  await expect(page.getByRole('button',{name:'Añadir Café americano',exact:true})).toBeVisible();await expect.poll(()=>loaded).toBe(true);
  await page.getByRole('button',{name:'Añadir Café americano',exact:true}).click();await expect(page.getByRole('button',{name:'Añadir Café americano',exact:true})).toBeDisabled();
  await page.locator('.checkout-button').click();await page.locator('[data-pagosya-checkout] [data-pay]').click();await expect.poll(()=>checkout).toBeTruthy();expect(checkout.items).toEqual([{paymentLinkId:'CAF-001',quantity:1}]);expect(checkout.items[0]).not.toHaveProperty('amount');
});

test('failed chat generation preserves the request and permits retry', async ({ page }) => {
  let calls = 0, revision = 0;
  const messages: any[] = [];
  const saved = { revision: 1, label: 'Carta propia', snapshot };
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: any;
    if (pathname.endsWith('/estimate')) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ model: 'gpt-5.6-terra', reason: 'Diseño y composición del sitio.', maxCredits: 50, estimate: { minCredits: 4, maxCredits: 16 } }) }); return; }
    if (pathname.endsWith('/stores')) body = [{ id: 's1', name: 'Café Aroma', slug: 'cafe' }];
    else if (pathname.endsWith('/conversation')) body = { messages };
    else if (pathname.endsWith('/catalog')) body = structuredClone(snapshotCatalog);
    else if (pathname.endsWith('/source-project')) body = { revision, versions: revision ? [saved] : [], nextBefore: null };
    else if (pathname.endsWith('/versions/1')) body = saved;
    else if (pathname.endsWith('/messages')) {
      calls++;
      if (calls === 1) {
        messages.push({ id: 'failed', role: 'ASSISTANT', content: 'No pude completar esta revisión.', metadata: { failed: true } });
        await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ message: 'La generación no respondió. Vuelve a intentarlo.' }) }); return;
      }
      revision = 1;
      body = { revision: saved, userMessage: { id: 'u', role: 'USER', content: route.request().postDataJSON().instruction }, assistantMessage: { id: 'a', role: 'ASSISTANT', content: 'Tu revisión está lista.', metadata: { sourceRevision: 1 } } };
      messages.push(body.userMessage, body.assistantMessage);
    } else throw new Error(`Unexpected route ${pathname}`);
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/?source=1');
  const composer = page.getByRole('textbox', { name: 'Indicación para YAPI' });
  await composer.fill('Crea una carta cálida para mi cafetería');
  await page.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(page.getByRole('alert')).toContainText('Vuelve a intentarlo');
  await expect(composer).toHaveValue('Crea una carta cálida para mi cafetería');
  await page.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(page.locator('#source-revision')).toHaveCount(0);
  await expect(composer).toHaveValue('');
  expect(calls).toBe(2);
});

test('open in browser keeps the selected revision, reloads, and shows live catalog in an isolated tab', async ({ page, context }) => {
  const saved = { revision: 1, label: 'Carta propia', snapshot };
  const configFile = files.find(file => file.path === 'config.js')!.content;
  const catalog = JSON.parse(configFile.slice(configFile.indexOf('=') + 1).trim().replace(/;$/, '')).data;
  catalog.items[0].name = 'Café actualizado';
  const writes: string[] = [];
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'browser-session'));
  await context.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (route.request().method() !== 'GET' && !pathname.endsWith('/estimate')) writes.push(pathname);
    let body: any;
    if (pathname.endsWith('/estimate')) { await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ model: 'gpt-5.6-terra', reason: 'Diseño y composición del sitio.', maxCredits: 50, estimate: { minCredits: 4, maxCredits: 16 } }) }); return; }
    if (pathname.endsWith('/stores')) body = [{ id: 's1', name: 'Café Aroma', slug: 'cafe' }];
    else if (pathname.endsWith('/conversation')) body = { messages: [] };
    else if (pathname.endsWith('/source-project')) body = { revision: 1, versions: [saved], nextBefore: null };
    else if (pathname.endsWith('/versions/1')) body = saved;
    else if (pathname.endsWith('/catalog')) body = catalog;
    else throw new Error(`Unexpected request ${pathname}`);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/?source=1');
  const open = page.getByRole('button', { name: 'Ver en navegador', exact: true });
  await expect(open).toBeEnabled();
  const popupPromise = page.waitForEvent('popup');
  await open.click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(/browser=1&store=s1&revision=1&page=index.html/);
  await expect(popup.getByText('Vista previa · Sin cobros')).toBeVisible();
  const preview = popup.frameLocator('iframe');
  await expect(preview.getByRole('heading', { name: 'Un buen día empieza aquí.' })).toBeVisible();
  await expect(preview.getByRole('button', { name: 'Ver detalle de Café actualizado' })).toBeVisible();
  expect(await popup.evaluate(() => window.opener)).toBeNull();
  await expect(popup.locator('iframe')).toHaveAttribute('sandbox', 'allow-scripts');
  await popup.reload();
  await expect(preview.getByRole('button', { name: 'Ver detalle de Café actualizado' })).toBeVisible();
  await preview.getByRole('button', { name: 'Ver detalle de Café actualizado' }).click();
  await expect(preview.getByRole('dialog', { name: 'Café actualizado' })).toBeVisible();
  await popup.close();
  await page.getByRole('button', { name: 'Código', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'Código del archivo' });
  await editor.fill((await editor.inputValue()) + '\n<!-- unsaved -->');
  await expect(open).toBeDisabled();
  await page.getByRole('button', { name: 'Descartar edición', exact: true }).click();
  await expect(open).toBeEnabled();
  await page.setViewportSize({ width: 390, height: 844 });
  await open.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '.test-artifacts/source-open-browser-mobile.png' });
  expect(writes).toEqual([]);
});

test('free conversation is the default and model plus credit cap reach generation', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  let sent: any = null;
  const estimates: any[] = [];
  let usageReads = 0;
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: any;
    if (pathname.endsWith('/stores')) body = [{ id: 's1', name: 'Café Aroma', slug: 'cafe' }];
    else if (pathname.endsWith('/conversation')) body = { messages: [], setup: { step: 'conversation', prompt: 'Cuéntame qué quieres crear. Puedes compartir fotos o empezar con lo que tienes.', options: [] } };
    else if (pathname.endsWith('/catalog')) body = structuredClone(snapshotCatalog);
    else if (pathname.endsWith('/source-project')) body = { revision: 0, versions: [], nextBefore: null };
    else if (pathname.endsWith('/estimate')) { const input = route.request().postDataJSON(); estimates.push(input); body = { model: input.model, maxCredits: input.maxCredits, reason: 'Modelo elegido por ti.', estimate: { minCredits: 1, maxCredits: 3 } }; }
    else if (pathname.endsWith('/usage')) { usageReads++; body = { runs: [{ id: 'r1', status: 'FAILED', revision: null, credits: 0, maxCredits: 8, model: 'gpt-5.6-luna', durationMs: 2500 }] }; }
    else if (pathname.endsWith('/messages')) {
      sent = route.request().postDataJSON();
      await route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ message: 'No consumió créditos. Vuelve a intentarlo.' }) }); return;
    } else throw new Error(`Unexpected request ${pathname}`);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto('/?source=1');
  await expect(page.getByRole('combobox', { name: 'Modelo', exact: true })).toHaveValue('auto');
  await expect(page.locator('[data-setup-prompt]')).toContainText('Cuéntame qué quieres crear');
  await expect(page.getByRole('button', {name:'Prefiero responder paso a paso'})).toHaveCount(0);
  await expect(page.getByRole('button', {name:'Crear con lo que tenemos'})).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Modelo', exact: true }).selectOption('gpt-5.6-luna');
  await page.getByText('Créditos',{exact:true}).click();
  await page.getByLabel('Límite por solicitud').fill('8');
  await page.getByRole('textbox', { name: 'Indicación para YAPI' }).fill('Crea una cafetería cálida');
  await expect(page.locator('[data-source-estimate]')).toContainText('1–3 créditos estimados · límite 8');
  await page.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect(page.getByRole('alert')).toContainText('No consumió créditos');
  expect(sent).toMatchObject({ model: 'gpt-5.6-luna', maxCredits: 8 });
  expect(sent).not.toHaveProperty('setupAction');
  expect(estimates.at(-1)).toMatchObject({ model: 'gpt-5.6-luna', maxCredits: 8 });
  await expect(page.getByRole('combobox', { name: 'Modelo', exact: true })).toHaveValue('gpt-5.6-luna');
  await page.getByText('Créditos',{exact:true}).click();
  await page.getByRole('button', { name: 'Ver uso reciente' }).click();
  await expect(page.locator('.source-usage-list')).toContainText('0 créditos');
  await page.getByRole('button', { name: 'Enviar a YAPI' }).click();
  await expect.poll(() => usageReads).toBe(2);
  await expect(page.getByRole('alert')).toContainText('No consumió créditos');
  await page.screenshot({ path: '.test-artifacts/source-model-credits-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.test-artifacts/source-model-credits-mobile.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});


test('portable catalog keeps prices readable when authored CSS used absolute add-button offsets', async ({ page }) => {
  const sample = structuredClone(snapshot);
  sample.files.find(f => f.path === 'index.html')!.content = sample.files.find(f => f.path === 'index.html')!.content.replace('</body>', '<section><div data-pagosya-checkout></div></section></body>');
  sample.files.find(f => f.path === 'styles.css')!.content += '\n.menu-item { display:flex; flex-direction:column; padding:20px; }.menu-item__price{display:block;min-height:24px}.menu-add { position:absolute; bottom:80px; height:44px; width:100%; }';
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: any;
    if (pathname.endsWith('/stores')) body = [{ id: 's1', name: 'Café Aroma' }];
    else if (pathname.endsWith('/conversation')) body = { messages: [] };
    else if (pathname.endsWith('/catalog')) body = structuredClone(snapshotCatalog);
    else if (pathname.endsWith('/source-project')) body = { revision: 1, versions: [{ revision: 1, label: 'Catalog' }], nextBefore: null };
    else if (pathname.endsWith('/versions/1')) body = { revision: 1, label: 'Catalog', snapshot: sample };
    else if (pathname.endsWith('/estimate')) body = { model: 'gpt-5.6-terra', reason: 'Diseño', maxCredits: 50, estimate: { minCredits: 4, maxCredits: 16 } };
    else throw new Error(pathname);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test'));
  await page.goto('/?source=1');
  const card = page.frameLocator('iframe[title="Vista previa del sitio"]').locator('.menu-item').first();
  await expect(card).toBeVisible();
  for (const width of [1365, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const price = await card.locator('.menu-item__price').boundingBox();
    const add = await card.locator('.menu-add').boundingBox();
    expect(price).not.toBeNull(); expect(add).not.toBeNull();
    expect(add!.y).toBeGreaterThanOrEqual(price!.y + price!.height);
    await expect(card.locator('.menu-add')).toBeEnabled();
  }
  const frame = page.frameLocator('iframe[title="Vista previa del sitio"]');
  await expect(frame.locator('[data-pagosya-checkout]')).toBeHidden();
  await card.locator('.menu-add').click();
  await frame.getByRole('link', { name: /^Pedido/ }).click();
  await frame.getByRole('button', { name: 'Continuar con mi pedido' }).click();
  await expect(frame.getByRole('heading', { name: 'Revisa tu pedido' })).toBeVisible();
});


test('motion changes save a revision without AI generation and persist after reload', async ({page}) => {
  const versions = [{revision:1,label:'Original',snapshot:structuredClone(snapshot)}];
  let changes = 0;
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body:any;
    if(pathname.endsWith('/stores')) body=[{id:'s1',name:'Café Aroma',slug:'cafe'}];
    else if(pathname.endsWith('/conversation')) body={messages:[]};
    else if(pathname.endsWith('/estimate')) body={model:'gpt-5.6-terra',maxCredits:50,estimate:{minCredits:4,maxCredits:16}};
    else if(pathname.endsWith('/catalog'))body=structuredClone(snapshotCatalog);
    else if(pathname.endsWith('/source-project')) body={revision:versions[0].revision,versions,nextBefore:null};
    else if(/\/versions\/\d+$/.test(pathname)) body=versions.find(v=>v.revision===Number(pathname.split('/').at(-1)));
    else if(pathname.endsWith('/motion')) {
      const input=route.request().postDataJSON(); expect(input).toEqual({revision:1,motion:'off'}); changes++;
      const next=structuredClone(versions[0]); next.revision++; next.label='Sin movimiento';
      const config=next.snapshot.files.find(f=>f.path==='config.js')!;
      const data=JSON.parse(config.content.slice(config.content.indexOf('=')+1).trim().replace(/;$/,''));
      config.content='window.PAGOSYA_CONFIG = '+JSON.stringify({...data,motion:input.motion})+';';
      versions.unshift(next); body=next;
    } else throw new Error('Unexpected request '+pathname);
    await route.fulfill({json:body});
  });
  await page.goto('/?source=1');
  await expect(page.getByRole('combobox',{name:'Movimiento',exact:true})).toHaveValue('subtle');
  await page.getByRole('combobox',{name:'Movimiento',exact:true}).selectOption('off');
  await expect(page.locator('#source-revision')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('combobox',{name:'Movimiento',exact:true})).toHaveValue('off');
  await expect(page.getByRole('combobox',{name:'Movimiento',exact:true})).toBeEnabled();
  expect(changes).toBe(1);
});

test('first-site creation starts in chat and preserves the message after a failure', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  let sent: any;
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('/messages')) {
      sent = route.request().postDataJSON();
      await route.fulfill({status:502,json:{message:'Prueba de recuperación'}}); return;
    }
    const body = pathname.endsWith('/stores') ? [{id:'s1',name:'Café Aroma',slug:'cafe'}]
      : pathname.endsWith('/conversation') ? {messages:[],setup:{step:'conversation',prompt:'Cuéntame qué quieres crear.',options:[]}}
      : pathname.endsWith('/source-project') ? {revision:0,versions:[],nextBefore:null} : {};
    await route.fulfill({json:body});
  });
  await page.goto('/?source=1');
  await expect(page.getByRole('button',{name:'Crear con lo que tenemos'})).toHaveCount(0);
  await page.getByRole('textbox',{name:'Indicación para YAPI'}).fill('Quiero una web para mi café');
  await page.getByRole('button',{name:'Enviar a YAPI'}).click();
  await expect(page.getByRole('alert')).toContainText('Prueba de recuperación');
  expect(sent).toMatchObject({revision:0,instruction:'Quiero una web para mi café'});
  expect(sent).not.toHaveProperty('setupAction');
  const composer = page.getByRole('textbox',{name:'Indicación para YAPI'});
  await composer.fill('Usa tonos crema para mi cafetería');
  await page.getByRole('button',{name:'Enviar a YAPI'}).click();
  await expect.poll(() => sent.instruction).toBe('Usa tonos crema para mi cafetería');
  expect(sent).not.toHaveProperty('setupAction');
});
