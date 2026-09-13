import { expect, test, type Page } from '@playwright/test';

const photoUrl = '/v1/uploads/abc.png';
const text = 'Usa esta foto para la portada de mi cafetería';
const setup = {step:'conversation',prompt:'Cuéntame qué quieres crear.',options:[]};
async function attachPhoto(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width=32; canvas.height=32;
    canvas.getContext('2d')!.fillRect(0,0,32,32); return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('[data-image-input]').setInputFiles({name:'cafe.png',mimeType:'image/png',buffer:Buffer.from(base64,'base64')});
  await expect(page.locator('.source-compose-area .batch-card')).toContainText('Listas para enviar');
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => {resolve=done;});
  return {promise,resolve};
}

test('DeepSeek selection persists across reload and is sent with the request budget', async ({page}) => {
  const sent: any[] = [];
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let body: any = {};
    if (path.endsWith('/stores')) body = [{id:'s1',name:'Café Aroma',slug:'cafe'}];
    else if (path.endsWith('/source-project')) body = {revision:0,versions:[],nextBefore:null};
    else if (path.endsWith('/conversation')) body = {messages:[],setup};
    else if (path.endsWith('/messages')) {
      sent.push(route.request().postDataJSON());
      body = {userMessage:{id:'u1',role:'USER',content:'Crea mi café'},assistantMessage:{id:'a1',role:'ASSISTANT',content:'¿Qué estilo prefieres?'},setup};
    }
    await route.fulfill({json:body});
  });
  await page.goto('/?source=1');
  await page.getByRole('combobox', {name:'Modelo',exact:true}).selectOption('deepseek-v4-flash');
  await page.reload();
  await expect(page.getByRole('combobox', {name:'Modelo',exact:true})).toHaveValue('deepseek-v4-flash');
  await page.getByRole('textbox', {name:'Indicación para YAPI'}).fill('Crea mi café');
  await page.getByRole('button', {name:'Enviar a YAPI'}).click();
  await expect.poll(() => sent.length).toBe(1);
  expect(sent[0]).toMatchObject({model:'deepseek-v4-flash',maxCredits:50});
});

test('sending text and a photo clears the composer during upload and AI work, including rerenders', async ({page}) => {
  const upload = deferred(), response = deferred();
  let messageRequests = 0;
  const messages: any[] = [];
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session','test-session'));
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: any = {};
    if (pathname.endsWith('/stores')) body=[{id:'s1',name:'Café Aroma',slug:'cafe'}];
    else if (pathname.endsWith('/source-project')) body={revision:0,versions:[],nextBefore:null};
    else if (pathname.endsWith('/conversation')) body={messages,setup};
    else if (pathname.endsWith('/uploads')) {await upload.promise; body={url:photoUrl};}
    else if (pathname.endsWith('/messages')) {
      messageRequests++;
      const sent=route.request().postDataJSON();
      expect(sent).toMatchObject({instruction:text,assetUrls:[photoUrl]});
      await response.promise;
      const userMessage={id:'u1',role:'USER',content:sent.instruction,metadata:{assetUrls:sent.assetUrls}};
      const assistantMessage={id:'a1',role:'ASSISTANT',content:'La usamos en la portada. ¿Prefieres tonos cálidos?',metadata:{}};
      messages.push(userMessage,assistantMessage);body={userMessage,assistantMessage,setup};
    }
    await route.fulfill({json:body});
  });
  try {
    await page.goto('/?source=1');
    await attachPhoto(page);
    const composer=page.getByRole('textbox',{name:'Indicación para YAPI'});
    await composer.fill(text);
    await page.getByRole('button',{name:'Enviar a YAPI'}).click();
    await expect(composer).toHaveValue('');
    await expect(page.locator('.source-compose-area .batch-card')).toHaveCount(0);
    await expect(page.locator('.source-pending-request')).toHaveText(text);
    await expect(page.getByText('1 imagen adjunta',{exact:true})).toBeVisible();
    expect(messageRequests).toBe(0);
    upload.resolve();
    await expect.poll(() => messageRequests).toBe(1);
    await page.locator('#source-width').click();
    await expect(composer).toHaveValue('');
    await expect(page.locator('.source-pending-request')).toHaveText(text);
    await page.screenshot({path:'.test-artifacts/source-composer-pending-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'.test-artifacts/source-composer-pending-mobile.png',fullPage:true});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    response.resolve();
    await expect(page.locator('.remote-agent-note')).toContainText('La usamos en la portada');
    await expect(page.locator('.message--remote-user')).toHaveCount(1);
    await expect(page.locator('.source-pending-request')).toHaveCount(0);
    await expect(composer).toHaveValue('');
    await expect(composer).toBeEnabled();
    await composer.fill('Ahora usa verde');
    await page.locator('#source-width').click();
    await expect(composer).toHaveValue('Ahora usa verde');
  } finally {upload.resolve();response.resolve();}
});

