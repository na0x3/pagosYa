import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { kitPath } from '@pagosya/storefront-kit';
const root = path.resolve(import.meta.dirname,'../../../examples/independent-cafe');
const files: Array<{path:string;content:string;encoding:'utf8'|'base64'}> = [];
function scan(dir:string,prefix='') { for(const e of readdirSync(dir,{withFileTypes:true})) { if(e.name==='dist'||e.name.startsWith('.'))continue;const p=path.join(dir,e.name),name=prefix+e.name;if(e.isDirectory())scan(p,name+'/');else files.push({path:name,content:readFileSync(p).toString(/\.(webp|ttf)$/.test(name)?'base64':'utf8'),encoding:/\.(webp|ttf)$/.test(name)?'base64':'utf8'}); } }
scan(root);
files.find(file => file.path === 'commerce.js')!.content = readFileSync(kitPath('commerce.js'), 'utf8');
const snapshotCatalog = JSON.parse(files.find(f => f.path === 'config.js')!.content.split('=').slice(1).join('=').trim().replace(/;$/, '')).data;
const snapshot={schemaVersion:1,brief:{businessType:'Cafetería',audience:'Vecinos',primaryAction:'Hacer un pedido',visualDirection:'Menú editorial'},files};

test('the merchant keeps typing while the hidden check frames run', async ({ page }) => {
  const version = { revision: 1, label: 'Diseño', snapshot };
  await page.route('**/api/v1/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    let body: any = {};
    if (pathname.endsWith('/dashboard/login')) body = { token: 'test-session', user: { email: 'test@example.com' } };
    else if (pathname.endsWith('/stores')) body = [{ id: 's1', name: 'Café Aroma', slug: 'cafe-aroma' }];
    else if (pathname.endsWith('/conversation')) body = { messages: [] };
    else if (pathname.endsWith('/catalog')) body = structuredClone(snapshotCatalog);
    else if (pathname.endsWith('/estimate')) body = { model: 'gpt-5.6-terra', reason: 'Ajuste', maxCredits: 25, estimate: { minCredits: 4, maxCredits: 10 } };
    else if (pathname.endsWith('/versions/1')) body = version;
    else if (pathname.endsWith('/source-project')) body = { revision: 1, versions: [version], nextBefore: null };
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  await page.getByLabel('Correo', { exact: true }).fill('test@example.com');
  await page.getByLabel('Contraseña').fill('test-password');
  await page.getByRole('button', { name: 'Entrar al Studio', exact: true }).click();
  const composer = page.getByRole('textbox', { name: 'Indicación para YAPI' });
  await composer.click();
  // Type blind, like a merchant does: never re-focus the field by hand, or the
  // test would paper over exactly the bug it is guarding.
  await page.keyboard.type('Quiero cambiar la portada');
  const active = () => page.evaluate(() => { const el = document.activeElement as HTMLElement | null; if (!el) return 'none'; return el.id || `${el.tagName}[title=${el.getAttribute('title') || ''}][inert=${(el as any).inert}]`; });
  expect(await active()).toBe('agent-command');

  // The embedded dashboard posts this on every workspace sync, which starts a
  // full check run: sixteen hidden frames loading the merchant's own storefront.
  await page.evaluate(() => window.dispatchEvent(new MessageEvent('message', { data: { type: 'pagosya:catalog-refresh' }, origin: location.origin, source: window.parent })));
  await page.waitForTimeout(400);
  await page.keyboard.type(' con fotos grandes');
  await page.waitForTimeout(1200);
  await page.keyboard.type(' y menos texto');
  expect(await active()).toBe('agent-command');
  expect(await composer.inputValue()).toBe('Quiero cambiar la portada con fotos grandes y menos texto');
});
