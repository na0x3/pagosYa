import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const fixture = fileURLToPath(new URL('./fixtures/sample.mp4', import.meta.url));
const bytes = readFileSync(fixture);
const uploadUrl = '/v1/uploads/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.mp4';
const videoPath = 'assets/video-sample.mp4';
const photo = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
for (const mobile of [false, true]) test(`MP4 upload, playback and saved resources (${mobile ? 'mobile' : 'desktop'})`, async ({ page }) => {
  await page.setViewportSize({ width: mobile ? 390 : 1280, height: 844 });
  let revision = 1, uploads = 0;
  const messages: any[] = [];
  const version = () => ({ revision, label: 'Video de portada', snapshot: { schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Video real' }, files: [
    { path: 'index.html', content: `<html><head><title>Café</title></head><body><h1>Café</h1>${revision === 2 ? `<video src="${videoPath}" poster="assets/poster.png" controls playsinline preload="auto" style="width:100%;max-width:320px"></video>` : ''}<script src="config.js"></script><script src="commerce.js"></script></body></html>` },
    { path: 'config.js', content: 'window.PAGOSYA_CONFIG = {"data":{"items":[]}};' }, { path: 'commerce.js', content: '' },
    ...(revision === 2 ? [{ path: videoPath, content: bytes.toString('base64'), encoding: 'base64' }, { path: 'assets/poster.png', content: photo, encoding: 'base64' }] : []),
  ] } });
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname; let body: any = {};
    if (path.endsWith('/stores')) body = [{ id: 's1', name: 'Café', slug: 'cafe' }];
    else if (path.endsWith('/conversation')) body = { messages };
    else if (path.endsWith('/catalog')) body = { items: [] };
    else if (path.endsWith('/estimate')) body = { estimate: { minCredits: 1, maxCredits: 4 } };
    else if (path.endsWith('/uploads')) {
      uploads++;
      expect(route.request().headers()['content-type']).toContain('multipart/form-data');
      expect(route.request().postDataBuffer()!.toString()).toContain('Content-Type: video/mp4');
      body = { url: uploadUrl };
    } else if (path.endsWith('/messages')) {
      expect(route.request().postDataJSON()).toMatchObject({ assetUrls: [uploadUrl], instruction: 'Pon este video en la portada' });
      revision = 2;
      const userMessage = { id: 'u1', role: 'USER', content: 'Pon este video en la portada', metadata: { assetUrls: [uploadUrl] } };
      const assistantMessage = { id: 'a1', role: 'ASSISTANT', content: 'Video agregado.', metadata: { sourceRevision: 2 } };
      messages.push(userMessage, assistantMessage);
      body = { userMessage, assistantMessage, revision: version() };
    } else if (/\/versions\/\d+$/.test(path)) body = version();
    else if (path.endsWith('/source-project')) body = { revision, versions: [version()], nextBefore: null };
    else if (path.endsWith('/assets')) body = { revision, assets: [{ path: videoPath, kind: 'video', role: 'background', description: 'Video de portada', references: ['index.html'], bytes: bytes.length }], icons: [], iconLibrary: 'Lucide' };
    await route.fulfill({ json: body });
  });
  await page.goto('/?source=1');
  const picker = page.locator('[data-image-input]');
  await expect(picker).toHaveAttribute('accept', /video\/mp4/);
  await picker.setInputFiles(fixture);
  const attachment = page.locator('.batch-thumb video');
  await expect(attachment).toBeVisible();
  await expect(attachment).toHaveJSProperty('loop', true);
  await expect(attachment).toHaveJSProperty('paused', false);
  await expect(attachment).toHaveJSProperty('muted', true);
  await expect.poll(() => attachment.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  await page.getByRole('textbox', { name: 'Indicación para YAPI' }).fill('Pon este video en la portada');
  await page.getByRole('button', { name: 'Enviar a YAPI' }).click();
  const video = page.frameLocator('iframe[title="Vista previa del sitio"]').locator('video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('src', /^data:video\/mp4;base64,/);
  await expect(video).toHaveAttribute('poster', /^data:image\/png;base64,/);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  await expect(video).toHaveJSProperty('loop', true);
  await expect(video).toHaveJSProperty('autoplay', true);
  await expect(video).toHaveJSProperty('muted', true);
  await expect(video).toHaveJSProperty('paused', false);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(.1);
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = v.duration - .2; });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(1);
  await expect(video).toHaveJSProperty('paused', false);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(.1);
  await video.evaluate((v: HTMLVideoElement) => v.pause());
  expect(uploads).toBe(1);
  await page.getByRole('button', { name: 'Recursos visuales', exact: true }).click();
  const resources = page.getByRole('region', { name: 'Recursos visuales', exact: true });
  await expect(resources.locator('video')).toBeVisible();
  await expect(resources.locator('video')).toHaveJSProperty('loop', true);
  await expect(resources.locator('video')).toHaveJSProperty('paused', false);
  await expect(resources.locator('video')).toHaveJSProperty('muted', true);
  await expect(resources.getByRole('combobox', { name: 'Uso', exact: true })).toHaveValue('background');
  await resources.getByRole('button', { name: 'Usar en indicación' }).click();
  await expect(page.getByRole('textbox', { name: 'Indicación para YAPI' })).toHaveValue(/assets\/video-sample.mp4/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/private/tmp/yapi-mp4-${mobile ? 'mobile' : 'desktop'}.png`, fullPage: true });
});

test('compiled component videos play in the hosted preview sandbox', async ({ page }) => {
  await page.goto('/?source=1');
  await page.evaluate(async ({ content, path }) => {
    // Use the same asset substitution route as compiled React, with deterministic test code.
    const { sourcePreviewDocument } = await import('/src/source-preview.ts');
    const snapshot = { schemaVersion: 1, brief: { businessType: 'Café', audience: 'Vecinos', primaryAction: 'Pedir', visualDirection: 'Video' }, files: [
      { path: 'index.html', content: '<html><body><script src="_compiled/home.js"></script></body></html>' },
      { path: '_compiled/home.js', content: `const video=document.createElement("video");video.src=${JSON.stringify(path)};video.controls=true;video.playsInline=true;document.body.append(video);` },
      { path, content, encoding: 'base64' },
    ] };
    const frame = document.createElement('iframe'); frame.title = 'Compiled MP4'; frame.setAttribute('sandbox', 'allow-scripts');
    frame.srcdoc = sourcePreviewDocument(snapshot, 'index.html', { hosted: true }); document.body.append(frame);
  }, { content: bytes.toString('base64'), path: videoPath });
  const video = page.frameLocator('iframe[title="Compiled MP4"]').locator('video');
  await expect(video).toHaveAttribute('src', /^data:video\/mp4;base64,/);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThanOrEqual(2);
  await expect(video).toHaveJSProperty('loop', true);
  await expect(video).toHaveJSProperty('autoplay', true);
  await expect(video).toHaveJSProperty('muted', true);
  await expect(video).toHaveJSProperty('paused', false);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(.1);
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = v.duration - .2; });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeLessThan(1);
  await expect(video).toHaveJSProperty('paused', false);
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(.1);
});