for (const failure of ['upload','unsaved','saved'] as const) {
  test(`a ${failure} failure restores only unsent drafts and retries saved photos without uploading again`, async ({page}) => {
    let uploads=0, sends=0;
    const messages: any[]=[];
    await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session','test-session'));
    await page.route('**/api/v1/**', async route => {
      const pathname=new URL(route.request().url()).pathname;
      let body: any={};
      if(pathname.endsWith('/stores')) body=[{id:'s1',name:'Café Aroma',slug:'cafe'}];
      else if(pathname.endsWith('/source-project')) body={revision:0,versions:[],nextBefore:null};
      else if(pathname.endsWith('/conversation')) body={messages,setup};
      else if(pathname.endsWith('/uploads')) {
        uploads++;
        if(failure==='upload' && uploads===1) {await route.fulfill({status:502,json:{message:'No se pudo subir la imagen'}});return;}
        body={url:photoUrl};
      } else if(pathname.endsWith('/messages')) {
        sends++;
        const sent=route.request().postDataJSON();
        expect(sent).toMatchObject({instruction:text,assetUrls:[photoUrl]});
        const userMessage={id:`u${sends}`,role:'USER',content:sent.instruction,metadata:{assetUrls:sent.assetUrls}};
        if(failure!=='upload' && sends===1) {
          if(failure==='saved') messages.push(userMessage,{id:'a1',role:'ASSISTANT',content:'No pude completar tu pedido.',metadata:{failed:true}});
          await route.fulfill({status:502,json:{message:'Error de prueba'}});return;
        }
        const assistantMessage={id:`a${sends}`,role:'ASSISTANT',content:'Recibí tu foto.',metadata:{}};
        messages.push(userMessage,assistantMessage);body={userMessage,assistantMessage,setup};
      }
      await route.fulfill({json:body});
    });
    await page.goto('/?source=1');await attachPhoto(page);
    const composer=page.getByRole('textbox',{name:'Indicación para YAPI'});
    await composer.fill(text);await page.getByRole('button',{name:'Enviar a YAPI'}).click();
    await expect(page.getByRole('alert')).toBeVisible();
    if(failure==='saved') {
      await expect(page.locator('.message--remote-user')).toContainText(text);
      await expect(composer).toHaveValue('');
      await expect(page.locator('.source-compose-area .batch-card')).toHaveCount(0);
      const retry=page.getByRole('button',{name:'Reintentar mensaje'});
      await composer.fill('Un nuevo pedido');await expect(retry).toBeDisabled();
      await composer.fill('');await expect(retry).toBeEnabled();await retry.click();
    } else {
      await expect(composer).toHaveValue(text);
      await expect(page.locator('.source-compose-area .batch-card')).toContainText('Listas para enviar');
      await expect(page.getByRole('button',{name:'Reintentar mensaje'})).toHaveCount(0);
      await page.getByRole('button',{name:'Enviar a YAPI'}).click();
    }
    await expect(page.locator('.remote-agent-note').last()).toContainText('Recibí tu foto.');
    await expect(composer).toHaveValue('');
    await expect(page.locator('.source-compose-area .batch-card')).toHaveCount(0);
    expect(uploads).toBe(failure==='upload'?2:1);
    expect(sends).toBe(failure==='upload'?1:2);
  });
}
