import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const slotScript = readFileSync(resolve('../../packages/storefront-preview/src/source-account-slot.js'),'utf8');

for (const width of [1280,390]) test(`trusted account preview and navigation at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const accountRequests:string[]=[];
  page.on('request',request=>{if (/\/customers(?:\/|\?)/.test(request.url())) accountRequests.push(request.url());});
  await page.goto('/');
  await page.evaluate(async({slotScript})=>{
    const {mountSourceAccountPreview}=await import('/src/source-account-preview.ts');
    document.body.innerHTML='';document.body.style.margin='0';
    const frame=document.createElement('iframe');frame.setAttribute('sandbox','allow-scripts');frame.style.cssText='display:block;width:100%;height:900px;border:0';document.body.append(frame);
    const show=(view:string)=>{frame.srcdoc=`<!doctype html><style>body{margin:0}main{padding:24px 12px}.ui-container{max-width:460px;margin:auto}</style><main data-account-gate="${view}"><div class="ui-container"><h1>Fallback</h1><a href="#">Ingresar</a></div></main><script>${slotScript}<\/script>`;};
    mountSourceAccountPreview(frame,{files:[{path:'config.js',content:'window.PAGOSYA_CONFIG = {"slug":"preview","data":{"storeName":"Tienda de prueba"}};'}, {path:'styles/globals.css',content:':root{--account-accent:#285a43;--account-radius:12px;}'}]} as any,page=>show(page.includes('registro')?'register':page.includes('olvide')?'forgot-password':'login'));
    show('login');
  },{slotScript});
  const account=page.frameLocator('[data-trusted-account] iframe');
  await expect(account.getByRole('heading',{name:'Ingresa a tu cuenta'})).toBeVisible();
  await expect(account.getByRole('note')).toContainText('Vista previa');
  await expect(account.getByRole('button',{name:'Ingresar',exact:true})).toHaveCSS('background-color','rgb(40, 90, 67)');
  await expect(account.getByRole('button',{name:'Ingresar',exact:true})).toHaveCSS('border-radius','12px');
  await account.getByLabel('Correo',{exact:true}).fill('preview@example.invalid');
  await account.getByLabel('Contraseña',{exact:true}).fill('example-password');
  await account.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();
  await expect(account.getByLabel('Contraseña',{exact:true})).toHaveAttribute('type','text');
  await account.getByRole('button',{name:'Ingresar',exact:true}).click();
  await expect(account.getByRole('status')).toContainText('no se crean cuentas');
  await account.getByRole('link',{name:'Crear una cuenta',exact:true}).click();
  await expect(account.getByRole('heading',{name:'Crea tu cuenta'})).toBeVisible();
  await account.getByRole('link',{name:'Ya tengo una cuenta'}).click();
  await expect(account.getByRole('heading',{name:'Ingresa a tu cuenta'})).toBeVisible();
  await account.getByRole('link',{name:'¿Olvidaste tu contraseña?'}).click();
  await expect(account.getByRole('heading',{name:'Recupera tu contraseña'})).toBeVisible();
  expect(accountRequests).toEqual([]);
  expect(await page.locator('[data-trusted-account]').evaluate(el=>el.parentElement===document.body)).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
