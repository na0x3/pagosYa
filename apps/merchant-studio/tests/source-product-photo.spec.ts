import { expect, test, type Page } from '@playwright/test';

async function boot(page: Page, failMessage = false) {
  const sent: any[] = []; let uploads = 0; const messages: any[] = [];
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let json: any = {};
    if (path.endsWith('/stores')) json = [{id:'s1',name:'Mi producto',slug:'producto'}];
    else if (path.endsWith('/source-project')) json = {revision:0,versions:[],nextBefore:null};
    else if (path.endsWith('/conversation')) json = {messages,setup:{step:'conversation',prompt:'¿Qué vendes?',options:[]}};
    else if (path.endsWith('/estimate')) json = {model:'gpt-5.6-luna',maxCredits:50,estimate:{minCredits:4,maxCredits:12}};
    else if (path.endsWith('/uploads')) { uploads++; json={url:'/v1/uploads/abc.png'}; }
    else if (path.endsWith('/messages')) {
      const body = route.request().postDataJSON(); sent.push(body);
      const userMessage = {id:`u${sent.length}`,role:'USER',content:body.instruction,metadata:{assetUrls:body.assetUrls}};
      messages.push(userMessage);
      if (failMessage && sent.length === 1) return route.fulfill({status:503,json:{message:'No se pudo generar. Reintenta.'}});
      const assistantMessage={id:`a${sent.length}`,role:'ASSISTANT',content:'Foto recibida. Precio pendiente.'}; messages.push(assistantMessage);
      json={userMessage,assistantMessage,setup:null};
    }
    await route.fulfill({json});
  });
  await page.goto('/?source=1');
  await expect(page.getByRole('button',{name:'Crear tienda desde una foto',exact:true})).toBeVisible();
  return {sent,uploads:()=>uploads};
}
async function selectPhoto(page: Page) {
  const pixels=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;canvas.getContext('2d')!.fillRect(0,0,64,64);return canvas.toDataURL().split(',')[1];});
  const chooser=page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'Crear tienda desde una foto',exact:true}).click();
  await (await chooser).setFiles({name:'producto.png',mimeType:'image/png',buffer:Buffer.from(pixels,'base64')});
  await expect(page.getByRole('button',{name:'Crear tienda desde esta foto'})).toBeVisible();
}

test('tools live in grouped navigation; photo creation sends one image without typing and can retry',async({page})=>{
  const {sent,uploads}=await boot(page,true);
  await expect(page.locator('.source-compose-area').getByText('Identidad de mi marca')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Identidad de mi marca'})).toBeHidden();
  await page.locator('.source-store-menu > summary').click();
  await expect(page.getByRole('navigation',{name:'Herramientas de mi tienda'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Archivos digitales',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Tarjetas de regalo y saldos',exact:true})).toBeVisible();
  await page.screenshot({path:'.test-artifacts/store-tools-desktop.png'});
  await page.getByRole('button',{name:'Archivos digitales',exact:true}).focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.source-store-menu')).not.toHaveAttribute('open');
  await expect(page.locator('.source-store-menu > summary')).toBeFocused();
  await selectPhoto(page);
  await page.screenshot({path:'.test-artifacts/product-photo-desktop.png'});
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Crear tienda desde esta foto'}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'.test-artifacts/product-photo-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth+1)).toBe(true);
  await page.getByRole('button',{name:'Crear tienda desde esta foto'}).click();
  await expect(page.getByRole('button',{name:'Reintentar mensaje'})).toBeVisible();
  expect(sent[0]).toMatchObject({setupAction:'product-photo',assetUrls:['/v1/uploads/abc.png'],revision:0});
  expect(sent[0].instruction).toContain('No publiques');
  await page.getByRole('button',{name:'Reintentar mensaje'}).click();
  await expect(page.getByText('Foto recibida. Precio pendiente.',{exact:true})).toBeVisible();
  expect(sent[1].setupAction).toBe('product-photo'); expect(sent[1].assetUrls).toEqual(sent[0].assetUrls);expect(uploads()).toBe(1);
});

test('rejects videos in the photo workflow and preserves a typed draft',async({page})=>{
  const {sent}=await boot(page);
  await page.getByRole('textbox',{name:'Indicación para YAPI'}).fill('Mi tienda de café');
  await page.locator('[data-product-photo-input]').setInputFiles({name:'video.mp4',mimeType:'video/mp4',buffer:Buffer.from('not a photo')});
  await expect(page.getByRole('alert')).toContainText('Elige una foto de producto');
  await expect(page.getByRole('textbox',{name:'Indicación para YAPI'})).toHaveValue('Mi tienda de café');
  expect(sent).toHaveLength(0);
  await selectPhoto(page);
  await page.getByRole('button',{name:'Usar como adjunto normal'}).click();
  await expect(page.getByRole('button',{name:'Crear tienda desde esta foto'})).toHaveCount(0);
  await expect(page.getByRole('textbox',{name:'Indicación para YAPI'})).toHaveValue('Mi tienda de café');
  await page.getByRole('button',{name:'Enviar a YAPI'}).click();
  await expect.poll(()=>sent.length).toBe(1);
  expect(sent[0].setupAction).toBeUndefined();
});
