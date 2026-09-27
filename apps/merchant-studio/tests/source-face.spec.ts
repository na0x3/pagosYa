import { test, expect } from '@playwright/test';

const SHOTS = process.env.FACE_SHOTS;
const shot = async (page: import('@playwright/test').Page, name: string) => {
  if (!SHOTS) return;
  await page.waitForTimeout(900);
  await page.locator('.source-inspiration').screenshot({ path: `${SHOTS}/${name}.png` });
};

async function idleCanvas(page: import('@playwright/test').Page, width = 1280) {
  await page.addInitScript(() => sessionStorage.setItem('pagosya_merchant_session', 'test-session'));
  await page.route('**/api/v1/**', async route => {
    const p = new URL(route.request().url()).pathname;
    const body = p.endsWith('/stores') ? [{ id: 's1', name: 'Café Aroma', slug: 'cafe' }]
      : p.endsWith('/conversation') ? { messages: [], setup: { step: 'conversation', prompt: 'Cuéntame qué quieres crear.', options: [] } }
      : p.endsWith('/source-project') ? { revision: 0, versions: [], nextBefore: null } : {};
    await route.fulfill({ json: body });
  });
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/?source=1');
  await expect(page.locator('[data-face]')).toBeVisible();
}

test('the face runs through its moods and never covers the invitation', async ({ page }) => {
  // One full loop is twelve 2.6 s beats; the turn is the last of them.
  test.setTimeout(60_000);
  await idleCanvas(page);
  const face = page.locator('[data-face]');
  await expect(face).toHaveAttribute('data-mood', 'idle');
  await shot(page, 'face-idle');

  // The card stack it replaces overlapped the headline and bled off the canvas.
  const copy = (await page.locator('.source-inspiration .source-empty-copy').boundingBox())!;
  const orb = (await page.locator('.yapi-face__orb').boundingBox())!;
  const canvas = (await page.locator('.source-inspiration').boundingBox())!;
  expect(orb.x).toBeGreaterThanOrEqual(copy.x + copy.width - 1);
  expect(orb.x + orb.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  expect(orb.y).toBeGreaterThanOrEqual(canvas.y - 1);
  expect(orb.y + orb.height).toBeLessThanOrEqual(canvas.y + canvas.height + 1);

  await expect(face).toHaveAttribute('data-mood', 'glance', { timeout: 4000 });
  await shot(page, 'face-glance');
  await expect(face).toHaveAttribute('data-mood', 'smirk', { timeout: 7000 });
  await shot(page, 'face-smirk');
  await expect(face).toHaveAttribute('data-mood', 'breathe', { timeout: 4000 });
  // It is a loop, not a one-shot sequence: the full turn comes last.
  // From the breath to the turn is seven beats (idle, spark, idle, glance, idle, smirk, spin).
  await expect(face).toHaveAttribute('data-mood', 'spin', { timeout: 22_000 });
  await shot(page, 'face-spin');
  await expect(face).toHaveAttribute('data-mood', 'idle', { timeout: 4000 });
});

test('the face is a light yellow, and carries no controls of its own', async ({ page }) => {
  await idleCanvas(page);
  await expect(page.locator('[data-face]')).toHaveAttribute('data-color', 'amarillo');
  // A pause button and a voice button both lived under it; ambient artwork
  // should not ask to be operated, and nothing here is a control.
  await expect(page.locator('.inspiration-stage button')).toHaveCount(0);
  // The invitation beside it offers the two ways to start: a template or a photo.
  await expect(page.getByRole('button', { name: 'Elegir una plantilla' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Crear tienda desde una foto/ })).toBeVisible();
  // It is decoration, so it is not announced either.
  await expect(page.locator('[data-face]')).toHaveAttribute('aria-hidden', 'true');
});

test('the invitation stays readable on a phone', async ({ page }) => {
  await idleCanvas(page, 390);
  const orb = (await page.locator('.yapi-face__orb').boundingBox())!;
  expect(orb.width).toBeLessThanOrEqual(390);
  await expect(page.getByRole('heading', { name: 'Tu negocio, tu sitio.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Crear tienda desde una foto/ })).toBeVisible();
  // The canvas is a short band here: the invitation must come before the face.
  const copy = (await page.locator('.source-inspiration .source-empty-copy').boundingBox())!;
  expect(copy.y).toBeLessThan(orb.y);
  if (SHOTS) { await page.waitForTimeout(900); await page.screenshot({ path: `${SHOTS}/face-mobile.png`, fullPage: true }); }
});

test('the build stage shows the same face, above the facts', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto('/?demo=1');
  await page.evaluate(async () => {
    const { renderBuildStage, mountBuildStage } = await import('/src/source-build-stage.ts' as string);
    document.body.innerHTML = '<section class="source-mode"><div class="source-empty-preview source-build-canvas">'
      + '<div data-build-stage-host></div></div></section>';
    const host = document.querySelector<HTMLElement>('[data-build-stage-host]')!;
    host.innerHTML = renderBuildStage({ status: 'Componiendo la portada…', progress: null });
    mountBuildStage(host).update({ status: 'Componiendo la portada…', progress: null });
  });
  await expect(page.locator('[data-face]')).toBeVisible();
  await expect(page.locator('.yapi-stage__status')).toHaveText('Componiendo la portada…');
  await expect(page.locator('.yapi-stage__meter')).toBeVisible();
  // The wireframe and the game are gone; the face and the facts remain.
  await expect(page.getByRole('button', { name: /Jugamos/ })).toHaveCount(0);
  await expect(page.locator('canvas')).toHaveCount(0);
  if (SHOTS) { await page.waitForTimeout(900); await page.locator('.source-build-canvas').screenshot({ path: `${SHOTS}/face-build-stage.png` }); }
});

test('reduced motion keeps the face and drops the moods', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await idleCanvas(page);
  await page.waitForTimeout(5600);
  await expect(page.locator('[data-face]')).toHaveAttribute('data-mood', 'idle');
});
